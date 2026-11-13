//! Recovery state is separate from a user's saved workspace. It is never used
//! to overwrite an imported project or interpreted as a formal project save.
use serde::Serialize;
use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, Mutex},
};
use tauri::Manager;

const MAX_SESSION_BYTES: usize = 256 * 1024 * 1024;
const MAX_UI_BYTES: usize = 1024 * 1024;
static IO_LOCK: Mutex<()> = Mutex::new(());
static ACTIVE_WRITES: AtomicUsize = AtomicUsize::new(0);
static NEXT_FILE: AtomicUsize = AtomicUsize::new(0);
static EXIT_APPROVED: AtomicBool = AtomicBool::new(false);
struct ActiveWrite;
impl ActiveWrite {
    fn begin() -> Self { ACTIVE_WRITES.fetch_add(1, Ordering::AcqRel); Self }
}
impl Drop for ActiveWrite {
    fn drop(&mut self) { ACTIVE_WRITES.fetch_sub(1, Ordering::AcqRel); }
}
pub fn is_saving() -> bool { ACTIVE_WRITES.load(Ordering::Acquire) > 0 }
pub fn exit_approved() -> bool { EXIT_APPROVED.load(Ordering::Acquire) }
pub fn revoke_exit() { EXIT_APPROVED.store(false, Ordering::Release); }

#[tauri::command]
pub fn complete_app_exit(app: tauri::AppHandle) -> Result<(), String> {
    if is_saving() || crate::workspace::is_saving() || crate::inspection_archive::has_unfinished() {
        revoke_exit();
        return Err("專案或工作階段仍在保存，尚未退出；請等待保存完成。".into());
    }
    EXIT_APPROVED.store(true, Ordering::Release);
    app.exit(0);
    Ok(())
}

#[derive(Serialize)]
pub struct SessionReceipt {
    path: String,
    bytes: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    warning: Option<String>,
}

fn validate(content: &str) -> Result<(), String> {
    if content.len() > MAX_SESSION_BYTES { return Err("恢復資料超過 256 MB，未覆蓋上次恢復檔。".into()); }
    let value: Value = serde_json::from_str(content).map_err(|error| format!("恢復資料不是有效 JSON：{error}"))?;
    if value.get("schema").and_then(Value::as_str) != Some("agentcv-app-session-1") {
        return Err("恢復資料版本不受支援；原檔已保留。".into());
    }
    let has_project = match value.get("project") {
        Some(project) if project.is_object() => {
            if !matches!(project.get("schema").and_then(Value::as_str), Some("agentcv-workspace-0.9" | "agentcv-desktop-0.8")) || !project.get("images").is_some_and(Value::is_array) {
                return Err("恢復資料的專案格式無效；未當作空專案載入。".into());
            }
            true
        }
        Some(project) if project.is_null() => false,
        None => false,
        Some(_) => return Err("恢復資料的專案格式無效；未當作空專案載入。".into()),
    };
    if !has_project && !value.get("projectPath").and_then(Value::as_str).is_some_and(|path| !path.is_empty()) {
        return Err("恢復資料缺少專案內容或專案路徑。".into());
    }
    let ui = value.get("ui").filter(|item| item.is_object()).ok_or("恢復資料缺少界面狀態。")?;
    if serde_json::to_vec(ui).map_err(|error| error.to_string())?.len() > MAX_UI_BYTES { return Err("界面恢復資料超過 1 MB。".into()); }
    if value.get("projectPath").is_some_and(|item| !item.is_null() && (!item.is_string() || item.as_str().unwrap_or("").len() > 8192)) {
        return Err("上次專案路徑格式無效。".into());
    }
    Ok(())
}

fn location(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| format!("無法取得應用程式資料目錄：{error}"))?.join("session").join("last-session.json"))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("恢復檔路徑無效。")?;
    fs::create_dir_all(parent).map_err(|error| format!("無法建立恢復檔目錄 {}：{error}", parent.display()))?;
    let temporary = parent.join(format!(".session-{}-{}.tmp", std::process::id(), NEXT_FILE.fetch_add(1, Ordering::AcqRel)));
    let result = (|| {
        let mut options = OpenOptions::new(); options.write(true).create_new(true);
        #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
        let mut file = options.open(&temporary).map_err(|error| format!("無法建立暫存恢復檔：{error}"))?;
        file.write_all(bytes).map_err(|error| format!("寫入恢復檔失敗：{error}"))?;
        file.sync_all().map_err(|error| format!("同步恢復檔失敗：{error}"))?;
        drop(file);
        fs::rename(&temporary, path).map_err(|error| format!("更新恢復檔 {} 失敗，先前檔案仍保留：{error}", path.display()))?;
        #[cfg(unix)] { fs::File::open(parent).and_then(|directory| directory.sync_all()).map_err(|error| format!("同步恢復目錄失敗：{error}"))?; }
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

fn save_at(path: &Path, content: &str) -> Result<SessionReceipt, String> {
    validate(content)?;
    let _active = ActiveWrite::begin();
    let _lock = IO_LOCK.lock().map_err(|_| "恢復資料存取鎖失效。")?;
    // A caller may resume saving only after explicitly opening/creating a new
    // project following a failed restore. Preserve damaged bytes first instead
    // of permanently preventing all later session saves.
    let warning = if path.exists() {
        match read_at_unlocked(path) {
            Ok(Some(previous)) => { atomic_write(&path.with_file_name("previous-session.json"), previous.as_bytes())?; None }
            Ok(None) => return Err("先前恢復檔讀取期間消失。".into()),
            Err(error) => {
                let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|error| error.to_string())?.as_nanos();
                let preserved = path.with_file_name(format!("corrupt-session-{timestamp}-{}.json", NEXT_FILE.fetch_add(1, Ordering::AcqRel)));
                let mut source = fs::File::open(path).map_err(|error| format!("無法保留損壞恢復檔，未覆蓋原檔：{error}"))?;
                let mut options = OpenOptions::new(); options.write(true).create_new(true);
                #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
                let mut target = options.open(&preserved).map_err(|error| format!("無法建立損壞恢復檔副本，未覆蓋原檔：{error}"))?;
                std::io::copy(&mut source, &mut target).map_err(|error| format!("損壞恢復檔備份失敗，未覆蓋原檔：{error}"))?;
                target.sync_all().map_err(|error| format!("損壞恢復檔備份同步失敗，未覆蓋原檔：{error}"))?;
                Some(format!("先前恢復資料無法載入，原始內容已保留至 {}。{error}", preserved.display()))
            }
        }
    } else { None };
    atomic_write(path, content.as_bytes())?;
    Ok(SessionReceipt { path: path.to_string_lossy().into_owned(), bytes: content.len(), warning })
}

fn read_at_unlocked(path: &Path) -> Result<Option<String>, String> {
    let metadata = match fs::metadata(path) { Ok(metadata) => metadata, Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None), Err(error) => return Err(format!("無法讀取恢復檔 {}：{error}", path.display())) };
    if metadata.len() > MAX_SESSION_BYTES as u64 { return Err(format!("恢復檔 {} 超過 256 MB，原檔已保留。", path.display())); }
    let content = fs::read_to_string(path).map_err(|error| format!("恢復檔 {} 無法讀取為 UTF-8，原檔已保留：{error}", path.display()))?;
    validate(&content).map_err(|error| format!("無法恢復 {}：{error} 原檔未刪除。", path.display()))?;
    Ok(Some(content))
}

#[tauri::command]
pub async fn read_app_session(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = location(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = IO_LOCK.lock().map_err(|_| "恢復資料存取鎖失效。")?;
        read_at_unlocked(&path)
    }).await.map_err(|error| format!("讀取恢復資料工作失敗：{error}"))?
}

#[tauri::command]
pub async fn write_app_session(app: tauri::AppHandle, content: String) -> Result<SessionReceipt, String> {
    let path = location(&app)?;
    // Count queued work as well as an active disk write, so a native quit cannot
    // slip between dispatch and the blocking worker beginning its atomic save.
    let _pending = ActiveWrite::begin();
    tauri::async_runtime::spawn_blocking(move || save_at(&path, &content)).await.map_err(|error| format!("保存恢復資料工作失敗：{error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use base64::{engine::general_purpose::STANDARD, Engine};
    fn folder() -> PathBuf {
        let path = std::env::temp_dir().join(format!("agentcv-native-session-{}-{}", std::process::id(), NEXT_FILE.fetch_add(1, Ordering::AcqRel)));
        fs::create_dir_all(&path).unwrap(); path
    }
    fn snapshot(image: &str, board: &str) -> String {
        json!({"schema":"agentcv-app-session-1","project":{"schema":"agentcv-workspace-0.9","images":[{"id":"camera","dataURL":image}],"visualInquiry":{"boards":[{"id":board,"items":[{"assetId":"output"}]}]},"chat":[{"text":"保留問詢"}]},"ui":{"page":6,"boardId":board,"zoom":1.75,"pan":{"x":37,"y":91}},"projectPath":"/project/source.agentcv.json"}).to_string()
    }
    fn imported_image() -> String {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg");
        format!("data:image/jpeg;base64,{}", STANDARD.encode(fs::read(path).expect("real imported OpenCV sample")))
    }
    #[test]
    fn disk_roundtrip_preserves_full_project_pixels_interface_and_prior_snapshot() {
        let dir = folder(); let path = dir.join("last-session.json"); assert!(read_at_unlocked(&path).unwrap().is_none());
        let actual_image = imported_image(); let first = snapshot(&actual_image, "first");
        let receipt = save_at(&path, &first).unwrap(); assert_eq!(receipt.bytes, first.len()); assert_eq!(read_at_unlocked(&path).unwrap().unwrap(), first);
        let second = snapshot(&actual_image, "second"); save_at(&path, &second).unwrap();
        assert_eq!(read_at_unlocked(&path).unwrap().unwrap(), second); assert_eq!(fs::read_to_string(dir.join("previous-session.json")).unwrap(), first);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2); assert!(!is_saving()); fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn malformed_session_is_reported_and_preserved_before_an_explicit_new_session_save() {
        let dir = folder(); let path = dir.join("last-session.json"); fs::write(&path, b"{damaged-session").unwrap();
        let error = read_at_unlocked(&path).unwrap_err(); assert!(error.contains("原檔")); assert!(error.contains(&path.to_string_lossy().to_string()));
        assert_eq!(fs::read_to_string(&path).unwrap(), "{damaged-session", "read failures never change the original file");
        let new_session = snapshot(&imported_image(), "new-board"); let receipt = save_at(&path, &new_session).unwrap();
        let preserved = fs::read_dir(&dir).unwrap().map(|entry| entry.unwrap().path()).find(|file| file.file_name().unwrap().to_string_lossy().starts_with("corrupt-session-")).unwrap();
        assert_eq!(fs::read_to_string(&preserved).unwrap(), "{damaged-session"); assert!(receipt.warning.unwrap().contains(&preserved.to_string_lossy().to_string())); assert_eq!(read_at_unlocked(&path).unwrap().unwrap(), new_session); fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn invalid_proposed_session_cannot_replace_a_valid_previous_workspace() {
        let dir = folder(); let path = dir.join("last-session.json"); let original = snapshot("source-pixels", "board"); save_at(&path, &original).unwrap();
        for invalid in ["{}".to_string(), json!({"schema":"agentcv-app-session-1","project":{"schema":"other","images":[]},"ui":{}}).to_string(), json!({"schema":"agentcv-app-session-1","project":{"schema":"agentcv-workspace-0.9","images":[]},"ui":{},"projectPath":13}).to_string()] {
            assert!(save_at(&path, &invalid).is_err()); assert_eq!(fs::read_to_string(&path).unwrap(), original);
        }
        fs::remove_dir_all(dir).unwrap();
    }
}
