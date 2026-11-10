import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out=path.resolve('../codex-audit-logs/20261102-project-acceptance'),project=JSON.parse(fs.readFileSync(out+'/verified.agentcv.json'));
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'}),page=await browser.newPage({viewport:{width:1440,height:980}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>window.AgentCVDesktop?.startupReady);await page.evaluate(()=>AgentCVDesktop.startupReady);
 await page.evaluate(async project=>{await AgentCVDesktop.loadProject(project,{resume:true});const v=AgentCVDesktop.inquiryView;await v.open();v.projectCards.openProjectPanel('classification');},project);
 const panel=page.locator('.project-floating-panel[data-kind="classification"]');await panel.waitFor({state:'visible'});await panel.getByText('人類已確認目前約定',{exact:true}).waitFor();await panel.screenshot({path:out+'/agreement.png'});
 await panel.getByRole('button',{name:'基準圖片',exact:true}).click();assert.equal(await panel.locator('.pa-sample').count(),2);await panel.screenshot({path:out+'/dataset.png'});
 await panel.getByRole('button',{name:'回歸對比',exact:true}).click();await panel.getByText('固定樣本檢查未通過',{exact:true}).waitFor();await panel.screenshot({path:out+'/regression.png'});
 assert.match(await panel.innerText(),/新退步 0/);assert.match(await panel.innerText(),/答案覆蓋 2\/2/);
 const box=await panel.boundingBox();assert.ok(box.y+box.height<=980);assert.equal(await panel.evaluate(e=>e.scrollHeight>e.clientHeight+2),false);assert.equal(await panel.locator('.project-floating-body').evaluate(e=>e.scrollHeight>e.clientHeight+2),false);
 const saved=await page.evaluate(()=>AgentCVDesktop.project.serialize());await page.evaluate(async data=>{await AgentCVDesktop.loadProject(data,{resume:true});const v=AgentCVDesktop.inquiryView;await v.open();if(v.projectCards.projectPanel)v.projectCards.openProjectPanel('classification');v.projectCards.openProjectPanel('classification');},saved);
 await panel.waitFor({state:'visible'});assert.ok((await page.evaluate(()=>AgentCVDesktop.project.data.acceptanceWorkspace.baselines)).length);assert.deepEqual(errors,[]);
 fs.writeFileSync(out+'/browser-verification.json',JSON.stringify({status:'PASS',scope:'Shared actual app UI with native-executed real saved records; QA-only acceptance budget, no production acceptance claim.',checks:['agreement confirmed','real human labels visible','two native runs compared','tiny cycle budget correctly fails','reload preserves baseline and contract','panel fits viewport'],errors},null,2));
}finally{await browser.close();}
