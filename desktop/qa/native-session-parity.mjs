// Execute the production JS scheduler and native Rust scheduler on identical
// observed outcomes. This is semantic migration evidence, not desktop timing.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import fs from 'node:fs/promises';
import {scheduleWorkpieceNodes} from '../src/workpiece-node-scheduler.js';
import {aggregatePurposeStates,lifecycleOrder} from '../src/workpiece-lifecycle.js';
import {auditDataContracts,dataContractIssues} from '../src/data-contract.js';
import {adaptNativePipelineResponse} from '../src/algorithm-workspace.js';
import {classifyWorkpiece,compileClassificationSpec} from '../src/classification-spec.js';
import {buildDecisionEvidence} from '../src/decision-evidence.js';
import {workpieceObservations} from '../src/workpiece-runner.js';
import {workpieceRegression,workpieceRecordFields} from '../src/workpiece-product.js';
import {normalizeArtifactRetention,datasetArtifactRetentionDecision} from '../src/artifact-retention.js';
import {verifyNativeEvidence} from './native-evidence-parity.mjs';
import {verifyNativeRunEnvelope} from './native-run-parity.mjs';
import {verifyNativeCommitProduct} from './native-commit-parity.mjs';

const [executable,output]=process.argv.slice(2);
assert.ok(executable,'Usage: node qa/native-session-parity.mjs <built desktop exe> [result.json]');
const child=spawn(executable,['--cv-resident-headless'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
const pending=new Map();let sequence=0,stderr='',fatal;
child.stderr.on('data',bytes=>{stderr+=bytes;});
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{const response=JSON.parse(line),handler=pending.get(response.id);assert.ok(handler,'Unexpected native reply');pending.delete(response.id);handler.resolve(response);});
child.on('error',error=>{fatal=error;for(const handler of pending.values())handler.reject(error);pending.clear();});
child.on('exit',code=>{if(pending.size){fatal=Error(`Native service exited ${code}: ${stderr}`);for(const handler of pending.values())handler.reject(fatal);pending.clear();}});
const call=(request,op='replay_session')=>new Promise((resolve,reject)=>{if(fatal)return reject(fatal);const id=++sequence;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,op,request})+'\n');});
const normalized=value=>JSON.parse(JSON.stringify(value,(_key,item)=>item));
const state=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['durationMs','evidenceStatus'].includes(key)));
async function oracle(request){
 const graph=request.scheme.operatorGraph,compilation=lifecycleOrder(graph.nodes,graph.edges||[]),byId=new Map(graph.nodes.map(n=>[n.id,n]));
 assert.equal(compilation.ok,true);
 const nodeStates=[],runs=[],runMap=new Map(),dispatched=[],events=[];let boundaries=0;
 await scheduleWorkpieceNodes({nodes:compilation.order.map(id=>byId.get(id)),graph,nodeStates,runs,runMap,
  cancelled:()=>request.cancelAtBoundary!==undefined&&boundaries++>=request.cancelAtBoundary,
  onNodeStart:node=>events.push({phase:'node-started',nodeId:node.id}),
  recordNodeState:value=>{nodeStates.push(value);events.push({phase:'node-completed',nodeId:value.nodeId,state:state(value)});},
  execute:async(node,upstream)=>{dispatched.push({nodeId:node.id,upstream});const outcome=request.outcomes[node.id];if(outcome.dispatchError)throw Error(outcome.dispatchError);return structuredClone(outcome);}
 });
 aggregatePurposeStates(graph.nodes,nodeStates);
 return normalized({result:{order:compilation.order,dependencies:compilation.dependencies,nodeStates:nodeStates.map(state),runs},dispatched,events});
}
const node=(id,extra={})=>({id,expected_outputs:[{id:'data',type:'evidence'}],...extra});
const input=nodeId=>({nodeId,artifactId:'data'});
const edge=(from,to)=>({from,to});
const graphs=[
 {name:'chain-artifact-binding',nodes:[node('a'),node('b',{inputs:{a:input('a')}}),node('c',{inputs:{b:input('b')}})],edges:[edge('a','b'),edge('b','c')]},
 {name:'independent-fault-branch',nodes:[node('a'),node('b',{inputs:{a:input('a')}}),node('c')],edges:[edge('a','b')]},
 {name:'parent-own-versus-complete-purpose',nodes:[node('parent'),node('child',{parentId:'parent',inputs:{parent:input('parent')}}),node('consumer')],edges:[edge('parent','child'),edge('parent','consumer')]},
 {name:'alternative-child-recovery',nodes:[node('group',{prerequisites:{anyOf:['primary','fallback']},inputs:{primary:input('primary'),fallback:input('fallback')}}),node('primary',{parentId:'group'}),node('fallback',{parentId:'group',when:{nodeId:'primary',status:'NOT_FOUND'}}),node('consumer')],edges:[edge('primary','fallback'),edge('primary','group'),edge('fallback','group'),edge('group','consumer')]},
 {name:'completion-and-fault-conditions',nodes:[node('a'),node('complete',{when:{nodeId:'a',status:'COMPLETED'}}),node('fault',{when:{nodeId:'a',status:'FAULT'}})],edges:[edge('a','complete'),edge('a','fault')]},
 {name:'nested-purpose',nodes:[node('outer'),node('inner',{parentId:'outer'}),node('leaf',{parentId:'inner'}),node('consumer')],edges:[edge('outer','inner'),edge('inner','leaf'),edge('outer','consumer')]}
];
function outcome(id,kind){
 if(kind===4)return {dispatchError:'Observed dispatch failure'};
 return {runId:'actual-'+id,status:kind===2?'FAILED':'SUCCEEDED',execution:{status:kind===2?'FAULT':'COMPLETED'},
  result:{valid:kind!==1,value:7},artifacts:kind===3?[]:[{id:'data',type:'json',data:{value:7}}]};
}
const report={status:'RUNNING',scope:'Production JS/Rust node scheduling differential check; controlled observations, no algorithm or desktop performance claim',cases:0,graphs:{}};
try{
 for(const {name,...graph} of graphs){
  let cases=0;
  for(let combination=0;combination<5**graph.nodes.length;combination++){
   let digits=combination;const outcomes=Object.fromEntries(graph.nodes.map(n=>{const kind=digits%5;digits=Math.floor(digits/5);return [n.id,outcome(n.id,kind)];}));
   const request={scheme:{operatorGraph:graph},outcomes};
   const native=await call(request);assert.equal(native.error,undefined,JSON.stringify(native));
   assert.deepEqual(native.result,await oracle(request),`${name}, outcomes ${combination}`);cases++;
  }
  for(let boundary=0;boundary<=graph.nodes.length;boundary++){
   const request={scheme:{operatorGraph:graph},outcomes:Object.fromEntries(graph.nodes.map(n=>[n.id,outcome(n.id,0)])),cancelAtBoundary:boundary};
   const native=await call(request);assert.equal(native.error,undefined);
   assert.deepEqual(native.result,await oracle(request),`${name}, cancellation boundary ${boundary}`);cases++;
  }
  report.graphs[name]=cases;report.cases+=cases;
 }
 const imageFrame={frame:{kind:'input',slot:'image'},unit:'px'},referenceFrame={frame:{kind:'reference',slot:'master'},unit:'px'},artifactFrame={frame:{kind:'artifact',nodeId:'upstream',artifactId:'pixels'},unit:'px'};
 const contracts=[{kind:'image',coordinates:imageFrame},{kind:'mask',coordinates:imageFrame},{kind:'points',coordinates:imageFrame},
  {kind:'contours',coordinates:imageFrame},{kind:'roi',coordinates:imageFrame},{kind:'measurement',unit:'px'},
  {kind:'homography',from:imageFrame,to:referenceFrame},{kind:'classification',categories:['good','bad']},{kind:'json'},{kind:'file'},
  {kind:'image',coordinates:artifactFrame},{kind:'image',coordinates:{frame:{kind:'artifact',nodeId:'self',artifactId:'pixels'},unit:'px'}}];
 const scheme={execution:{inputSlots:[{id:'image',required:true}],referenceInputs:{master:'reference'}}};
 const baseRun={runId:'actual-self',schemeNodeId:'self',status:'SUCCEEDED',execution:{status:'COMPLETED'},result:{valid:true},
  workpieceUnit:{id:'actual-unit',imageIds:['original']},referenceInputs:{master:'reference'},
  sourceBinding:{images:[{imageId:'original',width:20,height:10,contentSha256:'a'.repeat(64)},{imageId:'reference',width:20,height:10,contentSha256:'b'.repeat(64)}]}};
 const upstream={pixels:{nodeId:'upstream',runId:'actual-upstream',artifact:{id:'pixels',type:'image',width:20,height:10,sha256:'c'.repeat(64)}}};
 const compactAudit=audit=>({valid:audit.valid,errors:audit.errors.map(({code,path})=>({code,path})),bindings:audit.bindings,checked:audit.checked,untyped:audit.untyped});
 const changes=[()=>{},r=>{r.artifacts=[];},r=>{r.result.valid=false;r.artifacts=[];},r=>{r.status='FAILED';r.execution.status='FAULT';},
  r=>{r.artifacts[0].type='file';},r=>{r.artifacts[0].width=21;},r=>{r.artifacts[0].width=0;},r=>{r.sourceBinding.images=[];},
  r=>{r.artifacts[0].data.value=null;},r=>{r.artifacts[0].data.unit='mm';},r=>{r.artifacts[0].data.coordinates=referenceFrame;},
  r=>{r.artifacts[0].data.points=[{x:0,y:null}];},r=>{r.artifacts[0].channels=3;},r=>{r.artifacts[0].binary=false;},
  r=>{r.artifacts[0].data.matrix=[[0,0,0],[0,0,0],[0,0,0]];},r=>{r.artifacts[0].data.matrix=[[1,2,3],[1,2,3],[0,0,1]];},
  r=>{r.artifacts[0].data.matrix=[[1,0],[0,1]];},r=>{r.artifacts[0].data.categoryId='absent';},r=>{r.artifacts[0].data.to=imageFrame;},
  r=>{r.workpieceUnit.views={image:'reference'};},r=>{r.referenceInputs={master:{id:'original'}};}];
 let contractCases=0;
 for(const contract of contracts)for(const change of changes){
  const type=['image','mask'].includes(contract.kind)?'image':contract.kind==='file'?'file':'json';
  const run=structuredClone({...baseRun,artifacts:[{id:'pixels',type,width:20,height:10,channels:1,binary:true,sha256:'d'.repeat(64),
   data:{value:12,unit:'px',categoryId:'good',coordinates:imageFrame,points:[{x:0,y:0},{x:1,y:1},{x:2,y:0}],contours:[[{x:0,y:0}]],from:imageFrame,to:referenceFrame,matrix:[[1,0,0],[0,1,0],[0,0,1]]}}]});
  change(run);const expected=[{id:'pixels',type:type==='json'?'evidence':type,dataContract:contract}];
  const native=await call({run,expected,scheme,upstream},'audit_output_contracts');assert.equal(native.error,undefined,JSON.stringify(native));
  assert.deepEqual(native.result,normalized(auditDataContracts(run,expected,{scheme,upstream})),`complete runtime contract diagnostics ${contract.kind}, case ${contractCases}`);
  assert.deepEqual(compactAudit(native.result),compactAudit(auditDataContracts(run,expected,{scheme,upstream})),`output contract ${contract.kind}, case ${contractCases}`);contractCases++;
 }
 // A geometry port may carry a transitive image coordinate binding; the actual
 // image artifact itself need not be copied into every downstream input.
 const inherited={geometry:{nodeId:'middle',runId:'middle-run',artifact:{id:'geometry',type:'json',contractBinding:{frames:[{frame:artifactFrame.frame,unit:'px',runId:'actual-upstream',artifactId:'pixels',contentSha256:'c'.repeat(64),width:20,height:10}]}}}};
 const inheritedRun={...baseRun,artifacts:[{id:'pixels',type:'image',width:20,height:10}]},inheritedExpected=[{id:'pixels',type:'image',dataContract:{kind:'image',coordinates:artifactFrame}}];
 const inheritedNative=await call({run:inheritedRun,expected:inheritedExpected,scheme,upstream:inherited},'audit_output_contracts');
 assert.deepEqual(compactAudit(inheritedNative.result),compactAudit(auditDataContracts(inheritedRun,inheritedExpected,{scheme,upstream:inherited})));contractCases++;
 for(const contract of [{kind:'measurement'},{kind:'json',ignored:true},{kind:'image',coordinates:{unit:'px',frame:{kind:'input'}}},{kind:'classification',categories:['good','good']},{kind:'unsupported'}]){
  assert.ok(dataContractIssues(contract).length);
  const native=await call({run:baseRun,expected:[{id:'pixels',dataContract:contract}],scheme,upstream},'audit_output_contracts');
  assert.equal(native.result.valid,false);assert.ok(native.result.errors.some(e=>e.code==='DATA_CONTRACT_INVALID'));contractCases++;
 }
 for(const contract of [null,false,0,'']){
  const expected=[{id:'pixels',dataContract:contract}],native=await call({run:baseRun,expected,scheme,upstream},'audit_output_contracts');
  assert.deepEqual(compactAudit(native.result),compactAudit(auditDataContracts(baseRun,expected,{scheme,upstream})));contractCases++;
 }
 const invalidGraphs=[
  {nodes:[node('a')],edges:{}},
  {nodes:[node('a',{inputs:[]})],edges:[]},
  {nodes:[node('a',{prerequisites:{anyOf:'a'}})],edges:[]},
  {nodes:[node('a'),node('b',{when:{nodeId:'a',status:'unrecognized'}})],edges:[edge('a','b')]},
  {nodes:[node('a'),node('b',{inputs:{a:{nodeId:'a',artifactId:'undeclared'}}})],edges:[edge('a','b')]},
  {nodes:[node('a'),node('b')],edges:[edge('a','b'),edge('a','b')]},
  {nodes:[node('a',{parentId:'b'}),node('b',{parentId:'a'})],edges:[]},
  {nodes:[node('a'),node('b')],edges:[edge('a','b'),edge('b','a')]},
 ];
 for(const graph of invalidGraphs){const native=await call({scheme:{operatorGraph:graph},outcomes:{}});assert.match(native.error,/^SESSION_/);}
 report.rejectedInvalidGraphs=invalidGraphs.length;
 report.contractCases=contractCases;report.cases+=contractCases;
 // Native nodes in mixed sessions use the same response semantics as the
 // existing desktop single-node path. Verify the moved adapter independently.
 let adapters=0;
 for(const status of ['GOOD','SKEW','UNKNOWN'])for(const overlay of [false,true])for(const success of [false,true]){
  const native={runId:'native-result',durationMs:12.5,status:success?'OK':'FAULT',measurements:{width:12},nodes:[{op:'geometry.two_boundary',parameters:{threshold:3},parameterSources:{threshold:'test-fixture'},outputSummary:{status,lidPose:{x:2}},artifacts:[{id:'actual:feature-evidence',data:{search:{edgeCandidates:{count:3}}}},...(overlay?[{id:'actual:feature-overlay',type:'image',dataURL:'data:image/bmp;base64,AA==',width:4,height:3}]:[])]}]};
  const request={runtimePlan:{nodeId:'native'},sourceBinding:{images:[{imageId:'actual'}]},nativePipeline:{plan:{nodes:[]}}};
  const response=await call({native,request,elapsedMs:12.5},'adapt_native_session');assert.equal(response.error,undefined);
  const actual=response.result,expected=adaptNativePipelineResponse(native,request);
  delete actual.dispatchSourceBinding;delete actual.sourceBinding;
  assert.deepEqual(actual,expected,`native adapter ${status}/${overlay}/${success}`);adapters++;
 }
 report.adapterCases=adapters;report.cases+=adapters;
 // Exercise the production classifier's complete value/missing/conflict paths,
 // including typed equality and compound three-valued rules. No specimen-only
 // classifier or simplified evidence oracle is used.
 const categories=[{id:'GOOD',label:'合格',quality:'good'},{id:'BAD',label:'异常',quality:'bad'},{id:'UNKNOWN',label:'待确认',quality:'undetermined'}];
 const metrics=[{id:'x',type:'number',unit:'px',range:{min:-1,max:1}},{id:'flag',type:'boolean'},{id:'mode',type:'enum',values:['a','b','c']}];
 const rules=[{id:'range',categoryId:'GOOD',when:{metric:'x',interval:{min:-1,max:0,includeMin:true,includeMax:false}}},
  {id:'joint',categoryId:'BAD',defectLabels:['joint','shared'],when:{all:[{metric:'flag',equals:true},{not:{metric:'mode',in:['a','b']}}]}},
  {id:'either',categoryId:'UNKNOWN',defectLabels:['shared'],when:{any:[{metric:'mode',equals:'b'},{metric:'x',equals:1}]}},
  {id:'empty-labels',categoryId:'BAD',defectLabels:[],when:{metric:'mode',equals:'a'}}];
 const baseSpec={schema:'agentcv-classification-spec-1',id:'native-decision-parity',provenance:[{type:'human',ref:'QA contract',status:'confirmed'}],categories,metrics,rules,
  conflicts:{mode:'priority',priority:rules.map(r=>r.id)},coverage:{policy:'fallback',fallbackCategoryId:'UNKNOWN'},
  missing:{MISSING:'UNKNOWN',NOT_FOUND:'BAD',SKIPPED:'UNKNOWN'},aggregation:{mode:'priority',priority:['BAD','UNKNOWN','GOOD']},fault:{exit:'FAULT'}};
 const options=metrics.map(m=>[
  ...[...new Set([null,true,false,-2,-1,-0,0,0.5,1,2,'0','a','b','c'])].map(value=>({metric:m.id,value})),
  {metric:m.id,value:0,valid:false},...['NOT_FOUND','MISSING','SKIPPED'].map(status=>({metric:m.id,status})),null]);
 let classifications=0;
 const decisionResults=[];
 for(const conflict of ['priority','multilabel'])for(const reverse of [false,true]){
  const spec=structuredClone(baseSpec);spec.conflicts.mode=conflict;if(reverse){spec.aggregation.priority.reverse();spec.conflicts.priority.reverse();}
  assert.equal(compileClassificationSpec(spec).ok,true,JSON.stringify(compileClassificationSpec(spec)));
  for(const x of options[0])for(const flag of options[1])for(const mode of options[2]){
   const observations=[x,flag,mode].filter(Boolean),expected=classifyWorkpiece(spec,observations);
   const native=await call({spec,observations},'classify_workpiece');assert.equal(native.error,undefined);
   assert.deepEqual(native.result,expected,`classification ${classifications}: ${JSON.stringify(observations)}`);classifications++;
   if(decisionResults.length<25&&['CLASSIFIED','CLASSIFICATION_CONTRACT_ERROR'].includes(expected.status))decisionResults.push({spec,result:expected,observations});
  }
 }
 for(const type of ['boolean','number','enum'])for(const explicit of [false,true]){
  const spec=structuredClone(baseSpec),metric=metrics.find(m=>m.type===type);spec.metrics=[{...metric}];if(type==='number'&&!explicit)delete spec.metrics[0].type;
  const selected=type==='boolean'?true:type==='number'?0:'a';spec.rules=[{id:'selected',categoryId:'BAD',when:{metric:metric.id,equals:selected}}];spec.conflicts.priority=['selected'];spec.aggregation={mode:'all-good'};
  assert.equal(compileClassificationSpec(spec).ok,true);
  for(const observations of [[],[{metric:metric.id,value:selected}],[{metric:metric.id,value:selected},{metric:metric.id,status:'MISSING'}]])for(const faults of [[],[{nodeId:'actual-node',reason:'observed execution failure'}]]){
   const native=await call({spec,observations,faults},'classify_workpiece');assert.deepEqual(native.result,classifyWorkpiece(spec,observations,{faults}));classifications++;
  }
 }
 let evidenceCases=0;
 const evidenceRuns=['first','last'].map(id=>({runId:'actual-'+id,schemeNodeId:id,status:'SUCCEEDED',execution:{status:'COMPLETED'},workpieceUnit:{id:'actual-unit',imageIds:['original']},artifacts:[{id:'result',type:'image',name:'本次结果',sha256:id.repeat(16)}]}));
 const evidenceNodes=evidenceRuns.map(r=>({id:r.schemeNodeId,expected_outputs:[{id:'result',type:'image',role:'result'}]}));
 for(const {spec,result,observations} of [...decisionResults,...categories.map(category=>({spec:baseSpec,result:{valid:true,categoryId:category.id,quality:category.quality,matchedRuleIds:[],decisions:[]},observations:[]}))]){
  for(const status of ['COMPLETED','FAULT','CANCELLED'])for(const declared of [false,true])for(const mutation of ['none','other-unit','other-image','other-run','no-output','failed-last','duplicate-ref']){
   const scheme={classificationSpec:structuredClone(spec),operatorGraph:{nodes:evidenceNodes}},runs=structuredClone(evidenceRuns);
   if(declared){for(const collection of [scheme.classificationSpec.categories,scheme.classificationSpec.rules,scheme.classificationSpec.metrics])for(const item of collection)item.evidence=[{nodeId:'first',artifactId:'result',label:'声明结果'}];}
   if(mutation==='other-unit')runs[0].workpieceUnit.id='other-unit';if(mutation==='other-image')runs[0].workpieceUnit.imageIds=['other-image'];if(mutation==='other-run')runs[0].runId='other-run';if(mutation==='no-output')runs[0].artifacts=[];if(mutation==='failed-last')runs[1].status='FAILED';if(mutation==='duplicate-ref'&&declared)scheme.classificationSpec.categories.forEach(c=>c.evidence.push(c.evidence[0]));
   const record={unitId:'actual-unit',imageIds:['original'],schemeFingerprint:'frozen',execution:{status},result,observations:observations.map(o=>({...o,nodeId:'last'})),runIds:evidenceRuns.map(r=>r.runId),nodeStates:[{nodeId:'last',status:'SKIPPED',reason:'PREREQUISITE_UNAVAILABLE',blockedBy:['first']},{nodeId:'first',status:'NOT_FOUND'}]};
   const native=await call({scheme,record,runs},'decision_evidence');assert.equal(native.error,undefined);
   assert.deepEqual(native.result,normalized(buildDecisionEvidence(scheme,record,runs)),`decision evidence ${evidenceCases}`);evidenceCases++;
  }
 }
 report.classificationCases=classifications;report.decisionEvidenceCases=evidenceCases;report.cases+=classifications+evidenceCases;
 let combined=0;
 for(let combination=0;combination<125;combination++)for(const cancelled of [false,true])for(const sourcePath of ['value','nested.0','nested.length','nested.01','label.length']){
  const graph={nodes:[node('a'),node('b'),node('c')],edges:[]};let digits=combination;
  const outcomes=Object.fromEntries(graph.nodes.map(n=>{const kind=digits%5;digits=Math.floor(digits/5);const run=outcome(n.id,kind);if(run.result)Object.assign(run.result,{value:kind===0?0:1,flag:kind===0,mode:kind===0?'a':'c',nested:[0,1],label:'长度🌍'});return [n.id,run];}));
  const session=(await oracle({scheme:{operatorGraph:graph},outcomes})).result;
  for(const run of session.runs){run.schemeNodeId=run.runId.slice('actual-'.length);run.workpieceUnit={id:'actual-unit',imageIds:['original']};}
  const scheme={operatorGraph:graph,classificationSpec:baseSpec,metricBindings:[{metric:'x',nodeId:'a',path:sourcePath},{metric:'x',nodeId:'c',path:'value'},{metric:'flag',nodeId:'b',path:'flag'},{metric:'mode',nodeId:'c',path:'mode'}]};
  const request={scheme,unitId:'actual-unit',fingerprint:'frozen',shared:{workpieceUnit:{id:'actual-unit',imageIds:['original']}}};
  const observations=workpieceObservations(scheme,session.nodeStates,new Map(session.runs.map(r=>[r.schemeNodeId,r]))),faults=session.nodeStates.filter(n=>n.ownStatus==='FAULT');
  let result=cancelled?{valid:false,status:'CANCELLED',categoryId:null,categoryIds:[],defectLabels:[],quality:null}:classifyWorkpiece(baseSpec,observations,{faults});
  if(!cancelled&&!faults.length&&(!result.valid||result.categoryIds.length!==1)){faults.push({phase:'classification',reason:'FINAL_CATEGORY_NOT_UNIQUE',status:'FAULT',details:structuredClone(result)});result={...result,status:'FAULT',faults};}
  const record={unitId:request.unitId,imageIds:['original'],schemeFingerprint:'frozen',execution:{status:cancelled?'CANCELLED':faults.length?'FAULT':'COMPLETED'},result,observations,nodeStates:session.nodeStates,runIds:session.runs.map(r=>r.runId)};
  const native=await call({request,session,cancelled},'workpiece_decision');assert.equal(native.error,undefined);
  assert.deepEqual(native.result,normalized({observations,result,decisionEvidence:buildDecisionEvidence(scheme,record,session.runs),faults,cancelled}),`complete decision ${combined}`);combined++;
 }
 report.combinedDecisionCases=combined;report.cases+=combined;
 let productPolicyCases=0,productCases=0;
 const resolutions=[
  {expected:null,reason:'NO_IMAGE_EXPECTED_LABEL',origin:{kind:'image-expected',imageId:'original'}},
  {expected:null,reason:'EXPECTED_SOURCE_LABEL_UNMAPPED',origin:{kind:'image-source-meaning',label:'unmapped'}},
  {expected:null,reason:'EXPLICITLY_UNLABELLED',origin:{kind:'explicit-workpiece-expected'}},
  ...['GOOD','BAD','UNKNOWN','absent'].flatMap(id=>[
   {expected:{categoryIds:[id],provenance:{type:'human',status:'confirmed',ref:'actual-human-label'}},origin:{kind:'explicit-workpiece-expected'}},
   {expected:{categoryIds:[id],provenance:{type:'agent',status:'confirmed',ref:'prediction'}},origin:{kind:'image-expected'}}
  ]),
  {expected:{categoryIds:[],provenance:{type:'human',status:'confirmed',ref:'actual-human-label'}},origin:{kind:'multi-view'}},
  {expected:{categoryIds:['GOOD','BAD'],provenance:{type:'human',status:'confirmed',ref:'actual-human-label'}},origin:{kind:'multi-view'}},
  ...['',' ','\ufeff','\u0085',' manual '].map(ref=>({expected:{categoryIds:['GOOD'],provenance:{type:'human',status:'confirmed',ref}},origin:{kind:'image-expected'}}))
 ];
 const policyInputs=[undefined,'all',{},...['all','metadata','diagnostic'].flatMap(mode=>[
  {mode},{mode,sampleEvery:2,keepFirst:false,keepLast:false,keepFailures:false,keepNonGood:false},
  {mode,sampleEvery:3,keepFirst:true,keepLast:false,keepNonGood:false},
  {mode,sampleEvery:1,keepLast:true,keepFailures:true,keepNonGood:true},
  {mode,sampleEvery:0,keepFirst:null,keepLast:0,keepFailures:'yes',keepNonGood:[],note:'\ufeff'}
 ])];
 const policyRuns=[{runId:'actual-first',schemeNodeId:'first',status:'SUCCEEDED',execution:{status:'COMPLETED'},expectedOutputs:[{id:'declared',type:'image',role:'result'}],artifacts:[
  {id:'data',type:'json',data:{actual:[1,2,3]}},{id:'explicit',type:'image',role:'result'},
  {id:'binding',type:'image',contractBinding:{role:'intermediate'}},{id:'declared',type:'image'},{id:'fallback',type:'image'}]}];
 const policySpecs={categories:[{id:'GOOD',quality:'good'},{id:'BAD',quality:'bad'},{id:'UNKNOWN',quality:'undetermined'}]};
 for(const resolution of resolutions)for(const cancelled of [false,true])for(const failed of [false,true])for(const quality of ['good','bad','undetermined',null]){
  const result={valid:!failed,quality,categoryIds:[quality==='good'?'GOOD':quality==='bad'?'BAD':'UNKNOWN'],categoryId:quality==='good'?'GOOD':quality==='bad'?'BAD':'UNKNOWN'};
  const faults=failed?[{phase:'actual-execution',status:'FAULT',reason:'Observed failure'}]:[];
  const record={execution:{status:cancelled?'CANCELLED':failed?'FAULT':'COMPLETED'},result};
  const index=productPolicyCases%9,options={retention:policyInputs[productPolicyCases%policyInputs.length],unitIndex:index,total:productPolicyCases%4?9:null};
  const runs=structuredClone(policyRuns);if(failed)runs[0].execution.status='FAULT';
  const knownCategoryIds=productPolicyCases%5===0?[]:productPolicyCases%5===1?['GOOD']:undefined;
  const native=await call({spec:policySpecs,resolution,result,faults,cancelled,record,runs,options,knownCategoryIds},'inspection_product_policy');
  assert.equal(native.error,undefined);
  assert.deepEqual(native.result,normalized({regression:workpieceRegression(policySpecs,resolution,result,{faults,cancelled,knownCategoryIds}),retention:datasetArtifactRetentionDecision({record,runs},options)}),`product policy ${productPolicyCases}`);
  productPolicyCases++;
  if(productPolicyCases%3===0){
   const unit={id:'actual-unit',imageIds:['original',...(productPolicyCases%2?['second']:[])],views:productPolicyCases%2?{left:'original',right:'second'}:null};
   const referenceInputs=productPolicyCases%2?{master:'reference'}:{},referenceIdentities=productPolicyCases%2?{master:{imageId:'reference',width:20,height:10,contentSha256:'b'.repeat(64)}}:{};
   const request={unitId:unit.id,fingerprint:'unchanged-scheme',scheme:{classificationSpec:policySpecs},shared:{workpieceUnit:unit,referenceInputs},productContext:{expectedResolution:resolution,referenceIdentities,regressionCategoryIds:knownCategoryIds,retention:normalizeArtifactRetention(options.retention),unitIndex:index,total:options.total}};
   const decision={result,faults,cancelled},session={runs};
   const actual=await call({request,session,decision},'inspection_product');assert.equal(actual.error,undefined);
   const {known,regression}=workpieceRegression(policySpecs,resolution,result,{faults,cancelled,knownCategoryIds});
   assert.deepEqual(actual.result,normalized({backend:'rust-native-product-v1',known,recordFields:workpieceRecordFields({unit,imageIds:unit.imageIds,referenceInputs,referenceIdentities,fingerprint:request.fingerprint,runs,regression,result,faults,cancelled}),retention:datasetArtifactRetentionDecision({record,runs},options)}),`native product ${productCases}`);
   productCases++;
  }
 }
 // Exercise actual first/periodic/last boundaries across the same 1,000-unit
 // retention policy used by production batches, with mixed source declarations.
 let retentionBoundaryCases=0;
 for(let unitIndex=0;unitIndex<1000;unitIndex++){
  const result={valid:true,quality:'good',categoryId:'GOOD',categoryIds:['GOOD']},record={execution:{status:'COMPLETED'},result};
  const resolution=resolutions[0],options={retention:{mode:'diagnostic',sampleEvery:100},unitIndex,total:1000};
  const native=await call({spec:policySpecs,resolution,result,record,runs:policyRuns,options},'inspection_product_policy');assert.equal(native.error,undefined);
  assert.deepEqual(native.result.retention,datasetArtifactRetentionDecision({record,runs:policyRuns},options),`retention boundary ${unitIndex}`);retentionBoundaryCases++;
 }
 report.retentionBoundaryCases=retentionBoundaryCases;report.cases+=retentionBoundaryCases;
 report.productPolicyCases=productPolicyCases;report.productCases=productCases;report.cases+=productPolicyCases+productCases;
 const evidence=await verifyNativeEvidence(call);Object.assign(report,evidence);report.cases+=evidence.evidenceAuditCases+evidence.evidencePixelCases;
 const envelope=await verifyNativeRunEnvelope(call);Object.assign(report,envelope);report.cases+=envelope.runEnvelopeCases;
 const commit=await verifyNativeCommitProduct(call);Object.assign(report,commit);report.cases+=commit.commitProductCases;
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{child.stdin.end();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));if(output)await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
