import test from 'node:test';
import assert from 'node:assert/strict';
import {runInquiryGeometry,INQUIRY_GEOMETRY_PARAMETERS} from '../src/inquiry-geometry.js';
const image=(width,height,fn)=>({width,height,gray:Float32Array.from({length:width*height},(_,i)=>fn(i%width,Math.floor(i/width)))});
const roi=im=>({x:0,y:0,width:im.width,height:im.height});
const run=(im,kind,parameters={},region=roi(im))=>runInquiryGeometry(im,{kind,roi:region,parameters});
const angleDistance=(a,b)=>{const d=Math.abs(a-b)%180;return Math.min(d,180-d)};
const near=(a,b,tolerance=.9)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} ≉ ${b}`);
function qualified(result,kind){assert.equal(result.status,'READY');assert.ok(result.candidates.length>0);for(const c of result.candidates){assert.equal(c.status,'ACCEPTED');assert.equal(c.accepted,true);assert.equal(c.geometry.type,kind);assert.ok(c.gates.length>=5&&c.gates.every(g=>g.status==='PASS'));assert.ok(c.points.length>=8&&c.points.length<=2000);assert.ok(c.residuals.length&&c.residuals.length<=2000);assert.ok(c.points.every(p=>p.x>=result.evidence.roi.x&&p.y>=result.evidence.roi.y&&p.x<result.evidence.roi.x+result.evidence.roi.width&&p.y<result.evidence.roi.y+result.evidence.roi.height));assert.ok(Number.isFinite(c.quality.rmsPx))}assert.doesNotThrow(()=>JSON.parse(JSON.stringify(result)))}
test('multiple real parallel lines yield separate candidates, real support/residual evidence and honest parameter origins',()=>{
 const im=image(220,160,(x,y)=>y>=35&&y<65||y>=100&&y<130?255:0),before=im.gray.slice(),result=run(im,'line');qualified(result,'line');assert.ok(result.candidates.length>=4);for(const expected of [35,65,100,130])assert.ok(result.candidates.some(c=>Math.abs((c.geometry.from.y+c.geometry.to.y)/2-expected)<1.2));assert.deepEqual(im.gray,before);assert.equal(result.evidence.inputRepresentation,'binary-intensity');assert.equal(result.evidence.parameterSelection.alternativesCompared,false);assert.equal(result.parameterOrigins.threshold.origin,'engineering_default');assert.equal(result.evidence.edgePointCount,result.evidence.edgePoints.length);assert.ok(result.candidates[0].coverageBins.some(b=>b.present));
 const manual=run(im,'line',{threshold:45});assert.equal(manual.parameters.threshold,45);assert.equal(manual.parameterOrigins.threshold.origin,'human_input');
});
test('line fits are orientation independent and return original asset coordinates for an offset ROI',()=>{
 for(const degrees of [0,28,57,90,-35]){const rad=degrees*Math.PI/180,im=image(190,170,(x,y)=>-(x-95)*Math.sin(rad)+(y-85)*Math.cos(rad)>=0?230:15),result=run(im,'line',{}, {x:15,y:12,width:160,height:145});qualified(result,'line');assert.ok(result.candidates.some(c=>angleDistance(c.geometry.angle_deg,degrees)<1.2),`angle ${degrees}: ${JSON.stringify(result.candidates.map(c=>c.geometry.angle_deg))}`);assert.ok(result.candidates.every(c=>c.points.every(p=>p.x>=15&&p.y>=12)))}
});
test('two independent circular boundaries are fitted from actual contour support without a supplied answer center',()=>{
 const im=image(250,160,(x,y)=>Math.hypot(x-63,y-77)<=29||Math.hypot(x-183,y-82)<=23?255:0),result=run(im,'circle');qualified(result,'circle');assert.equal(result.candidates.length,2);for(const [x,y,r]of [[63,77,29],[183,82,23]]){const c=result.candidates.find(c=>Math.hypot(c.geometry.center.x-x,c.geometry.center.y-y)<1);assert.ok(c,`circle ${x},${y} absent`);near(c.geometry.radius,r,1);assert.ok(c.quality.angularCoverageDeg>340);assert.ok(c.quality.occupiedArcRatio>.9);assert.equal(c.angularCoverage.length,72);assert.ok(c.residuals.every(point=>Number.isFinite(point.residual)))}assert.equal(result.parameterOrigins.maxRadiusPx.origin,'computed_from_roi');assert.equal(result.parameters.maxRadiusPx,80);
});
test('concentric ring boundaries remain separate candidates, and requested radius limits do not silently select an answer',()=>{
 const im=image(150,150,(x,y)=>{const r=Math.hypot(x-75,y-75);return r>=24&&r<=45?245:10}),result=run(im,'circle');qualified(result,'circle');assert.equal(result.candidates.length,2);assert.ok(result.candidates.some(c=>Math.abs(c.geometry.radius-24)<1));assert.ok(result.candidates.some(c=>Math.abs(c.geometry.radius-45)<1));const narrow=run(im,'circle',{minRadiusPx:35,maxRadiusPx:50});assert.equal(narrow.candidates.length,1);near(narrow.candidates[0].geometry.radius,45,1);assert.equal(narrow.parameterOrigins.minRadiusPx.origin,'human_input');
});
test('noncircular ellipses and insufficient arcs return EMPTY with real failed quality gates',()=>{
 const ellipse=image(150,150,(x,y)=>(x-75)**2/45**2+(y-75)**2/24**2<=1?255:0),bad=run(ellipse,'circle');assert.equal(bad.status,'EMPTY');assert.equal(bad.candidates.length,0);assert.ok(bad.evidence.rejectedCandidates.length);assert.ok(bad.evidence.rejectedCandidates.some(c=>c.gates.some(g=>g.status==='FAIL')));assert.ok(bad.evidence.rejectedPoints.length);
 const arc=image(160,160,(x,y)=>Math.hypot(x-80,y-80)<=45&&y<78?255:0),partial=run(arc,'circle');assert.equal(partial.status,'EMPTY');assert.ok(partial.evidence.rejectedCandidates.some(c=>c.gates.some(g=>['angular_coverage_deg','occupied_arc_ratio'].includes(g.id)&&g.status==='FAIL')));
});
test('disconnected fragments and noise do not become a fabricated continuous line or complete circle',()=>{
 const fragments=image(180,110,(x,y)=>y>=50&&y<56&&[20,70,120].some(start=>x>=start&&x<start+18)?255:0),line=run(fragments,'line');assert.equal(line.status,'EMPTY');assert.ok(line.evidence.rejectedCandidates.some(c=>c.gates.some(g=>['span_px','coverage','continuity','max_gap_ratio'].includes(g.id)&&g.status==='FAIL')));
 let seed=1234;const noise=image(85,85,()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24});for(const kind of ['line','circle']){const noisy=run(noise,kind);assert.equal(noisy.status,'EMPTY',`${kind} accepted random texture`);assert.ok(noisy.evidence.edgePointCount>100)}
});
test('uniform regions produce an explicit empty result and validation/work limits reject before unbounded work',()=>{
 for(const value of [0,80,255])for(const kind of ['line','circle']){const result=run(image(80,64,()=>value),kind);assert.equal(result.status,'EMPTY');assert.equal(result.evidence.edgePointCount,0);assert.equal(result.evidence.emptyReason,'ROI 沒有超過門檻的非極大值邊緣')}
 const im=image(80,80,()=>0);assert.throws(()=>run(im,'line',{}, {x:-1,y:0,width:40,height:40}),/ROI/);assert.throws(()=>run(im,'circle',{minRadiusPx:40,maxRadiusPx:20}),/最小半徑/);assert.throws(()=>run(im,'line',{threshold:NaN}),/超出/);assert.throws(()=>run(im,'circle',{madeUp:1}),/不支援/);im.gray[50*80+50]=NaN;assert.throws(()=>run(im,'line'),/有限數/);assert.throws(()=>run(image(600,600,()=>0),'line'),/超過.*不會默默降採樣/);assert.ok(INQUIRY_GEOMETRY_PARAMETERS.line.every(p=>typeof p.label==='string'));
});

test('moderate intensity noise retains real two-circle solutions and clipped circles remain unqualified',()=>{
 let seed=999;const im=image(240,150,(x,y)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=(seed>>>24)/255*20-10;return clamp((Math.hypot(x-62,y-75)<=27||Math.hypot(x-177,y-75)<=22?230:20)+noise,0,255)}),result=run(im,'circle');qualified(result,'circle');assert.ok(result.candidates.some(c=>Math.hypot(c.geometry.center.x-62,c.geometry.center.y-75)<1));assert.ok(result.candidates.some(c=>Math.hypot(c.geometry.center.x-177,c.geometry.center.y-75)<1));
 const clipped=image(100,100,(x,y)=>Math.hypot(x-8,y-50)<=35?255:0),bad=run(clipped,'circle');assert.equal(bad.status,'EMPTY');
});
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
test('dense long-line display sampling preserves full support counts, rejected-point truth and finite bounded JSON',()=>{
 const im=image(4200,20,(x,y)=>y>=10?255:0),result=run(im,'line');qualified(result,'line');assert.equal(result.candidates.length,1);assert.ok(result.candidates[0].quality.supportCount>2000);assert.equal(result.candidates[0].quality.supportPointsShown,result.candidates[0].points.length);assert.equal(result.evidence.rejectedPointCount,0);assert.ok(result.candidates[0].coverageBins.length<=2000);assert.ok(JSON.stringify(result).length<2*1024*1024);
 const visit=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value));else if(value&&typeof value==='object')for(const child of Object.values(value))visit(child)};visit(result);visit(run(image(120,120,(x,y)=>((x-60)/35)**2+((y-60)/20)**2<1?255:0),'circle'));
});
