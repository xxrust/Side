import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {auditAlgorithmRun,algorithmCapabilities} from '../src/algorithm-workspace.js';
import {auditAlgorithmProcedureTrace} from '../src/algorithm-procedure-audit.js';
import {agentTools,systemPrompt} from '../src/agent-contract.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceImage=path.resolve(root,'../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg');
const imageBytes=await fs.readFile(sourceImage);
const why={tool:{reason:'原圖直接用Canny找高頻邊界，輸出實際邊緣供本次線索核對，未將邊緣當作工件身份。',expectedEvidence:[{kind:'artifact',type:'image',id:'edges'}]},parameters:[],boundaries:[{condition:'需要原圖有至少一個實際邊緣像素，無邊則保留未知。',check:{kind:'gate',id:'edge_support'},onFailure:'UNKNOWN'}]};
const code=`with procedure('inspect', name='檢查原圖邊緣', inputs={'image': image_records[0]['id']}, justification=parameters['why']) as p:
    with step('edges', name='邊緣計算', inputs={'image': image_records[0]['id']}, parameters={'low': 30}, justification=parameters['stepWhy']) as s:
        edges = cv2.Canny(image, 30, 90)
        save_image('edges', edges)
        check = {'id':'edge_support','status':'PASS' if np.count_nonzero(edges)>0 else 'FAIL','actual':int(np.count_nonzero(edges)),'threshold':1}
        s.set_output('boundaryChecks', [check])
        s.set_judgement('NG')
    p.set_output('boundaryChecks', [check])
result={'boundaryChecks':[check]}
`;
async function execute(stepWhy){
 const dir=await fs.mkdtemp(path.join(root,'runtime/procedure-audit-real-'));
 const input={runId:path.basename(dir),title:'Real Canny procedure evidence',code,parameters:{why,stepWhy},images:[{id:'opencv-stuff',name:'stuff.jpg',dataUrl:'data:image/jpeg;base64,'+imageBytes.toString('base64')}],sourceBinding:{images:[]},justification:why,expectedOutputs:[{id:'edges',type:'image'}]};
 const requestPath=path.join(dir,'request.json');await fs.writeFile(requestPath,JSON.stringify(input));
 const child=spawn(path.join(root,'runtime/python/bin/python3'),[path.join(root,'scripts/cv-runtime.py'),'--run',requestPath,dir],{cwd:dir,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);const exit=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});assert.equal(exit,0,err);
 const report=JSON.parse(await fs.readFile(JSON.parse(out.trim()).resultFile,'utf8'));return {...report,justification:why};
}
function stepRationale(){return {...structuredClone(why),parameters:[{name:'low',source:'agent-proposal',reason:'30是本次顯式試算值，尚未比較其他值，不宣稱最佳；以邊緣圖核對。',verification:{kind:'artifact',type:'image',id:'edges'}}]};}

test('real OpenCV steps retain NG separately from execution success and all triads resolve actual artifacts',async()=>{
 const run=await execute(stepRationale());assert.equal(run.status,'SUCCEEDED');assert.equal(run.procedureTrace.nodes[1].judgement,'NG');assert.equal(run.artifacts[0].traceNodeId,'edges#1');
 const audit=auditAlgorithmRun(run,[{id:'edges',type:'image'}]);assert.equal(audit.procedureStatus,'READY_FOR_REVIEW');assert.equal(audit.status,'READY_FOR_REVIEW');assert.equal(audit.delivered,false);assert.deepEqual(audit.errors,[]);
});
test('real execution without legacy step justification remains reviewable',async()=>{
 const run=await execute(null);assert.equal(run.status,'SUCCEEDED');assert.equal(run.artifacts.length,1);
 const audit=auditAlgorithmRun(run,[{id:'edges',type:'image'}]);assert.equal(audit.status,'READY_FOR_REVIEW');assert.equal(audit.procedureStatus,'READY_FOR_REVIEW');assert.deepEqual(audit.errors,[]);
});
test('missing parameter prose does not fabricate an execution error',async()=>{
 const input=stepRationale();input.parameters[0].reason='';const run=await execute(input);const audit=auditAlgorithmRun(run,[{id:'edges',type:'image'}]);assert.equal(audit.status,'READY_FOR_REVIEW');assert.deepEqual(audit.errors,[]);
});
test('legacy trace absent or empty is explicitly undecomposed and Pi receives same procedure contract',async()=>{
 for(const run of [{},{procedureTrace:{schema:'agentcv-procedure-trace-1',nodes:[]}}])assert.equal(auditAlgorithmProcedureTrace(run).status,'UNDECOMPOSED');
 const capabilities=algorithmCapabilities();assert.equal(capabilities.algorithmAllowlist,null);assert.match(capabilities.sdk.procedures,/with procedure/);assert.ok(systemPrompt.length<500);assert.match(await fs.readFile(root+'/agent-packages/agentcv-cv/skills/cv/references/execution.md','utf8'),/instanceId/);assert.match(agentTools.find(tool=>tool.function.name==='run_algorithm').function.description,/procedureTrace/);
});
