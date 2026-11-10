// Explanation revisions are commentary on immutable execution facts. They never
// edit code, parameters, pixels, gates, trace structure, or original author text.
import {validateOperationEvidenceJustification,PipelineEvidenceContractError,pipelineEvidenceFingerprint,hasVerifiedImagePixels} from './pipeline-evidence-contract.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const list=value=>Array.isArray(value)?value:[];
const validNotes=value=>value===undefined||typeof value==='string'&&value.trim().length>0&&value.length<=8000;
const validNodeUpdate=update=>update?.justification||update?.parameterNotes!==undefined;
export function effectiveAlgorithmRun(run){
 const revisions=list(run.evidenceRevisions);if(!revisions.length)return run;
 const result={...run,procedureTrace:run.procedureTrace?{...run.procedureTrace,nodes:list(run.procedureTrace.nodes).map(node=>({...node}))}:undefined};
 for(const revision of revisions){
  if(revision.parameterNotes!==undefined)result.explanationParameterNotes=revision.parameterNotes;
  if(revision.justification){result.originalJustification=run.justification;result.justification=copy(revision.justification);}
  for(const update of revision.nodes||[]){const node=result.procedureTrace?.nodes.find(node=>node.instanceId===update.instanceId);if(node){node.originalJustification=list(run.procedureTrace?.nodes).find(n=>n.instanceId===update.instanceId)?.justification;if(update.justification)node.justification=copy(update.justification);if(update.parameterNotes!==undefined)node.explanationParameterNotes=update.parameterNotes;if(update.evidenceGap)node.explanationEvidenceGap=update.evidenceGap;}}
 }
 result.explanationRevision=revisions.length;result.explanationScope='事後解說修訂；原始執行、產物、數值及當時依據仍保留，未重新驗證算法。';return result;
}
const selectors=j=>[...list(j?.tool?.expectedEvidence),...list(j?.parameters).map(row=>row?.verification),...list(j?.boundaries).map(row=>row?.check)].filter(Boolean);
function validateTarget(run,node,j,path,evidenceGap){
 const owned=node?list(run.artifacts).filter(a=>list(node.artifactIds).includes(a.id)):list(run.artifacts);
 const checks=list(node?node.outputs?.boundaryChecks:run.result?.boundaryChecks);
 const requiredParameters=Object.keys(node?.parameters||(!node?run.parameters:{} )||{}).map(name=>({name,source:node?.parameterSources?.[name]||'agent-proposal'}));
 const audit=validateOperationEvidenceJustification(j,{nodeId:node?.instanceId||'program',requiredParameters,evidenceArtifacts:owned.map(a=>({...a,type:a.type==='json'?'evidence':a.type})),gateIds:checks.map(c=>c.id),allowVisuals:true,requireVisualPixels:true});
 const errors=audit.errors.filter(error=>!(error.code==='TOOL_EVIDENCE_REQUIRED'&&owned.length===0&&typeof evidenceGap==='string'&&evidenceGap.trim()&&Array.isArray(j?.tool?.expectedEvidence)&&j.tool.expectedEvidence.length===0)).map(error=>({...error,path:`${path}.${error.path}`,...(error.code==='TOOL_EVIDENCE_REQUIRED'&&owned.length===0?{message:'此歷史步驟沒有保存任何圖像或數據產物。',hint:'填寫 evidenceGap 說明缺失並保留未知，tool.expectedEvidence 留空；不得借用其他步驟圖片或捏造產物。'}:{})}));
 for(const [index,selector]of selectors(j).entries()){
  if(selector.kind==='artifact'&&!owned.some(a=>(a.type==='json'?'evidence':a.type)===selector.type&&(!selector.id||a.id===selector.id)))errors.push({code:'EXPLANATION_ARTIFACT_NOT_OWNED',path:`${path}.references[${index}]`,message:'依據引用的產物不屬於此運算／步驟。',hint:'引用此步 artifactIds 中的實際產物；未做的實驗明說未驗證，不能借用其他步驟圖片。'});
  if(selector.kind==='gate'&&!checks.some(c=>c.id===selector.id))errors.push({code:'EXPLANATION_GATE_MISSING',path:`${path}.references[${index}]`,message:'原執行沒有此項邊界檢查。',hint:'引用已保存的觀察，不能在解說修訂中補造檢查。'});
  for(const visual of list(selector.visuals))if(!owned.some(a=>a.id===visual.id&&a.type==='image'&&hasVerifiedImagePixels(a)))errors.push({code:'EXPLANATION_VISUAL_NOT_OWNED',path:`${path}.references[${index}].visuals`,message:'解說圖片不存在或不屬於此步。',hint:'使用本步真實已保存圖；需要新圖或實驗時另起新運算。'});
 }
 return errors;
}
export function reviseAlgorithmEvidence(project,{run_id,expected_revision,reason,justification,parameterNotes,nodes=[]}){
 const run=list(project.data.algorithmRuns).find(run=>run.runId===run_id);if(!run)throw Error('算法運算不存在');
 const current=list(run.evidenceRevisions).length;if(current>=1000)throw Error('單次運算最多保存 1000 個解說修訂');
 if(!Number.isInteger(expected_revision)||expected_revision!==current)throw Error(`依據版本已變更：目前 revision=${current}，請重新讀取再修改。`);
 if(typeof reason!=='string'||!reason.trim()||reason.length>4000)throw Error('需要修訂原因（最多 4000 字）');
 if(!validNotes(parameterNotes))throw Error('參數補充說明須為 1–8000 字文字');
 if(!Array.isArray(nodes)||nodes.length>1000||!justification&&parameterNotes===undefined&&!nodes.length)throw Error('需要運算或步驟三項依據修訂');
 if(JSON.stringify({justification,parameterNotes,nodes}).length>1000000)throw Error('單次依據修訂最多 1 MB');
 const priorGaps=new Map(list(effectiveAlgorithmRun(run).procedureTrace?.nodes).map(node=>[node.instanceId,node.explanationEvidenceGap]));
 nodes=nodes.map(update=>update&&update.evidenceGap===undefined&&priorGaps.get(update.instanceId)?{...update,evidenceGap:priorGaps.get(update.instanceId)}:update);
 const errors=[],seen=new Set();if(justification)errors.push(...validateTarget(run,null,justification,'justification'));
 for(const [index,update]of nodes.entries()){
  const node=list(run.procedureTrace?.nodes).find(node=>node.instanceId===update?.instanceId);
  if(!node||!validNodeUpdate(update)||!validNotes(update.parameterNotes)||seen.has(update.instanceId)||Object.keys(update).some(k=>!['instanceId','justification','evidenceGap','parameterNotes'].includes(k))){errors.push({code:'EXPLANATION_NODE_INVALID',path:`nodes[${index}]`,message:'步驟不存在、重複或包含非解說修改。',hint:'以 procedureTrace 的真實 instanceId 指定一次，傳 justification 或 parameterNotes。'});continue;}
  seen.add(update.instanceId);if(update.justification)errors.push(...validateTarget(run,node,update.justification,`nodes[${index}].justification`,update.evidenceGap));
 }
 if(errors.length)throw new PipelineEvidenceContractError('ALGORITHM_EXPLANATION_REJECTED',{valid:false,status:'MISSING',errors},'解說修訂未通過引用與完整性檢查，原紀錄未修改。');
 const revision={schema:'agentcv-algorithm-explanation-revision-1',revision:current+1,id:crypto.randomUUID(),at:new Date().toISOString(),author:'agent',reason,executionFingerprint:pipelineEvidenceFingerprint({code:run.code,parameters:run.parameters,sourceBinding:run.sourceBinding,result:run.result}),...(justification?{justification:copy(justification)}:{}),...(parameterNotes!==undefined?{parameterNotes}:{}),nodes:copy(nodes),scope:'事後解說修訂，未新增實驗、未改變原運算結果，未宣稱正式驗收。'};
 project.mutate('algorithm_explanation_revised',()=>{run.evidenceRevisions||=[];run.evidenceRevisions.push(revision);},{runId:run.runId,revision:revision.revision,reason});
 return {runId:run.runId,revision:revision.revision,updatedNodes:nodes.map(n=>n.instanceId),runJustificationUpdated:!!justification,scope:revision.scope};
}

export function prepareAlgorithmEvidenceRevisions(run){
 if(run.evidenceRevisions===undefined)return;
 if(!Array.isArray(run.evidenceRevisions)||run.evidenceRevisions.length>1000)throw Error('算法解說修訂歷史格式錯誤');
 const fingerprint=pipelineEvidenceFingerprint({code:run.code,parameters:run.parameters,sourceBinding:run.sourceBinding,result:run.result}),priorGaps=new Map();
 for(const [index,revision] of run.evidenceRevisions.entries()){
  if(revision?.schema!=='agentcv-algorithm-explanation-revision-1'||revision.revision!==index+1||revision.executionFingerprint!==fingerprint||typeof revision.reason!=='string'||!revision.reason.trim()||!Array.isArray(revision.nodes)||!revision.justification&&revision.parameterNotes===undefined&&!revision.nodes.length||!validNotes(revision.parameterNotes))throw Error('算法解說修訂身份或執行綁定無效');
  const errors=[],seen=new Set();if(revision.justification)errors.push(...validateTarget(run,null,revision.justification,'justification'));
  for(const update of revision.nodes){const node=list(run.procedureTrace?.nodes).find(node=>node.instanceId===update?.instanceId);if(!node||!validNodeUpdate(update)||!validNotes(update.parameterNotes)||seen.has(update.instanceId)||Object.keys(update).some(k=>!['instanceId','justification','evidenceGap','parameterNotes'].includes(k)))throw Error('算法解說步驟修訂無效');seen.add(update.instanceId);if(update.justification)errors.push(...validateTarget(run,node,update.justification,'nodes',update.evidenceGap===undefined?priorGaps.get(update.instanceId):update.evidenceGap));if(update.evidenceGap!==undefined)priorGaps.set(update.instanceId,update.evidenceGap);}
  if(errors.length)throw new PipelineEvidenceContractError('ALGORITHM_EXPLANATION_REJECTED',{valid:false,status:'MISSING',errors},'保存的解說修訂引用無效。');
 }
}
