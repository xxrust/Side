import {schemeFingerprint} from './purpose-compiler.js';
import {algorithmRunCurrent} from './algorithm-workspace.js';
import {activeWorkpieceExecution,workpieceArtifactPixel,retainedWorkpieceOutput,completedWorkpiece} from './workpiece-live-state.js';
import {programScope} from './program-scope.js';
import {purposeNodeTitle} from './purpose-node-presentation.js';
import {artifactDisplayName} from './artifact-presentation.js';
const list=x=>Array.isArray(x)?x:[];

/** Outputs follow the exact workpiece + executable scheme. Automatic advance
 * prepares the next input while keeping the completed pair visible; manual
 * selection browses the selected image. Canvas position never picks a result. */
export function resolveNodeOutput(project,{schemeNodeId}={}){
 const data=project.data||project,scheme=data.purposeScheme,node=scheme?.operatorGraph?.nodes?.find(n=>n.id===schemeNodeId);
 const activeId=project.image?.id||data.activeId;
 const base={schemeNodeId,title:node?purposeNodeTitle(scheme,node):'節點輸出',imageId:activeId,run:null,artifacts:[],live:false,unitId:null,executionId:null,recordRef:null};
 const empty=(status,reason,extra={})=>({...base,status,reason,...extra,artifacts:[]});
 if(!node)return empty('WAITING','請選擇方案節點');
 const basis=schemeFingerprint(scheme),live=activeWorkpieceExecution(project);
 const completed=completedWorkpiece(project),display=completed?.schemeFingerprint===basis?completed:null;
 let unit,execution,displayRuns;
 const liveRun=live&&list(live.runIds).map(id=>list(data.algorithmRuns).find(r=>r.runId===id)).find(r=>r?.schemeNodeId===schemeNodeId);
 const latest=list(data.datasetExecutions).at(-1);
 if(display&&(live?.schemeFingerprint===basis&&!liveRun||!live&&latest?.id===display.executionId&&(latest.status==='RUNNING'||latest.processed>1))){
  unit=display.record;execution={id:display.executionId,status:'COMPLETED'};displayRuns=display.runs;base.imageId=unit.imageIds[0]||activeId;base.pendingUnitId=live?.unitId||null;
 }
 else if(live?.schemeFingerprint===basis){unit=live;execution={id:live.executionId,status:'RUNNING'};base.live=true;base.imageId=live.imageIds.includes(activeId)?activeId:live.imageIds[0]||activeId;}
 else {
  const executions=list(data.datasetExecutions).filter(e=>e.schemeFingerprint===basis);
  const retained=retainedWorkpieceOutput(project);
  if(retained?.schemeFingerprint===basis){
   execution=executions.find(e=>e.id===retained.executionId);
   unit=list(execution?.units).find(u=>u.unitId===retained.unitId&&list(u.imageIds).includes(retained.imageId));
   if(unit)base.imageId=retained.imageId;
  }else{
   execution=executions.findLast(e=>list(e.units).some(u=>list(u.imageIds).includes(activeId)));
   unit=list(execution?.units).findLast(u=>list(u.imageIds).includes(activeId));
  }
  // Restored durable records supply node states absent in compact summaries.
  const selected=project.inspectionSelection||data.inspectionSelection;
  if(selected&&execution&&unit&&selected.executionId===execution.id&&selected.unitId===unit.unitId&&selected.record?.schemeFingerprint===basis)unit={...unit,...selected.record};
 }
 if(!unit)return empty('WAITING','目前工件尚無這份方案的執行結果');
 Object.assign(base,{unitId:unit.unitId,executionId:execution.id,recordRef:unit.recordRef||unit.archive?.reference||null});
 const observed=list(unit.nodeStates).find(s=>s.nodeId===schemeNodeId),run=list(unit.runIds).map(id=>list(displayRuns||data.algorithmRuns).find(r=>r.runId===id)).find(r=>r?.schemeNodeId===schemeNodeId);
 if(observed?.status==='RUNNING')return empty('RUNNING','本節點正在執行');
 if(!run){
  if(['SKIPPED','PENDING','DECLARED'].includes(observed?.status))return empty(observed.status,observed.reason||'本件尚無此節點輸出');
  if(!base.live&&(unit.recordRef||unit.archive?.reference)&&list(unit.runIds).length)return empty('RESTORE_REQUIRED','正在讀取本件已保存的執行紀錄');
  return empty(observed?.status||'WAITING',observed?.reason||'等待本件節點產生輸出');
 }
 const sameIds=(a,b)=>list(a).length===list(b).length&&[...list(a)].sort().every((id,i)=>id===[...list(b)].sort()[i]);
 if(run.mode!=='scheme'||run.workpieceUnit?.id!==unit.unitId||!sameIds(run.workpieceUnit?.imageIds,unit.imageIds)||!list(unit.imageIds).every(id=>run.sourceBinding?.images?.some(b=>b.imageId===id)))return empty('STALE','本次產物與工件的來源綁定不一致；請重新執行');
 if(['SKIPPED','PENDING','DECLARED'].includes(observed?.status))return empty(observed.status,observed.reason||'本件尚無此節點輸出');
 const semantic=run.execution?.status==='FAULT'||run.status!=='SUCCEEDED'?'FAULT':run.result?.valid===false?'NOT_FOUND':'READY';
 let current=false;
 try{const context=typeof project.pixels?.get==='function'?project:{data,workflow:data.workflow,pixels:new Map()};current=algorithmRunCurrent(context,run);}catch{}
 if(!current)return empty('STALE','來源、參數或方案已改變；請重新執行');
 const scope=programScope(project,{programBinding:{runId:run.runId,nodeId:run.runId+'::run'}},run.runId);
 const hydrate=artifact=>{
  const dataURL=artifact.dataURL||artifact.dataUrl||workpieceArtifactPixel(project,unit.unitId,run.runId,artifact.id);
  return dataURL?{...artifact,dataURL,dataUrl:dataURL}:artifact;
 };
 const hydratedRun={...run,artifacts:list(run.artifacts).map(hydrate)};
 // Keep the primary output pane focused on declared result images. Diagnostic
 // and evidence rasters stay attached to the same current-workpiece run and
 // remain available in the process strip, but they must not replace the
 // clean result just because they are also PNG pixels.
 const scopedImages=list(hydratedRun.artifacts).filter(a=>a.type==='image'&&scope?.outputs.has(a.id));
 const expected=list(hydratedRun.expectedOutputs||run.expectedOutputs||run.expected_outputs);
 const roleOf=a=>a.role||a.outputRole||expected.find(item=>item?.id===a.id)?.role||'intermediate';
 const resultImages=scopedImages.filter(a=>['result','final','output'].includes(roleOf(a)));
 const artifacts=resultImages.length?resultImages:scopedImages;
 return {...base,run:hydratedRun,status:semantic,reason:semantic==='FAULT'?'本次執行故障':semantic==='NOT_FOUND'?'本次未找到所需目標':artifacts.length?'本件已完成輸出':'本節點未聲明圖像輸出接口',artifacts};
}

export function outputImageReference(model,artifact){
 if(!model.run||!model.artifacts.some(a=>a.id===artifact.id&&a.sha256===artifact.sha256))throw Error('輸出已變更，請重新選擇圖像');
 artifact=model.artifacts.find(a=>a.id===artifact.id&&a.sha256===artifact.sha256);
 const dataURL=artifact.dataURL||artifact.dataUrl;
 if(!dataURL&&artifact.pixelRetention==='metadata-only')throw Error('此批次只保留產物摘要；需要像素時請重跑此工件或改用完整圖像保留');
 if(!dataURL)throw Error('本次圖像仍在載入，不能引用舊圖');
 return {label:artifactDisplayName(artifact),kind:'stage',dataURL,width:artifact.width,height:artifact.height,source:{kind:'algorithm-output',runId:model.run.runId,artifactId:artifact.id,artifactSha256:artifact.sha256,codeSha256:model.run.codeSha256,schemeNodeId:model.schemeNodeId,unitId:model.unitId,executionId:model.executionId,coordinateSpace:'algorithm-output-pixels',sourceBindings:model.run.sourceBinding}};
}
