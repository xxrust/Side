import {jsonDataEqual} from './json-data-equal.js';

export function inspectionRunReference(project,runId){
 for(const execution of [...(project.data.datasetExecutions||[])].reverse()){
  const unit=execution.units?.find(unit=>unit.runIds?.includes(runId));
  const reference=unit?.recordRef||(unit?.archive?.status==='PENDING'?unit.archive.reference:null);
  if(reference)return reference;
 }
 return null;
}

// Return a complete private read, without expanding the project's hot history.
// The archive service resolves pending receipts and verifies persisted bytes.
export async function readCompleteInspectionRun(project,run,records,{isCurrent=()=>true}={}){
 if(run?.deferredProcedureTrace===undefined)return {run};
 const marker=run.deferredProcedureTrace;
 if(marker?.schema!=='agentcv-deferred-procedure-trace-1'||marker.runId!==run.runId||marker.unitId!==run.workpieceUnit?.id)throw Error('延後讀取的程序證據身份無效');
 const data=project.data,epoch=project.epoch;
 const current=()=>{
  if(project.data!==data||project.epoch!==epoch||!isCurrent()||!data.algorithmRuns?.includes(run))throw Error('專案或運算已變更，未採用舊的程序證據');
 };
 current();
 const reference=inspectionRunReference(project,run.runId);
 if(!reference||reference.unitId!==marker.unitId||reference.executionId!==marker.executionId)throw Error('完整程序證據尚無可讀取的封存引用');
 if(!records?.read)throw Error('單件結果儲存未連接');
 const saved=await records.read(reference);current();
 const complete=saved.runs?.find(item=>item.runId===run.runId);
 if(saved.executionId!==reference.executionId||saved.record?.unitId!==reference.unitId||!saved.record.runIds?.includes(run.runId)||!complete)throw Error('封存程序證據不屬於指定工件或運算');
 if(complete.deferredProcedureTrace!==undefined||!jsonDataEqual(complete.workpieceUnit,run.workpieceUnit)||!jsonDataEqual(complete.sourceBinding,run.sourceBinding)||complete.codeSha256!==run.codeSha256)throw Error('完整程序證據與目前運算來源不一致');
 // Preserve later authored explanations without changing original observations.
 return {run:{...complete,...(run.evidenceRevisions?{evidenceRevisions:run.evidenceRevisions}:{})},reference};
}
