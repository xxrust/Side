import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {installInspectionStopShortcut} from '../src/inspection-stop-shortcut.js';
const {createHarness}=createRequire(import.meta.url)('./workflow-ui-harness.cjs');
test('Escape stops active inspection before modal and input handlers, then restores normal keys',async()=>{
 const h=await createHarness();let active=true,cancels=0,bubbled=0;
 const remove=installInspectionStopShortcut(()=>{if(!active)return false;cancels++;return true},h.w);
 try{
  const dialog=h.w.document.createElement('dialog'),input=h.w.document.createElement('textarea');dialog.append(input);h.w.document.body.append(dialog);
  input.addEventListener('keydown',()=>bubbled++);
  const key=extra=>new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,...extra});
  const stop=key();input.dispatchEvent(stop);assert.equal(cancels,1);assert.equal(bubbled,0);assert.ok(stop.defaultPrevented);
  input.dispatchEvent(key({isComposing:true}));assert.equal(cancels,1);
  input.dispatchEvent(key({ctrlKey:true}));assert.equal(cancels,1);
  active=false;const idle=key();input.dispatchEvent(idle);assert.equal(cancels,1);assert.equal(idle.defaultPrevented,false);assert.equal(bubbled,3);
  active=true;remove();input.dispatchEvent(key());assert.equal(cancels,1);assert.equal(bubbled,4);
 }finally{remove();h.close()}
});
