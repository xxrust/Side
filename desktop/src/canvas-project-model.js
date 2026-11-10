import {jsonSnapshot} from './json-snapshot.js';
import {activeWorkpieceExecution} from './workpiece-live-state.js';
import {sourceExecutionNavigationMethods} from './source-execution-navigation.js';
// Agent and UI share this facade. Spaces reference project originals; they never
// create pixels, infer inspection answers, or change an algorithm plan.
import {schemeFingerprint} from './purpose-compiler.js';
import {compileClassificationSpec} from './classification-spec.js';
import {inspectionCardContext} from './canvas-inspection-cards.js';
import {structuredLayerMethods,prepareStructuredLayerViews} from './structured-result-layers.js';
import {createInquiryState,prepareInquiry} from './visual-inquiry-model.js';
const clone=jsonSnapshot,uid=()=>crypto.randomUUID();
const fail=s=>{throw Error(s)},record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fields=(v,allowed)=>{if(!record(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail('專案畫板包含未知欄位')};
function text(v,label,max=240){if(typeof v!=='string'||v.length>max)fail(`${label}文字格式錯誤`);return v}
function id(v){if(typeof v!=='string'||!v.trim()||v.length>200||/[\u0000-\u001f]/.test(v))fail('專案畫板識別無效');return v}
function ids(v,known,label){if(!Array.isArray(v)||v.length>100000||new Set(v).size!==v.length)fail(`${label}清單無效或重複`);for(const entry of v)if(!known.has(id(entry)))fail(`${label}引用不存在的原件：${entry}`)}
function geometry(v){for(const k of ['x','y','width','height'])if(!Number.isFinite(v[k])||Math.abs(v[k])>1000000||(['width','height'].includes(k)&&v[k]<80))fail('專案畫板位置或大小無效')}
function catalogs(data){return {images:new Set((data.images||[]).map(i=>i.id)),references:new Set((data.workflow?.references||[]).map(r=>r.id)),profiles:new Set((data.workflow?.profiles||[]).map(r=>r.id))}}
export function prepareProjectCanvases(data){
 prepareStructuredLayerViews(data);const known=catalogs(data);
 for(const board of data.visualInquiry?.boards||[]){if(board.projectSpaces===undefined)continue;const p=board.projectSpaces;fields(p,['sources','references','relations','cards']);if(p.cards!==undefined&&(!Array.isArray(p.cards)||p.cards.length>256))fail('畫板規格卡清單無效');for(const key of ['sources','references','relations'])if(!Array.isArray(p[key])||p[key].length>256)fail('專案畫板空間清單無效');const unique=new Set(),sources=new Map(),references=new Set();
  const take=v=>{id(v);if(unique.has(v))fail('專案畫板物件識別重複');unique.add(v)};
  for(const s of p.sources){fields(s,['id','title','imageIds','x','y','width','height','profileId','selectedImageId','autoAdvance']);take(s.id);if(s.autoAdvance!==undefined&&typeof s.autoAdvance!=='boolean')fail('圖像源自動切換設定無效');text(s.title,'圖像源名稱');geometry(s);ids(s.imageIds,known.images,'圖像源');if(s.profileId!==undefined&&!known.profiles.has(id(s.profileId)))fail('圖像源引用不存在的成像配置');if(s.selectedImageId!==undefined&&s.selectedImageId!==null&&!s.imageIds.includes(s.selectedImageId))fail('預覽圖片不屬於此圖像源');sources.set(s.id,s)}
  for(const r of p.references){fields(r,['id','title','referenceIds','text','x','y','width','height']);take(r.id);text(r.title,'資料空間名稱');text(r.text,'資料文字',20000);geometry(r);ids(r.referenceIds,known.references,'參考資料');references.add(r.id)}
  for(const c of p.cards||[]){fields(c,['id','kind','sourceId','title','x','y','width','height','answerHistory']);take(c.id);if(!['classification','consultation','statistics'].includes(c.kind)||!sources.has(c.sourceId))fail('畫板規格卡必須引用真實圖像源');text(c.title,'卡片名稱');geometry(c);if(c.answerHistory!==undefined){if(!Array.isArray(c.answerHistory)||c.answerHistory.length>1000)fail('諮詢回答歷史無效');for(const a of c.answerHistory){fields(a,['questionId','answer','author','at','sourceId','questionText','questionPath']);id(a.questionId);if(a.questionText!==undefined)text(a.questionText,'問題文字',20000);if(a.questionPath!==undefined)text(a.questionPath,'規格路徑',2000);text(a.answer,'人類回答',20000);if(a.author!=='human'||!sources.has(a.sourceId)||!Number.isFinite(Date.parse(a.at)))fail('諮詢回答必須保留人類來源與時間')}}}
  for(const r of p.relations){fields(r,['id','fromSpaceId','toSpaceId','predicate','description','imageIds']);take(r.id);if(r.predicate!=='reference_for'||!references.has(r.fromSpaceId)||!sources.has(r.toSpaceId))fail('資料適用關係必須從參考空間連到真實圖像源');text(r.description,'關係說明',20000);if(r.imageIds!==undefined)ids(r.imageIds,new Set(sources.get(r.toSpaceId).imageIds),'適用圖片')}
 }
 return data;
}
function state(project){return clone(project.data.visualInquiry||createInquiryState())}
function boardOf(next,boardId){const b=next.boards.find(b=>b.id===boardId);if(!b?.projectSpaces)fail('專案畫板不存在');return b}
function commit(project,next,action,detail={},after=()=>{}){prepareInquiry({visualInquiry:next});prepareProjectCanvases({...project.data,visualInquiry:next});project.mutate(action,()=>{project.data.visualInquiry=next;after()},detail)}
function space(input,kind,index){fields(input,kind==='source'?['id','title','imageIds','profileId','selectedImageId','autoAdvance','x','y','width','height']:['id','title','referenceIds','text','x','y','width','height']);return {id:input.id||uid(),title:input.title??(kind==='source'?'圖像源':'參考資料'),x:input.x??(kind==='source'?40:650),y:input.y??(40+index*(kind==='source'?540:420)),width:input.width??500,height:input.height??(kind==='source'?460:340),...(kind==='source'?{imageIds:clone(input.imageIds||[]),...(input.profileId!==undefined?{profileId:input.profileId}:{}),selectedImageId:input.selectedImageId??input.imageIds?.[0]??null,...(input.autoAdvance!==undefined?{autoAdvance:input.autoAdvance}:{})}:{referenceIds:clone(input.referenceIds||[]),text:input.text??''})}}
export const canvasProjectMethods={
 ...sourceExecutionNavigationMethods,
 ...structuredLayerMethods,
 syncCanvasConsultations(){
  if(this.data.purposeScheme?.execution?.unit!=='workpiece')return [];
  this.ensureProjectCanvas();const next=state(this),created=[];
  for(const board of next.boards){const spaces=board.projectSpaces;if(!spaces)continue;
   for(const source of spaces.sources){if(!inspectionCardContext(this,source.id).questions.length||(spaces.cards||[]).some(c=>c.kind==='consultation'&&c.sourceId===source.id))continue;
    const obstacles=[...spaces.sources,...spaces.references,...(spaces.cards||[]),...board.items],x=source.x+source.width+40;let y=source.y;
    for(let n=0;n<=obstacles.length;n++){const hits=obstacles.filter(o=>x<o.x+o.width+30&&x+440+30>o.x&&y<o.y+o.height+30&&y+300+30>o.y);if(!hits.length)break;y=Math.max(...hits.map(o=>o.y+o.height))+40;}
    const card={id:uid(),kind:'consultation',sourceId:source.id,title:'？ Agent 需要你的確認',x,y,width:440,height:300,answerHistory:[]};(spaces.cards??=[]).push(card);board.revision++;created.push({boardId:board.id,cardId:card.id,sourceId:source.id});
   }
  }
  if(created.length)commit(this,next,'classification_consultations_created',{cards:created});return created;
 },
 canvasInspectionContext(sourceId){return clone(inspectionCardContext(this,sourceId))},
 ensureProjectCanvas(){const existing=this.data.visualInquiry?.boards.find(b=>b.projectSpaces);if(existing){prepareProjectCanvases(this.data);return clone(existing)}const next=state(this),source=space({imageIds:(this.data.images||[]).map(i=>i.id)},'source',0),reference=space({referenceIds:(this.data.workflow?.references||[]).map(r=>r.id)},'reference',0),board={id:uid(),title:'專案畫板',author:'human',revision:1,createdAt:new Date().toISOString(),items:[],projectSpaces:{sources:[source],references:[reference],relations:[{id:uid(),fromSpaceId:reference.id,toSpaceId:source.id,predicate:'reference_for',description:'為此圖像源提供參考資料'}]}};next.boards.push(board);next.activeBoardId=board.id;commit(this,next,'project_canvas_created',{boardId:board.id});return clone(board)},
 canvasProjectContext(boardId,{offset=0,limit=50}={}){prepareProjectCanvases(this.data);const board=this.data.visualInquiry.boards.find(b=>b.id===boardId);if(!board?.projectSpaces)fail('專案畫板不存在');const metadata=image=>{const {dataURL,dataUrl,pixels,objects,result,...value}=image;return clone(value)};return {boardId:board.id,sources:board.projectSpaces.sources.map(s=>({...clone(s),imageCount:s.imageIds.length,images:s.imageIds.slice(Math.max(0,offset),Math.max(0,offset)+Math.min(50,Math.max(1,limit))).map(id=>metadata(this.imageRecord?.(id)||this.data.images.find(i=>i.id===id))),selectedImage:s.selectedImageId?metadata(this.imageRecord?.(s.selectedImageId)||this.data.images.find(i=>i.id===s.selectedImageId)):null,profile:s.profileId?clone(this.data.workflow.profiles.find(p=>p.id===s.profileId)):null})),references:board.projectSpaces.references.map(s=>({...clone(s),records:s.referenceIds.map(id=>clone(this.data.workflow.references.find(r=>r.id===id)))})),relations:clone(board.projectSpaces.relations),cards:clone(board.projectSpaces.cards||[])}},
 addCanvasCard(boardId,input){if(!inspectionCardContext(this,input.sourceId).applicable)fail('固定參考圖像源不產生工件分類或統計；請選待檢圖像源');fields(input,['id','kind','sourceId','title','x','y','width','height']);const next=state(this),board=boardOf(next,boardId),card={id:input.id||uid(),kind:input.kind,sourceId:input.sourceId,title:input.title||({classification:'分類與判定規格',consultation:'待諮詢',statistics:'實算統計'})[input.kind],x:input.x??1220,y:input.y??40,width:input.width??(input.kind==='statistics'?760:440),height:input.height??300,answerHistory:[]};(board.projectSpaces.cards??=[]).push(card);board.revision++;commit(this,next,'canvas_card_added',{boardId,cardId:card.id,sourceId:card.sourceId});return clone(card)},
 rebindCanvasCard(boardId,cardId,sourceId){
  const next=state(this),board=boardOf(next,boardId),card=board.projectSpaces.cards?.find(c=>c.id===cardId);
  if(!card)fail('畫板規格卡不存在');const target=board.projectSpaces.sources.find(s=>s.id===sourceId);
  if(!target||!inspectionCardContext(this,sourceId).applicable)fail('請選擇此畫板的待檢圖像源；固定參考不能作為統計對象');
  const previousSourceId=card.sourceId;if(previousSourceId===sourceId)return clone(card);
  card.sourceId=sourceId;board.revision++;
  commit(this,next,'canvas_card_rebound',{boardId,cardId,previousSourceId,sourceId,answerHistoryPreserved:true});return clone(card);
 },
 setCanvasClassificationSpec(boardId,cardId,{spec,expectedSchemeFingerprint,reason}){
  const card=this.data.visualInquiry?.boards.find(b=>b.id===boardId)?.projectSpaces?.cards?.find(c=>c.id===cardId&&c.kind==='classification');
  if(!card||!inspectionCardContext(this,card.sourceId).applicable)fail('請先將分類卡連到待檢圖像源');
  if(!this.purposeScheme||expectedSchemeFingerprint!==schemeFingerprint(this.purposeScheme))fail('方案已變更，請重新開啟規格再修改');
  if(typeof reason!=='string'||!reason.trim())fail('請填寫本次規格修改依據');
  const value=clone(spec),checked=compileClassificationSpec(value);if(!checked.ok){const error=Error('分類規格無法編譯：'+checked.errors.map(e=>e.message).join('；'));error.errors=checked.errors;throw error;}
  value.provenance=[...(value.provenance||[]),{type:'human',status:'confirmed',ref:reason.trim()}];
  const next=clone(this.purposeScheme);next.classificationSpec=value;const compilation=this.setPurposeScheme(next);
  this.event('canvas_classification_updated',{boardId,cardId,sourceId:card.sourceId,requiresRegression:true});return {compilation,requiresRegression:true};
 },
 updateCanvasCard(boardId,cardId,patch){fields(patch,['title','x','y','width','height']);const next=state(this),board=boardOf(next,boardId),card=board.projectSpaces.cards?.find(c=>c.id===cardId);if(!card)fail('畫板規格卡不存在');Object.assign(card,clone(patch));board.revision++;commit(this,next,'canvas_card_updated',{boardId,cardId});return clone(card)},
 answerCanvasQuestion(boardId,cardId,{questionId,answer}){const next=state(this),board=boardOf(next,boardId),card=board.projectSpaces.cards?.find(c=>c.id===cardId);if(!card||card.kind!=='consultation')fail('待諮詢卡不存在');id(questionId);const question=inspectionCardContext(this,card.sourceId).questions.find(q=>q.id===questionId);if(!question)fail('問題已不存在或不屬於目前規格，請重新讀取待諮詢項目');text(answer,'人類回答',20000);if(!answer.trim())fail('回答不能為空');const value={questionId,questionText:question.question,questionPath:question.path,answer,author:'human',at:new Date().toISOString(),sourceId:card.sourceId};(card.answerHistory??=[]).push(value);board.revision++;commit(this,next,'canvas_question_answered',{boardId,cardId,questionId,sourceId:card.sourceId});return clone(value)},

 addCanvasSource(boardId,input={}){const next=state(this),board=boardOf(next,boardId),value=space(input,'source',board.projectSpaces.sources.length);board.projectSpaces.sources.push(value);board.revision++;commit(this,next,'canvas_source_added',{boardId,spaceId:value.id});return clone(value)},
 addCanvasReferenceSpace(boardId,input={}){const next=state(this),board=boardOf(next,boardId),value=space(input,'reference',board.projectSpaces.references.length);board.projectSpaces.references.push(value);board.revision++;commit(this,next,'canvas_reference_space_added',{boardId,spaceId:value.id});return clone(value)},
 updateCanvasSpace(boardId,spaceId,patch){const next=state(this),board=boardOf(next,boardId),source=board.projectSpaces.sources.find(s=>s.id===spaceId),card=board.projectSpaces.cards?.find(c=>c.id===spaceId),value=source||card||board.projectSpaces.references.find(r=>r.id===spaceId);if(!value)fail('專案畫板空間不存在');fields(patch,source?['title','x','y','width','height','profileId','selectedImageId','autoAdvance']:card?['title','x','y','width','height']:['title','text','x','y','width','height']);Object.assign(value,clone(patch));board.revision++;commit(this,next,'canvas_space_updated',{boardId,spaceId});return clone(value)},
 removeCanvasSourceImages(boardId,sourceId,imageIds){
  if(activeWorkpieceExecution(this))fail('檢測執行中，請完成或停止後再移除來源圖片');
  const next=state(this),board=boardOf(next,boardId),source=board.projectSpaces.sources.find(s=>s.id===sourceId);if(!source)fail('圖像源不存在');
  ids(imageIds,new Set(source.imageIds),'移除圖片');const removed=new Set(imageIds);if(!removed.size)return null;
  const receipt={boardId,sourceId,before:clone(source.imageIds),selectedBefore:source.selectedImageId,activeBefore:this.data.activeId,relations:board.projectSpaces.relations.filter(r=>r.toSpaceId===sourceId&&r.imageIds!==undefined).map(r=>({id:r.id,before:clone(r.imageIds),after:r.imageIds.filter(id=>!removed.has(id))}))};
  const index=source.imageIds.indexOf(source.selectedImageId);source.imageIds=source.imageIds.filter(id=>!removed.has(id));if(removed.has(source.selectedImageId))source.selectedImageId=source.imageIds[Math.min(index,source.imageIds.length-1)]??null;
  for(const r of receipt.relations)board.projectSpaces.relations.find(x=>x.id===r.id).imageIds=r.after;receipt.after=clone(source.imageIds);board.revision++;
  commit(this,next,'canvas_source_images_removed',{boardId,sourceId,imageIds:clone(imageIds),originalsPreserved:true},()=>{if(removed.has(this.data.activeId)){this.imageSelection=(this.imageSelection||0)+1;this.data.activeId=source.selectedImageId;}});return receipt;
 },
 restoreCanvasSourceImages(receipt){
  if(activeWorkpieceExecution(this))fail('檢測執行中，請完成或停止後再復原來源圖片');
  const {boardId,sourceId}=receipt,next=state(this),board=boardOf(next,boardId),source=board.projectSpaces.sources.find(s=>s.id===sourceId);if(!source||JSON.stringify(source.imageIds)!==JSON.stringify(receipt.after))fail('來源清單已改變，請使用專案復原歷史，避免覆蓋後續修改');
  source.imageIds=clone(receipt.before);source.selectedImageId=receipt.selectedBefore;for(const old of receipt.relations){const r=board.projectSpaces.relations.find(r=>r.id===old.id&&r.toSpaceId===sourceId);if(r&&JSON.stringify(r.imageIds)===JSON.stringify(old.after))r.imageIds=clone(old.before);}board.revision++;
  commit(this,next,'canvas_source_images_restored',{boardId,sourceId},()=>{this.imageSelection=(this.imageSelection||0)+1;this.data.activeId=receipt.activeBefore;});return clone(source);
 },
 bindCanvasImages(boardId,sourceId,imageIds){const next=state(this),board=boardOf(next,boardId),source=board.projectSpaces.sources.find(s=>s.id===sourceId);if(!source)fail('圖像源不存在');source.imageIds=clone(imageIds);if(!source.imageIds.includes(source.selectedImageId))source.selectedImageId=source.imageIds[0]??null;board.revision++;commit(this,next,'canvas_images_bound',{boardId,spaceId:sourceId});return clone(source)},
 bindCanvasReferences(boardId,referenceSpaceId,referenceIds){const next=state(this),board=boardOf(next,boardId),value=board.projectSpaces.references.find(s=>s.id===referenceSpaceId);if(!value)fail('參考空間不存在');value.referenceIds=clone(referenceIds);board.revision++;commit(this,next,'canvas_references_bound',{boardId,spaceId:referenceSpaceId});return clone(value)},
 linkCanvasSpaces(boardId,input){fields(input,['id','fromSpaceId','toSpaceId','predicate','description','imageIds']);const next=state(this),board=boardOf(next,boardId),value={id:input.id||uid(),fromSpaceId:input.fromSpaceId,toSpaceId:input.toSpaceId,predicate:input.predicate??'reference_for',description:input.description??'',...(input.imageIds!==undefined?{imageIds:clone(input.imageIds)}:{})};board.projectSpaces.relations.push(value);board.revision++;commit(this,next,'canvas_spaces_linked',{boardId,relationId:value.id});return clone(value)},
 updateCanvasSpaceRelation(boardId,relationId,patch){fields(patch,['description','imageIds']);const next=state(this),board=boardOf(next,boardId),value=board.projectSpaces.relations.find(r=>r.id===relationId);if(!value)fail('資料適用關係不存在');Object.assign(value,clone(patch));board.revision++;commit(this,next,'canvas_space_relation_updated',{boardId,relationId});return clone(value)}
};
