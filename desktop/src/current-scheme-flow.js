import {recordedDuration} from './flow-node-presentation.js';
import {activeWorkpieceExecution,workpieceArtifactPixel,completedWorkpiece,retainedWorkpieceOutput} from './workpiece-live-state.js';
import {addWorkpieceBoundaries} from './workpiece-flow-boundaries.js';
import {aggregatePurposeStates} from './workpiece-lifecycle.js';
// Compose only the executions recorded by the current scheme acceptance. A
// declared edge alone is not evidence that data crossed between two executions.
import {buildProgramFlow,programFlowNode} from './program-flow.js';
import {schemeFingerprint} from './purpose-compiler.js';
import {algorithmRunCurrent} from './algorithm-workspace.js';
const list=value=>Array.isArray(value)?value:[];
const key=(runId,instanceId)=>`${runId}::${instanceId}`;
const unavailable=(reason,message)=>({available:false,reason,message});
function hydrateArtifacts(project,unitId,run){
 if(!run)return [];
 return list(run.artifacts).map(artifact=>{
  const dataURL=artifact.dataURL||artifact.dataUrl||workpieceArtifactPixel(project,unitId,run.runId,artifact.id);
  return dataURL?{...artifact,dataURL,dataUrl:dataURL}:artifact;
 });
}
function currentRun(project,data,run,basis){
 if(run.mode!=='scheme'||run.isDraft||run.sourceBinding?.schemeFingerprint!==basis)return false;
 if(typeof project.pixels?.get==='function'){try{return algorithmRunCurrent(project,run)}catch{return false}}
 return run.sourceBinding?.workflowRevision===data.workflow?.revision&&list(run.sourceBinding?.images).length>0&&run.sourceBinding.images.every(binding=>list(data.images).some(image=>image.id===binding.imageId&&image.sha256===binding.imageSha256&&image.width===binding.width&&image.height===binding.height));
}
function workpieceFlow(project,runId){
 const data=project.data||project,scheme=data.purposeScheme,basis=schemeFingerprint(scheme),executions=list(data.datasetExecutions).filter(e=>e.schemeFingerprint===basis),selection=project.inspectionSelection||data.inspectionSelection;
 const activeId=project.image?.id||data.activeId,selectedRecord=selection?.record;
 const live=activeWorkpieceExecution(project),liveCurrent=live?.schemeFingerprint===basis&&(!runId||list(live.runIds).includes(runId));
 const completed=completedWorkpiece(project),display=completed?.schemeFingerprint===basis?completed:null,retained=!runId?retainedWorkpieceOutput(project):null,latest=executions.at(-1);
 let execution,unit,displayRuns;
 if(liveCurrent){execution=executions.find(e=>e.id===live.executionId)||{id:live.executionId};unit={...live,execution:{status:'RUNNING'}};}
 else if(!runId&&display&&(retained?.unitId===display.record.unitId||latest?.id===display.executionId&&latest.processed>1)){
  // Auto advance prepares a different input. The graph still describes the
  // completed workpiece, including its measured times and evicted run rows.
  execution=executions.find(e=>e.id===display.executionId)||{id:display.executionId};unit=display.record;displayRuns=display.runs;
 }
 else {
  // A normal view belongs to the active workpiece. Only an explicit runId
  // requests history; merely opening a saved record must not override selection.
  const matches=u=>runId?list(u.runIds).includes(runId):list(u.imageIds).includes(retained?.imageId||activeId);
  execution=executions.findLast(e=>list(e.units).some(matches));
  unit=list(execution?.units).findLast(matches);
  if(unit&&selection?.executionId===execution.id&&selection?.unitId===unit.unitId&&selectedRecord?.unitId===unit.unitId&&selectedRecord.schemeFingerprint===basis&&matches(selectedRecord))unit={...unit,...selectedRecord};
 }
 const ids=list(unit?.runIds),runs=ids.map(id=>list(displayRuns||data.algorithmRuns).find(r=>r.runId===id&&r.sourceBinding?.schemeFingerprint===basis)).filter(Boolean);
 if(runId&&!ids.includes(runId))return unavailable('HISTORICAL_EXECUTION','這筆運算不屬於目前方案已記錄的單件，保留歷史實算。');
 const nodeTiming=(nodeId,run,observed)=>{
  const own=recordedDuration(run?.durationMs??observed?.execution?.durationMs);
  const prior=liveCurrent&&display&&display.record.unitId!==unit.unitId&&(!observed||['PENDING','DECLARED','RUNNING','VALID'].includes(observed.status))?display.runs.find(r=>r.schemeNodeId===nodeId):null;
  const previous=own===null?recordedDuration(prior?.durationMs):null;
  return {durationMs:own??previous,timingPrevious:previous!==null,timingUnitId:previous!==null?display.record.unitId:unit?.unitId||null,backend:run?.backend||run?.executionBackend||prior?.backend||null};
 };
 const declared=list(scheme.operatorGraph?.nodes),edges=list(scheme.operatorGraph?.edges),purposeStates=aggregatePurposeStates(declared,list(unit?.nodeStates).map(s=>({...s}))),nodes=declared.map(n=>{const run=runs.find(r=>r.schemeNodeId===n.id),observed=purposeStates.get(n.id),semantic=observed?.purposeStatus||(run&&(run.execution?.status==='FAULT'||run.status!=='SUCCEEDED')?'FAULT':run?.result?.valid===false?'NOT_FOUND':observed?.status||(run?'VALID':'DECLARED')),status=semantic==='VALID'?'SUCCEEDED':semantic==='PENDING'?'DECLARED':semantic==='SKIPPED'&&observed.reason==='BRANCH_NOT_SELECTED'?'BRANCH_NOT_SELECTED':semantic;return {id:'scheme::'+n.id,title:scheme.presentation?.nodeTitles?.[n.id]||n.title||n.id,kind:'procedure',parentId:n.parentId?'scheme::'+n.parentId:null,runId:run?.runId||null,status,reason:observed?.purposeReason||observed?.reason||run?.result?.code||null,executionState:semantic,...nodeTiming(n.id,run,observed),durationScope:declared.some(child=>child.parentId===n.id)?'own-program':'program',artifactMode:run?.artifactMode||run?.timing?.native?.artifactMode||null,judgement:null,definition:true,executed:!!run,actualNodeId:run?run.runId+'::run':null,evidenceAudit:run?.evidenceAudit||null,legacy:!!run&&!run.procedureTrace?.nodes?.length,schemeNodeId:n.id,justification:n.justification,documentation:n.documentation,parameters:n.parameters||{},artifacts:hydrateArtifacts(project,unit?.unitId,run),outputs:run?.result||{},code:n.code||'',scope:run?'本件真實節點實算':observed?'本件未執行：'+(observed.reason||semantic):'已宣告，未執行；僅方案定義／依據提案'};});
 const declaredEdges=edges.map((e,i)=>({...e,id:e.id||'declared-'+i,from:'scheme::'+e.from,to:'scheme::'+e.to,kind:'dependency',controlOnly:declared.find(n=>n.id===e.to)?.when?.nodeId===e.from&&!Object.values(declared.find(n=>n.id===e.to)?.inputs||{}).some(v=>v.nodeId===e.from),label:declared.find(n=>n.id===e.to)?.when?.nodeId===e.from?'當 '+declared.find(n=>n.id===e.to).when.status:Object.entries(declared.find(n=>n.id===e.to)?.inputs||{}).filter(([,v])=>v.nodeId===e.from).map(([slot,v])=>slot+' ← '+v.artifactId).join('、')||'前提',provenance:'declared-scheme-edge',executed:runs.some(r=>r.schemeNodeId===e.to&&Object.values(r.upstreamBindings||{}).some(b=>b.nodeId===e.from&&runs.some(parent=>parent.schemeNodeId===e.from&&parent.runId===b.runId)))}));
 const complete=addWorkpieceBoundaries({data,scheme,unit,runs,nodes,edges:declaredEdges});
 return {available:true,key:'workpiece-scheme:'+basis,unitId:unit?.unitId||null,executionId:execution?.id||null,live:!!liveCurrent,runIds:runs.map(r=>r.runId),flow:{schema:'agentcv-program-flow-1',unitId:unit?.unitId||null,executionId:execution?.id||null,live:!!liveCurrent,...complete,diagnostics:[],scope:'完整方案定義；節點狀態僅覆蓋選定工件，未走分支仍保留定義。'}};
}
export function buildCurrentSchemeFlow(project,{runId}={}){
 const data=project.data||project,scheme=data.purposeScheme;if(scheme?.execution?.unit==='workpiece')return workpieceFlow(project,runId);const acceptance=data.purposeAcceptance,ids=list(acceptance?.runIds);
 if(!scheme||!acceptance||!ids.length)return unavailable('NO_SCHEME_EXECUTION','尚無目前方案的完整執行紀錄。');
 if(runId&&!ids.includes(runId))return unavailable('HISTORICAL_EXECUTION','目前選取的是其他歷史運算，保留單次運算視圖。');
 const basis=schemeFingerprint(scheme);
 if(acceptance.status==='STALE'||acceptance.schemeFingerprint!==basis)return unavailable('STALE_SCHEME_EXECUTION','方案已改變；不將舊運算與目前方案連線混合。');
 if(new Set(ids).size!==ids.length)return unavailable('INVALID_SCHEME_RUN_IDS','目前方案的執行識別重複，無法組合。');
 const runs=ids.map(id=>list(data.algorithmRuns).find(run=>run.runId===id));
 if(runs.some(run=>!run))return unavailable('MISSING_SCHEME_EXECUTION','目前方案引用的真實運算紀錄缺失。');
 if(runs.some(run=>!currentRun(project,data,run,basis)))return unavailable('STALE_SCHEME_INPUT','目前方案運算的圖像或來源已失效，保留單次歷史紀錄供檢查。');
 const declared=list(scheme.operatorGraph?.nodes),nodeRuns=new Map();
 for(const run of runs){if(!declared.some(node=>node.id===run.schemeNodeId)||nodeRuns.has(run.schemeNodeId))return unavailable('INVALID_SCHEME_NODE_RUN','方案節點與當次運算識別不唯一。');nodeRuns.set(run.schemeNodeId,run);}
 const flow=buildProgramFlow(runs),diagnose=(code,message,extra={})=>flow.diagnostics.push({code,message,...extra});
 for(const node of declared)if(!nodeRuns.has(node.id))diagnose('SCHEME_NODE_NOT_EXECUTED','此方案節點未執行，不製造結果節點。',{schemeNodeId:node.id});
 for(const edge of list(scheme.operatorGraph?.edges)){
  const parent=nodeRuns.get(edge.from),child=nodeRuns.get(edge.to),childNode=declared.find(node=>node.id===edge.to);if(!parent||!child)continue;
  let verified=0;
  for(const [slot,input]of Object.entries(childNode?.inputs||{})){
   if(input?.nodeId!==edge.from)continue;
   const binding=child.upstreamBindings?.[slot],artifact=list(parent.artifacts).find(artifact=>artifact.id===input.artifactId);
   if(!binding||binding.nodeId!==parent.schemeNodeId||binding.runId!==parent.runId||binding.artifactId!==input.artifactId||!artifact){diagnose('SCHEME_UPSTREAM_MISMATCH','跨節點前提與實際轉交紀錄不一致，未畫成已發生的連線。',{fromNodeId:edge.from,toNodeId:edge.to,inputSlot:slot});continue;}
   const producer=artifact.traceNodeId&&programFlowNode(flow,key(parent.runId,artifact.traceNodeId)),parentProcedures=flow.nodes.filter(node=>node.runId===parent.runId&&node.kind==='procedure'&&node.parentId===key(parent.runId,'run')&&Object.hasOwn(node.declaredOutputs||{},artifact.id));
   const from=producer?.id||(parentProcedures.length===1?parentProcedures[0].id:key(parent.runId,'run'));
   const consumers=flow.nodes.filter(node=>node.runId===child.runId&&node.kind==='procedure'&&node.parentId===key(child.runId,'run')&&(node.inputs?.[slot]===parent.runId||node.inputs?.[slot]?.runId===parent.runId));
   const to=consumers.length===1?consumers[0].id:key(child.runId,'run');
   flow.edges.push({id:`scheme-input:${child.runId}:${slot}`,from,to,kind:'dependency',provenance:'verified-scheme-upstream',schemeFrom:edge.from,schemeTo:edge.to,fromRunId:parent.runId,toRunId:child.runId,inputSlot:slot,artifactId:artifact.id});verified++;
  }
  if(!verified)diagnose('SCHEME_EDGE_UNVERIFIED','方案已宣告此依賴，但沒有足夠的實際上游轉交紀錄，不推測已執行連線。',{fromNodeId:edge.from,toNodeId:edge.to});
 }
 Object.assign(flow,{scope:'current-scheme-executions',schemeFingerprint:basis,schemeRunIds:[...ids]});
 return {available:true,flow,key:'scheme:'+basis+':'+ids.join(':'),runIds:[...ids]};
}
