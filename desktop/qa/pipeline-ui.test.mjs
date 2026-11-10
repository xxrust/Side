import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pipelineFixtureProposal} from './pipeline-evidence-fixture.mjs';
import {createRequire} from 'node:module';
import {createPipelineHarness as createHarness,importActualExamples,importNonCircularPixels} from './pipeline-component-harness.mjs';
const until=async(fn)=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI calculation did not finish');};

test('Agent facade and retained renderer reach real pixel gear measurement without ROI or legacy check, then batch and invalidate',async()=>{
 const h=await createHarness();try{
  const {w,api}=h,p=api.project;
  const images=[];
  for(const teeth of [12,14]){
   const c=w.document.createElement('canvas');c.width=c.height=260;const ctx=c.getContext('2d');ctx.fillStyle='#eeeeee';ctx.fillRect(0,0,260,260);ctx.fillStyle='#222222';ctx.beginPath();
   for(let j=0;j<teeth*8;j++){const a=j/(teeth*8)*Math.PI*2,r=j%8<4?100:85;const x=130+r*Math.cos(a),y=130+r*Math.sin(a);j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.fillStyle='#eeeeee';ctx.beginPath();ctx.arc(130,130,22,0,Math.PI*2);ctx.fill();images.push({name:`test-${images.length+1}.png`,dataUrl:c.toDataURL()});
  }
  await api.addImages(images);assert.equal(p.workflow.checks.length,0);assert.equal(Object.keys(p.workflow.workpiece.regions).length,0);
  await api.agent.execute('create_pipeline',pipelineFixtureProposal({task:'gear',goal:'量測所示影像的齒數'}));await api.agent.execute('run_pipeline',{});
  await until(()=>p.image?.pipelineResult);await h.tick();
  assert.equal(p.image.pipelineResult.measurements.visibleTeeth,12);assert.equal(p.image.pipelineResult.classification.status,'UNKNOWN');assert.equal(p.isPipelineResultCurrent(),true);
  assert.equal(p.workflow.checks.length,0);assert.equal(p.workflow.recipe,null);assert.ok(w.document.querySelector('[data-pipeline-node="features"]'));
  assert.ok(w.document.querySelector('.pipeline-pane canvas'));assert.match(w.document.querySelector('.pipeline-workbench').textContent,/尚未設定規格|規格|無法判定/);
  const review=w.document.querySelector('[data-pipeline-action="batch"]');assert.ok(review);review.click();await h.tick();
  const batch=[...w.document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='批次試跑');assert.ok(batch);batch.click();
  await until(()=>p.workflow.pipelineValidation?.status==='COMPLETED');assert.deepEqual(Array.from(p.workflow.pipelineValidation.rows,r=>r.measurements.visibleTeeth),[12,14]);assert.equal(p.workflow.pipelineValidation.accuracy,null);
  const old=p.image.pipelineResult;p.updatePipelineParameters('features',{smoothingWindow:7});assert.equal(p.isPipelineResultCurrent(old),false);assert.equal(p.image.pipelineResult,undefined);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('continuous calculation retains the last output until a fresh result is ready',async()=>{
 const h=await createHarness();try{
  await importActualExamples(h);const {project:p,pipelineView:view}=h.api;
  await h.api.agent.execute('create_pipeline',pipelineFixtureProposal({task:'holes',goal:'連續試算保留上一輪輸出'}));
  await h.api.agent.execute('run_pipeline',{});await until(()=>p.image?.pipelineResult);await h.tick();
  const previous=p.image.pipelineResult;
  view.select('features');view.working=true;view.invalidatedRun=previous.runId;view.render();await h.tick();
  const model=view.model;
  assert.equal(model.current,false,'freshness remains false while the old run is invalidated');
  assert.equal(model.displayResult,true,'the old run remains displayable during computation');
  assert.equal(model.result.runId,previous.runId);
  assert.match(h.w.document.querySelector('.pipeline-inspector').textContent,/計算中；保留上一輪輸出/);
  assert.ok(h.w.document.querySelector('.pipeline-pane canvas[aria-label="本步處理結果與特徵疊圖"]'));
  view.working=false;view.invalidatedRun=null;view.render();
  assert.equal(view.getModel().displayResult,true);
 }finally{h.close();}
});

test('batch execution keeps a real output row for the final image',async()=>{
 const h=await createHarness();try{
  await importActualExamples(h);const {project:p}=h.api;
  await h.api.agent.execute('create_pipeline',pipelineFixtureProposal({task:'holes',goal:'批次最後一張也保存輸出'}));
  const validation=await p.validatePipelineImages();
  assert.equal(validation.status,'COMPLETED');
  assert.equal(validation.processed,p.data.images.length);
  assert.equal(validation.rows.length,p.data.images.length);
  const last=p.data.images.at(-1),lastRow=validation.rows.at(-1);
  assert.equal(lastRow.imageId,last.id);
  assert.ok(lastRow.runId);
  assert.equal(last.pipelineResult.runId,lastRow.runId);
  assert.ok(last.pipelineResult.nodes.some(node=>node.status==='OK'));
 }finally{h.close();}
});

test('Agent tools build and run an actual graph and switch images without proposing a legacy check',async()=>{
 const h=await createHarness();try{
  await importActualExamples(h);const p=h.api.project,agent=h.api.agent;
  const capabilities=await agent.execute('get_pipeline_capabilities',{});assert.ok(capabilities.operators.some(o=>o.op==='shape.gear'));
  const proposal=await agent.execute('create_pipeline',pipelineFixtureProposal({task:'holes',goal:'計算封閉孔數'}));assert.equal(proposal.status,'TRIAL');assert.equal(h.api.page,6);
  const id=p.data.images[1].id;await agent.execute('select_image',{image_id:id});assert.equal(p.image.id,id);
  const result=await agent.execute('run_pipeline',{});assert.ok(result?.runId);assert.equal(result.classification.status,'UNKNOWN');assert.equal(p.workflow.checks.length,0);
  await assert.rejects(()=>agent.execute('set_pipeline_graph',{goal:'bad',plan_json:JSON.stringify({...p.workflow.pipelinePlan,nodes:[{id:'fake',op:'unknown',version:1,inputs:{}}]})}),/不支持算子/);
 }finally{h.close();}
});

test('uncertain geometry stays diagnostic when the user selects downstream rules or batch results',async()=>{
 const h=await createHarness();try{
  await importNonCircularPixels(h);await h.api.agent.execute('create_pipeline',pipelineFixtureProposal({task:'annulus',goal:'檢查這張圖能否支持雙圓模型'}));await h.api.agent.execute('run_pipeline',{});
  const p=h.api.project;assert.equal(p.image.pipelineResult.nodes.find(n=>n.id==='features').featureStatus,'UNKNOWN');
  h.api.pipelineView.select('rules');assert.match(h.w.document.querySelector('.pipeline-inspector').textContent,/診斷候選，不能用於驗收/);
  assert.ok([...h.w.document.querySelectorAll('.pipeline-metric small')].every(n=>n.textContent.includes('候選')));
  await p.validatePipelineImages();assert.ok(p.workflow.pipelineValidation.rows.every(r=>!r.measured));
 }finally{h.close();}
});

test('Agent view tool selects the requested image, node and evidence view without recalculation',async()=>{
 const h=await createHarness();try{
  await importActualExamples(h);const {project:p,agent,pipelineView}=h.api;
  await agent.execute('create_pipeline',pipelineFixtureProposal({task:'holes',goal:'計算封閉孔數'}));
  const revision=p.workflow.pipelinePlan.revision,id=p.data.images[1].id;
  const selected=await agent.execute('set_pipeline_view',{node_id:'features',image_id:id,visual:'image',mode:'compare'});
  assert.equal(selected.imageId,id);assert.equal(selected.page,6);assert.equal(selected.visible,true);assert.ok(h.w.document.querySelector('dialog.pipeline-inspection-dialog[open] .pipeline-workbench'));assert.ok(h.api.inquiryView.embedded);
  assert.equal(pipelineView.nodeId,'features');assert.equal(pipelineView.visual,'image');assert.equal(pipelineView.mode,'compare');
  const context=await agent.execute('get_context',{});
  assert.equal(context.pipelineView.nodeId,'features');assert.equal(context.pipelineView.visual,'image');assert.equal(context.image.id,id);
  assert.equal(p.workflow.pipelinePlan.revision,revision);assert.equal(p.image.pipelineResult,undefined);
  await assert.rejects(()=>agent.execute('set_pipeline_view',{node_id:'absent',image_id:p.data.images[0].id}),/有效算子/);
  await assert.rejects(()=>agent.execute('set_pipeline_view',{node_id:'features',visual:'unknown'}),/檢視方式/);
  await assert.rejects(()=>agent.execute('set_pipeline_view',{node_id:'features',image_id:'absent'}),/圖片不存在/);
  assert.equal(p.image.id,id);assert.equal(pipelineView.visual,'image');
  await agent.execute('run_pipeline',{});const runId=p.image.pipelineResult.runId;
  assert.equal(p.pixels.get(id).grayProvenance.source,'image.decode@1');
  assert.match(JSON.stringify(p.image.pipelineResult.nodes.find(n=>n.op==='image.grayscale').artifacts),/image\.decode@1/);
  await agent.execute('set_pipeline_view',{node_id:'segment',visual:'curves',mode:'input'});
  assert.equal(pipelineView.nodeId,'segment');assert.equal(pipelineView.mode,'input');assert.equal(pipelineView.visual,'curves');
  assert.equal(p.image.pipelineResult.runId,runId);assert.equal(p.workflow.pipelinePlan.revision,revision);
  assert.equal((await agent.execute('get_context',{})).pipelineView.visual,'curves');
  const shown=await agent.execute('set_pipeline_view',{node_id:'segment',section:'parameters',parameter_name:'threshold'});
  assert.equal(shown.explanation.parameterName,'threshold');assert.equal(shown.explanation.runId,runId);
  assert.equal((await agent.execute('get_context',{})).pipelineView.explanation.parameterName,'threshold');
  await agent.execute('set_pipeline_view',{node_id:'features'});assert.equal(pipelineView.evidenceSnapshot(),null);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('production Agent view route displays an actual output on canvas without test mounting and returns to the same board',async()=>{
 const {createHarness:actualApp}=createRequire(import.meta.url)('./workflow-ui-harness.cjs'),h=await actualApp();try{
  await importActualExamples(h);const p=h.api.project,boardId=h.api.inquiryView.boardId;
  await h.api.agent.execute('create_pipeline',pipelineFixtureProposal({task:'holes',goal:'查看真實分割圖與依據'}));await h.api.agent.execute('run_pipeline',{});
  const runId=p.image.pipelineResult.runId;
  const shown=await h.api.agent.execute('set_pipeline_view',{node_id:'segment',mode:'compare'});
  assert.equal(shown.visible,true);const dialog=h.w.document.querySelector('dialog.pipeline-inspection-dialog[open]');assert.ok(dialog);assert.equal(dialog.querySelectorAll('.pipeline-pane canvas').length,2);assert.equal(h.api.pipelineView.nodeId,'segment');assert.equal(p.image.pipelineResult.runId,runId);
  dialog.querySelector('button').click();assert.equal(dialog.open,false);assert.equal(h.api.inquiryView.boardId,boardId);assert.ok(h.api.inquiryView.embedded);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
