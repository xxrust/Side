import {compileScheme,schemeFingerprint} from './purpose-compiler.js';
// Context validation supplements, never replaces, the shared structural and
// semantic compiler. It uses metadata; it cannot assert algorithm accuracy.
export function validateProjectScheme(project,scheme,{mode='scheme'}={}){
 const compilation=compileScheme(scheme,{mode,policy:'strict'});
 const errors=[...(compilation.errors||[])];
 if(mode!=='draft'&&scheme?.execution?.unit==='workpiece'){
  const references=scheme.execution.referenceInputs;
  if(references&&typeof references==='object'&&!Array.isArray(references))for(const [slot,id]of Object.entries(references)){
   if(typeof id==='string'&&!project.data.images.some(image=>image.id===id))errors.push({code:'REFERENCE_IMAGE_UNAVAILABLE',path:`execution.referenceInputs.${slot}`,message:'固定參考圖像不存在於目前專案。',hint:'用 get_dataset_images 取得真實 image id，或先從面板導入參考圖。'});
  }
 }
 const questions=[...(compilation.questions||[])];for(const e of errors)if(!questions.some(q=>q.code===e.code&&q.path===e.path))questions.push({id:`${e.code}:${e.path}`,code:e.code,path:e.path,question:e.message});
 return {...compilation,ok:errors.length===0,errors,questions,schemeFingerprint:schemeFingerprint(scheme),validationScope:'結構、引用與明示規則檢查；不證明算法精度或效能。'};
}
export function parseSchemeProposal(json){
 let value;
 try{value=JSON.parse(json);}catch{const error=Error('方案不是有效 JSON。');error.code='SCHEME_JSON_INVALID';error.errors=[{code:error.code,path:'scheme_json',message:error.message,hint:'修正 JSON 語法後重新 validate_purpose_scheme；不修改目前方案。'}];throw error;}
 const patch=value&&typeof value==='object'&&Object.hasOwn(value,'$patch');
 if(!value||typeof value!=='object'||Array.isArray(value)||patch){
  const error=Error(patch?'此接口需要完整方案，不支援 $patch 差量封包。':'方案必須是完整 JSON 物件。');
  error.code=patch?'SCHEME_PATCH_UNSUPPORTED':'SCHEME_DOCUMENT_REQUIRED';error.errors=[{code:error.code,path:patch?'scheme_json.$patch':'scheme_json',message:error.message,hint:'先 get_purpose_scheme，在取得的完整 scheme 物件修改目標欄位；完整候選交 validate_purpose_scheme，再 set_purpose_scheme。尚未修改目前方案。'}];throw error;
 }
 return value;
}
