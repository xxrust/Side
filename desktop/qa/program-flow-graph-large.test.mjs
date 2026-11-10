import {bindCurrentAlgorithmRequest} from './current-algorithm-request.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {runAlgorithm as actualRunAlgorithm,algorithmContext} from '../src/algorithm-workspace.js';
import {buildProgramFlow} from '../src/program-flow.js';
import {layoutProgramFlow} from '../src/program-flow-layout.js';
const root=path.resolve(import.meta.dirname,'..'),out=root+'/../reviews/2026-10-27-flow-graph';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const code=`
with procedure('batch', name='真實CV重複計算：版面壓力驗證') as batch:
    for i in range(12):
        with procedure('candidate', name='實算候選 '+str(i+1), depends_on=['candidate'] if i else []) as p:
            with step('smooth', name='平滑 '+str(i+1)) as s:
                blurred=cv2.GaussianBlur(gray,(3,3),0.6+i*0.1)
                s.set_output('gray_mean',float(blurred.mean()))
                s.set_judgement('UNKNOWN')
            with step('edges', name='邊緣 '+str(i+1), depends_on=['smooth']) as s:
                edge=cv2.Canny(blurred,20+i*3,80+i*3)
                s.set_output('edge_pixels',int(np.count_nonzero(edge)))
                s.set_judgement('UNKNOWN')
                if i==0:save_image('first_edges',edge)
            p.set_judgement('UNKNOWN')
    batch.set_judgement('UNKNOWN')
result={'boundaryChecks':[{'id':'layout_only','status':'NOT_EVALUATED','actual':12,'threshold':'layout exercise, no industrial claim'}]}
`;
async function execute(request){const dir=await fs.mkdtemp(root+'/runtime/large-graph-real-'),requestPath=dir+'/request.json';await fs.writeFile(requestPath,JSON.stringify({...request,runId:randomUUID()}));const c=spawn(root+'/runtime/python/bin/python3',[root+'/scripts/cv-runtime.py','--run',requestPath,dir],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});let stdout='',stderr='';c.stdout.on('data',b=>stdout+=b);c.stderr.on('data',b=>stderr+=b);assert.equal(await new Promise((resolve,reject)=>{c.on('error',reject);c.on('close',resolve)}),0,stderr);return JSON.parse(await fs.readFile(JSON.parse(stdout.trim()).resultFile,'utf8'));}

test('a real OpenCV execution with 37 recorded units retains every instance, group dependency and node board without pages',async()=>{
 const h=await createHarness();try{
  await h.api.addImages([{name:'stuff.jpg',dataUrl:'data:image/jpeg;base64,'+(await fs.readFile(root+'/../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg')).toString('base64')}]);await h.api.go(6);const p=h.api.project;
  const run=await runAlgorithm(p,{title:'版面壓力驗證（真實CV計算，非檢測方案）',code,parameters_json:'{}',source:algorithmContext(p).source,expected_outputs:[{id:'first_edges',type:'image'}],justification:{tool:{reason:'僅以真實重複平滑與邊緣計算驗證大量程序版面及身分保留，沒有工業判定。',expectedEvidence:[{kind:'artifact',type:'image',id:'first_edges'}]},parameters:[],boundaries:[{condition:'這是版面驗證，不將計算成功宣稱為檢測準確。',check:{kind:'gate',id:'layout_only'},onFailure:'UNKNOWN'}]}},execute);
  assert.equal(run.status,'SUCCEEDED');assert.equal(run.procedureTrace.nodes.length,37);assert.equal(run.evidenceAudit.status,'DIAGNOSTIC_ONLY');
  const flow=buildProgramFlow(p,{runId:run.runId}),layout=await layoutProgramFlow(flow);assert.equal(layout.nodes.length,24);assert.equal(layout.groups.length,13);assert.equal(layout.edges.length,23);assert.equal(new Set([...layout.nodes,...layout.groups].map(n=>n.id)).size,37);assert.ok(layout.nodes.every(n=>n.judgement==='UNKNOWN'));assert.ok(layout.edges.every(e=>e.points.length>=2));
  const v=h.api.inquiryView,f=v.programFlow;v.render();await f.map.ready;assert.equal(h.w.document.querySelectorAll('.program-flow-map [data-program-node]').length,13);h.w.document.querySelector('[aria-label="展開／收起內部算子"]').click();await f.map.ready;assert.equal(h.w.document.querySelectorAll('.program-flow-map [data-program-node]').length,37);assert.equal(h.w.document.querySelectorAll('.program-pager,.program-node-list').length,0);
  const last=run.runId+'::edges#12';await f.openNode(last);await f.map.ready;assert.equal(v.board().programBinding.nodeId,last);assert.equal(f.map.selectedId,last);assert.ok(p.pixels.get(p.image.id).gray.length>0);
  await fs.mkdir(out,{recursive:true});await fs.writeFile(out+'/large-real-workspace.agentcv.json',JSON.stringify({...p.data,workspaceView:{page:h.api.page,boardId:v.boardId,zoom:v.zoom,pan:{...v.pan}}}));await fs.writeFile(out+'/large-real-execution.json',JSON.stringify({scope:'37 actual OpenCV/SDK units; layout test only, no industrial claim',runId:run.runId,units:37,leaves:24,groups:13,dependencies:23,status:run.status,evidenceStatus:run.evidenceAudit.status},null,2));
 }finally{h.close();}
});

function runAlgorithm(project,args,execute){return actualRunAlgorithm(project,bindCurrentAlgorithmRequest(args,algorithmContext(project,{imageIds:args.image_ids})),execute)}
