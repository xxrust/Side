import test from 'node:test';
import assert from 'node:assert/strict';
import {PIPELINE_SCHEMA,createPipelinePlan,getPipelineCapabilities,validatePipeline,runPipeline,isPipelineResultCurrent,decodeMaskRLE,encodeMaskRLE} from '../src/pipeline-runtime.js';

function raster(width,height,predicate,{bright=false}={}) {
  const gray=new Uint8Array(width*height).fill(bright?0:255);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(predicate(x+.5,y+.5))gray[y*width+x]=bright?255:0;
  return {width,height,gray};
}
const annulus=(offset=0)=>raster(180,160,(x,y)=>Math.hypot(x-90,y-80)<60&&Math.hypot(x-90-offset,y-80)>28);
const node=(result,id)=>result.nodes.find(entry=>entry.id===id);
const copy=value=>JSON.parse(JSON.stringify(value));

test('capabilities describe typed versioned operators and editable parameter schemas',()=>{
  const capabilities=getPipelineCapabilities();assert.equal(capabilities.schema,PIPELINE_SCHEMA);assert.equal(capabilities.operators.length,7);
  for(const op of capabilities.operators){assert.equal(op.version,1);assert.ok(Object.keys(op.inputs).length);assert.ok(Object.keys(op.outputs).length);assert.equal(op.parameterSchema.additionalProperties,false);}
  assert.equal(capabilities.operators.find(op=>op.op==='regions.components').params.selection.default,'unique');
});

test('real annulus pixels traverse full resolution operators; missing tolerance preserves measurement',async()=>{
  const image=annulus(5),plan=createPipelinePlan({task:'annulus'}),result=await runPipeline(image,plan,{inputIdentity:{imageId:'ring-a'}});
  assert.equal(result.status,'OK');assert.deepEqual(result.nodes.map(entry=>entry.status),['OK','OK','OK','OK','OK']);
  assert.equal(result.classification.status,'UNKNOWN');assert.equal(result.classification.reason,'SPEC_MISSING');
  assert.ok(Math.abs(result.measurements.outerDiameter-120)<1);assert.ok(Math.abs(result.measurements.innerDiameter-56)<1);assert.ok(Math.abs(result.measurements.centerDistance-5)<.3);
  assert.equal(result.measurements.unit,'px');assert.equal(result.calibration.valid,false);
  const contours=result.artifacts.find(artifact=>artifact.type==='contours');assert.equal(contours.contours.filter(contour=>contour.role==='hole').length,1);
  assert.ok(contours.contours.every(contour=>contour.points.length>100));
  const selected=result.artifacts.find(artifact=>artifact.id==='components:selected-region'),mask=decodeMaskRLE(selected);assert.equal(mask[80*image.width+95],0);assert.equal(mask[80*image.width+45],1);
  assert.equal(node(result,'components').outputSummary.fullResolution,true);assert.match(result.image.sha256,/^[a-f0-9]{64}$/);assert.match(result.planHash,/^[a-f0-9]{64}$/);
  const serialized=JSON.stringify(result);assert.ok(!serialized.includes('"gray"'));assert.deepEqual(JSON.parse(serialized).measurements,result.measurements);
  assert.ok(result.artifacts.some(artifact=>artifact.type==='circles'&&artifact.circles.length===2));
});

test('background connectivity preserves a concavity and an enclosed hole without a convex hull',async()=>{
  const image=raster(100,100,(x,y)=>x>=15&&x<85&&y>=15&&y<85&&!(x>=58&&y<53)&&!(Math.hypot(x-35,y-60)<9));
  const result=await runPipeline(image,createPipelinePlan({task:'holes'}));assert.equal(result.measurements.closedHoleCount,1);
  const selected=decodeMaskRLE(result.artifacts.find(artifact=>artifact.id==='components:selected-region'));
  assert.equal(selected[30*100+75],0);assert.equal(selected[60*100+35],0);assert.equal(selected[60*100+70],1);
  const contour=result.artifacts.find(artifact=>artifact.type==='contours').contours.find(contour=>contour.role==='outer');assert.ok(contour.points.some(point=>point.x===58&&point.y>20&&point.y<50));
});

test('opening a hole to exterior changes topology from one to zero',async()=>{
  const closed=raster(100,100,(x,y)=>x>=10&&x<90&&y>=10&&y<90&&Math.hypot(x-50,y-50)>12);
  const open=raster(100,100,(x,y)=>x>=10&&x<90&&y>=10&&y<90&&Math.hypot(x-50,y-50)>12&&!(x>=48&&x<52&&y<50));
  const plan=createPipelinePlan({task:'holes'}),a=await runPipeline(closed,plan),b=await runPipeline(open,plan);assert.equal(a.measurements.closedHoleCount,1);assert.equal(b.measurements.closedHoleCount,0);
});

test('multiple foreground components expose ambiguity and require explicit selection',async()=>{
  const image=raster(100,80,(x,y)=>Math.hypot(x-25,y-40)<12||Math.hypot(x-70,y-40)<18),plan=createPipelinePlan({task:'holes'});
  const ambiguous=await runPipeline(image,plan);assert.equal(ambiguous.status,'FAILED');assert.equal(node(ambiguous,'components').error.code,'AMBIGUOUS_REGIONS');assert.equal(node(ambiguous,'features').status,'SKIPPED');assert.equal(node(ambiguous,'components').error.details.eligibleCount,2);
  plan.nodes[2].params={selection:'largest'};const selected=await runPipeline(image,plan);assert.equal(selected.status,'OK');assert.ok(node(selected,'components').outputSummary.centroid.x>60);
  plan.nodes[2].params={selection:'component',componentId:999};const missing=await runPipeline(image,plan);assert.equal(node(missing,'components').error.code,'COMPONENT_NOT_ELIGIBLE');
});

test('boundary objects are excluded, and explicit bright polarity uses actual pixels',async()=>{
  const image=raster(90,70,(x,y)=>x<8||Math.hypot(x-50,y-35)<15,{bright:true});
  const result=await runPipeline(image,createPipelinePlan({task:'holes',parameters:{segmentation:{polarity:'bright'}}}));
  assert.equal(result.status,'OK');assert.equal(node(result,'components').outputSummary.candidateCount,2);assert.equal(node(result,'components').outputSummary.eligibleCount,1);assert.equal(node(result,'segment').outputSummary.polarity,'bright');
});

test('uniform images fail visibly instead of manufacturing geometry',async()=>{
  const image={width:20,height:20,gray:new Uint8Array(400).fill(128)},result=await runPipeline(image,createPipelinePlan({task:'gear'}));assert.equal(node(result,'segment').error.code,'UNIFORM_IMAGE');assert.equal(result.status,'FAILED');assert.deepEqual(result.measurements,{});assert.equal(result.classification.status,'UNKNOWN');
});

test('validation rejects unknown versions, operations, parameters, references, types, IDs and cycles',()=>{
  const modifications=[
    [plan=>plan.nodes[1].version=99,'VERSION_UNSUPPORTED'],
    [plan=>plan.nodes[1].op='arbitrary.blackbox','OP_UNSUPPORTED'],
    [plan=>plan.nodes[1].op='toString','OP_UNSUPPORTED'],
    [plan=>plan.nodes[1].params.magic=4,'PARAMETER_UNKNOWN'],
    [plan=>plan.nodes[1].inputs.image='absent.image','REFERENCE_MISSING'],
    [plan=>plan.nodes[1].inputs.image='grayscale.binary','OUTPUT_MISSING'],
    [plan=>plan.nodes[1].inputs.image='components.region','TYPE_MISMATCH'],
    [plan=>plan.nodes[1].id='grayscale','NODE_ID_DUPLICATE'],
    [plan=>plan.nodes[0].inputs.image='grayscale.image','CYCLE'],
    [plan=>plan.nodes[2].params={selection:'component'},'COMPONENT_ID_REQUIRED'],
    [plan=>plan.nodes[4].params={rules:[{measurement:'visibleTeeth',min:5,max:3}]},'RULE_RANGE'],
  ];
  for(const [modify,code] of modifications){const plan=createPipelinePlan({task:'gear'});modify(plan);const validation=validatePipeline(plan);assert.equal(validation.valid,false,code);assert.ok(validation.errors.some(error=>error.code===code),`${code}: ${JSON.stringify(validation.errors)}`);}
});

test('invalid graph is rejected before image decoding or execution',async()=>{
  const plan=createPipelinePlan({task:'gear'});plan.nodes[0].version=99;await assert.rejects(runPipeline(null,plan),error=>error.code==='PIPELINE_INVALID'&&error.validation.errors[0].code==='VERSION_UNSUPPORTED');
});

test('runtime follows references and topological order, with independent operator branches',async()=>{
  const plan=createPipelinePlan({task:'gear'});plan.task='an irrelevant label';plan.nodes[3].op='geometry.annulus';plan.nodes.splice(4,0,{id:'holes',op:'topology.holes',version:1,inputs:{region:{node:'components',output:'region'}},params:{}});plan.nodes.reverse();
  const result=await runPipeline(annulus(),plan);assert.equal(result.status,'OK');assert.equal(node(result,'features').op,'geometry.annulus');assert.ok(result.measurements.outerDiameter>119);assert.equal(result.measurements.closedHoleCount,1);assert.ok(result.nodes.findIndex(entry=>entry.id==='components')<result.nodes.findIndex(entry=>entry.id==='features'));assert.equal(node(result,'holes').outputSummary.featureStatus,'MEASURED');
});

test('explicit pixel and count rules evaluate measured values',async()=>{
  const plan=createPipelinePlan({task:'annulus',rules:[{measurement:'outerDiameter',min:119,max:121,unit:'px'},{measurement:'closedHoleCount',equals:1}]});
  const result=await runPipeline(annulus(),plan);assert.equal(result.classification.status,'PASS');assert.deepEqual(result.classification.rules.map(rule=>rule.unit),['px','count']);
  plan.nodes.at(-1).params.rules[0].max=110;plan.nodes.at(-1).params.rules[0].min=100;const failing=await runPipeline(annulus(),plan);assert.equal(failing.classification.status,'FAIL');assert.ok(failing.measurements.outerDiameter>119);
});

test('mm rules require a positive traceable calibration; no scale fabricates no mm',async()=>{
  const plan=createPipelinePlan({task:'annulus',rules:[{measurement:'outerDiameter',min:11.9,max:12.1,unit:'mm'}]});
  const noScale=await runPipeline(annulus(),plan);assert.equal(noScale.classification.reason,'UNCALIBRATED');assert.equal(noScale.measurements.unit,'px');
  const invalid=await runPipeline(annulus(),plan,{scale:{mmPerPixel:.1}});assert.equal(invalid.calibration.valid,false);assert.equal(invalid.calibration.reason,'SCALE_PROVENANCE_MISSING');assert.equal(invalid.classification.status,'UNKNOWN');
  const valid=await runPipeline(annulus(),plan,{scale:{mmPerPixel:.1,source:'user-calibration'}});assert.equal(valid.classification.status,'PASS');assert.ok(Math.abs(valid.classification.rules[0].actual-12)<.1);assert.equal(valid.classification.rules[0].unit,'mm');assert.equal(valid.measurements.unit,'px');
});

test('uncertain geometry cannot make candidate measurements a formal pass or fail',async()=>{
  const rectangle=raster(120,100,(x,y)=>x>15&&x<105&&y>15&&y<85&&!(x>40&&x<80&&y>35&&y<65));
  const result=await runPipeline(rectangle,createPipelinePlan({task:'annulus',rules:[{measurement:'outerDiameter',max:1,unit:'px'}]}));
  assert.equal(node(result,'features').outputSummary.featureStatus,'UNKNOWN');assert.ok(result.measurements.outerDiameter>1);assert.equal(result.classification.status,'UNKNOWN');assert.equal(result.status,'PARTIAL');
});

test('workspace dual-axis calibration accepts isotropy and rejects anisotropy or one missing axis',async()=>{
  const plan=createPipelinePlan({task:'annulus',rules:[{measurement:'outerDiameter',min:11.9,max:12.1,unit:'mm'}]}),image=annulus();
  const valid=await runPipeline(image,plan,{scale:{status:'VALID',mmPerPixelX:.1,mmPerPixelY:.1,profileId:'verified-profile',profileRevision:2}});assert.equal(valid.classification.status,'PASS');assert.equal(valid.calibration.profileRevision,2);
  const anisotropic=await runPipeline(image,plan,{scale:{status:'VALID',mmPerPixelX:.1,mmPerPixelY:.2,source:'verified calibration'}});assert.equal(anisotropic.classification.reason,'UNCALIBRATED');assert.equal(anisotropic.calibration.reason,'ANISOTROPIC_SCALE_UNSUPPORTED');assert.equal(anisotropic.measurements.unit,'px');
  const missing=await runPipeline(image,plan,{scale:{status:'VALID',mmPerPixelX:.1,mmPerPixel:.1,source:'one axis'}});assert.equal(missing.calibration.reason,'SCALE_AXES_REQUIRED');
});

test('batch runs isolate pixels, identities, parameters and snapshots',async()=>{
  const plan=createPipelinePlan({task:'annulus'}),small=raster(120,120,(x,y)=>Math.hypot(x-60,y-60)<40&&Math.hypot(x-60,y-60)>15),a=runPipeline(annulus(),plan,{inputIdentity:{imageId:'a'}}),b=runPipeline(small,plan,{inputIdentity:{imageId:'b'}});
  plan.nodes[1].params.threshold=256;const [one,two]=await Promise.all([a,b]);assert.notEqual(one.runId,two.runId);assert.notEqual(one.image.sha256,two.image.sha256);assert.deepEqual(one.inputIdentity,{imageId:'a'});assert.deepEqual(two.inputIdentity,{imageId:'b'});assert.ok(one.measurements.outerDiameter>119);assert.ok(two.measurements.outerDiameter<81);assert.equal(node(one,'segment').parameters.threshold,undefined);assert.equal(one.planHash,two.planHash);
});

test('result freshness binds graph content, revision, identity and actual pixels',async()=>{
  const image=annulus(),plan=createPipelinePlan({task:'annulus'}),identity={imageId:'a'},result=await runPipeline(image,plan,{inputIdentity:identity});
  assert.equal(isPipelineResultCurrent(result,image,plan,identity),true);assert.equal(isPipelineResultCurrent(result,image,plan,{imageId:'b'}),false);
  const revision=copy(plan);revision.revision++;assert.equal(isPipelineResultCurrent(result,image,revision,identity),false);
  const edited=copy(plan);edited.nodes[2].params.selection='largest';assert.equal(isPipelineResultCurrent(result,image,edited,identity),false);
  const changed={...image,gray:image.gray.slice()};changed.gray[0]=0;assert.equal(isPipelineResultCurrent(result,changed,plan,identity),false);
});

test('RLE is compact, lossless and rejects malformed or overlapping runs',()=>{
  const mask=new Uint8Array([0,0,1,1,1,0,1,0,0,1]),artifact={width:5,height:2,encoding:'rle',runs:encodeMaskRLE(mask)};assert.deepEqual(artifact.runs,[2,3,6,1,9,1]);assert.deepEqual(decodeMaskRLE(artifact),mask);assert.throws(()=>decodeMaskRLE({...artifact,runs:[2,4,3,2]}));assert.throws(()=>decodeMaskRLE({...artifact,runs:[9,2]}));
});
