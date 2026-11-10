import test from 'node:test';import assert from 'node:assert/strict';
import {installProjectDocumentOpen} from '../src/project-document-open.js';
test('cold and warm document events use one loader after recovery, retaining the source directory',async()=>{
 let release;const ready=new Promise(r=>release=r),queue=['/new.agentcv'],loaded=[],read=[],events={};
 const c=installProjectDocumentOpen({ready,busy:()=>false,listen:async(n,f)=>{events[n]=f;return()=>{}},invoke:async(name,args)=>{
  if(name==='take_project_open')return queue.shift()||null;
  read.push(args.path);return {content:JSON.stringify({images:[]}),path:args.path};
 },load:async(content,options)=>{loaded.push(options.path);return false;},onError:e=>assert.fail(e)});
 await Promise.resolve();assert.equal(loaded.length,0);release();await c.started;
 assert.deepEqual(loaded,['/new.agentcv']);queue.push('/another.agentcv');await c.drain();
 assert.deepEqual(read,loaded);assert.deepEqual(loaded,['/new.agentcv','/another.agentcv']);c.dispose();
});
test('an active operation leaves native documents queued, and an unreadable document does not lose the next one',async()=>{
 const queue=['bad','good'],loaded=[],errors=[];let busy=true,retry;
 const c=installProjectDocumentOpen({ready:Promise.resolve(),busy:()=>busy,listen:async()=>()=>{},setTimer:f=>(retry=f,1),clearTimer:()=>{},invoke:async(n,a)=>{
  if(n==='take_project_open')return queue.shift()||null;
  if(a.path==='bad')throw Error('missing assets');return{content:'valid',path:a.path};
 },load:async(c,o)=>loaded.push(o.path),onError:e=>errors.push(e)});
 await c.started;assert.equal(queue.length,2);busy=false;await retry();assert.deepEqual(loaded,['good']);assert.match(errors[0],/missing assets/);c.dispose();
});
test('a file event arriving during an empty queue response is not lost',async()=>{
 let event,respond,reads=0;const queue=[],loaded=[];
 const c=installProjectDocumentOpen({ready:Promise.resolve(),busy:()=>false,listen:async(n,f)=>{event=f;return()=>{}},invoke:async(n,a)=>{
  if(n==='take_project_open'){if(++reads===1)return new Promise(r=>respond=r);return queue.shift()||null;}
  return{content:'valid',path:a.path};
 },load:async(c,o)=>loaded.push(o.path),onError:e=>assert.fail(e)});
 while(!respond)await Promise.resolve();queue.push('/arrived.agentcv');event();respond(null);await c.started;
 for(let n=0;n<10&&!loaded.length;n++)await Promise.resolve();
 assert.deepEqual(loaded,['/arrived.agentcv']);c.dispose();
});
