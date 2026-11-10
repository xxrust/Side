// Native queues file-open paths until the webview and recovery are ready.
// The normal loader owns unsaved-edit confirmation and cancels nothing on decline.
export function installProjectDocumentOpen({invoke,listen,ready,load,busy,onError,setTimer=setTimeout,clearTimer=clearTimeout}){
 let draining=false,again=false,disposed=false,timer,unlisten;
 async function drain(){
  if(disposed)return;
  if(draining){again=true;return;}
  if(busy()){clearTimer(timer);timer=setTimer(drain,250);return;}
  draining=true;
  try{
   await ready;
   while(!disposed){
    if(busy()){timer=setTimer(drain,250);break;}
    const path=await invoke('take_project_open');if(!path)break;
    try{const opened=await invoke('open_project_document',{path});await load(opened.content,{path:opened.path});}
    catch(error){onError('開啟專案失敗：'+error.message);}
   }
  }catch(error){onError('專案開啟入口未就緒：'+error.message);}
  finally{draining=false;if(again){again=false;void drain();}}
 }
 const started=(async()=>{unlisten=await listen('project-open-requested',()=>void drain());await ready;await drain();})().catch(error=>onError('專案開啟入口未就緒：'+error.message));
 return {started,drain,dispose(){disposed=true;clearTimer(timer);unlisten?.();}};
}
