//! Windows pagefile mappings carry frozen display frames, never file artifacts.
//! The worker keeps each mapping alive until the next request (the acknowledgement
//! that the serial host has copied every frame). Rust then owns independent bytes.
#[cfg(windows)]
pub fn read(reference:&serde_json::Value,size:usize)->Result<Vec<u8>,String>{
 use std::{ffi::c_void,ptr};
 type Handle=*mut c_void;
 #[link(name="kernel32")]
 extern "system"{
  fn OpenFileMappingW(access:u32,inherit:i32,name:*const u16)->Handle;
  fn MapViewOfFile(mapping:Handle,access:u32,offset_high:u32,offset_low:u32,bytes:usize)->*mut c_void;
  fn UnmapViewOfFile(address:*const c_void)->i32;
  fn CloseHandle(handle:Handle)->i32;
 }
 const PREFIX:&str="Local\\AgentCV-preview-";
 const FILE_MAP_READ:u32=4;
 let name=reference["name"].as_str().ok_or("SHARED_PREVIEW_NAME_REQUIRED")?;
 let token=name.strip_prefix(PREFIX).ok_or("SHARED_PREVIEW_NAME_INVALID")?;
 if reference["kind"]!="windows-pagefile-v1"||reference["bytes"].as_u64()!=Some(size as u64)
  ||!(54..=24*1024*1024).contains(&size)||token.len()!=64||!token.bytes().all(|b|b.is_ascii_hexdigit()){
  return Err("SHARED_PREVIEW_DESCRIPTOR_INVALID".into());
 }
 let wide:Vec<u16>=name.encode_utf16().chain(Some(0)).collect();
 // RAII closes both resources even if allocation/copy unwinds.
 struct Mapping{handle:Handle,address:*mut c_void}
 impl Drop for Mapping{fn drop(&mut self){unsafe{if !self.address.is_null(){UnmapViewOfFile(self.address);}CloseHandle(self.handle);}}}
 let handle=unsafe{OpenFileMappingW(FILE_MAP_READ,0,wide.as_ptr())};
 if handle.is_null(){return Err(format!("SHARED_PREVIEW_OPEN_FAILED: {}",std::io::Error::last_os_error()));}
 let mut mapping=Mapping{handle,address:ptr::null_mut()};
 mapping.address=unsafe{MapViewOfFile(handle,FILE_MAP_READ,0,0,size)};
 if mapping.address.is_null(){return Err(format!("SHARED_PREVIEW_MAP_FAILED: {}",std::io::Error::last_os_error()));}
 Ok(unsafe{std::slice::from_raw_parts(mapping.address.cast::<u8>(),size)}.to_vec())
}

#[cfg(not(windows))]
pub fn read(_reference:&serde_json::Value,_size:usize)->Result<Vec<u8>,String>{Err("SHARED_PREVIEW_PLATFORM_UNSUPPORTED".into())}

#[cfg(all(test,windows))]
mod tests{
 use super::*;
 use std::{io::{BufRead,BufReader,Write},process::{Command,Stdio},os::windows::process::CommandExt};
 #[test]
 fn actual_python_pagefile_frame_is_independent_and_invalid_or_expired_descriptors_fail(){
  let name=format!("Local\\AgentCV-preview-{:064x}",std::process::id());
  let executable=std::env::var_os("AGENTCV_PYTHON").unwrap_or_else(||"python.exe".into());
  let mut child=Command::new(executable).creation_flags(0x08000000).arg("-u").arg("-c")
   .arg("import mmap,sys\nm=mmap.mmap(-1,64,tagname=sys.argv[1])\nm[:]=bytes(range(64))\nprint('ready',flush=True)\nsys.stdin.readline()\nm[:]=bytes([99])*64\nm.close()")
   .arg(&name).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
  let mut line=String::new();BufReader::new(child.stdout.take().unwrap()).read_line(&mut line).unwrap();assert_eq!(line.trim(),"ready");
  let reference=serde_json::json!({"kind":"windows-pagefile-v1","name":name,"bytes":64});
  let bytes=read(&reference,64).unwrap();assert_eq!(bytes,(0..64u8).collect::<Vec<_>>());
  let mut forged=reference.clone();forged["bytes"]=serde_json::json!(65);assert!(read(&forged,64).is_err());
  forged=reference.clone();forged["name"]=serde_json::json!("Local\\unrelated-mapping");assert!(read(&forged,64).is_err());
  assert!(read(&reference,65).is_err());
  child.stdin.take().unwrap().write_all(b"release\n").unwrap();assert!(child.wait().unwrap().success());
  assert_eq!(bytes,(0..64u8).collect::<Vec<_>>());assert!(read(&reference,64).is_err());
 }
}
