import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createHarness}=createRequire(import.meta.url)('./workflow-ui-harness.cjs');

test('canvas surface keeps one main Agent composer and removes local question controls',async()=>{
 const h=await createHarness();
 try{
  await h.api.startupReady;h.api.render();
  const text=h.w.document.body.textContent;
  assert.doesNotMatch(text,/同一問題|從此問題分支|新增問題/);
  assert.equal(h.w.document.querySelectorAll('[data-canvas-question-input]').length,0);
  assert.equal(h.w.document.querySelectorAll('.intent-question-bubble').length,0);
  assert.equal(h.errors.length,0);
 }finally{h.close();}
});
