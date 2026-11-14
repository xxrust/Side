import test from 'node:test';
import assert from 'node:assert/strict';
import {readCompleteInspectionRun,inspectionRunReference} from '../src/inspection-run-details.js';
function fixture(){
 const reference={executionId:'e',unitId:'u',sha256:'verified-by-record-service'};
 const full={runId:'r',workpieceUnit:{id:'u',imageIds:['i']},sourceBinding:{images:[{imageId:'i',contentSha256:'original'}]},codeSha256:'code',procedureTrace:{nodes:[{instanceId:'step#1',outputs:{model:[1,2,3]}}]}};
 const run={...structuredClone(full),procedureTrace:{nodes:[{instanceId:'step#1',outputs:{model:{deferred:true}}}]},deferredProcedureTrace:{schema:'agentcv-deferred-procedure-trace-1',runId:'r',unitId:'u',executionId:'e'}};
 const project={epoch:1,data:{algorithmRuns:[run],datasetExecutions:[{id:'e',units:[{unitId:'u',runIds:['r'],recordRef:reference}]}]}};
 const saved={executionId:'e',record:{unitId:'u',runIds:['r']},runs:[full]};
 return {project,run,full,reference,saved};
}
test('complete reads preserve hot summaries and later explanation revisions',async()=>{
 const {project,run,full,reference,saved}=fixture();run.evidenceRevisions=[{parameterNotes:'later explanation'}];
 const before=JSON.stringify(project);const result=await readCompleteInspectionRun(project,run,{read:async ref=>{assert.equal(ref,reference);return saved;}});
 assert.deepEqual(result.run.procedureTrace,full.procedureTrace);assert.equal(result.run.evidenceRevisions,run.evidenceRevisions);assert.equal(JSON.stringify(project),before);
});
test('pending archive references resolve through the same record service',async()=>{
 const {project,run,saved}=fixture(),unit=project.data.datasetExecutions[0].units[0];
 unit.archive={status:'PENDING',reference:{...unit.recordRef,kind:'pending-inspection-unit'}};unit.recordRef=null;
 assert.equal(inspectionRunReference(project,'r'),unit.archive.reference);
 await readCompleteInspectionRun(project,run,{read:async ref=>{assert.equal(ref.kind,'pending-inspection-unit');return saved;}});
});
test('ordinary complete runs need no archive read',async()=>{
 const {project,full}=fixture();assert.equal((await readCompleteInspectionRun(project,full,{read:()=>assert.fail('unexpected read')})).run,full);
});
test('wrong execution, unit, run membership, source, code and incomplete archives reject',async()=>{
 const mutations=[s=>s.executionId='other',s=>s.record.unitId='other',s=>s.record.runIds=[],s=>s.runs[0].runId='other',s=>s.runs[0].sourceBinding.images[0].contentSha256='changed',s=>s.runs[0].codeSha256='changed',s=>s.runs[0].deferredProcedureTrace={}];
 for(const mutate of mutations){const {project,run,saved}=fixture();mutate(saved);await assert.rejects(readCompleteInspectionRun(project,run,{read:async()=>saved}),/封存程序證據|來源不一致/);}
});
test('project replacement, epoch change, run replacement and caller cancellation reject late reads',async()=>{
 for(const change of ['data','epoch','run','caller']){
  const {project,run,saved}=fixture();let release,valid=true;
  const task=readCompleteInspectionRun(project,run,{read:()=>new Promise(resolve=>release=resolve)},{isCurrent:()=>valid});
  if(change==='data')project.data={...project.data};if(change==='epoch')project.epoch++;if(change==='run')project.data.algorithmRuns=[{...run}];if(change==='caller')valid=false;
  release(saved);await assert.rejects(task,/已變更/);
 }
});
test('missing or forged deferred provenance never falls back to summary values',async()=>{
 const {project,run}=fixture();run.deferredProcedureTrace.runId='wrong';await assert.rejects(readCompleteInspectionRun(project,run,{}),/身份無效/);
 run.deferredProcedureTrace.runId='r';project.data.datasetExecutions=[];await assert.rejects(readCompleteInspectionRun(project,run,{}),/尚無可讀取/);
});
