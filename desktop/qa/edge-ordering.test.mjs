// Production caliper/fit/measurement code runs on independently generated pixels.
// No mocked candidate sets, model responses, GUI state or nominal result injection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {measureTarget} from '../src/inspection.js';
import {Workspace} from '../src/workspace.js';
import {EDGE_SIDES,EDGE_INTENTS,EDGE_SELECTIONS,EDGE_SCAN_DIRECTIONS,validateEdgeIntents,resolveEdgeScan} from '../src/edge-intent-policy.js';

const outer={x:80,y:60,width:260,height:180},inner={x:88,y:68,width:244,height:164};
const polygon=b=>[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}];
function pixels({inverted=false,brokenOuter=false}={}){
 const width=420,height=300,gray=new Float32Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let value=30;
  if(x>=outer.x&&x<outer.x+outer.width&&y>=outer.y&&y<outer.y+outer.height)value=180;
  if(x>=inner.x&&x<inner.x+inner.width&&y>=inner.y&&y<inner.y+inner.height)value=220;
  if(brokenOuter&&x<inner.x&&y>=105&&y<195)value=30;
  gray[y*width+x]=inverted?255-value:value;
 }
 return {width,height,gray,sha256:'generated-independent-nested-boundaries'};
}
function policies(extra={}){return Object.fromEntries(EDGE_SIDES.map(side=>[side,{intent:'scan',selection:'first',scanDirection:'outside-in',contrastPolarity:'any',source:'agent',stage:'TRIAL',reason:'沿工程師明確方向採用第一條品質合格邊；保留其他線的排序與未採用原因。',...extra}]))}
function run(policy={},options={}){return measureTarget(pixels(options),{status:'LOCATED',bounds:inner},{threshold:18,maxAngle:15,searchBand:28,edgeIntents:policies(policy)})}
function edgePosition(result,side){const g=result.edges[side].selected.geometry;return ['top','bottom'].includes(side)?(g.from.y+g.to.y)/2:(g.from.x+g.to.x)/2}
function assertMeasured(result,box){assert.equal(result.status,'MEASURED',JSON.stringify(Object.fromEntries(Object.entries(result.edges).map(([s,e])=>[s,{status:e.status,reason:e.reason,assessment:e.parameter_assessment}]))));assert.ok(Math.abs(result.width-box.width)<1,`width ${result.width} vs ${box.width}`);assert.ok(Math.abs(result.height-box.height)<1,`height ${result.height} vs ${box.height}`)}

test('directional first/last choose the requested real nested boundary instead of blocking on multiple valid candidates',()=>{
 const first=run(),last=run({selection:'last'}),reverse=run({scanDirection:'inside-out'});
 assertMeasured(first,outer);assertMeasured(last,inner);assertMeasured(reverse,inner);
 for(const side of EDGE_SIDES){
  const edge=first.edges[side],policy=edge.selection_policy;
  assert.equal(edge.status,'FOUND');assert.equal(policy.intent,'scan');assert.equal(policy.selection,'first');assert.equal(policy.scan.direction,'outside-in');assert.equal(policy.selectedScanRank,1);
  assert.equal(policy.scan.axis,['top','bottom'].includes(side)?'y':'x');
  assert.ok(policy.scanOrder.length>=2,'both genuine fitted boundaries remain inspectable');
  assert.equal(policy.scanOrder.filter(c=>c.selected).length,1);assert.ok(edge.candidates.length>=2);
  assert.ok(edge.rejected.some(r=>r.reason==='NOT_SELECTED_BY_EXPLICIT_RULE'));
  assert.equal(edge.parameter_assessment.status,'CONSISTENT');assert.equal(edge.attempts.length,8);
  assert.ok(edge.attempts.every(t=>!t.ambiguous));
  assert.ok(edge.parameter_assessment.comparisons.every(row=>row.selection==='first'&&row.scanDirection==='outside-in'&&row.selectedScanRank===1));
  assert.equal(last.edges[side].selection_policy.selectedScanRank,last.edges[side].selection_policy.scanOrder.length);
 }
});

test('positive and negative directions reverse the first/last real X/Y candidate order; polarity stays tied to image coordinates',()=>{
 const positive=run({scanDirection:'positive'}),negative=run({scanDirection:'negative'}),positiveLast=run({scanDirection:'positive',selection:'last'});
 for(const side of EDGE_SIDES){assert.ok(Math.abs(edgePosition(negative,side)-edgePosition(positiveLast,side))<1e-9);assert.ok(edgePosition(positive,side)<edgePosition(negative,side));const p=positive.edges[side].selection_policy,n=negative.edges[side].selection_policy;assert.equal(p.scan.sign,1);assert.equal(n.scan.sign,-1);assert.ok(p.scan.from<p.scan.to);assert.ok(n.scan.from>n.scan.to);assert.equal(p.polarity.resolved,'any');assert.equal(n.polarity.resolved,'any')}
 assertMeasured(run({contrastPolarity:'auto'}),outer);assertMeasured(run({contrastPolarity:'auto'},{inverted:true}),outer);
});

test('explicit candidate index, nearest and strongest remain distinct operations with actual quality-passing output',()=>{
 assertMeasured(run({selection:'index',candidateIndex:2}),inner);
 assertMeasured(run({selection:'nearest'}),inner);
 assertMeasured(run({selection:'strongest'}),outer);
 const missing=run({selection:'index',candidateIndex:99});assert.equal(missing.status,'UNKNOWN');assert.equal(missing.width,undefined);
 for(const edge of Object.values(missing.edges)){assert.equal(edge.status,'UNKNOWN');assert.equal(edge.selection_policy.selectionStatus,'INDEX_OUT_OF_RANGE');assert.equal(edge.selection_policy.selectedScanRank,null);assert.ok(edge.attempts.every(a=>a.intent_selection.scanOrder.length<99));assert.ok(edge.attempts.some(a=>a.intent_selection.rejected.some(r=>r.reason==='CANDIDATE_INDEX_OUT_OF_RANGE')))}
});

test('the first edge must pass original coverage/continuity/RMS gates; a broken outer line does not become a valid first edge',()=>{
 const result=run({}, {brokenOuter:true}),left=result.edges.left;
 assert.equal(left.status,'FOUND');assert.ok(Math.abs(edgePosition(result,'left')-inner.x)<=1.1,JSON.stringify({position:edgePosition(result,'left'),geometry:left.selected.geometry,quality:left.selected.quality,scan:left.selection_policy.scanOrder}));
 for(const edge of Object.values(result.edges))if(edge.selected){assert.ok(edge.selected.coverage>=.65);assert.ok(edge.selected.geometry.rms_px<=1.5);assert.ok(edge.selected.quality.continuity>=.55);assert.ok(edge.selected.quality.largest_gap_ratio<=.15);assert.ok(edge.selected.quality.local_coverage.every(c=>c>=.35))}
});

test('new scan policy validates explicitly and survives project save/reopen; old intents keep their behavior',async()=>{
 assert.ok(EDGE_INTENTS.includes('scan'));assert.deepEqual(EDGE_SELECTIONS,['first','last','nearest','strongest','index']);assert.deepEqual(EDGE_SCAN_DIRECTIONS,['positive','negative','inside-out','outside-in']);
 const w=new Workspace();await w.addImages([{name:'nested-camera.png',dataUrl:'qa-generated-real-raster'}],async()=>pixels());const id=w.workflow.workpiece.id;w.setRegion(id,polygon(inner));w.addCheck({name:'Width',kind:'width',targetId:id,unit:'px',min:250,max:270});
 const params={edges:{threshold:18,maxAngle:15,searchBand:28},edgeIntents:{[id]:policies()}};w.buildRecipe(params,{actor:'agent'});await w.runImage();assertMeasured(w.image.result.targets[id].measurement,outer);
 const saved=JSON.parse(w.serialize()),reopened=new Workspace();await reopened.load(saved,async()=>pixels());assert.deepEqual(reopened.workflow.recipe.params.edgeIntents,params.edgeIntents);
 const before=JSON.stringify(w.data);
 for(const patch of [{selection:'unknown'},{scanDirection:'clockwise'},{selection:'first',scanDirection:undefined},{selection:'index',candidateIndex:0},{selection:'index',candidateIndex:1.2},{selection:'first',candidateIndex:2},{selection:undefined}]){assert.throws(()=>w.buildRecipe({...params,edgeIntents:{[id]:policies(patch)}},{actor:'agent'}));assert.equal(JSON.stringify(w.data),before)}
 for(const intent of ['nearest','outer','inner']){const old=policies({intent,selection:undefined,scanDirection:undefined});assert.doesNotThrow(()=>validateEdgeIntents({[id]:old},[id]))}
 assert.equal(resolveEdgeScan({side:'left',expected:88,band:28,direction:'outside-in'}).sign,1);assert.equal(resolveEdgeScan({side:'right',expected:332,band:28,direction:'outside-in'}).sign,-1);
});
