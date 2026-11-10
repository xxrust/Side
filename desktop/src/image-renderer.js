import {clamp} from './image-viewport.js';
import {iconButton} from './ui-icons.js';
import './image-renderer.css';

const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};

/**
 * One image surface for every image that can be inspected in the workbench.
 * The source stays at its native pixels; only the display camera changes.
 */
export class ImageRenderer{
 constructor({label='圖像渲染框',maxZoom=64,onLoad,onError}={}){
  this.maxZoom=maxZoom;this.onLoad=onLoad;this.onError=onError;this.source=null;this.view={scale:1,x:0,y:0,fitted:true};this.fitPadding=20;this.drag=null;
  this.root=el('section',undefined,'image-renderer');this.root.setAttribute('aria-label',label);
  this.viewport=el('div',undefined,'image-renderer-viewport');this.viewport.tabIndex=0;this.viewport.setAttribute('role','img');this.viewport.setAttribute('aria-label',label);this.image=el('img');this.image.draggable=false;this.image.alt=label;this.viewport.append(this.image);this.root.append(this.viewport);
  this.controls=el('nav',undefined,'image-renderer-controls');this.controls.setAttribute('aria-label','圖像檢視工具');
  const button=(icon,text,fn)=>{const b=iconButton(el('button'),icon,text);b.type='button';b.onclick=fn;this.controls.append(b);return b;};
  this.zoomOut=button('zoom-out','縮小',()=>this.zoomBy(.8));this.zoomLabel=el('output','—');this.zoomLabel.className='image-renderer-zoom';this.controls.append(this.zoomLabel);this.zoomIn=button('zoom-in','放大',()=>this.zoomBy(1.25));this.fitButton=button('fit','適合畫面',()=>this.fit());this.actualButton=el('button','1:1');this.actualButton.type='button';this.actualButton.title='原始尺寸 1:1';this.actualButton.setAttribute('aria-label','原始尺寸 1:1');this.actualButton.onclick=()=>this.actual();this.controls.append(this.actualButton);this.maxButton=button('fullscreen','最大化',()=>this.toggleMaximize());this.root.append(this.controls);
  this.viewport.addEventListener('wheel',event=>{event.preventDefault();const rect=this.viewport.getBoundingClientRect(),anchor={x:event.clientX-rect.left,y:event.clientY-rect.top};this.zoomBy(Math.exp(-event.deltaY*.002),anchor);},{passive:false});
  this.viewport.addEventListener('pointerdown',event=>{if(event.button!==0&&event.button!==1)return;event.preventDefault();this.viewport.focus({preventScroll:true});if(!this.source)return;this.drag={x:event.clientX,y:event.clientY,view:{...this.view}};this.viewport.setPointerCapture?.(event.pointerId);this.viewport.classList.add('is-panning');});
  this.viewport.addEventListener('pointermove',event=>{if(!this.drag)return;this.view={...this.drag.view,x:this.drag.view.x+event.clientX-this.drag.x,y:this.drag.view.y+event.clientY-this.drag.y,fitted:false};this.paint();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.viewport.addEventListener(type,()=>{this.drag=null;this.viewport.classList.remove('is-panning')});
  this.viewport.addEventListener('dblclick',()=>this.root.classList.contains('is-maximized')?this.toggleMaximize(false):this.fit());
  this.viewport.addEventListener('keydown',event=>{if(event.target!==this.viewport||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;if(event.key==='+'||event.key==='='){event.preventDefault();this.zoomBy(1.25)}else if(event.key==='-'){event.preventDefault();this.zoomBy(.8)}else if(event.key==='0'){event.preventDefault();this.fit()}else if(event.key==='1'){event.preventDefault();this.actual()}});
  this.resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(this.view.fitted)this.fit();else this.center()}):null;this.resize?.observe(this.viewport);
  this.image.onload=()=>{if(!this.source)return;this.source.width=this.source.width||this.image.naturalWidth;this.source.height=this.source.height||this.image.naturalHeight;this.fit();this.onLoad?.(this.source);};this.image.onerror=()=>this.onError?.(Error('圖片解碼失敗'));
 }
 setSource({src,width,height,alt}={}){const changed=this.source?.src!==src;this.source={src,width:width||0,height:height||0};if(alt)this.image.alt=alt;if(changed){this.view={scale:1,x:0,y:0,fitted:true};this.image.removeAttribute('src');if(src)this.image.src=src;}else if(this.image.complete&&this.image.naturalWidth)this.fit();this.paint();return this;}
 clear(){this.source=null;this.image.removeAttribute('src');this.view={scale:1,x:0,y:0,fitted:true};this.paint();}
 bounds(){const rect=this.viewport.getBoundingClientRect();return {width:rect.width||this.viewport.clientWidth||1,height:rect.height||this.viewport.clientHeight||1};}
 size(){return {width:this.source?.width||this.image.naturalWidth||1,height:this.source?.height||this.image.naturalHeight||1};}
 fit(){if(!this.source)return;const b=this.bounds(),s=this.size(),padding=Math.max(0,this.fitPadding||0),scale=Math.max(.01,Math.min((b.width-padding)/s.width,(b.height-padding)/s.height));this.view={scale,x:(b.width-s.width*scale)/2,y:(b.height-s.height*scale)/2,fitted:true};this.paint();}
 actual(){if(!this.source)return;const b=this.bounds(),s=this.size(),scale=1;this.view={scale,x:(b.width-s.width*scale)/2,y:(b.height-s.height*scale)/2,fitted:false};this.paint();}
 center(){if(!this.source)return;const b=this.bounds(),s=this.size(),scale=this.view.scale||1;this.view={...this.view,x:(b.width-s.width*scale)/2,y:(b.height-s.height*scale)/2,fitted:false};this.paint();}
 zoomBy(factor,anchor){if(!this.source)return;const b=this.bounds(),s=this.size(),old=this.view.scale||1,a=anchor||{x:b.width/2,y:b.height/2},scale=clamp(old*(Number.isFinite(factor)?factor:1),.01,this.maxZoom),imageX=(a.x-this.view.x)/old,imageY=(a.y-this.view.y)/old;this.view={scale,x:a.x-imageX*scale,y:a.y-imageY*scale,fitted:false};this.paint();}
 paint(){const s=this.size();Object.assign(this.image.style,{width:`${s.width*this.view.scale}px`,height:`${s.height*this.view.scale}px`,left:`${this.view.x}px`,top:`${this.view.y}px`});this.zoomLabel.textContent=this.source?`${Math.round(this.view.scale*1000)/10}%`:'—';this.zoomOut.disabled=!this.source;this.zoomIn.disabled=!this.source;this.fitButton.disabled=!this.source;this.actualButton.disabled=!this.source;this.maxButton.disabled=!this.source;}
 restoreMaximize(){
  if(!this.maximizeHost)return;
  this.root.classList.remove('is-maximized');
  if(this.maximizeHost.isConnected)for(const [key,value] of Object.entries(this.maximizeHostStyles))this.maximizeHost.style[key]=value;
  if(this.maximizeDialog?.isConnected){this.maximizeDialog.classList.remove('image-renderer-dialog-maximized');for(const [key,value] of Object.entries(this.maximizeDialogStyles))this.maximizeDialog.style[key]=value;}
  this.maximizeHost=null;this.maximizeHostStyles={};this.maximizeDialog=null;this.maximizeDialogStyles={};
 }
 toggleMaximize(force){
  const enabled=force===undefined?!this.root.classList.contains('is-maximized'):!!force;
  if(enabled){
   this.maximizeHost=this.root.parentElement;this.maximizeHostStyles={};this.maximizeDialog=this.root.closest('dialog');this.maximizeDialogStyles={};
   if(this.maximizeHost){for(const key of ['position','inset','width','height','maxWidth','maxHeight','margin','padding','zIndex','display','overflow','background'])this.maximizeHostStyles[key]=this.maximizeHost.style[key];this.maximizeHost.style.position='fixed';this.maximizeHost.style.inset='0';this.maximizeHost.style.width='auto';this.maximizeHost.style.height='auto';this.maximizeHost.style.maxWidth='none';this.maximizeHost.style.maxHeight='none';this.maximizeHost.style.margin='0';this.maximizeHost.style.padding='0';this.maximizeHost.style.zIndex='220';this.maximizeHost.style.display='block';this.maximizeHost.style.overflow='hidden';this.maximizeHost.style.background='#0b151b';}
   if(this.maximizeDialog){for(const key of ['position','inset','width','height','maxWidth','maxHeight','margin','padding','borderRadius','overflow'])this.maximizeDialogStyles[key]=this.maximizeDialog.style[key];this.maximizeDialog.classList.add('image-renderer-dialog-maximized');}
   this.root.classList.add('is-maximized');
  }else {this.restoreMaximize();this.fitPadding=20;}
  this.maxButton.dataset.icon=enabled?'contract':'fullscreen';this.maxButton.title=enabled?'恢復大小':'最大化';this.maxButton.setAttribute('aria-label',enabled?'恢復大小':'最大化');
  if(enabled)this.fitPadding=0;
  requestAnimationFrame(()=>enabled?this.fit():(this.view.fitted?this.fit():this.center()));
 }
 destroy(){this.resize?.disconnect();this.restoreMaximize();this.root.remove();}
}

export function imageRenderer(options){return new ImageRenderer(options);}
