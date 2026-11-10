import {bindCurrentAlgorithmRequest} from './current-algorithm-request.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {algorithmContext,runAlgorithm as actualRunAlgorithm} from '../src/algorithm-workspace.js';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const root=path.resolve(import.meta.dirname,'..');
async function execute(request){
 const dir=await fs.mkdtemp(root+'/runtime/program-panel-qa-'),file=dir+'/request.json';await fs.writeFile(file,JSON.stringify({...request,runId:randomUUID()}));
 const child=spawn(root+'/runtime/python/bin/python3',[root+'/scripts/cv-runtime.py','--run',file,dir],{env:{PATH:'/usr/bin:/bin',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',PYTHONDONTWRITEBYTECODE:'1'}});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);assert.equal(await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)}),0,error);return JSON.parse(await fs.readFile(JSON.parse(output.trim()).resultFile,'utf8'));
}
const code=`
with procedure('inspect','原圖分析',inputs={'image':image_records[0]['id']}) as p:
    with step('segment','Otsu 分割') as s:
        threshold, mask = cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
        s.set_output('threshold',float(threshold))
        save_image('mask',mask)
    with step('components','連通區',depends_on=['segment']) as s:
        count, labels = cv2.connectedComponents(mask)
        s.set_output('count',int(count))
        save_image('components',np.uint8(labels % 255))
    with step('edges','邊緣分支',depends_on=['segment']) as s:
        save_image('edges',cv2.Canny(mask,40,100))
    run_step('unused',''.join if False else lambda s: save_image('must-not-exist',image),when=False,depends_on=['segment'])
result={'boundaryChecks':[{'id':'pixels','status':'PASS','actual':int(image.size),'threshold':1}]}
`;
async function setup(){
 const h=await createHarness();await h.api.addImages([{name:'stuff.jpg',dataUrl:'data:image/jpeg;base64,'+(await fs.readFile(root+'/../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg')).toString('base64')}]);await h.api.go(6);await h.tick();const p=h.api.project;
 const run=await runAlgorithm(p,{title:'真實原圖分支程序',code,parameters_json:'{}',source:algorithmContext(p).source,expected_outputs:[{id:'mask',type:'image'},{id:'components',type:'image'},{id:'edges',type:'image'}],justification:{tool:{reason:'保留原圖分割及兩個真正執行的分析分支，核對程序和圖像的來源。',expectedEvidence:[{kind:'artifact',type:'image',id:'mask'}]},parameters:[],boundaries:[{condition:'輸入具有效像素；未宣稱物件語意與工業精度。',check:{kind:'gate',id:'pixels'},onFailure:'UNKNOWN'}]}},execute);assert.equal(run.status,'SUCCEEDED',run.traceback);return {...h,p,run,v:h.api.inquiryView};
}

test('real program steps open separate editable boards, preserve camera, expose exact producer and never navigate to the old step pages',async()=>{
 const h=await setup();try{
  const {v,p,run}=h,flow=v.programFlow;v.render();assert.equal(h.$('steps').hidden,true);assert.ok(h.w.document.querySelector('[aria-label="實際程式流程"]'));
  const segment=run.runId+'::segment#1',edges=run.runId+'::edges#1',page=h.api.page;
  await flow.openNode(segment);const segmentBoard=v.boardId;assert.equal(v.board().programBinding.nodeId,segment);assert.ok(v.board().items.some(i=>v.asset(i).source.artifactId==='mask'));assert.ok(!v.board().items.some(i=>v.asset(i).source.artifactId==='edges'),'other branch image is not this step output');
  v.zoom=.77;v.pan={x:61,y:85};v.paint();const first=v.board().items[0];p.addInquiryAnnotation(v.boardId,first.id,h.w.JSON.parse(JSON.stringify({type:'line',points:[{x:10,y:10},{x:80,y:80}],text:'保留的人類意圖'})),{actor:'human'});
  await flow.openNode(edges);assert.notEqual(v.boardId,segmentBoard);assert.ok(v.board().items.some(i=>v.asset(i).source.artifactId==='edges'));assert.equal(h.api.page,page);const edgeAsset=v.asset(v.board().items.find(i=>v.asset(i).source.artifactId==='edges'));
  await flow.openNode(segment);assert.equal(v.boardId,segmentBoard);assert.equal(v.zoom,.77);assert.deepEqual({...v.pan},{x:61,y:85});assert.equal(v.board().items[0].annotations[0].text,'保留的人類意圖');
  await flow.focusAsset(edgeAsset);assert.equal(v.board().programBinding.nodeId,edges);assert.equal(h.api.page,page);
  await flow.openNode(run.runId+'::unused#1');await flow.map.ready;assert.equal(flow.flow.nodes.find(node=>node.id===run.runId+'::unused#1').status,'SKIPPED');assert.ok(!v.board().items.some(i=>v.asset(i).source.artifactId==='must-not-exist'));assert.equal(run.evidenceAudit.status,'READY_FOR_REVIEW','missing prose is not an execution error');assert.equal(run.evidenceAudit.delivered,false);
  const serialized=p.serialize(),saved=JSON.parse(serialized);assert.ok(saved.visualInquiry.boards.some(b=>b.programBinding?.nodeId===segment));await p.load(h.w.JSON.parse(serialized),h.api.decode);assert.ok(p.ensureInquiry().boards.some(b=>b.programBinding?.nodeId===segment));
  if(process.env.AGENTCV_FLOW_REVIEW_DIR)await fs.writeFile(process.env.AGENTCV_FLOW_REVIEW_DIR+'/actual-python-workspace.agentcv.json',p.serialize());
 }finally{h.close();}
});

test('selecting a second actual execution version replaces the bound panel and cannot be overridden by the previous board',async()=>{
 const h=await setup();try{
  const {p,v,run}=h,flow=v.programFlow;
  const second=await runAlgorithm(p,{title:'同程式第二次真實運算',code,parameters_json:'{}',source:algorithmContext(p).source,expected_outputs:run.expectedOutputs,justification:run.justification},execute);
  assert.equal(second.status,'SUCCEEDED',second.traceback);assert.notEqual(second.runId,run.runId);assert.equal(second.codeSha256,run.codeSha256,'both executions use the exact same real algorithm');
  assert.equal(v.board()?.programBinding,undefined,'the engineer still occupies the original free intent board');assert.equal(flow.runId,second.runId,'an unbound intent board follows the latest actual execution');
  await flow.openNode(run.runId+'::segment#1');const previousBoard=v.boardId;
  assert.equal(h.w.document.querySelector('select[aria-label="選擇執行紀錄"]'),null);const history=h.api.solutionVersionsView;await history.open();history.filter='all';history.render();const row=[...history.list.children].find(row=>row.textContent.includes(second.title));assert.ok(row);row.querySelector('button').click();
  for(let attempt=0;attempt<100&&v.board()?.programBinding?.runId!==second.runId;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(v.board().programBinding.runId,second.runId);assert.equal(v.board().programBinding.nodeId,second.runId+'::run');assert.notEqual(v.boardId,previousBoard);
  assert.equal(flow.runId,second.runId);assert.equal(flow.selectedId,second.runId+'::run');
  assert.equal(h.w.document.querySelector('select[aria-label="選擇執行紀錄"]'),null);
  const outputs=v.board().items.map(item=>v.asset(item)).filter(asset=>asset.source.artifactId);assert.ok(outputs.length>=3);assert.ok(outputs.every(asset=>asset.source.runId===second.runId),'all displayed output provenance belongs to the selected execution');
 }finally{h.close()}
});

test('an already open explanation immediately follows the new node and its actual numeric outputs',async()=>{
 const h=await setup();try{
  const {v,run}=h,flow=v.programFlow;flow.detailsOpen=true;
  await flow.openNode(run.runId+'::segment#1');assert.equal(h.w.document.querySelector('.program-evidence-panel header strong').textContent,'Otsu 分割 · 節點文檔');
  let selected=flow.flow.nodes.find(node=>node.id===flow.selectedId);assert.equal(typeof selected.outputs.threshold,'number');assert.ok(selected.outputs.threshold>0);assert.equal(selected.outputs.count,undefined);
  await flow.openNode(run.runId+'::components#1');assert.equal(h.w.document.querySelector('.program-evidence-panel header strong').textContent,'連通區 · 節點文檔');
  selected=flow.flow.nodes.find(node=>node.id===flow.selectedId);assert.equal(typeof selected.outputs.count,'number');assert.ok(selected.outputs.count>0);assert.equal(selected.outputs.threshold,undefined,'previous node values cannot leak into the new step');
  assert.equal(h.w.document.querySelector('.program-node-context strong').textContent,'連通區');
  assert.match(h.w.document.querySelector('.program-node-context').textContent,/依據待審查/,'executed does not mean evidence delivered');
  await flow.openNode(run.runId+'::unused#1');assert.equal(h.w.document.querySelector('.program-evidence-panel header strong').textContent,'unused · 節點文檔');assert.match(h.w.document.querySelector('.program-node-context').textContent,/未執行/);
 }finally{h.close()}
});

test('rapid node switches retain the last human choice while actual image loading finishes in reverse order',async()=>{
 const h=await setup();try{
  const {v,run}=h,flow=v.programFlow,actualLoad=v.loadImage.bind(v);let release,arrived,held=false;
  const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>arrived=resolve);
  // Only delay presentation of a genuinely decoded image; pixel loading and
  // all Python artifacts remain real. This deterministically exercises the race.
  v.loadImage=async asset=>{const image=await actualLoad(asset);if(!held){held=true;arrived();await gate;}return image;};
  const first=flow.openNode(run.runId+'::segment#1');await entered;
  const secondNode=run.runId+'::edges#1';await flow.openNode(secondNode);const secondBoard=v.boardId;
  assert.equal(v.board().programBinding.nodeId,secondNode);release();await first;
  assert.equal(v.boardId,secondBoard);assert.equal(v.board().programBinding.nodeId,secondNode);assert.equal(flow.selectedId,secondNode);
  assert.ok(v.board().items.some(item=>v.asset(item).source.artifactId==='edges'));
  v.loadImage=actualLoad;await flow.openNode(run.runId+'::segment#1');
  assert.ok(v.board().items.some(item=>v.asset(item).source.artifactId==='mask'),'the superseded load cannot leave a permanently partial node panel');
 }finally{h.close()}
});

test('historical source mismatch or removal is explicit and never substitutes a different current original',async()=>{
 const h=await setup();try{
  const {v,p,run}=h,flow=v.programFlow,original=p.data.images[0],hash=original.sha256;
  original.sha256='changed-original-identity';await flow.openNode(run.runId+'::segment#1');
  assert.match(h.w.document.querySelector('.program-source-warning').textContent,/原圖已移除或內容身份改變/);
  assert.ok(!v.board().items.some(item=>v.asset(item).kind==='original'),'mismatched original bytes are not represented as saved input');
  assert.ok(v.board().items.some(item=>v.asset(item).source.artifactId==='mask'),'the true historical artifact remains inspectable');
  original.sha256=hash;p.data.images=[];v.render();assert.match(h.w.document.querySelector('.program-source-warning').textContent,/歷史來源/);
 }finally{h.close()}
});

test('legacy evidence can still reference a user-marked canvas asset alongside an algorithm image',async()=>{
 const h=await setup();try{
  const {p,run}=h,asset=p.registerInquiryAsset(h.w.JSON.parse(JSON.stringify({label:'工程師標記參考',kind:'figure',dataURL:'data:image/png;base64,AA==',width:1,height:1,source:{kind:'user-marked-reference',imageId:'source-image'}})),{actor:'human'});
  const justification={tool:{reason:'用實算遮罩說明方法，同時引用工程師標記的參考圖解釋這個步驟的觀察範圍。',expectedEvidence:[{kind:'artifact',type:'image',id:'mask',visuals:[{kind:'canvas-asset',id:asset.id,caption:'工程師標記的參考範圍，用來說明本步觀察位置，不把它當成當次產物。'}]}]},parameters:[],boundaries:[{condition:'輸入具有效像素；參考圖只作說明。',check:{kind:'gate',id:'pixels'},onFailure:'UNKNOWN'}]};
  const external=await runAlgorithm(p,{title:'含人工標記依據的程序',code,parameters_json:'{}',source:algorithmContext(p).source,expected_outputs:run.expectedOutputs,justification},execute);
  assert.equal(external.status,'SUCCEEDED',external.traceback);assert.equal(external.evidenceVisuals[0].kind,'canvas-asset');assert.equal(external.evidenceVisuals[0].id,asset.id);assert.equal(external.evidenceAudit.errors.some(error=>error.code==='EVIDENCE_VISUAL_UNAVAILABLE'),false,JSON.stringify(external.evidenceAudit.errors));
  const flow=h.api.inquiryView.programFlow;flow.refreshFlow();const node=flow.flow.nodes.find(n=>n.id===external.runId+'::run');const resolved=(await import('../src/program-evidence.js')).resolveProgramEvidence(node,justification.tool.expectedEvidence[0]),visual=resolved.images.find(item=>item.artifact.id===asset.id);assert.equal(visual?.caption,'工程師標記的參考範圍，用來說明本步觀察位置，不把它當成當次產物。');
 }finally{h.close()}
});

test('legacy evidence can still reference an agent-authored canvas diagram alongside an algorithm image',async()=>{
 const h=await setup();try{
  const {p,run}=h,asset=p.registerInquiryAsset(h.w.JSON.parse(h.w.JSON.stringify({label:'Agent 教學示意',kind:'figure',dataURL:'data:image/png;base64,AA==',width:1,height:1,source:{kind:'reusable-visual-library',assetLibraryId:'visual-agent-diagram',author:'agent',scope:'教學示意，不是當次量測結果'}})),{actor:'agent'});
  const justification={tool:{reason:'用實算遮罩說明本步輸出，再用 Agent 製作的教學示意交代觀察位置；示意圖不冒充本件量測結果。',expectedEvidence:[{kind:'artifact',type:'image',id:'mask',visuals:[{kind:'canvas-asset',id:asset.id,caption:'Agent 製作的流程示意，說明本步要觀察的像素關係，不代表當次工件結果。'}]}]},parameters:[],boundaries:[{condition:'輸入具有效像素；教學示意只作方法說明。',check:{kind:'gate',id:'pixels'},onFailure:'UNKNOWN'}]};
  const external=await runAlgorithm(p,{title:'含 Agent 教學圖的程序',code,parameters_json:'{}',source:algorithmContext(p).source,expected_outputs:run.expectedOutputs,justification},execute);
  assert.equal(external.status,'SUCCEEDED',external.traceback);assert.equal(external.evidenceVisuals[0].kind,'canvas-asset');assert.equal(external.evidenceVisuals[0].id,asset.id);assert.equal(external.evidenceVisuals[0].source.author,'agent');assert.equal(external.evidenceAudit.errors.some(error=>error.code==='EVIDENCE_VISUAL_UNAVAILABLE'),false,JSON.stringify(external.evidenceAudit.errors));
 }finally{h.close()}
});

function runAlgorithm(project,args,execute){return actualRunAlgorithm(project,bindCurrentAlgorithmRequest(args,algorithmContext(project,{imageIds:args.image_ids})),execute)}
