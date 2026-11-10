import test from 'node:test';
import assert from 'node:assert/strict';
import {Project} from '../src/model.js';
import {inquiryMethods,prepareInquiry} from '../src/visual-inquiry-model.js';
import {captureBoardIntent} from '../src/agent-change-impact.js';
class InquiryProject extends Project {}
Object.assign(InquiryProject.prototype,inquiryMethods);
const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHZkAAAAASUVORK5CYII=';
function setup(){const p=new InquiryProject(),reference={label:'Source camera',kind:'original',width:200,height:100,dataURL:picture,source:{runId:'retained',coordinateSpace:'original-image-pixels'}};const first=p.addInquiryImage({...reference,id:'source'}),second=p.addInquiryImage({...reference,id:'result'},{actor:'agent'});p.addInquiryAnnotation(first.board.id,first.item.id,{type:'line',points:[{x:10,y:10},{x:100,y:80}],text:'Human intent'});p.addInquiryGeometryTool(first.board.id,first.item.id,{kind:'line',roi:{x:0,y:0,width:150,height:90},parameters:{threshold:20}});p.data.canvasRelations=[{id:'relation',boardId:first.board.id,fromItemId:first.item.id,toItemId:second.item.id,label:'Derived view'}];p.data.canvasThreads=[{id:'thread',boardId:first.board.id,x:20,y:60,snapshot:p.captureInquirySnapshot(first.board.id)}];return {p,boardId:first.board.id,firstId:first.item.id,secondId:second.item.id};}
const board=h=>h.p.ensureInquiry().boards.find(b=>b.id===h.boardId);
const checkpoint=p=>({data:structuredClone(p.data),undo:p.undoStack.length,redo:p.redoStack.length,dirty:p.dirty});
function unchanged(p,before){assert.deepEqual(p.data,before.data);assert.equal(p.undoStack.length,before.undo);assert.equal(p.redoStack.length,before.redo);assert.equal(p.dirty,before.dirty);}

test('batch layout moves only x/y in one commit and one undo while preserving intent and snapshots',()=>{
 const h=setup(),{p,boardId,firstId,secondId}=h,before=checkpoint(p),prior=structuredClone(board(h)),snapshot=p.captureInquirySnapshot(boardId),intent=captureBoardIntent(p,{boardId});
 const result=p.applyInquiryLayout(boardId,[{id:firstId,x:120,y:70},{itemId:secondId,x:840,y:90}],{expectedRevision:prior.revision});
 assert.equal(p.undoStack.length,before.undo+1);assert.equal(p.data.events.length,before.data.events.length+1);assert.equal(result.revision,prior.revision+1);assert.equal(board(h).items[0].x,120);assert.equal(board(h).items[1].y,90);
 for(const [index,item]of board(h).items.entries()){const original=prior.items[index];for(const key of ['assetId','width','height','annotations','geometryTools','author','createdAt'])assert.deepEqual(item[key],original[key]);assert.equal(item.revision,original.revision+1);assert.equal(item.layout,undefined);}
 assert.deepEqual(p.data.canvasRelations,before.data.canvasRelations);assert.deepEqual(p.data.canvasThreads,before.data.canvasThreads);assert.deepEqual(p.data.visualInquiry.assets,before.data.visualInquiry.assets);assert.deepEqual(captureBoardIntent(p,{boardId}),intent);assert.equal(snapshot.items[0].x,prior.items[0].x);
 result.items[0].x=-999;assert.equal(board(h).items[0].x,120,'returned values cannot mutate live state');p.undo();assert.deepEqual(p.data,before.data);p.redo();assert.equal(board(h).items[0].x,120);
});
test('stale, duplicate, missing, nonfinite and extra-field placements reject the entire batch atomically',()=>{
 const h=setup(),{p,boardId,firstId}=h,before=checkpoint(p),revision=board(h).revision;
 for(const placements of [[{id:firstId,x:10,y:10},{id:'missing',x:20,y:20}],[{id:firstId,x:10,y:10},{id:firstId,x:20,y:20}],[{id:firstId,x:NaN,y:20}],[{id:firstId,x:20,y:Infinity}],[{id:firstId,x:20,y:20,width:30}],[{id:firstId,x:20}],[{id:firstId,itemId:'wrong',x:20,y:20}]]){assert.throws(()=>p.applyInquiryLayout(boardId,placements));unchanged(p,before);}
 assert.throws(()=>p.applyInquiryLayout(boardId,[{id:firstId,x:40,y:40}],{expectedRevision:revision-1}),/已變更/);unchanged(p,before);
 p.applyInquiryLayout(boardId,[]);unchanged(p,before);p.applyInquiryLayout(boardId,board(h).items.map(({id,x,y})=>({id,x,y})));unchanged(p,before);
});
test('pinned items never move in batch, agent only moves its own unpinned items, and human can release pins',()=>{
 const h=setup(),{p,boardId,firstId,secondId}=h;
 p.setInquiryItemPinned(boardId,firstId,true);const intent=captureBoardIntent(p,{boardId}),before=checkpoint(p),first=structuredClone(board(h).items[0]);
 assert.throws(()=>p.applyInquiryLayout(boardId,[{id:secondId,x:800,y:80},{id:firstId,x:10,y:10}]),/固定/);unchanged(p,before);
 assert.throws(()=>p.applyInquiryLayout(boardId,[{id:firstId,x:10,y:10}],{actor:'agent'}),/固定/);unchanged(p,before);
 const result=p.applyInquiryLayout(boardId,[{id:firstId,x:first.x,y:first.y},{id:secondId,x:800,y:80}],{actor:'agent'});assert.equal(result.items[1].x,800);assert.deepEqual(board(h).items[0],first);
 p.setInquiryItemPinned(boardId,firstId,false);const unpinned=checkpoint(p);assert.throws(()=>p.applyInquiryLayout(boardId,[{id:firstId,x:20,y:20}],{actor:'agent'}),/不可修改/);unchanged(p,unpinned);
 p.setInquiryItemPinned(boardId,secondId,true);const pinned=checkpoint(p);assert.throws(()=>p.updateInquiryItem(boardId,secondId,{x:100},{actor:'agent'}),/固定/);assert.throws(()=>p.setInquiryItemPinned(boardId,secondId,false,{actor:'agent'}),/工程師/);unchanged(p,pinned);assert.deepEqual(captureBoardIntent(p,{boardId}),intent);
});
test('human actual moves or resizes pin the item while no-op edits and other fields leave pin state alone',()=>{
 const h=setup(),{p,boardId,firstId,secondId}=h;const first=board(h).items[0];p.updateInquiryItem(boardId,firstId,{x:first.x,y:first.y});assert.equal(board(h).items[0].layout,undefined);
 const intent=captureBoardIntent(p,{boardId});p.updateInquiryItem(boardId,firstId,{x:20});assert.equal(board(h).items[0].layout.pinned,true);p.setInquiryItemPinned(boardId,firstId,false);p.updateInquiryItem(boardId,firstId,{width:300});assert.equal(board(h).items[0].height,150);assert.equal(board(h).items[0].layout.pinned,true);
 p.updateInquiryItem(boardId,secondId,{x:900},{actor:'agent'});assert.equal(board(h).items[1].layout,undefined);assert.deepEqual(captureBoardIntent(p,{boardId}),intent);
 const before=checkpoint(p);assert.throws(()=>p.updateInquiryItem(boardId,firstId,{layout:{pinned:false}}),/只能/);unchanged(p,before);
});
test('optional layout metadata preserves legacy documents and validates pinned values before loading',()=>{
 const h=setup(),saved=structuredClone(h.p.data);prepareInquiry(saved);assert.equal(saved.visualInquiry.boards[0].items[0].layout,undefined);
 const pinned=structuredClone(saved);pinned.visualInquiry.boards[0].items[0].layout={pinned:true};prepareInquiry(pinned);assert.equal(pinned.visualInquiry.boards[0].items[0].layout.pinned,true);
 for(const layout of [null,[],{pinned:'yes'},{pinned:true,author:'agent'},{}]){const bad=structuredClone(saved);bad.visualInquiry.boards[0].items[0].layout=layout;assert.throws(()=>prepareInquiry(bad));}
});
