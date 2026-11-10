// This exports immutable evidence files for third-party viewing. Editing an
// exported snapshot cannot silently alter a saved algorithm or acceptance.
export function externalRunPayload(run){
 if(!run?.runId)throw Error('需要明確的執行紀錄');
 return {runId:run.runId,title:run.title||run.runId,code:run.code||'',codeSha256:run.codeSha256||null,
  logs:{stdout:run.stdout||'',stderr:run.stderr||'',traceback:run.traceback||'',error:run.error||null},
  environment:{environment:run.environment||null,resourceLimits:run.resourceLimits||null,sourceBinding:run.sourceBinding||null},
  data:{result:run.result??null,procedureTrace:run.procedureTrace||null,evidenceAudit:run.evidenceAudit||null,artifacts:(run.artifacts||[]).map(({dataUrl,dataURL,...artifact})=>artifact)}};
}
export const externalEditors=[{id:'system',label:'系統預設應用'},{id:'cursor',label:'Cursor'},{id:'vscode',label:'Visual Studio Code'}];
export function createExternalRunFiles(invoke){return {
 prepare:run=>invoke('prepare_external_run_files',{request:externalRunPayload(run)}),
 open:(reference,application='system')=>invoke('open_external_run_file',{reference,application})
};}
