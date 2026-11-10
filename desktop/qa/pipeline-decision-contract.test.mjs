import test from 'node:test';
import assert from 'node:assert/strict';
import {createPipelinePlan,runPipeline,NODE_DECISION_SCHEMA} from '../src/pipeline-runtime.js';

function raster(width,height,predicate) {
  const gray=new Uint8Array(width*height).fill(255);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(predicate(x+.5,y+.5))gray[y*width+x]=0;
  return {width,height,gray};
}
const ring=()=>raster(180,160,(x,y)=>Math.hypot(x-90,y-80)<60&&Math.hypot(x-94,y-78)>26);
const node=(result,id)=>result.nodes.find(entry=>entry.id===id);
const choice=(trace,name)=>trace.decision.parameterChoices.find(entry=>entry.name===name);
const localArtifact=(trace,suffix)=>trace.artifacts.find(entry=>entry.id===`${trace.id}:${suffix}`);
const ALLOWED_SOURCES=new Set(['operator-default','plan','agent','human','data-derived']);
function gearWithBore(kind='normal') {
  return raster(260,260,(x,y)=>{
    const dx=x-130,dy=y-130,radius=Math.hypot(dx,dy),angle=Math.atan2(dy,dx),outer=kind==='smooth'?80:80+7*Math.cos(14*angle);
    const bore=kind==='zero'?false:kind==='two'?Math.hypot(dx-22,dy)<12||Math.hypot(dx+22,dy)<12:kind==='ellipse'?Math.hypot((dx-4)/35,(dy+2)/14)<1:Math.hypot(dx-4,dy+2)<(kind==='tiny'?2.5:24);
    return radius<outer&&!bore;
  });
}
function assertLocalEvidenceRefs(value,ids) {
  if(!value||typeof value!=='object')return;
  for(const [key,entry] of Object.entries(value)){
    if(key==='evidenceRefs')for(const reference of entry)assert.ok(ids.has(reference),`missing local evidence ${reference}`);
    else if(entry&&typeof entry==='object')assertLocalEvidenceRefs(entry,ids);
  }
}

test('every executed node saves one uniform decision with real local artifact references',async()=>{
  const plan=createPipelinePlan({task:'annulus'}),result=await runPipeline(ring(),plan);
  for(const trace of result.nodes){
    assert.equal(trace.decision.schema,NODE_DECISION_SCHEMA);assert.equal(trace.decision.executionStatus,trace.status);
    assert.equal(trace.decision.toolChoice.status,trace.outputSummary.executionMode==='pass-through'?'bypassed':'prescribed');assert.equal(trace.decision.toolChoice.comparison.performed,false);assert.equal(trace.decision.toolChoice.comparison.optimizationPerformed,false);
    assert.ok(trace.decision.boundaries.length>0);assert.ok(!Object.hasOwn(trace,'toolChoice'));
    assertLocalEvidenceRefs(trace.decision,new Set(trace.artifacts.map(artifact=>artifact.id)));
    for(const parameter of trace.decision.parameterChoices){assert.ok(ALLOWED_SOURCES.has(parameter.source));assert.ok(ALLOWED_SOURCES.has(parameter.setBy));assert.ok(ALLOWED_SOURCES.has(parameter.derivation.source));assert.equal(typeof parameter.comparison.performed,'boolean');assert.equal(typeof parameter.comparison.optimizationPerformed,'boolean');}
  }
  const saved=JSON.parse(JSON.stringify(result));assert.deepEqual(saved.nodes.map(trace=>trace.decision),result.nodes.map(trace=>trace.decision));
});

test('grayscale states the actual conversion, fixed formula and unavailable color calibration',async()=>{
  const plan=createPipelinePlan({task:'holes'});plan.nodes=plan.nodes.slice(0,1);
  const fromColor=await runPipeline({width:2,height:1,rgba:new Uint8Array([255,0,0,255,0,255,0,0])},plan),trace=node(fromColor,'grayscale');
  const weights=choice(trace,'luminanceWeights');assert.deepEqual(weights.value,{red:.299,green:.587,blue:.114});assert.equal(weights.observedValues.conversionApplied,true);assert.equal(weights.comparison.performed,false);assert.equal(weights.comparison.optimizationPerformed,false);assert.equal(weights.source,'operator-default');
  const histogram=localArtifact(trace,'grayscale-histogram');assert.equal(histogram.values[76],1);assert.equal(histogram.values[150],1);assert.equal(histogram.values.reduce((sum,count)=>sum+count,0),2);
  assert.match(weights.derivation.formula,/0\.299 R/);assert.ok(trace.decision.boundaries.some(entry=>entry.code==='COLOR_INFORMATION_LIMIT'));
  const provided=await runPipeline({width:2,height:1,gray:new Float32Array([2.4,270])},plan),conversion=localArtifact(node(provided,'grayscale'),'grayscale-conversion').data;
  assert.equal(conversion.applied,false);assert.equal(conversion.representation,'provided-gray');assert.equal(conversion.originalStorageType,'Float32Array');assert.match(choice(node(provided,'grayscale'),'luminanceWeights').reason,/upstream coefficients are unknown/);
});

test('documented decoder gray provenance is preserved while runtime quantization stays distinct',async()=>{
  const plan=createPipelinePlan({task:'holes'});plan.nodes=plan.nodes.slice(0,1);
  const provenance={source:'image.decode@1',formula:'0.299*R + 0.587*G + 0.114*B',coefficients:{red:.299,green:.587,blue:.114},inputRepresentation:'canvas-rgba8',precision:'float32',colorManagement:'browser-canvas; no explicit linearization/ICC calibration'};
  const result=await runPipeline({width:2,height:1,gray:new Float32Array([76.245,149.685]),grayProvenance:provenance},plan),weights=choice(node(result,'grayscale'),'luminanceWeights');
  assert.equal(weights.method,'documented-upstream-luminance-formula');assert.deepEqual(weights.value,provenance.coefficients);assert.equal(weights.derivation.formula,provenance.formula);assert.equal(weights.derivation.applied,false);assert.equal(weights.derivation.appliedUpstream,true);assert.equal(weights.derivation.upstreamSource,'image.decode@1');assert.deepEqual(weights.observedValues.upstreamProvenance,provenance);
});

test('Otsu stores all 256 actual variances and the complete optimal platform with first tie',async()=>{
  const image=ring();for(let i=0;i<image.gray.length;i++)image.gray[i]=image.gray[i]===0?20:230;const result=await runPipeline(image,createPipelinePlan({task:'annulus'})),trace=node(result,'segment'),histogram=localArtifact(trace,'otsu-histogram'),decision=choice(trace,'threshold');
  assert.equal(histogram.thresholdScores.length,256);assert.equal(histogram.betweenClassVariance.length,256);assert.equal(localArtifact(trace,'otsu-threshold-variance').curves[0].points.length,256);
  assert.deepEqual(histogram.optimalThresholds,Array.from({length:210},(_,index)=>index+20));assert.deepEqual(histogram.optimalPlateaus,[{start:20,end:229}]);assert.equal(histogram.selectedThreshold,20);assert.equal(histogram.tieBreak,'first-lowest-threshold');
  const dark=image.gray.filter(value=>value===20).length,bright=image.gray.length-dark,expectedVariance=dark/image.gray.length*bright/image.gray.length*210**2;
  for(let threshold=20;threshold<230;threshold++){assert.equal(histogram.thresholdScores[threshold].valid,true);assert.ok(Math.abs(histogram.betweenClassVariance[threshold]-expectedVariance)<1e-8);}for(const threshold of [0,19,230,255])assert.equal(histogram.thresholdScores[threshold].valid,false);
  assert.equal(histogram.thresholdScores[255].valid,false);assert.equal(histogram.betweenClassVariance[255],null);
  assert.equal(decision.source,'data-derived');assert.equal(decision.setBy,'operator-default');assert.equal(decision.comparison.performed,true);assert.equal(decision.comparison.candidateCount,256);assert.equal(decision.comparison.optimizationPerformed,true);assert.match(decision.comparison.claim,/no segmentation correctness/);
  assert.ok(trace.decision.boundaries.some(entry=>entry.code==='OTSU_OBJECTIVE_LIMIT'));
});

test('an explicit Otsu threshold remains prescribed while the full curve is diagnostic',async()=>{
  const plan=createPipelinePlan({task:'annulus',parameters:{segmentation:{threshold:100}}});plan.nodes[1].parameterSources={threshold:'agent-proposal'};
  const result=await runPipeline(ring(),plan),trace=node(result,'segment'),threshold=choice(trace,'threshold');
  assert.equal(trace.outputSummary.threshold,100);assert.equal(threshold.value,100);assert.equal(threshold.source,'agent');assert.equal(threshold.setBy,'agent');assert.equal(threshold.rawSource,'agent-proposal');assert.equal(threshold.method,'prescribed-threshold');assert.equal(threshold.comparison.performed,true);assert.equal(threshold.comparison.optimizationPerformed,false);assert.equal(threshold.comparison.selectionApplied,false);assert.equal(localArtifact(trace,'otsu-histogram').thresholdScores.length,256);
});

test('polarity decision records actual border occupancy and its fixed engineering ambiguity band',async()=>{
  const result=await runPipeline(ring(),createPipelinePlan({task:'annulus'})),trace=node(result,'segment'),basis=localArtifact(trace,'otsu-polarity').data,polarity=choice(trace,'polarity');
  assert.equal(basis.borderPixels,2*180+2*(160-2));assert.equal(basis.borderDarkPixels,0);assert.equal(basis.borderDarkRatio,0);assert.equal(polarity.value,'auto');assert.equal(polarity.effectiveValue,'dark');assert.equal(polarity.source,'operator-default');assert.equal(polarity.derivation.source,'data-derived');assert.deepEqual(polarity.derivation.constants,{darkFractionDecision:.5,ambiguityHalfWidth:.05});assert.equal(polarity.comparison.performed,false);
});

test('failed segmentation and skipped nodes retain honest comparison status and boundaries',async()=>{
  const result=await runPipeline({width:30,height:30,gray:new Uint8Array(900).fill(127)},createPipelinePlan({task:'gear'})),failed=node(result,'segment'),skipped=node(result,'features');
  assert.equal(failed.status,'FAILED');assert.equal(localArtifact(failed,'otsu-histogram').thresholdScores.length,256);assert.deepEqual(localArtifact(failed,'otsu-histogram').optimalThresholds,[]);assert.equal(choice(failed,'threshold').value,null);assert.equal(choice(failed,'threshold').comparison.performed,true);assert.equal(choice(failed,'threshold').comparison.optimizationPerformed,false);
  assert.equal(skipped.status,'SKIPPED');assert.equal(skipped.decision.executionStatus,'SKIPPED');assert.ok(skipped.decision.parameterChoices.every(entry=>entry.status==='not-executed'&&entry.comparison.performed===false));assert.ok(skipped.decision.boundaries.some(entry=>entry.code==='NODE_NOT_EXECUTED'));
});

test('components records every candidate, rejection reasons and an unoptimized minimum area',async()=>{
  const image=raster(100,80,(x,y)=>(x<4&&y>20&&y<40)||(x>10&&x<12&&y>10&&y<12)||Math.hypot(x-60,y-40)<16),result=await runPipeline(image,createPipelinePlan({task:'holes'})),trace=node(result,'components'),data=localArtifact(trace,'component-candidates').data;
  assert.equal(data.candidateCount,3);assert.equal(data.candidates.length,3);assert.equal(data.candidatesTruncated,false);assert.equal(data.detailCoverage,'all-candidates');assert.equal(data.eligibleCount,1);
  assert.ok(data.candidates.some(candidate=>candidate.rejectionReasons.includes('AREA_BELOW_MINIMUM')&&candidate.eligible===false));assert.ok(data.candidates.some(candidate=>candidate.rejectionReasons.includes('TOUCHES_IMAGE_BOUNDARY')&&candidate.eligible===false));assert.equal(data.candidates.filter(candidate=>candidate.selectionStatus==='selected').length,1);
  for(const candidate of data.candidates)assert.equal(candidate.eligible,candidate.rejectionReasons.length===0);
  const minArea=choice(trace,'minArea');assert.equal(minArea.value,12);assert.equal(minArea.source,'operator-default');assert.equal(minArea.comparison.performed,false);assert.equal(minArea.comparison.optimizationPerformed,false);assert.match(minArea.reason,/alternative minimum areas were not tuned/);
  assert.equal(choice(trace,'selection').comparison.optimizationPerformed,false);assert.equal(data.selectionEvidence.strategy,'unique');
});

test('ambiguous candidates are exposed rather than described as an optimized selection',async()=>{
  const image=raster(100,80,(x,y)=>Math.hypot(x-25,y-40)<13||Math.hypot(x-70,y-40)<16),result=await runPipeline(image,createPipelinePlan({task:'holes'})),trace=node(result,'components'),data=localArtifact(trace,'component-candidates').data;
  assert.equal(trace.status,'FAILED');assert.ok(data.candidates.every(candidate=>candidate.eligible&&candidate.selectionStatus==='ambiguous'));assert.equal(data.selectionEvidence.selectedComponentId,null);assert.equal(choice(trace,'selection').comparison.selectionApplied,false);assert.equal(choice(trace,'selection').comparison.optimizationPerformed,false);
});

test('full candidate evidence remains available beyond the compact summary page limit',async()=>{
  const image=raster(110,110,(x,y)=>Math.floor(x)%3===2&&Math.floor(y)%3===2&&x<108&&y<108),plan=createPipelinePlan({task:'holes',parameters:{components:{minArea:1},segmentation:{polarity:'dark'}}}),result=await runPipeline(image,plan),trace=node(result,'components'),data=localArtifact(trace,'component-candidates').data;
  assert.ok(data.candidateCount>1000);assert.equal(data.candidates.length,data.candidateCount);assert.equal(data.candidatesTruncated,false);assert.ok(data.candidates.every(candidate=>candidate.rejectionReasons.length===0&&candidate.eligibilityTests.minArea.passed&&candidate.selectionStatus==='ambiguous'));
});

test('feature input setting origin survives analyzer user_specification derivation',async()=>{
  const plan=createPipelinePlan({task:'annulus',parameters:{features:{maxRelativeResidual:.03,maxResidualPx:1.5}}});plan.provenance={source:'agent'};plan.nodes[3].parameterSources={maxRelativeResidual:'agent-proposal',maxResidualPx:'human'};
  const result=await runPipeline(ring(),plan),trace=node(result,'features');assert.equal(trace.parameterSources.maxRelativeResidual,'agent-proposal');assert.equal(trace.parameterSources.maxResidualPx,'human');assert.equal(trace.parameterDerivations.maxRelativeResidual.source,'user_specification');
  assert.equal(choice(trace,'maxRelativeResidual').source,'agent');assert.equal(choice(trace,'maxRelativeResidual').setBy,'agent');assert.equal(choice(trace,'maxRelativeResidual').derivation.source,'plan');assert.equal(choice(trace,'maxResidualPx').source,'human');assert.equal(trace.decision.toolChoice.source,'agent');
  assert.equal(choice(trace,'minAngularCoverageDeg').source,'operator-default');assert.equal(choice(trace,'minAngularCoverageDeg').comparison.performed,false);assert.equal(choice(trace,'minAngularCoverageDeg').observedValues.outerAngularCoverageDeg,result.measurements.outerCircle.angularCoverageDeg);
});

test('gear records real local candidate curves and indices while the base remains unoptimized',async()=>{
  const image=raster(260,260,(x,y)=>{const r=Math.hypot(x-130,y-130),angle=Math.atan2(y-130,x-130),outer=80+7*Math.cos(14*angle);return r<outer&&r>25;});
  const result=await runPipeline(image,createPipelinePlan({task:'gear',parameters:{expectedTeeth:14}})),trace=node(result,'features'),data=localArtifact(trace,'feature-evidence').data,window=choice(trace,'smoothingWindow');
  assert.equal(data.parameterComparisons.length,5);assert.equal(window.comparison.performed,true);assert.equal(window.comparison.optimizationPerformed,false);assert.equal(window.comparison.selectionApplied,false);assert.equal(window.comparison.baseCandidateIndex,0);assert.equal(window.comparison.candidateCurveAvailable,true);
  for(const [index,candidate] of window.comparison.candidates.entries()){assert.equal(candidate.count,data.parameterComparisons[index].count);assert.deepEqual(candidate.peakIndices,data.parameterComparisons[index].peakIndices);assert.equal(candidate.curvePath,`parameterComparisons[${index}].curve`);assert.equal(candidate.curveAvailable,true);}
  assert.equal(window.source,'data-derived');assert.equal(window.setBy,'operator-default');assert.equal(window.derivation.policySource,'operator-default');assert.equal(window.derivation.constants.pitchFraction,.12);assert.match(window.comparison.claim,/base was not selected as best/);
  assert.equal(choice(trace,'expectedTeeth').source,'human');assert.equal(choice(trace,'expectedTeeth').comparison.optimizationPerformed,false);
});

test('rules record each supplied bound origin and measured comparison, without inventing tolerances',async()=>{
  const plan=createPipelinePlan({task:'annulus',rules:[{measurement:'outerDiameter',min:119,max:121,unit:'px'}]});plan.nodes[4].parameterSources={rules:'agent-proposal','rules[0].max':'human'};
  const result=await runPipeline(ring(),plan),trace=node(result,'rules'),lower=choice(trace,'rules[0].min'),upper=choice(trace,'rules[0].max');
  assert.equal(lower.source,'agent');assert.equal(upper.source,'human');assert.equal(lower.value,119);assert.equal(upper.value,121);assert.equal(lower.observedValues.actual,result.measurements.outerDiameter);assert.equal(lower.comparison.performed,true);assert.equal(lower.comparison.optimizationPerformed,false);assert.ok(trace.decision.boundaries.some(entry=>entry.code==='AGENT_RULE_PROPOSAL'));
  const missing=await runPipeline(ring(),createPipelinePlan({task:'annulus'})),empty=node(missing,'rules');assert.equal(missing.classification.reason,'SPEC_MISSING');assert.equal(choice(empty,'rules').value.length,0);assert.equal(choice(empty,'rules').comparison.performed,false);assert.ok(empty.decision.boundaries.some(entry=>entry.code==='SPEC_MISSING'));
  const missingBound=await runPipeline(ring(),createPipelinePlan({task:'annulus',rules:[{measurement:'outerDiameter'}]}));assert.equal(missingBound.classification.reason,'SPEC_MISSING');assert.equal(choice(node(missingBound,'rules'),'rules[0].specification').status,'not-supplied');
});

test('hole parameter evidence identifies the real area filter and does not pretend to search layouts',async()=>{
  const image=ring(),plan=createPipelinePlan({task:'holes',parameters:{minHoleArea:3000}}),result=await runPipeline(image,plan),trace=node(result,'features'),filter=choice(trace,'minHoleArea');
  assert.equal(filter.source,'human');assert.equal(filter.comparison.performed,false);assert.equal(filter.observedValues.closedHoleCount,0);assert.equal(filter.observedValues.ignoredHoleCount,1);assert.ok(filter.observedValues.ignoredHoleAreas[0].area<3000);assert.equal(choice(trace,'expectedPositions').status,'not-supplied');assert.ok(trace.decision.boundaries.some(entry=>entry.code==='HOLE_SPECIFICATION_SCOPE'));
});

test('annulus gates expose combined residual allowance, actual values and threshold origins',async()=>{
  const plan=createPipelinePlan({task:'annulus',parameters:{maxRelativeResidual:.03}});plan.nodes[3].parameterSources={maxRelativeResidual:'agent-proposal'};
  const result=await runPipeline(ring(),plan),trace=node(result,'features'),gates=trace.decision.gates,outer=gates.find(gate=>gate.id==='annulus.outer.rms');
  assert.equal(outer.actual,result.measurements.outerCircle.rmsResidual);assert.equal(outer.operator,'<=');assert.equal(outer.threshold,Math.max(1,result.measurements.outerCircle.radius*.03));assert.equal(outer.source,'data-derived');assert.equal(outer.thresholdSources.maxRelativeResidual.source,'agent');assert.equal(outer.thresholdSources.maxResidualPx.source,'operator-default');assert.equal(outer.status,'PASS');assert.ok(gates.every(gate=>gate.status==='PASS'));
  assert.equal(gates.find(gate=>gate.id==='annulus.outer.coverage').actual,result.measurements.outerCircle.angularCoverageDeg);
});

test('an early annulus fit rejection does not mark downstream acceptance gates as passed',async()=>{
  const image=raster(180,160,(x,y)=>Math.abs(x-90)<65&&Math.abs(y-80)<55&&!(Math.hypot(x-90,y-80)<24)),result=await runPipeline(image,createPipelinePlan({task:'annulus'})),trace=node(result,'features');
  assert.equal(trace.outputSummary.featureStatus,'UNKNOWN');const rms=trace.decision.gates.find(gate=>gate.id==='annulus.outer.rms');assert.equal(rms.status,'FAIL');assert.ok(rms.actual>rms.threshold);
  assert.equal(trace.decision.gates.find(gate=>gate.id==='annulus.outer.max_abs').status,'NOT_EVALUATED');assert.ok(trace.decision.gates.filter(gate=>gate.id.startsWith('annulus.inner.')).every(gate=>gate.status==='NOT_EVALUATED'));assert.equal(trace.decision.gates.find(gate=>gate.id==='annulus.inner_containment').status,'NOT_EVALUATED');
});

test('gear weak-model rejection preserves unexecuted downstream gates even when diagnostics exist',async()=>{
  const circle=raster(220,220,(x,y)=>Math.hypot(x-110,y-110)<75&&Math.hypot(x-110,y-110)>24),result=await runPipeline(circle,createPipelinePlan({task:'gear',parameters:{expectedTeeth:16}})),trace=node(result,'features');
  assert.equal(trace.outputSummary.featureStatus,'UNKNOWN');assert.ok(trace.decision.gates.some(gate=>gate.status==='FAIL'));for(const id of ['gear.parameter_count_agreement','gear.tip_rms','gear.pitch_variation','gear.root_support','gear.radial_depth_model','gear.nominal_missing_consistency'])assert.equal(trace.decision.gates.find(gate=>gate.id===id).status,'NOT_EVALUATED',id);
  assert.equal(trace.decision.gates.find(gate=>gate.id==='gear.radial_range').threshold,2.5);assert.equal(trace.decision.gates.find(gate=>gate.id==='gear.pitch_variation').threshold,.18);assert.equal(trace.decision.gates.find(gate=>gate.id==='gear.root_support').threshold,.7);assert.equal(trace.decision.gates.find(gate=>gate.id==='gear.radial_depth_model').threshold,.35);
});

test('hole topology without nominal sites remains observed; its nominal gate is not applicable',async()=>{
  const result=await runPipeline(ring(),createPipelinePlan({task:'holes'})),gates=node(result,'features').decision.gates;
  assert.equal(gates.find(gate=>gate.id==='holes.complete_boundary').status,'PASS');assert.equal(gates.find(gate=>gate.id==='holes.expected_positions_resolved').status,'NOT_APPLICABLE');assert.equal(result.measurements.missingHoleCount,undefined);
});

test('gear bore-center acceptance saves every fixed quality check from the instrumented selection',async()=>{
  const result=await runPipeline(gearWithBore(),createPipelinePlan({task:'gear',parameters:{expectedTeeth:14}})),trace=node(result,'features'),evidence=localArtifact(trace,'feature-evidence').data,selection=evidence.holeCenterSelection,circle=evidence.holeCenterCandidates.find(candidate=>candidate.id===selection.candidateId).circle,gates=trace.decision.gates.filter(gate=>gate.role==='hole-center-acceptance'),gate=suffix=>gates.find(entry=>entry.id===`gear.hole_center.${suffix}`);
  assert.equal(selection.adopted,true);assert.equal(gates.length,8);assert.ok(gates.every(entry=>entry.status==='PASS'));assert.equal(gate('radius').actual,circle.radius);assert.equal(gate('radius').threshold,4);assert.equal(gate('support').actual,circle.supportCount);assert.equal(gate('support').threshold,24);assert.equal(gate('coverage').actual,circle.angularCoverageDeg);assert.equal(gate('coverage').threshold,300);
  assert.equal(gate('rms').actual,circle.rmsResidual);assert.equal(gate('rms').threshold,selection.quality.rmsAllowancePx);assert.equal(gate('rms').threshold,Math.max(1,circle.radius*.025));assert.equal(gate('max_abs').threshold,selection.quality.maxAbsAllowancePx);assert.equal(gate('max_abs').threshold,gate('rms').threshold*3);assert.equal(gate('rms').thresholdSources.maxResidualPx.source,'operator-default');assert.equal(gate('rms').thresholdSources.maxRelativeResidual.source,'operator-default');assert.equal(gate('rms').source,'data-derived');assert.equal(gate('adopted').actual,true);assert.ok(Number.isFinite(result.measurements.eccentricityPx));
  assertLocalEvidenceRefs({gates},new Set(trace.artifacts.map(artifact=>artifact.id)));
});

test('an already-executed bore fit remains evaluated when later gear applicability rejects the outline',async()=>{
  const result=await runPipeline(gearWithBore('smooth'),createPipelinePlan({task:'gear',parameters:{expectedTeeth:14}})),trace=node(result,'features'),selection=localArtifact(trace,'feature-evidence').data.holeCenterSelection;
  assert.equal(trace.outputSummary.featureStatus,'UNKNOWN');assert.equal(selection.adopted,true);assert.ok(trace.decision.gates.filter(gate=>gate.role==='hole-center-acceptance').every(gate=>gate.status==='PASS'));assert.equal(trace.decision.gates.find(gate=>gate.id==='gear.root_support').status,'NOT_EVALUATED');assert.ok(Number.isFinite(result.measurements.eccentricityPx));
});

test('rejected elliptical or tiny bores retain the actual failure and short-circuited quality checks',async()=>{
  const plan=createPipelinePlan({task:'gear',parameters:{expectedTeeth:14}});
  const elliptical=await runPipeline(gearWithBore('ellipse'),plan),ellipse=node(elliptical,'features'),ellipseGates=ellipse.decision.gates.filter(gate=>gate.role==='hole-center-acceptance');
  assert.equal(localArtifact(ellipse,'feature-evidence').data.holeCenterSelection.adopted,false);assert.equal(ellipseGates.find(gate=>gate.id.endsWith('.rms')).status,'FAIL');assert.equal(ellipseGates.find(gate=>gate.id.endsWith('.max_abs')).status,'NOT_EVALUATED');assert.equal(elliptical.measurements.holeCenter,undefined);assert.equal(elliptical.measurements.eccentricityPx,undefined);
  const tiny=await runPipeline(gearWithBore('tiny'),plan),tinyGates=node(tiny,'features').decision.gates.filter(gate=>gate.role==='hole-center-acceptance');assert.equal(tinyGates.find(gate=>gate.id.endsWith('.radius')).status,'FAIL');for(const suffix of ['support','coverage','rms','max_abs'])assert.equal(tinyGates.find(gate=>gate.id.endsWith('.'+suffix)).status,'NOT_EVALUATED');assert.equal(tiny.measurements.holeCenter,undefined);
});

test('zero or multiple bore candidates make single-bore quality checks not applicable',async()=>{
  for(const [kind,count] of [['zero',0],['two',2]]){
    const result=await runPipeline(gearWithBore(kind),createPipelinePlan({task:'gear',parameters:{expectedTeeth:14}})),trace=node(result,'features'),selection=localArtifact(trace,'feature-evidence').data.holeCenterSelection,gates=trace.decision.gates.filter(gate=>gate.role==='hole-center-acceptance');
    assert.equal(selection.candidateCount,count);assert.equal(selection.quality,null);assert.equal(gates.length,8);assert.ok(gates.every(gate=>gate.status==='NOT_APPLICABLE'));assert.equal(result.measurements.holeCenter,undefined);
  }
});

test('a return before bore selection never fabricates executed bore-quality checks',async()=>{
  const plan=createPipelinePlan({task:'gear',parameters:{sampleCount:120,smoothingWindow:101}}),result=await runPipeline(gearWithBore(),plan),trace=node(result,'features'),evidence=localArtifact(trace,'feature-evidence').data,gates=trace.decision.gates.filter(gate=>gate.role==='hole-center-acceptance');
  assert.equal(trace.outputSummary.reason,'Invalid peak smoothing, prominence or distance parameters.');assert.equal(evidence.holeCenterSelection,undefined);assert.equal(gates.length,8);assert.ok(gates.every(gate=>gate.status==='NOT_EVALUATED'));
});

test('center-refinement gates preserve actual shift, cap and adoption instrumentation',async()=>{
  const result=await runPipeline(gearWithBore(),createPipelinePlan({task:'gear',parameters:{expectedTeeth:14}})),trace=node(result,'features'),evidence=localArtifact(trace,'feature-evidence').data,candidates=evidence.centerEstimation.candidates;
  assert.ok(candidates.length>0);
  for(const [index,candidate] of candidates.entries()){
    const gate=suffix=>trace.decision.gates.find(entry=>entry.id===`gear.center_refinement.${index}.${suffix}`);
    assert.equal(gate('shift_from_initial').role,'workpiece-center-refinement');assert.equal(gate('shift_from_initial').actual,candidate.shiftFromInitialPx);assert.equal(gate('shift_from_initial').threshold,candidate.maximumShiftFromInitialPx);assert.equal(gate('shift_from_initial').thresholdSources.radiusFraction.value,.1);assert.equal(gate('cap_truncated').actual,candidate.capTruncated);assert.equal(gate('cap_truncated').thresholdSources.capTruncatedCount.value,candidate.capTruncatedCount);assert.equal(gate('next_profile_valid').actual,candidate.nextProfileValid);assert.equal(gate('adopted').actual,candidate.adopted);assert.equal(gate('adopted').status,candidate.adopted?'PASS':'FAIL');assert.equal(gate('rms').actual,candidate.rmsResidual);assert.equal(gate('max_abs').threshold,candidate.maxAbsAllowancePx);
  }
});
