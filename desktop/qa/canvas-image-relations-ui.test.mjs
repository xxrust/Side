// Real canvas state, event handlers and raster export; no model responses or fabricated CV outputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs'),{createCanvas}=require('../../qa/node_modules/@napi-rs/canvas');
async function setup(){const h=await createHarness(),c=createCanvas(120,80),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,120,80);ctx.fillStyle='#222';ctx.fillRect(10,10,80,50);await h.api.addImages([{name:'original.png',dataUrl:c.toDataURL()}]);await h.api.go(6);const v=h.api.inquiryView;for(let i=0;i<80&&(!v.opened||v.workflowPending);i++)await h.tick();const source=h.api.project.image;const added=h.api.project.addInquiryImage(h.w.JSON.parse(JSON.stringify({kind:'original',label:source.name,dataURL:source.dataURL,width:source.width,height:source.height,source:{kind:'project-original',imageId:source.id,inputSha256:source.sha256,coordinateSpace:'original-image-pixels'}})));await v.open({boardId:added.board.id});const first=v.board().items.find(i=>i.id===added.item.id),asset=v.asset(first);const next=await v.addReference(h.w.JSON.parse(JSON.stringify({label:'same-pixels-reference.png',dataURL:asset.dataURL,width:asset.width,height:asset.height,source:{kind:'reference',measurementInput:false}})),{x:first.x+first.width+180,y:first.y});return {h,v,first,second:next.item};}
test('two images connect, label edits and line clicks produce a frozen relationship question',async()=>{
 const {h,v,first,second}=await setup();try{
  v.selected=new Set([first.id,second.id]);v.render();const connect=v.panel.querySelector('[data-intent-action="connect"]');assert.equal(connect.disabled,false);connect.click();await h.tick();const r=h.api.project.data.canvasRelations[0];assert.equal(r.fromItemId,first.id);assert.equal(r.toItemId,second.id);const input=v.panel.querySelector('[aria-label="修改圖像關係"]');input.value='比較同一區域的原圖與邊緣結果';input.closest('form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));await h.tick();assert.equal(r.label,input.value);
  const a=v.board().items.find(i=>i.id===first.id),b=v.board().items.find(i=>i.id===second.id),x=(a.x+a.width+b.x)/2,y=a.y+a.height/2;
  const event=new h.w.MouseEvent('pointerdown',{clientX:x*v.zoom+v.pan.x,clientY:y*v.zoom+v.pan.y,bubbles:true,cancelable:true});v.canvas.dispatchEvent(event);assert.equal(v.relationSelection,r.id);assert.equal(v.selected.size,2);await v.ask();const thread=v.currentLocalThread();assert.equal(thread.snapshot.items.length,2);assert.equal(thread.snapshot.selection.relationIds[0],r.id);assert.equal(thread.snapshot.relations[0].label,r.label);
  const composite=await v.composite({snapshot:thread.snapshot});assert.ok(composite.dataURL.length>100);assert.equal(h.api.project.data.chat.length,0);
  const saved=h.api.project.serialize();await h.api.project.load(h.w.JSON.parse(saved),h.api.decode);assert.equal(h.api.project.data.canvasRelations[0].label,r.label);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
test('image relation snapshots stay historical and cannot mutate live links',async()=>{
 const {h,v,first,second}=await setup();try{
  const r=v.addImageRelation({fromItemId:first.id,toItemId:second.id,label:'舊關係'}),snapshot=v.snapshot();h.api.project.mutate('label_changed',()=>{r.label='新關係'});await v.openSnapshot(snapshot);assert.equal(v.snapshot().relations[0].label,'舊關係');assert.throws(()=>v.addImageRelation({fromItemId:first.id,toItemId:second.id}),/歷史快照/);assert.throws(()=>v.editImageRelation(r),/歷史快照/);assert.equal(h.api.project.data.canvasRelations[0].label,'新關係');
 }finally{h.close()}
});

test('one click on the truncated relation label opens complete selectable text without modifying calculation inputs',async()=>{
 const {h,v,first,second}=await setup();try{
  const label='原圖 → 輪廓擬合：比較左右孔徑、中心距離與邊緣間距。\n參數來源與方法選擇的完整內容必須全部可讀，不能在省略號處結束。';
  const r=v.addImageRelation({fromItemId:first.id,toItemId:second.id,label}),a=v.board().items[0],b=v.board().items[1],p=h.api.project,revision=v.board().revision,events=p.data.events.length;
  const world={x:(a.x+a.width+b.x)/2,y:(a.y+a.height/2+b.y+b.height/2)/2+8/v.zoom};
  v.canvas.dispatchEvent(new h.w.MouseEvent('pointerdown',{clientX:world.x*v.zoom+v.pan.x,clientY:world.y*v.zoom+v.pan.y,bubbles:true,cancelable:true}));
  let details=v.panel.querySelector('[aria-label="完整關係說明"]');assert.ok(details);assert.equal(details.querySelector('.inquiry-relation-full-text').textContent,label);assert.equal(details.querySelector('.inquiry-relation-full-text').tabIndex,0);assert.equal(v.relationSelection,r.id);assert.equal(v.board().revision,revision);assert.equal(p.data.events.length,events);
  details.querySelector('[aria-label="收合關係說明"]').click();assert.equal(v.panel.querySelector('[aria-label="完整關係說明"]'),null);assert.equal(r.label,label);
  v.expandedRelationId=r.id;v.render();details=v.panel.querySelector('[aria-label="完整關係說明"]');details.querySelector('[aria-label="詢問這條關係"]').click();assert.equal(v.currentLocalThread().snapshot.relations[0].label,label);assert.equal(v.currentLocalThread().snapshot.selection.relationIds[0],r.id);
 }finally{h.close()}
});

test('expanded historical relationship uses frozen text and offers no live edit action',async()=>{
 const {h,v,first,second}=await setup();try{
  const label='歷史完整關係說明：這是一段超過二十八個字的內容，仍必須完整可讀。',r=v.addImageRelation({fromItemId:first.id,toItemId:second.id,label}),snapshot=v.snapshot();h.api.project.mutate('changed_live_relation',()=>{r.label='後來的內容'});await v.openSnapshot(snapshot);
  v.relationSelection=r.id;v.expandedRelationId=r.id;v.render();const details=v.panel.querySelector('[aria-label="完整關係說明"]');assert.equal(details.querySelector('.inquiry-relation-full-text').textContent,label);assert.equal(details.querySelector('[aria-label="修改關係說明"]'),null);assert.equal(h.api.project.data.canvasRelations[0].label,'後來的內容');
 }finally{h.close()}
});

test('right-clicking a relationship opens its question without referencing an undefined image hit',async()=>{
 const {h,v,first,second}=await setup();try{
  const r=v.addImageRelation({fromItemId:first.id,toItemId:second.id,label:'同一原圖的兩個引用'});
  assert.doesNotThrow(()=>v.imageRelationMenu(new h.w.MouseEvent('contextmenu',{clientX:120,clientY:120}),r));
  const ask=[...v.menu.querySelectorAll('button')].find(b=>b.textContent==='詢問這條關係');assert.ok(ask);ask.click();await h.tick();
  const thread=v.currentLocalThread();assert.equal(thread.snapshot.selection.relationIds[0],r.id);assert.equal(thread.snapshot.items.length,2);
  assert.equal(h.w.document.activeElement,v.localQuestionInput);assert.equal(h.api.project.data.chat.length,0);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
