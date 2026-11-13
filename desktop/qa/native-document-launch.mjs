import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const [port,inputFile,projectPath,output]=process.argv.slice(2);
const input=JSON.parse(await fs.readFile(inputFile,'utf8'));
let page;for(let i=0;i<150&&!page;i++){try{page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page'&&/tauri.localhost/.test(p.url))}catch{}if(!page)await new Promise(r=>setTimeout(r,200))}
assert.ok(page);const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
const pending=new Map();let sequence=0;
socket.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error(method+' timeout')),30000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value};
const report={};
try{
 for(let i=0;i<600;i++){if(await evaluate('!!globalThis.AgentCVDesktop&&AgentCVDesktop.project.data.images.length===33'))break;await new Promise(r=>setTimeout(r,100))}
 assert.equal(await evaluate('window.__TAURI_INTERNALS__.invoke("plugin:app|identifier")'),'studio.agentcv.desktop.runtime.qa');
 report.loaded=await evaluate(`(async()=>{const a=AgentCVDesktop,p=a.project;await a.startupReady;const expected=${JSON.stringify(input.scheme)};if(p.data.purposeScheme.operatorGraph.nodes.find(n=>n.id==='objects').code!==expected.operatorGraph.nodes.find(n=>n.id==='objects').code)throw Error('Wrong optimized algorithm');const reads=[];for(const image of p.data.images){await p.ensureImagePixels(image.id);const asset=await p.readImageAsset(image.id);if(!asset.startsWith('data:image/'))throw Error('Unreadable '+image.name);reads.push({name:image.name,bytes:asset.length})}return {path:a.sessionRecovery.projectPath,images:reads.length,version:p.data.purposeScheme.version,unreadable:reads.filter(r=>!r.bytes),appText:document.body.innerText.slice(0,50)}})()`);
 assert.ok(report.loaded.path.endsWith(projectPath.replaceAll('/','\\')));assert.equal(report.loaded.images,33);assert.equal(report.loaded.version,input.scheme.version);
 const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(output+'.png',Buffer.from(shot.data,'base64'));report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1}
finally{await fs.writeFile(output+'.json',JSON.stringify(report,null,2));socket.close()}
console.log(JSON.stringify(report,null,2));
