import test from 'node:test';import assert from 'node:assert/strict';
import {artifactDisplayPreview} from '../src/display-preview.js';
import {beginNativePreviewPrefetch,takeVerifiedNativePreview} from '../src/native-preview-prefetch.js';
function fixture(){const o={kind:'runtime-memory',runId:'run',artifactId:'overlay',scope:'unit',mime:'image/bmp',token:'a'.repeat(64),sha256:'c'.repeat(64)},p={...o,artifactId:'overlay#display-preview',token:'b'.repeat(64),sha256:'d'.repeat(64)};return {id:'overlay',type:'image',width:1280,height:1024,dataUrl:'agentcv-memory://localhost/'+o.token,displayPreview:{schema:'agentcv-display-preview-1',sampling:'bilinear-pixel-centers',src:'agentcv-memory://localhost/'+p.token,width:768,height:614,reference:p,originalReference:o}};}
test('only exact derivative and original ownership can become a display source',()=>{const a=fixture();assert.equal(artifactDisplayPreview(a,'run').width,768);assert.equal(artifactDisplayPreview({}),undefined);for(const mutate of [a=>a.displayPreview.reference.runId='other',a=>a.displayPreview.originalReference.runId='other',a=>a.displayPreview.reference.scope='other',a=>a.displayPreview.reference.artifactId='other',a=>a.displayPreview.originalReference.artifactId='other',a=>a.displayPreview.src=a.dataUrl,a=>a.dataUrl='https://example.com',a=>a.displayPreview.width=2000,a=>a.displayPreview.height=0,a=>a.displayPreview.reference.sha256='invalid',a=>a.displayPreview.sampling='unknown']){const bad=fixture();mutate(bad);assert.throws(()=>artifactDisplayPreview(bad,'run'),/身份不一致/);}});
test('speculative derivative transfers only after final matching original binding',async()=>{class Image{decode(){return Promise.resolve();}removeAttribute(){}}const a=fixture(),p=a.displayPreview,lease=beginNativePreviewPrefetch({ImageClass:Image});try{lease.stage([{src:p.src,width:p.width,height:p.height,nodeId:'node',artifactId:'overlay'}]);assert.equal(takeVerifiedNativePreview(p),null);lease.complete({runs:[{schemeNodeId:'node',runId:'run',artifacts:[a]}]});assert.ok(takeVerifiedNativePreview(p));assert.equal(takeVerifiedNativePreview({src:a.dataUrl,width:a.width,height:a.height}),null);}finally{lease.dispose();}});

test('process-local preview references never persist into project recovery or durable products',async()=>{
 const {serializeProject}=await import('../src/project-serialization.js'),{compactSessionProject}=await import('../src/app-session.js'),{durableInspectionProduct}=await import('../src/inspection-records.js');
 const a=fixture(),run={runId:'run',artifacts:[a]},project={images:[],algorithmRuns:[run]};
 assert.equal(JSON.parse(serializeProject(project)).algorithmRuns[0].artifacts[0].displayPreview,undefined);
 assert.equal(compactSessionProject(project).algorithmRuns[0].artifacts[0].displayPreview,undefined);
 assert.equal(durableInspectionProduct({runs:[run]}).runs[0].artifacts[0].displayPreview,undefined);
 assert.equal(a.displayPreview.schema,'agentcv-display-preview-1','live source must remain intact');
});

test('fitted preview budget covers physical pixels without sizing unused viewport area',async()=>{
 const {fittedPreviewLimit:f}=await import('../src/display-preview.js');const source={width:1280,height:1024};
 assert.equal(f({width:350,height:500},source,{pixelRatio:2}),672);
 assert.equal(f({width:500,height:350},{width:1024,height:1280},{pixelRatio:2}),672);
 assert.equal(f({width:350,height:500},source,{pixelRatio:1}),352);
 assert.equal(f({width:1000,height:900},source,{pixelRatio:2}),null,'original is already smaller than physical demand');
 assert.equal(f({width:0,height:500},source),null);assert.equal(f({width:350,height:500},null),null);
 for(const width of [75,200,350,513])for(const height of [100,300,500])for(const ratio of [1,1.5,2,3]){
  const limit=f({width,height},source,{pixelRatio:ratio});if(limit===null)continue;
  const scale=Math.min((width-20)/1280,(height-20)/1024)*ratio;
  assert.ok(limit/1280>=scale);assert.ok(Math.round(limit*1024/1280)/1024>=scale,'rounded shorter side must retain enough pixels');
 }
});
