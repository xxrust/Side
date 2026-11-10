import fs from 'node:fs';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/liangshiben/13-cv/desktop',out=root+'/../reviews/2026-10-28-readable-evidence';
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
 const runs=await page.evaluate(()=>AgentCVDesktop.project.data.algorithmRuns.map(r=>({id:r.runId,title:r.title,nodes:r.procedureTrace?.nodes.map(n=>({instanceId:n.instanceId,name:n.name}))})));
 for(const [index,run]of runs.entries()){
  const prior=turns;const prompt=`請依目前已啟用的 cv skill，實際改寫這個既有運算的全部三要素（運算整體及每一個 procedure/step），並用 revise_algorithm_evidence 保存，不是只在對話提供建議。先 read 完整 SKILL.md 與 references/evidence.md，再讀本運算的真實數據及原圖／證據圖。讀者是沒有算法基礎的大學生：讓他清楚看懂要看圖上哪裡、數字的含義、為何選方法、每個參數從哪裡來及比較代價、哪裡已測／未測／不可信。每個專用圖說必須說明該圖如何支持該項主張。缺少的比較、獨立真值或失效試驗必須明說，保留當時未知，不能偽造實驗。這次只重寫解說，不重跑算法、不新增假圖、不變更畫板或刪歷史。可分多次修訂直到此運算所有步驟均完成。運算清單中的目標：${JSON.stringify(run)}。完成後讀回確認並簡短說明剩餘不足。這是第 ${index+1}/${runs.length} 筆，其他筆後續處理。`;
  await page.evaluate(async text=>AgentCVDesktop.agent.send(text),prompt);log('prompt',{runId:run.id});await wait(()=>turns>prior||failure,720000);await queue;
  fs.writeFileSync(out+'/revised.agentcv.json',await page.evaluate(()=>AgentCVDesktop.project.serialize()));if(failure)throw Error(failure);
 }
 report.coverage=await page.evaluate(()=>AgentCVDesktop.project.data.algorithmRuns.map(r=>({runId:r.runId,revisions:r.evidenceRevisions?.length||0,rootRevised:(r.evidenceRevisions||[]).some(v=>v.justification),nodes:r.procedureTrace?.nodes.map(n=>({id:n.instanceId,revised:(r.evidenceRevisions||[]).some(v=>v.nodes?.some(u=>u.instanceId===n.instanceId))}))})));
 report.status=report.coverage.every(r=>r.rootRevised&&r.nodes.every(n=>n.revised))?'PASS':'INCOMPLETE';await page.screenshot({path:out+'/browser.png'});
}catch(err){report.status='FAILED';report.error=err.message;log('failure',{error:err.message});if(page)try{fs.writeFileSync(out+'/revised.agentcv.json',await page.evaluate(()=>AgentCVDesktop.project.serialize()));}catch{}}
finally{if(child){child.stdin.end();child.kill();}await browser?.close();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error,coverage:report.coverage}));}
