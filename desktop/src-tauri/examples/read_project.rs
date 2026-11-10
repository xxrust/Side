#[allow(dead_code)]
#[path="../src/inspection_files.rs"]
mod inspection_files;
// Read an existing project through the production loader without writing it.
#[allow(dead_code)]
#[path="../src/workspace.rs"]
mod workspace;
fn main() {
    let root = std::env::args().nth(1).expect("project directory required");
    let content = workspace::read_workspace(std::path::Path::new(&root)).expect("native project load");
    println!("{content}");
}
