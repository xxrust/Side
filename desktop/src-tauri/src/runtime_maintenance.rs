//! Opt-in diagnostic maintenance: a returned ticket must be joined before UI publication.
use serde_json::{json,Value};
use std::{collections::BTreeMap,sync::{Mutex,mpsc},time::{Duration,Instant}};
struct Pending { reference:Value,started:Instant,reply:mpsc::Receiver<Result<Value,String>> }
static PENDING:Mutex<BTreeMap<String,Pending>>=Mutex::new(BTreeMap::new());
pub fn begin(session:&str,unit:&str,pid:u32,call:u64)->Result<Value,String>{
 let id=format!("{session}:{unit}");
 let reference=json!({"kind":"runtime-maintenance-v1","id":id,"sessionId":session,"unitId":unit,"pid":pid,"call":call});
 let mut pending=PENDING.lock().map_err(|e|e.to_string())?;
 pending.retain(|_,entry|entry.started.elapsed()<Duration::from_secs(60));
 if pending.len()>=8||pending.contains_key(&id){return Err("MAINTENANCE_BUSY".into());}
 let (send,reply)=mpsc::channel();
 pending.insert(id.clone(),Pending{reference:reference.clone(),started:Instant::now(),reply});
 std::thread::spawn(move||{let result=crate::resident_worker::collect_garbage(pid,call,&id);let _=send.send(result);});
 Ok(reference)
}
pub fn join(reference:Value)->Result<Value,String>{
 let id=reference["id"].as_str().ok_or("MAINTENANCE_ID_REQUIRED")?;
 let entry={let mut pending=PENDING.lock().map_err(|e|e.to_string())?;
  if pending.get(id).is_none_or(|p|p.reference!=reference){return Err("MAINTENANCE_IDENTITY_MISMATCH".into());}
  pending.remove(id).unwrap()};
 entry.reply.recv_timeout(Duration::from_secs(30)).map_err(|_|"MAINTENANCE_COMPLETION_UNAVAILABLE".to_owned())?
}
#[cfg(test)]
mod tests {
 use super::*;
 #[test]
 fn wrong_identity_does_not_consume_completion_and_ticket_is_single_use(){
  let id="maintenance-test-identity";let reference=json!({"id":id,"unitId":"actual"});let (send,reply)=mpsc::channel();
  PENDING.lock().unwrap().insert(id.into(),Pending{reference:reference.clone(),started:Instant::now(),reply});
  assert_eq!(join(json!({"id":id,"unitId":"other"})).unwrap_err(),"MAINTENANCE_IDENTITY_MISMATCH");
  send.send(Ok(json!({"actual":true}))).unwrap();assert_eq!(join(reference.clone()).unwrap(),json!({"actual":true}));
  assert_eq!(join(reference).unwrap_err(),"MAINTENANCE_IDENTITY_MISMATCH");
 }
 #[test]
 fn failed_worker_completion_is_not_reported_as_success(){
  let id="maintenance-test-error";let reference=json!({"id":id});let (send,reply)=mpsc::channel();
  PENDING.lock().unwrap().insert(id.into(),Pending{reference:reference.clone(),started:Instant::now(),reply});
  send.send(Err("actual worker failure".into())).unwrap();assert_eq!(join(reference).unwrap_err(),"actual worker failure");
 }
}
