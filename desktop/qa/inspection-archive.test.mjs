import test from 'node:test';
import assert from 'node:assert/strict';
import {applyArchivedInspection,createInspectionArchive} from '../src/inspection-archive.js';
import {immutableJson,projectSnapshot} from '../src/json-snapshot.js';
import {AppSession} from '../src/app-session.js';
import {createInspectionRecords} from '../src/inspection-records.js';
const reference={kind:'pending-inspection-unit',queueId:'actual-process',archiveId:1,executionId:'actual-execution',unitId:'actual-unit'};
const receipt={status:'SAVED',recordRef:{executionId:'actual-execution',unitId:'actual-unit',sha256:'real-record-hash'}};
function specimen(){const unit=immutableJson({unitId:'actual-unit',recordRef:null,archive:{status:'PENDING',reference},imageIds:['original']});const entry={id:'actual-execution',processed:1,units:[unit]};const data={datasetExecutions:[entry]};return {data,undoStack:[projectSnapshot(data)],redoStack:[projectSnapshot(data)],inspectionSelection:{executionId:'actual-execution',unitId:'actual-unit',archive:{reference}}};}
test('archive completion replaces only exact references and keeps the live runner entry attached',()=>{
 const p=specimen(),entry=p.data.datasetExecutions[0],old=p.undoStack[0];
 applyArchivedInspection(p,reference,receipt,{writeMs:12});
 assert.equal(p.data.datasetExecutions[0],entry);entry.processed++;
 assert.equal(p.data.datasetExecutions[0].processed,2);assert.deepEqual(entry.units[0].recordRef,receipt.recordRef);
 assert.ok(Object.isFrozen(entry.units[0]));assert.equal(old.datasetExecutions[0].units[0].recordRef,null);
 assert.deepEqual(p.undoStack[0].datasetExecutions[0].units[0].recordRef,receipt.recordRef);assert.deepEqual(p.redoStack[0].datasetExecutions[0].units[0].recordRef,receipt.recordRef);
 assert.deepEqual(p.inspectionSelection.recordRef,receipt.recordRef);
 const other=specimen();other.data.datasetExecutions[0].id='another-execution';other.inspectionSelection=null;other.undoStack=[];other.redoStack=[];
 applyArchivedInspection(other,reference,receipt,{});assert.equal(other.data.datasetExecutions[0].units[0].recordRef,null);
 assert.throws(()=>applyArchivedInspection(p,reference,{status:'SAVED',recordRef:{...receipt.recordRef,unitId:'wrong'}},{}),/IDENTITY/);
});
test('detection admission is separate from persistence; explicit history read drains and resolves',async()=>{
 const p=specimen(),commands=[];let saved=false;
 const invoke=async(command,args)=>{commands.push(command);if(command==='flush_inspection_archive')saved=true;
  if(command==='inspection_archive_status'||command==='flush_inspection_archive')return {queueId:'actual-process',items:[{archiveId:1,identity:{executionId:reference.executionId,unitId:reference.unitId},status:saved?'SAVED':'PENDING',receipt:saved?receipt:null,timing:{writeMs:5}}]};
  if(command==='read_inspection_unit'){assert.deepEqual(args.reference,receipt.recordRef);return {record:{unitId:reference.unitId}};}
 };
 const archive=createInspectionArchive({invoke,project:p});
 try{
  archive.track({status:'PENDING',durable:false,archiveRef:reference});assert.equal(archive.pendingCount,1);assert.equal(commands.length,0);
  await archive.poll();assert.equal(p.data.datasetExecutions[0].units[0].recordRef,null);assert.equal(commands.includes('acknowledge_inspection_archive'),false);
  const records=createInspectionRecords(invoke,archive);await records.read(reference);
  assert.equal(archive.pendingCount,0);assert.ok(commands.indexOf('flush_inspection_archive')<commands.indexOf('read_inspection_unit'));
  assert.deepEqual(await archive.resolve({...reference,runId:'run',artifactId:'measurement'}),{...receipt.recordRef,runId:'run',artifactId:'measurement'});
 }finally{archive.dispose();}
});
test('failed archive keeps pending identity and blocks snapshot until retry succeeds',async()=>{
 const p=specimen(),errors=[];let fails=true;
 const archive=createInspectionArchive({project:p,onError:e=>errors.push(e),invoke:async command=>{
  if(command==='retry_inspection_archive'){fails=false;return;}
  if(command==='flush_inspection_archive'&&fails)throw Error('ACTUAL_WRITE_FAILURE');
  return {queueId:reference.queueId,items:[{archiveId:1,identity:{executionId:reference.executionId,unitId:reference.unitId},status:fails?'FAILED':'SAVED',error:'ACTUAL_WRITE_FAILURE',receipt:fails?null:receipt}]};
 }});
 let writes=0;const session=new AppSession({store:{read:async()=>null,write:async()=>{writes++;}},capture:()=>({project:p.data,ui:{}}),beforeCapture:async()=>archive.flush()});
 try{
  archive.track({status:'PENDING',durable:false,archiveRef:reference});await archive.poll();assert.equal(errors.length,1);
  await assert.rejects(session.flush(),/ACTUAL_WRITE_FAILURE/);assert.equal(writes,0);assert.equal(p.data.datasetExecutions[0].units[0].recordRef,null);
  await archive.retryFailed();await session.flush();assert.equal(writes,1);assert.equal(archive.pendingCount,0);
 }finally{archive.dispose();clearTimeout(session.timer);}
});
test('failed acknowledgement remains owned and retries without leaking completed queue slots',async()=>{
 const p=specimen();let attempts=0;
 const archive=createInspectionArchive({project:p,invoke:async command=>{
  if(command==='acknowledge_inspection_archive'){if(++attempts===1)throw Error('ACK_REPLY_LOST');return;}
  return {queueId:reference.queueId,items:[{archiveId:1,identity:{executionId:reference.executionId,unitId:reference.unitId},status:'SAVED',receipt}]};
 }});
 try{
  archive.track({status:'PENDING',durable:false,archiveRef:reference});
  await assert.rejects(archive.poll(),/ACK_REPLY_LOST/);assert.equal(archive.pendingCount,1);
  assert.deepEqual(p.data.datasetExecutions[0].units[0].recordRef,receipt.recordRef);
  await Promise.all([archive.flush(),archive.flush()]);assert.equal(attempts,2);assert.equal(archive.pendingCount,0);
  assert.deepEqual(await archive.resolve(reference),receipt.recordRef);
 }finally{archive.dispose();}
});
