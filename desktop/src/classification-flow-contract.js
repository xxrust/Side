// A classification specification describes one decision, not a chain of tests.
// This canonical model is shared by compilation, graph construction and inquiry.
const list=v=>Array.isArray(v)?v:[];
const copy=v=>JSON.parse(JSON.stringify(v));
export function conditionText(c){if(!c)return '未提供條件';if(c.all)return '('+c.all.map(conditionText).join(' 且 ')+')';if(c.any)return '('+c.any.map(conditionText).join(' 或 ')+')';if(c.not)return '非（'+conditionText(c.not)+'）';const m=c.metric||'';if(Object.hasOwn(c,'equals'))return typeof c.equals==='boolean'?m+(c.equals?' 成立':' 不成立'):m+' = '+String(c.equals);if(c.in)return m+' ∈ '+c.in.join('、');if(c.interval){const i=c.interval;return `${m} ∈ ${i.includeMin?'[':'('}${i.min}, ${i.max}${i.includeMax?']':')'}`;}return JSON.stringify(c);}
const statusText=s=>({NOT_FOUND:'未找到',MISSING:'缺少量測',SKIPPED:'前提未成立'}[s]||s);
export function classificationDecisionModel(spec){
 const routes=list(spec?.categories).map(category=>{
  const rules=list(spec.rules).filter(r=>r.categoryId===category.id),missingStates=Object.entries(spec.missing||{}).filter(([,id])=>id===category.id).map(([s])=>s),fallback=spec.coverage?.policy==='fallback'&&spec.coverage.fallbackCategoryId===category.id;
  const conditions=[...rules.map(r=>({kind:'rule',ruleId:r.id,when:copy(r.when),label:conditionText(r.when)})),...missingStates.map(status=>({kind:'missing',status,label:statusText(status)})),...(fallback?[{kind:'fallback',label:'無規則及失效映射命中'}]:[])];
  return {id:'classification-route:'+category.id,categoryId:category.id,conditions,ruleIds:rules.map(r=>r.id),missingStates,fallback,label:conditions.map(c=>c.label).join(' 或 ')||'未宣告到達條件',selector:{kind:'final-category',categoryId:category.id}};
 });
 return {schema:'agentcv-classification-decision-1',specId:spec?.id,decisionCount:1,conditionsOn:'branches',rulesAreNodes:false,uniqueFinalCategory:true,conflicts:copy(spec?.conflicts||{}),aggregation:copy(spec?.aggregation||{}),routes};
}
export function classificationRouteEdges(spec,unit){
 const model=classificationDecisionModel(spec),result=unit?.result||unit?.classification,categoryId=result?.categoryId||unit?.categoryId,recorded=!!categoryId&&unit?.finalExit===`PRODUCT:${categoryId}`,matched=new Set(list(result?.ruleIds));
 return model.routes.map(route=>({...route,from:'scheme::classification',to:'scheme::category:'+route.categoryId,kind:'dependency',provenance:'classification-route',classificationSpecId:spec?.id,executed:recorded&&categoryId===route.categoryId,
  // Final exit evidence and individual condition evidence are deliberately separate.
  matchedRuleIds:route.ruleIds.filter(id=>matched.has(id)),observedMissing:list(result?.decisions).filter(d=>route.missingStates.includes(d.status)).map(d=>({metric:d.metric,status:d.status})),conditionEvidence:result?'recorded-details':'unavailable',resolution:{conflicts:model.conflicts,aggregation:model.aggregation},bindingReason:recorded&&categoryId===route.categoryId?'保存的唯一 finalExit；不推測未保存的規則命中':'此類別沒有本件最終出口紀錄'}));
}
/** Construction-time invariant, before any renderer/Agent receives the graph. */
export function assertClassificationFlow(flow,spec={}){
 const fail=message=>{throw Error('CLASSIFICATION_FLOW_CONTRACT: '+message+'；分類只建一個決策節點，條件保存在直達類別的分支，不得重複提升為判定節點。');};
 const nodes=list(flow.nodes),edges=list(flow.edges),decision=nodes.filter(n=>n.id==='scheme::classification'||spec.id&&n.classificationSpecId===spec.id&&n.kind==='decision');
 for(const exit of nodes.filter(n=>['category','system-exit'].includes(n.kind))){
  if(edges.some(e=>e.from===exit.id))fail('結果出口不得有出線 '+exit.id);
  if(exit.rules?.length||exit.decisionModel)fail('結果出口不得擁有判定規則 '+exit.id);
 }
 if(decision.length!==1||decision[0].kind!=='decision')fail('同一分類規格必須且只能有一個決策');
 if(nodes.some(n=>n.boundary&&(n.kind==='rule'||n.id.startsWith('scheme::rule:')||n.id.startsWith('scheme::missing:'))))fail('出現重複的分類條件節點');
 const routes=edges.filter(e=>e.from===decision[0].id),expected=classificationDecisionModel(spec).routes;
 if(routes.length!==expected.length)fail('分類出口數與已宣告類別不一致');
 for(const r of expected){const found=routes.filter(e=>e.to==='scheme::category:'+r.categoryId);if(found.length!==1||found[0].provenance!=='classification-route'||JSON.stringify(found[0].conditions)!==JSON.stringify(r.conditions)||JSON.stringify(found[0].selector)!==JSON.stringify(r.selector)||!nodes.some(n=>n.id===found[0].to&&n.kind==='category'))fail('分支遺失、重複、條件失真或未直達類別 '+r.categoryId);}
 const selected=nodes.filter(n=>n.kind==='category'&&n.executed),active=routes.filter(e=>e.executed);
 if(Boolean(decision[0].executed)!==Boolean(selected.length)||active.length>1||selected.length>1||active.length!==selected.length||active.length&&active[0].to!==selected[0].id)fail('高亮路徑必須對應唯一保存的最終類別');
 return true;
}
