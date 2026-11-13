import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildCurrentSchemeFlow} from '../src/current-scheme-flow.js';
import {schemeFingerprint} from '../src/purpose-compiler.js';
import {flowNodeTiming} from '../src/flow-node-presentation.js';
import {publishCompletedWorkpiece,retainCompletedWorkpieceOutput,publishWorkpieceExecution,clearWorkpieceExecution} from '../src/workpiece-live-state.js';

function fixture(){
 const scheme={id:'timing-retention',execution:{unit:'workpiece',inputSlots:[{id:'image',required:true}]},operatorGraph:{nodes:[{id:'prepare',title:'Prepare',code:'pass'},{id:'measure',title:'Measure',code:'pass'}],edges:[{from:'prepare',to:'measure'}]}};
 const basis=schemeFingerprint(scheme),record={unitId:'finished',imageIds:['first'],runIds:['prepare-run','measure-run'],nodeStates:[{nodeId:'prepare',status:'VALID',execution:{durationMs:0}},{nodeId:'measure',status:'VALID',execution:{durationMs:12.375}}]};
 const runs=record.runIds.map((runId,index)=>({runId,schemeNodeId:scheme.operatorGraph.nodes[index].id,status:'SUCCEEDED',durationMs:[0,12.375][index],sourceBinding:{schemeFingerprint:basis},workpieceUnit:{id:record.unitId,imageIds:record.imageIds},artifacts:[]}));
 const execution={id:'batch',status:'COMPLETED',processed:1,schemeFingerprint:basis,units:[record]},p={epoch:1,imageSelection:0,data:{activeId:'first',purposeScheme:scheme,datasetExecutions:[execution],algorithmRuns:runs,images:[{id:'first',name:'First',width:10,height:10},{id:'next',name:'Next',width:10,height:10}]}};
 publishCompletedWorkpiece(p,execution,record,runs);
 return {p,execution,record,runs,basis};
}
const operators=flow=>flow.flow.nodes.filter(n=>n.schemeNodeId);
function advance(f){f.p.imageSelection++;f.p.data.activeId='next';retainCompletedWorkpieceOutput(f.p,f.execution,{imageId:'first',nextImageId:'next',selectionRevision:f.p.imageSelection});}

test('auto advance retains exact completed durations and runs even after compact history evicts their rows',()=>{
 const f=fixture();assert.deepEqual(operators(buildCurrentSchemeFlow(f.p)).map(n=>n.durationMs),[0,12.375]);advance(f);
 f.p.data.algorithmRuns=[];f.execution.units=[{unitId:f.record.unitId,imageIds:['first'],runIds:f.record.runIds}];
 for(let i=0;i<20;i++){const flow=buildCurrentSchemeFlow(f.p);assert.equal(flow.unitId,'finished');assert.deepEqual(operators(flow).map(n=>n.durationMs),[0,12.375]);assert.deepEqual(flow.runIds,f.record.runIds);}
 // Human navigation invalidates process-local retention, including selecting
 // the same prepared next image. Explicit history must keep its own identity.
 f.p.imageSelection++;assert.ok(operators(buildCurrentSchemeFlow(f.p)).every(n=>n.durationMs===null));
 f.p.data.algorithmRuns=f.runs;assert.equal(buildCurrentSchemeFlow(f.p,{runId:'prepare-run'}).unitId,'finished');
});

test('continuous flow keeps last measured times while new nodes wait, and replaces each only with that node actual measurement',()=>{
 const f=fixture();f.execution.status='RUNNING';f.execution.processed=2;
 const live={executionId:'batch',unitId:'next-unit',imageIds:['next'],schemeFingerprint:f.basis,runIds:[],nodeStates:[{nodeId:'prepare',status:'RUNNING'},{nodeId:'measure',status:'PENDING'}]};publishWorkpieceExecution(f.p,live);
 let nodes=operators(buildCurrentSchemeFlow(f.p));assert.deepEqual(nodes.map(n=>n.durationMs),[0,12.375]);assert.ok(nodes.every(n=>n.timingPrevious===true));assert.match(flowNodeTiming(nodes[0]).description,/上一件/);assert.equal(nodes[0].status,'RUNNING');
 const run={...f.runs[0],runId:'next-prepare',durationMs:4.25,workpieceUnit:{id:'next-unit',imageIds:['next']}};f.p.data.algorithmRuns.push(run);live.runIds.push(run.runId);live.nodeStates[0]={nodeId:'prepare',status:'VALID',execution:{durationMs:4.25}};
 nodes=operators(buildCurrentSchemeFlow(f.p));assert.equal(nodes[0].durationMs,4.25);assert.equal(nodes[0].timingPrevious,false);assert.equal(nodes[1].durationMs,12.375);assert.equal(nodes[1].timingPrevious,true);
 live.nodeStates[1]={nodeId:'measure',status:'SKIPPED',reason:'BRANCH_NOT_SELECTED'};nodes=operators(buildCurrentSchemeFlow(f.p));assert.equal(nodes[1].durationMs,null,'a skipped branch cannot acquire an old time');
 clearWorkpieceExecution(f.p);f.execution.status='COMPLETED';f.p.data.activeId='next';f.p.data.algorithmRuns=[];
 assert.equal(buildCurrentSchemeFlow(f.p).unitId,'finished');assert.deepEqual(operators(buildCurrentSchemeFlow(f.p)).map(n=>n.durationMs),[0,12.375]);
 f.p.data.purposeScheme.operatorGraph.nodes[0].code='changed';assert.ok(operators(buildCurrentSchemeFlow(f.p)).every(n=>n.durationMs===null),'scheme edits invalidate retained timing');
});

test('flow duration labels survive repeated presentation and replace prior-unit annotation without relayout',async()=>{
 const {createHarness}=createRequire(import.meta.url)('./workflow-ui-harness.cjs'),h=await createHarness();
 try{const f=fixture(),map=h.api.inquiryView.programFlow.map;advance(f);const flow=buildCurrentSchemeFlow(f.p).flow;
  await map.update({flow,runId:'retained-timing'});const layout=map.layoutKey;
  const labels=()=>[...map.main.world.querySelectorAll('.flow-node-duration')].map(n=>n.textContent.replace(n.querySelector('title')?.textContent||'',''));
  assert.deepEqual(labels(),['0 ms','12.4 ms']);
  for(let i=0;i<10;i++)await map.update({flow:buildCurrentSchemeFlow(f.p).flow,runId:'retained-timing'});assert.deepEqual(labels(),['0 ms','12.4 ms']);
  const pending={...flow,nodes:flow.nodes.map(n=>n.schemeNodeId?{...n,timingPrevious:true}:n)};await map.update({flow:pending,runId:'retained-timing'});assert.match(map.main.world.querySelector('.flow-node-duration title').textContent,/上一件/);await map.update({flow,runId:'retained-timing'});assert.doesNotMatch(map.main.world.querySelector('.flow-node-duration title').textContent,/上一件/);assert.equal(map.layoutKey,layout);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
