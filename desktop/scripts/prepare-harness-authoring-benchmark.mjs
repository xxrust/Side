// Original public OpenCV images only; starts with no scheme or execution history.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Workspace} from '../src/workspace.js';
import {decodeBenchmarkImage} from './agentcv-benchmark-batch.mjs';
const out=path.resolve(process.argv[2]||'../codex-audit-logs/20261102-agent-harness/pi-authoring-01'),root=path.resolve(import.meta.dirname,'..'),assets=path.resolve(root,'../research/opencv-traditional-10-2026-10-25');
await fs.mkdir(out,{recursive:true});const p=new Workspace(),b=p.ensureProjectCanvas(),sources=[];
for(const name of ['smarties.png','extra-fruits.png']){
 const bytes=await fs.readFile(assets+'/assets/'+name),sha256=createHash('sha256').update(bytes).digest('hex');
 const manifest=JSON.parse(await fs.readFile(assets+'/sources/asset-manifest-'+(name==='smarties.png'?'main':'extra')+'.json','utf8'));
 const records=Array.isArray(manifest)?manifest:manifest.assets||manifest.files;const record=records?.find(x=>x.name===name);
 if(!record)throw Error('Missing original source manifest for '+name);
 if(record.sha256&&record.sha256!==sha256)throw Error('Original source hash changed: '+name);
 sources.push({name,sha256,source:record});await p.addImages([{name,dataUrl:'data:image/png;base64,'+bytes.toString('base64')}],decodeBenchmarkImage);
}
p.bindCanvasImages(b.id,b.projectSpaces.sources[0].id,p.data.images.map(i=>i.id));await p.selectImage(p.data.images[0].id);
await fs.writeFile(out+'/input.agentcv.json',p.serialize());await fs.writeFile(out+'/baseline.json',JSON.stringify({scope:'Fresh project with original OpenCV sample images. No algorithm, mock runtime, prior answers, runs or human ground-truth labels.',workpieceCount:p.data.images.length,sources},null,2));
await fs.writeFile(out+'/prompt.txt','請用目前圖像源建立一個可重新執行的完整檢測方案：檢測白背景上的彩色小零件，分割、找輪廓，輸出物件數量、每個候選的面積與輪廓標記；同時要識別不適用的場景，避免把任何彩色圖片都當零件。這是用公開 OpenCV 圖片做工程研究，不是量產，我授權你自行提出試驗門檻並記錄來源及限制，不要假裝有人類真值或實際尺寸。請自行看圖選算法，節點按目的組合，保留可理解的前後資料關係。完成後先跑目前工件，再逐件跑完整圖像源，讀回結果與檢查原圖上的輪廓；將實算結果放回目前面板。不要只給文字、草稿或手畫結果，要讓我可以直接再執行。');
console.log(JSON.stringify({out,scheme:p.purposeScheme,images:sources.map(({name,sha256})=>({name,sha256}))}));
