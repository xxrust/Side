// Deterministic adversarial fixtures for line-candidate acceptance, not an accuracy benchmark.
// Run: node qa/check-line-quality.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../assets/vision-core.js'),'utf8'));
const C=globalThis.AgentCVCore;
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const W=480,H=160;
const make=fn=>{const gray=new Float32Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++)gray[y*W+x]=fn(x,y);return {width:W,height:H,gray};};
const tool={type:'find_line',kind:'tool',x:20,y:15,width:440,height:120,params:{threshold:18,polarity:'any'}};
const centers=result=>(result.candidates||[]).map(c=>(c.geometry.from.y+c.geometry.to.y)/2);
const hasEdge=(r,y)=>centers(r).some(v=>Math.abs(v-y)<1.25);
check('multiple genuine edges survive, including a much weaker edge',()=>{
  const image=make((x,y)=>y<40?20:y<70?200:y<100?160:135),r=C.detect(image,tool);
  assert.equal(r.status,'AWAITING_SELECTION');assert.equal(r.candidates.length,3);
  for(const y of [39,69,99])assert.ok(hasEdge(r,y),`Missing actual edge y=${y}`);
  assert.deepEqual(r.selected_ids,[]);assert.deepEqual(r.rejected_ids,[]);
  for(const c of r.candidates){assert.equal(c.quality.continuity,1);assert.equal(c.quality.largest_gap_ratio,0);assert.ok(c.quality.local_coverage.every(v=>v===1));assert.ok(c.geometry.rms_px<.01);}
});
check('dotted fragments are not promoted to a continuous measurement line',()=>{
  const image=make((x,y)=>x%80<60&&y>=60?200:20);
  assert.equal(C.detect(image,{...tool,params:{...tool.params,polarity:'rising'}}).status,'UNKNOWN');
});
check('alternating parallel fragments cannot be stitched by a low global RMS',()=>{
  const image=make((x,y)=>y>=(Math.floor(x/44)%2?62:60)?180:20);
  assert.equal(C.detect(image,{...tool,params:{...tool.params,polarity:'rising'}}).status,'UNKNOWN');
});
check('opposite edge polarities cannot be fused into one candidate',()=>{
  const image=make((x,y)=>{const rising=Math.floor(x/44)%2===0;return (y>=60)===rising?180:20;});
  assert.equal(C.detect(image,tool).status,'UNKNOWN');
});
check('curved boundaries are rejected as straight measurements',()=>{
  const image=make((x,y)=>y>=50+20*((x-240)/220)**2?180:20);
  assert.equal(C.detect(image,tool).status,'UNKNOWN');
});
check('rasterized oblique true edge remains valid',()=>{
  const image=make((x,y)=>y>=45+.12*x?180:20),r=C.detect(image,tool);
  assert.equal(r.status,'AWAITING_SELECTION');assert.equal(r.candidates.length,1);
  assert.ok(Math.abs(r.candidates[0].geometry.angle_deg-Math.atan(.12)*180/Math.PI)<.15);
  assert.ok(r.candidates[0].geometry.rms_px<.4);
});
check('measurement supports remain inside the ROI and never borrow a nearby outside edge',()=>{
  const image=make((x,y)=>y<51?20:180);
  assert.equal(C.detect(image,{...tool,y:52,height:30}).status,'UNKNOWN');
  const r=C.detect(image,{...tool,y:40,height:30});assert.equal(r.status,'AWAITING_SELECTION');
  for(const p of r.candidates[0].points)assert.ok(p.x>=tool.x&&p.x<=tool.x+tool.width&&p.y>=40&&p.y<=70);
  assert.equal(C.detect(image,{...tool,x:-1}).status,'UNKNOWN');
});
check('background is excluded only by an explicit user region, never silently selected',()=>{
  const image=make((x,y)=>y<40?20:y<70?200:150),before=C.detect(image,tool);
  assert.equal(before.candidates.length,2);assert.deepEqual(before.selected_ids,[]);
  const r=C.detect(image,{...tool,exclude_rois:[{type:'rect',x:0,y:35,width:480,height:10}]});
  assert.equal(r.candidates.length,1);assert.ok(hasEdge(r,69));assert.ok(!hasEdge(r,39));assert.equal(r.candidates[0].quality.exclusion_count,1);
});
check('polygon masks also constrain every accepted gradient stencil',()=>{
  const image=make((x,y)=>y<40?20:y<70?200:150);
  const r=C.detect(image,{...tool,exclude_rois:[{type:'polygon',points:[{x:0,y:35},{x:480,y:35},{x:480,y:45},{x:0,y:45}]}]});
  assert.equal(r.candidates.length,1);assert.ok(hasEdge(r,69));
  assert.equal(C.detect(image,{...tool,exclude_rois:[{type:'rect',x:0}]}).status,'UNKNOWN');
});
check('uniform random noise yields no measurement candidate',()=>{
  let seed=431;const image=make(()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed>>>24;});
  assert.equal(C.detect(image,tool).status,'UNKNOWN');
});
check('small additive pixel noise preserves a genuine weak edge',()=>{
  let seed=43;const image=make((x,y)=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return (y<65?100:130)+((seed>>>24)/255-.5)*4;});
  const r=C.detect(image,tool);assert.equal(r.status,'AWAITING_SELECTION');assert.equal(r.candidates.length,1);assert.ok(hasEdge(r,64.5));
});
check('malformed pixels and numeric parameters fail explicitly',()=>{
  const image=make((x,y)=>y<60?20:180);
  for(const params of [{minCoverage:NaN},{minCoverage:2},{maxRms:-1},{threshold:NaN},{minContinuity:-1},{maxGapRatio:.8},{orientation:'diagonal'}])assert.equal(C.detect(image,{...tool,params:{...tool.params,...params}}).status,'UNKNOWN');
  assert.equal(C.detect({...image,gray:new Float32Array(3)},tool).status,'UNKNOWN');
});
check('line choice remains run-scoped and typed even after multiple detections',()=>{
  const image=make((x,y)=>y<40?20:y<70?200:150),r={...C.detect(image,tool),run_id:'test:r1'};
  const choice=C.choose(r,r.candidates.map(c=>c.id),'test:r1');assert.equal(choice.output.type,'GeometrySet');assert.equal(choice.output.items.length,2);
  assert.throws(()=>C.choose(choice,[r.candidates[0].id],'test:r2'));
  assert.throws(()=>C.choose({...choice,status:'STALE'},[r.candidates[0].id],'test:r1'));
  assert.deepEqual(C.detect(image,tool).selected_ids,[]);
});
check('single missing scan does not destroy otherwise continuous evidence',()=>{
  const image=make((x,y)=>Math.abs(x-242)<1?20:y>=60?180:20);
  const r=C.detect(image,{...tool,params:{...tool.params,polarity:'rising'}});
  assert.equal(r.status,'AWAITING_SELECTION');assert.equal(r.candidates.length,1);assert.ok(hasEdge(r,59));
});
check('isolated noisy scan is removed only with stable support on both sides',()=>{
  let seed=912;const image=make((x,y)=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;const spike=Math.abs(x-142)<=1||Math.abs(x-302)<=1;return (y>=(spike?58:60)?180:20)+((seed>>>24)/255-.5)*2;});
  const r=C.detect(image,{...tool,params:{...tool.params,polarity:'rising'}});
  assert.equal(r.status,'AWAITING_SELECTION');assert.equal(r.candidates.length,1);
  const c=r.candidates[0];assert.ok(hasEdge(r,59));assert.ok(c.geometry.rms_px<.55);
  assert.ok(c.coverage<1&&c.coverage>.95);assert.equal(c.inlier_count,c.sample_count-2);
  assert.ok(!c.points.some(p=>p.x===142||p.x===302));assert.deepEqual(r.selected_ids,[]);
});
check('a sustained parallel-edge step is not treated as isolated noise',()=>{
  const image=make((x,y)=>y>=(x<240?60:62)?180:20);
  assert.equal(C.detect(image,{...tool,params:{...tool.params,polarity:'rising'}}).status,'UNKNOWN');
});
check('two consecutive displaced supports cannot use the isolated-scan exception',()=>{
  const image=make((x,y)=>y>=(x>=141&&x<=147?58:60)?180:20);
  assert.equal(C.detect(image,{...tool,params:{...tool.params,polarity:'rising'}}).status,'UNKNOWN');
});
check('frequent spikes exceed the unchanged inlier budget instead of being hidden',()=>{
  const image=make((x,y)=>y>=((x-1)%20<3?58:60)?180:20);
  assert.equal(C.detect(image,{...tool,params:{...tool.params,polarity:'rising'}}).status,'UNKNOWN');
});
check('one sparse two-scan dropout keeps real coverage and bounded continuity evidence',()=>{
  const missing=new Set([242,246]),image=make((x,y)=>missing.has(x)?20:y>=60?180:20);
  const r=C.detect(image,{...tool,params:{...tool.params,polarity:'rising'}});
  assert.equal(r.status,'AWAITING_SELECTION');assert.equal(r.candidates.length,1);const c=r.candidates[0];
  assert.ok(c.quality.raw_continuity<.55);assert.ok(c.quality.continuity>.95);
  assert.equal(c.inlier_count,c.sample_count-2);assert.equal(c.quality.bridged_short_gaps.length,1);
  assert.equal(c.quality.largest_gap_ratio,2/c.sample_count);assert.ok(c.coverage<1);
});
check('three consecutive missing scans are not bridged',()=>{
  const missing=new Set([238,242,246]),image=make((x,y)=>missing.has(x)?20:y>=60?180:20);
  assert.equal(C.detect(image,{...tool,params:{...tool.params,polarity:'rising'}}).status,'UNKNOWN');
});
check('regular two-scan gaps below eight percent missing still fail the sparsity count',()=>{
  const missing=new Set([102,106,202,206,302,306,402,406]),image=make((x,y)=>missing.has(x)?20:y>=60?180:20);
  assert.ok(missing.size/109<.08);
  assert.equal(C.detect(image,{...tool,params:{...tool.params,polarity:'rising'}}).status,'UNKNOWN');
});
check('a two-scan gap without eight real supports on both sides is not bridged',()=>{
  const missing=new Set([230,242,246]),image=make((x,y)=>missing.has(x)?20:y>=60?180:20);
  assert.equal(C.detect(image,{...tool,params:{...tool.params,polarity:'rising'}}).status,'UNKNOWN');
});
check('explicit tangential averaging recovers a noisy edge without weaker quality limits',()=>{
  let seed=41;const image=make((x,y)=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return (y<65?100:140)+((seed>>>24)/255-.5)*40;});
  assert.equal(C.detect(image,tool).status,'UNKNOWN');
  const r=C.detect(image,{...tool,params:{...tool.params,profileWidth:7}});assert.equal(r.status,'AWAITING_SELECTION');assert.equal(r.candidates.length,1);
  const c=r.candidates[0];assert.equal(c.quality.profile_width,7);assert.ok(hasEdge(r,64.5));assert.ok(c.geometry.rms_px<.6);assert.ok(c.coverage>.9);assert.deepEqual(r.selected_ids,[]);
  const gray=new Float32Array(W*H);for(let y=0;y<W;y++)for(let x=0;x<H;x++)gray[y*H+x]=image.gray[x*W+y];
  const v=C.detect({width:H,height:W,gray},{...tool,x:15,y:20,width:120,height:440,params:{...tool.params,profileWidth:7}});
  assert.equal(v.status,'AWAITING_SELECTION');assert.equal(v.candidates.length,1);assert.ok(Math.abs((v.candidates[0].geometry.from.x+v.candidates[0].geometry.to.x)/2-64.5)<1);
});
check('caliper averaging still rejects fragments, alternating edges and sustained jumps',()=>{
  const cases=[(x,y)=>x%80<60&&y>=60?200:20,(x,y)=>y>=(Math.floor(x/44)%2?62:60)?180:20,(x,y)=>(y>=60)===(Math.floor(x/44)%2===0)?180:20,(x,y)=>y>=(x<240?60:62)?180:20];
  for(const fn of cases)assert.equal(C.detect(make(fn),{...tool,params:{...tool.params,profileWidth:15}}).status,'UNKNOWN');
});
check('the full caliper and Sobel footprint stays inside ROI and explicit exclusions',()=>{
  const image=make((x,y)=>y<60?20:180),t={...tool,params:{...tool.params,profileWidth:15}},r=C.detect(image,t);
  assert.equal(r.status,'AWAITING_SELECTION');for(const p of r.candidates[0].points)assert.ok(p.x-tool.x>=8&&tool.x+tool.width-p.x>=8);
  const fractional=C.detect(image,{...t,x:20.3,width:440});assert.equal(fractional.status,'AWAITING_SELECTION');for(const p of fractional.candidates[0].points)assert.ok(Math.round(p.x-8)>=20.3&&Math.round(p.x+8)<=460.3);
  const masked=C.detect(image,{...t,exclude_rois:[{x:41,y:55,width:0,height:10}]});assert.equal(masked.status,'AWAITING_SELECTION');
  for(const c of masked.candidates)for(const p of c.points)assert.ok(Math.abs(p.x-41)>8,'a support must not borrow a masked neighbor through averaging or Sobel');
  assert.equal(C.detect(make((x,y)=>y<51?20:180),{...t,y:52,height:30}).status,'UNKNOWN');
});
check('caliper width is explicit, odd and bounded',()=>{
  const image=make((x,y)=>y<60?20:180);for(const profileWidth of [0,2,4,16,17,NaN])assert.equal(C.detect(image,{...tool,params:{...tool.params,profileWidth}}).status,'UNKNOWN');
  const r=C.detect(image,tool);assert.equal(r.candidates[0].quality.profile_width,1);
});
check('circle exclusions and run identity follow the same safety contract',()=>{
  const image=make((x,y)=>Math.hypot(x-240,y-80)<35?20:180);
  const circle={type:'find_circle',center:{x:240,y:80},radius:46,params:{threshold:18,polarity:'rising'}};
  const r=C.detect(image,circle);assert.equal(r.status,'AWAITING_SELECTION');
  assert.equal(C.detect(image,{...circle,exclude_rois:[{x:0,y:0,width:W,height:H}]}).status,'UNKNOWN');
  assert.throws(()=>C.choose(r,[r.candidates[0].id],undefined));
});
check('translation accepts arbitrary imported image bounds',()=>{
  const a={type:'rect',kind:'drawing',x:1200,y:700,width:100,height:50},r=C.translate(a,500,500,1920,1080);
  assert.equal(r.x,1700);assert.equal(r.y,1030);
  const clamped=C.translate(a,5000,-5000,1920,1080);assert.equal(clamped.x,1820);assert.equal(clamped.y,0);
});
console.log(`\n${checks} line quality / contract checks passed. Synthetic fixtures do not establish production accuracy.`);
