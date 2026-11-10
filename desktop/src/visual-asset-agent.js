// Search is deliberately metadata-only and bounded. Showing a saved document
// references its original bytes in the host, rather than asking the model to emit it.
export function visualAssetSummary(entry,{detail=false}={}){
 const cap=detail?2000:500,clip=value=>typeof value==='string'?value.slice(0,cap):'',fields=['title','method','applicability','limits'];
 return {id:entry.id,role:entry.role,mime:entry.mime,sha256:entry.sha256,bytes:entry.bytes,...Object.fromEntries(fields.map(k=>[k,clip(entry[k])])),topics:(entry.topics||[]).slice(0,16),tags:(entry.tags||[]).slice(0,16),provenance:entry.provenance||{},captureCount:entry.captures?.length||0,metadataStatus:entry.metadataStatus,scope:entry.scope,descriptionTruncated:fields.some(k=>typeof entry[k]==='string'&&entry[k].length>cap),readWith:'get_visual_asset',displayWith:'show_visual_asset'};
}
export function visualAssetSearchResult(result){return {...result,entries:result.entries.map(entry=>visualAssetSummary(entry)),contentIncluded:false};}
