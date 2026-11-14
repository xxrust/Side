import {externalRunPayload} from '../src/external-run-files.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticRerun} from '../src/diagnostic-capture.js';
import {compactAlgorithmRun,readAlgorithmRunData} from '../src/algorithm-workspace.js';
import {executeWorkpieceTool} from '../src/agent-workpiece-tools.js';
const run=()=>({runId:'original',compilation:{schemeFingerprint:'exact-scheme'},workpieceUnit:{id:'one',imageIds:['actual-image'],views:{top:'actual-image'}},artifacts:[],procedureTrace:{schema:'agentcv-procedure-trace-1',capture:{mode:'essential'},nodes:[{outputs:{model:{schema:'agentcv-uncaptured-procedure-value-1',status:'NOT_CAPTURED'}}}]}});
test('uncaptured reads describe a new explicitly selected diagnostic run, never empty historical data',()=>{
 const value=run(),read=readAlgorithmRunData(value,{path:'procedureTrace.nodes.0.outputs.model'});
 assert.equal(read.type,'not-captured');assert.equal(read.status,'NOT_CAPTURED');assert.equal(read.value,undefined);
 assert.deepEqual(read.diagnosticRerun.arguments,{image_ids:['actual-image'],views_json:'{"top":"actual-image"}',diagnostics:true,expected_scheme_fingerprint:'exact-scheme'});
 assert.equal(externalRunPayload(value).data.diagnosticRerun.arguments.diagnostics,true);
 assert.equal(compactAlgorithmRun(value).procedureTrace.capture.mode,'essential');assert.equal(compactAlgorithmRun(value).diagnosticRerun.originalRunId,'original');
 delete value.compilation;assert.equal(diagnosticRerun(value).available,false);
 delete value.procedureTrace.capture;assert.equal(diagnosticRerun(value),null);
});
test('Agent diagnostic action requires explicit selection and forwards capture and identity guard',async()=>{
 let options;const agent={p:{epoch:1},turn:2,visualBoardId:()=>null,ui:{runPurposeScheme:async o=>{options=o;return {runs:[]};},refresh(){}}};
 await assert.rejects(executeWorkpieceTool(agent,'run_workpiece_scheme',{board_id:'b',diagnostics:true}),/明確指定/);
 await executeWorkpieceTool(agent,'run_workpiece_scheme',{board_id:'b',image_ids:['actual-image'],diagnostics:true,expected_scheme_fingerprint:'original-fingerprint'});
 assert.equal(options.diagnostics,true);assert.equal(options.expectedSchemeFingerprint,'original-fingerprint');assert.deepEqual(options.units[0].imageIds,['actual-image']);
 await assert.rejects(executeWorkpieceTool(agent,'run_dataset_scheme',{board_id:'b',diagnostics:true}),/明確指定/);
});

test('optional JSON reports unavailability and cannot satisfy typed or consumed ports',async()=>{
 const {auditDataContracts}=await import('../src/data-contract.js');
 const {isUncapturedArtifact}=await import('../src/diagnostic-capture.js');
 const artifact={id:'model',type:'json',storage:'not-captured',collection:{schema:'agentcv-artifact-capture-1',status:'NOT_CAPTURED',reason:'routine-inspection',recovery:'rerun-selected-workpiece-with-diagnostics'},hostCollectionVerified:true,hostBytesVerified:false};
 const value={...run(),schemeNodeId:'producer',status:'SUCCEEDED',execution:{status:'COMPLETED'},artifacts:[artifact]};
 const expected=[{id:'model',type:'evidence',dataContract:{kind:'json'}}],scheme={operatorGraph:{nodes:[{id:'producer'}]}};
 const audit=auditDataContracts(value,expected,{scheme});assert.equal(audit.valid,true);assert.equal(audit.bindings.model.collection.status,'NOT_CAPTURED');
 assert.equal(readAlgorithmRunData(value,{artifactId:'model'}).type,'not-captured');
 assert.equal(auditDataContracts(value,[{...expected[0],dataContract:{kind:'measurement',unit:'px'}}],{scheme}).valid,false);
 scheme.operatorGraph.nodes.push({id:'consumer',inputs:{input:{nodeId:'producer',artifactId:'model'}}});
 assert.equal(auditDataContracts(value,expected,{scheme}).valid,false);
 assert.equal(isUncapturedArtifact({...artifact,data:{}}),false);assert.equal(isUncapturedArtifact({...artifact,sha256:'fake'}),false);
});
