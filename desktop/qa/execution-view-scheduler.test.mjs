import test from 'node:test';import assert from 'node:assert/strict';import {createExecutionViewScheduler,createCompletionViewUpdates} from '../src/execution-view-scheduler.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('1000 progress requests coalesce to current display state while flush and disposal cannot leave a stale callback',async()=>{let state=0;const observed=[],scheduler=createExecutionViewScheduler(()=>observed.push(state),{intervalMs:50});for(let i=1;i<=1000;i++){state=i;scheduler.request();}await wait(15);assert.deepEqual(observed,[1000]);state=1001;scheduler.request();scheduler.flush();assert.deepEqual(observed,[1000,1001]);state=1002;scheduler.request();scheduler.dispose();await wait(60);assert.deepEqual(observed,[1000,1001]);});

test('completed workpiece bypasses a pending progress delay once, including reentrant subscribers',async()=>{
 let completed=null,request,rendered=0;const seen=[];
 const scheduler=createExecutionViewScheduler(()=>{rendered++;seen.push(completed?.id||null);if(completed)request();},{intervalMs:150});
 request=createCompletionViewUpdates(scheduler,()=>completed);request();scheduler.flush();assert.equal(rendered,1);
 request();completed={id:'first'};request();assert.deepEqual(seen,[null,'first']);
 request();assert.equal(rendered,2,'same completed identity must not force another synchronous render');
 completed={id:'second'};request();assert.deepEqual(seen,[null,'first','second']);
 scheduler.dispose();await wait(170);assert.deepEqual(seen,[null,'first','second'],'old timer cannot publish after disposal');
});
