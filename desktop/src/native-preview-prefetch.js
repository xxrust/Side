import {artifactDisplayPreview} from './display-preview.js';
// Decode speculative native pixels without publishing them. A final, verified
// artifact still owns the URL used by the renderer. After final verification,
// transfer the decoded element itself instead of fetching a no-store URL again.
const groups=new Set();
const MAX_GROUPS=4,MAX_BYTES=64*1024*1024,MAX_IMAGE_BYTES=24*1024*1024;
let allocated=0;
export function takeVerifiedNativePreview({src,width,height},{readyOnly=false}={}){
 for(const group of groups){const frame=group.take(src,width,height,readyOnly);if(frame)return frame;}
 return null;
}
const nativeURL=src=>typeof src==='string'&&/^(?:http:\/\/agentcv-memory\.localhost\/|agentcv-memory:\/\/localhost\/)[a-f0-9]{64}$/.test(src);
export function beginNativePreviewPrefetch({ImageClass=globalThis.Image}={}){
 const entries=new Map();let disposed=false;
 const summary={started:0,decoded:0,failed:0,bytes:0,scope:'speculative image decode overlaps native commit; no display publication'};
 const remove=src=>{const entry=entries.get(src);if(!entry)return;entries.delete(src);allocated-=entry.bytes;summary.bytes-=entry.bytes;entry.image.removeAttribute('src');};
 const dispose=()=>{if(disposed)return;disposed=true;for(const src of [...entries.keys()])remove(src);groups.delete(lease);};
 const lease={dispose,
  take(src,width,height,readyOnly=false){
   const entry=entries.get(src);
   if(disposed||!entry?.verified||entry.width!==width||entry.height!==height||readyOnly&&!entry.decoded)return null;
   // Ownership moves to one renderer. Eviction must never blank its live image.
   entries.delete(src);allocated-=entry.bytes;summary.bytes-=entry.bytes;
   return {image:entry.image,ready:entry.ready};
  },
  stage(previews){
   if(disposed||typeof ImageClass!=='function')return;
   for(const preview of Array.isArray(previews)?previews.slice(0,8):[]){
    const {src,width,height}=preview||{},bytes=width*height*4;
    if(!nativeURL(src)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||!Number.isSafeInteger(bytes)||bytes>MAX_IMAGE_BYTES||entries.has(src))continue;
    while(groups.size>MAX_GROUPS||allocated+bytes>MAX_BYTES){const oldest=groups.values().next().value;if(!oldest||oldest===lease)break;oldest.dispose();}
    if(allocated+bytes>MAX_BYTES)continue;
    const image=new ImageClass();image.crossOrigin='anonymous';image.decoding='async';const entry={image,bytes,nodeId:preview.nodeId,artifactId:preview.artifactId,width,height,verified:false};entries.set(src,entry);allocated+=bytes;summary.bytes+=bytes;summary.started++;
    if(import.meta.env?.VITE_INSPECTION_QA==='1')globalThis.AgentCVDesktop?.qaExecutionPhase?.('preview-decode-start');
    if(import.meta.env?.VITE_INSPECTION_QA==='1'){
     const sink=globalThis.AgentCVDesktop?.qaPreviewImage;
     const report=phase=>{if(sink&&globalThis.AgentCVDesktop?.qaPreviewImage===sink)sink({phase,src,nodeId:preview.nodeId,artifactId:preview.artifactId,atMs:performance.now()});};
     image.addEventListener?.('load',()=>report('load'),{once:true});
     image.addEventListener?.('error',()=>report('error'),{once:true});
     entry.report=report;report('start');
    }
    image.src=src;entry.ready=image.decode();
    if(entry.report)entry.ready.then(()=>entry.report('decoded'),()=>entry.report('decode-error'));entry.ready.then(()=>{if(import.meta.env?.VITE_INSPECTION_QA==='1')globalThis.AgentCVDesktop?.qaExecutionPhase?.('preview-decode-ready');entry.decoded=true;if(!disposed&&entries.has(src))summary.decoded++;},()=>{if(!disposed&&entries.has(src)){summary.failed++;remove(src);}});
   }
  },
  complete(result){
   const actual=new Map((result.runs||[]).flatMap(run=>(run.artifacts||[]).map(a=>{const p=artifactDisplayPreview(a,run.runId);return [p?.src||a.dataUrl||a.dataURL,{nodeId:run.schemeNodeId,artifactId:a.id,width:p?.width||a.width,height:p?.height||a.height}];})));
   for(const [src,entry] of entries){const a=actual.get(src);if(!a||['nodeId','artifactId','width','height'].some(k=>a[k]!==entry[k]))remove(src);else entry.verified=true;}
   return {...summary};
  }
 };
 groups.add(lease);while(groups.size>MAX_GROUPS)groups.values().next().value.dispose();
 return lease;
}
