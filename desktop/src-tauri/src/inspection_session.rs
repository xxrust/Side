//! Native workpiece scheduling. Node execution is an injected, supervised service;
//! UI callbacks never decide whether the next node may run. Classification and
//! durable commit remain separate stages of the workpiece session.
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v[key].as_str().filter(|s| !s.is_empty()).ok_or_else(|| format!("SESSION_INVALID_{key}"))
}
fn list(v: &Value) -> &[Value] { v.as_array().map(Vec::as_slice).unwrap_or(&[]) }

pub struct Graph {
    nodes: Vec<Value>,
    by_id: BTreeMap<String, usize>,
    children: BTreeMap<String, Vec<String>>,
    edges: Vec<(String, String)>,
    order: Vec<String>,
    derived: Vec<Value>,
}

impl Graph {
    pub fn compile(scheme: &Value) -> Result<Self, String> {
        let nodes = scheme["operatorGraph"]["nodes"].as_array().ok_or("SESSION_NODES_REQUIRED")?.clone();
        if nodes.is_empty() || nodes.len() > 512 { return Err("SESSION_NODE_BUDGET".into()); }
        let mut graph = Self { nodes, by_id: BTreeMap::new(), children: BTreeMap::new(),
            edges: Vec::new(), order: Vec::new(), derived: Vec::new() };
        for (index, node) in graph.nodes.iter().enumerate() {
            let id = text(node, "id")?.to_owned();
            if graph.by_id.insert(id.clone(), index).is_some() { return Err("SESSION_DUPLICATE_NODE".into()); }
            graph.children.insert(id, Vec::new());
        }
        for node in &graph.nodes {
            if node.get("parentId").is_some_and(|v| !v.is_null() && !v.is_string()) { return Err("SESSION_PARENT_INVALID".into()); }
            if node.get("inputs").is_some_and(|v| !v.is_object()) { return Err("SESSION_INPUTS_INVALID".into()); }
            if node.get("prerequisites").is_some_and(|v| !v.is_object()) { return Err("SESSION_PREREQUISITES_INVALID".into()); }
            if node["prerequisites"].get("anyOf").is_some_and(|v| !v.is_array()) { return Err("SESSION_PREREQUISITES_INVALID".into()); }
            if let Some(condition) = node.get("when").filter(|v| !v.is_null()) {
                if !condition.is_object() || !matches!(condition["status"].as_str(), Some("VALID" | "NOT_FOUND" | "FAULT" | "COMPLETED")) {
                    return Err("SESSION_CONDITION_INVALID".into());
                }
                text(condition, "nodeId")?;
            }
            if let Some(parent) = node["parentId"].as_str().filter(|s| !s.is_empty()) {
                graph.children.get_mut(parent).ok_or("SESSION_PARENT_MISSING")?.push(text(node, "id")?.to_owned());
            }
            let mut seen = BTreeSet::new();
            let mut current = node;
            while let Some(parent) = current["parentId"].as_str().filter(|s| !s.is_empty()) {
                if !seen.insert(parent) { return Err("SESSION_PARENT_CYCLE".into()); }
                if seen.len() > 2 { return Err("SESSION_PARENT_DEPTH".into()); }
                current = &graph.nodes[*graph.by_id.get(parent).ok_or("SESSION_PARENT_MISSING")?];
            }
        }
        if scheme["operatorGraph"].get("edges").is_some_and(|v| !v.is_array()) { return Err("SESSION_EDGES_INVALID".into()); }
        for edge in list(&scheme["operatorGraph"]["edges"]) {
            let (from, to) = (text(edge, "from")?, text(edge, "to")?);
            if !graph.by_id.contains_key(from) || !graph.by_id.contains_key(to) { return Err("SESSION_EDGE_MISSING_NODE".into()); }
            if from == to { return Err("SESSION_GRAPH_CYCLE".into()); }
            if graph.edges.iter().any(|e| e.0 == from && e.1 == to) { return Err("SESSION_DUPLICATE_EDGE".into()); }
            graph.edges.push((from.to_owned(), to.to_owned()));
        }
        for node in &graph.nodes {
            let id = text(node, "id")?;
            let references = list(&node["prerequisites"]["anyOf"]).iter().chain(node.get("when").filter(|w| !w.is_null()).map(|w| &w["nodeId"]));
            for reference in references {
                let source = reference.as_str().ok_or("SESSION_PREREQUISITE_INVALID")?;
                if !graph.by_id.contains_key(source) || !graph.edges.iter().any(|e| e.0 == source && e.1 == id) {
                    return Err("SESSION_PREREQUISITE_EDGE_REQUIRED".into());
                }
            }
            if let Some(inputs) = node["inputs"].as_object() {
                for input in inputs.values() {
                    let producer = text(input, "nodeId")?;
                    text(input, "artifactId")?;
                    if !graph.by_id.contains_key(producer) || !graph.edges.iter().any(|e| e.0 == producer && e.1 == id) {
                        return Err("SESSION_INPUT_EDGE_REQUIRED".into());
                    }
                    if !list(&graph.nodes[graph.by_id[producer]]["expected_outputs"]).iter().any(|o| o["id"] == input["artifactId"]) {
                        return Err("SESSION_INPUT_OUTPUT_UNDECLARED".into());
                    }
                }
            }
        }
        // Match lifecycleOrder: consumers outside a purpose wait for all of its
        // descendants, while a child can consume the parent's own result.
        for (from, to) in &graph.edges {
            if graph.inside(to, from) { continue; }
            for child in &graph.nodes {
                let child = text(child, "id")?;
                if child != to && graph.inside(child, from)
                    && !graph.edges.iter().any(|e| e.0 == child && e.1 == *to)
                    && !graph.derived.iter().any(|e| e["from"] == child && e["to"] == *to) {
                    graph.derived.push(json!({"from":child,"to":to,"kind":"parent-completion","parentId":from}));
                }
            }
        }
        let mut seen = BTreeSet::new();
        while graph.order.len() < graph.nodes.len() {
            let next = graph.nodes.iter().find_map(|node| {
                let id = node["id"].as_str().unwrap();
                let ready = !seen.contains(id)
                    && graph.edges.iter().filter(|e| e.1 == id).all(|e| seen.contains(e.0.as_str()))
                    && graph.derived.iter().filter(|e| e["to"] == id).all(|e| seen.contains(e["from"].as_str().unwrap()));
                ready.then(|| id.to_owned())
            }).ok_or("SESSION_GRAPH_CYCLE")?;
            seen.insert(next.clone()); graph.order.push(next);
        }
        Ok(graph)
    }

    fn inside(&self, id: &str, parent: &str) -> bool {
        let mut current = self.by_id.get(id).map(|i| &self.nodes[*i]);
        while let Some(p) = current.and_then(|n| n["parentId"].as_str()).filter(|s| !s.is_empty()) {
            if p == parent { return true; }
            current = self.by_id.get(p).map(|i| &self.nodes[*i]);
        }
        false
    }

    pub fn aggregate(&self, states: &mut BTreeMap<String, Value>) {
        fn visit(graph: &Graph, id: &str, states: &mut BTreeMap<String, Value>, done: &mut BTreeSet<String>) -> String {
            let Some(own) = states.get(id) else { return "PENDING".into(); };
            if done.contains(id) { return own["status"].as_str().unwrap_or("PENDING").into(); }
            let own_status = own["ownStatus"].as_str().or_else(|| own["status"].as_str()).unwrap_or("PENDING").to_owned();
            states.get_mut(id).unwrap()["ownStatus"] = json!(own_status);
            let mut observed = Vec::new();
            for child in &graph.children[id] {
                if states.get(child).is_some_and(|s| s["status"] == "SKIPPED" && s["reason"] == "BRANCH_NOT_SELECTED") { continue; }
                observed.push((child, visit(graph, child, states, done)));
            }
            let alternatives = list(&graph.nodes[graph.by_id[id]]["prerequisites"]["anyOf"]);
            let recovered = observed.iter().any(|(id, status)| alternatives.iter().any(|a| a == id.as_str()) && status == "VALID");
            let effective: Vec<&str> = observed.iter().filter(|(id, _)| !recovered || !alternatives.iter().any(|a| a == id.as_str())).map(|(_, s)| s.as_str()).collect();
            let (status, reason) = if own_status == "FAULT" || observed.iter().any(|(_, s)| s == "FAULT") {
                ("FAULT", (own_status != "FAULT").then_some("CHILD_FAULT_PROPAGATED"))
            } else if own_status == "RUNNING" || effective.contains(&"RUNNING") { ("RUNNING", None)
            } else if own_status == "PENDING" { ("PENDING", None)
            } else if effective.contains(&"PENDING") { (if own_status == "VALID" {"RUNNING"} else {"PENDING"}, None)
            } else if own_status == "NOT_FOUND" || effective.contains(&"NOT_FOUND") {
                ("NOT_FOUND", (own_status != "NOT_FOUND").then_some("CHILD_RESULT_UNAVAILABLE"))
            } else if own_status != "VALID" || effective.iter().any(|s| *s != "VALID") {
                ("SKIPPED", (own_status == "VALID").then_some("CHILD_PREREQUISITE_UNAVAILABLE"))
            } else { (own_status.as_str(), None) };
            let state = states.get_mut(id).unwrap();
            state["status"] = json!(status); state["purposeStatus"] = json!(status); state["purposeValid"] = json!(status == "VALID");
            if let Some(reason) = reason { state["purposeReason"] = json!(reason); }
            done.insert(id.to_owned()); status.to_owned()
        }
        let mut done = BTreeSet::new();
        for node in &self.nodes { visit(self, node["id"].as_str().unwrap(), states, &mut done); }
    }

    fn prerequisite(&self, source: &str, consumer: &str, states: &mut BTreeMap<String, Value>, runs: &BTreeMap<String, Value>) -> String {
        if self.inside(consumer, source) { return run_state(runs.get(source)).to_owned(); }
        self.aggregate(states);
        states.get(source).and_then(|s| s["status"].as_str()).unwrap_or("PENDING").into()
    }

    /// execute must verify returned bytes and output contracts before returning a
    /// run. A failed run is retained as FAULT; dispatch errors remain explicit and
    /// independent branches can still execute. Cancellation is at node boundaries.
    pub fn run(&self, mut execute: impl FnMut(&Value, &Value) -> Result<Value, String>,
        mut cancelled: impl FnMut() -> bool, mut publish: impl FnMut(&Value)) -> Value {
        let mut states = BTreeMap::new(); let mut runs = BTreeMap::new();
        let mut rows = Vec::new(); let mut run_rows = Vec::new();
        for id in &self.order {
            let node = &self.nodes[self.by_id[id]];
            let mut blocked = Vec::new();
            let condition = &node["when"];
            let selected = condition["nodeId"].as_str().map(|source| self.prerequisite(source, id, &mut states, &runs));
            let when = selected.as_deref().map(|selected| if condition["status"] == "COMPLETED" { matches!(selected, "VALID" | "NOT_FOUND") }
                else { condition["status"] == selected }).unwrap_or(true);
            let alternatives = list(&node["prerequisites"]["anyOf"]);
            for (from, _) in self.edges.iter().filter(|e| e.1 == *id) {
                if condition["nodeId"] == *from || alternatives.iter().any(|a| a == from) { continue; }
                if self.prerequisite(from, id, &mut states, &runs) != "VALID" { blocked.push(from.clone()); }
            }
            let alternative_ready = alternatives.is_empty() || alternatives.iter().any(|source|
                self.prerequisite(source.as_str().unwrap(), id, &mut states, &runs) == "VALID");
            let reason = if cancelled() { Some("CANCELLED") } else if !when {Some("BRANCH_NOT_SELECTED")}
                else if !blocked.is_empty() || !alternative_ready {Some("PREREQUISITE_UNAVAILABLE")} else {None};
            let mut upstream = serde_json::Map::new(); let mut missing = false;
            if reason.is_none() {
                if let Some(inputs) = node["inputs"].as_object() { for (slot, input) in inputs {
                    let producer = input["nodeId"].as_str().unwrap();
                    let artifact = runs.get(producer).and_then(|r| list(&r["artifacts"]).iter().find(|a| a["id"] == input["artifactId"]));
                    if self.prerequisite(producer, id, &mut states, &runs) != "VALID" || artifact.is_none() {
                        if alternatives.iter().any(|a| a == producer) { continue; }
                        missing = true; break;
                    }
                    upstream.insert(slot.clone(), json!({"nodeId":producer,"runId":runs[producer]["runId"],"artifact":artifact.unwrap()}));
                }}
            }
            let reason = reason.or(missing.then_some("REQUIRED_ARTIFACT_UNAVAILABLE"));
            let state = if let Some(reason) = reason {
                let mut state = json!({"nodeId":id,"status":"SKIPPED","reason":reason});
                if matches!(reason, "BRANCH_NOT_SELECTED" | "PREREQUISITE_UNAVAILABLE") { state["blockedBy"] = json!(blocked); }
                state
            } else {
                publish(&json!({"phase":"node-started","nodeId":id}));
                match execute(node, &Value::Object(upstream)) {
                    Ok(run) => {
                        let state = json!({"nodeId":id,"runId":run["runId"],"status":run_state(Some(&run)),"execution":run["execution"]});
                        // The map owns each immutable result while downstream
                        // nodes consume it. Move it into the response at the
                        // end instead of retaining a second complete JSON tree.
                        run_rows.push(id.clone()); runs.insert(id.clone(), run); state
                    }
                    Err(error) => json!({"nodeId":id,"status":"FAULT","reason":"DISPATCH_FAULT","error":{"type":"Error","message":error}}),
                }
            };
            rows.push(id.clone()); states.insert(id.clone(), state);
            publish(&json!({"phase":"node-completed","nodeId":id,"state":states[id]}));
        }
        self.aggregate(&mut states);
        let run_rows: Vec<Value> = run_rows.into_iter().map(|id| runs.remove(&id).unwrap()).collect();
        let mut result=json!({"order":self.order,"dependencies":self.derived,
            "nodeStates":rows.iter().map(|id| &states[id]).collect::<Vec<_>>()});
        result["runs"]=Value::Array(run_rows);result
    }
}

fn run_state(run: Option<&Value>) -> &'static str {
    match run {
        None => "SKIPPED",
        Some(run) if run["execution"]["status"] == "FAULT" || run["status"] != "SUCCEEDED" => "FAULT",
        Some(run) if run["result"]["valid"] == false => "NOT_FOUND",
        _ => "VALID",
    }
}

// Deterministic replay is used by the JS/Rust differential oracle. Outcomes are
// observations supplied by the test, never an execution or accuracy claim.
pub fn replay(request: &Value) -> Result<Value, String> {
    let graph = Graph::compile(&request["scheme"])?;
    let mut dispatched = Vec::new(); let mut events = Vec::new(); let mut boundaries = 0;
    let result = graph.run(|node, upstream| {
        let id = node["id"].as_str().unwrap(); dispatched.push(json!({"nodeId":id,"upstream":upstream}));
        let outcome = &request["outcomes"][id];
        if let Some(error) = outcome["dispatchError"].as_str() { return Err(error.into()); }
        if !outcome.is_object() { return Err(format!("REPLAY_OUTCOME_MISSING:{id}")); }
        Ok(outcome.clone())
    }, || { let cancelled = request["cancelAtBoundary"].as_u64().is_some_and(|n| boundaries >= n); boundaries += 1; cancelled },
        |event| events.push(event.clone()));
    Ok(json!({"result":result,"dispatched":dispatched,"events":events}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_cycles_dangling_inputs_and_missing_condition_edges() {
        let scheme = |nodes, edges| json!({"operatorGraph":{"nodes":nodes,"edges":edges}});
        assert!(Graph::compile(&scheme(json!([{"id":"a","parentId":"b"},{"id":"b","parentId":"a"}]), json!([]))).is_err());
        assert!(Graph::compile(&scheme(json!([{"id":"a"},{"id":"a"}]), json!([]))).is_err());
        assert!(Graph::compile(&scheme(json!([{"id":"a","when":{"nodeId":"b","status":"VALID"}},{"id":"b"}]), json!([]))).is_err());
        assert!(Graph::compile(&scheme(json!([{"id":"a","inputs":{"x":{"nodeId":"absent","artifactId":"x"}}}]), json!([]))).is_err());
        assert!(Graph::compile(&scheme(json!([{"id":"a"},{"id":"b"}]), json!([{"from":"a","to":"b"},{"from":"b","to":"a"}]))).is_err());
    }
}
