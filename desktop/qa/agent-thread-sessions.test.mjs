// Host protocol tests inspect serialized inputs and lifecycle handling; real model acceptance is pi-thread-session-live.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Workspace} from '../src/workspace.js';
import {savedThreadTurns,branchThreadMessages} from '../src/agent-thread-context.js';
import {Agent} from '../src/agent.js';
function host(){const p=new Workspace();p.data=JSON.parse(fs.readFileSync(new URL('../../reviews/2026-10-27-program-flow/actual-pi-workspace-portable.agentcv.json',import.meta.url)));const agent=new Agent(p,{page:()=>6,locked:()=>false,update(){},activity(){},reference:()=>null}),commands=[];agent.connected=true;agent.model='protocol-only';agent.wire=async command=>commands.push(command);return {p,agent,commands}}
const finish=agent=>agent.event({type:'turn_end',turn:agent.turn});
test('host carries same-thread saved history, isolates unrelated questions and records explicit branch scope',async()=>{
 const {p,agent,commands}=host();await agent.send('A專屬問題',null,{conversation:{threadId:'A',turnId:'A1'}});const first=commands.at(-1);assert.equal(p.data.chat.at(-1).canvasThreadId,'A');assert.equal(p.data.chat.at(-1).canvasTurnId,'A1');await finish(agent);
 await agent.send('B專屬問題',null,{conversation:{threadId:'B',turnId:'B1'}});const isolated=commands.at(-1);assert.ok(!isolated.message.includes('A專屬問題'));assert.notEqual(isolated.session_key,first.session_key);await finish(agent);
 await agent.send('A後續問題',null,{conversation:{threadId:'A',turnId:'A2'}});const continuation=commands.at(-1);assert.equal(continuation.session_key,first.session_key);assert.match(continuation.message,/A專屬問題/);assert.ok(!continuation.message.includes('B專屬問題'));await finish(agent);
 await agent.send('明確分支',null,{conversation:{threadId:'C',turnId:'C1',parentThreadId:'A',parentTurnId:'A1'}});assert.equal(commands.at(-1).parent_thread_id,'A');assert.match(commands.at(-1).message,/明確分支來源文字/);assert.ok(!commands.at(-1).message.includes('A後續問題'));assert.ok(!commands.at(-1).message.includes('B專屬問題'));
});
test('model route receipts and terminal errors retain canvas turn identity through completion',async()=>{
 const {agent,p}=host();await agent.send('測試生命週期',null,{conversation:{threadId:'A',turnId:'A1'}});const turn=agent.turn;
 await agent.event({type:'session_route',turn,sessionId:'real-route-id',sessionReused:false,restoredSavedText:true});assert.deepEqual(agent.lastRuntimeSession,{sessionId:'real-route-id',sessionReused:false,restoredSavedText:true,threadId:'A',turnId:'A1'});
 await agent.event({type:'agent_error',turn,category:'network',error:'network failure'});assert.equal(agent.lastTurnError.turnId,'A1');assert.equal(agent.lastTurnError.code,'network');assert.equal(p.data.chat.at(-1).canvasTurnId,'A1');await finish(agent);assert.equal(agent.lastTurnError.threadId,'A');
 await agent.send('下一輪',null,{conversation:{threadId:'A',turnId:'A2'}});assert.equal(agent.lastTurnError,null);agent.stop();assert.equal(agent.lastTurnError.code,'CANCELLED');assert.equal(agent.lastTurnError.turnId,'A2');
});
test('invalid conversation identity never sends and saved thread text is scoped explicitly',async()=>{
 const {agent,commands}=host();await assert.rejects(agent.send('錯誤識別',null,{conversation:{threadId:'\n'}}),/格式/);assert.equal(commands.length,0);
 await agent.send('恢復文字',null,{conversation:{threadId:'A',turnId:'A1'},contextTurns:[{threadId:'A',question:'同問題保存內容',messages:[]},{threadId:'B',question:'不相關保存內容',messages:[]}]});assert.match(commands.at(-1).message,/同問題保存內容/);assert.ok(!commands.at(-1).message.includes('不相關保存內容'));assert.equal(commands.at(-1).saved_history_count,1);
});

test('legacy restored branch uses verified single-turn bounds rather than subsequent unrelated chat',()=>{
 const {p}=host();p.data.chat=[{role:'user',text:'legacy原問題'},{role:'assistant',text:'legacy真保存回覆'},{role:'user',text:'後續其他問題'},{role:'assistant',text:'不可混入的後續回覆'}];p.data.canvasThreads=[{id:'old',question:'legacy原問題',chatStart:0,snapshot:{revision:1}}];
 assert.equal(savedThreadTurns(p,'old')[0].id,'legacy-old');assert.deepEqual(branchThreadMessages(p,'old','legacy-old').map(m=>m.text),['legacy原問題','legacy真保存回覆']);assert.deepEqual(branchThreadMessages(p,'old','missing-turn'),[]);
 p.data.canvasThreads[0].chatStart=2;assert.deepEqual(savedThreadTurns(p,'old')[0].messages,[]);
});
