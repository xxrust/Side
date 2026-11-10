import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createRequire} from 'node:module';
import {createImportTask,updateImportTask} from '../src/image-manager-model.js';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
test('a successful manager retry removes the old view-level failure as well as the task error',async()=>{
 const h=await createHarness();try{
  await h.api.startupReady;const p=h.api.project,m=h.api.imageManager;
  const bytes=await fs.readFile(new URL('../../research/opencv-traditional-10-2026-10-25/assets/box.png',import.meta.url));
  await p.addImages([{name:'box.png',dataUrl:'data:image/png;base64,'+bytes.toString('base64')}],h.api.decode);
  const id=createImportTask(p,'test-import-source',p.data.images);updateImportTask(p,id,{status:'FAILED',errors:['earlier transport failure']});
  m.refresh=()=>{};m.open('test-import-source',id);m.error(Error('earlier transport failure'));
  assert.match(m.dialog.textContent,/earlier transport failure/);
  // Protocol response is a test fixture; this is UI state recovery, not a model or algorithm acceptance test.
  m.request=async()=>({message:'此次回覆完成，尚未提出分類。',groups:[],model:{provider:'test',modelId:'transport-fixture'}});
  await m.sendDiscussion(id,'重新讀取匯入結構');
  assert.equal(m.dialog.querySelectorAll('.image-manager-error').length,0);
  assert.equal(p.data.imageManagerTasks.at(-1).discussionStatus,'IDLE');
  assert.match(m.dialog.textContent,/此次回覆完成/);
 }finally{h.close();}
});
