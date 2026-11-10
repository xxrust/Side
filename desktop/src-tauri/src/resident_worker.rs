//! Resident extension process owned by Rust. Scheme definitions are immutable
//! within a session. Protocol is separate from arbitrary algorithm stdout.
use serde_json::{Value,json};
use sha2::{Digest,Sha256};
use std::{fs,io::{BufRead,BufReader,Write},net::{TcpListener,TcpStream},path::{Path,PathBuf},process::{Child,Command},sync::Mutex,time::{Duration,Instant},thread};
static WORKER: Mutex<Option<Worker>>=Mutex::new(None);
const MAX_REPLY: usize=4096;
struct Worker {key:String, child:Child, channel:BufReader<TcpStream>, root:PathBuf, calls:u64}
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
pub fn plan_key(request:&Value)->Result<Option<String>,String>{
 let Some(plan)=request.get("runtimePlan") else{return Ok(None)};
 let definition=&plan["definition"];let node_id=plan["nodeId"].as_str().ok_or("缺少常駐節點身份")?;
 let node=definition["operatorGraph"]["nodes"].as_array().and_then(|ns|ns.iter().find(|n|n["id"]==node_id)).ok_or("常駐節點不在方案中")?;
 if request["mode"]!="scheme"||node["code"]!=request["code"]||node["parameters"]!=request["parameters"]||node["expected_outputs"]!=request["expectedOutputs"]{return Err("常駐請求與流程圖使用的方案節點不一致".into());}
 if plan["fingerprint"].as_str().unwrap_or("").is_empty(){return Err("缺少編譯方案指紋".into());}
 Ok(Some(format!("{:x}",Sha256::digest(serde_json::to_vec(definition).map_err(|e|e.to_string())?))))
}
pub struct Receipt{pub pid:u32,pub call:u64,pub cold:bool,pub elapsed_ms:f64}
pub fn execute(key:&str,script:&Path,root:&Path,mut command:Command,request:&Path,directory:&Path,seconds:u64)->Result<Receipt,String>{
 let started=Instant::now();let key=format!("{key}:{}:{}:{}",root.display(),script.display(),fs::metadata(script).and_then(|m|m.modified()).map(|v|format!("{v:?}")).unwrap_or_default());
 let mut slot=WORKER.lock().map_err(|e|e.to_string())?;
 let cold=slot.as_ref().map(|w|w.key!=key).unwrap_or(true);
 if cold{
  *slot=None;fs::create_dir_all(root).map_err(|e|e.to_string())?;
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
  stream.set_read_timeout(Some(Duration::from_secs(seconds))).map_err(|e|e.to_string())?;stream.set_write_timeout(Some(Duration::from_secs(seconds))).map_err(|e|e.to_string())?;
  let mut worker=Worker{key,child,channel:BufReader::new(stream),root:root.to_path_buf(),calls:0};
  let hello=line(&mut worker.channel)?;if hello["token"]!=token||hello["protocol"]!="agentcv-resident-1"{return Err("常駐協議握手失敗".into());}*slot=Some(worker);
 }
 let worker=slot.as_mut().unwrap();worker.calls+=1;let call=worker.calls;let pid=worker.child.id();
 worker.channel.get_mut().set_read_timeout(Some(Duration::from_secs(seconds))).map_err(|e|e.to_string())?;
 let body=json!({"call":call,"request":request,"directory":directory,"cacheRoot":worker.root});
 let outcome=(||{let stream=worker.channel.get_mut();stream.write_all(&serde_json::to_vec(&body).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;stream.write_all(b"\n").map_err(|e|e.to_string())?;stream.flush().map_err(|e|e.to_string())?;let reply=line(&mut worker.channel)?;if reply["call"]!=call||reply["ok"]!=true{return Err(format!("常駐算法回覆不一致：{reply}"));}Ok(())})();
 if let Err(error)=outcome{*slot=None;return Err(error);}
 Ok(Receipt{pid,call,cold,elapsed_ms:started.elapsed().as_secs_f64()*1000.})
}
