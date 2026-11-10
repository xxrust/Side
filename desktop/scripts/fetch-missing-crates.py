# Use standard Cargo commands to fill only missing metadata, avoiding repeated large index refreshes.
import subprocess,pathlib,re,os,time
root=pathlib.Path(__file__).resolve().parents[1]
env={**os.environ,'CARGO_HTTP_MULTIPLEXING':'false','CARGO_HTTP_TIMEOUT':'20','CARGO_NET_RETRY':'1'}
attempts={}
for i in range(200):
 result=subprocess.run(['cargo','generate-lockfile','--manifest-path',str(root/'src-tauri/Cargo.toml'),'--offline'],capture_output=True,text=True,env=env)
 if result.returncode==0:print('LOCKFILE READY',flush=True);break
 match=re.search(r'no matching package named `([^`]+)`',result.stderr) or re.search(r'failed to select a version for `([^`]+)`',result.stderr) or re.search(r'failed to select a version for the requirement `([^ =]+)',result.stderr)
 if not match:print(result.stderr,flush=True);raise SystemExit(1)
 name=match.group(1);attempts[name]=attempts.get(name,0)+1
 if attempts[name]>3:raise SystemExit('No resolution progress for '+name)
 print(i,'Fetching',name,flush=True)
 try:
  response=subprocess.run(['cargo','info',name],cwd=root.parent,capture_output=True,text=True,env=env,timeout=35)
  if response.returncode:print(response.stderr[-500:],flush=True)
 except subprocess.TimeoutExpired:print('Download timed out; rechecking cached metadata for',name,flush=True)
else:raise SystemExit('metadata limit reached')
