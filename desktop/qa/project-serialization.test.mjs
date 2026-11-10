import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {serializeProject} from '../src/project-serialization.js';
import {Workspace} from '../src/workspace.js';
import {captureTrialSnapshot,completeTrialSnapshot} from '../src/solution-versions-trials.js';
const bytes=await fs.readFile(new URL('../../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg',import.meta.url));
const image='data:image/jpeg;base64,'+bytes.toString('base64');

test('project and immutable Git trial preserve actual asset bytes once, without modifying live results',()=>{
 const w=new Workspace(),artifact={id:'image',type:'image',dataURL:image,dataUrl:image};
 const run={runId:'record',code:'pass',sourceBinding:{images:[]},status:'SUCCEEDED',artifacts:[artifact]};
 w.data.algorithmRuns=[run];
 const capture=captureTrialSnapshot(w,w.data);
 const contents=[w.serialize(),completeTrialSnapshot(capture,{run}).content];
 for(const content of contents){const stored=JSON.parse(content).algorithmRuns[0].artifacts[0];assert.equal(stored.dataUrl,undefined);assert.deepEqual(Buffer.from(stored.dataURL.split(',')[1],'base64'),bytes);assert.equal(content.split(image).length-1,1);}
 assert.equal(artifact.dataURL,image);assert.equal(artifact.dataUrl,image);
 // The two keys may belong to different legacy representations. Do not infer
 // equivalence or delete the only payload merely because a key has this name.
 const distinct={dataURL:image,dataUrl:'data:text/plain;base64,YQ=='};
 assert.deepEqual(JSON.parse(serializeProject(distinct)),distinct);
 assert.deepEqual(JSON.parse(serializeProject({dataUrl:image})),{dataUrl:image});
});
