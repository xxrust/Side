#!/usr/bin/env node
// Headless client of the SAME runAlgorithm/evidence API used by desktop Pi.
// GT is deliberately absent from this manifest and from dispatched requests.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Workspace} from '../src/workspace.js';
import {algorithmContext,runAlgorithm} from '../src/algorithm-workspace.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const cleanEnv=()=>({...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONUNBUFFERED:'1',OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',MKL_NUM_THREADS:'1'});
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
function keys(value,allowed,label){if(!record(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error(`${label} allows only ${allowed.join(', ')}; GT/labels belong exclusively to the external scorer`);}
export function validateBenchmarkManifest(value){
 keys(value,['schema','dataset','split','samples'],'manifest');if(value.schema!=='agentcv-blind-batch-1'||!Array.isArray(value.samples)||!value.samples.length)throw Error('Expected nonempty agentcv-blind-batch-1 samples');
 for(const field of ['dataset','split'])if(value[field]!==undefined&&typeof value[field]!=='string')throw Error(field+' must be a string');
 const ids=new Set();for(const sample of value.samples){keys(sample,['id','images'],'sample');if(typeof sample.id!=='string'||!sample.id||sample.id.length>240||ids.has(sample.id))throw Error('Sample ids must be unique nonempty strings');ids.add(sample.id);if(!Array.isArray(sample.images)||!sample.images.length||sample.images.length>100)throw Error('Each sample needs 1–100 genuine input images');for(const image of sample.images){keys(image,['path','role'],'input image');if(typeof image.path!=='string'||!image.path||image.role!==undefined&&typeof image.role!=='string')throw Error('Each input needs a file path and optional role');}}
 return value;
}
async function processJSON(executable,args,{cwd=root,input,timeoutMs=660000}={}){
 return new Promise((resolve,reject)=>{const child=spawn(executable,args,{cwd,env:cleanEnv(),stdio:['pipe','pipe','pipe']});let stdout='',stderr='',settled=false;const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Native process transport exceeded wall-clock budget'));},timeoutMs);child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',(code,signal)=>{clearTimeout(timer);if(settled)return;settled=true;if(code!==0)return reject(Error(`Native process failed (${code??signal}): ${stderr.slice(-3000)}`));try{resolve(JSON.parse(stdout.trim()))}catch{reject(Error('Invalid native JSON response: '+stdout.slice(-1000)+' '+stderr.slice(-1000)))}});child.stdin.end(input);});
}
export async function decodeBenchmarkImage(dataURL,{python=path.join(root,'runtime/python/bin/python3')}={}){
 const bytes=Buffer.from(dataURL.split(',')[1],'base64'),decoded=await processJSON(python,[path.join(root,'scripts/agentcv-image-decode.py')],{input:bytes});
 const rgba=Buffer.from(decoded.rgba,'base64'),gray=new Float32Array(decoded.width*decoded.height);for(let i=0;i<gray.length;i++)gray[i]=rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114;delete decoded.rgba;return {...decoded,gray};
}
async function writeJSON(file,value){await fs.writeFile(file,JSON.stringify(value,null,2)+'\n');}
const safeDirectory=(id,index)=>`${String(index).padStart(6,'0')}-${hash(id).slice(0,12)}`;
function mime(bytes){if(bytes[0]===137&&bytes.subarray(1,4).toString()==='PNG')return 'image/png';if(bytes[0]===255&&bytes[1]===216)return 'image/jpeg';if(bytes.subarray(0,4).toString()==='RIFF')return 'image/webp';if(bytes.subarray(0,2).toString()==='BM')return 'image/bmp';if(['II','MM'].includes(bytes.subarray(0,2).toString()))return 'image/tiff';throw Error('Unsupported original input image signature');}
export async function runBenchmarkBatch({manifest,manifestDirectory=process.cwd(),program,parameters={},justification,expectedOutputs,out,python=path.join(root,'runtime/python/bin/python3'),jobs=2,timeoutSeconds=120,title='Public-image benchmark prediction',saveWorkspaces=true,onProgress=()=>{}}){
 validateBenchmarkManifest(manifest);if(typeof program!=='string'||!program.trim())throw Error('A real Python program is required');if(!Number.isInteger(jobs)||jobs<1||jobs>8)throw Error('jobs must be 1–8');if(!record(parameters))throw Error('parameters must be a JSON object');
 out=path.resolve(out);await fs.mkdir(out,{recursive:true});const startedAt=new Date().toISOString(),rows=new Array(manifest.samples.length),codeSha256=hash(program),parametersSha256=hash(JSON.stringify(parameters));
 const savedManifest={...manifest,samples:manifest.samples.map(s=>({...s,images:s.images.map(i=>({...i,path:path.resolve(manifestDirectory,i.path)}))}))};
 await writeJSON(path.join(out,'blind-manifest.json'),savedManifest);await fs.writeFile(path.join(out,'algorithm.py'),program);await writeJSON(path.join(out,'parameters.json'),parameters);await writeJSON(path.join(out,'justification.json'),justification);await writeJSON(path.join(out,'expected-outputs.json'),expectedOutputs);
 const quote=v=>"'"+String(v).replaceAll("'","'\"'\"'")+"'";
 const rerun=['node',path.join(root,'scripts/agentcv-benchmark-batch.mjs'),'--manifest',path.join(out,'blind-manifest.json'),'--program',path.join(out,'algorithm.py'),'--parameters',path.join(out,'parameters.json'),'--justification',path.join(out,'justification.json'),'--expected-outputs',path.join(out,'expected-outputs.json'),'--out',out+'-rerun','--jobs',jobs,'--timeout',timeoutSeconds,'--python',python,...(saveWorkspaces?[]:['--no-workspaces'])].map(quote).join(' ');
 await fs.writeFile(path.join(out,'rerun.sh'),'#!/bin/sh\nset -eu\nexec '+rerun+'\n',{mode:0o755});
 const parameterFiles=[];async function scanFiles(value,key='parameters'){if(typeof value==='string'){try{const absolute=path.resolve(value),stat=await fs.stat(absolute);if(stat.isFile()){const bytes=await fs.readFile(absolute);parameterFiles.push({key,path:absolute,sha256:hash(bytes),bytes:bytes.length});}}catch{}}else if(Array.isArray(value)){for(let i=0;i<value.length;i++)await scanFiles(value[i],key+'.'+i)}else if(record(value)){for(const [k,v]of Object.entries(value))await scanFiles(v,key+'.'+k)}}await scanFiles(parameters);
 const environment=await processJSON(python,[path.join(root,'scripts/cv-runtime.py'),'--probe']);let next=0;
 async function worker(){while(next<manifest.samples.length){const index=next++,sample=manifest.samples[index],directory=path.join(out,'samples',safeDirectory(sample.id,index));await fs.mkdir(directory,{recursive:true});const at=performance.now(),inputs=[];let row={id:sample.id,index,status:'FAILED',directory,codeSha256,parametersSha256};
  try{
   const project=new Workspace();
   for(const [i,entry]of sample.images.entries()){const file=path.resolve(manifestDirectory,entry.path),bytes=await fs.readFile(file),kind=mime(bytes),name=`input-${i}${entry.role?'-'+entry.role.replace(/[^a-zA-Z0-9_-]/g,'_'):''}.${kind.split('/')[1]}`;inputs.push({path:file,role:entry.role||null,fileSha256:hash(bytes),byteLength:bytes.length});await project.addImages([{name,dataUrl:`data:${kind};base64,${bytes.toString('base64')}`,sourcePath:file}],v=>decodeBenchmarkImage(v,{python}));}
   // File paths and class labels are not included in the predictor-visible source.
   const context=algorithmContext(project,{imageIds:project.data.images.map(i=>i.id)});
   // This headless client deliberately applies the supplied author rationale to
   // each real sample. Bind only provenance; never rewrite reasons/results.
   const sampleJustification={...justification,meta:{...justification?.meta,sourceFingerprint:context.sourceFingerprint}};
   const args={title,mode:'draft',code:program,parameters_json:JSON.stringify(parameters),source:context.source,image_ids:project.data.images.map(i=>i.id),justification:sampleJustification,expected_outputs:expectedOutputs,timeout_seconds:timeoutSeconds};
   const run=await runAlgorithm(project,args,async request=>{const saved={...request,runId:randomUUID()},requestPath=path.join(directory,'request.json');await writeJSON(requestPath,saved);const receipt=await processJSON(python,[path.join(root,'scripts/cv-runtime.py'),'--run',requestPath,directory],{cwd:directory,timeoutMs:(timeoutSeconds+30)*1000});return JSON.parse(await fs.readFile(receipt.resultFile,'utf8'));});
   await writeJSON(path.join(directory,'run.json'),run);if(saveWorkspaces)await fs.writeFile(path.join(directory,'workspace.agentcv.json'),project.serialize());
   row={...row,status:run.status,runId:run.runId,result:run.result??null,evidenceStatus:run.evidenceAudit.status,traceNodes:run.procedureTrace?.nodes?.length||0,artifacts:run.artifacts.map(({dataURL,dataUrl,data,...a})=>a),error:run.error||null,runFile:path.join(directory,'run.json'),workspaceFile:saveWorkspaces?path.join(directory,'workspace.agentcv.json'):null};
  }catch(error){row.error={message:error.message,code:error.code||null,details:error.errors||null};await writeJSON(path.join(directory,'transport-error.json'),row.error);}
  row.inputs=inputs;row.wallDurationMs=performance.now()-at;rows[index]=row;await writeJSON(path.join(directory,'batch-row.json'),row);onProgress(row);
 }}
 await Promise.all(Array.from({length:Math.min(jobs,manifest.samples.length)},worker));
 const result={schema:'agentcv-blind-batch-result-1',dataset:manifest.dataset||null,split:manifest.split||null,startedAt,finishedAt:new Date().toISOString(),samples:rows.length,succeeded:rows.filter(r=>r.status==='SUCCEEDED').length,failed:rows.filter(r=>r.status!=='SUCCEEDED').length,codeSha256,parametersSha256,manifestSha256:hash(JSON.stringify(savedManifest)),justificationSha256:hash(JSON.stringify(justification)),expectedOutputsSha256:hash(JSON.stringify(expectedOutputs)),parameterFiles,rerunCommand:rerun,environment,rows,scope:'Actual runAlgorithm + cv-runtime executions. Evidence audit is not GT accuracy. GT is absent from the dispatch manifest; this is operational separation, not an OS file-access sandbox.'};
 await writeJSON(path.join(out,'batch-results.json'),result);await fs.writeFile(path.join(out,'batch-results.sha256'),hash(await fs.readFile(path.join(out,'batch-results.json')))+'  batch-results.json\n');await fs.writeFile(path.join(out,'batch-summary.csv'),'id,status,run_id,wall_duration_ms,trace_nodes,evidence_status,error\n'+rows.map(r=>[r.id,r.status,r.runId||'',r.wallDurationMs,r.traceNodes||0,r.evidenceStatus||'',r.error?.message||''].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n')+'\n');return result;
}
async function main(){const args=process.argv.slice(2),option=(key,fallback)=>{const at=args.indexOf('--'+key);return at<0?fallback:args[at+1]};if(args.includes('--help')){console.log('node scripts/agentcv-benchmark-batch.mjs --manifest FILE --program PY --parameters JSON --justification JSON --expected-outputs JSON --out DIR [--jobs 2] [--timeout 120] [--python PYTHON] [--no-workspaces]');return;}
 const file=path.resolve(option('manifest','')),load=async key=>JSON.parse(await fs.readFile(path.resolve(option(key,'')),'utf8'));
 const result=await runBenchmarkBatch({manifest:await load('manifest'),manifestDirectory:path.dirname(file),program:await fs.readFile(path.resolve(option('program','')),'utf8'),parameters:await load('parameters'),justification:await load('justification'),expectedOutputs:await load('expected-outputs'),out:option('out'),jobs:Number(option('jobs',2)),timeoutSeconds:Number(option('timeout',120)),python:option('python',path.join(root,'runtime/python/bin/python3')),saveWorkspaces:!args.includes('--no-workspaces'),onProgress:r=>process.stderr.write(JSON.stringify({sample:r.id,status:r.status,wallDurationMs:r.wallDurationMs,error:r.error?.message})+'\n')});console.log(JSON.stringify({resultFile:path.join(path.resolve(option('out')),'batch-results.json'),samples:result.samples,succeeded:result.succeeded,failed:result.failed}));if(result.failed)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
