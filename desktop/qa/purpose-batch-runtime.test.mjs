// Actual supplied OpenCV PNGs -> actual Python process -> same Workspace facade.
// The test purpose classifies recorded image width; no detector results are mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Workspace} from '../src/workspace.js';
import {runPurposeScheme,algorithmRunCurrent} from '../src/algorithm-workspace.js';
import {createScheme,evaluatePurposeRule,compileScheme} from '../src/purpose-compiler.js';
const require=createRequire(import.meta.url),{loadImage,createCanvas}=require('../../qa/node_modules/@napi-rs/canvas');
const root=path.resolve(new URL('..',import.meta.url).pathname),dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-purpose-batch-'));
async function decode(dataUrl){const bytes=Buffer.from(dataUrl.split(',')[1],'base64'),image=await loadImage(bytes),c=createCanvas(image.width,image.height),ctx=c.getContext('2d');ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,image.width,image.height).data,gray=Float32Array.from({length:image.width*image.height},(_,i)=>rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114);return {width:image.width,height:image.height,gray,rgba,sha256:createHash('sha256').update(bytes).digest('hex')}}
async function project(){const p=new Workspace(),names=['box.png','box_in_scene.png'];await p.addImages(await Promise.all(names.map(async name=>({name,dataUrl:'data:image/png;base64,'+(await fs.readFile(path.join(root,'../research/opencv-traditional-10-2026-10-25/assets',name))).toString('base64')}))),decode);for(const image of p.data.images)await p.ensureImagePixels(image.id);return p;}
const evidence=id=>({kind:'artifact',type:'evidence',id});
function justification(id,params={}){return {tool:{reason:'直接讀取已解碼原圖的實際尺寸，這個目的不需要猜測物件外觀。',expectedEvidence:[evidence(id)]},parameters:Object.keys(params).map(name=>({name,source:'agent-proposal',reason:'此測試由人工明確要求像素寬度門檻，不是由圖片答案反推。',verification:evidence(id)})),boundaries:[{condition:'只判定已解碼原圖的像素尺寸，不宣稱物件物理尺寸或工業精度。',check:evidence(id),onFailure:'UNKNOWN'}]};}
function scheme(p,{invalidRows=false,single=false}={}){
 const s=createScheme('real-image-dataset'),id='pixel-width';s.purposeCard={id:'purpose',schemeId:s.id,kind:'classify',items:[{id,label:'原圖寬度至少400像素',output:'ok_ng',rule:{pass_when:{metric:'width',min:400}},sources:[{type:'human',ref:'qa/purpose-batch-runtime.test.mjs: explicit width>=400 test requirement'}]}]};
 s.imagingConstraintCard={id:'imaging',schemeId:s.id,linkedPurposeId:'purpose',calibrationRequired:false,lightingNotes:'讀檔尺寸，未推定鏡頭倍率或物理尺度。'};
 s.acceptanceCard={id:'acceptance',schemeId:s.id,linkedPurposeId:'purpose',cases:p.data.images.map(image=>({id:image.id,imageRef:image.id,type:image.width>=400?'positive':'negative',expectedOutputs:{[id]:image.width>=400?'OK':'NG'}}))};
 const common={op:'programmable-python',image_ids:p.data.images.map(i=>i.id),outputContract:{classification:'OK|NG',case_outputs:'cases',case_image_id:'imageId'}};
 s.operatorGraph={nodes:[{...common,id:'dimensions',title:'讀取原圖尺寸',parameters:{},code:'rows=[{"imageId":r["id"],"width":int(im.shape[1]),"height":int(im.shape[0])} for im,r in zip(images,image_records)]\nsave_json("dimensions",{"cases":rows})\nresult={"rowCount":len(rows)}',expected_outputs:[{id:'dimensions',type:'evidence'}],justification:justification('dimensions')},{...common,id:'decision',title:'依人工尺寸規則逐圖判定',inputs:{sizes:{nodeId:'dimensions',artifactId:'dimensions'}},parameters:{min_width:400},code:'rows=upstream["sizes"]["artifact"]["data"]["cases"]\nfor row in rows:\n row["classification"]="OK" if row["width"]>=parameters["min_width"] else "NG"\n'+(invalidRows?'rows.append(dict(rows[0]))\n':'')+'save_json("decision",{"cases":rows})\nresult={"rowCount":len(rows)}',expected_outputs:[{id:'decision',type:'evidence'}],justification:justification('decision',{min_width:400})}],edges:[{from:'dimensions',to:'decision'}]};s.evidenceBindings=[{purposeItemId:id,operatorNodeId:'decision',evidenceArtifactId:'decision'}];
 if(single){s.acceptanceCard.cases=s.acceptanceCard.cases.slice(0,1);for(const n of s.operatorGraph.nodes)n.image_ids=n.image_ids.slice(0,1)}return s;
}
async function execute(request){const folder=await fs.mkdtemp(path.join(dir,'run-')),requestPath=path.join(folder,'request.json');await fs.writeFile(requestPath,JSON.stringify({...request,runId:randomUUID()}));return new Promise((resolve,reject)=>{const child=spawn(path.join(root,'runtime/python/bin/python3'),[path.join(root,'scripts/cv-runtime.py'),'--run',requestPath,folder],{cwd:folder,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',async code=>{try{if(code)throw Error(stderr);resolve(JSON.parse(await fs.readFile(JSON.parse(stdout).resultFile,'utf8')))}catch(e){reject(e)}})});}
test('real dataset runs explicit graph dependencies and compares each image separately',async()=>{
 const p=await project(),saved=p.setPurposeScheme(scheme(p),{bindCurrentSources:true});assert.equal(saved.ok,true,JSON.stringify(saved.errors));
 const result=await runPurposeScheme(p,execute);assert.equal(result.runs.length,2);assert.ok(result.runs.every(r=>r.status==='SUCCEEDED'&&algorithmRunCurrent(p,r)));
 assert.equal(result.acceptance.status,'PASS');assert.deepEqual(result.acceptance.judgement.counts,{OK:1,NG:1,UNKNOWN:0});assert.deepEqual(result.acceptance.cases.map(c=>c.status),['PASS','PASS']);
 assert.deepEqual(result.acceptance.cases.map(c=>c.classification),['NG','OK']);assert.equal(result.runs[1].upstreamBindings.sizes.runId,result.runs[0].runId);
 assert.equal(result.acceptance.delivered,false);assert.equal(result.acceptance.humanConfirmed,false);
});
test('duplicate per-image rows stay UNKNOWN rather than applying another image verdict',async()=>{
 const p=await project();p.setPurposeScheme(scheme(p,{invalidRows:true}),{bindCurrentSources:true});const result=await runPurposeScheme(p,execute);
 assert.equal(result.acceptance.status,'NOT_ACCEPTED');assert.equal(result.acceptance.judgement.counts.UNKNOWN,2);assert.ok(result.acceptance.cases.every(c=>c.status==='NOT_EVALUATED'&&c.reason==='BATCH_IMAGE_BINDING_INVALID'));
});
test('changed source blocks every dispatch; logical rules retain UNKNOWN',async()=>{
 const p=await project();p.setPurposeScheme(scheme(p),{bindCurrentSources:true});p.pixels.get(p.data.images[0].id).gray[0]+=1;let called=0;
 await assert.rejects(runPurposeScheme(p,async()=>{called++;throw Error('must not dispatch')}),e=>e.code==='ALGORITHM_SOURCE_STALE');assert.equal(called,0);
 assert.equal(evaluatePurposeRule({not:{metric:'missing',equals:true}},{}),null);assert.equal(evaluatePurposeRule({any:[{metric:'n',equals:2},{metric:'missing',min:1}]},{n:2}),true);assert.equal(evaluatePurposeRule({all:[{metric:'n',equals:2},{metric:'missing',min:1}]},{n:2}),null);
});
test('capabilities teach exact rules and explicit source binding; single-image graph stays supported',async()=>{
 const p=await project(),cap=p.purposeSchemeCapabilities();assert.equal(cap.images.length,2);assert.match(cap.batch.contract,/per-image/);assert.match(cap.authoring.sourceBinding,/bind_current_sources/);
 p.setPurposeScheme(scheme(p,{single:true}),{bindCurrentSources:true});assert.equal(compileScheme(p.purposeScheme).ok,true);const result=await runPurposeScheme(p,execute);assert.equal(result.acceptance.status,'PASS');assert.equal(result.acceptance.judgement.images.length,1);
});

test('saved real template-plus-scene cover scheme retains its one target case',async()=>{
 const data=JSON.parse(await fs.readFile(path.join(root,'../codex-audit-logs/desktop-purpose-fix-evidence/project-headless.json'),'utf8'));
 const p=new Workspace();await p.load(data,decode);for(const image of p.data.images)await p.ensureImagePixels(image.id);p.setPurposeScheme(p.purposeScheme,{bindCurrentSources:true});
 const result=await runPurposeScheme(p,execute);assert.equal(result.runs.length,1);assert.equal(result.runs[0].status,'SUCCEEDED');assert.equal(result.acceptance.status,'PASS');assert.equal(result.acceptance.judgement.images.length,1);assert.equal(result.acceptance.judgement.classification,'OK');
});
test('failed upstream blocks dependent execution while leaving truthful UNKNOWN cases',async()=>{
 const p=await project(),s=scheme(p);s.operatorGraph.nodes[0].code='raise RuntimeError("Deliberate runtime failure to verify dependency handling")';p.setPurposeScheme(s,{bindCurrentSources:true});const result=await runPurposeScheme(p,execute);
 assert.equal(result.runs.length,1);assert.equal(result.runs[0].status,'FAILED');assert.equal(result.acceptance.blockedNodes[0].nodeId,'decision');assert.equal(result.acceptance.judgement.counts.UNKNOWN,2);assert.equal(result.acceptance.status,'NOT_ACCEPTED');
});
test('per-image applicability failure propagates through graph dependencies',async()=>{
 const p=await project(),s=scheme(p);s.operatorGraph.nodes[0].justification.boundaries[0].pass_when={metric:'height',min:300};p.setPurposeScheme(s,{bindCurrentSources:true});const result=await runPurposeScheme(p,execute);
 assert.equal(result.runs.length,2);assert.deepEqual(result.acceptance.judgement.counts,{OK:1,NG:0,UNKNOWN:1});assert.deepEqual(result.acceptance.cases.map(c=>c.status),['NOT_EVALUATED','PASS']);
});
test('multi-target scalar output cannot be reused as every case classification',async()=>{
 const p=await project(),s=scheme(p);s.operatorGraph.nodes=s.operatorGraph.nodes.slice(0,1);s.operatorGraph.edges=[];const node=s.operatorGraph.nodes[0];delete node.outputContract.case_outputs;node.code='save_json("dimensions",{"classification":"OK","width":int(image.shape[1])})';s.evidenceBindings[0]={...s.evidenceBindings[0],operatorNodeId:'dimensions',evidenceArtifactId:'dimensions'};p.setPurposeScheme(s,{bindCurrentSources:true});const result=await runPurposeScheme(p,execute);
 assert.equal(result.acceptance.judgement.counts.UNKNOWN,2);assert.ok(result.acceptance.cases.every(c=>c.reason==='BATCH_OUTPUT_CONTRACT_REQUIRED'&&c.status==='NOT_EVALUATED'));
});
