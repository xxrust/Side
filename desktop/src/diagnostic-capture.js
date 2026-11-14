export function diagnosticRerun(run){
 if(run?.procedureTrace?.capture?.mode!=='essential')return null;
 const unit=run.workpieceUnit,fingerprint=run.compilation?.schemeFingerprint;
 return {status:'NOT_CAPTURED',scope:'日常檢測未採集完整診斷資料。診斷重跑建立新的觀測，不是恢復歷史快照。',
  ...(unit?.imageIds?.length&&fingerprint?{tool:'run_workpiece_scheme',arguments:{image_ids:[...unit.imageIds],...(unit.views?{views_json:JSON.stringify(unit.views)}:{}),diagnostics:true,expected_scheme_fingerprint:fingerprint}}:{available:false,reason:'缺少明確工件或方案身份，請先讀取完整運算紀錄'}),
  originalRunId:run.runId};
}
export const isUncapturedProcedureValue=value=>value?.schema==='agentcv-uncaptured-procedure-value-1'&&value.status==='NOT_CAPTURED';

export const isUncapturedArtifact=value=>value?.type==='json'&&value.section!=='boundary'&&value.storage==='not-captured'&&value.hostCollectionVerified===true&&value.hostBytesVerified===false
 &&value.collection?.schema==='agentcv-artifact-capture-1'&&value.collection.status==='NOT_CAPTURED'&&value.collection.reason==='routine-inspection'&&value.collection.recovery==='rerun-selected-workpiece-with-diagnostics'&&Object.keys(value.collection).length===4
 &&['sha256','bytes','data','path','assetRef','memoryRef','dataUrl','dataURL','residentJson'].every(key=>!Object.hasOwn(value,key));
