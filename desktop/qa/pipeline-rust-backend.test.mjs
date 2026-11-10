import test from 'node:test';
import assert from 'node:assert/strict';
import {PipelineExecutor} from '../src/pipeline-executor.js';
import {algorithmCapabilities} from '../src/algorithm-workspace.js';
import {createPipelinePlan} from '../src/pipeline-registry.js';
import {migrateNativePlans} from '../src/native-plan-migration.js';
import {adaptNativePipelineResponse} from '../src/algorithm-workspace.js';
import {durableInspectionProduct} from '../src/inspection-records.js';

test('algorithm capabilities expose the Rust native typed-pipeline route separately from programmable Python',()=>{
 const capabilities=algorithmCapabilities();
 assert.equal(capabilities.nativePipeline.backend,'rust-native');
 assert.equal(capabilities.executionPolicy.defaultBackend,'rust-native');
 assert.equal(capabilities.executionPolicy.fallbackBackend,'python-extension');
 assert.ok(capabilities.nativePipeline.operators.includes('geometry.annulus'));
 assert.equal(capabilities.mode,'hybrid-native-first');
 assert.equal(capabilities.legacyMode,'programmable-python');
});

test('PipelineExecutor selects the native backend for the Rust-covered grayscale/Otsu subset', async()=>{
 let request;
 const executor=new PipelineExecutor({nativeExecute:async value=>{request=value;return {schema:'agentcv-pipeline-result-1',backend:'rust-native',status:'OK'};}});
 const plan={schema:'agentcv-pipeline-1',id:'native',revision:1,nodes:[
  {id:'gray',op:'image.grayscale',version:1,inputs:{image:'$image'},params:{}},
  {id:'segment',op:'segment.otsu',version:1,inputs:{image:'gray.image'},params:{polarity:'bright'}},
  {id:'components',op:'regions.components',version:1,inputs:{binary:'segment.binary'},params:{selection:'largest',minArea:1,excludeBoundary:false}},
  {id:'holes',op:'topology.holes',version:1,inputs:{region:'components.region'},params:{minHoleArea:1,positionTolerancePx:3}},
  {id:'rules',op:'rules.evaluate',version:1,inputs:{analysis:'holes.analysis'},params:{rules:[{id:'holes-zero',measurement:'closedHoleCount',equals:0}]}}
 ]};
 const result=await executor.execute({width:2,height:2,gray:new Uint8Array([0,255,0,255])},plan,{planFingerprint:'plan',pixelFingerprint:'pixels',inputIdentity:{imageId:'one'}});
 assert.equal(result.backend,'rust-native');assert.equal(request.plan.id,'native');assert.equal(request.image.grayEncoding,'base64-u8');assert.equal(request.image.grayBase64,'AP8A/w==');assert.equal(request.image.gray,undefined);
});

test('PipelineExecutor keeps unsupported built-in operators on the existing worker path', async()=>{
 const executor=new PipelineExecutor({nativeExecute:async()=>{throw Error('native should not run')}});
 const plan={schema:'agentcv-pipeline-1',id:'js',revision:1,nodes:[{id:'gear',op:'shape.gear',version:1,inputs:{region:'$image'},params:{expectedTeeth:4}}]};
 await assert.rejects(()=>executor.execute({width:1,height:1,gray:new Uint8Array([0])},plan,{}),error=>error.message!=='native should not run');
});

test('PipelineExecutor routes the Rust two-boundary core through the native backend',async()=>{
 let called=false;
 const executor=new PipelineExecutor({nativeExecute:async request=>{called=true;return {schema:'agentcv-pipeline-result-1',backend:'rust-native',status:'OK',request};}});
 const plan={schema:'agentcv-pipeline-1',id:'two-boundary',revision:1,nodes:[{id:'boundary',op:'geometry.two_boundary',version:1,inputs:{image:'$image'},params:{seedLevel:65}}]};
 const result=await executor.execute({width:2,height:2,gray:new Uint8Array([0,255,0,255])},plan,{});
 assert.equal(called,true);assert.equal(result.backend,'rust-native');assert.equal(result.request.plan.nodes[0].op,'geometry.two_boundary');
});

test('two_boundary is available as a typed Rust pipeline template',()=>{
 const plan=createPipelinePlan({task:'two_boundary',parameters:{features:{seedLevel:65}},rules:[]});
 assert.equal(plan.nodes[0].op,'geometry.two_boundary');
 assert.deepEqual(plan.nodes[0].inputs,{image:'$image'});
});

test('the existing two-boundary Python-authored node migrates to a Rust native plan without deleting its source',()=>{
 const node={id:'objects',title:'兩層邊界',code:"import cv2\nSIDES=['top']\ndef pose_from_edges(x): return x",parameters:{search:{seedLevel:65},lidPrior:{width:683,height:529},pkgPrior:{width:708,height:550},quality:{externalLevel:80,minIndependentSeparationPx:4,cornerRadius:65},decision:{pixelTolerancePx:4}}};
 const data={purposeScheme:{operatorGraph:{nodes:[node]}}};
 const result=migrateNativePlans(data);
 assert.equal(result.count,1);assert.equal(node.executionBackend,'rust-native');assert.equal(node.nativePlan.backend,'rust-native');assert.equal(node.nativePlan.plan.nodes[0].op,'geometry.two_boundary');assert.match(node.code,/pose_from_edges/);
});

test('a Rust native result is adapted into the existing algorithm-run contract',()=>{
 const native={runId:'rust-1',status:'OK',durationMs:2,measurements:{minClearancePx:4},nodes:[{id:'features',op:'geometry.two_boundary',status:'OK',parameters:{},artifacts:[{id:'features:feature-evidence',type:'evidence',data:{search:{geometry:{status:'GOOD'},decisionTrials:{trials:[]}}}},{id:'features:feature-overlay',type:'image',dataURL:'data:image/svg+xml;base64,AA==',width:4,height:4}],outputSummary:{status:'GOOD',lidPose:{width:3,height:2}}}]};
 const run=adaptNativePipelineResponse(native,{runtimePlan:{nodeId:'objects'},justification:{tool:{expectedEvidence:[]},parameters:[],boundaries:[]},nativePipeline:{plan:{nodes:[]}}});
 assert.equal(run.backend,'rust-native');assert.equal(run.language,'rust');assert.equal(run.status,'SUCCEEDED');assert.ok(run.artifacts.some(a=>a.id==='overlay'&&a.type==='image'));assert.equal(run.result.containedSupported,true);assert.equal(run.procedureTrace.schema,'agentcv-procedure-trace-1');
});

test('Rust inline SVG evidence remains a durable source for a single saved workpiece',()=>{
 const product=durableInspectionProduct({runs:[{runId:'rust-1',artifacts:[{id:'overlay',type:'image',pixelRetention:'full',dataURL:'data:image/svg+xml;base64,AA=='}]}]});
 assert.equal(product.runs[0].artifacts[0].dataURL,'data:image/svg+xml;base64,AA==');
});
