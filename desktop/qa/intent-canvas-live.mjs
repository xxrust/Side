// Real browser + actual Pi SDK/model. No generated model responses or algorithm fixtures.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/liangshiben/13-cv/desktop',out=root+'/../reviews/2026-10-27-canvas-entry';
const report={scope:'Actual browser canvas -> real Pi sidecar/model -> same bubble; not native GUI or CV accuracy acceptance',status:'NOT_RUN',promptCount:0,events:[],tools:[]};
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
let child,page,queue=Promise.resolve(),ready=false,done=false,failure=null;
const wait=async(fn,label,ms)=>{const start=Date.now();while(!fn()){if(Date.now()-start>ms)throw Error('Timeout: '+label);await new Promise(r=>setTimeout(r,100));}};
try{
 page=await browser.newPage({viewport:{width:1440,height:920}});page.on('pageerror',e=>report.events.push({type:'pageerror',error:e.message}));await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>!!window.AgentCVDesktop);
 const dataURL='data:image/png;base64,'+fs.readFileSync(root+'/../prd/2026-10-26-concept-agreement/assets/crystal-camera.png').toString('base64');
 await page.evaluate(async dataURL=>{await AgentCVDesktop.addImages([{name:'晶振真實原圖.png',dataUrl:dataURL}]);await AgentCVDesktop.go(6)},dataURL);await page.waitForFunction(()=>AgentCVDesktop.inquiryView.board()?.items.length===1);
 await page.exposeFunction('sendActualPi',command=>{if(command.type==='prompt'){report.promptCount++;if(report.promptCount>1)throw Error('Only one live question allowed');report.imageCount=command.images?.length;report.selectionInPrompt=command.message.includes('annotationKeys');}if(!child?.stdin.writable)throw Error('Pi process disconnected');child.stdin.write(JSON.stringify(command)+'\n');});
 await page.evaluate(()=>{const a=AgentCVDesktop.agent;a.wire=c=>window.sendActualPi(c);const execute=a.execute.bind(a);a.execute=async(name,args)=>{if(!['get_context','get_visual_context','get_visual_image','show_visual_image'].includes(name))throw Error('這輪只核對原位問答，請勿修改方案或執行算法。');return execute(name,args);};});
 child=spawn(process.execPath,[root+'/scripts/pi-bridge.mjs'],{cwd:root+'/runtime',env:{...process.env,PI_OFFLINE:'1',PI_TELEMETRY:'0'},stdio:['pipe','pipe','pipe']});
 child.on('error',e=>{failure=e.message;});child.stderr.on('data',()=>{});
 readline.createInterface({input:child.stdout}).on('line',line=>{let e;try{e=JSON.parse(line)}catch{return;}
  report.events.push({type:e.type,...(e.category?{category:e.category}:{})});if(e.type==='tool_request')report.tools.push(e.name);
  if(e.type==='ready'){report.model=e.model;const actual=e.models?.find(m=>m.id===e.model?.id&&m.provider===e.model?.provider);report.vision=actual?.input?.includes('image');}
  if(['fatal','error','agent_error'].includes(e.type)){failure=e.error||e.message||e.category||e.type;report.errorCategory=e.category;}
  queue=queue.then(()=>page.evaluate(async e=>{await AgentCVDesktop.agent.event(e)},e)).then(()=>{if(e.type==='ready')ready=true;if(e.type==='turn_end')done=true;}).catch(e=>{failure=e.message;});
 });
 await wait(()=>ready||failure,'Pi ready',30000);if(failure)throw Error(failure);if(!report.vision)throw Error('Configured Pi model does not declare vision input');
 await page.evaluate(()=>{const v=AgentCVDesktop.inquiryView,p=AgentCVDesktop.project,item=v.board().items[0];const a=p.addInquiryAnnotation(v.boardId,item.id,{type:'rect',points:[{x:190,y:160},{x:1090,y:810}],text:'想討論的表面範圍',color:'#ffd88d',strokeWidth:3});v.annotationSelections=new Set([JSON.stringify([item.id,a.id])]);v.selected=new Set([item.id]);v.render();});
 await page.locator('[data-intent-action="ask"]').click();await page.getByLabel('畫板問題',{exact:true}).fill('這輪只驗證畫板原位問答。請根據實際收到的圖片，簡短描述圖中物體與選中標記所指的範圍，並說明要確認這個表面有無凹坑，還缺哪一項關鍵證據。不要修改專案，不要重算，不要假裝量測過。請用繁體中文，最多三句。');await page.locator('[data-intent-action="send"]').click();
 await wait(()=>done||failure,'real model response',180000);await queue;if(failure)throw Error(failure);
 const actual=await page.evaluate(()=>{const v=AgentCVDesktop.inquiryView;v.syncLocalReply();return {bubble:v.localReply?.innerText||'',messages:AgentCVDesktop.project.data.chat.filter(m=>m.role==='assistant').map(m=>m.text),status:v.currentLocalThread()?.status,annotations:v.currentLocalThread()?.snapshot?.selection?.annotations};});
 report.answer=actual.messages.join('\n');report.bubble=actual.bubble;report.threadStatus=actual.status;report.selectedAnnotationCount=actual.annotations?.length;
 if(!actual.bubble.trim()||!report.answer.trim())throw Error('Real assistant output missing in canvas bubble');if(report.promptCount!==1)throw Error('Expected one actual prompt');
 report.status='PASS';await page.screenshot({path:out+'/real-pi-bubble.png'});
}catch(e){report.status='FAILED';report.error=String(e.message).replace(/Bearer\s+\S+/g,'Bearer [REDACTED]').replace(/\bsk-[\w-]+/g,'[REDACTED]');}
finally{if(child){try{child.stdin.write(JSON.stringify({type:'abort'})+'\n');child.stdin.end()}catch{}child.kill();}await browser.close();fs.writeFileSync(out+'/real-pi-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,model:report.model,promptCount:report.promptCount,error:report.error}));if(report.status!=='PASS')process.exitCode=1;}
