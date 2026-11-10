// Real app bundle and real raster renderers. RAF is held deliberately to
// reproduce a right-click that occurs before the newly created canvas paints.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const digest=value=>createHash('sha256').update(value).digest('hex');
const alpha=canvas=>canvas.getContext('2d').getImageData(0,0,1,1).data[3];

test('immediate pipeline references paint only the requested actual surface and retain the current view and project',async()=>{
 const h=await createHarness();try{
  const {api,w}=h,{project,pipelineView:view,visualSources:sources}=api;
  await api.addImages([{name:'test-04.png',dataURL:'data:image/png;base64,'+fs.readFileSync(new URL('../../reviews/2026-10-25-blind-operation/operator-packets/T01/test-04.png',import.meta.url)).toString('base64')}]);view.mount(w.document.createElement('section'));await api.go(6);
  // Suppress future UI paints, rather than waiting long enough for the defect
  // to disappear. The reference path must prepare the exact producer itself.
  w.requestAnimationFrame=()=>0;
  project.createPipeline({task:'gear',goal:'inspect the imported image'});await project.runPipelineImage();
  view.select('segment');
  const result=view.canvases.find(p=>p.type==='result').canvas,input=view.canvases.find(p=>p.type==='input').canvas;
  assert.equal(result.width,300);assert.equal(result.height,150);assert.equal(alpha(result),0);assert.equal(alpha(input),0);
  view.zoom=1.4;view.pan={x:17,y:-11};
  const model=view.model,before=JSON.stringify(project.data),cache=[...view.cache.keys()],overlay=view.lastOverlayLabelLayout,selection={nodeId:view.nodeId,zoom:view.zoom,pan:{...view.pan},mode:view.mode,visual:view.visual,extent:view.extent,imageId:project.image.id};
  const captured=await sources.fromElement(result);
  assert.equal(captured.width,640);assert.equal(captured.height,360);assert.equal(alpha(result),255);assert.equal(alpha(input),0,'capturing the result must not render the other pane');assert.equal(captured.source.nodeId,'segment');assert.equal(captured.source.runId,project.image.pipelineResult.runId);assert.equal(captured.source.currentAtCapture,true);assert.equal(captured.source.displayZoom,1.4);assert.equal(digest(captured.dataURL),digest(result.toDataURL('image/png')));
  assert.equal(JSON.stringify(project.data),before);assert.equal(view.model,model);assert.deepEqual([...view.cache.keys()],cache);assert.equal(view.lastOverlayLabelLayout,overlay);assert.deepEqual({nodeId:view.nodeId,zoom:view.zoom,pan:{...view.pan},mode:view.mode,visual:view.visual,extent:view.extent,imageId:project.image.id},selection);
  const previous=await sources.fromElement(input);assert.equal(previous.width,640);assert.equal(alpha(input),255);assert.equal(previous.source.nodeId,'grayscale');assert.equal(previous.source.runId,captured.source.runId);assert.equal(digest(previous.dataURL),digest(input.toDataURL('image/png')));
  const thumbnail=view.thumbnailCanvases.find(p=>!p.original&&p.node.id==='segment')?.canvas;assert.ok(thumbnail);assert.equal(alpha(thumbnail),0);const thumbRef=await sources.fromElement(thumbnail);assert.equal(alpha(thumbnail),255);assert.equal(thumbRef.source.nodeId,'segment');assert.equal(thumbRef.source.runId,captured.source.runId);
  view.visual='curves';view.render();const curve=view.curveCanvas;assert.ok(curve);assert.equal(alpha(curve),0);const curveRef=await sources.fromElement(curve);assert.equal(alpha(curve),255);assert.equal(curveRef.kind,'plot');assert.equal(curveRef.source.nodeId,'segment');assert.equal(curveRef.source.runId,captured.source.runId);assert.equal(digest(curveRef.dataURL),digest(curve.toDataURL('image/png')));
  assert.equal(JSON.stringify(project.data),before);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('transparent unknown surfaces cannot become saved references and stale pipeline placeholders remain rejected',async()=>{
 const h=await createHarness();try{
  const {api,w}=h,{project,pipelineView:view,visualSources:sources}=api;
  await api.addImages([{name:'test-04.png',dataURL:'data:image/png;base64,'+fs.readFileSync(new URL('../../reviews/2026-10-25-blind-operation/operator-packets/T01/test-04.png',import.meta.url)).toString('base64')}]);view.mount(w.document.createElement('section'));await api.go(6);w.requestAnimationFrame=()=>0;project.createPipeline({task:'gear',goal:'inspect'});await project.runPipelineImage();view.select('segment');
  const count=sources.entries.size,assets=project.ensureInquiry().assets.length,blank=w.document.createElement('canvas');
  await assert.rejects(sources.fromElement(blank),/透明占位圖/);assert.equal(sources.entries.size,count);assert.equal(project.ensureInquiry().assets.length,assets);
  // Invalidate the run using the application's revision mechanism, then ask
  // for the current newly rendered placeholder rather than a detached canvas.
  project.workflow.pipelinePlan.revision++;view.render();const stale=view.canvases.find(p=>p.type==='result').canvas;
  assert.equal(alpha(stale),0);await assert.rejects(sources.fromElement(stale),/有效運算結果/);assert.equal(alpha(stale),0);assert.equal(sources.entries.size,count);assert.equal(project.ensureInquiry().assets.length,assets);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
