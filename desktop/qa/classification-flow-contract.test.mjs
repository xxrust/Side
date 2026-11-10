import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {compileClassificationSpec,classifyWorkpiece} from '../src/classification-spec.js';
import {classificationDecisionModel,classificationRouteEdges,assertClassificationFlow} from '../src/classification-flow-contract.js';
import {buildCurrentSchemeFlow} from '../src/current-scheme-flow.js';
const load=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const mapping=load('../../codex-audit-logs/20261029-failure-repair/pi-mapping-closure/turn4/completed.agentcv.json'),interval=load('../../codex-audit-logs/20261029-canonical-ui/actual-workpiece.agentcv.json');
test('compiler and graph use one decision model across real boolean and interval projects; every declared rule survives as a branch condition',()=>{
 for(const data of [mapping,interval]){const spec=data.purposeScheme.classificationSpec,compiled=compileClassificationSpec(spec),f=buildCurrentSchemeFlow(data).flow;assert.ok(compiled.ok);assert.deepEqual(compiled.decisionModel,classificationDecisionModel(spec));assert.equal(f.nodes.filter(n=>n.kind==='decision').length,1);assert.equal(f.nodes.filter(n=>n.kind==='rule').length,0);assertClassificationFlow(f,spec);const routes=f.edges.filter(e=>e.provenance==='classification-route');assert.equal(routes.length,spec.categories.length);assert.deepEqual(routes.flatMap(e=>e.conditions).filter(c=>c.kind==='rule').map(c=>c.ruleId).sort(),spec.rules.map(r=>r.id).sort());assert.equal(routes.flatMap(e=>e.conditions).filter(c=>c.kind==='missing').length,3);}
});
test('normal, invalid and FAULT classification outcomes drive exactly one direct exit or none, without inventing condition hits',()=>{
 for(const data of [mapping,interval]){const spec=data.purposeScheme.classificationSpec,m=spec.metrics[0],values=m.type==='boolean'?[true,false]:[m.range.min,400,m.range.max];
 for(const observations of [...values.map(value=>[{metric:m.id,value,valid:true}]),[],[{metric:m.id,status:'NOT_FOUND'}],[{metric:m.id,status:'SKIPPED'}]]){const result=classifyWorkpiece(spec,observations);assert.equal(result.valid,true);const edges=classificationRouteEdges(spec,{result,finalExit:'PRODUCT:'+result.categoryId}),selected=edges.filter(e=>e.executed);assert.equal(selected.length,1);assert.equal(selected[0].categoryId,result.categoryId);assert.deepEqual(edges.flatMap(e=>e.matchedRuleIds).sort(),[...result.ruleIds].sort());}
 const fault=classifyWorkpiece(spec,[],{faults:[{type:'RuntimeError'}]});assert.equal(classificationRouteEdges(spec,{result:fault,finalExit:'FAULT'}).filter(e=>e.executed).length,0);
 }
});
test('priority and compound fallback stay explicit; matching a losing rule does not highlight a second exit',()=>{
 const spec=structuredClone(mapping.purposeScheme.classificationSpec),metric=spec.metrics[0].id,[good,bad]=spec.categories.map(c=>c.id);
 spec.rules=[{id:'overlap-1',categoryId:good,when:{all:[{metric,equals:true}]}},{id:'overlap-2',categoryId:bad,when:{any:[{metric,equals:true}]}}];spec.conflicts={mode:'priority',priority:['overlap-2','overlap-1']};spec.coverage={policy:'fallback',fallbackCategoryId:good};assert.ok(compileClassificationSpec(spec).ok);
 for(const value of [true,false]){const result=classifyWorkpiece(spec,[{metric,value}]),edges=classificationRouteEdges(spec,{result,finalExit:'PRODUCT:'+result.categoryId});assert.equal(edges.filter(e=>e.executed).length,1);assert.equal(result.categoryId,value?bad:good);assert.deepEqual(edges[0].resolution.conflicts,spec.conflicts);assert.equal(edges.flatMap(e=>e.conditions).filter(c=>c.kind==='fallback').length,1);}
});
test('construction contract rejects repeated decisions, condition-as-node, missing conditions and duplicate exits; independent earlier decisions remain',()=>{
 const spec=mapping.purposeScheme.classificationSpec,f=buildCurrentSchemeFlow(mapping).flow;
 for(const mutate of [g=>g.nodes.push({...g.nodes.find(n=>n.kind==='decision'),id:'duplicate'}),g=>g.nodes.push({id:'scheme::rule:extra',kind:'rule',boundary:true}),g=>g.edges.find(e=>e.provenance==='classification-route').conditions=[],g=>g.edges.push({...g.edges.find(e=>e.provenance==='classification-route'),id:'duplicate-edge'})]){const bad=structuredClone(f);mutate(bad);assert.throws(()=>assertClassificationFlow(bad,spec),/CLASSIFICATION_FLOW_CONTRACT/);}
 const independent=structuredClone(f);independent.nodes.push({id:'upstream-independent-decision',kind:'decision',classificationSpecId:'separate-decision'});assert.equal(assertClassificationFlow(independent,spec),true);
});

test('classification branch labels reserve real layout space in both directions instead of disappearing',async()=>{
 const {layoutProgramFlow}=await import('../src/program-flow-layout.js');
 for(const data of [mapping,interval])for(const direction of ['DOWN','RIGHT']){const f=buildCurrentSchemeFlow(data).flow,g=await layoutProgramFlow(f,{direction});for(const e of g.edges.filter(e=>e.provenance==='classification-route')){const b=e.labelLayout;assert.ok(b?.lines.length);assert.ok([b.x,b.y,b.width,b.height].every(Number.isFinite));for(const n of g.nodes)assert.ok(b.x+b.width<=n.x||n.x+n.width<=b.x||b.y+b.height<=n.y||n.y+n.height<=b.y,'branch text must not overlap a node');}}
});
test('terminal results cannot route again or own decision logic',()=>{
 const f=buildCurrentSchemeFlow(mapping).flow,spec=mapping.purposeScheme.classificationSpec;
 for(const kind of ['category','system-exit'])for(const defect of ['edge','rules','model']){
  const bad=structuredClone(f),exit=bad.nodes.find(n=>n.kind===kind);
  if(defect==='edge')bad.edges.push({from:exit.id,to:'scheme::classification'});
  if(defect==='rules')exit.rules=spec.rules;
  if(defect==='model')exit.decisionModel=classificationDecisionModel(spec);
  assert.throws(()=>assertClassificationFlow(bad,spec),/結果出口不得/);
 }
});
