import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeInputVerification} from '../src/native-input-verification.js';
import {createNativeSessionExecutor} from '../src/native-session-bridge.js';
const expected={images:[{imageId:'actual',imageSha256:'pixels',contentSha256:'file',width:2,height:3}]};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('verification can finish before registration, but cannot acknowledge before registration',async()=>{
 const calls=[],gate=createNativeInputVerification({verification:Promise.resolve(expected),expected,isCurrent:()=>true,confirm:async v=>calls.push(v)});
 await Promise.resolve();assert.equal(calls.length,0);gate.start();gate.start();await gate.complete();assert.equal(calls.length,1);assert.deepEqual(calls[0],{accepted:true,sourceBinding:expected});gate.dispose();
});
test('pending verification does not acknowledge; rejection, changed source and cancellation fail closed',async()=>{
 for(const kind of ['failure','source','project','cancel']){
  const input=deferred(),calls=[],controller=new AbortController();const gate=createNativeInputVerification({verification:input.promise,expected,isCurrent:()=>kind!=='project',signal:controller.signal,confirm:async v=>calls.push(v)});
  gate.start();await Promise.resolve();assert.equal(calls.length,0);
  if(kind==='cancel')controller.abort();
  if(kind==='failure')input.reject(Error('actual corrupt file'));else input.resolve(kind==='source'?{images:[]}:expected);
  await assert.rejects(gate.complete());assert.deepEqual(calls,[{accepted:false,sourceBinding:null}]);gate.dispose();
 }
});
test('a disposed native operation cannot send a late acknowledgement',async()=>{
 const input=deferred(),calls=[],gate=createNativeInputVerification({verification:input.promise,expected,isCurrent:()=>true,confirm:async v=>calls.push(v)});
 gate.start();gate.dispose();input.resolve(expected);await Promise.resolve();await Promise.resolve();assert.equal(calls.length,0);await assert.rejects(gate.complete(),/DISPOSED/);
});
test('native bridge requests gate, waits for registered identity acknowledgement and preserves ordinary response',async()=>{
 const input=deferred(),native=deferred(),calls=[];let progress;
 const request={sessionId:'s',executionId:'e',unitId:'u',shared:{sourceBinding:expected}};
 const execute=createNativeSessionExecutor({Channel:class{},invoke:async(command,args)=>{
  calls.push(command);
  if(command==='execute_inspection_session'){assert.equal(args.request.awaitInputVerification,true);progress=args.progress;return native.promise;}
  if(command==='verify_inspection_session_input'){assert.equal(args.accepted,true);assert.deepEqual(args.sourceBinding,expected);native.resolve({runs:[],timing:{}});return;}
  throw Error(command);
 }});
 const running=execute(request,{inputVerification:input.promise});input.resolve(expected);await Promise.resolve();assert.deepEqual(calls,['execute_inspection_session']);
 progress.onmessage({sessionId:'wrong',executionId:'e',unitId:'u',sequence:1,phase:'session-started'});await Promise.resolve();assert.equal(calls.length,1);
 progress.onmessage({sessionId:'s',executionId:'e',unitId:'u',sequence:1,phase:'session-started'});
 const result=await running;assert.deepEqual(result.runs,[]);assert.deepEqual(calls,['execute_inspection_session','verify_inspection_session_input']);
});
test('native launch failure disposes pending verification without a late confirmation',async()=>{
 const input=deferred(),calls=[];const execute=createNativeSessionExecutor({Channel:class{},invoke:async command=>{calls.push(command);throw Error('launch failed');}});
 await assert.rejects(execute({sessionId:'s',shared:{sourceBinding:expected}},{inputVerification:input.promise}),/launch failed/);input.resolve(expected);await Promise.resolve();await Promise.resolve();assert.deepEqual(calls,['execute_inspection_session']);
});

test('acknowledgement transport failure rejects completion and notifies cancellation once',async()=>{
 let failures=0;const gate=createNativeInputVerification({verification:Promise.resolve(expected),expected,isCurrent:()=>true,confirm:async()=>{throw Error('ack transport failed');},onFailure:()=>failures++});
 gate.start();await assert.rejects(gate.complete(),/ack transport failed/);assert.equal(failures,1);gate.dispose();
});
