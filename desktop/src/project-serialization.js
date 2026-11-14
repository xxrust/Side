// The runtime accepts both spellings for compatibility. They are aliases, not
// two independent assets. Persist identical encoded bytes once without changing
// the live object or omitting the only copy of an image, file or document.
export function serializeProject(value,space){
 return JSON.stringify(value,function(key,item){
  if(key==='displayPreview'&&item?.schema==='agentcv-display-preview-1')return undefined;
  if(['nativeFactRef','nativeFactFields'].includes(key)&&this.schema==='agentcv-algorithm-run-1')return undefined;
  if(key==='dataUrl'&&typeof item==='string'&&item.startsWith('data:')&&this.dataURL===item)return undefined;
  return item;
 },space);
}
