//! Captured original bytes. A handle denotes an immutable import snapshot, not
//! a promise that an external file will keep its contents. Expired handles are
//! resolved again from the ordinary verified source before any program runs.
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{collections::VecDeque,sync::{Arc,Mutex,OnceLock},time::SystemTime};
const MAX_BYTES:usize=128*1024*1024;
const MAX_ENTRIES:usize=16;
#[derive(Clone)]
pub struct Original {pub reference:Value,pub bytes:Arc<Vec<u8>>}
#[derive(Default)]
struct Registry {entries:VecDeque<Original>,bytes:usize,sequence:u64,hits:u64,misses:u64}
static REGISTRY:OnceLock<Mutex<Registry>>=OnceLock::new();
#[cfg(test)]
pub(crate) static TEST_LOCK:Mutex<()>=Mutex::new(());
fn matches(reference:&Value,image:&Value)->Result<(),String>{
 if reference["kind"]!="runtime-original"||reference["imageId"]!=image["id"]||reference["width"]!=image["width"]||reference["height"]!=image["height"]
  ||image["source"]["contentSha256"].as_str().is_some_and(|hash|reference["sha256"]!=hash){return Err("原圖內存資源與本次來源不一致".into());}
 Ok(())
}
pub fn lookup(image:&Value)->Result<Option<Original>,String>{
 let Some(reference)=image.get("runtimeInput") else{return Ok(None)};
 matches(reference,image)?;
 let mut r=REGISTRY.get_or_init(Default::default).lock().map_err(|e|e.to_string())?;
 let Some(index)=r.entries.iter().position(|v|v.reference["token"]==reference["token"]) else{r.misses+=1;return Ok(None)};
 if r.entries[index].reference!=*reference{return Err("原圖內存資源身份不一致".into());}
 let original=r.entries.remove(index).unwrap();r.entries.push_back(original.clone());r.hits+=1;Ok(Some(original))
}
pub fn capture(image:&Value,bytes:Vec<u8>)->Result<Original,String>{
 if bytes.is_empty()||bytes.len()>64*1024*1024{return Err("原圖大小超過輸入限制".into());}
 let hash=format!("{:x}",Sha256::digest(&bytes));
 if image["source"]["contentSha256"].as_str().is_some_and(|v|v!=hash){return Err("原圖與來源內容雜湊不一致".into());}
 let mut r=REGISTRY.get_or_init(Default::default).lock().map_err(|e|e.to_string())?;
 while r.entries.len()>=MAX_ENTRIES||r.bytes+bytes.len()>MAX_BYTES{let old=r.entries.pop_front().ok_or("原圖內存預算不足")?;r.bytes-=old.bytes.len();}
 r.sequence+=1;r.misses+=1;
 let token=format!("{:x}",Sha256::digest(format!("{:?}:{}:{}:{hash}",SystemTime::now(),std::process::id(),r.sequence)));
 let reference=json!({"kind":"runtime-original","token":token,"imageId":image["id"],"width":image["width"],"height":image["height"],"sha256":hash,"bytes":bytes.len()});
 let original=Original{reference,bytes:Arc::new(bytes)};r.bytes+=original.bytes.len();r.entries.push_back(original.clone());Ok(original)
}
pub fn stats()->Result<Value,String>{
 let r=REGISTRY.get_or_init(Default::default).lock().map_err(|e|e.to_string())?;
 Ok(json!({"entries":r.entries.len(),"bytes":r.bytes,"maxEntries":MAX_ENTRIES,"maxBytes":MAX_BYTES,"hits":r.hits,"misses":r.misses}))
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]
 fn original_snapshot_identity_isolation_and_expiry(){
  let _exclusive=TEST_LOCK.lock().unwrap();
  let mut image=json!({"id":"original","width":4,"height":3});
  let original=capture(&image,vec![1,2,3]).unwrap();image["runtimeInput"]=original.reference.clone();
  assert_eq!(lookup(&image).unwrap().unwrap().bytes.as_slice(),[1,2,3]);
  let mut forged=image.clone();forged["runtimeInput"]["bytes"]=json!(4);assert!(lookup(&forged).is_err());
  forged=image.clone();forged["id"]=json!("different-image");assert!(lookup(&forged).is_err());
  forged=image.clone();forged["source"]=json!({"contentSha256":"different-content"});assert!(lookup(&forged).is_err());
  for n in 0..MAX_ENTRIES{capture(&json!({"id":format!("later-{n}"),"width":1,"height":1}),vec![n as u8]).unwrap();}
  assert!(lookup(&image).unwrap().is_none());assert_eq!(original.bytes.as_slice(),[1,2,3]);
  let info=stats().unwrap();assert_eq!(info["entries"],MAX_ENTRIES);assert!(info["bytes"].as_u64().unwrap()<=MAX_BYTES as u64);
 }
}
