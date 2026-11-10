// node qa/native-main-agent-inquiry.mjs <CDP port> <input.json> <evidence directory>
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {checkMainAgentInquiries} from './main-agent-inquiry-checks.mjs';
const [port,inputFile,out]=process.argv.slice(2);
if(!port||!inputFile||!out)throw Error('Provide CDP port, input and evidence directory');
await fs.mkdir(out,{recursive:true});
const pages=await(await fetch(`http://127.0.0.1:${Number(port)}/json/list`)).json(),page=pages.find(p=>p.type==='page'&&/tauri\.localhost|tauri:\/\//.test(p.url));
assert.ok(page,'Real native Tauri WebView required');
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let sequence=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
socket.onmessage=event=>{const message=JSON.parse(event.data),call=pending.get(message.id);if(!call)return;pending.delete(message.id);message.error?call.reject(Error(JSON.stringify(message.error))):call.resolve(message.result);};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||JSON.stringify(result.exceptionDetails));return result.result.value;}
const report={url:page.url};
try{
 report.identifier=await evaluate('window.__TAURI_INTERNALS__.invoke("plugin:app|identifier")');
 assert.equal(report.identifier,'studio.agentcv.desktop.inquiry.qa','Refusing to modify any other application profile');
 const initial=await evaluate('(async()=>{await AgentCVDesktop.startupReady;return {images:AgentCVDesktop.project.data.images.length,path:AgentCVDesktop.sessionRecovery.projectPath};})()');
 assert.equal(initial.images,0,'Disposable profile is not empty');assert.equal(initial.path,null,'Disposable profile references an existing project');
 const input=JSON.parse(await fs.readFile(inputFile,'utf8'));
 await evaluate(`(async()=>{const a=AgentCVDesktop;await a.addImages([${JSON.stringify(input.image)}],undefined,{autoAnalyze:false});a.project.data.purposeScheme=${JSON.stringify(input.scheme)};})()`);
 report.result=await evaluate(`(${checkMainAgentInquiries.toString()})(AgentCVDesktop)`);
 report.reference=await evaluate(`(()=>{const a=AgentCVDesktop,v=a.inquiryView;v.programFlow.refreshFlow();const node=v.programFlow.flow.nodes.find(n=>n.schemeNodeId);v.programFlow.contextMenu(node.id,new MouseEvent('contextmenu',{clientX:100,clientY:100,cancelable:true}));[...v.menu.querySelectorAll('button')].find(b=>b.textContent==='詢問此節點').click();return {scope:a.agent.ui.reference().scope,selectedNodeId:a.agent.ui.reference().graph.selectedNodeId,label:document.getElementById('quotedContextLabel').textContent};})()`);
 report.composer=await evaluate(`(()=>{const i=document.getElementById('chatInput'),r=i.getBoundingClientRect();return {visible:r.width>0&&r.height>0&&r.right<=innerWidth&&r.bottom<=innerHeight,hasLocalQuestion:!!document.querySelector('[data-canvas-question-input]'),threads:(AgentCVDesktop.project.data.canvasThreads||[]).length};})()`);
 assert.ok(report.composer.visible,'Main composer is outside the native window');assert.equal(report.composer.hasLocalQuestion,false);assert.equal(report.result.prompts.length,4);
 const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(out,'main-agent-inquiry.png'),Buffer.from(screenshot.data,'base64'));
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'main-agent-inquiry.json'),JSON.stringify(report,null,2));socket.close();}
console.log(JSON.stringify(report,null,2));
