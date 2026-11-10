// Independent adversarial audit of planning commitments and actual pixel-run
// evidence. Fixtures supply no result geometry or evidence to the operators.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Workspace} from '../src/workspace.js';
import {createPipelinePlan,runPipeline} from '../src/pipeline-runtime.js';
import {OPERATOR_REGISTRY} from '../src/pipeline-registry.js';
import {validatePipelineEvidenceProposal,assertPipelineEvidenceProposal,auditPipelineEvidenceDelivery,assertPipelineEvidenceDelivery,pipelineEvidenceFingerprint} from '../src/pipeline-evidence-contract.js';

const copy=value=>JSON.parse(JSON.stringify(value));
function gear({blank=false}={}){
 const width=260,height=260,gray=new Uint8Array(width*height).fill(255);
 if(!blank)for(let y=0;y<height;y++)for(let x=0;x<width;x++){const dx=x+.5-130,dy=y+.5-130,radius=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);if(radius<80+7*Math.cos(14*angle)&&Math.hypot(dx-4,dy+2)>24)gray[y*width+x]=0}
 return {width,height,gray,sha256:createHash('sha256').update(gray).digest('hex')};
}
async function workspace(raster=gear()){
 const w=new Workspace(),url='qa-generated-gear-pixels',decode=async value=>{assert.equal(value,url);return raster};
 await w.addImages([{name:'neutral-camera.png',dataUrl:url}],decode);return {w,decode,raster};
}
const trace=(result,id='features')=>result.nodes.find(node=>node.id===id);
const expectedArtifact={grayscale:['evidence','grayscale-conversion'],segment:['mask','segmented-mask'],components:['evidence','component-candidates'],features:['evidence','feature-evidence'],rules:['evidence','rule-evaluation']};
const toolReasons={grayscale:'輸入本身提供強度像素，保留完整解析度並核對儲存表示；不將灰階轉換當作本圖已改善分割的證明。',segment:'本例有暗齒輪與亮背景的強度分離；先用全域強度切分取得遮罩，必須檢查分佈與遮罩而非聲稱影像已被正確理解。',components:'輪廓與內孔來自連通拓樸；本例要求唯一合格物件，避免把較大背景或其他物件任意採為齒輪。',features:'檢查實際外輪廓的週期徑向變化與逐齒支持，才採用齒峰量測；圓環或不連續輪廓不應硬套齒輪模型。',rules:'只比較工程師提供的齒數界限與當次可靠量測，不根據演算法預設猜測製造公差；未提供規格時保留 UNKNOWN。'};
function completePlan({withRules=true}={}){
 const plan=createPipelinePlan({task:'gear',parameters:{expectedTeeth:14},rules:withRules?[{measurement:'visibleTeeth',equals:14}]:[]});
 plan.provenance={source:'agent'};
 for(const node of plan.nodes){const [type,id]=expectedArtifact[node.id],verification={kind:'execution-status',allowed:['OK']};node.parameterSources=Object.fromEntries(Object.keys(node.params).map(name=>[name,'agent-proposal']));node.justification={tool:{reason:toolReasons[node.id],expectedEvidence:[{kind:'artifact',type,id}]},parameters:Object.keys(OPERATOR_REGISTRY[node.op].params).map(name=>({name,source:Object.hasOwn(node.params,name)?'agent-proposal':name==='componentId'?'not-supplied':name==='threshold'||['sampleCount','smoothingWindow','minProminence','minPeakDistance'].includes(name)?'data-derived':'operator-default',reason:name==='expectedTeeth'?'此測試方案明確提出名義14齒作待核對規格，只作比較，仍需人工審核，不可當成觀察到的齒數。':name==='componentId'?'本案未指定候選編號，由唯一合格連通區條件決定；若多候選則須停止請工程師選擇。':name==='rules'?'規格清單由方案明確提出或留空；不以影像上的分佈推論品質標準，正式採用仍需人工核對。':`本案 ${name} 使用已保存的設定或算子推導；運算後必須核對實值、來源及實際比較範圍，未聲稱此值最佳。`,verification:copy(verification)})),boundaries:[{condition:node.id==='features'?'外輪廓需有可驗證的齒向週期支持；模型品質不成立時只保留診斷，不交付可靠齒數。':'本節點輸入與執行需成立；缺失、歧義或失敗時禁止把下游候選當作正式量測。',check:node.id==='features'?{kind:'gate',id:'gear.radial_range'}:copy(verification),onFailure:'UNKNOWN'}]}}
 return plan;
}
function requireActionable(audit,{nodeId,path}={}){
 assert.ok(audit.errors?.length,'rejection must provide structured repair details');assert.notEqual(audit.delivered,true);
 for(const error of audit.errors){for(const key of ['code','nodeId','path','message','hint'])assert.equal(typeof error[key],'string',`error requires ${key}: ${JSON.stringify(error)}`);assert.ok(error.code&&error.path&&error.message&&error.hint)}
 if(nodeId)assert.ok(audit.errors.some(error=>error.nodeId===nodeId),nodeId+' is identified');if(path)assert.ok(audit.errors.some(error=>error.path.includes(path)),path+' is identified');return audit;
}
async function executed(options={}){const {w,...rest}=await workspace(options.raster||gear()),plan=completePlan(options);w.createPipeline(plan,{source:'agent'});const result=await w.runPipelineImage();return {w,...rest,plan:w.workflow.pipelinePlan,result};}

test('Agent proposals missing any of tool, full parameter coverage, or boundary are rejected atomically with all repair information',async()=>{
 const {w}=await workspace(),valid=completePlan(),initial=w.data,baseline=JSON.stringify(w.data),undo=w.undoStack.length;
 const absent=copy(valid);delete absent.nodes.find(node=>node.id==='features').justification;
 const all=requireActionable(validatePipelineEvidenceProposal(absent),{nodeId:'features'});for(const section of ['tool','parameters','boundaries'])assert.ok(all.errors.some(error=>error.path.includes(section)),section+' missing in one complete response');
 for(const section of ['tool','parameters','boundaries']){const plan=copy(valid);delete plan.nodes.find(node=>node.id==='features').justification[section];requireActionable(validatePipelineEvidenceProposal(plan),{nodeId:'features',path:section});let caught;try{w.createPipeline(plan,{source:'agent'})}catch(error){caught=error}assert.ok(caught,'workspace rejects missing '+section);requireActionable(caught.audit,{nodeId:'features',path:section});assert.equal(w.data,initial);assert.equal(JSON.stringify(w.data),baseline);assert.equal(w.undoStack.length,undo)}
 assert.equal(assertPipelineEvidenceProposal(valid).errors.length,0);w.createPipeline(valid,{source:'agent'});assert.ok(w.workflow.pipelinePlan.nodes.find(node=>node.id==='features').justification);
});

test('planning cannot hide optional parameters, vague sources, placeholders, invalid checks, or fabricated completed evidence',()=>{
 const attacks=[
  ['coverage',p=>{p.nodes.find(n=>n.id==='components').justification.parameters=p.nodes.find(n=>n.id==='components').justification.parameters.filter(row=>row.name!=='componentId')},'componentId'],
  ['source',p=>{p.nodes.find(n=>n.id==='features').justification.parameters[0].source='algorithm-decided'},'source'],
  ['placeholder',p=>{p.nodes.find(n=>n.id==='features').justification.tool.reason='TODO'},'reason'],
  ['boundary failure policy',p=>{delete p.nodes.find(n=>n.id==='features').justification.boundaries[0].onFailure},'onFailure'],
  ['untyped evidence selector',p=>{p.nodes.find(n=>n.id==='features').justification.tool.expectedEvidence=['features:feature-evidence']},'expectedEvidence'],
  ['fake completed proof',p=>{p.nodes.find(n=>n.id==='features').justification.tool.completed=true;p.nodes.find(n=>n.id==='features').justification.tool.runId='pretend-run-before-execution'},'tool'],
 ];
 for(const [label,attack,path]of attacks){const plan=completePlan();attack(plan);const audit=validatePipelineEvidenceProposal(plan);requireActionable(audit,{path});assert.throws(()=>assertPipelineEvidenceProposal(plan),error=>{requireActionable(error.audit,{path});return true},label)}
 const before=auditPipelineEvidenceDelivery(completePlan(),null);assert.notEqual(before.status,'DELIVERED');assert.notEqual(before.delivered,true);
});

test('a complete gear proposal runs actual pixels; delivery covers every effective parameter and remains read-only',async()=>{
 const {w,plan,result}=await executed();assert.equal(result.status,'OK');assert.equal(result.measurements.visibleTeeth,14);assert.equal(result.classification.status,'PASS');const audit=auditPipelineEvidenceDelivery(plan,result);assert.equal(audit.status,'DELIVERED',JSON.stringify(audit.errors));assert.equal(audit.delivered,true);assert.equal(audit.errors.length,0);const feature=trace(result);assert.ok(Object.keys(feature.parameters).length>Object.keys(OPERATOR_REGISTRY['shape.gear'].params).length);const names=new Set(audit.nodes.find(node=>node.nodeId==='features').sections.parameters.rows.map(row=>row.name));for(const name of new Set([...Object.keys(feature.parameters),...feature.decision.parameterChoices.map(choice=>choice.name)]))assert.ok(names.has(name),'runtime coverage '+name);assert.ok(feature.artifacts.some(artifact=>artifact.type==='curves'&&artifact.curves?.some(curve=>curve.points?.length>100))||feature.artifacts.some(artifact=>artifact.type==='evidence'&&artifact.data.parameterComparisons?.every(row=>row.curve.length>100)),'real dense supports, not labels, back the parameter comparisons');const before=JSON.stringify(w.data);assert.equal(w.assertPipelineDelivery().delivered,true);assert.equal(assertPipelineEvidenceDelivery(plan,result).delivered,true);assert.equal(JSON.stringify(w.data),before);
});

test('runtime refuses absent, wrong-kind, transplanted, stale, and modified evidence even if copied audit labels claim delivery',async()=>{
 const {plan,result}=await executed(),other=await runPipeline(gear(),plan),attacks=[
  ['missing declared artifact',r=>{const n=trace(r);n.artifacts=n.artifacts.filter(a=>!a.id.endsWith(':feature-evidence'))}],
  ['missing effective parameter',r=>{trace(r).decision.parameterChoices=trace(r).decision.parameterChoices.filter(row=>row.name!=='maxPitchVariation')}],
  ['unresolvable decision reference',r=>{trace(r).decision.parameterChoices.find(row=>row.name==='smoothingWindow').evidenceRefs=['features:never-computed']}],
  ['cross-node reference',r=>{trace(r).decision.parameterChoices.find(row=>row.name==='smoothingWindow').evidenceRefs=['grayscale:grayscale-histogram']}],
  ['cross-run trace transplant',r=>{r.nodes[r.nodes.findIndex(n=>n.id==='features')]=copy(trace(other))}],
  ['cross-run artifact transplant',r=>{const n=trace(r);n.artifacts[n.artifacts.findIndex(a=>a.id.endsWith(':feature-evidence'))]=copy(trace(other).artifacts.find(a=>a.id.endsWith(':feature-evidence')))}],
  ['wrong artifact kind',r=>{trace(r).artifacts.find(a=>a.id.endsWith(':feature-evidence')).type='mask'}],
  ['gate value fabrication',r=>{trace(r).decision.gates.find(gate=>gate.id==='gear.radial_range').actual=999}],
  ['comparison fabrication',r=>{trace(r).artifacts.find(a=>a.id.endsWith(':feature-evidence')).data.parameterComparisons[0].count=99}],
  ['top-level stale run',r=>{r.runId='not-the-produced-run'}],
  ['top-level stale revision',r=>{r.pipelineRevision++}],
 ];
 for(const [label,attack]of attacks){const changed=copy(result);attack(changed);changed.deliveryAudit={status:'DELIVERED',delivered:true,errors:[]};const audit=auditPipelineEvidenceDelivery(plan,changed);requireActionable(audit);assert.notEqual(audit.status,'DELIVERED',label);assert.throws(()=>assertPipelineEvidenceDelivery(plan,changed),undefined,label)}
});

test('runtime semantic coverage, reference ownership, and source checks do not rely only on detecting a changed checksum',async()=>{
 const {plan,result}=await executed(),attacks=[
  ['missing effective parameter',r=>{trace(r).decision.parameterChoices=trace(r).decision.parameterChoices.filter(row=>row.name!=='maxPitchVariation')},'PARAMETER_RUNTIME_COVERAGE_MISSING'],
  ['phantom artifact reference',r=>{trace(r).decision.parameterChoices.find(row=>row.name==='smoothingWindow').evidenceRefs=['features:never-computed']},'EVIDENCE_REFERENCE_INVALID'],
  ['other node artifact reference',r=>{trace(r).decision.parameterChoices.find(row=>row.name==='smoothingWindow').evidenceRefs=['grayscale:grayscale-histogram']},'EVIDENCE_REFERENCE_INVALID'],
  ['ambiguous runtime origin',r=>{trace(r).decision.parameterChoices.find(row=>row.name==='smoothingWindow').source='AI-knows'},'PARAMETER_RUNTIME_EVIDENCE_MISSING'],
  ['different actual parameter',r=>{trace(r).decision.parameterChoices.find(row=>row.name==='smoothingWindow').value=97},'PARAMETER_VALUE_MISMATCH'],
 ];
 for(const [label,attack,code]of attacks){const changed=copy(result);attack(changed);trace(changed).decisionFingerprint=pipelineEvidenceFingerprint(trace(changed).decision);const audit=auditPipelineEvidenceDelivery(plan,changed);requireActionable(audit,{nodeId:'features'});assert.ok(audit.errors.some(error=>error.code===code),`${label}: ${JSON.stringify(audit.errors)}`);assert.ok(!audit.errors.some(error=>error.code==='DECISION_CONTENT_CHANGED'),'checksum consistency alone must not certify incomplete evidence')}
});

test('a typed promise becomes deliverable only when the exact promised artifact or gate is actually produced',async()=>{
 const attacks=[['tool artifact',p=>{p.nodes.find(n=>n.id==='features').justification.tool.expectedEvidence.push({kind:'artifact',type:'curves',id:'unproduced-curve'})},'EXPECTED_ARTIFACT_MISSING'],['parameter check',p=>{p.nodes.find(n=>n.id==='features').justification.parameters.find(row=>row.name==='smoothingWindow').verification={kind:'gate',id:'gear.unproduced-quality-check'}},'PARAMETER_VERIFICATION_MISSING'],['boundary check',p=>{p.nodes.find(n=>n.id==='features').justification.boundaries[0].check={kind:'gate',id:'gear.unproduced-boundary-check'}},'BOUNDARY_CHECK_MISSING']];
 for(const [label,change,code]of attacks){const plan=completePlan();change(plan);const result=await runPipeline(gear(),plan);assert.equal(result.measurements.visibleTeeth,14,'operator still processes real pixels independently of the explanation promise');const audit=auditPipelineEvidenceDelivery(plan,result);requireActionable(audit,{nodeId:'features'});assert.ok(audit.errors.some(error=>error.code===code),`${label}: ${JSON.stringify(audit.errors)}`);assert.notEqual(audit.status,'DELIVERED')}
});

test('editing parameters invalidates current delivery and historical plans never acquire invented author reasons',async()=>{
 const {w,plan,result,decode}=await executed(),old=copy(plan);w.updatePipelineParameters('features',{expectedTeeth:14,smoothingWindow:7});assert.equal(w.image.pipelineResult,undefined);assert.equal(w.image.previousPipelineResult.runId,result.runId);assert.equal(w.isPipelineResultCurrent(result),false);assert.throws(()=>w.assertPipelineDelivery());requireActionable(auditPipelineEvidenceDelivery(w.workflow.pipelinePlan,result));const saved=JSON.parse(w.serialize());for(const node of saved.workflow.pipelinePlan.nodes)delete node.justification;const loaded=new Workspace();await loaded.load(saved,decode);assert.ok(loaded.workflow.pipelinePlan.nodes.every(node=>!node.justification));assert.equal(loaded.image.pipelineResult,undefined);const historical=requireActionable(validatePipelineEvidenceProposal(loaded.workflow.pipelinePlan));assert.notEqual(historical.delivered,true);assert.throws(()=>loaded.assertPipelineDelivery());assert.equal(old.nodes.find(n=>n.id==='features').params.smoothingWindow,undefined);assert.equal(result.measurements.visibleTeeth,14);
});

test('runtime failure retains diagnostics but cannot pass delivery; absent manufacturing specifications remain UNKNOWN',async()=>{
 const failed=await executed({raster:gear({blank:true})});assert.equal(failed.result.status,'FAILED');assert.equal(failed.result.classification.status,'UNKNOWN');assert.ok(failed.result.nodes.some(node=>node.status==='FAILED'));assert.ok(failed.result.nodes.some(node=>node.status==='SKIPPED'));assert.ok(failed.result.nodes.some(node=>node.artifacts.length),'diagnostic artifacts remain available');const audit=auditPipelineEvidenceDelivery(failed.plan,failed.result);assert.equal(audit.delivered,false);assert.notEqual(audit.status,'DELIVERED');assert.throws(()=>failed.w.assertPipelineDelivery());assert.ok(failed.w.readPipelineEvidence({node_id:'segment'}).runId,'failed current run may still be diagnosed');const missing=await executed({withRules:false});assert.equal(missing.result.measurements.visibleTeeth,14);assert.equal(missing.result.classification.status,'UNKNOWN');assert.equal(missing.result.classification.reason,'SPEC_MISSING');assert.notEqual(auditPipelineEvidenceDelivery(missing.plan,missing.result).delivered,true);
});

test('a successful measurement cannot certify an author boundary whose selected quality check was never applicable',async()=>{
 const plan=completePlan();plan.nodes.find(n=>n.id==='features').justification.boundaries[0].check={kind:'gate',id:'gear.nominal_missing_consistency'};const result=await runPipeline(gear(),plan);assert.equal(result.status,'OK');assert.equal(result.measurements.visibleTeeth,14);assert.equal(result.classification.status,'PASS');assert.equal(trace(result).decision.gates.find(gate=>gate.id==='gear.nominal_missing_consistency').status,'NOT_APPLICABLE');const audit=auditPipelineEvidenceDelivery(plan,result),node=audit.nodes.find(node=>node.nodeId==='features');assert.equal(audit.status,'DIAGNOSTIC_ONLY');assert.equal(audit.delivered,false);assert.equal(node.delivered,false);assert.equal(node.sections.boundaries.rows[0].status,'NOT_EVALUATED');assert.throws(()=>assertPipelineEvidenceDelivery(plan,result),error=>{requireActionable(error.audit,{nodeId:'features'});assert.ok(error.audit.errors.some(issue=>issue.code==='NODE_DIAGNOSTIC_ONLY'));return true});
});
