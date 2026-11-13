// Real desktop A/B check: same originals, same thresholds, full successful results.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const [port,originalFile,optimizedFile,successFile,out]=process.argv.slice(2);
await fs.mkdir(out,{recursive:true});
let page;for(let i=0;i<100&&!page;i++){try{const p=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();page=p.find(p=>p.type==='page'&&/tauri.localhost/.test(p.url))}catch{}if(!page)await new Promise(r=>setTimeout(r,200))}
assert.ok(page);const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
let id=0;const pending=new Map();
socket.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),30000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value};
const wait=async s=>{for(let i=0;i<1200;i++){if(await evaluate(s))return;await new Promise(r=>setTimeout(r,50))}throw Error('Timed out '+s)};
const report={};
function equalNumbers(a,b,location='result'){
 if(typeof a==='number'&&typeof b==='number'){assert.ok(Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a)),`${location}: ${a} != ${b}`);return}
 if(a&&b&&typeof a==='object'&&typeof b==='object'){assert.deepEqual(Object.keys(a),Object.keys(b),location);for(const k of Object.keys(a))equalNumbers(a[k],b[k],location+'.'+k);return}
 assert.deepEqual(a,b,location);
}
try{
 await wait('!!window.__TAURI_INTERNALS__&&!!globalThis.AgentCVDesktop');
 assert.equal(await evaluate('window.__TAURI_INTERNALS__.invoke("plugin:app|identifier")'),'studio.agentcv.desktop.runtime.qa');
 await wait('!!globalThis.AgentCVDesktop');await evaluate('AgentCVDesktop.startupReady');
 assert.equal(await evaluate('AgentCVDesktop.project.data.images.length'),0);
 const original=JSON.parse(await fs.readFile(originalFile,'utf8')),optimized=JSON.parse(await fs.readFile(optimizedFile,'utf8')),success=JSON.parse(await fs.readFile(successFile,'utf8'));
 await evaluate(`(async()=>{const a=AgentCVDesktop;await a.addImages(${JSON.stringify([original.images[0],success.image])},undefined,{autoAnalyze:false});await a.inquiryView.open()})()`);
 const run=async(scheme,index)=>{
  await evaluate(`(async()=>{const a=AgentCVDesktop,p=a.project;p.data.purposeScheme=${JSON.stringify(scheme)};await p.selectImage(p.data.images[${index}].id);a.render();document.querySelector('[data-action=run-once]').click()})()`);
  await wait('AgentCVDesktop.project.data.datasetExecutions.at(-1)?.status!=="RUNNING"&&!document.querySelector("[data-action=run-once]").disabled');
  return evaluate(`(()=>{const p=AgentCVDesktop.project,e=p.data.datasetExecutions.at(-1);return {status:e.status,units:e.units,runs:p.data.algorithmRuns.filter(r=>e.units[0].runIds.includes(r.runId)).map(r=>({id:r.schemeNodeId,status:r.status,ms:r.durationMs,timing:r.timing,result:r.result,error:r.error,artifacts:r.artifacts.filter(a=>a.type==='image').map(a=>({id:a.id,sha256:a.sha256}))}))}})()`)
 };
 report.originalFault=await run(original.scheme,0);report.originalSuccess=await run(original.scheme,1);
 report.optimizedFault=await run(optimized.scheme,0);report.optimizedSuccess=await run(optimized.scheme,1);
 for(const result of [report.originalSuccess,report.optimizedSuccess]){
  assert.equal(result.status,'COMPLETED');assert.equal(result.runs.length,3);assert.ok(result.runs.every(r=>r.status==='SUCCEEDED'));
 }
 assert.equal(report.originalFault.status,report.optimizedFault.status);
 assert.match(report.optimizedFault.runs.find(r=>r.id==='objects').error.message,/INSUFFICIENT_MEASURED_EDGES/);
 for(let i=0;i<3;i++){
  equalNumbers(report.originalSuccess.runs[i].result,report.optimizedSuccess.runs[i].result);
  assert.deepEqual(report.originalSuccess.runs[i].artifacts,report.optimizedSuccess.runs[i].artifacts,'Image pixels changed');
 }
 // Observe decoded outputs and RGB on the fully successful optimized scheme.
 report.outputs=[];
 for(const node of optimized.scheme.operatorGraph.nodes){
  const frame=await evaluate(`(async()=>{const v=AgentCVDesktop.inquiryView;v.outputView.focus(${JSON.stringify(node.id)});v.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const s=v.outputView.surface;await s.image.decode();const r=s.image.getBoundingClientRect();s.renderer.viewport.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true}));return {node:${JSON.stringify(node.id)},hidden:s.image.hidden,width:s.image.naturalWidth,height:s.image.naturalHeight,rgb:s.renderer.rgb.textContent};})()`);
  assert.ok(!frame.hidden&&frame.width&&frame.height);assert.match(frame.rgb,/^RGB \d+, \d+, \d+$/);report.outputs.push(frame);
 }
 report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1}
finally{await fs.writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2));socket.close()}
console.log(JSON.stringify({status:report.status,cases:Object.fromEntries(Object.entries(report).filter(([k,v])=>v?.runs).map(([k,v])=>[k,v.runs.map(r=>({id:r.id,status:r.status,ms:r.ms,error:r.error}))])),outputs:report.outputs,error:report.error},null,2));
