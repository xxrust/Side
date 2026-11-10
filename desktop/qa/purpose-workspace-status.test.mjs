// Uses the user's saved native two-hole project and real Pi cover executions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {projectSchemeStatus} from '../src/purpose-project-status.js';
const twoholes=new URL('../../codex-audit-logs/20261029-restore-and-iterate/input.agentcv.json',import.meta.url),cover=new URL('../../專案-OpenCV封面定位-真實操作/manifest.agentcv.json',import.meta.url);
const read=file=>{const saved=JSON.parse(fs.readFileSync(file,'utf8'));return saved.project||saved};

test('actual user project retains DRAFT identity despite successful exploratory Python execution',{skip:!fs.existsSync(twoholes)},()=>{
 const data=read(twoholes),before=JSON.stringify(data),state=projectSchemeStatus(data);
 assert.equal(state.identity,'DRAFT');assert.equal(state.execution.mode,'draft');assert.equal(state.execution.complete,false);assert.equal(state.classification,null);assert.equal(state.release.status,'NOT_RELEASED');assert.equal(state.compilation.status,'FAIL');assert.equal(state.regression.status,'NOT_RUN');assert.equal(JSON.stringify(data),before,'status observation cannot rewrite the saved project');
});

test('real cover case PASS is explicitly case-scoped and never released; missing mode/comparisons invalidate completeness',{skip:!fs.existsSync(cover)},()=>{
 const data=read(cover),state=projectSchemeStatus(data);assert.equal(state.identity,'SCHEME_VALIDATED');assert.equal(state.regression.caseCount,1);assert.equal(state.regression.status,'PASS');assert.match(state.label,/案例範圍/);assert.equal(state.release.status,'NOT_RELEASED');
 const legacy=structuredClone(data);for(const run of legacy.algorithmRuns)delete run.mode;assert.equal(projectSchemeStatus(legacy).identity,'DRAFT','legacy execution mode cannot be inferred from Python success or labels');
 const missing=structuredClone(data);missing.purposeAcceptance.cases=[];assert.equal(projectSchemeStatus(missing).regression.status,'INCOMPLETE');assert.notEqual(projectSchemeStatus(missing).identity,'SCHEME_VALIDATED');
 const changed=structuredClone(data);changed.purposeScheme.purposeCard.items[0].label+='（修改）';assert.equal(projectSchemeStatus(changed).regression.status,'STALE');assert.equal(projectSchemeStatus(changed).classification,null);
 const artifact=structuredClone(data);artifact.purposeAcceptance.cases[0].artifactId='unrecorded-evidence';assert.equal(projectSchemeStatus(artifact).regression.status,'INCOMPLETE','case comparisons must bind actual node/run/artifact, not just item labels');
});

test('native user project global status and scheme diagnostics remain accessible without replacing the canvas',{skip:!fs.existsSync(twoholes)},async()=>{
 const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{await h.api.loadProject(h.w.JSON.parse(JSON.stringify(read(twoholes))));const data=h.api.project.data,before=JSON.stringify(data),button=h.$('openPurposeScheme');assert.match(button.textContent,/DRAFT/);assert.match(button.title,/案例回歸：尚未執行/);const board=h.api.inquiryView.boardId;button.click();await h.tick();const dialog=h.$('purposeSchemeDialog');assert.equal(dialog.open,true);assert.match(dialog.textContent,/DRAFT · 未驗證/);assert.match(dialog.textContent,/程式已執行 · DRAFT 探索/);assert.match(dialog.textContent,/尚無案例回歸結果/);assert.match(dialog.textContent,/EXECUTABLE_GRAPH_MISSING/);assert.equal(h.api.inquiryView.boardId,board);assert.equal(h.$('purposeSchemeEditor').closest('details').open,false,'JSON editing is advanced detail, not the workflow');assert.equal(JSON.stringify(data),before);assert.deepEqual(h.errors,[]);}finally{h.close()}
});


test('actual Pi three-image calculation stays separate from its one registered answer case',async()=>{
 const completed=new URL('../../codex-audit-logs/20261029-restore-and-iterate/live/completed.agentcv.json',import.meta.url),saved=read(completed),state=projectSchemeStatus(saved);
 assert.equal(state.dataset.rows.length,3);assert.deepEqual(state.dataset.rows.map(row=>row.classification),['NG','OK','NG']);assert.equal(state.regression.caseCount,1);assert.equal(state.regression.rows.length,1);assert.deepEqual(state.dataset.rows.map(row=>row.knownCaseIds.length),[0,1,0]);assert.deepEqual(state.dataset.rows[0].evidence[0].reasons,['DIAMETERS_DIFFER']);assert.deepEqual(state.dataset.rows[2].evidence[0].reasons,['COUNT_NOT_TWO']);assert.equal(state.dataset.rows[2].evidence[0].observation.count,1);
 const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{await h.api.loadProject(h.w.JSON.parse(JSON.stringify(saved)));const before=JSON.stringify(h.api.project.data);h.$('openPurposeScheme').click();await h.tick();const dialog=h.$('purposeSchemeDialog'),dataset=dialog.querySelector('table[aria-label="圖片集實算"]'),regression=dialog.querySelector('table[aria-label="已知答案案例回歸"]');assert.equal(dataset.querySelectorAll('tbody tr').length,3);assert.equal(regression.querySelectorAll('tbody tr').length,1);assert.match(dataset.textContent,/02-oversize.png/);assert.match(dataset.textContent,/03-missing.png/);assert.match(dataset.textContent,/DIAMETERS_DIFFER/);assert.match(dataset.textContent,/COUNT_NOT_TWO/);assert.equal(dataset.querySelectorAll('tbody button').length,3);assert.equal(JSON.stringify(h.api.project.data),before,'viewing all images never promotes Agent trial expectations into known answers');assert.deepEqual(h.errors,[]);}finally{h.close()}
});
