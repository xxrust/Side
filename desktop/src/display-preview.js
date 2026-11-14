// Validate the derivative's exact process-local ownership before using its URL.
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const pointsTo=(src,ref)=>typeof src==='string'&&hex(ref?.token)&&new Set([`http://agentcv-memory.localhost/${ref.token}`,`agentcv-memory://localhost/${ref.token}`]).has(src);
export function artifactDisplayPreview(artifact,runId){
 const p=artifact?.displayPreview;if(!p)return undefined;
 const a=p.reference,o=p.originalReference;
 if(p.schema!=='agentcv-display-preview-1'||p.sampling!=='bilinear-pixel-centers'||
  ![p.width,p.height,artifact.width,artifact.height].every(v=>Number.isSafeInteger(v)&&v>0)||p.width>artifact.width||p.height>artifact.height||
  !a||!o||a.kind!=='runtime-memory'||o.kind!=='runtime-memory'||a.mime!=='image/bmp'||o.mime!=='image/bmp'||
  !runId||a.runId!==runId||o.runId!==runId||a.artifactId!==artifact.id+'#display-preview'||o.artifactId!==artifact.id||
  typeof a.scope!=='string'||a.scope!==o.scope||!hex(a.sha256)||!hex(o.sha256)||a.token===o.token||
  !pointsTo(p.src,a)||!pointsTo(artifact.dataURL||artifact.dataUrl,o))throw Error('預覽與原圖身份不一致');
 return {src:p.src,width:p.width,height:p.height};
}

// Estimate the fitted output's physical pixels, not the unused viewport area.
// A future output with another aspect ratio is still protected by the renderer's
// density check, which upgrades to the original when this estimate is too small.
export function fittedPreviewLimit({width,height},source,{pixelRatio=1,padding=20}={}){
 if(![width,height,source?.width,source?.height,pixelRatio].every(v=>Number.isFinite(v)&&v>0)||!Number.isFinite(padding)||padding<0)return null;
 const inset=Math.max(0,Math.min(padding,width-1,height-1));
 const scale=Math.min((width-inset)/source.width,(height-inset)/source.height)*pixelRatio;
 const longest=Math.max(source.width,source.height);
 const limit=Math.max(64,Math.ceil((longest*scale+1)/32)*32);
 return limit>=longest||limit>4096?null:limit;
}
