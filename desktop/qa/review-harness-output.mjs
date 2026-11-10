// Read-only browser review of actual persisted benchmark outputs, no model calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const dir=path.resolve(process.argv[2]),root=await fs.realpath(dir),hash=b=>createHash('sha256').update(b).digest('hex');
async function bytes(file,expected){const actual=await fs.realpath(file);if(!actual.startsWith(root+'/'))throw Error('Output reference escaped benchmark directory');const b=await fs.readFile(actual);if(expected&&hash(b)!==expected)throw Error('Stored bytes changed');return b;}
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
try{
 const page=await browser.newPage({viewport:{width:1680,height:1050}});await page.routeWebSocket('**',s=>s.close());await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>window.AgentCVDesktop);await page.evaluate(()=>AgentCVDesktop.startupReady);
 await page.exposeFunction('readVerifiedBenchmarkUnit',async ref=>{const product=JSON.parse(await bytes(ref.path,ref.sha256));for(const run of product.runs||[])for(const a of run.artifacts||[]){const b=await bytes(a.path,a.sha256);if(a.type==='image')Object.assign(a,{dataURL:'data:image/png;base64,'+b.toString('base64'),dataUrl:'data:image/png;base64,'+b.toString('base64')});if(a.type==='json')a.data=JSON.parse(b);}return product;});
 await page.evaluate(async saved=>{
  const api=AgentCVDesktop,p=api.project,v=api.inquiryView,records={read:ref=>window.readVerifiedBenchmarkUnit(ref),artifact:async ref=>{const r=await window.readVerifiedBenchmarkUnit(ref),a=r.runs.find(r=>r.runId===ref.runId)?.artifacts.find(a=>a.id===ref.artifactId);if(!a?.dataURL)throw Error('Actual image unavailable');return a;}};
  v.onReadInspectionUnit=records.read;v.onReadInspectionArtifact=records.artifact;v.onLoadOutputRecord=async(model,guard)=>(await import('/src/inspection-records.js')).restoreCurrentOutputRecord(p,model,records,guard);v.onLoadOutputImage=async(model,a)=>{const loaded=await records.artifact({...model.recordRef,runId:model.run.runId,artifactId:a.id});p.setInspectionArtifactPreview(model.run.runId,a.id,loaded.dataURL);};
  await api.loadProject(saved,{resume:true});await v.open({boardId:p.ensureProjectCanvas().id});
 },JSON.parse(await fs.readFile(dir+'/completed.agentcv.json','utf8')));
 await page.getByRole('button',{name:'輸入／輸出',exact:true}).click();await page.locator('.node-output-viewport img').first().waitFor({state:'visible',timeout:15000});await page.waitForFunction(()=>[...document.querySelectorAll('.node-output-viewport img')].every(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:dir+'/verified-output-view.png'});const result=await page.evaluate(()=>({outputImages:[...document.querySelectorAll('.node-output-viewport img')].map(i=>({width:i.naturalWidth,height:i.naturalHeight})),state:document.querySelector('.node-output-heading')?.textContent,activeImage:AgentCVDesktop.project.image?.name}));
 await page.getByRole('button',{name:'討論畫布',exact:true}).click();await page.screenshot({path:dir+'/verified-canvas-view.png'});await fs.writeFile(dir+'/visual-review.json',JSON.stringify({scope:'Browser with actual persisted file adapters; not native desktop screenshot',...result},null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
