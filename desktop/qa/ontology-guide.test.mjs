import test from 'node:test';
import assert from 'node:assert/strict';
import {ontologyEvidence} from '../src/ontology-guide.js';

test('ontology evidence counts only Agent-owned drawing and geometry evidence',()=>{
 const project={data:{visualInquiry:{boards:[{id:'b',items:[{id:'i',annotations:[{author:'human'},{author:'agent'}],geometryTools:[{author:'agent'},{author:'human'}]}]}]}}};
 const evidence=ontologyEvidence(project);
 assert.equal(evidence.boards,1);assert.equal(evidence.agentAnnotations.length,1);assert.equal(evidence.agentGeometry.length,1);
});
