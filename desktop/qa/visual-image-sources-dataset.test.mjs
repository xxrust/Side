// Real OpenCV PNG bytes, actual file reads and a real image decoder. Repeated
// references test catalogue/cache scale; they are not independent accuracy cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {Project} from '../src/model.js';
import {encodedImageDimensions} from '../src/image.js';
import {VisualImageSources} from '../src/visual-image-sources.js';
const require=createRequire(import.meta.url),{loadImage,createCanvas}=require('../../qa/node_modules/@napi-rs/canvas');
const bytes=await fs.readFile(new URL('../../research/opencv-traditional-10-2026-10-25/assets/box.png',import.meta.url)),digest=createHash('sha256').update(bytes).digest('hex'),encoded='data:image/png;base64,'+bytes.toString('base64'),dimensions=encodedImageDimensions(encoded);
async function decode(input){const image=await loadImage(Buffer.from(input.split(',')[1],'base64')),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,image.width,image.height).data,gray=Float32Array.from({length:image.width*image.height},(_,i)=>rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114);return {image,width:image.width,height:image.height,rgba,gray,sha256:createHash('sha256').update(rgba).digest('hex'),contentSha256:digest};}
async function dataset(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-visual-sources-'));await fs.mkdir(root+'/assets');await fs.writeFile(root+'/assets/'+digest+'.png',bytes);const images=Array.from({length:10001},(_,i)=>({id:'capture-'+i,name:'real-reference-'+i+'.png',sourceId:'native-capture-batch',width:dimensions.width,height:dimensions.height,contentSha256:digest,sha256:null,dataURL:'',objects:[],assetRef:{root,$asset:'assets/'+digest+'.png',sha256:digest,mime:'image/png',size:bytes.length}}));let reads=0,decodes=0;const project=new Project();project.configureImageStore({cacheEntries:2,readAsset:async ref=>{reads++;return 'data:'+ref.mime+';base64,'+(await fs.readFile(path.join(ref.root,ref.$asset))).toString('base64');}});await project.load({schema:'agentcv-desktop-0.8',images,activeId:images[0].id,config:{},events:[],chat:[]},async input=>{decodes++;return decode(input)});return {project,root,counts:()=>({reads,decodes})};}
test('10,001 real-file references page without captures; only requested source pixels are read and retained within a byte budget',async()=>{
 const {project,root,counts}=await dataset();try{
  const sources=new VisualImageSources({project}),first=sources.catalogPage();assert.equal(first.total,10001);assert.equal(first.items.length,50);assert.equal(first.nextOffset,50);assert.equal(first.metadataOnly,true);assert.deepEqual(counts(),{reads:1,decodes:1});assert.equal(sources.cacheInfo().entries,50);assert.ok(!JSON.stringify(first).includes('base64'));
  let last;for(let offset=0;offset<10001;offset+=200){last=sources.catalogPage({offset,limit:200});assert.ok(last.items.length<=200);assert.ok(sources.cacheInfo().entries<=512);}assert.equal(last.items.length,1);assert.equal(last.nextOffset,null);assert.deepEqual(counts(),{reads:1,decodes:1});assert.equal(project.pixels.size,1);assert.ok([...sources.entries.values()].every(entry=>!entry.raster&&!entry.originalURL&&!entry.reference));
  const selected=last.items[0],captured=await sources.resolve(selected.source_id);assert.equal(captured.source.imageId,'capture-10000');assert.equal(Buffer.compare(Buffer.from(captured.dataURL.split(',')[1],'base64'),bytes),0);assert.deepEqual(counts(),{reads:2,decodes:1});assert.deepEqual(await sources.resolve(selected.source_id),captured);assert.equal(counts().reads,2);
  await project.selectImage('capture-9999');const before=counts();const active=await sources.collectImages();assert.equal(active.length,1);assert.equal(active[0].source.imageId,'capture-9999');assert.equal(counts().reads,before.reads+1);assert.equal(counts().decodes,before.decodes);assert.equal(sources.lastCollectionPage.total,1);
  // Force the real encoded capture cache past its budget using repeated file
  // references; no fake pixel arrays or generated measurement results are used.
  for(let offset=0;offset<600;offset+=100){const page=sources.catalogPage({offset,limit:100});for(const entry of page.items)await sources.resolve(entry.source_id);assert.ok(sources.cacheInfo().bytes<=32*1024*1024);assert.ok(sources.cacheInfo().entries<=512);}
  assert.equal(counts().decodes,2,'catalogue and encoded captures did not decode other measurement frames');assert.ok(project.pixels.size<=2);await assert.rejects(sources.collectImages({limit:100}),/1–16/);await assert.rejects(sources.collectImages({source_ids:Array(17).fill('capture')}),/最多16/);const previousId=sources.catalogPage({limit:1}).items[0].id;await sources.resolve(previousId);project.newProject();assert.equal(sources.catalogPage().total,0);assert.equal(sources.entries.size,0);await assert.rejects(sources.resolve(previousId),/不存在/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('dataset metadata resolves a canvas source collection separately from native import batch identity',async()=>{
 const {project,root,counts}=await dataset();try{
  project.data.visualInquiry={boards:[{id:'real-source-board',projectSpaces:{sources:[{id:'board-source',imageIds:['capture-10000','capture-3']}],references:[],relations:[]}}]};
  const page=project.listImageRecords({sourceId:'board-source',offset:1,limit:1});assert.equal(page.total,2);assert.equal(page.items[0].id,'capture-3');assert.equal(page.sourceId,'board-source');assert.equal(project.listImageRecords({sourceId:'native-capture-batch',limit:1}).total,10001);assert.equal(project.listImageRecords({sourceId:'board-source',imageIds:['capture-0','capture-10000']}).total,1);assert.ok(!('pipelineResult'in page.items[0]));assert.ok(!('assetRef'in page.items[0]));assert.ok(!('dataURL'in page.items[0]));assert.throws(()=>project.listImageRecords({sourceId:'not-a-real-source'}),/圖像源不存在/);assert.deepEqual(counts(),{reads:1,decodes:1});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('an observed source-file failure invalidates cached measurement pixels and clears only after successful verified reload',async()=>{
 const {project,root,counts}=await dataset();try{
  project.configureImageStore({thumbnailer:async input=>{const source=await loadImage(Buffer.from(input.split(',')[1],'base64')),canvas=createCanvas(64,64);canvas.getContext('2d').drawImage(source,0,0,64,64);return {dataURL:canvas.toDataURL('image/png'),width:64,height:64};}});await project.readImageThumbnail('capture-0');assert.equal(project.cacheInfo().thumbnailEntries,1);
  assert.ok(project.pixels.has('capture-0'));const filename=root+'/assets/'+digest+'.png';await fs.writeFile(filename,Buffer.concat([bytes,Buffer.from('actual file corruption')]));await assert.rejects(project.readImageAsset('capture-0'),/檔案內容雜湊/);assert.ok(project.imageLoadErrors.has('capture-0'));assert.ok(!project.pixels.has('capture-0'));assert.equal(project.cacheInfo().thumbnailEntries,0);await assert.rejects(project.readImageThumbnail('capture-0'),/檔案內容雜湊/);await assert.rejects(project.ensureImagePixels('capture-0'),/檔案內容雜湊/);assert.ok(project.imageLoadErrors.has('capture-0'));await fs.writeFile(filename,bytes);await project.ensureImagePixels('capture-0');assert.equal(project.imageLoadErrors.has('capture-0'),false);assert.ok(project.pixels.has('capture-0'));assert.equal(counts().decodes,2);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('an older successful source read cannot clear a newer observed corruption failure',async()=>{
 const {project,root}=await dataset();try{
  let release,entered;const waiting=new Promise(resolve=>entered=resolve);let delay=true;project.configureImageStore({readAsset:async ref=>{const captured=await fs.readFile(path.join(ref.root,ref.$asset));if(delay){delay=false;entered();await new Promise(resolve=>release=resolve);}return 'data:'+ref.mime+';base64,'+captured.toString('base64');}});
  const older=project.readImageAsset('capture-0');await waiting;const filename=root+'/assets/'+digest+'.png';await fs.writeFile(filename,Buffer.concat([bytes,Buffer.from('new corruption')]));await assert.rejects(project.readImageAsset('capture-0'),/檔案內容雜湊/);release();assert.equal(await older,encoded);assert.ok(project.imageLoadErrors.has('capture-0'));await fs.writeFile(filename,bytes);await project.readImageAsset('capture-0');assert.equal(project.imageLoadErrors.has('capture-0'),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
