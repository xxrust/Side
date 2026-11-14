// The transport owns no workflow decisions. Progress is observed asynchronously;
// cancellation addresses the native run, including an abort before registration.
import {sealParsedNativeExecutionFacts} from './execution-facts.js';
import {beginNativePreviewPrefetch} from './native-preview-prefetch.js';
import {restoreSharedNativeFacts} from './shared-facts.js';
import {createNativeInputVerification} from './native-input-verification.js';
export function createNativeSessionExecutor({invoke,Channel,project,onStart=()=>{},previewTarget=()=>null,previewMaxDimension=()=>null,deferProcedureTrace=false}){
 return async(request,{signal,isCurrent=()=>true,onEvent=()=>{},inputVerification}={})=>{
  const timeline=[],progress=new Channel(),previews=beginNativePreviewPrefetch();let finished=false,cancelling=false,cancelError=null,succeeded=false,sequence=0;
  const current=()=>{try{return isCurrent();}catch{return false;}};
  const cancel=()=>{
   if(finished||cancelling)return;
   cancelling=true;
   invoke('cancel_inspection_session',{sessionId:request.sessionId}).catch(error=>{cancelError=error;}).finally(()=>{cancelling=false;});
  };
  let inputGate=null;
  progress.onmessage=event=>{
   if(finished||event.sessionId!==request.sessionId||event.executionId!==request.executionId||event.unitId!==request.unitId||!Number.isSafeInteger(event.sequence)||event.sequence<=sequence)return;
   sequence=event.sequence;timeline.push([event.phase,performance.now()]);
   if(event.phase==='session-started')inputGate?.start();
   if(signal?.aborted||!current())cancel();
   else if(event.phase==='preview-ready')previews.stage(event.previews);
   onEvent(event);
  };
  const stop=()=>cancel();signal?.addEventListener('abort',stop,{once:true});
  const unsubscribe=project?.on?.(()=>{if(!current())cancel();})||(()=>{});
  try{
   inputGate=inputVerification===undefined?null:createNativeInputVerification({verification:inputVerification,expected:request.shared?.sourceBinding,isCurrent:current,signal,
   confirm:verification=>invoke('verify_inspection_session_input',{sessionId:request.sessionId,...verification}),onFailure:()=>cancel()});
   onStart(request,{isCurrent:current});const nodeId=previewTarget(),limit=previewMaxDimension();const invokedAt=performance.now();const promise=invoke('execute_inspection_session',{request:{...request,...(deferProcedureTrace&&request.commit?{deferProcedureTrace:true}:{}),...(import.meta.env?.VITE_INSPECTION_QA==='1'&&import.meta.env?.VITE_INSPECTION_QA_GC==='1'?{runtimeMaintenance:true}:{}),...(inputGate?{awaitInputVerification:true}:{}),...(nodeId?{previewNodeId:nodeId,...(Number.isSafeInteger(limit)&&limit>=64&&limit<=4096?{previewMaxDimension:limit}:{})}:{})},progress});
   if(signal?.aborted||!current())cancel();
   const body=await promise,returnedAt=performance.now(),receivedWall=Date.now();   // The binary body is parsed here and privately owned. Freeze its facts in
   // place before import; non-binary executors keep the defensive copy path.
   if(inputGate)await inputGate.complete();
   let result=body,maintenance;
   const startMaintenance=value=>{
    const ref=value.runtimeMaintenance;if(!ref)return;
    if(ref.kind!=='runtime-maintenance-v1'||ref.sessionId!==request.sessionId||ref.unitId!==request.unitId||typeof ref.id!=='string'||!Number.isSafeInteger(ref.pid)||ref.pid<=0||!Number.isSafeInteger(ref.call)||ref.call<=0)throw Error('MAINTENANCE_IDENTITY_MISMATCH');
    maintenance={ref,promise:invoke('await_inspection_maintenance',{reference:ref}).then(receipt=>({receipt}),error=>({error}))};
   };
   if(body instanceof ArrayBuffer){
    const started=performance.now(),text=new TextDecoder().decode(body),decoded=performance.now();
    result=JSON.parse(text);const parsed=performance.now();
    startMaintenance(result);const maintenanceStarted=performance.now();
    const shared=restoreSharedNativeFacts(result),restored=performance.now();
    sealParsedNativeExecutionFacts(result);const frozen=performance.now();
    result.timing.hostResponse={clock:'monotonic',bytes:body.byteLength,decodeMs:decoded-started,parseMs:parsed-decoded,maintenanceStartMs:maintenanceStarted-parsed,restoreMs:restored-maintenanceStarted,sharedLinks:shared.links,freezeMs:frozen-restored,totalMs:frozen-started,scope:'nested within whole-session dispatch; private binary response decode, JSON parse, lossless shared-fact restoration and execution-fact freezing'};
    if(result._responseEncoding){
     const encoding=result._responseEncoding;
     if(encoding.backend!=='rust-json-once-v1'||!['encodeNs','releaseNs','jsonBytes'].every(key=>Number.isSafeInteger(encoding[key])&&encoding[key]>=0)||encoding.jsonBytes>body.byteLength)throw Error('SESSION_RESPONSE_TIMING_INVALID');
     result.timing.nativeResponse={clock:'monotonic',backend:encoding.backend,encodeMs:encoding.encodeNs/1e6,releaseMs:encoding.releaseNs/1e6,jsonBytes:encoding.jsonBytes,sentAtMs:encoding.sentAtMs,transitMs:receivedWall-encoding.sentAtMs,scope:'nested within whole-session bridge; one JSON encoding and response tree release; excludes small metadata trailer, IPC and host processing'};
     if(encoding.compactNs!==undefined||encoding.jsonEncodeNs!==undefined){
      if(!['compactNs','jsonEncodeNs'].every(key=>Number.isSafeInteger(encoding[key])&&encoding[key]>=0)||encoding.compactNs+encoding.jsonEncodeNs>encoding.encodeNs)throw Error('SESSION_RESPONSE_TIMING_INVALID');
      Object.assign(result.timing.nativeResponse,{compactMs:encoding.compactNs/1e6,jsonEncodeMs:encoding.jsonEncodeNs/1e6,encodingPartsScope:'nested within encodeMs; never additive to bridge or cycle time'});
     }
     delete result._responseEncoding;
    }
   }
   if(!(body instanceof ArrayBuffer))startMaintenance(result);
   if(maintenance){
    const waiting=performance.now(),{receipt,error}=await maintenance.promise;if(error)throw error;
    const ref=maintenance.ref;
    if(!receipt||receipt.ok!==true||receipt.operation!=='collect-garbage'||receipt.id!==ref.id||receipt.pid!==ref.pid||receipt.call!==ref.call||!Number.isFinite(receipt.gcMs)||receipt.gcMs<0)throw Error('MAINTENANCE_RECEIPT_INVALID');
    result.timing||={};result.timing.runtimeMaintenance={...receipt,joinWaitMs:performance.now()-waiting,scope:'GC completion awaited before verified preview adoption and final result import; nested in whole-session bridge, never subtracted'};
    delete result.runtimeMaintenance;
   }
   if(cancelError&&(signal?.aborted||!current()))throw Error('原生停止命令失败：'+String(cancelError?.message||cancelError));
   if(!signal?.aborted&&current()&&(!request.commit||result.commit?.receipt?.status==='SAVED'||request.commit.mode==='background'&&result.commit?.receipt?.status==='PENDING'&&result.commit.receipt.durable===false)){
    const summary=previews.complete(result);if(result.timing){result.timing.previewPrefetch=summary;result.timing.bridgeTimeline={clock:'monotonic',events:timeline.map(([phase,at])=>[phase,at-invokedAt]),invokeReturnMs:returnedAt-invokedAt,completedMs:performance.now()-invokedAt};}succeeded=true;
   }
   return result;
  }finally{finished=true;inputGate?.dispose();unsubscribe();signal?.removeEventListener('abort',stop);if(!succeeded)previews.dispose();}
 };
}
