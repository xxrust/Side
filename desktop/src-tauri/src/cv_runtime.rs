//! General, source-recorded Python execution. Algorithms and imports are not
//! allowlisted. This is a bounded subprocess with a clean environment, not a
//! security sandbox; trial outputs never imply human acceptance or publication.
use serde_json::{json, Value};
use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{atomic::{AtomicU64, Ordering}, RwLock, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

static RUN_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static EXECUTION_LOCK: Mutex<()> = Mutex::new(());
static ENVIRONMENT_LOCK: RwLock<()> = RwLock::new(());
const MAX_LOG_BYTES: usize = 1024 * 1024;
const MAX_RESULT_BYTES: u64 = 180 * 1024 * 1024;
const MAX_REQUEST_BYTES: usize = 100 * 1024 * 1024;

fn desktop_root() -> PathBuf {
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();
    if dev.is_dir() { dev } else {
        PathBuf::from(std::env::var("HOME").unwrap_or_default()).join("13-cv/desktop")
    }
}

// Runtime data belongs to the app-data directory in packaged builds. The
// environment is set once by main.rs; the development fallback keeps local
// `tauri dev` behaviour unchanged.
fn runtime_root() -> PathBuf {
    std::env::var_os("AGENTCV_RUNTIME_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| desktop_root().join("runtime"))
}

// Read-only recovery input, limited to this installation's recorded runtime.
fn recorded_sources(base: &Path, requested: &str) -> Result<Value, String> {
    let base = base.canonicalize().map_err(|_| "本機運算目錄不存在，無法核對來源")?;
    let path = Path::new(requested);
    let meta = fs::symlink_metadata(path).map_err(|_| "歷史運算目錄不存在，無法重建")?;
    if meta.file_type().is_symlink() || !meta.is_dir() { return Err("歷史來源目錄不安全".into()); }
    let root = path.canonicalize().map_err(|_| "歷史來源目錄不可讀")?;
    if root == base || !root.starts_with(&base) { return Err("歷史來源不在本機 AgentCV 運算目錄，未讀取")?; }
    let mut files: Vec<(String, String)> = Vec::new(); let mut total = 0usize;
    for item in fs::read_dir(&root).map_err(|_| "無法完整列舉歷史來源")? {
        let item = item.map_err(|_| "歷史來源清單不完整")?;
        let name = item.file_name().into_string().map_err(|_| "來源檔名不是有效文字")?;
        if !name.ends_with(".py") { continue; }
        let meta = fs::symlink_metadata(item.path()).map_err(|_| "歷史來源無法讀取")?;
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 1024 * 1024 { return Err("歷史 Python 來源不安全或超出大小限制".into()); }
        if files.len() >= 32 { return Err("歷史 Python 檔案超過數量限制".into()); }
        let bytes = fs::read(item.path()).map_err(|_| "歷史 Python 來源無法讀取")?;
        if bytes.len() > 1024 * 1024 { return Err("歷史 Python 來源過大".into()); }
        total = total.checked_add(bytes.len()).ok_or("歷史 Python 來源總量過大")?; if total > 4 * 1024 * 1024 { return Err("歷史 Python 來源總量過大".into()); }
        let text = String::from_utf8(bytes).map_err(|_| "歷史 Python 來源不是 UTF-8")?; files.push((name, text));
    }
    files.sort_by(|a,b| a.0.cmp(&b.0));
    Ok(json!({"listingComplete":true,"sourceFiles":files.into_iter().map(|(name,text)|json!({"name":name,"text":text})).collect::<Vec<_>>()}))
}
#[tauri::command]
pub async fn read_recorded_algorithm_sources(run_directory: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || recorded_sources(&runtime_root(), &run_directory)).await.map_err(|_| "讀取來源服務失敗")?
}

fn python_candidates() -> Vec<PathBuf> {
    let root = runtime_root();
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    let mut candidates = vec![root.join(if cfg!(windows) { "python/Scripts/python.exe" } else { "python/bin/python3" })];
    if let Some(value) = std::env::var_os("AGENTCV_PYTHON") {
        candidates.push(PathBuf::from(value));
    }
    candidates.extend([
        home.join(".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"),
        home.join(".local/bin/python3"), home.join(".nix-profile/bin/python3"),
        PathBuf::from("/opt/homebrew/bin/python3"), PathBuf::from("/usr/local/bin/python3"),
        PathBuf::from("/usr/bin/python3"),
    ]);
    if let Some(paths) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&paths).map(|path| path.join(if cfg!(windows) { "python.exe" } else { "python3" })));
    }
    // Explorer-launched applications do not inherit a terminal's activated
    // Conda/Python PATH. Discover registered Windows installations via PEP 514.
    #[cfg(windows)]
    candidates.extend(registered_windows_pythons());
    candidates
}

#[cfg(windows)]
fn registered_windows_pythons() -> Vec<PathBuf> {
    use winreg::{RegKey, enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY, KEY_WOW64_32KEY}};
    let mut candidates = Vec::new();
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            let Ok(root) = RegKey::predef(hive).open_subkey_with_flags("Software\\Python", KEY_READ | view) else { continue; };
            for company in root.enum_keys().flatten() {
                let Ok(company) = root.open_subkey(company) else { continue; };
                for tag in company.enum_keys().flatten() {
                    let Ok(install) = company.open_subkey(format!("{tag}\\InstallPath")) else { continue; };
                    let executable = install.get_value::<String, _>("ExecutablePath").ok().filter(|value| !value.trim().is_empty()).map(PathBuf::from)
                        .or_else(|| install.get_value::<String, _>("").ok().filter(|value| !value.trim().is_empty()).map(|value| PathBuf::from(value).join("python.exe")));
                    if let Some(path) = executable.filter(|path| path.is_absolute() && path.is_file()) {
                        if !candidates.contains(&path) { candidates.push(path); }
                    }
                }
            }
        }
    }
    candidates
}

fn python() -> Result<PathBuf, String> {
    // Avoid enumerating Windows registry installations for every warm node
    // when the higher-priority managed/explicit interpreter already exists.
    let managed=runtime_root().join(if cfg!(windows){"python/Scripts/python.exe"}else{"python/bin/python3"});
    if managed.is_file(){return Ok(managed);}
    if let Some(path)=std::env::var_os("AGENTCV_PYTHON").map(PathBuf::from).filter(|p|p.is_file()){return Ok(path);}
    python_candidates().into_iter().find(|path| path.is_file())
        .ok_or_else(|| "找不到 Python 3。請配置 AGENTCV_PYTHON，或建立專案的 runtime/python 環境。".into())
}

// Packaged builds keep the writable runtime (and its virtual environment) in
// app data, while the development checkout also contains the CV wheels used to
// bootstrap that environment.  The subprocess deliberately starts with a
// clean environment, so relying on the parent shell's PYTHONPATH makes a
// packaged run silently lose cv2/numpy.  Add only the known, installation-owned
// site-packages directories; never inherit a user's Python path.
fn managed_site_packages() -> Vec<PathBuf> {
    let mut roots = vec![
        runtime_root().join("python/lib"),
        desktop_root().join("runtime/python/lib"),
    ];
    roots.dedup();
    let mut result = Vec::new();
    for root in roots {
        let Ok(entries) = fs::read_dir(&root) else { continue; };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir()
                && path.file_name().and_then(|name| name.to_str()).is_some_and(|name| name.starts_with("python"))
            {
                let site = path.join("site-packages");
                if site.is_dir() && !result.contains(&site) { result.push(site); }
            }
        }
    }
    result
}

fn runner(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let bundled = app.path().resource_dir().map_err(|error| error.to_string())?.join("bridge/cv-runtime.py");
    if bundled.is_file() { return Ok(bundled); }
    let dev = desktop_root().join("scripts/cv-runtime.py");
    if cfg!(debug_assertions) && dev.is_file() { return Ok(dev); }
    Err("應用內缺少 Python 執行資源 cv-runtime.py，請重新打包。".into())
}

fn clean_command(executable: &Path, directory: &Path) -> Result<Command, String> {
    let home = directory.join("process-home");
    let cache = directory.join("process-cache");
    let tmp = directory.join("tmp");
    for path in [&home, &cache, &tmp] {
        fs::create_dir_all(path).map_err(|error| format!("無法建立算法執行目錄：{error}"))?;
    }
    let mut command = crate::background_command::new(executable);
    // Do not forward Pi credentials, API keys, proxy passwords, user Python
    // startup hooks or the calling terminal's environment to algorithm code.
    command.env_clear().current_dir(directory)
        .env("HOME", &home).env("USERPROFILE", &home)
        .env("XDG_CACHE_HOME", &cache).env("XDG_CONFIG_HOME", home.join(".config"))
        .env("TMPDIR", &tmp).env("TEMP", &tmp).env("TMP", &tmp)
        .env("PYTHONUTF8", "1").env("PYTHONNOUSERSITE", "1").env("PYTHONDONTWRITEBYTECODE", "1")
        .env("MPLBACKEND", "Agg").env("OPENBLAS_NUM_THREADS", "1").env("OMP_NUM_THREADS", "1")
        .env("PATH", std::env::join_paths([
            executable.parent().unwrap_or(Path::new("/usr/bin")).to_path_buf(),
            PathBuf::from("/usr/bin"), PathBuf::from("/bin"), PathBuf::from("/opt/homebrew/bin"), PathBuf::from("/usr/local/bin"),
        ]).map_err(|error| error.to_string())?)
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let site_packages = managed_site_packages();
    if !site_packages.is_empty() {
        command.env("PYTHONPATH", std::env::join_paths(site_packages).map_err(|error| error.to_string())?);
    }
    for key in ["SYSTEMROOT", "WINDIR", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"] {
        if let Some(value) = std::env::var_os(key) { command.env(key, value); }
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    Ok(command)
}

pub(crate) fn bounded_reader<R: Read + Send + 'static>(mut reader: R) -> thread::JoinHandle<String> {
    thread::spawn(move || {
        let mut result = Vec::new();
        let mut buffer = [0u8; 8192];
        let mut truncated = false;
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(length) => {
                    let room = MAX_LOG_BYTES.saturating_sub(result.len());
                    result.extend_from_slice(&buffer[..length.min(room)]);
                    if length > room { truncated = true; }
                }
            }
        }
        let mut text = String::from_utf8_lossy(&result).into_owned();
        if truncated { text.push_str("\n[host output truncated at 1 MB]\n"); }
        text
    })
}

struct ProcessResult { code: Option<i32>, timed_out: bool, stdout: String, stderr: String }
fn run_process(mut command: Command, seconds: u64) -> Result<ProcessResult, String> {
    let mut child = command.spawn().map_err(|error| format!("Python 子程序啟動失敗：{error}"))?;
    let stdout = bounded_reader(child.stdout.take().ok_or("缺少 Python stdout")?);
    let stderr = bounded_reader(child.stderr.take().ok_or("缺少 Python stderr")?);
    let started = Instant::now();
    let mut timed_out = false;
    let status;
    loop {
        if let Some(done) = child.try_wait().map_err(|error| error.to_string())? { status = done; break; }
        if started.elapsed() >= Duration::from_secs(seconds) {
            timed_out = true;
            #[cfg(unix)]
            unsafe { libc::kill(-(child.id() as i32), libc::SIGKILL); }
            let _ = child.kill();
            status = child.wait().map_err(|error| error.to_string())?;
            break;
        }
        thread::sleep(Duration::from_millis(30));
    }
    // A program can create helper subprocesses. Once its main process is done,
    // stop any remaining members so inherited stdout pipes cannot keep this
    // operation hanging after the declared computation has finished.
    #[cfg(unix)]
    unsafe { libc::kill(-(child.id() as i32), libc::SIGKILL); }
    Ok(ProcessResult {
        code: status.code(), timed_out,
        stdout: stdout.join().unwrap_or_else(|_| "stdout reader failed".into()),
        stderr: stderr.join().unwrap_or_else(|_| "stderr reader failed".into()),
    })
}

fn unique_directory(base: &Path) -> Result<(String, PathBuf), String> {
    for _ in 0..100 {
        let micros = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_micros();
        let seq = RUN_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let id = format!("py-{micros:x}-{}-{seq}", std::process::id());
        let path = base.join(&id);
        // Warm runs already have the parent. Try the exclusive directory
        // creation first; only prepare parents when the filesystem needs it.
        let created=fs::create_dir(&path).or_else(|error|{
            if error.kind()!=std::io::ErrorKind::NotFound{return Err(error);}
            fs::create_dir_all(base)?;fs::create_dir(&path)
        });
        match created {
            Ok(()) => return Ok((id, path)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("無法建立獨立算法運行目錄".into())
}

fn save_json(path: &Path, value: &Value) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    let mut file = fs::File::create(path).map_err(|error| error.to_string())?;
    file.write_all(text.as_bytes()).map_err(|error| error.to_string())
}

fn verify_artifact_files(result: &mut Value, directory: &Path, source_binding: &Value) -> Result<(), String> {
    verify_artifact_files_mode(result, directory, source_binding, "inline")
}
fn verify_artifact_files_mode(result: &mut Value, directory: &Path, source_binding: &Value, artifact_mode: &str) -> Result<(), String> {
    verify_artifact_bytes(result,directory,source_binding,artifact_mode,None,"","").map(|_|())
}
fn verify_artifact_bytes(result: &mut Value, directory: &Path, source_binding: &Value, artifact_mode: &str,
    memory:Option<&mut std::collections::BTreeMap<String,Vec<u8>>>,scope:&str,run_id:&str) -> Result<Value, String> {
    verify_artifact_bytes_with_deferred(result,directory,source_binding,artifact_mode,memory,scope,run_id,&[])
}
fn verify_artifact_bytes_with_deferred(result: &mut Value, directory: &Path, source_binding: &Value, artifact_mode: &str,
    memory:Option<&mut std::collections::BTreeMap<String,Vec<u8>>>,scope:&str,run_id:&str,deferred:&[Value]) -> Result<Value, String> {
    verify_artifact_bytes_with_capture(result,directory,source_binding,artifact_mode,memory,scope,run_id,deferred,&[])
}
fn verify_artifact_bytes_with_capture(result: &mut Value, directory: &Path, source_binding: &Value, artifact_mode: &str,
    mut memory:Option<&mut std::collections::BTreeMap<String,Vec<u8>>>,scope:&str,run_id:&str,deferred:&[Value],optional:&[Value]) -> Result<Value, String> {
    let mut stages=[0f64;5];
    let inspection = artifact_mode == "inspection";
    let inline = artifact_mode != "references" && !inspection;
    let memory_only = artifact_mode == "memory";
    if let Some(artifacts) = result.get_mut("artifacts").and_then(Value::as_array_mut) {
        if artifacts.len() > 48 { return Err("算法回傳產物超過 48 項".into()); }
        let canonical_started=Instant::now();
        let canonical_run = fs::canonicalize(directory).map_err(|error| error.to_string())?;
        stages[0]+=canonical_started.elapsed().as_secs_f64()*1000.;
        let mut bytes_total = 0usize;
        for artifact in artifacts {
            if artifact.get("collection").is_some() {
                if !inspection||memory.is_none()||!optional.contains(&artifact["id"])||!crate::artifact_capture::descriptor(artifact)
                    ||memory.as_ref().is_some_and(|m|artifact["id"].as_str().is_some_and(|id|m.contains_key(id))){return Err("未採集產物不符合本次診斷採集政策".into());}
                artifact["source"]=source_binding.clone();artifact["hostBytesVerified"]=json!(false);artifact["hostCollectionVerified"]=json!(true);
                continue;
            }
            let is_image = artifact.get("type").and_then(Value::as_str).unwrap_or("file") == "image";
            let raster = inspection && is_image;
            let raster_bytes = if raster {
                let width = artifact["width"].as_u64().filter(|&v| v > 0).ok_or("檢測像素寬度無效")?;
                let height = artifact["height"].as_u64().filter(|&v| v > 0).ok_or("檢測像素高度無效")?;
                let channels = artifact["channels"].as_u64().filter(|v| matches!(v, 1 | 3 | 4)).ok_or("檢測像素通道無效")?;
                let depth = match artifact["dtype"].as_str() {
                    Some("uint8") => 1,
                    Some("uint16") => 2,
                    _ => return Err("檢測像素位深無效".into()),
                };
                let size = width.checked_mul(height).and_then(|v| v.checked_mul(channels * depth)).ok_or("檢測像素尺寸溢出")?;
                if artifact["rasterEncoding"] != "raw-le" || artifact["bytes"].as_u64() != Some(size) {
                    return Err("檢測像素描述與資料不一致".into());
                }
                artifact["pixelRetention"] = json!("metadata-only");
                artifact["pixelAvailable"] = json!(false);
                artifact["mime"] = json!("application/octet-stream");
                let map = artifact.as_object_mut().ok_or("檢測圖像描述無效")?;
                map.remove("dataUrl");
                map.remove("dataURL");
                map.remove("assetRef");
                if !map.contains_key("path") && !map.get("residentRaster").and_then(Value::as_bool).unwrap_or(false) {
                    // This describes an output array; no file was produced or verified.
                    artifact["source"] = source_binding.clone();
                    artifact["hostBytesVerified"] = json!(false);
                    continue;
                }
                Some(size)
            } else { None };
            let memory_image = memory_only && is_image && artifact.get("path").is_none();
            let load_started=Instant::now();
            let memory_bytes=memory.as_mut().and_then(|m|artifact["id"].as_str().and_then(|id|m.remove(id)));
            let from_memory=memory_bytes.is_some();
            let (bytes, canonical_path) = if let Some(bytes)=memory_bytes {
                (bytes,None)
            } else if memory_image {
                let data_url = artifact.get("dataUrl").or_else(|| artifact.get("dataURL")).and_then(Value::as_str)
                    .ok_or("內存圖像產物缺少 dataUrl")?;
                let encoded = data_url.strip_prefix("data:image/png;base64,").ok_or("內存圖像產物必須是 PNG data URL")?;
                (STANDARD.decode(encoded).map_err(|error| format!("內存圖像產物 base64 無效：{error}"))?, None)
            } else {
                let artifact_path = artifact.get("path").and_then(Value::as_str).ok_or("算法產物缺少已保存 path")?;
                let canonical = fs::canonicalize(artifact_path).map_err(|error| format!("算法產物無法回讀：{error}"))?;
                if !canonical.starts_with(&canonical_run) || !canonical.is_file() { return Err("算法產物必須是本次運行目錄內的真實文件".into()); }
                let size = fs::metadata(&canonical).map_err(|error| error.to_string())?.len();
                if size > 24 * 1024 * 1024 { return Err("單個回傳產物超過 24 MB".into()); }
                (fs::read(&canonical).map_err(|error| error.to_string())?, Some(canonical))
            };
            stages[1]+=load_started.elapsed().as_secs_f64()*1000.;
            if bytes.len() > 24 * 1024 * 1024 { return Err("單個回傳產物超過 24 MB".into()); }
            if raster_bytes.is_some_and(|size| size != bytes.len() as u64) {
                return Err("檢測像素文件長度與描述不一致".into());
            }
            bytes_total += bytes.len();
            if bytes_total > 64 * 1024 * 1024 { return Err("算法回傳產物合計超過 64 MB".into()); }
            let hash_started=Instant::now();
            let verified=crate::memory_resources::VerifiedBytes::new(bytes);
            let bytes=verified.bytes();
            let hash=verified.digest();
            stages[2]+=hash_started.elapsed().as_secs_f64()*1000.;
            if from_memory && (artifact["sha256"]!=hash || artifact["bytes"].as_u64()!=Some(bytes.len() as u64)) {
                return Err("內存產物與實際回傳 bytes 不一致".into());
            }
            artifact["sha256"] = json!(hash);
            artifact["bytes"] = json!(bytes.len());
            artifact["source"] = source_binding.clone();
            if let Some(canonical) = canonical_path { artifact["path"] = json!(canonical.to_string_lossy()); }
            artifact["hostBytesVerified"] = json!(true);
            if memory_image {
                artifact["storage"] = json!("process-memory");
                artifact["pixelRetention"] = json!("current-workpiece-memory");
            }
            match artifact.get("type").and_then(Value::as_str).unwrap_or("file") {
                "image" if raster => {}
                "image" => {
                    if bytes.len() < 24 || bytes[..8] != [137,80,78,71,13,10,26,10] { return Err("算法圖像產物需為實際 PNG bytes".into()); }
                    artifact["width"] = json!(u32::from_be_bytes(bytes[16..20].try_into().unwrap()));
                    artifact["height"] = json!(u32::from_be_bytes(bytes[20..24].try_into().unwrap()));
                    artifact["mime"] = json!("image/png");
                    if inline && !memory_image {
                        let data_url = format!("data:image/png;base64,{}", STANDARD.encode(&bytes));
                        artifact["dataUrl"] = json!(data_url);
                        if !memory_only { artifact["dataURL"] = artifact["dataUrl"].clone(); }
                    }
                }
                "json" => {
                    let parse_started=Instant::now();
                    if inspection&&from_memory&&bytes.len()>=4096&&deferred.contains(&artifact["id"]){
                        crate::json_validation::validate(bytes).map_err(|error|format!("算法 JSON 產物無效：{error}"))?;
                        artifact["data"]=crate::deferred_trace::artifact_reference(&json!(run_id),&artifact["id"]);
                    }else{
                        artifact["data"] = serde_json::from_slice(&bytes).map_err(|error| format!("算法 JSON 產物無效：{error}"))?;
                    }
                    stages[3]+=parse_started.elapsed().as_secs_f64()*1000.;
                    // Parsed values do not preserve whitespace, numeric spelling or raw hashes.
                    // Archive the verified original JSON alongside its convenient parsed view.
                    artifact["mime"] = json!("application/json");
                    if inline {
                        artifact["dataUrl"] = json!(format!("data:application/json;base64,{}", STANDARD.encode(&bytes)));
                        if !memory_only { artifact["dataURL"] = artifact["dataUrl"].clone(); }
                    }
                }
                _ => {
                    // A path alone would become a broken reference when the
                    // project moves to another computer. Embed the exact bytes
                    // verified above so workspace storage can externalize them
                    // as content-addressed data, never as an executable launch.
                    artifact["mime"] = json!("application/octet-stream");
                    if inline {
                        let data_url = format!("data:application/octet-stream;base64,{}", STANDARD.encode(&bytes));
                        artifact["dataUrl"] = json!(data_url);
                        if !memory_only { artifact["dataURL"] = artifact["dataUrl"].clone(); }
                    }
                }
            }
            if from_memory && !is_image {
                let retain_started=Instant::now();
                let mime=artifact["mime"].as_str().unwrap_or("application/octet-stream");
                artifact["memoryRef"]=crate::memory_resources::retain_verified(scope,run_id,artifact["id"].as_str().ok_or("產物識別無效")?,mime,verified)?;
                stages[4]+=retain_started.elapsed().as_secs_f64()*1000.;
            }
        }
    }
    if memory.is_some_and(|m|!m.is_empty()){return Err("內存回傳包含未宣告產物".into());}
    Ok(json!({"canonicalizeMs":stages[0],"loadBytesMs":stages[1],"hashMs":stages[2],"jsonParseMs":stages[3],"retainBytesMs":stages[4],
        "scope":"non-overlapping nested portions of verificationMs; descriptor validation, source stamping and other work remain in parent interval"}))
}

fn info_impl(script: PathBuf) -> Result<Value, String> {
    let executable = python()?;
    let directory = runtime_root().join("cv-environment");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let mut command = clean_command(&executable, &directory)?;
    command.arg(&script).arg("--probe");
    let observed = run_process(command, 45)?;
    if observed.timed_out || observed.code != Some(0) {
        return Err(format!("Python 環境檢查失敗：{}", observed.stderr));
    }
    let mut info: Value = serde_json::from_str(observed.stdout.trim()).map_err(|error| format!("Python 環境回覆無效：{error}"))?;
    info["managedEnvironment"] = json!(runtime_root().join("python").to_string_lossy());
    info["environmentSelection"] = json!("Project-managed runtime/python first; AGENTCV_PYTHON and system Python are bootstrap/discovery fallbacks. Installed packages are used by subsequent project runs.");
    info["defaultRunDirectory"] = json!(runtime_root().join("cv-runs").to_string_lossy());
    info["resourceBudgets"] = json!({"timeoutSeconds":{"default":120,"min":1,"max":600},
        "inputImagesPerRun":16,"decodedInputPixelsPerImage":64000000,"inputBytesTotal":67108864,
        "returnedArtifactsPerRun":48,"returnedArtifactBytesTotal":67108864,
        "note":"Process/input/output budgets, not algorithm-kind restrictions; split larger image sets into repeatable runs."});
    info["sdk"] = json!({
        "image": "First original input as numpy BGR array, full source resolution and native uint8/uint16 depth",
        "images": "List of all original input BGR arrays; image_records contains ids, native dtype/channels and byte SHA-256. Ordinary inspection path is null; no input file is created by default.",
        "input_file": "input_file(index=0) explicitly requests one private writable temporary input copy; returns pathlib.Path and updates image_records[index].path/fileStatus. It never modifies or archives the original source.",
        "raw_images": "Original decoded arrays preserving native depth, grayscale and alpha (GRAY/BGR/BGRA), after explicit EXIF orientation",
        "gray": "First input grayscale conversion; original image is also available",
        "parameters": "Request parameters object; params is an alias",
        "globals": ["np", "cv2", "Image", "source", "run_directory", "output_directory"],
        "save_image": "save_image(id, array, color_order='BGR', label=None, section='tool') -> artifact id; bool,uint8,uint16 supported; section tool/parameters/boundary is a display tag",
        "save_json": "save_json(id, value, section='parameters') -> artifact id",
        "save_array": "save_array(id, numpy_array) -> .npy artifact id",
        "save_file": "save_file(id, path, section='tool') -> register any file generated inside this run directory, e.g. model weights or point cloud",
        "result": "Assign any JSON-compatible result; numpy arrays/scalars are converted. Optional boundaryChecks array is available to host evidence audit.",
        "imports": "Normal Python import and user-defined functions/classes; no algorithm allowlist"
    });
    Ok(info)
}

#[tauri::command]
pub async fn cv_runtime_info(app: tauri::AppHandle) -> Result<Value, String> {
    let script = runner(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = ENVIRONMENT_LOCK.read().map_err(|error| error.to_string())?;
        info_impl(script)
    }).await.map_err(|error| error.to_string())?
}

fn execute_impl(script: PathBuf, request: Value) -> Result<Value, String> {
    let _execution = EXECUTION_LOCK.lock().map_err(|e|e.to_string())?;
    execute_locked(script,request)
}

// Caller owns EXECUTION_LOCK for the entire workpiece, including all nodes.
fn execute_locked(script: PathBuf, mut request: Value) -> Result<Value, String> {
    let native_started = Instant::now();
    if !request.is_object() { return Err("算法請求必須為 JSON object".into()); }
    let preview_limit=request.get("previewMaxDimension").map(|limit|limit.as_u64().filter(|n|(64..=4096).contains(n)).map(|n|n as usize).ok_or("顯示預覽尺寸限制無效")).transpose()?;
    let code = request.get("code").and_then(Value::as_str).ok_or("缺少 Python code")?.to_owned();
    if code.trim().is_empty() || code.len() > 1024 * 1024 { return Err("Python code 必須為 1–1048576 bytes".into()); }
    let images = request.get("images").and_then(Value::as_array).ok_or("缺少原圖 images")?;
    if images.is_empty() || images.len() > 16 { return Err("單次算法需提供 1–16 張原圖".into()); }
    let seconds = request.get("timeoutSeconds").and_then(Value::as_u64).unwrap_or(120);
    if !(1..=600).contains(&seconds) { return Err("timeoutSeconds 必須為 1–600 秒；這是本次程序資源預算，可調整".into()); }
    let base = if let Some(path) = request.get("workspaceRoot").and_then(Value::as_str) {
        let root = PathBuf::from(path);
        if !root.is_absolute() || !root.is_dir() { return Err("workspaceRoot 必須為目前已存在的專案絕對目錄".into()); }
        root.join("algorithm-runs")
    } else { runtime_root().join("cv-runs") };
    let (id, directory) = unique_directory(&base)?;
    request["runId"] = json!(id);
    request["timeoutSeconds"] = json!(seconds);
    let identity_directory_ms=native_started.elapsed().as_secs_f64()*1000.;
    let plan_started=Instant::now();
    let resident_plan=crate::resident_worker::resolve_plan(&request)?;
    let resident_key=resident_plan.as_ref().map(|plan|plan.key.clone());
    let plan_token=resident_key.clone();
    let memory_transport=resident_key.is_some()&&request["artifactMode"]=="inspection";
    let optional_json=if memory_transport{resident_plan.as_ref().map(|plan|crate::artifact_capture::eligible(&request,&plan.definition)).unwrap_or_default()}else{vec![]};
    // Never accept a caller-supplied list in place of the resolved graph policy.
    request["optionalJsonArtifactIds"]=json!(optional_json);

    let memory_scope=format!("{:x}",Sha256::digest(serde_json::to_vec(&json!({"plan":resident_key,"root":base,"session":request["runtimeSessionId"],
        "unit":if request["workpieceUnit"].is_object(){&request["workpieceUnit"]}else{&request["sourceBinding"]}})).map_err(|e|e.to_string())?));
    if memory_transport {request["runtimeMemoryScope"]=json!(memory_scope);}
    if request["artifactMode"] == "inspection" {
        let plan = &request["runtimePlan"];
        let node = plan["nodeId"].as_str().ok_or("普通檢測需要已編譯節點")?;
        let mut outputs = std::collections::BTreeSet::new();
        if let Some(nodes) = resident_plan.as_ref().and_then(|plan|plan.definition["operatorGraph"]["nodes"].as_array()) {
            for consumer in nodes {
                if let Some(inputs) = consumer["inputs"].as_object() {
                    for input in inputs.values().filter(|input| input["nodeId"] == node) {
                        if let Some(id) = input["artifactId"].as_str() { outputs.insert(id.to_owned()); }
                    }
                }
            }
        }
        request["inspectionRasterOutputs"] = json!(outputs);
    }
    let plan_ms=plan_started.elapsed().as_secs_f64()*1000.;
    let inputs_started=Instant::now();
    let resident_requested=resident_key.is_some();
    let mut original_inputs=Vec::new();
    if resident_requested {
        let assets=base.join("input-assets");if !memory_transport{fs::create_dir_all(&assets).map_err(|e|e.to_string())?;}
        let mut total_original_bytes=0usize;
        for image in request["images"].as_array_mut().unwrap() {
            if memory_transport {
                if let Some(original)=crate::original_resources::lookup(image)? {
                    total_original_bytes+=original.bytes.len();if total_original_bytes>64*1024*1024{return Err("原圖總量超過64MB".into());}
                    let map=image.as_object_mut().unwrap();map.remove("dataUrl");map.remove("dataURL");map.remove("assetRef");map.remove("runtimeInput");map.insert("hostOriginal".into(),original.reference.clone());
                    original_inputs.push(original);continue;
                }
            }
            let bytes=if let Some(reference)=image.get("assetRef") {
                let root=reference.get("root").and_then(Value::as_str).ok_or("原圖資產缺少根目錄")?;
                crate::workspace::read_workspace_asset_bytes(std::path::Path::new(root),reference)?
            } else {
                let url=image.get("dataUrl").or_else(||image.get("dataURL")).and_then(Value::as_str).ok_or("原圖資料缺失")?;
                let encoded=url.split_once(",").ok_or("原圖格式錯誤")?.1;
                STANDARD.decode(encoded).map_err(|e|e.to_string())?
            };
            if bytes.len()>64*1024*1024{return Err("單圖超過64MB輸入限制".into());}
            total_original_bytes+=bytes.len();if total_original_bytes>64*1024*1024{return Err("原圖總量超過64MB".into());}
            if memory_transport {
                let original=crate::original_resources::capture(image,bytes)?;
                let map=image.as_object_mut().unwrap();map.remove("dataUrl");map.remove("dataURL");map.remove("assetRef");map.remove("runtimeInput");map.insert("hostOriginal".into(),original.reference.clone());
                original_inputs.push(original);continue;
            }
            let hash=format!("{:x}",Sha256::digest(&bytes));
            if image["source"]["contentSha256"].as_str().is_some_and(|v|v!=hash){return Err("原圖與來源內容雜湊不一致".into());}
            let path=assets.join(format!("{hash}.original"));
            if path.exists(){if format!("{:x}",Sha256::digest(fs::read(&path).map_err(|e|e.to_string())?))!=hash{return Err("原圖資產快取損壞".into());}}
            else{fs::write(&path,&bytes).map_err(|e|e.to_string())?;}
            let map=image.as_object_mut().unwrap();map.remove("dataUrl");map.remove("dataURL");map.insert("hostAsset".into(),json!({"path":path,"sha256":hash,"bytes":bytes.len()}));
        }
    }
    let inputs_ms=inputs_started.elapsed().as_secs_f64()*1000.;
    let request_started=Instant::now();
    // All source, inputs and conditions exist before the user code is dispatched.
    if memory_transport {request["runtimePlan"].as_object_mut().unwrap().remove("definition");}
    else if let Some(plan)=&resident_plan {
        // Legacy request-file callers keep their complete dispatch snapshot.
        request["runtimePlan"]["definition"]=plan.definition.as_ref().clone();
    }
    if memory_transport {
        if let Some(upstream)=request["upstream"].as_object_mut(){for input in upstream.values_mut(){
            if input["artifact"]["residentJson"]==true&&input["artifact"]["type"]=="json" {
                input["artifact"].as_object_mut().unwrap().remove("data");
            }
        }}
    }
    let encoded = serde_json::to_vec(&request).map_err(|error| error.to_string())?;
    if encoded.len() > MAX_REQUEST_BYTES { return Err("算法請求超過 100 MB 資源限制".into()); }
    if !memory_transport {
        fs::write(directory.join("algorithm.py"), &code).map_err(|error| error.to_string())?;
        fs::write(directory.join("request.json"), &encoded).map_err(|error| error.to_string())?;
    }
    let request_encoding_ms=request_started.elapsed().as_secs_f64()*1000.;
    let interpreter_started=Instant::now();
    // A live resident worker already owns its interpreter. Resolve discovery
    // paths only when that worker actually launches; package installation
    // invalidates it while holding ENVIRONMENT_LOCK for writing.
    let executable = if resident_key.is_none(){Some(python()?)}else{None};
    let interpreter_ms=interpreter_started.elapsed().as_secs_f64()*1000.;
    let preparation_ms = native_started.elapsed().as_secs_f64() * 1000.0;
    let started = Instant::now();
    let mut resident_receipt=None;
    let observed = if let Some(key)=resident_key {
        // A separate control socket keeps arbitrary program stdout out of IPC.
        let worker_root=base.join("resident").join(&key);
        match crate::resident_worker::execute(&key,&script,&worker_root,||clean_command(&python()?,&worker_root),&directory.join("request.json"),if memory_transport{Some(&encoded)}else{None},&original_inputs,&directory,seconds){
            Ok(receipt)=>{resident_receipt=Some(receipt);ProcessResult{code:Some(0),timed_out:false,stdout:String::new(),stderr:String::new()}},
            Err(error)=>ProcessResult{code:None,timed_out:false,stdout:String::new(),stderr:error},
        }
    }else{
        let mut command = clean_command(executable.as_ref().unwrap(), &directory)?;
        command.arg(&script).arg("--run").arg(directory.join("request.json")).arg(&directory);
        run_process(command, seconds)?
    };
    let process_ms = started.elapsed().as_secs_f64() * 1000.0;
    let read_started = Instant::now();
    // Restore the host's dispatch snapshot, even if a program wrote files with
    // these names. It remains the exact source sent for this run.
    if !memory_transport || observed.code!=Some(0) {
        fs::write(directory.join("algorithm.py"), &code).map_err(|error| error.to_string())?;
        fs::write(directory.join("request.json"), &encoded).map_err(|error| error.to_string())?;
        fs::write(directory.join("host-stdout.log"), &observed.stdout).map_err(|error| error.to_string())?;
        fs::write(directory.join("host-stderr.log"), &observed.stderr).map_err(|error| error.to_string())?;
    }
    let path = directory.join("result.json");
    let memory_report=resident_receipt.as_mut().and_then(|receipt|receipt.report.take());
    let mut result = if let Some(report)=memory_report {
        if report["runId"]!=id || report["sourceBinding"]!=request["sourceBinding"] {return Err("常駐結果與本次工件身份不一致".into());}
        report
    } else if !memory_transport && (!resident_requested || resident_receipt.is_some()) && !observed.timed_out && path.is_file() && fs::metadata(&path).map_err(|error| error.to_string())?.len() <= MAX_RESULT_BYTES {
        serde_json::from_slice::<Value>(&fs::read(&path).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?
    } else {
        json!({
            "schema":"agentcv-python-runtime-1", "runId":id,
            "status":if observed.timed_out {"TIMEOUT"} else {"FAILED"},
            "code":code, "codeSha256":format!("{:x}", Sha256::digest(code.as_bytes())),
            "title":request["title"], "parameters":request["parameters"], "justification":request["justification"],
            "sourceBinding":request["sourceBinding"], "source":request["sourceBinding"],
            "runDirectory":directory.to_string_lossy(), "artifacts":[], "result":null,
            "stdout":observed.stdout,"stderr":observed.stderr,"durationMs":started.elapsed().as_millis(),
            "error":{"type":if observed.timed_out {"TimeoutError"} else {"PythonProcessError"},
                "message":if observed.timed_out {format!("算法超過本次 {seconds} 秒預算，程序已停止；程式與輸入仍保存，可調整預算後重跑。")}
                    else {format!("Python 程序未保存有效結果（exit {:?}），查看 host-stderr.log 修正程式或依賴。",observed.code)}},
            "stage":"TRIAL","humanConfirmed":false,"delivered":false
        })
    };
    if observed.timed_out || observed.code != Some(0) {
        result["status"] = json!(if observed.timed_out {"TIMEOUT"} else {"FAILED"});
    }
    result["processExitCode"] = json!(observed.code);
    result["processTimedOut"] = json!(observed.timed_out);
    result["dispatchSourceBinding"] = request["sourceBinding"].clone();
    // Preserve the host's invocation identity independently of program output.
    result["dispatchCodeSha256"] = json!(format!("{:x}", Sha256::digest(code.as_bytes())));
    result["codeSha256"] = result["dispatchCodeSha256"].clone();
    result["code"] = json!(code);
    result["title"] = request["title"].clone();
    result["parameters"] = request["parameters"].clone();
    result["justification"] = request["justification"].clone();
    result["sourceBinding"] = request["sourceBinding"].clone();
    result["visualEvidence"] = request["visualEvidence"].clone();
    result["source"] = request["sourceBinding"].clone();
    result["runDirectory"] = json!(directory.to_string_lossy());
    result["runId"] = json!(id);
    result["artifactMode"] = request["artifactMode"].clone();
    if let Some(token)=plan_token {result["runtimePlanToken"]=json!(token);}
    result["stage"] = json!("TRIAL");
    result["humanConfirmed"] = json!(false);
    result["delivered"] = json!(false);
    // Re-read saved bytes in the native host. A script's base64 text or saved
    // hash is not sufficient to establish which artifact file was returned.
    let result_read_ms = read_started.elapsed().as_secs_f64() * 1000.0;
    let verify_started = Instant::now();
    let artifact_mode = request["artifactMode"].as_str().unwrap_or("inline");
    // A direct request cannot defer typed outputs even if it supplies an ID.
    let deferred:Vec<Value>=request["deferredJsonArtifactIds"].as_array().into_iter().flatten().filter(|id|
        request["expectedOutputs"].as_array().is_some_and(|outputs|outputs.iter().any(|output|output["id"]==**id&&output["dataContract"]==json!({"kind":"json"})))
    ).cloned().collect();
    let verification_stages=verify_artifact_bytes_with_capture(&mut result, &directory, &request["sourceBinding"], artifact_mode,
        if memory_transport{resident_receipt.as_mut().map(|receipt|&mut receipt.artifacts)}else{None},&memory_scope,&id,&deferred,&optional_json)?;
    let verification_ms = verify_started.elapsed().as_secs_f64() * 1000.0;
    let host_ms = started.elapsed().as_secs_f64() * 1000.0;
    if !result["execution"].is_object() { result["execution"] = json!({}); }
    result["execution"]["status"] = json!(if result["status"] == "SUCCEEDED" {"COMPLETED"} else {"FAULT"});
    if observed.timed_out { result["execution"]["reason"] = json!("TIMEOUT"); }
    else if observed.code != Some(0) { result["execution"]["reason"] = json!("WORKER_CRASH"); }
    result["execution"]["hostDurationMs"] = json!(host_ms);
    result["timing"]["hostProcessMs"] = json!(host_ms);
    if request["artifactMode"] == "references" {
        if let Some(artifacts) = result.get_mut("artifacts").and_then(Value::as_array_mut) {
            for artifact in artifacts {
                artifact["assetRef"] = json!({"kind":"algorithm-artifact", "runId":id,
                    "artifactId":artifact["id"], "path":artifact["path"], "sha256":artifact["sha256"], "mime":artifact["mime"]});
                if let Some(map) = artifact.as_object_mut() { map.remove("dataUrl"); map.remove("dataURL"); }
            }
        }
    }
    result["timing"]["native"] = json!({"clock":"monotonic", "artifactMode":artifact_mode, "preparationMs":preparation_ms, "processMs":process_ms, "resultReadMs":result_read_ms, "verificationMs":verification_ms, "scope":"native handler; process includes interpreter startup, runtime execution and exit; program duration is nested, not additive"});
    result["timing"]["native"]["preparationStages"]=json!({"identityAndDirectoryMs":identity_directory_ms,"planMs":plan_ms,
        "originalInputsMs":inputs_ms,"requestEncodingMs":request_encoding_ms,"interpreterSelectionMs":interpreter_ms,
        "otherMs":preparation_ms-identity_directory_ms-plan_ms-inputs_ms-request_encoding_ms-interpreter_ms,
        "residentInterpreterSelection":"inside processMs, only during worker launch/restart",
        "scope":"exclusive nested stages of preparationMs; includes every preparation operation"});
    result["timing"]["native"]["verificationStages"]=verification_stages;
    if let Some(receipt)=resident_receipt.as_ref() {
        result["timing"]["resident"]=json!({"backend":"rust-supervised-python-extension","pid":receipt.pid,"call":receipt.call,"coldStart":receipt.cold,"roundTripMs":receipt.elapsed_ms,"planBound":true,"originalTransferBytes":receipt.original_transfer_bytes,"exchange":receipt.exchange_timing});
        /* A program-level FAILED result (e.g. INSUFFICIENT_MEASURED_EDGES) leaves a healthy worker; only a timeout needs a restart. Transport errors are already cleared inside resident_worker::execute. */ if result["status"]=="TIMEOUT" {crate::resident_worker::invalidate();}
    }
    // Persist one verified report. Completion timing is added to the returned
    // receipt after the write and is included in the durable inspection record.
    let result_write_started = Instant::now();
    if !memory_transport || result["status"]!="SUCCEEDED" {
        let bytes = serde_json::to_vec(&result).map_err(|error| error.to_string())?;
        fs::write(&path, bytes).map_err(|error| error.to_string())?;
        if memory_transport {
            fs::write(directory.join("algorithm.py"), &code).map_err(|e|e.to_string())?;
            fs::write(directory.join("request.json"), &encoded).map_err(|e|e.to_string())?;
        }
    }
    result["timing"]["native"]["resultWriteMs"] = json!(result_write_started.elapsed().as_secs_f64() * 1000.0);
    // Attach the live pixels only to the IPC response, after report persistence.
    if artifact_mode == "inspection" {
        if let Some(mut receipt) = resident_receipt {
            if let Some(artifacts) = result.get_mut("artifacts").and_then(Value::as_array_mut) {
                for artifact in artifacts.iter_mut().filter(|a| a["type"] == "image") {
                    let Some(bytes) = artifact["id"].as_str().and_then(|id| receipt.live_images.remove(id)) else { continue };
                    if bytes.len() < 54 || &bytes[..2] != b"BM"
                        || u32::from_le_bytes(bytes[2..6].try_into().unwrap()) as usize != bytes.len()
                        || Some(u32::from_le_bytes(bytes[18..22].try_into().unwrap()) as u64) != artifact["width"].as_u64()
                        || Some(u32::from_le_bytes(bytes[22..26].try_into().unwrap()) as u64) != artifact["height"].as_u64() {
                        return Err("即時顯示影像與本次產物尺寸不一致".into());
                    }
                    let reduced=if let Some(limit)=preview_limit{
                        crate::display_preview::resize(&bytes,limit)?
                    }else{None};
                    let reference=crate::memory_resources::retain(&memory_scope,&id,artifact["id"].as_str().ok_or("即時產物識別無效")?,"image/bmp",bytes)?;
                    artifact["dataUrl"] = json!(crate::memory_resources::url(&reference));
                    if let Some((preview,width,height))=reduced{
                        let derived=crate::memory_resources::retain(&memory_scope,&id,&format!("{}#display-preview",artifact["id"].as_str().unwrap()),"image/bmp",preview)?;
                        artifact["displayPreview"]=json!({"schema":"agentcv-display-preview-1","src":crate::memory_resources::url(&derived),"width":width,"height":height,"reference":derived,"originalReference":reference,"sampling":"bilinear-pixel-centers"});
                    }
                    artifact["storage"] = json!("process-memory");
                }
            }
            if !receipt.live_images.is_empty() { return Err("即時影像沒有對應本次產物".into()); }
        }
    }
    if memory_transport {
        result["runtimeInputResources"]=json!(original_inputs.iter().map(|v|&v.reference).collect::<Vec<_>>());
        result["timing"]["native"]["memoryResources"]=crate::memory_resources::stats()?;
        result["timing"]["native"]["originalResources"]=crate::original_resources::stats()?;
    }
    result["timing"]["native"]["totalMs"] = json!(native_started.elapsed().as_secs_f64() * 1000.0);
    Ok(result)
}

#[tauri::command]
pub async fn prepare_inspection_runtime(app:tauri::AppHandle,request:Value)->Result<Value,String>{
 let script=runner(&app)?;
 tauri::async_runtime::spawn_blocking(move||{
  let _environment=ENVIRONMENT_LOCK.read().map_err(|e|e.to_string())?;
  let _execution=EXECUTION_LOCK.lock().map_err(|e|e.to_string())?;
  let plan=crate::resident_worker::resolve_plan(&request)?.ok_or("缺少準備方案")?;
  // Desktop sessions use this same default worker root. This prepares imports
  // only: no image read, program compilation, operator exec or result creation.
  let root=runtime_root().join("cv-runs").join("resident").join(&plan.key);
  crate::resident_worker::prepare(&plan.key,&script,&root,||clean_command(&python()?,&root))
 }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn prepare_inspection_programs(app:tauri::AppHandle,request:Value)->Result<Value,String>{
 let command_started=Instant::now();
 let script=runner(&app)?;
 tauri::async_runtime::spawn_blocking(move||{
  let _environment=ENVIRONMENT_LOCK.read().map_err(|e|e.to_string())?;
  let _execution=EXECUTION_LOCK.lock().map_err(|e|e.to_string())?;
  let queue_ms=command_started.elapsed().as_secs_f64()*1000.;
  let plan_started=Instant::now();
  let plan=crate::resident_worker::resolve_plan(&request)?.ok_or("缺少準備方案")?;
  let nodes=plan.definition["operatorGraph"]["nodes"].as_array().ok_or("SESSION_NODES_REQUIRED")?;
  let codes:Vec<String>=nodes.iter().filter(|node|!node["nativePlan"].is_object()).map(|node|node["code"].as_str().map(str::to_owned).ok_or("SESSION_CODE_REQUIRED")).collect::<Result<_,_>>()?;
  let root=runtime_root().join("cv-runs").join("resident").join(&plan.key);
  let plan_ms=plan_started.elapsed().as_secs_f64()*1000.;
  let worker_started=Instant::now();
  let mut result=crate::resident_worker::prepare_programs(&plan.key,&script,&root,&codes,||clean_command(&python()?,&root))?;
  let worker_ms=worker_started.elapsed().as_secs_f64()*1000.;
  result["commandTiming"]=json!({"queueMs":queue_ms,"planMs":plan_ms,"workerMs":worker_ms,"totalMs":command_started.elapsed().as_secs_f64()*1000.,"scope":"command entry through worker completion; queue includes setup and locks; compileMs/preparationMs are nested inside workerMs; IPC decoding and return delivery excluded"});
  Ok(result)
 }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn execute_inspection_session(app: tauri::AppHandle, request: Value, progress:tauri::ipc::Channel<Value>) -> Result<tauri::ipc::Response,String> {
    let queued=Instant::now();let script=runner(&app)?;
    let registration=crate::inspection_service::register(request["sessionId"].as_str().ok_or("SESSION_ID_REQUIRED")?)?;
    let input_gate=crate::inspection_input_gate::register(&request)?;
    tauri::async_runtime::spawn_blocking(move||{
        let _environment=ENVIRONMENT_LOCK.read().map_err(|e|e.to_string())?;
        let _execution=EXECUTION_LOCK.lock().map_err(|e|e.to_string())?;
        let queue_ms=queued.elapsed().as_secs_f64()*1000.;
        let deferred=request["commit"]["mode"]=="background";
        let maintenance=request["runtimeMaintenance"]==true;
        let maintenance_session=request["sessionId"].as_str().unwrap_or_default().to_owned();
        let maintenance_unit=request["unitId"].as_str().unwrap_or_default().to_owned();
        let mut input_admitted=false;
        let mut result=crate::inspection_service::execute_with_commit(request,|node|execute_locked(script.clone(),node),
            ||registration.cancelled.load(Ordering::Acquire),|event|{let _=progress.send(event);},|product|{
                if let Some(gate)=&input_gate{gate.wait(||registration.cancelled.load(Ordering::Acquire))?;}
                input_admitted=true;
                if deferred {crate::inspection_archive::enqueue_desktop(app.clone(),product)}
                else {crate::inspection_files::save_inspection_unit_impl(app.clone(),product)}
            })?;
        // A cancellation after archive admission must not relabel that terminal unit.
        if !input_admitted{if let Some(gate)=&input_gate{gate.wait(||registration.cancelled.load(Ordering::Acquire))?;}}
        result["timing"]["queueMs"]=json!(queue_ms);
        if maintenance {
            if let Some(run)=result["runs"].as_array().and_then(|runs|runs.iter().rev().find(|run|run["timing"]["resident"]["pid"].is_u64())) {
                let pid=run["timing"]["resident"]["pid"].as_u64().unwrap() as u32;
                let call=run["timing"]["resident"]["call"].as_u64().ok_or("MAINTENANCE_CALL_REQUIRED")?;
                result["runtimeMaintenance"]=crate::runtime_maintenance::begin(&maintenance_session,&maintenance_unit,pid,call)?;
            }
        }
        // Return UTF-8 bytes through Tauri's binary response body. A large JSON
        // tree otherwise gets escaped again as JavaScript callback source.
        Ok(tauri::ipc::Response::new(encode_session_response(result)?))
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn await_inspection_maintenance(reference:Value)->Result<Value,String>{
    tauri::async_runtime::spawn_blocking(move||crate::runtime_maintenance::join(reference)).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub fn verify_inspection_session_input(session_id:String,accepted:bool,source_binding:Value)->Result<(),String>{
    crate::inspection_input_gate::acknowledge(&session_id,accepted,&source_binding)
}

// Measure the previously invisible return path without serializing the tree a
// second time. Metadata is appended as an ordinary JSON root field, so existing
// consumers and independent disk oracles still read the exact same full facts.
// Tree destruction happens before the response can be returned and belongs to
// framework time too. The tiny metadata append itself is outside this span.
fn encode_session_response(mut result: Value) -> Result<Vec<u8>,String> {
    if !result.is_object() || result.get("_responseEncoding").is_some() {
        return Err("SESSION_RESPONSE_ENVELOPE_INVALID".into());
    }
    let started=Instant::now();
    crate::shared_facts::compact(&mut result)?;
    let compact_ns=started.elapsed().as_nanos();
    let serializing=Instant::now();
    let mut bytes=serde_json::to_vec(&result).map_err(|e|e.to_string())?;
    let json_encode_ns=serializing.elapsed().as_nanos();
    let encode_ns=started.elapsed().as_nanos();
    let releasing=Instant::now();drop(result);
    let release_ns=releasing.elapsed().as_nanos();
    let json_bytes=bytes.len();
    let sent_ms=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_millis()).unwrap_or(0);let closing=bytes.pop();debug_assert_eq!(closing,Some(b'}'));
    write!(&mut bytes,",\"_responseEncoding\":{{\"backend\":\"rust-json-once-v1\",\"encodeNs\":{encode_ns},\"compactNs\":{compact_ns},\"jsonEncodeNs\":{json_encode_ns},\"releaseNs\":{release_ns},\"jsonBytes\":{json_bytes},\"sentAtMs\":{sent_ms}}}}}").map_err(|e|e.to_string())?;
    Ok(bytes)
}

#[cfg(test)]
mod response_encoding_tests {
    use super::*;
    #[test]
    fn response_encoding_retains_every_json_value_and_reports_actual_payload_size() {
        let original=json!({"runs":[{"code":"original\n算法","result":{"small":1.2345678901234567,"large":9007199254740991u64,"negativeZero":-0.0},"artifacts":[{"data":{"__proto__":{"safe":true},"quote":"\"\\\n"}}]}],"timing":{"nativeMs":12.5}});
        let encoded=encode_session_response(original.clone()).unwrap();
        let mut parsed:Value=serde_json::from_slice(&encoded).unwrap();
        let timing=parsed.as_object_mut().unwrap().remove("_responseEncoding").unwrap();
        assert_eq!(parsed,original);
        assert_eq!(timing["jsonBytes"].as_u64().unwrap() as usize,serde_json::to_vec(&original).unwrap().len());
        let encode=timing["encodeNs"].as_u64().unwrap();
        let compact=timing["compactNs"].as_u64().unwrap();
        let serialize=timing["jsonEncodeNs"].as_u64().unwrap();
        assert!(compact+serialize<=encode);
        assert!(timing["releaseNs"].as_u64().is_some());
    }
    #[test]
    fn response_metadata_cannot_be_shadowed() {
        assert!(encode_session_response(json!({"_responseEncoding":null})).is_err());
        assert!(encode_session_response(json!([])).is_err());
    }
}

#[tauri::command]
pub fn cancel_inspection_session(session_id:String)->Result<bool,String>{crate::inspection_service::cancel(&session_id)}

#[tauri::command]
pub async fn execute_cv_algorithm(app: tauri::AppHandle, request: Value) -> Result<Value, String> {
    let queued = Instant::now();
    let script = runner(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = ENVIRONMENT_LOCK.read().map_err(|error| error.to_string())?;
        let queue_ms = queued.elapsed().as_secs_f64() * 1000.0;
        let mut result = execute_impl(script, request)?;
        result["timing"]["native"]["queueMs"] = json!(queue_ms);
        Ok(result)
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn install_cv_packages(app: tauri::AppHandle, packages: Vec<String>, timeout_seconds: Option<u64>) -> Result<Value, String> {
    let script = runner(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = ENVIRONMENT_LOCK.write().map_err(|error| error.to_string())?;
        crate::resident_worker::invalidate();
        if packages.is_empty() || packages.len() > 24 || packages.iter().any(|package| package.trim().is_empty() || package.len() > 500 || package.starts_with('-') || package.chars().any(|c| c.is_control())) {
            return Err("提供 1–24 個有效 Python package spec，不可使用 pip 命令旗標或控制字元".into());
        }
        let seconds = timeout_seconds.unwrap_or(300);
        if !(10..=600).contains(&seconds) { return Err("套件安裝預算需為 10–600 秒".into()); }
        let root = runtime_root();
        let managed = root.join("python");
        let executable = managed.join(if cfg!(windows) {"Scripts/python.exe"} else {"bin/python3"});
        let (id, directory) = unique_directory(&root.join("cv-package-installs"))?;
        save_json(&directory.join("request.json"), &json!({"packages":packages,"timeoutSeconds":seconds,"managedEnvironment":managed.to_string_lossy()}))?;
        if !executable.is_file() {
            let seed = python()?;
            let mut create = clean_command(&seed, &directory)?;
            create.arg("-m").arg("venv").arg(&managed);
            let created = run_process(create, 60)?;
            if created.code != Some(0) || created.timed_out { return Err(format!("建立專案 Python 環境失敗：{}",created.stderr)); }
        }
        let mut command = clean_command(&executable, &directory)?;
        command.arg("-m").arg("pip").arg("install").arg("--disable-pip-version-check").arg("--no-input").arg("--").args(&packages);
        let observed = run_process(command, seconds)?;
        fs::write(directory.join("stdout.log"), &observed.stdout).map_err(|error| error.to_string())?;
        fs::write(directory.join("stderr.log"), &observed.stderr).map_err(|error| error.to_string())?;
        let mut freeze = clean_command(&executable, &directory)?;
        freeze.arg("-m").arg("pip").arg("freeze");
        let frozen = run_process(freeze, 30)?;
        fs::write(managed.join("requirements.lock.txt"), &frozen.stdout).map_err(|error| error.to_string())?;
        let status = if observed.timed_out {"TIMEOUT"} else if observed.code == Some(0) {"SUCCEEDED"} else {"FAILED"};
        let info = info_impl(script).unwrap_or_else(|error| json!({"error":error}));
        let result = json!({"schema":"agentcv-python-packages-1","runId":id,"status":status,"packages":packages,
            "stdout":observed.stdout,"stderr":observed.stderr,"processExitCode":observed.code,
            "runDirectory":directory.to_string_lossy(),"environment":info,"requirementsLock":managed.join("requirements.lock.txt").to_string_lossy()});
        save_json(&directory.join("result.json"), &result)?;
        Ok(result)
    }).await.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recorded_source_listing_is_complete_bounded_and_confined() {
        let (_, base) = unique_directory(&std::env::temp_dir().join("agentcv-source-qa")).unwrap();
        let run=base.join("recorded");fs::create_dir(&run).unwrap();fs::write(run.join("algorithm.py"),"print(1)\n").unwrap();fs::write(run.join("note.txt"),"ignored").unwrap();
        let listing=recorded_sources(&base,run.to_str().unwrap()).unwrap();assert_eq!(listing["listingComplete"],true);assert_eq!(listing["sourceFiles"][0]["text"],"print(1)\n");assert_eq!(listing["sourceFiles"].as_array().unwrap().len(),1);
        assert!(recorded_sources(&base,base.parent().unwrap().to_str().unwrap()).is_err());
        fs::write(run.join("big.py"),vec![65u8;1024*1024+1]).unwrap();assert!(recorded_sources(&base,run.to_str().unwrap()).is_err());
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn memory_json_verification_retains_exact_bytes_and_rejects_corruption() {
        let _exclusive=crate::memory_resources::TEST_LOCK.lock().unwrap();
        let (_,directory)=unique_directory(&std::env::temp_dir().join("agentcv-verified-json-tests")).unwrap();
        let bytes=br#"{ "value": 1.000, "text": "actual bytes" }"#.to_vec();
        let digest=format!("{:x}",Sha256::digest(&bytes));
        let binding=json!({"imageId":"actual-source"});
        for case in 0..4 {
            let mut actual=bytes.clone();
            let mut descriptor=json!({"id":"facts","type":"json","sha256":digest,"bytes":bytes.len(),"data":{"forged":true}});
            if case==1 { actual[2]=b'x'; }
            if case==2 { descriptor["bytes"]=json!(bytes.len()+1); }
            if case==3 { actual=b"not json".to_vec();descriptor["bytes"]=json!(actual.len());descriptor["sha256"]=json!(format!("{:x}",Sha256::digest(&actual))); }
            let mut result=json!({"artifacts":[descriptor]});
            let mut memory=std::collections::BTreeMap::from([("facts".to_owned(),actual)]);
            let verified=verify_artifact_bytes(&mut result,&directory,&binding,"inspection",Some(&mut memory),"verified-json","run");
            if case==0 {
                verified.unwrap();
                let artifact=&result["artifacts"][0];
                assert_eq!(artifact["data"],json!({"value":1.0,"text":"actual bytes"}));
                assert_eq!(artifact["source"],binding);
                assert_eq!(artifact["memoryRef"]["sha256"],digest);
                assert_eq!(crate::memory_resources::read(&artifact["memoryRef"]).unwrap().as_slice(),bytes);
            } else { assert!(verified.is_err(),"corruption case {case}"); }
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn uncaptured_json_requires_host_policy_and_has_no_payload() {
        let (_,directory)=unique_directory(&std::env::temp_dir().join("agentcv-uncaptured-json-tests")).unwrap();
        let artifact=json!({"id":"optional","type":"json","storage":"not-captured","collection":crate::artifact_capture::marker()});
        for case in 0..5{
            let mut result=json!({"artifacts":[artifact.clone()]});let mut memory=std::collections::BTreeMap::new();
            let allowed=if case==1{vec![]}else{vec![json!("optional")]};
            if case==2{result["artifacts"][0]["sha256"]=json!("fake");}
            if case==3{memory.insert("optional".into(),b"{}".to_vec());}
            if case==4{result["artifacts"][0]["type"]=json!("image");}
            let verdict=verify_artifact_bytes_with_capture(&mut result,&directory,&json!({"actual":true}),"inspection",Some(&mut memory),"scope","run",&[],&allowed);
            if case==0{assert!(verdict.is_ok());assert!(crate::artifact_capture::verified(&result["artifacts"][0]));assert_eq!(result["artifacts"][0]["source"],json!({"actual":true}));}
            else{assert!(verdict.is_err(),"case {case}");}
        }
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn deferred_memory_json_keeps_verified_bytes_and_strict_validation() {
        let _exclusive=crate::memory_resources::TEST_LOCK.lock().unwrap();
        let (_,directory)=unique_directory(&std::env::temp_dir().join("agentcv-deferred-json-tests")).unwrap();
        let valid=serde_json::to_vec(&json!({"values":vec![1.25;2000]})).unwrap();
        for case in 0..6 {
            let raw=match case {2=>[vec![b' ';4096],b"[1e9999]".to_vec()].concat(),3=>[valid.clone(),b" false".to_vec()].concat(),4=>b"{\"small\":true}".to_vec(),_=>valid.clone()};
            let digest=format!("{:x}",Sha256::digest(&raw));
            let mut descriptor=json!({"id":"facts","type":"json","sha256":digest,"bytes":raw.len()});
            if case==1{descriptor["sha256"]=json!("wrong");}
            let mut result=json!({"artifacts":[descriptor]});
            let mut memory=std::collections::BTreeMap::from([("facts".to_owned(),raw.clone())]);
            let deferred=if case==5{vec![]}else{vec![json!("facts")]};
            let verified=verify_artifact_bytes_with_deferred(&mut result,&directory,&json!({}),"inspection",Some(&mut memory),"deferred-json","run",&deferred);
            if [1,2,3].contains(&case){assert!(verified.is_err(),"case {case}");continue;}
            verified.unwrap();let artifact=&result["artifacts"][0];
            assert_eq!(crate::memory_resources::read(&artifact["memoryRef"]).unwrap().as_slice(),raw);
            if case==0{assert_eq!(artifact["data"],crate::deferred_trace::artifact_reference(&json!("run"),&json!("facts")));}
            else{assert_eq!(artifact["data"],serde_json::from_slice::<Value>(&raw).unwrap());}
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn json_artifact_preserves_original_bytes_and_parsed_values() {
        let (_, directory) = unique_directory(&std::env::temp_dir().join("agentcv-json-artifact-qa")).unwrap();
        let path=directory.join("actual.json");let bytes=b"{ \"value\": 1.000, \"note\": \"preserve formatting\" }\n";
        fs::write(&path,bytes).unwrap();
        let mut result=json!({"artifacts":[{"id":"data","type":"json","path":path}]});
        verify_artifact_files(&mut result,&directory,&json!({"imageId":"original"})).unwrap();
        let artifact=&result["artifacts"][0];assert_eq!(artifact["data"]["value"],1.0);
        let payload=artifact["dataUrl"].as_str().unwrap().strip_prefix("data:application/json;base64,").unwrap();
        assert_eq!(STANDARD.decode(payload).unwrap(),bytes);
        assert_eq!(artifact["sha256"],format!("{:x}",Sha256::digest(bytes)));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn generic_file_artifacts_embed_verified_portable_bytes() {
        let (_, directory) = unique_directory(&std::env::temp_dir().join("agentcv-portable-file-tests")).unwrap();
        let path = directory.join("algorithm.py");
        let bytes = b"# source file is data, not automatically executed\nresult = {'value': 17}\n";
        fs::write(&path, bytes).unwrap();
        let binding = json!({"imageId":"original-camera","runId":"portable-source"});
        let mut result = json!({"artifacts":[{"id":"program","type":"file","name":"algorithm.py","path":path,
            "sha256":"untrusted-old-hash","dataUrl":"data:text/x-python;base64,ZmFrZQ=="}]});
        verify_artifact_files(&mut result, &directory, &binding).unwrap();
        let artifact = &result["artifacts"][0];
        assert_eq!(artifact["mime"], "application/octet-stream");
        assert_eq!(artifact["hostBytesVerified"], true);
        assert_eq!(artifact["source"], binding);
        assert_eq!(artifact["sha256"], format!("{:x}", Sha256::digest(bytes)));
        assert_eq!(artifact["dataUrl"], artifact["dataURL"]);
        let encoded = artifact["dataUrl"].as_str().unwrap().strip_prefix("data:application/octet-stream;base64,").unwrap();
        assert_eq!(STANDARD.decode(encoded).unwrap(), bytes);
        // JSON serialization retains the bytes even when the runtime path goes away.
        let portable: Value = serde_json::from_slice(&serde_json::to_vec(&result).unwrap()).unwrap();
        fs::remove_dir_all(&directory).unwrap();
        assert_eq!(portable["artifacts"][0]["dataUrl"], artifact["dataUrl"]);
    }

    #[test]
    fn memory_image_artifacts_are_verified_without_a_path() {
        let (_, directory) = unique_directory(&std::env::temp_dir().join("agentcv-memory-image-tests")).unwrap();
        let encoded = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        let data_url = format!("data:image/png;base64,{encoded}");
        let binding = json!({"imageId":"current-workpiece","unitId":"unit-1"});
        let mut result = json!({"artifacts":[{"id":"live","type":"image","name":"live.png","dataUrl":data_url}]});
        verify_artifact_files_mode(&mut result, &directory, &binding, "memory").unwrap();
        let artifact = &result["artifacts"][0];
        assert!(artifact.get("path").is_none());
        assert_eq!(artifact["storage"], "process-memory");
        assert_eq!(artifact["pixelRetention"], "current-workpiece-memory");
        assert_eq!(artifact["hostBytesVerified"], true);
        assert_eq!(artifact["width"], 1);
        assert_eq!(artifact["height"], 1);
        assert_eq!(artifact["mime"], "image/png");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn actual_python_save_file_source_and_model_return_portable_payloads() {
        let root = desktop_root();
        let executable = root.join(if cfg!(windows) {"runtime/python/Scripts/python.exe"} else {"runtime/python/bin/python3"});
        if !executable.is_file() {
            eprintln!("No installed project Python environment; actual SDK execution not assessed on this host");
            return;
        }
        let (_, directory) = unique_directory(&std::env::temp_dir().join("agentcv-portable-sdk-tests")).unwrap();
        let code = "save_file('program', __file__)\npayload = output_directory / 'model.weights'\npayload.write_bytes(bytes([0, 1, 2, 255, 128]))\nsave_file('model', payload)\nresult = {'inputShape': list(image.shape)}\n";
        let binding = json!({"images":[{"imageId":"original-camera","imageSha256":"fixture-source"}],"workflowRevision":1});
        let request = json!({"title":"actual SDK portable files","code":code,"parameters":{},"sourceBinding":binding,
            "justification":{},"workspaceRoot":directory,"timeoutSeconds":30,"images":[{"id":"original-camera","width":3,"height":2,
                "dataUrl":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFElEQVR4nGMUlNdiAAMmCMXAwAAABncAXh9kwxIAAAAASUVORK5CYII="}]});
        let result = execute_impl(root.join("scripts/cv-runtime.py"), request).unwrap();
        assert_eq!(result["status"], "SUCCEEDED", "{:?}", result["error"]);
        assert_eq!(result["result"]["inputShape"], json!([2,3,3]));
        assert_eq!(result["artifacts"].as_array().unwrap().len(), 2);
        for artifact in result["artifacts"].as_array().unwrap() {
            assert_eq!(artifact["hostBytesVerified"], true);
            assert_eq!(artifact["source"], binding);
            let encoded = artifact["dataUrl"].as_str().unwrap().strip_prefix("data:application/octet-stream;base64,").unwrap();
            let actual = STANDARD.decode(encoded).unwrap();
            assert_eq!(artifact["sha256"], format!("{:x}", Sha256::digest(&actual)));
            if artifact["id"] == "program" { assert_eq!(actual, code.as_bytes()); }
            else { assert_eq!(actual, vec![0,1,2,255,128]); }
        }
        let saved: Value = serde_json::from_str(&fs::read_to_string(Path::new(result["runDirectory"].as_str().unwrap()).join("result.json")).unwrap()).unwrap();
        assert_eq!(saved, result);
        fs::remove_dir_all(directory).unwrap();
    }
}

#[cfg(test)]
mod resident_tests {
 use super::*;
 fn input() -> Value {
  // Keep this acceptance test self-contained.  The old version depended on an
  // audit-log snapshot that is intentionally prunable and therefore made the
  // thousand-unit test fail before executing any real image.  These are the
  // same OpenCV example images shipped with the project.
  let root = desktop_root().join("../research/opencv-traditional-10-2026-10-25/assets");
  let entries = [("box.png", "reference"), ("box_in_scene.png", "scene")];
  let mut images = Vec::new();
  let mut bindings = Vec::new();
  for (index, (name, role)) in entries.into_iter().enumerate() {
   let bytes = fs::read(root.join(name)).unwrap();
   let hash = format!("{:x}", Sha256::digest(&bytes));
   let image_id = format!("real-{role}");
   let (width, height) = if name == "box.png" {(324, 223)} else {(512, 384)};
   images.push(json!({"id":image_id,"name":name,"width":width,"height":height,
     "dataUrl":format!("data:image/png;base64,{}", STANDARD.encode(bytes)),
     "source":{"contentSha256":hash,"imageId":image_id,"imageSha256":hash,"width":width,"height":height,"role":role,"index":index}}));
   bindings.push(json!({"imageId":image_id,"contentSha256":hash,"imageSha256":hash,"width":width,"height":height,"role":role}));
  }
  json!({"title":"real OpenCV resident benchmark","mode":"scheme","parameters":{},
   "images":images,"sourceBinding":{"images":bindings,"workflowRevision":1,"projectEpoch":1,"schemeFingerprint":"resident-real-fixture"},
   "justification":{"tool":{"reason":"以真實 OpenCV 影像驗證常駐執行與證據回傳。"}},"expectedOutputs":[]})
 }
 fn bind(mut request:Value, code:&str, workspace:&Path)->Value {
  request["workspaceRoot"]=json!(workspace);request["mode"]=json!("scheme");request["code"]=json!(code);request["parameters"]=json!({});request["expectedOutputs"]=json!([]);
  request["runtimePlan"]=json!({"fingerprint":"test-source-plan","nodeId":"test-node","definition":{"operatorGraph":{"nodes":[{"id":"test-node","code":code,"parameters":{},"expected_outputs":[]}]}}});request
 }
 #[test]
 fn resident_real_images_reuse_process_preserve_inputs_and_restart_after_fault(){
  let (_,directory)=unique_directory(&std::env::temp_dir().join("agentcv-resident-tests")).unwrap();
  let code="before=int(image.sum())\nimage[:]=0\nresult={'before':before,'previous':globals().get('last_value')}\nlast_value=123\n";
  let request=bind(input(),code,&directory);let script=desktop_root().join("scripts/cv-runtime.py");
  let first=execute_impl(script.clone(),request.clone()).unwrap();assert_eq!(first["status"],"SUCCEEDED","{first}");
  let second=execute_impl(script.clone(),request.clone()).unwrap();assert_eq!(second["result"],first["result"]);assert!(second["result"]["before"].as_i64().unwrap()>0);assert!(second["result"]["previous"].is_null());assert_eq!(first["timing"]["resident"]["pid"],second["timing"]["resident"]["pid"]);assert_eq!(second["timing"]["resident"]["coldStart"],false);assert_eq!(second["timing"]["imageCache"]["entries"],2);
  let mut mismatch=request.clone();mismatch["parameters"]=json!({"changed":true});assert!(execute_impl(script.clone(),mismatch).unwrap_err().contains("不一致"));
  let fault=execute_impl(script.clone(),bind(input(),"raise RuntimeError('real failure')",&directory)).unwrap();assert_eq!(fault["status"],"FAILED");
  let recovered=execute_impl(script.clone(),request).unwrap();assert_eq!(recovered["status"],"SUCCEEDED");assert_eq!(recovered["timing"]["resident"]["coldStart"],true);
  // A program can terminate the extension process. Host survives and next run recovers.
  let crash=execute_impl(script.clone(),bind(input(),"import os\nos._exit(3)",&directory)).unwrap();assert_eq!(crash["execution"]["status"],"FAULT");
  let mut timeout=bind(input(),"while True: pass",&directory);timeout["timeoutSeconds"]=json!(1);let began=Instant::now();let timed=execute_impl(script.clone(),timeout).unwrap();assert_ne!(timed["status"],"SUCCEEDED");assert!(began.elapsed()<Duration::from_secs(5));
  let recovered=execute_impl(script,bind(input(),"result={'ok':True}",&directory)).unwrap();assert_eq!(recovered["result"]["ok"],true);
  crate::resident_worker::invalidate();fs::remove_dir_all(directory).unwrap();
 }
 #[test]
 fn resident_inspection_frames_keep_exact_bytes_without_file_roundtrips(){
  let _originals=crate::original_resources::TEST_LOCK.lock().unwrap();
  let (_,directory)=unique_directory(&std::env::temp_dir().join("agentcv-memory-tests")).unwrap();
  let code="with step('pixels'):\n save_image('pixels',image)\n save_json('facts',{'answer':42})\nresult={'sum':int(image.sum())}\n";
  let mut request=bind(input(),code,&directory);request["artifactMode"]=json!("inspection");request["workpieceUnit"]=json!({"id":"real-unit","imageIds":["real-reference"]});
  request["expectedOutputs"]=json!([{"id":"pixels","type":"image","role":"result"}]);
  request["runtimePlan"]["definition"]["operatorGraph"]["nodes"][0]["expected_outputs"]=request["expectedOutputs"].clone();
  let script=desktop_root().join("scripts/cv-runtime.py");let result=execute_impl(script.clone(),request.clone()).unwrap();
  assert_eq!(result["status"],"SUCCEEDED","{result}");
  let run=PathBuf::from(result["runDirectory"].as_str().unwrap());
  for filename in ["request.json","result.json","algorithm.py","stdout.log","stderr.log","host-stdout.log"] {assert!(!run.join(filename).exists(),"{filename} should not be written");}
  let facts=result["artifacts"].as_array().unwrap().iter().find(|a|a["id"]=="facts").unwrap();
  assert_eq!(facts["data"]["answer"],42);assert_eq!(facts["hostBytesVerified"],true);
  let bytes=crate::memory_resources::read(&facts["memoryRef"]).unwrap();assert_eq!(bytes.as_slice(),b"{\"answer\":42}\n");
  let pixels=result["artifacts"].as_array().unwrap().iter().find(|a|a["id"]=="pixels").unwrap();
  assert!(pixels["dataUrl"].as_str().unwrap().contains("agentcv-memory"));
  let mut cached=request.clone();cached["runtimePlan"].as_object_mut().unwrap().remove("definition");cached["runtimePlan"]["token"]=result["runtimePlanToken"].clone();
  for (image,reference) in cached["images"].as_array_mut().unwrap().iter_mut().zip(result["runtimeInputResources"].as_array().unwrap()){
   image["runtimeInput"]=reference.clone();image["dataUrl"]=json!("unused: captured original bytes are authoritative");
  }
  let again=execute_impl(script.clone(),cached.clone()).unwrap();assert_eq!(again["result"],result["result"]);
  assert_eq!(again["timing"]["resident"]["originalTransferBytes"],0);
  assert_eq!(again["timing"]["originalCache"]["entries"],request["images"].as_array().unwrap().len());
  crate::resident_worker::invalidate();
  let restarted=execute_impl(script.clone(),cached.clone()).unwrap();assert_eq!(restarted["result"],result["result"]);
  assert_eq!(restarted["timing"]["resident"]["coldStart"],true);
  assert!(restarted["timing"]["resident"]["originalTransferBytes"].as_u64().unwrap()>0);
  let mut expired=request.clone();for (image,reference) in expired["images"].as_array_mut().unwrap().iter_mut().zip(result["runtimeInputResources"].as_array().unwrap()){image["runtimeInput"]=reference.clone();}
  for n in 0..16{crate::original_resources::capture(&json!({"id":format!("expiry-{n}"),"width":1,"height":1}),vec![n]).unwrap();}
  let refreshed=execute_impl(script.clone(),expired).unwrap();assert_eq!(refreshed["result"],result["result"]);
  assert_ne!(refreshed["runtimeInputResources"][0]["token"],result["runtimeInputResources"][0]["token"]);
  assert!(refreshed["timing"]["resident"]["originalTransferBytes"].as_u64().unwrap()>0);
  cached["parameters"]=json!({"changed":true});assert!(execute_impl(script.clone(),cached).unwrap_err().contains("不一致"));
  let mut crash=bind(input(),"import os\nos._exit(3)",&directory);crash["artifactMode"]=json!("inspection");
  assert_eq!(execute_impl(script.clone(),crash).unwrap()["execution"]["status"],"FAULT");
  let mut timeout=bind(input(),"while True: pass",&directory);timeout["artifactMode"]=json!("inspection");timeout["timeoutSeconds"]=json!(1);
  let began=Instant::now();assert_eq!(execute_impl(script.clone(),timeout).unwrap()["execution"]["status"],"FAULT");assert!(began.elapsed()<Duration::from_secs(5));
  let mut recovered=bind(input(),"result={'recovered':True}",&directory);recovered["artifactMode"]=json!("inspection");
  assert_eq!(execute_impl(script,recovered).unwrap()["result"]["recovered"],true);
  crate::resident_worker::invalidate();fs::remove_dir_all(directory).unwrap();
 }
 #[test]
 #[ignore="Explicit real 1000-unit native throughput and durable-save acceptance"]
 fn resident_real_thousand_units(){
  let root=desktop_root();let workspace=std::env::temp_dir().join(format!("agentcv-native-thousand-{}", std::process::id()));fs::create_dir_all(&workspace).unwrap();
  let base=input();let script=root.join("scripts/cv-runtime.py");let mut times=Vec::new();let mut pids=std::collections::HashSet::new();let all=Instant::now();let mut succeeded=0usize;let mut max_cache=0u64;
  let codes=["edges=cv2.Canny(gray,50,150)\nsave_image('edges',edges)\nresult={'edgePixels':int(np.count_nonzero(edges))}\n","edges=cv2.Canny(gray,80,180)\nsave_image('measure-preview',edges)\nresult={'edgePixels':int(np.count_nonzero(edges))}\n"];
  let nodes=json!([{"id":"edge-preview","code":codes[0],"parameters":{},"expected_outputs":[]},{"id":"measure","code":codes[1],"parameters":{},"expected_outputs":[]}]);
  let definition=json!({"operatorGraph":{"nodes":nodes}});
  for index in 0..1000 {
   let begin=Instant::now();let mut results=Vec::new();
   for (step,node) in ["edge-preview","measure"].iter().enumerate(){
    let code=codes[step];let mut request=base.clone();request["code"]=json!(code);request["workspaceRoot"]=json!(workspace);request["runtimePlan"]=json!({"fingerprint":"same-current-compiled-scheme","nodeId":node,"definition":definition.clone()});request["mode"]=json!("scheme");request["artifactMode"]=json!("references");
    let result=execute_impl(script.clone(),request).unwrap();assert_eq!(result["status"],"SUCCEEDED","{:?}",result["error"]);pids.insert(result["timing"]["resident"]["pid"].as_u64().unwrap());max_cache=max_cache.max(result["timing"]["imageCache"]["entries"].as_u64().unwrap());results.push(result);
   }
   succeeded+=results.iter().filter(|r|r["status"]=="SUCCEEDED").count();
   let record=json!({"unit":index+1,"runs":results});save_json(&workspace.join(format!("unit-{:04}.json",index+1)),&record).unwrap();times.push(begin.elapsed().as_secs_f64()*1000.);
   if (index+1)%100==0{eprintln!("native Rust resident {} / 1000 elapsed {:.1}s",index+1,all.elapsed().as_secs_f64());}
  }
  assert_eq!(pids.len(),1);assert!(max_cache<=8);assert_eq!(succeeded,2000);let cold=times[0];let mut sorted=times.clone();sorted.sort_by(|a,b|a.partial_cmp(b).unwrap());
  let report=json!({"scope":"Native Rust execute_impl including original-byte hashing/storage, resident extension IPC, real OpenCV Canny programs, image artifact rendering/writing/verification and per-unit JSON persistence. The same two shipped OpenCV example images are reused for 1000 workpieces; this measures operational throughput, not independent accuracy. Excludes WebView/JS orchestration and device I/O. No operator-time substitution.","units":1000,"nodeCalls":2000,"workerPids":pids,"maxDecodedImages":max_cache,"succeededNodeCalls":succeeded,"faults":0,"coldCycleMs":cold,"meanMs":times.iter().sum::<f64>()/1000.,"p95Ms":sorted[949],"p99Ms":sorted[989],"maxMs":sorted[999],"over50ms":times.iter().filter(|v|**v>50.).count(),"wallMs":all.elapsed().as_secs_f64()*1000.,"cycleMs":times});
  eprintln!("native Rust resident report: {}",report);
  save_json(&workspace.join("native-thousand.json"),&report).unwrap();crate::resident_worker::invalidate();let _=fs::remove_dir_all(workspace);
 }
}

/// Local automation uses the exact desktop native execution and storage paths.
/// Compilation remains in the UI; native scheduling/decisions have differential
/// checks against the production JS implementation before desktop acceptance.
pub(crate) fn headless_service()->Result<(),String>{
 use std::io::BufRead;
 let stdin=std::io::stdin();let mut input=stdin.lock();let stdout=std::io::stdout();let mut output=stdout.lock();
 loop{
  let mut bytes=Vec::new();let read=(&mut input).take(512*1024*1024+1).read_until(b'\n',&mut bytes).map_err(|e|e.to_string())?;
  if read==0{break;}if bytes.len()>512*1024*1024{return Err("本機工程請求超過512MB".into());}
  let message:Value=serde_json::from_slice(&bytes).map_err(|e|e.to_string())?;
  let result:Result<Value,String>=(||match message["op"].as_str().unwrap_or(""){
   "replay_session"=>crate::inspection_session::replay(&message["request"]),
   "classify_workpiece"=>{let r=&message["request"];Ok(crate::inspection_decision::classify(&r["spec"],&r["observations"],r["faults"].as_array().map(Vec::as_slice).unwrap_or(&[])))},
   "inspection_product"=>{let r=&message["request"];crate::inspection_product::finalize(&r["request"],&r["session"],&r["decision"])},
   "inspection_evidence"=>{let r=&message["request"];Ok(crate::inspection_evidence::audit(&r["run"],r["expected"].as_array().map(Vec::as_slice).unwrap_or(&[])))},
   "inspection_evidence_pixels"=>Ok(json!(crate::inspection_evidence::verified_pixels(&message["request"]))),
   "inspection_run"=>{let r=&message["request"];let mut run=r["run"].clone();crate::inspection_run::assemble(&mut run,&r["authored"],&r["shared"],r["nodeId"].as_str().ok_or("SESSION_NODE_ID_REQUIRED")?)?;run.as_object_mut().unwrap().remove("runtimeInputResources");Ok(run)},
   "inspection_product_policy"=>{let r=&message["request"];Ok(json!({"regression":crate::inspection_product::regression(&r["spec"],&r["resolution"],&r["result"],r["faults"].as_array().map(Vec::as_slice).unwrap_or(&[]),r["cancelled"]==true,r.get("knownCategoryIds")),"retention":crate::inspection_product::retention(&r["record"],r["runs"].as_array().map(Vec::as_slice).unwrap_or(&[]),&r["options"],&Value::Null)}))},
   "decision_evidence"=>{let r=&message["request"];Ok(crate::inspection_decision::evidence(&r["scheme"],&r["record"],&r["runs"]))},
   "workpiece_decision"=>{let r=&message["request"];Ok(crate::inspection_decision::decide(&r["request"],&r["session"],r["cancelled"]==true))},
   "adapt_native_session"=>Ok(crate::inspection_service::adapt_native(message["request"]["native"].clone(),&message["request"]["request"],message["request"]["elapsedMs"].as_f64().unwrap_or(0.))),
   "execute_session" | "execute_session_wire"=>{let _execution=EXECUTION_LOCK.lock().map_err(|e|e.to_string())?;crate::inspection_service::execute_with_commit(message["request"].clone(),|r|execute_locked(desktop_root().join("scripts/cv-runtime.py"),r),||false,|_|{},crate::inspection_files::save_headless_unit)},
   "inspection_commit_product"=>{let r=&message["request"];crate::inspection_commit::product(&r["request"],&r["session"],r["nativeMs"].as_f64().unwrap_or(0.),r["at"].as_str().ok_or("SESSION_TIMESTAMP_REQUIRED")?)},
   "audit_output_contracts"=>{let r=&message["request"];Ok(crate::output_contract::audit(&r["run"],r["expected"].as_array().ok_or("Missing expected outputs")?,&r["scheme"],&r["upstream"]))},
   "execute"=>execute_impl(desktop_root().join("scripts/cv-runtime.py"),message["request"].clone()),
   "save_unit"=>crate::inspection_files::save_headless_unit(message["request"].clone()),
   "read_unit"=>crate::inspection_files::read_headless_unit(&message["reference"]),
   "read_artifact"=>crate::inspection_files::read_headless_artifact(&message["reference"]),
   "history_create"=>tauri::async_runtime::block_on(crate::git_workspace::create_solution_version(message["projectPath"].as_str().ok_or("缺少工程路徑")?.into(),message["content"].as_str().ok_or("缺少工程內容")?.into(),message["message"].as_str().unwrap_or("實算").into(),message["kind"].as_str().map(String::from),message["runId"].as_str().map(String::from))).and_then(|v|serde_json::to_value(v).map_err(|e|e.to_string())),
   "save_workspace"=>{let root=PathBuf::from(message["root"].as_str().ok_or("缺少工程目錄")?);if !root.is_absolute(){return Err("需要工程絕對路徑".into());}fs::create_dir_all(&root).map_err(|e|e.to_string())?;crate::workspace::write_workspace(&root,&serde_json::to_string(&message["project"]).map_err(|e|e.to_string())?)?;Ok(json!({"root":root}))},
   "read_workspace"=>{let root=PathBuf::from(message["root"].as_str().ok_or("缺少工程目錄")?);serde_json::from_str(&crate::workspace::read_workspace_lazy(&root)?).map_err(|e|e.to_string())},
   "open_document"=>crate::project_documents::read_document(std::path::Path::new(message["path"].as_str().ok_or("缺少專案路徑")?)),
   "export_project"=>crate::history_transfer::export_project(std::path::Path::new(message["source"].as_str().ok_or("缺少來源專案")?),std::path::Path::new(message["destination"].as_str().ok_or("缺少目標專案")?)).and_then(|r|serde_json::to_value(r).map_err(|e|e.to_string())),
   _=>Err("未知本機執行操作".into())
  })();
  // Diagnostic transport uses the exact desktop response encoder when asked.
  // Keep the legacy full-tree operation for differential test clients.
  let result=if message["op"]=="execute_session_wire" {
   match result.and_then(encode_session_response) {
    Ok(bytes)=>{
     write!(&mut output,"{{\"id\":{},\"result\":",message["id"]).map_err(|e|e.to_string())?;
     output.write_all(&bytes).and_then(|_|output.write_all(b"}\n")).and_then(|_|output.flush()).map_err(|e|e.to_string())?;
     continue;
    },
    Err(error)=>Err(error),
   }
  }else{result};
  let response=match result{Ok(result)=>json!({"id":message["id"],"result":result}),Err(error)=>json!({"id":message["id"],"error":error})};
  serde_json::to_writer(&mut output,&response).map_err(|e|e.to_string())?;output.write_all(b"\n").and_then(|_|output.flush()).map_err(|e|e.to_string())?;
 }
 crate::resident_worker::invalidate();Ok(())
}
