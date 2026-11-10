//! File-backed image datasets: bounded per-file indexing and on-demand bytes.
//! Paths are accepted only from a user file picker or a manifest-owned asset.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::{Path, PathBuf}};
use tauri::Manager;

const MAX_IMAGE_FILE: u64 = 128 * 1024 * 1024;
fn image_mime(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() { "png" => Some("image/png"), "jpg"|"jpeg"=>Some("image/jpeg"), "bmp"=>Some("image/bmp"), "webp"=>Some("image/webp"), _=>None }
}
fn relative_entry(root:&Path,path:&Path)->String{let mut relative=root.file_name().map(PathBuf::from).unwrap_or_default();let suffix=path.strip_prefix(root).unwrap_or(path);if !suffix.as_os_str().is_empty(){relative.push(suffix);}relative.to_string_lossy().replace('\\',"/")}
fn collect(path: &Path, root:&Path, out: &mut Vec<PathBuf>, entries:&mut Vec<Value>, depth: usize) -> Result<(), String> {
    if depth > 63 { return Err("圖片來源文件夾超過64層，請縮小選擇範圍".into()); }
    if entries.len()>=100000{return Err("單次匯入目錄超過10萬項，請分批匯入".into());}
    entries.push(json!({"path":relative_entry(root,path),"kind":"directory"}));
    for entry in fs::read_dir(path).map_err(|_| "無法讀取圖片文件夾")? {
        let entry=entry.map_err(|_| "無法讀取圖片目錄項")?;let kind=entry.file_type().map_err(|_| "無法讀取文件類型")?;
        if kind.is_symlink()||entry.file_name().to_string_lossy().starts_with('.') { continue; }
        if kind.is_dir() { collect(&entry.path(),root,out,entries,depth+1)?; }
        else if kind.is_file(){if entries.len()>=100000{return Err("單次匯入目錄超過10萬項，請分批匯入".into());}entries.push(json!({"path":relative_entry(root,&entry.path()),"kind":"file"}));if image_mime(&entry.path()).is_some(){out.push(entry.path());}}
    } Ok(())
}
fn dimensions(b: &[u8]) -> Option<(u32,u32)> {
    let u16be=|at:usize|->Option<u16>{Some(u16::from_be_bytes(b.get(at..at+2)?.try_into().ok()?))};
    let u32be=|at:usize|->Option<u32>{Some(u32::from_be_bytes(b.get(at..at+4)?.try_into().ok()?))};
    let u32le=|at:usize|->Option<u32>{Some(u32::from_le_bytes(b.get(at..at+4)?.try_into().ok()?))};
    let valid=|w:u32,h:u32| if w>0&&h>0&&(w as u64)*(h as u64)<=64_000_000 {Some((w,h))}else{None};
    if b.starts_with(b"\x89PNG\r\n\x1a\n") { return valid(u32be(16)?,u32be(20)?); }
    if b.starts_with(b"BM") { return valid((u32le(18)? as i32).unsigned_abs(),(u32le(22)? as i32).unsigned_abs()); }
    if b.get(0..4)==Some(b"RIFF") && b.get(8..12)==Some(b"WEBP") {
        if b.get(12..16)==Some(b"VP8X") && b.len()>=30 { return valid(1+b[24] as u32+((b[25] as u32)<<8)+((b[26] as u32)<<16),1+b[27] as u32+((b[28] as u32)<<8)+((b[29] as u32)<<16)); }
        if b.get(12..16)==Some(b"VP8 ") && b.get(23..26)==Some(b"\x9d\x01\x2a") { return valid(u16::from_le_bytes(b.get(26..28)?.try_into().ok()?) as u32&16383,u16::from_le_bytes(b.get(28..30)?.try_into().ok()?) as u32&16383); }
        if b.get(12..16)==Some(b"VP8L") && b.get(20)==Some(&47) { let bits=u32le(21)?;return valid((bits&16383)+1,((bits>>14)&16383)+1); }
    }
    if b.starts_with(b"\xff\xd8") {
        let mut at=2;let mut size=None;let mut orientation=1;
        while at+4<=b.len() {
            if b[at]!=255 {break;}at+=1;while at<b.len()&&b[at]==255 {at+=1;}let marker=*b.get(at)?;at+=1;
            if marker==217||marker==218 {break;}if marker==0||marker==1||(208..=215).contains(&marker){continue;}
            let length=u16be(at)? as usize;if length<2||at+length>b.len(){break;}
            if marker==225&&length>=16&&b.get(at+2..at+8)==Some(b"Exif\0\0") {
                let t=at+8;let little=b.get(t..t+2)==Some(b"II");
                let read16=|offset:usize|->Option<u16>{let raw:[u8;2]=b.get(offset..offset+2)?.try_into().ok()?;Some(if little{u16::from_le_bytes(raw)}else{u16::from_be_bytes(raw)})};
                let read32=|offset:usize|->Option<u32>{let raw:[u8;4]=b.get(offset..offset+4)?.try_into().ok()?;Some(if little{u32::from_le_bytes(raw)}else{u32::from_be_bytes(raw)})};
                if let Some(ifd)=read32(t+4).map(|offset|t+offset as usize) { if let Some(count)=read16(ifd) { for i in 0..count as usize {let e=ifd+2+i*12;if e+12>at+length{break;}if read16(e)==Some(0x112){orientation=read16(e+8).unwrap_or(1);break;}} } }
            }
            if [192,193,194,195,197,198,199,201,202,203,205,206,207].contains(&marker)&&length>=7 {size=Some((u16be(at+5)? as u32,u16be(at+3)? as u32));}at+=length;
        }
        if let Some((w,h))=size {return if [5,6,7,8].contains(&orientation){valid(h,w)}else{valid(w,h)};}
    }None
}
fn extension(mime:&str)->&'static str {match mime{"image/jpeg"=>"jpg","image/webp"=>"webp","image/bmp"=>"bmp",_=>"png"}}

pub(crate) fn index_dataset_files(root:&Path, paths:&[PathBuf], source_id:&str)->Result<Value,String>{
    fs::create_dir_all(root.join("assets")).map_err(|_|"無法建立圖像來源儲存")?;
    let canonical=root.canonicalize().map_err(|_|"無法定位圖像來源")?;let mut images=Vec::with_capacity(paths.len());
    for (index,path) in paths.iter().enumerate(){
        let metadata=fs::symlink_metadata(path).map_err(|_|format!("無法讀取圖片：{}",path.display()))?;
        if metadata.file_type().is_symlink()||!metadata.is_file(){return Err("圖像來源必須是一般檔案，不接受符號連結".into());}
        if metadata.len()==0||metadata.len()>MAX_IMAGE_FILE{return Err(format!("單張圖片超過目前128MB檔案預算：{}",path.display()));}
        let mime=image_mime(path).ok_or("不支援的圖像格式")?;
        let mut file=fs::File::open(path).map_err(|_|"圖片無法開啟")?;let mut header=vec![0u8;metadata.len().min(1024*1024) as usize];file.read_exact(&mut header).map_err(|_|"圖片標頭無法讀取")?;
        let (width,height)=dimensions(&header).ok_or_else(||format!("無法解析圖片尺寸或超過6400萬像素：{}",path.display()))?;
        // A single encoded file is the memory bound, independent of dataset size.
        let bytes=fs::read(path).map_err(|_|"無法讀取圖片原件")?;let digest=format!("{:x}",Sha256::digest(&bytes));let relative=format!("assets/{digest}.{}",extension(mime));let asset=canonical.join(&relative);
        if asset.exists(){let old=fs::read(&asset).map_err(|_|"無法核對圖像原件")?;if old!=bytes{return Err("圖像資產內容衝突".into());}}else{crate::workspace::atomic_write(&asset,&bytes)?;}
        images.push(json!({"id":format!("{source_id}:{index}"),"name":path.file_name().unwrap_or_default().to_string_lossy(),"sourcePath":path.to_string_lossy(),"sourceId":source_id,"width":width,"height":height,"contentSha256":digest,"assetRef":{"root":canonical.to_string_lossy(),"$asset":relative,"mime":mime,"sha256":digest,"size":bytes.len()},"dataUrl":""}));
    }
    let archived:Vec<Value>=images.iter().map(|image|json!({"id":image["id"],"name":image["name"],"width":image["width"],"height":image["height"],"objects":[],"contentSha256":image["contentSha256"],"dataURL":{"$asset":image["assetRef"]["$asset"],"mime":image["assetRef"]["mime"],"sha256":image["assetRef"]["sha256"],"size":image["assetRef"]["size"]}})).collect();
    let manifest=json!({"schema":"agentcv-workspace-1","project":{"schema":"agentcv-desktop-0.8","images":archived,"activeId":images.first().map(|image|image["id"].clone()),"config":{}}});
    crate::workspace::atomic_write(&canonical.join("manifest.agentcv.json"),&serde_json::to_vec(&manifest).map_err(|_|"無法保存圖像來源索引")?)?;
    Ok(json!({"schema":"agentcv-dataset-import-1","sourceId":source_id,"root":canonical.to_string_lossy(),"count":images.len(),"images":images}))
}

#[tauri::command]
pub async fn import_dataset_images(app:tauri::AppHandle,folder:bool)->Result<Value,String>{
    let dialog=rfd::AsyncFileDialog::new().set_title("導入圖像來源");let mut selected_root=None;let mut structure=vec![];let mut paths=if folder{if let Some(directory)=dialog.pick_folder().await{let mut out=vec![];collect(directory.path(),directory.path(),&mut out,&mut structure,0)?;selected_root=Some(directory.path().to_path_buf());out}else{return Ok(json!({"images":[],"count":0}));}}else{if let Some(files)=dialog.add_filter("圖片",&["png","jpg","jpeg","bmp","webp"]).pick_files().await{files.into_iter().map(|file|file.path().to_path_buf()).collect()}else{return Ok(json!({"images":[],"count":0}));}};
    paths.sort();if selected_root.is_none(){if let Some(first)=paths.first().and_then(|p|p.parent()){let mut common=first.to_path_buf();while paths.iter().any(|p|!p.starts_with(&common)){if !common.pop(){break;}}selected_root=Some(common);}}
    let source_id=format!("dataset-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|"系統時間無效")?.as_nanos());
    let root=app.path().app_data_dir().map_err(|_|"無法建立圖像來源目錄")?.join("image-sources").join(&source_id);
    tauri::async_runtime::spawn_blocking(move||{let result=index_dataset_files(&root,&paths,&source_id).map(|mut result|{if let Some(images)=result["images"].as_array_mut(){for (image,path) in images.iter_mut().zip(paths.iter()){let relative=selected_root.as_ref().and_then(|r|path.strip_prefix(r).ok().map(|p|r.file_name().map(|n|PathBuf::from(n).join(p)).unwrap_or_else(||p.to_path_buf()))).unwrap_or_else(||PathBuf::from(path.file_name().unwrap_or_default()));image["sourceRelativePath"]=json!(relative.to_string_lossy().replace('\\',"/"));}}result["fileStructure"]=json!(structure);result});if result.is_err(){let _=fs::remove_dir_all(&root);}result}).await.map_err(|_|"圖像來源索引服務失敗")?
}
#[tauri::command]
pub async fn read_workspace_asset(root:String,asset:Value)->Result<Value,String>{
    tauri::async_runtime::spawn_blocking(move||{let bytes=crate::workspace::read_workspace_asset_bytes(Path::new(&root),&asset)?;let mime=asset["mime"].as_str().ok_or("圖像類型缺失")?;if !mime.starts_with("image/"){return Err("此接口只讀取圖像資產".into());}Ok(json!({"dataUrl":format!("data:{mime};base64,{}",STANDARD.encode(&bytes)),"mime":mime,"sha256":asset["sha256"],"size":bytes.len()}))}).await.map_err(|_|"圖像來源讀取服務失敗")?
}
#[tauri::command]
pub async fn open_dataset_workspace(root:String)->Result<String,String>{
    tauri::async_runtime::spawn_blocking(move||crate::workspace::read_workspace_lazy(Path::new(&root))).await.map_err(|_|"圖像來源索引開啟失敗")?
}

#[cfg(test)]
mod tests{
 use super::*;
 fn temporary()->PathBuf{let path=std::env::temp_dir().join(format!("agentcv-dataset-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));fs::create_dir_all(&path).unwrap();path}
 #[test]
 fn source_tree_keeps_empty_folders_and_other_file_names_without_reading_contents(){
  let root=temporary();fs::create_dir(root.join("NG")).unwrap();fs::create_dir(root.join("empty")).unwrap();
  let fixture=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../research/opencv-traditional-10-2026-10-25/assets/box.png");fs::copy(fixture,root.join("NG/box.png")).unwrap();fs::write(root.join("notes.txt"),"File contents must not enter metadata").unwrap();fs::write(root.join(".private.txt"),"hidden").unwrap();
  let mut images=vec![];let mut entries=vec![];collect(&root,&root,&mut images,&mut entries,0).unwrap();assert_eq!(images.len(),1);assert_eq!(entries.len(),5,"root={:?}, entries={:?}",root,entries);assert_eq!(entries[0]["path"],root.file_name().unwrap().to_string_lossy().as_ref());assert!(entries.iter().all(|e|!e["path"].as_str().unwrap().ends_with('/')));let summary=json!(entries).to_string();assert!(summary.contains("empty"));assert!(summary.contains("notes.txt"));assert!(!summary.contains("File contents"));assert!(!summary.contains(".private"));assert!(!summary.contains(root.parent().unwrap().to_str().unwrap()));fs::remove_dir_all(root).unwrap();
 }
 #[test]
 fn actual_source_dataset_indexes_over_one_hundred_without_inline_pixels(){
  let root=temporary();let fixture=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../research/opencv-traditional-10-2026-10-25/assets/box.png");let original=fs::read(&fixture).unwrap();
  // Repeated original references measure capacity/dedup, not visual diversity.
  let result=index_dataset_files(&root,&vec![fixture;1001],"actual-file-capacity").unwrap();assert_eq!(result["count"],1001);assert!(!result.to_string().contains("base64"));assert_eq!(fs::read_dir(root.join("assets")).unwrap().count(),1);
  let pointer=&result["images"][0]["assetRef"];assert_eq!(crate::workspace::read_workspace_asset_bytes(&root,pointer).unwrap(),original);
  let lazy:Value=serde_json::from_str(&crate::workspace::read_workspace_lazy(&root).unwrap()).unwrap();assert_eq!(lazy["images"].as_array().unwrap().len(),1001);assert_eq!(lazy["images"][1000]["dataURL"],"");assert!(lazy["images"][1000]["assetRef"]["root"].is_string());
  let mut forged=pointer.clone();forged["$asset"]=json!("assets/../manifest.agentcv.json");assert!(crate::workspace::read_workspace_asset_bytes(&root,&forged).is_err());
  let destination=temporary();crate::workspace::write_workspace(&destination,&lazy.to_string()).unwrap();fs::remove_dir_all(&root).unwrap();let migrated:Value=serde_json::from_str(&crate::workspace::read_workspace_lazy(&destination).unwrap()).unwrap();assert_eq!(migrated["images"][0]["assetRef"]["root"],json!(destination.canonicalize().unwrap().to_string_lossy()));assert_eq!(crate::workspace::read_workspace_asset_bytes(&destination,&migrated["images"][0]["assetRef"]).unwrap(),original);fs::remove_dir_all(destination).unwrap();
 }
}
