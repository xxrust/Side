// Re-executes the saved real Pi cover-localization scheme with actual Python /
// OpenCV and publishes genuine output pixels through the normal Agent facade.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {runPurposeScheme} from '../src/algorithm-workspace.js';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const root=path.resolve(import.meta.dirname,'..'),saved=path.join(root,'../codex-audit-logs/desktop-purpose-fix-evidence/project-headless.json');
async function python(request){
 const dir=await fs.mkdtemp(path.join(root,'runtime/agent-purpose-routing-')),file=path.join(dir,'request.json');await fs.writeFile(file,JSON.stringify({...request,runId:randomUUID()}));
 const child=spawn(path.join(root,'runtime/python/bin/python3'),[path.join(root,'scripts/cv-runtime.py'),'--run',file,dir],{cwd:dir,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',PYTHONDONTWRITEBYTECODE:'1'}});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);assert.equal(await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)}),0,stderr);return JSON.parse(await fs.readFile(JSON.parse(stdout.trim()).resultFile,'utf8'));
}
async function setup(){
 const h=await createHarness();await h.api.loadProject(h.w.JSON.parse(await fs.readFile(saved,'utf8')));const p=h.api.project,a=h.api.agent;for(const image of p.data.images)await p.ensureImagePixels(image.id);for(const node of p.purposeScheme.operatorGraph.nodes)for(const output of node.expected_outputs)if(output.id==='overlay')output.role='result';const compilation=p.setPurposeScheme(p.purposeScheme,{bindCurrentSources:true});assert.equal(compilation.ok,true,JSON.stringify(compilation.errors));
 const board=p.createInquiryBoard({title:'完整方案的實際問答來源'});for(const image of p.data.images)p.addInquiryImage(h.w.JSON.parse(JSON.stringify({kind:'original',label:image.name,dataURL:image.dataURL,width:image.width,height:image.height,source:{imageId:image.id,inputSha256:image.sha256,coordinateSpace:'original-image-pixels'}})),{boardId:board.id,actor:'human'});
 await h.api.inquiryView.open({boardId:board.id});a.busy=true;a.turn='actual-purpose-routing';a.turnEpoch=p.epoch;a.turnVisualBoardId=board.id;a.turnReference={kind:'visual_inquiry',snapshot:p.captureInquirySnapshot(board.id)};
 return {...h,p,a,boardId:board.id};
}

test('actual Agent whole-scheme execution returns metadata and places genuine node outputs on the original question board',async()=>{
 const h=await setup();try{const {p,a,api,boardId}=h,before=p.data.algorithmRuns.length,page=api.page;let other;
  a.ui.runPurposeScheme=async()=>{const result=await runPurposeScheme(p,python);other=p.createInquiryBoard({title:'執行完成後切到的另一畫板'});await api.inquiryView.open({boardId:other.id});return result};
  const response=await a.execute('run_purpose_scheme',{}),actual=p.data.algorithmRuns.slice(before);assert.equal(actual.length,1);assert.equal(actual[0].status,'SUCCEEDED');assert.equal(response.acceptance.status,'PASS');assert.equal(response.runs.length,actual.length);assert.equal(response.visual.boardId,boardId);assert.equal(response.visual.runs.length,actual.length);assert.equal(response.runs[0].code,undefined);assert.ok(!JSON.stringify(response).includes('data:image/'));
  const board=p.ensureInquiry().boards.find(b=>b.id===boardId),assets=board.items.map(item=>p.ensureInquiry().assets.find(asset=>asset.id===item.assetId));
  for(const run of actual){const originals=run.artifacts.filter(artifact=>artifact.type==='image'&&(artifact.dataUrl||artifact.dataURL));assert.ok(originals.length>0);assert.ok(assets.some(asset=>asset.source.runId===run.runId&&originals.some(artifact=>artifact.id===asset.source.artifactId)&&/^data:image\//.test(asset.dataURL)));assert.equal(run.code,p.purposeScheme.operatorGraph.nodes.find(n=>n.id===run.schemeNodeId).code,'full actual source remains saved in the project');}
  assert.equal(p.ensureInquiry().boards.find(b=>b.id===other.id).items.length,0);assert.equal(api.inquiryView.boardId,other.id,'publishing to the source board does not undo a deliberate board switch');assert.equal(api.page,page);
 }finally{h.close()}
});

test('stopping the source conversation after genuine scheme calculation prevents later canvas publication and preserves run facts',async()=>{
 const h=await setup();try{const {p,a,boardId}=h,before=p.data.algorithmRuns.length,items=p.ensureInquiry().boards.find(b=>b.id===boardId).items.length;
  a.ui.runPurposeScheme=async()=>{const result=await runPurposeScheme(p,python);a.turn=null;return result};
  await assert.rejects(a.execute('run_purpose_scheme',{}),/對話已停止或專案已變更/);assert.equal(p.data.algorithmRuns.length,before+1);assert.equal(p.data.algorithmRuns.at(-1).status,'SUCCEEDED');assert.ok(p.data.algorithmRuns.at(-1).artifacts.some(artifact=>artifact.type==='image'&&/^data:image\//.test(artifact.dataUrl||artifact.dataURL)));assert.equal(p.ensureInquiry().boards.find(b=>b.id===boardId).items.length,items);
 }finally{h.close()}
});
