//! Complete local project transfer. Binary assets are copied and hashed in bounded
//! chunks; neither export nor import writes into the source or an existing project.
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

const HISTORY: &str = ".agentcv-history.git";
const PENDING: &str = ".agentcv-history-pending";
const MAX_MANIFEST: u64 = 220 * 1024 * 1024;
const BUFFER: usize = 128 * 1024;
static SERIAL: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferReceipt {
    pub path: String,
    pub assets: usize,
    pub bytes: u64,
    pub history_included: bool,
}
#[derive(Clone, Debug)]
struct Asset {
    relative: String,
    hash: String,
    size: u64,
}
struct Staging(PathBuf);
impl Staging {
    fn beside(parent: &Path) -> Result<Self, String> {
        for _ in 0..100 {
            let path = parent.join(format!(
                ".agentcv-transfer-{}-{}",
                std::process::id(),
                SERIAL.fetch_add(1, Ordering::Relaxed)
            ));
            match fs::create_dir(&path) {
                Ok(()) => return Ok(Self(path)),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(e) => return Err(format!("無法建立搬移暫存目錄：{e}")),
            }
        }
        Err("無法建立唯一的搬移暫存目錄".into())
    }
}
impl Drop for Staging {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn io_error(action: &str, error: std::io::Error) -> String {
    format!("{action}：{error}")
}
fn file_meta(path: &Path) -> Result<fs::Metadata, String> {
    let meta = fs::symlink_metadata(path).map_err(|e| io_error("無法讀取搬移來源", e))?;
    if !meta.is_file() || meta.file_type().is_symlink() {
        return Err(format!(
            "搬移來源不是一般檔案或含符號連結：{}",
            path.display()
        ));
    }
    Ok(meta)
}
fn source_root(path: &Path) -> Result<PathBuf, String> {
    let meta = fs::symlink_metadata(path).map_err(|e| io_error("專案目錄不存在", e))?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("專案來源必須是一般目錄，不能是符號連結".into());
    }
    path.canonicalize()
        .map_err(|e| io_error("無法解析專案來源", e))
}
fn destination(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("搬移目標必須是完整路徑".into());
    }
    let name = path
        .file_name()
        .filter(|name| !name.is_empty())
        .ok_or("搬移目標必須有目錄名稱")?;
    if !matches!(
        Path::new(name).components().next(),
        Some(Component::Normal(_))
    ) {
        return Err("搬移目標名稱不合法".into());
    }
    let parent = path
        .parent()
        .ok_or("搬移目標缺少父目錄")?
        .canonicalize()
        .map_err(|e| io_error("搬移目標父目錄不存在", e))?;
    if !parent.is_dir() {
        return Err("搬移目標父路徑不是目錄".into());
    }
    let target = parent.join(name);
    check_empty_destination(&target)?;
    Ok(target)
}
fn check_empty_destination(target: &Path) -> Result<(), String> {
    match fs::symlink_metadata(target) {
        Ok(meta) => {
            if !meta.is_dir() || meta.file_type().is_symlink() {
                return Err("搬移目標已存在且不是一般空目錄".into());
            }
            if fs::read_dir(target)
                .map_err(|e| io_error("無法核對目標目錄", e))?
                .next()
                .is_some()
            {
                return Err("搬移目標不是空目錄；未覆寫任何內容".into());
            }
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(io_error("無法核對搬移目標", e)),
    }
}
fn parse_manifest(root: &Path) -> Result<(Vec<u8>, BTreeMap<String, Asset>), String> {
    let manifest = root.join("manifest.agentcv.json");
    let meta = file_meta(&manifest)?;
    if meta.len() > MAX_MANIFEST {
        return Err("專案清單超過搬移大小限制".into());
    }
    let mut bytes = Vec::new();
    File::open(&manifest)
        .map_err(|e| io_error("無法開啟專案清單", e))?
        .take(MAX_MANIFEST + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| io_error("無法讀取專案清單", e))?;
    if bytes.len() as u64 > MAX_MANIFEST {
        return Err("專案清單讀取期間超出大小限制".into());
    }
    let value: Value =
        serde_json::from_slice(&bytes).map_err(|_| "搬移來源的專案清單不是有效 JSON")?;
    if value.get("schema").and_then(Value::as_str) != Some("agentcv-workspace-1")
        || !value.get("project").is_some_and(Value::is_object)
    {
        return Err("搬移來源不是已保存的 AgentCV 專案".into());
    }
    let mut assets = BTreeMap::new();
    collect_assets(&value, &mut assets)?;
    crate::workspace::validate_packed_closure(root,&value)?;
    Ok((bytes, assets))
}
fn mime_extension(mime: &str) -> Option<&'static str> {
    let mut parts = mime.split('/');
    let valid = |part: &str| {
        !part.is_empty()
            && part.len() <= 127
            && part.as_bytes()[0].is_ascii_alphanumeric()
            && part
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"!#$&-^_.+".contains(&b))
    };
    match (parts.next(), parts.next(), parts.next()) {
        (Some(a), Some(b), None) if valid(a) && valid(b) => {}
        _ => return None,
    }
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
        _ => "bin",
    })
}
fn collect_assets(value: &Value, assets: &mut BTreeMap<String, Asset>) -> Result<(), String> {
    if let Some(object) = value.as_object() {
        if object.contains_key("$asset") {
            if object.contains_key("packedIn") {
                let physical=crate::inspection_files::asset_pack::container(value)?.ok_or("搬移容器定位缺失")?;
                return collect_assets(physical,assets);
            }
            let relative = object
                .get("$asset")
                .and_then(Value::as_str)
                .ok_or("資產引用缺少有效路徑")?;
            let name = relative
                .strip_prefix("assets/")
                .ok_or("資產引用超出 assets 目錄")?;
            let (hash, ext) = name.split_once('.').ok_or("資產引用名稱不合法")?;
            if hash.len() != 64
                || !hash
                    .bytes()
                    .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
                || ext.is_empty()
                || ext.len() > 10
                || !ext
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
                || relative.contains('\\')
                || Path::new(relative).components().count() != 2
            {
                return Err("資產引用路徑不安全".into());
            }
            let recorded = object
                .get("sha256")
                .and_then(Value::as_str)
                .ok_or("資產缺少 SHA-256")?;
            let size = object
                .get("size")
                .and_then(Value::as_u64)
                .ok_or("資產缺少大小")?;
            let mime = object
                .get("mime")
                .and_then(Value::as_str)
                .ok_or("資產缺少 MIME 類型")?;
            if recorded != hash || mime_extension(mime) != Some(ext) {
                return Err("資產引用雜湊或類型不合法".into());
            }
            let asset = Asset {
                relative: relative.into(),
                hash: hash.into(),
                size,
            };
            if let Some(old) = assets.insert(relative.into(), asset.clone()) {
                if old.hash != asset.hash || old.size != asset.size {
                    return Err("同一資產引用的大小或雜湊互相矛盾".into());
                }
            }
            if assets.len() > 100_000 {
                return Err("搬移資產引用數量超過限制".into());
            }
            return Ok(());
        }
        for child in object.values() {
            collect_assets(child, assets)?
        }
    } else if let Some(array) = value.as_array() {
        for child in array {
            collect_assets(child, assets)?
        }
    }
    Ok(())
}
fn asset_source(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let dir = root.join("assets");
    let meta = fs::symlink_metadata(&dir).map_err(|e| io_error("缺少專案資產目錄", e))?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("專案資產目錄不安全".into());
    }
    let path = root.join(relative);
    file_meta(&path)?;
    Ok(path)
}
fn copy_file(source: &Path, dest: &Path, expected: Option<&Asset>) -> Result<u64, String> {
    let meta = file_meta(source)?;
    if let Some(asset) = expected {
        if meta.len() != asset.size {
            return Err(format!("資產大小不符：{}", asset.relative));
        }
    }
    let mut input = File::open(source).map_err(|e| io_error("無法開啟搬移檔案", e))?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dest)
        .map_err(|e| io_error("無法建立搬移檔案", e))?;
    let mut sha = Sha256::new();
    let mut bytes = 0u64;
    let mut buffer = vec![0u8; BUFFER];
    loop {
        let n = input
            .read(&mut buffer)
            .map_err(|e| io_error("讀取搬移檔案失敗", e))?;
        if n == 0 {
            break;
        }
        bytes = bytes.checked_add(n as u64).ok_or("搬移檔案大小溢位")?;
        if bytes > meta.len() {
            return Err("搬移來源在讀取期間改變，未完成搬移".into());
        }
        sha.update(&buffer[..n]);
        output
            .write_all(&buffer[..n])
            .map_err(|e| io_error("寫入搬移檔案失敗", e))?;
    }
    if bytes != meta.len() {
        return Err("搬移來源在讀取期間縮短，未完成搬移".into());
    }
    if let Some(asset) = expected {
        if format!("{:x}", sha.finalize()) != asset.hash {
            return Err(format!("資產 SHA-256 不符：{}", asset.relative));
        }
    }
    output
        .sync_all()
        .map_err(|e| io_error("同步搬移檔案失敗", e))?;
    Ok(bytes)
}
fn copy_tree(source: &Path, dest: &Path) -> Result<u64, String> {
    let meta = fs::symlink_metadata(source).map_err(|e| io_error("缺少 Git 歷史檔案", e))?;
    if meta.file_type().is_symlink() {
        return Err(format!("Git 歷史包含符號連結：{}", source.display()));
    }
    if meta.is_file() {
        return copy_file(source, dest, None);
    }
    if !meta.is_dir() {
        return Err("Git 歷史包含不支援的檔案類型".into());
    }
    fs::create_dir(dest).map_err(|e| io_error("無法建立 Git 歷史目錄", e))?;
    let mut bytes = 0u64;
    for item in fs::read_dir(source).map_err(|e| io_error("無法完整列舉 Git 歷史", e))? {
        let item = item.map_err(|e| io_error("Git 歷史清單不完整", e))?;
        let name = item.file_name();
        if name == "alternates" || name == "http-alternates" {
            return Err("Git 歷史依賴外部物件目錄，不能作為完整離線專案搬移".into());
        }
        bytes = bytes
            .checked_add(copy_tree(&item.path(), &dest.join(name))?)
            .ok_or("Git 歷史大小溢位")?;
    }
    Ok(bytes)
}
fn copy_history(source_root: &Path, dest_root: &Path) -> Result<(bool, u64), String> {
    let source = source_root.join(HISTORY);
    match fs::symlink_metadata(&source) {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok((false, 0)),
        Err(e) => return Err(io_error("無法核對 Git 歷史目錄", e)),
    }
    crate::git_workspace::validate_complete_history(source_root)?;
    let meta = fs::symlink_metadata(&source).map_err(|e| io_error("無法讀取 Git 歷史", e))?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("Git 歷史目錄不安全".into());
    }
    let dest = dest_root.join(HISTORY);
    fs::create_dir(&dest).map_err(|e| io_error("無法建立搬移 Git 歷史", e))?;
    let mut bytes = 0u64;
    // Preserve the managed repository, not arbitrary files in the project folder.
    for name in [
        "HEAD",
        "config",
        "agentcv-owner.json",
        "packed-refs",
        "objects",
        "refs",
    ] {
        let file = source.join(name);
        match fs::symlink_metadata(&file) {
            Ok(_) => {
                bytes = bytes
                    .checked_add(copy_tree(&file, &dest.join(name))?)
                    .ok_or("Git 歷史大小溢位")?
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(io_error("Git 歷史檔案無法讀取", e)),
        }
    }
    let lfs = source.join("lfs");
    if let Ok(meta) = fs::symlink_metadata(&lfs) {
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return Err("Git LFS 目錄不安全".into());
        }
        let objects = lfs.join("objects");
        if fs::symlink_metadata(&objects).is_ok() {
            fs::create_dir(dest.join("lfs")).map_err(|e| io_error("無法建立搬移 LFS 目錄", e))?;
            bytes = bytes
                .checked_add(copy_tree(&objects, &dest.join("lfs/objects"))?)
                .ok_or("LFS 歷史大小溢位")?;
        }
    }
    crate::git_workspace::validate_complete_history(dest_root)?;
    Ok((true, bytes))
}
fn install(staging: &Path, target: &Path) -> Result<(), String> {
    check_empty_destination(target)?;
    let was_empty = target.is_dir();
    if was_empty {
        fs::remove_dir(target).map_err(|e| io_error("目標不再是空目錄，未完成搬移", e))?;
    }
    if let Err(error) = fs::rename(staging, target) {
        if was_empty && !target.exists() {
            let _ = fs::create_dir(target);
        }
        return Err(io_error("無法原子完成搬移，來源未變更", error));
    }
    Ok(())
}
fn copy_snapshot(root: &Path, dest: &Path) -> Result<(usize, u64), String> {
    let (manifest, assets) = parse_manifest(root)?;
    fs::create_dir(dest.join("assets")).map_err(|e| io_error("無法建立搬移資產目錄", e))?;
    let mut bytes = manifest.len() as u64;
    let mut out = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dest.join("manifest.agentcv.json"))
        .map_err(|e| io_error("無法建立搬移專案清單", e))?;
    out.write_all(&manifest)
        .and_then(|_| out.sync_all())
        .map_err(|e| io_error("無法保存搬移專案清單", e))?;
    for asset in assets.values() {
        bytes = bytes
            .checked_add(copy_file(
                &asset_source(root, &asset.relative)?,
                &dest.join(&asset.relative),
                Some(asset),
            )?)
            .ok_or("專案搬移大小溢位")?;
    }
    Ok((assets.len(), bytes))
}
fn pending_meta(trial: &Path) -> Result<Vec<u8>, String> {
    let file = trial.join("pending.json");
    if file_meta(&file)?.len() > 64 * 1024 {
        return Err("待提交試算中繼資料超出限制".into());
    }
    let mut bytes = Vec::new();
    File::open(file)
        .map_err(|e| io_error("無法讀取待提交試算", e))?
        .take(64 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| io_error("無法讀取待提交試算", e))?;
    if bytes.len() > 64 * 1024 {
        return Err("待提交試算中繼資料超出限制".into());
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "待提交試算中繼資料無效")?;
    let message = value
        .get("message")
        .and_then(Value::as_str)
        .ok_or("待提交試算缺少說明")?;
    let kind = value
        .get("kind")
        .and_then(Value::as_str)
        .ok_or("待提交試算缺少用途")?;
    if value.get("schema").and_then(Value::as_str) != Some("agentcv-pending-trial-1")
        || !["trial", "checkpoint"].contains(&kind)
        || message.trim().is_empty()
        || message.chars().count() > 160
        || message.chars().any(char::is_control)
    {
        return Err("待提交試算格式或說明無效".into());
    }
    if let Some(id) = value.get("runId").filter(|v| !v.is_null()) {
        let id = id.as_str().ok_or("待提交試算識別無效")?;
        if id.is_empty() || id.len() > 200 || id.chars().any(char::is_control) {
            return Err("待提交試算識別無效".into());
        }
    }
    crate::git_workspace::validate_snapshot_files(trial)?;
    Ok(bytes)
}
fn pending_trials(root: &Path) -> Result<BTreeMap<String, (Vec<u8>, Vec<u8>)>, String> {
    let parent = root.join(PENDING);
    let mut result = BTreeMap::new();
    match fs::symlink_metadata(&parent) {
        Ok(meta) => {
            if !meta.is_dir() || meta.file_type().is_symlink() {
                return Err("待提交試算目錄不安全".into());
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(result),
        Err(e) => return Err(io_error("待提交試算目錄無法讀取", e)),
    }
    for entry in fs::read_dir(&parent).map_err(|e| io_error("無法完整列舉待提交試算", e))?
    {
        let entry = entry.map_err(|e| io_error("待提交試算清單不完整", e))?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "待提交試算名稱無效")?;
        if name == ".DS_Store" {
            continue;
        }
        if !name.starts_with("trial-")
            || name.len() > 200
            || !name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err("待提交試算目錄名稱不安全".into());
        }
        let meta =
            fs::symlink_metadata(entry.path()).map_err(|e| io_error("待提交試算無法讀取", e))?;
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return Err("待提交試算不能是符號連結或一般檔案".into());
        }
        let metadata = pending_meta(&entry.path())?;
        let (manifest, _) = parse_manifest(&entry.path())?;
        result.insert(name, (metadata, manifest));
        if result.len() > 10_000 {
            return Err("待提交試算數量超過搬移限制".into());
        }
    }
    Ok(result)
}
fn copy_pending(root: &Path, dest: &Path) -> Result<(usize, u64), String> {
    let trials = pending_trials(root)?;
    if trials.is_empty() {
        return Ok((0, 0));
    }
    let parent = dest.join(PENDING);
    fs::create_dir(&parent).map_err(|e| io_error("無法建立待提交試算搬移目錄", e))?;
    let mut bytes = 0u64;
    for (name, (metadata, _)) in &trials {
        let target = parent.join(name);
        fs::create_dir(&target).map_err(|e| io_error("無法建立待提交試算快照", e))?;
        let (_, count) = copy_snapshot(&root.join(PENDING).join(name), &target)?;
        bytes = bytes
            .checked_add(count)
            .and_then(|n| n.checked_add(metadata.len() as u64))
            .ok_or("待提交試算搬移大小溢位")?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target.join("pending.json"))
            .map_err(|e| io_error("無法保存待提交試算中繼資料", e))?;
        file.write_all(metadata)
            .and_then(|_| file.sync_all())
            .map_err(|e| io_error("無法保存待提交試算中繼資料", e))?;
    }
    pending_trials(dest)?;
    Ok((trials.len(), bytes))
}
fn transfer_impl(
    snapshot: &Path,
    history_source: &Path,
    dest: &Path,
) -> Result<TransferReceipt, String> {
    let root = source_root(snapshot)?;
    let history = source_root(history_source)?;
    let target = destination(dest)?;
    if target.starts_with(&root) || target.starts_with(&history) {
        return Err("不能把完整專案搬移到其自身目錄內".into());
    }
    parse_manifest(&root)?;
    if history.join(HISTORY).exists() {
        crate::git_workspace::validate_complete_history(&history)?;
    }
    pending_trials(&history)?;
    let staging = Staging::beside(target.parent().ok_or("搬移目標缺少父目錄")?)?;
    let (assets, mut bytes) = copy_snapshot(&root, &staging.0)?;
    let (history_included, history_bytes) = copy_history(&history, &staging.0)?;
    let (pending_count, pending_bytes) = copy_pending(&history, &staging.0)?;
    bytes = bytes
        .checked_add(history_bytes)
        .and_then(|n| n.checked_add(pending_bytes))
        .ok_or("專案搬移大小溢位")?;
    install(&staging.0, &target)?;
    Ok(TransferReceipt {
        path: target.to_string_lossy().into(),
        assets,
        bytes,
        history_included: history_included || pending_count > 0,
    })
}
pub(crate) fn export_current_project(
    history_source: &Path,
    current_snapshot: &Path,
    dest: &Path,
) -> Result<TransferReceipt, String> {
    transfer_impl(current_snapshot, history_source, dest)
}
pub(crate) fn export_project(source: &Path, dest: &Path) -> Result<TransferReceipt, String> {
    transfer_impl(source, source, dest)
}
pub(crate) fn import_project(package: &Path, dest: &Path) -> Result<TransferReceipt, String> {
    transfer_impl(package, package, dest)
}
fn refs(repo: &Path) -> Result<Vec<u8>, String> {
    let mut command = crate::background_command::new("git");
    for key in [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_COMMON_DIR",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_CONFIG",
        "GIT_CONFIG_PARAMETERS",
        "GIT_CONFIG_COUNT",
    ] {
        command.env_remove(key);
    }
    let output = command
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env("GIT_TERMINAL_PROMPT", "0")
        .args([
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.fsmonitor=false",
        ])
        .arg("--git-dir")
        .arg(crate::git_workspace::git_path(repo))
        .args(["for-each-ref", "--format=%(refname) %(objectname)"])
        .output()
        .map_err(|e| io_error("無法核對 Git 歷史", e))?;
    if !output.status.success() {
        return Err(format!(
            "無法核對 Git 歷史：{}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(output.stdout)
}
pub(crate) fn attach_history(source: &Path, project: &Path) -> Result<TransferReceipt, String> {
    let source = source_root(source)?;
    let target = source_root(project)?;
    let source_repo = source.join(HISTORY);
    let source_history = fs::symlink_metadata(&source_repo).is_ok();
    let pending = pending_trials(&source)?;
    if !source_history && pending.is_empty() {
        return Ok(TransferReceipt {
            path: target.to_string_lossy().into(),
            assets: 0,
            bytes: 0,
            history_included: false,
        });
    }
    if source_history {
        crate::git_workspace::validate_complete_history(&source)?;
    }
    let target_repo = target.join(HISTORY);
    let target_history = fs::symlink_metadata(&target_repo).is_ok();
    let old_pending = pending_trials(&target)?;
    if source_history && target_history {
        crate::git_workspace::validate_complete_history(&target)?;
        if refs(&source_repo)? != refs(&target_repo)? {
            return Err("目標已有不同的 Git 歷史；未覆寫，請先選擇要保留的專案".into());
        }
    }
    for (name, signature) in &pending {
        if let Some(existing) = old_pending.get(name) {
            if existing != signature {
                return Err(format!("目標已有不同內容的待提交試算 {name}；未覆寫"));
            }
        }
    }
    let added: Vec<String> = pending
        .keys()
        .filter(|name| !old_pending.contains_key(*name))
        .cloned()
        .collect();
    let add_repo = source_history && !target_history;
    if !add_repo && added.is_empty() {
        return Ok(TransferReceipt {
            path: target.to_string_lossy().into(),
            assets: 0,
            bytes: 0,
            history_included: true,
        });
    }
    let staging = Staging::beside(&target)?;
    let mut bytes = 0u64;
    if add_repo {
        bytes = copy_history(&source, &staging.0)?.1;
    }
    if !added.is_empty() {
        bytes = bytes
            .checked_add(copy_pending(&source, &staging.0)?.1)
            .ok_or("附加歷史大小溢位")?;
    }
    let pending_parent = target.join(PENDING);
    let created_pending = !pending_parent.exists();
    let mut installed: Vec<String> = vec![];
    let result = (|| {
        if !added.is_empty() && created_pending {
            fs::create_dir(&pending_parent).map_err(|e| io_error("無法建立待提交試算目錄", e))?;
        }
        for name in &added {
            let destination = pending_parent.join(name);
            if fs::symlink_metadata(&destination).is_ok() {
                return Err("附加期間出現同名待提交試算；未覆寫".into());
            }
            fs::rename(staging.0.join(PENDING).join(name), destination)
                .map_err(|e| io_error("無法原子附加待提交試算", e))?;
            installed.push(name.clone());
        }
        if add_repo {
            if fs::symlink_metadata(&target_repo).is_ok() {
                return Err("附加期間目標已出現 Git 歷史，未覆寫".into());
            }
            fs::rename(staging.0.join(HISTORY), &target_repo)
                .map_err(|e| io_error("無法原子附加 Git 歷史", e))?;
        }
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        for name in installed {
            let _ = fs::remove_dir_all(pending_parent.join(name));
        }
        if created_pending {
            let _ = fs::remove_dir(&pending_parent);
        }
        return Err(error);
    }
    Ok(TransferReceipt {
        path: target.to_string_lossy().into(),
        assets: 0,
        bytes,
        history_included: true,
    })
}

#[cfg(test)]
mod tests {
    use std::process::Command;
    use super::*;
    use crate::git_lfs_storage;
    struct Temp(PathBuf);
    impl Temp {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "agentcv-transfer-test-{}-{}",
                std::process::id(),
                SERIAL.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&root).unwrap();
            Self(root)
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn hash_file(path: &Path) -> String {
        let mut f = File::open(path).unwrap();
        let mut sha = Sha256::new();
        let mut buf = vec![0; BUFFER];
        loop {
            let n = f.read(&mut buf).unwrap();
            if n == 0 {
                break;
            }
            sha.update(&buf[..n]);
        }
        format!("{:x}", sha.finalize())
    }
    fn git(repo: &Path, work: Option<&Path>, args: &[&str]) -> Vec<u8> {
        let mut cmd = Command::new("git");
        for k in [
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_INDEX_FILE",
            "GIT_COMMON_DIR",
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
            "GIT_CONFIG",
            "GIT_CONFIG_PARAMETERS",
            "GIT_CONFIG_COUNT",
        ] {
            cmd.env_remove(k);
        }
        cmd.env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_AUTHOR_NAME", "AgentCV transfer verification")
            .env("GIT_AUTHOR_EMAIL", "transfer@local.invalid")
            .env("GIT_COMMITTER_NAME", "AgentCV transfer verification")
            .env("GIT_COMMITTER_EMAIL", "transfer@local.invalid")
            .args(["-c", "core.hooksPath=/dev/null", "--git-dir"])
            .arg(repo);
        if let Some(work) = work {
            cmd.arg("--work-tree").arg(work).current_dir(work);
        }
        let o = cmd.args(args).output().unwrap();
        assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
        o.stdout
    }
    fn large_project(base: &Path) -> (PathBuf, String, Vec<u8>) {
        let source = base.join("source");
        fs::create_dir(&source).unwrap();
        fs::create_dir(source.join("assets")).unwrap();
        let large = source.join("large-input.tmp");
        let mut f = File::create(&large).unwrap();
        let buffer: Vec<u8> = (0..64 * 1024)
            .map(|i| ((i * 37 + 11) % 251) as u8)
            .collect();
        for _ in 0..513 {
            f.write_all(&buffer).unwrap();
        }
        f.sync_all().unwrap();
        drop(f);
        let hash = hash_file(&large);
        let relative = format!("assets/{hash}.bin");
        fs::rename(&large, source.join(&relative)).unwrap();
        let size = fs::metadata(source.join(&relative)).unwrap().len();
        let manifest = serde_json::json!({"schema":"agentcv-workspace-1","project":{"schema":"agentcv-workspace-0.9","images":[],"workflow":{"references":[{"name":"large camera capture data","dataURL":{"$asset":relative,"sha256":hash,"size":size,"mime":"application/octet-stream"}}]}}});
        fs::write(
            source.join("manifest.agentcv.json"),
            serde_json::to_vec_pretty(&manifest).unwrap(),
        )
        .unwrap();
        let repo = source.join(HISTORY);
        let init = Command::new("git")
            .args([
                "-c",
                "init.defaultBranch=agentcv",
                "init",
                "--bare",
                "--template=",
            ])
            .arg(&repo)
            .output()
            .unwrap();
        assert!(init.status.success());
        let config = fs::read(repo.join("config")).unwrap();
        fs::write(repo.join("agentcv-owner.json"),serde_json::to_vec(&serde_json::json!({"schema":"agentcv-isolated-git-1","configSha256":format!("{:x}",Sha256::digest(config))})).unwrap()).unwrap();
        let pointer = git_lfs_storage::store(&repo, &source.join(&relative)).unwrap();
        let work = base.join("git-work");
        fs::create_dir(&work).unwrap();
        fs::create_dir(work.join("assets")).unwrap();
        fs::copy(
            source.join("manifest.agentcv.json"),
            work.join("manifest.agentcv.json"),
        )
        .unwrap();
        fs::write(work.join(&relative), &pointer).unwrap();
        fs::write(
            work.join(".gitattributes"),
            "assets/** filter=lfs diff=lfs merge=lfs -text\n",
        )
        .unwrap();
        git(&repo, Some(&work), &["add", "--all", "--", "."]);
        let tree = String::from_utf8(git(&repo, Some(&work), &["write-tree"])).unwrap();
        let commit = String::from_utf8(git(
            &repo,
            None,
            &[
                "commit-tree",
                tree.trim(),
                "-m",
                "real streamed LFS transfer verification",
            ],
        ))
        .unwrap();
        git(
            &repo,
            None,
            &["update-ref", "refs/heads/agentcv", commit.trim()],
        );
        (source, relative, pointer)
    }
    #[test]
    fn real_large_lfs_project_moves_offline_and_restores_after_source_is_removed() {
        let temp = Temp::new();
        let (source, relative, pointer) = large_project(&temp.0);
        // This second object is referenced only by a detached tagged commit, not the current manifest/head.
        let historical = temp.0.join("tag-only-input.txt");
        fs::write(&historical, "historical trial held only by a tag").unwrap();
        let repo = source.join(HISTORY);
        let tag_pointer = git_lfs_storage::store(&repo, &historical).unwrap();
        let descriptor = git_lfs_storage::descriptor(&tag_pointer).unwrap();
        let work = temp.0.join("git-work");
        fs::remove_file(work.join(&relative)).unwrap();
        small_snapshot(&work, "historical trial held only by a tag");
        fs::write(
            work.join(format!("assets/{}.txt", descriptor.oid)),
            &tag_pointer,
        )
        .unwrap();
        git(&repo, Some(&work), &["add", "--all", "--", "."]);
        let tree = String::from_utf8(git(&repo, Some(&work), &["write-tree"])).unwrap();
        let commit = String::from_utf8(git(
            &repo,
            None,
            &[
                "commit-tree",
                tree.trim(),
                "-m",
                "tag-only historical trial",
            ],
        ))
        .unwrap();
        git(
            &repo,
            None,
            &["update-ref", "refs/tags/detached-trial", commit.trim()],
        );
        fs::write(
            source.join("unrelated-private-note"),
            "must not be exported",
        )
        .unwrap();
        let package = temp.0.join("package");
        let report = export_project(&source, &package).unwrap();
        assert_eq!(report.assets, 1);
        assert!(report.history_included);
        assert!(report.bytes > 64 * 1024 * 1024);
        assert!(!package.join("unrelated-private-note").exists());
        let expected = hash_file(&source.join(&relative));
        fs::remove_dir_all(&source).unwrap();
        let imported = temp.0.join("imported");
        import_project(&package, &imported).unwrap();
        assert_eq!(hash_file(&imported.join(&relative)), expected);
        let restored = temp.0.join("restored-large.bin");
        git_lfs_storage::materialize(&imported.join(HISTORY), &pointer, &restored).unwrap();
        assert_eq!(hash_file(&restored), expected);
        let tagged = temp.0.join("tag-restored.txt");
        git_lfs_storage::materialize(&imported.join(HISTORY), &tag_pointer, &tagged).unwrap();
        assert_eq!(
            fs::read_to_string(tagged).unwrap(),
            "historical trial held only by a tag"
        );
        assert_eq!(
            String::from_utf8(git(
                &imported.join(HISTORY),
                None,
                &["rev-parse", "refs/tags/detached-trial"]
            ))
            .unwrap(),
            commit
        );
        crate::git_workspace::validate_complete_history(&imported).unwrap();
    }
    #[test]
    fn missing_lfs_refuses_complete_export_without_partial_target() {
        let temp = Temp::new();
        let (source, _, pointer) = large_project(&temp.0);
        let desc = git_lfs_storage::descriptor(&pointer).unwrap();
        let object = git_lfs_storage::object_path(&source.join(HISTORY), &desc).unwrap();
        fs::remove_file(object).unwrap();
        let dest = temp.0.join("broken-export");
        assert!(export_project(&source, &dest).is_err());
        assert!(!dest.exists());
        assert!(source.join("manifest.agentcv.json").exists());
    }
    #[test]
    fn refuses_traversal_symlinks_and_nonempty_destination() {
        let temp = Temp::new();
        let root = temp.0.join("unsafe");
        fs::create_dir(&root).unwrap();
        let manifest = serde_json::json!({"schema":"agentcv-workspace-1","project":{"images":[],"bad":{"$asset":"assets/../../outside","sha256":"a".repeat(64),"size":1,"mime":"text/plain"}}});
        fs::write(
            root.join("manifest.agentcv.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        assert!(export_project(&root, &temp.0.join("dest")).is_err());
        assert!(!temp.0.join("dest").exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let symlink_root = temp.0.join("linked");
            symlink(&root, &symlink_root).unwrap();
            assert!(export_project(&symlink_root, &temp.0.join("linked-export")).is_err());
        }
        let dest = temp.0.join("existing");
        fs::create_dir(&dest).unwrap();
        fs::write(dest.join("user-file"), "keep").unwrap();
        assert!(export_project(&root, &dest).is_err());
        assert_eq!(fs::read_to_string(dest.join("user-file")).unwrap(), "keep");
    }
    #[test]
    fn attaching_history_is_atomic_preserves_project_files_and_refuses_different_refs() {
        let temp = Temp::new();
        let (source, _, _) = large_project(&temp.0);
        let target = temp.0.join("saved-project");
        fs::create_dir(&target).unwrap();
        fs::write(target.join("user-file"), "keep").unwrap();
        let first = attach_history(&source, &target).unwrap();
        assert!(first.history_included);
        assert_eq!(
            fs::read_to_string(target.join("user-file")).unwrap(),
            "keep"
        );
        assert_eq!(attach_history(&source, &target).unwrap().bytes, 0);
        let repo = target.join(HISTORY);
        let head =
            String::from_utf8(git(&repo, None, &["rev-parse", "refs/heads/agentcv"])).unwrap();
        git(
            &repo,
            None,
            &["update-ref", "refs/tags/local-only", head.trim()],
        );
        assert!(attach_history(&source, &target).is_err());
        assert_eq!(
            fs::read_to_string(target.join("user-file")).unwrap(),
            "keep"
        );
    }
    fn small_snapshot(root: &Path, content: &str) {
        fs::create_dir_all(root.join("assets")).unwrap();
        let hash = format!("{:x}", Sha256::digest(content.as_bytes()));
        let relative = format!("assets/{hash}.txt");
        fs::write(root.join(&relative), content).unwrap();
        fs::write(root.join("manifest.agentcv.json"),serde_json::to_vec(&serde_json::json!({"schema":"agentcv-workspace-1","project":{"schema":"agentcv-workspace-0.9","images":[],"workflow":{"references":[{"name":"operator notes","dataURL":{"$asset":relative,"sha256":hash,"size":content.len(),"mime":"text/plain"}}]}}})).unwrap()).unwrap();
    }
    fn add_pending(root: &Path, name: &str, content: &str) {
        let trial = root.join(PENDING).join(name);
        small_snapshot(&trial, content);
        fs::write(trial.join("pending.json"),serde_json::to_vec(&serde_json::json!({"schema":"agentcv-pending-trial-1","message":"fixed real trial","kind":"trial","runId":"run-local-1"})).unwrap()).unwrap();
    }
    #[test]
    fn pending_only_history_attaches_and_round_trips_without_overwriting() {
        let temp = Temp::new();
        let source = temp.0.join("source");
        small_snapshot(&source, "current saved notes");
        add_pending(&source, "trial-one", "fixed pending input");
        let target = temp.0.join("target");
        small_snapshot(&target, "different current notes");
        add_pending(&target, "trial-existing", "prior notes");
        let attached = attach_history(&source, &target).unwrap();
        assert!(attached.history_included);
        assert!(target
            .join(PENDING)
            .join("trial-one/pending.json")
            .is_file());
        assert!(target
            .join(PENDING)
            .join("trial-existing/pending.json")
            .is_file());
        assert_eq!(attach_history(&source, &target).unwrap().bytes, 0);
        let package = temp.0.join("package");
        export_project(&source, &package).unwrap();
        fs::remove_dir_all(&source).unwrap();
        let imported = temp.0.join("imported");
        import_project(&package, &imported).unwrap();
        assert_eq!(
            pending_trials(&package).unwrap(),
            pending_trials(&imported).unwrap()
        );
        let conflicting = temp.0.join("conflicting");
        small_snapshot(&conflicting, "notes");
        add_pending(&conflicting, "trial-one", "different fixed input");
        assert!(attach_history(&conflicting, &target).is_err());
        assert!(target
            .join(PENDING)
            .join("trial-existing/pending.json")
            .is_file());
    }
    #[test]
    fn export_current_uses_unsaved_snapshot_and_original_pending_without_copying_unrelated_files() {
        let temp = Temp::new();
        let history = temp.0.join("history");
        small_snapshot(&history, "old saved notes");
        add_pending(&history, "trial-fixed", "previous trial input");
        let current = temp.0.join("current");
        small_snapshot(&current, "new unsaved notes");
        fs::write(current.join("unrelated"), "exclude").unwrap();
        let exported = temp.0.join("exported");
        export_current_project(&history, &current, &exported).unwrap();
        assert_eq!(
            fs::read(current.join("manifest.agentcv.json")).unwrap(),
            fs::read(exported.join("manifest.agentcv.json")).unwrap()
        );
        assert!(exported
            .join(PENDING)
            .join("trial-fixed/pending.json")
            .is_file());
        assert!(!exported.join("unrelated").exists());
    }
    #[test]
    fn invalid_or_symlinked_pending_refuses_export_without_partial_target() {
        let temp = Temp::new();
        let source = temp.0.join("source");
        small_snapshot(&source, "notes");
        add_pending(&source, "trial-bad", "fixed input");
        let trial = source.join(PENDING).join("trial-bad");
        fs::write(trial.join("pending.json"), "{\"schema\":\"wrong\"}").unwrap();
        let target = temp.0.join("target");
        assert!(export_project(&source, &target).is_err());
        assert!(!target.exists());
        #[cfg(unix)]
        {
            fs::remove_dir_all(&trial).unwrap();
            std::os::unix::fs::symlink(&source, &trial).unwrap();
            assert!(export_project(&source, &target).is_err());
            assert!(!target.exists());
        }
    }
}
