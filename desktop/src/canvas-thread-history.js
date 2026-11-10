// Presentation helpers never infer that a later global conversation belongs to
// a canvas question. New turns own saved messages; legacy reads are bounded.
export function taggedCanvasMessages(chat,threadId,turnId){return (chat||[]).filter(message=>message.canvasThreadId===threadId&&message.canvasTurnId===turnId)}
export function legacyCanvasMessages(thread,chat=[]){
 if(!Number.isInteger(thread.chatStart)||thread.chatStart<0)return [];
 const first=chat[thread.chatStart];if(first?.role!=='user'||first.text!==thread.question)return [];
 let end=thread.chatStart+1;while(end<chat.length&&chat[end].role!=='user')end++;
 return chat.slice(thread.chatStart,end).filter(message=>!message.canvasThreadId||message.canvasThreadId===thread.id);
}
export function canvasThreadTurns(thread,chat=[]){
 if(Array.isArray(thread.turns))return thread.turns;
 if(!Number.isInteger(thread.chatStart))return [];
 return [{id:'legacy-'+thread.id,question:thread.question,snapshot:thread.snapshot,revision:thread.revision,selection:thread.selection,status:thread.status==='SENDING'?'SENDING':thread.error?'FAILED':'SENT',messages:legacyCanvasMessages(thread,chat),createdAt:thread.createdAt,legacy:true,error:thread.error||null}];
}
export function canvasTurnMessages(thread,turn,chat=[]){return turn.status==='SENDING'?[...(turn.messages||[]),...taggedCanvasMessages(chat,thread.id,turn.id)]:turn.messages||[]}
export function canvasRuntimeDescription(runtime){
 if(!runtime)return '';
 if(runtime.restoredSavedText)return '執行會話已重建，已補入保存文字；圖像與工具狀態仍需重新讀取。';
 if(runtime.sessionReused)return '同一問題，沿用目前執行會話。';
 if(runtime.sessionId)return '本問題使用獨立的執行會話。';
 return '';
}

export function canvasThreadDraft(thread){const latest=thread.turns?.at(-1);if(thread.status==='SENDING'||thread.status==='SENT'&&thread.question===(latest?.question||thread.question))return '';return thread.question||'';}
