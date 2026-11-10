// Real app DOM and an existing image asset; no model or algorithm outputs are fabricated.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {recoverCanvasThreadSessions} from '../src/canvas-thread-model.js';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
async function setup(){
 const h=await createHarness();
 const bytes=await readFile(new URL('../../prd/2026-10-26-canvas-first/assets/holes-1.png',import.meta.url));
 await h.api.addImages([{name:'holes-1.png',dataUrl:'data:image/png;base64,'+bytes.toString('base64')}]);await h.api.go(6);
 const view=h.api.inquiryView;for(let i=0;i<80;i++){if(view.opened&&view.board()?.projectSpaces&&!view.workflowPending){const source=h.api.project.canvasProjectContext(view.boardId).sources[0];await view.projectCards.addOriginal(source,source.images[0]);return h;}await h.tick()}h.close();throw Error('畫板尚未就緒');
}
test('question collapse retains the entered draft and fixed question, then restores the editor',async()=>{
 const h=await setup();try{
  const view=h.api.inquiryView;await view.ask();const thread=view.currentLocalThread(),input=view.panel.querySelector('[aria-label="畫板問題"]');
  input.value='比較我圈出的兩個孔';input.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  view.panel.querySelector('[data-intent-action="toggle-question"]').click();await h.tick();
  assert.equal(view.currentLocalThread().collapsed,true);assert.equal(view.currentLocalThread().question,'比較我圈出的兩個孔');
  assert.equal(view.panel.querySelector('.intent-question-body').hidden,true);
  assert.equal(view.panel.querySelector('.intent-question-summary').textContent,'比較我圈出的兩個孔');
  assert.equal(view.panel.querySelector('[data-intent-action="toggle-question"]').getAttribute('aria-expanded'),'false');
  assert.equal(view.panel.querySelector('.intent-question-status').textContent,'新問題草稿');
  view.panel.querySelector('[aria-label="展開目前問題"]').click();await h.tick();
  assert.equal(view.currentLocalThread().collapsed,false);assert.equal(view.panel.querySelector('.intent-question-body').hidden,false);
  assert.equal(view.panel.querySelector('[aria-label="畫板問題"]').value,'比較我圈出的兩個孔');
  assert.equal(h.api.project.data.chat.length,0);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
test('a compact question persists on save but a new question opens expanded',async()=>{
 const h=await setup();try{
  const view=h.api.inquiryView;await view.ask();const old=view.currentLocalThread();
  view.panel.querySelector('[data-intent-action="toggle-question"]').click();await h.tick();
  assert.equal(JSON.parse(h.api.project.serialize()).canvasThreads[0].collapsed,true);
  await view.ask();assert.equal(view.currentLocalThread().id,old.id,'ask resumes the active logical question');await view.openLocalQuestion({newQuestion:true});assert.notEqual(view.currentLocalThread().id,old.id);
  assert.equal(view.panel.querySelector('.intent-question-body').hidden,false);
  assert.equal(view.panel.querySelector('[data-intent-action="toggle-question"]').getAttribute('aria-expanded'),'true');
  assert.equal(h.api.project.data.chat.length,0);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('question window supports persisted sizing and right-side docking',async()=>{
 const h=await setup();try{
  const view=h.api.inquiryView;await view.ask();const thread=view.currentLocalThread();
  assert.equal(thread.width,360);assert.equal(thread.height,420);assert.equal(thread.docked,false);
  h.api.project.updateCanvasThread(thread.id,{width:520,height:360,docked:true});view.render();await h.tick();
  const current=view.currentLocalThread(),bubble=view.panel.querySelector('.intent-question-bubble');
  assert.equal(current.width,520);assert.equal(current.height,360);assert.equal(current.docked,true);assert.ok(bubble, 'question bubble should remain mounted');assert.equal(bubble.classList.contains('is-docked'),true,JSON.stringify({className:bubble.className,thread:current}));assert.equal(bubble.querySelector('[data-intent-action="dock-question"]').getAttribute('aria-pressed'),'true');assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('an in-flight question keeps accepting the next draft and queues it',async()=>{
 const h=await setup();try{
  const view=h.api.inquiryView;await view.ask();const thread=view.currentLocalThread();
  h.api.project.data.canvasThreads.find(item=>item.id===thread.id).status='SENDING';view.questionDrafts.set(thread.id,'請再核對這個邊界');view.render();await h.tick();
  const result=await view.sendLocalQuestion();
  assert.equal(result.queued,true);assert.equal(view.pendingQuestionQueue.get(thread.id),'請再核對這個邊界');assert.equal(view.panel.querySelector('[aria-label="畫板問題"]').disabled,false);assert.match(view.panel.querySelector('.intent-question-status').textContent,/排隊/);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('recovery keeps the assistant reply already flushed to chat before shutdown',()=>{
 const data={chat:[
  {role:'user',text:'請分析這張圖',canvasThreadId:'thread-1',canvasTurnId:'turn-1'},
  {role:'assistant',text:'我已完成初步分析，邊界支持良好。',canvasThreadId:'thread-1',canvasTurnId:'turn-1'}
 ],canvasThreads:[{id:'thread-1',status:'SENDING',turns:[{id:'turn-1',status:'SENDING',question:'請分析這張圖',messages:[]}]}]};
 recoverCanvasThreadSessions(data);const turn=data.canvasThreads[0].turns[0];
 assert.equal(turn.status,'FAILED');assert.equal(turn.messages.length,2);assert.equal(turn.messages[1].text,'我已完成初步分析，邊界支持良好。');assert.match(turn.error,/已保存當時的 Agent 回覆/);assert.equal(data.canvasThreads[0].status,'DRAFT');
});
