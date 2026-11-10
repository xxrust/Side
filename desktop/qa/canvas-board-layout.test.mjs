import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {layoutCanvasBoard} from '../src/canvas-board-layout.js';

const fixture=JSON.parse(await fs.readFile(new URL('../../reviews/2026-10-27-program-flow/actual-pi-workspace-portable.agentcv.json',import.meta.url),'utf8'));
const board=fixture.visualInquiry.boards.find(board=>board.items.length===13),relations=fixture.canvasRelations.filter(relation=>relation.boardId===board.id);
const placed=(board,result)=>board.items.map(item=>({...item,...result.placements.find(p=>p.id===item.id)}));
function assertSeparated(items,header=72){
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
  const a=items[i],b=items[j];
  assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y-header||b.y+b.height<=a.y-header,`image+header overlap ${a.id} / ${b.id}`);
 }
}
function fit(items,{width=710,height=600}={}){
 const left=Math.min(...items.map(item=>item.x)),top=Math.min(...items.map(item=>item.y));
 const right=Math.max(...items.map(item=>item.x+item.width)),bottom=Math.max(...items.map(item=>item.y+item.height));
 return Math.min((width-60)/(right-left),(height-75)/(bottom-top));
}

test('actual saved Pi board packs all thirteen original image cards without changing pixels, dimensions, IDs or relationships',async()=>{
 assert.equal(board.items.length,13);assert.equal(relations.length,13);
 assert.equal(new Set(relations.map(relation=>relation.toItemId)).size,12,'saved board includes two distinct relations to one output; preserve both records');
 const before=JSON.stringify({board,relations}),result=await layoutCanvasBoard(board,relations),items=placed(board,result);
 assertSeparated(items);assert.equal(JSON.stringify({board,relations}),before);
 assert.equal(result.placements.length,13);assert.equal(new Set(result.placements.map(item=>item.id)).size,13);
 assert.deepEqual(result.fixedIds,[]);assert.deepEqual(result.diagnostics,[]);
 assert.ok(new Set(items.map(item=>item.y)).size>1,'star outputs must wrap into rows');
 const originalFit=fit(board.items),packedFit=fit(items);
 assert.ok(originalFit>.07&&originalFit<.09,`original fit ${originalFit}`);
 assert.ok(packedFit>originalFit*2,`packing improves ${originalFit} to ${packedFit}`);
 assert.ok(result.bounds.width/result.bounds.height<3,'the star must not remain an unbounded horizontal strip');
 assert.deepEqual(await layoutCanvasBoard(board,relations),result,'saved relation order produces deterministic positions');
 for(const placement of result.placements)assert.deepEqual(Object.keys(placement).sort(),['id','x','y']);
});

test('new-only layout preserves every existing card and pinned card exactly, and packs new cards below fixed obstacles',async()=>{
 const input=structuredClone(board),newIds=input.items.slice(-4).map(item=>item.id);
 input.items.at(-1).layout={pinned:true};
 input.items[0].x=-200;input.items[0].y=-120;
 const before=JSON.stringify(input),result=await layoutCanvasBoard(input,relations,{itemIds:newIds}),items=placed(input,result);
 const movable=new Set(newIds.slice(0,-1));
 for(const item of input.items)if(!movable.has(item.id))assert.deepEqual(result.placements.find(p=>p.id===item.id),{id:item.id,x:item.x,y:item.y});
 assert.deepEqual(result.fixedIds,input.items.filter(item=>!movable.has(item.id)).map(item=>item.id));
 assert.ok(result.movedIds.every(id=>movable.has(id)));assert.equal(result.movedIds.length,3);
 const fixedBottom=Math.max(...input.items.filter(item=>!movable.has(item.id)).map(item=>item.y+item.height));
 for(const item of items.filter(item=>movable.has(item.id)))assert.ok(item.y-72>=fixedBottom+140);
 // Fixed cards can already have their own overlaps; the new pack must not add any.
 for(const item of items.filter(item=>movable.has(item.id)))assertSeparated([item,...items.filter(other=>other.id!==item.id&&movable.has(other.id))]);
 assert.equal(JSON.stringify(input),before);
});

test('organize-all moves only unpinned cards while keeping repeated asset/name items distinct',async()=>{
 const input={id:'board',items:[
  {id:'source',assetId:'same',name:'same',x:900,y:600,width:800,height:180,layout:{pinned:true}},
  {id:'portrait',assetId:'same',name:'same',x:0,y:0,width:180,height:800},
  {id:'landscape',assetId:'same',name:'same',x:0,y:0,width:1200,height:220},
  {id:'square',assetId:'same',name:'same',x:0,y:0,width:450,height:450},
 ]};
 const result=await layoutCanvasBoard(input,[{fromItemId:'source',toItemId:'portrait'},{fromItemId:'portrait',toItemId:'landscape'}]);
 assertSeparated(placed(input,result));assert.equal(result.placements.length,4);
 assert.deepEqual(result.placements.find(item=>item.id==='source'),{id:'source',x:900,y:600});
 assert.deepEqual(result.fixedIds,['source']);
 const reordered=placed(input,result);for(const item of reordered){const original=input.items.find(candidate=>candidate.id===item.id);assert.equal(item.width,original.width);assert.equal(item.height,original.height);}
});

test('real directed relationships determine stable packing order, rather than titles, filenames or repeated assets',async()=>{
 const input={id:'ordering',items:[{id:'output',name:'aaa',x:0,y:0,width:400,height:300},{id:'source',name:'zzz',x:0,y:0,width:400,height:300}]};
 const result=await layoutCanvasBoard(input,[{boardId:'ordering',fromItemId:'source',toItemId:'output'}]);
 const source=result.placements.find(item=>item.id==='source'),output=result.placements.find(item=>item.id==='output');
 assert.ok(source.y<output.y||source.y===output.y&&source.x<output.x);
 const bad=await layoutCanvasBoard(input,[{id:'missing',fromItemId:'absent',toItemId:'output'},{id:'external',boardId:'another-board',fromItemId:'also-absent',toItemId:'source'},{fromItemId:'source',toItemId:'output'},{fromItemId:'output',toItemId:'source'}]);
 assert.equal(bad.diagnostics.filter(item=>item.code==='MISSING_RELATION_ENDPOINT').length,1);
 assert.ok(bad.diagnostics.some(item=>item.code==='CYCLIC_RELATIONS'));assertSeparated(placed(input,bad));
});

test('zero items, explicit empty selection and all pinned boards are position no-ops',async()=>{
 assert.deepEqual(await layoutCanvasBoard({items:[]},[]),{placements:[],bounds:{x:0,y:0,width:0,height:0},movedIds:[],fixedIds:[],diagnostics:[]});
 for(const [input,options]of [[board,{itemIds:[]}],[{...board,items:board.items.map(item=>({...item,layout:{pinned:true}}))},{}]]){
  const result=await layoutCanvasBoard(input,relations,options);assert.deepEqual(result.movedIds,[]);
  assert.deepEqual(result.placements,input.items.map(({id,x,y})=>({id,x,y})));assert.equal(result.fixedIds.length,13);
 }
});

test('custom title clearance and padding are included in bounds without resizing cards',async()=>{
 const input={items:[{id:'a',x:0,y:0,width:123,height:789},{id:'b',x:0,y:0,width:800,height:99}]};
 const result=await layoutCanvasBoard(input,[],{headerHeight:96,margin:48,gap:80,aspectRatio:1.2});
 assertSeparated(placed(input,result),96);
 for(const item of placed(input,result)){
  assert.ok(item.x>=result.bounds.x+48);assert.ok(item.y-96>=result.bounds.y+48);
  assert.ok(item.x+item.width<=result.bounds.x+result.bounds.width-48);assert.ok(item.y+item.height<=result.bounds.y+result.bounds.height-48);
 }
});
