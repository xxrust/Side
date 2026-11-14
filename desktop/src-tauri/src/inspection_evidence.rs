//! Evidence delivery checks over observed execution records. No pixel algorithm,
//! scientific rationale, human confirmation or industrial acceptance is inferred.
//! Production JS remains the differential oracle during the migration.
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use crate::inspection_product::{truthy,js_trim,js_string};

pub const BACKEND:&str="rust-native-evidence-v1";
fn list(v:&Value)->&[Value]{v.as_array().map(Vec::as_slice).unwrap_or(&[])}
fn string(v:Option<&Value>)->String{v.map(js_string).unwrap_or_else(||"undefined".into())}
fn keys(v:&Value)->Vec<&str>{
    // ECMAScript enumerates array-index properties before other insertion keys.
    let Some(map)=v.as_object() else{return Vec::new()};
    let mut numeric=Vec::new();let mut other=Vec::new();
    for key in map.keys(){if let Ok(n)=key.parse::<u32>(){if n!=u32::MAX&&n.to_string()==*key{numeric.push((n,key.as_str()));continue;}}other.push(key.as_str());}
    numeric.sort_by_key(|v|v.0);numeric.into_iter().map(|v|v.1).chain(other).collect()
}
fn text(v:&Value)->bool{
    let Some(s)=v.as_str() else{return false};let t=js_trim(s);let lower=t.to_ascii_lowercase();
    !t.is_empty()&&s.encode_utf16().count()<=8000
      && !["todo","tbd","na","n/a","待補","待補充","待填","待填寫","同上","略","無","none"].contains(&lower.as_str())
      && !(t.len()>=2&&t.chars().all(|c|c=='.'))&&!t.chars().all(|c|c=='…')&&!t.chars().all(|c|c=='-'||c=='_')
}
fn issue(code:&str,node:&Value,path:&str,message:&str,hint:Option<&str>)->Value{
    let mut out=json!({"code":code,"nodeId":if node.as_str().is_some_and(|s|!s.is_empty()){node.clone()}else{json!("$pipeline")},"path":path,"message":message});
    if let Some(hint)=hint{out["hint"]=json!(hint);}out
}
fn push(errors:&mut Vec<Value>,code:&str,node:&Value,path:&str,message:&str,hint:Option<&str>){errors.push(issue(code,node,path,message,hint));}
fn unknown(v:&Value,allowed:&[&str],node:&Value,path:&str,errors:&mut Vec<Value>){
    for key in keys(v){if !allowed.contains(&key){push(errors,"UNSUPPORTED_EVIDENCE_FIELD",node,&format!("{path}.{key}"),"依據欄位不在規劃合約內，規劃不能聲稱已完成驗證。",Some("只提交原因、來源與待實算檢查；完成狀態由真實執行產生。"));}}
}
fn absolute(v:&Value)->bool{
    let Some(s)=v.as_str() else{return false};let b=s.as_bytes();
    s.encode_utf16().count()>1&&s.encode_utf16().count()<=4096&&!s.chars().any(|c|c<='\u{1f}')
      &&(s.starts_with('/')||s.starts_with("\\\\")||b.len()>2&&b[0].is_ascii_alphabetic()&&b[1]==b':'&&[b'/',b'\\'].contains(&b[2]))
      &&!s.split(['/', '\\']).any(|part|part=="..")
}
fn positive(v:&Value)->bool{v.as_f64().is_some_and(|n|n>=1.&&n<=9_007_199_254_740_991.&&n.fract()==0.)}
pub fn verified_pixels(image:&Value)->bool{
    if !image.is_object()||image["type"]!="image"{return false;}
    if truthy(&image["dataURL"])||truthy(&image["dataUrl"]){return true;}
    let mime=image["mime"].as_str().unwrap_or("");let hash=image["sha256"].as_str().unwrap_or("");
    if image["hostBytesVerified"]!=true||!["width","height","bytes"].iter().all(|k|positive(&image[*k]))
      ||!mime.to_ascii_lowercase().starts_with("image/")||mime.len()<=6||!mime[6..].bytes().all(|b|b.is_ascii_alphanumeric()||b".+-".contains(&b))
      ||hash.len()!=64||!hash.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b)){return false;}
    if let Some(r)=image.get("assetRef"){
        if !r.is_object()||r["sha256"]!=image["sha256"]||r["mime"]!=image["mime"]
          ||["size","width","height"].iter().any(|key|r.get(*key).is_some_and(|v|v!=&image[if *key=="size"{"bytes"}else{key}])){return false;}
        if let Some(asset)=r.get("$asset"){
            let prefix=format!("assets/{hash}.");let valid=asset.as_str().and_then(|s|s.strip_prefix(&prefix)).is_some_and(|ext|!ext.is_empty()&&ext.bytes().all(|b|b.is_ascii_digit()||b.is_ascii_lowercase()));
            return valid&&r["size"]==image["bytes"]&&r.get("root").is_none_or(absolute);
        }
        return r["kind"]=="algorithm-artifact"&&absolute(&r["path"])&&image.get("path").is_none_or(|path|path==&r["path"]);
    }
    absolute(&image["path"])
}
fn selector(v:&Value,node:&Value,path:&str,artifact_only:bool,artifacts:&[Value],gates:&[Value],pixels:bool,visuals:&[Value],errors:&mut Vec<Value>){
    if !v.is_object(){push(errors,"EVIDENCE_SELECTOR_REQUIRED",node,path,"需要結構化證據選擇器。",Some("使用 capabilities.evidenceContract 中的 artifact、gate 或 execution-status 範例。"));}
    else{
        let mut plain=v.clone();plain.as_object_mut().unwrap().remove("caption");plain.as_object_mut().unwrap().remove("visuals");
        if v["kind"]=="artifact"{
            unknown(&plain,&["kind","type","id"],node,path,errors);
            if !["file","evidence","image","mask","histogram","curves","contours","circles","points"].contains(&v["type"].as_str().unwrap_or("")){
                push(errors,"ARTIFACT_TYPE_INVALID",node,&format!("{path}.type"),"需要已註冊的圖像、曲線或數據產物類型。",Some("從該算子的 evidenceArtifacts 選擇 type。"));
            }
            if v.get("id").is_some_and(|id|!id.as_str().is_some_and(|s|s.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b"_.:-".contains(&b)))){
                push(errors,"ARTIFACT_ID_INVALID",node,&format!("{path}.id"),"產物 id 必須是節點產物 id 或其後綴。",Some("不要使用網址、檔案路徑或未運算的圖片。"));
            }
        }else if !artifact_only&&v["kind"]=="gate"{
            unknown(&plain,&["kind","id"],node,path,errors);
            if !text(&v["id"]){push(errors,"GATE_ID_REQUIRED",node,&format!("{path}.id"),"需要具體的品質閘值 id。",Some("使用該算子 evidenceGates 中的 id；不能以泛稱「品質」代替。"));}
        }else if !artifact_only&&v["kind"]=="execution-status"{
            unknown(&plain,&["kind","allowed"],node,path,errors);
            if !v["allowed"].is_array()||list(&v["allowed"]).is_empty()||list(&v["allowed"]).iter().any(|a|!["OK","FAILED","SKIPPED"].contains(&a.as_str().unwrap_or(""))){
                push(errors,"EXECUTION_STATUS_INVALID",node,&format!("{path}.allowed"),"執行狀態允許值無效。",Some("例如 {kind:\"execution-status\",allowed:[\"OK\"]}；它只驗證執行狀態，不代表量測正確。"));
            }
        }else{push(errors,"EVIDENCE_SELECTOR_KIND",node,&format!("{path}.kind"),if artifact_only{"工具預期證據必須引用實際產物。"}else{"不支持的檢查類型。"},Some(if artifact_only{"使用 {kind:\"artifact\",type:\"evidence\"} 或具體產物。"}else{"僅支持 artifact、gate、execution-status。"}));}
        if v.get("caption").is_some_and(|c|!text(c)){push(errors,"EVIDENCE_CAPTION_REQUIRED",node,&format!("{path}.caption"),"圖像說明不可空白或佔位。",Some("指出本圖可觀察的位置與支持的具體主張。"));}
        if let Some(images)=v.get("visuals"){
            if !images.is_array()||list(images).is_empty()||list(images).len()>12{
                push(errors,"EVIDENCE_VISUALS_INVALID",node,&format!("{path}.visuals"),"專用依據圖必須為1–12項。",Some("引用本次本步save_image產生的圖，不能放網址或其他步驟產物。"));
            }else{for (index,visual) in list(images).iter().enumerate(){
                let p=format!("{path}.visuals[{index}]");unknown(visual,&["id","caption","kind"],node,&p,errors);
                if !visual.is_object()||!text(&visual["caption"]){push(errors,"EVIDENCE_CAPTION_REQUIRED",node,&format!("{p}.caption"),"缺少這張專用圖支持主張的說明。",Some("說明顏色、座標或對比如何支持結論；不能只寫工具名稱。"));}
                let fallback=json!("artifact");let kind=visual.get("kind").filter(|v|truthy(v)).unwrap_or(&fallback);
                if !["artifact","project-image","canvas-asset"].contains(&kind.as_str().unwrap_or("")){push(errors,"EVIDENCE_VISUAL_KIND_INVALID",node,&format!("{p}.kind"),"專用依據圖來源類型無效。",Some("使用 artifact、project-image 或 canvas-asset。"));}
                let image=if kind=="artifact"{artifacts.iter().find(|a|a["type"]=="image"&&a.get("id")==visual.get("id"))}else{visuals.iter().find(|a|a.get("kind")==Some(kind)&&a.get("id")==visual.get("id"))};
                if image.is_none_or(|i|pixels&&!verified_pixels(i)){push(errors,"EVIDENCE_VISUAL_UNAVAILABLE",node,&format!("{p}.id"),"專用依據圖不存在、像素未核驗，或不屬於本次可追溯來源。",Some("可引用本步實算圖，或引用目前專案中已存在的 project-image / canvas-asset；文檔應說明這張圖支持的具體主張。"));}
            }}
        }
    }
    if v["kind"]=="artifact"&&!artifacts.iter().any(|a|a.get("type")==v.get("type")&&(!truthy(&v["id"])||a.get("id")==v.get("id")||format!("{}:{}",js_string(node),string(a.get("id")))==string(v.get("id")))){
        push(errors,"ARTIFACT_SELECTOR_UNSUPPORTED",node,path,"此工具沒有宣告這個真實產物 id/類型。",Some("從工具的 evidenceArtifacts 選擇；此處只是待執行承諾，不是已產生證據。"));
    }
    if v["kind"]=="gate"&&!gates.iter().any(|g|Some(g)==v.get("id")){push(errors,"GATE_SELECTOR_UNSUPPORTED",node,path,"此工具沒有宣告這個品質 gate。",Some("使用工具真實 gateIds；不可把描述文字當成已執行檢查。"));}
}
fn justification(j:&Value,node:&Value,artifacts:&[Value],gates:&[Value],pixels:bool,visuals:&[Value])->Vec<Value>{
    let mut errors=Vec::new();let base=format!("operations.{}.justification",js_string(node));
    if !j.is_null()&&!j.is_object(){push(&mut errors,"JUSTIFICATION_INVALID",node,&base,"舊版說明必須為物件。",None);}
    for (i,v) in list(&j["tool"]["expectedEvidence"]).iter().enumerate(){selector(v,node,&format!("{base}.tool.expectedEvidence[{i}]"),true,artifacts,gates,pixels,visuals,&mut errors);}
    for (i,row) in list(&j["parameters"]).iter().enumerate(){if truthy(&row["verification"]){selector(&row["verification"],node,&format!("{base}.parameters[{i}].verification"),false,artifacts,gates,pixels,visuals,&mut errors);}}
    for (i,row) in list(&j["boundaries"]).iter().enumerate(){if truthy(&row["check"]){selector(&row["check"],node,&format!("{base}.boundaries[{i}].check"),false,artifacts,gates,pixels,visuals,&mut errors);}}
    errors
}
fn mapped_artifacts(artifacts:&[Value])->Vec<Value>{
    // A selector needs descriptors, never a clone of dense artifact.data/layers.
    artifacts.iter().map(|a|{let mut item=json!({});for key in ["id","type","dataURL","dataUrl","hostBytesVerified","width","height","bytes","mime","sha256","assetRef","path"]{if let Some(v)=a.get(key){item[key]=v.clone();}}if item["type"]=="json"{item["type"]=json!("evidence");}item}).collect()
}
fn node_issue(errors:&mut Vec<Value>,node:&Value,code:&str,path:&str,message:&str,hint:Option<&str>){let id=node.get("instanceId").filter(|id|truthy(id)).cloned().unwrap_or(json!("program"));let mut error=issue(code,&id,path,message,hint);error["nodeId"]=id;errors.push(error);}
fn ancestor(ancestor:&Value,child:&Value,by_id:&HashMap<String,&Value>)->bool{
    let mut seen=HashSet::new();let mut node=child.as_str().and_then(|id|by_id.get(id)).copied();
    while let Some(current)=node{if !truthy(&current["parentInstanceId"])||!seen.insert(current["instanceId"].clone()){break;}if &current["parentInstanceId"]==ancestor{return true;}node=current["parentInstanceId"].as_str().and_then(|id|by_id.get(id)).copied();}false
}
pub fn procedure(run:&Value)->Value{
    let Some(trace)=run.get("procedureTrace") else{return undecomposed()};
    if trace["schema"]=="agentcv-procedure-trace-1"&&trace["nodes"].is_array()&&list(&trace["nodes"]).is_empty(){return undecomposed();}
    let mut errors=Vec::new();let mut nodes=Vec::new();
    if trace["schema"]!="agentcv-procedure-trace-1"||!trace["nodes"].is_array(){
        node_issue(&mut errors,&Value::Null,"PROCEDURE_TRACE_INVALID","procedureTrace","程序追蹤格式無效。",Some("使用內建 procedure / step SDK 產生真實執行紀錄。"));
        return json!({"schema":"agentcv-procedure-evidence-audit-1","status":"DIAGNOSTIC_ONLY","delivered":false,"nodes":nodes,"errors":errors});
    }
    let mut by_id=HashMap::new();
    for (i,node) in list(&trace["nodes"]).iter().enumerate(){
        if !node.is_object()||node["instanceId"].as_str().is_none_or(|s|s.is_empty()||by_id.contains_key(s)){
            node_issue(&mut errors,node,"PROCEDURE_INSTANCE_INVALID",&format!("procedureTrace.nodes[{i}]"),"程序執行身份缺失或重複。",Some("每次呼叫由 SDK 產生唯一 instanceId，保留重複執行與迴圈實例。"));continue;
        }
        by_id.insert(node["instanceId"].as_str().unwrap().to_owned(),node);
    }
    let artifacts=list(&run["artifacts"]);let mut producers:HashMap<Value,Value>=HashMap::new();
    for (i,node) in list(&trace["nodes"]).iter().enumerate(){for artifact in list(&node["artifactIds"]){
        let prior=producers.get(artifact);let owner=artifacts.iter().find(|a|a.get("id")==Some(artifact)).map(|a|&a["traceNodeId"]);
        if owner.is_some_and(|o|truthy(o)&&o!=&node["instanceId"]&&!ancestor(&node["instanceId"],o,&by_id))
          ||prior.is_some_and(|p|truthy(p)&&p!=&node["instanceId"]&&!ancestor(p,&node["instanceId"],&by_id)&&!ancestor(&node["instanceId"],p,&by_id)){
            node_issue(&mut errors,node,"PROCEDURE_ARTIFACT_MULTIPLE_PRODUCERS",&format!("procedureTrace.nodes[{i}].artifactIds"),&format!("產物 {} 的所屬程序與實際 producer 不一致。",js_string(artifact)),None);
        }else if prior.is_none_or(|p|!truthy(p)||ancestor(p,&node["instanceId"],&by_id)){producers.insert(artifact.clone(),node["instanceId"].clone());}
    }}
    for (i,node) in list(&trace["nodes"]).iter().enumerate(){
        if !node.is_object(){continue;}let start=errors.len();let base=format!("procedureTrace.nodes[{i}]");let node_id=node.get("instanceId").filter(|v|truthy(v)).cloned().unwrap_or(json!(format!("node-{i}")));
        let mut fail=|code,path:&str,message,hint|node_issue(&mut errors,node,code,path,message,hint);
        if truthy(&node["parentInstanceId"])&&!node["parentInstanceId"].as_str().is_some_and(|id|by_id.contains_key(id)){fail("PROCEDURE_PARENT_MISSING",&format!("{base}.parentInstanceId"),"父程序執行紀錄不存在。",Some("保留完整執行追蹤，不以標籤推測父子關係。"));}
        if !["procedure","step"].contains(&node["kind"].as_str().unwrap_or(""))||!["SUCCEEDED","FAILED","SKIPPED"].contains(&node["status"].as_str().unwrap_or("")){fail("PROCEDURE_STATUS_INVALID",&format!("{base}.status"),"程序種類或終止狀態無效。",Some("已完成執行不能保留 RUNNING；NG/UNKNOWN 放 judgement 而非執行狀態。"));}
        if !node["judgement"].is_null()&&!["OK","NG","UNKNOWN"].contains(&node["judgement"].as_str().unwrap_or("")){fail("PROCEDURE_JUDGEMENT_INVALID",&format!("{base}.judgement"),"檢測判定無效。",Some("使用 OK、NG、UNKNOWN；計算錯誤另外記錄 FAILED。"));}
        if !node["parameters"].is_object()||!node["outputs"].is_object(){fail("PROCEDURE_VALUES_INVALID",&base,"缺少程序的具名參數或實際輸出物件。",Some("使用 parameters={} 與 set_output(name,value)，不要把宣告輸出冒充實算。"));}
        if !node["artifactIds"].is_array()||list(&node["artifactIds"]).iter().any(|id|!id.is_string()||!artifacts.iter().any(|a|a.get("id")==Some(id))){fail("PROCEDURE_ARTIFACT_BINDING_INVALID",&format!("{base}.artifactIds"),"程序引用的產物不存在或綁定格式無效。",Some("由 save_image/save_json 記錄實際產物，不自造輸出ID。"));}
        for dependency in list(&node["dependencyInstances"]){if dependency.as_str().and_then(|id|by_id.get(id)).is_none_or(|up|node["status"]=="SUCCEEDED"&&up["status"]!="SUCCEEDED"){
            fail("PROCEDURE_DEPENDENCY_UNAVAILABLE",&format!("{base}.dependencyInstances"),"依賴不存在或上游未成功，不能作為本步有效前提。",Some("先修正並重算上游；前提不足應記錄跳過與原因。"));
        }}
        let choices_all=mapped_artifacts(artifacts);let mut choices:Vec<_>=choices_all.into_iter().filter(|a|list(&node["artifactIds"]).contains(&a["id"])).collect();
        if node["status"]=="SKIPPED"{for s in list(&node["justification"]["tool"]["expectedEvidence"]){if s["kind"]=="artifact"{let mut a=json!({});for key in ["id","type"]{if let Some(v)=s.get(key){a[key]=v.clone();}}choices.push(a);}}}
        let checks=list(&node["outputs"]["boundaryChecks"]);
        let gates:Vec<_>=if node["status"]=="SKIPPED"{list(&node["justification"]["boundaries"]).iter().filter(|r|r["check"]["kind"]=="gate").map(|r|r["check"]["id"].clone()).collect()}else{checks.iter().map(|c|c["id"].clone()).collect()};
        for name in keys(&node["parameters"]){let source=node["parameterSources"].get(name).filter(|s|truthy(s)).cloned().unwrap_or(json!("agent-proposal"));if !["agent-proposal","human-input","operator-default","data-derived","not-supplied"].contains(&source.as_str().unwrap_or("")){
            node_issue(&mut errors,node,"PROCEDURE_PARAMETER_SOURCE_INVALID",&format!("{base}.parameterSources.{name}"),"程序參數來源不在合約中。",Some("來源是作者聲明，使用 agent-proposal/human-input/operator-default/data-derived/not-supplied 並提供真實證據。"));
        }}
        for mut error in justification(&node["justification"],&node_id,&choices,&gates,node["status"]!="SKIPPED",list(&run["evidenceVisuals"])){
            error["path"]=json!(error["path"].as_str().unwrap().replacen(&format!("operations.{}",js_string(&node_id)),&base,1));errors.push(error);
        }
        if node["status"]=="FAILED"{node_issue(&mut errors,node,"PROCEDURE_EXECUTION_FAILED",&format!("{base}.status"),"此程序執行失敗，不能交付其檢測結果。",Some("檢查 error/traceback，修正後重算；保留失敗歷史。"));}
        if node["status"]=="SKIPPED"&&!truthy(&node["skipReason"]){node_issue(&mut errors,node,"PROCEDURE_SKIP_REASON_REQUIRED",&format!("{base}.skipReason"),"跳過程序缺少實際原因。",Some("以 skip_step 或 run_step 保存條件／依賴不滿足的原因。"));}
        if node["status"]=="SUCCEEDED"{
            let selectors=list(&node["justification"]["parameters"]).iter().map(|r|(&r["verification"],format!("{base}.justification.parameters.{}.verification",string(r.get("name")))))
                .chain(list(&node["justification"]["boundaries"]).iter().enumerate().map(|(i,r)|(&r["check"],format!("{base}.justification.boundaries[{i}].check"))));
            for (s,path) in selectors{if s["kind"]=="gate"&&checks.iter().find(|c|c.get("id")==s.get("id")).is_none_or(|c|c["status"]!="PASS"||c.get("actual").is_none()||c.get("threshold").is_none()){
                node_issue(&mut errors,node,"PROCEDURE_BOUNDARY_NOT_ESTABLISHED",&path,"步驟邊界未有 PASS、實際觀察值與比較條件。",Some("在本步 outputs.boundaryChecks 保存 {id,status,actual,threshold}；FAIL/NOT_EVALUATED 保留為診斷，不補造成功。"));
            }}
        }
        nodes.push(json!({"nodeId":node_id,"status":if errors.len()>start{"DIAGNOSTIC_ONLY"}else if node["status"]=="SKIPPED"{"NOT_EXECUTED"}else{"READY_FOR_REVIEW"},"delivered":false,"errors":errors[start..]}));
    }
    json!({"schema":"agentcv-procedure-evidence-audit-1","status":if errors.is_empty(){"READY_FOR_REVIEW"}else{"DIAGNOSTIC_ONLY"},"delivered":false,"nodes":nodes,"errors":errors,"scope":"程序執行結構及實際產物／邊界引用核對；不是獨立精度驗證或工業驗收。"})
}
fn undecomposed()->Value{json!({"schema":"agentcv-procedure-evidence-audit-1","status":"UNDECOMPOSED","delivered":false,"nodes":[],"errors":[],"scope":"未記錄內部程序單元；僅能查看整段程式，不能推定內部步驟已逐一審核。"})}
fn resolve(run:&Value,s:&Value,path:&str,errors:&mut Vec<Value>){
    if !truthy(s){return;}let artifacts=list(&run["artifacts"]);let checks=list(&run["result"]["boundaryChecks"]);
    let message=if s["kind"]=="execution-status"{if run["status"]!="SUCCEEDED"{Some("程式未成功完成".to_owned())}else{None}}
      else if s["kind"]=="artifact"{if !artifacts.iter().any(|a|(if a["type"]=="json"{json!("evidence")}else{a["type"].clone()})==s["type"]&&(!truthy(&s["id"])||a.get("id")==s.get("id"))){Some("未產生所引用的實際輸出".into())}else{None}}
      else{match checks.iter().find(|c|c.get("id")==s.get("id")){
        None=>Some("程式未回傳有效邊界觀察".into()),Some(c) if !["PASS","FAIL","NOT_EVALUATED"].contains(&c["status"].as_str().unwrap_or(""))=>Some("程式未回傳有效邊界觀察".into()),
        Some(c) if c["status"]!="PASS"=>Some(format!("邊界自檢 {}，保留拒因或未知",string(c.get("status")))),
        Some(c) if c.get("actual").is_none()||c.get("threshold").is_none()=>Some("邊界自檢需保存實際觀察 actual 與比較條件 threshold，不以 PASS 文字代替".into()),_=>None}};
    if let Some(message)=message{errors.push(json!({"path":path,"message":message}));}
}
pub fn audit(run:&Value,expected:&[Value])->Value{
    let mut errors=list(&run["dataContractAudit"]["errors"]).to_vec();let artifacts=mapped_artifacts(list(&run["artifacts"]));
    let gates:Vec<_>=list(&run["result"]["boundaryChecks"]).iter().map(|c|c["id"].clone()).collect();
    errors.extend(justification(&run["justification"],&json!("program"),&artifacts,&gates,true,list(&run["evidenceVisuals"])).into_iter().filter(|e|["EVIDENCE_VISUALS_INVALID","EVIDENCE_VISUAL_UNAVAILABLE","EVIDENCE_CAPTION_REQUIRED"].contains(&e["code"].as_str().unwrap_or(""))||e["path"].as_str().is_some_and(|p|p.contains(".visuals["))));
    for output in expected{if !artifacts.iter().any(|a|a.get("id")==output.get("id")&&a.get("type")==output.get("type")){errors.push(json!({"path":format!("expected_outputs.{}",string(output.get("id"))),"message":"預期產物未產生"}));}}
    for (i,s) in list(&run["justification"]["tool"]["expectedEvidence"]).iter().enumerate(){resolve(run,s,&format!("tool.expectedEvidence.{i}"),&mut errors);}
    for row in list(&run["justification"]["parameters"]){resolve(run,&row["verification"],&format!("parameters.{}.verification",string(row.get("name"))),&mut errors);}
    for (i,row) in list(&run["justification"]["boundaries"]).iter().enumerate(){resolve(run,&row["check"],&format!("boundaries.{i}.check"),&mut errors);}
    let p=procedure(run);errors.extend(list(&p["errors"]).iter().cloned());
    let mut audit=json!({"schema":"agentcv-algorithm-evidence-audit-1","procedureStatus":p["status"],"procedureAudit":p,"status":if run["status"]=="SUCCEEDED"&&run["execution"]["status"]!="FAULT"&&errors.is_empty(){"READY_FOR_REVIEW"}else{"DIAGNOSTIC_ONLY"},"delivered":false,"errors":errors,"scope":"保存的程式自檢及產物引用核對；不是獨立精度驗證、人工採用或正式發布。"});
    let unavailable:Vec<_>=list(&run["artifacts"]).iter().filter(|a|crate::artifact_capture::verified(a)).map(|a|a["id"].clone()).collect();
    if !unavailable.is_empty(){audit["uncapturedArtifacts"]=json!(unavailable);}
    audit
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn archived_success_does_not_establish_unavailable_visual_pixels(){
        let fixture:Value=serde_json::from_str(include_str!("../../qa/fixtures/execution-facts-record.json")).unwrap();
        let run=&fixture["run"];
        // The historical receipt predates the current evidence contract. Its
        // successful label cannot substitute for unavailable current pixels.
        // Full same-input equivalence is checked against production JS in QA.
        assert_eq!(run["evidenceAudit"]["status"],"READY_FOR_REVIEW");
        let actual=audit(run,list(&run["expectedOutputs"]));
        assert_eq!(actual["status"],"DIAGNOSTIC_ONLY");
        assert_eq!(list(&actual["errors"]).len(),12);
        assert!(list(&actual["errors"]).iter().all(|error|error["code"]=="EVIDENCE_VISUAL_UNAVAILABLE"));
        assert_eq!(list(&actual["procedureAudit"]["errors"]).len(),8);
    }
}
