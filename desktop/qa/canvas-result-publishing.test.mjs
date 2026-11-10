import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {createHarness}=createRequire(import.meta.url)('./workflow-ui-harness.cjs');
const dataUrl='data:image/png;base64,'+fs.readFileSync('../prd/2026-10-26-canvas-first/assets/holes-1.png').toString('base64');
async function setup(){const h=await createHarness();await h.api.addImages([{name:'holes-1.png',dataUrl}]);await h.api.go(6);for(let i=0;i<80&&!h.api.inquiryView.board();i++)await h.tick();const v=h.api.inquiryView,source=h.api.project.canvasProjectContext(v.boardId).sources[0];await v.projectCards.addOriginal(source,source.images[0]);return h;}
test('real pixel pipeline results stay on source canvas and publish true stage images with traceable connections',async()=>{
 const h=await setup();try{const {project:p,inquiryView:v,agent:a}=h.api,boardId=v.boardId;a.turn='operational-check';a.turnVisualBoardId=boardId;
 p.createPipeline({task:'holes',goal:'核對圖像輸出回到來源畫板；不提交正式驗收'}, {source:'human'});assert.equal(v.embedded,true);assert.equal(h.api.page,6);
 const result=await a.execute('run_pipeline',{});assert.ok(result.visual[0].images.length);assert.equal(h.api.page,6);assert.equal(v.boardId,boardId);assert.ok(v.embedded&&v.panel.isConnected);assert.ok(v.board().items.length>1);assert.ok(!(p.data.canvasRelations||[]).some(r=>r.label?.startsWith('由此原圖計算產生')));
 const runId=p.image.pipelineResult.runId;assert.ok(v.board().items.slice(1).every(i=>v.asset(i).source.runId===runId));
 const count=v.board().items.length;await a.execute('set_pipeline_view',{node_id:p.workflow.pipelinePlan.nodes.at(-1).id});assert.equal(v.board().items.length,count);assert.equal(h.api.page,6);assert.equal(v.boardId,boardId);
 const output=v.board().items.find(i=>v.asset(i).source.runId===runId),source=v.asset(output).source;assert.equal(source.imageId,p.image.id);assert.equal(source.inputSha256,p.image.sha256);const assetId=output.assetId;const saved=p.serialize();const loading=h.api.loadProject(saved);await h.tick();const confirm=h.w.document.querySelector('.confirm-action-dialog button.primary');assert.ok(confirm,'dirty project switch requires a visible confirmation');confirm.click();await loading;assert.equal(p.ensureInquiry().assets.find(a=>a.id===assetId).source.runId,runId);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
test('showing an existing actual image places it directly on source board without duplicate items',async()=>{
 const h=await setup();try{const {inquiryView:v,agent:a}=h.api,item=v.board().items[0];a.turn='display';a.turnVisualBoardId=v.boardId;await a.execute('show_visual_image',{asset_id:item.assetId,caption:'真實原圖'});assert.equal(v.board().items.length,1);assert.equal(h.api.page,6);assert.equal(v.embedded,true);}finally{h.close();}
});
