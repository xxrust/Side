// Large execution products live outside the project document. UI and Agent use
// these exact references; a failed write never becomes a successful regression.
import {workpieceArtifactPixel} from './workpiece-live-state.js';
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value,(key,item)=>['dataURL','dataUrl','base64'].includes(key)?undefined:item));
export function durableInspectionProduct(product){
 const value=copy(product);
 const inlineImages=new Map();for(const run of product.runs||[])for(const artifact of run.artifacts||[])if(artifact.type==='image'&&artifact.pixelRetention!=='metadata-only'&&!artifact.path&&!artifact.assetRef&&(artifact.dataURL||artifact.dataUrl))inlineImages.set(`${run.runId}:${artifact.id}`,artifact.dataURL||artifact.dataUrl);
 for(const run of value.runs||[])for(const artifact of run.artifacts||[]){const inline=inlineImages.get(`${run.runId}:${artifact.id}`);if(inline){artifact.dataURL=inline;continue;}if(artifact.type==='image'&&artifact.pixelRetention!=='metadata-only'&&!artifact.path&&!artifact.assetRef)throw Error('圖像產物缺少可持久讀取的來源；不能移除唯一像素內容後宣稱保存。');}
 return value;
}
export function createInspectionRecords(invoke){return {
 save:product=>invoke('save_inspection_unit',{request:durableInspectionProduct(product)}),
 read:reference=>invoke('read_inspection_unit',{reference}),
 list:(executionId,{offset=0,limit=50,workspaceRoot}={})=>invoke('list_inspection_units',{executionId,offset,limit,workspaceRoot}),
 artifact:reference=>invoke('read_inspection_artifact',{reference})
};}

// Read the exact persisted unit selected by output mode, without switching the
// user's active image. Every asynchronous boundary rechecks selection ownership.
export async function restoreCurrentOutputRecord(project,model,records,guard){
 const current=()=>{if(!guard?.isCurrent?.())throw Error('已切換工件或方案；未套用先前輸出');};
 if(!model.recordRef)throw Error('本件沒有可讀取的執行紀錄');current();
 const saved=await records.read(model.recordRef);current();
 if(saved.record?.unitId!==model.unitId||saved.executionId!==model.executionId||!saved.record?.imageIds?.includes(guard.activeId))throw Error('讀取的紀錄不屬於目前工件或執行');
 const runs=project.restoreInspectionUnit(saved,model.recordRef);current();
 for(const run of runs)for(const artifact of run.artifacts||[])if(artifact.type==='image'&&artifact.pixelRetention!=='metadata-only'&&!artifact.dataURL&&!artifact.dataUrl){
  current();const loaded=await records.artifact({...model.recordRef,runId:run.runId,artifactId:artifact.id});current();project.setInspectionArtifactPreview(run.runId,artifact.id,loaded.dataURL);
 }
 current();return {runIds:runs.map(r=>r.runId),unitId:model.unitId,executionId:model.executionId};
}

// A late image read must not write into a different workpiece or a replacement
// run. Pixel loading is asynchronous even when the enclosing output is ready.
export async function loadCurrentOutputImage(project,model,artifact,records,guard){
 const epoch=project.epoch,data=project.data;
 const current=()=>{
  if(project.epoch!==epoch||project.data!==data||!guard?.isCurrent?.())throw Error('已切換工件或輸出；未套用先前圖像');
  const live=project.data.algorithmRuns?.find(run=>run.runId===model.run.runId)?.artifacts?.find(a=>a.id===artifact.id);
  if(!live||live.sha256!==artifact.sha256)throw Error('本次圖像所屬運算已切換；未套用先前圖像');
 };
 if(artifact?.pixelRetention==='metadata-only')throw Error('此批次只保留產物摘要；若要查看像素，請重跑此工件或選擇保留全部圖像');
 if(!model.recordRef)throw Error('本次產物尚未保存可讀取引用');
 current();const cached=workpieceArtifactPixel(project,model.unitId,model.run.runId,artifact.id);if(cached)return project.setInspectionArtifactPreview(model.run.runId,artifact.id,cached);
 const loaded=await records.artifact({...model.recordRef,runId:model.run.runId,artifactId:artifact.id});current();if(!loaded?.dataURL&&!loaded?.dataUrl)throw Error('執行紀錄沒有返回此輸出圖的像素資料');
 return project.setInspectionArtifactPreview(model.run.runId,artifact.id,loaded.dataURL||loaded.dataUrl);
}
