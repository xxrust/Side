import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createPipelineHarness as createHarness,importActualExamples} from './pipeline-component-harness.mjs';

test('rectangular camera image uses before/after large panes and real processing thumbnails',async()=>{
 const h=await createHarness();try{
  const c=h.w.document.createElement('canvas');c.width=768;c.height=432;const ctx=c.getContext('2d'),im=ctx.createImageData(c.width,c.height);
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const dx=x-384,dy=y-216,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx),inside=r<120+8*Math.cos(14*a)&&r>30,v=inside?255:0,i=(y*c.width+x)*4;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255}ctx.putImageData(im,0,0);
  await h.api.addImages([{name:'rectangular-camera.png',dataUrl:c.toDataURL()}]);const p=h.api.project;p.createPipeline({task:'gear',parameters:{features:{expectedTeeth:14}}});await p.runPipelineImage();await h.api.go(6);const v=h.api.pipelineView;v.select('features');await h.tick();
  assert.equal(v.mode,'compare');assert.equal(v.canvases.length,2);assert.match(v.container.querySelector('.pipeline-pane figcaption').textContent,/前一步/);assert.match(v.container.querySelectorAll('.pipeline-pane figcaption')[1].textContent,/本步/);
  assert.equal(v.container.querySelectorAll('.pipeline-stage-image canvas').length,4);assert.equal(v.container.querySelector('.pipeline-stage-caption strong').textContent,'1 原圖');assert.equal(v.container.querySelector('[data-pipeline-node="segment"]'),null);
  const sha=p.image.sha256,plan=JSON.stringify(p.workflow.pipelinePlan),measurements=JSON.stringify(p.image.pipelineResult.measurements);v.container.querySelector('[data-pipeline-extent="workpiece"]').click();await h.tick();assert.equal(v.extent,'workpiece');assert.equal(p.image.width,768);assert.equal(p.image.height,432);assert.equal(p.image.sha256,sha);assert.equal(JSON.stringify(p.workflow.pipelinePlan),plan);assert.equal(JSON.stringify(p.image.pipelineResult.measurements),measurements);
  v.container.querySelector('[data-pipeline-node="grayscale"]').click();await h.tick();assert.equal(v.canvases.length,1);assert.equal(v.canvases[0].type,'original');assert.match(v.container.querySelector('.pipeline-inspector').textContent,/無需灰階化與閾值搜尋/);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
