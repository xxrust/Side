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
const output=path.resolve('../reviews/2026-10-28-canvas-project/live-pi');fs.mkdirSync(output,{recursive:true});
const p=new Workspace();p.data=JSON.parse(fs.readFileSync('../reviews/2026-10-27-program-flow/actual-pi-workspace-portable.agentcv.json','utf8'));
const beforeChatCount=p.data.chat.length,beforeAlgorithms=JSON.stringify(p.data.algorithmRuns),image=p.data.images[0];
p.workflow.references.push({id:'live-engineering-note',name:'讀取測試工程備註',status:'TEXT',text:'此備註僅適用參考資料空間連線所指定的圖像源。工程校驗詞：紫杉。沒有尺寸公差，不可判定產品合格。'});
const board=p.ensureProjectCanvas(),a=board.projectSpaces.sources[0],ref=board.projectSpaces.references[0];
p.updateCanvasSpace(board.id,a.id,{title:'現場相機A'});const b=p.addCanvasSource(board.id,{title:'對照相機B',imageIds:[image.id]});
p.updateCanvasSpace(board.id,ref.id,{title:'工程限制',text:'請保留兩個來源的不同適用範圍。'});
const added=p.addInquiryImage({kind:'original',label:image.name,width:image.width,height:image.height,dataURL:image.dataURL,source:{imageId:image.id,inputSha256:image.sha256,coordinateSpace:'original-image-pixels'}},{boardId:board.id});
p.addInquiryAnnotation(board.id,added.item.id,{type:'line',points:[{x:13,y:17},{x:47,y:39}],text:'工程師指出的位置'});
const controller=new VisualAgentController({project:p,view:{},sources:{catalog:()=>[]}});
const ui={page:()=>6,locked:()=>false,update(){},activity(){},reference:()=>null,visualContext:()=>controller.context(board.id),visualAction:(name,args,guard)=>controller.action(name,args,guard)};
const agent=new Agent(p,ui),events=[],tools=[],responses=[],outcome={status:'NOT_RUN',mode:'real configured Pi sidecar/model, headless source/reference context only',checks:{},fixture:{boardId:board.id,imageId:image.id,sourceA:a.id,sourceB:b.id,itemId:added.item.id}};
let child,finished=false,error=null,queue=Promise.resolve(),stderr='';
const safe=value=>JSON.parse(JSON.stringify(value,(k,v)=>['dataURL','dataUrl','base64','_visualImages'].includes(k)?undefined:typeof v==='string'?v.replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTED]').replace(/\b(?:sk-|sess-)[A-Za-z0-9_-]{8,}/g,'[REDACTED]'):v));
const log=value=>{events.push(safe(value));fs.writeFileSync(path.join(output,'events.ndjson'),events.map(e=>JSON.stringify(e)).join('\n')+'\n')};
const wait=async(predicate,ms)=>{const started=Date.now();while(!predicate()){if(Date.now()-started>ms)throw Error('Real Pi probe timed out');await new Promise(r=>setTimeout(r,50))}};
try{
 child=spawn(path.join(os.homedir(),'.local/bin/node'),[path.resolve('scripts/pi-bridge.mjs')],{cwd:path.resolve('runtime'),env:{...process.env,PI_OFFLINE:'1',PI_TELEMETRY:'0'},stdio:['pipe','pipe','pipe']});
 const execute=agent.execute.bind(agent);agent.execute=async(name,args)=>{tools.push({name,args});if(!['get_context','get_visual_context','get_canvas_project_context','read_reference'].includes(name))throw Error('本次授權只讀資料，禁止改方案或執行算法');const result=await execute(name,args);responses.push({name,args,result});return result};
 agent.wire=async command=>{log({direction:'host',command});child.stdin.write(JSON.stringify(command)+'\n')};
 child.stderr.on('data',chunk=>{stderr+=chunk;stderr=stderr.slice(-4000)});child.on('error',e=>error=e);child.on('exit',()=>{if(!finished)error||=Error('Pi bridge exited early')});
 let buffer='';child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line)continue;let event;try{event=JSON.parse(line)}catch{error=Error('Invalid bridge JSON');continue}log({direction:'pi',event});if(['fatal','agent_error','error'].includes(event.type)){outcome.modelError=safe(event);if(event.type==='fatal')error=Error(event.error||'Pi fatal')};queue=queue.then(()=>agent.event(event)).then(()=>{if(event.type==='ready')outcome.model={provider:agent.provider,model:agent.model};if(event.type==='turn_end')finished=true}).catch(e=>error=e)}});
 await wait(()=>agent.connected||error,30000);if(error)throw error;
 await agent.send(`請做一次只讀資料核對，禁止重算、改方案或聲稱已看過像素。請先自主使用 get_canvas_project_context 讀取畫板 ${board.id} 的完整資料，再簡短回答：工程限制中的參考備註究竟適用哪個圖像源，是否也適用對照相機B？工程校驗詞是什麼？目前哪張原圖有人工線標記，標記兩端的原圖座標分別在哪？請列出真實image ID與item ID。若沒有讀到資料請如實說明。`);
 await wait(()=>finished||error,180000);await queue;if(error)throw error;
 const assistant=p.data.chat.slice(beforeChatCount).filter(m=>m.role==='assistant').map(m=>m.text).join('\n');
 outcome.assistant=assistant;outcome.tools=tools;outcome.checks={readFullCanvas:tools.some(t=>t.name==='get_canvas_project_context'),correctReferenceKeyword:assistant.includes('紫杉'),correctScope:/僅適用.*相機A/.test(assistant)&&/不適用.*相機B/.test(assistant),identifiedImage:assistant.includes(image.id),identifiedItem:assistant.includes(added.item.id),originalCoordinateEndpoints:/13[^\d]+17/.test(assistant)&&/47[^\d]+39/.test(assistant),noAlgorithmMutation:JSON.stringify(p.data.algorithmRuns)===beforeAlgorithms,noToolErrors:!events.some(e=>e.command?.type==='tool_response'&&e.command?.result?.error)};
 outcome.status=outcome.modelError?'FAILED_MODEL':Object.values(outcome.checks).every(Boolean)?'PASSED':'PARTIAL';
}catch(e){outcome.status=outcome.modelError?'FAILED_MODEL':'FAILED';outcome.error=e.message}
finally{if(child){child.stdin.end();child.kill()}outcome.stderr=stderr;fs.writeFileSync(path.join(output,'outcome.json'),JSON.stringify(safe(outcome),null,2));fs.writeFileSync(path.join(output,'tool-results.json'),JSON.stringify(safe(responses),null,2));console.log(JSON.stringify({status:outcome.status,checks:outcome.checks,error:outcome.error,model:outcome.model,output},null,2));if(outcome.status!=='PASSED')process.exitCode=1;}
