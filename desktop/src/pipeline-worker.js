import {runPipeline} from './pipeline-runtime.js';
self.onmessage=async({data})=>{try{const result=await runPipeline(data.image,data.plan,data.options);self.postMessage({id:data.id,result});}catch(error){self.postMessage({id:data.id,error:error.message});}};
