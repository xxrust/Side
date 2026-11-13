import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreSharedNativeFacts} from '../src/shared-facts.js';
import {sealParsedNativeExecutionFacts} from '../src/execution-facts.js';
import {jsonSnapshot,isImmutableJson,projectSnapshot} from '../src/json-snapshot.js';
import {createNativeSessionExecutor} from '../src/native-session-bridge.js';

const wire=()=>JSON.parse('{"runs":[{"result":{"points":[{"x":-0.0,"y":1.2345678901234567}],"__proto__":{"safe":true}},"procedureTrace":{"nodes":[{"outputs":{"actual":null}}]},"artifacts":[{"data":null}]}],"timing":{},"_sharedFacts":{"backend":"rust-shared-facts-v1","links":[{"from":["runs",0,"result"],"to":["runs",0,"procedureTrace","nodes",0,"outputs","actual"]},{"from":["runs",0,"result"],"to":["runs",0,"artifacts",0,"data"]}]}}');
test('wire sharing restores all facts as immutable aliases while editable copies remain detached',()=>{
 const value=wire(),source=value.runs[0].result;
 assert.equal(restoreSharedNativeFacts(value).links,2);sealParsedNativeExecutionFacts(value);
 assert.equal(value.runs[0].artifacts[0].data,source);
 assert.equal(value.runs[0].procedureTrace.nodes[0].outputs.actual,source);
 assert.ok(isImmutableJson(source));assert.ok(Object.isFrozen(source.points[0]));
 assert.ok(!Object.is(source.points[0].x,-0)); // Existing JSON normalization.
 assert.equal(Object.hasOwn(source,'__proto__'),true);assert.equal({}.safe,undefined);
 assert.equal(projectSnapshot(value).runs[0].result,source);
 const editable=jsonSnapshot(value);editable.runs[0].result.points[0].y=7;
 assert.equal(source.points[0].y,1.2345678901234567);
 assert.equal(Object.hasOwn(value,'_sharedFacts'),false);
});
test('nested sources are restored in dependency order, including literal special keys',()=>{
 const value=JSON.parse('{"runs":[{"result":{"a":{"__proto__":[1,2]},"b":null},"artifacts":[{"data":null}]}],"_sharedFacts":{"backend":"rust-shared-facts-v1","links":[{"from":["runs",0,"result","a"],"to":["runs",0,"result","b"]},{"from":["runs",0,"result"],"to":["runs",0,"artifacts",0,"data"]}]}}');
 restoreSharedNativeFacts(value);assert.equal(value.runs[0].result.a,value.runs[0].result.b);
 assert.equal(value.runs[0].result,value.runs[0].artifacts[0].data);
 assert.equal({}.polluted,undefined);
});
test('corrupted paths, inherited properties, overlaps and writes into prior sources are rejected',()=>{
 const cases=[
  v=>v._sharedFacts.backend='other',
  v=>v._sharedFacts.links[0].from=['runs',0,'code'],
  v=>v._sharedFacts.links[0].from=['runs',0,'result','constructor'],
  v=>v._sharedFacts.links[0].from=['runs',0,'result','points','0'],
  v=>v._sharedFacts.links[0].to=['runs',0,'result','points',0],
  v=>v._sharedFacts.links[0].to=['runs',0,'result'],
  v=>v._sharedFacts.links[0].to=['runs',-1,'result'],
  v=>v._sharedFacts.links[0].to=['runs',0,'parameters'],
  v=>v._sharedFacts.links.push(v._sharedFacts.links[0]),
  v=>{v.runs[0].result.hole=null;v._sharedFacts.links.push({from:['runs',0,'artifacts',0,'data'],to:['runs',0,'result','hole']});},
 ];
 for(const mutate of cases){const value=wire();mutate(value);assert.throws(()=>restoreSharedNativeFacts(value),/SESSION_SHARED_FACTS_INVALID/);}
});
test('binary executor reconstructs full facts before normal result publication',async()=>{
 const value=wire();value._responseEncoding={backend:'rust-json-once-v1',encodeNs:1,releaseNs:2,jsonBytes:1};
 const buffer=new TextEncoder().encode(JSON.stringify(value)).buffer;
 const execute=createNativeSessionExecutor({Channel:class{},invoke:async()=>buffer});
 const actual=await execute({sessionId:'s',executionId:'e',unitId:'u'});
 assert.equal(actual.runs[0].artifacts[0].data,actual.runs[0].result);
 assert.equal(actual.timing.hostResponse.sharedLinks,2);
 assert.ok(actual.timing.hostResponse.restoreMs>=0);
 assert.equal(actual.runs[0].result.__proto__.safe,true);
});
