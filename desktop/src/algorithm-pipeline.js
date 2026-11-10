// Optional geometry adapter for programmable algorithms. The program itself may
// return any result; this contract is only needed to feed four lines to existing
// rectangular measurements. Host checks validate recorded geometry/support, not
// semantic identity or independent metrological accuracy.
import {algorithmRunCurrent} from './algorithm-workspace.js';
import {validateOperationEvidenceJustification,pipelineEvidenceFingerprint} from './pipeline-evidence-contract.js';

const SIDES=['top','bottom','left','right'];
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.trim().length>0;
const finite=Number.isFinite;
const point=value=>Array.isArray(value)?{x:value[0],y:value[1]}:value;
const validPoint=value=>object(value)&&finite(value.x)&&finite(value.y);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const error=(code,path,message,hint)=>({code,path,message,hint});
const METRICS={rms_px:'px',coverage:'ratio',support_count:'points',continuity:'ratio',max_gap_ratio:'ratio',min_local_coverage:'ratio',parameter_spread_px:'px'};
const at=(geometry,axis,t)=>{const a=geometry.from,b=geometry.to,delta=b[axis]-a[axis],normal=axis==='x'?'y':'x';return Math.abs(delta)<1e-9?null:a[normal]+(t-a[axis])*(b[normal]-a[normal])/delta};
const angle=geometry=>{let value=Math.atan2(geometry.to.y-geometry.from.y,geometry.to.x-geometry.from.x)*180/Math.PI;while(value>=90)value-=180;while(value< -90)value+=180;return value};
const deltaAngle=(a,b)=>{const d=Math.abs(a-b)%180;return Math.min(d,180-d)};
function intersection(a,b){const p=a.from,q=b.from,u={x:a.to.x-p.x,y:a.to.y-p.y},v={x:b.to.x-q.x,y:b.to.y-q.y},det=u.x*v.y-u.y*v.x;if(Math.abs(det)<1e-8)return null;const t=((q.x-p.x)*v.y-(q.y-p.y)*v.x)/det;return {x:p.x+t*u.x,y:p.y+t*u.y}}
function artifactExists(run,id,type){return (run.artifacts||[]).some(artifact=>artifact.id===id&&(!type||(artifact.type==='json'?'evidence':artifact.type)===type))}
function outputFingerprint(run,output){return pipelineEvidenceFingerprint({runId:run.runId,code:run.code,parameters:run.parameters,sourceBinding:run.sourceBinding,justification:run.justification,expectedOutputs:run.expectedOutputs,artifacts:(run.artifacts||[]).map(({id,type,sha256,hostBytesVerified})=>({id,type,sha256,hostBytesVerified})),output})}
function findRun(project,runId){return (project.data.algorithmRuns||[]).find(run=>run.runId===runId)}
function declaredOutputs(run){return Array.isArray(run?.result?.measurementOutputs)?run.result.measurementOutputs:[]}

export function algorithmOutputCapabilities(){return {
 schema:'agentcv-algorithm-measurement-output-1',optional:true,sourceField:'result.measurementOutputs',scope:'任意算法結果可獨立呈現；只有輸出近似矩形四邊給尺寸規則時使用此可選 adapter。採用是 TRIAL，不能授予工件身分、獨立精度驗證或正式發布。',
 required:['id','imageId','targetId','coordinateSpace','selection','lines','evidenceRefs','boundaryChecks'],coordinateSpace:'original-pixels',
 selection:{rule:'自行描述本次選擇規則，如 first；不限定算法名稱',scanDirection:'自行描述掃描方向',reason:'選擇此結果的具體理由'},
 lines:{sides:SIDES,geometry:{from:{x:0,y:0},to:{x:1,y:0}},support:{points:'原圖座標 [[x,y],...]，至少3個；宿主不把它當獨立真值',sampleSpan:{axis:'x 或 y，必須符合該側切向',from:'切向起點',to:'切向終點（含）',step:'正數取樣間隔'}},checks:'至少 rms_px <= 門檻、coverage >= 門檻、support_count >= 門檻；每項 {id,metric,operator,threshold,unit}。actual由宿主依支持點重算，與程式宣告值不符會拒絕。',metrics:METRICS,evidenceRefs:'至少一項本run真實artifact id',parameterTrials:'使用 parameter_spread_px 時需至少兩項 {id,geometry:{from,to}}，在共同切向跨度比較；缺資料不放行。'},
 evidence:'evidenceRefs 需含本run一張image及一項evidence；output 可帶自由 documentation；本輸出boundaryChecks需有id/status/actual/threshold，保留本輸出實際自檢值。',
 failedProgramBoundary:'整run任何FAIL/NOT_EVALUATED gate不可隱藏；若不屬此輸出，逐項列 excludedRunBoundaryChecks:[{id,reason}]，並用本輸出的 scoped gate 實際核對。',
 tools:{evaluate:'evaluate_algorithm_output',adopt:'adopt_algorithm_output',clear:'clear_algorithm_output'},
 geometryPolicy:{minDimensionPx:4,maxDimensionImageRatio:1.2,maxParallelDeviationDeg:3,maxOrthogonalDeviationDeg:5,source:'host geometry adapter engineering defaults; not a demonstrated optimal accuracy limit'}
}}

function validateOutputEvidence(run,output,errors){
 const path=`measurementOutputs.${output.id||'?'}`,outputs=(run.expectedOutputs||[]).map(item=>({...run.artifacts?.find(artifact=>artifact.id===item.id),...item})),gates=Array.isArray(output.boundaryChecks)?output.boundaryChecks:[];
 const proposal=validateOperationEvidenceJustification(output.justification,{nodeId:output.id||'measurement',requiredParameters:Object.keys(run.parameters||{}).map(name=>({name,source:'agent-proposal'})),evidenceArtifacts:outputs,gateIds:gates.map(gate=>gate?.id),allowVisuals:true,requireVisualPixels:true});
 errors.push(...proposal.errors);
 const refs=output.evidenceRefs;
 if(!Array.isArray(refs)||!refs.length||refs.some(id=>!text(id)||!artifactExists(run,id)))errors.push(error('OUTPUT_EVIDENCE_MISSING',`${path}.evidenceRefs`,'量測輸出需引用本次實算產物。','引用同run已產生的圖像及數據artifact id。'));
 else if(!refs.some(id=>artifactExists(run,id,'image'))||!refs.some(id=>artifactExists(run,id,'evidence')))errors.push(error('OUTPUT_VISUAL_AND_DATA_REQUIRED',`${path}.evidenceRefs`,'需要可核對的圖像與數據兩類依據。','生成疊圖及支持點／品質數據，不以文字代替。'));
 const array=value=>Array.isArray(value)?value:[],selectors=[...array(output.justification?.tool?.expectedEvidence),...array(output.justification?.parameters).map(row=>row?.verification),...array(output.justification?.boundaries).map(row=>row?.check)];
 for(const selector of selectors){if(selector?.kind==='artifact'&&!((run.artifacts||[]).some(artifact=>(artifact.type==='json'?'evidence':artifact.type)===selector.type&&(!selector.id||artifact.id===selector.id))))errors.push(error('OUTPUT_ACTUAL_EVIDENCE_MISSING',path,'舊版說明引用的產物不存在。','補產物後重跑，不能補寫通過。'));}
 if(!gates.length||gates.some(gate=>!object(gate)||!text(gate.id)||!['PASS','FAIL','NOT_EVALUATED'].includes(gate.status)||!Object.hasOwn(gate,'actual')||!Object.hasOwn(gate,'threshold'))||new Set(gates.map(gate=>gate?.id)).size!==gates.length)errors.push(error('OUTPUT_BOUNDARY_OBSERVATIONS_REQUIRED',`${path}.boundaryChecks`,'需要具名、不重複且保存actual和threshold的本輸出邊界觀察。','逐項保存PASS／FAIL／NOT_EVALUATED，失敗保持UNKNOWN。'));
 const excluded=Array.isArray(output.excludedRunBoundaryChecks)?output.excludedRunBoundaryChecks:[],runGates=Array.isArray(run.result?.boundaryChecks)?run.result.boundaryChecks:[];
 for(const gate of runGates.filter(gate=>gate?.status!=='PASS'))if(!excluded.some(row=>row.id===gate.id&&text(row.reason)&&row.reason.trim().length>=8))errors.push(error('PROGRAM_BOUNDARY_SCOPE_REQUIRED',`${path}.excludedRunBoundaryChecks.${gate.id}`,'整run的失敗／未知邊界沒有說明何以不屬此輸出。','保留原FAIL並明確解釋本輸出scope，使用獨立scoped gate核對，不能拷貝全run後隱藏失敗。'));
 for(const row of excluded)if(!object(row)||!text(row.reason)||!runGates.some(gate=>gate.id===row.id&&gate.status!=='PASS'))errors.push(error('PROGRAM_BOUNDARY_EXCLUSION_INVALID',`${path}.excludedRunBoundaryChecks`,'排除項未引用整run真實的失敗／未知gate。','只列本run存在的gate及具體scope原因。'));
 return {proposal,boundaryChecks:clone(gates),passed:gates.length>0&&gates.every(gate=>gate.status==='PASS'),excludedRunBoundaryChecks:clone(excluded)};
}
function lineEvaluation(line,side,image){
 const issues=[],path=`lines.${side}`,horizontal=side==='top'||side==='bottom',axis=horizontal?'x':'y',normal=horizontal?'y':'x',geometry=clone(line?.geometry),span=line?.support?.sampleSpan;
 const inImage=p=>validPoint(p)&&p.x>=0&&p.y>=0&&p.x<image.width&&p.y<image.height;
 if(!geometry||!inImage(geometry.from)||!inImage(geometry.to)||distance(geometry.from,geometry.to)<1||Math.abs(geometry.to[axis]-geometry.from[axis])<1)issues.push(error('LINE_GEOMETRY_INVALID',`${path}.geometry`,'線段端點無效、退化或切向不符合該側。','使用原圖像素座標的實算擬合端點。'));
 if(!object(span)||span.axis!==axis||!finite(span.from)||!finite(span.to)||span.to<=span.from||!finite(span.step)||span.step<=0||(span.to-span.from)/span.step>100000||span.from<0||span.to>=(horizontal?image.width:image.height))issues.push(error('LINE_SAMPLE_SPAN_REQUIRED',`${path}.support.sampleSpan`,'支持點的切向取樣跨度無效。','保存axis/from/to/step，讓宿主計算覆蓋率與缺口。'));
 const points=Array.isArray(line?.support?.points)?line.support.points.map(point):[];
 if(points.length<3||points.length>200000||points.some(p=>!inImage(p)))issues.push(error('LINE_SUPPORT_REQUIRED',`${path}.support.points`,'需要至少三個位於原圖中的真實支持點。','保留實際支持點；手畫線不能當作找到的邊。'));
 const required=['rms_px','coverage','support_count'],checks=Array.isArray(line?.checks)?line.checks:[];
 if(checks.length>64||required.some(metric=>!checks.some(check=>check?.metric===metric)))issues.push(error('LINE_QUALITY_CHECKS_REQUIRED',`${path}.checks`,'需要RMS、覆蓋率及支持點數三項數值門檻。','每項使用id/metric/operator/threshold/unit，actual由宿主重算。'));
 if(checks.some(check=>!object(check)||!text(check.id)||!Object.hasOwn(METRICS,check.metric)||!['<=','>='].includes(check.operator)||!finite(check.threshold)||check.unit!==METRICS[check.metric])||new Set(checks.map(check=>check?.id)).size!==checks.length)issues.push(error('LINE_QUALITY_CHECK_INVALID',`${path}.checks`,'品質條件名稱、單位或閾值無效。','從capabilities.metrics選擇具體metric及單位。'));
 if(required.some(metric=>checks.some(check=>check?.metric===metric&&check.operator!==(metric==='rms_px'?'<=':'>=')))||checks.some(check=>check&&(check.threshold<0||['coverage','continuity','max_gap_ratio','min_local_coverage'].includes(check.metric)&&check.threshold>1||check.metric==='support_count'&&check.threshold<3||check.metric==='coverage'&&check.threshold===0)))issues.push(error('LINE_QUALITY_DIRECTION_INVALID',`${path}.checks`,'品質閾值方向或範圍無效。','RMS應有上限，coverage/support_count應有下限，比率介於0到1。'));
 if(issues.length)return {status:'UNKNOWN',side,reason:issues[0].message,errors:issues,candidates:[],selected:null,checks:[]};
 const expectedCount=Math.floor((span.to-span.from)/span.step+1e-8)+1,indices=points.map(p=>Math.round((p[axis]-span.from)/span.step)),badIndices=indices.some(i=>i<0||i>=expectedCount),bins=[...new Set(indices)].sort((a,b)=>a-b);
 if(badIndices){issues.push(error('LINE_SUPPORT_OUTSIDE_SPAN',`${path}.support.points`,'支持點落在宣告的取樣跨度以外。','修正sampleSpan後重跑。'));return {status:'UNKNOWN',side,reason:issues[0].message,errors:issues,candidates:[],selected:null,checks:[]}}
 const ux=geometry.to.x-geometry.from.x,uy=geometry.to.y-geometry.from.y,length=Math.hypot(ux,uy),residuals=points.map(p=>Math.abs(ux*(p.y-geometry.from.y)-uy*(p.x-geometry.from.x))/length),rms=Math.sqrt(residuals.reduce((sum,value)=>sum+value*value,0)/points.length);
 let longest=0,streak=0,last=-2,maxGap=0;for(const index of bins){streak=index===last+1?streak+1:1;longest=Math.max(longest,streak);if(last>=0)maxGap=Math.max(maxGap,index-last-1);last=index}maxGap=Math.max(bins[0],maxGap,expectedCount-1-bins.at(-1));
 const local=Array.from({length:5},(_,i)=>{const lo=Math.floor(i*expectedCount/5),hi=Math.floor((i+1)*expectedCount/5);return hi>lo?bins.filter(index=>index>=lo&&index<hi).length/(hi-lo):0});
 const metrics={rms_px:rms,coverage:bins.length/expectedCount,support_count:bins.length,continuity:longest/expectedCount,max_gap_ratio:maxGap/expectedCount,min_local_coverage:Math.min(...local)};
 if(checks.some(check=>check.metric==='parameter_spread_px')){
  const trials=line.parameterTrials;
  if(!Array.isArray(trials)||trials.length<2||trials.length>128||trials.some(trial=>!text(trial?.id)||!inImage(trial.geometry?.from)||!inImage(trial.geometry?.to)||Math.abs(trial.geometry.to[axis]-trial.geometry.from[axis])<1)||new Set(trials.map(trial=>trial?.id)).size!==trials.length)issues.push(error('LINE_PARAMETER_TRIALS_REQUIRED',`${path}.parameterTrials`,'跨參數比較需要至少兩組不重複的真實線段。','保留每組geometry及id，在共同跨度內比較。'));
  else {const low=Math.max(span.from,...trials.map(trial=>Math.min(trial.geometry.from[axis],trial.geometry.to[axis]))),high=Math.min(span.to,...trials.map(trial=>Math.max(trial.geometry.from[axis],trial.geometry.to[axis])));if(high<=low)issues.push(error('LINE_PARAMETER_COMMON_SPAN_REQUIRED',`${path}.parameterTrials`,'各組線段缺少共同支持跨度。','不能用互不重疊位置的結果聲稱穩定。'));else metrics.parameter_spread_px=Math.max(...[low,(low+high)/2,high].map(t=>{const positions=trials.map(trial=>at(trial.geometry,axis,t));return Math.max(...positions)-Math.min(...positions)}));}
 }
 const compared=checks.map(check=>{const actual=metrics[check.metric],pass=finite(actual)&&(check.operator==='<='?actual<=check.threshold:actual>=check.threshold);return {...clone(check),actual:finite(actual)?actual:null,pass,source:'host-recomputed-from-recorded-support'}});
 for(const check of checks)if(Object.hasOwn(check,'actual')&&(!finite(check.actual)||Math.abs(check.actual-metrics[check.metric])>Math.max(1e-6,Math.abs(metrics[check.metric])*1e-6)))issues.push(error('LINE_DECLARED_METRIC_MISMATCH',`${path}.checks.${check.id}.actual`,'程式宣告品質數值與支持點重算不一致。','保存原支持點及正確計算，不能只填PASS。'));
 const failed=compared.filter(check=>!check.pass),quality={rms_px:rms,continuity:metrics.continuity,max_gap_ratio:metrics.max_gap_ratio,local_coverage:local,point_count:points.length,source:'recorded-program-support'},candidate={id:line.id||`${side}-program-line`,geometry:{...geometry,angle_deg:angle(geometry),rms_px:rms,length_px:length},coverage:metrics.coverage,quality,points:clone(points),evidenceRefs:clone(line.evidenceRefs||[])};
 return {status:issues.length||failed.length?'UNKNOWN':'FOUND',side,reason:issues[0]?.message||failed.map(check=>`${check.id}：${check.actual??'缺值'} ${check.operator} ${check.threshold} ${check.unit} 未通過`).join('；')||'本輸出的支持點及品質條件通過；尚未授予人工確認',errors:issues,selected:issues.length||failed.length?null:candidate,candidates:[candidate],candidate_pool:[candidate],metrics,checks:compared,roi:horizontal?{x:span.from,y:Math.max(0,Math.min(geometry.from.y,geometry.to.y)-3),width:span.to-span.from,height:Math.abs(geometry.to.y-geometry.from.y)+6}:{x:Math.max(0,Math.min(geometry.from.x,geometry.to.x)-3),y:span.from,width:Math.abs(geometry.to.x-geometry.from.x)+6,height:span.to-span.from},parameter_assessment:checks.some(check=>check.metric==='parameter_spread_px')?{status:failed.some(check=>check.metric==='parameter_spread_px')?'DISAGREEMENT':'CONSISTENT',maxNormalSpreadPx:metrics.parameter_spread_px,agreementTolerancePx:checks.find(check=>check.metric==='parameter_spread_px').threshold,testedCount:line.parameterTrials?.length}:null};
}
function rectangleMeasurement(edges,image){
 const base={status:'UNKNOWN',reason:'尚未取得完整四側合格線段',edges,unit:'px'};
 if(SIDES.some(side=>edges[side].status!=='FOUND'))return base;
 const g=side=>edges[side].selected.geometry,tl=intersection(g('top'),g('left')),tr=intersection(g('top'),g('right')),br=intersection(g('bottom'),g('right')),bl=intersection(g('bottom'),g('left')),corners=[tl,tr,br,bl];
 if(corners.some(p=>!validPoint(p)))return {...base,reason:'邊線交點退化'};
 const width=(distance(tl,tr)+distance(bl,br))/2,height=(distance(tl,bl)+distance(tr,br))/2;
 if(width<4||height<4||width>image.width*1.2||height>image.height*1.2||tl.x>=tr.x||bl.x>=br.x||tl.y>=bl.y||tr.y>=br.y)return {...base,reason:'四側順序或交點尺寸不合理'};
 if(deltaAngle(g('top').angle_deg,g('bottom').angle_deg)>3||deltaAngle(g('left').angle_deg,g('right').angle_deg)>3||Math.abs(deltaAngle(g('top').angle_deg,g('left').angle_deg)-90)>5)return {...base,reason:'近似矩形的平行／正交條件未通過'};
 return {status:'MEASURED',width,height,angle:g('top').angle_deg,center:{x:corners.reduce((sum,p)=>sum+p.x,0)/4,y:corners.reduce((sum,p)=>sum+p.y,0)/4},corners,edges,unit:'px',reason:'依本輸出四條合格線求交點與尺寸；TRIAL，未作獨立精度驗收'};
}
function evaluateChecks(project,image,output,measurement){
 const scale=project.scale(image.id),results={};
 for(const check of project.workflow.checks.filter(check=>!check.disabled&&check.targetId===output.targetId&&['width','height','angle'].includes(check.kind))){
  const row={checkId:check.id,name:check.name,kind:check.kind,unit:check.unit||'px',status:'UNKNOWN',reason:measurement.reason,source:'program-geometry-trial',min:check.min,max:check.max};let value;
  if(measurement.status==='MEASURED'){
   value=measurement[check.kind];
   if(check.unit==='mm'){
    const sx=scale.mmPerPixelX??scale.mmPerPixel,sy=scale.mmPerPixelY??scale.mmPerPixel;
    if(scale.status!=='VALID'||!finite(sx)||!finite(sy)||sx<=0||sy<=0){value=undefined;row.reason=scale.reason||'缺少有效實測標定';}
    else {const [tl,tr,br,bl]=measurement.corners,dist=(a,b)=>Math.hypot((a.x-b.x)*sx,(a.y-b.y)*sy);value=check.kind==='width'?(dist(tl,tr)+dist(bl,br))/2:(dist(tl,bl)+dist(tr,br))/2;row.calibration=clone(scale);}
   }
   if(finite(value)){row.value=value;if(!finite(check.min)||!finite(check.max)||check.min>check.max)row.reason='未提供有效合格範圍';else {row.status=value>=check.min&&value<=check.max?'OK':'NG';row.reason='TRIAL實算尺寸與既有人類規格比較；非正式驗收或發布';}}
  }
  results[check.id]=row;
 }
 return results;
}

export function evaluateAlgorithmOutput(project,{runId,outputId}={}){
 const errors=[],run=findRun(project,runId),base={schema:'agentcv-program-measurement-evaluation-1',runId:runId||null,outputId:outputId||null,current:false,adoptable:false,status:'UNKNOWN',stage:'TRIAL',humanConfirmed:false,delivered:false,errors};
 if(!run){errors.push(error('ALGORITHM_RUN_NOT_FOUND','runId','找不到算法運算紀錄。','先run_algorithm或指定已保存runId。'));return base;}
 const output=declaredOutputs(run).find(output=>output?.id===outputId);
 if(!output){errors.push(error('ALGORITHM_OUTPUT_NOT_FOUND','outputId','此run沒有指定的結構化量測輸出。','程式可輸出任意結果；若要接入四邊量測，請依可選measurementOutputs合約重跑。'));return base;}
 if(!text(output.id)||declaredOutputs(run).filter(item=>item?.id===output.id).length!==1)errors.push(error('ALGORITHM_OUTPUT_ID_INVALID','measurementOutputs.id','量測輸出id缺失或重複。','每個具名輸出只保留一筆。'));
 base.imageId=output.imageId;base.targetId=output.targetId;base.title=output.title||run.title;base.sourceBinding=clone(run.sourceBinding);base.outputFingerprint=outputFingerprint(run,output);base.current=algorithmRunCurrent(project,run);base.justification=clone(output.justification);base.evidenceRefs=clone(output.evidenceRefs||[]);base.selection=clone(output.selection);base.boundaryChecks=clone(output.boundaryChecks||[]);base.programBoundaryChecks=clone(run.result?.boundaryChecks||[]);
 if(!base.current)errors.push(error('ALGORITHM_OUTPUT_STALE','sourceBinding','原圖、輪廓、尺度或工作流程已改變，不能採用舊輸出。','重新get_algorithm_context並用目前source重跑。'));
 if(run.status!=='SUCCEEDED')errors.push(error('ALGORITHM_EXECUTION_INCOMPLETE','run.status','程式沒有成功完成。','先修正執行錯誤，再重新產生輸出。'));
 const image=project.data.images.find(image=>image.id===output.imageId),target=project.target?.(output.targetId)||project.targets?.find(target=>target.id===output.targetId);
 if(!image||!run.sourceBinding?.images?.some(binding=>binding?.imageId===output.imageId)||!target)errors.push(error('ALGORITHM_OUTPUT_TARGET_INVALID','imageId/targetId','輸出未綁定本run原圖或專案有效對象。','使用get_algorithm_context提供的imageId及targetId。'));
 if(output.coordinateSpace!=='original-pixels'||!text(output.selection?.rule)||!text(output.selection?.scanDirection)||!text(output.selection?.reason))errors.push(error('ALGORITHM_SELECTION_REQUIRED','selection','需要原圖座標與具體選線規則、方向及原因。','不可將中點截距誤當全局截距，並明確保存first/last等本次選擇。'));
 const audit=validateOutputEvidence(run,output,errors);base.evidenceAudit=audit;
 const lineRefsValid=SIDES.every(side=>Array.isArray(output.lines?.[side]?.evidenceRefs)&&output.lines[side].evidenceRefs.length&&output.lines[side].evidenceRefs.every(id=>artifactExists(run,id)));
 if(!lineRefsValid)errors.push(error('ALGORITHM_LINE_EVIDENCE_REQUIRED','lines','每側線段都必須引用本run實算圖像或數據。','保存支持點產物id，不能僅給出端點或文字。'));
 const contractValid=errors.length===0;base.adoptable=contractValid;
 if(!image)return base;
 const edges=Object.fromEntries(SIDES.map(side=>[side,lineEvaluation(output.lines?.[side],side,image)]));base.edges=edges;
 errors.push(...Object.values(edges).flatMap(edge=>edge.errors));base.adoptable=contractValid&&Object.values(edges).every(edge=>!edge.errors.length);
 const measurement=rectangleMeasurement(edges,image);base.measurement=measurement;
 if(!base.adoptable||!audit.passed){measurement.status='UNKNOWN';measurement.reason=!base.adoptable?'本輸出來源或實際輸出未通過合約檢查':'本輸出適用邊界自檢失敗或未知';}
 const checks=evaluateChecks(project,image,output,measurement);base.checks=checks;
 const values=Object.values(checks);base.status=values.some(check=>check.status==='NG')?'NG':values.length&&values.every(check=>check.status==='OK')?'OK':'UNKNOWN';
 base.result={status:base.status,checks,targets:{[output.targetId]:{location:{status:'LOCATED',method:'program-output-coordinate-binding',reason:'程式輸出綁定此原圖與對象；不冒稱人工定位確認',bounds:measurement.corners?{x:Math.min(...measurement.corners.map(p=>p.x)),y:Math.min(...measurement.corners.map(p=>p.y)),width:Math.max(...measurement.corners.map(p=>p.x))-Math.min(...measurement.corners.map(p=>p.x)),height:Math.max(...measurement.corners.map(p=>p.y))-Math.min(...measurement.corners.map(p=>p.y))}:null},measurement}},algorithm_version:'programmable-geometry-adapter-1',run_id:run.runId,input_sha256:image.sha256,source:'program-output',stage:'TRIAL',humanConfirmed:false,delivered:false};
 base.scope='只核對本run記錄的支持點、品質與幾何條件，未證明所選線語義正確或獨立精度；品質規則OK／NG為TRIAL結果。';
 return base;
}
export function adoptAlgorithmOutput(project,{runId,outputId}={}){
 const evaluated=evaluateAlgorithmOutput(project,{runId,outputId});
 if(!evaluated.adoptable){const failure=new Error(evaluated.errors.map(error=>`${error.code}: ${error.message}`).join('；')||'量測輸出不可採用');failure.code='ALGORITHM_OUTPUT_ADOPTION_REJECTED';failure.errors=evaluated.errors;throw failure;}
 const image=project.data.images.find(image=>image.id===evaluated.imageId);project.checkpoint();
 image.algorithmMeasurement={schema:'agentcv-program-measurement-binding-1',runId,outputId,imageId:image.id,sourceBinding:clone(evaluated.sourceBinding),outputFingerprint:evaluated.outputFingerprint,adoptedAt:new Date().toISOString(),stage:'TRIAL',author:'agent',humanConfirmed:false};
 if(project.workflow.validation)project.workflow.validation.status='STALE';if(project.workflow.publication)project.workflow.publication.status='STALE';
 project.event('algorithm_output_adopted',{runId,outputId,imageId:image.id,status:evaluated.status,stage:'TRIAL'});
 return {...evaluated,active:true};
}
export function readCurrentAlgorithmOutput(project,imageId=project.image?.id){
 const image=project.data.images.find(image=>image.id===imageId),binding=image?.algorithmMeasurement;if(!binding)return null;
 const evaluated=evaluateAlgorithmOutput(project,{runId:binding.runId,outputId:binding.outputId});
 if(binding.imageId!==imageId||binding.outputFingerprint!==evaluated.outputFingerprint){evaluated.current=false;evaluated.adoptable=false;evaluated.status='UNKNOWN';evaluated.errors.push(error('ALGORITHM_ADOPTED_OUTPUT_CHANGED','algorithmMeasurement','已採用的程式、參數、證據或輸出內容已改變。','重新實算並明確採用新輸出。'));if(evaluated.result)evaluated.result.status='UNKNOWN';if(evaluated.measurement){evaluated.measurement.status='UNKNOWN';evaluated.measurement.reason='已採用結果內容改變，請重新實算與採用';}for(const check of Object.values(evaluated.checks||{})){check.status='UNKNOWN';check.reason='已採用結果內容改變，請重新實算與採用';delete check.value;}}
 return {...evaluated,active:true,binding:clone(binding)};
}
export function clearAlgorithmOutput(project,imageId=project.image?.id){
 const image=project.data.images.find(image=>image.id===imageId);if(!image?.algorithmMeasurement)return {cleared:false,imageId};project.checkpoint();const previous=clone(image.algorithmMeasurement);delete image.algorithmMeasurement;
 if(project.workflow.validation)project.workflow.validation.status='STALE';if(project.workflow.publication)project.workflow.publication.status='STALE';project.event('algorithm_output_cleared',{imageId,runId:previous.runId,outputId:previous.outputId});return {cleared:true,imageId,previous};
}
export function algorithmOutputSummaries(project,runId){
 const runs=runId?[findRun(project,runId)].filter(Boolean):(project.data.algorithmRuns||[]);
 return runs.flatMap(run=>declaredOutputs(run).map(output=>({runId:run.runId,outputId:output.id,imageId:output.imageId,targetId:output.targetId,title:output.title||run.title,current:algorithmRunCurrent(project,run),active:project.data.images.some(image=>image.algorithmMeasurement?.runId===run.runId&&image.algorithmMeasurement?.outputId===output.id)})));
}
