import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRgbaInput} from '../src/input-inspection.js';
import {createPipelinePlan,runPipeline,decodeMaskRLE} from '../src/pipeline-runtime.js';
import {analyzeGear} from '../src/shape-features.js';

const node=(result,id)=>result.nodes.find(n=>n.id===id);
const artifact=(trace,id)=>trace.artifacts.find(a=>a.id===`${trace.id}:${id}`);
const choice=(trace,name)=>trace.decision.parameterChoices.find(p=>p.name===name);
function fixture(){
 const width=260,height=220,gray=new Uint8Array(width*height).fill(255);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const dx=x+.5-130,dy=y+.5-110,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
  if(r<79+9*Math.cos(12*a)&&Math.hypot(dx-6,dy+2)>23)gray[y*width+x]=0;
 }
 return {width,height,gray};
}

test('source inspection distinguishes actual RGB color, achromatic intensity, and strict binary labels',()=>{
 const binary=inspectRgbaInput(new Uint8Array([0,0,0,255,255,255,255,255]));
 assert.equal(binary.classification,'binary');assert.equal(binary.strictBinary,true);assert.equal(binary.grayConversionNeeded,false);assert.equal(binary.colorPixels,0);assert.deepEqual(binary.grayLevels,[0,255]);
 const gray=inspectRgbaInput(new Uint8Array([12,12,12,255,129,129,129,255]));
 assert.equal(gray.classification,'grayscale');assert.equal(gray.strictBinary,false);assert.equal(gray.grayConversionNeeded,false);
 const color=inspectRgbaInput(new Uint8Array([5,14,22,255,255,255,255,255]));
 assert.equal(color.classification,'color');assert.equal(color.grayConversionNeeded,true);assert.equal(color.colorPixels,1);assert.equal(color.strictBinary,false);
});

test('strict binary input skips color conversion and Otsu search while retaining the same pixel labels',async()=>{
 const image=fixture(),plan=createPipelinePlan({task:'gear',parameters:{expectedTeeth:12}}),result=await runPipeline(image,plan),gray=node(result,'grayscale'),segment=node(result,'segment');
 assert.equal(gray.outputSummary.executionMode,'pass-through');assert.equal(gray.decision.toolChoice.status,'bypassed');assert.equal(choice(gray,'luminanceWeights').status,'not-needed');
 assert.equal(segment.outputSummary.executionMode,'pass-through');assert.equal(segment.decision.toolChoice.status,'bypassed');assert.equal(segment.outputSummary.thresholdSearch.selectionMethod,'binary-input-pass-through');
 const histogram=artifact(segment,'otsu-histogram');assert.equal(histogram.thresholdScores.length,0);assert.equal(artifact(segment,'otsu-threshold-variance'),undefined);assert.equal(histogram.criterion,null);
 const threshold=choice(segment,'threshold');assert.equal(threshold.comparison.performed,false);assert.equal(threshold.comparison.optimizationPerformed,false);assert.equal(threshold.comparison.candidateCount,0);assert.equal(threshold.observedValues.searchSkipped,true);
 const mask=decodeMaskRLE(artifact(segment,'segmented-mask'));assert.deepEqual(mask,Uint8Array.from(image.gray,value=>Number(value===0)));
 // A requested threshold remains an explicit override, even on a binary image.
 const explicit=await runPipeline(image,createPipelinePlan({task:'gear',parameters:{segmentation:{threshold:100}}})),prescribed=node(explicit,'segment');
 assert.equal(prescribed.outputSummary.threshold,100);assert.equal(prescribed.outputSummary.executionMode,'segmentation');assert.equal(artifact(prescribed,'otsu-histogram').thresholdScores.length,256);assert.equal(choice(prescribed,'threshold').method,'prescribed-threshold');
});

test('decoder record of copied equal channels does not claim a weighted RGB formula was applied',async()=>{
 const plan=createPipelinePlan({task:'gear'});plan.nodes=plan.nodes.slice(0,1);
 const rgba=new Uint8Array([0,0,0,255,255,255,255,255]),inputInspection=inspectRgbaInput(rgba),provenance={source:'image.decode@1',applied:false,formula:'Y = R = G = B; copy existing intensity',coefficients:null,inputInspection};
 const result=await runPipeline({width:2,height:1,gray:new Float32Array([0,255]),grayProvenance:provenance,inputInspection},plan),trace=node(result,'grayscale'),weights=choice(trace,'luminanceWeights');
 assert.equal(trace.outputSummary.executionMode,'pass-through');assert.equal(weights.value,null);assert.equal(weights.derivation.applied,false);assert.equal(weights.derivation.appliedUpstream,false);assert.equal(weights.method,'existing-intensity-pass-through');assert.match(weights.reason,/copied existing intensities/);
 const direct=await runPipeline({width:2,height:1,rgba},plan),converted=artifact(node(direct,'grayscale'),'grayscale-conversion').data;
 assert.equal(converted.applied,false);assert.equal(converted.executionMode,'pass-through');
 const colored=await runPipeline({width:2,height:1,rgba:new Uint8Array([255,0,0,255,0,255,0,255])},plan),colorTrace=node(colored,'grayscale');
 assert.equal(colorTrace.outputSummary.executionMode,'format-conversion');assert.equal(artifact(colorTrace,'grayscale-conversion').data.applied,true);assert.equal(choice(colorTrace,'luminanceWeights').derivation.applied,true);
});

test('gear sweep changes one variable at a fixed center and saves actual supported and rejected signals',async()=>{
 const result=await runPipeline(fixture(),createPipelinePlan({task:'gear',parameters:{expectedTeeth:12}})),trace=node(result,'features'),evidence=artifact(trace,'feature-evidence').data,sweep=evidence.parameterSweep;
 assert.equal(sweep.fixedCenter,true);assert.equal(sweep.optimizationPerformed,false);assert.equal(sweep.selectionApplied,false);assert.deepEqual(sweep.center,result.measurements.workpieceCenter);
 assert.equal(sweep.binding.runId,result.runId);assert.equal(sweep.binding.imageSha256,result.image.sha256);assert.equal(sweep.binding.nodeId,'features');assert.equal(sweep.binding.pipelineRevision,result.pipelineRevision);
 assert.deepEqual(sweep.axes.map(axis=>axis.parameterName),['smoothingWindow','minProminence','minPeakDistance']);
 const baseCurve=evidence.radialCurve.map(p=>({angleRad:p.angleRad,radiusPx:p.smoothedRadiusPx}));
 for(const axis of sweep.axes){
  assert.ok(axis.candidates.length>=8);const baseline=axis.candidates.find(candidate=>candidate.baseline);assert.ok(baseline);assert.equal(baseline.count,evidence.peaks.length);assert.deepEqual(baseline.curve,baseCurve);assert.deepEqual(baseline.peaks,evidence.peaks);
  for(const candidate of axis.candidates){
   for(const [key,value]of Object.entries(axis.fixedParameters))assert.equal(candidate.parameters[key],value);
   assert.equal(candidate.parameters[axis.parameterName],candidate.value);assert.equal(candidate.count,candidate.peaks.length);assert.equal(candidate.curve.length,evidence.radialCurve.length);
   assert.equal(candidate.status,candidate.gates.every(g=>g.passed)?'SUPPORTED':'REJECTED');assert.ok(candidate.gates.every(g=>typeof g.passed==='boolean'));
   assert.ok(candidate.peaks.every(peak=>Number.isFinite(peak.angleRad)&&peak.point&&Number.isFinite(peak.point.x)&&Number.isFinite(peak.prominencePx)));
  }
  const saved=choice(trace,axis.parameterName).singleAxisSensitivity;assert.equal(saved.candidateCount,axis.candidates.length);assert.equal(saved.centerFixed,true);assert.equal(saved.optimizationPerformed,false);assert.equal(saved.selectionApplied,false);
 }
 const prominenceAxis=sweep.axes.find(axis=>axis.parameterName==='minProminence');assert.ok(prominenceAxis.candidates.some(c=>c.status==='SUPPORTED'&&c.count===12));assert.ok(prominenceAxis.candidates.some(c=>c.status==='REJECTED'&&c.count===0&&c.gates.some(g=>g.id==='minimum_peaks'&&!g.passed)));
 const window3=sweep.axes[0].candidates.find(c=>c.value===3),radii=evidence.radialCurve.map(p=>p.radiusPx);
 for(let i=0;i<radii.length;i++)assert.ok(Math.abs(window3.curve[i].radiusPx-(radii[(i-1+radii.length)%radii.length]+2*radii[i]+radii[(i+1)%radii.length])/4)<1e-10);
});

test('actual adopted center circle and root inspection positions stay tied to measured support',async()=>{
 const result=await runPipeline(fixture(),createPipelinePlan({task:'gear'})),evidence=artifact(node(result,'features'),'feature-evidence').data,adopted=evidence.centerEstimation.candidates.filter(c=>c.adopted).at(-1);
 if(adopted){assert.deepEqual(adopted.circle.center,result.measurements.workpieceCenter);assert.deepEqual(adopted.circle.supportPoints,adopted.supportPoints);assert.equal(adopted.circle.rmsResidual,adopted.rmsResidual);assert.equal(adopted.circle.angularCoverageDeg,adopted.angularCoverageDeg);assert.equal(adopted.circle.residuals.length,adopted.supportPoints.length);}
 for(const root of evidence.toothRootSupport){assert.equal(typeof root.interpolated,'boolean');assert.ok(Number.isFinite(root.nearestSupportPoint.x));assert.ok(Math.abs(Math.hypot(root.projectionPoint.x-result.measurements.workpieceCenter.x,root.projectionPoint.y-result.measurements.workpieceCenter.y)-root.observedRadiusPx)<1e-9);assert.equal(root.minConcavityPx,1.5);assert.equal(root.gateId,'gear.root_support');}
 // The expensive visual diagnostics cannot tune or change any adopted measurement.
 const regionTrace=node(result,'components'),contours=artifact(regionTrace,'region-contours'),regionMask=decodeMaskRLE(artifact(regionTrace,'selected-region'));
 for(let y=0;y<220;y++)for(let x=0;x<260;x++)if(Math.hypot(x+.5-136,y+.5-108)<=23)regionMask[y*260+x]=1;
 const region={width:260,height:220,mask:regionMask,outerContour:contours.contours.find(c=>c.role==='outer').points,holes:[]};
 // A hole-free equivalent isolates counting/center: both paths use the same pixels.
 const withSweep=analyzeGear(region),withoutSweep=analyzeGear(region,{diagnosticSweep:false});assert.deepEqual(withSweep.measurements,withoutSweep.measurements);assert.equal(withSweep.status,withoutSweep.status);assert.deepEqual(withSweep.evidence.peaks,withoutSweep.evidence.peaks);assert.equal(withoutSweep.evidence.parameterSweep,undefined);
});

test('saved prominence bases are actual curve samples, including circular wrap-around',async()=>{
 const result=await runPipeline(fixture(),createPipelinePlan({task:'gear'})),evidence=artifact(node(result,'features'),'feature-evidence').data;
 const signals=[{curve:evidence.radialCurve.map(p=>({radiusPx:p.smoothedRadiusPx})),peaks:evidence.peaks},...evidence.parameterSweep.axes.flatMap(axis=>axis.candidates)];
 let ordinary=0,wrapped=0;
 for(const {curve,peaks}of signals)for(const peak of peaks){
  const n=curve.length;assert.ok(Number.isInteger(peak.leftBaseIndex)&&Number.isInteger(peak.rightBaseIndex));
  assert.equal(peak.leftBaseRadiusPx,curve[peak.leftBaseIndex].radiusPx);assert.equal(peak.rightBaseRadiusPx,curve[peak.rightBaseIndex].radiusPx);assert.equal(peak.maximumRadiusPx,curve[peak.maximumIndex].radiusPx);
  assert.equal(peak.prominenceReferenceRadiusPx,Math.max(peak.leftBaseRadiusPx,peak.rightBaseRadiusPx));assert.equal(peak.prominencePx,peak.maximumRadiusPx-peak.prominenceReferenceRadiusPx);
  const leftDistance=(peak.maximumIndex-peak.leftBaseIndex+n)%n,rightDistance=(peak.rightBaseIndex-peak.maximumIndex+n)%n;
  assert.ok(leftDistance<=peak.prominenceReachBins);assert.ok(rightDistance<=peak.prominenceReachBins);
  if(peak.leftBaseIndex>peak.maximumIndex||peak.rightBaseIndex<peak.maximumIndex)wrapped++;else ordinary++;
 }
 assert.ok(ordinary>0,'ordinary non-wrapped peaks are covered');assert.ok(wrapped>0,'peaks crossing the angle 0/2π boundary are covered');
});
