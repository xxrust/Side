import {OPERATOR_REGISTRY} from './pipeline-registry.js';
const finite=Number.isFinite;
export const decisionSourceLabel=value=>({human:'人工設定',manual:'人工設定',user:'方案提供',user_specification:'使用者規格',agent:'Agent 提出','agent-proposal':'Agent 提案',plan:'方案設定','operator-default':'內建預設',engineering_default:'工程預設',computed_from_pixels:'本圖推導','data-derived':'本圖推導',not_supplied:'未提供',input:'原圖輸入',unknown:'未記錄'})[value]||value||'未記錄';
export const decisionParameterLabel=name=>({threshold:'分割閾值',polarity:'前景極性',selection:'候選選擇方式',componentId:'指定候選 ID',minArea:'最小區域面積',excludeBoundary:'排除觸邊物件',expectedTeeth:'規格齒數',sampleCount:'角度取樣數',smoothingWindow:'平滑窗口',minProminence:'峰突出度',minPeakDistance:'峰距',countAgreementRequired:'參數比較齒數一致',maxPitchVariation:'齒距變異閘值',maxUnsupportedAngleDeg:'最大未支持角度',minRootConcavityPx:'最小齒根凹陷',minSupportedRootFraction:'齒根支持比例',maxRadialModulationRatio:'徑向起伏上限',tipCapDropPx:'齒帽下降幅度',workpieceCenter:'採用的齒形中心',maxRelativeResidual:'相對 RMS 閘值',maxResidualPx:'RMS 像素閘值',minAngularCoverageDeg:'角度覆蓋閘值',minHoleArea:'最小孔面積',positionTolerancePx:'位置匹配公差',expectedPositions:'規格孔位置',connectivity:'背景連通方式',rules:'使用者規格'})[name]||name;
const specs=node=>node?.params||node?.parameters||{};
const byPath=(object,path)=>path.split('.').reduce((value,key)=>value?.[key],object);
const evidenceOf=trace=>(trace?.artifacts||[]).filter(a=>a.type==='evidence').map(a=>a.data||{}).reduce((out,value)=>({...out,...value}),{});
const metric=(label,value,unit='')=>({label,value,unit});
const noComparison='未比較其他工具；固定流程的選擇不能稱為最優。';
const gateSource=value=>{if(value&&typeof value==='object')return Object.entries(value).map(([key,item])=>`${key}：${gateSource(item)}`).join('，');return value==null?'未提供':typeof value==='string'?decisionSourceLabel(value):String(value)};
function choices(plan,node,trace){
 const saved=trace?.decision?.parameterChoices||trace?.parameterChoices;
 if(saved)return saved.map(item=>({...item,label:decisionParameterLabel(item.name)}));
 const configured=specs(node),schema=OPERATOR_REGISTRY[node?.op||node?.operator]?.parameterSchema?.properties||{},names=new Set([...Object.keys(schema),...Object.keys(configured)]);
 return [...names].map(name=>{const supplied=Object.hasOwn(configured,name),source=supplied?(node?.parameterSources?.[name]||plan?.provenance?.source||'plan'):schema[name]?.default!==undefined?'operator-default':'not_supplied';return {name,label:decisionParameterLabel(name),value:supplied?configured[name]:schema[name]?.default,source,setBy:source,status:'not-recorded',method:supplied?'prescribed-value':'not-executed',derivation:{source:supplied?'plan':source},reason:supplied?'已保存於方案；尚無當次實算選擇依據。':'只列已宣告的內建預設；本圖推導值需試跑後取得。',comparison:{performed:false,claim:'尚無當次比較。'}}});
}
/** A read-only adapter. No feature measurements or alternative algorithm runs happen here. */
export function buildPipelineDecisionEvidence({plan,node,trace,result,current=false}={}){
 const definition=OPERATOR_REGISTRY[node?.op||node?.operator],op=node?.op||node?.operator,uncertain=trace?.status!=='OK'||trace?.featureStatus==='UNKNOWN'||op==='rules.evaluate'&&result?.nodes?.some(n=>n.featureStatus==='UNKNOWN'),status=current?(uncertain?'DIAGNOSTIC':'CURRENT'):result?'STALE':'NOT_RUN',decision=current?trace?.decision:null;
 const audit=trace?.deliveryAudit||result?.deliveryAudit?.nodes?.find(item=>item.nodeId===node?.id)||null;
 const model={schema:'agentcv-pipeline-decision-view-1',op,nodeId:node?.id,title:definition?.title||'本步選擇依據',status,binding:{pipelineId:plan?.id,pipelineRevision:plan?.revision,runId:current?result?.runId:null},toolChoice:decision?.toolChoice||{op,source:plan?.provenance?.source||'unknown',status:'not-recorded',reason:null,alternativesCompared:false},justification:(current?trace?.justification:null)||node?.justification||null,parameterChoices:choices(plan,node,current?trace:null),boundaries:current?(decision?.boundaries||trace?.boundaries||[]).map(item=>typeof item==='string'?{message:item}:item):[],deliveryAudit:current?audit:null,figures:[]};
 if(!current||!trace||!trace.decision){if(current&&trace&&!trace.decision){model.status='LEGACY';model.parameterChoices=choices(plan,node,null)}model.figures=[{id:'unavailable',kind:'empty',title:model.status==='LEGACY'?'未保存選擇依據，需新版重跑':status==='STALE'?'舊證據已隱藏':'尚未實算',note:'方案工具與已填設定仍可查看。本圖實算比較與門檻數值需重新試跑；不沿用舊圖。',metrics:[],parameterNames:[]}];return model}
 const artifacts=trace.artifacts||[],evidence=evidenceOf(trace),summary=trace.outputSummary||{},p=trace.parameters||{},measurements=result?.measurements||{},refs=artifacts.map(a=>a.id),figures=model.figures;
 const add=figure=>figures.push({metrics:[],parameterNames:[],evidenceRefs:refs,...figure});
 add({id:'input-output',kind:'input-output',title:'輸入 → 本步輸出',data:{nodeId:node.id},note:`${model.toolChoice.reason} ${model.toolChoice.comparison?.performed?'已保存比較另列，僅限記錄的範圍。':noComparison}`,metrics:[metric('本步狀態',trace.featureStatus==='UNKNOWN'?'診斷候選':trace.status),metric('實算耗時',trace.durationMs,'ms')]});
 const histogram=artifacts.find(a=>a.type==='histogram');
 if(op==='image.grayscale'){
  const conversion=artifacts.find(a=>a.id.endsWith(':grayscale-conversion'))?.data||{},weights=decision.parameterChoices?.find(c=>c.name==='luminanceWeights'),applied=conversion.applied===true,upstream=conversion.upstreamGrayProvenance;
  const note=summary.executionMode==='pass-through'?'本步只 round / clamp 已提供強度，沿用原有灰階／二值內容；沒有重新選用 RGB 亮度轉換，沒有增加新的圖像資訊。':applied?`本步實際執行 ${conversion.formula||'固定亮度轉換'}；未比較其他灰階方法。`:`本步只 round / clamp 已提供的灰階。${upstream?'已知上游來源另列於參數依據。':'上游 RGB 轉換係數未記錄，不能宣稱本步重新套用 RGB 公式。'} 未比較其他方法。`;
  if(histogram)add({id:'gray-histogram',kind:'histogram',title:'灰階亮度分布',data:histogram,note,parameterNames:['luminanceWeights','grayQuantization'],metrics:[metric('灰階級數',histogram.values?.filter(v=>v>0).length),metric('本步 RGB 轉換',applied?'有':'無'),metric('輸入表示',weights?.observedValues?.inputRepresentation)]});
 }
 if(op==='segment.otsu'){
  const bypassed=histogram?.selectionMethod==='binary-input-pass-through';
  if(histogram)add({id:'otsu-histogram',kind:'histogram',title:bypassed?'輸入已有 0／255，沿用二值標記':'亮度直方圖與本次閾值',data:histogram,parameterNames:['threshold'],note:bypassed?'本圖只有 0 與 255。127 只分開既有標記；沒有執行 Otsu 256 閾值搜尋，也沒有選出最優閾值。':'橘線為採用閾值；若存在同值最大區間，區間本身不代表更高辨識正確率。',metrics:bypassed?[metric('二值分隔標記',127),metric('閾值搜尋','未執行')]:[metric('採用閾值',histogram.threshold??summary.threshold),metric('最大值候選',histogram.optimalThresholds?.length)]});
  if(histogram?.betweenClassVariance?.length)add({id:'otsu-variance',kind:'variance',title:'類間變異比較與同值平台',data:histogram,parameterNames:['threshold'],note:histogram.tieBreak?.reason||histogram.tieBreak||'只比較本圖 0–255 的分割閾值；類間變異不是工件辨識準確率。',metrics:[metric('同值平台',histogram.optimalPlateaus?.length),metric('採用閾值',histogram.threshold??summary.threshold)]});
  if(finite(summary.borderDarkRatio))add({id:'otsu-polarity',kind:'bars',title:'極性：影像邊界的亮暗比例',data:{bars:[{label:'深色邊界',value:summary.borderDarkRatio},{label:'淺色邊界',value:1-summary.borderDarkRatio}],max:1},parameterNames:['polarity'],note:'只以影像邊界推估背景方向；邊界比例相近時應拒判或明確指定極性。',metrics:[metric('採用前景',summary.polarity),metric('深色邊界比例',summary.borderDarkRatio)]});
 }
 if(op==='regions.components'){
  const candidates=evidence.candidates||summary.candidates||[];
  for(let start=0;start<candidates.length;start+=5)add({id:`components-${start}`,kind:'components',title:`候選面積與排除依據 ${start+1}–${Math.min(candidates.length,start+5)}`,data:{candidates:candidates.slice(start,start+5),selectedId:summary.selectedComponentId??evidence.selectedComponentId,minArea:p.minArea},parameterNames:['selection','componentId','minArea','excludeBoundary'],note:`面積排名不是辨識概率。最小面積為設定閘值，未記錄尋優。${evidence.candidatesTruncated||summary.candidatesTruncated?`僅保存／展示前 ${candidates.length} 筆，非全部候選。`:''}`,metrics:[metric('候選總數',summary.candidateCount??evidence.candidateCount),metric('符合條件',summary.eligibleCount??evidence.eligibleCount),metric('最小面積',p.minArea,'px²')]});
 }
 if(op==='shape.gear'){
  const shared={evidence,measurements,parameters:p,gates:decision.gates||[],featureStatus:trace.featureStatus},gallery=[['outline','原圖：真輪廓與採用齒峰'],['centers','中心：真正採用的擬合支持'],['tooth','單齒：原圖支持與局部曲線'],['gaps','缺口：相鄰峰與規格推定位置']].map(([stage,title])=>({id:`gear-${stage}`,kind:'gear-object',title,data:{...shared,stage},parameterNames:stage==='centers'?['workpieceCenter']:stage==='tooth'?['sampleCount','tipCapDropPx','minRootConcavityPx']:stage==='gaps'?['expectedTeeth']:[],metrics:[],evidenceRefs:refs,note:stage==='tooth'?'選齒後同步核對原圖支持、平滑窗口、峰突出度、峰距和根部檢查。菱形為投影檢查，藍點才是保存的實際支持。':stage==='centers'?'只展示最後真正採用的 refinement circle 與其支持點；孔中心獨立量測，沒有拿它選齒形中心。':stage==='gaps'?'空心候選由規格與相鄰實測峰推定；虛線弧不是實際缺損範圍。':'本圖先看真輪廓與採用點；點齒號進入單齒核對，用前一步／後一步切換處理圖。'}));figures.unshift(...gallery);
  const sweep=evidence.parameterSweep,b=sweep?.binding,sweepCurrent=b&&b.runId===result.runId&&b.pipelineId===plan.id&&b.pipelineRevision===plan.revision&&b.nodeId===node.id&&b.imageSha256===result.image?.sha256;if(sweep?.schema==='agentcv-gear-sweep-1'&&sweep.fixedCenter===true&&sweepCurrent){for(const axis of sweep.axes||[])add({id:`gear-sweep-${axis.parameterName}`,kind:'gear-sweep',title:`單軸試算：${decisionParameterLabel(axis.parameterName)}`,data:{...shared,sweep,axis},parameterNames:[axis.parameterName],note:'固定本次採用中心，其餘參數不變。散點僅代表已實際試過的值；未試區間不是可用範圍，也不自動修改原採用設定。'})}else add({id:'gear-sweep-unavailable',kind:'empty',title:'尚未保存當次單軸試算',parameterNames:['smoothingWindow','minProminence','minPeakDistance'],note:'本次沒有保存且綁定當前圖像／試跑的固定中心掃描。請重跑取得；五組局部比較仍可另看，不能冒充可用範圍。'});
  const spectrum=evidence.spectralCandidates||[];for(let start=0;start<spectrum.length;start+=5)add({id:`gear-spectrum-${start}`,kind:'bars',title:'為何試徑向週期模型：實際頻率候選',data:{bars:spectrum.slice(start,start+5).map(row=>({label:`頻率 ${row.frequency}`,value:row.amplitudePx}))},note:'徑向曲線存在這些實測頻率成分，因此可試週期齒形模型。頻率強度不等於齒數，也未比較其他算法族。',metrics:[metric('採用頻率',evidence.periodicity?.dominantFrequency),metric('振幅',evidence.periodicity?.amplitudePx,'px'),metric('徑向範圍',evidence.periodicity?.radialRangePx,'px')]});
  const comparisons=evidence.parameterComparisons||[],baseline=comparisons.findIndex(c=>c.baseline===true),selectedBaseline=baseline>=0?baseline:0;
  if(comparisons.length)add({id:'gear-comparisons',kind:'gear-comparisons',title:'本圖五組參數鄰域比較',data:{comparisons,baselineIndex:selectedBaseline,radialCurve:evidence.radialCurve||[],peaks:evidence.peaks||[]},parameterNames:['smoothingWindow','minProminence','minPeakDistance','countAgreementRequired'],note:'基準組是本次採用設定；其餘為局部擾動。峰數一致只描述已測鄰域，不能稱為最佳或通用穩定性保證。',metrics:[]});
  else add({id:'gear-no-comparisons',kind:'empty',title:'未取得參數比較',parameterNames:['smoothingWindow','minProminence','minPeakDistance'],note:'本次未保存可用候選比較，不補畫成比較成功。'});
 }
 if(op==='geometry.annulus'){
  for(const [key,label,quality]of [['outerCircle','外圓',evidence.outerQuality],['innerCircle','內圓',evidence.innerQuality]]){const circle=measurements[key];if(!circle)continue;add({id:`ring-${key}`,kind:'ring-gates',title:`${label}：實際殘差與品質閘值`,data:{circle,quality:quality||{},minCoverage:p.minAngularCoverageDeg},parameterNames:['maxRelativeResidual','maxResidualPx','minAngularCoverageDeg'],note:'工程閘值用於拒絕不適用的圓模型；它不是工件公差、尺寸誤差上界或準確率。',metrics:[metric('RMS',circle.rmsResidual,'px'),metric('RMS 閘值',quality?.rmsAllowancePx,'px'),metric('角度覆蓋',circle.angularCoverageDeg,'°'),metric('採用條件',quality?.accepted===true?'符合':quality?.accepted===false?'不符合':'未評估')]})}
 }
 if(op==='topology.holes'){
  const holes=[...(evidence.holes||[]).map(h=>({...h,included:true})),...(evidence.ignoredHoles||[]).map(h=>({...h,included:false}))],cutoff=p.minHoleArea??summary.parameters?.minHoleArea?.value;
  for(let start=0;start<holes.length;start+=5)add({id:`holes-area-${start}`,kind:'bars',title:'逐孔面積與最小面積閘值',data:{bars:holes.slice(start,start+5).map(h=>({label:h.id,value:h.area,accepted:h.included,reason:h.included?'封閉且達面積條件':'低於最小面積'})),threshold:cutoff},parameterNames:['minHoleArea'],note:'這些面積來自封閉背景區；未提供位置規格時，不推定缺孔或外連孔。',metrics:[metric('納入孔數',evidence.holes?.length),metric('排除孔數',evidence.ignoredHoles?.length),metric('最小孔面積',cutoff,'px²')]});
  const topology=evidence.expectedPositionComparisons||[];for(const row of topology)add({id:`hole-topology-${row.expectedId}`,kind:'topology',title:`${row.expectedId}：實際連通狀態`,data:row,parameterNames:['expectedPositions','positionTolerancePx','connectivity'],note:row.reason||'規格位置與實測孔一對一比對；位置規格不等於檢出的孔中心。',metrics:[metric('拓樸',row.status),metric('距離',row.distancePx,'px'),metric('周邊材料比例',row.foregroundSupport)]});
  if(!holes.length)add({id:'holes-empty',kind:'empty',title:'本圖未取得封閉孔',parameterNames:['minHoleArea'],note:'沒有封閉孔證據；不能把沒有偵測到孔直接當作合格。'});
 }
 if(op==='rules.evaluate'){
  const evaluation=evidence.rules?evidence:result.classification||{},rows=evaluation.rules||[];
  if(!rows.length)add({id:'rules-missing',kind:'rules',title:'規格未提供，保留 UNKNOWN',data:{rules:[]},parameterNames:['rules'],note:'量測可以保留。沒有使用者規格時，不畫合格範圍、不給 PASS。',metrics:[metric('規格條件',0),metric('品質判定','UNKNOWN')]});
  for(const row of rows)add({id:`rule-${row.id}`,kind:'rules',title:`${row.measurement}：量測與規格`,data:{rules:[{...row,measured:row.actual??byPath(measurements,row.measurement)}]},parameterNames:['rules'],note:evaluation.status==='UNKNOWN'?'本次總判定仍為 UNKNOWN；個別數值落在範圍內不能覆蓋特徵或標定的不確定性。':'規格來自使用者／方案；此圖只核對本次量測與指定上下限。',metrics:[metric('本次量測',row.actual,row.unit),metric('條件結果',row.status),metric('總判定',evaluation.status)]});
 }
 for(const [index,boundary]of (Array.isArray(model.justification?.boundaries)?model.justification.boundaries:[]).entries()){
  if(!boundary||typeof boundary!=='object')continue;
  const checked=model.deliveryAudit?.sections?.boundaries?.rows?.find(row=>row.index===index),failure={STOP:'停止',UNKNOWN:'保留 UNKNOWN',REQUEST_HUMAN:'要求人工複核'}[boundary.onFailure]||'未提供處理方式',note=`${boundary.condition||'本案適用前提待補'}；不成立時：${failure}。${checked?.status==='COMPLETE'?'本次檢查已保存，僅限本圖。':'這是作者提出的前提；本圖核對尚未完成。'}`;
  add({id:`authored-boundary-${index}`,kind:'boundary',title:`本案適用前提 ${index+1}`,data:{boundary:{code:'AUTHOR_BOUNDARY',message:note}},boundary:true,note,evidenceRefs:checked?.evidenceRefs||[]});
 }
 model.gates=decision.gates||[];
 for(let start=0;start<model.gates.length;start+=4){const gates=model.gates.slice(start,start+4),formulas=gates.filter(g=>g.thresholdSources).map(g=>`${g.id} 閘值推導：${gateSource(g.thresholdSources)}`).join('；');add({id:`acceptance-gates-${start}`,kind:'gates',title:`實際模型閘值 ${start+1}–${Math.min(start+4,model.gates.length)}`,data:{gates},parameterNames:gates.map(g=>g.parameterName||g.id),boundary:true,note:`按保存的執行階段顯示符合／拒判／未評估。工程模型閘不是製造公差或準確率，沒有尋優。${formulas}`,evidenceRefs:[...new Set(gates.flatMap(g=>g.evidenceRefs||[]))]})}
 // Every saved limitation remains reachable without hiding text in a scroll region.
 for(const [index,boundary]of model.boundaries.entries()){const chunks=String(boundary.message||boundary.code).match(/.{1,135}/gs)||['未記錄'];for(const [page,note]of chunks.entries())add({id:`boundary-${index}-${page}`,kind:'boundary',title:`適用邊界 · ${boundary.code} ${page+1}/${chunks.length}`,data:{boundary},boundary:true,note,evidenceRefs:boundary.evidenceRefs||[]})}
 if(status==='DIAGNOSTIC'&&['shape.gear','geometry.annulus','topology.holes','rules.evaluate'].includes(op))for(const figure of figures)figure.metrics=figure.metrics.map(item=>({...item,label:'候選 · '+item.label}));
 model.figures=figures;return model;
}

export function validatePipelineDecisionEvidence(model){
 const errors=[];if(model?.schema!=='agentcv-pipeline-decision-view-1')errors.push('SCHEMA');if(!model?.op||!model?.nodeId)errors.push('NODE');if(!Array.isArray(model?.figures)||!model.figures.length)errors.push('FIGURES');
 const kinds=new Set(['empty','input-output','histogram','variance','bars','components','gear-object','gear-sweep','gear-comparisons','gates','ring-gates','topology','rules','boundary']);for(const figure of model?.figures||[]){if(!figure.id||!kinds.has(figure.kind)||typeof figure.title!=='string')errors.push('FIGURE_SCHEMA');if(['STALE','LEGACY'].includes(model.status)&&figure.kind!=='empty')errors.push('STALE_FIGURE')}
 return {valid:errors.length===0,errors};
}
