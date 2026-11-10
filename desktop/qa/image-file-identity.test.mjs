// Real JPEG bytes and real native canvas decoding, including a still-decodable
// JPEG metadata edit. No raster, model output or pixel fingerprint is mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {encodedImageSha256} from '../src/image.js';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const fixture=JSON.parse(await fs.readFile(new URL('../../reviews/2026-10-27-program-flow/actual-pi-workspace.agentcv.json',import.meta.url),'utf8'));
const webkitFixture=JSON.parse(await fs.readFile(new URL('../../reviews/2026-10-27-import-session/actual-webkit-roundtrip.agentcv.json',import.meta.url),'utf8'));
const bytes=Buffer.from(fixture.images[0].dataURL.split(',')[1],'base64');
const hash=createHash('sha256').update(bytes).digest('hex');

test('encoded JPEG identity is exact file SHA-256, separate from a browser RGBA identity',async()=>{
 assert.equal(await encodedImageSha256(fixture.images[0].dataURL),hash);
 assert.notEqual(hash,fixture.images[0].sha256,'the old recorded field identified decoded pixels, not encoded file bytes');
});

test('a real WebKit round-trip JPEG project loads all assets under a different real decoder and preserves the original execution history',async()=>{
 const h=await createHarness();try{
  const p=h.api.project,legacy=structuredClone(webkitFixture);delete legacy.images[0].contentSha256;await p.load(h.w.JSON.parse(JSON.stringify(legacy)),h.api.decode);
  assert.equal(p.data.images.length,1);assert.equal(p.pixels.size,1);assert.equal(p.ensureInquiry().assets.length,13);
  assert.equal(p.image.contentSha256,hash);assert.notEqual(p.image.sha256,webkitFixture.images[0].sha256,'native test decoder actually differs from the real WebKit record');
  assert.equal(p.loadWarnings.length,1);assert.equal(p.loadWarnings[0].code,'LEGACY_IMAGE_PIXEL_IDENTITY_UNVERIFIED');
  assert.equal(p.image.decodeHistory.at(-1).previousSha256,webkitFixture.images[0].sha256);assert.equal(p.image.decodeHistory.at(-1).currentSha256,p.image.sha256);
  assert.equal(p.data.algorithmRuns.length,2);assert.equal(JSON.stringify(p.data.algorithmRuns),JSON.stringify(webkitFixture.algorithmRuns),'the source-bound historical program outputs remain unchanged');
  const saved=p.serialize();await p.load(h.w.JSON.parse(saved),h.api.decode);assert.equal(p.loadWarnings.length,0,'same bytes and same decoder are stable on the next import');assert.equal(p.image.contentSha256,hash);
 }finally{h.close();}
});

test('a portable encoded hash verifies unchanged bytes but rejects an actual valid-JPEG metadata edit without replacing the open project',async()=>{
 const h=await createHarness();try{
  const p=h.api.project,portable=structuredClone(webkitFixture);portable.images[0].contentSha256=hash;
  await p.load(h.w.JSON.parse(JSON.stringify(portable)),h.api.decode);assert.equal(p.loadWarnings[0].code,'IMAGE_DECODE_CHANGED');assert.equal(p.loadWarnings[0].sourceIntegrity,'VERIFIED_FILE_BYTES');
  const old=p.data,oldPixels=p.pixels,oldId=p.image.id;
  const edited=Buffer.concat([bytes.subarray(0,2),Buffer.from([0xff,0xfe,0,4,65,66]),bytes.subarray(2)]),changed=structuredClone(portable);changed.images[0].dataURL='data:image/jpeg;base64,'+edited.toString('base64');
  const actual=await h.api.decode(changed.images[0].dataURL);assert.equal(actual.width,640);assert.equal(actual.height,480);assert.equal(actual.sha256,p.image.sha256,'metadata edit does not change the actual decoded pixels');
  await assert.rejects(p.load(h.w.JSON.parse(JSON.stringify(changed)),h.api.decode),/檔案內容雜湊不一致/);
  assert.equal(p.data,old);assert.equal(p.pixels,oldPixels);assert.equal(p.image.id,oldId);
 }finally{h.close();}
});

test('importing a new real camera file saves both file identity and decoder provenance',async()=>{
 const h=await createHarness();try{
  await h.api.addImages([{name:'stuff.jpg',dataUrl:fixture.images[0].dataURL}]);const image=h.api.project.image;
  assert.equal(image.contentSha256,hash);assert.equal(image.sha256,h.api.project.pixels.get(image.id).sha256);assert.equal(image.decoder.representation,'browser-canvas-rgba8');
 }finally{h.close();}
});
