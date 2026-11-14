// Coalesce presentation requests only. Never coalesce execution, results or saves.
export function createExecutionViewScheduler(render,{intervalMs=120}={}){
 let timer=null,last=-Infinity,disposed=false,pending=false;
 const flush=()=>{if(timer!==null)clearTimeout(timer);timer=null;if(!pending||disposed)return;pending=false;last=performance.now();render();};
 return {request({immediate=false}={}){if(disposed)return;pending=true;if(immediate){flush();return;}if(timer!==null)return;timer=setTimeout(flush,Math.max(0,intervalMs-(performance.now()-last)));},cancel(){if(timer!==null)clearTimeout(timer);timer=null;pending=false;},flush,dispose(){this.cancel();disposed=true;}};
}

// Only a newly published completed unit bypasses progress throttling. Record
// its identity before rendering because synchronous view work can emit events.
export function createCompletionViewUpdates(scheduler,readCompleted){
 let last=null;
 return ()=>{const completed=readCompleted();const immediate=!!completed&&completed!==last;last=completed;scheduler.request({immediate});};
}
