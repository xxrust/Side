import {compileDataContracts} from './data-contract.js';
import validateStructure from './workpiece-schema.generated.js';
import {decisionEvidenceIssues} from './decision-evidence.js';
import {timingRequirementIssues} from './inspection-timing.js';
import {lifecycleOrder} from './workpiece-lifecycle.js';
import {compileClassificationSpec} from './classification-spec.js';
import {validateOperationEvidenceJustification} from './pipeline-evidence-contract.js';
export const isWorkpiecePlan=scheme=>scheme?.execution?.unit==='workpiece';
export function compileWorkpiecePlan(scheme){
 // Native nodes intentionally omit Python source. Validate the rest of the
 // canonical shape without manufacturing executable code in the saved plan.
 const structureValid=validateStructure(scheme),rawIssues=structureValid?[]:validateStructure.errors;
 const structureIssues=rawIssues.map(e=>{
  const keys=e.instancePath.split('/').slice(1).map(k=>k.replace(/~1/g,'/').replace(/~0/g,'~'));if(e.params.missingProperty)keys.push(e.params.missingProperty);const path=keys.join('.')||'scheme';
  const code=path==='operatorGraph.edges'?'EDGES_INVALID':/^operatorGraph\.edges\.\d+$/.test(path)?'EDGE_INVALID':/^operatorGraph\.nodes\.\d+\.inputs(?:\.|$)/.test(path)?'NODE_INPUT_INVALID':/^operatorGraph\.nodes\.\d+\.prerequisites/.test(path)?'ALTERNATIVE_INPUT_INVALID':'PLAN_SCHEMA_INVALID';
  return {code,path,jsonPointer:e.instancePath,keyword:e.keyword,message:`${path}: ${e.message}`,hint:'依 get_purpose_scheme_capabilities 的 canonicalSchema 修正欄位型別或必填內容，再驗證。'};
 });
 const structureQuestions=structureIssues.map(e=>({id:`${e.code}:${e.path}:${e.keyword}`,code:e.code,path:e.path,question:e.message}));
 // Wrong containers cannot safely reach semantic traversal. Missing fields and
 // scalar constraints still allow useful domain diagnostics in the same reply.
 if(rawIssues.some(e=>e.keyword==='type'&&['object','array'].includes(e.params.type)))return {ok:false,mode:'scheme',isDraft:false,errors:structureIssues,questions:structureQuestions,warnings:[],order:[],schema:'agentcv-workpiece-plan-1'};
 const {errors,questions}=compileClassificationSpec(scheme.classificationSpec),warnings=[],nodes=scheme.operatorGraph?.nodes,rawEdges=scheme.operatorGraph?.edges,edges=Array.isArray(rawEdges)?rawEdges:[];
 errors.push(...structureIssues);questions.push(...structureQuestions);
 const add=(code,path,message)=>{errors.push({code,path,message,hint:'修正目前方案宣告，再重新編譯。'});questions.push({id:`${code}:${path}`,code,path,question:message});};
 for(const issue of timingRequirementIssues(scheme.execution?.timingRequirement))add(issue.code,issue.path,issue.message);
 if(!scheme.id)add('SCHEME_ID_REQUIRED','id','方案需要穩定ID。');
 if(!Array.isArray(scheme.execution?.inputSlots)||!scheme.execution.inputSlots.length||scheme.execution.inputSlots.some(s=>!s.id||typeof s.required!=='boolean'))add('UNIT_INPUT_SLOTS_REQUIRED','execution.inputSlots','聲明同一工件的具名視圖；通常一個必需image slot。');
 if(scheme.execution.referenceInputs!==undefined&&(!scheme.execution.referenceInputs||typeof scheme.execution.referenceInputs!=='object'||Array.isArray(scheme.execution.referenceInputs)||Object.entries(scheme.execution.referenceInputs).some(([slot,id])=>!slot.trim()||typeof id!=='string'||!id.trim())))add('REFERENCE_INPUTS_INVALID','execution.referenceInputs','固定參考需slot→真實image ID物件，不是待檢工件或同件多視圖。');
 if(!Array.isArray(nodes)||!nodes.length||nodes.some(n=>!n||typeof n!=='object'))return {ok:false,errors:[...errors,{code:'GRAPH_EMPTY',path:'operatorGraph.nodes',message:'完整方案圖不可空白。'}],questions};
 if(edges.some(e=>!e||typeof e!=='object'))return {ok:false,errors:[...errors,{code:'EDGE_INVALID',path:'operatorGraph.edges',message:'資料邊需要有效物件。'}],questions};
 const ids=new Set(nodes.map(n=>n.id)),byId=new Map(nodes.map(n=>[n.id,n]));
 if(ids.size!==nodes.length||ids.has(undefined))add('NODE_ID_INVALID','operatorGraph.nodes','節點ID不可重複或空白。');
 if(rawEdges!==undefined&&!Array.isArray(rawEdges))add('EDGES_INVALID','operatorGraph.edges','依賴邊必須為陣列。');
 for(const [i,e]of (Array.isArray(edges)?edges:[]).entries())if(!e||!ids.has(e.from)||!ids.has(e.to)||e.from===e.to)add('EDGE_INVALID',`operatorGraph.edges.${i}`,'邊必須連接兩個真實且不同節點。');
 for(const [i,n]of nodes.entries()){
  const p=`operatorGraph.nodes.${i}`;
  const native=!!n.nativePlan;
  if(!native&& (typeof n.code!=='string'||!n.code.trim()))add('NODE_CODE_REQUIRED',p+'.code','Python fallback 節點需要完整可執行程式；Rust 節點請提供 nativePlan。');
  if(native&&(!n.nativePlan||n.nativePlan.backend!=='rust-native'||!n.nativePlan.plan||!Array.isArray(n.nativePlan.plan.nodes)||!n.nativePlan.plan.nodes.length))add('NATIVE_PLAN_INVALID',p+'.nativePlan','Rust 節點需要 nativePlan.backend="rust-native" 與非空 typed plan。');
  if(!Array.isArray(n.expected_outputs)||!n.expected_outputs.length)add('NODE_OUTPUTS_REQUIRED',p+'.expected_outputs','聲明實際圖像／數據產物。');
  if(Array.isArray(n.expected_outputs)&&new Set(n.expected_outputs.map(o=>o.id)).size!==n.expected_outputs.length)add('NODE_OUTPUT_ID_DUPLICATE',p+'.expected_outputs','產物 ID 不可重複，避免輸入指向不明確。');
  const gates=(Array.isArray(n.justification?.boundaries)?n.justification.boundaries:[]).filter(b=>b.check?.kind==='gate').map(b=>b.check.id);
  const audit=validateOperationEvidenceJustification(n.justification,{nodeId:n.id,requiredParameters:Object.keys(n.parameters||{}).map(name=>({name,source:'agent-proposal'})),evidenceArtifacts:Array.isArray(n.expected_outputs)?n.expected_outputs:[],gateIds:gates,allowVisuals:true});errors.push(...audit.errors);
  let ancestor=n,seen=new Set(),level=1;while(ancestor.parentId){if(seen.has(ancestor.id)||!byId.has(ancestor.parentId)){add('NODE_PARENT_INVALID',p+'.parentId','父節點不存在或形成循環。');break;}seen.add(ancestor.id);ancestor=byId.get(ancestor.parentId);level++;}if(level>3)add('NODE_DEPTH_EXCEEDED',p+'.parentId','工程節點最多三層；圖容器與內部算子不計。');
  if(n.inputs&&(!n.inputs||typeof n.inputs!=='object'||Array.isArray(n.inputs)))add('NODE_INPUT_INVALID',p+'.inputs','具名輸入需要slot→nodeId/artifactId物件。');
  if(n.prerequisites?.anyOf!==undefined&&!Array.isArray(n.prerequisites.anyOf))add('ALTERNATIVE_INPUT_INVALID',p+'.prerequisites.anyOf','替代前提需要node ID陣列。');
  for(const output of Array.isArray(n.expected_outputs)?n.expected_outputs:[])if(output.role!==undefined&&!['result','intermediate'].includes(output.role))add('NODE_OUTPUT_ROLE_INVALID',p+'.expected_outputs','產物role僅支援result或intermediate；須明確節點輸出，不從圖名猜測。');
  for(const [slot,input]of Object.entries(n.inputs&&typeof n.inputs==='object'&&!Array.isArray(n.inputs)?n.inputs:{})){if(!input||typeof input!=='object'){add('NODE_INPUT_INVALID',p+'.inputs.'+slot,'具名輸入需要nodeId/artifactId物件。');continue;}const parent=byId.get(input.nodeId);if(!parent?.expected_outputs?.some(a=>a.id===input.artifactId)||!edges.some(e=>e.from===input.nodeId&&e.to===n.id))add('NODE_INPUT_INVALID',p+'.inputs.'+slot,'具名輸入須引用真實上游宣告產物並有資料邊。');}
  for(const id of Array.isArray(n.prerequisites?.anyOf)?n.prerequisites.anyOf:[])if(!ids.has(id)||!edges.some(e=>e.from===id&&e.to===n.id))add('ALTERNATIVE_INPUT_INVALID',p+'.prerequisites','替代前提必須是明確上游資料邊。');
  if(n.when&&(!ids.has(n.when.nodeId)||!['VALID','NOT_FOUND','FAULT','COMPLETED'].includes(n.when.status)||!edges.some(e=>e.from===n.when.nodeId&&e.to===n.id)))add('BRANCH_CONDITION_INVALID',p+'.when','分支條件須引用上游的VALID／NOT_FOUND／FAULT／COMPLETED狀態。');
 }
 const producers=new Map();
 for(const [i,n] of nodes.entries())for(const output of Array.isArray(n.expected_outputs)?n.expected_outputs:[]){const prior=producers.get(output.id);if(prior&&prior!==n.id)warnings.push({code:'DUPLICATE_ARTIFACT_PRODUCER',path:`operatorGraph.nodes.${i}.expected_outputs`,message:`產物 ${output.id} 由 ${prior} 與 ${n.id} 重複命名；輸入仍以 nodeId+artifactId 綁定，請改成節點內唯一名稱。`,hint:'這是相容警告，不會把有明確 nodeId 的合法輸入判成無效。',level:'warning'});else producers.set(output.id,n.id);}
 const edgeKeys=new Set();
 for(const [i,e] of edges.entries()){const key=`${e?.from}->${e?.to}`;if(edgeKeys.has(key))add('DUPLICATE_DEPENDENCY_EDGE',`operatorGraph.edges.${i}`,'同一依賴邊不可重複宣告；重複邊會造成追蹤與編排歧義。');edgeKeys.add(key);}
 const contracts=compileDataContracts(scheme);errors.push(...contracts.errors);questions.push(...contracts.errors.map(e=>({id:`${e.code}:${e.path}`,code:e.code,path:e.path,question:e.message})));
 const visited=new Set(),order=[];while(order.length<nodes.length&&!errors.some(e=>e.code==='EDGE_INVALID')){const node=nodes.find(n=>!visited.has(n.id)&&edges.filter(e=>e.to===n.id).every(e=>visited.has(e.from)));if(!node){add('GRAPH_CYCLE','operatorGraph','完整方案含循環，無法編排執行。');break;}visited.add(node.id);order.push(node.id);}
 const metrics=new Set((Array.isArray(scheme.classificationSpec?.metrics)?scheme.classificationSpec.metrics:[]).filter(m=>m&&typeof m==='object').map(m=>m.id));
 for(const metric of metrics)if(!(Array.isArray(scheme.metricBindings)?scheme.metricBindings:[]).some(b=>b&&b.metric===metric&&ids.has(b.nodeId)&&typeof b.path==='string'))add('METRIC_BINDING_REQUIRED','metricBindings.'+metric,'分類量須明確引用某節點result路徑。');
 for(const issue of decisionEvidenceIssues(scheme))add(issue.code,issue.path,issue.message);
 const lifecycle=errors.length?{ok:false,order,dependencies:[]}:lifecycleOrder(nodes,edges);if(!errors.length&&!lifecycle.ok)add('GROUP_LIFECYCLE_CYCLE','operatorGraph','父目的外部使用者須等待其子節點；這些生命週期前提形成循環，請調整節點邊界或依賴。');
 return {ok:errors.length===0,mode:'scheme',isDraft:false,schema:'agentcv-workpiece-plan-1',errors,questions,warnings:[...contracts.warnings,...warnings],order:lifecycle.ok?lifecycle.order:order,lifecycleDependencies:lifecycle.dependencies,version:'agentcv-purpose-compiler-2'};
}
