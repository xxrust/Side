import test from 'node:test';
import assert from 'node:assert/strict';
import {jsonSnapshot} from '../src/json-snapshot.js';
import {encodeGray8} from '../src/gray-transport.js';
import {captureAgentInputs} from '../src/agent-change-impact.js';

test('native gray transport keeps a 1280x1024 request below the JSON array footprint',()=>{
 const gray=Uint8Array.from({length:1280*1024},(_,i)=>i&255);
 const compact={width:1280,height:1024,...encodeGray8(gray)};
 const arrayBytes=JSON.stringify({width:1280,height:1024,gray:Array.from(gray)}).length;
 assert.equal(compact.grayEncoding,'base64-u8');
 assert.ok(JSON.stringify(compact).length<arrayBytes*.5);
});

test('undo snapshots stay detached while using the fast JSON-shaped copier',()=>{
 const source={items:[{value:1}],nested:{value:2},nonFinite:Infinity};
 const snapshot=jsonSnapshot(source);
 snapshot.items[0].value=9;snapshot.nested.value=8;
 assert.equal(source.items[0].value,1);assert.equal(source.nested.value,2);assert.equal(snapshot.nonFinite,null);
});

test('Agent input stamps retain bounded image identities',()=>{
 const dataURL='data:image/png;base64,'+'A'.repeat(800000);
 const image={id:'image-1',width:1280,height:1024,dataURL};
 const project={epoch:1,data:{activeId:'image-1',events:[],images:[image],visualInquiry:{boards:[]}},workflow:{profiles:[],parts:[],checks:[],references:[],relations:[],pipelinePlan:null,workpiece:{id:'workpiece'}}};
 const first=captureAgentInputs(project),second=captureAgentInputs(project);
 assert.equal(first.images[0].pixels,second.images[0].pixels);
 assert.ok(JSON.stringify(first).length<1000);
 image.dataURL=dataURL+'B';
 assert.notEqual(captureAgentInputs(project).images[0].pixels,first.images[0].pixels);
});
