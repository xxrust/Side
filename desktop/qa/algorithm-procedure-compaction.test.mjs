// Adversarial historical-record unit tests, not fabricated CV/model acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {compactAlgorithmRun,readAlgorithmData} from '../src/algorithm-workspace.js';

function record(){
 const matrix=Array.from({length:640},(_,y)=>Array.from({length:960},(_,x)=>y*960+x));
 const nodes=Array.from({length:100},(_,i)=>({id:'edge',instanceId:`edge#${i+1}`,kind:'step',parentInstanceId:'inspect#1',dependsOn:['localize'],dependencyInstances:['localize#1'],status:'SUCCEEDED',judgement:'NG',artifactIds:['edges'],inputs:i===0?{pixels:matrix}:{image:'original'},outputs:{value:i},parameters:{threshold:40},justification:{tool:{reason:'Actual historical rationale '.repeat(1000)},parameters:[],boundaries:[]}}));
 return {runId:'historical-dense',code:'full original source',status:'SUCCEEDED',sourceBinding:{workflowRevision:0,images:[]},artifacts:[],procedureTrace:{schema:'agentcv-procedure-trace-1',nodes},evidenceAudit:{status:'DIAGNOSTIC_ONLY',procedureStatus:'DIAGNOSTIC_ONLY',errors:[],procedureAudit:{nodes:nodes.map(node=>({nodeId:node.instanceId,status:'DIAGNOSTIC_ONLY',errors:[]})),errors:[]}}};
}
test('dense historical matrices and loop instances compact below transport limit without losing trace identity or saved values',()=>{
 const run=record(),before=JSON.stringify(run),compact=compactAlgorithmRun(run),text=JSON.stringify(compact);
 assert.ok(before.length>5000000);assert.ok(text.length<220000,`compact response ${text.length} bytes`);assert.equal(compact.code,undefined);
 assert.equal(compact.procedureTrace.nodesTotal,100);assert.equal(compact.procedureTrace.nodesTruncated,true);assert.equal(compact.procedureTrace.nodes.length,24);
 const node=compact.procedureTrace.nodes[0];assert.equal(node.instanceId,'edge#1');assert.equal(node.status,'SUCCEEDED');assert.equal(node.judgement,'NG');assert.deepEqual(node.dependencyInstances,['localize#1']);assert.deepEqual(node.artifactIds,['edges']);assert.equal(node.inputs.pixels.count,640);assert.match(node.inputs.pixels.readWith,/procedureTrace.nodes.0.inputs.pixels/);
 assert.equal(compact.evidenceAudit.procedureStatus,'DIAGNOSTIC_ONLY');assert.equal(JSON.stringify(run),before,'compaction must never alter persisted trace or rationale');
 const project={data:{algorithmRuns:[run]},workflow:{revision:0},pixels:new Map()};
 const page=readAlgorithmData(project,{runId:run.runId,path:'procedureTrace.nodes',offset:24,limit:2});assert.equal(page.total,100);assert.equal(page.items[0].instanceId,'edge#25');assert.equal(page.items[1].instanceId,'edge#26');
 const row=readAlgorithmData(project,{runId:run.runId,path:'procedureTrace.nodes.0.inputs.pixels.639',offset:955,limit:5});assert.deepEqual(row.items,[614395,614396,614397,614398,614399]);assert.equal(JSON.stringify(run),before);
});
test('deep short arrays with giant strings are bounded and preserve exact retrieval instruction',()=>{
 const run={runId:'deep',status:'SUCCEEDED',artifacts:[],procedureTrace:{schema:'agentcv-procedure-trace-1',nodes:[{id:'a',instanceId:'a#1',kind:'step',status:'FAILED',error:{message:'e'.repeat(20000000)},outputs:{nested:[[{value:'x'.repeat(20000000)}]]}}]}};
 const compact=compactAlgorithmRun(run);assert.ok(JSON.stringify(compact).length<12000);assert.equal(compact.procedureTrace.nodes[0].error.message.length,20000000);assert.match(compact.procedureTrace.nodes[0].error.message.readWith,/procedureTrace.nodes.0.error.message/);assert.equal(run.procedureTrace.nodes[0].error.message.length,20000000);
});
