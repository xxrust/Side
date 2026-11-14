// QA-only observation of the existing Tauri fetch path. Never reads a body
// twice, changes transport, or records request payloads/headers (invoke keys).
export function installIpcFetchObserver(api, target=globalThis, now=()=>performance.now()){
 const original=target.fetch;
 target.fetch=function(...args){
  const sink=api.qaIpcFetch;
  const url=typeof args[0]==='string'?args[0]:args[0]?.url;
  if(!sink||!/^ipc:(?:\/\/)?/.test(url||'')&&!/^https?:\/\/ipc\.localhost\//.test(url||''))return original.apply(this,args);
  const command=new URL(url).pathname.replace(/^\//,'')||new URL(url).hostname;
  if(command!=='execute_inspection_session')return original.apply(this,args);
  const row={command,startMs:now(),scope:'Nested fetch delivery diagnostics; includes scheduling, never additive to cycle time'};
  const report=()=>{if(api.qaIpcFetch===sink)sink({...row});};
  return original.apply(this,args).then(response=>{
   row.headersMs=now();
   for(const method of ['arrayBuffer','json','text']){
    const read=response[method];if(typeof read!=='function')continue;
    response[method]=function(...readArgs){
     row.bodyMethod=method;row.bodyStartMs=now();
     return read.apply(this,readArgs).then(value=>{
      row.bodyEndMs=now();row.bytes=value instanceof ArrayBuffer?value.byteLength:undefined;report();return value;
     },error=>{row.failedAt='body';row.bodyEndMs=now();report();throw error;});
    };
   }
   return response;
  },error=>{row.failedAt='fetch';row.headersMs=now();report();throw error;});
 };
}
