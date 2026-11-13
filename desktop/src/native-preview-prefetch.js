// Decode speculative native pixels without publishing them. A final, verified
// artifact still owns the URL used by the renderer; this cache owns only hidden
// Image objects so the browser can reuse its decoded resource at publication.
const groups=new Set();
const MAX_GROUPS=4,MAX_BYTES=64*1024*1024,MAX_IMAGE_BYTES=24*1024*1024;
let allocated=0;
const nativeURL=src=>typeof src==='string'&&/^(?:http:\/\/agentcv-memory\.localhost\/|agentcv-memory:\/\/localhost\/)[a-f0-9]{64}$/.test(src);
export function beginNativePreviewPrefetch({ImageClass=globalThis.Image}={}){
 const entries=new Map();let disposed=false;
 const summary={started:0,decoded:0,failed:0,bytes:0,scope:'speculative image decode overlaps native commit; no display publication'};
 const remove=src=>{const entry=entries.get(src);if(!entry)return;entries.delete(src);allocated-=entry.bytes;summary.bytes-=entry.bytes;entry.image.removeAttribute('src');};
 const dispose=()=>{if(disposed)return;disposed=true;for(const src of [...entries.keys()])remove(src);groups.delete(lease);};
 const lease={dispose,
  stage(previews){
   if(disposed||typeof ImageClass!=='function')return;
   for(const preview of Array.isArray(previews)?previews.slice(0,8):[]){
    const {src,width,height}=preview||{},bytes=width*height*4;
    if(!nativeURL(src)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||!Number.isSafeInteger(bytes)||bytes>MAX_IMAGE_BYTES||entries.has(src))continue;
    while(groups.size>MAX_GROUPS||allocated+bytes>MAX_BYTES){const oldest=groups.values().next().value;if(!oldest||oldest===lease)break;oldest.dispose();}
    if(allocated+bytes>MAX_BYTES)continue;
    const image=new ImageClass();image.crossOrigin='anonymous';image.decoding='async';entries.set(src,{image,bytes,nodeId:preview.nodeId,artifactId:preview.artifactId,width,height});allocated+=bytes;summary.bytes+=bytes;summary.started++;
    image.src=src;image.decode().then(()=>{if(!disposed&&entries.has(src))summary.decoded++;},()=>{if(!disposed&&entries.has(src)){summary.failed++;remove(src);}});
   }
  },
  complete(result){
   const actual=new Map((result.runs||[]).flatMap(run=>(run.artifacts||[]).map(a=>[a.dataUrl||a.dataURL,{nodeId:run.schemeNodeId,artifactId:a.id,width:a.width,height:a.height}])));
   for(const [src,entry] of entries){const a=actual.get(src);if(!a||['nodeId','artifactId','width','height'].some(k=>a[k]!==entry[k]))remove(src);}
   return {...summary};
  }
 };
 groups.add(lease);while(groups.size>MAX_GROUPS)groups.values().next().value.dispose();
 return lease;
}
