//! Durable workpiece metadata and evidence-retention policy. These operate on
//! observed execution facts, never on pixels or algorithm thresholds.
use serde_json::{json, Value};
fn list(value: &Value) -> &[Value] { value.as_array().map(Vec::as_slice).unwrap_or(&[]) }
pub(crate) fn truthy(value: &Value) -> bool {
    match value { Value::Null => false, Value::Bool(v) => *v, Value::Number(v) => v.as_f64().is_some_and(|v| v != 0.), Value::String(v) => !v.is_empty(), _ => true }
}
pub(crate) fn js_trim(value: &str) -> &str {
    value.trim_matches(|c: char| matches!(c, '\u{9}'..='\u{d}' | '\u{20}' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'))
}
fn positive(value: &Value) -> Option<u64> { value.as_u64().filter(|n| *n > 0 && *n <= 9_007_199_254_740_991) }
pub(crate) fn js_string(value:&Value)->String {
    match value {Value::String(s)=>s.clone(),Value::Array(a)=>a.iter().map(|v|if v.is_null(){String::new()}else{js_string(v)}).collect::<Vec<_>>().join(","),Value::Object(_)=>"[object Object]".into(),_=>value.to_string()}
}
fn joined_categories(value:&Value)->String {
    let mut ids:Vec<_>=list(value).iter().map(js_string).collect();ids.sort();ids.join("|")
}
fn js_length(value:&Value)->Option<usize> {
    match value {Value::Array(a)=>Some(a.len()),Value::String(s)=>Some(s.encode_utf16().count()),_=>None}
}
fn default_policy() -> Value {
    json!({"schema":"agentcv-artifact-retention-1","mode":"diagnostic","sampleEvery":100,"keepFirst":true,"keepLast":true,"keepFailures":true,"keepNonGood":true,
        "note":"每件保存分類、量測、耗時、依據與圖像摘要；像素只保留故障、不良／待定、首尾及定期樣本。"})
}
pub fn normalize_retention(input: &Value) -> Value {
    let mut policy=default_policy();
    if input == "all" { policy["mode"]=json!("all"); return policy; }
    if matches!(input["mode"].as_str(),Some("all"|"metadata"|"diagnostic")) {policy["mode"]=input["mode"].clone();}
    if let Some(sample)=positive(&input["sampleEvery"]) {policy["sampleEvery"]=json!(sample);}
    for key in ["keepFirst","keepLast","keepFailures","keepNonGood"] {
        if let Some(value)=input.get(key) {policy[key]=json!(truthy(value));}
    }
    if let Some(note)=input["note"].as_str().filter(|text|!js_trim(text).is_empty()) {policy["note"]=json!(note);}
    policy
}
pub fn regression(spec: &Value, resolution: &Value, result: &Value, faults: &[Value], cancelled: bool, known_categories:Option<&Value>) -> Value {
    let expected=&resolution["expected"];
    let known=expected["categoryIds"].as_array().is_some_and(|ids|ids.len()==1 && ids.iter().all(|id|match known_categories {
        Some(keys)=>list(keys).iter().any(|key|key.as_str()==Some(js_string(id).as_str())),
        None=>list(&spec["categories"]).iter().any(|category|js_string(&category["id"])==js_string(id)),
    }))
        && expected["provenance"]["type"]=="human" && expected["provenance"]["status"]=="confirmed"
        && expected["provenance"]["ref"].as_str().is_some_and(|text|!js_trim(text).is_empty());
    let mut regression=if !known {
        let mut value=json!({"status":if resolution["reason"]=="EXPECTED_SOURCE_LABEL_UNMAPPED" {"UNMAPPED"} else {"UNLABELLED"}});
        if truthy(&resolution["reason"]) {value["reason"]=resolution["reason"].clone();}
        if truthy(expected) {value["reason"]=json!(if js_length(&expected["categoryIds"])==Some(1) {"EXPECTED_SOURCE_UNCONFIRMED_OR_CATEGORY_UNDEFINED"} else {"EXPECTED_FINAL_CATEGORY_NOT_UNIQUE"});}
        value
    } else {
        let status=if !faults.is_empty() {"FAULT"} else if cancelled || !truthy(&result["valid"]) {"NOT_EVALUATED"} else if joined_categories(&result["categoryIds"])==joined_categories(&expected["categoryIds"]) {"MATCH"} else {"MISMATCH"};
        json!({"status":status,"expected":expected["categoryIds"],"expectedProvenance":expected["provenance"]})
    };
    if let Some(origin)=resolution.get("origin") {regression["labelSource"]=origin.clone();}
    json!({"known":known,"regression":regression})
}
fn output_role<'a>(run: &'a Value, artifact: &'a Value, scheme: &'a Value) -> &'a Value {
    let declared=run.get("expectedOutputs").filter(|v|truthy(v)).or_else(||run.get("expected_outputs").filter(|v|truthy(v)))
        .unwrap_or_else(||list(&scheme["operatorGraph"]["nodes"]).iter().find(|node|node["id"]==run["schemeNodeId"]).and_then(|node|node.get("expected_outputs")).unwrap_or(&Value::Null));
    artifact.get("role").filter(|v|truthy(v)).or_else(||artifact["contractBinding"].get("role").filter(|v|truthy(v)))
        .or_else(||list(declared).iter().find(|item|item["id"]==artifact["id"]).and_then(|item|item.get("role")).filter(|v|truthy(v)))
        .unwrap_or(&Value::Null)
}
pub fn retention(record: &Value, runs: &[Value], options: &Value, scheme: &Value) -> Value {
    let policy=normalize_retention(&options["retention"]);
    let index=options.get("unitIndex").cloned().unwrap_or(json!(0));
    let total=options.get("total").cloned().unwrap_or(Value::Null);
    let fault=record["execution"]["status"]=="FAULT" || runs.iter().any(|run|run["status"]!="SUCCEEDED"||run["execution"]["status"]=="FAULT");
    let non_good=record["result"].get("quality").is_some_and(|quality|quality!="good");
    let first=index==0;
    let last=positive(&total).is_some_and(|n|index.as_u64()==Some(n-1));
    let sample=index.as_u64().is_some_and(|n|n%policy["sampleEvery"].as_u64().unwrap()==0);
    let mut reasons=Vec::new();
    if policy["mode"]=="all" {reasons.push("all".to_owned());}
    if policy["keepFailures"]==true && fault {reasons.push("fault".to_owned());}
    if policy["keepNonGood"]==true && non_good {reasons.push(if truthy(&record["result"]["quality"]) {js_string(&record["result"]["quality"])}else{"non-good".into()});}
    if policy["keepFirst"]==true && first {reasons.push("first".to_owned());}
    if policy["keepLast"]==true && last {reasons.push("last".to_owned());}
    if sample {reasons.push("sample".to_owned());}
    let keep=policy["mode"]=="all" || policy["mode"]!="metadata" && !reasons.is_empty();
    let reason=if reasons.is_empty(){"metadata-only".into()}else{reasons.join("+")};
    let mut count=0;let mut roles=Vec::new();
    for run in runs {for artifact in list(&run["artifacts"]).iter().filter(|a|a["type"]=="image") {
        count+=1;
        if keep {let role=output_role(run,artifact,scheme);let role=if role.is_null(){json!("intermediate")}else{role.clone()};if !roles.contains(&role){roles.push(role);}}
    }}
    json!({"schema":"agentcv-artifact-retention-decision-1","mode":policy["mode"],"unitIndex":index,"total":total,"keepPixels":keep,"reason":reason,
        "imageArtifacts":count,"retainedImageArtifacts":if keep{count}else{0},"metadataOnlyImageArtifacts":if keep{0}else{count},"roles":roles})
}
pub fn validate_context(request: &Value) -> Result<(),String> {
    let Some(context)=request.get("productContext") else {return Ok(())};
    if request["shared"]["workpieceUnit"]["id"]!=request["unitId"] || !request["unitId"].is_string()
        || !request["shared"]["workpieceUnit"]["imageIds"].is_array() {return Err("SESSION_PRODUCT_UNIT_MISMATCH".into());}
    if !context.is_object() || !context["expectedResolution"].is_object() || !context["referenceIdentities"].is_object()
        || !context["retention"].is_object() || normalize_retention(&context["retention"])!=context["retention"]
        || context.get("regressionCategoryIds").is_some_and(|ids|!ids.is_array()||list(ids).iter().any(|id|!id.is_string()))
        || context["unitIndex"].as_u64().is_none_or(|n|n>9_007_199_254_740_991)
        || !context["total"].is_null() && context["total"].as_u64().is_none_or(|n|n>9_007_199_254_740_991) {
        return Err("SESSION_PRODUCT_CONTEXT_INVALID".into());
    }
    let references=&request["shared"]["referenceInputs"];
    if context["referenceIdentities"].as_object().unwrap().len()!=references.as_object().map_or(0,|o|o.len())
        || references.as_object().is_some_and(|o|o.keys().any(|key|context["referenceIdentities"].get(key).is_none())) {
        return Err("SESSION_REFERENCE_IDENTITY_MISMATCH".into());
    }
    Ok(())
}
pub fn finalize(request: &Value, session: &Value, decision: &Value) -> Result<Value,String> {
    validate_context(request)?;
    let context=request.get("productContext").ok_or("SESSION_PRODUCT_CONTEXT_REQUIRED")?;
    let unit=&request["shared"]["workpieceUnit"];
    let faults=list(&decision["faults"]);let cancelled=decision["cancelled"]==true;
    let classified=regression(&request["scheme"]["classificationSpec"],&context["expectedResolution"],&decision["result"],faults,cancelled,context.get("regressionCategoryIds"));
    let final_exit=if cancelled {"CANCELLED".to_owned()}else if !faults.is_empty(){"FAULT".into()}else{format!("PRODUCT:{}",decision["result"]["categoryId"].as_str().unwrap_or("null"))};
    let fields=json!({"schema":"agentcv-workpiece-result-1","unitId":request["unitId"],"imageIds":unit["imageIds"],"views":unit.get("views").filter(|v|truthy(v)).unwrap_or(&Value::Null),
        "referenceInputs":request["shared"]["referenceInputs"],"referenceIdentities":context["referenceIdentities"],"finalExit":final_exit,"schemeFingerprint":request["fingerprint"],
        "regression":classified["regression"],"runIds":list(&session["runs"]).iter().map(|run|&run["runId"]).collect::<Vec<_>>()});
    let record=json!({"execution":{"status":if cancelled{"CANCELLED"}else if faults.is_empty(){"COMPLETED"}else{"FAULT"}},"result":decision["result"]});
    let options=json!({"retention":context["retention"],"unitIndex":context["unitIndex"],"total":context["total"]});
    Ok(json!({"backend":"rust-native-product-v1","known":classified["known"],"recordFields":fields,"retention":retention(&record,list(&session["runs"]),&options,&request["scheme"])}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_context_is_rejected_before_product_construction() {
        let mut request=json!({"unitId":"unit","shared":{"workpieceUnit":{"id":"unit","imageIds":["original"]},"referenceInputs":{}},"productContext":{"expectedResolution":{},"referenceIdentities":{},"retention":normalize_retention(&Value::Null),"unitIndex":0,"total":null}});
        assert!(validate_context(&request).is_ok());
        request["productContext"]["unitIndex"]=json!(-1);assert!(validate_context(&request).is_err());
        request["productContext"]["unitIndex"]=json!(0);request["shared"]["referenceInputs"]=json!({"master":"reference"});
        assert_eq!(validate_context(&request).unwrap_err(),"SESSION_REFERENCE_IDENTITY_MISMATCH");
        request["productContext"]["referenceIdentities"]=json!({"master":{"imageId":"reference"}});assert!(validate_context(&request).is_ok());
        request["productContext"]["retention"]["sampleEvery"]=json!(0);assert!(validate_context(&request).is_err());
        let error=crate::inspection_service::execute(request,|_|panic!("invalid product context must reject before dispatch"),||false,|_|{}).unwrap_err();
        assert_eq!(error,"SESSION_PRODUCT_CONTEXT_INVALID");
    }
}
