// Shared, reversible image view math used by raster and vector-backed viewers.
// The source image and annotation coordinates remain in original pixels; only
// this view state changes when the operator zooms, pans or rotates.
const TAU=Math.PI*2;
const finite=Number.isFinite;
export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function normalizeImageView(view={}){return {scale:clamp(finite(view.scale)?view.scale:1,.01,64),pan:{x:finite(view.pan?.x)?view.pan.x:0,y:finite(view.pan?.y)?view.pan.y:0},rotation:finite(view.rotation)?((view.rotation%360)+360)%360:0,fitted:view.fitted===true};}
export function fitImageView({width,height,imageWidth,imageHeight,padding=0}={}){const w=Math.max(1,width||0),h=Math.max(1,height||0),iw=Math.max(1,imageWidth||1),ih=Math.max(1,imageHeight||1),scale=Math.min(Math.max(1,w-padding*2)/iw,Math.max(1,h-padding*2)/ih);return {scale,pan:{x:0,y:0},rotation:0,fitted:true};}
export function imageToScreen(view,point,{width,height,imageWidth,imageHeight}={}){const v=normalizeImageView(view),iw=imageWidth||1,ih=imageHeight||1,cx=width/2,cy=height/2,angle=v.rotation*Math.PI/180,dx=(point.x-iw/2)*v.scale,dy=(point.y-ih/2)*v.scale,c=Math.cos(angle),s=Math.sin(angle);return {x:cx+v.pan.x+dx*c-dy*s,y:cy+v.pan.y+dx*s+dy*c};}
export function screenToImage(view,point,{width,height,imageWidth,imageHeight}={}){const v=normalizeImageView(view),iw=imageWidth||1,ih=imageHeight||1,cx=width/2,cy=height/2,angle=-v.rotation*Math.PI/180,dx=point.x-cx-v.pan.x,dy=point.y-cy-v.pan.y,c=Math.cos(angle),s=Math.sin(angle);return {x:iw/2+(dx*c-dy*s)/v.scale,y:ih/2+(dx*s+dy*c)/v.scale};}
export function zoomImageView(view,factor,anchor,{width,height,imageWidth,imageHeight,min=.01,max=64}={}){const v=normalizeImageView(view),a=anchor||{x:width/2,y:height/2},before=screenToImage(v,a,{width,height,imageWidth,imageHeight}),scale=clamp(v.scale*(finite(factor)?factor:1),min,max),next={...v,scale,fitted:false};const after=imageToScreen(next,before,{width,height,imageWidth,imageHeight});next.pan.x+=a.x-after.x;next.pan.y+=a.y-after.y;return next;}
export function panImageView(view,dx,dy){const v=normalizeImageView(view);return {...v,pan:{x:v.pan.x+(dx||0),y:v.pan.y+(dy||0)},fitted:false};}
export function rotateImageView(view,delta,anchor,{width,height,imageWidth,imageHeight}={}){const v=normalizeImageView(view),a=anchor||{x:width/2,y:height/2},before=screenToImage(v,a,{width,height,imageWidth,imageHeight}),next={...v,rotation:(v.rotation+(finite(delta)?delta:0)+3600)%360,fitted:false},after=imageToScreen(next,before,{width,height,imageWidth,imageHeight});next.pan.x+=a.x-after.x;next.pan.y+=a.y-after.y;return next;}
export function resetImageView({width,height,imageWidth,imageHeight,padding=0}={}){return fitImageView({width,height,imageWidth,imageHeight,padding});}
export function applyRasterTransform(ctx,view,{width,height,imageWidth,imageHeight}={}){const v=normalizeImageView(view),iw=imageWidth||1,ih=imageHeight||1;ctx.translate(width/2+v.pan.x,height/2+v.pan.y);ctx.rotate(v.rotation*Math.PI/180);ctx.scale(v.scale,v.scale);ctx.translate(-iw/2,-ih/2);ctx.imageSmoothingEnabled=false;return v;}
export const fullRotation=(rotation)=>((rotation%360)+360)%360;
export {TAU};
