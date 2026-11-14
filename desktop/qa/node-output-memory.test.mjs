import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Workspace} from '../src/workspace.js';
import {runDatasetScheme} from '../src/workpiece-runner.js';
import {resolveNodeOutput,outputImageReference} from '../src/node-output-model.js';
import {createInspectionRecords,durableInspectionProduct,loadCurrentOutputImage,restoreCurrentOutputRecord} from '../src/inspection-records.js';
import {beginWorkpieceArtifactPixels,workpieceArtifactPixel} from '../src/workpiece-live-state.js';

const require=createRequire(import.meta.url),{createCanvas,loadImage}=require('../../qa/node_modules/@napi-rs/canvas');
test('durable JSON descriptors omit only the actual memory-backed artifact value',()=>{
 const memoryRef={kind:'runtime-memory',runId:'actual',artifactId:'facts',sha256:'exact'};
 const original={runs:[{runId:'actual',result:{type:'json',memoryRef,data:{must:'stay'}},artifacts:[
  {id:'facts',type:'json',memoryRef,data:{coordinates:[1,2,3]}},
  {id:'legacy',type:'json',data:{must:'stay'}}]}]};
 const saved=durableInspectionProduct(original);
 assert.equal(saved.runs[0].artifacts[0].data,undefined);
 assert.equal(saved.runs[0].artifacts[0].dataStorage,'artifact-bytes');
 assert.deepEqual(saved.runs[0].artifacts[0].memoryRef,memoryRef);
 assert.deepEqual(saved.runs[0].result,original.runs[0].result);
 assert.deepEqual(saved.runs[0].artifacts[1],original.runs[0].artifacts[1]);
 assert.deepEqual(original.runs[0].artifacts[0].data,{coordinates:[1,2,3]});
 assert.equal(original.runs[0].artifacts[0].dataStorage,undefined);
});
const root=fileURLToPath(new URL('..',import.meta.url)),python=process.env.AGENTCV_QA_PYTHON||'python';
const spec={schema:'agentcv-classification-spec-1',id:'pixel-transport',provenance:[{type:'human',ref:'QA transport check, not inspection accuracy',status:'confirmed'}],categories:[{id:'pixels',label:'Pixels',quality:'good'},{id:'missing',label:'Missing',quality:'bad'}],metrics:[{id:'present',type:'boolean'}],rules:[{id:'yes',categoryId:'pixels',when:{metric:'present',equals:true}},{id:'no',categoryId:'missing',when:{metric:'present',equals:false}}],coverage:{policy:'exhaustive'},missing:{NOT_FOUND:'missing',MISSING:'missing',SKIPPED:'missing'},conflicts:{mode:'priority',priority:['yes','no']},aggregation:{mode:'priority',priority:['pixels','missing']},fault:{exit:'FAULT'}};
const code=`with procedure("preview", "Transport check", outputs={"gray":"Gray", "edges":"Edges"}):
    with step("gray", "Grayscale"):
        save_image("gray", gray)
    with step("edges", "Canny", depends_on=["gray"]):
        save_image("edges", cv2.Canny(gray, 40, 100))
save_json("measurement", {"present": bool(image.size > 0)})
result = {"valid": True, "present": bool(image.size > 0)}
`;
async function decode(url){
 const image=await loadImage(url),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 const rgba=ctx.getImageData(0,0,image.width,image.height).data,gray=new Float32Array(image.width*image.height);
 for(let i=0;i<gray.length;i++)gray[i]=rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114;
 return {width:image.width,height:image.height,gray};
}
async function execute(request,directory){
 const run=await fs.mkdtemp(path.join(directory,'run-')),file=path.join(run,'request.json');
 await fs.writeFile(file,JSON.stringify({...request,runId:randomUUID()}));
 await new Promise((resolve,reject)=>{
  const child=spawn(python,[path.join(root,'scripts/cv-runtime.py'),'--run',file,run],{env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});let stderr='';
  child.stderr.on('data',bytes=>stderr+=bytes);child.on('error',reject);child.on('close',status=>status?reject(Error(stderr)):resolve());
 });
 return JSON.parse(await fs.readFile(path.join(run,'result.json'),'utf8'));
}

async function project(){
 const p=new Workspace(),canvas=createCanvas(64,48),ctx=canvas.getContext('2d');ctx.fillStyle='#e0b83e';ctx.fillRect(0,0,64,48);ctx.fillStyle='#245d78';ctx.fillRect(12,10,30,25);
 await p.addImages([{name:'transport.png',dataUrl:canvas.toDataURL('image/png')}],decode);
 p.setPurposeScheme({id:'output-memory',execution:{unit:'workpiece',inputSlots:[{id:'image',required:true}]},classificationSpec:spec,operatorGraph:{nodes:[{id:'preview',title:'Transport check',code,parameters:{},documentation:'Verify pixel transport and retention only.',expected_outputs:[{id:'measurement',type:'evidence'},...['gray','edges'].map(id=>({id,type:'image',role:'result'}))]}],edges:[]},metricBindings:[{metric:'present',nodeId:'preview',path:'present'}]});
 return p;
}

test('native dispatch string errors remain readable in saved node faults',async()=>{
 const p=await project(),message='找不到 Python 3。請配置 AGENTCV_PYTHON，或建立專案的 runtime/python 環境。';let saved;
 const outcome=await runDatasetScheme(p,async()=>{throw message;},{units:[{id:'dispatch-failure',imageIds:[p.image.id]}],saveUnitResult:async product=>{saved=JSON.parse(JSON.stringify(product));return {recordRef:{unitId:product.record.unitId}};}});
 assert.equal(outcome.execution.counts.execution.FAULT,1);
 const fault=saved.record.nodeStates.find(node=>node.nodeId==='preview');
 assert.equal(fault.reason,'DISPATCH_FAULT');assert.deepEqual(fault.error,{type:'Error',message});
 assert.equal(saved.runs.length,0);
});

test('real memory outputs survive metadata record restoration without entering project storage',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-output-memory-')),p=await project();
 let saved,reads=0;
 const records=createInspectionRecords(async(command,args)=>{assert.equal(command,'save_inspection_unit');saved=structuredClone(args.request);return {recordRef:{executionId:args.request.executionId,unitId:args.request.record.unitId}};});
 await runDatasetScheme(p,request=>execute(request,directory),{units:[{id:'unit-memory',imageIds:[p.image.id]}],artifactMode:'memory',artifactRetention:{mode:'metadata'},saveUnitResult:records.save});
 const live=resolveNodeOutput(p,{schemeNodeId:'preview'});assert.equal(live.status,'READY');assert.equal(live.artifacts.length,2);
 const pixels=new Map(live.artifacts.map(a=>[a.id,a.dataURL]));
 for(const a of live.artifacts){assert.ok(a.dataURL);assert.equal(createHash('sha256').update(Buffer.from(a.dataURL.split(',')[1],'base64')).digest('hex'),a.sha256);assert.equal(a.path,undefined);}
 assert.ok(saved.runs[0].artifacts.filter(a=>a.type==='image').every(a=>a.pixelRetention==='metadata-only'&&!a.dataURL&&!a.dataUrl&&!a.path));
 const ref=p.data.datasetExecutions[0].units[0].recordRef;p.restoreInspectionUnit(saved,ref);
 const model=resolveNodeOutput(p,{schemeNodeId:'preview'});assert.equal(model.status,'READY');
 const reader={artifact:async()=>{reads++;throw Error('Metadata history must not read pixels from disk');}},guard={isCurrent:()=>true};
 for(const a of model.artifacts){
  assert.equal(a.pixelRetention,'metadata-only');assert.equal(a.dataURL,pixels.get(a.id));
  const reference=outputImageReference(model,{...a,dataURL:'forged'});assert.equal(reference.dataURL,pixels.get(a.id));assert.equal(reference.source.unitId,'unit-memory');
  assert.equal((await loadCurrentOutputImage(p,model,a,reader,guard)).dataURL,pixels.get(a.id));
 }
 await assert.rejects(loadCurrentOutputImage(p,model,model.artifacts[0],reader,{isCurrent:()=>false}),/已切換/);
 await assert.rejects(loadCurrentOutputImage(p,model,{...model.artifacts[0],sha256:'different'},reader,guard),/所屬運算已切換/);
 assert.ok(p.data.algorithmRuns[0].artifacts.filter(a=>a.type==='image').every(a=>!a.dataURL&&!a.dataUrl),'Preview must stay process-local');
 const serialized=JSON.parse(p.serialize()),reopened=new Workspace();await reopened.load(serialized,decode);
 const history=resolveNodeOutput(reopened,{schemeNodeId:'preview'});assert.equal(history.status,'READY');
 for(const a of history.artifacts){assert.equal(a.dataURL,undefined);assert.throws(()=>outputImageReference(history,a),/摘要/);await assert.rejects(loadCurrentOutputImage(reopened,history,a,reader,guard),/摘要/);}
 beginWorkpieceArtifactPixels(p,'unit-next');
 assert.equal(workpieceArtifactPixel(p,'unit-memory',model.run.runId,model.artifacts[0].id),null);
 const expired=resolveNodeOutput(p,{schemeNodeId:'preview'});assert.equal(expired.artifacts[0].dataURL,undefined);
 await assert.rejects(loadCurrentOutputImage(p,expired,expired.artifacts[0],reader,guard),/摘要/);
 assert.equal(reads,0);
});

test('auto advance prepares the next image while retaining the exact completed workpiece output',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-auto-output-')),p=await project();
 const canvas=createCanvas(64,48);canvas.getContext('2d').fillRect(4,4,20,20);
 await p.addImages([{name:'next.png',dataUrl:canvas.toDataURL('image/png')}],decode);
 const [first,next]=p.data.images.map(image=>image.id),board=p.ensureProjectCanvas(),sourceId=board.projectSpaces.sources[0].id;
 p.bindCanvasImages(board.id,sourceId,[first,next]);
 p.setSourceAutoAdvance(sourceId,true);
 let saved;
 const records=createInspectionRecords(async(command,args)=>{saved=structuredClone(args.request);return {recordRef:{executionId:args.request.executionId,unitId:args.request.record.unitId}};});
 const run=unitId=>runDatasetScheme(p,request=>execute(request,directory),{sourceId,units:[{id:unitId,imageIds:[p.image.id]}],artifactMode:'memory',artifactRetention:{mode:'metadata'},saveUnitResult:records.save});
 const navigation=()=>({imageId:p.image.id,sourceId,epoch:p.epoch,selectionRevision:p.imageSelection});
 const before=navigation(),outcome=await run('first'),completed=resolveNodeOutput(p,{schemeNodeId:'preview'});
 assert.equal(completed.status,'READY');assert.ok(completed.artifacts[0].dataURL);
 const frames=[],unsubscribe=p.on(()=>frames.push(resolveNodeOutput(p,{schemeNodeId:'preview'})));
 const advanced=await p.advanceSourceAfterExecution(outcome.execution,before);assert.equal(advanced.advanced,true,advanced.reason);
 assert.equal(p.image.id,next,'next execution input advances immediately');
 const retained=resolveNodeOutput(p,{schemeNodeId:'preview'});
 assert.equal(retained.run?.runId,completed.run.runId,'output must remain bound to the completed run');
 assert.equal(retained.imageId,first,'actual input pane must match the completed output');
 assert.equal(retained.artifacts[0].dataURL,completed.artifacts[0].dataURL);
 assert.ok(frames.every(frame=>frame.run?.runId===completed.run.runId),'selection notifications must never flash an empty or unrelated result');
 assert.equal(outputImageReference(retained,retained.artifacts[0]).source.unitId,'first');unsubscribe();
 // Record reloads validate the displayed workpiece, while their async guard
 // still protects the prepared selection against subsequent user navigation.
 p.data.algorithmRuns=[];
 const reload=resolveNodeOutput(p,{schemeNodeId:'preview'});assert.equal(reload.status,'RESTORE_REQUIRED');
 await restoreCurrentOutputRecord(p,reload,{read:async()=>saved},{activeId:next,isCurrent:()=>p.image.id===next});
 assert.equal(resolveNodeOutput(p,{schemeNodeId:'preview'}).artifacts[0].dataURL,completed.artifacts[0].dataURL);
 assert.equal(JSON.parse(p.serialize()).activeId,next);
 // A human selection, even reselecting the prepared image, ends retention.
 await p.selectImage(next);assert.equal(resolveNodeOutput(p,{schemeNodeId:'preview'}).status,'WAITING');
 await p.selectImage(first);
 const secondNavigation=navigation(),second=await run('second');
 await p.advanceSourceAfterExecution(second.execution,secondNavigation);
 let started=false;
 await runDatasetScheme(p,request=>execute(request,directory),{sourceId,units:[{id:'next',imageIds:[next]}],artifactMode:'memory',artifactRetention:{mode:'metadata'},onNodeProgress:()=>{
  const current=resolveNodeOutput(p,{schemeNodeId:'preview'});if(current.pendingUnitId){assert.equal(current.pendingUnitId,'next');assert.equal(current.unitId,'second');assert.equal(current.imageId,first);assert.ok(current.artifacts[0].dataURL);}else{assert.equal(current.imageId,next);assert.equal(current.unitId,'next');}started=true;
 }});
 assert.ok(started);assert.equal(resolveNodeOutput(p,{schemeNodeId:'preview'}).unitId,'next');
 // Wrapping to an image with older results must keep the just-finished unit.
 const wrap=await p.advanceSourceAfterExecution(p.data.datasetExecutions.at(-1),navigation());assert.equal(wrap.advanced,true);assert.equal(p.image.id,first);
 assert.equal(resolveNodeOutput(p,{schemeNodeId:'preview'}).unitId,'next');
 p.data.purposeScheme.operatorGraph.nodes[0].parameters.changed=true;
 assert.equal(resolveNodeOutput(p,{schemeNodeId:'preview'}).status,'WAITING');
 p.newProject();assert.equal(resolveNodeOutput(p,{schemeNodeId:'preview'}).run,null);
});

test('output view keeps real input/output images, paging and inquiry identity after automatic navigation',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-auto-output-ui-')),p=await project();
 const canvas=createCanvas(64,48);canvas.getContext('2d').fillRect(2,2,16,16);
 await p.addImages([{name:'next.png',dataUrl:canvas.toDataURL('image/png')}],decode);
 const [first,next]=p.data.images.map(image=>image.id),board=p.ensureProjectCanvas(),sourceId=board.projectSpaces.sources[0].id;
 p.bindCanvasImages(board.id,sourceId,[first,next]);p.setSourceAutoAdvance(sourceId,true);
 const outcome=await runDatasetScheme(p,request=>execute(request,directory),{sourceId,units:[{id:'ui-completed',imageIds:[first]}],artifactMode:'inline'});
 const expected=resolveNodeOutput(p,{schemeNodeId:'preview'}),{createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{
  await h.api.loadProject(h.w.JSON.parse(p.serialize()));const live=h.api.project,view=h.api.inquiryView;
  for(const artifact of expected.run.artifacts.filter(a=>a.type==='image'))live.setInspectionArtifactPreview(expected.run.runId,artifact.id,artifact.dataURL||artifact.dataUrl);
  view.outputView.focus('preview');view.render();await h.tick();
  // Exercise the user's actual switch, and verify both its visible state and
  // the model before allowing the automatic-navigation assertion to pass.
  view.programFlow.refreshFlow();view.programFlow.openBoundary(view.programFlow.flow.nodes.find(n=>n.kind==='source'));await h.tick();
  const toggle=()=>h.w.document.querySelector('.flow-source-auto');
  assert.equal(toggle().getAttribute('aria-checked'),'true');
  await toggle().onclick();await h.tick();assert.equal(toggle().getAttribute('aria-checked'),'false');
  await toggle().onclick();await h.tick();assert.equal(toggle().getAttribute('aria-checked'),'true');
  assert.equal(live.data.visualInquiry.boards.flatMap(b=>b.projectSpaces?.sources||[]).find(s=>s.id===sourceId).autoAdvance,true);
  h.w.document.querySelector('.flow-source-panel[open]').close();
  const surface=view.outputView.surface,output=surface.image,input=surface.section.querySelector('.node-input-card img'),source=output.getAttribute('src'),inputSource=input.getAttribute('src');
  for(let i=0;i<100&&input.hidden;i++)await h.tick();
  assert.equal(output.hidden,false,'actual output must be visible before navigation');assert.equal(input.hidden,false,surface.section.querySelector('.node-input-card').textContent);assert.ok(source);assert.ok(inputSource);
  const navigation={imageId:first,sourceId,epoch:live.epoch,selectionRevision:live.imageSelection};
  assert.equal((await live.advanceSourceAfterExecution(outcome.execution,navigation)).advanced,true);await h.tick();
  for(let i=0;i<8;i++)view.render();
  assert.equal(live.image.id,next);assert.equal(view.outputView.surface,surface);
  assert.equal(surface.section.dataset.status,'READY');assert.equal(output.hidden,false);assert.equal(input.hidden,false);
  assert.equal(output.getAttribute('src'),source);assert.equal(input.getAttribute('src'),inputSource);
  assert.equal(surface.ask.disabled,false);assert.equal(view.outputView.currentModel.imageId,first);
  assert.equal(view.outputView.currentModel.run.runId,expected.run.runId);
  h.w.document.querySelector('[aria-label="下一組輸出圖"]').click();
  for(let i=0;i<100&&view.outputView.currentArtifact.id!==expected.artifacts[1].id;i++)await h.tick();
  assert.equal(view.outputView.currentArtifact.id,expected.artifacts[1].id);
  assert.equal(surface.image.getAttribute('src'),expected.artifacts[1].dataURL);
  // A full view remount must resolve the retained identity too, not rely on a
  // last-frame DOM fallback which loses paging and inquiry bindings.
  view.outputView.dispose();view.render();await h.tick();
  assert.equal(view.outputView.surface.section.dataset.status,'READY');assert.equal(view.outputView.currentModel.unitId,'ui-completed');
  await live.selectImage(next);view.render();await h.tick();
  assert.equal(view.outputView.surface.image.hidden,true,'manual selection must not retain the previous workpiece output');assert.equal(view.outputView.currentModel.imageId,next);assert.equal(view.outputView.currentModel.status,'WAITING');
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('open source dialog and main output retain matching decoded pairs throughout real continuous units',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-continuous-ui-')),p=await project();
 const canvas=createCanvas(64,48);canvas.getContext('2d').fillRect(2,2,16,16);
 await p.addImages([{name:'next.png',dataUrl:canvas.toDataURL('image/png')}],decode);
 const [first,next]=p.data.images.map(i=>i.id),board=p.ensureProjectCanvas(),sourceId=board.projectSpaces.sources[0].id;
 p.bindCanvasImages(board.id,sourceId,[first,next]);p.setSourceAutoAdvance(sourceId,true);
 const {createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{
  await h.api.loadProject(h.w.JSON.parse(p.serialize()));const live=h.api.project,view=h.api.inquiryView;
  let beforeExecute=async()=>{};
  const run=options=>h.w.__QAWorkpiece.runDatasetScheme(live,async r=>{await beforeExecute();return execute(r,directory);},{...options,sourceId,artifactMode:'memory',artifactRetention:{mode:'metadata'},saveUnitResult:async product=>({recordRef:{executionId:product.executionId,unitId:product.record.unitId}})});
  const wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await h.tick();}assert.ok(predicate(),'view did not settle');};
  view.outputView.focus('preview');view.render();
  view.onRunInspection=async options=>{const navigation={imageId:live.image.id,sourceId,epoch:live.epoch,selectionRevision:live.imageSelection},outcome=await run(options);await options.onResultReady?.(outcome);outcome.navigation=await live.advanceSourceAfterExecution(outcome.execution,navigation);return outcome;};
  view.programFlow.refreshFlow();view.programFlow.openBoundary(view.programFlow.flow.nodes.find(n=>n.kind==='source'));await h.tick();
  const dialog=h.w.document.querySelector('.flow-source-panel[open]');
  assert.equal(dialog.querySelector('.flow-source-auto').getAttribute('aria-checked'),'true');
  await dialog.querySelector(`button[data-image-id="${first}"]`).onclick();
  await wait(()=>dialog.querySelector('.source-decision img')?.getAttribute('src'));
  assert.equal(live.image.id,next,'automatic advance prepares the next dispatch');
  assert.equal(dialog.querySelector('.flow-source-original img').dataset.imageId,first,'source keeps the completed original');
  const inspect=async(expectedImage,expectedUnit)=>{
   await wait(()=>view.outputView.currentModel?.unitId===expectedUnit);const m=view.outputView.currentModel,u=view.outputView.surface;
   assert.equal(m.imageId,expectedImage);assert.equal(m.unitId,expectedUnit);assert.ok(m.artifacts[0].dataURL);
   assert.equal(u.image.hidden,false);await u.image.decode();assert.equal(u.image.naturalWidth,64);
   await wait(()=>!u.section.querySelector('.node-input-card img').hidden);
   assert.equal(u.section.querySelector('.node-input-card img').getAttribute('src'),live.imageRecord(expectedImage).dataURL);
   await wait(()=>dialog.querySelector('.flow-source-original img').dataset.imageId===expectedImage&&dialog.querySelector('.source-decision img').dataset.runId===m.run.runId);
   const evidence=dialog.querySelector('.source-decision img');await evidence.decode();assert.equal(evidence.naturalWidth,64);assert.equal(evidence.closest('figure').hidden,false);
   assert.equal(dialog.querySelector('.flow-source-auto').getAttribute('aria-checked'),'true');
  };
  const initialUnit=live.data.datasetExecutions.at(-1).units[0].unitId;await inspect(first,initialUnit);
  let previous={image:first,unit:initialUnit},checks=0;
  beforeExecute=async()=>{await inspect(previous.image,previous.unit);assert.ok(view.outputView.currentModel.pendingUnitId);checks++;};
  const units=[{id:'continuous-first',imageIds:[first]},{id:'continuous-next',imageIds:[next]},{id:'continuous-wrap',imageIds:[first]}];
  async function* dispatch(){for(const unit of units){yield unit;previous={image:unit.imageIds[0],unit:unit.id};await inspect(previous.image,previous.unit);}}
  const outcome=await run({units:dispatch(),total:3,onNodeProgress:()=>{const m=view.outputView.currentModel;if(m.unitId===previous.unit)assert.equal(view.outputView.surface.image.hidden,false);},executeSession:undefined});
  // The generator resumes only after each unit has been published, including
  // metadata-only durable save and eviction of the preceding unit's run rows.
  assert.equal(outcome.execution.processed,3);
  assert.equal(checks,3,'each in-flight unit must retain its preceding completed pair');
  await inspect(first,'continuous-wrap');
  assert.equal(dialog.open,true);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('slow original reads and image decoding never publish a partial pair; failed and superseded loads keep the displayed pixels',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-atomic-pair-')),p=await project();
 for(const [name,color]of [['slow.png','#ff3355'],['failed.png','#1245ff']]){const canvas=createCanvas(64,48),ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,64,48);await p.addImages([{name,dataUrl:canvas.toDataURL('image/png')}],decode);}
 const ids=p.data.images.map(i=>i.id),board=p.ensureProjectCanvas(),sourceId=board.projectSpaces.sources[0].id;
 p.bindCanvasImages(board.id,sourceId,ids);p.setSourceAutoAdvance(sourceId,true);
 const pixels=new Map();
 for(const [index,imageId]of ids.entries()){
  await p.selectSourceImage(sourceId,imageId);
  await runDatasetScheme(p,r=>execute(r,directory),{sourceId,units:[{id:'atomic-'+index,imageIds:[imageId]}],artifactMode:'inline'});
  const m=resolveNodeOutput(p,{schemeNodeId:'preview'});pixels.set(imageId,m.run.artifacts.filter(a=>a.type==='image').map(a=>({runId:m.run.runId,id:a.id,url:a.dataURL})));
 }
 await p.selectSourceImage(sourceId,ids[0]);
 const {createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{
  await h.api.loadProject(h.w.JSON.parse(p.serialize()));const live=h.api.project,view=h.api.inquiryView;
  for(const pack of pixels.values())for(const a of pack)live.setInspectionArtifactPreview(a.runId,a.id,a.url);
  const until=async fn=>{for(let i=0;i<200;i++){if(fn())return;await h.tick();}assert.ok(fn(),'decoded pair did not settle');};
  view.outputView.focus('preview');view.render();await until(()=>view.outputView.currentModel?.unitId==='atomic-0'&&view.outputView.surface.image.naturalWidth===64);
  view.programFlow.refreshFlow();view.programFlow.openBoundary(view.programFlow.flow.nodes.find(n=>n.kind==='source'));
  const d=()=>h.w.document.querySelector('.flow-source-panel[open]');
  await until(()=>d()?.querySelector('.source-decision img')?.naturalWidth===64);
  const snapshot=()=>{const u=view.outputView.surface;return {main:u.image,input:u.section.querySelector('.node-input-card img'),original:d().querySelector('.flow-source-original img'),evidence:d().querySelector('.source-decision img'),model:view.outputView.currentModel};};
  const old=snapshot(),surface=view.outputView.surface;surface.renderer.zoomBy(2);const camera={...surface.renderer.view};
  // The native service publishes VALID node states before handing its run and
  // pixels to the frontend. Exercise that actual publication gap, plus a
  // terminal record with no pixels, without changing the displayed identity.
  const originalExecution=live.data.datasetExecutions.find(e=>e.units.some(u=>u.unitId==='atomic-0')),execution={...originalExecution,units:[...originalExecution.units]},recordIndex=execution.units.findIndex(u=>u.unitId==='atomic-0'),record=execution.units[recordIndex];
  live.data.datasetExecutions=live.data.datasetExecutions.map(e=>e===originalExecution?execution:e);
  execution.units[recordIndex]={...record,runIds:[],nodeStates:[{nodeId:'preview',status:'VALID'}]};view.render();await h.tick();
  for(const key of ['main','input','original','evidence']){assert.equal(snapshot()[key],old[key]);assert.equal(snapshot()[key].naturalWidth,64);assert.equal(snapshot()[key].hidden,false);}
  assert.equal(view.outputView.currentModel.unitId,'atomic-0');assert.deepEqual({...surface.renderer.view},camera);
  execution.units[recordIndex]={...record,runIds:[],nodeStates:[{nodeId:'preview',status:'FAULT',reason:'native fault before pixels'}]};view.render();await h.tick();
  assert.equal(surface.image,old.main);assert.equal(surface.image.naturalWidth,64);assert.equal(surface.image.hidden,false);assert.ok(surface.status.textContent.includes('native fault before pixels'));
  execution.units[recordIndex]=record;view.render();await h.tick();
  const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
  const readGate=deferred(),decodeGate=deferred(),read=live.readImageAsset.bind(live),decodeImage=h.w.HTMLImageElement.prototype.decode;
  let reads=0,decodes=0;
  live.readImageAsset=async id=>{if(id===ids[1]){reads++;await readGate.promise;}if(id===ids[2])throw Error('delayed original failed');return read(id);};
  const readDisplay=live.readImageDisplay.bind(live);
  live.readImageDisplay=async id=>{if(id===ids[2])throw Error('delayed original failed');return readDisplay(id);};
  const slowURL=pixels.get(ids[1])[0].url;
  h.w.HTMLImageElement.prototype.decode=async function(){await decodeImage.call(this);if(this.src===slowURL){decodes++;await decodeGate.promise;}};
  const unchanged=()=>{const now=snapshot();for(const key of ['main','input','original','evidence']){assert.equal(now[key],old[key],key+' was replaced before the whole pair was ready');assert.equal(now[key].isConnected,true);assert.equal(now[key].naturalWidth,64);assert.equal(now[key].hidden,false);}assert.equal(now.model.unitId,'atomic-0');assert.equal(old.evidence.closest('figure').hidden,false);assert.deepEqual({...surface.renderer.view},camera);};
  await live.selectSourceImage(sourceId,ids[1]);await until(()=>reads>0&&decodes>0);for(let i=0;i<12;i++){unchanged();await h.tick();}
  readGate.resolve();for(let i=0;i<12;i++){unchanged();await h.tick();}
  decodeGate.resolve();await until(()=>view.outputView.currentModel?.unitId==='atomic-1'&&d().querySelector('.flow-source-original img').dataset.imageId===ids[1]);
  const ready=snapshot();assert.notEqual(ready.main,old.main);assert.notEqual(ready.input,old.input);assert.equal(ready.main.naturalWidth,64);assert.equal(ready.evidence.naturalWidth,64);assert.equal(ready.evidence.dataset.runId,pixels.get(ids[1])[0].runId);
  await live.selectSourceImage(sourceId,ids[2]);await until(()=>surface.status.textContent.includes('failed'));
  const failed=snapshot();for(const key of ['main','input','original','evidence'])assert.equal(failed[key],ready[key]);assert.equal(failed.model.unitId,'atomic-1');
  await live.selectSourceImage(sourceId,ids[0]);await until(()=>view.outputView.currentModel?.unitId==='atomic-0'&&d().querySelector('.flow-source-original img').dataset.imageId===ids[0]);
  const staleGate=deferred();let started=0;
  h.w.HTMLImageElement.prototype.decode=async function(){await decodeImage.call(this);if(this.src===slowURL){started++;await staleGate.promise;}};
  await live.selectSourceImage(sourceId,ids[1]);await until(()=>started>0);
  await live.selectSourceImage(sourceId,ids[0]);staleGate.resolve();for(let i=0;i<30;i++)await h.tick();
  assert.equal(view.outputView.currentModel.unitId,'atomic-0');assert.equal(d().querySelector('.flow-source-original img').dataset.imageId,ids[0]);assert.equal(d().querySelector('.source-decision img').dataset.runId,pixels.get(ids[0])[0].runId);
  assert.equal(d().querySelector('.flow-source-auto').getAttribute('aria-checked'),'true');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('manual source selection wins over running, later units and batch completion in the real main view',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-manual-during-run-')),p=await project();
 for(const color of ['red','blue']){const canvas=createCanvas(64,48);canvas.getContext('2d').fillStyle=color;canvas.getContext('2d').fillRect(0,0,64,48);await p.addImages([{name:color+'.png',dataUrl:canvas.toDataURL('image/png')}],decode);}
 const ids=p.data.images.map(i=>i.id),board=p.ensureProjectCanvas(),sourceId=board.projectSpaces.sources[0].id;p.bindCanvasImages(board.id,sourceId,ids);
 const {createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
 try{
  await h.api.loadProject(h.w.JSON.parse(p.serialize()));const live=h.api.project,view=h.api.inquiryView;
  const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await h.tick();}assert.ok(predicate(),'main view failed to follow manual selection');};
  const run=(units,dispatch)=>h.w.__QAWorkpiece.runDatasetScheme(live,dispatch,{sourceId,units,artifactMode:'inline'});
  view.outputView.focus('preview');view.render();
  await run([{id:'initial',imageIds:[ids[0]]}],r=>execute(r,directory));
  await wait(()=>view.outputView.currentModel?.unitId==='initial'&&!view.outputView.surface.image.hidden);
  const gates=[deferred(),deferred()],started=[deferred(),deferred()];let index=0;
  const running=run([{id:'running-a',imageIds:[ids[0]]},{id:'running-b',imageIds:[ids[1]]}],async r=>{const n=index++;started[n].resolve();await gates[n].promise;return execute(r,directory);});
  await started[0].promise;
  view.programFlow.refreshFlow();view.programFlow.openBoundary(view.programFlow.flow.nodes.find(n=>n.kind==='source'));
  await wait(()=>h.w.document.querySelector(`.flow-source-panel button[data-image-id="${ids[2]}"]`));
  const browse=h.w.document.querySelector(`.flow-source-panel button[data-image-id="${ids[2]}"]`);
  assert.equal(browse.disabled,false);await browse.onclick();view.render();
  assert.equal(index,1,'browsing must not start a competing execution');
  const check=async()=>{
   await wait(()=>view.outputView.currentModel?.imageId===ids[2]).catch(error=>{throw Error(JSON.stringify({message:error.message,active:live.image.id,revision:live.imageSelection,model:view.outputView.currentModel?.imageId,resolved:view.outputView.resolveModel().imageId,status:view.outputView.resolveModel().status,surfaceRevision:view.outputView.surface.selectionRevision,surfaceImage:view.outputView.surface.displayImageId}));});
   const surface=view.outputView.surface;
   await wait(()=>surface.section.querySelector('.node-input-card img')?.getAttribute('src')===live.imageRecord(ids[2]).dataURL);
   assert.equal(live.image.id,ids[2]);assert.equal(view.outputView.currentModel.status,'WAITING');assert.equal(surface.image.hidden,true,'never show another workpiece output for a manual selection');
  };
  await check();gates[0].resolve();await started[1].promise;await check();gates[1].resolve();await running;await check();
  // Re-select an image with a completed result after the run, then return to
  // an unexecuted image: the retained-pair shortcut must not trap either move.
  await live.selectSourceImage(sourceId,ids[1]);view.render();await wait(()=>view.outputView.currentModel?.unitId==='running-b'&&!view.outputView.surface.image.hidden);
  await live.selectSourceImage(sourceId,ids[2]);view.render();await check();
  // Also cover the dialog's own busy flag, not only a toolbar-owned batch.
  const ownStarted=deferred(),ownGate=deferred();let ownRuns=0;
  view.onRunInspection=async options=>{ownRuns++;return run(options.units,async r=>{ownStarted.resolve();await ownGate.promise;return execute(r,directory);});};
  h.w.document.querySelector('.flow-source-panel[open]').close();
  view.programFlow.refreshFlow();view.programFlow.openBoundary(view.programFlow.flow.nodes.find(n=>n.kind==='source'));
  const dialog=h.w.document.querySelector('.flow-source-panel[open]');
  await wait(()=>dialog.querySelector(`button[data-image-id="${ids[0]}"]`));
  const clickRun=dialog.querySelector(`button[data-image-id="${ids[0]}"]`).onclick();await ownStarted.promise;
  const whileBusy=dialog.querySelector(`button[data-image-id="${ids[2]}"]`);assert.equal(whileBusy.disabled,false);
  await whileBusy.onclick();await check();assert.equal(ownRuns,1);ownGate.resolve();await clickRun;await check();
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
