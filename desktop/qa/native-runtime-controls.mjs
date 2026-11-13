// Real Tauri performance, cancellation and inquiry checks in an isolated profile.
// node qa/native-runtime-controls.mjs <port> <input.json> <out> [baseline]
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {checkMainAgentInquiries} from './main-agent-inquiry-checks.mjs';
const [port,inputFile,out,mode]=process.argv.slice(2),baseline=mode==='baseline';
await fs.mkdir(out,{recursive:true});
let pages=[];
for(let i=0;i<100;i++){
 try{pages=await(await fetch(`http://127.0.0.1:${+port}/json/list`,{signal:AbortSignal.timeout(1000)})).json();if(pages.some(p=>p.type==='page'&&/tauri\.localhost/.test(p.url)))break;}catch{}
 await new Promise(r=>setTimeout(r,200));
}
const page=pages.find(p=>p.type==='page'&&/tauri\.localhost/.test(p.url));
assert.ok(page,'Native Tauri WebView required');
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let sequence=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
socket.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},30000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value;};
const waitFor=async expression=>{for(let i=0;i<1200;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Native state timed out: '+expression);};
const report={baseline,url:page.url};
try{
 await waitFor('!!window.__TAURI_INTERNALS__&&!!globalThis.AgentCVDesktop');
 report.identifier=await evaluate('window.__TAURI_INTERNALS__.invoke("plugin:app|identifier")');assert.equal(report.identifier,'studio.agentcv.desktop.runtime.qa');
 await waitFor('!!globalThis.AgentCVDesktop');
 const initial=await evaluate('(async()=>{await AgentCVDesktop.startupReady;return {images:AgentCVDesktop.project.data.images.length,path:AgentCVDesktop.sessionRecovery.projectPath};})()');assert.equal(initial.images,0);assert.equal(initial.path,null);
 const input=JSON.parse(await fs.readFile(inputFile,'utf8'));
 await evaluate(`(async()=>{const a=AgentCVDesktop;await a.addImages(${JSON.stringify(input.images)},undefined,{autoAnalyze:false});a.project.data.purposeScheme=${JSON.stringify(input.scheme)};await a.inquiryView.open();a.render();return a.project.compilePurposeScheme('scheme');})()`);
 const summary=`(()=>{const p=AgentCVDesktop.project,e=p.data.datasetExecutions.at(-1);return {status:e.status,processed:e.processed,total:e.total,timing:e.timing,units:e.units,runs:p.data.algorithmRuns.filter(r=>e.units.some(u=>u.runIds.includes(r.runId))).map(r=>({id:r.schemeNodeId,status:r.status,durationMs:r.durationMs,timing:r.timing,result:r.result,error:r.error,artifacts:r.artifacts?.map(a=>({id:a.id,sha256:a.sha256})),trace:r.procedureTrace?.nodes.map(n=>({id:n.id,ms:n.durationMs,status:n.status}))}))};})()`;
 report.runs=[];
 for(let i=0;i<2;i++){
  await evaluate('document.querySelector("[data-action=run-once]").click()');
  await waitFor('AgentCVDesktop.project.data.datasetExecutions.at(-1)?.status!=="RUNNING"&&!document.querySelector("[data-action=run-once]").disabled');
  report.runs.push(await evaluate(summary));
 }
 for(const action of baseline?['button','escape']:['button','escape','modal-button','modal-escape','source-button','source-escape']){
  const inPanel=action.startsWith('modal')||action.startsWith('source');
  const before=await evaluate('AgentCVDesktop.project.data.datasetExecutions.length');
  if(action.startsWith('source')){
   await evaluate(`(()=>{const v=AgentCVDesktop.inquiryView.programFlow;v.refreshFlow();v.openBoundary(v.flow.nodes.find(n=>n.kind==='source'));})()`);
   await waitFor('!!document.querySelector(".flow-source-gallery button")');
   await evaluate('document.querySelector(".flow-source-gallery button").click()');
  }else await evaluate('document.querySelector("[data-action=run-continuous]").click()');
  await waitFor(`AgentCVDesktop.project.data.datasetExecutions.length>${before}&&AgentCVDesktop.project.data.datasetExecutions.at(-1)?.activeUnit?.currentNodeId==="objects"`);
  if(action.startsWith('modal')){
   await evaluate(`(()=>{const v=AgentCVDesktop.inquiryView.programFlow;v.refreshFlow();v.openBoundary(v.flow.nodes.find(n=>n.kind==='source'));})()`);
   await waitFor('!!document.querySelector("[data-action=stop-source]")');
  }
  report[action]=await evaluate(`(()=>{const e=AgentCVDesktop.project.data.datasetExecutions.at(-1);return {processed:e.processed,active:e.activeUnit,startedAt:performance.now()};})()`);
  if(action.endsWith('button'))await evaluate(`document.querySelector("[data-action=${inPanel?'stop-source':'stop'}]").click()`);
  else{
   // Deliver an actual WebView key event. Text entry and open modal must not
   // swallow the cancellation key before it reaches the capture handler.
   await evaluate(inPanel?'document.querySelector("[data-action=stop-source]").focus()':'document.getElementById("chatInput").focus()');
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
   await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  }
  await waitFor('AgentCVDesktop.project.data.datasetExecutions.at(-1)?.status!=="RUNNING"&&!document.querySelector("[data-action=run-once]").disabled');
  report[action].after=await evaluate(summary);
  report[action].waitMs=await evaluate('performance.now()')-report[action].startedAt;
  if(!baseline){
   assert.equal(report[action].after.status,'CANCELLED',action+' did not cancel the native batch');
   assert.equal(report[action].after.processed,report[action].processed+1,'Another workpiece was dispatched after stop');
   const earlier=report[action].active.runIds.length,after=report[action].after.units.at(-1).runIds.length;
   assert.equal(after,earlier+1,'Another node was dispatched after the in-flight node');
   if(inPanel)assert.ok(await evaluate('!!document.querySelector(".flow-source-panel[open]")'),'Escape closed the modal instead of stopping');
  }
  if(inPanel)await evaluate('document.querySelector(".flow-source-panel[open]").close()');
 }
 report.inquiry=await evaluate(`(${checkMainAgentInquiries.toString()})(AgentCVDesktop)`);
 await fs.writeFile(path.join(out,'native-runtime-checks.json'),JSON.stringify(report,null,2));
 try{const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(out,'native-runtime.png'),Buffer.from(screenshot.data,'base64'));}catch(error){report.screenshotError=error.message;}
 report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'native-runtime.json'),JSON.stringify(report,null,2));socket.close();}
console.log(JSON.stringify({status:report.status,runs:report.runs?.map(e=>({status:e.status,runs:e.runs.map(r=>({id:r.id,status:r.status,ms:r.durationMs,resident:r.timing?.resident,phases:r.timing?.phases}))})),button:report.button?.after?.status,escape:report.escape?.after?.status,inquiry:report.inquiry?.checks,error:report.error},null,2));
