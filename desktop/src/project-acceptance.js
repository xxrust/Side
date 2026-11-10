import {schemeFingerprint} from './purpose-compiler.js';
import {compileClassificationSpec} from './classification-spec.js';
import {resolveWorkpieceExpected} from './workpiece-expected-label.js';

const copy=v=>v==null?v:structuredClone(v),now=()=>new Date().toISOString();
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const hash=i=>i?.contentSha256||i?.assetRef?.sha256||i?.sha256;
const state=p=>p.data.acceptanceWorkspace||{schema:'agentcv-project-acceptance-1',assignments:{},baselines:[],cases:[],agreements:[]};
const edit=(p,action,fn)=>p.mutate(action,()=>{p.data.acceptanceWorkspace??=copy(state(p));fn(p.data.acceptanceWorkspace);});
const scheme=p=>p.purposeScheme||p.data.purposeScheme;
// Algorithm changes may be compared under one agreement. Changing the input
// definition or classification rules requires human reconfirmation.
const contract=p=>({classificationSpec:scheme(p)?.classificationSpec||null,unit:scheme(p)?.execution?.unit||null,inputSlots:scheme(p)?.execution?.inputSlots||[],referenceInputs:scheme(p)?.execution?.referenceInputs||{}});
export const acceptanceCriteria=[['maxMissRate','漏檢率上限'],['maxFalseRejectRate','誤剔率上限'],['maxMismatchRate','分類不一致率上限'],['maxFaultRate','執行故障率上限'],['maxCycleMs','完整主機週期上限（ms）']];
export function acceptanceQuestions(p){
 const s=state(p),d=s.draft||{},q=[];
 const add=(code,question)=>q.push({id:code,code,path:'acceptanceWorkspace',question,blocking:false});
 for(const [key,label]of acceptanceCriteria){const v=d[key];if(!Number.isFinite(v)||v<0||(key==='maxCycleMs'?v===0:v>1))add('ACCEPTANCE_'+key,`請提供${label}${key==='maxCycleMs'?'，含結果保存，不含相機／PLC延遲':'（0–100%）'}及依據。`);}
 for(const [key,label]of [['unitDescription','一件工件與多相機輸入的對應'],['missingPolicy','量測失敗時的產品歸類'],['faultPolicy','執行故障時的處置與產線去向'],['source','驗收要求的來源']])if(!d[key]?.trim())add('ACCEPTANCE_'+key,`請確認${label}。`);
 if(!compileClassificationSpec(scheme(p)?.classificationSpec).ok)add('ACCEPTANCE_CLASSIFICATION','請先補齊互斥且完備的分類規格。');
 return q;
}
export function currentAgreement(p){
 const s=state(p),a=s.agreements?.at(-1);return a&&stable(a.contract)===stable(contract(p))&&stable(a.criteria)===stable(s.draft)?a:null;
}
export function proposeAcceptance(p,draft){
 if(!draft||typeof draft!=='object'||Array.isArray(draft))throw Error('需要完整驗收約定草案');
 const allowed=[...acceptanceCriteria.map(c=>c[0]),'unitDescription','missingPolicy','faultPolicy','source'];
 const clean=Object.fromEntries(allowed.filter(k=>draft[k]!==undefined).map(k=>[k,copy(draft[k])]));
 for(const [k,v]of Object.entries(clean))if(acceptanceCriteria.some(c=>c[0]===k)?v!==null&&(!Number.isFinite(v)||v<0||(k==='maxCycleMs'?v===0:v>1)):typeof v!=='string'||v.length>4000)throw Error('驗收欄位無效：'+k);
 edit(p,'acceptance_draft_updated',s=>s.draft=clean);return acceptanceContext(p);
}
export function confirmAcceptance(p){
 const questions=acceptanceQuestions(p);if(questions.length){const error=Error('驗收條件未完整，請先回答待確認問題');error.questions=questions;throw error;}
 const a={id:crypto.randomUUID(),at:now(),actor:'human',contract:copy(contract(p)),criteria:copy(state(p).draft)};
 edit(p,'acceptance_confirmed',s=>s.agreements.push(a));return copy(a);
}
export function assignAcceptanceSample(p,imageId,{partition,group='',condition=''}={}){
 if(!p.imageRecord(imageId)||!['development','acceptance','unassigned'].includes(partition))throw Error('請選有效圖片與資料集');
 if(typeof group!=='string'||typeof condition!=='string'||group.length>200||condition.length>1000)throw Error('批次／條件文字過長');
 const s=state(p),h=hash(p.imageRecord(imageId));
 const others=[...Object.entries(s.assignments).filter(([id])=>id!==imageId).map(([id,a])=>({...a,hash:hash(p.imageRecord(id))})),...s.baselines.flatMap(b=>b.samples.flatMap(u=>u.identities.map(i=>({hash:i.sha256,group:u.group,partition:b.partition}))))];
 if(partition!=='unassigned'&&others.some(a=>a.partition!=='unassigned'&&a.partition!==partition&&((h&&a.hash===h)||(group.trim()&&a.group===group.trim()))))throw Error('相同圖片內容或同一批次／工件不能跨開發集與保留驗收集；既有固定基準亦保留隔離。');
 edit(p,'acceptance_sample_assigned',s=>s.assignments[imageId]={partition,group:group.trim(),condition:condition.trim()});
}
export function assignAcceptanceSamples(p,assignments){
 if(!Array.isArray(assignments)||!assignments.length)throw Error('沒有要分配的圖片');
 // Validate the whole batch before one undo checkpoint; never copy a large
 // project once per image or leave a partially assigned selection on failure.
 const candidate=copy(state(p)),shadow={data:{...p.data,acceptanceWorkspace:candidate},imageRecord:id=>p.imageRecord(id),mutate:(_,fn)=>fn()};
 for(const a of assignments)assignAcceptanceSample(shadow,a.imageId,a);
 edit(p,'acceptance_samples_assigned',s=>s.assignments=candidate.assignments);
}
export function freezeAcceptanceBaseline(p,{partition,title,units}={}){
 if(!['development','acceptance'].includes(partition))throw Error('請選開發或保留驗收集');
 const s=state(p),fixed=new Set(Object.values(scheme(p)?.execution?.referenceInputs||{}));
 const candidates=units||Object.entries(s.assignments).filter(([,a])=>a.partition===partition).filter(([id])=>!fixed.has(id)).map(([id])=>({id,imageIds:[id]}));
 if(!Array.isArray(candidates)||!candidates.length)throw Error('此集合沒有工件；請先分配真實圖片');
 if(!units&&(scheme(p)?.execution?.inputSlots||[]).filter(s=>s.required).length>1)throw Error('多相機方案需要明確工件 views；請用固定基準的 units 定義，不能把獨立圖片自動合件');
 const seen=new Set(),samples=candidates.map(u=>{
  if(!u.id||seen.has(u.id)||!Array.isArray(u.imageIds)||!u.imageIds.length)throw Error('工件 ID 必須唯一且含原圖');seen.add(u.id);
  const identities=u.imageIds.map(id=>{const i=p.imageRecord(id),a=s.assignments[id];if(!i||fixed.has(id)||a?.partition!==partition||!hash(i))throw Error('基準圖必須已分組且具有真實內容指紋');return {imageId:id,sha256:hash(i)};});
  const slots=scheme(p)?.execution?.inputSlots||[];if(slots.filter(s=>s.required).length>1&&(!u.views||slots.some(s=>s.required&&!u.imageIds.includes(u.views[s.id]))))throw Error('多視圖工件缺少必要輸入槽對應');
  const expected=resolveWorkpieceExpected(p,u).expected;
  if(expected&&(expected.provenance?.type!=='human'||expected.provenance?.status!=='confirmed'||!expected.provenance?.ref||expected.categoryIds?.length!==1))throw Error('基準答案必須有人工確認來源與唯一類別');
  return {id:u.id,imageIds:copy(u.imageIds),...(u.views?{views:copy(u.views)}:{}),identities,expected:copy(expected),group:s.assignments[u.imageIds[0]]?.group||'',condition:s.assignments[u.imageIds[0]]?.condition||''};
 });
 const uniqueHashes=new Set(samples.flatMap(u=>u.identities.map(i=>i.sha256)));if(uniqueHashes.size!==samples.reduce((n,u)=>n+u.identities.length,0))throw Error('固定基準不能重複計入相同內容；請移除重複圖片');
 const b={id:crypto.randomUUID(),title:String(title||`${partition==='development'?'開發':'保留驗收'}基準`).slice(0,200),partition,at:now(),schemeFingerprint:schemeFingerprint(scheme(p)),contract:copy(contract(p)),agreementId:currentAgreement(p)?.id||null,samples,referenceIdentities:Object.entries(scheme(p)?.execution?.referenceInputs||{}).map(([slot,id])=>({slot,imageId:id,sha256:hash(p.imageRecord(id))}))};
 if(b.referenceIdentities.some(i=>!i.sha256))throw Error('固定參考圖缺少內容指紋');
 edit(p,'acceptance_baseline_frozen',s=>s.baselines.push(b));return copy(b);
}
export function baselineRunOptions(p,baselineId,{actor='agent'}={}){
 const s=state(p),b=s.baselines.find(b=>b.id===baselineId);if(!b)throw Error('固定基準不存在');
 if(b.partition==='acceptance'&&actor!=='human')throw Error('保留驗收集由人類在驗收面板啟動；日常修正請跑開發集');
 if(stable(b.contract)!==stable(contract(p)))throw Error('分類或輸入契約已改變，請重新核對約定並建立新基準');
 for(const i of [...b.samples.flatMap(u=>u.identities),...b.referenceIdentities])if(hash(p.imageRecord(i.imageId))!==i.sha256)throw Error('固定基準原圖或參考內容已改變，不能沿用舊基準');
 if(b.partition==='acceptance'&&!currentAgreement(p))throw Error('請先由人類確認目前驗收約定');
 return {baselineId:b.id,baselineActor:actor,autoAdvance:false,units:b.samples.map(u=>({id:u.id,imageIds:copy(u.imageIds),...(u.views?{views:copy(u.views)}:{}),expected:copy(u.expected)}))};
}
const unitStatus=u=>typeof u.execution==='string'?u.execution:u.execution?.status;
const predicted=u=>u.categoryId||u.result?.categoryId;
export function assessBaselineExecution(p,executionId){
 const s=state(p),e=p.data.datasetExecutions?.find(e=>e.id===executionId),b=s.baselines.find(b=>b.id===e?.baselineId);
 if(!b)return null;
 const agreement=s.agreements.find(a=>a.id===e.acceptanceAgreementId),criteria=agreement?.criteria,categories=b.contract.classificationSpec?.categories||[],quality=id=>categories.find(c=>c.id===id)?.quality;
 const byId=new Map((e.units||[]).map(u=>[u.unitId,u])),rows=b.samples.map(sample=>{const u=byId.get(sample.id),expected=sample.expected?.categoryIds?.[0],actual=predicted(u||{}),completed=unitStatus(u||{})==='COMPLETED';return {unitId:sample.id,expected,actual,completed,matched:completed&&!!expected&&actual===expected,status:unitStatus(u||{}),cycleMs:(u?.cycleTiming?.includes?.includes('durable-save')||e.retention==='durable-unit-records')?u?.cycleTiming?.totalMs:null,recordRef:u?.recordRef||null};});
 const labelled=rows.filter(r=>r.expected),usable=labelled.filter(r=>r.completed&&r.actual),bad=usable.filter(r=>quality(r.expected)==='bad'),good=usable.filter(r=>quality(r.expected)==='good');
 const rate=(a,n)=>n?a/n:null,miss=rate(bad.filter(r=>quality(r.actual)==='good').length,bad.length),falseReject=rate(good.filter(r=>quality(r.actual)==='bad').length,good.length),mismatch=rate(usable.filter(r=>!r.matched).length,usable.length),faults=(e.units||[]).filter(u=>unitStatus(u)==='FAULT').length,cycle=rows.map(r=>r.cycleMs).filter(Number.isFinite),max=cycle.length?Math.max(...cycle):null;
 const checks=[['漏檢率',miss,criteria?.maxMissRate,bad.length],['誤剔率',falseReject,criteria?.maxFalseRejectRate,good.length],['分類不一致率',mismatch,criteria?.maxMismatchRate,usable.length],['故障率',rate(faults,e.units?.length),criteria?.maxFaultRate,e.units?.length||0],['最慢主機週期',max,criteria?.maxCycleMs,cycle.length]].map(([label,value,limit,n])=>({label,value,limit,n,status:value==null||limit==null?'NEEDS_DATA':value<=limit?'PASS':'FAIL'}));
 const complete=['COMPLETED','COMPLETED_WITH_FAULTS'].includes(e.status)&&rows.every(r=>r.status==='FAULT'||r.completed&&r.actual)&&labelled.length===rows.length&&cycle.length===rows.length&&byId.size===rows.length;
 return {executionId:e.id,baselineId:b.id,partition:b.partition,rows,checks,complete,labelled:labelled.length,total:rows.length,status:checks.some(c=>c.status==='FAIL')?'FAIL':complete&&checks.every(c=>c.status==='PASS')?'PASS':'INCOMPLETE',scope:'固定樣本的觀察結果；不等於產線統計保證。主機週期含保存時才可用於含保存的預算。'};
}
export function compareBaselineExecutions(p,beforeId,afterId){
 const before=assessBaselineExecution(p,beforeId),after=assessBaselineExecution(p,afterId);
 if(!before||!after||before.baselineId!==after.baselineId)throw Error('只能比較同一份固定圖片與答案基準');
 const old=new Map(before.rows.map(r=>[r.unitId,r]));return {before,after,timeRegressed:after.rows.filter(r=>Number.isFinite(r.cycleMs)&&Number.isFinite(old.get(r.unitId)?.cycleMs)&&after.checks[4].limit!=null&&before.checks[4].limit!=null&&r.cycleMs>after.checks[4].limit&&old.get(r.unitId).cycleMs<=before.checks[4].limit).map(r=>r.unitId),improved:after.rows.filter(r=>r.matched&&!old.get(r.unitId)?.matched).map(r=>r.unitId),regressed:after.rows.filter(r=>!r.matched&&old.get(r.unitId)?.matched).map(r=>r.unitId),unresolved:after.rows.filter(r=>!r.matched&&!old.get(r.unitId)?.matched).map(r=>r.unitId)};
}
export function createAcceptanceCase(p,executionId,unitId){
 const e=p.data.datasetExecutions?.find(e=>e.id===executionId),u=e?.units?.find(u=>u.unitId===unitId);if(!u)throw Error('真實執行紀錄不存在');
 const existing=state(p).cases.find(c=>c.executionId===executionId&&c.unitId===unitId);if(existing)return copy(existing);
 const c={id:crypto.randomUUID(),at:now(),executionId,unitId,baselineId:e.baselineId||null,schemeFingerprint:e.schemeFingerprint,record:copy(u),schemeSnapshot:copy(e.schemeSnapshot||(e.schemeFingerprint===schemeFingerprint(scheme(p))?scheme(p):null))};
 edit(p,'acceptance_failure_saved',s=>s.cases.push(c));return copy(c);
}
export function acceptanceContext(p,{baselineId,caseId,offset=0,limit=50}={}){
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>200)throw Error('分頁需要 offset ≥ 0、limit 1–200');
 const s=state(p),b=s.baselines.find(b=>b.id===baselineId),c=s.cases.find(c=>c.id===caseId),exec=(p.data.datasetExecutions||[]).filter(e=>e.baselineId&&(!baselineId||e.baselineId===baselineId));
 return {schema:s.schema,draft:copy(s.draft||{}),agreement:copy(currentAgreement(p)),questions:acceptanceQuestions(p),baselines:s.baselines.map(b=>({id:b.id,title:b.title,partition:b.partition,samples:b.samples.length,labelled:b.samples.filter(u=>u.expected).length,at:b.at})),...(b?{baseline:{...copy(b),samples:b.partition==='acceptance'?undefined:copy(b.samples.slice(offset,offset+limit)),protected:b.partition==='acceptance',offset}}:{}),case:c?copy(c):null,cases:s.cases.slice(offset,offset+limit).map(c=>({id:c.id,executionId:c.executionId,unitId:c.unitId,baselineId:c.baselineId})),executions:exec.slice(-20).map(e=>({id:e.id,baselineId:e.baselineId,schemeFingerprint:e.schemeFingerprint,status:e.status,processed:e.processed,startedAt:e.startedAt})),scope:'保留驗收不是權限沙箱；其他既有圖像工具仍可讀取原圖。已用於調參的圖片不能宣稱盲測。'};
}
export function validateAcceptanceWorkspace(data){
 const s=data.acceptanceWorkspace;if(s===undefined)return;
 const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v),text=v=>typeof v==='string'&&v.trim().length>0;
 if(!s||s.schema!=='agentcv-project-acceptance-1'||!object(s.assignments)||['baselines','cases','agreements'].some(k=>!Array.isArray(s[k])))throw Error('驗收工作區格式錯誤');
 const checkDraft=(d,complete=false)=>{if(!object(d))throw Error('驗收草案格式錯誤');for(const [k]of acceptanceCriteria){const v=d[k];if(!complete&&(v===null||v===undefined))continue;if(!Number.isFinite(v)||v<0||(k==='maxCycleMs'?v===0:v>1))throw Error('驗收門檻格式錯誤：'+k);}for(const k of ['unitDescription','missingPolicy','faultPolicy','source'])if(d[k]!==undefined&&typeof d[k]!=='string'||complete&&!text(d[k]))throw Error('驗收來源或處置說明格式錯誤');};
 if(s.draft)checkDraft(s.draft);
 for(const a of Object.values(s.assignments))if(!object(a)||!['development','acceptance','unassigned'].includes(a.partition)||typeof a.group!=='string'||typeof a.condition!=='string')throw Error('基準圖片分組格式錯誤');
 const agreements=new Set();for(const a of s.agreements){if(!text(a.id)||agreements.has(a.id)||a.actor!=='human'||!object(a.contract)||!Number.isFinite(Date.parse(a.at)))throw Error('人工驗收確認紀錄格式錯誤');agreements.add(a.id);checkDraft(a.criteria,true);}
 const baselines=new Set();for(const b of s.baselines){
  if(!text(b.id)||baselines.has(b.id)||!['development','acceptance'].includes(b.partition)||!Array.isArray(b.samples)||!b.samples.length||!object(b.contract)||!Array.isArray(b.referenceIdentities))throw Error('固定基準格式錯誤');baselines.add(b.id);
  const ids=new Set();for(const u of b.samples){if(!text(u.id)||ids.has(u.id)||!Array.isArray(u.imageIds)||!u.imageIds.length||!Array.isArray(u.identities)||u.identities.length!==u.imageIds.length||u.identities.some(i=>!u.imageIds.includes(i.imageId)||!text(i.sha256)))throw Error('固定基準工件身份格式錯誤');ids.add(u.id);if(u.expected&&(u.expected.provenance?.type!=='human'||u.expected.provenance?.status!=='confirmed'||!text(u.expected.provenance?.ref)||u.expected.categoryIds?.length!==1))throw Error('固定基準答案缺少人工來源');}
 }
 for(const c of s.cases)if(!text(c.id)||!text(c.executionId)||!text(c.unitId)||!object(c.record))throw Error('失敗案例缺少真實執行引用');
}
export const projectAcceptanceMethods={acceptanceContext(options){return acceptanceContext(this,options);},proposeAcceptance(draft){return proposeAcceptance(this,draft);},confirmAcceptance(){return confirmAcceptance(this);},assignAcceptanceSample(id,a){return assignAcceptanceSample(this,id,a);},assignAcceptanceSamples(a){return assignAcceptanceSamples(this,a);},freezeAcceptanceBaseline(a){return freezeAcceptanceBaseline(this,a);},baselineRunOptions(id,a){return baselineRunOptions(this,id,a);},createAcceptanceCase(e,u){return createAcceptanceCase(this,e,u);}};
