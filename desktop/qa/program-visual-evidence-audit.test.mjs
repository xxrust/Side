// Uses preserved real Pi/OpenCV execution artifacts. Mutation here represents
// invalid submissions; no pixels, measurements, or detector outputs are mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditAlgorithmRun} from '../src/algorithm-workspace.js';
import {auditAlgorithmProcedureTrace} from '../src/algorithm-procedure-audit.js';
import {validateOperationEvidenceJustification} from '../src/pipeline-evidence-contract.js';
const data=JSON.parse(fs.readFileSync(new URL('../../reviews/2026-10-27-program-flow/actual-pi-workspace-portable.agentcv.json',import.meta.url),'utf8'));
const real=data.algorithmRuns.at(-1),clone=()=>structuredClone(real),image=real.artifacts.find(a=>a.id==='otsu');
const selectors=j=>[...j.tool.expectedEvidence,...j.parameters.map(p=>p.verification),...j.boundaries.map(b=>b.check)];
const visuals=(j,id)=>{for(const selector of selectors(j)){selector.caption='原數值與本次圖像一起核對。';selector.visuals=[{id,caption:'看本步暗區遮罩；白色像素是本次閾值保留區，不代表工件身分。'}];}};

test('programmable root accepts dedicated pictures and rejects missing pixels or a nonexistent run artifact',()=>{
 const run=clone();visuals(run.justification,'otsu');let audit=auditAlgorithmRun(run,[]);
 assert.equal(audit.errors.some(e=>e.code==='UNSUPPORTED_EVIDENCE_FIELD'||e.code==='EVIDENCE_VISUAL_UNAVAILABLE'),false);
 run.justification.boundaries[0].check.visuals[0].id='not-in-this-run';audit=auditAlgorithmRun(run,[]);assert.ok(audit.errors.some(e=>e.code==='EVIDENCE_VISUAL_UNAVAILABLE'&&e.path.includes('boundaries[0].check.visuals[0].id')));
 run.justification.boundaries[0].check.visuals[0].id='otsu';const saved=run.artifacts.find(a=>a.id==='otsu');delete saved.dataUrl;delete saved.dataURL;audit=auditAlgorithmRun(run,[]);assert.ok(audit.errors.some(e=>e.code==='EVIDENCE_VISUAL_UNAVAILABLE'));
});
test('all three per-step sections enforce exact local visual ownership and meaningful captions',()=>{
 for(const section of ['tool','parameters','boundaries']){
  const run=clone(),step=run.procedureTrace.nodes.find(n=>n.id==='otsu'),selector=section==='tool'?step.justification.tool.expectedEvidence[0]:section==='parameters'?step.justification.parameters[0].verification:step.justification.boundaries[0].check;
  selector.visuals=[{id:'otsu',caption:'本步保存的實際遮罩，不代表物件身分。'}];let audit=auditAlgorithmProcedureTrace(run);assert.equal(audit.errors.some(e=>e.code==='EVIDENCE_VISUAL_UNAVAILABLE'),false);
  selector.visuals[0].id='components';audit=auditAlgorithmProcedureTrace(run);const error=audit.errors.find(e=>e.code==='EVIDENCE_VISUAL_UNAVAILABLE');assert.ok(error,section+' must reject a sibling step image');assert.match(error.path,/procedureTrace.nodes\[2\].*visuals\[0\].id/);assert.ok(error.hint);
  selector.visuals[0]={id:'otsu',caption:''};assert.ok(auditAlgorithmProcedureTrace(run).errors.some(e=>e.code==='EVIDENCE_CAPTION_REQUIRED'));
 }
});
test('parent procedure can cite recorded child images; selectors do not gain access by sharing a program',()=>{
 const run=clone(),parent=run.procedureTrace.nodes.find(n=>n.kind==='procedure');assert.ok(parent.artifactIds.includes('otsu'));visuals(parent.justification,'otsu');assert.equal(auditAlgorithmProcedureTrace(run).errors.some(e=>e.code==='EVIDENCE_VISUAL_UNAVAILABLE'),false);
 const j=structuredClone(run.procedureTrace.nodes.find(n=>n.id==='otsu').justification);j.tool.expectedEvidence[0].visuals=[{id:'otsu',caption:'實際遮罩。'}];
 const args={nodeId:'registered-shortcut',requiredParameters:j.parameters.map(p=>({name:p.name,source:p.source})),evidenceArtifacts:real.artifacts.map(a=>({...a,type:a.type==='json'?'evidence':a.type})),gateIds:real.procedureTrace.nodes.find(n=>n.id==='otsu').outputs.boundaryChecks.map(c=>c.id)};
 const strict=validateOperationEvidenceJustification(j,args);assert.ok(strict.errors.some(e=>e.code==='UNSUPPORTED_EVIDENCE_FIELD'),'registered shortcuts remain strict without programmable opt-in');
 const program=validateOperationEvidenceJustification(j,{...args,allowVisuals:true,requireVisualPixels:true});assert.equal(program.errors.some(e=>e.code==='UNSUPPORTED_EVIDENCE_FIELD'||e.code==='EVIDENCE_VISUAL_UNAVAILABLE'),false);
});
