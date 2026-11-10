import fs from 'node:fs';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/liangshiben/13-cv/desktop',out=root+'/../reviews/2026-10-28-readable-evidence/final-review';
const log=(type,data={})=>{fs.appendFileSync(out+'/live.jsonl',JSON.stringify({at:new Date().toISOString(),type,...data})+'\n');console.log(type,JSON.stringify(data).slice(0,300));};
let browser,page,child,queue=Promise.resolve(),ready=false,turns=0,failure;
const report={status:'RUNNING',tools:[],resourceReads:[],errors:[]};
const wait=async(fn,ms)=>{const start=Date.now();while(!fn()){if(Date.now()-start>ms)throw Error('Timeout');await new Promise(r=>setTimeout(r,250));}};
try{
 browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});page=await browser.newPage({viewport:{width:1600,height:1000}});
 await page.routeWebSocket('**',socket=>socket.close());await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>!!globalThis.AgentCVDesktop);await page.evaluate(()=>AgentCVDesktop.startupReady);
 await page.evaluate(async raw=>{await AgentCVDesktop.loadProject(raw,{resume:true});},fs.readFileSync(out+'/before.agentcv.json','utf8'));
 await page.exposeFunction('sendRealPi',c=>{if(!child?.stdin.writable)throw Error('Sidecar disconnected');if(c.type==='tool_response')log('tool_response',{id:c.id,result:c.result});child.stdin.write(JSON.stringify(c)+'\n');});await page.evaluate(()=>{AgentCVDesktop.agent.wire=c=>window.sendRealPi(c);});
 child=spawn(process.execPath,[root+'/scripts/pi-bridge.mjs'],{cwd:root+'/runtime',env:{...process.env,AGENTCV_AGENT_CONFIG:out+'/profile.json',PI_OFFLINE:'1',PI_TELEMETRY:'0'},stdio:['pipe','pipe','pipe']});child.stderr.on('data',b=>fs.appendFileSync(out+'/stderr.log',b));
 readline.createInterface({input:child.stdout}).on('line',line=>{let e;try{e=JSON.parse(line)}catch{return;}if(e.type==='tool_request'){report.tools.push(e.name);log('tool_request',{name:e.name,args:e.args});}if(e.type==='resource_read'){report.resourceReads.push(e);log('resource_read',{path:e.path});}if(e.type==='text_delta')fs.appendFileSync(out+'/answer.md',e.delta||'');if(['fatal','error','agent_error'].includes(e.type)){report.errors.push(e);failure=e.error||e.type;log('error',{error:failure});}
 queue=queue.then(()=>page.evaluate(async e=>AgentCVDesktop.agent.event(e),e)).then(()=>{if(e.type==='ready'){ready=true;report.model=e.model;report.runtime=e.runtime;log('ready',{model:e.model});}if(e.type==='turn_end'){turns++;log('turn_end',{turns});}}).catch(err=>{failure=err.message;log('transport_error',{message:failure});});});
 await wait(()=>ready||failure,45000);if(failure)throw Error(failure);
 const runs=[{id:'all',runs:await page.evaluate(()=>AgentCVDesktop.project.data.algorithmRuns.map(r=>({id:r.runId,title:r.title,nodes:r.procedureTrace?.nodes.map(n=>({instanceId:n.instanceId,name:n.name,parameters:n.parameters}))})))}];
 for(const [index,run]of runs.entries()){
  const prior=turns;const prompt=`請完成一個具體事實修正和小量用詞整理，使用 revise_algorithm_evidence 真正保存。先 read 最新 cv skill 與 evidence.md。獨立審查指出最新運算900cab6a-ba20-4e4a-a43c-45dd0bcc534e中 sensitivity#1 的工具依據 corner_zoom 圖說，把角4青點與全局最大0.537px連在一起；審查說原始數據最大為ratio0.65角2的0.537100px，角4為0.520818px。請自行get_algorithm_run查保存的原始數據／程式索引確認，核對對象與數字後才修圖說，不能只相信我給的數字。保留圖本身、原始程式／數值與未知狀態，只修解說。另請把四個歷史空參數步驟的 parameterNotes 中 parameters={}、H/q/y/keep/spread 等程式符號改成初學者看得懂的名稱：前次已求得的位置變換、投影角點、支持點、角點變動等；保留實際設定、來源、未比較與未記錄限制，不把參數改寫為歷史登錄。需要整理的節點是ac690677-c3b3-4e90-b800-25eba2c4efdd的features#1、geometry#1，以及900cab6a-ba20-4e4a-a43c-45dd0bcc534e的features#1、render#1。讀最新explanationRevision，完成後讀回確認；本次不用重寫其他已合格內容。`;
  await page.evaluate(async text=>AgentCVDesktop.agent.send(text),prompt);log('prompt',{runId:run.id});await wait(()=>turns>prior||failure,720000);await queue;
  fs.writeFileSync(out+'/revised.agentcv.json',await page.evaluate(()=>AgentCVDesktop.project.serialize()));if(failure)throw Error(failure);
 }
 report.coverage=await page.evaluate(()=>AgentCVDesktop.project.data.algorithmRuns.map(r=>({runId:r.runId,revisions:r.evidenceRevisions?.length||0,rootRevised:(r.evidenceRevisions||[]).some(v=>v.justification),nodes:r.procedureTrace?.nodes.map(n=>({id:n.instanceId,revised:(r.evidenceRevisions||[]).some(v=>v.nodes?.some(u=>u.instanceId===n.instanceId))}))})));
 report.status=report.coverage.every(r=>r.rootRevised&&r.nodes.every(n=>n.revised))?'PASS':'INCOMPLETE';await page.screenshot({path:out+'/browser.png'});
}catch(err){report.status='FAILED';report.error=err.message;log('failure',{error:err.message});if(page)try{fs.writeFileSync(out+'/revised.agentcv.json',await page.evaluate(()=>AgentCVDesktop.project.serialize()));}catch{}}
finally{if(child){child.stdin.end();child.kill();}await browser?.close();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error,coverage:report.coverage}));}
