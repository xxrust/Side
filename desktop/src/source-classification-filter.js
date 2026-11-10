// Browsing scope is session state, never a rewrite of the source membership or answers.
const states=new WeakMap();
export const sourceDimensions={labels:'分類',sampleModel:'型號',batch:'批次'};
export function imageSourceValues(image,dimension='labels',project=null){
 const f=image?.sourceMeaning?.fields||{};
 if(dimension!=='labels')return f[dimension]?[String(f[dimension])]:[];
 const labels=[f.category,...(f.defectLabels||[])].filter(Boolean);
 if(!labels.length&&f.quality)labels.push(({OK:'良品',NG:'不良品',UNKNOWN:'UNKNOWN'})[f.quality]||f.quality);
 if(!labels.length&&image?.expected?.categoryIds?.length){const categories=project?.data.purposeScheme?.classificationSpec?.categories||[];labels.push(...image.expected.categoryIds.map(id=>categories.find(c=>c.id===id)?.label||id));}
 if(!labels.length&&image?.expected?.status)labels.push(image.expected.status);
 return labels.length?[...new Set(labels)]:['未分類'];
}
export function sourceFilter(project,sourceId){let s=states.get(project);if(!s||s.epoch!==project.epoch||s.data!==project.data){s={epoch:project.epoch,data:project.data,values:new Map()};states.set(project,s);}return s.values.get(sourceId)||{dimension:'labels',value:null};}
export function setSourceFilter(project,sourceId,filter){sourceFilter(project,sourceId);states.get(project).values.set(sourceId,{dimension:filter.dimension||'labels',value:filter.value??null});}
export function sourceFilteredIds(project,source){const filter=sourceFilter(project,source.id),index=new Map(project.data.images.map(i=>[i.id,i]));return (source.imageIds||[]).filter(id=>index.has(id)&&(filter.value===null||imageSourceValues(index.get(id),filter.dimension,project).includes(filter.value)||(filter.value===''&&!imageSourceValues(index.get(id),filter.dimension,project).length)));}
export function sourceFilterOptions(project,source,dimension='labels'){const index=new Map(project.data.images.map(i=>[i.id,i])),counts=new Map();for(const id of source.imageIds||[]){const values=imageSourceValues(index.get(id),dimension,project);for(const value of values.length?values:[''])counts.set(value,(counts.get(value)||0)+1);}return [...counts].map(([value,count])=>({value,label:value||(dimension==='labels'?'未分類':'未指定'),count}));}
export function sourceFilterRunOptions(project,sourceId,options={}){
 if(options.units||options.baselineId)return options;
 const source=project.data.visualInquiry?.boards.flatMap(b=>b.projectSpaces?.sources||[]).find(s=>s.id===sourceId);
 if(!source||sourceFilter(project,sourceId).value===null)return options;
 const fixed=new Set(Object.values(project.data.purposeScheme?.execution?.referenceInputs||{})),ids=sourceFilteredIds(project,source).filter(id=>!fixed.has(id));
 if(!ids.length)throw Error('目前分類沒有可執行的待檢圖片');
 if(project.data.purposeScheme?.execution?.inputSlots?.filter(s=>s.required).length>1)throw Error('多相機聯合判定需選擇完整工件組，不能按單圖分類拆組執行');
 return {...options,units:ids.map(id=>({id:crypto.randomUUID(),imageIds:[id]}))};
}
