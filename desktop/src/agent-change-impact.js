import {imageAssetIdentity} from './dataset-image-store.js';
// Compare computational meaning, never event counts or canvas display coordinates.
const normalize=value=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>!['revision','at','createdAt','updatedAt','lastChangeReason'].includes(k)).map(k=>[k,normalize(value[k])])):value;
const stable=value=>JSON.stringify(normalize(value));
const pick=(value,keys)=>Object.fromEntries(keys.map(k=>[k,value?.[k]??null]));
const sourceFingerprintCache=new WeakMap();
// Legacy projects may not have a content SHA yet. Keep their computational
// identity bounded as well; the full encoded image must never live in every
// Agent input stamp. New imports use contentSha256 and do not scan the source.
const sourceFingerprint=(value,owner=null)=>{
 if(typeof value!=='string')return null;
 if(owner){const cached=sourceFingerprintCache.get(owner);if(cached?.source===value)return cached.value;}
 let a=2166136261,b=2246822507;
 for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);a=Math.imul(a^code,16777619);b=Math.imul(b^code,3266489909)}
 const result=`${value.length}:${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`;
 if(owner)sourceFingerprintCache.set(owner,{source:value,value:result});
 return result;
};
const imagePixels=i=>i.contentSha256||i.assetRef?.sha256||i.sha256||sourceFingerprint(i.dataURL,i)||JSON.stringify(imageAssetIdentity(i));
export function captureAgentInputs(project,{boardId=null,itemIds=null}={}){
 const data=project.data,w=project.workflow||{},inquiry=data.visualInquiry||{},board=inquiry.boards?.find(b=>b.id===boardId),ids=Array.isArray(itemIds)?new Set(itemIds):null;
 const boardItems=(board?.items||[]).filter(i=>!ids||ids.has(i.id));
 return {observedEvents:data.events?.length||0,epoch:project.epoch,activeImageId:data.activeId,boardId,boardExists:!boardId||!!board,
  images:(data.images||[]).map(i=>({...pick(i,['id','sha256','width','height','profileId']),pixels:imagePixels(i)})),
  projectSpaces:stable(board?.projectSpaces?{sources:board.projectSpaces.sources.map(s=>pick(s,['id','title','imageIds','profileId'])),references:board.projectSpaces.references.map(r=>pick(r,['id','title','referenceIds','text'])),relations:board.projectSpaces.relations}:null),
  profiles:stable(w.profiles||[]),targets:stable([w.workpiece,...(w.parts||[])]),checks:stable(w.checks||[]),
  plan:stable({pipeline:w.pipelinePlan,recipe:w.recipe?{...w.recipe,status:undefined}:null}),references:stable(w.references||[]),relations:stable(w.relations||[]),
  marks:boardItems.map(i=>({id:i.id,assetId:i.assetId,annotations:stable((i.annotations||[]).map(a=>pick(a,['id','type','points','text']))),tools:stable((i.geometryTools||[]).map(t=>pick(t,['id','kind','roi','parameters','selectedCandidateId'])))})),
  assets:boardItems.map(i=>{const a=inquiry.assets?.find(a=>a.id===i.assetId);return {id:i.id,assetId:i.assetId,...pick(a,['width','height','source']),pixels:a?.contentSha256||a?.source?.sha256||sourceFingerprint(a?.dataURL,a)}}),
  boardRelations:stable((data.canvasRelations||[]).filter(r=>r.boardId===boardId&&(!ids||ids.has(r.fromItemId)&&ids.has(r.toItemId)||r.keys?.some(k=>{try{return ids.has(JSON.parse(k)[0])}catch{return false}}))).map(r=>pick(r,['id','schema','fromItemId','toItemId','label','keys','mode'])))
 };
}
const independent=tool=>/^(get_|read_|show_|verify_)/.test(tool)||['search_visual_assets','save_visual_asset','connect_visual_images','add_visual_image','set_algorithm_presentation','set_pipeline_view','set_inspection_view','go_to_step','install_algorithm_packages'].includes(tool);
export const refreshesAgentInputs=tool=>['get_context','get_visual_context','get_canvas_project_context','get_algorithm_context','get_edge_search_context'].includes(tool);
export function assessAgentChanges(before,after,{tool='',args={}}={}){
 const changes=[],add=(category,path,reason)=>changes.push({category,path,reason});
 if((!before&&!independent(tool))||(before&&before.epoch!==after.epoch))add('project','epoch','專案已切換，舊問題不能套用到新專案');
 if(before&&before.epoch===after.epoch&&!independent(tool)){
  const imageIds=args.image_ids||args.source?.images?.map(i=>i.imageId)||(args.image_id?[args.image_id]:null),scope=imageIds?.length?new Set(imageIds):null;
  const images=x=>(x.images||[]).filter(i=>!scope||scope.has(i.id));const a=images(before),b=images(after);
  if(a.length!==b.length||a.some(i=>{const j=b.find(j=>j.id===i.id);return !j||i.sha256!==j.sha256||i.pixels!==j.pixels||i.width!==j.width||i.height!==j.height}))add('image','images','計算輸入的原圖、像素或解析度已改變');
  if(!scope&&before.activeImageId!==after.activeImageId)add('image-selection','activeImageId','目前工作圖已切換；請指定 image_id / image_ids 或重新取得上下文');
  const categories=[['profiles','calibration','成像配置或標定已改變'],['targets','roi','工件定義或 ROI 已改變'],['relations','relations','檢測對象的關係已改變'],['references','references','引用資料已改變']];
  if(tool!=='run_algorithm')categories.push(['plan','parameters','算法方案或參數已改變'],['checks','specification','判定規格已改變']);
  for(const [field,category,reason]of categories)if(before[field]!==after[field])add(category,field,reason);
  if(!after.boardExists)add('board','boardId','發問來源畫板已移除');
  if(before.projectSpaces!==after.projectSpaces)add('canvas-project','projectSpaces','畫板圖像源、參考文字或資料適用關係已改變');
  for(const item of before.marks||[]){const next=after.marks.find(i=>i.id===item.id);if(!next||next.assetId!==item.assetId)add('board-source',`items.${item.id}`,'問題引用的圖像物件已移除或替換');else{if(item.annotations!==next.annotations)add('annotation',`items.${item.id}.annotations`,'問題引用的標記形狀、範圍或說明已改變');if(item.tools!==next.tools)add('geometry',`items.${item.id}.geometryTools`,'問題引用的實算工具 ROI、參數或候選選擇已改變');}}
  for(const item of before.assets||[]){const next=after.assets.find(i=>i.id===item.id);if(!next||item.pixels!==next.pixels||item.width!==next.width||item.height!==next.height||stable(item.source)!==stable(next.source))add('board-pixels',`assets.${item.assetId}`,'問題引用圖像的實際像素或來源綁定已改變');}
  if(before.boardRelations!==after.boardRelations)add('board-relations','boardRelations','問題引用的連線關係或距離定義已改變');
 }
 return {affected:changes.length>0,changes,ignored:!changes.length&&before?.observedEvents!==after.observedEvents?[{category:'unrelated-or-presentation',reason:independent(tool)?'此工具只讀取或展示明確來源，不覆寫計算輸入；由來源綁定另外核對。':'已核對本工具輸入；新增事件未改變相關原圖、ROI、參數或引用意圖，可以繼續。'}]:[],policy:'按工具輸入依賴核對；對話框位置、收合、圖片排版、視野縮放及聊天紀錄不參與計算失效判斷'};
}
export function assertAgentInputs(before,after,options){const impact=assessAgentChanges(before,after,options);if(impact.affected){const error=Error('計算依據已改變：'+impact.changes.map(c=>c.reason).join('；')+'。請先取得新狀態並核對受影響輸入後重試。');error.code='AGENT_INPUT_CHANGED';error.retryable=true;error.details=impact;error.errors=impact.changes.map(c=>({code:'AGENT_INPUT_CHANGED',path:c.path,message:c.reason,hint:'只刷新並核對受影響的原圖、ROI、參數或意圖，再用新的輸入執行；不必重開對話。'}));throw error;}return impact;}

export function captureBoardIntent(project,scope){const state=captureAgentInputs(project,scope);return {scope,snapshot:stable({boardId:state.boardId,boardExists:state.boardExists,marks:state.marks,boardRelations:state.boardRelations,assets:state.assets.map(({pixels,...asset})=>asset)})};}

export function refreshAgentBaseline(before,after,tool){
 if(!before||tool==='get_context')return after;
 const fields=['get_visual_context','get_canvas_project_context'].includes(tool)?['boardId','boardExists','marks','assets','boardRelations','projectSpaces','references','profiles']:
  tool==='get_algorithm_context'?['images','activeImageId','profiles','targets']:
  tool==='get_edge_search_context'?['images','activeImageId','profiles','targets','plan','checks','relations']:
  tool==='connect_visual_images'?['boardRelations']:null;
 if(fields)return {...before,...Object.fromEntries(fields.map(k=>[k,after[k]]))};
 if(independent(tool))return before;
 return after;
}
