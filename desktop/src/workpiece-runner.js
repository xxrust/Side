import {beginPendingInputPreparation} from './pending-input-preparation.js';
import {createWorkpieceInputPrefetch} from './workpiece-input-prefetch.js';
const qaPhase=phase=>{if(import.meta.env?.VITE_INSPECTION_QA==='1')globalThis.AgentCVDesktop?.qaExecutionPhase?.(phase);};
import {baselineRunOptions,currentAgreement} from './project-acceptance.js';
import {validateProjectScheme} from './scheme-validation.js';
import {buildDecisionEvidence} from './decision-evidence.js';
import {resolveWorkpieceExpected} from './workpiece-expected-label.js';
import {workpieceRegression,workpieceRecordFields} from './workpiece-product.js';
import {publishWorkpieceExecution,clearWorkpieceExecution,beginWorkpieceArtifactPixels,captureWorkpieceArtifactPixels,publishCompletedWorkpiece} from './workpiece-live-state.js';
import {aggregatePurposeStates} from './workpiece-lifecycle.js';
import {scheduleWorkpieceNodes,nodeRunState as state} from './workpiece-node-scheduler.js';
import {runNativeWorkpieceSession} from './native-workpiece-session.js';
import {PipelineEvidenceContractError} from './pipeline-evidence-contract.js';
import {createClassificationMetrics,updateClassificationMetrics,finalizeClassificationMetrics} from './classification-metrics.js';
import {compileScheme,schemeFingerprint} from './purpose-compiler.js';
import {algorithmExecutionContext as algorithmContext,runAlgorithm,beginCompiledSession} from './algorithm-workspace.js';
import {classifyWorkpiece} from './classification-spec.js';
import {DEFAULT_BATCH_ARTIFACT_RETENTION,normalizeArtifactRetention,retainDatasetArtifacts,datasetArtifactRetentionDecision,applyDatasetArtifactRetention} from './artifact-retention.js';
import {immutableJson,projectSnapshot,isImmutableJson} from './json-snapshot.js';
import {jsonDataEqual} from './json-data-equal.js';
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const executionError=error=>({type:error?.name||'Error',message:String(error?.message||error)});
const path=(v,p)=>String(p).split('.').reduce((a,k)=>a?.[k],v);
// Used by production and the native durable-product migration oracle. Browser
// and native callers supply their own actual timing observation and timestamp.
export function assembleWorkpieceRecord({recordFields,faults,cancelled,result,runs,observations,nodeStates,timing,at}){
 return {...recordFields,execution:{status:cancelled?'CANCELLED':faults.length?'FAULT':'COMPLETED',faults},result,evidenceReady:runs.length>0&&!cancelled&&!faults.length&&runs.every(r=>r.evidenceAudit?.status==='READY_FOR_REVIEW'&&r.evidenceAudit?.procedureStatus==='READY_FOR_REVIEW'),observations,nodeStates,timing,at};
}
export function workpieceObservations(scheme,nodeStates,runMap){
 return scheme.classificationSpec.metrics.map(metric=>{const bindings=scheme.metricBindings.filter(b=>b.metric===metric.id),candidates=bindings.map(b=>{const run=runMap.get(b.nodeId),s=nodeStates.find(s=>s.nodeId===b.nodeId)?.status||state(run),value=path(run?.result,b.path);return {metric:metric.id,value:s==='VALID'&&value!==undefined&&value!==null?value:null,valid:s==='VALID'&&value!==undefined&&value!==null,status:s==='VALID'&&value!==undefined&&value!==null?'MEASURED':s==='NOT_FOUND'?'NOT_FOUND':s==='SKIPPED'?'SKIPPED':'MISSING',nodeId:b.nodeId,runId:run?.runId};});return candidates.find(c=>c.valid)||candidates.find(c=>c.status==='NOT_FOUND')||candidates[0]||{metric:metric.id,status:'MISSING'};});
}
const datasetLocks=new WeakSet();
const id=()=>globalThis.crypto?.randomUUID?.()||`inspection-${Date.now()}-${Math.random().toString(16).slice(2)}`;
function summarize(values){if(!values.length)return {count:0,mean:null,p50:null,p95:null,max:null};const sorted=[...values].sort((a,b)=>a-b);return {count:sorted.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p50:sorted[Math.ceil(sorted.length*.5)-1],p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1)};}
const durableLiveRuns=new WeakMap();
const containsUnit=(value,units)=>{if(!value||typeof value!=='object')return false;if(Array.isArray(value))return value.some(v=>containsUnit(v,units));if(typeof value.unit==='string'&&units.has(value.unit))return true;return Object.values(value).some(v=>containsUnit(v,units));};
export function schemeRequiresPhysicalCalibration(scheme){return scheme?.imagingConstraintCard?.calibrationRequired===true||containsUnit(scheme?.classificationSpec,new Set(['mm','m']))||containsUnit(scheme?.operatorGraph,new Set(['mm','m']));}
export function pinnedAlgorithmRuns(project){
 const state=project.data.visualInquiry||{},assets=new Map((state.assets||[]).map(a=>[a.id,a])),pinned=new Set();
 const take=id=>{if(typeof id==='string'&&id)pinned.add(id);};
 for(const board of state.boards||[]){
  // A bound program board is created on an explicit node selection. Merely
  // generating an artifact in a batch is not an implicit retention request.
  take(board.programBinding?.runId);
  for(const group of board.artifactGroups||[])take(group.runId);
  for(const label of board.imageLabelBubbles||[])take(label.runId);
  for(const ref of [...(board.layerReferences||[]),...(board.layerOverrides||[])])take(ref.runId);
  for(const item of board.items||[])if(item.author==='human'||item.layout?.pinned||item.annotations?.some(a=>a.author==='human')||item.geometryTools?.some(t=>t.author==='human'))take(assets.get(item.assetId)?.source?.runId);
 }
 for(const relation of project.data.canvasRelations||[])if(relation.author==='human'){
  const board=(state.boards||[]).find(b=>b.id===relation.boardId);for(const itemId of [relation.fromItemId,relation.toItemId]){const item=board?.items?.find(i=>i.id===itemId);if(item)take(assets.get(item.assetId)?.source?.runId);}
 }
 for(const thread of project.data.canvasThreads||[])for(const snapshot of [thread.snapshot,...(thread.turns||[]).map(t=>t.snapshot)])for(const item of snapshot?.items||[])take(item.asset?.source?.runId);
 for(const c of project.data.acceptanceWorkspace?.cases||[])if(!c.record?.recordRef)for(const runId of c.record?.runIds||[])take(runId);
 // A pinned downstream result must keep its actual upstream producer records
 // for image/layer/explanation links, without retaining unrelated runs.
 const byId=new Map((project.data.algorithmRuns||[]).map(r=>[r.runId,r])),pending=[...pinned];
 while(pending.length){const run=byId.get(pending.pop());for(const input of Object.values(run?.upstreamBindings||{})){if(input?.runId&&!pinned.has(input.runId)){pinned.add(input.runId);pending.push(input.runId);}}}
 return pinned;
}
function defaultSourceImageIds(project,sourceId){if(sourceId)return undefined;const sources=(project.data.visualInquiry?.boards||[]).flatMap(b=>b.projectSpaces?.sources||[]);return sources.length?[...new Set(sources.flatMap(s=>s.imageIds))]:undefined;}
async function* unitsFrom(project,options){
 if(options.units){for await(const unit of options.units)yield unit;return;}
 const references=new Set(Object.values(project.data.purposeScheme.execution.referenceInputs||{})),imageIds=defaultSourceImageIds(project,options.sourceId);let offset=0;while(true){const page=project.listImageRecords?.({offset,limit:128,sourceId:options.sourceId,imageIds}),rows=page?(Array.isArray(page)?page:page.items):project.data.images.slice(offset,offset+128);if(!rows.length)return;for(const image of rows)if(!references.has(image.id))yield {id:image.id,imageIds:[image.id]};offset+=rows.length;}
}
function defaultWorkpieceCount(project,sourceId){
 const imageIds=defaultSourceImageIds(project,sourceId),members=imageIds?new Set(imageIds):null,total=project.listImageRecords?project.listImageRecords({offset:0,limit:1,sourceId,imageIds}).total:project.data.images.length,refs=new Set(Object.values(project.data.purposeScheme.execution.referenceInputs||{})),sourceSets=(project.data.visualInquiry?.boards||[]).flatMap(b=>b.projectSpaces?.sources||[]).filter(s=>s.id===sourceId),removed=[...refs].filter(id=>project.imageRecord?.(id)&&(!members||members.has(id))&&(!sourceId||(sourceSets.length?sourceSets.some(s=>s.imageIds.includes(id)):project.imageRecord(id).sourceId===sourceId))).length;
 return Math.max(0,total-removed);
}
export async function runDatasetScheme(project,execute,options={}){
 if(options.expectedSchemeFingerprint&&schemeFingerprint(project.data.purposeScheme)!==options.expectedSchemeFingerprint)throw Error('目前方案與指定診斷紀錄不同；未以新方案冒充同條件重跑');
 if(options.baselineId)options={...options,...baselineRunOptions(project,options.baselineId,{actor:options.baselineActor})};
 qaPhase('runner-validation-start');
 const compilation=validateProjectScheme(project,project.data.purposeScheme,{mode:'scheme'});
 qaPhase('runner-validation-complete');
 if(!compilation.ok){const error=Error('方案未編譯：先讀errors/questions補齊分類、前提、依據。');error.code='SCHEME_COMPILE_FAILED';error.audit=compilation;throw error;}
 if(project.data.purposeScheme?.execution?.unit!=='workpiece')throw Error('逐件runner需要execution.unit=workpiece；舊方案請使用legacy入口。');
 if(schemeRequiresPhysicalCalibration(project.data.purposeScheme)){
  const refs=new Set(Object.values(project.data.purposeScheme?.execution?.referenceInputs||{}));
  const sourceSets=(project.data.visualInquiry?.boards||[]).flatMap(board=>board.projectSpaces?.sources||[]);
  const scopedIds=Array.isArray(options.units)
    ? new Set(options.units.flatMap(unit=>unit?.imageIds||[]))
    : options.sourceId
      ? new Set(sourceSets.find(source=>source.id===options.sourceId)?.imageIds||((project.data.images||[]).filter(image=>image.sourceId===options.sourceId).map(image=>image.id)))
      : new Set(defaultSourceImageIds(project,null)||((project.data.images||[]).map(image=>image.id)));
  const invalid=(project.data.images||[]).filter(image=>scopedIds.has(image.id)&&!refs.has(image.id)).map(image=>({imageId:image.id,name:image.name,calibration:project.scale(image.id)})).filter(row=>row.calibration?.status!=='VALID');
  if(invalid.length){const error=Error('方案需要已確認的實測標定；目前至少一張輸入仍是 UNKNOWN 或只有理論比例，已阻止毫米判定。');error.code='CALIBRATION_REQUIRED';error.details={required:'VALID',invalid};throw error;}
 }
 if(datasetLocks.has(project))throw Error('本專案已有逐件檢測正在執行，請先完成或取消。');
 datasetLocks.add(project);let inputUnits;
 try{
 const scheme=clone(project.data.purposeScheme),basis=schemeFingerprint(scheme),epoch=project.epoch,selectionRevision=project.imageSelection??0,workflowRevision=project.workflow.revision,byNode=new Map(scheme.operatorGraph.nodes.map(n=>[n.id,n])),nodes=compilation.order.map(id=>byNode.get(id));
 // Start only compilation, after validation/locking. Its wait remains inside
 // the first click-to-completion interval and can overlap checkpoint copying.
 let programPreparation=null;
 if(options.preparePrograms){
  qaPhase('runner-program-preparation-start');
  try{programPreparation=Promise.resolve(options.preparePrograms(scheme)).then(value=>({ready:true,value}),error=>({ready:false,error:String(error?.message||error)}));}
  catch(error){programPreparation=Promise.resolve({ready:false,error:String(error?.message||error)});}
 }
 const total=options.total??(Array.isArray(options.units)?options.units.length:options.units?null:defaultWorkpieceCount(project,options.sourceId));
 // Generic callers keep the historical full evidence behavior. The desktop
 // batch entry point opts into the bounded diagnostic policy explicitly.
 const artifactRetention=normalizeArtifactRetention(options.artifactRetention,options.artifactRetention?DEFAULT_BATCH_ARTIFACT_RETENTION:{...DEFAULT_BATCH_ARTIFACT_RETENTION,mode:'all'});
 const resumeEntry=options.resumeExecutionId?(project.data.datasetExecutions||[]).find(candidate=>candidate.id===options.resumeExecutionId):null;
 if(options.resumeExecutionId&&(!resumeEntry||resumeEntry.schemeFingerprint!==basis||resumeEntry.sourceId!==(options.sourceId||null)))throw Error('指定的資料集執行不存在，或與目前方案／圖像源不一致，不能續跑。');
 const entry=resumeEntry?(isImmutableJson(resumeEntry)?{...clone({...resumeEntry,units:undefined,schemeSnapshot:undefined}),units:resumeEntry.units.slice(),schemeSnapshot:resumeEntry.schemeSnapshot}:projectSnapshot(resumeEntry)):{schema:'agentcv-dataset-execution-1',evidenceContract:'per-operator-triad-and-timing-1',timingRequirement:clone(scheme.execution?.timingRequirement||null),id:id(),schemeFingerprint:basis,sourceId:options.sourceId||null,status:'RUNNING',processed:0,total,units:[],artifactRetention,artifactRetentionSummary:{units:0,imageArtifacts:0,retainedImageArtifacts:0,metadataOnlyImageArtifacts:0,fullPixelUnits:0},counts:{execution:{COMPLETED:0,FAULT:0,CANCELLED:0},categories:Object.fromEntries(scheme.classificationSpec.categories.map(c=>[c.id,0])),exits:{FAULT:0,CANCELLED:0,...Object.fromEntries(scheme.classificationSpec.categories.map(c=>['PRODUCT:'+c.id,0]))},evidence:{ready:0,notReady:0},regression:createClassificationMetrics(scheme.classificationSpec.categories)},startedAt:new Date().toISOString(),retention:options.saveUnitResult?'durable-unit-records':'project-memory',cancellationPolicy:'between-node; active worker finishes or its configured timeout terminates it',humanConfirmed:false,delivered:false};
 if(resumeEntry){entry.status='RUNNING';entry.total=entry.total??total;entry.startedAt=new Date().toISOString();delete entry.finishedAt;delete entry.error;delete entry.activeUnit;entry.retention=options.saveUnitResult?'durable-unit-records':entry.retention;}
 // One user-level undo boundary. Internal node records are durable observations,
 // not a reason to clone the entire dataset into undo once per workpiece.
 entry.schemeSnapshot=immutableJson(scheme);
 if(options.baselineId){entry.baselineId=options.baselineId;entry.acceptanceAgreementId=currentAgreement(project)?.id||null;entry.baselineActor=options.baselineActor;}
 inputUnits=createWorkpieceInputPrefetch(project,unitsFrom(project,options),{enabled:options.prefetchInputs===true&&(!options.units||Array.isArray(options.units)),deferPreparation:options.deferInputPrefetch,signal:options.signal,isCurrent:()=>project.epoch===epoch&&project.workflow.revision===workflowRevision&&schemeFingerprint(project.data.purposeScheme)===basis});
 if(!resumeEntry)await inputUnits.prime();
 if(project.epoch!==epoch||project.workflow.revision!==workflowRevision||schemeFingerprint(project.data.purposeScheme)!==basis)throw Error('方案／專案在批次準備期間改變；停止派發。');
 qaPhase('runner-checkpoint-start');project.checkpoint();qaPhase('runner-checkpoint-complete');
 if(programPreparation){
  entry.programPreparation=await programPreparation;qaPhase('runner-program-preparation-complete');
  if(project.epoch!==epoch||project.workflow.revision!==workflowRevision||schemeFingerprint(project.data.purposeScheme)!==basis)throw Error('方案／專案在程式準備期間改變；停止派發。');
 }

 project.data.datasetExecutions||=[];if(resumeEntry)project.data.datasetExecutions[project.data.datasetExecutions.indexOf(resumeEntry)]=entry;else project.data.datasetExecutions.push(entry);
 let timeSum=0,timeMax=0,cycleSum=0,cycleMax=0;const cycles=[];
 const started=performance.now(),times=[],releaseSession=beginCompiledSession(project,compilation);let latestUnitRunIds=durableLiveRuns.get(project)?.epoch===epoch?durableLiveRuns.get(project).ids:[];const pendingEviction=new Set();
 const emit=()=>{if(entry.status!=='RUNNING')finalizeClassificationMetrics(entry.counts.regression);entry.timing={clock:'monotonic',elapsedMs:performance.now()-started,unitMs:entry.status==='RUNNING'?{count:times.length,mean:times.length?timeSum/times.length:null,p50:null,p95:null,max:times.length?timeMax:null}:summarize(times),cycleMs:entry.status==='RUNNING'?{count:cycles.length,mean:cycles.length?cycleSum/cycles.length:null,p50:null,p95:null,max:cycles.length?cycleMax:null}:summarize(cycles),cycleIncludesDurableSave:!!options.saveUnitResult&&options.nativeCommit?.mode!=='background',cycleScope:options.nativeCommit?.mode==='background'?'unit-start to classification and owned archive queue admission; excludes background archival and subsequent UI presentation':'unit-start to durable-save completion (or classification completion without durable save); excludes subsequent UI presentation',scope:'batch wall elapsed including host callbacks and inter-unit UI work; not a sum of operator durations',includes:['image-read','node-dispatch','algorithm','artifact-verification','unit-save','host-callbacks-and-inter-unit-UI'],excludes:['Agent-planning']};project.event('dataset_execution_progress',{executionId:entry.id,status:entry.status,processed:entry.processed,total:entry.total,counts:clone(entry.counts)});options.onProgress?.({...entry,units:entry.units.slice(-1),counts:clone(entry.counts),timing:clone(entry.timing),activeUnit:clone(entry.activeUnit)});};
 try{
  for await(const unit of inputUnits){
   if(resumeEntry&&entry.units.some(saved=>saved.unitId===unit.id))continue;
   if(options.signal?.aborted){entry.status='CANCELLED';break;}
   if(project.epoch!==epoch||project.workflow.revision!==workflowRevision||schemeFingerprint(project.data.purposeScheme)!==basis)throw Error('方案／專案在批次執行期間改變；已保存單件仍保留，停止派發。');
   const imageIds=unit.imageIds||Object.values(unit.views||{});
   if(import.meta.env?.VITE_INSPECTION_QA==='1')globalThis.AgentCVDesktop?.qaWorkpieceStarted?.({executionId:entry.id,unitId:unit.id,imageIds});
   if(!unit.id||!Array.isArray(imageIds)||!imageIds.length||new Set(imageIds).size!==imageIds.length)throw Error('單件需要穩定id及不重複imageIds；多視圖只能屬於同一工件。');
   if(scheme.execution.inputSlots.length>1){if(!unit.views||scheme.execution.inputSlots.some(s=>s.required&&!unit.views[s.id])||Object.values(unit.views).some(imageId=>!imageIds.includes(imageId)))throw Error('同件多視圖需views:{slotId:imageId}，不得把資料集誤當多視圖。');}
   else if(imageIds.length!==1)throw Error('單視圖方案每件只能一張圖；多視圖須先聲明inputSlots並提供views。');
   // Keep the completed display until the next unit has a verified replacement.
   beginWorkpieceArtifactPixels(project,unit.id,{preserveDisplay:true});
   const referenceInputs=scheme.execution.referenceInputs||{},referenceIds=[...new Set(Object.values(referenceInputs))],inputIds=[...new Set([...imageIds,...referenceIds])];
   let releaseInputs=()=>{},inputFault=null,pendingInputs=null,inputVerification,inputVerificationError=null,inputVerificationMs=null,nativeInputCancelled=false;
   const expectedResolution=resolveWorkpieceExpected(project,unit,scheme);
   const referenceIdentities=Object.fromEntries(Object.entries(referenceInputs).map(([slot,id])=>[slot,project.imageIdentity?.(id)||{imageId:id}]));
   let publishMs=0,inputReadMs=0,nativeSessionTiming=null,nativeDecision=null,nativeCommit=null,publishNativeRuns=null;const unitStart=performance.now(),runMap=new Map(),nodeStates=[],runs=[];
   const publish=(phase,currentNodeId=null)=>{const publishStart=performance.now();const states=nodes.map(n=>clone(nodeStates.find(s=>s.nodeId===n.id)||{nodeId:n.id,status:n.id===currentNodeId?'RUNNING':'PENDING'}));aggregatePurposeStates(scheme.operatorGraph.nodes,states);const live={selectionRevision,executionId:entry.id,schemeFingerprint:basis,unitId:unit.id,imageIds:clone(imageIds),views:clone(unit.views||null),referenceInputs:clone(referenceInputs),nodeStates:states,runIds:runs.map(r=>r.runId),phase,currentNodeId};entry.activeUnit=live;publishWorkpieceExecution(project,live);project.event('workpiece_execution_progress',{executionId:entry.id,unitId:unit.id,phase,nodeId:currentNodeId});options.onNodeProgress?.(clone(live));publishMs+=performance.now()-publishStart;};
   const recordNodeState=value=>{nodeStates.push(value);publish('node-completed');};
   qaPhase('runner-unit-start');publish('unit-started');
   try{
   const inputReadStart=performance.now();
   try{if(referenceIds.some(id=>imageIds.includes(id)))throw Error('固定參考圖不可同時當作本件待檢圖；請分開referenceInputs與工件圖像源。');releaseInputs=project.pinImages?.(inputIds)||(()=>{});
    if(options.parallelInputVerification===true&&options.executeSession&&options.fileBackedInputs===true&&project.ensureImagePixels&&nodes.every(n=>!n.nativePlan)&&inputIds.some(id=>!project.pixels.has(id)))pendingInputs=beginPendingInputPreparation(project,inputIds);
    const load=async()=>{if(project.ensureImagePixels)for(const imageId of inputIds)await project.ensureImagePixels(imageId);};
    if(pendingInputs){
     const expected=algorithmContext(project,{imageIds:inputIds,inputPreparation:pendingInputs.token}).source;
     inputVerification=load().then(()=>{
      const actual=algorithmContext(project,{imageIds:inputIds}).source;
      if(!jsonDataEqual(actual,expected))throw Error('原圖核驗後身分改變，未採用預先派發結果');
      inputVerificationMs=performance.now()-inputReadStart;qaPhase('runner-input-ready');return actual;
     }).catch(error=>{inputVerificationError=error;throw error;});
     inputVerification.catch(()=>{});
    }else await load();
   }
   catch(error){if(project.epoch!==epoch)throw error;inputFault={phase:'input-read',status:'FAULT',reason:'INPUT_UNAVAILABLE',imageIds:clone(imageIds),error:executionError(error),durationMs:performance.now()-unitStart};}
   inputReadMs=performance.now()-inputReadStart;if(!pendingInputs)qaPhase('runner-input-ready');else qaPhase('runner-input-verification-overlapped');
   const argsForNode=(node,upstream={})=>{const context=algorithmContext(project,{imageIds:inputIds,inputPreparation:pendingInputs?.token});return {mode:'scheme',scheme_node_id:node.id,title:node.title||node.id,code:node.code,parameters_json:JSON.stringify(node.parameters||{}),source:context.source,image_ids:inputIds,referenceInputs,upstream,documentation:node.documentation,justification:{...clone(node.justification),meta:{...clone(node.justification?.meta),sourceFingerprint:context.sourceFingerprint}},expected_outputs:node.expected_outputs,fileBackedInputs:options.fileBackedInputs===true,...(pendingInputs?{inputPreparation:pendingInputs.token}:{}),procedureValueCapture:options.artifactMode==='inspection'&&options.diagnostics!==true?'essential':'full',artifactMode:options.artifactMode|| (options.saveUnitResult?'references':'inline'),workpieceUnit:{id:unit.id,imageIds,views:unit.views||null}};};
   if(options.executeSession&&!inputFault){
    const sourceBefore=JSON.stringify(algorithmContext(project,{imageIds:inputIds,inputPreparation:pendingInputs?.token}).source);
    try{const native=await runNativeWorkpieceSession(project,{nodes,scheme,unit,executionId:entry.id,fingerprint:basis,argsForNode,
     executeSession:(...args)=>{const result=options.executeSession(...args);inputUnits.start();return result;},signal:options.signal,
     inputVerification,commit:options.saveUnitResult?options.nativeCommit:undefined,
     productContext:{expectedResolution:clone(expectedResolution),referenceIdentities,regressionCategoryIds:Object.keys(entry.counts.regression.perCategory),retention:artifactRetention,unitIndex:entry.processed,total:entry.total},
     isCurrent:()=>project.epoch===epoch&&project.workflow.revision===workflowRevision&&schemeFingerprint(project.data.purposeScheme)===basis&&JSON.stringify(algorithmContext(project,{imageIds:inputIds,inputPreparation:pendingInputs?.token}).source)===sourceBefore,
     onEvent:event=>{if(event.phase==='node-started')publish(event.phase,event.nodeId);else if(event.phase==='node-completed'){nodeStates.push(event.state);publish(event.phase);}}
    });
    nodeStates.splice(0,nodeStates.length,...native.nodeStates);runs.push(...native.runs);for(const run of runs)runMap.set(run.schemeNodeId,run);
    nativeSessionTiming=native.timing;if(pendingInputs)nativeSessionTiming.inputVerification={elapsedMs:inputVerificationMs,overlapped:true,scope:'browser input verification overlaps native dispatch; not additive'};nativeDecision=native.decision;nativeCommit=native.commit;publishNativeRuns=native.publish;publish('nodes-completed');
    }catch(error){
     if(project.epoch!==epoch)throw error;
     if(pendingInputs&&options.signal?.aborted){nativeInputCancelled=true;nodeStates.splice(0);}
     else {if(!inputVerificationError)throw error;
     nodeStates.splice(0);inputFault={phase:'input-read',status:'FAULT',reason:'INPUT_UNAVAILABLE',imageIds:clone(imageIds),error:executionError(inputVerificationError),durationMs:performance.now()-unitStart};}
    }
   }
   if(!options.executeSession||inputFault||nativeInputCancelled)await scheduleWorkpieceNodes({nodes,graph:scheme.operatorGraph,nodeStates,runMap,runs,inputFault,
    cancelled:()=>options.signal?.aborted,onNodeStart:node=>publish('node-started',node.id),recordNodeState,
    isFatalError:error=>error instanceof PipelineEvidenceContractError||project.epoch!==epoch||project.workflow.revision!==workflowRevision||schemeFingerprint(project.data.purposeScheme)!==basis,
    execute:async(node,upstream)=>runAlgorithm(project,argsForNode(node,upstream),request=>execute(request,{signal:options.signal}))
   });
   const classificationStart=performance.now(),publishBeforeClassification=publishMs;
   aggregatePurposeStates(scheme.operatorGraph.nodes,nodeStates);
   const faults=[...(inputFault?[inputFault]:[]),...nodeStates.filter(n=>n.ownStatus==='FAULT')],cancelled=nativeCommit?nativeDecision.cancelled===true:options.signal?.aborted;
   const observations=workpieceObservations(scheme,nodeStates,runMap);
   publish('classifying');
   let result=cancelled?{valid:false,status:'CANCELLED',categoryId:null,categoryIds:[],defectLabels:[],quality:null}:classifyWorkpiece(scheme.classificationSpec,observations,{faults});
   if(!cancelled&&!faults.length&&(!result.valid||result.categoryIds.length!==1)){faults.push({phase:'classification',reason:'FINAL_CATEGORY_NOT_UNIQUE',status:'FAULT',details:clone(result)});result={...result,status:'FAULT',faults};}
   // The native decision is the execution result. Keep the production JS path
   // as a migration oracle until native durable commit owns this entire stage.
   if(nativeDecision&&(!cancelled||nativeCommit)){
    const nativeResult={...nativeDecision.result,...(nativeDecision.result.faults?{faults}:{} )};
    const decisionFaults=value=>value.map(({evidenceStatus,...fault})=>fault);
    if(!jsonDataEqual(decisionFaults(nativeDecision.faults),decisionFaults(faults)))throw Error('原生与前端工件故障不一致');
    if(!jsonDataEqual(nativeDecision.observations,observations)||!jsonDataEqual(nativeResult,result))throw Error('原生与前端工件分类不一致');
    result=nativeResult;
   }
   const expected=expectedResolution.expected,{known,regression}=workpieceRegression(scheme.classificationSpec,expectedResolution,result,{faults,cancelled,knownCategoryIds:Object.keys(entry.counts.regression.perCategory)});
   const recordFields=workpieceRecordFields({unit,imageIds,referenceInputs,referenceIdentities,fingerprint:basis,runs,regression,result,faults,cancelled});
   if(nativeDecision&&(!cancelled||nativeCommit)){
    if(nativeDecision.product?.backend!=='rust-native-product-v1'||nativeDecision.product.known!==known||!jsonDataEqual(nativeDecision.product.recordFields,recordFields))throw Error('原生与前端持久记录及人工标签回归不一致');
    Object.assign(recordFields,nativeDecision.product.recordFields);
   }
   const record=assembleWorkpieceRecord({recordFields,faults,cancelled,result,runs,observations,nodeStates,timing:{clock:'monotonic',totalMs:performance.now()-unitStart,scope:nativeCommit?'workpiece wall elapsed through native commit and browser verification; excludes subsequent presentation':'workpiece wall elapsed including scheduling and synchronous host listeners; excludes explicit post-unit presentation and durable save',includes:['image-read','node-dispatch','algorithm','artifact-verification','host-scheduling-and-synchronous-listeners',...(nativeCommit?['durable-save']:[])],excludes:[...(nativeCommit?[]:['durable-save']),'post-unit-presentation','Agent-planning']},at:new Date().toISOString()});
   record.decisionEvidence=buildDecisionEvidence(scheme,record,runs);
   if(nativeDecision&&(!cancelled||nativeCommit)){
    if(!jsonDataEqual(nativeDecision.decisionEvidence,record.decisionEvidence))throw Error('原生与前端判定依据不一致');
    record.decisionEvidence=nativeDecision.decisionEvidence;
   }
   if(nativeDecision)record.timing.nativeDecision={backend:nativeDecision.backend,parityChecked:!cancelled||!!nativeCommit,nativeMs:nativeDecision.timing.totalMs,productBackend:nativeDecision.product?.backend,productParityChecked:!cancelled||!!nativeCommit};
   if(nativeCommit){
    for(const key of new Set([...Object.keys(record),...Object.keys(nativeCommit.record)]))if(!['timing','at','nativeCommit','artifactRetention'].includes(key)&&!jsonDataEqual(record[key],nativeCommit.record[key]))throw Error('原生与前端完整工件记录不一致：'+key);
    for(const [key,value]of Object.entries(nativeCommit.record))if(!['timing','artifactRetention'].includes(key))record[key]=value;
    record.timing.nativeCommit={backend:nativeCommit.backend,parityChecked:true,nativeMs:nativeCommit.timing.totalMs,nativeRecordTiming:nativeCommit.record.timing,scope:'commit nested inside nativeSession dispatch; browser verification is subsequent'};
   }
   if(nativeSessionTiming)record.timing.nativeSession=nativeSessionTiming;
   const spans=runs.map(r=>({nodeId:r.schemeNodeId,runId:r.runId,programMs:r.durationMs,backend:r.backend||r.executionBackend||'python-extension',host:r.timing?.hostPhases||null,native:r.timing?.native||null}));
   const classificationMs=performance.now()-classificationStart-(publishMs-publishBeforeClassification);
   record.timing.totalMs=performance.now()-unitStart;
   const dispatchLabel=runs.some(r=>r.backend==='rust-native')?'派發與算法執行（Rust 原生／Python fallback）':'派發與 Python 執行';
   const parts=[{key:'input',label:'原圖讀取與準備',ms:inputReadMs},{key:'preparation',label:'節點輸入與契約核對',ms:spans.reduce((sum,s)=>sum+(s.host?.preparationMs||0),0)},{key:'dispatch',label:dispatchLabel,ms:spans.reduce((sum,s)=>sum+(s.host?.dispatchMs||0),0)},{key:'audit',label:'結果與依據檢查',ms:spans.reduce((sum,s)=>sum+(s.host?.auditMs||0),0)},{key:'listeners',label:'同步事件與畫面更新',ms:publishMs+spans.reduce((sum,s)=>sum+(s.host?.publishMs||0),0)},{key:'classification',label:'分類及證據整理',ms:classificationMs}];
   parts.push({key:'scheduling',label:'流程編排與其餘主機處理',ms:record.timing.totalMs-parts.reduce((sum,p)=>sum+p.ms,0)});
   record.timing.breakdown={schema:'agentcv-workpiece-timing-1',clock:'monotonic',totalMs:record.timing.totalMs,parts,nodes:spans,scope:'exclusive spans sum to unit decision wall time; native/process/program are nested breakdowns of dispatch, never added again'};
   // Keep the returned in-memory pixels independently of temporary run files.
   // Native commit may already have cleaned those files; live memory handles
   // and explicit debug inline pixels remain valid. Replace on the next unit.
   let receipt=null,retentionDecision=null;
   if(options.saveUnitResult){
    const product={executionId:entry.id,unit:clone(unit),record:clone(record),runs,context:{schemeFingerprint:basis,...(entry.processed===0?{scheme:clone(scheme)}:{})}},retentionOptions={retention:artifactRetention,unitIndex:entry.processed,total:entry.total};
    let durable;
    if(nativeDecision&&(!cancelled||nativeCommit)){
     const expected=datasetArtifactRetentionDecision(product,retentionOptions),actual=nativeDecision.product.retention;
     if(!jsonDataEqual(actual,expected))throw Error('原生与前端产物保留策略不一致');
     durable=applyDatasetArtifactRetention(product,actual);
    }else durable=retainDatasetArtifacts(product,retentionOptions);
    retentionDecision=durable.decision;
    receipt=await options.saveUnitResult(durable.product,{nativeReceipt:nativeCommit?.receipt});
    if(nativeCommit){
     if(receipt?.status!==nativeCommit.receipt.status||!jsonDataEqual(receipt.recordRef,nativeCommit.receipt.recordRef)||!jsonDataEqual(receipt.archiveRef,nativeCommit.receipt.archiveRef))throw Error('原生归档确认被替换');
    }
   }
   publishNativeRuns?.();captureWorkpieceArtifactPixels(project,unit.id,runs);
   record.cycleTiming={clock:'monotonic',totalMs:performance.now()-unitStart,scope:receipt?.status==='PENDING'?'unit-start through classification and owned archive queue admission; excludes archival completion and presentation':options.saveUnitResult?'unit-start through successful durable-save completion':'unit-start through classification completion (no durable save)',includes:['image-read','node-dispatch','algorithm','artifact-verification','synchronous-host-listeners',...(receipt?.status==='PENDING'?['archive-admission']:options.saveUnitResult?['durable-save']:[])],excludes:['post-unit-presentation','inter-unit-delay','Agent-planning'],storedIn:'dataset-execution-unit-summary; durable record was written before save completion'};
   record.cycleTiming.afterDecisionMs=record.cycleTiming.totalMs-record.timing.totalMs;
   if(nativeCommit){record.cycleTiming.commitLocation='native-session';record.cycleTiming.nativeCommitWallMs=nativeCommit.timing.totalMs;}
   if(receipt?.timing)record.cycleTiming.persistence=receipt.timing;
   cycles.push(record.cycleTiming.totalMs);cycleSum+=record.cycleTiming.totalMs;cycleMax=Math.max(cycleMax,record.cycleTiming.totalMs);
   // Drop prior unit's bulky artifacts only after the next durable save succeeds.
   // Execution facts remain in the per-unit record. No live project snapshot is persisted.
   if(options.saveUnitResult){for(const id of latestUnitRunIds)pendingEviction.add(id);const retained=pinnedAlgorithmRuns(project),remove=new Set([...pendingEviction].filter(id=>!retained.has(id)));project.data.algorithmRuns=(project.data.algorithmRuns||[]).filter(r=>!remove.has(r.runId));for(const id of remove)pendingEviction.delete(id);latestUnitRunIds=runs.map(r=>r.runId);durableLiveRuns.set(project,{epoch,ids:latestUnitRunIds});const summary=entry.artifactRetentionSummary;summary.units++;summary.imageArtifacts+=retentionDecision.imageArtifacts;summary.retainedImageArtifacts+=retentionDecision.retainedImageArtifacts;summary.metadataOnlyImageArtifacts+=retentionDecision.metadataOnlyImageArtifacts;if(retentionDecision.retainedImageArtifacts>0)summary.fullPixelUnits++;entry.units.push(immutableJson({unitId:unit.id,imageIds,execution:record.execution.status,categoryId:result.categoryId,categoryIds:result.categoryIds,defectLabels:result.defectLabels,finalExit:record.finalExit,evidenceReady:record.evidenceReady,quality:result.quality,regression:regression.status,expectedClassification:known?clone(expected):null,expectedLabelSource:clone(expectedResolution.origin),regressionReason:regression.reason||null,artifactRetention:clone(retentionDecision),cycleTiming:record.cycleTiming,runIds:record.runIds,recordRef:receipt?.recordRef||null,archive:receipt?.status==='PENDING'?{status:'PENDING',reference:receipt.archiveRef}:null,timing:record.timing}));}
   else {entry.units.push(immutableJson(record));latestUnitRunIds=runs.map(r=>r.runId);}
   times.push(record.timing.totalMs);timeSum+=record.timing.totalMs;timeMax=Math.max(timeMax,record.timing.totalMs);entry.processed++;entry.counts.execution[record.execution.status]++;entry.counts.exits[record.finalExit]=(entry.counts.exits[record.finalExit]||0)+1;entry.counts.evidence[record.evidenceReady?'ready':'notReady']++;for(const cat of result.categoryIds)entry.counts.categories[cat]=(entry.counts.categories[cat]||0)+1;
   updateClassificationMetrics(entry.counts.regression,record);
   publishCompletedWorkpiece(project,entry,record,runs,{selectionRevision});
   delete entry.activeUnit;clearWorkpieceExecution(project);emit();if(cancelled||options.signal?.aborted){entry.status='CANCELLED';break;}
   }finally{pendingInputs?.release();releaseInputs();}
  }
  if(entry.status==='RUNNING')entry.status=entry.counts.execution.FAULT?'COMPLETED_WITH_FAULTS':'COMPLETED';
 }catch(error){entry.status='FAULT';entry.error={type:error?.name||'Error',message:String(error?.message??error)};throw error;}
 finally{delete entry.activeUnit;clearWorkpieceExecution(project);releaseSession();entry.finishedAt=new Date().toISOString();emit();}
 return {compilation,execution:readDatasetExecution(project,entry.id,{offset:Math.max(0,entry.units.length-32),limit:32}),runs:(project.data.algorithmRuns||[]).filter(r=>latestUnitRunIds.includes(r.runId)),acceptance:null,scope:'逐件正常分類與執行故障分開；有人工真值才計回歸，未發布。'};
 }finally{inputUnits?.dispose();datasetLocks.delete(project);}
}

export function readDatasetExecution(project,executionId,{offset=0,limit=32}={}){
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error('單件結果分頁limit需1–200，offset不可負。');
 const entry=(project.data.datasetExecutions||[]).find(e=>e.id===executionId);if(!entry)throw Error('找不到這次真實資料集執行。');
 return {...clone({...entry,units:undefined,schemeSnapshot:undefined}),units:clone(entry.units.slice(offset,offset+limit)),unitCount:entry.units.length,offset,limit,truncatedUnits:entry.units.length>limit,readWith:'get_dataset_execution(execution_id,offset,limit)'};
}
