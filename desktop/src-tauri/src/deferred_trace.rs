//! Project only browser-facing trace values after the complete unit is owned
//! by the archive. Decision inputs, gate observations and saved facts stay exact.
use serde_json::{json,Value};
use std::io::{self,Write};
const LIMIT:usize=4096;
struct SizeProbe(usize);
impl Write for SizeProbe{
 fn write(&mut self,bytes:&[u8])->io::Result<usize>{
  self.0=self.0.saturating_add(bytes.len());
  if self.0>=LIMIT{return Err(io::Error::new(io::ErrorKind::Other,"size probe complete"));}
  Ok(bytes.len())
 }
 fn flush(&mut self)->io::Result<()>{Ok(())}
}
fn large(value:&Value)->bool{let mut probe=SizeProbe(0);let _=serde_json::to_writer(&mut probe,value);probe.0>=LIMIT}
// Derive eligibility from the whole graph, never a node-supplied claim.
pub fn eligible_artifacts(request:&Value,node:&Value)->Vec<Value>{
 if request["deferProcedureTrace"]!=true||!request["commit"].is_object(){return vec![];}
 let Some(definitions)=request["scheme"]["operatorGraph"]["nodes"].as_array() else{return vec![]};
 node["expected_outputs"].as_array().into_iter().flatten().filter(|output|{
  output["id"].is_string()&&output["dataContract"]==json!({"kind":"json"})&&
  !definitions.iter().any(|consumer|consumer["inputs"].as_object().is_some_and(|inputs|inputs.values().any(|input|input["nodeId"]==node["id"]&&input["artifactId"]==output["id"])))
 }).map(|output|output["id"].clone()).collect()
}
pub fn artifact_reference(run_id:&Value,id:&Value)->Value{json!({"deferred":true,"reference":{"schema":"agentcv-deferred-artifact-value-1","runId":run_id,"artifactId":id}})}
pub fn project(request:&Value,result:&mut Value)->Result<(),String>{
 if request["deferProcedureTrace"]!=true{return Ok(())}
 let receipt=&result["commit"]["receipt"];
 let reference=if receipt["status"]=="SAVED"{&receipt["recordRef"]}else if receipt["status"]=="PENDING"&&receipt["durable"]==false{&receipt["archiveRef"]}else{return Err("DEFERRED_TRACE_REQUIRES_OWNED_ARCHIVE".into())};
 if reference["executionId"]!=request["executionId"]||reference["unitId"]!=request["unitId"]{return Err("DEFERRED_TRACE_ARCHIVE_IDENTITY_MISMATCH".into())}
 for run in result["runs"].as_array_mut().ok_or("SESSION_RUNS_REQUIRED")?{
  let run_id=run["runId"].clone();let mut changed=false;
  if let Some(nodes)=run["procedureTrace"]["nodes"].as_array_mut(){for (index,node) in nodes.iter_mut().enumerate(){
   let instance=node["instanceId"].clone();
   if let Some(outputs)=node["outputs"].as_object_mut(){for (key,value) in outputs.iter_mut(){
    if key=="boundaryChecks"||!large(value){continue;}
    *value=json!({"deferred":true,"reference":{"schema":"agentcv-deferred-procedure-value-1","runId":run_id,"nodeInstanceId":instance,"path":["procedureTrace","nodes",index,"outputs",key]}});changed=true;
   }}
  }}
  // Plain JSON evidence with no graph consumer has no value-level contract.
  // Keep typed geometry/measurement and all downstream inputs fully present.
  let node_id=run["schemeNodeId"].clone();
  let definitions=request["scheme"]["operatorGraph"]["nodes"].as_array();
  let definition=definitions.and_then(|nodes|nodes.iter().find(|node|node["id"]==node_id));
  if let Some(artifacts)=run["artifacts"].as_array_mut(){for artifact in artifacts{
   let id=artifact["id"].clone();
   let plain=definition.and_then(|node|node["expected_outputs"].as_array()).is_some_and(|outputs|outputs.iter().any(|o|o["id"]==id&&o["dataContract"]==json!({"kind":"json"})));
   let consumed=definitions.is_some_and(|nodes|nodes.iter().any(|node|node["inputs"].as_object().is_some_and(|inputs|inputs.values().any(|input|input["nodeId"]==node_id&&input["artifactId"]==id))));
   if artifact["type"]=="json"&&artifact["memoryRef"]["kind"]=="runtime-memory"&&plain&&!consumed&&(artifact.get("data").is_some_and(large)||artifact["data"]==artifact_reference(&run_id,&id)){
    artifact["data"]=artifact_reference(&run_id,&id);changed=true;
   }
  }}
  if changed{run["deferredProcedureTrace"]=json!({"schema":"agentcv-deferred-procedure-trace-1","runId":run_id,"unitId":request["unitId"],"executionId":request["executionId"]});}
 }
 Ok(())
}
#[cfg(test)]
mod tests{
 use super::*;
 fn specimen()->(Value,Value){
  let request=json!({"deferProcedureTrace":true,"executionId":"e","unitId":"u"});
  let result=json!({"commit":{"receipt":{"status":"SAVED","recordRef":{"executionId":"e","unitId":"u"}}},"runs":[{"runId":"r","result":{"valid":true},"procedureTrace":{"nodes":[{"instanceId":"s#1","outputs":{"small":3,"large":vec![42;5000],"boundaryChecks":[{"actual":vec![1;5000],"status":"FAIL"}]}}]}}]});(request,result)
 }
 #[test] fn projection_keeps_gates_and_values_restorable(){let(q,mut r)=specimen();let before=r.clone();project(&q,&mut r).unwrap();let outputs=&r["runs"][0]["procedureTrace"]["nodes"][0]["outputs"];assert_eq!(outputs["small"],3);assert_eq!(outputs["boundaryChecks"],before["runs"][0]["procedureTrace"]["nodes"][0]["outputs"]["boundaryChecks"]);assert_eq!(outputs["large"]["reference"]["path"],json!(["procedureTrace","nodes",0,"outputs","large"]));assert_eq!(r["runs"][0]["result"],before["runs"][0]["result"]);assert_eq!(r["runs"][0]["deferredProcedureTrace"]["unitId"],"u");}
 #[test] fn early_reference_is_marked_only_after_owned_commit(){
  let(mut q,mut r)=specimen();
  let node=json!({"id":"producer","expected_outputs":[{"id":"plain","dataContract":{"kind":"json"}},{"id":"typed","dataContract":{"kind":"points"}},{"id":"input","dataContract":{"kind":"json"}}]});
  q["scheme"]=json!({"operatorGraph":{"nodes":[node.clone(),{"id":"consumer","inputs":{"in":{"nodeId":"producer","artifactId":"input"}}}]}});
  assert!(eligible_artifacts(&q,&node).is_empty());q["commit"]=json!({"mode":"background"});
  assert_eq!(eligible_artifacts(&q,&node),vec![json!("plain")]);
  let mut off=q.clone();off["deferProcedureTrace"]=json!(false);assert!(eligible_artifacts(&off,&node).is_empty());
  r["runs"][0]["schemeNodeId"]=json!("producer");r["runs"][0]["procedureTrace"]=json!({"nodes":[]});
  r["runs"][0]["artifacts"]=json!([{"id":"plain","type":"json","memoryRef":{"kind":"runtime-memory"},"data":artifact_reference(&json!("r"),&json!("plain"))}]);
  let mut failed=r.clone();failed["commit"]["receipt"]["status"]=json!("FAILED");assert!(project(&q,&mut failed).is_err());assert!(failed["runs"][0].get("deferredProcedureTrace").is_none());
  project(&q,&mut r).unwrap();assert_eq!(r["runs"][0]["deferredProcedureTrace"]["runId"],"r");
 }
 #[test] fn no_projection_without_opt_in(){let(mut q,mut r)=specimen();q["deferProcedureTrace"]=json!(false);let before=r.clone();project(&q,&mut r).unwrap();assert_eq!(before,r);}
 #[test] fn unowned_or_wrong_archive_rejects_before_mutation(){for mode in ["missing","failed","wrong"]{let(q,mut r)=specimen();if mode=="missing"{r.as_object_mut().unwrap().remove("commit");}else if mode=="failed"{r["commit"]["receipt"]["status"]=json!("FAILED");}else{r["commit"]["receipt"]["recordRef"]["unitId"]=json!("other");}let before=r.clone();assert!(project(&q,&mut r).is_err());assert_eq!(before,r);}}
 #[test] fn pending_owned_archive_can_project(){let(q,mut r)=specimen();r["commit"]["receipt"]=json!({"status":"PENDING","durable":false,"archiveRef":{"executionId":"e","unitId":"u"}});project(&q,&mut r).unwrap();assert!(r["runs"][0]["deferredProcedureTrace"].is_object());}
 #[test] fn size_probe_accounts_for_json_escaping(){assert!(!large(&json!("a".repeat(100))));assert!(large(&json!("\n".repeat(2048))));assert!(large(&json!(vec![0;4096])));}
 #[test] fn artifact_projection_keeps_typed_and_consumed_values(){
  let(mut q,mut r)=specimen();q["scheme"]=json!({"operatorGraph":{"nodes":[{"id":"producer","expected_outputs":[{"id":"plain","dataContract":{"kind":"json"}},{"id":"typed","dataContract":{"kind":"points"}},{"id":"input","dataContract":{"kind":"json"}}]},{"id":"consumer","inputs":{"in":{"nodeId":"producer","artifactId":"input"}}}]}});
  r["runs"][0]["schemeNodeId"]=json!("producer");r["runs"][0]["artifacts"]=json!(["plain","typed","input"].iter().map(|id|json!({"id":id,"type":"json","memoryRef":{"kind":"runtime-memory"},"data":vec![3;5000]})).collect::<Vec<_>>());
  project(&q,&mut r).unwrap();assert_eq!(r["runs"][0]["artifacts"][0]["data"]["deferred"],true);
  for index in [1,2]{assert_eq!(r["runs"][0]["artifacts"][index]["data"].as_array().unwrap().len(),5000);}
 }

}
