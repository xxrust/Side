// Resolve only the evidence explicitly authored for this claim and node.
// A step output is never an implicit substitute for method/parameter/boundary evidence.
export function resolveProgramEvidence(node,selector){
 const artifacts=node.artifacts||[],external=node.evidenceVisuals||[],errors=[],images=[];
 const matches=selector?.kind==='artifact'?artifacts.filter(a=>(a.type==='json'?'evidence':a.type)===selector.type&&(!selector.id||a.id===selector.id)):[];
 const artifact=matches.length===1?matches[0]:null;
 if(selector?.kind==='artifact'&&matches.length!==1)errors.push(matches.length?'此引用對應多份產物，請指定唯一 id。':'缺少所引用的產物：'+(selector.id||selector.type));
 const check=selector?.kind==='gate'?(Array.isArray(node.outputs?.boundaryChecks)?node.outputs.boundaryChecks:[]).find(c=>c.id===selector.id):null;
 if(selector?.kind==='gate'&&!check)errors.push('尚無此邊界的實算觀察：'+selector.id);
 if(artifact?.type==='image'&&(artifact.dataURL||artifact.dataUrl))images.push({artifact,caption:selector.caption||artifact.name||artifact.id});
 for(const visual of Array.isArray(selector?.visuals)?selector.visuals:[]){
  const kind=visual.kind||'artifact',image=kind==='artifact'?artifacts.find(a=>a.id===visual.id&&a.type==='image'&&(a.dataURL||a.dataUrl)):external.find(a=>a.kind===kind&&a.id===visual.id&&a.type==='image'&&(a.dataURL||a.dataUrl));
  if(!image)errors.push('缺少本項指定的圖像證據：'+visual.id);
  else if(!images.some(value=>value.artifact.id===image.id))images.push({artifact:image,caption:visual.caption||'此圖尚缺少主張說明。'});
 }
 return {artifact,check,images,errors};
}
