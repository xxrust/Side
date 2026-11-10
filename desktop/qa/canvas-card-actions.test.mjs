import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Workspace} from '../src/workspace.js';
import {schemeFingerprint} from '../src/purpose-compiler.js';
import {classifyWorkpiece} from '../src/classification-spec.js';
import {prepareProjectCanvases} from '../src/canvas-project-model.js';
const saved=JSON.parse(fs.readFileSync(new URL('../../codex-audit-logs/20261030-cards-mapping-stability/session-project-readonly.agentcv.json',import.meta.url)));
// Actual saved project, original human answers and actual runtime observations.
const project=()=>{const p=new Workspace();p.data=structuredClone(saved);return p};
const parts=p=>{const board=p.data.visualInquiry.boards.find(b=>b.projectSpaces),reference=board.projectSpaces.sources.find(s=>s.imageIds.every(id=>Object.values(p.purposeScheme.execution.referenceInputs).includes(id))),workpiece=board.projectSpaces.sources.find(s=>s.id!==reference.id);return {board,reference,workpiece}};
test('repairing a legacy reference-bound card preserves human answer provenance and all pixels/results',()=>{
 const p=project(),{board,reference,workpiece}=parts(p),card=board.projectSpaces.cards.find(c=>c.kind==='consultation'&&c.sourceId===reference.id),before=structuredClone(card.answerHistory),results=JSON.stringify(p.data.datasetExecutions),pixels=p.data.images.map(i=>i.dataURL);
 assert.ok(before.length);assert.throws(()=>p.addCanvasCard(board.id,{kind:'statistics',sourceId:reference.id}),/固定參考/);
 p.rebindCanvasCard(board.id,card.id,workpiece.id);const changed=p.canvasProjectContext(board.id).cards.find(c=>c.id===card.id);assert.equal(changed.sourceId,workpiece.id);assert.deepEqual(changed.answerHistory,before);assert.equal(JSON.stringify(p.data.datasetExecutions),results);assert.deepEqual(p.data.images.map(i=>i.dataURL),pixels);assert.doesNotThrow(()=>prepareProjectCanvases(JSON.parse(p.serialize())));
 assert.throws(()=>p.rebindCanvasCard(board.id,card.id,reference.id),/固定參考/);p.undo();assert.equal(p.canvasProjectContext(board.id).cards.find(c=>c.id===card.id).sourceId,reference.id);
});
test('card specification editing updates the actual classifier and invalidates previous statistics',()=>{
 const p=project(),{board,workpiece}=parts(p),card=board.projectSpaces.cards.find(c=>c.kind==='classification');p.rebindCanvasCard(board.id,card.id,workpiece.id);
 const spec=structuredClone(p.purposeScheme.classificationSpec),unit=p.data.datasetExecutions.flatMap(e=>e.units).find(u=>u.categoryId==='unmapped'&&u.recordRef),record=JSON.parse(fs.readFileSync(unit.recordRef.root+'/'+unit.recordRef.$asset)),observations=record.record.observations;
 assert.ok(observations,'actual negative observation exists');assert.equal(classifyWorkpiece(p.purposeScheme.classificationSpec,observations).categoryId,'unmapped');
 spec.categories.find(c=>c.id==='unmapped').label='無對應';const basis=schemeFingerprint(p.purposeScheme);
 const result=p.setCanvasClassificationSpec(board.id,card.id,{spec,expectedSchemeFingerprint:basis,reason:'驗證用戶能修改分類名稱，保持實測結果與規則'});assert.equal(result.requiresRegression,true);assert.equal(p.purposeScheme.classificationSpec.categories.find(c=>c.id==='unmapped').label,'無對應');assert.equal(classifyWorkpiece(p.purposeScheme.classificationSpec,observations).categoryId,'unmapped');assert.equal(p.canvasInspectionContext(workpiece.id).executionCurrent,false);
 const before=JSON.stringify(p.data);assert.throws(()=>p.setCanvasClassificationSpec(board.id,card.id,{spec,expectedSchemeFingerprint:basis,reason:'過期編輯'}),/方案已變更/);assert.equal(JSON.stringify(p.data),before);
 const invalid=structuredClone(spec);invalid.rules[0].categoryId='missing';assert.throws(()=>p.setCanvasClassificationSpec(board.id,card.id,{spec:invalid,expectedSchemeFingerprint:schemeFingerprint(p.purposeScheme),reason:'無效規則不能套用'}));assert.equal(JSON.stringify(p.data),before);
});
