// Browser integration against genuine persisted CAS records and PNGs; no algorithm execution.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out=path.resolve('../codex-audit-logs/20261102-focused-discussion'),project=JSON.parse(fs.readFileSync(out+'/verified-discussion.agentcv.json'));
const reference=project.datasetExecutions[0].units[0].recordRef;
function bytes(ref,root=reference.root){const b=fs.readFileSync(path.join(root,ref.$asset));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),ref.sha256);return b;}
const saved=JSON.parse(bytes(reference));
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'}),page=await browser.newPage({viewport:{width:1440,height:920}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
await page.exposeFunction('readActualHistory',ref=>{assert.equal(ref.sha256,reference.sha256);return JSON.parse(bytes(ref));});
await page.exposeFunction('readActualArtifact',ref=>{const a=saved.runs.find(r=>r.runId===ref.runId).artifacts.find(a=>a.id===ref.artifactId);return {dataURL:'data:'+a.mime+';base64,'+bytes(a.assetRef).toString('base64'),verified:true};});
await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>window.AgentCVDesktop?.startupReady);await page.evaluate(()=>AgentCVDesktop.startupReady);
await page.evaluate(async p=>{await AgentCVDesktop.loadProject(p,{resume:true});const v=AgentCVDesktop.inquiryView;v.onReadInspectionUnit=readActualHistory;v.onReadInspectionArtifact=readActualArtifact;},project);
const before=await page.evaluate(()=>({activeId:AgentCVDesktop.project.data.activeId,scheme:JSON.stringify(AgentCVDesktop.project.purposeScheme)}));
await page.evaluate(async reference=>{const {previewHistoricalUnit}=await import('/src/focused-workspace.js');await previewHistoricalUnit(AgentCVDesktop.inquiryView,reference);},reference);
await page.waitForFunction(()=>document.querySelector('.historical-image-preview img')?.naturalWidth>0);
await page.getByRole('combobox',{name:'歷史紀錄圖像'}).selectOption('1');await page.waitForFunction(()=>!document.querySelector('.historical-image-preview button:last-child').disabled);
const label=await page.getByRole('combobox',{name:'歷史紀錄圖像'}).inputValue();assert.equal(label,'1');
await page.screenshot({path:out+'/history-preview.png'});await page.getByRole('button',{name:'引用並標記',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.historical-image-preview'));
const after=await page.evaluate(()=>{const v=AgentCVDesktop.inquiryView;return {activeId:v.project.data.activeId,scheme:JSON.stringify(v.project.purposeScheme),source:v.asset(v.board().items.at(-1)).source};});
assert.equal(after.activeId,before.activeId);assert.equal(after.scheme,before.scheme);assert.equal(after.source.kind,'historical-algorithm-output');assert.equal(after.source.unitId,saved.record.unitId);assert.equal(after.source.artifactSha256,saved.runs[0].artifacts.filter(a=>a.type==='image')[1].sha256);assert.deepEqual(errors,[]);
const input=page.getByRole('textbox',{name:'畫板問題',exact:true});await input.fill('參考之前的標記 @');await page.getByRole('listbox',{name:'可引用圖像'}).waitFor();await page.locator('.image-mention-option').first().click();await page.waitForFunction(()=>AgentCVDesktop.inquiryView.board().items.at(-1).annotations.length>0);const copied=await page.evaluate(()=>{const v=AgentCVDesktop.inquiryView,i=v.board().items.at(-1);return {annotations:i.annotations,source:v.asset(i).source};});assert.equal(copied.annotations[0].type,'rect');assert.ok(copied.source.runId);assert.deepEqual(errors,[]);
fs.writeFileSync(out+'/history-verification.json',JSON.stringify({passed:true,storage:'real workspace CAS, hashes verified, browser file-reader adapter; native reader not exercised in this probe',checks:['read actual saved unit and PNG bytes','switch actual artifact','read-only preview leaves active workpiece and scheme unchanged','fixed reference preserves unit/run/artifact/hash','@ copies genuine annotations from another discussion'],source:after.source,pageErrors:errors},null,2));
}finally{await browser.close();}
