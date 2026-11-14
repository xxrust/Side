import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require('../../qa/node_modules/jsdom'),{createCanvas,Image}=require('../../qa/node_modules/@napi-rs/canvas'),{build}=require('esbuild');
const built=await build({stdin:{contents:"export {ImageRenderer} from './src/image-renderer.js';export {beginNativePreviewPrefetch} from './src/native-preview-prefetch.js';export {mountInputPane} from './src/focused-workspace.js';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'iife',globalName:'Renderer',platform:'browser',loader:{'.css':'empty'},logLevel:'silent'});
function setup(){
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;let calls=0,release;const gate=new Promise(resolve=>release=resolve);
 w.HTMLCanvasElement.prototype.getContext=function(){return createCanvas(1,1).getContext('2d');};
 w.HTMLImageElement.prototype.decode=async function(){calls++;await gate;const image=new Image();image.src=this.src;await image.decode();Object.defineProperties(this,{naturalWidth:{configurable:true,value:image.width},naturalHeight:{configurable:true,value:image.height},complete:{configurable:true,value:true}});};
 w.eval(built.outputFiles[0].text);const renderer=new w.Renderer.ImageRenderer();w.document.body.append(renderer.root);
 const canvas=createCanvas(2,2);canvas.getContext('2d').fillRect(0,0,2,2);
 return {dom,w,renderer,release,calls:()=>calls,source:{src:canvas.toDataURL(),width:2,height:2}};
}
test('superseding requests share actual decoded pixels without publishing before commit',async()=>{
 const h=setup();try{const a=h.renderer.prepareSource(h.source),b=h.renderer.prepareSource({...h.source,alt:'new binding'});assert.equal(h.calls(),1);assert.equal(h.renderer.source,null);h.release();const [first,second]=await Promise.all([a,b]);assert.equal(first.image,second.image);assert.equal(second.source.alt,'new binding');assert.equal(second.image.naturalWidth,2);assert.equal(h.renderer.source,null);h.renderer.commitSource(second);assert.equal(h.renderer.image,second.image);assert.equal(h.calls(),1);}finally{h.dom.window.close();}
});
test('different image identities never share a frame and failed decodes can be retried',async()=>{
 const h=setup();try{const pending=h.renderer.prepareSource(h.source),bad=h.renderer.prepareSource({...h.source,src:'data:image/png;base64,AAAA'});h.release();const first=await pending;await assert.rejects(bad);assert.equal(h.renderer.source,null);await assert.rejects(h.renderer.prepareSource({...h.source,src:'data:image/png;base64,AAAA'}));assert.equal(h.calls(),3);assert.equal(first.image.naturalWidth,2);}finally{h.dom.window.close();}
});
test('decoded dimensions survive callers that omit dimensions; explicit dimension changes invalidate preparation',async()=>{
 const h=setup();try{const a=h.renderer.prepareSource({src:h.source.src}),b=h.renderer.prepareSource(h.source);assert.equal(h.calls(),2);h.release();const [unsized,sized]=await Promise.all([a,b]);assert.equal(unsized.source.width,2);assert.equal(unsized.source.height,2);assert.notEqual(unsized.image,sized.image);}finally{h.dom.window.close();}
});
test('input pane preloads without publication and later binds the same pixels to the completed run',async()=>{
 const h=setup();try{let reads=0;const record={id:'one',name:'one.png',width:2,height:2,sha256:'verified'},project={epoch:1,data:{},image:record,imageRecord:id=>id==='one'?record:null,readImageAsset:async()=>{reads++;return h.source.src;}};
 const view={project,button:(text,fn)=>{const b=h.w.document.createElement('button');b.textContent=text;b.onclick=fn;return b;}},gallery=h.w.document.createElement('div');h.w.document.body.append(gallery);const pane=h.w.Renderer.mountInputPane(view,{},gallery);
 assert.equal(pane.prepareReady({imageId:'one'}),null);const preload=pane.prepare({imageId:'one'},{});assert.equal(pane.prepareReady({imageId:'one'}),null);h.release();const early=await preload;assert.equal(pane.renderer.source,null,'preparation must not publish speculative identity');
 const model={imageId:'one',schemeNodeId:'node',run:{runId:'new-run'},unitId:'new-unit',executionId:'new-execution'},completed=await pane.prepare(model,{});
 const synchronous=pane.prepareReady(model);assert.equal(synchronous.frame.image,early.frame.image);assert.equal(synchronous.ref.source.runId,'new-run');project.epoch++;assert.equal(pane.prepareReady(model),null);project.epoch--;assert.equal(completed.frame.image,early.frame.image);assert.equal(completed.ref.source.runId,'new-run');assert.equal(reads,1);assert.equal(h.calls(),1);
 pane.update(model,{prepared:completed});assert.equal(pane.card.dataset.unitId,'new-unit');assert.equal(pane.renderer.image,completed.frame.image);pane.destroy();
 }finally{h.dom.window.close();}
});

test('paired commits measure current viewports before either fit writes and preserve camera on same source',async()=>{
 const h=setup();try{
  const second=new h.w.Renderer.ImageRenderer();h.w.document.body.append(second.root);
  h.release();const frames=await Promise.all([h.renderer.prepareSource(h.source),second.prepareSource(h.source)]);
  const renderers=[h.renderer,second],events=[];
  for(const [i,r] of renderers.entries()){r.bounds=()=>{events.push('read'+i);return {width:300+i*100,height:200};};const paint=r.paint.bind(r);r.paint=()=>{events.push('paint'+i);paint();};r.commitSource(frames[i],{deferFit:true});}
  assert.equal(events.length,0);const bounds=renderers.map(r=>r.bounds());renderers.forEach((r,i)=>r.finishCommit(bounds[i]));
  assert.deepEqual(events.slice(0,2),['read0','read1']);assert.equal(events.filter(x=>x.startsWith('read')).length,2);
  assert.equal(h.renderer.view.scale,90);assert.equal(h.renderer.view.x,60);assert.equal(second.view.x,110);
  h.renderer.zoomBy(.5);const camera={...h.renderer.view};h.renderer.commitSource(frames[0],{deferFit:true});h.renderer.finishCommit({width:500,height:400});assert.deepEqual({...h.renderer.view},camera);
  h.renderer.commitSource({...frames[0],source:{...h.source,src:h.source.src+'#new'}},{deferFit:true});h.renderer.clear();assert.equal(h.renderer.pendingCommit,null);
 }finally{h.dom.window.close();}
});

test('observed commit sizes avoid synchronous layout and resized frames retain fitting or manual camera',async()=>{
 const h=setup();try{const r=h.renderer;h.release();const frame=await r.prepareSource(h.source);let size={width:300,height:200},reads=0;r.bounds=()=>{reads++;return {...size};};
 assert.equal(r.commitBounds().width,300,'first mount reads actual dimensions');r.resize={disconnect(){}};r.onResize();const count=reads;assert.equal(r.commitBounds().width,300);assert.equal(reads,count);
 r.commitSource(frame,{deferFit:true});r.finishCommit(r.commitBounds());assert.equal(reads,count);assert.equal(r.view.scale,90);
 size={width:500,height:400};r.onResize();assert.equal(r.view.scale,190);assert.equal(r.view.x,60);assert.equal(r.view.y,10);
 r.zoomBy(.5);const before={...r.view};size={width:600,height:500};r.onResize();assert.equal(r.view.scale,before.scale);assert.equal(r.view.x,before.x+50);assert.equal(r.view.y,before.y+50);
 size={width:0,height:0};r.onResize();const hidden=reads;r.commitBounds();assert.equal(reads,hidden+1,'hidden viewport cannot reuse an old nonzero measurement');
 }finally{h.dom.window.close();}
});


test('transferred native previews keep their original fetch attributes and decoded element',async()=>{
 const h=setup();let lease;
 try{
  const src='http://agentcv-memory.localhost/'+'a'.repeat(64);let corsWrites=0,decodes=0;
  const image=h.w.document.createElement('img');
  Object.defineProperty(image,'crossOrigin',{set(value){corsWrites++;assert.equal(value,'anonymous');}});
  image.decode=async()=>{decodes++;Object.defineProperties(image,{naturalWidth:{value:2},naturalHeight:{value:2},complete:{value:true}});};
  lease=h.w.Renderer.beginNativePreviewPrefetch({ImageClass:function(){return image;}});
  lease.stage([{src,width:2,height:2,nodeId:'node',artifactId:'overlay'}]);
  await Promise.resolve();lease.complete({runs:[{schemeNodeId:'node',artifacts:[{id:'overlay',dataUrl:src,width:2,height:2}]}]});
  const frame=await h.renderer.prepareSource({src,width:2,height:2});
  assert.equal(frame.image,image);assert.equal(corsWrites,1);assert.equal(decodes,1);
  assert.equal(h.renderer.source,null);h.renderer.commitSource(frame);lease.dispose();
  assert.equal(h.renderer.image.src,src);assert.equal(h.renderer.image.naturalWidth,2);
 }finally{lease?.dispose();h.dom.window.close();}
});


test('ready frame access cannot publish speculative or pending native pixels',async()=>{
 const h=setup();let lease;
 try{
  const src='http://agentcv-memory.localhost/'+'b'.repeat(64),source={src,width:2,height:2};
  let decoded;const image=h.w.document.createElement('img');
  image.decode=()=>new Promise(resolve=>{decoded=()=>{Object.defineProperties(image,{naturalWidth:{value:2},naturalHeight:{value:2},complete:{value:true}});resolve();};});
  lease=h.w.Renderer.beginNativePreviewPrefetch({ImageClass:function(){return image;}});
  lease.stage([{...source,nodeId:'node',artifactId:'overlay'}]);
  assert.equal(h.renderer.readySource(source),null);
  lease.complete({runs:[{schemeNodeId:'node',artifacts:[{id:'overlay',dataUrl:src,width:2,height:2}]}]});
  assert.equal(h.renderer.readySource(source),null,'final verification does not imply decode completion');
  decoded();await Promise.resolve();
  assert.equal(h.renderer.readySource({...source,width:3}),null);
  const ready=h.renderer.readySource(source);assert.equal(ready.image,image);assert.equal(h.renderer.source,null);
  assert.equal(h.renderer.readySource(source).image,image,'pending owner retains reusable ready frame');
  h.renderer.commitSource(ready);lease.dispose();assert.equal(image.src,src);
 }finally{lease?.dispose();h.dom.window.close();}
});

test('input display leases retain the visible original until replacement and release stale or destroyed preparations',async()=>{
 const h=setup();h.release();
 try{
  const disposed=[],records=Object.fromEntries(['a','b','c','d'].map(id=>[id,{id,name:id,width:2,height:2,sha256:id}]));let resolveC;
  const project={epoch:1,data:{},image:records.a,imageRecord:id=>records[id],readImageDisplay:async id=>{if(id==='c')await new Promise(resolve=>resolveC=resolve);return {src:h.source.src,dispose:()=>disposed.push(id)};}};
  const view={project,button:(text,fn)=>{const b=h.w.document.createElement('button');b.textContent=text;b.onclick=fn;return b;}},gallery=h.w.document.createElement('div');h.w.document.body.append(gallery);
  const pane=h.w.Renderer.mountInputPane(view,{},gallery),a=await pane.prepare({imageId:'a'},{});pane.update({imageId:'a'},{prepared:a});
  const b=await pane.prepare({imageId:'b'},{});assert.deepEqual(disposed,[],'visible A remains usable while B is prepared');
  pane.update({imageId:'b'},{prepared:b});assert.deepEqual(disposed,['a']);
  const stale=pane.prepare({imageId:'c'},{}),rejected=assert.rejects(stale,/過期/);const d=await pane.prepare({imageId:'d'},{});resolveC();await rejected;assert.deepEqual(disposed,['a','c']);
  pane.destroy();assert.deepEqual(disposed,['a','c','b','d']);assert.equal(d.frame.source.role,'input');
 }finally{h.dom.window.close();}
});

test('late load of a committed decoded frame does not refit or disturb paired publication',async()=>{
 const h=setup();try{
  h.release();const r=h.renderer,frame=await r.prepareSource(h.source);let reads=0,loads=0;
  r.bounds=()=>{reads++;return {width:300,height:200};};r.onLoad=()=>loads++;
  r.commitSource(frame,{deferFit:true});r.image.onload();
  assert.equal(reads,0,'load must not fit before both members finish their paired commit');
  r.finishCommit({width:300,height:200});const camera={...r.view};
  r.image.onload();assert.equal(reads,0);assert.deepEqual({...r.view},camera);assert.equal(loads,2);
  r.zoomBy(.5);const manual={...r.view},before=reads;r.image.onload();
  assert.equal(reads,before);assert.deepEqual({...r.view},manual);
  r.setSource({...h.source,src:h.source.src+'#replacement'});const ordinary=reads;r.image.onload();
  assert.equal(reads,ordinary+1,'ordinary source loading still fits when pixels arrive');
 }finally{h.dom.window.close();}
});

function previewSource(h){const c=createCanvas(1,1);c.getContext('2d').fillRect(0,0,1,1);return {...h.source,preview:{src:c.toDataURL(),width:1,height:1}};}
test('preview pixels retain original coordinates and upgrade without changing the camera',async()=>{
 const h=setup();try{
  h.release();const r=h.renderer,source=previewSource(h),frame=await r.prepareSource(source);
  assert.equal(frame.image.naturalWidth,1);assert.equal(frame.source.width,2);assert.equal(frame.preview,true);
  r.commitSource(frame,{deferFit:true});r.finishCommit({width:1,height:1});
  assert.equal(r.previewActive,true);assert.equal(h.calls(),1);
  r.bounds=()=>({width:1,height:1});r.actual();const camera={...r.view};
  assert.equal(await r.ensureOriginal(),true);assert.equal(h.calls(),2);assert.equal(r.image.naturalWidth,2);
  assert.equal(r.previewActive,false);assert.deepEqual({...r.view},camera);assert.equal(r.source.src,source.src);
 }finally{h.dom.window.close();}
});
test('preview RGB never reports downsampled values as original pixels',async()=>{
 const h=setup();try{
  h.release();const r=h.renderer,frame=await r.prepareSource(previewSource(h));r.commitSource(frame,{deferFit:true});
  r.view={scale:.25,x:0,y:0,fitted:false};r.bounds=()=>({width:10,height:10});r.localPoint=()=>({x:.1,y:.1});
  let sampled=0;r.sampleContext={clearRect(){sampled++;},drawImage(){},getImageData(){return {data:[1,2,3]};}};
  r.sampleRGB({});assert.equal(sampled,0);assert.match(r.rgb.textContent,/載入原圖/);
  await r.ensureOriginal();r.sampleRGB({});assert.equal(sampled,1);assert.equal(r.rgb.textContent,'RGB 1, 2, 3');
 }finally{h.dom.window.close();}
});
test('original upgrade cannot overwrite a new source or reopen a cleared renderer',async()=>{
 for(const action of ['replace','clear','destroy']){
  const h=setup();try{
   h.release();const r=h.renderer,frame=await r.prepareSource(previewSource(h));r.commitSource(frame,{deferFit:true});
   let release;h.w.HTMLImageElement.prototype.decode=function(){return new Promise(resolve=>{release=()=>{Object.defineProperties(this,{naturalWidth:{value:2},naturalHeight:{value:2}});resolve();};});};
   const pending=r.ensureOriginal();await Promise.resolve();
   if(action==='replace')r.setSource({...h.source,src:h.source.src+'#next'});else r[action]();
   release();assert.equal(await pending,false);assert.notEqual(r.image.getAttribute('src'),h.source.src);
  }finally{h.dom.window.close();}
 }
});
test('wrong original dimensions retain visible preview and report failure once',async()=>{
 const h=setup();try{
  h.release();const r=h.renderer,source=previewSource(h),frame=await r.prepareSource(source);r.commitSource(frame,{deferFit:true});let errors=0;r.onError=()=>errors++;
  h.w.HTMLImageElement.prototype.decode=async function(){Object.defineProperties(this,{naturalWidth:{value:1},naturalHeight:{value:1}});};
  assert.equal(await r.ensureOriginal(),false);assert.equal(await r.ensureOriginal(),false);assert.equal(errors,1);
  assert.equal(r.image,frame.image);assert.equal(r.image.getAttribute('src'),source.preview.src);assert.equal(r.previewActive,true);
 }finally{h.dom.window.close();}
});
test('preview descriptor dimensions must match actual decoded pixels',async()=>{
 const h=setup();try{h.release();const s=previewSource(h);await assert.rejects(h.renderer.prepareSource({...s,preview:{...s.preview,width:2}}),/尺寸與宣告不一致/);await assert.rejects(h.renderer.prepareSource({...s,preview:{...s.preview,width:3}}),/身份或尺寸無效/);}finally{h.dom.window.close();}
});

test('preview upgrades at device-pixel density and ready access retains the full frame',async()=>{
 const h=setup();try{
  h.release();const r=h.renderer,source=previewSource(h),frame=await r.prepareSource(source);r.commitSource(frame,{deferFit:true});
  Object.defineProperty(h.w,'devicePixelRatio',{value:2,configurable:true});r.view={scale:.25,x:0,y:0,fitted:false};r.paint();assert.equal(h.calls(),1,'half-size frame covers half-size physical display');
  r.view.scale=.3;r.paint();await r.ensureOriginal();assert.equal(h.calls(),2);assert.equal(r.previewActive,false);
  const ready=r.readySource(source);assert.equal(ready.image,r.image);assert.equal(ready.preview,false);
  r.commitSource(ready,{deferFit:true});assert.equal(r.previewActive,false,'progress refresh must not downgrade to preview');
 }finally{h.dom.window.close();}
});

test('unchanged zoom labels retain their text node while changed zoom and clear stay current',async()=>{
 const h=setup();try{
  const pending=h.renderer.prepareSource(h.source);h.release();h.renderer.commitSource(await pending);
  const label=h.renderer.zoomLabel,first=label.firstChild;h.renderer.paint();h.renderer.paint();assert.equal(label.firstChild,first);
  h.renderer.view.scale=2;h.renderer.paint();assert.equal(label.textContent,'200%');assert.notEqual(label.firstChild,first);
  h.renderer.clear();assert.equal(label.textContent,'—');const empty=label.firstChild;h.renderer.paint();assert.equal(label.firstChild,empty);
 }finally{h.dom.window.close();}
});
