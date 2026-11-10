// Real application host tools, imported PNG pixels, production workers and CV.
// Only the outbound Pi transport is captured; no model or detection is mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {agentTools} from '../src/agent-contract.js';
import {createPipelinePlan} from '../src/pipeline-runtime.js';
import {OPERATOR_REGISTRY} from '../src/pipeline-registry.js';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const sides=['top','bottom','left','right'];

// Browser Blob URLs have no built-in implementation in the DOM harness. Feed
// their real bytes to the native PNG/SVG decoder, rather than fake a rendered
// figure or change production rasterization/visual-source code.
function localBlobImages(h){
 const blobs=new Map(),NativeImage=h.w.Image;let next=0;
 h.w.URL.createObjectURL=blob=>{const url='blob:agent-edge-qa-'+(++next);blobs.set(url,blob);return url};
 h.w.URL.revokeObjectURL=url=>blobs.delete(url);
 h.w.Image=class extends NativeImage{
  set src(value){const blob=blobs.get(value);if(blob)blob.arrayBuffer().then(bytes=>{super.src=Buffer.from(bytes)}).catch(error=>this.onerror?.(error));else super.src=value}
  get src(){return super.src}
 };
}

function png(h,width,height,pixel){
 const canvas=h.w.document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d'),data=ctx.createImageData(width,height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=pixel(x,y),i=(y*width+x)*4;data.data[i]=v;data.data[i+1]=v;data.data[i+2]=v;data.data[i+3]=255}
 ctx.putImageData(data,0,0);return canvas.toDataURL('image/png');
}
async function edgeFixture(h){
 const dataUrl=png(h,420,300,(x,y)=>{
  let v=30;if(x>=74&&x<346&&y>=54&&y<246)v=45;
  if(x>=80&&x<340&&y>=60&&y<240)v=180;
  if(x>=88&&x<332&&y>=68&&y<232)v=220;
  if(x>=150&&x<180&&y>=110&&y<145)v=125;
  return v;
 });
 await h.api.addImages([{name:'neutral-camera.png',dataUrl}]);
 const p=h.api.project,targetId=p.workflow.workpiece.id;
 p.setRegion(targetId,[{x:88,y:68},{x:332,y:68},{x:332,y:232},{x:88,y:232}]);
 const check=p.addCheck({name:'工程師要求外框寬度',kind:'width',targetId,unit:'px',min:258,max:262});
 p.buildRecipe({edges:{threshold:18,maxAngle:15,searchBand:28},edgeAnchors:{[targetId]:Object.fromEntries(sides.map(side=>[side,{offset:0,angle:['left','right'].includes(side)?90:0}]))}});
 await p.runImage();await h.api.go(6);
 return {p,targetId,check};
}
function edgeJustification(context){
 return {
  tool:{reason:'工程師要量工件外框；先在原搜尋帶比較內外側候選的真像素方向、對比和完整品質，再決定外緣是否唯一。',expectedEvidence:context.evidenceArtifacts.map(a=>({kind:'artifact',id:a.id,type:a.type}))},
  parameters:context.requiredParameters.map(({name,source})=>({name,source,reason:name==='intent'?'本輪明確提出外緣意圖，與原內框教學比較；不將最外背景自動稱為工件。':name==='contrastPolarity'?'以本圖內外像素取樣核對亮暗方向；若無法推定或可信框不唯一就回 UNKNOWN。':`沿用目前方案 ${name} 的已保存值，不放寬原品質門檻，並核對八組有限比較。`,verification:{kind:'artifact',id:'edge-parameter-comparison',type:'curves'}})),
  boundaries:context.gateIds.map(id=>({condition:id==='quality'?'覆蓋、RMS、連續性與局部支持均須通過原固定品質門檻。':id==='roi-bounds'?'候選需位於本圖有效原搜尋 ROI，不能擴帶追背景。':id==='candidate-uniqueness'?'同級可信邊界不唯一時不能任意選最外或梯度最大線。':'八組設定的線位需一致；不能挑一組成功就宣稱穩定。',check:{kind:'gate',id},onFailure:'UNKNOWN'}))
 };
}
async function edgeArgs(h,targetId){const c=await h.api.agent.execute('get_edge_search_context',{image_id:h.api.project.image.id,target_ids:[targetId]});return {image_id:c.source.imageId,target_ids:[targetId],sides:[...sides],intent:'outer',contrast_polarity:'auto',source:copy(c.source),reason:'工程師要求四側外緣；保留原人工教學，先真實試算而不冒稱已確認或發布。',justification:edgeJustification(c)}}
function beginToolTurn(h){const agent=h.api.agent,responses=[];agent.turn='qa-host-tool-turn';agent.turnEpoch=h.api.project.epoch;agent.expectedStamp=agent.stamp();agent.wire=async response=>{responses.push(copy(response))};return responses}
async function toolEvent(h,responses,name,args,id=name){const agent=h.api.agent;agent.expectedStamp=agent.stamp();await agent.event({type:'tool_request',turn:agent.turn,id,name,args});assert.equal(responses.at(-1).type,'tool_response');assert.equal(responses.at(-1).id,id);return responses.at(-1).result}
function actionable(result,{code,path,nodeId}={}){
 assert.ok(result.error,'host rejection reaches the requesting tool');assert.equal(typeof result.code,'string');if(code)assert.equal(result.code,code);
 assert.ok(result.errors?.length,'the Pi host receives structured repair information, not only prose');
 for(const issue of result.errors)for(const key of ['code','nodeId','path','message','hint'])assert.ok(typeof issue[key]==='string'&&issue[key],`repair issue requires ${key}`);
 if(path)assert.ok(result.errors.some(issue=>issue.path.includes(path)),`missing section ${path} must be identified`);
 if(nodeId)assert.ok(result.errors.some(issue=>issue.nodeId===nodeId),`upstream node ${nodeId} must be identified`);
}
function gearInput({withRules=true}={}){
 const parameters={expectedTeeth:14},rules=withRules?[{measurement:'visibleTeeth',equals:14}]:[],plan=createPipelinePlan({task:'gear',parameters,rules}),justifications={};
 for(const node of plan.nodes){
  justifications[node.id]={tool:{reason:node.id==='features'?'工件輪廓有週期性齒向起伏，只有實際徑向支持及模型閘值成立時才採用齒峰數量。':node.id==='rules'?'只依明確提出的14齒規格比較當次量測，沒有規格時保留 UNKNOWN，不根據檔名猜公差。':'本案用實算強度、遮罩和唯一連通區建立齒形量測的輸入；每步核對真像素產物，不用通用原理代替當次證據。',expectedEvidence:[{kind:'artifact',type:'evidence'}]},parameters:Object.keys(OPERATOR_REGISTRY[node.op].params).map(name=>({name,source:Object.hasOwn(node.params,name)?'agent-proposal':name==='componentId'?'not-supplied':name==='threshold'||['sampleCount','smoothingWindow','minProminence','minPeakDistance'].includes(name)?'data-derived':'operator-default',reason:name==='expectedTeeth'?'本測試明確提出14齒作待審規格，不將量得峰數回填為答案。':name==='componentId'?'未指定候選編號，需由唯一合格物件條件決定；多候選時保留 UNKNOWN。':`本案 ${name} 使用保存的設定或資料推導策略，運算後需核對實值、來源與比較範圍，未宣稱最佳。`,verification:{kind:'execution-status',allowed:['OK']}})),boundaries:[{condition:node.id==='features'?'實際外輪廓必須具有可用的齒形徑向起伏；模型不適用時不交付齒數。':'本節點需有有效輸入並完成實算，上游不成立則不交付下游結果。',check:node.id==='features'?{kind:'gate',id:'gear.radial_range'}:{kind:'execution-status',allowed:['OK']},onFailure:'UNKNOWN'}]};
 }
 return {task:'gear',goal:'核對真齒形影像的逐步證據與明確規格',parameters,rules,justifications};
}
async function gearFixture(h){const dataUrl=png(h,260,260,(x,y)=>{const dx=x+.5-130,dy=y+.5-130;return Math.hypot(dx,dy)<80+7*Math.cos(14*Math.atan2(dy,dx))&&Math.hypot(dx-4,dy+2)>24?0:255});await h.api.addImages([{name:'neutral-gear-camera.png',dataUrl}]);return h.api.project}

test('advertised host tools lead from a true imported PNG inner measurement to a new outer TRIAL run and inspectable actual figures',async()=>{
 const h=await createHarness();localBlobImages(h);try{
  const {p,targetId,check}=await edgeFixture(h),agent=h.api.agent,old=copy(p.image.result),revision=p.workflow.recipe.revision;
  assert.ok(Math.abs(old.targets[targetId].measurement.width-244)<1.5);assert.equal(old.checks[check.id].status,'NG');
  for(const name of ['get_inspection_capabilities','get_edge_search_context','trial_edge_search','set_inspection_view','verify_pipeline_delivery'])assert.ok(agentTools.some(t=>t.function.name===name),`Pi receives ${name}`);
  const caps=await agent.execute('get_pipeline_capabilities',{}),route=caps.relatedWorkbenchCapabilities.fourSideEdges;
  const edges=await agent.execute(route.read,{});assert.ok(edges.intents.includes('outer'));assert.equal(route.trial,'trial_edge_search');
  const request=await edgeArgs(h,targetId),reply=await agent.execute(route.trial,request),current=p.image.result;
  assert.notEqual(current.run_id,old.run_id);assert.equal(p.workflow.recipe.revision,revision+1);assert.ok(Math.abs(current.targets[targetId].measurement.width-260)<1.5);assert.equal(current.checks[check.id].status,'OK');
  assert.equal(reply.stage,'TRIAL');assert.equal(reply.humanConfirmed,false);assert.equal(reply.evidence.delivered,false);assert.equal(reply.sourceBinding.runId,current.run_id);assert.equal(current.edgeTrial.stage,'TRIAL');
  const untouched=JSON.stringify(current),viewReply=await agent.execute(route.view,{target_id:targetId,side:'left',section:'tool',figure_id:'candidates'}),view=h.api.planView.explanation;
  assert.equal(h.api.page,6);assert.equal(h.api.planView.stepId,'edges');assert.equal(view.dialog.open,true);assert.equal(view.toolId,'edges');assert.equal(view.state.side,'left');assert.equal(view.figureId,'candidates');assert.equal(view.report.binding.runId,current.run_id);assert.equal(view.report.binding.recipeRevision,p.workflow.recipe.revision);assert.ok(view.current.svg.includes('data:image/png;base64,'),'the figure contains the actual imported raster');
  const left=current.targets[targetId].measurement.edges.left;
  assert.equal(view.current.facts.selectedId,left.selected.id);assert.deepEqual(copy(view.current.facts.candidates.map(c=>[c.id,c.geometry])),copy((left.candidate_pool||left.candidates).map(c=>[c.id,c.geometry])));assert.equal(view.current.facts.stage,'TRIAL');assert.equal(view.report.binding.stage,'TRIAL');assert.equal(view.report.binding.humanConfirmed,false);assert.ok(viewReply);
  await agent.execute(route.view,{target_id:targetId,side:'left',section:'parameters',figure_id:'comparison'});
  assert.equal(view.figureId,'comparison');assert.equal(view.report.binding.runId,current.run_id);assert.equal(view.state.side,'left');assert.equal(JSON.stringify(p.image.result),untouched,'view changes do not synthesize another run or change a measurement');
  const visual=await agent.execute('get_visual_context',{}),figure=visual.catalog.find(entry=>entry.source?.runId===current.run_id&&entry.source?.figureId==='comparison');assert.ok(figure,'Agent can discover the actual current-run evidence figure');
  const shown=await agent.execute('show_visual_image',{source_id:figure.source_id||figure.id,caption:'本圖外緣 TRIAL：原圖疊合與完整八組參數比較，尚未人工確認。'}),attachment=shown.attachments[0],asset=p.ensureInquiry().assets.find(a=>a.id===attachment.assetId);
  assert.ok(asset.dataURL.startsWith('data:image/png;base64,'),'chat gets actual locally rasterized evidence pixels');assert.equal(asset.source.runId,current.run_id);assert.equal(asset.source.recipeRevision,p.workflow.recipe.revision);assert.equal(asset.source.figureId,'comparison');assert.equal(asset.source.coordinateSpace,'render-pixels');assert.equal(asset.source.stage,'TRIAL');assert.equal(asset.source.source,'agent');assert.equal(asset.source.humanConfirmed,false);assert.equal(p.data.chat.at(-1).attachments[0].assetId,asset.id);assert.equal(JSON.stringify(p.image.result),untouched);
  const boundaryReply=await agent.execute(route.view,{target_id:targetId,side:'left',section:'boundary'}),boundarySnapshot=view.snapshot();
  assert.equal(boundaryReply.section,'limits');assert.equal(boundaryReply.figureId,boundarySnapshot.figureId);assert.equal(boundaryReply.figureId,'trial-gates');
  const boundaryVisual=await agent.execute('get_visual_context',{}),boundaryFigure=boundaryVisual.catalog.find(entry=>entry.source?.runId===current.run_id&&entry.source?.figureId==='trial-gates');
  assert.ok(boundaryFigure,'actual boundary checks are discoverable');assert.equal(boundaryFigure.source.teaching,false);assert.equal(boundaryFigure.source.stage,'TRIAL');
  assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('edge rationale omissions survive Agent.event as structured actionable errors and leave the old real recipe/result intact',async()=>{
 const h=await createHarness();try{
  const {p,targetId}=await edgeFixture(h),responses=beginToolTurn(h),originalRecipe=JSON.stringify(p.workflow.recipe),originalResult=JSON.stringify(p.image.result);
  for(const section of ['tool','parameters','boundaries']){const request=await edgeArgs(h,targetId);delete request.justification[section];const response=await toolEvent(h,responses,'trial_edge_search',request,section);actionable(response,{path:section});assert.equal(JSON.stringify(p.workflow.recipe),originalRecipe);assert.equal(JSON.stringify(p.image.result),originalResult);const saved=p.data.chat.at(-1);assert.equal(saved.toolFailure.tool,'trial_edge_search');assert.equal(saved.toolFailure.code,response.code);assert.deepEqual(copy(saved.toolFailure.errors),copy(response.errors))}
  assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('pipeline proposals reject missing three-part commitments through the actual Pi host event contract before mutation',async()=>{
 const h=await createHarness();try{
  const p=await gearFixture(h),responses=beginToolTurn(h),input=gearInput(),oldPlan=p.workflow.pipelinePlan,oldResult=p.image.pipelineResult;delete input.justifications.features;
  const reply=await toolEvent(h,responses,'create_pipeline',input);actionable(reply,{code:'PIPELINE_EVIDENCE_PROPOSAL_REJECTED',nodeId:'features'});
  for(const section of ['tool','parameters','boundaries'])assert.ok(reply.errors.some(issue=>issue.path.includes(section)));
  assert.equal(p.workflow.pipelinePlan,oldPlan);assert.equal(p.image.pipelineResult,oldResult);assert.equal(reply.retryable,true);assert.ok(reply.next);
  assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('Agent create/run and delivery tools certify real gear pixels and all upstream nodes, then reject missing upstream evidence with preserved hints',async()=>{
 const h=await createHarness();try{
  const p=await gearFixture(h),agent=h.api.agent,created=await agent.execute('create_pipeline',gearInput());assert.equal(created.status,'TRIAL');
  const summary=await agent.execute('run_pipeline',{}),result=p.image.pipelineResult;assert.equal(result.measurements.visibleTeeth,14);assert.equal(summary.runId,result.runId);assert.equal(result.classification.status,'PASS');
  const single=await agent.execute('verify_pipeline_delivery',{node_id:'features'});assert.equal(single.delivered,true);assert.equal(single.scope,'NODE_AND_UPSTREAM');assert.deepEqual([...single.auditedNodeIds].sort(),['components','features','grayscale','segment']);assert.equal(single.binding.runId,result.runId);
  const all=await agent.execute('verify_pipeline_delivery',{});assert.equal(all.delivered,true);assert.equal(all.nodes.length,5);
  const segment=result.nodes.find(n=>n.id==='segment');segment.artifacts=segment.artifacts.filter(a=>a.type!=='mask');
  const responses=beginToolTurn(h),rejected=await toolEvent(h,responses,'verify_pipeline_delivery',{node_id:'features'});actionable(rejected,{code:'PIPELINE_EVIDENCE_DELIVERY_REJECTED',nodeId:'segment'});assert.equal(rejected.retryable,true);assert.ok(rejected.next);assert.equal(p.data.chat.at(-1).toolFailure.code,rejected.code);assert.deepEqual(copy(p.data.chat.at(-1).toolFailure.errors),copy(rejected.errors));assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('a valid node/upstream certificate cannot silently turn missing downstream specifications into a delivered full pipeline',async()=>{
 const h=await createHarness();try{
  const p=await gearFixture(h),agent=h.api.agent;await agent.execute('create_pipeline',gearInput({withRules:false}));await agent.execute('run_pipeline',{});assert.equal(p.image.pipelineResult.measurements.visibleTeeth,14);assert.equal(p.image.pipelineResult.classification.status,'UNKNOWN');
  const single=await agent.execute('verify_pipeline_delivery',{node_id:'features'});assert.equal(single.delivered,true);assert.equal(single.classification.status,'UNKNOWN');assert.equal(single.pipelineDeliveryStatus,'DIAGNOSTIC_ONLY');
  const responses=beginToolTurn(h),reply=await toolEvent(h,responses,'verify_pipeline_delivery',{});actionable(reply,{code:'PIPELINE_EVIDENCE_DELIVERY_REJECTED'});assert.ok(reply.errors.some(issue=>issue.nodeId==='rules'||issue.nodeId==='$pipeline'));assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
