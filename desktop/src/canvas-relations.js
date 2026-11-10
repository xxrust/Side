// Relations between visual annotations, in original asset pixels.
// These computations do not inspect image pixels and are not CV measurements.
const fail=message=>{throw Error(message)};
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?{x:p.x,y:p.y}:fail('標記座標不完整，無法計算距離');
const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function annotationKey(itemId,annotationId){
 if(typeof itemId!=='string'||!itemId||typeof annotationId!=='string'||!annotationId)fail('請提供圖像與標記識別');
 return JSON.stringify([itemId,annotationId]);
}

/** Returns selected records in selection order; rejects stale references. */
export function selectedAnnotations(board,keys){
 if(!board||!Array.isArray(board.items))fail('畫板不存在');
 return [...(keys||[])].map(key=>{
  let ids;try{ids=JSON.parse(key)}catch{fail('標記引用格式不正確')}
  if(!Array.isArray(ids)||ids.length!==2||ids.some(id=>typeof id!=='string'))fail('標記引用格式不正確');
  const [itemId,annotationId]=ids,item=board.items.find(i=>i.id===itemId),annotation=item?.annotations?.find(a=>a.id===annotationId);
  if(!item||!annotation)fail('選取的標記已移除，請重新選取');
  return {key:annotationKey(itemId,annotationId),itemId,annotationId,assetId:item.assetId,item,annotation};
 });
}

function geometry(annotation){
 const pts=annotation.points;
 if(!Array.isArray(pts)||!pts.length)fail('標記沒有可量測的幾何');
 if(['text','point'].includes(annotation.type))return {type:'point',point:point(pts[0])};
 if(!['line','arrow'].includes(annotation.type)||pts.length!==2)fail('目前請選取兩條直線，或文字錨點與直線；輪廓距離尚未定義');
 const from=point(pts[0]),to=point(pts[1]);if(distance(from,to)<1e-9)fail('直線長度為零，請先調整標記');
 return {type:'line',from,to};
}
function center(g){return g.type==='point'?g.point:midpoint(g.from,g.to)}
function project(p,line){
 const dx=line.to.x-line.from.x,dy=line.to.y-line.from.y,t=((p.x-line.from.x)*dx+(p.y-line.from.y)*dy)/(dx*dx+dy*dy);
 return {x:line.from.x+t*dx,y:line.from.y+t*dy};
}
function assetFor(assets,id){return assets instanceof Map?assets.get(id):Array.isArray(assets)?assets.find(a=>a.id===id):assets?.[id]}

/**
 * auto: point-point, point-to-supporting-line, parallel supporting-line spacing.
 * center: anchor / line midpoint distance.
 * endpoints: closest pair of line endpoints / point anchors (not segment distance).
 * Parallel lines use a numerical angular tolerance of 1e-8, not a fitted CV tolerance.
 */
export function measureAnnotationDistance(board,assets,keys,{mode='auto'}={}){
 const refs=selectedAnnotations(board,keys);
 if(refs.length!==2||refs[0].key===refs[1].key)fail('請選取兩個不同標記再建立距離');
 if(!['auto','center','endpoints'].includes(mode))fail('不支援的距離定義；請選垂距、中心距或最近端點距');
 const [a,b]=refs;
 if(!a.assetId||a.assetId!==b.assetId)fail('兩個標記不在同一圖像，尚無共同座標，不能直接量測');
 const asset=assetFor(assets,a.assetId);if(!asset)fail('來源圖像不存在，請重新引用');
 const ga=geometry(a.annotation),gb=geometry(b.annotation);
 let endpoints,definition,resolvedMode;
 if(mode==='center'){
  endpoints=[center(ga),center(gb)];definition='標記中心距（直線取中點，文字取錨點）';resolvedMode='center';
 }else if(mode==='endpoints'){
  const pa=ga.type==='point'?[ga.point]:[ga.from,ga.to],pb=gb.type==='point'?[gb.point]:[gb.from,gb.to];
  const pairs=pa.flatMap(p=>pb.map(q=>[p,q]));pairs.sort((x,y)=>distance(...x)-distance(...y));
  endpoints=pairs[0];definition='最近端點距（文字取錨點；不是線段最短距離）';resolvedMode='endpoints';
 }else if(ga.type==='point'&&gb.type==='point'){
  endpoints=[ga.point,gb.point];definition='文字／點標記錨點之間的距離';resolvedMode='point-point';
 }else if(ga.type==='point'||gb.type==='point'){
  const p=ga.type==='point'?ga.point:gb.point,l=ga.type==='line'?ga:gb;
  endpoints=ga.type==='point'?[p,project(p,l)]:[project(p,l),p];
  definition='錨點到直線的垂距（允許延長線）';resolvedMode='point-line';
 }else{
  const adx=ga.to.x-ga.from.x,ady=ga.to.y-ga.from.y,bdx=gb.to.x-gb.from.x,bdy=gb.to.y-gb.from.y;
  if(Math.abs(adx*bdy-ady*bdx)/(Math.hypot(adx,ady)*Math.hypot(bdx,bdy))>1e-8)fail('兩條線不平行，沒有唯一的垂直間距；請選中心距、最近端點距，或指定量測位置');
  const p=center(ga);endpoints=[p,project(p,gb)];definition='平行直線垂距（允許延長線）';resolvedMode='parallel-lines';
 }
 const value=distance(...endpoints);
 if(!Number.isFinite(value))fail('座標超出可計算範圍');
 return {
  kind:'annotation-distance',status:'ANNOTATION_ONLY',mode:resolvedMode,definition,unit:'px',value,
  endpoints:endpoints.map(point),points:endpoints.map(point),
  provenance:{kind:'hand-drawn',scope:'標記幾何距離；未分析影像像素，不是影像實測或合格判定',
   boardId:board.id,boardRevision:board.revision,assetId:asset.id,
   coordinateSpace:asset.source?.coordinateSpace||'asset-pixels',source:asset.source?JSON.parse(JSON.stringify(asset.source)):null,
   annotations:refs.map(r=>({itemId:r.itemId,annotationId:r.annotationId,revision:r.annotation.revision,author:r.annotation.author}))}
 };
}
