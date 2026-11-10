import {classificationDecisionModel} from './classification-flow-contract.js';
// One normal-result classification contract. Execution faults bypass categories.
const object=v=>v&&typeof v==='object'&&!Array.isArray(v),text=v=>typeof v==='string'&&v.trim(),finite=v=>typeof v==='number'&&Number.isFinite(v);
const type=m=>m.type||'number',domain=m=>type(m)==='boolean'?[false,true]:m.values;
const accepts=(m,v)=>type(m)==='number'?finite(v):type(m)==='boolean'?typeof v==='boolean':domain(m)?.includes(v);
function references(rule){return rule?.all||rule?.any?(rule.all||rule.any).flatMap(references):rule?.not?references(rule.not):[rule?.metric];}
function validRule(rule,metrics){
 if(!object(rule))return false;const keys=Object.keys(rule);
 if(keys.length===1&&['all','any'].includes(keys[0]))return Array.isArray(rule[keys[0]])&&rule[keys[0]].length>0&&rule[keys[0]].every(r=>validRule(r,metrics));
 if(keys.length===1&&keys[0]==='not')return validRule(rule.not,metrics);
 const m=metrics.get(rule.metric);if(!m||keys.length!==2)return false;
 if(Object.hasOwn(rule,'equals'))return accepts(m,rule.equals);
 if(Object.hasOwn(rule,'in'))return Array.isArray(rule.in)&&rule.in.length>0&&rule.in.every(v=>accepts(m,v));
 const v=rule.interval;return type(m)==='number'&&object(v)&&finite(v.min)&&finite(v.max)&&v.min<=v.max&&typeof v.includeMin==='boolean'&&typeof v.includeMax==='boolean'&&(v.min<v.max||v.includeMin&&v.includeMax);
}
function evaluate(rule,observations){
 if(rule.all||rule.any){const checks=(rule.all||rule.any).map(r=>evaluate(r,observations));return rule.all?(checks.includes(false)?false:checks.includes(null)?null:true):(checks.includes(true)?true:checks.includes(null)?null:false);}
 if(rule.not){const v=evaluate(rule.not,observations);return v===null?null:!v;}
 const o=observations.get(rule.metric);if(!o?.valid)return null;const value=o.value;
 if(Object.hasOwn(rule,'equals'))return value===rule.equals;
 if(rule.in)return rule.in.includes(value);
 const v=rule.interval;return(value>v.min||v.includeMin&&value===v.min)&&(value<v.max||v.includeMax&&value===v.max);
}
export function compileClassificationSpec(spec){
 const errors=[],questions=[],overlaps=[];
 const issue=(code,path,question)=>{errors.push({code,path,message:question,hint:'向規格來源核對並保存答案／推定授權後重新編譯。'});questions.push({id:`${code}:${path}`,code,path,question});};
 if(!object(spec)){issue('CLASSIFICATION_SPEC_REQUIRED','classificationSpec','需要定義本案的分類與判定規格。');return {ok:false,errors,questions};}
 if(spec.schema!=='agentcv-classification-spec-1'||!text(spec.id))issue('CLASSIFICATION_ID_REQUIRED','classificationSpec.id','規格的schema及穩定ID是什麼？');
 if(!Array.isArray(spec.provenance)||!spec.provenance.length)issue('CLASSIFICATION_SOURCE_REQUIRED','classificationSpec.provenance','分類與門檻來自哪個人類要求、文件或已授權推定？');
 else for(const [i,p]of spec.provenance.entries())if(!['human','document','agent-inference'].includes(p?.type)||!text(p.ref)||!['confirmed','inferred'].includes(p.status)||p.type==='agent-inference'&&(p.status!=='inferred'||!text(p.authorization)))issue('CLASSIFICATION_SOURCE_INVALID',`classificationSpec.provenance.${i}`,'推定必須保留inferred狀態及明確授權，不得冒充獨立人工真值。');
 const cats=Array.isArray(spec.categories)?spec.categories:[],ids=new Set(cats.map(c=>c?.id));
 if(!cats.length||ids.size!==cats.length||cats.some(c=>!text(c?.id)||!text(c?.label)||!['good','bad','undetermined'].includes(c?.quality)))issue('CLASSIFICATION_CATEGORIES_INVALID','classificationSpec.categories','有哪些分類／分檔？每一類的品質屬性是good、bad還是undetermined？');
 const metrics=Array.isArray(spec.metrics)?spec.metrics:[],mids=new Map(metrics.filter(object).map(m=>[m.id,m]));
 if(!metrics.length||mids.size!==metrics.length||metrics.some(m=>!text(m?.id)||!['number','boolean','enum'].includes(type(m||{}))||type(m||{})==='number'&&(!text(m.unit)||!finite(m.range?.min)||!finite(m.range?.max)||m.range.min>=m.range.max)||type(m||{})==='enum'&&(!Array.isArray(m.values)||!m.values.length||new Set(m.values).size!==m.values.length||m.values.some(v=>typeof v!=='string'))))issue('CLASSIFICATION_METRICS_INVALID','classificationSpec.metrics','量需宣告number（單位與有限範圍）、boolean，或enum（有限字串values）。');
 const rules=Array.isArray(spec.rules)?spec.rules:[],rids=new Set(rules.map(r=>r?.id));
 if(!rules.length||rids.size!==rules.length)issue('CLASSIFICATION_RULES_REQUIRED','classificationSpec.rules','正常有效量測如何對應各個分類？');
 const intervals=new Map();let complex=false;
 for(const [i,r]of rules.entries()){
  const p=`classificationSpec.rules.${i}`;
  if(!text(r?.id)||!ids.has(r?.categoryId)||r?.defectLabels!==undefined&&(!Array.isArray(r.defectLabels)||r.defectLabels.some(label=>!text(label)))||!validRule(r?.when,mids)){issue('CLASSIFICATION_RULE_INVALID',p,'條件支援typed equals／in／number interval與all／any／not；區間須明確兩端歸屬。');continue;}
  if(r.when.interval){const v=r.when.interval,m=mids.get(r.when.metric);if(v.min<m.range.min||v.max>m.range.max)issue('CLASSIFICATION_RULE_OUTSIDE_RANGE',p,'此規則超出已聲明的量測有效範圍。');if(!intervals.has(m.id))intervals.set(m.id,[]);intervals.get(m.id).push({rule:r,...v});}
  if(r.when.all||r.when.any||r.when.not)complex=true;
 }
 if(!['priority','multilabel'].includes(spec.conflicts?.mode))issue('CLASSIFICATION_CONFLICT_POLICY_REQUIRED','classificationSpec.conflicts','多個條件同時命中時，採優先級還是多標籤？');
 if(spec.conflicts?.mode==='priority'&&(!Array.isArray(spec.conflicts.priority)||spec.conflicts.priority.length!==rules.length||new Set(spec.conflicts.priority).size!==rules.length||spec.conflicts.priority.some(id=>!rids.has(id))))issue('CLASSIFICATION_PRIORITY_INCOMPLETE','classificationSpec.conflicts.priority','請明確排列所有規則的優先級。');
 if(!['exhaustive','fallback'].includes(spec.coverage?.policy)||spec.coverage?.policy==='fallback'&&!ids.has(spec.coverage.fallbackCategoryId))issue('CLASSIFICATION_COVERAGE_REQUIRED','classificationSpec.coverage','未命中規則的正常結果如何分類？要完整區間覆蓋還是明確fallback類？');
 if(complex&&spec.coverage?.policy==='exhaustive')issue('CLASSIFICATION_COMPLEX_COVERAGE_REQUIRES_FALLBACK','classificationSpec.coverage','聯合／否定條件需要明確fallback；本編譯器不宣稱已證明所有組合覆蓋。');
 for(const [metric,list]of intervals){
  list.sort((a,b)=>a.min-b.min||a.max-b.max);const m=mids.get(metric);
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length&&list[j].min<=list[i].max;j++)if(list[j].min<list[i].max||list[i].includeMax&&list[j].includeMin)overlaps.push({metric,ruleIds:[list[i].rule.id,list[j].rule.id],resolution:spec.conflicts?.mode});
  if(spec.coverage?.policy==='exhaustive'&&!complex){let end=m.range.min,included=false;for(const v of list){if(v.min>end||v.min===end&&!included&&!v.includeMin)issue('CLASSIFICATION_RANGE_GAP',`classificationSpec.rules.${v.rule.id}`,`${metric} 在 ${end} 到 ${v.min} 有未覆蓋值／端點。`);if(v.max>end){end=v.max;included=v.includeMax;}else if(v.max===end)included||=v.includeMax;}if(end<m.range.max||end===m.range.max&&!included)issue('CLASSIFICATION_RANGE_GAP',`classificationSpec.metrics.${metric}`,`${metric} 的有效上限 ${m.range.max} 尚未覆蓋。`);}
 }
 for(const m of metrics.filter(object)){
  const related=rules.filter(r=>references(r?.when).includes(m.id));
  if(!related.length)issue('CLASSIFICATION_METRIC_UNBOUND',`classificationSpec.metrics.${m.id}`,'此量未連到任何分類規則。');
  if(spec.coverage?.policy==='exhaustive'&&!complex){if(type(m)==='number'&&!intervals.has(m.id))issue('CLASSIFICATION_RANGE_GAP',`classificationSpec.metrics.${m.id}`,'number完整覆蓋需要區間；離散比較請指定fallback。');else if(type(m)!=='number'&&Array.isArray(domain(m)))for(const value of domain(m))if(!related.some(r=>validRule(r.when,mids)&&evaluate(r.when,new Map([[m.id,{valid:true,value}]]))===true))issue('CLASSIFICATION_DOMAIN_GAP',`classificationSpec.metrics.${m.id}`,`離散值 ${JSON.stringify(value)} 沒有任何分類規則。`);}
 }
 for(const status of ['NOT_FOUND','MISSING','SKIPPED'])if(!ids.has(spec.missing?.[status]))issue('CLASSIFICATION_MISSING_MAPPING',`classificationSpec.missing.${status}`,`${status} 應映射到哪個已定義分類？不會自動新增UNKNOWN或填零。`);
 if(!['all-good','priority'].includes(spec.aggregation?.mode))issue('CLASSIFICATION_AGGREGATION_REQUIRED','classificationSpec.aggregation','最終出口必須互斥：使用priority並排列全部分類；multilabel只能作缺陷標籤，不可作最終分類。');
 if(spec.aggregation?.mode==='all-good'&&(metrics.length!==1||spec.conflicts?.mode!=='priority'))issue('CLASSIFICATION_FINAL_CATEGORY_AMBIGUOUS','classificationSpec.aggregation','舊all-good只在單量且規則priority可證唯一時相容；本案多命中必須指定最終category priority，不會暗選。');
 if(spec.aggregation?.mode==='priority'&&(!Array.isArray(spec.aggregation.priority)||spec.aggregation.priority.length!==cats.length||new Set(spec.aggregation.priority).size!==cats.length||spec.aggregation.priority.some(id=>!ids.has(id))))issue('CLASSIFICATION_AGGREGATION_PRIORITY','classificationSpec.aggregation.priority','請排列所有分類的彙總優先級。');
 if(spec.fault?.exit!=='FAULT')issue('CLASSIFICATION_FAULT_EXIT_REQUIRED','classificationSpec.fault','執行故障必須走獨立FAULT出口，不能歸為產品NG。');
 return {ok:errors.length===0,errors,questions,overlaps,schema:spec.schema,...(errors.length?{}:{decisionModel:classificationDecisionModel(spec)})};
}
export function classifyWorkpiece(spec,observations,{faults=[]}={}){
 if(faults.length)return {valid:false,status:'FAULT',categoryId:null,categoryIds:[],defectLabels:[],quality:null,faults};
 const input=new Map((observations||[]).map(o=>[o.metric,o])),values=new Map(),missing=[],decisions=[];
 for(const metric of spec.metrics){const o=input.get(metric.id);let reason=!o?'MISSING':['NOT_FOUND','MISSING','SKIPPED'].includes(o.status)?o.status:o.valid===false?'NOT_FOUND':!accepts(metric,o.value)?'MISSING':type(metric)==='number'&&(o.value<metric.range.min||o.value>metric.range.max)?'MISSING':null;values.set(metric.id,{value:reason?null:o.value,valid:!reason});if(reason)missing.push(spec.missing[reason]);decisions.push({metric:metric.id,value:reason?null:o.value,status:reason||'MEASURED',categoryIds:reason?[spec.missing[reason]]:[]});}
 const allMatched=spec.rules.filter(r=>evaluate(r.when,values)===true),defectLabels=[...new Set(allMatched.flatMap(r=>r.defectLabels|| (spec.categories.find(c=>c.id===r.categoryId)?.quality==='bad'?[r.categoryId]:[])))];
 let matched=[...allMatched];
 if(spec.conflicts.mode==='priority'){matched.sort((a,b)=>spec.conflicts.priority.indexOf(a.id)-spec.conflicts.priority.indexOf(b.id));matched=matched.slice(0,1);}
 let categoryIds=[...new Set([...missing,...matched.map(r=>r.categoryId)])];if(!categoryIds.length&&spec.coverage.policy==='fallback')categoryIds=[spec.coverage.fallbackCategoryId];
 if(spec.aggregation.mode==='priority'){categoryIds.sort((a,b)=>spec.aggregation.priority.indexOf(a)-spec.aggregation.priority.indexOf(b));categoryIds=categoryIds.slice(0,1);}
 else if(spec.aggregation.mode==='all-good'){const bad=categoryIds.filter(id=>spec.categories.find(c=>c.id===id).quality==='bad'),unknown=categoryIds.filter(id=>spec.categories.find(c=>c.id===id).quality==='undetermined');categoryIds=bad.length?bad:unknown.length?unknown:categoryIds;}
 if(categoryIds.length!==1)return {valid:false,status:'CLASSIFICATION_CONTRACT_ERROR',categoryId:null,categoryIds:[],defectLabels,quality:null,reason:'FINAL_CATEGORY_NOT_UNIQUE',candidates:categoryIds,decisions};
 const qualities=categoryIds.map(id=>spec.categories.find(c=>c.id===id).quality);
 return {valid:true,status:'CLASSIFIED',categoryId:categoryIds[0],categoryIds,defectLabels,quality:qualities.includes('bad')?'bad':qualities.includes('undetermined')?'undetermined':qualities.length?'good':null,ruleIds:matched.map(r=>r.id),matchedRuleIds:allMatched.map(r=>r.id),decisions};
}
