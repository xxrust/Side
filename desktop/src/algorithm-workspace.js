import {validateNodeDocumentation} from './node-documentation.js';
import {dataContractSchema} from './data-contract-schema.js';
import {auditDataContracts,dataContractIssues} from './data-contract.js';
import sharedLayerContract from '../scripts/structured-layers-contract.json' with {type:'json'};
import {isWorkpiecePlan} from './workpiece-plan.js';
import {runDatasetScheme} from './workpiece-runner.js';
export {runDatasetScheme,readDatasetExecution} from './workpiece-runner.js';
import {effectiveAlgorithmRun,prepareAlgorithmEvidenceRevisions} from './algorithm-evidence-revisions.js';
import {captureBoardIntent} from './agent-change-impact.js';
import {auditAlgorithmProcedureTrace} from './algorithm-procedure-audit.js';
import {compileScheme,schemeFingerprint,sourceFingerprint,evaluatePurposeRule} from './purpose-compiler.js';
import {validateOperationEvidenceJustification,PipelineEvidenceContractError} from './pipeline-evidence-contract.js';
import {workpieceArtifactPixel} from './workpiece-live-state.js';
import {nativeGrayImage} from './gray-transport.js';

const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.trim().length>0;
const locks=new WeakSet();
const compiledSessions=new WeakMap();
export function executionBackendForNode(node){
 if(node?.nativePlan?.backend==='rust-native'&&node.nativePlan.plan?.nodes?.length)return 'rust-native';
 return 'python-extension';
}
export function executionBackendLabel(backend){return backend==='rust-native'?'Rust 原生 typed pipeline':'Python extension fallback';}
export function beginCompiledSession(project,compilation){compiledSessions.set(project,{basis:schemeFingerprint(project.data.purposeScheme),compilation});return ()=>compiledSessions.delete(project);}
const stable=value=>JSON.stringify(value,(_,item)=>record(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
function assetFingerprint(value){let a=2166136261,b=2246822507;for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b^value.charCodeAt(i),3266489909)}return `${value.length}:`+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0')}
const fail=(code,path,message,hint)=>{const errors=[{code,nodeId:'program',path,message,hint}];throw new PipelineEvidenceContractError(code,{status:'MISSING',valid:false,errors},message)};

// A native plan keeps the historical editable source for recovery, while the
// actual execution request is a typed Rust graph.  This is the migration seam
// for existing Python-authored nodes; arbitrary scripts still use the Python
// extension when no native plan is declared.
export function adaptNativePipelineResponse(native,request){
 const nodes=Array.isArray(native?.nodes)?native.nodes:[],feature=nodes.find(node=>node.op==='geometry.two_boundary')||nodes.find(node=>node.op?.startsWith('geometry.'))||nodes.at(-1),featureArtifacts=feature?.artifacts||[],bySuffix=suffix=>featureArtifacts.find(a=>String(a.id||'').endsWith(':'+suffix)||a.id===suffix),analysis=bySuffix('feature-evidence')?.data||{},search=analysis.search||{},summary=feature?.outputSummary||{},status=summary.status||'UNKNOWN',geometry={...summary,backend:'rust-native'},checks=[{id:'native.execution',status:native?.status==='OK'?'PASS':'NOT_EVALUATED',actual:native?.status||'UNKNOWN',threshold:'OK'},{id:'native.geometry',status:status==='UNKNOWN'?'NOT_EVALUATED':'PASS',actual:status,threshold:['GOOD','SKEW']}];
 const evidence=(id,data)=>({id,type:'evidence',name:id,data:data??{},backend:'rust-native',source:'rust-native'});
 const overlay=bySuffix('feature-overlay');
 const artifacts=[
  overlay?{...clone(overlay),id:'overlay',name:'overlay',role:'result',pixelRetention:'full',bytes:typeof overlay.dataURL==='string'?Math.floor(overlay.dataURL.length*.75):0}:{id:'overlay',type:'image',name:'overlay',role:'result',dataURL:null,pixelRetention:'metadata-only',backend:'rust-native'},
  evidence('search_data',search),
  evidence('edge_data',{edgeCandidates:search.edgeCandidates||{},jointCandidates:search.jointCandidates||{},refinedEdges:search.refinedEdges||{},exteriorEdges:search.exteriorEdges||{}}),
  evidence('model_data',{lidPose:summary.lidPose||null,pkgReconstruction:search.pkgReconstruction||null,radiusTrials:search.radiusTrials||null}),
  evidence('geometry_data',{geometry,search:search.geometry||geometry,decisionTrials:search.decisionTrials||null}),
  evidence('geometry',{...geometry,skewSupported:status==='SKEW',containedSupported:status==='GOOD',boundaryChecks:checks})
 ];
 const params=feature?.parameters||request.nativePipeline?.plan?.nodes?.find(n=>n.op==='geometry.two_boundary')?.params||{};
 const sourceHints=feature?.parameterSources||request.nativePipeline?.plan?.nodes?.find(node=>node.op==='geometry.two_boundary')?.parameterSources||{};
 const parameterSources=Object.fromEntries(Object.keys(params).map(name=>[name,sourceHints[name]||'native-default']));
 const nativeJustification={tool:{reason:'以 Rust gray8 typed pipeline 執行兩層邊界，保留實測支持與估計邊界的區分。',expectedEvidence:[{kind:'artifact',type:'evidence',id:'geometry_data'}]},parameters:Object.keys(params).map(name=>({name,source:parameterSources[name],reason:parameterSources[name]==='native-default'?'本次方案未提供此值，使用 Rust 算子明示的工程預設；不可視為人類確認。':'沿用目前方案已保存的工程參數；本次實算由 Rust 原生核心重新核對。',verification:{kind:'artifact',type:'evidence',id:'geometry_data'}})),boundaries:[{condition:'需要獨立 pkg 外露支持與有限幾何；否則保持 UNKNOWN。',check:{kind:'artifact',type:'evidence',id:'geometry_data'},onFailure:'UNKNOWN'}]};
 const traceNode={instanceId:`${request.runtimePlan?.nodeId||'native'}#1`,id:request.runtimePlan?.nodeId||'native',kind:'step',status:'SUCCEEDED',judgement:status==='SKEW'?'NG':status==='GOOD'?'OK':'UNKNOWN',parameters:clone(params),parameterSources:clone(parameterSources),outputs:{...geometry,skewSupported:status==='SKEW',containedSupported:status==='GOOD',boundaryChecks:checks},artifactIds:artifacts.map(a=>a.id),justification:nativeJustification};
 const duration=Number.isFinite(native?.durationMs)?native.durationMs:0;
 return {runId:native?.runId||`rust-${Date.now()}`,status:native?.status==='OK'?'SUCCEEDED':'FAILED',artifacts,backend:'rust-native',executionBackend:'rust-native',language:'rust',nativeResult:clone(native),result:{valid:status!=='UNKNOWN',status,skewSupported:status==='SKEW',containedSupported:status==='GOOD',geometry,measurements:clone(native?.measurements||{}),boundaryChecks:checks,backend:'rust-native'},procedureTrace:{schema:'agentcv-procedure-trace-1',nodes:[traceNode]},execution:{status:native?.status==='OK'?'COMPLETED':'FAULT',backend:'rust-native'},timing:{programMs:duration,native:{backend:'rust-native',processMs:duration,totalMs:duration,queueMs:0,preparationMs:0,resultReadMs:0,verificationMs:0,resultWriteMs:0}}};
}
function fingerprint(raster){
 if(!raster?.gray)throw Error('原圖像素尚未解碼');let a=2166136261,b=2246822507;
 const values=raster.gray,bytes=ArrayBuffer.isView(values)?new Uint8Array(values.buffer,values.byteOffset,values.byteLength):new TextEncoder().encode(JSON.stringify(values));
 for(const byte of bytes){a=Math.imul(a^byte,16777619);b=Math.imul(b^byte,3266489909)}
 return `${raster.width}x${raster.height}:`+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
function selectedImages(project,ids){
 const requested=ids??[project.image?.id];
 if(!Array.isArray(requested)||!requested.length||new Set(requested).size!==requested.length)throw Error('請指定不重複的已導入圖片');
 return requested.map(id=>{const image=project.imageRecord?.(id)||project.data.images.find(image=>image.id===id);if(!image||!project.pixels.has(id))throw Error('算法輸入必須是目前專案的已導入原圖');return image});
}
function imageSource(project,image){return image.assetRef||isWorkpiecePlan(project.data.purposeScheme)?{imageId:image.id,imageSha256:image.sha256,width:image.width,height:image.height,contentSha256:image.contentSha256||image.assetRef?.sha256||image.sha256}:{imageId:image.id,imageSha256:image.sha256,width:image.width,height:image.height,pixelFingerprint:fingerprint(project.pixels.get(image.id)),assetFingerprint:assetFingerprint(image.dataURL)}}
function visualReferences(value,result=[]){
 if(!value||typeof value!=='object')return result;
 if(Array.isArray(value)){for(const item of value)visualReferences(item,result);return result;}
 if(Array.isArray(value.visuals))for(const visual of value.visuals)if(record(visual)&&['project-image','canvas-asset'].includes(visual.kind)&&text(visual.id)&&!result.some(item=>item.kind===visual.kind&&item.id===visual.id))result.push({kind:visual.kind,id:visual.id});
 for(const child of Object.values(value))visualReferences(child,result);
 return result;
}
async function resolveEvidenceVisuals(project,justification){
 const refs=visualReferences(justification),state=project.data.visualInquiry||{},assets=Array.isArray(state.assets)?state.assets:[],images=Array.isArray(project.data.images)?project.data.images:[],result=[];
 for(const ref of refs){
  if(ref.kind==='project-image'){
   const image=images.find(item=>item.id===ref.id);if(!image)continue;
   const dataURL=project.readImageAsset?await project.readImageAsset(image.id):image.dataURL;if(typeof dataURL!=='string')continue;
   result.push({kind:ref.kind,id:ref.id,type:'image',name:image.name||ref.id,dataURL,dataUrl:dataURL,width:image.width,height:image.height,source:{kind:'project-image',imageId:image.id,sha256:image.sha256}});
  }else{
   const asset=assets.find(item=>item.id===ref.id);if(!asset||typeof asset.dataURL!=='string')continue;
   const itemIds=(state.boards||[]).flatMap(board=>(board.items||[]).filter(item=>item.assetId===asset.id).map(item=>item.id));
   result.push({kind:ref.kind,id:ref.id,type:'image',name:asset.label||ref.id,dataURL:asset.dataURL,dataUrl:asset.dataURL,width:asset.width,height:asset.height,source:{kind:'canvas-asset',assetId:asset.id,itemIds,author:asset.author,assetSource:clone(asset.source)}});
  }
 }
 return result;
}
export function algorithmContext(project,{imageIds}={}){
 const images=selectedImages(project,imageIds),bindings=images.map(image=>imageSource(project,image));
 const source = {projectEpoch:project.epoch,workflowRevision:project.workflow.revision,schemeFingerprint:schemeFingerprint(project.data.purposeScheme),images:bindings};
 const schemeNodes=project.data.purposeScheme?.operatorGraph?.nodes||[];
 const backendRows=schemeNodes.map(node=>{const backend=executionBackendForNode(node);return {nodeId:node.id,backend,label:executionBackendLabel(backend),explicit:!!node.nativePlan||node.executionBackend==='rust-native'}});
 return {sourceFingerprint:sourceFingerprint(source),scheme:clone(project.data.purposeScheme || null),schema:'agentcv-algorithm-context-1',source,images:images.map(image=>({id:image.id,name:image.name,width:image.width,height:image.height,sha256:image.sha256})),calibration:images.map(image=>({imageId:image.id,...project.scale(image.id)})),calibrationPolicy:{pixelDevelopment:'allowed in px units',physicalUnits:'requires calibration status VALID',batchDispatch:'mm/m schemes block when any workpiece input is UNKNOWN or THEORETICAL'},executionPolicy:clone(algorithmCapabilities().executionPolicy),schemeBackends:backendRows,targets:clone(project.targets?.map(target=>({id:target.id,name:target.name,description:target.description,regions:Object.fromEntries(images.filter(image=>target.regions?.[image.id]).map(image=>[image.id,target.regions[image.id]]))}))||[]),runs:algorithmRunSummaries(project),next:'run_algorithm',scope:'輸入為完整原圖；固定方案按節點明確選擇 Rust 原生或 Python fallback，任意 Python 算法仍可在 draft 或明確 fallback 節點中使用。像素結果、作者理由與正式驗收分別保存。'};
}
export function algorithmCapabilities(environment=null){return {schema:'agentcv-programmable-cv-1',mode:'hybrid-native-first',legacyMode:'programmable-python',executionEngine:'rust-native-with-python-fallback',algorithmAllowlist:null,environment,executionModel:'hybrid-native-first',executionPolicy:{defaultBackend:'rust-native',fallbackBackend:'python-extension',selection:'每個方案節點明確記錄 resolved backend；有 nativePlan 時走 Rust typed pipeline，沒有 nativePlan 的 Python 節點才走 fallback，不能只看全局 mode'},nativePipeline:{execute:'run_pipeline',backend:'rust-native',operators:['image.grayscale','segment.otsu','regions.components','topology.holes','geometry.annulus','geometry.two_boundary','rules.evaluate'],note:'新建固定算子方案用 nativePlan 明確走 Rust；任意 Python/OpenCV 程式是相容 fallback。'},tools:{context:'get_algorithm_context',execute:'run_algorithm',read:'get_algorithm_run',view:'show_algorithm_run',dependencies:'install_algorithm_packages'},sdk:{structuredLayers:{save:'save_layers(name, layers, section="tool")',artifact:'保存為type=json產物；expected_outputs宣告同名{id:name,type:"evidence"}。',contract:sharedLayerContract,defaults:sharedLayerContract['x-agentcv'].runtimeDefaults,types:sharedLayerContract['x-agentcv'].objectTypes,sourceIdentity:'imageId/sourceId 都來自本次 image_records[i]["id"]，不是檔名或canvas asset id；stepId自動綁當前實際step instanceId。單圖可省imageId，多圖必須明確指定。',polygon:'type=polygon 不合法，也沒有silent alias。封閉多邊形使用 type=roi，geometry.points=[{x,y},...]。',measurement:'geometry:{points:[{x,y},{x,y}],value:實算有限數值,unit:"px"}；不可用geometry.from/to，也不可把value/unit放物件外層。',example:'with step("measure"):\n    centre=(float(image.shape[1])/2, float(image.shape[0])/2)\n    save_layers("geometry", [{"id":"actual-image-centre","objects":[{"id":"centre-note","type":"note","geometry":{"points":[{"x":centre[0],"y":centre[1]}],"text":"輸入影像幾何中心，非工件定位"}}]}])',failure:'保存前整批驗證；錯誤包含code/path/type/hint，不寫入非法layer artifact。歷史非法層會被隔離並出diagnostics，不轉寫歷史fact。'},invoke:'invoke(id, callback, requires=[priorInvocation], any_of=[alternativeInvocation], when=True): captures exception as FAULT, blocks unavailable prerequisites, independent branch continues; found(value) or not_found(message) gives explicit normal result. run_step also captures callbacks; with step/procedure cannot skip Python body and unhandled exceptions still propagate.',procedures:'with procedure(id,name=...,inputs={...},outputs={...},depends_on=[...],parameters={...},parameter_sources={...},documentation="自由設計說明") as p:; inside use with step(...) as s. Each real step may carry free-form documentation and records its actual save_image/save_json artifacts. Use s.set_output(name,value); run_step/skip_step preserve branches and reasons. Do not replace a multi-step plan with one untracked block.',upstream:'Explicit graph inputs:{slot:{nodeId,artifactId}} with matching dependency edge receive upstream[slot]={nodeId,runId,artifactId}; JSON is artifact.data. Only completed real upstream artifacts are transferred.',images:'完整原圖的 OpenCV BGR numpy array清單；image=images[0]，gray=第一張灰階。image_records 保存對應身份。',imports:'可自行 import、定義函數及組合任意已安裝套件。np、cv2 預載；raw_images 保留位深及原始通道；缺依賴可 install_algorithm_packages。',parameters:'parameters 是本次明確保存的 JSON 參數，source 是來源綁定。',outputs:'save_image("edges", array, section="tool")；save_json("stats", object, section="parameters")，id 為傳入名稱。section 可為 tool / parameters / boundary；其他模型或數據檔可用 save_file(id,path,section)。expected_outputs可用role:result或intermediate宣告節點輸出與內部產物；未宣告不猜最後一張是結果。',result:'將結構化輸出指派給 result；邊界觀察放 result.boundaryChecks=[{id,status:"PASS"|"FAIL"|"NOT_EVALUATED",actual,threshold}]。這些是此程式的自檢，不能冒充獨立驗收。'},dataContractSchema,evidenceContract:{required:['title','code','parameters_json','source','expected_outputs'],parameterSources:'parameters_json 保存實際具名設定；圖像推導值應在程式輸出記錄推導，不冒稱人工規格。',artifacts:'expected_outputs 自行宣告 {id,type:"image"|"evidence"|"file"}；實際 save_image / save_json 必須產生同名輸出。',documentation:'自由 Markdown 設計說明，無固定欄目、逐參數填表或專用依據圖要求；舊 justification 保留引用相容性',scope:'宿主驗證執行結構、來源和真實輸出引用；算法及其邊界檢查仍需工程審核、反例與獨立圖片驗證。'},limits:{algorithmTypes:'無固定清單',execution:'每個固定節點的 backend 在方案中明確可見；Rust nativePlan 優先，Python 只作明確 fallback。',adoption:'執行不自動改寫人工答案、既有方案或正式發布。'}}}
export function algorithmRunSummaries(project){return (project.data.algorithmRuns||[]).slice(-30).map(run=>({runId:run.runId,title:run.title,mode:run.mode,isDraft:run.isDraft,status:run.status,at:run.startedAt,backend:run.backend||run.executionBackend||'python-extension',executionBackend:run.executionBackend||run.backend||'python-extension',language:run.language||((run.backend||run.executionBackend)==='rust-native'?'rust':'python'),executionPolicy:run.executionBackend==='rust-native'?'nativePlan':'python-fallback',sourceBinding:clone(run.sourceBinding),current:algorithmRunCurrent(project,run),artifacts:(run.artifacts||[]).map(({id,name,type,width,height,section})=>({id,name,type,width,height,section})),evidenceStatus:run.evidenceAudit?.status}))}
export function algorithmRunCurrent(project,run){
 if(run?.inputImpact?.status==='STALE'||run?.intentBinding&&captureBoardIntent(project,run.intentBinding.scope).snapshot!==run.intentBinding.snapshot)return false;
 const bindings=run?.sourceBinding?.images||[];return run?.sourceBinding?.schemeFingerprint===schemeFingerprint(project.data.purposeScheme)&&run?.sourceBinding?.workflowRevision===project.workflow.revision&&bindings.length>0&&bindings.every(binding=>{const image=project.imageRecord?.(binding.imageId)||project.data.images.find(image=>image.id===binding.imageId),raster=project.pixels.get(binding.imageId);if(project.imageLoadErrors?.has(binding.imageId))return false;if(binding.contentSha256)return !!image&&(image.contentSha256||image.assetRef?.sha256||image.sha256)===binding.contentSha256&&image.width===binding.width&&image.height===binding.height;return !!image&&image.sha256===binding.imageSha256&&image.width===binding.width&&image.height===binding.height&&(!raster||fingerprint(raster)===binding.pixelFingerprint)&&typeof image.dataURL==='string'&&assetFingerprint(image.dataURL)===binding.assetFingerprint});
}
function validateRequest(project,args){
 if(!text(args.title)||args.title.length>300)fail('ALGORITHM_TITLE_REQUIRED','title','需要可辨識的算法名稱。','填寫本次要解決的問題及方法。');
 const node=args.mode==='scheme'?project.data.purposeScheme?.operatorGraph?.nodes?.find(n=>n.id===args.scheme_node_id):null;
 const nativeOnly=!!(args.nativePlan||node?.nativePlan);
 if((!nativeOnly&&!text(args.code))||(typeof args.code==='string'&&args.code.length>500000))fail('ALGORITHM_CODE_REQUIRED','code',nativeOnly?'Rust nativePlan 節點可省略 Python code；請保持 nativePlan 完整。':'需要完整 Python 程式（最多 500000 字）。','使用 SDK 讀原圖與保存實算輸出；可以自行 import 和定義算法。');
 let parameters;try{parameters=JSON.parse(args.parameters_json??'{}')}catch{fail('ALGORITHM_PARAMETERS_INVALID','parameters_json','參數不是有效 JSON。','傳送 JSON 物件字串，例如 {"threshold":18}。')}
 if(!record(parameters))fail('ALGORITHM_PARAMETERS_INVALID','parameters_json','算法參數必須是 JSON 物件。','數字、陣列和其他配置放在具名參數中。');
 if(args.timeout_seconds!==undefined&&(!Number.isInteger(args.timeout_seconds)||args.timeout_seconds<1||args.timeout_seconds>600))fail('ALGORITHM_BUDGET_INVALID','timeout_seconds','本次執行時間預算需為 1–600 秒。','在本機資源預算內分階段執行或調整時間。');
 const context=algorithmContext(project,{imageIds:args.image_ids});
 if(stable(args.source)!==stable(context.source))fail('ALGORITHM_SOURCE_STALE','source','原圖或專案已改變，不能沿用舊來源執行。','重新 get_algorithm_context 並原樣傳回 source。');
 validateNodeDocumentation(args.documentation);
 const outputs=args.expected_outputs;
 if(!Array.isArray(outputs)||!outputs.length||outputs.length>48||outputs.some(output=>!record(output)||!text(output.id)||!/^[\w.-]{1,120}$/.test(output.id)||!['image','evidence','file'].includes(output.type)||output.role!==undefined&&!['result','intermediate'].includes(output.role))||new Set(outputs.map(output=>output.id)).size!==outputs.length)fail('ALGORITHM_OUTPUTS_REQUIRED','expected_outputs','需要不重複的預期圖像／數據輸出名稱（單次最多48項）。','宣告 {id:"edges",type:"image"} 或 {id:"stats",type:"evidence"}，在程式以同名 save_image/save_json 產生。');
 for(const [i,o]of outputs.entries())if(o.dataContract){const errors=dataContractIssues(o.dataContract,`expected_outputs.${i}.dataContract`);if(errors.length)throw new PipelineEvidenceContractError('DATA_CONTRACT_INVALID',{valid:false,errors},'資料契約格式錯誤。');}
 const gates=(args.justification?.boundaries||[]).filter(row=>row.check?.kind==='gate').map(row=>row.check.id),externalVisuals=visualReferences(args.justification).map(ref=>{if(ref.kind==='project-image'){const image=project.data.images?.find(item=>item.id===ref.id);return image&&{...ref,type:'image',width:image.width,height:image.height,bytes:1,sha256:image.sha256,dataURL:image.dataURL||'data:image/png;base64,AA=='}}const asset=project.data.visualInquiry?.assets?.find(item=>item.id===ref.id);return asset&&{...ref,type:'image',width:asset.width,height:asset.height,bytes:1,sha256:'0'.repeat(64),dataURL:asset.dataURL}}).filter(Boolean),proposal=validateOperationEvidenceJustification(args.justification,{nodeId:'program',requiredParameters:Object.keys(parameters).map(name=>({name,source:'agent-proposal'})),evidenceArtifacts:outputs,gateIds:gates,allowVisuals:true,evidenceVisuals:externalVisuals});
 if(!proposal.valid)throw new PipelineEvidenceContractError('ALGORITHM_EVIDENCE_PROPOSAL_REJECTED',proposal,'舊版說明的引用無效，請依錯誤補正。');
 return {context,parameters,proposal,outputs};
}
function resolveRunInputs(project,args,active){
 if(args.mode!=='scheme')return {};
 const node=project.data.purposeScheme?.operatorGraph?.nodes?.find(n=>n.id===args.scheme_node_id),resolved={};
 for(const [slot,input]of Object.entries(node?.inputs||{})){
  const supplied=args.upstream?.[slot];
  if(!supplied&&node.prerequisites?.anyOf?.includes(input.nodeId))continue;
  const parent=project.data.algorithmRuns?.find(r=>r.runId===supplied?.runId);
  const sameExecution=active?.basis===schemeFingerprint(project.data.purposeScheme)&&(isWorkpiecePlan(project.data.purposeScheme)?!!args.workpieceUnit&&stable(parent?.workpieceUnit)===stable(args.workpieceUnit):active.legacyRunIds?.has(parent?.runId));
  if(!sameExecution||!parent||parent.schemeNodeId!==input.nodeId||supplied.nodeId!==input.nodeId||supplied.artifact?.id!==input.artifactId||parent.execution?.status==='FAULT'||parent.status!=='SUCCEEDED'||parent.result?.valid===false||!algorithmRunCurrent(project,parent))
   fail('ALGORITHM_UPSTREAM_UNAVAILABLE',`inputs.${slot}`,'輸入不是目前編譯方案、同一工件的有效上游結果。','使用 run_workpiece_scheme 由平台依圖執行；不要把歷史產物或自行重算的資料冒充上游。');
  const artifact=parent.artifacts?.find(a=>a.id===input.artifactId);
  if(!artifact)fail('ALGORITHM_UPSTREAM_UNAVAILABLE',`inputs.${slot}`,'目前上游未產生所需產物。','檢查上游 execution、dataContractAudit 與實際產物，再重新執行方案。');
  resolved[slot]={nodeId:parent.schemeNodeId,runId:parent.runId,artifact};
 }
 return resolved;
}
export function auditAlgorithmRun(run,expected){
 const artifacts=run.artifacts||[],checks=Array.isArray(run.result?.boundaryChecks)?run.result.boundaryChecks:[],errors=[];
 errors.push(...(run.dataContractAudit?.errors||[]));
 const authored=validateOperationEvidenceJustification(run.justification,{nodeId:'program',requiredParameters:Object.keys(run.parameters||{}).map(name=>({name,source:'agent-proposal'})),evidenceArtifacts:artifacts.map(artifact=>({...artifact,type:artifact.type==='json'?'evidence':artifact.type})),gateIds:checks.map(check=>check.id),allowVisuals:true,requireVisualPixels:true,evidenceVisuals:run.evidenceVisuals||[]});
 // Full root proposal validation happens before dispatch. At delivery add only
 // visual validation here; raw Python/legacy runs may carry helper dictionaries
 // in parameters without declaring them as independently authored CV settings.
 errors.push(...authored.errors.filter(error=>['EVIDENCE_VISUALS_INVALID','EVIDENCE_VISUAL_UNAVAILABLE','EVIDENCE_CAPTION_REQUIRED'].includes(error.code)||error.path?.includes('.visuals[')));
 const resolve=(selector,path)=>{
  if(!selector)return;
  if(selector.kind==='execution-status'){if(run.status!=='SUCCEEDED')errors.push({path,message:'程式未成功完成'});return}
  if(selector.kind==='artifact'){if(!artifacts.some(artifact=>(artifact.type==='json'?'evidence':artifact.type)===selector.type&&(!selector.id||artifact.id===selector.id)))errors.push({path,message:'未產生所引用的實際輸出'});return}
  const check=checks.find(check=>check.id===selector.id);if(!check||!['PASS','FAIL','NOT_EVALUATED'].includes(check.status))errors.push({path,message:'程式未回傳有效邊界觀察'});
  else if(check.status!=='PASS')errors.push({path,message:`邊界自檢 ${check.status}，保留拒因或未知`});
  else if(!Object.hasOwn(check,'actual')||!Object.hasOwn(check,'threshold'))errors.push({path,message:'邊界自檢需保存實際觀察 actual 與比較條件 threshold，不以 PASS 文字代替'});
 };
 for(const output of expected)if(!artifacts.some(artifact=>artifact.id===output.id&&(artifact.type==='json'?'evidence':artifact.type)===output.type))errors.push({path:`expected_outputs.${output.id}`,message:'預期產物未產生'});
 (run.justification?.tool?.expectedEvidence||[]).forEach((selector,index)=>resolve(selector,`tool.expectedEvidence.${index}`));
 (run.justification?.parameters||[]).forEach(row=>resolve(row.verification,`parameters.${row.name}.verification`));
 (run.justification?.boundaries||[]).forEach((row,index)=>resolve(row.check,`boundaries.${index}.check`));
 const procedureAudit=auditAlgorithmProcedureTrace(run);errors.push(...procedureAudit.errors);
 return {schema:'agentcv-algorithm-evidence-audit-1',procedureStatus:procedureAudit.status,procedureAudit,status:run.status==='SUCCEEDED'&&run.execution?.status!=='FAULT'&&!errors.length?'READY_FOR_REVIEW':'DIAGNOSTIC_ONLY',delivered:false,errors,scope:'保存的程式自檢及產物引用核對；不是獨立精度驗證、人工採用或正式發布。'};
}

export function findReusableAlgorithmRun(project,{mode='draft',schemeNodeId=null,code='',parameters={},sourceBinding,expectedOutputs,workpieceUnit}={}){
 if(workpieceUnit)return null;const runs=[...(project.data.algorithmRuns||[])].reverse();
 const key=value=>stable(value);
 return runs.find(run=>run.status==='SUCCEEDED'&&run.mode===mode&&(run.schemeNodeId||null)===(schemeNodeId||null)&&run.code===code&&key(run.parameters||{})===key(parameters||{})&&key(run.sourceBinding||{})===key(sourceBinding||{})&&key(run.expectedOutputs||[])===key(expectedOutputs||[])&&algorithmRunCurrent(project,run))||null;
}
export async function runAlgorithm(project,args,execute){
 const ids=args.image_ids??[project.image?.id];
 if(project.withImagePixels)return project.withImagePixels(ids,()=>runAlgorithmLoaded(project,args,execute));
 if(project.ensureImagePixels)for(const id of ids)await project.ensureImagePixels(id);
 return runAlgorithmLoaded(project,args,execute);
}
async function runAlgorithmLoaded(project,args,execute){
 const phaseStart=performance.now();
 if(locks.has(project))throw Error('目前已有算法程式正在執行');
 const mode=args.mode || (project.data.purposeScheme ? 'scheme' : 'draft');
 if(!['scheme','draft'].includes(mode))fail('ALGORITHM_MODE_INVALID','mode','无效运行模式。','使用 scheme 或 draft。');
 const active=compiledSessions.get(project);
 const compilation=active&&active.basis===schemeFingerprint(project.data.purposeScheme)?active.compilation:compileScheme(project.data.purposeScheme || {},{mode,policy:'strict'});
 if(!compilation.ok)throw new PipelineEvidenceContractError('SCHEME_COMPILE_FAILED',{valid:false,status:'MISSING',errors:compilation.errors},'方案编译失败，未执行。');
 let schemeNode=null;
 if(mode==='scheme') {
   const node=project.data.purposeScheme.operatorGraph.nodes.find(n=>n.id===args.scheme_node_id);schemeNode=node;
   const canonical=isWorkpiecePlan(project.data.purposeScheme);
   if(!node || node.code!==args.code || stable(node.parameters||{})!==stable(JSON.parse(args.parameters_json||'{}')) || (!canonical&&stable(node.source)!==stable(args.source)) || stable(node.expected_outputs)!==stable(args.expected_outputs))
     fail('SCHEME_EXECUTION_MISMATCH','scheme_node_id','运行请求与已编译节点不一致。','通过方案运行入口执行已保存的节点。');
 }
 const {context,parameters,proposal,outputs}=validateRequest(project,args),visualEvidence=await resolveEvidenceVisuals(project,args.justification),data=project.data,epoch=project.epoch;
 const reusable=findReusableAlgorithmRun(project,{mode,schemeNodeId:args.scheme_node_id,code:args.code||'',parameters,sourceBinding:context.source,expectedOutputs:outputs,workpieceUnit:args.workpieceUnit});if(reusable){return {...clone(reusable),reused:true,reusedAt:new Date().toISOString()};}
 const upstream=resolveRunInputs(project,{...args,mode},active);
 const nativeSpec=schemeNode?.nativePlan||args.nativePlan||null;
 locks.add(project);
 try{
  const inputs=await Promise.all(context.images.map(async image=>{const original=project.imageRecord?.(image.id)||project.data.images.find(item=>item.id===image.id);return {id:image.id,name:image.name,...(args.fileBackedInputs&&active&&mode==='scheme'&&original.assetRef?{assetRef:clone(original.assetRef)}:{dataUrl:project.readImageAsset?await project.readImageAsset(image.id):original.dataURL}),width:image.width,height:image.height,source:context.source.images.find(binding=>binding.imageId===image.id)}}));
  const nativePipeline=nativeSpec?{backend:'rust-native',plan:clone(nativeSpec.plan||nativeSpec),image:context.images.map(image=>{const raster=project.pixels.get(image.id);return nativeGrayImage(raster,{id:image.id,sha256:image.sha256,sourceSha256:image.contentSha256||image.sha256});})}:null;
  const hostStart=performance.now();
  const response=await execute({...(active&&mode==='scheme'?{runtimePlan:{fingerprint:active.basis,nodeId:args.scheme_node_id,definition:clone(project.data.purposeScheme)}}:{}),...(nativePipeline?{nativePipeline}:{}),upstream,artifactMode:args.artifactMode,workpieceUnit:clone(args.workpieceUnit),referenceInputs:clone(args.referenceInputs||{}),visualEvidence:clone(visualEvidence),title:mode==='draft'?'DRAFT · '+args.title:args.title,mode,isDraft:mode==='draft',code:args.code,parameters,images:inputs,sourceBinding:context.source,justification:clone(args.justification),documentation:args.documentation??schemeNode?.documentation,expectedOutputs:clone(outputs),proposalAudit:clone(proposal),inputContext:{calibration:clone(context.calibration),targets:clone(context.targets)},timeoutSeconds:args.timeout_seconds??120});
  const returnedAt=performance.now();
  if(project.data!==data||project.epoch!==epoch||JSON.stringify(algorithmContext(project,{imageIds:context.images.map(image=>image.id)}).source)!==JSON.stringify(context.source))fail('ALGORITHM_SOURCE_CHANGED','source','執行期間原圖或專案已改變，結果僅留在執行目錄，不作當前專案結果。','重新讀取來源後重跑。');
  if(!text(response?.runId)||!['SUCCEEDED','FAILED','TIMEOUT'].includes(response.status)||!Array.isArray(response.artifacts))throw Error('算法執行器沒有回傳有效運算記錄');
  if(response.dispatchSourceBinding&&stable(response.dispatchSourceBinding)!==stable(context.source))fail('ALGORITHM_DISPATCH_MISMATCH','source','執行器的派發來源與目前請求不一致。','重新核對運算來源，保留原紀錄並重跑。');
  const run={...response,artifactMode:args.artifactMode??response.artifactMode,schema:'agentcv-algorithm-run-1',evidenceVisuals:clone(response.visualEvidence||visualEvidence),title:mode==='draft'?'DRAFT · '+args.title:args.title,mode,isDraft:mode==='draft',compilation:clone(compilation),code:args.code||'/* nativePlan: rust-native */',codeKind:args.code?'python':'native-plan',language:response.backend==='rust-native'?'rust':'python',executionBackend:response.backend||'python-extension',parameters,sourceBinding:clone(context.source),source:clone(context.source.images[0]),inputContext:{calibration:clone(context.calibration),targets:clone(context.targets)},justification:clone(args.justification),documentation:args.documentation??schemeNode?.documentation,expectedOutputs:clone(outputs),proposalAudit:proposal,stage:'TRIAL',author:'agent',humanConfirmed:false};
  run.timing={...run.timing,hostExecutionMs:performance.now()-hostStart,clock:'monotonic',scope:'host wall elapsed from dispatch to returned verified output, including scheduling delay; excludes input read and subsequent audit/event rendering'};
  run.execution||={status:run.status==='SUCCEEDED'?'COMPLETED':'FAULT',reason:run.status==='TIMEOUT'?'TIMEOUT':run.status==='FAILED'?'RUNTIME_FAILURE':undefined};
  if(args.workpieceUnit)run.workpieceUnit=clone(args.workpieceUnit);
  if(args.referenceInputs)run.referenceInputs=clone(args.referenceInputs);
  if(mode==='scheme')run.schemeNodeId=args.scheme_node_id;
  run.dataContractAudit=auditDataContracts(run,outputs,{scheme:project.data.purposeScheme,upstream});
  if(!run.dataContractAudit.valid&&run.execution.status!=='FAULT')run.execution={status:'FAULT',reason:'OUTPUT_CONTRACT_VIOLATION',errors:clone(run.dataContractAudit.errors)};
  if(run.dataContractAudit.valid)for(const artifact of run.artifacts){const binding=run.dataContractAudit.bindings[artifact.id];if(binding)artifact.contractBinding=clone(binding);}
  run.evidenceAudit=auditAlgorithmRun(run,outputs);
  if(mode==='draft'){run.result={...run.result,mode:'draft',status:'DRAFT'};run.delivered=false;}
  if(mode==='scheme')run.schemeNodeId=args.scheme_node_id;
  const auditFinishedAt=performance.now();
  if(!compiledSessions.has(project))project.checkpoint();project.data.algorithmRuns||=[];project.data.algorithmRuns.push(run);project.event('algorithm_program_executed',{runId:run.runId,title:run.title,status:run.status,evidenceStatus:run.evidenceAudit.status,source:clone(context.source)});
  const publishedAt=performance.now();
  run.timing.hostPhases={clock:'monotonic',preparationMs:hostStart-phaseStart,dispatchMs:returnedAt-hostStart,auditMs:auditFinishedAt-returnedAt,publishMs:publishedAt-auditFinishedAt,totalMs:publishedAt-phaseStart,scope:'exclusive sequential host spans; publish includes synchronous project listeners and UI work; dispatch includes native bridge and process'};
  return run;
 }finally{locks.delete(project)}
}
export function readAlgorithmRun(project,runId){
 const run=(project.data.algorithmRuns||[]).find(run=>run.runId===runId)||(runId?null:project.data.algorithmRuns?.at(-1));if(!run)throw Error('尚無這筆算法運算紀錄');
 const described=describeAlgorithmRun(project,run),unitId=run.workpieceUnit?.id;
 if(unitId&&Array.isArray(described.artifacts))described.artifacts=described.artifacts.map(artifact=>{const dataURL=artifact.dataURL||artifact.dataUrl||workpieceArtifactPixel(project,unitId,run.runId,artifact.id);return dataURL?{...artifact,dataURL,dataUrl:dataURL}:artifact;});
 return described;
}
export function describeAlgorithmRun(project,run){
 return {...clone(effectiveAlgorithmRun(run)),explanationRevision:(run.evidenceRevisions||[]).length,current:algorithmRunCurrent(project,run),scope:'程式運算與實際產物；是否適合正式檢測仍須審查。'};
}
function compactProcedureValue(value,path,budget={remaining:6000},depth=0){
 const readWith=`get_algorithm_run(path="${path}", offset=0, limit=32)`;
 if(budget.remaining<80||depth>5)return {omitted:true,readWith};
 if(typeof value==='string'){const size=Math.min(1200,budget.remaining);budget.remaining-=Math.min(value.length,size);return value.length>size?{kind:'string',length:value.length,preview:value.slice(0,size),readWith}:value;}
 if(value===null||typeof value!=='object'){budget.remaining-=24;return value;}
 if(Array.isArray(value)){const preview=value.slice(0,8).map((item,i)=>compactProcedureValue(item,`${path}.${i}`,budget,depth+1));return value.length>8?{kind:'array',count:value.length,preview,readWith}:preview;}
 const keys=Object.keys(value),out={};for(const key of keys.slice(0,16)){budget.remaining-=key.length;out[key]=compactProcedureValue(value[key],`${path}.${key}`,budget,depth+1);}
 if(keys.length>16){out.__remainingKeys=keys.length-16;out.__readWith=readWith;}return out;
}
function compactProcedureTrace(trace){
 if(!record(trace)||!Array.isArray(trace.nodes))return compactProcedureValue(trace,'procedureTrace');
 const fields=['id','instanceId','parentId','parentInstanceId','name','kind','dependsOn','dependencyInstances','status','judgement','artifactIds','startedAt','finishedAt','durationMs','skipReason','error','condition','explanationParameterNotes','explanationEvidenceGap','inputs','declaredOutputs','outputs','parameters','parameterSources','justification','documentation'];
 const budget={remaining:8000};
 return {schema:trace.schema,nodes:trace.nodes.slice(0,24).map((node,index)=>{if(budget.remaining<80)return {id:node.id,instanceId:node.instanceId,name:node.name,status:node.status,durationMs:node.durationMs,readWith:`get_algorithm_run(path="procedureTrace.nodes.${index}")`};return Object.fromEntries(fields.filter(key=>node?.[key]!==undefined).map(key=>[key,compactProcedureValue(node[key],`procedureTrace.nodes.${index}.${key}`,budget)]));}),nodesTotal:trace.nodes.length,nodesTruncated:trace.nodes.length>24,readWith:'get_algorithm_run(path="procedureTrace.nodes", offset=24, limit=16); use deeper paths for exact inputs/outputs/parameters'};
}
export function compactAlgorithmRun(run,{includeCode=false}={}){
 const result=clone(run);if(!includeCode)delete result.code;
 result.artifacts=(result.artifacts||[]).map(({dataUrl,dataURL,data,...artifact})=>({...artifact,...(data===undefined?{}:{dataSummary:{kind:Array.isArray(data)?'array':typeof data,count:Array.isArray(data)?data.length:record(data)?Object.keys(data).length:null,keys:record(data)?Object.keys(data).slice(0,32):undefined,readWith:'get_algorithm_run(artifact_id, path, offset, limit)'}})}));
 const summarize=(value,depth=0)=>{
  if(typeof value==='string')return value.length>12000?value.slice(0,12000)+'\n[後續內容保存在運算記錄，使用 get_algorithm_run 分頁讀取]':value;
  if(!value||typeof value!=='object')return value;
  if(depth>7)return {omitted:true,readWith:'get_algorithm_run(path)'};
  if(Array.isArray(value))return value.length>16?{kind:'array',count:value.length,preview:value.slice(0,8).map(item=>summarize(item,depth+1)),readWith:'get_algorithm_run(path, offset, limit)'}:value.map(item=>summarize(item,depth+1));
  const entries=Object.entries(value);return Object.fromEntries([...entries.slice(0,48).map(([key,item])=>[key,summarize(item,depth+1)]),...(entries.length>48?[['__remainingKeys',entries.length-48]]:[])]);
 };
 if(result.procedureTrace!==undefined)result.procedureTrace=compactProcedureTrace(result.procedureTrace);
 if(result.structuredLayers!==undefined)result.structuredLayers=compactProcedureValue(result.structuredLayers,'structuredLayers',{remaining:2500});
 if(result.evidenceAudit?.procedureAudit){const audit=result.evidenceAudit.procedureAudit;result.evidenceAudit.errors=compactProcedureValue(result.evidenceAudit.errors,'evidenceAudit.errors',{remaining:12000});result.evidenceAudit.procedureAudit={...audit,nodes:compactProcedureValue(audit.nodes,'evidenceAudit.procedureAudit.nodes',{remaining:12000}),errors:compactProcedureValue(audit.errors,'evidenceAudit.procedureAudit.errors',{remaining:12000})};}
 for(const key of ['result','parameters','inputContext','stdout','stderr','traceback'])if(result[key]!==undefined)result[key]=summarize(result[key]);
 return result;
}
// Per-unit reads are an index, not another copy of every node's complete trace.
export function algorithmRunIndex(run){
 const keys=['runId','title','schemeNodeId','mode','status','execution','startedAt','finishedAt','durationMs','sourceBinding','codeSha256','current'];
 return {...Object.fromEntries(keys.filter(key=>run[key]!==undefined).map(key=>[key,clone(run[key])])),
  result:compactProcedureValue(run.result,'result',{remaining:1800}),
  evidenceAudit:{status:run.evidenceAudit?.status,procedureStatus:run.evidenceAudit?.procedureStatus,errors:run.evidenceAudit?.errors?.length||0,readWith:'get_algorithm_run(path="evidenceAudit")'},
  artifacts:(run.artifacts||[]).map(a=>Object.fromEntries(['id','name','type','role','width','height','sha256'].filter(k=>a[k]!==undefined).map(k=>[k,a[k]]))),
  procedureTrace:{nodeCount:run.procedureTrace?.nodes?.length||0,readWith:'get_algorithm_run(path="procedureTrace.nodes", offset=0, limit=8)'},
  structuredLayers:{layerCount:run.structuredLayers?.length||0,readWith:'get_algorithm_run(path="structuredLayers", offset=0, limit=4)'},
  readWith:'get_algorithm_run(run_id, reference_json) for details; use artifact_id/path/offset/limit for exact data'};
}
export function readAlgorithmData(project,{runId,artifactId,path='',offset=0,limit=32}={}){
 return readAlgorithmRunData(readAlgorithmRun(project,runId),{artifactId,path,offset,limit});
}
export function readAlgorithmRunData(run,{artifactId,path='',offset=0,limit=32}={}){
 let value=run;
 if(artifactId){const artifact=run.artifacts.find(artifact=>artifact.id===artifactId);if(!artifact)throw Error('算法產物不存在');value=artifact.data??{id:artifact.id,type:artifact.type,path:artifact.path,width:artifact.width,height:artifact.height,sha256:artifact.sha256};}
 if(typeof path!=='string'||path.length>1000||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>16000)throw Error('請使用有效資料路徑、offset 與 limit（1–16000）');
 for(const key of path.split('.').filter(Boolean)){if(!value||!Object.hasOwn(value,key)||['__proto__','constructor','prototype'].includes(key))throw Error('資料路徑不存在，請先讀取上一層可用欄位');value=value[key];}
 const base={runId:run.runId,sourceBinding:run.sourceBinding,artifactId:artifactId||null,path,offset,current:run.current};
 if(typeof value==='string')return {...base,type:'string',total:value.length,count:Math.min(limit,Math.max(0,value.length-offset)),value:value.slice(offset,offset+limit)};
 const count=Math.min(limit,128),bounded=value=>{if(Array.isArray(value)&&value.length>128)return {type:'array',length:value.length,readWith:'get_algorithm_run deeper path'};if(record(value)&&JSON.stringify(value).length>20000)return {type:'object',keys:Object.keys(value),...Object.fromEntries(['id','instanceId','name','status','judgement'].filter(key=>typeof value[key]==='string'||value[key]===null).map(key=>[key,typeof value[key]==='string'?value[key].slice(0,1200):value[key]])),readWith:'get_algorithm_run deeper path'};return value};
 if(Array.isArray(value))return {...base,type:'array',total:value.length,count:value.slice(offset,offset+count).length,items:value.slice(offset,offset+count).map(bounded)};
 if(record(value)){const entries=Object.entries(value).slice(offset,offset+count);return {...base,type:'object',total:Object.keys(value).length,count:entries.length,value:Object.fromEntries(entries.map(([key,item])=>[key,bounded(item)]))};}
 return {...base,type:typeof value,value};
}
export function prepareAlgorithmRuns(data){
 if(data.algorithmRuns===undefined){data.algorithmRuns=[];return}
 if(!Array.isArray(data.algorithmRuns)||data.algorithmRuns.length>1000)throw Error('算法運算紀錄格式錯誤或數量超出單一專案保存範圍');
 const ids=new Set();for(const run of data.algorithmRuns){if(!record(run)||!text(run.runId)||ids.has(run.runId)||!text(run.code)||!Array.isArray(run.artifacts)||!Array.isArray(run.sourceBinding?.images)||!['SUCCEEDED','FAILED','TIMEOUT'].includes(run.status))throw Error('算法運算紀錄缺少程式、來源或有效狀態');ids.add(run.runId);prepareAlgorithmEvidenceRevisions(run);for(const artifact of run.artifacts)if(!record(artifact)||!text(artifact.id)||!text(artifact.type))throw Error('算法產物紀錄格式錯誤');}
}

// The same executor is used by the UI and Agent. Every result row is bound to
// one original image; a dataset-wide scalar can never stand in for each case.
const pathValue=(data,path)=>String(path||'').split('.').filter(Boolean).reduce((v,k)=>v&&Object.hasOwn(v,k)&&!['__proto__','prototype','constructor'].includes(k)?v[k]:undefined,data);
function resolveCaseImage(project,reference){const exact=project.data.images.find(i=>i.id===reference);if(exact)return exact;const matches=project.data.images.filter(i=>[i.source_path,i.name,i.sha256].includes(reference));return matches.length===1?matches[0]:null;}
function boundRow(project,run,node,artifactId,imageId){
 const artifact=run?.artifacts.find(a=>a.id===artifactId),data=artifact?.data;
 if(!run||!run.sourceBinding.images.some(i=>i.imageId===imageId)||!data)return {reason:'IMAGE_OR_EVIDENCE_UNAVAILABLE',data:null};
 const rowsPath=node.outputContract?.case_outputs;
 if(!rowsPath){
  // A template+scene localization can have several prerequisite images but one
  // explicitly known target case. Bind its scalar result only to that target.
  const targets=[...new Set((project.data.purposeScheme?.acceptanceCard?.cases||[]).map(c=>resolveCaseImage(project,c.imageRef)?.id).filter(id=>run.sourceBinding.images.some(i=>i.imageId===id)))];
  const target=node.outputContract?.target_image_id||(run.sourceBinding.images.length===1?run.sourceBinding.images[0].imageId:targets.length===1?targets[0]:null);
  return target===imageId?{data}:{data:null,reason:target?'REFERENCE_IMAGE_NOT_A_TARGET':'BATCH_OUTPUT_CONTRACT_REQUIRED'};
 }
 const rows=pathValue(data,rowsPath),idPath=node.outputContract.case_image_id||'imageId';
 if(!Array.isArray(rows))return {data:null,reason:'BATCH_ROWS_MISSING'};
 const ids=rows.map(row=>pathValue(row,idPath)),known=new Set(run.sourceBinding.images.map(i=>i.imageId));
 if(ids.some(id=>typeof id!=='string'||!known.has(id))||new Set(ids).size!==ids.length)return {data:null,reason:'BATCH_IMAGE_BINDING_INVALID'};
 const row=rows.find(row=>pathValue(row,idPath)===imageId);return row?{data:row}:{data:null,reason:'BATCH_IMAGE_ROW_MISSING'};
}
function itemObservation(item,node,data){
 if(!data)return {actual:null,rulePass:null,classification:'UNKNOWN',reason:'EVIDENCE_ROW_UNAVAILABLE'};
 const field=item.output==='ok_ng'?'classification':node.outputContract?.[item.output],actual=pathValue(data,field);
 let rulePass=item.output==='ok_ng'?evaluatePurposeRule(item.rule.pass_when,data):item.output==='numeric'?(Number.isFinite(actual)?Math.abs(actual-item.rule.nominal)<=(item.rule.tol_abs??Math.abs(item.rule.nominal)*item.rule.tol_pct/100):null):typeof actual==='string'?item.rule.allowed_labels.includes(actual):null;
 if(rulePass===null)return {actual:actual??null,rulePass,classification:'UNKNOWN',reason:'REQUIRED_METRIC_UNAVAILABLE'};
 const classification=rulePass?'OK':'NG';
 if(item.output==='ok_ng'&&actual!==classification)return {actual:actual??null,rulePass,classification:'UNKNOWN',reason:'DECLARED_VERDICT_CONTRADICTS_RULE'};
 return {actual,rulePass,classification,reason:null};
}
const aggregateClassifications=values=>values.includes('NG')?'NG':values.length&&values.every(v=>v==='OK')?'OK':'UNKNOWN';
export async function runPurposeScheme(project,execute,options={}){
 if(isWorkpiecePlan(project.data.purposeScheme))return runDatasetScheme(project,execute,options);
 if(project.ensureImagePixels)for(const node of project.data.purposeScheme?.operatorGraph?.nodes||[])for(const binding of node.source?.images||[])await project.ensureImagePixels(binding.imageId);
 const compilation=compileScheme(project.data.purposeScheme || {},{mode:'scheme',policy:'strict'});
 if(!compilation.ok)throw new PipelineEvidenceContractError('SCHEME_COMPILE_FAILED',{valid:false,status:'MISSING',errors:compilation.errors},'方案編譯失敗，未執行；先讀 get_purpose_scheme_capabilities 並依 errors 的 path/hint 修正。');
 if(compiledSessions.has(project))throw Error('目前已有方案正在執行');
 const releaseSession=beginCompiledSession(project,compilation);compiledSessions.get(project).legacyRunIds=new Set();
 try{
 const scheme=clone(project.data.purposeScheme),pending=[...scheme.operatorGraph.nodes],completed=new Set(),runs=[],blockedNodes=[],boundaryDecisions=[];
 const basis=schemeFingerprint(scheme),epoch=project.epoch;
 // Reject stale source/metadata and ambiguous cases before any Python dispatch.
 for(const c of scheme.acceptanceCard.cases)if(!resolveCaseImage(project,c.imageRef))fail('ACCEPTANCE_IMAGE_UNAVAILABLE',`acceptanceCard.cases.${c.id}.imageRef`,'案例原圖不存在或引用不唯一。','使用目前專案真實且唯一的 image ID。');
 for(const node of pending)validateRequest(project,{mode:'scheme',scheme_node_id:node.id,title:node.title||node.id,code:node.code,nativePlan:node.nativePlan,parameters_json:JSON.stringify(node.parameters||{}),source:node.source,image_ids:node.source.images?.map(i=>i.imageId),expected_outputs:node.expected_outputs,justification:node.justification});
 while(pending.length){
   if(project.epoch!==epoch||schemeFingerprint(project.data.purposeScheme)!==basis)fail('SCHEME_CHANGED_DURING_EXECUTION','scheme','執行期間方案或專案已改變。','保留已完成歷史，重新讀取及編譯後再跑。');
   const index=pending.findIndex(n=>(scheme.operatorGraph.edges||[]).filter(e=>e.to===n.id).every(e=>completed.has(e.from)));
   if(index<0)throw Error('方案依賴無法排序；未生成虛構運算。');
   const node=pending.splice(index,1)[0],parents=(scheme.operatorGraph.edges||[]).filter(e=>e.to===node.id).map(e=>e.from);
   if(parents.some(id=>!runs.some(r=>r.schemeNodeId===id&&r.status==='SUCCEEDED'&&r.execution?.status!=='FAULT'&&r.result?.valid!==false))){blockedNodes.push({nodeId:node.id,reason:'UPSTREAM_UNAVAILABLE',dependsOn:parents});completed.add(node.id);continue;}
   const upstream={};let missingInput=false;
   for(const [slot,input]of Object.entries(node.inputs||{})){const parent=runs.find(r=>r.schemeNodeId===input.nodeId),artifact=parent?.artifacts.find(a=>a.id===input.artifactId);if(!artifact){missingInput=true;break}upstream[slot]={nodeId:input.nodeId,runId:parent.runId,artifact:clone(artifact)};}
   if(missingInput){blockedNodes.push({nodeId:node.id,reason:'UPSTREAM_ARTIFACT_UNAVAILABLE'});completed.add(node.id);continue;}
   const run=await runAlgorithm(project,{mode:'scheme',scheme_node_id:node.id,title:node.title||node.id,code:node.code,parameters_json:JSON.stringify(node.parameters||{}),source:node.source,image_ids:node.source.images.map(i=>i.imageId),expected_outputs:node.expected_outputs,justification:node.justification,documentation:node.documentation,upstream},execute);
   compiledSessions.get(project).legacyRunIds.add(run.runId);runs.push(run);completed.add(node.id);
 }
 const imageIds=[...new Set(scheme.operatorGraph.nodes.flatMap(node=>{const sources=node.source.images.map(i=>i.imageId);if(node.outputContract?.case_outputs)return sources;const targets=[...new Set(scheme.acceptanceCard.cases.map(c=>resolveCaseImage(project,c.imageRef)?.id).filter(id=>sources.includes(id)))];return node.outputContract?.target_image_id?[node.outputContract.target_image_id]:targets.length===1?targets:sources;}))];
 const applicabilityCache=new Map();
 const applicable=(nodeId,imageId)=>{
  const cacheId=nodeId+'::'+imageId;if(applicabilityCache.has(cacheId))return applicabilityCache.get(cacheId);
  const node=scheme.operatorGraph.nodes.find(n=>n.id===nodeId),run=runs.find(r=>r.schemeNodeId===nodeId);
  let usable=!!(run?.status==='SUCCEEDED'&&algorithmRunCurrent(project,run)&&run.evidenceAudit.status==='READY_FOR_REVIEW');
  for(const [index,boundary]of (node.justification?.boundaries||[]).entries())if(boundary.pass_when!==undefined){
   const boundaryData=boundary.check.kind==='artifact'?(run?.sourceBinding.images.some(i=>i.imageId===imageId)?boundRow(project,run,node,boundary.check.id,imageId).data:run?.artifacts.find(a=>a.id===boundary.check.id)?.data):run?.result;
   const passed=evaluatePurposeRule(boundary.pass_when,boundaryData);boundaryDecisions.push({imageId,nodeId,index,passed,onFailure:boundary.onFailure,action:passed===true?'CONTINUE':boundary.onFailure});if(passed!==true)usable=false;
  }
  for(const parent of (scheme.operatorGraph.edges||[]).filter(e=>e.to===nodeId).map(e=>e.from))if(!applicable(parent,imageId))usable=false;
  applicabilityCache.set(cacheId,usable);return usable;
 };
 const imageJudgements=imageIds.map(imageId=>{
  const items=scheme.purposeCard.items.map(item=>{
   const evidence=scheme.evidenceBindings.filter(b=>b.purposeItemId===item.id).map(binding=>{
    const node=scheme.operatorGraph.nodes.find(n=>n.id===binding.operatorNodeId),run=runs.find(r=>r.schemeNodeId===node.id),row=boundRow(project,run,node,binding.evidenceArtifactId,imageId),observation=itemObservation(item,node,row.data);
    const usable=applicable(node.id,imageId);
    return {nodeId:node.id,artifactId:binding.evidenceArtifactId,runId:run?.runId,...observation,classification:usable?observation.classification:'UNKNOWN',reason:row.reason||(!usable?'SOURCE_EXECUTION_OR_APPLICABILITY_UNAVAILABLE':observation.reason)};
   });
   return {itemId:item.id,evidence,classification:aggregateClassifications(evidence.map(e=>e.classification))};
  });
  return {imageId,imageName:project.data.images.find(i=>i.id===imageId)?.name,classification:aggregateClassifications(items.map(i=>i.classification)),items};
 });
 const acceptance=[];
 for(const c of scheme.acceptanceCard.cases){const image=resolveCaseImage(project,c.imageRef),imageResult=imageJudgements.find(i=>i.imageId===image.id);
  for(const item of scheme.purposeCard.items){const observed=imageResult?.items.find(i=>i.itemId===item.id),expected=c.expectedOutputs[item.id];
   for(const evidence of observed?.evidence||[{classification:'UNKNOWN',reason:'CASE_IMAGE_NOT_EXECUTED'}]){
    const actual=evidence.actual??null,comparable=evidence.classification!=='UNKNOWN';
    const match=item.output==='ok_ng'?evidence.classification===expected:item.output==='numeric'?Number.isFinite(actual)&&Math.abs(actual-expected)<=(item.rule.tol_abs??Math.abs(expected)*item.rule.tol_pct/100):actual===expected;
    acceptance.push({caseId:c.id,imageId:image.id,itemId:item.id,nodeId:evidence.nodeId,runId:evidence.runId,artifactId:evidence.artifactId,actual,expected,classification:evidence.classification,rulePass:evidence.rulePass??null,status:!comparable?'NOT_EVALUATED':match?'PASS':'FAIL',reason:evidence.reason});
   }
  }
 }
 const counts={OK:0,NG:0,UNKNOWN:0};for(const image of imageJudgements)counts[image.classification]++;
 const items=scheme.purposeCard.items.map(item=>({itemId:item.id,classification:aggregateClassifications(imageJudgements.map(image=>image.items.find(i=>i.itemId===item.id)?.classification||'UNKNOWN')),evidence:imageJudgements.flatMap(image=>image.items.find(i=>i.itemId===item.id)?.evidence.map(e=>({...e,imageId:image.imageId}))||[])}));
 const evaluation={schema:'agentcv-purpose-acceptance-2',schemeFingerprint:basis,runIds:runs.map(r=>r.runId),cases:acceptance,status:acceptance.length&&acceptance.every(c=>c.status==='PASS')?'PASS':'NOT_ACCEPTED',blockedNodes,
  judgement:{classification:aggregateClassifications(imageJudgements.map(i=>i.classification)),images:imageJudgements,counts,items,boundaryDecisions,scope:scheme.purposeCard.items.map(i=>i.label).join('; '),meaning:'逐圖目的規則判定；整批摘要不代表每張產品合格。案例PASS只代表已知案例比對，不代表獨立精度驗收或發布。'},humanConfirmed:false,delivered:false};
 project.mutate('purpose_scheme_evaluated',()=>{project.data.purposeAcceptance=evaluation;},{schemeFingerprint:basis,runIds:evaluation.runIds,caseStatus:evaluation.status,imageCounts:counts});
 return {compilation,runs,acceptance:evaluation,scope:'真實圖像集逐圖分析及已知案例回歸；不是獨立精度驗證或人工發布。'};
 }finally{releaseSession();}
}
