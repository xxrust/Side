import {resolveCanvasLayers} from './structured-result-layers.js';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
const apply=(p,m)=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
const intersects=(a,b,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
const intersectionArea=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
const edgePoint=(box,p)=>({x:Math.max(box.x,Math.min(box.x+box.width,p.x)),y:Math.max(box.y,Math.min(box.y+box.height,p.y))});
function wrapLabel(text,maxWidth,measure){const lines=[];let line='';for(const ch of Array.from(text)){if(ch==='\n'){lines.push(line);line='';continue;}if(line&&measure(line+ch)>maxWidth){lines.push(line);line=ch}else line+=ch;}if(line)lines.push(line);return lines.length?lines:[''];}
/** Bounded candidates in original-image coordinates; geometry is never moved. */
export function layoutStructuredLabels(entries,{width,height,scale=1,measure}){
 const margin=6/scale,gap=4/scale,padding=4/scale,lineHeight=15/scale,placed=[],geometries=entries.map(e=>e.geometryBounds).filter(Boolean);
 const priority={roi:0,circle:1,measurement:2,polyline:3,blob:3,note:4};
 const ordered=entries.map((e,index)=>({...e,index})).sort((a,b)=>(priority[a.type]??5)-(priority[b.type]??5)||a.index-b.index);
 for(const e of ordered){const maxWidth=Math.max(1,Math.min(width-2*margin-2*padding,(e.type==='roi'?340:230)/scale)),lines=wrapLabel(e.text,maxWidth,measure),w=Math.min(width-2*margin,Math.max(...lines.map(measure))+2*padding),h=lines.length*lineHeight+2*padding,anchor=e.anchor,candidates=[];
  const add=(x,y)=>{if(x>=margin&&y>=margin&&x+w<=width-margin&&y+h<=height-margin)candidates.push({x,y,width:w,height:h});};
  const offset=9/scale;for(const [x,y]of [[anchor.x+offset,anchor.y-h-offset],[anchor.x+offset,anchor.y+offset],[anchor.x-w-offset,anchor.y-h/2],[anchor.x+offset,anchor.y-h/2],[anchor.x-w/2,anchor.y-h-offset],[anchor.x-w/2,anchor.y+offset]])add(x,y);
  const step=Math.max(lineHeight+gap,8/scale);for(let y=margin;y+h<=height-margin;y+=step){for(const x of [margin,width-w-margin,(width-w)/2,width*.25-w/2,width*.75-w/2])add(x,y);}
  for(let x=margin;x+w<=width-margin;x+=Math.max(40/scale,w/2)){add(x,margin);add(x,height-h-margin);}
  let best=null,score=Infinity;for(const candidate of candidates){if(placed.some(p=>intersects(candidate,p.box,gap)))continue;const edge=edgePoint(candidate,anchor),covered=geometries.reduce((n,g)=>n+intersectionArea(candidate,g),0),cost=Math.hypot(edge.x-anchor.x,edge.y-anchor.y)+Math.sqrt(covered)*12+candidate.y*.002;if(cost<score){score=cost;best=candidate;}}
  // Very dense or tiny views may not physically fit all labels. Keep every
  // label, expose overflow diagnostics, and never alter or discard its object.
  if(!best)best={x:margin,y:margin+placed.length*(lineHeight+gap),width:w,height:h};
  placed.push({...e,lines,box:best,padding,lineHeight,leaderEnd:edgePoint(best,anchor)});
 }
 return {bounds:{x:0,y:0,width,height},labels:placed,collisions:placed.flatMap((a,i)=>placed.slice(i+1).filter(b=>intersects(a.box,b.box)).map(b=>[a.objectId,b.objectId])),outOfBounds:placed.filter(p=>p.box.x<0||p.box.y<0||p.box.x+p.box.width>width||p.box.y+p.box.height>height).map(p=>p.objectId)};
}
function labelEntry(entry){const {object:o,matrix:m}=entry,g=o.geometry,own=o.coordinateSpace.transform||[1,0,0,1,0,0],map=p=>apply(apply(p,own),m),pts=g.points||[];let anchor,shape;
 if(o.type==='circle'){anchor=map({x:g.center.x+g.radius*Math.SQRT1_2,y:g.center.y-g.radius*Math.SQRT1_2});shape=Array.from({length:16},(_,i)=>map({x:g.center.x+g.radius*Math.cos(i*Math.PI/8),y:g.center.y+g.radius*Math.sin(i*Math.PI/8)}));}else{anchor=map(o.type==='measurement'&&pts.length>1?{x:(pts[0].x+pts.at(-1).x)/2,y:(pts[0].y+pts.at(-1).y)/2}:pts[0]||g.center);shape=pts.map(map);}
 const geometryBounds=shape.length?{x:Math.min(...shape.map(p=>p.x)),y:Math.min(...shape.map(p=>p.y)),width:Math.max(...shape.map(p=>p.x))-Math.min(...shape.map(p=>p.x)),height:Math.max(...shape.map(p=>p.y))-Math.min(...shape.map(p=>p.y))}:null;
 const value=Number.isFinite(g.value)?String(Number(g.value.toFixed(3))):g.value;return {objectId:o.id,runId:o.runId,layerId:entry.layer.id,type:o.type,anchor,geometryBounds,text:`🔒 ${o.label||o.id}${o.type==='measurement'?` ${value} ${g.unit}`:o.type==='note'?` ${g.text}`:''}`};
}
export class StructuredLayersView{
 constructor(view){this.view=view;this.selection=null;this.errors=new Set();this.labelLayouts=new Map()}
 layers(item){try{return resolveCanvasLayers(this.view.project,this.view.boardId,item)}catch(e){if(!this.errors.has(e.message)){this.errors.add(e.message);this.view.onError?.('結構圖層：'+e.message)}return []}}
 objects(item){return this.layers(item).flatMap(layer=>layer.objects.map(object=>({layer,object,matrix:layer.displayTransform}))) }
 paint(ctx,item,scale,layers){const entries=layers?layers.flatMap(layer=>layer.objects.map(object=>({layer,object,matrix:layer.displayTransform||[1,0,0,1,0,0]}))):this.objects(item);
  for(const entry of entries){const {object:o,matrix:m}=entry,g=o.geometry;ctx.save();ctx.transform(...m);const own=o.coordinateSpace.transform;if(own)ctx.transform(...own);ctx.strokeStyle=this.selection?.objectId===o.id?'#fff094':'#7bdfc8';ctx.lineWidth=1.8/scale;ctx.setLineDash(o.type==='roi'?[6/scale,3/scale]:[]);const pts=g.points||[];if(o.type==='circle'){ctx.beginPath();ctx.arc(g.center.x,g.center.y,g.radius,0,Math.PI*2);ctx.stroke()}else if(pts.length){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(['roi','blob'].includes(o.type))ctx.closePath();ctx.stroke()}ctx.restore();}
  const asset=this.view.asset(item);if(!asset||!entries.length)return;ctx.save();ctx.font=`${12/scale}px sans-serif`;const layout=layoutStructuredLabels(entries.map(labelEntry),{width:asset.width,height:asset.height,scale,measure:text=>ctx.measureText(text).width});this.labelLayouts.set(item.id,layout);
  for(const label of layout.labels){const color=this.selection?.objectId===label.objectId?'#fff094':'#a4e7d5',a=label.anchor,b=label.leaderEnd;ctx.strokeStyle=color;ctx.globalAlpha=.8;ctx.lineWidth=1/scale;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x,b.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle='#10272ff2';ctx.fillRect(label.box.x,label.box.y,label.box.width,label.box.height);ctx.strokeStyle=color;ctx.lineWidth=.7/scale;ctx.strokeRect(label.box.x,label.box.y,label.box.width,label.box.height);ctx.fillStyle=color;ctx.textBaseline='top';for(const [i,line]of label.lines.entries())ctx.fillText(line,label.box.x+label.padding,label.box.y+label.padding+i*label.lineHeight);}
  ctx.restore();
 }

 hit(item,p,tolerance){for(const {layer,object:o,matrix:m}of this.objects(item).reverse()){const own=o.coordinateSpace.transform||[1,0,0,1,0,0],points=(o.geometry.points||[]).map(point=>apply(apply(point,own),m));if(o.type==='circle'){const center=apply(apply(o.geometry.center,own),m),edge=apply(apply({x:o.geometry.center.x+o.geometry.radius,y:o.geometry.center.y},own),m),r=Math.hypot(edge.x-center.x,edge.y-center.y);if(Math.abs(Math.hypot(p.x-center.x,p.y-center.y)-r)<tolerance)return {structuredObject:o,structuredLayer:layer}}
 for(let i=0;i<points.length-1+(points.length>2&&['roi','blob'].includes(o.type)?1:0);i++){const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<tolerance)return {structuredObject:o,structuredLayer:layer}}}return null}
 snapshot(items){return items.flatMap(item=>this.layers(item).map(layer=>({...layer,itemId:item.id}))) }
 show(item){this.dialog?.remove();const v=this.view,d=el('dialog');d.className='canvas-project-dialog';d.setAttribute('aria-label','結構化圖層與跨步引用');const close=el('button','關閉');close.onclick=()=>d.close();d.append(el('h3','結構化圖層'),close,el('p','🔒 自動產物唯讀，可以選取與詢問。跨步顯示引用不會改變計算依賴。'));const all=[];for(const run of v.project.data.algorithmRuns||[]){try{for(const layer of v.project.getStructuredLayers(run.runId))all.push(layer)}catch{}}
 for(const layer of this.layers(item)){const row=el('div'),label=el('strong',`${layer.stepId} · ${layer.id} · ${layer.objects.length} 個物件`);row.append(label);for(const o of layer.objects){const ask=el('button',`🔒 ${o.label||o.id} · 詢問`);ask.onclick=()=>{this.selection={itemId:item.id,runId:layer.runId,layerId:layer.id,objectId:o.id};v.selected=new Set([item.id]);d.close();v.perform(()=>v.ask())};row.append(ask)}if(layer.displayReferenceId){const hide=el('button','隱藏此引用');hide.onclick=()=>v.perform(()=>{v.project.setCanvasLayerVisibility(v.boardId,layer.displayReferenceId,false);d.close();v.render()});row.append(hide)}d.append(row)}
 const select=el('select');select.setAttribute('aria-label','選擇真實跨步圖層');for(const layer of all){const option=el('option',`${layer.stepId} · ${layer.id} · 原圖 ${layer.imageId}`);option.value=JSON.stringify({runId:layer.runId,layerId:layer.id});select.append(option)}const add=el('button','引用此圖層（同源座標）');add.disabled=!all.length;add.onclick=()=>v.perform(()=>{v.project.referenceCanvasLayer(v.boardId,{itemId:item.id,...JSON.parse(select.value)});d.close();v.render()});d.append(select,add,el('small','跨不同原圖需由 API 提供明確 affine 座標變換，不能直接假裝對齊。'));document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();this.dialog=d;
 }
}
