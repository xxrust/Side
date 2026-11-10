#!/usr/bin/env node
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {AgentOps} from '../src/agent-ops.js';
let [command,...args]=process.argv.slice(2);
// Cloud PR #1 aliases → Codex surface
if(command==='run-all'){command='run';if(!args.includes('--all'))args=['--all',...args];}
if(command==='inspect')command='status';
const option=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
const file=resolve(option('project','project.agentcv.json'));
try{
 let algorithms={};const adapter=option('adapter');if(adapter)algorithms=(await import(pathToFileURL(resolve(adapter)).href)).default;
 const ops=new AgentOps(undefined,algorithms);
 if(command!=='init')ops.load(await readFile(file,'utf8'));
 let result;
 const input=async()=>JSON.parse(await readFile(resolve(option('input')),'utf8'));
 switch(command){
 case 'init':result={status:'created'};break;
 case 'create':case 'accept':result=ops.accept(await input());break;
 case 'revise':result=option('edge')?ops.reviseEdge(option('edge'),await input()):ops.revise(option('node'),await input());break;
 case 'workspace':ops.setWorkspace(await input());result={status:'accepted'};break;
 case 'remove':result=ops.remove(await input());break;
 case 'reject':result=ops.reject(await input(),option('edge'));break;
 case 'run':if(!args.includes('--all')&&!option('node'))throw Error('run requires --all or --node ID');result=await ops.run(option('node',null));break;
 case 'status':result=ops.snapshot();break;
 case 'validate':result=ops.validate(await input());break;
 case 'report':result=ops.report().json;break;
 default:throw Error('Usage: agentcv init|create|accept|revise|remove|reject|run|run-all|status|inspect|validate|report --project FILE [--input JSON] [--node ID|--all] [--adapter MODULE] [--out DIR]');
 }
 if(result?.status==='invalid_proposal'){console.log(JSON.stringify(result,null,2));process.exitCode=2;}
 else if(!['status','validate','report'].includes(command)){await mkdir(resolve(file,'..'),{recursive:true});await writeFile(file+'.tmp',ops.save());await rename(file+'.tmp',file);}
 if(command==='run'||command==='report'){
 const out=resolve(option('out',join('runs',new Date().toISOString().replace(/[:.]/g,'-'))));await mkdir(out,{recursive:true});const report=ops.report();
 await Promise.all([writeFile(join(out,'runs.json'),JSON.stringify(report.json,null,2)+'\n'),writeFile(join(out,'report.html'),report.html),writeFile(join(out,'report.svg'),report.svg)]);result={...result,artifacts:out};
 }
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
