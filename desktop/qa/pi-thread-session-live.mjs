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
const output=path.resolve('../reviews/2026-10-28-thread-groups/live-pi');fs.mkdirSync(output,{recursive:true});
const p=new Workspace();p.data=JSON.parse(fs.readFileSync('../reviews/2026-10-27-program-flow/actual-pi-workspace-portable.agentcv.json','utf8'));
const beforeChatCount=p.data.chat.length,beforeAlgorithms=JSON.stringify(p.data.algorithmRuns),image=p.data.images[0];
p.workflow.references.push({id:'live-engineering-note',name:'讀取測試工程備註',status:'TEXT',text:'此備註僅適用參考資料空間連線所指定的圖像源。工程校驗詞：紫杉。沒有尺寸公差，不可判定產品合格。'});
const board=p.ensureProjectCanvas(),a=board.projectSpaces.sources[0],ref=board.projectSpaces.references[0];
p.updateCanvasSpace(board.id,a.id,{title:'現場相機A'});const b=p.addCanvasSource(board.id,{title:'對照相機B',imageIds:[image.id]});
p.updateCanvasSpace(board.id,ref.id,{title:'工程限制',text:'請保留兩個來源的不同適用範圍。'});
const added=p.addInquiryImage({kind:'original',label:image.name,width:image.width,height:image.height,dataURL:image.dataURL,source:{imageId:image.id,inputSha256:image.sha256,coordinateSpace:'original-image-pixels'}},{boardId:board.id});
p.addInquiryAnnotation(board.id,added.item.id,{type:'line',points:[{x:13,y:17},{x:47,y:39}],text:'工程師指出的位置'});
for(const asset of p.data.visualInquiry.assets.filter(asset=>asset.source?.runId))p.addInquiryImage(asset,{boardId:board.id});
const controller=new VisualAgentController({project:p,view:{},sources:{catalog:()=>[]}});
const ui={page:()=>6,locked:()=>false,update(){},activity(){},reference:()=>null,visualContext:()=>controller.context(board.id),visualAction:(name,args,guard)=>controller.action(name,args,guard)};
const agent=new Agent(p,ui),events=[],tools=[],responses=[],outcome={status:'NOT_RUN',mode:'real configured Pi sidecar/model, headless source/reference context only',checks:{},fixture:{boardId:board.id,imageId:image.id,sourceA:a.id,sourceB:b.id,itemId:added.item.id}};
const routes=[],turns=[];let child,finished=false,error=null,queue=Promise.resolve(),stderr='';
const safe=value=>JSON.parse(JSON.stringify(value,(k,v)=>['dataURL','dataUrl','base64','_visualImages'].includes(k)?undefined:typeof v==='string'?v.replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTED]').replace(/\b(?:sk-|sess-)[A-Za-z0-9_-]{8,}/g,'[REDACTED]'):v));
const log=value=>{events.push(safe(value));fs.writeFileSync(path.join(output,'events.ndjson'),events.map(e=>JSON.stringify(e)).join('\n')+'\n')};
const wait=async(predicate,ms)=>{const started=Date.now();while(!predicate()){if(Date.now()-started>ms)throw Error('Real Pi probe timed out');await new Promise(r=>setTimeout(r,50))}};
try{
 child=spawn(path.join(os.homedir(),'.local/bin/node'),[path.resolve('scripts/pi-bridge.mjs')],{cwd:path.resolve('runtime'),env:{...process.env,PI_OFFLINE:'1',PI_TELEMETRY:'0'},stdio:['pipe','pipe','pipe']});
 const execute=agent.execute.bind(agent);agent.execute=async(name,args)=>{tools.push({name,args});if(!['get_context','get_visual_context','get_canvas_project_context','read_reference','get_canvas_artifact_groups','group_canvas_artifacts','add_canvas_image_label'].includes(name))throw Error('本次授權只讀資料，禁止改方案或執行算法');const result=await execute(name,args);responses.push({name,args,result});return result};
 agent.wire=async command=>{log({direction:'host',command});child.stdin.write(JSON.stringify(command)+'\n')};
 child.stderr.on('data',chunk=>{stderr+=chunk;stderr=stderr.slice(-4000)});child.on('error',e=>error=e);child.on('exit',()=>{if(!finished)error||=Error('Pi bridge exited early')});
 let buffer='';child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line)continue;let event;try{event=JSON.parse(line)}catch{error=Error('Invalid bridge JSON');continue}log({direction:'pi',event});if(event.type==='session_route')routes.push(event);if(['fatal','agent_error','error'].includes(event.type)){outcome.modelError=safe(event);if(event.type==='fatal')error=Error(event.error||'Pi fatal')};queue=queue.then(()=>agent.event(event)).then(()=>{if(event.type==='ready')outcome.model={provider:agent.provider,model:agent.model};if(event.type==='turn_end')finished=true}).catch(e=>error=e)}});
 await wait(()=>agent.connected||error,30000);if(error)throw error;
 const runId=p.data.algorithmRuns.at(-1).runId,keyword='雲杉-'+crypto.randomUUID().slice(0,8);
 async function runTurn(question,threadId,turnId,extra={}){finished=false;const start=p.data.chat.length,snapshot=p.captureInquirySnapshot(board.id);if(!(p.data.canvasThreads||[]).some(t=>t.id===threadId))p.createCanvasThread({id:threadId,boardId:board.id,snapshot,selection:[],question:'',x:50,y:50});p.beginCanvasThreadTurn(threadId,{id:turnId,sessionId:threadId,question,snapshot,selection:[],chatStart:start});await agent.send(question,null,{conversation:{threadId,turnId},...extra});await wait(()=>finished||error,180000);await queue;if(error)throw error;if(agent.lastTurnError)throw Error(agent.lastTurnError.message);const text=p.data.chat.slice(start).filter(m=>m.role==='assistant').map(m=>m.text).join('\n');const messages=p.data.chat.slice(start).filter(m=>m.canvasThreadId===threadId&&m.canvasTurnId===turnId);p.completeCanvasThreadTurn(threadId,turnId,{messages,status:'SENT',chatEnd:p.data.chat.length,runtimeSession:structuredClone(agent.lastRuntimeSession)});const result={threadId,turnId,text,route:structuredClone(agent.lastRuntimeSession)};turns.push(result);return result;}
 const first=await runTurn(`這是本問題的工程代號：${keyword}。請記在本對話中，不要加進專案資料。現在讀畫板 ${board.id}（get_canvas_project_context），並對既有真run ${runId} 執行group_canvas_artifacts，再get_canvas_artifact_groups核對實際依賴。請在原圖item ${added.item.id} 用add_canvas_image_label新增一句「原圖參考位置，非量測」，anchor=(13,17)，position=(720,80)。禁止重算或改任何算法。最後簡短說明group的依賴有何真實來源及工程代號。`,'thread-A','turn-A1');
 const second=await runTurn('沿用剛才同一個問題，不要重算。請說出我上一輪的工程代號，並get_canvas_artifact_groups讀回剛才建立的真圖組與位置氣泡，確認還在畫板上。','thread-A','turn-A2');
 const isolated=await runTurn('這是一個全新的獨立問題。你是否知道其他問題裡的工程代號？不知道就直接說不知道，不要猜，不要查其他問題。只回答本問題沒有提供代號。','thread-B','turn-B1');
 // A runtime reset deliberately disposes SDK sessions. Host only replays saved same-thread text.
 await agent.wire({type:'reset',id:'probe-runtime-reset'});await wait(()=>events.some(e=>e.event?.type==='reset_done'&&e.event.id==='probe-runtime-reset'),30000);await queue;
 const restored=await runTurn('此問題現在接續。請從本問題保存的文字指出工程代號；說明目前僅補入保存文字，工具上下文需重新讀取。再get_canvas_artifact_groups重新讀取既有圖組。','thread-A','turn-A3');
 outcome.turns=turns;outcome.routes=routes;outcome.tools=tools;
 const liveBoard=p.ensureInquiry().boards.find(b=>b.id===board.id),labels=liveBoard.imageLabelBubbles||[],groups=liveBoard.artifactGroups||[];
 outcome.checks={realPiFirstSession:first.route?.sessionReused===false,sameThreadSameSession:first.route?.sessionId===second.route?.sessionId&&second.route?.sessionReused===true,followupRemembers:second.text.includes(keyword),newThreadDifferentSession:isolated.route?.sessionId!==first.route?.sessionId&&isolated.route?.sessionReused===false,noOtherThreadTextLeak:!isolated.text.includes(keyword),restartSessionDifferent:restored.route?.sessionId!==second.route?.sessionId&&restored.route?.sessionReused===false,restartExplicitTextRestore:restored.route?.restoredSavedText===true&&restored.text.includes(keyword),actualGroup:groups.some(g=>g.runId===runId&&g.itemIds.length>0),actualPositionBubble:labels.some(l=>l.itemId===added.item.id&&l.anchor.x===13&&l.anchor.y===17&&l.threadId==='thread-A'&&l.turnId==='turn-A1'),usedGroupReadTool:tools.some(t=>t.name==='get_canvas_artifact_groups'),noAlgorithmMutation:JSON.stringify(p.data.algorithmRuns)===beforeAlgorithms,noToolErrors:!events.some(e=>e.command?.type==='tool_response'&&e.command?.result?.error)};
 const prompts=events.filter(e=>e.command?.type==='prompt').map(e=>e.command);outcome.checks.isolatedHostHistory=!prompts.find(c=>c.thread_id==='thread-B')?.message.includes(keyword);
 outcome.status=outcome.modelError?'FAILED_MODEL':Object.values(outcome.checks).every(Boolean)?'PASSED':'PARTIAL';
}catch(e){outcome.status=outcome.modelError?'FAILED_MODEL':'FAILED';outcome.error=e.message}
finally{fs.writeFileSync(path.join(output,'project.agentcv.json'),p.serialize());if(child){child.stdin.end();child.kill()}outcome.stderr=stderr;fs.writeFileSync(path.join(output,'outcome.json'),JSON.stringify(safe(outcome),null,2));fs.writeFileSync(path.join(output,'tool-results.json'),JSON.stringify(safe(responses),null,2));console.log(JSON.stringify({status:outcome.status,checks:outcome.checks,error:outcome.error,model:outcome.model,output},null,2));if(outcome.status!=='PASSED')process.exitCode=1;}
