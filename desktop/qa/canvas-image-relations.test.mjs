import test from 'node:test';
import assert from 'node:assert/strict';
import {imageRelation,imageRelationLayout,imageRelationHit} from '../src/canvas-image-relations.js';
const board={id:'b',items:[{id:'a',x:0,y:0,width:100,height:80},{id:'b',x:300,y:0,width:100,height:80}]};
test('semantic links follow both image bounds without inventing measurement values',()=>{
 const r=imageRelation(board,{id:'r',fromItemId:'a',toItemId:'b',label:'原圖 → 擬合結果'}),g=imageRelationLayout(board,r);assert.deepEqual(g.from,{x:100,y:40});assert.deepEqual(g.to,{x:300,y:40});assert.equal(r.result,undefined);assert.equal(imageRelationHit(board,[r],{x:200,y:42}),r);
 const moved=structuredClone(board);moved.items[1].y=100;assert.notDeepEqual(imageRelationLayout(moved,r),g);assert.equal(imageRelationLayout({...board,items:board.items.slice(1)},r),null);
});
test('links reject stale endpoints, self-links, invalid authors and oversized captions',()=>{for(const change of [{fromItemId:'missing'},{toItemId:'a'},{author:'unknown'},{label:'x'.repeat(4001)}])assert.throws(()=>imageRelation(board,{id:'r',fromItemId:'a',toItemId:'b',...change}));});
