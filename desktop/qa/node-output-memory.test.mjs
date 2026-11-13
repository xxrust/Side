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
  const current=resolveNodeOutput(p,{schemeNodeId:'preview'});assert.equal(current.imageId,next);assert.equal(current.unitId,'next');started=true;
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
  assert.equal(view.outputView.currentArtifact.id,expected.artifacts[1].id);
  assert.equal(output.getAttribute('src'),expected.artifacts[1].dataURL);
  // A full view remount must resolve the retained identity too, not rely on a
  // last-frame DOM fallback which loses paging and inquiry bindings.
  view.outputView.dispose();view.render();await h.tick();
  assert.equal(view.outputView.surface.section.dataset.status,'READY');assert.equal(view.outputView.currentModel.unitId,'ui-completed');
  await live.selectImage(next);view.render();await h.tick();
  assert.equal(view.outputView.surface.section.dataset.status,'WAITING');assert.equal(view.outputView.surface.image.hidden,true);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
