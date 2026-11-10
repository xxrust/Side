import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {randomUUID, timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {JsonRpcPeer} from './json-rpc-peer.mjs';
import {loadAgentProfile, describeAgentProfile, readAgentResource, writeAgentSkill} from './agent-resources.mjs';
import {imageParts, visualToolResult} from './agent-image-transport.mjs';

const emit = value => process.stdout.write(JSON.stringify(value)+'\n');
const here = path.dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(await fs.readFile(process.env.AGENTCV_TOOL_CONTRACT || path.join(here,'agent-contract.json'),'utf8'));
let profile = await loadAgentProfile();
const relayTokens = new Map();
const pendingTools = new Map();
const sessions = new Map();
const toolCalls = new Map();
const stateDirectory = process.env.AGENTCV_CODEX_STATE_DIR || path.join(path.dirname(profile.configPath),'codex-sessions');
await fs.mkdir(stateDirectory, {recursive:true});
const indexFile = path.join(stateDirectory,'index.json');
let index;
try { index = JSON.parse(await fs.readFile(indexFile,'utf8')); }
catch (error) { if(error.code !== 'ENOENT') throw error; index = {}; }
let active = null;
let current = null;
let desiredModel = index.$model || null;
let replaying = false;
let closing = false;
let wakeGoal;
let initialization;
let readySession;

let indexSave=Promise.resolve();
function saveIndex() {
  indexSave=indexSave.then(writeIndex,writeIndex);
  return indexSave;
}
async function writeIndex() {
  const temporary = `${indexFile}.${process.pid}.tmp`;
  await fs.writeFile(temporary,JSON.stringify(index),{mode:0o600});
  await fs.rename(temporary,indexFile);
}
function requestHostTool(name,args) {
  if (!active) throw Error('No active AgentCV turn for this tool');
  const turn = active.id;
  const id = randomUUID();
  // Batch inspection is now a background job, but keep an explicit opt-in
  // synchronous call useful for short local runs. Its timeout follows the
  // declared budget instead of the old blanket 90-second ceiling.
  const budgetSeconds = Number.isInteger(args?.timeout_seconds) ? args.timeout_seconds : null;
  const timeoutMs = name === 'run_dataset_scheme'
    ? Math.min(15 * 60_000, Math.max(90_000, (budgetSeconds || 900) * 1_000))
    : name === 'run_algorithm'
      ? Math.min(10 * 60_000, Math.max(90_000, (budgetSeconds || 120) * 1_000))
      : 90_000;
  return new Promise((resolve,reject) => {
    const pending={turn,name,resolve,reject,timer:null,timeoutMs,waitingForApproval:false};
    const expire=()=>{if(pendingTools.get(id)!==pending)return;pendingTools.delete(id);pending.timer=null;reject(Error(`AgentCV tool timeout: ${name}`));};
    pending.timer=setTimeout(expire,timeoutMs);
    pendingTools.set(id,pending);
    emit({type:'tool_request',id,turn,name,args});
  });
}
const resourceTools = [
  {name:'read_agent_skill',description:'Read enabled SKILL.md and references with SHA-256.',inputSchema:{type:'object',properties:{path:{type:'string'},offset:{type:'integer'},limit:{type:'integer'}},required:['path']}},
  {name:'write_skill',description:'Update an enabled skill after reading it. Supply expectedSha256 and reason.',inputSchema:{type:'object',properties:{path:{type:'string'},text:{type:'string'},expectedSha256:{type:'string'},reason:{type:'string'}},required:['path','text','expectedSha256','reason']}},
];
async function mcp(method,params) {
  if(method === 'initialize') return {protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'agentcv',version:'1.0.0'}};
  if(method === 'ping') return {};
  if(method === 'tools/list') return {tools:[...contract.tools.map(({function:f})=>({name:f.name,description:f.description,inputSchema:f.parameters})),...resourceTools]};
  if(method !== 'tools/call') throw Error(`Unsupported MCP request: ${method}`);
  const {name,arguments:args={}} = params;
  if(!active) throw Error('This AgentCV session has no active turn');
  let value;
  try {
    if(name === 'read_agent_skill') {
      value = await readAgentResource(profile,args.path,{offset:args.offset??1,limit:args.limit??240});
      emit({type:'resource_read',turn:active.id,...value,text:undefined});
    } else if(name === 'write_skill') {value = await writeAgentSkill(profile,args);profile=await loadAgentProfile({configPath:profile.configPath});emit({type:'resource_write',turn:active.id,...value});}
    else {
      if(!contract.tools.some(t=>t.function.name===name)) throw Error(`Unknown AgentCV tool: ${name}`);
      value = await requestHostTool(name,args);
    }
    const result = visualToolResult(value,{input:['text','image']});
    return {content:result.content,isError:!!value?.error};
  } catch(error) { return {content:[{type:'text',text:error.message}],isError:true}; }
}
const server = createServer(async(req,res) => {
  try {
    const auth = Buffer.from(req.headers.authorization||'');
    const matchingToken=[...relayTokens.keys()].find(value=>{const expected=Buffer.from(`Bearer ${value}`);return auth.length===expected.length&&timingSafeEqual(auth,expected);});
    if(req.method!=='POST'||!matchingToken) {res.writeHead(403);res.end('{}');return;}
    let body='';
    for await(const chunk of req) {body+=chunk;if(body.length>96*1024*1024)throw Error('MCP request too large');}
    const {method,params} = JSON.parse(body);
    if(method==='tools/call'&&active?.key!==relayTokens.get(matchingToken))throw Error('MCP session does not own the active AgentCV turn');
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify(await mcp(method,params)));
  } catch(error) {res.writeHead(400);res.end(JSON.stringify({error:error.message}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
function sessionMcpServers(key){
const token=randomUUID();relayTokens.set(token,key);
return [{name:'agentcv',command:process.execPath,args:[path.join(here,'codex-mcp-relay.mjs')],env:[
  {name:'AGENTCV_MCP_ENDPOINT',value:`http://127.0.0.1:${server.address().port}`},
  {name:'AGENTCV_MCP_TOKEN',value:token},
]}];
}
const bundledEntry=path.join(here,'codex-acp/index.mjs');
const adapterEntry = process.env.AGENTCV_CODEX_ACP_ENTRY || await fs.access(bundledEntry).then(()=>bundledEntry,()=>path.join(here,'../node_modules/@agentclientprotocol/codex-acp/dist/index.js'));
// Native Codex file/shell tools are read-only by default.  AgentCV changes
// must go through the audited AgentCV MCP contract; development escalation is
// an explicit deployment choice via INITIAL_AGENT_MODE.
const child = spawn(process.execPath,[adapterEntry],{stdio:['pipe','pipe','pipe'],env:{...process.env,...(process.env.AGENTCV_CODEX_PATH?{CODEX_PATH:process.env.AGENTCV_CODEX_PATH}:{}),INITIAL_AGENT_MODE:process.env.INITIAL_AGENT_MODE||'read-only'}});
child.stderr.on('data',chunk=>process.stderr.write(chunk));
const rpc = new JsonRpcPeer(child.stdout,child.stdin,{
  request:async(method,params)=>{
    if(method === 'session/request_permission') {
      const option = params.options?.find(o=>o.kind==='allow_once');
      const call=toolCalls.get(params.toolCall?.toolCallId);
      if(option&&active?.sessionId===params.sessionId&&call?.rawInput?.server==='agentcv'&&[...contract.tools.map(t=>t.function.name),...resourceTools.map(t=>t.name)].includes(call.rawInput.tool))return {outcome:{outcome:'selected',optionId:option.optionId}};
      // Any native write/escalation still needs a human response. Host MCP
      // tools are separately classified by the AgentCV tool policy.
      if(!option) return {outcome:{outcome:'cancelled'}};
      const id = randomUUID();
      return new Promise(resolve=>{
        const timer=setTimeout(()=>{pendingTools.delete(id);resolve({outcome:{outcome:'cancelled'}});},90000);
        pendingTools.set(id,{turn:active?.id,timer,resolve:reply=>resolve({outcome:reply?.allow?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}}),reject:()=>resolve({outcome:{outcome:'cancelled'}})});
        emit({type:'permission_request',id,turn:active?.id,toolCall:{...call,...params.toolCall},options:params.options});
      });
    }
    throw Object.assign(Error(`Unsupported ACP client request: ${method}`),{code:-32601});
  },
  notification:async(method,params)=>{
    if(method!=='session/update'||replaying)return;
    const update=params.update;
    if(update.sessionUpdate==='tool_call')toolCalls.set(update.toolCallId,update);
    if(update.sessionUpdate==='tool_call_update'&&['completed','failed'].includes(update.status))toolCalls.delete(update.toolCallId);
    const route=[...sessions.values()].find(s=>s.sessionId===params.sessionId);
    if(route&&route.key!=='default'&&update._meta?.codex?.threadStatus?.type==='active'&&index[route.key]!==route.sessionId){index[route.key]=route.sessionId;await saveIndex();}
    if(update.sessionUpdate==='available_commands_update') {
      if(route)route.commands=update.availableCommands;
      emit({type:'commands',commands:update.availableCommands});return;
    }
    if(update.sessionUpdate==='config_option_update') {
      if(route)route.configOptions=update.configOptions;
      emit({type:'config_options',options:update.configOptions});return;
    }
    if(update.sessionUpdate==='session_info_update'&&update._meta?.jetbrains?.air&&Object.hasOwn(update._meta.jetbrains.air,'goal')){
      if(route)route.goal=update._meta.jetbrains.air.goal;
      emit({type:'goal_update',turn:active?.id,goal:route?.goal});wakeGoal?.();
    }
    if(!active||active.sessionId!==params.sessionId)return;
    if(update.sessionUpdate==='agent_message_chunk'&&update.content?.type==='text')emit({type:'text_delta',turn:active.id,delta:update.content.text});
    else if(update.sessionUpdate==='tool_call')emit({type:'tool_start',turn:active.id,name:update.title,toolCall:update});
    else {
      // ACP diagnostics may contain a second serialized copy of image pixels.
      // Codex already received the original MCP content. Keep UI events bounded.
      const {rawOutput,...metadata}=update;
      emit({type:'acp_update',turn:active.id,update:{...metadata,...(rawOutput?{outputAvailable:true}:{})}});
    }
  },
});
child.once('error',error=>{emit({type:'fatal',error:error.message});shutdown();});
child.once('exit',(code)=>{if(!closing)emit({type:'fatal',error:`Codex ACP exited (${code})`});shutdown();});
function sessionInstructions(){
const skillInstructions = profile.skillPaths.map(root=>`- ${path.join(root,'SKILL.md')}`).join('\n');
return {mode:'append',content:[{type:'text',text:`${contract.systemPrompt}\n\nEnabled CV skills. Read relevant instructions before algorithm development, using read_agent_skill.\n${skillInstructions}\nUse AgentCV MCP tools to inspect project images, run algorithms, and publish results. Native file and shell tools are read-only; project and runtime changes must use the audited AgentCV tools. Native /goal state and session history belong to Codex.`}]};
}
function modelsEvent(route) {
  const state=route?.models;
  const image=initialization.agentCapabilities?.promptCapabilities?.image===true;
  const values=state?.availableModels||[];
  const models=values.map(m=>({id:m.modelId,name:m.name,provider:'codex',input:image?['text','image']:['text']}));
  return {models,model:state?.currentModelId?{id:state.currentModelId,provider:'codex'}:null};
}
async function getSession(key) {
  if(sessions.has(key))return sessions.get(key);
  let result;
  const mcpServers=sessionMcpServers(key);
  const systemPrompt=sessionInstructions();
  if(key!=='default'&&index[key]&&initialization.agentCapabilities?.loadSession) {
    replaying=true;
    try { result={...await rpc.call('session/load',{sessionId:index[key],cwd:process.cwd(),mcpServers,systemPrompt}),sessionId:index[key]}; }
    finally { replaying=false; }
  } else result=await rpc.call('session/new',{cwd:process.cwd(),mcpServers,systemPrompt});
  const route={...result,key,commands:result.availableCommands||[]};
  sessions.set(key,route);
  // Codex persists a new thread after its first model turn, not after session/new.
  if(desiredModel&&route.models?.currentModelId!==desiredModel) {
    await rpc.call('session/set_model',{sessionId:route.sessionId,modelId:desiredModel});
    route.models.currentModelId=desiredModel;
  }
  return route;
}
async function command(cmd) {
  if(cmd.type==='tool_permission_state') {
    const pending=pendingTools.get(cmd.id);if(!pending)return;
    if(cmd.state==='waiting'&&!pending.waitingForApproval){if(pending.timer)clearTimeout(pending.timer);pending.timer=null;pending.waitingForApproval=true;return;}
    if(cmd.state==='resolved'&&pending.waitingForApproval){pending.waitingForApproval=false;pending.timer=setTimeout(()=>{if(pendingTools.get(cmd.id)!==pending)return;pendingTools.delete(cmd.id);pending.timer=null;pending.reject(Error(`AgentCV tool timeout: ${pending.name||'operation'}`));},pending.timeoutMs);}
    return;
  }
  if(cmd.type==='tool_response'||cmd.type==='permission_response') {
    const pending=pendingTools.get(cmd.id);if(!pending)return;
    pendingTools.delete(cmd.id);clearTimeout(pending.timer);pending.resolve(cmd.result);return;
  }
  if(cmd.type==='abort') {
    if(active){rpc.notify('session/cancel',{sessionId:active.sessionId});active.cancelled=true;wakeGoal?.();}
    if(current?.goal?.status==='active')await rpc.call('_session/goal',{sessionId:current.sessionId,action:'pause'});
    for(const [id,p]of pendingTools){clearTimeout(p.timer);p.reject(Error('Operation cancelled'));pendingTools.delete(id);}
    return;
  }
  await readySession;
  if(cmd.type==='goal_control'){await rpc.call('_session/goal',{sessionId:current.sessionId,action:cmd.action});return;}
  if(cmd.type==='models'){emit({type:'models',...modelsEvent(current)});return;}
  if(cmd.type==='set_model') {
    if(active)throw Error('Wait for the current turn before switching model');
    const requested = current.models.availableModels.find(model=>model.modelId===cmd.modelId) || current.models.availableModels.find(model=>model.modelId.startsWith(cmd.modelId+'['));
    if(!requested)throw Error(`Unknown Codex model: ${cmd.modelId}`);
    const result=await rpc.call('session/set_model',{sessionId:current.sessionId,modelId:requested.modelId});
    desiredModel=requested.modelId;current.models.currentModelId=desiredModel;
    index.$model=desiredModel;await saveIndex();
    emit({type:'model_changed',id:cmd.id,model:{provider:'codex',id:desiredModel},result});return;
  }
  if(cmd.type==='reset') {
    if(active){await command({type:'abort'});await active?.done;}
    sessions.clear();current=await getSession('default');
    emit({type:'reset_done',id:cmd.id});emit({type:'models',...modelsEvent(current)});return;
  }
  if(cmd.type==='auth_providers') {emit({type:'command_result',text:'Codex 使用本機 CLI 登入。請在終端執行 codex login。'});return;}
  if(cmd.type!=='prompt')throw Error(`Unsupported Codex bridge command: ${cmd.type}`);
  if(active)throw Error('Codex is still processing the previous turn');
  // Canvas thread IDs are durable, unlike the UI process namespace.
  if(cmd.thread_id!==undefined&&(typeof cmd.thread_id!=='string'||cmd.thread_id.length>600))throw Error('Invalid AgentCV thread id');
  const key=cmd.thread_id&&cmd.thread_id!=='main'?`thread:${cmd.thread_id}`:cmd.project_key?`main:${cmd.project_key}`:cmd.session_key||'default';
  let finishTurn;
  const done=new Promise(resolve=>{finishTurn=resolve;});
  active={id:cmd.id,key,sessionId:index[key]||null,done};
  try {
    const reused=sessions.has(key)||!!index[key];
    current=await getSession(key);active.sessionId=current.sessionId;
    if(active.cancelled)return;
    emit({type:'session_route',turn:cmd.id,sessionId:current.sessionId,sessionReused:reused,restoredSavedText:!reused&&cmd.saved_history_count>0,threadId:cmd.thread_id});
    emit({type:'models',...modelsEvent(current)});
    emit({type:'turn_start',turn:cmd.id});
    const prompt=[{type:'text',text:cmd.native_command||cmd.message},...imageParts(cmd.images||[])];
    await rpc.call('session/prompt',{sessionId:current.sessionId,prompt},24*60*60*1000);
    if(!cmd.native_command||/^\/goal\s+(?!pause$|clear$).+/.test(cmd.native_command)){index[key]=current.sessionId;await saveIndex();}
    while(current.goal?.status==='active'&&!active.cancelled){await new Promise(resolve=>{wakeGoal=resolve;});wakeGoal=null;}
  } catch(error){
    emit({type:'agent_error',turn:cmd.id,error:error.message});
  } finally {
    emit({type:'turn_end',turn:cmd.id});toolCalls.clear();active=null;finishTurn();
  }
}
readySession=(async()=>{
  initialization=await rpc.call('initialize',{protocolVersion:1,clientInfo:{name:'agentcv',version:'1.0.0'},clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false,_meta:{jetbrains:{air:{}}}}});
  current=await getSession('default');
  emit({type:'ready',...modelsEvent(current),runtime:{...describeAgentProfile(profile),skills:profile.skillPaths.map(p=>({filePath:path.join(p,'SKILL.md')})),extensions:[],capabilities:{acp:true,commands:true,auth:false},resourceState:'OFFERED'}});
})();
readySession.catch(error=>{emit({type:'fatal',error:error.message});shutdown();});
const reader=createInterface({input:process.stdin,crlfDelay:Infinity});
reader.on('line',line=>{
  let cmd;
  try{cmd=JSON.parse(line);}catch{emit({type:'error',error:'Invalid bridge JSON'});return;}
  command(cmd).catch(error=>emit({type:'error',id:cmd.id,error:error.message}));
});
function shutdown() {
  if(closing)return;closing=true;
  rpc.close();for(const p of pendingTools.values()){clearTimeout(p.timer);p.reject(Error('Agent stopped'));}pendingTools.clear();
  server.closeAllConnections();server.close();child.kill('SIGTERM');
  const killTimer=setTimeout(()=>child.kill('SIGKILL'),3000);killTimer.unref();
  reader?.close();process.stdin.pause();
}
reader.once('close',shutdown);
process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
