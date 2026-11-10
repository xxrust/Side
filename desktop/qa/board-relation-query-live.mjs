// Real browser + actual Pi SDK/model. No generated model responses or algorithm fixtures.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/liangshiben/13-cv/desktop',out=root+'/../reviews/2026-10-27-board-collaboration';
const report={scope:'Actual browser canvas -> real Pi sidecar/model -> same bubble; not native GUI or CV accuracy acceptance',status:'NOT_RUN',promptCount:0,events:[],tools:[]};
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
let child,page,queue=Promise.resolve(),ready=false,done=false,failure=null;
const wait=async(fn,label,ms)=>{const start=Date.now();while(!fn()){if(Date.now()-start>ms)throw Error('Timeout: '+label);await new Promise(r=>setTimeout(r,100));}};
try{
 page=await browser.newPage({viewport:{width:1440,height:920}});page.on('pageerror',e=>report.events.push({type:'pageerror',error:e.message}));await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>!!window.AgentCVDesktop);
 await page.evaluate(async serialized=>{await AgentCVDesktop.loadProject(serialized);await AgentCVDesktop.go(6)},fs.readFileSync(out+'/live-workspace.agentcv.json','utf8'));await page.waitForFunction(()=>AgentCVDesktop.inquiryView.board()?.items.length===2);
 await page.exposeFunction('sendActualPi',command=>{if(command.type==='prompt'){report.promptCount++;if(report.promptCount>2)throw Error('Only two live questions allowed');report.imageCount=command.images?.length;report.selectionInPrompt=command.message.includes('annotationKeys');}if(!child?.stdin.writable)throw Error('Pi process disconnected');child.stdin.write(JSON.stringify(command)+'\n');});
 await page.evaluate(()=>{const a=AgentCVDesktop.agent;a.wire=c=>window.sendActualPi(c);});
 child=spawn(process.execPath,[root+'/scripts/pi-bridge.mjs'],{cwd:root+'/runtime',env:{...process.env,PI_OFFLINE:'1',PI_TELEMETRY:'0'},stdio:['pipe','pipe','pipe']});
 child.on('error',e=>{failure=e.message;});child.stderr.on('data',()=>{});
 readline.createInterface({input:child.stdout}).on('line',line=>{let e;try{e=JSON.parse(line)}catch{return;}
  report.events.push({type:e.type,...(e.category?{category:e.category}:{})});if(e.type==='tool_request')report.tools.push(e.name);
  if(e.type==='ready'){report.model=e.model;const actual=e.models?.find(m=>m.id===e.model?.id&&m.provider===e.model?.provider);report.vision=actual?.input?.includes('image');}
  if(['fatal','error','agent_error'].includes(e.type)){failure=e.error||e.message||e.category||e.type;report.errorCategory=e.category;}
  queue=queue.then(()=>page.evaluate(async e=>{await AgentCVDesktop.agent.event(e)},e)).then(()=>{if(e.type==='ready')ready=true;if(e.type==='turn_end')done=true;}).catch(e=>{failure=e.message;});
 });
 await wait(()=>ready||failure,'Pi ready',30000);if(failure)throw Error(failure);if(!report.vision)throw Error('Configured Pi model does not declare vision input');
 await page.evaluate(()=>{const v=AgentCVDesktop.inquiryView,r=AgentCVDesktop.project.data.canvasRelations[0];v.relationSelection=r.id;v.selected=new Set([r.fromItemId,r.toItemId]);v.openLocalQuestion();});
 await page.getByLabel('畫板問題',{exact:true}).fill('這條連線是什麼意思？能用它直接比較兩張圖的實際尺寸嗎？');await page.locator('[data-intent-action="send"]').click();
 await wait(()=>done||failure,'real model response',180000);await queue;if(failure)throw Error(failure);
 const actual=await page.evaluate(()=>{const v=AgentCVDesktop.inquiryView;v.syncLocalReply();return {bubble:v.localReply?.innerText||'',messages:AgentCVDesktop.project.data.chat.filter(m=>m.role==='assistant').map(m=>m.text),status:v.currentLocalThread()?.status,annotations:v.currentLocalThread()?.snapshot?.selection?.annotations};});
 report.board=await page.evaluate(()=>({page:AgentCVDesktop.page,id:AgentCVDesktop.inquiryView.boardId,items:AgentCVDesktop.inquiryView.board().items.map(i=>({id:i.id,assetId:i.assetId})),relations:AgentCVDesktop.project.data.canvasRelations||[],embedded:AgentCVDesktop.inquiryView.embedded}));if(report.board.page!==6||!report.board.embedded||report.board.items.length<2||!report.board.relations.length)throw Error('Real Pi did not add image and relation to source canvas');report.answer=actual.messages.join('\n');report.bubble=actual.bubble;report.threadStatus=actual.status;report.selectedAnnotationCount=actual.annotations?.length;
 if(!actual.bubble.trim()||!report.answer.trim())throw Error('Real assistant output missing in canvas bubble');if(report.promptCount!==1)throw Error('Expected one actual prompt');
 report.status='PASS';await page.evaluate(()=>{const v=AgentCVDesktop.inquiryView,t=v.currentLocalThread();t.collapsed=true;v.render();v.fit();});await page.waitForTimeout(300);await page.screenshot({path:out+'/real-pi-relation-query.png'});
}catch(e){report.status='FAILED';report.error=String(e.message).replace(/Bearer\s+\S+/g,'Bearer [REDACTED]').replace(/\bsk-[\w-]+/g,'[REDACTED]');}
finally{if(child){try{child.stdin.write(JSON.stringify({type:'abort'})+'\n');child.stdin.end()}catch{}child.kill();}await browser.close();fs.writeFileSync(out+'/real-pi-relation-query.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,model:report.model,promptCount:report.promptCount,error:report.error}));if(report.status!=='PASS')process.exitCode=1;}
