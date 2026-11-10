// Run only against a disposable Tauri desktop instance with isolated app data.
// Input: {image:{name,dataUrl},scheme}. Executes the unchanged scheme through
// the real app callback, native IPC, Rust dispatch and installed Python.
// node qa/native-desktop-execution.mjs <CDP port> <input.json> <evidence directory>
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [port,inputFile,out]=process.argv.slice(2);
if(!port||!inputFile||!out)throw Error('Provide CDP port, input.json and evidence directory for an isolated desktop instance');
await fs.mkdir(out,{recursive:true});
const input=JSON.parse(await fs.readFile(inputFile,'utf8'));
const pages=await (await fetch(`http://127.0.0.1:${Number(port)}/json/list`)).json();
const page=pages.find(p=>p.type==='page'&&/tauri\.localhost|tauri:\/\//.test(p.url));
assert.ok(page,'A real Tauri desktop WebView is required');
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let sequence=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
socket.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id)return;const call=pending.get(message.id);if(!call)return;pending.delete(message.id);message.error?call.reject(Error(JSON.stringify(message.error))):call.resolve(message.result);};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||JSON.stringify(result.exceptionDetails));return result.result.value;}
const report={desktopUrl:page.url,checks:[],runs:[]};
try{
 report.identifier=await evaluate('window.__TAURI_INTERNALS__.invoke("plugin:app|identifier")');
 assert.ok(report.identifier.endsWith('.qa'),'Refusing to operate on a production application identifier');
 const initial=await evaluate('(async()=>{await AgentCVDesktop.startupReady;return {images:AgentCVDesktop.project.data.images.length,path:AgentCVDesktop.sessionRecovery.projectPath};})()');
 assert.equal(initial.images,0,'Disposable desktop must start without an existing project');assert.equal(initial.path,null,'Disposable desktop must not point to an existing workspace');
 report.environment=await evaluate('(async()=>{await AgentCVDesktop.startupReady;return window.__TAURI_INTERNALS__.invoke("cv_runtime_info");})()');
 assert.ok(report.environment.python?.executable,'Native environment probe did not select Python');report.checks.push('Native environment probe selected installed Python');
 await evaluate(`(async()=>{const api=AgentCVDesktop,p=api.project;p.newProject();await api.addImages([${JSON.stringify(input.image)}],undefined,{autoAnalyze:false});p.data.purposeScheme=${JSON.stringify(input.scheme)};await api.inquiryView.open();return p.image.id;})()`);
 report.execution=await evaluate(`(async()=>{const api=AgentCVDesktop,p=api.project;const r=await api.agent.ui.runPurposeScheme({units:[{id:'native-desktop-'+crypto.randomUUID(),imageIds:[p.image.id]}],autoAdvance:false});return {status:r.execution.status,counts:r.execution.counts.execution,units:r.execution.units.map(u=>({unitId:u.unitId,execution:u.execution,recordRef:u.recordRef})),runs:r.runs.map(r=>({runId:r.runId,node:r.schemeNodeId,status:r.status,error:r.error,execution:r.execution.status,python:r.environment?.python,artifacts:r.artifacts.map(a=>({id:a.id,type:a.type,sha256:a.sha256,width:a.width,height:a.height}))}))};})()`);
 assert.equal(report.execution.counts.FAULT,0,JSON.stringify(report.execution));
 assert.equal(report.execution.runs.length,input.scheme.operatorGraph.nodes.length,'Some scheme nodes did not run');
 assert.ok(report.execution.runs.every(r=>r.status==='SUCCEEDED'&&r.execution==='COMPLETED'));
 report.checks.push('Every actual scheme node executed successfully through Tauri IPC and Rust');
 for(const node of input.scheme.operatorGraph.nodes){
  const frame=await evaluate(`(async()=>{const v=AgentCVDesktop.inquiryView;v.outputView.focus(${JSON.stringify(node.id)});v.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const s=v.outputView.surface;await s.image.decode();const rect=s.image.getBoundingClientRect();s.renderer.viewport.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.left+rect.width*.5,clientY:rect.top+rect.height*.5,bubbles:true}));return {node:${JSON.stringify(node.id)},status:s.section.dataset.status,hidden:s.image.hidden,width:s.image.naturalWidth,height:s.image.naturalHeight,empty:s.empty.hidden?null:s.empty.textContent,rgb:s.renderer.rgb.textContent,canReference:!s.ask.disabled,artifact:v.outputView.currentArtifact?.id};})()`);
  assert.ok(!frame.hidden&&frame.width>0&&frame.height>0&&frame.empty===null,JSON.stringify(frame));
  assert.ok(frame.canReference&&/^RGB \d+, \d+, \d+$/.test(frame.rgb),JSON.stringify(frame));report.runs.push(frame);
 }
 report.checks.push('Every node output decoded in native WebView with RGB and enabled image reference');
 const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(out,'native-output.png'),Buffer.from(screenshot.data,'base64'));
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'native-desktop-report.json'),JSON.stringify(report,null,2));socket.close();}
console.log(JSON.stringify({status:report.status,checks:report.checks,runs:report.runs,error:report.error},null,2));
