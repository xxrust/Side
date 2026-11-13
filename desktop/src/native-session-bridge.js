// The transport owns no workflow decisions. Progress is observed asynchronously;
// cancellation addresses the native run, including an abort before registration.
import {sealParsedNativeExecutionFacts} from './execution-facts.js';
import {beginNativePreviewPrefetch} from './native-preview-prefetch.js';
import {restoreSharedNativeFacts} from './shared-facts.js';
export function createNativeSessionExecutor({invoke,Channel,project,onStart=()=>{},previewTarget=()=>null}){
 return async(request,{signal,isCurrent=()=>true,onEvent=()=>{}}={})=>{
  const timeline=[],progress=new Channel(),previews=beginNativePreviewPrefetch();let finished=false,cancelling=false,cancelError=null,succeeded=false,sequence=0;
  const current=()=>{try{return isCurrent();}catch{return false;}};
  const cancel=()=>{
   if(finished||cancelling)return;
   cancelling=true;
   invoke('cancel_inspection_session',{sessionId:request.sessionId}).catch(error=>{cancelError=error;}).finally(()=>{cancelling=false;});
  };
  progress.onmessage=event=>{
   if(finished||event.sessionId!==request.sessionId||event.executionId!==request.executionId||event.unitId!==request.unitId||!Number.isSafeInteger(event.sequence)||event.sequence<=sequence)return;
   sequence=event.sequence;timeline.push([event.phase,performance.now()]);
   if(signal?.aborted||!current())cancel();
   else if(event.phase==='preview-ready')previews.stage(event.previews);
   onEvent(event);
  };
  const stop=()=>cancel();signal?.addEventListener('abort',stop,{once:true});
  const unsubscribe=project?.on?.(()=>{if(!current())cancel();})||(()=>{});
  try{
   onStart();const nodeId=previewTarget();const invokedAt=performance.now();const promise=invoke('execute_inspection_session',{request:{...request,...(nodeId?{previewNodeId:nodeId}:{})},progress});
   if(signal?.aborted||!current())cancel();
   const body=await promise,returnedAt=performance.now(),receivedWall=Date.now();   // The binary body is parsed here and privately owned. Freeze its facts in
   // place before import; non-binary executors keep the defensive copy path.
   let result=body;
   if(body instanceof ArrayBuffer){
    const started=performance.now(),text=new TextDecoder().decode(body),decoded=performance.now();
    result=JSON.parse(text);const parsed=performance.now();
    const shared=restoreSharedNativeFacts(result),restored=performance.now();
    sealParsedNativeExecutionFacts(result);const frozen=performance.now();
    result.timing.hostResponse={clock:'monotonic',bytes:body.byteLength,decodeMs:decoded-started,parseMs:parsed-decoded,restoreMs:restored-parsed,sharedLinks:shared.links,freezeMs:frozen-restored,totalMs:frozen-started,scope:'nested within whole-session dispatch; private binary response decode, JSON parse, lossless shared-fact restoration and execution-fact freezing'};
    if(result._responseEncoding){
     const encoding=result._responseEncoding;
     if(encoding.backend!=='rust-json-once-v1'||!['encodeNs','releaseNs','jsonBytes'].every(key=>Number.isSafeInteger(encoding[key])&&encoding[key]>=0)||encoding.jsonBytes>body.byteLength)throw Error('SESSION_RESPONSE_TIMING_INVALID');
     result.timing.nativeResponse={clock:'monotonic',backend:encoding.backend,encodeMs:encoding.encodeNs/1e6,releaseMs:encoding.releaseNs/1e6,jsonBytes:encoding.jsonBytes,sentAtMs:encoding.sentAtMs,transitMs:receivedWall-encoding.sentAtMs,scope:'nested within whole-session bridge; one JSON encoding and response tree release; excludes small metadata trailer, IPC and host processing'};
     delete result._responseEncoding;
    }
   }
   if(cancelError&&(signal?.aborted||!current()))throw Error('原生停止命令失败：'+String(cancelError?.message||cancelError));
   if(!signal?.aborted&&current()&&(!request.commit||result.commit?.receipt?.status==='SAVED'||request.commit.mode==='background'&&result.commit?.receipt?.status==='PENDING'&&result.commit.receipt.durable===false)){
    const summary=previews.complete(result);if(result.timing){result.timing.previewPrefetch=summary;result.timing.bridgeTimeline={clock:'monotonic',events:timeline.map(([phase,at])=>[phase,at-invokedAt]),invokeReturnMs:returnedAt-invokedAt,completedMs:performance.now()-invokedAt};}succeeded=true;
   }
   return result;
  }finally{finished=true;unsubscribe();signal?.removeEventListener('abort',stop);if(!succeeded)previews.dispose();}
 };
}
