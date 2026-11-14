import test from 'node:test';import assert from 'node:assert/strict';import {jsonSnapshot} from '../src/json-snapshot.js';
import {freezeParsedJson,isImmutableJson} from '../src/json-snapshot.js';
test('parsed numeric pairs retain normalization, frozen provenance and generic fallbacks',()=>{
 for(const source of [[0,-0],[-0,0],[Infinity,-Infinity],[NaN,1],[1,2],[{},2],[[1,2],null],[1],[],[1,2,3]]){
  const input=structuredClone(source),expected=JSON.parse(JSON.stringify(source));
  assert.equal(freezeParsedJson(input),input);assert.deepEqual(input,expected);
  const check=value=>{if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));assert.ok(isImmutableJson(value));for(const item of Object.values(value))check(item);}};check(input);
  assert.equal(freezeParsedJson(input),input);
 }
});
test('snapshot preserves JSON semantics and independent editable containers without re-encoding image strings',()=>{const source={image:'data:image/png;base64,'+'A'.repeat(4*1024*1024),nested:[{x:1},undefined,,Infinity],none:undefined,date:new Date('2026-01-01'),typed:new Uint8Array([1,2]),nan:NaN,zero:-0};const copy=jsonSnapshot(source);assert.deepEqual(copy,JSON.parse(JSON.stringify(source)));copy.nested[0].x=9;assert.equal(source.nested[0].x,1);assert.equal(copy.image,source.image);const special=JSON.parse('{"__proto__":{"x":1}}');assert.deepEqual(jsonSnapshot(special),special);assert.equal({}.x,undefined);});
test('snapshot permits shared subobjects but rejects cycles and BigInt just like JSON',()=>{const shared={x:1};const copied=jsonSnapshot({a:shared,b:shared});copied.a.x=2;assert.equal(copied.b.x,1);const cyclic={};cyclic.self=cyclic;assert.throws(()=>jsonSnapshot(cyclic),/Circular/);assert.throws(()=>jsonSnapshot({x:1n}),/BigInt/);});
