//! Immutable execution bytes owned by Rust. Tokens are process-local capabilities,
//! bounded by both workpiece count and total bytes; never durable file references.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::{BTreeMap, VecDeque}, sync::{Arc, Mutex, OnceLock}, time::SystemTime};

const MAX_BYTES: usize = 192 * 1024 * 1024;
const MAX_GROUPS: usize = 4;
enum Payload { Bytes(Arc<Vec<u8>>), Json(Arc<Value>) }
struct Blob { payload: Payload, allocated_bytes: usize, mime: String, reference: Value, scope: String }
#[derive(Default)]
struct Registry { blobs: BTreeMap<String, Blob>, groups: VecDeque<String>, bytes: usize, sequence: u64 }
static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();
#[cfg(test)]
pub(crate) static TEST_LOCK:Mutex<()>=Mutex::new(());

pub fn retain(scope: &str, run: &str, artifact: &str, mime: &str, bytes: Vec<u8>) -> Result<Value, String> {
    let size=bytes.len();
    let digest=format!("{:x}",Sha256::digest(&bytes));
    retain_payload(scope,run,artifact,mime,Payload::Bytes(Arc::new(bytes)),size,Some(digest))
}

// Native facts are immutable trees, not an encoded file. Account for their
// container allocations conservatively in the SAME eviction budget as pixels.
// Never serialize just to retain a tree that the durable writer will use again.
pub(crate) fn json_allocation(value:&Value)->usize {
    let nested=match value {
        Value::String(s)=>s.capacity(),
        Value::Array(a)=>a.capacity().saturating_mul(std::mem::size_of::<Value>())
            .saturating_add(a.iter().map(|v|json_allocation(v).saturating_sub(std::mem::size_of::<Value>())).fold(0usize,usize::saturating_add)),
        // Covers BTree/IndexMap entry storage, links and allocator overhead.
        Value::Object(o)=>o.iter().map(|(k,v)|192usize.saturating_add(k.capacity()).saturating_add(json_allocation(v))).fold(0usize,usize::saturating_add),
        _=>0,
    };
    std::mem::size_of::<Value>().saturating_add(nested)
}
pub fn retain_json(scope:&str,run:&str,artifact:&str,value:Value)->Result<Value,String>{
    let size=json_allocation(&value);
    retain_payload(scope,run,artifact,"application/x-agentcv-native-facts",Payload::Json(Arc::new(value)),size,None)
}
fn retain_payload(scope:&str,run:&str,artifact:&str,mime:&str,payload:Payload,size:usize,digest:Option<String>)->Result<Value,String>{
    if size > 24 * 1024 * 1024 { return Err("內存產物超過24MB".into()); }
    let mut r = REGISTRY.get_or_init(Default::default).lock().map_err(|e|e.to_string())?;
    if !r.groups.iter().any(|g|g==scope) { r.groups.push_back(scope.to_owned()); }
    while r.groups.len()>MAX_GROUPS || r.bytes+size>MAX_BYTES {
        let oldest=r.groups.front().ok_or("內存產物預算不足")?.clone();
        if oldest==scope { return Err("本工件內存產物超過保留預算".into()); }
        r.groups.pop_front();
        let mut removed=0; r.blobs.retain(|_,b|{if b.scope==oldest {removed+=b.allocated_bytes;false}else{true}}); r.bytes-=removed;
    }
    r.sequence+=1;
    let token=format!("{:x}",Sha256::digest(format!("{:?}:{}:{}:{scope}:{run}:{artifact}",SystemTime::now(),std::process::id(),r.sequence)));
    let mut reference=json!({"kind":"runtime-memory", "token":token,"runId":run,"artifactId":artifact,
        "scope":scope,"bytes":size,"mime":mime});
    if let Some(digest)=digest{reference["sha256"]=json!(digest);}else{reference["representation"]=json!("native-json-tree");}
    r.bytes+=size;
    r.blobs.insert(token,Blob{payload,allocated_bytes:size,mime:mime.to_owned(),reference:reference.clone(),scope:scope.to_owned()});
    Ok(reference)
}

pub fn read(reference:&Value)->Result<Arc<Vec<u8>>,String>{
    let r=REGISTRY.get_or_init(Default::default).lock().map_err(|e|e.to_string())?;
    let blob=reference["token"].as_str().and_then(|token|r.blobs.get(token)).ok_or("內存產物已過期，請重新執行")?;
    if blob.reference!=*reference {return Err("內存產物身份不一致".into());}
    match &blob.payload{Payload::Bytes(bytes)=>Ok(bytes.clone()),Payload::Json(_)=>Err("內存資源不是編碼位元組".into())}
}
pub fn read_json(reference:&Value)->Result<Arc<Value>,String>{
    let r=REGISTRY.get_or_init(Default::default).lock().map_err(|e|e.to_string())?;
    let blob=reference["token"].as_str().and_then(|token|r.blobs.get(token)).ok_or("內存產物已過期，請重新執行")?;
    if blob.reference!=*reference{return Err("內存產物身份不一致".into());}
    match &blob.payload{Payload::Json(value)=>Ok(value.clone()),Payload::Bytes(_)=>Err("內存資源不是原生結果樹".into())}
}

pub fn url(reference:&Value)->String {
    let token=reference["token"].as_str().unwrap_or("");
    if cfg!(target_os="windows")||cfg!(target_os="android"){format!("http://agentcv-memory.localhost/{token}")}
    else{format!("agentcv-memory://localhost/{token}")}
}

pub fn stats()->Result<Value,String>{
    let r=REGISTRY.get_or_init(Default::default).lock().map_err(|e|e.to_string())?;
    Ok(json!({"groups":r.groups.len(),"artifacts":r.blobs.len(),"bytes":r.bytes,
        "maxGroups":MAX_GROUPS,"maxBytes":MAX_BYTES,"scope":"Rust immutable runtime resources; excludes Python decoded input cache"}))
}

pub fn response(request:tauri::http::Request<Vec<u8>>)->tauri::http::Response<Vec<u8>>{
    let token=request.uri().path().trim_start_matches('/');
    let blob=if request.method()==tauri::http::Method::GET && token.len()==64 && token.bytes().all(|b|b.is_ascii_hexdigit()) {
        REGISTRY.get().and_then(|r|{
            let r=r.lock().ok()?;let b=r.blobs.get(token)?;
            match &b.payload{Payload::Bytes(bytes)=>Some((bytes.clone(),b.mime.clone())),Payload::Json(_)=>None}
        })
    }else{None};
    let mut response=tauri::http::Response::builder().status(if blob.is_some(){200}else{404})
        .header("Access-Control-Allow-Origin","*").header("X-Content-Type-Options","nosniff")
        .header("Cache-Control","no-store");
    let bytes=if let Some((data,mime))=blob {response=response.header("Content-Type",mime);data.as_ref().clone()}else{Vec::new()};
    response.body(bytes).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_trees_share_immutable_storage_and_expire_with_pixel_groups(){
        let _exclusive=TEST_LOCK.lock().unwrap();
        let value=json!({"values":[0.0,-0.0,1.2345678901234567,u64::MAX],"nested":{"text":"actual execution facts","unknown":null}});
        let reference=retain_json("typed-tree","actual-run","__execution_facts",value.clone()).unwrap();
        assert_eq!(reference["representation"],"native-json-tree");
        assert!(reference["bytes"].as_u64().unwrap()>serde_json::to_vec(&value).unwrap().len() as u64);
        let a=read_json(&reference).unwrap();let b=read_json(&reference).unwrap();
        assert!(Arc::ptr_eq(&a,&b));assert_eq!(*a,value);
        assert!(read(&reference).is_err());
        let mut forged=reference.clone();forged["scope"]=json!("other");assert!(read_json(&forged).is_err());
        let bytes=retain("typed-tree","actual-run","bytes","application/json",b"{}".to_vec()).unwrap();
        assert!(read_json(&bytes).is_err());
        let response=response(tauri::http::Request::builder().uri(url(&reference)).body(Vec::new()).unwrap());
        assert_eq!(response.status(),404);
        for n in 0..MAX_GROUPS{retain(&format!("typed-tree-later-{n}"),"run","pixel","image/bmp",vec![1]).unwrap();}
        assert!(read_json(&reference).is_err());assert!(read(&bytes).is_err());
        assert_eq!(*a,value); // An in-flight save keeps its leased immutable tree.
    }
    #[test]
    fn immutable_identity_and_expiry(){
        let _exclusive=TEST_LOCK.lock().unwrap();
        let reference=retain("one","run","artifact","application/octet-stream",vec![1,2,3]).unwrap();
        assert_eq!(read(&reference).unwrap().as_slice(),[1,2,3]);
        let mut forged=reference.clone();forged["runId"]=json!("other");assert!(read(&forged).is_err());
        for n in 0..MAX_GROUPS {retain(&format!("later-{n}"),"run","artifact","image/bmp",vec![1]).unwrap();}
        assert!(read(&reference).is_err());
    }
}
