// AgentCV owns the UI; 螃蟹 owns the agent loop, model routing and authentication.
// Wire format: LF-delimited JSON over stdio. Host tools plus a package-resource reader.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createAuthController,errorCategory,safeError} from './pi-auth.mjs';
import {loadAgentProfile,describeAgentProfile,readAgentResource,writeAgentSkill} from './agent-resources.mjs';
import {createHash} from 'node:crypto';
import {imageParts,requireVision,visualToolResult} from './agent-image-transport.mjs';
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
const contract=JSON.parse(fs.readFileSync(new URL('./agent-contract.json',import.meta.url),'utf8'));
const entry=process.env.AGENTCV_PI_ENTRY||path.join(os.homedir(),'.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js');
const sdk=await import(pathToFileURL(entry));
const require=createRequire(entry),typebox=await import(pathToFileURL(require.resolve('typebox')));
const Type=typebox.Type;
function typed(s){
  if(Object.hasOwn(s,'const'))return Type.Literal(s.const);
  if(s.anyOf)return Type.Union(s.anyOf.map(typed));
  if(s.enum)return Type.Union(s.enum.map(v=>Type.Literal(v)));
  if(Array.isArray(s.type))return Type.Union(s.type.map(type=>typed({...s,type})));
  if(s.type==='object')return Type.Object(Object.fromEntries(Object.entries(s.properties||{}).map(([k,v])=>[k,s.required?.includes(k)?typed(v):Type.Optional(typed(v))])),{additionalProperties:s.additionalProperties??false});
  if(s.type==='array')return Type.Array(typed(s.items||{type:'string'}),{...(s.minItems!=null?{minItems:s.minItems}:{}),...(s.maxItems!=null?{maxItems:s.maxItems}:{})});
  if(s.type==='null')return Type.Null();
  const fn={string:Type.String,number:Type.Number,integer:Type.Integer,boolean:Type.Boolean}[s.type];
  if(!fn)throw Error(`不支援的工具 schema: ${s.type}`);
  const {type,...options}=s;return fn(options);
}
let profile=await loadAgentProfile();
let resourceLoader,resourceState;
const agentDir=process.env.PI_CODING_AGENT_DIR||path.join(os.homedir(),'.pi/agent');
let session,runtime,auth,turn=null,closing=false,currentSessionKey='default',routing=false,routeGeneration=0;
const sessionRoutes=new Map();
const modelsEvent=models=>{const current=models.find(m=>m.provider===session?.model?.provider&&m.id===session?.model?.id);return {type:'models',models:models.map(m=>({provider:m.provider,id:m.id,name:m.name,input:m.input})),model:current?{provider:current.provider,id:current.id}:null}}
async function refreshModels(){const available=await runtime.getAvailable(undefined,{signal:AbortSignal.timeout(20_000)});if(!session&&available[0])await create(available[0]);emit(modelsEvent(available));return available}
const pending=new Map();
function requestTool(name,args,signal){const id=crypto.randomUUID(),requestTurn=turn,budgetSeconds=Number.isInteger(args?.timeout_seconds)?args.timeout_seconds:null,timeoutMs=name==='run_dataset_scheme'?Math.min(15*60_000,Math.max(90_000,(budgetSeconds||900)*1_000)):name==='run_algorithm'?Math.min(10*60_000,Math.max(90_000,(budgetSeconds||120)*1_000)):90_000;return new Promise((resolve,reject)=>{let timer=null,waitingForApproval=false;const finish=()=>{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);pending.delete(id)},expire=()=>{finish();reject(Error(`畫板工具等待超時：${name}`))},abort=()=>{finish();reject(Error('操作已取消'))};const entry={resolve:value=>{finish();resolve(value)},reject, pause:()=>{if(timer){clearTimeout(timer);timer=null}waitingForApproval=true},resume:()=>{if(!waitingForApproval)return;waitingForApproval=false;timer=setTimeout(expire,timeoutMs)}};timer=setTimeout(expire,timeoutMs);pending.set(id,entry);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return}emit({type:'tool_request',id,turn:requestTurn,name,args})})}
const hostTools=contract.tools.map(({function:f})=>({name:f.name,label:f.name,description:f.description,parameters:typed(f.parameters),execute:async(_id,args,signal)=>{const value=await requestTool(f.name,args,signal);return visualToolResult(value,session?.model)}}));
const skillReader={name:'read',label:'讀取已啟用的技能與參考文件',description:'讀取技能目錄中的SKILL.md及其相對參考文件；path可以是絕對路徑或相對於skill根目錄。這是能力資源讀取，不讀專案圖片或帳戶檔案。',parameters:Type.Object({path:Type.String(),offset:Type.Optional(Type.Integer({minimum:1})),limit:Type.Optional(Type.Integer({minimum:1,maximum:1200}))}),execute:async(_id,args,signal)=>{
 signal?.throwIfAborted();const value=await readAgentResource(profile,args.path,{offset:args.offset??1,limit:args.limit??240});signal?.throwIfAborted();
 const {text,...details}=value;const skill=resourceLoader?.getSkills().skills.find(s=>s.filePath===value.path);
 emit({type:'resource_read',turn,...details,...(skill?{name:skill.name}:{})});
 return {content:[{type:'text',text:`${value.path} · SHA-256 ${value.sha256} · lines ${value.offset}–${value.offset+text.split('\n').length-1}/${value.totalLines}${value.truncated?' · PARTIAL':''}\n\n${text}`}],details};
}};
const skillWriter={name:'write_skill',label:'修改已啟用的技能',description:'修改已啟用 skill 的 SKILL.md 或 .md/.txt 參考文件。先用 read 讀取全文及 SHA-256，提交完整 text、expectedSha256、reason。保留修改前後版本與理由；不修改專案資料、可執行檔或未啟用套件。寫入後 read 返回路徑以使用新指引；新 session/reset 才刷新技能發現，既有會話不被清空。',parameters:Type.Object({path:Type.String(),text:Type.String(),expectedSha256:Type.String(),reason:Type.String()}),execute:async(_id,args,signal)=>{
 signal?.throwIfAborted();const receipt=await writeAgentSkill(profile,args);
 profile=await loadAgentProfile({configPath:profile.configPath});
 emit({type:'resource_write',turn,...receipt});
 return {content:[{type:'text',text:JSON.stringify(receipt)}],details:receipt};
}};
const customTools=[skillReader,skillWriter,...hostTools];
async function create(model){
 const settingsManager=sdk.SettingsManager.inMemory({retry:{enabled:false},compaction:{enabled:true}});
 const loader=new sdk.DefaultResourceLoader({cwd:process.cwd(),agentDir,settingsManager,
   noExtensions:true,additionalExtensionPaths:profile.extensionPaths,
   noSkills:false,additionalSkillPaths:profile.skillPaths,
   // Only AgentCV's explicitly enabled package set is visible to this agent.
   skillsOverride:()=>sdk.loadSkills({cwd:process.cwd(),agentDir,skillPaths:profile.skillPaths,includeDefaults:false}),
   noPromptTemplates:true,noThemes:true,noContextFiles:true,appendSystemPromptOverride:()=>[],systemPrompt:contract.systemPrompt});
 await loader.reload();
 const loadedSkills=loader.getSkills(),extensions=loader.getExtensions();
 if(loadedSkills.diagnostics?.length)throw Error('技能載入診斷：'+loadedSkills.diagnostics.map(d=>`${d.path||''}: ${d.message}`).join('; '));
 if(extensions.errors?.length)throw Error('Plugin載入失敗：'+extensions.errors.map(e=>`${e.path||''}: ${e.error||e.message}`).join('; '));
 const protectedNames=new Set(customTools.map(t=>t.name));
 for(const extension of extensions.extensions||[])for(const name of extension.tools?.keys?.()||[])if(protectedNames.has(name))throw Error(`Plugin不可覆蓋宿主工具 ${name}；請為新增能力使用獨立名稱。`);
 resourceLoader=loader;
 const activeTools=[...new Set([...customTools.map(t=>t.name),...(extensions.extensions||[]).flatMap(e=>[...(e.tools?.keys?.()||[])])])];
 const result=await sdk.createAgentSession({cwd:process.cwd(),agentDir,modelRuntime:runtime,model,thinkingLevel:'low',tools:activeTools,customTools,resourceLoader:loader,sessionManager:sdk.SessionManager.inMemory(),settingsManager});session=result.session;
 const skills=await Promise.all(loadedSkills.skills.map(async skill=>({name:skill.name,description:skill.description,filePath:skill.filePath,packageId:profile.resourceRoots.find(r=>skill.filePath.startsWith(r.path+path.sep))?.packageId||null,sha256:createHash('sha256').update(await fs.promises.readFile(skill.filePath)).digest('hex')})));
 resourceState={...describeAgentProfile(profile),skills,extensions:(extensions.extensions||[]).map(e=>({path:e.path,tools:[...(e.tools?.keys?.()||[])]})),hostContract:{sha256:createHash("sha256").update(JSON.stringify(contract)).digest("hex"),toolCount:contract.tools.length,tools:contract.tools.map(t=>t.function.name)},systemPromptChars:contract.systemPrompt.length,effectiveSystemPromptChars:session.systemPrompt?.length||null,resourceState:'DISCOVERED',tools:session.getActiveToolNames()};
 emit({type:'runtime',runtime:resourceState});
 sessionRoutes.set(currentSessionKey,{session,resourceState,resourceLoader});
  session.subscribe(event=>{if(event.type==='message_update'&&event.assistantMessageEvent?.type==='text_delta')emit({type:'text_delta',turn,delta:event.assistantMessageEvent.delta});if(event.type==='tool_execution_start')emit({type:'tool_start',turn,name:event.toolName});if(event.type==='message_end'&&event.message?.role==='assistant'&&event.message.stopReason==='error')emit({type:'agent_error',turn,error:safeError(event.message.errorMessage||'螃蟹 模型請求失敗'),category:errorCategory(event.message.errorMessage||'螃蟹 模型請求失敗')})});
}
async function command(cmd){
  if(cmd.type?.startsWith('auth_')){if(turn&&['auth_login','auth_logout'].includes(cmd.type))throw Error('請先停止目前對話再變更帳戶');if(await auth.command(cmd))return}
  if(cmd.type==='models'){await refreshModels();return}

  if(cmd.type==='tool_response'){pending.get(cmd.id)?.resolve(cmd.result);return}
  if(cmd.type==='tool_permission_state'){const request=pending.get(cmd.id);if(!request)return;if(cmd.state==='waiting')request.pause?.();else if(cmd.state==='resolved')request.resume?.();return;}
  if(cmd.type==='abort'){routeGeneration++;await session?.abort();for(const p of pending.values())p.resolve({error:'使用者已取消'});return}
  if(cmd.type==='reset'){routeGeneration++;await session?.abort();const available=runtime.getAvailableSnapshot();const model=available.find(m=>m.provider===session?.model?.provider&&m.id===session?.model?.id)||available[0];for(const route of sessionRoutes.values())route.session.dispose();sessionRoutes.clear();session=null;currentSessionKey='default';if(model&&!auth.busy)await create(model);emit({type:'reset_done',id:cmd.id});emit(modelsEvent(available));return}
  if(cmd.type==='set_model'){if(auth.busy)throw Error('請先完成或取消登入');if(turn||routing)throw Error('請等目前對話結束再切換模型');const model=runtime.getModel(cmd.provider,cmd.modelId);if(!model)throw Error('螃蟹 找不到此模型');if(session)await session.setModel(model);else await create(model);emit({type:'model_changed',id:cmd.id,model:{provider:model.provider,id:model.id}});return}
  if(cmd.type==='prompt'){
    const input=String(cmd.message||'').trim();
    const match=/^\/(help|model|login|logout)(?:\s+(.*))?$/.exec(input)||/^(login|logout|model|help)$/.exec(input);
    if(match){const [,name,arg]=match;if(name==='help')emit({type:'command_result',command:'help',text:'/help 說明 · /model 選模型 · /login 登入 · /logout 登出；登入資料不會進入專案或模型'});else if(name==='model')await refreshModels();else if(!arg)emit({type:'auth_providers',action:name,providers:auth.providers()});else await command({type:name==='login'?'auth_login':'auth_logout',provider:arg.trim()});return}
    if(auth.busy)throw Error('請先完成或取消登入');if(!session)throw Error('螃蟹 尚未設定可用模型，請使用 /login 或 /model');
    if(turn||routing)throw Error('螃蟹 仍在處理上一個訊息');
    const key=cmd.session_key??'default';if(typeof key!=='string'||!key||key.length>600||/[\u0000-\u001f]/.test(key))throw Error('螃蟹 session key格式無效');
    const images=imageParts(cmd.images||[]);if(images.length)requireVision(session?.model);
    const generation=routeGeneration;routing=true;try{
    const model=session.model,cached=sessionRoutes.get(key),sessionReused=!!cached;
    if(cached){session=cached.session;resourceState=cached.resourceState;resourceLoader=cached.resourceLoader;if(session.model?.id!==model.id||session.model?.provider!==model.provider)await session.setModel(model);}
    else{currentSessionKey=key;await create(model);}
    currentSessionKey=key;sessionRoutes.delete(key);sessionRoutes.set(key,{session,resourceState,resourceLoader});
    while(sessionRoutes.size>64){const oldest=sessionRoutes.keys().next().value;sessionRoutes.get(oldest).session.dispose();sessionRoutes.delete(oldest);}
    if(generation!==routeGeneration)throw Error('對話已停止，未發送到模型');
    turn=cmd.id;emit({type:'session_route',turn,sessionId:session.sessionId,sessionReused,restoredSavedText:!sessionReused&&Number(cmd.saved_history_count)>0,threadId:cmd.thread_id||null,parentThreadId:cmd.parent_thread_id||null,parentTurnId:cmd.parent_turn_id||null});}finally{routing=false;}emit({type:'turn_start',turn});try{await session.prompt(cmd.message,{images,expandPromptTemplates:false})}finally{emit({type:'turn_end',turn});turn=null}return}
  throw Error('未知的 螃蟹 橋接命令');
}
async function main(){runtime=await sdk.ModelRuntime.create({authPath:path.join(agentDir,'auth.json'),modelsPath:path.join(agentDir,'models.json'),allowModelNetwork:false,signal:AbortSignal.timeout(20_000)});auth=createAuthController({runtime,emit,onRefresh:refreshModels});const available=await runtime.getAvailable(undefined,{signal:AbortSignal.timeout(20_000)});let defaults={};try{defaults=JSON.parse(fs.readFileSync(path.join(agentDir,'settings.json'),'utf8'))}catch{}const model=available.find(m=>m.provider===defaults.defaultProvider&&m.id===defaults.defaultModel)||available[0];if(model)await create(model);
  emit({type:'ready',models:available.map(m=>({provider:m.provider,id:m.id,name:m.name,input:m.input})),model:model?{provider:model.provider,id:model.id}:null,tools:session?.getActiveToolNames()||customTools.map(t=>t.name),runtime:resourceState||{...describeAgentProfile(profile),skills:[],extensions:[],hostContract:{sha256:createHash("sha256").update(JSON.stringify(contract)).digest("hex"),toolCount:contract.tools.length,tools:contract.tools.map(t=>t.function.name)},systemPromptChars:contract.systemPrompt.length,resourceState:'NO_MODEL'}});
  let buffer='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).replace(/\r$/,'');buffer=buffer.slice(index+1);if(!line.trim())continue;let cmd;try{cmd=JSON.parse(line)}catch{emit({type:'error',error:'無效 JSON'});continue}command(cmd).catch(e=>emit(cmd.type?.startsWith('auth_')?{type:'auth_error',id:cmd.id,provider:cmd.provider,category:errorCategory(e),error:'帳戶操作未完成；請確認服務商或重新嘗試'}:{type:'error',id:cmd.id,error:safeError(e),category:errorCategory(e)}))}});process.stdin.on('end',shutdown);
}
async function shutdown(){if(closing)return;closing=true;auth?.cancel();await session?.abort();for(const route of sessionRoutes.values())route.session.dispose();process.exit(0)}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
main().catch(e=>{emit({type:'fatal',error:safeError(e),category:errorCategory(e)});process.exit(1)});
