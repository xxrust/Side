import test from 'node:test';
import assert from 'node:assert/strict';
import {
 beginWorkpieceArtifactPixels,
 captureWorkpieceArtifactPixels,
 clearWorkpieceArtifactPixels,
 workpieceArtifactPixel,
} from '../src/workpiece-live-state.js';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('current workpiece keeps process pixels after runtime cleanup and replaces them on the next workpiece',()=>{
 const project={};
 const first={runId:'run-1',artifacts:[
  {id:'step-a',type:'image',dataUrl:png,path:'/runtime/run-1/step-a.png'},
  {id:'stats',type:'evidence',data:{ok:true}},
 ]};
 captureWorkpieceArtifactPixels(project,'unit-1',[first]);
 assert.equal(workpieceArtifactPixel(project,'unit-1','run-1','step-a'),png);
 assert.equal(first.artifacts[0].dataUrl,undefined,'pixels are removed from serializable run metadata');
 assert.equal(first.artifacts[0].path,'/runtime/run-1/step-a.png');

 beginWorkpieceArtifactPixels(project,'unit-2');
 assert.equal(workpieceArtifactPixel(project,'unit-1','run-1','step-a'),null);

 const second={runId:'run-2',artifacts:[{id:'step-b',type:'image',dataURL:png}]};
 captureWorkpieceArtifactPixels(project,'unit-2',[second]);
 assert.equal(workpieceArtifactPixel(project,'unit-1','run-1','step-a'),null);
 assert.equal(workpieceArtifactPixel(project,'unit-2','run-2','step-b'),png);
 clearWorkpieceArtifactPixels(project);
 assert.equal(workpieceArtifactPixel(project,'unit-2','run-2','step-b'),null);
});
