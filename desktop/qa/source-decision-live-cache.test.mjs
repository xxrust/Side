import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSourceDecisionEvidence} from '../src/source-decision-evidence.js';
import {captureWorkpieceArtifactPixels,beginWorkpieceArtifactPixels} from '../src/workpiece-live-state.js';
import {schemeFingerprint} from '../src/purpose-compiler.js';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('current workpiece evidence loads from process memory when durable pixels are omitted',async()=>{
 const scheme={id:'scheme-live',execution:{unit:'workpiece',referenceInputs:{}},classificationSpec:{categories:[{id:'ok',label:'OK',quality:'good'}]}};
 const fingerprint=schemeFingerprint(scheme),run={runId:'run-live',schemeNodeId:'measure',status:'SUCCEEDED',execution:{status:'COMPLETED'},workpieceUnit:{id:'unit-live',imageIds:['image-live']},artifacts:[{id:'evidence',type:'image',sha256:'evidence-sha',dataURL:png}]};
 const project={data:{images:[{id:'image-live',name:'current.bmp',sha256:'input-sha'}],purposeScheme:scheme,visualInquiry:{boards:[{projectSpaces:{sources:[{id:'source-live',imageIds:['image-live']}]}}]},datasetExecutions:[{id:'execution-live',sourceId:'source-live',schemeFingerprint:fingerprint,units:[{unitId:'unit-live',imageIds:['image-live'],execution:'COMPLETED',categoryId:'ok',finalExit:'PRODUCT:ok',runIds:['run-live'],result:{valid:true,categoryId:'ok',quality:'good'}}]}],algorithmRuns:[run]}};
 const record=project.data.datasetExecutions[0].units[0];record.schemeFingerprint=fingerprint;record.decisionEvidence={schema:'agentcv-decision-evidence-1',unitId:'unit-live',imageIds:['image-live'],schemeFingerprint:fingerprint,categoryId:'ok',status:'COMPLETED',reasons:[{id:'category:ok',title:'OK',kind:'category',images:[{runId:'run-live',nodeId:'measure',artifactId:'evidence',sha256:'evidence-sha'}]}],notExecuted:[]};
 captureWorkpieceArtifactPixels(project,'unit-live',[run]);
 assert.equal(run.artifacts[0].dataURL,undefined);
 const model=await loadSourceDecisionEvidence(project,{imageId:'image-live',sourceId:'source-live'});
 assert.equal(model.state,'READY');
 assert.equal(await model.loadImage(model.reasons[0].images[0]),png);
 beginWorkpieceArtifactPixels(project,'unit-next');
 await assert.rejects(model.loadImage(model.reasons[0].images[0]),/尚無可讀取的持久資產/);
});
