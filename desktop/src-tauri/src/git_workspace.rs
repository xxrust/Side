//! Isolated project-owned Git history. No user Git index, worktree or config is modified.
use crate::workspace::{read_workspace, read_workspace_lazy, write_workspace};
use crate::git_lfs_storage as lfs;
use std::io::{Read,Write};
use std::process::Stdio;
use tauri::Manager;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::{BTreeSet,BTreeMap}, path::{Path,PathBuf}, process::{Command,Output}, sync::{Mutex,atomic::{AtomicU64,Ordering}}};

const HISTORY_DIR:&str=".agentcv-history.git";
const REF:&str="refs/heads/agentcv";
static HISTORY_LOCK:Mutex<()>=Mutex::new(());
static SERIAL:AtomicU64=AtomicU64::new(0);

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct VersionEntry{commit:String,created_at:String,message:String,kind:String,run_id:Option<String>,tags:Vec<String>}
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct VersionReceipt{commit:String,created:bool,message:String,kind:String,run_id:Option<String>}
struct Scratch(PathBuf);
impl Scratch{
 fn new()->Result<Self,String>{let base=std::env::temp_dir();for _ in 0..100{let p=base.join(format!("agentcv-git-{}-{}",std::process::id(),SERIAL.fetch_add(1,Ordering::Relaxed)));match std::fs::create_dir(&p){Ok(())=>return Ok(Self(p)),Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>continue,Err(_)=>return Err("無法建立版本暫存目錄".into())}}Err("無法建立唯一的版本暫存目錄".into())}
}
impl Drop for Scratch{fn drop(&mut self){let _=std::fs::remove_dir_all(&self.0);}}

fn project_root(path:&str)->Result<PathBuf,String>{
 let p=Path::new(path);if !p.is_absolute(){return Err("請先將專案保存至獨立的專案目錄".into())}
 let root=p.canonicalize().map_err(|_|"找不到專案目錄")?;if !root.is_dir(){return Err("專案路徑不是目錄".into())}
 Ok(root)
}
fn git_base()->Command{
 let mut c=crate::background_command::new("git");
 // Do not consume the user's Git settings, active index, hooks, filters or UI credentials.
 for key in ["GIT_DIR","GIT_WORK_TREE","GIT_INDEX_FILE","GIT_COMMON_DIR","GIT_OBJECT_DIRECTORY","GIT_ALTERNATE_OBJECT_DIRECTORIES","GIT_CONFIG","GIT_CONFIG_PARAMETERS","GIT_CONFIG_COUNT","GIT_TEMPLATE_DIR"]{c.env_remove(key);}
 c.env("GIT_CONFIG_NOSYSTEM","1").env("GIT_CONFIG_GLOBAL",if cfg!(windows){"NUL"}else{"/dev/null"}).env("GIT_TERMINAL_PROMPT","0")
  .env("GIT_AUTHOR_NAME","AgentCV").env("GIT_AUTHOR_EMAIL","agentcv@local.invalid")
  .env("GIT_COMMITTER_NAME","AgentCV").env("GIT_COMMITTER_EMAIL","agentcv@local.invalid")
  .args(["-c","core.hooksPath=/dev/null","-c","core.fsmonitor=false","-c","core.autocrlf=false","-c","core.safecrlf=false","-c","core.attributesFile=/dev/null","-c","commit.gpgSign=false"]);c
}
fn output(c:&mut Command)->Result<Output,String>{c.output().map_err(|e|if e.kind()==std::io::ErrorKind::NotFound{"找不到 Git，專案未建立版本；請安裝 Git 後重試".into()}else{format!("無法執行 Git：{e}")})}
fn checked(c:&mut Command,op:&str)->Result<Vec<u8>,String>{let o=output(c)?;if !o.status.success(){let e=String::from_utf8_lossy(&o.stderr);return Err(format!("{op}失敗：{}",e.trim().chars().take(500).collect::<String>()))}Ok(o.stdout)}
// Windows canonicalize returns verbatim paths. Git init accepts them, but
// Git's --git-dir parser rejects them as non-repositories. Keep the verified
// destination and translate only its path spelling for the external command.
pub(crate) fn git_path(path:&Path)->PathBuf{
 #[cfg(windows)] {
  use std::path::{Component,Prefix};
  let mut components=path.components();
  if let Some(Component::Prefix(prefix))=components.next(){
   let mut normal=match prefix.kind(){
    Prefix::VerbatimDisk(drive)=>PathBuf::from(format!("{}:",drive as char)),
    Prefix::VerbatimUNC(server,share)=>{let mut p=PathBuf::from(r"\\");p.push(server);p.push(share);p},
    _=>return path.to_owned(),
   };
   for component in components{normal.push(component.as_os_str());}
   return normal;
  }
 }
 path.to_owned()
}
fn git(repo:&Path)->Command{let mut c=git_base();c.arg("--git-dir").arg(git_path(repo));c}
fn config_hash(repo:&Path)->Result<String,String>{let path=repo.join("config");let meta=std::fs::symlink_metadata(&path).map_err(|_|"版本庫缺少設定")?;if !meta.is_file()||meta.file_type().is_symlink(){return Err("版本庫設定不安全".into())}let b=std::fs::read(path).map_err(|_|"無法讀取版本庫設定")?;Ok(format!("{:x}",Sha256::digest(&b)))}
fn validate_repo(repo:&Path)->Result<(),String>{
 let meta=std::fs::symlink_metadata(repo).map_err(|_|"專案尚未建立版本")?;
 if !meta.is_dir()||meta.file_type().is_symlink(){return Err("版本目錄不是安全的獨立倉庫".into())}
 let marker=repo.join("agentcv-owner.json");let m=std::fs::symlink_metadata(&marker).map_err(|_|"此 Git 目錄不是 AgentCV 管理的版本庫，未改動")?;if !m.is_file()||m.file_type().is_symlink(){return Err("版本庫標識不安全".into())}
 let v:Value=serde_json::from_slice(&std::fs::read(marker).map_err(|_|"版本庫標識無法讀取")?).map_err(|_|"版本庫標識格式錯誤")?;
 if v.get("schema").and_then(Value::as_str)!=Some("agentcv-isolated-git-1")||v.get("configSha256").and_then(Value::as_str)!=Some(config_hash(repo)?.as_str()){return Err("版本庫設定已變更，未執行 Git；請先檢查專案版本庫".into())}
 if std::fs::symlink_metadata(repo.join("info/attributes")).is_ok(){return Err("版本庫包含外部屬性設定，未執行 Git".into())}
 Ok(())
}
fn create_or_open(root:&Path)->Result<PathBuf,String>{
 let repo=root.join(HISTORY_DIR);
 match std::fs::create_dir(&repo){
  Ok(())=>{
   let created=(||{let mut c=git_base();c.args(["init","--bare","--initial-branch=agentcv","--template="]).arg(&repo);checked(&mut c,"建立專案版本庫")?;
    let mut config=git(&repo);config.args(["config","--local","lfs.repositoryformatversion","0"]);checked(&mut config,"設定本地 LFS 格式")?;let marker=serde_json::json!({"schema":"agentcv-isolated-git-1","configSha256":config_hash(&repo)?});std::fs::write(repo.join("agentcv-owner.json"),serde_json::to_vec(&marker).map_err(|_|"版本庫標識錯誤")?).map_err(|_|"無法保存版本庫標識")?;Ok::<(),String>(())})();
   if let Err(error)=created{let _=std::fs::remove_dir_all(&repo);return Err(error)}
  },
  Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>{},
  Err(_)=>return Err("無法建立專案版本庫".into())
 }
 validate_repo(&repo)?;
 let mut probe=git(&repo);probe.args(["config","--local","--get","lfs.repositoryformatversion"]);let result=output(&mut probe)?;
 if !result.status.success(){if result.status.code()!=Some(1){return Err("無法核對本地 LFS 格式".into())}let original=std::fs::read(repo.join("config")).map_err(|_|"無法保存舊設定")?;let mut config=git(&repo);config.args(["config","--local","lfs.repositoryformatversion","0"]);checked(&mut config,"升級本地 LFS 格式")?;let marker=serde_json::json!({"schema":"agentcv-isolated-git-1","configSha256":config_hash(&repo)?});if let Err(error)=std::fs::write(repo.join("agentcv-owner.json"),serde_json::to_vec(&marker).map_err(|_|"LFS 標識無效")?){let _=std::fs::write(repo.join("config"),original);return Err(format!("LFS 設定更新失敗：{error}"))}}
 else if String::from_utf8_lossy(&result.stdout).trim()!="0"{return Err("此 LFS 倉庫格式不受支援".into())}
 Ok(repo)
}
fn head(repo:&Path)->Result<Option<String>,String>{
 let mut check=git(repo);check.args(["show-ref","--verify","--quiet",REF]);let o=output(&mut check)?;
 if !o.status.success(){return if o.status.code()==Some(1){Ok(None)}else{Err(format!("讀取版本失敗：{}",String::from_utf8_lossy(&o.stderr).trim()))}}
 let mut resolve=git(repo);resolve.args(["rev-parse","--verify",REF]);let v=String::from_utf8(checked(&mut resolve,"讀取版本")?).map_err(|_|"Git 版本識別無效")?.trim().to_owned();if valid_hash(&v){Ok(Some(v))}else{Err("Git 版本識別無效".into())}
}
fn valid_hash(h:&str)->bool{(h.len()==40||h.len()==64)&&h.bytes().all(|c|c.is_ascii_hexdigit()&&!c.is_ascii_uppercase())}

const MAX_MANIFEST:usize=220*1024*1024;
const MAX_STREAM_ASSET:u64=64*1024*1024*1024;
const LFS_ATTRIBUTES:&str="assets/** filter=lfs diff=lfs merge=lfs -text\n";
#[derive(Clone)]
struct AssetRecord{path:String,sha:String,size:u64}
fn asset_records(value:&Value,records:&mut BTreeMap<String,AssetRecord>)->Result<(),String>{
 match value {
  Value::Array(rows)=>for row in rows{asset_records(row,records)?},
  Value::Object(object)=>{
   if let Some(path)=object.get("$asset").and_then(Value::as_str){
    if object.contains_key("packedIn"){
     let physical=crate::inspection_files::asset_pack::container(value)?.ok_or("版本容器定位缺失")?;
     return asset_records(physical,records);
    }
    let file=path.strip_prefix("assets/").ok_or("版本資產路徑不安全")?;
    let (sha,ext)=file.split_once('.').ok_or("版本資產路徑不安全")?;
    if sha.len()!=64||!sha.bytes().all(|c|c.is_ascii_digit()||(b'a'..=b'f').contains(&c))||ext.is_empty()||ext.len()>10||!ext.bytes().all(|c|c.is_ascii_lowercase()||c.is_ascii_digit()){return Err("版本資產路徑不安全".into())}
    let size=object.get("size").and_then(Value::as_u64).ok_or("版本資產缺少大小")?;
    if size>MAX_STREAM_ASSET||object.get("sha256").and_then(Value::as_str)!=Some(sha){return Err("版本資產身份不符或過大".into())}
    let record=AssetRecord{path:path.into(),sha:sha.into(),size};
    if let Some(previous)=records.get(path){if previous.sha!=record.sha||previous.size!=record.size{return Err("同一資產引用互相矛盾".into())}}
    records.insert(path.into(),record);if records.len()>100_000{return Err("版本資產數量過多".into())}
   }else{for row in object.values(){asset_records(row,records)?}}
  },_=>{}
 }Ok(())
}
fn manifest_records(root:&Path)->Result<BTreeMap<String,AssetRecord>,String>{
 let file=root.join("manifest.agentcv.json");let meta=std::fs::symlink_metadata(&file).map_err(|_|"找不到專案清單")?;
 if !meta.is_file()||meta.file_type().is_symlink()||meta.len()>MAX_MANIFEST as u64{return Err("專案清單不安全或過大".into())}
 let value:Value=serde_json::from_slice(&std::fs::read(file).map_err(|_|"無法讀取專案清單")?).map_err(|_|"專案清單格式錯誤")?;
 if value.get("schema").and_then(Value::as_str)!=Some("agentcv-workspace-1")||!value.get("project").is_some_and(Value::is_object){return Err("專案清單格式不支援".into())}
 let mut records=BTreeMap::new();asset_records(&value,&mut records)?;Ok(records)
}
fn asset_path(root:&Path,record:&AssetRecord)->Result<PathBuf,String>{
 let assets=root.join("assets");let folder=std::fs::symlink_metadata(&assets).map_err(|_|format!("缺少資產目錄：{}",record.path))?;
 if !folder.is_dir()||folder.file_type().is_symlink(){return Err("資產目錄不安全".into())}
 let path=root.join(&record.path);let meta=std::fs::symlink_metadata(&path).map_err(|_|format!("缺少原件：{}",record.path))?;
 if !meta.is_file()||meta.file_type().is_symlink()||meta.len()!=record.size{return Err(format!("資產大小或型態不符：{}",record.path))}Ok(path)
}
fn verify_asset(root:&Path,record:&AssetRecord)->Result<(),String>{
 let path=asset_path(root,record)?;let mut file=std::fs::File::open(path).map_err(|_|"無法核對資產")?;let mut sha=Sha256::new();let mut count=0u64;let mut buf=[0u8;256*1024];loop{let size=file.read(&mut buf).map_err(|_|"讀取資產失敗")?;if size==0{break}count+=size as u64;if count>record.size{return Err(format!("資產大小已變更：{}",record.path))}sha.update(&buf[..size]);}
 if count!=record.size||format!("{:x}",sha.finalize())!=record.sha{return Err(format!("資產 SHA-256 不符：{}",record.path))}Ok(())
}
pub(crate) fn validate_snapshot_files(root:&Path)->Result<(),String>{
 for record in manifest_records(root)?.values(){verify_asset(root,record)?}
 let manifest:Value=serde_json::from_slice(&std::fs::read(root.join("manifest.agentcv.json")).map_err(|_|"無法讀取快照清單")?).map_err(|_|"快照清單無效")?;
 crate::workspace::validate_packed_closure(root,&manifest)
}
fn prepare_snapshot(root:&Path,work:&Path,content:&str)->Result<(),String>{
 std::fs::create_dir_all(work).map_err(|_|"無法建立版本快照")?;write_workspace(work,content)?;
 for record in manifest_records(work)?.values(){
  if !work.join(&record.path).exists(){verify_asset(root,record)?;std::fs::copy(asset_path(root,record)?,work.join(&record.path)).map_err(|_|"複製引用資產失敗")?;}
  verify_asset(work,record)?;
 }Ok(())
}
fn validate_kind(kind:&str,run_id:Option<&str>)->Result<(),String>{
 if !["trial","checkpoint"].contains(&kind){return Err("不支援的歷史用途".into())}if kind=="trial"&&run_id.is_none(){return Err("試算快照需要唯一的實算識別".into())}
 if let Some(id)=run_id{if id.is_empty()||id.len()>200||id.chars().any(char::is_control){return Err("實算識別無效".into())}}Ok(())
}
fn write_pointer_files(repo:&Path,snapshot:&Path,work:&Path)->Result<(),String>{
 for record in manifest_records(snapshot)?.values(){let pointer=lfs::store(repo,&asset_path(snapshot,record)?)?;std::fs::write(work.join(&record.path),pointer).map_err(|_|"保存 LFS 指標失敗")?;}
 std::fs::write(work.join(".gitattributes"),LFS_ATTRIBUTES).map_err(|_|"保存 LFS 屬性失敗")?;Ok(())
}
fn run_reference(run_id:&str)->String{format!("refs/agentcv/runs/{:x}",Sha256::digest(run_id.as_bytes()))}
fn existing_run(repo:&Path,run_id:&str,tree:&str)->Result<Option<String>,String>{
 let reference=run_reference(run_id);let mut c=git(repo);c.args(["show-ref","--verify","--quiet",&reference]);let found=output(&mut c)?;if !found.status.success(){if found.status.code()==Some(1){return Ok(None)}return Err("核對試算識別失敗".into())}
 let mut c=git(repo);c.args(["rev-parse","--verify",&reference]);let commit=String::from_utf8(checked(&mut c,"讀取試算提交")?).map_err(|_|"試算提交無效")?.trim().to_string();if !valid_hash(&commit){return Err("試算提交無效".into())}
 let mut c=git(repo);c.args(["show","-s","--format=%T%n%B",&commit]);let meta=String::from_utf8(checked(&mut c,"核對固定試算")?).map_err(|_|"試算資料無效")?;
 if meta.lines().next()!=Some(tree)||!meta.lines().any(|line|line==format!("AgentCV-Run: {run_id}")){return Err("同一試算識別對應不同快照，未覆寫或重複提交".into())}Ok(Some(commit))
}
fn update_history_refs(repo:&Path,parent:Option<&str>,commit:&str,run_id:Option<&str>)->Result<(),String>{
 let zeros="0".repeat(commit.len());let mut script=format!("start\nupdate {REF} {commit} {}\n",parent.unwrap_or(&zeros));if let Some(id)=run_id{script.push_str(&format!("create {} {commit}\n",run_reference(id)));}script.push_str("prepare\ncommit\n");
 let mut command=git(repo);command.args(["update-ref","--stdin"]).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());let mut child=command.spawn().map_err(|_|"無法保存歷史識別")?;child.stdin.take().ok_or("缺少 Git 輸入")?.write_all(script.as_bytes()).map_err(|_|"寫入 Git 歷史識別失敗")?;let result=child.wait_with_output().map_err(|_|"Git 保存未完成")?;if !result.status.success(){return Err(format!("保存歷史失敗，固定試算仍保留：{}",String::from_utf8_lossy(&result.stderr).trim()))}Ok(())
}
fn commit_prepared(root:&Path,snapshot:&Path,message:&str,kind:&str,run_id:Option<&str>)->Result<VersionReceipt,String>{
 validate_kind(kind,run_id)?;let msg=message.trim();if msg.is_empty()||msg.chars().count()>160||msg.chars().any(char::is_control){return Err("請填寫 160 字以內的單行說明".into())}
 validate_snapshot_files(snapshot)?;let repo=create_or_open(root)?;let parent=head(&repo)?;let temp=Scratch::new()?;let work=temp.0.join("snapshot");std::fs::create_dir_all(work.join("assets")).map_err(|_|"無法建立版本暫存")?;
 std::fs::copy(snapshot.join("manifest.agentcv.json"),work.join("manifest.agentcv.json")).map_err(|_|"複製清單失敗")?;
 write_pointer_files(&repo,snapshot,&work)?;
 let mut add=git(&repo);add.arg("--work-tree").arg(&work).env("GIT_INDEX_FILE",temp.0.join("index")).args(["add","--all","--","."]);checked(&mut add,"準備 Git/LFS 快照")?;
 let mut command=git(&repo);command.env("GIT_INDEX_FILE",temp.0.join("index")).arg("write-tree");let tree=String::from_utf8(checked(&mut command,"建立版本樹")?).map_err(|_|"版本樹無效")?.trim().to_string();if !valid_hash(&tree){return Err("版本樹無效".into())}
 if kind=="trial"{if let Some(id)=run_id{if let Some(commit)=existing_run(&repo,id,&tree)?{return Ok(VersionReceipt{commit,created:false,message:msg.into(),kind:kind.into(),run_id:Some(id.into())})}}}
 if kind!="trial"{if let Some(ref parent)=parent{let mut c=git(&repo);c.args(["rev-parse",&format!("{parent}^{{tree}}")]);if String::from_utf8(checked(&mut c,"核對原版本")?).map_err(|_|"原版本無效")?.trim()==tree{return Ok(VersionReceipt{commit:parent.clone(),created:false,message:msg.into(),kind:kind.into(),run_id:run_id.map(String::from)})}}}
 let body=format!("{msg}\n\nAgentCV-Kind: {kind}\n{}",run_id.map(|id|format!("AgentCV-Run: {id}\n")).unwrap_or_default());
 let mut c=git(&repo);c.args(["commit-tree",&tree]);if let Some(ref p)=parent{c.args(["-p",p]);}c.args(["-m",&body]);let commit=String::from_utf8(checked(&mut c,"建立歷史提交")?).map_err(|_|"Git 提交無效")?.trim().to_string();if !valid_hash(&commit){return Err("Git 提交無效".into())}
 update_history_refs(&repo,parent.as_deref(),&commit,if kind=="trial"{run_id}else{None})?;
 Ok(VersionReceipt{commit,created:true,message:msg.into(),kind:kind.into(),run_id:run_id.map(String::from)})
}
fn version_create(path:&str,content:&str,message:&str)->Result<VersionReceipt,String>{version_create_kind(path,content,message,"checkpoint",None)}
fn version_create_kind(path:&str,content:&str,message:&str,kind:&str,run_id:Option<&str>)->Result<VersionReceipt,String>{
 let _guard=HISTORY_LOCK.lock().map_err(|_|"歷史服務忙碌")?;validate_kind(kind,run_id)?;let root=project_root(path)?;validate_snapshot_files(&root)?;if message.trim().is_empty()||message.trim().chars().count()>160||message.chars().any(char::is_control){return Err("說明需為160字以內單行文字".into())}
 // A trial is durably queued before Git/LFS is touched. Its original input and result survive retries.
 if kind=="trial"{
  let pending=queue_snapshot(&root,content,message,kind,run_id)?;
  match commit_prepared(&root,&pending,message,kind,run_id){Ok(receipt)=>{let _=std::fs::remove_dir_all(pending);Ok(receipt)},Err(e)=>Err(format!("{e}；固定試算快照已保留，待重試：{}",pending.file_name().unwrap_or_default().to_string_lossy()))}
 }else{let temp=Scratch::new()?;let work=temp.0.join("snapshot");prepare_snapshot(&root,&work,content)?;commit_prepared(&root,&work,message,kind,run_id)}
}
fn adopted_tags(repo:&Path)->Result<BTreeSet<String>,String>{let mut c=git(repo);c.args(["for-each-ref","--format=%(refname)","refs/tags/agentcv/adopted/"]);let bytes=checked(&mut c,"讀取採用標記")?;let text=String::from_utf8(bytes).map_err(|_|"標記無效")?;let mut out=BTreeSet::new();for line in text.lines(){if let Some(id)=line.strip_prefix("refs/tags/agentcv/adopted/"){if valid_hash(id){let mut check=git(repo);check.args(["rev-parse","--verify",line]);let actual=String::from_utf8(checked(&mut check,"核對採用標記")?).map_err(|_|"標記無效")?;if actual.trim()==id{out.insert(id.into());}}}}Ok(out)}
fn version_list(path:&str)->Result<Vec<VersionEntry>,String>{
 let _guard=HISTORY_LOCK.lock().map_err(|_|"歷史服務忙碌")?;let root=project_root(path)?;let repo=root.join(HISTORY_DIR);if !repo.exists(){return Ok(vec![])}validate_repo(&repo)?;if head(&repo)?.is_none(){return Ok(vec![])}let adopted=adopted_tags(&repo)?;
 let mut c=git(&repo);c.args(["log","--max-count=500","--format=%H%x1f%aI%x1f%B%x1e",REF]);let text=String::from_utf8(checked(&mut c,"讀取歷史")?).map_err(|_|"歷史文字無效")?;let mut rows=vec![];
 for row in text.split('\x1e').map(str::trim).filter(|s|!s.is_empty()){let fields:Vec<_>=row.splitn(3,'\x1f').collect();if fields.len()!=3||!valid_hash(fields[0]){return Err("歷史識別無效".into())}let body=fields[2];let kind=body.lines().find_map(|l|l.strip_prefix("AgentCV-Kind: ")).unwrap_or("checkpoint");let run_id=body.lines().find_map(|l|l.strip_prefix("AgentCV-Run: ")).map(String::from);rows.push(VersionEntry{commit:fields[0].into(),created_at:fields[1].into(),message:body.lines().next().unwrap_or("歷史快照").into(),kind:kind.into(),run_id,tags:if adopted.contains(fields[0]){vec!["adopted".into()]}else{vec![]}});}Ok(rows)
}
fn check_reachable(repo:&Path,commit:&str)->Result<(),String>{if !valid_hash(commit){return Err("版本識別無效".into())}let mut c=git(repo);c.args(["rev-list","--all"]);let text=String::from_utf8(checked(&mut c,"核對歷史歸屬")?).map_err(|_|"歷史無效")?;if !text.lines().any(|id|id==commit){return Err("此提交不屬於專案歷史".into())}Ok(())}
fn read_blob(repo:&Path,object:&str,max:usize)->Result<Vec<u8>,String>{let mut c=git(repo);c.args(["cat-file","-s",object]);let raw=checked(&mut c,"核對版本資產大小")?;let size=String::from_utf8(raw).map_err(|_|"版本資產大小無效")?.trim().parse::<usize>().map_err(|_|"版本資產大小無效")?;if size>max{return Err("版本資產超過限制".into())}let mut c=git(repo);c.args(["show",object]);let bytes=checked(&mut c,"讀取 Git 物件")?;if bytes.len()!=size{return Err("Git 物件大小不一致".into())}Ok(bytes)}
fn blob_to_file(repo:&Path,object:&str,destination:&Path,size:u64)->Result<(),String>{let file=std::fs::File::create(destination).map_err(|_|"無法還原資產")?;let mut c=git(repo);c.args(["show",object]).stdout(file);let output=output(&mut c)?;if !output.status.success(){return Err(format!("讀取舊版本原件失敗：{}",String::from_utf8_lossy(&output.stderr)))}if std::fs::metadata(destination).map_err(|_|"原件不存在")?.len()!=size{return Err("舊版本原件大小不符".into())}Ok(())}
fn materialize_impl(repo:&Path,commit:&str,destination:&Path)->Result<(),String>{
 let mut attributes=git(repo);attributes.args(["cat-file","-e",&format!("{commit}:.gitattributes")]);let has_attributes=output(&mut attributes)?.status.success();let uses_lfs=if has_attributes{let attrs=read_blob(repo,&format!("{commit}:.gitattributes"),1024)?;if attrs!=LFS_ATTRIBUTES.as_bytes(){return Err("歷史快照的 LFS 屬性不受支援".into())}true}else{false};
 std::fs::create_dir_all(destination.join("assets")).map_err(|_|"無法建立還原目錄")?;
 let manifest=read_blob(repo,&format!("{commit}:manifest.agentcv.json"),MAX_MANIFEST)?;std::fs::write(destination.join("manifest.agentcv.json"),manifest).map_err(|_|"無法還原清單")?;
 for record in manifest_records(destination)?.values(){let object=format!("{commit}:{}",record.path);let mut c=git(repo);c.args(["cat-file","-s",&object]);let size=String::from_utf8(checked(&mut c,"核對歷史資產")?).map_err(|_|"資產大小無效")?.trim().parse::<u64>().map_err(|_|"資產大小無效")?;
  if size<=1024{let bytes=read_blob(repo,&object,1024)?;if uses_lfs&&lfs::is_pointer(&bytes){let descriptor=lfs::descriptor(&bytes)?;if descriptor.oid!=record.sha||descriptor.size!=record.size{return Err(format!("LFS 指標與清單不符：{}",record.path))}lfs::materialize(repo,&bytes,&destination.join(&record.path))?;}else{std::fs::write(destination.join(&record.path),bytes).map_err(|_|"還原舊資產失敗")?;}}
  else{if size!=record.size{return Err(format!("舊版本資產大小不符：{}",record.path))}blob_to_file(repo,&object,&destination.join(&record.path),size)?;}
  verify_asset(destination,record)?;
 }Ok(())
}
pub(crate) fn materialize_version(root:&Path,commit:&str,destination:&Path)->Result<(),String>{let repo=root.join(HISTORY_DIR);validate_repo(&repo)?;check_reachable(&repo,commit)?;materialize_impl(&repo,commit,destination)}
fn version_read(path:&str,commit:&str)->Result<String,String>{let _guard=HISTORY_LOCK.lock().map_err(|_|"歷史服務忙碌")?;let root=project_root(path)?;let temp=Scratch::new()?;materialize_version(&root,commit,&temp.0)?;read_workspace(&temp.0).map_err(|e|format!("歷史原件已核對，但目前互動式載入有限制：{e}"))}
// Lazy asset references must outlive this call. A temporary Scratch cannot be
// their source because its Drop would remove every referenced original.
fn version_read_lazy(path:&str,commit:&str)->Result<String,String>{
 let _guard=HISTORY_LOCK.lock().map_err(|_|"歷史服務忙碌")?;let root=project_root(path)?;let repo=root.join(HISTORY_DIR);validate_repo(&repo)?;check_reachable(&repo,commit)?;
 let parent=root.join(".agentcv-history-views");std::fs::create_dir_all(&parent).map_err(|_|"無法建立歷史圖像視圖")?;
 if std::fs::symlink_metadata(&parent).map_err(|_|"無法讀取歷史視圖")?.file_type().is_symlink(){return Err("歷史視圖目錄不安全".into())}
 let target=parent.join(commit);let expected=read_blob(&repo,&format!("{commit}:manifest.agentcv.json"),MAX_MANIFEST)?;
 if target.exists(){
  if std::fs::symlink_metadata(&target).map_err(|_|"無法核對歷史視圖")?.file_type().is_symlink(){return Err("歷史視圖不能是符號連結".into())}
  if std::fs::read(target.join("manifest.agentcv.json")).map_err(|_|"歷史視圖清單缺失")?!=expected{return Err("歷史視圖清單與Git版本不一致，未載入".into())}
 }else{
  let staging=parent.join(format!(".{}-{}-{}",commit,std::process::id(),SERIAL.fetch_add(1,Ordering::Relaxed)));
  let prepared=(||->Result<(),String>{materialize_version(&root,commit,&staging)?;std::fs::rename(&staging,&target).map_err(|_|"無法保存歷史圖像視圖".into())})();if prepared.is_err(){let _=std::fs::remove_dir_all(&staging);}prepared?;
 }
 read_workspace_lazy(&target)
}

// Validate each distinct binary once, regardless of how many commits reference it.
// Never materialize a whole historical dataset merely to check an export.
pub(crate) fn validate_complete_history(root:&Path)->Result<(),String>{
 let _guard=HISTORY_LOCK.lock().map_err(|_|"歷史服務忙碌")?;
 let repo=root.join(HISTORY_DIR);if !repo.exists(){return Ok(())}validate_repo(&repo)?;
 let mut c=git(&repo);c.args(["rev-list","--all"]);
 let text=String::from_utf8(checked(&mut c,"核對完整歷史")?).map_err(|_|"歷史無效")?;
 let mut verified_blobs=BTreeSet::new();let mut verified_lfs=BTreeSet::new();
 for id in text.lines(){
  if !valid_hash(id){return Err("歷史提交識別無效".into())}
  let mut attributes=git(&repo);attributes.args(["cat-file","-e",&format!("{id}:.gitattributes")]);
  let uses_lfs=output(&mut attributes)?.status.success();
  if uses_lfs&&read_blob(&repo,&format!("{id}:.gitattributes"),1024)?!=LFS_ATTRIBUTES.as_bytes(){return Err("歷史快照的 LFS 屬性不受支援".into())}
  let manifest=read_blob(&repo,&format!("{id}:manifest.agentcv.json"),MAX_MANIFEST)?;
  let value:Value=serde_json::from_slice(&manifest).map_err(|_|"歷史清單格式錯誤")?;
  if value.get("schema").and_then(Value::as_str)!=Some("agentcv-workspace-1")||!value.get("project").is_some_and(Value::is_object){return Err("歷史清單格式不支援".into())}
  let mut records=BTreeMap::new();asset_records(&value,&mut records)?;
  for record in records.values(){
   let object=format!("{id}:{}",record.path);let mut c=git(&repo);c.args(["rev-parse","--verify",&object]);
   let blob=String::from_utf8(checked(&mut c,"核對歷史資產識別")?).map_err(|_|"資產識別無效")?.trim().to_string();
   if !valid_hash(&blob){return Err("資產識別無效".into())}
   let key=(blob.clone(),record.sha.clone(),record.size,uses_lfs);
   if verified_blobs.contains(&key){continue}
   let mut c=git(&repo);c.args(["cat-file","-s",&blob]);
   let size=String::from_utf8(checked(&mut c,"核對歷史資產大小")?).map_err(|_|"資產大小無效")?.trim().parse::<u64>().map_err(|_|"資產大小無效")?;
   let bytes=if size<=1024{Some(read_blob(&repo,&blob,1024)?)}else{None};
   if uses_lfs&&bytes.as_ref().is_some_and(|b|lfs::is_pointer(b)){
    let pointer=bytes.as_ref().unwrap();let descriptor=lfs::descriptor(pointer)?;
    if descriptor.oid!=record.sha||descriptor.size!=record.size{return Err(format!("LFS 指標與清單不符：{}",record.path))}
    if verified_lfs.insert((descriptor.oid,descriptor.size)){lfs::verify(&repo,pointer)?;}
   }else{
    if size!=record.size{return Err(format!("歷史資產大小不符：{}",record.path))}
    let mut sha=Sha256::new();
    if let Some(bytes)=bytes{sha.update(bytes);}else{
     let mut c=git(&repo);c.args(["cat-file","blob",&blob]).stdout(Stdio::piped()).stderr(Stdio::null());
     let mut child=c.spawn().map_err(|_|"無法串流核對歷史資產")?;
     let result=(||{let mut stream=child.stdout.take().ok_or("Git 資產串流缺失")?;let mut buffer=[0u8;256*1024];let mut count=0u64;
      loop{let n=stream.read(&mut buffer).map_err(|_|"讀取歷史資產失敗")?;if n==0{break}count+=n as u64;if count>size{return Err("Git 資產大小已變更".into())}sha.update(&buffer[..n]);}
      if count!=size{return Err("Git 資產不完整".into())}Ok::<(),String>(())})();
     if result.is_err(){let _=child.kill();}let status=child.wait().map_err(|_|"歷史核對未完成")?;result?;if !status.success(){return Err("讀取歷史資產失敗".into())}
    }
    if format!("{:x}",sha.finalize())!=record.sha{return Err(format!("歷史資產 SHA-256 不符：{}",record.path))}
   }
   verified_blobs.insert(key);
  }
 }Ok(())
}
fn set_tag(path:&str,commit:&str,tag:&str,enabled:bool)->Result<(),String>{let _guard=HISTORY_LOCK.lock().map_err(|_|"歷史服務忙碌")?;if tag!="adopted"{return Err("目前僅支援人工採用標記，驗證通過不可自行推定".into())}let root=project_root(path)?;let repo=root.join(HISTORY_DIR);validate_repo(&repo)?;check_reachable(&repo,commit)?;let reference=format!("refs/tags/agentcv/adopted/{commit}");let mut c=git(&repo);if enabled{c.args(["update-ref",&reference,commit]);}else{c.args(["update-ref","-d",&reference]);}checked(&mut c,"保存採用標記")?;Ok(())}
fn pending_root(root:&Path)->PathBuf{root.join(".agentcv-history-pending")}
fn queue_snapshot(root:&Path,content:&str,message:&str,kind:&str,run_id:Option<&str>)->Result<PathBuf,String>{let parent=pending_root(root);std::fs::create_dir_all(&parent).map_err(|_|"無法保存待提交試算")?;if std::fs::symlink_metadata(&parent).map_err(|_|"無法讀取待提交目錄")?.file_type().is_symlink(){return Err("待提交目錄不安全".into())}let id=format!("trial-{}-{}",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|"時鐘無效")?.as_nanos(),SERIAL.fetch_add(1,Ordering::Relaxed));let staging=parent.join(format!(".{id}.tmp"));let target=parent.join(&id);let result=(||{prepare_snapshot(root,&staging,content)?;for existing in pending_directories(root)?{let info=read_pending_info(&existing)?;if run_id.is_some()&&info.get("runId").and_then(Value::as_str)==run_id{let previous:Value=serde_json::from_slice(&std::fs::read(existing.join("manifest.agentcv.json")).map_err(|_|"待提交清單不可讀")?).map_err(|_|"待提交清單無效")?;let current:Value=serde_json::from_slice(&std::fs::read(staging.join("manifest.agentcv.json")).map_err(|_|"待提交清單不可讀")?).map_err(|_|"待提交清單無效")?;if previous!=current{return Err("同一試算已有不同的固定待提交快照，未覆寫".into())}std::fs::remove_dir_all(&staging).map_err(|_|"清理重複待提交暫存失敗")?;return Ok(existing);}}let info=serde_json::json!({"schema":"agentcv-pending-trial-1","message":message,"kind":kind,"runId":run_id});std::fs::write(staging.join("pending.json"),serde_json::to_vec(&info).map_err(|_|"待提交資料無效")?).map_err(|_|"保存待提交資料失敗")?;std::fs::rename(&staging,&target).map_err(|_|"保存固定試算快照失敗")?;Ok(target)})();if result.is_err(){let _=std::fs::remove_dir_all(staging);}result}
fn read_pending_info(directory:&Path)->Result<Value,String>{let path=directory.join("pending.json");let meta=std::fs::symlink_metadata(&path).map_err(|_|"待提交說明缺失")?;if !meta.is_file()||meta.file_type().is_symlink()||meta.len()>64*1024{return Err("待提交說明不安全或過大".into())}let value:Value=serde_json::from_slice(&std::fs::read(path).map_err(|_|"待提交說明不可讀")?).map_err(|_|"待提交說明無效")?;if value.get("schema").and_then(Value::as_str)!=Some("agentcv-pending-trial-1"){return Err("待提交格式不支援".into())}Ok(value)}
fn pending_directories(root:&Path)->Result<Vec<PathBuf>,String>{let path=pending_root(root);if !path.exists(){return Ok(vec![])}if std::fs::symlink_metadata(&path).map_err(|_|"待提交目錄不可讀")?.file_type().is_symlink(){return Err("待提交目錄不安全".into())}let mut dirs=vec![];for entry in std::fs::read_dir(path).map_err(|_|"待提交目錄不可讀")?{let entry=entry.map_err(|_|"待提交清單不完整")?;let name=entry.file_name();if !name.to_string_lossy().starts_with("trial-"){continue}let meta=entry.file_type().map_err(|_|"待提交資料不可讀")?;if meta.is_symlink()||!meta.is_dir(){return Err("待提交快照不安全".into())}dirs.push(entry.path());}dirs.sort();Ok(dirs)}
#[tauri::command]
pub async fn create_solution_version(project_path:String,content:String,message:String,kind:Option<String>,run_id:Option<String>)->Result<VersionReceipt,String>{tauri::async_runtime::spawn_blocking(move||version_create_kind(&project_path,&content,&message,kind.as_deref().unwrap_or("checkpoint"),run_id.as_deref())).await.map_err(|_|"歷史服務執行失敗")?}
#[tauri::command]
pub async fn list_solution_versions(project_path:String)->Result<Vec<VersionEntry>,String>{tauri::async_runtime::spawn_blocking(move||version_list(&project_path)).await.map_err(|_|"歷史服務執行失敗")?}
#[tauri::command]
pub async fn read_solution_version(project_path:String,commit:String)->Result<String,String>{tauri::async_runtime::spawn_blocking(move||version_read_lazy(&project_path,&commit)).await.map_err(|_|"歷史服務執行失敗")?}
#[tauri::command]
pub async fn set_solution_tag(project_path:String,commit:String,tag:String,enabled:bool)->Result<(),String>{tauri::async_runtime::spawn_blocking(move||set_tag(&project_path,&commit,&tag,enabled)).await.map_err(|_|"標記服務失敗")?}
#[tauri::command]
pub async fn pending_history_count(project_path:String)->Result<usize,String>{tauri::async_runtime::spawn_blocking(move||pending_directories(&project_root(&project_path)?).map(|d|d.len())).await.map_err(|_|"歷史服務失敗")?}
#[tauri::command]
pub async fn retry_pending_history(project_path:String)->Result<Value,String>{tauri::async_runtime::spawn_blocking(move||{let _guard=HISTORY_LOCK.lock().map_err(|_|"歷史服務忙碌")?;let root=project_root(&project_path)?;let mut saved=vec![];let mut failed=vec![];for directory in pending_directories(&root)?{let info=read_pending_info(&directory);let result=info.and_then(|info|commit_prepared(&root,&directory,info.get("message").and_then(Value::as_str).ok_or("待提交說明缺失")?,info.get("kind").and_then(Value::as_str).unwrap_or("trial"),info.get("runId").and_then(Value::as_str)));match result{Ok(receipt)=>{saved.push(serde_json::to_value(receipt).map_err(|_|"歷史回執無效")?);let _=std::fs::remove_dir_all(&directory);},Err(error)=>failed.push(serde_json::json!({"pendingId":directory.file_name().unwrap_or_default().to_string_lossy(),"error":error}))}}Ok(serde_json::json!({"saved":saved,"failed":failed,"remaining":pending_directories(&root)?.len()}))}).await.map_err(|_|"歷史重試服務失敗")?}
#[tauri::command]
pub async fn ensure_history_workspace(app:tauri::AppHandle,content:String,project_id:Option<String>)->Result<Value,String>{tauri::async_runtime::spawn_blocking(move||{let id=project_id.unwrap_or_else(||format!("project-{}-{}",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos(),SERIAL.fetch_add(1,Ordering::Relaxed)));if id.is_empty()||id.len()>120||!id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_'){return Err("本地歷史專案識別無效".into())}let root=app.path().app_data_dir().map_err(|_|"找不到本地歷史目錄")?.join("solution-history").join(&id);std::fs::create_dir_all(&root).map_err(|_|"無法建立本地歷史專案")?;if !root.join("manifest.agentcv.json").exists(){write_workspace(&root,&content)?;}Ok(serde_json::json!({"path":root.to_string_lossy(),"projectId":id}))}).await.map_err(|_|"本地歷史服務失敗")?}

#[tauri::command]
pub async fn attach_solution_history(source_path:String,project_path:String)->Result<Value,String>{tauri::async_runtime::spawn_blocking(move||{let result=crate::history_transfer::attach_history(&project_root(&source_path)?,&project_root(&project_path)?)?;serde_json::to_value(result).map_err(|_|"附加歷史回執無效".into())}).await.map_err(|_|"附加歷史服務失敗")?}
#[tauri::command]
pub async fn export_solution_project(project_path:String,content:String,destination:Option<String>)->Result<Option<Value>,String>{
 let destination=if let Some(path)=destination{path}else{let Some(folder)=rfd::AsyncFileDialog::new().set_title("完整匯出：選擇空的目標資料夾（包含 Git 歷史與大檔原件）").pick_folder().await else{return Ok(None)};folder.path().to_string_lossy().into()};
 tauri::async_runtime::spawn_blocking(move||{let source=project_root(&project_path)?;let scratch=Scratch::new()?;let snapshot=scratch.0.join("current");prepare_snapshot(&source,&snapshot,&content)?;let receipt=crate::history_transfer::export_current_project(&source,&snapshot,Path::new(&destination))?;Ok(Some(serde_json::to_value(receipt).map_err(|_|"匯出回執無效")?))}).await.map_err(|_|"完整匯出服務失敗")?
}
#[tauri::command]
pub async fn import_solution_project(source_path:Option<String>,destination:Option<String>)->Result<Option<Value>,String>{
 let source=if let Some(path)=source_path{path}else{let Some(folder)=rfd::AsyncFileDialog::new().set_title("選擇完整 AgentCV 專案來源資料夾").pick_folder().await else{return Ok(None)};folder.path().to_string_lossy().into()};
 let target=if let Some(path)=destination{path}else{let Some(folder)=rfd::AsyncFileDialog::new().set_title("選擇空的匯入目標資料夾").pick_folder().await else{return Ok(None)};folder.path().to_string_lossy().into()};
 tauri::async_runtime::spawn_blocking(move||{let receipt=crate::history_transfer::import_project(Path::new(&source),Path::new(&target))?;let mut value=serde_json::to_value(receipt).map_err(|_|"匯入回執無效")?;match read_workspace_lazy(Path::new(&target)){Ok(content)=>value["content"]=Value::String(content),Err(error)=>value["loadError"]=Value::String(format!("專案已完整匯入，但目前互動式載入有限制：{error}"))};Ok(Some(value))}).await.map_err(|_|"完整匯入服務失敗")?
}

#[cfg(test)]
mod tests {
 use super::*;
 use std::process::Command;
 fn temp()->Scratch{Scratch::new().unwrap()}
 fn content(name:&str)->String{serde_json::json!({"schema":"agentcv-workspace-0.9","images":[{"id":"im","name":name,"dataURL":"data:image/png;base64,aGVsbG8="}],"workflow":{"checks":[{"id":"check","min":3}],"relations":[]},"algorithmRuns":[],"canvasRelations":[],"visualInquiry":{"boards":[]}}).to_string()}
 fn git_call(path:&Path,args:&[&str])->String{let output=Command::new("git").arg("-C").arg(path).args(args).output().unwrap();assert!(output.status.success(),"{}",String::from_utf8_lossy(&output.stderr));String::from_utf8(output.stdout).unwrap()}
 #[cfg(windows)]
 #[test]
 fn git_paths_preserve_disk_unc_and_unicode_destinations(){
  for (input,expected) in [(r"\\?\C:\项目\history.git",r"C:\项目\history.git"),(r"\\?\UNC\server\share\项目\history.git",r"\\server\share\项目\history.git"),(r"E:\项目\history.git",r"E:\项目\history.git")]{assert_eq!(git_path(Path::new(input)),PathBuf::from(expected));}
  let t=temp();let repo=t.0.join("history.git");let mut init=git_base();init.args(["init","--bare","--template="]).arg(&repo);checked(&mut init,"test init").unwrap();
  let mut command=git(&repo.canonicalize().unwrap());command.args(["rev-parse","--is-bare-repository"]);assert_eq!(checked(&mut command,"canonical repository").unwrap(),b"true\n");
 }
 #[test]
 fn full_project_versions_roundtrip_and_repeat_is_noop(){
  let t=temp();let p=t.0.join("project");std::fs::create_dir(&p).unwrap();let original=content("第一圖");write_workspace(&p,&original).unwrap();let path=p.to_str().unwrap();assert!(version_list(path).unwrap().is_empty());
  let first=version_create(path,&original,"建立方案").unwrap();assert!(first.created);let decoded:Value=serde_json::from_str(&version_read(path,&first.commit).unwrap()).unwrap();assert_eq!(decoded,serde_json::from_str::<Value>(&original).unwrap());
  let again=version_create(path,&original,"相同內容").unwrap();assert!(!again.created);assert_eq!(again.commit,first.commit);
  let next=content("第二圖");let second=version_create(path,&next,"修改名稱").unwrap();assert!(second.created);assert_ne!(second.commit,first.commit);let history=version_list(path).unwrap();assert_eq!(history.len(),2);assert_eq!(history[0].message,"修改名稱");assert_eq!(history[1].message,"建立方案");assert_eq!(serde_json::from_str::<Value>(&version_read(path,&second.commit).unwrap()).unwrap(),serde_json::from_str::<Value>(&next).unwrap());
  // Creating and reading versions does not overwrite the current project.
  assert_eq!(serde_json::from_str::<Value>(&read_workspace(&p).unwrap()).unwrap(),serde_json::from_str::<Value>(&original).unwrap());
  assert!(version_read(path,&"a".repeat(40)).is_err());assert!(version_read(path,"../HEAD").is_err());
 }
 #[test]
 fn parent_repository_head_and_staged_changes_are_untouched(){
  let t=temp();let outer=t.0.join("outer");std::fs::create_dir(&outer).unwrap();git_call(&outer,&["init","-q"]);git_call(&outer,&["config","user.email","qa@example.invalid"]);git_call(&outer,&["config","user.name","QA"]);std::fs::write(outer.join("unrelated.txt"),"original").unwrap();git_call(&outer,&["add","unrelated.txt"]);git_call(&outer,&["commit","-q","-m","original"]);std::fs::write(outer.join("unrelated.txt"),"staged user's work").unwrap();git_call(&outer,&["add","unrelated.txt"]);
  let head_before=git_call(&outer,&["rev-parse","HEAD"]);let index_before=std::fs::read(outer.join(".git/index")).unwrap();let p=outer.join("project");std::fs::create_dir(&p).unwrap();let project=content("fixture");write_workspace(&p,&project).unwrap();let saved=version_create(p.to_str().unwrap(),&project,"獨立方案版本").unwrap();assert!(saved.created);assert_eq!(git_call(&outer,&["rev-parse","HEAD"]),head_before);assert_eq!(std::fs::read(outer.join(".git/index")).unwrap(),index_before);assert_eq!(std::fs::read_to_string(outer.join("unrelated.txt")).unwrap(),"staged user's work");
 }
 #[test]
 fn invalid_project_unowned_repo_and_corrupt_asset_are_rejected_without_changes(){
  let t=temp();let root=t.0.join("not-project");std::fs::create_dir(&root).unwrap();let original=content("valid");assert!(version_create(root.to_str().unwrap(),&original,"x").is_err());assert!(!root.join(HISTORY_DIR).exists());
  let p=t.0.join("project");std::fs::create_dir(&p).unwrap();write_workspace(&p,&original).unwrap();let path=p.to_str().unwrap();let unmanaged=p.join(HISTORY_DIR);std::fs::create_dir(&unmanaged).unwrap();std::fs::write(unmanaged.join("user-file"),"untouched").unwrap();assert!(version_create(path,&original,"x").is_err());assert_eq!(std::fs::read_to_string(unmanaged.join("user-file")).unwrap(),"untouched");std::fs::remove_dir_all(&unmanaged).unwrap();
  let v=version_create(path,&original,"版本").unwrap();std::fs::create_dir_all(unmanaged.join("info")).unwrap();std::fs::write(unmanaged.join("info/attributes"),"* filter=hostile").unwrap();assert!(version_list(path).is_err());assert!(version_read(path,&v.commit).is_err());
  std::fs::remove_file(unmanaged.join("info/attributes")).unwrap();let manifest=std::fs::read_to_string(p.join("manifest.agentcv.json")).unwrap();let m:Value=serde_json::from_str(&manifest).unwrap();let asset=m["project"]["images"][0]["dataURL"]["$asset"].as_str().unwrap();std::fs::write(p.join(asset),"bad").unwrap();assert!(version_create(path,&original,"版本").is_err());assert_eq!(std::fs::read_to_string(p.join("manifest.agentcv.json")).unwrap(),manifest);assert_eq!(version_list(path).unwrap().len(),1);assert_eq!(serde_json::from_str::<Value>(&version_read(path,&v.commit).unwrap()).unwrap(),serde_json::from_str::<Value>(&original).unwrap());
 }
 #[test]
 fn snapshots_exclude_foreign_staging_and_avoid_git_filters(){
  let t=temp();let p=t.0.join("project");std::fs::create_dir(&p).unwrap();let original=content("fixture");write_workspace(&p,&original).unwrap();let path=p.to_str().unwrap();let first=version_create(path,&original,"初版").unwrap();let repo=p.join(HISTORY_DIR);
  // A standalone temporary index/worktree cannot capture ordinary project files.
  std::fs::write(p.join("unrelated-secret"),"not part of the project").unwrap();let next=content("different");let second=version_create(path,&next,"次版").unwrap();assert_ne!(first.commit,second.commit);
  let mut ls=git(&repo);ls.args(["ls-tree","-r","--name-only",&second.commit]);let names=String::from_utf8(checked(&mut ls,"讀取樹").unwrap()).unwrap();assert!(!names.contains("unrelated-secret"));assert!(names.contains("manifest.agentcv.json"));assert!(names.contains("assets/"));
  let config=repo.join("config");std::fs::write(&config,"[core]\n  fsmonitor = malicious\n").unwrap();assert!(version_create(path,&next,"blocked").unwrap_err().contains("設定已變更"));
 }
 #[test]
 #[ignore = "Requires the local real Pi workspace under 13-cv/reviews"]
 fn actual_pi_project_full_snapshot_roundtrip(){
  let fixture=Path::new(env!("CARGO_MANIFEST_DIR")).join("../../reviews/2026-10-27-program-flow/actual-pi-workspace-portable.agentcv.json");
  let content=std::fs::read_to_string(fixture).unwrap();let initial:Value=serde_json::from_str(&content).unwrap();assert_eq!(initial["algorithmRuns"].as_array().unwrap().len(),2);
  let t=temp();let root=t.0.join("actual-workspace");std::fs::create_dir(&root).unwrap();write_workspace(&root,&content).unwrap();let path=root.to_str().unwrap();let first=version_create(path,&content,"真實方案初版").unwrap();assert!(first.created);
  let decoded:Value=serde_json::from_str(&version_read(path,&first.commit).unwrap()).unwrap();assert_eq!(decoded,initial);
  let mut modified=initial.clone();modified["workflow"]["workpiece"]["name"]=Value::String("第二個方案版本".into());let second=version_create(path,&serde_json::to_string(&modified).unwrap(),"修改工件說明").unwrap();assert_ne!(first.commit,second.commit);
  assert_eq!(serde_json::from_str::<Value>(&version_read(path,&second.commit).unwrap()).unwrap(),modified);assert_eq!(serde_json::from_str::<Value>(&read_workspace(&root).unwrap()).unwrap(),initial);assert_eq!(version_list(path).unwrap().len(),2);
 }

}

#[cfg(test)]
mod trial_transfer_integration_tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};

    fn project_notes(note: &str) -> String {
        serde_json::json!({"schema":"agentcv-workspace-0.9","images":[],"workflow":{"description":note},"algorithmRuns":[],"visualInquiry":{"boards":[]}}).to_string()
    }
    fn saved_project(scratch: &Scratch, content: &str) -> PathBuf {
        let root = scratch.0.join("project");
        std::fs::create_dir(&root).unwrap();
        write_workspace(&root, content).unwrap();
        root
    }
    #[test]
    fn integration_trial_run_id_is_idempotent_and_rejects_different_snapshot() {
        let scratch = Scratch::new().unwrap();
        let original = project_notes("operator supplied original description");
        let root = saved_project(&scratch, &original);
        let path = root.to_str().unwrap();
        let first = version_create_kind(path, &original, "fixed trial", "trial", Some("actual-run-id-one")).unwrap();
        let second = version_create_kind(path, &original, "repeat request", "trial", Some("actual-run-id-one")).unwrap();
        assert!(first.created);
        assert!(!second.created);
        assert_eq!(first.commit, second.commit);
        let conflicting = project_notes("different operator description");
        let error = version_create_kind(path, &conflicting, "conflicting trial", "trial", Some("actual-run-id-one")).err().unwrap();
        assert!(error.contains("同一試算識別對應不同快照"), "{error}");
        assert_eq!(version_list(path).unwrap().len(), 1);
        assert_eq!(pending_directories(&root).unwrap().len(), 1);
        assert_eq!(serde_json::from_str::<Value>(&version_read(path, &first.commit).unwrap()).unwrap(), serde_json::from_str::<Value>(&original).unwrap());
    }
    #[test]
    fn integration_adopted_tag_changes_metadata_without_creating_commit() {
        let scratch = Scratch::new().unwrap();
        let original = project_notes("operator review record");
        let root = saved_project(&scratch, &original);
        let path = root.to_str().unwrap();
        let trial = version_create_kind(path, &original, "reviewed trial", "trial", Some("review-run-id")).unwrap();
        let before = head(&root.join(HISTORY_DIR)).unwrap();
        set_tag(path, &trial.commit, "adopted", true).unwrap();
        let rows = version_list(path).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].tags, vec!["adopted"]);
        assert_eq!(head(&root.join(HISTORY_DIR)).unwrap(), before);
        set_tag(path, &trial.commit, "adopted", false).unwrap();
        assert!(version_list(path).unwrap()[0].tags.is_empty());
        assert_eq!(head(&root.join(HISTORY_DIR)).unwrap(), before);
    }
    #[test]
    fn integration_failed_trial_retries_frozen_snapshot_after_owned_config_repair() {
        let scratch = Scratch::new().unwrap();
        let frozen = project_notes("original trial state before Git failure");
        let root = saved_project(&scratch, &frozen);
        let path = root.to_str().unwrap();
        version_create(path, &frozen, "initial checkpoint").unwrap();
        let config = root.join(HISTORY_DIR).join("config");
        let valid_config = std::fs::read(&config).unwrap();
        std::fs::write(&config, b"[core]\n bare = true\n fsmonitor = invalid-external-command\n").unwrap();
        let error = version_create_kind(path, &frozen, "fixed failed trial", "trial", Some("frozen-retry-run")).err().unwrap();
        assert!(error.contains("固定試算快照已保留"), "{error}");
        let pending = pending_directories(&root).unwrap();
        assert_eq!(pending.len(), 1);
        let frozen_manifest = std::fs::read(pending[0].join("manifest.agentcv.json")).unwrap();
        let later = project_notes("operator changed current project while original trial awaited retry");
        write_workspace(&root, &later).unwrap();
        std::fs::write(&config, valid_config).unwrap();
        // Run the exact production retry worker operations against the durable queued directory.
        let receipt = {
            let _guard = HISTORY_LOCK.lock().unwrap();
            let info = read_pending_info(&pending[0]).unwrap();
            commit_prepared(&root, &pending[0], info["message"].as_str().unwrap(), info["kind"].as_str().unwrap(), info["runId"].as_str()).unwrap()
        };
        assert!(receipt.created);
        assert_eq!(std::fs::read(pending[0].join("manifest.agentcv.json")).unwrap(), frozen_manifest);
        std::fs::remove_dir_all(&pending[0]).unwrap();
        assert!(pending_directories(&root).unwrap().is_empty());
        assert_eq!(serde_json::from_str::<Value>(&version_read(path, &receipt.commit).unwrap()).unwrap(), serde_json::from_str::<Value>(&frozen).unwrap());
        assert_eq!(serde_json::from_str::<Value>(&read_workspace(&root).unwrap()).unwrap(), serde_json::from_str::<Value>(&later).unwrap());
        let rows = version_list(path).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].run_id.as_deref(), Some("frozen-retry-run"));
    }
    #[test]
    fn integration_real_pi_trial_tag_export_delete_import_preserves_nine_artifacts() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../reviews/2026-10-27-program-flow/actual-pi-workspace-portable.agentcv.json");
        let captured = std::fs::read_to_string(&fixture).expect("real Pi portable capture is required");
        let mut expected: Value = serde_json::from_str(&captured).unwrap();
        // The historical portable capture embeds images but JSON artifacts only as parsed values.
        // Preserve their actual captured bytes too; no algorithm is simulated or rerun here.
        for run in expected["algorithmRuns"].as_array_mut().unwrap() {
            for artifact in run["artifacts"].as_array_mut().unwrap() {
                if artifact.get("dataUrl").is_none() {
                    let bytes = std::fs::read(artifact["path"].as_str().unwrap()).expect("captured real artifact original is required");
                    assert_eq!(format!("{:x}", Sha256::digest(&bytes)), artifact["sha256"].as_str().unwrap());
                    assert_eq!(bytes.len() as u64, artifact["bytes"].as_u64().unwrap());
                    artifact["dataUrl"] = Value::String(format!("data:application/json;base64,{}", STANDARD.encode(bytes)));
                }
            }
        }
        let captured = serde_json::to_string(&expected).unwrap();
        assert_eq!(expected["algorithmRuns"].as_array().unwrap().len(), 2);
        let scratch = Scratch::new().unwrap();
        let root = saved_project(&scratch, &captured);
        let path = root.to_str().unwrap();
        let run_id = expected["algorithmRuns"][1]["runId"].as_str().unwrap();
        let trial = version_create_kind(path, &captured, "real Pi complete trial", "trial", Some(run_id)).unwrap();
        set_tag(path, &trial.commit, "adopted", true).unwrap();
        let package = scratch.0.join("complete-package");
        crate::history_transfer::export_project(&root, &package).unwrap();
        std::fs::remove_dir_all(&root).unwrap();
        let imported = scratch.0.join("imported-project");
        crate::history_transfer::import_project(&package, &imported).unwrap();
        std::fs::remove_dir_all(&package).unwrap();
        let restored: Value = serde_json::from_str(&version_read(imported.to_str().unwrap(), &trial.commit).unwrap()).unwrap();
        assert_eq!(restored, expected);
        let history = version_list(imported.to_str().unwrap()).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].tags, vec!["adopted"]);
        assert_eq!(history[0].run_id.as_deref(), Some(run_id));
        for (old_run, new_run) in expected["algorithmRuns"].as_array().unwrap().iter().zip(restored["algorithmRuns"].as_array().unwrap()) {
            let old = old_run["artifacts"].as_array().unwrap();
            let new = new_run["artifacts"].as_array().unwrap();
            assert_eq!(old.len(), 9);
            assert_eq!(new.len(), 9);
            for (original, actual) in old.iter().zip(new) {
                let decode = |v: &Value| STANDARD.decode(v["dataUrl"].as_str().unwrap().split_once(',').unwrap().1).unwrap();
                let bytes = decode(actual);
                assert_eq!(bytes, decode(original));
                assert_eq!(format!("{:x}", Sha256::digest(&bytes)), actual["sha256"].as_str().unwrap());
                assert_eq!(bytes.len() as u64, actual["bytes"].as_u64().unwrap());
            }
        }
    }
    #[test]
    fn lazy_history_view_retains_real_dataset_assets_after_call_returns() {
        let temp=Scratch::new().unwrap();let root=temp.0.join("project");std::fs::create_dir_all(&root).unwrap();
        let fixture=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../research/opencv-traditional-10-2026-10-25/assets/box.png");let original=std::fs::read(&fixture).unwrap();
        crate::source_store::index_dataset_files(&root,&vec![fixture;1001],"capacity-not-diversity").unwrap();
        let content=read_workspace_lazy(&root).unwrap();let receipt=version_create(root.to_str().unwrap(),&content,"Actual file-backed dataset").unwrap();
        let restored:Value=serde_json::from_str(&version_read_lazy(root.to_str().unwrap(),&receipt.commit).unwrap()).unwrap();
        assert_eq!(restored["images"].as_array().unwrap().len(),1001);assert_eq!(restored["images"][1000]["dataURL"],"");
        let reference=&restored["images"][1000]["assetRef"];let source=PathBuf::from(reference["root"].as_str().unwrap());assert!(source.exists(),"lazy source survives returned function");
        assert_eq!(crate::workspace::read_workspace_asset_bytes(&source,reference).unwrap(),original);
        let again:Value=serde_json::from_str(&version_read_lazy(root.to_str().unwrap(),&receipt.commit).unwrap()).unwrap();assert_eq!(again["images"][0]["assetRef"],restored["images"][0]["assetRef"]);
    }

}
