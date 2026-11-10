import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {Workspace} from '../src/workspace.js';
import {decodeBenchmarkImage} from '../scripts/agentcv-benchmark-batch.mjs';
import {runDatasetScheme} from '../src/workpiece-runner.js';
import {acceptanceContext,acceptanceQuestions,currentAgreement,assessBaselineExecution,compareBaselineExecutions,validateAcceptanceWorkspace} from '../src/project-acceptance.js';
import {executeWorkpieceTool} from '../src/agent-workpiece-tools.js';
const root=path.resolve(import.meta.dirname,'..'),fixture=JSON.parse(await fs.readFile(root+'/../codex-audit-logs/20261102-agent-harness/pi-repair-02/completed.agentcv.json','utf8'));
const labelled=JSON.parse(await fs.readFile(root+'/../codex-audit-logs/20261030-cards-mapping-stability/session-project-readonly.agentcv.json','utf8'));
// QA limits exercise the acceptance machinery; they are not user-approved
// production requirements. Labels come from the user's previously saved file.
const draft={maxMissRate:0,maxFalseRejectRate:0,maxMismatchRate:0,maxFaultRate:0,maxCycleMs:0.001,unitDescription:'單張待檢圖，固定書封面參考',missingPolicy:'無映射為 unmapped',faultPolicy:'執行異常走獨立 FAULT',source:'QA 專用極小時間門檻，用於驗證真實超時拒絕；不作產線要求'};
function project(){const p=new Workspace();p.data=structuredClone(fixture);for(const i of p.data.images){const old=labelled.images.find(x=>x.sha256===i.sha256);if(old?.expected?.status)i.expected=structuredClone(old.expected);}return p;}
function configure(p,partition='development'){const refs=new Set(Object.values(p.purposeScheme.execution.referenceInputs));for(const i of p.data.images.filter(i=>!refs.has(i.id)))p.assignAcceptanceSample(i.id,{partition});return p.freezeAcceptanceBaseline({partition});}

test('agreement is human-confirmed, stale after rule changes, not after code changes; no model confirmation tool',async()=>{
 const p=project();assert.ok(acceptanceQuestions(p).length);assert.throws(()=>p.confirmAcceptance(),/未完整/);
 p.proposeAcceptance(draft);assert.equal(currentAgreement(p),null);assert.deepEqual(acceptanceQuestions(p),[]);p.confirmAcceptance();assert.ok(currentAgreement(p));
 p.data.purposeScheme.operatorGraph.nodes[0].code+='\n# harmless QA comment';assert.ok(currentAgreement(p));
 p.data.purposeScheme.classificationSpec.categories[0].quality='bad';assert.equal(currentAgreement(p),null);
 await assert.rejects(()=>executeWorkpieceTool({p,visualBoardId:()=>p.ensureInquiry().activeBoardId},'confirm_project_acceptance',{}),/未知/);
});

test('frozen baseline preserves real identities and saved human labels, detects drift and prevents group/content leakage',()=>{
 const p=project(),ids=p.data.images.filter(i=>i.expected?.status).map(i=>i.id);
 p.assignAcceptanceSample(ids[0],{partition:'development',group:'physical-batch-1'});
 assert.throws(()=>p.assignAcceptanceSample(ids[1],{partition:'acceptance',group:'physical-batch-1'}),/不能跨/);
 const b=p.freezeAcceptanceBaseline({partition:'development'});assert.equal(b.samples.length,1);assert.equal(b.samples[0].expected.provenance.type,'human');
 const before=structuredClone(b);p.setImageExpectedClassification(ids[0],{categoryId:'unmapped'});assert.deepEqual(acceptanceContext(p,{baselineId:b.id}).baseline.samples,before.samples);
 assert.throws(()=>p.assignAcceptanceSample(ids[0],{partition:'acceptance'}),/不能跨/);
 const duplicated={...structuredClone(p.imageRecord(ids[0])),id:'duplicate-content'};p.data.images.push(duplicated);assert.throws(()=>p.assignAcceptanceSample(duplicated.id,{partition:'acceptance'}),/不能跨/);
 p.imageRecord(ids[0]).contentSha256='changed-content';assert.throws(()=>p.baselineRunOptions(b.id),/內容已改變/);
 const reload=new Workspace();reload.data=JSON.parse(p.serialize());validateAcceptanceWorkspace(reload.data);assert.deepEqual(reload.data.acceptanceWorkspace.baselines,[before]);
});

test('held-out run requires human action and agreement, development tool cannot unlock it',async()=>{
 const p=project(),b=configure(p,'acceptance');assert.throws(()=>p.baselineRunOptions(b.id),/人類/);assert.throws(()=>p.baselineRunOptions(b.id,{actor:'human'}),/確認/);
 p.proposeAcceptance(draft);p.confirmAcceptance();assert.equal(p.baselineRunOptions(b.id,{actor:'human'}).units.length,2);assert.equal(acceptanceContext(p,{baselineId:b.id}).baseline.samples,undefined);
 await assert.rejects(()=>executeWorkpieceTool({p,visualBoardId:()=>p.ensureInquiry().activeBoardId,ui:{}},'run_acceptance_baseline',{baseline_id:b.id}),/人類/);
});

test('real resident execution freezes answers, saves exact failure references and compares two actual complete runs',async()=>{
 const p=new Workspace(),ids=new Map();for(const i of fixture.images){await p.addImages([{name:i.name,dataUrl:i.dataURL}],decodeBenchmarkImage);const n=p.data.images.at(-1);ids.set(i.id,n.id);const old=labelled.images.find(x=>x.sha256===i.sha256);if(old?.expected?.status)n.expected=structuredClone(old.expected);}
 const scheme=structuredClone(fixture.purposeScheme);for(const [slot,id]of Object.entries(scheme.execution.referenceInputs))scheme.execution.referenceInputs[slot]=ids.get(id);p.data.purposeScheme=scheme;
 p.proposeAcceptance(draft);p.confirmAcceptance();const b=configure(p),out=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-acceptance-real-'));
 const pending=new Map(),child=spawn(root+'/src-tauri/target/release/agentcv-desktop',['--cv-resident-headless'],{stdio:['pipe','pipe','pipe']});let sequence=0,stderr='';child.stderr.on('data',v=>stderr+=v);
 createInterface({input:child.stdout}).on('line',line=>{const m=JSON.parse(line),v=pending.get(m.id);if(v){pending.delete(m.id);m.error?v.reject(Error(m.error)):v.resolve(m.result);}});
 child.on('error',e=>{for(const q of pending.values())q.reject(e);pending.clear();});child.on('exit',code=>{for(const q of pending.values())q.reject(Error('native exit '+code+' '+stderr));pending.clear();});
 const send=(op,extra)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,op,...extra})+'\n');});
 try{
  await send('save_workspace',{root:out,project:JSON.parse(p.serialize())});
  const run=()=>runDatasetScheme(p,request=>send('execute',{request}),{...p.baselineRunOptions(b.id),artifactMode:'references',saveUnitResult:payload=>send('save_unit',{request:{...payload,workspaceRoot:out}})});
  const first=await run(),second=await run();for(const e of [first.execution,second.execution]){assert.equal(e.processed,2);assert.equal(e.counts.execution.FAULT,0);assert.equal(e.counts.regression.matched,2);assert.ok(e.units.every(u=>u.recordRef));assert.ok(p.data.datasetExecutions.find(x=>x.id===e.id).schemeSnapshot.operatorGraph.nodes.every(n=>n.code));}
  const report=compareBaselineExecutions(p,first.execution.id,second.execution.id);assert.deepEqual(report.regressed,[]);assert.equal(report.after.labelled,2);assert.equal(report.after.status,'FAIL','real total cycle exceeds explicit QA tiny budget');assert.ok(report.after.checks.find(c=>c.label.includes('週期')).value>0.001);
  const c=p.createAcceptanceCase(second.execution.id,second.execution.units[0].unitId);assert.equal(c.record.recordRef.sha256,second.execution.units[0].recordRef.sha256);assert.deepEqual(c.schemeSnapshot,p.purposeScheme);p.data.purposeScheme.operatorGraph.nodes[0].parameters.__qaChanged=true;assert.notDeepEqual(c.schemeSnapshot,p.purposeScheme);p.data.purposeScheme=structuredClone(c.schemeSnapshot);
  const audit=root+'/../codex-audit-logs/20261102-project-acceptance';await fs.mkdir(audit,{recursive:true});await fs.writeFile(audit+'/real-regression.json',JSON.stringify({scope:'Two real original images, two actual native runs. Frozen labels copied from user saved project. QA-only tiny cycle limit intentionally fails; no industrial acceptance claim.',report,first:first.execution.id,second:second.execution.id,case:c,workspace:out},null,2));await fs.writeFile(audit+'/verified.agentcv.json',p.serialize());
 }finally{child.stdin.end();}
});

test('acceptance panel exposes real saved labels, paginated dataset, confirmation and baseline controls',async()=>{
 const {createHarness}=createRequire(import.meta.url)('./workflow-ui-harness.cjs'),h=await createHarness();try{
  const p=project();await h.api.loadProject(h.w.JSON.parse(p.serialize()));const v=h.api.inquiryView;await v.open();v.projectCards.openProjectPanel('classification');
  const body=h.w.document.querySelector('.project-acceptance');assert.ok(body);assert.ok(body.textContent.includes('待人類確認'));
  [...body.querySelectorAll('button')].find(b=>b.textContent==='基準圖片').click();await h.tick();const panel=h.w.document.querySelector('.project-acceptance');assert.equal(panel.querySelectorAll('.pa-sample').length,2);assert.ok([...panel.querySelectorAll('select')].some(s=>s.getAttribute('aria-label')?.startsWith('人工答案')&&s.value==='mapped'));
  const select=panel.querySelector('select[aria-label^="資料集"]');select.value='development';select.dispatchEvent(new h.w.Event('change'));await h.tick();assert.ok(Object.values(h.api.project.data.acceptanceWorkspace.assignments).some(a=>a.partition==='development'));
  [...h.w.document.querySelectorAll('.project-acceptance button')].find(b=>b.textContent==='固定此集合與答案').click();await h.tick();assert.equal(h.api.project.data.acceptanceWorkspace.baselines.length,1);assert.ok(h.w.document.querySelector('.project-acceptance').textContent.includes('重跑固定開發基準'));assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
