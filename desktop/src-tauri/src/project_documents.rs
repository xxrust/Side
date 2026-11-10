//! One document entry point for packages, existing manifests and legacy JSON.
use serde_json::{json, Value};
use std::{collections::VecDeque, fs, path::{Path, PathBuf}, sync::Mutex};

const MAX_DOCUMENT: u64 = 220 * 1024 * 1024;
#[derive(Default)]
pub struct PendingDocuments(pub Mutex<VecDeque<String>>);
impl PendingDocuments {
    pub fn push(&self, path: PathBuf) {
        if let Ok(mut paths) = self.0.lock() {
            let path = path.to_string_lossy().into_owned();
            if !paths.contains(&path) { paths.push_back(path); }
        }
    }
}

pub(crate) fn read_document(path: &Path) -> Result<Value, String> {
    let selected = path.canonicalize().map_err(|_| "找不到所選專案，請確認檔案仍在原位置")?;
    if selected.is_dir() {
        let content = crate::workspace::read_workspace_lazy(&selected)?;
        return Ok(json!({"content":content,"path":selected,"documentPath":selected}));
    }
    if fs::metadata(&selected).map_err(|_| "無法讀取專案檔案")?.len() > MAX_DOCUMENT {
        return Err("專案清單超過 220 MB".into());
    }
    let content = fs::read_to_string(&selected).map_err(|_| "專案不是 UTF-8 文字")?;
    let value: Value = serde_json::from_str(&content).map_err(|_| "專案不是有效 JSON")?;
    if value.get("schema").and_then(Value::as_str) == Some("agentcv-workspace-1") {
        if selected.file_name().and_then(|s|s.to_str()) != Some("manifest.agentcv.json") {
            return Err("這是專案清單；請保留 manifest.agentcv.json 名稱及同一專案內的 assets 資料夾".into());
        }
        let root = selected.parent().ok_or("專案清單缺少來源目錄")?;
        return Ok(json!({"content":crate::workspace::read_workspace_lazy(root)?,"path":root,"documentPath":selected}));
    }
    if !value.get("images").is_some_and(Value::is_array) {
        return Err("所選檔案不是 AgentCV 專案；請選 .agentcv 專案或 manifest.agentcv.json".into());
    }
    Ok(json!({"content":content,"path":Value::Null,"documentPath":selected}))
}

pub(crate) fn save_document(path: &Path, content: &str) -> Result<String, String> {
    if !path.is_absolute() { return Err("專案必須使用完整路徑".into()); }
    if path.exists() {
        if !path.is_dir() { return Err("同名位置是檔案；請使用另一個專案名稱".into()); }
        if !path.join("manifest.agentcv.json").is_file()
            && fs::read_dir(path).map_err(|_| "無法核對保存位置")?.next().is_some() {
            return Err("此位置已有其他內容，請使用新的專案名稱".into());
        }
    }
    fs::create_dir_all(path).map_err(|_| "無法建立專案")?;
    crate::workspace::write_workspace(path, content)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn open_project_document(path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || read_document(Path::new(&path)))
        .await.map_err(|_| "專案讀取工作中止")?
}
#[tauri::command]
pub fn take_project_open(state: tauri::State<PendingDocuments>) -> Option<String> {
    state.0.lock().ok()?.pop_front()
}
#[tauri::command]
pub async fn save_project_document(content: String, path: Option<String>) -> Result<Option<String>, String> {
    let _save_in_progress = crate::workspace::SaveInProgress::begin();
    let target = if let Some(path) = path { PathBuf::from(path) } else {
        let Some(file) = rfd::AsyncFileDialog::new().set_title("保存 AgentCV 專案")
            .set_file_name("未命名.agentcv").add_filter("AgentCV 專案", &["agentcv"])
            .save_file().await else { return Ok(None); };
        let mut path = file.path().to_path_buf();
        if path.extension().and_then(|s|s.to_str()) != Some("agentcv") {
            path.set_file_name(format!("{}.agentcv",path.file_name().unwrap_or_default().to_string_lossy()));
        }
        path
    };
    tauri::async_runtime::spawn_blocking(move || save_document(&target,&content).map(Some))
        .await.map_err(|_| "專案保存工作中止")?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64,Ordering};
    static SERIAL: AtomicU64=AtomicU64::new(0);
    struct Temp(PathBuf);
    impl Temp {fn new()->Self {let p=std::env::temp_dir().join(format!("agentcv-document-{}-{}",std::process::id(),SERIAL.fetch_add(1,Ordering::Relaxed)));fs::create_dir_all(&p).unwrap();Self(p)}}
    impl Drop for Temp {fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}
    #[test]
    fn package_and_manifest_share_lazy_asset_open_and_survive_move() {
        let t=Temp::new();let root=t.0.join("工件.agentcv");
        let image=include_bytes!("../../../research/opencv-traditional-10-2026-10-25/assets/box.png");
        use base64::Engine;
        let project=json!({"schema":"agentcv-workspace-0.9","images":[{"id":"box","dataURL":format!("data:image/png;base64,{}",base64::engine::general_purpose::STANDARD.encode(image))}]});
        save_document(&root,&project.to_string()).unwrap();
        let package=read_document(&root).unwrap();let manifest=read_document(&root.join("manifest.agentcv.json")).unwrap();
        assert_eq!(package["content"],manifest["content"]);assert_eq!(package["path"],manifest["path"]);
        let loaded:Value=serde_json::from_str(package["content"].as_str().unwrap()).unwrap();
        assert!(loaded["images"][0]["dataURL"].as_str().is_none_or(|s|s.is_empty()));
        let reference=&loaded["images"][0]["assetRef"];
        assert_eq!(crate::workspace::read_workspace_asset_bytes(&root,reference).unwrap(),image);
        let moved=t.0.join("搬移後.agentcv");fs::rename(&root,&moved).unwrap();
        let reread:Value=serde_json::from_str(read_document(&moved).unwrap()["content"].as_str().unwrap()).unwrap();
        assert_eq!(reread["images"][0]["assetRef"]["root"],moved.canonicalize().unwrap().to_string_lossy().as_ref());
        assert_eq!(crate::workspace::read_workspace_asset_bytes(&moved,&reread["images"][0]["assetRef"]).unwrap(),image);
    }
    #[test]
    fn legacy_json_loads_and_invalid_files_do_not_overwrite_other_content() {
        let t=Temp::new();let file=t.0.join("legacy.json");
        fs::write(&file,r#"{"schema":"agentcv-desktop-0.8","images":[]}"#).unwrap();
        assert!(read_document(&file).unwrap()["path"].is_null());
        fs::write(&file,"{}").unwrap();assert!(read_document(&file).unwrap_err().contains("不是 AgentCV 專案"));
        assert!(save_document(&t.0,"{}").is_err());assert!(save_document(&file,"{}").is_err());
        assert_eq!(fs::read_to_string(file).unwrap(),"{}");
    }
}
