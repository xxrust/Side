// Exact saved Pi refinement: geometry and decision are two real Python runs.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
import {buildCurrentSchemeFlow} from '../src/current-scheme-flow.js';import {engineeringFlow} from '../src/program-scope.js';
const file=new URL('../../codex-audit-logs/20261029-restore-and-iterate/refinement/completed.agentcv.json',import.meta.url),saved=JSON.parse(fs.readFileSync(file,'utf8')),ids=saved.purposeAcceptance.runIds;

test('only actual current scheme executions are composed and cross-run input links require both saved declaration and dispatch binding',()=>{
 const result=buildCurrentSchemeFlow(saved,{runId:ids[1]});assert.equal(result.available,true);assert.deepEqual(result.runIds,ids);assert.equal(result.flow.nodes.filter(n=>n.kind==='run').length,2);assert.equal(result.flow.nodes.filter(n=>n.kind==='procedure').length,2);assert.equal(result.flow.nodes.filter(n=>n.kind==='step').length,2);assert.ok(result.flow.nodes.every(n=>ids.includes(n.runId)));
 const links=result.flow.edges.filter(e=>e.provenance==='verified-scheme-upstream');assert.equal(links.length,1);assert.equal(links[0].fromRunId,ids[0]);assert.equal(links[0].toRunId,ids[1]);assert.equal(links[0].artifactId,'geometry');assert.equal(links[0].from,ids[0]+'::extract_measure#1');assert.equal(links[0].to,ids[1]+'::judge#1');const projected=engineeringFlow(result.flow);assert.ok(projected.edges.some(e=>e.from===ids[0]+'::measure#1'&&e.to===ids[1]+'::judge#1'));
 const broken=structuredClone(saved);broken.algorithmRuns.find(r=>r.runId===ids[1]).upstreamBindings.geometry.runId=saved.algorithmRuns[0].runId;const invalid=buildCurrentSchemeFlow(broken,{runId:ids[1]});assert.equal(invalid.available,true);assert.equal(invalid.flow.edges.filter(e=>e.provenance==='verified-scheme-upstream').length,0);assert.ok(invalid.flow.diagnostics.some(d=>d.code==='SCHEME_UPSTREAM_MISMATCH'));
});

test('history selection, missing acceptance and stale current inputs do not mingle historical runs with the current scheme',()=>{
 assert.equal(buildCurrentSchemeFlow(saved,{runId:saved.algorithmRuns[0].runId}).reason,'HISTORICAL_EXECUTION');const missing=structuredClone(saved);delete missing.purposeAcceptance;assert.equal(buildCurrentSchemeFlow(missing,{runId:ids[0]}).available,false);const changed=structuredClone(saved);changed.purposeScheme.operatorGraph.nodes[0].title+='（修改）';assert.equal(buildCurrentSchemeFlow(changed,{runId:ids[0]}).reason,'STALE_SCHEME_EXECUTION');const input=structuredClone(saved);input.images[0].sha256='changed-source';assert.equal(buildCurrentSchemeFlow(input,{runId:ids[0]}).reason,'STALE_SCHEME_INPUT');
});

test('clicking either real procedure keeps both current engineering nodes visible; a historical run still opens alone',async()=>{
 const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{await h.api.loadProject(h.w.JSON.parse(JSON.stringify(saved)));const v=h.api.inquiryView,f=v.programFlow;await f.openNode(ids[1]+'::judge#1',{mode:'canvas'});await f.map.ready;assert.equal(f.schemeFlow,true);assert.ok(f.flow.nodes.some(n=>n.id===ids[0]+'::measure#1'));assert.ok(f.flow.nodes.some(n=>n.id===ids[1]+'::judge#1'));assert.ok(h.w.document.querySelector('.program-flow-map-node[data-program-node="'+ids[0]+'::measure#1"]'));assert.ok(h.w.document.querySelector('.program-flow-map-node[data-program-node="'+ids[1]+'::judge#1"]'));
  const viewKey=f.map.runId;await f.openNode(ids[0]+'::measure#1',{mode:'canvas'});await f.map.ready;assert.equal(f.map.runId,viewKey,'switching nodes keeps the same full-scheme graph/camera');assert.equal(f.flow.roots.length,2);await f.openNode(ids[1]+'::evaluate#1',{mode:'canvas'});await f.map.ready;assert.equal(f.flow.roots.length,2);assert.equal(v.board().programBinding.runId,ids[1]);
  await f.openNode(saved.algorithmRuns[0].runId+'::run',{mode:'canvas'});await f.map.ready;assert.equal(f.schemeFlow,false);assert.equal(f.flow.roots.length,1);assert.ok(f.flow.nodes.every(n=>n.runId===saved.algorithmRuns[0].runId));assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
