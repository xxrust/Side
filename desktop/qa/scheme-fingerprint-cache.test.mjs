import test from 'node:test';
import assert from 'node:assert/strict';
import {schemeFingerprint} from '../src/purpose-compiler.js';

test('fast content cache preserves canonical identity across reordered object keys',()=>{
 const first={execution:{unit:'workpiece'},operatorGraph:{nodes:[{id:'actual',code:'result=1',parameters:{'10':10,'2':2,z:3,a:4}}],edges:[]}};
 const reordered={operatorGraph:{edges:[],nodes:[{parameters:{a:4,z:3,'2':2,'10':10},code:'result=1',id:'actual'}]},execution:{unit:'workpiece'}};
 const expected=schemeFingerprint(first);assert.equal(schemeFingerprint(reordered),expected);
 reordered.operatorGraph.nodes[0].parameters.a=5;assert.notEqual(schemeFingerprint(reordered),expected);
 reordered.operatorGraph.nodes[0].parameters.a=4;assert.equal(schemeFingerprint(reordered),expected);
});

test('fingerprint reuse still detects in-place execution, code, parameter and boundary changes',()=>{
 const scheme={execution:{unit:'workpiece'},operatorGraph:{nodes:[{id:'actual',code:'result={"text":"检测🦀"}',parameters:{threshold:12},justification:{boundaries:[{condition:'limit',check:{kind:'metric'},onFailure:'UNKNOWN',pass_when:{metric:'distance',max:4}}]}}],edges:[]}};
 const first=schemeFingerprint(scheme);
 assert.equal(schemeFingerprint(structuredClone(scheme)),first);
 for(const change of [s=>{s.execution.unit='other';},s=>{s.operatorGraph.nodes[0].code+='\nresult=None';},s=>{s.operatorGraph.nodes[0].parameters.threshold=13;},s=>{s.operatorGraph.nodes[0].justification.boundaries[0].pass_when.max=5;}]){
  const edited=structuredClone(scheme);assert.equal(schemeFingerprint(edited),first);change(edited);assert.notEqual(schemeFingerprint(edited),first);
 }
 const described=structuredClone(scheme);described.operatorGraph.nodes[0].documentation='Changed explanation';
 assert.equal(schemeFingerprint(described),first);
 for(let i=0;i<32;i++)schemeFingerprint({execution:{unit:'workpiece',sample:i}});
 assert.equal(schemeFingerprint(scheme),first);
});
