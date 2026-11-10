#[allow(dead_code)]
#[path="../src/inspection_files.rs"]
mod inspection_files;
// Export a real portable project through the exact native persistence facade.
#[allow(dead_code)]
#[path="../src/workspace.rs"]
mod workspace;
fn main(){let args:Vec<_>=std::env::args().collect();assert_eq!(args.len(),3,"source JSON and new project directory required");let source=std::path::Path::new(&args[1]);let target=std::path::Path::new(&args[2]);assert!(!target.exists(),"target must be new; existing projects are never overwritten");let content=std::fs::read_to_string(source).expect("read actual project");workspace::write_workspace(target,&content).expect("native save");let restored=workspace::read_workspace(target).expect("native load");let original:serde_json::Value=serde_json::from_str(&content).unwrap();let actual:serde_json::Value=serde_json::from_str(&restored).unwrap();assert_eq!(original,actual,"native persistence must retain exact project contents");println!("{}",serde_json::json!({"path":target,"source":source,"roundtripExact":true}));}
