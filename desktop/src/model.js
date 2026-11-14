import {jsonSnapshot,projectSnapshot,immutableJson} from './json-snapshot.js';
import {serializeProject} from './project-serialization.js';
import {canvasThreadMethods} from './canvas-thread-model.js';
import {artifactGroupMethods} from './canvas-artifact-groups.js';
import {canvasProjectMethods} from './canvas-project-model.js';
import '../../assets/vision-core.js';
import '../../assets/pipeline-core.js';
import {encodedImageSha256,encodedImageDimensions} from './image.js';
import {DatasetImageStore,validImageAssetRef,rasterBytes,imageAssetIdentity} from './dataset-image-store.js';
export const C=globalThis.AgentCVCore, P=globalThis.AgentCVPipeline;
export const sides=['top','bottom','left','right'];
export const sideNames={top:'上邊',bottom:'下邊',left:'左邊',right:'右邊'};
export const clone=jsonSnapshot;
const uid=()=>globalThis.crypto.randomUUID();
function applyDecodedImage(img,raster,warnings,knownFileIdentity=!!img.contentSha256){
 if(img.width!==raster.width||img.height!==raster.height)throw Error('原圖尺寸與專案紀錄不一致');
 const contentSha256=raster.contentSha256||img.contentSha256||null;
 if(img.contentSha256&&raster.contentSha256&&img.contentSha256!==raster.contentSha256)throw Error(`原圖檔案內容雜湊不一致：${img.name||img.id}`);
 if(img.sha256&&raster.sha256&&img.sha256!==raster.sha256){
  const warning={code:knownFileIdentity?'IMAGE_DECODE_CHANGED':'LEGACY_IMAGE_PIXEL_IDENTITY_UNVERIFIED',imageId:img.id,imageName:img.name||img.id,previousSha256:img.sha256,currentSha256:raster.sha256,contentSha256,sourceIntegrity:knownFileIdentity?'VERIFIED_FILE_BYTES':'LEGACY_BYTES_NOT_PREVIOUSLY_HASHED',message:'解碼像素與保存時不同；舊計算保留為歷史，需重新驗證。'};
  warnings.push(warning);img.decodeHistory=[...(Array.isArray(img.decodeHistory)?img.decodeHistory:[]),{...warning,at:new Date().toISOString(),previousDecoder:img.decoder||null,currentDecoder:raster.decoder||null}].slice(-8);
 }
 img.sha256=raster.sha256;if(contentSha256)img.contentSha256=contentSha256;if(raster.decoder)img.decoder=clone(raster.decoder);
}
export class Project {
  constructor(execute=async(image,tool)=>C.detect(image,tool)) {this.execute=execute;this.listeners=[];this.imageStore=new DatasetImageStore(this);this.pixels=this.imageStore.cache;this.imageLoadErrors=new Map();this.imageLoadTokens=new WeakMap();this.undoStack=[];this.redoStack=[];this.pending=new Map();this.epoch=0;this.newProject();}
  newProject(){this.epoch++;this.loadSequence=(this.loadSequence||0)+1;this.imageStore?.reset();this.imageLoadErrors?.clear();this.loadWarnings=[];this.data={schema:'agentcv-desktop-0.8',images:[],activeId:null,config:{revision:1,measurements:[],tolerances:[],classes:[],calibration:null,recipe:null},events:[],chat:[]};this.pixels.clear();this.undoStack=[];this.redoStack=[];this.dirty=false;this.notify();}
  get image(){return this.imageRecord(this.data.activeId)}
  imageRecord(id){if(this.imageIndexData!==this.data||this.imageIndexSize!==this.data.images.length){this.imageIndex=new Map(this.data.images.map(image=>[image.id,image]));this.imageIndexData=this.data;this.imageIndexSize=this.data.images.length;}return this.imageIndex.get(id)}
  configureImageStore(options){this.imageStore.configure(options);return this.cacheInfo()}
  async observeImageLoad(id,operation){
    const record=this.imageRecord(id),epoch=this.epoch,generation=this.imageStore.generation,token={};if(record)this.imageLoadTokens.set(record,token);
    const current=()=>epoch===this.epoch&&generation===this.imageStore.generation&&this.imageRecord(id)===record,latest=()=>current()&&record&&this.imageLoadTokens.get(record)===token;
    try{const value=await operation(record);if(!current())throw Error('專案已改變，未採用舊圖像讀取');if(latest())this.imageLoadErrors.delete(id);return value;}
    catch(error){if(latest()){this.imageLoadErrors.set(id,String(error?.message||error));this.pixels.delete(id);for(const [key,thumbnail]of this.imageStore.thumbnails)if(thumbnail.imageId===id){this.imageStore.thumbnailBytes-=thumbnail.dataURL.length*2;this.imageStore.thumbnails.delete(key);}}throw error;}
  }
  readImageAsset(id){return this.observeImageLoad(id,record=>this.imageStore.read(record))}
  async readImageDisplay(id){let display;try{return await this.observeImageLoad(id,async record=>display=await this.imageStore.readDisplay(record));}catch(error){display?.dispose();throw error;}}
  readImageThumbnail(id,options){return this.observeImageLoad(id,async record=>{if(this.imageLoadErrors.has(id))await this.imageStore.read(record);return this.imageStore.thumbnail(id,options)})}
  ensureImagePixels(id=this.data.activeId){return this.observeImageLoad(id,async record=>{if(this.imageLoadErrors.has(id))await this.imageStore.read(record);return this.imageStore.ensure(id)})}
  pinImages(ids){return this.imageStore.pin(ids)}
  async withImagePixels(ids,callback){const release=this.pinImages(ids);try{return await callback(await Promise.all(ids.map(id=>this.ensureImagePixels(id))))}finally{release()}}
  cacheInfo(){return this.imageStore.info()}
  imageIdentity(id=this.data.activeId){return imageAssetIdentity(this.imageRecord(id))}
  listImageRecords({offset=0,limit=50,sourceId,imageIds,query=''}={}){
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error('圖片分頁範圍無效；每頁最多200筆');
    const key=String(query).toLocaleLowerCase();if(imageIds&&(!Array.isArray(imageIds)||new Set(imageIds).size!==imageIds.length))throw Error('圖片來源清單無效或重複');
    let sourceImages=null;
    if(sourceId){
      const sources=(this.data.visualInquiry?.boards||[]).flatMap(board=>board.projectSpaces?.sources||[]).filter(source=>source.id===sourceId);
      if(sources.length>1)throw Error('圖像源識別在多個畫板重複，請先修正來源');
      if(sources.length)sourceImages=sources[0].imageIds||[];
      else if(!this.data.images.some(image=>image.sourceId===sourceId))throw Error('圖像源不存在：'+sourceId);
    }
    const sourceSet=sourceImages&&imageIds?new Set(sourceImages):null;const ids=sourceImages?(imageIds?imageIds.filter(id=>sourceSet.has(id)):sourceImages):imageIds;
    const base=ids?ids.map(id=>{const image=this.imageRecord(id);if(!image)throw Error('圖片來源引用不存在：'+id);return image;}):this.data.images;
    const rows=sourceId&&!sourceImages||key?base.filter(image=>(!sourceId||!!sourceImages||image.sourceId===sourceId)&&(!key||String(image.name||'').toLocaleLowerCase().includes(key))):base;
    const fields=['id','name','filename','width','height','sourceId','sha256','contentSha256','profileId','status','labels','groundTruth','expected','decoder','sourceMeaning','source_relative_path'];
    return {items:rows.slice(offset,offset+limit).map(record=>{const item=Object.fromEntries(fields.filter(field=>record[field]!==undefined).map(field=>[field,clone(record[field])]));if(record.assetRef?.size!==undefined)item.encodedBytes=record.assetRef.size;return item;}),offset,limit,total:rows.length,...(sourceId?{sourceId}:{} )};
  }

  acceptDecodedImage(image,raster){applyDecodedImage(image,raster,this.loadWarnings)}
  get config(){return this.data.config}
  on(fn){this.listeners.push(fn);return()=>this.listeners=this.listeners.filter(f=>f!==fn)}
  notify(){this.listeners.forEach(f=>f())}
  checkpoint(){this.undoStack.push(projectSnapshot(this.data));if(this.undoStack.length>30)this.undoStack.shift();this.redoStack=[];}
  event(action,detail={}){this.data.events.push(immutableJson({id:uid(),at:new Date().toISOString(),action,image_id:this.data.activeId,...detail}));this.dirty=true;this.notify();}
  mutate(action,fn,detail={}){this.checkpoint();fn();this.event(action,detail)}
  undo(){if(!this.undoStack.length)return;this.redoStack.push(projectSnapshot(this.data));this.data=this.undoStack.pop();this.epoch++;this.pending.clear();this.imageStore.reset({keepCache:true});this.dirty=true;this.notify();}
  redo(){if(!this.redoStack.length)return;this.undoStack.push(projectSnapshot(this.data));this.data=this.redoStack.pop();this.epoch++;this.pending.clear();this.imageStore.reset({keepCache:true});this.dirty=true;this.notify();}
  prepareLoadedData(data){}
  async load(data,decode){
    if(!['agentcv-project-0.5','agentcv-desktop-0.8'].includes(data.schema)||!Array.isArray(data.images))throw Error('不支援的專案格式');
    const token=this.loadSequence=(this.loadSequence||0)+1,loadEpoch=this.epoch,next=clone(data);
    // Subclasses validate and normalize this detached candidate before decoding
    // or publishing it. One private copy is enough for atomic load isolation.
    this.prepareLoadedData(next);
    const loadWarnings=[],knownFileIdentities=new Map(next.images.map(image=>[image.id,!!image.contentSha256||!!image.assetRef]));next.events=Array.isArray(next.events)?next.events:[];next.chat=Array.isArray(next.chat)?next.chat:[];
    next.config={revision:1,measurements:[],tolerances:[],classes:[],calibration:null,recipe:null,...next.config};
    const ids=new Set();this.imageStore.configure({decode});
    for(const img of next.images){
      if(typeof img.id!=='string'||ids.has(img.id)||!Array.isArray(img.objects)||img.objects.length>500||!(typeof img.dataURL==='string'&&img.dataURL||validImageAssetRef(img.assetRef)))throw Error('圖片或物件資料不完整');ids.add(img.id);
      if(!Number.isSafeInteger(img.width)||!Number.isSafeInteger(img.height)||img.width<1||img.height<1)throw Error('原圖尺寸資料不完整');
      if(img.assetRef){if(!validImageAssetRef(img.assetRef))throw Error('圖片資產引用格式錯誤');if(img.contentSha256&&img.contentSha256!==img.assetRef.sha256)throw Error('原圖檔案內容雜湊不一致');img.contentSha256=img.assetRef.sha256;}
      else if(img.dataURL.startsWith('data:image/')){const digest=await encodedImageSha256(img.dataURL);if(img.contentSha256&&img.contentSha256!==digest)throw Error(`原圖檔案內容雜湊不一致：${img.name||img.id}；未載入或取代目前專案`);img.contentSha256=digest;}
      img.desktop_refs=img.desktop_refs||{};
      const refs=next.config.frame_sources||{},frame=next.config.measurements.find(m=>m.kind==='frame_width');
      for(const [s,index] of sides.map((s,i)=>[s,i])){const id=img.desktop_refs[s]||refs[s]||(frame?[frame.a,frame.b,frame.c,frame.d][index]:null);if(img.objects.some(o=>o.id===id&&o.type==='find_line'))img.desktop_refs[s]=id;else delete img.desktop_refs[s];}
      const lines=img.objects.filter(o=>o.type==='line'&&o.role!=='ignore'),h=lines.filter(o=>Math.abs(o.to.x-o.from.x)>Math.abs(o.to.y-o.from.y)),v=lines.filter(o=>!h.includes(o));
      h.sort((a,b)=>a.from.y+a.to.y-b.from.y-b.to.y);v.sort((a,b)=>a.from.x+a.to.x-b.from.x-b.to.x);
      img.desktop_intents=img.desktop_intents||{};
      // Only legacy files lack explicit side intent bindings. Never infer over a saved desktop mapping.
      if(data.schema==='agentcv-project-0.5'){
        if(h.length===2){img.desktop_intents.top??=h[0].id;img.desktop_intents.bottom??=h[1].id;}if(v.length===2){img.desktop_intents.left??=v[0].id;img.desktop_intents.right??=v[1].id;}
        if(h.length===1){const y=(h[0].from.y+h[0].to.y)/2;if(y<img.height*.3)img.desktop_intents.top??=h[0].id;else if(y>img.height*.7)img.desktop_intents.bottom??=h[0].id;}
      }
      for(const side of sides){if(!img.desktop_refs[side]){const linked=img.objects.find(o=>o.kind==='tool'&&o.drawing_source_id===img.desktop_intents[side]);if(linked)img.desktop_refs[side]=linked.id;}}
      for(const o of img.objects.filter(o=>o.kind==='tool')){o.previous_result=o.result;o.result={status:'STALE',reason:'已載入舊資料，請在本頁重新確認'};}
      img.previous_result=img.result;delete img.result;img.revision=img.revision||0;
    }
    next.schema='agentcv-desktop-0.8';if(!ids.has(next.activeId))next.activeId=next.images[0]?.id||null;
    // Loading metadata never decodes the whole dataset. Validate the current
    // visible frame before replacing the open project, so failures stay atomic.
    const active=next.images.find(image=>image.id===next.activeId);let activeRaster;
    if(active){activeRaster=await decode(await this.imageStore.read(active));applyDecodedImage(active,activeRaster,loadWarnings,knownFileIdentities.get(active.id));if(rasterBytes(activeRaster)>this.pixels.maxBytes)throw Error('目前圖片超過像素快取預算，專案未被取代');}
    if(token!==this.loadSequence||this.epoch!==loadEpoch)throw Error('專案載入已被較新的操作取代');
    next.events=next.events.map(event=>immutableJson(event));
    this.epoch++;this.pending.clear();this.data=next;this.imageStore.reset();if(activeRaster)this.pixels.set(active.id,activeRaster);this.loadWarnings=loadWarnings;this.imageLoadErrors.clear();this.undoStack=[];this.redoStack=[];this.dirty=false;this.notify();
  }
  async addImages(files,decode){
    this.imageStore.configure({decode});const loaded=[],epoch=this.epoch;
    for(const f of files){
      const dataURL=f.dataUrl||f.dataURL||'',assetRef=f.assetRef;let raster,dimensions=assetRef?{width:f.width,height:f.height}:encodedImageDimensions(dataURL);
      // Legacy custom decoders can supply dimensions for non-file identifiers.
      // Real PNG/JPEG/BMP/WebP imports do not decode here.
      if(!dimensions){raster=await decode(dataURL);dimensions=raster;}
      if(!Number.isSafeInteger(dimensions.width)||!Number.isSafeInteger(dimensions.height)||dimensions.width<1||dimensions.height<1||assetRef&&!validImageAssetRef(assetRef))throw Error('圖片尺寸或資產引用無效');
      const contentSha256=assetRef?.sha256||(dataURL.startsWith('data:image/')?await encodedImageSha256(dataURL):raster?.contentSha256||null),image={id:uid(),name:f.name,original_name:f.name,source_path:f.sourcePath||f.source_path||f.name,...(f.sourceRelativePath?{source_relative_path:f.sourceRelativePath}:{}),dataURL, ...(assetRef?{assetRef:clone(assetRef)}:{}),width:dimensions.width,height:dimensions.height,sha256:raster?.sha256||null,...(contentSha256?{contentSha256}:{}),...(raster?.decoder?{decoder:clone(raster.decoder)}:{}),objects:[],desktop_refs:{},desktop_intents:{},expected:{},revision:0,...(f.sourceId?{sourceId:f.sourceId}:{})};loaded.push({image,raster});
    }
    if(epoch!==this.epoch)throw Error('專案已切換，未加入舊圖片');
    // Decode only the initial visible frame before applying an import.
    if(!this.image&&loaded.length&&!loaded[0].raster){loaded[0].raster=await decode(await this.imageStore.read(loaded[0].image));applyDecodedImage(loaded[0].image,loaded[0].raster,[]);}
    if(epoch!==this.epoch)throw Error('專案已切換，未加入舊圖片');this.checkpoint();for(const {image}of loaded)this.data.images.push(image);if(!this.image)this.data.activeId=loaded[0]?.image.id||null;for(const {image,raster}of loaded)if(raster)this.pixels.set(image.id,raster);this.event('images_imported',{count:loaded.length});
  }
  selectImage(id){
    if(!this.imageRecord(id))throw Error('圖片不存在');const token=this.imageSelection=(this.imageSelection||0)+1,epoch=this.epoch,cached=this.pixels.get(id);
    if(cached&&!this.imageLoadErrors.has(id)){this.data.activeId=id;this.onImageSelected?.(id);this.notify();return Promise.resolve(cached);}
    const release=this.pinImages([id]),ready=this.ensureImagePixels(id);ready.then(()=>{if(epoch===this.epoch&&token===this.imageSelection){this.data.activeId=id;this.onImageSelected?.(id);this.notify();}},error=>{if(epoch===this.epoch&&token===this.imageSelection)this.notify();}).finally(release);return ready;
  }

  tool(side,img=this.image){return img?.objects.find(o=>o.id===img.desktop_refs?.[side])}
  intent(side){return this.image?.objects.find(o=>o.id===this.image.desktop_intents?.[side])}
  invalidate(img=this.image){img.revision=(img.revision||0)+1;if(img.result){img.previous_result=img.result;delete img.result}}
  startInvalidation(side){const tool=this.tool(side);if(!tool)return;this.pending.delete(tool.id);tool.result={status:'STALE',reason:'搜尋框正在修改'};this.invalidate();this.notify()}
  drawIntent(side,from,to){if(!sides.includes(side))throw Error('未知邊緣');const img=this.image;if(Math.hypot(to.x-from.x,to.y-from.y)<12)throw Error('請沿直邊畫一段較長的線');const horizontal=Math.abs(to.x-from.x)>Math.abs(to.y-from.y);if(horizontal!==['top','bottom'].includes(side))throw Error(`目前是${sideNames[side]}，請沿${horizontal?'垂直':'水平'}方向畫線`);
    this.mutate('intent_drawn',()=>{const oldIntent=this.intent(side),old=this.tool(side);const line={id:uid(),kind:'drawing',type:'line',from,to,name:sideNames[side]+'意圖',number:img.objects.length+1,visible:true};img.objects=img.objects.filter(o=>o.id!==oldIntent?.id&&o.id!==old?.id);img.objects.push(line);img.desktop_intents[side]=line.id;delete img.desktop_refs[side];this.invalidate()}, {side,from,to});
  }
  makeTool(side){const existing=this.tool(side);if(existing)return existing;const intent=this.intent(side);if(!intent)throw Error('請先在圖片上指出這條邊');const img=this.image,b=C.bounds(intent),pad=16;
    const tool={id:uid(),kind:'tool',type:'find_line',name:sideNames[side]+'搜尋',number:img.objects.length+1,x:Math.max(0,b.x-pad),y:Math.max(0,b.y-pad),width:Math.min(img.width, b.x+b.w+pad)-Math.max(0,b.x-pad),height:Math.min(img.height,b.y+b.h+pad)-Math.max(0,b.y-pad),drawing_source_id:intent.id,params:{threshold:18,polarity:'any',orientation:['top','bottom'].includes(side)?'horizontal':'vertical',profileWidth:1,maxAngle:20},revision:1,result:{status:'STALE'}};
    this.mutate('search_created',()=>{img.objects.push(tool);img.desktop_refs[side]=tool.id;this.invalidate()},{side});return tool;
  }
  async detect(side){const tool=this.makeTool(side),img=this.image,epoch=this.epoch,token=uid();this.pending.set(tool.id,token);tool.result={status:'RUNNING'};this.invalidate(img);this.notify();
    try{const excludes=img.objects.filter(o=>o.role==='ignore'&&['rect','circle'].includes(o.type));const r=await this.execute(this.pixels.get(img.id),clone({...tool,exclude_rois:excludes}));
      if(epoch!==this.epoch||this.pending.get(tool.id)!==token)return;
      r.run_id=token;r.input={image:{id:img.id,sha256:img.sha256},roi:{x:tool.x,y:tool.y,width:tool.width,height:tool.height},parameters:clone(tool.params),exclude_rois:clone(excludes)};
      if(r.candidates)r.candidates.forEach((c,i)=>c.id=token+':'+(i+1));tool.result=r;this.event('edge_detected',{side,tool_id:tool.id,run_id:token,candidates:r.candidates?.length||0});
    }catch(e){if(epoch===this.epoch&&this.pending.get(tool.id)===token){tool.result={status:'ERROR',reason:e.message};this.notify()}throw e}finally{if(this.pending.get(tool.id)===token)this.pending.delete(tool.id)}
  }
  async updateROI(side,roi,params={},checkpoint=true){const tool=this.tool(side);if(!tool)throw Error('尚未建立搜尋框');const {width,height}=this.image;
    if(![roi.x,roi.y,roi.width,roi.height].every(Number.isFinite)||roi.width<10||roi.height<10||roi.x<0||roi.y<0||roi.x+roi.width>width||roi.y+roi.height>height)throw Error('搜尋框必須在圖片內，且至少 10 × 10 px');
    if(checkpoint)this.checkpoint();Object.assign(tool,roi);tool.params={...tool.params,...params};tool.revision=(tool.revision||0)+1;this.invalidate();this.event('search_changed',{side,roi,parameters:tool.params});await this.detect(side);
  }
  adopt(side,candidateId,reason='人工在畫板選取'){const tool=this.tool(side);if(!tool)throw Error('搜尋框不存在');this.mutate('candidate_adopted',()=>{tool.result=C.choose(tool.result,[candidateId],tool.result.run_id);tool.selection_reason=reason;this.invalidate()},{side,candidate_id:candidateId,reason});}
  removeEdge(side){this.mutate('edge_deleted',()=>{const ids=[this.tool(side)?.id,this.intent(side)?.id];this.image.objects=this.image.objects.filter(o=>!ids.includes(o.id));delete this.image.desktop_refs[side];delete this.image.desktop_intents[side];this.invalidate()},{side})}
  setNote(side,text){const o=this.tool(side)||this.intent(side);if(o)this.mutate('annotation_edited',()=>{o.note=text},{side,text})}
  ready(){return sides.every(s=>P.geometry(this.tool(s))?.type==='line')}
  definitions(img=this.image){if(!img)return [];const refs=img.desktop_refs;return ['frame_width','frame_height'].map((kind,i)=>({id:kind,name:i?'外框高度':'外框寬度',kind,a:refs.top,b:refs.bottom,c:refs.left,d:refs.right,unit:'px'}))}
  measurements(img=this.image){return this.definitions(img).map(m=>P.measure(m,img.objects,null,img))}
  tolerances(){return this.definitions().map(m=>{const old=this.config.measurements.find(x=>x.kind===m.kind);return this.config.tolerances.find(t=>t.measurement_id===m.id||t.measurement_id===old?.id)}).filter(Boolean).map((t,i)=>t)}
  tolerance(kind){const old=this.config.measurements.find(m=>m.kind===kind);return this.config.tolerances.find(t=>t.measurement_id===kind||t.measurement_id===old?.id)}
  setTolerance(kind,min,max){if(!['frame_width','frame_height'].includes(kind)||![min,max].every(Number.isFinite)||min>max)throw Error('請填寫有效的上下限，下限不能大於上限');this.mutate('tolerance_set',()=>{const old=this.tolerance(kind);this.config.tolerances=this.config.tolerances.filter(t=>t!==old);this.config.tolerances.push({id:uid(),measurement_id:kind,min,max,unit:'px'});this.config.revision++;for(const img of this.data.images)this.invalidate(img)},{kind,min,max,unit:'px'})}
  decision(img=this.image){const rules=['frame_width','frame_height'].map(kind=>{const t=this.tolerance(kind);return t?{...t,measurement_id:kind}:null}).filter(Boolean);return {...P.classify(this.measurements(img),rules,[]),measurements:this.measurements(img)}}
  run(){const img=this.image;if(!img)throw Error('請先導入圖片');const result={...this.decision(),at:new Date().toISOString(),revision:img.revision,config_revision:this.config.revision};img.result=result;this.event('image_classified',{status:result.status});return result}
  async runBatch(progress=()=>{},cancel=()=>false){if(!this.ready())throw Error('請先確認參考圖的四條邊');const ref=this.image,defs=this.definitions(),rules=['frame_width','frame_height'].map(kind=>{const t=this.tolerance(kind);return t?{...t,measurement_id:kind}:null}).filter(Boolean);const recipe=P.capture(ref.objects,defs,{positionTolerance:12,angleTolerance:3,radiusTolerance:35},ref);this.config.recipe=recipe;const config={measurements:defs,tolerances:rules,classes:[],calibration:null},epoch=this.epoch;
    for(let i=0;i<this.data.images.length;i++){if(cancel()||epoch!==this.epoch)break;const img=this.data.images[i];progress(i,this.data.images.length);const result=await this.execute(this.pixels.get(img.id),null,{recipe,config,identity:{id:img.id,sha256:img.sha256}});if(epoch!==this.epoch)break;img.previous_result=img.result;img.result={...result,at:new Date().toISOString(),revision:img.revision,config_revision:this.config.revision};img.objects=result.objects.length?result.objects:img.objects;img.desktop_refs=clone(ref.desktop_refs);this.event('batch_image_classified',{target_image_id:img.id,status:result.status});}progress(this.data.images.length,this.data.images.length)
  }
  context(side,page){const img=this.image;return {page,active_side:side,goal:'工件外框寬度／高度',image:img?{id:img.id,width:img.width,height:img.height}:null,edges:sides.map(s=>{const t=this.tool(s),intent=this.intent(s);return {side:s,intent:intent?{from:intent.from,to:intent.to}:null,roi:t?{x:t.x,y:t.y,width:t.width,height:t.height}:null,params:t?.params,note:t?.note,status:t?.result?.status,run_id:t?.result?.run_id,candidates:t?.result?.candidates?.map(c=>({id:c.id,geometry:c.geometry,coverage:c.coverage,quality:c.quality})),selected_ids:t?.result?.selected_ids}}),measurements:img?this.measurements():[],tolerances:['frame_width','frame_height'].map(k=>this.tolerance(k)).filter(Boolean)}}
  serialize(){return serializeProject({...this.data,saved_at:new Date().toISOString()},2)}
}

Object.assign(Project.prototype,canvasProjectMethods);

Object.assign(Project.prototype,artifactGroupMethods);

Object.assign(Project.prototype,canvasThreadMethods);
