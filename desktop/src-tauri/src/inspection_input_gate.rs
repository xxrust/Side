//! Optional browser pixel-identity acknowledgement before archive admission.
//! This gate never certifies pixels itself: it matches the browser's completed
//! verification against the exact source binding used by this native session.
use serde_json::Value;
use std::{collections::BTreeMap,sync::{Arc,Condvar,Mutex,OnceLock},time::{Duration,Instant}};
#[derive(Clone,Copy,PartialEq)]
enum State { Pending, Accepted, Rejected }
struct Gate { expected:Value, state:Mutex<State>, changed:Condvar }
static GATES:OnceLock<Mutex<BTreeMap<String,Arc<Gate>>>>=OnceLock::new();
pub struct Registration { id:String, gate:Arc<Gate> }
impl Drop for Registration {
 fn drop(&mut self){if let Ok(mut entries)=GATES.get_or_init(Default::default).lock(){if entries.get(&self.id).is_some_and(|g|Arc::ptr_eq(g,&self.gate)){entries.remove(&self.id);}}}
}
pub fn register(request:&Value)->Result<Option<Registration>,String>{
 if request.get("awaitInputVerification").is_none_or(|v|v==false){return Ok(None);}
 if request["awaitInputVerification"]!=true{return Err("SESSION_INPUT_GATE_INVALID".into());}
 let id=request["sessionId"].as_str().filter(|id|!id.is_empty()).ok_or("SESSION_ID_REQUIRED")?;
 let expected=&request["shared"]["sourceBinding"];
 if !expected.is_object()||expected["images"].as_array().is_none_or(|a|a.is_empty())
  ||request["shared"]["images"].as_array().is_none_or(|a|a.is_empty()||a.iter().any(|i|!i["assetRef"].is_object()))
  ||request["nodes"].as_array().is_none_or(|a|a.is_empty()||a.iter().any(|n|n["request"]["nativePipeline"].is_object())) {
  return Err("SESSION_INPUT_GATE_REQUIRES_FILE_BACKED_PYTHON".into());
 }
 let gate=Arc::new(Gate{expected:expected.clone(),state:Mutex::new(State::Pending),changed:Condvar::new()});
 let mut entries=GATES.get_or_init(Default::default).lock().map_err(|e|e.to_string())?;
 if entries.len()>=8||entries.contains_key(id){return Err("SESSION_INPUT_GATE_BUSY".into());}
 entries.insert(id.to_owned(),gate.clone());Ok(Some(Registration{id:id.to_owned(),gate}))
}
pub fn acknowledge(id:&str,accepted:bool,source:&Value)->Result<(),String>{
 let gate=GATES.get_or_init(Default::default).lock().map_err(|e|e.to_string())?.get(id).cloned().ok_or("SESSION_INPUT_GATE_UNKNOWN")?;
 let mut state=gate.state.lock().map_err(|e|e.to_string())?;
 if *state!=State::Pending{return Err("SESSION_INPUT_GATE_ALREADY_RESOLVED".into());}
 *state=if accepted&&*source==gate.expected{State::Accepted}else{State::Rejected};gate.changed.notify_all();
 if *state==State::Rejected{return Err("SESSION_INPUT_VERIFICATION_REJECTED".into());}Ok(())
}
impl Registration {
 pub fn wait(&self,cancelled:impl Fn()->bool)->Result<(),String>{self.wait_for(cancelled,Duration::from_secs(10))}
 fn wait_for(&self,cancelled:impl Fn()->bool,timeout:Duration)->Result<(),String>{
  let deadline=Instant::now()+timeout;let mut state=self.gate.state.lock().map_err(|e|e.to_string())?;
  loop {
   if cancelled(){*state=State::Rejected;return Err("SESSION_INPUT_VERIFICATION_CANCELLED".into());}
   match *state{State::Accepted=>return Ok(()),State::Rejected=>return Err("SESSION_INPUT_VERIFICATION_REJECTED".into()),State::Pending=>{}}
   let remaining=deadline.saturating_duration_since(Instant::now());
   if remaining.is_zero(){*state=State::Rejected;return Err("SESSION_INPUT_VERIFICATION_TIMEOUT".into());}
   state=self.gate.changed.wait_timeout(state,remaining.min(Duration::from_millis(5))).map_err(|e|e.to_string())?.0;
  }
 }
}
#[cfg(test)]
mod tests {
 use super::*;use serde_json::json;
 fn request(id:&str)->Value{json!({"sessionId":id,"awaitInputVerification":true,"shared":{"sourceBinding":{"images":[{"imageId":"actual","imageSha256":"pixels","contentSha256":"file","width":2,"height":3}]},"images":[{"assetRef":{"sha256":"file"}}]},"nodes":[{"request":{}}]})}
 #[test]
 fn accepted_identity_wakes_waiter_and_registration_expires(){
  let r=request("gate-accepted");let registration=register(&r).unwrap().unwrap();
  std::thread::scope(|s|{
   let (started_tx,started_rx)=std::sync::mpsc::channel();let (done_tx,done_rx)=std::sync::mpsc::channel();
   let gate=&registration;let waiter=s.spawn(move ||{started_tx.send(()).unwrap();let result=gate.wait(||false);done_tx.send(()).unwrap();result});
   started_rx.recv().unwrap();assert!(done_rx.try_recv().is_err(),"unverified gate cannot finish");
   acknowledge("gate-accepted",true,&r["shared"]["sourceBinding"]).unwrap();waiter.join().unwrap().unwrap();done_rx.recv().unwrap();
  });
  assert!(acknowledge("gate-accepted",true,&r["shared"]["sourceBinding"]).is_err());
  drop(registration);assert!(acknowledge("gate-accepted",true,&r["shared"]["sourceBinding"]).is_err());
 }
 #[test]
 fn wrong_source_rejection_cancel_and_timeout_cannot_admit_archive(){
  for (id,kind) in [("gate-wrong",0),("gate-rejected",1),("gate-cancelled",2),("gate-timeout",3)]{
   let r=request(id);let registration=register(&r).unwrap().unwrap();
   if kind==0{let mut source=r["shared"]["sourceBinding"].clone();source["images"][0]["width"]=json!(9);assert!(acknowledge(id,true,&source).is_err());}
   if kind==1{assert!(acknowledge(id,false,&r["shared"]["sourceBinding"]).is_err());}
   assert!(registration.wait_for(||kind==2,Duration::from_millis(1)).is_err());
   assert!(acknowledge(id,true,&r["shared"]["sourceBinding"]).is_err());
  }
 }
 #[test]
 fn ordinary_sessions_and_native_pixel_plans_do_not_enter_gate(){
  assert!(register(&json!({})).unwrap().is_none());let mut r=request("gate-native");r["nodes"][0]["request"]["nativePipeline"]=json!({});assert!(register(&r).is_err());
  r["nodes"][0]["request"].as_object_mut().unwrap().remove("nativePipeline");r["shared"]["images"][0].as_object_mut().unwrap().remove("assetRef");assert!(register(&r).is_err());
 }
}
