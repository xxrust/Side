// Recovery is a local working copy. It never writes the user's project file.
import {serializeProject} from './project-serialization.js';
import {jsonSnapshot} from './json-snapshot.js';

// Recovery is not a second project archive.  Large raster outputs and verbose
// runtime traces already have their own durable record path.  Keeping those
// bytes in every session snapshot made a harmless click rewrite hundreds of
// megabytes and was the source of the desktop process crashes.
const recoveryDenseKeys=new Set(['supportPoints','residuals','outerContour','outerContours','boundary','radialCurve','mask','runs','peakIndices','points','samples','profiles','candidatePeaks','edgeCandidates']);
function compactTraceValue(value,depth=0){
 if(value===null||value===undefined||typeof value!=='object')return value;
 if(depth>8)return Array.isArray(value)?{schema:'agentcv-recovery-array-summary',length:value.length}:{schema:'agentcv-recovery-object-summary',keys:Object.keys(value).slice(0,64)};
 if(Array.isArray(value)){
  if(value.length<=64)return value.map(item=>compactTraceValue(item,depth+1));
  return {schema:'agentcv-recovery-array-summary',length:value.length,head:value.slice(0,8).map(item=>compactTraceValue(item,depth+1)),tail:value.slice(-2).map(item=>compactTraceValue(item,depth+1))};
 }
 const result={};
 for(const [key,child] of Object.entries(value)){
  if(recoveryDenseKeys.has(key)&&Array.isArray(child)){result[key]={schema:'agentcv-recovery-array-summary',length:child.length};continue;}
  result[key]=compactTraceValue(child,depth+1);
 }
 return result;
}
function compactProcedureTrace(trace){
 if(!trace||typeof trace!=='object'||!Array.isArray(trace.nodes))return trace;
 return {...trace,nodes:trace.nodes.map(node=>({...node,outputs:compactTraceValue(node.outputs),inputs:compactTraceValue(node.inputs),parameters:compactTraceValue(node.parameters),justification:compactTraceValue(node.justification)}))};
}
export function compactSessionProject(project,{retainRunIds=null}={}){
 const source=retainRunIds&&Array.isArray(project?.algorithmRuns)?{...project,algorithmRuns:project.algorithmRuns.filter(run=>retainRunIds.has(run.runId))}:project,snapshot=jsonSnapshot(source),walk=(value,path=[])=>{
  if(Array.isArray(value)){value.forEach((item,index)=>walk(item,path.concat(index)));return value;}
  if(!value||typeof value!=='object')return value;
  // `dataURL` is the canonical project spelling.  Older records and a few
  // runtime adapters also expose the camel-case alias `dataUrl`; when both
  // fields contain the exact same encoded bytes, retaining both only doubles
  // the string in the recovery snapshot.  Preserve mismatched values so a
  // malformed/legacy record is never silently changed.
  if(Object.hasOwn(value,'dataURL')&&Object.hasOwn(value,'dataUrl')&&
     typeof value.dataURL==='string'&&value.dataURL===value.dataUrl)delete value.dataUrl;
  for(const key of Object.keys(value)){
   const child=value[key];
   if(key==='procedureTrace'){value[key]=compactProcedureTrace(child);continue;}
   if(key==='displayPreview'&&child?.schema==='agentcv-display-preview-1'){delete value[key];continue;}
   if(key==='agentActivity'){delete value[key];continue;}
   if((key==='dataURL'||key==='dataUrl')&&path[0]==='algorithmRuns'&&path.includes('artifacts')){delete value[key];continue;}
   if((key==='dataURL'||key==='dataUrl')&&typeof child==='string'&&/^data:image\//i.test(child)){
    const isOriginal=path[0]==='images';
    const isInquiryAsset=path[0]==='visualInquiry'&&path.includes('assets');
    const isAlgorithmArtifact=path[0]==='algorithmRuns'&&path.includes('artifacts');
    if(isAlgorithmArtifact||(!isOriginal&&!isInquiryAsset&&child.length>2_000_000))delete value[key];
    continue;
   }
   if(key==='data'&&path[0]==='algorithmRuns'&&path.includes('artifacts')){
    let bytes=0;try{bytes=JSON.stringify(child).length}catch{bytes=Number.MAX_SAFE_INTEGER;}
    if(bytes>512_000){delete value[key];continue;}
   }
   walk(child,path.concat(key));
  }
  return value;
 };
 return walk(snapshot);
}
export function browserSessionStore(){
 if(!globalThis.indexedDB)return null;
 const open=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('agentcv-session',1);request.onupgradeneeded=()=>request.result.createObjectStore('session');request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});
 const transact=async(mode,action)=>{const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('session',mode),request=action(tx.objectStore('session'));let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('工作階段寫入中止'));});}finally{db.close();}};
 return {read:()=>transact('readonly',store=>store.get('last')),write:content=>transact('readwrite',store=>store.put(content,'last'))};
}
export class AppSession{
 constructor({store,capture,restore,beforeCapture,onError=()=>{},delay=700}){Object.assign(this,{store,capture,restore,beforeCapture,onError,delay});this.blocked=false;this.restoring=false;this.projectPath=null;this.savedProject=null;this.tail=Promise.resolve();this.pendingWrites=0;this.ready=this.start();}
 async start(){
  if(!this.store)return;
  this.restoring=true;
  try{const text=await this.store.read();if(!text)return;const session=typeof text==='string'?JSON.parse(text):text;if(session?.schema!=='agentcv-app-session-1'||!session.project||!session.ui)throw Error('工作階段格式不完整');this.projectPath=session.projectPath||null;this.savedProject=session.savedProject||(session.dirty?null:session.project);await this.restore(session);this.last=text;}
  catch(error){this.blocked=true;this.onError('無法恢復上次工作階段，原紀錄已保留：'+error.message);}
  finally{this.restoring=false;}
 }
 schedule(){if(!this.store||this.blocked||this.restoring)return;clearTimeout(this.timer);this.timer=setTimeout(()=>{this.flush().catch(error=>this.onError('工作階段尚未保存：'+error.message));},this.delay);}
 acceptProject(project,path=null){this.savedProject=jsonSnapshot(project);this.projectPath=path;this.blocked=false;this.last=null;this.lastFingerprint=null;this.schedule();}
 async flush(){
  clearTimeout(this.timer);await this.ready;if(!this.store||this.blocked||this.restoring)return false;
  if(this.beforeCapture){if(await this.beforeCapture()===false||this.blocked||this.restoring)return false;}
  const value=this.capture();if(!value)return false;
  // The saved baseline is an immutable snapshot that can be tens of megabytes.
  // Encode it once per baseline object and append the cached text as the last
  // key, which yields exactly the bytes the single-pass encoder produced.
  const withBaseline=!!(value.dirty&&this.savedProject)&&!Object.hasOwn(value,'savedProject');
  const session={schema:'agentcv-app-session-1',...value,projectPath:this.projectPath,savedAt:new Date().toISOString()};
  let fingerprint=serializeProject({...session,savedAt:undefined});
  if(withBaseline){
   if(this.savedProjectJsonFor!==this.savedProject){this.savedProjectJson=serializeProject(this.savedProject);this.savedProjectJsonFor=this.savedProject;}
   fingerprint=fingerprint.slice(0,-1)+',"savedProject":'+this.savedProjectJson+'}';
  }
  if(fingerprint===this.lastFingerprint&&this.pendingWrites===0)return true;
  // A user can undo to the last completed snapshot while a different snapshot
  // is still being written. Do not deduplicate against a completed value until
  // the write queue is empty, or the in-flight draft would win after the undo.
  // The fingerprint already contains the entire immutable JSON object.
  // Append only its timestamp instead of encoding all image strings twice.
  const content=fingerprint.slice(0,-1)+',"savedAt":'+JSON.stringify(session.savedAt)+'}';this.pendingWrites++;const write=this.tail.catch(()=>{}).then(()=>this.store.write(content));this.tail=write;try{const receipt=await write;this.lastFingerprint=fingerprint;if(receipt?.warning)this.onError(receipt.warning);return true;}finally{this.pendingWrites--;}
 }
 async discard(emptyProject){
  await this.ready;clearTimeout(this.timer);this.blocked=true;const project=this.savedProject||(this.projectPath?null:emptyProject);
  const session={schema:'agentcv-app-session-1',project,ui:project?.workspaceView||{page:1},dirty:false,projectPath:this.projectPath,savedAt:new Date().toISOString()};
  // Block new draft flushes before waiting for old writes and put the discard
  // snapshot on the same queue. A pointer event during a slow native disk write
  // must never overwrite the user's explicit decision to discard changes.
  const content=serializeProject(session),write=this.tail.catch(()=>{}).then(()=>this.store?.write(content));this.tail=write;await write;this.lastFingerprint=serializeProject({...session,savedAt:undefined});
 }
}
