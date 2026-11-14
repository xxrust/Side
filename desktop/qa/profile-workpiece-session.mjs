// Production JS/Rust/Python diagnostic. This excludes the WebView and is NOT
// the click-to-visible-image acceptance gate. Never writes the source project.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';
import {Workspace} from '../src/workspace.js';
import {runDatasetScheme} from '../src/workpiece-runner.js';
import {inspectRgbaInput} from '../src/input-inspection.js';
import {restoreSharedNativeFacts} from '../src/shared-facts.js';
import {sealParsedNativeExecutionFacts} from '../src/execution-facts.js';

const [sessionFile, executable, outputDirectory, countArg='6',wire='full']=process.argv.slice(2);
assert.ok(sessionFile&&executable&&outputDirectory,'Usage: node qa/profile-workpiece-session.mjs session.json desktop-binary NEW-output-directory [count]');
assert.ok(['full','compact'].includes(wire));
const count=Number(countArg);assert.ok(Number.isSafeInteger(count)&&count>=2);
const out=path.resolve(outputDirectory);
await fs.mkdir(out); // Refuse to overwrite a previous observation.
const source=JSON.parse(await fs.readFile(sessionFile,'utf8'));
const data=source.project||source, hashes=data.purposeScheme.operatorGraph.nodes.map(n=>({id:n.id,sha256:createHash('sha256').update(n.code).digest('hex')}));
const assetRoot=path.join(out,'inputs');await fs.mkdir(assetRoot);
const inputRoots=new Set(data.images.filter(i=>i.assetRef).map(i=>i.assetRef.root));
assert.ok(inputRoots.size<=1,'Use separate asset workspaces for multiple original roots');
for(const root of inputRoots)await fs.copyFile(path.join(root,'manifest.agentcv.json'),path.join(assetRoot,'manifest.agentcv.json'));
for(const image of data.images){
 if(!image.assetRef)continue;
 const ref=image.assetRef,bytes=await fs.readFile(path.join(ref.root,ref.$asset));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),ref.sha256);
 const dest=path.join(assetRoot,ref.$asset);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);ref.root=assetRoot;
}
await fs.writeFile(path.join(out,'specimen.json'),JSON.stringify({source:path.resolve(sessionFile),imageId:data.activeId,operators:hashes,schemeSha256:createHash('sha256').update(JSON.stringify(data.purposeScheme)).digest('hex'),executable:path.resolve(executable),executableSha256:createHash('sha256').update(await fs.readFile(executable)).digest('hex'),scope:'Unchanged source/parameters and original encoded image bytes; isolated input copies and synchronous durable output records; excludes native WebView IPC, display, and navigation.'},null,2));
const require=createRequire(import.meta.url),{loadImage,createCanvas}=require('../../qa/node_modules/@napi-rs/canvas');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function decode(url){
 const bytes=Buffer.from(url.split(',')[1],'base64'),image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,image.width,image.height);ctx.drawImage(image,0,0);
 const rgba=ctx.getImageData(0,0,image.width,image.height).data,inputInspection=inspectRgbaInput(rgba),gray=Float32Array.from({length:image.width*image.height},(_,i)=>inputInspection.achromatic?rgba[i*4]:rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114);
 return {width:image.width,height:image.height,rgba,gray,sha256:sha(rgba),decodedSha256:sha(rgba),contentSha256:sha(bytes),inputInspection};
}
const project=new Workspace();project.imageStore.configure({readAsset:async ref=>'data:'+ref.mime+';base64,'+(await fs.readFile(path.join(ref.root,ref.$asset))).toString('base64')});
await project.load(data,decode);
const runtime=path.join(out,'runtime');await fs.mkdir(runtime);
const child=spawn(path.resolve(executable),['--cv-resident-headless'],{env:{...process.env,AGENTCV_RUNTIME_ROOT:runtime,AGENTCV_PYTHON:path.resolve('runtime/python/bin/python3')},stdio:['pipe','pipe','pipe']});
let sequence=0,stderr='',fatal;const pending=new Map();
child.stderr.on('data',chunk=>stderr+=chunk);
const fail=error=>{fatal=error;for(const {reject} of pending.values())reject(error);pending.clear();};
child.on('error',fail);child.on('exit',code=>{if(pending.size)fail(Error('Native exit '+code+': '+stderr));});
createInterface({input:child.stdout}).on('line',line=>{try{const response=JSON.parse(line),waiter=pending.get(response.id);assert.ok(waiter);pending.delete(response.id);response.error?waiter.reject(Error(response.error)):waiter.resolve(response.result);}catch(e){fail(e);}});
const call=(op,request,extra={})=>new Promise((resolve,reject)=>{if(fatal)return reject(fatal);const id=++sequence;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,op,request,...extra})+'\n');});
const report={scope:'Headless diagnostic only: no image-display performance claim',wire,runs:[],operators:hashes};
try{
 // Start a new real record workspace; recovery snapshots may contain pointers
 // to historical records that intentionally were not copied into this run.
 await call('save_workspace',null,{root:path.join(out,'records'),project:new Workspace().data});
 for(let i=0;i<count;i++){
  const began=performance.now();let raw;
  const result=await runDatasetScheme(project,r=>call('execute',r),{units:[{id:randomUUID(),imageIds:[project.image.id]}],artifactMode:'inspection',fileBackedInputs:true,
   executeSession:async request=>{raw=await call(wire==='compact'?'execute_session_wire':'execute_session',request);const at=performance.now(),shared=restoreSharedNativeFacts(raw);sealParsedNativeExecutionFacts(raw);raw.timing.hostFactRestore={links:shared.links,totalMs:performance.now()-at};delete raw._responseEncoding;return raw;},
   nativeCommit:{workspaceRoot:path.join(out,'records'),cleanupRuntime:true,mode:'synchronous'},
   artifactRetention:{mode:'metadata'},saveUnitResult:async(_product,{nativeReceipt})=>{assert.equal(nativeReceipt?.status,'SAVED');return nativeReceipt;}});
  const wallMs=performance.now()-began;
  await fs.writeFile(path.join(out,'last-native-response.json'),JSON.stringify(raw));
  assert.equal(result.execution.counts.execution.FAULT,0,JSON.stringify(result.execution.units));
  const row={index:i,cold:i===0,wallMs,units:result.execution.units,timing:raw.timing,nodes:raw.runs.map(r=>({id:r.schemeNodeId,result:r.result,timing:r.timing,artifacts:r.artifacts.map(a=>({id:a.id,type:a.type,sha256:a.sha256,width:a.width,height:a.height}))}))};
  report.runs.push(row);await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({index:i,wallMs,nodes:row.nodes.map(n=>({id:n.id,timing:n.timing}))}));
 }
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{child.stdin.end();await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(out,'native-stderr.log'),stderr);}
if(report.error)console.error(report.error);
