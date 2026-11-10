import {assessInspectionTiming} from './inspection-timing.js';
// Read models for source-bound cards. No inferred labels become human truth.
import {schemeFingerprint} from './purpose-compiler.js';
import {compileClassificationSpec} from './classification-spec.js';
const list=v=>Array.isArray(v)?v:[];
const sourceRecords=data=>list(data.visualInquiry?.boards).flatMap(b=>list(b.projectSpaces?.sources));

/** Source roles come from executable bindings, never the source title. A source
 * containing only fixed reference images is not an inspected population. */
export function inspectionSourceBinding(project,sourceId){
 const data=project.data||project,sources=sourceRecords(data),source=sources.find(s=>s.id===sourceId),references=new Set(Object.values(data.purposeScheme?.execution?.referenceInputs||{}));
 const describe=s=>{const images=list(s?.imageIds),referenceImageIds=images.filter(id=>references.has(id)),workpieceImageIds=images.filter(id=>!references.has(id));return {id:s?.id,title:s?.title||s?.id,imageCount:workpieceImageIds.length,referenceCount:referenceImageIds.length,workpieceImageIds,referenceImageIds,role:!s?'missing':!images.length?'empty':!workpieceImageIds.length?'reference':referenceImageIds.length?'mixed':'workpiece'};};
 const binding=describe(source),eligibleSources=sources.map(describe).filter(s=>s.role!=='reference').map(({workpieceImageIds,referenceImageIds,role,...s})=>s);
 const applicable=!!source&&binding.role!=='reference',status=!source?'SOURCE_MISSING':binding.role==='reference'?'REFERENCE_ONLY':binding.role==='mixed'?'MIXED_SOURCE':binding.role==='empty'?'EMPTY_SOURCE':'WORKPIECE_SOURCE';
 const message=status==='REFERENCE_ONLY'?'此來源只含固定參考圖，作為匹配輸入，不是被分類或回歸統計的工件。請將卡片關聯到待檢圖像源。':status==='SOURCE_MISSING'?'卡片關聯的圖像源已不存在，請重新選擇待檢圖像源。':status==='MIXED_SOURCE'?'此來源同時含待檢圖與固定參考圖；統計只接受待檢工件，固定參考不計入樣本數。':status==='EMPTY_SOURCE'?'尚未加入待檢圖；可先定義分類規格。':'以此待檢圖像源的實際工件執行紀錄統計。';
 return {...binding,sourceId,applicable,status,message,eligibleSources};
}
function executionBinding(data,entry,binding){
 if(entry.sourceId&&entry.sourceId!==binding.sourceId)return null;
 const ids=[...new Set(list(entry.units).flatMap(u=>list(u.imageIds)))],allowed=new Set(binding.workpieceImageIds);
 if(ids.some(id=>!allowed.has(id)))return null;
 if(entry.sourceId===binding.sourceId)return {basis:'recorded-source-id',imageIds:ids};
 // Older single-workpiece calls may not save a source ID. Infer only a unique
 // collection containing every recorded inspected image; never a reference.
 if(!ids.length)return null;
 const matches=sourceRecords(data).filter(s=>{const other=inspectionSourceBinding(data,s.id);return other.applicable&&ids.every(id=>other.workpieceImageIds.includes(id));});
 return matches.length===1&&matches[0].id===binding.sourceId?{basis:'unique-recorded-workpiece-membership',imageIds:ids}:null;
}
const executionScope=(entry,binding,provenance)=>({kind:provenance.imageIds.length===binding.imageCount&&binding.imageCount>0?'source-dataset':entry.total===1?'single-workpiece':'source-subset',imageCount:provenance.imageIds.length,sourceImageCount:binding.imageCount,completeSourceCoverage:binding.imageCount>0&&provenance.imageIds.length===binding.imageCount,bindingBasis:provenance.basis});
function executionSummary(entry,spec,scope,current,timingAssessment){
 const categories=Object.entries(entry.counts?.categories||{}).map(([id,count])=>({id,label:spec?.categories?.find(c=>c.id===id)?.label||id,count})),reg=entry.counts?.regression||{},timing=entry.timing?.unitMs;
 return {executionId:entry.id,status:entry.status,current,scope,processed:entry.processed,total:entry.total,categoryCounts:categories,faultCount:entry.counts?.execution?.FAULT??null,cancelledCount:entry.counts?.execution?.CANCELLED??null,timing:timing?{count:timing.count,meanMs:timing.mean,p50Ms:timing.p50,p95Ms:timing.p95,maxMs:timing.max}:null,timingAssessment,regression:{labelled:reg.labelled??reg.coverage?.labelled??null,unlabelled:reg.unlabelled??null,matched:reg.matched??null,mismatched:reg.mismatched??null},scopeNote:scope.completeSourceCoverage?'本次已執行此來源的全部現有圖片；沒有人工答案仍不能宣稱召回率。':`本次涉及 ${scope.imageCount} / ${scope.sourceImageCount} 張待檢圖，不代表整個圖像源回歸完成。`};
}
export function inspectionCardContext(project,sourceId){
 const data=project.data||project,scheme=data.purposeScheme,binding=inspectionSourceBinding(project,sourceId),timingRequirement=scheme?.execution?.timingRequirement;
 const base={sourceId,sourceName:binding.title||sourceId,sourceRole:binding.role,sourceBinding:binding,applicable:binding.applicable,bindingStatus:binding.status,bindingMessage:binding.message,eligibleSources:binding.eligibleSources,timingRequirement};
 if(!binding.applicable)return {...base,spec:null,questions:[],valid:false,execution:null,executionCurrent:false,executionScope:null,statisticsSummary:null,regressionExecution:null,timingAssessment:null};
 const spec=scheme?.classificationSpec,compiled=compileClassificationSpec(spec),basis=schemeFingerprint(scheme),executions=list(data.datasetExecutions).map(entry=>({entry,provenance:executionBinding(data,entry,binding)})).filter(e=>e.provenance),selected=executions.at(-1),latest=selected?.entry;
 const timingAssessment=assessInspectionTiming(latest,timingRequirement??null),timingQuestions=timingAssessment.status==='NEEDS_REQUIREMENT'?[{id:'TIMING_REQUIREMENT_MISSING',code:'TIMING_REQUIREMENT_MISSING',path:'execution.timingRequirement',question:'此圖像源的單件允許耗時是多少毫秒？要求來自哪份規格或人類確認？',blocking:false}]:timingAssessment.errors.map(e=>({...e,id:e.code,question:e.message,blocking:true}));
 const scope=latest?executionScope(latest,binding,selected.provenance):null,current=!!latest&&latest.schemeFingerprint===basis;
 const regression=executions.findLast(({entry,provenance})=>entry.schemeFingerprint===basis&&entry.status!=='RUNNING'&&executionScope(entry,binding,provenance).completeSourceCoverage);
 return {...base,timingAssessment,spec,questions:[...(compiled.questions||[]),...timingQuestions],valid:compiled.ok,execution:latest?{...latest,timingAssessment,units:undefined}:null,executionCurrent:current,executionScope:scope,statisticsSummary:latest?executionSummary(latest,spec,scope,current,timingAssessment):null,regressionExecution:regression?{executionId:regression.entry.id,status:regression.entry.status,processed:regression.entry.processed,scope:executionScope(regression.entry,binding,regression.provenance),counts:regression.entry.counts,timing:regression.entry.timing}:null};
}
export function classificationSummary(spec){return list(spec?.categories).map(c=>({id:c.id,label:c.label,quality:c.quality,provenance:list(spec.provenance)}))}
