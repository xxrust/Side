//! Commit the actual native workpiece before returning it to the browser.
//! Browser verification/publication happens later and cannot be claimed here.
use serde_json::{json, Value, Map};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
pub const BACKEND: &str = "rust-native-commit-v1";
fn list(v:&Value)->&[Value]{v.as_array().map(Vec::as_slice).unwrap_or(&[])}
pub fn validate(request:&Value)->Result<(),String>{
 let Some(commit)=request.get("commit") else{return Ok(())};
 if !commit.is_object()||commit["backend"]!=BACKEND||request["runEnvelopeBackend"]!=crate::inspection_run::BACKEND
  ||request["evidenceAuditBackend"]!=crate::inspection_evidence::BACKEND||!request["productContext"].is_object()
  ||!request["scheme"]["classificationSpec"].is_object(){return Err("SESSION_COMMIT_CONTEXT_INVALID".into());}
 let unit=&commit["unit"];let shared=&request["shared"]["workpieceUnit"];
 if !unit.is_object()||unit["id"]!=request["unitId"]||unit["imageIds"]!=shared["imageIds"]||unit["views"]!=shared["views"]{
  return Err("SESSION_COMMIT_UNIT_MISMATCH".into());
 }
 if commit.get("workspaceRoot").is_some_and(|v|!v.is_null()&&!v.is_string())
  ||commit.get("cleanupRuntime").is_some_and(|v|!v.is_boolean())
  ||commit.get("mode").is_some_and(|v|v!="background"&&v!="synchronous"){return Err("SESSION_COMMIT_DESTINATION_INVALID".into());}
 Ok(())
}
// UTC civil date conversion; no process launch or locale-dependent formatting.
pub fn timestamp(ms:u128)->String{
 let seconds=(ms/1000) as i64;let z=seconds/86400+719468;let era=z/146097;let doe=z-era*146097;
 let yoe=(doe-doe/1460+doe/36524-doe/146096)/365;let mut y=yoe+era*400;
 let doy=doe-(365*yoe+yoe/4-yoe/100);let mp=(5*doy+2)/153;let d=doy-(153*mp+2)/5+1;let m=mp+if mp<10{3}else{-9};
 y+=i64::from(m<=2);let day=seconds%86400;
 format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z",day/3600,day/60%60,day%60,ms%1000)
}
fn clean(value:&Value)->Value{
 match value{
  Value::Array(a)=>Value::Array(a.iter().map(clean).collect()),
  Value::Object(o)=>Value::Object(o.iter().filter(|(k,_)|!["dataURL","dataUrl","base64"].contains(&k.as_str())).map(|(k,v)|(k.clone(),clean(v))).collect()),
  _=>value.clone(),
 }
}
fn durable_run(run:&Value,retention:&Value)->Result<Value,String>{
 let reference=run["nativeFactRef"].is_object();
 let fact_fields=list(&run["nativeFactFields"]);
 let mut out=Map::new();
 for (key,value) in run.as_object().ok_or("SESSION_RUN_INVALID")?{
  if key=="runtimeInputResources"||["nativeEvidenceAuditParityChecked","nativeRunEnvelopeParityChecked"].contains(&key.as_str())
   ||reference&&fact_fields.iter().any(|field|field.as_str()==Some(key)){continue;}
  if key=="artifacts"{
   let artifacts=list(value).iter().map(|artifact|{
    let image=artifact["type"]=="image";let keep=retention["keepPixels"]==true;
    let bytes=artifact["type"]=="json"&&artifact["memoryRef"]["kind"]=="runtime-memory"&&artifact.get("data").is_some();
    let mut a=Map::new();
    for (key,value) in artifact.as_object().ok_or("SESSION_ARTIFACT_INVALID")?{
     if bytes&&key=="data"||image&&!keep&&["data","dataUrl","dataURL","path","assetRef"].contains(&key.as_str()){continue;}
     if ["dataURL","dataUrl","base64"].contains(&key.as_str()){continue;}
     a.insert(key.clone(),clean(value));
    }
    if bytes{a.insert("dataStorage".into(),json!("artifact-bytes"));}
    if image{
     a.insert("pixelRetention".into(),json!(if keep{"full"}else{"metadata-only"}));
     if !keep{a.insert("pixelAvailable".into(),json!(false));a.insert("retentionReason".into(),retention["reason"].clone());}
     // An inline-only native image must not lose its sole pixel source.
     else if !crate::inspection_product::truthy(&artifact["path"])&&!crate::inspection_product::truthy(&artifact["assetRef"]){
      if let Some(url)=artifact.get("dataURL").filter(|v|crate::inspection_product::truthy(v)).or_else(||artifact.get("dataUrl").filter(|v|crate::inspection_product::truthy(v))){a.insert("dataURL".into(),url.clone());}
      else if artifact["memoryRef"].is_null(){return Err("SESSION_IMAGE_PIXELS_UNAVAILABLE".into());}
     }
    }
    Ok(Value::Object(a))
   }).collect::<Result<Vec<_>,String>>()?;
   out.insert(key.clone(),Value::Array(artifacts));
  }else if key=="timing"{
   let mut timing=clean(value);
   if let Some(object)=timing.as_object_mut(){object.remove("hostPhases");}
   out.insert(key.clone(),timing);
  }else{out.insert(key.clone(),clean(value));}
 }
 Ok(Value::Object(out))
}
pub fn product(request:&Value,session:&Value,native_ms:f64,at:&str)->Result<Value,String>{
 validate(request)?;
 let decision=&session["decision"];let policy=&decision["product"];let faults=&decision["faults"];let cancelled=decision["cancelled"]==true;
 if policy["backend"]!="rust-native-product-v1"||!decision["result"].is_object(){return Err("SESSION_COMMIT_DECISION_REQUIRED".into());}
 let runs=list(&session["runs"]);
 let mut record=policy["recordFields"].clone();
 record["execution"]=json!({"status":if cancelled{"CANCELLED"}else if list(faults).is_empty(){"COMPLETED"}else{"FAULT"},"faults":faults});
 record["result"]=decision["result"].clone();record["observations"]=decision["observations"].clone();record["nodeStates"]=session["nodeStates"].clone();
 record["evidenceReady"]=json!(!runs.is_empty()&&!cancelled&&list(faults).is_empty()&&runs.iter().all(|r|r["evidenceAudit"]["status"]=="READY_FOR_REVIEW"&&r["evidenceAudit"]["procedureStatus"]=="READY_FOR_REVIEW"));
 record["decisionEvidence"]=decision["decisionEvidence"].clone();record["artifactRetention"]=policy["retention"].clone();
 record["timing"]=json!({"clock":"monotonic","totalMs":native_ms,"scope":"native session start through terminal decision; excludes queue, frontend input preparation, durable commit and browser import/presentation","includes":["native-preparation","node-dispatch","algorithm","artifact-verification","native-decision"],"excludes":["durable-save","browser-import","post-unit-presentation","Agent-planning"]});
 record["at"]=json!(at);record["nativeCommit"]=json!({"backend":BACKEND,"sessionId":request["sessionId"],"verificationScope":"native-before-browser-import","terminalStatus":record["execution"]["status"]});
 let mut context=json!({"schemeFingerprint":request["fingerprint"]});
 if request["productContext"]["unitIndex"]==0{context["scheme"]=request["scheme"].clone();}
 let mut product=json!({"executionId":request["executionId"],"unit":request["commit"]["unit"],"record":record,"context":context,
  "cleanupRuntime":request["commit"]["cleanupRuntime"].as_bool().unwrap_or(false)});
 if let Some(root)=request["commit"].get("workspaceRoot"){product["workspaceRoot"]=root.clone();}
 product["runs"]=Value::Array(runs.iter().map(|run|durable_run(run,&policy["retention"])).collect::<Result<Vec<_>,_>>()?);
 Ok(product)
}
pub fn execute(request:&Value,session:&mut Value,native_ms:f64,mut save:impl FnMut(Value)->Result<Value,String>)->Result<(),String>{
 if request.get("commit").is_none(){return Ok(())}
 let start=Instant::now();let at=timestamp(SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e|e.to_string())?.as_millis());
 let product=product(request,session,native_ms,&at)?;let record=product["record"].clone();let prepared=start.elapsed().as_secs_f64()*1000.;
 let receipt=save(product)?;
 let deferred=request["commit"]["mode"]=="background";
 let reference=if deferred{&receipt["archiveRef"]}else{&receipt["recordRef"]};
 if (if deferred{receipt["status"]!="PENDING"||receipt["durable"]!=false||reference["kind"]!="pending-inspection-unit"||!reference["queueId"].is_string()||!reference["archiveId"].is_u64()}else{receipt["status"]!="SAVED"})
  ||reference["executionId"]!=request["executionId"]||reference["unitId"]!=request["unitId"]{
  return Err("SESSION_COMMIT_ACKNOWLEDGEMENT_INVALID".into());
 }
 session["commit"]=json!({"backend":BACKEND,"mode":if deferred{"background"}else{"synchronous"},"record":record,"receipt":receipt,"timing":{"clock":"monotonic","preparationMs":prepared,"totalMs":start.elapsed().as_secs_f64()*1000.,"scope":if deferred{"native product construction and owned queue admission; excludes background persistence; nested in session nativeMs"}else{"native product construction and acknowledged persistence; nested in session nativeMs"}}});
 Ok(())
}

#[cfg(test)]
mod tests{
 use super::*;
 use std::cell::{Cell,RefCell};
 fn request()->Value{
  let node=json!({"id":"actual","code":"unchanged algorithm","parameters":{},"expected_outputs":[{"id":"data","type":"evidence"}]});
  json!({"sessionId":"actual-session","executionId":"actual-execution","unitId":"actual-unit","fingerprint":"actual-scheme",
   "runEnvelopeBackend":crate::inspection_run::BACKEND,"evidenceAuditBackend":crate::inspection_evidence::BACKEND,
   "commit":{"backend":BACKEND,"unit":{"id":"actual-unit","imageIds":["original"],"operatorNote":"retain this unit metadata"}},
   "shared":{"sourceBinding":{"images":[{"imageId":"original"}]},"images":[],"workpieceUnit":{"id":"actual-unit","imageIds":["original"]},"referenceInputs":{},"inputContext":{},"compilation":{"ok":true}},
   "productContext":{"expectedResolution":{},"referenceIdentities":{},"regressionCategoryIds":["GOOD"],"retention":crate::inspection_product::normalize_retention(&json!({"mode":"metadata"})),"unitIndex":0,"total":1},
   "scheme":{"operatorGraph":{"nodes":[node],"edges":[]},"classificationSpec":{"metrics":[],"categories":[{"id":"GOOD","quality":"good"}],"rules":[],"coverage":{"policy":"fallback","fallbackCategoryId":"GOOD"},"aggregation":{"mode":"priority","priority":["GOOD"]}}},
   "nodes":[{"nodeId":"actual","request":{"mode":"scheme","title":"Actual node","code":node["code"],"parameters":{},"expectedOutputs":node["expected_outputs"],"visualEvidence":[],"proposalAudit":{"valid":true}}}]})
 }
 fn observed()->Value{json!({"runId":"actual-run","status":"SUCCEEDED","execution":{"status":"COMPLETED"},"timing":{"native":{}},"result":{"actual":3},"artifacts":[{"id":"data","type":"json","data":{"actual":3}}]})}
 fn ack()->Value{json!({"status":"SAVED","recordRef":{"executionId":"actual-execution","unitId":"actual-unit","sha256":"actual-hash"}})}
 #[test]
 fn native_commit_preserves_terminal_state_when_stop_arrives_inside_save(){
  let stopped=Cell::new(false);let saved=RefCell::new(Value::Null);let events=RefCell::new(Vec::new());
  let result=crate::inspection_service::execute_with_commit(request(),|_|Ok(observed()),||stopped.get(),|e|events.borrow_mut().push(e),|product|{
   assert_eq!(product["record"]["execution"]["status"],"COMPLETED");stopped.set(true);*saved.borrow_mut()=product;Ok(ack())
  }).unwrap();
  assert!(stopped.get());assert_eq!(result["decision"]["cancelled"],false);
  assert_eq!(result["commit"]["record"],saved.borrow()["record"]);
  assert_eq!(saved.borrow()["unit"]["operatorNote"],"retain this unit metadata");
  assert!(saved.borrow()["runs"][0].get("nativeRunEnvelopeParityChecked").is_none());
  assert!(saved.borrow()["runs"][0]["timing"].get("hostPhases").is_none());
  assert_eq!(events.borrow().last().unwrap()["phase"],"session-completed");
 }
 #[test]
 fn cancellation_before_and_during_execution_is_committed_as_cancelled(){
  for during_node in [false,true]{
   let stopped=Cell::new(!during_node);let calls=Cell::new(0);
   let result=crate::inspection_service::execute_with_commit(request(),|_|{calls.set(calls.get()+1);stopped.set(true);Ok(observed())},||stopped.get(),|_|{},|product|{
    assert_eq!(product["record"]["execution"]["status"],"CANCELLED");assert_eq!(product["runs"].as_array().unwrap().len(),usize::from(during_node));Ok(ack())
   }).unwrap();
   assert_eq!(calls.get(),usize::from(during_node));assert_eq!(result["decision"]["cancelled"],true);
  }
 }
 #[test]
 fn save_failure_or_wrong_receipt_cannot_emit_success_or_return_a_commit(){
  for wrong_receipt in [false,true]{
   let events=RefCell::new(Vec::new());
   let error=crate::inspection_service::execute_with_commit(request(),|_|Ok(observed()),||false,|e|events.borrow_mut().push(e),|_|{
    if wrong_receipt{let mut receipt=ack();receipt["recordRef"]["unitId"]=json!("other-unit");Ok(receipt)}else{Err("ACTUAL_WRITE_FAILURE".into())}
   }).unwrap_err();
   assert_eq!(error,if wrong_receipt{"SESSION_COMMIT_ACKNOWLEDGEMENT_INVALID"}else{"ACTUAL_WRITE_FAILURE"});
   assert!(events.borrow().iter().all(|e|e["phase"]!="session-completed"));
  }
  let mut bad=request();bad["commit"]["unit"]["imageIds"]=json!(["another-original"]);
  assert_eq!(crate::inspection_service::execute_with_commit(bad,|_|panic!("must reject before dispatch"),||false,|_|{},|_|panic!("must not save")).unwrap_err(),"SESSION_COMMIT_UNIT_MISMATCH");
 }
 #[test]
 fn utc_timestamps_match_epoch_and_leap_day(){
  assert_eq!(timestamp(0),"1970-01-01T00:00:00.000Z");
  assert_eq!(timestamp(946684800123),"2000-01-01T00:00:00.123Z");
  assert_eq!(timestamp(1709164800000),"2024-02-29T00:00:00.000Z");
 }
 #[test]
 fn background_admission_is_pending_and_cannot_masquerade_as_durable_save(){
  let mut request=request();request["commit"]["mode"]=json!("background");
  let pending=json!({"status":"PENDING","durable":false,"archiveRef":{"kind":"pending-inspection-unit","queueId":"actual-process","archiveId":1,"executionId":"actual-execution","unitId":"actual-unit"}});
  let result=crate::inspection_service::execute_with_commit(request.clone(),|_|Ok(observed()),||false,|_|{},|_|Ok(pending.clone())).unwrap();
  assert_eq!(result["commit"]["receipt"]["status"],"PENDING");assert!(result["commit"]["receipt"].get("recordRef").is_none());
  assert_eq!(result["decision"]["cancelled"],false);
  for bad in [ack(),{let mut p=pending.clone();p["durable"]=json!(true);p},{let mut p=pending.clone();p["archiveRef"]["unitId"]=json!("other");p}]{
   assert_eq!(crate::inspection_service::execute_with_commit(request.clone(),|_|Ok(observed()),||false,|_|{},|_|Ok(bad.clone())).unwrap_err(),"SESSION_COMMIT_ACKNOWLEDGEMENT_INVALID");
  }
 }
 #[test]
 fn speculative_preview_precedes_commit_but_cannot_announce_a_failed_save_as_complete(){
  let mut request=request();request["previewNodeId"]=json!("actual");
  let src=format!("http://agentcv-memory.localhost/{}","a".repeat(64));
  let mut run=observed();run["artifacts"].as_array_mut().unwrap().push(json!({"id":"overlay","type":"image","dataUrl":src,"width":1280,"height":1024}));
  let events=RefCell::new(Vec::new());
  let error=crate::inspection_service::execute_with_commit(request,|_|Ok(run.clone()),||false,|e|events.borrow_mut().push(e),|_|{
   let events=events.borrow();let preview=events.iter().find(|e|e["phase"]=="preview-ready").unwrap();
   assert_eq!(preview["previews"][0]["src"],src);assert_eq!(preview["unitId"],"actual-unit");assert_eq!(preview["previews"][0]["nodeId"],"actual");
   Err("ACTUAL_SAVE_FAILURE".into())
  }).unwrap_err();
  assert_eq!(error,"ACTUAL_SAVE_FAILURE");assert!(events.borrow().iter().all(|e|e["phase"]!="session-completed"));
 }
 #[test]
 fn durable_run_rejects_future_browser_observations_even_when_extension_supplies_them(){
  let mut run=observed();
  run["nativeRunEnvelopeParityChecked"]=json!(true);
  run["nativeEvidenceAuditParityChecked"]=json!(true);
  run["timing"]=json!({"hostPhases":{"publishMs":999},"native":{"processMs":3},"program":{"algorithmMs":2}});
  let saved=durable_run(&run,&json!({"keepPixels":false})).unwrap();
  assert!(saved.get("nativeRunEnvelopeParityChecked").is_none());
  assert!(saved.get("nativeEvidenceAuditParityChecked").is_none());
  assert!(saved["timing"].get("hostPhases").is_none());
  assert_eq!(saved["timing"]["native"],run["timing"]["native"]);
  assert_eq!(saved["timing"]["program"],run["timing"]["program"]);
 }
}
