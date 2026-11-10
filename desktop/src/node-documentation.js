// Documentation explains design decisions. It is not execution data or a gate.
export const documentationSchema={type:'string',maxLength:64000,description:'自由 Markdown 節點文章：從檢測實體、缺陷或關係的本質出發，把特徵定位、身份依據、數值量測與實際判定講清楚。按需配可追溯實測圖及自包含 HTML/SVG 原理圖解，區分實測、推估與示意；無固定欄目，不虛構試驗。'};
export function validateNodeDocumentation(value){
 if(value!==undefined&&(typeof value!=='string'||value.length>64000))throw Error('節點文檔需為文字，最多 64000 字');
 return value;
}
export function nodeDocumentation(node){
 if(typeof node?.documentation==='string')return {text:node.documentation,legacy:false};
 const j=node?.justification||node?.rationale,paragraphs=[];
 if(j?.tool?.reason)paragraphs.push(j.tool.reason);
 for(const row of Array.isArray(j?.parameters)?j.parameters:[]){
  paragraphs.push([row.name,row.reason,row.source?'來源：'+row.source:null].filter(Boolean).join('。'));
 }
 if(node?.explanationParameterNotes)paragraphs.push(node.explanationParameterNotes);
 for(const row of Array.isArray(j?.boundaries)?j.boundaries:[]){
  paragraphs.push([row.condition,row.onFailure?'不成立時：'+row.onFailure:null].filter(Boolean).join('。'));
 }
 if(node?.explanationEvidenceGap)paragraphs.push('歷史記錄缺口：'+node.explanationEvidenceGap);
 return {text:paragraphs.filter(Boolean).join('\n\n'),legacy:paragraphs.length>0};
}
export function setNodeDocumentation(project,nodeId,documentation,{schemeId}={}){
 validateNodeDocumentation(documentation);
 if(typeof documentation!=='string')throw Error('請提供節點文檔');
 const scheme=project.purposeScheme||project.data?.purposeScheme;
 if(!scheme||schemeId&&schemeId!==scheme.id)throw Error('方案已切換，請重新讀取節點');
 const id=typeof nodeId==='string'?nodeId.replace(/^scheme::/,''):null;
 const node=scheme.operatorGraph?.nodes?.find(n=>n.id===id);
 if(!node)throw Error('找不到目前方案的節點；歷史運算記錄不可在此改寫');
 if(node.documentation===documentation)return {nodeId:id,changed:false,executionChanged:false};
 project.mutate('node_documentation_updated',()=>{node.documentation=documentation;},{schemeId:scheme.id,nodeId:id,executionChanged:false});
 return {nodeId:id,changed:true,executionChanged:false};
}
