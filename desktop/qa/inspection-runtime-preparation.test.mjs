import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareInspectionRuntime} from '../src/inspection-runtime-preparation.js';
import {schemeFingerprint} from '../src/purpose-compiler.js';
test('preparation sends exact current definition and never dispatches an algorithm or publishes a run',async()=>{
 const scheme={execution:{unit:'workpiece'},operatorGraph:{nodes:[{id:'native',nativePlan:{}},{id:'python',code:'raise Exception("must not execute")',parameters:{limit:3},expected_outputs:[]}]}};
 const project={data:{purposeScheme:scheme,algorithmRuns:[]}},before=JSON.stringify(project);let count=0;
 const result=await prepareInspectionRuntime(project,async(name,{request})=>{count++;assert.equal(name,'prepare_inspection_runtime');assert.equal(request.runtimePlan.fingerprint,schemeFingerprint(scheme));assert.deepEqual(request.runtimePlan.definition,scheme);assert.equal(request.code,scheme.operatorGraph.nodes[1].code);assert.equal(request.runtimePlan.nodeId,'python');return {ready:true,calls:0};});
 assert.equal(count,1);assert.equal(result.calls,0);assert.equal(JSON.stringify(project),before);
});
test('program preparation timing preserves native fields and treats the residual as diagnostic',async()=>{
 const {prepareInspectionPrograms}=await import('../src/inspection-runtime-preparation.js');
 const scheme={execution:{unit:'workpiece'},operatorGraph:{nodes:[{id:'python',code:'pass'}]}};
 for(const totalMs of [2,undefined,-1,NaN]){
  const original={calls:0,compileMs:1,commandTiming:{totalMs}},receipt=await prepareInspectionPrograms(scheme,async()=>original);
  assert.equal(receipt.compileMs,1);assert.equal(original.clientTiming,undefined);assert.equal(receipt.commandTiming,original.commandTiming);
  assert.ok(receipt.clientTiming.invokeMs>=0);
  if(Number.isFinite(totalMs)&&totalMs>=0)assert.equal(receipt.clientTiming.unattributedMs,receipt.clientTiming.invokeMs-totalMs);
  else assert.equal(receipt.clientTiming.unattributedMs,undefined);
  assert.match(receipt.clientTiming.scope,/no cycle time subtracted/);
 }
});
test('empty/native-only projects need no Python preparation and preparation failure remains visible to startup',async()=>{
 for(const scheme of [null,{execution:{unit:'workpiece'},operatorGraph:{nodes:[{nativePlan:{},code:'native'}]}}])assert.equal(await prepareInspectionRuntime({data:{purposeScheme:scheme}},()=>assert.fail('unexpected invocation')),null);
 await assert.rejects(prepareInspectionRuntime({data:{purposeScheme:{execution:{unit:'workpiece'},operatorGraph:{nodes:[{id:'x',code:'pass'}]}}}},async()=>{throw Error('library missing');}),/library missing/);
});
test('explicit batch compilation uses its own command with the exact validated definition',async()=>{
 const {prepareInspectionPrograms}=await import('../src/inspection-runtime-preparation.js');
 const scheme={execution:{unit:'workpiece'},operatorGraph:{nodes:[{id:'python',code:'raise RuntimeError("not executed")',parameters:{},expected_outputs:[]}]}};
 const receipt=await prepareInspectionPrograms(scheme,async(command,{request})=>{assert.equal(command,'prepare_inspection_programs');assert.equal(request.runtimePlan.definition,scheme);return {calls:0};});assert.equal(receipt.calls,0);
});
