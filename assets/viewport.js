(() => {
  'use strict';
  const $=id=>document.getElementById(id),svg=$('intentCanvas'),canvas=$('pixelCanvas'),M=AgentCVViewMath;
  let source=null,iw=800,ih=440,v={scale:1,tx:0,ty:0},w=0,h=0,fitMode=true,panning=null,space=false;
  const blocked=()=>document.body.classList.contains('busy');
  function dimensions(){const box=svg.getBoundingClientRect();return {w:box.width||iw,h:box.height||ih};}
  function draw(){const dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));M.paint(canvas.getContext('2d'),source,iw,ih,v,w,h,dpr);if(source){svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('viewBox',M.viewBox(v,w,h).join(' '));}$('zoomValue').textContent=source?`${Math.round(v.scale*1000)/10}%`:'—';for(const name of ['zoomIn','zoomOut','zoomActual','zoomFit'])$(name).disabled=!source;window.dispatchEvent(new CustomEvent('agentcv:view-changed'));}
  function resized(){const d=dimensions();if(d.w===w&&d.h===h)return;const oldCenter=M.toImage(v,{x:w/2,y:h/2});w=d.w;h=d.h;v=fitMode?M.fit(iw,ih,w,h):{...v,tx:w/2-oldCenter.x*v.scale,ty:h/2-oldCenter.y*v.scale};draw();}
  function fit(){const d=dimensions();w=d.w;h=d.h;fitMode=true;v=M.fit(iw,ih,w,h);draw();}
  function zoom(factor,p={x:w/2,y:h/2}){if(!source)return;fitMode=false;v=M.zoom(v,p,factor,Math.min(M.fit(iw,ih,w,h).scale/4,1),64);draw();}
  function actual(){if(!source)return;const q=M.toImage(v,{x:w/2,y:h/2});fitMode=false;v={scale:1,tx:w/2-q.x,ty:h/2-q.y};draw();}
  const local=e=>{const box=svg.getBoundingClientRect();return {x:e.clientX-box.left,y:e.clientY-box.top};};
  svg.addEventListener('wheel',e=>{if(!source||blocked())return;e.preventDefault();if(panning)return;const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?h:1);zoom(Math.exp(-Math.max(-200,Math.min(200,delta))*.003),local(e));},{passive:false});
  svg.addEventListener('keydown',e=>{if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey||!source)return;if(e.code==='Space'||e.key===' '){space=true;svg.classList.add('pan-ready');e.preventDefault();e.stopPropagation();}else if(e.key==='0'){fit();e.preventDefault();}else if(e.key==='1'){actual();e.preventDefault();}else if(e.key==='+'||e.key==='='){zoom(1.25);e.preventDefault();}else if(e.key==='-'){zoom(.8);e.preventDefault();}});
  function releaseSpace(){space=false;svg.classList.remove('pan-ready');}
  document.addEventListener('keyup',e=>{if(e.code==='Space'||e.key===' ')releaseSpace();});window.addEventListener('blur',()=>{releaseSpace();panning=null;svg.classList.remove('panning');});
  svg.addEventListener('pointerdown',e=>{if(!source||blocked()||!(e.button===1||(e.button===0&&space)))return;e.preventDefault();e.stopImmediatePropagation();svg.focus({preventScroll:true});panning={id:e.pointerId,start:local(e),view:{...v}};fitMode=false;svg.classList.add('panning');svg.setPointerCapture?.(e.pointerId);},true);
  svg.addEventListener('pointermove',e=>{if(!panning||panning.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();const p=local(e);v=M.pan(panning.view,p.x-panning.start.x,p.y-panning.start.y);draw();},true);
  function endPan(e){if(!panning)return;e.preventDefault();e.stopImmediatePropagation();panning=null;svg.classList.remove('panning');if(svg.hasPointerCapture?.(e.pointerId))svg.releasePointerCapture(e.pointerId);}
  svg.addEventListener('pointerup',endPan,true);svg.addEventListener('pointercancel',endPan,true);svg.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
  $('zoomIn').onclick=()=>zoom(1.25);$('zoomOut').onclick=()=>zoom(.8);$('zoomFit').onclick=fit;$('zoomActual').onclick=actual;
  if(globalThis.ResizeObserver)new ResizeObserver(resized).observe(svg);else window.addEventListener('resize',resized);
  globalThis.AgentCVViewport={
    load(image,width,height){source=image;iw=width;ih=height;releaseSpace();panning=null;fit();},
    clear(){source=null;releaseSpace();panning=null;fitMode=true;draw();},
    unitsPerPixel:()=>1/v.scale,
    screenPoint(x,y){const box=svg.getBoundingClientRect();return M.toImage(v,{x:x-box.left,y:y-box.top});},
    state:()=>({...v,width:w,height:h,source_width:iw,source_height:ih,fitMode}),
    fit,zoom,refresh:resized
  };
  resized();
})();
