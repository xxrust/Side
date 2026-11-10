import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '../../qa/node_modules/@napi-rs/canvas/index.js';
import {createHash} from 'node:crypto';
import {runPipeline} from '../src/pipeline-runtime.js';
import {inspectRgbaInput} from '../src/input-inspection.js';
const root=path.resolve('../reviews/2026-10-25-framework-retest/project-0.10.3');
const {project}=JSON.parse(await fs.readFile(path.join(root,'manifest.agentcv.json'),'utf8'));
const plan=project.workflow.pipelinePlan,rows=[];
function compareMeasured(actual,previous,prefix='',differences=[]){
 if(typeof actual==='number'&&typeof previous==='number'){
  const absoluteDifference=Math.abs(actual-previous);assert.ok(absoluteDifference<1e-10,`${prefix}: ${actual} differs from ${previous}`);
  if(absoluteDifference)differences.push({path:prefix,actual,previous,absoluteDifference});return differences;
 }
 if(actual&&typeof actual==='object'){
  assert.deepEqual(Object.keys(actual).sort(),Object.keys(previous).sort());for(const key of Object.keys(actual))compareMeasured(actual[key],previous[key],prefix?`${prefix}.${key}`:key,differences);
 }else assert.equal(actual,previous,prefix);
 return differences;
}
for(const item of project.images){
 const decoded=await loadImage(await fs.readFile(path.join(root,item.dataURL.$asset))),canvas=createCanvas(decoded.width,decoded.height),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(decoded,0,0);
 const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,inputInspection=inspectRgbaInput(rgba),gray=new Float32Array(canvas.width*canvas.height);for(let i=0;i<gray.length;i++)gray[i]=inputInspection.achromatic?rgba[4*i]:rgba[4*i]*.299+rgba[4*i+1]*.587+rgba[4*i+2]*.114;
 const image={width:canvas.width,height:canvas.height,gray,inputInspection,sha256:createHash('sha256').update(rgba).digest('hex'),grayProvenance:{source:'image.decode@1',applied:!inputInspection.achromatic,formula:inputInspection.achromatic?'Y = R = G = B; copy existing intensity':'0.299*R + 0.587*G + 0.114*B',coefficients:inputInspection.achromatic?null:{red:.299,green:.587,blue:.114},inputInspection}};
 const result=await runPipeline(image,plan,{inputIdentity:{imageId:item.id}}),previous=item.pipelineResult;
 const floatingPointDifferences=compareMeasured(result.measurements,previous.measurements);assert.deepEqual(result.classification,previous.classification);assert.equal(result.image.sha256,previous.image.sha256);
 for(const key of ['visibleTeeth','missingTeeth','excessTeeth'])assert.equal(result.measurements[key],previous.measurements[key]);
 const feature=result.nodes.find(n=>n.op==='shape.gear'),evidence=feature.artifacts.find(a=>a.id.endsWith(':feature-evidence')).data,sweep=evidence.parameterSweep;
 rows.push({image:item.name,sourceImageSha256:image.sha256,pixelSha256:result.image.sha256,previousRunId:previous.runId,newRunId:result.runId,measurements:result.measurements,discreteMeasurementsExactlyUnchanged:true,floatingPointDifferences,maximumAbsoluteDifference:Math.max(0,...floatingPointDifferences.map(d=>d.absoluteDifference)),classificationUnchanged:true,classification:result.classification.status,inputInspection:{classification:inputInspection.classification,colorPixels:inputInspection.colorPixels,grayLevelCount:inputInspection.grayLevelCount,strictBinary:inputInspection.strictBinary},preprocessing:result.nodes.slice(0,2).map(n=>({id:n.id,executionMode:n.outputSummary.executionMode,choiceStatus:n.decision.toolChoice.status})),featureStatus:feature.featureStatus||feature.outputSummary.featureStatus,sweeps:sweep?.axes.map(a=>({parameterName:a.parameterName,candidates:a.candidates.map(c=>({value:c.value,count:c.count,status:c.status,failedGates:c.gates.filter(g=>!g.passed)}))}))});
}
const file=path.resolve('qa/gear-neutral-runtime-probe-0.10.4.json');await fs.writeFile(file,JSON.stringify({scope:'Source-level replay from saved native inputs using Node/V8. Not native UI acceptance and not a blind operation round. Tiny floating-point differences from the saved WebKit result are explicitly listed; QA requires absolute difference below 1e-10 and exact count/classification/pixel identity.',planId:plan.id,planRevision:plan.revision,rows},null,2)+'\n');console.log(file);console.log(rows.map(r=>({image:r.image,featureStatus:r.featureStatus,preprocessing:r.preprocessing,maximumAbsoluteDifference:r.maximumAbsoluteDifference,sweepCounts:r.sweeps?.map(a=>[a.parameterName,a.candidates.length,a.candidates.filter(c=>c.status==='REJECTED').length])})));
