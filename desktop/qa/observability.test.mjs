import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureTemplate,locateTemplate,measureTarget} from '../src/inspection.js';
import {Workspace} from '../src/workspace.js';
// A characterization of a known operating limit, not a desired defect detector.
test('a perfect sparse matching score does not certify a clean foreground or full-image appearance',()=>{
 const width=480,height=320,image={width,height,gray:new Float32Array(width*height).fill(25)};
 for(let y=50;y<250;y++)for(let x=60;x<380;x++)image.gray[y*width+x]=180;
 const points=[{x:60,y:50},{x:380,y:50},{x:380,y:250},{x:60,y:250}],template=captureTemplate(image,points),changed={...image,gray:image.gray.slice()};
 let altered=0;for(let y=103;y<108;y++)for(let x=70;x<370;x++){changed.gray[y*width+x]=0;altered++}
 assert.equal(altered,1500);assert.equal(template.samples.length,484);
 const location=locateTemplate(changed,template);assert.equal(location.status,'LOCATED');assert.ok(Math.abs(location.quality.score-1)<1e-12);assert.equal(location.quality.mean_absolute_error,0);
 const measured=measureTarget(changed,location);assert.equal(measured.status,'MEASURED');assert.ok(Math.abs(measured.width-320)<.01);assert.ok(Math.abs(measured.height-200)<.01);
});
test('partial recipe parameters store all effective defaults rather than leaving displayed thresholds implicit',async()=>{
 const image={width:120,height:100,gray:new Float32Array(120*100).fill(20),sha256:'defaults'};for(let y=20;y<80;y++)for(let x=20;x<100;x++)image.gray[y*120+x]=180;
 const w=new Workspace();await w.addImages([{name:'defaults',dataUrl:'test'}],async()=>image);w.setRegion(w.workflow.workpiece.id,[{x:20,y:20},{x:100,y:20},{x:100,y:80},{x:20,y:80}]);w.addCheck({name:'visible',kind:'presence',targetId:w.workflow.workpiece.id});w.buildRecipe({matching:{minScore:.95},edges:{maxAngle:10}});
 assert.deepEqual(w.workflow.recipe.params.matching,{minScore:.95,maxError:24,minMargin:.035});assert.deepEqual(w.workflow.recipe.params.edges,{threshold:18,maxAngle:10});
});
