// Authored test proposals, never imported by product code or used as automatic
// Agent rationale. A live model must author its own case-specific justification.
import {createPipelinePlan,OPERATOR_REGISTRY} from '../src/pipeline-registry.js';
import {expectedPipelineParameterSource} from '../src/pipeline-evidence-contract.js';

const toolReasons={
  'image.grayscale':'本測試目標依強度及形狀，不使用顏色識別；先核對輸入強度表示，若原圖已是強度影像就保留原值，不把灰階稱為本圖分割改善的證明。',
  'segment.otsu':'先嘗試以全域強度分佈分開前景與背景，產生可檢查的遮罩；需查看分佈與實際遮罩。強度最大類間差異不能單獨證明工件分割正確。',
  'regions.components':'量測與孔數需要同一物件的實際輪廓及封閉背景；使用連通拓樸並要求唯一合格候選，歧義時停止，不任意採最大塊背景。',
  'shape.gear':'只有實際外輪廓存在可解釋的徑向週期、齒根與齒峰支持時才採齒輪模型；由原始支持量測，不能用期望齒數反推觀測。',
  'geometry.annulus':'把雙圓模型作為待驗證假設，分別擬合外邊緣與唯一內孔，核對覆蓋及殘差；若物件不支持雙圓，保留診斷而不是強行輸出合格尺寸。',
  'topology.holes':'目標為觀察到的封閉孔數，使用前景內的封閉背景拓樸；未提供名義孔位時不推斷缺孔或外連孔，也不假設目前圖一定存在圓孔。',
  'rules.evaluate':'只比較本次有效量測與明確提出的規格；規格留空時維持 UNKNOWN/SPEC_MISSING，不能由樣本答案或演算法預設猜測公差。',
};
const suffix={'image.grayscale':'grayscale-conversion','segment.otsu':'otsu-polarity','regions.components':'component-candidates','shape.gear':'feature-evidence','geometry.annulus':'feature-evidence','topology.holes':'feature-evidence','rules.evaluate':'rule-evaluation'};
const omittedReasons={
  polarity:'auto 是工程策略，依實際邊界深色比例判斷極性；仍須檢查邊界主要為背景的前提，沒有比較兩極性分割準確率。',
  threshold:'未手填門檻；一般強度影像比較全部256個 Otsu 分數並取首個最大值。若已是0/255標籤則直接沿用，不冒稱執行過最優閾值搜尋。',
  selection:'使用 unique 工程策略，只接受唯一合格物件，多候選時不得悄悄退回最大面積。',
  componentId:'此案未指定候選編號；由唯一合格候選條件決定，歧義時需工程師明選，不能編造人工選擇。',
  minArea:'12 px² 是算子的固定噪點過濾預設，並非本圖最佳值；需檢查實際候選面積及被排除者。',
  excludeBoundary:'預設排除接觸影像邊界的候選，因完整輪廓與孔拓樸需要邊界支持；這是工程前提而非學得的背景分類。',
  expectedTeeth:'沒有明確名義齒數，不從本圖觀測峰數倒填規格；只保留可支持的觀測齒數。',
  sampleCount:'依實際初始外圓半徑使用 ceil(2πr)，下限360及上限1440的工程採樣策略，不宣稱搜尋過最佳採樣數。',
  smoothingWindow:'依實測齒距使用0.12比例並取奇數視窗及最少3點；本圖鄰域實算只檢查敏感性，並不選定全域最優值。',
  minProminence:'使用實測徑向範圍的0.23比例及1.1px下限，屬工程公式；需核對實算峰支持與鄰域比較，並非製造公差。',
  minPeakDistance:'使用實測齒距的0.48比例及最少3採樣格；檢查真實齒距及參數比較，不宣稱此值是所有圖的最佳值。',
  maxRelativeResidual:'0.025 是擬合品質的工程預設比例；與1px允許量組合檢查實測殘差，不當作尺寸公差或正確率。',
  maxResidualPx:'1px 是擬合品質的工程預設允許量；與半徑比例共同檢查實際殘差，沒有在本圖搜尋最佳值。',
  minAngularCoverageDeg:'300度是圓擬合支持覆蓋的工程預設；必須查看真實支持覆蓋，不把缺少弧段的圓外推稱為已量測。',
  expectedPositions:'未提供名義孔位或標定配準，只計觀察到的封閉孔，不推測缺孔或外連孔的名義位置。',
  positionTolerancePx:'3px 是孔位比對工程預設；沒有名義孔位時不作缺孔推斷，不能把這個預設當成正式位置公差。',
  minHoleArea:'0px² 預設保留每個分割得到的封閉孔，需查看孔面積及遮罩；這個預設不是經標籤調優的噪點門檻。',
};

export function pipelineFixtureProposal({task='holes',goal='計算觀察到的封閉孔數',parameters={},rules=[]}={}){
  const plan=createPipelinePlan({task,parameters,rules});plan.provenance={source:'agent'};
  const justifications={};
  for(const node of plan.nodes){
    node.parameterSources=Object.fromEntries(Object.keys(node.params).map(name=>[name,'agent-proposal']));
    const artifact={kind:'artifact',type:'evidence',id:suffix[node.op]};
    const check=node.op==='shape.gear'?{kind:'gate',id:'gear.parameter_count_agreement'}:node.op==='geometry.annulus'?{kind:'gate',id:'annulus.outer.rms'}:node.op==='topology.holes'?{kind:'gate',id:'holes.complete_boundary'}:{kind:'execution-status',allowed:['OK']};
    justifications[node.id]={tool:{reason:`目標「${goal}」。${toolReasons[node.op]}`,expectedEvidence:[artifact]},parameters:Object.keys(OPERATOR_REGISTRY[node.op].params).map(name=>({name,source:expectedPipelineParameterSource(node,plan,name),reason:name==='rules'?(rules.length?'此規格清單由測試作者明確提出作方案提案，保留來源供人工核對，不冒稱已由工程師批准或由像素推導。':'測試作者明確留空規格，不把未知公差轉成默認合格；保留量測及 UNKNOWN。'):Object.hasOwn(node.params,name)?`測試作者在方案明確提出 ${name}=${JSON.stringify(node.params[name])}，它是 Agent 提案而非已核准人工規格；執行後核對真實效果與限制，未宣稱此值最優。`:omittedReasons[name],verification:artifact})),boundaries:[{condition:node.op==='shape.gear'?'已執行的局部參數組合應給出一致的觀測齒數；不一致時只能保留模型診斷。':node.op==='geometry.annulus'?'外緣需有已執行並通過的圓擬合 RMS 品質檢查，否則雙圓模型前提未成立。':node.op==='topology.holes'?'物件輪廓不能接觸影像邊緣，否則封閉孔拓樸的完整性未成立。':'本步輸入與實際執行必須成立，失敗或歧義時不得採用下游數值。',check,onFailure:'UNKNOWN'}]};
  }
  return {task,goal,parameters,rules,justifications};
}
