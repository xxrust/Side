// Summarise recorded searches without rerunning a detector or inventing rejected measurements.
const finite=Number.isFinite;
const copy=x=>x===undefined?null:JSON.parse(JSON.stringify(x));
const reasons={INSIDE_TAUGHT_BOUNDARY:'位於示教邊界內側',OUTSIDE_TAUGHT_BOUNDARY:'位於示教邊界外側',OPPOSITE_GRADIENT_POLARITY:'梯度極性不符',AUTO_POLARITY_UNRESOLVED:'自動極性未確定',OUTSIDE_CONFIRMED_SEARCH_RANGE:'超出原搜尋帶',WEAK_RELATIVE_CONTRAST:'相對對比不足',CANDIDATE_INDEX_OUT_OF_RANGE:'指定候選序號不存在',NOT_SELECTED_BY_EXPLICIT_RULE:'未被指定選序採用'};
export const edgeRejectionLabel=code=>reasons[code]||code||'未記錄原因';
export function edgeDiagnostics(edge,{locationStatus,ready=true}={}){
 const attempts=edge?.attempts||[],assessment=edge?.parameter_assessment,counts=attempts.map(a=>a.candidate_count).filter(finite),maxCandidates=counts.length?Math.max(...counts):edge?.candidate_pool?.length??edge?.candidates?.length??null;
 const rejects=new Map();for(const a of attempts)for(const r of a.intent_selection?.rejected||[]){const key=r.reason||'UNRECORDED';rejects.set(key,(rejects.get(key)||0)+1)}
 const rejections=[...rejects].map(([code,count])=>({code,label:edgeRejectionLabel(code),count}));
 const intentRejected=attempts.map(a=>a.intent_rejected_count).filter(finite).reduce((a,b)=>a+b,0);
 const hypotheses=attempts.map(a=>a.diagnostics?.hypothesis_count).filter(finite),knownQualities=counts.length===attempts.length&&attempts.length>0;
 let code,label;
 if(!ready){code='STALE';label='結果已失效'}
 else if(edge?.status==='FOUND'){code='FOUND';label='已採用'}
 else if(locationStatus&&locationStatus!=='LOCATED'){code='LOCATION_BLOCKED';label='尚未可靠定位'}
 else if(!edge){code='NOT_RUN';label='尚未搜尋'}
 else if(assessment?.status==='DISAGREEMENT'){code='PARAMETER_DISAGREEMENT';label='跨參數線位不一致'}
 else if(assessment?.status==='NO_COMMON_SPAN'){code='NO_COMMON_SPAN';label='缺少共同支持跨度'}
 else if(assessment?.status==='AMBIGUOUS'||attempts.some(a=>a.ambiguous)){code='AMBIGUOUS';label='多條候選尚未選定'}
 else if(intentRejected>0&&knownQualities&&counts.every((n,i)=>n===(attempts[i].intent_rejected_count??0))){code='INTENT_REJECTED';label='候選被選邊條件排除'}
 else if(knownQualities&&counts.every(n=>n===0)){
  code=hypotheses.length===attempts.length&&hypotheses.every(n=>n===0)?'NO_HYPOTHESIS':'QUALITY_REJECTED';
  label=code==='NO_HYPOTHESIS'?'未建立直線假設':'沒有候選通過品質條件';
 }else {code='INCOMPLETE';label=edge.status==='UNKNOWN'?'搜尋尚無可採用結果':'尚未搜尋'}
 const trialIndex=assessment?.chosenTrialIndex??assessment?.referenceTrialIndex??attempts.findIndex(a=>(a.candidate_pool||a.candidates||[]).length),trial=attempts[trialIndex],pool=edge?.candidate_pool?.length?edge.candidate_pool:trial?.candidate_pool||trial?.candidates||edge?.candidates||[];
 const selected=edge?.selected,geometry=selected?.geometry;
 const candidates=pool.map(c=>{const rejection=trial?.intent_selection?.rejected?.find(r=>r.candidate?.id===c.id);return {id:c.id,geometry:copy(c.geometry),coverage:finite(c.coverage)?c.coverage:null,rms:finite(c.geometry?.rms_px)?c.geometry.rms_px:null,continuity:finite(c.quality?.continuity)?c.quality.continuity:null,selected:!!geometry&&c.id===selected.id,rejectionCode:rejection?.reason||null,rejection:rejection?edgeRejectionLabel(rejection.reason):null}});
 return {code,label,reason:edge?.reason||'',testedCount:attempts.length,maxCandidates,intentRejected,rejections,candidates,displayTrialIndex:trialIndex>=0?trialIndex:null,adopted:edge?.status==='FOUND',spread:finite(assessment?.maxNormalSpreadPx)?assessment.maxNormalSpreadPx:null,spreadThreshold:finite(assessment?.agreementTolerancePx)?assessment.agreementTolerancePx:null,trialRows:attempts.map((a,index)=>({index,profileWidth:a.profileWidth,tangentTrim:a.tangentTrim,qualityPassing:finite(a.candidate_count)?a.candidate_count:null,eligible:finite(a.eligible_count)?a.eligible_count:null,rejected:finite(a.intent_rejected_count)?a.intent_rejected_count:null,reason:a.reason||'',status:a.status,ambiguous:!!a.ambiguous,selected:!!a.selected,rejections:(a.intent_selection?.rejected||[]).map(r=>({id:r.candidate?.id||null,code:r.reason,label:edgeRejectionLabel(r.reason)}))})),missingRejectedQualityValues:code==='QUALITY_REJECTED'};
}
