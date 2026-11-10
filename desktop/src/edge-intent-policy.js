// Bounded selection of already quality-passing caliper candidates. This policy
// does not establish object identity or turn a strong background edge into truth.
export const EDGE_SIDES=['top','bottom','left','right'];
export const EDGE_INTENTS=['nearest','outer','inner','scan'];
export const EDGE_POLARITIES=['auto','bright-on-dark','dark-on-bright','rising','falling','any'];
export const EDGE_SELECTIONS=['first','last','nearest','strongest','index'];
export const EDGE_SCAN_DIRECTIONS=['positive','negative','inside-out','outside-in'];
export const EDGE_QUALITY=Object.freeze({minCoverage:.65,maxRms:1.5,minContinuity:.55,maxGapRatio:.15,minLocalCoverage:.35});
export const EDGE_INTENT_POLICY=Object.freeze({schema:'agentcv-edge-intent-policy-2',boundaryTolerancePx:2,relativeContrastFloor:.5,contrastDominanceRatio:2,scope:'原搜尋帶內的同圖有限候選比較；明確序位規則可以從多條合格線選定，但不因此證明物件身分或尺寸準確度。'});
const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const median=a=>{const b=a.filter(Number.isFinite).sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:null};
export function validateEdgeIntents(input,targetIds){
 if(input===undefined)return;
 if(!record(input)||Object.keys(input).length>targetIds.length)throw Error('找線意圖格式錯誤');
 for(const [targetId,entries]of Object.entries(input)){
  if(!targetIds.includes(targetId)||!record(entries)||Object.keys(entries).length>4)throw Error('找線意圖必須引用目前方案的目標及四側');
  for(const [side,p]of Object.entries(entries)){
   if(!EDGE_SIDES.includes(side)||!record(p)||!EDGE_INTENTS.includes(p.intent)||!EDGE_POLARITIES.includes(p.contrastPolarity)||p.source!=='agent'||p.stage!=='TRIAL'||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>4000||JSON.stringify(p).length>16000)throw Error('找線意圖、極性或試跑來源無效');
   validateEdgeSelection(p);
  }
 }
}
export function validateEdgeSelection(policy){
 if(!record(policy))throw Error('選邊規則必須為物件');
 if(policy.selection!==undefined&&!EDGE_SELECTIONS.includes(policy.selection))throw Error('選邊規則須為 first／last／nearest／strongest／index');
 if(policy.scanDirection!==undefined&&!EDGE_SCAN_DIRECTIONS.includes(policy.scanDirection))throw Error('掃描方向須為 positive／negative／inside-out／outside-in');
 if(['first','last','index'].includes(policy.selection)&&policy.scanDirection===undefined)throw Error('第一／最後／序號選邊必須明確指定掃描方向');
 if(policy.selection==='index'&&(!Number.isInteger(policy.candidateIndex)||policy.candidateIndex<1||policy.candidateIndex>1000))throw Error('候選序號必須為 1 起算的正整數（最多 1000）');
 if(policy.candidateIndex!==undefined&&policy.selection!=='index')throw Error('candidateIndex 只可搭配 selection:index');
 if(policy.intent==='scan'&&policy.selection===undefined)throw Error('scan 搜尋必須明確指定選邊規則');
}
export function edgeBoundary(bounds,side){return side==='top'?bounds.y:side==='bottom'?bounds.y+bounds.height:side==='left'?bounds.x:bounds.x+bounds.width}
export function edgePosition(c,horizontal){return horizontal?(c.geometry.from.y+c.geometry.to.y)/2:(c.geometry.from.x+c.geometry.to.x)/2}
export function resolveEdgeScan({side,expected,band,direction='positive',roi}){
 if(!EDGE_SIDES.includes(side)||!EDGE_SCAN_DIRECTIONS.includes(direction))throw Error('掃描側別或方向無效');
 const horizontal=side==='top'||side==='bottom',outward=side==='top'||side==='left'?-1:1,sign=direction==='positive'?1:direction==='negative'?-1:direction==='inside-out'?outward:-outward,low=roi?(horizontal?roi.y:roi.x):expected-band,high=roi?(horizontal?roi.y+roi.height:roi.x+roi.width):expected+band;
 return {axis:horizontal?'y':'x',direction,sign,from:sign>0?low:high,to:sign>0?high:low,coordinateConvention:horizontal?'原圖 +Y 向下；極性仍以 +Y 定義':'原圖 +X 向右；極性仍以 +X 定義',ordering:'quality-passing-fitted-line-midpoint',scope:'先擬合與通過固定品質，再依候選線中點沿指定方向排序；不是以第一個噪聲像素當作直線。'};
}
// The sign convention is image +Y for horizontal lines and +X for vertical.
export function resolveEdgePolarity(image,bounds,side,band,requested='auto'){
 const horizontal=side==='top'||side==='bottom',outward=side==='top'||side==='left'?-1:1,boundary=edgeBoundary(bounds,side),span=horizontal?bounds.width:bounds.height,start=horizontal?bounds.x:bounds.y,sample=(t,n)=>{const x=Math.round(horizontal?t:n),y=Math.round(horizontal?n:t);return x>=0&&y>=0&&x<image.width&&y<image.height?{x,y,gray:image.gray[y*image.width+x]}:null},inside=[],outside=[],samples=[];
 for(let i=0;i<21;i++){const t=start+span*(.10+.8*i/20);for(const fraction of [.65,.80]){const distance=Math.max(3,band*fraction),a=sample(t,boundary-outward*distance),b=sample(t,boundary+outward*distance);if(a!==null&&b!==null){inside.push(a.gray);outside.push(b.gray);samples.push({inside:a,outside:b,delta:a.gray-b.gray,depthFraction:fraction})}}}
 const insideMedian=median(inside),outsideMedian=median(outside),delta=insideMedian!==null&&outsideMedian!==null?insideMedian-outsideMedian:null,pairDeltas=inside.map((v,i)=>v-outside[i]),positive=pairDeltas.filter(d=>d>=8).length,negative=pairDeltas.filter(d=>d<=-8).length,depthMedianDeltas=[0,1].map(index=>median(pairDeltas.filter((_,i)=>i%2===index))),consistentSign=delta!==null&&depthMedianDeltas.every(d=>d!==null&&Math.abs(d)>=8&&Math.sign(d)===Math.sign(delta));
 const relation=requested==='auto'?(delta!==null&&Math.abs(delta)>=8&&consistentSign?(delta>0?'bright-on-dark':'dark-on-bright'):null):requested;
 const polarity=relation==='bright-on-dark'?(outward<0?'rising':'falling'):relation==='dark-on-bright'?(outward<0?'falling':'rising'):['rising','falling','any'].includes(relation)?relation:null;
 return {requested,resolved:polarity,materialRelation:relation,coordinateConvention:horizontal?'沿原圖 +Y 的灰階變化':'沿原圖 +X 的灰階變化',insideMedian,outsideMedian,insideOutsideDelta:delta,samplePairs:inside.length,positivePairs:positive,negativePairs:negative,depthMedianDeltas,tangentFractions:[.10,.90],depthFractions:[.65,.80],consistentSign,minimumAutoDifference:8,samples,source:'image-pixel-strip-medians'};
}
export function selectEdgeIntentCandidates(candidates,{policy,side,bounds,expected,band,polarity,roi}){
 validateEdgeSelection(policy);
 const horizontal=side==='top'||side==='bottom',outward=side==='top'||side==='left'?-1:1,boundary=edgeBoundary(bounds,side),rejected=[],eligible=[];
 for(const c of candidates){const p=edgePosition(c,horizontal),signedOutwardDistance=(p-boundary)*outward,distance=Math.abs(p-expected);let reason=null;
  if(distance>band*(policy.intent==='scan'?1:.85))reason='OUTSIDE_CONFIRMED_SEARCH_RANGE';
  else if(!polarity.resolved)reason='AUTO_POLARITY_UNRESOLVED';
  else if(polarity.resolved!=='any'&&c.quality?.edge_polarity!==polarity.resolved)reason='OPPOSITE_GRADIENT_POLARITY';
  else if(policy.intent==='outer'&&signedOutwardDistance< -EDGE_INTENT_POLICY.boundaryTolerancePx)reason='INSIDE_TAUGHT_BOUNDARY';
  else if(policy.intent==='inner'&&signedOutwardDistance>EDGE_INTENT_POLICY.boundaryTolerancePx)reason='OUTSIDE_TAUGHT_BOUNDARY';
  const row={...c,distance_to_intent:distance,signed_outward_distance:signedOutwardDistance};
  if(reason)rejected.push({candidate:row,reason});else eligible.push(row);
 }
 if(policy.selection!==undefined){
  const scan=resolveEdgeScan({side,expected,band,direction:policy.scanDirection||'positive',roi}),ranked=[...eligible].sort((a,b)=>scan.sign*(edgePosition(a,horizontal)-edgePosition(b,horizontal))||String(a.id).localeCompare(String(b.id))),rank=new Map(ranked.map((c,i)=>[c,i+1]));
  let selected=null,ambiguous=false;
  if(policy.selection==='first')selected=ranked[0]||null;
  else if(policy.selection==='last')selected=ranked.at(-1)||null;
  else if(policy.selection==='index')selected=ranked[policy.candidateIndex-1]||null;
  else if(policy.selection==='nearest'){
   const ordered=[...ranked].sort((a,b)=>a.distance_to_intent-b.distance_to_intent||rank.get(a)-rank.get(b));selected=ordered[0]||null;
   ambiguous=ordered.length>1&&ordered[1].distance_to_intent-ordered[0].distance_to_intent<3;
  }else if(policy.selection==='strongest')selected=[...ranked].sort((a,b)=>(b.quality?.median_contrast||0)-(a.quality?.median_contrast||0)||a.geometry.rms_px-b.geometry.rms_px||rank.get(a)-rank.get(b))[0]||null;
  const selectedRank=selected?rank.get(selected):null,selectedCandidates=selected?[selected,...ranked.filter(c=>c!==selected)]:[],scanOrder=ranked.map(c=>({candidateId:c.id,rank:rank.get(c),position:edgePosition(c,horizontal),contrast:c.quality?.median_contrast??null,selected:c===selected,reason:c===selected?'SELECTED_BY_EXPLICIT_RULE':'NOT_SELECTED_BY_EXPLICIT_RULE'}));
  if(policy.selection==='index'&&!selected)for(const candidate of ranked)rejected.push({candidate,reason:'CANDIDATE_INDEX_OUT_OF_RANGE',requestedIndex:policy.candidateIndex,availableCount:ranked.length});
  return {candidates:selectedCandidates,ambiguous,rejected,polarity,rule:'explicit-'+policy.selection,selection:policy.selection,scan,scanOrder,selectedCandidateId:selected?.id||null,selectedScanRank:selectedRank,requestedIndex:policy.selection==='index'?policy.candidateIndex:null,selectionStatus:selected?'SELECTED':policy.selection==='index'?'INDEX_OUT_OF_RANGE':'NO_ELIGIBLE_CANDIDATE',tieBreak:policy.selection==='strongest'?'最大對比；同對比取較小 RMS，再取掃描序位':'同位置以候選 ID 保持確定次序',scope:'序位規則由本次提案指定；合格線可有多條，選定不等於人工確認工件身分。'};
 }
 if(policy.intent==='nearest'){
  eligible.sort((a,b)=>a.distance_to_intent-b.distance_to_intent);
  return {candidates:eligible,ambiguous:eligible.length>1&&eligible[1].distance_to_intent-eligible[0].distance_to_intent<3,rejected,polarity,rule:'nearest-with-polarity'};
 }
 // A weak shadow is not promoted merely because it is farther outward. Equally
 // credible complete boundaries are intentionally left unresolved. The finite
 // 2:1 rule is an explicit engineering constraint, not an optimality claim.
 const strongest=Math.max(0,...eligible.map(c=>c.quality?.median_contrast||0)),credible=eligible.filter(c=>(c.quality?.median_contrast||0)>=strongest*EDGE_INTENT_POLICY.relativeContrastFloor);
 for(const c of eligible)if(!credible.includes(c))rejected.push({candidate:c,reason:'WEAK_RELATIVE_CONTRAST',threshold:strongest*EDGE_INTENT_POLICY.relativeContrastFloor});
 credible.sort((a,b)=>policy.intent==='outer'?b.signed_outward_distance-a.signed_outward_distance:a.signed_outward_distance-b.signed_outward_distance);
 return {candidates:credible,ambiguous:credible.length>1,rejected,polarity,strongestContrast:strongest,relativeContrastFloor:EDGE_INTENT_POLICY.relativeContrastFloor,rule:'direction-polarity-dominant-contrast',scope:EDGE_INTENT_POLICY.scope};
}
