import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const project=JSON.parse(fs.readFileSync(new URL('../../codex-audit-logs/20261029-failure-repair/pi-mapping-closure/turn4/completed.agentcv.json',import.meta.url)));
const run=project.algorithmRuns.filter(r=>r.procedureTrace?.nodes?.some(n=>n.id==='quality-projection')).at(-1);

test('real saved operator trace retains every node and edge with typed visual roles and non-colour status',async()=>{
 const h=await createHarness();try{
  await h.api.loadProject(project,{resume:true});const result=await h.api.inquiryView.programFlow.openInnerTopology(run.runId+'::run');
  assert.deepEqual([...result.canvas.querySelectorAll('[data-operator-node]')].map(n=>n.dataset.operatorNode).sort(),Array.from(result.flow.nodes,n=>n.id).sort());
  assert.deepEqual([...result.canvas.querySelectorAll('[data-topology-edge]')].map(n=>n.dataset.topologyEdge).sort(),Array.from(result.flow.edges,e=>e.id).sort());
  for(const node of result.flow.nodes){
   const g=[...result.canvas.querySelectorAll('[data-operator-node]')].find(g=>g.dataset.operatorNode===node.id);
   assert.equal(g.dataset.shape,node.role==='procedure'?'container':node.role==='input'?'input-port':node.role==='output'?'artifact':'process');
   assert.ok(g.querySelector('.operator-state').textContent.trim(),'state visible without colour');
   assert.equal(g.querySelectorAll('[data-condition]').length,node.role==='operator'&&node.condition!==null&&node.condition!==undefined?1:0,'condition badge only from actual saved condition');
  }
  assert.equal(result.canvas.querySelectorAll('.operator-container').length,result.geometry.groups.length);
  for(const edge of result.flow.edges){const g=[...result.canvas.querySelectorAll('[data-topology-edge]')].find(g=>g.dataset.topologyEdge===edge.id);if(edge.additionalBasis?.includes('artifact-input-id')){assert.equal(g.dataset.edgeKind,'data','saved actual artifact handoff remains data even when also an execution prerequisite');}else{assert.equal(g.dataset.edgeKind,edge.basis==='dependencyInstances'?'control':'data');}}
  assert.deepEqual(h.errors,[]);result.dialog.close();
 }finally{h.close()}
});

test('edge keyboard selection exposes exact saved provenance and legend toggles without leaving topology',async()=>{
 const h=await createHarness();try{
  await h.api.loadProject(project,{resume:true});const result=await h.api.inquiryView.programFlow.openInnerTopology(run.runId+'::run');
  const edge=result.flow.edges.find(e=>e.basis==='dependencyInstances'),g=[...result.canvas.querySelectorAll('[data-topology-edge]')].find(g=>g.dataset.topologyEdge===edge.id);
  g.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  const detail=result.dialog.querySelector('[aria-label="所選算子接口"]');assert.match(detail.textContent,/dependencyInstances/);assert.ok(detail.textContent.includes(result.flow.nodes.find(n=>n.id===edge.from).title));assert.ok(detail.textContent.includes(result.flow.nodes.find(n=>n.id===edge.to).title));assert.ok(g.classList.contains('selected'));
  const legend=result.dialog.querySelector('.operator-topology-legend'),button=[...result.dialog.querySelectorAll('button')].find(b=>b.textContent==='圖例');assert.equal(legend.hidden,true);button.click();assert.equal(legend.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');button.click();assert.equal(legend.hidden,true);assert.equal(result.dialog.open,true);assert.deepEqual(h.errors,[]);result.dialog.close();
 }finally{h.close()}
});
