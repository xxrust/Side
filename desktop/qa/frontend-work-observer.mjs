// Synchronous CPU/layout spans only, in the opt-in QA bundle. Nested spans
// overlap: totals must never be added as independent cycle-time components.
export function installFrontendWorkObserver(api){
 const wrapped=new WeakMap();
 const wrap=(target,key,label,before,after)=>{
  if(!target||typeof target[key]!=='function')return;
  let keys=wrapped.get(target);if(!keys)wrapped.set(target,keys=new Set());if(keys.has(key))return;keys.add(key);
  const original=target[key];
  target[key]=function(...args){
   before?.();
   const report=api.qaFrontendSpan;if(!report){try{return original.apply(this,args);}finally{after?.();}}
   const start=performance.now();try{return original.apply(this,args);}finally{const elapsed=performance.now()-start;after?.();report(label,elapsed);}
  };
 };
 const view=api.inquiryView;
 for(const key of ['render','syncLocalQuestion','paint'])wrap(view,key,'view.'+key);
 const instrumentFlowMap=()=>{
  const map=view.programFlow?.map;if(!map)return;
  for(const key of ['update','_render','_resize','_fit','_apply','_selection'])wrap(map,key,'flowMap.'+key);
 };
 for(const key of ['sync','renderDetails'])wrap(view.programFlow,key,'flow.'+key,instrumentFlowMap,instrumentFlowMap);
 instrumentFlowMap();
 const instrumentSurface=()=>{
  const surface=view.outputView.surface;
  for(const key of ['prepareReady','update'])wrap(surface?.input,key,'input.'+key);
  if(surface?.renderer)for(const key of ['readySource','commitSource','finishCommit','bounds','fit','paint'])wrap(Object.getPrototypeOf(surface.renderer),key,'imageRenderer.'+key);
 };
 for(const key of ['resolveModel','frameKey','target'])wrap(view.outputView,key,'output.'+key);
 wrap(view.outputView,'refresh','output.refresh',instrumentSurface);
 for(const key of ['checkpoint','event','notify','compilePurposeScheme','validatePurposeScheme','syncCanvasConsultations'])wrap(api.project,key,'project.'+key);
 for(const key of ['ensure','read'])wrap(api.project.imageStore,key,'imageStore.'+key+'.sync');
 instrumentSurface();
}
