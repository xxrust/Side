import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {decode} from '../src/image.js';
import {inspectRgbaInput} from '../src/input-inspection.js';
const require=createRequire(import.meta.url),{createCanvas,Image}=require('../../qa/node_modules/@napi-rs/canvas');

test('decoded color, grayscale and alpha-composited pixels retain exact identities and gray values',async()=>{
 const oldImage=globalThis.Image,oldDocument=globalThis.document;
 globalThis.Image=Image;globalThis.document={createElement:()=>createCanvas(1,1)};
 try{
  for(const colors of [['#000','#fff','#808080','#121212'],['#f00','#0f0','#00f','rgba(10,20,30,.5)']]){
   const input=createCanvas(2,2),ctx=input.getContext('2d');
   colors.forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(i%2,Math.floor(i/2),1,1)});
   const url=input.toDataURL(),output=await decode(url);
   const reference=createCanvas(2,2),r=reference.getContext('2d');r.fillStyle='#fff';r.fillRect(0,0,2,2);r.drawImage(output.image,0,0);
   const rgba=r.getImageData(0,0,2,2).data,inspection=inspectRgbaInput(rgba);
   assert.deepEqual(output.inputInspection,inspection);
   assert.equal(output.sha256,createHash('sha256').update(rgba).digest('hex'));
   assert.equal(output.contentSha256,createHash('sha256').update(Buffer.from(url.split(',')[1],'base64')).digest('hex'));
   const expected=Float32Array.from({length:4},(_,i)=>inspection.achromatic?rgba[i*4]:rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114);
   assert.deepEqual(output.gray,expected);assert.equal(output.grayProvenance.applied,!inspection.achromatic);
  }
 }finally{globalThis.Image=oldImage;globalThis.document=oldDocument;}
});

test('byte input matches data URLs exactly and releases blob URLs on success and failure',async()=>{
 const {decodeBytes}=await import('../src/image.js');
 const oldImage=globalThis.Image,oldDocument=globalThis.document,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 const blobs=new Map();let created=0,revoked=0;
 URL.createObjectURL=blob=>{const key='blob:test-'+(++created);blobs.set(key,blob);return key;};
 URL.revokeObjectURL=key=>{assert.ok(blobs.delete(key));revoked++;};
 class BlobImage extends Image{
  set src(value){if(blobs.has(value))blobs.get(value).arrayBuffer().then(bytes=>{super.src=Buffer.from(bytes);});else super.src=value;}
  get src(){return super.src;}
 }
 globalThis.Image=BlobImage;globalThis.document={createElement:()=>createCanvas(1,1)};
 try{
  const canvas=createCanvas(3,2),c=canvas.getContext('2d');c.fillStyle='rgba(18,97,164,.5)';c.fillRect(0,0,3,2);
  const url=canvas.toDataURL(),raw=Buffer.from(url.split(',')[1],'base64'),buffer=Uint8Array.from(raw).buffer;
  const expected=await decode(url),actual=await decodeBytes(buffer,{mime:'image/png',expectedSha256:expected.contentSha256});
  for(const key of ['width','height','gray','sha256','contentSha256','decoder','grayProvenance','inputInspection'])assert.deepEqual(actual[key],expected[key],key);
  assert.equal(created,1);assert.equal(revoked,1);assert.equal(actual.image.width,3);
  await assert.rejects(decodeBytes(buffer,{mime:'image/png',expectedSha256:'0'.repeat(64)}),/雜湊不一致/);
  assert.equal(created,1,'reject altered bytes before browser decoding');
  await assert.rejects(decodeBytes(new Uint8Array([1,2,3]).buffer,{mime:'image/png'}),/無法解碼/);
  assert.equal(created,2);assert.equal(revoked,2);assert.equal(blobs.size,0);
  await assert.rejects(decodeBytes(buffer,{mime:'text/html'}),/類型無效/);
  const mutable=Uint8Array.from(raw),pending=decodeBytes(mutable.buffer,{mime:'image/png',expectedSha256:expected.contentSha256});
  mutable.fill(0);const snapshot=await pending;
  assert.equal(snapshot.contentSha256,expected.contentSha256);assert.equal(snapshot.sha256,expected.sha256);
  assert.equal(created,3);assert.equal(revoked,3);assert.equal(blobs.size,0);
 }finally{globalThis.Image=oldImage;globalThis.document=oldDocument;URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
