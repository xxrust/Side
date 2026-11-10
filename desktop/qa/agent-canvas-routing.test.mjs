// Real imported OpenCV image, Python/OpenCV execution and live canvas/controller.
// No model response or image/algorithm result is substituted in these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {algorithmContext,runAlgorithm} from '../src/algorithm-workspace.js';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function actualPython(request){
 const directory=await fs.mkdtemp(path.join(root,'runtime/canvas-routing-qa-')),runId=randomUUID(),requestPath=path.join(directory,'request.json');
 await fs.writeFile(requestPath,JSON.stringify({...request,runId}));
 const child=spawn(path.join(root,'runtime/python/bin/python3'),[path.join(root,'scripts/cv-runtime.py'),'--run',requestPath,directory],{cwd:directory,env:{PATH:'/usr/bin:/bin',PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
 let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});assert.equal(code,0,error);
 return JSON.parse(await fs.readFile(JSON.parse(output.trim()).resultFile,'utf8'));
}
async function setup(){
 const h=await createHarness(),{api}=h,p=api.project,a=api.agent;
 const bytes=await fs.readFile(path.join(root,'../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg'));
 await api.addImages([{name:'opencv-stuff.jpg',dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')}]);

 const added=p.addInquiryImage(h.w.JSON.parse(JSON.stringify({id:'routing-camera',kind:'original',label:p.image.name,width:p.image.width,height:p.image.height,dataURL:p.image.dataURL,source:{imageId:p.image.id,inputSha256:p.image.sha256,coordinateSpace:'original-image-pixels'}}))); 
 await api.inquiryView.open({boardId:added.board.id});
 a.busy=true;a.turn='actual-canvas-routing';a.turnEpoch=p.epoch;a.turnReference={kind:'visual_inquiry',snapshot:p.captureInquirySnapshot(added.board.id)};
 return {...h,p,a,boardId:added.board.id};
}
const input=p=>{const context=algorithmContext(p);return ({title:'原圖梯度診斷圖',image_ids:[p.image.id],code:`edges = cv2.Canny(image, 64, 128)\nsave_image('edges', edges, section='tool')\nsave_image('original', image, section='tool')\nresult = {'boundaryChecks': [{'id':'pixels_available','status':'PASS' if image.size > 0 else 'FAIL','actual':int(image.size),'threshold':1}]}\n`,parameters_json:'{}',source:context.source,expected_outputs:[{id:'edges',type:'image',role:'result'},{id:'original',type:'image',role:'result'}],justification:{meta:{sourceFingerprint:context.sourceFingerprint},tool:{reason:'將本次匯入的實際 OpenCV 相片做梯度邊緣診斷，並保留原圖對照；不將邊緣圖冒充已驗證的工件輪廓。',expectedEvidence:[{kind:'artifact',type:'image',id:'edges'}]},parameters:[],boundaries:[{condition:'輸入必須包含實際像素；此診斷沒有評估邊緣的工件語意與跨圖穩定性。',check:{kind:'gate',id:'pixels_available'},onFailure:'UNKNOWN'}]}});};

test('a real Python run and presentation stay on the question board and publish genuine output pixels',async()=>{
 const h=await setup();try{
  const {api,p,a,boardId}=h,page=api.page,annotations=JSON.stringify(p.ensureInquiry().boards[0].items[0].annotations),options=[];
  // Replace only the native transport with its normal local Python subprocess.
  a.ui.runAlgorithm=async(args,display)=>{options.push(display);return runAlgorithm(p,args,actualPython)};
  const result=await a.execute('run_algorithm',h.w.JSON.parse(JSON.stringify(input(p))));assert.equal(result.status,'SUCCEEDED');assert.equal(options[0].stayOnBoard,true);assert.equal(options[0].boardId,boardId);assert.equal(api.page,page);
  const run=p.data.algorithmRuns.at(-1),board=p.ensureInquiry().boards.find(b=>b.id===boardId);
  assert.ok(board.items.length>=3);assert.equal(JSON.stringify(board.items[0].annotations),annotations);assert.equal(api.inquiryView.boardId,boardId);assert.equal(api.inquiryView.opened,true);
  const published=board.items.slice(1).map(item=>p.ensureInquiry().assets.find(asset=>asset.id===item.assetId));assert.ok(published.some(asset=>asset.source.runId===run.runId&&asset.source.artifactId==='edges'));assert.ok(published.every(asset=>/^data:image\//.test(asset.dataURL)));
  assert.ok(!JSON.stringify(result).includes('data:image/'));
  const declaration={title:'真實結果對照',imageId:p.image.id,layout:'focus',components:[{id:'edges',kind:'image',title:'邊緣診斷',source:{artifactId:'edges'}},{id:'original',kind:'image',title:'原圖',source:{artifactId:'original'}}]};
  const presentation=await a.execute('present_algorithm_result',{run_id:run.runId,presentation_json:JSON.stringify(declaration)});
  assert.equal(api.page,page);assert.equal(api.inquiryView.boardId,boardId);assert.equal(presentation.presentation.runId,run.runId);
  await a.execute('set_algorithm_presentation',{presentation_id:presentation.presentation.id,component_id:'original',layout:'compare'});assert.equal(api.page,page);
  await a.execute('show_algorithm_run',{run_id:run.runId,artifact_id:'edges'});assert.equal(api.page,page);assert.equal(api.inquiryView.boardId,boardId);
  await a.execute('go_to_step',{step:6});assert.equal(api.page,page);
  await assert.rejects(a.execute('set_inspection_view',{}),/畫板回合不開啟舊四側檢視/);
  a.stop();await a.execute('go_to_step',{step:1});assert.equal(api.page,page,'legacy step navigation cannot restore removed step pages in the canvas-first workspace');
 }finally{h.close()}
});

test('omitted visual targets bind to the question while explicit board targets are honored without changing session or active board',async()=>{
 const h=await setup();try{
  const {api,p,a,boardId}=h,source=p.ensureInquiry().boards.find(b=>b.id===boardId).items[0],other=p.createInquiryBoard({title:'另一畫板'});
  await api.inquiryView.open({boardId:other.id});const frozen=JSON.stringify(a.turnReference);
  const added=await a.execute('add_visual_image',{asset_id:source.assetId});assert.equal(added.board_id,boardId);
  const mark=await a.execute('annotate_visual_board',h.w.JSON.parse(JSON.stringify({item_id:added.item_id,type:'ellipse',points:[{x:20,y:20},{x:80,y:80}],text:'Agent 討論標記'})));assert.equal(mark.board_id,boardId);
  const link=await a.execute('connect_visual_images',{from_item_id:source.id,to_item_id:added.item_id,label:'原圖對照'});assert.equal(link.relation.boardId,boardId);
  assert.equal(p.ensureInquiry().boards.find(b=>b.id===other.id).items.length,0);assert.equal(p.ensureInquiry().activeBoardId,other.id);assert.equal(api.inquiryView.boardId,other.id);
  const origin=JSON.stringify(p.ensureInquiry().boards.find(b=>b.id===boardId)),left=await a.execute('add_visual_image',{asset_id:source.assetId,board_id:other.id}),right=await a.execute('add_visual_image',{asset_id:source.assetId,board_id:other.id});assert.equal(left.board_id,other.id);assert.equal(right.board_id,other.id);
  const explicitMark=await a.execute('annotate_visual_board',h.w.JSON.parse(JSON.stringify({board_id:other.id,item_id:left.item_id,type:'ellipse',points:[{x:20,y:20},{x:80,y:80}],text:'明確其他畫板標記'})));assert.equal(explicitMark.board_id,other.id);
  const explicitLink=await a.execute('connect_visual_images',{board_id:other.id,from_item_id:left.item_id,to_item_id:right.item_id,label:'明確其他畫板對照'});assert.equal(explicitLink.relation.boardId,other.id);assert.equal(p.ensureInquiry().boards.find(b=>b.id===other.id).items.length,2);assert.equal(JSON.stringify(p.ensureInquiry().boards.find(b=>b.id===boardId)),origin);assert.equal(p.ensureInquiry().activeBoardId,other.id);assert.equal(api.inquiryView.boardId,other.id);assert.equal(a.visualBoardId(),boardId);assert.equal(JSON.stringify(a.turnReference),frozen);
  a.stop();assert.equal(a.visualBoardId(),null);assert.equal(a.turnVisualBoardId,null);
 }finally{h.close()}
});
