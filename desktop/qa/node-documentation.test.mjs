import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {Workspace} from '../src/workspace.js';
import {decodeBenchmarkImage} from '../scripts/agentcv-benchmark-batch.mjs';
import {compileScheme,schemeFingerprint} from '../src/purpose-compiler.js';
import {runDatasetScheme,algorithmRunCurrent,auditAlgorithmRun} from '../src/algorithm-workspace.js';
import {buildProgramFlow} from '../src/program-flow.js';
import {setNodeDocumentation,nodeDocumentation} from '../src/node-documentation.js';
import {agentTools} from '../src/agent-contract.js';
import {createPipelinePlan} from '../src/pipeline-registry.js';
import {buildNodeDocumentationPage} from '../src/node-documentation-page.js';
import {validatePipelineEvidenceProposal} from '../src/pipeline-evidence-contract.js';

const require=createRequire(import.meta.url),{createCanvas}=require('../../qa/node_modules/@napi-rs/canvas');
const exec=promisify(execFile),desktop=path.resolve(new URL('..',import.meta.url).pathname);
function plan(){return {id:'documentation-qa',execution:{unit:'workpiece',inputSlots:[{id:'image',required:true}]},classificationSpec:{schema:'agentcv-classification-spec-1',id:'size',provenance:[{type:'human',ref:'QA image-width rule only',status:'confirmed'}],categories:[{id:'known',label:'已讀尺寸',quality:'good'},{id:'missing',label:'缺少',quality:'undetermined'}],metrics:[{id:'width',unit:'px',range:{min:0,max:1000}}],rules:[{id:'size',categoryId:'known',when:{metric:'width',interval:{min:0,max:1000,includeMin:true,includeMax:true}}}],coverage:{policy:'exhaustive'},missing:{NOT_FOUND:'missing',MISSING:'missing',SKIPPED:'missing'},conflicts:{mode:'priority',priority:['size']},aggregation:{mode:'all-good'},fault:{exit:'FAULT'}},operatorGraph:{nodes:[{id:'measure',title:'讀取像素尺寸',documentation:'直接讀圖寬，不推估實際工件尺寸。',parameters:{},expected_outputs:[{id:'size',type:'evidence'}],code:'with step("size", documentation="這裡只讀原圖的像素寬度。") as s:\n    width = int(image.shape[1])\n    s.set_output("width", width)\n    save_json("size", {"width": width})\nresult = {"valid": True, "width": width}'}],edges:[]},metricBindings:[{metric:'width',nodeId:'measure',path:'width'}]};}

test('free documentation survives real Python execution, persistence and edits without invalidating results',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-node-documentation-'));
 try{
  const p=new Workspace(),canvas=createCanvas(32,24);canvas.getContext('2d').fillRect(0,0,32,24);
  await p.addImages([{name:'width-qa.png',dataUrl:canvas.toDataURL('image/png')}],decodeBenchmarkImage);p.data.purposeScheme=plan();
  assert.equal(compileScheme(p.purposeScheme).ok,true);
  const result=await runDatasetScheme(p,async request=>{
   const file=path.join(temp,'request.json');await fs.writeFile(file,JSON.stringify({...request,runId:'documentation-actual-run'}));
   await exec(path.join(desktop,'runtime/python/bin/python3'),[path.join(desktop,'scripts/cv-runtime.py'),'--run',file,temp]);
   return JSON.parse(await fs.readFile(path.join(temp,'result.json'),'utf8'));
  },{units:[{id:'part',imageIds:[p.image.id]}]});
  assert.equal(result.execution.counts.execution.FAULT,0);
  const run=p.data.algorithmRuns[0];assert.equal(run.status,'SUCCEEDED',run.traceback);assert.equal(run.result.width,32);
  assert.equal(run.evidenceAudit.status,'READY_FOR_REVIEW',JSON.stringify(run.evidenceAudit.errors));assert.equal(run.artifacts.length,1,'no documentation-only images are required');
  assert.equal(run.documentation,p.purposeScheme.operatorGraph.nodes[0].documentation);assert.equal(run.procedureTrace.nodes[0].documentation,'這裡只讀原圖的像素寬度。');
  const before=JSON.stringify(run),basis=schemeFingerprint(p.purposeScheme),next='# 尺寸從哪裡來\n\n直接讀取圖像寬度，這不是毫米測量。\n\n'+('自由段落，無需三欄。\n\n'.repeat(30));
  setNodeDocumentation(p,'measure',next,{schemeId:p.purposeScheme.id});
  assert.equal(schemeFingerprint(p.purposeScheme),basis);assert.equal(algorithmRunCurrent(p,run),true);assert.equal(JSON.stringify(run),before,'immutable execution snapshot');
  assert.equal(buildProgramFlow(p).nodes[0].documentation,next);
  const saved=JSON.parse(JSON.stringify(p.data));assert.equal(saved.purposeScheme.operatorGraph.nodes[0].documentation,next);
  const missing=structuredClone(run);missing.artifacts=[];assert.equal(auditAlgorithmRun(missing,run.expectedOutputs).status,'DIAGNOSTIC_ONLY');
  const broken=structuredClone(run);broken.procedureTrace.nodes[0].dependencyInstances=['absent'];assert.equal(auditAlgorithmRun(broken,run.expectedOutputs).status,'DIAGNOSTIC_ONLY');
  const duplicate=structuredClone(run);duplicate.procedureTrace.nodes.push({...duplicate.procedureTrace.nodes[0],id:'unrelated',instanceId:'unrelated#1'});
  assert.ok(auditAlgorithmRun(duplicate,run.expectedOutputs).errors.some(e=>e.code==='PROCEDURE_ARTIFACT_MULTIPLE_PRODUCERS'),'unrelated steps cannot claim another producer’s artifact');
  p.purposeScheme.operatorGraph.nodes[0].code+='\n# executable change';assert.equal(algorithmRunCurrent(p,run),false);
  assert.equal(buildProgramFlow(p).nodes[0].documentation,run.documentation,'historical results retain their original document');
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('legacy prose remains readable without three fixed headings',()=>{
 const legacy={justification:{tool:{reason:'定位外框。'},parameters:[{name:'threshold',reason:'暫用設定，未比較。',source:'agent-proposal'}],boundaries:[{condition:'遮擋尚未驗證。',onFailure:'UNKNOWN'}]}};
 const doc=nodeDocumentation(legacy);assert.equal(doc.legacy,true);for(const value of ['定位外框','暫用設定','遮擋尚未驗證'])assert.ok(doc.text.includes(value));assert.doesNotMatch(doc.text,/為何使用此|適用邊界/);
 assert.deepEqual(nodeDocumentation({...legacy,documentation:'單段說明'}),{text:'單段說明',legacy:false});
});
test('tool and schema allow documents without fixed justification fields',()=>{
 const tool=agentTools.find(t=>t.function.name==='run_algorithm').function.parameters;
 assert.ok(!tool.required.includes('justification'));assert.equal(tool.properties.documentation.type,'string');
 assert.ok(agentTools.some(t=>t.function.name==='set_node_documentation'));
 const scheme=plan();scheme.operatorGraph.nodes[0].documentation=42;assert.equal(compileScheme(scheme).ok,false);
 const builtin=createPipelinePlan({task:'holes',documentations:{features:'這裡量測封閉孔洞。'}});assert.equal(validatePipelineEvidenceProposal(builtin).valid,true);
});

test('output-mode fast refresh opens, preserves scrolling, updates and closes the document without rebuilding images',async()=>{
 const {createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{
  const p=h.api.project;p.data.purposeScheme=h.w.JSON.parse(JSON.stringify(plan()));await h.api.go(6);await h.tick();
  const view=h.api.inquiryView,flow=view.programFlow;view.outputView.focus('measure');view.render();
  const image=view.outputView.surface.image;flow.openEvidence('scheme::measure');
  const panel=h.w.document.querySelector('.node-document-panel');assert.ok(panel);assert.match(panel.textContent,/直接讀圖寬/);assert.equal(panel.querySelector('nav'),null);
  const body=panel.querySelector('.program-evidence-body');body.scrollTop=100;view.render();assert.equal(h.w.document.querySelector('.node-document-panel'),panel);assert.equal(body.scrollTop,100);assert.equal(view.outputView.surface.image,image);
  setNodeDocumentation(p,'measure','新的自由文檔。');view.render();assert.match(h.w.document.querySelector('.node-document-panel').textContent,/新的自由文檔/);assert.equal(view.outputView.surface.image,image);
  h.w.document.querySelector('.node-document-panel header button').click();assert.equal(h.w.document.querySelector('.node-document-panel'),null);assert.equal(view.outputView.surface.image,image);
 }finally{h.close();}
});

test('illustrated node article uses isolated diagrams and its controls update the explanation',async()=>{
 const article=await fs.readFile(path.join(desktop,'agent-packages/agentcv-cv/skills/cv/references/node-documentation-example.md'),'utf8');
 const {createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{
  const scheme=plan();scheme.operatorGraph.nodes[0].documentation=article;
  assert.equal(compileScheme(scheme).ok,true);
  h.api.project.data.purposeScheme=h.w.JSON.parse(JSON.stringify(scheme));await h.api.go(6);await h.tick();
  const view=h.api.inquiryView;view.outputView.focus('measure');view.render();view.programFlow.openEvidence('scheme::measure');
  const panel=h.w.document.querySelector('.node-document-panel'),frames=panel.querySelectorAll('iframe');
  assert.equal(frames.length,6);assert.equal(panel.querySelectorAll('script,img').length,0,'visual source must not enter the host document');
  assert.equal(panel.querySelectorAll('table').length,1,'tables remain in the reading flow');
  assert.ok([...frames].every(frame=>frame.getAttribute('sandbox')==='allow-scripts'));
  const exported=buildNodeDocumentationPage(scheme.operatorGraph.nodes[0],{document:h.w.document});
  assert.match(exported,/@media print/);assert.match(exported,/window.print/);
  const exportedDOM=new h.w.DOMParser().parseFromString(exported,'text/html');
  assert.equal(exportedDOM.querySelectorAll('main iframe').length,6);
  assert.equal(exportedDOM.querySelectorAll('main table').length,1);
  assert.equal(exportedDOM.querySelectorAll('main script').length,0);

  const {JSDOM}=require('../../qa/node_modules/jsdom');
  const demo=new JSDOM([...frames].find(frame=>frame.title.startsWith('互動示意')).srcdoc,{runScripts:'dangerously'});
  try{
   const doc=demo.window.document,slider=doc.getElementById('dx');
   assert.match(doc.getElementById('reading').textContent,/25.0 px/);
   slider.value='70';slider.dispatchEvent(new demo.window.Event('input'));
   assert.match(doc.getElementById('reading').textContent,/-40.0 px/);
   doc.getElementById('reset').click();assert.match(doc.getElementById('reading').textContent,/25.0 px/);
  }finally{demo.window.close();}
  const source=frames[0].srcdoc;
  const evidence=new JSDOM(source,{runScripts:'dangerously'});
  try{
   const doc=evidence.window.document;assert.ok(doc.querySelector('svg image').getAttribute('href').startsWith('data:image/jpeg;base64,'));
   assert.equal(doc.querySelectorAll('svg image').length,2);assert.ok(doc.querySelectorAll('#supports circle').length>=100);
   const check=doc.getElementById('show-estimate');check.checked=false;check.dispatchEvent(new evidence.window.Event('change'));
   assert.equal(doc.getElementById('estimates').style.display,'none');
   assert.ok(doc.querySelectorAll('#estimates polyline').length>=2);
   const scan=doc.getElementById('show-scan');scan.checked=false;scan.dispatchEvent(new evidence.window.Event('change'));assert.equal(doc.getElementById('scans').style.display,'none');
   assert.equal(doc.querySelectorAll('#scans polygon').length,8);
  }finally{evidence.window.close();}
 }finally{h.close();}
});
