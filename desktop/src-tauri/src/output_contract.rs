//! Port semantics for native sessions, matching src/data-contract.js. This gate
//! runs before the scheduler can expose an output to a downstream algorithm.
use serde_json::{json, Map, Value};
fn list(v: &Value) -> &[Value] { v.as_array().map(Vec::as_slice).unwrap_or(&[]) }
fn nonempty(v: &Value) -> bool { v.as_str().is_some_and(|s| !s.is_empty()) }
fn fields(v: &Value, keys: &[&str]) -> bool {
    v.as_object().is_some_and(|o| o.len() == keys.len() && keys.iter().all(|k| o.contains_key(*k)))
}
fn coordinates(v: &Value) -> bool {
    if !fields(v, &["frame", "unit"]) || !matches!(v["unit"].as_str(), Some("px" | "mm" | "m")) { return false; }
    let frame = &v["frame"];
    match frame["kind"].as_str() {
        Some("input" | "reference") => fields(frame, &["kind", "slot"]) && nonempty(&frame["slot"]),
        Some("artifact") => fields(frame, &["kind", "nodeId", "artifactId"]) && nonempty(&frame["nodeId"]) && nonempty(&frame["artifactId"]),
        _ => false,
    }
}
pub fn valid_definition(v: &Value) -> bool {
    match v["kind"].as_str() {
        Some("image" | "mask" | "points" | "contours" | "roi") => fields(v, &["kind", "coordinates"]) && coordinates(&v["coordinates"]),
        Some("homography") => fields(v, &["kind", "from", "to"]) && coordinates(&v["from"]) && coordinates(&v["to"]),
        Some("measurement") => fields(v, &["kind", "unit"]) && nonempty(&v["unit"]),
        Some("classification") => fields(v, &["kind", "categories"]) && v["categories"].as_array().is_some_and(|a|
            !a.is_empty() && a.iter().all(nonempty) && a.iter().enumerate().all(|(i, v)| !a[..i].contains(v))),
        Some("json" | "file") => fields(v, &["kind"]),
        _ => false,
    }
}
fn frames(contract: &Value) -> Vec<&Value> {
    ["coordinates", "from", "to"].iter().filter_map(|k| contract.get(*k)).collect()
}
fn select_fields(source: &Value, fields: &[&str]) -> Map<String, Value> {
    fields.iter().filter_map(|key| source.get(*key).map(|v| ((*key).into(), v.clone()))).collect()
}
fn truthy_string(v: Option<&Value>) -> Option<&Value> { v.filter(|v| v.as_str().is_some_and(|s| !s.is_empty())) }
fn truthy(v: &Value) -> bool {
    match v { Value::Null => false, Value::Bool(b) => *b, Value::String(s) => !s.is_empty(), Value::Number(n) => n.as_f64() != Some(0.), _ => true }
}
fn frame_binding(coordinates: &Value, run: &Value, scheme: &Value, upstream: &Value) -> Option<Value> {
    let f = &coordinates["frame"];
    if matches!(f["kind"].as_str(), Some("input" | "reference")) {
        let slot = f["slot"].as_str()?;
        let slots = list(&scheme["execution"]["inputSlots"]);
        let unit = &run["workpieceUnit"];
        let id = if f["kind"] == "reference" {
            truthy_string(run["referenceInputs"][slot].get("id")).or_else(|| truthy_string(scheme["execution"]["referenceInputs"].get(slot)))
        } else {
            truthy_string(unit["views"].get(slot))
                .or_else(|| (slots.len() == 1 && slots[0]["id"] == slot).then(|| unit["imageIds"].get(0)).flatten())
                .or_else(|| (unit.is_null() && slot == "image" && list(&run["sourceBinding"]["images"]).len() == 1)
                    .then(|| run["sourceBinding"]["images"][0].get("imageId")).flatten())
        }?;
        let image = list(&run["sourceBinding"]["images"]).iter().find(|image| image["imageId"] == *id)?;
        let mut binding = select_fields(image, &["width", "height"]);
        binding.insert("frame".into(), f.clone()); binding.insert("unit".into(), coordinates["unit"].clone()); binding.insert("imageId".into(), id.clone());
        if let Some(hash) = truthy_string(image.get("contentSha256")).or_else(|| image.get("imageSha256")) { binding.insert("contentSha256".into(), hash.clone()); }
        return Some(Value::Object(binding));
    }
    let own = f["nodeId"] == run["schemeNodeId"];
    let entry = if own {
        list(&run["artifacts"]).iter().find(|a| a["id"] == f["artifactId"]).map(|a| (&run["runId"], a))
    } else {
        upstream.as_object().into_iter().flat_map(|o| o.values()).find(|i| i["nodeId"] == f["nodeId"] && i["artifact"]["id"] == f["artifactId"])
            .map(|i| (&i["runId"], &i["artifact"]))
    };
    if let Some((run_id, artifact)) = entry {
        let mut binding = select_fields(artifact, &["width", "height"]);
        binding.insert("frame".into(), f.clone()); binding.insert("unit".into(), coordinates["unit"].clone());
        binding.insert("runId".into(), run_id.clone());
        if let Some(id) = artifact.get("id") { binding.insert("artifactId".into(), id.clone()); }
        if let Some(hash) = artifact.get("sha256") { binding.insert("contentSha256".into(), hash.clone()); }
        return Some(Value::Object(binding));
    }
    upstream.as_object().into_iter().flat_map(|o| o.values()).flat_map(|i| list(&i["artifact"]["contractBinding"]["frames"]))
        .find(|b| b["frame"] == *f && b["unit"] == coordinates["unit"]).cloned()
}
fn finite(v: &Value) -> bool { v.as_f64().is_some_and(f64::is_finite) }
fn points(v: &Value, minimum: usize) -> bool { v.as_array().is_some_and(|points|
    points.len() >= minimum && points.iter().all(|p| p.is_object() && finite(&p["x"]) && finite(&p["y"]))) }
fn positive_integer(v: &Value) -> bool { v.as_f64().is_some_and(|n| n.is_finite() && n >= 1. && n.fract() == 0.) }

pub fn audit(run: &Value, expected: &[Value], scheme: &Value, upstream: &Value) -> Value {
    let mut errors = Vec::new(); let mut bindings = Map::new(); let mut checked = 0;
    for (index, output) in expected.iter().enumerate() {
        let Some(contract) = output.get("dataContract").filter(|v| truthy(v)) else { continue; };
        checked += 1;
        let path = format!("expected_outputs.{index}");
        let mut add = |code: &str| {
            let id=output["id"].as_str().unwrap_or("");let kind=contract["kind"].as_str().unwrap_or("");
            let message=match code {
                "DATA_OUTPUT_NOT_CAPTURED"=>"必要或未經核對的產物不可省略採集。".into(),
                "DATA_OUTPUT_MISSING"=>format!("缺少宣告的產物 {id}。"),
                "DATA_OUTPUT_TYPE_MISMATCH"=>format!("{id} 的實際儲存型別不符合 {kind}。"),
                "DATA_FRAME_UNRESOLVED"=>format!("{id} 的座標系未能綁定本次真實圖像。"),
                "DATA_IMAGE_INVALID"=>"實際圖像沒有有效尺寸。".into(),
                "DATA_IMAGE_FRAME_SIZE_MISMATCH"=>"圖像尺寸與宣告的像素座標系不一致；縮放／裁切產物應有自己的座標系。".into(),
                "DATA_MASK_INVALID"=>"mask 必須由實際單通道二值像素產生；請檢查分割結果與執行核心版本。".into(),
                "DATA_MEASUREMENT_INVALID"=>"量測產物需為 {value:有限數值, unit:宣告單位}。".into(),
                "DATA_UNIT_MISMATCH"=>"實際量測單位與端口契約不一致。".into(),
                "DATA_COORDINATES_MISMATCH"=>if kind=="homography"{"變換 from/to 座標系與端口契約不一致。"}else{"幾何資料的 coordinates 與端口契約不一致。"}.into(),
                "DATA_GEOMETRY_INVALID"=>"幾何資料須使用有限 {x,y} 點；ROI 至少三點，每條輪廓至少一點。".into(),
                "DATA_TRANSFORM_INVALID"=>"平面投影 matrix 必須為有限數值的 3×3 矩陣。".into(),
                "DATA_TRANSFORM_DEGENERATE"=>"此矩陣退化，不能表示可逆平面映射；未取得映射應回報正常 NOT_FOUND。".into(),
                "DATA_CATEGORY_INVALID"=>"分類產物 categoryId 不在契約類別內。".into(),_=>unreachable!("unknown runtime contract error")};
            errors.push(json!({"code":code,"path":path,"message":message,"hint":"讀取 dataContract 與 canonicalSchema；修正來源、型別、座標系或單位，validate_purpose_scheme 通過後重新執行。不可只改標籤冒充座標轉換。"}));
        };
        if !valid_definition(contract) { errors.push(json!({"code":"DATA_CONTRACT_INVALID","path":format!("{path}.dataContract")})); continue; }
        if run["status"] != "SUCCEEDED" || run["execution"]["status"] == "FAULT" { continue; }
        let Some(artifact) = list(&run["artifacts"]).iter().find(|a| a["id"] == output["id"]) else {
            if run["result"]["valid"] != false { add("DATA_OUTPUT_MISSING"); } continue;
        };
        let kind = contract["kind"].as_str().unwrap();
        let transport = match kind { "image" | "mask" => "image", "file" => "file", _ => "evidence" };
        let actual = if artifact["type"] == "json" { "evidence" } else { artifact["type"].as_str().unwrap_or("") };
        if actual != transport { add("DATA_OUTPUT_TYPE_MISMATCH"); continue; }
        if artifact.get("collection").is_some(){
            let consumed=scheme["operatorGraph"]["nodes"].as_array().is_some_and(|nodes|nodes.iter().any(|node|node["inputs"].as_object().is_some_and(|inputs|inputs.values().any(|input|input["nodeId"]==run["schemeNodeId"]&&input["artifactId"]==artifact["id"]))));
            if kind!="json"||!crate::artifact_capture::verified(artifact)||consumed{add("DATA_OUTPUT_NOT_CAPTURED");continue;}
            bindings.insert(output["id"].as_str().unwrap_or("").to_owned(),json!({"dataContract":contract,"frames":[],"collection":artifact["collection"]}));continue;
        }
        let resolved: Vec<_> = frames(contract).iter().map(|c| frame_binding(c, run, scheme, upstream)).collect();
        if resolved.iter().any(Option::is_none) { add("DATA_FRAME_UNRESOLVED"); }
        let bound: Vec<_> = resolved.into_iter().flatten().collect();
        let first = bound.first();
        let data = &artifact["data"];
        match kind {
            "image" | "mask" => {
                if !positive_integer(&artifact["width"]) || !positive_integer(&artifact["height"]) { add("DATA_IMAGE_INVALID"); }
                // The first coordinate is also the image's raster frame.
                if let Some(frame) = first { if artifact["width"] != frame["width"] || artifact["height"] != frame["height"] { add("DATA_IMAGE_FRAME_SIZE_MISMATCH"); } }
                if kind == "mask" && (artifact["channels"] != 1 || artifact["binary"] != true) { add("DATA_MASK_INVALID"); }
            }
            "measurement" => {
                if !data.is_object() || !finite(&data["value"]) { add("DATA_MEASUREMENT_INVALID"); }
                if data["unit"] != contract["unit"] { add("DATA_UNIT_MISMATCH"); }
            }
            "points" | "contours" | "roi" => {
                if data["coordinates"] != contract["coordinates"] { add("DATA_COORDINATES_MISMATCH"); }
                let valid = if kind == "contours" { data["contours"].as_array().is_some_and(|a| a.iter().all(|v| points(v, 1))) }
                    else { points(&data["points"], if kind == "roi" {3} else {0}) };
                if !valid { add("DATA_GEOMETRY_INVALID"); }
            }
            "homography" => {
                if data["from"] != contract["from"] || data["to"] != contract["to"] { add("DATA_COORDINATES_MISMATCH"); }
                let matrix = list(&data["matrix"]);
                if matrix.len() != 3 || !matrix.iter().all(|r| r.as_array().is_some_and(|a| a.len() == 3 && a.iter().all(finite))) { add("DATA_TRANSFORM_INVALID"); }
                else {
                    let scale = matrix.iter().flat_map(list).map(|v| v.as_f64().unwrap().abs()).fold(0., f64::max);
                    let n: Vec<Vec<f64>> = matrix.iter().map(|r| list(r).iter().map(|v| v.as_f64().unwrap()/scale).collect()).collect();
                    let determinant = n[0][0]*(n[1][1]*n[2][2]-n[1][2]*n[2][1])-n[0][1]*(n[1][0]*n[2][2]-n[1][2]*n[2][0])+n[0][2]*(n[1][0]*n[2][1]-n[1][1]*n[2][0]);
                    if scale == 0. || determinant == 0. { add("DATA_TRANSFORM_DEGENERATE"); }
                }
            }
            "classification" if !list(&contract["categories"]).contains(&data["categoryId"]) => add("DATA_CATEGORY_INVALID"),
            _ => {},
        }
        bindings.insert(output["id"].as_str().unwrap_or("").into(), json!({"dataContract":contract,"frames":bound}));
    }
    json!({"schema":"agentcv-data-contract-audit-1","valid":errors.is_empty(),"errors":errors,"bindings":bindings,"checked":checked,"untyped":expected.len()-checked,"scope":"實際端口資料、來源綁定、有限數值與格式檢查；不證明算法精度或幾何轉換正確性。"})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_declarations_fail_closed() {
        for c in [json!({"kind":"measurement"}),json!({"kind":"json","ignored":true}),json!({"kind":"classification","categories":["x","x"]}),json!({"kind":"image","coordinates":{"unit":"px","frame":{"kind":"input"}}})] { assert!(!valid_definition(&c)); }
        assert!(valid_definition(&json!({"kind":"measurement","unit":"px"})));
    }
}
