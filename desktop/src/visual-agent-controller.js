import {assertGeometryTuning} from './visual-inquiry-model.js';
import {INQUIRY_GEOMETRY_PARAMETERS,normalizedGeometryParameters} from './inquiry-geometry.js';
import {resolveNodeOutput} from './node-output-model.js';
import {liveOutputSummary} from './canvas-live-output.js';
import {programScopeSummary,programScope} from './program-scope.js';
import {canvasProjectAgentContext} from './canvas-agent-context.js';
import {layoutCanvasBoard} from './canvas-board-layout.js';
import {algorithmRunCurrent} from './algorithm-workspace.js';
import './visual-chat-images.css';
import './visual-asset-library-view.css';
import {compactVisualSnapshot} from './agent.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const fail=message=>{throw Error(message)};
const noPixels=value=>value==null?value:JSON.parse(JSON.stringify(value,(key,v)=>/^data:image\//i.test(typeof v==='string'?v:'')||['dataURL','dataUrl','base64','_visualImages'].includes(key)?undefined:v));
const text=(value,max=600)=>typeof value==='string'?value.slice(0,max):value;
function small(value,depth=0){if(depth>6)return '[deeper metadata omitted]';if(Array.isArray(value))return value.slice(0,32).map(v=>small(v,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,40).map(([k,v])=>[k,small(v,depth+1)]));return text(value,1200)}
const sourceMeta=source=>small(noPixels(source||{}));
const assetMeta=asset=>({id:asset.id,label:asset.label,kind:asset.kind,width:asset.width,height:asset.height,author:asset.author,source:sourceMeta(asset.source),historicalSnapshot:true});
function imagePart(dataURL){const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataURL||'');if(!match)fail('平台圖像缺少可讀取的本地像素');return {type:'image',mimeType:match[1].toLowerCase(),data:match[2]}}
const element=(tag,content,className)=>{const node=document.createElement(tag);if(content!==undefined)node.textContent=content;if(className)node.className=className;return node};

/** Connects immutable visual assets, the shared board and Pi without giving models arbitrary URLs. */
export class VisualAgentController{
 constructor({project,view,sources,onError,onNavigate,onCollectAsset}={}){Object.assign(this,{project,view,sources,onError,onNavigate,onCollectAsset});this.previews=new Map()}
 state(){return this.project.ensureInquiry()}
 asset(id){return this.state().assets.find(asset=>asset.id===id)||fail('引用的圖像快照不存在，請重新加入圖片')}
 check(guard,epoch){if(this.project.epoch!==epoch||guard?.isCurrent&&!guard.isCurrent())fail('對話已停止或專案已變更，視覺操作未執行')}
 context(boardId,options={}){
  const context=this.project.inquiryContext(),board=boardId?this.project.captureInquirySnapshot(boardId,{allowUnavailable:true}):context.board;
  const compact=board?compactVisualSnapshot({...board,relations:(this.project.data.canvasRelations||[]).filter(r=>r.boardId===board.id)}):null;
  const catalogPage=this.sources?.catalogPage?.(options);const catalog=catalogPage?.items||this.sources?.catalog?.()||[];if(!Array.isArray(catalog))fail('圖像目錄必須同步返回來源清單');
  const schemeNodeId=this.view.outputView?.target?.()||null,output=schemeNodeId?resolveNodeOutput(this.project,{schemeNodeId}):null;
  return {schema:context.schema,pixelAccess:{status:'NOT_READ',requiredTool:'get_visual_image',claimPolicy:'目錄、摘要、標註和歷史快照都不能代替實際像素讀取'},display:{mode:this.view.historicalSnapshot?'historical-snapshot':this.view.outputView?.mode||'canvas',schemeNodeId,output:output?{status:output.status,reason:output.reason,live:output.live,unitId:output.unitId,executionId:output.executionId,runId:output.run?.runId||null,artifactIds:output.artifacts.map(a=>a.id)}:null},activeBoardId:context.activeBoardId,boards:context.boards,board:compact,assets:context.assets.map(assetMeta),catalog:catalog.map(source=>small(noPixels(source))),catalogPage:catalogPage?{...catalogPage,items:undefined}:null,scope:context.scope,canvasProject:canvasProjectAgentContext(this.project,board?.id),viewBoundary:board?.programBinding?programScopeSummary(this.project,board,board.programBinding.runId):null,artifactGroups:board?.artifactGroups||[],imageLabelBubbles:board?.imageLabelBubbles||[],geometry:'原像素標註僅抽樣（每條最多16點），全板總量也受限。使用 get_visual_image 查看完整標註圖；本輪未提供完整向量分頁工具。圖像目錄不等於已看見像素。工程師圈定搜尋ROI並點選合格候選是在表達意圖，尚未成為正式檢測方案或品質判定；渲染圖px不可冒充相機原像素。'};
 }
 async resolve(args,guard){
  const epoch=this.project.epoch;if(args.asset_id&&args.source_id)fail('source_id 與 asset_id 請擇一');if(!args.asset_id&&!args.source_id)fail('請提供來源 source_id 或圖像快照 asset_id');this.check(guard,epoch);
  if(args.asset_id)return this.asset(args.asset_id);
  if(typeof this.sources?.resolve!=='function')fail('平台圖像來源尚未連接');
  const entry=this.sources.descriptor?.(args.source_id)||(this.sources.catalog?.()||[]).find(entry=>(entry.source_id||entry.id)===args.source_id);
  if(!entry){
   const image=this.project.imageRecord?.(args.source_id)||(this.project.data.images||[]).find(i=>i.id===args.source_id);
   const error=Error(image?'這是資料集 imageId，不是視覺 source_id。先用 get_visual_context 的 image_ids 篩選，再從返回目錄選原圖或標註版本。':'圖像來源不在平台目錄中，請先 get_visual_context 分頁重新選取');
   error.code='VISUAL_SOURCE_NOT_FOUND';error.details={nextCall:{tool:'get_visual_context',args:image?{image_ids:[image.id]}:{offset:0,limit:32}},sourceIdFrom:'catalog[].source_id'};throw error;
  }
  const data=this.project.data;const resolved=await this.sources.resolve(args.source_id);this.check(guard,epoch);if(this.project.data!==data)fail('專案資料已被替換，請先 get_visual_context 刷新上下文再重試');for(const key of ['imageId','inputSha256','runId','artifactId'])if(entry.source?.[key]!=null&&resolved?.source?.[key]!==entry.source[key])fail('圖像來源綁定已改變（'+key+'），請先 get_visual_context 重新核對來源');if(!resolved)fail('圖像來源已失效，請重新選取');
  return this.project.registerInquiryAsset(resolved.reference||resolved,{actor:'agent'});
 }
 boundSnapshot(asset,args){
  const state=this.state(),boardId=args.board_id||state.activeBoardId,board=state.boards.find(b=>b.id===boardId);
  if(args.board_id&&!board)fail('問詢畫板不存在');
  let items=(board?.items||[]).filter(item=>item.assetId===asset.id);
  if(args.item_id){const item=board?.items.find(i=>i.id===args.item_id);if(!item||item.assetId!==asset.id)fail('畫板物件與圖像快照不一致');items=[item]}
  if(items.length>1)fail('同一圖像在畫板中有多個標註版本，請指定 item_id');
  if(items.length){const snapshot=copy(this.project.captureInquirySnapshot(board.id));return {snapshot,item:copy(items[0])}}
  const item={id:'snapshot:'+asset.id,type:'image',assetId:asset.id,x:0,y:0,width:asset.width,height:asset.height,annotations:[],author:asset.author,revision:1,asset:assetMeta(asset)};
  return {snapshot:{schema:'agentcv-visual-inquiry-snapshot-1',id:'snapshot:'+asset.id,title:asset.label,revision:1,author:asset.author,capturedAt:new Date().toISOString(),items:[item],scope:'不可變圖像引用；沒有當前共用板的標註。'},item};
 }
 attachment(asset,item){return {assetId:asset.id,itemId:item?.id,label:asset.label,width:asset.width,height:asset.height,source:copy(asset.source),historicalSnapshot:true}}
 async placeAsset(asset,boardId,guard,{deferLayout=false}={}){
  const epoch=this.project.epoch,board=this.state().boards.find(b=>b.id===boardId);if(!board)fail('來源畫板已移除，結果未放入其他畫板');this.check(guard,epoch);
  let item=board.items.find(i=>i.assetId===asset.id),added=false;
  if(!item){const result=this.project.addInquiryImage(asset,{boardId,actor:'agent'});item=result.item;added=true;}
  if(this.view.boardId===boardId&&!this.view.historicalSnapshot){await this.view.loadImage?.(asset);this.check(guard,epoch);if(!this.state().boards.find(b=>b.id===boardId)?.items.some(i=>i.id===item.id))fail('結果圖片已在發布期間被移除，未新增失效連線');if(!deferLayout){if(added)await this.arrangeNewItems(boardId,[item.id],guard);if(this.view.boardId===boardId&&!this.view.historicalSnapshot){this.view.render?.();this.view.fit?.({itemIds:[item.id]});}}}
  return {board_id:boardId,item_id:item.id,added,asset:assetMeta(asset)};
 }
 async arrangeNewItems(boardId,itemIds,guard){
  if(!itemIds.length)return;const epoch=this.project.epoch,board=this.state().boards.find(b=>b.id===boardId);if(!board)return;
  const revision=board.revision,size=this.view.canvasSize?.()||{width:900,height:580};
  const layout=await layoutCanvasBoard(board,this.project.data.canvasRelations||[],{itemIds,aspectRatio:Math.max(.6,size.width/size.height)});this.check(guard,epoch);
  const current=this.state().boards.find(b=>b.id===boardId);if(!current||current.revision!==revision||this.view.drag)return;
  const placements=layout.placements.filter(p=>itemIds.includes(p.id)),spaces=[...(current.projectSpaces?.sources||[]),...(current.projectSpaces?.references||[])];if(spaces.length&&placements.length){const right=Math.max(...spaces.map(s=>s.x+s.width),...current.items.filter(i=>!itemIds.includes(i.id)).map(i=>i.x+i.width));const shift=Math.max(0,right+80-Math.min(...placements.map(p=>p.x)));for(const p of placements)p.x+=shift;}this.project.applyInquiryLayout(boardId,placements,{actor:'agent',expectedRevision:revision});
 }
 async publishResults(args,guard){
  const boardId=args.board_id||this.state().activeBoardId,board=this.state().boards.find(b=>b.id===boardId);if(!board)fail('發問來源畫板不存在');
  const runId=args.run_id||args.pipeline_run_id,catalog=this.sources.catalogPage?.({run_id:runId,limit:200})?.items||this.sources.catalog();
  if(!runId)fail('請提供真實 run_id 或 pipeline_run_id');
  const run=args.run_id&&this.project.data.algorithmRuns?.find(r=>r.runId===runId);if(run&&(run.inputImpact?.status==='STALE'||run.intentBinding)&&!algorithmRunCurrent(this.project,run)){const error=Error('此運算的原圖、ROI 或引用意圖已改變，不能作為當前結果放入畫板。歷史程式與產物仍保留；請讀取新上下文後重算。');error.code='AGENT_INPUT_CHANGED';error.retryable=true;error.details=run.inputImpact||{affected:true,changes:[{category:'intent',path:'intentBinding',reason:'運算後引用意圖已改變'}]};throw error;}

  let matches=catalog.filter(e=>e.source?.runId===runId);
  if(args.presentation_id){const model=this.project.data.algorithmPresentations?.find(p=>p.id===args.presentation_id&&p.runId===runId);if(!model)fail('算法視圖不屬於指定運算');const components=args.component_id?model.components.filter(c=>c.id===args.component_id):model.components;if(!components.length)fail('指定的視圖元件不存在');const ids=components.filter(c=>c.kind==='image').map(c=>c.source?.artifactId);if(!ids.length)fail('此元件不是圖像；可讀取其數據，不宣稱已在畫板呈現圖片');matches=matches.filter(e=>ids.includes(e.source?.artifactId));}

  if(args.image_id)matches=matches.filter(e=>e.source?.imageId===args.image_id);
  if(args.node_id)matches=matches.filter(e=>e.source?.nodeId===args.node_id);
  if(args.artifact_ids?.length)matches=matches.filter(e=>args.artifact_ids.includes(e.source?.artifactId));
  if(run&&!args.artifact_ids?.length&&!args.presentation_id){const scope=programScope(this.project,{programBinding:{runId:run.runId,nodeId:run.runId+'::run'}},run.runId);matches=matches.filter(e=>scope?.outputs.has(e.source?.artifactId));}
  if(!matches.length)fail('此運算沒有可放入畫板的真實圖像產物；請輸出影像或疊圖後重試，不能用文字冒充圖像');
  if(matches.length>16)fail('本次超過16張結果圖；請指定 artifact_ids 分批放入畫板');
  const receipts=[];
  for(const entry of matches){const asset=await this.resolve({source_id:entry.source_id||entry.id},guard),receipt=await this.placeAsset(asset,boardId,guard,{deferLayout:true});receipts.push(receipt);
   const currentBoard=this.state().boards.find(b=>b.id===boardId);if(!currentBoard?.items.some(i=>i.id===receipt.item_id))fail('結果圖片已在發布期間被移除，未新增失效連線');
  }
  await this.arrangeNewItems(boardId,receipts.filter(r=>r.added).map(r=>r.item_id),guard);let group=null;if(run&&this.project.groupRunArtifacts){group=this.project.groupRunArtifacts(boardId,runId,{...(args.thread_id?{threadId:args.thread_id}:{}),...(args.turn_id?{turnId:args.turn_id}:{})});this.project.layoutCanvasArtifactGroups(boardId);group=this.project.canvasArtifactGroups(boardId).find(g=>g.id===group.id);}this.view.render?.();if(this.view.boardId===boardId&&!this.view.historicalSnapshot)this.view.fit?.(group?undefined:{itemIds:receipts.map(r=>r.item_id)});return {board_id:boardId,run_id:runId,images:receipts,artifact_group:group,view:this.view.boardId===boardId?'current-canvas':'specified-canvas',board_revision:this.state().boards.find(b=>b.id===boardId)?.revision,visible_on_current_board:!!(this.view.opened&&this.view.boardId===boardId&&!this.view.historicalSnapshot&&this.view.panel?.isConnected),scope:'真實圖像產物與來源關係；不代表通過正式驗收'};
 }
 async action(name,args={},guard){
  const epoch=this.project.epoch;this.check(guard,epoch);args={...args,board_id:args.board_id||this.state().activeBoardId||undefined};
  if(name==='get_geometry_tools'||name==='tune_geometry_tool'){
   const board=this.state().boards.find(b=>b.id===args.board_id);if(!board)fail('畫板不存在');const item=args.item_id?board.items.find(i=>i.id===args.item_id):null;if(args.item_id&&!item)fail('圖像物件不存在');
   if(name==='tune_geometry_tool'){
    const tool=item?.geometryTools?.find(t=>t.id===args.tool_id);if(!tool)fail('實算工具不存在');
    if(this.view.historicalSnapshot||this.view.boardId!==board.id)fail('請先返回此工具的目前畫板');
    assertGeometryTuning(this.project,{boardId:board.id,itemId:item.id,toolId:tool.id,tuningThreadId:args.tuning_thread_id});
    if(!Number.isInteger(args.expected_revision)||tool.revision!==args.expected_revision)fail('請重新取得工具的最新版本');
    if(!args.parameters||typeof args.reason!=='string'||!args.reason.trim())fail('請提供參數與調整依據');
    const parameters={...tool.parameters,...args.parameters};normalizedGeometryParameters(tool.kind,parameters,tool.roi);
    const before={revision:tool.revision,parameters:copy(tool.parameters)},options={actor:'agent',tuningThreadId:args.tuning_thread_id,isCurrent:()=>this.project.epoch===epoch&&(!guard?.isCurrent||guard.isCurrent())};this.check(guard,epoch);
    this.project.updateInquiryGeometryTool(board.id,item.id,tool.id,{parameters},{...options,expectedRevision:args.expected_revision});
    const result=await this.view.geometry.run(item.id,tool.id,options);this.check(guard,epoch);if(!result?.executed)fail('調參後實算未完成；請讀取最新工具狀態，不能聲稱成功');
    return {executed:true,before,reason:args.reason,context:this.context(board.id).board,measurements:this.project.featureMeasurementContext(board.id),humanConfirmationRequired:true,scope:'舊候選選擇已清除；請人類確認新候選。沒有變更正式檢測方案。'};
   }
   return {board:this.context(board.id).board,parameters:INQUIRY_GEOMETRY_PARAMETERS,measurements:this.project.featureMeasurementContext(board.id),scope:'實算幾何與手繪標註不同；調參只開放人類指定工具的對話。用 get_visual_image 查看像素。'};
  }
  if(name==='create_linked_canvas_board'){const board=this.project.createLinkedInquiryBoard(args.source_board_id,{title:args.title,actor:'agent',activate:false});if(args.open===true){this.check(guard,epoch);await this.view.open({boardId:board.id});}else this.view.render?.();return {board_id:board.id,origin_board_id:board.originBoardId,author:board.author,opened:args.open===true,capacity:this.project.inquiryCapacity(board.id),source_ids:(board.projectSpaces?.sources||[]).map(s=>s.id),scope:'原畫板與問答歷史保留；新畫板承接相同圖像源及參考關係。用 show_algorithm_run 的 board_id 明確發布至新板。'};}
  if(name==='get_canvas_image_mode'||name==='set_canvas_image_mode'){
   const board=this.state().boards.find(b=>b.id===args.board_id),item=board?.items.find(i=>i.id===args.item_id);if(!item)fail('指定畫板找不到此圖卡；請 get_canvas_project_context 核對 board_id 與 item_id');
   if(name==='set_canvas_image_mode'){
    this.check(guard,epoch);if(this.view.historicalSnapshot)fail('目前正在查看歷史快照，請返回目前畫板再修改圖像模式');
    if(args.mode==='live')this.project.bindInquiryLiveOutput(board.id,item.id,{schemeNodeId:args.scheme_node_id,artifactId:args.artifact_id},{actor:'agent'});
    else if(args.mode==='fixed')this.project.freezeInquiryLiveOutput(board.id,item.id,{actor:'agent'});
    else fail('圖像模式僅支援 live 或 fixed');
    this.check(guard,epoch);this.view.render?.();
   }
   const current=this.state().boards.find(b=>b.id===board.id).items.find(i=>i.id===item.id);
   return {board_id:board.id,item_id:item.id,asset_id:current.assetId,author:current.author,...liveOutputSummary(this.project.inquiryLiveOutputState(board.id,item.id)),...(current.frozenLiveOutput?{frozenFrom:copy(current.frozenLiveOutput)}:{}),scope:'即時圖僅追隨當前工件的已宣告輸出；問詢使用固定來源快照，歷史不隨新幀改寫。'};
  }
  if(name==='get_visual_context')return this.context(args.board_id,args);
  if(name==='get_canvas_project_context')return canvasProjectAgentContext(this.project,args.board_id,{includeGeometry:true});
  if(name==='get_canvas_artifact_groups')return {board_id:args.board_id,groups:this.project.canvasArtifactGroups(args.board_id),viewBoundary:programScopeSummary(this.project,this.state().boards.find(b=>b.id===args.board_id),this.state().boards.find(b=>b.id===args.board_id)?.programBinding?.runId),labels:copy(this.state().boards.find(b=>b.id===args.board_id)?.imageLabelBubbles||[])};
  if(name==='group_canvas_artifacts'){const group=this.project.groupRunArtifacts(args.board_id,args.run_id,{...(args.thread_id?{threadId:args.thread_id}:{}),...(args.turn_id?{turnId:args.turn_id}:{})});this.project.layoutCanvasArtifactGroups(args.board_id);this.view.render?.();this.view.fit?.();return {group:this.project.canvasArtifactGroups(args.board_id).find(g=>g.id===group.id)};}
  if(name==='set_canvas_artifact_group'){const patch=Object.fromEntries(['expanded','title','x','y'].filter(k=>args[k]!==undefined).map(k=>[k,args[k]])),group=this.project.updateCanvasArtifactGroup(args.board_id,args.group_id,patch);this.project.layoutCanvasArtifactGroups(args.board_id);this.view.render?.();this.view.fit?.();return {group:this.project.canvasArtifactGroups(args.board_id).find(g=>g.id===group.id)};}
  if(name==='add_canvas_image_label'){const label=this.project.addCanvasImageLabel(args.board_id,{itemId:args.item_id,text:args.text,anchor:args.anchor,position:args.position,author:'agent',...(args.thread_id?{threadId:args.thread_id}:{}),...(args.turn_id?{turnId:args.turn_id}:{})});this.view.render?.();return {label};}
  if(name==='publish_visual_results')return this.publishResults(args,guard);
  if(name==='connect_visual_images'){
   const boardId=args.board_id||this.state().activeBoardId,board=this.state().boards.find(b=>b.id===boardId);
   if(!board||!board.items.some(i=>i.id===args.from_item_id)||!board.items.some(i=>i.id===args.to_item_id)||args.from_item_id===args.to_item_id)fail('連線必須引用同一畫板的兩張不同圖像');
   if(typeof args.label!=='string'||!args.label.trim()||args.label.length>4000)fail('請提供4000字以內的關係說明');
   const relation={schema:'agentcv-canvas-image-relation-1',id:crypto.randomUUID(),boardId,fromItemId:args.from_item_id,toItemId:args.to_item_id,label:args.label,author:'agent',at:new Date().toISOString()};
   this.project.mutate('agent_image_relation_added',()=>{(this.project.data.canvasRelations??=[]).push(relation);board.revision++});this.view.render?.();return {relation,scope:'關係說明；不是座標對齊或品質驗證'};
  }
  if(name==='annotate_visual_board'){
   const boardId=args.board_id||this.state().activeBoardId;if(!boardId)fail('請先建立問詢畫板');
   const annotation=this.project.addInquiryAnnotation(boardId,args.item_id,{type:args.type,points:args.points,text:args.text,color:args.color,strokeWidth:args.stroke_width},{actor:'agent'});
   this.view.render?.();return {board_id:boardId,item_id:args.item_id,annotation,scope:'Agent 討論標註；不改人工 ROI 或檢測結果。'};
  }
  if(!['get_visual_image','show_visual_image','add_visual_image'].includes(name))fail('未授權視覺工具：'+name);
  const asset=await this.resolve(args,guard);this.check(guard,epoch);
  if(name==='add_visual_image'){
   const position={};for(const key of ['x','y'])if(args[key]!==undefined){if(!Number.isFinite(args[key]))fail('畫板位置必須是有限數值');position[key]=args[key]}
   const added=this.project.addInquiryImage(asset,{boardId:args.board_id,position,actor:'agent'});this.check(guard,epoch);if(!Object.keys(position).length)await this.arrangeNewItems(added.board.id,[added.item.id],guard);if(!this.view.opened)await this.view.open({boardId:added.board.id});else if(this.view.boardId===added.board.id&&!this.view.historicalSnapshot){await this.view.loadImage?.(asset);this.check(guard,epoch);if(!this.state().boards.find(b=>b.id===added.board.id)?.items.some(i=>i.id===added.item.id))fail('結果圖片已在發布期間被移除');if(this.view.boardId===added.board.id&&!this.view.historicalSnapshot){this.view.render?.();this.view.fit?.({itemIds:[added.item.id]});}}this.check(guard,epoch);if(this.view.boardId===added.board.id&&!this.view.historicalSnapshot){this.view.selected=new Set([added.item.id]);this.view.render?.();}return {board_id:added.board.id,item_id:added.item.id,asset:assetMeta(asset)};
  }
  if(name==='show_visual_image'&&args.board_id)await this.placeAsset(asset,args.board_id,guard);
  const {snapshot,item}=this.boundSnapshot(asset,args);
  if(name==='show_visual_image')return {text:typeof args.caption==='string'?args.caption:'請看這張圖。',attachments:[this.attachment(asset,item)],snapshot};
  const single={...snapshot,items:snapshot.items.filter(i=>i.id===item.id)};
  const exported=await this.view.exportImages({snapshot:single,selectedOnly:false,maxDimension:2000});this.check(guard,epoch);const rendered=exported[0];if(!rendered)fail('此圖像沒有可傳送的像素');
  return {asset:assetMeta(asset),item_id:item.id,pixelAccess:{status:'READ',sourceId:asset.source?.source_id||asset.id,width:rendered.width,height:rendered.height},snapshot:compactVisualSnapshot(single),delivered:{width:rendered.width,height:rendered.height,originalWidth:asset.width,originalHeight:asset.height,annotationCoordinates:'asset original pixels',includesAnnotations:item.annotations.length>0||(item.geometryTools||[]).length>0,includesGeometryTools:(item.geometryTools||[]).length>0},_visualImages:[imagePart(rendered.dataURL)]};
 }
 snapshot(reference){
  const value=reference?.snapshot||reference?.visualSnapshot||reference;if(!value||!Array.isArray(value.items)||!value.items.length||value.items.length>32)fail('問詢缺少當時的圖片快照，請重新引用畫板');
  const snapshot=copy(value);for(const item of snapshot.items){const asset=this.asset(item.assetId);if(!Array.isArray(item.annotations))fail('問詢標註快照不完整');item.asset=assetMeta(asset)}return snapshot;
 }
 async images(reference){
  const epoch=this.project.epoch,snapshot=this.snapshot(reference);if(snapshot.items.length>16)fail('一次最多詢問 16 張圖片，請在畫板先選取要討論的圖片');
  const rendered=await this.view.exportImages({snapshot,selectedOnly:false,maxDimension:2000});this.check(null,epoch);if(rendered.length!==snapshot.items.length)fail('部分問詢圖像未能輸出，草稿已保留');
  const images=rendered;this.check(null,epoch);
  return {images,attachments:snapshot.items.map(item=>this.attachment(this.asset(item.assetId),item)),snapshot};
 }
 preview(asset,item,snapshot){
  const key=this.project.epoch+':'+asset.id+':'+JSON.stringify([item.annotations,(item.geometryTools||[]).map(tool=>({id:tool.id,revision:tool.revision,selectedCandidateId:tool.selectedCandidateId}))]);if(!this.previews.has(key)){if(this.previews.size>80)this.previews.delete(this.previews.keys().next().value);const frozen={...copy(snapshot),items:[copy(item)]};this.previews.set(key,this.view.exportImages({snapshot:frozen,selectedOnly:false,maxDimension:1200}).then(result=>{if(!result[0])fail('引用圖像預覽未能生成');return result[0].dataURL}).catch(error=>{this.previews.delete(key);throw error}))}return this.previews.get(key);
 }
 renderAttachments(message){
  const fragment=document.createDocumentFragment();if(!Array.isArray(message.attachments)||!message.attachments.length)return fragment;
  const group=element('div',undefined,'visual-chat-images');
  for(const attachment of message.attachments){
   const figure=element('figure',undefined,'visual-chat-card'),button=element('button',undefined,'visual-chat-preview');button.type='button';const caption=element('figcaption'),name=element('strong',attachment.label||'圖像引用'),status=element('small','提問時圖像與標註');caption.append(name,status);figure.append(button,caption);group.append(figure);
   try{
    const asset=this.asset(attachment.assetId);let snapshot=message.visualSnapshot||message.reference?.snapshot,fullSnapshot;
    if(snapshot){fullSnapshot=this.snapshot(snapshot);const matches=fullSnapshot.items.filter(item=>item.assetId===asset.id&&(!attachment.itemId||item.id===attachment.itemId));if(matches.length!==1)fail('找不到此引用當時的唯一標註快照');snapshot={...fullSnapshot,items:matches};}
    // A message without a saved board snapshot can only display the immutable raw asset.
    if(!message.visualSnapshot&&!message.reference?.snapshot){const item={id:'snapshot:'+asset.id,type:'image',assetId:asset.id,x:0,y:0,width:asset.width,height:asset.height,annotations:[],asset:assetMeta(asset)};snapshot={schema:'agentcv-visual-inquiry-snapshot-1',id:'snapshot:'+asset.id,title:asset.label,revision:1,items:[item]}}
    fullSnapshot=fullSnapshot||snapshot;const item=snapshot.items[0],image=element('img');image.alt=asset.label;image.dataset.inquiryAssetId=asset.id;image.dataset.inquiryBoardId=String(fullSnapshot.id||'');image.dataset.inquiryRevision=String(fullSnapshot.revision||1);image.dataset.inquiryItemId=item.id;image.draggable=true;button.append(image);button.title='查看提問時快照';button.setAttribute('aria-label','查看提問時快照：'+asset.label);button.onclick=()=>{Promise.resolve(this.view.openSnapshot?this.view.openSnapshot(copy(fullSnapshot)):this.view.open({snapshot:copy(fullSnapshot)})).catch(error=>this.onError?.(error.message))};
    image.addEventListener('dragstart',event=>{event.dataTransfer?.setData('application/x-agentcv-image-id','asset:'+asset.id);if(event.dataTransfer)event.dataTransfer.effectAllowed='copy'});
    status.textContent=`${asset.width} × ${asset.height} · ${item.annotations.length} 項當時標註 · ${(item.geometryTools||[]).length} 個幾何工具${asset.source?.runId?' · 歷史運算快照':''}`;
    this.preview(asset,item,snapshot).then(dataURL=>{image.src=dataURL;image.dataset.ready='true'}).catch(error=>{status.textContent='預覽無法生成：'+error.message;figure.classList.add('unavailable')});
    if(this.onCollectAsset){const collect=element('button','💌','visual-chat-collect');collect.type='button';collect.title='收藏原始圖像到資產庫';collect.setAttribute('aria-label','收藏圖像：'+asset.label);collect.onclick=event=>{event.stopPropagation();Promise.resolve(this.onCollectAsset({dataUrl:asset.dataURL,title:asset.label,role:asset.source?.runId?'result':'reference',provenance:Object.fromEntries(Object.entries({runId:asset.source?.runId,artifactId:asset.source?.artifactId,nodeId:asset.source?.nodeId,boardId:fullSnapshot.id,messageId:message.id,sourceSha256:/^[a-f0-9]{64}$/i.test(asset.source?.inputSha256||'')?asset.source.inputSha256:undefined,author:asset.author,kind:'chat-image-original',coordinateSpace:asset.source?.coordinateSpace||'unknown',capturedAt:fullSnapshot.capturedAt}).filter(([,value])=>typeof value==='string'&&value))})).catch(error=>this.onError?.(error.message))};figure.append(collect);}
    if(this.onNavigate){const source=element('button','來源','visual-chat-source');source.type='button';source.title='返回原圖或當前實算來源；聊天快照保持不變';source.onclick=()=>{Promise.resolve(this.onNavigate(copy(asset.source))).catch(error=>this.onError?.(error.message))};caption.append(source)}
   }catch(error){button.disabled=true;button.textContent='引用圖像不可用';status.textContent=error.message;figure.classList.add('unavailable')}
  }
  fragment.append(group);return fragment;
 }
}
