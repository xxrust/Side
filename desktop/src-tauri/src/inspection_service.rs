//! A whole workpiece is one native call. The UI observes progress but is never
//! awaited between nodes. Extension supervision and byte verification remain
//! the same services used by individual algorithm calls.
use serde_json::{json, Value};
use std::{collections::BTreeMap, sync::{Arc,Mutex,atomic::{AtomicBool,Ordering}}, time::Instant};

static ACTIVE: Mutex<BTreeMap<String,Arc<AtomicBool>>> = Mutex::new(BTreeMap::new());
pub struct Registration { id:String, pub cancelled:Arc<AtomicBool> }
impl Drop for Registration { fn drop(&mut self){if let Ok(mut active)=ACTIVE.lock(){active.remove(&self.id);}} }
pub fn register(id:&str)->Result<Registration,String>{
 if id.is_empty()||id.len()>160||!id.bytes().all(|b|b.is_ascii_alphanumeric()||b"-_.".contains(&b)){return Err("SESSION_ID_INVALID".into());}
 let mut active=ACTIVE.lock().map_err(|e|e.to_string())?;
 if active.len()>=8||active.contains_key(id){return Err("SESSION_BUSY".into());}
 let cancelled=Arc::new(AtomicBool::new(false));active.insert(id.into(),cancelled.clone());
 Ok(Registration{id:id.into(),cancelled})
}
pub fn cancel(id:&str)->Result<bool,String>{
 let active=ACTIVE.lock().map_err(|e|e.to_string())?;
 if let Some(flag)=active.get(id){flag.store(true,Ordering::Release);Ok(true)}else{Ok(false)}
}

pub fn execute(request:Value, extension:impl FnMut(Value)->Result<Value,String>,
 cancelled:impl Fn()->bool,publish:impl FnMut(Value))->Result<Value,String>{
 execute_with_commit(request,extension,cancelled,publish,|_|Err("SESSION_COMMIT_UNAVAILABLE".into()))
}
pub fn execute_with_commit(request:Value, mut extension:impl FnMut(Value)->Result<Value,String>,
 cancelled:impl Fn()->bool,mut publish:impl FnMut(Value),save:impl FnMut(Value)->Result<Value,String>)->Result<Value,String>{
 let started=Instant::now();
 crate::inspection_product::validate_context(&request)?;
 crate::inspection_run::validate(&request)?;
 crate::inspection_commit::validate(&request)?;
 if request.get("evidenceAuditBackend").is_some_and(|v|v!=crate::inspection_evidence::BACKEND){return Err("SESSION_EVIDENCE_BACKEND_INVALID".into());}
 let scheme=&request["scheme"];let graph=crate::inspection_session::Graph::compile(scheme)?;
 let definitions=scheme["operatorGraph"]["nodes"].as_array().ok_or("SESSION_NODES_REQUIRED")?;
 let node_requests=request["nodes"].as_array().ok_or("SESSION_REQUESTS_REQUIRED")?;
 if node_requests.len()!=definitions.len(){return Err("SESSION_REQUEST_COUNT_MISMATCH".into());}
 let mut prepared=BTreeMap::new();
 for node_request in node_requests{
  let id=node_request["nodeId"].as_str().ok_or("SESSION_NODE_ID_REQUIRED")?;
  let node=definitions.iter().find(|n|n["id"]==id).ok_or("SESSION_NODE_UNKNOWN")?;
  let r=&node_request["request"];
  if request.get("evidenceAuditBackend").is_some() && node["expected_outputs"].as_array().is_none_or(|outputs|outputs.iter().any(|o|o.get("dataContract").is_some_and(|c|crate::inspection_product::truthy(c)&&!crate::output_contract::valid_definition(c)))){
   return Err("SESSION_EVIDENCE_CONTRACT_INVALID".into());
  }
  if !r.is_object()||prepared.insert(id,r).is_some(){return Err("SESSION_DUPLICATE_REQUEST".into());}
  if ["images","sourceBinding","workpieceUnit","referenceInputs","inputContext","compilation","runtimePlan","upstream"].iter().any(|key|r.get(*key).is_some()){return Err("SESSION_SHARED_OVERRIDE".into());}
  if r["mode"]!="scheme"||r["code"]!=node["code"]||r["parameters"]!=node["parameters"]||r["expectedOutputs"]!=node["expected_outputs"]
   ||r["nativePipeline"].is_object() != node["nativePlan"].is_object()
   ||r["nativePipeline"].is_object()&&r["nativePipeline"]["plan"]!=*node["nativePlan"].get("plan").unwrap_or(&node["nativePlan"]){return Err("SESSION_NODE_DEFINITION_MISMATCH".into());}
 }
 let shared=request["shared"].as_object().ok_or("SESSION_SHARED_REQUIRED")?;
 if !shared.get("sourceBinding").is_some_and(Value::is_object)||!shared.get("images").is_some_and(Value::is_array)
  ||shared.get("workpieceUnit").and_then(|u|u["id"].as_str())!=request["unitId"].as_str(){return Err("SESSION_SOURCE_INVALID".into());}
 let mut sequence=0u64;
 let mut emit=|event:Value|{sequence+=1;let mut event=event;event["sessionId"]=request["sessionId"].clone();event["executionId"]=request["executionId"].clone();event["unitId"]=request["unitId"].clone();event["sequence"]=json!(sequence);publish(event);};
 emit(json!({"phase":"session-started"}));
 let mut token:Option<Value>=None;let mut originals:BTreeMap<String,Value>=BTreeMap::new();let mut durations=BTreeMap::new();
 let mut result=graph.run(|node,upstream|{
  let node_start=Instant::now();let id=node["id"].as_str().unwrap();
  let mut r=Value::Object(shared.clone());
  r.as_object_mut().unwrap().remove("compilation");
  r.as_object_mut().unwrap().extend(prepared[id].as_object().unwrap().clone());
  r["upstream"]=upstream.clone();
  r["runtimePlan"]=json!({"fingerprint":request["fingerprint"],"nodeId":id});
  // Repeating the same image is a new execution, not the same retention group.
  // All nodes in this session share ownership, while old sessions can expire.
  r["runtimeSessionId"]=request["sessionId"].clone();
  if let Some(token)=&token{r["runtimePlan"]["token"]=token.clone();}else{r["runtimePlan"]["definition"]=scheme.clone();}
  for image in r["images"].as_array_mut().ok_or("SESSION_IMAGES_REQUIRED")?{
   if let Some(reference)=image["id"].as_str().and_then(|id|originals.get(id)){image["runtimeInput"]=reference.clone();}
  }
  let mut run=if r["nativePipeline"].is_object(){execute_native(&r)?}else{extension(r)?};
  if let Some(saved)=run.get("runtimePlanToken"){token=Some(saved.clone());}
  if let Some(resources)=run["runtimeInputResources"].as_array(){for reference in resources{if let Some(id)=reference["imageId"].as_str(){originals.insert(id.to_owned(),reference.clone());}}}
  run["schemeNodeId"]=json!(id);run["workpieceUnit"]=shared["workpieceUnit"].clone();run["referenceInputs"]=shared.get("referenceInputs").cloned().unwrap_or(Value::Null);
  if request.get("runEnvelopeBackend").is_some(){
   let envelope_started=Instant::now();
   crate::inspection_run::assemble(&mut run,prepared[id],&request["shared"],id)?;
   run["timing"]["native"]["runEnvelopeMs"]=json!(envelope_started.elapsed().as_secs_f64()*1000.);
  }
  let audit=crate::output_contract::audit(&run,node["expected_outputs"].as_array().ok_or("SESSION_OUTPUTS_REQUIRED")?,scheme,upstream);
  if audit["valid"]==false&&run["execution"]["status"]!="FAULT"{run["execution"]=json!({"status":"FAULT","reason":"OUTPUT_CONTRACT_VIOLATION","errors":audit["errors"]});}
  if audit["valid"]==true{if let Some(artifacts)=run["artifacts"].as_array_mut(){for artifact in artifacts{if let Some(binding)=artifact["id"].as_str().and_then(|id|audit["bindings"].get(id)){artifact["contractBinding"]=binding.clone();}}}}
  run["dataContractAudit"]=audit;
  if request.get("evidenceAuditBackend").is_some(){
   let audit_started=Instant::now();
   // These are the authored inputs used by the ordinary frontend import, not
   // fields the extension may substitute in its observed runtime response.
   for key in ["parameters","justification"]{if let Some(value)=prepared[id].get(key){run[key]=value.clone();}else{run.as_object_mut().unwrap().remove(key);}}
   run["evidenceVisuals"]=run.get("visualEvidence").filter(|v|crate::inspection_product::truthy(v)).cloned()
    .or_else(||prepared[id].get("visualEvidence").cloned()).unwrap_or(json!([]));
   run["evidenceAudit"]=crate::inspection_evidence::audit(&run,node["expected_outputs"].as_array().unwrap());
   run["nativeEvidenceAuditBackend"]=json!(crate::inspection_evidence::BACKEND);
   run["timing"]["native"]["evidenceAuditMs"]=json!(audit_started.elapsed().as_secs_f64()*1000.);
  }
  let retain_started=Instant::now();
  retain_facts(&mut run)?;
  run["timing"]["native"]["retainedFactsMs"]=json!(retain_started.elapsed().as_secs_f64()*1000.);
  if run["nativeFactRef"].is_object(){run["timing"]["native"]["memoryResources"]=crate::memory_resources::stats()?;}
  let handler_ms=run["timing"]["native"]["totalMs"].clone();
  run["timing"]["native"]["extensionHandlerMs"]=handler_ms;
  run["timing"]["native"]["totalMs"]=json!(node_start.elapsed().as_secs_f64()*1000.);
  durations.insert(id.to_owned(),run["timing"]["native"]["totalMs"].clone());
  Ok(run)
 },||cancelled(),|event|emit(event.clone()));
 let evidence:BTreeMap<String,Value>=result["runs"].as_array().unwrap().iter().filter_map(|run|Some((run["schemeNodeId"].as_str()?.to_owned(),run["evidenceAudit"]["status"].clone()))).collect();
 for state in result["nodeStates"].as_array_mut().unwrap(){if let Some(id)=state["nodeId"].as_str().map(str::to_owned){if let Some(ms)=durations.get(&id){state["durationMs"]=ms.clone();}if let Some(status)=evidence.get(&id).filter(|v|!v.is_null()){state["evidenceStatus"]=status.clone();}}}
 if scheme["classificationSpec"].is_object(){
  let decision_started=Instant::now();
  result["decision"]=crate::inspection_decision::decide(&request,&result,cancelled());
  result["decision"]["backend"]=json!("rust-native");
  if request.get("productContext").is_some(){
   result["decision"]["product"]=crate::inspection_product::finalize(&request,&result,&result["decision"])?;
  }
  result["decision"]["timing"]=json!({"clock":"monotonic","totalMs":decision_started.elapsed().as_secs_f64()*1000.});
 }
 result["sessionId"]=request["sessionId"].clone();result["unitId"]=request["unitId"].clone();result["executionId"]=request["executionId"].clone();
 result["sourceBinding"]=request["shared"]["sourceBinding"].clone();
 // Pixels are immutable and already verified, but a preview event is never a
 // published inspection result. The UI may decode the selected node's pixels
 // while the durable writer works; final identity/parity/save gates still own
 // adoption. No user program or downstream dispatch is changed by this hint.
 if let Some(node)=request["previewNodeId"].as_str(){
  let previews:Vec<Value>=result["runs"].as_array().unwrap().iter().filter(|r|r["schemeNodeId"]==node)
   .flat_map(|r|r["artifacts"].as_array().into_iter().flatten().filter_map(move|a|{
    let src=a["dataUrl"].as_str().or_else(||a["dataURL"].as_str())?;
    if a["type"]!="image"||!(src.starts_with("http://agentcv-memory.localhost/")||src.starts_with("agentcv-memory://localhost/")){return None;}
    Some(json!({"nodeId":node,"artifactId":a["id"],"src":src,"width":a["width"],"height":a["height"]}))
   })).collect();
  if !previews.is_empty(){emit(json!({"phase":"preview-ready","previews":previews}));}
 }
 let execution_ms=started.elapsed().as_secs_f64()*1000.;
 // Cancellation is sampled in the terminal decision above. An abort received
 // during commit stops the next unit, never relabels this already decided one.
 crate::inspection_commit::execute(&request,&mut result,execution_ms,save)?;
 result["timing"]=json!({"clock":"monotonic","nativeMs":started.elapsed().as_secs_f64()*1000.,"executionMs":execution_ms,"commitWallMs":result["commit"]["timing"]["totalMs"].as_f64().unwrap_or(0.),"scope":if request["commit"]["mode"]=="background"{"whole native graph including preparation, verified execution, decision and owned archive admission; excludes background persistence, dispatch queue and UI presentation"}else{"whole native graph including preparation, verified execution, decision and acknowledged commit when requested; excludes queue and UI presentation"}});
 emit(json!({"phase":"session-completed"}));
 Ok(result)
}

const FACT_KEYS:[&str;5]=["result","procedureTrace","structuredLayers","nativeResult","code"];
fn retain_facts(run:&mut Value)->Result<(),String>{
 let scope=run["artifacts"].as_array().and_then(|a|a.iter().find_map(|a|a["memoryRef"]["scope"].as_str())).map(str::to_owned);
 let Some(scope)=scope else{return Ok(())};
 let fields:serde_json::Map<String,Value>=FACT_KEYS.iter().filter_map(|key|run.get(*key).map(|v|((*key).to_owned(),v.clone()))).collect();
 let names=json!(fields.keys().collect::<Vec<_>>());
 let mut bundle=json!({"runId":run["runId"],"workpieceUnit":run["workpieceUnit"]});
 bundle["fields"]=Value::Object(fields);
 let reference=crate::memory_resources::retain_json(&scope,run["runId"].as_str().ok_or("SESSION_RUN_ID_REQUIRED")?,"__execution_facts",bundle)?;
 run["nativeFactFields"]=names;run["nativeFactRef"]=reference;
 Ok(())
}
// Lease validated trees without copying them. A lease remains valid if another
// inspection evicts its registry token while the durable writer is running.
pub fn lease_facts(request:&Value)->Result<Vec<Option<Arc<Value>>>,String>{
 let unit_id=&request["unit"]["id"];
 let mut leases=Vec::new();
 if let Some(runs)=request["runs"].as_array(){for run in runs{
  let Some(reference)=run.get("nativeFactRef") else{leases.push(None);continue};
  if reference["kind"]!="runtime-memory"||reference["artifactId"]!="__execution_facts"||reference["runId"]!=run["runId"]{return Err("SESSION_FACT_IDENTITY_MISMATCH".into());}
  let bundle=crate::memory_resources::read_json(reference)?;
  if bundle["runId"]!=run["runId"]||bundle["workpieceUnit"]!=run["workpieceUnit"]||&bundle["workpieceUnit"]["id"]!=unit_id{return Err("SESSION_FACT_UNIT_MISMATCH".into());}
  let fields=bundle["fields"].as_object().ok_or("SESSION_FACT_FIELDS_INVALID")?;
  if run["nativeFactFields"]!=json!(fields.keys().collect::<Vec<_>>())||fields.keys().any(|key|!FACT_KEYS.contains(&key.as_str())||run.get(key).is_some()) {return Err("SESSION_FACT_FIELDS_MISMATCH".into());}
  if !run.is_object(){return Err("SESSION_RUN_INVALID".into());}
  leases.push(Some(bundle));
 }}
 Ok(leases)
}
// Unsaved app-data records still use the general mutable writer. Workspace
// records serialize leased trees directly and never persist private handles.
pub fn hydrate_facts(request:&mut Value)->Result<(),String>{
 let leases=lease_facts(request)?;
 if let Some(runs)=request["runs"].as_array_mut(){for (run,bundle) in runs.iter_mut().zip(leases){
  if let Some(bundle)=bundle{
   let object=run.as_object_mut().ok_or("SESSION_RUN_INVALID")?;
   object.remove("nativeFactRef");object.remove("nativeFactFields");
   object.extend(bundle["fields"].as_object().ok_or("SESSION_FACT_FIELDS_INVALID")?.clone());
  }
 }}
 Ok(())
}

#[cfg(test)]
mod tests{
 use super::*;
 #[test]
 fn referenced_facts_hydrate_exactly_and_reject_another_unit_or_conflicting_fields(){
  let _exclusive=crate::memory_resources::TEST_LOCK.lock().unwrap();
  let artifact=crate::memory_resources::retain("facts-test","actual-run","data","application/json",b"{}".to_vec()).unwrap();
  let mut run=json!({"runId":"actual-run","workpieceUnit":{"id":"actual-unit","imageIds":["original"]},"result":{"number":1.25,"unknown":null},"procedureTrace":{"nodes":[{"id":"actual-step","outputs":{"values":[1,2,3]}}]},"code":"unchanged user code","artifacts":[{"memoryRef":artifact}]});
  let original=run.clone();retain_facts(&mut run).unwrap();
  for key in FACT_KEYS{run.as_object_mut().unwrap().remove(key);}
  let product=json!({"unit":{"id":"actual-unit"},"runs":[run]});
  let mut changed=product.clone();changed["unit"]["id"]=json!("other");assert_eq!(hydrate_facts(&mut changed).unwrap_err(),"SESSION_FACT_UNIT_MISMATCH");
  changed=product.clone();changed["runs"][0]["result"]=json!({"replacement":true});assert_eq!(hydrate_facts(&mut changed).unwrap_err(),"SESSION_FACT_FIELDS_MISMATCH");
  changed=product.clone();changed["runs"][0]["nativeFactRef"]["bytes"]=json!(1);assert!(hydrate_facts(&mut changed).is_err());
  changed=product;hydrate_facts(&mut changed).unwrap();assert_eq!(changed["runs"][0],original);
 }
 #[test]
 fn contract_fault_blocks_consumers_but_keeps_independent_branch(){
  let nodes=json!([
   {"id":"producer","code":"original producer","parameters":{},"expected_outputs":[{"id":"value","type":"evidence","dataContract":{"kind":"measurement","unit":"px"}}]},
   {"id":"consumer","code":"original consumer","parameters":{},"inputs":{"value":{"nodeId":"producer","artifactId":"value"}},"expected_outputs":[]},
   {"id":"independent","code":"original independent","parameters":{},"expected_outputs":[]}]);
  let request=json!({"sessionId":"s","executionId":"e","unitId":"u","fingerprint":"f",
   "shared":{"sourceBinding":{"images":[]},"images":[],"workpieceUnit":{"id":"u"}},
   "scheme":{"operatorGraph":{"nodes":nodes,"edges":[{"from":"producer","to":"consumer"}]}},
   "nodes":nodes.as_array().unwrap().iter().map(|n|json!({"nodeId":n["id"],"request":{"mode":"scheme","code":n["code"],"parameters":{},"expectedOutputs":n["expected_outputs"]}})).collect::<Vec<_>>()});
  let mut dispatched=Vec::new();let mut events=Vec::new();
  let result=execute(request.clone(),|r|{assert_eq!(r["runtimeSessionId"],"s");let id=r["runtimePlan"]["nodeId"].as_str().unwrap();dispatched.push(id.to_owned());Ok(json!({"runId":id,"status":"SUCCEEDED","execution":{"status":"COMPLETED"},"result":{"valid":true},"artifacts":[{"id":"value","type":"json","data":{"value":12,"unit":"mm"}}]}))},||false,|e|events.push(e)).unwrap();
  assert_eq!(dispatched,vec!["producer","independent"]);
  assert_eq!(result["runs"][0]["execution"]["reason"],"OUTPUT_CONTRACT_VIOLATION");
  assert_eq!(result["nodeStates"][1]["reason"],"PREREQUISITE_UNAVAILABLE");
  assert!(events.iter().enumerate().all(|(i,e)|e["sequence"]==i+1&&e["sessionId"]=="s"&&e["unitId"]=="u"));
  let mut changed=request;changed["nodes"][0]["request"]["sourceBinding"]=json!({});
  assert_eq!(execute(changed,|_|panic!("must not dispatch"),||false,|_|{}).unwrap_err(),"SESSION_SHARED_OVERRIDE");
 }
 #[test]
 fn cancelled_registration_is_removed_on_drop(){
  let r=register("cancellation-test").unwrap();assert!(cancel("cancellation-test").unwrap());assert!(r.cancelled.load(Ordering::Acquire));drop(r);assert!(!cancel("cancellation-test").unwrap());
 }
 #[test]
 fn native_evidence_uses_authored_request_and_preserves_diagnostics(){
  let node=json!({"id":"actual-node","code":"unchanged code","parameters":{"threshold":3},"expected_outputs":[{"id":"actual","type":"evidence"}]});
  let request=json!({"sessionId":"s","executionId":"e","unitId":"u","fingerprint":"f","evidenceAuditBackend":crate::inspection_evidence::BACKEND,
   "shared":{"sourceBinding":{"images":[]},"images":[],"workpieceUnit":{"id":"u"}},
   "scheme":{"operatorGraph":{"nodes":[node],"edges":[]}},
   "nodes":[{"nodeId":"actual-node","request":{"mode":"scheme","code":node["code"],"parameters":node["parameters"],"expectedOutputs":node["expected_outputs"],"justification":{"boundaries":[{"check":{"kind":"gate","id":"actual-limit"}}]}}}]});
  let result=execute(request.clone(),|_|Ok(json!({"runId":"actual-run","status":"SUCCEEDED","execution":{"status":"COMPLETED"},"timing":{"native":{}},"parameters":{"threshold":900},"justification":{},"result":{"boundaryChecks":[{"id":"actual-limit","status":"FAIL","actual":7,"threshold":3}]},"artifacts":[{"id":"actual","type":"json","data":{"actual":7}}]})),||false,|_|{}).unwrap();
  let run=&result["runs"][0];assert_eq!(run["parameters"],node["parameters"]);
  assert_eq!(run["nativeEvidenceAuditBackend"],crate::inspection_evidence::BACKEND);
  assert_eq!(run["evidenceAudit"]["status"],"DIAGNOSTIC_ONLY");
  assert_eq!(run["evidenceAudit"]["errors"][0]["path"],"boundaries.0.check");
  let mut invalid=request.clone();invalid["evidenceAuditBackend"]=json!("unsupported");
  assert_eq!(execute(invalid,|_|panic!("invalid backend must fail before execution"),||false,|_|{}).unwrap_err(),"SESSION_EVIDENCE_BACKEND_INVALID");
  let mut invalid=request;invalid["scheme"]["operatorGraph"]["nodes"][0]["expected_outputs"][0]["dataContract"]=json!({"kind":"measurement"});
  assert_eq!(execute(invalid,|_|panic!("invalid declarations must fail before execution"),||false,|_|{}).unwrap_err(),"SESSION_EVIDENCE_CONTRACT_INVALID");
 }
 #[test]
 fn native_run_envelope_is_assembled_before_audit_and_requires_shared_compilation(){
  let node=json!({"id":"actual","code":"unchanged algorithm","parameters":{},"expected_outputs":[{"id":"data","type":"evidence"}]});
  let request=json!({"sessionId":"s","executionId":"e","unitId":"u","fingerprint":"f","runEnvelopeBackend":crate::inspection_run::BACKEND,"evidenceAuditBackend":crate::inspection_evidence::BACKEND,
   "shared":{"sourceBinding":{"images":[{"imageId":"original"}]},"images":[],"workpieceUnit":{"id":"u"},"referenceInputs":{},"inputContext":{"calibration":null,"targets":[]},"compilation":{"ok":true,"order":["actual"]}},
   "scheme":{"operatorGraph":{"nodes":[node],"edges":[]}},
   "nodes":[{"nodeId":"actual","request":{"mode":"scheme","title":"Actual node","code":node["code"],"parameters":{},"expectedOutputs":node["expected_outputs"],"visualEvidence":[],"proposalAudit":{"valid":true}}}]});
  let result=execute(request.clone(),|r|{
   assert!(r.get("compilation").is_none(),"frontend compiler diagnostics must not be copied into the extension request");
   Ok(json!({"runId":"actual-run","status":"TIMEOUT","code":"substituted","sourceBinding":{"images":[]},"timing":{"native":{}},"artifacts":[]}))
  },||false,|_|{}).unwrap();
  let run=&result["runs"][0];assert_eq!(run["code"],"unchanged algorithm");
  assert_eq!(run["execution"],json!({"status":"FAULT","reason":"TIMEOUT"}));
  assert_eq!(run["source"]["imageId"],"original");assert_eq!(run["compilation"],request["shared"]["compilation"]);
  assert_eq!(run["nativeRunEnvelopeBackend"],crate::inspection_run::BACKEND);
  assert_eq!(run["evidenceAudit"]["status"],"DIAGNOSTIC_ONLY");
  for backend in [json!("unsupported"),Value::Null]{let mut invalid=request.clone();invalid["runEnvelopeBackend"]=backend;
   assert_eq!(execute(invalid,|_|panic!("must reject before dispatch"),||false,|_|{}).unwrap_err(),"SESSION_RUN_BACKEND_INVALID");}
  let mut invalid=request;invalid["shared"]["compilation"]["ok"]=json!(false);
  assert_eq!(execute(invalid,|_|panic!("must reject before dispatch"),||false,|_|{}).unwrap_err(),"SESSION_RUN_COMPILATION_REQUIRED");
 }
}

// Same compatibility response as adaptNativePipelineResponse in the frontend.
// This moves adaptation across the call boundary; it changes no CV operator.
fn execute_native(request:&Value)->Result<Value,String>{
 let started=Instant::now();let image=&request["nativePipeline"]["image"][0];
 let native=crate::native_cv::execute(json!({"image":image,"plan":request["nativePipeline"]["plan"],
  "planFingerprint":request["runtimePlan"]["fingerprint"],"pixelFingerprint":image["sourceSha256"],"inputIdentity":request["sourceBinding"]["images"][0]}))?;
 Ok(adapt_native(native,request,started.elapsed().as_secs_f64()*1000.))
}
pub fn adapt_native(native:Value,request:&Value,elapsed:f64)->Value{
 let empty=Vec::new();let nodes=native["nodes"].as_array().unwrap_or(&empty);
 let feature=nodes.iter().find(|n|n["op"]=="geometry.two_boundary").or_else(||nodes.iter().find(|n|n["op"].as_str().is_some_and(|op|op.starts_with("geometry.")))).or_else(||nodes.last()).unwrap_or(&Value::Null);
 let artifacts=feature["artifacts"].as_array().unwrap_or(&empty);
 let find=|suffix:&str|artifacts.iter().find(|a|a["id"].as_str().is_some_and(|id|id==suffix||id.ends_with(&format!(":{suffix}"))));
 let analysis=find("feature-evidence").map(|a|&a["data"]).unwrap_or(&Value::Null);
 let object=|v:&Value|if v.is_null(){json!({})}else{v.clone()};
 let search=object(&analysis["search"]);let summary=object(&feature["outputSummary"]);
 let status=summary["status"].as_str().filter(|s|!s.is_empty()).unwrap_or("UNKNOWN");
 let mut geometry=summary.clone();geometry["backend"]=json!("rust-native");
 let checks=json!([{"id":"native.execution","status":if native["status"]=="OK"{"PASS"}else{"NOT_EVALUATED"},"actual":native.get("status").unwrap_or(&json!("UNKNOWN")),"threshold":"OK"},
  {"id":"native.geometry","status":if status=="UNKNOWN"{"NOT_EVALUATED"}else{"PASS"},"actual":status,"threshold":["GOOD","SKEW"]}]);
 let evidence=|id:&str,data:Value|json!({"id":id,"type":"evidence","name":id,"data":data,"backend":"rust-native","source":"rust-native"});
 let overlay=if let Some(overlay)=find("feature-overlay"){let mut o=overlay.clone();o["id"]=json!("overlay");o["name"]=json!("overlay");o["role"]=json!("result");o["pixelRetention"]=json!("full");o["bytes"]=json!(overlay["dataURL"].as_str().map(|s|s.len()*3/4).unwrap_or(0));o}
  else{json!({"id":"overlay","type":"image","name":"overlay","role":"result","dataURL":null,"pixelRetention":"metadata-only","backend":"rust-native"})};
 let fields=|keys:&[&str]|Value::Object(keys.iter().map(|k|((*k).into(),object(&search[*k]))).collect());
 let mut geometry_evidence=geometry.clone();geometry_evidence["skewSupported"]=json!(status=="SKEW");geometry_evidence["containedSupported"]=json!(status=="GOOD");geometry_evidence["boundaryChecks"]=checks.clone();
 let artifacts=json!([overlay,evidence("search_data",search.clone()),evidence("edge_data",fields(&["edgeCandidates","jointCandidates","refinedEdges","exteriorEdges"])),
  evidence("model_data",json!({"lidPose":summary["lidPose"],"pkgReconstruction":search["pkgReconstruction"],"radiusTrials":search["radiusTrials"]})),
  evidence("geometry_data",json!({"geometry":geometry,"search":search.get("geometry").unwrap_or(&geometry),"decisionTrials":search["decisionTrials"]})),evidence("geometry",geometry_evidence.clone())]);
 let plan_feature=request["nativePipeline"]["plan"]["nodes"].as_array().and_then(|ns|ns.iter().find(|n|n["op"]=="geometry.two_boundary"));
 let params=feature.get("parameters").or_else(||plan_feature.and_then(|n|n.get("params"))).cloned().unwrap_or(json!({}));
 let hints=feature.get("parameterSources").or_else(||plan_feature.and_then(|n|n.get("parameterSources"))).cloned().unwrap_or(json!({}));
 let keys:Vec<_>=params.as_object().map(|o|o.keys().cloned().collect()).unwrap_or_default();
 let sources:serde_json::Map<String,Value>=keys.iter().map(|k|(k.clone(),hints.get(k).cloned().unwrap_or(json!("native-default")))).collect();
 let justification=json!({"tool":{"reason":"以 Rust gray8 typed pipeline 執行兩層邊界，保留實測支持與估計邊界的區分。","expectedEvidence":[{"kind":"artifact","type":"evidence","id":"geometry_data"}]},
  "parameters":keys.iter().map(|name|json!({"name":name,"source":sources[name],"reason":if sources[name]=="native-default"{"本次方案未提供此值，使用 Rust 算子明示的工程預設；不可視為人類確認。"}else{"沿用目前方案已保存的工程參數；本次實算由 Rust 原生核心重新核對。"},"verification":{"kind":"artifact","type":"evidence","id":"geometry_data"}})).collect::<Vec<_>>(),
  "boundaries":[{"condition":"需要獨立 pkg 外露支持與有限幾何；否則保持 UNKNOWN。","check":{"kind":"artifact","type":"evidence","id":"geometry_data"},"onFailure":"UNKNOWN"}]});
 let node_id=request["runtimePlan"]["nodeId"].as_str().unwrap_or("native");
 let duration=native["durationMs"].as_f64().unwrap_or(0.);
 json!({"runId":native["runId"],"status":if native["status"]=="OK"{"SUCCEEDED"}else{"FAILED"},"artifacts":artifacts,"backend":"rust-native","executionBackend":"rust-native","language":"rust","nativeResult":native,
  "dispatchSourceBinding":request["sourceBinding"],"sourceBinding":request["sourceBinding"],
  "result":{"valid":status!="UNKNOWN","status":status,"skewSupported":status=="SKEW","containedSupported":status=="GOOD","geometry":geometry,"measurements":object(&native["measurements"]),"boundaryChecks":checks,"backend":"rust-native"},
  "procedureTrace":{"schema":"agentcv-procedure-trace-1","nodes":[{"instanceId":format!("{node_id}#1"),"id":node_id,"kind":"step","status":"SUCCEEDED","judgement":if status=="SKEW"{"NG"}else if status=="GOOD"{"OK"}else{"UNKNOWN"},"parameters":params,"parameterSources":sources,"outputs":geometry_evidence,"artifactIds":artifacts.as_array().unwrap().iter().map(|a|&a["id"]).collect::<Vec<_>>(),"justification":justification}]},
  "execution":{"status":if native["status"]=="OK"{"COMPLETED"}else{"FAULT"},"backend":"rust-native"},
  "timing":{"programMs":duration,"native":{"backend":"rust-native","processMs":duration,"totalMs":elapsed,"queueMs":0,"preparationMs":0,"resultReadMs":0,"verificationMs":0,"resultWriteMs":0}}})
}
