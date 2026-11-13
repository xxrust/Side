//! Lossless sharing only at the private response boundary, after durable save.
//! Paths are out of band: user objects never serve as reference markers.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::{hash_map::DefaultHasher, HashMap}, hash::{Hash, Hasher}};

const MIN_SIZE: usize = 4096;
const MAX_LINKS: usize = 4096;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum Part { Key(String), Index(usize) }
type Path = Vec<Part>;
#[derive(Serialize)]
struct Link { from: Path, to: Path }

fn at<'a>(mut value: &'a Value, path: &[Part]) -> &'a Value {
    for part in path { value = match part { Part::Key(k) => &value[k], Part::Index(i) => &value[*i] }; }
    value
}
fn at_mut<'a>(mut value: &'a mut Value, path: &[Part]) -> &'a mut Value {
    for part in path { value = match part { Part::Key(k) => &mut value[k], Part::Index(i) => &mut value[*i] }; }
    value
}
fn address(value: &Value) -> usize { value as *const Value as usize }

// Hash is only an index. Ordered recursive equality below resolves collisions
// and preserves JSON number spelling (including negative zero) and key order.
fn fingerprint(value: &Value, cache: &mut HashMap<usize, (u64, usize)>) -> (u64, usize) {
    // Scalar tags are only a candidate index, never evidence of equality.
    // Avoid constructing/finalizing a SipHasher for every coordinate in large
    // geometry trees. Ordered recursive `same` still verifies every match,
    // including float bits, integer representation and object key order.
    let scalar = match value {
        Value::Null => Some((0, 2)),
        Value::Bool(b) => Some((1 + u64::from(*b), 2)),
        Value::Number(n) => {
            let (bits, tag) = if n.is_f64() { (n.as_f64().unwrap().to_bits(), 3) }
                else if let Some(n) = n.as_u64() { (n, 4) }
                else { (n.as_i64().unwrap() as u64, 5) };
            Some((bits.wrapping_mul(0x9e3779b97f4a7c15).rotate_left(23) ^ tag, 24))
        }
        _ => None,
    };
    if let Some(result) = scalar { return result; }
    let mut hash = DefaultHasher::new();
    let mut size = 2usize;
    match value {
        Value::Null | Value::Bool(_) | Value::Number(_) => unreachable!(),
        Value::String(s) => { 3u8.hash(&mut hash); s.hash(&mut hash); size += s.len(); }
        Value::Array(a) => {
            4u8.hash(&mut hash); a.len().hash(&mut hash);
            for child in a { let (h, n) = fingerprint(child, cache); h.hash(&mut hash); size = size.saturating_add(n + 1); }
        }
        Value::Object(o) => {
            5u8.hash(&mut hash); o.len().hash(&mut hash);
            for (k, child) in o { k.hash(&mut hash); let (h, n) = fingerprint(child, cache); h.hash(&mut hash); size = size.saturating_add(k.len() + n + 4); }
        }
    }
    let result = (hash.finish(), size);
    if size >= MIN_SIZE && (value.is_object() || value.is_array()) { cache.insert(address(value), result); }
    result
}
fn same(a: &Value, b: &Value) -> bool {
    match (a,b) {
        (Value::Object(a),Value::Object(b)) => a.len() == b.len() && a.iter().zip(b).all(|((ka,a),(kb,b))|ka == kb && same(a,b)),
        (Value::Array(a),Value::Array(b)) => a.len() == b.len() && a.iter().zip(b).all(|(a,b)|same(a,b)),
        (Value::Number(a),Value::Number(b)) => {
            if a.is_f64() || b.is_f64() { a.is_f64() == b.is_f64() && a.as_f64().unwrap().to_bits() == b.as_f64().unwrap().to_bits() }
            else if let (Some(a),Some(b)) = (a.as_u64(),b.as_u64()) { a == b }
            else { a.as_i64() == b.as_i64() }
        }
        _ => a == b,
    }
}
fn visit(root: &Value, value: &Value, path: &mut Path, cache: &HashMap<usize,(u64,usize)>, seen: &mut HashMap<u64,Vec<Path>>, links: &mut Vec<Link>) {
    if links.len() >= MAX_LINKS { return; }
    // A subtree below the size threshold cannot contain a larger descendant.
    // Do not allocate paths for the thousands of individual geometry points.
    if let Some((hash,_)) = cache.get(&address(value)) {
        let candidates = seen.entry(*hash).or_default();
        if let Some(first) = candidates.iter().find(|p|same(at(root,p),value)) {
            links.push(Link { from: first.clone(), to: path.clone() });
            return; // Descendants belong to the shared immutable subtree too.
        }
        candidates.push(path.clone());
    } else { return; }
    match value {
        Value::Array(a) => for (i, child) in a.iter().enumerate().filter(|(_,c)|cache.contains_key(&address(c))) { path.push(Part::Index(i)); visit(root,child,path,cache,seen,links); path.pop(); },
        Value::Object(o) => for (k, child) in o.iter().filter(|(_,c)|cache.contains_key(&address(c))) { path.push(Part::Key(k.clone())); visit(root,child,path,cache,seen,links); path.pop(); },
        _ => (),
    }
}
fn roots(value: &Value) -> Vec<Path> {
    let mut roots = Vec::new();
    if let Some(runs) = value["runs"].as_array() { for (i,run) in runs.iter().enumerate() {
        let prefix = vec![Part::Key("runs".into()),Part::Index(i)];
        for key in ["result","procedureTrace","structuredLayers","nativeResult"] { if run.get(key).is_some() {
            let mut path=prefix.clone();path.push(Part::Key(key.into()));roots.push(path);
        }}
        if let Some(artifacts)=run["artifacts"].as_array() { for (j,artifact) in artifacts.iter().enumerate() { if artifact.get("data").is_some() {
            let mut path=prefix.clone();path.extend([Part::Key("artifacts".into()),Part::Index(j),Part::Key("data".into())]);roots.push(path);
        }}}
    }}
    roots
}
pub fn compact(value: &mut Value) -> Result<usize,String> {
    if !value.is_object() || value.get("_sharedFacts").is_some() { return Err("SESSION_SHARED_FACTS_ENVELOPE_INVALID".into()); }
    let roots=roots(value);let mut cache=HashMap::new();
    for path in &roots { fingerprint(at(value,path),&mut cache); }
    let mut seen=HashMap::new();let mut links=Vec::new();
    for mut path in roots { visit(value,at(value,&path),&mut path,&cache,&mut seen,&mut links); }
    let count=links.len();
    if count>0 {
        for link in &links { *at_mut(value,&link.to)=Value::Null; }
        value["_sharedFacts"]=json!({"backend":"rust-shared-facts-v1","links":links});
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn restore(value:&mut Value) {
        let Some(meta)=value.as_object_mut().unwrap().remove("_sharedFacts") else{return};
        for link in meta["links"].as_array().unwrap() {
            let from:Path=serde_json::from_value(link["from"].clone()).unwrap();
            let to:Path=serde_json::from_value(link["to"].clone()).unwrap();
            *at_mut(value,&to)=at(value,&from).clone();
        }
    }
    #[test]
    fn sharing_retains_exact_bytes_order_numbers_special_keys_and_user_markers() {
        let points=json!((0..700).map(|n|json!({"x":n as f64/3.,"y":-(n as f64),"__proto__":"user-data"})).collect::<Vec<_>>());
        let facts=json!({"points":points,"number":-0.0,"userMarker":{"_sharedFacts":{"from":["runs",0]}}});
        let mut value=json!({"runs":[{"result":facts,"procedureTrace":{"nodes":[{"outputs":{"copy":facts}}]},"artifacts":[{"data":facts},{"data":{"a":points,"b":points}}]}],"timing":{}});
        let original=serde_json::to_vec(&value).unwrap();
        let count=compact(&mut value).unwrap();assert!(count>=3);
        assert!(serde_json::to_vec(&value).unwrap().len()<original.len()/2);
        restore(&mut value);assert_eq!(serde_json::to_vec(&value).unwrap(),original);
        let mut different=json!({"a":1,"b":2});let obj=different.as_object_mut().unwrap();let a=obj.shift_remove("a").unwrap();obj.insert("a".into(),a);
        assert!(!same(&json!({"a":1,"b":2}),&different));
        assert!(!same(&json!(-0.0),&json!(0.0)));
        assert!(compact(&mut json!({"_sharedFacts":null})).is_err());
    }
    #[test]
    fn hash_collisions_cannot_share_different_numbers_or_reordered_objects() {
        let coordinates=json!((0..700).map(|i|json!({"x":i,"y":-0.0})).collect::<Vec<_>>());
        let facts=json!({"coordinates":coordinates,"tag":"same"});
        let mut positive=facts.clone();positive["coordinates"][0]["y"]=json!(0.0);
        let mut float=facts.clone();float["coordinates"][0]["x"]=json!(0.0);
        let mut negative=facts.clone();negative["coordinates"][0]["x"]=json!(-1);
        let mut reordered=facts.clone();
        {let map=reordered.as_object_mut().unwrap();let value=map.shift_remove("coordinates").unwrap();map.insert("coordinates".into(),value);}
        let mut value=json!({"runs":[{"result":[positive,float,negative,reordered,facts.clone(),facts]}]});
        let original=serde_json::to_vec(&value).unwrap();
        let roots=roots(&value);let mut cache=HashMap::new();
        for path in &roots {fingerprint(at(&value,path),&mut cache);}
        // Deliberately collide all container hashes. Equality must retain every
        // representation difference even when the candidate index is useless.
        for entry in cache.values_mut(){entry.0=0;}
        let mut seen=HashMap::new();let mut links=Vec::new();
        for mut path in roots{visit(&value,at(&value,&path),&mut path,&cache,&mut seen,&mut links);}
        assert!(!links.is_empty());
        for link in &links{assert!(same(at(&value,&link.from),at(&value,&link.to)));}
        for link in &links{*at_mut(&mut value,&link.to)=Value::Null;}
        value["_sharedFacts"]=json!({"backend":"rust-shared-facts-v1","links":links});
        restore(&mut value);assert_eq!(serde_json::to_vec(&value).unwrap(),original);
    }
    #[test]
    #[ignore = "Explicit captured desktop response required"]
    fn captured_response_roundtrip() {
        let path=std::env::var_os("AGENTCV_SHARED_FACTS_INPUT").expect("explicit input");
        let mut value:Value=serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        let original=serde_json::to_vec(&value).unwrap();
        let start=std::time::Instant::now();let count=compact(&mut value).unwrap();
        let compact_ms=start.elapsed().as_secs_f64()*1000.;
        let wire=serde_json::to_vec(&value).unwrap();
        if let Some(out)=std::env::var_os("AGENTCV_SHARED_FACTS_OUTPUT") {std::fs::write(out,&wire).unwrap();}
        restore(&mut value);assert_eq!(serde_json::to_vec(&value).unwrap(),original);
        let mut samples=Vec::new();
        for index in 0..48 {
            let mut times=[0.;2];
            for optimize in if index%2==0 {[false,true]}else{[true,false]} {
                let mut owned=value.clone();let started=std::time::Instant::now();
                if optimize {compact(&mut owned).unwrap();}
                let encoded=serde_json::to_vec(&owned).unwrap();drop(owned);
                times[usize::from(optimize)]=started.elapsed().as_secs_f64()*1000.;
                if optimize {let mut decoded:Value=serde_json::from_slice(&encoded).unwrap();restore(&mut decoded);assert_eq!(serde_json::to_vec(&decoded).unwrap(),original);}
                else {assert_eq!(encoded,original);}
            }
            samples.push(json!({"index":index,"previousMs":times[0],"sharedMs":times[1]}));
        }
        let diagnostic=json!({"status":"PASS","diagnosticOnly":true,"originalBytes":original.len(),"wireBytes":wire.len(),"links":count,"compactMs":compact_ms,"byteIdentical":true,"samples":samples});
        if let Some(out)=std::env::var_os("AGENTCV_SHARED_FACTS_DIAGNOSTIC") {std::fs::write(out,serde_json::to_vec_pretty(&diagnostic).unwrap()).unwrap();}
        println!("{}",diagnostic);
    }
}
