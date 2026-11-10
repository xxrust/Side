// These checks use the saved real Pi/OpenCV trial, never fabricated CV results.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Workspace} from '../src/workspace.js';
import {reviseAlgorithmEvidence,effectiveAlgorithmRun} from '../src/algorithm-evidence-revisions.js';
import {readAlgorithmRun,prepareAlgorithmRuns,compactAlgorithmRun} from '../src/algorithm-workspace.js';
const filename=new URL('../../OpenCV封面定位.agentcv.json',import.meta.url);
const available=fs.existsSync(filename);
const options={skip:!available};
function fixture(){const p=new Workspace();p.data=JSON.parse(fs.readFileSync(filename,'utf8'));return p;}
function nodeUpdate(run){const node=run.procedureTrace.nodes.find(node=>node.kind==='step');return {instanceId:node.instanceId,justification:structuredClone(node.justification)};}
test('real OpenCV explanations append atomically; original facts and text remain intact',options,()=>{
 const p=fixture(),run=p.data.algorithmRuns.at(-1),original=JSON.stringify(run),update=nodeUpdate(run);
 update.justification.tool.reason='本次只改善解說：先在兩張真實原圖中尋找可重複辨認的局部花紋，再比較對應位置；本修訂沒有新增任何實驗。';
 const result=reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:0,reason:'讓讀者理解實際處理',nodes:[update]});
 assert.equal(result.revision,1);const {evidenceRevisions,...facts}=run;assert.equal(JSON.stringify(facts),original);
 assert.equal(effectiveAlgorithmRun(run).procedureTrace.nodes.find(n=>n.instanceId===update.instanceId).justification.tool.reason,update.justification.tool.reason);
 assert.equal(run.evidenceRevisions.length,1);assert.equal(p.dirty,true);
 assert.equal(JSON.parse(JSON.stringify(p.data)).algorithmRuns.at(-1).evidenceRevisions[0].nodes[0].instanceId,update.instanceId);
});
test('stale revisions and borrowed figures reject without altering actual run history',options,()=>{
 const p=fixture(),run=p.data.algorithmRuns.at(-1),update=nodeUpdate(run),before=JSON.stringify(p.data);
 assert.throws(()=>reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:1,reason:'stale',nodes:[update]}),/revision=0/);
 assert.equal(JSON.stringify(p.data),before);
 update.justification.tool.expectedEvidence[0].visuals=[{id:'nonexistent-image',caption:'不允許的外部圖片'}];
 assert.throws(()=>reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:0,reason:'wrong binding',nodes:[update]}),e=>e.code==='ALGORITHM_EXPLANATION_REJECTED');
 assert.equal(JSON.stringify(p.data),before);
});
test('partial explanation rewrite cannot smuggle numeric results or change a gate',options,()=>{
 const p=fixture(),run=p.data.algorithmRuns.at(-1),update=nodeUpdate(run),before=JSON.stringify(run);
 update.outputs={inventedAccuracy:1};
 assert.throws(()=>reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:0,reason:'forbidden facts',nodes:[update]}),e=>e.code==='ALGORITHM_EXPLANATION_REJECTED');
 assert.equal(JSON.stringify(run),before);
});
test('historical missing images can be explained honestly but cannot gain evidence or a PASS',options,()=>{
 const p=fixture(),run=p.data.algorithmRuns[0],node=run.procedureTrace.nodes.find(n=>n.artifactIds.length===0),originalAudit=JSON.stringify(run.evidenceAudit);
 const reference={kind:'execution-status',allowed:['OK']};
 const justification={tool:{reason:'本步原意是在原圖找局部花紋；當時未保存獨立圖，不能重建看到哪些點。',expectedEvidence:[]},parameters:Object.keys(node.parameters).map(name=>({name,source:node.parameterSources?.[name]||'agent-proposal',reason:'當時保存的設定；未保存獨立比較，不能稱為最優。',verification:reference})),boundaries:[{condition:'只知道程式執行結束；適用性未驗證。',check:reference,onFailure:'UNKNOWN'}]};
 assert.throws(()=>reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:0,reason:'說明歷史缺失',nodes:[{instanceId:node.instanceId,justification}]}),e=>e.code==='ALGORITHM_EXPLANATION_REJECTED');
 reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:0,reason:'說明歷史缺失',nodes:[{instanceId:node.instanceId,justification,evidenceGap:'當時未保存本步圖像或統計，無法回看；適用性仍未驗證。'}]});
 const effective=effectiveAlgorithmRun(run);assert.match(effective.procedureTrace.nodes.find(n=>n.instanceId===node.instanceId).explanationEvidenceGap,/未保存/);assert.equal(JSON.stringify(effective.evidenceAudit),originalAudit);
});
test('inherited/default parameter notes persist without inventing a saved per-step parameter',options,()=>{
 const p=fixture(),run=p.data.algorithmRuns[0],node=run.procedureTrace.nodes.find(n=>Object.keys(n.parameters||{}).length===0),facts=JSON.stringify(run),note='本步沒有獨立保存參數，實際使用整段程式的設定及函式預設；不能把空物件解讀成沒有設定，也未記錄獨立參數比較。';
 reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:0,reason:'補足預設值說明',parameterNotes:'總設定另見保存的程式及參數；此修訂只增加解說。',nodes:[{instanceId:node.instanceId,parameterNotes:note}]});
 const effective=effectiveAlgorithmRun(run),resolved=effective.procedureTrace.nodes.find(n=>n.instanceId===node.instanceId);
 assert.equal(resolved.explanationParameterNotes,note);assert.deepEqual(resolved.parameters,{});assert.match(effective.explanationParameterNotes,/總設定/);
 const {evidenceRevisions,...original}=run;assert.equal(JSON.stringify(original),facts);
 prepareAlgorithmRuns(JSON.parse(JSON.stringify(p.data)));
 const count=run.evidenceRevisions.length;
 assert.throws(()=>reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:count,reason:'too long',nodes:[{instanceId:node.instanceId,parameterNotes:'a'.repeat(8001)}]}),e=>e.code==='ALGORITHM_EXPLANATION_REJECTED');
 assert.equal(run.evidenceRevisions.length,count);
});
test('revising a real historical artifact-less step inherits its saved gap and survives reload',options,()=>{
 const p=fixture(),run=p.data.algorithmRuns[0],node=run.procedureTrace.nodes.find(n=>n.artifactIds.length===0),reference={kind:'execution-status',allowed:['OK']};
 const justification={tool:{reason:'本步尋找封面上可重複辨認的局部花紋，但當時未保存獨立圖。',expectedEvidence:[]},parameters:Object.keys(node.parameters).map(name=>({name,source:node.parameterSources?.[name]||'agent-proposal',reason:'沿用保存值，未記錄獨立比較。',verification:reference})),boundaries:[{condition:'只保存執行狀態，適用性未驗證。',check:reference,onFailure:'UNKNOWN'}]};
 assert.throws(()=>reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:0,reason:'first missing gap',nodes:[{instanceId:node.instanceId,justification}]}),e=>e.errors?.some(row=>row.hint?.includes('不得借用'))||JSON.stringify(e).includes('不得借用'));
 const gap='本步未保存獨立產物，不得借下游結果補證明。';
 reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:0,reason:'initial honest explanation',nodes:[{instanceId:node.instanceId,justification,evidenceGap:gap}]});
 justification.tool.reason='封面花紋可作為比對線索；原紀錄未保存本步圖，不能逐點核對效果。';
 reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:1,reason:'plain language polish',nodes:[{instanceId:node.instanceId,justification}]});
 assert.equal(run.evidenceRevisions[1].nodes[0].evidenceGap,gap);
 assert.equal(effectiveAlgorithmRun(run).procedureTrace.nodes.find(n=>n.instanceId===node.instanceId).explanationEvidenceGap,gap);
 prepareAlgorithmRuns(JSON.parse(JSON.stringify(p.data)));
 assert.equal(run.evidenceAudit.status,'DIAGNOSTIC_ONLY');
});

test('default compact get_algorithm_run metadata exposes saved parameter notes and evidence gaps',options,()=>{
 const p=fixture(),run=p.data.algorithmRuns[0],node=run.procedureTrace.nodes.find(n=>n.artifactIds.length===0),notes='本步繼承程式與函式預設，未逐步保存參數；沒有獨立參數比較。',gap='當時未保存本步獨立圖像或統計，仍無法核對。';
 // Notes-only updates preserve actual history; saved gap describes the same real
 // absence checked by the historical gap test above.
 reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:0,reason:'make inherited settings visible',nodes:[{instanceId:node.instanceId,parameterNotes:notes,evidenceGap:gap}]});
 const summary=compactAlgorithmRun(readAlgorithmRun(p,run.runId));
 const visible=summary.procedureTrace.nodes.find(n=>n.instanceId===node.instanceId);
 assert.equal(visible.explanationParameterNotes,notes);assert.equal(visible.explanationEvidenceGap,gap);
 assert.equal(visible.originalJustification,undefined);
 assert.deepEqual(visible.parameters,node.parameters);
});
