import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require('../../qa/node_modules/jsdom'),esbuild=require('esbuild');
const bundle=esbuild.build({stdin:{contents:"import {openOperatorTopology} from './src/operator-topology-view.js';window.openTopology=openOperatorTopology;",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},logLevel:'silent'}).then(r=>r.outputFiles[0].text);
async function fixture(){
 const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.eval(await bundle);
 const full={runId:'r',title:'實算',status:'SUCCEEDED',codeSha256:'code',workpieceUnit:{id:'u',imageIds:['i']},sourceBinding:{images:[{imageId:'i',imageSha256:'original'}]},artifacts:[],result:{valid:true},procedureTrace:{schema:'agentcv-procedure-trace-1',nodes:[{id:'step',instanceId:'step#1',kind:'step',name:'模型步驟',status:'SUCCEEDED',parameters:{},outputs:{model:[11,22,33]},artifactIds:[]}]}};
 const run=structuredClone(full);run.procedureTrace.nodes[0].outputs.model={deferred:true};run.deferredProcedureTrace={schema:'agentcv-deferred-procedure-trace-1',runId:'r',unitId:'u',executionId:'e'};
 const project=w.JSON.parse(JSON.stringify({epoch:1,data:{images:[],algorithmRuns:[run],datasetExecutions:[{id:'e',units:[{unitId:'u',runIds:['r'],recordRef:{executionId:'e',unitId:'u'}}]}]}}));
 const saved=w.JSON.parse(JSON.stringify({executionId:'e',record:{unitId:'u',runIds:['r']},runs:[full]}));
 return {w,project,saved,close:()=>w.close()};
}
test('topology loads complete outputs on demand without changing hot project data',async()=>{
 const h=await fixture();try{let release;const before=JSON.stringify(h.project);const pending=h.w.openTopology({project:h.project,runId:'r',records:{read:()=>new Promise(r=>release=r)}});
 assert.match(h.w.document.body.textContent,/正在讀取完整/);release(h.saved);const shown=await pending;
 assert.deepEqual(Array.from(shown.flow.nodes.find(n=>n.instanceId==='step#1').outputs.model),[11,22,33]);assert.ok(shown.canvas);assert.equal(JSON.stringify(h.project),before);shown.dialog.close();
 }finally{h.close();}
});
test('closing while loading prevents topology publication',async()=>{
 const h=await fixture();try{let release;const pending=h.w.openTopology({project:h.project,runId:'r',records:{read:()=>new Promise(r=>release=r)}});
 h.w.document.querySelector('dialog').close();release(h.saved);const result=await pending;assert.equal(result.cancelled,true);assert.equal(h.w.document.querySelector('dialog'),null);
 }finally{h.close();}
});
test('project changes and superseded requests never publish loaded topology',async()=>{
 for(const mode of ['epoch','caller']){const h=await fixture();try{let release,valid=true;const pending=h.w.openTopology({project:h.project,runId:'r',isCurrent:()=>valid,records:{read:()=>new Promise(r=>release=r)}});
 if(mode==='epoch')h.project.epoch++;else valid=false;release(h.saved);const result=await pending;assert.equal(result.cancelled,true);assert.equal(result.canvas,undefined);assert.equal(h.w.document.querySelector('dialog'),null);
 }finally{h.close();}}
});
test('archive failures keep a visible error and never render deferred values',async()=>{
 const h=await fixture();try{const result=await h.w.openTopology({project:h.project,runId:'r',records:{read:async()=>{throw Error('保存失敗');}}});assert.equal(result.canvas,undefined);assert.match(result.dialog.querySelector('[role=alert]').textContent,/保存失敗/);assert.doesNotMatch(result.dialog.textContent,/deferred/);
 }finally{h.close();}
});
test('complete topology does not invoke archive reads',async()=>{
 const h=await fixture();try{h.project.data.algorithmRuns=[h.saved.runs[0]];const result=await h.w.openTopology({project:h.project,runId:'r',records:{read:()=>assert.fail('unnecessary IO')}});assert.ok(result.canvas);
 }finally{h.close();}
});
