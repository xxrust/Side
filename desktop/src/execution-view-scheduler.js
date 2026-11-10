// Coalesce presentation requests only. Never coalesce execution, results or saves.
export function createExecutionViewScheduler(render,{intervalMs=120}={}){
 let timer=null,last=-Infinity,disposed=false,pending=false;
 const flush=()=>{if(timer!==null)clearTimeout(timer);timer=null;if(!pending||disposed)return;pending=false;last=performance.now();render();};
 return {request(){if(disposed)return;pending=true;if(timer!==null)return;timer=setTimeout(flush,Math.max(0,intervalMs-(performance.now()-last)));},cancel(){if(timer!==null)clearTimeout(timer);timer=null;pending=false;},flush,dispose(){this.cancel();disposed=true;}};
}
