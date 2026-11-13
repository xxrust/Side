//! Authored run metadata belongs to the native session, alongside observed
//! results. This is the same envelope used by single-node frontend imports;
//! browser publication timings remain browser observations, added afterwards.
use serde_json::{json, Value};

pub const BACKEND: &str = "rust-native-run-v1";

pub fn validate(request: &Value) -> Result<(), String> {
    let Some(backend) = request.get("runEnvelopeBackend") else { return Ok(()) };
    if backend != BACKEND { return Err("SESSION_RUN_BACKEND_INVALID".into()); }
    if request["shared"]["compilation"]["ok"] != true
        || !request["shared"]["compilation"].is_object()
    { return Err("SESSION_RUN_COMPILATION_REQUIRED".into()); }
    Ok(())
}

fn assign(run: &mut Value, key: &str, value: Option<&Value>) {
    // JS object fields assigned undefined disappear on JSON serialization;
    // an extension's conflicting value must not survive that assignment.
    if let Some(value) = value { run[key] = value.clone(); }
    else { run.as_object_mut().unwrap().remove(key); }
}

pub fn assemble(run: &mut Value, authored: &Value, shared: &Value, node_id: &str) -> Result<(), String> {
    if !run.is_object() || authored["mode"] != "scheme" { return Err("SESSION_RUN_ENVELOPE_INVALID".into()); }
    let backend = run.get("backend").filter(|v|crate::inspection_product::truthy(v)).cloned().unwrap_or(json!("python-extension"));
    let language = if run["backend"] == "rust-native" { "rust" } else { "python" };
    let visuals = run.get("visualEvidence").filter(|v|crate::inspection_product::truthy(v)).cloned()
        .or_else(||authored.get("visualEvidence").cloned());
    let artifact_mode = authored.get("artifactMode").filter(|v|!v.is_null()).cloned().or_else(||run.get("artifactMode").cloned());
    assign(run, "artifactMode", artifact_mode.as_ref());
    assign(run, "evidenceVisuals", visuals.as_ref());
    for key in ["title", "parameters", "justification", "documentation", "expectedOutputs", "proposalAudit"] {
        assign(run, key, authored.get(key));
    }
    run["schema"] = json!("agentcv-algorithm-run-1");
    run["mode"] = json!("scheme"); run["isDraft"] = json!(false);
    assign(run, "compilation", shared.get("compilation"));
    let code = authored.get("code").filter(|v|crate::inspection_product::truthy(v));
    run["code"] = code.cloned().unwrap_or(json!("/* nativePlan: rust-native */"));
    run["codeKind"] = json!(if code.is_some() { "python" } else { "native-plan" });
    run["language"] = json!(language); run["executionBackend"] = backend;
    assign(run, "sourceBinding", shared.get("sourceBinding"));
    assign(run, "source", shared["sourceBinding"]["images"].as_array().and_then(|images|images.first()));
    let mut input = json!({});
    for key in ["calibration", "targets"] { assign(&mut input, key, shared["inputContext"].get(key)); }
    run["inputContext"] = input;
    run["stage"] = json!("TRIAL"); run["author"] = json!("agent"); run["humanConfirmed"] = json!(false);
    if !run.get("execution").is_some_and(crate::inspection_product::truthy) {
        run["execution"] = json!({"status":if run["status"] == "SUCCEEDED" {"COMPLETED"} else {"FAULT"}});
        if run["status"] == "TIMEOUT" { run["execution"]["reason"] = json!("TIMEOUT"); }
        else if run["status"] == "FAILED" { run["execution"]["reason"] = json!("RUNTIME_FAILURE"); }
    }
    for key in ["workpieceUnit", "referenceInputs"] {
        if let Some(value) = shared.get(key).filter(|v|crate::inspection_product::truthy(v)) { run[key] = value.clone(); }
    }
    run["schemeNodeId"] = json!(node_id);
    run["nativeRunEnvelopeBackend"] = json!(BACKEND);
    // runtimeInputResources deliberately stays on the transport response for
    // original-resource cache import. It is omitted by the durable envelope.
    Ok(())
}
