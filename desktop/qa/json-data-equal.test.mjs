import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {jsonDataEqual} from '../src/json-data-equal.js';
import {immutableJson} from '../src/json-snapshot.js';
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
test('strict JSON types, omitted fields, array nulls and special keys retain canonical equality',()=>{
 const cases=[
  [{a:1,b:2},{b:2,a:1}], [{a:1},{a:'1'}], [{a:false},{a:0}],
  [{a:null},{a:undefined}], [{a:undefined},{}], [[undefined,,NaN],[null,null,null]],
  [NaN,null],[-0,0],[undefined,()=>1],
  [JSON.parse('{"__proto__":{"x":1},"constructor":3}'),JSON.parse('{"constructor":3,"__proto__":{"x":1}}')],
  [Object.assign(Object.create(null),{a:[1,2]}),{a:[1,2]}],
  [new Date('2026-11-13T00:00:00Z'),'2026-11-13T00:00:00.000Z'],
  [{a:{toJSON:()=>3}},{a:3}], [new Number(3),3],
 ];
 for(const [left,right] of cases)assert.equal(jsonDataEqual(left,right),canonical(left)===canonical(right));
 assert.equal(jsonDataEqual(immutableJson({a:[1,2]}),{a:[1,3]}),false);
});
test('random JSON mutations and reordered keys agree with independent canonical string oracle',()=>{
 let seed=20261113;
 const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 function data(depth=0){
  const k=next()%10;
  if(depth>3||k<5)return [null,false,true,next()/17,String(next())+'🦀'][k%5];
  if(k<7)return Array.from({length:next()%8},()=>data(depth+1));
  return Object.fromEntries(Array.from({length:next()%8},(_,i)=>['key'+i,data(depth+1)]));
 }
 const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;
 for(let i=0;i<1500;i++){
  const a=data(),b=reorder(a),c=data();
  assert.equal(jsonDataEqual(a,b),canonical(a)===canonical(b));
  assert.equal(jsonDataEqual(a,c),canonical(a)===canonical(c));
 }
});
test('actual execution facts compare every nested measurement without changing either input',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/execution-facts-record.json',import.meta.url)));
 const a=immutableJson(fixture),b=JSON.parse(JSON.stringify(fixture)),original=JSON.stringify(b);
 assert.equal(jsonDataEqual(a,b),true);assert.equal(jsonDataEqual(a,a),true);
 assert.equal(JSON.stringify(b),original);
 const changed={...b,comparisonProbe:{value:1,valid:true,status:'MEASURED'}};
 assert.equal(jsonDataEqual(a,changed),false);
 assert.equal(jsonDataEqual({value:1,valid:true},{value:'1',valid:true}),false);
 assert.equal(jsonDataEqual({status:'NOT_FOUND'},{status:'FAULT'}),false);
});

test('callable toJSON values are serialized rather than omitted from parity records',()=>{
 const callback=()=>{};callback.toJSON=()=>3;
 for(const [left,right] of [[callback,3],[{a:callback},{a:3}],[[callback],[3]],[{a:callback},{}]]){
  assert.equal(jsonDataEqual(left,right),canonical(left)===canonical(right));
 }
 assert.equal(jsonDataEqual({result:callback},{}),false,'a serialized measurement must not disappear from the parity gate');
});
