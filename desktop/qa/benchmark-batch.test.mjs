import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runBenchmarkBatch,validateBenchmarkManifest,decodeBenchmarkImage} from '../scripts/agentcv-benchmark-batch.mjs';
import {Workspace} from '../src/workspace.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg');
const justification={tool:{reason:'Canny tests the actual public image transport and artifact persistence; it is not a defect detector or accuracy claim.',expectedEvidence:[{kind:'artifact',type:'image',id:'edges'}]},parameters:[{name:'low',source:'agent-proposal',reason:'40 is an explicitly fixed transport smoke-test setting, not an optimized production setting.',verification:{kind:'artifact',type:'evidence',id:'stats'}}],boundaries:[{condition:'Input must contain image pixels.',check:{kind:'gate',id:'readable'},onFailure:'UNKNOWN'}]};
test('GT fields are rejected instead of dispatched to predictor',()=>{
 assert.throws(()=>validateBenchmarkManifest({schema:'agentcv-blind-batch-1',samples:[{id:'a',images:[{path:source,maskPath:'gt.png'}]}]}),/GT\/labels/);
});
test('genuine public image batch uses platform run API, survives failure, saves reloadable workspace and trace',async()=>{
 const out=await fs.mkdtemp(path.join(root,'runtime/benchmark-batch-qa-'));
 const program=`with step('edges', 'Actual public-image Canny') as s:\n    edges=cv2.Canny(image,parameters['low'],120)\n    save_image('edges',edges)\n    result={'edgePixels':int(np.count_nonzero(edges)), 'boundaryChecks':[{'id':'readable','status':'PASS' if image.size else 'FAIL'}]}\n    save_json('stats',result)\n    s.set_output('edgePixels',result['edgePixels'])\n`;
 const batch=await runBenchmarkBatch({manifest:{schema:'agentcv-blind-batch-1',dataset:'OpenCV stuff transport QA',split:'smoke',samples:[{id:'first',images:[{path:source}]},{id:'missing-file',images:[{path:source+'.missing'}]},{id:'after-failure',images:[{path:source}]}]},program,parameters:{low:40},justification,expectedOutputs:[{id:'edges',type:'image'},{id:'stats',type:'evidence'}],out,jobs:2});
 assert.deepEqual(batch.rows.map(r=>r.status),['SUCCEEDED','FAILED','SUCCEEDED']);
 assert.equal(batch.rows[0].result.edgePixels,batch.rows[2].result.edgePixels);assert.ok(batch.rows[0].result.edgePixels>0);
 const row=batch.rows[0],run=JSON.parse(await fs.readFile(row.runFile,'utf8'));
 assert.equal(run.code,program);assert.ok(run.procedureTrace.nodes.length>0);assert.ok(run.artifacts.find(a=>a.id==='edges').dataUrl.startsWith('data:image/png;base64,'));
 const saved=await fs.readFile(row.workspaceFile,'utf8'),project=new Workspace();await project.load(JSON.parse(saved),decodeBenchmarkImage);assert.equal(project.data.algorithmRuns[0].runId,run.runId);assert.equal(project.data.images.length,1);
 const restored=project.data.algorithmRuns[0];for(const artifact of restored.artifacts.filter(a=>a.type==='image')){assert.ok(artifact.dataUrl);assert.equal(createHash('sha256').update(Buffer.from(artifact.dataUrl.split(',')[1],'base64')).digest('hex'),artifact.sha256)}
 assert.ok(restored.artifacts.find(a=>a.id==='stats').data);
 const request=JSON.parse(await fs.readFile(path.join(row.directory,'request.json'),'utf8'));assert.equal(request.images[0].name,'input-0.jpeg');assert.ok(!JSON.stringify(request.sourceBinding).includes(source));
 assert.ok((await fs.readFile(path.join(out,'rerun.sh'),'utf8')).includes('agentcv-benchmark-batch.mjs'));assert.ok(batch.rows[1].error.message.includes('ENOENT'));
 console.log('Real batch evidence: '+out);
});
