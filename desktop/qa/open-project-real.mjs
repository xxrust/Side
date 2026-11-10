// Integration smoke: production Rust-hydrated content + actual recovered session.
// Usage: node qa/open-project-real.mjs CONTENT_JSON SESSION_JSON EVIDENCE_DIR [URL]
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const [contentFile,sessionFile,out,url='http://127.0.0.1:1420']=process.argv.slice(2);
const content=await fs.readFile(contentFile,'utf8'),incoming=JSON.parse(content),saved=JSON.parse(await fs.readFile(sessionFile,'utf8'));
const projectPath='/Users/liangshiben/13-cv/專案-OpenCV封面定位-真實操作';
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(saved=>{const request=indexedDB.open('agentcv-session',1);request.onupgradeneeded=()=>request.result.createObjectStore('session');request.onsuccess=()=>{const db=request.result,tx=db.transaction('session','readwrite');tx.objectStore('session').put(JSON.stringify(saved),'last');tx.oncomplete=()=>db.close();};},saved);
 await page.goto(url);await page.waitForFunction(()=>!!window.AgentCVDesktop);await page.evaluate(()=>AgentCVDesktop.startupReady);
 const recovered=await page.evaluate(()=>({runs:AgentCVDesktop.project.data.algorithmRuns.length,path:AgentCVDesktop.sessionRecovery.projectPath,dirty:AgentCVDesktop.project.dirty}));
 assert.deepEqual(recovered,{runs:4,path:null,dirty:true});
 const before=await page.evaluate(()=>AgentCVDesktop.project.epoch);
 const open=()=>page.evaluate(({content,projectPath})=>AgentCVDesktop.loadProject(content,{path:projectPath}),{content,projectPath});
 const cancelled=open();const dialog=page.getByRole('dialog',{name:'確認切換專案',exact:true});await dialog.waitFor();await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await cancelled,false);assert.equal(await page.evaluate(()=>AgentCVDesktop.project.epoch),before);
 const loading=open();await dialog.waitFor();await dialog.getByRole('button',{name:'開啟另一個專案',exact:true}).click();assert.equal(await loading,true);
 await page.waitForFunction(()=>!document.getElementById('openProject').disabled);
 const actual=await page.evaluate(async()=>{const a=AgentCVDesktop;await a.sessionRecovery.flush();return {runs:a.project.data.algorithmRuns.length,path:a.sessionRecovery.projectPath,dirty:a.project.dirty,chat:a.project.data.chat,boardId:a.inquiryView.boardId,boardIds:a.project.data.visualInquiry.boards.map(b=>b.id),drafts:a.inquiryView.questionDrafts.size,notice:document.getElementById('projectLoadNotice').textContent,status:document.getElementById('inlineStatus').textContent};});
 assert.equal(actual.runs,3);assert.equal(actual.path,projectPath);assert.equal(actual.dirty,false);assert.deepEqual(actual.chat,incoming.chat);assert.ok(actual.boardIds.includes(actual.boardId));assert.equal(actual.drafts,0);assert.match(actual.notice,/已開啟專案.*3 筆實算/);assert.doesNotMatch(actual.status,/已恢復/);
 await page.locator('#projectLoadNotice').waitFor({state:'visible'});await page.screenshot({path:out+'/DESKTOP-OPEN-PROJECT-browser.png'});
 // A fresh store read verifies persisted recovery, rather than just controller fields.
 const persisted=await page.evaluate(async()=>{const {browserSessionStore}=await import('/src/app-session.js');return JSON.parse(await browserSessionStore().read());});
 assert.equal(persisted.projectPath,projectPath);assert.equal(persisted.project.algorithmRuns.length,3);assert.equal(persisted.dirty,false);
 await page.getByRole('button',{name:'Purpose 方案',exact:true}).click();await page.getByText('Purpose → 成像约束 → 可执行图 → 验收',{exact:true}).waitFor();await page.screenshot({path:out+'/DESKTOP-OPEN-PROJECT-purpose.png'});
 assert.deepEqual(errors,[]);
 const {chat,...summary}=actual;const receipt={status:'PASS',recovered,cancelPreserved:true,loaded:summary,chatMatchesManifest:true,persisted:{path:persisted.projectPath,runs:persisted.project.algorithmRuns.length,dirty:persisted.dirty},purpose:'PASS',pageErrors:errors};
 await fs.writeFile(out+'/DESKTOP-OPEN-PROJECT-browser.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}finally{await browser.close()}
