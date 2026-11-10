//! Immutable per-unit records and external diagnostic files. File names and
//! application names are selected by the host, never interpolated into a shell.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
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

fn inline_artifact_bytes(value: &Value) -> Result<Option<Vec<u8>>, String> {
    if let Some(bytes) = inline_data_bytes(value)? { return Ok(Some(bytes)); }
    if let Some(data) = value.get("data") {
        return serde_json::to_vec(data).map(Some).map_err(|e| format!("產物 JSON 序列化失敗：{e}"));
    }
    Ok(None)
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
            o.remove("base64");
            for item in o.values_mut() {
                strip_inline(item)
            }
        }
        Value::Array(a) => {
            for item in a {
                strip_inline(item)
            }
        }
        _ => {}
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
}
static JOURNAL_INDEXES: std::sync::OnceLock<
    Mutex<std::collections::HashMap<PathBuf, JournalIndex>>,
> = std::sync::OnceLock::new();
fn journal_key(asset: &Value) -> String {
    json!([
        asset["$asset"],
        asset["mime"],
        asset["sha256"],
        asset["size"]
    ])
    .to_string()
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
    let execution_id = identity(&request, "executionId")?;
    let unit_id = identity(request.get("unit").ok_or("缺少工件資料")?, "id")?;
    let cleanup_runtime = request
        .get("cleanupRuntime")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let mut run_directories = Vec::new();
    let mut assets = Vec::new();
    if let Some(runs) = request.get_mut("runs").and_then(Value::as_array_mut) {
        for run in runs {
            let origin = run.clone();
            if cleanup_runtime {
                if let Some(path) = origin.get("runDirectory").and_then(Value::as_str) {
                    run_directories.push(PathBuf::from(path));
                }
            }
            if let Some(artifacts) = run.get_mut("artifacts").and_then(Value::as_array_mut) {
                for artifact in artifacts {
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
                        }
                        continue;
                    }
                    let bytes = if let Some(bytes) = inline_artifact_bytes(artifact)? {
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
                        crate::workspace::read_workspace_asset_bytes(&owner, reference)?
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
                        runtime_artifact_bytes(&origin, artifact, owned_runs)?
                    };
                    let mime = artifact.get("mime").and_then(Value::as_str).unwrap_or(
                        if artifact.get("type").and_then(Value::as_str) == Some("image") {
                            "image/png"
                        } else {
                            "application/octet-stream"
                        },
                    );
                    let asset = store_asset(directory, &bytes, mime)?;
                    assets.push(asset.clone());
                    let object = artifact.as_object_mut().ok_or("產物格式錯誤")?;
                    object.remove("path");
                    object.insert("assetRef".into(), asset);
                }
            }
            if let Some(object) = run.as_object_mut() {
                object.remove("runDirectory");
                if let Some(code) = object.get("code").and_then(Value::as_str) {
                    let reference = store_asset(directory, code.as_bytes(), "text/plain")?;
                    assets.push(reference.clone());
                    object.insert("codeRef".into(), reference);
                    object.remove("code");
                }
            }
        }
    }
    request
        .as_object_mut()
        .ok_or("執行紀錄格式錯誤")?
        .remove("workspaceRoot");
    if let Some(object) = request.as_object_mut() {
        object.remove("cleanupRuntime");
    }
    strip_inline(&mut request);
    let bytes = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
    if bytes.len() > 32 * 1024 * 1024 {
        return Err("單件結構資料超過32MB".into());
    }
    let mut reference = store_asset(directory, &bytes, "application/json")?;
    reference["storage"] = json!("workspace");
    reference["kind"] = json!("inspection-unit");
    reference["executionId"] = json!(execution_id);
    reference["unitId"] = json!(unit_id);
    assets.push(reference.clone());
    register_assets(directory, &assets)?;
    let mut removed_runtime_directories = 0usize;
    if cleanup_runtime {
        let workspace_runs = directory.join("algorithm-runs");
        let mut seen = std::collections::HashSet::new();
        for path in run_directories {
            let key = path.to_string_lossy().into_owned();
            if !seen.insert(key) {
                continue;
            }
            if remove_owned_run_directory(&path, runtime)?
                || remove_owned_run_directory(&path, &workspace_runs)?
            {
                removed_runtime_directories += 1;
            }
        }
    }
    reference["root"] = json!(directory.to_string_lossy());
    Ok(json!({"status":"SAVED","recordRef":reference,"bytes":bytes.len(),
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
pub fn save_inspection_unit(app: tauri::AppHandle, mut request: Value) -> Result<Value, String> {
    let _lock = RECORD_LOCK.lock().map_err(|_| "執行紀錄寫入器不可用")?;
    if let Some(path) = request
        .get("workspaceRoot")
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty())
    {
        let directory = owned_workspace(path)?;
        return save_workspace_unit(&directory, request, &runtime_root()?);
    }
    let execution_id = identity(&request, "executionId")?;
    let unit_id = identity(request.get("unit").ok_or("缺少工件資料")?, "id")?;
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
    serde_json::from_slice(&b).map_err(|e| e.to_string())
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
        let python =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../runtime/python/bin/python3");
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
