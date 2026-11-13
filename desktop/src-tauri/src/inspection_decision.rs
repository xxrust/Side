//! Workpiece decisions over recorded facts. No image processing or thresholds
//! live here: the compiled scheme supplies the same rules as the JS oracle.
use serde_json::{json, Value};
use std::collections::BTreeMap;
fn list(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v[key].as_str().unwrap_or("")
}
fn kind(metric: &Value) -> &str {
    metric["type"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("number")
}
fn equal(a: &Value, b: &Value) -> bool {
    if a.is_number() && b.is_number() {
        a.as_f64() == b.as_f64()
    } else {
        a == b
    }
}
fn includes(values: &Value, v: &Value) -> bool {
    list(values).iter().any(|x| equal(x, v))
}
fn accepts(metric: &Value, v: &Value) -> bool {
    match kind(metric) {
        "number" => v.as_f64().is_some_and(f64::is_finite),
        "boolean" => v.is_boolean(),
        _ => includes(&metric["values"], v),
    }
}
fn push_unique(values: &mut Vec<Value>, v: Value) {
    if !values.contains(&v) {
        values.push(v)
    }
}
fn priority(order: &Value, id: &Value) -> isize {
    list(order)
        .iter()
        .position(|v| v == id)
        .map(|i| i as isize)
        .unwrap_or(-1)
}
fn category<'a>(spec: &'a Value, id: &Value) -> &'a Value {
    list(&spec["categories"])
        .iter()
        .find(|c| c["id"] == *id)
        .unwrap_or(&Value::Null)
}
fn label<'a>(v: &'a Value, key: &str, fallback: &'a str) -> &'a str {
    v[key]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback)
}

fn evaluate(rule: &Value, values: &BTreeMap<String, Option<Value>>) -> Option<bool> {
    if rule.get("all").is_some() || rule.get("any").is_some() {
        let all = rule.get("all").is_some();
        let checks: Vec<_> = list(&rule[if all { "all" } else { "any" }])
            .iter()
            .map(|r| evaluate(r, values))
            .collect();
        return if all {
            if checks.contains(&Some(false)) {
                Some(false)
            } else if checks.contains(&None) {
                None
            } else {
                Some(true)
            }
        } else if checks.contains(&Some(true)) {
            Some(true)
        } else if checks.contains(&None) {
            None
        } else {
            Some(false)
        };
    }
    if let Some(not) = rule.get("not") {
        return evaluate(not, values).map(|v| !v);
    }
    let value = values.get(text(rule, "metric"))?.as_ref()?;
    if let Some(target) = rule.get("equals") {
        return Some(equal(value, target));
    }
    if let Some(target) = rule.get("in") {
        return Some(includes(target, value));
    }
    let x = value.as_f64()?;
    let interval = &rule["interval"];
    let min = interval["min"].as_f64()?;
    let max = interval["max"].as_f64()?;
    Some(
        (x > min || interval["includeMin"] == true && x == min)
            && (x < max || interval["includeMax"] == true && x == max),
    )
}

pub fn classify(spec: &Value, observations: &Value, faults: &[Value]) -> Value {
    if !faults.is_empty() {
        return json!({"valid":false,"status":"FAULT","categoryId":null,"categoryIds":[],"defectLabels":[],"quality":null,"faults":faults});
    }
    let input: BTreeMap<_, _> = list(observations)
        .iter()
        .map(|o| (text(o, "metric"), o))
        .collect();
    let mut values = BTreeMap::new();
    let mut missing = Vec::new();
    let mut decisions = Vec::new();
    for metric in list(&spec["metrics"]) {
        let id = text(metric, "id");
        let observation = input.get(id).copied();
        let reason = match observation {
            None => Some("MISSING"),
            Some(o) if matches!(text(o, "status"), "NOT_FOUND" | "MISSING" | "SKIPPED") => {
                Some(text(o, "status"))
            }
            Some(o) if o["valid"] == false => Some("NOT_FOUND"),
            Some(o) if !accepts(metric, &o["value"]) => Some("MISSING"),
            Some(o)
                if kind(metric) == "number"
                    && (o["value"].as_f64() < metric["range"]["min"].as_f64()
                        || o["value"].as_f64() > metric["range"]["max"].as_f64()) =>
            {
                Some("MISSING")
            }
            _ => None,
        };
        let value = if reason.is_none() {
            observation.unwrap()["value"].clone()
        } else {
            Value::Null
        };
        values.insert(
            id.to_owned(),
            if reason.is_none() {
                Some(value.clone())
            } else {
                None
            },
        );
        let cats = if let Some(reason) = reason {
            let c = spec["missing"][reason].clone();
            missing.push(c.clone());
            vec![c]
        } else {
            Vec::new()
        };
        decisions.push(json!({"metric":id,"value":value,"status":reason.unwrap_or("MEASURED"),"categoryIds":cats}));
    }
    let all_matched: Vec<_> = list(&spec["rules"])
        .iter()
        .filter(|r| evaluate(&r["when"], &values) == Some(true))
        .collect();
    let mut defects = Vec::new();
    for rule in &all_matched {
        if let Some(labels) = rule["defectLabels"].as_array() {
            for v in labels {
                push_unique(&mut defects, v.clone());
            }
        } else if category(spec, &rule["categoryId"])["quality"] == "bad" {
            push_unique(&mut defects, rule["categoryId"].clone());
        }
    }
    let mut matched = all_matched.clone();
    if spec["conflicts"]["mode"] == "priority" {
        matched.sort_by_key(|r| priority(&spec["conflicts"]["priority"], &r["id"]));
        matched.truncate(1);
    }
    let mut ids = Vec::new();
    for id in missing
        .into_iter()
        .chain(matched.iter().map(|r| r["categoryId"].clone()))
    {
        push_unique(&mut ids, id);
    }
    if ids.is_empty() && spec["coverage"]["policy"] == "fallback" {
        ids.push(spec["coverage"]["fallbackCategoryId"].clone());
    }
    if spec["aggregation"]["mode"] == "priority" {
        ids.sort_by_key(|id| priority(&spec["aggregation"]["priority"], id));
        ids.truncate(1);
    } else if spec["aggregation"]["mode"] == "all-good" {
        let bad: Vec<_> = ids
            .iter()
            .filter(|id| category(spec, id)["quality"] == "bad")
            .cloned()
            .collect();
        let unknown: Vec<_> = ids
            .iter()
            .filter(|id| category(spec, id)["quality"] == "undetermined")
            .cloned()
            .collect();
        if !bad.is_empty() {
            ids = bad
        } else if !unknown.is_empty() {
            ids = unknown
        }
    }
    if ids.len() != 1 {
        return json!({"valid":false,"status":"CLASSIFICATION_CONTRACT_ERROR","categoryId":null,"categoryIds":[],"defectLabels":defects,"quality":null,"reason":"FINAL_CATEGORY_NOT_UNIQUE","candidates":ids,"decisions":decisions});
    }
    json!({"valid":true,"status":"CLASSIFIED","categoryId":ids[0],"categoryIds":ids,"defectLabels":defects,"quality":category(spec,&ids[0])["quality"],
  "ruleIds":matched.iter().map(|r|&r["id"]).collect::<Vec<_>>(),"matchedRuleIds":all_matched.iter().map(|r|&r["id"]).collect::<Vec<_>>(),"decisions":decisions})
}

fn output_refs(node: Option<&Value>, run: Option<&Value>) -> Vec<Value> {
    let outputs = node
        .and_then(|n| n.get("expected_outputs"))
        .or_else(|| run.and_then(|r| r.get("expectedOutputs")))
        .unwrap_or(&Value::Null);
    list(outputs).iter().filter(|a|a["type"]=="image"&&a["role"]=="result").map(|a|json!({"nodeId":node.map(|n|&n["id"]).or_else(||run.map(|r|&r["schemeNodeId"])),"artifactId":a["id"]})).collect()
}
fn condition_metrics(rule: &Value, out: &mut Vec<Value>) {
    if rule.get("all").is_some() || rule.get("any").is_some() {
        for r in list(rule.get("all").or_else(|| rule.get("any")).unwrap()) {
            condition_metrics(r, out)
        }
    } else if let Some(not) = rule.get("not") {
        condition_metrics(not, out)
    } else if let Some(metric) = rule.get("metric") {
        out.push(metric.clone())
    }
}
fn append_reason(
    model: &mut Value,
    mut reason: Value,
    refs: Vec<Value>,
    record: &Value,
    runs: &[Value],
) {
    let mut images = Vec::new();
    for reference in refs {
        if let Some(run) = runs
            .iter()
            .rev()
            .find(|r| r["schemeNodeId"] == reference["nodeId"])
        {
            if !includes(&record["runIds"], &run["runId"])
                || run["workpieceUnit"]["id"] != record["unitId"]
                || list(&record["imageIds"]).len() != list(&run["workpieceUnit"]["imageIds"]).len()
                || !list(&record["imageIds"])
                    .iter()
                    .all(|id| includes(&run["workpieceUnit"]["imageIds"], id))
            {
                continue;
            }
            if let Some(a) = list(&run["artifacts"])
                .iter()
                .find(|a| a["id"] == reference["artifactId"] && a["type"] == "image")
            {
                if !images
                    .iter()
                    .any(|i: &Value| i["runId"] == run["runId"] && i["artifactId"] == a["id"])
                {
                    let mut image = json!({"runId":run["runId"],"nodeId":reference["nodeId"],"artifactId":a["id"],"label":label(&reference,"label",label(a,"name",text(a,"id")))});
                    if let Some(hash) = a.get("sha256") {
                        image["sha256"] = hash.clone()
                    }
                    images.push(image);
                }
            }
        }
    }
    reason["unavailable"] = json!(images.is_empty());
    reason["images"] = json!(images);
    model["reasons"].as_array_mut().unwrap().push(reason);
}
pub fn evidence(scheme: &Value, record: &Value, runs: &Value) -> Value {
    let spec = &scheme["classificationSpec"];
    let nodes = list(&scheme["operatorGraph"]["nodes"]);
    let runs = list(runs);
    let result = &record["result"];
    let state = record["execution"]
        .as_str()
        .unwrap_or(text(&record["execution"], "status"));
    let mut model = json!({"schema":"agentcv-decision-evidence-1","unitId":record["unitId"],"imageIds":record["imageIds"],"schemeFingerprint":record["schemeFingerprint"],"categoryId":result.get("categoryId").unwrap_or(&Value::Null),"status":state,"reasons":[],
  "notExecuted":list(&record["nodeStates"]).iter().filter(|s|s["status"]=="SKIPPED").map(|s|{let mut v=json!({"nodeId":s["nodeId"]});if let Some(reason)=s.get("reason"){v["reason"]=reason.clone()}v}).collect::<Vec<_>>()});
    let actual = |run: &&Value| {
        includes(&record["runIds"], &run["runId"])
            && run["workpieceUnit"]["id"] == record["unitId"]
            && list(&record["imageIds"]).len() == list(&run["workpieceUnit"]["imageIds"]).len()
            && list(&record["imageIds"])
                .iter()
                .all(|id| includes(&run["workpieceUnit"]["imageIds"], id))
    };
    let node = |id: &Value| nodes.iter().find(|n| n["id"] == *id);
    let run_for = |id: &Value| runs.iter().rev().find(|r| r["schemeNodeId"] == *id);
    let mut add = |reason, refs| append_reason(&mut model, reason, refs, record, runs);
    if state == "CANCELLED" {
        return model;
    }
    if state == "FAULT" {
        let run = runs.iter().rev().find(|r| {
            actual(r) && r["status"] == "SUCCEEDED" && r["execution"]["status"] != "FAULT"
        });
        add(
            json!({"id":"fault","title":"執行故障","kind":"fault","basis":"last-valid-before-fault","note":"以下僅為故障前最後有效圖，不是本件分類結果。"}),
            run.map(|r| output_refs(node(&r["schemeNodeId"]), Some(r)))
                .unwrap_or_default(),
        );
        return model;
    }
    if result["valid"] != true {
        return model;
    }
    let category = category(spec, &result["categoryId"]);
    let category_title = label(category, "label", text(result, "categoryId"));
    if result["quality"] == "good" {
        let run = runs.iter().rev().find(|r| {
            actual(r)
                && r["status"] == "SUCCEEDED"
                && !output_refs(node(&r["schemeNodeId"]), Some(r)).is_empty()
        });
        let declared = category.get("evidence");
        add(
            json!({"id":format!("category:{}",text(result,"categoryId")),"title":category_title,"kind":"category","basis":if declared.is_some(){"declared"}else{"last-declared-result"},"note":if declared.is_some(){"方案指定的結果總覽圖"}else{"本次最後執行節點所宣告的結果圖"}}),
            declared.map(|v| list(v).to_vec()).unwrap_or_else(|| {
                run.map(|r| output_refs(node(&r["schemeNodeId"]), Some(r)))
                    .unwrap_or_default()
            }),
        );
        return model;
    }
    let matched = result.get("matchedRuleIds").unwrap_or(&result["ruleIds"]);
    let mut rules: Vec<_> = list(&spec["rules"])
        .iter()
        .filter(|r| includes(matched, &r["id"]))
        .collect();
    rules.sort_by_key(|r| {
        (
            r["categoryId"] != result["categoryId"],
            priority(&spec["conflicts"]["priority"], &r["id"]),
        )
    });
    for rule in rules {
        let mut metrics = Vec::new();
        condition_metrics(&rule["when"], &mut metrics);
        let observations: Vec<_> = list(&record["observations"])
            .iter()
            .filter(|o| metrics.contains(&o["metric"]))
            .cloned()
            .collect();
        let declared = rule.get("evidence");
        let refs = declared.map(|v| list(v).to_vec()).unwrap_or_else(|| {
            observations
                .iter()
                .flat_map(|o| output_refs(node(&o["nodeId"]), run_for(&o["nodeId"])))
                .collect()
        });
        add(
            json!({"id":format!("rule:{}",text(rule,"id")),"ruleId":rule["id"],"title":label(rule,"label",label(category_fn(spec,&rule["categoryId"]),"label",text(rule,"id"))),"kind":"rule","categoryId":rule["categoryId"],"primary":rule["categoryId"]==result["categoryId"],"basis":if declared.is_some(){"declared"}else{"metric-producer"},"condition":rule["when"],"observations":observations,"note":if declared.is_some(){"命中規則指定的依據圖"}else{"沿命中規則的量測來源，顯示該節點的結果圖"}}),
            refs,
        );
    }
    for decision in list(&result["decisions"])
        .iter()
        .filter(|d| d["status"] != "MEASURED")
    {
        let metric = list(&spec["metrics"])
            .iter()
            .find(|m| m["id"] == decision["metric"]);
        let observation = list(&record["observations"])
            .iter()
            .find(|o| o["metric"] == decision["metric"]);
        fn walk(id: &Value, states: &[Value], producers: &mut Vec<Value>) {
            if id.is_null() || producers.contains(id) {
                return;
            }
            producers.push(id.clone());
            if let Some(s) = states
                .iter()
                .find(|s| s["nodeId"] == *id && s["status"] == "SKIPPED")
            {
                for p in list(&s["blockedBy"]) {
                    walk(p, states, producers)
                }
            }
        }
        let mut producers = Vec::new();
        if let Some(o) = observation {
            walk(&o["nodeId"], list(&record["nodeStates"]), &mut producers)
        }
        let declared = metric.and_then(|m| m.get("evidence"));
        let refs = declared.map(|v| list(v).to_vec()).unwrap_or_else(|| {
            producers
                .iter()
                .flat_map(|id| output_refs(node(id), run_for(id)))
                .collect()
        });
        add(
            json!({"id":format!("missing:{}",text(decision,"metric")),"metric":decision["metric"],"title":format!("{} · {}",metric.map(|m|label(m,"label",text(decision,"metric"))).unwrap_or(text(decision,"metric")),text(decision,"status")),"kind":"missing","primary":includes(&decision["categoryIds"],&result["categoryId"]),"basis":if declared.is_some(){"declared"}else{"missing-producer"},"observations":observation.map(|o|vec![o.clone()]).unwrap_or_default(),"note":"量測未取得；沿實際前提失效鏈查找證據。"}),
            refs,
        );
    }
    drop(add);
    model["reasons"]
        .as_array_mut()
        .unwrap()
        .sort_by_key(|r| r["primary"] != true);
    if list(&model["reasons"]).is_empty() {
        append_reason(
            &mut model,
            json!({"id":format!("category:{}",text(result,"categoryId")),"title":category_title,"kind":"category","basis":if category.get("evidence").is_some(){"declared"}else{"unavailable"},"note":"本件由分類保底規則決定；沒有逐條命中依據。"}),
            list(&category["evidence"]).to_vec(),
            record,
            runs,
        );
    }
    model
}
// A separate name avoids shadowing the lookup when a selected category is held.
fn category_fn<'a>(spec: &'a Value, id: &Value) -> &'a Value {
    category(spec, id)
}

pub fn observe(scheme: &Value, session: &Value) -> Value {
    fn lookup(value: Option<&Value>, keys: &[&str]) -> Option<Value> {
        let value = value?;
        let Some((key, rest)) = keys.split_first() else {
            return Some(value.clone());
        };
        if let Some(a) = value.as_array() {
            if *key == "length" {
                return lookup(Some(&json!(a.len())), rest);
            }
            return key
                .parse::<usize>()
                .ok()
                .filter(|i| i.to_string() == *key)
                .and_then(|i| lookup(a.get(i), rest));
        }
        if let Some(s) = value.as_str() {
            if *key == "length" {
                return lookup(Some(&json!(s.encode_utf16().count())), rest);
            }
        }
        lookup(value.get(*key), rest)
    }
    let runs = list(&session["runs"]);
    let states = list(&session["nodeStates"]);
    json!(list(&scheme["classificationSpec"]["metrics"]).iter().map(|metric|{
  let candidates:Vec<_>=list(&scheme["metricBindings"]).iter().filter(|b|b["metric"]==metric["id"]).map(|binding|{
   let run=runs.iter().find(|r|r["schemeNodeId"]==binding["nodeId"]);
   let state=states.iter().find(|s|s["nodeId"]==binding["nodeId"]).and_then(|s|s["status"].as_str()).unwrap_or_else(||match run{
    None=>"SKIPPED",Some(r) if r["execution"]["status"]=="FAULT"||r["status"]!="SUCCEEDED"=>"FAULT",Some(r) if r["result"]["valid"]==false=>"NOT_FOUND",_=>"VALID"});
   let value=lookup(run.map(|r|&r["result"]),&text(binding,"path").split('.').collect::<Vec<_>>());
   let valid=state=="VALID"&&value.as_ref().is_some_and(|v|!v.is_null());
   let mut observation=json!({"metric":metric["id"],"value":if valid{value.as_ref().unwrap()}else{&Value::Null},"valid":valid,"status":if valid{"MEASURED"}else if state=="NOT_FOUND"{"NOT_FOUND"}else if state=="SKIPPED"{"SKIPPED"}else{"MISSING"},"nodeId":binding["nodeId"]});
   if let Some(id)=run.and_then(|r|r.get("runId")){observation["runId"]=id.clone()}observation
  }).collect();
  candidates.iter().find(|c|c["valid"]==true).or_else(||candidates.iter().find(|c|c["status"]=="NOT_FOUND")).or_else(||candidates.first()).cloned().unwrap_or_else(||json!({"metric":metric["id"],"status":"MISSING"}))
 }).collect::<Vec<_>>())
}

pub fn decide(request: &Value, session: &Value, cancelled: bool) -> Value {
    let scheme = &request["scheme"];
    let observations = observe(scheme, session);
    let mut faults: Vec<Value> = list(&session["nodeStates"])
        .iter()
        .filter(|n| n["ownStatus"] == "FAULT")
        .cloned()
        .collect();
    let mut result = if cancelled {
        json!({"valid":false,"status":"CANCELLED","categoryId":null,"categoryIds":[],"defectLabels":[],"quality":null})
    } else {
        classify(&scheme["classificationSpec"], &observations, &faults)
    };
    if !cancelled
        && faults.is_empty()
        && (result["valid"] != true || list(&result["categoryIds"]).len() != 1)
    {
        faults.push(json!({"phase":"classification","reason":"FINAL_CATEGORY_NOT_UNIQUE","status":"FAULT","details":result}));
        result["status"] = json!("FAULT");
        result["faults"] = json!(faults);
    }
    let mut record = json!({"unitId":request["unitId"],"imageIds":request["shared"]["workpieceUnit"]["imageIds"],"schemeFingerprint":request["fingerprint"],
  "execution":{"status":if cancelled{"CANCELLED"}else if faults.is_empty(){"COMPLETED"}else{"FAULT"}},"result":result,"observations":observations,"nodeStates":session["nodeStates"],
  "runIds":list(&session["runs"]).iter().map(|r|&r["runId"]).collect::<Vec<_>>()});
    record["decisionEvidence"] = evidence(scheme, &record, &session["runs"]);
    json!({"observations":observations,"result":result,"decisionEvidence":record["decisionEvidence"],"faults":faults,"cancelled":cancelled})
}
