# Download the official npm tarball in bounded ranges, then verify its npm SHA-512 integrity.
import urllib.request,json,concurrent.futures,pathlib,hashlib,base64,subprocess,tarfile,shutil,io
root=pathlib.Path(__file__).resolve().parents[1]
with urllib.request.urlopen('https://registry.npmjs.org/@tauri-apps%2fcli-darwin-arm64/2.12.4',timeout=30) as r:meta=json.load(r)
url=meta['dist']['tarball'];expected=meta['dist']['integrity'];size=8031628;chunk=512*1024
out=root/'qa/native-parts';out.mkdir(exist_ok=True)
def fetch(i):
 start=i*chunk;end=min(size-1,start+chunk-1);f=out/str(i)
 existing=f.read_bytes() if f.exists() else b''
 if len(existing)<end-start+1:
  tail=out/(str(i)+'.tail')
  subprocess.run(['curl','-fsS','--range',f'{start+len(existing)}-{end}','--max-time','180','--retry','1','-o',str(tail),url],check=True)
  f.write_bytes(existing+tail.read_bytes());tail.unlink()
 b=f.read_bytes()
 if len(b)!=end-start+1:raise RuntimeError('Range size mismatch')
 return b
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:data=b''.join(pool.map(fetch,range((size+chunk-1)//chunk)))
actual='sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()
if actual!=expected:raise SystemExit('npm integrity mismatch')
(root/'qa/tauri-native-verified.tgz').write_bytes(data)
print('Verified official npm SHA-512; tarball ready',len(data),flush=True)
shutil.rmtree(out)
