import test from 'node:test';
import assert from 'node:assert/strict';
import {VisualImageSources} from '../src/visual-image-sources.js';
const url=text=>'data:image/png;base64,'+Buffer.from(text).toString('base64');
function fakeCanvas(width=80,height=40,pixels='visible'){
 const el={nodeType:1,tagName:'CANVAS',width,height,pixels,attributes:[],dataset:{},getAttribute:()=>null,closest:()=>null,getContext(){return ctx},toDataURL(){return url(this.pixels+':'+this.width+'x'+this.height)}};
 const ctx={canvas:el,imageSmoothingEnabled:true,setTransform(){},fillRect(){},drawImage(image){el.pixels=image.pixels||image.src||'image'},getImageData(){return {data:new Uint8ClampedArray([0,0,0,el.pixels?255:0])}},save(){},restore(){}};return el;
}
function environment(){
 const doc={createElement:()=>fakeCanvas(),querySelectorAll:()=>[],getElementById:()=>null};globalThis.document=doc;return doc;
}
function fixture(){
 environment();const first={id:'image-a',name:'portrait.png',width:200,height:400,sha256:'sha-a',dataURL:url('original a')},second={id:'image-b',name:'rectangle.png',width:300,height:90,sha256:'sha-b',dataURL:url('original b')},plan={id:'plan',revision:2,nodes:[{id:'gray',op:'image.grayscale',params:{mode:'auto'}},{id:'features',op:'shape.gear',params:{samples:360}},{id:'failed',op:'shape.gear',params:{}}]},run=(image,id)=>({runId:id,pipelineId:'plan',pipelineRevision:2,image:{sourceSha256:image.sha256,width:image.width,height:image.height},nodes:[{id:'gray',status:'OK',parameters:{mode:'copy'},artifacts:[]},{id:'features',status:'OK',parameters:{samples:360},artifacts:[{id:'peaks-'+image.id,type:'points',points:[{x:1,y:2}]}]},{id:'failed',status:'FAILED',artifacts:[]}]});
 first.pipelineResult=run(first,'run-a');second.pipelineResult=run(second,'run-b');const raster=image=>({width:image.width,height:image.height,image:{pixels:image.id},gray:new Float32Array(4)}),project={data:{images:[first,second],activeId:first.id},workflow:{pipelinePlan:plan},pixels:new Map([[first.id,raster(first)],[second.id,raster(second)]]),get image(){return this.data.images.find(i=>i.id===this.data.activeId)},isPipelineResultCurrent(result,image,p){return result?.pipelineId===p.id&&result?.pipelineRevision===p.revision&&result?.image?.sourceSha256===image.sha256&&result.status!=='STALE'}};
 const pipelineView={project,cache:new Map([['live','unchanged']]),zoom:7,pan:{x:32,y:11},extent:'workpiece',working:false,nodeId:'features',getModel(){const image=project.image,result=image.pipelineResult,current=project.isPipelineResultCurrent(result,image,plan),selected=plan.nodes.find(n=>n.id===this.nodeId);return {image,plan,raw:result,result:current?result:null,current,selected,output:result?.nodes.find(n=>n.id===selected.id),nodes:plan.nodes}},canvasContext(canvas){return {ctx:canvas.getContext('2d'),width:canvas.width,height:canvas.height}},paintPane(canvas,type,m){assert.equal(this.model,m,'isolated methods must see their own model');assert.notEqual(this.cache,pipelineView.cache);assert.equal(this.project.pixels.get(m.image.id).image.pixels,m.image.id);this.cache.set('rendered',m.image.id);this.lastOverlayLabelLayout=['snapshot-only'];this.canvasContext(canvas);canvas.pixels=m.image.id+':'+m.result.runId+':'+m.selected.id+':'+m.output.parameters.samples}};
 pipelineView.model=pipelineView.getModel();return {project,pipelineView,first,second,plan,sources:new VisualImageSources({project,pipelineView})};
}
test('catalog lists all originals and only actual current outputs; resolving is isolated from active view and preserves rectangular pixels',async()=>{
 const {sources,project,pipelineView,first,second}=fixture(),list=sources.catalog();assert.equal(list.length,6);assert.equal(list.filter(i=>i.kind==='original').length,2);assert.equal(list.some(i=>i.source.nodeId==='failed'),false);assert.equal(JSON.stringify(list).includes('base64'),false);
 const original=await sources.resolve(list.find(i=>i.kind==='original'&&i.source.imageId===first.id).source_id);assert.equal(original.dataURL,first.dataURL);assert.equal(original.width,200);assert.equal(original.height,400);assert.equal(original.source.coordinateSpace,'original-image-pixels');
 const descriptor=list.find(i=>i.source.imageId===second.id&&i.source.nodeId==='features'),ref=await sources.resolve(descriptor.source_id);assert.deepEqual(ref.source.parameters,{samples:360});assert.equal(ref.source.artifactId,'peaks-image-b');assert.equal(ref.source.runId,'run-b');assert.equal(ref.source.coordinateSpace,'render-pixels');assert.deepEqual(ref.source.renderTransform,{scaleX:.6,scaleY:.6,translateX:60,translateY:18,mapping:'original-image-pixels to captured-render-pixels'});assert.match(Buffer.from(ref.dataURL.split(',')[1],'base64').toString(),/image-b:run-b:features:360/);
 assert.equal(project.image.id,first.id);assert.equal(pipelineView.model.image.id,first.id);assert.equal(pipelineView.zoom,7);assert.deepEqual(pipelineView.pan,{x:32,y:11});assert.deepEqual([...pipelineView.cache],[['live','unchanged']]);assert.equal(pipelineView.lastOverlayLabelLayout,undefined);assert.equal(Object.isFrozen(ref.source.parameters),true);
});
test('source IDs stay bound to captured run and parameters after switching images, rerunning, or staling current results',async()=>{
 const {sources,project,first,plan}=fixture(),old=sources.catalog().find(i=>i.source.nodeId==='features'&&i.source.imageId===first.id),oldRun=first.pipelineResult;
 first.pipelineResult=structuredClone(oldRun);first.pipelineResult.runId='run-new';first.pipelineResult.nodes[1].parameters.samples=720;project.data.activeId='image-b';
 const newer=sources.catalog().find(i=>i.source.nodeId==='features'&&i.source.imageId===first.id);assert.notEqual(old.source_id,newer.source_id);
 const oldRef=await sources.resolve(old.source_id);assert.equal(oldRef.source.runId,'run-a');assert.equal(oldRef.source.currentAtCapture,false);assert.equal(oldRef.source.parameters.samples,360);assert.match(Buffer.from(oldRef.dataURL.split(',')[1],'base64').toString(),/run-a:features:360/);
 const newRef=await sources.resolve(newer.source_id);assert.equal(newRef.source.parameters.samples,720);plan.revision=3;assert.equal(sources.catalog().filter(i=>i.kind==='stage').length,0);assert.deepEqual(await sources.resolve(old.source_id),oldRef);
});
test('fromElement freezes visible canvas immediately and refuses invalid pipeline placeholders and remote images',async()=>{
 const {sources,pipelineView,first}=fixture(),live=fakeCanvas(120,260,'shown-old');pipelineView.canvases=[{canvas:live,type:'result'}];
 const pending=sources.fromElement(live);live.pixels='shown-new';first.pipelineResult.runId='changed-after-right-click';const ref=await pending;assert.equal(ref.width,120);assert.equal(ref.height,260);assert.equal(ref.dataURL,url('image-a:run-a:features:360:120x260'));assert.equal(ref.source.runId,'run-a');assert.equal(ref.source.displayZoom,7);assert.equal(pipelineView.zoom,7);assert.deepEqual(pipelineView.pan,{x:32,y:11});assert.equal(pipelineView.lastOverlayLabelLayout,undefined);assert.deepEqual([...pipelineView.cache],[['live','unchanged']]);
 first.pipelineResult.status='STALE';await assert.rejects(sources.fromElement(live),/有效運算結果/);
 await assert.rejects(sources.fromElement({nodeType:1,tagName:'IMG',src:'https://example.com/image.png',naturalWidth:20,naturalHeight:20,closest:()=>null,getAttribute:()=>null}),/本地 PNG/);
 live.width=NaN;await assert.rejects(new VisualImageSources({project:sources.project}).fromElement(live),/尺寸/);
});
test('an unpainted arbitrary canvas is rejected before becoming a registered source',async()=>{
 const {sources}=fixture(),empty=fakeCanvas(300,150,'');await assert.rejects(sources.fromElement(empty),/透明占位圖/);assert.equal(sources.entries.size,0);assert.equal(sources.keys.size,0);
});
test('image strip uses its own image ID, and saved inquiry snapshots retain historical provenance',async()=>{
 const {sources,project,second}=fixture(),picture={nodeType:1,tagName:'IMG',src:second.dataURL,naturalWidth:300,naturalHeight:90,getAttribute:()=>null,closest:selector=>selector.startsWith('.image-tile')?{dataset:{imageId:second.id}}:null},ref=await sources.fromElement(picture);assert.equal(ref.source.imageId,second.id);assert.equal(ref.dataURL,second.dataURL);
 project.data.visualInquiry={assets:[{...ref,id:'saved-old',source:{...ref.source,runId:'historic-run',currentAtCapture:false}}]};picture.closest=()=>null;const saved=await sources.fromElement(picture);assert.equal(saved.id,'saved-old');assert.equal(saved.source.runId,'historic-run');assert.equal(saved.source.currentAtCapture,false);assert.deepEqual(await sources.resolve('saved-old'),saved);
});
test('safe app SVG rasterizes its frozen serialized payload; active/external SVG rejects before image loading',async()=>{
 const {sources}=fixture(),doc=globalThis.document,oldSerializer=globalThis.XMLSerializer,oldImage=globalThis.Image,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;let serialized='',loaded=0,revoked=0;
 class FakeImage{set src(value){this._src=value;this.pixels=serialized;loaded++;queueMicrotask(()=>this.onload())}get src(){return this._src}}
 globalThis.Image=FakeImage;globalThis.XMLSerializer=class{serializeToString(node){return node.xml}};URL.createObjectURL=blob=>{serialized='snapshot-svg';return 'blob:local'};URL.revokeObjectURL=()=>revoked++;
 const svg={nodeType:1,tagName:'svg',localName:'svg',ownerDocument:doc,attributes:[],viewBox:{baseVal:{width:920,height:420}},xml:'<svg viewBox="0 0 920 420"><rect/></svg>',getAttribute:()=>null,querySelectorAll:()=>[],closest:()=>null,cloneNode(){return {...this,setAttribute(){}}}};
 try{const pending=sources.fromElement(svg);svg.xml='<svg>changed</svg>';const ref=await pending;assert.equal(ref.width,920);assert.equal(ref.height,420);assert.equal(ref.source.currentAtCapture,false);assert.equal(ref.source.coordinateSpace,'render-pixels');assert.equal(revoked,1);assert.equal(loaded,1);
 svg.attributes=[{name:'onload',value:'run()'}];await assert.rejects(sources.fromElement(svg),/外部內容/);svg.attributes=[{name:'href',value:'https://evil.invalid/a.png'}];await assert.rejects(sources.fromElement(svg),/外部連結/);assert.equal(loaded,1);
 }finally{globalThis.XMLSerializer=oldSerializer;globalThis.Image=oldImage;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke}
});
test('collectImages returns actual local images without changing project state and records per-image failures',async()=>{
 const {sources,project}=fixture(),before=JSON.stringify(project.data),refs=await sources.collectImages();assert.equal(refs.length,6);assert.equal(JSON.stringify(project.data),before);assert.equal(sources.errors.length,0);assert.equal(refs.every(ref=>ref.dataURL.startsWith('data:image/png;base64,')),true);
 await assert.rejects(sources.resolve('unknown-image'),/不存在/);
});

test('annotated chat preview retains its displayed pixels and links the saved question instead of substituting clean/live pixels',async()=>{
 const {sources,project,first}=fixture(),original=await sources.resolve(sources.catalog().find(e=>e.kind==='original'&&e.source.imageId===first.id).id);project.data.visualInquiry={assets:[{...original,id:'asset-question',source:{...original.source,runId:'old-measured-run'}}]};
 const picture={nodeType:1,tagName:'IMG',src:url('annotation-visible'),naturalWidth:100,naturalHeight:200,dataset:{inquiryAssetId:'asset-question',inquiryItemId:'item-old'},visualSnapshot:{boardId:'board-question',revision:3},closest:()=>null,getAttribute:()=>null};
 const preview=await sources.fromElement(picture);assert.equal(preview.dataURL,picture.src);assert.notEqual(preview.dataURL,original.dataURL);assert.equal(preview.source.sourceAssetId,'asset-question');assert.equal(preview.source.runId,'old-measured-run');assert.equal(preview.source.coordinateSpace,'render-pixels');assert.deepEqual(preview.source.snapshotBinding,{boardId:'board-question',revision:3,itemId:'item-old'});assert.equal(preview.source.currentAtCapture,false);
});
