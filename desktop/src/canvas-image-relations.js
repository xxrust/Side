// Semantic image links use board coordinates; they never imply a pixel transform or measurement.
export const IMAGE_RELATION_SCHEMA='agentcv-canvas-image-relation-1';
const fail=message=>{throw Error(message)};
export function imageRelation(board,{id,fromItemId,toItemId,label='',author='human',at=new Date().toISOString()}){
 if(typeof id!=='string'||!id.trim()||id.length>200)fail('連線識別無效');
 if(!board?.items?.some(i=>i.id===fromItemId)||!board.items.some(i=>i.id===toItemId))fail('連線兩端必須是目前畫板上的圖像');
 if(fromItemId===toItemId)fail('請選取兩張不同圖像建立關係');
 if(typeof label!=='string'||label.length>4000)fail('關係說明最多 4000 字');
 if(!['human','agent'].includes(author))fail('關係作者無效');
 return {schema:IMAGE_RELATION_SCHEMA,id,boardId:board.id,fromItemId,toItemId,label,author,at};
}
// Cache contains geometry and identifiers only, never board/assets or image bytes.
const routers=new Map(),HEADER=72,CLEARANCE=16,MAX_ITEMS=64;
const point=(x,y)=>({x,y});
const intersects=(a,b,r)=>a.x===b.x?a.x>r.left&&a.x<r.right&&Math.max(a.y,b.y)>r.top&&Math.min(a.y,b.y)<r.bottom:a.y>r.top&&a.y<r.bottom&&Math.max(a.x,b.x)>r.left&&Math.min(a.x,b.x)<r.right;
function routerFor(board){
 const items=(board?.items||[]).filter(i=>[i.x,i.y,i.width,i.height].every(Number.isFinite)&&i.width>0&&i.height>0).slice(0,MAX_ITEMS);
 const key=JSON.stringify([board?.id,items.map(i=>[i.id,i.x,i.y,i.width,i.height])]);
 if(routers.has(key))return routers.get(key);
 const boxes=items.map(i=>({id:i.id,left:i.x-CLEARANCE,right:i.x+i.width+CLEARANCE,top:i.y-HEADER-CLEARANCE,bottom:i.y+i.height+CLEARANCE}));
 const xs=[...new Set(items.flatMap((i,k)=>[boxes[k].left,boxes[k].right,i.x+i.width/2]))].sort((a,b)=>a-b),ys=[...new Set(items.flatMap((i,k)=>[boxes[k].top,boxes[k].bottom,i.y+i.height/2]))].sort((a,b)=>a-b);
 const xi=new Map(xs.map((v,k)=>[v,k])),yi=new Map(ys.map((v,k)=>[v,k])),width=xs.length;
 const ports=new Map(items.map((i,k)=>{const r=boxes[k],cx=i.x+i.width/2,cy=i.y+i.height/2;return [i.id,[[point(i.x,cy),point(r.left,cy)],[point(i.x+i.width,cy),point(r.right,cy)],[point(cx,i.y),point(cx,r.top)],[point(cx,i.y+i.height),point(cx,r.bottom)]].map(([anchor,p])=>({anchor,p,index:yi.get(p.y)*width+xi.get(p.x)}))];}));
 const router={boxes,xs,ys,width,ports,routes:new Map(),links:new Map(),scenes:new Map()};routers.set(key,router);if(routers.size>8)routers.delete(routers.keys().next().value);return router;
}
function push(heap,item){let n=heap.length;heap.push(item);while(n){const p=(n-1)>>1;if(heap[p].cost<=item.cost)break;heap[n]=heap[p];n=p;}heap[n]=item;}
function pop(heap){const first=heap[0],last=heap.pop();if(heap.length){let n=0;while(n*2+1<heap.length){let child=n*2+1;if(child+1<heap.length&&heap[child+1].cost<heap[child].cost)child++;if(last.cost<=heap[child].cost)break;heap[n]=heap[child];n=child;}heap[n]=last;}return first;}
function route(router,fromId,toId){
 const key=JSON.stringify([fromId,toId]);if(router.routes.has(key))return router.routes.get(key);
 const {boxes,xs,ys,width,ports}=router,source=ports.get(fromId),target=ports.get(toId);if(!source||!target||fromId===toId)return null;
 const clear=(a,b,exclude)=>!boxes.some(r=>!exclude?.has(r.id)&&intersects(a,b,r));
 const starts=source.filter(p=>clear(p.anchor,p.p,new Set([fromId]))),ends=target.filter(p=>clear(p.anchor,p.p,new Set([toId])));
 const count=xs.length*ys.length,dist=new Float64Array(count).fill(Infinity),previous=new Int32Array(count).fill(-1),origin=new Int8Array(count).fill(-1),heap=[];
 for(let i=0;i<starts.length;i++){const p=starts[i],cost=Math.abs(p.anchor.x-p.p.x)+Math.abs(p.anchor.y-p.p.y);if(cost<dist[p.index]){dist[p.index]=cost;origin[p.index]=i;push(heap,{index:p.index,cost});}}
 const goals=new Map(ends.map(p=>[p.index,p]));let finish=null;
 while(heap.length){const current=pop(heap),u=current.index;if(current.cost!==dist[u])continue;if(goals.has(u)){finish={index:u,port:goals.get(u)};break;}
  let links=router.links.get(u);if(!links){const x=u%width,y=Math.floor(u/width),a=point(xs[x],ys[y]);links=[];for(const v of [x?u-1:-1,x+1<width?u+1:-1,y?u-width:-1,y+1<ys.length?u+width:-1]){if(v<0)continue;const b=point(xs[v%width],ys[Math.floor(v/width)]);if(clear(a,b))links.push([v,Math.abs(a.x-b.x)+Math.abs(a.y-b.y)]);}router.links.set(u,links);}
  for(const [v,length] of links){const cost=current.cost+length;if(cost<dist[v]){dist[v]=cost;previous[v]=u;origin[v]=origin[u];push(heap,{index:v,cost});}}
 }
 if(!finish)return null; // Overlapping cards may have no unobstructed endpoint.
 const path=[];for(let u=finish.index;u>=0;u=previous[u])path.push(point(xs[u%width],ys[Math.floor(u/width)]));path.reverse();
 const points=[starts[origin[finish.index]].anchor,...path,finish.port.anchor],simplified=[];
 for(const p of points){const last=simplified.at(-1);if(last&&last.x===p.x&&last.y===p.y)continue;const a=simplified.at(-2);if(a&&last&&(a.x===last.x&&last.x===p.x||a.y===last.y&&last.y===p.y))simplified.pop();simplified.push(p);}
 const lengths=simplified.slice(1).map((p,i)=>Math.abs(p.x-simplified[i].x)+Math.abs(p.y-simplified[i].y));let half=lengths.reduce((a,b)=>a+b,0)/2,center=simplified[0];for(let i=0;i<lengths.length;i++){if(half<=lengths[i]){const a=simplified[i],b=simplified[i+1],t=lengths[i]?half/lengths[i]:0;center=point(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);break;}half-=lengths[i];}
 const geometry={from:simplified[0],to:simplified.at(-1),center,points:simplified};router.routes.set(key,geometry);return geometry;
}
export function imageRelationLayout(board,relation){
 if(relation?.schema!==IMAGE_RELATION_SCHEMA||relation.boardId!==board?.id)return null;
 return route(routerFor(board),relation.fromItemId,relation.toItemId);
}
function labelCenter(geometry,router,occupied){
 const lengths=geometry.points.slice(1).map((p,i)=>Math.abs(p.x-geometry.points[i].x)+Math.abs(p.y-geometry.points[i].y)),total=lengths.reduce((a,b)=>a+b,0);
 const at=distance=>{for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]){const a=geometry.points[i],b=geometry.points[i+1],t=lengths[i]?distance/lengths[i]:0;return point(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);}distance-=lengths[i];}return geometry.to;};
 const candidates=[{p:geometry.center,d:total/2}];
 // Sampling is bounded even for very large board coordinates.
 const samples=Math.min(64,Math.max(2,Math.ceil(total/40)));
 for(let i=1;i<samples;i++){const d=total*i/samples;candidates.push({p:at(d),d});}
 let best=null,bestScore=-Infinity;
 for(const {p,d}of candidates){if(router.boxes.some(r=>p.x>r.left&&p.x<r.right&&p.y>r.top&&p.y<r.bottom))continue;
  const separation=occupied.length?Math.min(...occupied.map(q=>Math.hypot(p.x-q.x,p.y-q.y))):120;
  // Prefer the midpoint once labels have at least 80 units of breathing room.
  const score=Math.min(80,separation)-Math.abs(d-total/2)*.015;
  if(score>bestScore){bestScore=score;best=p;}
 }return best||geometry.center;
}
/** Parallel links retain IDs and paths, with stable separated label anchors. */
export function imageRelationScene(board,relations){
 const router=routerFor(board),valid=(relations||[]).filter(r=>r.schema===IMAGE_RELATION_SCHEMA&&r.boardId===board?.id),key=JSON.stringify(valid.map(r=>[r.id,r.fromItemId,r.toItemId]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
 if(router.scenes.has(key))return router.scenes.get(key);
 const geometryById=new Map(),occupied=[];
 for(const r of [...valid].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){const geometry=route(router,r.fromItemId,r.toItemId);if(!geometry)continue;const center=labelCenter(geometry,router,occupied);occupied.push(center);geometryById.set(r.id,{...geometry,center});}
 const result=new Map(valid.filter(r=>geometryById.has(r.id)).map(r=>[r.id,geometryById.get(r.id)]));router.scenes.set(key,result);if(router.scenes.size>16)router.scenes.delete(router.scenes.keys().next().value);return result;
}
export function imageRelationLabel(relation,index,{zoom=1,selectedId=null}={}){const raw=relation.label||'說明關係';return zoom<.65&&relation.id!==selectedId?String(index+1):raw.length>18?raw.slice(0,17)+'…':raw;}
export function imageRelationHit(board,relations,p,tolerance=8,measureLabel=null,options={}){
 const scene=imageRelationScene(board,relations),zoom=options.zoom??8/tolerance;
 for(let index=relations.length-1;index>=0;index--){const r=relations[index],g=scene.get(r.id);if(!g)continue;const label=imageRelationLabel(r,index,{...options,zoom}),labelWidth=((measureLabel?measureLabel(label):label.length*12)+12)/zoom;
  if(Math.abs(p.x-g.center.x)<=labelWidth/2&&p.y>=g.center.y-12/zoom&&p.y<=g.center.y+12/zoom)return r;
 }
 for(const r of [...relations].reverse()){const g=scene.get(r.id);if(!g)continue;
  for(let i=1;i<g.points.length;i++){const a=g.points[i-1],b=g.points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=tolerance)return r;}
 }return null;
}
