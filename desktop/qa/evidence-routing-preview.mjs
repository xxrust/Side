import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='/Users/liangshiben/13-cv/reviews/2026-10-27-evidence-routing';
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
const report={status:'NOT_RUN',sections:[],pageErrors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:920}});await page.routeWebSocket('**',s=>s.close());page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>!!window.AgentCVDesktop);await page.evaluate(()=>AgentCVDesktop.startupReady);
 await page.locator('#browserProject').setInputFiles(out+'/actual-pi-workspace.agentcv.json');await page.waitForFunction(()=>AgentCVDesktop.project.data.algorithmRuns?.length>0&&AgentCVDesktop.inquiryView.opened);
 await page.evaluate(async()=>{const a=AgentCVDesktop;await a.inquiryView.programFlow.openNode(a.project.data.algorithmRuns.at(-1).runId+'::compare#1');a.inquiryView.programFlow.detailsOpen=true;});
 for(const [section,id] of [['tool','method'],['parameters','sweep'],['boundary','ambiguity']]){
  await page.evaluate(section=>{const v=AgentCVDesktop.inquiryView;v.programFlow.section=section;v.programFlow.evidencePage=0;v.render();},section);
  await page.locator('.program-evidence-panel img').evaluate(img=>img.decode());
  const observed=await page.evaluate(({id,section})=>{const a=AgentCVDesktop,r=a.project.data.algorithmRuns.at(-1),image=document.querySelector('.program-evidence-panel img'),expected=r.artifacts.find(v=>v.id===id);return {section,artifactId:id,match:image?.src===(expected.dataUrl||expected.dataURL),loaded:image.complete&&image.naturalWidth===expected.width,caption:document.querySelector('.program-evidence-panel figcaption')?.textContent};},{section,id});
  assert.ok(observed.match&&observed.loaded);report.sections.push(observed);await page.screenshot({path:out+'/ui-'+section+'.png'});
 }
 assert.equal(new Set(report.sections.map(s=>s.artifactId)).size,3);assert.deepEqual(report.pageErrors,[]);
 await page.evaluate(()=>{const v=AgentCVDesktop.inquiryView;v.programFlow.section='tool';v.render();});
 fs.writeFileSync(out+'/review-ready-workspace.agentcv.json',await page.evaluate(()=>JSON.stringify({...AgentCVDesktop.project.data,workspaceView:AgentCVDesktop.workspaceView()})));
 report.status='PASS';
}catch(e){report.status='FAILED';report.error=e.stack;process.exitCode=1;}finally{await browser.close();fs.writeFileSync(out+'/presentation-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
