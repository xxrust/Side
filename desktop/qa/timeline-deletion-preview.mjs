import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out=path.resolve('../codex-audit-logs/20261102-timeline-deletion');fs.mkdirSync(out,{recursive:true});
const project=JSON.parse(fs.readFileSync('../codex-audit-logs/20261102-focused-discussion/verified-discussion.agentcv.json'));
const thread=project.canvasThreads.find(t=>t.status==='SENT');
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'}),page=await browser.newPage({viewport:{width:1440,height:920}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>window.AgentCVDesktop?.startupReady);await page.evaluate(()=>AgentCVDesktop.startupReady);
 await page.evaluate(async({project,thread})=>{await AgentCVDesktop.loadProject(project,{resume:true});const v=AgentCVDesktop.inquiryView;await v.open({boardId:thread.boardId});v.outputView.setMode('canvas');v.activeThreadId=thread.id;v.discussionHistoryOpen=true;v.render();v.fit();},{project,thread});
 const entry=page.locator(`.workspace-history-entry[data-thread-id="${thread.id}"]`);await entry.waitFor({state:'visible'});const remove=entry.getByRole('button',{name:'刪除此段圖文討論',exact:true});await remove.waitFor({state:'visible'});
 await page.screenshot({path:out+'/before.png'});await page.locator('.canvas-discussion-history').screenshot({path:out+'/timeline-before.png'});
 await remove.click();await entry.waitFor({state:'detached'});assert.equal(await page.locator('.canvas-discussion-history').evaluate(e=>e.open),true);
 await page.screenshot({path:out+'/deleted.png'});
 await page.evaluate(async()=>{const api=AgentCVDesktop,state=api.project.serialize(),v=api.inquiryView,boardId=v.boardId;await api.loadProject(state,{resume:true});await v.open({boardId});v.outputView.setMode('canvas');v.discussionHistoryOpen=true;v.render();});
 await entry.waitFor({state:'detached'});await page.getByRole('button',{name:'復原刪除',exact:true}).click();await entry.waitFor({state:'visible'});
 await page.screenshot({path:out+'/restored.png'});
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/browser-verification.json',JSON.stringify({status:'PASS',source:'Actual saved image discussion; shared browser UI, not native desktop screenshot.',checks:['delete button visible','deleted card absent','history remains expanded','deletion survives project reload','restore card visible'],errors},null,2));
}finally{await browser.close();}
