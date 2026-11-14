import {immutableJson,isImmutableJson} from './json-snapshot.js';
const key=ref=>`${ref?.queueId}:${ref?.archiveId}`;
const same=(a,b)=>a?.kind==='pending-inspection-unit'&&key(a)===key(b)&&a.executionId===b.executionId&&a.unitId===b.unitId;

// Replace only matching execution/unit references, including undo snapshots.
// A completion for a previous project must never be attached to the new one.
export function applyArchivedInspection(project,reference,receipt,timing){
 if(receipt?.status!=='SAVED'||receipt.recordRef?.executionId!==reference.executionId||receipt.recordRef?.unitId!==reference.unitId)throw Error('ARCHIVE_RECEIPT_IDENTITY_INVALID');
 const replace=(data,live=false)=>{
  if(!data)return data;let changed=false;
  const executions=(data.datasetExecutions||[]).map(execution=>{
   if(execution.id!==reference.executionId)return execution;
   let hit=false;const units=execution.units.map(unit=>{
    if(unit.unitId!==reference.unitId||!same(unit.archive?.reference,reference))return unit;
    hit=changed=true;return immutableJson({...unit,recordRef:receipt.recordRef,cycleTiming:{...unit.cycleTiming,persistence:receipt.timing},archive:{status:'SAVED',reference,timing}});
   });if(hit&&live&&!isImmutableJson(execution)){execution.units=units;return execution;}return hit?(isImmutableJson(execution)?immutableJson({...execution,units}):{...execution,units}):execution;
  });return changed?{...data,datasetExecutions:executions}:data;
 };
 const current=project.data,next=replace(current,true);if(next!==current)project.data.datasetExecutions=next.datasetExecutions;
 for(const name of ['undoStack','redoStack'])if(project[name])project[name]=project[name].map(replace);
 const selected=project.inspectionSelection;
 if(selected?.executionId===reference.executionId&&selected.unitId===reference.unitId&&same(selected.archive?.reference,reference))project.inspectionSelection={...selected,recordRef:receipt.recordRef,archive:{status:'SAVED',reference,timing}};
}
export function createInspectionArchive({invoke,project,onChange=()=>{},onError=()=>{}}){
 const pending=new Map(),resolved=new Map(),failed=new Map();let timer=null,polling=null,accepting=Promise.resolve(),disposed=false,pollDelay=16,notificationPending=false;
 const acceptStatus=async status=>{
  for(const item of status.items||[]){
   if(resolved.has(`${status.queueId}:${item.archiveId}`))continue;
   const reference=pending.get(`${status.queueId}:${item.archiveId}`)||{kind:'pending-inspection-unit',queueId:status.queueId,archiveId:item.archiveId,...item.identity};
   if(item.identity.executionId!==reference.executionId||item.identity.unitId!==reference.unitId)throw Error('ARCHIVE_STATUS_IDENTITY_INVALID');
   if(item.status==='SAVED'){
    applyArchivedInspection(project,reference,item.receipt,item.timing);
    // Keep retry ownership until the backend actually releases its receipt.
    await invoke('acknowledge_inspection_archive',{reference});
    resolved.set(key(reference),item.receipt.recordRef);pending.delete(key(reference));
    failed.delete(key(reference));
    // Bounded process-local redirects for reads already in flight. Project and
    // all undo/redo snapshots above now contain the actual durable reference.
    while(resolved.size>256)resolved.delete(resolved.keys().next().value);
   }else if(item.status==='FAILED'){failed.set(key(reference),reference);onError('歸檔失敗，檢測資料仍在記憶體中：'+item.error);}
  }
  onChange(status);
 };
 const accept=status=>{const task=accepting.then(()=>acceptStatus(status));accepting=task.catch(()=>{});return task;};
 const schedule=(delay=pollDelay)=>{clearTimeout(timer);if(!disposed&&[...pending.keys()].some(id=>!failed.has(id)))timer=setTimeout(()=>poll().catch(onError),delay);};
 const poll=()=>{
  if(polling)return polling;
  notificationPending=false;
  polling=invoke('inspection_archive_status').then(accept).then(value=>{pollDelay=16;return value;},error=>{pollDelay=250;throw error;}).finally(()=>{polling=null;schedule(notificationPending?0:pollDelay);});return polling;
 };
 return {
  notify({queueId}={}){
   if(disposed||![...pending.values()].some(ref=>ref.queueId===queueId))return;
   // The event is not a durable receipt. Re-read native state on the next task
   // so unit attachment has finished; preserve a hint received during a poll.
   notificationPending=true;if(!polling)schedule(0);
  },
  track(receipt){
   const ref=receipt?.archiveRef;
   if(receipt?.status!=='PENDING'||receipt.durable!==false||ref?.kind!=='pending-inspection-unit'||!Number.isSafeInteger(ref.archiveId)||!ref.queueId||!ref.executionId||!ref.unitId)throw Error('ARCHIVE_ADMISSION_INVALID');
   pending.set(key(ref),ref);
   // Native saving often finishes while the final response is being imported.
   // Check on the next task, after the runner attaches its unit summary; retain
   // the ordinary interval for unfinished work and the error backoff.
   schedule(pollDelay===16?0:pollDelay);return receipt;
  },
  async flush(){clearTimeout(timer);if(polling)await polling;await accept(await invoke('flush_inspection_archive'));schedule();},
  async resolve(reference){if(reference?.kind!=='pending-inspection-unit')return reference;if(!resolved.has(key(reference)))await this.flush();const ref=resolved.get(key(reference));if(!ref||ref.executionId!==reference.executionId||ref.unitId!==reference.unitId)throw Error('歸檔尚未完成或此記憶體記錄已失效');return {...ref,...(reference.runId?{runId:reference.runId}:{}),...(reference.artifactId?{artifactId:reference.artifactId}:{})};},
  async retry(reference){await invoke('retry_inspection_archive',{reference});failed.delete(key(reference));schedule();},
  async retryFailed(){for(const [id,reference]of failed){await this.retry(reference);failed.delete(id);}},
  poll,
  get pendingCount(){return pending.size;},
  dispose(){disposed=true;clearTimeout(timer);},
 };
}
