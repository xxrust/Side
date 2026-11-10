import {createPipelinePlan,validatePipeline,getPipelineCapabilities,referenceOf} from './pipeline-registry.js';
import {PipelineExecutor} from './pipeline-executor.js';
import {isPipelineResultCurrent as pixelsMatch,pipelinePixelFingerprint,pipelineFingerprint} from './pipeline-runtime.js';
import {assertPipelineEvidenceProposal,validatePipelineEvidenceProposal,assertPipelineEvidenceDelivery,auditPipelineEvidenceDelivery,PipelineEvidenceContractError} from './pipeline-evidence-contract.js';

const copy=x=>JSON.parse(JSON.stringify(x));
const stamp=()=>new Date().toISOString();
const planSignature=p=>JSON.stringify({schema:p?.schema,id:p?.id,revision:p?.revision,nodes:p?.nodes});
// Decoder completion is cache state, not a source edit. Native and real inline
// sources already have an encoded-byte identity before their first pixel decode.
const dependencySignature=project=>project.signature();
const denseKeys=new Set(['supportPoints','residuals','outerContour','outerContours','boundary','radialCurve','mask','runs','peakIndices','points','evidence','artifacts']);
function compact(value){if(Array.isArray(value))return value.slice(0,24).map(compact);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!denseKeys.has(key)).map(([key,v])=>[key,compact(v)]));return value;}
const auditSummary=audit=>audit?{schema:audit.schema,phase:audit.phase,status:audit.status,delivered:audit.delivered===true,legacy:audit.legacy===true,proposalStatus:audit.proposalStatus,actualEvidence:audit.actualEvidence,binding:audit.binding,errorCount:audit.errors?.length||0,errors:(audit.errors||[]).slice(0,4).map(({code,nodeId,path,message,hint})=>({code,nodeId,path,message:message?.slice(0,160),hint:hint?.slice(0,180)})),blockers:(audit.blockers||[]).slice(0,4),nodes:(audit.nodes||[]).map(node=>({nodeId:node.nodeId,status:node.status,delivered:node.delivered===true,sections:Object.fromEntries(Object.entries(node.sections||{}).map(([key,value])=>[key,{status:value.status,errorCount:value.errors?.length||0,rowCount:value.rows?.length}]))})),detailsPath:'deliveryAudit'}:null;
const coordinates={origin:'原圖左上角',x:'向右為正',y:'向下為正',lengthUnit:'px',angleUnit:'rad',angleZero:'+x（向右）',anglePositive:'在影像座標中順時針',transform:'原圖座標；未套用跨圖姿態變換'};
const summary=r=>r?{status:r.status,reason:r.reason,runId:r.runId,inputIdentity:r.inputIdentity,coordinateSystem:r.coordinateSystem,measurements:compact(r.measurements),classification:r.classification,deliveryAudit:auditSummary(r.deliveryAudit),nodes:r.nodes?.map(n=>({id:n.id,op:n.op,status:n.status,featureStatus:n.featureStatus,outputSummary:compact(n.outputSummary),error:n.error,parameterSources:n.parameterSources,deliveryStatus:n.deliveryAudit?.status,decision:n.decision?{schema:n.decision.schema,available:true,toolChoice:{source:n.decision.toolChoice?.source,status:n.decision.toolChoice?.status,selectionMethod:n.decision.toolChoice?.selectionMethod,alternativesCompared:n.decision.toolChoice?.comparison?.performed===true},parameterChoiceCount:n.decision.parameterChoices?.length,gates:{total:n.decision.gates?.length||0,notEvaluated:n.decision.gates?.filter(g=>g.status==='NOT_EVALUATED').length||0},boundaryCount:n.decision.boundaries?.length,evidencePath:'decision'}:null})),limitations:r.limitations}:null;

export const pipelineMethods={
  getPipelineCapabilities,
  createPipeline(input={},provenance={source:'human'}){
    if(!this.image)throw Error('先導入要檢測的圖片');
    const previous=this.workflow.pipelinePlan;
    const plan=input.nodes?copy(input):createPipelinePlan(input);
    plan.id=previous?.id||plan.id;plan.revision=(previous?.revision||0)+1;
    const validation=validatePipeline(plan);
    if(!validation.valid){if(provenance.source==='agent')assertPipelineEvidenceProposal(plan);throw Error(validation.errors.map(e=>e.message).join('；'));}
    plan.goal=String(input.goal||input.target||input.name||plan.name||'').slice(0,2000);
    for(const node of plan.nodes){
      node.parameterSources=Object.fromEntries(Object.keys(node.params||{}).map(key=>[key,provenance.source==='agent'?'agent-proposal':'human']));
      // A submitted graph cannot grant itself an engineer's authorship. This is
      // the source of the new revision; historical input objects stay untouched.
      if(provenance.source==='agent')node.provenance={source:'agent'};
    }
    plan.provenance={...copy(provenance),at:stamp()};plan.scope='TRIAL';plan.status='DRAFT';
    // This check precedes checkpoint/change: a rejected Agent proposal leaves no
    // half-created graph, undo entry, or misleading author rationale in the project.
    if(provenance.source==='agent')assertPipelineEvidenceProposal(plan);
    this.change('pipeline_created',()=>{this.workflow.pipelinePlan=plan;this.workflow.pipelineValidation=null;});
    return copy(plan);
  },
  updatePipelineParameters(nodeId,parameters){
    const old=this.workflow.pipelinePlan;if(!old)throw Error('尚未建立算子方案');
    const next=copy(old),node=next.nodes.find(n=>n.id===nodeId);if(!node)throw Error('算子不存在');
    const previousParams=node.params||{},previousSources=node.parameterSources||{};
    node.params=copy(parameters);node.parameterSources=Object.fromEntries(Object.keys(parameters).map(k=>[k,JSON.stringify(previousParams[k])===JSON.stringify(parameters[k])?(previousSources[k]||'plan'):'human']));next.revision++;
    const validation=validatePipeline(next);if(!validation.valid)throw Error(validation.errors.map(e=>e.message).join('；'));
    this.change('pipeline_parameters_updated',()=>{next.status='DRAFT';this.workflow.pipelinePlan=next;});return copy(next);
  },
  isPipelineResultCurrent(result=this.image?.pipelineResult,image=this.image,plan=this.workflow.pipelinePlan){
    if(!(result&&image&&plan)||this.imageLoadErrors?.has(image.id)||result.binding?.sessionId!==this.pipelineSession||result.binding?.planSignature!==planSignature(plan)||result.binding?.dependencySignature!==dependencySignature(this)||result.binding?.imageId!==image.id||result.binding?.inputSha256!==image.sha256)return false;
    const raster=this.pixels.get(image.id);if(raster)return pixelsMatch(result,raster,plan);
    // No re-decoding merely to display freshness. Observed file errors above
    // invalidate it; a loaded raster still undergoes the exact pixel check.
    const content=image.contentSha256||image.assetRef?.sha256;
    return !!content&&result.binding.inputContentSha256===content&&result.image?.width===image.width&&result.image?.height===image.height&&result.planFingerprint===pipelineFingerprint(plan);
  },
  assertPipelineDelivery(imageId=this.image?.id,nodeId=null){
    const image=this.data.images.find(entry=>entry.id===imageId),plan=this.workflow.pipelinePlan,result=image?.pipelineResult;
    if(!this.isPipelineResultCurrent(result,image,plan)){
      const error={code:'CURRENT_RUN_REQUIRED',nodeId:'$pipeline',path:'result.binding',message:'目前圖像與方案沒有有效的當前實算結果。',hint:'以目前圖像/方案重新試跑，再提交交付。'};
      throw new PipelineEvidenceContractError('PIPELINE_EVIDENCE_DELIVERY_REJECTED',{schema:'agentcv-pipeline-evidence-audit-1',phase:'delivery',status:'INCOMPLETE',delivered:false,errors:[error],nodes:[]});
    }
    if(nodeId===null||nodeId===undefined)return assertPipelineEvidenceDelivery(plan,result);
    const audit=auditPipelineEvidenceDelivery(plan,result),byId=new Map(plan.nodes.map(node=>[node.id,node])),required=new Set();
    if(!byId.has(nodeId))throw new PipelineEvidenceContractError('PIPELINE_EVIDENCE_DELIVERY_REJECTED',{...audit,status:'INCOMPLETE',delivered:false,errors:[{code:'NODE_UNKNOWN',nodeId:String(nodeId),path:'nodeId',message:'單步交付需指定目前方案內的節點。',hint:'從 pipelinePlan.nodes 選擇 nodeId，不能指定其他方案或歷史節點。'}]});
    const visit=id=>{if(required.has(id))return;required.add(id);for(const input of Object.values(byId.get(id)?.inputs||{})){const ref=referenceOf(input);if(ref&&!ref.source)visit(ref.node);}};visit(nodeId);
    const selected=audit.nodes.filter(node=>required.has(node.nodeId)),failures=selected.filter(node=>!node.delivered),globalErrors=audit.errors.filter(error=>error.nodeId==='$pipeline');
    if(failures.length||globalErrors.length){const errors=[...globalErrors,...failures.flatMap(node=>node.errors.length?node.errors:[{code:'NODE_DIAGNOSTIC_ONLY',nodeId:node.nodeId,path:`result.nodes.${node.nodeId}`,message:'此步或上游只留下診斷，不能交付此步。',hint:'核對真實狀態、未驗證前提與失敗處置，修正後重新實算。'}])];throw new PipelineEvidenceContractError('PIPELINE_EVIDENCE_DELIVERY_REJECTED',{...audit,status:errors.some(error=>error.code!=='NODE_DIAGNOSTIC_ONLY')?'INCOMPLETE':'DIAGNOSTIC_ONLY',delivered:false,nodes:selected,errors});}
    return {schema:'agentcv-pipeline-evidence-certificate-1',phase:'delivery',scope:'NODE_AND_UPSTREAM',nodeId,status:'DELIVERED',delivered:true,binding:audit.binding,auditedNodeIds:[...required],nodes:selected,errors:[],pipelineDeliveryStatus:audit.status,classification:{status:result.classification?.status,reason:result.classification?.reason},note:'只證明本步及其上游的依據合約已通過；下游分類 UNKNOWN 時全鏈仍不可交付，亦不代表量測準確率或工業驗收。'};
  },
  async runPipelineImage(imageId=this.image?.id){
    const image=this.imageRecord?.(imageId)||this.data.images.find(i=>i.id===imageId),plan=this.workflow.pipelinePlan;
    if(!image)throw Error('圖片不存在');if(!plan)throw Error('先描述檢測目標並建立方案');
    const check=validatePipeline(plan);if(!check.valid)throw Error(check.errors.map(e=>e.message).join('；'));
    // An unchanged image/plan already owns the exact stage rasters and evidence.
    // Reuse the saved run instead of dispatching the same algorithm parameters.
    if(image.pipelineResult&&this.isPipelineResultCurrent(image.pipelineResult,image,plan))return copy(image.pipelineResult);
    const epoch=this.epoch,executionSignature=planSignature(plan);
    const execute=async raster=>{
      if(epoch!==this.epoch||executionSignature!==planSignature(this.workflow.pipelinePlan)||!this.data.images.includes(image))throw Error('運算期間圖片或方案已變更，舊結果已丟棄');
      const bindingSignature=dependencySignature(this),sha=image.sha256,content=image.contentSha256||image.assetRef?.sha256||null,pixelFingerprint=pipelinePixelFingerprint(raster);
      this.pipelineExecutor??=new PipelineExecutor({nativeExecute:this.nativePipelineExecute});
      const result=await this.pipelineExecutor.execute(raster,copy(plan),{inputIdentity:{imageId,imageName:image.name,sha256:sha,...(content?{contentSha256:content}:{})},scale:this.scale(imageId),planFingerprint:pipelineFingerprint(plan),pixelFingerprint});
      if(epoch!==this.epoch||bindingSignature!==dependencySignature(this)||executionSignature!==planSignature(this.workflow.pipelinePlan)||sha!==image.sha256||this.imageLoadErrors?.has(imageId)||pixelFingerprint!==pipelinePixelFingerprint(this.pixels.get(imageId))||!this.data.images.includes(image))throw Error('運算期間圖片或方案已變更，舊結果已丟棄');
      image.pipelineResult={...result,coordinateSystem:coordinates,at:stamp(),binding:{sessionId:this.pipelineSession,imageId,inputSha256:sha,inputContentSha256:content,planSignature:executionSignature,dependencySignature:bindingSignature}};
      this.dirty=true;this.notify();return copy(image.pipelineResult);
    };
    const cached=this.pixels.get(imageId);
    if(cached&&!this.imageLoadErrors?.has(imageId)){const release=this.pinImages([imageId]);try{return await execute(cached)}finally{release()}}
    return this.withImagePixels([imageId],async rasters=>execute(rasters[0]));
  },
  async validatePipelineImages(progress=()=>{},cancel=()=>false){
    const plan=this.workflow.pipelinePlan;if(!plan)throw Error('先建立算子方案');
    const epoch=this.epoch,sig=planSignature(plan),signature=dependencySignature(this),labels=JSON.stringify(this.data.images.map(i=>i.pipelineLabels||{})),rows=[];
    for(const image of this.data.images){
      if(cancel())break;progress(rows.length,this.data.images.length);
      const result=await this.runPipelineImage(image.id),label=image.pipelineLabels?.[plan.id];
      const expected=label?.source==='human'&&label.revision===plan.revision?label.status:null;
      const classification=result.classification?.status||'UNKNOWN';
      const actual=({PASS:'OK',FAIL:'NG'})[classification]||classification;
      rows.push({imageId:image.id,imageName:image.name,inputSha256:image.sha256,runId:result.runId,measurements:result.measurements,actual,expected,match:expected?expected===actual:null,reason:result.classification?.reason||result.reason||'',measured:!result.nodes.some(n=>n.featureStatus==='UNKNOWN')&&!!result.measurements&&Object.keys(result.measurements).length>0,delivered:result.deliveryAudit?.delivered===true,deliveryAudit:auditSummary(result.deliveryAudit)});
      progress(rows.length,this.data.images.length);
    }
    if(epoch!==this.epoch||sig!==planSignature(this.workflow.pipelinePlan)||signature!==dependencySignature(this)||labels!==JSON.stringify(this.data.images.map(i=>i.pipelineLabels||{})))throw Error('驗證期間方案、圖片或人工答案已變更，驗證已丟棄');
    const labeled=rows.filter(r=>r.expected),complete=rows.length===this.data.images.length;
    this.workflow.pipelineValidation={id:crypto.randomUUID(),at:stamp(),status:complete?'COMPLETED':'CANCELLED',deliveryStatus:rows.some(row=>row.deliveryAudit?.status==='INCOMPLETE')?'INCOMPLETE':complete&&rows.every(row=>row.delivered)?'DELIVERED':'DIAGNOSTIC_ONLY',delivered:complete&&rows.length>0&&rows.every(row=>row.delivered),planId:plan.id,planRevision:plan.revision,planSignature:sig,dependencySignature:signature,rows,total:this.data.images.length,processed:rows.length,labeled:labeled.length,correct:labeled.filter(r=>r.match).length,accuracy:labeled.length?labeled.filter(r=>r.match).length/labeled.length:null,unknown:rows.filter(r=>r.actual==='UNKNOWN').length,scope:'TRIAL',note:'試跑完成不等於通過獨立驗收；人工答案需與目前方案版本關聯。'};
    this.dirty=true;this.notify();return copy(this.workflow.pipelineValidation);
  },
  setPipelineLabel(imageId,status,reason=''){
    const image=this.data.images.find(i=>i.id===imageId),plan=this.workflow.pipelinePlan;
    if(!image||!plan||!['OK','NG','UNKNOWN'].includes(status))throw Error('請選有效圖片、方案和人工答案');
    this.checkpoint();image.pipelineLabels??={};image.pipelineLabels[plan.id]={status,reason:String(reason).slice(0,2000),source:'human',revision:plan.revision,at:stamp()};
    if(this.workflow.pipelineValidation)this.workflow.pipelineValidation.status='STALE';this.event('pipeline_human_label',{imageId,status,planId:plan.id,revision:plan.revision});
  },
  readPipelineEvidence({image_id=this.image?.id,node_id,path='',offset=0,limit=32}={}){
    const image=this.data.images.find(i=>i.id===image_id),result=image?.pipelineResult;
    if(!this.isPipelineResultCurrent(result,image))throw Error('本圖沒有目前版本的結果，請先重新試跑');
    const node=result.nodes.find(n=>n.id===node_id);if(!node)throw Error('請指定有效算子 id');
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>128)throw Error('證據分頁範圍無效，limit 須為 1–128');
    const source={summary:node.outputSummary,parameters:node.parameters,parameterSources:node.parameterSources,justification:this.workflow.pipelinePlan?.nodes.find(entry=>entry.id===node_id)?.justification||{status:'MISSING',reason:'此歷史方案未保存作者三項依據，不能以執行模板補造。'},deliveryAudit:auditPipelineEvidenceDelivery(this.workflow.pipelinePlan,result).nodes.find(entry=>entry.nodeId===node_id),decision:node.decision||{status:'MISSING',reason:'此歷史結果未記錄選擇依據，請以新版重新試跑；不能補稱已比較。'},evidence:node.artifacts.find(a=>a.type==='evidence')?.data||{},coordinateSystem:result.coordinateSystem||coordinates};
    let selected=source;if(path){if(typeof path!=='string'||path.length>300)throw Error('證據路徑無效');for(const key of path.split('.')){if(['__proto__','prototype','constructor'].includes(key)||selected==null||!Object.hasOwn(Object(selected),key))throw Error('證據路徑不存在');selected=selected[key];}}
    const describe=v=>Array.isArray(v)?{type:'array',length:v.length}:v&&typeof v==='object'?{type:'object',keys:Object.keys(v)}:{type:typeof v,value:v};
    const bounded=(v,depth=0)=>{if(depth>5)return describe(v);if(Array.isArray(v))return {type:'array',length:v.length,items:v.slice(0,16).map(x=>bounded(x,depth+1)),truncated:v.length>16};if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).slice(0,64).map(([k,x])=>[k,bounded(x,depth+1)]));return v;};
    return {imageId:image.id,inputSha256:image.sha256,runId:result.runId,planId:result.pipelineId,planRevision:result.pipelineRevision,nodeId:node.id,executionStatus:node.status,featureStatus:node.featureStatus||node.outputSummary?.featureStatus||null,upstreamFeatureStatuses:result.nodes.filter(n=>n.outputSummary?.featureStatus).map(n=>({nodeId:n.id,status:n.outputSummary.featureStatus})),coordinateSystem:source.coordinateSystem,path,available:!path?Object.fromEntries(Object.entries(source).map(([key,value])=>[key,describe(value)])):undefined,...(Array.isArray(selected)?{offset,limit,total:selected.length,data:selected.slice(offset,offset+limit).map(v=>bounded(v)),nextOffset:offset+limit<selected.length?offset+limit:null}:{data:!path?Object.fromEntries(Object.entries(source).map(([key,value])=>[key,describe(value)])):bounded(selected)})};
  },
  pipelineContext(){
    const plan=this.workflow.pipelinePlan,result=this.image?.pipelineResult;
    const capabilities=getPipelineCapabilities(),capabilitySummary={schema:capabilities.schema,registryVersion:capabilities.registryVersion,operators:capabilities.operators.map(({op,title,version,params})=>({op,title,version,parameterNames:Object.keys(params)})),evidenceContract:{schema:capabilities.evidenceContract.schema,requiredForAgentSubmission:false,detailsTool:'get_pipeline_capabilities',note:'Before proposal submission read full parameter origins, artifact/gate catalogs and documentation guidance using get_pipeline_capabilities.'}};
    return {pipelineCapabilities:capabilitySummary,pipelinePlan:plan?copy(plan):null,pipelineEvidenceProposal:plan?auditSummary(validatePipelineEvidenceProposal(plan)):null,pipelineResult:this.isPipelineResultCurrent(result)?summary(result):null,pipelineResultState:result?(this.isPipelineResultCurrent(result)?'CURRENT':'STALE'):'NOT_RUN',images:this.data.images.map(i=>({id:i.id,name:i.name,width:i.width,height:i.height,sha256:i.sha256,active:i.id===this.image?.id,pipelineResult:this.isPipelineResultCurrent(i.pipelineResult,i)?summary(i.pipelineResult):null})),pipelineValidation:this.workflow.pipelineValidation?{...this.workflow.pipelineValidation,rows:this.workflow.pipelineValidation.rows.map(row=>({...row,measurements:compact(row.measurements)}))}:null};
  }
};
