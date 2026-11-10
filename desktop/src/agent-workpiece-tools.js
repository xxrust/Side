import {compareBaselineExecutions} from './project-acceptance.js';
import {algorithmRunIndex} from './algorithm-workspace.js';
import {readDatasetExecution} from './workpiece-runner.js';
const read=(p,name,...args)=>{if(typeof p[name]!=='function')throw Error('目前宿主缺少 '+name);return p[name](...args)};
export const workpieceToolNames=new Set(['get_project_acceptance','propose_project_acceptance','run_acceptance_baseline','compare_acceptance_runs','rebind_canvas_card','get_canvas_consultations','apply_canvas_consultation','get_dataset_images','run_workpiece_scheme','run_dataset_scheme','get_agent_job','get_dataset_execution','get_inspection_unit','get_canvas_layers','add_canvas_card','reference_canvas_layer','set_canvas_layer_visibility']);
export async function executeWorkpieceTool(agent,name,args){
 const p=agent.p,boardId=args.board_id||agent.visualBoardId()||p.ensureInquiry().activeBoardId;
 if(name==='get_project_acceptance')return p.acceptanceContext({baselineId:args.baseline_id,caseId:args.case_id,offset:args.offset,limit:args.limit});
 if(name==='propose_project_acceptance'){const result=p.proposeAcceptance(JSON.parse(args.draft_json));agent.ui.refresh();return result;}
 if(name==='compare_acceptance_runs')return compareBaselineExecutions(p,args.before_id,args.after_id);
 if(name==='run_acceptance_baseline'){const result=await agent.ui.runPurposeScheme(p.baselineRunOptions(args.baseline_id));agent.ui.refresh();return {execution:result.execution,scope:result.scope};}
 if(name==='rebind_canvas_card'){const result=read(p,'rebindCanvasCard',boardId,args.card_id,args.source_id);agent.ui.refresh();return result;}
 if(name==='get_canvas_consultations')return read(p,'readCanvasConsultations',{boardId,...(args.card_id?{cardId:args.card_id}:{}),...(args.source_id?{sourceId:args.source_id}:{})});
 if(name==='apply_canvas_consultation'){const result=read(p,'applyCanvasConsultation',{boardId,cardId:args.card_id,questionId:args.question_id,answerAt:args.answer_at,expectedSchemeFingerprint:args.expected_scheme_fingerprint,patch:JSON.parse(args.patch_json),reason:args.reason});agent.ui.refresh();return result;}
 if(name==='get_dataset_images')return p.listImageRecords({sourceId:args.source_id,offset:args.offset??0,limit:Math.min(args.limit??50,200)});
 if(name==='get_agent_job'){if(!agent.ui.readPurposeSchemeJob)throw Error('背景任務讀取器未連接');return agent.ui.readPurposeSchemeJob(args.job_id);}
 if(name==='get_dataset_execution')return readDatasetExecution(p,args.execution_id,{offset:args.offset??0,limit:args.limit??50});
 if(name==='get_inspection_unit'){if(!agent.ui.inspectionRecords)throw Error('單件結果儲存未連接');const reference=JSON.parse(args.reference_json),saved=await(args.open_on_canvas&&agent.ui.openInspectionUnit?agent.ui.openInspectionUnit(reference):agent.ui.inspectionRecords.read(reference));return {...saved,context:args.include_scheme?saved.context:{schemeId:saved.context?.scheme?.id,schemeFingerprint:saved.context?.schemeFingerprint,nodeCount:saved.context?.scheme?.operatorGraph?.nodes?.length,read:'get_inspection_unit(reference_json, include_scheme:true) explicitly reads the archived scheme'},recordRef:reference,runs:(saved.runs||[]).map(run=>({...algorithmRunIndex(run),recordRef:reference})),scope:'單件摘要；完整歷史方案只在 include_scheme:true 時回傳。用 get_algorithm_run(run_id, reference_json) 讀程式及數據；get_visual_image(reference_json, run_id, artifact_id) 只讀指定封存圖，不切換畫板。'};}
 if(name==='run_workpiece_scheme'||name==='run_dataset_scheme'){
  if(!agent.ui.runPurposeScheme)throw Error('完整方案執行器未連接');
  const imageIds=args.image_ids||[p.image?.id],options=name==='run_workpiece_scheme'?{sourceId:args.source_id,units:[{id:args.unit_id||crypto.randomUUID(),imageIds,...(args.views_json?{views:JSON.parse(args.views_json)}:{})}]}:{sourceId:args.source_id,...(args.resume_execution_id?{resumeExecutionId:args.resume_execution_id}:{}),...(args.units_json?{units:JSON.parse(args.units_json)}:{})};
  const epoch=p.epoch,turn=agent.turn;
  if(name==='run_dataset_scheme'&&args.async!==false){if(!agent.ui.startPurposeSchemeJob)throw Error('背景任務啟動器未連接');return {...agent.ui.startPurposeSchemeJob(options),scope:'背景逐件執行；用 get_agent_job 讀取狀態，再用 get_dataset_execution 讀取實算。'};}
  const result=await agent.ui.runPurposeScheme(options);if(p.epoch!==epoch||agent.turn!==turn)throw Error('原回合已停止；已完成單件保留於原執行紀錄。');
  const visual=[];if(agent.visualBoardId())for(const run of result.runs||[])visual.push(await agent.publishVisualRun({run_id:run.runId}));
  agent.ui.refresh();return {compilation:result.compilation,execution:result.execution,visual,scope:result.scope,delivered:false};
 }
 if(name==='add_canvas_card'){const card=read(p,'addCanvasCard',boardId,{kind:args.kind,sourceId:args.source_id,...(args.title?{title:args.title}:{})});agent.ui.refresh();return card;}
 if(name==='reference_canvas_layer'){const ref=read(p,'referenceCanvasLayer',boardId,{itemId:args.item_id,runId:args.run_id,layerId:args.layer_id,...(args.transform?{transform:args.transform}:{})});agent.ui.refresh();return ref;}
 if(name==='set_canvas_layer_visibility'){const result=read(p,'setCanvasLayerVisibility',boardId,args.reference_id,args.visible);agent.ui.refresh();return result;}
 if(name==='get_canvas_layers'){
  const value=read(p,'getCanvasStructuredContext',boardId,{itemIds:args.item_ids,runId:args.run_id}),offset=args.offset??0,limit=args.limit??128;if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>1024)throw Error('幾何分頁需有效offset與1–1024的limit');
  const layers=value.layers.filter(l=>(!args.layer_id||l.id===args.layer_id)&&(!args.run_id||l.runId===args.run_id));
  return {...value,layers:layers.slice(0,32).map(l=>({...l,objects:(l.objects||[]).filter(o=>!args.object_id||o.id===args.object_id).slice(0,64).map(o=>{const points=o.geometry?.points;return Array.isArray(points)?{...o,geometry:{...o.geometry,points:points.slice(offset,offset+limit)},pointCount:points.length,offset,truncated:offset+limit<points.length}:o})})),truncatedLayers:layers.length>32};
 }
 throw Error('未知單件工具：'+name);
}
