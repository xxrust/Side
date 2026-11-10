import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {resolveNodeOutput,outputImageReference} from '../src/node-output-model.js';import {canvasProjectAgentContext} from '../src/canvas-agent-context.js';
const {createHarness}=createRequire(import.meta.url)('./workflow-ui-harness.cjs');
const base=new URL('../../codex-audit-logs/20261029-failure-repair/pi-mapping-closure/turn4/',import.meta.url),read=async name=>JSON.parse(await fs.readFile(new URL(name,base),'utf8'));
test('Pi image-mode tools use actual shared facade, captured board and immutable saved OpenCV pixels',async()=>{
 const h=await createHarness();try{
  await h.api.loadProject(h.w.JSON.parse(JSON.stringify(await read('completed.agentcv.json'))));const p=h.api.project,pack=await read('unit-710e34f7-5ac2-441c-8dc2-ce3957424625-51c478409424.json');
  p.restoreInspectionUnit(h.w.JSON.parse(JSON.stringify(pack)),{executionId:pack.executionId,unitId:pack.record.unitId});await p.selectImage(pack.record.imageIds[0]);let output=resolveNodeOutput(p,{schemeNodeId:'correspondence'});const artifact=output.artifacts.find(a=>a.id==='matches'),bytes=await fs.readFile(artifact.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);p.setInspectionArtifactPreview(output.run.runId,artifact.id,'data:image/png;base64,'+bytes.toString('base64'));output=resolveNodeOutput(p,{schemeNodeId:'correspondence'});
  const board=p.createInquiryBoard({title:'Pi 模式工具驗證'}),added=p.addInquiryImage(h.w.JSON.parse(JSON.stringify(outputImageReference(output,output.artifacts.find(a=>a.id==='matches')))),{boardId:board.id,actor:'agent'}),other=p.createInquiryBoard({title:'另一塊畫板'}),agent=h.api.agent;
  // Drive real host dispatch; no model transport or fabricated algorithm reply.
  agent.turn='mode-test';agent.turnVisualBoardId=board.id;
  const current=await agent.execute('get_canvas_image_mode',{item_id:added.item.id});assert.equal(current.board_id,board.id);assert.equal(current.mode,'fixed');assert.equal(p.data.visualInquiry.activeBoardId,other.id);
  const live=await agent.execute('set_canvas_image_mode',{item_id:added.item.id,mode:'live',scheme_node_id:'correspondence',artifact_id:'matches'});assert.equal(live.mode,'live');assert.equal(live.frameAvailable,true);assert.equal(live.runId,output.run.runId);assert.equal(live.author,'agent');assert.doesNotMatch(JSON.stringify(live),/data:image/);
  const context=canvasProjectAgentContext(p,board.id);assert.equal(context.imageModes.set,'set_canvas_image_mode');assert.equal(context.items.find(i=>i.id===added.item.id).imageMode.mode,'live');assert.ok(context.imageModes.subscriptions.some(n=>n.schemeNodeId==='correspondence'&&n.outputs.some(a=>a.artifactId==='matches')));
  h.api.inquiryView.outputView.focus('correspondence','output');const visual=await agent.execute('get_visual_context',{});assert.equal(visual.display.mode,'output');assert.equal(visual.display.schemeNodeId,'correspondence');assert.equal(visual.display.output.runId,output.run.runId);assert.deepEqual(Array.from(visual.display.output.artifactIds),['matches']);assert.doesNotMatch(JSON.stringify(visual),/data:image/);
  const snapshot=p.captureInquirySnapshot(board.id);assert.equal(snapshot.items.find(i=>i.id===added.item.id).liveOutput,undefined);assert.ok(snapshot.items.find(i=>i.id===added.item.id).frozenLiveOutput);
  const fixed=await agent.execute('set_canvas_image_mode',{item_id:added.item.id,mode:'fixed'});assert.equal(fixed.mode,'fixed');assert.equal(fixed.frozenFrom.runId,output.run.runId);
  p.groupRunArtifacts(board.id,output.run.runId);await assert.rejects(()=>agent.execute('set_canvas_image_mode',{item_id:added.item.id,mode:'live',scheme_node_id:'correspondence',artifact_id:'matches'}),/固定.*圖組/);
  await assert.rejects(()=>h.api.visualAgent.action('set_canvas_image_mode',{board_id:board.id,item_id:added.item.id,mode:'fixed'},{isCurrent:()=>false}),/停止|變更/);
  agent.turn=null;
 }finally{h.close()}
});
