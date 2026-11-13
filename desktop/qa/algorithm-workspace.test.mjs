// Real Workspace + actual encoded/decoded PNG + normal Python/OpenCV subprocess.
// Only OS process dispatch replaces the desktop invoke transport; pixel decoding,
// user program execution, saved files, failures and JS evidence auditing are real.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {Workspace} from '../src/workspace.js';
import {sourceFingerprint} from '../src/purpose-compiler.js';
import {algorithmContext,algorithmCapabilities,runAlgorithm,readAlgorithmRun,readAlgorithmData,algorithmRunCurrent,compactAlgorithmRun} from '../src/algorithm-workspace.js';
import {getEdgeSearchContext,trialEdgeSearch} from '../src/agent-line-tools.js';

const require=createRequire(import.meta.url),{createCanvas,loadImage}=require('../../qa/node_modules/@napi-rs/canvas');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),python=process.env.AGENTCV_PYTHON||path.join(root,'runtime/python/bin/python3'),runner=path.join(root,'scripts/cv-runtime.py');
const artifacts=await fs.mkdtemp(path.join(root,'runtime/algorithm-workspace-qa-'));
const copy=value=>JSON.parse(JSON.stringify(value));
function imageFixture({nested=false}={}){
 const width=nested?420:64,height=nested?300:48,canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),pixels=ctx.createImageData(width,height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let rgb=[10,20,30];
  if(nested){let gray=30;if(x>=80&&x<340&&y>=60&&y<240)gray=180;if(x>=88&&x<332&&y>=68&&y<232)gray=220;rgb=[gray,gray,gray]}
  else if(x>=12&&x<32&&y>=10&&y<22)rgb=[210,120,45];
  const i=(y*width+x)*4;pixels.data[i]=rgb[0];pixels.data[i+1]=rgb[1];pixels.data[i+2]=rgb[2];pixels.data[i+3]=255;
 }
 ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png');
}
async function decode(dataURL){
 const bytes=Buffer.from(dataURL.split(',')[1],'base64'),decoded=await loadImage(bytes),canvas=createCanvas(decoded.width,decoded.height),ctx=canvas.getContext('2d');ctx.drawImage(decoded,0,0);
 const rgba=ctx.getImageData(0,0,decoded.width,decoded.height).data,gray=new Float32Array(decoded.width*decoded.height);
 for(let i=0;i<gray.length;i++)gray[i]=rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114;
 return {width:decoded.width,height:decoded.height,gray,rgba,sha256:createHash('sha256').update(bytes).digest('hex')};
}
async function workspace(options={}){const project=new Workspace();await project.addImages([{name:'independent-camera.png',dataUrl:imageFixture(options)}],decode);return project}
function actualExecutor({onSpawn}={}){
 const calls=[];
 const execute=async request=>{
  const runDirectory=await fs.mkdtemp(path.join(artifacts,'run-')),runId=randomUUID(),saved={...request,runId},requestPath=path.join(runDirectory,'request.json');
  await fs.writeFile(requestPath,JSON.stringify(saved,null,2)+'\n');calls.push({request:saved,runDirectory,requestPath});
  const child=spawn(python,[runner,'--run',requestPath,runDirectory],{cwd:runDirectory,env:{PATH:'/usr/bin:/bin',PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>stderr+=value);
  const outcome=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}))});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});await onSpawn?.({runDirectory,runId,request:saved});
  const exit=await outcome;assert.equal(exit.code,0,stderr);assert.equal(exit.signal,null);
  const pointer=JSON.parse(stdout.trim()),result=JSON.parse(await fs.readFile(pointer.resultFile,'utf8'));
  assert.equal(result.runId,runId);assert.equal(path.dirname(pointer.resultFile),runDirectory);
  return {...result,startedAt:new Date().toISOString()};
 };
 return {execute,calls};
}
const program=`from dataclasses import dataclass, asdict
from fractions import Fraction
from collections import Counter

@dataclass(frozen=True)
class PixelSummary:
    count: int
    red_sum: int
    rational_red_mean: str

def summed_red(mask):
    selected = image[:, :, 2].astype(np.uint16) * (mask > 0)
    prefix = cv2.integral(selected.astype(np.float64))
    return int(prefix[-1, -1])

mask = np.where(image[:, :, 2] > parameters['red_floor'], 255, 0).astype(np.uint8)
count = int(np.count_nonzero(mask))
red_sum = summed_red(mask)
summary = asdict(PixelSummary(count, red_sum, str(Fraction(red_sum, max(1, count)))))
summary['label_counts'] = dict(Counter(mask.ravel().tolist()))
overlay = image.copy()
overlay[mask > 0] = (0, 255, 0)
save_image('mask', mask, section='tool')
save_image('overlay', overlay, section='tool')
save_json('stats', summary, section='parameters')
result = {**summary, 'boundaryChecks': [{'id': 'nonempty_foreground', 'status': 'PASS' if count > 0 else 'FAIL', 'actual': count, 'threshold': 1}]}
save_json('boundary', result['boundaryChecks'], section='boundary')
print('normal imports, dataclass and integral completed')
`;
function rationale(){return {
 tool:{reason:'以原彩色圖紅通道形成明確遮罩，使用本次編寫的積分表和 dataclass 統計支持像素；此算法不在內建算子名單。',expectedEvidence:[{kind:'artifact',type:'image',id:'mask'},{kind:'artifact',type:'image',id:'overlay'}]},
 parameters:[{name:'red_floor',source:'agent-proposal',reason:'此試驗明確指定紅強度128，檢查對已知彩色像素的作用，沒有宣稱此閾值由資料自動選定或適用其他相機。',verification:{kind:'artifact',type:'evidence',id:'stats'}}],
 boundaries:[{condition:'此程式需要至少一個符合紅通道條件的原圖像素；沒有支持則保留診斷。',check:{kind:'gate',id:'nonempty_foreground'},onFailure:'UNKNOWN'}]
}}
function request(project,patch={}){
 const source=copy(algorithmContext(project).source),justification=rationale();
 // These trials intentionally explore a program without a saved scheme. Bind
 // its authored rationale to the actual current source, as the live API requires.
 justification.meta={sourceFingerprint:sourceFingerprint(source)};
 return {title:'Programmable integral and dataclass color statistics',mode:'draft',image_ids:[project.image.id],code:program,parameters_json:'{"red_floor":128}',source,expected_outputs:[{id:'mask',type:'image'},{id:'overlay',type:'image'},{id:'stats',type:'evidence'},{id:'boundary',type:'evidence'}],justification,...patch};
}

test('normal nonregistered Python algorithm preserves exact inputs, code, parameters, legacy explanations and actual outputs',async()=>{
 const project=await workspace(),executor=actualExecutor(),input=request(project),before=copy(project.data),run=await runAlgorithm(project,input,executor.execute);
 assert.equal(algorithmCapabilities().algorithmAllowlist,null);assert.equal(run.status,'SUCCEEDED');assert.equal(run.evidenceAudit.status,'READY_FOR_REVIEW');assert.equal(run.evidenceAudit.delivered,false);assert.deepEqual(run.evidenceAudit.errors,[]);
 assert.equal(run.result.count,240);assert.equal(run.result.red_sum,50400);assert.equal(run.result.rational_red_mean,'210');assert.deepEqual(run.result.label_counts,{'0':2832,'255':240});
 assert.equal(run.code,program);assert.deepEqual(run.parameters,{red_floor:128});assert.deepEqual(run.justification,input.justification);assert.deepEqual(run.sourceBinding,input.source);assert.deepEqual(run.source,input.source.images[0]);assert.equal(run.stage,'TRIAL');assert.equal(run.author,'agent');assert.equal(run.humanConfirmed,false);
 assert.equal(run.inputs[0].sha256,project.image.sha256);assert.equal(run.inputs[0].width,64);assert.equal(run.inputs[0].height,48);assert.equal(run.inputs[0].colorOrder,'BGR');
 assert.deepEqual(project.workflow,before.workflow,'program trial does not rewrite human workpiece, rules or publication');assert.deepEqual(project.image.labels,before.images[0].labels);
 assert.equal(await fs.readFile(path.join(run.runDirectory,'algorithm.py'),'utf8'),program);assert.deepEqual(JSON.parse(await fs.readFile(path.join(run.runDirectory,'request.json'),'utf8')).parameters,{red_floor:128});
 for(const artifact of run.artifacts){const bytes=await fs.readFile(artifact.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);assert.deepEqual(artifact.source,input.source)}
 const mask=run.artifacts.find(a=>a.id==='mask'),maskPixels=await decode(mask.dataUrl);assert.equal(maskPixels.width,64);assert.equal(maskPixels.height,48);assert.equal([...maskPixels.gray].filter(v=>v>0).length,240);assert.equal(mask.type,'image');assert.equal(mask.section,'tool');
 const stats=run.artifacts.find(a=>a.id==='stats');assert.equal(stats.type,'json');assert.equal(stats.section,'parameters');assert.equal(stats.data.count,240);assert.match(run.stdout,/normal imports, dataclass and integral completed/);
 assert.equal(project.data.algorithmRuns.length,1);assert.equal(readAlgorithmRun(project,run.runId).current,true);assert.equal(algorithmRunCurrent(project,run),true);const compact=compactAlgorithmRun(run);assert.equal(compact.code,undefined);assert.ok(compact.artifacts.every(a=>a.dataURL===undefined&&a.dataUrl===undefined));
});

test('free documentation accepts partial legacy prose while invalid references and stale pixels reject atomically',async()=>{
 const project=await workspace(),executor=actualExecutor();
 for(const section of ['tool','parameters','boundaries']){const input=request(project);delete input.justification[section];input.documentation='說明可以自由組織，這次不填舊欄位。';const run=await runAlgorithm(project,input,executor.execute);assert.equal(run.status,'SUCCEEDED');assert.equal(run.evidenceAudit.status,'READY_FOR_REVIEW');}
 const invalid=request(project);invalid.justification.tool.expectedEvidence=[{kind:'artifact',type:'image',id:'nonexistent-output'}];const before=JSON.stringify(project.data);await assert.rejects(runAlgorithm(project,invalid,executor.execute),error=>error.code==='ALGORITHM_EVIDENCE_PROPOSAL_REJECTED');assert.equal(JSON.stringify(project.data),before);
 const input=request(project);project.pixels.get(project.image.id).gray[0]+=1;await assert.rejects(runAlgorithm(project,input,executor.execute),error=>error.code==='ALGORITHM_SOURCE_STALE');assert.equal(executor.calls.length,3);
});

test('rationale metadata no longer gates execution; the actual source binding is authoritative',async()=>{
 const project=await workspace(),executor=actualExecutor();
 for(const change of [input=>{delete input.justification.meta},input=>{delete input.justification.meta.sourceFingerprint},input=>{input.justification.meta.sourceFingerprint='old-session-source'}]){
  const input=request(project);change(input);const run=await runAlgorithm(project,input,executor.execute);assert.equal(run.status,'SUCCEEDED');assert.deepEqual(run.sourceBinding,input.source);
 }
 assert.equal(executor.calls.length,3);
});

test('source pixels changed during real child execution reject current adoption but retain the true execution directory',async()=>{
 const project=await workspace(),input=request(project),executor=actualExecutor({onSpawn:()=>{project.pixels.get(project.image.id).gray[0]+=17}});
 await assert.rejects(runAlgorithm(project,input,executor.execute),error=>error.code==='ALGORITHM_SOURCE_CHANGED');assert.equal(project.data.algorithmRuns,undefined);assert.equal(executor.calls.length,1);
 const actual=JSON.parse(await fs.readFile(path.join(executor.calls[0].runDirectory,'result.json'),'utf8'));assert.equal(actual.status,'SUCCEEDED');assert.equal(actual.result.count,240);assert.deepEqual(actual.sourceBinding,input.source);
});

test('replacing the project during actual Python execution cannot attach an old run to the new project',async()=>{
 const project=await workspace(),input=request(project),executor=actualExecutor({onSpawn:()=>project.newProject()});
 await assert.rejects(runAlgorithm(project,input,executor.execute),error=>error.code==='ALGORITHM_SOURCE_CHANGED');assert.equal(project.data.images.length,0);assert.equal(project.data.algorithmRuns,undefined);assert.equal(project.data.events.some(e=>e.action==='algorithm_program_executed'),false);
 assert.equal(JSON.parse(await fs.readFile(path.join(executor.calls[0].runDirectory,'result.json'),'utf8')).status,'SUCCEEDED');
});

test('actual ROI and imaging-configuration edits during execution invalidate the program conditions even when project epoch and image pixels stay unchanged',async()=>{
 for(const change of [project=>project.setRegion(project.workflow.workpiece.id,[{x:9,y:8},{x:43,y:8},{x:43,y:38},{x:9,y:38}]),project=>project.setProfile({name:'Changed imaging configuration',pixelSizeUm:3.45,magnification:2})]){
  const project=await workspace();project.setRegion(project.workflow.workpiece.id,[{x:8,y:8},{x:42,y:8},{x:42,y:38},{x:8,y:38}]);const input=request(project),epoch=project.epoch,executor=actualExecutor({onSpawn:()=>change(project)});
  await assert.rejects(runAlgorithm(project,input,executor.execute),error=>error.code==='ALGORITHM_SOURCE_CHANGED');assert.equal(project.epoch,epoch,'ordinary domain edits do not bump project epoch');assert.equal(project.image.sha256,input.source.images[0].imageSha256);assert.equal(project.data.algorithmRuns,undefined);
  const actual=JSON.parse(await fs.readFile(path.join(executor.calls[0].runDirectory,'result.json'),'utf8'));assert.equal(actual.status,'SUCCEEDED');assert.equal(actual.result.count,240);assert.deepEqual(actual.sourceBinding,input.source);
 }
});

test('real Python failure and missing expected outputs remain diagnostic with traceback/partial artifacts available for repair',async()=>{
 const project=await workspace(),executor=actualExecutor(),code='save_image("mask", image, section="tool")\nraise RuntimeError("deliberate-algorithm-fixture-failure")\n';
 const failure=await runAlgorithm(project,request(project,{code}),executor.execute);assert.equal(failure.status,'FAILED');assert.equal(failure.evidenceAudit.status,'DIAGNOSTIC_ONLY');assert.equal(failure.evidenceAudit.delivered,false);assert.ok(failure.artifacts.some(a=>a.id==='mask'));assert.equal(failure.error.type,'RuntimeError');assert.match(failure.traceback,/deliberate-algorithm-fixture-failure/);assert.equal(await fs.readFile(path.join(failure.runDirectory,'traceback.txt'),'utf8'),failure.traceback);assert.equal(failure.code,code);
 const missing=await runAlgorithm(project,request(project,{expected_outputs:[...request(project).expected_outputs,{id:'not_produced',type:'image'}]}),executor.execute);assert.equal(missing.status,'SUCCEEDED');assert.equal(missing.evidenceAudit.status,'DIAGNOSTIC_ONLY');assert.ok(missing.evidenceAudit.errors.some(error=>error.path==='expected_outputs.not_produced'));assert.equal(project.data.algorithmRuns.length,2);
});

test('save/reopen preserves source history and Python program without executing or converting self-checks to acceptance',async()=>{
 const project=await workspace(),executor=actualExecutor(),run=await runAlgorithm(project,request(project),executor.execute),saved=JSON.parse(project.serialize()),loaded=new Workspace();await loaded.load(saved,decode);
 assert.equal(executor.calls.length,1);assert.equal(loaded.data.algorithmRuns.length,1);const restored=readAlgorithmRun(loaded,run.runId);assert.equal(restored.code,program);assert.deepEqual(restored.parameters,{red_floor:128});assert.deepEqual(restored.justification,run.justification);assert.equal(restored.stage,'TRIAL');assert.equal(restored.humanConfirmed,false);assert.equal(restored.evidenceAudit.delivered,false);assert.deepEqual(restored.artifacts.map(a=>a.sha256),run.artifacts.map(a=>a.sha256));
 loaded.pixels.get(loaded.image.id).gray[1]+=3;assert.equal(readAlgorithmRun(loaded,run.runId).current,false);
});

test('changed actual encoded color image bytes invalidate source even when SHA metadata and decoded grayscale cache are unchanged',async()=>{
 const original=imageFixture(),decoded=await loadImage(Buffer.from(original.split(',')[1],'base64')),canvas=createCanvas(decoded.width,decoded.height),ctx=canvas.getContext('2d');ctx.drawImage(decoded,0,0);ctx.fillStyle='rgb(250,1,230)';ctx.fillRect(0,0,1,1);const changed=canvas.toDataURL('image/png');assert.notEqual(changed,original);
 for(const timing of ['before-dispatch','during-execution']){
  const project=await workspace(),input=request(project),source=copy(input.source),executor=actualExecutor({onSpawn:timing==='during-execution'?()=>{project.image.dataURL=changed}:undefined});
  if(timing==='before-dispatch')project.image.dataURL=changed;
  await assert.rejects(runAlgorithm(project,input,executor.execute),error=>error.code===(timing==='before-dispatch'?'ALGORITHM_SOURCE_STALE':'ALGORITHM_SOURCE_CHANGED'));
  assert.equal(project.image.sha256,source.images[0].imageSha256);const current=algorithmContext(project).source;assert.equal(current.images[0].pixelFingerprint,source.images[0].pixelFingerprint);assert.notEqual(current.images[0].assetFingerprint,source.images[0].assetFingerprint);
  assert.equal(project.data.algorithmRuns,undefined);assert.equal(executor.calls.length,timing==='before-dispatch'?0:1);
  if(executor.calls.length){const actual=JSON.parse(await fs.readFile(path.join(executor.calls[0].runDirectory,'result.json'),'utf8'));assert.equal(actual.status,'SUCCEEDED');assert.equal(actual.result.count,240);assert.equal(actual.inputs[0].sha256,source.images[0].imageSha256)}
 }
});

test('historical run remains readable without a decoded raster and malformed imported run history rejects before replacing the original project',async()=>{
 const project=await workspace(),executor=actualExecutor(),run=await runAlgorithm(project,request(project),executor.execute),saved=JSON.parse(project.serialize()),before=JSON.stringify(project.data),id=project.image.id;
 for(const change of [data=>{data.algorithmRuns={}},data=>{delete data.algorithmRuns[0].code},data=>{data.algorithmRuns[0].sourceBinding.images='wrong-type'},data=>{data.algorithmRuns[0].artifacts[0].id=null}]){
  const bad=copy(saved);change(bad);await assert.rejects(project.load(bad,decode),/算法/);assert.equal(JSON.stringify(project.data),before);assert.equal(project.image.id,id);assert.equal(project.data.algorithmRuns[0].runId,run.runId);
 }
 project.pixels.delete(id);assert.equal(algorithmRunCurrent(project,run),true,'LRU eviction does not change verified original bytes');const history=readAlgorithmRun(project,run.runId);assert.equal(history.current,true);assert.equal(history.code,program);assert.equal(history.result.count,240);assert.equal(executor.calls.length,1);
});

test('actual Python PASS labels without observed values or malformed boundary collections remain diagnostic rather than complete evidence',async()=>{
 const project=await workspace(),executor=actualExecutor();
 for(const replacement of ["result['boundaryChecks'] = [{'id':'nonempty_foreground', 'status':'PASS'}]", "result['boundaryChecks'] = {'nonempty_foreground':'PASS'}"]){
  const run=await runAlgorithm(project,request(project,{code:program+'\n'+replacement+'\n'}),executor.execute);assert.equal(run.status,'SUCCEEDED');assert.equal(run.evidenceAudit.status,'DIAGNOSTIC_ONLY');assert.equal(run.evidenceAudit.delivered,false);assert.ok(run.evidenceAudit.errors.some(error=>error.path==='boundaries.0.check'));assert.equal(run.result.count,240);assert.ok(run.artifacts.some(artifact=>artifact.type==='image'));
 }
});

test('dense real Python data stays complete on disk and in project while compact model replies and explicit pages remain small and exact',async()=>{
 const project=await workspace(),executor=actualExecutor(),code=program+'\ndense = {"points": [[i, i*i] for i in range(10000)]}\nsave_json("dense", dense, section="parameters")\nresult["dense_points"] = dense["points"]',run=await runAlgorithm(project,request(project,{code,expected_outputs:[...request(project).expected_outputs,{id:'dense',type:'evidence'}]}),executor.execute);
 assert.equal(run.status,'SUCCEEDED');assert.equal(run.evidenceAudit.status,'READY_FOR_REVIEW');const original=JSON.stringify(project.data.algorithmRuns[0]),dense=run.artifacts.find(artifact=>artifact.id==='dense');assert.equal(dense.data.points.length,10000);assert.equal(run.result.dense_points.length,10000);
 const actualFile=JSON.parse(await fs.readFile(dense.path,'utf8'));assert.equal(actualFile.points.length,10000);assert.deepEqual(actualFile.points[9999],[9999,99980001]);assert.equal(await fs.readFile(path.join(run.runDirectory,'algorithm.py'),'utf8'),code);
 const compact=compactAlgorithmRun(run),compactDense=compact.artifacts.find(artifact=>artifact.id==='dense');assert.ok(Buffer.byteLength(JSON.stringify(compact))<20000,'model reply must not inline dense geometry');assert.equal(compactDense.data,undefined);assert.deepEqual(compactDense.dataSummary.keys,['points']);assert.equal(compact.result.dense_points.kind,'array');assert.equal(compact.result.dense_points.count,10000);assert.deepEqual(compact.result.dense_points.preview[0],[0,0]);assert.equal(compact.code,undefined);

 const page=readAlgorithmData(project,{runId:run.runId,artifactId:'dense',path:'points',offset:128,limit:3});assert.equal(page.type,'array');assert.equal(page.current,true);assert.equal(page.total,10000);assert.equal(page.count,3);assert.deepEqual(page.items,[[128,16384],[129,16641],[130,16900]]);assert.deepEqual(page.sourceBinding,run.sourceBinding);
 const resultPage=readAlgorithmData(project,{runId:run.runId,path:'result.dense_points',offset:9998,limit:5});assert.equal(resultPage.total,10000);assert.equal(resultPage.count,2);assert.deepEqual(resultPage.items,[[9998,99960004],[9999,99980001]]);
 const codePage=readAlgorithmData(project,{runId:run.runId,path:'code',offset:10,limit:32});assert.equal(codePage.type,'string');assert.equal(codePage.total,code.length);assert.equal(codePage.value,code.slice(10,42));assert.equal(codePage.count,32);
 for(const invalid of [{artifactId:'absent'},{artifactId:'dense',path:'points.missing'},{path:'__proto__'},{path:'constructor'},{path:'result.prototype'},{path:'code',offset:-1},{path:'code',limit:0},{path:'code',limit:16001}])assert.throws(()=>readAlgorithmData(project,{runId:run.runId,...invalid}));
 assert.equal(JSON.stringify(project.data.algorithmRuns[0]),original,'compaction and paging must not truncate or mutate the saved evidence');assert.deepEqual(JSON.parse(await fs.readFile(dense.path,'utf8')),actualFile);
});

test('host edge trial exposes explicit first/last policy with real PNG pixels and dynamically required rationale',async()=>{
 const project=await workspace({nested:true}),id=project.workflow.workpiece.id;project.setRegion(id,[{x:88,y:68},{x:332,y:68},{x:332,y:232},{x:88,y:232}]);project.addCheck({name:'width',kind:'width',targetId:id,unit:'px',min:240,max:270});project.buildRecipe({edges:{threshold:18,maxAngle:15,searchBand:28}});await project.runImage();
 for(const selection of ['first','last']){
  const options={intent:'scan',selection,scanDirection:'outside-in',contrastPolarity:'any'},context=getEdgeSearchContext(project,{imageId:project.image.id,targetIds:[id],...options});
  const requirements=[...context.requiredParameters,...context.optionalParameterRequirements.filter(row=>options[row.name]!==undefined)];
  const justification={tool:{reason:'工程師明確要求沿方向的第一或最後合格邊，直接在目前原圖真候選選序，保留其餘候選。',expectedEvidence:context.evidenceArtifacts.map(a=>({kind:'artifact',id:a.id,type:a.type}))},parameters:requirements.map(({name,source})=>({name,source,reason:`本次 ${name} 依明確掃描提案或沿用設定保存，與當次參數比較共同核對，不宣稱物件語義。`,verification:{kind:'artifact',id:'edge-parameter-comparison',type:'curves'}})),boundaries:context.gateIds.map(gate=>({condition:`本次 ${gate} 需有原圖實際支持；選序指令不能繞過固定品質與跨參數比較。`,check:{kind:'gate',id:gate},onFailure:'UNKNOWN'}))};
  await trialEdgeSearch(project,{imageId:project.image.id,targetIds:[id],...options,source:context.source,reason:'按工程師的顯式序位指令試跑，保留人工資料與品質設定。',justification});
  const measurement=project.image.result.targets[id].measurement;assert.equal(measurement.status,'MEASURED');assert.ok(Math.abs(measurement.width-(selection==='first'?260:244))<1);for(const edge of Object.values(measurement.edges)){assert.equal(edge.selection_policy.selection,selection);assert.equal(edge.selection_policy.scan.direction,'outside-in');assert.ok(edge.selection_policy.scanOrder.length>=2)}
 }
});

test('dense structured geometry is indexed in model replies while exact points remain readable',async()=>{
 const project=await workspace(),executor=actualExecutor();
 const code=program+`
with step('qa-data-size'):
    points=[{'x':i%int(image.shape[1]),'y':(i//int(image.shape[1]))%int(image.shape[0])} for i in range(10000)]
    save_layers('geometry',[{'id':'dense-pixel-index','objects':[{'id':'index','type':'polyline','geometry':{'points':points}}]}])
`;
 const run=await runAlgorithm(project,request(project,{code}),executor.execute);assert.equal(run.status,'SUCCEEDED',run.traceback);
 const original=JSON.stringify(run),compact=compactAlgorithmRun(run);
 assert.equal(run.structuredLayers[0].objects[0].geometry.points.length,10000);
 assert.ok(JSON.stringify(compact.structuredLayers).length<8000);
 const page=readAlgorithmData(project,{runId:run.runId,path:'structuredLayers.0.objects.0.geometry.points',offset:9998,limit:2});
 assert.equal(page.total,10000);assert.deepEqual(page.items,run.structuredLayers[0].objects[0].geometry.points.slice(9998));assert.equal(JSON.stringify(run),original);
});
