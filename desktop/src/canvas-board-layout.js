import ELK from 'elkjs/lib/elk.bundled.js';

const list=value=>Array.isArray(value)?value:[];
const positive=value=>Number.isFinite(value)&&value>0;
const boundsOf=(items,positions,headerHeight,margin)=>{
 if(!items.length)return {x:0,y:0,width:0,height:0};
 const boxes=items.filter(item=>positive(item.width)&&positive(item.height)).map(item=>{const p=positions.get(item.id)||item;return {left:p.x,top:p.y-headerHeight,right:p.x+item.width,bottom:p.y+item.height};}).filter(box=>Object.values(box).every(Number.isFinite));
 if(!boxes.length)return {x:0,y:0,width:0,height:0};
 const x=Math.min(...boxes.map(box=>box.left))-margin,y=Math.min(...boxes.map(box=>box.top))-margin;
 return {x,y,width:Math.max(...boxes.map(box=>box.right))+margin-x,height:Math.max(...boxes.map(box=>box.bottom))+margin-y};
};

// The saved relation graph supplies order only, not rectangle geometry. A
// source with twelve outputs is packed into rows rather than a layered star.
function connectedOrder(items,relations,boardId,diagnostics){
 const byId=new Map(items.map(item=>[item.id,item])),index=new Map(items.map((item,i)=>[item.id,i]));
 const next=new Map(items.map(item=>[item.id,new Set()])),neighbors=new Map(items.map(item=>[item.id,new Set()]));
 for(const relation of list(relations)){
  if(relation.boardId&&boardId&&relation.boardId!==boardId)continue;
  const from=relation.fromItemId,to=relation.toItemId;
  if(typeof from!=='string'||typeof to!=='string')continue;
  if(!byId.has(from)||!byId.has(to)){diagnostics.push({code:'MISSING_RELATION_ENDPOINT',relationId:relation.id,fromItemId:from,toItemId:to});continue;}
  next.get(from).add(to);neighbors.get(from).add(to);neighbors.get(to).add(from);
 }
 const ordered=[],seen=new Set(),stable=values=>values.sort((a,b)=>index.get(a)-index.get(b));
 for(const item of items){
  if(seen.has(item.id))continue;
  const component=[],queue=[item.id];seen.add(item.id);
  for(let i=0;i<queue.length;i++){
   const id=queue[i];component.push(id);
   for(const neighbor of stable([...neighbors.get(id)]))if(!seen.has(neighbor)){seen.add(neighbor);queue.push(neighbor);}
  }
  const indegree=new Map(component.map(id=>[id,0]));
  for(const id of component)for(const target of next.get(id))indegree.set(target,indegree.get(target)+1);
  const ready=stable(component.filter(id=>indegree.get(id)===0)),done=new Set();
  while(ready.length){
   const id=ready.shift();ordered.push(byId.get(id));done.add(id);
   for(const target of next.get(id)){indegree.set(target,indegree.get(target)-1);if(indegree.get(target)===0){ready.push(target);stable(ready);}}
  }
  const cyclic=stable(component.filter(id=>!done.has(id)));
  if(cyclic.length){diagnostics.push({code:'CYCLIC_RELATIONS',itemIds:cyclic});ordered.push(...cyclic.map(id=>byId.get(id)));}
 }
 return ordered;
}

/** Return positions only; source dimensions, image bytes and relationships are
 * never copied or mutated. Image y is below its reserved title/header region.
 * With itemIds, every other item is an unchanged obstacle. */
export async function layoutCanvasBoard(board,relations,{aspectRatio=1.6,itemIds,headerHeight=72,gap=140,margin=32}={}){
 if(!positive(aspectRatio)||![headerHeight,gap,margin].every(value=>Number.isFinite(value)&&value>=0))throw new TypeError('Canvas layout requires a positive aspectRatio and nonnegative headerHeight, gap and margin.');
 const items=list(board?.items),diagnostics=[],ids=new Set();
 for(const item of items){if(typeof item.id!=='string'||!item.id||ids.has(item.id))throw new TypeError('Canvas layout requires unique item.id values.');ids.add(item.id);}
 const requested=itemIds===undefined?null:new Set(itemIds),movable=[],fixed=[];
 if(requested)for(const id of requested)if(!ids.has(id))diagnostics.push({code:'MISSING_REQUESTED_ITEM',itemId:id});
 for(const item of items){
  const valid=positive(item.width)&&positive(item.height)&&Number.isFinite(item.x)&&Number.isFinite(item.y);
  if(!valid)diagnostics.push({code:'INVALID_ITEM_GEOMETRY',itemId:item.id});
  (valid&&item.layout?.pinned!==true&&(!requested||requested.has(item.id))?movable:fixed).push(item);
 }
 const positions=new Map(items.map(item=>[item.id,{id:item.id,x:item.x,y:item.y}]));
 if(movable.length){
  const movableIds=new Set(movable.map(item=>item.id));
  const ordered=connectedOrder(items,relations,board?.id,diagnostics).filter(item=>movableIds.has(item.id));
  const graph={id:'canvas-board-packing',layoutOptions:{
   'elk.algorithm':'rectpacking','elk.aspectRatio':String(aspectRatio),
   'elk.spacing.nodeNode':String(gap),'elk.padding':`[top=${margin},left=${margin},bottom=${margin},right=${margin}]`,
   'elk.rectpacking.orderBySize':'false','elk.rectpacking.whiteSpaceElimination.strategy':'NONE',
  },children:ordered.map((item,index)=>({id:item.id,width:item.width,height:item.height+headerHeight,layoutOptions:{'elk.rectpacking.desiredPosition':String(index)}}))};
  const packed=await new ELK().layout(graph);
  const obstacles=fixed.filter(item=>Number.isFinite(item.x)&&Number.isFinite(item.y)&&positive(item.width)&&positive(item.height));
  // A separate bounded pack beneath the existing group preserves every human
  // position while guaranteeing new cards cannot intersect a fixed obstacle.
  const offsetX=obstacles.length?Math.min(...obstacles.map(item=>item.x))-margin:0;
  const offsetY=obstacles.length?Math.max(...obstacles.map(item=>item.y+item.height))+gap-margin:0;
  for(const child of packed.children){
   const item=items.find(item=>item.id===child.id);
   if(child.width!==item.width||child.height!==item.height+headerHeight)throw new Error('Rectangle packing attempted to resize a canvas item.');
   positions.set(child.id,{id:child.id,x:child.x+offsetX,y:child.y+offsetY+headerHeight});
  }
 }
 const placements=items.map(item=>positions.get(item.id)),movedIds=items.filter(item=>{const p=positions.get(item.id);return p.x!==item.x||p.y!==item.y;}).map(item=>item.id);
 return {placements,bounds:boundsOf(items,positions,headerHeight,margin),movedIds,fixedIds:fixed.map(item=>item.id),diagnostics};
}
