import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createPipelineHarness as createHarness,importActualExamples} from './pipeline-component-harness.mjs';
const press=async(h,selector)=>{const button=h.w.document.querySelector(selector);assert.ok(button,selector);assert.equal(button.disabled,false);button.click();await h.tick()};
async function prepare(h,{rules=[],count=1}={}){
 const c=h.w.document.createElement('canvas');c.width=c.height=120;const ctx=c.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,120,120);ctx.fillStyle='#222';ctx.beginPath();ctx.arc(60,60,43,0,Math.PI*2);ctx.fill();ctx.fillStyle='#eee';ctx.beginPath();ctx.arc(60,60,21,0,Math.PI*2);ctx.fill();
 await h.api.addImages(Array.from({length:count},(_,index)=>({name:`ring-${index+1}.png`,dataUrl:c.toDataURL()})));
 h.api.project.createPipeline({task:'annulus',rules});await h.api.go(6);return h.api.pipelineView;
}

test('parameter, measurement and long limitation pages expose every item without a scroll container',async()=>{
 const h=await createHarness();try{
  const view=await prepare(h),p=h.api.project;await p.runPipelineImage();view.select('features');view.openDetails('parameters');
  const visited=[];for(;;){const fields=h.w.document.querySelectorAll('.pipeline-dialog-fields [data-pipeline-parameter]');assert.ok(fields.length<=1);visited.push(...Array.from(fields,input=>input.dataset.pipelineParameter));const next=h.w.document.querySelector('.pipeline-dialog [data-page-action="next"]');if(next.disabled)break;await press(h,'.pipeline-dialog [data-page-action="next"]')}
  assert.ok(visited.includes('maxResidualPx'));assert.ok(visited.includes('maxRelativeResidual'));assert.ok(visited.includes('minAngularCoverageDeg'));
  view.openDetails('metrics');const expected=Array.from(view.metrics(view.getModel()),metric=>metric.label),labels=[];for(;;){const cards=h.w.document.querySelectorAll('.pipeline-dialog-metrics .pipeline-metric');assert.ok(cards.length<=6);labels.push(...Array.from(cards,card=>card.querySelector('small').textContent));const next=h.w.document.querySelector('.pipeline-dialog [data-page-action="next"]');if(next.disabled)break;await press(h,'.pipeline-dialog [data-page-action="next"]')}assert.deepEqual(labels,expected);
  const long='限制條件需要逐頁可讀。'.repeat(90);p.image.pipelineResult.limitations=[long];view.openDetails('boundary');let text='';for(;;){text+=h.w.document.querySelector('.pipeline-dialog-page').textContent;const next=h.w.document.querySelector('.pipeline-dialog [data-page-action="next"]');if(next.disabled)break;await press(h,'.pipeline-dialog [data-page-action="next"]')}assert.ok(text.includes(long));
  const css=await readFile(new URL('../src/pipeline-view.css',import.meta.url),'utf8');assert.doesNotMatch(css,/overflow(?:-y)?\s*:\s*(?:auto|scroll)/);assert.match(css,/height:min\(580px/);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('one-rule pages preserve all rules and unsaved edits when moving across thirteen conditions',async()=>{
 const h=await createHarness();try{
  const rules=Array.from({length:13},(_,index)=>({id:`rule-${index}`,measurement:'closedHoleCount',equals:index+1,unit:'count'})),view=await prepare(h,{rules});view.select('rules');view.openDetails('parameters');
  const edit=value=>{const input=h.w.document.querySelector('[data-rule-field="equals"]');input.value=String(value);input.dispatchEvent(new h.w.Event('input',{bubbles:true}))};edit(99);
  for(let index=1;index<13;index++){await press(h,'[data-rule-page-action="next"]');assert.equal(h.w.document.querySelectorAll('.pipeline-rule-row').length,1)}edit(77);
  for(let index=0;index<12;index++)await press(h,'[data-rule-page-action="previous"]');assert.equal(h.w.document.querySelector('[data-rule-field="equals"]').value,'99');
  h.w.document.querySelector('.pipeline-rules-editor').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));await h.tick();const saved=h.api.project.workflow.pipelinePlan.nodes.find(node=>node.id==='rules').params.rules;assert.equal(saved.length,13);assert.equal(saved[0].equals,99);assert.equal(saved[12].equals,77);for(let index=1;index<12;index++)assert.equal(saved[index].equals,index+1);assert.deepEqual(Array.from(saved,rule=>rule.id),rules.map(rule=>rule.id));assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('batch pagination exposes every real image in at most four rows per page',async()=>{
 const h=await createHarness();try{
  const view=await prepare(h,{count:9}),p=h.api.project;await p.validatePipelineImages();view.openBatch();const names=[];for(;;){const rows=h.w.document.querySelectorAll('.pipeline-batch-table tbody tr');assert.ok(rows.length<=4);names.push(...Array.from(rows,row=>row.querySelector('button').textContent));const next=h.w.document.querySelector('.pipeline-dialog [data-page-action="next"]');if(next.disabled)break;await press(h,'.pipeline-dialog [data-page-action="next"]')}assert.deepEqual(names,Array.from(p.data.images,image=>image.name));assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('image and curve occupy the same main viewport, parameters stay in dialog, support IDs never become labels',async()=>{
 const h=await createHarness();try{
  const view=await prepare(h);await h.api.project.runPipelineImage();view.select('features');
  assert.equal(view.visual,'image');assert.equal(h.w.document.querySelectorAll('.pipeline-panes').length,1);assert.equal(h.w.document.querySelectorAll('.pipeline-chart-stage,.pipeline-curve').length,0);assert.equal(h.w.document.querySelectorAll('.pipeline-inspector input,.pipeline-inspector select').length,0);
  await press(h,'[data-pipeline-visual="curves"]');assert.equal(h.w.document.querySelectorAll('.pipeline-chart-stage canvas').length,1);assert.equal(h.w.document.querySelectorAll('.pipeline-panes').length,0);
  await press(h,'[data-pipeline-visual="image"]');assert.equal(h.w.document.querySelectorAll('.pipeline-pane canvas').length,1);assert.equal(h.w.document.querySelectorAll('.pipeline-chart-stage').length,0);
  const ctx=h.w.document.createElement('canvas').getContext('2d'),labels=[];ctx.fillText=text=>labels.push(text);const artifacts=[{type:'points',points:[...Array.from({length:200},(_,i)=>({id:`support-${i}`,label:`support-${i}`,role:'support',x:20+i%50,y:20+Math.floor(i/50)})),{role:'peaks',label:'齒 1',x:50,y:10},{role:'selected-center',label:'採用的齒形中心',x:50,y:50},{role:'hole-center',label:'孔中心',x:53,y:50}]},{type:'circles',circles:[{id:'holeCenterCandidates-0',role:'centerFit',center:{x:50,y:50},radius:30},{id:'outer',selected:true,displayLabel:'外圓中心',center:{x:50,y:50},radius:40}]}];
  view.drawOverlays(ctx,artifacts,1);assert.deepEqual(labels,['齒 1','採用的齒形中心','孔中心','外圓中心']);labels.length=0;view.showDiagnostics=true;view.drawOverlays(ctx,artifacts,1);assert.deepEqual(labels,['齒 1','採用的齒形中心','孔中心','外圓中心']);
  view.openDetails('parameters');assert.ok(h.w.document.querySelector('.pipeline-dialog [data-pipeline-parameter]'));assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
