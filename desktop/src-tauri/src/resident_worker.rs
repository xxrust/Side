//! Resident extension process owned by Rust. Scheme definitions are immutable
//! within a session. Protocol is separate from arbitrary algorithm stdout.
use serde_json::{Value,json};
use sha2::{Digest,Sha256};
use std::{collections::{BTreeMap,BTreeSet,VecDeque},fs,io::{BufRead,BufReader,Read,Write},net::{TcpListener,TcpStream},path::{Path,PathBuf},process::{Child,Command},sync::{Arc,Mutex},time::{Duration,Instant},thread};
static WORKER: Mutex<Option<Worker>>=Mutex::new(None);
static PLANS: Mutex<VecDeque<(String,String,Arc<Value>)>>=Mutex::new(VecDeque::new());
const MAX_REPLY: usize=16*1024;
struct Worker {key:String, child:Child, channel:BufReader<TcpStream>, root:PathBuf, calls:u64,originals:BTreeSet<String>}
impl Drop for Worker {
 fn drop(&mut self){
  #[cfg(unix)] unsafe{libc::kill(-(self.child.id() as i32),libc::SIGKILL);}
  let _=self.child.kill();let _=self.child.wait();
 }
}
pub fn invalidate(){if let Ok(mut worker)=WORKER.lock(){*worker=None;}}
fn line(channel:&mut BufReader<TcpStream>)->Result<Value,String>{
 let mut bytes=Vec::new();loop{let available=channel.fill_buf().map_err(|e|format!("常駐算法進程失去連線或逾時：{e}"))?;if available.is_empty(){return Err("常駐算法進程已退出".into());}let length=available.iter().position(|b|*b==b'\n').map(|i|i+1).unwrap_or(available.len());if bytes.len()+length>MAX_REPLY{return Err("常駐協議回覆超過上限".into());}bytes.extend_from_slice(&available[..length]);channel.consume(length);if bytes.last()==Some(&b'\n'){break;}}
 serde_json::from_slice(&bytes).map_err(|e|format!("常駐協議資料損壞：{e}"))
}
/// Verify the very definition already used by the compiler and flow view. No
/// second authored workflow, algorithm whitelist or inferred node association.
pub struct ResolvedPlan { pub key:String, pub definition:Arc<Value> }
pub fn resolve_plan(request:&Value)->Result<Option<ResolvedPlan>,String>{
 let Some(plan)=request.get("runtimePlan") else{return Ok(None)};
 let fingerprint=plan["fingerprint"].as_str().filter(|s|!s.is_empty()).ok_or("缺少編譯方案指紋")?.to_owned();
 let (key,definition)=if let Some(token)=plan["token"].as_str() {
  if !plan["definition"].is_null(){return Err("常駐方案不能同時提供token與definition".into());}
  let plans=PLANS.lock().map_err(|e|e.to_string())?;
  let (_,saved_fingerprint,definition)=plans.iter().find(|(key,_,_)|key==token).ok_or("常駐方案已過期，請重新編譯執行")?;
  if saved_fingerprint!=&fingerprint{return Err("常駐方案指紋不一致".into());}
  (token.to_owned(),definition.clone())
 }else{
  let definition=&plan["definition"];
  let bytes=serde_json::to_vec(definition).map_err(|e|e.to_string())?;
  if bytes.len()>4*1024*1024{return Err("常駐方案超過4MB上限".into());}
  let mut hash=Sha256::new();hash.update(fingerprint.as_bytes());hash.update([0]);hash.update(bytes);
  let key=format!("{:x}",hash.finalize());
  let plans=PLANS.lock().map_err(|e|e.to_string())?;
  // The immutable definition has already been accepted under this digest.
  // Reuse its allocation for repeated whole-workpiece requests too, while
  // preserving the source/parameter/output equality checks below.
  let retained=plans.iter().find(|(saved,saved_fingerprint,saved_definition)|saved==&key&&saved_fingerprint==&fingerprint&&saved_definition.as_ref()==definition)
   .map(|(_,_,definition)|definition.clone()).unwrap_or_else(||Arc::new(definition.clone()));
  (key,retained)
 };
 let node_id=plan["nodeId"].as_str().ok_or("缺少常駐節點身份")?;
 let node=definition["operatorGraph"]["nodes"].as_array().and_then(|ns|ns.iter().find(|n|n["id"]==node_id)).ok_or("常駐節點不在方案中")?;
 if request["mode"]!="scheme"||node["code"]!=request["code"]||node["parameters"]!=request["parameters"]||node["expected_outputs"]!=request["expectedOutputs"]{return Err("常駐請求與流程圖使用的方案節點不一致".into());}
 let mut plans=PLANS.lock().map_err(|e|e.to_string())?;
 if !plans.iter().any(|(saved,_,_)|saved==&key){
  while plans.len()>=8{plans.pop_front();}
  plans.push_back((key.clone(),fingerprint,definition.clone()));
 }
 Ok(Some(ResolvedPlan{key,definition}))
}
pub struct Receipt{pub pid:u32,pub call:u64,pub cold:bool,pub elapsed_ms:f64,pub original_transfer_bytes:usize,pub live_images:BTreeMap<String,Vec<u8>>,pub report:Option<Value>,pub artifacts:BTreeMap<String,Vec<u8>>,pub exchange_timing:Value}
pub fn execute(key:&str,script:&Path,root:&Path,make_command:impl FnOnce()->Result<Command,String>,request:&Path,memory_request:Option<&[u8]>,originals:&[crate::original_resources::Original],directory:&Path,seconds:u64)->Result<Receipt,String>{
 let started=Instant::now();let key=format!("{key}:{}:{}:{}",root.display(),script.display(),fs::metadata(script).and_then(|m|m.modified()).map(|v|format!("{v:?}")).unwrap_or_default());
 let mut slot=WORKER.lock().map_err(|e|e.to_string())?;
 let cold=slot.as_ref().map(|w|w.key!=key).unwrap_or(true);
 if cold{
  *slot=None;fs::create_dir_all(root).map_err(|e|e.to_string())?;
  // Python's legacy file mode also writes original snapshots under this cache.
  // Canonical Windows paths carry the extended prefix, so a valid deep project
  // is not rejected by the Win32 260-character compatibility limit.
  #[cfg(windows)] let cache_root=fs::canonicalize(root).map_err(|e|e.to_string())?;
  #[cfg(not(windows))] let cache_root=root.to_path_buf();
  let mut command=make_command()?;
  let listener=TcpListener::bind("127.0.0.1:0").map_err(|e|e.to_string())?;listener.set_nonblocking(true).map_err(|e|e.to_string())?;
  let address=listener.local_addr().map_err(|e|e.to_string())?;let token=format!("{:x}",Sha256::digest(format!("{:?}:{}:{key}",Instant::now(),std::process::id())));
  command.arg(script).arg("--serve").arg(address.to_string()).arg(&token);
  let mut child=command.spawn().map_err(|e|format!("常駐進程啟動失敗：{e}"))?;
  // Never leave arbitrary stdout/stderr unread; retain only bounded logs.
  if let Some(out)=child.stdout.take(){super::cv_runtime::bounded_reader(out);}
  if let Some(err)=child.stderr.take(){super::cv_runtime::bounded_reader(err);}
  let deadline=Instant::now()+Duration::from_secs(seconds.min(60));
  let stream=loop{match listener.accept(){Ok((s,_))=>break s,Err(e) if e.kind()==std::io::ErrorKind::WouldBlock=>{if child.try_wait().map_err(|e|e.to_string())?.is_some(){return Err("常駐進程在連線前退出".into());}if Instant::now()>=deadline{let _=child.kill();let _=child.wait();return Err("常駐進程啟動逾時".into());}thread::sleep(Duration::from_millis(2));},Err(e)=>{let _=child.kill();return Err(e.to_string());}}};
  stream.set_nonblocking(false).map_err(|e|e.to_string())?;
  stream.set_nodelay(true).map_err(|e|e.to_string())?;
  stream.set_read_timeout(Some(Duration::from_secs(seconds))).map_err(|e|e.to_string())?;stream.set_write_timeout(Some(Duration::from_secs(seconds))).map_err(|e|e.to_string())?;
  let mut worker=Worker{key,child,channel:BufReader::new(stream),root:cache_root,calls:0,originals:BTreeSet::new()};
  let hello=line(&mut worker.channel)?;if hello["token"]!=token||hello["protocol"]!="agentcv-resident-3"{return Err("常駐協議握手失敗".into());}*slot=Some(worker);
 }
 let worker=slot.as_mut().unwrap();worker.calls+=1;let call=worker.calls;let pid=worker.child.id();
 worker.channel.get_mut().set_read_timeout(Some(Duration::from_secs(seconds))).map_err(|e|e.to_string())?;
 worker.channel.get_mut().set_write_timeout(Some(Duration::from_secs(seconds))).map_err(|e|e.to_string())?;
 let mut body=json!({"call":call,"request":request,"directory":directory,"cacheRoot":worker.root});
 if cfg!(windows)&&memory_request.is_some(){body["sharedImageTransport"]=json!("windows-pagefile-v1");}
 if let Some(data)=memory_request {if data.is_empty()||data.len()>100*1024*1024{return Err("常駐請求超過上限".into());}body["requestBytes"]=json!(data.len());}
 if memory_request.is_some(){body["reportTransport"]=json!(crate::report_wire::FORMAT);}
 let mut input_frames=Vec::new();let mut input_tokens=BTreeSet::new();
 for original in originals {
  let token=original.reference["token"].as_str().ok_or("原圖資源缺少token")?;
  if input_tokens.insert(token.to_owned()){
   let transfer=!worker.originals.contains(token);
   input_frames.push((original,transfer));
  }
 }
 body["originals"]=json!(input_frames.iter().map(|(original,transfer)|json!({"reference":original.reference,"bytes":if *transfer{original.bytes.len()}else{0}})).collect::<Vec<_>>());
 let outcome=(||{
  let sending=Instant::now();
  let mut bytes=serde_json::to_vec(&body).map_err(|e|e.to_string())?;
  bytes.push(b'\n');worker.channel.get_mut().write_all(&bytes).map_err(|e|e.to_string())?;
  if let Some(data)=memory_request {worker.channel.get_mut().write_all(data).map_err(|e|e.to_string())?;}
  for (original,transfer) in &input_frames {if *transfer{worker.channel.get_mut().write_all(&original.bytes).map_err(|e|e.to_string())?;}}
  let send_ms=sending.elapsed().as_secs_f64()*1000.;let waiting=Instant::now();
  let reply=line(&mut worker.channel)?;
  let wait_ms=waiting.elapsed().as_secs_f64()*1000.;
  if reply["call"]!=call||reply["ok"]!=true{return Err(format!("常駐算法回覆不一致：{reply}"));}
  let retained=reply["originalTokens"].as_array().filter(|v|v.len()<=16).ok_or("常駐原圖資源清單無效")?;
  let mut known=BTreeSet::new();for token in retained {let token=token.as_str().filter(|s|s.len()==64&&s.bytes().all(|b|b.is_ascii_hexdigit())).ok_or("常駐原圖token無效")?;if !known.insert(token.to_owned()){return Err("常駐原圖token重複".into());}}
  worker.originals=known;
  let report_size=reply["reportBytes"].as_u64().filter(|v|*v<=32*1024*1024).ok_or("常駐結果長度無效")? as usize;
  if memory_request.is_some()!=(report_size>0){return Err("常駐結果傳輸模式不一致".into());}
  let reading=Instant::now();let mut parse_ms=0.;
  let report=if report_size>0 {let mut bytes=vec![0;report_size];worker.channel.read_exact(&mut bytes).map_err(|e|e.to_string())?;let parsing=Instant::now();
   let value=match reply["reportEncoding"].as_str().unwrap_or("json-utf8"){
    crate::report_wire::FORMAT if body["reportTransport"]==crate::report_wire::FORMAT=>crate::report_wire::decode(&bytes)?,
    "json-utf8"=>serde_json::from_slice::<Value>(&bytes).map_err(|e|e.to_string())?,
    _=>return Err("RESIDENT_REPORT_ENCODING_INVALID".into()),
   };parse_ms=parsing.elapsed().as_secs_f64()*1000.;Some(value)}else{None};
  let report_ms=reading.elapsed().as_secs_f64()*1000.;let reading=Instant::now();
  let mut artifacts=BTreeMap::new();let mut total=0usize;
  let frames=reply["artifacts"].as_array().ok_or("常駐產物清單無效")?;
  if frames.len()>48{return Err("常駐產物數量超過限制".into());}
  for frame in frames {
   let name=frame[0].as_str().filter(|n|!n.is_empty()&&n.len()<=480).ok_or("常駐產物識別無效")?;
   let size=frame[1].as_u64().filter(|v|*v<=24*1024*1024).ok_or("常駐產物長度無效")? as usize;
   total+=size;if total>64*1024*1024||artifacts.contains_key(name){return Err("常駐產物重複或超過大小限制".into());}
   let mut data=vec![0;size];worker.channel.read_exact(&mut data).map_err(|e|e.to_string())?;artifacts.insert(name.to_owned(),data);
  }
  let artifact_ms=reading.elapsed().as_secs_f64()*1000.;let artifact_bytes=total;let reading=Instant::now();
  let mut images=BTreeMap::new();total=0;
  if let Some(frames)=reply["liveImages"].as_array(){
   if frames.len()>48{return Err("即時影像數量超過限制".into());}
   for frame in frames {
    let name=frame[0].as_str().filter(|n|!n.is_empty()&&n.len()<=480).ok_or("即時影像識別無效")?;
    let size=frame[1].as_u64().filter(|v|(54..=24*1024*1024).contains(v)).ok_or("即時影像長度無效")? as usize;
    total+=size;if total>64*1024*1024||images.contains_key(name){return Err("即時影像重複或超過大小限制".into());}
    let data=if let Some(reference)=frame.get(2){
     if body["sharedImageTransport"]!="windows-pagefile-v1"{return Err("UNNEGOTIATED_SHARED_PREVIEW".into());}
     crate::shared_preview::read(reference,size)?
    }else{let mut data=vec![0;size];worker.channel.read_exact(&mut data).map_err(|e|e.to_string())?;data};
    images.insert(name.to_owned(),data);
   }
  }
  let exchange=json!({"clock":"monotonic","sendMs":send_ms,"waitForReplyMs":wait_ms,"reportReadAndParseMs":report_ms,"reportParseMs":parse_ms,"artifactReadMs":artifact_ms,"imageReadMs":reading.elapsed().as_secs_f64()*1000.,"requestBytes":memory_request.map_or(0,|v|v.len()),"reportBytes":report_size,"artifactBytes":artifact_bytes,"imageBytes":total,"imageTransport":body.get("sharedImageTransport").and_then(Value::as_str).unwrap_or("tcp-frames"),"worker":reply.get("transportTiming"),"scope":"nested stages of resident exchange; wait includes user execution and worker preparation; worker serialization and shared-image snapshot are outside runtime duration"});
  Ok((report,artifacts,images,exchange))
 })();
 let (report,artifacts,live_images,exchange_timing)=match outcome{Ok(values)=>values,Err(error)=>{*slot=None;return Err(error);}};
 Ok(Receipt{pid,call,cold,elapsed_ms:started.elapsed().as_secs_f64()*1000.,original_transfer_bytes:input_frames.iter().filter(|(_,transfer)|*transfer).map(|(v,_)|v.bytes.len()).sum(),live_images,report,artifacts,exchange_timing})
}

#[cfg(test)]
mod plan_tests {
 use super::*;
 fn request(fingerprint:&str)->Value {
  let node=json!({"id":"actual-node","code":"unchanged user code","parameters":{"threshold":1.25},"expected_outputs":[{"id":"facts","type":"json"}]});
  json!({"mode":"scheme","code":node["code"],"parameters":node["parameters"],"expectedOutputs":node["expected_outputs"],
   "runtimePlan":{"fingerprint":fingerprint,"nodeId":"actual-node","definition":{"operatorGraph":{"nodes":[node,{"id":"consumer","inputs":{"pixels":{"nodeId":"actual-node","artifactId":"facts"}}}]}}}})
 }
 #[test]
 fn repeated_definitions_and_tokens_borrow_the_same_immutable_allocation() {
  let original=request("native-plan-borrow-test");let bytes=serde_json::to_vec(&original).unwrap();
  let first=resolve_plan(&original).unwrap().unwrap();
  let repeated=resolve_plan(&original).unwrap().unwrap();
  assert_eq!(first.key,repeated.key);assert!(Arc::ptr_eq(&first.definition,&repeated.definition));
  assert_eq!(serde_json::to_vec(&original).unwrap(),bytes);
  let mut token=original.clone();token["runtimePlan"].as_object_mut().unwrap().remove("definition");token["runtimePlan"]["token"]=json!(first.key);
  let before=serde_json::to_vec(&token).unwrap();
  let resolved=resolve_plan(&token).unwrap().unwrap();
  assert!(Arc::ptr_eq(&first.definition,&resolved.definition));
  assert_eq!(serde_json::to_vec(&token).unwrap(),before);
  assert!(token["runtimePlan"].get("definition").is_none());
  let mut changed=original.clone();changed["code"]=json!("actually changed program");
  changed["runtimePlan"]["definition"]["operatorGraph"]["nodes"][0]["code"]=changed["code"].clone();
  let changed=resolve_plan(&changed).unwrap().unwrap();
  assert_ne!(changed.key,first.key);assert!(!Arc::ptr_eq(&first.definition,&changed.definition));
 }
 #[test]
 fn borrowed_plans_still_reject_mismatched_fields_and_expired_tokens() {
  let original=request("native-plan-borrow-rejections");let first=resolve_plan(&original).unwrap().unwrap();
  let mut token=original.clone();token["runtimePlan"].as_object_mut().unwrap().remove("definition");token["runtimePlan"]["token"]=json!(first.key);
  for (path,value) in [(vec!["code"],json!("substitute")),(vec!["parameters"],json!({"threshold":9})),
    (vec!["expectedOutputs"],json!([])),(vec!["mode"],json!("trial")),
    (vec!["runtimePlan","fingerprint"],json!("different")),(vec!["runtimePlan","nodeId"],json!("missing")),
    (vec!["runtimePlan","definition"],json!({}))] {
   let mut changed=token.clone();let mut target=&mut changed;
   for key in path {target=&mut target[key];}*target=value;
   assert!(resolve_plan(&changed).is_err());
  }
  for n in 0..8 {resolve_plan(&request(&format!("native-plan-eviction-{n}"))).unwrap();}
  assert!(resolve_plan(&token).is_err());
  assert_eq!(first.definition["operatorGraph"]["nodes"][0]["code"],"unchanged user code");
  assert!(resolve_plan(&json!({})).unwrap().is_none());
 }
}
