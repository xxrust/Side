// Deletion lifecycle against a genuine saved image discussion and algorithm records.
// No generated CV result or model reply is substituted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Workspace} from '../src/workspace.js';
import {branchThreadMessages} from '../src/agent-thread-context.js';
import {validateCanvasCollaboration} from '../src/canvas-collaboration-state.js';
const saved=JSON.parse(fs.readFileSync(new URL('../../codex-audit-logs/20261102-focused-discussion/verified-discussion.agentcv.json',import.meta.url)));
const real=saved.canvasThreads.find(t=>t.status==='SENT');
const {createHarness}=createRequire(import.meta.url)('./workflow-ui-harness.cjs');

test('delete and restore a real discussion preserves shared data, branch provenance and persisted history',()=>{
 const p=new Workspace();p.data=structuredClone(saved);
 const before=JSON.stringify({images:p.data.images,runs:p.data.algorithmRuns,boards:p.data.visualInquiry,chat:p.data.chat,scheme:p.data.purposeScheme});
 const messages=branchThreadMessages(p,real.id,real.turns.at(-1).id);assert.ok(messages.length);
 p.deleteCanvasThread(real.id);assert.equal(p.getCanvasThread(real.id),null);assert.ok(!p.canvasThreadsContext().some(t=>t.id===real.id));
 assert.deepEqual(branchThreadMessages(p,real.id,real.turns.at(-1).id),messages,'existing explicit child branches retain their source history');
 assert.equal(JSON.stringify({images:p.data.images,runs:p.data.algorithmRuns,boards:p.data.visualInquiry,chat:p.data.chat,scheme:p.data.purposeScheme}),before);
 assert.throws(()=>p.beginCanvasThreadTurn(real.id,{question:'不能在已刪除的討論續問'}),/不存在/);
 const reloaded=new Workspace();reloaded.data=JSON.parse(p.serialize());assert.equal(reloaded.getCanvasThread(real.id),null);assert.ok(reloaded.data.canvasThreads.find(t=>t.id===real.id).deletedAt);
 reloaded.restoreCanvasThread(real.id);assert.deepEqual(reloaded.getCanvasThread(real.id),real);validateCanvasCollaboration(reloaded.data);
});

test('in-flight discussions cannot be deleted and malformed deletion metadata is rejected',()=>{
 const p=new Workspace();p.data=structuredClone(saved);const draft=p.canvasThreadsContext().find(t=>t.status==='DRAFT');
 p.beginCanvasThreadTurn(draft.id,{question:'核對此張原圖',snapshot:draft.snapshot});const before=JSON.stringify(p.data);
 assert.throws(()=>p.deleteCanvasThread(draft.id),/正在回覆/);assert.equal(JSON.stringify(p.data),before);
 const broken=structuredClone(saved);broken.canvasThreads[0].deletedAt='invalid-date';assert.throws(()=>validateCanvasCollaboration(broken),/刪除時間無效/);
});

test('timeline delete and restore controls remove the real question from both UI lists without deleting its images',async()=>{
 const h=await createHarness();try{
  await h.api.loadProject(h.w.JSON.parse(JSON.stringify(saved)));const p=h.api.project,v=h.api.inquiryView;
  await v.open({boardId:real.boardId});v.outputView.setMode('canvas');v.activeThreadId=real.id;v.discussionHistoryOpen=true;v.render();
  const items=JSON.stringify(v.board().items),entry=h.w.document.querySelector(`[data-thread-id="${real.id}"].workspace-history-entry`);assert.ok(entry);
  const remove=entry.querySelector('[aria-label="刪除此段圖文討論"]');assert.ok(remove);assert.equal(remove.disabled,false);remove.click();await h.tick();
  assert.equal(p.getCanvasThread(real.id),null);assert.equal(h.w.document.querySelector(`[data-thread-id="${real.id}"].workspace-history-entry`),null);assert.equal(v.currentLocalThread(),null);assert.equal(JSON.stringify(v.board().items),items);
  assert.equal(h.w.document.querySelector('.canvas-discussion-history').open,true);
  h.w.document.querySelector('.workspace-history-restore').click();await h.tick();assert.ok(p.getCanvasThread(real.id));assert.ok(h.w.document.querySelector(`[data-thread-id="${real.id}"].workspace-history-entry`));
  const draft=p.canvasThreadsContext().find(t=>t.status==='DRAFT');p.beginCanvasThreadTurn(draft.id,{question:'核對此張原圖',snapshot:draft.snapshot});v.render();assert.equal(h.w.document.querySelector(`[data-thread-id="${draft.id}"].workspace-history-entry .workspace-history-delete`).disabled,true);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
