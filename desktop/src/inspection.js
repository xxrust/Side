import '../../assets/vision-core.js';
import {foregroundParameters} from './foreground-params.js';
import {edgeSearchPolicy,compareEdgeTrials} from './edge-parameter-search.js';
import {EDGE_INTENT_POLICY,resolveEdgePolarity,selectEdgeIntentCandidates} from './edge-intent-policy.js';
const C=globalThis.AgentCVCore;
export const ALGORITHM_VERSION='agentcv-inspection-0.13-directional-selection';
const clone=x=>JSON.parse(JSON.stringify(x));
const finite=x=>Number.isFinite(x);
export function regionBounds(points){if(!Array.isArray(points)||points.length<3||!points.every(p=>finite(p.x)&&finite(p.y)))return null;const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}}
const rectPoints=b=>[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}];
const unknown=reason=>({status:'UNKNOWN',reason});
const sample=(im,x,y)=>im.gray[Math.max(0,Math.min(im.height-1,Math.round(y)))*im.width+Math.max(0,Math.min(im.width-1,Math.round(x)))];
function hull(points,audit){const ps=points.sort((a,b)=>a.x-b.x||a.y-b.y),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),lo=[],hi=[];
 const append=(chain,p,side)=>{while(chain.length>1){const a=chain.at(-2),b=chain.at(-1),turn=cross(a,b,p);if(turn>0)break;if(audit){audit.pops[side]++;if(turn===0)audit.collinearPops++;const witness={a:{...a},b:{...b},c:{...p},cross:turn,chain:side};if(!audit.witnesses.length||audit.witnesses.length<3&&turn!==0)audit.witnesses.push(witness)}chain.pop()}chain.push(p)};
 for(const p of ps)append(lo,p,'lower');for(const p of ps.slice().reverse())append(hi,p,'upper');return [...lo.slice(0,-1),...hi.slice(0,-1)]}
/** Coarse image-derived foreground proposals, never a final semantic segmentation. */
export function foregroundCandidates(image,{includeTrace=true,parameters={}}={}){
  if(!image?.gray||image.gray.length!==image.width*image.height)return {status:'UNKNOWN',reason:'原圖像素未就緒',candidates:[]};
  const params=foregroundParameters(parameters),step=params.sampleMode==='manual'?params.sampleStep:Math.max(1,Math.ceil(Math.max(image.width,image.height)/400)),w=Math.ceil(image.width/step),h=Math.ceil(image.height/step);if(w*h>4_000_000)throw Error('此採樣設定超過 400 萬格，請增加採樣間隔');const values=new Uint8Array(w*h),hist=new Uint32Array(256);let sum=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=Math.round(sample(image,x*step,y*step));values[y*w+x]=v;hist[v]++;sum+=v}
  const objective=new Float64Array(256);let n0=0,s0=0,best=0,threshold=0;for(let t=0;t<255;t++){n0+=hist[t];s0+=hist[t]*t;if(!n0||n0===values.length)continue;const d=s0/n0-(sum-s0)/(values.length-n0),score=n0*(values.length-n0)*d*d;objective[t]=score;if(score>best){best=score;threshold=t}}
  const autoThreshold=best?threshold:null;if(params.thresholdMode==='manual')threshold=params.threshold;
  const trace=includeTrace?{schema:'agentcv-foreground-trace-2',algorithm_version:ALGORITHM_VERSION,sourceWidth:image.width,sourceHeight:image.height,width:w,height:h,sampleStep:step,gray:values,histogram:hist,objective,objectiveMaximum:best,autoThreshold,parameters:params,threshold:params.thresholdMode==='manual'?threshold:autoThreshold,masks:{},labels:{},counts:{},decisions:{},hulls:{}}:null;
  if(!best&&params.thresholdMode==='otsu')return {parameters:params,status:'UNKNOWN',reason:'影像沒有足夠前景／背景對比',candidates:[],...(trace?{trace}:{}),algorithm_version:ALGORITHM_VERSION};
  const candidates=[];
  for(const bright of [true,false]){if(params.polarity!=='both'&&(bright?'bright':'dark')!==params.polarity)continue;const polarity=bright?'bright':'dark',mask=new Uint8Array(values.length),labels=new Uint32Array(values.length),accepted=[],rejected=[],rejectionCounts={area_low:0,area_high:0,borders:0,span_x:0,span_y:0,degenerate:0};let componentCount=0,retainedCount=0;
    for(let i=0;i<values.length;i++)mask[i]=(bright?values[i]>threshold:values[i]<=threshold)?255:0;
    for(let start=0;start<values.length;start++){if(labels[start]||!mask[start])continue;const label=start+1,queue=[start];labels[start]=label;componentCount++;let head=0,minx=w,miny=h,maxx=0,maxy=0,total=0;const border=[];
      while(head<queue.length){const i=queue[head++],x=i%w,y=Math.floor(i/w);minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);total+=values[i];let boundary=false;
        for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||ny<0||nx>=w||ny>=h){boundary=true;continue}const j=ny*w+nx;if(!mask[j]){boundary=true;continue}if(!labels[j]){labels[j]=label;queue.push(j)}}if(boundary)border.push({x:Math.min(image.width-1,x*step),y:Math.min(image.height-1,y*step)})}
      const area=queue.length/values.length,touches=+(minx===0)+ +(miny===0)+ +(maxx===w-1)+ +(maxy===h-1);
      const failures=[];if(area<.003)failures.push('area_low');if(area>.90)failures.push('area_high');if(touches>=3)failures.push('borders');if(maxx-minx<5)failures.push('span_x');if(maxy-miny<5)failures.push('span_y');
      const id=`fg-${bright?'b':'d'}-${start}`,record=trace?{id,label,polarity,pixelCount:queue.length,areaRatio:area,touchingBorders:touches,spanX:maxx-minx,spanY:maxy-miny,bounds:{x:minx*step,y:miny*step,width:(maxx-minx)*step,height:(maxy-miny)*step},failures}:null;
      const saveRejected=()=>{if(!trace)return;for(const code of failures)rejectionCounts[code]++;if(rejected.length<12||queue.length>rejected.at(-1).pixelCount){rejected.push(record);rejected.sort((a,b)=>b.pixelCount-a.pixelCount);if(rejected.length>12)rejected.pop()}};
      if(failures.length){saveRejected();continue}
      const audit=trace?{inputPoints:border.length,pops:{lower:0,upper:0},collinearPops:0,witnesses:[]}:null,points=hull(border,audit);if(points.length<3){failures.push('degenerate');saveRejected();continue}retainedCount++;if(trace){accepted.push(record);trace.hulls[id]=audit}const bounds=regionBounds(points);candidates.push({id,points,bounds,area_ratio:area,mean_gray:total/queue.length,component:{label,polarity,pixelCount:queue.length},quality:{threshold,polarity:bright?'bright':'dark',touching_borders:touches,sample_step:step},method:params.thresholdMode==='otsu'?'Otsu threshold + connected component convex envelope':'Manual threshold + connected component convex envelope',reason:'像素分割候選；需人工確認，凹陷及遮擋輪廓不保證準確'})
    }
    if(trace){trace.masks[polarity]=mask;trace.labels[polarity]=labels;trace.counts[polarity]={components:componentCount,retained:retainedCount,foregroundPixels:mask.reduce((n,v)=>n+(v?1:0),0)};trace.decisions[polarity]={records:[...accepted,...rejected].sort((a,b)=>b.pixelCount-a.pixelCount),omittedRejected:componentCount-retainedCount-rejected.length,rejectionCounts}}
  }
  candidates.sort((a,b)=>b.area_ratio-a.area_ratio);if(trace){const ranks=new Map(candidates.map((c,i)=>[c.id,i+1]));for(const d of Object.values(trace.decisions))for(const r of d.records){r.rank=ranks.get(r.id)??null;r.displayed=r.rank!==null&&r.rank<=8}trace.ranking={total:candidates.length,displayLimit:8};for(const id of Object.keys(trace.hulls))if(!candidates.slice(0,8).some(c=>c.id===id))delete trace.hulls[id]}return {parameters:params,status:candidates.length?'AWAITING_CONFIRMATION':'UNKNOWN',reason:candidates.length?'候選僅供圈定目標，不是量測結果':'沒有可用的局部前景候選',candidates:candidates.slice(0,8),algorithm_version:ALGORITHM_VERSION,...(trace?{trace}:{})};
}
export function captureTemplate(image,points){const b=regionBounds(points);if(!b||b.width<12||b.height<12)throw Error('目標輪廓至少 12 × 12 px');const pad=Math.max(6,Math.min(b.width,b.height)*.12),x=Math.max(0,Math.floor(b.x-pad)),y=Math.max(0,Math.floor(b.y-pad)),width=Math.min(image.width-1,Math.ceil(b.x+b.width+pad))-x,height=Math.min(image.height-1,Math.ceil(b.y+b.height+pad))-y;const grid=22,samples=[];for(let gy=0;gy<grid;gy++)for(let gx=0;gx<grid;gx++){const dx=(gx+.5)*width/grid,dy=(gy+.5)*height/grid;samples.push({x:dx,y:dy,value:sample(image,x+dx,y+dy)})}const mean=samples.reduce((s,p)=>s+p.value,0)/samples.length,variance=samples.reduce((s,p)=>s+(p.value-mean)**2,0)/samples.length;return {x,y,width,height,bounds:b,points:clone(points),samples,mean,variance,sourceWidth:image.width,sourceHeight:image.height}}
/** Translation-only ZNCC, with absolute photometric and ambiguity gates. */
export function locateTemplate(image,template,params={}){
  const minScore=params.minScore??.90,maxError=params.maxError??24,minMargin=params.minMargin??.035;
  if(image.width!==template.sourceWidth||image.height!==template.sourceHeight)return unknown('圖片解析度不相容；目前定位僅支援相同解析度的平移，不自動縮放／旋轉');
  if(template.variance<20)return unknown('目標模板對比不足，無法可靠定位');
  const {samples,mean,variance,width,height}=template,n=samples.length,maxx=Math.floor(image.width-1-width),maxy=Math.floor(image.height-1-height),coarse=Math.max(2,Math.round(Math.min(width,height)/10));
  function score(x,y){let sum=0,sq=0,cov=0,error=0;for(const p of samples){const v=sample(image,x+p.x,y+p.y);sum+=v;sq+=v*v;cov+=(p.value-mean)*v;error+=Math.abs(v-p.value)}const vv=sq-sum*sum/n;return {x,y,score:vv>1e-6?cov/Math.sqrt(variance*n*vv):-1,error:error/n}}
  const rough=[];for(let y=0;y<=maxy;y+=coarse)for(let x=0;x<=maxx;x+=coarse)rough.push(score(x,y));rough.push(score(Math.min(maxx,Math.round(template.x)),Math.min(maxy,Math.round(template.y))));rough.sort((a,b)=>b.score-a.score);const peaks=[];
  for(const r of rough){if(peaks.some(p=>Math.hypot(p.x-r.x,p.y-r.y)<Math.min(width,height)*.25))continue;peaks.push(r);if(peaks.length===5)break}
  const refined=peaks.map(r=>{let b=r;for(let y=Math.max(0,r.y-coarse);y<=Math.min(maxy,r.y+coarse);y++)for(let x=Math.max(0,r.x-coarse);x<=Math.min(maxx,r.x+coarse);x++){const s=score(x,y);if(s.score>b.score)b=s}return b}).sort((a,b)=>b.score-a.score);
  const best=refined[0];if(!best)return unknown('沒有可搜尋的模板位置');const second=refined.find(p=>Math.hypot(p.x-best.x,p.y-best.y)>Math.min(width,height)*.25),margin=second?best.score-second.score:1;
  const quality={score:best.score,mean_absolute_error:best.error,uniqueness_margin:margin,min_score:minScore,max_error:maxError,min_margin:minMargin};
  if(best.score<minScore||best.error>maxError)return {...unknown('模板定位未通過相似度／灰階誤差條件；不能推斷部件缺失'),quality};
  if(margin<minMargin)return {...unknown('有多個相近模板位置，無法唯一定位'),quality};
  const dx=best.x-template.x,dy=best.y-template.y;return {status:'LOCATED',dx,dy,points:template.points.map(p=>({x:p.x+dx,y:p.y+dy})),bounds:{...template.bounds,x:template.bounds.x+dx,y:template.bounds.y+dy},quality,method:'translation-only ZNCC'};
}
const position=(candidate,horizontal)=>horizontal?(candidate.geometry.from.y+candidate.geometry.to.y)/2:(candidate.geometry.from.x+candidate.geometry.to.x)/2;
function edgeSearch(image,bounds,side,params={}){
  const horizontal=side==='top'||side==='bottom',span=horizontal?bounds.width:bounds.height,normal=horizontal?bounds.height:bounds.width,expected=(side==='top'?bounds.y:side==='bottom'?bounds.y+bounds.height:side==='left'?bounds.x:bounds.x+bounds.width)+(params.edgeAnchors?.[side]?.offset||0),band=params.searchBand??Math.max(12,Math.min(45,normal*.07)),start=(horizontal?bounds.x:bounds.y)+span*.20,end=(horizontal?bounds.x:bounds.y)+span*.80;
  let roi=horizontal?{x:start,y:Math.max(0,expected-band),width:end-start,height:Math.min(image.height,expected+band)-Math.max(0,expected-band)}:{x:Math.max(0,expected-band),y:start,width:Math.min(image.width,expected+band)-Math.max(0,expected-band),height:end-start};
  if(roi.width<10||roi.height<10)return {...unknown('目標太小或邊緣太靠近圖界，無有效找線區'),side,candidates:[],attempts:[]};
  const attempts=[],trials=[],intent=params.edgeIntents?.[side],polarity=intent?resolveEdgePolarity(image,bounds,side,band,intent.contrastPolarity):null;
  for(const trim of edgeSearchPolicy.trims){const begin=(horizontal?bounds.x:bounds.y)+span*trim,length=span*(1-2*trim);roi=horizontal?{...roi,x:begin,width:length}:{...roi,y:begin,height:length};
  for(const profileWidth of edgeSearchPolicy.widths){const result=C.detect(image,{type:'find_line',...roi,params:{threshold:params.threshold??18,orientation:horizontal?'horizontal':'vertical',profileWidth,maxAngle:params.maxAngle??15,maxCandidates:12,minCoverage:.65,maxRms:1.5,minContinuity:.55}});const cs=result.candidates||[];
    const anchor=intent?null:params.edgeAnchors?.[side],angleDistance=(a,b)=>{let d=Math.abs(a-b)%180;return Math.min(d,180-d)},pool=cs.map(c=>({...c,profile_width:profileWidth,distance_to_intent:Math.abs(position(c,horizontal)-expected)})),selection=intent?selectEdgeIntentCandidates(pool,{policy:intent,side,bounds,expected,band,polarity,roi}):null;
    const candidates=selection?.candidates||pool.filter(c=>!anchor||angleDistance(c.geometry.angle_deg,anchor.angle)<=3).filter(c=>c.distance_to_intent<=band*.85).sort((a,b)=>a.distance_to_intent-b.distance_to_intent);
    const index=trials.length,ambiguous=selection?selection.ambiguous:candidates.length>1&&candidates[1].distance_to_intent-candidates[0].distance_to_intent<3;
    trials.push({index,profileWidth,tangentTrim:trim,roi:{...roi},candidates,ambiguous,pool,selection});
    attempts.push({profileWidth,tangentTrim:trim,roi:{...roi},status:result.status,reason:result.reason,diagnostics:result.diagnostics,candidate_count:cs.length,eligible_count:candidates.length,ambiguous,selected:false,candidates:candidates.map(({points,...c})=>c),intent_rejected_count:cs.length-candidates.length,...(selection?{intent_selection:{...selection,candidates:undefined,rejected:selection.rejected.map(({candidate:{points,...candidate},...r})=>({...r,candidate}))},candidate_pool:pool.map(({points,...c})=>c)}:{})});
  }}
  const {chosen,assessment}=compareEdgeTrials(trials,horizontal),ambiguousTrial=trials.find(t=>t.ambiguous),display=ambiguousTrial||chosen||trials.find(t=>t.pool.length),accepted=display?.candidates||[],explicitSelection=intent?.selection!==undefined,intentEvidence=intent?{selection_policy:{...EDGE_INTENT_POLICY,...intent,polarity,anchor_active:false,retained_anchor_role:'roi-center-only-not-candidate-confirmation',retained_anchor:params.edgeAnchors?.[side]||null,...(display?.selection?{scan:display.selection.scan,scanOrder:display.selection.scanOrder,selectedCandidateId:display.selection.selectedCandidateId,selectedScanRank:display.selection.selectedScanRank,selectionStatus:display.selection.selectionStatus,tieBreak:display.selection.tieBreak}:{}),selectionRule:explicitSelection?'品質與極性通過後，依明確的 '+intent.selection+' 規則與 '+(intent.scanDirection||'positive')+' 掃描方向選取；'+(intent.intent==='scan'?'不使用示教輪廓內外側作候選排除；':'保留 '+intent.intent+' 相對示教輪廓篩選；')+'其餘候選保留排序與未採用原因，跨參數線位仍須一致。這是本次選序指令，不代表物件身分或最佳精度。':'在原搜尋帶內，以示教邊的內外方向、真像素極性及對比差篩選；同級候選不強選；全部八組須無歧義且線位一致。2:1 對比尺度是工程限制，不聲稱最佳。'},candidate_pool:display?.pool||[]}:{};roi=display?.roi||roi;
  if(explicitSelection){
    const adopted=['CONSISTENT','SINGLE_PASS'].includes(assessment.status),policy=intentEvidence.selection_policy;
    policy.adoptedForMeasurement=adopted;policy.proposedCandidateId=policy.selectedCandidateId??null;policy.proposedScanRank=policy.selectedScanRank??null;
    if(!adopted){policy.selectedCandidateId=null;policy.selectedScanRank=null;if(policy.proposedCandidateId)policy.selectionStatus='ORDERED_CANDIDATE_NOT_ADOPTED';}
    assessment.orderedSelection={selection:intent.selection,scanDirection:intent.scanDirection||'positive',candidateIndex:intent.candidateIndex??null,adoptedForMeasurement:adopted};
  }
  if(intent){assessment.intentPolicy=EDGE_INTENT_POLICY.schema;assessment.selectionRule=intentEvidence.selection_policy.selectionRule+' '+assessment.selectionRule;}
  if(assessment.status==='NO_PASS')return {...unknown(polarity&&!polarity.resolved?'內外像素差不足，無法自動確定工件極性；請指定亮／暗關係':intent?.selection==='index'?'候選序號未在任何一組的合格掃描序列內；保留全部候選及實際可用數量':'八組設定均沒有邊線通過品質及意圖條件'),side,roi,candidates:[],attempts,parameter_assessment:assessment,...intentEvidence};
  if(['AMBIGUOUS','DISAGREEMENT','NO_COMMON_SPAN'].includes(assessment.status))return {...unknown(assessment.status==='AMBIGUOUS'?(intent?'存在多條同級的合格邊，內外方向與極性不足以證明哪條屬於工件，請指定候選或調整示教':'參數比較中存在多條距離相近的合格邊，請澄清意圖'):assessment.status==='DISAGREEMENT'?'不同參數找到的線位相差超過 3 px，不能自動選定':'合格結果缺少共同支持跨度，不能比較線位'),side,roi,candidates:accepted,attempts,parameter_assessment:assessment,...intentEvidence};
  attempts[chosen.index].selected=true;
  return {status:'FOUND',side,roi:chosen.roi,selected:chosen.candidates[0],candidates:chosen.candidates,attempts,parameter_assessment:assessment,...intentEvidence,rejected:intent?[...chosen.selection.rejected.map(r=>({id:r.candidate.id,reason:r.reason,distance:r.candidate.distance_to_intent})),...(explicitSelection?chosen.candidates.slice(1).map(c=>({id:c.id,reason:'NOT_SELECTED_BY_EXPLICIT_RULE',scanRank:chosen.selection.scanOrder?.find(r=>r.candidateId===c.id)?.rank??null})):[])]:chosen.candidates.slice(1).map(c=>({id:c.id,reason:'比採用邊更遠離已確認輪廓',distance:c.distance_to_intent}))};
}
function intersection(a,b){const p=a.from,q=b.from,ux=a.to.x-p.x,uy=a.to.y-p.y,vx=b.to.x-q.x,vy=b.to.y-q.y,det=ux*vy-uy*vx;if(Math.abs(det)<1e-6)return null;const t=((q.x-p.x)*vy-(q.y-p.y)*vx)/det;return {x:p.x+t*ux,y:p.y+t*uy}}
export function measureTarget(image,location,params={}){
  if(location.status!=='LOCATED')return {...unknown(location.reason||'目標尚未定位'),location};
  const edges=Object.fromEntries(['top','bottom','left','right'].map(side=>[side,edgeSearch(image,location.bounds,side,params)]));
  if(Object.values(edges).some(e=>e.status!=='FOUND'))return {...unknown('目標已定位，但部分邊線未通過或存在歧義'),location,edges};
  const g=s=>edges[s].selected.geometry,tl=intersection(g('top'),g('left')),tr=intersection(g('top'),g('right')),bl=intersection(g('bottom'),g('left')),br=intersection(g('bottom'),g('right'));
  if([tl,tr,bl,br].some(p=>!p||!finite(p.x)||!finite(p.y)))return {...unknown('邊線交點退化'),location,edges};
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),width=(dist(tl,tr)+dist(bl,br))/2,height=(dist(tl,bl)+dist(tr,br))/2,angle=g('top').angle_deg;
  if(width<4||height<4||width>image.width*1.2||height>image.height*1.2)return {...unknown('交點產生不合理尺寸'),location,edges};
  const parallel=(a,b)=>{let d=Math.abs(a-b)%180;return Math.min(d,180-d)},vertical=(Math.atan2(g('left').to.y-g('left').from.y,g('left').to.x-g('left').from.x)*180/Math.PI);
  if(parallel(g('top').angle_deg,g('bottom').angle_deg)>3||parallel(g('left').angle_deg,g('right').angle_deg)>3||Math.abs(parallel(angle,vertical)-90)>5)return {...unknown('目前只支援近似矩形平面目標；平行／正交條件未通過'),location,edges};
  return {status:'MEASURED',width,height,angle,center:{x:(tl.x+tr.x+bl.x+br.x)/4,y:(tl.y+tr.y+bl.y+br.y)/4},corners:[tl,tr,br,bl],location,edges,unit:'px'};
}
export function inspectImage(image,recipe,scale={status:'UNKNOWN'}){
  const targets={},measurements={},results=[];
  for(const target of recipe.targets){const location=locateTemplate(image,target.template,recipe.params?.matching);targets[target.id]={location};const needs=recipe.checks.some(c=>(c.targetId===target.id||c.referenceId===target.id)&&c.kind!=='presence');if(needs)targets[target.id].measurement=measureTarget(image,location,{...recipe.params?.edges,edgeAnchors:recipe.params?.edgeAnchors?.[target.id],edgeIntents:recipe.params?.edgeIntents?.[target.id]})}
  for(const check of recipe.checks){const a=targets[check.targetId],b=targets[check.referenceId];let result={checkId:check.id,name:check.name,kind:check.kind,unit:check.unit||'px',status:'UNKNOWN',reason:'尚無有效量測'},value;
    if(check.kind==='presence'){if(a?.location.status==='LOCATED'){value=1;result.status=check.expected===false?'NG':'OK';result.reason='模板位置通過相似度及唯一性檢查'}else result.reason=a?.location.reason||'目標不存在於配方'}
    else if(a?.measurement?.status!=='MEASURED')result.reason=a?.measurement?.reason||'目標未可靠定位';
    else if(check.kind==='width')value=a.measurement.width;
    else if(check.kind==='height')value=a.measurement.height;
    else if(check.kind==='angle')value=a.measurement.angle;
    else if(check.kind==='center_distance'){if(b?.measurement?.status==='MEASURED')value=Math.hypot(a.measurement.center.x-b.measurement.center.x,a.measurement.center.y-b.measurement.center.y);else result.reason=b?.measurement?.reason||'參照部件未可靠定位'}
    if(finite(value)&&check.kind!=='presence'){
      if(check.unit==='mm'){if(scale.status!=='VALID'||!finite(scale.mmPerPixelX??scale.mmPerPixel)||!finite(scale.mmPerPixelY??scale.mmPerPixel)){result.reason=scale.reason||'缺少有效實測標定';value=undefined}else{const sx=scale.mmPerPixelX??scale.mmPerPixel,sy=scale.mmPerPixelY??scale.mmPerPixel,dist=(p,q)=>Math.hypot((p.x-q.x)*sx,(p.y-q.y)*sy),[tl,tr,br,bl]=a.measurement.corners;if(check.kind==='width')value=(dist(tl,tr)+dist(bl,br))/2;else if(check.kind==='height')value=(dist(tl,bl)+dist(tr,br))/2;else if(check.kind==='center_distance')value=dist(a.measurement.center,b.measurement.center)}}
      if(finite(value)){if(!finite(check.min)||!finite(check.max)||check.min>check.max)result.reason='未提供有效合格範圍';else{result.status=value>=check.min&&value<=check.max?'OK':'NG';result.reason='實際像素量測與指定合格範圍比較'}}
    }
    if(finite(value))result.value=value;measurements[check.id]=result;results.push(result)
  }
  const status=results.some(r=>r.status==='NG')?'NG':results.length&&results.every(r=>r.status==='OK')?'OK':'UNKNOWN';
  return {status,checks:measurements,targets,algorithm_version:ALGORITHM_VERSION,recipe_revision:recipe.revision,reason:results.length?'':'尚未建立檢測項目'};
}
export class InspectionEngine{
  constructor(){this.jobs=new Map();if(typeof Worker!=='undefined'){this.worker=new Worker(new URL('./inspection-worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{const job=this.jobs.get(data.id);if(!job)return;this.jobs.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.result)};this.worker.onerror=()=>{for(const j of this.jobs.values())j.reject(Error('檢測工作程序中斷'));this.jobs.clear()}}}
  execute(image,recipe,scale){if(!this.worker)return Promise.resolve(inspectImage(image,recipe,scale));return new Promise((resolve,reject)=>{const id=crypto.randomUUID();this.jobs.set(id,{resolve,reject});this.worker.postMessage({id,image:{width:image.width,height:image.height,gray:image.gray},recipe,scale})})}
  foreground(image,parameters={}){if(!this.worker)return Promise.resolve(foregroundCandidates(image,{parameters}));return new Promise((resolve,reject)=>{const id=crypto.randomUUID();this.jobs.set(id,{resolve,reject});this.worker.postMessage({id,action:'foreground',parameters,image:{width:image.width,height:image.height,gray:image.gray}})})}
  dispose(){this.worker?.terminate();for(const j of this.jobs.values())j.reject(Error('工作程序已關閉'));this.jobs.clear()}
}
