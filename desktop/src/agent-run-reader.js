import {inspectionRunReference,readCompleteInspectionRun} from './inspection-run-details.js';
import {readAlgorithmRun,describeAlgorithmRun,compactAlgorithmRun,readAlgorithmRunData} from './algorithm-workspace.js';

function current(agent,epoch,turn){if(agent.p.epoch!==epoch||agent.turn!==turn)throw Error('專案或對話已變更，未採用舊的封存紀錄');}
export async function resolveAgentAlgorithmRun(agent,args){
 const {p}=agent,epoch=p.epoch,turn=agent.turn;
 if(!args.reference_json&&(!args.run_id||p.data.algorithmRuns?.some(run=>run.runId===args.run_id))){
  const described=readAlgorithmRun(p,args.run_id),local=p.data.algorithmRuns.find(run=>run.runId===described.runId);
  if(local?.deferredProcedureTrace!==undefined){
   const loaded=await readCompleteInspectionRun(p,local,agent.ui.inspectionRecords,{isCurrent:()=>agent.p===p&&agent.turn===turn});
   current(agent,epoch,turn);return {...loaded,run:describeAlgorithmRun(p,loaded.run)};
  }
  return {run:described};
 }
 if(!args.run_id)throw Error('讀取封存紀錄需指定 run_id');
 const reference=args.reference_json?JSON.parse(args.reference_json):inspectionRunReference(p,args.run_id);
 if(!reference)throw Error('找不到此運算；若已封存，請從 get_dataset_execution 取得 recordRef 並傳入 reference_json');
 if(!agent.ui.inspectionRecords)throw Error('單件結果儲存未連接');
 const saved=await agent.ui.inspectionRecords.read(reference);current(agent,epoch,turn);
 if(saved.executionId!==reference.executionId||saved.record?.unitId!==reference.unitId)throw Error('封存紀錄的執行或工件身份不符');
 const run=saved.runs?.find(run=>run.runId===args.run_id);
 if(!run||!saved.record.runIds?.includes(args.run_id))throw Error('指定的運算不屬於此封存工件；未改讀其他結果');
 return {run:describeAlgorithmRun(p,run),reference};
}
export async function readAgentAlgorithmRun(agent,args){
 const {run,reference}=await resolveAgentAlgorithmRun(agent,args);
 const result=args.artifact_id||args.path?readAlgorithmRunData(run,{artifactId:args.artifact_id,path:args.path||'',offset:args.offset??0,limit:args.limit??32}):compactAlgorithmRun(run,{includeCode:args.include_code!==false});
 return {...result,...(reference?{recordRef:reference,storage:'archived',readWith:'get_algorithm_run(run_id, reference_json, artifact_id/path/offset/limit); get_visual_image(reference_json, run_id, artifact_id) reads one image'}:{})};
}
export async function readAgentInspectionImage(agent,args){
 if(!args.reference_json||!args.run_id||!args.artifact_id||args.source_id||args.asset_id||args.item_id)throw Error('封存圖片需 reference_json、run_id、artifact_id，不可同時指定畫板圖像');
 const epoch=agent.p.epoch,turn=agent.turn,{run,reference}=await resolveAgentAlgorithmRun(agent,args);
 const artifact=run.artifacts?.find(item=>item.id===args.artifact_id);
 if(artifact?.type!=='image')throw Error('此運算中沒有指定的圖像產物');
 const loaded=await agent.ui.inspectionRecords.artifact({...reference,runId:run.runId,artifactId:artifact.id});current(agent,epoch,turn);
 if(!/^data:image\//.test(loaded.dataURL||''))throw Error('封存產物未提供真實圖像像素');
 return {recordRef:reference,runId:run.runId,artifactId:artifact.id,sourceBinding:run.sourceBinding,current:run.current,width:artifact.width,height:artifact.height,sha256:artifact.sha256,scope:'指定的封存實算圖；未發布畫板、未切換目前工件。',_visualImages:[loaded.dataURL]};
}
