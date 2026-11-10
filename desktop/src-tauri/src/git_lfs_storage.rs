//! Standard Git LFS object storage without global installation or network access.
//! Sources and objects are read in bounded chunks; Git receives only standard SHA-256 v1 pointers.
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

#[cfg(test)]
use std::process::Command;

const HEADER: &str = "version https://git-lfs.github.com/spec/v1\n";
const EMPTY_OID: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const BUFFER: usize = 256 * 1024;
static SERIAL: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Descriptor {
    pub oid: String,
    pub size: u64,
}

/// Recognise candidate LFS pointers, including malformed/unsupported ones so
/// callers do not silently treat an unresolved pointer as original image data.
pub fn is_pointer(bytes: &[u8]) -> bool {
    bytes.is_empty() || bytes.starts_with(b"version https://git-lfs.github.com/spec/")
}

/// Only canonical SHA-256 v1 pointers are accepted. Unknown pointer extensions
/// are rejected rather than discarded or guessed.
pub fn descriptor(bytes: &[u8]) -> Result<Descriptor, String> {
    if bytes.is_empty() {
        return Ok(Descriptor {
            oid: EMPTY_OID.into(),
            size: 0,
        });
    }
    if bytes.len() >= 1024 {
        return Err("Git LFS 指標過大或格式不受支援".into());
    }
    let text = std::str::from_utf8(bytes).map_err(|_| "Git LFS 指標不是 UTF-8")?;
    let rest = text
        .strip_prefix(HEADER)
        .ok_or("Git LFS 指標版本不受支援")?;
    let (oid_line, size_line) = rest.split_once('\n').ok_or("Git LFS 指標缺少內容識別")?;
    let oid = oid_line
        .strip_prefix("oid sha256:")
        .ok_or("Git LFS 指標雜湊類型不受支援")?;
    if oid.len() != 64
        || !oid
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    {
        return Err("Git LFS 指標 SHA-256 無效".into());
    }
    let size_text = size_line
        .strip_prefix("size ")
        .and_then(|s| s.strip_suffix('\n'))
        .ok_or("Git LFS 指標大小格式無效")?;
    let size: u64 = size_text.parse().map_err(|_| "Git LFS 指標大小無效")?;
    if size == 0 {
        return Err("Git LFS 空檔必須使用標準空指標".into());
    }
    if format!("{HEADER}oid sha256:{oid}\nsize {size}\n") != text {
        return Err("Git LFS 指標不是可核對的標準格式".into());
    }
    Ok(Descriptor {
        oid: oid.into(),
        size,
    })
}

fn regular_file(path: &Path, label: &str) -> Result<File, String> {
    let meta =
        fs::symlink_metadata(path).map_err(|_| format!("{label}不存在：{}", path.display()))?;
    if !meta.is_file() || meta.file_type().is_symlink() {
        return Err(format!("{label}不是安全的一般檔案：{}", path.display()));
    }
    File::open(path).map_err(|_| format!("無法讀取{label}：{}", path.display()))
}
fn checked_directory(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() && !m.file_type().is_symlink() => Ok(()),
        Ok(_) => Err(format!("Git LFS 儲存路徑不安全：{}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(path).map_err(|_| format!("無法建立 Git LFS 目錄：{}", path.display()))
        }
        Err(_) => Err(format!("無法檢查 Git LFS 目錄：{}", path.display())),
    }
}
fn repo_path(repo: &Path) -> Result<PathBuf, String> {
    let meta = fs::symlink_metadata(repo).map_err(|_| "Git LFS 專案版本庫不存在")?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("Git LFS 版本庫路徑不安全".into());
    }
    repo.canonicalize()
        .map_err(|_| "無法定位 Git LFS 版本庫".into())
}
fn storage(repo: &Path) -> Result<PathBuf, String> {
    let repo = repo_path(repo)?;
    let lfs = repo.join("lfs");
    checked_directory(&lfs)?;
    checked_directory(&lfs.join("objects"))?;
    checked_directory(&lfs.join("tmp"))?;
    Ok(lfs)
}
/// Return the standard local object path without creating directories or
/// files. Existing storage components must be real directories, not symlinks.
/// A missing component is permitted so verify() can report the missing object.
pub fn object_path(repo: &Path, item: &Descriptor) -> Result<PathBuf, String> {
    if item.oid.len() != 64
        || !item
            .oid
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    {
        return Err("Git LFS 內容識別無效".into());
    }
    let repo = repo_path(repo)?;
    let mut component = repo;
    for name in ["lfs", "objects", &item.oid[..2], &item.oid[2..4]] {
        component.push(name);
        match fs::symlink_metadata(&component) {
            Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => {}
            Ok(_) => return Err(format!("Git LFS 儲存路徑不安全：{}", component.display())),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                // Missing parents cannot contain existing descendants; merely
                // compute the remaining path, with no mkdir side effect.
            }
            Err(_) => return Err(format!("無法檢查 Git LFS 目錄：{}", component.display())),
        }
    }
    Ok(component.join(&item.oid))
}
/// Directory creation is confined to a store operation. Read/verify paths use
/// the public lookup above and never bootstrap an empty object store.
fn writable_object_path(repo: &Path, item: &Descriptor) -> Result<PathBuf, String> {
    let target = object_path(repo, item)?;
    let objects = storage(repo)?.join("objects");
    let first = objects.join(&item.oid[..2]);
    checked_directory(&first)?;
    checked_directory(&first.join(&item.oid[2..4]))?;
    Ok(target)
}
fn digest(mut input: File, mut output: Option<&mut File>) -> Result<Descriptor, String> {
    let mut hash = Sha256::new();
    let mut size = 0u64;
    let mut buffer = vec![0u8; BUFFER];
    loop {
        let n = input
            .read(&mut buffer)
            .map_err(|_| "讀取 Git LFS 內容失敗")?;
        if n == 0 {
            break;
        }
        size = size.checked_add(n as u64).ok_or("Git LFS 檔案大小溢位")?;
        hash.update(&buffer[..n]);
        if let Some(dest) = output.as_deref_mut() {
            dest.write_all(&buffer[..n])
                .map_err(|_| "寫入 Git LFS 內容失敗")?;
        }
    }
    Ok(Descriptor {
        oid: format!("{:x}", hash.finalize()),
        size,
    })
}
fn verify_item(repo: &Path, item: &Descriptor) -> Result<(), String> {
    if item.size == 0 && item.oid == EMPTY_OID {
        return Ok(());
    }
    let object = object_path(repo, item)?;
    let actual = digest(regular_file(&object, "Git LFS 原件")?, None)?;
    if actual != *item {
        return Err(format!(
            "Git LFS 原件損壞：{}，預期 {} bytes；未用縮圖或其他圖像代替",
            item.oid, item.size
        ));
    }
    Ok(())
}
pub fn verify(repo: &Path, pointer: &[u8]) -> Result<Descriptor, String> {
    let item = descriptor(pointer)?;
    verify_item(repo, &item)?;
    Ok(item)
}

#[cfg(test)]
fn executable() -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Some(path) = std::env::var_os("AGENTCV_GIT_LFS") {
        let path = PathBuf::from(path);
        return if path.is_file() {
            Ok(path)
        } else {
            Err("AGENTCV_GIT_LFS 指定的執行檔不存在，未切換到其他版本".into())
        };
    }
    if let Some(paths) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&paths).map(|p| {
            p.join(if cfg!(windows) {
                "git-lfs.exe"
            } else {
                "git-lfs"
            })
        }));
    }
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        candidates.extend([
            home.join(".nix-profile/bin/git-lfs"),
            home.join(".local/bin/git-lfs"),
        ]);
    }
    candidates.extend([
        PathBuf::from("/opt/homebrew/bin/git-lfs"),
        PathBuf::from("/usr/local/bin/git-lfs"),
        PathBuf::from("/usr/bin/git-lfs"),
    ]);
    candidates.into_iter().find(|p| p.is_file()).ok_or_else(|| {
        "找不到 Git LFS；大型原件未保存，請配置 Git LFS 後重試（不會改存普通 Git blob）".into()
    })
}
#[cfg(test)]
fn command(repo: &Path) -> Result<Command, String> {
    let repo = repo_path(repo)?;
    let executable = executable()?;
    let mut cmd = Command::new(&executable);
    // No model credentials, user/global Git configuration, hooks or network
    // credentials are inherited by this local storage operation.
    cmd.env_clear()
        .current_dir(&repo)
        .env("GIT_DIR", &repo)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_LFS_SKIP_DOWNLOAD_ERRORS", "0")
        .env("GIT_CONFIG_COUNT", "5")
        .env("GIT_CONFIG_KEY_0", "lfs.storage")
        .env("GIT_CONFIG_VALUE_0", repo.join("lfs"))
        .env("GIT_CONFIG_KEY_1", "core.hooksPath")
        .env(
            "GIT_CONFIG_VALUE_1",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env("GIT_CONFIG_KEY_2", "core.fsmonitor")
        .env("GIT_CONFIG_VALUE_2", "false")
        .env("GIT_CONFIG_KEY_3", "core.attributesFile")
        .env(
            "GIT_CONFIG_VALUE_3",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env("GIT_CONFIG_KEY_4", "lfs.repositoryformatversion")
        .env("GIT_CONFIG_VALUE_4", "0");
    let mut paths = vec![executable
        .parent()
        .unwrap_or(Path::new("/usr/bin"))
        .to_path_buf()];
    if let Some(path) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&path));
    }
    paths.extend([
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    cmd.env(
        "PATH",
        std::env::join_paths(paths).map_err(|_| "Git LFS 執行路徑無效")?,
    );
    for key in ["SYSTEMROOT", "WINDIR"] {
        if let Some(value) = std::env::var_os(key) {
            cmd.env(key, value);
        }
    }
    Ok(cmd)
}
#[cfg(test)]
fn cli_output(mut command: Command, operation: &str) -> Result<Vec<u8>, String> {
    let result = command
        .output()
        .map_err(|e| format!("{operation}無法啟動：{e}"))?;
    if !result.status.success() {
        return Err(format!(
            "{operation}失敗：{}",
            String::from_utf8_lossy(&result.stderr)
                .trim()
                .chars()
                .take(500)
                .collect::<String>()
        ));
    }
    if result.stdout.len() >= 1024 {
        return Err(format!("{operation}回傳非標準指標"));
    }
    Ok(result.stdout)
}
struct TempFile(PathBuf);
impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
fn temporary(parent: &Path) -> Result<(TempFile, File), String> {
    for _ in 0..100 {
        let path = parent.join(format!(
            ".agentcv-lfs-{}-{}.tmp",
            std::process::id(),
            SERIAL.fetch_add(1, Ordering::Relaxed)
        ));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(f) => return Ok((TempFile(path), f)),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("無法建立 Git LFS 原子寫入暫存".into()),
        }
    }
    Err("無法建立唯一 Git LFS 暫存".into())
}
/// Generate the canonical pointer with the real Git LFS CLI and write its
/// corresponding standard local object atomically. `clean` is deliberately not
/// used: it changes lfs.repositoryformatversion in the caller's local config.
/// pointer --file preserves literal pointer-shaped imported files as raw bytes.
pub fn store(repo: &Path, source: &Path) -> Result<Vec<u8>, String> {
    // Hash directly rather than spawning git-lfs once for every asset in every
    // inspection. The canonical pointer and object layout remain Git LFS v1;
    // integration tests verify these with the real git-lfs CLI and fsck.
    let expected = digest(regular_file(source, "Git LFS 來源")?, None)?;
    let pointer = if expected.size == 0 { Vec::new() } else {
        format!("{HEADER}oid sha256:{}\nsize {}\n", expected.oid, expected.size).into_bytes()
    };
    if expected.size == 0 {
        if digest(regular_file(&source, "Git LFS 來源")?, None)? != expected {
            return Err("Git LFS 來源在保存期間已改變".into());
        }
        return Ok(pointer);
    }
    let target = writable_object_path(repo, &expected)?;
    if fs::symlink_metadata(&target).is_ok() {
        verify_item(repo, &expected)?;
    } else {
        let (temp, mut output) = temporary(target.parent().unwrap())?;
        let actual = digest(regular_file(&source, "Git LFS 來源")?, Some(&mut output))?;
        if actual != expected {
            return Err("Git LFS 來源在保存期間已改變，未建立快照".into());
        }
        output.sync_all().map_err(|_| "Git LFS 原件同步失敗")?;
        drop(output);
        fs::rename(&temp.0, &target).map_err(|_| "Git LFS 原件保存失敗")?;
    }
    verify_item(repo, &expected)?;
    Ok(pointer)
}
/// Restore from a local object only. Missing/corrupt bytes are fatal; no remote
/// request, lossy conversion, thumbnail substitute or deletion is performed.
pub fn materialize(repo: &Path, pointer: &[u8], destination: &Path) -> Result<(), String> {
    let expected = descriptor(pointer)?;
    let parent = destination.parent().ok_or("Git LFS 還原路徑無效")?;
    let meta = fs::symlink_metadata(parent).map_err(|_| "Git LFS 還原目錄不存在")?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("Git LFS 還原目錄不安全".into());
    }
    if let Ok(meta) = fs::symlink_metadata(destination) {
        if !meta.is_file() || meta.file_type().is_symlink() {
            return Err("Git LFS 還原目的地不安全".into());
        }
        let actual = digest(regular_file(destination, "還原目的檔案")?, None)?;
        if actual == expected {
            verify_item(repo, &expected)?;
            return Ok(());
        }
        return Err("Git LFS 還原目的地已有不同內容，未覆寫".into());
    }
    let (temp, mut output) = temporary(parent)?;
    let actual = if expected.size == 0 && expected.oid == EMPTY_OID {
        expected.clone()
    } else {
        let object = object_path(repo, &expected)?;
        digest(regular_file(&object, "Git LFS 原件")?, Some(&mut output))?
    };
    if actual != expected {
        return Err(format!("Git LFS 原件損壞：{}，未還原", expected.oid));
    }
    output.sync_all().map_err(|_| "Git LFS 還原內容同步失敗")?;
    drop(output);
    fs::rename(&temp.0, destination).map_err(|_| "Git LFS 原件無法原子還原")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Stdio;
    struct Folder(PathBuf);
    impl Drop for Folder {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn folder() -> Folder {
        let p = std::env::temp_dir().join(format!(
            "agentcv-lfs-test-{}-{}",
            std::process::id(),
            SERIAL.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&p).unwrap();
        Folder(p)
    }
    fn repo(root: &Path) -> PathBuf {
        let p = root.join("history.git");
        let out = Command::new("git")
            .args(["init", "--bare", "--template="])
            .arg(&p)
            .output()
            .unwrap();
        assert!(out.status.success());
        p
    }
    fn assert_standard_pointer(repo: &Path, pointer: &[u8]) {
        let mut cmd = command(repo).unwrap();
        cmd.args(["pointer", "--check", "--strict", "--stdin"])
            .stdin(Stdio::piped());
        let mut child = cmd.spawn().unwrap();
        child.stdin.take().unwrap().write_all(pointer).unwrap();
        assert!(child.wait().unwrap().success());
    }
    #[test]
    fn missing_object_lookup_and_verify_never_create_storage_directories() {
        fn paths(root: &Path) -> Vec<PathBuf> {
            let mut result = Vec::new();
            let mut pending = vec![root.to_path_buf()];
            while let Some(dir) = pending.pop() {
                for entry in fs::read_dir(&dir).unwrap() {
                    let entry = entry.unwrap();
                    let path = entry.path();
                    result.push(path.strip_prefix(root).unwrap().to_path_buf());
                    if entry.file_type().unwrap().is_dir() {
                        pending.push(path);
                    }
                }
            }
            result.sort();
            result
        }
        let t = folder();
        let r = repo(&t.0);
        let source = t.0.join("missing-source.raw");
        fs::write(&source, b"actual missing object bytes").unwrap();
        let mut cli = command(&r).unwrap();
        cli.arg("pointer")
            .arg(format!("--file={}", source.display()));
        let pointer = cli_output(cli, "test pointer").unwrap();
        let item = descriptor(&pointer).unwrap();
        let before = paths(&r);
        let target = object_path(&r, &item).unwrap();
        assert!(!target.exists());
        assert!(verify(&r, &pointer).unwrap_err().contains("不存在"));
        assert_eq!(paths(&r), before);
        assert!(!r.join("lfs").exists());
        fs::create_dir(r.join("lfs")).unwrap();
        fs::create_dir(r.join("lfs/objects")).unwrap();
        let partial = paths(&r);
        assert!(!object_path(&r, &item).unwrap().exists());
        assert!(verify(&r, &pointer).unwrap_err().contains("不存在"));
        assert_eq!(paths(&r), partial);
        assert!(!r.join("lfs/tmp").exists());
        assert!(!r.join("lfs/objects").join(&item.oid[..2]).exists());
        // Store is the operation which is allowed to create the shard tree.
        assert_eq!(store(&r, &source).unwrap(), pointer);
        assert!(target.is_file());
        assert_eq!(verify(&r, &pointer).unwrap(), item);
    }
    #[test]
    fn real_cli_pointer_deduplicates_and_restores_exact_bytes() {
        let t = folder();
        let r = repo(&t.0);
        let source = t.0.join("image.bin");
        fs::write(&source, b"actual source file bytes\0\x01\x02").unwrap();
        let config = fs::read(r.join("config")).unwrap();
        let first = store(&r, &source).unwrap();
        assert_eq!(
            fs::read(r.join("config")).unwrap(),
            config,
            "git-lfs must not modify project Git config"
        );
        assert_standard_pointer(&r, &first);
        let item = descriptor(&first).unwrap();
        assert_eq!(verify(&r, &first).unwrap(), item);
        let object = object_path(&r, &item).unwrap();
        let bytes = fs::read(&object).unwrap();
        assert_eq!(store(&r, &source).unwrap(), first);
        assert_eq!(fs::read(object).unwrap(), bytes);
        let output = t.0.join("restored.bin");
        materialize(&r, &first, &output).unwrap();
        assert_eq!(fs::read(output).unwrap(), fs::read(source).unwrap());
    }
    #[test]
    fn missing_and_corrupt_local_objects_fail_without_creating_destination() {
        let t = folder();
        let r = repo(&t.0);
        let source = t.0.join("image.bin");
        fs::write(&source, b"real saved file").unwrap();
        let pointer = store(&r, &source).unwrap();
        let item = descriptor(&pointer).unwrap();
        let object = object_path(&r, &item).unwrap();
        fs::remove_file(&object).unwrap();
        let output = t.0.join("missing.bin");
        assert!(materialize(&r, &pointer, &output)
            .unwrap_err()
            .contains("不存在"));
        assert!(!output.exists());
        let existing = t.0.join("existing.bin");
        fs::copy(&source, &existing).unwrap();
        assert!(materialize(&r, &pointer, &existing)
            .unwrap_err()
            .contains("不存在"));
        fs::write(&object, b"corrupt").unwrap();
        assert!(materialize(&r, &pointer, &output)
            .unwrap_err()
            .contains("損壞"));
        assert!(!output.exists());
        assert!(store(&r, &source).unwrap_err().contains("損壞"));
        assert_eq!(fs::read(object).unwrap(), b"corrupt");
    }
    #[test]
    fn large_binary_uses_streaming_io_and_shares_one_object() {
        let t = folder();
        let r = repo(&t.0);
        let source = t.0.join("large.raw");
        let mut f = File::create(&source).unwrap();
        let block: Vec<u8> = (0..BUFFER)
            .map(|n| ((n * 31 + n / 13) % 251) as u8)
            .collect();
        for _ in 0..132 {
            f.write_all(&block).unwrap();
        }
        f.sync_all().unwrap();
        drop(f);
        let first = store(&r, &source).unwrap();
        let item = descriptor(&first).unwrap();
        assert!(item.size > 32 * 1024 * 1024);
        assert_standard_pointer(&r, &first);
        let again = store(&r, &source).unwrap();
        assert_eq!(again, first);
        let output = t.0.join("large-restored.raw");
        materialize(&r, &first, &output).unwrap();
        assert_eq!(
            digest(regular_file(&output, "output").unwrap(), None).unwrap(),
            item
        );
    }
    #[test]
    fn literal_pointer_content_empty_files_and_bad_pointers_are_handled_honestly() {
        let t = folder();
        let r = repo(&t.0);
        let source = t.0.join("literal-pointer.txt");
        let literal = format!("{HEADER}oid sha256:{}\nsize 123\n", "0".repeat(64));
        fs::write(&source, literal.as_bytes()).unwrap();
        let pointer = store(&r, &source).unwrap();
        assert_ne!(pointer, literal.as_bytes());
        assert_standard_pointer(&r, &pointer);
        let output = t.0.join("literal-restored.txt");
        materialize(&r, &pointer, &output).unwrap();
        assert_eq!(fs::read(output).unwrap(), literal.as_bytes());
        fs::write(&source, []).unwrap();
        let empty = store(&r, &source).unwrap();
        assert!(empty.is_empty());
        let output = t.0.join("empty");
        materialize(&r, &empty, &output).unwrap();
        assert_eq!(fs::metadata(output).unwrap().len(), 0);
        assert!(!is_pointer(b"legacy raw image"));
        assert!(is_pointer(b"version https://git-lfs.github.com/spec/v2\n"));
        assert!(descriptor(b"version https://git-lfs.github.com/spec/v2\n").is_err());
    }
    #[test]
    fn real_git_lfs_fsck_accepts_the_standard_object_and_committed_pointer() {
        fn git_input(repo: &Path, args: &[&str], input: &[u8]) -> String {
            let mut child = Command::new("git")
                .arg("--git-dir")
                .arg(repo)
                .args(args)
                .env("GIT_CONFIG_GLOBAL", "/dev/null")
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .env("GIT_AUTHOR_NAME", "AgentCV QA")
                .env("GIT_AUTHOR_EMAIL", "qa@local.invalid")
                .env("GIT_COMMITTER_NAME", "AgentCV QA")
                .env("GIT_COMMITTER_EMAIL", "qa@local.invalid")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            child.stdin.take().unwrap().write_all(input).unwrap();
            let out = child.wait_with_output().unwrap();
            assert!(
                out.status.success(),
                "{}",
                String::from_utf8_lossy(&out.stderr)
            );
            String::from_utf8(out.stdout).unwrap().trim().into()
        }
        let t = folder();
        let r = repo(&t.0);
        git_input(
            &r,
            &["config", "--local", "lfs.repositoryformatversion", "0"],
            b"",
        );
        let config_before = fs::read(r.join("config")).unwrap();
        let source = t.0.join("input.raw");
        fs::write(&source, b"real binary source\0\x01\x02").unwrap();
        let pointer = store(&r, &source).unwrap();
        let attr = git_input(
            &r,
            &["hash-object", "-w", "--stdin"],
            b"*.raw filter=lfs diff=lfs merge=lfs -text\n",
        );
        let blob = git_input(&r, &["hash-object", "-w", "--stdin"], &pointer);
        let tree = git_input(
            &r,
            &["mktree"],
            format!("100644 blob {attr}\t.gitattributes\n100644 blob {blob}\tinput.raw\n")
                .as_bytes(),
        );
        let commit = git_input(
            &r,
            &["commit-tree", &tree, "-m", "real LFS storage validation"],
            b"",
        );
        git_input(&r, &["update-ref", "refs/heads/master", &commit], b"");
        // A new managed repo can set the standard LFS format explicitly before
        // recording its config hash; subsequent fsck must leave it unchanged.
        let mut fsck = command(&r).unwrap();
        let result = fsck.args(["fsck", "--objects", &commit]).output().unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert!(String::from_utf8_lossy(&result.stdout).contains("Git LFS fsck OK"));
        assert_eq!(fs::read(r.join("config")).unwrap(), config_before);
    }
    #[cfg(unix)]
    #[test]
    fn symlink_object_paths_are_rejected() {
        use std::os::unix::fs::symlink;
        let t = folder();
        let r = repo(&t.0);
        let source = t.0.join("input");
        fs::write(&source, b"source").unwrap();
        storage(&r).unwrap();
        let outside = t.0.join("outside");
        fs::create_dir(&outside).unwrap();
        let item = digest(regular_file(&source, "source").unwrap(), None).unwrap();
        symlink(&outside, r.join("lfs/objects").join(&item.oid[..2])).unwrap();
        assert!(store(&r, &source).is_err());
        assert!(fs::read_dir(outside).unwrap().next().is_none());
    }
}
