import {placeCurrentSourceOriginal,confirmVisibleProjectSwitch} from './canvas-original-fixture.mjs';
// Actual app bundle and pointer handlers; no model calls or native-GUI claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createHarness}=require('./workflow-ui-harness.cjs');
const {createCanvas}=require('../../qa/node_modules/@napi-rs/canvas');

async function waitFor(h,predicate){for(let i=0;i<80;i++){if(predicate())return;await h.tick()}throw Error('Timed out waiting for canvas state: '+h.$('inlineStatus')?.textContent)}
async function setup(){
 const h=await createHarness(),c=createCanvas(320,240),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,320,240);ctx.fillStyle='#222';ctx.fillRect(40,35,230,170);
 await h.api.addImages([{name:'unrestricted-part.png',dataUrl:c.toDataURL('image/png')}]);
 await h.api.go(6);
 const view=h.api.inquiryView;await placeCurrentSourceOriginal(h);await waitFor(h,()=>view.opened&&view.board()?.items.length===1&&!view.workflowPending);
 return h;
}
function pointer(h,type,x,y,options={}){
 const view=h.api.inquiryView,item=view.board().items[0],asset=view.asset(item),world={x:item.x+x*item.width/asset.width,y:item.y+y*item.height/asset.height};
 const r=view.canvas.getBoundingClientRect(),event=new h.w.MouseEvent(type,{clientX:r.left+world.x*view.zoom+view.pan.x,clientY:r.top+world.y*view.zoom+view.pan.y,button:0,bubbles:true,cancelable:true,...options});
 Object.defineProperty(event,'pointerId',{value:3});view.canvas.dispatchEvent(event);
}
async function lines(h){
 const view=h.api.inquiryView;
 for(const y of [60,90]){
  view.panel.querySelector('[data-inquiry-tool="line"]').click();
  pointer(h,'pointerdown',50,y);pointer(h,'pointermove',230,y);pointer(h,'pointerup',230,y);await h.tick();
 }
 assert.equal(view.board().items[0].annotations.length,2);
 view.panel.querySelector('[data-inquiry-tool="select"]').click();
 pointer(h,'pointerdown',100,60);pointer(h,'pointerup',100,60);await h.tick();
 pointer(h,'pointerdown',100,90,{shiftKey:true});pointer(h,'pointerup',100,90,{shiftKey:true});await h.tick();
 assert.equal(view.annotationSelections.size,2);return view;
}
test('freeform goal enters the real image canvas without fixed feature choices or recipe gates',async()=>{
 const h=await setup();try{
  const {view}= {view:h.api.inquiryView};assert.equal(h.api.page,6);assert.ok(view.embedded&&view.panel.isConnected);
  assert.equal(h.w.document.querySelectorAll('[data-pipeline-target]').length,0);
  assert.equal(h.api.project.workflow.pipelinePlan,null);assert.equal(h.api.project.workflow.checks.length,0);
  assert.equal(h.api.project.ensureInquiry().assets[0].source.imageId,h.api.project.image.id);
  assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
test('drawn marks remain discussion annotations and cannot create real measurements',async()=>{
 const h=await setup();try{
  const view=await lines(h),distance=view.panel.querySelector('[data-intent-action="distance"]');assert.equal(distance,null);assert.equal(view.board().measurements?.length||0,0);
  view.panel.querySelector('[data-intent-action="ask"]').click();await h.tick();
  const thread=view.currentLocalThread();assert.ok(view.panel.querySelector('[aria-label="畫板原位問答"]'));assert.equal(thread.selection.length,2);assert.equal(thread.snapshot.selection.annotationKeys.length,2);assert.equal(thread.snapshot.relations.length,0);
  assert.equal(h.$('chatInput').value,'');assert.equal(h.api.project.data.chat.length,0);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
test('disconnected Pi preserves the question and selection and produces no fake answer',async()=>{
 const h=await setup();try{
  const view=await lines(h);await view.ask();const thread=view.currentLocalThread(),input=view.panel.querySelector('[aria-label="畫板問題"]');input.value='比較這兩條邊，先核對定位前提';input.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await assert.rejects(()=>view.sendLocalQuestion(),/連接 Pi/);
  const current=view.currentLocalThread();assert.equal(current.status,'DRAFT');assert.equal(current.question,'比較這兩條邊，先核對定位前提');assert.equal(view.panel.querySelector('[aria-label="畫板問題"]').value,current.question);assert.equal(thread.snapshot.selection.annotationKeys.length,2);assert.equal(h.api.project.data.chat.length,0);
  assert.match(view.panel.querySelector('.intent-local-reply').textContent,/連接 Pi/);assert.ok(h.$('settingsDialog').open);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
test('actual Agent.send prompt contains selected keys, relation semantics, frozen marks and pixels',async()=>{
 const h=await setup();try{
  const view=await lines(h);view.addDistance();await view.ask();const thread=view.currentLocalThread();
  const input=view.panel.querySelector('[aria-label="畫板問題"]');input.value='量測的是哪兩條標記？';input.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  const agent=h.api.agent,wire=[];agent.connected=true;agent.model='qa-vision';agent.provider='qa';agent.models=[{id:'qa-vision',provider:'qa',input:['text','image']}];agent.wire=async value=>{wire.push(value);if(value.type==='prompt')setTimeout(()=>agent.event({type:'turn_end',turn:value.id}),0)};
  await view.sendLocalQuestion();const prompt=wire.find(v=>v.type==='prompt');assert.ok(prompt);assert.ok(prompt.images.length>=2);assert.ok(prompt.images.every(i=>i.type==='image'&&i.data.length>0));
  const frozen=JSON.parse(prompt.message.split('本次視覺問詢固定快照：')[1]);assert.deepEqual(frozen.selection.annotationKeys,[...view.annotationSelections]);assert.equal(frozen.relations[0].result.provenance.kind,'hand-drawn');assert.equal(frozen.items[0].annotations.length,2);
  assert.equal(view.currentLocalThread().status,'SENT');assert.equal(h.api.project.data.chat.filter(m=>m.role==='assistant').length,0);agent.busy=false;assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
test('threads, fixed selection, relations and original pixels survive workspace save and reopen',async()=>{
 const h=await setup();try{
  const view=await lines(h);view.addDistance();await view.ask();const thread=view.currentLocalThread();const saved=h.api.project.serialize(),raw=JSON.parse(saved);
  const loading=h.api.loadProject(saved);await confirmVisibleProjectSwitch(h);await loading;assert.equal(h.api.project.data.canvasThreads[0].id,thread.id);assert.equal(h.api.project.data.canvasRelations[0].result.value,raw.canvasRelations[0].result.value);
  assert.equal(JSON.stringify(h.api.project.data.canvasThreads[0].snapshot.selection),JSON.stringify(raw.canvasThreads[0].snapshot.selection));
  await h.api.go(6);await waitFor(h,()=>view.opened&&view.board()?.items.length===1&&!view.workflowPending);assert.equal(view.board().items[0].annotations.length,2);assert.ok(view.asset(view.board().items[0]).dataURL.startsWith('data:image/png;base64,'));assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
test('switching projects during either asynchronous image export never sends the old question',async()=>{
 for(const phase of ['composite','individual']){
  const h=await setup();try{
   const view=await lines(h);await view.ask();const thread=view.currentLocalThread();view.questionDrafts.set(thread.id,'不能送進另一個專案的問題');
   const image=await view.composite({snapshot:thread.snapshot}),images=await view.exportImages({snapshot:thread.snapshot});
   let release,entered;const started=new Promise(resolve=>{entered=resolve}),blocked=new Promise(resolve=>{release=resolve});let sends=0;view.onSend=async()=>{sends++};
   view.composite=async()=>{if(phase==='composite'){entered();await blocked}return image};
   view.exportImages=async()=>{if(phase==='individual'){entered();await blocked}return images};
   const pending=assert.rejects(()=>view.sendLocalQuestion(),/專案或問題已切換.*未發送/);await started;await h.click('newProject');await confirmVisibleProjectSwitch(h);const newEpoch=h.api.project.epoch;release();await pending;
   assert.equal(sends,0,phase);assert.equal(h.api.project.epoch,newEpoch);assert.equal(h.api.project.data.chat.length,0);assert.equal(h.api.project.data.canvasThreads,undefined);assert.equal(thread.status,'DRAFT');assert.deepEqual(h.errors,[]);
  }finally{h.close()}
 }
});
test('historical snapshots cannot edit live questions or inherit live selection and distance overlays',async()=>{
 const h=await setup();try{
  const view=await lines(h),historical=view.snapshot(); // Captured before a distance or question existed.
  view.addDistance();await view.ask();const live=view.currentLocalThread();view.questionDrafts.set(live.id,'目前畫板的問題');view.flushQuestionDrafts();
  const before=JSON.stringify(h.api.project.data.canvasThreads);assert.equal(view.annotationSelections.size,2);await view.openSnapshot(historical);
  assert.equal(view.annotationSelections.size,0);assert.equal(view.geometry.selection,null);assert.equal(view.panel.querySelector('[aria-label="畫板問題"]'),null);assert.equal(view.panel.querySelector('[data-intent-action="send"]'),null);
  await assert.rejects(()=>view.ask(),/歷史快照.*複製/);await assert.rejects(()=>view.sendLocalQuestion(),/歷史快照.*複製/);assert.equal(JSON.stringify(h.api.project.data.canvasThreads),before);
  const c=h.w.document.createElement('canvas');c.width=600;c.height=400;const ctx=c.getContext('2d'),labels=[],original=ctx.fillText;ctx.fillText=(value,...args)=>{labels.push(value);return original.call(ctx,value,...args)};
  try{view.paintRelations(ctx)}finally{ctx.fillText=original}
  assert.equal(h.api.project.data.canvasRelations.length,1);assert.deepEqual(labels,[],'A later live relation must never appear in an older image snapshot');assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
test('Workspace.load rejects malformed collaboration roots before replacing the active project',async()=>{
 const h=await setup();try{
  const view=await lines(h);view.addDistance();await view.ask();const project=h.api.project,original=project.data,before=JSON.stringify(project.data),epoch=project.epoch;
  const invalid=JSON.parse(before);invalid.canvasThreads={unexpected:'object instead of array'};
  await assert.rejects(()=>project.load(invalid,h.api.decode),/canvasThreads.*必須是陣列.*未允許替換目前專案/);
  assert.equal(project.data,original);assert.equal(project.epoch,epoch);assert.equal(JSON.stringify(project.data),before);assert.equal(project.loading,false);assert.ok(view.opened);assert.equal(view.currentLocalThread().id,original.canvasThreads[0].id);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
