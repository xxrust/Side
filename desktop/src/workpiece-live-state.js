// Live dispatch state is process-local. Saved RUNNING history after an app crash
// must never masquerade as an active worker or replace the current image output.
const active=new WeakMap();
export function activeWorkpieceExecution(project){return active.get(project)||null;}
export function publishWorkpieceExecution(project,state){active.set(project,state);}
export function clearWorkpieceExecution(project){active.delete(project);}

// Automatic navigation prepares the next dispatch without changing the input /
// output pair being inspected. Keep only an identity, never a copied result or
// extra pixels. Any human selection or project replacement invalidates it.
const completedOutputs=new WeakMap();
export function retainCompletedWorkpieceOutput(project,execution,{imageId,nextImageId,selectionRevision}){
 completedOutputs.set(project,{data:project.data,epoch:project.epoch,executionId:execution.id,unitId:execution.units[0].unitId,schemeFingerprint:execution.schemeFingerprint,imageId,nextImageId,selectionRevision});
}
export function retainedWorkpieceOutput(project){
 const value=completedOutputs.get(project);
 if(!value)return null;
 if(value.data!==project.data||value.epoch!==project.epoch||value.selectionRevision!==project.imageSelection||value.nextImageId!==(project.image?.id||project.data.activeId)){
  completedOutputs.delete(project);return null;
 }
 return value;
}

// Runtime PNGs are created in a temporary run directory. Keep only the
// current workpiece's verified inline pixels in a process-local cache so the
// output panel remains usable after that directory is cleaned. This cache is
// intentionally separate from project.data and is never serialized.
const liveArtifactPixels=new WeakMap();
const pixelKey=(runId,artifactId)=>`${runId}\u0000${artifactId}`;

function liveState(project){
 let state=liveArtifactPixels.get(project);
 if(!state){state={unitId:null,pixels:new Map()};liveArtifactPixels.set(project,state);}
 return state;
}

export function clearWorkpieceArtifactPixels(project){
 completedOutputs.delete(project);
 const state=liveArtifactPixels.get(project);
 if(state){state.unitId=null;state.pixels.clear();}
}

export function beginWorkpieceArtifactPixels(project,unitId){
 completedOutputs.delete(project);
 const state=liveState(project);
 if(state.unitId!==unitId){state.unitId=unitId;state.pixels.clear();}
 return {unitId,count:state.pixels.size};
}

export function captureWorkpieceArtifactPixels(project,unitId,runs=[]){
 const state=liveState(project);
 beginWorkpieceArtifactPixels(project,unitId);
 for(const run of runs||[]){
  for(const artifact of run.artifacts||[]){
   if(artifact.type!=='image')continue;
   const dataURL=artifact.dataURL||artifact.dataUrl;
   if(typeof dataURL==='string'&&(/^data:image\/(?:png|jpeg|webp|bmp|svg\+xml);base64,/i.test(dataURL)||/^(?:http:\/\/agentcv-memory\.localhost\/|agentcv-memory:\/\/localhost\/)[a-f0-9]{64}$/.test(dataURL))){
    state.pixels.set(pixelKey(run.runId,artifact.id),dataURL);
    // Keep project metadata small and prevent transient process pixels from
    // being archived by an ordinary project save.
    delete artifact.dataURL;
    delete artifact.dataUrl;
   }
  }
 }
 return {unitId,count:state.pixels.size};
}

export function workpieceArtifactPixel(project,unitId,runId,artifactId){
 const state=liveArtifactPixels.get(project);
 if(!state||state.unitId!==unitId)return null;
 return state.pixels.get(pixelKey(runId,artifactId))||null;
}
