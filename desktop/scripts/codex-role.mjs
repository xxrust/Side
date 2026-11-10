import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JsonRpcPeer} from './json-rpc-peer.mjs';
// Isolated metadata conversation using the same CLI account as the main adapter.
export async function codexRole({modelId,prompt,systemPrompt,validate}){
 const here=path.dirname(fileURLToPath(import.meta.url)),bundled=path.join(here,'codex-acp/index.mjs');
 const entry=process.env.AGENTCV_CODEX_ACP_ENTRY||await fs.access(bundled).then(()=>bundled,()=>path.join(here,'../node_modules/@agentclientprotocol/codex-acp/dist/index.js'));
 const child=spawn(process.execPath,[entry],{env:{...process.env,CODEX_PATH:process.env.AGENTCV_CODEX_PATH||process.env.CODEX_PATH||'codex',INITIAL_AGENT_MODE:'read-only'},stdio:['pipe','pipe','pipe']});
 let text='',sessionId;
 const rpc=new JsonRpcPeer(child.stdout,child.stdin,{request:async()=>({outcome:{outcome:'cancelled'}}),notification:(method,p)=>{if(method==='session/update'&&p.sessionId===sessionId&&p.update?.sessionUpdate==='agent_message_chunk'&&p.update.content?.type==='text')text+=p.update.content.text;}});
 child.on('error',error=>rpc.close(error));child.stderr.resume();
 const timer=setTimeout(()=>{rpc.close(Error('圖像管理員回覆逾時，請重試'));child.kill();},65000);
 try{
  await rpc.call('initialize',{protocolVersion:1,clientInfo:{name:'agentcv-image-manager',version:'1.0.0'},clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false}});
  const session=await rpc.call('session/new',{cwd:process.cwd(),mcpServers:[],systemPrompt:{mode:'append',content:[{type:'text',text:systemPrompt||'只分析提供的文字資料，不使用檔案、終端或其他工具。'}]}});sessionId=session.sessionId;
  const models=session.models?.availableModels||[];
  if(!prompt)return {models};
  const chosen=models.find(m=>m.modelId===modelId)||models.find(m=>m.modelId===modelId+'[low]');
  if(!chosen)throw Error('圖像管理員模型不可用：'+modelId+'；請在管理員模型設定選擇 Codex 回報的模型');
  await rpc.call('session/set_model',{sessionId,modelId:chosen.modelId});
  let next=prompt;
  for(let attempt=0;attempt<3;attempt++){
   text='';const result=await rpc.call('session/prompt',{sessionId,prompt:[{type:'text',text:next}]});
   if(result.stopReason!=='end_turn'||!text.trim())throw Error('圖像管理員未完成回覆：'+result.stopReason);
   try{const checked=validate?.(text);return {text,checked,model:{provider:'codex',modelId:chosen.modelId},repairAttempts:attempt};}
   catch(error){if(attempt===2)throw error;next='平台校驗拒絕此候選，尚未套用任何資料。請修正後只回傳完整 JSON。錯誤：'+error.message+'。可選欄位未知時省略，不能填 null。';}
  }
 }catch(error){throw Error(error.data?.details||error.message);}finally{clearTimeout(timer);rpc.close();child.stdin.end();child.kill();}
}
