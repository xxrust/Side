import '../../assets/vision-core.js';
import '../../assets/pipeline-core.js';
self.onmessage=({data})=>{try{const result=data.batch?AgentCVPipeline.runFrame(data.image,data.batch.recipe,data.batch.config,data.batch.identity):AgentCVCore.detect(data.image,data.tool);self.postMessage({id:data.id,result})}catch(e){self.postMessage({id:data.id,error:e.message})}};
