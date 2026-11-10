import {validateOperationEvidenceJustification} from './pipeline-evidence-contract.js';

const list=value=>Array.isArray(value)?value:[];
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const sources=new Set(['agent-proposal','human-input','operator-default','data-derived','not-supplied']);
const artifactType=artifact=>artifact.type==='json'?'evidence':artifact.type;

// This validates recorded structure and actual references, not the scientific truth
// of an author's rationale or an independently measured industrial accuracy.
export function auditAlgorithmProcedureTrace(run){
 const trace=run.procedureTrace;
 if(trace===undefined||trace?.schema==='agentcv-procedure-trace-1'&&Array.isArray(trace.nodes)&&trace.nodes.length===0)return {schema:'agentcv-procedure-evidence-audit-1',status:'UNDECOMPOSED',delivered:false,nodes:[],errors:[],scope:'未記錄內部程序單元；僅能查看整段程式，不能推定內部步驟已逐一審核。'};
 const errors=[],nodes=[],issue=(node,code,path,message,hint)=>errors.push({nodeId:node?.instanceId||'program',code,path,message,hint});
 if(trace?.schema!=='agentcv-procedure-trace-1'||!Array.isArray(trace.nodes)){issue(null,'PROCEDURE_TRACE_INVALID','procedureTrace','程序追蹤格式無效。','使用內建 procedure / step SDK 產生真實執行紀錄。');return {schema:'agentcv-procedure-evidence-audit-1',status:'DIAGNOSTIC_ONLY',delivered:false,nodes,errors};}
 const byId=new Map();
 for(const [index,node] of trace.nodes.entries()){
  if(!object(node)||typeof node.instanceId!=='string'||!node.instanceId||byId.has(node.instanceId)){issue(node,'PROCEDURE_INSTANCE_INVALID',`procedureTrace.nodes[${index}]`,'程序執行身份缺失或重複。','每次呼叫由 SDK 產生唯一 instanceId，保留重複執行與迴圈實例。');continue;}
  byId.set(node.instanceId,node);
 }
 const ancestorOf=(ancestor,child)=>{const seen=new Set();let node=byId.get(child);while(node?.parentInstanceId&&!seen.has(node.instanceId)){seen.add(node.instanceId);if(node.parentInstanceId===ancestor)return true;node=byId.get(node.parentInstanceId);}return false;};
 const artifactProducers=new Map();
 // The SDK includes descendant artifacts in a containing procedure. Only
 // unrelated producers conflict; the actual leaf remains artifact.traceNodeId.
 for(const [index,node] of trace.nodes.entries())for(const artifactId of list(node?.artifactIds)){const prior=artifactProducers.get(artifactId),owner=(run.artifacts||[]).find(a=>a.id===artifactId)?.traceNodeId;if(owner&&owner!==node.instanceId&&!ancestorOf(node.instanceId,owner)||prior&&prior!==node.instanceId&&!ancestorOf(prior,node.instanceId)&&!ancestorOf(node.instanceId,prior))issue(node,'PROCEDURE_ARTIFACT_MULTIPLE_PRODUCERS',`procedureTrace.nodes[${index}].artifactIds`,`產物 ${artifactId} 的所屬程序與實際 producer 不一致。`);else if(!prior||ancestorOf(prior,node.instanceId))artifactProducers.set(artifactId,node.instanceId);}
 for(const [index,node] of trace.nodes.entries()){
  if(!object(node))continue;
  const start=errors.length,base=`procedureTrace.nodes[${index}]`,nodeId=node.instanceId||`node-${index}`;
  if(node.parentInstanceId&&!byId.has(node.parentInstanceId))issue(node,'PROCEDURE_PARENT_MISSING',`${base}.parentInstanceId`,'父程序執行紀錄不存在。','保留完整執行追蹤，不以標籤推測父子關係。');
  if(!['procedure','step'].includes(node.kind)||!['SUCCEEDED','FAILED','SKIPPED'].includes(node.status))issue(node,'PROCEDURE_STATUS_INVALID',`${base}.status`,'程序種類或終止狀態無效。','已完成執行不能保留 RUNNING；NG/UNKNOWN 放 judgement 而非執行狀態。');
  if(node.judgement!==null&&node.judgement!==undefined&&!['OK','NG','UNKNOWN'].includes(node.judgement))issue(node,'PROCEDURE_JUDGEMENT_INVALID',`${base}.judgement`,'檢測判定無效。','使用 OK、NG、UNKNOWN；計算錯誤另外記錄 FAILED。');
  if(!object(node.parameters)||!object(node.outputs))issue(node,'PROCEDURE_VALUES_INVALID',base,'缺少程序的具名參數或實際輸出物件。','使用 parameters={} 與 set_output(name,value)，不要把宣告輸出冒充實算。');
  if(!Array.isArray(node.artifactIds)||node.artifactIds.some(id=>typeof id!=='string'||!(run.artifacts||[]).some(artifact=>artifact.id===id)))issue(node,'PROCEDURE_ARTIFACT_BINDING_INVALID',`${base}.artifactIds`,'程序引用的產物不存在或綁定格式無效。','由 save_image/save_json 記錄實際產物，不自造輸出ID。');
  for(const dependency of list(node.dependencyInstances)){const upstream=byId.get(dependency);if(!upstream||node.status==='SUCCEEDED'&&upstream.status!=='SUCCEEDED')issue(node,'PROCEDURE_DEPENDENCY_UNAVAILABLE',`${base}.dependencyInstances`,'依賴不存在或上游未成功，不能作為本步有效前提。','先修正並重算上游；前提不足應記錄跳過與原因。');}
  const owned=(run.artifacts||[]).filter(artifact=>list(node.artifactIds).includes(artifact.id)),declared=node.status==='SKIPPED'?list(node.justification?.tool?.expectedEvidence).filter(selector=>selector?.kind==='artifact').map(selector=>({id:selector.id,type:selector.type})):[],artifactChoices=[...owned.map(artifact=>({...artifact,type:artifactType(artifact)})),...declared];
  const checks=Array.isArray(node.outputs?.boundaryChecks)?node.outputs.boundaryChecks:[];
  const gates=node.status==='SKIPPED'?list(node.justification?.boundaries).filter(row=>row?.check?.kind==='gate').map(row=>row.check.id):checks.map(check=>check.id);
  const requiredParameters=Object.keys(node.parameters||{}).map(name=>({name,source:node.parameterSources?.[name]||'agent-proposal'}));
  for(const parameter of requiredParameters)if(!sources.has(parameter.source))issue(node,'PROCEDURE_PARAMETER_SOURCE_INVALID',`${base}.parameterSources.${parameter.name}`,'程序參數來源不在合約中。','來源是作者聲明，使用 agent-proposal/human-input/operator-default/data-derived/not-supplied 並提供真實證據。');
  const proposal=validateOperationEvidenceJustification(node.justification,{nodeId,requiredParameters,evidenceArtifacts:artifactChoices,gateIds:gates,allowVisuals:true,requireVisualPixels:node.status!=='SKIPPED',evidenceVisuals:run.evidenceVisuals||[]});
  errors.push(...proposal.errors.map(error=>({...error,path:error.path.replace(`operations.${nodeId}`,base)})));
  if(node.status==='FAILED')issue(node,'PROCEDURE_EXECUTION_FAILED',`${base}.status`,'此程序執行失敗，不能交付其檢測結果。','檢查 error/traceback，修正後重算；保留失敗歷史。');
  if(node.status==='SKIPPED'&&!node.skipReason)issue(node,'PROCEDURE_SKIP_REASON_REQUIRED',`${base}.skipReason`,'跳過程序缺少實際原因。','以 skip_step 或 run_step 保存條件／依賴不滿足的原因。');
  if(node.status==='SUCCEEDED'){
   const selectors=[...list(node.justification?.parameters).map(row=>({selector:row?.verification,path:`${base}.justification.parameters.${row?.name}.verification`})),...list(node.justification?.boundaries).map((row,i)=>({selector:row?.check,path:`${base}.justification.boundaries[${i}].check`}))];
   for(const {selector,path} of selectors)if(selector?.kind==='gate'){
    const check=checks.find(value=>value.id===selector.id);
    if(!check||check.status!=='PASS'||!Object.hasOwn(check,'actual')||!Object.hasOwn(check,'threshold'))issue(node,'PROCEDURE_BOUNDARY_NOT_ESTABLISHED',path,'步驟邊界未有 PASS、實際觀察值與比較條件。','在本步 outputs.boundaryChecks 保存 {id,status,actual,threshold}；FAIL/NOT_EVALUATED 保留為診斷，不補造成功。');
   }
  }
  nodes.push({nodeId,status:errors.length>start?'DIAGNOSTIC_ONLY':node.status==='SKIPPED'?'NOT_EXECUTED':'READY_FOR_REVIEW',delivered:false,errors:errors.slice(start)});
 }
 return {schema:'agentcv-procedure-evidence-audit-1',status:errors.length?'DIAGNOSTIC_ONLY':'READY_FOR_REVIEW',delivered:false,nodes,errors,scope:'程序執行結構及實際產物／邊界引用核對；不是獨立精度驗證或工業驗收。'};
}
