// Run with Vite at /qa/image-renderer.browser.html. Uses browser layout, image
// decoding and modal top-layer behavior; no user project or saved files.
import {NodeOutputView} from '../src/node-output-view.js';
import {CanvasProjectView} from '../src/canvas-project-view.js';
import {openFlowNodePanel} from '../src/flow-node-panel.js';
import {Workspace} from '../src/workspace.js';
import {schemeFingerprint} from '../src/purpose-compiler.js';
import {captureWorkpieceArtifactPixels,clearWorkpieceArtifactPixels} from '../src/workpiece-live-state.js';
import {retainDatasetArtifacts} from '../src/artifact-retention.js';
import {resolveNodeOutput,outputImageReference} from '../src/node-output-model.js';

const check=(value,message)=>{if(!value)throw Error(message);};
const near=(a,b)=>Math.abs(a-b)<1.1;
const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,50))));
async function until(fn){for(let n=0;n<100;n++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Image/DOM did not settle');}
const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text||'';b.onclick=fn;return b;};
function sample(root,expected){
 const image=root.querySelector('img'),rect=image.getBoundingClientRect(),viewport=root.querySelector('.image-renderer-viewport');
 viewport.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.left+rect.width*.2,clientY:rect.top+rect.height*.25,bubbles:true}));
 const outputs=root.querySelectorAll('.image-rgb-readout');check(outputs.length===1,'Duplicate or missing RGB readout');
 check(outputs[0].textContent===expected,`Wrong pixel color: ${outputs[0].textContent}, expected ${expected}`);
 check(getComputedStyle(outputs[0]).display!=='none'&&outputs[0].getBoundingClientRect().width>0,'RGB is hidden');
}

export async function runImageRendererChecks(){
 const results=[],record=name=>results.push(name),canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#e6bb45';ctx.fillRect(0,0,1200,800);ctx.fillStyle='#1c6a84';ctx.fillRect(80,100,600,300);
 const url=canvas.toDataURL(),area=document.createElement('div');area.style.cssText='position:relative;width:100%;height:600px';document.body.append(area);
 const owner={project:{data:{},epoch:1},button},view=new NodeOutputView(owner);view.createSurface(area);
 const r=view.surface.renderer,input=view.surface.input.card.querySelector('.image-renderer');
 r.setSource({src:url,width:1200,height:800});view.surface.empty.hidden=true;
 await until(()=>r.image.complete&&r.image.naturalWidth);await settle();r.fit();
 check(r.bounds().height>100&&input.clientHeight>100,'Input/output renderer collapsed in grid');
 check(r.image.offsetWidth<=r.bounds().width&&r.image.offsetHeight<=r.bounds().height,'Fit clips image');
 check(getComputedStyle(view.surface.empty).display==='none','Hidden empty state still covers image');record('main input/output grid and hidden states');
 sample(r.root,'RGB 28, 106, 132');
 area.style.width='320px';await settle();check(r.maxButton.getBoundingClientRect().right<=r.root.getBoundingClientRect().right,'Narrow main pane clips maximize control');area.style.width='100%';await settle();

 const anchor={x:120,y:90},pixel={x:(anchor.x-r.view.x)/r.view.scale,y:(anchor.y-r.view.y)/r.view.scale};r.zoomBy(2,anchor);
 check(near((anchor.x-r.view.x)/r.view.scale,pixel.x)&&near((anchor.y-r.view.y)/r.view.scale,pixel.y),'Zoom anchor moved');
 const before={...r.view};r.setSource({src:url,width:1200,height:800});check(JSON.stringify(before)===JSON.stringify(r.view),'Same-source refresh resets camera');
 const center={x:(r.bounds().width/2-r.view.x)/r.view.scale,y:(r.bounds().height/2-r.view.y)/r.view.scale};area.style.width='85%';await settle();
 check(near((r.bounds().width/2-r.view.x)/r.view.scale,center.x)&&near((r.bounds().height/2-r.view.y)/r.view.scale,center.y),'Resize loses panned image center');record('anchored zoom, same-frame refresh, resize');

 area.style.transform='translate(30px,10px) scale(.65)';area.style.transformOrigin='top left';area.style.overflow='hidden';await settle();
 const rect=r.viewport.getBoundingClientRect(),point=r.localPoint({clientX:rect.left+rect.width*.25,clientY:rect.top+rect.height*.3});
 check(near(point.x,r.bounds().width*.25)&&near(point.y,r.bounds().height*.3),'Scaled canvas pointer coordinates are wrong');record('pointer coordinates under canvas transform');
 // Refit keeps the known test pixel visible after prior camera operations.
 r.fit();sample(r.root,'RGB 28, 106, 132');r.zoomBy(1.2);r.view.x+=7;r.view.y+=3;r.paint();sample(r.root,'RGB 28, 106, 132');
 const host=r.root.parentElement,hostStyle=host.getAttribute('style'),saved={...r.view};
 r.toggleMaximize(true);r.toggleMaximize(true);await settle();
 check(document.querySelectorAll('.image-renderer-fullscreen').length===1,'Repeated maximize creates duplicate hosts');
 check(near(r.bounds().width,innerWidth)&&near(r.bounds().height,innerHeight),'Maximize remains clipped by canvas');
 sample(r.root,'RGB 28, 106, 132');
 r.viewport.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await settle();
 check(r.root.parentElement===host&&host.getAttribute('style')===hostStyle,'Restore changed parent layout');
 check(near(saved.scale,r.view.scale)&&near(saved.x,r.view.x)&&near(saved.y,r.view.y),'Restore loses camera');record('top-layer maximize, idempotence, Escape and restore');
 sample(r.root,'RGB 28, 106, 132');r.viewport.dispatchEvent(new PointerEvent('pointerleave'));check(r.rgb.textContent==='RGB —','Pointer leave retains stale RGB');record('RGB after zoom, pan, canvas transform, maximize and restore');
 r.actual();check(r.view.scale===1&&r.image.offsetWidth===1200,'1:1 uses wrong image dimensions');
 r.setSource({src:url+'#new',width:1200,height:800});await settle();check(r.view.fitted,'New image did not reset to fit');
 r.toggleMaximize(true);r.clear();check(!document.querySelector('.image-renderer-fullscreen')&&r.maxButton.disabled,'Clearing image leaves modal behind');check(r.rgb.textContent==='RGB —','Clearing leaves stale RGB');view.dispose();area.remove();record('1:1, change source, clear and dispose');

 // Use the production source dialog, project model and image store.
 const portrait=document.createElement('canvas');portrait.width=800;portrait.height=1200;const pc=portrait.getContext('2d');pc.fillStyle='rgb(28,106,132)';pc.fillRect(0,0,800,1200);const sourceURL=portrait.toDataURL();
 const p=new Workspace();await p.addImages([{name:'portrait.png',dataUrl:sourceURL},{name:'same.png',dataUrl:sourceURL}],async()=>pc.getImageData(0,0,800,1200));
 const ids=p.data.images.map(image=>image.id),dialog=openFlowNodePanel({project:p,node:{id:'source',kind:'source',imageIds:ids},flow:{nodes:[],edges:[]},onLoadDecisionEvidence:async()=>({state:'READY',reasons:[{title:'Evidence',images:[{runId:'fixture',artifactId:'evidence',width:800,height:1200}]}],loadImage:async()=>sourceURL})});
 await until(()=>dialog.querySelector('.flow-source-original img')?.dataset.imageId===ids[0]&&dialog.querySelector('.source-decision img')?.complete&&dialog.querySelector('.source-decision img')?.naturalWidth);await settle();
 const original=dialog.querySelector('.flow-source-original .image-renderer'),evidence=dialog.querySelector('.source-decision .image-renderer');
 check(original.clientHeight>100&&original.clientWidth>100&&evidence.clientHeight>100&&evidence.clientWidth>100,'Source dialog collapsed after migration');
 check(!evidence.querySelector('[aria-label="最大化"]').disabled&&evidence.querySelector('img').offsetWidth>100,'Evidence pixels/tools were not installed');
 const sameSize=()=>{const a=original.getBoundingClientRect(),b=evidence.getBoundingClientRect(),ai=original.querySelector('img').getBoundingClientRect(),bi=evidence.querySelector('img').getBoundingClientRect();check(near(a.top,b.top)&&near(a.width,b.width)&&near(a.height,b.height),'Source viewing wells have different sizes');check(near(ai.width,bi.width)&&near(ai.height,bi.height),'Same-sized source images fit at different scales');};
 sameSize();dialog.querySelector('.flow-source-original figcaption').textContent='very-long-filename-'.repeat(30)+'.png';await settle();sameSize();
 sample(original,'RGB 28, 106, 132');sample(evidence,'RGB 28, 106, 132');record('source pair equal fit and RGB with long filename');
 const modalStyle=dialog.getAttribute('style');original.querySelector('[aria-label="最大化"]').click();await settle();
 check(document.querySelectorAll('dialog[open]').length===2,'Source maximize lost parent modal');
 sample(original,'RGB 28, 106, 132');
 document.querySelector('.image-renderer-fullscreen').dispatchEvent(new Event('cancel',{cancelable:true}));await settle();
 check(dialog.open&&original.parentElement.classList.contains('flow-source-original')&&dialog.getAttribute('style')===modalStyle,'Escape failed to restore source modal');
 sameSize();sample(original,'RGB 28, 106, 132');
 original.querySelector('[aria-label="最大化"]').click();dialog.close();await settle();check(!document.querySelector('.image-renderer-fullscreen'),'Closing source leaves a fullscreen orphan');record('source original/evidence layout and nested modal cleanup');

 // Card thumbnails must report their decoded pixel size, not the original's.
 const thumb=document.createElement('canvas');thumb.width=240;thumb.height=160;thumb.getContext('2d').drawImage(canvas,0,0,240,160);
 const thumbProject={epoch:1,data:{visualInquiry:{boards:[]}},imageIdentity:()=>({id:'image'}),imageRecord:()=>({name:'full.png',width:1200,height:800}),readImageThumbnail:async()=>({dataURL:thumb.toDataURL()})};
 const cards=new CanvasProjectView({view:{project:thumbProject}}),preview=cards.sourcePreview({id:'source'},{id:'image',name:'full.png'});preview.style.cssText='width:400px;height:240px';document.body.append(preview);
 await until(()=>preview.getAttribute('aria-busy')==='false');await settle();const thumbnail=cards.sourcePreviews.get('source').renderer;
 check(thumbnail.size().width===240&&thumbnail.size().height===160,'Thumbnail pretends to have original pixels');
 thumbnail.toggleMaximize(true);cards.clearPreviews();check(!document.querySelector('.image-renderer-fullscreen'),'Cache release leaves modal behind');cards.destroy();preview.remove();record('thumbnail dimensions and cached renderer cleanup');
 return {passed:results.length,checks:results,viewport:{width:innerWidth,height:innerHeight}};
}

// Call only in an isolated browser context at /. Synthetic UI data exercises
// production refresh/binding/layout; it makes no algorithm-accuracy claim.
export async function runWorkbenchRendererCheck(api){
 await api.startupReady;const p=api.project;p.newProject();
 const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#e0b83e';ctx.fillRect(0,0,1200,800);ctx.fillStyle='#245d78';ctx.fillRect(100,100,800,450);ctx.fillStyle='#fff';ctx.font='44px sans-serif';ctx.fillText('UI verification image',140,220);
 const url=canvas.toDataURL();await p.addImages([{name:'UI-verification.png',dataUrl:url}],api.decode);
 const scheme={id:'ui-fixture',execution:{unit:'workpiece'},operatorGraph:{nodes:[{id:'preview',title:'渲染框界面驗證',code:'result = {}',expected_outputs:[{id:'image',type:'image',role:'result'}]}],edges:[]}};
 p.data.purposeScheme=scheme;const fingerprint=schemeFingerprint(scheme),image=p.image;
 const run={runId:'ui-fixture-run',schemeNodeId:'preview',title:'渲染框界面驗證',mode:'scheme',status:'SUCCEEDED',execution:{status:'COMPLETED'},workpieceUnit:{id:'ui-fixture-unit',imageIds:[image.id]},sourceBinding:{schemeFingerprint:fingerprint,workflowRevision:p.workflow.revision,images:[{imageId:image.id,imageSha256:image.sha256,contentSha256:image.contentSha256,width:image.width,height:image.height}]},expectedOutputs:[{id:'image',type:'image',role:'result'}],artifacts:[{id:'image',name:'UI verification output',type:'image',role:'result',dataURL:url,width:1200,height:800,sha256:'ui-fixture-output'}],result:{valid:true}};
 p.data.algorithmRuns=[run];p.data.datasetExecutions=[{id:'ui-fixture-execution',schemeFingerprint:fingerprint,units:[{unitId:'ui-fixture-unit',imageIds:[image.id],runIds:[run.runId]}]}];
 // Match desktop memory + metadata retention, including reopening the durable
 // unit summary while its current-workpiece pixels are still in process memory.
 run.code=scheme.operatorGraph.nodes[0].code;
 captureWorkpieceArtifactPixels(p,'ui-fixture-unit',[run]);
 const record={...p.data.datasetExecutions[0].units[0],schemeFingerprint:fingerprint};
 const durable=retainDatasetArtifacts({executionId:'ui-fixture-execution',record,runs:[run]},{retention:{mode:'metadata'}}).product;
 p.restoreInspectionUnit(durable,{executionId:'ui-fixture-execution',unitId:'ui-fixture-unit'});
 check(p.data.algorithmRuns[0].artifacts[0].pixelRetention==='metadata-only','Fixture did not restore metadata retention');
 check(!p.data.algorithmRuns[0].artifacts[0].dataURL,'Process pixels leaked into project data');
 await api.inquiryView.open();const v=api.inquiryView;v.outputView.focus('preview');v.render();
 await until(()=>document.querySelectorAll('.node-output-gallery img[src]').length===2);await settle();
 for(const root of document.querySelectorAll('.node-output-gallery .image-renderer'))sample(root,'RGB 36, 93, 120');
 const surface=v.outputView.surface,r=surface.renderer;r.zoomBy(1.4);const saved={...r.view};r.toggleMaximize(true);
 for(let i=0;i<10;i++)v.render();check(v.outputView.surface===surface,'Polling recreated the live output surface');
 check(r.maximizeDialog?.open,'Polling dismissed maximized output');r.restoreMaximize();await settle();
 check(near(saved.scale,r.view.scale)&&near(saved.x,r.view.x),'Workbench refresh lost zoom/pan');
 check(surface.section.dataset.status==='READY','Workbench failed to resolve current fixture output');
 const model=resolveNodeOutput(p,{schemeNodeId:'preview'});
 check(outputImageReference(model,model.artifacts[0]).dataURL===url,'Current memory output cannot be referenced');
 const result={status:surface.section.dataset.status,images:document.querySelectorAll('.node-output-gallery img[src]').length,pollingIterations:10,memoryMetadata:true,dimensions:[...document.querySelectorAll('.node-output-gallery .image-renderer')].map(node=>({width:node.clientWidth,height:node.clientHeight})),viewport:{width:innerWidth,height:innerHeight}};
 clearWorkpieceArtifactPixels(p);v.outputView.lastPixelFrame=null;v.render();await settle();
 check(surface.image.hidden&&!surface.empty.hidden,'Expired memory pixels remained visible');
 check(surface.ask.disabled&&surface.empty.textContent.includes('摘要'),'Metadata history offered unavailable pixels');
 check(!p.data.algorithmRuns[0].artifacts[0].dataURL,'Viewing memory pixels serialized them');
 return {...result,expiredMemoryHidden:true};
}
