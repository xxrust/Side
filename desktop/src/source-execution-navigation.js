import {sourceFilteredIds} from './source-classification-filter.js';
import {schemeFingerprint} from './purpose-compiler.js';
const advancedExecutions=new WeakMap();
const list=x=>Array.isArray(x)?x:[];
function sourceMatches(project,sourceId,imageId){return list(project.data.visualInquiry?.boards).flatMap(board=>list(board.projectSpaces?.sources).filter(source=>sourceId?source.id===sourceId:source.imageIds.includes(imageId)).map(source=>({board,source})));}
function uniqueSource(project,sourceId){const matches=sourceMatches(project,sourceId);if(matches.length!==1)throw Error(matches.length?'圖像源識別在多個畫板重複，請先修正來源身份':'圖像源不存在');return matches[0];}
const activeId=p=>p.image?.id||p.data.activeId;
export const sourceExecutionNavigationMethods={
 setSourceAutoAdvance(sourceId,enabled){
  if(typeof enabled!=='boolean')throw Error('自動切換必須是布林值');const {board,source}=uniqueSource(this,sourceId);
  if(source.autoAdvance===enabled)return {...source};return this.updateCanvasSpace(board.id,sourceId,{autoAdvance:enabled});
 },
 async selectSourceImage(sourceId,imageId){
  const {source}=uniqueSource(this,sourceId);if(!source.imageIds.includes(imageId))throw Error('圖片不屬於此圖像源');const epoch=this.epoch;
  const pending=this.selectImage(imageId),selectionRevision=this.imageSelection;await pending;
  if(this.epoch!==epoch||this.imageSelection!==selectionRevision||activeId(this)!==imageId)return {selected:false,reason:'SELECTION_CHANGED'};
  const current=uniqueSource(this,sourceId);if(!current.source.imageIds.includes(imageId))return {selected:false,reason:'SOURCE_CHANGED'};
  // Workspace.selectImage invokes onImageSelected, including every source that
  // actually contains this original. No independent UI-only selection state.
  if(current.source.selectedImageId!==imageId)this.updateCanvasSpace(current.board.id,sourceId,{selectedImageId:imageId});
  return {selected:true,sourceId,imageId,selectionRevision};
 },
 async advanceSourceAfterExecution(execution,{imageId,epoch,sourceId,batch=false,selectionRevision,autoAdvance}={}){
  const no=reason=>({advanced:false,reason});if(autoAdvance===false)return no('MANUAL_SELECTION');
  if(batch)return no('BATCH_EXECUTION');if(epoch!==this.epoch)return no('PROJECT_CHANGED');
  if(!imageId||activeId(this)!==imageId||(selectionRevision!==undefined&&selectionRevision!==this.imageSelection))return no('SELECTION_CHANGED');
  const saved=list(this.data.datasetExecutions).find(e=>e.id===execution?.id);if(!saved)return no('EXECUTION_NOT_RECORDED');
  if(saved.schemeFingerprint!==schemeFingerprint(this.data.purposeScheme))return no('SCHEME_CHANGED');
  if(saved.status!=='COMPLETED')return no(saved.status==='CANCELLED'?'CANCELLED':'EXECUTION_FAILED');
  if(saved.total!==1||saved.processed!==1||list(saved.units).length!==1)return no('NOT_SINGLE_WORKPIECE');
  const unit=saved.units[0],status=typeof unit.execution==='string'?unit.execution:unit.execution?.status;
  if(status!=='COMPLETED'||!unit.finalExit?.startsWith('PRODUCT:'))return no('WORKPIECE_NOT_COMPLETED');
  if(list(unit.imageIds).length!==1||unit.imageIds[0]!==imageId)return no('WORKPIECE_MISMATCH');
  const references=new Set(Object.values(this.data.purposeScheme?.execution?.referenceInputs||{}));if(references.has(imageId))return no('FIXED_REFERENCE');
  const matches=sourceMatches(this,sourceId||saved.sourceId,imageId);if(matches.length!==1)return no(matches.length?'AMBIGUOUS_SOURCE':'SOURCE_NOT_FOUND');
  const {source}=matches[0];if(saved.sourceId&&saved.sourceId!==source.id)return no('SOURCE_MISMATCH');if(!source.imageIds.includes(imageId))return no('SOURCE_MISMATCH');if(source.autoAdvance!==true)return no('DISABLED');
  if(advancedExecutions.get(this)?.has(saved.id))return no('ALREADY_ADVANCED');
  const candidates=sourceFilteredIds(this,source).filter(id=>!references.has(id)),index=candidates.indexOf(imageId),nextId=candidates[(index+1)%candidates.length];if(index<0||!nextId||nextId===imageId)return no('NO_OTHER_IMAGE');
  // Decode before choosing. A slow disk read must not steal selection from a
  // human who navigated while this request was awaiting pixels.
  const revision=this.imageSelection,identity=this.data;
  try{await this.ensureImagePixels(nextId);}catch(error){return {...no('IMAGE_UNAVAILABLE'),message:error.message};}
  if(this.epoch!==epoch||this.data!==identity)return no('PROJECT_CHANGED');if(this.imageSelection!==revision||activeId(this)!==imageId)return no('SELECTION_CHANGED');
  if(saved.schemeFingerprint!==schemeFingerprint(this.data.purposeScheme))return no('SCHEME_CHANGED');
  const current=sourceMatches(this,source.id);if(current.length!==1)return no('AMBIGUOUS_SOURCE');if(current[0].source.autoAdvance!==true)return no('DISABLED');
  if(!sourceFilteredIds(this,current[0].source).includes(nextId))return no('FILTER_CHANGED');
  if(JSON.stringify(current[0].source.imageIds)!==JSON.stringify(source.imageIds))return no('SOURCE_CHANGED');
  const selected=await this.selectSourceImage(source.id,nextId);if(!selected.selected)return no(selected.reason);
  let done=advancedExecutions.get(this);if(!done)advancedExecutions.set(this,done=new Set());done.add(saved.id);
  this.event('source_auto_advanced',{sourceId:source.id,executionId:saved.id,fromImageId:imageId,toImageId:nextId});
  return {advanced:true,reason:'ADVANCED',sourceId:source.id,imageId:nextId,previousImageId:imageId};
 }
};
