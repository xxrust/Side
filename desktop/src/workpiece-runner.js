import {baselineRunOptions,currentAgreement} from './project-acceptance.js';
import {validateProjectScheme} from './scheme-validation.js';
import {buildDecisionEvidence} from './decision-evidence.js';
import {resolveWorkpieceExpected} from './workpiece-expected-label.js';
import {publishWorkpieceExecution,clearWorkpieceExecution,beginWorkpieceArtifactPixels,captureWorkpieceArtifactPixels} from './workpiece-live-state.js';
import {hierarchyOf,aggregatePurposeStates} from './workpiece-lifecycle.js';
import {PipelineEvidenceContractError} from './pipeline-evidence-contract.js';
import {createClassificationMetrics,updateClassificationMetrics,finalizeClassificationMetrics} from './classification-metrics.js';
import {compileScheme,schemeFingerprint} from './purpose-compiler.js';
import {algorithmContext,runAlgorithm,beginCompiledSession} from './algorithm-workspace.js';
import {classifyWorkpiece} from './classification-spec.js';
import {DEFAULT_BATCH_ARTIFACT_RETENTION,normalizeArtifactRetention,retainDatasetArtifacts} from './artifact-retention.js';
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const executionError=error=>({type:error?.name||'Error',message:String(error?.message||error)});
const path=(v,p)=>String(p).split('.').reduce((a,k)=>a?.[k],v);
const datasetLocks=new WeakSet();
const id=()=>globalThis.crypto?.randomUUID?.()||`inspection-${Date.now()}-${Math.random().toString(16).slice(2)}`;
function state(run){return !run?'SKIPPED':run.execution?.status==='FAULT'||run.status!=='SUCCEEDED'?'FAULT':run.result?.valid===false?'NOT_FOUND':'VALID';}
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
 if(options.baselineId)options={...options,...baselineRunOptions(project,options.baselineId,{actor:options.baselineActor})};
 const compilation=validateProjectScheme(project,project.data.purposeScheme,{mode:'scheme'});
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
 datasetLocks.add(project);
 const scheme=clone(project.data.purposeScheme),basis=schemeFingerprint(scheme),epoch=project.epoch,workflowRevision=project.workflow.revision,byNode=new Map(scheme.operatorGraph.nodes.map(n=>[n.id,n])),nodes=compilation.order.map(id=>byNode.get(id)),hierarchy=hierarchyOf(scheme.operatorGraph.nodes);
 const total=options.total??(Array.isArray(options.units)?options.units.length:options.units?null:defaultWorkpieceCount(project,options.sourceId));
 // Generic callers keep the historical full evidence behavior. The desktop
 // batch entry point opts into the bounded diagnostic policy explicitly.
 const artifactRetention=normalizeArtifactRetention(options.artifactRetention,options.artifactRetention?DEFAULT_BATCH_ARTIFACT_RETENTION:{...DEFAULT_BATCH_ARTIFACT_RETENTION,mode:'all'});
 const resumeEntry=options.resumeExecutionId?(project.data.datasetExecutions||[]).find(candidate=>candidate.id===options.resumeExecutionId):null;
 if(options.resumeExecutionId&&(!resumeEntry||resumeEntry.schemeFingerprint!==basis||resumeEntry.sourceId!==(options.sourceId||null)))throw Error('指定的資料集執行不存在，或與目前方案／圖像源不一致，不能續跑。');
 const entry=resumeEntry||{schema:'agentcv-dataset-execution-1',evidenceContract:'per-operator-triad-and-timing-1',timingRequirement:clone(scheme.execution?.timingRequirement||null),id:id(),schemeFingerprint:basis,sourceId:options.sourceId||null,status:'RUNNING',processed:0,total,units:[],artifactRetention,artifactRetentionSummary:{units:0,imageArtifacts:0,retainedImageArtifacts:0,metadataOnlyImageArtifacts:0,fullPixelUnits:0},counts:{execution:{COMPLETED:0,FAULT:0,CANCELLED:0},categories:Object.fromEntries(scheme.classificationSpec.categories.map(c=>[c.id,0])),exits:{FAULT:0,CANCELLED:0,...Object.fromEntries(scheme.classificationSpec.categories.map(c=>['PRODUCT:'+c.id,0]))},evidence:{ready:0,notReady:0},regression:createClassificationMetrics(scheme.classificationSpec.categories)},startedAt:new Date().toISOString(),retention:options.saveUnitResult?'durable-unit-records':'project-memory',cancellationPolicy:'between-node; active worker finishes or its configured timeout terminates it',humanConfirmed:false,delivered:false};
 if(resumeEntry){entry.status='RUNNING';entry.total=entry.total??total;entry.startedAt=new Date().toISOString();delete entry.finishedAt;delete entry.error;delete entry.activeUnit;entry.retention=options.saveUnitResult?'durable-unit-records':entry.retention;}
 // One user-level undo boundary. Internal node records are durable observations,
 // not a reason to clone the entire dataset into undo once per workpiece.
 entry.schemeSnapshot=clone(scheme);
 if(options.baselineId){entry.baselineId=options.baselineId;entry.acceptanceAgreementId=currentAgreement(project)?.id||null;entry.baselineActor=options.baselineActor;}
 project.checkpoint();
 project.data.datasetExecutions||=[];if(!resumeEntry)project.data.datasetExecutions.push(entry);
 let timeSum=0,timeMax=0,cycleSum=0,cycleMax=0;const cycles=[];
 const started=performance.now(),times=[],releaseSession=beginCompiledSession(project,compilation);let latestUnitRunIds=durableLiveRuns.get(project)?.epoch===epoch?durableLiveRuns.get(project).ids:[];const pendingEviction=new Set();
 const emit=()=>{if(entry.status!=='RUNNING')finalizeClassificationMetrics(entry.counts.regression);entry.timing={clock:'monotonic',elapsedMs:performance.now()-started,unitMs:entry.status==='RUNNING'?{count:times.length,mean:times.length?timeSum/times.length:null,p50:null,p95:null,max:times.length?timeMax:null}:summarize(times),cycleMs:entry.status==='RUNNING'?{count:cycles.length,mean:cycles.length?cycleSum/cycles.length:null,p50:null,p95:null,max:cycles.length?cycleMax:null}:summarize(cycles),cycleIncludesDurableSave:!!options.saveUnitResult,cycleScope:'unit-start to durable-save completion (or classification completion without durable save); includes host dispatch and persistence, excludes subsequent UI presentation and inter-unit delay',scope:'batch wall elapsed including host callbacks and inter-unit UI work; not a sum of operator durations',includes:['image-read','node-dispatch','algorithm','artifact-verification','unit-save','host-callbacks-and-inter-unit-UI'],excludes:['Agent-planning']};project.event('dataset_execution_progress',{executionId:entry.id,status:entry.status,processed:entry.processed,total:entry.total,counts:clone(entry.counts)});options.onProgress?.({...entry,units:entry.units.slice(-1),counts:clone(entry.counts),timing:clone(entry.timing),activeUnit:clone(entry.activeUnit)});};
 try{
  for await(const unit of unitsFrom(project,options)){
   if(resumeEntry&&entry.units.some(saved=>saved.unitId===unit.id))continue;
   if(options.signal?.aborted){entry.status='CANCELLED';break;}
   if(project.epoch!==epoch||project.workflow.revision!==workflowRevision||schemeFingerprint(project.data.purposeScheme)!==basis)throw Error('方案／專案在批次執行期間改變；已保存單件仍保留，停止派發。');
   const imageIds=unit.imageIds||Object.values(unit.views||{});
   if(!unit.id||!Array.isArray(imageIds)||!imageIds.length||new Set(imageIds).size!==imageIds.length)throw Error('單件需要穩定id及不重複imageIds；多視圖只能屬於同一工件。');
   if(scheme.execution.inputSlots.length>1){if(!unit.views||scheme.execution.inputSlots.some(s=>s.required&&!unit.views[s.id])||Object.values(unit.views).some(imageId=>!imageIds.includes(imageId)))throw Error('同件多視圖需views:{slotId:imageId}，不得把資料集誤當多視圖。');}
   else if(imageIds.length!==1)throw Error('單視圖方案每件只能一張圖；多視圖須先聲明inputSlots並提供views。');
   // Switching to the next unit immediately releases the previous unit's
   // process pixels, even before the new operator finishes.
   beginWorkpieceArtifactPixels(project,unit.id);
   const referenceInputs=scheme.execution.referenceInputs||{},referenceIds=[...new Set(Object.values(referenceInputs))],inputIds=[...new Set([...imageIds,...referenceIds])];
   let releaseInputs=()=>{},inputFault=null;
   const expectedResolution=resolveWorkpieceExpected(project,unit,scheme);
   let publishMs=0,inputReadMs=0;const unitStart=performance.now(),runMap=new Map(),nodeStates=[],runs=[];
   const publish=(phase,currentNodeId=null)=>{const publishStart=performance.now();const states=nodes.map(n=>clone(nodeStates.find(s=>s.nodeId===n.id)||{nodeId:n.id,status:n.id===currentNodeId?'RUNNING':'PENDING'}));aggregatePurposeStates(scheme.operatorGraph.nodes,states);const live={executionId:entry.id,schemeFingerprint:basis,unitId:unit.id,imageIds:clone(imageIds),views:clone(unit.views||null),referenceInputs:clone(referenceInputs),nodeStates:states,runIds:runs.map(r=>r.runId),phase,currentNodeId};entry.activeUnit=live;publishWorkpieceExecution(project,live);project.event('workpiece_execution_progress',{executionId:entry.id,unitId:unit.id,phase,nodeId:currentNodeId});options.onNodeProgress?.(clone(live));publishMs+=performance.now()-publishStart;};
   const recordNodeState=value=>{nodeStates.push(value);publish('node-completed');};
   publish('unit-started');
   try{
   const inputReadStart=performance.now();
   try{if(referenceIds.some(id=>imageIds.includes(id)))throw Error('固定參考圖不可同時當作本件待檢圖；請分開referenceInputs與工件圖像源。');releaseInputs=project.pinImages?.(inputIds)||(()=>{});if(project.ensureImagePixels)for(const imageId of inputIds)await project.ensureImagePixels(imageId);}
   catch(error){if(project.epoch!==epoch)throw error;inputFault={phase:'input-read',status:'FAULT',reason:'INPUT_UNAVAILABLE',imageIds:clone(imageIds),error:executionError(error),durationMs:performance.now()-unitStart};}
   inputReadMs=performance.now()-inputReadStart;
   const prerequisiteState=(id,consumer)=>{if(hierarchy.inside(consumer,id))return state(runMap.get(id));return aggregatePurposeStates(scheme.operatorGraph.nodes,nodeStates).get(id)?.status||'PENDING';};
   for(const node of nodes){
    if(inputFault){recordNodeState({nodeId:node.id,status:'SKIPPED',reason:'INPUT_UNAVAILABLE'});continue;}
    if(options.signal?.aborted){recordNodeState({nodeId:node.id,status:'SKIPPED',reason:'CANCELLED'});continue;}
    const parents=(scheme.operatorGraph.edges||[]).filter(e=>e.to===node.id).map(e=>e.from),alternatives=node.prerequisites?.anyOf||[],selected=node.when?prerequisiteState(node.when.nodeId,node.id):null;
    const when=node.when?(node.when.status==='COMPLETED'?['VALID','NOT_FOUND'].includes(selected):selected===node.when.status):true;
    const required=parents.filter(p=>p!==node.when?.nodeId&&!alternatives.includes(p));
    if(!when||required.some(p=>prerequisiteState(p,node.id)!=='VALID')||alternatives.length&&!alternatives.some(p=>prerequisiteState(p,node.id)==='VALID')){recordNodeState({nodeId:node.id,status:'SKIPPED',reason:!when?'BRANCH_NOT_SELECTED':'PREREQUISITE_UNAVAILABLE',blockedBy:required.filter(p=>prerequisiteState(p,node.id)!=='VALID')});continue;}
    const upstream={};let unavailable=false;
    for(const [slot,input]of Object.entries(node.inputs||{})){const parent=runMap.get(input.nodeId),artifact=parent?.artifacts.find(a=>a.id===input.artifactId);if(prerequisiteState(input.nodeId,node.id)!=='VALID'||!artifact){if(alternatives.includes(input.nodeId))continue;unavailable=true;break;}upstream[slot]={nodeId:input.nodeId,runId:parent.runId,artifact:clone(artifact)};}
    if(unavailable){recordNodeState({nodeId:node.id,status:'SKIPPED',reason:'REQUIRED_ARTIFACT_UNAVAILABLE'});continue;}
    const nodeStart=performance.now();publish('node-started',node.id);
    let run;try{const context=algorithmContext(project,{imageIds:inputIds});run=await runAlgorithm(project,{mode:'scheme',scheme_node_id:node.id,title:node.title||node.id,code:node.code,parameters_json:JSON.stringify(node.parameters||{}),source:context.source,image_ids:inputIds,referenceInputs,upstream,documentation:node.documentation,justification:{...clone(node.justification),meta:{...clone(node.justification?.meta),sourceFingerprint:context.sourceFingerprint}},expected_outputs:node.expected_outputs,fileBackedInputs:options.fileBackedInputs===true,artifactMode:options.artifactMode|| (options.saveUnitResult?'references':'inline'),workpieceUnit:{id:unit.id,imageIds,views:unit.views||null}},request=>execute(request,{signal:options.signal}));}catch(error){if(error instanceof PipelineEvidenceContractError||project.epoch!==epoch||project.workflow.revision!==workflowRevision||schemeFingerprint(project.data.purposeScheme)!==basis)throw error;recordNodeState({nodeId:node.id,status:'FAULT',reason:'DISPATCH_FAULT',error:executionError(error),durationMs:performance.now()-nodeStart});continue;}
    runMap.set(node.id,run);runs.push(run);recordNodeState({nodeId:node.id,runId:run.runId,status:state(run),execution:clone(run.execution),durationMs:performance.now()-nodeStart,evidenceStatus:run.evidenceAudit?.status});
   }
   const classificationStart=performance.now(),publishBeforeClassification=publishMs;
   aggregatePurposeStates(scheme.operatorGraph.nodes,nodeStates);
   const faults=[...(inputFault?[inputFault]:[]),...nodeStates.filter(n=>n.ownStatus==='FAULT')],cancelled=options.signal?.aborted;
   const observations=scheme.classificationSpec.metrics.map(metric=>{const bindings=scheme.metricBindings.filter(b=>b.metric===metric.id),candidates=bindings.map(b=>{const run=runMap.get(b.nodeId),s=nodeStates.find(s=>s.nodeId===b.nodeId)?.status||state(run),value=path(run?.result,b.path);return {metric:metric.id,value:s==='VALID'&&value!==undefined&&value!==null?value:null,valid:s==='VALID'&&value!==undefined&&value!==null,status:s==='VALID'&&value!==undefined&&value!==null?'MEASURED':s==='NOT_FOUND'?'NOT_FOUND':s==='SKIPPED'?'SKIPPED':'MISSING',nodeId:b.nodeId,runId:run?.runId};});return candidates.find(c=>c.valid)||candidates.find(c=>c.status==='NOT_FOUND')||candidates[0]||{metric:metric.id,status:'MISSING'};});
   publish('classifying');
   let result=cancelled?{valid:false,status:'CANCELLED',categoryId:null,categoryIds:[],defectLabels:[],quality:null}:classifyWorkpiece(scheme.classificationSpec,observations,{faults});
   if(!cancelled&&!faults.length&&(!result.valid||result.categoryIds.length!==1)){faults.push({phase:'classification',reason:'FINAL_CATEGORY_NOT_UNIQUE',status:'FAULT',details:clone(result)});result={...result,status:'FAULT',faults};}
   const expected=expectedResolution.expected,known=Array.isArray(expected?.categoryIds)&&expected.categoryIds.length===1&&expected.provenance?.type==='human'&&expected.provenance.status==='confirmed'&&typeof expected.provenance.ref==='string'&&expected.provenance.ref.trim().length>0&&expected.categoryIds.every(id=>Object.hasOwn(entry.counts.regression.perCategory,id));
   const regression=!known?{status:expectedResolution.reason==='EXPECTED_SOURCE_LABEL_UNMAPPED'?'UNMAPPED':'UNLABELLED',...(expectedResolution.reason?{reason:expectedResolution.reason}:{}),...(expected?{reason:expected.categoryIds?.length!==1?'EXPECTED_FINAL_CATEGORY_NOT_UNIQUE':'EXPECTED_SOURCE_UNCONFIRMED_OR_CATEGORY_UNDEFINED'}:{})}:faults.length?{status:'FAULT',expected:expected.categoryIds}:cancelled||!result.valid?{status:'NOT_EVALUATED',expected:expected.categoryIds}:{status:[...result.categoryIds].sort().join('|')===[...expected.categoryIds].sort().join('|')?'MATCH':'MISMATCH',expected:expected.categoryIds};
   if(known)regression.expectedProvenance=clone(expected.provenance);
   regression.labelSource=clone(expectedResolution.origin);
   const record={schema:'agentcv-workpiece-result-1',unitId:unit.id,imageIds,views:unit.views||null,referenceInputs:clone(referenceInputs),referenceIdentities:Object.fromEntries(Object.entries(referenceInputs).map(([slot,id])=>[slot,project.imageIdentity?.(id)||{imageId:id}])),finalExit:cancelled?'CANCELLED':faults.length?'FAULT':'PRODUCT:'+result.categoryId,schemeFingerprint:basis,execution:{status:cancelled?'CANCELLED':faults.length?'FAULT':'COMPLETED',faults},result,regression,evidenceReady:runs.length>0&&!cancelled&&!faults.length&&runs.every(r=>r.evidenceAudit?.status==='READY_FOR_REVIEW'&&r.evidenceAudit?.procedureStatus==='READY_FOR_REVIEW'),observations,nodeStates,runIds:runs.map(r=>r.runId),timing:{clock:'monotonic',totalMs:performance.now()-unitStart,scope:'workpiece wall elapsed including scheduling and synchronous host listeners; excludes explicit post-unit presentation and durable save',includes:['image-read','node-dispatch','algorithm','artifact-verification','host-scheduling-and-synchronous-listeners'],excludes:['durable-save','post-unit-presentation','Agent-planning']},at:new Date().toISOString()};
   record.decisionEvidence=buildDecisionEvidence(scheme,record,runs);
   const spans=runs.map(r=>({nodeId:r.schemeNodeId,runId:r.runId,programMs:r.durationMs,backend:r.backend||r.executionBackend||'python-extension',host:r.timing?.hostPhases||null,native:r.timing?.native||null}));
   const classificationMs=performance.now()-classificationStart-(publishMs-publishBeforeClassification);
   record.timing.totalMs=performance.now()-unitStart;
   const dispatchLabel=runs.some(r=>r.backend==='rust-native')?'派發與算法執行（Rust 原生／Python fallback）':'派發與 Python 執行';
   const parts=[{key:'input',label:'原圖讀取與準備',ms:inputReadMs},{key:'preparation',label:'節點輸入與契約核對',ms:spans.reduce((sum,s)=>sum+(s.host?.preparationMs||0),0)},{key:'dispatch',label:dispatchLabel,ms:spans.reduce((sum,s)=>sum+(s.host?.dispatchMs||0),0)},{key:'audit',label:'結果與依據檢查',ms:spans.reduce((sum,s)=>sum+(s.host?.auditMs||0),0)},{key:'listeners',label:'同步事件與畫面更新',ms:publishMs+spans.reduce((sum,s)=>sum+(s.host?.publishMs||0),0)},{key:'classification',label:'分類及證據整理',ms:classificationMs}];
   parts.push({key:'scheduling',label:'流程編排與其餘主機處理',ms:record.timing.totalMs-parts.reduce((sum,p)=>sum+p.ms,0)});
   record.timing.breakdown={schema:'agentcv-workpiece-timing-1',clock:'monotonic',totalMs:record.timing.totalMs,parts,nodes:spans,scope:'exclusive spans sum to unit decision wall time; native/process/program are nested breakdowns of dispatch, never added again'};
   // Preserve every image produced for this workpiece in process memory before
   // the durable save is allowed to remove its temporary run directory. The
   // cache is replaced when the next workpiece starts and is not serialized.
   captureWorkpieceArtifactPixels(project,unit.id,runs);
   let receipt=null,retentionDecision=null;
   if(options.saveUnitResult){
    const durable=retainDatasetArtifacts({executionId:entry.id,unit:clone(unit),record:clone(record),runs,context:{schemeFingerprint:basis,...(entry.processed===0?{scheme:clone(scheme)}:{})}},{retention:artifactRetention,unitIndex:entry.processed,total:entry.total});
    retentionDecision=durable.decision;
    receipt=await options.saveUnitResult(durable.product);
   }
   record.cycleTiming={clock:'monotonic',totalMs:performance.now()-unitStart,scope:options.saveUnitResult?'unit-start through successful durable-save completion':'unit-start through classification completion (no durable save)',includes:['image-read','node-dispatch','algorithm','artifact-verification','synchronous-host-listeners',...(options.saveUnitResult?['durable-save']:[])],excludes:['post-unit-presentation','inter-unit-delay','Agent-planning'],storedIn:'dataset-execution-unit-summary; durable record was written before save completion'};
   record.cycleTiming.afterDecisionMs=record.cycleTiming.totalMs-record.timing.totalMs;
   cycles.push(record.cycleTiming.totalMs);cycleSum+=record.cycleTiming.totalMs;cycleMax=Math.max(cycleMax,record.cycleTiming.totalMs);
   // Drop prior unit's bulky artifacts only after the next durable save succeeds.
   // Execution facts remain in the per-unit record. No live project snapshot is persisted.
   if(options.saveUnitResult){for(const id of latestUnitRunIds)pendingEviction.add(id);const retained=pinnedAlgorithmRuns(project),remove=new Set([...pendingEviction].filter(id=>!retained.has(id)));project.data.algorithmRuns=(project.data.algorithmRuns||[]).filter(r=>!remove.has(r.runId));for(const id of remove)pendingEviction.delete(id);latestUnitRunIds=runs.map(r=>r.runId);durableLiveRuns.set(project,{epoch,ids:latestUnitRunIds});const summary=entry.artifactRetentionSummary;summary.units++;summary.imageArtifacts+=retentionDecision.imageArtifacts;summary.retainedImageArtifacts+=retentionDecision.retainedImageArtifacts;summary.metadataOnlyImageArtifacts+=retentionDecision.metadataOnlyImageArtifacts;if(retentionDecision.retainedImageArtifacts>0)summary.fullPixelUnits++;entry.units.push({unitId:unit.id,imageIds,execution:record.execution.status,categoryId:result.categoryId,categoryIds:result.categoryIds,defectLabels:result.defectLabels,finalExit:record.finalExit,evidenceReady:record.evidenceReady,quality:result.quality,regression:regression.status,expectedClassification:known?clone(expected):null,expectedLabelSource:clone(expectedResolution.origin),regressionReason:regression.reason||null,artifactRetention:clone(retentionDecision),cycleTiming:record.cycleTiming,runIds:record.runIds,recordRef:receipt?.recordRef||null,timing:record.timing});}
   else {entry.units.push(record);latestUnitRunIds=runs.map(r=>r.runId);}
   times.push(record.timing.totalMs);timeSum+=record.timing.totalMs;timeMax=Math.max(timeMax,record.timing.totalMs);entry.processed++;entry.counts.execution[record.execution.status]++;entry.counts.exits[record.finalExit]=(entry.counts.exits[record.finalExit]||0)+1;entry.counts.evidence[record.evidenceReady?'ready':'notReady']++;for(const cat of result.categoryIds)entry.counts.categories[cat]=(entry.counts.categories[cat]||0)+1;
   updateClassificationMetrics(entry.counts.regression,record);
   delete entry.activeUnit;clearWorkpieceExecution(project);emit();if(cancelled){entry.status='CANCELLED';break;}
   }finally{releaseInputs();}
  }
  if(entry.status==='RUNNING')entry.status=entry.counts.execution.FAULT?'COMPLETED_WITH_FAULTS':'COMPLETED';
 }catch(error){entry.status='FAULT';entry.error={type:error?.name||'Error',message:String(error?.message??error)};throw error;}
 finally{delete entry.activeUnit;clearWorkpieceExecution(project);releaseSession();datasetLocks.delete(project);entry.finishedAt=new Date().toISOString();emit();}
 return {compilation,execution:readDatasetExecution(project,entry.id,{offset:Math.max(0,entry.units.length-32),limit:32}),runs:project.data.algorithmRuns.filter(r=>latestUnitRunIds.includes(r.runId)),acceptance:null,scope:'逐件正常分類與執行故障分開；有人工真值才計回歸，未發布。'};
}

export function readDatasetExecution(project,executionId,{offset=0,limit=32}={}){
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error('單件結果分頁limit需1–200，offset不可負。');
 const entry=(project.data.datasetExecutions||[]).find(e=>e.id===executionId);if(!entry)throw Error('找不到這次真實資料集執行。');
 return {...clone({...entry,units:undefined,schemeSnapshot:undefined}),units:clone(entry.units.slice(offset,offset+limit)),unitCount:entry.units.length,offset,limit,truncatedUnits:entry.units.length>limit,readWith:'get_dataset_execution(execution_id,offset,limit)'};
}
