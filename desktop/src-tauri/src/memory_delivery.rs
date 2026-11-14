//! Bounded, opt-in QA observations of native image delivery, never acceptance time deductions.
use serde_json::{json,Value};
use std::{collections::VecDeque,sync::{Mutex,OnceLock},time::{Instant,SystemTime,UNIX_EPOCH}};
static ROWS:OnceLock<Mutex<VecDeque<Value>>>=OnceLock::new();
pub struct Trace{queued:Instant,wall_ms:f64,token:String}
fn enabled()->bool{option_env!("VITE_INSPECTION_QA")==Some("1")}
pub fn begin(request:&tauri::http::Request<Vec<u8>>)->Option<Trace>{
 if !enabled(){return None;}
 let token=request.uri().path().trim_start_matches('/');
 if token.len()!=64||!token.bytes().all(|b|b.is_ascii_hexdigit()){return None;}
 Some(Trace{queued:Instant::now(),wall_ms:SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs_f64()*1000.,token:token.to_owned()})
}
impl Trace{
 pub fn finish(self,worker:Instant,ready:Instant,returned:Instant,status:u16,bytes:usize){
  let row=json!({"token":self.token,"queuedAtWallMs":self.wall_ms,"queueMs":worker.duration_since(self.queued).as_secs_f64()*1000.,"responseConstructionMs":ready.duration_since(worker).as_secs_f64()*1000.,"responderCallMs":returned.duration_since(ready).as_secs_f64()*1000.,"status":status,"bytes":bytes});
  if let Ok(mut rows)=ROWS.get_or_init(Default::default).lock(){if rows.len()>=1024{rows.pop_front();}rows.push_back(row);}
 }
}
#[tauri::command]
pub fn memory_delivery_diagnostics()->Result<Value,String>{
 let rows=ROWS.get_or_init(Default::default).lock().map_err(|e|e.to_string())?;
 Ok(json!({"enabled":enabled(),"scope":"QA only. Native queue, response construction and responder call; excludes later WebKit transport/decode/callback delivery. Wall clock alignment is approximate; never subtract from cycle acceptance.","rows":*rows}))
}
