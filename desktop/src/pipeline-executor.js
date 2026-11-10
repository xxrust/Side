import {runPipeline} from './pipeline-runtime.js';
import {nativeGrayImage} from './gray-transport.js';

// Pixel work runs outside the window; the direct path also supports Node QA.
export class PipelineExecutor {
  constructor({nativeExecute=null}={}){this.jobs=new Map();this.sequence=0;this.nativeExecute=nativeExecute;}
  execute(image,plan,options={}){
    const native=typeof this.nativeExecute==='function'&&plan?.nodes?.length&&plan.nodes.every(node=>['image.grayscale','segment.otsu','regions.components','topology.holes','geometry.annulus','geometry.two_boundary','rules.evaluate'].includes(node.op));
    if(native)return this.nativeExecute({image:nativeGrayImage(image,{sha256:image.sha256||null}),plan,planFingerprint:options.planFingerprint||null,pixelFingerprint:options.pixelFingerprint||null,inputIdentity:options.inputIdentity||null}).then(result=>({...result,backend:'rust-native'}));
    if(typeof Worker==='undefined')return runPipeline(image,plan,options);
    if(!this.worker){
      this.worker=new Worker(new URL('./pipeline-worker.js',import.meta.url),{type:'module'});
      this.worker.onmessage=({data})=>{const job=this.jobs.get(data.id);if(!job)return;this.jobs.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.result);};
      this.worker.onerror=()=>{for(const job of this.jobs.values())job.reject(Error('算子執行服務中斷，請重試'));this.jobs.clear();this.worker.terminate();this.worker=null;};
    }
    return new Promise((resolve,reject)=>{const id=++this.sequence;this.jobs.set(id,{resolve,reject});this.worker.postMessage({action:'pipeline',id,image:{width:image.width,height:image.height,gray:image.gray,sha256:image.sha256,grayProvenance:image.grayProvenance,inputInspection:image.inputInspection},plan,options});});
  }
}
