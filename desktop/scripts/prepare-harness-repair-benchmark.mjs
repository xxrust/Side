// Isolated, deliberately broken graph around a saved real Pi/OpenCV program.
// Imports original image bytes afresh; never reuses runs, answers or output images.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Workspace} from '../src/workspace.js';
import {decodeBenchmarkImage} from './agentcv-benchmark-batch.mjs';
const [sourceFile,outputDirectory]=process.argv.slice(2);
if(!sourceFile||!outputDirectory)throw Error('Usage: node scripts/prepare-harness-repair-benchmark.mjs SAVED_REAL_PROJECT OUTPUT_DIRECTORY');
const saved=JSON.parse(await fs.readFile(sourceFile,'utf8')),out=path.resolve(outputDirectory),p=new Workspace(),ids=new Map();
await fs.mkdir(out,{recursive:true});
const board=p.ensureProjectCanvas(),referenceIds=new Set(Object.values(saved.purposeScheme.execution.referenceInputs));
for(const image of [...saved.images.filter(i=>!referenceIds.has(i.id)),...saved.images.filter(i=>referenceIds.has(i.id))]){
 await p.addImages([{name:image.name,dataUrl:image.dataURL}],decodeBenchmarkImage);ids.set(image.id,p.data.images.at(-1).id);
}
const workpieceIds=saved.images.filter(i=>!referenceIds.has(i.id)).map(i=>ids.get(i.id));
p.bindCanvasImages(board.id,board.projectSpaces.sources[0].id,workpieceIds);
const reference=p.addCanvasSource(board.id,{title:'固定參考',imageIds:[...referenceIds].map(id=>ids.get(id))});
p.bindCanvasImages(board.id,reference.id,[...referenceIds].map(id=>ids.get(id)));
await p.selectImage(workpieceIds[0]);
const scheme=structuredClone(saved.purposeScheme);
for(const [slot,id]of Object.entries(scheme.execution.referenceInputs))scheme.execution.referenceInputs[slot]=ids.get(id);
const baseline=structuredClone(scheme);
scheme.operatorGraph.edges.push({from:'missing-producer-for-controlled-benchmark',to:scheme.operatorGraph.nodes[0].id});
p.data.purposeScheme=scheme;
await fs.writeFile(out+'/input.agentcv.json',p.serialize());
await fs.writeFile(out+'/baseline.json',JSON.stringify({scope:'One deliberate dangling dependency; all algorithm code/parameters/classification come from prior real Pi project. Sources imported from original PNGs; no execution results copied.',sourceFile,scheme:baseline,sourceHashes:p.data.images.map(i=>({name:i.name,sha256:i.sha256,contentSha256:i.contentSha256})),workpieceCount:workpieceIds.length,codeHashes:baseline.operatorGraph.nodes.map(n=>({id:n.id,sha256:createHash('sha256').update(n.code).digest('hex')}))},null,2));
await fs.writeFile(out+'/prompt.txt','這個專案目前無法執行檢測，請你直接查平台回饋並修好。這次只修正方案結構，不要改現有算法程式、參數、固定參考或分類門檻，也不要用草稿繞過完整流程。修好後先執行目前工件，再逐件跑完待檢圖像源，讀回結果，告訴我哪些圖片支持平面映射、哪些不支持，以及你實際修了什麼。固定參考不是待檢工件，不計入圖集檢測數量。請將真實結果留在目前畫板，我要能看圖核對。這是工程測試，不要聲稱正式生產驗收。');
console.log(JSON.stringify({out,images:p.data.images.length,workpieces:workpieceIds.length,compileErrors:p.validatePurposeScheme().errors.map(e=>e.code)}));
