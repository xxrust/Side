import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Workspace} from '../src/workspace.js';
import {decodeBenchmarkImage} from '../scripts/agentcv-benchmark-batch.mjs';
import {buildCurrentSchemeFlow} from '../src/current-scheme-flow.js';
import {resolveNodeOutput} from '../src/node-output-model.js';
import {publishWorkpieceExecution,clearWorkpieceExecution} from '../src/workpiece-live-state.js';
const dir=new URL('../../codex-audit-logs/20261030-cards-mapping-stability/',import.meta.url);
const read=async name=>JSON.parse(await fs.readFile(new URL(name,dir),'utf8'));
async function setup(){
 const session=await read('native-session-readonly-snapshot.json'),report=await read('runtime-repeat-report.json'),p=new Workspace();await p.load(session.project,decodeBenchmarkImage);
 // These are retained outputs from twenty real Python dispatches against the
 // user's exact image bytes/code/parameters, not simulated computation results.
 p.data.datasetExecutions.push(report.execution);
 const packs=await Promise.all(report.execution.units.map(u=>read(u.unitId+'.json')));
 const retained=[];let olderSelection;for(const pack of packs){p.restoreInspectionUnit(pack,{executionId:pack.executionId,unitId:pack.record.unitId});retained.push(...p.data.algorithmRuns.filter(r=>pack.record.runIds.includes(r.runId)));olderSelection||=p.inspectionSelection;}
 // Keep the real run archive resident for selection-model testing (the UI normally
 // hydrates only the requested durable record). No result values are changed.
 p.data.algorithmRuns=[...p.data.algorithmRuns.filter(r=>!retained.some(k=>k.runId===r.runId)),...retained];p.inspectionSelection=olderSelection;
 return {p,packs,report,reference:p.data.purposeScheme.execution.referenceInputs.template};
}
function classification(flow){return flow.flow.nodes.find(n=>n.id==='scheme::classification');}
test('switching real box/fruits/reference images keeps output and flow on the latest matching workpiece, never the last opened record',async()=>{
 const {p,packs,reference}=await setup(),lastFor=id=>packs.findLast(pack=>pack.record.imageIds.includes(id)),scenes=[...new Set(packs.map(pack=>pack.record.imageIds[0]))];
 // Keep an older restored record selected to reproduce the original stale UI.
 assert.equal(p.inspectionSelection.unitId,packs[0].record.unitId);
 for(const id of [...scenes,reference,...scenes.slice().reverse(),reference,...scenes]){
  await p.selectImage(id);const output=resolveNodeOutput(p,{schemeNodeId:'geometry'}),flow=buildCurrentSchemeFlow(p);
  if(id===reference){assert.equal(output.status,'WAITING');assert.equal(flow.unitId,null);assert.equal(flow.executionId,null);assert.deepEqual(flow.runIds,[]);assert.equal(classification(flow).status,'DECLARED');assert.equal(classification(flow).categoryId,null);assert.ok(flow.flow.nodes.filter(n=>n.kind==='procedure').every(n=>n.status==='DECLARED'));}
  else {const expected=lastFor(id),run=expected.runs.find(r=>r.schemeNodeId==='geometry');assert.equal(flow.unitId,expected.record.unitId);assert.equal(output.unitId,flow.unitId);assert.equal(output.run.runId,run.runId);assert.equal(flow.flow.nodes.find(n=>n.schemeNodeId==='geometry').runId,run.runId);assert.equal(classification(flow).categoryId,expected.record.result.categoryId);assert.equal(output.run.result.supported,expected.record.result.categoryId==='mapped');}
 }
});
test('explicit historical run remains available while a fixed reference is selected',async()=>{
 const {p,packs,reference}=await setup(),historical=packs[0];await p.selectImage(reference);const flow=buildCurrentSchemeFlow(p,{runId:historical.runs[0].runId});assert.equal(flow.unitId,historical.record.unitId);assert.equal(classification(flow).categoryId,historical.record.result.categoryId);assert.equal(resolveNodeOutput(p,{schemeNodeId:'geometry'}).status,'WAITING');assert.equal(buildCurrentSchemeFlow(p,{runId:'absent'}).available,false);
});
test('actual in-flight unit takes precedence over browsing a fixed reference until execution finishes',async()=>{
 const {p,packs,reference,report}=await setup(),pack=packs.at(-1);await p.selectImage(reference);
 // Publish the real retained unit through the production live-state registry;
 // no node results or images are synthesized for this selection test.
 publishWorkpieceExecution(p,{...pack.record,executionId:report.execution.id});
 try{const output=resolveNodeOutput(p,{schemeNodeId:'geometry'}),flow=buildCurrentSchemeFlow(p);assert.equal(flow.live,true);assert.equal(output.live,true);assert.equal(flow.unitId,pack.record.unitId);assert.equal(output.unitId,flow.unitId);assert.equal(output.run.result.supported,pack.runs.find(r=>r.schemeNodeId==='geometry').result.supported);}finally{clearWorkpieceExecution(p);}
 assert.equal(buildCurrentSchemeFlow(p).unitId,null);assert.equal(resolveNodeOutput(p,{schemeNodeId:'geometry'}).status,'WAITING');
});

test('evicted actual node products request their exact durable record and restore without changing active image',async()=>{
 const {restoreCurrentOutputRecord}=await import('../src/inspection-records.js'),{p,packs,reference}=await setup(),pack=packs.at(-1);await p.selectImage(pack.record.imageIds[0]);p.data.algorithmRuns=p.data.algorithmRuns.filter(r=>!pack.record.runIds.includes(r.runId));
 const model=resolveNodeOutput(p,{schemeNodeId:'geometry'});assert.equal(model.status,'RESTORE_REQUIRED');assert.equal(model.run,null);assert.deepEqual(model.artifacts,[]);assert.ok(model.recordRef);assert.equal(model.unitId,pack.record.unitId);
 const activeId=p.image.id,epoch=p.epoch,guard={epoch,activeId,isCurrent:()=>p.epoch===epoch&&p.image.id===activeId&&resolveNodeOutput(p,{schemeNodeId:'geometry'}).unitId===model.unitId};
 const records={read:async ref=>JSON.parse(await fs.readFile(ref.path,'utf8')),artifact:async ref=>{const r=pack.runs.find(r=>r.runId===ref.runId),a=r.artifacts.find(a=>a.id===ref.artifactId);return {dataURL:'data:image/png;base64,'+(await fs.readFile(a.path)).toString('base64')};}};
 await restoreCurrentOutputRecord(p,model,records,guard);const ready=resolveNodeOutput(p,{schemeNodeId:'geometry'});assert.equal(ready.status,'READY');assert.equal(ready.run.runId,pack.runs.find(r=>r.schemeNodeId==='geometry').runId);assert.equal(p.image.id,activeId);assert.ok(ready.artifacts.every(a=>a.dataURL));
 p.data.algorithmRuns=p.data.algorithmRuns.filter(r=>!pack.record.runIds.includes(r.runId));let release;const held=new Promise(r=>release=r),pending=restoreCurrentOutputRecord(p,model,{...records,read:async ref=>{const actual=await records.read(ref);await held;return actual;}},guard);await p.selectImage(reference);release();await assert.rejects(pending,/切換工件/);assert.ok(!p.data.algorithmRuns.some(r=>pack.record.runIds.includes(r.runId)));assert.equal(resolveNodeOutput(p,{schemeNodeId:'geometry'}).status,'WAITING');
});
test('output view shares a real unit read across node navigation and offers retry after an actual disk error',async()=>{
 const {createRequire}=await import('node:module'),{createHarness}=createRequire(import.meta.url)('./workflow-ui-harness.cjs'),{restoreCurrentOutputRecord}=await import('../src/inspection-records.js'),{p,packs}=await setup(),pack=packs.at(-1);await p.selectImage(pack.record.imageIds[0]);p.data.algorithmRuns=p.data.algorithmRuns.filter(r=>!pack.record.runIds.includes(r.runId));const h=await createHarness();
 try{const v=h.api.inquiryView,project=h.api.project,output=v.outputView;let calls=0,release;const held=new Promise(r=>release=r);
 const records={read:async ref=>{calls++;const actual=JSON.parse(await fs.readFile(ref.path,'utf8'));await held;return actual;},artifact:async ref=>{const a=pack.runs.find(r=>r.runId===ref.runId).artifacts.find(a=>a.id===ref.artifactId);return {dataURL:'data:image/png;base64,'+(await fs.readFile(a.path)).toString('base64')};}};
 v.onLoadOutputRecord=(model,guard)=>restoreCurrentOutputRecord(project,model,records,guard);await h.api.loadProject(h.w.JSON.parse(p.serialize()));output.focus('geometry');v.render();await h.tick();v.render();v.render();await h.tick();assert.equal(calls,1);assert.equal(h.w.document.querySelector('.node-output-view').dataset.status,'RESTORE_REQUIRED');release();await Promise.all([...output.recordLoads.values()]);assert.equal(resolveNodeOutput(project,{schemeNodeId:'geometry'}).status,'READY');assert.ok(h.w.document.querySelector('.node-output-gallery img'));
 project.data.algorithmRuns=project.data.algorithmRuns.filter(r=>!pack.record.runIds.includes(r.runId));v.onLoadOutputRecord=async()=>{await fs.readFile(new URL('intentionally-absent-record.json',dir),'utf8');};v.render();await Promise.all([...output.recordLoads.values()]);assert.match(h.w.document.querySelector('.node-output-empty').textContent,/讀取失敗/);const retry=[...h.w.document.querySelectorAll('.node-output-empty button')].find(b=>b.textContent==='重試讀取');assert.ok(retry);
 v.onLoadOutputRecord=(model,guard)=>restoreCurrentOutputRecord(project,model,records,guard);retry.click();await Promise.all([...output.recordLoads.values()]);assert.equal(resolveNodeOutput(project,{schemeNodeId:'geometry'}).status,'READY');assert.ok(h.w.document.querySelector('.node-output-gallery img'));assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
