// Opt-in real configured Pi/model integration; no CV execution and no GUI acceptance claim.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {Workspace} from '../src/workspace.js';
import {Agent} from '../src/agent.js';
const require=createRequire(import.meta.url),esbuild=require('esbuild');
const built=await esbuild.build({entryPoints:['src/visual-agent-controller.js'],bundle:true,write:false,platform:'node',format:'esm',loader:{'.css':'empty'},logLevel:'silent'});
const {VisualAgentController}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const output=path.resolve('../codex-audit-logs/20261102-focused-discussion/live-pi');fs.mkdirSync(output,{recursive:true});
const p=new Workspace();p.data=JSON.parse(fs.readFileSync('../codex-audit-logs/20261102-focused-discussion/verified-discussion.agentcv.json','utf8'));
const payload=JSON.parse(fs.readFileSync('../codex-audit-logs/20261102-focused-discussion/actual-question-payload.json','utf8'));
const board=p.ensureInquiry().boards.find(b=>b.id===payload.reference.boardId), beforeAlgorithms=JSON.stringify(p.data.algorithmRuns);
const controller=new VisualAgentController({project:p,view:{},sources:{catalog:()=>[]}});
const ui={page:()=>6,locked:()=>false,update(){},activity(){},reference:()=>payload.reference,visualContext:()=>controller.context(board.id),visualAction:(name,args,guard)=>controller.action(name,args,guard)};
const agent=new Agent(p,ui),events=[],tools=[],responses=[],outcome={status:'NOT_RUN',mode:'real configured Pi sidecar/model; actual UI-rendered fixed images and rectangle; headless integration, not native GUI acceptance',checks:{}};
const routes=[],turns=[];let child,finished=false,error=null,queue=Promise.resolve(),stderr='';
const safe=value=>JSON.parse(JSON.stringify(value,(k,v)=>['dataURL','dataUrl','base64','_visualImages'].includes(k)?undefined:typeof v==='string'?v.replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTED]').replace(/\b(?:sk-|sess-)[A-Za-z0-9_-]{8,}/g,'[REDACTED]'):v));
const log=value=>{events.push(safe(value));fs.writeFileSync(path.join(output,'events.ndjson'),events.map(e=>JSON.stringify(e)).join('\n')+'\n')};
const wait=async(predicate,ms)=>{const started=Date.now();while(!predicate()){if(Date.now()-started>ms)throw Error('Real Pi probe timed out');await new Promise(r=>setTimeout(r,50))}};
try{
 child=spawn(path.join(os.homedir(),'.local/bin/node'),[path.resolve('scripts/pi-bridge.mjs')],{cwd:path.resolve('runtime'),env:{...process.env,PI_OFFLINE:'1',PI_TELEMETRY:'0'},stdio:['pipe','pipe','pipe']});
 const execute=agent.execute.bind(agent);agent.execute=async(name,args)=>{tools.push({name,args});if(!['get_context','get_visual_context','get_visual_image','get_canvas_project_context','get_algorithm_run','get_canvas_artifact_groups'].includes(name))throw Error('本次授權只讀資料，禁止改方案或執行算法');const result=await execute(name,args);responses.push({name,args,result});return result};
 agent.wire=async command=>{log({direction:'host',command});child.stdin.write(JSON.stringify(command)+'\n')};
 child.stderr.on('data',chunk=>{stderr+=chunk;stderr=stderr.slice(-4000)});child.on('error',e=>error=e);child.on('exit',()=>{if(!finished)error||=Error('Pi bridge exited early')});
 let buffer='';child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line)continue;let event;try{event=JSON.parse(line)}catch{error=Error('Invalid bridge JSON');continue}log({direction:'pi',event});if(event.type==='session_route')routes.push(event);if(['fatal','agent_error','error'].includes(event.type)){outcome.modelError=safe(event);if(event.type==='fatal')error=Error(event.error||'Pi fatal')};queue=queue.then(()=>agent.event(event)).then(()=>{if(event.type==='ready')outcome.model={provider:agent.provider,model:agent.model};if(event.type==='turn_end')finished=true}).catch(e=>error=e)}});
 await wait(()=>agent.connected||error,30000);if(error)throw error;
 const thread=p.data.canvasThreads.find(t=>t.boardId===board.id), threadId=thread.id;
 async function runTurn(question){finished=false;const start=p.data.chat.length,turnId=crypto.randomUUID();p.beginCanvasThreadTurn(threadId,{id:turnId,sessionId:threadId,question,snapshot:payload.visual.snapshot,selection:[],chatStart:start});await agent.send(question,null,{...payload.visual,conversation:{threadId,turnId}});await wait(()=>finished||error,180000);await queue;if(error)throw error;if(agent.lastTurnError)throw Error(agent.lastTurnError.message);const text=p.data.chat.slice(start).filter(m=>m.role==='assistant').map(m=>m.text).join('\n');p.completeCanvasThreadTurn(threadId,turnId,{messages:p.data.chat.slice(start),status:'SENT',chatEnd:p.data.chat.length,runtimeSession:structuredClone(agent.lastRuntimeSession)});const result={threadId,turnId,text,route:structuredClone(agent.lastRuntimeSession)};turns.push(result);return result;}
 const first=await runTurn('這是對已固定圖的視覺討論，不能修改方案或執行算法。本輪代號「梧桐」。本輪包含一張畫板合成圖與兩張獨立引用圖。請根據真實像素簡短回答：第一張引用圖的矩形標記在哪裡、圈了什麼？第二張引用圖顯示什麼？看不清就直接說。請讀 get_visual_context 核對來源。');
 const second=await runTurn('接續上一輪，只用一句話回答本問題剛才的代號，以及矩形標記的對象。不要修改方案或執行算法。');
 outcome.turns=turns;outcome.tools=tools;outcome.checks={realImages:payload.visual.images.length===3,rectangleSent:payload.visual.snapshot.items.some(i=>i.annotations.some(a=>a.type==='rect')),readVisualContext:tools.some(t=>t.name==='get_visual_context'),sameThreadSameSession:first.route?.sessionId===second.route?.sessionId&&second.route?.sessionReused===true,remembers:second.text.includes('梧桐'),noAlgorithmMutation:JSON.stringify(p.data.algorithmRuns)===beforeAlgorithms,noToolErrors:!events.some(e=>e.command?.type==='tool_response'&&e.command?.result?.error)};
 outcome.status=outcome.modelError?'FAILED_MODEL':Object.values(outcome.checks).every(Boolean)?'PASSED':'PARTIAL';

}catch(e){outcome.status=outcome.modelError?'FAILED_MODEL':'FAILED';outcome.error=e.message}
finally{if(child){child.stdin.end();child.kill()}outcome.stderr=stderr;fs.writeFileSync(path.join(output,'outcome.json'),JSON.stringify(safe(outcome),null,2));fs.writeFileSync(path.join(output,'tool-results.json'),JSON.stringify(safe(responses),null,2));console.log(JSON.stringify({status:outcome.status,checks:outcome.checks,error:outcome.error,model:outcome.model,output},null,2));if(outcome.status!=='PASSED')process.exitCode=1;}
