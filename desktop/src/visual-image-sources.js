import {fitPipelineViewport,observedPipelineBounds} from './pipeline-viewport.js';
import {algorithmRunCurrent} from './algorithm-workspace.js';

// A source ID denotes one captured image/run, never whichever image is active later.
// This module reads the workbench; registering/adding assets is the caller's choice.
const clone=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
const now=()=>new Date().toISOString();
const metadataClone=value=>JSON.parse(JSON.stringify(value,(key,item)=>['dataURL','dataUrl','base64'].includes(key)||typeof item==='string'&&/^data:image\//.test(item)?undefined:item));
const originalIdentity=image=>JSON.stringify([image?.id,image?.contentSha256||image?.assetRef?.sha256||image?.sha256||null,image?.width,image?.height]);
// Hash only indexes local payloads; an exact-payload comparison below guards collisions.
function payloadKey(value){let a=2166136261,b=5381;for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b,33)^value.charCodeAt(i)}return `${value.length}:${a>>>0}:${b>>>0}`}
const uid=()=>`visual-source-${globalThis.crypto.randomUUID()}`;
const localRaster=value=>typeof value==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
const LIMIT={bytes:12*1024*1024,pixels:180000000,edge:32768,svgBytes:16*1024*1024,entries:512,cacheBytes:32*1024*1024,page:50,pageMax:200,collect:8,collectMax:16,collectBytes:24*1024*1024,pending:8};
function dimensions(width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>LIMIT.edge||height>LIMIT.edge||width*height>LIMIT.pixels)throw Error('圖像快照尺寸無效或過大');return {width,height}}
function rasterURL(dataURL){if(!localRaster(dataURL)||dataURL.length>LIMIT.bytes)throw Error('圖像必須是 12 MB 以內的本地 PNG、JPEG 或 WebP；原圖不會自動縮小');return dataURL}
function short(value,max=240){return String(value||'圖像').slice(0,max)}
function graphic(element){let node=element;while(node&&node.nodeType!==1)node=node.parentElement;if(!node)return null;const tag=String(node.tagName||'').toLowerCase();if(['canvas','img','svg'].includes(tag))return node;const svg=node.closest?.('svg');return svg||node.querySelector?.('canvas,img,svg')||null}
function kindOf(op=''){return /gray|grey/.test(op)?'gray':/otsu|threshold|binary/.test(op)?'otsu':/component|connect/.test(op)?'components':/gear|tooth/.test(op)?'gear':/ring|annul|concentric/.test(op)?'ring':/hole/.test(op)?'holes':/rule|classif|decision/.test(op)?'rules':/source|image_input/.test(op)?'source':'feature'}
function nodeArtifacts(result,node){return node?.artifacts?.length?node.artifacts:(result?.artifacts||[]).filter(a=>a.nodeId===node?.id)}
function nodeInput(node){const inputs=node?.inputs;return (Array.isArray(inputs)?inputs:Object.values(inputs||{})).map(v=>typeof v==='string'?v:v?.nodeId||v?.node||v?.source).filter(Boolean)}
function bindingOf(image,plan,result,node,extra={}){return {imageId:image?.id||null,inputSha256:image?.sha256||null,pipelineId:plan?.id||null,pipelineRevision:plan?.revision??null,runId:result?.runId||null,nodeId:node?.id||null,artifactId:nodeArtifacts(result,node).map(a=>a.id).filter(Boolean).join(',')||null,artifactIds:nodeArtifacts(result,node).map(a=>a.id).filter(Boolean),parameters:clone(node?.parameters||node?.params||{}),currentAtCapture:true,coordinateSpace:'render-pixels',...extra}}
function canvas(width,height){const node=document.createElement('canvas');Object.assign(node,dimensions(width,height));const ctx=node.getContext('2d');if(!ctx)throw Error('無法建立圖像快照');ctx.imageSmoothingEnabled=false;return {node,ctx}}
function canvasURL(node){dimensions(node.width,node.height);try{const ctx=node.getContext('2d');if(!ctx?.getImageData)throw Error('尚無可驗證的圖像像素，請等待畫面完成');let painted=false;for(let y=0;y<node.height&&!painted;y+=32)for(let x=0;x<node.width&&!painted;x+=1024){const pixels=ctx.getImageData(x,y,Math.min(1024,node.width-x),Math.min(32,node.height-y)).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i]){painted=true;break}}if(!painted)throw Error('畫面尚未繪製有效像素，不能引用透明占位圖');return rasterURL(node.toDataURL('image/png'))}catch(error){if(error?.name==='SecurityError')throw Error('只能引用本機可讀的圖像，這張畫面含外部受限資源');throw error}}
function svgPayload(svg){
 if(svg.ownerDocument!==globalThis.document)throw Error('只能引用此工作台產生的 SVG 圖解');
 const nodes=[svg,...svg.querySelectorAll('*')];if(nodes.length>20000)throw Error('SVG 圖解過大');
 for(const node of nodes){
  if(/^(script|foreignobject|iframe|object|embed|audio|video|animate|animatetransform|animatemotion|set)$/i.test(node.localName||node.tagName))throw Error('圖解包含不支援的主動內容');
  for(const attribute of Array.from(node.attributes||[])){
   const name=attribute.name.toLowerCase(),value=attribute.value.trim();
   if(name.startsWith('on')||name==='src'||/javascript:|@import/i.test(value))throw Error('圖解包含不支援的外部內容');
   if((name==='href'||name.endsWith(':href'))&&value&&!value.startsWith('#')&&!localRaster(value))throw Error('圖解只能內嵌本地像素，不可讀取外部連結');
   for(const match of value.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi))if(!match[1].startsWith('#'))throw Error('圖解不能載入外部樣式資源');
  }
  if((node.localName||'').toLowerCase()==='style'&&(/@import|javascript:|url\(\s*['"]?(?!#)/i.test(node.textContent||'')))throw Error('圖解不能載入外部樣式資源');
 }
 const view=svg.viewBox?.baseVal,rect=svg.getBoundingClientRect?.(),width=Math.round(view?.width||Number(svg.getAttribute('width'))||rect?.width||960),height=Math.round(view?.height||Number(svg.getAttribute('height'))||rect?.height||540);
 dimensions(width,height);const copy=svg.cloneNode(true);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('width',String(width));copy.setAttribute('height',String(height));
 const xml=new XMLSerializer().serializeToString(copy);if(xml.length>LIMIT.svgBytes)throw Error('SVG 圖解過大');return {xml,width,height};
}
async function rasterizeSVG(payload){const image=new Image(),url=URL.createObjectURL(new Blob([payload.xml],{type:'image/svg+xml'}));try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('無法將圖解轉成可引用的 PNG'));image.src=url});const {node,ctx}=canvas(payload.width,payload.height);ctx.drawImage(image,0,0,payload.width,payload.height);return canvasURL(node)}finally{URL.revokeObjectURL(url)}}

export class VisualImageSources{
 constructor({project,board,pipelineView,planView,foregroundView,algorithmView}={}){Object.assign(this,{project,board,pipelineView,planView,foregroundView,algorithmView});this.entries=new Map();this.keys=new Map();this.identities=new WeakMap();this.pending=new Map();this.errors=[];this.projectEpoch=this.project?.epoch;this.projectData=this.project?.data}
 session(){if(this.projectEpoch!==this.project?.epoch||this.projectData!==this.project?.data){this.entries.clear();this.keys.clear();this.pending.clear();this.identities=new WeakMap();this.projectEpoch=this.project?.epoch;this.projectData=this.project?.data;}return this}
 identity(object){if(!object||typeof object!=='object')return null;if(!this.identities.has(object))this.identities.set(object,uid());return this.identities.get(object)}
 put(key,descriptor){this.session();const known=this.keys.get(key);if(known&&this.entries.has(known)){const entry=this.entries.get(known);this.entries.delete(known);this.entries.set(known,entry);return entry}const modelBytes=descriptor.model?JSON.stringify(descriptor.model).length:0;if(modelBytes*2>LIMIT.cacheBytes)throw Error('此節點圖像模型超過32MB快取預算，請分段提供證據');const id=uid(),entry={...descriptor,modelBytes,id,source_id:id};this.keys.set(key,id);this.entries.set(id,entry);this.prune();return entry}
 cacheBytes(){let bytes=0;for(const entry of this.entries.values())bytes+=2*((entry.modelBytes||0)+(entry.reference?.dataURL?.length||0)+(entry.payload?.dataURL?.length||entry.payload?.xml?.length||0));return bytes}
 prune(){let bytes=this.cacheBytes();for(const [id,entry]of this.entries){if(this.entries.size<=LIMIT.entries&&bytes<=LIMIT.cacheBytes)break;if(this.pending.has(id))continue;bytes-=2*((entry.modelBytes||0)+(entry.reference?.dataURL?.length||0)+(entry.payload?.dataURL?.length||entry.payload?.xml?.length||0));this.entries.delete(id);for(const [key,value]of this.keys)if(value===id)this.keys.delete(key)}}
 descriptor(id){this.session();const entry=this.entries.get(id);return entry?this.metadata(entry):null}
 cacheInfo(){return {entries:this.entries.size,pending:this.pending.size,bytes:this.cacheBytes(),maxEntries:LIMIT.entries,maxBytes:LIMIT.cacheBytes}}
 metadata(entry){return {source_id:entry.id,id:entry.id,label:entry.label,kind:entry.kind,width:entry.width,height:entry.height,source:metadataClone(entry.source),available:true,captureRequired:!entry.reference}}
 current(result,image,plan){if(this.project?.imageLoadErrors?.has(image?.id))return false;if(!result?.runId||!plan||!image)return false;try{if(this.project?.isPipelineResultCurrent)return !!this.project.isPipelineResultCurrent(result,image,plan);if(this.pipelineView?.isResultCurrent)return !!this.pipelineView.isResultCurrent(result,image,plan)}catch{return false}return false}
 catalog(options={}){return this.catalogPage(options).items}
 catalogPage({offset=0,limit=LIMIT.page,image_ids,imageIds,run_id,kind}={}){
  this.session();if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>LIMIT.pageMax)throw Error('圖像目錄 offset 必須非負整數，limit 為 1–200');
  const selectedIds=image_ids||imageIds;if(selectedIds!==undefined&&(!Array.isArray(selectedIds)||selectedIds.length>200||selectedIds.some(id=>typeof id!=='string')))throw Error('請用最多200個有效 image_ids 分頁查圖像來源');
  const selected=selectedIds?new Set(selectedIds):null,items=[];let total=0;
  const add=(summary,build)=>{if(kind&&summary.kind!==kind||run_id&&summary.source?.runId!==run_id||selected&&!selected.has(summary.source?.imageId))return;if(total>=offset&&items.length<limit)items.push(this.metadata(build()));total++};
  const images=this.project?.data?.images||[],plan=this.project?.workflow?.pipelinePlan;
  for(const image of images){
   if(selected&&!selected.has(image.id))continue;
   add({kind:'original',source:{imageId:image.id}},()=>this.originalEntry(image));
   const result=image.pipelineResult;if(!this.current(result,image,plan)||!this.pipelineView?.paintPane)continue;
   let model;for(const node of plan.nodes||[]){const output=result.nodes?.find(n=>n.id===node.id);if(output?.status!=='OK')continue;
    add({kind:'stage',source:{imageId:image.id,runId:result.runId}},()=>{
     const key=JSON.stringify(['stage',originalIdentity(image),plan.id,plan.revision,result.runId,node.id]),known=this.keys.get(key);if(known&&this.entries.has(known))return this.entries.get(known);
     model??={image:{id:image.id,sha256:image.sha256,width:image.width,height:image.height,name:image.name},plan:metadataClone(plan),result:metadataClone(result)};
     const nodeSource=bindingOf(image,plan,result,{...node,parameters:output.parameters||node.params||node.parameters,artifacts:nodeArtifacts(result,output)},{captureMethod:'isolated-pipeline-render',originalWidth:image.width,originalHeight:image.height,executionStatus:output.status});
     return this.put(key,{kind:'stage',label:short(`${image.name||'原圖'} · ${node.label||node.title||node.id}`),width:image.width,height:image.height,source:nodeSource,model,selected:model.plan.nodes.find(n=>n.id===node.id),output:model.result.nodes.find(n=>n.id===node.id)});
    });
   }
  }
  for(const run of (this.project?.data?.algorithmRuns||[]).slice(-30))for(const artifact of run.artifacts||[]){if(artifact.type!=='image'||!localRaster(artifact.dataUrl||artifact.dataURL))continue;
   add({kind:'stage',source:{imageId:run.sourceBinding?.images?.[0]?.imageId||run.source?.imageId,runId:run.runId}},()=>{dimensions(artifact.width,artifact.height);return this.put(JSON.stringify(['program',run.runId,artifact.id,artifact.sha256]),{kind:'stage',label:short(run.title+' · '+artifact.name),width:artifact.width,height:artifact.height,source:this.algorithmSource(run,artifact),payload:{dataURL:artifact.dataUrl||artifact.dataURL}})});
  }
  this.deferredVisibleEntries(add);
  this.prune();const page={items,total,offset,limit,nextOffset:offset+items.length<total?offset+items.length:null,metadataOnly:true,scope:'目錄沒有讀取或解碼像素；使用 source_id 按需引用，原圖資料集可用 get_dataset_images 分頁。'};this.lastCatalogPage={...page,items:undefined};return page;
 }
 deferredVisibleEntries(add){
  const view=this.foregroundView;if(view?.image&&!view.busy&&!view.parameterError&&(!view.valid||view.valid())&&globalThis.document?.getElementById?.('sourceDialog')?.open){
   const snapshot=view.snapshot?.()||{},runId=snapshot.runId||view.analysis?.trace?.binding?.runId||this.identity(view.analysis),image=this.project?.imageRecord?.(view.imageId)||this.project?.data?.images?.find(i=>i.id===view.imageId);
   for(const layer of view.layers||[]){if(layer.id==='original'||!layer.bitmap)continue;const source={...bindingOf(image,null,null,null),...clone(snapshot),runId,nodeId:layer.id,parameters:clone(view.parameters||{}),coordinateSpace:'render-pixels',captureMethod:'foreground-layer-pixels',sampleStep:layer.step||1,originalWidth:image?.width,originalHeight:image?.height,currentAtCapture:true};
    add({kind:'stage',source},()=>this.put(JSON.stringify(['foreground',view.imageId,view.sha,runId,layer.id,view.candidate?.id,view.generation]),{kind:'stage',label:short(`${image?.name||'前景'} · ${layer.title}`),width:layer.bitmap.width||layer.width,height:layer.bitmap.height||layer.height,source,deferredLayer:{id:layer.id,imageId:view.imageId,generation:view.generation}}));
   }
  }
  const seen=new Set(),views=[this.pipelineView?.evidenceViewer,this.planView?.explanation,this.foregroundView?.module?.evidence];
  const addElement=(element,view)=>{if(seen.has(element)||element.closest?.('svg')&&String(element.tagName).toLowerCase()!=='svg')return;seen.add(element);const snapshot=view?.snapshot?.()||{},binding=view?.report?.binding||{},scalar=Object.fromEntries(Object.entries({...binding,...snapshot}).filter(([key,value])=>['imageId','inputSha256','runId','recipeId','recipeRevision','pipelineId','pipelineRevision','algorithm_version','targetId','stepId','stage','source','humanConfirmed','section','parameterName'].includes(key)&&(value===null||['string','number','boolean'].includes(typeof value)))),source={...scalar,imageId:snapshot.imageId||binding.imageId||null,runId:snapshot.runId||binding.runId||null,figureId:snapshot.figureId||view?.figureId||null,teaching:view?.teaching===true||view?.section==='limits'&&view?.constructor?.name!=='PipelineDecisionExplanationView'&&!view?.report?.sectionFigures?.limits,currentAtCapture:false,coordinateSpace:'render-pixels',captureMethod:'deferred-visible-figure',scope:'按需捕獲目前可見圖解；目錄本身不代表已檢視像素'};
   add({kind:'figure',source},()=>{const box=element.viewBox?.baseVal,rect=element.getBoundingClientRect?.(),width=Math.round(element.naturalWidth||box?.width||element.width||rect?.width||960),height=Math.round(element.naturalHeight||box?.height||element.height||rect?.height||540);dimensions(width,height);return this.put(JSON.stringify(['deferred-element',this.identity(element),snapshot,element.currentSrc||element.src||null]),{kind:'figure',label:short(view?.current?.caption||element.getAttribute?.('aria-label')||element.alt||'工作台圖解'),width,height,source,deferredElement:{element,view,snapshotKey:JSON.stringify(snapshot)}})});
  };
  for(const view of views)if(view?.dialog?.open)for(const element of view.figure?.querySelectorAll?.('canvas,img,svg')||[])addElement(element,view);
  const pipeline=this.pipelineView,model=pipeline?.getModel?.();if(pipeline?.curveCanvas&&model?.current&&model.output?.status==='OK')addElement(pipeline.curveCanvas);
  for(const element of globalThis.document?.querySelectorAll?.('dialog[open] svg,dialog[open] canvas,dialog[open] img')||[]){if(element.closest?.('#sourceDialog')||element.closest?.('.inquiry-dialog'))continue;addElement(element)}
 }
 originalEntry(image){const signature=originalIdentity(image),key=JSON.stringify(['original',signature]);return this.put(key,{kind:'original',label:short(image.name||'原圖'),width:image.width,height:image.height,source:{imageId:image.id,inputSha256:image.sha256||null,contentSha256:image.contentSha256||image.assetRef?.sha256||null,currentAtCapture:true,coordinateSpace:'original-image-pixels',captureMethod:'original-source-pixels'},originalImageId:image.id,originalIdentity:signature,encodedBytes:image.assetRef?.size||null})}
 algorithmSource(run,artifact){const binding=run.sourceBinding?.images?.[0]||run.source||run.sourceBinding||{};return {imageId:binding.imageId,inputSha256:binding.imageSha256,runId:run.runId,artifactId:artifact.id,artifactSha256:artifact.sha256,codeSha256:run.codeSha256,stage:'TRIAL',author:'agent',humanConfirmed:false,currentAtCapture:algorithmRunCurrent(this.project,run),captureMethod:'algorithm-program-output',coordinateSpace:'algorithm-output-pixels',section:artifact.section||null,sourceBindings:clone(run.sourceBinding),scope:'自編算法的實算輸出，程式自檢與獨立工程驗收分開。'}}
 knownElement(element){
  if(element===this.algorithmView?.image&&this.algorithmView.run){const run=this.algorithmView.run,artifact=this.algorithmView.currentArtifact();if(artifact)return {kind:'stage',label:short(run.title+' · '+artifact.name),source:this.algorithmSource(run,artifact)}}
  const pipeline=this.pipelineView,m=pipeline?.getModel?.();
  const pane=pipeline?.canvases?.find(item=>item.canvas===element),thumb=pipeline?.thumbnailCanvases?.find(item=>item.canvas===element),curve=pipeline?.curveCanvas===element;
  if(pane||thumb||curve){
   if(!m?.image)throw Error('畫面沒有可引用的原圖');let selected=thumb?.node||m.selected,output=m.result?.nodes?.find(n=>n.id===selected?.id),original=pane?.type==='original'||thumb?.original;
   if(pane?.type==='input'){const ids=nodeInput(selected),producer=m.result?.nodes?.find(n=>ids.some(id=>id===n.id||id.startsWith(n.id+'.')));if(producer){selected=m.nodes.find(n=>n.id===producer.id);output=producer}else original=true}
   if(!original&&(!m.current||output?.status!=='OK'))throw Error('本圖尚無這一步的有效運算結果，不能引用提示畫面');
   // render() creates new canvases before its deferred RAF paint. Render only
   // the requested surface synchronously from this exact model before reading
   // pixels or dimensions; a shadow keeps caches and overlay state off the UI.
   if(!this.project.pixels?.get(m.image.id))throw Error('原圖像素尚未準備完成，請稍後再引用');
   const renderModel={...m,gearPlan:m.nodes.some(n=>(n.op||n.operator)==='shape.gear')},renderer=Object.assign(Object.create(pipeline),{model:renderModel,cache:new Map(pipeline.cache||[])});
   if(curve){if(typeof renderer.paintCurves!=='function'||typeof renderer.nodeCurves!=='function')throw Error('曲線畫面尚未準備完成');const curves=renderer.nodeCurves(renderModel);if(!curves.some(c=>c.points?.some(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))))throw Error('本節點沒有可引用的實算曲線');renderer.paintCurves(element,curves)}
   else{if(typeof renderer.paintPane!=='function')throw Error('節點畫面尚未準備完成');const targetModel=thumb?{...renderModel,selected:thumb.node,output:m.result?.nodes?.find(n=>n.id===thumb.node.id),kind:kindOf(thumb.node.op||thumb.node.operator)}:renderModel;renderer.model=targetModel;renderer.paintPane(element,thumb?(thumb.original?'original':'result'):pane.type,targetModel,{thumbnail:!!thumb})}
   const source=bindingOf(m.image,original?null:m.plan,original?null:m.result,original?null:{...selected,parameters:output?.parameters||selected?.params||selected?.parameters,artifacts:nodeArtifacts(m.result,output)},{captureMethod:'visible-canvas-pixels',displayMode:pane?.type||'result',displayZoom:pipeline.zoom??1,displayPan:clone(pipeline.pan||{x:0,y:0}),extent:pipeline.extent||'image',originalWidth:m.image.width,originalHeight:m.image.height});
   if(!curve){const rect=element.getBoundingClientRect?.(),width=rect?.width||element.width,height=rect?.height||element.height,transform=fitPipelineViewport({width,height,imageWidth:m.image.width,imageHeight:m.image.height,bounds:observedPipelineBounds(m.result),extent:thumb||original||!m.nodes.some(n=>(n.op||n.operator)==='shape.gear')?'image':pipeline.extent,zoom:thumb?1:pipeline.zoom,pan:thumb?{x:0,y:0}:pipeline.pan,padding:thumb?3:18});source.renderTransform={scaleX:transform.scale*element.width/width,scaleY:transform.scale*element.height/height,translateX:transform.x*element.width/width,translateY:transform.y*element.height/height,mapping:'original-image-pixels to captured-render-pixels'}}
   return {source,kind:curve?'plot':'render',label:short(element.getAttribute?.('aria-label')||`${m.image.name} · ${selected?.label||selected?.id||'原圖畫面'}`)};
  }
  if(element===this.board?.el){const image=this.project.image;return {source:{...bindingOf(image,null,null,null),captureMethod:'visible-board-pixels',boardStage:this.board.stage,displayZoom:this.board.scale,displayOrigin:{x:this.board.x,y:this.board.y},originalWidth:image?.width,originalHeight:image?.height,scope:'工作台畫面，含圈選與疊圖；不是原始量測像素'},kind:'render',label:short(`${image?.name||'工作台'} · 畫面與標註`)}}
  const foreground=this.foregroundView;if(['traceBefore','traceAfter'].includes(element.id)){
   if(!foreground?.valid?.()||foreground.busy||foreground.parameterError)throw Error('前景參數正在重算或來源已失效，請等待有效圖像');
   const snapshot=foreground.snapshot?.()||{},layer=foreground.layers?.[element.id==='traceBefore'?Math.max(0,foreground.stage-1):foreground.stage];if(!layer?.bitmap||typeof foreground.draw!=='function')throw Error('前景圖尚未產生');foreground.draw(element,layer);return {source:{...clone(snapshot),imageId:foreground.imageId,inputSha256:foreground.sha,nodeId:layer.id,coordinateSpace:'render-pixels',currentAtCapture:true,captureMethod:'visible-foreground-pixels',displayZoom:foreground.zoom,displayCenter:clone(foreground.center)},kind:'render',label:short(layer.title)};
  }
  return null;
 }
 elementEntry(element,{view}={}){
  let info=this.knownElement(element);if(!view)view=[this.pipelineView?.evidenceViewer,this.planView?.explanation,this.foregroundView?.module?.evidence].find(v=>v?.dialog?.open&&v.dialog.contains(element));
  if(view){if(view.view?.busy||view.view?.parameterError||view.view?.working)throw Error('圖像依據正在重算，不能引用舊畫面');const snapshot=clone(view.snapshot?.()||{}),report=view.report,figure=view.current?.facts||{},binding=report?.binding||{};info={kind:/curve|histogram|sweep|statistics/.test(figure.kind||'')?'plot':'figure',label:short(view.current?.caption||report?.name||'工具依據圖'),source:{...clone(binding),...snapshot,figureId:snapshot.figureId||view.figureId||figure.figureId||null,parameters:clone(view.workbenchModel?.output?.parameters||view.view?.parameters||{}),coordinateSpace:'render-pixels',currentAtCapture:report?report.status==='CURRENT':true,captureMethod:'visible-explanation-pixels',scope:figure.scope||figure.provenance||snapshot.scope||'目前圖像說明',teaching:view.teaching===true||view.section==='limits'&&view.constructor.name!=='PipelineDecisionExplanationView'&&!report?.sectionFigures?.limits,section:view.section||null}}}
  const linkedId=element.dataset?.inquiryAssetId,linked=linkedId&&this.project?.data?.visualInquiry?.assets?.find(a=>a.id===linkedId);
  if(linked){const binding=element.visualSnapshot||{},snapshotBinding={boardId:binding.boardId||binding.id||element.dataset?.inquiryBoardId||null,revision:binding.revision??(element.dataset?.inquiryRevision?Number(element.dataset.inquiryRevision):null),itemId:binding.itemId||element.dataset?.inquiryItemId||null};info={kind:'render',label:short(`${linked.label} · 問詢預覽`),source:{...clone(linked.source),sourceAssetId:linked.id,linkedSourceId:linked.source.sourceId||null,snapshotBinding,coordinateSpace:'render-pixels',captureMethod:'chat-annotated-preview-pixels',originalAssetWidth:linked.width,originalAssetHeight:linked.height,currentAtCapture:false,scope:'已保存問詢的圖像預覽，保留提問時可見標註；不是當前量測結果'}}}
  info??={kind:String(element.tagName).toLowerCase()==='svg'?'figure':'render',label:short(element.getAttribute?.('aria-label')||element.alt||element.closest?.('figure')?.querySelector?.('figcaption')?.textContent||'工作台圖像'),source:{imageId:null,inputSha256:null,runId:null,currentAtCapture:false,coordinateSpace:'render-pixels',captureMethod:'visible-local-pixels',scope:'圖解或獨立畫面；未綁定當前量測，不能當作實測結果'}};
  let payload,width,height;const tag=String(element.tagName).toLowerCase();
  if(tag==='canvas'){({width,height}=dimensions(element.width,element.height));payload={dataURL:canvasURL(element)}}
  else if(tag==='img'){const dataURL=rasterURL(element.currentSrc||element.src);({width,height}=dimensions(element.naturalWidth||element.width,element.naturalHeight||element.height));payload={dataURL}}
  else if(tag==='svg'){payload=svgPayload(element);({width,height}=payload)}else throw Error('請選擇圖像、曲線或圖解');
  // Includes pixel payload identity: one canvas can be repainted without changing its run.
  const content=payload.dataURL||payload.xml;let key=JSON.stringify(['element',this.identity(element),info.source,payloadKey(content)]);const existing=this.entries.get(this.keys.get(key));if(existing&&(existing.payload.dataURL!==payload.dataURL||existing.payload.xml!==payload.xml))key+=uid();
  return this.put(key,{...info,width,height,payload});
 }
 async fromElement(element){const tile=element?.closest?.('.image-tile[data-image-id]'),imageId=tile?.dataset?.imageId,stripImage=imageId&&this.project?.data?.images?.find(i=>i.id===imageId);if(stripImage)return this.resolve(this.originalEntry(stripImage).id);const target=graphic(element);if(!target)throw Error('這裡沒有可引用的圖像');
  if(String(target.tagName).toLowerCase()==='img'){
   const dataURL=target.currentSrc||target.src,asset=this.project?.data?.visualInquiry?.assets?.find(a=>a.dataURL===dataURL);if(asset)return freeze(clone(asset));
   const original=this.project?.data?.images?.find(i=>i.dataURL===dataURL&&i.width===(target.naturalWidth||target.width)&&i.height===(target.naturalHeight||target.height));if(original)return this.resolve(this.originalEntry(original).id);
  }
  return this.resolve(this.elementEntry(target).id);
 }
 async resolve(id){this.session();if(typeof id!=='string'||id.length>200)throw Error('圖像來源識別無效');
  const asset=this.project?.data?.visualInquiry?.assets?.find(a=>a.id===id);if(asset)return freeze(clone(asset));
  let entry=this.entries.get(id);if(!entry){this.catalog();entry=this.entries.get(id)}if(!entry)throw Error('圖像來源已不存在，請重新從平台圖像選擇');if(entry.reference)return freeze(clone(entry.reference));if(this.pending.has(id))return freeze(clone(await this.pending.get(id)));if(this.pending.size>=LIMIT.pending)throw Error('圖像捕獲併發資源已滿，請等待目前引用完成');
  const promise=this.capture(entry);this.pending.set(id,promise);try{return freeze(clone(await promise))}finally{this.pending.delete(id);this.prune()}
 }
 async capture(entry){
  if(entry.deferredElement){const {element,view,snapshotKey}=entry.deferredElement;if(view&&JSON.stringify(view.snapshot?.()||{})!==snapshotKey)throw Error('圖解已更新，請重新列出來源再引用');const ref=await this.capture(this.elementEntry(element,{view}));entry.reference=freeze({...ref,id:entry.id,source_id:entry.id,source:{...ref.source,sourceId:entry.id}});return entry.reference;}
  if(entry.deferredLayer){const binding=entry.deferredLayer,view=this.foregroundView;if(view?.imageId!==binding.imageId||view.generation!==binding.generation||view.busy||view.parameterError)throw Error('前景圖層已更新，請重新選取來源');const layer=view.layers?.find(layer=>layer.id===binding.id);if(!layer?.bitmap)throw Error('前景圖層已不可用');const {node,ctx}=canvas(entry.width,entry.height);ctx.drawImage(layer.bitmap,0,0,entry.width,entry.height);entry.payload={dataURL:canvasURL(node)};}
  const source=clone(entry.source);if(entry.originalImageId){const image=this.project?.imageRecord?.(entry.originalImageId)||this.project?.data?.images?.find(image=>image.id===entry.originalImageId);if(!image||originalIdentity(image)!==entry.originalIdentity)throw Error('原圖內容已改變，請重新選取圖像來源');}
  if(entry.model){const currentImage=this.project?.data?.images?.find(i=>i.id===source.imageId),currentPlan=this.project?.workflow?.pipelinePlan,currentRun=currentImage?.pipelineResult;source.currentAtCapture=!!(currentImage?.sha256===source.inputSha256&&currentRun?.runId===source.runId&&currentPlan?.id===source.pipelineId&&currentPlan?.revision===source.pipelineRevision&&this.current(currentRun,currentImage,currentPlan))}
  let dataURL;if(entry.originalImageId&&!entry.originalURL){const image=this.project?.imageRecord?.(entry.originalImageId)||this.project?.data?.images?.find(image=>image.id===entry.originalImageId);dataURL=this.project.readImageAsset?await this.project.readImageAsset(entry.originalImageId):image?.dataURL;if(!localRaster(dataURL)){const raster=this.project.ensureImagePixels?await this.project.ensureImagePixels(entry.originalImageId):this.project.pixels?.get(entry.originalImageId);const {node,ctx}=canvas(entry.width,entry.height);ctx.drawImage(raster.image,0,0,entry.width,entry.height);dataURL=canvasURL(node);}}else if(entry.originalURL){if(localRaster(entry.originalURL))dataURL=rasterURL(entry.originalURL);else{
   // Legacy BMP/TIFF imports may have a browser-decoded original; transcode at 1:1.
   const raster=entry.raster;if(!raster?.image)throw Error('無法讀取原圖像素');const {node,ctx}=canvas(entry.width,entry.height);ctx.drawImage(raster.image,0,0,entry.width,entry.height);dataURL=canvasURL(node);
  }}else if(entry.model){const raster=this.project.ensureImagePixels?await this.project.ensureImagePixels(source.imageId):this.project.pixels?.get(source.imageId);if(!raster?.image)throw Error('節點原圖像素尚未準備完成');const view=this.pipelineView;if(!view?.paintPane)throw Error('缺少節點圖像繪製器');const {node,ctx}=canvas(entry.width,entry.height),m={...entry.model,selected:entry.selected,output:entry.output,current:true,raw:entry.model.result,nodes:entry.model.plan.nodes,kind:kindOf(entry.selected.op||entry.selected.operator),gearPlan:entry.model.plan.nodes.some(n=>n.op==='shape.gear')},shadow=Object.create(view);
   Object.assign(shadow,{model:m,cache:new Map(),zoom:1,pan:{x:0,y:0},extent:'image',showDiagnostics:false,working:false,project:{pixels:new Map([[m.image.id,raster]])},canvasContext:()=>{ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0c151b';ctx.fillRect(0,0,node.width,node.height);return {ctx,width:node.width,height:node.height}}});
   const transform=fitPipelineViewport({width:node.width,height:node.height,imageWidth:m.image.width,imageHeight:m.image.height,bounds:observedPipelineBounds(m.result),extent:'image',zoom:1,pan:{x:0,y:0},padding:18});source.renderTransform={scaleX:transform.scale,scaleY:transform.scale,translateX:transform.x,translateY:transform.y,mapping:'original-image-pixels to captured-render-pixels'};
   shadow.paintPane(node,'result',m);dataURL=canvasURL(node);
  }else if(entry.payload?.dataURL)dataURL=entry.payload.dataURL;else if(entry.payload?.xml)dataURL=await rasterizeSVG(entry.payload);else throw Error('來源沒有可讀取的圖像像素');
  entry.reference=freeze({id:entry.id,source_id:entry.id,label:entry.label,kind:entry.kind,dataURL:rasterURL(dataURL),...dimensions(entry.width,entry.height),source:{...source,capturedAt:now(),sourceId:entry.id}});return entry.reference;
 }
 async collectImages({source_ids,offset=0,limit=LIMIT.collect,image_ids,run_id}={}){this.errors=[];
  if(!Number.isInteger(limit)||limit<1||limit>LIMIT.collectMax)throw Error('單次圖像收集限制為1–16張，請分頁或指定來源');
  if(source_ids!==undefined&&(!Array.isArray(source_ids)||source_ids.length>LIMIT.collectMax||source_ids.some(id=>typeof id!=='string')))throw Error('請指定最多16個有效source_ids');
  const scoped=image_ids||((this.project?.data?.images?.length||0)>LIMIT.collect&&!run_id?[this.project.data.activeId].filter(Boolean):undefined),page=source_ids?null:this.catalogPage({offset,limit,image_ids:scoped,run_id}),list=source_ids?source_ids.map(id=>this.descriptor(id)||{id,label:id}):page.items,refs=[];let bytes=0;
  for(const entry of list)try{const ref=await this.resolve(entry.id);if(bytes+ref.dataURL.length>LIMIT.collectBytes){this.errors.push('本次圖像引用已達24MB預算；請分批讀取來源');break}bytes+=ref.dataURL.length;refs.push(ref)}catch(error){this.errors.push(`${entry.label}：${error.message}`)}
  this.lastCollectionPage={...(page?{total:page.total,offset:page.offset,nextOffset:page.nextOffset}:{}),captured:refs.length,bytes,scope:scoped?'明確選圖或目前圖像的按需像素，不會自動讀取整個資料集。':'按分頁按需讀取像素。'};return refs;
 }
}
