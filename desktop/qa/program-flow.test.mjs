import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProgramFlow,programFlowForAsset,programFlowNode} from '../src/program-flow.js';

// These are model-only records: they assert provenance and graph semantics,
// never serve as image/algorithm acceptance evidence.
const image={imageId:'camera-1',imageSha256:'original-sha'};
const record=()=>({runId:'run-a',title:'實際程序',status:'SUCCEEDED',codeSha256:'code-a',sourceBinding:{images:[image]},artifacts:[{id:'location',type:'image',sha256:'location-sha',traceNodeId:'locate#1'},{id:'defect',type:'image',sha256:'defect-sha',traceNodeId:'defects#1'}],procedureTrace:{schema:'agentcv-procedure-trace-1',nodes:[
 {id:'inspect',instanceId:'inspect#1',name:'檢測',kind:'procedure',parentInstanceId:null,status:'SUCCEEDED',judgement:'NG'},
 {id:'locate',instanceId:'locate#1',name:'定位',kind:'step',parentInstanceId:'inspect#1',status:'SUCCEEDED',judgement:'OK',artifactIds:['location'],justification:{tool:{reason:'保存的方法理由'}}},
 {id:'measure',instanceId:'measure#1',name:'尺寸',kind:'step',parentInstanceId:'inspect#1',status:'SUCCEEDED',judgement:'NG',dependsOn:['locate'],dependencyInstances:['locate#1']},
 {id:'defects',instanceId:'defects#1',name:'表面',kind:'step',parentInstanceId:'inspect#1',status:'SUCCEEDED',judgement:'OK',dependsOn:['locate'],dependencyInstances:['locate#1'],artifactIds:['defect']},
 {id:'retry',instanceId:'retry#1',name:'備用定位',kind:'step',parentInstanceId:'inspect#1',status:'SKIPPED',judgement:null,skipReason:'主路徑定位成功',condition:{enabled:false}}
 ]}});

test('builds nested true dependencies, shared prerequisites, skipped branches, and separates NG from execution failure',()=>{
 const run=record(),before=JSON.stringify(run),flow=buildProgramFlow({data:{algorithmRuns:[run]}});
 assert.equal(flow.nodes.length,6);assert.deepEqual(flow.roots,['run-a::run']);
 assert.equal(programFlowNode(flow,'run-a::measure#1').status,'SUCCEEDED');
 assert.equal(programFlowNode(flow,'run-a::measure#1').judgement,'NG');
 assert.equal(programFlowNode(flow,'run-a::retry#1').status,'SKIPPED');
 assert.equal(programFlowNode(flow,'run-a::retry#1').judgement,null);
 assert.deepEqual(flow.edges.filter(e=>e.kind==='dependency').map(e=>[e.from,e.to]),[['run-a::locate#1','run-a::measure#1'],['run-a::locate#1','run-a::defects#1']]);
 assert.deepEqual(programFlowNode(flow,'run-a::inspect#1').artifacts.map(a=>a.id),['location','defect']);
 assert.equal(programFlowNode(flow,'run-a::inspect#1').ownArtifacts.length,0);
 assert.deepEqual(programFlowNode(flow,'run-a::locate#1').justification,run.procedureTrace.nodes[1].justification);
 flow.nodes[0].sourceImages[0].imageId='changed';assert.equal(JSON.stringify(run),before,'reading the graph cannot mutate saved provenance');
});

test('reverse lookup chooses exact producer and rejects mismatched/missing output provenance without latest-run fallback',()=>{
 const first=record(),second={...record(),runId:'run-b',codeSha256:'code-b'},runs=[first,second];
 const asset={source:{runId:'run-a',artifactId:'location',artifactSha256:'location-sha',codeSha256:'code-a'}};
 const found=programFlowForAsset(runs,asset);assert.equal(found.nodes[0].id,'run-a::locate#1');
 for(const changed of [{runId:'removed'},{artifactId:'removed'},{artifactSha256:'wrong'},{codeSha256:'wrong'}]){
  const result=programFlowForAsset(runs,{source:{...asset.source,...changed}});assert.equal(result.nodes.length,0);assert.ok(result.unavailable);
 }
 const original=programFlowForAsset(runs,{source:{imageId:image.imageId,inputSha256:image.imageSha256}});
 assert.equal(original.nodes.length,2);assert.equal(programFlowForAsset(runs,{source:{imageId:image.imageId,inputSha256:'wrong'}}).nodes.length,0);
});

test('legacy runs remain a single explicitly undecomposed program and unknown schemas are never guessed',()=>{
 const run=record();delete run.procedureTrace;const flow=buildProgramFlow([run]);
 assert.equal(flow.nodes.length,1);assert.equal(flow.nodes[0].legacy,true);assert.equal(flow.edges.length,0);
 assert.equal(programFlowForAsset([run],{source:{runId:run.runId,artifactId:'location'}}).nodes[0].id,'run-a::run');
 run.procedureTrace={schema:'future-schema',nodes:record().procedureTrace.nodes};
 const future=buildProgramFlow([run]);assert.equal(future.nodes.length,1);assert.ok(future.diagnostics.some(d=>d.code==='UNSUPPORTED_TRACE'));
});

test('repeated procedure calls retain exact instance dependencies and missing bindings produce diagnostics',()=>{
 const run=record();run.procedureTrace.nodes=[
  {id:'loop',instanceId:'loop#1',kind:'procedure',status:'SUCCEEDED'},
  {id:'locate',instanceId:'locate#1',parentInstanceId:'loop#1',status:'SUCCEEDED'},
  {id:'locate',instanceId:'locate#2',parentInstanceId:'loop#1',status:'SUCCEEDED',dependencyInstances:['locate#1']},
  {id:'inspect',instanceId:'inspect#1',parentInstanceId:'missing',status:'FAILED',judgement:'UNKNOWN',dependencyInstances:['missing'],error:{type:'ValueError',message:'不足'}}
 ];
 const flow=buildProgramFlow([run]);assert.equal(flow.nodes.length,5);
 assert.deepEqual(flow.edges.filter(e=>e.kind==='dependency').map(e=>[e.from,e.to]),[['run-a::locate#1','run-a::locate#2']]);
 assert.equal(programFlowNode(flow,'run-a::inspect#1').status,'FAILED');
 assert.equal(programFlowNode(flow,'run-a::inspect#1').judgement,'UNKNOWN');
 assert.ok(flow.diagnostics.some(d=>d.code==='MISSING_PARENT'));
 assert.ok(flow.diagnostics.some(d=>d.code==='MISSING_DEPENDENCY'));
 assert.ok(flow.diagnostics.some(d=>d.code==='MISSING_ARTIFACT_PRODUCER'));
});

test('malformed saved parent cycles cannot create an endlessly expanding panel tree',()=>{
 const run=record();run.procedureTrace.nodes=[
  {id:'a',instanceId:'a#1',parentInstanceId:'b#1',kind:'procedure',status:'SUCCEEDED'},
  {id:'b',instanceId:'b#1',parentInstanceId:'a#1',kind:'procedure',status:'SUCCEEDED'}
 ];
 const flow=buildProgramFlow([run]);
 assert.ok(flow.nodes.filter(n=>n.kind!=='run').every(n=>n.parentId==='run-a::run'));
 assert.equal(flow.diagnostics.filter(d=>d.code==='CYCLIC_PARENT').length,2);
});
