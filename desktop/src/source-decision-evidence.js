import {sourceImageLabels} from './source-image-labels.js';
import {schemeFingerprint} from './purpose-compiler.js';
import {buildDecisionEvidence} from './decision-evidence.js';
import {workpieceArtifactPixel} from './workpiece-live-state.js';
const list=x=>Array.isArray(x)?x:[];
/** Read-only: inspecting a past result cannot select images or restore a live run. */
export async function loadSourceDecisionEvidence(project,{imageId,sourceId},records){
 const labels=sourceImageLabels(project,imageId,sourceId),base={labels,reasons:[],notExecuted:[]};
 if(!labels.last)return {...base,state:'WAITING',message:'此圖尚未檢測'};
 const entry=list(project.data.datasetExecutions).find(e=>e.id===labels.last.executionId),summary=list(entry?.units).find(u=>u.unitId===labels.last.unitId);
 let saved=null,record=summary,runs=list(project.data.algorithmRuns).filter(r=>list(summary?.runIds).includes(r.runId));
 if(summary?.recordRef){
  if(!records)return {...base,state:'UNAVAILABLE',message:'需桌面執行紀錄讀取器載入本件判定依據'};
  const current=project.inspectionSelection;
  const fresh=current?.executionId===entry.id&&current?.unitId===summary.unitId&&JSON.stringify(current.recordRef)===JSON.stringify(summary.recordRef)&&current.record?.runIds?.every(id=>runs.some(r=>r.runId===id));
  saved=fresh?{executionId:entry.id,record:current.record,runs}:await records.read(summary.recordRef);record=saved.record;runs=list(saved.runs);
  if(saved.executionId!==entry.id||record?.unitId!==summary.unitId||record?.schemeFingerprint!==entry.schemeFingerprint||JSON.stringify([...list(record?.imageIds)].sort())!==JSON.stringify([...list(summary.imageIds)].sort()))throw Error('判定依據紀錄與所選工件／執行不一致，未顯示其他圖片');
 }
 if(!record?.imageIds?.includes(imageId))throw Error('判定依據不屬於所選圖片');
 const currentImage=project.imageRecord?.(imageId)||project.data.images.find(i=>i.id===imageId);
 const input=runs.flatMap(r=>list(r.sourceBinding?.images)).find(i=>i.imageId===imageId);
 if(input?.contentSha256&&currentImage?.contentSha256&&input.contentSha256!==currentImage.contentSha256||input?.imageSha256&&currentImage?.sha256&&input.imageSha256!==currentImage.sha256)return {...base,state:'UNAVAILABLE',message:'原圖內容已變更，舊執行結果不能與目前原圖配對'};
 const scheme=[saved?.context?.scheme,saved?.scheme,entry?.scheme,entry?.schemeSnapshot,entry?.context?.scheme,project.data.purposeScheme].find(s=>s&&schemeFingerprint(s)===entry.schemeFingerprint);
 const model=record.decisionEvidence|| (scheme?buildDecisionEvidence(scheme,record,runs):null);
 if(!model)return {...base,state:'UNAVAILABLE',message:'此紀錄沒有保存判定依據或對應方案；請重新檢測'};
 if(model.unitId!==record.unitId||model.schemeFingerprint!==record.schemeFingerprint||!model.imageIds?.includes(imageId))throw Error('證據引用與本件紀錄不一致');
 // Resolve exactly one artifact on demand. Never load a whole dataset into RAM.
 const loadImage=async ref=>{
  const run=runs.find(r=>r.runId===ref.runId),a=run?.artifacts?.find(a=>a.id===ref.artifactId&&a.type==='image');
  if(!record.runIds?.includes(run?.runId)||run?.workpieceUnit?.id!==record.unitId||!run.workpieceUnit.imageIds?.includes(imageId)||!a||a.sha256!==ref.sha256)throw Error('證據圖來源驗證失敗');
  // The current workpiece keeps verified image bytes in a process-local cache.
  // Durable records may intentionally omit those bytes for performance; use
  // the live cache first so the current input still has its evidence image.
  const inline=a.dataURL||a.dataUrl||workpieceArtifactPixel(project,record.unitId,run.runId,a.id);
  if(inline)return inline;
  if(!summary.recordRef||!records)throw Error('此依據圖尚無可讀取的持久資產');
  const loaded=await records.artifact({...summary.recordRef,runId:run.runId,artifactId:a.id});return loaded.dataURL;
 };
 return {...base,...model,labels,state:model.status==='FAULT'?'FAULT':model.status==='CANCELLED'?'CANCELLED':model.reasons.length?'READY':'UNAVAILABLE',legacy:!record.decisionEvidence,loadImage,message:model.status==='CANCELLED'?'本次已取消，沒有有效分類結果':null};
}
