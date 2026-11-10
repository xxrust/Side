import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Workspace } from '../src/workspace.js';
import { runPipeline,createPipelinePlan } from '../src/pipeline-runtime.js';
import { OPERATOR_REGISTRY } from '../src/pipeline-registry.js';

function image({ outerRadius = 90, innerRadius = 31, offset = 0, ellipse = false, blank = false } = {}) {
  const width = 280, height = 280, gray = new Uint8Array(width * height).fill(22);
  if (!blank) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const outer = ellipse ? ((x - 140) / outerRadius) ** 2 + ((y - 140) / (outerRadius * 0.65)) ** 2 <= 1 : Math.hypot(x - 140, y - 140) <= outerRadius;
    if (outer && Math.hypot(x - 140 - offset, y - 140) > innerRadius) gray[y * width + x] = 202;
  }
  return { width, height, gray, sha256: createHash('sha256').update(gray).digest('hex') };
}
async function workspace(fixtures = [image()]) {
  const w = new Workspace(), sources = new Map(fixtures.map((raster, i) => [`fixture:${i}`, raster]));
  await w.addImages(fixtures.map((_, i) => ({ name: `unrelated-name-${i}.png`, dataUrl: `fixture:${i}` })), async url => sources.get(url));
  return { w, decode: async url => sources.get(url) };
}
const near = (actual, expected, tolerance = 2) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`);

test('Agent context keeps numerical geometry while dense supports remain in the visual evidence', async () => {
  const { w } = await workspace();w.createPipeline({task:'annulus',goal:'量測雙圓'});await w.runPipelineImage();
  const full=w.image.pipelineResult;assert.ok(full.measurements.outerCircle.supportPoints.length>24);
  const context=w.pipelineContext();assert.ok(context.pipelineResult.measurements.outerCircle.radius>0);
  assert.equal(context.pipelineResult.measurements.outerCircle.supportPoints,undefined);
  assert.equal(context.images[0].pipelineResult.measurements.outerCircle.residuals,undefined);
  assert.ok(JSON.stringify(context).length<30000,'model context must not duplicate pixel support arrays');
  assert.ok(full.nodes.find(n=>n.id==='features').artifacts.length>0);
});

test('evidence is paged by current node, identifies the coordinate system, and refuses stale or prototype paths', async()=>{
  const {w}=await workspace();w.createPipeline({task:'annulus',goal:'圓環'});await w.runPipelineImage();
  const manifest=w.readPipelineEvidence({node_id:'features'});assert.ok(manifest.available.evidence.keys.length);assert.equal(manifest.coordinateSystem.angleZero,'+x（向右）');
  const first=w.readPipelineEvidence({node_id:'features',path:'summary.measurements.outerCircle.residuals',limit:3});
  assert.equal(first.data.length,3);assert.ok(first.total>3);assert.equal(first.nextOffset,3);assert.ok(Number.isFinite(first.data[0].radialResidual));
  const second=w.readPipelineEvidence({node_id:'features',path:'summary.measurements.outerCircle.residuals',offset:3,limit:3});assert.notDeepEqual(second.data,first.data);
  assert.throws(()=>w.readPipelineEvidence({node_id:'features',path:'evidence.__proto__'}),/不存在/);
  w.updatePipelineParameters('features',{maxResidualPx:2});assert.throws(()=>w.readPipelineEvidence({node_id:'features'}),/重新試跑/);
});

test('editing one parameter preserves the setting origin of unchanged Agent proposals',async()=>{
 const {w}=await workspace();
 const draft=createPipelinePlan({task:'annulus',parameters:{features:{maxResidualPx:2,maxRelativeResidual:.03}}}),reasons={grayscale:'先核對原始強度表示並保留完整解析度；此測試的單通道輸入不需要重新套用 RGB 權重。',segment:'以真實亮度分佈試算前景遮罩，需核對遮罩與極性；不把類間變異最大稱為分割準確。',components:'以唯一合格前景區取得外緣與封閉內孔，多候選時停止，不能默認挑最大區域。',features:'本例具有內外圓輪廓的假設，分別核對圓擬合殘差與角向支持；圓模型不成立時保留 UNKNOWN。',rules:'只比較明確提供的規則；本測試未提供製造公差，所以不根據量測值猜測品質標準。'};
 draft.provenance={source:'agent'};for(const node of draft.nodes){node.parameterSources=Object.fromEntries(Object.keys(node.params).map(name=>[name,'agent-proposal']));node.justification={tool:{reason:reasons[node.id],expectedEvidence:[{kind:'artifact',type:'evidence'}]},parameters:Object.keys(OPERATOR_REGISTRY[node.op].params).map(name=>({name,source:Object.hasOwn(node.params,name)?'agent-proposal':name==='componentId'?'not-supplied':name==='threshold'?'data-derived':'operator-default',reason:`本案 ${name} 依所提設定或明確預設使用，須檢查當次實值及來源；未比較其他值，不宣稱最佳或製造公差。`,verification:{kind:'execution-status',allowed:['OK']}})),boundaries:[{condition:node.id==='features'?'外緣必須符合實際圓擬合 RMS 門檻，圓模型不成立時不可交付可靠圓直徑。':'本步需有真實有效輸入及當次完成記錄，上游失敗或區域不唯一時保留 UNKNOWN。',check:node.id==='features'?{kind:'gate',id:'annulus.outer.rms'}:{kind:'execution-status',allowed:['OK']},onFailure:'UNKNOWN'}]}}
 w.createPipeline(draft,{source:'agent'});
 w.updatePipelineParameters('features',{maxResidualPx:3,maxRelativeResidual:.03});
 const configured=w.workflow.pipelinePlan.nodes.find(n=>n.id==='features');
 assert.equal(configured.parameterSources.maxResidualPx,'human');assert.equal(configured.parameterSources.maxRelativeResidual,'agent-proposal');
 await w.runPipelineImage();const node=w.image.pipelineResult.nodes.find(n=>n.id==='features');
 assert.equal(node.parameterSources.maxRelativeResidual,'agent-proposal');assert.equal(node.parameterSources.maxResidualPx,'human');
 const saved=JSON.parse(w.serialize());assert.deepEqual(saved.images[0].pipelineResult.nodes.find(n=>n.id==='features').decision,node.decision);
 const manifest=w.readPipelineEvidence({node_id:'features'});assert.ok(manifest.available.decision.keys.includes('parameterChoices'));
 const decision=w.readPipelineEvidence({node_id:'features',path:'decision.parameterChoices',limit:1});assert.equal(decision.data.length,1);assert.ok(decision.total>1);
 w.updatePipelineParameters('features',{maxResidualPx:4,maxRelativeResidual:.03});assert.throws(()=>w.readPipelineEvidence({node_id:'features',path:'decision'}),/重新試跑/);
});

test('pipeline measurement needs no check, taught ROI or tolerance and retains pixel values with SPEC_MISSING', async () => {
  const { w } = await workspace([image({ offset: 9 })]);
  assert.equal(w.workflow.checks.length, 0);
  assert.deepEqual(w.workflow.workpiece.regions, {});
  const plan = w.createPipeline({ task: 'annulus', goal: 'Measure the circular part and bore centers.' });
  assert.equal(plan.status, 'DRAFT');
  assert.equal(w.workflow.checks.length, 0);
  const measured = await w.runPipelineImage();
  assert.equal(measured.status, 'OK', JSON.stringify(measured.nodes.map(n => [n.id, n.status, n.error])));
  near(measured.measurements.outerDiameter, 180);
  near(measured.measurements.innerDiameter, 62);
  near(measured.measurements.centerDistance, 9, 0.4);
  assert.equal(measured.measurements.unit, 'px');
  assert.equal(measured.classification.status, 'UNKNOWN');
  assert.equal(measured.classification.reason, 'SPEC_MISSING');
  assert.ok(measured.artifacts.some(a => a.nodeId === 'features' && a.type === 'evidence'));
  assert.equal(w.isPipelineResultCurrent(), true);
  assert.equal(w.pipelineContext().pipelineResultState, 'CURRENT');
});

test('explicit rules classify observed quantities and preserve size values when millimeter calibration is absent', async () => {
  const { w } = await workspace();
  w.createPipeline({ task: 'annulus', rules: [{ measurement: 'closedHoleCount', equals: 1 }, { measurement: 'outerDiameter', min: 178, max: 182, unit: 'px' }] });
  let result = await w.runPipelineImage();
  assert.equal(result.classification.status, 'PASS', JSON.stringify(result.classification));
  w.updatePipelineParameters('rules', { rules: [{ measurement: 'closedHoleCount', equals: 2 }] });
  result = await w.runPipelineImage();
  assert.equal(result.classification.status, 'FAIL');
  assert.equal(result.classification.rules[0].actual, 1);
  near(result.measurements.outerDiameter, 180);
  w.updatePipelineParameters('rules', { rules: [{ measurement: 'outerDiameter', min: 1, max: 2, unit: 'mm' }] });
  result = await w.runPipelineImage();
  assert.equal(result.classification.status, 'UNKNOWN');
  assert.equal(result.classification.reason, 'UNCALIBRATED');
  near(result.measurements.outerDiameter, 180);
});

test('an uncertain feature keeps its diagnostics and cannot turn a candidate value into a reliable FAIL', async () => {
  const { w } = await workspace([image({ ellipse: true })]);
  w.createPipeline({ task: 'annulus', rules: [{ measurement: 'outerDiameter', min: 900, unit: 'px' }] });
  const result = await w.runPipelineImage();
  assert.equal(result.status, 'PARTIAL');
  assert.ok(result.measurements.outerCircle);
  assert.equal(result.nodes.find(n => n.id === 'features').outputSummary.featureStatus, 'UNKNOWN');
  assert.equal(result.classification.status, 'UNKNOWN');
});

test('all-image validation executes each raster separately and leaves unlabelled accuracy null', async () => {
  const { w } = await workspace([image({ outerRadius: 82 }), image({ outerRadius: 112, offset: 15 }), image({ blank: true })]);
  w.createPipeline({ task: 'annulus' });
  const progress = [], validation = await w.validatePipelineImages((done, total) => progress.push([done, total]));
  assert.equal(validation.status, 'COMPLETED');
  assert.equal(validation.total, 3);
  assert.equal(validation.processed, 3);
  assert.equal(validation.labeled, 0);
  assert.equal(validation.accuracy, null);
  assert.equal(validation.scope, 'TRIAL');
  assert.equal(new Set(validation.rows.map(r => r.runId)).size, 3);
  assert.equal(new Set(validation.rows.map(r => r.inputSha256)).size, 3);
  near(validation.rows[0].measurements.outerDiameter, 164);
  near(validation.rows[1].measurements.outerDiameter, 224);
  assert.equal(validation.rows[2].actual, 'UNKNOWN');
  assert.deepEqual(validation.rows[2].measurements, {});
  for (const [i, row] of validation.rows.entries()) {
    assert.equal(row.imageId, w.data.images[i].id);
    assert.equal(w.isPipelineResultCurrent(w.data.images[i].pipelineResult, w.data.images[i]), true);
  }
  assert.deepEqual(progress.at(-1), [3, 3]);
});

test('parameter and source-identity edits invalidate completed results instead of silently reusing them', async () => {
  const { w } = await workspace();
  w.createPipeline({ task: 'annulus' });
  const first = await w.runPipelineImage(), revision = w.workflow.pipelinePlan.revision;
  w.updatePipelineParameters('features', { maxResidualPx: 1.1 });
  assert.equal(w.workflow.pipelinePlan.revision, revision + 1);
  assert.equal(w.workflow.pipelinePlan.status, 'DRAFT');
  assert.equal(w.image.pipelineResult, undefined);
  assert.equal(w.image.previousPipelineResult.runId, first.runId);
  assert.equal(w.isPipelineResultCurrent(first), false);
  const next = await w.runPipelineImage();
  assert.notEqual(next.runId, first.runId);
  w.image.sha256 = 'edited-source-identity';
  assert.equal(w.isPipelineResultCurrent(), false);
  assert.equal(w.pipelineContext().pipelineResultState, 'STALE');
  assert.equal(w.pipelineContext().pipelineResult, null);
});

test('in-flight parameter mutation discards the late result without overwriting the current image', async () => {
  const { w } = await workspace();
  w.createPipeline({ task: 'annulus' });
  let release;
  w.pipelineExecutor = { execute: (...args) => new Promise((resolve, reject) => { release = () => runPipeline(...args).then(resolve, reject); }) };
  const pending = w.runPipelineImage();
  assert.equal(typeof release, 'function');
  w.updatePipelineParameters('features', { maxResidualPx: 1.25 });
  await release();
  await assert.rejects(pending, /丟棄/);
  assert.equal(w.image.pipelineResult, undefined);
  assert.equal(w.workflow.pipelinePlan.status, 'DRAFT');
});

test('in-flight source-identity mutation also discards the late result', async () => {
  const { w } = await workspace();
  w.createPipeline({ task: 'annulus' });
  let release;
  w.pipelineExecutor = { execute: (...args) => new Promise((resolve, reject) => { release = () => runPipeline(...args).then(resolve, reject); }) };
  const pending = w.runPipelineImage();
  w.image.sha256 = 'new-source-identity';
  await release();
  await assert.rejects(pending, /丟棄/);
  assert.equal(w.image.pipelineResult, undefined);
});

test('current-result binding detects changed pixels even if source metadata was not refreshed', async () => {
  const { w } = await workspace();
  w.createPipeline({ task: 'annulus' });
  await w.runPipelineImage();
  const raster = w.pixels.get(w.image.id), previousSource = w.image.sha256;
  raster.gray[140 * raster.width + 205] = 22;
  assert.equal(w.image.sha256, previousSource);
  assert.equal(w.isPipelineResultCurrent(), false, 'a metadata hash cannot substitute for the actual raster binding');
  assert.equal(w.pipelineContext().pipelineResult, null);
});

test('in-flight pixel edits discard results computed from the earlier pixel snapshot', async () => {
  const { w } = await workspace();
  w.createPipeline({ task: 'annulus' });
  let release;
  w.pipelineExecutor = { execute: (...args) => {
    const computed = runPipeline(...args);
    return new Promise((resolve, reject) => { release = () => computed.then(resolve, reject); });
  } };
  const pending = w.runPipelineImage(), raster = w.pixels.get(w.image.id);
  raster.gray[140 * raster.width + 205] = 22;
  await release();
  await assert.rejects(pending, /丟棄/);
  assert.equal(w.image.pipelineResult, undefined);
});

test('malformed saved graphs reject atomically before image decoding or workspace replacement', async () => {
  const { w } = await workspace();
  w.createPipeline({ task: 'annulus' });
  await w.runPipelineImage();
  const saved = JSON.parse(w.serialize()), data = w.data, pixels = w.pixels, epoch = w.epoch;
  const corruptions = [
    p => { p.nodes.find(n => n.id === 'features').op = 'unknown.operator'; },
    p => { p.nodes.find(n => n.id === 'features').inputs.region = 'absent.region'; },
    p => { p.nodes.find(n => n.id === 'features').params.maxRelativeResidual = -1; },
    p => { p.nodes[0].inputs.image = 'grayscale.image'; }
  ];
  for (const corrupt of corruptions) {
    const malformed = structuredClone(saved); corrupt(malformed.workflow.pipelinePlan);
    let decodes = 0;
    await assert.rejects(w.load(malformed, async () => { decodes++; return image(); }), /算子方案/);
    assert.equal(decodes, 0);
    assert.equal(w.data, data);
    assert.equal(w.pixels, pixels);
    assert.equal(w.epoch, epoch);
    assert.equal(w.isPipelineResultCurrent(), true);
  }
});

test('save/load preserves the graph and historical evidence but requires a fresh run for current results', async () => {
  const { w, decode } = await workspace();
  w.createPipeline({ task: 'annulus', rules: [{ measurement: 'closedHoleCount', equals: 1 }] });
  w.setPipelineLabel(w.image.id, 'OK', 'One closed bore is present.');
  const trial = await w.validatePipelineImages(), first = w.image.pipelineResult;
  assert.equal(trial.accuracy, 1);
  const saved = JSON.parse(w.serialize()), loaded = new Workspace();
  await loaded.load(saved, decode);
  assert.equal(loaded.workflow.pipelinePlan.id, w.workflow.pipelinePlan.id);
  assert.deepEqual(loaded.workflow.pipelinePlan.nodes, w.workflow.pipelinePlan.nodes);
  assert.equal(loaded.image.pipelineResult, undefined);
  assert.equal(loaded.image.previousPipelineResult.runId, first.runId);
  assert.equal(loaded.isPipelineResultCurrent(first), false);
  assert.equal(loaded.workflow.pipelineValidation.status, 'STALE');
  assert.equal(loaded.pipelineContext().pipelineResult, null);
  const rerun = await loaded.runPipelineImage();
  assert.notEqual(rerun.runId, first.runId);
  assert.equal(loaded.isPipelineResultCurrent(), true);
});
