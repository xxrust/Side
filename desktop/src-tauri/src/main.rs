#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::Mutex,
};
use tauri::{Emitter, Manager};
mod workspace;
mod git_workspace;
mod git_lfs_storage;
mod history_transfer;
mod cv_runtime;
mod background_command;
mod native_cv;
mod two_boundary;
mod resident_worker;
mod report_wire;
mod memory_resources;
mod shared_facts;
mod shared_preview;
mod original_resources;
mod inspection_session;
mod inspection_service;
mod inspection_decision;
mod inspection_product;
mod inspection_evidence;
mod inspection_run;
mod inspection_commit;
mod inspection_archive;
mod output_contract;
mod app_session;
mod visual_services;
mod inspection_files;
mod source_store;
mod project_documents;

struct PiProcess {
    child: Child,
    stdin: ChildStdin,
}
impl Drop for PiProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
#[derive(Default)]
struct Session {
    pi: Mutex<Option<PiProcess>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Imported {
    name: String,
    source_path: String,
    data_url: String,
}

fn image_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| ["png", "jpg", "jpeg", "bmp", "webp"].contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}
fn collect(path: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    for e in std::fs::read_dir(path).map_err(|_| "無法讀取圖片文件夾")? {
        let e = e.map_err(|_| "無法讀取文件")?;
        let t = e.file_type().map_err(|_| "無法讀取文件類型")?;
        if t.is_symlink() {
            continue;
        }
        if t.is_dir() {
            collect(&e.path(), out)?
        } else if image_file(&e.path()) {
            out.push(e.path())
        }
        if out.len() > 100 {
            return Err("一次最多導入 100 張圖片，請選較小的文件夾".into());
        }
    }
    Ok(())
}
#[tauri::command]
async fn import_images(folder: bool) -> Result<Vec<Imported>, String> {
    let dialog = rfd::AsyncFileDialog::new().set_title("導入圖片");
    let mut paths = if folder {
        if let Some(dir) = dialog.pick_folder().await {
            let mut out = vec![];
            collect(dir.path(), &mut out)?;
            out
        } else {
            return Ok(vec![]);
        }
    } else {
        if let Some(files) = dialog
            .add_filter("圖片", &["png", "jpg", "jpeg", "bmp", "webp"])
            .pick_files()
            .await
        {
            files.into_iter().map(|f| f.path().to_path_buf()).collect()
        } else {
            return Ok(vec![]);
        }
    };
    paths.sort();
    if paths.len() > 100 {
        return Err("一次最多導入 100 張圖片".into());
    }
    let mut total = 0;
    let mut out = vec![];
    for path in paths {
        let size = std::fs::metadata(&path).map_err(|_| "無法讀取圖片")?.len();
        total += size;
        if total > 128 * 1024 * 1024 {
            return Err("本次圖片總量超過 128 MB".into());
        }
        let bytes = std::fs::read(&path).map_err(|_| "圖片讀取失敗")?;
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let mime = match ext.as_str() {
            "png" => "image/png",
            "bmp" => "image/bmp",
            "webp" => "image/webp",
            _ => "image/jpeg",
        };
        out.push(Imported {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            source_path: path.to_string_lossy().into(),
            data_url: format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
        });
    }
    Ok(out)
}
#[tauri::command]
async fn open_project(directory: Option<String>) -> Result<Option<Value>, String> {
    let mut dialog = rfd::AsyncFileDialog::new()
        .set_title("開啟 AgentCV 專案")
        .add_filter("AgentCV 專案", &["agentcv", "json"]);
    let location = directory.map(PathBuf::from).or_else(|| std::env::current_exe().ok()
        .and_then(|exe|exe.ancestors().find(|p|p.extension().is_some_and(|e|e=="app")).and_then(Path::parent).map(Path::to_path_buf)));
    if let Some(location) = location { dialog = dialog.set_directory(location); }
    let Some(f) = dialog.pick_file().await
    else {
        return Ok(None);
    };
    project_documents::open_project_document(f.path().to_string_lossy().into_owned()).await.map(Some)
}
#[tauri::command]
async fn save_file(content: String, report: bool) -> Result<Option<String>, String> {
    let name = if report {
        "agentcv-report.csv"
    } else {
        "project.agentcv.json"
    };
    let Some(f) = rfd::AsyncFileDialog::new()
        .set_title("另存新檔")
        .set_file_name(name)
        .save_file()
        .await
    else {
        return Ok(None);
    };
    // Write to a sibling temporary file first; never truncate the previous project on failure.
    let tmp = f
        .path()
        .with_extension(format!("agentcv-{}.tmp", std::process::id()));
    std::fs::write(&tmp, content).map_err(|_| "寫入失敗，原檔未改動")?;
    if std::fs::rename(&tmp, f.path()).is_err() {
        let _ = std::fs::remove_file(&tmp);
        return Err("無法替換目標檔案；請另存新檔".into());
    }
    Ok(Some(f.path().to_string_lossy().into()))
}
fn executable(name: &str) -> Option<PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut paths = vec![
        PathBuf::from(&home).join(".local/bin").join(name),
        PathBuf::from(&home).join(".nix-profile/bin").join(name),
        PathBuf::from("/opt/homebrew/bin").join(name),
        PathBuf::from("/usr/local/bin").join(name),
    ];
    if let Some(p) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&p).map(|p| p.join(name)))
    }
    paths.into_iter().find(|p| p.is_file())
}
fn agent_command(app: &tauri::AppHandle, script: &str) -> Result<Command, String> {
    let node = executable(if cfg!(windows) { "node.exe" } else { "node" })
        .ok_or("找不到 Node.js，請先安裝 Node.js 20 以上版本")?;
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
    let resources = app.path().resource_dir().map_err(|_| "找不到應用資源")?;
    let scripts = if resources.join("bridge").join(script).is_file() { resources.join("bridge") }
        else if cfg!(debug_assertions) { dev.join("scripts") }
        else { return Err("應用內缺少 Agent 橋接資源，請重新安裝".into()); };
    let cwd = if let Some(configured) = std::env::var_os("AGENTCV_RUNTIME_ROOT") {
        PathBuf::from(configured)
    } else if cfg!(debug_assertions) {
        dev.join("runtime")
    } else {
        app.path().app_data_dir().map_err(|_| "找不到 Agent 設定目錄")?.join("runtime")
    };
    std::fs::create_dir_all(&cwd).map_err(|_| "無法建立專案執行目錄")?;
    let data=app.path().app_data_dir().map_err(|_| "找不到 Agent 設定目錄")?;
    std::fs::create_dir_all(&data).map_err(|_| "無法建立 Agent 設定目錄")?;
    let package_root=if let Some(configured)=std::env::var_os("AGENTCV_RESOURCE_DIR"){PathBuf::from(configured)}
        else if cfg!(debug_assertions) && dev.join("agent-packages").is_dir(){dev.join("agent-packages")}
        else if resources.join("agent-packages").is_dir(){resources.join("agent-packages")}
        else {return Err("應用內缺少 Agent 套件資源，請重新打包".into())};
    let mut command=background_command::new(node);
    command.arg(scripts.join(script)).env("AGENTCV_AGENT_CONFIG",data.join("agent-profile.json"))
        .env("AGENTCV_RESOURCE_DIR",package_root).env("AGENTCV_TOOL_CONTRACT",scripts.join("agent-contract.json"))
        .env("AGENTCV_DEFAULT_ADAPTER","codex")
        .env("AGENTCV_CODEX_PATH",executable("codex").unwrap_or_else(||PathBuf::from("codex")))
        .env("PI_OFFLINE","1").env("PI_TELEMETRY","0").current_dir(cwd);
    if let Some(cli)=executable("pi").and_then(|p|std::fs::canonicalize(p).ok()) {
        if let Some(parent)=cli.parent() { let sdk=parent.join("index.js");if sdk.is_file(){command.env("AGENTCV_PI_ENTRY",sdk);} }
    }
    Ok(command)
}
fn agent_profile_command(app: &tauri::AppHandle, mode: &str, input: Option<Value>) -> Result<Value, String> {
    let mut command=agent_command(app,"agent-resources.mjs")?;
    command.arg(mode).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child=command.spawn().map_err(|error|format!("無法讀寫 Agent 設定：{error}"))?;
    if let Some(value)=input {
        let content=serde_json::to_vec(&value).map_err(|error|error.to_string())?;
        if content.len()>1024*1024 { let _=child.kill();let _=child.wait();return Err("Agent 設定超過 1 MB".into()); }
        child.stdin.take().ok_or("無法開啟設定輸入")?.write_all(&content).map_err(|error|error.to_string())?;
    } else { drop(child.stdin.take()); }
    let output=child.wait_with_output().map_err(|error|error.to_string())?;
    if !output.status.success(){return Err(String::from_utf8_lossy(&output.stderr).chars().take(8000).collect());}
    serde_json::from_slice(&output.stdout).map_err(|error|format!("Agent 設定回覆格式無效：{error}"))
}
#[tauri::command]
async fn image_manager_request(app: tauri::AppHandle, request: Value) -> Result<Value,String> {
    tauri::async_runtime::spawn_blocking(move|| {
        let bytes=serde_json::to_vec(&request).map_err(|e|e.to_string())?;
        if bytes.len()>128000 {return Err("圖像管理員請求過大".into());}
        let mut command=agent_command(&app,"image-manager.mjs")?;
        let mut child=command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|_|"無法啟動圖像管理員")?;
        child.stdin.take().ok_or("無法傳入檔案結構")?.write_all(&bytes).map_err(|_|"無法傳入檔案結構")?;
        let output=child.wait_with_output().map_err(|_|"圖像管理員程序未完成")?;
        if !output.status.success(){return Err(String::from_utf8_lossy(&output.stderr).chars().take(2000).collect());}
        serde_json::from_slice(&output.stdout).map_err(|_|"圖像管理員回覆格式錯誤".into())
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn get_agent_profile(app: tauri::AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move||agent_profile_command(&app,"--get",None)).await.map_err(|error|error.to_string())?
}
#[tauri::command]
async fn save_agent_profile(app: tauri::AppHandle, config: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move||agent_profile_command(&app,"--save",Some(config))).await.map_err(|error|error.to_string())?
}
#[tauri::command]
async fn pick_agent_package(app: tauri::AppHandle) -> Result<Value, String> {
    let Some(folder)=rfd::AsyncFileDialog::new().set_title("選擇含 SKILL.md 或 plugin manifest 的資料夾").pick_folder().await else { return Ok(Value::Null); };
    let input=json!({"path":folder.path().to_string_lossy()});
    tauri::async_runtime::spawn_blocking(move||agent_profile_command(&app,"--inspect",Some(input))).await.map_err(|error|error.to_string())?
}
#[tauri::command]
fn pi_start(app: tauri::AppHandle, state: tauri::State<Session>) -> Result<String, String> {
    let mut lock = state.pi.lock().map_err(|_| "Pi 狀態讀取失敗")?;
    *lock = None;
    let mut child = agent_command(&app,"agent-host.mjs")?
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|error|format!("Agent 啟動失敗：{error}"))?;
    let stdin = child.stdin.take().ok_or("無法建立 Pi 輸入")?;
    let stdout = child.stdout.take().ok_or("無法建立 Pi 輸出")?;
    if let Some(stderr) = child.stderr.take() {
        let log = app.path().app_data_dir().ok().map(|dir| dir.join("codex-sessions").join("pi.stderr.log"));
        std::thread::spawn(move || {
            let mut file = log.and_then(|path| {
                std::fs::create_dir_all(path.parent()?).ok()?;
                std::fs::OpenOptions::new().create(true).append(true).open(path).ok()
            });
            for line in BufReader::new(stderr).lines().flatten() {
                if let Some(output) = file.as_mut() {
                    let _ = writeln!(output, "{}", line);
                }
            }
        });
    }
    let instance = format!("{}", child.id());
    let event_instance = instance.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                let _ = app.emit("pi-event", json!({"instance":event_instance,"event":value}));
            }
        }
        let _ = app.emit(
            "pi-event",
            json!({"instance":event_instance,"event":{"type":"disconnected"}}),
        );
    });
    *lock = Some(PiProcess { child, stdin });
    Ok(instance)
}
#[tauri::command]
fn pi_send(command: Value, state: tauri::State<Session>) -> Result<(), String> {
    let kind = command.get("type").and_then(|v| v.as_str()).unwrap_or("");
    if ![
        "prompt",
        "abort",
        "reset",
        "set_model",
        "tool_response",
        "permission_response",
        "goal_control",
        "auth_providers",
        "auth_login",
        "auth_reply",
        "auth_cancel",
        "auth_logout",
        "models",
    ]
    .contains(&kind)
    {
        return Err("不支援的 Pi 命令".into());
    }
    let mut lock = state.pi.lock().map_err(|_| "Pi 狀態讀取失敗")?;
    let process = lock.as_mut().ok_or("Pi 尚未啟動")?;
    let text = serde_json::to_string(&command).map_err(|_| "命令序列化失敗")?;
    writeln!(process.stdin, "{}", text).map_err(|_| "Pi 連線已中斷")?;
    process.stdin.flush().map_err(|_| "Pi 寫入失敗".to_string())
}
fn main() {
    if std::env::args().nth(1).as_deref()==Some("--cv-resident-headless") {if let Err(error)=cv_runtime::headless_service(){eprintln!("{error}");std::process::exit(1);}return;}
    let app = tauri::Builder::default()
        .manage(Session::default())
        .manage(project_documents::PendingDocuments::default())
        .register_uri_scheme_protocol("agentcv-preview", |_context, request| visual_services::preview_response(request))
        .register_uri_scheme_protocol("agentcv-memory", |_context, request| memory_resources::response(request))
        .setup(|app| {
            let runtime = if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../runtime")
            } else {
                app.path().app_data_dir()
                    .map_err(|error| std::io::Error::other(error.to_string()))?
                    .join("runtime")
            };
            std::fs::create_dir_all(&runtime)?;
            std::env::set_var("AGENTCV_RUNTIME_ROOT", &runtime);
            // Windows file associations and the versioned launcher supply the
            // document on the command line (there is no RunEvent::Opened).
            #[cfg(windows)]
            for argument in std::env::args_os().skip(1) {
                let path = PathBuf::from(argument);
                let project = path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("agentcv"))
                    || path.file_name().is_some_and(|name| name == "manifest.agentcv.json");
                if project && path.is_absolute() && path.exists() {
                    app.state::<project_documents::PendingDocuments>().push(path);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            visual_services::create_visual_preview,
            visual_services::release_visual_preview,
            visual_services::open_node_article,
            visual_services::save_node_article,
            visual_services::visual_asset_library_save,
            visual_services::visual_asset_library_search,
            visual_services::visual_asset_library_get,
            import_images,
            open_project,
            project_documents::open_project_document,
            project_documents::take_project_open,
            project_documents::save_project_document,
            save_file,
            workspace::import_references,
            workspace::open_reference,
            workspace::open_auth_url,
            workspace::save_workspace,
            workspace::open_workspace,
            workspace::open_workspace_with_path,
            git_workspace::create_solution_version,
            git_workspace::list_solution_versions,
            git_workspace::read_solution_version,
            git_workspace::set_solution_tag,
            git_workspace::ensure_history_workspace,
            git_workspace::pending_history_count,
            git_workspace::retry_pending_history,
            git_workspace::attach_solution_history,
            git_workspace::export_solution_project,
            git_workspace::import_solution_project,
            cv_runtime::read_recorded_algorithm_sources,
            source_store::import_dataset_images,source_store::read_workspace_asset,source_store::open_dataset_workspace,
            inspection_files::save_inspection_unit,inspection_files::read_inspection_unit,inspection_files::list_inspection_units,inspection_files::read_inspection_artifact,inspection_files::prepare_external_run_files,inspection_files::open_external_run_file,
            app_session::read_app_session,
            app_session::write_app_session,
            app_session::complete_app_exit,
            cv_runtime::cv_runtime_info,
            cv_runtime::execute_cv_algorithm,
            cv_runtime::execute_inspection_session,
            inspection_archive::inspection_archive_status,
            inspection_archive::flush_inspection_archive,
            inspection_archive::retry_inspection_archive,
            inspection_archive::acknowledge_inspection_archive,
            cv_runtime::cancel_inspection_session,
            execute_native_pipeline,
            execute_two_boundary_geometry,
            cv_runtime::install_cv_packages,
            get_agent_profile,
            image_manager_request,
            save_agent_profile,
            pick_agent_package,
            pi_start,
            pi_send
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Ok(mut lock) = window.state::<Session>().pi.lock() {
                    *lock = None
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("AgentCV could not start");
    app.run(|app, event| {
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        if let tauri::RunEvent::Opened { ref urls } = event {
            for url in urls { if let Ok(path) = url.to_file_path() {
                app.state::<project_documents::PendingDocuments>().push(path);
            }}
            let _ = app.emit("project-open-requested", ());
            if let Some(window) = app.get_webview_window("main") { let _ = window.set_focus(); }
        }
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let saving = workspace::is_saving() || app_session::is_saving();
            if app_session::exit_approved() && !saving { return; }
            app_session::revoke_exit();
            // Cmd+Q can reach ExitRequested without a window close callback.
            // Keep the WebView alive until the frontend has flushed recovery or
            // explicitly discarded edits and invokes complete_app_exit.
            api.prevent_exit();
            if saving {
                let _ = app.emit("workspace-saving", json!({"status":"saving","message":"專案正在保存，完成後即可退出。"}));
            }
            let _ = app.emit("app-exit-requested", json!({"saving":saving}));
        }
    });
}

#[tauri::command]
async fn execute_native_pipeline(request: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || native_cv::execute(request)).await.map_err(|error| error.to_string())?
}

#[tauri::command]
async fn execute_two_boundary_geometry(request: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || two_boundary::execute(request)).await.map_err(|error| error.to_string())?
}
