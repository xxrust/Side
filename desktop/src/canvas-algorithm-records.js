// Resolve provenance, never whichever run happens to be most recent.
export function canvasAlgorithmRecords(project,asset){
 const source=asset?.source||{},runs=project.data.algorithmRuns||[],exact=source.runId&&runs.find(r=>r.runId===source.runId);
 const row=(run,artifactId)=>({runId:run.runId,artifactId:artifactId||null,title:run.title||'算法運算',status:run.status,at:run.startedAt||'',codeSha256:run.codeSha256||null});
 if(source.runId&&(exact||source.captureMethod==='algorithm-program-output')){
  if(!exact)return {kind:'output',records:[],unavailable:'此圖綁定的算法紀錄已移除，不能用其他運算代替。'};
  const artifact=source.artifactId&&exact.artifacts?.find(a=>a.id===source.artifactId);
  if(source.artifactId&&!artifact||source.codeSha256&&source.codeSha256!==exact.codeSha256||source.artifactSha256&&source.artifactSha256!==artifact?.sha256)return {kind:'output',records:[],unavailable:'此圖的程式或產物來源與保存紀錄不一致，請核對專案來源。'};
  return {kind:'output',records:[row(exact,source.artifactId)]};
 }
 if(source.runId)return {kind:'other',records:[]}; // Built-in operator runs are not Python program records.
 if(!source.imageId)return {kind:'input',records:[]};
 return {kind:'input',records:runs.filter(run=>run.sourceBinding?.images?.some(i=>i.imageId===source.imageId&&(!source.inputSha256||i.imageSha256===source.inputSha256))).reverse().map(run=>row(run))};
}
