import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../dist'),config=JSON.parse(await fs.readFile(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'));
http.createServer(async(req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));if(!file.startsWith(root+path.sep))throw Error('outside');const bytes=await fs.readFile(file);const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Content-Security-Policy':config.app.security.csp});res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}}).listen(1422,'127.0.0.1',()=>console.log('Built app + production CSP on 127.0.0.1:1422'));
