import {recoverPortableProgram} from './portable-program-recovery.js';
// Only recognise the recorded wrapper and its actual preceding source run.
export function findPortableRecovery(project){
 const runs=project.data.algorithmRuns||[];
 for(const wrapper of [...runs].reverse()){
  if(typeof wrapper.code!=='string'||!wrapper.code.includes("files=list(root.glob('*.py'))"))continue;
  if(runs.some(r=>r.portabilityRecovery?.wrapperRunId===wrapper.runId&&r.portabilityRecovery?.comparison==='MATCH'))continue;
  const source=runs.find(r=>r.runId!==wrapper.runId&&typeof r.runDirectory==='string'&&wrapper.code.includes(`root=Path('${r.runDirectory}')`));
  if(source)return {sourceRun:source,wrapperRun:wrapper};
 }
 return null;
}
export async function rebuildPortableProgram(project,{readSources,execute}={}){
 const pair=findPortableRecovery(project);if(!pair)throw Error('沒有可核對的歷史外部檔案依賴');
 const {sourceRun,wrapperRun}=pair,epoch=project.epoch,data=project.data;
 const listing=await readSources(sourceRun.runDirectory);
 if(project.epoch!==epoch||project.data!==data)throw Error('專案已切換，未重建程式');
 const candidate=await recoverPortableProgram({...pair,...listing});
 const images=wrapperRun.sourceBinding.images;
 if(images.some(binding=>!project.data.images.some(image=>image.id===binding.imageId&&image.sha256===binding.imageSha256)))throw Error('歷史原圖已變更或缺失，不能以其他圖片重建');
 const run=await execute({candidate,wrapperRun,imageIds:images.map(image=>image.imageId)});
 if(project.epoch!==epoch||project.data!==data)throw Error('專案已切換，實算紀錄未套用');
 const expected=wrapperRun.artifacts||[],actual=run.artifacts||[],compare=expected.length>0&&expected.length===actual.length&&expected.every(a=>a.sha256&&actual.some(b=>b.id===a.id&&b.type===a.type&&b.sha256===a.sha256));
 const matched=run.status==='SUCCEEDED'&&run.codeSha256===candidate.codeSha256&&compare;
 project.mutate('algorithm_portability_recovery',()=>{const saved=project.data.algorithmRuns.find(r=>r.runId===run.runId);if(!saved)throw Error('候選運算紀錄不存在');saved.portabilityRecovery={...candidate.source,comparison:matched?'MATCH':'MISMATCH',artifactCount:expected.length,initiator:'human',scope:candidate.scope};});
 return {runId:run.runId,comparison:matched?'MATCH':'MISMATCH',artifactCount:expected.length,initiator:'human',scope:candidate.scope};
}
