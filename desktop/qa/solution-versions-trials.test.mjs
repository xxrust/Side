import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {Workspace} from '../src/workspace.js';
import {decodeBenchmarkImage} from '../scripts/agentcv-benchmark-batch.mjs';
import {captureTrialSnapshot,completeTrialSnapshot} from '../src/solution-versions-trials.js';
const canonical=value=>JSON.parse(JSON.stringify(value,function(k,v){return k==='dataUrl'&&typeof v==='string'&&v.startsWith('data:')&&this.dataURL===v?undefined:v;}));
const fixture=JSON.parse(await fs.readFile(new URL('../../reviews/2026-10-27-program-flow/actual-pi-workspace-portable.agentcv.json',import.meta.url),'utf8'));
test('actual Pi trial snapshot keeps pre-computation inputs while merging only its actual result',()=>{
 const baseline=structuredClone(fixture),project={data:baseline,epoch:3},capture=captureTrialSnapshot(project,JSON.stringify(baseline),{label:'真實 Pi 重播',type:'program'}),run=baseline.algorithmRuns.at(-1);
 const originalName=baseline.images[0].name;project.data.images[0].name='運算途中另改的名稱';project.data.workflow.revision=9001;
 const receipt=completeTrialSnapshot(capture,{run}),saved=JSON.parse(receipt.content);
 assert.equal(saved.images[0].name,originalName);assert.notEqual(saved.workflow.revision,9001);assert.deepEqual(saved.algorithmRuns.at(-1),canonical(run));assert.equal(saved.historyTrial.id,run.runId);assert.equal(saved.historyTrial.status,run.status);
});
test('pipeline result merge does not carry later image labels or unrelated board changes',()=>{
 const baseline=structuredClone(fixture),project={data:baseline,epoch:1},capture=captureTrialSnapshot(project,baseline,{type:'pipeline'}),image=baseline.images[0],actualRun=baseline.algorithmRuns.at(-1);
 // Reuse recorded real outputs; this checks capture ownership, not fabricated CV.
 const result={runId:actualRun.runId,artifacts:actualRun.artifacts};image.name='later UI edit';
 const saved=JSON.parse(completeTrialSnapshot(capture,{imageResults:[{imageId:image.id,fields:{pipelineResult:result}}],runId:result.runId}).content);
 assert.notEqual(saved.images[0].name,'later UI edit');assert.deepEqual(saved.images[0].pipelineResult,canonical(result));assert.deepEqual(saved.visualInquiry,canonical(capture.snapshot.visualInquiry));
});

const {realHistoryProject}=await import('./real-history-project.mjs');
const completed=await realHistoryProject();
const actualAcceptance=completed.purposeAcceptance,actualRuns=actualAcceptance.runIds.map(id=>completed.algorithmRuns.find(r=>r.runId===id));
function schemeCapture(){const before=structuredClone(completed);before.algorithmRuns=before.algorithmRuns.filter(r=>!actualAcceptance.runIds.includes(r.runId));const live={data:before,epoch:7};return {live,capture:captureTrialSnapshot(live,before,{type:'purpose-scheme',label:'真實雙節點整圖試算'})};}
test('complete real two-node scheme trial restores both dependencies, original pixels and actual result images without later edits',async()=>{
 assert.equal(actualRuns.length,2);assert.ok(actualRuns.every(r=>r.status==='SUCCEEDED'));
 const {live,capture}=schemeCapture(),originalName=capture.snapshot.images[0].name;
 live.data.images[0].name='run finished後的無關修改';live.data.purposeScheme.purposeCard.items[0].label='不應混入Git快照的後改目的';live.data.workflow.revision+=1000;
 const receipt=completeTrialSnapshot(capture,{runs:actualRuns,purposeAcceptance:actualAcceptance}),saved=JSON.parse(receipt.content),restored=new Workspace();await restored.load(saved,decodeBenchmarkImage);
 assert.equal(saved.images[0].name,originalName);assert.notEqual(saved.purposeScheme.purposeCard.items[0].label,live.data.purposeScheme.purposeCard.items[0].label);assert.deepEqual(saved.algorithmRuns.slice(-2),canonical(actualRuns));assert.deepEqual(saved.purposeAcceptance,actualAcceptance);assert.equal(saved.purposeAcceptance.status,'PASS');
 assert.deepEqual(saved.historyTrial.runIds,actualAcceptance.runIds);assert.equal(receipt.runId,actualRuns.at(-1).runId);assert.equal(saved.historyTrial.id,actualRuns.at(-1).runId);assert.equal(saved.historyTrial.status,'SUCCEEDED');
 const second=restored.data.algorithmRuns.at(-1),first=restored.data.algorithmRuns.at(-2);assert.equal(second.upstreamBindings.sizes.runId,first.runId);assert.ok(first.artifacts.some(a=>a.id===second.upstreamBindings.sizes.artifactId));
 for(const run of restored.data.algorithmRuns.slice(-2))for(const artifact of run.artifacts.filter(a=>a.type==='image')){const bytes=Buffer.from((artifact.dataUrl||artifact.dataURL).split(',')[1],'base64');assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);}
 for(const image of saved.images)assert.equal(image.dataURL,capture.snapshot.images.find(i=>i.id===image.id).dataURL);
});
test('scheme snapshots preserve undefined acceptance, explicitly remove null acceptance, and never inherit a historical PASS after error',()=>{
 const {capture}=schemeCapture();assert.equal(capture.snapshot.purposeAcceptance.status,'PASS');
 const unchanged=JSON.parse(completeTrialSnapshot(capture,{runs:actualRuns}).content);assert.deepEqual(unchanged.purposeAcceptance,capture.snapshot.purposeAcceptance);
 const revoked=JSON.parse(completeTrialSnapshot(capture,{runs:[],purposeAcceptance:null,error:new Error('Actual scheme compilation rejected before dispatch')}).content);assert.equal(Object.hasOwn(revoked,'purposeAcceptance'),false);assert.equal(revoked.historyTrial.status,'FAILED');assert.deepEqual(revoked.historyTrial.runIds,[]);assert.deepEqual(revoked.algorithmRuns,canonical(capture.snapshot.algorithmRuns));
});
test('missing true upstream or an actual failed Python run cannot archive an apparently passing scheme',async()=>{
 const {capture}=schemeCapture(),partial=JSON.parse(completeTrialSnapshot(capture,{runs:[actualRuns[1]],purposeAcceptance:actualAcceptance}).content);
 assert.equal(partial.purposeAcceptance.status,'STALE');assert.equal(partial.purposeAcceptance.snapshotIntegrity.claimedStatus,'PASS');assert.ok(partial.purposeAcceptance.snapshotIntegrity.errors.some(e=>e.code==='TRIAL_UPSTREAM_UNAVAILABLE'));assert.equal(partial.historyTrial.status,'INCOMPLETE');assert.deepEqual(partial.historyTrial.runIds,[actualRuns[1].runId]);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-trial-history-failure-')),desktop=path.resolve(new URL('..',import.meta.url).pathname),runId=randomUUID(),code='raise RuntimeError("actual history persistence failure probe")';
 const sourceBinding=actualRuns[0].sourceBinding,images=sourceBinding.images.map(source=>{const image=completed.images.find(i=>i.id===source.imageId);return {id:image.id,name:image.name,dataUrl:image.dataURL,width:image.width,height:image.height,source}}),request={runId,code,parameters:{},images,sourceBinding};
 await fs.writeFile(path.join(dir,'request.json'),JSON.stringify(request));
 const output=await new Promise((resolve,reject)=>{const child=spawn(path.join(desktop,'runtime/python/bin/python3'),[path.join(desktop,'scripts/cv-runtime.py'),'--run',path.join(dir,'request.json'),dir],{env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',status=>status?reject(Error(stderr)):resolve(JSON.parse(stdout)))});
 const actualFailed={...JSON.parse(await fs.readFile(output.resultFile,'utf8')),code,sourceBinding};assert.equal(actualFailed.status,'FAILED');
 const failed=JSON.parse(completeTrialSnapshot(capture,{runs:[actualFailed],purposeAcceptance:{...actualAcceptance,runIds:[actualFailed.runId]}}).content);assert.equal(failed.historyTrial.status,'FAILED');assert.notEqual(failed.purposeAcceptance.status,'PASS');assert.ok(failed.purposeAcceptance.snapshotIntegrity.errors.some(e=>e.code==='TRIAL_RUN_NOT_SUCCEEDED'));assert.equal(failed.algorithmRuns.at(-1).runId,actualFailed.runId);
});
