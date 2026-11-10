import {buildProgramFlow} from './program-flow.js';
import {buildCurrentSchemeFlow} from './current-scheme-flow.js';
import {schemeFingerprint} from './purpose-compiler.js';

const list=value=>Array.isArray(value)?value:[];
const clone=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value;};
const pick=(value,fields)=>Object.fromEntries(fields.filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));

/** A question captures the complete scheme graph, independently of visible
 * canvas assets, collapsed nodes, and the active program's image board. */
export function captureProgramFlowReference(project,{scope='whole-flow',nodeId=null,runId,boardId}={}){
 if(!['whole-flow','node'].includes(scope))throw Error('流程提問範圍必須是 whole-flow 或 node');
 if(scope==='whole-flow'&&nodeId!==null)throw Error('整個流程提問不可同時指定節點範圍');
 const data=project.data||project,current=buildCurrentSchemeFlow(project,{runId});
 const historical=!current.available;
 if(historical&&(!runId||!list(data.algorithmRuns).some(run=>run.runId===runId)))throw Error(current.message||'目前方案流程不可用');
 if(boardId&&!list(data.visualInquiry?.boards).some(board=>board.id===boardId))throw Error('流程提問畫板不存在');
 const scheme=data.purposeScheme,flow=historical?buildProgramFlow(project,{runId}):current.flow;
 if(!flow.nodes.length)throw Error('沒有可供提問的流程');
 const selected=scope==='node'?flow.nodes.find(node=>node.id===nodeId):null;
 if(scope==='node'&&!selected)throw Error('提問節點不屬於目前方案流程');
 const runs=new Map(list(data.algorithmRuns).map(run=>[run.runId,run]));
 const nodes=flow.nodes.map(node=>({
  ...pick(node,['id','title','kind','status','parentId','judgement','executionState','executed','definition','boundary','reason','stepId','instanceId','actualNodeId','imageIds','classificationSpecId','decisionModel']),
  role:node.kind,runId:node.runId||null,schemeNodeId:node.schemeNodeId||runs.get(node.runId)?.schemeNodeId||null,
 }));
 const edges=flow.edges.map(edge=>({
  ...pick(edge,['id','from','to','kind','label','provenance','controlOnly','available','schemeFrom','schemeTo','fromRunId','toRunId','inputSlot','artifactId','imageId','metric','path','ruleId','bindingReason','classificationSpecId','categoryId','conditions','ruleIds','missingStates','fallback','selector','matchedRuleIds','observedMissing','conditionEvidence','resolution']),
  semantic:edge.label||(edge.kind==='contains'?'程序包含':edge.provenance==='verified-scheme-upstream'?'已核對上游產物傳遞':'已記錄程序依賴'),
  executed:typeof edge.executed==='boolean'?edge.executed:edge.provenance==='verified-scheme-upstream'?true:null,
 }));
 const fingerprint=historical?list(data.algorithmRuns).find(run=>run.runId===runId)?.sourceBinding?.schemeFingerprint||null:schemeFingerprint(scheme),title=scope==='node'?selected.title:historical?'完整歷史運算流程':'整個方案流程';
 const graph={schema:'agentcv-program-flow-inquiry-1',scope,selectedNodeId:selected?.id||null,
  scheme:{id:historical?null:scheme.id,title:historical?null:scheme.title||scheme.name||scheme.id,fingerprint},
  selection:{imageId:data.activeId||project.image?.id||null,unitId:current.unitId||flow.unitId||null,executionId:current.executionId||flow.executionId||null,runIds:historical?[runId]:[...current.runIds]},
  nodes,edges,roots:[...list(flow.roots)],diagnostics:list(flow.diagnostics).map(d=>pick(d,['code','message','runId','instanceId','schemeNodeId','fromNodeId','toNodeId','inputSlot'])),
  source:historical?'buildProgramFlow':'buildCurrentSchemeFlow',historical,readOnly:historical,unavailableReason:historical?current.reason:null,graphScope:flow.scope||null,
  interpretation:'完整圖結構；狀態只屬於所選工件／保存運算。宣告連線、可用輸入與實際執行有別；executed=null 表示只保存結構／依賴，未另證實此線執行。節點提問保留全圖供核對前後依賴，作用焦點由 selectedNodeId 決定。',
 };
 return freeze(clone({kind:'program_flow',scope,title,schemeId:graph.scheme.id,schemeFingerprint:fingerprint,...(boardId?{boardId}:{}),graph}));
}

/** No generic metadata truncation: dropping the seventeenth edge changes the
 * meaning of a whole-flow question. Keep code and pixels outside this schema. */
export function programFlowAgentReference(reference){
 const snapshot=reference?.graph;
 if(reference?.kind!=='program_flow'||snapshot?.schema!=='agentcv-program-flow-inquiry-1'||!Array.isArray(snapshot.nodes)||!Array.isArray(snapshot.edges))throw Error('流程提問引用格式不完整');
 if(!['whole-flow','node'].includes(reference.scope)||snapshot.scope!==reference.scope||reference.schemeId!==snapshot.scheme?.id||reference.schemeFingerprint!==snapshot.scheme?.fingerprint)throw Error('流程提問方案或範圍不一致');
 const ids=new Set(snapshot.nodes.map(node=>node.id));
 if(ids.size!==snapshot.nodes.length||snapshot.edges.some(edge=>!ids.has(edge.from)||!ids.has(edge.to))||(snapshot.roots||[]).some(id=>!ids.has(id)))throw Error('流程提問圖結構不完整');
 if(reference.scope==='node'?!ids.has(snapshot.selectedNodeId):snapshot.selectedNodeId!==null)throw Error('流程提問節點範圍不一致');
 const clean=clone(reference);
 const inspect=value=>{if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(['code','dataURL','dataUrl','base64','_visualImages'].includes(key)||typeof item==='string'&&/^data:/i.test(item))throw Error('流程文字引用不可包含程式全文或圖像像素');inspect(item)}};inspect(clean);
 return clean;
}

export const programFlowInquiryMethods={captureProgramFlowReference(options){return captureProgramFlowReference(this,options)}};
