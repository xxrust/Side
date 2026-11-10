import {ToolExplanationView} from './tool-explanation-view.js';
import {OPERATOR_REGISTRY} from './pipeline-registry.js';
import {buildPipelineDecisionEvidence,decisionSourceLabel} from './pipeline-decision-evidence.js';
import {renderPipelineDecisionFigure,decisionFigureMetrics} from './pipeline-decision-figures.js';
import {selectGearSweep,gearFailureGates,gearGateLabel} from './gear-evidence-figures.js';
import './pipeline-decision-explanation-view.css';

const el=(tag,value,cls)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value);if(cls)e.className=cls;return e};
const sectionOut=value=>value==='limits'?'boundary':value;
const sectionIn=value=>value==='boundary'?'limits':value==='evidence'?'tool':value;
const sections=[['tool','為何用此工具'],['parameters','為何用這組參數'],['limits','適用邊界']];
const records=value=>Array.isArray(value)?value:[];
const savedText=value=>typeof value==='string'?value.trim():'';
const mappedTool=op=>({'image.grayscale':'gray','segment.otsu':'binary','regions.components':'components','shape.gear':'measure','geometry.annulus':'measure','geometry.two_boundary':'measure','topology.holes':'measure','rules.evaluate':'decide'})[op]||'original';
const valueText=value=>value==null?'未提供':typeof value==='object'?Array.isArray(value)?`${value.length} 項`:Object.entries(value).map(([k,v])=>`${k}=${v}`).join('，'):String(value);
const stateNames={CURRENT:'當次實算',DIAGNOSTIC:'當次診斷，不能用於驗收',NOT_RUN:'尚未試跑',STALE:'結果已失效，需重跑',LEGACY:'未保存選擇依據，需新版重跑'};
const boundaryNames={TOOL_ALTERNATIVES_NOT_COMPARED:'未比較其他算法族；保存圖指定的工具是試算起點，不能稱為最佳工具。',COLOR_INFORMATION_LIMIT:'亮度流程不證明色彩、反射率或光照已校正；上游灰階來源依保存記錄核對。',OTSU_OBJECTIVE_LIMIT:'類間變異最大不是分割準確率。陰影、亮度相近及同值平台仍可能造成錯誤遮罩。',POLARITY_BORDER_ASSUMPTION:'自動極性假設影像邊界主要是背景；邊界判定及歧義閘值沒有在本圖尋優。',COMPONENT_DEFAULTS_UNTUNED:'最小面積與觸邊排除是明確工程策略；未以人工答案尋找最佳面積閾值。',RASTER_CONNECTIVITY:'前景採 8 連通、背景採 4 連通。分割多出的一條連線也可能改變孔的拓樸。',GEAR_BASE_NOT_OPTIMIZED:'基準組由指定值或工程公式產生。五組局部比較不能證明最佳參數或通用穩定性。',GEAR_MODEL_SCOPE:'齒數依賴徑向支持、齒距、齒根深度及擬合品質。期望齒數是規格，不能當成實測齒數。',ANNULUS_GATES_NOT_OPTIMIZED:'殘差與角度覆蓋是拒判圓模型的工程閘值；未尋優，也不是製造公差。',HOLE_SPECIFICATION_SCOPE:'封閉孔是觀察值。缺孔或外連的推論需要規格位置，不推定未提供的孔布局。',HOLE_THRESHOLDS_NOT_OPTIMIZED:'孔面積與位置公差來自方案或內建策略；沒有在本圖尋優。',SPECIFICATIONS_ARE_INPUTS:'上下限、目標數及位置應明確提供；缺規格或特徵不確定時保留 UNKNOWN。',SPEC_MISSING:'尚未提供完整規格；保留量測但不判 PASS。',AGENT_RULE_PROPOSAL:'規則由 Agent 提出，執行不代表人工已提供或確認這個規格。',UNCALIBRATED:'目前沒有有效物理標定。px 量測可保留，不能據此作 mm 合格判定。',NODE_NOT_EXECUTED:'上游未提供有效輸出，本步未執行。不可沿用其他圖片或上一輪的數字。'};
const limitationNames={'Lengths are in px; no physical calibration or acceptance tolerance was supplied.':'長度以 px 顯示；未提供實際標定或製造公差。','Circle fits use segmented boundary pixels and inherit segmentation error.':'圓擬合使用分割輪廓，因此也承受分割誤差。','Radial peak-to-valley and RMS describe this 2D boundary; they are not ISO roundness inspection or a tolerance acceptance decision.':'峰谷差與 RMS 描述本圖的二維邊界，不能替代標準圓度檢驗或公差判定。','Visible teeth are prominent radial peaks of the real segmented outer boundary; hidden undercuts and 3D geometry are not measured.':'可見齒來自分割外緣的顯著徑向峰；未量測隱藏凹槽或三維齒形。','Parameter agreement describes only the tested neighborhood on this raster and is not a stability guarantee.':'參數一致只描述本圖已測的局部鄰域，不保證其他條件的穩定性。','Workpiece center is estimated from outer-boundary or observed tooth-cap support; missing material and nonuniform segmentation can bias it.':'工件中心來自外緣或實際齒帽支持；缺料與不均勻分割仍可能造成偏差。','Hole topology is derived from the segmented mask; threshold changes can open or close narrow connections.':'孔拓樸來自分割遮罩；閾值改變可能打開或封閉狹窄連接。','Without expected positions, an absent hole or an opening into the exterior has no uniquely observable nominal location.':'沒有規格位置時，無法唯一指定缺孔或外連孔應在的位置。'};
function parameterReason(p){
 if(p.status==='not-recorded')return '未保存本圖的參數選用依據，待補；目前只列方案設定或已宣告預設，不能當作已比較或已驗證。';
 if(p.method==='binary-input-pass-through')return '本圖已有 0／255 標記，127 只是分隔標記；沒有執行 256 閾值搜尋，沒有選最佳閾值。';
 if(p.status==='not-needed')return '輸入檢查已確認無需 RGB 亮度轉換。直接沿用已有強度值，沒有重新套用權重，也沒有選擇最優灰階方法。';
 if(p.nodeBypassed&&p.name==='grayQuantization')return '本步只保留／量化原有強度；沒有增加新的灰階內容，也未比較其他轉換方法。';
 if(p.sweepAvailable)return '固定採用中心，只改這一個參數。點選已試值看峰數及實際失敗閘值；未試區間不算可用範圍，不以掃描替原採用值尋優。';
 if(p.status==='not-supplied'||p.value==null)return '尚未提供；不以 0 代填，也不推定規格。';
 if(p.status==='not-executed')return '本步未執行；這是方案設定或已宣告預設，本圖實際值尚未取得。';
 if(p.name==='threshold')return p.derivation?.source==='data-derived'?'本圖逐一計算 256 個閾值的 Otsu 類間變異，依保存的同值選擇規則採用；不是分割準確率。':'方案直接指定閾值；本圖 Otsu 比較僅供診斷，沒有取代指定值。';
 if(p.name==='polarity')return p.value==='auto'?'由本圖邊界亮暗比例推導實際前景方向；判定及歧義閘值是固定策略，未比較兩種極性的辨識品質。':'方案明確指定極性；邊界比例另存供核對。';
 if(p.name==='luminanceWeights')return p.derivation?.applied?'保存記錄顯示 RGB 亮度公式實際在本步套用；未比較其他係數。':'本步沒有重新套用 RGB 公式；已提供灰階的上游轉換，僅按保存的來源記錄說明。';
 if(p.name==='grayQuantization')return '把已提供灰階 round / clamp 到 0–255，保留原始解析度；未比較其他量化方法。';
 if(p.comparison?.candidates?.length)return '基準是本次採用值；下方五組真實曲線只測局部擾動，沒有把候選峰數當成最優參數選擇。';
 if(p.name.startsWith('rules'))return '這是保存方案提供的規格，不是像素推導的公差。圖中只核對實測值與指定界限。';
 if(p.derivation?.source==='data-derived')return '以本圖已保存的觀察值及固定工程公式推導；誰設定策略與如何產生數值分開列出。';
 return p.setBy==='human'?'人工指定，修改後需重跑核對。未記錄其他值的尋優比較。':p.setBy==='agent'||p.setBy==='agent-proposal'?'Agent 提出的保存值；不是人工確認的規格，也未經本圖尋優。':'方案設定或內建工程策略；下圖顯示本次作用，未比較的值不稱最佳。';
}
function parameterSummary(p){return `${savedText(p.authorReason)||(p.authorRequired===false?'內部派生項，以下為本次執行記錄。':'本案參數選用理由待補。')} ${parameterReason(p)}`}
function sourceLines(p){
 const rows=[],append=(name,value)=>{if(value===undefined)return;if(value&&typeof value==='object'){if(!Object.keys(value).length)rows.push(`${name}：無`);else for(const [key,item]of Object.entries(value))append(`${name} · ${key}`,item)}else rows.push(`${name}：${valueText(value)}`)};
 append('保存值',p.value);if(p.effectiveValue!==undefined)append('本次實際採用',p.effectiveValue);append('推導公式',p.derivation?.formula);append('保存常數',p.derivation?.constants);if(p.derivation?.upstreamSource)append('上游來源',p.derivation.upstreamSource);append('設定策略來源',p.derivation?.policySource?decisionSourceLabel(p.derivation.policySource):undefined);
 for(const name of ['sampleCount','dominantFrequency','measuredPitchBins','radialRangeP95MinusP05'])if(p.observedValues?.[name]!==undefined)append('本圖推導輸入 · '+name,p.observedValues[name]);
 return rows.flatMap(row=>row.match(/.{1,83}/gs)||[]);
}

/** Uses the crystal-oscillator explanation component, including its actual layout and navigation. */
export class PipelineDecisionExplanationView extends ToolExplanationView {
 constructor(view){
  let owner;
  super({getReport:()=>owner.buildReport(),onHelp:()=>owner.showTeaching(),onRun:()=>{owner.close();view.perform(()=>view.onRun?.({plan:view.getModel().plan}))},valid:binding=>owner.isBindingCurrent(binding)});
  owner=this;this.view=view;this.dialog.id='pipelineDecisionExplanationDialog';this.dialog.classList.add('pipeline-decision-explanation');
  this.dialog.addEventListener('close',()=>{view.activeEvidenceSection=null;view.activeEvidenceParameter=null});
  this.dialog.addEventListener('keydown',event=>{if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)||!['ArrowUp','ArrowDown'].includes(event.key)||!this.current?.facts?.kind?.startsWith('gear-'))return;event.preventDefault();this.moveTooth(event.key==='ArrowUp'?-1:1)});
 }
 isBindingCurrent(binding){const m=this.view.getModel();return binding?.imageId===m.image?.id&&binding?.pipelineId===m.plan?.id&&binding?.recipeRevision===m.plan?.revision&&binding?.nodeId===m.selected?.id&&(!binding.runId||m.current&&binding.runId===m.result?.runId)}
 buildReport(){
  const v=this.view,m=v.getModel(),model=buildPipelineDecisionEvidence({plan:m.plan,node:m.selected,trace:m.output,result:m.raw,current:m.current});this.model=model;this.workbenchModel=m;
  const definition=OPERATOR_REGISTRY[model.op],producerIds=Object.values(m.selected?.inputs||{}).map(value=>typeof value==='string'?value.split('.')[0]:value?.node),producer=m.result?.nodes.find(node=>producerIds.includes(node.id));
  this.environment={model,definition,trace:m.output,raster:m.image&&v.project.pixels?.get(m.image.id),inputGray:producer?.op==='image.grayscale',inputArtifacts:producer?.status==='OK'?v.nodeArtifacts(m,producer):[],outputArtifacts:m.current?v.nodeArtifacts(m):[],grayImage:r=>v.grayImage(r),maskImage:a=>v.maskImage(a),drawOverlays:(...args)=>v.drawOverlays(...args)};
  this.toolReason=savedText(model.justification?.tool?.reason)||'未保存本案的工具選用理由，待補；算子名稱、通用原理與執行記錄不能代替作者的選用依據。';
  if(model.toolChoice.status==='bypassed')this.toolReason+=model.op==='segment.otsu'?' 執行記錄：輸入已有嚴格 0／255 標記，直接沿用；沒有執行 Otsu 閾值搜尋，127 僅作標記分隔。':' 執行記錄：輸入已提供灰階／二值強度，本步沿用並量化；沒有重新套用 RGB 公式。';
  this.descriptors=model.figures.map(f=>({...f,note:f.kind==='input-output'?`${this.toolReason} ${model.toolChoice.comparison?.performed?'比較範圍以保存記錄為準。':'未比較其他算法族，不能稱為最優。'}`:f.kind==='boundary'?boundaryNames[f.data.boundary.code]||limitationNames[f.data.boundary.message]||f.note:f.note}));
  this.descriptors.push({id:'teaching-method',kind:'teaching',title:'工具說明 · 教學示意',note:'教學示意，非本圖實算或工具優劣比較；實際結果請切回保存的證據圖。',metrics:[],evidenceRefs:[]});
  const actual=this.descriptors.filter(f=>f.kind!=='teaching'),parameters=model.parameterChoices.map(p=>({...p,id:p.name,label:p.method==='binary-input-pass-through'?'二值分隔標記':p.label,value:p.value,nodeBypassed:model.toolChoice.status==='bypassed',sweepAvailable:actual.some(f=>f.kind==='gear-sweep'&&f.parameterNames?.includes(p.name)),authorReason:records(model.justification?.parameters).find(row=>row?.name===p.name)?.reason,authorRequired:Object.hasOwn(definition?.parameterSchema?.properties||{},p.name),origin:'recipe_setting',reason:parameterReason(p),figureId:actual.find(f=>f.parameterNames?.includes(p.name))?.id}));
  const figures=this.descriptors.map(f=>({id:f.id,title:f.title,kind:'trace',render:()=>this.renderDescriptor(f)}));
  return {schema:'agentcv-tool-explanation-1',toolId:mappedTool(model.op),name:model.title,status:['CURRENT','DIAGNOSTIC'].includes(model.status)?'CURRENT':model.status,binding:{imageId:m.image?.id,inputSha256:m.image?.sha256,pipelineId:m.plan?.id,pipelineRevision:m.plan?.revision,recipeRevision:m.plan?.revision,nodeId:m.selected?.id,runId:m.current?m.result?.runId:null},choice:{goal:m.plan?.goal||definition?.title,source:decisionSourceLabel(model.toolChoice.setBy||model.toolChoice.source),need:this.toolReason,output:'本次保存的圖像、候選與判定',assumption:model.toolChoice.comparison?.performed?'比較範圍以保存記錄為準。':'未比較其他算法族。'},parameters,figures,metrics:[],limits:model.boundaries.map(b=>boundaryNames[b.code]||b.message)};
 }
 renderDescriptor(f){return renderPipelineDecisionFigure(f,this.environment,this.state.comparisonIndex||0,this.state)}
 activeDescriptor(){
  if(this.teaching)return this.descriptors.find(f=>f.id==='teaching-method');
  if(this.section==='parameters'){const p=this.report.parameters.find(p=>p.id===this.parameterId)||this.report.parameters[0],available=this.parameterFigures(p);return available.find(f=>f.id===this.state.parameterFigureId)||available.find(f=>f.id===p?.figureId)||{id:'parameter-evidence-missing-'+(p?.id||'all'),kind:'empty',title:p?`${p.label} · 圖像依據待補`:'參數選用依據待補',note:'未保存與這個參數對應的實算圖或比較；不以其他工具圖代替。可查看已保存的數值與來源，尚不能判定最佳值。',evidenceRefs:[],metrics:[]}}
  const eligible=this.sectionFigures();return eligible.find(f=>f.id===this.figureId)||eligible[0]||{id:'boundary-evidence-missing',kind:'empty',title:'適用邊界依據待補',note:'尚未保存本節點的品質閘值或適用限制；沒有驗證資料不能宣稱適用範圍或穩定性。',evidenceRefs:[],metrics:[]};
 }
 sectionFigures(){return this.section==='limits'?this.descriptors.filter(f=>f.boundary).sort((a,b)=>Number(b.kind==='gates')-Number(a.kind==='gates')):this.descriptors.filter(f=>!f.boundary&&!['teaching','gear-sweep','gear-comparisons'].includes(f.kind))}
 parameterFigures(parameter){return this.descriptors.filter(f=>f.kind!=='teaching'&&f.parameterNames?.includes(parameter?.name))}
 sectionReadiness(section){
  const key=section==='limits'?'boundaries':section,authored=this.model.justification,audit=this.model.deliveryAudit?.sections?.[key],missing=[];
  // A delivery audit checks public author claims and internal derived items
  // separately. Never demand a human rationale for an internal runtime field.
  if(audit?.status==='COMPLETE'&&this.workbenchModel.current&&['CURRENT','DIAGNOSTIC'].includes(this.model.status)){
   const rows=records(audit.rows),rejected=rows.filter(row=>row.observedStatus==='FAIL'),pending=rows.filter(row=>row.status==='NOT_EVALUATED');
   if(rejected.length)return {status:'REJECTED',label:'本圖有拒判',summary:`本圖有拒判 · ${rejected.length} 項適用前提未通過`,details:rejected.map(row=>`${row.condition||'適用前提'}：拒判；處置 ${row.onFailure||'未記錄'}`).join('；')};
   if(pending.length)return {status:'UNVERIFIED',label:'未全評估',summary:`證據已記錄 · ${pending.length} 項尚未評估`,details:pending.map(row=>row.name||row.condition||`適用前提 ${(row.index??0)+1}`).join('；')+' 尚未完成實際評估，不能宣稱本項全部通過。'};
   return {status:'RECORDED',label:'本圖已核對',summary:'本圖已核對 · 跨圖適用性與穩定性未驗證',details:'本次保存的型別證據已核對；這不等於跨圖驗證、最佳參數或數學穩定性證明。'};
  }
  if(key==='tool'){
   if(!savedText(authored?.tool?.reason))missing.push('本案工具選用理由');
   if(!records(authored?.tool?.expectedEvidence).length)missing.push('工具預期證據');
  }else if(key==='parameters'){
   const publicNames=Object.keys(OPERATOR_REGISTRY[this.model.op]?.parameterSchema?.properties||{}),authorParameters=records(authored?.parameters);
   if(!authorParameters.length&&publicNames.length)missing.push('本案公開參數來源與選用理由');
   else for(const name of publicNames){const parameter=this.report.parameters.find(p=>p.name===name),row=authorParameters.find(row=>row?.name===name),label=parameter?.label||name;if(!savedText(row?.reason))missing.push(`${label}的本案理由`);if(!row?.verification)missing.push(`${label}的核對方式`)}
  }else if(!records(authored?.boundaries).length)missing.push('本案適用前提與失效處置');
  else for(const [index,row]of authored.boundaries.entries()){if(!savedText(row?.condition))missing.push(`前提 ${index+1} 的條件`);if(!row?.check)missing.push(`前提 ${index+1} 的檢查方式`);if(!row?.onFailure)missing.push(`前提 ${index+1} 的失效處置`)}
  for(const error of records(audit?.errors))missing.push(error.hint||error.message||error.path||error.code);
  if(audit?.status==='INCOMPLETE'&&!missing.length)missing.push('本項實算證據或核對結果');
  const unique=[...new Set(missing)];if(unique.length)return {status:'INCOMPLETE',label:'未補齊',summary:`未補齊 · 缺：${unique[0]}${unique.length>1?`等 ${unique.length} 項`:''}`,details:`未補齊：${unique.join('；')}`};
  if(!this.workbenchModel.current||!['CURRENT','DIAGNOSTIC'].includes(this.model.status))return {status:'UNVERIFIED',label:'未驗證',summary:'未驗證 · 本圖尚無當次有效實算',details:'作者已提出說明；本圖尚無當次有效實算或已失效，需重跑核對。'};
  return {status:'UNVERIFIED',label:'未驗證',summary:audit?.status==='NOT_EVALUATED'?'未驗證 · 本項實際證據尚未評估':'未驗證 · 未保存本次交付核對記錄',details:'作者已提出說明；目前沒有完成本項實算證據核對，不宣稱已交付、最佳值或穩定性。'};
 }
 renderSections(){
  const nav=this.dialog.querySelector('.explanation-sections');nav.replaceChildren();nav.setAttribute('aria-label','三項必填選擇依據');for(const [id,label]of sections){const status=this.sectionReadiness(id),button=this.button(undefined,()=>{this.section=id;this.render()});button.dataset.explanationSection=id;button.dataset.deliveryStatus=status.status;button.classList.toggle('active',this.section===id);button.setAttribute('aria-pressed',String(this.section===id));button.title=`${label} · ${status.details}`;button.append(el('span',label),el('small',status.label,'decision-delivery-status'));nav.append(button)}
 }
 openFor(section,{parameterName,figureId}={}){
  this.buildReport();const descriptor=this.descriptors.find(f=>f.id===figureId);if(['gear-sweep','gear-comparisons'].includes(descriptor?.kind)){section='parameters';parameterName=parameterName||descriptor.parameterNames?.find(name=>this.model.parameterChoices.some(p=>p.name===name))}if(parameterName&&!this.model.parameterChoices.some(p=>p.name===parameterName))throw Error('本節點未保存這個參數：'+parameterName);
  this.teaching=false;this.reasonPage=0;this.requestedParameter=parameterName;super.open(mappedTool(this.model.op),{section:sectionIn(section),figureId,comparisonIndex:0,parameterFigureId:sectionIn(section)==='parameters'?figureId:null});this.requestedParameter=null;return this.snapshot();
 }
 render(){
  this.section=sectionIn(this.section);
  if(this.lastSection!==this.section){this.lastSection=this.section;this.teaching=false;this.showProvenance=false;this.reasonPage=0}
  super.render();if(this.requestedParameter)this.parameterId=this.requestedParameter;
  this.renderSections();
  const d=this.dialog,m=this.workbenchModel,p=this.section==='parameters'?this.report.parameters.find(p=>p.id===this.parameterId)||this.report.parameters[0]:null,context=d.querySelector('.explanation-context');
  if(p)this.parameterId=p.id;
  const lines=p?sourceLines(p):[],sourcePages=Math.max(1,Math.ceil(lines.length/4));this.state.sourcePage=Math.min(this.state.sourcePage||0,sourcePages-1);
  const descriptor=p&&this.showProvenance&&!this.teaching?{id:'parameter-source-'+p.name,kind:'parameter-source',title:p.label+' · 來源與推導公式',data:{parameter:p,setter:decisionSourceLabel(p.setBy),derivation:decisionSourceLabel(p.derivation?.source),lines:lines.slice(this.state.sourcePage*4,this.state.sourcePage*4+4)},note:parameterSummary(p),metrics:[],evidenceRefs:p.evidenceRefs||[]}:this.activeDescriptor();this.figureId=descriptor.id;this.current=this.renderDescriptor(descriptor);this.figure.innerHTML=this.current.svg;
  this.bindGearFigure(descriptor);
  const contextHeading=el('strong',p?`${p.label} = ${valueText(p.value)}${p.effectiveValue!=null?` → ${valueText(p.effectiveValue)}`:''}`:this.report.choice.goal);contextHeading.title=contextHeading.textContent;context.replaceChildren(contextHeading);
  const setter=p?p.setBy:this.model.toolChoice.setBy||this.model.toolChoice.source,derived=p?p.derivation?.source:this.model.toolChoice.selectionMethod==='explicit-plan'?'plan':this.model.toolChoice.source;
  const delivery=this.sectionReadiness(this.section),contextReason=el('small',`${delivery.summary}${p?' · '+parameterReason(p):''}`);contextReason.dataset.deliverySummary=this.section;contextReason.title=delivery.details+(p?'。 '+parameterSummary(p):'');context.append(el('span',`誰設定：${decisionSourceLabel(setter)}`,'explanation-origin'),el('span',`如何產生：${decisionSourceLabel(derived)}`,'explanation-origin'),contextReason);d.dataset.deliveryStatus=delivery.status;
  d.querySelector('.dialog-heading small').textContent=`${this.model.toolChoice.status==='bypassed'?'當次記錄，沿用輸入':stateNames[this.model.status]} · 方案 ${m.plan?.revision} · ${this.report.binding.runId?.slice(0,12)||'未取得當次 run'}`;
  const metrics=d.querySelector('.explanation-metrics');metrics.replaceChildren();for(const item of (this.current.facts.metrics||decisionFigureMetrics(descriptor,this.state.comparisonIndex||0)).slice(0,4)){const cell=el('span'),raw=`${valueText(item.value)} ${item.unit||''}`,display=Number.isFinite(item.value)?Number(item.value.toPrecision(7)):item.value,value=el('strong',`${valueText(display)} ${item.unit||''}`);value.title=raw;cell.append(el('small',item.label),value);metrics.append(cell)}
  const controls=d.querySelector('.explanation-controls');controls.replaceChildren();
  const items=this.section==='parameters'?this.report.parameters:this.sectionFigures();
  if(items.length){const id=p?.id||descriptor.id,index=Math.max(0,items.findIndex(f=>f.id===id)),select=el('select');select.setAttribute('aria-label',p?'選擇要核對的參數':'選擇證據圖');for(const f of items){const option=el('option',f.label||f.title);option.value=f.id;select.append(option)}select.value=id;
   const change=next=>{this.teaching=false;this.reasonPage=0;this.state.sourcePage=0;this.state.comparisonIndex=0;this.state.sweepIndex=undefined;this.state.sweepGateIndex=0;this.state.parameterFigureId=null;if(this.section==='parameters')this.parameterId=next;else this.figureId=next;this.render()};select.onchange=()=>change(select.value);const previous=this.button(this.model.op==='shape.gear'?'前一步':'←',()=>change(items[index-1].id)),next=this.button(this.model.op==='shape.gear'?'後一步':'→',()=>change(items[index+1].id));previous.disabled=index<=0;next.disabled=index>=items.length-1;previous.dataset.evidenceStep='previous';next.dataset.evidenceStep='next';controls.append(previous,select,el('small',`${index+1}/${items.length}`),next);
  }
  if(p&&!this.showProvenance&&!this.teaching){const available=this.parameterFigures(p);if(available.length>1){const select=el('select');select.setAttribute('aria-label','選擇參數依據圖');for(const figure of available){const option=el('option',figure.title);option.value=figure.id;select.append(option)}select.value=descriptor.id;select.onchange=()=>{this.state.parameterFigureId=select.value;this.state.comparisonIndex=0;this.state.sweepIndex=undefined;this.reasonPage=0;this.render()};controls.append(select)}}
  if(p){const source=this.button(this.showProvenance?'回到實算圖':'來源／推導公式',()=>{this.showProvenance=!this.showProvenance;this.teaching=false;this.render()});source.dataset.decisionSource='toggle';controls.append(source);if(this.showProvenance&&sourcePages>1){const prev=this.button('公式 ←',()=>{this.state.sourcePage--;this.render()}),next=this.button('公式 →',()=>{this.state.sourcePage++;this.render()});prev.disabled=this.state.sourcePage===0;next.disabled=this.state.sourcePage>=sourcePages-1;prev.dataset.sourcePage='previous';next.dataset.sourcePage='next';controls.append(prev,el('small',`${this.state.sourcePage+1}/${sourcePages}`),next)}}
  if(descriptor.kind==='gear-comparisons'){const variants=el('select');variants.setAttribute('aria-label','參數比較組');descriptor.data.comparisons.forEach((candidate,index)=>{const option=el('option',`${candidate.baseline?'基準':'局部比較 '+(index+1)} · ${candidate.count} 峰`);option.value=index;variants.append(option)});variants.value=String(this.state.comparisonIndex||0);variants.onchange=()=>{this.state.comparisonIndex=Number(variants.value);this.render()};controls.append(variants)}
  if(descriptor.kind==='gear-object'||descriptor.kind==='gear-sweep')this.gearControls(controls,descriptor);
  const caption=d.querySelector('.explanation-caption'),sectionReason=this.teaching?descriptor.note:p?parameterSummary(p):this.section==='tool'?`${this.toolReason} ${descriptor.note||''}`:descriptor.note,reason=`${delivery.status==='INCOMPLETE'?delivery.details+'。 ':''}${sectionReason||'未保存說明'}`,pages=String(reason).match(/.{1,125}/gs);this.reasonPage=Math.min(this.reasonPage||0,pages.length-1);caption.textContent=pages[this.reasonPage];caption.title=reason;
  if(pages.length>1){const prev=this.button('說明 ←',()=>{this.reasonPage--;this.render()}),next=this.button('說明 →',()=>{this.reasonPage++;this.render()});prev.disabled=this.reasonPage===0;next.disabled=this.reasonPage===pages.length-1;controls.append(prev,el('small',`${this.reasonPage+1}/${pages.length}`),next)}
  const footer=d.querySelector('footer'),source=footer.querySelector('small'),actions=footer.querySelector('.row');source.textContent=`${this.teaching?'教學示意，非本圖實算':m.current?'本圖已保存證據':'僅方案設定，尚無有效實算'} · ${m.image?.sha256?.slice(0,16)||'未取得指紋'} · ${this.model.op}`;
  actions.prepend(this.button('修改本步參數…',()=>{this.close();this.view.openDetails('parameters',p?.name)},'mini'));
  this.view.detailTab=sectionOut(this.section);this.view.activeEvidenceSection=sectionOut(this.section);this.view.activeEvidenceParameter=p?.id||null;d.dataset.section=sectionOut(this.section);d.dataset.parameter=p?.id||'';d.dataset.figureId=descriptor.id;
 }
 bindGearFigure(descriptor){
  const activate=(target)=>{if(target.dataset.gearTooth){this.state.selectedToothId=target.dataset.gearTooth;if(this.section!=='parameters')this.figureId='gear-tooth';this.render()}else if(target.dataset.gearSweep!==undefined){this.state.sweepIndex=Number(target.dataset.gearSweep);this.state.sweepGateIndex=0;this.render()}else if(target.dataset.gearGate!==undefined){this.state.sweepGateIndex=Number(target.dataset.gearGate);this.render()}else if(target.dataset.gearGap!==undefined){this.state.selectedGapIndex=Number(target.dataset.gearGap);this.figureId='gear-gaps';this.render()}};
  for(const target of this.figure.querySelectorAll('[data-gear-tooth],[data-gear-sweep],[data-gear-gap],[data-gear-gate]')){target.style.cursor='pointer';target.addEventListener('click',()=>activate(target));target.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();activate(target)}})}
 }
 moveTooth(delta){const data=this.activeDescriptor()?.data,peaks=data?.evidence?.peaks||[];if(!peaks.length)return;const index=Math.max(0,peaks.findIndex(p=>p.id===(this.state.selectedToothId||this.current?.facts.selectedToothId)));this.state.selectedToothId=peaks[(index+delta+peaks.length)%peaks.length].id;if(this.section!=='parameters')this.figureId='gear-tooth';this.render()}
 gearControls(controls,descriptor){
  if(descriptor.kind!=='gear-sweep'){const peaks=descriptor.data.evidence?.peaks||[],previous=this.button('上一齒',()=>this.moveTooth(-1)),next=this.button('下一齒',()=>this.moveTooth(1));previous.disabled=next.disabled=!peaks.length;previous.dataset.gearToothStep='previous';next.dataset.gearToothStep='next';const extent=el('select');extent.setAttribute('aria-label','原圖檢視範圍');for(const [id,label]of [['workpiece','工件'],['full','全圖']]){const option=el('option',label);option.value=id;extent.append(option)}extent.value=this.state.imageExtent||'workpiece';extent.onchange=()=>{this.state.imageExtent=extent.value;this.render()};controls.append(previous,next,extent);return}
  const selection=selectGearSweep(descriptor.data,this.state),candidates=descriptor.data.axis.candidates||[],select=el('select');select.setAttribute('aria-label','選擇單軸已試值');for(const [index,row]of candidates.entries()){const option=el('option',`${valueText(row.value)} · ${row.count} 峰 · ${row.baseline?'原採用':row.status==='SUPPORTED'?'局部支持':'局部拒判'}`);option.value=index;select.append(option)}select.value=selection.index;select.onchange=()=>{this.state.sweepIndex=Number(select.value);this.state.sweepGateIndex=0;this.render()};controls.append(select);
  const failed=candidates.findIndex((row,index)=>index!==selection.index&&row.status==='REJECTED'),failure=this.button('看拒判實例',()=>{this.state.sweepIndex=failed;this.state.sweepGateIndex=0;this.render()});failure.disabled=failed<0;failure.dataset.gearFailure='next';controls.append(failure);
 }
 showTeaching(){this.teaching=true;this.render()}
 move(delta){const select=this.dialog.querySelector('.explanation-controls select');if(!select)return;const next=Math.max(0,Math.min(select.options.length-1,select.selectedIndex+delta));select.selectedIndex=next;select.dispatchEvent(new Event('change'))}
 snapshot(){if(!this.dialog.open)return null;if(!this.isBindingCurrent(this.report?.binding)){this.close();return null;}const facts=this.current?.facts||{},delivery=this.sectionReadiness(this.section),parameter=this.section==='parameters'?this.report.parameters.find(p=>p.id===this.parameterId):null;return {...this.report.binding,section:sectionOut(this.section),parameterName:this.section==='parameters'?this.parameterId:null,figureId:this.figureId,evidenceRefs:facts.evidenceRefs||[],metrics:facts.metrics||[],comparison:facts.candidate||null,selectedToothId:facts.selectedToothId||null,imageExtent:facts.imageExtent||null,selectedGapIndex:facts.selectedGapIndex??null,gapComparison:facts.gapComparison||null,sweepIndex:facts.sweepIndex??null,sweepValue:facts.sweepValue??null,sweepStatus:facts.sweepStatus||null,gate:facts.gate||null,centerGate:facts.centerGate||null,delivery:{status:delivery.status,summary:delivery.summary},authorReason:savedText(parameter?parameter.authorReason:this.section==='tool'?this.model.justification?.tool?.reason:null)||null,scope:facts.scope}}
 ask(){
  const m=this.view.getModel(),binding=this.report?.binding;if(!this.isBindingCurrent(binding)||!m.current||!m.output?.decision){this.view.onError?.('本圖尚無當前保存的選擇依據，請先試跑。');return}
  const snapshot=this.snapshot(),quote=this.current?.caption||this.model.title;if(!snapshot.evidenceRefs.length&&!this.teaching){this.view.onError?.('本圖未保存這張圖的實算依據，請重新試跑。');return}
  const reference={kind:'pipeline_evidence',toolId:this.model.op,toolName:this.model.title,quote,context:{imageId:m.image.id,inputSha256:m.image.sha256,runId:m.result.runId,pipelineId:m.plan.id,pipelineRevision:m.plan.revision,nodeId:m.selected.id,section:snapshot.section,parameterName:snapshot.parameterName,figureId:snapshot.figureId,evidenceRefs:snapshot.evidenceRefs,metrics:snapshot.metrics,comparison:snapshot.comparison,selectedToothId:snapshot.selectedToothId,imageExtent:snapshot.imageExtent,selectedGapIndex:snapshot.selectedGapIndex,gapComparison:snapshot.gapComparison,sweepIndex:snapshot.sweepIndex,sweepValue:snapshot.sweepValue,sweepStatus:snapshot.sweepStatus,gate:snapshot.gate,centerGate:snapshot.centerGate,delivery:snapshot.delivery,authorReason:snapshot.authorReason,scope:snapshot.scope}};
  this.close();this.view.onAsk?.({question:`請解釋「${this.model.title}」的這張選擇依據：${quote} 請區分誰設定、如何產生，以及本圖尚未比較或未評估的條件。`,reference});
 }
}
