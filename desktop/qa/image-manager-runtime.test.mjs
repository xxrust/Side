import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {sourceAnalysis,parseSourceRoleReply} from '../scripts/image-manager.mjs';
import {defaultSourceModel} from '../scripts/source-structure.mjs';
const directories=[{id:'actual-folder'}];
test('role accepts only validated candidate metadata and never invents fallback replies',()=>{
 assert.throws(()=>parseSourceRoleReply('',directories),/格式不完整/);
 assert.throws(()=>parseSourceRoleReply('Your authentication token has expired',directories),/格式不完整/);
 assert.deepEqual(parseSourceRoleReply('```json\n{"message":"請確認目錄含義","groups":[]}\n```',directories),{message:'請確認目錄含義',groups:[]});
 assert.throws(()=>parseSourceRoleReply(JSON.stringify({message:'建議',groups:[{id:'invented',meaning:{category:'NG'},reason:'',question:''}]}),directories),/不存在/);
});
test('manager configuration stays independent without modifying the main runtime profile',async()=>{
 const dir=await fs.mkdtemp('/tmp/agentcv-manager-test-'),before=process.env.AGENTCV_AGENT_CONFIG;
 process.env.AGENTCV_AGENT_CONFIG=dir+'/profile.json';
 try{
  assert.deepEqual((await sourceAnalysis({mode:'config'})).config,defaultSourceModel);
  const config={provider:'codex',modelId:'gpt-6.1-terra[low]',enabled:false};
  await sourceAnalysis({mode:'save',config});
  assert.deepEqual((await sourceAnalysis({mode:'config'})).config,config);
  assert.equal(await fs.access(dir+'/profile.json').then(()=>true,()=>false),false);
 }finally{if(before===undefined)delete process.env.AGENTCV_AGENT_CONFIG;else process.env.AGENTCV_AGENT_CONFIG=before;await fs.rm(dir,{recursive:true,force:true});}
});
test('successful retry clears obsolete authentication errors without applying candidate labels',async()=>{
 const {Workspace}=await import('../src/workspace.js');
 const {createImportTask,updateImportTask,beginImportDiscussion,finishImportDiscussion}=await import('../src/image-manager-model.js');
 const p=new Workspace(),id=createImportTask(p,'source',[{id:'image',name:'lid.bmp'}]);
 updateImportTask(p,id,{status:'FAILED',errors:['expired token']});
 const turn=beginImportDiscussion(p,id,'請重試',{},null);
 const result=finishImportDiscussion(p,id,turn,{message:'目錄資訊已讀取',groups:[],models:[{provider:'codex',modelId:'gpt-6.1-terra[low]'}]});
 assert.deepEqual(result.errors,[]);assert.equal(result.discussionStatus,'IDLE');assert.deepEqual(result.decisions,{});
});
