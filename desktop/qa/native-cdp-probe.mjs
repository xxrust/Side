import fs from 'node:fs/promises';
const [port,expressionFile]=process.argv.slice(2);
const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page=pages.find(p=>p.type==='page'&&/tauri.localhost/.test(p.url));
const s=new WebSocket(page.webSocketDebuggerUrl);
const timer=setTimeout(()=>{console.error('CDP timeout');process.exit(1)},20000);
await new Promise(r=>s.onopen=r);
s.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1){console.log(JSON.stringify(m));clearTimeout(timer);s.close()}};
s.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:await fs.readFile(expressionFile,'utf8'),returnByValue:true,awaitPromise:true}}));
