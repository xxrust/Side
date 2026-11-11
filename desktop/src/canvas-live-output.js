import {resolveNodeOutput,outputImageReference} from './node-output-model.js';
const clone=value=>JSON.parse(JSON.stringify(value));
export function validateLiveOutputBinding(binding){
 if(!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).some(k=>!['schemeId','schemeNodeId','artifactId'].includes(k))||['schemeId','schemeNodeId','artifactId'].some(k=>typeof binding[k]!=='string'||!binding[k].trim()||binding[k].length>200))throw Error('即時圖像訂閱必須綁定方案、節點與輸出識別');
 return clone(binding);
}
/** Resolves a live subscription without replacing the immutable source asset.
 * A missing/failed current frame never falls back to an older successful image. */
export function liveOutputState(project,item){
 if(!item?.liveOutput)return {mode:'fixed',frameAvailable:false,status:'FIXED',reason:'固定圖像，不隨執行更新'};
 const binding=validateLiveOutputBinding(item.liveOutput),scheme=project.data.purposeScheme;
 if(scheme?.id!==binding.schemeId)return {mode:'live',frameAvailable:false,status:'STALE',reason:'訂閱的方案已切換',binding};
 const output=resolveNodeOutput(project,{schemeNodeId:binding.schemeNodeId});
 if(!['READY','NOT_FOUND','FAULT'].includes(output.status))return {mode:'live',frameAvailable:false,status:output.status,reason:output.reason||'等待目前工件輸出',binding,unitId:output.unitId,executionId:output.executionId};
 const artifact=output.artifacts.find(a=>a.id===binding.artifactId);
 if(!artifact)return {mode:'live',frameAvailable:false,status:'WAITING',reason:'本件未產生所訂閱的輸出圖',binding,unitId:output.unitId,executionId:output.executionId};
 const dataURL=artifact.dataURL||artifact.dataUrl;
 if(!dataURL&&output.run.artifactMode==='inspection')return {mode:'live',frameAvailable:false,status:'WAITING',reason:'本次未生成階段圖；請開啟「保存階段渲染圖」後重跑',binding,runId:output.run.runId,artifactId:artifact.id,unitId:output.unitId,executionId:output.executionId};
 if(!dataURL)return {mode:'live',frameAvailable:false,status:'WAITING',reason:'本件輸出圖像正在載入',binding,runId:output.run.runId,artifactId:artifact.id,unitId:output.unitId,executionId:output.executionId,needsPixels:true};
 return {mode:'live',frameAvailable:true,status:output.status,reason:output.status==='READY'?'目前工件的節點輸出':'目前工件的失敗診斷圖：'+output.reason,binding,runId:output.run.runId,artifactId:artifact.id,unitId:output.unitId,executionId:output.executionId,frameKey:[output.run.runId,artifact.id,artifact.sha256||''].join(':'),reference:{...outputImageReference(output,artifact),source:{...outputImageReference(output,artifact).source,schemeId:binding.schemeId,liveOutputFrame:true}}};
}
export function liveOutputSummary(state){const {reference,...summary}=state;return clone(summary);}

const capturedAssets=new WeakMap();
export function pinCapturedLiveAssets(project,ids){let kept=capturedAssets.get(project);if(!kept){kept=new Set();capturedAssets.set(project,kept);}for(const id of ids)kept.add(id);}
export function capturedLiveAssets(project){return capturedAssets.get(project)||new Set();}
