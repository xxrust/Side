import test from 'node:test';import assert from 'node:assert/strict';
import {createWorkpieceInputPrefetch} from '../src/workpiece-input-prefetch.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('presentation yield delays only lookahead and abort prevents deferred reads',async()=>{
 const f=fixture(),controller=new AbortController();let resume,calls=0;
 const q=createWorkpieceInputPrefetch(f.project,f.units,{enabled:true,signal:controller.signal,deferPreparation:()=>{calls++;return new Promise(resolve=>resume=resolve);}});
 await q.prime();assert.deepEqual(f.reads,['a']);assert.equal(calls,0);
 assert.equal((await q.next()).value.id,'a');q.start();await settle();
 assert.equal(calls,1);assert.deepEqual(f.reads,['a']);assert.equal(f.held.size,0);
 // Actual iteration is never held behind speculative preparation.
 assert.equal((await q.next()).value.id,'b');
 controller.abort();resume();await settle();assert.deepEqual(f.reads,['a']);assert.equal(f.held.size,0);
});
test('deferred preparation resumes for the exact next unit',async()=>{
 const f=fixture();let resume;
 const q=createWorkpieceInputPrefetch(f.project,f.units,{enabled:true,deferPreparation:()=>new Promise(resolve=>resume=resolve)});
 await q.next();q.start();await settle();assert.deepEqual(f.reads,[]);resume();await settle();assert.deepEqual(f.reads,['b']);assert.equal((await q.next()).value.id,'b');q.dispose();assert.equal(f.held.size,0);
});
test('fast execution retires obsolete deferred lookahead without reading or pinning it',async()=>{
 const f=fixture(),resume=[];
 const q=createWorkpieceInputPrefetch(f.project,f.units,{enabled:true,deferPreparation:()=>new Promise(resolve=>resume.push(resolve))});
 await q.next();q.start();await settle();assert.equal((await q.next()).value.id,'b');q.start();await settle();
 resume[0]();await settle();assert.deepEqual(f.reads,[]);assert.equal(f.held.size,0);
 resume[1]();await settle();assert.deepEqual(f.reads,['c']);q.dispose();assert.equal(f.held.size,0);
});
function fixture({fail=false}={}){const held=new Set(),reads=[],project={pinImages(ids){ids.forEach(id=>held.add(id));let closed=false;return ()=>{assert.equal(closed,false);closed=true;ids.forEach(id=>held.delete(id));};},async ensureImagePixels(id){reads.push(id);if(fail)throw Error('missing file');}};let pulls=0;async function* units(){for(const id of ['a','b','c']){pulls++;yield {id,imageIds:[id]};}}return {project,held,reads,units:units(),pulls:()=>pulls};}
test('priming starts only the first real unit and does not wait for decoding',async()=>{
 const f=fixture();let finish;
 f.project.ensureImagePixels=id=>{f.reads.push(id);return new Promise(resolve=>finish=resolve);};
 const q=createWorkpieceInputPrefetch(f.project,f.units,{enabled:true});
 await q.prime();assert.deepEqual(f.reads,['a']);assert.equal(f.pulls(),1);
 assert.deepEqual([...f.held],['a']);assert.equal((await q.next()).value.id,'a');
 q.dispose();assert.equal(f.held.size,0);finish();await settle();assert.equal(f.pulls(),1);
});
test('disabled priming never consumes an external stream',async()=>{
 const f=fixture(),q=createWorkpieceInputPrefetch(f.project,f.units);
 await q.prime();assert.equal(f.pulls(),0);assert.equal(f.reads.length,0);q.dispose();
});
test('only next actual unit is prepared, with no reorder or publication',async()=>{
 const f=fixture(),q=createWorkpieceInputPrefetch(f.project,f.units,{enabled:true});assert.equal((await q.next()).value.id,'a');assert.deepEqual(f.reads,[]);
 q.start();q.start();await settle();assert.equal(f.pulls(),2);assert.deepEqual(f.reads,['b']);assert.deepEqual([...f.held],['b']);
 assert.equal((await q.next()).value.id,'b');assert.deepEqual([...f.held],['b']);q.start();await settle();assert.deepEqual(f.reads,['b','c']);assert.deepEqual([...f.held],['c']);
 assert.equal((await q.next()).value.id,'c');q.dispose();assert.equal(f.held.size,0);
});
test('cancellation and project invalidation release pins even during a pending decode',async()=>{
 const f=fixture(),controller=new AbortController();let finish;f.project.ensureImagePixels=()=>new Promise(resolve=>finish=resolve);
 const q=createWorkpieceInputPrefetch(f.project,f.units,{enabled:true,signal:controller.signal});await q.next();q.start();await settle();assert.equal(f.held.size,1);controller.abort();assert.equal(f.held.size,0);finish();await settle();q.start();assert.equal(f.pulls(),2);
 const g=fixture();let current=false;const other=createWorkpieceInputPrefetch(g.project,g.units,{enabled:true,isCurrent:()=>current});await other.next();other.start();await settle();assert.equal(g.pulls(),1);other.dispose();
});
test('speculative read failure preserves unit order for normal retry; disabled prefetch does not pull a stream',async()=>{
 const f=fixture({fail:true}),q=createWorkpieceInputPrefetch(f.project,f.units,{enabled:true});await q.next();q.start();await settle();assert.equal(f.held.size,0);assert.equal((await q.next()).value.id,'b');q.dispose();
 const g=fixture(),plain=createWorkpieceInputPrefetch(g.project,g.units);await plain.next();plain.start();await settle();assert.equal(g.pulls(),1);assert.deepEqual(g.reads,[]);await plain.return();
});
