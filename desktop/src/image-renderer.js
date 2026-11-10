import {clamp} from './image-viewport.js';
import {iconButton} from './ui-icons.js';
import './image-renderer.css';

const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};

/** A native-pixel image with a display camera shared by inspection surfaces. */
export class ImageRenderer{
 constructor({label='圖像渲染框',maxZoom=64,onLoad,onError}={}){
  Object.assign(this,{maxZoom,onLoad,onError,source:null,fitPadding:20,drag:null});
  this.view={scale:1,x:0,y:0,fitted:true};
  this.root=el('section',undefined,'image-renderer');this.root.setAttribute('aria-label',label);
  this.viewport=el('div',undefined,'image-renderer-viewport');this.viewport.tabIndex=0;this.viewport.setAttribute('role','img');this.viewport.setAttribute('aria-label',label);
  this.image=el('img');this.image.draggable=false;this.image.alt=label;this.viewport.append(this.image);this.root.append(this.viewport);
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
  this.image.onload=()=>{
   if(!this.source||this.image.getAttribute('src')!==this.source.src)return;
   this.source.width=this.source.width||this.image.naturalWidth;this.source.height=this.source.height||this.image.naturalHeight;
   if(this.view.fitted)this.fit();else this.paint();this.onLoad?.(this.source);
  };
  this.image.onerror=()=>{if(this.source)this.onError?.(Error('圖片解碼失敗'));};this.paint();
 }
 setSource({src,width,height,alt}={}){
  if(!src){this.clear();return this;}
  const changed=this.source?.src!==src;
  this.source={...(!changed?this.source:{}),src,width:width||(!changed&&this.source?.width)||0,height:height||(!changed&&this.source?.height)||0};
  if(alt)this.image.alt=alt;
  if(changed){this.resetRGB();this.view={scale:1,x:0,y:0,fitted:true};this.image.src=src;this.fit();}
  this.paint(); // Polling the same frame must preserve zoom and pan.
  return this;
 }
 clear(){this.restoreMaximize();this.source=null;this.image.removeAttribute('src');this.resetRGB();this.drag=null;this.view={scale:1,x:0,y:0,fitted:true};this.paint();}
 resetRGB(){this.rgb.textContent='RGB —';}
 sampleRGB(event){
  const image=this.image,context=this.sampleContext;
  if(!this.source||image.hidden||!image.complete||!image.naturalWidth||!context){this.resetRGB();return;}
  const point=this.localPoint(event),size=this.size(),x=(point.x-this.view.x)/this.view.scale,y=(point.y-this.view.y)/this.view.scale,bounds=this.bounds();
  if(point.x<0||point.y<0||point.x>=bounds.width||point.y>=bounds.height||x<0||y<0||x>=size.width||y>=size.height){this.resetRGB();return;}
  try{
   context.clearRect(0,0,1,1);context.drawImage(image,Math.floor(x/size.width*image.naturalWidth),Math.floor(y/size.height*image.naturalHeight),1,1,0,0,1,1);
   const d=context.getImageData(0,0,1,1).data;this.rgb.textContent=`RGB ${d[0]}, ${d[1]}, ${d[2]}`;
  }catch{this.resetRGB();}
 }
 bounds(){return {width:this.viewport.clientWidth,height:this.viewport.clientHeight};}
 localPoint(event){const rect=this.viewport.getBoundingClientRect(),b=this.bounds();return {x:(event.clientX-rect.left)*b.width/(rect.width||1),y:(event.clientY-rect.top)*b.height/(rect.height||1)};}
 size(){return {width:this.source?.width||this.image.naturalWidth||1,height:this.source?.height||this.image.naturalHeight||1};}
 onResize(){
  const b=this.bounds(),old=this.lastBounds;this.lastBounds=b;if(!b.width||!b.height)return;
  if(this.view.fitted)this.fit();
  else if(old?.width&&old?.height){this.view.x+=(b.width-old.width)/2;this.view.y+=(b.height-old.height)/2;this.paint();}
 }
 fit(){
  if(!this.source)return;const b=this.bounds(),s=this.size();if(!b.width||!b.height)return;
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
  this.zoomLabel.textContent=this.source?`${Math.round(this.view.scale*1000)/10}%`:'—';
  for(const button of [this.zoomOut,this.zoomIn,this.fitButton,this.actualButton,this.maxButton])button.disabled=!this.source;
 }
 restoreMaximize(){
  if(!this.maximizeDialog)return;
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
  this.savedState={view:{...this.view},padding:this.fitPadding,focus:document.activeElement};
  this.ownerDialog=this.root.closest('dialog');this.ownerClosed=()=>this.restoreMaximize();this.ownerDialog?.addEventListener('close',this.ownerClosed);
  this.placeholder=document.createComment('image-renderer');this.root.before(this.placeholder);
  const dialog=el('dialog',undefined,'image-renderer-fullscreen');dialog.setAttribute('aria-label',this.root.getAttribute('aria-label'));this.maximizeDialog=dialog;
  dialog.addEventListener('cancel',event=>{event.preventDefault();this.restoreMaximize();});dialog.addEventListener('close',()=>this.restoreMaximize());
  dialog.append(this.root);document.body.append(dialog);this.root.classList.add('is-maximized');dialog.showModal();
  this.fitPadding=0;iconButton(this.maxButton,'fullscreen','恢復大小');this.maxButton.setAttribute('aria-expanded','true');this.fit();this.viewport.focus({preventScroll:true});
 }
 destroy(){this.resize?.disconnect();this.restoreMaximize();this.source=null;this.image.onload=this.image.onerror=null;this.root.remove();}
}

export function imageRenderer(options){return new ImageRenderer(options);}
