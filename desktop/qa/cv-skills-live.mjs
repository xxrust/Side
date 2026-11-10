// Actual Pi model -> actual browser tools -> actual local Python/OpenCV process.
// Host substitution only supplies the native Python process transport to Chromium.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {randomUUID} from 'node:crypto';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/liangshiben/13-cv/desktop',out=root+'/../reviews/2026-10-27-cv-skills';
fs.mkdirSync(out,{recursive:true});
const report={status:'NOT_RUN',scope:'Real Pi SDK/model, Chromium canvas, and local Python/OpenCV transport. This verifies executable trace and pixel publication, not industrial measurement accuracy.',tools:[],toolErrors:[],pythonRuns:[],events:[],promptCount:0,resourceReads:[]};
let browser,child,page,queue=Promise.resolve(),ready=false,done=false,failure=null;
async function python(args){
 const processChild=spawn(root+'/runtime/python/bin/python3',args,{cwd:root+'/runtime',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
 let stdout='',stderr='';processChild.stdout.on('data',b=>stdout+=b);processChild.stderr.on('data',b=>stderr+=b);
 const code=await new Promise((resolve,reject)=>{processChild.once('error',reject);processChild.once('close',resolve)});
 if(code!==0)throw Error('Python process failed: '+stderr.slice(-1500));return JSON.parse(stdout.trim());
}
async function wait(fn,label,ms){const at=Date.now();while(!fn()){if(Date.now()-at>ms)throw Error('Timeout: '+label);await new Promise(r=>setTimeout(r,100));}}
try{
 browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
 page=await browser.newPage({viewport:{width:1600,height:1000}});await page.routeWebSocket('**',socket=>socket.close());page.on('pageerror',e=>report.events.push({type:'pageerror',message:e.message}));
 await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>!!window.AgentCVDesktop);await page.evaluate(()=>AgentCVDesktop.startupReady);
 const dataUrl='data:image/jpeg;base64,'+fs.readFileSync(root+'/../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg').toString('base64');
 await page.evaluate(async dataUrl=>{await AgentCVDesktop.addImages([{name:'OpenCV stuff.jpg',dataUrl}]);await AgentCVDesktop.go(6)},dataUrl);
 await page.waitForFunction(()=>AgentCVDesktop.inquiryView.board()?.items.length===1);
 const environment=await python([root+'/scripts/cv-runtime.py','--probe']);
 await page.exposeFunction('executeActualPython',async request=>{
  const runId=randomUUID(),directory=fs.mkdtempSync(root+'/runtime/live-program-flow-'),requestPath=directory+'/request.json';
  fs.writeFileSync(requestPath,JSON.stringify({...request,runId}));
  const finished=await python([root+'/scripts/cv-runtime.py','--run',requestPath,directory]);
  const run=JSON.parse(fs.readFileSync(finished.resultFile,'utf8'));
  report.pythonRuns.push({runId,status:run.status,directory,nodes:run.procedureTrace?.nodes.map(n=>({id:n.id,instanceId:n.instanceId,status:n.status,artifactIds:n.artifactIds})),error:run.error});
  return run;
 });
 await page.evaluate(async environment=>{const {runAlgorithm}=await import('/src/algorithm-workspace.js');const a=AgentCVDesktop.agent;a.ui.algorithmEnvironment=async()=>environment;a.ui.runAlgorithm=async args=>{const run=await runAlgorithm(AgentCVDesktop.project,args,request=>window.executeActualPython(request));AgentCVDesktop.render();return run;};},environment);
 await page.exposeFunction('sendActualPi',command=>{if(command.type==='prompt'){report.promptCount++;if(report.promptCount>1)throw Error('Only one live prompt authorized by this verifier');report.imageCount=command.images?.length;}if(command.type==='tool_response'&&command.result?.error)report.toolErrors.push({error:command.result.error,code:command.result.code,errors:command.result.errors});if(!child?.stdin.writable)throw Error('Pi sidecar disconnected');child.stdin.write(JSON.stringify(command)+'\n');});
 await page.evaluate(()=>{AgentCVDesktop.agent.wire=c=>window.sendActualPi(c)});
 child=spawn(process.execPath,[root+'/scripts/pi-bridge.mjs'],{cwd:root+'/runtime',env:{...process.env,AGENTCV_AGENT_CONFIG:out+'/isolated-profile.json',PI_OFFLINE:'1',PI_TELEMETRY:'0'},stdio:['pipe','pipe','pipe']});
 child.on('error',e=>failure=e.message);child.stderr.on('data',()=>{});
 readline.createInterface({input:child.stdout}).on('line',line=>{let event;try{event=JSON.parse(line)}catch{return;}report.events.push({type:event.type,...event.category?{category:event.category}:{}});if(event.type==='tool_request')report.tools.push(event.name);if(event.type==='resource_read')report.resourceReads.push({path:event.path,sha256:event.sha256,packageId:event.packageId,name:event.name});if(event.type==='ready'){report.runtime=event.runtime;report.model=event.model;const model=event.models?.find(m=>m.id===event.model?.id&&m.provider===event.model?.provider);report.vision=model?.input?.includes('image');}if(['fatal','error','agent_error'].includes(event.type)){failure=event.error||event.message||event.category||event.type;report.errorCategory=event.category;}queue=queue.then(()=>page.evaluate(async event=>AgentCVDesktop.agent.event(event),event)).then(()=>{if(event.type==='ready')ready=true;if(event.type==='turn_end')done=true;}).catch(e=>failure=e.message);});
 await wait(()=>ready||failure,'Pi ready',30000);if(failure)throw Error(failure);if(!report.vision)throw Error('Configured real Pi model lacks vision input');
 await page.locator('[data-intent-action="ask"]').click();
 await page.getByLabel('畫板問題',{exact:true}).fill("請幫我找出原圖中下方紅色細長物件的位置，將實測結果放在目前畫板並連回原圖。我想看清楚為什麼選這種方法、為什麼用這組參數，以及光照或顏色改變時哪些情況會失效。這是圖片分析探索，我還沒有提供公差或獨立驗收樣本。");
 await page.locator('[data-intent-action="send"]').click();
 await wait(()=>done||failure,'actual Pi algorithm and canvas response',240000);await queue;if(failure)throw Error(failure);
 const state=await page.evaluate(()=>{const {project:p,inquiryView:v}=AgentCVDesktop;v.syncLocalReply();return {page:AgentCVDesktop.page,embedded:v.embedded,boardId:v.boardId,items:v.board().items.length,relations:p.data.canvasRelations?.length||0,answer:p.data.chat.filter(m=>m.role==='assistant').map(m=>m.text).join('\n'),runs:p.data.algorithmRuns.map(r=>({runId:r.runId,status:r.status,trace:r.procedureTrace,artifactCount:r.artifacts.length,evidenceAudit:r.evidenceAudit})),workspace:p.serialize()};});
 fs.writeFileSync(out+'/actual-pi-workspace.agentcv.json',state.workspace);delete state.workspace;report.actual=state;
 const actual=state.runs.findLast(r=>r.status==='SUCCEEDED'&&r.trace?.nodes?.length>=2);
 if(!actual)throw Error('Real Pi did not produce a successful explicitly decomposed procedure');
 if(!actual.trace.nodes.some(n=>n.kind==='procedure')||!actual.trace.nodes.some(n=>n.kind==='step')||!actual.trace.nodes.some(n=>n.dependencyInstances?.length))throw Error('Actual trace lacks hierarchy/dependencies');
 if(state.page!==6||!state.embedded||state.items<3)throw Error('True generated images were not published to original canvas');
 if(!state.answer.trim())throw Error('Actual Pi answer missing');
 if(!report.resourceReads.some(r=>r.name==='cv'))throw Error('Pi did not actually read the CV skill');if(!report.resourceReads.some(r=>/references[/\\]evidence\.md$/.test(r.path)))throw Error('Pi did not actually read the evidence reference');if(report.runtime.systemPromptChars>=500)throw Error('Base role prompt is not short');report.status='PASS';await page.screenshot({path:out+'/real-pi-program-flow.png'});
}catch(error){report.status='FAILED';report.error=String(error.message).replace(/Bearer\s+\S+/g,'Bearer [REDACTED]').replace(/\bsk-[\w-]+/g,'[REDACTED]');if(page){try{fs.writeFileSync(out+'/actual-pi-workspace.agentcv.json',await page.evaluate(()=>AgentCVDesktop.project.serialize()));await page.screenshot({path:out+'/real-pi-program-flow-failure.png'});}catch{}}}
finally{if(child){try{child.stdin.write(JSON.stringify({type:'abort'})+'\n');child.stdin.end()}catch{}child.kill();}await browser?.close();fs.writeFileSync(out+'/real-pi-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,model:report.model,promptCount:report.promptCount,pythonRuns:report.pythonRuns.length,error:report.error}));if(report.status!=='PASS')process.exitCode=1;}
