import test from 'node:test';
import assert from 'node:assert/strict';
import {compactSessionProject} from '../src/app-session.js';

test('session recovery drops volatile algorithm pixels and activity while keeping original inputs',()=>{
 const pixel='data:image/png;base64,'+'A'.repeat(900000);
 const project={schema:'agentcv-workspace-0.9',images:[{id:'input',dataURL:pixel}],algorithmRuns:[{runId:'run',artifacts:[{id:'overlay',type:'image',dataURL:pixel,data:{huge:'x'.repeat(600000)}},{id:'small',type:'image',dataURL:'data:image/png;base64,small'}]}],chat:[{role:'assistant',agentActivity:'x'.repeat(200000)}],visualInquiry:{assets:[{id:'figure',dataURL:'data:image/png;base64,'+'B'.repeat(100)}]}};
 const compact=compactSessionProject(project);
 assert.equal(compact.images[0].dataURL,pixel);
 assert.equal(compact.algorithmRuns[0].artifacts[0].dataURL,undefined);
 assert.equal(compact.algorithmRuns[0].artifacts[0].data,undefined);
 assert.equal(compact.algorithmRuns[0].artifacts[1].dataURL,undefined);
 assert.equal(compact.chat[0].agentActivity,undefined);
 assert.equal(compact.visualInquiry.assets[0].dataURL,'data:image/png;base64,'+'B'.repeat(100));
 assert.ok(JSON.stringify(compact).length<1000000);
});

test('session recovery collapses identical dataURL aliases without changing mismatched legacy values',()=>{
 const shared='data:image/png;base64,'+'C'.repeat(120000);
 const project={
  images:[{id:'input',dataURL:shared,dataUrl:shared}],
  workflow:{references:[{id:'ref',dataURL:shared,dataUrl:shared}]},
  visualInquiry:{assets:[{id:'asset',dataURL:shared,dataUrl:shared}]},
  legacy:{dataURL:'data:image/png;base64,one',dataUrl:'data:image/png;base64,two'}
 };
 const compact=compactSessionProject(project);
 assert.equal(compact.images[0].dataURL,shared);
 assert.equal(compact.images[0].dataUrl,undefined);
 assert.equal(compact.workflow.references[0].dataUrl,undefined);
 assert.equal(compact.visualInquiry.assets[0].dataUrl,undefined);
 assert.equal(compact.legacy.dataURL,'data:image/png;base64,one');
 assert.equal(compact.legacy.dataUrl,'data:image/png;base64,two');
});

test('session recovery summarizes replayable procedure trace arrays',()=>{
 const points=Array.from({length:5000},(_,index)=>({x:index,y:index+1}));
 const compact=compactSessionProject({algorithmRuns:[{procedureTrace:{schema:'trace',nodes:[{id:'edge',status:'SUCCEEDED',outputs:{points,score:0.98},parameters:{threshold:3}}]}}]});
 const node=compact.algorithmRuns[0].procedureTrace.nodes[0];
 assert.deepEqual(node.outputs.points,{schema:'agentcv-recovery-array-summary',length:5000});
 assert.equal(node.outputs.score,0.98);
 assert.equal(node.parameters.threshold,3);
 assert.ok(JSON.stringify(compact).length<10000);
});
