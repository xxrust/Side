import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {Workspace} from '../src/workspace.js';
import {compileWorkpiecePlan} from '../src/workpiece-plan.js';
import {runDatasetScheme} from '../src/workpiece-runner.js';
import {algorithmContext,runAlgorithm} from '../src/algorithm-workspace.js';
import {decodeBenchmarkImage} from '../scripts/agentcv-benchmark-batch.mjs';
const root=path.resolve(import.meta.dirname,'..'),temp=await fs.mkdtemp(path.join(os.tmpdir(),'cv-data-contract-'));
const coordinates={frame:{kind:'input',slot:'image'},unit:'px'},contours={kind:'contours',coordinates};
const why=id=>({tool:{reason:'用真實 OpenCV 原圖驗證資料契約與傳遞；不推定工件合格率。',expectedEvidence:[{kind:'artifact',type:'evidence',id}]},parameters:[],boundaries:[{condition:'分割結果可能為空，需保留正常未找到狀態。',check:{kind:'artifact',type:'evidence',id},onFailure:'UNKNOWN'}]});
function scheme(){return {id:'opencv-contours-contract',execution:{unit:'workpiece',inputSlots:[{id:'image',required:true}],dataContracts:'required'},operatorGraph:{nodes:[
 {id:'segment',title:'輪廓抽取',parameters:{},justification:why('contours'),expected_outputs:[{id:'mask',type:'image',dataContract:{kind:'mask',coordinates}},{id:'contours',type:'evidence',dataContract:contours}],code:`_,mask=cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
curves,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
save_image("mask",mask)
save_json("contours",{"coordinates":${JSON.stringify(coordinates)},"contours":[[{"x":int(p[0]),"y":int(p[1])} for p in c.reshape(-1,2)] for c in curves]})
result={"valid":True}`},
 {id:'measure',title:'輪廓面積',parameters:{},justification:why('area'),inputs:{curves:{nodeId:'segment',artifactId:'contours',dataContract:contours}},expected_outputs:[{id:'area',type:'evidence',dataContract:{kind:'measurement',unit:'px2'}}],code:`curves=upstream["curves"]["artifact"]["data"]["contours"]
area=float(sum(cv2.contourArea(np.array([[p["x"],p["y"]] for p in c],dtype=np.float32)) for c in curves))
save_json("area",{"value":area,"unit":"px2"})
result={"valid":True,"present":area>0}`}
 ],edges:[{from:'segment',to:'measure'}]},metricBindings:[{metric:'present',nodeId:'measure',path:'present'}],classificationSpec:{schema:'agentcv-classification-spec-1',id:'contour-presence',provenance:[{type:'human',status:'confirmed',ref:'QA authored presence criterion only; not product acceptance'}],categories:[{id:'present',label:'有輪廓',quality:'good'},{id:'absent',label:'無輪廓',quality:'bad'}],metrics:[{id:'present',type:'boolean'}],rules:[{id:'yes',categoryId:'present',when:{metric:'present',equals:true}},{id:'no',categoryId:'absent',when:{metric:'present',equals:false}}],coverage:{policy:'exhaustive'},missing:{NOT_FOUND:'absent',MISSING:'absent',SKIPPED:'absent'},conflicts:{mode:'priority',priority:['yes','no']},aggregation:{mode:'priority',priority:['absent','present']},fault:{exit:'FAULT'}}};}
async function project(){const p=new Workspace();for(const name of ['box.png','box_in_scene.png'])await p.addImages([{name,dataUrl:'data:image/png;base64,'+(await fs.readFile(path.join(root,'../research/opencv-traditional-10-2026-10-25/assets',name))).toString('base64')}],decodeBenchmarkImage);p.data.purposeScheme=scheme();return p;}
async function execute(request){const dir=await fs.mkdtemp(path.join(temp,'run-'));await fs.writeFile(dir+'/request.json',JSON.stringify({...request,runId:randomUUID()}));await new Promise((resolve,reject)=>{const p=spawn(root+'/runtime/python/bin/python3',[root+'/scripts/cv-runtime.py','--run',dir+'/request.json',dir],{env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});let err='';p.stderr.on('data',v=>err+=v);p.on('error',reject);p.on('exit',c=>c?reject(Error(err)):resolve());});return JSON.parse(await fs.readFile(dir+'/result.json','utf8'));}
test('compiler rejects type, coordinate, unit and unavailable-frame mismatch; legacy coverage is explicit',()=>{
 assert.equal(compileWorkpiecePlan(scheme()).ok,true);
 for(const change of [c=>c.kind='points',c=>c.coordinates.unit='mm',c=>c.coordinates.frame.slot='other-camera']){const s=scheme();s.operatorGraph.nodes[1].inputs.curves.dataContract=structuredClone(contours);change(s.operatorGraph.nodes[1].inputs.curves.dataContract);const c=compileWorkpiecePlan(s);assert.equal(c.ok,false);assert.ok(c.errors.some(e=>e.code==='DATA_CONTRACT_MISMATCH'));}
 const s=scheme();delete s.operatorGraph.nodes[0].expected_outputs[0].dataContract;assert.ok(compileWorkpiecePlan(s).errors.some(e=>e.code==='DATA_CONTRACT_MISSING'));s.execution.dataContracts='legacy';const c=compileWorkpiecePlan(s);assert.equal(c.ok,true);assert.ok(c.warnings.some(e=>e.code==='DATA_CONTRACT_MISSING'));
 s.operatorGraph.nodes[0].expected_outputs[0].dataContract={kind:'measurement',unit:'px'};assert.ok(compileWorkpiecePlan(s).errors.some(e=>e.code==='DATA_TRANSPORT_MISMATCH'));
});
test('actual OpenCV threshold/contours/area pass explicit contracts and preserve same-unit frame provenance',async()=>{
 const p=await project(),r=await runDatasetScheme(p,execute);assert.equal(r.execution.counts.execution.FAULT,0);assert.equal(r.execution.processed,2);assert.equal(p.data.algorithmRuns.length,4);
 for(const run of p.data.algorithmRuns){assert.equal(run.dataContractAudit.valid,true,JSON.stringify(run.dataContractAudit.errors));assert.equal(run.execution.status,'COMPLETED');assert.equal(run.dataContractAudit.untyped,0);}
 for(const run of p.data.algorithmRuns.filter(r=>r.schemeNodeId==='segment')){const mask=run.artifacts.find(a=>a.id==='mask');assert.equal(mask.binary,true);assert.equal(mask.channels,1);const b=run.dataContractAudit.bindings.contours.frames[0];assert.equal(b.imageId,run.workpieceUnit.imageIds[0]);assert.ok(b.contentSha256);}
 const consumer=p.data.algorithmRuns.at(-1);assert.equal(consumer.upstreamBindings.curves.runId,p.data.algorithmRuns.at(-2).runId);assert.ok(consumer.artifacts[0].data.value>0);
});
test('actual malformed geometry is execution FAULT, downstream blocked, next workpiece still executes',async()=>{
 const p=await project(),node=p.data.purposeScheme.operatorGraph.nodes[0];node.code=node.code.replace(JSON.stringify(coordinates),`{"frame":{"kind":"input","slot":"image"},"unit":"mm" if image.shape[1]==324 else "px"}`);
 const r=await runDatasetScheme(p,execute);assert.deepEqual(r.execution.counts.execution,{COMPLETED:1,FAULT:1,CANCELLED:0});assert.equal(r.execution.units[0].result.status,'FAULT');assert.equal(r.execution.units[0].nodeStates[1].status,'SKIPPED');assert.deepEqual(r.execution.units[1].result.categoryIds,['present']);
 const failed=p.data.algorithmRuns[0];assert.equal(failed.status,'SUCCEEDED','Python process completed; platform rejects its data');assert.equal(failed.execution.reason,'OUTPUT_CONTRACT_VIOLATION');assert.equal(failed.evidenceAudit.status,'DIAGNOSTIC_ONLY');assert.ok(failed.evidenceAudit.errors.some(e=>e.code==='DATA_COORDINATES_MISMATCH'));assert.ok(failed.execution.errors.some(e=>e.code==='DATA_COORDINATES_MISMATCH'&&e.path&&e.hint));
 const out=path.join(root,'../codex-audit-logs/20261102-agent-harness');await fs.mkdir(out,{recursive:true});await fs.writeFile(out+'/data-contract-runtime.json',JSON.stringify({scope:'Real OpenCV images and Python; deliberately wrong geometry unit only on first image tests rejection and subsequent-unit recovery.',execution:r.execution,runs:p.data.algorithmRuns.map(({runId,schemeNodeId,status,execution,dataContractAudit})=>({runId,schemeNodeId,status,execution,dataContractAudit}))},null,2));
});
test('actual mask image pixels must be binary and a resized image cannot pretend to retain its original raster frame',async()=>{
 for(const code of ['save_image("mask",gray)','save_image("mask",mask[:10,:10])']){const p=await project();p.data.purposeScheme.operatorGraph.nodes[0].code=p.data.purposeScheme.operatorGraph.nodes[0].code.replace('save_image("mask",mask)',code);await runDatasetScheme(p,execute,{units:[{id:'bad-mask',imageIds:[p.data.images[0].id]}]});assert.equal(p.data.algorithmRuns[0].execution.reason,'OUTPUT_CONTRACT_VIOLATION');assert.ok(p.data.algorithmRuns[0].dataContractAudit.errors.some(e=>e.code===(code.includes('gray')?'DATA_MASK_INVALID':'DATA_IMAGE_FRAME_SIZE_MISMATCH')));}
});
test('normal NOT_FOUND can omit output without fabricating measurements or becoming a fault',async()=>{const p=await project();p.data.purposeScheme.operatorGraph.nodes[0].code='result={"valid":False,"reason":"No accepted candidates in this explicitly rejected test"}';const r=await runDatasetScheme(p,execute,{units:[{id:'no-candidate',imageIds:[p.data.images[0].id]}]});assert.equal(r.execution.counts.execution.FAULT,0);assert.deepEqual(r.execution.units[0].result.categoryIds,['absent']);assert.equal(p.data.algorithmRuns[0].dataContractAudit.valid,true);});

test('direct node execution cannot bypass the same-workpiece upstream resolver with a historical run',async()=>{
 const p=await project();await runDatasetScheme(p,execute,{units:[{id:'prior-unit',imageIds:[p.data.images[0].id]}]});
 const node=p.purposeScheme.operatorGraph.nodes[1],context=algorithmContext(p,{imageIds:[p.data.images[0].id]}),parent=p.data.algorithmRuns[0];let dispatched=0;
 await assert.rejects(runAlgorithm(p,{mode:'scheme',scheme_node_id:node.id,title:node.title,code:node.code,parameters_json:'{}',image_ids:[p.data.images[0].id],source:context.source,expected_outputs:node.expected_outputs,justification:{...node.justification,meta:{sourceFingerprint:context.sourceFingerprint}},workpieceUnit:{id:'next-unit',imageIds:[p.data.images[0].id],views:null},upstream:{curves:{nodeId:parent.schemeNodeId,runId:parent.runId,artifact:parent.artifacts.find(a=>a.id==='contours')}}},request=>{dispatched++;return execute(request)}),e=>e.code==='ALGORITHM_UPSTREAM_UNAVAILABLE'&&e.errors[0].hint.includes('run_workpiece_scheme'));
 assert.equal(dispatched,0);
});
test('resized image owns a new frame and downstream geometry retains its actual producer binding',async()=>{
 const p=await project(),s=p.purposeScheme,own={frame:{kind:'artifact',nodeId:'segment',artifactId:'mask'},unit:'px'};
 s.operatorGraph.nodes[0].expected_outputs=s.operatorGraph.nodes[0].expected_outputs.map(o=>({...o,dataContract:{...o.dataContract,coordinates:own}}));
 s.operatorGraph.nodes[0].code=s.operatorGraph.nodes[0].code.replace('curves,_=', 'mask=cv2.resize(mask,(100,80),interpolation=cv2.INTER_NEAREST)\ncurves,_=').replace(JSON.stringify(coordinates),JSON.stringify(own));
 s.operatorGraph.nodes[1].inputs.curves.dataContract={kind:'contours',coordinates:own};
 s.operatorGraph.nodes[1].expected_outputs.push({id:'retained-curves',type:'evidence',dataContract:{kind:'contours',coordinates:own}});
 s.operatorGraph.nodes[1].code+='\nsave_json("retained-curves",upstream["curves"]["artifact"]["data"])';
 assert.equal(compileWorkpiecePlan(s).ok,true,JSON.stringify(compileWorkpiecePlan(s).errors));
 const r=await runDatasetScheme(p,execute,{units:[{id:'resized',imageIds:[p.data.images[0].id]}]});assert.equal(r.execution.counts.execution.FAULT,0);
 const binding=p.data.algorithmRuns.at(-1).dataContractAudit.bindings['retained-curves'].frames[0];assert.equal(binding.runId,p.data.algorithmRuns[0].runId);assert.equal(binding.width,100);assert.equal(binding.height,80);
});
test('real OpenCV homography has declared frames; a zero matrix is rejected without changing classification into normal NG',async()=>{
 const p=await project(),node=p.purposeScheme.operatorGraph.nodes[0];node.expected_outputs.push({id:'transform',type:'evidence',dataContract:{kind:'homography',from:coordinates,to:coordinates}});
 node.code+=`\ncorners=np.float32([[0,0],[image.shape[1]-1,0],[image.shape[1]-1,image.shape[0]-1],[0,image.shape[0]-1]])
m=cv2.getPerspectiveTransform(corners,corners)
save_json("transform",{"from":${JSON.stringify(coordinates)},"to":${JSON.stringify(coordinates)},"matrix":m.tolist()})`;
 let r=await runDatasetScheme(p,execute,{units:[{id:'real-identity',imageIds:[p.data.images[0].id]}]});assert.equal(r.execution.counts.execution.FAULT,0);
 node.code=node.code.replace('"matrix":m.tolist()','"matrix":np.zeros_like(m).tolist()');r=await runDatasetScheme(p,execute,{units:[{id:'deliberately-degenerate',imageIds:[p.data.images[0].id]}]});assert.equal(r.execution.counts.execution.FAULT,1);assert.ok(p.data.algorithmRuns.at(-1).dataContractAudit.errors.some(e=>e.code==='DATA_TRANSFORM_DEGENERATE'));
});
