import {flowExecutionState,flowNodeTiming} from './flow-node-presentation.js';
import { iconButton } from './ui-icons.js';
import {flowVisual,flowShapePath,flowStatusMark,flowEdgeVisual,flowAnchor} from './flow-visual-grammar.js';
import { layoutProgramFlow, programFlowLayoutKey } from './program-flow-layout.js';
import './program-flow-map.css';

const SVG='http://www.w3.org/2000/svg';
const LABEL_FONT='500 16px system-ui,-apple-system,sans-serif';
let serial=0;
const svg=(tag,attrs={})=>{const el=document.createElementNS(SVG,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));return el;};
const copyCamera=c=>({x:c.x,y:c.y,scale:c.scale});

/** Persistent SVG canvas. Containment is a frame, only dependencies get arrows. */
export class ProgramFlowMap {
 constructor({onSelect=()=>{},onContextMenu=()=>{},onError=()=>{},onCameraChange=()=>{},onSurfaceChange=()=>{},loadImagePreview=null}={}){
  this.onSurfaceChange=onSurfaceChange;this.loadImagePreview=loadImagePreview;this.onSelect=onSelect;this.onContextMenu=onContextMenu;this.onError=onError;this.onCameraChange=onCameraChange;
  this.element=document.createElement('div');this.element.className='program-flow-map';
  this.runId=null;this.selectedId=null;this.geometry=null;this.version=0;this.cache=new Map();this.cameras=new Map();this.expandedCameras=new Map();this.ready=Promise.resolve();this.disposed=false;
  this.main=this._surface(false);this.element.append(this.main.element);
  this.observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>{this._resize(this.main);if(this.expanded)this._resize(this.expanded);}):null;
  this.observer?.observe(this.main.viewport);
 }
 _surface(expanded){
  const element=document.createElement('div');element.className='program-flow-map-surface';
  const toolbar=document.createElement('div');toolbar.className='program-flow-map-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','流程圖檢視');
  const viewport=document.createElement('div');viewport.className='program-flow-map-viewport';
  const canvas=svg('svg',{'aria-label':'程式執行流程圖',role:'group'});const defs=svg('defs');const markerId=`program-flow-arrow-${++serial}`;
  const marker=svg('marker',{id:markerId,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'});marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'currentColor'}));defs.append(marker);
  const world=svg('g');canvas.append(defs,world);viewport.append(canvas);
  const empty=document.createElement('div');empty.className='program-flow-map-empty';empty.textContent='此運算尚無流程紀錄';viewport.append(empty);
  const legend=document.createElement('div');legend.className='program-flow-map-legend';legend.hidden=true;
  for(const [symbol,label]of [['▧','圖像輸入／固定參考'],['▥','目的節點（可展開）'],['◇','一次決策；條件在分支上'],['▰','產品分類出口'],['⬡','系統故障出口'],['→','資料／前提傳遞'],['⇢','條件／分類路徑'],['▱','包含框，不代表先後'],['✓','已執行；粗線為本件已記錄'],['○','僅宣告；細線未記錄執行'],['NG','產品品質標記，與執行底色分開']]){const item=document.createElement('div');item.className='flow-grammar-key';item.textContent=symbol+'　'+label;legend.append(item);}
  for(const [key,label] of [['not-found','執行成功；未找到目標'],['fault','執行故障'],['not-selected','本件未選此分支'],['declared','僅宣告，未執行'],['unknown','尚無執行狀態'],['succeeded','執行成功'],['running','執行中'],['skipped','已略過']]){const item=document.createElement('span');item.className=`program-flow-map-legend-item state-${key}`;item.textContent=label;legend.append(item);}
  const surface={element,viewport,canvas,world,empty,legend,markerId,camera:{x:0,y:0,scale:1},needsFit:true,expanded,drag:null};
  const button=(icon,label,action)=>{const b=iconButton(document.createElement('button'),icon,label);b.type='button';b.addEventListener('click',action);toolbar.append(b);return b;};
  button('zoom-out','縮小流程圖',()=>this._zoom(surface,1/1.25));button('zoom-in','放大流程圖',()=>this._zoom(surface,1.25));
  button('fit','全圖適配',()=>this._fit(surface));button('fit-selected','定位選中步驟',()=>this._focus(surface));
  button(expanded?'close':'fullscreen',expanded?'關閉大流程圖':'放大看全圖',()=>expanded?this.collapse():this.expand());
  const help=button('help','顯示狀態圖例',()=>{legend.hidden=!legend.hidden;help.setAttribute('aria-expanded',String(!legend.hidden));});help.setAttribute('aria-expanded','false');
  element.append(toolbar,viewport,legend);
  canvas.addEventListener('wheel',event=>{event.preventDefault();const rect=canvas.getBoundingClientRect();this._zoom(surface,Math.exp(-event.deltaY*.0015),{x:event.clientX-rect.left,y:event.clientY-rect.top});},{passive:false});
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('[data-program-node]'))return;surface.suppressBlankClick=false;surface.drag={id:event.pointerId,x:event.clientX,y:event.clientY,camera:copyCamera(surface.camera)};canvas.setPointerCapture?.(event.pointerId);viewport.classList.add('is-panning');});
  canvas.addEventListener('pointermove',event=>{const d=surface.drag;if(!d||d.id!==event.pointerId)return;if(Math.hypot(event.clientX-d.x,event.clientY-d.y)>4)surface.suppressBlankClick=true;surface.camera.x=d.camera.x+event.clientX-d.x;surface.camera.y=d.camera.y+event.clientY-d.y;surface.needsFit=false;this._apply(surface);});
  const stop=event=>{if(surface.drag?.id===event.pointerId){surface.drag=null;viewport.classList.remove('is-panning');}};
  canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',stop);
  viewport.addEventListener('click',event=>{if(surface.suppressBlankClick){surface.suppressBlankClick=false;return;}if(event.target.closest('[data-program-node]'))return;if(surface.expanded)this.collapse();else this.expand();});
  viewport.addEventListener('contextmenu',event=>{if(!event.target.closest('[data-program-node]'))this.onContextMenu(null,event);});
  canvas.addEventListener('dblclick',event=>{if(event.target.closest('[data-program-node]'))return;event.preventDefault();if(!surface.expanded)this.expand();});
  return surface;
 }
 update({flow,selectedId=null,runId=null}={}){
  if(this.disposed)return Promise.resolve();
  const nextRun=runId??flow?.nodes?.[0]?.runId??'empty';
  const key=JSON.stringify([nextRun,programFlowLayoutKey(flow)]);
  const metadata=JSON.stringify([(flow?.nodes||[]).map(({id,title,status,judgement,error,reason,imageIds,durationMs,durationScope,timingPrevious,timingUnitId})=>[id,title,status,judgement,Boolean(error),reason,imageIds,durationMs,durationScope,timingPrevious,timingUnitId]),(flow?.edges||[]).map(e=>[e.id,e.label,e.executed])]),changedMetadata=metadata!==this.metadataKey;this.metadataKey=metadata;this.flow=flow;
  this.selectedId=selectedId;
  if(nextRun===this.runId&&key===this.layoutKey){if(changedMetadata&&this.geometry){this._render(this.main);if(this.expanded)this._render(this.expanded);}else this._selection();return this.ready;}
  if(this.runId!==null&&!this.main.needsFit)this.cameras.set(this.runId,copyCamera(this.main.camera));
  const changedRun=nextRun!==this.runId;if(changedRun)this.collapse();this.runId=nextRun;this.layoutKey=key;
  if(changedRun){const saved=this.cameras.get(nextRun);this.main.camera=saved?copyCamera(saved):{x:0,y:0,scale:1};this.main.needsFit=!saved;}
  const version=++this.version;
  if(changedRun){this.geometry=null;this._render(this.main);}
  let promise=this.cache.get(key);
  if(!promise){if(import.meta.env?.VITE_INSPECTION_QA==='1')globalThis.AgentCVDesktop?.qaExecutionPhase?.('flow-layout-start');promise=layoutProgramFlow(flow);this.cache.set(key,promise);if(this.cache.size>12)this.cache.delete(this.cache.keys().next().value);}
  this.ready=promise.then(geometry=>{
   if(import.meta.env?.VITE_INSPECTION_QA==='1')globalThis.AgentCVDesktop?.qaExecutionPhase?.('flow-layout-ready');
   if(this.disposed||version!==this.version)return;
   this.geometry=geometry;this._render(this.main);if(this.expanded)this._layoutExpanded();
  }).catch(error=>{this.cache.delete(key);if(this.disposed||version!==this.version)return;this.geometry=null;this._render(this.main);this.main.empty.textContent='流程圖暫時無法排列';this.onError(error);});
  return this.ready;
 }
 _layoutExpanded(){
  const surface=this.expanded;if(!surface)return;const version=this.version;surface.geometry=null;
  // Expansion changes the camera only. Reuse the sidebar's exact node and
  // branch positions so the same flow stays recognizable at either size.
  surface.layoutReady=this.ready.then(()=>{if(this.disposed||this.expanded!==surface||version!==this.version)return;surface.geometry=this.geometry;this._render(surface);}).catch(error=>this.onError(error));
  return surface.layoutReady;
 }
 _render(surface){
  const focused=surface.world.contains(document.activeElement)?document.activeElement.closest?.('[data-program-node]')?.dataset.programNode:null;
  const previousNodes=surface.nodeViews||new Map(),nextNodes=new Map(),children=[];surface.previewLoads=[];const geometry=surface.geometry||this.geometry;
  const labelContext=JSON.stringify((this.flow?.edges||[]).map(edge=>[edge.id,edge.label]));
  const previousEdges=surface.edgeGeometry===geometry&&surface.edgeLabelContext===labelContext?surface.edgeViews||new Map():new Map(),nextEdges=new Map();
  surface.edgeLabelContext=labelContext;
  surface.edgeGeometry=geometry;surface.edgeViews=nextEdges;
  surface.empty.hidden=Boolean(geometry?.nodes?.length||geometry?.groups?.length);
  if(!geometry?.nodes?.length&&!geometry?.groups?.length){surface.world.replaceChildren();surface.nodeViews=nextNodes;this._apply(surface,false);return;}
  const allNodes=[...(geometry.groups||[]),...(geometry.nodes||[])],groups=new Set((geometry.groups||[]).map(node=>node.id));
  const byId=new Map((this.flow?.nodes||[]).map(node=>[node.id,node]));
  const edgeMetadata=new Map((this.flow?.edges||[]).map(edge=>[edge.id,edge])),positions=new Map(allNodes.map(node=>[node.id,node]));
  const drawNode=(node,isGroup)=>{
   node={...node,...byId.get(node.id),title:byId.get(node.id)?.title};const state=flowExecutionState(node),timing=flowNodeTiming(node),quality=['OK','NG','UNKNOWN'].includes(node.judgement)?node.judgement:null;
   const signature=JSON.stringify([this.version,isGroup,node.id,node.x,node.y,node.width,node.height,node.title,node.kind,node.status,state,timing,quality,node.reason,node.imageIds?.[0]]);
   const previous=previousNodes.get(node.id);
   if(previous?.signature===signature&&!previous.failed){previous.group.setAttribute('aria-current',node.id===this.selectedId?'step':'false');children.push(previous.group);nextNodes.set(node.id,previous);if(previous.preview)surface.previewLoads.push(previous.preview);return;}
   const group=svg('g',{class:`program-flow-map-node ${isGroup?'is-group':''} state-${state.key} kind-${node.kind}`,transform:`translate(${node.x} ${node.y})`,role:'button',tabindex:0,'data-program-node':node.id,'data-state':state.key,'data-status':node.status||'UNKNOWN','aria-label':`${node.title||'未命名步驟'}，${state.label}`,'aria-current':node.id===this.selectedId?'step':'false'});
   const entry={signature,group};nextNodes.set(node.id,entry);
   const visual=flowVisual(node),w=node.width,h=node.height;
   group.setAttribute('data-shape',isGroup?'container':visual.shape);
   group.setAttribute('aria-label',`${visual.label} · ${node.title||'未命名步驟'}，${state.label}`);
   if(isGroup){group.append(svg('rect',{width:w,height:h,rx:14,class:'program-flow-map-group-background'}));group.append(svg('rect',{class:'program-flow-map-group-header',width:w,height:Math.min(56,h),rx:10}));}
   else group.append(svg('path',{d:flowShapePath(visual.shape,w,h),class:'flow-node-silhouette'}));
   if(!isGroup&&visual.shape==='subprocess')group.append(svg('path',{d:`M 9 0 V ${h} M ${w-9} 0 V ${h}`,class:'flow-subprocess-rails'}));
   const isImage=!isGroup&&visual.shape==='image',isDiamond=!isGroup&&visual.shape==='diamond';
   let headingY=isGroup?21:isImage?h-22:h/2-((timing||quality)?7:0),titleX=w/2,titleWidth=w-(isDiamond?100:42);
   if(isGroup){titleX=32;titleWidth=w-68;}
   const title=String(node.title||'未命名步驟'),text=svg('text',{x:titleX,y:headingY,'dominant-baseline':'middle','text-anchor':isGroup?'start':'middle'});
   const lines=this._nameLines(title,Math.max(30,titleWidth),isGroup||isImage?1:2);
   for(let i=0;i<lines.length;i++){const line=svg('tspan',{x:titleX,y:headingY+(i-(lines.length-1)/2)*20});line.textContent=lines[i];text.append(line);}
   const stateX=isGroup?14:isDiamond?w/2:w-15,stateY=isGroup?23:isImage?h-17:isDiamond?18:17;
   const mark=svg('text',{x:stateX,y:stateY,'text-anchor':'middle',class:'flow-status-mark','aria-hidden':'true'});mark.textContent=flowStatusMark(node.status);group.append(mark);
   if(isImage){
    const frame=svg('rect',{x:14,y:12,width:w-28,height:h-48,rx:4,class:'flow-image-well'});group.append(frame);
    const label=svg('text',{x:23,y:31,class:'flow-image-role'});label.textContent=visual.label;group.append(label);
    const imageId=node.imageIds?.[0];
    if(imageId&&this.loadImagePreview){const version=this.version;surface.previewLoads.push(entry.preview=Promise.resolve().then(()=>this.loadImagePreview(imageId)).then(value=>{if(this.disposed||version!==this.version||!group.isConnected)return;const url=value?.dataURL;if(!url||!/^data:image\//.test(url)){entry.failed=true;return;}const picture=svg('image',{href:url,x:14,y:12,width:w-28,height:h-48,preserveAspectRatio:'xMidYMid meet','data-image-id':imageId});group.insertBefore(picture,label);label.setAttribute('y','10');label.setAttribute('class','flow-image-role loaded');}).catch(()=>{entry.failed=true;if(group.isConnected){label.textContent=visual.label+' · 預覽未就緒';}}));}
   }
   if(!isGroup&&visual.shape==='subprocess'){const expand=svg('text',{x:w/2,y:h-9,'text-anchor':'middle',class:'flow-expand-mark'});expand.textContent='⊞';group.append(expand);}
   const footerY=isGroup?42:visual.shape==='subprocess'?h-24:h-10;
   if(timing){const elapsed=svg('text',{x:isGroup?32:quality?w/2-15:w/2,y:footerY,'text-anchor':isGroup?'start':'middle',class:'flow-node-duration','data-duration-ms':timing.durationMs});elapsed.textContent=timing.label;const detail=svg('title');detail.textContent=timing.description;elapsed.append(detail);group.append(elapsed);}
   if(quality){const badge=svg('text',{x:timing?w-25:w/2,y:footerY,'text-anchor':'middle',class:'flow-quality-mark quality-'+quality.toLowerCase(),'data-quality':quality});badge.textContent=quality;const detail=svg('title');detail.textContent='產品判定：'+quality+'；不代表程式執行故障';badge.append(detail);group.append(badge);}
   const tooltip=svg('title');tooltip.textContent=`${visual.label} · ${title} · ${state.label}${quality?' · 產品 '+quality:''}${timing?' · '+timing.label+'（'+timing.description+'）':''}${node.reason?' · '+node.reason:''}`;group.append(text,tooltip);
   const select=()=>{const id=node.id;if(surface.expanded)this.collapse();this.onSelect(id);};
   group.addEventListener('click',event=>{event.stopPropagation();if(event.target.classList?.contains('program-flow-map-group-background')){if(!surface.expanded)this.expand();return;}if(!surface.expanded){select();return;}this.selectedId=node.id;this._selection();if(!surface.summary){surface.summary=document.createElement('div');surface.summary.className='program-flow-map-summary';surface.element.append(surface.summary);}surface.summary.textContent=title+' · '+state.label+'　｜　雙擊進入節點畫板';});
   group.addEventListener('contextmenu',event=>this.onContextMenu(node.id,event));
   group.addEventListener('dblclick',event=>{event.stopPropagation();event.preventDefault();if(surface.expanded)select();});
   group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();select();}});
   children.push(group);
  };
  // Layout lists outer frames first. Draw every frame before routes and leaves.
  for(const node of allNodes)if(groups.has(node.id))drawNode(node,true);
  const usedLabels=[];
  const labelPosition=(edge,label)=>{const width=Math.min(label.length,32)*6+12,height=14,candidates=[];for(let i=1;i<edge.points.length;i++){const a=edge.points[i-1],b=edge.points[i],length=Math.hypot(b.x-a.x,b.y-a.y);if(length<18)continue;for(const side of [1,-1]){const x=(a.x+b.x)/2+(side===1?6:-width-6),y=(a.y+b.y)/2-5,box={x,y:y-height,width,height};const overlap=[...allNodes,...usedLabels].some(n=>box.x<n.x+n.width+3&&box.x+width>n.x-3&&box.y<n.y+n.height+3&&box.y+height>n.y-3);if(!overlap)candidates.push({x,y,box,score:length+(a.x===b.x?30:0)});}}const chosen=candidates.sort((a,b)=>b.score-a.score)[0];if(chosen)usedLabels.push(chosen.box);return chosen;};
  for(const edge of geometry.edges||[]){
   if(edge.kind!=='dependency'||edge.points?.length<2)continue;
   const meta=edgeMetadata.get(edge.id)||edge,meaning=flowEdgeVisual(meta,byId.get(edge.from),byId.get(edge.to));
   // Reused free labels still reserve their box for later labels. Changing
   // any label invalidates the shared placement context above.
   let labelBox=null;const signature=JSON.stringify([this.version,meta.label,meta.executed,meaning,byId.get(edge.from)?.title,byId.get(edge.to)?.title]);
   const previous=previousEdges.get(edge.id);
   if(previous?.signature===signature){children.push(...previous.children);if(previous.labelBox)usedLabels.push(previous.labelBox);nextEdges.set(edge.id,previous);continue;}
   const firstChild=children.length;
   const source=positions.get(edge.from),target=positions.get(edge.to),points=edge.points.map(p=>({...p}));
   if(!groups.has(edge.from))points[0]=flowAnchor(source,points[0],points[1]);
   if(!groups.has(edge.to))points[points.length-1]=flowAnchor(target,points.at(-1),points.at(-2));
   const path=svg('path',{class:'program-flow-map-edge edge-'+meaning.kind+(meta.executed===true?' is-executed':meta.executed===false?' is-declared':''),'data-program-edge':edge.id,'data-edge-kind':meaning.kind,'data-from':edge.from,'data-to':edge.to,d:points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' '),'marker-end':`url(#${surface.markerId})`,role:'img','aria-label':`${byId.get(edge.from)?.title} → ${byId.get(edge.to)?.title} · ${meaning.label} · ${meta.label||''} · ${meta.executed?'本件已有紀錄':'未記錄執行'}`});
   const tip=svg('title');tip.textContent=path.getAttribute('aria-label');path.append(tip);children.push(path);
   for(const p of [points[0],points.at(-1)])children.push(svg('circle',{cx:p.x,cy:p.y,r:2.5,class:'flow-port edge-'+meaning.kind}));
   if(meta.label){const reserved=edge.labelLayout,position=reserved?{x:reserved.x+4,y:reserved.y+13}:labelPosition(edge,meta.label);if(position){labelBox=position.box||null;const label=svg('text',{x:position.x,y:position.y,class:'program-flow-map-edge-label','data-edge-label':edge.id});if(reserved){reserved.lines.forEach((value,i)=>{const line=svg('tspan',{x:position.x,y:position.y+i*15});line.textContent=value;label.append(line);});}else label.textContent=meta.label.length>24?meta.label.slice(0,23)+'…':meta.label;const title=svg('title');title.textContent=meta.label+(meta.executed?' · 本件已有紀錄':' · 方案宣告');label.append(title);children.push(label);}}
   nextEdges.set(edge.id,{signature,labelBox,children:children.slice(firstChild)});
  }
  for(const node of allNodes)if(!groups.has(node.id))drawNode(node,false);
  // Leave unchanged nodes connected so their decoded SVG images and focus survive.
  // Remove obsolete siblings before reconciling order. Otherwise a replaced
  // first child keeps the cursor pinned and moves every retained sibling.
  const retainedChildren=new Set(children);
  for(const child of Array.from(surface.world.childNodes))if(!retainedChildren.has(child))child.remove();
  let cursor=surface.world.firstChild;
  for(const child of children){if(child===cursor)cursor=cursor.nextSibling;else surface.world.insertBefore(child,cursor);}
  while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
  surface.nodeViews=nextNodes;
  if(surface.needsFit)this._fit(surface);else this._apply(surface,false);
  if(focused)Array.from(surface.world.querySelectorAll('[data-program-node]')).find(node=>node.dataset.programNode===focused)?.focus?.({preventScroll:true});
 }
 _nameLines(title,width,maxLines){
  if(this.textContext===undefined)this.textContext=document.createElement('canvas').getContext('2d');
  const context=this.textContext;
  if(!context)return [title];
  context.font=LABEL_FONT;
  const measure=value=>context.measureText(value).width;
  const value=title.replace(/\s+/g,' ').trim();
  if(measure(value)<=width)return [value];
  const middle=value=>{
   const chars=Array.from(value);let tailCount=0;
   while(tailCount<chars.length-1&&measure(chars.slice(-(tailCount+1)).join(''))<=width*.55)tailCount++;
   const suffix=value.match(/[A-Za-z0-9][A-Za-z0-9_,.\]\)-]*$/)?.[0];
   if(suffix&&measure(suffix)<=width*.75)tailCount=Math.max(tailCount,Array.from(suffix).length);
   const tail=tailCount?chars.slice(-tailCount).join(''):'';
   let headCount=0;
   while(headCount<chars.length-tailCount-1&&measure(chars.slice(0,headCount+1).join('')+'…'+tail)<=width)headCount++;
   return chars.slice(0,headCount).join('')+'…'+tail;
  };
  if(maxLines===1)return [middle(value)];
  const chars=Array.from(value);let count=0;
  while(count<chars.length&&measure(chars.slice(0,count+1).join(''))<=width)count++;
  // Prefer a word boundary when it keeps most of the first line occupied.
  let first=chars.slice(0,count).join(''),rest=chars.slice(count).join('');
  const boundary=first.lastIndexOf(' ');
  if(boundary>0&&measure(first.slice(0,boundary))>=width*.55){rest=first.slice(boundary+1)+rest;first=first.slice(0,boundary);}
  rest=rest.trim();
  return [first||'…',measure(rest)<=width?rest:middle(rest)];
 }
 _selection(){for(const surface of [this.main,this.expanded].filter(Boolean))for(const node of surface.world.querySelectorAll('[data-program-node]'))node.setAttribute('aria-current',node.dataset.programNode===this.selectedId?'step':'false');}
 _size(surface){const rect=surface.viewport.getBoundingClientRect();return {width:rect.width,height:rect.height};}
 _resize(surface){if(surface.expanded&&!surface.geometry)return;if(surface.needsFit&&(this.geometry?.nodes?.length||this.geometry?.groups?.length))this._fit(surface);}
 _fit(surface){if(surface.expanded&&!surface.geometry){surface.needsFit=true;return;}const {width,height}=this._size(surface),geometry=surface.geometry||this.geometry;if(width<1||height<1||!geometry?.width||!geometry?.height){surface.needsFit=true;return;}
  const scale=Math.max(.002,Math.min((width-24)/geometry.width,(height-24)/geometry.height,1.6));surface.camera={scale,x:(width-geometry.width*scale)/2,y:(height-geometry.height*scale)/2};surface.needsFit=false;this._apply(surface);
 }
 _apply(surface,notify=true){const c=surface.camera;surface.world.setAttribute('transform',`translate(${c.x} ${c.y}) scale(${c.scale})`);if(!surface.needsFit){if(surface.expanded)this.expandedCameras.set(surface.runId,copyCamera(c));else this.cameras.set(this.runId,copyCamera(c));if(notify)this.onCameraChange(this.snapshot());}}

 _zoom(surface,factor,point){if(!this.geometry||!Number.isFinite(factor)||factor<=0)return;const {width,height}=this._size(surface);const p=point||{x:width/2,y:height/2},c=surface.camera;const next=Math.max(.002,Math.min(6,c.scale*factor)),ratio=next/c.scale;surface.camera={x:p.x-(p.x-c.x)*ratio,y:p.y-(p.y-c.y)*ratio,scale:next};surface.needsFit=false;this._apply(surface);}
 _focus(surface){const geometry=surface.geometry||this.geometry,node=[...(geometry?.groups||[]),...(geometry?.nodes||[])].find(node=>node.id===this.selectedId);if(!node)return;const {width,height}=this._size(surface);if(width<1||height<1)return;const scale=Math.max(.002,Math.min(1.4,(width-40)/node.width,(height-40)/node.height));surface.camera={scale,x:width/2-(node.x+node.width/2)*scale,y:height/2-(node.y+node.height/2)*scale};surface.needsFit=false;this._apply(surface);}
 fit(){this._fit(this.expanded||this.main);}
 async captureImage(){
  await this.ready;const surface=this.expanded||this.main;await surface.layoutReady;await Promise.all(surface.previewLoads||[]);
  const geometry=surface.geometry||this.geometry;if(!geometry)throw Error('流程圖尚未完成排列');
  const clone=surface.canvas.cloneNode(true),originals=[surface.canvas,...surface.canvas.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
  const properties=['fill','fill-opacity','stroke','stroke-width','stroke-dasharray','stroke-opacity','stroke-linejoin','paint-order','opacity','color','font-family','font-size','font-weight','text-anchor','dominant-baseline'];
  originals.forEach((node,index)=>{const style=getComputedStyle(node);for(const key of properties)copies[index].style.setProperty(key,style.getPropertyValue(key));});
  clone.children[1].removeAttribute('transform');const width=Math.ceil(geometry.width+32),height=Math.ceil(geometry.height+32),scale=Math.min(1.5,2400/Math.max(width,height));
  clone.setAttribute('viewBox',`-16 -16 ${width} ${height}`);clone.setAttribute('width',width);clone.setAttribute('height',height);clone.style.width=width+'px';clone.style.height=height+'px';
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
  try{const image=new Image();image.src=url;await image.decode();const output=document.createElement('canvas');output.width=Math.max(1,Math.round(width*scale));output.height=Math.max(1,Math.round(height*scale));const ctx=output.getContext('2d');ctx.fillStyle='#10222b';ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(image,0,0,output.width,output.height);return {dataURL:output.toDataURL('image/png'),label:'本輪引用的流程圖',width:output.width,height:output.height};}finally{URL.revokeObjectURL(url);}
 }
 zoomBy(factor){this._zoom(this.expanded||this.main,factor);}
 focusSelected(){this._focus(this.expanded||this.main);}
 expand(){
  if(this.expanded||this.disposed)return;
  this.returnFocus=document.activeElement;const dialog=document.createElement('dialog');dialog.className='program-flow-map-dialog';dialog.setAttribute('aria-label','完整程式流程圖');
  const surface=this._surface(true);surface.runId=this.runId;const saved=this.expandedCameras.get(surface.runId);if(saved){surface.camera=copyCamera(saved);surface.needsFit=false;}this.expanded=surface;this.dialog=dialog;dialog.append(surface.element);document.body.append(dialog);
  dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();this.collapse();});dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.collapse();}});
  dialog.addEventListener('click',event=>{if(event.target===dialog)this.collapse();});
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  this.observer?.observe(surface.viewport);this._layoutExpanded();surface.element.querySelector('button')?.focus();this.onCameraChange(this.snapshot());this.onSurfaceChange();
 }
 collapse(){if(!this.expanded)return;const surface=this.expanded;if(!surface.needsFit)this.expandedCameras.set(surface.runId,copyCamera(surface.camera));this.observer?.unobserve?.(this.expanded.viewport);this.dialog?.close?.();this.dialog?.remove();this.expanded=null;this.dialog=null;if(this.returnFocus?.isConnected)this.returnFocus.focus();this.returnFocus=null;if(!this.disposed){this.onCameraChange(this.snapshot());this.onSurfaceChange();}}
 snapshot(){return {visualGrammarVersion:2,expandedLayout:'shared-down-1',runId:this.runId,camera:copyCamera(this.main.camera),cameras:[...this.cameras].map(([runId,camera])=>({runId,camera:copyCamera(camera)})),expanded:Boolean(this.expanded),expandedCamera:this.expanded?copyCamera(this.expanded.camera):(this.expandedCameras.has(this.runId)?copyCamera(this.expandedCameras.get(this.runId)):null),expandedCameras:[...this.expandedCameras].map(([runId,camera])=>({runId,camera:copyCamera(camera)}))};}
 restore(snapshot,{knownRunIds}={}){
  if(!snapshot)return;
  if(snapshot.visualGrammarVersion!==2){if(snapshot.expanded)this.expand();else this.collapse();this.main.needsFit=true;this._fit(this.main);return;}
  const valid=c=>c&&[c.x,c.y,c.scale].every(Number.isFinite)&&c.scale>0;
  const known=new Set(knownRunIds||(this.flow?.nodes||[]).map(node=>node.runId));known.add(this.runId);
  if(snapshot.expanded===false)this.collapse();
  const matchingExpandedLayout=snapshot.expandedLayout==='shared-down-1';
  if(!matchingExpandedLayout)this.expandedCameras.clear();
  for(const saved of matchingExpandedLayout?snapshot.expandedCameras||[]:[])if(known.has(saved.runId)&&valid(saved.camera))this.expandedCameras.set(saved.runId,copyCamera(saved.camera));
  for(const saved of snapshot.cameras||[])if(known.has(saved.runId)&&valid(saved.camera))this.cameras.set(saved.runId,copyCamera(saved.camera));
  const run=snapshot.runId??this.runId;
  if(matchingExpandedLayout&&known.has(run)&&valid(snapshot.expandedCamera))this.expandedCameras.set(run,copyCamera(snapshot.expandedCamera));
  if(known.has(run)&&valid(snapshot.camera)){this.cameras.set(run,copyCamera(snapshot.camera));if(run===this.runId){this.main.camera=copyCamera(snapshot.camera);this.main.needsFit=false;this._apply(this.main);}}
  if(snapshot.expanded&&run===this.runId){this.expand();if(matchingExpandedLayout&&valid(snapshot.expandedCamera)){this.expanded.camera=copyCamera(snapshot.expandedCamera);this.expanded.needsFit=false;this._apply(this.expanded,false);}}
 }

 destroy(){this.disposed=true;this.version++;this.collapse();this.observer?.disconnect();this.cache.clear();this.cameras.clear();this.expandedCameras.clear();this.element.remove();}
}
