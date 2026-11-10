// Evidence is bound to a recorded classification, never the canvas's last image.
const list=x=>Array.isArray(x)?x:[];
export const conditionMetrics=when=>when?.all||when?.any?(when.all||when.any).flatMap(conditionMetrics):when?.not?conditionMetrics(when.not):when?.metric?[when.metric]:[];
export function decisionEvidenceIssues(scheme){
 const spec=scheme.classificationSpec||{},nodes=list(scheme.operatorGraph?.nodes),issues=[];
 for(const [key,items] of [['categories',spec.categories],['rules',spec.rules],['metrics',spec.metrics]])for(const [i,item] of list(items).entries())if(item.evidence!==undefined){
  const path=`classificationSpec.${key}.${i}.evidence`;
  if(!Array.isArray(item.evidence)||!item.evidence.length)issues.push({code:'DECISION_EVIDENCE_INVALID',path,message:'判定依據需非空的 nodeId / artifactId 圖像引用陣列。'});
  else for(const ref of item.evidence)if(!ref||!nodes.some(n=>n.id===ref.nodeId&&list(n.expected_outputs).some(a=>a.id===ref.artifactId&&a.type==='image')))issues.push({code:'DECISION_EVIDENCE_REFERENCE_INVALID',path,message:'判定依據必須引用方案中真實節點已宣告的圖像產物，不能用檔名或外部舊圖。'});
 }
 return issues;
}
function outputRefs(node,run){
 return list(node?.expected_outputs||run?.expectedOutputs).filter(a=>a.type==='image'&&a.role==='result').map(a=>({nodeId:node?.id||run.schemeNodeId,artifactId:a.id}));
}
/** Called at execution time before durable save. No image bytes or AI call. */
export function buildDecisionEvidence(scheme,record,runs){
 const spec=scheme.classificationSpec||{},nodes=list(scheme.operatorGraph?.nodes),byNode=new Map(runs.map(r=>[r.schemeNodeId,r])),result=record.result||{},state=typeof record.execution==='string'?record.execution:record.execution?.status;
 const model={schema:'agentcv-decision-evidence-1',unitId:record.unitId,imageIds:record.imageIds,schemeFingerprint:record.schemeFingerprint,categoryId:result.categoryId||null,status:state,reasons:[],notExecuted:list(record.nodeStates).filter(s=>s.status==='SKIPPED').map(s=>({nodeId:s.nodeId,reason:s.reason}))};
 const actual=r=>r&&list(record.runIds).includes(r.runId)&&r.workpieceUnit?.id===record.unitId&&list(record.imageIds).length===list(r.workpieceUnit?.imageIds).length&&record.imageIds.every(id=>r.workpieceUnit.imageIds.includes(id));
 const add=(reason,refs)=>{
  const images=[];for(const ref of refs){const run=byNode.get(ref.nodeId);if(!actual(run))continue;const a=list(run.artifacts).find(a=>a.id===ref.artifactId&&a.type==='image');if(a&&!images.some(i=>i.runId===run.runId&&i.artifactId===a.id))images.push({runId:run.runId,nodeId:ref.nodeId,artifactId:a.id,sha256:a.sha256,label:ref.label||a.name||a.id});}
  model.reasons.push({...reason,images,unavailable:!images.length});
 };
 if(state==='CANCELLED')return model;
 if(state==='FAULT'){
  const run=[...runs].reverse().find(r=>actual(r)&&r.status==='SUCCEEDED'&&r.execution?.status!=='FAULT');
  add({id:'fault',title:'執行故障',kind:'fault',basis:'last-valid-before-fault',note:'以下僅為故障前最後有效圖，不是本件分類結果。'},run?outputRefs(nodes.find(n=>n.id===run.schemeNodeId),run):[]);return model;
 }
 if(!result.valid)return model;
 const category=list(spec.categories).find(c=>c.id===result.categoryId);
 if(result.quality==='good'){
  const run=[...runs].reverse().find(r=>actual(r)&&r.status==='SUCCEEDED'&&outputRefs(nodes.find(n=>n.id===r.schemeNodeId),r).length);
  add({id:'category:'+result.categoryId,title:category?.label||result.categoryId,kind:'category',basis:category?.evidence?'declared':'last-declared-result',note:category?.evidence?'方案指定的結果總覽圖':'本次最後執行節點所宣告的結果圖'},category?.evidence|| (run?outputRefs(nodes.find(n=>n.id===run.schemeNodeId),run):[]));return model;
 }
 const matched=new Set(result.matchedRuleIds||result.ruleIds||[]),rules=list(spec.rules).filter(r=>matched.has(r.id));
 const priority=list(spec.conflicts?.priority);rules.sort((a,b)=>Number(b.categoryId===result.categoryId)-Number(a.categoryId===result.categoryId)||priority.indexOf(a.id)-priority.indexOf(b.id));
 for(const rule of rules){const observations=list(record.observations).filter(o=>conditionMetrics(rule.when).includes(o.metric)),refs=rule.evidence||observations.flatMap(o=>outputRefs(nodes.find(n=>n.id===o.nodeId),byNode.get(o.nodeId)));add({id:'rule:'+rule.id,ruleId:rule.id,title:rule.label||list(spec.categories).find(c=>c.id===rule.categoryId)?.label||rule.id,kind:'rule',categoryId:rule.categoryId,primary:rule.categoryId===result.categoryId,basis:rule.evidence?'declared':'metric-producer',condition:rule.when,observations,note:rule.evidence?'命中規則指定的依據圖':'沿命中規則的量測來源，顯示該節點的結果圖'},refs);}
 for(const decision of list(result.decisions).filter(d=>d.status!=='MEASURED')){
  const metric=list(spec.metrics).find(m=>m.id===decision.metric),observation=list(record.observations).find(o=>o.metric===decision.metric),producers=new Set(),walk=id=>{if(!id||producers.has(id))return;producers.add(id);const s=list(record.nodeStates).find(s=>s.nodeId===id);if(s?.status==='SKIPPED')for(const p of list(s.blockedBy))walk(p);};walk(observation?.nodeId);
  const refs=metric?.evidence||[...producers].flatMap(id=>outputRefs(nodes.find(n=>n.id===id),byNode.get(id)));
  add({id:'missing:'+decision.metric,metric:decision.metric,title:(metric?.label||decision.metric)+' · '+decision.status,kind:'missing',primary:decision.categoryIds?.includes(result.categoryId),basis:metric?.evidence?'declared':'missing-producer',observations:observation?[observation]:[],note:'量測未取得；沿實際前提失效鏈查找證據。'},refs);
 }
 model.reasons.sort((a,b)=>Number(b.primary===true)-Number(a.primary===true));
 if(!model.reasons.length)add({id:'category:'+result.categoryId,title:category?.label||result.categoryId,kind:'category',basis:category?.evidence?'declared':'unavailable',note:'本件由分類保底規則決定；沒有逐條命中依據。'},category?.evidence||[]);
 return model;
}
