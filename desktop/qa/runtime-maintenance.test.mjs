import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeSessionExecutor} from '../src/native-session-bridge.js';
const request={sessionId:'s',executionId:'e',unitId:'u',shared:{}};
const reference={kind:'runtime-maintenance-v1',id:'s:u',sessionId:'s',unitId:'u',pid:42,call:3};
const receipt={operation:'collect-garbage',id:'s:u',pid:42,call:3,ok:true,gcMs:11,roundTripMs:12};
test('binary and ordinary native results cannot return before matching maintenance completes',async()=>{
 for(const binary of [false,true]){
  let complete,returned=false;const pending=new Promise(resolve=>complete=resolve),calls=[];
  const execute=createNativeSessionExecutor({Channel:class{},invoke:async(command,args)=>{
   calls.push(command);if(command==='execute_inspection_session'){
    const value={runs:[],timing:{},runtimeMaintenance:reference};return binary?new TextEncoder().encode(JSON.stringify(value)).buffer:value;
   }
   assert.equal(command,'await_inspection_maintenance');assert.deepEqual(args.reference,reference);return pending;
  }});
  const running=execute(request).then(value=>{returned=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(returned,false);assert.deepEqual(calls,['execute_inspection_session','await_inspection_maintenance']);
  complete(receipt);const value=await running;assert.equal(value.runtimeMaintenance,undefined);assert.equal(value.timing.runtimeMaintenance.gcMs,11);assert.ok(value.timing.runtimeMaintenance.joinWaitMs>=0);
 }
});
test('wrong unit, stale worker receipt and maintenance failure never publish a result',async()=>{
 for(const mode of ['unit','receipt','failure']){
  const execute=createNativeSessionExecutor({Channel:class{},invoke:async(command)=>{
   if(command==='execute_inspection_session')return {runs:[],timing:{},runtimeMaintenance:{...reference,...(mode==='unit'?{unitId:'other'}:{})}};
   if(mode==='failure')throw Error('worker timeout');return {...receipt,call:4};
  }});
  await assert.rejects(execute(request),mode==='failure'?/worker timeout/:/MAINTENANCE_/);
 }
});
