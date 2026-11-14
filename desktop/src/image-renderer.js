import {clamp} from './image-viewport.js';
import {iconButton} from './ui-icons.js';
import {takeVerifiedNativePreview} from './native-preview-prefetch.js';
import './image-renderer.css';

const qaFrame=(phase,source)=>{if(import.meta.env?.VITE_INSPECTION_QA==='1')globalThis.AgentCVDesktop?.qaExecutionPhase?.((source?.role==='input'||source?.src?.startsWith('data:')?'input-':'output-')+phase);};
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const sameSource=(a,b)=>['src','width','height'].every(k=>a?.[k]===b?.[k])&&['src','width','height'].every(k=>a?.preview?.[k]===b?.preview?.[k]);
function displaySource(source){
 const p=source.preview;if(!p)return source;
 if(!p.src||p.src===source.src||![source.width,source.height,p.width,p.height].every(n=>Number.isSafeInteger(n)&&n>0)||p.width>source.width||p.height>source.height)throw Error('預覽圖身份或尺寸無效');
 return p;
}

/** A native-pixel image with a display camera shared by inspection surfaces. */
export class ImageRenderer{
 constructor({label='圖像渲染框',maxZoom=64,onLoad,onError}={}){
  Object.assign(this,{maxZoom,onLoad,onError,source:null,fitPadding:20,drag:null});
  this.view={scale:1,x:0,y:0,fitted:true};
  this.root=el('section',undefined,'image-renderer');this.root.setAttribute('aria-label',label);
  this.viewport=el('div',undefined,'image-renderer-viewport');this.viewport.tabIndex=0;this.viewport.setAttribute('role','img');this.viewport.setAttribute('aria-label',label);
  this.image=el('img');this.image.crossOrigin='anonymous';this.image.draggable=false;this.image.alt=label;this.viewport.append(this.image);this.root.append(this.viewport);
  this.controls=el('nav',undefined,'image-renderer-controls');this.controls.setAttribute('aria-label','圖像檢視工具');
  const button=(icon,text,fn)=>{const b=iconButton(el('button'),icon,text);b.type='button';b.onclick=fn;this.controls.append(b);return b;};
  this.zoomOut=button('zoom-out','縮小',()=>this.zoomBy(.8));this.zoomLabel=el('output','—','image-renderer-zoom');this.controls.append(this.zoomLabel);
  this.zoomIn=button('zoom-in','放大',()=>this.zoomBy(1.25));this.fitButton=button('fit','適合畫面',()=>this.fit());
  this.actualButton=el('button','1:1');this.actualButton.type='button';this.actualButton.title='原始尺寸 1:1';this.actualButton.setAttribute('aria-label','原始尺寸 1:1');this.actualButton.onclick=()=>this.actual();this.controls.append(this.actualButton);
  this.maxButton=button('fullscreen','最大化',()=>this.toggleMaximize());this.root.append(this.controls);
  this.rgb=el('output','RGB —','image-rgb-readout');this.rgb.setAttribute('aria-label','游標像素 RGB');this.viewport.append(this.rgb);
  this.sampleCanvas=document.createElement('canvas');this.sampleCanvas.width=this.sampleCanvas.height=1;
  this.sampleContext=this.sampleCanvas.getContext('2d',{willReadFrequently:true});
  this.viewport.addEventListener('pointerleave',()=>this.resetRGB());
  // The surrounding canvas can scale a card. Pointer math uses local CSS pixels.
  this.viewport.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();this.zoomBy(Math.exp(-event.deltaY*.002),this.localPoint(event));},{passive:false});
  this.viewport.addEventListener('pointerdown',event=>{
   if(event.button!==0&&event.button!==1)return;event.preventDefault();event.stopPropagation();this.viewport.focus({preventScroll:true});if(!this.source)return;
   this.drag={point:this.localPoint(event),view:{...this.view}};this.viewport.setPointerCapture?.(event.pointerId);this.viewport.classList.add('is-panning');
  });
  this.viewport.addEventListener('pointermove',event=>{if(!this.drag)return;const point=this.localPoint(event);this.view={...this.drag.view,x:this.drag.view.x+point.x-this.drag.point.x,y:this.drag.view.y+point.y-this.drag.point.y,fitted:false};this.paint();});
  this.viewport.addEventListener('pointermove',event=>this.sampleRGB(event));
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.viewport.addEventListener(type,()=>{this.drag=null;this.viewport.classList.remove('is-panning');});
  this.viewport.addEventListener('dblclick',event=>{event.stopPropagation();this.maximizeDialog?this.restoreMaximize():this.fit();});
  this.root.addEventListener('keydown',event=>{
   if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;
   if(event.key==='Escape'&&this.maximizeDialog){event.preventDefault();event.stopPropagation();this.restoreMaximize();return;}
   if(event.target!==this.viewport)return;
   const action={'+':()=>this.zoomBy(1.25),'=':()=>this.zoomBy(1.25),'-':()=>this.zoomBy(.8),'0':()=>this.fit(),'1':()=>this.actual()}[event.key];
   if(action){event.preventDefault();event.stopPropagation();action();}
  });
  this.resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>this.onResize()):null;this.resize?.observe(this.viewport);
  this.bindImage();this.paint();
 }
 bindImage(){
  this.image.onload=()=>{
   if(!this.source||this.image.getAttribute('src')!==(this.previewActive?this.source.preview.src:this.source.src))return;
   this.source.width=this.source.width||this.image.naturalWidth;this.source.height=this.source.height||this.image.naturalHeight;
   // A decoded frame is fitted by finishCommit. Its queued load event can
   // arrive after publication; fitting again forces layout during presentation.
   // Ordinary setSource loads still need their first fit once dimensions exist.
   if(this.committedImage!==this.image||this.committedSrc!==this.source.src){if(this.view.fitted)this.fit();else this.paint();}
   this.onLoad?.(this.source);
  };
  this.image.onerror=()=>{if(this.source)this.onError?.(Error('圖片解碼失敗'));};
 }
 // Decode on a detached element. The visible element and its camera remain
 // untouched until all members of an input/output pair can commit together.
 // Synchronous access only to an already decoded, final-verified frame.
 // Missing or pending pixels keep the ordinary asynchronous preparation path.
 readySource(source){
  if(!source?.src)return null;
  let image;
  const display=displaySource(source);
  if(sameSource(this.source,source)&&this.image.complete&&this.image.naturalWidth)image=this.image;
  else if(this.preparingSource&&sameSource(this.preparingSource.source,source))image=this.preparingSource.frame?.image;
  if(!image){const preview=takeVerifiedNativePreview(display,{readyOnly:true});if(preview){image=preview.image;qaFrame('preview-transferred',source);}}
  if(!image?.complete||!image.naturalWidth||!image.naturalHeight)return null;
  if(source.preview&&image.getAttribute('src')===source.preview.src&&(image.naturalWidth!==display.width||image.naturalHeight!==display.height))throw Error('預覽圖像素尺寸與宣告不一致');
  image.draggable=false;image.alt=source.alt||this.image.alt;
  const frame={source:{...source,width:source.width||image.naturalWidth,height:source.height||image.naturalHeight},image,preview:!!source.preview&&image.getAttribute('src')===source.preview.src};
  this.preparingSource={source:{...source},frame,promise:Promise.resolve(frame)};
  return frame;
 }
 async prepareSource(source){
  if(!source?.src)throw Error('缺少待載入圖像');
  displaySource(source);
  if(sameSource(this.source,source)&&this.image.complete&&this.image.naturalWidth)return {source,image:this.image,preview:this.previewActive};
  // Selection/progress updates can ask for the same pair before its first
  // decode finishes. Share that pending frame, including a transferred native
  // preview; otherwise a superseding view request consumes the preview and
  // issues another no-store fetch. Publication remains the caller's decision.
  let pending=this.preparingSource;
  if(!pending||!sameSource(pending.source,source)){
   pending={source:{...source},promise:this.decodeSource(source)};this.preparingSource=pending;
  }
  qaFrame('prepare-wait',source);
  try{const frame=await pending.promise;pending.frame=frame;qaFrame('prepare-ready',source);return {...frame,source:{...source,width:frame.source.width,height:frame.source.height}};}
  catch(error){if(this.preparingSource===pending)this.preparingSource=null;throw error;}
 }
 async decodeSource(source){
  qaFrame('decode-start',source);
  const display=displaySource(source),prefetched=takeVerifiedNativePreview(display),image=prefetched?.image||el('img');
  // The prefetch owner configured CORS before starting its request. Do not
  // mutate a fetch-affecting attribute after transferring its decoded element.
  if(!prefetched)image.crossOrigin='anonymous';
  qaFrame(prefetched?'preview-transferred':'fresh-decode',source);
  image.draggable=false;image.alt=source.alt||this.image.alt;
  try{if(prefetched)await prefetched.ready;else{image.src=display.src;await image.decode();}}
  catch(error){image.removeAttribute('src');throw error;}
  if(!image.naturalWidth||!image.naturalHeight)throw Error('圖片解碼後沒有有效像素');
  if(source.preview&&(image.naturalWidth!==display.width||image.naturalHeight!==display.height))throw Error('預覽圖像素尺寸與宣告不一致');
  qaFrame('decode-ready',source);
  return {source:{...source,width:source.width||image.naturalWidth,height:source.height||image.naturalHeight},image,preview:!!source.preview};
 }
 commitSource(frame,{deferFit=false}={}){
  if(!frame?.image?.naturalWidth)throw Error('圖像尚未準備完成');
  const changed=!sameSource(this.source,frame.source);
  if(changed){this.sourceGeneration=(this.sourceGeneration||0)+1;this.originalPending=null;this.originalFailure=null;}
  if(this.image!==frame.image){
   const old=this.image;old.onload=old.onerror=null;
   frame.image.className=old.className;frame.image.hidden=false;
   old.replaceWith(frame.image);this.image=frame.image;this.bindImage();
  }
  this.source={...frame.source};
  this.previewActive=!!frame.preview;
  this.committedImage=this.image;this.committedSrc=this.source.src;
  if(changed){this.resetRGB();this.view={scale:1,x:0,y:0,fitted:true};}
  this.pendingCommit={fit:changed||this.pendingCommit?.fit};
  if(!deferFit)this.finishCommit();
  return this;
 }
 finishCommit(bounds){
  if(!this.pendingCommit)return this;
  const {fit}=this.pendingCommit;this.pendingCommit=null;
  if(fit)this.fit(bounds);this.paint();
  qaFrame('committed',this.source);return this;
 }
 setSource({src,width,height,alt}={}){
  const wasPreview=this.previewActive;
  this.sourceGeneration=(this.sourceGeneration||0)+1;this.originalPending=null;this.originalFailure=null;this.previewActive=false;
  this.preparingSource=null;this.pendingCommit=null;
  if(!src){this.clear();return this;}
  const changed=this.source?.src!==src||wasPreview;
  this.source={...(!changed?this.source:{}),preview:undefined,src,width:width||(!changed&&this.source?.width)||0,height:height||(!changed&&this.source?.height)||0};
  if(alt)this.image.alt=alt;
  if(changed){this.committedImage=null;this.committedSrc=null;this.resetRGB();this.view={scale:1,x:0,y:0,fitted:true};this.image.src=src;this.fit();}
  this.paint(); // Polling the same frame must preserve zoom and pan.
  return this;
 }
 clear(){this.pendingCommit=null;this.preparingSource=null;this.restoreMaximize();this.source=null;this.image.removeAttribute('src');this.resetRGB();this.drag=null;this.view={scale:1,x:0,y:0,fitted:true};this.paint();}
 resetRGB(){this.rgb.textContent='RGB —';}
 sampleRGB(event){
  const image=this.image,context=this.sampleContext;
  if(!this.source||image.hidden||!image.complete||!image.naturalWidth||!context){this.resetRGB();return;}
  const point=this.localPoint(event),size=this.size(),x=(point.x-this.view.x)/this.view.scale,y=(point.y-this.view.y)/this.view.scale,bounds=this.bounds();
  if(point.x<0||point.y<0||point.x>=bounds.width||point.y>=bounds.height||x<0||y<0||x>=size.width||y>=size.height){this.resetRGB();return;}
  if(this.previewActive){this.rgb.textContent='RGB — 載入原圖';void this.ensureOriginal();return;}
  try{
   context.clearRect(0,0,1,1);context.drawImage(image,Math.floor(x/size.width*image.naturalWidth),Math.floor(y/size.height*image.naturalHeight),1,1,0,0,1,1);
   const d=context.getImageData(0,0,1,1).data;this.rgb.textContent=`RGB ${d[0]}, ${d[1]}, ${d[2]}`;
  }catch{this.resetRGB();}
 }
 async ensureOriginal(){
  if(!this.source||!this.previewActive)return true;
  if(this.originalPending)return this.originalPending;
  if(this.originalFailure)return false;
  const source=this.source,generation=this.sourceGeneration,image=el('img');image.crossOrigin='anonymous';image.draggable=false;image.alt=this.image.alt;
  const current=()=>this.sourceGeneration===generation&&sameSource(this.source,source)&&this.previewActive;
  const pending=Promise.resolve().then(async()=>{
   try{
    image.src=source.src;await image.decode();
    if(!current()){image.removeAttribute('src');return false;}
    if(image.naturalWidth!==source.width||image.naturalHeight!==source.height)throw Error('原圖像素尺寸與宣告不一致');
    const old=this.image;old.onload=old.onerror=null;image.className=old.className;image.hidden=old.hidden;old.replaceWith(image);
    this.image=image;this.previewActive=false;this.committedImage=image;this.committedSrc=source.src;this.bindImage();this.resetRGB();this.paint();return true;
   }catch(error){image.removeAttribute('src');if(current()){this.originalFailure=error;this.rgb.textContent='RGB — 原圖載入失敗';this.onError?.(error);}return false;}
   finally{if(this.originalPending===pending)this.originalPending=null;}
  });
  this.originalPending=pending;return pending;
 }
 bounds(){return {width:this.viewport.clientWidth,height:this.viewport.clientHeight};}
 commitBounds(){
  // ResizeObserver corrects a changed viewport during layout before paint.
  // Reusing its last measurement avoids forcing layout in the result-import
  // microtask. First/hidden/unobserved surfaces still measure normally.
  const b=this.observedBounds;
  return this.resize&&b?.width>0&&b?.height>0?b:this.bounds();
 }
 localPoint(event){const rect=this.viewport.getBoundingClientRect(),b=this.bounds();return {x:(event.clientX-rect.left)*b.width/(rect.width||1),y:(event.clientY-rect.top)*b.height/(rect.height||1)};}
 size(){return {width:this.source?.width||this.image.naturalWidth||1,height:this.source?.height||this.image.naturalHeight||1};}
 onResize(){
  const b=this.bounds(),old=this.lastBounds;this.observedBounds=b;this.lastBounds=b;if(!b.width||!b.height)return;
  if(this.view.fitted)this.fit(b);
  else if(old?.width&&old?.height){this.view.x+=(b.width-old.width)/2;this.view.y+=(b.height-old.height)/2;this.paint();}
 }
 fit(bounds){
  if(!this.source)return;const b=bounds||this.bounds(),s=this.size();if(!b.width||!b.height)return;
  const padding=Math.min(this.fitPadding,b.width-1,b.height-1),scale=Math.min((b.width-padding)/s.width,(b.height-padding)/s.height);
  this.view={scale,x:(b.width-s.width*scale)/2,y:(b.height-s.height*scale)/2,fitted:true};this.lastBounds=b;this.paint();
 }
 actual(){if(!this.source)return;this.view.scale=1;this.center();}
 center(){if(!this.source)return;const b=this.bounds(),s=this.size(),scale=this.view.scale||1;this.view={scale,x:(b.width-s.width*scale)/2,y:(b.height-s.height*scale)/2,fitted:false};this.lastBounds=b;this.paint();}
 zoomBy(factor,anchor){
  if(!this.source)return;const b=this.bounds(),old=this.view.scale||1,a=anchor||{x:b.width/2,y:b.height/2},scale=clamp(old*(Number.isFinite(factor)?factor:1),.000001,this.maxZoom);
  this.view={scale,x:a.x-(a.x-this.view.x)/old*scale,y:a.y-(a.y-this.view.y)/old*scale,fitted:false};this.lastBounds=b;this.paint();
 }
 paint(){
  const s=this.size();Object.assign(this.image.style,{width:`${s.width*this.view.scale}px`,height:`${s.height*this.view.scale}px`,left:`${this.view.x}px`,top:`${this.view.y}px`});
  const zoomText=this.source?`${Math.round(this.view.scale*1000)/10}%`:'—';
  if(this.zoomLabel.textContent!==zoomText)this.zoomLabel.textContent=zoomText;
  for(const button of [this.zoomOut,this.zoomIn,this.fitButton,this.actualButton,this.maxButton])button.disabled=!this.source;
  if(this.previewActive&&this.source&&this.view.scale*(globalThis.devicePixelRatio||1)>Math.min(this.source.preview.width/s.width,this.source.preview.height/s.height))void this.ensureOriginal();
 }
 restoreMaximize(){
  if(!this.maximizeDialog)return;
  this.observedBounds=null;
  const dialog=this.maximizeDialog,placeholder=this.placeholder,state=this.savedState;this.maximizeDialog=null;
  this.ownerDialog?.removeEventListener('close',this.ownerClosed);
  this.root.classList.remove('is-maximized');
  if(placeholder?.parentNode)placeholder.replaceWith(this.root);else this.root.remove();
  if(dialog.open)dialog.close();dialog.remove();
  this.fitPadding=state.padding;this.view=state.view;this.lastBounds=this.bounds();if(this.view.fitted)this.fit();else this.paint();
  iconButton(this.maxButton,'fullscreen','最大化');this.maxButton.setAttribute('aria-expanded','false');
  if(state.focus?.isConnected)state.focus.focus({preventScroll:true});
  this.placeholder=null;this.ownerDialog=null;this.savedState=null;
 }
 toggleMaximize(force){
  const enabled=force===undefined?!this.maximizeDialog:!!force;
  if(!enabled){this.restoreMaximize();return;}
  if(this.maximizeDialog||!this.source||!this.root.isConnected)return;
  // The modal top layer escapes transformed/clipped ancestors without changing
  // the original card or the source dialog's layout.
  this.observedBounds=null;
  this.savedState={view:{...this.view},padding:this.fitPadding,focus:document.activeElement};
  this.ownerDialog=this.root.closest('dialog');this.ownerClosed=()=>this.restoreMaximize();this.ownerDialog?.addEventListener('close',this.ownerClosed);
  this.placeholder=document.createComment('image-renderer');this.root.before(this.placeholder);
  const dialog=el('dialog',undefined,'image-renderer-fullscreen');dialog.setAttribute('aria-label',this.root.getAttribute('aria-label'));this.maximizeDialog=dialog;
  dialog.addEventListener('cancel',event=>{event.preventDefault();this.restoreMaximize();});dialog.addEventListener('close',()=>this.restoreMaximize());
  dialog.append(this.root);document.body.append(dialog);this.root.classList.add('is-maximized');dialog.showModal();
  this.fitPadding=0;iconButton(this.maxButton,'fullscreen','恢復大小');this.maxButton.setAttribute('aria-expanded','true');this.fit();this.viewport.focus({preventScroll:true});
 }
 destroy(){this.pendingCommit=null;this.preparingSource=null;this.resize?.disconnect();this.restoreMaximize();this.source=null;this.image.onload=this.image.onerror=null;this.root.remove();}
}

export function imageRenderer(options){return new ImageRenderer(options);}
