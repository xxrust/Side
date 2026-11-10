import test from 'node:test';
import assert from 'node:assert/strict';
import {retainDatasetArtifacts} from '../src/artifact-retention.js';

const product=(quality='good')=>({record:{execution:{status:'COMPLETED'},result:{quality}},runs:[{status:'SUCCEEDED',artifacts:Array.from({length:15},(_,i)=>({id:`stage-${i}`,type:'image',path:`/runtime/stage-${i}.png`,assetRef:{path:`/runtime/stage-${i}.png`},sha256:`hash-${i}`,width:512,height:480}))}]});

test('1000-piece diagnostic retention keeps facts for every unit but bounds image pixels to samples',()=>{
 let retained=0,metadataOnly=0;
 for(let index=0;index<1000;index++){
  const {product:durable,decision}=retainDatasetArtifacts(product(),{retention:{mode:'diagnostic',sampleEvery:100},unitIndex:index,total:1000});
  retained+=decision.retainedImageArtifacts;metadataOnly+=decision.metadataOnlyImageArtifacts;
  assert.equal(durable.record.artifactRetention.metadataOnlyImageArtifacts,decision.metadataOnlyImageArtifacts);
  assert.equal(durable.runs[0].artifacts.length,15);
  assert.ok(durable.runs[0].artifacts.every(a=>a.pixelRetention==='full'||a.pixelRetention==='metadata-only'));
 }
 assert.equal(retained,11*15,'首件、每100件樣本與最後一件保留完整像素');
 assert.equal(metadataOnly,989*15);
});

test('fault and non-good workpieces retain all real image evidence',()=>{
 for(const quality of ['bad','undetermined']){
  const {decision}=retainDatasetArtifacts(product(quality),{retention:{mode:'diagnostic',sampleEvery:100},unitIndex:37,total:1000});
  assert.equal(decision.retainedImageArtifacts,15);
 }
 const fault=product('good');fault.record.execution.status='FAULT';
 assert.equal(retainDatasetArtifacts(fault,{retention:{mode:'diagnostic'},unitIndex:37,total:1000}).decision.retainedImageArtifacts,15);
});

test('single-workpiece full mode keeps all image pixels',()=>{
 const {product:durable,decision}=retainDatasetArtifacts(product(),{retention:{mode:'all'},unitIndex:0,total:1});
 assert.equal(decision.metadataOnlyImageArtifacts,0);
 assert.ok(durable.runs[0].artifacts.every(a=>a.path&&a.assetRef));
});
