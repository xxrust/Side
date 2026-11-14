//! Routine inspection may omit unconsumed, untyped diagnostic JSON snapshots.
//! Absence is explicit; no digest, bytes or persisted asset is invented.
use serde_json::{json,Value};
pub fn marker()->Value{json!({"schema":"agentcv-artifact-capture-1","status":"NOT_CAPTURED","reason":"routine-inspection","recovery":"rerun-selected-workpiece-with-diagnostics"})}
pub fn eligible(request:&Value,scheme:&Value)->Vec<Value>{
 if request["artifactMode"]!="inspection"||request["procedureValueCapture"]!="essential"{return vec![];}
 let Some(nodes)=scheme["operatorGraph"]["nodes"].as_array() else{return vec![]};
 let id=&request["runtimePlan"]["nodeId"];
 if !nodes.iter().any(|node|node["id"]==*id){return vec![];}
 request["expectedOutputs"].as_array().into_iter().flatten().filter(|output|{
  output["id"].is_string()&&output["dataContract"]==json!({"kind":"json"})&&output["role"]!="result"&&output["role"]!="final"&&
  !nodes.iter().any(|consumer|consumer["inputs"].as_object().is_some_and(|inputs|inputs.values().any(|input|input["nodeId"]==*id&&input["artifactId"]==output["id"])))
 }).map(|output|output["id"].clone()).collect()
}
pub fn descriptor(value:&Value)->bool{
 value["type"]=="json"&&value["section"]!="boundary"&&value["collection"]==marker()&&value["storage"]=="not-captured"&&
 ["sha256","bytes","data","path","assetRef","memoryRef","dataUrl","dataURL","residentJson"].iter().all(|key|value.get(*key).is_none())
}
pub fn verified(value:&Value)->bool{descriptor(value)&&value["hostCollectionVerified"]==true&&value["hostBytesVerified"]==false}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn policy_requires_plain_unconsumed_optional_outputs_and_explicit_routine_mode(){
  let mut r=json!({"artifactMode":"inspection","procedureValueCapture":"essential","runtimePlan":{"nodeId":"producer"},"expectedOutputs":[{"id":"optional","dataContract":{"kind":"json"}},{"id":"used","dataContract":{"kind":"json"}},{"id":"typed","dataContract":{"kind":"measurement","unit":"px"}},{"id":"result","role":"result","dataContract":{"kind":"json"}}]});
  let scheme=json!({"operatorGraph":{"nodes":[{"id":"producer"},{"id":"consumer","inputs":{"value":{"nodeId":"producer","artifactId":"used"}}}]}});
  assert_eq!(eligible(&r,&scheme),vec![json!("optional")]);r["procedureValueCapture"]=json!("full");assert!(eligible(&r,&scheme).is_empty());
  r["procedureValueCapture"]=json!("essential");assert!(eligible(&r,&json!({})).is_empty());
 }
 #[test]fn unavailable_descriptor_never_claims_content(){
  let mut a=json!({"id":"optional","type":"json","storage":"not-captured","collection":marker(),"hostCollectionVerified":true,"hostBytesVerified":false});assert!(verified(&a));
  for key in ["sha256","bytes","data","path","assetRef","memoryRef","dataURL"]{a[key]=Value::Null;assert!(!verified(&a));a.as_object_mut().unwrap().remove(key);}
 }
}
