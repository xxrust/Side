import assert from 'node:assert/strict';
import {assembleWorkpieceRecord} from '../src/workpiece-runner.js';
import {workpieceRegression,workpieceRecordFields} from '../src/workpiece-product.js';
import {normalizeArtifactRetention,datasetArtifactRetentionDecision,applyDatasetArtifactRetention} from '../src/artifact-retention.js';
import {durableInspectionProduct} from '../src/inspection-records.js';
import {rememberNativeExecutionFacts} from '../src/execution-facts.js';
const normalized=value=>JSON.parse(JSON.stringify(value));
export async function verifyNativeCommitProduct(call){
 let commitProductCases=0;
 const spec={categories:[{id:'GOOD',quality:'good'},{id:'BAD',quality:'bad'}]};
 for(const cancelled of [false,true])for(const failed of [false,true])for(const ready of [false,true])for(const mode of ['metadata','all','diagnostic'])for(const referenced of [false,true])for(const unitIndex of [0,1]){
  const unit={id:'actual-unit',imageIds:['actual-original'],views:null,note:'Preserve full unit metadata'},referenceInputs={master:'actual-reference'},referenceIdentities={master:{imageId:'actual-reference',sha256:'a'.repeat(64)}};
  const resolution={expected:{categoryIds:['GOOD'],provenance:{type:'human',status:'confirmed',ref:'Actual human label'}},origin:{kind:'explicit-unit'}};
  const faults=failed?[{nodeId:'actual-node',ownStatus:'FAULT',status:'FAULT',error:{message:'Observed failure'}}]:[];
  const result=cancelled?{valid:false,status:'CANCELLED',categoryId:null,categoryIds:[],defectLabels:[],quality:null}:{valid:!failed,status:failed?'FAULT':'CLASSIFIED',categoryId:failed?null:'GOOD',categoryIds:failed?[]:['GOOD'],defectLabels:[],quality:failed?null:'good'};
  const nodeStates=failed?faults:[{nodeId:'actual-node',ownStatus:'VALID',status:'VALID',evidenceStatus:ready?'READY_FOR_REVIEW':'DIAGNOSTIC_ONLY'}];
  const runs=[{runId:'actual-run',schemeNodeId:'actual-node',status:failed?'FAILED':'SUCCEEDED',execution:{status:failed?'FAULT':'COMPLETED'},
   workpieceUnit:{id:unit.id,imageIds:unit.imageIds,views:null},code:'unchanged actual code',result:{actual:3},procedureTrace:{nodes:[]},
   timing:{native:{totalMs:3}},evidenceAudit:{status:ready?'READY_FOR_REVIEW':'DIAGNOSTIC_ONLY',procedureStatus:ready?'READY_FOR_REVIEW':'DIAGNOSTIC_ONLY'},
   expectedOutputs:[{id:'actual-image',role:'result',type:'image'}],
   artifacts:[{id:'actual-json',type:'json',data:{actual:3,dataURL:'nested inline omitted'},...(referenced?{memoryRef:{kind:'runtime-memory',token:'actual-bytes'}}:{})},
    {id:'actual-image',type:'image',width:20,height:10,dataURL:'data:image/bmp;base64,AA==',...(referenced?{path:'C:/owned/outputs/actual.bmp'}:{})}]}];
  if(referenced){Object.assign(runs[0],{nativeFactRef:{kind:'runtime-memory',runId:'actual-run',artifactId:'__execution_facts',token:'actual-facts'},nativeFactFields:['result','procedureTrace','code']});rememberNativeExecutionFacts(runs[0]);}
  const observations=[{metric:'actual',value:3,valid:true,status:'MEASURED',nodeId:'actual-node',runId:'actual-run'}],decisionEvidence={schema:'actual-evidence',unitId:unit.id};
  const options={retention:normalizeArtifactRetention({mode,sampleEvery:100}),unitIndex,total:2};
  const request={sessionId:'actual-session',executionId:'actual-execution',unitId:unit.id,fingerprint:'actual-scheme',scheme:{classificationSpec:spec},
   runEnvelopeBackend:'rust-native-run-v1',evidenceAuditBackend:'rust-native-evidence-v1',commit:{backend:'rust-native-commit-v1',unit,workspaceRoot:'C:/actual.agentcv',cleanupRuntime:true},
   shared:{workpieceUnit:runs[0].workpieceUnit,referenceInputs},productContext:{expectedResolution:resolution,referenceIdentities,retention:options.retention,regressionCategoryIds:['GOOD','BAD'],unitIndex,total:2}};
  const regression=workpieceRegression(spec,resolution,result,{faults,cancelled,knownCategoryIds:['GOOD','BAD']});
  const recordFields=workpieceRecordFields({unit,imageIds:unit.imageIds,referenceInputs,referenceIdentities,fingerprint:request.fingerprint,runs,regression:regression.regression,result,faults,cancelled});
  const at='2026-11-12T05:10:00.123Z',nativeMs=7;
  const timing={clock:'monotonic',totalMs:nativeMs,scope:'native session start through terminal decision; excludes queue, frontend input preparation, durable commit and browser import/presentation',includes:['native-preparation','node-dispatch','algorithm','artifact-verification','native-decision'],excludes:['durable-save','browser-import','post-unit-presentation','Agent-planning']};
  const record=assembleWorkpieceRecord({recordFields,faults,cancelled,result,runs,observations,nodeStates,timing,at});record.decisionEvidence=decisionEvidence;
  record.nativeCommit={backend:'rust-native-commit-v1',sessionId:request.sessionId,verificationScope:'native-before-browser-import',terminalStatus:record.execution.status};
  const product={executionId:request.executionId,unit,record,runs,context:{schemeFingerprint:request.fingerprint,...(unitIndex===0?{scheme:request.scheme}:{})},workspaceRoot:request.commit.workspaceRoot,cleanupRuntime:true};
  const retention=datasetArtifactRetentionDecision(product,options);
  const session={runs,nodeStates,decision:{cancelled,faults,result,observations,decisionEvidence,product:{backend:'rust-native-product-v1',recordFields,retention}}};
  const actual=await call({request,session,nativeMs,at},'inspection_commit_product');assert.equal(actual.error,undefined,JSON.stringify(actual));
  const expected=durableInspectionProduct(applyDatasetArtifactRetention(product,retention).product);
  assert.deepEqual(actual.result,normalized(expected),`native durable product ${commitProductCases}`);commitProductCases++;
 }
 return {commitProductCases};
}
