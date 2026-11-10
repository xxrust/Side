export class Engine {
  constructor(){this.worker=new Worker(new URL('./engine-worker.js',import.meta.url),{type:'module'});this.jobs=new Map();this.worker.onmessage=({data})=>{const job=this.jobs.get(data.id);if(!job)return;this.jobs.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.result)};this.worker.onerror=()=>{for(const j of this.jobs.values())j.reject(Error('算法程序異常，請重新開啟專案'));this.jobs.clear()}}
  execute(image,tool,batch){return new Promise((resolve,reject)=>{const id=crypto.randomUUID();this.jobs.set(id,{resolve,reject});this.worker.postMessage({id,image:{width:image.width,height:image.height,gray:image.gray},tool,batch})})}
}
