import {validateNodeDocumentation} from './node-documentation.js';
import {OPERATOR_REGISTRY,validatePipeline} from './pipeline-registry.js';

export const PIPELINE_EVIDENCE_SCHEMA='agentcv-pipeline-evidence-audit-1';
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
// Availability is independent of transport. Native references have already
// passed host file/PNG/hash verification; this checks that the saved descriptor
// still agrees with that receipt. Ownership remains the caller's scoped catalog.
export function hasVerifiedImagePixels(image){
  if(!object(image)||image.type!=='image')return false;
  if(image.dataURL||image.dataUrl)return true; // Existing inline execution transport.
  if(image.hostBytesVerified!==true||!Number.isSafeInteger(image.width)||image.width<1||!Number.isSafeInteger(image.height)||image.height<1||!Number.isSafeInteger(image.bytes)||image.bytes<1||!/^image\/[a-z0-9.+-]+$/i.test(image.mime||'')||!/^[a-f0-9]{64}$/.test(image.sha256||''))return false;
  const absolute=path=>typeof path==='string'&&path.length>1&&path.length<=4096&&!/[\x00-\x1f]/.test(path)&&(/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path))&&!path.split(/[\\/]/).includes('..');
  const reference=image.assetRef;
  if(reference!==undefined){
    if(!object(reference)||reference.sha256!==image.sha256||reference.mime!==image.mime||reference.size!==undefined&&reference.size!==image.bytes||reference.width!==undefined&&reference.width!==image.width||reference.height!==undefined&&reference.height!==image.height)return false;
    if(reference.$asset!==undefined){
      if(typeof reference.$asset!=='string'||!new RegExp('^assets/'+image.sha256+'\\.[a-z0-9]+$').test(reference.$asset)||reference.size!==image.bytes||reference.root!==undefined&&!absolute(reference.root))return false;
      return true;
    }
    if(reference.kind!=='algorithm-artifact'||!absolute(reference.path)||image.path!==undefined&&image.path!==reference.path)return false;
    return true;
  }
  return absolute(image.path);
}
const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(stable).join(',')}]`:`{${Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
// A deterministic consistency checksum, not a cryptographic signature or a proof of accuracy.
export function pipelineEvidenceFingerprint(value){let a=2166136261,b=2246822507;for(const byte of new TextEncoder().encode(stable(value))){a=Math.imul(a^byte,16777619);b=Math.imul(b^byte,3266489909);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
export const pipelineEvidenceBinding=result=>({runId:result?.runId,pipelineId:result?.pipelineId,pipelineRevision:result?.pipelineRevision,planFingerprint:result?.planFingerprint,imageSha256:result?.image?.sha256,sourceSha256:result?.image?.sourceSha256??null,imageWidth:result?.image?.width,imageHeight:result?.image?.height,pixelFingerprint:result?.image?.pixelFingerprint,resultStatus:result?.status,inputIdentityFingerprint:pipelineEvidenceFingerprint(result?.inputIdentity??null),calibrationFingerprint:pipelineEvidenceFingerprint(result?.calibration??null)});
export const pipelineTraceFingerprint=trace=>pipelineEvidenceFingerprint(Object.fromEntries(['id','op','version','inputs','status','parameters','parameterSources','parameterDerivations','outputSummary','error','featureStatus','justification'].filter(key=>trace[key]!==undefined).map(key=>[key,trace[key]])));
export const pipelineArtifactFingerprint=artifact=>pipelineEvidenceFingerprint(Object.fromEntries(Object.entries(artifact).filter(([key])=>!['binding','contentFingerprint'].includes(key))));
const ARTIFACT_TYPES=new Set(['file','evidence','image','mask','histogram','curves','contours','circles','points']);
const SOURCES=new Set(['agent-proposal','human-input','operator-default','data-derived','not-supplied']);
const RUNTIME_SOURCES=new Set(['agent','human','plan','operator-default','data-derived']);
const placeholder=/^(?:todo|tbd|n\/?a|待補(?:充)?|待填(?:寫)?|同上|略|無|none|\.{2,}|…+|[-_]+)$/i;
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=8000&&!placeholder.test(value.trim());
const issue=(code,nodeId,path,message,hint)=>({code,nodeId:typeof nodeId==='string'&&nodeId?nodeId:'$pipeline',path:path||'plan',message,hint});
const section=(status,errors=[],extra={})=>({status,...extra,errors});
function unknownFields(value,allowed,nodeId,path,errors){if(!object(value))return;for(const key of Object.keys(value))if(!allowed.includes(key))errors.push(issue('UNSUPPORTED_EVIDENCE_FIELD',nodeId,`${path}.${key}`,'依據欄位不在規劃合約內，規劃不能聲稱已完成驗證。','只提交原因、來源與待實算檢查；完成狀態由真實執行產生。'));}
function validateSelector(selector,nodeId,path,errors,{artifactOnly=false}={}){
  if(!object(selector)){errors.push(issue('EVIDENCE_SELECTOR_REQUIRED',nodeId,path,'需要結構化證據選擇器。','使用 capabilities.evidenceContract 中的 artifact、gate 或 execution-status 範例。'));return;}
  if(selector.kind==='artifact'){
    unknownFields(selector,['kind','type','id'],nodeId,path,errors);
    if(!ARTIFACT_TYPES.has(selector.type))errors.push(issue('ARTIFACT_TYPE_INVALID',nodeId,`${path}.type`,'需要已註冊的圖像、曲線或數據產物類型。','從該算子的 evidenceArtifacts 選擇 type。'));
    if(selector.id!==undefined&&(typeof selector.id!=='string'||!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(selector.id)))errors.push(issue('ARTIFACT_ID_INVALID',nodeId,`${path}.id`,'產物 id 必須是節點產物 id 或其後綴。','不要使用網址、檔案路徑或未運算的圖片。'));
  }else if(!artifactOnly&&selector.kind==='gate'){
    unknownFields(selector,['kind','id'],nodeId,path,errors);if(!text(selector.id))errors.push(issue('GATE_ID_REQUIRED',nodeId,`${path}.id`,'需要具體的品質閘值 id。','使用該算子 evidenceGates 中的 id；不能以泛稱「品質」代替。'));
  }else if(!artifactOnly&&selector.kind==='execution-status'){
    unknownFields(selector,['kind','allowed'],nodeId,path,errors);if(!Array.isArray(selector.allowed)||!selector.allowed.length||selector.allowed.some(value=>!['OK','FAILED','SKIPPED'].includes(value)))errors.push(issue('EXECUTION_STATUS_INVALID',nodeId,`${path}.allowed`,'執行狀態允許值無效。','例如 {kind:"execution-status",allowed:["OK"]}；它只驗證執行狀態，不代表量測正確。'));
  }else errors.push(issue('EVIDENCE_SELECTOR_KIND',nodeId,`${path}.kind`,artifactOnly?'工具預期證據必須引用實際產物。':'不支持的檢查類型。',artifactOnly?'使用 {kind:"artifact",type:"evidence"} 或具體產物。':'僅支持 artifact、gate、execution-status。'));
}
const canonicalSource=source=>['human','user','human-input'].includes(source)?'human-input':['agent','agent-proposal'].includes(source)?'agent-proposal':source==='operator-default'||source==='engineering_default'?'operator-default':source==='data-derived'||source==='computed_from_pixels'?'data-derived':null;
export function expectedPipelineParameterSource(node,plan,name){
  if(Object.hasOwn(node.params||{},name))return canonicalSource(node.parameterSources?.[name]||node.provenance?.source||plan.provenance?.source)||'agent-proposal';
  const origin=OPERATOR_REGISTRY[node.op]?.parameterOrigins?.[name];
  return origin?.whenOmitted||'operator-default';
}

// Authoring prose is optional and free-form; graph and explicit references remain checked.
export function validatePipelineEvidenceProposal(plan){
 const graph=validatePipeline(plan),errors=[...graph.errors],nodes=[];
 for(const node of Array.isArray(plan?.nodes)?plan.nodes:[]){
  if(!object(node))continue;
  const start=errors.length;
  try{validateNodeDocumentation(node.documentation);}catch(error){errors.push(issue('DOCUMENTATION_INVALID',node.id,'documentation',error.message));}
  if(plan.provenance?.source==='agent'&&node.provenance?.source!==undefined&&node.provenance.source!=='agent')errors.push(issue('NODE_SOURCE_MISMATCH',node.id,'provenance.source','Agent 提交的步驟不能宣告為人工來源。'));
  const registry=OPERATOR_REGISTRY[node.op]||{};
  const audit=validateOperationEvidenceJustification(node.justification,{nodeId:node.id,evidenceArtifacts:registry.evidenceArtifacts||[],gateIds:registry.evidenceGates||[]});
  errors.push(...audit.errors);
  nodes.push({...audit,nodeId:node.id,errors:errors.slice(start)});
 }
 return {schema:PIPELINE_EVIDENCE_SCHEMA,phase:'planning',valid:!errors.length,status:errors.length?'MISSING':'READY_FOR_TRIAL',delivered:false,actualEvidence:'PENDING',nodes,errors};
}

export class PipelineEvidenceContractError extends Error{
  constructor(code,audit,message){super(message||`${code}: ${audit.errors.map(error=>error.message).join('；')}`);this.name='PipelineEvidenceContractError';this.code=code;this.audit=audit;this.validation=audit;this.errors=audit.errors;this.details={errors:audit.errors,status:audit.status};this.retryable=true;}
}
export function assertPipelineEvidenceProposal(plan){const audit=validatePipelineEvidenceProposal(plan);if(!audit.valid)throw new PipelineEvidenceContractError('PIPELINE_EVIDENCE_PROPOSAL_REJECTED',audit);return audit;}

// Non-pipeline tools supply their own real catalog and provenance. This validates
// promises only; it neither impersonates a registered op nor creates run evidence.
export function validateOperationEvidenceJustification(justification,{nodeId='operation',requiredParameters=[],evidenceArtifacts=[],gateIds=[],allowVisuals=false,requireVisualPixels=false,evidenceVisuals=[]}={}){
  const errors=[],base=`operations.${nodeId}.justification`,sections={};
  const selector=(value,path,artifactOnly=false)=>{
    // Registered operators/edge shortcuts retain their strict selectors. Only
    // programmable callers opt into authored captions and dedicated visuals.
    const plain=allowVisuals&&object(value)?Object.fromEntries(Object.entries(value).filter(([key])=>!['caption','visuals'].includes(key))):value;
    validateSelector(plain,nodeId,path,errors,{artifactOnly});
    if(allowVisuals&&object(value)){
      if(value.caption!==undefined&&!text(value.caption))errors.push(issue('EVIDENCE_CAPTION_REQUIRED',nodeId,`${path}.caption`,'圖像說明不可空白或佔位。','指出本圖可觀察的位置與支持的具體主張。'));
      if(value.visuals!==undefined){
        if(!Array.isArray(value.visuals)||!value.visuals.length||value.visuals.length>12)errors.push(issue('EVIDENCE_VISUALS_INVALID',nodeId,`${path}.visuals`,'專用依據圖必須為1–12項。','引用本次本步save_image產生的圖，不能放網址或其他步驟產物。'));
        else for(const [index,visual] of value.visuals.entries()){
          const vp=`${path}.visuals[${index}]`;
          unknownFields(visual,['id','caption','kind'],nodeId,vp,errors);
          if(!object(visual)||!text(visual.caption))errors.push(issue('EVIDENCE_CAPTION_REQUIRED',nodeId,`${vp}.caption`,'缺少這張專用圖支持主張的說明。','說明顏色、座標或對比如何支持結論；不能只寫工具名稱。'));
          const kind=visual?.kind||'artifact';
          if(!['artifact','project-image','canvas-asset'].includes(kind))errors.push(issue('EVIDENCE_VISUAL_KIND_INVALID',nodeId,`${vp}.kind`,'專用依據圖來源類型無效。','使用 artifact、project-image 或 canvas-asset。'));
          const image=kind==='artifact'?evidenceArtifacts.find(artifact=>artifact.type==='image'&&artifact.id===visual?.id):evidenceVisuals.find(candidate=>candidate.kind===kind&&candidate.id===visual?.id);
          if(!image||requireVisualPixels&&!hasVerifiedImagePixels(image))errors.push(issue('EVIDENCE_VISUAL_UNAVAILABLE',nodeId,`${vp}.id`,'專用依據圖不存在、像素未核驗，或不屬於本次可追溯來源。','可引用本步實算圖，或引用目前專案中已存在的 project-image / canvas-asset；文檔應說明這張圖支持的具體主張。'));
        }
      }
    }
    if(value?.kind==='artifact'&&!evidenceArtifacts.some(artifact=>artifact.type===value.type&&(!value.id||artifact.id===value.id||`${nodeId}:${artifact.id}`===value.id)))errors.push(issue('ARTIFACT_SELECTOR_UNSUPPORTED',nodeId,path,'此工具沒有宣告這個真實產物 id/類型。','從工具的 evidenceArtifacts 選擇；此處只是待執行承諾，不是已產生證據。'));
    if(value?.kind==='gate'&&!gateIds.includes(value.id))errors.push(issue('GATE_SELECTOR_UNSUPPORTED',nodeId,path,'此工具沒有宣告這個品質 gate。','使用工具真實 gateIds；不可把描述文字當成已執行檢查。'));
  };
  // Old structured explanations stay readable. Only explicit references are
  // validated; missing prose, sections, per-parameter rows or images are not faults.
  if(justification!==undefined&&justification!==null&&!object(justification))errors.push(issue('JUSTIFICATION_INVALID',nodeId,base,'舊版說明必須為物件。'));
  for(const [i,value] of (Array.isArray(justification?.tool?.expectedEvidence)?justification.tool.expectedEvidence:[]).entries())selector(value,`${base}.tool.expectedEvidence[${i}]`,true);
  for(const [i,row] of (Array.isArray(justification?.parameters)?justification.parameters:[]).entries())if(row?.verification)selector(row.verification,`${base}.parameters[${i}].verification`);
  for(const [i,row] of (Array.isArray(justification?.boundaries)?justification.boundaries:[]).entries())if(row?.check)selector(row.check,`${base}.boundaries[${i}].check`);
  for(const key of ['tool','parameters','boundaries'])sections[key]=section(errors.length?'MISSING':'PLANNED');
  return {schema:PIPELINE_EVIDENCE_SCHEMA,phase:'planning',nodeId,status:errors.length?'MISSING':'READY_FOR_TRIAL',valid:errors.length===0,delivered:false,actualEvidence:'PENDING',sections,errors};
}

function refsIn(value,visit,path='',depth=0){if(!value||typeof value!=='object'||depth>32)return;for(const [key,entry] of Object.entries(value)){const p=path?`${path}.${key}`:key;if(key==='evidenceRefs'){visit(entry,p,true);}else if(key==='evidenceRef'||key==='baseCurveRef'){if(entry!==null&&entry!==undefined)visit([entry],p,false);}else refsIn(entry,visit,p,depth+1);}}
const same=(a,b)=>stable(a)===stable(b);
function resolves(selector,trace){
  if(selector?.kind==='artifact')return (Array.isArray(trace.artifacts)?trace.artifacts:[]).filter(artifact=>artifact.type===selector.type&&(!selector.id||artifact.id===selector.id||artifact.id===`${trace.id}:${selector.id}`)).map(artifact=>artifact.id);
  if(selector?.kind==='gate')return (Array.isArray(trace.decision?.gates)?trace.decision.gates:[]).filter(gate=>gate?.id===selector.id).map(gate=>`gate:${gate.id}`);
  if(selector?.kind==='execution-status')return selector.allowed?.includes(trace.status)?[`execution:${trace.id}:${trace.status}`]:[];
  return [];
}

export function auditPipelineEvidenceDelivery(plan,result){
  const proposal=validatePipelineEvidenceProposal(plan),errors=[...proposal.errors],nodes=[],binding=pipelineEvidenceBinding(result);
  const fail=(code,nodeId,path,message,hint='重新以目前圖像與方案實算；不能沿用或補造歷史證據。')=>errors.push(issue(code,nodeId,path,message,hint));
  if(!object(result)||!Array.isArray(result.nodes)){fail('RUN_REQUIRED',null,'result','尚無真實執行結果。');return {schema:PIPELINE_EVIDENCE_SCHEMA,phase:'delivery',status:'INCOMPLETE',delivered:false,proposalStatus:proposal.status,binding,nodes,errors};}
  if(!Array.isArray(result.artifacts)||result.artifacts.some(artifact=>!object(artifact))||result.nodes.some(trace=>!object(trace)||!Array.isArray(trace.artifacts)||trace.artifacts.some(artifact=>!object(artifact)))){
    fail('RUN_STRUCTURE_INVALID',null,'result.nodes','執行步驟與產物目錄結構無效，無法核驗來源。');return {schema:PIPELINE_EVIDENCE_SCHEMA,phase:'delivery',status:'INCOMPLETE',delivered:false,proposalStatus:proposal.status,binding,nodes,errors};
  }
  if(typeof result.runId!=='string'||!result.runId||typeof result.image?.sha256!=='string'||!/^[a-f0-9]{64}$/.test(result.image.sha256)||!result.completedAt)fail('RUN_BINDING_MISSING',null,'result.evidenceBinding','結果缺少 run、完成時間或實際像素 SHA-256。');
  if(result.pipelineId!==plan?.id||result.pipelineRevision!==plan?.revision||result.planFingerprint!==pipelineEvidenceFingerprint(plan))fail('STALE_PLAN_BINDING',null,'result.planFingerprint','結果不屬於目前方案內容及版本。');
  if(!same(result.evidenceBinding,binding))fail('RUN_BINDING_MISMATCH',null,'result.evidenceBinding','結果的 run、圖像或輸入身分已不符合實算綁定。');
  const byId=new Map(),allArtifacts=new Map();
  for(const trace of result.nodes){if(byId.has(trace.id))fail('TRACE_DUPLICATE',trace.id,'result.nodes','同一步有重複執行記錄。');byId.set(trace.id,trace);}
  const observedMeasurements=Object.assign({},...result.nodes.filter(trace=>object(trace.outputSummary?.measurements)).map(trace=>trace.outputSummary.measurements));
  if(!same(result.measurements,observedMeasurements))fail('MEASUREMENTS_EVIDENCE_MISMATCH',null,'result.measurements','頂層量測與本次實算步驟的保存輸出不一致。');
  const evaluation=result.nodes.filter(trace=>trace.op==='rules.evaluate'&&trace.status==='OK').at(-1)?.artifacts?.find(artifact=>artifact.id.endsWith(':rule-evaluation'))?.data;
  if(evaluation&&!same(result.classification,evaluation))fail('CLASSIFICATION_EVIDENCE_MISMATCH',null,'result.classification','分類與本次真實規則求值產物不一致。');
  for(const artifact of result.artifacts||[]){if(allArtifacts.has(artifact.id))fail('ARTIFACT_DUPLICATE',artifact.nodeId,'result.artifacts','產物 id 重複。');allArtifacts.set(artifact.id,artifact);if(!byId.has(artifact.nodeId))fail('ARTIFACT_OWNER_MISSING',artifact.nodeId,'result.artifacts','產物沒有實際執行步驟來源。');}
  const planNodes=Array.isArray(plan?.nodes)?plan.nodes:[];
  for(const trace of result.nodes)if(!planNodes.some(node=>node?.id===trace?.id))fail('TRACE_UNEXPECTED',trace?.id,'result.nodes','結果含有目前方案不存在的步驟。');
  for(const [index,node] of planNodes.entries()){
    if(!object(node))continue;
    const nodeId=node.id,trace=byId.get(nodeId),path=`result.nodes.${nodeId}`,start=errors.length,nodeProposal=proposal.nodes.find(row=>row.nodeId===nodeId),author=node.justification,authorParameters=Array.isArray(author?.parameters)?author.parameters.filter(object):[],authorBoundaries=Array.isArray(author?.boundaries)?author.boundaries.filter(object):[];
    const baseErrors=proposal.errors.filter(error=>error.nodeId===nodeId);
    if(!trace){fail('TRACE_MISSING',nodeId,path,'此步沒有實際執行記錄。');nodes.push({nodeId,status:'INCOMPLETE',delivered:false,sections:{tool:section('INCOMPLETE'),parameters:section('INCOMPLETE',[],{rows:[]}),boundaries:section('INCOMPLETE',[],{rows:[]})},errors:[...baseErrors,...errors.slice(start)]});continue;}
    const executionDiagnostic=trace.status!=='OK'||!!trace.featureStatus&&!['OK','SUCCESS','VALID','MEASURED'].includes(String(trace.featureStatus).toUpperCase());
    let diagnostic=executionDiagnostic||node.op==='rules.evaluate'&&result.classification?.status==='UNKNOWN';
    const expectedBinding={...binding,nodeId},decision=trace.decision;
    if(!same(trace.justification,node.justification))fail('AUTHOR_JUSTIFICATION_MISMATCH',nodeId,`${path}.justification`,'本次執行保存的作者依據與目前方案不同。');
    if(trace.op!==node.op||trace.version!==node.version||!same(trace.inputs,node.inputs))fail('TRACE_OPERATOR_MISMATCH',nodeId,path,'實算算子、版本或輸入引用與方案不同。');
    if(!same(trace.evidenceBinding,expectedBinding)||!same(decision?.binding,expectedBinding))fail('TRACE_BINDING_MISMATCH',nodeId,`${path}.evidenceBinding`,'此步的實算依據被替換或屬於不同 run/圖像/方案。');
    if(trace.executionFingerprint!==pipelineTraceFingerprint(trace))fail('TRACE_CONTENT_CHANGED',nodeId,path,'參數、執行狀態或輸出摘要已在實算後改動。');
    if(!['OK','FAILED','SKIPPED'].includes(trace.status))fail('EXECUTION_STATUS_INVALID',nodeId,`${path}.status`,'步驟執行狀態無效。');
    if(trace.status!=='OK'&&(!text(trace.error?.code)||!text(trace.error?.message)))fail('DIAGNOSTIC_REASON_MISSING',nodeId,`${path}.error`,'失敗/跳過步驟需要真實診斷原因。');
    const localIds=new Set();
    for(const artifact of trace.artifacts||[]){
      if(localIds.has(artifact.id))fail('ARTIFACT_DUPLICATE',nodeId,`${path}.artifacts`,'同一步產物 id 重複。');localIds.add(artifact.id);
      if(!ARTIFACT_TYPES.has(artifact.type)||artifact.nodeId!==nodeId||!artifact.id?.startsWith(`${nodeId}:`))fail('ARTIFACT_IDENTITY_INVALID',nodeId,`${path}.artifacts`,'產物類型或所屬步驟無效。');
      if(!OPERATOR_REGISTRY[node.op]?.evidenceArtifacts?.some(entry=>artifact.id===`${nodeId}:${entry.id}`&&artifact.type===entry.type))fail('ARTIFACT_OPERATOR_MISMATCH',nodeId,`${path}.artifacts.${artifact.id}`,'產物 id/類型不在該版本算子的真實產物目錄中。');
      if(!same(artifact.binding,expectedBinding))fail('ARTIFACT_BINDING_MISMATCH',nodeId,`${path}.artifacts.${artifact.id}.binding`,'產物不屬於此步目前的實算 run。');
      if(artifact.contentFingerprint!==pipelineArtifactFingerprint(artifact))fail('ARTIFACT_CONTENT_CHANGED',nodeId,`${path}.artifacts.${artifact.id}`,'產物像素/曲線/數據已在實算後變更。');
      if(!same(allArtifacts.get(artifact.id),artifact))fail('ARTIFACT_CATALOG_MISMATCH',nodeId,`${path}.artifacts.${artifact.id}`,'全局產物目錄與此步實算產物不一致。');
    }
    for(const artifact of result.artifacts||[])if(artifact.nodeId===nodeId&&!localIds.has(artifact.id))fail('ARTIFACT_UNEXPECTED',nodeId,'result.artifacts','全局目錄含沒有步驟來源的產物。');
    if(!object(decision)||decision.schema!=='agentcv-node-decision-1'||decision.executionStatus!==trace.status)fail('DECISION_REQUIRED',nodeId,`${path}.decision`,'缺少此步的真實決策依據或狀態不一致。');
    if(trace.decisionFingerprint!==pipelineEvidenceFingerprint(decision??null))fail('DECISION_CONTENT_CHANGED',nodeId,`${path}.decision`,'工具/參數/品質閘值/邊界記錄已在實算後改動。');
    refsIn(decision,(refs,rp)=>{if(!Array.isArray(refs)||refs.some(ref=>typeof ref!=='string'||!localIds.has(ref)))fail('EVIDENCE_REFERENCE_INVALID',nodeId,`${path}.decision.${rp}`,'證據引用沒有指向此步實際產物。','使用此 run 的本步 artifact id；不能引用網址或另一張圖的數據。');});
    const toolStart=errors.length,toolRefs=[];
    const declaredToolSource=plan?.provenance?.source==='agent'?'agent':canonicalSource(node.provenance?.source||plan?.provenance?.source),expectedToolSource=({'agent-proposal':'agent','human-input':'human','operator-default':'operator-default','data-derived':'data-derived',agent:'agent'})[declaredToolSource]||'plan';
    if(decision?.toolChoice?.source!==expectedToolSource||decision?.toolChoice?.setBy!==expectedToolSource)fail('TOOL_SOURCE_MISMATCH',nodeId,`${path}.decision.toolChoice.source`,'工具選擇的來源或設定者與宿主保存的作者來源不符。','不能把 Agent 提案冒稱人工選定；以宿主記錄的來源重新實算。');
    if(!text(decision?.toolChoice?.reason)||decision?.toolChoice?.op!==node.op||!RUNTIME_SOURCES.has(decision?.toolChoice?.source)||!object(decision?.toolChoice?.comparison))fail('TOOL_EXECUTION_EVIDENCE_MISSING',nodeId,`${path}.decision.toolChoice`,'執行記錄缺少工具來源、原因或比較狀態。');
    if(!executionDiagnostic&&(!Array.isArray(decision?.evidenceRefs)||!decision.evidenceRefs.length))fail('TOOL_ACTUAL_EVIDENCE_MISSING',nodeId,`${path}.decision.evidenceRefs`,'此步成功執行卻沒有實際產物引用。');
    for(const [i,selector] of (Array.isArray(author?.tool?.expectedEvidence)?author.tool.expectedEvidence:[]).entries()){
      const refs=resolves(selector,trace);toolRefs.push(...refs);if(!refs.length&&!executionDiagnostic)fail('EXPECTED_ARTIFACT_MISSING',nodeId,`nodes[${index}].justification.tool.expectedEvidence[${i}]`,'工具沒有產生規劃承諾的實際證據。','修正方案選擇器或算法，再以新版方案重新實算；不能補造圖片。');
    }
    const toolErrors=[...(nodeProposal?.sections.tool.errors||[]),...errors.slice(toolStart)],parameterStart=errors.length,rows=[],choices=Array.isArray(decision?.parameterChoices)?decision.parameterChoices:[],choiceNames=new Set();
    if(!Array.isArray(decision?.parameterChoices))fail('PARAMETER_CHOICES_REQUIRED',nodeId,`${path}.decision.parameterChoices`,'缺少全量參數決策記錄。');
    for(const choice of choices){
      if(!object(choice)){fail('PARAMETER_CHOICE_INVALID',nodeId,`${path}.decision.parameterChoices`,'參數決策必須是結構化物件。');continue;}
      const rp=`${path}.decision.parameterChoices.${choice?.name}`,rowStart=errors.length,authored=authorParameters.find(row=>row.name===choice?.name),rootAuthored=authorParameters.find(row=>row.name===choice?.name?.split(/[.\[]/)[0]);
      if(!text(choice?.name)||choiceNames.has(choice.name))fail('PARAMETER_CHOICE_INVALID',nodeId,rp,'參數決策名稱缺失或重複。');choiceNames.add(choice?.name);
      if(!text(choice?.reason)||!RUNTIME_SOURCES.has(choice?.source)||!RUNTIME_SOURCES.has(choice?.setBy)||!RUNTIME_SOURCES.has(choice?.derivation?.source)||!object(choice?.comparison)||typeof choice.comparison.performed!=='boolean'||typeof choice.comparison.optimizationPerformed!=='boolean')fail('PARAMETER_RUNTIME_EVIDENCE_MISSING',nodeId,rp,'參數缺少真實來源、推導、原因或比較狀態。');
      if(!executionDiagnostic&&(!Array.isArray(choice?.evidenceRefs)||!choice.evidenceRefs.length))fail('PARAMETER_ACTUAL_EVIDENCE_MISSING',nodeId,`${rp}.evidenceRefs`,'實際參數沒有綁定到本步實算產物。');
      if(Object.hasOwn(trace.parameters||{},choice.name)&&!same(choice.value,trace.parameters[choice.name]))fail('PARAMETER_VALUE_MISMATCH',nodeId,`${rp}.value`,'決策中的參數值與實際執行參數不同。');
      if(authored){
        const actual=choice.status==='not-supplied'?'not-supplied':canonicalSource(choice.source),passThrough=choice.method==='binary-input-pass-through'&&authored.source==='data-derived';
        if(!executionDiagnostic&&!passThrough&&actual!==authored.source)fail('PARAMETER_ACTUAL_SOURCE_MISMATCH',nodeId,`${rp}.source`,`作者宣告 ${authored.source}，實際執行來源為 ${actual}。`,'更正宣告並重新提交；不得把 Agent 提案冒稱人工規格或把預設冒稱圖像最優。');
      }
      const verificationSelector=(authored||rootAuthored)?.verification,verification=resolves(verificationSelector,trace),verificationGate=verificationSelector?.kind==='gate'&&Array.isArray(decision?.gates)?decision.gates.find(gate=>gate?.id===verificationSelector.id):null,verificationPending=verificationGate&&['NOT_EVALUATED','NOT_APPLICABLE'].includes(verificationGate.status);
      if(verificationPending||verificationGate?.status==='FAIL')diagnostic=true;
      if((authored||rootAuthored)&&!verification.length&&!executionDiagnostic)fail('PARAMETER_VERIFICATION_MISSING',nodeId,rp,'參數承諾的驗證方式在此 run 無可對應的真實記錄。','選擇已註冊產物或實際品質 gate，不可宣稱已完成不存在的比較。');
      const rowErrors=errors.slice(rowStart);rows.push({name:choice.name,status:rowErrors.length?'INCOMPLETE':trace.status==='SKIPPED'||verificationPending?'NOT_EVALUATED':'COMPLETE',source:choice.source,declaredSource:authored?.source??null,justificationSource:authored||rootAuthored?'author-proposal':'runtime-derivation',evidenceRefs:[...new Set([...(choice.evidenceRefs||[]),...verification])],errors:rowErrors});
    }
    for(const name of Object.keys(trace.parameters||{}))if(!choiceNames.has(name))fail('PARAMETER_RUNTIME_COVERAGE_MISSING',nodeId,`${path}.decision.parameterChoices.${name}`,`實際執行參數 ${name} 沒有決策依據。`,'必須覆蓋全部有效參數，不僅是公開設定項。');
    for(const row of authorParameters)if(!choiceNames.has(row.name)){
      const rp=`nodes[${index}].justification.parameters.${row.name}`,rowStart=errors.length;
      if(row.source!=='not-supplied'&&!executionDiagnostic)fail('PARAMETER_NOT_EXECUTED',nodeId,rp,'規劃宣告的參數沒有實際執行記錄。');
      const refs=resolves(row.verification,trace);if(!executionDiagnostic&&!refs.length)fail('PARAMETER_VERIFICATION_MISSING',nodeId,rp,'未提供參數的狀態沒有對應實際檢查記錄。');
      rows.push({name:row.name,status:errors.length>rowStart?'INCOMPLETE':diagnostic?'NOT_EVALUATED':'COMPLETE',source:row.source,declaredSource:row.source,justificationSource:'author-proposal',evidenceRefs:refs,errors:errors.slice(rowStart)});
    }
    const parameterErrors=[...(nodeProposal?.sections.parameters.errors||[]),...errors.slice(parameterStart)],boundaryStart=errors.length,boundaryRows=[];
    if(!Array.isArray(decision?.gates)||!Array.isArray(decision?.boundaries)||!decision.boundaries.length)fail('BOUNDARY_RUNTIME_EVIDENCE_MISSING',nodeId,`${path}.decision.boundaries`,'缺少實際品質閘值陣列與適用邊界記錄。');
    const gates=Array.isArray(decision?.gates)?decision.gates:[],runtimeBoundaries=Array.isArray(decision?.boundaries)?decision.boundaries:[];
    if(trace.status==='OK')for(const id of OPERATOR_REGISTRY[node.op]?.evidenceGates||[])if(!gates.some(gate=>gate?.id===id))fail('GATE_COVERAGE_MISSING',nodeId,`${path}.decision.gates.${id}`,'此算子實際應記錄的品質閘值缺失。','即使條件未達或不適用，也須保留真實 NOT_EVALUATED/NOT_APPLICABLE，不能刪掉失敗檢查。');
    for(const gate of gates){
      const gp=`${path}.decision.gates.${gate?.id}`;
      if(!text(gate?.id)||!text(gate?.reason)||!['PASS','FAIL','NOT_EVALUATED','NOT_APPLICABLE'].includes(gate?.status)||!Array.isArray(gate.evidenceRefs)||!gate.evidenceRefs.length||!RUNTIME_SOURCES.has(gate.source))fail('GATE_EVIDENCE_INVALID',nodeId,gp,'品質閘值缺少真實狀態、來源、原因或產物引用。');
      if(['PASS','FAIL'].includes(gate?.status)&&(gate.actual===null||gate.actual===undefined||gate.threshold===null||gate.threshold===undefined))fail('GATE_VALUE_MISSING',nodeId,gp,'已執行的 PASS/FAIL gate 缺少真實觀測值或門檻。');
    }
    for(const boundary of runtimeBoundaries)if(!text(boundary?.code)||!text(boundary?.message)||!Array.isArray(boundary.evidenceRefs))fail('BOUNDARY_RUNTIME_INVALID',nodeId,`${path}.decision.boundaries`,'適用邊界需要具體代碼、限制與證據引用陣列。');
    for(const [i,boundary] of authorBoundaries.entries()){
      const rowStart=errors.length,refs=resolves(boundary.check,trace),gate=boundary.check?.kind==='gate'?gates.find(entry=>entry?.id===boundary.check.id):null;
      if(!refs.length&&!executionDiagnostic)fail('BOUNDARY_CHECK_MISSING',nodeId,`nodes[${index}].justification.boundaries[${i}].check`,'宣告的適用邊界在此 run 沒有可驗證記錄。','使用實際產物/已存在 gate 或執行狀態檢查；不得以說明文字代替。');
      const notEvaluated=!refs.length||gate&&['NOT_EVALUATED','NOT_APPLICABLE'].includes(gate.status);
      if(notEvaluated||gate?.status==='FAIL')diagnostic=true;
      boundaryRows.push({index:i,status:errors.length>rowStart?'INCOMPLETE':notEvaluated?'NOT_EVALUATED':'COMPLETE',condition:boundary.condition,onFailure:boundary.onFailure,evidenceRefs:refs,observedStatus:gate?.status??(refs.length?'RECORDED':'NOT_EVALUATED'),errors:errors.slice(rowStart)});
    }
    const boundaryErrors=[...(nodeProposal?.sections.boundaries.errors||[]),...errors.slice(boundaryStart)],nodeErrors=[...baseErrors,...errors.slice(start)],state=nodeErrors.length?'INCOMPLETE':diagnostic?'DIAGNOSTIC_ONLY':'DELIVERED';
    nodes.push({nodeId,status:state,delivered:state==='DELIVERED',executionStatus:trace.status,featureStatus:trace.featureStatus??null,sections:{tool:section(toolErrors.length?'INCOMPLETE':trace.status==='SKIPPED'||!toolRefs.length?'NOT_EVALUATED':'COMPLETE',toolErrors,{reasonSource:'author-proposal',artifactRefs:[...new Set(toolRefs)]}),parameters:section(parameterErrors.length?'INCOMPLETE':trace.status==='SKIPPED'||rows.some(row=>row.status==='NOT_EVALUATED')?'NOT_EVALUATED':'COMPLETE',parameterErrors,{rows}),boundaries:section(boundaryErrors.length?'INCOMPLETE':trace.status==='SKIPPED'||boundaryRows.some(row=>row.status==='NOT_EVALUATED')?'NOT_EVALUATED':'COMPLETE',boundaryErrors,{rows:boundaryRows})},errors:nodeErrors});
  }
  const status=errors.length?'INCOMPLETE':nodes.some(node=>node.status==='DIAGNOSTIC_ONLY')||result.classification?.status==='UNKNOWN'?'DIAGNOSTIC_ONLY':'DELIVERED';
  const blockers=nodes.filter(node=>node.status==='DIAGNOSTIC_ONLY').map(node=>issue('NODE_DIAGNOSTIC_ONLY',node.nodeId,`result.nodes.${node.nodeId}`,'此步僅有失敗、未驗證前提或不適用條件的診斷，尚未交付。','查看真實失敗原因與邊界；更正方案/輸入或請工程師確認後重新實算。'));
  if(result.classification?.status==='UNKNOWN')blockers.push(issue('CLASSIFICATION_UNRESOLVED','$pipeline','result.classification',`分類仍為 UNKNOWN（${result.classification.reason||'原因待查'}），不可稱全流程已交付。`,'保留量測；若缺規格則由工程師提供，不得從影像或預設猜測公差。'));
  return {schema:PIPELINE_EVIDENCE_SCHEMA,phase:'delivery',status,delivered:status==='DELIVERED',proposalStatus:proposal.status,binding,nodes,errors,blockers,note:'交付合約只驗證依據完整性、實算來源與版本一致；不代表量測正確率、跨圖穩定性或工業驗收通過。'};
}
export function assertPipelineEvidenceDelivery(plan,result){const audit=auditPipelineEvidenceDelivery(plan,result);if(!audit.delivered)throw new PipelineEvidenceContractError('PIPELINE_EVIDENCE_DELIVERY_REJECTED',{...audit,errors:audit.errors.length?audit.errors:audit.blockers});return audit;}
