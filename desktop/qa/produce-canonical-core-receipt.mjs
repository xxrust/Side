// Actual framework integration receipt. No detector/model outputs are fabricated.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {Workspace} from '../src/workspace.js';
import {decodeBenchmarkImage} from '../scripts/agentcv-benchmark-batch.mjs';
import {runDatasetScheme} from '../src/algorithm-workspace.js';
const root=path.resolve(new URL('..',import.meta.url).pathname),out=path.resolve(root,'../codex-audit-logs/20261029-core-redesign');await fs.mkdir(out,{recursive:true});
const p=new Workspace();await p.addImages(await Promise.all(['box.png','box_in_scene.png'].map(async name=>({name,dataUrl:'data:image/png;base64,'+(await fs.readFile(path.resolve(root,'../research/opencv-traditional-10-2026-10-25/assets',name))).toString('base64')}))),decodeBenchmarkImage);
function why(id){const e={kind:'artifact',type:'evidence',id};return {tool:{reason:'這是框架整合驗證：直接讀取真實OpenCV範例原圖的像素尺寸與灰階統計，以驗證單件執行、上游產物引用及完整分支圖；沒有推定圖中工件的物理尺寸。',expectedEvidence:[e]},parameters:[],boundaries:[{condition:'只驗證明示的影像像素寬度分檔與資料依賴。兩張圖沒有人工產品答案；結果不能當成工業檢測準確度、尺寸公差或可部署證明。',check:e,onFailure:'UNKNOWN'}]};}
const node=(id,title,code,outputs)=>({id,title,code,parameters:{},expected_outputs:outputs,justification:why(outputs.find(o=>o.type==='evidence').id)});
const scheme={id:'framework-real-opencv-pixel-flow',version:1,execution:{unit:'workpiece',inputSlots:[{id:'image',required:true}]},classificationSpec:{schema:'agentcv-classification-spec-1',id:'explicit-framework-width-grades',provenance:[{type:'human',ref:'qa/produce-canonical-core-receipt.mjs: author explicitly defines synthetic-purpose pixel-width grades solely for framework integration; this is not a product requirement or independent image label',status:'confirmed'}],categories:[{id:'width-below-400',label:'框架分檔：原圖寬小於400px',quality:'good'},{id:'width-at-least-400',label:'框架分檔：原圖寬至少400px',quality:'good'},{id:'unavailable',label:'框架量測資料不可用',quality:'undetermined'}],metrics:[{id:'width',type:'number',unit:'px',range:{min:0,max:100000}}],rules:[{id:'lower-grade',categoryId:'width-below-400',when:{metric:'width',interval:{min:0,max:400,includeMin:true,includeMax:false}}},{id:'upper-grade',categoryId:'width-at-least-400',when:{metric:'width',interval:{min:400,max:100000,includeMin:true,includeMax:true}}}],coverage:{policy:'exhaustive'},missing:{NOT_FOUND:'unavailable',MISSING:'unavailable',SKIPPED:'unavailable'},conflicts:{mode:'priority',priority:['lower-grade','upper-grade']},aggregation:{mode:'all-good'},fault:{exit:'FAULT'}},operatorGraph:{nodes:[node('dimensions','讀取單件原圖尺寸',`def measure(s):
 value={"width":int(image.shape[1]),"height":int(image.shape[0]),"imageId":image_records[0]["id"]}
 save_json("dimensions",value)
 return found(value)
a=invoke("read-pixel-dimensions",measure,justification=${JSON.stringify(why("dimensions"))})
result={"valid":a.valid,**a.value}`,[{id:'dimensions',type:'evidence'}]),{...node('diagnostics','引用尺寸並觀察真實像素',`def inspect(s):
 value=upstream["measured"]["artifact"]["data"]
 observation={"width":value["width"],"height":value["height"],"grayMean":float(np.mean(gray)),"grayStd":float(np.std(gray)),"sourceImageId":image_records[0]["id"]}
 save_json("observation",observation)
 save_image("original-preview",image)
 return found(observation)
a=invoke("inspect-actual-pixels",inspect,justification=${JSON.stringify(why("observation"))})
result={"valid":a.valid,**a.value}`,[{id:'observation',type:'evidence'},{id:'original-preview',type:'image'}]),inputs:{measured:{nodeId:'dimensions',artifactId:'dimensions'}}},{...node('fallback','未找到時的替代尺寸讀取（本次未走）',`value={"width":int(raw_images[0].shape[1]),"height":int(raw_images[0].shape[0])}
save_json("fallback-dimensions",value)
result={"valid":True,**value}`,[{id:'fallback-dimensions',type:'evidence'}]),when:{nodeId:'dimensions',status:'NOT_FOUND'}}],edges:[{from:'dimensions',to:'diagnostics'},{from:'dimensions',to:'fallback'}]},metricBindings:[{metric:'width',nodeId:'diagnostics',path:'width'},{metric:'width',nodeId:'fallback',path:'width'}]};
const board=p.ensureProjectCanvas(),source=p.canvasProjectContext(board.id).sources[0];
p.addCanvasCard(board.id,{kind:'classification',sourceId:source.id,x:1220,y:40});p.addCanvasCard(board.id,{kind:'statistics',sourceId:source.id,x:1220,y:400});
const compiled=p.setPurposeScheme(scheme);if(!compiled.ok)throw Error(JSON.stringify(compiled.errors));
async function execute(request){const folder=path.join(out,'canonical-core-test-runs',randomUUID());await fs.mkdir(folder,{recursive:true});const input=path.join(folder,'request.json');await fs.writeFile(input,JSON.stringify({...request,runId:randomUUID()}));return new Promise((resolve,reject)=>{const child=spawn(path.join(root,'runtime/python/bin/python3'),[path.join(root,'scripts/cv-runtime.py'),'--run',input,folder],{env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});let stderr='';child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('close',async status=>{try{if(status)throw Error(stderr);resolve(JSON.parse(await fs.readFile(path.join(folder,'result.json'),'utf8')));}catch(error){reject(error);}});});}
const outcome=await runDatasetScheme(p,execute,{sourceId:source.id,units:p.data.images.map(image=>({id:'framework-unit-'+image.id,imageIds:[image.id]}))});
p.mutate('framework_validation_scope_recorded',()=>{p.data.name='框架驗證・真OpenCV逐件圖像依賴（非工業方案）';p.data.validationScope={kind:'framework-integration-only',producer:'qa/produce-canonical-core-receipt.mjs',images:p.data.images.map(i=>({imageId:i.id,name:i.name,contentSha256:i.contentSha256})),unitCount:2,independentProductLabels:0,accuracyValidated:false,branchScope:'dimensions and diagnostics actually executed per unit; fallback declared but not selected',thresholdOrigin:'400px is an explicit framework-only image-width grade, not a product tolerance or image-derived label'};});
const projectPath=path.join(out,'canonical-core-test.agentcv.json');await fs.writeFile(projectPath,p.serialize());await fs.writeFile(path.join(out,'canonical-core-test-receipt.json'),JSON.stringify({projectPath,scope:p.data.validationScope,compiled,execution:outcome.execution,runIds:p.data.algorithmRuns.map(r=>r.runId),actualStatuses:p.data.algorithmRuns.map(r=>({nodeId:r.schemeNodeId,runId:r.runId,status:r.status,source:r.sourceBinding.images,result:r.result,artifacts:r.artifacts.map(a=>({id:a.id,sha256:a.sha256,path:a.path}))}))},null,2));console.log(JSON.stringify({projectPath,units:outcome.execution.processed,actualRuns:p.data.algorithmRuns.length,executionStatus:outcome.execution.status,unlabelled:outcome.execution.counts.regression.unlabelled}));
