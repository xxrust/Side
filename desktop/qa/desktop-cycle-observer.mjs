import {immutableJson} from '../src/json-snapshot.js';
import {installFrontendWorkObserver} from './frontend-work-observer.mjs';
import {installContinuousObserver} from './desktop-continuous-observer.mjs';
import {installIpcFetchObserver} from './ipc-fetch-observer.mjs';
// Opt-in release QA observer. It never dispatches a click or an algorithm.
// A human/CUA presses the ordinary application button. Production builds omit it.
import {getIdentifier} from '@tauri-apps/api/app';

export async function installDesktopCycleObserver(api){
 if(!(await getIdentifier()).endsWith('.qa'))throw Error('Refusing QA observation on a production identifier');
 await api.startupReady;
 // Full numerical results already live in the immutable unit archive. Keeping
 // copies in project metadata makes every later undo snapshot benchmark the
 // observer itself. Retain timings and content-addressed artifact references.
 const frameReference=frame=>{if(frame.src?.startsWith('data:'))return {...frame,src:'data:[original identified by observation.imageId]',encodedCharacters:frame.src.length};return frame;};
 for(const observation of api.project.data.qaInspectionObservations||[]){
  observation.frames=observation.frames?.map(frameReference);
  if(observation.results){
  observation.resultReferences=observation.results.map(({nodeId,artifacts})=>({nodeId,artifacts}));delete observation.results;
  }
 }

 // Completed QA evidence is immutable, like archived execution facts. Do not
 // make each later undo boundary clone the observer's accumulated history.
 for(const key of ['qaInspectionObservations','qaContinuousObservations'])if(Array.isArray(api.project.data[key]))api.project.data[key]=api.project.data[key].map(value=>immutableJson(value));
 const status=document.createElement('pre');status.id='qa-cycle-status';status.setAttribute('role','status');
 status.style.cssText='position:fixed;bottom:2px;left:8px;z-index:100000;background:#101e29;color:#dbeaf0;padding:5px;max-width:75vw;white-space:pre-wrap;font:12px monospace;pointer-events:none';
 status.textContent='QA ready · use the normal Execute once button';document.body.append(status);
 installFrontendWorkObserver(api);
 installIpcFetchObserver(api);
 installContinuousObserver(api,status);
 let active=false;
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-action="run-once"]');
  if(!button||button.disabled||active)return;
  const started=performance.now(),project=api.project,data=project.data,epoch=project.epoch;
  const previous=data.datasetExecutions?.at(-1)?.id;
  const operators=JSON.stringify(project.purposeScheme.operatorGraph.nodes.map(n=>({id:n.id,code:n.code,parameters:n.parameters})));
  const observed={schema:'agentcv-desktop-cycle-observation-1',startedAt:new Date().toISOString(),scope:'Actual toolbar click through current input/output decoded, controls enabled and two presentation opportunities. Natural durable archival completion recorded separately; no manual flush.'};
  observed.runtimePreparation=api.runtimePreparation?{...api.runtimePreparation}:null;
  observed.phases=[];api.qaExecutionPhase=name=>observed.phases.push([name,performance.now()-started]);
  active=true;status.textContent='QA observing real execution…';let frameCount=0,visibleAt=null;
  const fail=message=>{observed.error=message;finish();};
  const finish=async()=>{
   active=false;api.qaExecutionPhase=null;observed.elapsedMs=performance.now()-started;
   if(data!==project.data||epoch!==project.epoch){status.textContent='QA invalid: project changed';return;}
   data.qaInspectionObservations||=[];data.qaInspectionObservations.push(immutableJson(observed));
   status.textContent=observed.error?'QA FAIL: '+observed.error:`QA cycle ${observed.visibleCycleMs.toFixed(1)} ms · algorithm ${observed.algorithmMs.toFixed(1)} ms · overhead ${observed.overheadMs.toFixed(1)} ms · durable ${observed.durableObservedMs.toFixed(1)} ms`;
   try{await api.sessionRecovery.flush();}catch(error){status.textContent+='\nQA evidence save failed: '+error.message;}
  };
  const tick=()=>{
   if(data!==project.data||epoch!==project.epoch)return fail('Project changed during observation');
   if(performance.now()-started>30000)return fail('No complete, identity-matched visible/durable result within 30 seconds');
   const execution=data.datasetExecutions?.at(-1),unit=execution?.units?.at(-1),view=api.inquiryView.outputView,surface=view.surface,model=view.currentModel;
   if(!execution||execution.id===previous||execution.status==='RUNNING'||!unit){requestAnimationFrame(tick);return;}
   if(unit.execution!=='COMPLETED')return fail('Actual execution '+unit.execution);
   const runs=unit.runIds.map(id=>data.algorithmRuns.find(r=>r.runId===id));
   const images=[surface?.input?.renderer.image,surface?.image];
   const runButton=document.querySelector('[data-action="run-once"]');
   const ready=!!runButton&&!runButton.disabled&&!!surface&&!surface.pending&&surface.section.getAttribute('aria-busy')==='false'&&model?.unitId===unit.unitId
    &&unit.runIds.includes(model?.run?.runId)&&surface.input.card.dataset.imageId===model.imageId
    &&unit.imageIds.includes(model.imageId)&&images.every(image=>image&&!image.hidden&&image.complete&&image.naturalWidth>0&&image.getBoundingClientRect().width>0);
   if(!visibleAt){
    if(!ready)frameCount=0;
    else if(++frameCount>=2){
     visibleAt=performance.now();observed.visibleCycleMs=visibleAt-started;
     if(runs.some(r=>!Number.isFinite(r?.timing?.program?.algorithmMs)))return fail('Missing measured algorithm-only timing');
     if(operators!==JSON.stringify(project.purposeScheme.operatorGraph.nodes.map(n=>({id:n.id,code:n.code,parameters:n.parameters}))))return fail('Operator code or parameters changed');
     observed.algorithmMs=runs.reduce((sum,r)=>sum+r.timing.program.algorithmMs,0);observed.overheadMs=observed.visibleCycleMs-observed.algorithmMs;
     observed.executionId=execution.id;observed.unitId=unit.unitId;observed.imageId=model.imageId;
     observed.frames=images.map(image=>frameReference({width:image.naturalWidth,height:image.naturalHeight,src:image.currentSrc||image.src}));
     observed.resultReferences=runs.map(r=>({nodeId:r.schemeNodeId,runId:r.runId,artifacts:r.artifacts.map(a=>({id:a.id,type:a.type,sha256:a.sha256}))}));
     observed.unitTiming=unit.timing;observed.cold=runs.some(r=>r.timing?.resident?.coldStart);
    }
   }
   if(visibleAt&&unit.recordRef&&(!unit.archive||unit.archive.status==='SAVED')){observed.durableObservedMs=performance.now()-started;observed.recordRef=unit.recordRef;finish();return;}
   requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
 },true);
}
