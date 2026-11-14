// Real saved PNG bytes and real native image decoding. Repeated asset references
// exercise collection capacity/cache bounds, not independent-image accuracy.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {Project} from '../src/model.js';import {encodedImageDimensions} from '../src/image.js';
const require=createRequire(import.meta.url),{loadImage,createCanvas}=require('../../qa/node_modules/@napi-rs/canvas');
const fixture=new URL('../../research/opencv-traditional-10-2026-10-25/assets/box.png',import.meta.url),bytes=await fs.readFile(fixture),hash=createHash('sha256').update(bytes).digest('hex'),url='data:image/png;base64,'+bytes.toString('base64'),size=encodedImageDimensions(url);
async function realDecode(dataURL){const raw=Buffer.from(dataURL.split(',')[1],'base64'),image=await loadImage(raw),canvas=createCanvas(image.width,image.height),context=canvas.getContext('2d');context.drawImage(image,0,0);const rgba=context.getImageData(0,0,image.width,image.height).data,gray=Float32Array.from({length:image.width*image.height},(_,i)=>rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114);return {width:image.width,height:image.height,rgba,gray,image,sha256:createHash('sha256').update(rgba).digest('hex'),contentSha256:createHash('sha256').update(raw).digest('hex'),decoder:{representation:'actual-napi-canvas-rgba8'}};}
async function setup(count=10001){const root=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-lazy-dataset-'));await fs.mkdir(root+'/assets');await fs.writeFile(root+'/assets/'+hash+'.png',bytes);const ref={root,$asset:'assets/'+hash+'.png',mime:'image/png',sha256:hash,size:bytes.length},records=Array.from({length:count},(_,i)=>({id:'sample-'+i,name:'reference-'+i+'.png',sourceId:'capacity-dataset',dataURL:'',assetRef:{...ref},contentSha256:hash,width:size.width,height:size.height,sha256:null,objects:[],desktop_refs:{},desktop_intents:{},expected:{}}));return {root,records,ref,project:{schema:'agentcv-desktop-0.8',images:records,activeId:records[0]?.id,config:{},events:[],chat:[]}};}
test('10,001 file-backed references load one real raster, paginate metadata and retain bounded decoded memory',async()=>{
 const data=await setup(),p=new Project();let reads=0,decodes=0;p.configureImageStore({cacheEntries:2,cacheBytes:8*1024*1024,readAsset:async asset=>{reads++;return 'data:'+asset.mime+';base64,'+(await fs.readFile(path.join(asset.root,asset.$asset))).toString('base64');}});
 try{await p.load(data.project,async input=>{decodes++;return realDecode(input)});assert.equal(p.data.images.length,10001);assert.equal(decodes,1);assert.equal(reads,1);assert.equal(p.pixels.size,1);assert.ok(p.cacheInfo().bytes<8*1024*1024);assert.equal(p.imageIdentity('sample-9999').contentSha256,hash);
  const page=p.listImageRecords({offset:9999,limit:50});assert.equal(page.total,10001);assert.equal(page.items.length,2);assert.ok(page.items.every(record=>!('dataURL'in record)&&!('objects'in record)));await p.selectImage('sample-9999');await p.selectImage('sample-10000');assert.equal(decodes,3);assert.equal(p.pixels.size,2);assert.equal(p.image.id,'sample-10000');assert.equal(p.data.images[5000].sha256,null,'unused frames were not decoded');assert.equal(Buffer.from((await p.readImageAsset('sample-10000')).split(',')[1],'base64').compare(bytes),0);
 }finally{await fs.rm(data.root,{recursive:true,force:true})}
});
test('a multi-view workpiece leases every needed raster even with one-entry viewport cache and releases afterward',async()=>{
 const data=await setup(4),p=new Project();p.configureImageStore({cacheEntries:1,cacheBytes:8*1024*1024,readAsset:async()=>url});try{await p.load(data.project,realDecode);await p.withImagePixels(['sample-1','sample-2'],async rasters=>{assert.equal(rasters.length,2);assert.ok(p.pixels.has('sample-1')&&p.pixels.has('sample-2'));assert.ok(p.cacheInfo().pinned.includes('sample-1'));});assert.equal(p.pixels.size,1);assert.equal(p.cacheInfo().pinned.length,1);await assert.rejects(p.withImagePixels(['sample-1'],async()=>{throw Error('Deliberate caller failure')}),/Deliberate caller failure/);assert.deepEqual(p.cacheInfo().pinned,['sample-0']);}finally{await fs.rm(data.root,{recursive:true,force:true})}
});
test('concurrent requests coalesce and a project switch discards an in-flight real file read',async()=>{
 const data=await setup(4),p=new Project();let decodes=0,hold,entered;const enteredRead=new Promise(r=>entered=r);p.configureImageStore({readAsset:async(ref,{imageId})=>{if(imageId==='sample-2'){entered();await new Promise(resolve=>hold=resolve);}return 'data:image/png;base64,'+(await fs.readFile(path.join(ref.root,ref.$asset))).toString('base64');}});try{await p.load(data.project,async input=>{decodes++;return realDecode(input)});const [a,b]=await Promise.all([p.ensureImagePixels('sample-1'),p.ensureImagePixels('sample-1')]);assert.equal(a,b);assert.equal(decodes,2);const pending=p.ensureImagePixels('sample-2');await enteredRead;p.newProject();hold();await assert.rejects(pending,/專案已改變/);assert.equal(p.data.images.length,0);assert.equal(p.pixels.size,0);assert.equal(p.imageLoadErrors.size,0,'old project errors do not pollute the new project');}finally{await fs.rm(data.root,{recursive:true,force:true})}
});
test('encoded headers avoid bulk decode for real inline imports; corruption rejects without replacing current project',async()=>{
 const p=new Project();let count=0;await p.addImages(Array.from({length:101},(_,i)=>({name:'original-'+i+'.png',dataUrl:url})),async input=>{count++;return realDecode(input)});assert.equal(count,1);assert.equal(p.data.images.length,101);assert.equal(p.image.contentSha256,hash);const before=p.data;
 const broken=JSON.parse(p.serialize());broken.images[100].dataURL='data:image/png;base64,'+Buffer.concat([bytes,Buffer.from('changed')]).toString('base64');await assert.rejects(p.load(broken,realDecode),/檔案內容雜湊不一致/);assert.equal(p.data,before);
});
test('thumbnail requests use true source pixels, are bounded separately and cannot masquerade as measurement rasters',async()=>{
 const data=await setup(70),p=new Project();let thumbnails=0;p.configureImageStore({readAsset:async()=>url,thumbnailer:async(input,{maxDimension})=>{thumbnails++;const image=await loadImage(Buffer.from(input.split(',')[1],'base64')),scale=Math.min(1,maxDimension/Math.max(image.width,image.height)),canvas=createCanvas(Math.round(image.width*scale),Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return {dataURL:'data:image/png;base64,'+canvas.toBuffer('image/png').toString('base64'),width:canvas.width,height:canvas.height};}});
 try{await p.load(data.project,realDecode);const before=p.cacheInfo().loads,one=await p.readImageThumbnail('sample-1',{maxDimension:64}),same=await p.readImageThumbnail('sample-1',{maxDimension:64});assert.equal(one,same);assert.equal(thumbnails,1);assert.equal(Math.max(one.width,one.height),64);assert.equal(one.role,'thumbnail');assert.equal(one.coordinateSpace,'thumbnail-pixels');assert.equal(one.contentSha256,hash);await Promise.all(data.records.slice(1).map(record=>p.readImageThumbnail(record.id,{maxDimension:64})));assert.equal(p.cacheInfo().loads,before);assert.ok(p.cacheInfo().thumbnailEntries<=64);assert.ok(p.cacheInfo().thumbnailBytes<=16*1024*1024);assert.equal(p.pixels.size,1);}finally{await fs.rm(data.root,{recursive:true,force:true})}
});
test('foreground real-image decode does not wait for a blocked background thumbnail',async()=>{
 const data=await setup(3),p=new Project();let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 p.configureImageStore({readAsset:async()=>url,thumbnailer:async input=>{entered();await gate;const image=await loadImage(Buffer.from(input.split(',')[1],'base64'));return {dataURL:input,width:image.width,height:image.height};}});
 try{await p.load(data.project,realDecode);const thumb=p.readImageThumbnail('sample-1');await started;const decoded=await Promise.race([p.selectImage('sample-2'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Foreground waited for thumbnail')),1000))]);assert.equal(decoded.width,size.width);assert.equal(p.image.id,'sample-2');release();await thumb;}finally{release();await fs.rm(data.root,{recursive:true,force:true});}
});

test('binary preparation preserves file integrity, coalescing, fallback and project-switch gates',async()=>{
 const data=await setup(4),p=new Project();let binaryReads=0,byteDecodes=0,changed=false,release,entered;
 let gate=null;const binary=()=>Uint8Array.from(changed?Buffer.concat([bytes,Buffer.from('changed')]):bytes).buffer;
 p.configureImageStore({readAsset:async()=>url,readAssetBytes:async()=>{binaryReads++;if(gate){entered();await gate;}return binary();},decode:realDecode,decodeBytes:async(buffer,options)=>{byteDecodes++;const result=await realDecode('data:'+options.mime+';base64,'+Buffer.from(buffer).toString('base64'));assert.equal(result.contentSha256,options.expectedSha256);return result;}});
 try{
  await p.load(data.project,realDecode);
  const [a,b]=await Promise.all([p.ensureImagePixels('sample-1'),p.ensureImagePixels('sample-1')]);assert.equal(a,b);assert.equal(binaryReads,1);assert.equal(byteDecodes,1);assert.equal(a.contentSha256,hash);
  changed=true;await assert.rejects(p.ensureImagePixels('sample-2'),/長度/);assert.equal(byteDecodes,1);assert.equal(p.pixels.has('sample-2'),false);
  changed=false;let started=new Promise(resolve=>entered=resolve);gate=new Promise(resolve=>release=resolve);
  const pending=p.ensureImagePixels('sample-3');await started;p.newProject();release();await assert.rejects(pending,/專案已改變/);assert.equal(byteDecodes,1);assert.equal(p.pixels.size,0);
 }finally{release?.();await fs.rm(data.root,{recursive:true,force:true});}
});

test('binary display snapshots preserve original bytes, reject bad identity and revoke their own URL',async()=>{
 const data=await setup(1),p=new Project();let supplied=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
 p.configureImageStore({readAsset:async()=>url,readAssetBytes:async()=>supplied});
 try{
  await p.load(data.project,realDecode);
  const display=await p.readImageDisplay('sample-0');assert.ok(display.src.startsWith('blob:'));
  const actual=Buffer.from(await (await fetch(display.src)).arrayBuffer());assert.deepEqual(actual,bytes);
  const image=await loadImage(actual);assert.equal(image.width,size.width);assert.equal(image.height,size.height);
  display.dispose();display.dispose();await assert.rejects(fetch(display.src));
  const priorReader=globalThis.FileReader;
  globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(raw=>{this.result='data:'+blob.type+';base64,'+Buffer.from(raw).toString('base64');this.onload();},error=>{this.error=error;this.onerror();});}};
  try{assert.equal(await display.snapshot(),url,'a captured discussion snapshot remains portable after display URL retirement');}finally{if(priorReader===undefined)delete globalThis.FileReader;else globalThis.FileReader=priorReader;}

  supplied=new ArrayBuffer(bytes.length-1);await assert.rejects(p.readImageDisplay('sample-0'),/長度/);
  supplied=new ArrayBuffer(bytes.length);await assert.rejects(p.readImageDisplay('sample-0'),/雜湊/);
  supplied=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  p.image.contentSha256='0'.repeat(64);await assert.rejects(p.readImageDisplay('sample-0'),/雜湊/);
 }finally{await fs.rm(data.root,{recursive:true,force:true});}
});
test('binary display does not create a URL for a retired project read',async()=>{
 const data=await setup(1),p=new Project();let release;
 p.configureImageStore({readAsset:async()=>url,readAssetBytes:()=>new Promise(resolve=>release=resolve)});
 try{await p.load(data.project,realDecode);const pending=p.readImageDisplay('sample-0');p.newProject();release(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));await assert.rejects(pending,/專案已改變/);assert.equal(p.imageLoadErrors.size,0);}finally{await fs.rm(data.root,{recursive:true,force:true});}
});
