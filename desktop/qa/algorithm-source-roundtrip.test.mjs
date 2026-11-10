// Real image bytes -> live context -> installed Pi TypeBox validator -> native
// resident dispatcher -> OpenCV PNG. No model response or algorithm result stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {Workspace} from '../src/workspace.js';
import {algorithmContext,runAlgorithm} from '../src/algorithm-workspace.js';
import {agentTools} from '../src/agent-contract.js';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),{loadImage,createCanvas}=require('../../qa/node_modules/@napi-rs/canvas');
const sha=b=>createHash('sha256').update(b).digest('hex');
const audit=path.resolve(root,'../codex-audit-logs/20261102-source-contract');
async function decode(url){const bytes=Buffer.from(url.split(',')[1],'base64'),im=await loadImage(bytes),canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);const rgba=ctx.getImageData(0,0,im.width,im.height).data,gray=new Float32Array(im.width*im.height);for(let i=0;i<gray.length;i++)gray[i]=rgba[4*i]*.299+rgba[4*i+1]*.587+rgba[4*i+2]*.114;return {width:im.width,height:im.height,rgba,gray,sha256:sha(rgba),contentSha256:sha(bytes)};}
async function validator(){const entry=process.env.AGENTCV_PI_ENTRY||path.join(os.homedir(),'.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js'),req=createRequire(entry),{Type}=await import(pathToFileURL(req.resolve('typebox'))),{Check}=await import(pathToFileURL(req.resolve('typebox/value'))),bridge=await fs.readFile(path.join(root,'scripts/pi-bridge.mjs'),'utf8'),code=bridge.slice(bridge.indexOf('function typed(s)'),bridge.search(/\n(?:let|const) profile=/)),typed=Function('Type',code+';return typed')(Type),schema=typed(agentTools.find(t=>t.function.name==='run_algorithm').function.parameters);return args=>Check(schema,args);}
function native(){const child=spawn(path.join(root,'src-tauri/target/release/agentcv-desktop'),['--cv-resident-headless'],{stdio:['pipe','pipe','pipe']}),pending=new Map();let seq=0,stderr='';child.stderr.on('data',b=>stderr+=b);createInterface({input:child.stdout}).on('line',s=>{const m=JSON.parse(s),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(typeof m.error==='string'?m.error:JSON.stringify(m.error))):p.resolve(m.result);}});child.on('exit',code=>{for(const p of pending.values())p.reject(Error(`Native exited ${code}: ${stderr}`));pending.clear();});return {call:request=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,op:'execute',request})+'\n');}),close:()=>child.stdin.end()};}
function request(p){const c=algorithmContext(p);return {title:'來源接口驗證：Otsu 分割',mode:'draft',image_ids:[p.image.id],source:c.source,parameters_json:'{}',code:"threshold, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)\nsave_image('mask', mask)\nresult = {'threshold': float(threshold), 'foreground': int(np.count_nonzero(mask))}",expected_outputs:[{id:'mask',type:'image',role:'result'}],justification:{tool:{reason:'真實灰階直方圖以 Otsu 形成二值圖，驗證來源契約與實算接口，不宣稱水果語義分割有效。',expectedEvidence:[{kind:'artifact',type:'image',id:'mask'}]},parameters:[],boundaries:[{condition:'此測試只檢查程式能讀原圖並產生實算輸出，並非分割品質驗收。',check:{kind:'execution-status',allowed:['OK']},onFailure:'STOP'}],meta:{sourceFingerprint:c.sourceFingerprint}}};}
test('context round trips through actual Pi schema for legacy and content-addressed original images; real native execution and stale guards',async t=>{
 await fs.mkdir(audit,{recursive:true});const valid=await validator(),p=new Workspace(),bytes=await fs.readFile(path.resolve(root,'../research/opencv-traditional-10-2026-10-25/assets/extra-fruits.png'));
 await p.addImages([{name:'extra-fruits.png',dataUrl:'data:image/png;base64,'+bytes.toString('base64')}],decode);
 const legacy=request(p);assert.ok(legacy.source.images[0].pixelFingerprint);assert.ok(valid(legacy),'legacy context must be accepted');
 const missing=structuredClone(legacy);delete missing.source.images[0].assetFingerprint;assert.equal(valid(missing),false);
 const saved=JSON.parse(await fs.readFile(path.resolve(root,'../codex-audit-logs/20261102-focused-discussion/verified-discussion.agentcv.json'),'utf8'));
 p.data.purposeScheme=structuredClone(saved.purposeScheme);const canonical=request(p);assert.equal(canonical.source.images[0].contentSha256,sha(bytes));assert.ok(valid(canonical),'inline workpiece-plan context must also round trip');delete p.data.purposeScheme;
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-source-roundtrip-'));t.after(()=>fs.rm(tmp,{recursive:true,force:true}));await fs.mkdir(path.join(tmp,'assets'));const relative=`assets/${sha(bytes)}.png`;await fs.writeFile(path.join(tmp,relative),bytes);
 p.image.assetRef={root:tmp,$asset:relative,mime:'image/png',sha256:sha(bytes),size:bytes.length};p.image.dataURL='';p.imageStore.configure({readAsset:async ref=>'data:image/png;base64,'+(await fs.readFile(path.join(ref.root,ref.$asset))).toString('base64')});
 const content=request(p);assert.equal(content.source.images[0].contentSha256,sha(bytes));assert.equal(content.source.images[0].pixelFingerprint,undefined);assert.ok(valid(content),'contentSha256 returned by context must be accepted unchanged by Pi');
 for(const bad of [(()=>{const a=structuredClone(content);delete a.source.images[0].contentSha256;return a;})(),(()=>{const a=structuredClone(content);a.source.images[0].contentSha256='invented';return a;})()])assert.equal(valid(bad),false);
 const host=native();t.after(()=>host.close());let calls=0;const execute=r=>{calls++;return host.call(r);};
 const before=JSON.stringify(p.data.purposeScheme);const run=await runAlgorithm(p,content,execute);assert.equal(run.status,'SUCCEEDED');assert.equal(run.evidenceAudit.status,'READY_FOR_REVIEW');assert.equal(JSON.stringify(p.data.purposeScheme),before);assert.equal(run.sourceBinding.images[0].contentSha256,sha(bytes));const mask=run.artifacts.find(a=>a.id==='mask');assert.ok(mask);assert.equal(mask.width,p.image.width);assert.equal(mask.height,p.image.height);
 await fs.writeFile(path.join(audit,'actual-run.json'),JSON.stringify(run,null,2));if(mask.dataUrl||mask.dataURL)await fs.writeFile(path.join(audit,'actual-mask.png'),Buffer.from((mask.dataUrl||mask.dataURL).split(',')[1],'base64'));
 const tampered=structuredClone(content);tampered.source.images[0].contentSha256='0'.repeat(64);assert.ok(valid(tampered));await assert.rejects(runAlgorithm(p,tampered,execute),e=>e.code==='ALGORITHM_SOURCE_STALE');assert.equal(calls,1);
 const missingMetadata=structuredClone(content);missingMetadata.justification.meta.sourceFingerprint='old-source';await assert.rejects(runAlgorithm(p,missingMetadata,execute),e=>e.code==='JUSTIFICATION_SOURCE_MISMATCH');assert.equal(calls,1);
 const actualBytes=await fs.readFile(path.join(tmp,relative));await fs.writeFile(path.join(tmp,relative),Buffer.concat([actualBytes,Buffer.from('changed')]));await assert.rejects(runAlgorithm(p,content,execute),/內容雜湊不一致/);assert.equal(calls,1);
 console.log(JSON.stringify({sourceHash:sha(bytes),runId:run.runId,status:run.status,mask:{width:mask.width,height:mask.height},result:run.result,guards:'missing identity, forged/stale source, stale justification, changed file bytes rejected'}));
});
