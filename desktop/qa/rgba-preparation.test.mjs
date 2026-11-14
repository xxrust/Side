import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRgbaInput} from '../src/input-inspection.js';
test('single-pass gray is bit-identical for every uint8 RGB combination',()=>{
 const rgba=new Uint8ClampedArray(256*256*4),gray=new Float32Array(256*256),expected=new Float32Array(gray.length);
 for(let r=0;r<256;r++){
  const histogram=Array(256).fill(0);
  for(let g=0;g<256;g++)for(let b=0;b<256;b++){
   const i=g*256+b;rgba.set([r,g,b,255],i*4);const luminance=r*.299+g*.587+b*.114;
   expected[i]=luminance;histogram[Math.round(luminance)]++;
  }
  const inspection=inspectRgbaInput(rgba,gray);
  assert.deepEqual(new Uint32Array(gray.buffer),new Uint32Array(expected.buffer),'red='+r);
  assert.deepEqual(inspection.grayHistogram,histogram);assert.equal(inspection.colorPixels,65535);assert.equal(inspection.nonOpaquePixels,0);
 }
 const mono=Uint8ClampedArray.from({length:256*4},(_,i)=>i%4===3?255:Math.floor(i/4)),out=new Float32Array(256),inspection=inspectRgbaInput(mono,out);
 assert.equal(inspection.achromatic,true);assert.deepEqual([...out],Array.from({length:256},(_,i)=>i));
 assert.throws(()=>inspectRgbaInput(mono,new Float32Array(1)),/尺寸/);
});
