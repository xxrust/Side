// DOM + real raster pixel integration test. This does not emulate browser layout.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
let canvasLib;try{canvasLib=require('@napi-rs/canvas')}catch{canvasLib=require(path.join(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas'));}
const {createCanvas,Image}=canvasLib;
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'workbench.html'),'utf8'),errors=[];
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(html,{url:'file://'+path.join(root,'workbench.html'),runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
Object.defineProperty(w,'innerHeight',{value:900,writable:true});Object.defineProperty(w,'innerWidth',{value:1440,writable:true});
const canvases=new WeakMap();const native=el=>{let c=canvases.get(el);if(!c||c.width!==el.width||c.height!==el.height){c=createCanvas(el.width,el.height);canvases.set(el,c);}return c;};
w.HTMLCanvasElement.prototype.getContext=function(type){return native(this).getContext(type);};w.HTMLCanvasElement.prototype.toDataURL=function(type){return native(this).toDataURL(type);};
class BrowserImage extends Image {
 set src(value){
  if(typeof value==='string'&&value.startsWith('data:')){const raw=Buffer.from(value.split(',')[1]||'','base64');if(raw[0]===66&&raw[1]===77){
   const offset=raw.readUInt32LE(10),width=raw.readInt32LE(18),height=Math.abs(raw.readInt32LE(22)),bits=raw.readUInt16LE(28),compression=raw.readUInt32LE(30);
   if(bits!==8||compression!==0)throw Error('QA bitmap adapter only supports uncompressed indexed 8-bit BMP');
   const canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),pixels=ctx.createImageData(width,height),stride=Math.ceil(width/4)*4,palette=14+raw.readUInt32LE(14),bottomUp=raw.readInt32LE(22)>0;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){const index=raw[offset+(bottomUp?height-1-y:y)*stride+x],p=palette+index*4,i=(y*width+x)*4;pixels.data[i]=raw[p+2];pixels.data[i+1]=raw[p+1];pixels.data[i+2]=raw[p];pixels.data[i+3]=255;}
   ctx.putImageData(pixels,0,0);value=canvas.toBuffer('image/png');
  }}super.src=value;
 }
 get src(){return super.src;}
}
w.Image=BrowserImage;Object.defineProperty(w.crypto,'subtle',{value:require('node:crypto').webcrypto.subtle});
w.confirm=()=>true;w.URL.createObjectURL=()=> 'blob:qa';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
w.File=File;w.Blob=Blob;w.FileReader=class{readAsDataURL(file){file.arrayBuffer().then(bytes=>{this.result=`data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload?.();}).catch(e=>this.onerror?.(e));}};
for(const f of ['viewport-core.js','viewport.js','vision-core.js','pipeline-core.js','workbench.js','workflow.js'])w.eval(fs.readFileSync(path.join(root,'assets',f),'utf8'));
const $=id=>w.document.getElementById(id),click=id=>$(id).click(),set=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
const snapshot=()=>JSON.parse(JSON.stringify(w.AgentCVFlow.projectData()));

const svg=$('intentCanvas');svg.getBoundingClientRect=()=>({left:20,top:30,width:1000,height:700});svg.setPointerCapture=()=>{};svg.hasPointerCapture=()=>false;
function pointer(target,type,p,button=0){const q=w.AgentCVViewMath.toScreen(w.AgentCVViewport.state(),p),e=new w.MouseEvent(type,{clientX:q.x+20,clientY:q.y+30,button,bubbles:true,cancelable:true});Object.defineProperty(e,'pointerId',{value:31});target.dispatchEvent(e);}
async function open(data){Object.defineProperty($('projectFile'),'files',{configurable:true,value:[new File([JSON.stringify(data)],'qa.agentcv.json')]});await $('projectFile').onchange({target:$('projectFile')});}
module.exports={w,$,click,set,snapshot,pointer,open,errors,root,svg,createCanvas};
