//! Immutable per-unit records and external diagnostic files. File names and
//! application names are selected by the host, never interpolated into a shell.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{ser::{SerializeMap, SerializeSeq}, Serialize, Serializer};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
    time::Instant,
};
use tauri::Manager;
static RECORD_LOCK: Mutex<()> = Mutex::new(());
fn sha(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn identity(value: &Value, key: &str) -> Result<String, String> {
    let s = value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("缺少{key}"))?;
    if s.is_empty() || s.len() > 240 || s.chars().any(char::is_control) {
        return Err(format!("{key}格式無效"));
    }
    Ok(s.to_owned())
}
fn root(app: &tauri::AppHandle, kind: &str) -> Result<PathBuf, String> {
    let p = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(kind);
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}
fn write_once(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if path.exists() {
        if fs::read(path).map_err(|e| e.to_string())? != bytes {
            return Err("不可覆寫已有的執行證據；請建立新的執行識別".into());
        }
        return Ok(());
    }
    let temporary = path.with_extension(format!("{}.tmp", std::process::id()));
    {
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        f.write_all(bytes)
            .and_then(|_| f.sync_all())
            .map_err(|e| e.to_string())?;
    }
    fs::rename(temporary, path).map_err(|e| e.to_string())
}

fn inline_data_bytes(value: &Value) -> Result<Option<Vec<u8>>, String> {
    let Some(data) = value
        .get("dataURL")
        .or_else(|| value.get("dataUrl"))
        .and_then(Value::as_str)
    else { return Ok(None); };
    let (_, encoded) = data.split_once(',').ok_or("圖像 dataURL 格式無效")?;
    STANDARD.decode(encoded).map(Some).map_err(|e| format!("圖像 dataURL 解碼失敗：{e}"))
}

#[derive(Clone)]
enum ArtifactBytes { Owned(Vec<u8>), Shared(Arc<Vec<u8>>) }
impl std::ops::Deref for ArtifactBytes {
    type Target = [u8];
    fn deref(&self) -> &[u8] {
        match self { Self::Owned(bytes) => bytes, Self::Shared(bytes) => bytes.as_slice() }
    }
}
fn inline_artifact_bytes(value: &Value) -> Result<Option<ArtifactBytes>, String> {
    if let Some(reference)=value.get("memoryRef") {
        let bytes=crate::memory_resources::read(reference)?;
        if value["sha256"]!=reference["sha256"] || value["bytes"]!=reference["bytes"] || value["id"]!=reference["artifactId"] {
            return Err("內存產物保存身份不一致".into());
        }
        return Ok(Some(ArtifactBytes::Shared(bytes)));
    }
    if let Some(bytes) = inline_data_bytes(value)? { return Ok(Some(ArtifactBytes::Owned(bytes))); }
    if let Some(data) = value.get("data") {
        return serde_json::to_vec(&CanonicalJson { value:data, strip:false }).map(|bytes|Some(ArtifactBytes::Owned(bytes))).map_err(|e| format!("產物 JSON 序列化失敗：{e}"));
    }
    Ok(None)
}
fn verify_memory_owner(run_id:&str,artifact:&Value)->Result<(),String>{
    if artifact.get("collection").is_some()&&!crate::artifact_capture::verified(artifact){return Err("未採集產物描述不可含虛構內容或資產".into());}
    if let Some(reference)=artifact.get("memoryRef") {
        if reference["runId"].as_str()!=Some(run_id){return Err("內存產物不屬於本次運算".into());}
    }
    Ok(())
}

// Capture ownership before returning detection completion. The archive worker
// must never look up an evictable runtime token after this point.
pub(crate) struct PreparedUnit {
    request: Value,
    facts: Vec<Option<Arc<Value>>>,
    artifacts: std::collections::HashMap<String, (Value, Arc<Vec<u8>>)>,
    pub bytes: usize,
}
impl PreparedUnit {
    pub fn prepare(request: Value) -> Result<Self,String> {
        Self::prepare_bounded(request,usize::MAX)
    }
    pub fn prepare_bounded(request:Value,limit:usize)->Result<Self,String>{
        fn check(bytes:usize,limit:usize)->Result<(),String>{if bytes>limit{Err("ARCHIVE_BACKPRESSURE: byte limit".into())}else{Ok(())}}
        identity(&request,"executionId")?;
        identity(request.get("unit").ok_or("缺少工件資料")?,"id")?;
        let mut bytes=crate::memory_resources::json_allocation(&request);
        check(bytes,limit)?;
        let facts=crate::inspection_service::lease_facts(&request)?;
        for fact in facts.iter().flatten(){bytes=bytes.saturating_add(crate::memory_resources::json_allocation(fact));check(bytes,limit)?;}
        let mut artifacts=std::collections::HashMap::new();
        for run in request["runs"].as_array().into_iter().flatten(){
            let run_id=identity(run,"runId")?;
            for artifact in run["artifacts"].as_array().into_iter().flatten(){
                verify_memory_owner(&run_id,artifact)?;
                if artifact["type"]=="image"&&artifact["pixelRetention"]=="metadata-only"{continue;}
                if let Some(reference)=artifact.get("memoryRef") {
                    let ArtifactBytes::Shared(data)=inline_artifact_bytes(artifact)?.ok_or("內存產物缺少bytes")? else {unreachable!()};
                    let token=reference["token"].as_str().ok_or("內存產物缺少token")?.to_owned();
                    if !artifacts.contains_key(&token){bytes=bytes.saturating_add(data.len());}
                    check(bytes,limit)?;
                    artifacts.insert(token,(reference.clone(),data));
                }
            }
        }
        Ok(Self{request,facts,artifacts,bytes})
    }
    pub fn identity(&self)->Value {json!({"executionId":self.request["executionId"],"unitId":self.request["unit"]["id"],"workspaceRoot":self.request["workspaceRoot"]})}
    fn artifact_bytes(&self,artifact:&Value)->Result<Option<ArtifactBytes>,String>{
        let Some(reference)=artifact.get("memoryRef") else{return inline_artifact_bytes(artifact)};
        let (expected,bytes)=reference["token"].as_str().and_then(|t|self.artifacts.get(t)).ok_or("歸檔產物租約缺失")?;
        if expected!=reference || artifact["sha256"]!=reference["sha256"] || artifact["bytes"]!=reference["bytes"] || artifact["id"]!=reference["artifactId"]{return Err("歸檔產物身份不一致".into());}
        Ok(Some(ArtifactBytes::Shared(bytes.clone())))
    }
    pub fn snapshot(&self)->Result<Value,String>{
        let mut value=self.request.clone();
        hydrate_leased_facts(&mut value,&self.facts)?;
        // Pending reads are explicitly memory backed, never durable references.
        Ok(value)
    }
}
fn hydrate_leased_facts(request:&mut Value,facts:&[Option<Arc<Value>>])->Result<(),String>{
    if let Some(runs)=request["runs"].as_array_mut(){for (run,bundle) in runs.iter_mut().zip(facts){if let Some(bundle)=bundle{
        let object=run.as_object_mut().ok_or("SESSION_RUN_INVALID")?;
        object.remove("nativeFactRef");object.remove("nativeFactFields");
        object.extend(bundle["fields"].as_object().ok_or("SESSION_FACT_FIELDS_INVALID")?.clone());
    }}}
    Ok(())
}

// Unsaved projects keep their durable records in app data. Externalize their
// transient handles before acknowledging the commit, as workspace saves do.
fn persist_runtime_memory_artifacts(request:&mut Value,runtime:&Path)->Result<(),String>{
    persist_leased_runtime_artifacts(request,runtime,None)
}
fn persist_leased_runtime_artifacts(request:&mut Value,runtime:&Path,prepared:Option<&PreparedUnit>)->Result<(),String>{
    if let Some(runs)=request.get_mut("runs").and_then(Value::as_array_mut){
        for run in runs {
            let run_id=identity(run,"runId")?;
            let mut output=None;
            let directory=run["runDirectory"].as_str().map(PathBuf::from);
            if let Some(artifacts)=run.get_mut("artifacts").and_then(Value::as_array_mut){
                for artifact in artifacts {
                    if artifact.get("memoryRef").is_none(){continue;}
                    if artifact["type"]=="image"&&artifact["pixelRetention"]=="metadata-only"{
                        artifact.as_object_mut().unwrap().remove("memoryRef");continue;
                    }
                    verify_memory_owner(&run_id,artifact)?;

                    let bytes=if let Some(prepared)=prepared{prepared.artifact_bytes(artifact)?}else{inline_artifact_bytes(artifact)?}.ok_or("內存產物缺少真實bytes")?;
                    if output.is_none(){
                        let directory=directory.as_ref().ok_or("內存產物缺少運算目錄")?.canonicalize().map_err(|e|e.to_string())?;
                        let runtime=runtime.canonicalize().map_err(|e|e.to_string())?;
                        let outputs=directory.join("outputs").canonicalize().map_err(|e|e.to_string())?;
                        if directory==runtime||!directory.starts_with(runtime)||outputs.parent()!=Some(directory.as_path()){
                            return Err("內存產物不在本機已知運算根目錄".into());
                        }
                        output=Some(outputs);
                    }
                    let path=output.as_ref().unwrap().join(format!("{}.bin",sha(&bytes)));
                    write_once(&path,&bytes)?;
                    artifact["path"]=json!(path);
                    artifact.as_object_mut().unwrap().remove("memoryRef");
                }
            }
        }
    }
    Ok(())
}
fn execution_root(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    let p = root(app, "inspection-runs")?.join(sha(id.as_bytes()));
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}
fn strip_inline(value: &mut Value) {
    match value {
        Value::Object(o) => {
            o.remove("dataURL");
            o.remove("dataUrl");
            o.remove("displayPreview");
            o.remove("base64");
            for item in o.values_mut() {
                strip_inline(item)
            }
            // Authoring JSON preserves insertion order for diagnostic ordering;
            // durable records retain the pre-migration lexicographic encoding.
            o.sort_keys();
        }
        Value::Array(a) => {
            for item in a {
                strip_inline(item)
            }
        }
        _ => {}
    }
}

// Apply the ordinary durable inline-field policy while writing, without first
// copying or mutating the retained execution trees. Scalars use serde_json's
// own serializer, including its exact number representation.
struct DurableJson<'a>(&'a Value);
struct CanonicalJson<'a> { value:&'a Value, strip:bool }
fn inline_key(key: &str) -> bool { matches!(key, "dataURL" | "dataUrl" | "base64" | "displayPreview") }
impl Serialize for DurableJson<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        CanonicalJson {value:self.0,strip:true}.serialize(serializer)
    }
}
impl Serialize for CanonicalJson<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self.value {
            Value::Object(object) => {
                let mut map = serializer.serialize_map(None)?;
                // Geometry contains thousands of already ordered {x,y} maps.
                // Keep canonical bytes without allocating a sorting vector for
                // every point. Small unordered maps use a bounded stack buffer.
                if object.keys().zip(object.keys().skip(1)).all(|(a,b)|a<b) {
                    for (key,value) in object {
                        if !self.strip || !inline_key(key) { map.serialize_entry(key,&CanonicalJson {value,strip:self.strip})?; }
                    }
                } else if object.len()<=8 {
                    let mut entries=[None;8];
                    for (slot,entry) in entries.iter_mut().zip(object.iter()) { *slot=Some(entry); }
                    let entries=&mut entries[..object.len()];
                    entries.sort_unstable_by(|a,b|a.unwrap().0.cmp(b.unwrap().0));
                    for entry in entries {
                        let (key,value)=entry.unwrap();
                        if !self.strip || !inline_key(key) { map.serialize_entry(key,&CanonicalJson {value,strip:self.strip})?; }
                    }
                } else {
                    let mut entries:Vec<_>=object.iter().collect();entries.sort_unstable_by(|a,b|a.0.cmp(b.0));
                    for (key,value) in entries {
                        if !self.strip || !inline_key(key) { map.serialize_entry(key,&CanonicalJson {value,strip:self.strip})?; }
                    }
                }
                map.end()
            }
            Value::Array(values) => {
                let mut seq = serializer.serialize_seq(Some(values.len()))?;
                for value in values { seq.serialize_element(&CanonicalJson {value,strip:self.strip})?; }
                seq.end()
            }
            value => value.serialize(serializer),
        }
    }
}
struct DurableUnit<'a> {
    request: &'a Value,
    leases: &'a [Option<Arc<Value>>],
}
struct DurableRuns<'a> {
    runs: &'a [Value],
    leases: &'a [Option<Arc<Value>>],
}
struct DurableRun<'a> {
    run: &'a Value,
    bundle: Option<&'a Value>,
}
impl Serialize for DurableUnit<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let Some(object) = self.request.as_object() else { return DurableJson(self.request).serialize(serializer); };
        let mut map = serializer.serialize_map(None)?;
        let mut entries:Vec<_>=object.iter().collect();entries.sort_unstable_by(|a,b|a.0.cmp(b.0));
        for (key, value) in entries {
            if inline_key(key) { continue; }
            if key == "runs" {
                if let Some(runs) = value.as_array() {
                    map.serialize_entry(key, &DurableRuns { runs, leases: self.leases })?;
                    continue;
                }
            }
            map.serialize_entry(key, &DurableJson(value))?;
        }
        map.end()
    }
}
impl Serialize for DurableRuns<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut seq = serializer.serialize_seq(Some(self.runs.len()))?;
        for (index, run) in self.runs.iter().enumerate() {
            seq.serialize_element(&DurableRun { run, bundle: self.leases.get(index).and_then(Option::as_deref) })?;
        }
        seq.end()
    }
}
impl Serialize for DurableRun<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let Some(bundle) = self.bundle else { return DurableJson(self.run).serialize(serializer); };
        // serde_json's default map order is lexicographic. Merge only borrowed
        // references so the output is byte-identical to hydrate + strip_inline.
        let mut entries = std::collections::BTreeMap::new();
        if let Some(object) = self.run.as_object() {
            for (key, value) in object {
                if !matches!(key.as_str(), "nativeFactRef" | "nativeFactFields") { entries.insert(key.as_str(), value); }
            }
        }
        if let Some(fields) = bundle["fields"].as_object() {
            for (key, value) in fields {
                // String code has already been stored as a verified CAS asset.
                if key != "code" || !value.is_string() { entries.insert(key.as_str(), value); }
            }
        }
        let mut map = serializer.serialize_map(None)?;
        for (key, value) in entries {
            if !inline_key(key) { map.serialize_entry(key, &DurableJson(value))?; }
        }
        map.end()
    }
}
// Inspection originals and results share the workspace CAS. Only descriptors
// travel in project JSON; neither loading a project nor listing units hydrates
// unit payloads or artifact pixels.
fn owned_workspace(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if !p.is_absolute() {
        return Err("執行紀錄工程必須是絕對路徑".into());
    }
    if fs::symlink_metadata(&p)
        .map_err(|_| "執行紀錄工程不存在")?
        .file_type()
        .is_symlink()
    {
        return Err("執行紀錄工程不能是符號連結".into());
    }
    let p = p.canonicalize().map_err(|e| e.to_string())?;
    let manifest = p.join("manifest.agentcv.json");
    let meta = fs::symlink_metadata(&manifest).map_err(|_| "請先建立或開啟工程，再保存執行紀錄")?;
    if meta.file_type().is_symlink() || meta.len() > 220 * 1024 * 1024 {
        return Err("工程清單不安全或過大".into());
    }
    crate::workspace::validate_asset_workspace(&p)?;
    Ok(p)
}
fn descriptor(bytes: &[u8], mime: &str) -> Value {
    let suffix = match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/bmp" => "bmp",
        "image/webp" => "webp",
        "application/json" => "json",
        "text/plain" => "txt",
        "text/markdown" => "md",
        "text/csv" => "csv",
        "application/pdf" => "pdf",
        "model/gltf-binary" => "glb",
        "model/gltf+json" => "gltf",
        _ => "bin",
    };
    let digest = sha(bytes);
    json!({"$asset":format!("assets/{digest}.{suffix}"),"mime":mime,"sha256":digest,"size":bytes.len()})
}
fn store_asset(directory: &Path, bytes: &[u8], mime: &str) -> Result<Value, String> {
    let asset = descriptor(bytes, mime);
    let folder = directory.join("assets");
    if fs::symlink_metadata(&folder)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err("資產目錄不能是符號連結".into());
    }
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let path = directory.join(asset["$asset"].as_str().ok_or("資產路徑無效")?);
    if fs::symlink_metadata(&path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err("資產不能是符號連結".into());
    }
    write_once(&path, bytes)?;
    Ok(asset)
}

// Independent immutable assets can be verified/written concurrently. Join all
// workers before writing the unit record or its journal entry; partial writes
// on error remain uncommitted orphans, as with the serial writer. Keep the
// existing symlink, exact-existing-bytes, fsync and atomic-rename checks intact.
pub(crate) mod asset_pack {
    use super::{descriptor,sha};
    use serde::{Deserialize,Serialize};
    use serde_json::{json,Value};
    use std::collections::BTreeMap;
    const MAGIC:&[u8;8]=b"ACVPAK01";
    pub const MAX_BYTES:usize=128*1024*1024;
    const MAX_INDEX:usize=4*1024*1024;
    pub const MAX_ENTRIES:usize=4096;
    #[derive(Serialize,Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Entry { asset:Value,offset:u64 }
    #[derive(Serialize,Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Index { schema:String,entries:Vec<Entry> }
    pub fn logical_key(asset:&Value)->String {
        json!([asset["$asset"],asset["mime"],asset["sha256"],asset["size"]]).to_string()
    }
    // Keys must not depend on object field order: durable JSON sorts objects,
    // whereas fresh in-memory descriptors and old journals preserve their order.
    pub fn key(asset:&Value)->String {
        if let Some(location)=asset.get("packedIn") {
            json!([logical_key(asset),location["schema"],logical_key(&location["container"]),location["offset"]]).to_string()
        }else{logical_key(asset)}
    }
    pub fn core(asset:&Value)->Value {
        json!({"$asset":asset["$asset"],"mime":asset["mime"],"sha256":asset["sha256"],"size":asset["size"]})
    }
    fn validate_plain(asset:&Value)->Result<(),String>{
        let digest=asset["sha256"].as_str().ok_or("資產缺少雜湊")?;
        let mime=asset["mime"].as_str().ok_or("資產缺少類型")?;
        let suffix=crate::workspace::extension(mime).ok_or("資產類型無效")?;
        if digest.len()!=64||!digest.bytes().all(|c|c.is_ascii_digit()||(b'a'..=b'f').contains(&c))
            ||asset["$asset"].as_str()!=Some(format!("assets/{digest}.{suffix}").as_str())
            ||asset["size"].as_u64().is_none_or(|size|size>MAX_BYTES as u64){return Err("資產身份或大小無效".into());}
        Ok(())
    }
    pub fn container(asset:&Value)->Result<Option<&Value>,String>{
        validate_plain(asset)?;
        let Some(location)=asset.get("packedIn") else{return Ok(None)};
        let object=location.as_object().ok_or("容器定位無效")?;
        if object.len()!=3||location["schema"]!="agentcv-packed-asset-1"
            ||location["offset"].as_u64().is_none_or(|n|n>MAX_BYTES as u64){return Err("容器定位版本或偏移無效".into());}
        let physical=&location["container"];
        validate_plain(physical)?;
        if physical.as_object().is_none_or(|o|o.len()!=4)||physical.get("packedIn").is_some()
            ||physical["mime"]!="application/octet-stream" {return Err("物理容器描述無效".into());}
        Ok(Some(physical))
    }
    pub struct Encoded {pub bytes:Vec<u8>,pub physical:Value,pub locations:BTreeMap<String,Value>}
    pub fn encode(assets:&[(&Value,&[u8])])->Result<Encoded,String>{
        if assets.is_empty()||assets.len()>MAX_ENTRIES{return Err("容器資產數量超限".into());}
        let mut unique=BTreeMap::<String,(Value,&[u8])>::new();
        for (asset,bytes) in assets {
            validate_plain(asset)?;
            if asset.get("packedIn").is_some()||core(asset)!=descriptor(bytes,asset["mime"].as_str().unwrap()) {return Err("容器輸入與原始資產身份不符".into());}
            let path=logical_key(asset);
            if let Some((previous,existing))=unique.get(&path){
                if previous!=&core(asset)||existing!=bytes{return Err("容器重複資產內容衝突".into());}
            }else{unique.insert(path,(core(asset),bytes));}
        }
        let mut length=0usize;let mut entries=Vec::new();
        for (asset,bytes) in unique.values(){
            entries.push(Entry {asset:asset.clone(),offset:length as u64});
            length=length.checked_add(bytes.len()).filter(|n|*n<=MAX_BYTES).ok_or("容器內容超限")?;
        }
        let index=Index{schema:"agentcv-asset-pack-1".into(),entries};
        let raw=serde_json::to_vec(&index).map_err(|e|e.to_string())?;
        if raw.len()>MAX_INDEX{return Err("容器索引超限".into());}
        let total=16usize.checked_add(raw.len()).and_then(|n|n.checked_add(length)).filter(|n|*n<=MAX_BYTES).ok_or("容器大小超限")?;
        let mut bytes=Vec::with_capacity(total);bytes.extend_from_slice(MAGIC);bytes.extend_from_slice(&(raw.len() as u64).to_le_bytes());bytes.extend(raw);
        for (_,data) in unique.values(){bytes.extend_from_slice(data);}
        let physical=descriptor(&bytes,"application/octet-stream");let mut locations=BTreeMap::new();
        for entry in index.entries {
            let key=logical_key(&entry.asset);let mut asset=entry.asset;
            asset["packedIn"]=json!({"schema":"agentcv-packed-asset-1","container":physical,"offset":entry.offset});
            locations.insert(key,asset);
        }
        Ok(Encoded{bytes,physical,locations})
    }
    fn validate_bytes(bytes:&[u8],physical:&Value)->Result<BTreeMap<String,(u64,std::ops::Range<usize>)>,String>{
        if bytes.len()<16||bytes.len()>MAX_BYTES||&bytes[..8]!=MAGIC
            ||core(physical)!=descriptor(bytes,"application/octet-stream"){return Err("容器頭或物理雜湊不符".into());}
        let length=usize::try_from(u64::from_le_bytes(bytes[8..16].try_into().map_err(|_|"容器頭不完整")?)).map_err(|_|"容器索引長度溢出")?;
        let start=16usize.checked_add(length).filter(|n|*n<=bytes.len()&&length<=MAX_INDEX).ok_or("容器索引截斷或過大")?;
        let index:Index=serde_json::from_slice(&bytes[16..start]).map_err(|_|"容器索引格式錯誤")?;
        if index.schema!="agentcv-asset-pack-1"||index.entries.is_empty()||index.entries.len()>MAX_ENTRIES{return Err("容器索引版本或數量錯誤".into());}
        let payload=&bytes[start..];let mut offset=0usize;let mut previous=String::new();let mut entries=BTreeMap::new();
        for entry in index.entries {
            validate_plain(&entry.asset)?;
            if entry.asset.as_object().is_none_or(|o|o.len()!=4){return Err("容器索引資產欄位無效".into());}
            let path=logical_key(&entry.asset);
            if path<=previous||entry.offset!=offset as u64{return Err("容器索引順序或偏移錯誤".into());}
            let size=usize::try_from(entry.asset["size"].as_u64().unwrap()).map_err(|_|"容器資產大小溢出")?;
            let end=offset.checked_add(size).filter(|n|*n<=payload.len()).ok_or("容器資產越界")?;
            let data=&payload[offset..end];
            if entry.asset["sha256"].as_str()!=Some(sha(data).as_str()){return Err("容器內部資產雜湊不符".into());}
            entries.insert(logical_key(&entry.asset),(entry.offset,start+offset..start+end));
            offset=end;previous=path;
        }
        if offset!=payload.len(){return Err("容器存在額外內容".into());}
        Ok(entries)
    }
    pub fn read_entry<'a>(bytes:&'a [u8],reference:&Value)->Result<&'a [u8],String>{
        let physical=container(reference)?.ok_or("缺少容器定位")?;
        let entries=validate_bytes(bytes,physical)?;
        let (offset,range)=entries.get(&logical_key(reference)).ok_or("容器未包含對應資產")?;
        if reference["packedIn"]["offset"]!=*offset{return Err("容器引用偏移不符".into());}
        Ok(&bytes[range.clone()])
    }
    // Lifetime is one save operation, never a cross-save filesystem trust
    // cache. A shared physical pack is read and validated once for that save.
    pub struct VerifiedPack {bytes:Vec<u8>,physical:Value,entries:BTreeMap<String,(u64,std::ops::Range<usize>)>}
    impl VerifiedPack {
        pub fn new(bytes:Vec<u8>,physical:&Value)->Result<Self,String>{
            let entries=validate_bytes(&bytes,physical)?;Ok(Self{bytes,physical:physical.clone(),entries})
        }
        pub fn read(&self,reference:&Value)->Result<&[u8],String>{
            if container(reference)?.is_none_or(|p|core(p)!=core(&self.physical)){return Err("容器引用身份不符".into());}
            let (offset,range)=self.entries.get(&logical_key(reference)).ok_or("容器未包含對應資產")?;
            if reference["packedIn"]["offset"]!=*offset{return Err("容器引用偏移不符".into());}
            Ok(&self.bytes[range.clone()])
        }
    }
    #[cfg(test)]
    mod contracts {
        use super::*;
        #[test]
        fn exact_bytes_aliases_determinism_and_locator_keys(){
            let raw=b"{\n \"value\":42.00,\"negative\":-0.0\n}";
            let first=descriptor(raw,"application/json");let second=descriptor(raw,"application/x-one");let third=descriptor(raw,"application/x-two");
            let pack=encode(&[(&first,raw),(&second,raw),(&third,raw),(&first,raw)]).unwrap();
            let reversed=encode(&[(&third,raw),(&second,raw),(&first,raw)]).unwrap();assert_eq!(pack.bytes,reversed.bytes);
            assert_eq!(pack.locations.len(),3);
            for reference in pack.locations.values(){
                assert_eq!(read_entry(&pack.bytes,reference).unwrap(),raw);
                let mut reordered=reference.clone();reordered.as_object_mut().unwrap().sort_keys();
                reordered["packedIn"].as_object_mut().unwrap().sort_keys();reordered["packedIn"]["container"].as_object_mut().unwrap().sort_keys();
                assert_eq!(key(reference),key(&reordered));assert_eq!(read_entry(&pack.bytes,&reordered).unwrap(),raw);
                let mut forged=reference.clone();forged["packedIn"]["offset"]=json!(u64::MAX);
                assert_ne!(key(&forged),key(reference));assert!(read_entry(&pack.bytes,&forged).is_err());
            }
        }
        #[test]
        fn rejects_truncation_bad_physical_and_forged_index_even_with_new_hash(){
            let raw=b"actual immutable bytes\0\xff";let asset=descriptor(raw,"application/octet-stream");
            let pack=encode(&[(&asset,raw)]).unwrap();let reference=&pack.locations[&logical_key(&asset)];
            for length in 0..pack.bytes.len(){assert!(read_entry(&pack.bytes[..length],reference).is_err());}
            let index_length=u64::from_le_bytes(pack.bytes[8..16].try_into().unwrap()) as usize;
            let index:Value=serde_json::from_slice(&pack.bytes[16..16+index_length]).unwrap();
            for kind in 0..9{
                let mut forged=index.clone();match kind {
                    0=>forged["schema"]=json!("future"),1=>forged["entries"][0]["offset"]=json!(1),
                    2=>forged["entries"][0]["asset"]["size"]=json!(u64::MAX),
                    3=>forged["entries"][0]["asset"]["$asset"]=json!("assets/../outside"),
                    4=>forged["entries"][0]["asset"]["sha256"]=json!("0".repeat(64)),
                    5=>forged["entries"][0]["asset"]["extra"]=json!(true),6=>forged["extra"]=json!(true),
                    7=>forged["entries"]=json!([]),_=>forged["entries"][0]["asset"]["mime"]=json!("image/png")
                }
                let encoded=serde_json::to_vec(&forged).unwrap();let mut bytes=Vec::new();bytes.extend_from_slice(MAGIC);bytes.extend_from_slice(&(encoded.len() as u64).to_le_bytes());bytes.extend(encoded);bytes.extend(raw);
                let mut changed=reference.clone();changed["packedIn"]["container"]=descriptor(&bytes,"application/octet-stream");
                assert!(read_entry(&bytes,&changed).is_err(),"mutation {kind}");
            }
            let mut corrupt=pack.bytes.clone();*corrupt.last_mut().unwrap()^=1;
            let mut changed=reference.clone();changed["packedIn"]["container"]=descriptor(&corrupt,"application/octet-stream");assert!(read_entry(&corrupt,&changed).is_err());
            let mut trailing=pack.bytes.clone();trailing.push(0);changed["packedIn"]["container"]=descriptor(&trailing,"application/octet-stream");assert!(read_entry(&trailing,&changed).is_err());
            assert!(encode(&[]).is_err());assert!(encode(&vec![(&asset,raw.as_slice());MAX_ENTRIES+1]).is_err());
        }
    }
}

struct PendingAsset { asset:Value, bytes:ArtifactBytes, mime:String }
fn queue_asset(pending:&mut Vec<PendingAsset>,bytes:ArtifactBytes,mime:&str)->Value {
    let asset=descriptor(&bytes,mime);
    pending.push(PendingAsset {asset:asset.clone(),bytes,mime:mime.to_owned()});asset
}
#[cfg(test)]
#[allow(dead_code)] // Explicit captured-asset A/B harness entry.
fn flush_pending_assets(directory:&Path,pending:&[PendingAsset])->Result<Value,String>{
    // Identical code or output references must never race to create the same
    // temporary file. Compare exact bytes as well as content-address identity.
    let mut unique=std::collections::BTreeMap::<String,usize>::new();
    for (index,item) in pending.iter().enumerate(){
        let path=item.asset["$asset"].as_str().ok_or("資產路徑無效")?.to_owned();
        if let Some(previous)=unique.get(&path){
            if &*pending[*previous].bytes!=&*item.bytes{return Err("相同資產路徑內容不一致".into());}
        }else{unique.insert(path,index);}
    }
    let jobs:Vec<_>=unique.values().copied().collect();
    let mut result=flush_asset_jobs(directory,pending,&jobs)?;result["references"]=json!(pending.len());Ok(result)
}
fn flush_asset_jobs(directory:&Path,pending:&[PendingAsset],jobs:&[usize])->Result<Value,String>{
    let mut paths=std::collections::BTreeMap::<&str,usize>::new();
    for &index in jobs {
        let path=pending[index].asset["$asset"].as_str().ok_or("資產路徑無效")?;
        if let Some(&previous)=paths.get(path){if &*pending[previous].bytes!=&*pending[index].bytes{return Err("相同資產路徑內容不一致".into());}}
        else{paths.insert(path,index);}
    }
    let jobs:Vec<_>=paths.into_values().collect();
    let workers=std::thread::available_parallelism().map(|n|n.get().min(4)).unwrap_or(1).min(jobs.len());
    let began=Instant::now();
    if workers>0 {
        let chunk_size=jobs.len().div_ceil(workers);
        std::thread::scope(|scope|->Result<(),String>{
            let handles:Vec<_>=jobs.chunks(chunk_size).map(|chunk|std::thread::Builder::new().name("inspection-cas".into()).spawn_scoped(scope,move||->Result<(),String>{
                for &index in chunk {
                    let item=&pending[index];
                    let observed=store_asset(directory,&item.bytes,&item.mime)?;
                    if observed!=item.asset{return Err("保存資產描述與準備內容不一致".into());}
                }Ok(())
            }).map_err(|e|format!("無法建立資產保存工作：{e}"))).collect::<Result<_,_>>()?;
            let mut failure=None;
            for handle in handles {
                let result=handle.join().unwrap_or_else(|_|Err("資產保存工作執行失敗".into()));
                if let Err(error)=result{if failure.is_none(){failure=Some(error);}}
            }
            if let Some(error)=failure{Err(error)}else{Ok(())}
        })?;
    }
    Ok(json!({"backend":"bounded-parallel-cas-v1","workers":workers,"uniqueAssets":jobs.len(),
        "references":jobs.len(),"writeAndVerifyMs":began.elapsed().as_secs_f64()*1000.}))
}

// Batch only new content; keep cross-unit code/asset deduplication. A verified
// historical locator is reused exactly, rather than repacking its bytes. Small
// groups retain ordinary CAS files, where an index is not worthwhile.
fn flush_workspace_assets(directory:&Path,pending:&[PendingAsset])->Result<(std::collections::BTreeMap<String,Value>,Vec<Value>,Value),String>{
    let started=Instant::now();
    let mut unique=std::collections::BTreeMap::<String,usize>::new();
    for (index,item) in pending.iter().enumerate(){
        let key=asset_pack::logical_key(&item.asset);
        if let Some(previous)=unique.get(&key){if &*pending[*previous].bytes!=&*item.bytes{return Err("相同資產身份內容不一致".into());}}
        else{unique.insert(key,index);}
    }
    let mut known=with_journal_index(directory,|index|unique.keys().filter_map(|key|index.locations.get(key).map(|v|(key.clone(),v.clone()))).collect::<std::collections::BTreeMap<_,_>>())?;
    let missing:Vec<_>=unique.keys().filter(|key|!known.contains_key(*key)).cloned().collect();
    if !missing.is_empty(){known.extend(crate::workspace::manifest_asset_locations(directory,&missing)?);}
    let mut locations=std::collections::BTreeMap::new();let mut new=Vec::new();let mut containers=std::collections::BTreeMap::new();let mut ordinary_jobs=Vec::new();
    let mut pack_bytes=std::collections::BTreeMap::<String,asset_pack::VerifiedPack>::new();
    let mut cached_pack_bytes=0usize;
    for (key,index) in &unique {
        let item=&pending[*index];
        if let Some(previous)=known.get(key) {
            if let Some(physical)=asset_pack::container(previous)? {
                let physical_key=asset_pack::key(physical);
                if !pack_bytes.contains_key(&physical_key){
                    let size=physical["size"].as_u64().ok_or("容器缺少大小")? as usize;
                    if cached_pack_bytes.checked_add(size).is_none_or(|total|total>asset_pack::MAX_BYTES){pack_bytes.clear();cached_pack_bytes=0;}
                    let bytes=crate::workspace::read_workspace_asset_bytes(directory,physical)?;
                    pack_bytes.insert(physical_key.clone(),asset_pack::VerifiedPack::new(bytes,physical)?);
                    cached_pack_bytes+=size;
                }
                let actual=pack_bytes[&physical_key].read(previous)?;
                if actual!=&*item.bytes{return Err("已有容器資產與運算原字節不符".into());}
                let mut normalized=asset_pack::core(previous);normalized["packedIn"]=previous["packedIn"].clone();
                locations.insert(key.clone(),normalized);containers.insert(physical_key,physical.clone());
            }else{
                ordinary_jobs.push(*index);locations.insert(key.clone(),item.asset.clone());
            }
        }else if fs::symlink_metadata(directory.join(item.asset["$asset"].as_str().ok_or("資產路徑無效")?)).is_ok(){
            // An uncommitted orphan may exist after an interrupted save. It
            // still has to match byte for byte; corruption is never repacked.
            ordinary_jobs.push(*index);locations.insert(key.clone(),item.asset.clone());
        }else{new.push(*index);}
    }
    let total=new.iter().try_fold(0usize,|sum,&i|sum.checked_add(pending[i].bytes.len()).ok_or("資產總量溢出"))?;
    // Reserve the maximum index/header size before choosing the pack path.
    // This is a preparation decision, never a fallback after an encode error.
    let pack=new.len()>=3&&new.len()<=asset_pack::MAX_ENTRIES&&total>=64*1024&&total<=asset_pack::MAX_BYTES-4*1024*1024-16;
    let mut workers=0usize;
    if pack {
        let borrowed:Vec<_>=new.iter().map(|&i|(&pending[i].asset,&*pending[i].bytes)).collect();
        let encoded=asset_pack::encode(&borrowed)?;
        let physical=store_asset(directory,&encoded.bytes,"application/octet-stream")?;
        if physical!=encoded.physical{return Err("容器保存身份不一致".into());}
        containers.insert(asset_pack::key(&physical),physical);locations.extend(encoded.locations);
    }else if !new.is_empty(){
        ordinary_jobs.extend_from_slice(&new);
        for &index in &new{let item=&pending[index];locations.insert(asset_pack::logical_key(&item.asset),item.asset.clone());}
    }
    if !ordinary_jobs.is_empty(){let saved=flush_asset_jobs(directory,pending,&ordinary_jobs)?;workers=saved["workers"].as_u64().unwrap_or(0) as usize;}
    let timing=json!({"backend":"batch-content-addressed-assets-v1","workers":workers,"references":pending.len(),"uniqueAssets":unique.len(),
        "newAssets":new.len(),"newBytes":total,"newContainers":usize::from(pack),"reusedAssets":unique.len()-new.len(),"packCacheBudgetBytes":asset_pack::MAX_BYTES,"writeAndVerifyMs":started.elapsed().as_secs_f64()*1000.});
    Ok((locations,containers.into_values().collect(),timing))
}
fn runtime_artifact_bytes(
    run: &Value,
    artifact: &Value,
    runtime: &Path,
) -> Result<Vec<u8>, String> {
    let directory = PathBuf::from(
        run.get("runDirectory")
            .and_then(Value::as_str)
            .ok_or("運算缺少目錄來源")?,
    )
    .canonicalize()
    .map_err(|e| e.to_string())?;
    let runtime = runtime.canonicalize().map_err(|e| e.to_string())?;
    if directory == runtime || !directory.starts_with(&runtime) {
        return Err("產物來源不在本機已知運算根目錄".into());
    }
    let path = PathBuf::from(
        artifact
            .get("path")
            .and_then(Value::as_str)
            .ok_or("產物缺少檔案來源")?,
    )
    .canonicalize()
    .map_err(|e| e.to_string())?;
    let outputs = directory
        .join("outputs")
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if outputs == directory
        || !outputs.starts_with(&directory)
        || path == outputs
        || !path.starts_with(&outputs)
    {
        return Err("產物不在該運算輸出目錄".into());
    }
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 128 * 1024 * 1024 {
        return Err("產物超過128MB保存預算".into());
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if artifact.get("sha256").and_then(Value::as_str) != Some(sha(&bytes).as_str()) {
        return Err("產物內容與實算雜湊不符".into());
    }
    Ok(bytes)
}
fn runtime_root() -> Result<PathBuf, String> {
    if let Some(root) = std::env::var_os("AGENTCV_RUNTIME_ROOT") {
        return Ok(PathBuf::from(root));
    }
    Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("找不到運算根目錄")?
        .join("runtime"))
}
pub(crate) fn is_workspace_record(value: &Value) -> bool {
    value.get("storage").and_then(Value::as_str) == Some("workspace")
        && value.get("kind").and_then(Value::as_str) == Some("inspection-unit")
        && value.get("$asset").is_some()
}
const JOURNAL: &str = ".agentcv-inspection-assets.jsonl";
#[derive(Default)]
struct JournalIndex {
    offset: u64,
    entries: std::collections::BTreeMap<String, Value>,
    locations: std::collections::BTreeMap<String, Value>,
}
static JOURNAL_INDEXES: std::sync::OnceLock<
    Mutex<std::collections::HashMap<PathBuf, JournalIndex>>,
> = std::sync::OnceLock::new();
fn journal_key(asset: &Value) -> String {
    asset_pack::key(asset)
}
fn with_journal_index<T>(
    directory: &Path,
    inspect: impl FnOnce(&JournalIndex) -> T,
) -> Result<T, String> {
    use std::io::{BufRead, BufReader, Seek, SeekFrom};
    let path = directory.join(JOURNAL);
    if !path.exists() {
        return Ok(inspect(&JournalIndex::default()));
    }
    let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err("執行資產索引不安全".into());
    }
    let mut indexes = JOURNAL_INDEXES
        .get_or_init(|| Mutex::new(std::collections::HashMap::new()))
        .lock()
        .map_err(|_| "執行資產索引不可用")?;
    if indexes.len() >= 8 && !indexes.contains_key(directory) {
        if let Some(key) = indexes.keys().next().cloned() {
            indexes.remove(&key);
        }
    }
    let index = indexes.entry(directory.to_owned()).or_default();
    if meta.len() < index.offset {
        *index = JournalIndex::default();
    }
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(index.offset))
        .map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(file);
    loop {
        let mut line = String::new();
        let count = reader.read_line(&mut line).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        if !line.ends_with('\n') || count > 32 * 1024 * 1024 {
            return Err("執行資產索引不完整或單筆過大".into());
        }
        let assets: Vec<Value> = serde_json::from_str(&line).map_err(|_| "執行資產索引損壞")?;
        for asset in assets {
            index.locations.insert(asset_pack::logical_key(&asset),asset.clone());
            index.entries.insert(journal_key(&asset), asset);
        }
        index.offset += count as u64;
    }
    Ok(inspect(index))
}
fn journal_entries(directory: &Path) -> Result<Vec<Value>, String> {
    with_journal_index(directory, |index| index.entries.values().cloned().collect())
}
pub(crate) fn owns_staged_asset(directory: &Path, asset: &Value) -> Result<bool, String> {
    let key = journal_key(asset);
    with_journal_index(directory, |index| index.entries.contains_key(&key))
}
fn register_assets(directory: &Path, assets: &[Value]) -> Result<(), String> {
    let path = directory.join(JOURNAL);
    if fs::symlink_metadata(&path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err("執行資產索引不能是符號連結".into());
    }
    let bytes = serde_json::to_vec(assets).map_err(|e| e.to_string())?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.write_all(b"\n"))
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())
}

fn save_workspace_unit(
    directory: &Path,
    mut request: Value,
    runtime: &Path,
) -> Result<Value, String> {
    let prepared=PreparedUnit::prepare(std::mem::take(&mut request))?;
    save_prepared_workspace_unit(directory,&prepared,runtime)
}
fn save_prepared_workspace_unit(directory:&Path,prepared:&PreparedUnit,runtime:&Path)->Result<Value,String>{
    stage_prepared_workspace_unit(directory,prepared,runtime,None)
}
fn stage_prepared_workspace_unit(directory:&Path,prepared:&PreparedUnit,runtime:&Path,batch_assets:Option<&mut Vec<Value>>)->Result<Value,String>{
    let batching=batch_assets.is_some();
    let started=Instant::now();
    let mut request=prepared.request.clone();
    let leases=&prepared.facts;
    let execution_id = identity(&request, "executionId")?;
    let unit_id = identity(request.get("unit").ok_or("缺少工件資料")?, "id")?;
    let cleanup_runtime = request
        .get("cleanupRuntime")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let mut run_directories = Vec::new();
    let mut assets = Vec::new();
    let mut pending_assets=Vec::new();
    if let Some(runs) = request.get_mut("runs").and_then(Value::as_array_mut) {
        for (run_index, run) in runs.iter_mut().enumerate() {
            let run_id=identity(run,"runId")?;
            let origin = json!({"runDirectory":run["runDirectory"]});
            if cleanup_runtime {
                if let Some(path) = origin.get("runDirectory").and_then(Value::as_str) {
                    run_directories.push(PathBuf::from(path));
                }
            }
            if let Some(artifacts) = run.get_mut("artifacts").and_then(Value::as_array_mut) {
                for artifact in artifacts {
                    verify_memory_owner(&run_id,artifact)?;
                    if crate::artifact_capture::verified(artifact){continue;}
                    // Batch evidence policy may intentionally retain only the
                    // verified image descriptor.  Keep the fact in the unit
                    // record, but do not turn a metadata-only image back into
                    // a durable pixel asset.
                    if artifact.get("pixelRetention").and_then(Value::as_str)
                        == Some("metadata-only")
                    {
                        if let Some(object) = artifact.as_object_mut() {
                            object.remove("path");
                            object.remove("assetRef");
                            object.remove("dataUrl");
                            object.remove("dataURL");
                            object.remove("displayPreview");
                            object.remove("memoryRef");
                            object.remove("residentRaster");
                        }
                        continue;
                    }
                    let bytes = if let Some(bytes) = prepared.artifact_bytes(artifact)? {
                        bytes
                    } else if let Some(reference) = artifact
                        .get("assetRef")
                        .filter(|reference| reference.get("$asset").is_some())
                    {
                        let owner = reference
                            .get("root")
                            .and_then(Value::as_str)
                            .map(owned_workspace)
                            .transpose()?
                            .unwrap_or_else(|| directory.to_owned());
                        ArtifactBytes::Owned(crate::workspace::read_workspace_asset_bytes(&owner, reference)?)
                    } else {
                        let run_path = origin
                            .get("runDirectory")
                            .and_then(Value::as_str)
                            .map(PathBuf::from)
                            .ok_or("運算缺少目錄來源")?;
                        let workspace_runs = directory.join("algorithm-runs");
                        let owned_runs = if workspace_runs.is_dir()
                            && run_path
                                .canonicalize()
                                .map_err(|e| e.to_string())?
                                .starts_with(
                                    workspace_runs.canonicalize().map_err(|e| e.to_string())?,
                                ) {
                            &workspace_runs
                        } else {
                            runtime
                        };
                        ArtifactBytes::Owned(runtime_artifact_bytes(&origin, artifact, owned_runs)?)
                    };
                    let mime = artifact.get("mime").and_then(Value::as_str).unwrap_or(
                        if artifact.get("type").and_then(Value::as_str) == Some("image") {
                            "image/png"
                        } else {
                            "application/octet-stream"
                        },
                    );
                    let asset = queue_asset(&mut pending_assets,bytes,mime);
                    assets.push(asset.clone());
                    let object = artifact.as_object_mut().ok_or("產物格式錯誤")?;
                    object.remove("path");
                    object.remove("memoryRef");
                    object.remove("residentRaster");
                    object.insert("assetRef".into(), asset);
                }
            }
            if let Some(object) = run.as_object_mut() {
                object.remove("runDirectory");
                let code=object.get("code").or_else(||leases[run_index].as_ref().and_then(|bundle|bundle["fields"].get("code")));
                if let Some(code) = code.and_then(Value::as_str) {
                    let reference = queue_asset(&mut pending_assets,ArtifactBytes::Owned(code.as_bytes().to_vec()), "text/plain");
                    assets.push(reference.clone());
                    object.insert("codeRef".into(), reference);
                    object.remove("code");
                }
            }
        }
    }
    let (locations,containers,asset_writes)=flush_workspace_assets(directory,&pending_assets)?;
    let resolve=|asset:&mut Value|->Result<(),String>{
        let location=locations.get(&asset_pack::logical_key(asset)).ok_or("保存後資產定位遺失")?;
        if asset_pack::core(location)!=asset_pack::core(asset){return Err("保存後資產原始身份改變".into());}
        *asset=location.clone();Ok(())
    };
    if let Some(runs)=request["runs"].as_array_mut(){for run in runs {
        if let Some(code)=run.get_mut("codeRef"){resolve(code)?;}
        if let Some(artifacts)=run["artifacts"].as_array_mut(){for artifact in artifacts {if let Some(asset)=artifact.get_mut("assetRef"){resolve(asset)?;}}}
    }}
    for asset in &mut assets {resolve(asset)?;}assets.extend(containers);
    let artifacts_ms=started.elapsed().as_secs_f64()*1000.;
    let record_started=Instant::now();
    request
        .as_object_mut()
        .ok_or("執行紀錄格式錯誤")?
        .remove("workspaceRoot");
    if let Some(object) = request.as_object_mut() {
        object.remove("cleanupRuntime");
    }
    let bytes = serde_json::to_vec(&DurableUnit { request: &request, leases: &leases }).map_err(|e| e.to_string())?;
    if bytes.len() > 32 * 1024 * 1024 {
        return Err("單件結構資料超過32MB".into());
    }
    let mut reference = store_asset(directory, &bytes, "application/json")?;
    let record_ms=record_started.elapsed().as_secs_f64()*1000.;
    reference["storage"] = json!("workspace");
    reference["kind"] = json!("inspection-unit");
    reference["executionId"] = json!(execution_id);
    reference["unitId"] = json!(unit_id);
    assets.push(reference.clone());
    let journal_started=Instant::now();
    if let Some(batch)=batch_assets{batch.extend(assets);}else{register_assets(directory,&assets)?;}
    let journal_ms=journal_started.elapsed().as_secs_f64()*1000.;
    let cleanup_started=Instant::now();
    let mut removed_runtime_directories = 0usize;
    if cleanup_runtime && !batching {
        // execute_locked creates ordinary runs under runtime/cv-runs. Keep
        // the direct-child ownership check at that exact root, rather than
        // broadening it to every descendant of runtime.
        let cv_runs = runtime.join("cv-runs");
        let workspace_runs = directory.join("algorithm-runs");
        let mut seen = std::collections::HashSet::new();
        for path in run_directories {
            let key = path.to_string_lossy().into_owned();
            if !seen.insert(key) {
                continue;
            }
            if remove_owned_run_directory(&path, &cv_runs)?
                || remove_owned_run_directory(&path, runtime)?
                || remove_owned_run_directory(&path, &workspace_runs)?
            {
                removed_runtime_directories += 1;
            }
        }
    }
    reference["root"] = json!(directory.to_string_lossy());
    Ok(json!({"status":if batching{"STAGED"}else{"SAVED"},"recordRef":reference,"bytes":bytes.len(),
        "timing":{"native":{"clock":"monotonic","artifactsMs":artifacts_ms,"recordMs":record_ms,
            "assetWrites":asset_writes,
            "factsMode":"borrowed-native-tree-v1","factLeases":leases.iter().filter(|bundle|bundle.is_some()).count(),
            "journalMs":journal_ms,"cleanupMs":cleanup_started.elapsed().as_secs_f64()*1000.,"totalMs":started.elapsed().as_secs_f64()*1000.}},
        "runtimeCleanup": {"requested":cleanup_runtime,"removedDirectories":removed_runtime_directories}}))
}

/// Remove only a direct child of a known run root.  This is deliberately
/// stricter than a prefix check: a malformed or symlinked run path must never
/// make a batch save delete an arbitrary project directory.
fn remove_owned_run_directory(candidate: &Path, root: &Path) -> Result<bool, String> {
    if !root.is_dir() || !candidate.exists() {
        return Ok(false);
    }
    let candidate_meta = fs::symlink_metadata(candidate).map_err(|e| e.to_string())?;
    if candidate_meta.file_type().is_symlink() || !candidate_meta.is_dir() {
        return Err("執行目錄不是安全的實體資料夾，拒絕清理".into());
    }
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    let canonical_candidate = candidate.canonicalize().map_err(|e| e.to_string())?;
    if canonical_candidate.parent() != Some(canonical_root.as_path()) {
        return Ok(false);
    }
    fs::remove_dir_all(canonical_candidate).map_err(|e| e.to_string())?;
    Ok(true)
}
#[tauri::command]
pub async fn save_inspection_unit(app: tauri::AppHandle, request: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move||save_inspection_unit_impl(app,request)).await.map_err(|e|e.to_string())?
}
pub(crate) fn save_inspection_unit_impl(app: tauri::AppHandle, mut request: Value) -> Result<Value, String> {
    save_prepared_unit(app, &PreparedUnit::prepare(std::mem::take(&mut request))?)
}
pub(crate) fn save_prepared_unit(app:tauri::AppHandle,prepared:&PreparedUnit)->Result<Value,String>{
    let _lock = RECORD_LOCK.lock().map_err(|_| "執行紀錄寫入器不可用")?;
    let mut request=prepared.request.clone();
    if let Some(path) = request
        .get("workspaceRoot")
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty())
    {
        let directory = owned_workspace(path)?;
        return save_prepared_workspace_unit(&directory, prepared, &runtime_root()?);
    }
    hydrate_leased_facts(&mut request,&prepared.facts)?;
    let execution_id = identity(&request, "executionId")?;
    let unit_id = identity(request.get("unit").ok_or("缺少工件資料")?, "id")?;
    persist_leased_runtime_artifacts(&mut request,&runtime_root()?,Some(prepared))?;
    strip_inline(&mut request);
    let bytes = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
    if bytes.len() > 32 * 1024 * 1024 {
        return Err("單件結構資料超過32MB；圖像應以產物引用保存".into());
    }
    let directory = execution_root(&app, &execution_id)?;
    let path = directory.join(format!("{}.json", sha(unit_id.as_bytes())));
    let existed = path.exists();
    write_once(&path, &bytes)?;
    let reference = json!({"executionId":execution_id,"unitId":unit_id,"sha256":sha(&bytes)});
    if !existed {
        let index = json!({"unitId":unit_id,"reference":reference,"summary":request.get("record").cloned().unwrap_or(Value::Null)});
        let mut f = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(directory.join("index.jsonl"))
            .map_err(|e| e.to_string())?;
        serde_json::to_writer(&mut f, &index).map_err(|e| e.to_string())?;
        f.write_all(b"\n")
            .and_then(|_| f.sync_all())
            .map_err(|e| e.to_string())?;
    }
    Ok(json!({"status":"SAVED","recordRef":reference,"bytes":bytes.len()}))
}

// One durable journal append/fsync per workspace in a flush. CAS assets and
// records are verified first; no receipt or runtime cleanup precedes that commit.
pub(crate) fn save_prepared_batch(app:tauri::AppHandle,units:&[Arc<PreparedUnit>])->Vec<Result<Value,String>>{
    let mut results:Vec<Result<Value,String>>=units.iter().map(|_|Err("ARCHIVE_NOT_WRITTEN".into())).collect();
    let mut groups:std::collections::BTreeMap<String,Vec<usize>>=std::collections::BTreeMap::new();
    for (index,unit) in units.iter().enumerate(){
        if let Some(root)=unit.request["workspaceRoot"].as_str().filter(|s|!s.is_empty()){groups.entry(root.to_owned()).or_default().push(index);}
        else{results[index]=save_prepared_unit(app.clone(),unit);}
    }
    let lock=RECORD_LOCK.lock();
    let runtime=runtime_root();
    for (root,indices) in groups{
        let outcome=(||->Result<Vec<Result<Value,String>>,String>{
            let _guard=lock.as_ref().map_err(|_|"ARCHIVE_RECORD_LOCK_UNAVAILABLE".to_owned())?;
            let runtime=runtime.as_ref().map_err(Clone::clone)?;
            let directory=owned_workspace(&root)?;
            let payloads:Vec<_>=indices.iter().map(|index|units[*index].clone()).collect();
            Ok(save_prepared_workspace_batch(&directory,&payloads,runtime))
        })();
        match outcome{
            Ok(receipts)=>for (index,receipt) in indices.into_iter().zip(receipts){results[index]=receipt;},
            Err(error)=>for index in indices{results[index]=Err(error.clone());},
        }
    }
    results
}
fn save_prepared_workspace_batch(directory:&Path,units:&[Arc<PreparedUnit>],runtime:&Path)->Vec<Result<Value,String>>{
    let started=Instant::now();
    let mut results:Vec<Result<Value,String>>=units.iter().map(|_|Err("ARCHIVE_NOT_WRITTEN".into())).collect();
    let mut assets=Vec::new();let mut staged=Vec::new();
    for (index,unit) in units.iter().enumerate(){match stage_prepared_workspace_unit(directory,unit,runtime,Some(&mut assets)){
        Ok(receipt)=>staged.push((index,receipt)),Err(error)=>results[index]=Err(error),
    }}
    if staged.is_empty(){return results;}
    let journal=Instant::now();let committed=register_assets(directory,&assets);let journal_ms=journal.elapsed().as_secs_f64()*1000.;let batch_size=staged.len();
    for (index,mut receipt) in staged{
        if let Err(error)=&committed{results[index]=Err(error.clone());continue;}
        let cleanup=Instant::now();let request=&units[index].request;let mut removed=0;
        let outcome=(||->Result<(),String>{
            if request["cleanupRuntime"]==true{
                let mut seen=std::collections::HashSet::new();
                for run in request["runs"].as_array().into_iter().flatten(){if let Some(path)=run["runDirectory"].as_str(){if seen.insert(path){let path=Path::new(path);if remove_owned_run_directory(path,&runtime.join("cv-runs"))?||remove_owned_run_directory(path,runtime)?||remove_owned_run_directory(path,&directory.join("algorithm-runs"))?{removed+=1;}}}}
            }
            Ok(())
        })();
        if let Err(error)=outcome{results[index]=Err(error);continue;}
        receipt["status"]=json!("SAVED");receipt["runtimeCleanup"]["removedDirectories"]=json!(removed);
        receipt["timing"]["native"]["journalMs"]=json!(journal_ms);receipt["timing"]["native"]["journalBatchSize"]=json!(batch_size);
        receipt["timing"]["native"]["cleanupMs"]=json!(cleanup.elapsed().as_secs_f64()*1000.);
        results[index]=Ok(receipt);
    }
    let elapsed=started.elapsed().as_secs_f64()*1000.;
    for receipt in results.iter_mut().filter_map(|r|r.as_mut().ok()){
        receipt["timing"]["native"]["stageMs"]=receipt["timing"]["native"]["totalMs"].clone();
        receipt["timing"]["native"]["totalMs"]=json!(elapsed);
        receipt["timing"]["native"]["scope"]=json!("whole workspace batch: staging, one journal sync and all cleanup; shared wall time, do not sum across records");
    }
    results
}

fn read_workspace_unit(reference: &Value) -> Result<Value, String> {
    let directory = owned_workspace(
        reference
            .get("root")
            .and_then(Value::as_str)
            .ok_or("執行紀錄缺少工程根目錄")?,
    )?;
    let bytes = crate::workspace::read_workspace_asset_bytes(&directory, reference)?;
    let mut value: Value = serde_json::from_slice(&bytes).map_err(|_| "執行紀錄損壞")?;
    if value["executionId"] != reference["executionId"]
        || value["unit"]["id"] != reference["unitId"]
    {
        return Err("執行紀錄識別不符".into());
    }
    // Returned per-unit records can be placed on the active canvas. Give their
    // image descriptors a verified owning root so a subsequent normal project
    // save can archive that selected unit without requiring the old runtime.
    if let Some(runs) = value.get_mut("runs").and_then(Value::as_array_mut) {
        for run in runs {
            if let Some(artifacts) = run.get_mut("artifacts").and_then(Value::as_array_mut) {
                for artifact in artifacts {
                    if let Some(asset) = artifact.get_mut("assetRef").and_then(Value::as_object_mut)
                    {
                        asset.insert("root".into(), json!(directory.to_string_lossy()));
                    }
                    if artifact["dataStorage"]=="artifact-bytes" {
                        let bytes=crate::workspace::read_workspace_asset_bytes(&directory,&artifact["assetRef"])?;
                        hydrate_json_artifact(artifact,&bytes)?;
                    }
                }
            }
        }
    }
    if reference.get("includeCode").and_then(Value::as_bool) != Some(false) {
        if let Some(runs) = value.get_mut("runs").and_then(Value::as_array_mut) {
            for run in runs {
                if let Some(code_ref) = run.get("codeRef") {
                    if code_ref["mime"] != "text/plain"
                        || code_ref["size"]
                            .as_u64()
                            .is_none_or(|size| size > 32 * 1024 * 1024)
                    {
                        return Err("程式文字引用格式錯誤或超過32MB預算".into());
                    }
                    let code = crate::workspace::read_workspace_asset_bytes(&directory, code_ref)?;
                    run["code"] = json!(String::from_utf8(code).map_err(|_| "程式文字不是UTF-8")?);
                }
            }
        }
    }
    Ok(value)
}

fn hydrate_json_artifact(artifact:&mut Value,bytes:&[u8])->Result<(),String>{
    if artifact["type"]!="json"||artifact.get("data").is_some()
        ||artifact["sha256"].as_str()!=Some(sha(bytes).as_str())||artifact["bytes"].as_u64()!=Some(bytes.len() as u64){
        return Err("JSON artifact reference does not match its immutable bytes".into());
    }
    artifact["data"]=serde_json::from_slice(bytes).map_err(|e|format!("Saved JSON artifact is invalid: {e}"))?;
    artifact.as_object_mut().unwrap().remove("dataStorage");
    Ok(())
}
fn read_unit(app: &tauri::AppHandle, reference: &Value) -> Result<Value, String> {
    if is_workspace_record(reference) {
        return read_workspace_unit(reference);
    }
    let eid = identity(reference, "executionId")?;
    let uid = identity(reference, "unitId")?;
    let p = execution_root(app, &eid)?.join(format!("{}.json", sha(uid.as_bytes())));
    let b = fs::read(p).map_err(|e| e.to_string())?;
    if let Some(expected) = reference.get("sha256").and_then(Value::as_str) {
        if sha(&b) != expected {
            return Err("執行紀錄雜湊不符".into());
        }
    }
    let mut value:Value=serde_json::from_slice(&b).map_err(|e| e.to_string())?;
    if let Some(runs)=value.get_mut("runs").and_then(Value::as_array_mut){
        let runtime=runtime_root()?;
        for run in runs {
            let origin=json!({"runDirectory":run["runDirectory"]});
            if let Some(artifacts)=run.get_mut("artifacts").and_then(Value::as_array_mut){
                for artifact in artifacts {
                    if artifact["dataStorage"]=="artifact-bytes" {
                        let bytes=runtime_artifact_bytes(&origin,artifact,&runtime)?;
                        hydrate_json_artifact(artifact,&bytes)?;
                    }
                }
            }
        }
    }
    Ok(value)
}
#[tauri::command]
pub fn read_inspection_unit(app: tauri::AppHandle, reference: Value) -> Result<Value, String> {
    read_unit(&app, &reference)
}
fn collect_records(
    value: &Value,
    eid: &str,
    records: &mut std::collections::BTreeMap<String, Value>,
) {
    if is_workspace_record(value) && value["executionId"].as_str() == Some(eid) {
        if let Some(hash) = value["sha256"].as_str() {
            records.insert(hash.to_owned(), value.clone());
        }
        return;
    }
    match value {
        Value::Array(items) => {
            for item in items {
                collect_records(item, eid, records)
            }
        }
        Value::Object(items) => {
            for item in items.values() {
                collect_records(item, eid, records)
            }
        }
        _ => {}
    }
}
#[tauri::command]
pub fn list_inspection_units(
    app: tauri::AppHandle,
    execution_id: String,
    offset: Option<usize>,
    limit: Option<usize>,
    workspace_root: Option<String>,
) -> Result<Value, String> {
    use std::io::{BufRead, BufReader};
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(50).clamp(1, 200);
    if let Some(root) = workspace_root {
        let directory = owned_workspace(&root)?;
        let manifest: Value = serde_json::from_slice(
            &fs::read(directory.join("manifest.agentcv.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|_| "工程清單損壞")?;
        let mut records = std::collections::BTreeMap::new();
        collect_records(&manifest, &execution_id, &mut records);
        for staged in journal_entries(&directory)? {
            collect_records(&staged, &execution_id, &mut records);
        }
        let total = records.len();
        let rows = records
            .into_values()
            .skip(offset)
            .take(limit)
            .map(|mut reference| {
                reference["root"] = json!(directory.to_string_lossy());
                json!({"unitId":reference["unitId"],"reference":reference})
            })
            .collect::<Vec<_>>();
        return Ok(json!({"rows":rows,"total":total,"offset":offset,"limit":limit}));
    }
    let path = execution_root(&app, &execution_id)?.join("index.jsonl");
    if !path.exists() {
        return Ok(json!({"rows":[],"total":0}));
    }
    let reader = BufReader::new(fs::File::open(path).map_err(|e| e.to_string())?);
    let mut total = 0usize;
    let mut rows = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if total >= offset && rows.len() < limit {
            rows.push(serde_json::from_str::<Value>(&line).map_err(|e| e.to_string())?)
        }
        total += 1;
    }
    Ok(json!({"rows":rows,"total":total,"offset":offset,"limit":limit}))
}
fn artifact_of<'a>(unit: &'a Value, reference: &Value) -> Result<(&'a Value, &'a Value), String> {
    let run_id = identity(reference, "runId")?;
    let artifact_id = identity(reference, "artifactId")?;
    let run = unit
        .get("runs")
        .and_then(Value::as_array)
        .and_then(|a| {
            a.iter()
                .find(|r| r.get("runId").and_then(Value::as_str) == Some(run_id.as_str()))
        })
        .ok_or("此工件沒有對應運算")?;
    let artifact = run
        .get("artifacts")
        .and_then(Value::as_array)
        .and_then(|a| {
            a.iter()
                .find(|a| a.get("id").and_then(Value::as_str) == Some(artifact_id.as_str()))
        })
        .ok_or("產物不存在")?;
    Ok((run, artifact))
}
#[tauri::command]
pub fn read_inspection_artifact(app: tauri::AppHandle, reference: Value) -> Result<Value, String> {
    let unit = read_unit(&app, &reference)?;
    let (run, artifact) = artifact_of(&unit, &reference)?;
    if crate::artifact_capture::verified(artifact){return Err("此診斷產物未採集；請對指定圖片開啟 diagnostics 重跑".into());}
    if artifact.get("pixelRetention").and_then(Value::as_str) == Some("metadata-only") {
        return Err("此批次只保留產物摘要；若要查看像素，請重跑此工件或選擇保留全部圖像".into());
    }
    let bytes = if is_workspace_record(&reference) {
        let directory = owned_workspace(reference["root"].as_str().ok_or("執行紀錄缺少工程")?)?;
        crate::workspace::read_workspace_asset_bytes(
            &directory,
            artifact.get("assetRef").ok_or("產物缺少工程資產引用")?,
        )?
    } else {
        runtime_artifact_bytes(run, artifact, &runtime_root()?)?
    };
    if bytes.len() > 32 * 1024 * 1024 {
        return Err("產物超過單次預覽預算".into());
    }
    let mime = artifact.get("mime").and_then(Value::as_str).unwrap_or(
        if artifact.get("type").and_then(Value::as_str) == Some("image") {
            "image/png"
        } else {
            "application/octet-stream"
        },
    );
    Ok(
        json!({"artifact":artifact,"dataURL":format!("data:{mime};base64,{}",STANDARD.encode(&bytes)),"verified":true}),
    )
}
// Save-as follows only the immutable record's declared closure, never unrelated
// files in its directory. The caller stores these descriptors in the manifest.
pub(crate) fn relocate_records(
    value: &mut Value,
    destination: &Path,
    assets: &mut std::collections::BTreeMap<String, Value>,
) -> Result<(), String> {
    if is_workspace_record(value) {
        if let Some(previous) = value
            .get("$asset")
            .and_then(Value::as_str)
            .and_then(|path| assets.get(path))
        {
            if is_workspace_record(previous)
                && journal_key(previous) == journal_key(value)
                && previous["executionId"] == value["executionId"]
                && previous["unitId"] == value["unitId"]
            {
                value
                    .as_object_mut()
                    .ok_or("執行紀錄引用錯誤")?
                    .remove("root");
                return Ok(());
            }
        }
        let source = owned_workspace(
            value
                .get("root")
                .and_then(Value::as_str)
                .ok_or("執行紀錄缺少來源工程")?,
        )?;
        let mut metadata_reference = value.clone();
        metadata_reference["includeCode"] = json!(false);
        let record = read_workspace_unit(&metadata_reference)?;
        let bytes = crate::workspace::read_workspace_asset_bytes(&source, value)?;
        let mut references = Vec::new();
        fn find(value: &Value, out: &mut Vec<Value>) {
            if value.get("$asset").is_some() {
                out.push(value.clone());
                return;
            }
            match value {
                Value::Array(a) => {
                    for v in a {
                        find(v, out)
                    }
                }
                Value::Object(o) => {
                    for v in o.values() {
                        find(v, out)
                    }
                }
                _ => {}
            }
        }
        find(&record, &mut references);
        for reference in references {
            if let Some(physical)=asset_pack::container(&reference)? {
                // Keep immutable record bytes unchanged: transfer the actual
                // container and retain its logical descriptors in the closure.
                crate::workspace::read_workspace_asset_bytes(&source,&reference)?;
                let physical_bytes=crate::workspace::read_workspace_asset_bytes(&source,physical)?;
                let owned=store_asset(destination,&physical_bytes,"application/octet-stream")?;
                if asset_pack::key(&owned)!=asset_pack::key(physical){return Err("拷貝容器身份不一致".into());}
                assets.insert(owned["$asset"].as_str().unwrap().to_owned(),owned);
                let mut logical=asset_pack::core(&reference);logical["packedIn"]=reference["packedIn"].clone();
                assets.insert(asset_pack::key(&logical),logical);
                continue;
            }
            if let Some(previous) = reference
                .get("$asset")
                .and_then(Value::as_str)
                .and_then(|path| assets.get(path))
            {
                if journal_key(previous) == journal_key(&reference) {
                    continue;
                }
            }
            let bytes = crate::workspace::read_workspace_asset_bytes(&source, &reference)?;
            let owned = store_asset(
                destination,
                &bytes,
                reference["mime"].as_str().ok_or("產物類型缺失")?,
            )?;
            if journal_key(&owned) != journal_key(&reference) {
                return Err("產物資產引用不一致".into());
            }
            assets.insert(owned["$asset"].as_str().unwrap().to_owned(), owned);
        }
        let stored = store_asset(destination, &bytes, "application/json")?;
        if stored["sha256"] != value["sha256"] {
            return Err("執行紀錄拷貝後雜湊不一致".into());
        }
        let object = value.as_object_mut().ok_or("執行紀錄引用錯誤")?;
        object.remove("root");
        assets.insert(value["$asset"].as_str().unwrap().to_owned(), value.clone());
        return Ok(());
    }
    match value {
        Value::Array(items) => {
            for item in items {
                relocate_records(item, destination, assets)?
            }
        }
        Value::Object(items) => {
            for item in items.values_mut() {
                relocate_records(item, destination, assets)?
            }
        }
        _ => {}
    }
    Ok(())
}
#[tauri::command]
pub fn prepare_external_run_files(app: tauri::AppHandle, request: Value) -> Result<Value, String> {
    let _lock = RECORD_LOCK.lock().map_err(|_| "檔案輸出器不可用")?;
    let id = identity(&request, "runId")?;
    let bytes = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
    if bytes.len() > 32 * 1024 * 1024 {
        return Err("診斷資料超過32MB，請分別開啟產物".into());
    }
    let bundle = sha(&bytes);
    let dir = root(&app, "external-records")?.join(&bundle);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for (kind, name) in [
        ("code", "algorithm.py"),
        ("logs", "execution.log.json"),
        ("environment", "environment.json"),
        ("data", "result.json"),
    ] {
        let content = if kind == "code" {
            request
                .get("code")
                .and_then(Value::as_str)
                .unwrap_or("")
                .as_bytes()
                .to_vec()
        } else {
            serde_json::to_vec_pretty(request.get(kind).unwrap_or(&Value::Null))
                .map_err(|e| e.to_string())?
        };
        let path = dir.join(name);
        write_once(&path, &content)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o444))
                .map_err(|e| e.to_string())?;
        }
        files.push(json!({"kind":kind,"name":name,"path":path,"readOnly":true,"reference":{"bundle":bundle,"name":name,"sha256":sha(&content)}}));
    }
    Ok(json!({"runId":id,"files":files,"scope":"歷史實算唯讀副本；外部查看不改寫方案或驗收結果"}))
}
#[tauri::command]
pub fn open_external_run_file(
    app: tauri::AppHandle,
    reference: Value,
    application: String,
) -> Result<Value, String> {
    let bundle = identity(&reference, "bundle")?;
    let name = identity(&reference, "name")?;
    if bundle.len() != 64
        || !bundle.chars().all(|c| c.is_ascii_hexdigit())
        || ![
            "algorithm.py",
            "execution.log.json",
            "environment.json",
            "result.json",
        ]
        .contains(&name.as_str())
    {
        return Err("無效檔案引用".into());
    }
    let path = root(&app, "external-records")?.join(bundle).join(name);
    let b = fs::read(&path).map_err(|e| e.to_string())?;
    if reference.get("sha256").and_then(Value::as_str) != Some(sha(&b).as_str()) {
        return Err("歷史檔案已被修改，未當作原始證據開啟".into());
    }
    if !["system", "cursor", "vscode"].contains(&application.as_str()) {
        return Err("請選擇有效的開啟方式".into());
    }
    #[cfg(target_os = "macos")]
    {
        let mut c = Command::new("/usr/bin/open");
        if application != "system" {
            c.arg("-a").arg(if application == "cursor" {
                "Cursor"
            } else {
                "Visual Studio Code"
            });
        }
        let result = c.arg(&path).output().map_err(|e| e.to_string())?;
        if !result.status.success() {
            return Err("應用尚未安裝或無法開啟；請選擇其他開啟方式".into());
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let mut c = Command::new(if application == "cursor" {
            "cursor"
        } else if application == "vscode" {
            "code"
        } else if cfg!(target_os = "windows") {
            "explorer"
        } else {
            "xdg-open"
        });
        c.arg(&path)
            .spawn()
            .map_err(|e| format!("開啟應用失敗：{e}"))?;
    }
    Ok(json!({"opened":true,"path":path,"application":application,"readOnly":true}))
}

#[cfg(test)]
mod portability_tests {
    use super::*;
    #[test]
    fn transient_display_preview_is_not_a_durable_asset() {
        let value=json!({"runs":[{"artifacts":[{"id":"overlay","width":1280,"displayPreview":{"schema":"agentcv-display-preview-1","reference":{"token":"process-local"}}}]}]});
        let encoded=serde_json::to_vec(&DurableJson(&value)).unwrap();
        let saved:Value=serde_json::from_slice(&encoded).unwrap();
        assert!(saved["runs"][0]["artifacts"][0].get("displayPreview").is_none());
        assert_eq!(saved["runs"][0]["artifacts"][0]["width"],1280);
        let mut legacy=value.clone();strip_inline(&mut legacy);assert_eq!(legacy,saved);
        assert!(value["runs"][0]["artifacts"][0]["displayPreview"].is_object());
    }
    #[test]
    fn canonical_serialization_preserves_bytes_for_all_small_key_orders_and_large_maps() {
        fn permutations(keys:&mut [&str],start:usize,cases:&mut usize) {
            if start<keys.len() {
                for i in start..keys.len() { keys.swap(start,i);permutations(keys,start+1,cases);keys.swap(start,i); }
                return;
            }
            let mut object=serde_json::Map::new();
            for key in keys.iter() { object.insert((*key).into(),json!({"y":-0.0,"x":1.2345678901234567,"dataURL":"strip","nested":[null,true,u64::MAX]})); }
            let original=Value::Object(object);
            let mut expected=original.clone();strip_inline(&mut expected);
            assert_eq!(serde_json::to_vec(&DurableJson(&original)).unwrap(),serde_json::to_vec(&expected).unwrap());
            *cases+=1;
        }
        let mut cases=0;
        permutations(&mut ["z","a","dataUrl","base64","中文","__proto__"],0,&mut cases);
        assert_eq!(cases,720);
        for size in 0..=16 {
            let mut object=serde_json::Map::new();
            for n in (0..size).rev() {object.insert(format!("key{n:02}"),json!({"x":n,"y":n+1}));}
            let original=Value::Object(object);let mut expected=original.clone();strip_inline(&mut expected);
            assert_eq!(serde_json::to_vec(&DurableJson(&original)).unwrap(),serde_json::to_vec(&expected).unwrap());
        }
    }

    // Same-process diagnostic on a captured real desktop response. The old
    // serializer below is retained only as the benchmark control. Every sample
    // must produce exactly the existing canonical bytes; speed is reported,
    // never used to weaken a functional or complete-desktop acceptance gate.
    #[test]
    #[ignore="Explicit same-process canonical serializer A/B diagnostic"]
    fn canonical_serializer_captured_response_ab() {
        struct AllocatingJson<'a>(&'a Value);
        impl Serialize for AllocatingJson<'_> {
            fn serialize<S:Serializer>(&self,serializer:S)->Result<S::Ok,S::Error> {
                match self.0 {
                    Value::Object(object)=>{
                        let mut map=serializer.serialize_map(None)?;
                        let mut entries:Vec<_>=object.iter().collect();entries.sort_unstable_by(|a,b|a.0.cmp(b.0));
                        for (key,value) in entries {if !inline_key(key){map.serialize_entry(key,&AllocatingJson(value))?;}}
                        map.end()
                    },
                    Value::Array(values)=>{
                        let mut seq=serializer.serialize_seq(Some(values.len()))?;
                        for value in values {seq.serialize_element(&AllocatingJson(value))?;}
                        seq.end()
                    },
                    value=>value.serialize(serializer)
                }
            }
        }
        let input=std::env::var_os("AGENTCV_CANONICAL_BENCH_INPUT").expect("explicit captured response required");
        let root:Value=serde_json::from_slice(&fs::read(&input).unwrap()).unwrap();
        let mut expected=root.clone();strip_inline(&mut expected);let expected=serde_json::to_vec(&expected).unwrap();
        let mut samples=Vec::new();
        for index in 0..64 {
            let mut pair=json!({"index":index});
            for optimized in if index%2==0 {[false,true]} else {[true,false]} {
                let started=Instant::now();
                let bytes=if optimized {serde_json::to_vec(&DurableJson(&root)).unwrap()} else {serde_json::to_vec(&AllocatingJson(&root)).unwrap()};
                let ms=started.elapsed().as_secs_f64()*1000.;
                assert_eq!(bytes,expected);
                pair[if optimized {"optimizedMs"} else {"previousMs"}]=json!(ms);
            }
            samples.push(pair);
        }
        let mean=|field:&str|samples.iter().skip(1).map(|s|s[field].as_f64().unwrap()).sum::<f64>()/63.;
        let report=json!({"diagnosticOnly":true,"input":input,"canonicalBytes":expected.len(),"sha256":sha(&expected),"byteIdentical":true,"samples":samples,"previousMeanMs":mean("previousMs"),"optimizedMeanMs":mean("optimizedMs")});
        if let Some(path)=std::env::var_os("AGENTCV_CANONICAL_BENCH_OUTPUT") {fs::write(path,serde_json::to_vec_pretty(&report).unwrap()).unwrap();}
        eprintln!("{report}");
    }
    fn referenced_run(mut run: Value, scope: &str) -> Value {
        let mut fields=serde_json::Map::new();
        for key in ["result","procedureTrace","structuredLayers","nativeResult","code"] {
            if let Some(value)=run.as_object_mut().unwrap().remove(key) { fields.insert(key.into(),value); }
        }
        let names=json!(fields.keys().collect::<Vec<_>>());
        let bundle=json!({"runId":run["runId"],"workpieceUnit":run["workpieceUnit"],"fields":fields});
        run["nativeFactRef"]=crate::memory_resources::retain_json(scope,run["runId"].as_str().unwrap(),"__execution_facts",bundle).unwrap();
        run["nativeFactFields"]=names;
        run
    }
    #[test]
    fn borrowed_durable_json_matches_legacy_bytes_including_real_facts_and_nested_inline_fields() {
        let _exclusive=crate::memory_resources::TEST_LOCK.lock().unwrap();
        let unordered=json!({"z":3,"a":{"z":2,"a":1,"dataURL":"remove"}});
        assert_eq!(serde_json::to_vec(&DurableJson(&unordered)).unwrap(),br#"{"a":{"a":1,"z":2},"z":3}"#);
        assert_eq!(serde_json::to_vec(&CanonicalJson {value:&unordered,strip:false}).unwrap(),br#"{"a":{"a":1,"dataURL":"remove","z":2},"z":3}"#);
        let fixture:Value=serde_json::from_str(include_str!("../../qa/fixtures/execution-facts-record.json")).unwrap();
        for n in 0..129 {
            let mut run=if n==0 { fixture["run"].clone() } else {
                json!({"runId":format!("run-{n}"),"result":{"nested":[{"dataURL":"remove","dataUrl":null,"base64":[1,2],"data":{"keep":n}},null,-0.0,u64::MAX,i64::MIN,1.2345678901234567],"unicode":"中文😀\n\u{0}","dataUrl":"remove"},
                "procedureTrace":{"nodes":[{"id":"one","outputs":{"data":[n,n+1]}}]},"structuredLayers":[{"base64":"remove","points":[[0.1,2.3]]}],"nativeResult":false,"code":if n%3==0 {json!(null)} else if n%3==1 {json!({"base64":"remove","value":"code"})} else {json!("unaltered Python\nprint('中文')")}})
            };
            run["workpieceUnit"]=json!({"id":"unit","imageIds":["original"]});
            let run=referenced_run(run,&format!("serialization-{n}"));
            let mut request=json!({"executionId":"execution","unit":{"id":"unit"},"dataURL":"remove","nested":{"base64":"remove","value":[true,null]},"runs":[{"runId":"inline","code":null,"result":{"dataUrl":"remove","value":0.0}},run]});
            let leases=crate::inspection_service::lease_facts(&request).unwrap();
            let mut legacy=request.clone();
            crate::inspection_service::hydrate_facts(&mut legacy).unwrap();
            for (index,run) in legacy["runs"].as_array_mut().unwrap().iter_mut().enumerate() {
                if run["code"].is_string() {
                    run.as_object_mut().unwrap().remove("code");
                    run["codeRef"]=json!({"alreadyStored":true});
                    request["runs"][index]["codeRef"]=run["codeRef"].clone();
                }
            }
            strip_inline(&mut legacy);
            assert_eq!(serde_json::to_vec(&DurableUnit {request:&request,leases:&leases}).unwrap(),serde_json::to_vec(&legacy).unwrap(),"case {n}");
            assert_eq!(serde_json::to_vec(&DurableJson(&request)).unwrap(),{
                let mut filtered=request.clone();strip_inline(&mut filtered);serde_json::to_vec(&filtered).unwrap()
            });
        }
    }
    #[test]
    fn uncaptured_json_roundtrips_without_a_fabricated_asset() {
        let temp=scratch();let workspace=temp.join("workspace");fs::create_dir(&workspace).unwrap();
        crate::workspace::write_workspace(&workspace,&json!({"schema":"agentcv-workspace-0.9","images":[]}).to_string()).unwrap();
        let runtime=temp.join("runtime");fs::create_dir(&runtime).unwrap();
        let artifact=json!({"id":"optional","type":"json","storage":"not-captured","collection":crate::artifact_capture::marker(),"hostCollectionVerified":true,"hostBytesVerified":false});
        let request=json!({"executionId":"capture-execution","unit":{"id":"unit"},"runs":[{"runId":"capture-run","code":"unchanged code","artifacts":[artifact.clone()]}]});
        let saved=save_workspace_unit(&workspace,request.clone(),&runtime).unwrap();
        let read=read_workspace_unit(&saved["recordRef"]).unwrap();assert_eq!(read["runs"][0]["artifacts"][0],artifact);
        let mut forged=request;forged["runs"][0]["artifacts"][0]["data"]=json!({});assert!(save_workspace_unit(&workspace,forged,&runtime).is_err());
        fs::remove_dir_all(temp).unwrap();
    }
    #[test]
    fn leased_facts_and_artifact_bytes_survive_eviction_and_commit_without_private_handles() {
        let _exclusive=crate::memory_resources::TEST_LOCK.lock().unwrap();
        let temp=scratch();let workspace=temp.join("workspace");fs::create_dir(&workspace).unwrap();
        crate::workspace::write_workspace(&workspace,&json!({"schema":"agentcv-workspace-0.9","images":[]}).to_string()).unwrap();
        let runtime=temp.join("runtime");fs::create_dir(&runtime).unwrap();
        let original=b"{\n  \"value\": 42.00, \"exactBytes\": true\n}";
        let reference=crate::memory_resources::retain("borrowed-save","actual-run","measurement","application/json",original.to_vec()).unwrap();
        let artifact=json!({"id":"measurement","type":"json","mime":"application/json","sha256":reference["sha256"],"bytes":reference["bytes"],"memoryRef":reference});
        let leased_bytes=inline_artifact_bytes(&artifact).unwrap().unwrap();
        match &leased_bytes {
            ArtifactBytes::Shared(bytes)=>assert!(Arc::ptr_eq(bytes,&crate::memory_resources::read(&reference).unwrap())),
            _=>panic!("memory bytes must be leased"),
        }
        let run=referenced_run(json!({"runId":"actual-run","workpieceUnit":{"id":"unit"},"result":{"value":42.0,"dataURL":"strip"},"procedureTrace":{"data":[1,2]},"code":"print('unchanged')\n","artifacts":[artifact]}),"borrowed-save");
        let request=json!({"executionId":"execution","unit":{"id":"unit"},"runs":[run]});
        let prepared=PreparedUnit::prepare(request.clone()).unwrap();
        let leases=crate::inspection_service::lease_facts(&request).unwrap();
        let mut legacy=request.clone();crate::inspection_service::hydrate_facts(&mut legacy).unwrap();
        let expected=save_workspace_unit(&workspace,legacy,&runtime).unwrap();
        let actual=save_workspace_unit(&workspace,request.clone(),&runtime).unwrap();
        assert_eq!(expected["recordRef"],actual["recordRef"]);
        let before_eviction=serde_json::to_vec(&DurableUnit { request:&request,leases:&leases }).unwrap();
        for n in 0..4 {crate::memory_resources::retain(&format!("borrowed-later-{n}"),"later","pixel","image/bmp",vec![1]).unwrap();}
        assert!(crate::inspection_service::lease_facts(&request).is_err());
        assert!(inline_artifact_bytes(&request["runs"][0]["artifacts"][0]).is_err());
        // Background archival consumes the prepared ownership after all four
        // runtime groups have been evicted, through the actual durable writer.
        let delayed=save_prepared_workspace_unit(&workspace,&prepared,&runtime).unwrap();
        assert_eq!(delayed["recordRef"],actual["recordRef"]);
        assert_eq!(prepared.snapshot().unwrap()["runs"][0]["result"],json!({"value":42.0,"dataURL":"strip"}));
        assert_eq!(&*leased_bytes,original);
        assert_eq!(before_eviction,serde_json::to_vec(&DurableUnit { request:&request,leases:&leases }).unwrap());
        let saved=read_workspace_unit(&actual["recordRef"]).unwrap();
        assert_eq!(saved["runs"][0]["result"],json!({"value":42.0}));
        assert_eq!(saved["runs"][0]["code"],"print('unchanged')\n");
        assert!(saved["runs"][0].get("nativeFactRef").is_none());
        assert!(saved["runs"][0].get("nativeFactFields").is_none());
        assert_eq!(crate::workspace::read_workspace_asset_bytes(&workspace,&saved["runs"][0]["artifacts"][0]["assetRef"]).unwrap(),original);
        fs::remove_dir_all(temp).unwrap();
    }
    #[test]
    fn archive_workspace_batch_commits_one_journal_and_retains_runtime_on_journal_failure(){
        let temp=scratch();let workspace=temp.join("workspace");fs::create_dir(&workspace).unwrap();
        crate::workspace::write_workspace(&workspace,&json!({"schema":"agentcv-workspace-0.9","images":[]}).to_string()).unwrap();
        let runtime=temp.join("runtime");fs::create_dir_all(runtime.join("cv-runs")).unwrap();
        let units:Vec<_>=["first","second"].iter().map(|id|{
            let run=runtime.join("cv-runs").join(id);fs::create_dir(&run).unwrap();
            fs::write(run.join("retained.txt"),b"must survive failed journal").unwrap();
            Arc::new(PreparedUnit::prepare(json!({"executionId":"batch","unit":{"id":id},"cleanupRuntime":true,"runs":[{"runId":id,"runDirectory":run,"artifacts":[]}]})).unwrap())
        }).collect();
        // A real filesystem failure occurs after staging, before durable commit.
        fs::create_dir(workspace.join(JOURNAL)).unwrap();
        let failed=save_prepared_workspace_batch(&workspace,&units,&runtime);
        assert!(failed.iter().all(Result::is_err));
        for id in ["first","second"]{assert!(runtime.join("cv-runs").join(id).join("retained.txt").is_file());}
        fs::remove_dir(workspace.join(JOURNAL)).unwrap();
        let receipts=save_prepared_workspace_batch(&workspace,&units,&runtime);
        let journal=fs::read_to_string(workspace.join(JOURNAL)).unwrap();assert_eq!(journal.lines().count(),1);
        for (unit,receipt) in units.iter().zip(receipts){
            let receipt=receipt.unwrap();assert_eq!(receipt["status"],"SAVED");assert_eq!(receipt["timing"]["native"]["journalBatchSize"],2);
            let disk=read_workspace_unit(&receipt["recordRef"]).unwrap();assert_eq!(disk["unit"]["id"],unit.identity()["unitId"]);
            assert!(!runtime.join("cv-runs").join(unit.identity()["unitId"].as_str().unwrap()).exists());
        }
        fs::remove_dir_all(temp).unwrap();
    }
    fn scratch() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "agentcv-inspection-cas-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&path).unwrap();
        path.canonicalize().unwrap()
    }
    fn record_from(project: &Value) -> Value {
        project["datasetExecutions"][0]["items"][0]["recordRef"].clone()
    }
    fn artifact_bytes(reference: &Value) -> Vec<u8> {
        let unit = read_workspace_unit(reference).unwrap();
        let asset = &unit["runs"][0]["artifacts"][0]["assetRef"];
        crate::workspace::read_workspace_asset_bytes(
            Path::new(reference["root"].as_str().unwrap()),
            asset,
        )
        .unwrap()
    }
    #[test]
    fn actual_cv2_results_survive_save_as_source_removal_transfer_and_git_rollback() {
        let temp = scratch();
        let source = temp.join("source-workspace");
        let copied = temp.join("saved-copy");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&copied).unwrap();
        let runtime = temp.join("runtime");
        let outputs = runtime.join("real-cv2-run/outputs");
        fs::create_dir_all(&outputs).unwrap();
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../research/opencv-traditional-10-2026-10-25/assets/box.png");
        let source_bytes = fs::read(fixture).unwrap();
        let capture = temp.join("camera-original.png");
        fs::write(&capture, &source_bytes).unwrap();
        let code="import cv2,json,sys\nim=cv2.imread(sys.argv[1],cv2.IMREAD_GRAYSCALE)\nassert im is not None\nblur=cv2.GaussianBlur(im,(3,3),0)\nedges=cv2.Canny(blur,40,100)\nassert cv2.imwrite(sys.argv[2],edges)\nprint(json.dumps({'edgePixels':int(cv2.countNonZero(edges)),'width':int(edges.shape[1]),'height':int(edges.shape[0])}))\n";
        let output = outputs.join("actual-edges.png");
        let python = std::env::var_os("AGENTCV_PYTHON").map(PathBuf::from).unwrap_or_else(||
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../runtime/python/bin/python3"));
        let result = Command::new(python)
            .arg("-c")
            .arg(code)
            .arg(&capture)
            .arg(&output)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let metrics: Value = serde_json::from_slice(&result.stdout).unwrap();
        assert!(metrics["edgePixels"].as_u64().unwrap() > 0);
        let actual = fs::read(&output).unwrap();
        let mut project = json!({"schema":"agentcv-workspace-0.9","images":[{"id":"capture","name":"actual camera capture","width":metrics["width"],"height":metrics["height"],"dataURL":format!("data:image/png;base64,{}",STANDARD.encode(&source_bytes))}],"datasetExecutions":[]});
        crate::workspace::write_workspace(&source, &project.to_string()).unwrap();
        let request = json!({"executionId":"actual-cv2-regression","unit":{"id":"one-workpiece","imageIds":["capture"]},"record":{"metrics":metrics},"runs":[{"runId":"real-run","runDirectory":outputs.parent().unwrap(),"code":code,"artifacts":[{"id":"edges","type":"image","mime":"image/png","path":output,"assetRef":{"kind":"algorithm-artifact","path":output,"runId":"real-run","artifactId":"edges","sha256":sha(&actual),"mime":"image/png"},"sha256":sha(&actual),"width":metrics["width"],"height":metrics["height"]}]}]});
        let mut corrupt = request.clone();
        corrupt["runs"][0]["artifacts"][0]["sha256"] = json!("0".repeat(64));
        assert!(save_workspace_unit(&source, corrupt, &runtime)
            .unwrap_err()
            .contains("雜湊"));
        let receipt = save_workspace_unit(&source, request, &runtime).unwrap();
        let reference = receipt["recordRef"].clone();
        let raw = read_workspace_unit(&reference).unwrap();
        assert_eq!(raw["runs"][0]["code"], code);
        assert_eq!(raw["runs"][0]["codeRef"]["sha256"], sha(code.as_bytes()));
        assert!(raw["runs"][0]["artifacts"][0].get("path").is_none());
        assert_eq!(artifact_bytes(&reference), actual);
        project["datasetExecutions"] = json!([{"id":"actual-cv2-regression","items":[{"unitId":"one-workpiece","recordRef":reference}]}]);
        crate::workspace::write_workspace(&copied, &project.to_string()).unwrap();
        let manifest: Value =
            serde_json::from_slice(&fs::read(copied.join("manifest.agentcv.json")).unwrap())
                .unwrap();
        assert_eq!(manifest["inspectionAssets"].as_array().unwrap().len(), 3);
        assert!(
            manifest["project"]["datasetExecutions"][0]["items"][0]["recordRef"]
                .get("root")
                .is_none()
        );
        fs::remove_dir_all(&source).unwrap();
        fs::remove_dir_all(&runtime).unwrap();
        fs::remove_file(capture).unwrap();
        let loaded = crate::workspace::read_workspace_lazy(&copied).unwrap();
        let copied_project: Value = serde_json::from_str(&loaded).unwrap();
        let copied_ref = record_from(&copied_project);
        assert_eq!(copied_ref["root"], copied.to_string_lossy().as_ref());
        assert_eq!(artifact_bytes(&copied_ref), actual);
        // Repeated references exercise metadata scale only, not independent workpieces.
        let large = temp.join("large-reference-view");
        fs::create_dir(&large).unwrap();
        let mut many = copied_project.clone();
        many["capacityReferences"] = json!(vec![copied_ref.clone(); 10001]);
        crate::workspace::write_workspace(&large, &many.to_string()).unwrap();
        let large_text = crate::workspace::read_workspace_lazy(&large).unwrap();
        let large_project: Value = serde_json::from_str(&large_text).unwrap();
        assert_eq!(
            large_project["capacityReferences"]
                .as_array()
                .unwrap()
                .len(),
            10001
        );
        assert!(!large_text.contains("data:image/"));
        assert!(large_project["capacityReferences"][9999]
            .get("runs")
            .is_none());
        assert_eq!(
            artifact_bytes(&large_project["capacityReferences"][9999]),
            actual
        );
        fs::remove_dir_all(large).unwrap();
        let selected = temp.join("selected-unit-view");
        fs::create_dir(&selected).unwrap();
        let mut selected_project = copied_project.clone();
        selected_project["algorithmRuns"] =
            read_workspace_unit(&copied_ref).unwrap()["runs"].clone();
        crate::workspace::write_workspace(&selected, &selected_project.to_string()).unwrap();
        let selected_loaded: Value =
            serde_json::from_str(&crate::workspace::read_workspace_lazy(&selected).unwrap())
                .unwrap();
        assert!(
            selected_loaded["algorithmRuns"][0]["artifacts"][0]["dataURL"]
                .as_str()
                .unwrap()
                .starts_with("data:image/png;base64,")
        );
        fs::remove_dir_all(selected).unwrap();
        let unit = read_workspace_unit(&copied_ref).unwrap();
        let image_asset = &unit["runs"][0]["artifacts"][0]["assetRef"];
        let image_path = copied.join(image_asset["$asset"].as_str().unwrap());
        fs::write(&image_path, b"tampered").unwrap();
        assert!(crate::workspace::read_workspace_asset_bytes(&copied, image_asset).is_err());
        fs::write(&image_path, &actual).unwrap();
        let mut forged = copied_ref.clone();
        forged["$asset"] = json!("assets/../../camera-original.png");
        assert!(read_workspace_unit(&forged).is_err());
        let first = tauri::async_runtime::block_on(crate::git_workspace::create_solution_version(
            copied.to_string_lossy().into(),
            loaded,
            "Real CV output and classified-unit record".into(),
            None,
            None,
        ))
        .unwrap();
        let first_commit = serde_json::to_value(first).unwrap()["commit"]
            .as_str()
            .unwrap()
            .to_owned();
        let mut next = copied_project.clone();
        next["datasetExecutions"] = json!([]);
        next["name"] = json!("Later scheme without that execution");
        crate::workspace::write_workspace(&copied, &next.to_string()).unwrap();
        tauri::async_runtime::block_on(crate::git_workspace::create_solution_version(
            copied.to_string_lossy().into(),
            next.to_string(),
            "Later clean execution set".into(),
            None,
            None,
        ))
        .unwrap();
        let exported = temp.join("complete-export");
        crate::history_transfer::export_project(&copied, &exported).unwrap();
        fs::remove_dir_all(&copied).unwrap();
        let historic = tauri::async_runtime::block_on(crate::git_workspace::read_solution_version(
            exported.to_string_lossy().into(),
            first_commit,
        ))
        .unwrap();
        let historic: Value = serde_json::from_str(&historic).unwrap();
        let historic_ref = record_from(&historic);
        assert!(historic_ref["root"]
            .as_str()
            .unwrap()
            .starts_with(exported.to_str().unwrap()));
        assert_eq!(artifact_bytes(&historic_ref), actual);
        assert_eq!(sha(&artifact_bytes(&historic_ref)), sha(&actual));
        assert!(read_workspace_unit(&historic_ref).unwrap()["runs"][0]["codeRef"].is_object());
        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn memory_artifacts_commit_exact_bytes_and_survive_resource_expiry() {
        let temp=scratch();let workspace=temp.join("workspace");let runtime=temp.join("runtime");
        fs::create_dir_all(&workspace).unwrap();fs::create_dir_all(&runtime).unwrap();
        crate::workspace::write_workspace(&workspace,&json!({"schema":"agentcv-workspace-0.9","images":[],"datasetExecutions":[]}).to_string()).unwrap();
        let bytes=b"{ \"answer\": 42.00 }\n";
        let reference=crate::memory_resources::retain("save-memory","run","facts","application/json",bytes.to_vec()).unwrap();
        let artifact=json!({"id":"facts","type":"json","mime":"application/json","sha256":sha(bytes),"bytes":bytes.len(),"dataStorage":"artifact-bytes","memoryRef":reference});
        let request=json!({"executionId":"memory-save","unit":{"id":"one","imageIds":["camera"]},"record":{"unitId":"one"},"runs":[{"runId":"run","code":"result={}","artifacts":[artifact]}]});
        let mut wrong=request.clone();wrong["runs"][0]["runId"]=json!("wrong-run");
        assert!(save_workspace_unit(&workspace,wrong,&runtime).unwrap_err().contains("不屬於"));
        let receipt=save_workspace_unit(&workspace,request.clone(),&runtime).unwrap();
        let saved=read_workspace_unit(&receipt["recordRef"]).unwrap();
        assert!(saved["runs"][0]["artifacts"][0].get("memoryRef").is_none());
        assert_eq!(saved["runs"][0]["artifacts"][0]["data"]["answer"].as_f64(),Some(42.));
        assert!(saved["runs"][0]["artifacts"][0].get("dataStorage").is_none());
        assert_eq!(artifact_bytes(&receipt["recordRef"]),bytes);
        let directory=runtime.join("fallback-run");fs::create_dir_all(directory.join("outputs")).unwrap();
        let mut fallback=request;fallback["runs"][0]["runDirectory"]=json!(directory);
        persist_runtime_memory_artifacts(&mut fallback,&runtime).unwrap();
        let run=&fallback["runs"][0];assert_eq!(runtime_artifact_bytes(run,&run["artifacts"][0],&runtime).unwrap(),bytes);
        let mut fallback_artifact=run["artifacts"][0].clone();hydrate_json_artifact(&mut fallback_artifact,bytes).unwrap();
        assert_eq!(fallback_artifact["data"]["answer"].as_f64(),Some(42.));
        let mut forged=run["artifacts"][0].clone();forged["bytes"]=json!(1);assert!(hydrate_json_artifact(&mut forged,bytes).is_err());
        for index in 0..4 {crate::memory_resources::retain(&format!("expire-{index}"),"run","preview","image/bmp",vec![1]).unwrap();}
        assert!(crate::memory_resources::read(&reference).is_err());
        assert_eq!(artifact_bytes(&receipt["recordRef"]),bytes);
        assert_eq!(read_workspace_unit(&receipt["recordRef"]).unwrap()["runs"][0]["artifacts"][0]["data"]["answer"].as_f64(),Some(42.));
        fs::remove_dir_all(temp).unwrap();
    }
    #[test]
    fn parallel_assets_deduplicate_exact_bytes_and_join_before_record_commit(){
        let temp=scratch();let workspace=temp.join("parallel-workspace");let runtime=temp.join("runtime");
        fs::create_dir_all(&workspace).unwrap();fs::create_dir_all(&runtime).unwrap();
        crate::workspace::write_workspace(&workspace,&json!({"schema":"agentcv-workspace-0.9","images":[],"datasetExecutions":[]}).to_string()).unwrap();
        let raw=b"independent immutable artifact bytes\n";
        let artifact=json!({"id":"actual","type":"file","mime":"application/octet-stream","sha256":sha(raw),"bytes":raw.len(),
            "dataUrl":format!("data:application/octet-stream;base64,{}",STANDARD.encode(raw))});
        let request=json!({"executionId":"parallel-save","unit":{"id":"one","imageIds":["camera"]},"record":{"unitId":"one"},
            "runs":[{"runId":"first","code":"result={}\n","artifacts":[artifact]},
                    {"runId":"second","code":"result={}\n","artifacts":[artifact]}]});
        let receipt=save_workspace_unit(&workspace,request.clone(),&runtime).unwrap();
        assert_eq!(receipt["timing"]["native"]["assetWrites"]["references"],4);
        assert_eq!(receipt["timing"]["native"]["assetWrites"]["uniqueAssets"],2);
        assert!((1..=4).contains(&receipt["timing"]["native"]["assetWrites"]["workers"].as_u64().unwrap()));
        let saved=read_workspace_unit(&receipt["recordRef"]).unwrap();
        for run in saved["runs"].as_array().unwrap(){
            assert_eq!(run["code"],"result={}\n");
            assert_eq!(crate::workspace::read_workspace_asset_bytes(&workspace,&run["artifacts"][0]["assetRef"]).unwrap(),raw);
        }
        // Corrupt one pre-existing CAS file. Other workers must be joined and
        // the journal must remain unchanged; a later repair may then succeed.
        let path=workspace.join(descriptor(raw,"application/octet-stream")["$asset"].as_str().unwrap());
        fs::write(&path,b"corrupted").unwrap();let journal=fs::read(workspace.join(JOURNAL)).unwrap();
        let mut next=request;next["executionId"]=json!("must-not-commit");
        assert!(save_workspace_unit(&workspace,next.clone(),&runtime).unwrap_err().contains("不可覆寫"));
        assert_eq!(fs::read(workspace.join(JOURNAL)).unwrap(),journal);
        assert!(fs::read_dir(workspace.join("assets")).unwrap().all(|entry|!entry.unwrap().path().to_string_lossy().ends_with(".tmp")));
        fs::write(path,raw).unwrap();
        assert_eq!(save_workspace_unit(&workspace,next,&runtime).unwrap()["status"],"SAVED");
        fs::remove_dir_all(temp).unwrap();
    }
    fn packed_request()->(Value,Vec<Vec<u8>>){
        let bytes:Vec<_>=(0..3).map(|index|format!("{{\"index\":{index}, \"value\":42.00,\"padding\":\"{}\"}}\n","x".repeat(32768)).into_bytes()).collect();
        let artifacts:Vec<_>=bytes.iter().enumerate().map(|(index,raw)|json!({"id":format!("facts-{index}"),"type":"json","mime":"application/json",
            "sha256":sha(raw),"bytes":raw.len(),"dataStorage":"artifact-bytes","dataUrl":format!("data:application/json;base64,{}",STANDARD.encode(raw))})).collect();
        (json!({"executionId":"packed-execution","unit":{"id":"one","imageIds":[]},"record":{"unitId":"one"},
            "runs":[{"runId":"packed-run","code":"result={}\n","artifacts":artifacts}]}),bytes)
    }
    fn verify_packed_record(reference:&Value,expected:&[Vec<u8>]){
        let root=Path::new(reference["root"].as_str().unwrap());let record=read_workspace_unit(reference).unwrap();
        assert_eq!(record["runs"][0]["code"],"result={}\n");
        for (index,artifact) in record["runs"][0]["artifacts"].as_array().unwrap().iter().enumerate(){
            assert!(artifact["assetRef"].get("packedIn").is_some());
            assert_eq!(crate::workspace::read_workspace_asset_bytes(root,&artifact["assetRef"]).unwrap(),expected[index]);
            assert_eq!(artifact["data"]["value"],42.0);
        }
    }
    #[test]
    fn packed_assets_deduplicate_bind_location_and_reject_corruption_without_commit(){
        let temp=scratch();let workspace=temp.join("workspace");let runtime=temp.join("runtime");fs::create_dir(&workspace).unwrap();fs::create_dir(&runtime).unwrap();
        crate::workspace::write_workspace(&workspace,&json!({"schema":"agentcv-workspace-0.9","images":[]}).to_string()).unwrap();
        let (mut request,expected)=packed_request();let first=save_workspace_unit(&workspace,request.clone(),&runtime).unwrap();
        assert_eq!(first["timing"]["native"]["assetWrites"]["newContainers"],1);
        assert_eq!(fs::read_dir(workspace.join("assets")).unwrap().count(),2);verify_packed_record(&first["recordRef"],&expected);
        let record=read_workspace_unit(&first["recordRef"]).unwrap();let asset=&record["runs"][0]["artifacts"][0]["assetRef"];
        let mut forged=asset.clone();forged["packedIn"]["offset"]=json!(asset["packedIn"]["offset"].as_u64().unwrap()+1);
        assert!(!owns_staged_asset(&workspace,&forged).unwrap());assert!(crate::workspace::read_workspace_asset_bytes(&workspace,&forged).is_err());
        request["executionId"]=json!("repeated-execution");let second=save_workspace_unit(&workspace,request.clone(),&runtime).unwrap();
        assert_eq!(second["timing"]["native"]["assetWrites"]["newAssets"],0);assert_eq!(second["timing"]["native"]["assetWrites"]["newContainers"],0);
        assert_eq!(fs::read_dir(workspace.join("assets")).unwrap().count(),3);verify_packed_record(&second["recordRef"],&expected);
        let physical=asset_pack::container(asset).unwrap().unwrap();let path=workspace.join(physical["$asset"].as_str().unwrap());let original=fs::read(&path).unwrap();
        let journal=fs::read(workspace.join(JOURNAL)).unwrap();fs::write(&path,b"partial corrupt pack").unwrap();request["executionId"]=json!("must-not-commit");
        assert!(save_workspace_unit(&workspace,request.clone(),&runtime).is_err());assert_eq!(fs::read(workspace.join(JOURNAL)).unwrap(),journal);
        assert_eq!(fs::read_dir(workspace.join("assets")).unwrap().count(),3);fs::write(&path,&original).unwrap();
        let repaired=save_workspace_unit(&workspace,request,&runtime).unwrap();verify_packed_record(&repaired["recordRef"],&expected);
        // An incomplete ordinary record file cannot become an acknowledgement,
        // even after its packed asset group has already been verified.
        let record_path=workspace.join(repaired["recordRef"]["$asset"].as_str().unwrap());let raw_record=fs::read(&record_path).unwrap();fs::remove_file(&record_path).unwrap();
        let temporary=record_path.with_extension(format!("{}.tmp",std::process::id()));fs::write(&temporary,b"partial").unwrap();
        let before=fs::read(workspace.join(JOURNAL)).unwrap();let mut retry=packed_request().0;retry["executionId"]=json!("must-not-commit");
        assert!(save_workspace_unit(&workspace,retry.clone(),&runtime).is_err());assert_eq!(fs::read(workspace.join(JOURNAL)).unwrap(),before);assert!(!record_path.exists());
        fs::remove_file(temporary).unwrap();assert_eq!(save_workspace_unit(&workspace,retry,&runtime).unwrap()["status"],"SAVED");assert_eq!(fs::read(record_path).unwrap(),raw_record);
        fs::remove_dir_all(temp).unwrap();
    }
    #[test]
    fn packed_assets_survive_save_as_source_deletion_transfer_and_git_rollback(){
        let temp=scratch();let source=temp.join("source");let copied=temp.join("copied");let runtime=temp.join("runtime");
        for directory in [&source,&copied,&runtime]{fs::create_dir(directory).unwrap();}
        let mut project=json!({"schema":"agentcv-workspace-0.9","images":[],"datasetExecutions":[]});crate::workspace::write_workspace(&source,&project.to_string()).unwrap();
        let (request,expected)=packed_request();let saved=save_workspace_unit(&source,request.clone(),&runtime).unwrap();
        let original_record=fs::read(source.join(saved["recordRef"]["$asset"].as_str().unwrap())).unwrap();
        project["datasetExecutions"]=json!([{"id":"packed-execution","items":[{"recordRef":saved["recordRef"]}]}]);
        crate::workspace::write_workspace(&copied,&project.to_string()).unwrap();fs::remove_dir_all(&source).unwrap();fs::remove_dir_all(&runtime).unwrap();
        let loaded=crate::workspace::read_workspace_lazy(&copied).unwrap();let current:Value=serde_json::from_str(&loaded).unwrap();let reference=record_from(&current);
        verify_packed_record(&reference,&expected);assert_eq!(fs::read(copied.join(reference["$asset"].as_str().unwrap())).unwrap(),original_record);
        assert_eq!(fs::read_dir(copied.join("assets")).unwrap().count(),2);
        // A manifest can authorize a locator only for its own valid entry.
        // Changing just that offset cannot make export/Git accept bad evidence.
        let manifest_path=copied.join("manifest.agentcv.json");let original_manifest=fs::read(&manifest_path).unwrap();let mut manifest:Value=serde_json::from_slice(&original_manifest).unwrap();
        let logical=manifest["inspectionAssets"].as_array_mut().unwrap().iter_mut().find(|a|a.get("packedIn").is_some()).unwrap();
        logical["packedIn"]["offset"]=json!(logical["packedIn"]["offset"].as_u64().unwrap()+1);fs::write(&manifest_path,serde_json::to_vec(&manifest).unwrap()).unwrap();
        assert!(crate::git_workspace::validate_snapshot_files(&copied).is_err());assert!(crate::history_transfer::export_project(&copied,&temp.join("must-not-export")).is_err());
        fs::write(&manifest_path,&original_manifest).unwrap();
        // Imported/manifests-only ownership must also preserve cross-unit reuse.
        let reuse=save_workspace_unit(&copied,request,&temp).unwrap();assert_eq!(reuse["timing"]["native"]["assetWrites"]["newAssets"],0);
        crate::git_workspace::validate_snapshot_files(&copied).unwrap();
        let first=tauri::async_runtime::block_on(crate::git_workspace::create_solution_version(copied.to_string_lossy().into(),loaded,"Packed asset history".into(),None,None)).unwrap();
        let commit=serde_json::to_value(first).unwrap()["commit"].as_str().unwrap().to_owned();
        let mut next=current;next["datasetExecutions"]=json!([]);next["name"]=json!("later version");
        crate::workspace::write_workspace(&copied,&next.to_string()).unwrap();
        tauri::async_runtime::block_on(crate::git_workspace::create_solution_version(copied.to_string_lossy().into(),next.to_string(),"Later version".into(),None,None)).unwrap();
        let exported=temp.join("exported");crate::history_transfer::export_project(&copied,&exported).unwrap();fs::remove_dir_all(&copied).unwrap();
        let imported=temp.join("imported");crate::history_transfer::import_project(&exported,&imported).unwrap();fs::remove_dir_all(&exported).unwrap();
        let historic=tauri::async_runtime::block_on(crate::git_workspace::read_solution_version(imported.to_string_lossy().into(),commit)).unwrap();
        let historic:Value=serde_json::from_str(&historic).unwrap();let reference=record_from(&historic);verify_packed_record(&reference,&expected);
        assert_eq!(fs::read(Path::new(reference["root"].as_str().unwrap()).join(reference["$asset"].as_str().unwrap())).unwrap(),original_record);
        fs::remove_dir_all(temp).unwrap();
    }
    #[test]
    fn run_cleanup_rejects_root_nested_and_unowned_directories() {
        let temp = scratch();
        let root = temp.join("runtime/cv-runs");
        let owned = root.join("py-completed");
        let nested = owned.join("inputs");
        let unrelated = temp.join("unrelated");
        fs::create_dir_all(&nested).unwrap();
        fs::create_dir_all(&unrelated).unwrap();
        fs::write(unrelated.join("keep"), b"user data").unwrap();
        assert!(!remove_owned_run_directory(&root, &root).unwrap());
        assert!(!remove_owned_run_directory(&nested, &root).unwrap());
        assert!(!remove_owned_run_directory(&unrelated, &root).unwrap());
        assert!(nested.is_dir());
        assert_eq!(fs::read(unrelated.join("keep")).unwrap(), b"user data");
        assert!(remove_owned_run_directory(&owned, &root).unwrap());
        assert!(root.is_dir());
        assert!(!remove_owned_run_directory(&owned, &root).unwrap());
        fs::remove_dir_all(temp).unwrap();
    }
    #[test]
    fn batch_save_cleans_actual_cv_runs_only_after_verified_commit() {
        let temp = scratch();
        let workspace = temp.join("workspace");
        let runtime = temp.join("runtime");
        let run = runtime.join("cv-runs/py-completed");
        let outputs = run.join("outputs");
        let sibling = runtime.join("cv-runs/py-still-needed");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&outputs).unwrap();
        fs::create_dir_all(&sibling).unwrap();
        fs::write(sibling.join("keep"), b"uncommitted evidence").unwrap();
        crate::workspace::write_workspace(&workspace,
            &json!({"schema":"agentcv-workspace-0.9","images":[],"datasetExecutions":[]}).to_string()).unwrap();
        let bytes = b"verified exact artifact bytes";
        let output = outputs.join("preview.png");
        fs::write(&output, bytes).unwrap();
        let request = json!({"executionId":"actual-root-cleanup","unit":{"id":"unit","imageIds":["camera"]},
            "record":{},"cleanupRuntime":true,
            "runs":[{"runId":"py-completed","runDirectory":run,"code":"result={}","artifacts":[{
                "id":"preview","type":"image","mime":"image/png","path":output,"sha256":sha(bytes),"width":1,"height":1}]}]});
        let mut corrupt = request.clone();
        corrupt["runs"][0]["artifacts"][0]["sha256"] = json!("invalid");
        assert!(save_workspace_unit(&workspace, corrupt, &runtime).is_err());
        assert_eq!(fs::read(&output).unwrap(), bytes);
        let receipt = save_workspace_unit(&workspace, request, &runtime).unwrap();
        assert_eq!(receipt["runtimeCleanup"]["removedDirectories"], 1);
        assert!(!run.exists());
        assert!(runtime.join("cv-runs").is_dir());
        assert_eq!(fs::read(sibling.join("keep")).unwrap(), b"uncommitted evidence");
        let saved = read_workspace_unit(&receipt["recordRef"]).unwrap();
        let artifact = &saved["runs"][0]["artifacts"][0];
        assert_eq!(artifact["sha256"], sha(bytes));
        assert_eq!(crate::workspace::read_workspace_asset_bytes(&workspace, &artifact["assetRef"]).unwrap(), bytes);
        fs::remove_dir_all(temp).unwrap();
    }
    #[test]
    fn batch_save_cleans_only_completed_run_directories_after_cas_commit() {
        let temp = scratch();
        let workspace = temp.join("workspace");
        let runtime = temp.join("runtime");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&runtime).unwrap();
        crate::workspace::write_workspace(
            &workspace,
            &json!({"schema":"agentcv-workspace-0.9","images":[],"datasetExecutions":[]}).to_string(),
        )
        .unwrap();
        let run = runtime.join("one-run");
        let outputs = run.join("outputs");
        fs::create_dir_all(&outputs).unwrap();
        let bytes = b"real-output-bytes";
        let output = outputs.join("preview.png");
        fs::write(&output, bytes).unwrap();
        let request = json!({
            "executionId":"cleanup-execution",
            "unit":{"id":"cleanup-unit","imageIds":["camera"]},
            "record":{"unitId":"cleanup-unit"},
            "cleanupRuntime":true,
            "runs":[{"runId":"cleanup-run","runDirectory":run,"code":"result={}","artifacts":[{
                "id":"preview","type":"image","mime":"image/png","path":output,
                "sha256":sha(bytes),"width":1,"height":1
            }]}]
        });
        let receipt = save_workspace_unit(&workspace, request, &runtime).unwrap();
        assert_eq!(receipt["runtimeCleanup"]["removedDirectories"], 1);
        assert!(!run.exists());
        let saved = read_workspace_unit(&receipt["recordRef"]).unwrap();
        assert!(saved["runs"][0]["artifacts"][0]["assetRef"].is_object());
        fs::remove_dir_all(temp).unwrap();
    }
}

// Same durable writer as desktop IPC, with an explicit workspace for local
// automation/acceptance. No alternate storage implementation or fake receipts.
pub(crate) fn save_headless_unit(request: Value) -> Result<Value,String> {
    let _lock=RECORD_LOCK.lock().map_err(|_|"執行紀錄寫入器不可用")?;
    let directory=owned_workspace(request["workspaceRoot"].as_str().ok_or("無視窗執行需要工程路徑")?)?;
    save_workspace_unit(&directory,request,&runtime_root()?)
}

pub(crate) fn read_headless_unit(reference: &Value)->Result<Value,String>{read_workspace_unit(reference)}
pub(crate) fn read_headless_artifact(reference: &Value)->Result<Value,String>{
 let unit=read_workspace_unit(reference)?;let (_,artifact)=artifact_of(&unit,reference)?;
 if artifact.get("pixelRetention").and_then(Value::as_str)==Some("metadata-only"){return Err("此批次只保留產物摘要；若要查看像素，請重跑此工件或選擇保留全部圖像".into());}
 let directory=owned_workspace(reference["root"].as_str().ok_or("缺少工程路徑")?)?;
 let bytes=crate::workspace::read_workspace_asset_bytes(&directory,artifact.get("assetRef").ok_or("缺少產物引用")?)?;
 if bytes.len()>32*1024*1024{return Err("產物超過單次預覽預算".into());}
 let mime=artifact["mime"].as_str().unwrap_or("image/png");
 Ok(json!({"artifact":artifact,"dataURL":format!("data:{mime};base64,{}",STANDARD.encode(&bytes)),"verified":true}))
}
