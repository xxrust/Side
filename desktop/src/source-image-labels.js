import {imageSourceValues} from './source-classification-filter.js';
import {schemeFingerprint} from './purpose-compiler.js';
import {resolveWorkpieceExpected} from './workpiece-expected-label.js';
const list=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(v)?v:null;
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
function matchingScheme(data,entry){
 for(const [basis,scheme] of [['current-scheme',data.purposeScheme],['saved-execution-scheme',entry.scheme],['saved-execution-scheme',entry.schemeSnapshot],['saved-execution-scheme',entry.context?.scheme]])if(scheme&&schemeFingerprint(scheme)===entry.schemeFingerprint)return {scheme,basis};
 return {scheme:null,basis:'category-id-only'};
}
/** Gallery badges read actual image labels and the last recorded unit for this
 * exact source/image pair. No source inference, disk reads or output recompute. */
export function sourceImageLabels(project,imageId,sourceId){
 const data=project.data||project,image=project.imageRecord?.(imageId)||list(data.images).find(i=>i.id===imageId),sources=list(data.visualInquiry?.boards).flatMap(b=>list(b.projectSpaces?.sources)),source=sources.find(s=>s.id===sourceId),result={imageId,sourceId,manual:{text:'未分類',status:'UNLABELLED',categoryIds:[],quality:null,needsReview:false,reason:null,provenance:null},last:null,resultReason:null};
 if(!image){result.resultReason='IMAGE_MISSING';return result;}
 const saved=image.expected,resolution=resolveWorkpieceExpected(project,{id:imageId,imageIds:[imageId]}),hasAnswer=!!saved&&(!!saved.status||!!saved.categoryIds?.length),resolvedAnswer=!!resolution.expected;
 if(resolvedAnswer){
  const resolved=resolution.expected,ids=resolved.categoryIds||[],spec=data.purposeScheme?.classificationSpec,category=spec?.categories?.find(c=>c.id===ids[0]);
  result.manual={text:category?.label||ids.join('、')||'已標記',status:'LABELLED',categoryIds:clone(ids),quality:category?.quality||null,needsReview:false,reason:null,provenance:clone(resolution.origin),at:saved?.at||image.sourceMeaning?.at||null};
 }
 if(hasAnswer){
  const resolved=resolution.expected,ids=resolved?.categoryIds||list(saved.categoryIds),spec=data.purposeScheme?.classificationSpec,category=resolved?spec?.categories?.find(c=>c.id===ids[0]):null,label=category?.label||ids.join('、')||saved.status,needsReview=!resolved;
  result.manual={text:label+(saved.status&&label!==saved.status&&!ids.includes(saved.status)?`（${saved.status}）`:'')+(needsReview?' · 需核對':''),status:needsReview?'NEEDS_REVIEW':'LABELLED',categoryIds:clone(ids),quality:category?.quality||null,needsReview,reason:resolution.reason,provenance:clone(resolved?.provenance||saved.provenance||null),at:saved.at||null};
 }
 if(!resolvedAnswer&&!hasAnswer&&(image.sourceMeaning?.fields.category||image.sourceMeaning?.fields.defectLabels?.length||image.sourceMeaning?.fields.quality))result.manual={...result.manual,text:imageSourceValues(image,'labels',project.data?project:{data:project}).join('、'),status:resolution.reason==='EXPECTED_SOURCE_LABEL_UNMAPPED'?'NEEDS_MAPPING':'SOURCE_MARKED',provenance:image.sourceMeaning,reason:resolution.reason==='EXPECTED_SOURCE_LABEL_UNMAPPED'?'人工已確認此圖片含義，但目前方案沒有對應分類出口':'人工確認的圖片標記；尚未對應正式驗收類別'};
 if(!source||!list(source.imageIds).includes(imageId)){result.resultReason='IMAGE_NOT_IN_SOURCE';return result;}
 for(let e=list(data.datasetExecutions).length-1;e>=0;e--){
  const entry=data.datasetExecutions[e];if(entry.sourceId!==sourceId)continue;
  const unit=list(entry.units).findLast(u=>list(u.imageIds).includes(imageId));if(!unit)continue;
  const execution=typeof unit.execution==='string'?unit.execution:unit.execution?.status,exit=unit.finalExit,categoryId=unit.categoryId||unit.result?.categoryId||null,status=execution==='FAULT'||exit==='FAULT'?'FAULT':execution==='CANCELLED'||exit==='CANCELLED'?'CANCELLED':execution==='COMPLETED'&&categoryId&&(!unit.result||unit.result.valid===true)?'COMPLETED':'UNAVAILABLE',historical=!entry.schemeFingerprint||entry.schemeFingerprint!==schemeFingerprint(data.purposeScheme),savedScheme=matchingScheme(data,entry),category=savedScheme.scheme?.classificationSpec?.categories?.find(c=>c.id===categoryId),at=unit.at||entry.finishedAt||entry.startedAt||null;
  result.last={text:status==='FAULT'?'執行故障':status==='CANCELLED'?'已取消':status==='COMPLETED'?category?.label||categoryId:'結果不可用',status,categoryId:status==='COMPLETED'?categoryId:null,quality:status==='COMPLETED'?(unit.quality||unit.result?.quality||category?.quality||null):null,executionId:entry.id,unitId:unit.unitId,schemeFingerprint:entry.schemeFingerprint||null,historical,schemeNote:historical?'歷史方案結果；目前方案需重新執行':'目前方案',at,timeBasis:unit.at?'unit-recorded-at':entry.finishedAt?'execution-finished-at':entry.startedAt?'execution-started-at':'unavailable',decisionMs:finite(unit.timing?.totalMs),cycleMs:finite(unit.cycleTiming?.totalMs),regression:typeof unit.regression==='string'?unit.regression:unit.regression?.status||null,labelBasis:savedScheme.basis,unitImageIds:clone(unit.imageIds),joint:list(unit.imageIds).length>1};
  return result;
 }
 result.resultReason=Object.values(data.purposeScheme?.execution?.referenceInputs||{}).includes(imageId)?'FIXED_REFERENCE_NO_WORKPIECE_RESULT':'NO_RECORDED_RESULT';return result;
}
