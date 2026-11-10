import './pipeline-view.css';
import {iconButton,iconLabelButton} from './ui-icons.js';
import './workbench-icons.css';
import {OPERATOR_REGISTRY} from './pipeline-registry.js';
import {layoutOverlayLabels} from './pipeline-overlay-layout.js';
import {PipelineDecisionExplanationView} from './pipeline-decision-explanation-view.js';
import {buildPipelineDecisionEvidence,decisionSourceLabel} from './pipeline-decision-evidence.js';
import {fitPipelineViewport,observedPipelineBounds,fitPipelineLocator} from './pipeline-viewport.js';

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const finite=Number.isFinite;
const number=value=>finite(value)?new Intl.NumberFormat('zh-TW',{maximumFractionDigits:3}).format(value):'未取得';
const statusNames={OK:'已算出',PARTIAL:'部分完成',FAILED:'計算失敗',SKIPPED:'未執行',PASS:'通過規格',FAIL:'不符規格',UNKNOWN:'無法判定',STALE:'結果已失效',NOT_RUN:'尚未試跑'};
const statusText=status=>statusNames[status]||status||'尚未試跑';
const colors=['#a4efc3','#84ccff','#f4c67f','#d2afff','#ffb8a3','#75ddd5'];
const method=op=>{const s=String(op||'').toLowerCase();if(/gray|grey/.test(s))return 'gray';if(/otsu|threshold|binary/.test(s))return 'otsu';if(/component|connect/.test(s))return 'components';if(/gear|tooth/.test(s))return 'gear';if(/ring|annul|concentric/.test(s))return 'ring';if(/hole/.test(s))return 'holes';if(/two.?boundary|boundary/.test(s))return 'two_boundary';if(/rule|classif|decision/.test(s))return 'rules';if(/source|image_input/.test(s))return 'source';return 'feature'};
const copy={
 source:{title:'原始影像',tool:'保留原始像素，讓每一步都能回到同一張圖核對。',parameters:'這一步使用本圖原始解析度。',boundary:'裁切、縮放或換圖後必須重新計算。'},
 gray:{title:'灰階',tool:'將亮度作為分割的共同輸入，排除顏色通道的差異。',parameters:'依影像亮度轉換；本步不需要工程師先填公差。',boundary:'只靠亮度無法分開亮度相近的物體與背景。'},
 otsu:{title:'Otsu 分割',tool:'從本圖亮度分布找分界，產生可核對的前景遮罩。',parameters:'先看遮罩是否保留工件，再調整前景方向或閾值偏移。',boundary:'陰影、反光、背景紋理或黏連可能改變分割結果。'},
 components:{title:'連通區',tool:'把相連的前景像素分組，分開工件、碎屑和背景。',parameters:'最小面積排除零碎區域；過高會刪掉小特徵。',boundary:'接觸的物體會合併；被遮擋的輪廓可能分裂。'},
 gear:{title:'齒輪特徵',tool:'沿輪廓建立徑向曲線，以實際峰點核對齒數與齒距。',parameters:'峰點間距與平滑程度會影響相鄰齒峰的分離。',boundary:'缺齒、遮擋、透視或中心估計偏差會使徑向曲線失真。'},
 ring:{title:'圓環特徵',tool:'分別擬合內外輪廓，直接核對支持點、兩個中心與殘差。',parameters:'用殘差與有效支持點判斷擬合品質，不能把近圓外觀當成合格。',boundary:'透視、橢圓、遮擋或反光會影響圓擬合；px 尺寸不能代替實測 mm。'},
 holes:{title:'孔特徵',tool:'核對封閉背景區、逐孔 ID 及與外部背景的連通狀態。',parameters:'面積範圍用於排除噪點；外連區不能當作封閉孔。',boundary:'孔與邊界相通、孔間黏連、反光或遮擋時，孔數可能無法確定。'},
 two_boundary:{title:'兩層邊界',tool:'分開 lid 與 pkg 的四側支持，建立 Rust 幾何模型與 clearance 證據。',parameters:'尺寸先驗、像素容差與半徑試探只保留實際矩陣，不把單一候選當成穩定性證明。',boundary:'缺少獨立 pkg 外露側、遮擋或 gray8 支持不足時保留 UNKNOWN。'},
 rules:{title:'規格判定',tool:'只將本次有效量測與明確規格比較，產生可追溯的判定。',parameters:'缺少規格仍能看量測；補上規格後才可判斷是否合格。',boundary:'單圖試算不代表正式驗證；需要獨立圖片與人工答案核對。'},
 feature:{title:'目標特徵',tool:'由本圖算子輸出特徵，並保留圖像依據供核對。',parameters:'使用已記錄的本次參數；修改後需重跑。',boundary:'只在已實際試算的圖片與條件下有證據。'}
};
const parameterLabels={polarity:'前景方向',threshold:'固定閾值',thresholdOffset:'閾值偏移',offset:'閾值偏移',minArea:'最小面積',maxArea:'最大面積',minAreaRatio:'最小面積比例',maxAreaRatio:'最大面積比例',connectivity:'連通方式',smoothRadius:'平滑半徑',smoothingRadius:'平滑半徑',smoothingWindow:'平滑窗口',minPeakDistance:'最小齒峰距',minProminence:'最小峰值突出度',prominence:'峰值突出度',angularSamples:'角度取樣數',sampleCount:'角度取樣數',samples:'取樣數',minHoleArea:'最小孔面積',maxHoleArea:'最大孔面積',maxResidual:'最大擬合殘差',maxResidualPx:'最大擬合殘差 (px)',maxRelativeResidual:'最大相對殘差',minAngularCoverageDeg:'最小角度覆蓋 (°)',maxFitResidual:'最大擬合殘差',maxCenterOffset:'最大中心偏移',expectedTeeth:'目標齒數（規格）',expectedHoles:'目標孔數',maxParameterCountSpread:'參數比較允許齒數差',positionTolerancePx:'孔位置公差 (px)',componentId:'候選區域 ID',excludeBoundary:'排除接觸邊界物件',target:'目標特徵',selection:'區域選擇',method:'計算方法'};
const metricLabels={visibleTeeth:'可見齒數',missingTeeth:'推定缺齒數',excessTeeth:'多餘齒數',closedHoleCount:'封閉孔數',missingHoleCount:'規格位置缺孔',openHoleCount:'外連孔數',matchedHoleCount:'匹配孔數',unmatchedClosedHoleCount:'未匹配封閉孔',eccentricityPx:'偏心距',pitchVariation:'齒距變異',radialToothHeight:'徑向齒高',outerCircle:'外圓',innerCircle:'內圓',diameter:'直徑',radius:'半徑',rmsResidual:'擬合 RMS',relativeRmsResidual:'相對 RMS',maxAbsResidual:'最大殘差',angularCoverageDeg:'角度覆蓋',supportCount:'支持點數',toothCount:'齒數',teethCount:'齒數',peakCount:'峰點數',holeCount:'封閉孔數',count:'數量',outerRadius:'外半徑',innerRadius:'內半徑',outerDiameter:'外直徑',innerDiameter:'內直徑',concentricity:'同心度',centerOffset:'中心偏移',centerDistance:'中心距',rms:'擬合 RMS',outerRms:'外圓 RMS',innerRms:'內圓 RMS',residual:'擬合殘差',residualRms:'殘差 RMS',thickness:'環厚',meanThickness:'平均環厚',threshold:'實算閾值',foregroundPixels:'前景像素',componentCount:'連通區數',area:'面積',circularity:'圓度',angularPitchMean:'平均齒距角',angularPitchStd:'齒距角標準差',pitchStdDeg:'齒距角標準差',openCount:'外連區數',closedCount:'封閉孔數'};
const humanKey=key=>metricLabels[key]||parameterLabels[key]||key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ');
const targetNames={gear:'齒輪',ring:'圓環',holes:'孔',two_boundary:'兩層邊界',feature:'其他目標特徵'};
const reasonNames={SPEC_MISSING:'尚未設定規格，只顯示量測',UNCALIBRATED:'缺少有效標定，不能作 mm 合格判定',MEASUREMENT_INVALID:'特徵量測無效',FEATURE_UNAVAILABLE:'未取得有效特徵',NO_RULES:'尚未設定規格，只顯示量測'};
function flattenMetrics(value,prefix='',out=[]){
 if(!value||typeof value!=='object')return out;
 for(const [key,v]of Object.entries(value)){
  if(['evidence','artifacts','parameters','limitations','points','curves','contours','mask','runs','status','reason'].includes(key))continue;
  const name=prefix?`${prefix} · ${humanKey(key)}`:humanKey(key);
  if(finite(v))out.push({label:name,value:v,unit:/angle|pitch.*deg|deg/i.test(key)?'°':!/relative|ratio/i.test(key)&&/Px$|radius|diameter|thickness|rms|residual|center.*(offset|distance)|radialToothHeight/i.test(key)?'px':''});
  else if(v&&typeof v==='object'&&!Array.isArray(v)){
   if(finite(v.value))out.push({label:v.label||name,value:v.value,unit:v.unit||''});
   else if(!['center','outerCenter','innerCenter','workpieceCenter','holeCenter','bounds','boundingBox'].includes(key))flattenMetrics(v,name,out);
  }
 }
 return out;
}
function inputsOf(node){const value=node?.inputs;return Array.isArray(value)?value.map(v=>typeof v==='string'?v:v.nodeId||v.node||v.source).filter(Boolean):value&&typeof value==='object'?Object.values(value).map(v=>typeof v==='string'?v:v?.nodeId||v?.node||v?.source).filter(Boolean):[]}
function artifactsOf(result,node){const direct=node?.artifacts||[];if(direct.length)return direct;return (result?.artifacts||[]).filter(a=>a.nodeId===node?.id)}
function resultMatches(result,image,plan){
 if(!result||!image||!plan||result.status==='STALE')return false;
 if(result.pipelineId!==plan.id||result.pipelineRevision!==plan.revision)return false;
 if((result.image?.sourceSha256||result.image?.sha256)!==image.sha256)return false;
 if(result.image?.width!==image.width||result.image?.height!==image.height)return false;
 return true;
}
const planParameters=node=>node?.params||node?.parameters||{};
const definitionOf=node=>OPERATOR_REGISTRY[node?.op||node?.operator];
function parameterEntries(node,output,{all=false}={}){
 const schema=definitionOf(node)?.parameterSchema?.properties||{},configured=planParameters(node),computed=output?.parameters||{},keys=all?Object.keys(schema):Object.keys({...schema,...configured});
 return keys.filter(key=>schema[key]?.type!=='array'&&schema[key]?.type!=='object').map(key=>[key,configured[key]??computed[key]??schema[key]?.default,schema[key]||{}]);
}

/** A mounted, fixed-height workbench. All measurements and overlays come from pipelineResult. */
export class PipelineView{
 constructor(options={}){
  Object.assign(this,options);this.nodeId=null;this.mode='result';this.extent='image';this.visual='image';this.showDiagnostics=false;this.detailTab='tool';this.working=false;this.zoom=1;this.pan={x:0,y:0};this.rotation=0;this.cache=new Map();this.draft={target:null,task:'',specValue:''};this.invalidatedRun=null;this.job=0;
 }
 mount(container){if(this.container!==container){this.observer?.disconnect();this.container=container;this.observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>this.paint()):null;this.observer?.observe(container)}this.render();return this}
 refresh(){return this.render()}
 setWorking(value){this.working=!!value;return this.render()}
 destroy(){this.observer?.disconnect();this.dialog?.remove();this.dialog=null;this.evidenceViewer?.dialog.remove();this.evidenceViewer=null;this.evidenceDialog=null;this.container?.replaceChildren();this.container=null;this.cache.clear()}
 button(text,action,cls=''){const b=el('button',text,cls);b.type='button';b.onclick=()=>Promise.resolve().then(action).catch(error=>{this.onError?.(error.message||String(error))});return b}
 getModel(){
  const plan=this.project?.workflow?.pipelinePlan,image=this.project?.image,raw=image?.pipelineResult;
  let current=false;try{current=this.isResultCurrent?!!this.isResultCurrent(raw,image,plan):resultMatches(raw,image,plan)}catch{current=false}
  if(this.invalidatedRun&&this.invalidatedRun===(raw?.runId||raw))current=false;
  // Keep the last completed result available while a new calculation is in
  // flight.  `current` remains a freshness/contract flag, while
  // `displayResult` is deliberately allowed to point at the previous run so
  // canvases do not flash empty during continuous or batch execution.
  const displayResult=(current||this.working)&&raw?raw:null;
  const result=displayResult,nodes=plan?.nodes||[],selected=nodes.find(n=>n.id===this.nodeId)||nodes[0];
  const output=result?.nodes?.find(n=>n.id===selected?.id),op=selected?.operator||selected?.op;
  return {plan,image,raw,current,displayResult:!!displayResult,computing:this.working,result,nodes,selected,output,kind:method(op),status:raw&&!current?'STALE':raw?.status||'NOT_RUN'};
 }
 render(container,options={}){
  if(typeof options.working==='boolean')this.working=options.working;
  if(container&&container.nodeType===1&&this.container!==container)return this.mount(container);
  // A detached/hidden workbench still owns an open explanation dialog.
  // Revalidate it before returning so old run numbers cannot remain quotable.
  this.evidenceViewer?.refresh();
  if(!this.container)return this.getModel();
  const model=this.getModel();this.model=model;this.nodeId=model.selected?.id||null;
  if(model.result?.runId&&model.result.runId!==this.cachedRun){this.cache.clear();this.cachedRun=model.result.runId}
  const gearPlan=model.nodes.some(n=>n.op==='shape.gear');model.gearPlan=gearPlan;
  const binding=`${model.image?.id||''}:${model.plan?.id||''}:${gearPlan?'gear':'other'}`;if(binding!==this.binding){this.binding=binding;this.extent=gearPlan?'workpiece':'image';this.zoom=1;this.pan={x:0,y:0};this.rotation=0;this.cache.clear()}
  const root=el('section',undefined,'pipeline-workbench'+(gearPlan?' gear-workbench':''));root.setAttribute('aria-label','可執行算子方案');root.dataset.state=model.status;
  this.renderHeader(root,model);
  if(!model.plan?.nodes?.length)this.renderEmpty(root,model);else if(gearPlan){this.renderWorkspace(root,model);this.renderFlow(root,model);this.renderExplanation(root,model)}else{this.renderFlow(root,model);this.renderWorkspace(root,model);this.renderExplanation(root,model)}
  this.container.replaceChildren(root);this.root=root;
  this.evidenceViewer?.refresh();
  const token=++this.job;requestAnimationFrame(()=>{if(token===this.job)this.paint()});
  return model;
 }
 renderHeader(root,m){
  const header=el('header',undefined,'pipeline-header'),title=el('div',undefined,'pipeline-heading');
  const goal=m.plan?.goal||m.plan?.task?.description||m.plan?.task?.goal||m.plan?.task?.title||(typeof m.plan?.task==='string'?`${targetNames[m.plan.task]||m.plan.task}試算方案`:'從檢測目標開始'),heading=el('h2',m.gearPlan?'齒輪檢測':goal);heading.title=goal;
  const backend=m.current?(m.result?.backend==='rust-native'?'Rust 原生後端':m.result?.backend==='js-worker'?'JS worker':'未知後端'):null;
  title.append(el('small',`${m.gearPlan?`${m.image?.name||'原始相機圖'} · ${m.image?.width||'—'} × ${m.image?.height||'—'} px · 原圖座標`:'可執行方案 · 本機像素試算'}${backend?` · ${backend}`:''}`),heading);
  const states=el('div',undefined,'pipeline-states');
  for(const [label,state,cls]of [['方案',m.plan?'候選方案':'尚未建立','candidate'],['本圖',this.working?'試算中':m.current?'試算結果':m.raw?'已失效':'尚未試跑',m.current?'trial':'pending'],['正式',this.validationText(m),'validation']]){const p=el('span',undefined,`pipeline-state ${cls}`);p.append(el('small',label),el('strong',state));states.append(p)}
  title.append(states);header.append(title);
  if(this.project?.workflow?.pipelineValidation){const batch=this.button('圖片集試算',()=>this.openBatch(),'pipeline-subtle');batch.dataset.pipelineAction='batch-results';header.append(batch)}
  if(m.plan){const action=this.button(this.working?'正在試算…':m.current?'核對／批次試跑':'試跑目前圖',()=>this.runPrimary(m),'primary pipeline-primary');action.disabled=this.working||!m.image;action.dataset.pipelineAction=m.current?'batch':'run';header.append(action)}
  root.append(header);
 }
 validationText(m){const v=this.project?.workflow?.pipelineValidation;if(!v)return '尚未驗證';if((v.pipelineId||v.planId)&&(v.pipelineId||v.planId)!==m.plan?.id||(v.pipelineRevision??v.planRevision)!==m.plan?.revision||v.status==='STALE')return '舊版紀錄';if(v.scope==='TRIAL')return '僅批次試算';return ['PASSED','PASS'].includes(v.status)?'已驗證':v.status==='FAILED'?'未通過':v.status==='UNKNOWN'?'驗證未定':'已有紀錄'}
 async runPrimary(m){if(m.current){this.openReview(m);return}await this.perform(async()=>{await this.onRun?.({plan:m.plan});const feature=m.nodes.find(n=>['gear','ring','holes','feature'].includes(method(n.op||n.operator)));if(feature){this.nodeId=feature.id;if(feature.op==='shape.gear')this.mode='compare'}})}
 async perform(action){this.working=true;this.render();try{return await action()}finally{this.working=false;this.render()}}
 renderEmpty(root,m){
  const area=el('div',undefined,'pipeline-start intent-start');
  area.append(el('h3','在圖上表達想確認的事情'),el('p','圈選對象、標記關係，再與 Agent 一起建立方案。'));
  const open=this.button('開啟意圖畫板',()=>this.onOpenCanvas?.(),'primary');open.disabled=!m.image;area.append(open);root.append(area);
 }
 async create(){const target=this.draft.target;if(!target)throw Error('請先選擇要量測的特徵');const task=this.draft.task.trim()||`量測${targetNames[target]}特徵並顯示圖像依據`,parameters={features:{}},rules=[];if(this.draft.specValue.trim()){const value=Number(this.draft.specValue);if(!finite(value)||value<0||target!=='ring'&&target!=='two_boundary'&&!Number.isInteger(value)||target==='gear'&&value<3)throw Error('請輸入有效規格數字');if(target==='gear'){parameters.features.expectedTeeth=value;rules.push({measurement:'visibleTeeth',equals:value,unit:'count'})}else if(target==='ring')rules.push({measurement:'centerDistance',max:value,unit:'px'});else if(target==='holes')rules.push({measurement:'closedHoleCount',equals:value,unit:'count'});}await this.perform(()=>this.onCreate?.({target,task,parameters,rules}))}
 renderFlow(root,m){
  if(m.gearPlan){this.renderImageFlow(root,m);return}
  const flow=el('nav',undefined,'pipeline-flow');flow.setAttribute('aria-label','算子資料流程');
  m.nodes.forEach((node,index)=>{const output=m.result?.nodes?.find(n=>n.id===node.id),b=this.button('',()=>this.select(node.id),`pipeline-node${node.id===this.nodeId?' active':''}`);b.dataset.pipelineNode=node.id;b.setAttribute('aria-current',node.id===this.nodeId?'step':'false');const label=node.label||node.title||copy[method(node.operator||node.op)].title;b.append(el('span',index+1,'pipeline-node-number'),el('strong',label),el('small',m.current?statusText(output?.status):m.status==='STALE'?'待重跑':'待試跑'));b.title=`${label} · 輸入：${inputsOf(node).join('、')||'原始影像'}`;flow.append(b)});root.append(flow);
 }
 renderImageFlow(root,m){
  const flow=el('nav',undefined,'pipeline-image-flow');flow.setAttribute('aria-label','處理圖序列，點圖或使用前一步與後一步');this.thumbnailCanvases=[];
  const stages=m.nodes.filter(n=>n.op!=='image.grayscale'&&!(n.op==='segment.otsu'&&m.result?.nodes?.find(t=>t.id===n.id)?.outputSummary?.executionMode==='pass-through'));
  const inputNode=m.nodes.find(n=>n.op==='image.grayscale');if(inputNode)stages.unshift({...inputNode,original:true});this.visibleImageStages=stages;
  const currentIndex=Math.max(0,stages.findIndex(n=>n.id===this.nodeId));
  const previous=iconButton(this.button(undefined,()=>this.select(stages[currentIndex-1].id),'pipeline-step-arrow'),'previous','前一步處理圖'),next=iconButton(this.button(undefined,()=>this.select(stages[currentIndex+1].id),'pipeline-step-arrow'),'next','後一步處理圖');previous.disabled=currentIndex===0;next.disabled=currentIndex===stages.length-1;flow.append(previous);
  for(const [index,node]of stages.entries()){
    const output=m.result?.nodes?.find(n=>n.id===node.id),b=this.button('',()=>this.select(node.id),`pipeline-stage-image${node.id===this.nodeId?' active':''}`),canvas=el('canvas'),name=node.original?'原圖':node.op==='segment.otsu'?'前景分割':node.op==='regions.components'?'工件輪廓':node.op==='shape.gear'?'逐齒與中心':'規格核對';
    canvas.setAttribute('aria-label',name+'縮圖');b.dataset.pipelineNode=node.id;b.setAttribute('aria-current',node.id===this.nodeId?'step':'false');
    const visual=el('div',undefined,'pipeline-stage-visual'),caption=el('div',undefined,'pipeline-stage-caption');visual.append(canvas);caption.append(el('strong',`${index+1} ${name}`),el('small',node.original?(m.result?.nodes?.find(t=>t.op==='segment.otsu')?.outputSummary?.executionMode==='pass-through'?'二值原圖 · 跳過灰階與閾值搜尋':'原圖／輸入格式記錄'):m.current?statusText(output?.status):'待試跑'));caption.title=caption.textContent;b.append(visual,caption);flow.append(b);this.thumbnailCanvases.push({canvas,node,original:node.original});
  }
  flow.append(next);root.append(flow);
 }
 select(id){this.closeEvidence();this.nodeId=id;this.mode=this.project?.workflow?.pipelinePlan?.nodes?.some(n=>n.op==='shape.gear')?'compare':'result';this.visual='image';this.showDiagnostics=false;this.detailTab='tool';this.zoom=1;this.pan={x:0,y:0};this.rotation=0;this.render()}
 renderWorkspace(root,m){
  const main=el('div',undefined,'pipeline-main'),board=el('section',undefined,'pipeline-board'),isOriginal=m.gearPlan&&m.selected?.op==='image.grayscale';
  const toolbar=el('header',undefined,'pipeline-board-toolbar'),modes=el('div',undefined,'pipeline-image-modes'),visuals=el('div',undefined,'pipeline-visual-modes'),left=el('div',undefined,'pipeline-toolbar-left'),curves=this.nodeCurves(m);if(!curves.length)this.visual='image';
  for(const [id,label]of [['image','影像'],['curves','曲線']]){const b=this.button(label,()=>{this.visual=id;this.render()},id===this.visual?'active':'');b.dataset.pipelineVisual=id;b.setAttribute('aria-pressed',String(id===this.visual));b.disabled=id==='curves'&&!curves.length;visuals.append(b)}
  for(const [id,label]of [['input','輸入'],['result','本圖結果'],['compare','並排核對']]){const b=this.button(label,()=>{this.mode=id;this.render()},id===this.mode?'active':'');if(id==='compare')iconLabelButton(b,'compare',label);b.setAttribute('aria-pressed',String(id===this.mode));b.dataset.pipelineMode=id;modes.append(b)}
  const controls=el('div',undefined,'pipeline-canvas-controls');
  if(m.gearPlan)for(const [extent,label]of [['image','全圖'],['workpiece','工件']]){const b=this.button(label,()=>{this.extent=extent;this.zoom=1;this.pan={x:0,y:0};this.rotation=0;this.render()},(isOriginal?'image':this.extent)===extent?'active':'');b.dataset.pipelineExtent=extent;b.disabled=extent==='workpiece'&&(isOriginal||!observedPipelineBounds(m.result));controls.append(b)}
  controls.append(iconButton(this.button(undefined,()=>this.changeZoom(.8)),'zoom-out','縮小'),iconButton(this.button(undefined,()=>{this.zoom=1;this.pan={x:0,y:0};this.rotation=0;this.paint()}),'fit','配適畫面'),iconButton(this.button(undefined,()=>this.changeZoom(1.25)),'zoom-in','放大'));modes.hidden=this.visual!=='image'||isOriginal;controls.hidden=this.visual!=='image';left.append(visuals,modes);const evidence=this.button(isOriginal?'輸入檢查紀錄':'選擇依據',()=>this.openEvidence('evidence'),'pipeline-evidence-entry');evidence.dataset.pipelineAction='evidence';toolbar.append(left,evidence,controls);board.append(toolbar);
  const stage=el('div',undefined,`pipeline-panes${this.mode==='compare'&&!isOriginal?' compare':''}`);this.canvases=[];
  this.curveCanvas=null;if(this.visual==='image'){for(const type of isOriginal?['original']:this.mode==='compare'?['input','result']:[this.mode]){const pane=el('figure',undefined,'pipeline-pane'),caption=el('figcaption',isOriginal?`相機原圖 · ${m.image?.width} × ${m.image?.height} px · 未改動原圖`:type==='input'?(m.gearPlan?'前一步 · ':'')+this.inputCaption(m):`${m.gearPlan?'本步 · ':''}${copy[m.kind].title} · ${this.nodeStatus(m)}${m.kind==='gear'?' · M＝按齒距推定的位置，非實測':''}`),holder=el('div',undefined,'pipeline-canvas-holder'),canvas=el('canvas');canvas.setAttribute('aria-label',isOriginal?'完整相機原圖':type==='input'?'前一步處理結果':'本步處理結果與特徵疊圖');canvas.tabIndex=0;holder.append(canvas);pane.append(caption,holder);stage.append(pane);this.bindCanvas(canvas);this.canvases.push({canvas,type})}board.append(stage)}
  else{const plot=el('figure',undefined,'pipeline-chart-stage');this.curveCanvas=el('canvas');this.curveCanvas.setAttribute('aria-label',curves.map(c=>c.label).join('、')||'本節點數據曲線');plot.append(this.curveCanvas);board.append(plot)}
  const navNodes=m.gearPlan?m.nodes.filter(n=>n.op!=='segment.otsu'||m.result?.nodes?.find(t=>t.id===n.id)?.outputSummary?.executionMode!=='pass-through'):m.nodes;
  const footer=el('footer',undefined,'pipeline-board-footer'),idx=navNodes.findIndex(n=>n.id===m.selected.id);const prev=iconButton(this.button(undefined,()=>this.select(navNodes[idx-1].id)),'previous','前一步處理圖'),next=iconButton(this.button(undefined,()=>this.select(navNodes[idx+1].id)),'next','後一步處理圖');prev.disabled=idx<=0;next.disabled=idx>=navNodes.length-1;footer.append(prev,el('span',`${idx+1} / ${navNodes.length} · ${m.image?.name||'尚無圖片'}${m.gearPlan?' · 原圖比例／原圖座標':''}`),next);board.append(footer);
  main.append(board,this.renderInspector(m));root.append(main);
 }
 inputCaption(m){const ids=inputsOf(m.selected);return ids.length?`輸入：${ids.map(id=>{const n=m.nodes.find(n=>n.id===id||id.startsWith(n.id+'.'));return n?.label||n?.title||(n?copy[method(n.operator||n.op)].title:id)}).join('、')}`:'輸入：原始影像'}
 measurementUncertain(m){return m.output?.featureStatus==='UNKNOWN'||m.kind==='rules'&&m.result?.nodes?.some(n=>n.featureStatus==='UNKNOWN');}
 nodeStatus(m){return this.working?'重新計算中':!m.current?(m.raw?'舊結果已隱藏':'尚未試跑'):this.measurementUncertain(m)?'診斷輸出 · 無法確定':statusText(m.output?.status)}
 metrics(m){
  if(!m.current||m.output?.status!=='OK')return [];
  const summary=flattenMetrics(m.output.outputSummary),measurements=flattenMetrics(m.result?.measurements);
  const data=['gear','ring','holes','feature','rules'].includes(m.kind)?measurements:summary;
  const all=data.length?data:summary,priority={gear:['可見齒數','推定缺齒數','齒距變異','偏心距','徑向齒高'],ring:['外直徑','內直徑','中心距','封閉孔數'],holes:['封閉孔數','規格位置缺孔','外連孔數','匹配孔數']}[m.kind]||[];
  const qualified=this.measurementUncertain(m)?all.map(item=>({...item,label:item.label+'（候選）'})):all;return qualified.filter((item,index)=>qualified.findIndex(x=>x.label===item.label)===index).sort((a,b)=>{const ai=priority.indexOf(a.label),bi=priority.indexOf(b.label);return (ai<0?999:ai)-(bi<0?999:bi)});
 }
 renderInspector(m){
  if(m.gearPlan&&m.selected?.op==='image.grayscale'){
   const side=el('aside',undefined,'pipeline-inspector'),raster=m.image&&this.project.pixels?.get(m.image.id),inspection=raster?.inputInspection||raster?.grayProvenance?.inputInspection;
   side.append(el('strong','原圖輸入'),el('span',`${m.image?.width||'—'} × ${m.image?.height||'—'} px`),el('span',inspection?.strictBinary?'只有 0 / 255 · 無需灰階化與閾值搜尋':inspection?.achromatic?'原圖已是灰階 · 跳過色彩轉換':'含色彩像素 · 亮度格式準備'),el('small','格式檢查不是齒輪識別的依據'));return side;
  }
  const side=el('aside',undefined,'pipeline-inspector'),heading=el('div',undefined,'pipeline-inspector-heading');heading.append(el('small',`方案 r${m.plan.revision||1}`),el('h3',m.selected.label||m.selected.title||copy[m.kind].title));side.append(heading);
  const state=el('div',undefined,`pipeline-node-state ${m.current&&m.output?.status==='OK'&&!this.measurementUncertain(m)?'computed':'pending'}`);state.title=this.nodeMessage(m);state.append(el('strong',this.nodeStatus(m)));if(this.working&&m.displayResult)state.append(el('small','計算中；保留上一輪輸出。'));if(this.measurementUncertain(m))state.append(el('small','診斷候選，不能用於驗收。'));side.append(state);
  const metrics=this.metrics(m),grid=el('div',undefined,'pipeline-metrics');
  const limit=m.kind==='rules'?2:4;metrics.slice(0,limit).forEach(metric=>grid.append(this.metricCard(metric)));if(!metrics.length){const placeholder=el('div',undefined,'pipeline-metric-empty');placeholder.append(el('strong','—'),el('small',m.kind==='rules'?'等待本次有效量測':'試跑後顯示實算數字'));grid.append(placeholder)}side.append(grid);
  if(metrics.length>limit)side.append(this.button(`全部 ${metrics.length} 項量測`,()=>this.openDetails('metrics'),'pipeline-subtle'));
  if(m.kind==='rules'&&m.current){const result=m.result.classification||{status:'UNKNOWN'},decision=el('div',undefined,`pipeline-decision ${result.status}`);decision.append(el('strong',statusText(result.status)),el('small',reasonNames[result.reason]||result.message||result.reason||'請核對明確規格與量測依據'));side.append(decision)}
  const actions=el('div',undefined,'pipeline-inspector-actions');actions.append(iconLabelButton(this.button(m.kind==='rules'?'規格／公差…':'參數…',()=>this.openDetails('parameters'),'pipeline-subtle'),'settings'));if(m.current)actions.append(iconLabelButton(this.button('重新試跑',()=>this.perform(()=>this.onRun?.({plan:m.plan})),'pipeline-subtle'),'rerun'));side.append(actions);return side;
 }
 nodeMessage(m){if(this.working)return m.displayResult?'計算中；保留上一輪輸出。':'正在計算，尚無上一輪輸出。';if(!m.current)return m.raw?'參數、圖片或方案已變更，請重新試跑。':'先試跑，查看本節點的圖與數字。';if(m.output?.status==='FAILED')return m.output.error?.message||m.output.error||'本節點失敗，後續不能沿用舊量測。';if(m.output?.status==='SKIPPED')return '上游輸出無效，本節點尚未執行。';if(this.measurementUncertain(m))return '以下為本次診斷候選，不能當作有效驗收量測。';return m.output?.durationMs!=null?`本次實算 ${number(m.output.durationMs)} ms`:'本圖與目前方案一致。'}
 metricCard(metric){const card=el('div',undefined,'pipeline-metric');card.append(el('small',metric.label),el('strong',`${number(metric.value)}${metric.unit?' '+metric.unit:''}`));return card}
 parameterControl(m,key,value,schema={}){
  const label=el('label',humanKey(key));let input;const numeric=['integer','number'].includes(schema.type)||typeof value==='number';
  if(schema.enum){input=el('select');const names={auto:'自動',dark:'深色工件',bright:'淺色工件',unique:'唯一候選',largest:'最大區域',component:'指定候選'};for(const v of schema.enum){const o=el('option',names[v]||v);o.value=v;input.append(o)}input.value=value??schema.default??schema.enum[0]}
  else if(schema.type==='boolean'||typeof value==='boolean'){input=el('select');for(const [v,text]of [['true','開啟'],['false','關閉']]){const o=el('option',text);o.value=v;input.append(o)}input.value=String(value??false)}
  else{input=el('input');input.type=numeric?'number':'text';input.value=value??'';input.placeholder='自動';if(numeric){input.step=schema.type==='integer'?'1':'any';if(schema.minimum!==undefined)input.min=schema.minimum;if(schema.maximum!==undefined)input.max=schema.maximum}}
  input.setAttribute('aria-label',humanKey(key));input.dataset.pipelineParameter=key;input.disabled=this.working;
  input.onchange=()=>{const blank=input.tagName==='INPUT'&&!input.value.trim(),next=blank?undefined:numeric?Number(input.value):schema.type==='boolean'||typeof value==='boolean'?input.value==='true':input.value;if(!blank&&numeric&&(!finite(next)||!input.checkValidity())){input.value=value??'';this.onError?.('參數超出有效範圍');return}this.updateParameter(m,key,next).catch(error=>this.onError?.(error.message))};label.append(input);return label;
 }
 async updateParameter(m,key,value){const parameters={...planParameters(m.selected)};if(value===undefined)delete parameters[key];else parameters[key]=value;this.invalidatedRun=m.raw?.runId||m.raw||null;this.dialog?.close();await this.onUpdate?.({type:'parameters',nodeId:m.selected.id,parameters});this.render()}
 paginate(body,items,{size=1,draw,empty='尚無資料',page=0}={}){
  const content=el('div',undefined,'pipeline-dialog-page'),pager=el('nav',undefined,'pipeline-dialog-pager');pager.setAttribute('aria-label','詳情分頁');body.append(content,pager);
  const paint=next=>{const total=Math.max(1,Math.ceil(items.length/size)),index=Math.max(0,Math.min(next,total-1));content.replaceChildren();pager.replaceChildren();body.dataset.page=String(index);body.dataset.pages=String(total);if(items.length)draw(content,items.slice(index*size,index*size+size),index);else content.append(el('p',empty));const prev=iconButton(this.button(undefined,()=>paint(index-1)),'previous','上一頁'),forward=iconButton(this.button(undefined,()=>paint(index+1)),'next','下一頁');prev.disabled=index===0;forward.disabled=index>=total-1;prev.dataset.pageAction='previous';forward.dataset.pageAction='next';pager.append(prev,el('span',`${index+1} / ${total}`),forward)};paint(page);return paint;
 }
 textPages(values,limit=170){return values.flatMap(value=>{const text=String(value||'');if(!text)return [];const pages=[];for(let i=0;i<text.length;i+=limit)pages.push(text.slice(i,i+limit));return pages})}
 renderRulesEditor(body,m){
  const rules=(planParameters(m.selected).rules||m.plan.rules||[]).map(rule=>({...rule})),form=el('form',undefined,'pipeline-rules-editor'),rows=el('div',undefined,'pipeline-rule-rows'),pager=el('nav',undefined,'pipeline-dialog-pager');let index=0;
  body.classList.add('pipeline-rules-body');pager.setAttribute('aria-label','規格條件分頁');
  const measurements=m.result?.measurements||{},keys=new Set(['visibleTeeth','closedHoleCount','outerDiameter','innerDiameter','centerDistance','eccentricityPx','missingTeeth','openHoleCount']);
  const collect=(object,prefix='')=>{for(const [key,value]of Object.entries(object||{})){const name=prefix?`${prefix}.${key}`:key;if(finite(value))keys.add(name);else if(value&&typeof value==='object'&&!Array.isArray(value)&&!['center','workpieceCenter','holeCenter'].includes(key))collect(value,name)}};collect(measurements);
  const draw=()=>{rows.replaceChildren();pager.replaceChildren();index=Math.max(0,Math.min(index,rules.length-1));form.dataset.rulePage=String(index);form.dataset.ruleTotal=String(rules.length);const rule=rules[index];
   if(!rule)rows.append(el('p','尚未設定規格。可新增條件；留空規格只顯示量測。'));
   else{
   const row=el('div',undefined,'pipeline-rule-row'),measurement=el('label','量測項目'),select=el('select');for(const key of new Set([...keys,rule.measurement].filter(Boolean))){const option=el('option',key.split('.').map(humanKey).join(' · '));option.value=key;select.append(option)}select.value=rule.measurement||[...keys][0];select.dataset.ruleField='measurement';measurement.append(select);row.append(measurement);
   select.onchange=()=>rule.measurement=select.value;
   for(const [key,label]of [['min','下限'],['max','上限'],['equals','等於']]){const field=el('label',label),input=el('input');input.type=key==='equals'?'text':'number';if(input.type==='number')input.step='any';input.value=rule[key]??'';input.placeholder='不限制';input.dataset.ruleField=key;input.oninput=()=>{const value=input.value.trim();if(!value)delete rule[key];else rule[key]=key!=='equals'||/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value)?Number(value):value==='true'?true:value==='false'?false:value};field.append(input);row.append(field)}
   const unit=el('label','單位'),unitSelect=el('select');for(const value of new Set(['px','count','deg','mm','ratio',rule.unit].filter(Boolean))){const option=el('option',{px:'像素',count:'數量',deg:'角度',mm:'毫米',ratio:'比例'}[value]||value);option.value=value;unitSelect.append(option)}unitSelect.value=rule.unit||(/Teeth|Count/.test(select.value)?'count':'px');unitSelect.dataset.ruleField='unit';unitSelect.onchange=()=>rule.unit=unitSelect.value;unit.append(unitSelect);row.append(unit,this.button('移除此條件',()=>{rules.splice(index,1);draw()},'pipeline-subtle'));row.dataset.ruleId=rule.id||'';rows.append(row);
   }
   const prev=iconButton(this.button(undefined,()=>{index--;draw()}),'previous','上一條規格'),next=iconButton(this.button(undefined,()=>{index++;draw()}),'next','下一條規格');prev.disabled=index<=0;next.disabled=index>=rules.length-1;prev.dataset.rulePageAction='previous';next.dataset.rulePageAction='next';pager.append(prev,el('span',rules.length?`${index+1} / ${rules.length} 條`:'0 條'),next);
  };
  const actions=el('footer'),add=this.button('＋ 加入規格條件',()=>{rules.push({measurement:[...keys][0],unit:'count'});index=rules.length-1;draw()},'pipeline-subtle'),save=el('button','儲存全部規格','primary');save.type='submit';actions.append(add,save);form.append(el('p','一次編輯一條；切換條件保留未儲存的修改。'),rows,pager,actions);draw();
  form.onsubmit=event=>{event.preventDefault();for(const [ruleIndex,rule]of rules.entries()){if(!['min','max'].some(key=>finite(rule[key]))&&rule.equals===undefined){index=ruleIndex;draw();this.onError?.(`第 ${ruleIndex+1} 條需要下限、上限或等於值。`);return}if(finite(rule.min)&&finite(rule.max)&&rule.min>rule.max){index=ruleIndex;draw();this.onError?.('規格下限不能大於上限');return}}this.updateParameter(m,'rules',rules.map(rule=>({...rule}))).catch(error=>this.onError?.(error.message))};body.append(form);
 }
 renderExplanation(root,m){
  const detail=el('section',undefined,'pipeline-explanation'),tabs=el('nav');tabs.setAttribute('aria-label','本步依據與邊界');
  for(const [id,label]of [['tool','為何用此工具'],['parameters','為何用這組參數'],['boundary','適用邊界']]){const b=this.button(label,()=>this.openEvidence(id),this.detailTab===id?'active':'');b.setAttribute('aria-pressed',String(this.detailTab===id));tabs.append(b)}
  const saved=buildPipelineDecisionEvidence({plan:m.plan,node:m.selected,trace:m.output,result:m.raw,current:m.current}),content=el('div',undefined,'pipeline-explanation-copy');content.append(el('p',`${decisionSourceLabel(saved.toolChoice.setBy||saved.toolChoice.source)} · ${saved.parameterChoices.length} 項參數來源${m.current?' · 圖像、比較與工程閘值已保存':' · 本圖實算需試跑'}`));content.append(this.button('打開大圖與選擇依據',()=>this.openEvidence(this.detailTab),'pipeline-subtle'));detail.append(tabs,content);root.append(detail);
 }
 openEvidence(section='tool',options={}){if(!['evidence','tool','parameters','boundary'].includes(section))throw Error('不支持的選擇依據分類');if(!this.getModel().selected)throw Error('請先建立方案');this.dialog?.close();if(!this.evidenceViewer)this.evidenceViewer=new PipelineDecisionExplanationView(this);this.evidenceDialog=this.evidenceViewer.dialog;return this.evidenceViewer.openFor(section,options)}
 closeEvidence(){this.evidenceViewer?.close();this.activeEvidenceSection=null;this.activeEvidenceParameter=null}
 evidenceSnapshot(){const viewer=this.evidenceViewer;if(viewer?.dialog.open&&!viewer.isBindingCurrent(viewer.report?.binding)){this.closeEvidence();return null}return viewer?.snapshot()||null}
 ask(m){const question=`請解釋目前試算方案的「${m.selected.label||copy[m.kind].title}」：以本圖輸入與輸出說明為何用此工具、參數與替代方案比較，以及適用邊界。請區分已量測與尚未驗證的結論。`;return this.onAsk?.({question,nodeId:m.selected.id})}
 openDetails(tab,parameterName){
  const m=this.getModel(),dialog=this.makeDialog(`${m.selected?.label||copy[m.kind].title} · ${tab==='metrics'?'全部量測':tab==='parameters'?'參數與比較':tab==='boundary'?'適用邊界':'工具依據'}`),body=el('div',undefined,'pipeline-dialog-body');
  if(tab==='metrics')this.paginate(body,this.metrics(m),{size:6,draw:(page,metrics)=>{const grid=el('div',undefined,'pipeline-dialog-metrics');metrics.forEach(metric=>grid.append(this.metricCard(metric)));page.append(grid)}});
  else if(tab==='parameters'){
   if(m.kind==='rules')this.renderRulesEditor(body,m);
   else{const pages=parameterEntries(m.selected,m.output,{all:true}).map(entry=>({entry})),sources=m.output?.parameterSources||{};for(const text of this.textPages(Object.entries(sources).map(([key,value])=>`${humanKey(key)}：${typeof value==='string'?value:value?.reason||value?.source||'依本次方案設定'}`)))pages.push({text});if(!pages.length)pages.push({text:copy[m.kind].parameters});this.paginate(body,pages,{page:parameterName?Math.max(0,pages.findIndex(page=>page.entry?.[0]===parameterName)):0,draw:(page,[item])=>{page.append(el('p',copy[m.kind].parameters));if(item.entry){const [key,value,schema]=item.entry,fields=el('div',undefined,'pipeline-dialog-fields');fields.append(this.parameterControl(m,key,value,schema));page.append(fields)}else page.append(el('p',item.text));page.append(el('p','修改參數會使舊結果失效，請重新試跑核對。','pipeline-dialog-note'))}})}
  }else if(tab==='boundary'){const texts=this.textPages([copy[m.kind].boundary,...(m.result?.limitations||[]).map(limit=>typeof limit==='string'?limit:limit.message||limit.reason||''),'本圖試算與正式驗證分開記錄。未提供公差時，保留量測並顯示無法判定。']);this.paginate(body,texts,{draw:(page,[text])=>page.append(el('p',text))})}
  else{const metrics=m.current?flattenMetrics(m.output?.outputSummary):[],pages=[{intro:true}];for(let i=0;i<metrics.length;i+=6)pages.push({metrics:metrics.slice(i,i+6)});this.paginate(body,pages,{draw:(page,[item])=>{if(item.intro){page.append(el('p',copy[m.kind].tool),el('p',`${this.inputCaption(m)} → ${copy[m.kind].title} → ${this.nodeStatus(m)}`));page.append(this.button(this.showDiagnostics?'隱藏支持點與候選圓':'顯示支持點與候選圓',()=>{this.showDiagnostics=!this.showDiagnostics;this.dialog.close();this.visual='image';this.render()},'pipeline-subtle'),this.button('請 Agent 解釋本步',()=>this.ask(m),'pipeline-subtle'))}else{const grid=el('div',undefined,'pipeline-dialog-metrics');item.metrics.forEach(metric=>grid.append(this.metricCard(metric)));page.append(grid)}}})}
  dialog.append(body);this.showDialog(dialog);
 }
 makeDialog(title){this.dialog?.remove();const dialog=el('dialog',undefined,'pipeline-dialog'),header=el('header');header.append(el('h2',title),iconButton(this.button(undefined,()=>dialog.close(),'pipeline-dialog-close'),'close','關閉'));dialog.append(header);dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}});this.dialog=dialog;document.body.append(dialog);return dialog}
 showDialog(dialog){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','')}
 openReview(m){
  const dialog=this.makeDialog('核對試算，再跑圖片集'),body=el('div',undefined,'pipeline-dialog-body'),c=m.result?.classification||{status:'UNKNOWN'};
  const metrics=flattenMetrics(m.result?.measurements),pages=[{summary:`本圖判定：${statusText(c.status)}。${reasonNames[c.reason]||c.message||c.reason||''}`}];for(let i=0;i<metrics.length;i+=6)pages.push({metrics:metrics.slice(i,i+6)});this.paginate(body,pages,{draw:(page,[item])=>{if(item.summary)page.append(el('p',item.summary),el('p','請核對輪廓、特徵點與數字。批次試跑只建立試算證據，正式驗證仍需人工答案。','pipeline-dialog-note'));else{const grid=el('div',undefined,'pipeline-dialog-metrics');item.metrics.forEach(metric=>grid.append(this.metricCard(metric)));page.append(grid)}}});
  const actions=el('footer');actions.append(this.button('回到圖上核對',()=>dialog.close()),this.button('批次試跑',async()=>{dialog.close();await this.perform(()=>this.onBatch?.({plan:m.plan}))},'primary'));dialog.append(body,actions);this.showDialog(dialog);
 }
 openBatch(page=0){
  const validation=this.project?.workflow?.pipelineValidation,plan=this.project?.workflow?.pipelinePlan,dialog=this.makeDialog('圖片集試算 · 尚非正式驗證'),body=el('div',undefined,'pipeline-dialog-body');
  if(!validation){body.append(el('p','尚無圖片集試算紀錄。'));dialog.append(body);this.showDialog(dialog);return}
   const stale=validation.status==='STALE'||(validation.pipelineRevision??validation.planRevision)!==plan?.revision||(validation.pipelineId||validation.planId)&&(validation.pipelineId||validation.planId)!==plan?.id;
  const content=el('div',undefined,'pipeline-dialog-page');body.append(content);content.append(el('p',stale?'方案已改變，舊圖片集試算不可作為本次證據。':`${validation.processed??0} / ${validation.total??0} 張已試算 · ${validation.labeled??0} 張有人工答案 · ${validation.unknown??0} 張無法判定`,'pipeline-dialog-note'));
  const rows=stale?[]:validation.rows||[],table=el('table',undefined,'pipeline-batch-table'),thead=el('thead'),tr=el('tr');for(const name of ['圖片','量測','試算判定','人工答案','核對'])tr.append(el('th',name));thead.append(tr);table.append(thead);const tbody=el('tbody');
  const pages=Math.max(1,Math.ceil(rows.length/4)),index=Math.max(0,Math.min(page,pages-1));body.dataset.page=String(index);body.dataset.pages=String(pages);
  for(const row of rows.slice(index*4,index*4+4)){const line=el('tr'),image=el('td'),link=this.button(row.imageName||'圖片',()=>{dialog.close();if(this.onSelectImage)this.onSelectImage(row.imageId);else this.project.selectImage?.(row.imageId);this.render()},'pipeline-subtle');image.append(link);line.append(image,el('td',row.measured?'有量測':'未取得'),el('td',{OK:'通過規格',NG:'不符規格',UNKNOWN:'無法判定'}[row.actual]||'未試跑'),el('td',row.expected||'未標註'),el('td',row.match===true?'一致':row.match===false?'不一致':'待核對'));tbody.append(line)}table.append(tbody);content.append(table,el('p','沒有人工答案時不顯示準確率。這些為批次試算，尚非正式驗證。'));
  const pager=el('nav',undefined,'pipeline-dialog-pager'),prev=iconButton(this.button(undefined,()=>this.openBatch(index-1)),'previous','上一頁'),next=iconButton(this.button(undefined,()=>this.openBatch(index+1)),'next','下一頁');prev.disabled=index===0;next.disabled=index===pages-1;prev.dataset.pageAction='previous';next.dataset.pageAction='next';pager.append(prev,el('span',`${index+1} / ${pages}`),next);body.append(pager);dialog.append(body);this.showDialog(dialog);
 }
 nodeArtifacts(m,node=m.output){
  if(!m.displayResult||node?.status!=='OK')return [];
  const artifacts=[...artifactsOf(m.result,node)],evidence=artifacts.find(a=>a.type==='evidence')?.data||{},kind=method(node.op),extraPoints=[],extraContours=[],circles=[];
  const addCircle=(circle,id)=>{if(!circle?.center||!finite(circle.radius))return;circles.push({...circle,id,role:id});for(const point of circle.supportPoints||[])extraPoints.push({...point,role:'support'})};
  if(evidence.outerContour?.length&&!artifacts.some(a=>a.type==='contours'))extraContours.push({id:'outer',role:'outer',points:evidence.outerContour});
  if(kind==='gear'){
   if(!artifacts.some(a=>a.type==='curves')&&evidence.radialCurve?.length)artifacts.push({type:'curves',curves:[{id:'radial',label:'實際輪廓徑向曲線',xLabel:'角度 (rad)',yLabel:'半徑 (px)',points:evidence.radialCurve.filter(p=>finite(p.angleRad)&&finite(p.smoothedRadiusPx??p.radiusPx)).map(p=>({x:p.angleRad,y:p.smoothedRadiusPx??p.radiusPx}))}]});
   if(!artifacts.some(a=>a.type==='points'))for(const [index,peak]of (evidence.peaks||[]).entries())if(peak.point)extraPoints.push({...peak.point,id:index+1,label:`齒 ${index+1}`,role:'peak'});
   addCircle(evidence.centerFit,'輪廓中心');addCircle(evidence.tipCircleFit,'齒頂圓');
   const measured=m.result?.measurements,uncertain=node.featureStatus==='UNKNOWN'||node.outputSummary?.featureStatus==='UNKNOWN';if(measured?.workpieceCenter)extraPoints.push({...measured.workpieceCenter,label:uncertain?'候選齒形中心':'採用的齒形中心',role:'selected-center'});if(measured?.holeCenter)extraPoints.push({...measured.holeCenter,label:uncertain?'候選孔中心':'孔中心',role:'hole-center'});
   const center=m.result?.measurements?.workpieceCenter||evidence.tipCircleFit?.center||evidence.centerFit?.center,radius=evidence.tipCircleFit?.radius??evidence.centerFit?.radius;if(center&&finite(radius)&&evidence.missingSectors?.length)artifacts.push({type:'sectors',center,radius,sectors:evidence.missingSectors});
  }
  if(kind==='ring'){addCircle(m.result?.measurements?.outerCircle,'外圓');addCircle(m.result?.measurements?.innerCircle,'內圓')}
  if(kind==='holes'){
   const upstream=m.result?.nodes?.find(n=>method(n.op)==='components'&&n.status==='OK');if(!artifacts.some(a=>a.type==='mask'))artifacts.push(...artifactsOf(m.result,upstream).filter(a=>a.type==='mask'));
   for(const hole of evidence.holes||[]){if(hole.boundary?.length)extraContours.push({id:hole.id,label:hole.id,role:'hole',points:hole.boundary});if(hole.center)extraPoints.push({...hole.center,label:hole.id,role:'hole'})}
   for(const comparison of evidence.expectedPositionComparisons||[])if(comparison.expected)extraPoints.push({...comparison.expected,label:`${comparison.expectedId}: ${{CLOSED:'封閉',MISSING:'缺孔',OPEN_TO_EXTERIOR:'外連',UNKNOWN:'未定'}[comparison.status]||comparison.status}`,role:comparison.status});
  }
  if(circles.length){if(!artifacts.some(a=>a.type==='circles'))artifacts.push({type:'circles',circles});const curves=circles.filter(c=>c.residuals?.length).map(c=>({id:c.id,label:`${c.id}殘差`,xLabel:'支持點序號',yLabel:'殘差 (px)',points:c.residuals.filter(p=>finite(p.radialResidual)).map((p,index)=>({x:index,y:p.radialResidual}))}));if(curves.length&&kind==='ring'&&!artifacts.some(a=>a.type==='curves'))artifacts.push({type:'curves',curves})}
  if(extraPoints.length)artifacts.push({type:'points',points:extraPoints});if(extraContours.length)artifacts.push({type:'contours',contours:extraContours});return artifacts.map(artifact=>artifact.type==='circles'?{...artifact,circles:artifact.circles.map(circle=>({...circle,selected:kind==='ring'&&node.featureStatus!=='UNKNOWN'&&['outerCircle','innerCircle','外圓','內圓'].includes(circle.role),displayLabel:/outerCircle|外圓/.test(circle.role)?'外圓中心':/innerCircle|內圓/.test(circle.role)?'內圓中心':undefined}))}:artifact);
 }
 nodeCurves(m){return this.nodeArtifacts(m).flatMap(a=>a.type==='curves'?a.curves||[]:a.type==='histogram'?[{id:'histogram',label:'本圖亮度分布',points:(a.values||[]).map((y,x)=>({x,y})),xLabel:'灰階值',yLabel:'像素數',threshold:a.threshold}]:[])}
 rotate(delta){this.rotation=((this.rotation+(Number(delta)||0))%360+360)%360;this.paint()}
 toggleMaximize(){const area=this.root?.querySelector('.pipeline-board')||this.container;area?.classList.toggle('is-maximized');this.root?.querySelector('.pipeline-maximize')?.replaceChildren(document.createTextNode(area?.classList.contains('is-maximized')?'恢復大小':'最大化'));requestAnimationFrame(()=>this.paint())}
 changeZoom(factor){this.zoom=Math.max(1,Math.min(20,this.zoom*factor));if(this.zoom===1)this.pan={x:0,y:0};this.paint()}
 bindCanvas(canvas){
  canvas.addEventListener('wheel',e=>{e.preventDefault();if(e.shiftKey){this.rotate(e.deltaY>0?-5:5);return}this.changeZoom(e.deltaY<0?1.15:1/1.15)},{passive:false});
  canvas.ondblclick=()=>{this.zoom=1;this.pan={x:0,y:0};this.rotation=0;this.paint()};let drag;
  canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,pan:{...this.pan}};canvas.setPointerCapture?.(e.pointerId)};
  canvas.onpointermove=e=>{if(!drag)return;this.pan={x:drag.pan.x+e.clientX-drag.x,y:drag.pan.y+e.clientY-drag.y};this.paint()};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
  canvas.onkeydown=e=>{if(e.key==='+'||e.key==='=')this.changeZoom(1.2);else if(e.key==='-')this.changeZoom(1/1.2);else if(e.key==='0'){this.zoom=1;this.pan={x:0,y:0};this.rotation=0;this.paint()}else if(e.key.toLowerCase()==='r'){this.rotate(e.shiftKey?-90:90)}else return;e.preventDefault()};
 }
 canvasContext(canvas){const rect=canvas.getBoundingClientRect(),width=rect.width||640,height=rect.height||360,dpr=window.devicePixelRatio||1;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);const ctx=canvas.getContext('2d');if(!ctx)return null;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0c151b';ctx.fillRect(0,0,width,height);return {ctx,width,height}}
 paint(){if(!this.container||!this.model?.plan)return;for(const item of this.canvases||[])this.paintPane(item.canvas,item.type,this.model);if(this.curveCanvas)this.paintCurves(this.curveCanvas,this.nodeCurves(this.model));for(const item of this.thumbnailCanvases||[]){const node=item.node,output=this.model.result?.nodes?.find(n=>n.id===node.id);this.paintPane(item.canvas,item.original?'original':'result',{...this.model,selected:node,output,kind:method(node.op)},{thumbnail:true})}}
 paintPane(canvas,type,m,{thumbnail=false}={}){
  const surface=this.canvasContext(canvas);if(!surface)return;const {ctx,width,height}=surface,raster=m.image&&this.project.pixels?.get(m.image.id);
  if(!raster){this.drawNotice(ctx,width,height,'尚無可用的原始影像');return}
  const isOutput=type==='result';let artifacts=[],kind=m.kind;
  if(isOutput){if(!m.displayResult||m.output?.status!=='OK'){this.drawNotice(ctx,width,height,this.working?'正在依目前參數重新計算':m.raw&&!m.current?'舊結果已隱藏 · 請重新試跑':m.current?'本節點未取得有效輸出':'尚未試跑 · 請執行目前圖');return}artifacts=this.nodeArtifacts(m)}
  else if(type==='original')kind='source';
  else{const inputIds=inputsOf(m.selected),previous=m.result?.nodes?.find(n=>inputIds.some(id=>id===n.id||id.startsWith(n.id+'.')));if(previous?.status==='OK'){artifacts=this.nodeArtifacts(m,previous);const node=m.nodes.find(n=>n.id===previous.id);kind=method(node?.operator||node?.op)}else kind='source'}
  const transform=fitPipelineViewport({width,height,imageWidth:raster.width,imageHeight:raster.height,bounds:observedPipelineBounds(m.result),extent:thumbnail||type==='original'||!m.gearPlan?'image':this.extent,zoom:thumbnail?1:this.zoom,pan:thumbnail?{x:0,y:0}:this.pan,padding:thumbnail?3:18}),{scale,x,y}=transform;
  const locator=!thumbnail&&transform.extent==='workpiece'?fitPipelineLocator({width,height,imageWidth:raster.width,imageHeight:raster.height,transform,bounds:observedPipelineBounds(m.result)}):null;
  ctx.save();ctx.translate(width/2,height/2);ctx.rotate(this.rotation*Math.PI/180);ctx.translate(-width/2,-height/2);ctx.translate(x,y);ctx.scale(scale,scale);ctx.imageSmoothingEnabled=false;
  const background=kind==='gray'?this.grayImage(raster):raster.image;
  if(background)ctx.drawImage(background,0,0,raster.width,raster.height);else if(raster.gray)ctx.drawImage(this.grayImage(raster),0,0);
  for(const artifact of artifacts)if(artifact.type==='mask'){const mask=this.maskImage(artifact);if(mask){ctx.save();ctx.globalAlpha=['otsu','components'].includes(kind)?.8:.35;ctx.drawImage(mask,0,0,raster.width,raster.height);ctx.restore()}}
  if(!thumbnail)this.drawOverlays(ctx,artifacts,scale,{width,height,originX:x,originY:y,reserved:locator?[locator.box]:[]});ctx.restore();
  if(locator)this.drawImageLocator(ctx,raster,transform,width,height,locator);
  if(isOutput&&this.working)this.drawCornerNotice(ctx,width,'計算中 · 保留上一輪輸出');
  else if(isOutput&&!artifacts.length&&!['gray','source','rules'].includes(kind))this.drawCornerNotice(ctx,width,'本節點未保存可視化證據');
 }
 drawImageLocator(ctx,raster,transform,width,height,locator){
  const {x,y,width:w,height:h}=locator,s=w/raster.width;ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha=.88;ctx.fillStyle='#0c151b';ctx.fillRect(locator.box.x,locator.box.y,locator.box.width,locator.box.height);if(raster.image)ctx.drawImage(raster.image,x,y,w,h);const vx=Math.max(0,-transform.x/transform.scale),vy=Math.max(0,-transform.y/transform.scale),right=Math.min(raster.width,(width-transform.x)/transform.scale),bottom=Math.min(raster.height,(height-transform.y)/transform.scale);ctx.strokeStyle='#a4efc3';ctx.lineWidth=1;ctx.strokeRect(x+vx*s,y+vy*s,Math.max(0,right-vx)*s,Math.max(0,bottom-vy)*s);ctx.fillStyle='#c6ddd8';ctx.font='9px -apple-system, sans-serif';ctx.fillText(`原圖 ${raster.width} × ${raster.height}`,x,y+h+13,w);ctx.restore();
 }
 drawNotice(ctx,width,height,text){ctx.fillStyle='#a9c1cc';ctx.font='13px -apple-system, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,height/2,Math.max(100,width-36));ctx.textAlign='left'}
 drawCornerNotice(ctx,width,text){ctx.fillStyle='#13232dee';ctx.fillRect(10,10,Math.min(width-20,260),26);ctx.font='10px -apple-system, sans-serif';ctx.fillStyle='#efd4a1';ctx.fillText(text,18,27)}
 grayImage(raster){const key=`gray:${mKey(this.model?.image)}:${raster.width}x${raster.height}`;if(this.cache.has(key))return this.cache.get(key);const canvas=el('canvas');canvas.width=raster.width;canvas.height=raster.height;const ctx=canvas.getContext('2d');if(!ctx)return null;const data=ctx.createImageData(canvas.width,canvas.height);for(let i=0;i<raster.gray.length;i++){const v=Math.max(0,Math.min(255,raster.gray[i]));data.data[i*4]=v;data.data[i*4+1]=v;data.data[i*4+2]=v;data.data[i*4+3]=255}ctx.putImageData(data,0,0);this.cache.set(key,canvas);return canvas}
 maskImage(artifact){
  if(artifact.encoding!=='rle'||!artifact.width||!artifact.height||!Array.isArray(artifact.runs))return null;
  const key=`mask:${this.model?.result?.runId}:${artifact.nodeId}:${artifact.id||artifact.width+'x'+artifact.height}`;if(this.cache.has(key))return this.cache.get(key);
  const canvas=el('canvas');canvas.width=artifact.width;canvas.height=artifact.height;const ctx=canvas.getContext('2d');if(!ctx)return null;const data=ctx.createImageData(canvas.width,canvas.height),max=canvas.width*canvas.height;
  for(let r=0;r+1<artifact.runs.length;r+=2){const start=Math.max(0,artifact.runs[r]),end=Math.min(max,start+artifact.runs[r+1]);for(let i=start;i<end;i++){const p=i*4;data.data[p]=164;data.data[p+1]=239;data.data[p+2]=195;data.data[p+3]=255}}
  ctx.putImageData(data,0,0);this.cache.set(key,canvas);return canvas;
 }
 drawOverlays(ctx,artifacts,scale,frame={}){
  const pointRadius=3/scale,originX=frame.originX||0,originY=frame.originY||0,toScreen=p=>({x:originX+p.x*scale,y:originY+p.y*scale}),toImage=p=>({x:(p.x-originX)/scale,y:(p.y-originY)/scale}),labels=[],markers=[];
  const points=artifacts.flatMap(a=>a.type==='points'?a.points||[]:[]),evidence=artifacts.find(a=>a.type==='evidence')?.data||{},center=points.find(p=>p.role==='selected-center')||evidence.centerFit?.center||artifacts.find(a=>a.type==='sectors')?.center;
  const outline=artifacts.flatMap(a=>a.type==='contours'?(a.contours||[]).filter(c=>c.role==='outer').flatMap(c=>c.points||[]):[]),radius=center?(outline.length?outline:points.filter(p=>/peak|tooth/.test(p.role||''))).reduce((max,p)=>Math.max(max,Math.hypot(p.x-center.x,p.y-center.y)),0):0,radial=center&&radius?{center:toScreen(center),radius:radius*scale}:undefined;
  const mark=(p,radius)=>markers.push({...toScreen(p),radius}),label=(text,p,color,kind='point')=>{if(!p||!finite(p.x)||!finite(p.y))return;ctx.font=`${11/scale}px -apple-system, sans-serif`;labels.push({id:`overlay-${labels.length}`,text:String(text),color,anchor:toScreen(p),width:ctx.measureText(String(text)).width*scale+8,height:17,...(['peak','center','missing'].includes(kind)&&radial?{radial}:{}),kind})};
  for(const artifact of artifacts){
   if(artifact.type==='contours')for(const [index,contour]of (artifact.contours||[]).entries()){const points=contour.points||[],color=contour.role==='hole'?'#84ccff':colors[index%colors.length];if(!points.length)continue;ctx.save();ctx.globalAlpha=.65;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=1/scale;ctx.stroke();ctx.restore()}
   if(artifact.type==='points')for(const [index,p]of (artifact.points||[]).entries()){if(!finite(p.x)||!finite(p.y))continue;const role=p.role||'',tooth=/peak|tooth/.test(role)||/^齒\s*\d+/.test(p.label||''),adopted=role==='selected-center',hole=['hole','hole-center'].includes(role)&&!!p.label,topology=['CLOSED','MISSING','OPEN_TO_EXTERIOR','UNKNOWN'].includes(role)&&!!p.label,identified=tooth||adopted||hole||topology;if(!identified&&!this.showDiagnostics)continue;const color=tooth?'#f4c67f':/MISSING|OPEN_TO_EXTERIOR/.test(role)?'#ffb8a3':adopted?'#a4efc3':'#84ccff';mark(p,identified?3:1.2);ctx.save();ctx.globalAlpha=identified?1:.22;ctx.beginPath();ctx.arc(p.x,p.y,identified?pointRadius:pointRadius*.4,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.restore();if(identified&&p.label)label(p.label,p,color,tooth?'peak':adopted||hole?'center':'point')}
   if(artifact.type==='circles')for(const [index,circle]of (artifact.circles||[]).entries()){const p=circle.center,r=circle.radius,color=colors[index%colors.length];if(!p||!finite(p.x)||!finite(p.y)||!finite(r)||!circle.selected&&!this.showDiagnostics)continue;ctx.save();ctx.globalAlpha=circle.selected?.7:.22;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=(circle.selected?1.5:1)/scale;ctx.stroke();if(circle.selected){mark(p,7);ctx.beginPath();ctx.moveTo(p.x-6/scale,p.y);ctx.lineTo(p.x+6/scale,p.y);ctx.moveTo(p.x,p.y-6/scale);ctx.lineTo(p.x,p.y+6/scale);ctx.stroke()}ctx.restore();if(circle.selected&&circle.displayLabel)label(circle.displayLabel,p,color)}
   if(artifact.type==='sectors')for(const sector of artifact.sectors||[]){const p=artifact.center,r=artifact.radius,start=sector.startAngleRad;let end=sector.endAngleRad;if(!finite(start)||!finite(end)||!p||!finite(r))continue;if(end<=start)end+=Math.PI*2;ctx.save();ctx.strokeStyle='#ffb8a3';ctx.lineWidth=1.8/scale;ctx.setLineDash([6/scale,4/scale]);ctx.beginPath();ctx.arc(p.x,p.y,r,start,end);ctx.stroke();ctx.setLineDash([]);for(const [markerIndex,marker] of (sector.expectedMarkers||(sector.expectedAnglesRad||[]).map(angle=>({angleRad:angle,point:{x:p.x+r*Math.cos(angle),y:p.y+r*Math.sin(angle)}}))).entries()){const angle=marker.angleRad,point=marker.point;if(!finite(angle)||!point||![point.x,point.y].every(finite))continue;mark(point,5);ctx.beginPath();ctx.arc(point.x,point.y,4/scale,0,Math.PI*2);ctx.stroke();label('M'+(markerIndex+1),point,'#ffb8a3','missing')}ctx.restore()}
  }
  const layout=layoutOverlayLabels(labels,{markers:[...markers,...(frame.reserved||[])],viewport:{x:0,y:0,width:frame.width||ctx.canvas.width,height:frame.height||ctx.canvas.height}});this.lastOverlayLabelLayout=layout;
  ctx.save();ctx.lineWidth=.8/scale;for(const item of layout.placed){const from=toImage(item.leader.from),to=toImage(item.leader.to);ctx.strokeStyle=item.color;ctx.globalAlpha=.7;ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke()}
  ctx.globalAlpha=1;ctx.font=`${11/scale}px -apple-system, sans-serif`;ctx.textBaseline='middle';for(const item of layout.placed){const box=toImage(item.box);ctx.fillStyle='#0b151cee';ctx.fillRect(box.x,box.y,item.box.width/scale,item.box.height/scale);ctx.fillStyle=item.color;ctx.fillText(item.text,box.x+4/scale,box.y+item.box.height/2/scale)}ctx.restore();
 }
 paintCurves(canvas,curves){
  const surface=this.canvasContext(canvas);if(!surface)return;const {ctx,width,height}=surface,pad={left:45,right:14,top:23,bottom:26},all=curves.flatMap(c=>(c.points||[]).filter(p=>finite(p.x)&&finite(p.y)));if(!all.length){this.drawNotice(ctx,width,height,'尚無曲線取樣');return}
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;for(const p of all){xmin=Math.min(xmin,p.x);xmax=Math.max(xmax,p.x);ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.y)}if(xmax===xmin)xmax=xmin+1;if(ymax===ymin)ymax=ymin+1;const px=x=>pad.left+(x-xmin)/(xmax-xmin)*(width-pad.left-pad.right),py=y=>height-pad.bottom-(y-ymin)/(ymax-ymin)*(height-pad.top-pad.bottom);
  ctx.strokeStyle='#395361';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.left,pad.top);ctx.lineTo(pad.left,height-pad.bottom);ctx.lineTo(width-pad.right,height-pad.bottom);ctx.stroke();ctx.font='9px -apple-system, sans-serif';ctx.fillStyle='#9fb9c4';ctx.fillText(number(ymax),3,pad.top+4);ctx.fillText(number(ymin),3,height-pad.bottom);ctx.fillText(number(xmin),pad.left,height-10);ctx.fillText(number(xmax),width-pad.right-ctx.measureText(number(xmax)).width,height-10);
  curves.forEach((curve,index)=>{const color=colors[index%colors.length],points=(curve.points||[]).filter(p=>finite(p.x)&&finite(p.y));ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(px(p.x),py(p.y)):ctx.moveTo(px(p.x),py(p.y)));ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.stroke();ctx.fillStyle=color;ctx.fillText(curve.label||curve.id||'曲線',pad.left+index*150,13);if(finite(curve.threshold)){ctx.save();ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(px(curve.threshold),pad.top);ctx.lineTo(px(curve.threshold),height-pad.bottom);ctx.strokeStyle='#f4c67f';ctx.stroke();ctx.restore()}});const first=curves[0];ctx.fillStyle='#a6bec9';const xlabel=first.xLabel||'取樣位置';ctx.fillText(xlabel,Math.max(pad.left,width/2-ctx.measureText(xlabel).width/2),height-10);
 }
}
function mKey(image){return `${image?.id||''}:${image?.sha256||''}`}

