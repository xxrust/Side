#[allow(dead_code)]
#[path="../src/inspection_files.rs"]
mod inspection_files;
// Create an initial solution checkpoint through the production native API.
#[allow(dead_code)] #[path="../src/workspace.rs"] mod workspace;
#[allow(dead_code)] #[path="../src/git_lfs_storage.rs"] mod git_lfs_storage;
#[allow(dead_code)] #[path="../src/history_transfer.rs"] mod history_transfer;
#[allow(dead_code)] #[path="../src/git_workspace.rs"] mod git_workspace;
fn main(){let args:Vec<_>=std::env::args().collect();assert!(args.len()==3||args.len()==4,"portable JSON, project path and optional checkpoint label required");let content=std::fs::read_to_string(&args[1]).expect("actual project");let project:serde_json::Value=serde_json::from_str(&content).unwrap();let run=project["algorithmRuns"].as_array().and_then(|runs| runs.last()).expect("actual saved run")["runId"].as_str().unwrap().to_string();let receipt=tauri::async_runtime::block_on(git_workspace::create_solution_version(args[2].clone(),content,args.get(3).cloned().unwrap_or_else(||"保存實際方案檢查點".into()),Some("checkpoint".into()),Some(run))).expect("actual Git/LFS checkpoint");println!("{}",serde_json::to_string(&receipt).unwrap());}
