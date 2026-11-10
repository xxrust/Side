// Isolated authentication controller: no model calls, project data or chat history.
import {randomUUID} from 'node:crypto';
export function errorCategory(error){const s=String(error?.message||error).toLowerCase();if(/usage limit|quota|rate.?limit|insufficient_quota|429/.test(s))return 'usage_limit';if(/unauthor|authentication|invalid.?token|expired.?token|401|403|not.?logged|no.?api.?key/.test(s))return 'authentication';if(/network|fetch failed|econn|etimedout|enotfound|socket|dns/.test(s))return 'network';if(/abort|cancel|取消/.test(s))return 'cancelled';return 'other'}
export function safeError(error){return String(error?.message||error).replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTED]').replace(/\b(?:sk-|sess-)[A-Za-z0-9_-]{8,}/g,'[REDACTED]').slice(0,500)}
export function createAuthController({runtime,emit,onRefresh=async()=>{}}){
  let active=null;const prompts=new Map();
  const providers=()=>runtime.getProviders().map(p=>({id:p.id,name:p.name,types:[...(p.auth?.oauth?['oauth']:[]),...(p.auth?.apiKey?.login?['api_key']:[])],authenticated:runtime.hasConfiguredAuth(p.id)}));
  function cancel(){if(!active)return;active.abort();for(const p of prompts.values())p.reject(Error('登入已取消'));prompts.clear()}
  async function complete(provider,action){try{await onRefresh()}catch{emit({type:'auth_info',provider,message:'帳戶憑證已更新，但模型清單刷新失敗；請稍後重新整理模型。'})}emit({type:'auth_success',provider,action});emit({type:'auth_providers',providers:providers()})}
  async function command(cmd){
    if(cmd.type==='auth_providers'){emit({type:'auth_providers',providers:providers()});return true}
    if(cmd.type==='auth_cancel'){cancel();return true}
    if(cmd.type==='auth_reply'){const p=prompts.get(cmd.id);if(!p)throw Error('登入輸入已過期');if(typeof cmd.value!=='string'||cmd.value.length>16384)throw Error('登入輸入無效');if(p.options&&!p.options.some(o=>o.id===cmd.value))throw Error('請選擇有效登入選項');prompts.delete(cmd.id);p.resolve(cmd.value);return true}
    if(cmd.type==='auth_logout'){
      if(active)throw Error('請先完成或取消目前登入');
      if(!providers().some(p=>p.id===cmd.provider))throw Error('找不到此服務商');
      try{await runtime.logout(cmd.provider)}catch(error){if(error?.constructor?.name!=='CredentialSynchronizationError'||error.operation!=='logout')throw error}await complete(cmd.provider,'logout');return true
    }
    if(cmd.type!=='auth_login')return false;
    if(active)throw Error('已有登入進行中');
    const provider=providers().find(p=>p.id===cmd.provider);if(!provider)throw Error('找不到此服務商');
    const authType=cmd.authType||(provider.types.includes('oauth')?'oauth':'api_key');if(!provider.types.includes(authType))throw Error('此服務商不支援此登入方式');
    const controller=new AbortController();active=controller;
    try{
      await runtime.login(provider.id,authType,{
        signal:controller.signal,
        notify(event){if(controller.signal.aborted)return;if(event.type==='auth_url')emit({type:'auth_url',provider:provider.id,url:event.url,instructions:event.instructions||''});else if(event.type==='device_code')emit({type:'auth_url',provider:provider.id,url:event.verificationUri,instructions:`登入代碼：${event.userCode}`});else emit({type:'auth_info',provider:provider.id,message:event.message||'',links:event.links||[]})},
        prompt(prompt){return new Promise((resolve,reject)=>{const id=randomUUID();const abort=()=>{prompts.delete(id);cleanup();emit({type:'auth_prompt_cancelled',id});reject(Error('登入輸入已取消'))};const cleanup=()=>{controller.signal.removeEventListener('abort',abort);prompt.signal?.removeEventListener('abort',abort)};if(controller.signal.aborted||prompt.signal?.aborted){abort();return}prompts.set(id,{options:prompt.options,resolve:value=>{cleanup();resolve(value)},reject:error=>{cleanup();reject(error)}});controller.signal.addEventListener('abort',abort,{once:true});prompt.signal?.addEventListener('abort',abort,{once:true});emit({type:'auth_prompt',id,provider:provider.id,message:prompt.message,placeholder:prompt.placeholder||'',promptType:prompt.type,secret:prompt.type==='secret',options:prompt.options||[]})})}
      });
      if(controller.signal.aborted)throw Error('登入已取消');
      await complete(provider.id,'login');
    }catch(error){if(error?.constructor?.name==='CredentialSynchronizationError'&&error.operation==='login'){await complete(provider.id,'login');return true}emit({type:errorCategory(error)==='cancelled'?'auth_cancelled':'auth_error',provider:provider.id,category:errorCategory(error),error:errorCategory(error)==='cancelled'?'登入已取消':'登入未完成；請檢查服務商授權或重新嘗試'})}
    finally{if(active===controller)active=null;for(const p of prompts.values())p.reject(Error('登入已結束'));prompts.clear()}
    return true
  }
  return {command,cancel,providers,get busy(){return !!active}}
}
