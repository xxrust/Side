import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const {createHarness}=createRequire(import.meta.url)('./workflow-ui-harness.cjs');

test('source modal cannot suppress execution-control locking or final unlock on success and failure',async()=>{
 const h=await createHarness();
 try{
  await h.api.startupReady;
  const d=h.w.document.createElement('dialog');d.className='flow-source-panel';h.w.document.body.append(d);d.showModal();
  const buttons=()=>[...h.w.document.querySelectorAll('.flow-execution-controls button:not([data-action=stop])')];
  h.w.__native.isTauri=()=>true;
  for(const fails of [false,true]){
   let settle;
   h.w.__native.invoke=async name=>{
    if(name==='save_project_document')return new Promise((resolve,reject)=>settle=()=>fails?reject(Error('QA save failure')):resolve('/tmp/control-regression.agentcv'));
    return null;
   };
   const pending=h.$('saveProject').onclick();
   assert.ok(buttons().every(b=>b.disabled),'modal must not leave execution available during another operation');
   h.$('openPurposeScheme').click();h.w.document.querySelector('.purpose-workspace-dialog')?.close();
   settle();await pending;
   assert.ok(buttons().every(b=>!b.disabled),'the operation settling must unlock without closing the source modal');
   assert.equal(d.open,true);
  }
  h.api.project.data.datasetExecutions=[{id:'interrupted',status:'RUNNING',processed:0,total:1}];h.api.render();
  assert.ok(buttons().every(b=>!b.disabled));
  d.close();assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('execution states repaint both flow sizes without changing geometry, including successful product NG',async()=>{
 const h=await createHarness();
 try{
  await h.api.startupReady;
  const map=h.api.inquiryView.programFlow.map;
  const flow={nodes:[{id:'a',title:'計算',kind:'procedure',status:'DECLARED'},{id:'b',title:'分類',kind:'category',status:'DECLARED'}],edges:[{id:'a-b',from:'a',to:'b',kind:'dependency'}],roots:['a'],diagnostics:[]};
  await map.update({flow,runId:'state-regression'});map.expand();await map.expanded.layoutReady;
  const geometry=map.geometry;
  for(const [status,key] of [['RUNNING','running'],['SUCCEEDED','succeeded'],['FAILED','fault'],['SKIPPED','skipped'],['SUCCEEDED','succeeded']]){
   await map.update({flow:{...flow,nodes:flow.nodes.map(n=>({...n,status,judgement:'NG'}))},runId:'state-regression'});
   assert.equal(map.geometry,geometry);
   for(const surface of [map.main,map.expanded]){
    const node=surface.world.querySelector('[data-program-node="a"]');
    assert.equal(node.dataset.state,key);assert.ok(node.classList.contains('state-'+key));
   }
  }
  const style=h.w.document.createElement('style');style.textContent=await readFile(new URL('../src/side-theme.css',import.meta.url),'utf8');h.w.document.head.append(style);h.w.document.body.classList.add('side-workbench');
  const node=map.main.world.querySelector('[data-program-node="a"]');
  assert.equal(h.w.getComputedStyle(node).getPropertyValue('--flow-background'),'#b6e0c4');
  node.classList.replace('state-succeeded','state-fault');assert.equal(h.w.getComputedStyle(node).getPropertyValue('--flow-background'),'#f2b8c1');
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('toolbar does not label the gap between batch units as a fault and settles external execution',async()=>{
 const h=await createHarness();
 try{
  await h.api.startupReady;
  const p=h.api.project,output=h.w.document.querySelector('.flow-execution-controls output');
  p.data.datasetExecutions=[{id:'batch-external',status:'RUNNING',processed:1,total:2}];h.api.render();
  assert.doesNotMatch(output.textContent,/執行故障/);
  p.data.datasetExecutions[0].status='COMPLETED';p.data.datasetExecutions[0].processed=2;h.api.render();
  assert.match(output.textContent,/執行結束.*2 \/ 2/);
  p.data.datasetExecutions.push({id:'cancelled-external',status:'CANCELLED',processed:1,total:33});h.api.render();
  assert.match(output.textContent,/已停止.*1 \/ 33/);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
