import test from 'node:test';
import assert from 'node:assert/strict';
import {createPipelinePlan,OPERATOR_REGISTRY,getPipelineCapabilities} from '../src/pipeline-registry.js';
import {runPipeline} from '../src/pipeline-runtime.js';
import {validatePipelineEvidenceProposal,auditPipelineEvidenceDelivery,expectedPipelineParameterSource,pipelineEvidenceFingerprint,validateOperationEvidenceJustification} from '../src/pipeline-evidence-contract.js';
import {Workspace} from '../src/workspace.js';

function proposal({task='annulus',rules=[{measurement:'closedHoleCount',equals:1}]}={}){
  const plan=createPipelinePlan({task,rules});plan.provenance={source:'agent'};
  for(const node of plan.nodes){
    node.parameterSources=Object.fromEntries(Object.keys(node.params).map(name=>[name,'agent-proposal']));
    node.justification={tool:{reason:node.op==='geometry.annulus'?'這個閉合圓環目標需要分別擬合實際外緣與孔緣，並核對支持、覆蓋及殘差；不以輪廓閉合代替圓形成立。':`本案以 ${node.op} 處理明確的輸入型別，保留當次實算輸出供下游檢查，不宣稱已比較所有工具。`,expectedEvidence:[{kind:'artifact',type:'evidence'}]},parameters:Object.keys(OPERATOR_REGISTRY[node.op].params).map(name=>({name,source:expectedPipelineParameterSource(node,plan,name),reason:`本案 ${name} 依保存來源使用；預設值只作工程策略，實算後核對實值，不宣稱最優。`,verification:{kind:'execution-status',allowed:['OK']}})),boundaries:[{condition:'輸入與本步執行必須成立，否則不能使用下游數值作可靠量測。',check:{kind:'execution-status',allowed:['OK']},onFailure:'UNKNOWN'}]};
  }
  return plan;
}
function ring(){const width=140,height=120,gray=new Uint8Array(width*height).fill(240);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const radius=Math.hypot(x+.5-70,y+.5-60);if(radius<45&&radius>18)gray[y*width+x]=20;}return {width,height,gray};}

test('capabilities distinguish absent specifications, image-derived policies and fixed defaults without inventing author reasons',()=>{
  const caps=getPipelineCapabilities();assert.equal(caps.evidenceContract.requiredForAgentSubmission,true);
  for(const task of ['gear','annulus','holes']){
    const plan=proposal({task});assert.equal(validatePipelineEvidenceProposal(plan).valid,true);
    for(const node of plan.nodes)for(const name of Object.keys(OPERATOR_REGISTRY[node.op].params))assert.ok(OPERATOR_REGISTRY[node.op].parameterOrigins[name].whenOmitted);
    assert.ok(createPipelinePlan({task}).nodes.every(node=>!node.justification));
  }
  const gear=createPipelinePlan({task:'gear'}).nodes.find(node=>node.id==='features');assert.equal(expectedPipelineParameterSource(gear,{},'sampleCount'),'data-derived');assert.equal(expectedPipelineParameterSource(gear,{},'expectedTeeth'),'not-supplied');
  const plan=proposal();plan.nodes.find(node=>node.id==='rules').justification.parameters[0].source='human-input';assert.ok(validatePipelineEvidenceProposal(plan).errors.some(error=>error.code==='PARAMETER_SOURCE_MISMATCH'));
});

test('delivery uses actual output measurements and rule artifacts instead of accepting modified top-level claims',async()=>{
  const plan=proposal(),result=await runPipeline(ring(),plan);assert.equal(result.deliveryAudit.delivered,true,JSON.stringify(result.deliveryAudit.errors));
  const changed=structuredClone(result);changed.measurements.outerDiameter=999;assert.ok(auditPipelineEvidenceDelivery(plan,changed).errors.some(error=>error.code==='MEASUREMENTS_EVIDENCE_MISMATCH'));
  const unspecified=proposal({rules:[]}),unknown=await runPipeline(ring(),unspecified);assert.equal(unknown.deliveryAudit.status,'DIAGNOSTIC_ONLY');unknown.classification={status:'PASS',reason:'invented',rules:[]};assert.ok(auditPipelineEvidenceDelivery(unspecified,unknown).errors.some(error=>error.code==='CLASSIFICATION_EVIDENCE_MISMATCH'));
  const originalReason=result.nodes.find(node=>node.id==='features').justification.tool.reason;plan.nodes.find(node=>node.id==='features').justification.tool.reason='修改後的新方案理由';assert.equal(result.nodes.find(node=>node.id==='features').justification.tool.reason,originalReason);assert.equal(auditPipelineEvidenceDelivery(plan,result).delivered,false);
});

test('removing real model gates remains incomplete even when a caller recomputes a consistency checksum',async()=>{
  const plan=proposal(),result=await runPipeline(ring(),plan),feature=result.nodes.find(node=>node.id==='features');feature.decision.gates=feature.decision.gates.filter(gate=>gate.id!=='annulus.outer.rms');feature.decisionFingerprint=pipelineEvidenceFingerprint(feature.decision);
  const audit=auditPipelineEvidenceDelivery(plan,result);assert.equal(audit.delivered,false);assert.ok(audit.errors.some(error=>error.code==='GATE_COVERAGE_MISSING'));assert.ok(!audit.errors.some(error=>error.code==='DECISION_CONTENT_CHANGED'));
});

test('a node certificate requires every upstream step while unresolved rules still block whole-pipeline delivery',async()=>{
  const w=new Workspace(),raster={...ring(),sha256:'f'.repeat(64)};await w.addImages([{name:'camera-neutral.png',dataUrl:'fixture:camera'}],async()=>raster);
  w.createPipeline(proposal({rules:[]}),{source:'agent'});await w.runPipelineImage();const before=JSON.stringify(w.data),certificate=w.assertPipelineDelivery(undefined,'features');
  assert.equal(certificate.scope,'NODE_AND_UPSTREAM');assert.equal(certificate.delivered,true);assert.equal(certificate.binding.runId,w.image.pipelineResult.runId);assert.ok(certificate.auditedNodeIds.includes('grayscale'));assert.ok(!certificate.auditedNodeIds.includes('rules'));assert.equal(certificate.pipelineDeliveryStatus,'DIAGNOSTIC_ONLY');assert.equal(JSON.stringify(w.data),before);
  assert.throws(()=>w.assertPipelineDelivery(),error=>error.audit.errors.some(row=>row.code==='CLASSIFICATION_UNRESOLVED'));assert.throws(()=>w.assertPipelineDelivery(undefined,'absent'),error=>error.errors.some(row=>row.code==='NODE_UNKNOWN'));
  const legacy=proposal({rules:[]});delete legacy.nodes[0].justification;w.createPipeline(legacy,{source:'human'});await w.runPipelineImage();assert.throws(()=>w.assertPipelineDelivery(undefined,'features'),error=>error.errors.some(row=>row.nodeId==='grayscale'));
});

test('non-pipeline tools reuse the three-part planning check with host-owned catalogs and provenance',()=>{
  const options={nodeId:'edge-trial',requiredParameters:[{name:'intent',source:'agent-explicit'},{name:'threshold',source:'inherited-recipe'}],evidenceArtifacts:[{id:'edge-overview',type:'image'},{id:'edge-quality',type:'evidence'}],gateIds:['quality']};
  const justification={tool:{reason:'以工程師所畫方向搜尋實際支持邊，保持原本檢測ROI；不足支持或多候選時不冒選。',expectedEvidence:[{kind:'artifact',type:'image',id:'edge-overview'}]},parameters:[{name:'intent',source:'agent-explicit',reason:'這次以工程師表達的外側上緣作搜尋目的，沒有改測量規格。',verification:{kind:'artifact',type:'image',id:'edge-overview'}},{name:'threshold',source:'inherited-recipe',reason:'沿用已保存門檻，核對本次真實支持，不冒稱調優過。',verification:{kind:'artifact',type:'evidence',id:'edge-quality'}}],boundaries:[{condition:'實際支持、連續性與殘差的品質gate必須成立。',check:{kind:'gate',id:'quality'},onFailure:'UNKNOWN'}]};
  const valid=validateOperationEvidenceJustification(justification,options);assert.equal(valid.valid,true,JSON.stringify(valid.errors));assert.equal(valid.delivered,false);assert.equal(valid.actualEvidence,'PENDING');
  const bad=structuredClone(justification);bad.parameters[1].source='human-input';bad.tool.expectedEvidence[0].id='uncomputed';bad.boundaries[0].check.id='not-real';bad.tool.completed=true;const rejected=validateOperationEvidenceJustification(bad,options);for(const code of ['PARAMETER_SOURCE_MISMATCH','ARTIFACT_SELECTOR_UNSUPPORTED','GATE_SELECTOR_UNSUPPORTED','UNSUPPORTED_EVIDENCE_FIELD'])assert.ok(rejected.errors.some(error=>error.code===code),code);
});

test('Agent graph submission cannot confer human tool-selection provenance on a new revision',async()=>{
  const w=new Workspace(),raster={...ring(),sha256:'e'.repeat(64)};await w.addImages([{name:'neutral.png',dataUrl:'fixture:neutral'}],async()=>raster);
  const claimed=proposal();for(const node of claimed.nodes)node.provenance={source:'human',humanConfirmed:true};const original=structuredClone(claimed);
  w.createPipeline(claimed,{source:'agent'});assert.deepEqual(claimed,original,'submission does not rewrite the historical input object');assert.ok(w.workflow.pipelinePlan.nodes.every(node=>node.provenance.source==='agent'&&!Object.hasOwn(node.provenance,'humanConfirmed')));
  await w.runPipelineImage();assert.ok(w.image.pipelineResult.nodes.every(node=>node.decision.toolChoice.source==='agent'&&node.decision.toolChoice.setBy==='agent'));assert.equal(w.assertPipelineDelivery().delivered,true);
  const changed=structuredClone(w.image.pipelineResult),feature=changed.nodes.find(node=>node.id==='features');feature.decision.toolChoice.source=feature.decision.toolChoice.setBy='human';feature.decisionFingerprint=pipelineEvidenceFingerprint(feature.decision);assert.ok(auditPipelineEvidenceDelivery(w.workflow.pipelinePlan,changed).errors.some(error=>error.code==='TOOL_SOURCE_MISMATCH'));
  const direct=await runPipeline(ring(),claimed);assert.ok(direct.nodes.every(node=>node.decision.toolChoice.source==='agent'));assert.ok(direct.deliveryAudit.errors.some(error=>error.code==='NODE_SOURCE_MISMATCH'));assert.equal(direct.deliveryAudit.delivered,false);
  const legacy=proposal();delete legacy.provenance;for(const node of legacy.nodes)delete node.provenance;validatePipelineEvidenceProposal(legacy);assert.ok(legacy.nodes.every(node=>!Object.hasOwn(node,'provenance')),'validation never supplies human provenance to legacy nodes');
});
