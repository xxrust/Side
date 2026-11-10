/* View-only affine transform. Source pixels and annotation coordinates never change. */
globalThis.AgentCVViewMath = (() => {
  const fit=(iw,ih,w,h)=>{const scale=Math.min(w/iw,h/ih);return {scale,tx:(w-iw*scale)/2,ty:(h-ih*scale)/2};};
  const toImage=(v,p)=>({x:(p.x-v.tx)/v.scale,y:(p.y-v.ty)/v.scale});
  const toScreen=(v,p)=>({x:p.x*v.scale+v.tx,y:p.y*v.scale+v.ty});
  function zoom(v,p,factor,min=.001,max=64){const scale=Math.max(min,Math.min(max,v.scale*factor)),q=toImage(v,p);return {scale,tx:p.x-q.x*scale,ty:p.y-q.y*scale};}
  const pan=(v,dx,dy)=>({...v,tx:v.tx+dx,ty:v.ty+dy});
  const viewBox=(v,w,h)=>[-v.tx/v.scale,-v.ty/v.scale,w/v.scale,h/v.scale];
  function paint(ctx,source,iw,ih,v,w,h,dpr=1){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#0c2028';ctx.fillRect(0,0,w,h);
    if(!source)return;
    ctx.fillStyle='#fff';ctx.fillRect(v.tx,v.ty,iw*v.scale,ih*v.scale);
    ctx.drawImage(source,0,0,iw,ih,v.tx,v.ty,iw*v.scale,ih*v.scale);
  }
  return {fit,toImage,toScreen,zoom,pan,viewBox,paint};
})();
