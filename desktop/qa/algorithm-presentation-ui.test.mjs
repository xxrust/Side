import {readAlgorithmPresentation} from '../src/algorithm-presentation.js';
import {bindCurrentAlgorithmRequest} from './current-algorithm-request.mjs';
// Full app host + Agent.execute + actual Python/PNG artifacts. OS transport is
// replaced by a real subprocess; JSDOM image-load events do not claim native UI QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs'),{createCanvas,loadImage}=require('../../qa/node_modules/@napi-rs/canvas');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),python=path.join(root,'runtime/python/bin/python3'),runner=path.join(root,'scripts/cv-runtime.py');
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){const c=createCanvas(64,48),g=c.getContext('2d');g.fillStyle='rgb(10,20,30)';g.fillRect(0,0,64,48);g.fillStyle='rgb(210,120,45)';g.fillRect(12,10,20,12);return c.toDataURL('image/png')}
const program=`import numpy as np
mask = (image[:,:,2] > parameters['red_floor']).astype(np.uint8) * 255
ys, xs = np.nonzero(mask)
width = int(xs.max()-xs.min()+1) if len(xs) else None
overlay = image.copy()
overlay[mask>0] = (0,255,0)
save_image('overlay', overlay, section='tool')
save_image('mask', mask, section='parameters')
statistics = {'rows': [{'side':'left','position':int(xs.min())}, {'side':'right','position':int(xs.max())}], 'profile': [{'x':0,'y':0}, {'x':1,'y':int(len(xs))}, {'x':2,'y':0}]}
save_json('statistics', statistics, section='parameters')
result = {'width_px':width, 'foreground_count':int(len(xs)), 'note':'原圖紅色矩形的實算寬度 <img src=x onerror=alert(1)>', 'boundaryChecks':[{'id':'foreground','status':'PASS' if len(xs)>0 else 'FAIL','actual':int(len(xs)),'threshold':1}]}
save_json('boundary', result['boundaryChecks'], section='boundary')
`;
async function realHost({legacy=false,measurement=false,failRerun=false}={}){
 const h=await createHarness(),nativeCalls=[],artifacts=await fs.mkdtemp(path.join(root,'runtime/algorithm-presentation-ui-qa-'));
 h.w.__native.isTauri=()=>true;
 h.w.__native.invoke=async(name,args)=>{
  nativeCalls.push({name,args});if(name!=='execute_cv_algorithm')throw Error('Unexpected native call in presentation fixture: '+name);
  const runDirectory=await fs.mkdtemp(path.join(artifacts,'run-')),requestPath=path.join(runDirectory,'request.json'),request={...args.request,runId:randomUUID()};await fs.writeFile(requestPath,JSON.stringify(request));
  const child=spawn(python,[runner,'--run',requestPath,runDirectory],{cwd:runDirectory,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)});assert.equal(code,0,stderr);const pointer=JSON.parse(stdout.trim());return JSON.parse(await fs.readFile(pointer.resultFile,'utf8'));
 };
 await h.api.addImages([{name:'camera-64x48.png',dataUrl:fixture()}]);
 if(legacy||measurement){const p=h.api.project,id=p.workflow.workpiece.id;p.setRegion(id,[{x:12,y:10},{x:32,y:10},{x:32,y:22},{x:12,y:22}]);p.addCheck({name:'原四側寬度',targetId:id,kind:'width',min:19,max:21,unit:'px'});p.buildRecipe();await p.runImage();}
 // Exercise the current product route: a real conversation scoped to the
 // active canvas, rather than the retired standalone presentation page.
 const canvasAgent=h.api.agent,canvasProject=h.api.project,canvasId=h.api.inquiryView.boardId;
 canvasAgent.busy=true;canvasAgent.turn='real-canvas-presentation';canvasAgent.turnEpoch=canvasProject.epoch;canvasAgent.turnReference={kind:'visual_inquiry',snapshot:canvasProject.captureInquirySnapshot(canvasId)};canvasAgent.expectedStamp=canvasAgent.stamp();
 const context=await h.api.agent.execute('get_algorithm_context',{});
 let fixtureProgram=program;
 if(measurement){const targetId=h.api.project.workflow.workpiece.id;fixtureProgram+=`
import json
measurement_justification = json.loads(${JSON.stringify(JSON.stringify({tool:{reason:'由原圖紅色像素遮罩的四側邊界建立本次量測，保留疊圖與位置數據。',expectedEvidence:[{kind:'artifact',type:'image',id:'overlay'},{kind:'artifact',type:'evidence',id:'statistics'}]},parameters:[{name:'red_floor',source:'agent-proposal',reason:'明確指定紅通道門檻128，查看遮罩核對像素支持範圍。',verification:{kind:'artifact',type:'image',id:'mask'}}],boundaries:[{condition:'需有前景像素支持。',check:{kind:'gate',id:'foreground'},onFailure:'UNKNOWN'}]}))})
xlo, xhi, ylo, yhi = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
def measured_side(side):
    horizontal = side in ['top','bottom']
    lo, hi = (xlo,xhi) if horizontal else (ylo,yhi)
    normal = {'top':ylo-.5,'bottom':yhi+.5,'left':xlo-.5,'right':xhi+.5}[side]
    points = [{'x':t,'y':normal} if horizontal else {'x':normal,'y':t} for t in range(lo,hi+1)]
    return {'geometry':{'from':points[0],'to':points[-1]}, 'support':{'sampleSpan':{'axis':'x' if horizontal else 'y','from':lo,'to':hi,'step':1},'points':points}, 'checks':[{'id':'rms','metric':'rms_px','operator':'<=','threshold':1.5,'unit':'px'},{'id':'coverage','metric':'coverage','operator':'>=','threshold':.65,'unit':'ratio'},{'id':'count','metric':'support_count','operator':'>=','threshold':3,'unit':'points'}], 'evidenceRefs':['overlay','statistics']}
result['measurementOutputs'] = [{'id':'mask-bounds','imageId':source['images'][0]['imageId'],'targetId':${JSON.stringify(targetId)},'coordinateSpace':'original-pixels','selection':{'rule':'red-mask-boundary','scanDirection':'image-positive','reason':'使用紅色遮罩的四側真實支持範圍建立幾何量測。'},'lines':{side:measured_side(side) for side in ['top','bottom','left','right']},'evidenceRefs':['overlay','statistics'],'justification':measurement_justification,'boundaryChecks':result['boundaryChecks']}]
`;}
 if(failRerun)fixtureProgram=`from pathlib import Path
if (run_directory.parent / 'fail-next-run').exists():
    save_json('failure-note', {'reason':'controlled-rerun-failure'}, section='boundary')
    raise RuntimeError('controlled-rerun-failure')
`+fixtureProgram;
 const request={title:'Actual red-mask width presentation fixture',image_ids:[h.api.project.image.id],code:fixtureProgram,source:context.source,parameters_json:'{"red_floor":128}',expected_outputs:[{id:'overlay',type:'image',role:'result'},{id:'mask',type:'image',role:'result'},{id:'statistics',type:'evidence'},{id:'boundary',type:'evidence'}],justification:{tool:{reason:'使用紅通道遮罩計算本張真實 PNG 的支持範圍，圖像與數值可直接核對。',expectedEvidence:[{kind:'artifact',type:'image',id:'overlay'}]},parameters:[{name:'red_floor',source:'agent-proposal',reason:'此試驗指定128，並保存遮罩驗證對已知紅色矩形的作用。',verification:{kind:'artifact',type:'image',id:'mask'}}],boundaries:[{condition:'必須有真實前景支持像素。',check:{kind:'gate',id:'foreground'},onFailure:'UNKNOWN'}]}};
 bindCurrentAlgorithmRequest(request,context);
 const compact=await h.api.agent.execute('run_algorithm',request),run=h.api.project.data.algorithmRuns.find(item=>item.runId===compact.runId);assert.equal(run.status,'SUCCEEDED');assert.equal(run.result.width_px,20);assert.equal(run.evidenceAudit.status,'READY_FOR_REVIEW');
 return {...h,nativeCalls,run};
}

function presentation(h,{layout='focus',components}={}){return {title:'真實遮罩與尺寸',imageId:h.api.project.image.id,layout,components:components||[
 {id:'overlay-image',kind:'image',title:'本次原圖疊圖',source:{artifactId:'overlay'}},
 {id:'mask-image',kind:'image',title:'本次遮罩',source:{artifactId:'mask'}},
 {id:'measurements',kind:'metrics',title:'本次數值',source:{},fields:[{label:'寬度',path:'width_px',unit:'px'},{label:'前景像素',path:'foreground_count'}]},
 {id:'edge-table',kind:'table',title:'左右邊位置',source:{artifactId:'statistics',path:'rows'},columns:[{label:'側別',path:'side'},{label:'位置',path:'position',unit:'px'}]},
 {id:'actual-profile',kind:'plot',title:'實際樣本曲線',source:{artifactId:'statistics',path:'profile'},x:'x',series:[{label:'支持像素',path:'y'}]},
 {id:'literal-note',kind:'text',title:'算法備註',source:{path:'note'}}
]}}
async function present(h,input=presentation(h)){
 let failure,settled=false;const pending=h.api.agent.execute('present_algorithm_result',{run_id:h.run.runId,presentation_json:JSON.stringify(input)}).then(result=>{settled=true;return result},error=>{failure=error;settled=true;throw error});pending.catch(()=>{});
 for(let i=0;i<100&&!settled;i++){if(h.w.document.querySelector('.algorithm-presentation-host img')){await loadRenderedImages(h);break}await h.tick()}if(failure)throw failure;return pending;
}
async function read(h,args={}){return h.api.agent.execute('get_algorithm_presentation',args)}
async function tickUntil(h,predicate,message){for(let i=0;i<100;i++){if(predicate())return;await h.tick()}throw Error('Timed out: '+message)}
// The PNG is really decoded; only the DOM load event is supplied by this harness.
async function loadRenderedImages(h){for(const image of h.w.document.querySelectorAll('.algorithm-presentation-host img')){if(image.naturalWidth&&image.complete)continue;const decoded=await loadImage(Buffer.from(image.src.split(',')[1],'base64'));Object.defineProperties(image,{naturalWidth:{configurable:true,value:decoded.width},naturalHeight:{configurable:true,value:decoded.height},complete:{configurable:true,value:true}});image.dispatchEvent(new h.w.Event('load'));}await h.tick()}

function boardImages(h,runId){return h.api.inquiryView.board().items.filter(item=>h.api.inquiryView.asset(item)?.source?.runId===runId).map(item=>({item,asset:h.api.inquiryView.asset(item)}));}
function assertCanvasReceipt(h,result,runId,expectedArtifacts){
 const visual=result.visual;assert.ok(visual,'actual canvas publication receipt');assert.equal(visual.run_id,runId);assert.equal(visual.view,'current-canvas');assert.equal(visual.visible_on_current_board,true);assert.equal(visual.board_id,h.api.inquiryView.boardId);
 assert.deepEqual(copy(visual.images.map(r=>r.asset.source.artifactId)).sort(),[...expectedArtifacts].sort());
 for(const receipt of visual.images){const ready=h.api.inquiryView.images.get(receipt.asset.id);assert.equal(receipt.asset.source.runId,runId);assert.equal(ready?.ready,true);assert.equal(ready.image.width,64);assert.equal(ready.image.height,48);}
 assert.equal(h.w.document.querySelector('.algorithm-presentation-host'),null,'publication stays on current canvas');
}
const modelData=(h,id)=>readAlgorithmPresentation(h.api.project,{presentation_id:id,include_data:true});
async function executeWithDecodedImages(h,name,args){let settled=false;const pending=h.api.agent.execute(name,args).finally(()=>{settled=true});pending.catch(()=>{});for(let i=0;i<1000&&!settled;i++){await loadRenderedImages(h);await h.tick()}return pending;}

test('Pi publishes real images on current canvas and keeps source-bound metrics/table/plot/text available without a false old-page receipt',async()=>{
 const h=await realHost();try{
  const result=await present(h),state=await read(h);assertCanvasReceipt(h,result,h.run.runId,['overlay','mask']);assert.equal(h.api.page,6);assert.equal(state.current,true);assert.equal(state.viewVisible,false);assert.equal(state.renderReceipt,null);
  const data=modelData(h,state.id);assert.equal(data.components.length,6);assert.deepEqual(copy(data.justification),copy(h.run.justification));
  const metrics=data.components.find(c=>c.id==='measurements').data.fields;assert.equal(metrics.find(f=>f.path==='width_px').value,20);assert.equal(metrics.find(f=>f.path==='foreground_count').value,240);
  assert.deepEqual(copy(data.components.find(c=>c.id==='edge-table').data.rows),[['left',12],['right',31]]);
  assert.deepEqual(copy((await h.api.agent.execute('get_algorithm_run',{run_id:h.run.runId,artifact_id:'statistics',path:'profile'})).items),[{x:0,y:0},{x:1,y:240},{x:2,y:0}]);
  assert.match(JSON.stringify(data.components.find(c=>c.id==='literal-note').data),/<img src=x onerror=alert\(1\)>/);assert.equal(h.w.document.querySelectorAll('img[src="x"]').length,0,'saved algorithm text is never injected as host markup');
  assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('Pi layout updates publish the explicitly selected real image and return a fresh canvas revision',async()=>{
 const h=await realHost();try{
  const first=await present(h),previous=await read(h);const result=await present(h,{...presentation(h),title:'原圖與遮罩比較',layout:'compare',components:[presentation(h).components[1],presentation(h).components[2]]}),next=await read(h);
  assertCanvasReceipt(h,result,h.run.runId,['mask']);assert.notEqual(next.id,previous.id);assert.equal(next.layout,'compare');assert.ok(result.visual.board_revision>=first.visual.board_revision);assert.equal(result.presentation.components[0].id,'mask-image');assert.equal(h.api.inquiryView.opened,true);
  const empty=h.api.project.createInquiryBoard({title:'另一個真實畫板'});await h.api.inquiryView.open({boardId:empty.id});assert.equal(h.api.inquiryView.board().items.length,0);assert.equal((await read(h)).viewVisible,false,'saved view metadata is not a live receipt on another canvas');assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('unsupported components and wrong references reject atomically while preserving the current canvas',async()=>{
 const h=await realHost();try{
  await present(h);const before=JSON.stringify(h.api.project.data),previous=await read(h),request=input=>h.api.agent.execute('present_algorithm_result',{run_id:h.run.runId,presentation_json:JSON.stringify(input)});
  for(const [kind,source,expected]of [['html',{},'PRESENTATION_KIND_INVALID'],['image',{artifactId:'missing-image'},'PRESENTATION_ARTIFACT_MISSING'],['metrics',{path:'missing.actual'},'PRESENTATION_PATH_MISSING']]){
   const input=presentation(h,{components:[{id:'invalid',kind,title:'不能用錯誤來源替換畫板',source,...(kind==='metrics'?{fields:[{label:'value',path:'width_px'}]}:{})}]});await assert.rejects(request(input),error=>error.code===expected&&error.errors.every(e=>e.code&&e.path&&e.message&&e.hint));assert.equal(JSON.stringify(h.api.project.data),before);assert.equal((await read(h)).id,previous.id);
  }
  const artifact=h.run.artifacts.find(a=>a.id==='overlay'),original=copy(artifact.source);artifact.source.images[0].imageSha256='wrong-input-sha';const altered=JSON.stringify(h.api.project.data);await assert.rejects(request(presentation(h)),e=>e.code==='PRESENTATION_ARTIFACT_SOURCE_MISMATCH');assert.equal(JSON.stringify(h.api.project.data),altered);artifact.source=original;assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('changed source makes saved presentation historical without silently rerunning or republishing old images',async()=>{
 const h=await realHost();try{
  await present(h);assert.equal((await read(h)).current,true);const count=h.api.inquiryView.board().items.length;h.api.project.pixels.get(h.api.project.image.id).gray[0]+=1;h.api.render();const stale=await read(h);assert.equal(stale.sourceCurrent,false);assert.equal(stale.current,false);assert.equal(stale.status,'STALE');assert.equal(stale.viewVisible,false);assert.equal(stale.renderReceipt,null);
  assert.equal(h.api.project.data.algorithmRuns[0].result.width_px,20);assert.equal(h.nativeCalls.filter(c=>c.name==='execute_cv_algorithm').length,1);assert.equal(h.api.inquiryView.board().items.length,count);await assert.rejects(h.api.agent.execute('present_algorithm_result',{run_id:h.run.runId,presentation_json:JSON.stringify(presentation(h))}),/來源|改變|歷史|失效/);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('canvas run_current executes the actual active program and never falls back to the legacy four-side recipe',async()=>{
 const h=await realHost({legacy:true});try{
  const p=h.api.project;assert.ok(p.workflow.recipe);const legacyBefore=JSON.stringify(p.workflow.recipe),legacyResult=JSON.stringify(p.image.result);await present(h);let legacyCalls=0;p.runImage=async()=>{legacyCalls++;throw Error('must not use legacy recipe')};
  const result=await executeWithDecodedImages(h,'run_current',{}),latest=p.data.algorithmRuns.at(-1);assert.equal(legacyCalls,0);assert.equal(h.nativeCalls.filter(c=>c.name==='execute_cv_algorithm').length,2);assert.equal(latest.code,program);assert.notEqual(latest.runId,h.run.runId);assert.equal(latest.result.width_px,20);assertCanvasReceipt(h,result,latest.runId,['overlay','mask']);assert.equal(JSON.stringify(p.workflow.recipe),legacyBefore);assert.equal(JSON.stringify(p.image.result),legacyResult);assert.equal((await read(h)).runId,latest.runId);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('set_algorithm_presentation selects a real canvas artifact and refuses to claim a non-image component was drawn',async()=>{
 const h=await realHost();try{
  await present(h);const initial=await read(h),result=await executeWithDecodedImages(h,'set_algorithm_presentation',{presentation_id:initial.id,component_id:'mask-image',layout:'compare'});assertCanvasReceipt(h,result,h.run.runId,['mask']);assert.equal((await read(h)).layout,'compare');
  const itemCount=h.api.inquiryView.board().items.length;await assert.rejects(executeWithDecodedImages(h,'set_algorithm_presentation',{component_id:'measurements'}),/不是圖像|數據/);assert.equal(h.api.inquiryView.board().items.length,itemCount);assert.equal(modelData(h,(await read(h)).id).components.find(c=>c.id==='measurements').data.fields[0].value,20);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('failed canvas rerun retains failure history and cannot borrow old dimensions or images as new results',async()=>{
 const h=await realHost({measurement:true,failRerun:true});try{
  await present(h);const adopted=await executeWithDecodedImages(h,'adopt_algorithm_output',{run_id:h.run.runId,output_id:'mask-bounds'});assert.equal(adopted.evaluation.current,true);assert.equal(adopted.evaluation.measurement.width,20);
  const originalId=h.run.runId;await fs.writeFile(path.join(path.dirname(h.run.runDirectory),'fail-next-run'),'cause actual Python failure');const result=await executeWithDecodedImages(h,'run_current',{}),latest=h.api.project.data.algorithmRuns.at(-1),current=await read(h);assert.equal(latest.status,'FAILED');assert.notEqual(latest.runId,originalId);assert.equal(latest.artifacts.filter(a=>a.type==='image').length,0);assert.equal(current.runId,latest.runId);assert.equal(current.runStatus,'FAILED');assert.equal(boardImages(h,latest.runId).length,0);assert.equal(result.result?.status||result.status,'FAILED');assert.equal(result.visual?.images?.length||0,0);assert.equal(h.api.project.data.algorithmRuns.find(r=>r.runId===originalId).result.width_px,20);assert.equal(modelData(h,current.id).components.some(c=>c.kind==='image'),false);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('saved program measurement without active presentation refuses run_current without legacy fallback or state changes',async()=>{
 const h=await realHost({measurement:true});try{
  await present(h);await executeWithDecodedImages(h,'adopt_algorithm_output',{run_id:h.run.runId,output_id:'mask-bounds'});const p=h.api.project;assert.ok(p.image.algorithmMeasurement);p.data.activeAlgorithmPresentationId=null;h.api.render();let legacyCalls=0;p.runImage=async()=>{legacyCalls++;throw Error('legacy fallback forbidden')};const before=JSON.stringify(p.data);await assert.rejects(h.api.agent.execute('run_current',{}),/程式量測綁定.*開啟.*禁止回落/);assert.equal(legacyCalls,0);assert.equal(h.nativeCalls.filter(c=>c.name==='execute_cv_algorithm').length,1);assert.equal(JSON.stringify(p.data),before);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
