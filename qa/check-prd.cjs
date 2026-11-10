// Run: node qa/check-prd.cjs
// Checks document wiring and numeric/geometry behavior; does not replace browser UI QA.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root=path.join(__dirname,'..');
for(const filename of ['index.html','workbench.html']){
  const html=fs.readFileSync(path.join(root,filename),'utf8');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  for(const m of html.matchAll(/<script src="([^"]+)"/g))scripts.push(fs.readFileSync(path.join(root,m[1]),'utf8'));
  scripts.forEach(source=>new vm.Script(source));
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size,`${filename} unique IDs`);
  for(const m of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(m[1]),`Internal anchor ${m[1]}`);
  for(const m of scripts.join('\n').matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),`JS element ${m[1]}`);
}
vm.runInThisContext(fs.readFileSync(path.join(root,'assets/vision-core.js'),'utf8'));
const C=globalThis.AgentCVCore;
const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} vs ${expected}`);
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS ${name}`);}
check('line fit recovers a known oblique line',()=>{
  const points=Array.from({length:40},(_,i)=>({x:i*3,y:i*6+7}));
  const fit=C.fitLine(points);close(fit.angle_deg,Math.atan2(2,1)*180/Math.PI);close(fit.rms_px,0);
});
check('circle fit recovers known center/radius',()=>{
  const points=Array.from({length:96},(_,i)=>({x:280+50*Math.cos(i*Math.PI/48),y:222+50*Math.sin(i*Math.PI/48)}));
  const fit=C.fitCircle(points);close(fit.center.x,280);close(fit.center.y,222);close(fit.radius,50);close(fit.rms_px,0);
});
check('degenerate geometry fails explicitly',()=>{
  assert.equal(C.fitLine([{x:3,y:4},{x:3,y:4}]),null);
  assert.equal(C.fitCircle([{x:1,y:1},{x:2,y:2},{x:3,y:3}]),null);
});
const width=800,height=440,gray=new Float32Array(width*height).fill(20);
for(let y=125;y<320;y++)for(let x=150;x<650;x++)gray[y*width+x]=150;
for(let y=150;y<295;y++)for(let x=210;x<350;x++)if(Math.hypot(x-280,y-222)<50)gray[y*width+x]=20;
const image={width,height,gray},blank={width,height,gray:new Float32Array(width*height).fill(100)};
const line={id:'tool-line',number:2,kind:'tool',type:'find_line',x:190,y:106,width:420,height:39,params:{threshold:18,polarity:'rising'},note:'上邊基準',resultNote:'供 Agent 建立座標系'};
const circle={id:'tool-circle',number:3,kind:'tool',type:'find_circle',center:{x:280,y:222},radius:66,params:{threshold:18,polarity:'rising'}};
check('horizontal search finds the actual image edge',()=>{
  const r=C.detect(image,line);assert.equal(r.status,'AWAITING_SELECTION');close(r.candidates[0].geometry.angle_deg,0,.01);close(r.candidates[0].geometry.from.y,124,1);
});
check('vertical search finds the actual image edge',()=>{
  const r=C.detect(image,{...line,x:135,y:150,width:32,height:140});assert.equal(r.status,'AWAITING_SELECTION');close(Math.abs(r.candidates[0].geometry.angle_deg),90,.01);close(r.candidates[0].geometry.from.x,149,1);
});
check('radial search finds the actual circle pixels',()=>{
  const r=C.detect(image,circle);assert.equal(r.status,'AWAITING_SELECTION');close(r.candidates[0].geometry.center.x,280,1);close(r.candidates[0].geometry.center.y,222,1);close(r.candidates[0].geometry.radius,50,1.5);
});
check('blank images and overhigh thresholds return UNKNOWN',()=>{
  for(const tool of [line,circle]){assert.equal(C.detect(blank,tool).status,'UNKNOWN');assert.equal(C.detect(image,{...tool,params:{threshold:255,polarity:'any'}}).status,'UNKNOWN');}
});
check('reversed polarity does not reuse previous geometry',()=>{
  assert.equal(C.detect(image,{...line,params:{threshold:18,polarity:'falling'}}).status,'UNKNOWN');
});
check('movement preserves identity/notes but invalidates tool result',()=>{
  const original={...line,result:C.detect(image,line)};
  const moved=C.translate(original,0,-90);assert.equal(moved.id,original.id);assert.equal(moved.number,original.number);assert.equal(moved.note,original.note);assert.equal(moved.resultNote,original.resultNote);
  assert.equal(moved.result.status,'STALE');assert.equal(original.result.status,'AWAITING_SELECTION');assert.equal(C.detect(image,moved).status,'UNKNOWN');
});
check('all drawing types move without detaching metadata',()=>{
  const objects=[{type:'line',from:{x:10,y:20},to:{x:30,y:40}},{type:'circle',center:{x:60,y:60},radius:20},{type:'rect',x:10,y:20,width:30,height:40},{type:'pen',points:[{x:10,y:20},{x:30,y:40}]},{type:'note',at:{x:10,y:20}}];
  for(const o of objects){Object.assign(o,{kind:'drawing',id:'stable',number:9,note:'同一物件'});const before=C.bounds(o),moved=C.translate(o,5,7),after=C.bounds(moved);close(after.x,before.x+5);close(after.y,before.y+7);assert.equal(moved.id,'stable');assert.equal(moved.note,'同一物件');}
});
check('movement is clamped to the source image bounds',()=>{
  const moved=C.translate(circle,-1000,1000);const b=C.bounds(moved);close(b.x,0);close(b.y+b.h,440);
});
const key=(key,extra={})=>({key,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,isComposing:false,...extra});
check('text editing preserves native keys and clipboard behavior',()=>{
  for(const event of [key('Delete'),key('Backspace'),key('v'),key('ArrowLeft'),key('z',{metaKey:true}),key('v',{ctrlKey:true})])assert.equal(C.shortcut(event,true),null);
});
check('IME composition and Alt shortcuts never mutate canvas objects',()=>{
  assert.equal(C.shortcut(key('Enter',{isComposing:true})),null);
  assert.equal(C.shortcut(key('Enter',{keyCode:229})),null);
  assert.equal(C.shortcut(key('l',{altKey:true})),null);
});
check('Mac and Windows undo/redo/duplicate shortcuts agree',()=>{
  for(const mod of [{metaKey:true},{ctrlKey:true}]){
    assert.equal(C.shortcut(key('z',mod)).action,'undo');
    assert.equal(C.shortcut(key('Z',{...mod,shiftKey:true})).action,'redo');
    assert.equal(C.shortcut(key('d',mod)).action,'duplicate');
    assert.equal(C.shortcut(key('c',mod)).action,'copy');
    assert.equal(C.shortcut(key('v',mod)).action,'paste');
  }
  assert.equal(C.shortcut(key('y',{ctrlKey:true})).action,'redo');
});
check('context menu, inline edit and rename have keyboard entry points',()=>{
  assert.equal(C.shortcut(key('F10',{shiftKey:true})).action,'menu');
  assert.equal(C.shortcut(key('ContextMenu')).action,'menu');
  assert.equal(C.shortcut(key('Enter')).action,'edit');
  assert.equal(C.shortcut(key('F2')).action,'rename');
  assert.equal(C.shortcut(key('Escape')).action,'escape');
});
check('tool shortcuts do not steal browser commands',()=>{
  assert.equal(C.shortcut(key('l')).tool,'line');
  assert.equal(C.shortcut(key('o')).tool,'find_circle');
  assert.equal(C.shortcut(key('l',{metaKey:true})),null);
  assert.equal(C.shortcut(key('r',{ctrlKey:true})),null);
});
check('nudges support one-pixel and ten-pixel steps',()=>{
  assert.deepEqual(C.shortcut(key('ArrowLeft')),{action:'move',dx:-1,dy:0});
  assert.deepEqual(C.shortcut(key('ArrowDown',{shiftKey:true})),{action:'move',dx:0,dy:10});
});
check('multiple parallel edges survive without default selection',()=>{
  const gray=new Float32Array(width*height).fill(20);
  for(let y=120;y<440;y++)for(let x=0;x<width;x++)gray[y*width+x]=y<140?200:y<160?130:40;
  const result=C.detect({width,height,gray},{...line,y:110,height:70,params:{threshold:18,polarity:'any'}});
  assert.equal(result.status,'AWAITING_SELECTION');assert.ok(result.candidates.length>=3);
  for(const y of [119,139,159])assert.ok(result.candidates.some(c=>Math.abs(c.geometry.from.y-y)<1.5),`edge ${y}`);
  assert.deepEqual(result.selected_ids,[]);assert.equal(result.geometry,undefined);
  const capped=C.detect({width,height,gray},{...line,y:110,height:70,params:{threshold:18,polarity:'any',maxCandidates:2}});
  assert.equal(capped.candidates.length,2);assert.equal(capped.truncated,true);
});
check('selection is a set scoped to its run, not an ordinal',()=>{
  const r={...C.detect(image,line),run_id:'run-A'};
  r.candidates.push({...r.candidates[0],id:'c2'});
  const chosen=C.choose(r,['c1','c2'],'run-A');assert.equal(chosen.status,'SELECTED');assert.equal(chosen.selected_ids.length,2);assert.deepEqual(r.selected_ids,[]);
  assert.throws(()=>C.choose(chosen,['c1'],'run-B'));
  assert.throws(()=>C.choose({...chosen,status:'STALE'},['c1'],'run-A'));
  assert.throws(()=>C.choose(chosen,['missing'],'run-A'));
  assert.throws(()=>C.choose(chosen,['c1'],'run-A',['c1']));
  const cleared=C.choose(chosen,[],'run-A');assert.equal(cleared.status,'AWAITING_SELECTION');assert.deepEqual(cleared.rejected_ids,[]);
  const excluded=C.choose(r,['c1'],'run-A',['c2']);assert.deepEqual(excluded.rejected_ids,['c2']);
});
check('advanced coverage gate and angle gate affect acceptance',()=>{
  const gray=new Float32Array(width*height).fill(20);
  for(let x=190;x<610;x++)for(let y=Math.round(123+.12*(x-190));y<240;y++)gray[y*width+x]=180;
  const a={...line,y:105,height:90,params:{threshold:18,polarity:'rising',maxAngle:12}};
  assert.ok(C.detect({width,height,gray},a).candidates.length>=1);
  assert.equal(C.detect({width,height,gray},{...a,params:{...a.params,maxAngle:0}}).status,'UNKNOWN');
});
console.log(`\n${checks} behavior checks passed. All scripts parse; IDs and references are valid.`);
console.log('Browser visual/interaction QA: not covered by this script.');
