// Execute real programs in the project Python process. These assertions check
// pixels, independent expected results, and durable failure traces, not a mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),python=path.join(root,'runtime/python/bin/python3'),runner=path.join(root,'scripts/cv-runtime.py');
const available=fs.existsSync(python);
function crc32(buffer){let crc=0xffffffff;for(const b of buffer){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
function chunk(type,body){const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(body.length);crc.writeUInt32BE(crc32(Buffer.concat([name,body])));return Buffer.concat([size,name,body,crc])}
function png(width,height,pixel){const data=Buffer.alloc(height*(width*3+1));for(let y=0;y<height;y++)for(let x=0;x<width;x++){const c=pixel(x,y),i=y*(width*3+1)+1+x*3;for(let channel=0;channel<3;channel++)data[i+channel]=Array.isArray(c)?c[channel]:c}const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(data)),chunk('IEND',Buffer.alloc(0))])}
function gray16WithOrientation(){const width=2,height=3,values=[[1,1000],[20000,30000],[40000,65530]],data=Buffer.alloc(height*(width*2+1));for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.writeUInt16BE(values[y][x],y*(width*2+1)+1+x*2);const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=16;header[9]=0;const exif=Buffer.from([73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('eXIf',exif),chunk('IDAT',deflateSync(data)),chunk('IEND',Buffer.alloc(0))])}
const raster=png(160,96,(x,y)=>x>=20&&x<140&&y>=15&&y<81?(x>=30&&x<130&&y>=25&&y<71?230:150):20),source={imageId:'neutral-source',imageSha256:createHash('sha256').update(raster).digest('hex'),width:160,height:96};
function run(code,patch={}){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agentcv-python-')),request={runId:'real-program-test',title:'Unregistered algorithm program',code,parameters:{threshold:30},images:[{id:'neutral-source',name:'camera.png',width:160,height:96,dataUrl:'data:image/png;base64,'+raster.toString('base64')}],sourceBinding:source,justification:{tool:{reason:'Actual program pixels'},parameters:[],boundaries:[]},...patch};fs.writeFileSync(path.join(directory,'request.json'),JSON.stringify(request));const execution=spawnSync(python,[runner,'--run',path.join(directory,'request.json'),directory],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});assert.equal(execution.status,0,execution.stderr);const result=JSON.parse(fs.readFileSync(path.join(directory,'result.json'),'utf8'));return {directory,request,result}}

test('Python runtime exposes actual imports and permits user-defined first/last scan algorithm on exact original PNG bytes',{skip:!available},()=>{
 const {directory,result}=run(`
import cv2
import numpy as np
def scan_edges(values, threshold):
    derivative = np.diff(values.astype(float))
    return np.flatnonzero(np.abs(derivative) >= threshold).tolist()
profile=gray[48,:]
candidates=scan_edges(profile, parameters['threshold'])
first=candidates[0]
last=candidates[-1]
overlay=image.copy()
cv2.line(overlay,(first,0),(first,image.shape[0]-1),(0,255,0),1)
cv2.line(overlay,(last,0),(last,image.shape[0]-1),(0,0,255),1)
save_image('edges',overlay,section='tool')
save_json('profile',{'values':profile.tolist(),'candidates':candidates},section='parameters')
result={'candidates':candidates,'first':first,'last':last,'widthPx':last-first,'boundaryChecks':[{'id':'enough-edges','status':'PASS' if len(candidates)>=2 else 'FAIL','actual':len(candidates),'threshold':2}]}
`);
 assert.equal(result.status,'SUCCEEDED');assert.deepEqual(result.result.candidates,[19,29,129,139]);assert.equal(result.result.first,19);assert.equal(result.result.last,139);assert.equal(result.result.widthPx,120);assert.equal(result.artifacts[0].id,'edges');assert.equal(result.artifacts[0].section,'tool');assert.equal(result.artifacts[1].id,'profile');assert.equal(result.artifacts[1].section,'parameters');assert.deepEqual(result.sourceBinding,source);assert.equal(result.inputs[0].sha256,source.imageSha256);assert.deepEqual(fs.readFileSync(result.inputs[0].path),raster);assert.ok(result.artifacts[0].dataUrl.startsWith('data:image/png;base64,'));assert.equal(createHash('sha256').update(fs.readFileSync(result.artifacts[0].path)).digest('hex'),result.artifacts[0].sha256);assert.equal(fs.readFileSync(path.join(directory,'algorithm.py'),'utf8'),fs.readFileSync(path.join(directory,'request.json'),'utf8')&&JSON.parse(fs.readFileSync(path.join(directory,'request.json'),'utf8')).code);assert.equal(result.environment.libraries.cv2.available,true);assert.equal(result.environment.algorithmAllowlist,null);assert.equal(result.delivered,false);
});

test('memory artifact mode keeps current evidence pixels in the result and does not create PNG files',{skip:!available},()=>{
 const {directory,result}=run(`
save_image('live-evidence',gray)
result={'valid':True}
`,{artifactMode:'memory'});
 const artifact=result.artifacts[0];
 assert.equal(result.status,'SUCCEEDED',result.traceback);
 assert.equal(artifact.path,undefined);
 assert.equal(artifact.storage,'process-memory');
 assert.equal(artifact.pixelRetention,'current-workpiece-memory');
 assert.ok(artifact.dataUrl.startsWith('data:image/png;base64,'));
 assert.equal(fs.existsSync(path.join(directory,'outputs','live-evidence.png')),false);
});

test('memory artifact mode keeps upstream image ports readable without a file path',{skip:!available},()=>{
 const upstreamUrl='data:image/png;base64,'+raster.toString('base64');
 const {result}=run(`
result={'shape':list(upstream['source']['image'].shape),'dtype':str(upstream['source']['image'].dtype)}
`,{artifactMode:'memory',upstream:{source:{artifact:{id:'source',type:'image',sha256:createHash('sha256').update(raster).digest('hex'),dataUrl:upstreamUrl}}}});
 assert.equal(result.status,'SUCCEEDED',result.traceback);
 assert.deepEqual(result.result.shape,[96,160,3]);
 assert.equal(result.result.dtype,'uint8');
});

test('Python program can use a separate non-registered algorithm, classes, imports and complete multiple original inputs',{skip:!available},()=>{
 const color=png(160,96,()=>[241,31,7]);const {result}=run(`
from dataclasses import dataclass
import hashlib
@dataclass
class Spectrum:
    values: object
    def energy(self):
        return float(np.sum(np.abs(np.fft.fft2(self.values))**2))
result={'energy':Spectrum(gray.astype(float)).energy(),'firstColorBGR':images[1][0,0].tolist(),'inputCount':len(images)}
save_array('spectrum',np.fft.fft2(gray))
save_json('statistics',result)
`,{images:[{id:'neutral-source',width:160,height:96,dataUrl:'data:image/png;base64,'+raster.toString('base64')},{id:'color-source',width:160,height:96,dataUrl:'data:image/png;base64,'+color.toString('base64')}]});
 assert.equal(result.status,'SUCCEEDED',result.traceback);assert.equal(result.result.inputCount,2);assert.deepEqual(result.result.firstColorBGR,[7,31,241]);assert.ok(result.result.energy>0);assert.equal(result.artifacts[0].format,'numpy-npy');assert.ok(fs.statSync(result.artifacts[0].path).size>1000);assert.equal(result.inputs.length,2);
});

test('Python failures retain source, code, partial artifacts, stderr and exact traceback instead of a successful-looking result',{skip:!available},()=>{
 const {directory,result}=run(`
print('before failure')
save_image('before-failure',gray)
raise RuntimeError('deliberate independent failure')
`);
 assert.equal(result.status,'FAILED');assert.equal(result.error.type,'RuntimeError');assert.match(result.traceback,/deliberate independent failure/);assert.equal(result.result,null);assert.equal(result.artifacts.length,1);assert.match(result.stdout,/before failure/);assert.ok(fs.existsSync(path.join(directory,'traceback.txt')));assert.equal(result.delivered,false);
});

test('Python inputs preserve real 16-bit samples and explicitly apply EXIF orientation without 8-bit interpolation',{skip:!available},()=>{
 const raw=gray16WithOrientation(),{result}=run(`
result={'raw':raw_images[0].tolist(),'gray':gray.tolist(),'bgr':images[0][:,:,0].tolist(),'dtype':str(gray.dtype),'shape':list(gray.shape),'orientationApplied':image_records[0]['exifOrientationApplied']}
save_image('native-16-bit',gray)
`,{images:[{id:'gray16',width:3,height:2,dataUrl:'data:image/png;base64,'+raw.toString('base64')}]});
 assert.equal(result.status,'SUCCEEDED',result.traceback);const expected=[[40000,20000,1],[65530,30000,1000]];assert.deepEqual(result.result.raw,expected);assert.deepEqual(result.result.gray,expected);assert.deepEqual(result.result.bgr,expected);assert.deepEqual(result.result.shape,[2,3]);assert.equal(result.result.dtype,'uint16');assert.equal(result.result.orientationApplied,true);assert.equal(result.inputs[0].rawColorOrder,'GRAY');const output=fs.readFileSync(result.artifacts[0].path);assert.equal(output[24],16,'returned PNG retains native 16-bit grayscale depth');
});

test('Python runtime rejects a source dimension mismatch and bounds normal printed output',{skip:!available},()=>{
 const bad=run('result={"shouldNotRun":True}',{images:[{id:'neutral-source',width:161,height:96,dataUrl:'data:image/png;base64,'+raster.toString('base64')}]});assert.equal(bad.result.status,'FAILED');assert.match(bad.result.error.message,/dimensions/);assert.equal(bad.result.result,null);
 const {result}=run("print('x' * 900000)\nresult={'done':True}");assert.equal(result.status,'SUCCEEDED');assert.ok(result.stdout.length<530000);assert.match(result.stdout,/truncated/);assert.equal(result.result.done,true);
});
