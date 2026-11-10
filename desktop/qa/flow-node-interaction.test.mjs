import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
import {flowExecutionRequest,flowNodePresentation,sourceCollections} from '../src/flow-node-contract.js';import {buildCurrentSchemeFlow} from '../src/current-scheme-flow.js';
const saved=JSON.parse(fs.readFileSync(new URL('../../codex-audit-logs/20261029-canonical-ui/actual-workpiece.agentcv.json',import.meta.url),'utf8'));
test('real project exits expose provenance only, while classification owns outgoing conditions',()=>{
 const mapping=JSON.parse(fs.readFileSync(new URL('../../codex-audit-logs/20261030-cards-mapping-stability/session-project-readonly.agentcv.json',import.meta.url),'utf8'));
 for(const data of [saved,mapping]){
  const flow=buildCurrentSchemeFlow(data).flow;
  for(const node of flow.nodes.filter(n=>['category','system-exit'].includes(n.kind))){
   const panel=flowNodePresentation(data,node,flow);
   assert.deepEqual(panel.branches,[]);assert.deepEqual(panel.objects,[]);assert.equal(panel.resolution,null);
   assert.deepEqual(panel.origins.map(o=>o.from),flow.edges.filter(e=>e.to===node.id).map(e=>e.from));
   assert.ok(panel.origins.length);assert.ok(panel.origins.every(o=>!o.active||node.executed));
   if(node.kind==='system-exit')assert.ok(panel.origins.every(o=>o.conditions.length===0));
  }
  const decision=flow.nodes.find(n=>n.kind==='decision');assert.equal(flowNodePresentation(data,decision,flow).branches.length,data.purposeScheme.classificationSpec.categories.length);
 }
});
test('real project exit dialogs show result provenance, never sibling routing controls',async()=>{
 const {createHarness}=createRequire(import.meta.url)('./workflow-ui-harness.cjs'),h=await createHarness();
 try{
  await h.api.loadProject(h.w.JSON.parse(JSON.stringify(saved)));const view=h.api.inquiryView.programFlow;view.refreshFlow();
  const executable=()=>JSON.stringify({scheme:h.api.project.data.purposeScheme,executions:h.api.project.data.datasetExecutions});const before=executable();
  for(const node of view.flow.nodes.filter(n=>['category','system-exit','decision'].includes(n.kind))){
   view.openBoundary(node);const dialog=h.w.document.querySelector('.flow-node-panel');assert.ok(dialog);
   if(node.kind==='decision'){assert.ok(dialog.querySelector('.flow-node-routes'));assert.match(dialog.textContent,/判定對象/);}
   else{assert.equal(dialog.querySelector('.flow-node-routes'),null);assert.doesNotMatch(dialog.textContent,/判定對象|條件與去向/);assert.ok(dialog.querySelector('.flow-node-origins button'));if(node.kind==='category')assert.match(dialog.textContent,/本件.*出口/);}
   dialog.close();
  }
  assert.equal(executable(),before,'reading exits must not change the executable project');
 }finally{h.close();}
});
test('saved real classification routes retain declared conditions and actual selected exit',()=>{const flow=buildCurrentSchemeFlow(saved).flow,node=flow.nodes.find(n=>n.kind==='decision'),panel=flowNodePresentation(saved,node,flow);assert.equal(panel.branches.length,saved.purposeScheme.classificationSpec.categories.length);assert.ok(panel.branches.every(b=>flow.nodes.some(n=>n.id===b.to)));assert.equal(panel.result,flow.nodes.find(n=>n.kind==='category'&&n.executed)?.title||'尚無本件分類結果');assert.ok(panel.objects.length);assert.equal(panel.branches.flatMap(b=>b.conditions).filter(c=>c.kind==='rule').length,saved.purposeScheme.classificationSpec.rules.length);assert.equal(panel.branches.flatMap(b=>b.conditions).filter(c=>c.kind==='missing').length,3);assert.deepEqual(panel.resolution.aggregation,saved.purposeScheme.classificationSpec.aggregation);for(const n of flow.nodes.filter(n=>n.kind==='rule'))assert.ok(flowNodePresentation(saved,n,flow).branches.every(b=>flow.nodes.some(n=>n.id===b.to)));});
test('source gallery preserves collections and excludes fixed reference from inspected workpieces',()=>{const flow=buildCurrentSchemeFlow(saved).flow,node=flow.nodes.find(n=>n.kind==='source'),groups=sourceCollections(saved,node),fixed=new Set(Object.values(saved.purposeScheme.execution.referenceInputs||{}));assert.ok(groups.length);assert.ok(groups.every(s=>s.imageIds.every(id=>!fixed.has(id))));const ref=flow.nodes.find(n=>n.kind==='reference');if(ref)assert.deepEqual(sourceCollections(saved,ref)[0].imageIds,ref.imageIds);});
test('real Workspace compilation precedes single-unit and sequential-source requests',async()=>{const {createHarness}=createRequire(import.meta.url)('./workflow-ui-harness.cjs'),h=await createHarness();try{await h.api.loadProject(h.w.JSON.parse(JSON.stringify(saved)));const p=h.api.project;const once=flowExecutionRequest(p,false);assert.equal(once.units.length,1);assert.deepEqual(once.units[0].imageIds,[p.image.id]);const batch=flowExecutionRequest(p,true);assert.ok(batch.sourceId);assert.equal(batch.units,undefined);const fixed=Object.values(p.purposeScheme.execution.referenceInputs||{})[0];if(fixed){await p.selectImage(fixed);assert.throws(()=>flowExecutionRequest(p,false),/參考圖/);}}finally{h.close();}});
test('a completed real dataset clears stale toolbar running text even when execution originated from a canvas card',async()=>{
 const {createHarness}=createRequire(import.meta.url)('./workflow-ui-harness.cjs'),h=await createHarness();try{await h.api.loadProject(h.w.JSON.parse(JSON.stringify(saved)));const output=h.w.document.querySelector('[aria-label="算法流程執行"] output');assert.ok(output);assert.equal(h.api.project.data.datasetExecutions.at(-1).status,'COMPLETED');output.textContent='執行中 · 2 / 2';h.api.render();assert.match(output.textContent,/執行結束/);assert.doesNotMatch(output.textContent,/執行中/);assert.equal(h.w.document.querySelector('[data-action="stop"]').hidden,true);}finally{h.close();}
});
