import {performance} from 'node:perf_hooks';
import {jsonSnapshot} from '../src/json-snapshot.js';
import {encodeGray8} from '../src/gray-transport.js';
import {captureAgentInputs} from '../src/agent-change-impact.js';

const average=(values)=>values.reduce((sum,value)=>sum+value,0)/values.length;
const measure=(fn,rounds=5)=>{const values=[];for(let i=0;i<rounds;i++){const started=performance.now();fn();values.push(performance.now()-started)}return average(values)};
// Kept only as a benchmark reference for the pre-optimization copier.
const legacySnapshot=value=>{
 if(value===null||typeof value!=='object')return value;
 if(Array.isArray(value))return Array.from({length:value.length},(_,index)=>legacySnapshot(value[index])??null);
 const result={};for(const key of Object.keys(value)){const item=legacySnapshot(value[key]);if(item!==undefined)Object.defineProperty(result,key,{value:item,writable:true,enumerable:true,configurable:true})}return result;
};

const width=1280,height=1024,gray=Uint8Array.from({length:width*height},(_,index)=>index&255);
const arrayRequest=()=>JSON.stringify({width,height,gray:Array.from(gray)});
const compactRequest=()=>JSON.stringify({width,height,...encodeGray8(gray)});
const snapshotInput={
 images:[{id:'image-1',width,height,dataURL:'data:image/png;base64,'+'A'.repeat(800000),objects:[]}],
 algorithmRuns:Array.from({length:6},(_,run)=>({runId:`run-${run}`,artifacts:Array.from({length:5},(_,artifact)=>({id:`artifact-${artifact}`,type:'json',data:Array.from({length:20000},(_,index)=>({index,value:index+run}))}))}))
};
const legacyImage={id:'legacy-1',width,height,dataURL:'data:image/png;base64,'+'A'.repeat(800000)};
const project={epoch:1,data:{activeId:legacyImage.id,events:[],images:[legacyImage],visualInquiry:{boards:[]}},workflow:{profiles:[],parts:[],checks:[],references:[],relations:[],pipelinePlan:null,workpiece:{id:'workpiece'}}};

const arrayJson=arrayRequest(),compactJson=compactRequest();
const firstStamp=measure(()=>captureAgentInputs(project),1);
const cachedStamp=measure(()=>captureAgentInputs(project),20);
const baselineSnapshotMs=measure(()=>legacySnapshot(snapshotInput));
const optimizedSnapshotMs=measure(()=>jsonSnapshot(snapshotInput));
console.log(JSON.stringify({
 input:{width,height,pixels:gray.length},
 nativeIpc:{arrayMiB:+(arrayJson.length/1048576).toFixed(2),compactMiB:+(compactJson.length/1048576).toFixed(2),reduction:+(1-compactJson.length/arrayJson.length).toFixed(3),arraySerializeMs:+measure(arrayRequest).toFixed(2),compactSerializeMs:+measure(compactRequest).toFixed(2)},
 undoSnapshot:{baselineSnapshotMs:+baselineSnapshotMs.toFixed(2),optimizedSnapshotMs:+optimizedSnapshotMs.toFixed(2),reduction:+(1-optimizedSnapshotMs/baselineSnapshotMs).toFixed(3),snapshotMiB:+(JSON.stringify(jsonSnapshot(snapshotInput)).length/1048576).toFixed(2)},
 agentInputStamp:{legacyFirstMs:+firstStamp.toFixed(2),legacyCachedMs:+cachedStamp.toFixed(3),stampMiB:+(JSON.stringify(captureAgentInputs(project)).length/1048576).toFixed(4)}
},null,2));
