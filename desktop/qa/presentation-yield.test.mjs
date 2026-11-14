import test from 'node:test';import assert from 'node:assert/strict';
import {yieldForPresentation,prepareInputDisplay} from '../src/presentation-yield.js';
function scheduler(){let id=0;const frames=new Map(),timers=new Map();return {frames,timers,requestFrame:f=>{frames.set(++id,f);return id;},cancelFrame:id=>frames.delete(id),setTimer:(f,ms)=>{assert.equal(ms,50);timers.set(++id,f);return id;},clearTimer:id=>timers.delete(id),tick(){const batch=[...frames];frames.clear();for(const [,f]of batch)f();}};}
test('two presentation opportunities release lookahead and clear fallback',async()=>{
 const s=scheduler();let ready=false;const p=yieldForPresentation(s).then(()=>ready=true);
 s.tick();await Promise.resolve();assert.equal(ready,false);s.tick();await p;assert.equal(ready,true);assert.equal(s.frames.size,0);assert.equal(s.timers.size,0);
});
test('input display defers only an existing frame and rechecks cancellation and source',async()=>{
 for(const change of ['none','stale','abort']){
  let resume,reads=0,current=true;const controller=new AbortController(),pending=new Promise(resolve=>resume=resolve);
  const work=prepareInputDisplay({prepare(model,guard){reads++;assert.deepEqual(model,{imageId:'actual'});assert.equal(guard.activeId,'actual');assert.equal(guard.isCurrent(),true);}},'actual',{hasFrame:true,signal:controller.signal,isCurrent:()=>current,yieldPresentation:()=>pending});
  assert.equal(reads,0);if(change==='stale')current=false;if(change==='abort')controller.abort();resume();await work;assert.equal(reads,change==='none'?1:0);
 }
 let reads=0;const work=prepareInputDisplay({prepare(){reads++;}},'first',{isCurrent:()=>true,yieldPresentation:()=>assert.fail('first display unnecessarily deferred')});assert.equal(reads,1);await work;
});
test('hidden-window timeout and cancellation release all callbacks',async()=>{
 for(const abort of [false,true]){const s=scheduler(),controller=new AbortController();const p=yieldForPresentation({...s,signal:controller.signal});if(abort)controller.abort();else [...s.timers.values()][0]();await p;assert.equal(s.frames.size,0);assert.equal(s.timers.size,0);}
 const s=scheduler(),controller=new AbortController();controller.abort();await yieldForPresentation({...s,signal:controller.signal});assert.equal(s.frames.size,0);assert.equal(s.timers.size,0);
});
