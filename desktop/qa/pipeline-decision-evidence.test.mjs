import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildPipelineDecisionEvidence,validatePipelineDecisionEvidence,decisionSourceLabel} from '../src/pipeline-decision-evidence.js';
import {savedCurvePointAt} from '../src/pipeline-decision-figures.js';
import {OPERATOR_REGISTRY} from '../src/pipeline-registry.js';
import {createPipelineHarness as createHarness,importActualExamples,importNonCircularPixels} from './pipeline-component-harness.mjs';

async function sample(h,task='gear'){
 const canvas=h.w.document.createElement('canvas');canvas.width=canvas.height=260;const ctx=canvas.getContext('2d');ctx.fillStyle='#eeeeee';ctx.fillRect(0,0,260,260);ctx.fillStyle='#222222';ctx.beginPath();
 if(task==='gear'){for(let j=0;j<12*8;j++){const a=j/(12*8)*Math.PI*2,r=j%8<4?100:85,x=130+r*Math.cos(a),y=130+r*Math.sin(a);j?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath()}else ctx.arc(130,130,100,0,Math.PI*2);ctx.fill();ctx.fillStyle='#eeeeee';
 for(const [x,y,r]of task==='holes'?[[100,130,12],[160,130,12]]:[[130,130,task==='gear'?22:45]]){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
 await h.api.addImages([{name:'generated-pixels.png',dataUrl:canvas.toDataURL()}]);const p=h.api.project;p.createPipeline({task,goal:'以本圖核對真實算子依據'});await p.runPipelineImage();await h.api.go(6);return p;
}
const selectChange=(h,select,value)=>{select.value=String(value);select.dispatchEvent(new h.w.Event('change',{bubbles:true}))};

test('all seven operators adapt saved real evidence, complete gates and independent provenance',async()=>{
 const h=await createHarness();try{
  const seen=new Set();
  for(const task of ['gear','annulus','holes']){
   const p=await sample(h,task),plan=p.workflow.pipelinePlan,result=p.image.pipelineResult;
   for(const node of plan.nodes){const trace=result.nodes.find(n=>n.id===node.id),model=buildPipelineDecisionEvidence({plan,node,trace,result,current:true});assert.deepEqual(validatePipelineDecisionEvidence(model),{valid:true,errors:[]});seen.add(node.op);assert.ok(model.figures.some(f=>f.kind==='input-output'));assert.equal(model.toolChoice.comparison.performed,false);
    for(const choice of model.parameterChoices){const saved=trace.decision.parameterChoices.find(p=>p.name===choice.name);assert.equal(choice.setBy,saved.setBy);assert.equal(choice.derivation.source,saved.derivation.source)}
    const gates=model.figures.filter(f=>f.kind==='gates').flatMap(f=>f.data.gates);assert.deepEqual(gates.map(g=>g.id),Array.from(trace.decision.gates||[],g=>g.id));assert.ok(model.figures.filter(f=>f.boundary).every(f=>f.kind==='gates'||f.kind==='boundary'));
    if(node.op==='image.grayscale'){const figure=model.figures.find(f=>f.kind==='histogram');assert.equal(figure.data.values.reduce((a,b)=>a+b,0),260*260);assert.match(figure.note,/本步只 round/);assert.equal(model.parameterChoices.find(p=>p.name==='luminanceWeights').derivation.appliedUpstream,Boolean(trace.artifacts.find(a=>a.id.endsWith(':grayscale-conversion')).data.upstreamConversionKnown&&trace.artifacts.find(a=>a.id.endsWith(':grayscale-conversion')).data.upstreamGrayProvenance?.applied!==false))}
    if(node.op==='segment.otsu'){const variance=model.figures.find(f=>f.kind==='variance');assert.equal(variance.data.betweenClassVariance.length,256);assert.equal(variance.data.thresholdScores.length,256);assert.ok(variance.data.optimalPlateaus.length);for(const [i,score]of variance.data.thresholdScores.entries())assert.equal(variance.data.betweenClassVariance[i],score.variance)}
    if(node.op==='shape.gear'){const figure=model.figures.find(f=>f.kind==='gear-comparisons');assert.equal(figure.data.comparisons.length,5);assert.ok(figure.data.comparisons.every(c=>c.curve.length>300));assert.ok(model.figures.some(f=>f.id.startsWith('gear-spectrum')));assert.ok(gates.some(g=>g.id==='gear.tip_rms'));assert.ok(gates.some(g=>g.id==='gear.parameter_count_agreement'))}
    if(node.op==='geometry.annulus')assert.equal(model.figures.filter(f=>f.kind==='ring-gates').length,2);
    if(node.op==='topology.holes'){assert.ok(model.figures.some(f=>f.id.startsWith('holes-area')));assert.equal(gates.find(g=>g.id==='holes.expected_positions_resolved').status,'NOT_APPLICABLE')}
    if(node.op==='rules.evaluate')assert.ok(model.figures.some(f=>f.id==='rules-missing'));
    h.api.pipelineView.select(node.id);h.api.pipelineView.openEvidence('tool');const viewer=h.api.pipelineView.evidenceViewer;for(const figure of viewer.descriptors){const rendered=viewer.renderDescriptor(figure);assert.match(rendered.svg,/<image .*data:image\/png;base64,/);assert.equal(rendered.facts.figureId,figure.id);for(const id of rendered.facts.evidenceRefs)assert.ok(trace.artifacts.some(a=>a.id===id),`${node.op}: ${id}`)}h.api.pipelineView.closeEvidence();
   }
  }
  assert.deepEqual([...seen].sort(),Object.keys(OPERATOR_REGISTRY).sort(),'Every registered operator needs a real evidence fixture; adding an operator must not bypass the shared explanation contract');assert.equal(decisionSourceLabel('agent-proposal'),'Agent 提案');assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('fractional saved peak indices plot on the saved curve without losing markers',()=>{
 const points=Array.from({length:720},(_,i)=>({x:i/720*Math.PI*2,y:80+i/720})),original=structuredClone(points),indices=Array.from({length:15},(_,i)=>i*48+.375);
 const markers=indices.map(index=>savedCurvePointAt(points,index));assert.equal(markers.filter(Boolean).length,15);for(const [i,marker]of markers.entries()){assert.ok(Math.abs(marker.x-indices[i]/720*Math.PI*2)<1e-12);assert.ok(Math.abs(marker.y-(80+indices[i]/720))<1e-12)}assert.deepEqual(points,original);assert.equal(savedCurvePointAt([],1.2),null);const wrap=savedCurvePointAt(points,719.5);assert.ok(wrap.x>points.at(-1).x&&wrap.x<Math.PI*2);
});

test('shared crystal explanation renders actual five curves, source formulas, compact bindings and quoted evidence',async()=>{
 const h=await createHarness();try{
  const p=await sample(h),view=h.api.pipelineView;view.select('features');const runId=p.image.pipelineResult.runId;
  const snapshot=view.openEvidence('parameters',{parameterName:'smoothingWindow'}),viewer=view.evidenceViewer,dialog=view.evidenceDialog;assert.equal(Object.getPrototypeOf(Object.getPrototypeOf(viewer)).constructor.name,'ToolExplanationView');assert.equal(snapshot.parameterName,'smoothingWindow');assert.equal(snapshot.runId,runId);assert.ok(dialog.classList.contains('tool-explanation-dialog'));assert.equal(dialog.querySelectorAll('.explanation-sections button').length,3);assert.ok(dialog.querySelector('.explanation-figure svg image[href^="data:image/png;base64,"]'));
  assert.match(dialog.querySelector('.explanation-context').textContent,/誰設定：內建預設/);assert.match(dialog.querySelector('.explanation-context').textContent,/如何產生：本圖推導/);
  view.closeEvidence();view.openEvidence('tool',{figureId:'gear-comparisons'});
  const candidates=p.image.pipelineResult.nodes.find(n=>n.id==='features').artifacts.find(a=>a.id.endsWith(':feature-evidence')).data.parameterComparisons;
  for(let index=0;index<5;index++){selectChange(h,dialog.querySelector('[aria-label="參數比較組"]'),index);assert.equal(viewer.current.facts.candidate.count,candidates[index].count);assert.equal(viewer.current.facts.candidate.curveAvailable,true);assert.equal(viewer.current.facts.selection,index)}
  assert.ok(JSON.stringify(view.evidenceSnapshot()).length<3000);assert.doesNotMatch(JSON.stringify(view.evidenceSnapshot()),/radiusPx|base64|curve":/);
  view.closeEvidence();view.openEvidence('parameters',{parameterName:'smoothingWindow'});dialog.querySelector('[data-decision-source]').click();assert.equal(viewer.current.facts.kind,'parameter-source');assert.ok(viewer.model.parameterChoices.find(p=>p.name==='smoothingWindow').derivation.formula);assert.ok(viewer.descriptors.find(f=>f.id==='gear-comparisons').data.comparisons.length===5);
  const original=viewer.renderDescriptor.bind(viewer),rows=[];viewer.renderDescriptor=f=>{if(f.kind==='parameter-source')rows.push(...f.data.lines);return original(f)};viewer.render();for(;;){const next=dialog.querySelector('[data-source-page="next"]');if(!next||next.disabled)break;next.click()}assert.ok(rows.some(row=>row.includes('pitchFraction')&&row.includes('0.12')));assert.ok(rows.some(row=>row.includes('推導公式')));
  dialog.querySelector('[data-decision-source]').click();let asked;view.onAsk=payload=>asked=payload;viewer.ask();assert.equal(asked.reference.kind,'pipeline_evidence');assert.equal(asked.reference.context.runId,runId);assert.equal(asked.reference.context.parameterName,'smoothingWindow');assert.equal(asked.reference.context.nodeId,'features');assert.ok(asked.reference.context.evidenceRefs.length);assert.equal(view.evidenceSnapshot(),null);
  view.openEvidence('tool');const help=[...dialog.querySelectorAll('footer button')].find(b=>b.textContent==='工具說明 ?');help.click();assert.equal(viewer.current.facts.kind,'teaching');assert.equal(viewer.current.facts.scope,'教學示意');assert.match(viewer.current.caption,/非本圖實算/);
  // A different shared section must leave teaching mode, rather than mislabelling it as actual evidence.
  dialog.querySelector('[data-explanation-section="limits"]').click();assert.notEqual(viewer.current.facts.kind,'teaching');assert.equal(view.evidenceSnapshot().section,'boundary');assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('not-run, stale, old contracts and early return never expose prior actual evidence',async()=>{
 const h=await createHarness();try{
  const p=await sample(h),view=h.api.pipelineView;view.select('features');const old=p.image.pipelineResult,plan=p.workflow.pipelinePlan,node=plan.nodes.find(n=>n.id==='features'),trace=old.nodes.find(n=>n.id==='features');
  for(const model of [buildPipelineDecisionEvidence({plan,node,trace,result:old,current:false}),buildPipelineDecisionEvidence({plan,node,result:null,current:false}),buildPipelineDecisionEvidence({plan,node,trace:{...trace,decision:undefined},result:old,current:true})]){assert.ok(model.parameterChoices.length);assert.ok(model.figures.every(f=>f.kind==='empty'));assert.equal(validatePipelineDecisionEvidence(model).valid,true)}
  view.openEvidence('parameters',{parameterName:'smoothingWindow'});p.updatePipelineParameters('features',{smoothingWindow:7});view.render();assert.equal(view.evidenceSnapshot(),null);const next=view.openEvidence('parameters',{parameterName:'smoothingWindow'});assert.equal(next.runId,null);assert.equal(view.evidenceViewer.report.parameters.find(p=>p.id==='smoothingWindow').value,7);assert.equal(view.evidenceViewer.current.facts.kind,'empty');assert.throws(()=>view.openEvidence('parameters',{parameterName:'absent'}),/未保存這個參數/);
  // A candidate fit may exist in raw hole evidence; without an explicit inner measurement it must not masquerade as adopted innerCircle.
  const fakeNode={id:'features',op:'geometry.annulus',params:{}},fakeTrace={...trace,op:'geometry.annulus',artifacts:[{id:'features:feature-evidence',type:'evidence',data:{holes:[{id:'candidate',circle:{radius:8}}]}}]},fakeResult={...old,measurements:{}};assert.equal(buildPipelineDecisionEvidence({plan,node:fakeNode,trace:fakeTrace,result:fakeResult,current:true}).figures.filter(f=>f.kind==='ring-gates').length,0);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('uncertain feature and its downstream rule evidence both remain diagnostic candidates',async()=>{
 const h=await createHarness();try{
  await importNonCircularPixels(h);const p=h.api.project;p.createPipeline({task:'annulus',goal:'查看雙圓模型是否成立',rules:[{measurement:'centerDistance',max:5,unit:'px'}]});await p.runPipelineImage();await h.api.go(6);assert.equal(p.image.pipelineResult.nodes.find(n=>n.id==='features').featureStatus,'UNKNOWN');
  for(const id of ['features','rules']){const view=h.api.pipelineView;view.select(id);view.openEvidence('tool');assert.equal(view.evidenceViewer.model.status,'DIAGNOSTIC');assert.match(view.evidenceDialog.querySelector('.dialog-heading small').textContent,/當次診斷，不能用於驗收/);assert.ok(view.evidenceViewer.model.figures.every(f=>f.metrics.every(m=>m.label.startsWith('候選'))));view.closeEvidence()}assert.equal(p.image.pipelineResult.classification.status,'UNKNOWN');assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
