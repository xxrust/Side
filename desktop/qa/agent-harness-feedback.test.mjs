import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {Workspace} from '../src/workspace.js';
import {Agent} from '../src/agent.js';
import {decodeBenchmarkImage} from '../scripts/agentcv-benchmark-batch.mjs';
import {runDatasetScheme} from '../src/workpiece-runner.js';
import {platformFailure} from '../src/platform-feedback.js';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(root,'../codex-audit-logs/20261102-agent-harness');
async function project(){
 const p=new Workspace(),data=JSON.parse(await fs.readFile(path.resolve(root,'../codex-audit-logs/20261102-focused-discussion/verified-discussion.agentcv.json'),'utf8')),ids=new Map();
 for(const image of data.images){await p.addImages([{name:image.name,dataUrl:image.dataURL}],decodeBenchmarkImage);ids.set(image.id,p.data.images.at(-1).id);}
 const scheme=structuredClone(data.purposeScheme);for(const [slot,id]of Object.entries(scheme.execution.referenceInputs||{}))scheme.execution.referenceInputs[slot]=ids.get(id);p.data.purposeScheme=scheme;return p;
}
function native(t){const child=spawn(root+'/src-tauri/target/release/agentcv-desktop',['--cv-resident-headless'],{stdio:['pipe','pipe','inherit']}),pending=new Map();let sequence=0,calls=0;createInterface({input:child.stdout}).on('line',s=>{const m=JSON.parse(s),p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);});child.on('exit',code=>{for(const p of pending.values())p.reject(Error('native runtime exited '+code));pending.clear()});t.after(()=>child.stdin.end());return {get calls(){return calls},execute:request=>new Promise((resolve,reject)=>{calls++;const id=++sequence;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,op:'execute',request})+'\n');})};}
function agent(p,executor){const a=new Agent(p,{page:()=>6,selection:()=>({}),locked:()=>false,reference:()=>null,refresh(){},update(){},activity(){},runPurposeScheme:options=>runDatasetScheme(p,executor,options)});a.turn='harness-real-host-tools';a.turnEpoch=p.epoch;a.expectedStamp=a.stamp();return a;}
test('candidate validation is read-only, uses the execution compiler, and returns field-specific malformed/reference diagnostics',async()=>{
 const p=await project(),a=agent(p),before=JSON.stringify(p.data),candidate=structuredClone(p.purposeScheme);candidate.operatorGraph.nodes[0].inputs={wrong:null};
 const feedback=await a.execute('validate_purpose_scheme',{scheme_json:JSON.stringify(candidate)});assert.equal(feedback.ok,false);assert.ok(feedback.errors.some(e=>e.code==='NODE_INPUT_INVALID'&&e.path.endsWith('inputs.wrong')));assert.equal(JSON.stringify(p.data),before);
 const refs=structuredClone(p.purposeScheme);refs.execution.referenceInputs={template:'missing-image'};const r=await a.execute('validate_purpose_scheme',{scheme_json:JSON.stringify(refs)});assert.ok(r.errors.some(e=>e.code==='REFERENCE_IMAGE_UNAVAILABLE'&&e.hint.includes('get_dataset_images')));assert.equal(JSON.stringify(p.data),before);
 const malformed=structuredClone(p.purposeScheme);malformed.classificationSpec.metrics={wrong:true};assert.equal((await a.execute('validate_purpose_scheme',{scheme_json:JSON.stringify(malformed)})).ok,false);
 await assert.rejects(a.execute('validate_purpose_scheme',{scheme_json:'{broken'}),e=>e.code==='SCHEME_JSON_INVALID'&&e.errors[0].path==='scheme_json');assert.equal(JSON.stringify(p.data),before);
 await assert.rejects(a.execute('validate_purpose_scheme',{scheme_json:JSON.stringify({$patch:{operations:[]}})}),e=>e.code==='SCHEME_PATCH_UNSUPPORTED'&&e.errors[0].hint.includes('get_purpose_scheme'));assert.equal(JSON.stringify(p.data),before);
 assert.equal(p.validatePurposeScheme().ok,true);assert.deepEqual(p.validatePurposeScheme().errors,p.compilePurposeScheme().errors);
});
test('actual host tool wire preserves compiler audit, candidate repair restores real OpenCV positive/negative executions',async t=>{
 const p=await project(),host=native(t),a=agent(p,host.execute),fixed=structuredClone(p.purposeScheme),scene=p.data.images.find(i=>i.name==='box_in_scene.png'),fruit=p.data.images.find(i=>i.name==='extra-fruits.png');assert.ok(scene&&fruit);
 // Deliberately invalid saved candidate, isolated from the user's project.
 p.data.purposeScheme.operatorGraph.edges.push({from:'missing-producer',to:fixed.operatorGraph.nodes[0].id});a.expectedStamp=a.stamp();const wire=[];a.wire=async message=>wire.push(message);
 await a.event({type:'tool_request',turn:a.turn,id:'invalid-run',name:'run_workpiece_scheme',args:{image_ids:[scene.id]}});
 const failed=wire.find(r=>r.id==='invalid-run')?.result;assert.equal(failed.code,'SCHEME_COMPILE_FAILED');assert.equal(failed.retryable,true);assert.ok(failed.errors.some(e=>e.code==='EDGE_INVALID'&&e.path&&e.hint));assert.ok(failed.questions.length);assert.ok(!failed.errors.some(e=>e.code==='GRAPH_CYCLE'),'dangling dependency is not itself a cycle');assert.equal(host.calls,0);assert.equal((p.data.algorithmRuns||[]).length,0);assert.match(failed.next,/validate_purpose_scheme/);
 const preview=await a.execute('validate_purpose_scheme',{scheme_json:JSON.stringify(fixed)});assert.equal(preview.ok,true);assert.equal(p.purposeScheme.operatorGraph.edges.at(-1).from,'missing-producer');
 const saved=await a.execute('set_purpose_scheme',{scheme_json:JSON.stringify(fixed)});assert.equal(saved.ok,true);
 const results=[];for(const image of [scene,fruit]){const r=await a.execute('run_workpiece_scheme',{image_ids:[image.id]});assert.equal(r.execution.processed,1);assert.equal(r.execution.counts.execution.FAULT,0);results.push({name:image.name,execution:r.execution});}
 assert.equal(results[0].execution.counts.categories.mapped,1);assert.equal(results[1].execution.counts.categories.unmapped,1);assert.ok(host.calls>=4);assert.ok(p.data.algorithmRuns.every(r=>r.status==='SUCCEEDED'));
 await fs.mkdir(out,{recursive:true});await fs.writeFile(out+'/feedback-roundtrip.json',JSON.stringify({scope:'Real host tool event/feedback, actual native OpenCV execution; repair request authored by test, not a model-generated repair.',failed,preview,results,dispatchCount:host.calls},null,2));await fs.writeFile(out+'/executed.agentcv.json',p.serialize());
});
test('compiler errors stored only in audit remain directly usable by the agent',()=>{const e=Error('方案未編譯');e.code='SCHEME_COMPILE_FAILED';e.audit={errors:[{code:'GRAPH_CYCLE',path:'operatorGraph',message:'循環'}],questions:[{question:'修改依賴'}]};const r=platformFailure(e);assert.equal(r.errors[0].code,'GRAPH_CYCLE');assert.ok(r.errors[0].hint);assert.equal(r.questions.length,1);});
