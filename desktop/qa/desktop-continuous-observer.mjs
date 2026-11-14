import {invoke} from '@tauri-apps/api/core';
import {immutableJson} from '../src/json-snapshot.js';
import {artifactDisplayPreview} from '../src/display-preview.js';
// Passive QA: normal toolbar dispatch only. Never calls execute or archive flush.
export function installContinuousObserver(api,status){
 let active=false;
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-action="run-continuous"]');if(!button||button.disabled||active)return;
  const project=api.project,data=project.data,epoch=project.epoch,start=performance.now(),rows=[];
  const operators=JSON.stringify(project.purposeScheme.operatorGraph.nodes.map(n=>({id:n.id,code:n.code,parameters:n.parameters})));
  const observation={schema:'agentcv-continuous-desktop-observation-1',startedAt:new Date().toISOString(),scope:'First unit includes toolbar dispatch/preflight. Each later unit starts at runner iteration entry. Completion includes matching decoded input/output over two presentation opportunities and natural durable archive. No manual flush.',runtimePreparation:api.runtimePreparation,rows};
  observation.budgetPolicy={limitMs:100,firstUnitExempt:true,scope:'First unit remains measured and must execute, display and save successfully; only its latency limit is waived'};
  observation.phases=[];api.qaExecutionPhase=name=>{if(observation.phases.length<10000)observation.phases.push([name,performance.now()-start]);};
  observation.previewImages=[];api.qaPreviewImage=row=>{if(observation.previewImages.length<1000)observation.previewImages.push({...row,atMs:row.atMs-start});};
  observation.ipcFetch=[];api.qaIpcFetch=row=>{if(observation.ipcFetch.length<1000){for(const key of ['startMs','headersMs','bodyStartMs','bodyEndMs'])if(Number.isFinite(row[key]))row[key]-=start;observation.ipcFetch.push(row);}};
  // The archive callback follows receipt application and acknowledgement. It
  // is an upper bound on application, not the native writer completion time.
  observation.archiveNotifications=[];api.qaArchiveStatus=state=>{for(const item of state.items||[])if(observation.archiveNotifications.length<2000)observation.archiveNotifications.push({atMs:performance.now()-start,queueId:state.queueId,archiveId:item.archiveId,executionId:item.identity?.executionId,unitId:item.identity?.unitId,status:item.status,timing:item.timing});};
  const surfaceState=()=>({visibility:document.visibilityState,focused:document.hasFocus()});
  observation.surfaceStates=[{atMs:0,event:'start',...surfaceState()}];
  const surfaceChanged=event=>{if(observation.surfaceStates.length<1000)observation.surfaceStates.push({atMs:performance.now()-start,event:event.type,...surfaceState()});};
  document.addEventListener('visibilitychange',surfaceChanged);window.addEventListener('focus',surfaceChanged);window.addEventListener('blur',surfaceChanged);
  observation.frontendSpans={};observation.longFrontendSpans=[];
  api.qaFrontendSpan=(name,ms)=>{const item=observation.frontendSpans[name]||(observation.frontendSpans[name]={count:0,totalMs:0,maxMs:0});item.count++;item.totalMs+=ms;item.maxMs=Math.max(item.maxMs,ms);if(ms>=2&&observation.longFrontendSpans.length<2000)observation.longFrontendSpans.push({name,ms,atMs:performance.now()-start});};
  // A timer heartbeat distinguishes missing animation frames from gaps in
  // ordinary callback delivery; it does not identify GC or OS scheduling.
  observation.timerGaps=[];let lastTimer=performance.now();
  const heartbeat=setInterval(()=>{const now=performance.now();if(now-lastTimer>25&&observation.timerGaps.length<4096)observation.timerGaps.push({atMs:now-start,gapMs:now-lastTimer,...surfaceState()});lastTimer=now;},10);
  active=true;status.textContent='QA continuous observing…';
  api.qaWorkpieceStarted=unit=>rows.push({...unit,startMs:rows.length?performance.now()-start:0,frames:0});
  const finish=async error=>{
   if(!active)return;active=false;clearInterval(heartbeat);api.qaWorkpieceStarted=null;api.qaFrontendSpan=null;api.qaExecutionPhase=null;api.qaIpcFetch=null;api.qaArchiveStatus=null;api.qaPreviewImage=null;observation.elapsedMs=performance.now()-start;
   document.removeEventListener('visibilitychange',surfaceChanged);window.removeEventListener('focus',surfaceChanged);window.removeEventListener('blur',surfaceChanged);
   if(error)observation.error=error;
   if(data!==project.data||epoch!==project.epoch){status.textContent='QA continuous invalid: project changed';return;}
   observation.maxOverheadMs=rows.length&&rows.every(r=>Number.isFinite(r.overheadMs))?Math.max(...rows.map(r=>r.overheadMs)):null;
   try{observation.memoryDelivery=await invoke('memory_delivery_diagnostics');}catch(error){observation.memoryDelivery={error:String(error)};}
   data.qaContinuousObservations||=[];data.qaContinuousObservations.push(immutableJson(observation));
   status.textContent=error?'QA continuous FAIL: '+error:`QA continuous ${rows.length} units · max overhead ${observation.maxOverheadMs.toFixed(1)} ms`;
   try{await api.sessionRecovery.flush();}catch(e){status.textContent+=' · evidence save failed: '+e.message;}
  };
  let previousTick=null;
  observation.frameGaps=[];
  // Include synchronous layout forced by readiness checks in observer cost.
  // This diagnoses measurement intrusion without weakening presentation gates.
  observation.observerWork={count:0,totalMs:0,maxMs:0,longTicks:[]};
  const tick=()=>{
   const started=performance.now();
   try{return observeTick();}finally{
    const ms=performance.now()-started,work=observation.observerWork;
    work.count++;work.totalMs+=ms;work.maxMs=Math.max(work.maxMs,ms);
    if(ms>=2&&work.longTicks.length<2000)work.longTicks.push({atMs:started-start,ms});
   }
  };
  const observeTick=()=>{
   if(!active)return;
   const tickStarted=performance.now();
   if(previousTick!==null&&tickStarted-previousTick>25&&observation.frameGaps.length<4096)observation.frameGaps.push({atMs:tickStarted-start,gapMs:tickStarted-previousTick,...surfaceState()});
   previousTick=tickStarted;
   if(data!==project.data||epoch!==project.epoch)return void finish('Project changed');
   if(performance.now()-start>120000)return void finish('Continuous observation timeout');
   for(const row of rows){
    if(row.complete)continue;
    const execution=data.datasetExecutions.find(e=>e.id===row.executionId),unit=execution?.units.find(u=>u.unitId===row.unitId);if(!unit)continue;
    if(unit.execution!=='COMPLETED')return void finish('Unit execution '+unit.execution);
    if(row.algorithmMs===undefined){
     const runs=unit.runIds.map(id=>data.algorithmRuns.find(r=>r.runId===id));
     if(runs.some(r=>!Number.isFinite(r?.timing?.program?.algorithmMs)))return void finish('Missing measured algorithm timing');
     row.algorithmMs=runs.reduce((sum,r)=>sum+r.timing.program.algorithmMs,0);row.runIds=unit.runIds;row.unitTiming=unit.timing;
    }
    const view=api.inquiryView.outputView,s=view.surface,m=view.currentModel,images=[s?.input?.renderer.image,s?.image];
    const artifact=view.currentArtifact,source=s?.renderer.source,preview=artifactDisplayPreview(artifact,m?.run?.runId),input=project.imageRecord(m?.imageId);
    const outputSize=s?.renderer.previewActive?preview:artifact;
    const sourceMatches=!!artifact&&source?.src===(artifact.dataURL||artifact.dataUrl)&&source.width===artifact.width&&source.height===artifact.height&&images[1]?.getAttribute('src')===(s.renderer.previewActive?preview?.src:source.src)&&images[1]?.naturalWidth===outputSize?.width&&images[1]?.naturalHeight===outputSize?.height&&images[0]?.naturalWidth===input?.width&&images[0]?.naturalHeight===input?.height;
    const ready=sourceMatches&&!!s&&!s.pending&&s.section.getAttribute('aria-busy')==='false'&&m?.unitId===row.unitId&&row.runIds.includes(m?.run?.runId)&&row.imageIds.includes(m.imageId)&&s.input.card.dataset.imageId===m.imageId&&images.every(i=>i&&!i.hidden&&i.complete&&i.naturalWidth&&i.getBoundingClientRect().width>0);
    const elapsed=performance.now()-start-row.startMs;
    if(row.visibleMs===undefined){
     row.presentationChecks||=[];
     if(row.presentationChecks.length<16)row.presentationChecks.push({atMs:performance.now()-start,ready,pending:!!s?.pending,busy:s?.section.getAttribute('aria-busy'),modelUnitId:m?.unitId,inputImageId:s?.input?.card.dataset.imageId});
    }
    if(row.visibleMs===undefined){if(!ready)row.frames=0;else if(++row.frames>=2){row.visibleMs=elapsed;row.displayDimensions=images.map(i=>[i.naturalWidth,i.naturalHeight]);row.displayIdentity={originalDimensions:[source.width,source.height],previewActive:!!s.renderer.previewActive,preview:artifact.displayPreview||null,sourceMatches};}}
    if(row.durableMs===undefined&&unit.recordRef&&(!unit.archive||unit.archive.status==='SAVED')){row.durableMs=elapsed;row.recordRef=unit.recordRef;}
    if(row.visibleMs!==undefined&&row.durableMs!==undefined){row.complete=true;row.totalMs=Math.max(row.visibleMs,row.durableMs);row.overheadMs=row.totalMs-row.algorithmMs;}
   }
   const execution=rows.length&&data.datasetExecutions.find(e=>e.id===rows[0].executionId),control=document.querySelector('[data-action="run-continuous"]');
   if(execution&&execution.status!=='RUNNING'&&control&&!control.disabled){
    if(rows.length!==execution.processed)return void finish('Unit observation count mismatch');
    if(rows.every(r=>r.complete)){
     if(operators!==JSON.stringify(project.purposeScheme.operatorGraph.nodes.map(n=>({id:n.id,code:n.code,parameters:n.parameters}))))return void finish('Operator changed');
     return void finish();
    }
   }
   requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
 },true);
}
