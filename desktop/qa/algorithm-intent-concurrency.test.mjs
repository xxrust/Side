import {bindCurrentAlgorithmRequest} from './current-algorithm-request.mjs';
// Real imported OpenCV pixels, real Python/OpenCV child process, real controller.
// A filesystem handshake holds the actual algorithm while a human changes UI state.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {algorithmContext,runAlgorithm,algorithmRunCurrent} from '../src/algorithm-workspace.js';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function actualPython(request,onRunning){
 const directory=await fs.mkdtemp(path.join(root,'runtime/intent-concurrency-qa-')),runId=randomUUID(),requestPath=path.join(directory,'request.json');
 await fs.writeFile(requestPath,JSON.stringify({...request,runId}));
 const child=spawn(path.join(root,'runtime/python/bin/python3'),[path.join(root,'scripts/cv-runtime.py'),'--run',requestPath,directory],{cwd:directory,env:{PATH:'/usr/bin:/bin',PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
 let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
 const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
 try{
  let started=false;for(let n=0;n<500;n++){try{await fs.access(path.join(directory,'running.marker'));started=true;break}catch{}await new Promise(r=>setTimeout(r,10))}
  assert.ok(started,'actual Python program reached the live computation handshake');assert.equal(child.exitCode,null,'human changes occur while Python is running');
  await onRunning?.();await fs.writeFile(path.join(directory,'continue.marker'),'continue');
  assert.equal(await exited,0,error);
  return JSON.parse(await fs.readFile(JSON.parse(output.trim()).resultFile,'utf8'));
 }catch(error){child.kill();await exited.catch(()=>{});throw error}
}
async function setup(){
 const h=await createHarness(),{api}=h,p=api.project,a=api.agent,from=value=>h.w.JSON.parse(JSON.stringify(value));
 const bytes=await fs.readFile(path.join(root,'../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg'));
 await api.addImages([{name:'opencv-stuff.jpg',dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')}]);
 const added=p.addInquiryImage(from({id:'concurrent-camera',kind:'original',label:p.image.name,width:p.image.width,height:p.image.height,dataURL:p.image.dataURL,source:{imageId:p.image.id,inputSha256:p.image.sha256,coordinateSpace:'original-image-pixels'}}));
 const annotation=p.addInquiryAnnotation(added.board.id,added.item.id,from({type:'ellipse',points:[{x:40,y:40},{x:110,y:110}],text:'請比較這個區域的實際邊緣'}));
 await api.inquiryView.open({boardId:added.board.id});api.inquiryView.selected=new Set([added.item.id]);
 const thread=api.inquiryView.openLocalQuestion();a.busy=true;a.turn='concurrent-real-pixels';a.turnEpoch=p.epoch;a.turnReference={kind:'visual_inquiry',snapshot:thread.snapshot};a.expectedStamp=a.stamp();
 const responses=[];a.wire=async c=>responses.push(c);
 const call=async(name,args={})=>{const id=randomUUID();await a.event({type:'tool_request',turn:a.turn,id,name,args:from(args)});return responses.find(r=>r.id===id)?.result};
 let onRunning; a.ui.runAlgorithm=(args,options)=>{assert.equal(options.stayOnBoard,true);return runAlgorithm(p,args,request=>actualPython(request,onRunning))};
 return {...h,p,a,from,call,added,annotation,thread,setDuringRun:fn=>onRunning=fn};
}
function input(p){return bindCurrentAlgorithmRequest({title:'並發變更的真實像素診斷',image_ids:[p.image.id],code:`import time\n(run_directory / 'running.marker').write_text('actual-python-running')\nlimit = time.monotonic() + 8\nwhile not (run_directory / 'continue.marker').exists():\n    if time.monotonic() > limit:\n        raise RuntimeError('test handshake timed out')\n    time.sleep(0.01)\nedges = cv2.Canny(image, 64, 128)\nsave_image('edges', edges, section='tool')\nresult = {'boundaryChecks': [{'id':'pixels_available','status':'PASS' if image.size > 0 else 'FAIL','actual':int(image.size),'threshold':1}]}\n`,parameters_json:'{}',source:algorithmContext(p).source,expected_outputs:[{id:'edges',type:'image',role:'result'}],justification:{tool:{reason:'對實際匯入影像計算梯度邊緣作區域診斷；畫板標記保存人的意圖，輸出不冒充工件識別或正式驗收。',expectedEvidence:[{kind:'artifact',type:'image',id:'edges'}]},parameters:[],boundaries:[{condition:'輸入須包含實際像素且提問所引用的標記語意在計算期間保持一致；未驗證跨圖穩定性。',check:{kind:'gate',id:'pixels_available'},onFailure:'UNKNOWN'}]}},algorithmContext(p))}
const liveBoard=h=>h.p.ensureInquiry().boards.find(b=>b.id===h.added.board.id);

test('moving/collapsing a real question bubble and arranging images during Python execution does not invalidate pixels or block publication',async()=>{
 const h=await setup();try{
  const {p,a,api}=h,before=p.data.events.length,marks=JSON.stringify(liveBoard(h).items[0].annotations),page=api.page;
  h.setDuringRun(()=>{
   p.mutate('canvas_question_moved',()=>{const thread=p.data.canvasThreads.find(t=>t.id===h.thread.id);thread.x=150;thread.y=110});
   p.mutate('canvas_question_collapsed',()=>{p.data.canvasThreads.find(t=>t.id===h.thread.id).collapsed=true});
   p.updateInquiryItem(h.added.board.id,h.added.item.id,h.from({x:220,y:90,width:800,height:600}));
   api.inquiryView.pan={x:100,y:35};api.inquiryView.zoom=.75;api.inquiryView.render();a.record('assistant','正在運算，保留畫板。');
  });
  const result=await h.call('run_algorithm',input(p));assert.equal(result.error,undefined);assert.equal(result.status,'SUCCEEDED');assert.ok(p.data.events.length>before);
  const run=p.data.algorithmRuns.at(-1);assert.equal(algorithmRunCurrent(p,run),true);assert.equal(run.inputImpact?.status,undefined);assert.ok(run.intentBinding);
  assert.equal(JSON.stringify(liveBoard(h).items[0].annotations),marks);assert.ok(liveBoard(h).items.length>1);assert.equal(api.page,page);assert.equal(api.inquiryView.boardId,h.added.board.id);
  const shown=await h.call('get_algorithm_run',{run_id:run.runId});assert.equal(shown.current,true);assert.ok(!JSON.stringify(result).includes('data:image/'));
 }finally{h.close()}
});

for(const recovery of ['restore-exact-meaning','refresh-context'])test(`changing a referenced annotation during actual Python returns AGENT_INPUT_CHANGED, saves a stale run without publishing, and recovers via ${recovery}`,async()=>{
 const h=await setup();try{
  const {p,a}=h,oldPoints=JSON.parse(JSON.stringify(h.annotation.points)),count=liveBoard(h).items.length;
  h.setDuringRun(()=>p.updateInquiryAnnotation(h.added.board.id,h.added.item.id,h.annotation.id,h.from({points:[{x:45,y:40},{x:120,y:110}]})));
  const failed=await h.call('run_algorithm',input(p));assert.equal(failed.code,'AGENT_INPUT_CHANGED');assert.equal(failed.retryable,true);assert.ok(failed.errors.some(e=>e.path.includes('annotations')&&e.hint));
  const stale=p.data.algorithmRuns.at(-1);assert.equal(stale.status,'SUCCEEDED','Python really finished; intent invalidation is distinct from process failure');assert.equal(stale.inputImpact.status,'STALE');assert.equal(algorithmRunCurrent(p,stale),false);assert.equal(liveBoard(h).items.length,count,'stale run was never published');
  assert.ok(stale.artifacts.some(a=>a.id==='edges'&&a.dataUrl?.startsWith('data:image/')),'actual generated pixels remain available for audit');
  const read=await h.call('get_algorithm_run',{run_id:stale.runId});assert.equal(read.current,false);
  const show=await h.call('show_algorithm_run',{run_id:stale.runId});assert.ok(show.error,'stale intent cannot be adopted as current evidence');assert.equal(liveBoard(h).items.length,count);
  h.setDuringRun(null);
  if(recovery==='restore-exact-meaning')p.updateInquiryAnnotation(h.added.board.id,h.added.item.id,h.annotation.id,h.from({points:oldPoints}));
  else{const blocked=await h.call('run_algorithm',input(p));assert.equal(blocked.code,'AGENT_INPUT_CHANGED','read-only output access must not refresh changed intent');assert.equal(p.data.algorithmRuns.length,1);const refreshed=await h.call('get_visual_context');assert.equal(refreshed.error,undefined)}
  const retried=await h.call('run_algorithm',input(p));assert.equal(retried.error,undefined);assert.equal(retried.status,'SUCCEEDED');assert.equal(p.data.algorithmRuns.length,2);assert.equal(algorithmRunCurrent(p,p.data.algorithmRuns.at(-1)),true);assert.equal(algorithmRunCurrent(p,stale),false,'the previous stale execution stays historical');assert.ok(liveBoard(h).items.length>count);
 }finally{h.close()}
});
