import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='/Users/liangshiben/13-cv/codex-audit-logs/20261030-graphic-abstraction',source='/Users/liangshiben/13-cv/codex-audit-logs/20261029-failure-repair/pi-mapping-closure/turn4/completed.agentcv.json',project=JSON.parse(await fs.readFile(source,'utf8'));
await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',s=>s.close());await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>window.AgentCVDesktop);await page.evaluate(data=>AgentCVDesktop.loadProject(data,{resume:true}),project);
const receipts=[];
for(const stepId of ['features','quality-projection']){
 const run=project.algorithmRuns.filter(r=>r.procedureTrace?.nodes?.some(n=>n.id===stepId)).at(-1);
 const receipt=await page.evaluate(async id=>{window.innerGraphic=await AgentCVDesktop.inquiryView.programFlow.openInnerTopology(id+'::run');const {flow,geometry,canvas,dialog}=innerGraphic;return {runId:id,nodes:flow.nodes.map(n=>({id:n.id,role:n.role,status:n.status})),edges:flow.edges.map(e=>({id:e.id,from:e.from,to:e.to,basis:e.basis})),renderedIds:[...canvas.querySelectorAll('[data-operator-node]')].map(e=>e.dataset.operatorNode),renderedEdges:[...canvas.querySelectorAll('[data-topology-edge]')].map(e=>e.dataset.topologyEdge),geometry:{width:geometry.width,height:geometry.height},dialog:dialog.open}},run.runId);
 assert.deepEqual(receipt.renderedIds.sort(),receipt.nodes.map(n=>n.id).sort());assert.deepEqual(receipt.renderedEdges.sort(),receipt.edges.map(e=>e.id).sort());assert.equal(receipt.dialog,true);
 await page.screenshot({path:out+'/inner-'+stepId+'.png'});
 await page.locator('[data-topology-edge]').first().focus();await page.keyboard.press('Enter');assert.match(await page.locator('.operator-topology-detail').textContent(),/紀錄來源/);await page.getByRole('button',{name:'圖例',exact:true}).click();await page.screenshot({path:out+'/inner-'+stepId+'-legend.png'});await page.getByRole('button',{name:'圖例',exact:true}).click();
 const current=await page.locator('.operator-topology-viewport>svg').getAttribute('viewBox');await page.getByRole('button',{name:'放大算子拓撲',exact:true}).click();assert.notEqual(await page.locator('.operator-topology-viewport>svg').getAttribute('viewBox'),current);await page.getByRole('button',{name:'配適',exact:true}).click();assert.equal(await page.locator('.operator-topology-viewport>svg').getAttribute('viewBox'),current);
 const operator=page.locator(`[data-operator-node="${run.runId}::${stepId}#1"]`);await operator.focus();await page.keyboard.press('Enter');assert.match(await page.locator('.operator-topology-detail').textContent(),/三項依據/);await page.screenshot({path:out+'/inner-'+stepId+'-selected.png'});
 await page.getByRole('button',{name:'關閉',exact:true}).last().click();receipts.push({...receipt,keyboardEdgeSelection:true,zoomAndFit:true,operatorEvidenceEntry:true});
}
assert.deepEqual(errors,[]);await fs.writeFile(out+'/inner-ui.json',JSON.stringify({status:'PASS',source,mock:false,receipts,errors},null,2));await browser.close();
