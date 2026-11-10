// DOM + real raster pixel integration test. This does not emulate browser layout.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
let canvasLib;try{canvasLib=require('@napi-rs/canvas')}catch{canvasLib=require(path.join(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas'));}
const {createCanvas,Image}=canvasLib;
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'workbench.html'),'utf8'),errors=[];
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(html,{url:'file://'+path.join(root,'workbench.html'),runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
Object.defineProperty(w,'innerHeight',{value:900,writable:true});Object.defineProperty(w,'innerWidth',{value:1440,writable:true});
const canvases=new WeakMap();const native=el=>{let c=canvases.get(el);if(!c||c.width!==el.width||c.height!==el.height){c=createCanvas(el.width,el.height);canvases.set(el,c);}return c;};
w.HTMLCanvasElement.prototype.getContext=function(type){return native(this).getContext(type);};w.HTMLCanvasElement.prototype.toDataURL=function(type){return native(this).toDataURL(type);};
w.Image=Image;Object.defineProperty(w.crypto,'subtle',{value:require('node:crypto').webcrypto.subtle});
w.confirm=()=>true;w.URL.createObjectURL=()=> 'blob:qa';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
w.File=File;w.Blob=Blob;w.FileReader=class{readAsDataURL(file){file.arrayBuffer().then(bytes=>{this.result=`data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload?.();}).catch(e=>this.onerror?.(e));}};
for(const f of ['viewport-core.js','viewport.js','vision-core.js','pipeline-core.js','workbench.js','workflow.js'])w.eval(fs.readFileSync(path.join(root,'assets',f),'utf8'));
const $=id=>w.document.getElementById(id),click=id=>$(id).click(),set=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
const snapshot=()=>JSON.parse(JSON.stringify(w.AgentCVFlow.projectData()));
let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};

const transcript=[];function record(action){const p=snapshot(),o=p.images[0]?.objects||[];const row={action,guidance:$('guidanceTitle').textContent,next:$('guidanceAction').textContent,status:$('actionStatus').textContent,candidateSummary:$('candidateSummary').textContent,liveObjects:w.AgentCVWorkbench.state().objects.map(o=>({id:o.id,y:o.y,status:o.result?.status})),objects:o.map(a=>({id:a.id,type:a.type,x:a.x,y:a.y,width:a.width,height:a.height,from:a.from,to:a.to,run:a.result?.run_id,result:a.result?.status,candidates:a.result?.candidates?.map(c=>({id:c.id,geometry:c.geometry})),selected:a.result?.selected_ids})),measurements:p.config.measurements,result:p.images[0]?.result?.status};transcript.push(row);console.log(JSON.stringify(row));}
(async()=>{
const svg=$('intentCanvas');svg.getBoundingClientRect=()=>({left:0,top:0,width:320,height:240});svg.setPointerCapture=()=>{};svg.hasPointerCapture=()=>false;
const pointer=(target,type,x,y)=>{const e=new w.MouseEvent(type,{clientX:x,clientY:y,button:0,bubbles:true,cancelable:true});Object.defineProperty(e,'pointerId',{value:7});target.dispatchEvent(e);};
const edge=createCanvas(320,240),ec=edge.getContext('2d');ec.fillStyle='#222';ec.fillRect(0,0,320,240);ec.fillStyle='#ddd';ec.fillRect(30,80,260,120);
Object.defineProperty($('imageFiles'),'files',{configurable:true,value:[new File([edge.toBuffer('image/png')],'first-use-edge.png',{type:'image/png'})]});await $('imageFiles').onchange({target:$('imageFiles')});record('1 import real PNG via file-input handler');
w.document.querySelector('[data-tool="line"]').click();pointer(svg,'pointerdown',80,80);pointer(svg,'pointermove',240,80);pointer(svg,'pointerup',240,80);record('2 draw intended horizontal edge through pointer handlers');
click('guidanceAction');record('3 click依標註建立搜尋');
let p=snapshot(),tool=p.images[0].objects.find(o=>o.kind==='tool'),toolid=tool.id,drawid=p.images[0].objects.find(o=>o.kind==='drawing').id;assert.ok(tool.result.candidates.length);
const roi=()=>svg.querySelector(`#annotationLayer [data-object="${toolid}"] rect`);pointer(roi(),'pointerdown',80,64);pointer(svg,'pointermove',80,69);record('4 move ROI down5px during drag');pointer(svg,'pointerup',80,69);record('5 release ROI still containing same physical edge');
let moved=snapshot().images[0].objects.find(o=>o.id===toolid);assert.equal(moved.y,tool.y+5);assert.notEqual(moved.result.run_id,tool.result.run_id);assert.ok(Math.abs(moved.result.candidates[0].geometry.from.y-80)<2);
pointer(roi(),'pointerdown',80,69);pointer(svg,'pointermove',80,119);pointer(svg,'pointerup',80,119);record('6 move ROI off edge and release');moved=snapshot().images[0].objects.find(o=>o.id===toolid);assert.equal(moved.result.candidates?.length||0,0);assert.equal(snapshot().images[0].objects.find(o=>o.id===drawid).from.y,80);
pointer(roi(),'pointerdown',80,119);pointer(svg,'pointermove',80,64);pointer(svg,'pointerup',80,64);record('7 move ROI back onto edge');
$('candidateList').querySelector('button').click();record('8 adopt candidate using visible button');click('guidanceAction');record('9 guided建立量測 automatically chooses '+$('measureKind').value);click('addMeasurement');record('10 add measurement');click('guidanceAction');set('ruleMin','180');set('ruleMax','200');click('addRule');record('11 enter tolerance180to200');click('guidanceAction');record('12 execute current frame');assert.equal(snapshot().images[0].result.status,'OK');
// Visible selection paths can turn an intended replacement into multi-select.
click('newProject');const stripes=createCanvas(320,240),sc=stripes.getContext('2d');sc.fillStyle='#222';sc.fillRect(0,0,320,240);sc.fillStyle='#ddd';sc.fillRect(30,80,260,10);Object.defineProperty($('imageFiles'),'files',{configurable:true,value:[new File([stripes.toBuffer('image/png')],'two-edges.png',{type:'image/png'})]});await $('imageFiles').onchange({target:$('imageFiles')});w.document.querySelector('[data-tool="line"]').click();pointer(svg,'pointerdown',80,85);pointer(svg,'pointermove',240,85);pointer(svg,'pointerup',240,85);click('guidanceAction');let t=snapshot().images[0].objects.find(o=>o.kind==='tool');assert.equal(t.result.candidates.length,2);$('candidateList').querySelector('button').click();click('candidateNext');$('candidateList').querySelector('button').click();record('13 try choosing another line using second candidate adopt button');assert.equal(snapshot().images[0].objects.find(o=>o.kind==='tool').result.selected_ids.length,2);
fs.writeFileSync(path.join(__dirname,'first-use-trace.json'),JSON.stringify({method:'JSDOM actual DOM handlers, native raster. No browser layout or pointer hit testing.',transcript,errors},null,2));assert.deepEqual(errors,[]);w.close();
})().catch(e=>{fs.writeFileSync(path.join(__dirname,'first-use-trace.json'),JSON.stringify({transcript,errors,error:e.stack},null,2));console.error(e);w.close();process.exit(1)});
