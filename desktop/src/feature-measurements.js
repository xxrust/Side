// Measurement references are typed feature outputs, never drawing annotations.
export const measurementModes={
 'line-midpoint':'線間距：第一條線中點至第二條延長線',
 angle:'兩直線銳夾角',
 'line-circle-center':'圓心至直線垂距',
 'line-circle-gap':'圓邊至直線最短距離',
 'circle-center':'兩圓圓心距',
 'circle-gap':'兩圓圓邊最短距離'
};
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const copy=v=>structuredClone(v),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),plus=(a,u,t)=>({x:a.x+u.x*t,y:a.y+u.y*t});
function line(g){const n=dist(g.from,g.to);if(!(n>1e-9))throw Error('直線長度不足');return {u:{x:(g.to.x-g.from.x)/n,y:(g.to.y-g.from.y)/n},mid:{x:(g.from.x+g.to.x)/2,y:(g.from.y+g.to.y)/2}};}
function project(p,g){const {u}=line(g);return plus(g.from,u,(p.x-g.from.x)*u.x+(p.y-g.from.y)*u.y);}
export function modesFor(a,b){return a==='line'&&b==='line'?['line-midpoint','angle']:a==='circle'&&b==='circle'?['circle-center','circle-gap']:['line','circle'].includes(a)&&['line','circle'].includes(b)&&a!==b?['line-circle-center','line-circle-gap']:[];}
export function measureFeatures(a,b,mode){
 if(!modesFor(a.type,b.type).includes(mode))throw Error('此量測定義不適用於選取特徵');
 let endpoints,value,unit='px';
 if(a.type==='line'&&b.type==='line'){
  const A=line(a),B=line(b);if(mode==='angle'){value=Math.acos(Math.min(1,Math.abs(A.u.x*B.u.x+A.u.y*B.u.y)))*180/Math.PI;unit='deg';endpoints=[A.mid,B.mid];}
  else{endpoints=[A.mid,project(A.mid,b)];value=dist(...endpoints);}
 }else if(a.type!==b.type){
  const l=a.type==='line'?a:b,c=a.type==='circle'?a:b,foot=project(c.center,l),d=dist(c.center,foot);
  if(mode==='line-circle-center'){endpoints=[c.center,foot];value=d;}
  else if(d>c.radius){endpoints=[plus(c.center,{x:(foot.x-c.center.x)/d,y:(foot.y-c.center.y)/d},c.radius),foot];value=d-c.radius;}
  else{const intersection=plus(foot,line(l).u,Math.sqrt(Math.max(0,c.radius*c.radius-d*d)));endpoints=[intersection,intersection];value=0;}
 }else{
  const d=dist(a.center,b.center),u=d>1e-9?{x:(b.center.x-a.center.x)/d,y:(b.center.y-a.center.y)/d}:{x:1,y:0};
  if(mode==='circle-center'){endpoints=[a.center,b.center];value=d;}
  else if(d>a.radius+b.radius){endpoints=[plus(a.center,u,a.radius),plus(b.center,u,-b.radius)];value=d-a.radius-b.radius;}
  else if(a.radius>d+b.radius){endpoints=[plus(a.center,u,a.radius),plus(b.center,u,b.radius)];value=a.radius-d-b.radius;}
  else if(b.radius>d+a.radius){endpoints=[plus(a.center,u,-a.radius),plus(b.center,u,-b.radius)];value=b.radius-d-a.radius;}
  else{const x=d>1e-9?(d*d+a.radius*a.radius-b.radius*b.radius)/(2*d):a.radius,y=Math.sqrt(Math.max(0,a.radius*a.radius-x*x)),point=plus(plus(a.center,u,x),{x:-u.y,y:u.x},y);endpoints=[point,point];value=0;}
 }
 if(!Number.isFinite(value))throw Error('量測結果非有限數值');
 return {value,unit,endpoints,definition:measurementModes[mode],scope:unit==='px'?'引用圖像像素；未轉換物理單位':'無方向直線的銳夾角；0–90°'};
}
export function validateFeatureMeasurements(board){
 if(board.measurements===undefined)return;
 if(!Array.isArray(board.measurements)||board.measurements.length>128)throw Error('每畫板最多 128 個特徵量測');
 const ids=new Set();for(const m of board.measurements){if(!m||m.schema!=='agentcv-feature-measurement-1'||typeof m.id!=='string'||!m.id||ids.has(m.id)||typeof m.itemId!=='string'||!m.itemId||!Array.isArray(m.toolIds)||m.toolIds.length!==2||m.toolIds.some(x=>typeof x!=='string'||!x)||m.toolIds[0]===m.toolIds[1]||!Object.hasOwn(measurementModes,m.mode)||Object.keys(m).some(k=>!['schema','id','itemId','toolIds','mode','at'].includes(k)))throw Error('特徵量測必須引用兩個不同實算工具，不能引用標註或保存自填數值');ids.add(m.id);}
}
export function resolveFeatureMeasurement(board,m){
 try{
  validateFeatureMeasurements({measurements:[m]});const item=board.items.find(i=>i.id===m.itemId);if(!item)throw Error('來源圖已移除');
  const features=m.toolIds.map(id=>{const t=item.geometryTools?.find(t=>t.id===id);if(!t)throw Error('來源工具已移除');if(!t.result)throw Error('來源工具待重算');if(canonical(t.result.inputBinding)!==canonical(t.inputBinding))throw Error('來源結果已過期');const c=t.result.candidates.find(c=>c.id===t.selectedCandidateId);if(!c||!c.accepted||c.status!=='ACCEPTED'||!c.gates?.length||c.gates.some(g=>g.status!=='PASS'))throw Error('請先確認兩個工具的合格候選');return {tool:t,candidate:c};});
  return {id:m.id,itemId:m.itemId,status:'READY',...measureFeatures(...features.map(f=>f.candidate.geometry),m.mode),provenance:{kind:'image-feature-measurement',assetId:item.assetId,features:features.map(({tool:t,candidate:c})=>({toolId:t.id,revision:t.revision,candidateId:c.id,inputBinding:copy(t.inputBinding),rmsPx:c.quality?.rmsPx}))}};
 }catch(e){return {id:m.id,itemId:m.itemId,status:'UNAVAILABLE',value:null,reason:e.message};}
}
export const featureMeasurementMethods={
 addFeatureMeasurement(boardId,input){
  const board=this.ensureInquiry().boards.find(b=>b.id===boardId);if(!board)throw Error('畫板不存在');
  if(!input||Object.keys(input).some(k=>!['itemId','toolIds','mode'].includes(k)))throw Error('量測只接受實算工具引用與定義');
  const m={schema:'agentcv-feature-measurement-1',id:crypto.randomUUID(),...copy(input),at:new Date().toISOString()};validateFeatureMeasurements({measurements:[...(board.measurements||[]),m]});
  const result=resolveFeatureMeasurement(board,m);if(result.status!=='READY')throw Error(result.reason);
  this.mutate('feature_measurement_added',()=>{(board.measurements??=[]).push(m);board.revision++;});return copy(m);
 },
 removeFeatureMeasurement(boardId,id){const board=this.ensureInquiry().boards.find(b=>b.id===boardId);if(!board?.measurements?.some(m=>m.id===id))throw Error('量測不存在');this.mutate('feature_measurement_removed',()=>{board.measurements=board.measurements.filter(m=>m.id!==id);board.revision++;});},
 featureMeasurementContext(boardId){const board=this.ensureInquiry().boards.find(b=>b.id===boardId);if(!board)throw Error('畫板不存在');return (board.measurements||[]).map(m=>({...copy(m),result:resolveFeatureMeasurement(board,m)}));}
};
