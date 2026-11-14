import test from 'node:test';
import assert from 'node:assert/strict';
import {beginNativePreviewPrefetch,takeVerifiedNativePreview} from '../src/native-preview-prefetch.js';
import {createNativeSessionExecutor} from '../src/native-session-bridge.js';
const src='http://agentcv-memory.localhost/'+'a'.repeat(64);
const preview={src,nodeId:'node',artifactId:'overlay',width:1280,height:1024};
const result=()=>({timing:{},runs:[{schemeNodeId:'node',artifacts:[{id:'overlay',type:'image',dataUrl:src,width:1280,height:1024}]}]});
class ImageStub{
 static images=[];
 constructor(){ImageStub.images.push(this);}
 decode(){return Promise.resolve();}
 removeAttribute(name){delete this[name];}
}
test('only final verified pixels transfer once and survive cache eviction',async()=>{
 const lease=beginNativePreviewPrefetch({ImageClass:ImageStub});lease.stage([preview]);
 const image=ImageStub.images.at(-1);
 assert.equal(takeVerifiedNativePreview(preview),null,'speculative pixels cannot be displayed');
 lease.complete(result());
 assert.equal(takeVerifiedNativePreview({...preview,width:1279}),null);
 const frame=takeVerifiedNativePreview(preview);assert.equal(frame.image,image);await frame.ready;
 assert.equal(takeVerifiedNativePreview(preview),null,'one element has one display owner');
 assert.equal(lease.complete(result()).bytes,0);lease.dispose();
 assert.equal(image.src,src,'disposing the speculative cache must not clear visible pixels');
});
test('a transferred decode failure still rejects before display',async()=>{
 let reject;
 class Pending extends ImageStub{decode(){return new Promise((_,r)=>{reject=r;});}}
 const lease=beginNativePreviewPrefetch({ImageClass:Pending});lease.stage([preview]);lease.complete(result());
 const frame=takeVerifiedNativePreview(preview);reject(Error('decode failed'));
 await assert.rejects(frame.ready,/decode failed/);lease.dispose();
});
test('speculative decode retains only exact final artifact identities and releases explicitly',async()=>{
 const lease=beginNativePreviewPrefetch({ImageClass:ImageStub});
 lease.stage([preview,preview,{...preview,src:'https://untrusted.example/image'},{...preview,width:1e9}]);
 await Promise.resolve();assert.equal(lease.complete(result()).decoded,1);
 const image=ImageStub.images.at(-1);assert.equal(image.src,src);assert.equal(image.crossOrigin,'anonymous');
 const mismatched=result();mismatched.runs[0].artifacts[0].width=1279;
 assert.equal(lease.complete(mismatched).bytes,0);assert.equal(image.src,undefined);lease.dispose();
});
test('unconsumed preloads are bounded across sessions and by decoded byte budget',()=>{
 const leases=[];
 for(let i=0;i<8;i++){const lease=beginNativePreviewPrefetch({ImageClass:ImageStub});lease.stage([{...preview,width:2048,height:2048}]);leases.push(lease);}
 const retained=leases.map(l=>l.complete({runs:[{schemeNodeId:'node',artifacts:[{id:'overlay',dataUrl:src,width:2048,height:2048}]}]}));
 assert.equal(retained.filter(s=>s.bytes>0).length,4);assert.equal(retained.reduce((n,s)=>n+s.bytes,0),64*1024*1024);
 for(const lease of leases)lease.dispose();
});
test('decode errors release speculative pixels without changing the execution result',async()=>{
 class Broken extends ImageStub{decode(){return Promise.reject(Error('bad pixels'));}}
 const lease=beginNativePreviewPrefetch({ImageClass:Broken});lease.stage([preview]);await Promise.resolve();
 const summary=lease.complete(result());assert.equal(summary.failed,1);assert.equal(summary.bytes,0);lease.dispose();
});
test('bridge filters stale, duplicate and foreign progress and discards decode on save failure',async()=>{
 const old=globalThis.Image;globalThis.Image=ImageStub;
 try{
  const events=[],request={sessionId:'s',executionId:'e',unitId:'u',commit:{}},base={sessionId:'s',executionId:'e',unitId:'u',phase:'preview-ready',previews:[preview]};
  class Channel{}
  const execute=createNativeSessionExecutor({Channel,previewTarget:()=> 'node',invoke:async(command,args)=>{
   assert.equal(command,'execute_inspection_session');assert.equal(args.request.previewNodeId,'node');
   args.progress.onmessage({...base,executionId:'foreign',sequence:1});
   args.progress.onmessage({...base,sequence:2});args.progress.onmessage({...base,sequence:1});
   throw Error('ACTUAL_SAVE_FAILURE');
  }});
  await assert.rejects(execute(request,{onEvent:e=>events.push(e)}),/ACTUAL_SAVE_FAILURE/);
  assert.equal(events.length,1);assert.equal(ImageStub.images.at(-1).src,undefined);
 }finally{globalThis.Image=old;}
});
test('binary bridge imports full facts and attributes native encoding separately without subtracting it',async()=>{
 const response=result();response.runs[0].result={measurement:1.2345678901234567};
 response._responseEncoding={backend:'rust-json-once-v1',encodeNs:1234567,compactNs:900000,jsonEncodeNs:330000,releaseNs:321000,jsonBytes:1};
 const bytes=new TextEncoder().encode(JSON.stringify(response));
 class Channel{}
 const execute=createNativeSessionExecutor({Channel,invoke:async()=>bytes.buffer});
 const actual=await execute({sessionId:'s',executionId:'e',unitId:'u'});
 assert.deepEqual(actual.runs[0].result,response.runs[0].result);
 assert.ok(Object.isFrozen(actual.runs[0].result));
 assert.equal(actual.timing.nativeResponse.encodeMs,1.234567);
 assert.equal(actual.timing.nativeResponse.releaseMs,.321);
 assert.equal(actual.timing.nativeResponse.compactMs,.9);
 assert.equal(actual.timing.nativeResponse.jsonEncodeMs,.33);
 assert.equal(actual.timing.hostResponse.bytes,bytes.length);
 assert.equal(Object.hasOwn(actual,'_responseEncoding'),false);
 for(const parts of [{compactNs:-1,jsonEncodeNs:0},{compactNs:1234567,jsonEncodeNs:1},{compactNs:1},{jsonEncodeNs:1}]){
  const bad={...response,_responseEncoding:{backend:'rust-json-once-v1',encodeNs:1234567,releaseNs:321000,jsonBytes:1,...parts}};
  const frame=new TextEncoder().encode(JSON.stringify(bad));
  const executeBad=createNativeSessionExecutor({Channel,invoke:async()=>frame.buffer});
  await assert.rejects(executeBad({sessionId:'s',executionId:'e',unitId:'u'}),/SESSION_RESPONSE_TIMING_INVALID/);
 }
 const legacy={...response,_responseEncoding:{backend:'rust-json-once-v1',encodeNs:1234567,releaseNs:321000,jsonBytes:1}};
 const legacyBytes=new TextEncoder().encode(JSON.stringify(legacy));
 const executeLegacy=createNativeSessionExecutor({Channel,invoke:async()=>legacyBytes.buffer});
 assert.equal((await executeLegacy({sessionId:'s',executionId:'e',unitId:'u'})).timing.nativeResponse.encodeMs,1.234567);
 response._responseEncoding.encodeNs=-1;
 const invalid=new TextEncoder().encode(JSON.stringify(response));
 const broken=createNativeSessionExecutor({Channel,invoke:async()=>invalid.buffer});
 await assert.rejects(broken({sessionId:'s',executionId:'e',unitId:'u'}),/SESSION_RESPONSE_TIMING_INVALID/);
});

test('preparation observes each dispatched unit and its live identity guard before native invoke',async()=>{
 class Channel{};let valid=true;const observed=[];
 const executor=createNativeSessionExecutor({Channel,onStart:(request,{isCurrent})=>observed.push({unit:request.unitId,image:request.shared.workpieceUnit.imageIds[0],isCurrent}),invoke:async(_name,{request})=>{assert.equal(observed.at(-1).unit,request.unitId);return {runs:[],timing:{}};}});
 for(const id of ['one','two'])await executor({sessionId:id,executionId:'batch',unitId:id,shared:{workpieceUnit:{imageIds:[id+'-image']}}},{isCurrent:()=>valid});
 assert.deepEqual(observed.map(o=>o.image),['one-image','two-image']);assert.equal(observed[0].isCurrent(),true);valid=false;assert.equal(observed[1].isCurrent(),false);
});
