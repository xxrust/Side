import {externalRunPayload} from '../src/external-run-files.js';
import {createActualExternalFileTransport} from './external-files-real-transport.mjs';
// Real PNG fixtures and browser DOM events verify the programmable-CV reader.
// These checks do not claim a native WKWebView layout or algorithm accuracy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),{JSDOM,VirtualConsole}=require('../../qa/node_modules/jsdom'),{createCanvas}=require('../../qa/node_modules/@napi-rs/canvas'),esbuild=require('esbuild');
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bundle=esbuild.build({stdin:{contents:`import {AlgorithmRunView} from './src/algorithm-run-view.js';window.AlgorithmRunView=AlgorithmRunView;`,resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},target:'es2022',logLevel:'silent'}).then(result=>result.outputFiles[0].text);
function png(width,height,color){const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,width,height);return canvas.toDataURL('image/png')}
function run(){return {schema:'agentcv-programmable-run-1',runId:'actual-run-one',status:'SUCCEEDED',title:'按方向取邊',sourceBinding:{imageId:'camera-one',imageSha256:'original-sha',width:480,height:270},code:'import cv2\nprint("<img src=x onerror=alert(1)>")',codeSha256:'source-code-sha',parameters:{direction:'positive',ordinal:1,optional:null},justification:{tool:{reason:'在已提供搜尋帶內，依掃描方向比較真實候選。',expectedEvidence:[{kind:'artifact',id:'overlay',type:'image'}]},parameters:[{name:'direction',source:'agent-proposal',reason:'依人類要求使用原圖 +X 掃描順序。',verification:{kind:'artifact',id:'comparison',type:'image'}},{name:'ordinal',source:'human-input',reason:'使用者要求第一條合格候選。',verification:{kind:'artifact',id:'overlay',type:'image'}},{name:'optional',value:17,source:'not-supplied',reason:'未給條件保留空值。',verification:{kind:'artifact',id:'missing',type:'image'}}],boundaries:[{condition:'ROI 必須保留實際支持點。',check:{kind:'gate',id:'support'},onFailure:'UNKNOWN'},{condition:'跨圖穩定性須另行核對。',check:{kind:'gate',id:'cross-image'},onFailure:'REQUEST_HUMAN'}]},artifacts:[{id:'overlay',type:'image',name:'本輪疊圖',section:'tool',dataUrl:png(480,270,'#fff'),width:480,height:270,sha256:'overlay-sha'},{id:'comparison',type:'image',name:'逐候選比較',sections:['parameters','boundary'],dataUrl:png(320,140,'#2b6891'),width:320,height:140,sha256:'comparison-sha'},{id:'wrong-run',type:'image',name:'不能混入的舊圖',dataUrl:png(20,20,'#f00'),width:20,height:20,sourceBinding:{imageId:'camera-one',imageSha256:'original-sha',runId:'previous-run'}},{id:'wrong-source',type:'image',name:'不能混入的異圖',dataUrl:png(20,20,'#f00'),width:20,height:20,source:{imageId:'camera-one',inputSha256:'another-sha'}},{id:'values',type:'json',name:'候選數據',data:{count:3}}],result:{gates:[{id:'support',status:'PASS',actual:0.9,value:0.9,threshold:0.65}],count:3},stdout:'fitted 3 candidates',stderr:'',environment:{python:'3.12',libraries:{cv2:'actual-test-fixture'}},runDirectory:'/project/runs/actual-run-one',durationMs:34};}
async function harness(){const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));const dom=new JSDOM('<!doctype html><main></main>',{url:'http://localhost:1420',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};w.ResizeObserver=class{observe(){}disconnect(){}};w.eval(await bundle);const references=[],externalFiles=[],write=await createActualExternalFileTransport(),view=new w.AlgorithmRunView({onReference:request=>references.push(request),onOpenExternal:async(record,section)=>{const payload=externalRunPayload(record),receipt=await write('prepare_external_run_files',{request:payload});externalFiles.push({section,payload,receipt});return receipt;},isCurrent:binding=>binding.imageId==='camera-one'});return {w,view,references,externalFiles,errors,from:value=>w.JSON.parse(JSON.stringify(value)),close(){view.destroy();w.close()}}}
const clickTab=(view,name)=>[...view.dialog.querySelectorAll('[role=tab]')].find(button=>button.textContent===name).click();

test('real current-run PNGs stay rectangular and source-bound; mismatched run/source and JSON never masquerade as images',async()=>{
 const h=await harness();try{const input=run();h.view.open(h.from(input));assert.equal(h.view.artifacts.length,2);assert.equal(h.view.rejectedArtifacts.length,2);assert.equal(h.view.dialog.querySelectorAll('.algorithm-run-thumbnail').length,2);assert.equal(h.view.currentArtifact().id,'overlay');assert.equal(h.view.image.src,input.artifacts[0].dataUrl);assert.equal(h.view.dialog.dataset.runId,input.runId);assert.equal(h.view.dialog.querySelectorAll('[role=tab]').length,0);assert.match(h.view.dialog.textContent,/來源與本次運算不一致/);
  Object.defineProperties(h.view.viewport,{clientWidth:{value:960},clientHeight:{value:450}});h.view.fit();assert.ok(Math.abs(parseFloat(h.view.image.style.width)/parseFloat(h.view.image.style.height)-480/270)<1e-10);h.view.zoomTo(1);assert.equal(h.view.image.style.width,'480px');assert.equal(h.view.image.style.height,'270px');assert.equal(h.view.zoomLabel.textContent,'100%');
  input.artifacts[0].dataUrl='data:image/png;base64,changed';input.sourceBinding.imageSha256='changed';assert.equal(h.view.currentArtifact().dataUrl,run().artifacts[0].dataUrl);assert.equal(h.view.snapshot().sourceBinding.imageSha256,'original-sha');h.view.reference();assert.equal(h.references.length,1);assert.equal(h.references[0].artifact.id,'overlay');assert.equal(h.references[0].snapshot.runId,'actual-run-one');assert.equal(h.references[0].snapshot.artifactSha256,'overlay-sha');assert.ok(!JSON.stringify(h.view.snapshot()).includes('base64'));assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('one free-form document replaces tabs, renders full Markdown and preserves legacy prose',async()=>{
 const h=await harness();try{
  const input=run();h.view.open(h.from(input));const legacy=h.view.dialog.querySelector('.node-document');assert.match(legacy.textContent,/在已提供搜尋帶內/);assert.equal(h.view.dialog.querySelector('[role=tablist]'),null);
  input.documentation='# 設計說明\n\n直接說明目前的選擇與取捨。\n\n'+('這是一段可捲動的完整說明。\n\n'.repeat(60))+'最後一段仍可閱讀。';
  h.view.open(h.from(input));const doc=h.view.dialog.querySelector('.node-document');assert.equal(doc.querySelector('h1').textContent,'設計說明');assert.match(doc.textContent,/最後一段仍可閱讀/);assert.doesNotMatch(doc.textContent,/在已提供搜尋帶內/);assert.equal(h.view.dialog.querySelector('[role=tab]'),null);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('source, code, errors and numerical outputs remain literal saved records, including failure with partial artifacts',async()=>{
 const h=await harness();try{const input=run();input.status='FAILED';input.error='ValueError: no supported edge';input.traceback='Traceback (most recent call last):\n  line 7\nValueError: no supported edge';h.view.open(h.from(input));assert.match(h.view.dialog.querySelector('.algorithm-run-heading').textContent,/執行失敗/);assert.ok(h.view.dialog.querySelector('.node-document'));assert.equal(h.view.currentArtifact().id,'overlay','partial image remains available under failed status');await h.view.showDrawer('code');const exported=h.externalFiles.at(-1);assert.equal(await fs.promises.readFile(exported.receipt.files.find(f=>f.kind==='code').path,'utf8'),input.code);assert.equal(h.view.dialog.querySelector('pre'),null,'full source is opened through an external file entry');assert.equal(h.view.dialog.querySelector('[src="x"]'),null);await h.view.showDrawer('logs');const logs=JSON.parse(await fs.promises.readFile(h.externalFiles.at(-1).receipt.files.find(f=>f.kind==='logs').path,'utf8'));assert.match(logs.traceback,/Traceback/);assert.match(logs.stdout,/fitted 3 candidates/);await h.view.showDrawer('environment');assert.equal(h.externalFiles.at(-1).payload.codeSha256,input.codeSha256);assert.equal(h.externalFiles.at(-1).receipt.runId,input.runId);await h.view.showDrawer('result');const data=await fs.promises.readFile(h.externalFiles.at(-1).receipt.files.find(f=>f.kind==='data').path,'utf8');assert.equal(JSON.parse(data).result.count,3);assert.ok(!data.includes('base64'));
  h.view.open(h.from({...input,runId:'failed-next-run',artifacts:[]}));assert.equal(h.view.currentArtifact(),null);assert.equal(h.view.dialog.querySelectorAll('.algorithm-run-viewport>img').length,0);assert.match(h.view.dialog.querySelector('.algorithm-run-empty').textContent,/ValueError: no supported edge/);assert.ok(h.view.dialog.querySelector('.algorithm-run-footer>button').disabled);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('image navigation and right-click quoting identify the exact selected artifact without altering input records',async()=>{
 const h=await harness();try{const input=run(),before=JSON.stringify(input);h.view.open(h.from(input));h.view.dialog.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));assert.equal(h.view.currentArtifact().id,'comparison');h.view.viewport.dispatchEvent(new h.w.MouseEvent('contextmenu',{clientX:120,clientY:180,bubbles:true,cancelable:true}));assert.ok(h.view.dialog.querySelector('[role=menu]'));h.view.dialog.querySelector('[role=menuitem]').click();assert.equal(h.references.length,1);assert.equal(h.references[0].snapshot.artifactId,'comparison');assert.equal(h.references[0].artifact.dataUrl,input.artifacts[1].dataUrl);assert.equal(JSON.stringify(input),before);h.view.dialog.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));assert.equal(h.view.currentArtifact().id,'overlay');h.view.close();assert.equal(h.view.snapshot(),null);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('actual nested multi-input runtime bindings display the primary image and reject any changed input, order or run without depending on object key order',async()=>{
 const h=await harness();try{
  const input=run();input.sourceBinding={projectEpoch:11,workflowRevision:8,images:[{imageId:'camera-one',imageSha256:'original-sha',width:480,height:270,pixelFingerprint:'480x270:original-fingerprint'},{imageId:'reference-two',imageSha256:'reference-sha',width:160,height:90,pixelFingerprint:'160x90:reference-fingerprint'}]};
  const orderedSource={images:input.sourceBinding.images.map(({imageId,imageSha256,width,height,pixelFingerprint})=>({pixelFingerprint,height,imageSha256,width,imageId})),workflowRevision:8,projectEpoch:11,runId:input.runId};
  const valid={...input.artifacts[0],source:orderedSource},changed=(id,edit)=>{const source=structuredClone(orderedSource);edit(source);return {...valid,id,name:id,source}};
  input.artifacts=[valid,changed('changed-second-sha',source=>{source.images[1].imageSha256='changed'}),changed('changed-second-fingerprint',source=>{source.images[1].pixelFingerprint='changed'}),changed('changed-second-id',source=>{source.images[1].imageId='different-image'}),changed('swapped-inputs',source=>{source.images.reverse()}),changed('different-run',source=>{source.runId='other-run'}),changed('different-workflow',source=>{source.workflowRevision++}),changed('missing-second-input',source=>{source.images.pop()})];
  h.view.open(h.from(input));assert.equal(h.view.artifacts.length,1);assert.equal(h.view.rejectedArtifacts.length,7);assert.equal(h.view.currentArtifact().id,'overlay');const snapshot=h.view.snapshot();assert.equal(snapshot.sourceBinding.imageId,'camera-one');assert.equal(snapshot.sourceBinding.imageSha256,'original-sha');assert.equal(snapshot.sourceBinding.width,480);assert.equal(snapshot.sourceBinding.height,270);assert.equal(snapshot.sourceBinding.pixelFingerprint,'480x270:original-fingerprint');assert.equal(snapshot.sourceBinding.images.length,2);assert.equal(snapshot.sourceBinding.images[1].imageId,'reference-two');assert.equal(snapshot.sourceBinding.projectEpoch,11);assert.equal(snapshot.sourceBinding.workflowRevision,8);assert.match(h.view.dialog.querySelector('.algorithm-run-footer').textContent,/480 × 270 px · original-sha/);assert.equal(h.view.run.sourceBinding.imageId,undefined,'UI normalization does not rewrite the preserved runtime envelope');
  h.view.reference();assert.equal(h.references[0].snapshot.sourceBinding.images[1].imageSha256,'reference-sha');assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('native runtime JSON artifacts resolve as declared evidence for tool and parameter references; missing gate comparisons stay unverified',async()=>{
 const h=await harness();try{
  const actual=JSON.parse(fs.readFileSync(new URL('./fixtures/native-algorithm-evidence-run.json',import.meta.url),'utf8')),comparison=actual.artifacts.find(a=>a.id==='comparison');assert.equal(actual.runId,'py-65eb2f99b68bf-89351-0');assert.equal(actual.status,'SUCCEEDED');assert.equal(comparison.width,1400);assert.equal(comparison.height,1000);assert.equal(createHash('sha256').update(Buffer.from(comparison.dataUrl.split(',')[1],'base64')).digest('hex'),actual.fixtureMetadata.realComparisonSha256,'fixture contains the exact native PNG bytes, not a substitute raster');
  h.view.open(h.from(actual),{artifactId:'comparison'});assert.equal(h.view.image.src,comparison.dataUrl);assert.equal(h.view.verification({kind:'artifact',type:'evidence',id:'candidates'}).state,'recorded');assert.match(h.view.verification({kind:'artifact',type:'evidence',id:'candidates'}).value,/candidates\.json/);assert.equal(h.view.dialog.querySelectorAll('[role=tabpanel] [data-state=missing]').length,0,'all three actual tool artifacts resolve');
  for(const selector of [{kind:'artifact',type:'evidence',id:'not-present'},{kind:'artifact',type:'evidence',id:'candidates.json'},{kind:'artifact',type:'image',id:'candidates'},{kind:'artifact',type:'evidence',id:'comparison'}])assert.equal(h.view.verification(selector).state,'missing','different IDs/types cannot borrow a saved artifact');
  assert.ok(h.view.run.result.boundaryChecks.every(check=>!Object.hasOwn(check,'threshold')),'viewer never invents missing comparison thresholds');assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('actual boundary data remains available in execution files independently of documentation',async()=>{
 const h=await harness();try{const native=JSON.parse(fs.readFileSync(new URL('./fixtures/native-algorithm-boundaries.json',import.meta.url),'utf8')),input=run();input.result={boundaryChecks:native.boundaryChecks};input.documentation='檢查結果保存在本次實算資料中。';h.view.open(h.from(input),{section:'boundary'});
  assert.equal(h.view.snapshot().section,'document');assert.equal(h.view.dialog.querySelector('[role=tab]'),null);assert.equal(h.view.verification({kind:'gate',id:native.boundaryChecks[0].id}).check.status,native.boundaryChecks[0].status);
  await h.view.showDrawer('result');const full=await fs.promises.readFile(h.externalFiles.at(-1).receipt.files.find(f=>f.kind==='data').path,'utf8');assert.deepEqual(JSON.parse(full).result.boundaryChecks,native.boundaryChecks);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('deferred records show loading and render complete evidence only after the requested read',async()=>{
 const h=await harness();try{
  const summary=h.from({...run(),deferredProcedureTrace:{schema:'agentcv-deferred-procedure-trace-1'}});let release;
  h.view.loadRunDetails=(_run,guard)=>{assert.equal(guard.isCurrent(),true);return new Promise(resolve=>release=resolve);};
  const opened=h.view.open(summary);assert.equal(h.view.run,null);assert.match(h.view.dialog.textContent,/正在讀取完整/);assert.equal(h.view.snapshot(),null);
  const complete=h.from({...run(),documentation:'完整封存證據'});release(complete);assert.equal(await opened,h.view);
  assert.equal(h.view.run.deferredProcedureTrace,undefined);assert.match(h.view.dialog.textContent,/完整封存證據/);
 }finally{h.close();}
});
test('late detail reads cannot reopen closed dialogs or replace a newer selection',async()=>{
 for(const action of ['close','replace','destroy']){
  const h=await harness();try{
   let release,guard;h.view.loadRunDetails=(_run,g)=>{guard=g;return new Promise(resolve=>release=resolve);};
   const pending=h.view.open(h.from({...run(),deferredProcedureTrace:{}}));
   if(action==='close')h.view.close();if(action==='destroy')h.view.destroy();if(action==='replace')h.view.open(h.from({...run(),runId:'new-selection'}));
   assert.equal(guard.isCurrent(),false);release(h.from(run()));assert.equal(await pending,null);
   if(action==='close')assert.equal(h.view.dialog.open,false);
   if(action==='replace')assert.equal(h.view.run.runId,'new-selection');
   if(action==='destroy')assert.equal(h.view.dialog.isConnected,false);
  }finally{h.close();}
 }
});
test('failed or mismatched detail reads display an error without presenting summary as evidence',async()=>{
 for(const failure of ['missing','reject','wrong-run','still-deferred']){
  const h=await harness();try{
   if(failure!=='missing')h.view.loadRunDetails=async()=>{if(failure==='reject')throw Error('disk unavailable');return h.from({...run(),...(failure==='wrong-run'?{runId:'other'}:{deferredProcedureTrace:{}})});};
   assert.equal(await h.view.open(h.from({...run(),deferredProcedureTrace:{}})),null);
   assert.equal(h.view.run,null);assert.equal(h.view.snapshot(),null);assert.match(h.view.dialog.querySelector('[role=alert]').textContent,/無法讀取完整/);assert.equal(h.references.length,0);
  }finally{h.close();}
 }
});


test('routine capture notice survives rendering and does not promise an archived full snapshot',async()=>{
 const h=await harness();try{const value=run();value.procedureTrace={capture:{mode:'essential'},nodes:[]};h.view.open(h.from(value));
  assert.match(h.view.dialog.querySelector('.algorithm-run-capture-notice').textContent,/未採集.*診斷重跑/);
  h.view.render();assert.equal(h.view.dialog.querySelectorAll('.algorithm-run-capture-notice').length,1);
 }finally{h.close();}
});
