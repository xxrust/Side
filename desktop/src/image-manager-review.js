import {inheritedMeaning} from '../scripts/source-structure.mjs';
const signature=fields=>JSON.stringify(Object.entries(fields||{}).sort(([a],[b])=>a.localeCompare(b)));
export function buildImportReview(project,task){
 const draft=task.draft||task.decisions||{},source=(project.data.visualInquiry?.boards||[]).flatMap(b=>b.projectSpaces?.sources||[]).find(s=>s.id===task.sourceId),members=source?new Set(source.imageIds):null,images=new Map(project.data.images.map(i=>[i.id,i])),rows=new Map();let missing=0,changed=0;
 for(const f of task.structure.files){const image=images.get(f.imageId);if(!image||members&&!members.has(f.imageId)){missing++;continue;}
  let row=rows.get(f.groupId);if(!row){const group=task.structure.groups.find(g=>g.id===f.groupId),fields=inheritedMeaning(task.structure,draft,f.groupId);row={id:group.id,path:group.path,name:group.path.split('/').at(-1)||'直接匯入的圖片',fields,count:0,changed:0,hasPrevious:false};rows.set(f.groupId,row);}
  row.count++;const previous=image.sourceMeaning?.fields||{};row.hasPrevious ||= Object.keys(previous).length>0;
  if(signature(previous)!==signature(row.fields)){row.changed++;changed++;}
 }
 return {rows:[...rows.values()],count:task.structure.files.length-missing,missing,changed,hasProposal:Object.keys(draft).length>0,saved:!!task.confirmation&&changed===0};
}
export function importMeaningDescription(fields,{hasPrevious=false}={}){
 const parts=[];
 if(fields.category)parts.push(`分類「${fields.category}」`);
 if(fields.defectLabels?.length)parts.push(`標記${fields.defectLabels.map(s=>`「${s}」`).join('、')}`);
 if(fields.quality)parts.push(({OK:'良品（OK）',NG:'不良品（NG）',UNKNOWN:'UNKNOWN 類別'})[fields.quality]);
 if(fields.sampleModel)parts.push(`型號 ${fields.sampleModel}`);
 if(fields.batch)parts.push(`批次 ${fields.batch}`);
 if(fields.condition)parts.push(fields.condition);
 return parts.length?parts.join(' · '):hasPrevious?'清除這組圖片先前的資料標記':'暫不添加標記';
}
