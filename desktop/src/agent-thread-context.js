import {programFlowAgentReference} from './program-flow-inquiry.js';
// Saved messages are context, never an assertion that Pi's tool session survived.
const conversational=message=>['user','assistant'].includes(message.role||message.author);
const clean=message=>({role:message.role||message.author,text:message.text||'',...(message.reference?.kind==='program_flow'?{reference:programFlowAgentReference(message.reference)}:{})});
function legacyMessages(data,thread){
 if(!Number.isInteger(thread.chatStart))return [];
 const tail=(data.chat||[]).slice(thread.chatStart),first=tail.find(conversational);
 if(!first||first.text!==thread.question)return [];
 const messages=[];for(const message of tail){
  if(message.canvasThreadId&&message.canvasThreadId!==thread.id)continue;
  if((message.role||message.author)==='user'&&messages.some(m=>m.role==='user'))break;
  if(conversational(message))messages.push(clean(message));
 }
 return messages;
}
export function savedThreadTurns(project,threadId){
 const thread=(project.data.canvasThreads||[]).find(t=>t.id===threadId);if(!thread)return [];
 if(Array.isArray(thread.turns))return thread.turns.filter(t=>t.status!=='SENDING').map(t=>({id:t.id,threadId,question:t.question,messages:(t.messages||[]).filter(conversational).map(clean),snapshotRevision:t.snapshot?.revision,...(t.reference?.kind==='program_flow'?{reference:programFlowAgentReference(t.reference)}:{})}));
 return [{id:'legacy-'+thread.id,threadId,question:thread.question,messages:legacyMessages(project.data,thread),snapshotRevision:thread.snapshot?.revision}];
}
export function branchThreadMessages(project,threadId,throughTurnId){
 const turns=savedThreadTurns(project,threadId);
 if(turns.length){const end=throughTurnId?turns.findIndex(t=>t.id===throughTurnId):turns.length-1;return turns.slice(0,end+1).flatMap(t=>t.messages.length?t.messages:[{role:'user',text:t.question||'',...(t.reference?.kind==='program_flow'?{reference:programFlowAgentReference(t.reference)}:{})}]);}
 const messages=(project.data.chat||[]).filter(m=>conversational(m)&&m.canvasThreadId===threadId),end=throughTurnId?messages.findLastIndex(m=>m.canvasTurnId===throughTurnId):messages.length-1;
 return messages.slice(0,end+1).map(clean);
}
