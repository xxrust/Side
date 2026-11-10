// Native filesystem library exercised with real OpenCV sample image bytes and
// actual locally authored vector markup. No canned detector/model responses.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {saveVisualAsset,searchVisualAssets,getVisualAsset} from '../scripts/visual-asset-library.mjs';
import {createVisualAssetLibrary} from '../src/visual-asset-library.js';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-visual-library-'));
const box=await fs.readFile(new URL('../../research/opencv-traditional-10-2026-10-25/assets/box.png',import.meta.url));
const dataUrl='data:image/png;base64,'+box.toString('base64');
const sha256=createHash('sha256').update(box).digest('hex');
test.after(async()=>fs.rm(root,{recursive:true,force:true}));
test('real sample image is stored by SHA and reused across independent clients/project provenance',async()=>{
 const a=await saveVisualAsset({title:'OpenCV 目標封面',dataUrl,role:'reference',tags:['定位'],method:'特徵對應',provenance:{projectName:'專案甲',sourceSha256:sha256}},{root});
 const b=await saveVisualAsset({title:'另一專案的封面參考',dataUrl,role:'reference',tags:['封面'],provenance:{projectName:'專案乙'}},{root});
 assert.equal(a.created,true);assert.equal(b.deduplicated,true);assert.equal(a.entry.id,b.entry.id);assert.equal(b.entry.captures.length,2);
 assert.deepEqual((await fs.readdir(path.join(root,'blobs'))),[sha256]);
 const found=await searchVisualAssets({query:'專案乙',tags:['定位']},{root});assert.equal(found.total,1);assert.equal(found.contentIncluded,false);assert.equal(JSON.stringify(found).includes('base64'),false);
 const loaded=await getVisualAsset({id:a.entry.id},{root});assert.equal(loaded.dataUrl,dataUrl);assert.match(loaded.entry.scope,/不代表當前圖像/);
});
test('mismatched MIME/hash/path inputs reject and exact SVG/HTML source round-trip',async()=>{
 await assert.rejects(saveVisualAsset({dataUrl,sha256:'0'.repeat(64)},{root}),/SHA-256 mismatch/);
 await assert.rejects(saveVisualAsset({dataUrl:dataUrl.replace('image/png','image/jpeg')},{root}),/JPEG signature/);
 await assert.rejects(saveVisualAsset({dataUrl:'https://example.org/image.png'},{root}),/inline/);
 await assert.rejects(saveVisualAsset({dataUrl,path:'/tmp/arbitrary.png'},{root}),/documented metadata/);
 await assert.rejects(getVisualAsset({id:'../../etc/passwd'},{root}),/invalid asset ID/);
 for(const [mime,content]of [['image/svg+xml','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 30"><rect width="40" height="20" fill="green"/><text x="45" y="15">輸入</text></svg>'],['text/html','<div><h2>如何讀圖</h2><p>綠框標示待觀察區域。</p></div>']]){
  const saved=await saveVisualAsset({title:'示意說明',role:'schematic',dataUrl:`data:${mime};base64,${Buffer.from(content).toString('base64')}`},{root});
  assert.equal((await getVisualAsset({id:saved.entry.id},{root})).content,content);
 }
 for(const content of ['<svg><script>window.archiveProbe=1</script></svg>','<svg><image href="https://example.invalid/a.png"/></svg>','<div onclick="window.archiveProbe=1">x</div>','<canvas id="scene"></canvas><script>document.getElementById("scene").getContext("2d").fillRect(1,1,4,4);</script>','<article><main><figure>可重用圖解</figure></main></article>']){
  const archived=await saveVisualAsset({dataUrl:'data:text/html;base64,'+Buffer.from(content).toString('base64')},{root});
  assert.equal((await getVisualAsset({id:archived.entry.id},{root})).content,content);
 }
 await assert.rejects(saveVisualAsset({dataUrl:'data:text/html;base64,not valid base64!'},{root}),/base64/);
 await assert.rejects(saveVisualAsset({dataUrl:'data:image/png;base64,'+Buffer.from('<canvas></canvas>').toString('base64')},{root}),/PNG signature/);
});
test('two filesystem clients deduplicate concurrently; corrupt blob refuses get',async()=>{
 const dir=path.join(root,'concurrent');
 const saved=await Promise.all(Array.from({length:6},(_,i)=>saveVisualAsset({dataUrl,title:'同一張真圖',provenance:{projectName:'並行'+i}},{root:dir})));
 assert.equal(saved.filter(s=>s.created).length,1);assert.equal(new Set(saved.map(s=>s.entry.id)).size,1);
 assert.equal((await searchVisualAssets({},{root:dir})).entries[0].captures.length,6);
 await fs.writeFile(path.join(dir,'blobs',sha256),'corruption');
 await assert.rejects(getVisualAsset({id:saved[0].entry.id},{root:dir}),/integrity/);
});
test('shared JS facade routes native commands to real filesystem backend and normalizes markup content',async()=>{
 const invoked=[];const client=createVisualAssetLibrary({invoke:async(name,{request})=>{invoked.push(name);return {'visual_asset_library_save':saveVisualAsset,'visual_asset_library_search':searchVisualAssets,'visual_asset_library_get':getVisualAsset}[name](request,{root:path.join(root,'facade')})}});
 const content='<svg xmlns="http://www.w3.org/2000/svg" width="90" height="20"><text x="1" y="15">參數說明</text></svg>';
 const saved=await client.save({content,mimeType:'image/svg+xml',title:'用於教學的向量圖',role:'schematic'});
 const found=await client.search({query:'教學'});assert.equal(found.total,1);assert.equal((await client.get({id:saved.entry.id})).content,content);
 assert.deepEqual(invoked,['visual_asset_library_save','visual_asset_library_search','visual_asset_library_get']);
});
test('CLI stores and reads content in configured durable library directory',async()=>{
 const directory=path.join(root,'cli');
 const cli=(command,input)=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/visual-asset-library.mjs',command],{cwd:new URL('..',import.meta.url),env:{...process.env,AGENTCV_ASSET_LIBRARY_DIR:directory}});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>code?reject(Error(err)):resolve(JSON.parse(out)));p.stdin.end(JSON.stringify(input))});
 const saved=await cli('--save',{dataUrl,title:'CLI真圖',role:'evidence',provenance:{runId:'existing-run',artifactId:'sample-image'}});
 assert.equal((await cli('--search',{query:'CLI真圖'})).total,1);assert.equal((await cli('--get',{id:saved.entry.id})).dataUrl,dataUrl);
});
