use serde_json::Value;
use std::{collections::BTreeMap,io::Write,process::Stdio,sync::{Mutex,OnceLock},time::{SystemTime,UNIX_EPOCH}};
use tauri::Manager;
use sha2::{Digest,Sha256};
static DOCUMENTS:OnceLock<Mutex<BTreeMap<String,String>>>=OnceLock::new();
fn validate_article(document:&str)->Result<(),String>{
 if document.len()>2*1024*1024||!document.trim_start().to_ascii_lowercase().starts_with("<!doctype html>"){return Err("節點文章須為2MB以內的完整HTML".into())}Ok(())
}
#[tauri::command]
pub fn open_node_article(app:tauri::AppHandle,document:String,print:bool)->Result<String,String>{
 validate_article(&document)?;
 let dir=app.path().app_cache_dir().map_err(|e|e.to_string())?.join("node-article");
 std::fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
 let file=dir.join(if print{"print.html"}else{"index.html"});
 super::workspace::atomic_write(&file,document.as_bytes())?;
 super::workspace::launch(&file)?;Ok(file.to_string_lossy().into_owned())
}
#[tauri::command]
pub async fn save_node_article(document:String)->Result<Option<String>,String>{
 validate_article(&document)?;
 let Some(file)=rfd::AsyncFileDialog::new().set_title("匯出節點文章").add_filter("HTML文章",&["html"]).set_file_name("node-article.html").save_file().await else{return Ok(None)};
 super::workspace::atomic_write(file.path(),document.as_bytes())?;Ok(Some(file.path().to_string_lossy().into_owned()))
}
const CSP:&str="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts";
#[tauri::command]
pub fn create_visual_preview(document:String)->Result<Value,String>{
 if document.len()>2*1024*1024||document.trim().is_empty(){return Err("圖解文件須為2MB以內的非空HTML".into())}
 let token=format!("{:x}",Sha256::digest(format!("{:?}:{}:{}",SystemTime::now().duration_since(UNIX_EPOCH),std::process::id(),document)));
 let mut docs=DOCUMENTS.get_or_init(Default::default).lock().map_err(|_|"圖解服務忙碌")?;
 if docs.len()>=16 {return Err("同時開啟的圖解過多，請先關閉預覽".into())}docs.insert(token.clone(),document);
 let url=if cfg!(target_os="windows")||cfg!(target_os="android"){format!("http://agentcv-preview.localhost/{token}")}else{format!("agentcv-preview://localhost/{token}")};
 Ok(serde_json::json!({"url":url,"id":token}))
}
#[tauri::command]
pub fn release_visual_preview(id:String)->Result<(),String>{if let Some(d)=DOCUMENTS.get(){d.lock().map_err(|_|"圖解服務忙碌")?.remove(&id);}Ok(())}
pub fn preview_response(request:tauri::http::Request<Vec<u8>>)->tauri::http::Response<Vec<u8>>{
 let id=request.uri().path().trim_start_matches('/');let text=if request.method()==tauri::http::Method::GET && id.len()==64 && id.bytes().all(|b|b.is_ascii_hexdigit()){DOCUMENTS.get().and_then(|d|d.lock().ok()?.get(id).cloned())}else{None};
 tauri::http::Response::builder().status(if text.is_some(){200}else{404}).header("Content-Type","text/html; charset=utf-8").header("Content-Security-Policy",CSP).header("X-Content-Type-Options","nosniff").header("Cache-Control","no-store").body(text.unwrap_or_else(||"圖解已關閉，請重新開啟。".into()).into_bytes()).unwrap()
}
fn library(app:&tauri::AppHandle,mode:&str,request:Value)->Result<Value,String>{
 let root=app.path().app_data_dir().map_err(|e|e.to_string())?.join("visual-library");
 let mut cmd=super::agent_command(app,"visual-asset-library.mjs")?;
 cmd.arg(mode).env("AGENTCV_ASSET_LIBRARY_DIR",root).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
 let bytes=serde_json::to_vec(&request).map_err(|e|e.to_string())?;if bytes.len()>24*1024*1024{return Err("資產請求超過24MB".into())}
 let mut child=cmd.spawn().map_err(|e|e.to_string())?;child.stdin.take().ok_or("資產庫輸入不可用")?.write_all(&bytes).map_err(|e|e.to_string())?;
 let out=child.wait_with_output().map_err(|e|e.to_string())?;if !out.status.success(){return Err(String::from_utf8_lossy(&out.stderr).chars().take(4000).collect())}serde_json::from_slice(&out.stdout).map_err(|e|e.to_string())
}
#[tauri::command]
pub async fn visual_asset_library_save(app:tauri::AppHandle,request:Value)->Result<Value,String>{tauri::async_runtime::spawn_blocking(move||library(&app,"--save",request)).await.map_err(|e|e.to_string())?}
#[tauri::command]
pub async fn visual_asset_library_search(app:tauri::AppHandle,request:Value)->Result<Value,String>{tauri::async_runtime::spawn_blocking(move||library(&app,"--search",request)).await.map_err(|e|e.to_string())?}
#[tauri::command]
pub async fn visual_asset_library_get(app:tauri::AppHandle,request:Value)->Result<Value,String>{tauri::async_runtime::spawn_blocking(move||library(&app,"--get",request)).await.map_err(|e|e.to_string())?}
