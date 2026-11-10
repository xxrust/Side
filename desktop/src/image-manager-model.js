import {buildSourceStructure,meaningFields,inheritedMeaning,validateSourceSuggestions} from '../scripts/source-structure.mjs';
import {buildImageExpectedClassification} from './workpiece-expected-label.js';
const copy=v=>structuredClone(v),stamp=()=>new Date().toISOString();
export function imageManagerTasks(project,sourceId){return (project.data.imageManagerTasks||[]).filter(t=>!sourceId||t.sourceId===sourceId);}
export function createImportTask(project,sourceId,images,fileStructure){
 if(imageManagerTasks(project).length>=1000)throw Error('圖像管理員任務紀錄已達上限，請整理專案後再分析');
 let structure,errors=[];try{structure=buildSourceStructure(images,fileStructure);}catch(error){structure=buildSourceStructure(images);errors=['匯入目錄結構無法解析：'+error.message+'；圖片已保留，可依圖片路徑重新分析。'];}
 const task={id:crypto.randomUUID(),kind:'import-structure',sourceId,createdAt:stamp(),status:errors.length?'FAILED':'QUEUED',structure,suggestions:[],decisions:{},models:[],errors};project.mutate('image_manager_import_queued',()=>{(project.data.imageManagerTasks??=[]).push(task);});return task.id;
}
export function updateImportTask(project,id,patch){const task=imageManagerTasks(project).find(t=>t.id===id);if(!task)throw Error('圖像管理員任務不存在');project.mutate('image_manager_task_updated',()=>Object.assign(task,copy(patch)));return task;}
export function confirmImportMeaning(project,id,decisions,{applyLabels=false}={}){
 const task=imageManagerTasks(project).find(t=>t.id===id);if(!task)throw Error('匯入紀錄不存在');if(['QUEUED','ANALYZING'].includes(task.status)||task.discussionStatus==='SENDING')throw Error('請等待分析結束後確認');const ids=new Set(task.structure.groups.map(g=>g.id)),clean={};for(const [key,value]of Object.entries(decisions)){if(!ids.has(key))throw Error('資料夾已改變');clean[key]=meaningFields(value);}
 const source=(project.data.visualInquiry?.boards||[]).flatMap(b=>b.projectSpaces?.sources||[]).find(s=>s.id===task.sourceId),members=source?new Set(source.imageIds):null;
 const values=[],categories=project.data.purposeScheme?.classificationSpec?.categories||[],at=stamp(),receipt={stored:0,applied:0,unmapped:0,preserved:0,missing:0};
 for(const f of task.structure.files){const image=project.imageRecord(f.imageId);if(!image||members&&!members.has(f.imageId)){receipt.missing++;continue;}const fields=inheritedMeaning(task.structure,clean,f.groupId),sourceMeaning={taskId:id,relativePath:f.path,fields,actor:'human',at},matching=categories.filter(c=>c.label===fields.category&&(!fields.quality||c.quality===({OK:'good',NG:'bad',UNKNOWN:'undetermined'})[fields.quality]));let expected;
  if(applyLabels&&fields.category){if(image.expected?.status||image.expected?.categoryIds?.length)receipt.preserved++;else if(matching.length===1){expected=buildImageExpectedClassification(project,image.id,{categoryId:matching[0].id,reason:'人工確認匯入目錄含義：'+f.path});expected.provenance.importTaskId=id;receipt.applied++;}else receipt.unmapped++;}values.push({image,sourceMeaning,expected});
 }
 receipt.stored=values.length;
 const apply=()=>{for(const {image,sourceMeaning,expected}of values){image.sourceMeaning=sourceMeaning;if(expected)image.expected=expected;}task.decisions=clean;task.status='CONFIRMED';task.confirmation={actor:'human',at,...receipt,applyLabels};};
 if(receipt.applied&&typeof project.change==='function')project.change('source_meaning_confirmed',apply,{recipe:false});else project.mutate('source_meaning_confirmed',apply);return receipt;
}
export function validateImageManager(data){
 const tasks=data.imageManagerTasks;if(tasks===undefined)return;if(!Array.isArray(tasks)||tasks.length>1000||JSON.stringify(tasks).length>32*1024*1024)throw Error('圖像管理員紀錄過大');const ids=new Set();
 for(const t of tasks){
  if(!t||typeof t.id!=='string'||ids.has(t.id)||t.kind!=='import-structure'||typeof t.sourceId!=='string'||!['QUEUED','ANALYZING','REVIEW','PARTIAL','FAILED','DISABLED','CONFIRMED'].includes(t.status)||t.structure?.schema!=='agentcv-source-structure-1'||!Array.isArray(t.structure.groups)||!t.structure.groups.length||t.structure.groups.length>10000||!Array.isArray(t.structure.files)||t.structure.files.length>100000||t.structure.totalImages!==t.structure.files.length)throw Error('圖像管理員紀錄格式無效');ids.add(t.id);
  const groups=new Map();for(const g of t.structure.groups){if(!g||!/^folder-[0-9]+$/.test(g.id)||groups.has(g.id)||typeof g.path!=='string'||g.path.length>4096||g.path.startsWith('/')||g.path.split('/').some(p=>p==='..'||p==='.')||!Array.isArray(g.samples)||g.samples.length>3||g.samples.some(s=>typeof s!=='string')||!Number.isSafeInteger(g.count)||g.count<0)throw Error('圖像管理員目錄格式無效');groups.set(g.id,g);}
  for(const g of groups.values()){const seen=new Set();for(let current=g;current;current=groups.get(current.parentId)){if(seen.has(current.id)||seen.size>64||current.parentId!==null&&!groups.has(current.parentId))throw Error('圖像管理員目錄關係無效');seen.add(current.id);}}
  for(const f of t.structure.files)if(!f||typeof f.imageId!=='string'||typeof f.path!=='string'||!groups.has(f.groupId))throw Error('匯入圖片關聯無效');
  for(const [id,m]of Object.entries(t.decisions||{})){if(!groups.has(id))throw Error('已確認含義引用的目錄不存在');meaningFields(m);}
  validateSourceSuggestions({groups:t.suggestions||[]},t.structure.groups);
  for(const [id,m]of Object.entries(t.draft||{})){if(!groups.has(id))throw Error('分類草案引用不存在的目錄');meaningFields(m);}
  if(t.notes!==undefined&&(typeof t.notes!=='string'||t.notes.length>12000))throw Error('對話備忘格式無效');
  if(t.conversation!==undefined&&(!Array.isArray(t.conversation)||t.conversation.length>100||t.conversation.some(m=>!m||typeof m.id!=='string'||!['user','assistant'].includes(m.role)||typeof m.text!=='string'||m.text.length>16000||m.groupId!=null&&!groups.has(m.groupId))))throw Error('圖像管理員對話紀錄無效');
  if(t.discussionStatus!==undefined&&!['IDLE','SENDING','FAILED'].includes(t.discussionStatus))throw Error('圖像管理員對話狀態無效');
  if(t.discussionStatus==='SENDING'){t.discussionStatus='FAILED';t.discussionError='上次對話未完成，問題與草案已保留；可重新發送。';}

  if(['QUEUED','ANALYZING'].includes(t.status)){t.status='FAILED';t.errors=['上次分析未完成，可重試或直接人工填寫。'];}
 }
}
export function imageManagerContext(project,sourceId){
 const summaries=[];let remaining=16000;const brief=value=>value?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,typeof v==='string'?v.slice(0,160):Array.isArray(v)?v.slice(0,8).map(x=>x.slice(0,80)):v])):null;
 for(const t of imageManagerTasks(project,sourceId).slice(-6).reverse()){
  const notes=(t.notes||'').slice(0,Math.min(4000,remaining));remaining-=notes.length;const conversation=[];for(const m of (t.conversation||[]).slice(-4)){const row={role:m.role,text:m.text.slice(0,600),groupId:m.groupId||null},size=JSON.stringify(row).length;if(size>remaining)break;remaining-=size;conversation.push(row);}
  const groups=[];for(const g of t.structure.groups.slice(0,12)){const suggestion=t.suggestions?.find(s=>s.id===g.id),row={id:g.id,path:g.path.slice(0,500),count:g.count,confirmed:brief(t.decisions?.[g.id]),suggestion:suggestion?{meaning:brief(suggestion.meaning),reason:suggestion.reason.slice(0,240),question:suggestion.question.slice(0,240)}:null};const size=JSON.stringify(row).length;if(size>remaining)break;remaining-=size;groups.push(row);}
  summaries.push({id:t.id,sourceId:t.sourceId,kind:t.kind,status:t.status,totalImages:t.structure.totalImages,model:t.models?.at(-1)||null,notes,conversation,confirmation:t.confirmation||null,groups,truncated:t.structure.groups.length>groups.length,scope:'notes 是對話備忘，保留複雜規則、例外與未決問題，不代表已套用或已編譯；人類原話見 conversation。已保存的圖片含義以 confirmation、decisions 與逐圖 sourceMeaning 為準；後續 REVIEW 對話不會撤銷已有標記。未保存的模型建議不是驗收答案。逐張已確認含義可由 get_dataset_images 分頁讀取。'});if(remaining<500)break;
 }return summaries;
}

export function beginImportDiscussion(project,id,text,draft,groupId=null){
 const task=imageManagerTasks(project).find(t=>t.id===id);if(!task)throw Error('匯入紀錄不存在');
 if(['QUEUED','ANALYZING'].includes(task.status)||task.discussionStatus==='SENDING')throw Error('請等待目前分析完成');
 if(typeof text!=='string'||!text.trim()||text.length>4000)throw Error('請輸入 1–4000 字的說明');
 if((task.conversation?.length||0)>=98)throw Error('此匯入對話已達 100 則，請確認目前草案或開啟新分析');
 const ids=new Set(task.structure.groups.map(g=>g.id)),clean={};for(const [key,value]of Object.entries(draft)){if(!ids.has(key))throw Error('草案引用的目錄不存在');clean[key]=meaningFields(value);}
 if(groupId!==null&&!ids.has(groupId))throw Error('選取的目錄不存在');
 const turn={id:crypto.randomUUID(),role:'user',text:text.trim(),at:stamp(),groupId};
 updateImportTask(project,id,{conversation:[...(task.conversation||[]),turn],draft:clean,status:'REVIEW',discussionStatus:'SENDING',discussionTurnId:turn.id,discussionError:null});return turn.id;
}
export function finishImportDiscussion(project,id,turnId,{groups=[],message,models=[],notes}){
 const task=imageManagerTasks(project).find(t=>t.id===id);if(!task||task.discussionStatus!=='SENDING'||task.discussionTurnId!==turnId)throw Error('對話狀態已變更，舊回覆未套用');
 const checked=validateSourceSuggestions({groups},task.structure.groups);if(typeof message!=='string'||!message.trim()||message.length>16000)throw Error('對話回覆無效');
 if(notes!==undefined&&(typeof notes!=='string'||notes.length>12000))throw Error('對話備忘格式無效');
 const draft=copy(task.draft||{}),suggestions=new Map((task.suggestions||[]).map(g=>[g.id,g]));for(const g of checked){draft[g.id]=g.meaning;suggestions.set(g.id,g);}
 updateImportTask(project,id,{draft,...(notes!==undefined?{notes}:{}),suggestions:[...suggestions.values()],models:[...(task.models||[]),...models],conversation:[...task.conversation,{id:crypto.randomUUID(),role:'assistant',text:message,at:stamp(),inReplyTo:turnId}],discussionStatus:'IDLE',discussionError:null,errors:[]});return task;
}
export function failImportDiscussion(project,id,turnId,error){const task=imageManagerTasks(project).find(t=>t.id===id);if(task?.discussionTurnId===turnId&&task.discussionStatus==='SENDING')updateImportTask(project,id,{discussionStatus:'FAILED',discussionError:String(error.message||error).slice(0,2000)});}
