// One serializable feedback envelope for the panel and Pi wire. Never lose
// compilation diagnostics stored in error.audit instead of error.errors.
export function platformFailure(error){
 const audit=error?.audit,errors=Array.isArray(error?.errors)?error.errors:Array.isArray(audit?.errors)?audit.errors:[];
 const code=error?.code||'TOOL_FAILED';
 const retryable=!!(error?.retryable||errors.length||/^(SCHEME_|ALGORITHM_|PRESENTATION_)/.test(code)||['PIPELINE_EVIDENCE_PROPOSAL_REJECTED','PIPELINE_EVIDENCE_DELIVERY_REJECTED'].includes(code));
 return {schema:'agentcv-platform-feedback-1',ok:false,error:error?.message||String(error),code,
  ...(errors.length?{errors:errors.map(e=>({...e,hint:e.hint||'依 path 修正候選方案，再呼叫 validate_purpose_scheme 核對。'}))}:{}),
  ...(Array.isArray(audit?.questions)?{questions:audit.questions}:{}),...(Array.isArray(audit?.warnings)?{warnings:audit.warnings}:{}),
  ...(error?.details?{details:error.details}:{}),
  ...(retryable?{retryable:true,next:code==='AGENT_INPUT_CHANGED'?'依 changes 的 category/path 重新讀取相關狀態；核對意圖後重算，不必重開對話。':code.startsWith('SCHEME_')?'讀取 errors 的 code/path/hint，修正完整候選方案後 validate_purpose_scheme；通過再保存和實算。':'依 errors 的 code/path/hint 修正工具參數、產物引用或三項依據，再重試。'}:{})};
}
