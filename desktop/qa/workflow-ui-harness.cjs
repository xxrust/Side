// Real app bundle + real raster algorithms. Native window/layout and OS dialogs are not emulated acceptance.
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('../../qa/node_modules/jsdom');
const {createCanvas,Image}=require('../../qa/node_modules/@napi-rs/canvas');
const esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
async function createHarness(){
 const errors=[],nativeCalls=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(root,'qa/fixtures/legacy-shell.html'),'utf8'),{url:'http://localhost:1420',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 const native=new WeakMap();
 w.HTMLCanvasElement.prototype.getContext=function(type){let c=native.get(this);if(!c||c.width!==this.width||c.height!==this.height){c=createCanvas(this.width,this.height);native.set(this,c)}const ctx=c.getContext(type);if(!ctx.__wrappedCanvasSource){const draw=ctx.drawImage.bind(ctx);ctx.drawImage=(source,...args)=>draw(native.get(source)||source,...args);ctx.__wrappedCanvasSource=true}return ctx};
 w.HTMLCanvasElement.prototype.toDataURL=function(t){this.getContext('2d');return native.get(this).toDataURL(t)};
 w.Image=Image;w.structuredClone=structuredClone;Object.defineProperty(w.crypto,'subtle',{value:require('node:crypto').webcrypto.subtle});w.File=File;w.Blob=Blob;w.confirm=()=>true;
 w.ResizeObserver=class{observe(){}disconnect(){}};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'))};
 w.URL.createObjectURL=()=> 'blob:qa';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 w.FileReader=class{readAsDataURL(f){f.arrayBuffer().then(b=>{this.result=`data:${f.type};base64,${Buffer.from(b).toString('base64')}`;this.onload?.()}).catch(e=>this.onerror?.(e))}};
 w.__native={invoke:async(name,args)=>{nativeCalls.push({name,args});throw Error('Native connector not available in DOM test')},isTauri:()=>false,listen:async()=>()=>{}};
 w.Worker=class{postMessage(data){Promise.resolve().then(async()=>{try{const result=data.action==='pipeline'?await w.__QAPipeline.runPipeline(data.image,data.plan,data.options):data.action==='foreground'?w.__QAInspection.foregroundCandidates(data.image,{parameters:data.parameters}):data.recipe?w.__QAInspection.inspectImage(data.image,data.recipe,data.scale):data.batch?w.AgentCVPipeline.runFrame(data.image,data.batch.recipe,data.batch.config,data.batch.identity):w.AgentCVCore.detect(data.image,data.tool);this.onmessage?.({data:{id:data.id,result}})}catch(e){this.onmessage?.({data:{id:data.id,error:e.message}})}})}terminate(){}};
 const $=id=>w.document.getElementById(id),board=$('board');
 if(board){board.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:650});board.setPointerCapture=()=>{};board.releasePointerCapture=()=>{}}
 const built=await esbuild.build({entryPoints:[path.join(root,'src/app.js')],bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},target:'es2022',logLevel:'silent',define:{'import.meta.url':JSON.stringify('file://'+path.join(root,'src/app.js'))},plugins:[{name:'native-dom-test',setup(build){build.onResolve({filter:/^@tauri-apps\/api\//},args=>({path:args.path,namespace:'native-dom-test'}));build.onLoad({filter:/.*/,namespace:'native-dom-test'},()=>({contents:'export const invoke=(...a)=>window.__native.invoke(...a);export const isTauri=()=>window.__native.isTauri();export const listen=(...a)=>window.__native.listen(...a);export const getCurrentWindow=()=>({onCloseRequested:async()=>()=>{},destroy:async()=>{}});'}))}}]});
 const algorithms=await esbuild.build({entryPoints:[path.join(root,'src/inspection.js')],bundle:true,write:false,format:'iife',globalName:'__QAInspection',platform:'browser',target:'es2022',logLevel:'silent',define:{'import.meta.url':JSON.stringify('file://'+path.join(root,'src/inspection.js'))}});
 const pipeline=await esbuild.build({entryPoints:[path.join(root,'src/pipeline-runtime.js')],bundle:true,write:false,format:'iife',globalName:'__QAPipeline',platform:'browser',target:'es2022',logLevel:'silent'});
 w.eval(pipeline.outputFiles[0].text);w.eval(algorithms.outputFiles[0].text);w.eval(built.outputFiles[0].text);
 const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
 async function click(id){const el=$(id);if(!el)throw Error('Missing UI control: '+id);if(el.hidden||el.disabled)throw Error('Inactive UI control: '+id);el.click();await tick()}
 function input(id,value,event='input'){const el=$(id);if(!el)throw Error('Missing field: '+id);el.value=value;el.dispatchEvent(new w.Event(event,{bubbles:true}));return el}
 async function submit(id){const el=$(id);if(!el)throw Error('Missing form: '+id);el.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick()}
 function pointer(type,x,y,button=0){const b=w.AgentCVDesktop.board,e=new w.MouseEvent(type,{clientX:b.x+x*b.scale,clientY:b.y+y*b.scale,button,bubbles:true,cancelable:true});Object.defineProperty(e,'pointerId',{value:4});$('board').dispatchEvent(e)}
 async function files(id,items){const el=$(id);Object.defineProperty(el,'files',{configurable:true,value:items});el.dispatchEvent(new w.Event('change',{bubbles:true}));await tick()}
 return {w,$,api:w.AgentCVDesktop,click,input,submit,pointer,files,tick,errors,nativeCalls,root,close:()=>w.close()};
}
module.exports={createHarness};
