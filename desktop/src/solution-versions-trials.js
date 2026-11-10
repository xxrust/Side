import {jsonSnapshot} from './json-snapshot.js';
import {serializeProject} from './project-serialization.js';
// Immutable calculation capture. Only the actual operation's products are
// merged into its pre-run project; later edits are never included by accident.
const copy=jsonSnapshot;
export function captureTrialSnapshot(project,content,{label='試算',type='program',runId=null}={}){
 const snapshot=typeof content==='string'?JSON.parse(content):copy(content);
 return {projectData:project.data,epoch:project.epoch,snapshot,label,type,runId,startedAt:new Date().toISOString()};
}
export function completeTrialSnapshot(capture,{run=null,runs=[],purposeAcceptance=undefined,imageResults=[],workflowResult=null,datasetExecution=undefined,geometry=null,error=null,runId=null}={}){
 const original=capture.snapshot,snapshot={...original},finishedAt=new Date().toISOString();
 if(!Array.isArray(runs))throw Error('試算產品 runs 必須為真實運算陣列');
 const products=[],seen=new Map();
 for(const value of [...(run?[run]:[]),...runs]){
  if(!value||typeof value.runId!=='string'||!value.runId||!['SUCCEEDED','FAILED','TIMEOUT'].includes(value.status)||typeof value.code!=='string'||!Array.isArray(value.artifacts)||!Array.isArray(value.sourceBinding?.images))throw Error('試算產品缺少真實運算 ID、程式、狀態、來源或產物');
  if(seen.has(value.runId)){if(JSON.stringify(seen.get(value.runId))!==JSON.stringify(value))throw Error('同一試算產品 ID 包含不同運算內容');continue;}
  seen.set(value.runId,value);products.push(value);
 }
 if(products.length){snapshot.algorithmRuns=[...(original.algorithmRuns||[]).filter(r=>!seen.has(r.runId)),...products.map(copy)];runId=products.at(-1).runId;}
 // Undefined leaves the captured acceptance alone; null explicitly revokes a
 // previous PASS after a compile/dispatch error, without reading live state.
 if(purposeAcceptance===null)delete snapshot.purposeAcceptance;
 else if(purposeAcceptance!==undefined){
  if(!purposeAcceptance||typeof purposeAcceptance!=='object'||Array.isArray(purposeAcceptance))throw Error('整圖驗證產品須為物件、null 或 undefined');
  const acceptance=copy(purposeAcceptance),ids=acceptance.runIds,errors=[],stored=new Map((snapshot.algorithmRuns||[]).map(r=>[r.runId,r]));
  if(!Array.isArray(ids)||!ids.length)errors.push({code:'TRIAL_ACCEPTANCE_RUNS_MISSING',message:'整圖驗證未保存真實節點運算 ID'});
  for(const id of Array.isArray(ids)?ids:[]){
   const current=stored.get(id);
   if(!current){errors.push({code:'TRIAL_RUN_MISSING',runId:id,message:'整圖結果引用的節點運算未包含在固定試算快照'});continue;}
   if(current.status!=='SUCCEEDED')errors.push({code:'TRIAL_RUN_NOT_SUCCEEDED',runId:id,status:current.status,message:'整圖結果引用失敗或超時的節點運算'});
   for(const binding of Object.values(current.upstreamBindings||{})){
    const upstream=stored.get(binding.runId);
    if(!upstream||upstream.status!=='SUCCEEDED'||!upstream.artifacts?.some(a=>a.id===binding.artifactId))errors.push({code:'TRIAL_UPSTREAM_UNAVAILABLE',runId:id,upstreamRunId:binding.runId,artifactId:binding.artifactId,message:'固定快照缺少真實上游運算或依賴產物'});
   }
  }
  if(errors.length){acceptance.snapshotIntegrity={status:'INCOMPLETE',claimedStatus:acceptance.status,errors};if(acceptance.status==='PASS')acceptance.status='STALE';}
  snapshot.purposeAcceptance=acceptance;
 }
 if(imageResults.length){const byId=new Map(imageResults.map(r=>[r.imageId,r]));snapshot.images=(original.images||[]).map(image=>{const result=byId.get(image.id);if(!result)return image;return {...image,...copy(result.fields)};});}
 if(datasetExecution!==undefined){const executions=(original.datasetExecutions||[]).filter(e=>e.id!==datasetExecution?.id);snapshot.datasetExecutions=datasetExecution?[...executions,copy(datasetExecution)]:executions;}
 if(workflowResult)snapshot.workflow={...original.workflow,...copy(workflowResult)};
 if(geometry){snapshot.visualInquiry={...original.visualInquiry,boards:(original.visualInquiry?.boards||[]).map(board=>board.id!==geometry.boardId?board:{...board,items:board.items.map(item=>item.id!==geometry.itemId?item:{...item,geometryTools:(item.geometryTools||[]).map(tool=>tool.id!==geometry.toolId?tool:{...tool,result:copy(geometry.result)})})})};}
 const identity=runId||capture.runId||crypto.randomUUID();
 const failed=products.find(r=>r.status==='FAILED'||r.status==='TIMEOUT'),status=error?'FAILED':datasetExecution?.status||failed?.status||((purposeAcceptance!==undefined&&snapshot.purposeAcceptance?.snapshotIntegrity?.status==='INCOMPLETE')?'INCOMPLETE':products.at(-1)?.status||'COMPLETED');
 snapshot.historyTrial={schema:'agentcv-history-trial-1',id:identity,runIds:products.map(r=>r.runId),type:capture.type,label:capture.label,startedAt:capture.startedAt,finishedAt,status,error:error?{message:String(error?.message||error)}:null};
 return {content:serializeProject(snapshot),runId:identity,message:capture.label,kind:'trial'};
}
export class TrialHistory{
 constructor({api,native,location,ensureLocation,onSaved,onError}){Object.assign(this,{api,native,location,ensureLocation,onSaved,onError});this.memoryPending=new Map();this.tail=Promise.resolve();}
 async prepare(capture){if(!this.native())return capture;const location=this.location();capture.location={...location};try{if(!capture.location.path)capture.location=await this.ensureLocation(serializeProject(capture.snapshot),capture.location,capture);}catch(error){capture.prepareError=String(error?.message||error);}return capture;}
 async finish(capture,products){if(!this.native())return null;const pending=completeTrialSnapshot(capture,products);pending.capture=capture;this.memoryPending.set(pending.runId,pending);return this.persist(pending);}
 async persist(pending){
  const task=async()=>{try{let location=pending.capture.location;if(!location?.path)location=await this.ensureLocation(pending.content,location||{},pending.capture);pending.capture.location=location;const receipt=await this.api.create(location.path,pending.content,pending.message,{kind:'trial',runId:pending.runId});this.memoryPending.delete(pending.runId);this.onSaved?.(receipt,pending.capture,location);return receipt;}catch(error){const message=String(error?.message||error);if(message.includes('固定試算快照已保留'))this.memoryPending.delete(pending.runId);this.onError?.((message.includes('固定試算快照已保留')?'試算已保存至磁碟，歷史尚未封存：':'歷史尚未保存，請先重試並保持軟體開啟：')+message);return null;}};
  const result=this.tail.catch(()=>{}).then(task);this.tail=result;return result;
 }
 async retry(){const saved=[];for(const pending of [...this.memoryPending.values()]){const receipt=await this.persist(pending);if(receipt)saved.push(receipt)}const {path}=this.location();if(path){const result=await this.api.retry(path);return {...result,saved:[...saved,...result.saved]};}return {saved,failed:[],remaining:this.memoryPending.size};}
}
