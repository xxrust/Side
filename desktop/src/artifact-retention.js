// Batch execution keeps the decision facts for every workpiece, but image
// pixels are evidence on demand.  Keeping every intermediate raster for every
// unit makes a 1,000-piece run become an accidental image archive.
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));

export const DEFAULT_BATCH_ARTIFACT_RETENTION={
 schema:'agentcv-artifact-retention-1',
 mode:'diagnostic',
 sampleEvery:100,
 keepFirst:true,
 keepLast:true,
 keepFailures:true,
 keepNonGood:true,
 note:'每件保存分類、量測、耗時、依據與圖像摘要；像素只保留故障、不良／待定、首尾及定期樣本。'
};

function positive(value,fallback){return Number.isSafeInteger(value)&&value>0?value:fallback;}

export function normalizeArtifactRetention(value,defaults=DEFAULT_BATCH_ARTIFACT_RETENTION){
 const input=value==='all'?{mode:'all'}:value&&typeof value==='object'?value:{};
 const mode=input.mode==='all'||input.mode==='metadata'||input.mode==='diagnostic'?input.mode:defaults.mode;
 return {
  schema:'agentcv-artifact-retention-1', mode,
  sampleEvery:positive(input.sampleEvery,positive(defaults.sampleEvery,100)),
  keepFirst:input.keepFirst===undefined?defaults.keepFirst!==false:!!input.keepFirst,
  keepLast:input.keepLast===undefined?defaults.keepLast!==false:!!input.keepLast,
  keepFailures:input.keepFailures===undefined?defaults.keepFailures!==false:!!input.keepFailures,
  keepNonGood:input.keepNonGood===undefined?defaults.keepNonGood!==false:!!input.keepNonGood,
  note:typeof input.note==='string'&&input.note.trim()?input.note:defaults.note
 };
}

function outputRole(run,artifact){
 const declared=(run?.expectedOutputs||run?.expected_outputs||[]).find(item=>item?.id===artifact?.id);
 return artifact?.role||artifact?.contractBinding?.role||declared?.role||'intermediate';
}

export function datasetArtifactRetentionDecision(product,{retention,unitIndex=0,total=null}={}){
 const policy=normalizeArtifactRetention(retention);
 const record=product?.record||{};
 const fault=record.execution?.status==='FAULT'||product.runs?.some(run=>run.status!=='SUCCEEDED'||run.execution?.status==='FAULT');
 const nonGood=record.result?.quality!==undefined&&record.result?.quality!=='good';
 const first=unitIndex===0,last=Number.isSafeInteger(total)&&total>0&&unitIndex===total-1,sample=unitIndex%policy.sampleEvery===0;
 const reasons=[];
  if(policy.mode==='all')reasons.push('all');
  if(policy.keepFailures&&fault)reasons.push('fault');
  if(policy.keepNonGood&&nonGood)reasons.push(record.result?.quality||'non-good');
  if(policy.keepFirst&&first)reasons.push('first');
  if(policy.keepLast&&last)reasons.push('last');
  if(sample)reasons.push('sample');
 const keepPixels=policy.mode==='all'||(policy.mode!=='metadata'&&reasons.length>0);
 const reason=reasons.length?reasons.join('+'):'metadata-only';
 const decision={schema:'agentcv-artifact-retention-decision-1',mode:policy.mode,unitIndex,total,keepPixels,reason,imageArtifacts:0,retainedImageArtifacts:0,metadataOnlyImageArtifacts:0,roles:[]};
 const imageArtifacts=(product.runs||[]).reduce((sum,run)=>sum+(run.artifacts||[]).filter(a=>a.type==='image').length,0);
 const retainedImageArtifacts=keepPixels?imageArtifacts:0;
 Object.assign(decision,{imageArtifacts,retainedImageArtifacts,metadataOnlyImageArtifacts:imageArtifacts-retainedImageArtifacts,roles:keepPixels?[...new Set((product.runs||[]).flatMap(run=>(run.artifacts||[]).filter(a=>a.type==='image').map(a=>outputRole(run,a))))]:[]});
 return decision;
}
export function applyDatasetArtifactRetention(product,decision){
 const runs=(product.runs||[]).map(run=>({...run,artifacts:(run.artifacts||[]).map(artifact=>{
  if(artifact.type!=='image'||decision.keepPixels)return {...artifact,pixelRetention:artifact.type==='image'?'full':artifact.pixelRetention};
  const next={...artifact,pixelRetention:'metadata-only',pixelAvailable:false,retentionReason:decision.reason};
  for(const key of ['data','dataUrl','dataURL','path','assetRef'])delete next[key];
  return next;
 })}));
 const {runs:_liveRuns,...metadata}=product;
 const durable={...clone(metadata),runs};durable.record={...durable.record,artifactRetention:decision};
 return {product:durable,decision};
}
export function retainDatasetArtifacts(product,options={}){
 return applyDatasetArtifactRetention(product,datasetArtifactRetentionDecision(product,options));
}
