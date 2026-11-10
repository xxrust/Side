import {schemeFingerprint,compileScheme} from './purpose-compiler.js';
import {compileClassificationSpec} from './classification-spec.js';
import {timingRequirementIssues} from './inspection-timing.js';
import {inspectionCardContext} from './canvas-inspection-cards.js';
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const list=x=>Array.isArray(x)?x:[];
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const fields=['execution.timingRequirement','classificationSpec'];
const valueFingerprint=value=>{const copy=clone(value);if(copy&&typeof copy==='object')delete copy.provenance;return stable(copy);};
const fieldValue=(scheme,path)=>path==='execution.timingRequirement'?scheme?.execution?.timingRequirement:scheme?.classificationSpec;
const answerKey=(boardId,cardId,a)=>'canvas-answer:'+JSON.stringify([boardId,cardId,a.questionId,a.at]);
const domain=q=>q?.questionPath?.startsWith('execution.timingRequirement')||q?.path?.startsWith('execution.timingRequirement')||q?.questionId?.startsWith('TIMING_')||q?.id?.startsWith('TIMING_')?'execution.timingRequirement':q?.questionPath?.startsWith('classificationSpec')||q?.path?.startsWith('classificationSpec')||q?.questionId?.startsWith('CLASSIFICATION_')||q?.id?.startsWith('CLASSIFICATION_')?'classificationSpec':null;
function validField(scheme,path){return path==='execution.timingRequirement'?!!scheme?.execution?.timingRequirement&&!timingRequirementIssues(scheme.execution.timingRequirement).length:compileClassificationSpec(scheme?.classificationSpec).ok;}
function findCard(project,boardId,cardId){const board=list(project.data.visualInquiry?.boards).find(b=>b.id===boardId),card=list(board?.projectSpaces?.cards).find(c=>c.id===cardId&&c.kind==='consultation');if(!card||!board.projectSpaces.sources.some(s=>s.id===card.sourceId))throw Error('待諮詢卡或其圖像源不存在；請重新讀取畫板');return {board,card};}
export function readCanvasConsultations(project,{boardId,cardId,sourceId}={}){
 const scheme=project.purposeScheme||project.data.purposeScheme,basis=schemeFingerprint(scheme),applications=list(project.data.canvasConsultationApplications),cards=[];
 for(const board of list(project.data.visualInquiry?.boards)){if(boardId&&board.id!==boardId)continue;for(const card of list(board.projectSpaces?.cards)){if(card.kind!=='consultation'||cardId&&card.id!==cardId||sourceId&&card.sourceId!==sourceId)continue;
  const context=inspectionCardContext(project,card.sourceId),answers=list(card.answerHistory),ids=[...new Set([...context.questions.map(q=>q.id),...answers.map(a=>a.questionId)])];
  cards.push({boardId:board.id,cardId:card.id,sourceId:card.sourceId,sourceName:context.sourceName,rebindTool:'rebind_canvas_card',applicable:context.applicable!==false,bindingMessage:context.bindingMessage||null,questions:ids.map(id=>{const question=context.questions.find(q=>q.id===id),answer=answers.findLast(a=>a.questionId===id),receipt=applications.findLast(a=>a.boardId===board.id&&a.cardId===card.id&&a.questionId===id&&a.answerAt===answer?.at),field=domain(question||answer),matches=receipt&&receipt.schemeId===scheme?.id&&receipt.answer===answer?.answer&&fields.includes(receipt.field)&&valueFingerprint(fieldValue(scheme,receipt.field))===receipt.valueFingerprint&&validField(scheme,receipt.field),status=context.applicable===false?'SOURCE_REBIND_REQUIRED':!answer?'WAITING_FOR_HUMAN':matches?'APPLIED':receipt?'RECHECK_REQUIRED':question?'ANSWERED_PENDING':'SPEC_UPDATED_UNLINKED';return {id,question:question?.question||answer?.questionText||'已回答的規格問題',path:question?.path||answer?.questionPath||field,code:question?.code||id.split(':')[0],stillAsked:!!question,status,answer:clone(answer),answerRef:answer?answerKey(board.id,card.id,answer):null,application:clone(receipt),currentValue:field?clone(fieldValue(scheme,field)):null,interpretationHumanReviewed:false};})});
 }}
 if(boardId&&!project.data.visualInquiry?.boards?.some(b=>b.id===boardId))throw Error('指定畫板不存在');if(cardId&&!cards.length)throw Error('指定待諮詢卡不存在');
 return {schema:'agentcv-canvas-consultations-1',schemeId:scheme?.id||null,schemeFingerprint:basis,cards,pendingCount:cards.flatMap(c=>c.questions).filter(q=>q.answer&&q.status!=='APPLIED').length,scope:'APPLIED 僅表示此人類回答已有規格寫入回執、當前欄位仍一致且通過結構檢查；不代表解讀已經人類複核或算法驗收通過。'};
}
export function applyCanvasConsultation(project,{boardId,cardId,questionId,answerAt,expectedSchemeFingerprint,patch,reason}={}){
 const {card}=findCard(project,boardId,cardId),answer=list(card.answerHistory).findLast(a=>a.questionId===questionId),scheme=project.purposeScheme;
 if(!answer||answer.author!=='human'||answer.at!==answerAt)throw Error('人類回答不存在或已被更新；請重新 get_canvas_consultations');
 if(!scheme||expectedSchemeFingerprint!==schemeFingerprint(scheme))throw Error('方案已變更；請重新讀取規格與人類回答後核對');
 if(typeof reason!=='string'||!reason.trim()||reason.length>8000)throw Error('請簡要說明如何將這份人類回答轉成具體規格');
 const inspection=inspectionCardContext(project,card.sourceId);if(inspection.applicable===false)throw Error('這張諮詢卡綁定固定參考或無效圖像源；請先 rebind_canvas_card 重新綁定待檢圖像源，再採用回答');
 const question=inspection.questions.find(q=>q.id===questionId),field=domain(question||answer),keys=patch&&typeof patch==='object'&&!Array.isArray(patch)?Object.keys(patch):[];
 if(!field||keys.length!==1||keys[0]!==field||!patch[field]||typeof patch[field]!=='object'||Array.isArray(patch[field]))throw Error('本回答只可更新對應的完整規格欄位：execution.timingRequirement 或 classificationSpec；不得改程式與其他規格');
 const candidate=clone(scheme),value=clone(patch[field]),ref=answerKey(boardId,cardId,answer),provenance={type:'human',status:'confirmed',ref};
 if(field==='execution.timingRequirement'){value.provenance=provenance;candidate.execution={...candidate.execution,timingRequirement:value};}
 else{value.provenance=[...list(value.provenance).filter(p=>p.ref!==ref),provenance];candidate.classificationSpec=value;}
 const validation=field==='execution.timingRequirement'?timingRequirementIssues(candidate.execution.timingRequirement):compileClassificationSpec(candidate.classificationSpec).errors;
 if(!validField(candidate,field)||validation.length){const error=Error('回答尚未轉成完整有效的規格；請依錯誤修正後重試');error.code='CONSULTATION_PATCH_INVALID';error.errors=validation;throw error;}
 const withoutProvenance=value=>{const copy=clone(value);if(copy&&typeof copy==='object')delete copy.provenance;return stable(copy);};
 const conflicting=list(project.data.canvasConsultationApplications).find(a=>a.schemeId===scheme.id&&a.sourceId!==card.sourceId&&a.field===field&&a.valueFingerprint===valueFingerprint(fieldValue(scheme,field))&&withoutProvenance(a.value)!==withoutProvenance(fieldValue(candidate,field)));
 if(conflicting){const error=Error('此規格由多個圖像源共用；新解讀會覆蓋另一圖像源已採用的要求，請先向人類確認共用標準或拆分方案');error.code='CONSULTATION_SOURCE_CONFLICT';error.details={sourceId:card.sourceId,conflictingSourceId:conflicting.sourceId,applicationId:conflicting.id,field};throw error;}
 const candidateContext=inspectionCardContext({data:{...project.data,purposeScheme:candidate}},card.sourceId);
 if(candidateContext.questions.some(q=>q.id===questionId))throw Error('更新後原問題仍然存在，不能登記為已處理');
 const preflight=compileScheme(candidate,{mode:'scheme',policy:'strict'}),before=schemeFingerprint(scheme);
 const compilation=project.setPurposeScheme(candidate);
 const application={schema:'agentcv-consultation-application-1',id:crypto.randomUUID(),boardId,cardId,sourceId:card.sourceId,questionId,answerAt,answer:answer.answer,answerSourceId:answer.sourceId,answerRef:ref,schemeId:candidate.id,beforeSchemeFingerprint:before,afterSchemeFingerprint:schemeFingerprint(project.purposeScheme),field,value:clone(fieldValue(project.purposeScheme,field)),valueFingerprint:valueFingerprint(fieldValue(project.purposeScheme,field)),reason:reason.trim(),actor:'agent',at:new Date().toISOString(),fieldValidation:'PASS',schemeCompilation:compilation.ok?'PASS':'INCOMPLETE',remainingErrors:clone(preflight.errors||[]),interpretationHumanReviewed:false};
 (project.data.canvasConsultationApplications??=[]).push(application);project.event('canvas_consultation_applied',{applicationId:application.id,boardId,cardId,questionId,answerAt,sourceId:card.sourceId,schemeCompilation:application.schemeCompilation});
 return {application:clone(application),compilation,consultations:readCanvasConsultations(project,{boardId,cardId}),requiresRegression:true,scope:'已保存規格及可核對回執；既有結果需按新方案重新核對，尚未宣稱人類複核、性能達標或發布。'};
}
export const canvasConsultationMethods={readCanvasConsultations(options){return readCanvasConsultations(this,options)},applyCanvasConsultation(input){return applyCanvasConsultation(this,input)}};

export function validateCanvasConsultationApplications(data){
 const entries=data.canvasConsultationApplications;if(entries===undefined)return;
 if(!Array.isArray(entries))throw Error('諮詢規格採用回執必須是陣列');
 const seen=new Set();for(const r of entries){
  if(!r||typeof r!=='object'||Array.isArray(r)||r.schema!=='agentcv-consultation-application-1'||r.actor!=='agent'||r.interpretationHumanReviewed!==false||r.fieldValidation!=='PASS'||!['PASS','INCOMPLETE'].includes(r.schemeCompilation)||!fields.includes(r.field))throw Error('諮詢規格採用回執格式無效');
  for(const k of ['id','boardId','cardId','sourceId','questionId','answerAt','answer','answerRef','schemeId','beforeSchemeFingerprint','afterSchemeFingerprint','reason','at'])if(typeof r[k]!=='string'||!r[k].trim())throw Error('諮詢規格採用回執缺少 '+k);
  if(seen.has(r.id)||!Number.isFinite(Date.parse(r.at))||!Number.isFinite(Date.parse(r.answerAt))||r.answer.length>20000||r.reason.length>8000||r.answerRef!==answerKey(r.boardId,r.cardId,{questionId:r.questionId,at:r.answerAt})||r.valueFingerprint!==valueFingerprint(r.value)||!Array.isArray(r.remainingErrors))throw Error('諮詢規格採用回執的身份、值或來源不一致');seen.add(r.id);
 }
}
