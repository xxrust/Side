import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {resolveNodeOutput,outputImageReference} from '../src/node-output-model.js';
const saved=JSON.parse(fs.readFileSync(new URL('../../codex-audit-logs/20261029-failure-repair/pi-mapping-closure/turn4/completed.agentcv.json',import.meta.url),'utf8'));
const current=()=>{const p=structuredClone(saved);p.activeId=p.datasetExecutions.at(-1).units.at(-1).imageIds[0];return p;};
// These tests select actual saved Pi/OpenCV results. Changes below corrupt
// references or modify the current scheme; they do not manufacture CV results.
test('current outputs belong to the exact current workpiece and expose only actual declared result images',()=>{
 const p=current(),model=resolveNodeOutput(p,{schemeNodeId:'correspondence'}),unit=p.datasetExecutions.at(-1).units.at(-1);
 assert.equal(model.status,'READY');assert.equal(model.unitId,unit.unitId);assert.ok(unit.runIds.includes(model.run.runId));assert.deepEqual(model.run.workpieceUnit.imageIds,unit.imageIds);assert.deepEqual(model.artifacts.map(a=>a.id),['matches']);
 assert.ok(model.run.artifacts.some(a=>a.id==='feature_overlay'),'the process image really exists but is excluded');assert.ok(model.run.artifacts.some(a=>a.id==='ratio_comparison'));
 const source=outputImageReference(model,model.artifacts[0]);assert.equal(source.source.unitId,unit.unitId);assert.equal(source.source.runId,model.run.runId);assert.equal(source.source.artifactId,'matches');
 const altered={...model.artifacts[0],dataURL:'data:image/png;base64,not-the-actual-output',dataUrl:'data:image/png;base64,not-the-actual-output'};assert.equal(outputImageReference(model,altered).dataURL,source.dataURL,'reference uses canonical verified artifact, not caller-supplied pixel data');
});
test('never-run sources do not inherit the canvas or most recent other image result',()=>{
 const p=current(),historical=p.algorithmRuns.find(r=>r.workpieceUnit?.imageIds?.[0]!==p.activeId),unit=p.datasetExecutions.at(-1).units.at(-1);
 p.inspectionSelection={executionId:p.datasetExecutions.at(-1).id,unitId:unit.unitId,record:{...unit,schemeFingerprint:p.datasetExecutions.at(-1).schemeFingerprint}};
 p.visualInquiry.boards[0].programBinding={runId:historical.runId,nodeId:historical.runId+'::run'};
 assert.equal(resolveNodeOutput(p,{schemeNodeId:'correspondence'}).unitId,unit.unitId);
 p.activeId=Object.values(p.purposeScheme.execution.referenceInputs)[0];const empty=resolveNodeOutput(p,{schemeNodeId:'correspondence'});assert.equal(empty.status,'WAITING');assert.deepEqual(empty.artifacts,[]);assert.equal(empty.run,null);
 delete p.inspectionSelection;assert.doesNotThrow(()=>resolveNodeOutput(p,{schemeNodeId:'correspondence'}));
});
test('parameter changes and changed original image identity never reuse old outputs',()=>{
 const parameters=current();parameters.purposeScheme.operatorGraph.nodes.find(n=>n.id==='correspondence').parameters.review_changed=true;
 assert.deepEqual(resolveNodeOutput(parameters,{schemeNodeId:'correspondence'}).artifacts,[]);
 const source=current();source.images.find(i=>i.id===source.activeId).contentSha256='changed-input';assert.equal(resolveNodeOutput(source,{schemeNodeId:'correspondence'}).status,'STALE');
 const impact=current(),run=resolveNodeOutput(impact,{schemeNodeId:'correspondence'}).run;run.inputImpact={status:'STALE'};assert.equal(resolveNodeOutput(impact,{schemeNodeId:'correspondence'}).status,'STALE');
});
test('wrong-workpiece saved run links are rejected even when both source images and scheme still exist',()=>{
 const p=current(),unit=p.datasetExecutions.at(-1).units.at(-1),foreign=p.algorithmRuns.find(r=>r.schemeNodeId==='correspondence'&&r.workpieceUnit?.id!==unit.unitId);
 assert.ok(foreign);unit.runIds=unit.runIds.map(id=>p.algorithmRuns.find(r=>r.runId===id)?.schemeNodeId==='correspondence'?foreign.runId:id);
 const result=resolveNodeOutput(p,{schemeNodeId:'correspondence'});assert.equal(result.status,'STALE');assert.deepEqual(result.artifacts,[]);assert.match(result.reason,/綁定不一致/);
});
test('current display alias updates output title without invalidating saved evidence',()=>{
 const p=current(),before=resolveNodeOutput(p,{schemeNodeId:'correspondence'});p.purposeScheme.presentation={nodeTitles:{correspondence:'特徵核對'}};const after=resolveNodeOutput(p,{schemeNodeId:'correspondence'});assert.equal(after.title,'特徵核對');assert.equal(after.run.runId,before.run.runId);assert.equal(after.artifacts[0].sha256,before.artifacts[0].sha256);
});
