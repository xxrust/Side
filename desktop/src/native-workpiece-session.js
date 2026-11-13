import {prepareAlgorithmExecution,lockAlgorithmExecution} from './algorithm-workspace.js';
import {jsonDataEqual} from './json-data-equal.js';
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));

// Same prepared request and same import path as single-node execution. Only
// scheduling and the intermediate output-contract gate move into the host.
export async function runNativeWorkpieceSession(project,{nodes,scheme,unit,executionId,fingerprint,argsForNode,
 executeSession,signal,onEvent,productContext,commit,isCurrent=()=>true}){
 const sessionId=crypto.randomUUID(),prepared=new Map(),requests=[];
 for(const node of nodes){
  if(!isCurrent())throw Error('方案／專案在執行準備期間改變；停止派發。');
  const item=await prepareAlgorithmExecution(project,argsForNode(node),{deferUpstream:true});
  if(!item.request)throw Error('逐件執行不可使用歷史替代觀測');
  prepared.set(node.id,item);requests.push({nodeId:node.id,request:item.request});
 }
 const shared={};
 shared.compilation=clone(prepared.get(nodes[0].id).compilation);
 for(const item of prepared.values())if(!jsonDataEqual(item.compilation,shared.compilation))throw Error('逐件节点的编译方案不一致');
 // Large originals and the source/context are sent once for the workpiece.
 for(const key of ['images','sourceBinding','workpieceUnit','referenceInputs','inputContext']){
  shared[key]=requests[0].request[key];
  for(const row of requests){if(JSON.stringify(row.request[key])!==JSON.stringify(shared[key]))throw Error('逐件節點的原圖來源不一致');delete row.request[key];}
 }
 for(const row of requests){delete row.request.runtimePlan;delete row.request.upstream;}
 const request={sessionId,executionId,unitId:unit.id,fingerprint,scheme,shared,nodes:requests,evidenceAuditBackend:'rust-native-evidence-v1',runEnvelopeBackend:'rust-native-run-v1',...(productContext?{productContext}: {}),...(commit?{commit:{...commit,backend:'rust-native-commit-v1',unit:clone(unit)}}:{})};
 const dispatchStart=performance.now();let lastSequence=0;
 const release=lockAlgorithmExecution(project);let result;
 try{result=await executeSession(request,{signal,isCurrent,onEvent:event=>{
  if(event.sessionId!==sessionId||event.executionId!==executionId||event.unitId!==unit.id||!Number.isSafeInteger(event.sequence)||event.sequence<=lastSequence)return;
  lastSequence=event.sequence;if(isCurrent())onEvent?.(event);
 }});
 const dispatchMs=performance.now()-dispatchStart;
 if(!isCurrent())throw Error('方案／原圖／專案在執行期間改變；未採用舊工件結果。');
 if(result.sessionId!==sessionId||result.executionId!==executionId||result.unitId!==unit.id||!jsonDataEqual(result.sourceBinding,shared.sourceBinding))throw Error('原生工件回覆身份不一致');
 if(result.decision?.backend!=='rust-native'||!Array.isArray(result.decision.observations)||!result.decision.result||!result.decision.decisionEvidence)throw Error('原生工件缺少分类与判定依据');
 if(commit){
  const saved=result.commit,stamp=saved?.record?.nativeCommit,deferred=commit.mode==='background',receipt=saved?.receipt,ref=deferred?receipt?.archiveRef:receipt?.recordRef;
  const terminal=result.decision.cancelled?'CANCELLED':result.decision.faults.length?'FAULT':'COMPLETED';
  const acknowledged=deferred?receipt?.status==='PENDING'&&receipt.durable===false&&ref?.kind==='pending-inspection-unit'&&typeof ref.queueId==='string'&&Number.isSafeInteger(ref.archiveId):receipt?.status==='SAVED'&&(ref.kind===undefined||ref.kind==='inspection-unit')&&(ref.storage!=='workspace'||ref.kind==='inspection-unit')&&typeof ref.sha256==='string'&&/^[a-f0-9]{64}$/.test(ref.sha256);
  if(saved?.backend!=='rust-native-commit-v1'||!acknowledged||ref?.executionId!==executionId||ref?.unitId!==unit.id
   ||stamp?.backend!=='rust-native-commit-v1'||stamp.sessionId!==sessionId||stamp.verificationScope!=='native-before-browser-import'
   ||stamp.terminalStatus!==terminal||saved.record.execution?.status!==terminal||saved.record.schemeFingerprint!==fingerprint)throw Error('原生工件缺少身份一致的持久化确认');
 }
 const importStart=performance.now(),runs=[],runMap=new Map();
 for(const response of result.runs){
  const node=nodes.find(n=>n.id===response.schemeNodeId),item=node&&prepared.get(node.id);
  if(!item||runMap.has(node.id))throw Error('原生工件回傳重複或未知節點');
  const upstream={};
  for(const [slot,input]of Object.entries(node.inputs||{})){
   const parent=runMap.get(input.nodeId),artifact=parent?.artifacts.find(a=>a.id===input.artifactId);
   if(artifact)upstream[slot]={nodeId:input.nodeId,runId:parent.runId,artifact};
  }
  const run=item.complete(response,{nativeSession:true,upstream,deferPublication:true,stagedRuns:runs});
  if(run.nativeRunEnvelopeBackend!=='rust-native-run-v1'||!run.nativeRunEnvelopeParityChecked)throw Error('原生工件缺少经过对照的完整运行记录');
  if(run.nativeEvidenceAuditBackend!=='rust-native-evidence-v1'||!run.nativeEvidenceAuditParityChecked)throw Error('原生工件缺少经过对照的程序证据审计');
  // Both gates must agree before the imported result can be presented as a
  // successful native execution. Runtime and dispatch faults remain records.
  if(!jsonDataEqual(run.dataContractAudit.bindings,response.dataContractAudit.bindings)
   ||run.dataContractAudit.valid!==response.dataContractAudit.valid)throw Error('原生與前端輸出契約不一致');
  runs.push(run);runMap.set(node.id,run);
 }
 const nodeStates=clone(result.nodeStates);
 for(const state of nodeStates){const run=runMap.get(state.nodeId);if(run)state.evidenceStatus=run.evidenceAudit?.status;}
 let published=false;
 return {runs,nodeStates,decision:result.decision,commit:result.commit,publish:()=>{
  if(published)throw Error('原生工件不可重复发布');
  if(!isCurrent())throw Error('方案／原图／专案已改变；未发布先前工件');
  published=true;for(const run of runs)prepared.get(run.schemeNodeId).publish(run);
 },timing:{...result.timing,dispatchMs,importMs:performance.now()-importStart,
  bridgeMs:dispatchMs-result.timing.nativeMs-(result.timing.queueMs||0),scope:'whole-session native dispatch and host import; node native spans are nested'}};
 }finally{release();}
}
