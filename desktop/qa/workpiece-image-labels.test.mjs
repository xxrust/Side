import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {Workspace} from '../src/workspace.js';
import {resolveWorkpieceExpected} from '../src/workpiece-expected-label.js';
import {runDatasetScheme} from '../src/workpiece-runner.js';
import {decodeBenchmarkImage} from '../scripts/agentcv-benchmark-batch.mjs';
const root=path.resolve(import.meta.dirname,'..'),audit=path.resolve(root,'../codex-audit-logs/20261031-source-label-regression'),saved=JSON.parse(await fs.readFile(path.join(audit,'session-project-readonly.agentcv.json'),'utf8'));
const referenceIds=new Set(Object.values(saved.purposeScheme.execution.referenceInputs)),images=saved.images.filter(i=>!referenceIds.has(i.id)),sourceId=saved.visualInquiry.boards.flatMap(b=>b.projectSpaces?.sources||[]).find(s=>s.imageIds.includes(images[0].id)&&s.imageIds.includes(images[1].id)).id;
test('real saved legacy human OK/NG answers resolve only through unique declared quality; never through filenames or detections',()=>{
 assert.deepEqual(images.map(i=>i.expected.status),['OK','NG']);assert.deepEqual(images.map(i=>resolveWorkpieceExpected(saved,{id:i.id,imageIds:[i.id]}).expected.categoryIds),[['mapped'],['unmapped']]);
 const p=structuredClone(saved);p.purposeScheme.classificationSpec.categories.push({id:'other-good',label:'另一良品分檔',quality:'good'});assert.equal(resolveWorkpieceExpected(p,{id:images[0].id,imageIds:[images[0].id]}).reason,'EXPECTED_QUALITY_CATEGORY_AMBIGUOUS');
 assert.equal(resolveWorkpieceExpected(saved,{id:'multiple-views',imageIds:images.map(i=>i.id)}).reason,'MULTIVIEW_REQUIRES_WORKPIECE_EXPECTED');
 assert.equal(resolveWorkpieceExpected(saved,{id:images[0].id,imageIds:[images[0].id],expected:null}).reason,'EXPLICITLY_UNLABELLED');
 p.images.find(i=>i.id===images[1].id).expected.source='agent';assert.equal(resolveWorkpieceExpected(p,{id:images[1].id,imageIds:[images[1].id]}).reason,'EXPECTED_SOURCE_UNCONFIRMED');
});
test('human confirmed source labels are canonical expected answers without a second applyLabels path, while unmapped labels stay explicit',()=>{
 const p=structuredClone(saved),mapped=p.images.find(i=>i.id===images[0].id),label=p.purposeScheme.classificationSpec.categories.find(c=>c.id==='mapped').label;
 mapped.expected={};mapped.sourceMeaning={actor:'human',taskId:'import-1',relativePath:'窄圖/box.png',fields:{category:label}};
 const resolved=resolveWorkpieceExpected(p,{id:mapped.id,imageIds:[mapped.id]});
 assert.deepEqual(resolved.expected.categoryIds,['mapped']);assert.equal(resolved.origin.kind,'image-source-meaning');
 const unmapped=p.images.find(i=>i.id===images[1].id);unmapped.expected={};unmapped.sourceMeaning={actor:'human',taskId:'import-2',relativePath:'未焊/part.bmp',fields:{category:'未焊'}};
 const missing=resolveWorkpieceExpected(p,{id:unmapped.id,imageIds:[unmapped.id]});assert.equal(missing.expected,null);assert.equal(missing.reason,'EXPECTED_SOURCE_LABEL_UNMAPPED');assert.equal(missing.origin.label,'未焊');
});
test('shared image-answer API saves scoped explicit category and provenance, clears, and rejects ambiguous quality or stale content',async()=>{
 const p=new Workspace();await p.load(saved,decodeBenchmarkImage);const image=images[0];const answer=p.setImageExpectedClassification(image.id,{categoryId:'mapped',reason:'本輪測試由已保存人工OK標記改成相同明確類別'});assert.equal(answer.provenance.type,'human');assert.deepEqual(p.resolveImageExpectedClassification(image.id).expected.categoryIds,['mapped']);
 const q=new Workspace();await q.load(JSON.parse(p.serialize()),decodeBenchmarkImage);assert.deepEqual(q.resolveImageExpectedClassification(image.id).expected.categoryIds,['mapped']);
 q.imageRecord(image.id).contentSha256='0'.repeat(64);assert.equal(q.resolveImageExpectedClassification(image.id).reason,'EXPECTED_IMAGE_CONTENT_CHANGED');
 q.setImageExpectedClassification(image.id,null);assert.equal(q.resolveImageExpectedClassification(image.id).expected,null);
 p.purposeScheme.classificationSpec.categories.push({id:'other-good',label:'另一良品分檔',quality:'good'});assert.throws(()=>p.setImageExpectedClassification(image.id,{status:'OK'}),/多個類別/);
 p.purposeScheme.classificationSpec.categories.find(c=>c.id==='mapped').quality='bad';assert.equal(p.resolveImageExpectedClassification(image.id).reason,'EXPECTED_CATEGORY_QUALITY_CHANGED');
});
test('image import can save a human quality answer before any classification spec exists',async()=>{
 const p=new Workspace();await p.load(saved,decodeBenchmarkImage);const scheme=structuredClone(p.purposeScheme);p.data.purposeScheme=null;const answer=p.setImageExpectedClassification(images[0].id,{status:'OK',reason:'導入時已知良品'});assert.equal(answer.provenance.basis,'human-overall-quality-before-classification');assert.equal(answer.categoryIds,undefined);assert.equal(p.resolveImageExpectedClassification(images[0].id).reason,'EXPECTED_QUALITY_CATEGORY_UNDEFINED');p.data.purposeScheme=scheme;const resolved=p.resolveImageExpectedClassification(images[0].id);assert.deepEqual(resolved.expected.categoryIds,['mapped']);assert.equal(resolved.expected.provenance.ref,answer.provenance.ref);
});
test('real saved full scheme consumes source image answers in sequential Python execution and retains distinct decision/cycle timings',async()=>{
 const p=new Workspace();await p.load(saved,decodeBenchmarkImage);const original=JSON.stringify(p.data.images.map(i=>i.expected)),dir=await fs.mkdtemp(path.join(audit,'actual-run-')),receipts=[];
 const execute=async request=>{const output=await fs.mkdtemp(path.join(dir,'node-'));await fs.writeFile(path.join(output,'request.json'),JSON.stringify({...request,runId:randomUUID()}));await new Promise((resolve,reject)=>{const child=spawn(path.join(root,'runtime/python/bin/python3'),[path.join(root,'scripts/cv-runtime.py'),'--run',path.join(output,'request.json'),output],{env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});let stderr='';child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>code?reject(Error(stderr)):resolve());});return JSON.parse(await fs.readFile(path.join(output,'result.json'),'utf8'));};
 const outcome=await runDatasetScheme(p,execute,{sourceId,artifactMode:'inline',saveUnitResult:async payload=>{const file=path.join(dir,payload.unit.id+'.json');await fs.writeFile(file,JSON.stringify(payload));receipts.push(payload);return {recordRef:{unitId:payload.unit.id,executionId:payload.executionId,path:file}};}});
 const e=outcome.execution,r=e.counts.regression;assert.equal(e.processed,2);assert.equal(e.counts.execution.FAULT,0);assert.equal(r.labelled,2);assert.equal(r.unlabelled,0);assert.equal(r.coverage.ratio,1);assert.equal(r.matched+r.mismatched,2);assert.equal(Object.values(e.counts.categories).reduce((a,b)=>a+b,0),2);assert.deepEqual(receipts.map(p=>p.record.regression.expected),[['mapped'],['unmapped']]);assert.ok(receipts.every(p=>p.record.regression.expectedProvenance.basis==='legacy-saved-overall-image-label'));
 assert.ok(e.units.every(u=>u.cycleTiming.totalMs>=u.timing.totalMs&&u.cycleTiming.includes.includes('durable-save')));assert.equal(e.timing.cycleMs.count,2);assert.equal(e.timing.cycleIncludesDurableSave,true);assert.ok(e.timing.cycleMs.mean>=e.timing.unitMs.mean);assert.ok(receipts.every(p=>p.record.cycleTiming===undefined),'durable payload cannot know its future completed-save duration');assert.equal(JSON.stringify(p.data.images.map(i=>i.expected)),original,'original labels are not rewritten by execution');
 await fs.writeFile(path.join(dir,'execution.json'),JSON.stringify(e,null,2));await fs.writeFile(path.join(dir,'completed.agentcv.json'),p.serialize());await fs.writeFile(path.join(audit,'latest-real-result.json'),JSON.stringify({directory:dir,executionId:e.id,sourceId,regression:r,decisionMs:e.timing.unitMs,cycleMs:e.timing.cycleMs,units:e.units.map(u=>({imageIds:u.imageIds,categoryId:u.categoryId,expected:u.expectedClassification,regression:u.regression,cycleTiming:u.cycleTiming}))},null,2));
 // The toolbar's explicit single-image unit also reads the same source label.
 const single=await runDatasetScheme(p,execute,{sourceId,units:[{id:images[0].id,imageIds:[images[0].id]}]});assert.equal(single.execution.timing.cycleIncludesDurableSave,false);assert.equal(single.execution.counts.regression.labelled,1);assert.deepEqual(single.execution.units[0].regression.expected,['mapped']);
});

test('cleared canvas sources cannot resurrect detached historical originals during implicit dataset execution',async()=>{
 const p=new Workspace();await p.load(saved,decodeBenchmarkImage);for(const board of p.data.visualInquiry.boards)for(const source of board.projectSpaces?.sources||[])if(source.imageIds.length)p.removeCanvasSourceImages(board.id,source.id,[...source.imageIds]);
 const before=JSON.stringify(p.data.images),outcome=await runDatasetScheme(p,()=>{throw Error('a removed original must not dispatch');});assert.equal(outcome.execution.total,0);assert.equal(outcome.execution.processed,0);assert.equal(JSON.stringify(p.data.images),before);assert.equal(p.data.images.length,saved.images.length);
});
