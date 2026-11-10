// Actual browser + saved real Python image outputs. No model/algorithm stubs.
import fs from 'node:fs';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='/Users/liangshiben/13-cv/reviews/2026-10-27-program-flow',report={status:'NOT_RUN',errors:[],viewports:[]};
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:920}});page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 // Keep the actual loaded application stable while independent tests write files.
 await page.routeWebSocket('**',socket=>socket.close());
 await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>!!window.AgentCVDesktop);
 await page.evaluate(s=>{AgentCVDesktop.project.dirty=false;window.flowLoad='pending';window.flowLoadPromise=AgentCVDesktop.loadProject(s).then(()=>{window.flowLoad='loaded';AgentCVDesktop.go(6);}).catch(e=>window.flowLoad=e.message);},fs.readFileSync(out+'/actual-python-workspace.agentcv.json','utf8'));
 await page.waitForFunction(()=>window.flowLoad==='loaded'&&AgentCVDesktop.inquiryView.opened&&!AgentCVDesktop.inquiryView.workflowPending);
 const nodeButton=page.locator('[data-program-node$="::segment#1"]');await nodeButton.click();await page.waitForFunction(()=>AgentCVDesktop.inquiryView.board()?.programBinding?.nodeId.endsWith('::segment#1'));
 const before=await page.evaluate(()=>{const v=AgentCVDesktop.inquiryView;v.zoom=.83;v.pan={x:33,y:74};v.paint();return {board:v.boardId,zoom:v.zoom,pan:{...v.pan},page:AgentCVDesktop.page};});
 await page.getByLabel('選擇下游分支',{exact:true}).selectOption({label:'邊緣分支 · 已執行'});await page.waitForFunction(()=>AgentCVDesktop.inquiryView.board()?.programBinding?.nodeId.endsWith('::edges#1'));
 await page.getByLabel('選擇前提節點',{exact:true}).selectOption({label:'Otsu 分割 · 已執行'});await page.waitForFunction(()=>AgentCVDesktop.inquiryView.board()?.programBinding?.nodeId.endsWith('::segment#1'));
 const after=await page.evaluate(()=>{const v=AgentCVDesktop.inquiryView;return {board:v.boardId,zoom:v.zoom,pan:{...v.pan},page:AgentCVDesktop.page};});if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Node switching did not retain camera and page');report.retainedCamera=true;
 await page.evaluate(()=>AgentCVDesktop.inquiryView.fit());await page.screenshot({path:out+'/program-node-canvas.png'});
 await page.getByRole('button',{name:'三項依據',exact:true}).click();await page.getByRole('button',{name:'為何用這組參數',exact:true}).click();await page.getByRole('button',{name:'適用邊界',exact:true}).click();await page.getByRole('button',{name:'為何用此方法',exact:true}).click();
 for(const size of [{width:1440,height:920},{width:1180,height:760}]){
  await page.setViewportSize(size);await page.waitForTimeout(120);
  const bounds=await page.evaluate(()=>{const f=document.querySelector('.program-flow-rail'),p=document.querySelector('.program-evidence-panel'),body=p.querySelector('.program-evidence-body'),canvas=AgentCVDesktop.inquiryView.canvas,rect=p.getBoundingClientRect();return {rail:{height:f.clientHeight,content:f.scrollHeight},evidence:{height:body.clientHeight,content:body.scrollHeight,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},canvas:{width:canvas.clientWidth,height:canvas.clientHeight}};});
  if(bounds.rail.content>bounds.rail.height+2||bounds.evidence.content>bounds.evidence.height+2||bounds.evidence.right>size.width||bounds.evidence.bottom>size.height)throw Error('Layout clips at '+size.width+'px: '+JSON.stringify(bounds));report.viewports.push({...size,...bounds});await page.screenshot({path:out+'/program-evidence-'+size.width+'.png'});
 }
 if(report.errors.length)throw Error(report.errors.join('\n'));report.status='PASS';
}catch(error){report.status='FAILED';report.error=error.message;process.exitCode=1;}
finally{await browser.close();fs.writeFileSync(out+'/browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
