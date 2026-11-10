import {schemeFingerprint} from './purpose-compiler.js';
import {jsonSnapshot} from './json-snapshot.js';
import {effectiveAlgorithmRun} from './algorithm-evidence-revisions.js';
import {workpieceArtifactPixel} from './workpiece-live-state.js';
// An execution graph is an observation of saved code execution, not an inference
// from titles, source text, visual proximity, or whichever run is newest.
const clone=jsonSnapshot;
const asList=value=>Array.isArray(value)?value:[];
const key=(runId,instanceId)=>`${runId}::${instanceId}`;
const judgement=value=>['OK','NG','UNKNOWN'].includes(value)?value:null;
const status=value=>['RUNNING','SUCCEEDED','FAILED','SKIPPED','TIMEOUT'].includes(value)?value:'UNKNOWN';
const runsOf=value=>Array.isArray(value)?value:asList(value?.data?.algorithmRuns??value?.algorithmRuns);
const hydratedArtifacts=(project,run)=>asList(run.artifacts).map(artifact=>{
 const dataURL=artifact.dataURL||artifact.dataUrl||workpieceArtifactPixel(project,run.workpieceUnit?.id,run.runId,artifact.id);
 return dataURL?{...artifact,dataURL,dataUrl:dataURL}:artifact;
});

/** Build a readonly hierarchy plus actual control/data dependencies. The caller
 * can render contains edges as an expandable tree and dependency edges as arrows.
 * Repeated loop calls stay distinct through instanceId; they never form a fake
 * cycle by collapsing all calls into one procedure label. */
export function buildProgramFlow(projectOrRuns,{imageId,runId}={}){
 const project=projectOrRuns?.data?projectOrRuns:null;
 const runs=runsOf(projectOrRuns).map(effectiveAlgorithmRun).filter(run=>(!runId||run.runId===runId)&&(!imageId||asList(run.sourceBinding?.images).some(image=>image.imageId===imageId)));
 const nodes=[],edges=[],diagnostics=[],roots=[];
 const scheme=project?.data?.purposeScheme,basis=schemeFingerprint(scheme);
 for(const run of runs){
  const runNodeId=key(run.runId,'run'),artifacts=hydratedArtifacts(project,run),trace=run.procedureTrace;
  const observed=trace?.schema==='agentcv-procedure-trace-1'?asList(trace.nodes):[];
  const sourceImages=clone(asList(run.sourceBinding?.images));
  const root={id:runNodeId,runId:run.runId,stepId:null,instanceId:null,parentId:null,title:run.title||'算法程式',kind:'run',status:status(run.status),judgement:judgement(run.result?.judgement),backend:run.backend||run.executionBackend||null,artifacts:clone(artifacts),ownArtifacts:clone(artifacts.filter(a=>!a.traceNodeId)),evidenceVisuals:clone(run.evidenceVisuals||[]),justification:clone(run.justification)||null,documentation:(run.sourceBinding?.schemeFingerprint===basis?scheme?.operatorGraph?.nodes?.find(n=>n.id===run.schemeNodeId)?.documentation:undefined)??run.documentation,sourceImages,explanationRevision:run.explanationRevision||0,explanationScope:run.explanationScope||null,explanationParameterNotes:run.explanationParameterNotes||null,legacy:!observed.length,startedAt:run.startedAt,finishedAt:run.finishedAt,durationMs:run.durationMs,codeSha256:run.codeSha256||null,parameters:clone(run.parameters)||{},outputs:clone(run.result)||{},inputs:clone(run.sourceBinding)||{},error:clone(run.error)||null,inputImpact:clone(run.inputImpact)||null,evidenceAudit:clone(run.evidenceAudit)||null};
  nodes.push(root);roots.push(root.id);
  if(trace&&trace.schema!=='agentcv-procedure-trace-1')diagnostics.push({runId:run.runId,code:'UNSUPPORTED_TRACE',message:'程序追蹤格式未支援，僅顯示原始運算紀錄。'});
  const byInstance=new Map();
  for(const item of observed){
   if(typeof item?.instanceId!=='string'||!item.instanceId||byInstance.has(item.instanceId)){
    diagnostics.push({runId:run.runId,code:'INVALID_TRACE_INSTANCE',message:'步驟實例不存在或重複；未自行猜測步驟身份。'});continue;
   }
   byInstance.set(item.instanceId,item);
  }
  for(const item of byInstance.values()){
   let parent=item.parentInstanceId&&byInstance.has(item.parentInstanceId)?key(run.runId,item.parentInstanceId):runNodeId;
   const ancestors=new Set([item.instanceId]);let ancestor=byInstance.get(item.parentInstanceId);
   while(ancestor){
    if(ancestors.has(ancestor.instanceId)){
     parent=runNodeId;diagnostics.push({runId:run.runId,instanceId:item.instanceId,code:'CYCLIC_PARENT',message:'保存的父程序關係有循環，改列於原始運算下供核對。'});break;
    }
    ancestors.add(ancestor.instanceId);ancestor=byInstance.get(ancestor.parentInstanceId);
   }
   if(item.parentInstanceId&&!byInstance.has(item.parentInstanceId))diagnostics.push({runId:run.runId,instanceId:item.instanceId,code:'MISSING_PARENT',message:'保存紀錄缺少父程序；暫列在本次運算下。'});
   const own=artifacts.filter(a=>a.traceNodeId?a.traceNodeId===item.instanceId:asList(item.artifactIds).includes(a.id));
   const node={id:key(run.runId,item.instanceId),runId:run.runId,stepId:item.id,instanceId:item.instanceId,parentId:parent,title:item.name||item.id||'未命名步驟',kind:item.kind==='procedure'?'procedure':'step',status:status(item.status),judgement:judgement(item.judgement),backend:run.backend||run.executionBackend||null,inputs:clone(item.inputs),outputs:clone(item.outputs),declaredOutputs:clone(item.declaredOutputs),parameters:clone(item.parameters),parameterSources:clone(item.parameterSources),condition:clone(item.condition),skipReason:item.skipReason||null,error:clone(item.error)||null,justification:clone(item.justification)||null,documentation:item.documentation,sourceImages,evidenceVisuals:clone(run.evidenceVisuals||[]),explanationRevision:run.explanationRevision||0,explanationScope:run.explanationScope||null,explanationEvidenceGap:item.explanationEvidenceGap||null,explanationParameterNotes:run.explanationParameterNotes||null,artifacts:clone(own),ownArtifacts:clone(own),legacy:false,startedAt:item.startedAt,finishedAt:item.finishedAt,durationMs:item.durationMs,declaredDependencies:clone(asList(item.dependsOn)),codeSha256:run.codeSha256||null};
   node.evidenceAudit=clone(asList(run.evidenceAudit?.procedureAudit?.nodes).find(audit=>audit.nodeId===item.instanceId))||null;
   nodes.push(node);edges.push({id:`contains:${parent}:${node.id}`,from:parent,to:node.id,kind:'contains'});
   for(const instanceId of asList(item.dependencyInstances)){
    if(byInstance.has(instanceId))edges.push({id:`dependency:${run.runId}:${instanceId}:${item.instanceId}`,from:key(run.runId,instanceId),to:node.id,kind:'dependency'});
    else diagnostics.push({runId:run.runId,instanceId:item.instanceId,dependencyInstanceId:instanceId,code:'MISSING_DEPENDENCY',message:'實際依賴實例不存在，未以同名步驟代替。'});
   }
  }
  // Parent panels include descendant outputs, but ownArtifacts retains exact
  // authorship so image-to-step navigation resolves the innermost producer.
  const runNodes=nodes.filter(node=>node.runId===run.runId),byId=new Map(runNodes.map(node=>[node.id,node]));
  for(const node of runNodes.filter(node=>node.kind!=='run')){
   const visited=new Set([node.id]);let parent=byId.get(node.parentId);
   while(parent&&parent.kind!=='run'){
    if(visited.has(parent.id)){diagnostics.push({runId:run.runId,code:'CYCLIC_PARENT',message:'父程序關係有循環，停止展開。'});break;}
    visited.add(parent.id);
    for(const artifact of node.ownArtifacts)if(!parent.artifacts.some(a=>a.id===artifact.id))parent.artifacts.push(clone(artifact));
    parent=byId.get(parent.parentId);
   }
  }
  for(const artifact of artifacts)if(artifact.traceNodeId&&!byInstance.has(artifact.traceNodeId))diagnostics.push({runId:run.runId,artifactId:artifact.id,code:'MISSING_ARTIFACT_PRODUCER',message:'產物綁定的步驟不存在，保留在原始運算下。'});
 }
 return {schema:'agentcv-program-flow-1',nodes,edges,roots,diagnostics};
}

export function programFlowNode(flow,nodeId){return flow?.nodes?.find(node=>node.id===nodeId)||null;}

/** Reverse lookup requires exact saved provenance. Originals may lead to
 * several runs; output images never silently fall back to another run. */
export function programFlowForAsset(projectOrRuns,asset){
 const source=asset?.source||{},runs=runsOf(projectOrRuns);
 if(source.runId){
  const run=runs.find(run=>run.runId===source.runId);
  if(!run)return {nodes:[],unavailable:'此圖對應的算法運算紀錄不存在。'};
  const artifact=source.artifactId&&asList(run.artifacts).find(a=>a.id===source.artifactId);
  if(source.artifactId&&!artifact||source.codeSha256&&source.codeSha256!==run.codeSha256||source.artifactSha256&&source.artifactSha256!==artifact?.sha256)return {nodes:[],unavailable:'此圖的程式或產物來源不一致，未改用其他運算。'};
  const flow=buildProgramFlow([run]);
  const node=artifact?.traceNodeId&&programFlowNode(flow,key(run.runId,artifact.traceNodeId));
  return {flow,nodes:[node||programFlowNode(flow,key(run.runId,'run'))],artifactId:artifact?.id||null};
 }
 if(!source.imageId)return {nodes:[]};
 const matching=runs.filter(run=>asList(run.sourceBinding?.images).some(image=>image.imageId===source.imageId&&(!source.inputSha256||image.imageSha256===source.inputSha256)));
 const flow=buildProgramFlow(matching);
 return {flow,nodes:flow.roots.map(id=>programFlowNode(flow,id)),artifactId:null};
}
