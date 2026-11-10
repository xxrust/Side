// Human ground truth is data separate from the algorithm's output. Resolve it
// before dispatch and never infer a category from the detected result or filename.
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const qualityFor={OK:'good',NG:'bad',UNKNOWN:'undetermined'};
function readImage(project,id){return project.imageRecord?.(id)||(project.data||project).images?.find(i=>i.id===id);}
function sourceMeaningLabel(image){
 const fields=image?.sourceMeaning?.fields||{};
 return typeof fields.category==='string'&&fields.category.trim()?fields.category.trim():null;
}
function sourceMeaningOrigin(image,label){
 const meaning=image?.sourceMeaning||{};
 return {kind:'image-source-meaning',imageId:image?.id,label,taskId:meaning.taskId||null,relativePath:meaning.relativePath||null,actor:meaning.actor||null};
}
function resolveImage(project,image,scheme){
 const value=image?.expected,spec=scheme?.classificationSpec,categories=spec?.categories||[];
 const unavailable=reason=>({expected:null,reason,origin:{kind:'image-expected',imageId:image?.id,stored:clone(value)}});
 if(!value||!value.status&&!value.categoryIds?.length){
  const label=sourceMeaningLabel(image),meaning=image?.sourceMeaning;
  if(meaning?.actor==='human'&&label){
   const matches=categories.filter(category=>category.id===label||category.label===label);
   if(matches.length===1){
    const category=matches[0];
    return {expected:{categoryIds:[category.id],provenance:{type:'human',status:'confirmed',ref:`source-meaning:${meaning.taskId||image.id}:${meaning.relativePath||label}`,basis:'human-confirmed-source-meaning'}},origin:{...sourceMeaningOrigin(image,label),categoryId:category.id,categoryQuality:category.quality},reason:null};
   }
   return {expected:null,reason:'EXPECTED_SOURCE_LABEL_UNMAPPED',origin:{...sourceMeaningOrigin(image,label),stored:clone(meaning),availableCategories:categories.map(category=>({id:category.id,label:category.label}))}};
  }
  return unavailable('NO_IMAGE_EXPECTED_LABEL');
 }
 if(value.source&&value.source!=='human'||value.provenance&&(value.provenance.type!=='human'||value.provenance.status!=='confirmed'))return unavailable('EXPECTED_SOURCE_UNCONFIRMED');
 if(value.needsReview)return unavailable('EXPECTED_LABEL_NEEDS_REVIEW');
 if(value.schemeId&&value.schemeId!==scheme?.id||value.classificationSpecId&&value.classificationSpecId!==spec?.id)return unavailable('EXPECTED_CLASSIFICATION_SCOPE_CHANGED');
 const imageHash=image.contentSha256||image.sha256;if(value.imageSha256&&value.imageSha256!==imageHash)return unavailable('EXPECTED_IMAGE_CONTENT_CHANGED');
 let category,legacy=false;
 if(Array.isArray(value.categoryIds)){
  if(value.categoryIds.length!==1)return unavailable('EXPECTED_FINAL_CATEGORY_NOT_UNIQUE');
  category=categories.find(c=>c.id===value.categoryIds[0]);if(!category)return unavailable('EXPECTED_CATEGORY_UNDEFINED');
  if(value.categoryQuality&&value.categoryQuality!==category.quality)return unavailable('EXPECTED_CATEGORY_QUALITY_CHANGED');
  if(value.provenance?.type!=='human'||value.provenance?.status!=='confirmed'||!value.provenance?.ref?.trim())return unavailable('EXPECTED_SOURCE_UNCONFIRMED');
 }else{
  const quality=qualityFor[value.status];if(!quality)return unavailable('EXPECTED_LEGACY_STATUS_UNSUPPORTED');
  const matches=categories.filter(c=>c.quality===quality);if(matches.length!==1)return unavailable(matches.length?'EXPECTED_QUALITY_CATEGORY_AMBIGUOUS':'EXPECTED_QUALITY_CATEGORY_UNDEFINED');
  category=matches[0];legacy=true;
 }
 return {expected:{categoryIds:[category.id],provenance:legacy&&!value.provenance?{type:'human',status:'confirmed',ref:`image:${image.id}:expected.status=${value.status}`,basis:'legacy-saved-overall-image-label',...(value.reason?{note:value.reason}:{})}:clone(value.provenance)},origin:{kind:'image-expected',imageId:image.id,imageSha256:imageHash,legacyStatus:legacy?value.status:null,categoryId:category.id,categoryQuality:category.quality,schemeId:scheme?.id,classificationSpecId:spec?.id,stored:clone(value)},reason:null};
}
export function resolveWorkpieceExpected(project,unit,scheme=(project.data||project).purposeScheme){
 if(Object.hasOwn(unit,'expected'))return {expected:clone(unit.expected),origin:{kind:'explicit-workpiece-expected',unitId:unit.id},reason:unit.expected?null:'EXPLICITLY_UNLABELLED'};
 const ids=unit.imageIds||Object.values(unit.views||{});if(ids.length!==1)return {expected:null,reason:'MULTIVIEW_REQUIRES_WORKPIECE_EXPECTED',origin:{kind:'multi-view',imageIds:clone(ids)}};
 const image=readImage(project,ids[0]);if(!image)return {expected:null,reason:'EXPECTED_IMAGE_UNAVAILABLE',origin:{kind:'image-expected',imageId:ids[0]}};
 return resolveImage(project,image,scheme);
}
export const workpieceExpectedMethods={
 resolveImageExpectedClassification(imageId){return resolveWorkpieceExpected(this,{id:imageId,imageIds:[imageId]});},
 setImageExpectedClassification(imageId,input){const value=buildImageExpectedClassification(this,imageId,input),image=readImage(this,imageId);this.change('image_overall_label_edited',()=>{image.expected=value;},{recipe:false});return clone(value);}
};

export function buildImageExpectedClassification(project,imageId,input){
  const image=readImage(project,imageId);if(!image)throw Error('圖片不存在');
  if(input===null||input?.status===''&&!input.categoryId){return {};}
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('請指定人工已知分類');
  if(input.source&&input.source!=='human')throw Error('Agent 推定不能當作人工已知答案');
  const scheme=(project.data||project).purposeScheme,spec=scheme?.classificationSpec,categories=spec?.categories||[];
  if(!spec&&!input.categoryId&&qualityFor[input.status]){const at=new Date().toISOString(),value={status:input.status,reason:String(input.reason||''),source:'human',at,imageSha256:image.contentSha256||image.sha256,provenance:{type:'human',status:'confirmed',ref:`image:${image.id}:expected:${at}`,basis:'human-overall-quality-before-classification'}};return clone(value);}
  let category;
  if(input.categoryId)category=categories.find(c=>c.id===input.categoryId);
  else{const matches=categories.filter(c=>c.quality===qualityFor[input.status]);if(matches.length>1)throw Error('此品質包含多個類別，請明確選擇已知分類／分檔');category=matches[0];}
  if(!category)throw Error('分類不存在，請先建立分類規格或重新選擇類別');
  const at=new Date().toISOString(),value={categoryIds:[category.id],status:Object.keys(qualityFor).find(k=>qualityFor[k]===category.quality),reason:String(input.reason||''),source:'human',at,schemeId:scheme.id,classificationSpecId:spec.id,categoryQuality:category.quality,imageSha256:image.contentSha256||image.sha256,provenance:{type:'human',status:'confirmed',ref:`image:${image.id}:expected:${at}`}};
  return clone(value);
 }
