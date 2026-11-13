//! Native reference import and a Git-friendly, asset-separated workspace.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    io::Write,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicUsize, Ordering},
};
const MAX_TOTAL: usize = 256 * 1024 * 1024;
const MAX_FILE: usize = 32 * 1024 * 1024;
static ACTIVE_SAVES: AtomicUsize = AtomicUsize::new(0);
pub(crate) struct SaveInProgress;
impl SaveInProgress {
    pub(crate) fn begin() -> Self {
        ACTIVE_SAVES.fetch_add(1, Ordering::AcqRel);
        Self
    }
}
impl Drop for SaveInProgress {
    fn drop(&mut self) {
        ACTIVE_SAVES.fetch_sub(1, Ordering::AcqRel);
    }
}
pub fn is_saving() -> bool {
    ACTIVE_SAVES.load(Ordering::Acquire) > 0
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reference {
    name: String,
    source_path: String,
    data_url: String,
    mime: String,
    text: Option<String>,
    parse_status: String,
    parse_note: String,
}
fn mime_for(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "txt" | "md" | "csv" => "text/plain",
        "json" => "application/json",
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "glb" => "model/gltf-binary",
        "gltf" => "model/gltf+json",
        _ => return None,
    })
}
// Storage accepts media types as data, including user-generated source, model
// weights and other files. The manifest retains their original media type.
// Unknown well-formed types use an inert .bin suffix; this is not a launcher.
fn valid_mime(mime: &str) -> bool {
    let mut parts = mime.split('/');
    let valid_part = |part: &str| {
        !part.is_empty()
            && part.len() <= 127
            && part.as_bytes()[0].is_ascii_alphanumeric()
            && part.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || b"!#$&-^_.+".contains(&byte)
            })
    };
    match (parts.next(), parts.next(), parts.next()) {
        (Some(kind), Some(subtype), None) => valid_part(kind) && valid_part(subtype),
        _ => false,
    }
}
fn preview_extension(mime: &str) -> Option<&'static str> {
    Some(match mime.to_ascii_lowercase().as_str() {
        "text/plain" => "txt",
        "text/markdown" => "md",
        "text/csv" => "csv",
        "application/json" => "json",
        "application/pdf" => "pdf",
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        "model/gltf-binary" => "glb",
        "model/gltf+json" => "gltf",
        _ => return None,
    })
}
pub(crate) fn extension(mime: &str) -> Option<&'static str> {
    if !valid_mime(mime) {
        return None;
    }
    Some(preview_extension(mime).unwrap_or("bin"))
}
fn unpack(data: &str) -> Result<(&str, Vec<u8>), String> {
    let (header, encoded) = data.split_once(',').ok_or("原始資料格式錯誤")?;
    let mime = header
        .strip_prefix("data:")
        .and_then(|s| s.strip_suffix(";base64"))
        .ok_or("只接受 base64 原始資料")?;
    // Archiving bytes does not grant permission to preview or execute them.
    extension(mime).ok_or("原始資料 MIME 必須為有效的 ASCII 類型／子類型")?;
    if encoded.len() > MAX_TOTAL * 4 / 3 + 4 {
        return Err("原始資料過大".into());
    }
    let bytes = STANDARD.decode(encoded).map_err(|_| "原始資料編碼錯誤")?;
    Ok((mime, bytes))
}
#[tauri::command]
pub async fn import_references() -> Result<Vec<Reference>, String> {
    let Some(files) = rfd::AsyncFileDialog::new()
        .set_title("導入工件原始資料")
        .add_filter(
            "工件資料",
            &[
                "txt", "md", "csv", "json", "png", "jpg", "jpeg", "bmp", "webp", "pdf", "glb",
                "gltf",
            ],
        )
        .pick_files()
        .await
    else {
        return Ok(vec![]);
    };
    if files.len() > 50 {
        return Err("一次最多導入 50 份資料".into());
    }
    let mut total = 0usize;
    let mut out = vec![];
    for file in files {
        let p = file.path();
        let size = std::fs::metadata(p).map_err(|_| "無法讀取資料")?.len() as usize;
        total = total.checked_add(size).ok_or("資料過大")?;
        if size > MAX_FILE || total > 128 * 1024 * 1024 {
            return Err("單份資料最多 32 MB，本次總量最多 128 MB".into());
        }
        let ext = p
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let mime = mime_for(&ext).ok_or("不支援的資料格式")?;
        let bytes = std::fs::read(p).map_err(|_| "資料讀取失敗")?;
        if bytes.len() > MAX_FILE {
            return Err("單份資料最多 32 MB".into());
        }
        let (text, status, note) = parse_reference(&ext, &bytes);
        out.push(Reference {
            name: p.file_name().unwrap_or_default().to_string_lossy().into(),
            source_path: p.to_string_lossy().into(),
            data_url: format!("data:{mime};base64,{}", STANDARD.encode(&bytes)),
            mime: mime.into(),
            text,
            parse_status: status.into(),
            parse_note: note,
        });
    }
    Ok(out)
}
fn parse_reference(ext: &str, bytes: &[u8]) -> (Option<String>, &'static str, String) {
    if ["txt", "md", "csv", "json"].contains(&ext) {
        if bytes.len() > 2 * 1024 * 1024 {
            return (
                None,
                "unparsed",
                "原件已保存，文字超過 2 MB，尚未解析".into(),
            );
        }
        return match String::from_utf8(bytes.to_vec()) {
            Ok(text) => (
                Some(text),
                "text",
                "UTF-8 文字可讀；尚未代表 Agent 已引用或確認內容".into(),
            ),
            Err(_) => (
                None,
                "unparsed",
                "原件已保存，非 UTF-8 文字，尚未解析".into(),
            ),
        };
    }
    if ["png", "jpg", "jpeg", "bmp", "webp"].contains(&ext) {
        return (
            None,
            "image",
            "原始圖片可預覽；尚未送入模型或建立圖像對應".into(),
        );
    }
    if ext == "gltf" {
        let metadata = serde_json::from_slice::<Value>(bytes).ok().map(|v| {
            format!(
                "glTF 中繼資料：{} 個 nodes、{} 個 meshes；外部資源未載入，未解析幾何或照片對應",
                v.get("nodes").and_then(Value::as_array).map_or(0, Vec::len),
                v.get("meshes")
                    .and_then(Value::as_array)
                    .map_or(0, Vec::len)
            )
        });
        return (
            metadata,
            "metadata",
            "原件已保存；僅中繼資料，不能當成已理解 3D 幾何".into(),
        );
    }
    (
        None,
        "unparsed",
        "原件已保存；本版尚未解析此格式內容".into(),
    )
}
pub(crate) fn launch(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = Command::new("/usr/bin/open").arg(path).status();
    #[cfg(target_os = "linux")]
    let status = Command::new("xdg-open").arg(path).status();
    #[cfg(target_os = "windows")]
    let status = Command::new("rundll32.exe")
        .arg("url.dll,FileProtocolHandler")
        .arg(path)
        .status();
    status
        .map_err(|_| "無法啟動系統預覽器")?
        .success()
        .then_some(())
        .ok_or("系統無法開啟資料".into())
}
#[tauri::command]
pub fn open_reference(data_url: String, name: String) -> Result<(), String> {
    let (mime, bytes) = unpack(&data_url)?;
    if bytes.len() > MAX_FILE {
        return Err("預覽資料超過 32 MB".into());
    }
    // Keep preview's explicit media-type policy separate from generic storage.
    // Source/model files can be archived and restored, but are not auto-launched.
    let ext = preview_extension(mime).ok_or("此資料已可保存，尚未提供此類型的系統預覽")?;
    // Never derive a path or executable argument from a user-supplied filename.
    let mut hash = Sha256::new();
    hash.update(name.as_bytes());
    hash.update(b"\0");
    hash.update(&bytes);
    let dir = std::env::temp_dir().join(format!("agentcv-preview-{}", std::process::id()));
    if std::fs::symlink_metadata(&dir)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err("預覽目錄不能是符號連結".into());
    }
    std::fs::create_dir_all(&dir).map_err(|_| "無法建立預覽目錄")?;
    let file = dir.join(format!("{:x}.{ext}", hash.finalize()));
    atomic_write(&file, &bytes)?;
    launch(&file)
}
#[tauri::command]
pub fn open_auth_url(url: String) -> Result<(), String> {
    // OAuth is explicitly opened by the UI, never on an incoming auth event.
    let rest = url.strip_prefix("https://").ok_or("登入連結只允許 HTTPS")?;
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty()
        || authority.contains('@')
        || url.chars().any(char::is_control)
        || url.contains('\\')
    {
        return Err("登入連結格式無效".into());
    }
    #[cfg(target_os = "macos")]
    let status = Command::new("/usr/bin/open").arg(&url).status();
    #[cfg(target_os = "linux")]
    let status = Command::new("xdg-open").arg(&url).status();
    #[cfg(target_os = "windows")]
    let status = Command::new("rundll32.exe")
        .arg("url.dll,FileProtocolHandler")
        .arg(&url)
        .status();
    status
        .map_err(|_| "無法開啟登入瀏覽器")?
        .success()
        .then_some(())
        .ok_or("登入瀏覽器開啟失敗".into())
}
pub(crate) fn atomic_write(target: &Path, bytes: &[u8]) -> Result<(), String> {
    if std::fs::symlink_metadata(target)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err("不允許以符號連結寫入專案".into());
    }
    let tmp = target.with_extension(format!(
        "{}-{}.tmp",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let result = (|| {
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
            .map_err(|_| "無法建立暫存檔")?;
        f.write_all(bytes).map_err(|_| "寫入失敗")?;
        f.sync_all().map_err(|_| "同步寫入失敗")?;
        std::fs::rename(&tmp, target).map_err(|_| "專案替換失敗，舊版本未更動")?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(tmp);
    }
    result
}
fn externalize(
    v: &mut Value,
    root: &Path,
    total: &mut usize,
    count: &mut usize,
) -> Result<(), String> {
    match v {
        Value::String(s) if s.starts_with("data:") => {
            let (mime, bytes) = unpack(s)?;
            *total = total.checked_add(bytes.len()).ok_or("資產過大")?;
            *count += 1;
            if *total > MAX_TOTAL || *count > 500 {
                return Err("專案最多 256 MB／500 份資產".into());
            }
            let digest = format!("{:x}", Sha256::digest(&bytes));
            let name = format!("{digest}.{}", extension(mime).ok_or("資產格式不符")?);
            let asset = root.join("assets").join(&name);
            if std::fs::symlink_metadata(&asset)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false)
            {
                return Err("資產不能是符號連結".into());
            }
            if asset.exists() {
                if std::fs::read(&asset).map_err(|_| "無法核對資產")? != bytes {
                    return Err("資產名稱衝突，原專案未改動".into());
                }
            } else {
                atomic_write(&asset, &bytes)?
            }
            *v = json!({"$asset":format!("assets/{name}"),"mime":mime,"sha256":digest,"size":bytes.len()});
        }
        Value::Array(a) => {
            for item in a {
                externalize(item, root, total, count)?
            }
        }
        Value::Object(o) => {
            // Lazy originals retain their owning asset reference in memory.
            // Archives normalize back to the existing portable dataURL pointer.
            if let Some(reference) = o.get("assetRef").cloned() {
                if reference.get("$asset").is_some() {
                    let owned = copy_workspace_asset(&reference, root)?;
                    o.insert("dataURL".into(), owned);
                    o.remove("assetRef");
                }
            }
            for item in o.values_mut() {
                externalize(item, root, total, count)?
            }
        }
        _ => {}
    }
    Ok(())
}
pub(crate) fn safe_asset(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let p = Path::new(relative);
    if p.is_absolute()
        || p.components().any(|c| !matches!(c, Component::Normal(_)))
        || !relative.starts_with("assets/")
        || relative.contains('\\')
    {
        return Err("專案資產路徑不安全".into());
    }
    let canonical_root = root.canonicalize().map_err(|_| "無法讀取專案目錄")?;
    let mut current = canonical_root.clone();
    for c in p.components() {
        current.push(c.as_os_str());
        if std::fs::symlink_metadata(&current)
            .map_err(|_| "缺少專案資產")?
            .file_type()
            .is_symlink()
        {
            return Err("不允許專案資產符號連結".into());
        }
    }
    let target = current.canonicalize().map_err(|_| "缺少專案資產")?;
    if !target.starts_with(&canonical_root) {
        return Err("資產超出專案目錄".into());
    }
    Ok(target)
}
struct AssetManifestIndex { modified: std::time::SystemTime, size: u64, entries: std::collections::HashSet<String>, locations: std::collections::BTreeMap<String,Value> }
static ASSET_INDEXES: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<PathBuf, AssetManifestIndex>>> = std::sync::OnceLock::new();
fn descriptor_key(value: &Value) -> String { crate::inspection_files::asset_pack::key(value) }
fn collect_asset_descriptors(value: &Value, entries: &mut std::collections::HashSet<String>,locations:&mut std::collections::BTreeMap<String,Value>) {
    if value.get("$asset").is_some() { entries.insert(descriptor_key(value));locations.insert(crate::inspection_files::asset_pack::logical_key(value),value.clone()); }
    match value { Value::Array(items) => for item in items { collect_asset_descriptors(item, entries,locations); }, Value::Object(items) => for item in items.values() { collect_asset_descriptors(item, entries,locations); }, _ => {} }
}
fn manifest_owns_asset(root: &Path, asset: &Value) -> Result<bool, String> {
    let canonical = root.canonicalize().map_err(|_| "來源專案目錄不存在")?;
    let path = canonical.join("manifest.agentcv.json");
    let metadata = std::fs::symlink_metadata(&path).map_err(|_| "找不到來源專案清單")?;
    if metadata.file_type().is_symlink() || metadata.len() > 220 * 1024 * 1024 { return Err("來源專案清單不安全或過大".into()); }
    let modified = metadata.modified().map_err(|_| "無法核對來源清單版本")?;
    let mut indexes = ASSET_INDEXES.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new())).lock().map_err(|_| "資產索引無法使用")?;
    let stale = indexes.get(&canonical).is_none_or(|index| index.modified != modified || index.size != metadata.len());
    if stale {
        let manifest: Value = serde_json::from_slice(&std::fs::read(&path).map_err(|_| "無法讀取來源專案")?).map_err(|_| "來源專案清單損壞")?;
        if manifest.get("schema").and_then(Value::as_str) != Some("agentcv-workspace-1") { return Err("來源專案版本錯誤".into()); }
        let mut entries = std::collections::HashSet::new();let mut locations=std::collections::BTreeMap::new();collect_asset_descriptors(&manifest, &mut entries,&mut locations);
        if indexes.len() >= 8 && !indexes.contains_key(&canonical) { if let Some(oldest) = indexes.keys().next().cloned() { indexes.remove(&oldest); } }
        indexes.insert(canonical.clone(), AssetManifestIndex { modified, size: metadata.len(), entries,locations });
    }
    Ok(indexes.get(&canonical).is_some_and(|index| index.entries.contains(&descriptor_key(asset))))
}
pub(crate) fn validate_asset_workspace(root:&Path)->Result<(),String>{manifest_owns_asset(root,&Value::Null)?;Ok(())}
pub(crate) fn validate_packed_closure(root:&Path,value:&Value)->Result<(),String>{
    fn visit(root:&Path,value:&Value,seen:&mut std::collections::HashSet<String>)->Result<(),String>{
        if value.get("$asset").is_some()&&value.get("packedIn").is_some(){
            if seen.insert(descriptor_key(value)){read_workspace_asset_bytes(root,value)?;}
            return Ok(());
        }
        match value{Value::Array(items)=>for item in items{visit(root,item,seen)?;},Value::Object(items)=>for item in items.values(){visit(root,item,seen)?;},_=>{}}
        Ok(())
    }
    visit(root,value,&mut std::collections::HashSet::new())
}
pub(crate) fn manifest_asset_locations(root:&Path,keys:&[String])->Result<std::collections::BTreeMap<String,Value>,String>{
    manifest_owns_asset(root,&Value::Null)?;
    let canonical=root.canonicalize().map_err(|_|"來源專案不存在")?;
    let indexes=ASSET_INDEXES.get().ok_or("資產索引不存在")?.lock().map_err(|_|"資產索引不可用")?;
    Ok(keys.iter().filter_map(|key|indexes.get(&canonical).and_then(|index|index.locations.get(key)).map(|value|(key.clone(),value.clone()))).collect())
}
pub(crate) fn read_workspace_asset_bytes(root: &Path, asset: &Value) -> Result<Vec<u8>, String> {
    if !root.is_absolute() { return Err("來源專案必須是絕對路徑".into()); }
    if !manifest_owns_asset(root, asset)? && !crate::inspection_files::owns_staged_asset(root,asset)? { return Err("此資產不在來源專案清單，禁止任意讀取檔案".into()); }
    if let Some(physical)=crate::inspection_files::asset_pack::container(asset)? {
        // The logical authorization includes the locator. The physical file
        // must independently belong to this workspace; nested packs are banned.
        let bytes=read_workspace_asset_bytes(root,physical)?;
        return Ok(crate::inspection_files::asset_pack::read_entry(&bytes,asset)?.to_vec());
    }
    let relative = asset.get("$asset").and_then(Value::as_str).ok_or("資產缺少路徑")?;
    let mime = asset.get("mime").and_then(Value::as_str).ok_or("資產缺少類型")?;
    let suffix = extension(mime).ok_or("資產類型無效")?;
    let expected_size = asset.get("size").and_then(Value::as_u64).ok_or("資產缺少大小")?;
    if expected_size > 128 * 1024 * 1024 { return Err("單份資產超過目前128MB讀取預算".into()); }
    let path = safe_asset(root, relative)?;
    if std::fs::metadata(&path).map_err(|_| "資產不存在")?.len() != expected_size { return Err("資產大小與清單不符".into()); }
    let bytes = std::fs::read(path).map_err(|_| "無法讀取資產")?;
    let digest = format!("{:x}", Sha256::digest(&bytes));
    if asset.get("sha256").and_then(Value::as_str) != Some(digest.as_str()) || relative != format!("assets/{digest}.{suffix}") { return Err("資產內容雜湊不符".into()); }
    Ok(bytes)
}
fn copy_workspace_asset(reference: &Value, destination: &Path) -> Result<Value, String> {
    let source_root = PathBuf::from(reference.get("root").and_then(Value::as_str).ok_or("圖像引用缺少來源專案")?);
    let bytes = read_workspace_asset_bytes(&source_root, reference)?;
    if let Some(physical)=crate::inspection_files::asset_pack::container(reference)? {
        let packed=read_workspace_asset_bytes(&source_root,physical)?;
        let relative=physical["$asset"].as_str().ok_or("容器缺少路徑")?;
        let path=destination.join(relative);
        if std::fs::symlink_metadata(&path).map(|m|m.file_type().is_symlink()).unwrap_or(false){return Err("容器不能是符號連結".into());}
        if path.exists(){if std::fs::read(&path).map_err(|_|"無法核對容器")?!=packed{return Err("容器內容衝突".into());}}
        else{atomic_write(&path,&packed)?;}
        let mut owned=crate::inspection_files::asset_pack::core(reference);owned["packedIn"]=reference["packedIn"].clone();
        return Ok(owned);
    }
    let relative = reference.get("$asset").and_then(Value::as_str).ok_or("資產缺少路徑")?;
    let path = destination.join(relative);
    if std::fs::symlink_metadata(&path).map(|m| m.file_type().is_symlink()).unwrap_or(false) { return Err("資產不能是符號連結".into()); }
    if path.exists() { if std::fs::read(&path).map_err(|_| "無法核對既有資產")? != bytes { return Err("資產內容衝突".into()); } } else { atomic_write(&path, &bytes)?; }
    Ok(json!({"$asset":reference["$asset"], "mime":reference["mime"], "sha256":reference["sha256"], "size":reference["size"]}))
}
// The normal desktop open path leaves original image assets as references.
// Legacy complete hydration remains available for portable export/history.
pub(crate) fn read_workspace_lazy(root: &Path) -> Result<String, String> {
    let canonical = root.canonicalize().map_err(|_| "來源專案目錄不存在")?;
    let target = canonical.join("manifest.agentcv.json");
    if std::fs::symlink_metadata(&target).map_err(|_| "找不到專案清單")?.file_type().is_symlink() { return Err("專案清單不能是符號連結".into()); }
    if std::fs::metadata(&target).map_err(|_| "無法讀取專案清單")?.len() > 220 * 1024 * 1024 { return Err("專案清單過大".into()); }
    let mut manifest: Value = serde_json::from_slice(&std::fs::read(target).map_err(|_| "無法讀取專案")?).map_err(|_| "專案清單損壞")?;
    if manifest.get("schema").and_then(Value::as_str) != Some("agentcv-workspace-1") { return Err("不支援的專案版本".into()); }
    let project = manifest.get_mut("project").ok_or("專案缺少project")?;
    if let Some(images) = project.get_mut("images").and_then(Value::as_array_mut) {
        for image in images {
            let pointer = image.get("dataURL").filter(|value| value.get("$asset").is_some()).cloned();
            if let Some(mut pointer) = pointer {
                // Resolve only path and metadata here. Bytes and hashes are
                // verified on demand, rather than decoding an entire dataset.
                let relative = pointer.get("$asset").and_then(Value::as_str).ok_or("原圖引用缺少路徑")?;
                safe_asset(&canonical, relative)?;
                let mime = pointer.get("mime").and_then(Value::as_str).ok_or("原圖引用缺少類型")?;
                if !mime.starts_with("image/") || extension(mime).is_none() { return Err("原圖資產類型錯誤".into()); }
                let digest = pointer.get("sha256").and_then(Value::as_str).ok_or("原圖引用缺少雜湊")?;
                if image.get("contentSha256").and_then(Value::as_str).is_some_and(|value| value != digest) { return Err("原圖檔案內容雜湊不一致".into()); }
                image["contentSha256"] = json!(digest);
                pointer["root"] = json!(canonical.to_string_lossy());
                image["assetRef"] = pointer;
                image["dataURL"] = json!("");
            }
        }
    }
    hydrate(project, &canonical, &mut 0, &mut 0)?;
    serde_json::to_string(project).map_err(|_| "無法還原專案metadata".into())
}
fn hydrate(v: &mut Value, root: &Path, total: &mut usize, count: &mut usize) -> Result<(), String> {
    if crate::inspection_files::is_workspace_record(v) {
        // Execution records remain descriptors even under legacy full-image
        // hydration. An engine can open one unit without loading all results.
        let relative = v.get("$asset").and_then(Value::as_str).ok_or("執行紀錄缺少資產路徑")?;
        safe_asset(root, relative)?;
        v["root"] = json!(root.canonicalize().map_err(|_| "工程目錄不存在")?.to_string_lossy());
        return Ok(());
    }
    if v.get("packedIn").is_some(){
        let mime=v["mime"].as_str().ok_or("容器資產缺少類型")?;
        let bytes=read_workspace_asset_bytes(root,v)?;
        *total=total.checked_add(bytes.len()).ok_or("資產過大")?;*count+=1;
        if *total>MAX_TOTAL||*count>500{return Err("專案資產超過限制".into());}
        *v=Value::String(format!("data:{mime};base64,{}",STANDARD.encode(bytes)));return Ok(());
    }
    if let Some(relative) = v.get("$asset").and_then(Value::as_str) {
        let mime = v
            .get("mime")
            .and_then(Value::as_str)
            .ok_or("資產缺少類型")?;
        extension(mime).ok_or("不支援的資產類型")?;
        let target = safe_asset(root, relative)?;
        let size = std::fs::metadata(&target)
            .map_err(|_| "無法讀取資產")?
            .len() as usize;
        *total = total.checked_add(size).ok_or("資產過大")?;
        *count += 1;
        if *total > MAX_TOTAL || *count > 500 {
            return Err("專案資產超過限制".into());
        }
        let bytes = std::fs::read(target).map_err(|_| "資產讀取失敗")?;
        let digest = format!("{:x}", Sha256::digest(&bytes));
        if v.get("sha256").and_then(Value::as_str) != Some(digest.as_str())
            || v.get("size").and_then(Value::as_u64) != Some(bytes.len() as u64)
            || relative
                != format!(
                    "assets/{digest}.{}",
                    extension(mime).ok_or("不支援的資產類型")?
                )
        {
            return Err("專案資產內容雜湊或大小不符；請還原原始資料".into());
        }
        *v = Value::String(format!("data:{mime};base64,{}", STANDARD.encode(bytes)));
        return Ok(());
    }
    match v {
        Value::Array(a) => {
            for item in a {
                hydrate(item, root, total, count)?
            }
        }
        Value::Object(o) => {
            for (key, item) in o.iter_mut() {
                if key == "assetRef" && item.get("root").is_some() { continue; }
                hydrate(item, root, total, count)?
            }
        }
        _ => {}
    }
    Ok(())
}
pub(crate) fn write_workspace(root: &Path, content: &str) -> Result<(), String> {
    if content.len() > 220 * 1024 * 1024 {
        return Err("專案內容過大".into());
    }
    let mut project: Value = serde_json::from_str(content).map_err(|_| "專案 JSON 格式錯誤")?;
    if !project.is_object() {
        return Err("專案必須為 JSON 物件".into());
    }
    let assets = root.join("assets");
    if std::fs::symlink_metadata(&assets)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err("資產目錄不能是符號連結".into());
    }
    std::fs::create_dir_all(&assets).map_err(|_| "無法建立資產目錄")?;
    let mut inspection_assets = std::collections::BTreeMap::new();
    crate::inspection_files::relocate_records(&mut project, root, &mut inspection_assets)?;
    externalize(&mut project, root, &mut 0, &mut 0)?;
    let mut manifest = json!({"schema":"agentcv-workspace-1","project":project});
    if !inspection_assets.is_empty() { manifest["inspectionAssets"] = json!(inspection_assets.into_values().collect::<Vec<_>>()); }
    let bytes = serde_json::to_vec_pretty(&manifest).map_err(|_| "無法序列化專案")?;
    atomic_write(&root.join("manifest.agentcv.json"), &bytes)
}
pub(crate) fn read_workspace(root: &Path) -> Result<String, String> {
    let target = root.join("manifest.agentcv.json");
    if std::fs::symlink_metadata(&target)
        .map_err(|_| "找不到 manifest.agentcv.json")?
        .file_type()
        .is_symlink()
    {
        return Err("專案清單不能是符號連結".into());
    }
    if std::fs::metadata(&target)
        .map_err(|_| "無法讀取專案")?
        .len()
        > 220 * 1024 * 1024
    {
        return Err("專案清單過大".into());
    }
    let mut manifest: Value =
        serde_json::from_slice(&std::fs::read(target).map_err(|_| "專案讀取失敗")?)
            .map_err(|_| "專案 JSON 格式錯誤")?;
    if manifest.get("schema").and_then(Value::as_str) != Some("agentcv-workspace-1") {
        return Err("不支援的專案目錄版本".into());
    }
    let project = manifest.get_mut("project").ok_or("專案清單缺少 project")?;
    hydrate(project, root, &mut 0, &mut 0)?;
    serde_json::to_string(project).map_err(|_| "專案還原失敗".into())
}
#[tauri::command]
pub async fn save_workspace(content: String) -> Result<Option<String>, String> {
    // The guard covers the folder picker as well as asset/manifest writes. In
    // particular Cmd+Q must not end the process while this Future is in flight.
    let _save_in_progress = SaveInProgress::begin();
    let Some(dir) = rfd::AsyncFileDialog::new()
        .set_title("選擇專案目錄（原圖與資料將分開保存）")
        .pick_folder()
        .await
    else {
        return Ok(None);
    };
    write_workspace(dir.path(), &content)?;
    Ok(Some(dir.path().to_string_lossy().into()))
}
#[tauri::command]
pub async fn open_workspace() -> Result<Option<String>, String> {
    let Some(dir) = rfd::AsyncFileDialog::new()
        .set_title("開啟 AgentCV 專案目錄")
        .pick_folder()
        .await
    else {
        return Ok(None);
    };
    Ok(Some(read_workspace(dir.path())?))
}
#[tauri::command]
pub async fn open_workspace_with_path() -> Result<Option<Value>, String> {
    let Some(dir) = rfd::AsyncFileDialog::new()
        .set_title("開啟 AgentCV 專案目錄")
        .pick_folder()
        .await
    else { return Ok(None); };
    let content = read_workspace_lazy(dir.path())?;
    Ok(Some(json!({"content": content, "path": dir.path().to_string_lossy()})))
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    fn dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "agentcv-workspace-test-{}-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }
    #[test]
    fn roundtrip_and_reject_traversal() {
        let root = dir();
        let original = json!({"name":"test","images":[{"data_url":"data:image/png;base64,aGVsbG8="}],"refs":[{"dataUrl":"data:text/plain;base64,dGV4dA=="}]});
        write_workspace(&root, &original.to_string()).unwrap();
        let manifest = std::fs::read_to_string(root.join("manifest.agentcv.json")).unwrap();
        assert!(!manifest.contains("base64"));
        assert_eq!(
            serde_json::from_str::<Value>(&read_workspace(&root).unwrap()).unwrap(),
            original
        );
        assert!(safe_asset(&root, "assets/../../etc/passwd").is_err());
        assert!(safe_asset(&root, "/etc/passwd").is_err());
        assert!(safe_asset(&root, "assets\\x").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn reference_honesty() {
        assert_eq!(parse_reference("pdf", b"pdf").1, "unparsed");
        assert_eq!(parse_reference("glb", b"glb").1, "unparsed");
        assert_eq!(parse_reference("gltf", br#"{"nodes":[{}]}"#).1, "metadata");
        assert_eq!(parse_reference("md", b"hello").0, Some("hello".into()));
        assert!(parse_reference("txt", &[255]).0.is_none());
    }
    #[test]
    fn native_save_guard_covers_concurrent_work_and_releases_on_failure() {
        assert!(!is_saving());
        let first = SaveInProgress::begin();
        let second = SaveInProgress::begin();
        assert!(is_saving());
        drop(first);
        assert!(is_saving(), "another pending save still prevents process exit");
        drop(second);
        assert!(!is_saving());
        fn failing_save() -> Result<(), &'static str> {
            let _guard = SaveInProgress::begin();
            assert!(is_saving());
            Err("write failed")
        }
        assert!(failing_save().is_err());
        assert!(!is_saving(), "early returns release the RAII guard");
    }
    #[test]
    fn visual_inquiry_assets_and_frozen_chat_roundtrip() {
        let root = dir();
        let png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
        let source = json!({"imageId":"camera-1","runId":"historical-run","nodeId":"features","coordinateSpace":"render-pixels"});
        let item = json!({"id":"view-1","assetId":"frozen-1","annotations":[{"id":"mark-1","type":"line","author":"human","points":[{"x":0,"y":0},{"x":1,"y":1}]}]});
        let original = json!({"schema":"agentcv-workspace-0.9","images":[{"data_url":png}],"visualInquiry":{"assets":[{"id":"frozen-1","dataURL":png,"source":source}],"boards":[{"id":"board-1","revision":3,"items":[item.clone()]}]},"chat":[{"role":"user","text":"看這條線","attachments":[{"assetId":"frozen-1"}],"visualSnapshot":{"id":"board-1","revision":2,"items":[item]}}]});
        write_workspace(&root, &original.to_string()).unwrap();
        let manifest = std::fs::read_to_string(root.join("manifest.agentcv.json")).unwrap();
        assert!(!manifest.contains("base64"));
        assert_eq!(std::fs::read_dir(root.join("assets")).unwrap().count(), 1);
        let restored: Value = serde_json::from_str(&read_workspace(&root).unwrap()).unwrap();
        assert_eq!(restored, original);
        assert_eq!(restored["chat"][0]["visualSnapshot"]["revision"], 2);
        assert_eq!(restored["visualInquiry"]["boards"][0]["revision"], 3);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn workspace_09_deduplicates_and_detects_corruption() {
        let root = dir();
        let original = json!({"schema":"agentcv-workspace-0.9","images":[{"data_url":"data:image/png;base64,aGVsbG8="}],"workflow":{"references":[{"name":"notes","dataURL":"data:text/plain;base64,dGV4dA==","dataUrl":"data:text/plain;base64,dGV4dA==","text":"text","extractedText":"text","parseStatus":"text"}],"parts":[{"name":"part","regions":{}}]}});
        write_workspace(&root, &original.to_string()).unwrap();
        assert_eq!(std::fs::read_dir(root.join("assets")).unwrap().count(), 2);
        assert_eq!(
            serde_json::from_str::<Value>(&read_workspace(&root).unwrap()).unwrap(),
            original
        );
        let first = std::fs::read(root.join("manifest.agentcv.json")).unwrap();
        write_workspace(&root, &original.to_string()).unwrap();
        assert_eq!(
            std::fs::read(root.join("manifest.agentcv.json")).unwrap(),
            first
        );
        let mut manifest: Value = serde_json::from_slice(&first).unwrap();
        let asset = manifest["project"]["workflow"]["references"][0]["dataURL"]["$asset"]
            .as_str()
            .unwrap();
        std::fs::write(root.join(asset), b"edited").unwrap();
        assert!(read_workspace(&root).unwrap_err().contains("雜湊"));
        // Restoring the asset restores the project; an injected relative path is still rejected.
        std::fs::write(root.join(asset), b"text").unwrap();
        manifest["project"]["workflow"]["references"][0]["dataURL"]["$asset"] =
            json!("assets/../manifest.agentcv.json");
        std::fs::write(
            root.join("manifest.agentcv.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        assert!(read_workspace(&root).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_overwrite_preserves_previous_manifest() {
        let root = dir();
        let original = json!({"schema":"agentcv-workspace-0.9","name":"original","dataURL":"data:text/plain;base64,dGV4dA=="});
        write_workspace(&root, &original.to_string()).unwrap();
        let before = std::fs::read(root.join("manifest.agentcv.json")).unwrap();
        let broken = json!({"a":"data:text/plain;base64,bmV3","z":"data:not/a valid mime;base64,aGVsbG8="});
        assert!(write_workspace(&root, &broken.to_string()).is_err());
        assert_eq!(
            std::fs::read(root.join("manifest.agentcv.json")).unwrap(),
            before
        );
        assert_eq!(
            serde_json::from_str::<Value>(&read_workspace(&root).unwrap()).unwrap(),
            original
        );
        let changed = json!({"schema":"agentcv-workspace-0.9","name":"changed","dataURL":"data:text/plain;base64,bmV3"});
        write_workspace(&root, &changed.to_string()).unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&read_workspace(&root).unwrap()).unwrap(),
            changed
        );
        assert!(!std::fs::read_dir(&root).unwrap().any(|e| e
            .unwrap()
            .path()
            .extension()
            .is_some_and(|e| e == "tmp")));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn generated_program_and_binary_artifacts_roundtrip_and_deduplicate() {
        let root = dir();
        let program = b"import numpy as np\nresult = {'value': np.uint16(65530).item()}\n";
        let weights = [0u8, 1, 2, 0, 255, 13, 10, 128];
        let python = format!("data:text/x-python;base64,{}", STANDARD.encode(program));
        let binary = format!("data:application/octet-stream;base64,{}", STANDARD.encode(weights));
        let custom = format!("data:application/vnd.agentcv.model+binary;base64,{}", STANDARD.encode(weights));
        let original = json!({"schema":"agentcv-workspace-0.9","algorithmRuns":[{
            "runId":"native-python-program","status":"SUCCEEDED","artifacts":[
                {"id":"program","type":"file","name":"algorithm.py","mime":"text/x-python","dataUrl":python,"dataURL":python},
                {"id":"weights","type":"file","name":"model.weights","mime":"application/octet-stream","dataUrl":binary},
                {"id":"custom-model","type":"file","name":"model.native","mime":"application/vnd.agentcv.model+binary","dataUrl":custom}
            ]
        }]});
        write_workspace(&root, &original.to_string()).unwrap();
        let bytes = std::fs::read(root.join("manifest.agentcv.json")).unwrap();
        let manifest: Value = serde_json::from_slice(&bytes).unwrap();
        let artifacts = &manifest["project"]["algorithmRuns"][0]["artifacts"];
        assert!(!String::from_utf8_lossy(&bytes).contains("base64"));
        assert_eq!(std::fs::read_dir(root.join("assets")).unwrap().count(), 2);
        assert_eq!(artifacts[0]["dataUrl"], artifacts[0]["dataURL"]);
        assert_eq!(artifacts[0]["dataUrl"]["mime"], "text/x-python");
        assert_eq!(artifacts[1]["dataUrl"]["mime"], "application/octet-stream");
        assert_eq!(artifacts[2]["dataUrl"]["mime"], "application/vnd.agentcv.model+binary");
        assert_eq!(artifacts[1]["dataUrl"]["$asset"], artifacts[2]["dataUrl"]["$asset"]);
        for asset in std::fs::read_dir(root.join("assets")).unwrap() {
            let path = asset.unwrap().path();
            assert_eq!(path.extension().unwrap(), "bin");
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                assert_eq!(std::fs::metadata(path).unwrap().permissions().mode() & 0o111, 0);
            }
        }
        assert_eq!(serde_json::from_str::<Value>(&read_workspace(&root).unwrap()).unwrap(), original);
        write_workspace(&root, &original.to_string()).unwrap();
        assert_eq!(std::fs::read(root.join("manifest.agentcv.json")).unwrap(), bytes);
        // A generic suffix does not relax identity checks on restored bytes.
        let stored = artifacts[1]["dataUrl"]["$asset"].as_str().unwrap();
        std::fs::write(root.join(stored), b"changed weights").unwrap();
        assert!(read_workspace(&root).unwrap_err().contains("雜湊"));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn arbitrary_valid_media_are_storable_but_not_implicitly_previewable() {
        for mime in ["text/x-python", "application/octet-stream", "application/x-executable", "model/vnd.point-cloud+binary", "Application/Vnd.My_Model.1+Binary"] {
            assert!(valid_mime(mime), "{mime}");
            assert_eq!(extension(mime), Some("bin"));
            assert_eq!(preview_extension(mime), None);
            let data = format!("data:{mime};base64,{}", STANDARD.encode(b"stored data"));
            assert_eq!(unpack(&data).unwrap().1, b"stored data");
            assert!(open_reference(data, "algorithm.py".into()).is_err(), "unknown files must not launch");
        }
        assert_eq!(extension("IMAGE/PNG"), Some("png"));
        assert_eq!(preview_extension("image/png"), Some("png"));
        for mime in ["", "text", "/plain", "text/", "text/plain/extra", "not/a valid mime", "text/plain\n", "text/plain\r\nX: injected", "text/pläin", "text/plain;charset=utf-8", "*/plain", "text/*", "text/../plain"] {
            assert!(!valid_mime(mime), "{mime:?}");
            assert_eq!(extension(mime), None);
            assert!(unpack(&format!("data:{mime};base64,aGVsbG8=")).is_err());
        }
    }
    #[cfg(unix)]
    #[test]
    fn reject_symlink_assets() {
        let root = dir();
        let outside = dir();
        std::fs::write(outside.join("secret"), b"secret").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("assets")).unwrap();
        assert!(safe_asset(&root, "assets/secret").is_err());
        assert!(write_workspace(&root, "{}").is_err());
        std::fs::remove_dir_all(root).unwrap();
        std::fs::remove_dir_all(outside).unwrap();
    }
}
