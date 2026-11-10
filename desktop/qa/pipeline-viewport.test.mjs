import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPipelineViewport,observedPipelineBounds,fitPipelineLocator} from '../src/pipeline-viewport.js';

test('full camera rasters fit with one scale across wide, tall and square images',()=>{
 for(const [imageWidth,imageHeight]of [[4096,3000],[1920,1080],[1080,1920],[512,512]]){
  const f=fitPipelineViewport({width:780,height:550,imageWidth,imageHeight});
  assert.equal(f.extent,'image');assert.ok(f.x>=17.999&&f.y>=17.999);
  assert.ok(f.x+imageWidth*f.scale<=762.001&&f.y+imageHeight*f.scale<=532.001);
  assert.equal((imageWidth*f.scale)/(imageHeight*f.scale),imageWidth/imageHeight);
  assert.deepEqual(f.target,{x:0,y:0,width:imageWidth,height:imageHeight});
 }
});

test('object fitting is a reversible view of immutable original camera coordinates',()=>{
 const bounds={x:1220,y:810,width:510,height:420},before=structuredClone(bounds),args={width:780,height:550,imageWidth:4096,imageHeight:3000,bounds};
 const full=fitPipelineViewport(args),detail=fitPipelineViewport({...args,extent:'workpiece'});
 assert.ok(detail.scale>full.scale);assert.deepEqual(bounds,before);assert.equal(detail.extent,'workpiece');
 const imagePoint={x:1470,y:1020},screen={x:detail.x+imagePoint.x*detail.scale,y:detail.y+imagePoint.y*detail.scale};
 assert.ok(Math.abs((screen.x-detail.x)/detail.scale-imagePoint.x)<1e-9);
 assert.ok(Math.abs((screen.y-detail.y)/detail.scale-imagePoint.y)<1e-9);
 assert.deepEqual(fitPipelineViewport({...args,extent:'image'}),full);
 assert.equal(fitPipelineViewport({...args,bounds:null,extent:'workpiece'}).extent,'image');
});

test('object view uses the explicitly selected component rather than the largest candidate',()=>{
 const result={nodes:[{op:'regions.components',status:'OK',outputSummary:{selectedComponentId:2},artifacts:[{id:'components:component-candidates',data:{candidates:[{id:1,area:1000,bounds:{x:0,y:0,width:100,height:100}},{id:2,area:10,bounds:{x:140,y:20,width:7,height:9}}]}}]}]};
 assert.deepEqual(observedPipelineBounds(result),{x:140,y:20,width:7,height:9});
 assert.equal(observedPipelineBounds({nodes:[{...result.nodes[0],status:'FAILED'}]}),null);
});


test('the locator frame and caption avoid the workpiece and reserve annotation space',async()=>{
 const {layoutOverlayLabels,overlayBoxesOverlap}=await import('../src/pipeline-overlay-layout.js');
 for(const [imageWidth,imageHeight]of [[512,512],[1920,1080],[1080,1920]]){
  const bounds={x:imageWidth*.25,y:imageHeight*.25,width:imageWidth*.5,height:imageHeight*.5};
  const args={width:470,height:300,imageWidth,imageHeight,bounds};const transform=fitPipelineViewport({...args,extent:'workpiece'}),locator=fitPipelineLocator({...args,transform});
  const object={x:transform.x+bounds.x*transform.scale,y:transform.y+bounds.y*transform.scale,width:bounds.width*transform.scale,height:bounds.height*transform.scale};
  if(locator){assert.equal(overlayBoxesOverlap(locator.box,object,4),false);assert.ok(Math.abs(locator.width/locator.height-imageWidth/imageHeight)<1e-12);const layout=layoutOverlayLabels([{anchor:{x:locator.x,y:locator.y},width:60,height:17,text:'tooth'}],{markers:[locator.box],viewport:{x:0,y:0,width:470,height:300}});assert.equal(layout.unplaced.length,0);assert.equal(overlayBoxesOverlap(layout.placed[0].box,locator.box,3),false)}
 }
 assert.equal(fitPipelineLocator({width:100,height:70,imageWidth:512,imageHeight:512,transform:{x:0,y:0,scale:1},bounds:{x:0,y:0,width:512,height:512}}),null);
});
