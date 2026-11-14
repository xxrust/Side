//! Bounded background archival. PENDING means owned memory, never durable save.
//! The writer runs on one worker and is triggered by count, age or explicit flush.
use crate::inspection_files::PreparedUnit;
use serde_json::{json,Value};
use tauri::Emitter;
use std::{collections::{BTreeMap,VecDeque},sync::{Arc,Condvar,Mutex},time::{Duration,Instant}};
use std::sync::OnceLock;

static DESKTOP:Mutex<Option<Arc<Archive>>>=Mutex::new(None);
static QUEUE_ID:OnceLock<String>=OnceLock::new();
fn queue_id()->&'static str{QUEUE_ID.get_or_init(||format!("{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos()))}
fn desktop(app:tauri::AppHandle)->Result<Arc<Archive>,String>{
 let mut slot=DESKTOP.lock().map_err(|e|e.to_string())?;
 if let Some(archive)=slot.as_ref(){return Ok(archive.clone());}
 let notifier=app.clone();
 let archive=Arc::new(Archive::new_notifying_batch(Policy::default(),Arc::new(move|units|crate::inspection_files::save_prepared_batch(app.clone(),units)),Some(Arc::new(move||{
  // A hint only: consumers still obtain and validate authoritative receipts.
  let _=notifier.emit("inspection-archive-changed",json!({"queueId":queue_id()}));
 })))?);
 *slot=Some(archive.clone());Ok(archive)
}
pub(crate) fn enqueue_desktop(app:tauri::AppHandle,request:Value)->Result<Value,String>{
 let receipt=desktop(app)?.enqueue_request(request)?;
 let identity=&receipt["identity"];
 Ok(json!({"status":"PENDING","durable":false,"archiveRef":{"kind":"pending-inspection-unit","queueId":queue_id(),"archiveId":receipt["archiveId"],"executionId":identity["executionId"],"unitId":identity["unitId"],"workspaceRoot":identity["workspaceRoot"]},"bytes":receipt["bytes"]}))
}
fn check_reference(reference:&Value)->Result<u64,String>{
 if reference["kind"]!="pending-inspection-unit"||reference["queueId"]!=queue_id(){return Err("ARCHIVE_REFERENCE_EXPIRED".into());}
 reference["archiveId"].as_u64().ok_or("ARCHIVE_REFERENCE_INVALID".into())
}
pub(crate) fn has_unfinished()->bool{
 DESKTOP.lock().map(|slot|slot.as_ref().map(|a|a.shared.state.lock().map(|s|s.entries.values().any(|e|e.status!="SAVED")).unwrap_or(true)).unwrap_or(false)).unwrap_or(true)
}
#[tauri::command]
pub(crate) fn inspection_archive_status(app:tauri::AppHandle)->Result<Value,String>{let mut status=desktop(app)?.status()?;status["queueId"]=json!(queue_id());Ok(status)}
#[tauri::command]
pub(crate) async fn flush_inspection_archive(app:tauri::AppHandle)->Result<Value,String>{tauri::async_runtime::spawn_blocking(move||{let mut status=desktop(app)?.flush(Duration::from_secs(30))?;status["queueId"]=json!(queue_id());Ok(status)}).await.map_err(|e|e.to_string())?}
#[tauri::command]
pub(crate) fn retry_inspection_archive(app:tauri::AppHandle,reference:Value)->Result<(),String>{desktop(app)?.retry(check_reference(&reference)?)}
#[tauri::command]
pub(crate) fn acknowledge_inspection_archive(app:tauri::AppHandle,reference:Value)->Result<(),String>{desktop(app)?.acknowledge(check_reference(&reference)?)}

#[derive(Clone,Copy)]
pub(crate) struct Policy {pub max_items:usize,pub max_bytes:usize,pub batch_items:usize,pub interval:Duration}
impl Default for Policy {fn default()->Self{Self{max_items:32,max_bytes:128*1024*1024,batch_items:8,interval:Duration::from_millis(5)}}}
struct Entry {payload:Option<Arc<PreparedUnit>>,identity:Value,bytes:usize,queued:Instant,status:&'static str,error:Option<String>,receipt:Option<Value>,wait_ms:f64,write_ms:f64,batch:u64,batch_size:usize}
struct State {entries:BTreeMap<u64,Entry>,pending:VecDeque<u64>,bytes:usize,sequence:u64,batch:u64,flush:bool,closed:bool}
struct Shared {state:Mutex<State>,changed:Condvar,policy:Policy,notify:Option<Arc<dyn Fn()+Send+Sync>>}
type Writer=Arc<dyn Fn(&PreparedUnit)->Result<Value,String>+Send+Sync>;
type BatchWriter=Arc<dyn Fn(&[Arc<PreparedUnit>])->Vec<Result<Value,String>>+Send+Sync>;
pub(crate) struct Archive {shared:Arc<Shared>,worker:Mutex<Option<std::thread::JoinHandle<()>>>}
impl Archive {
 pub fn new(policy:Policy,writer:Writer)->Result<Self,String>{
  Self::new_batch(policy,Arc::new(move|units|units.iter().map(|unit|writer(unit)).collect()))
 }
 pub fn new_batch(policy:Policy,writer:BatchWriter)->Result<Self,String>{Self::new_notifying_batch(policy,writer,None)}
 pub fn new_notifying_batch(policy:Policy,writer:BatchWriter,notify:Option<Arc<dyn Fn()+Send+Sync>>)->Result<Self,String>{
  if policy.max_items==0||policy.max_bytes==0||policy.batch_items==0||policy.batch_items>policy.max_items||policy.interval.is_zero(){return Err("ARCHIVE_POLICY_INVALID".into());}
  let shared=Arc::new(Shared{state:Mutex::new(State{entries:BTreeMap::new(),pending:VecDeque::new(),bytes:0,sequence:0,batch:0,flush:false,closed:false}),changed:Condvar::new(),policy,notify});
  let worker_shared=shared.clone();
  let worker=std::thread::Builder::new().name("inspection-archive".into()).spawn(move||work(worker_shared,writer)).map_err(|e|e.to_string())?;
  Ok(Self{shared,worker:Mutex::new(Some(worker))})
 }
 pub fn enqueue(&self,payload:PreparedUnit)->Result<Value,String>{
  let mut state=self.shared.state.lock().map_err(|e|e.to_string())?;
  self.enqueue_locked(&mut state,payload)
 }
 pub fn enqueue_request(&self,request:Value)->Result<Value,String>{
  let mut state=self.shared.state.lock().map_err(|e|e.to_string())?;
  if state.closed{return Err("ARCHIVE_CLOSED".into());}
  if state.entries.len()>=self.shared.policy.max_items{return Err("ARCHIVE_BACKPRESSURE: item limit".into());}
  // Reserve admission under the same lock as completion/accounting. Preparation
  // only leases immutable data and rejects each resource before retaining it.
  let available=self.shared.policy.max_bytes.saturating_sub(state.bytes);
  let payload=PreparedUnit::prepare_bounded(request,available)?;
  self.enqueue_locked(&mut state,payload)
 }
 fn enqueue_locked(&self,state:&mut State,payload:PreparedUnit)->Result<Value,String>{
  if state.closed{return Err("ARCHIVE_CLOSED".into());}
  // Completed receipts also remain bounded until the consumer acknowledges
  // their durable references. Reaching either limit applies explicit backpressure.
  if state.entries.len()>=self.shared.policy.max_items||state.bytes.saturating_add(payload.bytes)>self.shared.policy.max_bytes{return Err("ARCHIVE_BACKPRESSURE: 歸檔佇列已滿，請等待歸檔或處理失敗記錄".into());}
  state.sequence+=1;let id=state.sequence;let identity=payload.identity();let bytes=payload.bytes;
  state.entries.insert(id,Entry{payload:Some(Arc::new(payload)),identity:identity.clone(),bytes,queued:Instant::now(),status:"PENDING",error:None,receipt:None,wait_ms:0.,write_ms:0.,batch:0,batch_size:0});
  state.bytes+=bytes;state.pending.push_back(id);self.shared.changed.notify_all();
  Ok(json!({"status":"PENDING","archiveId":id,"identity":identity,"bytes":bytes,"durable":false}))
 }
 pub fn status(&self)->Result<Value,String>{
  let state=self.shared.state.lock().map_err(|e|e.to_string())?;
  Ok(json!({"items":state.entries.iter().map(|(id,e)|json!({"archiveId":id,"identity":e.identity,"status":e.status,"error":e.error,"receipt":e.receipt,"bytes":e.bytes,"timing":{"queuedToWriteMs":e.wait_ms,"writeMs":e.write_ms,"batchId":e.batch,"batchSize":e.batch_size,"ageMs":e.queued.elapsed().as_secs_f64()*1000.}})).collect::<Vec<_>>(),"pendingBytes":state.bytes,"maxBytes":self.shared.policy.max_bytes,"maxItems":self.shared.policy.max_items}))
 }
 pub fn retry(&self,id:u64)->Result<(),String>{
  let mut state=self.shared.state.lock().map_err(|e|e.to_string())?;
  if state.closed{return Err("ARCHIVE_CLOSED".into());}
  let e=state.entries.get_mut(&id).ok_or("ARCHIVE_NOT_FOUND")?;
  if e.status!="FAILED"{return Err("ARCHIVE_NOT_FAILED".into());}
  e.status="PENDING";e.error=None;state.pending.push_back(id);state.flush=true;self.shared.changed.notify_all();Ok(())
 }
 pub fn acknowledge(&self,id:u64)->Result<(),String>{
  let mut state=self.shared.state.lock().map_err(|e|e.to_string())?;
  // A reply can be lost after removal; retrying that acknowledgement is safe.
  if !state.entries.contains_key(&id)&&id>0&&id<=state.sequence{return Ok(());}
  if state.entries.get(&id).ok_or("ARCHIVE_NOT_FOUND")?.status!="SAVED"{return Err("ARCHIVE_NOT_DURABLE".into());}
  state.entries.remove(&id);Ok(())
 }
 pub fn flush(&self,timeout:Duration)->Result<Value,String>{
  let deadline=Instant::now()+timeout;let mut state=self.shared.state.lock().map_err(|e|e.to_string())?;
  state.flush=true;self.shared.changed.notify_all();
  loop {
   if state.entries.values().any(|e|e.status=="FAILED"){return Err("ARCHIVE_WRITE_FAILED: 待歸檔資料仍保留，請重試".into());}
   if !state.entries.values().any(|e|matches!(e.status,"PENDING"|"WRITING")){drop(state);return self.status();}
   let remaining=deadline.saturating_duration_since(Instant::now());if remaining.is_zero(){return Err("ARCHIVE_DRAIN_TIMEOUT".into());}
   state=self.shared.changed.wait_timeout(state,remaining).map_err(|e|e.to_string())?.0;
  }
 }
 pub fn snapshot(&self,id:u64)->Result<Value,String>{
  let payload=self.shared.state.lock().map_err(|e|e.to_string())?.entries.get(&id).ok_or("ARCHIVE_NOT_FOUND")?.payload.clone().ok_or("ARCHIVE_ALREADY_SAVED")?;
  payload.snapshot()
 }
}
fn work(shared:Arc<Shared>,writer:BatchWriter){
 loop {
  let batch={
   let mut state=shared.state.lock().unwrap();
   loop {
    if state.closed{return;}
    let age=state.pending.front().and_then(|id|state.entries.get(id)).map(|e|e.queued.elapsed()).unwrap_or_default();
    if !state.pending.is_empty()&&(state.flush||state.pending.len()>=shared.policy.batch_items||age>=shared.policy.interval){break;}
    // Idle queues sleep until admission/close. A short coalescing window must
    // not turn an empty archive into a periodic polling thread.
    state=if state.pending.is_empty(){shared.changed.wait(state).unwrap()}
      else{shared.changed.wait_timeout(state,shared.policy.interval.saturating_sub(age)).unwrap().0};
   }
   state.batch+=1;let batch_id=state.batch;let draining=state.flush;state.flush=false;let mut batch=Vec::new();
   // A batch owns immutable leases, while enqueue/status/cancel stay responsive.
   let batch_size=state.pending.len().min(shared.policy.batch_items);
   for _ in 0..batch_size {let Some(id)=state.pending.pop_front() else{break};let e=state.entries.get_mut(&id).unwrap();e.status="WRITING";e.wait_ms=e.queued.elapsed().as_secs_f64()*1000.;e.batch=batch_id;e.batch_size=batch_size;batch.push((id,e.payload.as_ref().unwrap().clone()));}
   state.flush=draining&&!state.pending.is_empty();
   batch
  };
  let payloads:Vec<_>=batch.iter().map(|(_,payload)|payload.clone()).collect();
  let started=Instant::now();
  let mut outcomes=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||writer(&payloads)))
   .unwrap_or_else(|_|payloads.iter().map(|_|Err("ARCHIVE_WRITER_PANICKED".into())).collect());
  let write_ms=started.elapsed().as_secs_f64()*1000.;
  if outcomes.len()!=batch.len(){outcomes=payloads.iter().map(|_|Err("ARCHIVE_BATCH_RECEIPT_COUNT_INVALID".into())).collect();}
  let ids:Vec<_>=batch.iter().map(|(id,_)|*id).collect();
  // Release worker leases before returning any bytes to the admission budget.
  drop(payloads);drop(batch);
  for (id,outcome) in ids.into_iter().zip(outcomes) {
   let mut state=shared.state.lock().unwrap();let e=state.entries.get_mut(&id).unwrap();e.write_ms=write_ms;
   match outcome {
    Ok(receipt) if receipt["status"]=="SAVED"&&receipt["recordRef"]["executionId"]==e.identity["executionId"]&&receipt["recordRef"]["unitId"]==e.identity["unitId"]=>{
     e.status="SAVED";e.receipt=Some(receipt);e.payload=None;let bytes=e.bytes;state.bytes-=bytes;
    },
    Ok(_)=>{e.status="FAILED";e.error=Some("ARCHIVE_RECEIPT_IDENTITY_INVALID".into());},
    Err(error)=>{e.status="FAILED";e.error=Some(error);},
   }
   shared.changed.notify_all();
  }
  // All receipts are terminal and the state lock has been released. Failed
  // notification delivery never changes durability or kills the writer.
  if let Some(notify)=&shared.notify{let _=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||notify()));}
 }
}
impl Drop for Archive {fn drop(&mut self){
 // Production close must explicitly flush and handle errors before app exit.
 if let Ok(mut state)=self.shared.state.lock(){state.closed=true;self.shared.changed.notify_all();}
 if let Ok(worker)=self.worker.get_mut(){if let Some(worker)=worker.take(){let _=worker.join();}}
}}

#[cfg(test)]
mod tests {
 use super::*;
 use std::sync::atomic::{AtomicBool,AtomicUsize,Ordering};
 fn unit(id:&str)->PreparedUnit{PreparedUnit::prepare(json!({"executionId":"actual-execution","unit":{"id":id},"runs":[]})).unwrap()}
 fn saved(unit:&PreparedUnit)->Value{let identity=unit.identity();json!({"status":"SAVED","recordRef":{"executionId":identity["executionId"],"unitId":identity["unitId"],"sha256":"exact"}})}
 #[test]
 fn default_single_unit_writes_without_waiting_for_another_image_or_flush(){
  let (send,receive)=std::sync::mpsc::channel();
  let archive=Archive::new(Policy::default(),Arc::new(move|unit|{send.send(()).unwrap();Ok(saved(unit))})).unwrap();
  let admitted=archive.enqueue(unit("single")).unwrap();assert_eq!(admitted["durable"],false);
  receive.recv_timeout(Duration::from_millis(200)).expect("single-image archival remained deferred");
  let status=archive.flush(Duration::from_secs(2)).unwrap();assert_eq!(status["items"][0]["status"],"SAVED");
 }
 fn policy()->Policy{Policy{max_items:4,max_bytes:1024*1024,batch_items:2,interval:Duration::from_secs(60)}}
 #[test]
 fn count_flush_and_explicit_flush_do_not_acknowledge_until_writer_finishes(){
  let (send,receive)=std::sync::mpsc::channel();let (release,wait)=std::sync::mpsc::channel();let wait=Mutex::new(wait);
  let archive=Archive::new(policy(),Arc::new(move|unit|{send.send(()).unwrap();wait.lock().unwrap().recv().unwrap();Ok(saved(unit))})).unwrap();
  let first=archive.enqueue(unit("one")).unwrap();assert_eq!(first["status"],"PENDING");assert_eq!(first["durable"],false);
  archive.enqueue(unit("two")).unwrap();receive.recv_timeout(Duration::from_secs(2)).unwrap();
  assert!(archive.status().unwrap()["items"].as_array().unwrap().iter().all(|e|e["receipt"].is_null()));
  release.send(()).unwrap();receive.recv_timeout(Duration::from_secs(2)).unwrap();release.send(()).unwrap();
  let status=archive.flush(Duration::from_secs(2)).unwrap();assert!(status["items"].as_array().unwrap().iter().all(|e|e["status"]=="SAVED"));assert_eq!(status["pendingBytes"],0);
  assert_eq!(archive.snapshot(first["archiveId"].as_u64().unwrap()).unwrap_err(),"ARCHIVE_ALREADY_SAVED");
  archive.acknowledge(first["archiveId"].as_u64().unwrap()).unwrap();
  archive.acknowledge(first["archiveId"].as_u64().unwrap()).unwrap();
  assert!(archive.acknowledge(99999).is_err());
 }
 #[test]
 fn timer_manual_flush_failure_retry_and_bounded_receipts(){
  let calls=Arc::new(AtomicUsize::new(0));let failed=Arc::new(AtomicBool::new(true));let c=calls.clone();let f=failed.clone();
  let mut p=policy();p.interval=Duration::from_millis(20);
  let archive=Archive::new(p,Arc::new(move|unit|{c.fetch_add(1,Ordering::SeqCst);if f.load(Ordering::SeqCst){Err("actual I/O error".into())}else{Ok(saved(unit))}})).unwrap();
  let receipt=archive.enqueue(unit("one")).unwrap();let id=receipt["archiveId"].as_u64().unwrap();
  // Wait on an actual queue event, with a deadline; no repeated workload execution.
  {let state=archive.shared.state.lock().unwrap();let (_state,timeout)=archive.shared.changed.wait_timeout_while(state,Duration::from_secs(2),|s|s.entries[&id].status!="FAILED").unwrap();assert!(!timeout.timed_out());}
  assert!(archive.flush(Duration::from_secs(1)).unwrap_err().starts_with("ARCHIVE_WRITE_FAILED"));
  assert_eq!(archive.snapshot(id).unwrap()["unit"]["id"],"one");assert!(archive.acknowledge(id).is_err());
  failed.store(false,Ordering::SeqCst);archive.retry(id).unwrap();archive.flush(Duration::from_secs(2)).unwrap();assert_eq!(calls.load(Ordering::SeqCst),2);
  for id in ["two","three","four"]{archive.enqueue(unit(id)).unwrap();}
  assert!(archive.enqueue(unit("five")).unwrap_err().starts_with("ARCHIVE_BACKPRESSURE"));archive.flush(Duration::from_secs(2)).unwrap();
  archive.acknowledge(id).unwrap();archive.enqueue(unit("five")).unwrap();archive.flush(Duration::from_secs(2)).unwrap();
 }
 #[test]
 fn byte_budget_and_wrong_identity_are_hard_failures(){
  let mut p=policy();p.max_bytes=1;
  let archive=Archive::new(p,Arc::new(|unit|Ok(saved(unit)))).unwrap();assert!(archive.enqueue(unit("one")).is_err());
  let archive=Archive::new(policy(),Arc::new(|_|Ok(json!({"status":"SAVED","recordRef":{"executionId":"other","unitId":"one"}})))).unwrap();
  archive.enqueue(unit("one")).unwrap();assert!(archive.flush(Duration::from_secs(2)).is_err());assert_eq!(archive.status().unwrap()["items"][0]["status"],"FAILED");
 }
 #[test]
 fn admission_rejects_before_leasing_and_batch_worker_invokes_one_writer(){
  let calls=Arc::new(AtomicUsize::new(0));let c=calls.clone();
  let archive=Archive::new_batch(policy(),Arc::new(move|units|{c.fetch_add(1,Ordering::SeqCst);assert_eq!(units.len(),2);units.iter().map(|u|Ok(saved(u))).collect()})).unwrap();
  for id in ["one","two"]{archive.enqueue_request(json!({"executionId":"actual-execution","unit":{"id":id},"runs":[]})).unwrap();}
  archive.flush(Duration::from_secs(2)).unwrap();assert_eq!(calls.load(Ordering::SeqCst),1);
  let mut p=policy();p.max_bytes=1;
  let archive=Archive::new(p,Arc::new(|u|Ok(saved(u)))).unwrap();
  assert!(archive.enqueue_request(json!({"executionId":"actual-execution","unit":{"id":"one"},"runs":[]})).unwrap_err().starts_with("ARCHIVE_BACKPRESSURE"));
  assert_eq!(archive.status().unwrap()["pendingBytes"],0);
 }
 #[test]
 fn completion_hints_follow_terminal_receipts_for_success_and_failure(){
  for fail in [false,true]{
   let (send,receive)=std::sync::mpsc::channel();let writer_done=Arc::new(AtomicBool::new(false));let in_writer=writer_done.clone();
   let archive=Archive::new_notifying_batch(Policy::default(),Arc::new(move|units|{let result=units.iter().map(|u|if fail{Err("disk failure".into())}else{Ok(saved(u))}).collect();in_writer.store(true,Ordering::Release);result}),Some(Arc::new(move||{assert!(writer_done.load(Ordering::Acquire));send.send(()).unwrap();}))).unwrap();
   archive.enqueue(unit("notified")).unwrap();receive.recv_timeout(Duration::from_secs(2)).expect("missing completion hint");
   let status=archive.status().unwrap();assert_eq!(status["items"][0]["status"],if fail{"FAILED"}else{"SAVED"});
   if fail{assert_eq!(status["items"][0]["error"],"disk failure");}else{assert_eq!(status["items"][0]["receipt"]["recordRef"]["unitId"],"notified");}
  }
 }

}
