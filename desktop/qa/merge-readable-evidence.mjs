import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='/Users/liangshiben/13-cv/reviews/2026-10-28-readable-evidence',session=JSON.parse(fs.readFileSync(out+'/latest-native-session.json')),proposed=JSON.parse(fs.readFileSync(out+'/final-review/revised.agentcv.json'));
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
try{
 const page=await browser.newPage();await page.routeWebSocket('**',socket=>socket.close());await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>!!globalThis.AgentCVDesktop);await page.evaluate(()=>AgentCVDesktop.startupReady);
 await page.evaluate(async s=>{await AgentCVDesktop.loadProject(s.project,{resume:true,view:s.ui})},session);
 const merged=await page.evaluate(async({proposed,view})=>{
  const {reviseAlgorithmEvidence,effectiveAlgorithmRun}=await import('/src/algorithm-evidence-revisions.js');const p=AgentCVDesktop.project;
  const before={chat:JSON.stringify(p.data.chat),boards:JSON.stringify(p.data.visualInquiry.boards),images:p.data.images.map(i=>({id:i.id,name:i.name,dataURL:i.dataURL})),facts:p.data.algorithmRuns.map(r=>JSON.stringify({...r,evidenceRevisions:undefined}))};
  for(const candidate of proposed.algorithmRuns){const current=p.data.algorithmRuns.find(r=>r.runId===candidate.runId);if(!current)throw Error('Native project no longer contains '+candidate.runId);
   for(const field of ['code','parameters','sourceBinding','result'])if(JSON.stringify(current[field])!==JSON.stringify(candidate[field]))throw Error('Native execution changed; refusing stale evidence merge: '+field);
   for(const revision of candidate.evidenceRevisions||[]){if((current.evidenceRevisions||[]).some(old=>old.id===revision.id))continue;reviseAlgorithmEvidence(p,{run_id:current.runId,expected_revision:current.evidenceRevisions?.length||0,reason:revision.reason,...(revision.justification?{justification:revision.justification}:{}),...(revision.parameterNotes?{parameterNotes:revision.parameterNotes}:{}),nodes:revision.nodes});}
  }
  if(before.chat!==JSON.stringify(p.data.chat)||before.boards!==JSON.stringify(p.data.visualInquiry.boards)||JSON.stringify(before.images)!==JSON.stringify(p.data.images.map(i=>({id:i.id,name:i.name,dataURL:i.dataURL})))||JSON.stringify(before.facts)!==JSON.stringify(p.data.algorithmRuns.map(r=>JSON.stringify({...r,evidenceRevisions:undefined}))))throw Error('Merge changed non-explanation state');
  const data=JSON.parse(p.serialize());data.workspaceView=view;return {data,coverage:p.data.algorithmRuns.map(raw=>{const r=effectiveAlgorithmRun(raw);return {runId:r.runId,revision:r.explanationRevision,rootRevised:(raw.evidenceRevisions||[]).some(v=>v.justification),nodes:r.procedureTrace.nodes.map(n=>({id:n.instanceId,revised:(raw.evidenceRevisions||[]).some(v=>v.nodes?.some(u=>u.instanceId===n.instanceId&&u.justification)),notes:!!n.explanationParameterNotes,emptyParameters:!Object.keys(n.parameters||{}).length}))}}),chatCount:p.data.chat.length};
 },{proposed,view:session.ui});
 assert.ok(merged.coverage.every(r=>r.rootRevised&&r.nodes.every(n=>n.revised&&(!n.emptyParameters||n.notes))));
 const file='/Users/liangshiben/13-cv/OpenCV封面定位-三項依據修訂.agentcv.json';fs.writeFileSync(file,JSON.stringify(merged.data));fs.writeFileSync(out+'/final.agentcv.json',JSON.stringify(merged.data));delete merged.data;fs.writeFileSync(out+'/merge-verification.json',JSON.stringify({status:'PASS',file,...merged,preserved:'Native current conversations, boards, original pixels and all execution facts unchanged; only explanation revisions appended via facade.'},null,2));console.log(JSON.stringify(merged));
}finally{await browser.close()}
