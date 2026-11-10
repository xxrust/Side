import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {Workspace} from '../src/workspace.js';
import {decodeBenchmarkImage} from '../scripts/agentcv-benchmark-batch.mjs';
import {runDatasetScheme} from '../src/algorithm-workspace.js';
import {resolveNodeOutput,outputImageReference} from '../src/node-output-model.js';
import {loadCurrentOutputImage} from '../src/inspection-records.js';
import {deriveArtifactGroup} from '../src/canvas-artifact-groups.js';
const root=path.resolve(new URL('..',import.meta.url).pathname),audit=path.resolve(root,'../codex-audit-logs/20261030-live-output-modes'),require=createRequire(import.meta.url);
const spec={schema:'agentcv-classification-spec-1',id:'nonempty-image',provenance:[{type:'human',ref:'qa/node-output-view.test.mjs authored UI verification rule: input image has pixels, not inspection accuracy',status:'confirmed'}],categories:[{id:'pixels',label:'有像素',quality:'good'},{id:'missing',label:'無像素',quality:'bad'}],metrics:[{id:'present',type:'boolean'}],rules:[{id:'yes',categoryId:'pixels',when:{metric:'present',equals:true}},{id:'no',categoryId:'missing',when:{metric:'present',equals:false}}],coverage:{policy:'exhaustive'},missing:{NOT_FOUND:'missing',MISSING:'missing',SKIPPED:'missing'},conflicts:{mode:'priority',priority:['yes','no']},aggregation:{mode:'priority',priority:['pixels','missing']},fault:{exit:'FAULT'}};
const code=`with procedure("views", "影像處理對照", outputs={"gray":"灰階", "binary":"Otsu二值", "edges":"Canny邊緣"}) as p:
    with step("gray", "灰階"):
        save_image("gray", gray)
    with step("binary", "Otsu分割", depends_on=["gray"]):
        threshold, binary = cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
        save_image("binary",binary)
    with step("edges", "Canny邊緣", depends_on=["gray"]):
        edges = cv2.Canny(gray,40,100)
        save_image("edges",edges)
save_json("measurement",{"present":bool(image.size>0),"otsu_threshold":float(threshold)})
result={"valid":True,"present":bool(image.size>0)}
`;
async function actualProject(){await fs.mkdir(audit,{recursive:true});const directory=await fs.mkdtemp(path.join(audit,'pager-real-')),p=new Workspace();for(const name of ['box.png','box_in_scene.png'])await p.addImages([{name,dataUrl:'data:image/png;base64,'+(await fs.readFile(path.resolve(root,'../research/opencv-traditional-10-2026-10-25/assets',name))).toString('base64')}],decodeBenchmarkImage);
 const evidence={kind:'artifact',type:'evidence',id:'measurement'};p.setPurposeScheme({id:'actual-output-pager',execution:{unit:'workpiece',inputSlots:[{id:'image',required:true}]},classificationSpec:spec,operatorGraph:{nodes:[{id:'views',title:'影像處理對照',code,parameters:{},expected_outputs:[{id:'measurement',type:'evidence'},...['gray','binary','edges'].map(id=>({id,type:'image',role:'result'}))],justification:{tool:{reason:'直接以OpenCV實算三種影像，驗證多張輸出切換是否保持真實產物引用，不作現場分類驗收。',expectedEvidence:[evidence]},parameters:[],boundaries:[{condition:'這是UI輸出身份驗證，不代表Canny門檻或Otsu適合任意工件。',check:evidence,onFailure:'UNKNOWN'}]}}],edges:[]},metricBindings:[{metric:'present',nodeId:'views',path:'present'}]});
 await p.selectImage(p.data.images[0].id);await runDatasetScheme(p,async request=>{const dir=await fs.mkdtemp(path.join(directory,'run-')),file=path.join(dir,'request.json');await fs.writeFile(file,JSON.stringify({...request,runId:randomUUID()}));await new Promise((resolve,reject)=>{const child=spawn(path.join(root,'runtime/python/bin/python3'),[path.join(root,'scripts/cv-runtime.py'),'--run',file,dir],{env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});let errors='';child.stderr.on('data',d=>errors+=d);child.on('error',reject);child.on('close',code=>code?reject(Error(errors)):resolve());});return JSON.parse(await fs.readFile(path.join(dir,'result.json'),'utf8'));},{units:[{id:'actual-ui-workpiece',imageIds:[p.image.id]}]});
 const model=resolveNodeOutput(p,{schemeNodeId:'views'});assert.equal(model.status,'READY');assert.equal(model.artifacts.length,3);for(const artifact of model.artifacts){const bytes=await fs.readFile(artifact.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);p.setInspectionArtifactPreview(model.run.runId,artifact.id,'data:image/png;base64,'+bytes.toString('base64'));}await fs.writeFile(path.join(directory,'project.agentcv.json'),p.serialize());return {p,directory};}

test('real OpenCV multi-image output pages keep exact artifacts and clear when current workpiece has never run',async()=>{const {p,directory}=await actualProject(),model=resolveNodeOutput(p,{schemeNodeId:'views'}),sources=model.artifacts.map(a=>outputImageReference(model,a));assert.deepEqual(model.artifacts.map(a=>a.id),['gray','binary','edges']);for(const source of sources){assert.equal(source.source.unitId,'actual-ui-workpiece');assert.equal(source.source.runId,model.run.runId);assert.equal(source.source.executionId,model.executionId);}
 const {createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();try{await h.api.loadProject(h.w.JSON.parse(p.serialize()));const v=h.api.inquiryView;v.outputView.focus('views');v.render();const images=()=>[...h.w.document.querySelectorAll('.node-output-gallery .node-output-card:not(.node-input-card) img[src]')].map(i=>i.getAttribute('src'));
 const shell=h.w.document.querySelector('.inquiry-workspace'),inputTitle=h.w.document.querySelector('.node-input-card strong'),viewport=h.w.document.querySelector('.node-input-card .node-output-viewport');for(let i=0;i<20;i++)v.render();assert.equal(h.w.document.querySelector('.inquiry-workspace'),shell);assert.equal(h.w.document.querySelector('.node-input-card strong'),inputTitle);assert.equal(h.w.document.querySelector('.node-input-card .node-output-viewport'),viewport);assert.equal(h.w.document.querySelectorAll('.node-input-card select').length,0);assert.deepEqual(images(),[sources[0].dataURL]);assert.equal(h.w.document.querySelector('[aria-label="上一組輸出圖"]').disabled,true);h.w.document.querySelector('[aria-label="下一組輸出圖"]').click();assert.deepEqual(images(),[sources[1].dataURL]);assert.equal(h.w.document.querySelector('[aria-label="下一組輸出圖"]').disabled,false);
 h.w.document.querySelector('[aria-label="查看輸出 1"]').click();assert.deepEqual(images(),[sources[0].dataURL]);h.w.document.querySelector('[aria-label="查看輸出 3"]').click();assert.deepEqual(images(),[sources[2].dataURL]);h.w.document.querySelector('[aria-label="上一組輸出圖"]').click();assert.deepEqual(images(),[sources[1].dataURL]);
 await h.api.project.selectImage(h.api.project.data.images[1].id);v.render();assert.equal(h.w.document.querySelector('.node-output-view').dataset.status,'WAITING');assert.equal(images().length,0);assert.equal(h.w.document.querySelector('.node-input-card strong'),inputTitle);assert.equal(h.w.document.querySelector('.inquiry-workspace'),shell);assert.match(h.w.document.querySelector('.node-output-empty').textContent,/尚無/);assert.equal(h.errors.length,0);await fs.writeFile(path.join(directory,'ui-verification.json'),JSON.stringify({actualRunId:model.run.runId,artifacts:model.artifacts.map(a=>({id:a.id,sha256:a.sha256})),twoSideBySide:true,previousNext:true,directSelection:true,noStaleFallback:true},null,2));}finally{h.close();}});

test('live output card stays outside fixed execution groups and cannot change their trace membership',async()=>{const {p}=await actualProject(),model=resolveNodeOutput(p,{schemeNodeId:'views'}),b=p.createInquiryBoard({title:'固定與實時對照'});for(const a of model.artifacts)p.addInquiryImage(outputImageReference(model,a),{boardId:b.id,actor:'agent'});const live=p.addInquiryImage(outputImageReference(model,model.artifacts[0]),{boardId:b.id});p.bindInquiryLiveOutput(b.id,live.item.id,{schemeNodeId:'views',artifactId:'gray'});const group=deriveArtifactGroup(p.data,b.id,model.run.runId);assert.equal(group.itemIds.length,3);assert.ok(!group.itemIds.includes(live.item.id));assert.ok(group.inputBindings.every(i=>i.fromItemId!==live.item.id));p.groupRunArtifacts(b.id,model.run.runId);assert.doesNotThrow(()=>p.canvasArtifactGroups(b.id));});

test('node and whole-flow questions open above live outputs without replacing images or losing drafts',async()=>{
 const {p}=await actualProject(),{createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{
  // Decode the production SVG's real Blob bytes using the harness native image decoder.
  const blobs=new Map(),NativeImage=h.w.Image;let blobIndex=0;
  h.w.URL.createObjectURL=blob=>{const url='blob:flow-question-'+(++blobIndex);blobs.set(url,blob);return url;};h.w.URL.revokeObjectURL=url=>blobs.delete(url);
  h.w.Image=class extends NativeImage{set src(value){const blob=blobs.get(value);if(blob)this.pending=blob.arrayBuffer().then(bytes=>{super.src=Buffer.from(bytes);});else super.src=value;}get src(){return super.src;}async decode(){await this.pending;return super.decode();}};
  // Load the production hiding rule too: a connected DOM element can still be invisible.
  const style=h.w.document.createElement('style');style.textContent=await fs.readFile(path.join(root,'src/node-output-view.css'),'utf8');h.w.document.head.append(style);
  await h.api.loadProject(h.w.JSON.parse(p.serialize()));
  // Reopening a document closes the old flow rail while reusing the output surface.
  await h.api.loadProject(h.w.JSON.parse(p.serialize()));const v=h.api.inquiryView,f=v.programFlow;
  assert.ok(f.host?.isConnected,'reopening a project must restore its flow rail without an explicit sync');
  v.outputView.focus('views');v.render();await f.map.ready;
  const section=v.outputView.surface.section,image=v.outputView.surface.image,inputTitle=section.querySelector('.node-input-card strong');
  const node=f.flow.nodes.find(n=>n.schemeNodeId==='views'&&!n.boundary);assert.ok(node);
  const ask=async id=>{f.contextMenu(id,new h.w.MouseEvent('contextmenu',{cancelable:true,clientX:80,clientY:80}));const button=[...v.menu.querySelectorAll('button')].find(b=>b.textContent===(id?'詢問此節點':'詢問整個流程'));button.click();await h.tick();};
  await ask(node.id);
  let input=h.w.document.querySelector('[data-canvas-question-input]');assert.ok(input,'the right-click action must actually mount the composer in output mode');
  assert.notEqual(h.w.getComputedStyle(input.closest('.intent-question-bubble')).visibility,'hidden');
  assert.equal(h.w.document.activeElement,input);assert.equal(v.outputView.mode,'output');assert.equal(v.outputView.surface.section,section);
  const thread=v.currentLocalThread();assert.equal(thread.reference.graph.selectedNodeId,node.id);
  input.value='這個節點為何先轉灰階？';input.dispatchEvent(new h.w.Event('input',{bubbles:true}));input.setSelectionRange(2,4);
  for(let i=0;i<8;i++)v.render();assert.equal(h.w.document.activeElement,input);assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,4);assert.equal(v.outputView.surface.image,image);assert.equal(section.querySelector('.node-input-card strong'),inputTitle);
  // Retain an unsent draft while changing question scope, without dropdown controls.
  await ask(null);assert.notEqual(v.currentLocalThread().id,thread.id);assert.equal(v.currentLocalThread().reference.scope,'whole-flow');
  assert.equal(h.w.document.querySelectorAll('.intent-question-bubble select').length,0);
  await ask(node.id);assert.equal(v.currentLocalThread().id,thread.id);input=h.w.document.querySelector('[data-canvas-question-input]');assert.equal(input.value,'這個節點為何先轉灰階？');
  // Expanded flow modal must own its question; collapsing it must restore the same question over output.
  f.map.expand();await f.map.expanded.layoutReady;await h.tick();await ask(node.id);
  assert.ok(f.map.dialog.contains(h.w.document.activeElement));assert.equal(h.w.document.querySelectorAll('.intent-question-bubble').length,1);
  f.map.collapse();await h.tick();assert.ok(v.area.contains(h.w.document.querySelector('[data-canvas-question-input]')));
  assert.notEqual(h.w.getComputedStyle(h.w.document.querySelector('.intent-question-bubble')).visibility,'hidden');
  // Preparation can fail before a turn exists. It still needs a visible local error and intact draft.
  const geometry=f.map.geometry;f.map.geometry=null;
  await assert.rejects(v.sendLocalQuestion(),/流程圖尚未完成排列/);
  assert.equal(v.localQuestionError.hidden,false);assert.match(v.localQuestionError.textContent,/流程圖尚未完成排列/);
  assert.equal(v.currentLocalThread().turns.length,0);assert.equal(v.localQuestionInput.value,'這個節點為何先轉灰階？');f.map.geometry=geometry;
  // Disconnected transport must be a visible failed turn with a retryable draft, never a fake reply.
  await assert.rejects(v.sendLocalQuestion(),/連接 (?:Pi|Agent)/);await h.tick();
  assert.equal(v.currentLocalThread().id,thread.id);assert.equal(v.currentLocalThread().status,'DRAFT');
  input=h.w.document.querySelector('[data-canvas-question-input]');assert.equal(input.value,'這個節點為何先轉灰階？');assert.equal(input.disabled,false);
  assert.match(v.localReply.textContent,/連接 (?:Pi|Agent)/);assert.equal(v.localQuestionSend.disabled,false);assert.equal(h.api.project.data.chat.filter(m=>m.role==='assistant').length,0);
  v.questionBubble.querySelector('[aria-label="關閉問答"]').click();await h.tick();assert.equal(h.w.document.querySelector('[data-canvas-question-input]'),null);
  await ask(node.id);assert.equal(v.currentLocalThread().id,thread.id);assert.equal(v.currentLocalThread().turns.length,1);assert.equal(v.localQuestionInput.value,'這個節點為何先轉灰階？');
  assert.equal(v.outputView.surface.section,section);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

 test('late real output pixels cannot alter the next selected workpiece or its status',async()=>{
 const {p}=await actualProject(),model=resolveNodeOutput(p,{schemeNodeId:'views'}),artifact=model.artifacts[0],dataURL=artifact.dataURL;
 const {createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{
  await h.api.loadProject(h.w.JSON.parse(p.serialize()));const v=h.api.inquiryView,live=h.api.project;
  v.outputView.focus('views');v.render();
  const m=resolveNodeOutput(live,{schemeNodeId:'views'}),a=m.artifacts[0];delete a.dataURL;delete a.dataUrl;
  let release,started;const begun=new Promise(resolve=>started=resolve);
  const records={artifact:()=>{started();return new Promise(resolve=>release=()=>resolve({dataURL}));}};
  v.onLoadOutputImage=(m,a,guard)=>loadCurrentOutputImage(live,{...m,recordRef:{executionId:m.executionId,unitId:m.unitId}},a,records,guard);
  const section=h.w.document.querySelector('.node-output-view'),load=v.outputView.ensureImage(m,a,section);await begun;
  await live.selectImage(live.data.images[1].id);v.render();const status=section.querySelector('.node-output-empty').textContent;
  release();await load;
  assert.equal(a.dataURL,undefined,'old pixels must not be installed after selection changed');
  assert.equal(section.querySelector('.node-output-empty').textContent,status);assert.ok(!status.includes('讀取失敗'));
  assert.equal(h.errors.length,0);
 }finally{h.close();}
 });
