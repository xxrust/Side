// Re-executes a real saved Agent-authored scheme through the resident Rust host.
// Repeated samples measure execution endurance, never independent accuracy.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {Workspace} from '../src/workspace.js';
import {runDatasetScheme} from '../src/workpiece-runner.js';
import {decodeBenchmarkImage} from './agentcv-benchmark-batch.mjs';
const [inputFile,outPath,countArg]=process.argv.slice(2),root=path.resolve(import.meta.dirname,'..');
if(!inputFile||!outPath)throw Error('Usage: node scripts/replay-harness-native.mjs REAL_PROJECT OUTPUT_DIR [TOTAL_UNITS]');
const out=path.resolve(outPath),saved=JSON.parse(await fs.readFile(inputFile,'utf8')),count=countArg===undefined?null:Number(countArg);
if(count!==null&&(!Number.isSafeInteger(count)||count<1||count>10000))throw Error('COUNT must be 1–10000');
await fs.mkdir(out,{recursive:true});try{await fs.access(out+'/report.json');throw Error('Use a new output directory; evidence already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
const p=new Workspace(),ids=new Map();
for(const image of saved.images){if(!image.dataURL)throw Error('Native replay requires original inline image bytes in this benchmark export');await p.addImages([{name:image.name,dataUrl:image.dataURL}],decodeBenchmarkImage);ids.set(image.id,p.data.images.at(-1).id);}
const scheme=structuredClone(saved.purposeScheme);if(!scheme)throw Error('No real scheme to replay');for(const [slot,id]of Object.entries(scheme.execution.referenceInputs||{}))scheme.execution.referenceInputs[slot]=ids.get(id);p.data.purposeScheme=scheme;
const refs=new Set(Object.values(scheme.execution.referenceInputs||{})),images=p.data.images.filter(i=>!refs.has(i.id));if(!images.length)throw Error('No workpieces');
const compilation=p.validatePurposeScheme();if(!compilation.ok)throw Error(JSON.stringify(compilation.errors));
const pending=new Map(),child=spawn(process.env.AGENTCV_NATIVE_BINARY||root+'/src-tauri/target/release/agentcv-desktop',['--cv-resident-headless'],{stdio:['pipe','pipe','pipe']});let sequence=0,dispatched=0,maxRetainedRuns=0,maxRss=0;
child.stderr.on('data',b=>fs.appendFile(out+'/native-stderr.log',b).catch(()=>{}));
createInterface({input:child.stdout}).on('line',line=>{try{const m=JSON.parse(line),promise=pending.get(m.id);if(!promise)return;pending.delete(m.id);m.error?promise.reject(Error(m.error)):promise.resolve(m.result);}catch(error){for(const promise of pending.values())promise.reject(error);pending.clear();}});
child.on('error',error=>{for(const promise of pending.values())promise.reject(error);pending.clear();});child.on('exit',code=>{for(const promise of pending.values())promise.reject(Error('Native host exited '+code));pending.clear();});
const send=(op,extra)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,op,...extra})+'\n');});
const report={scope:'Actual resident Rust host, actual Python/OpenCV and native durable storage. No LLM per workpiece. Repeated original images are endurance samples, not independent regression or accuracy evidence.',inputFile,uniqueImages:images.map(i=>({name:i.name,sha256:i.sha256})),requestedUnits:count??images.length,compilation,rows:[]},start=performance.now();
try{
 const workspace=out+'/workspace';await send('save_workspace',{root:workspace,project:JSON.parse(p.serialize())});
 const units=Array.from({length:count??images.length},(_,i)=>({id:'native-'+String(i+1).padStart(6,'0'),imageIds:[images[i%images.length].id]}));
 const result=await runDatasetScheme(p,request=>{dispatched++;return send('execute',{request});},{units,artifactMode:'references',saveUnitResult:async payload=>{
  const receipt=await send('save_unit',{request:{...payload,workspaceRoot:workspace}});
  const image=p.data.images.find(i=>i.id===payload.unit.imageIds[0]),row={unitId:payload.unit.id,image:image.name,result:payload.record.result,execution:payload.record.execution,timing:payload.record.timing,contractAudits:payload.runs.map(r=>({nodeId:r.schemeNodeId,valid:r.dataContractAudit?.valid,checked:r.dataContractAudit?.checked,errors:r.dataContractAudit?.errors})),recordRef:receipt.recordRef};
  maxRetainedRuns=Math.max(maxRetainedRuns,p.data.algorithmRuns.length);maxRss=Math.max(maxRss,process.memoryUsage().rss);report.rows.push(row);await fs.appendFile(out+'/units.jsonl',JSON.stringify(row)+'\n');
  if(report.rows.length===1||report.rows.length%50===0||report.rows.length===units.length)console.log(JSON.stringify({processed:report.rows.length,total:units.length,status:row.execution.status,retainedRuns:p.data.algorithmRuns.length,rssMB:Math.round(process.memoryUsage().rss/1048576)}));return receipt;
 }});
 report.execution=result.execution;report.dispatched=dispatched;report.elapsedMs=performance.now()-start;report.maxRetainedRuns=maxRetainedRuns;report.maxHostRssBytes=maxRss;report.status=result.execution.processed===units.length&&result.execution.counts.execution.FAULT===0&&report.rows.every(r=>r.contractAudits.every(a=>a.valid))?'EXECUTED_REVIEW_REQUIRED':'FAILED';
 await fs.writeFile(out+'/completed.agentcv.json',p.serialize());
}catch(error){report.status='FAILED';report.error=error.stack;process.exitCode=1;}finally{child.stdin.end();await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error,elapsedMs:report.elapsedMs,dispatched:report.dispatched,timing:report.execution?.timing}));if(report.status==='FAILED')process.exitCode=1;}
