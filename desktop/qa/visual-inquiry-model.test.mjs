import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Project} from '../src/model.js';
import {inquiryMethods,prepareInquiry,createInquiryState} from '../src/visual-inquiry-model.js';
class InquiryProject extends Project {}
Object.assign(InquiryProject.prototype,inquiryMethods);
const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHZkAAAAASUVORK5CYII=';
const ref=(suffix='one')=>({id:'asset-'+suffix,label:'第n步 '+suffix,kind:'stage',dataURL:picture,width:582,height:998,source:{imageId:'camera-1',inputSha256:'unchanged-pixels',pipelineId:'plan',pipelineRevision:3,runId:'run-'+suffix,nodeId:'stage',parameters:{threshold:64},currentAtCapture:true}});
const line=(patch={})=>({type:'line',points:[{x:12,y:24},{x:410,y:800}],text:'工程師要比較這一段',color:'#ffcc66',strokeWidth:2,...patch});
const dump=p=>JSON.stringify({data:p.data,undo:p.undoStack,redo:p.redoStack,dirty:p.dirty});

test('several immutable image sources compose on one board while image and annotation coordinates stay independent',()=>{
 const p=new InquiryProject();p.data.workflow={revision:9,pipelinePlan:{id:'plan',revision:3},pipelineValidation:{status:'CURRENT'}};p.data.images=[{id:'camera-1',pipelineResult:{runId:'latest',status:'MEASURED'},revision:1}];
 const baseline=structuredClone(p.data.workflow),result=structuredClone(p.data.images),input=ref();const one=p.addInquiryImage(input),two=p.addInquiryImage(ref('two'),{position:{x:800,y:300,width:291,height:499}});
 assert.equal(one.board.id,two.board.id);assert.equal(p.ensureInquiry().boards.length,1);assert.equal(p.ensureInquiry().boards[0].items.length,2);assert.equal(one.item.height,560*998/582);input.source.parameters.threshold=999;input.label='changed caller';assert.equal(p.ensureInquiry().assets[0].source.parameters.threshold,64);
 const mark=p.addInquiryAnnotation(one.board.id,one.item.id,line());p.updateInquiryItem(one.board.id,one.item.id,{x:550,y:90,width:291,height:499});const stored=p.ensureInquiry().boards[0].items[0];assert.deepEqual(stored.annotations[0].points,mark.points);assert.deepEqual(p.data.workflow,baseline);assert.deepEqual(p.data.images,result);
 const asset=p.ensureInquiry().assets[0];assert.throws(()=>{asset.source.parameters.threshold=3},TypeError);assert.throws(()=>{asset.dataURL='other'},TypeError);
 const context=p.inquiryContext();assert.equal(context.board.items[0].asset.source.runId,'run-one');assert.equal(context.board.items[0].asset.height,998);assert.ok(!JSON.stringify(context).includes('base64'));assert.equal(context.assets.length,2);
});

test('snapshots survive later edits and save/load as historical references with no current-run substitution',async()=>{
 const p=new InquiryProject(),{board,item}=p.addInquiryImage(ref()),a=p.addInquiryAnnotation(board.id,item.id,line()),snapshot=p.captureInquirySnapshot(board.id);p.updateInquiryAnnotation(board.id,item.id,a.id,{text:'later change',points:[{x:20,y:40},{x:400,y:700}]});assert.equal(snapshot.items[0].annotations[0].text,'工程師要比較這一段');assert.equal(snapshot.items[0].asset.source.runId,'run-one');assert.ok(Object.isFrozen(snapshot.items[0].asset.source));assert.ok(!JSON.stringify(snapshot).includes('base64'));
 const saved=JSON.parse(p.serialize());prepareInquiry(saved);const loaded=new InquiryProject();await loaded.load(saved,async()=>{throw Error('No camera rasters in this fixture')});const restored=loaded.captureInquirySnapshot(board.id);assert.equal(restored.items[0].asset.source.runId,'run-one');assert.equal(restored.items[0].annotations[0].text,'later change');assert.equal(restored.items[0].asset.historicalSnapshot,true);assert.equal(loaded.ensureInquiry().assets[0].dataURL,picture);
 const bad=structuredClone(saved);bad.visualInquiry.boards[0].items[0].assetId='no-such-asset';assert.throws(()=>prepareInquiry(bad),/不存在/);assert.equal(loaded.ensureInquiry().boards[0].items[0].assetId,'asset-one');const legacy={images:[]};prepareInquiry(legacy);assert.deepEqual(legacy.visualInquiry,createInquiryState());
});

test('invalid input rejects atomically, and ordinary undo/redo restores a single inquiry mutation without CV changes',()=>{
 const p=new InquiryProject(),beforeEmpty=dump(p);assert.throws(()=>p.addInquiryImage({...ref(),dataURL:'https://bad/image.png'}),/本地/);assert.equal(dump(p),beforeEmpty);
 const {board,item}=p.addInquiryImage(ref());const before=dump(p);for(const annotation of [line({points:[{x:NaN,y:1},{x:2,y:3}]}),line({points:[{x:-1,y:0},{x:2,y:3}]}),line({points:[{x:1,y:0},{x:583,y:3}]}),line({type:'text',points:[{x:1,y:1}],text:''}),line({color:'url(javascript:alert(1))'}),line({strokeWidth:Infinity})]){assert.throws(()=>p.addInquiryAnnotation(board.id,item.id,annotation));assert.equal(dump(p),before)}
 assert.throws(()=>p.updateInquiryItem(board.id,item.id,{assetId:'another'}),/只能/);assert.equal(dump(p),before);assert.throws(()=>p.addInquiryImage({...ref(),source:{bad:NaN}}),/非有限/);assert.equal(dump(p),before);assert.throws(()=>p.addInquiryImage({...ref(),source:{...ref().source,runId:'rebound'}}),/不能換/);assert.equal(dump(p),before);
 p.addInquiryAnnotation(board.id,item.id,line({type:'mask',points:[{x:1,y:1},{x:200,y:1},{x:200,y:300}]}));assert.equal(p.ensureInquiry().boards[0].items[0].annotations.length,1);p.undo();assert.equal(p.ensureInquiry().boards[0].items[0].annotations.length,0);p.redo();assert.equal(p.ensureInquiry().boards[0].items[0].annotations.length,1);assert.equal(p.ensureInquiry().assets[0].source.parameters.threshold,64);
});

test('co-creation preserves engineer ownership while letting Agent add independent evidence and marks',()=>{
 const p=new InquiryProject(),{board,item}=p.addInquiryImage(ref()),human=p.addInquiryAnnotation(board.id,item.id,line()),agent=p.addInquiryAnnotation(board.id,item.id,line({text:'Agent 提議',color:'#66bbff'}),{actor:'agent'});
 assert.equal(agent.author,'agent');assert.throws(()=>p.updateInquiryAnnotation(board.id,item.id,human.id,{text:'overwrite'},{actor:'agent'}),/不可/);assert.throws(()=>p.removeInquiryAnnotation(board.id,item.id,human.id,{actor:'agent'}),/不可/);assert.throws(()=>p.updateInquiryItem(board.id,item.id,{x:90},{actor:'agent'}),/不可/);assert.throws(()=>p.removeInquiryItem(board.id,item.id,{actor:'agent'}),/不可/);
 p.updateInquiryAnnotation(board.id,item.id,agent.id,{text:'修正自己的建議'},{actor:'agent'});p.removeInquiryAnnotation(board.id,item.id,agent.id,{actor:'agent'});assert.equal(p.ensureInquiry().boards[0].items[0].annotations.length,1);
 const own=p.addInquiryImage(ref('agent-image'),{actor:'agent'});p.addInquiryAnnotation(board.id,own.item.id,line());assert.throws(()=>p.removeInquiryItem(board.id,own.item.id,{actor:'agent'}),/工程師/);assert.equal(p.ensureInquiry().boards[0].items.length,2);
 const second=p.createInquiryBoard({title:'比較另一個場景'});p.selectInquiryBoard(board.id);assert.equal(p.ensureInquiry().activeBoardId,board.id);assert.equal(p.inquiryContext({boardId:second.id}).board.items.length,0);
});


test('registering a readable image does not fill a board, repeated registration is stable, and resizing preserves pixels/aspect',()=>{
 const p=new InquiryProject(),asset=p.registerInquiryAsset(ref());assert.equal(asset.id,'asset-one');assert.equal(p.ensureInquiry().boards.length,0);const before=dump(p);p.registerInquiryAsset(ref());assert.equal(dump(p),before);const {board,item}=p.addInquiryImage(ref());assert.equal(p.ensureInquiry().assets.length,1);p.updateInquiryItem(board.id,item.id,{width:291});let stored=p.ensureInquiry().boards[0].items[0];assert.equal(stored.height,499);const prior=dump(p);assert.throws(()=>p.updateInquiryItem(board.id,item.id,{width:100,height:100}),/長寬比/);assert.equal(dump(p),prior);p.updateInquiryItem(board.id,item.id,{height:998});stored=p.ensureInquiry().boards[0].items[0];assert.equal(stored.width,582);const two=p.addInquiryImage(ref('two')),three=p.addInquiryImage(ref('three'));assert.ok(two.item.x>=stored.x+stored.width);assert.ok(three.item.y>=Math.max(stored.y+stored.height,two.item.y+two.item.height));assert.equal(p.ensureInquiry().assets[0].dataURL,picture);
});

test('continuing an immutable historical snapshot copies its captured annotations and layout atomically to one new board',()=>{
 const p=new InquiryProject(),{board,item,asset}=p.addInquiryImage(ref(),{position:{x:24,y:80,width:291}});
 const human=p.addInquiryAnnotation(board.id,item.id,{type:'line',points:[{x:0,y:10},{x:582,y:20}],text:'at question time'});
 p.addInquiryAnnotation(board.id,item.id,{type:'text',points:[{x:50,y:50}],text:'agent historical mark'},{actor:'agent'});
 const snapshot=p.captureInquirySnapshot(board.id);p.updateInquiryAnnotation(board.id,item.id,human.id,{text:'edited later'});
 const before=structuredClone(p.data),undoBefore=p.undoStack.length,copy=p.cloneInquirySnapshot(snapshot,{title:'continue question'});assert.equal(p.undoStack.length,undoBefore+1);assert.notEqual(copy.id,board.id);assert.equal(copy.title,'continue question');assert.equal(copy.author,'human');assert.equal(copy.revision,1);assert.equal(copy.items.length,1);assert.equal(copy.items[0].assetId,asset.id);assert.notEqual(copy.items[0].id,item.id);assert.equal(copy.items[0].x,24);assert.equal(copy.items[0].y,80);assert.equal(copy.items[0].width,291);assert.equal(copy.items[0].height,499);assert.equal(copy.items[0].annotations[0].text,'at question time');assert.notEqual(copy.items[0].annotations[0].id,human.id);assert.equal(copy.items[0].annotations[1].author,'agent');assert.equal(p.ensureInquiry().assets.length,1);assert.equal(snapshot.items[0].annotations[0].text,'at question time');
 p.undo();assert.deepEqual(p.data,before);p.redo();assert.equal(p.ensureInquiry().activeBoardId,copy.id);
 for(const modify of [s=>s.items[0].asset.source.runId='substituted',s=>s.items[0].assetId='missing',s=>s.items[0].width=100,s=>s.items[0].annotations[0].points[0].x=-1]){const invalid=structuredClone(snapshot);modify(invalid);const stable=structuredClone(p.data),undoCount=p.undoStack.length;assert.throws(()=>p.cloneInquirySnapshot(invalid));assert.deepEqual(p.data,stable);assert.equal(p.undoStack.length,undoCount)}
});
