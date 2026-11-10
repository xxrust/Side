// Exercise shared production transport with real OpenCV pixels and installed Pi
// catalog metadata. These tests make no model requests and replace no SDK methods.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {imageParts,requireVision,visualToolResult} from '../scripts/agent-image-transport.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const python=path.join(root,'runtime/python/bin/python3');
const source=path.join(root,'../assets/7bf06dd945fc7a0bdbf3d34b7b8514e6daec7c331ea3fc8030a8a56ad7009c67.jpg');
const sdkEntry=process.env.AGENTCV_PI_ENTRY||path.join(homedir(),'.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js');
let directory,images=[],visionModel,textModel;
before(async()=>{
 directory=await mkdtemp(path.join(tmpdir(),'agentcv-real-image-transport-'));
 const result=spawnSync(python,['-c',`
import cv2,sys,os
image=cv2.imread(sys.argv[1],cv2.IMREAD_COLOR)
assert image is not None, 'real source image must decode'
image=cv2.resize(image,(192,128),interpolation=cv2.INTER_AREA)
for extension in ['png','jpg','webp']:
    filename=os.path.join(sys.argv[2],'source.'+extension)
    assert cv2.imwrite(filename,image), 'OpenCV image encode failed'
    decoded=cv2.imread(filename,cv2.IMREAD_COLOR)
    assert decoded is not None and decoded.shape == image.shape
`,source,directory],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr||result.error?.message);
 for(const [extension,mimeType] of [['png','image/png'],['jpg','image/jpeg'],['webp','image/webp']]) images.push({type:'image',mimeType,data:(await readFile(path.join(directory,'source.'+extension))).toString('base64')});
 // The installed Pi dependency exposes its generated provider catalog without
 // constructing a runtime, loading credentials, or contacting a provider.
 await access(sdkEntry);
 const require=createRequire(sdkEntry);
 let catalog;
 for(const base of require.resolve.paths('@earendil-works/pi-ai')||[]) {
   const candidate=path.join(base,'@earendil-works/pi-ai/dist/models.generated.js');
   try { await access(candidate);catalog=candidate;break; } catch(error) { if(error.code!=='ENOENT')throw error; }
 }
 assert.ok(catalog,'installed Pi static model catalog must exist');
 const {MODELS}=await import(pathToFileURL(catalog));
 const models=Object.values(MODELS).flatMap(provider=>Object.values(provider));
 visionModel=models.find(model=>model.input?.includes('image'));
 textModel=models.find(model=>Array.isArray(model.input)&&!model.input.includes('image'));
 assert.ok(visionModel,'installed Pi catalog must contain a vision-capable model');
});
after(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

test('shared transport preserves multiple real OpenCV PNG, JPEG and WebP image parts',()=>{
 const parts=imageParts(images);assert.deepEqual(parts,images);assert.equal(parts.length,3);
 assert.deepEqual(imageParts([{...images[0],data:' \n'+images[0].data+'\n '}]),[images[0]]);
 assert.equal(requireVision(visionModel),undefined);
 const result=visualToolResult({_visualImages:images,source:{historical:true,runId:'actual-local-transport'}},visionModel);
 assert.deepEqual(result.content.filter(part=>part.type==='image'),images);
 assert.equal(result.details.source.historical,true);
});
test('image base64 stays out of tool result text and details at every nested field',()=>{
 const png=images[0].data;
 const value={source:{runId:'historic',historical:true},count:images.length,_visualImages:images,dataURL:'data:image/png;base64,'+png,nested:{dataUrl:'data:image/png;base64,'+png,base64:png,data:png,caption:'Real local camera pixels',items:[{preview:'data:image/png;base64,'+png}]} };
 const result=visualToolResult(value,visionModel);
 assert.equal(result.content[0].type,'text');assert.equal(result.details.count,3);
 assert.equal(result.details.nested.caption,'Real local camera pixels');
 assert.deepEqual(JSON.parse(result.content[0].text),result.details);
 for(const image of images){assert.ok(!result.content[0].text.includes(image.data));assert.ok(!JSON.stringify(result.details).includes(image.data));}
 assert.ok(!JSON.stringify(result.details).includes('data:image/'));
 assert.equal(result.details._visualImages,undefined);assert.equal(result.details.nested.data,undefined);
 assert.deepEqual(result.content.slice(1),images);
 assert.deepEqual(value._visualImages,images,'transport must not mutate input pixels');
});
test('installed text-only model metadata rejects visual inputs and plain results remain valid',()=>{
 // An absent capability declaration is a legitimate invalid precondition when
 // a future installed catalog contains only vision models.
 const model=textModel;
 if(model){assert.ok(model.id);assert.ok(model.provider);assert.ok(!model.input.includes('image'));}
 assert.throws(()=>requireVision(model),/未聲明支援圖像/);
 assert.throws(()=>visualToolResult({_visualImages:images},model),/未聲明支援圖像/);
 assert.throws(()=>requireVision(undefined),/未聲明支援圖像/);
 assert.deepEqual(visualToolResult({status:'No visual parts'},model),{content:[{type:'text',text:'{"status":"No visual parts"}'}],details:{status:'No visual parts'}});
});
test('transport rejects forged MIME signatures and damaged base64 encoding',()=>{
 assert.throws(()=>imageParts([{...images[0],mimeType:'image/jpeg'}]),/格式不符/);
 assert.throws(()=>imageParts([{...images[1],mimeType:'image/webp'}]),/格式不符/);
 assert.throws(()=>imageParts([{...images[2],mimeType:'image/png'}]),/格式不符/);
 assert.throws(()=>imageParts([{...images[0],data:Buffer.from('not an image').toString('base64')}]),/格式不符/);
 for(const data of ['',images[0].data.slice(1),'%%%%','YWJj===!']) assert.throws(()=>imageParts([{...images[0],data}]),/編碼無效/);
 assert.throws(()=>imageParts([{...images[0],mimeType:'image/svg+xml'}]),/缺少本地/);
 assert.throws(()=>imageParts(Array(17).fill(images[0])),/最多 16 張/);
 assert.throws(()=>imageParts(null),/必須為陣列/);
});
