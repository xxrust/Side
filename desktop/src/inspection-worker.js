import {foregroundCandidates,inspectImage} from './inspection.js';
self.onmessage=({data})=>{try{const result=data.action==='foreground'?foregroundCandidates(data.image,{parameters:data.parameters}):inspectImage(data.image,data.recipe,data.scale);self.postMessage({id:data.id,result})}catch(e){self.postMessage({id:data.id,error:e.message})}};
