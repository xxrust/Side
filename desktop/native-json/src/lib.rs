//! SDK value encoding only; no image processing or detection decisions.
//! CPython supplies its float representation to preserve existing artifact bytes.
use pyo3::{prelude::*, types::{PyBool,PyBytes,PyDict,PyFloat,PyInt,PyList,PyString,PyTuple}, ffi};
use std::{ffi::CStr,collections::HashMap};
pyo3::create_exception!(_agentcv_json, ReportWireLimitError, pyo3::exceptions::PyValueError);

fn text(out:&mut Vec<u8>,value:&str)->PyResult<()> {
    serde_json::to_writer(out,value).map_err(|e|pyo3::exceptions::PyValueError::new_err(e.to_string()))
}
fn encode_value(value:&Bound<'_,PyAny>,fallback:&Bound<'_,PyAny>,out:&mut Vec<u8>,depth:usize,floats:&mut HashMap<u64,Vec<u8>>,strict:bool)->PyResult<()> {
    let py=value.py();
    if value.is_none(){out.extend_from_slice(b"null");}
    else if value.is_exact_instance_of::<PyString>(){text(out,value.downcast::<PyString>()?.to_str()?)?;}
    else if value.is_exact_instance_of::<PyBool>(){out.extend_from_slice(if value.is_truthy()?{b"true"}else{b"false"});}
    else if value.is_exact_instance_of::<PyInt>(){
        // Preserve unbounded Python integers; ordinary machine-sized values can
        // be rendered without allocating a temporary Python string object.
        if let Ok(number)=value.extract::<i64>(){serde_json::to_writer(&mut *out,&number).map_err(|e|pyo3::exceptions::PyValueError::new_err(e.to_string()))?;}
        else if let Ok(number)=value.extract::<u64>(){serde_json::to_writer(&mut *out,&number).map_err(|e|pyo3::exceptions::PyValueError::new_err(e.to_string()))?;}
        else{out.extend_from_slice(value.str()?.to_str()?.as_bytes());}
    }
    else if value.is_exact_instance_of::<PyFloat>(){
        let number=value.extract::<f64>()?;
        if !number.is_finite(){
            if strict{return Err(pyo3::exceptions::PyValueError::new_err("Out of range float values are not JSON compliant"));}
            out.extend_from_slice(b"null");
        }
        else if number==0.0||(number.abs()>=1e-4&&number.abs()<1e16) {
            // Ordinary fixed-decimal coordinates avoid CPython's temporary
            // allocation. Scientific notation retains its Python spelling.
            let mut buffer=zmij::Buffer::new();
            let bytes=buffer.format_finite(number).as_bytes();
            out.extend_from_slice(bytes);
        }
        else if let Some(bytes)=floats.get(&number.to_bits()){out.extend_from_slice(bytes);}
        else {
            // Stable CPython ABI; format 'r', ADD_DOT_0 matches json.dumps.
            unsafe {
                let pointer=ffi::PyOS_double_to_string(number,b'r' as _,0,2,std::ptr::null_mut());
                if pointer.is_null(){return Err(PyErr::fetch(py));}
                let bytes=CStr::from_ptr(pointer).to_bytes();out.extend_from_slice(bytes);
                // Large geometry artifacts exceed 4096 distinct coordinates,
                // then repeat them in candidate/evidence structures. Bound the
                // per-call cache while retaining those exact CPython spellings.
                if floats.len()<16384{floats.insert(number.to_bits(),bytes.to_vec());}
                ffi::PyMem_Free(pointer.cast());
            }
        }
    }
    else if depth<64&&value.is_exact_instance_of::<PyDict>() {
        let dict=value.downcast::<PyDict>()?;
        // Non-string keys require Python str() and collision/overwrite rules.
        if !dict.keys().iter().all(|key|key.is_exact_instance_of::<PyString>()){out.extend_from_slice(fallback.call1((value,))?.downcast::<PyString>()?.to_str()?.as_bytes());return Ok(());}
        out.push(b'{');
        for (index,(key,item)) in dict.iter().enumerate(){
            if index>0{out.push(b',');}
            text(out,key.downcast::<PyString>()?.to_str()?)?;out.push(b':');
            encode_value(&item,fallback,out,depth+1,floats,strict)?;
        }
        out.push(b'}');
    }
    else if depth<64&&value.is_exact_instance_of::<PyList>() {
        out.push(b'[');
        for (index,item) in value.downcast::<PyList>()?.iter().enumerate(){if index>0{out.push(b',');}encode_value(&item,fallback,out,depth+1,floats,strict)?;}
        out.push(b']');
    }
    else if depth<64&&value.is_exact_instance_of::<PyTuple>() {
        out.push(b'[');
        for (index,item) in value.downcast::<PyTuple>()?.iter().enumerate(){if index>0{out.push(b',');}encode_value(&item,fallback,out,depth+1,floats,strict)?;}
        out.push(b']');
    }
    else {out.extend_from_slice(fallback.call1((value,))?.downcast::<PyString>()?.to_str()?.as_bytes());}
    Ok(())
}

// Explicit per-run cache: only exact finite float bit patterns and CPython's
// immutable spelling, never caller containers or normalized user values.
#[pyclass]
#[derive(Default)]
struct EncodingCache { floats:HashMap<u64,Vec<u8>> }
#[pymethods]
impl EncodingCache {
    #[new]
    fn new()->Self {Self::default()}
}
#[pyfunction]
#[pyo3(signature=(value,fallback,cache=None))]
fn encode<'py>(py:Python<'py>,value:&Bound<'py,PyAny>,fallback:&Bound<'py,PyAny>,cache:Option<&Bound<'py,EncodingCache>>)->PyResult<Bound<'py,PyBytes>> {
    // No cache borrow survives a Python fallback. A reentrant encoder gets a
    // private map and cannot deadlock or alter this call's in-progress bytes.
    let mut floats=cache.map(|state|std::mem::take(&mut state.borrow_mut().floats)).unwrap_or_default();
    let mut bytes=Vec::with_capacity(4096);
    let encoded=encode_value(value,fallback,&mut bytes,0,&mut floats,false);
    if let Some(state)=cache {state.borrow_mut().floats=floats;}
    encoded?;bytes.push(b'\n');Ok(PyBytes::new(py,&bytes))
}

// Reports already contain normalized JSON values. Unlike SDK output, this
// boundary must reject nonfinite values and preserve standard json.dumps
// fallback behavior instead of applying arbitrary-object normalization.
#[pyfunction]
fn encode_report<'py>(py:Python<'py>,value:&Bound<'py,PyAny>,fallback:&Bound<'py,PyAny>)->PyResult<Bound<'py,PyBytes>> {
    let mut bytes=Vec::with_capacity(4096);encode_value(value,fallback,&mut bytes,0,&mut HashMap::new(),true)?;Ok(PyBytes::new(py,&bytes))
}

// Snapshot ordinary JSON containers directly into fresh Python containers.
// Exact builtin dispatch leaves NumPy/custom/subclass behavior to the original
// Python normalizer. Do not memoize: repeated mutable children need independent
// copies, just as in the SDK's original recursive traversal.
#[inline]
fn plain_scalar(item:&Bound<'_,PyAny>)->bool {
    item.is_none()||item.is_exact_instance_of::<PyString>()||item.is_exact_instance_of::<PyBool>()||item.is_exact_instance_of::<PyInt>()
        ||item.is_exact_instance_of::<PyFloat>()&&item.extract::<f64>().is_ok_and(f64::is_finite)
}
fn normalize_value<'py>(value:&Bound<'py,PyAny>,fallback:&Bound<'py,PyAny>,depth:usize,trace:bool)->PyResult<Bound<'py,PyAny>> {
    let py=value.py();
    if value.is_none()||value.is_exact_instance_of::<PyString>()||value.is_exact_instance_of::<PyBool>()||value.is_exact_instance_of::<PyInt>() {
        return Ok(value.clone());
    }
    if value.is_exact_instance_of::<PyFloat>() {
        return Ok(if value.extract::<f64>()?.is_finite(){value.clone()}else{py.None().into_bound(py)});
    }
    if depth<64&&value.is_exact_instance_of::<PyDict>() {
        let source=value.downcast::<PyDict>()?;
        // A scalar-only builtin dictionary needs an independent container, but
        // none of its values require normalization or can invoke user callbacks.
        // CPython copies its existing key table without repeated insert/resize.
        if source.iter().all(|(key,item)|key.is_exact_instance_of::<PyString>()&&plain_scalar(&item)) {
            return Ok(source.copy()?.into_any());
        }
        let output=PyDict::new(py);
        for (key,item) in value.downcast::<PyDict>()?.iter() {
            let key=if key.is_exact_instance_of::<PyString>(){key}else{key.str()?.into_any()};
            output.set_item(key,normalize_value(&item,fallback,depth+1,trace)?)?;
        }
        return Ok(output.into_any());
    }
    if depth<64&&(value.is_exact_instance_of::<PyList>()||value.is_exact_instance_of::<PyTuple>()) {
        let length=value.len()?;
        // Long trace sequences have a summary/hash contract. Preserve that
        // contract in Python, including its original JSON whitespace spelling.
        if !trace||length<=1024 {
            if let Ok(list)=value.downcast::<PyList>() {
                if list.iter().all(|item|plain_scalar(&item)){return Ok(list.get_slice(0,length).into_any());}
            } else if let Ok(tuple)=value.downcast::<PyTuple>() {
                if tuple.iter().all(|item|plain_scalar(&item)){return Ok(tuple.to_list().into_any());}
            }
            let output=PyList::empty(py);
            for item in value.try_iter()? {output.append(normalize_value(&item?,fallback,depth+1,trace)?)?;}
            return Ok(output.into_any());
        }
    }
    fallback.call1((value,))
}

#[pyfunction]
fn normalize<'py>(value:&Bound<'py,PyAny>,fallback:&Bound<'py,PyAny>)->PyResult<Bound<'py,PyAny>> {
    normalize_value(value,fallback,0,false)
}

#[pyfunction]
fn normalize_trace<'py>(value:&Bound<'py,PyAny>,fallback:&Bound<'py,PyAny>)->PyResult<Bound<'py,PyAny>> {
    normalize_value(value,fallback,0,true)
}

// Invalid or unusual values return false: the original Python validator still
// owns errors, subclass conversion and diagnostic paths. Only SDK contract work.
#[pyfunction]
fn layer_points_valid(points:&Bound<'_,PyAny>)->PyResult<bool>{
    if !points.is_exact_instance_of::<PyList>(){return Ok(false);}
    for point in points.downcast::<PyList>()?.iter(){
        if !point.is_exact_instance_of::<PyDict>(){return Ok(false);}
        let point=point.downcast::<PyDict>()?;
        for key in ["x","y"]{
            let Some(value)=point.get_item(key)? else{return Ok(false)};
            let valid=if value.is_exact_instance_of::<PyFloat>(){value.extract::<f64>()?.is_finite()}
                else if value.is_exact_instance_of::<PyInt>(){value.extract::<i64>().is_ok()||value.extract::<u64>().is_ok()}
                else{false};
            if !valid{return Ok(false);}
        }
    }Ok(true)
}

fn wire_length(out:&mut Vec<u8>,length:usize)->PyResult<()> {
    let length=u32::try_from(length).map_err(|_|ReportWireLimitError::new_err("Report value exceeds wire length bound"))?;
    out.extend_from_slice(&length.to_le_bytes());Ok(())
}
fn wire_charge(bound:&mut usize,amount:usize)->PyResult<()> {
    *bound=bound.saturating_add(amount);
    if *bound>32*1024*1024{return Err(ReportWireLimitError::new_err("Report wire conservative JSON bound exceeded"));}Ok(())
}
fn wire_text(out:&mut Vec<u8>,value:&str,bound:&mut usize)->PyResult<()> {
    wire_charge(bound,value.len().saturating_mul(6).saturating_add(2))?;
    wire_length(out,value.len())?;out.extend_from_slice(value.as_bytes());Ok(())
}
// Private transport only. Artifact JSON still uses its exact existing encoder.
// JSON fallback preserves standard semantics for unusual keys/subclasses, deep
// containers and Python integers outside the native integer range.
fn wire_value(value:&Bound<'_,PyAny>,fallback:&Bound<'_,PyAny>,out:&mut Vec<u8>,depth:usize,bound:&mut usize)->PyResult<()> {
    // A deliberately conservative bound avoids accepting reports larger than
    // the old 32MiB JSON contract or allocating a huge one-byte-null tree. If
    // this fast format does not fit, the caller uses the ordinary JSON path.
    wire_charge(bound,32)?;
    if value.is_none(){out.push(0);}
    else if value.is_exact_instance_of::<PyBool>(){out.push(if value.is_truthy()?{2}else{1});}
    else if value.is_exact_instance_of::<PyInt>(){
        if let Ok(number)=value.extract::<i64>(){out.push(3);out.extend_from_slice(&number.to_le_bytes());}
        else if let Ok(number)=value.extract::<u64>(){out.push(4);out.extend_from_slice(&number.to_le_bytes());}
        else{out.push(9);wire_text(out,fallback.call1((value,))?.downcast::<PyString>()?.to_str()?,bound)?;}
    }
    else if value.is_exact_instance_of::<PyFloat>(){
        let number=value.extract::<f64>()?;
        if !number.is_finite(){return Err(pyo3::exceptions::PyValueError::new_err("Out of range float values are not JSON compliant"));}
        out.push(5);out.extend_from_slice(&number.to_le_bytes());
    }
    else if value.is_exact_instance_of::<PyString>(){out.push(6);wire_text(out,value.downcast::<PyString>()?.to_str()?,bound)?;}
    else if depth<64&&value.is_exact_instance_of::<PyDict>()&&value.downcast::<PyDict>()?.keys().iter().all(|key|key.is_exact_instance_of::<PyString>()){
        let dict=value.downcast::<PyDict>()?;out.push(8);wire_length(out,dict.len())?;
        for (key,item) in dict.iter(){wire_text(out,key.downcast::<PyString>()?.to_str()?,bound)?;wire_value(&item,fallback,out,depth+1,bound)?;}
    }
    else if depth<64&&(value.is_exact_instance_of::<PyList>()||value.is_exact_instance_of::<PyTuple>()){
        out.push(7);wire_length(out,value.len()?)?;
        // Exact builtin sequences need no temporary Python iterator object.
        // Subclasses still take the existing fallback path below.
        if let Ok(items)=value.downcast::<PyList>() {
            // Match Python's live list iterator if a fallback mutates it.
            let mut index=0;
            while index<items.len(){let item=items.get_item(index)?;index+=1;wire_value(&item,fallback,out,depth+1,bound)?;}
        } else {
            for item in value.downcast::<PyTuple>()?.iter(){wire_value(&item,fallback,out,depth+1,bound)?;}
        }
    }
    else{out.push(9);wire_text(out,fallback.call1((value,))?.downcast::<PyString>()?.to_str()?,bound)?;}
    if out.len()>32*1024*1024{return Err(ReportWireLimitError::new_err("Resident report frame exceeds limit"));}
    Ok(())
}
#[pyfunction]
fn encode_report_wire<'py>(py:Python<'py>,value:&Bound<'py,PyAny>,fallback:&Bound<'py,PyAny>)->PyResult<Bound<'py,PyBytes>> {
    let mut bytes=Vec::with_capacity(4096);bytes.extend_from_slice(b"ACVR\x01");
    wire_value(value,fallback,&mut bytes,0,&mut 0)?;Ok(PyBytes::new(py,&bytes))
}

#[pyfunction]
fn preview_bmp<'py>(py:Python<'py>,raw:&[u8],width:usize,height:usize,channels:usize,depth:usize)->PyResult<Bound<'py,PyBytes>>{
    let invalid=pyo3::exceptions::PyValueError::new_err;
    if width==0||height==0||width>64_000_000||height>64_000_000||!matches!(channels,1|3|4)||!matches!(depth,1|2){return Err(invalid("Invalid preview raster dimensions, channels or depth"));}
    let expected=width.checked_mul(height).and_then(|n|n.checked_mul(channels*depth)).ok_or_else(||invalid("Preview dimensions overflow"))?;
    if raw.len()!=expected{return Err(invalid("Preview raster byte length does not match its descriptor"));}
    let output_channels=if channels==1{1}else{3};
    let row_bytes=width*output_channels;let stride=(row_bytes+3)&!3;
    let offset=54+if channels==1{1024}else{0};let size=offset+stride*height;
    if size>24*1024*1024{return Err(invalid("Encoded preview exceeds output size bound"));}
    // Initialize the final immutable Python owner directly. new_with supplies
    // zeroed bytes, including header reserves, palette alpha and row padding.
    // No intermediate full-frame Vec or second Rust-to-Python image copy.
    PyBytes::new_with(py,size,|bmp|{
    bmp[..2].copy_from_slice(b"BM");bmp[2..6].copy_from_slice(&(size as u32).to_le_bytes());
    bmp[10..14].copy_from_slice(&(offset as u32).to_le_bytes());bmp[14..18].copy_from_slice(&40u32.to_le_bytes());
    bmp[18..22].copy_from_slice(&(width as i32).to_le_bytes());bmp[22..26].copy_from_slice(&(height as i32).to_le_bytes());
    bmp[26..28].copy_from_slice(&1u16.to_le_bytes());bmp[28..30].copy_from_slice(&((output_channels*8) as u16).to_le_bytes());
    if channels==1{for i in 0..256{bmp[54+4*i..54+4*i+3].fill(i as u8);}}
    let source_stride=width*channels*depth;
    for y in 0..height{
        let source=&raw[y*source_stride..(y+1)*source_stride];
        let target=&mut bmp[offset+(height-1-y)*stride..offset+(height-1-y)*stride+row_bytes];
        if depth==1&&channels==output_channels{target.copy_from_slice(source);}
        else{for x in 0..width{for c in 0..output_channels{target[x*output_channels+c]=source[(x*channels+c)*depth+depth-1];}}}
    }
    Ok(())
    })
}
#[pymodule]
fn _agentcv_json(module:&Bound<'_,PyModule>)->PyResult<()> {module.add_class::<EncodingCache>()?;module.add("ReportWireLimitError",module.py().get_type::<ReportWireLimitError>())?;module.add_function(wrap_pyfunction!(encode,module)?)?;module.add_function(wrap_pyfunction!(encode_report,module)?)?;module.add_function(wrap_pyfunction!(encode_report_wire,module)?)?;module.add_function(wrap_pyfunction!(normalize,module)?)?;module.add_function(wrap_pyfunction!(normalize_trace,module)?)?;module.add_function(wrap_pyfunction!(layer_points_valid,module)?)?;module.add_function(wrap_pyfunction!(preview_bmp,module)?)?;module.add("format_version",1)?;Ok(())}
