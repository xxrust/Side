import {conditionText} from './workpiece-flow-boundaries.js';
const list=x=>Array.isArray(x)?x:[];
export function flowNodePresentation(project,node,flow){
 const data=project.data||project,spec=data.purposeScheme?.classificationSpec||{},nodes=list(flow?.nodes),name=id=>nodes.find(n=>n.id===id)?.title||id,detail=Object.fromEntries(node.details||[]),category=id=>list(spec.categories).find(c=>c.id===id)?.label||id;
 // Exits describe a recorded outcome. They never evaluate or route again.
 if(['category','system-exit'].includes(node.kind)){
  if(list(flow?.edges).some(e=>e.from===node.id))throw Error('FLOW_EXIT_CONTRACT: 結果出口不得具有後續分支：'+node.id);
  const origins=list(flow?.edges).filter(e=>e.to===node.id).map(e=>({from:e.from,title:name(e.from),active:e.executed===true,conditions:e.conditions||[],matchedRuleIds:e.matchedRuleIds||[],observedMissing:e.observedMissing||[],conditionEvidence:e.conditionEvidence||'unavailable'}));
  return {title:node.title,purpose:node.kind==='category'?'工件的最終分類結果；此出口不再執行判定。':'執行故障出口，與產品不合格分開處理。',objects:[],branches:[],resolution:null,origins,quality:node.kind==='category'?list(spec.categories).find(c=>'scheme::category:'+c.id===node.id)?.quality:null,result:node.executed?'本件已到達此出口':node.status==='BRANCH_NOT_SELECTED'?'本件未到達此出口':'尚無本件到達紀錄',missing:[],detail};
 }
 const selected=nodes.find(n=>n.kind==='category'&&n.executed),rules=node.kind==='rule'?list(spec.rules).filter(r=>'scheme::rule:'+r.id===node.id):list(spec.rules);
 const branches=node.kind==='decision'?list(flow.edges).filter(e=>e.from===node.id&&e.provenance==='classification-route').map(e=>({label:e.label,condition:e.label,to:e.to,title:name(e.to),active:e.executed===true,conditions:e.conditions,matchedRuleIds:e.matchedRuleIds,conditionEvidence:e.conditionEvidence})):rules.map(rule=>({label:typeof rule.when?.equals==='boolean'?(rule.when.equals?'True':'False'):conditionText(rule.when),condition:conditionText(rule.when),to:'scheme::category:'+rule.categoryId,title:category(rule.categoryId),active:!!nodes.find(n=>n.id==='scheme::rule:'+rule.id)?.executed}));
 if(node.kind==='rule'&&!rules.length)for(const edge of list(flow.edges).filter(e=>e.from===node.id))branches.push({label:'符合狀態',condition:node.title,to:edge.to,title:name(edge.to),active:edge.executed===true});
 const objects=list(data.purposeScheme?.metricBindings).filter(b=>!rules.length||rules.some(r=>JSON.stringify(r.when).includes('"'+b.metric+'"'))).map(b=>({title:list(spec.metrics).find(m=>m.id===b.metric)?.label||b.metric,from:'scheme::'+b.nodeId,source:name('scheme::'+b.nodeId),value:detail[b.metric]?.replace('MEASURED · ','')||'摘要未含量測值',unit:list(spec.metrics).find(m=>m.id===b.metric)?.unit||''}));
 return {resolution:node.kind==='decision'?{conflicts:spec.conflicts,aggregation:spec.aggregation}:null,title:node.kind==='decision'?'分類判定':node.title,purpose:node.kind==='decision'?'依量測結果與已定義條件，決定本件的最終類別。':node.kind==='rule'?'檢查此條件，符合時進入對應分類。':node.kind==='category'?'此分支代表工件的最終分類。':node.kind==='system-exit'?'收集執行故障，與產品不合格分開處理。':'',objects,branches,result:node.kind==='decision'?(node.executed&&selected?selected.title:node.status==='SKIPPED'?'未執行分類':'尚無本件分類結果'):node.kind==='rule'?(node.executed?'本件命中':node.status==='BRANCH_NOT_SELECTED'?'本件未命中':'尚無本件判定'):node.executed?'本件已到達此出口':node.status==='BRANCH_NOT_SELECTED'?'本件未到達此出口':'尚無本件到達紀錄',missing:[],detail};
}
export function sourceCollections(project,node){
 const data=project.data||project,ids=list(node.imageIds),fixed=new Set(Object.values(data.purposeScheme?.execution?.referenceInputs||{}));
 if(node.kind==='reference')return [{id:node.id,title:'固定參考圖集',imageIds:ids}];
 const groups=list(data.visualInquiry?.boards).flatMap(b=>list(b.projectSpaces?.sources)).filter(s=>ids.length?ids.some(id=>s.imageIds.includes(id)):s.imageIds.some(id=>!fixed.has(id)));
 return groups.length?groups.map(s=>({...s,imageIds:s.imageIds.filter(id=>!fixed.has(id))})):[{id:node.id,title:'本件圖集',imageIds:ids.filter(id=>!fixed.has(id))}];
}

export function flowExecutionRequest(project,batch=false){
 const compiled=project.compilePurposeScheme('scheme');if(!compiled.ok)throw Error('方案尚未通過編譯：'+(compiled.errors||[]).map(e=>e.message||e.code).slice(0,3).join('；'));
 return flowExecutionSelection(project,batch);
}

// Selection only: the execution entry point must validate the current scheme.
// Do not reuse an earlier compilation across asynchronous UI preparation.
export function flowExecutionSelection(project,batch=false){
 const scheme=project.purposeScheme;
 if(scheme?.execution?.unit!=='workpiece')throw Error('此舊方案尚未定義單件圖像輸入；請讓 Agent 先補齊單件執行結構。');
 const fixed=new Set(Object.values(scheme.execution.referenceInputs||{})),imageId=project.image?.id;
 if(!imageId||fixed.has(imageId))throw Error('請先從待檢圖像源選擇工件圖片；固定參考圖不作為待檢件。');
 if(scheme.execution.inputSlots?.filter(s=>s.required).length>1)throw Error('此方案需要同一工件的多視圖，請先明確配置工件分組；不能把不同工件拼成一件。');
 const sources=(project.data.visualInquiry?.boards||[]).flatMap(b=>b.projectSpaces?.sources||[]).filter(s=>s.imageIds.includes(imageId));
 if(batch){if(sources.length!==1)throw Error(sources.length?'這張圖片屬於多個圖像源，請先明確本次執行的來源。':'目前圖片未綁定圖像源，請先加入圖像源。');return {sourceId:sources[0].id};}
 return {units:[{id:crypto.randomUUID(),imageIds:[imageId]}],...(sources.length===1?{sourceId:sources[0].id}:{})};
}
