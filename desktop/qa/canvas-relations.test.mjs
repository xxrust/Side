import test from 'node:test';
import assert from 'node:assert/strict';
import {annotationKey,selectedAnnotations,measureAnnotationDistance} from '../src/canvas-relations.js';
const line=(id,from,to)=>({id,type:'line',points:[from,to],author:'human',revision:1});
const label=(id,x,y)=>({id,type:'text',points:[{x,y}],text:id,author:'human',revision:1});
const assets=[{id:'raw',source:{coordinateSpace:'original-image-pixels',imageId:'camera'}}];
function fixture(annotations){const board={id:'board',revision:2,items:[{id:'item',assetId:'raw',x:400,y:800,width:10,height:10,annotations}]};return {board,keys:new Set(annotations.map(a=>annotationKey('item',a.id)))}}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('parallel lines measure perpendicular spacing in source pixels, independent of board display transform',()=>{
 const {board,keys}=fixture([line('a',{x:10,y:20},{x:60,y:20}),line('b',{x:100,y:28},{x:80,y:28})]),before=JSON.stringify(board);
 const r=measureAnnotationDistance(board,assets,keys);near(r.value,8);assert.equal(r.mode,'parallel-lines');assert.equal(r.unit,'px');assert.equal(r.status,'ANNOTATION_ONLY');assert.equal(r.provenance.kind,'hand-drawn');assert.deepEqual(r.endpoints,[{x:35,y:20},{x:35,y:28}]);assert.equal(JSON.stringify(board),before);
});
test('rotated parallel lines and reversed direction do not change spacing',()=>{
 const {board,keys}=fixture([line('a',{x:0,y:0},{x:10,y:10}),line('b',{x:20,y:26},{x:10,y:16})]);near(measureAnnotationDistance(board,assets,keys).value,6/Math.sqrt(2));
});
test('nonparallel lines require an explicit definition rather than silently returning zero',()=>{
 const {board,keys}=fixture([line('a',{x:0,y:0},{x:10,y:0}),line('b',{x:0,y:0},{x:0,y:10})]);assert.throws(()=>measureAnnotationDistance(board,assets,keys),/不平行/);
 near(measureAnnotationDistance(board,assets,keys,{mode:'center'}).value,Math.sqrt(50));near(measureAnnotationDistance(board,assets,keys,{mode:'endpoints'}).value,0);
});
test('point-point and point-line use explicitly named annotation anchors',()=>{
 let f=fixture([label('a',1,2),label('b',4,6)]);near(measureAnnotationDistance(f.board,assets,f.keys).value,5);
 f=fixture([label('a',40,7),line('b',{x:0,y:2},{x:10,y:2})]);const r=measureAnnotationDistance(f.board,assets,f.keys);near(r.value,5);assert.equal(r.mode,'point-line');assert.match(r.definition,/延長線/);assert.deepEqual(r.endpoints,[{x:40,y:7},{x:40,y:2}]);
});
test('different assets, stale annotations and unsupported geometry are rejected',()=>{
 const {board,keys}=fixture([label('a',1,2),label('b',4,6)]);board.items.push({id:'other',assetId:'other-raw',annotations:[label('a',1,2)]});
 assert.throws(()=>measureAnnotationDistance(board,assets,new Set([annotationKey('item','a'),annotationKey('other','a')])),/共同座標/);
 assert.throws(()=>selectedAnnotations(board,new Set([annotationKey('item','gone')])),/已移除/);
 board.items[0].annotations[1].type='rect';assert.throws(()=>measureAnnotationDistance(board,assets,keys),/輪廓距離尚未定義/);
});
test('keys remain unambiguous with colons; selection order is stable',()=>{
 const board={items:[{id:'i:x',assetId:'raw',annotations:[label('a:y',0,0)]},{id:'i',assetId:'raw',annotations:[label('x:a:y',1,1)]}]};
 const a=annotationKey('i:x','a:y'),b=annotationKey('i','x:a:y');assert.notEqual(a,b);assert.deepEqual(selectedAnnotations(board,new Set([b,a])).map(r=>r.key),[b,a]);
});
test('incomplete geometry, zero-length line, missing assets and wrong selection count are rejected',()=>{
 let f=fixture([line('a',{x:0,y:0},{x:0,y:0}),label('b',2,2)]);assert.throws(()=>measureAnnotationDistance(f.board,assets,f.keys),/長度為零/);
 f=fixture([label('a',NaN,0),label('b',2,2)]);assert.throws(()=>measureAnnotationDistance(f.board,assets,f.keys),/座標不完整/);
 f=fixture([label('a',0,0),label('b',2,2)]);assert.throws(()=>measureAnnotationDistance(f.board,[],f.keys),/來源圖像不存在/);assert.throws(()=>measureAnnotationDistance(f.board,assets,new Set()),/兩個不同標記/);
});
