import {jsonSnapshot} from './json-snapshot.js';
import {annotationInside} from './annotation-editing.js';
import {featureMeasurementMethods,validateFeatureMeasurements,resolveFeatureMeasurement} from './feature-measurements.js';
import {liveOutputState,liveOutputSummary,validateLiveOutputBinding,pinCapturedLiveAssets,capturedLiveAssets} from './canvas-live-output.js';
import {withoutPixels} from './canvas-agent-context.js';
// Visual questions are a separate document: editing them never edits a CV ROI,
// measurement plan, or its acceptance answers.
const SCHEMA='agentcv-visual-inquiry-1';
const LIMIT={boards:128,assets:512,items:32,annotations:256,points:4096,geometryTools:24,candidates:16,candidatePoints:2000,geometryBytes:2*1024*1024,assetBytes:12*1024*1024,totalAssetBytes:48*1024*1024,stateBytes:64*1024*1024};
const uid=()=>globalThis.crypto.randomUUID(),now=()=>new Date().toISOString(),finite=Number.isFinite;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const clone=jsonSnapshot;
const fail=message=>{throw Error(message)};
const own=(o,k)=>Object.hasOwn(o,k);
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const value of Object.values(x))freeze(value);Object.freeze(x)}return x};
function jsonValue(value,depth=0){
 if(depth>18)fail('問詢來源資料層級過深');
 if(value===null||value===undefined||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){if(!finite(value))fail('問詢資料不能包含非有限數值');return}
 if(Array.isArray(value)){if(value.length>10000)fail('問詢來源清單過長');for(const v of value){if(v===undefined)fail('問詢清單資料不完整');jsonValue(v,depth+1)}return}
 if(!record(value))fail('問詢資料必須是可保存的 JSON');
 for(const [key,item]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))fail('問詢資料欄位不合法');jsonValue(item,depth+1)}
}
function boundedText(value,label,max,{empty=true}={}){if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))fail(`${label}必須是${max}字以內的文字`);return value}
function id(value,label='識別'){boundedText(value,label,200,{empty:false});return value}
function actorName(actor='human'){if(!['human','agent'].includes(actor))fail('問詢作者必須是 human 或 agent');return actor}
function sourceValue(value){if(!record(value))fail('圖像需要來源記錄');jsonValue(value);if(JSON.stringify(value).length>65536)fail('圖像來源記錄過大');return clone(value)}
function assetValue(input,{creating=false,actor='human'}={}){
 if(!record(input))fail('問詢圖像資料不完整');
 const dataURL=input.dataURL;if(typeof dataURL!=='string'||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataURL)||dataURL.length>LIMIT.assetBytes)fail('問詢圖像必須是大小受限的本地 PNG／JPEG／WebP');
 const width=input.width,height=input.height;if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>32768||height>32768||width*height>180000000)fail('問詢圖像尺寸不合法');
 const kind=input.kind||'render';if(!['original','stage','figure','plot','render'].includes(kind))fail('問詢圖像類型不合法');
 const value={id:creating?(input.id||uid()):input.id,label:boundedText(input.label||'圖像','圖像名稱',240),kind,dataURL,width,height,source:sourceValue(input.source||{}),author:actorName(creating?actor:input.author),createdAt:input.createdAt||now()};id(value.id,'圖像識別');boundedText(value.createdAt,'圖像時間',80);return value;
}
function itemValue(item,assets){
 if(!record(item)||item.type!=='image')fail('問詢畫板物件格式錯誤');id(item.id,'畫板物件識別');if(!assets.has(item.assetId))fail('畫板引用不存在的圖像');
 if(item.liveOutput!==undefined){validateLiveOutputBinding(item.liveOutput);if(item.annotations?.length||item.geometryTools?.length)fail('有標註或量測的圖必須固定，不能自動換成其他工件像素');}
 actorName(item.author);for(const key of ['x','y','width','height'])if(!finite(item[key])||Math.abs(item[key])>1000000||(['width','height'].includes(key)&&item[key]<=0))fail('畫板位置或顯示尺寸不合法');const asset=assets.get(item.assetId);if(Math.abs(item.width/item.height-asset.width/asset.height)>1e-7*Math.max(1,asset.width/asset.height))fail('問詢圖像必須保持原始長寬比');
 if(!Number.isInteger(item.revision)||item.revision<1)fail('畫板物件版本不合法');
 if(item.layout!==undefined){fields(item.layout,['pinned'],'畫板排版設定');if(typeof item.layout.pinned!=='boolean')fail('畫板固定狀態必須是布林值')}
 if(!Array.isArray(item.annotations)||item.annotations.length>LIMIT.annotations)fail('單張圖標註數量過多');
 const ids=new Set();for(const a of item.annotations){annotationValue(a,assets.get(item.assetId));if(ids.has(a.id))fail('標註識別重複');ids.add(a.id)}
 if(item.geometryTools===undefined)item.geometryTools=[];if(!Array.isArray(item.geometryTools)||item.geometryTools.length>LIMIT.geometryTools)fail('單張圖最多24個幾何工具');const toolIds=new Set();for(const tool of item.geometryTools){geometryToolValue(tool,asset);if(toolIds.has(tool.id))fail('幾何工具識別重複');toolIds.add(tool.id)}
 return item;
}
function annotationValue(input,asset,{creating=false,actor='human'}={}){
 if(!record(input))fail('標註格式不完整');const type=input.type;if(!['pen','mask','rect','ellipse','line','arrow','text'].includes(type))fail('不支援的問詢標註工具');
 if(!Array.isArray(input.points)||input.points.length>LIMIT.points)fail('標註點清單格式錯誤');const count=input.points.length;
 if(type==='text'?count!==1:['rect','ellipse','line','arrow'].includes(type)?count!==2:type==='mask'?count<3:count<2)fail('標註點數不符合工具要求');
 for(const p of input.points)if(!record(p)||!finite(p.x)||!finite(p.y)||p.x<0||p.y<0||p.x>asset.width||p.y>asset.height)fail('標註必須位於所引用圖像的像素範圍內');
 const text=boundedText(input.text||'','標註文字',4000,{empty:type!=='text'}),color=input.color||'#ffcc66',strokeWidth=input.strokeWidth??3;
 if(typeof color!=='string'||!/^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/i.test(color))fail('標註顏色必須是十六進位色碼');
 if(!finite(strokeWidth)||strokeWidth<=0||strokeWidth>1024)fail('標註筆寬不合法');
 if(input.rotation!==undefined&&(!['rect','ellipse'].includes(type)||!finite(input.rotation)))fail('旋轉角度只適用於矩形與橢圓');if(input.closed!==undefined&&(type!=='pen'||typeof input.closed!=='boolean'||input.closed&&count<3))fail('閉合鋼筆至少需要三個頂點');if(input.rotation&&!annotationInside(input,asset))fail('旋轉後標註超出原圖範圍');
 const value={id:creating?(input.id||uid()):input.id,type,points:clone(input.points),...(input.rotation!==undefined?{rotation:((input.rotation%360)+360)%360}:{}),...(input.closed!==undefined?{closed:input.closed}:{}),text,color,strokeWidth,author:actorName(creating?actor:input.author),createdAt:input.createdAt||now(),revision:creating?1:input.revision};id(value.id,'標註識別');boundedText(value.createdAt,'標註時間',80);if(!Number.isInteger(value.revision)||value.revision<1)fail('標註版本不合法');return value;
}
const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(stable).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
function fields(value,allowed,label){if(!record(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail(`${label}包含未知欄位`)}
function jsonBound(value,label,bytes){jsonValue(value);if(JSON.stringify(value).length>bytes)fail(`${label}資料過大`);return clone(value)}
const pixelVersionCache=new Map();
function pixelVersion(asset){const old=pixelVersionCache.get(asset.id);if(old&&old.dataURL===asset.dataURL&&old.width===asset.width&&old.height===asset.height)return old.version;let a=2166136261,b=2246822507;for(let i=0;i<asset.dataURL.length;i++){const v=asset.dataURL.charCodeAt(i);a=Math.imul(a^v,16777619);b=Math.imul(b^v,3266489909)}const version=`encoded-image-fingerprint-v1:${asset.width}x${asset.height}:${asset.dataURL.length}:${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`;if(pixelVersionCache.size>=128)pixelVersionCache.delete(pixelVersionCache.keys().next().value);pixelVersionCache.set(asset.id,{dataURL:asset.dataURL,width:asset.width,height:asset.height,version});return version}
function roiValue(roi,asset){fields(roi,['x','y','width','height'],'幾何工具 ROI');if(!['x','y','width','height'].every(key=>finite(roi[key]))||roi.x<0||roi.y<0||roi.width<=0||roi.height<=0||roi.x+roi.width>asset.width||roi.y+roi.height>asset.height)fail('幾何工具 ROI 必須在資產像素範圍內');return {x:roi.x,y:roi.y,width:roi.width,height:roi.height}}
function parametersValue(parameters={}){if(!record(parameters)||Object.keys(parameters).length>64||Object.values(parameters).some(value=>value===undefined))fail('幾何工具參數格式錯誤');return jsonBound(parameters,'幾何工具參數',8192)}
export function inquiryGeometryBinding(asset,{kind,roi,parameters={}}){if(!asset||!['line','circle'].includes(kind))fail('幾何工具必須為 line 或 circle');const coordinateSpace=asset.source?.coordinateSpace==='original-image-pixels'?'original-image-pixels':asset.source?.coordinateSpace==='render-pixels'?'render-pixels':asset.kind==='original'?'original-image-pixels':'asset-pixels';return {schema:'agentcv-inquiry-geometry-input-1',sourceAssetId:asset.id,sourcePixelVersion:pixelVersion(asset),width:asset.width,height:asset.height,coordinateSpace,kind,roi:roiValue(roi,asset),parameters:parametersValue(parameters)}}
function candidateValue(candidate,kind,asset){
 fields(candidate,['id','kind','status','accepted','geometry','points','quality','gates','reason','score','residuals','coverageBins','angularCoverage'],'幾何候選');id(candidate.id,'候選識別');if(candidate.kind!==undefined&&candidate.kind!==kind)fail('候選種類與工具不一致');if(!['ACCEPTED','REJECTED'].includes(candidate.status)||typeof candidate.accepted!=='boolean'||candidate.accepted!==(candidate.status==='ACCEPTED'))fail('候選必須明確記錄 ACCEPTED 或 REJECTED');
 if(!record(candidate.geometry)||candidate.geometry.type!==kind)fail('候選幾何格式錯誤');jsonBound(candidate.geometry,'候選幾何',2048);
 const inAsset=p=>record(p)&&finite(p.x)&&finite(p.y)&&p.x>=0&&p.y>=0&&p.x<=asset.width&&p.y<=asset.height;
 if(kind==='line'&&(!inAsset(candidate.geometry.from)||!inAsset(candidate.geometry.to)))fail('擬合線端點必須在資產像素範圍內');
 if(kind==='circle'){const c=candidate.geometry.center||{x:candidate.geometry.cx,y:candidate.geometry.cy},r=candidate.geometry.radius??candidate.geometry.r;if(!inAsset(c)||!finite(r)||r<=0||r>Math.hypot(asset.width,asset.height))fail('擬合圓中心或半徑無效')}
 if(!Array.isArray(candidate.points)||candidate.points.length>LIMIT.candidatePoints||candidate.points.some(p=>!inAsset(p)))fail('候選支持點必須在資產內且最多2000點');for(const name of ['residuals','coverageBins','angularCoverage'])if(candidate[name]!==undefined&&(!Array.isArray(candidate[name])||candidate[name].length>LIMIT.candidatePoints))fail('候選圖像證據最多2000項');
 if(!record(candidate.quality))fail('候選缺少品質證據');jsonBound(candidate.quality,'候選品質',4096);
 if(!Array.isArray(candidate.gates)||!candidate.gates.length||candidate.gates.length>32)fail('候選缺少合格閘值');for(const gate of candidate.gates){if(!record(gate)||!['PASS','FAIL','UNKNOWN'].includes(gate.status))fail('候選閘值必須明確 PASS／FAIL／UNKNOWN');if(gate.status==='PASS'&&(!finite(gate.value)||!finite(gate.threshold)||!['>=','<='].includes(gate.operator)||!(gate.operator==='>='?gate.value>=gate.threshold:gate.value<=gate.threshold)))fail('候選 PASS 閘值與實際數值比較不一致')}jsonBound(candidate.gates,'候選閘值',8192);
 if(candidate.accepted&&candidate.gates.some(gate=>gate.status!=='PASS'))fail('合格候選不能包含未通過的閘值');return candidate;
}
function resultValue(result,binding,asset){
 fields(result,['kind','status','candidates','parameters','parameterOrigins','evidence','limitations','inputBinding','algorithmVersion','coordinateSystem'],'幾何工具結果');if(result.kind!==binding.kind||!['READY','EMPTY'].includes(result.status)||!Array.isArray(result.candidates)||result.candidates.length>LIMIT.candidates)fail('幾何工具結果種類、狀態或候選數量錯誤');
 if(!record(result.inputBinding)||stable(result.inputBinding)!==stable(binding))fail('幾何工具結果未綁定目前資產像素、ROI 與參數');boundedText(result.algorithmVersion,'幾何算法版本',120,{empty:false});
 if(!record(result.parameters))fail('幾何工具結果缺少實算參數');parametersValue(result.parameters);if(!record(result.parameterOrigins))fail('幾何工具結果缺少參數來源');for(const [name,value]of Object.entries(result.parameters)){const origin=result.parameterOrigins[name];if(!record(origin)||!['engineering_default','human_input','agent_input','computed_from_roi'].includes(origin.origin)||stable(origin.value)!==stable(value)||typeof origin.basis!=='string'||!origin.basis.trim())fail('每個實算參數必須保留相符的設定值、來源與依據')}if(!record(result.evidence)||!Array.isArray(result.limitations)||result.limitations.some(value=>typeof value!=='string'||value.length>2000))fail('幾何工具結果缺少證據或適用限制');if(stable(result.evidence.roi)!==stable(binding.roi))fail('實算證據的 ROI 與輸入綁定不一致');for(const [name,value]of Object.entries(binding.parameters))if(value!==null&&stable(result.parameters[name])!==stable(value))fail('實算參數與明確輸入的設定不一致');
 const ids=new Set();for(const candidate of result.candidates){candidateValue(candidate,binding.kind,asset);if(ids.has(candidate.id))fail('候選識別重複');ids.add(candidate.id)}if(result.status==='EMPTY'&&result.candidates.length)fail('EMPTY 結果不能含候選');if(result.status==='READY'&&!result.candidates.some(candidate=>candidate.accepted))fail('READY 結果必須至少有一個合格候選');return jsonBound(result,'幾何工具結果',LIMIT.geometryBytes);
}
function geometryToolValue(tool,asset){
 fields(tool,['id','kind','roi','parameters','inputBinding','sourceAssetId','sourcePixelVersion','result','selectedCandidateId','selection','parameterAuthors','revision','author','createdAt','updatedAt','note'],'幾何工具');id(tool.id,'幾何工具識別');actorName(tool.author);if(!Number.isInteger(tool.revision)||tool.revision<1)fail('幾何工具版本無效');boundedText(tool.createdAt,'幾何工具時間',80);boundedText(tool.updatedAt,'幾何工具時間',80);boundedText(tool.note||'','幾何工具說明',2000);
 if(tool.parameterAuthors!==undefined&&(!record(tool.parameterAuthors)||Object.entries(tool.parameterAuthors).some(([key,value])=>!Object.hasOwn(tool.parameters,key)||!['human','agent'].includes(value))))fail('參數作者無效');const binding=inquiryGeometryBinding(asset,tool);if(tool.sourceAssetId!==asset.id||tool.sourcePixelVersion!==binding.sourcePixelVersion||stable(tool.inputBinding)!==stable(binding))fail('幾何工具來源綁定不吻合');
 if(tool.result!==null)resultValue(tool.result,binding,asset);
 if(tool.selectedCandidateId!==null){const candidate=tool.result?.candidates.find(c=>c.id===tool.selectedCandidateId);if(!candidate||!candidate.accepted||candidate.status!=='ACCEPTED'||candidate.gates.some(gate=>gate.status!=='PASS'))fail('只能選擇本次實算且全部合格的候選');if(!record(tool.selection)||tool.selection.candidateId!==candidate.id)fail('幾何候選選擇記錄不完整');actorName(tool.selection.actor);boundedText(tool.selection.at,'候選選擇時間',80)}else if(tool.selection!==null)fail('未選候選時不能殘留選擇紀錄');return tool;
}
export function assertGeometryTuning(project,{boardId,itemId,toolId,tuningThreadId}){
 const thread=project.getCanvasThread?.(tuningThreadId),r=thread?.reference;
 if(thread?.status!=='SENDING'||r?.kind!=='geometry_tuning'||r.boardId!==boardId||r.itemId!==itemId||r.toolId!==toolId)throw Error('僅可在工程師指定此工具的調參對話中修改');
}
function geometryEditable(tool,actor){editable(tool,actor);if(actor==='agent'&&tool.selection?.actor==='human')fail('Agent 不可覆寫工程師的候選選擇')}
function validateState(state){
 if(!record(state)||state.schema!==SCHEMA||!Array.isArray(state.assets)||!Array.isArray(state.boards)||state.assets.length>LIMIT.assets||state.boards.length>LIMIT.boards)fail('視覺問詢畫板格式或數量錯誤');
 const assets=new Map();let bytes=0;
 for(const a of state.assets){assetValue(a);if(assets.has(a.id))fail('問詢圖像識別重複');assets.set(a.id,a);bytes+=a.dataURL.length}if(bytes>LIMIT.totalAssetBytes)fail('視覺問詢圖像總量過大');
 const boardIds=new Set();for(const b of state.boards){if(!record(b))fail('問詢畫板格式錯誤');validateFeatureMeasurements(b);id(b.id,'問詢畫板識別');if(boardIds.has(b.id))fail('問詢畫板識別重複');boardIds.add(b.id);if(b.programBinding!==undefined){fields(b.programBinding,['runId','nodeId'],'程序畫板綁定');boundedText(b.programBinding.runId,'運算識別',200,{empty:false});boundedText(b.programBinding.nodeId,'程序節點識別',500,{empty:false});}boundedText(b.title,'問詢畫板名稱',240);actorName(b.author);if(!Number.isInteger(b.revision)||b.revision<1||!Array.isArray(b.items)||b.items.length>LIMIT.items)fail('問詢畫板版本或圖像數量錯誤');const itemIds=new Set();for(const item of b.items){itemValue(item,assets);if(itemIds.has(item.id))fail('畫板物件識別重複');itemIds.add(item.id)}}
 if(state.activeBoardId!==null&&!boardIds.has(state.activeBoardId))fail('目前問詢畫板不存在');jsonValue(state);if(JSON.stringify(state).length>LIMIT.stateBytes)fail('視覺問詢資料過大');
 for(const asset of state.assets)freeze(asset);return state;
}
export function createInquiryState(){return {schema:SCHEMA,activeBoardId:null,assets:[],boards:[]}}
/** Run against a cloned incoming project before its live data are swapped. */
export function prepareInquiry(data){if(data.visualInquiry===undefined){data.visualInquiry=createInquiryState();return data.visualInquiry}validateState(data.visualInquiry);return data.visualInquiry}
function getState(project){return project.data.visualInquiry||createInquiryState()}
function boardFor(state,boardId=state.activeBoardId){const b=state.boards.find(b=>b.id===boardId);if(!b)fail('問詢畫板不存在');return b}
function itemFor(state,boardId,itemId){const board=boardFor(state,boardId),item=board.items.find(i=>i.id===itemId);if(!item)fail('問詢圖像物件不存在');return {board,item,asset:state.assets.find(a=>a.id===item.assetId)}}
function editable(value,actor){actorName(actor);if(actor==='agent'&&value.author!=='agent')fail('Agent 不可修改或刪除工程師的物件，請新增自己的標註')}
function commit(project,action,next,detail={}){validateState(next);project.mutate(action,()=>{project.data.visualInquiry=next},detail)}
const boardValue=({title='視覺問詢',actor='human',programBinding}={})=>({id:uid(),title:boundedText(title,'問詢畫板名稱',240),author:actorName(actor),revision:1,createdAt:now(),items:[],...(programBinding?{programBinding:clone(programBinding)}:{})});
function registeredAsset(state,reference,actor){const candidate=assetValue(reference,{creating:true,actor}),existing=reference.id?state.assets.find(a=>a.id===candidate.id):state.assets.find(a=>a.kind===candidate.kind&&a.width===candidate.width&&a.height===candidate.height&&JSON.stringify(a.source)===JSON.stringify(candidate.source)&&a.dataURL===candidate.dataURL);if(existing){if(existing.dataURL!==candidate.dataURL||existing.width!==candidate.width||existing.height!==candidate.height||JSON.stringify(existing.source)!==JSON.stringify(candidate.source))fail('既有圖像識別不能換成其他像素或來源');return existing}state.assets.push(candidate);return candidate}
function imageSize(asset,position={}){const width=position.width??(position.height!==undefined?position.height*asset.width/asset.height:Math.min(560,asset.width)),height=position.height??width*asset.height/asset.width;return {width,height}}
function compactAsset(asset){return {id:asset.id,label:asset.label,kind:asset.kind,width:asset.width,height:asset.height,author:asset.author,createdAt:asset.createdAt,source:clone(asset.source),historicalSnapshot:true}}
function compactBoard(state,board){return {id:board.id,title:board.title,revision:board.revision,author:board.author,createdAt:board.createdAt,coordinateSystem:'board layout; annotation points are in each asset original pixels',measurements:clone((board.measurements||[]).filter(m=>board.items.some(i=>i.id===m.itemId))),measurementResults:(board.measurements||[]).filter(m=>board.items.some(i=>i.id===m.itemId)).map(m=>resolveFeatureMeasurement(board,m)),...(board.programBinding?{programBinding:clone(board.programBinding)}:{}),...(board.artifactGroups?{artifactGroups:clone(board.artifactGroups)}:{}),...(board.imageLabelBubbles?{imageLabelBubbles:clone(board.imageLabelBubbles)}:{}),...(board.projectSpaces?{projectSpaces:clone(board.projectSpaces)}:{}),items:board.items.map(item=>({...clone(item),asset:compactAsset(state.assets.find(a=>a.id===item.assetId))}))}}

export const inquiryMethods={
 ...featureMeasurementMethods,
 ensureInquiry(){const state=getState(this);if(!this.data.visualInquiry)this.data.visualInquiry=state;for(const asset of state.assets)freeze(asset);return state},
 registerInquiryAsset(reference,{actor='human'}={}){actorName(actor);jsonValue(reference);const next=clone(getState(this)),before=next.assets.length,asset=registeredAsset(next,reference,actor);if(next.assets.length!==before)commit(this,'inquiry_asset_registered',next,{asset_id:asset.id,actor});return clone(asset)},
 inquiryCapacity(boardId,{incoming=1}={}){if(!Number.isInteger(incoming)||incoming<0)fail('預計新增數量無效');const board=boardFor(getState(this),boardId);return {boardId:board.id,used:board.items.length,limit:LIMIT.items,remaining:Math.max(0,LIMIT.items-board.items.length),fits:board.items.length+incoming<=LIMIT.items}},
 createLinkedInquiryBoard(boardId,{title,actor='human',activate=true}={}){const next=clone(getState(this)),source=boardFor(next,boardId),board=boardValue({title:title??source.title+' · 後續畫板',actor:actorName(actor)});board.originBoardId=source.id;const origin=source.projectSpaces?source:next.boards.find(b=>b.projectSpaces);if(origin?.projectSpaces)board.projectSpaces={sources:clone(origin.projectSpaces.sources),references:clone(origin.projectSpaces.references),relations:clone(origin.projectSpaces.relations),cards:[]};next.boards.push(board);if(activate)next.activeBoardId=board.id;commit(this,'inquiry_linked_board_created',next,{board_id:board.id,source_board_id:source.id,actor:actorName(actor)});return clone(board)},
 createInquiryBoard(options={}){const next=clone(getState(this)),board=boardValue(options);next.boards.push(board);next.activeBoardId=board.id;commit(this,'inquiry_board_created',next,{board_id:board.id,actor:board.author});return clone(board)},
 // Historical questions remain read-only. Continuing them creates one independent board
 // and one undo entry; immutable assets are shared without replaying live CV state.
 cloneInquirySnapshot(snapshot,{title}={}){
  if(!record(snapshot)||snapshot.schema!=='agentcv-visual-inquiry-snapshot-1'||!Array.isArray(snapshot.items)||snapshot.items.length>LIMIT.items)fail('歷史畫板快照格式錯誤');jsonValue(snapshot);
  const next=clone(getState(this)),assets=new Map(next.assets.map(asset=>[asset.id,asset])),board=boardValue({title:title??`${snapshot.title||'視覺問詢'} · 副本`,actor:'human'});
  for(const original of snapshot.items){
   const asset=assets.get(original?.assetId),saved=original?.asset;
   if(!asset||!record(saved)||saved.id!==asset.id||saved.width!==asset.width||saved.height!==asset.height||saved.kind!==asset.kind||JSON.stringify(saved.source)!==JSON.stringify(asset.source))fail('歷史畫板引用的原圖或來源不吻合，不能換成當前結果');
   itemValue(original,assets);
   board.items.push({...clone(original),id:uid(),author:'human',createdAt:now(),revision:1,annotations:original.annotations.map(annotation=>({...clone(annotation),id:uid(),createdAt:now(),revision:1})),geometryTools:(original.geometryTools||[]).map(tool=>({...clone(tool),id:uid(),author:'human',createdAt:now(),updatedAt:now(),revision:1}))});
   delete board.items.at(-1).asset;delete board.items.at(-1).liveOutput;delete board.items.at(-1).liveOutputFrame;
  }
  board.measurements=(snapshot.measurements||[]).map(m=>{const index=snapshot.items.findIndex(i=>i.id===m.itemId),original=snapshot.items[index],item=board.items[index];return {...clone(m),id:uid(),itemId:item?.id||m.itemId,toolIds:m.toolIds.map(id=>item?.geometryTools[(original?.geometryTools||[]).findIndex(t=>t.id===id)]?.id||id)};});
  next.boards.push(board);next.activeBoardId=board.id;commit(this,'inquiry_snapshot_cloned',next,{source_board_id:snapshot.id,source_revision:snapshot.revision,board_id:board.id,actor:'human'});return clone(board);
 },
 selectInquiryBoard(boardId){const next=clone(getState(this));boardFor(next,boardId);next.activeBoardId=boardId;commit(this,'inquiry_board_selected',next,{board_id:boardId});return clone(boardFor(next,boardId))},
 addInquiryImage(reference,{boardId,position,actor='human',activate=actor==='human'}={}){
  actorName(actor);jsonValue(reference);const next=clone(getState(this));let board;
  if(boardId||next.activeBoardId)board=boardFor(next,boardId||next.activeBoardId);else{board=boardValue({actor});next.boards.push(board);next.activeBoardId=board.id}
  if(board.items.length>=LIMIT.items){const error=Error(`此手動畫板已達 ${LIMIT.items} 張顯示圖上限；原實算與歷史仍保存。請新建關聯空畫板後重試，或只移除不需要的顯示引用；大量資料應透過圖像源逐件查看。`);error.code='CANVAS_DISPLAY_CAPACITY';error.details={boardId:board.id,used:board.items.length,limit:LIMIT.items,remaining:0,retryable:true};throw error;}
  const asset=registeredAsset(next,reference,actor),size=imageSize(asset,position);
  const n=board.items.length,previous=board.items.at(-1),defaultX=n%2?previous.x+previous.width+40:0,defaultY=n%2?previous.y:n?Math.max(...board.items.map(i=>i.y+i.height))+40:0,item={id:uid(),type:'image',assetId:asset.id,x:position?.x??defaultX,y:position?.y??defaultY,...size,annotations:[],geometryTools:[],author:actor,revision:1,createdAt:now()};
  board.items.push(item);board.revision++;if(activate)next.activeBoardId=board.id;commit(this,'inquiry_image_added',next,{board_id:board.id,item_id:item.id,asset_id:asset.id,actor});return clone({board,item,asset});
 },
 bindInquiryLiveOutput(boardId,itemId,binding,{actor='human'}={}){
  const next=clone(getState(this)),{board,item}=itemFor(next,boardId,itemId);editable(item,actor);if((board.artifactGroups||[]).some(g=>g.itemIds.includes(itemId)||(g.inputBindings||[]).some(b=>b.itemId===itemId||b.fromItemId===itemId)))fail('此圖屬於固定的實算圖組，請新增獨立即時圖卡，不能改寫原圖組來源');if(item.annotations.length||item.geometryTools?.length)fail('這張圖已有標註或量測；請另加一張即時輸出圖，保留原來的像素依據');
  item.liveOutput=validateLiveOutputBinding({schemeId:this.data.purposeScheme?.id,...binding});if(item.liveOutput.schemeId!==this.data.purposeScheme?.id||!this.data.purposeScheme?.operatorGraph?.nodes?.some(n=>n.id===item.liveOutput.schemeNodeId))fail('即時訂閱必須指向目前方案的節點');const definition=this.data.purposeScheme.operatorGraph.nodes.find(n=>n.id===item.liveOutput.schemeNodeId);if(!definition.expected_outputs?.some(a=>a.id===item.liveOutput.artifactId&&a.type==='image'))fail('即時訂閱必須指向節點已宣告的圖像輸出');delete item.frozenLiveOutput;delete item.liveOutputFrame;item.revision++;board.revision++;commit(this,'inquiry_live_output_bound',next,{board_id:boardId,item_id:itemId,actor});this.syncInquiryLiveOutputs(boardId);return clone(itemFor(getState(this),boardId,itemId).item);
 },
 inquiryLiveOutputState(boardId,itemId){const {item}=itemFor(getState(this),boardId,itemId);return liveOutputState(this,item)},
 syncInquiryLiveOutputs(boardId){
  const state=getState(this),items=[],updates=[];
  // Resolve lightweight binding identities first. An unchanged frame does not
  // stringify/copy the entire canvas and its raster assets on every UI render.
  for(const board of state.boards){if(boardId&&board.id!==boardId)continue;for(const item of board.items){if(!item.liveOutput)continue;const resolved=liveOutputState(this,item),summary=liveOutputSummary(resolved);items.push({boardId:board.id,itemId:item.id,...summary});const currentAsset=state.assets.find(a=>a.id===item.assetId),frameMatches=!resolved.frameAvailable||currentAsset?.source?.runId===resolved.runId&&currentAsset?.source?.artifactId===resolved.artifactId&&currentAsset?.dataURL===resolved.reference.dataURL;if(JSON.stringify(item.liveOutputFrame)!==JSON.stringify(summary)||!frameMatches)updates.push({boardId:board.id,itemId:item.id,resolved,summary});}}
  if(!updates.length)return {changed:false,items};
  const next=clone(state),changedBoards=new Set();
  for(const {boardId:targetId,itemId,resolved,summary}of updates){const {board,item}=itemFor(next,targetId,itemId);if(resolved.frameAvailable){const asset=registeredAsset(next,resolved.reference,'agent');item.assetId=asset.id;item.height=item.width*asset.height/asset.width;}item.liveOutputFrame=summary;item.revision++;changedBoards.add(board.id);}
  for(const board of next.boards)if(changedBoards.has(board.id))board.revision++;
  // Retain frozen discussion assets and all other references; only release old
  // live frames that no saved object or question still refers to.
  const used=new Set(capturedLiveAssets(this)),scan=v=>{if(!v||typeof v!=='object')return;if(typeof v.assetId==='string')used.add(v.assetId);if(Array.isArray(v)){v.forEach(scan);return;}for(const [k,x]of Object.entries(v))if(k!=='assets')scan(x)};scan({...this.data,visualInquiry:next});next.assets=next.assets.filter(a=>!a.source?.liveOutputFrame||used.has(a.id));
  validateState(next);this.data.visualInquiry=next;this.event('inquiry_live_outputs_refreshed',{board_id:boardId||null,count:items.length});return {changed:true,items};
 },
 freezeInquiryLiveOutput(boardId,itemId,{actor='human'}={}){
  this.syncInquiryLiveOutputs(boardId);const next=clone(getState(this)),{board,item}=itemFor(next,boardId,itemId);if(!item.liveOutput)return clone(item);editable(item,actor);const resolved=liveOutputState(this,item);if(!resolved.frameAvailable)fail('目前即時圖尚未就緒：'+resolved.reason);item.frozenLiveOutput={...clone(item.liveOutput),...liveOutputSummary(resolved),frozenAt:now()};delete item.liveOutput;delete item.liveOutputFrame;item.revision++;board.revision++;commit(this,'inquiry_live_output_frozen',next,{board_id:boardId,item_id:itemId,actor});return clone(item);
 },
 updateInquiryItem(boardId,itemId,patch,{actor='human'}={}){if(!record(patch)||Object.keys(patch).some(k=>!['x','y','width','height'].includes(k)))fail('只能修改問詢圖像的位置或顯示大小');const next=clone(getState(this)),{board,item}=itemFor(next,boardId,itemId);editable(item,actor);const asset=next.assets.find(a=>a.id===item.assetId),size=own(patch,'width')||own(patch,'height')?imageSize(asset,patch):{},geometry={...patch,...size},changed=Object.keys(geometry).some(key=>geometry[key]!==item[key]);if(changed&&actor==='agent'&&item.layout?.pinned)fail('Agent 不可移動或縮放已固定的圖像');Object.assign(item,geometry);if(changed&&actor==='human')item.layout={pinned:true};item.revision++;board.revision++;commit(this,'inquiry_image_moved',next,{board_id:board.id,item_id:item.id,actor});return clone(item)},
 applyInquiryLayout(boardId,placements,{actor='human',expectedRevision}={}){
  actorName(actor);if(!Array.isArray(placements)||placements.length>LIMIT.items)fail('畫板排版必須是受限的位置清單');
  const next=clone(getState(this)),board=boardFor(next,boardId);
  if(expectedRevision!==undefined&&(!Number.isInteger(expectedRevision)||expectedRevision!==board.revision))fail('問詢畫板已變更，請重新取得最新版本後排版');
  const ids=new Set(),moves=[];
  for(const placement of placements){
   fields(placement,['id','itemId','x','y'],'畫板排版位置');const itemId=placement.itemId??placement.id;id(itemId,'排版圖像識別');if(placement.id!==undefined&&placement.itemId!==undefined&&placement.id!==placement.itemId)fail('排版圖像識別不一致');
   if(ids.has(itemId))fail('排版圖像識別重複');ids.add(itemId);
   if(!finite(placement.x)||!finite(placement.y)||Math.abs(placement.x)>1000000||Math.abs(placement.y)>1000000)fail('畫板排版座標不合法');
   const item=board.items.find(candidate=>candidate.id===itemId);if(!item)fail('排版引用不存在的問詢圖像');
   if(item.x===placement.x&&item.y===placement.y)continue;
   if(item.layout?.pinned)fail('已固定的圖像不能自動排版');editable(item,actor);moves.push({item,x:placement.x,y:placement.y});
  }
  if(!moves.length)return clone(board);
  for(const {item,x,y}of moves){item.x=x;item.y=y;item.revision++}
  board.revision++;commit(this,'inquiry_layout_applied',next,{board_id:board.id,item_ids:moves.map(move=>move.item.id),actor});return clone(board);
 },
 setInquiryItemPinned(boardId,itemId,pinned,{actor='human'}={}){
  actorName(actor);if(actor!=='human')fail('只有工程師可以變更圖像固定狀態');if(typeof pinned!=='boolean')fail('畫板固定狀態必須是布林值');
  const next=clone(getState(this)),{board,item}=itemFor(next,boardId,itemId);
  if((item.layout?.pinned??false)===pinned)return clone(item);
  item.layout={pinned};item.revision++;board.revision++;commit(this,'inquiry_image_pinned',next,{board_id:board.id,item_id:item.id,pinned,actor});return clone(item);
 },
 removeInquiryItem(boardId,itemId,{actor='human'}={}){const next=clone(getState(this)),{board,item}=itemFor(next,boardId,itemId);editable(item,actor);if(actor==='agent'&&(item.annotations.some(a=>a.author!=='agent')||(item.geometryTools||[]).some(tool=>tool.author==='human'||tool.selection?.actor==='human')))fail('Agent 不可連同圖像刪除工程師的標註');board.items=board.items.filter(i=>i.id!==itemId);if(board.measurements)board.measurements=board.measurements.filter(m=>m.itemId!==itemId);
  for(const group of board.artifactGroups||[]){for(const key of ['itemIds','processItemIds','resultItemIds'])group[key]=group[key].filter(id=>id!==itemId);group.dependencies=group.dependencies.filter(d=>d.fromItemId!==itemId&&d.toItemId!==itemId);if(group.inputBindings)group.inputBindings=group.inputBindings.filter(b=>b.fromItemId!==itemId);const remaining=new Set(group.itemIds.map(id=>next.assets.find(a=>a.id===board.items.find(i=>i.id===id)?.assetId)?.source?.artifactId));group.classification=Object.fromEntries(Object.entries(group.classification).filter(([id])=>remaining.has(id)));}
  if(board.artifactGroups)board.artifactGroups=board.artifactGroups.filter(g=>g.itemIds.length);if(board.imageLabelBubbles)board.imageLabelBubbles=board.imageLabelBubbles.filter(l=>l.itemId!==itemId);
  board.revision++;commit(this,'inquiry_image_removed',next,{board_id:board.id,item_id:item.id,actor});return {removed:true}},
 addInquiryAnnotation(boardId,itemId,input,{actor='human'}={}){if(itemFor(getState(this),boardId,itemId).item.liveOutput)this.freezeInquiryLiveOutput(boardId,itemId,{actor});const next=clone(getState(this)),{board,item,asset}=itemFor(next,boardId,itemId),annotation=annotationValue(input,asset,{creating:true,actor});if(item.annotations.some(a=>a.id===annotation.id))fail('標註識別重複');item.annotations.push(annotation);item.revision++;board.revision++;commit(this,'inquiry_annotation_added',next,{board_id:board.id,item_id:item.id,annotation_id:annotation.id,actor});return clone(annotation)},
 updateInquiryAnnotation(boardId,itemId,annotationId,patch,{actor='human'}={}){if(!record(patch)||Object.keys(patch).some(k=>!['points','rotation','closed','text','color','strokeWidth'].includes(k)))fail('標註只可修改幾何、說明或樣式');const next=clone(getState(this)),{board,item,asset}=itemFor(next,boardId,itemId),index=item.annotations.findIndex(a=>a.id===annotationId);if(index<0)fail('問詢標註不存在');const original=item.annotations[index];editable(original,actor);const value=annotationValue({...original,...patch,revision:original.revision+1},asset);item.annotations[index]=value;item.revision++;board.revision++;commit(this,'inquiry_annotation_updated',next,{board_id:board.id,item_id:item.id,annotation_id:annotationId,actor});return clone(value)},
 removeInquiryAnnotation(boardId,itemId,annotationId,{actor='human'}={}){const next=clone(getState(this)),{board,item}=itemFor(next,boardId,itemId),annotation=item.annotations.find(a=>a.id===annotationId);if(!annotation)fail('問詢標註不存在');editable(annotation,actor);item.annotations=item.annotations.filter(a=>a.id!==annotationId);item.revision++;board.revision++;commit(this,'inquiry_annotation_removed',next,{board_id:board.id,item_id:item.id,annotation_id:annotationId,actor});return {removed:true}},
 addInquiryGeometryTool(boardId,itemId,input,{actor='human'}={}){
  if(itemFor(getState(this),boardId,itemId).item.liveOutput)this.freezeInquiryLiveOutput(boardId,itemId,{actor});
  actorName(actor);fields(input,['kind','roi','parameters','result','note'],'幾何工具輸入');const next=clone(getState(this)),{board,item,asset}=itemFor(next,boardId,itemId),binding=inquiryGeometryBinding(asset,input),at=now();
  const tool={id:uid(),kind:input.kind,roi:binding.roi,parameters:binding.parameters,inputBinding:binding,sourceAssetId:asset.id,sourcePixelVersion:binding.sourcePixelVersion,result:input.result==null?null:resultValue(input.result,binding,asset),selectedCandidateId:null,selection:null,revision:1,author:actor,createdAt:at,updatedAt:at,note:input.note||''};
  item.geometryTools=item.geometryTools||[];item.geometryTools.push(tool);item.revision++;board.revision++;commit(this,'inquiry_geometry_added',next,{board_id:board.id,item_id:item.id,tool_id:tool.id,actor});return clone(tool);
 },
 updateInquiryGeometryTool(boardId,itemId,toolId,patch,{actor='human',expectedRevision,tuningThreadId}={}){
  fields(patch,['roi','parameters','result','note'],'幾何工具修改');const next=clone(getState(this)),{board,item,asset}=itemFor(next,boardId,itemId),tool=(item.geometryTools||[]).find(t=>t.id===toolId);if(!tool)fail('幾何工具不存在');if(actor==='agent'&&tuningThreadId){assertGeometryTuning(this,{boardId,itemId,toolId,tuningThreadId});if(!Number.isInteger(expectedRevision))fail('調參必須提供最新版本');}else geometryEditable(tool,actor);if(expectedRevision!==undefined&&tool.revision!==expectedRevision)fail('幾何工具已變更，請重新取得最新版本');
  const binding=inquiryGeometryBinding(asset,{kind:tool.kind,roi:patch.roi??tool.roi,parameters:patch.parameters??tool.parameters}),changed=stable(binding)!==stable(tool.inputBinding);if(own(patch,'parameters'))tool.parameterAuthors=Object.fromEntries(Object.keys(binding.parameters).map(key=>[key,tool.parameters[key]===binding.parameters[key]?(tool.parameterAuthors?.[key]||'human'):actor]));tool.roi=binding.roi;tool.parameters=binding.parameters;tool.inputBinding=binding;tool.sourcePixelVersion=binding.sourcePixelVersion;
  // Moving/resizing an ROI or changing parameters always clears both old pixels and intent.
  if(changed||own(patch,'result')){tool.result=changed?null:patch.result==null?null:resultValue(patch.result,binding,asset);tool.selectedCandidateId=null;tool.selection=null}
  if(changed&&own(patch,'result')&&patch.result!==null)fail('ROI 或參數改變時請先保存新設定，再對新綁定運算');
  if(own(patch,'note'))tool.note=patch.note;tool.revision++;tool.updatedAt=now();item.revision++;board.revision++;commit(this,'inquiry_geometry_updated',next,{board_id:board.id,item_id:item.id,tool_id:tool.id,invalidated:changed,actor});return clone(tool);
 },
 selectInquiryGeometryCandidate(boardId,itemId,toolId,candidateId,{actor='human'}={}){
  actorName(actor);const next=clone(getState(this)),{board,item}=itemFor(next,boardId,itemId),tool=(item.geometryTools||[]).find(t=>t.id===toolId);if(!tool)fail('幾何工具不存在');if(actor==='agent'&&tool.selection?.actor==='human')fail('Agent 不可覆寫工程師的候選選擇');
  if(candidateId!==null){id(candidateId,'候選識別');const candidate=tool.result?.candidates.find(c=>c.id===candidateId);if(!candidate||!candidate.accepted||candidate.status!=='ACCEPTED'||!candidate.gates.length||candidate.gates.some(gate=>gate.status!=='PASS'))fail('只能選擇本次實算且全部合格的候選')}
  tool.selectedCandidateId=candidateId;tool.selection=candidateId===null?null:{candidateId,actor,at:now()};tool.revision++;tool.updatedAt=now();item.revision++;board.revision++;commit(this,'inquiry_geometry_selected',next,{board_id:board.id,item_id:item.id,tool_id:tool.id,candidate_id:candidateId,actor});return clone(tool);
 },
 removeInquiryGeometryTool(boardId,itemId,toolId,{actor='human'}={}){
  const next=clone(getState(this)),{board,item}=itemFor(next,boardId,itemId),tool=(item.geometryTools||[]).find(t=>t.id===toolId);if(!tool)fail('幾何工具不存在');geometryEditable(tool,actor);item.geometryTools=item.geometryTools.filter(t=>t.id!==toolId);item.revision++;board.revision++;commit(this,'inquiry_geometry_removed',next,{board_id:board.id,item_id:item.id,tool_id:tool.id,actor});return {removed:true};
 },
 inquiryContext({boardId}={}){const state=getState(this),selectedId=boardId||state.activeBoardId;return {schema:SCHEMA,activeBoardId:state.activeBoardId,boards:state.boards.map(b=>({id:b.id,title:b.title,revision:b.revision,itemCount:b.items.length})),board:selectedId?compactBoard(state,boardFor(state,selectedId)):null,assets:state.assets.map(compactAsset),scope:'視覺討論快照；不更改算法、ROI、人工答案或驗收狀態。來源可能是歷史 run，需另核對當前結果。'}},
 captureInquirySnapshot(boardId,{allowUnavailable=false,itemIds}={}){const state=getState(this),board=boardFor(state,boardId||state.activeBoardId),unavailable=[];if(itemIds!==undefined&&(!Array.isArray(itemIds)||itemIds.length>LIMIT.items||new Set(itemIds).size!==itemIds.length||itemIds.some(id=>typeof id!=='string'||!board.items.some(i=>i.id===id))))fail('提問圖像選取必須是目前畫板中不重複的物件識別');const selected=itemIds===undefined?board.items:board.items.filter(i=>itemIds.includes(i.id));for(const item of selected)if(item.liveOutput){const resolved=liveOutputState(this,item),asset=state.assets.find(a=>a.id===item.assetId);if(!resolved.frameAvailable||item.liveOutputFrame?.frameKey!==resolved.frameKey||asset.source?.runId!==resolved.runId||asset.source?.artifactId!==resolved.artifactId||resolved.frameAvailable&&asset.dataURL!==resolved.reference.dataURL){if(!allowUnavailable)fail('即時圖尚未完成當前工件更新，不能將舊圖作為本次提問依據：'+resolved.reason);unavailable.push({itemId:item.id,...liveOutputSummary(resolved)});}}const omitted=new Set(unavailable.map(i=>i.itemId)),captured=compactBoard(state,{...board,items:selected});captured.items=captured.items.filter(item=>!omitted.has(item.id));if(!allowUnavailable)pinCapturedLiveAssets(this,captured.items.filter(i=>i.liveOutput).map(i=>i.assetId));for(const item of captured.items)if(item.liveOutput){item.frozenLiveOutput={...item.liveOutput,frame:clone(item.liveOutputFrame),frozenAt:now()};delete item.liveOutput;delete item.liveOutputFrame;}return freeze({...captured,...(unavailable.length?{unavailableLiveOutputs:unavailable}:{}),...(board.projectSpaces?{projectReferenceRecords:withoutPixels((this.data.workflow?.references||[]).filter(r=>board.projectSpaces.references.some(space=>space.referenceIds.includes(r.id)))),projectProfiles:withoutPixels(this.data.workflow?.profiles||[])}:{}),schema:'agentcv-visual-inquiry-snapshot-1',capturedAt:now(),scope:'frozen visual question; original pixels and historical source bindings are retained separately'})}
};
