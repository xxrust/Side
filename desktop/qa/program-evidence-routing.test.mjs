import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {buildProgramFlow} from '../src/program-flow.js';
import {reviseAlgorithmEvidence} from '../src/algorithm-evidence-revisions.js';
import {resolveProgramEvidence} from '../src/program-evidence.js';
import {auditAlgorithmProcedureTrace} from '../src/algorithm-procedure-audit.js';
const fixture=JSON.parse(await fs.readFile(new URL('../../reviews/2026-10-27-program-flow/actual-pi-workspace-portable.agentcv.json',import.meta.url),'utf8'));
const run=fixture.algorithmRuns.at(-1),flow=buildProgramFlow(fixture),node=id=>flow.nodes.find(n=>n.id===run.runId+'::'+id+'#1');

test('actual Pi Otsu numeric reference remains numeric/chart evidence, never substituted by its output mask',()=>{
 const n=node('otsu'),s=n.justification.tool.expectedEvidence[0],e=resolveProgramEvidence(n,s);
 assert.equal(e.artifact.id,'otsu_stats');assert.equal(e.artifact.data.histogram.length,256);assert.equal(e.images.length,0);assert.deepEqual(e.errors,[]);
 const boundary=resolveProgramEvidence(n,n.justification.boundaries[0].check);assert.ok(boundary.check);assert.equal(boundary.images.length,0);
});

test('an explicit dedicated visual is bound to the exact saved node and cannot fall back across branches',()=>{
 const otsu=node('otsu'),selector={...otsu.justification.parameters[0].verification,visuals:[{id:'otsu',caption:'核對本圖暗區遮罩；不代表物件身份。'}]};
 const resolved=resolveProgramEvidence(otsu,selector);assert.equal(resolved.images[0].artifact.id,'otsu');assert.equal(resolved.images[0].caption,selector.visuals[0].caption);
 const wrong=resolveProgramEvidence(node('components'),selector);assert.equal(wrong.images.length,0);assert.ok(wrong.errors.some(e=>e.includes('otsu')));
});

test('the submission audit rejects a visual borrowed from another real step and reports its exact repair path',()=>{
 const candidate=structuredClone(run),otsu=candidate.procedureTrace.nodes.find(n=>n.id==='otsu');
 otsu.justification.boundaries[0].check.visuals=[{id:'otsu',caption:'核對此步實算遮罩，不把格式檢查稱作跨圖適用性。'}];
 let audit=auditAlgorithmProcedureTrace(candidate);assert.ok(!audit.errors.some(e=>e.code==='EVIDENCE_VISUAL_UNAVAILABLE'));
 otsu.justification.boundaries[0].check.visuals[0].id='components';audit=auditAlgorithmProcedureTrace(candidate);
 const error=audit.errors.find(e=>e.code==='EVIDENCE_VISUAL_UNAVAILABLE');assert.ok(error);assert.match(error.path,/procedureTrace.nodes\[2\].*visuals\[0\].id/);assert.ok(error.hint);
 otsu.justification.boundaries[0].check.visuals[0]={id:'otsu',caption:''};audit=auditAlgorithmProcedureTrace(candidate);assert.ok(audit.errors.some(e=>e.code==='EVIDENCE_CAPTION_REQUIRED'));
});

test('the actual saved Pi project opens its Otsu histogram immediately; numeric/gate evidence never reuses output images',async()=>{
 const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{
  await h.api.loadProject(h.w.JSON.parse(JSON.stringify(fixture)));const v=h.api.inquiryView,f=v.programFlow;
  await f.openNode(run.runId+'::otsu#1');f.detailsOpen=true;f.section='tool';v.render();
  let panel=h.w.document.querySelector('.program-evidence-panel');assert.ok(panel.querySelector('svg[aria-label="保存的實際灰階直方圖"]'));assert.equal(panel.querySelectorAll('img').length,0);
  f.section='boundary';v.render();panel=h.w.document.querySelector('.program-evidence-panel');assert.equal(panel.querySelectorAll('img').length,0);assert.match(panel.textContent,/尚無專用圖像/);
  await f.openNode(run.runId+'::components#1');f.section='parameters';v.render();panel=h.w.document.querySelector('.program-evidence-panel');assert.equal(panel.querySelectorAll('img').length,0);assert.match(panel.textContent,/尚無專用圖像/);
  f.section='tool';await f.openNode(run.runId+'::canny_0#1');panel=h.w.document.querySelector('.program-evidence-panel');assert.equal(panel.querySelector('img')?.src,node('canny_0').artifacts.find(a=>a.id==='edges_0').dataUrl);
 }finally{h.close();}
});


test('right-click evidence opens the exact artifact producer in place and flow nodes expose the same three tabs',async()=>{
 const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{
  await h.api.loadProject(h.w.JSON.parse(JSON.stringify(fixture)));const v=h.api.inquiryView,f=v.programFlow;
  await f.openNode(run.runId+'::components#1');const boardId=v.boardId,selectedId=f.selectedId,serialized=JSON.stringify(h.api.project.data.algorithmRuns);
  const otsu=node('otsu'),artifact=otsu.artifacts.find(a=>a.id==='otsu'),asset={source:{runId:run.runId,artifactId:artifact.id,artifactSha256:artifact.sha256,codeSha256:run.codeSha256}};
  const menu=h.w.document.createElement('div');f.appendAssetEvidence(menu,asset);assert.equal(menu.querySelector('button').textContent,'查看三項依據');menu.querySelector('button').click();
  let panel=h.w.document.querySelector('.program-evidence-panel');assert.equal(panel.querySelector('header strong').textContent,otsu.title);assert.equal(panel.querySelectorAll('nav button').length,3);assert.ok(panel.querySelector('svg[aria-label="保存的實際灰階直方圖"]'));
  assert.equal(v.boardId,boardId,'reading an image explanation does not navigate away from the inquiry board');assert.equal(f.selectedId,selectedId,'right-click reading does not change the selected execution step');assert.equal(JSON.stringify(h.api.project.data.algorithmRuns),serialized,'reading evidence never rewrites execution history');
  await f.map.ready;f.map.expand();await f.map.expanded.layoutReady;const mapNode=f.map.dialog.querySelector('.program-flow-map-node[data-program-node="'+run.runId+'::canny_0#1"]');assert.ok(mapNode);mapNode.dispatchEvent(new h.w.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:100}));
  const action=[...h.w.document.querySelectorAll('.inquiry-menu button')].find(b=>b.textContent==='查看三項依據');assert.ok(action);assert.ok(f.map.dialog.contains(action),'context menu must be inside the top-layer flow dialog');action.click();assert.equal(f.map.dialog,null);panel=h.w.document.querySelector('.program-evidence-panel');assert.equal(panel.querySelector('header strong').textContent,node('canny_0').title);assert.equal(v.boardId,boardId);
  const unavailable=h.w.document.createElement('div');f.appendAssetEvidence(unavailable,{source:{imageId:'not-in-project'}});assert.equal(unavailable.querySelector('button').disabled,true);assert.match(unavailable.textContent,/尚無算法執行紀錄/);
 }finally{h.close();}
});


test('real legacy step with no registered parameters displays inherited-setting notes as readable revision commentary',async()=>{
 const saved=JSON.parse(await fs.readFile(new URL('../../OpenCV封面定位.agentcv.json',import.meta.url),'utf8'));
 const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{
  await h.api.loadProject(h.w.JSON.parse(JSON.stringify(saved)));const v=h.api.inquiryView,f=v.programFlow,p=h.api.project,r=p.data.algorithmRuns[0],step=r.procedureTrace.nodes.find(n=>n.kind==='step'&&!Object.keys(n.parameters||{}).length),before=JSON.stringify(step);
  assert.ok(step);const notes='此步的執行紀錄沒有列出獨立參數。\n\n**這不代表算法沒有設定**；本修訂未新增比較實驗。\n\n| 項目 | 狀態 |\n| --- | --- |\n| 獨立參數紀錄 | 未列出 |\n| 新增實驗 | 沒有 |';
  reviseAlgorithmEvidence(p,{run_id:r.runId,expected_revision:r.evidenceRevisions?.length||0,reason:'將既有參數紀錄的限制顯示在參數頁，保留真實執行',nodes:[{instanceId:step.instanceId,parameterNotes:notes}]});
  f.openEvidence(r.runId+'::'+step.instanceId);f.section='parameters';v.render();const panel=h.w.document.querySelector('.program-evidence-panel');
  assert.match(panel.textContent,/既有設定說明（解說修訂，非新增量測參數）/);assert.doesNotMatch(panel.textContent,/本步驟沒有可調參數/);assert.ok(panel.querySelector('.program-evidence-readable strong'));assert.ok(panel.querySelector('.program-evidence-readable table'));assert.equal(panel.querySelectorAll('.program-evidence-readable p').length,2);assert.equal(JSON.stringify(step),before,'notes must not manufacture historical parameter values or replace author text');
 }finally{h.close();}
});
