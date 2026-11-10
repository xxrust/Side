import {PIPELINE_SCHEMA,PIPELINE_RESULT_SCHEMA,OPERATOR_REGISTRY,referenceOf,validatePipeline,createPipelinePlan,getPipelineCapabilities} from './pipeline-registry.js';
import {analyzeGear,analyzeAnnulus,analyzeHoles} from './shape-features.js';
import {inspectGrayInput,inspectRgbaInput} from './input-inspection.js';
import {auditPipelineEvidenceDelivery,pipelineEvidenceBinding,pipelineEvidenceFingerprint,pipelineTraceFingerprint,pipelineArtifactFingerprint} from './pipeline-evidence-contract.js';
export {PIPELINE_SCHEMA,PIPELINE_RESULT_SCHEMA,OPERATOR_REGISTRY,validatePipeline,createPipelinePlan,getPipelineCapabilities};

const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const now=()=>globalThis.performance?.now?.()??Date.now();
const uuid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(stable).join(',')}]`:`{${Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
function fingerprintBytes(bytes) {let a=2166136261,b=2246822507;for(const v of bytes){a=Math.imul(a^v,16777619);b=Math.imul(b^v,3266489909);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
export const pipelineFingerprint=plan=>fingerprintBytes(new TextEncoder().encode(stable(plan)));
async function sha256(bytes) {
  if(!globalThis.crypto?.subtle)throw new Error('SHA-256 API unavailable; cannot bind pipeline result to image pixels');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
}
function imagePixels(image) {
  const {width,height}=image||{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>16000000)throw new PipelineExecutionError('IMAGE_INVALID','影像寬高無效或超過 1600 萬像素');
  const count=width*height,gray=new Uint8Array(count),hasProvidedGray=image.gray?.length===count;
  const originalInspection=hasProvidedGray?image.inputInspection||image.grayProvenance?.inputInspection||null:image.rgba?.length===count*4?inspectRgbaInput(image.rgba):null;
  if(image.gray?.length===count)for(let index=0;index<count;index++){if(!Number.isFinite(image.gray[index]))throw new PipelineExecutionError('IMAGE_INVALID','灰階像素包含無效數值');gray[index]=Math.max(0,Math.min(255,Math.round(image.gray[index])));}
  else if(image.rgba?.length===count*4)for(let index=0;index<count;index++)gray[index]=originalInspection.achromatic?image.rgba[index*4]:Math.round(image.rgba[index*4]*.299+image.rgba[index*4+1]*.587+image.rgba[index*4+2]*.114);
  else throw new PipelineExecutionError('IMAGE_INVALID','需要與寬高一致的 gray 或 rgba 像素');
  const normalizedInspection=inspectGrayInput(gray);
  return {width,height,gray,inputMetadata:{representation:image.gray?.length===count?'provided-gray':'rgba',originalStorageType:(image.gray?.length===count?image.gray:image.rgba)?.constructor?.name||'unknown',rgbConversionApplied:image.gray?.length!==count&&originalInspection?.achromatic!==true,conversionStage:'pipeline-input-normalization',colorAvailableToOperators:false,inputInspection:clone(originalInspection),normalizedInspection,upstreamGrayProvenance:image.gray?.length===count?clone(image.grayProvenance??null):null}};
}
function imageFingerprint(image) {const pixels=imagePixels(image);return `${pixels.width}x${pixels.height}:${fingerprintBytes(pixels.gray)}`;}
export const pipelinePixelFingerprint=imageFingerprint;
export function isPipelineResultCurrent(result,image,plan,inputIdentity) {
  if(!result||!image||!plan)return false;
  try{return result.pipelineId===plan.id&&result.pipelineRevision===plan.revision&&result.planFingerprint===pipelineFingerprint(plan)&&result.image?.pixelFingerprint===imageFingerprint(image)&&(!image.sha256||result.image.sourceSha256===image.sha256)&& (inputIdentity===undefined||stable(result.inputIdentity)===stable(inputIdentity));}catch{return false;}
}
export class PipelineExecutionError extends Error {
  constructor(code,message,details={},artifacts=[]){super(message);this.name='PipelineExecutionError';this.code=code;this.details=details;this.artifacts=artifacts;}
}

export function encodeMaskRLE(mask) {
  const runs=[];let start=-1;
  for(let index=0;index<=mask.length;index++){if(index<mask.length&&mask[index]){if(start<0)start=index;}else if(start>=0){runs.push(start,index-start);start=-1;}}
  return runs;
}
export function decodeMaskRLE(artifact) {
  if(artifact?.encoding!=='rle'||!Number.isInteger(artifact.width)||!Number.isInteger(artifact.height)||artifact.width<1||artifact.height<1||artifact.width*artifact.height>16000000||!Array.isArray(artifact.runs)||artifact.runs.length%2)throw new Error('Invalid mask RLE');
  const mask=new Uint8Array(artifact.width*artifact.height);let previousEnd=0;
  for(let index=0;index<artifact.runs.length;index+=2){const start=artifact.runs[index],length=artifact.runs[index+1];if(!Number.isInteger(start)||!Number.isInteger(length)||length<1||start<previousEnd||start+length>mask.length)throw new Error('Invalid mask RLE run');mask.fill(1,start,start+length);previousEnd=start+length;}
  return mask;
}
const maskArtifact=(mask,width,height,id)=>({id,type:'mask',width,height,encoding:'rle',runs:encodeMaskRLE(mask),foregroundValue:1});

function grayscale({image}) {
  const upstream=image.inputMetadata?.upstreamGrayProvenance,conversion={...image.inputMetadata,formula:'Y = round(0.299 R + 0.587 G + 0.114 B)',coefficients:{red:.299,green:.587,blue:.114},quantization:'Clamp to [0,255] and round to uint8; provided gray is only rounded and clamped.',applied:image.inputMetadata?.rgbConversionApplied===true,upstreamConversionKnown:typeof upstream?.formula==='string',alphaHandling:image.inputMetadata?.rgbConversionApplied?'RGBA alpha is not used by this luminance conversion.':'Alpha handling belongs to the upstream decoder; see supplied provenance where available.',limitations:['Only the supplied gray or decoded RGB channel values are available; camera response, ICC profile and illumination were not calibrated.','These fixed luminance coefficients were not tuned on this image.',typeof upstream?.formula==='string'?'The supplied upstream conversion provenance is preserved; color channel data is not available to later operators.':'For provided gray without provenance, the upstream color-to-gray formula and color information cannot be recovered.']};
  const histogram=Array(256).fill(0);let sum=0;for(const value of image.gray){histogram[value]++;sum+=value;}
  const intensityStatistics={pixelCount:image.gray.length,minimum:histogram.findIndex(count=>count>0),maximum:histogram.findLastIndex(count=>count>0),mean:sum/image.gray.length};
  conversion.executionMode=conversion.applied||conversion.upstreamConversionKnown&&upstream?.applied!==false?'format-conversion':'pass-through';
  conversion.informationAdded=false;
  conversion.skipReason=conversion.executionMode==='pass-through'?'Input already provides intensity values; no color-to-gray algorithm is selected or applied.':null;
  return {outputs:{image},artifacts:[{id:'grayscale-image',type:'image',source:'sourceImage',colorMode:'grayscale',width:image.width,height:image.height},{id:'grayscale-conversion',type:'evidence',data:conversion},{id:'grayscale-histogram',type:'histogram',values:histogram,data:intensityStatistics}],summary:{width:image.width,height:image.height,fullResolution:true,colorMode:'grayscale',executionMode:conversion.executionMode,inputInspection:image.inputMetadata?.inputInspection||image.inputMetadata?.normalizedInspection,conversion,intensityStatistics}};
}
function otsu({image},params) {
  const {width,height,gray}=image,histogram=Array(256).fill(0);for(const value of gray)histogram[value]++;
  const binaryPassThrough=params.threshold===undefined&&histogram[0]>0&&histogram[255]>0&&histogram[0]+histogram[255]===gray.length;
  let total=0;for(let value=0;value<256;value++)total+=value*histogram[value];
  let lowerCount=0,lowerSum=0,best=-1;const thresholdScores=[];
  for(let value=0;!binaryPassThrough&&value<256;value++){
    lowerCount+=histogram[value];lowerSum+=value*histogram[value];const upperCount=gray.length-lowerCount,valid=lowerCount>0&&upperCount>0;
    const difference=valid?lowerSum/lowerCount-(total-lowerSum)/upperCount:0,rawScore=valid?lowerCount*upperCount*difference*difference:null;
    if(valid&&rawScore>best)best=rawScore;
    thresholdScores.push({threshold:value,valid,lowerCount,upperCount,rawScore,variance:valid?rawScore/(gray.length*gray.length):null});
  }
  const optimalThresholds=best<0?[]:thresholdScores.filter(score=>score.valid&&score.rawScore===best).map(score=>score.threshold),optimalPlateaus=[];
  for(const threshold of optimalThresholds){const previous=optimalPlateaus.at(-1);if(previous&&previous.end===threshold-1)previous.end=threshold;else optimalPlateaus.push({start:threshold,end:threshold});}
  const threshold=params.threshold??(binaryPassThrough?127:optimalThresholds[0]??0);
  const search={criterion:'w0 * w1 * (mean0 - mean1)^2',normalization:'w0 and w1 are class fractions; rawScore uses class counts and differs only by pixelCount^2.',thresholdScores,optimalThresholds,optimalPlateaus,tieBreak:'first-lowest-threshold',maximumBetweenClassVariance:best<0?null:best/(gray.length*gray.length),selectedThreshold:params.threshold??optimalThresholds[0]??null,selectionMethod:params.threshold===undefined?'otsu-variance-maximum':'prescribed-threshold',selectedInOptimalSet:optimalThresholds.includes(threshold),scope:'All 256 gray8 thresholds evaluated on this raster; this optimizes the Otsu criterion only, not segmentation correctness.'};
  if(binaryPassThrough)Object.assign(search,{criterion:null,normalization:null,tieBreak:null,selectedThreshold:127,selectionMethod:'binary-input-pass-through',selectedInOptimalSet:null,scope:'Input contains only 0 and 255. Otsu search was skipped; 127 only separates the existing labels and does not optimize segmentation.',executionMode:'pass-through',inputLevels:[0,255],equivalentSeparators:{minimum:0,maximum:254}});
  const histogramArtifact={type:'histogram',id:'otsu-histogram',values:histogram,threshold:search.selectedThreshold,betweenClassVariance:thresholdScores.map(score=>score.variance),...search};
  const searchArtifact={type:'curves',id:'otsu-threshold-variance',curves:[{id:'between-class-variance',label:'Otsu 間類方差',xLabel:'閾值',yLabel:'間類方差',points:thresholdScores.map(score=>({x:score.threshold,y:score.variance,valid:score.valid})),threshold:search.selectedThreshold}],data:{optimalThresholds,optimalPlateaus,tieBreak:search.tieBreak,selectionMethod:search.selectionMethod,selectedThreshold:search.selectedThreshold}};
  const artifacts=[histogramArtifact,...(binaryPassThrough?[]:[searchArtifact])];
  const occupied=histogram.reduce((count,value)=>count+(value>0),0);
  if(occupied<2)throw new PipelineExecutionError('UNIFORM_IMAGE','影像只有單一灰階，無法分割前景與背景',{thresholdSearch:search},artifacts);
  let borderDark=0,borderCount=0;
  for(let x=0;x<width;x++){borderDark+=(gray[x]<=threshold);borderCount++;if(height>1){borderDark+=(gray[(height-1)*width+x]<=threshold);borderCount++;}}
  for(let y=1;y<height-1;y++){borderDark+=(gray[y*width]<=threshold);borderCount++;if(width>1){borderDark+=(gray[y*width+width-1]<=threshold);borderCount++;}}
  const borderRatio=borderDark/borderCount;
  const ambiguous=Math.abs(borderRatio-.5)<.05,polarityBasis={threshold,borderDarkPixels:borderDark,borderPixels:borderCount,borderDarkRatio:borderRatio,configuredPolarity:params.polarity,ambiguityHalfWidth:.05,ambiguous,rule:'auto: dark-border ratio > 0.5 selects bright foreground; otherwise dark foreground. abs(ratio - 0.5) < 0.05 is ambiguous.',source:'operator-default',comparison:'Boundary intensity occupancy only; alternative segmentation methods were not compared.'};
  artifacts.push({id:'otsu-polarity',type:'evidence',data:polarityBasis});
  if(params.polarity==='auto'&&ambiguous)throw new PipelineExecutionError('POLARITY_AMBIGUOUS','影像邊界亮暗比例相近，需要明確指定前景極性',{threshold,borderDarkRatio:borderRatio,polarityBasis},artifacts);
  const polarity=params.polarity==='auto'?(borderRatio>.5?'bright':'dark'):params.polarity;
  const mask=new Uint8Array(gray.length);let foregroundPixels=0;
  for(let index=0;index<gray.length;index++){mask[index]=polarity==='dark'?+(gray[index]<=threshold):+(gray[index]>threshold);foregroundPixels+=mask[index];}
  if(!foregroundPixels||foregroundPixels===gray.length)throw new PipelineExecutionError('EMPTY_SEGMENTATION','閾值未產生可分離的前景',{threshold,polarity,foregroundPixels},artifacts);
  return {outputs:{binary:{width,height,mask,threshold,polarity}},artifacts:[maskArtifact(mask,width,height,'segmented-mask'),...artifacts],summary:{width,height,threshold,polarity,borderDarkRatio:borderRatio,foregroundPixels,fullResolution:true,executionMode:binaryPassThrough?'pass-through':'segmentation',inputInspection:image.inputMetadata?.inputInspection||image.inputMetadata?.normalizedInspection,thresholdSearch:{optimalThresholds,optimalPlateaus,tieBreak:search.tieBreak,selectionMethod:search.selectionMethod,maximumBetweenClassVariance:search.maximumBetweenClassVariance},polarityBasis}};
}

// The directed edges follow actual pixel cell boundaries. No convex hull is used.
function boundaryLoops(mask,width,height,bounds) {
  const stride=width+1,edges=[],starts=new Map();
  const add=(ax,ay,bx,by)=>{const start=ay*stride+ax,end=by*stride+bx,index=edges.length;edges.push({start,end});if(!starts.has(start))starts.set(start,[]);starts.get(start).push(index);};
  const x0=Math.max(0,bounds?.x??0),y0=Math.max(0,bounds?.y??0),x1=Math.min(width,x0+(bounds?.width??width)),y1=Math.min(height,y0+(bounds?.height??height));
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const at=y*width+x;if(!mask[at])continue;if(y===0||!mask[at-width])add(x,y,x+1,y);if(x===width-1||!mask[at+1])add(x+1,y,x+1,y+1);if(y===height-1||!mask[at+width])add(x+1,y+1,x,y+1);if(x===0||!mask[at-1])add(x,y+1,x,y);}
  const used=new Uint8Array(edges.length),loops=[];
  for(let startIndex=0;startIndex<edges.length;startIndex++){if(used[startIndex])continue;const points=[];let index=startIndex,guard=0;while(index!==undefined&&!used[index]&&guard++<=edges.length){const edge=edges[index];used[index]=1;points.push({x:edge.start%stride,y:Math.floor(edge.start/stride)});if(edge.end===edges[startIndex].start)break;const candidates=(starts.get(edge.end)||[]).filter(next=>!used[next]);if(candidates.length>1){const dx=edge.end%stride-edge.start%stride,dy=Math.floor(edge.end/stride)-Math.floor(edge.start/stride);candidates.sort((a,b)=>{const turn=next=>{const e=edges[next],nx=e.end%stride-e.start%stride,ny=Math.floor(e.end/stride)-Math.floor(e.start/stride),cross=dx*ny-dy*nx,dot=dx*nx+dy*ny;return cross===1?0:dot===1?1:cross===-1?2:3;};return turn(a)-turn(b);});}index=candidates[0];}if(points.length>2)loops.push(points);}
  return loops;
}
function signedArea(points){let sum=0;for(let index=0;index<points.length;index++){const a=points[index],b=points[(index+1)%points.length];sum+=a.x*b.y-b.x*a.y;}return sum/2;}
function components({binary},params) {
  const {width,height,mask}=binary,count=mask.length,labels=new Int32Array(count),queue=new Int32Array(count),candidates=[];let label=0;
  for(let start=0;start<count;start++) {
    if(!mask[start]||labels[start])continue;
    label++;let head=0,tail=1,area=0,sumX=0,sumY=0,minX=width,minY=height,maxX=-1,maxY=-1,touchesBorder=false;queue[0]=start;labels[start]=label;
    while(head<tail){const at=queue[head++],x=at%width,y=Math.floor(at/width);area++;sumX+=x+.5;sumY+=y+.5;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);touchesBorder ||= x===0||y===0||x===width-1||y===height-1;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const next=ny*width+nx;if(mask[next]&&!labels[next]){labels[next]=label;queue[tail++]=next;}}}
    const rejectionReasons=[];if(area<params.minArea)rejectionReasons.push('AREA_BELOW_MINIMUM');if(params.excludeBoundary&&touchesBorder)rejectionReasons.push('TOUCHES_IMAGE_BOUNDARY');
    candidates.push({id:label,area,bounds:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},centroid:{x:sumX/area,y:sumY/area},touchesBorder,eligible:rejectionReasons.length===0,rejectionReasons,eligibilityTests:{minArea:{actual:area,threshold:params.minArea,passed:area>=params.minArea},excludeBoundary:{enabled:params.excludeBoundary,actual:touchesBorder,passed:!params.excludeBoundary||!touchesBorder}},selectionStatus:rejectionReasons.length?'rejected':'eligible-unselected'});
  }
  const eligible=candidates.filter(candidate=>candidate.eligible),summary={candidateCount:candidates.length,eligibleCount:eligible.length,candidates:candidates.slice(0,1000),candidatesTruncated:candidates.length>1000,selection:params.selection,connectivity:{foreground:8,background:4},fullResolution:true};
  const selectionEvidence={strategy:params.selection,requestedComponentId:params.componentId??null,selectedComponentId:null,tieBreak:params.selection==='largest'?'first-raster-label-if-equal-area':null,optimizationPerformed:false};
  const candidateArtifact={id:'component-candidates',type:'evidence',data:{...summary,candidates,candidatesTruncated:false,detailCoverage:'all-candidates',selectionEvidence}};
  if(!eligible.length)throw new PipelineExecutionError('NO_FOREGROUND_REGION','找不到符合最小面積及邊界條件的前景物件',summary,[candidateArtifact]);
  let selected;
  if(params.selection==='component')selected=eligible.find(candidate=>candidate.id===params.componentId);
  else if(params.selection==='largest')selected=eligible.reduce((best,candidate)=>!best||candidate.area>best.area?candidate:best,null);
  else if(eligible.length===1)selected=eligible[0];
  else {for(const candidate of eligible)candidate.selectionStatus='ambiguous';throw new PipelineExecutionError('AMBIGUOUS_REGIONS',`找到 ${eligible.length} 個前景候選，需明確選擇物件`,summary,[candidateArtifact]);}
  if(!selected)throw new PipelineExecutionError('COMPONENT_NOT_ELIGIBLE','指定候選不存在或未通過邊界/面積條件',summary,[candidateArtifact]);
  selected.selectionStatus='selected';selectionEvidence.selectedComponentId=selected.id;
  selectionEvidence.selectedArea=selected.area;
  if(params.selection==='largest')selectionEvidence.equalMaximumAreaCandidateIds=eligible.filter(candidate=>candidate.area===selected.area).map(candidate=>candidate.id);
  const selectedMask=new Uint8Array(count);for(let index=0;index<count;index++)selectedMask[index]=+(labels[index]===selected.id);
  const exterior=new Uint8Array(count);let head=0,tail=0;
  const enqueue=at=>{if(!selectedMask[at]&&!exterior[at]){exterior[at]=1;queue[tail++]=at;}};
  for(let x=0;x<width;x++){enqueue(x);enqueue((height-1)*width+x);}for(let y=1;y<height-1;y++){enqueue(y*width);enqueue(y*width+width-1);}
  const neighbors=(at,callback)=>{const x=at%width;if(x>0)callback(at-1);if(x<width-1)callback(at+1);if(at>=width)callback(at-width);if(at<count-width)callback(at+width);};
  while(head<tail)neighbors(queue[head++],enqueue);
  const holeLabels=new Int32Array(count),holes=[];let holeId=0;
  for(let start=0;start<count;start++) {
    if(selectedMask[start]||exterior[start]||holeLabels[start])continue;
    holeId++;head=0;tail=1;queue[0]=start;holeLabels[start]=holeId;let sx=0,sy=0,minX=width,minY=height,maxX=-1,maxY=-1;
    while(head<tail){const at=queue[head++],x=at%width,y=Math.floor(at/width);sx+=x+.5;sy+=y+.5;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);neighbors(at,next=>{if(!selectedMask[next]&&!exterior[next]&&!holeLabels[next]){holeLabels[next]=holeId;queue[tail++]=next;}});}
    holes.push({id:`hole-${holeId}`,label:holeId,area:tail,centroid:{x:sx/tail,y:sy/tail},bounds:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},boundary:[]});
  }
  const loops=boundaryLoops(selectedMask,width,height,selected.bounds),outerLoops=loops.filter(points=>signedArea(points)>0).sort((a,b)=>Math.abs(signedArea(b))-Math.abs(signedArea(a))),innerLoops=loops.filter(points=>signedArea(points)<0);
  for(const points of innerLoops){const a=points[0],b=points[1],mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y;const x=Math.floor(mx+dy*.25),y=Math.floor(my-dx*.25),target=x>=0&&y>=0&&x<width&&y<height?holes[holeLabels[y*width+x]-1]:null;if(target)target.boundary=points;}
  const region={width,height,mask:selectedMask,area:selected.area,centroid:selected.centroid,bounds:selected.bounds,touchesBorder:selected.touchesBorder,outerContour:outerLoops[0]||[],outerContours:outerLoops,holes,exteriorBackground:{width,height,mask:exterior},selectedComponentId:selected.id};
  const contours=[...outerLoops.map((points,index)=>({id:`outer-${index+1}`,role:'outer',points})),...holes.map(hole=>({id:hole.id,role:'hole',points:hole.boundary}))];
  return {outputs:{region},artifacts:[candidateArtifact,maskArtifact(selectedMask,width,height,'selected-region'),{id:'region-contours',type:'contours',contours}],summary:{...summary,selectedComponentId:selected.id,area:selected.area,holeCount:holes.length,bounds:selected.bounds,centroid:selected.centroid,outerContourPoints:region.outerContour.length}};
}

function evidenceArtifacts(analysis) {
  const evidence=analysis.evidence||{},artifacts=[{id:'feature-evidence',type:'evidence',data:clone(evidence)}],circles=[],points=[],curves=[],contours=[];
  const circleKeys=new Set();
  const circle=(id,value)=>{if(!value?.center||!Number.isFinite(value.radius))return;const key=`${value.center.x}:${value.center.y}:${value.radius}`;if(circleKeys.has(key))return;circleKeys.add(key);circles.push({id,role:id,center:clone(value.center),radius:value.radius});};
  for(const [key,value] of Object.entries(analysis.measurements||{}))circle(key,value);
  for(const [key,value] of Object.entries(evidence)) {
    circle(key,value);
    if(value&&Number.isFinite(value.x)&&Number.isFinite(value.y))points.push({id:key,...value});
    if(key==='radialCurve'&&Array.isArray(value))curves.push({id:key,label:'徑向輪廓',xLabel:'角度 (rad)',yLabel:'半徑 (px)',points:value.map(point=>({x:point.angleRad,y:point.smoothedRadiusPx??point.radiusPx})),series:[{id:'observed',label:'觀測/內插半徑',points:value.map(point=>({x:point.angleRad,y:point.radiusPx}))}]});
    if(Array.isArray(value))for(const [index,item] of value.entries()){
      circle(`${key}-${index}`,item?.circle);
      if(item?.point&&Number.isFinite(item.point.x)&&Number.isFinite(item.point.y))points.push({id:`${key}-${index}`,role:key,...(key==='peaks'?{label:`齒 ${index+1}`} : {}),...clone(item.point)});
      if(item?.center&&Number.isFinite(item.center.x)&&Number.isFinite(item.center.y))points.push({id:`${key}-center-${index}`,role:'hole-center',...clone(item.center)});
    }
    if(Array.isArray(value)&&value.length&&value.every(item=>Number.isFinite(item?.x)&&Number.isFinite(item?.y))) {
      if(/contour|boundary/i.test(key))contours.push({id:key,role:/hole|inner/i.test(key)?'hole':'outer',points:clone(value)});
      else if(/curve|profile|signal|radius|radial/i.test(key))curves.push({id:key,label:key,points:clone(value)});
      else for(let index=0;index<value.length;index++)points.push({role:'support',...clone(value[index])});
    }
  }
  if(circles.length)artifacts.push({id:'feature-circles',type:'circles',circles});
  if(points.length)artifacts.push({id:'feature-points',type:'points',points});
  if(curves.length)artifacts.push({id:'feature-curves',type:'curves',curves});
  if(contours.length)artifacts.push({id:'feature-contours',type:'contours',contours});
  return artifacts;
}
function features(analyzer) {return ({region},params)=>{const analysis=analyzer(region,params);return {outputs:{analysis},artifacts:evidenceArtifacts(analysis),summary:{featureStatus:analysis.status,reason:analysis.reason,measurements:clone(analysis.measurements),parameters:clone(analysis.parameters),limitations:clone(analysis.limitations||[])},gateContext:{clipped:region.touchesBorder===true||region.outerContour?.some(point=>point.x<=0||point.y<=0||point.x>=region.width-1||point.y>=region.height-1),closedHoleCount:region.holes.length}};};}
function normalizeScale(scale) {
  if(!scale)return {valid:false,reason:'SCALE_MISSING'};
  if(scale.valid===false||(scale.status!==undefined&&scale.status!=='VALID'))return {valid:false,reason:'SCALE_UNVERIFIED'};
  const hasAxes=scale.mmPerPixelX!==undefined||scale.mmPerPixelY!==undefined;
  if(hasAxes&&(!Number.isFinite(scale.mmPerPixelX)||!Number.isFinite(scale.mmPerPixelY)||scale.mmPerPixelX<=0||scale.mmPerPixelY<=0))return {valid:false,reason:'SCALE_AXES_REQUIRED'};
  if(hasAxes&&Math.abs(scale.mmPerPixelX-scale.mmPerPixelY)>Math.max(scale.mmPerPixelX,scale.mmPerPixelY)*1e-9)return {valid:false,reason:'ANISOTROPIC_SCALE_UNSUPPORTED'};
  const ratio=hasAxes?scale.mmPerPixelX:scale.mmPerPixel??scale.mmPerPx??(scale.unit==='mm'?scale.value:undefined);
  if(!Number.isFinite(ratio)||ratio<=0)return {valid:false,reason:'SCALE_INVALID'};
  const explicit=scale.source||scale.provenance||scale.calibrationId||scale.reference||(scale.status==='VALID'&&scale.profileId?{profileId:scale.profileId,profileRevision:scale.profileRevision??null}:null);
  if(!explicit)return {valid:false,reason:'SCALE_PROVENANCE_MISSING'};
  return {valid:true,mmPerPixel:ratio,source:clone(explicit),calibrationId:scale.calibrationId??null,profileId:scale.profileId??null,profileRevision:scale.profileRevision??null};
}
function measurementUnit(path,measurement) {
  if(measurement&&typeof measurement==='object'&&measurement.unit)return measurement.unit;
  const name=path.split('.').at(-1);
  if(/^(visibleTeeth|missingTeeth|excessTeeth|closedHoleCount|missingHoleCount|openHoleCount|matchedHoleCount|unmatchedClosedHoleCount|supportCount|inputSupportCount|iterations)$/.test(name))return 'count';
  if(/^(outerDiameter|innerDiameter|centerDistance|eccentricityPx|radialToothHeight|radius|diameter|rmsResidual|maxAbsResidual|radialPeakToValley)$/.test(name))return 'px';
  if(name==='pitchVariation'||name==='relativeRmsResidual')return 'ratio';
  if(name==='angularCoverageDeg')return 'deg';
  return undefined;
}
function unitValue(measurement,unit,scale,path) {
  const value=typeof measurement==='object'?measurement?.value:measurement,actual=measurementUnit(path,measurement);
  if(unit==='mm'){if(actual==='mm')return {value};if(!scale.valid)return {reason:'UNCALIBRATED'};if(actual!=='px')return {reason:'UNIT_MISMATCH'};return {value:value*scale.mmPerPixel};}
  if(unit&&unit!==actual)return {reason:'UNIT_MISMATCH'};
  return {value};
}
function evaluateRules({analysis},params,context) {
  const measurements=analysis.measurements||{},rules=[];
  for(const [index,rule] of params.rules.entries()) {
    const result={id:rule.id||`rule-${index+1}`,measurement:rule.measurement,spec:clone(rule)},measurement=rule.measurement.split('.').reduce((value,key)=>value?.[key],measurements);
    if(measurement===undefined||measurement===null){rules.push({...result,status:'UNKNOWN',reason:'MEASUREMENT_MISSING'});continue;}
    const converted=unitValue(measurement,rule.unit,context.scale,rule.measurement);
    if(converted.reason){rules.push({...result,status:'UNKNOWN',reason:converted.reason});continue;}
    const actual=converted.value;
    if(typeof actual==='number'&&!Number.isFinite(actual)){rules.push({...result,status:'UNKNOWN',reason:'MEASUREMENT_INVALID'});continue;}
    if(rule.min===undefined&&rule.max===undefined&&rule.equals===undefined){rules.push({...result,status:'UNKNOWN',reason:'SPEC_MISSING',actual});continue;}
    if((rule.min!==undefined||rule.max!==undefined)&&typeof actual!=='number'){rules.push({...result,status:'UNKNOWN',reason:'MEASUREMENT_NOT_NUMERIC',actual});continue;}
    const pass=(rule.equals===undefined||actual===rule.equals)&&(rule.min===undefined||actual>=rule.min)&&(rule.max===undefined||actual<=rule.max);
    rules.push({...result,status:pass?'PASS':'FAIL',reason:pass?'WITHIN_SPEC':'OUTSIDE_SPEC',actual,unit:rule.unit??measurementUnit(rule.measurement,measurement)});
  }
  const featureStatus=String(analysis.status||'').toUpperCase(),featureUsable=['OK','SUCCESS','VALID','MEASURED'].includes(featureStatus);
  const classification=!rules.length?{status:'UNKNOWN',reason:'SPEC_MISSING',rules}:!featureUsable?{status:'UNKNOWN',reason:analysis.reason||'FEATURE_UNCERTAIN',rules}:rules.some(rule=>rule.status==='FAIL')?{status:'FAIL',reason:'OUTSIDE_SPEC',rules}:rules.some(rule=>rule.status==='UNKNOWN')?{status:'UNKNOWN',reason:rules.find(rule=>rule.status==='UNKNOWN').reason,rules}:{status:'PASS',reason:'WITHIN_SPEC',rules};
  return {outputs:{evaluation:classification},artifacts:[{id:'rule-evaluation',type:'evidence',data:classification}],summary:classification,ruleBasis:{featureStatus:analysis.status,reason:analysis.reason}};
}
const executors={'image.grayscale':grayscale,'segment.otsu':otsu,'regions.components':components,'shape.gear':features(analyzeGear),'geometry.annulus':features(analyzeAnnulus),'topology.holes':features(analyzeHoles),'rules.evaluate':evaluateRules};

export const NODE_DECISION_SCHEMA='agentcv-node-decision-1';
const SOURCE_NAMES=Object.freeze({'operator-default':'operator-default',engineering_default:'operator-default',computed_from_pixels:'data-derived','data-derived':'data-derived',agent:'agent','agent-proposal':'agent',human:'human',user:'human',user_specification:'plan',plan:'plan',not_supplied:'operator-default'});
const normalizeSource=(source,fallback='plan')=>Object.hasOwn(SOURCE_NAMES,source)?SOURCE_NAMES[source]:fallback;
const unsearched=(scope='parameter alternatives')=>({performed:false,status:'not-compared',scope,optimizationPerformed:false,selectionApplied:false,claim:'No alternative parameter search or best-performing claim was made.'});
const GEAR_FORMULAS={
  sampleCount:{formula:'min(1440, max(360, ceil(2*pi*initialOuterCircle.radius)))',constants:{minimumBins:360,maximumBins:1440},description:'Fixed sampling policy applied to a measured radius; sample counts were not optimized.'},
  smoothingWindow:{formula:'max(3, round((measuredPitchBins * 0.12)/2)*2+1)',constants:{pitchFraction:.12,minimumWindow:3},description:'Engineering formula using measured radial repetition; the base was not chosen by the neighborhood test.'},
  minProminence:{formula:'max(1.1, radialRangeP95MinusP05 * 0.23)',constants:{minimumPx:1.1,radialRangeFraction:.23},description:'Fixed raster floor and range fraction; not a learned or globally optimal prominence.'},
  minPeakDistance:{formula:'max(3, measuredPitchBins * 0.48)',constants:{minimumBins:3,pitchFraction:.48},description:'Fixed fraction of observed pitch; parameter neighborhood checks agreement only.'},
  tipCapDropPx:{formula:'max(1, radialRangeP95MinusP05 * 0.08); each cap drop is limited to half its local prominence',constants:{minimumPx:1,radialRangeFraction:.08,localProminenceCapFraction:.5}},
  tipRmsAllowancePx:{formula:'max(1, measuredRadialToothHeight * 0.15)',constants:{minimumPx:1,radialRangeFraction:.15},description:'Fit quality gate with fixed engineering coefficients; not a manufacturing tolerance.'},
};

function appendGearHoleCenterGates(evidence,gates,evidenceRefs) {
  const selection=evidence.holeCenterSelection,saved=!!selection&&typeof selection==='object',count=selection?.candidateCount,unique=count===1;
  const candidates=evidence.holeCenterCandidates||[],candidate=selection?.candidateId!=null?candidates.find(entry=>entry.id===selection.candidateId):unique&&candidates.length===1?candidates[0]:undefined,circle=candidate?.circle,quality=selection?.quality,parameters=selection?.parameters||{};
  const parameter=name=>({value:parameters[name]?.value??null,source:normalizeSource(parameters[name]?.source,'operator-default')}),thresholdSources={formula:'max(maxResidualPx, fittedRadius * maxRelativeResidual)',maxResidualPx:parameter('maxResidualPx'),maxRelativeResidual:parameter('maxRelativeResidual'),fittedRadius:{value:circle?.radius??null,source:'data-derived'}};
  const add=(suffix,label,actual,operator,threshold,{source='operator-default',blocked=false,requiresQuality=true,path,parts,predicate}={})=>{
    const status=!saved?'NOT_EVALUATED':!unique?'NOT_APPLICABLE':blocked||requiresQuality&&!quality||actual===null||actual===undefined||threshold===null||threshold===undefined?'NOT_EVALUATED':predicate(actual,threshold)?'PASS':'FAIL';
    gates.push({id:`gear.hole_center.${suffix}`,label,role:'hole-center-acceptance',actual:clone(actual??null),actualSource:'data-derived',operator,threshold:clone(threshold??null),source,setBy:source==='data-derived'?'operator-default':source,status,evidenceRefs,thresholdSources:parts??null,evidencePath:path??'holeCenterSelection',executionBasis:'instrumented holeCenterSelection and its saved candidate circle; independent of subsequent gear-model acceptance',candidateId:selection?.candidateId??null,adopted:selection?.adopted??null,reason:!saved?'The feature returned before saving hole-center selection; this quality check is not reported as executed.':!unique?'A single bore center requires exactly one enclosed-hole candidate; single-bore quality checks are not applicable.':blocked?'An earlier condition in the existing circleQuality check short-circuited this comparison.':!quality&&requiresQuality?'No instrumented circleQuality result is available.':'Existing hole-center fit-quality check with fixed engineering limits; it is not a part tolerance or a parameter search.'});
  };
  add('candidate_count','孔中心：封閉孔候選須恰為一個',count??null,'==',1,{requiresQuality:false,predicate:(actual,threshold)=>actual===threshold,path:'holeCenterSelection.candidateCount'});
  add('finite_fit','孔中心：須有有限圓擬合',candidate===undefined?null:!!circle,'==',true,{predicate:(actual,threshold)=>actual===threshold,path:'holeCenterCandidates[candidateId].circle'});
  add('radius','孔中心：最小擬合半徑',circle?.radius??null,'>=',4,{blocked:!circle,predicate:(actual,threshold)=>actual>=threshold,path:'holeCenterCandidates[candidateId].circle.radius'});
  add('support','孔中心：最少邊界支持點',circle?.supportCount??null,'>=',24,{blocked:!circle||circle.radius<4,predicate:(actual,threshold)=>actual>=threshold,path:'holeCenterCandidates[candidateId].circle.supportCount'});
  const coverage=parameter('minAngularCoverageDeg'),noCoverage=!circle||circle.radius<4||circle.supportCount<24;
  add('coverage','孔中心：最小角度覆蓋',circle?.angularCoverageDeg??null,'>=',coverage.value,{blocked:noCoverage,source:coverage.source,predicate:(actual,threshold)=>actual>=threshold,path:'holeCenterCandidates[candidateId].circle.angularCoverageDeg',parts:{minAngularCoverageDeg:coverage}});
  const noRms=noCoverage||coverage.value===null||circle.angularCoverageDeg<coverage.value;
  add('rms','孔中心：徑向 RMS 與組合允許值',circle?.rmsResidual??null,'<=',quality?.rmsAllowancePx??null,{blocked:noRms,source:'data-derived',predicate:(actual,threshold)=>actual<=threshold,path:'holeCenterCandidates[candidateId].circle.rmsResidual',parts:thresholdSources});
  add('max_abs','孔中心：最大絕對徑向殘差',circle?.maxAbsResidual??null,'<=',quality?.maxAbsAllowancePx??null,{blocked:noRms||circle.rmsResidual>(quality?.rmsAllowancePx??-1),source:'data-derived',predicate:(actual,threshold)=>actual<=threshold,path:'holeCenterCandidates[candidateId].circle.maxAbsResidual',parts:{...thresholdSources,multiplier:{value:3,source:'operator-default'}}});
  add('adopted','孔中心：已記錄的採用結果',selection?.adopted??null,'==',true,{predicate:(actual,threshold)=>actual===threshold,path:'holeCenterSelection.adopted'});
}

function appendGearCenterRefinementGates(evidence,gates,evidenceRefs) {
  for(const [index,candidate] of (evidence.centerEstimation?.candidates||[]).entries()){
    const finiteFit=!!candidate.center&&Number.isFinite(candidate.center.x)&&Number.isFinite(candidate.center.y),noRms=!finiteFit,noMax=noRms||candidate.rmsResidual>candidate.rmsAllowancePx,noCoverage=noMax||candidate.maxAbsResidual>candidate.maxAbsAllowancePx,noShift=noCoverage||candidate.angularCoverageDeg<candidate.minimumCoverageDeg,noCap=noShift||candidate.shiftFromInitialPx>candidate.maximumShiftFromInitialPx;
    const add=(suffix,label,actual,operator,threshold,{blocked=false,source='operator-default',parts,path,predicate}={})=>{
      const status=blocked||actual===null||actual===undefined||threshold===null||threshold===undefined?'NOT_EVALUATED':predicate(actual,threshold)?'PASS':'FAIL';
      gates.push({id:`gear.center_refinement.${index}.${suffix}`,label:`中心精修 ${index+1}：${label}`,role:'workpiece-center-refinement',iteration:candidate.iteration??index,actual:clone(actual??null),actualSource:'data-derived',operator,threshold:clone(threshold??null),source,setBy:source==='data-derived'?'operator-default':source,status,evidenceRefs,thresholdSources:parts??null,evidencePath:`centerEstimation.candidates[${index}]${path?'.'+path:''}`,executionBasis:'instrumented centerEstimation candidate; independent of subsequent gear-model acceptance',reason:blocked?'A preceding candidate-quality condition short-circuited this check.':'Existing observed tooth-cap center refinement check; a rejected optional refinement retains the previous workpiece center. It is not a bore-center substitution or parameter optimum search.'});
    };
    add('finite_fit','須有有限齒帽圓中心',finiteFit,'==',true,{predicate:(actual,threshold)=>actual===threshold,path:'center'});
    add('rms','齒帽圓 RMS',candidate.rmsResidual??null,'<=',candidate.rmsAllowancePx??null,{blocked:noRms,source:'data-derived',predicate:(actual,threshold)=>actual<=threshold,path:'rmsResidual',parts:{formula:'max(1 px, iteration radialRangeP95MinusP05 * 0.15)',minimumPx:{value:1,source:'operator-default'},rangeFraction:{value:.15,source:'operator-default'}}});
    add('max_abs','最大絕對殘差',candidate.maxAbsResidual??null,'<=',candidate.maxAbsAllowancePx??null,{blocked:noMax,source:'data-derived',predicate:(actual,threshold)=>actual<=threshold,path:'maxAbsResidual',parts:{rmsAllowancePx:{value:candidate.rmsAllowancePx??null,source:'data-derived'},multiplier:{value:3,source:'operator-default'}}});
    add('coverage','角度覆蓋',candidate.angularCoverageDeg??null,'>=',candidate.minimumCoverageDeg??null,{blocked:noCoverage,predicate:(actual,threshold)=>actual>=threshold,path:'angularCoverageDeg'});
    add('shift_from_initial','相對初始外輪廓中心的偏移',candidate.shiftFromInitialPx??null,'<=',candidate.maximumShiftFromInitialPx??null,{blocked:noShift,source:'data-derived',predicate:(actual,threshold)=>actual<=threshold,path:'shiftFromInitialPx',parts:{formula:'initialOuterCircle.radius * 0.1',initialRadius:{value:evidence.centerFit?.radius??null,source:'data-derived'},radiusFraction:{value:.1,source:'operator-default'}}});
    add('cap_truncated','齒帽支持未被截斷',candidate.capTruncated??null,'==',false,{blocked:noCap,predicate:(actual,threshold)=>actual===threshold,path:'capTruncated',parts:{capTruncatedCount:{value:candidate.capTruncatedCount??null,source:'data-derived'}}});
    add('next_profile_valid','新中心的實算徑向訊號有效',candidate.nextProfileValid??null,'==',true,{blocked:candidate.accepted!==true,predicate:(actual,threshold)=>actual===threshold,path:'nextProfileValid'});
    add('adopted','已記錄的中心採用結果',candidate.adopted??null,'==',true,{predicate:(actual,threshold)=>actual===threshold,path:'adopted'});
  }
}

function featureDecisionGates(node,analysis,execution,choices,evidenceRefs) {
  const evidence=analysis.evidence||{},measurements=analysis.measurements||{},parameters=analysis.parameters||{},gates=[],measured=analysis.status==='MEASURED';
  const supplied=name=>choices.find(choice=>choice.name===name)?.source||'operator-default';
  const fixed=(value,name)=>({value,source:name?supplied(name):'operator-default'});
  const cutoffFor=reasons=>measured?Infinity:Object.hasOwn(reasons,analysis.reason)?reasons[analysis.reason]:-1;
  const add=(id,label,stage,cutoff,actual,operator,threshold,{source='operator-default',applicable=true,blocked=false,reason='',path=null,predicate,thresholdSources}={})=>{
    const reached=stage<=cutoff,status=!reached||blocked?'NOT_EVALUATED':!applicable?'NOT_APPLICABLE':actual===null||actual===undefined||threshold===null||threshold===undefined?'NOT_EVALUATED':predicate(actual,threshold)?'PASS':'FAIL';
    gates.push({id,label,role:'model-acceptance',actual:clone(actual??null),actualSource:'data-derived',operator,threshold:clone(threshold??null),source,setBy:source==='data-derived'?'operator-default':source,status,evidenceRefs,thresholdSources:thresholdSources??null,evidencePath:path,executionBasis:'reported feature outcome and preserved evidence in registered operator version 1',reason:!reached?'An earlier return or unrecognized feature outcome means this acceptance gate was not reached.':blocked?'The preceding condition short-circuited this gate.':!applicable?reason||'This conditional gate does not apply.':reason||'Fixed model/fit gate; not a manufacturing acceptance tolerance.'});
  };
  if(node.op==='shape.gear') {
    const cutoff=cutoffFor({'No resolvable gear-like radial repetition was found.':0,'Invalid peak smoothing, prominence or distance parameters.':1,'The boundary touches the image edge; complete visible-tooth counting is not established.':2,'The outer boundary has an unsupported angular sector.':3,'Radial modulation is too weak or has too few supported peaks for a tooth count.':4,'Peak count changes within the tested smoothing and prominence neighborhood.':5,'Observed tooth tips do not support a consistent circular rim; contamination or nonuniform tooth geometry remains unresolved.':6,'Peak spacing is too irregular for an interpretable gear tooth count.':7,'The observed root concavity or radial tooth depth falls outside the stated gear profile model.':8,'Observed count differs from the specification, but missing-sector geometry does not explain the difference.':9});
    const periodicity=evidence.periodicity||{},frequency=periodicity.dominantFrequency??evidence.spectralCandidates?.[0]?.frequency??null,count=measurements.visibleTeeth??null,range=periodicity.radialRangePx??null,amplitude=periodicity.amplitudePx??null,counts=(evidence.parameterComparisons||[]).map(candidate=>candidate.count),fit=evidence.tipCircleFit,tip=evidence.tipConsistency;
    add('gear.repetition','Resolvable radial repetition',0,cutoff,frequency,'>=',4,{path:'spectralCandidates[0].frequency',predicate:(actual,threshold)=>actual>=threshold});
    add('gear.peak_parameters','Valid peak parameter ranges',1,cutoff,cutoff>=1?analysis.reason!=='Invalid peak smoothing, prominence or distance parameters.':null,'==',true,{predicate:(actual,threshold)=>actual===threshold,reason:'Reported signal parameter validation; a false result is not a parameter optimum search.'});
    add('gear.complete_boundary','Complete observed boundary',2,cutoff,execution.gateContext?.clipped??null,'==',false,{predicate:(actual,threshold)=>actual===threshold});
    add('gear.angular_support','Largest unsupported angular sector',3,cutoff,evidence.angularSupport?.largestUnobservedAngleDeg??null,'<=',parameters.maxUnsupportedAngleDeg?.value??10,{source:supplied('maxUnsupportedAngleDeg'),path:'angularSupport.largestUnobservedAngleDeg',predicate:(actual,threshold)=>actual<=threshold});
    add('gear.minimum_peaks','Minimum supported radial peaks',4,cutoff,count,'>=',4,{predicate:(actual,threshold)=>actual>=threshold,path:'measurements.visibleTeeth'});
    add('gear.radial_range','Minimum radial modulation',4,cutoff,range,'>=',2.5,{blocked:count!==null&&count<4,predicate:(actual,threshold)=>actual>=threshold,path:'periodicity.radialRangePx'});
    add('gear.spectral_amplitude','Minimum dominant spectral amplitude',4,cutoff,amplitude,'>=',range===null?null:Math.max(.8,range*.12),{blocked:count!==null&&count<4||range!==null&&range<2.5,predicate:(actual,threshold)=>actual>=threshold,path:'periodicity.amplitudePx',thresholdSources:{minimumPx:fixed(.8),radialRangeFraction:fixed(.12)}});
    add('gear.parameter_count_agreement','All tested parameter counts agree',5,cutoff,counts.length?counts:null,'all ==',count,{predicate:(actual,threshold)=>actual.every(value=>value===threshold),source:supplied('countAgreementRequired'),path:'parameterComparisons[*].count'});
    add('gear.tip_fit','Finite supported tooth-tip circle',6,cutoff,tip?!!fit:null,'==',true,{applicable:!!tip,predicate:(actual,threshold)=>actual===threshold,path:'tipCircleFit',reason:'Tip consistency is conditional on at least six observed peaks.'});
    add('gear.tip_rms','Tooth-tip radial RMS',6,cutoff,fit?.rmsResidual??null,'<=',tip?.rmsAllowancePx??null,{applicable:!!tip,blocked:!!tip&&!fit,predicate:(actual,threshold)=>actual<=threshold,source:'data-derived',path:'tipCircleFit.rmsResidual',thresholdSources:{formula:'max(1 px, measuredRadialToothHeight * 0.15)',floor:fixed(1),fraction:fixed(.15)}});
    add('gear.tip_max_abs','Tooth-tip maximum absolute residual',6,cutoff,fit?.maxAbsResidual??null,'<=',tip?.maxAbsAllowancePx??null,{applicable:!!tip,blocked:!!tip&&(!fit||fit.rmsResidual>tip.rmsAllowancePx),predicate:(actual,threshold)=>actual<=threshold,source:'data-derived',path:'tipCircleFit.maxAbsResidual',thresholdSources:{rmsAllowancePx:tip?.rmsAllowancePx??null,multiplier:fixed(3)}});
    const cv=periodicity.pitchVariation??null,cvLimit=parameters.maxPitchVariation?.value??.18;
    add('gear.pitch_variation','Ordinary tooth-gap coefficient of variation',7,cutoff,cv,'<=',cvLimit,{source:supplied('maxPitchVariation'),predicate:(actual,threshold)=>actual<=threshold,path:'periodicity.pitchVariation'});
    add('gear.ordinary_gap_fraction','Sufficient ordinary observed gaps',7,cutoff,periodicity.normalGapCount??null,'>=',count===null?null:count*.6,{blocked:cv!==null&&cv>cvLimit,predicate:(actual,threshold)=>actual>=threshold,path:'periodicity.normalGapCount',thresholdSources:{observedPeakCount:count,minimumFraction:fixed(.6)}});
    const root=evidence.rootModel||{},fractionLimit=parameters.minSupportedRootFraction?.value??.7;
    add('gear.root_support','Fraction of ordinary gaps with inward roots',8,cutoff,root.supportedRootFraction??null,'>=',fractionLimit,{source:supplied('minSupportedRootFraction'),predicate:(actual,threshold)=>actual>=threshold,path:'rootModel.supportedRootFraction',thresholdSources:{fraction:fixed(fractionLimit,'minSupportedRootFraction'),individualRootConcavityPx:fixed(parameters.minRootConcavityPx?.value??1.5,'minRootConcavityPx')}});
    add('gear.radial_depth_model','Supported radial tooth-depth ratio',8,cutoff,root.radialModulationRatio??null,'<=',parameters.maxRadialModulationRatio?.value??.35,{blocked:root.supportedRootFraction!==undefined&&root.supportedRootFraction<fractionLimit,source:supplied('maxRadialModulationRatio'),predicate:(actual,threshold)=>actual<=threshold,path:'rootModel.radialModulationRatio'});
    add('gear.nominal_missing_consistency','Missing count explained by observed peak gaps',9,cutoff,evidence.expectedCountComparison?.gapInferredMissing??null,'==',measurements.missingTeeth??null,{applicable:parameters.expectedTeeth?.value!=null&&(measurements.missingTeeth??0)>0,source:supplied('expectedTeeth'),predicate:(actual,threshold)=>actual===threshold,path:'expectedCountComparison.gapInferredMissing',reason:parameters.expectedTeeth?.value==null?'No expected tooth count was supplied; no nominal missing-tooth inference was performed.':'No positive missing count needs geometric explanation.'});
    appendGearCenterRefinementGates(evidence,gates,evidenceRefs);
    appendGearHoleCenterGates(evidence,gates,evidenceRefs);
  } else if(node.op==='geometry.annulus') {
    const cutoff=cutoffFor({'The component touches the image edge; a complete annulus is not established.':0,'An annulus requires exactly one enclosed hole.':1,'The outer or inner boundary is not sufficiently circular under the stated fit quality gates.':2,'The fitted inner circle is not fully inside the fitted outer circle.':3});
    add('annulus.complete_boundary','Complete observed boundary',0,cutoff,execution.gateContext?.clipped??null,'==',false,{predicate:(actual,threshold)=>actual===threshold});
    add('annulus.one_hole','Exactly one enclosed inner boundary',1,cutoff,measurements.closedHoleCount??null,'==',1,{predicate:(actual,threshold)=>actual===threshold,path:'measurements.closedHoleCount'});
    for(const [side,circle,quality] of [['outer',measurements.outerCircle,evidence.outerQuality],['inner',measurements.innerCircle,evidence.innerQuality]]){
      const sourceNames={maxRelativeResidual:supplied('maxRelativeResidual'),maxResidualPx:supplied('maxResidualPx'),minAngularCoverageDeg:supplied('minAngularCoverageDeg')},innerBlocked=side==='inner'&&evidence.outerQuality?.accepted===false;
      add(`annulus.${side}.finite_fit`,`${side} finite circle`,2,cutoff,!!circle,'==',true,{blocked:innerBlocked,predicate:(actual,threshold)=>actual===threshold});
      add(`annulus.${side}.radius`,`${side} minimum radius`,2,cutoff,circle?.radius??null,'>=',4,{blocked:innerBlocked||!circle,predicate:(actual,threshold)=>actual>=threshold});
      add(`annulus.${side}.support`,`${side} minimum boundary support`,2,cutoff,circle?.supportCount??null,'>=',24,{blocked:innerBlocked||!circle||circle.radius<4,predicate:(actual,threshold)=>actual>=threshold});
      add(`annulus.${side}.coverage`,`${side} angular coverage`,2,cutoff,circle?.angularCoverageDeg??null,'>=',parameters.minAngularCoverageDeg?.value??300,{blocked:innerBlocked||!circle||circle.radius<4||circle.supportCount<24,source:sourceNames.minAngularCoverageDeg,predicate:(actual,threshold)=>actual>=threshold});
      const noRms=innerBlocked||!circle||circle.radius<4||circle.supportCount<24||circle.angularCoverageDeg<(parameters.minAngularCoverageDeg?.value??300),thresholdSources={formula:'max(maxResidualPx, fittedRadius * maxRelativeResidual)',maxResidualPx:{value:parameters.maxResidualPx?.value??1,source:sourceNames.maxResidualPx},maxRelativeResidual:{value:parameters.maxRelativeResidual?.value??.025,source:sourceNames.maxRelativeResidual},fittedRadius:{value:circle?.radius??null,source:'data-derived'}};
      add(`annulus.${side}.rms`,`${side} radial RMS against combined allowance`,2,cutoff,circle?.rmsResidual??null,'<=',quality?.rmsAllowancePx??null,{blocked:noRms,source:'data-derived',predicate:(actual,threshold)=>actual<=threshold,thresholdSources});
      add(`annulus.${side}.max_abs`,`${side} maximum absolute residual`,2,cutoff,circle?.maxAbsResidual??null,'<=',quality?.maxAbsAllowancePx??null,{blocked:noRms||circle.rmsResidual>(quality?.rmsAllowancePx??-1),source:'data-derived',predicate:(actual,threshold)=>actual<=threshold,thresholdSources:{...thresholdSources,multiplier:fixed(3)}});
    }
    add('annulus.inner_containment','Fitted inner circle is contained in outer circle',3,cutoff,measurements.outerCircle&&measurements.innerCircle?measurements.centerDistance+measurements.innerCircle.radius:null,'<',measurements.outerCircle?.radius??null,{source:'data-derived',predicate:(actual,threshold)=>actual<threshold,path:'measurements.centerDistance + innerCircle.radius'});
  } else if(node.op==='topology.holes') {
    const cutoff=cutoffFor({'Component reaches the image edge; only the enclosed holes in the observed mask are counted.':0,'Some expected positions cannot be resolved as a closed, missing or exterior-connected hole.':1});
    add('holes.complete_boundary','Complete component for hole topology',0,cutoff,execution.gateContext?.clipped??null,'==',false,{predicate:(actual,threshold)=>actual===threshold});
    const comparisons=evidence.expectedPositionComparisons||[];
    add('holes.expected_positions_resolved','All supplied expected positions are resolved',1,cutoff,comparisons.filter(candidate=>candidate.status==='UNKNOWN').length,'==',0,{applicable:parameters.expectedPositions?.value!=null,source:supplied('expectedPositions'),predicate:(actual,threshold)=>actual===threshold,path:'expectedPositionComparisons[*].status',reason:'No expected positions were supplied; observed hole count does not establish missing or open nominal holes.'});
  }
  return gates;
}

function nodeDecision(trace,node,plan,context,execution) {
  const executed=trace.status!=='SKIPPED',applied=trace.status==='OK',analysis=execution?.outputs?.analysis,featureEvidence=analysis?.evidence||trace.artifacts.find(artifact=>artifact.id.endsWith(':feature-evidence'))?.data||{},choices=[];
  const artifact=suffix=>trace.artifacts.find(entry=>entry.id===`${node.id}:${suffix}`);
  const refs=(...suffixes)=>suffixes.map(artifact).filter(Boolean).map(entry=>entry.id);
  const sourceFor=name=>{
    const rootName=name.split(/[.\[]/)[0],explicit=Object.hasOwn(node.params||{},rootName),raw=Object.hasOwn(node.parameterSources||{},name)?node.parameterSources[name]:node.parameterSources?.[rootName]||(explicit?plan.provenance?.source:'operator-default')||(explicit?'plan':'operator-default');
    return {explicit,raw,source:normalizeSource(raw,explicit?'plan':'operator-default')};
  };
  const add=(name,value,extra={})=>{
    const declared=sourceFor(name),record=trace.parameterDerivations?.[name],recordSource=normalizeSource(record?.source,'operator-default'),source=declared.explicit?declared.source:record?recordSource:declared.source;
    const choice={name,value:clone(value),source,setBy:declared.explicit?declared.source:'operator-default',rawSource:declared.explicit?declared.raw:record?.source||declared.raw,status:executed?(trace.status==='FAILED'?'attempted':value===null?'not-supplied':'applied'):'not-executed',method:declared.explicit?'prescribed-value':recordSource==='data-derived'?'pixel-derived-engineering-formula':'fixed-engineering-policy',reason:declared.explicit?'The saved plan supplies this value; the runtime did not optimize it.':record?.description||'Fixed operator default; no tuning on this image was performed.',derivation:{source:declared.explicit?'plan':recordSource,rawSource:record?.source||declared.raw,description:record?.description||null},evidenceRefs:[],observedValues:{},comparison:unsearched(),...extra};
    if(!executed){choice.status='not-executed';choice.comparison=unsearched('upstream failed; this node did not execute');}
    choices.push(choice);return choice;
  };
  for(const [name,value] of Object.entries(trace.parameters))add(name,value);
  const get=name=>choices.find(choice=>choice.name===name);
  const boundary=(code,message,evidenceRefs=[])=>({code,message,evidenceRefs});
  const boundaries=[boundary('TOOL_ALTERNATIVES_NOT_COMPARED','The saved graph prescribed this operator. Runtime did not compare alternative operator families or establish this as the best method.')];
  const toolSource=plan.provenance?.source==='agent'?'agent':normalizeSource(node.provenance?.source||plan.provenance?.source,'plan');
  const decision={schema:NODE_DECISION_SCHEMA,executionStatus:trace.status,toolChoice:{op:node.op,version:node.version,status:'prescribed',source:toolSource,setBy:toolSource,selectionMethod:'explicit-plan',taskTemplateHint:plan.task??null,reason:'Operator and typed input links are specified by the saved graph; a task template is a starting graph, not an image-based method search.',observedValues:{planId:plan.id,planRevision:plan.revision,inputReferences:clone(node.inputs)},evidenceRefs:[],comparison:unsearched('alternative operator families')},parameterChoices:choices,gates:[],evidenceRefs:trace.artifacts.map(entry=>entry.id),boundaries};
  if(!executed){boundaries.push(boundary('NODE_NOT_EXECUTED',trace.error?.message||'The node did not execute.'));return decision;}
  if(node.op==='image.grayscale') {
    const conversion=artifact('grayscale-conversion')?.data||{};
    if(conversion.executionMode==='pass-through')Object.assign(decision.toolChoice,{status:'bypassed',selectionMethod:'input-already-intensity',reason:'Input already supplies intensity values. Color-to-gray conversion was skipped; this node only normalizes representation and is not an algorithm selection.',observedValues:{...decision.toolChoice.observedValues,inputInspection:clone(conversion.inputInspection||conversion.normalizedInspection)},evidenceRefs:refs('grayscale-conversion','grayscale-histogram')});
    const upstream=conversion.upstreamGrayProvenance,knownUpstream=conversion.upstreamConversionKnown===true,upstreamApplied=knownUpstream&&upstream.applied!==false,weights=conversion.applied?conversion.coefficients:upstreamApplied?upstream.coefficients??null:null;
    const unchanged=conversion.executionMode==='pass-through';
    add('luminanceWeights',weights,{source:'operator-default',setBy:'operator-default',status:unchanged?'not-needed':'applied',method:unchanged?'existing-intensity-pass-through':knownUpstream?'documented-upstream-luminance-formula':'fixed-luminance-formula',reason:conversion.applied?'The fixed RGB luminance formula was applied during pipeline input normalization.':upstreamApplied?'Provided gray has saved decoder provenance: its documented RGB formula produced upstream gray, and runtime only quantizes it to gray8.':knownUpstream?'Decoder inspected equal R/G/B channels and copied existing intensities; no RGB weights were applied.':'Provided gray was quantized; the RGB formula was not reapplied and its upstream coefficients are unknown.',derivation:{source:'operator-default',formula:knownUpstream?upstream.formula:conversion.formula,constants:weights,applied:conversion.applied===true,appliedUpstream:upstreamApplied,upstreamSource:upstream?.source??null,referenceFormulaOnly:!conversion.applied&&!knownUpstream},evidenceRefs:refs('grayscale-conversion','grayscale-image','grayscale-histogram'),observedValues:{inputRepresentation:conversion.representation,originalStorageType:conversion.originalStorageType,conversionApplied:conversion.applied===true,conversionStage:conversion.conversionStage,upstreamConversionKnown:knownUpstream,upstreamProvenance:clone(upstream??null),inputInspection:clone(conversion.inputInspection||conversion.normalizedInspection),intensityStatistics:clone(trace.outputSummary.intensityStatistics||{})},comparison:unsearched('alternative color spaces and luminance weights')});
    add('grayQuantization','uint8-round-clamp',{source:'operator-default',method:'fixed-quantization',reason:conversion.quantization,evidenceRefs:refs('grayscale-conversion','grayscale-histogram'),observedValues:{width:trace.outputSummary.width,height:trace.outputSummary.height,fullResolution:true}});
    boundaries.push(boundary('COLOR_INFORMATION_LIMIT',`Color discrimination, calibrated reflectance, gamma/ICC correction and illumination normalization are not established. ${knownUpstream?'The supplied decoder formula is preserved; its color channels are unavailable to later operators.':'For supplied gray without provenance the upstream conversion is unknown.'}`,refs('grayscale-conversion')));
  } else if(node.op==='segment.otsu') {
    const histogram=artifact('otsu-histogram'),search=histogram||{},polarity=artifact('otsu-polarity')?.data,selected=search.selectedThreshold;
    const threshold=get('threshold')||add('threshold',selected);
    Object.assign(threshold,{value:selected??null,source:sourceFor('threshold').explicit?sourceFor('threshold').source:'data-derived',setBy:sourceFor('threshold').explicit?sourceFor('threshold').source:'operator-default',rawSource:sourceFor('threshold').explicit?sourceFor('threshold').raw:'computed_from_pixels',method:search.selectionMethod||'otsu-variance-maximum',reason:sourceFor('threshold').explicit?'The explicit threshold is used. The 256-threshold variance sweep is diagnostic and did not replace the prescribed value.':search.optimalThresholds?.length?'All 256 gray8 thresholds were evaluated. The first (lowest) exact maximum of the Otsu score was selected, including when the maximum spans a plateau.':'All 256 thresholds were inspected, but no valid two-class partition exists; no optimum threshold was selected.',evidenceRefs:refs('otsu-threshold-variance','otsu-histogram'),observedValues:{selectedThreshold:selected??null,selectedInOptimalSet:search.selectedInOptimalSet??false,maximumBetweenClassVariance:search.maximumBetweenClassVariance??null,optimalThresholds:search.optimalThresholds||[],optimalPlateaus:search.optimalPlateaus||[],tieBreak:search.tieBreak||null,validThresholdCount:search.thresholdScores?.filter(score=>score.valid).length??0},derivation:{source:sourceFor('threshold').explicit?'plan':'data-derived',formula:search.criterion||'w0 * w1 * (mean0 - mean1)^2',constants:{thresholdMinimum:0,thresholdMaximum:255},description:'Between-class variance on this raster, not measured segmentation accuracy.'},comparison:{performed:!!histogram,status:histogram?'evaluated':'not-compared',scope:'all 256 gray8 thresholds for the Otsu criterion',candidateCount:search.thresholdScores?.length||0,optimizationPerformed:!sourceFor('threshold').explicit&&!!search.optimalThresholds?.length,selectionApplied:!sourceFor('threshold').explicit&&applied,claim:'Criterion maximum only; no segmentation correctness or alternative-method superiority was evaluated.'}});
    if(search.selectionMethod==='binary-input-pass-through'){
      Object.assign(decision.toolChoice,{status:'bypassed',selectionMethod:'binary-input-pass-through',reason:'Only intensity labels 0 and 255 occur in this input; threshold search was skipped.',observedValues:{...decision.toolChoice.observedValues,inputLevels:[0,255],equivalentSeparators:search.equivalentSeparators},evidenceRefs:refs('otsu-histogram','segmented-mask')});
      Object.assign(threshold,{method:'binary-input-pass-through',source:'operator-default',reason:'127 is only a separator of existing 0/255 labels. Every integer separator 0–254 produces the same mask; no Otsu optimization ran.',derivation:{source:'operator-default',formula:'existing intensity 255 → bright label; existing intensity 0 → dark label',constants:{separator:127,equivalentMinimum:0,equivalentMaximum:254}},observedValues:{inputLevels:[0,255],searchSkipped:true},comparison:{performed:false,status:'not-needed',scope:'already binary input',candidateCount:0,optimizationPerformed:false,selectionApplied:false,claim:'No threshold choice was needed; original binary labels were retained.'}});
    }
    const polarityChoice=get('polarity')||add('polarity',node.params?.polarity??'auto');
    Object.assign(polarityChoice,{effectiveValue:trace.outputSummary.polarity??null,method:polarityChoice.value==='auto'?'border-occupancy-heuristic':'prescribed-polarity',reason:polarityChoice.value==='auto'?'Auto polarity uses only the observed border dark fraction under this threshold, with fixed 0.5 decision and 0.05 ambiguity thresholds. It does not compare segmentation quality under both polarities.':'The plan supplies foreground polarity; border occupancy is recorded as diagnostic evidence.',evidenceRefs:refs('otsu-polarity','otsu-histogram'),observedValues:clone(polarity||{}),derivation:{source:polarityChoice.value==='auto'?'data-derived':'plan',formula:polarity?.rule||null,constants:{darkFractionDecision:.5,ambiguityHalfWidth:.05},policySource:'operator-default'},comparison:unsearched('alternative polarity segmentation quality')});
    if(search.selectionMethod!=='binary-input-pass-through')boundaries.push(boundary('OTSU_OBJECTIVE_LIMIT','An Otsu variance maximum, even a unique maximum, is not evidence of segmentation correctness. Illumination variation, similar foreground/background brightness and threshold plateaus remain limitations.',refs('otsu-threshold-variance','otsu-histogram')));
    boundaries.push(boundary('POLARITY_BORDER_ASSUMPTION','Auto polarity assumes the image border is mostly background; this premise and its fixed ambiguity band were not optimized on the image.',refs('otsu-polarity')));
  } else if(node.op==='regions.components') {
    const data=artifact('component-candidates')?.data||{},candidates=data.candidates||[],eligible=candidates.filter(candidate=>candidate.eligible);
    for(const name of ['minArea','excludeBoundary'])if(get(name))Object.assign(get(name),{evidenceRefs:refs('component-candidates','selected-region'),observedValues:{candidateCount:data.candidateCount??0,eligibleCount:data.eligibleCount??0,rejectedForThisConstraint:candidates.filter(candidate=>candidate.rejectionReasons?.includes(name==='minArea'?'AREA_BELOW_MINIMUM':'TOUCHES_IMAGE_BOUNDARY')).length},reason:name==='minArea'?'The fixed default is 12 px² unless explicitly supplied. Actual candidate areas were tested against this cutoff; alternative minimum areas were not tuned or compared.':'The configured border exclusion is applied to each candidate. Boundary contact is an observed raster fact; it is not a learned background classifier.',comparison:unsearched(name==='minArea'?'alternative minimum-area cutoffs':'alternative border exclusion policies')});
    const selection=get('selection');if(selection)Object.assign(selection,{method:`foreground-selection-${selection.value}`,reason:selection.value==='largest'?'The explicitly selected policy chooses the eligible component with greatest measured area, using the first raster label for equal areas. This is not a comparison of downstream measurement accuracy.':selection.value==='component'?'The plan selects an explicit eligible component ID; this is a supplied choice, not an automatic optimum.':'The default policy accepts only one eligible candidate; multiple candidates remain ambiguous and no largest-component fallback is applied.',evidenceRefs:refs('component-candidates','region-contours'),observedValues:{...clone(data.selectionEvidence||{}),eligibleCandidateIds:eligible.map(candidate=>candidate.id)},comparison:{performed:true,status:'evaluated',scope:'enumerated foreground candidate eligibility and configured selection policy',candidateCount:candidates.length,optimizationPerformed:false,selectionApplied:applied,claim:'Object eligibility and selection only; no parameter tuning or downstream accuracy ranking.'}});
    if(get('componentId'))Object.assign(get('componentId'),{evidenceRefs:refs('component-candidates'),observedValues:{selectedComponentId:data.selectionEvidence?.selectedComponentId??null}});
    boundaries.push(boundary('COMPONENT_DEFAULTS_UNTUNED','Minimum area and border exclusion are explicit engineering policies. They were not tuned against labels or searched for an optimal cutoff.',refs('component-candidates')));
    boundaries.push(boundary('RASTER_CONNECTIVITY','Foreground uses 8-neighbor connectivity and background 4-neighbor connectivity at full resolution. A threshold-created connection may alter hole topology.',refs('selected-region','region-contours')));
  } else if(analysis) {
    const evidenceRefs=refs('feature-evidence','feature-curves','feature-contours');
    for(const choice of choices){choice.evidenceRefs=evidenceRefs;choice.observedValues={featureStatus:analysis.status,featureReason:analysis.reason};if(choice.source==='operator-default')choice.reason+=' This fit/model gate is an engineering default, not a tolerance optimized on this image.';}
    if(node.op==='shape.gear') {
      const comparisons=featureEvidence.parameterComparisons||[],baseCurve=artifact('feature-curves'),counts=comparisons.map(candidate=>candidate.count);
      for(const choice of choices){
        if(GEAR_FORMULAS[choice.name]&&!sourceFor(choice.name).explicit)choice.derivation={...choice.derivation,...clone(GEAR_FORMULAS[choice.name]),policySource:'operator-default'};
        const axis=featureEvidence.parameterSweep?.axes?.find(axis=>axis.parameterName===choice.name);
        if(axis)choice.singleAxisSensitivity={performed:true,centerFixed:true,otherParametersFixed:clone(axis.fixedParameters),baseValue:featureEvidence.parameterSweep.baseline[choice.name],evidenceRef:`${node.id}:feature-evidence`,evidencePath:`parameterSweep.axes[${featureEvidence.parameterSweep.axes.indexOf(axis)}]`,candidateCount:axis.candidates.length,optimizationPerformed:false,selectionApplied:false,candidates:axis.candidates.map(candidate=>({value:candidate.value,count:candidate.count,status:candidate.status,failedGates:candidate.gates.filter(g=>!g.passed).map(g=>g.id)})),claim:'Executed single-axis diagnostic interventions at the adopted center. These evaluated values do not establish untested ranges, full-pipeline acceptance, a best parameter, or manufacturing accuracy.'};
        if(['smoothingWindow','minProminence','minPeakDistance','tipCapDropPx'].includes(choice.name))Object.assign(choice.observedValues,{sampleCount:analysis.parameters?.sampleCount?.value??null,dominantFrequency:featureEvidence.periodicity?.dominantFrequency??null,measuredPitchBins:featureEvidence.periodicity?.dominantFrequency?analysis.parameters.sampleCount.value/featureEvidence.periodicity.dominantFrequency:null,radialRangeP95MinusP05:featureEvidence.periodicity?.radialRangePx??null});
        if(['smoothingWindow','minProminence','minPeakDistance'].includes(choice.name))choice.comparison={performed:comparisons.length>0,status:comparisons.length?'evaluated':'not-compared',scope:'the actually executed local smoothing/prominence/peak-distance neighborhood on this raster',candidateCount:comparisons.length,optimizationPerformed:false,selectionApplied:false,baseCandidateIndex:comparisons.length?0:null,baseCurveRef:baseCurve?.id??null,candidateCurveAvailable:comparisons.length>0&&comparisons.every(candidate=>Array.isArray(candidate.curve)&&candidate.curve.length>0),candidates:comparisons.map((candidate,index)=>({index,baseline:candidate.baseline??index===0,smoothingWindow:candidate.smoothingWindow,minProminencePx:candidate.minProminencePx,minPeakDistanceBins:candidate.minPeakDistanceBins,count:candidate.count,peakIndices:clone(candidate.peakIndices||[]),evidenceRef:`${node.id}:feature-evidence`,evidencePath:`parameterComparisons[${index}]`,curveAvailable:Array.isArray(candidate.curve)&&candidate.curve.length>0,curvePath:Array.isArray(candidate.curve)&&candidate.curve.length?`parameterComparisons[${index}].curve`:null})),observedCountSpread:counts.length?Math.max(...counts)-Math.min(...counts):null,claim:'The base uses supplied values or fixed engineering formulas. Alternatives test local agreement; the base was not selected as best by this comparison, and no global optimum or industrial accuracy was established.'};
      }
      const center=get('workpieceCenter');if(center&&featureEvidence.centerEstimation){const estimate=featureEvidence.centerEstimation;center.derivation={...center.derivation,formula:'Independent outer-boundary circle fit; observed tooth-cap circle may refine center only after fixed fit-quality, support and shift gates.',policySource:'operator-default',constants:{maximumRefinementIterations:2,rmsAllowancePxFloor:1,rmsAllowanceRadialRangeFraction:.15,maxAbsResidualAllowanceMultiplier:3,minimumCoverageDeg:240,maximumShiftRadiusFraction:.1,earlyStopShiftPx:.01}};center.observedValues={selectedCenter:clone(analysis.measurements?.workpieceCenter),initialCenter:clone(estimate.initialOuterBoundaryCenter),selectedMethod:estimate.selectedMethod,candidates:(estimate.candidates||[]).map(({supportPoints,circle,...candidate},index)=>({...clone(candidate),circleEvidencePath:`centerEstimation.candidates[${index}].circle`}))};center.comparison={performed:estimate.candidates?.length>0,status:estimate.candidates?.length?'evaluated':'not-compared',scope:'outer boundary center and observed tooth-cap center quality gates',candidateCount:estimate.candidates?.length||0,optimizationPerformed:false,selectionApplied:estimate.selectedMethod==='observed_tip_cap_circle_fit',claim:'Observed support and fixed fit-quality gates select the center. Bore center and nominal tooth count do not select it.'};}
      boundaries.push(boundary('GEAR_BASE_NOT_OPTIMIZED','Computed sampling and peak parameters use measured inputs with fixed engineering coefficients. A five-point agreement check is local evidence, not parameter optimization or a stability guarantee.',refs('feature-evidence','feature-curves')));
      boundaries.push(boundary('GEAR_MODEL_SCOPE','Tooth count requires sufficient radial support, interpretable pitch and the stated root/depth/fit gates. Expected count is a supplied specification and never a measured observation.',refs('feature-evidence')));
    } else if(node.op==='geometry.annulus') {
      for(const choice of choices)choice.observedValues={featureStatus:analysis.status,outerQuality:clone(featureEvidence.outerQuality),innerQuality:clone(featureEvidence.innerQuality),outerRmsResidual:analysis.measurements?.outerCircle?.rmsResidual??null,innerRmsResidual:analysis.measurements?.innerCircle?.rmsResidual??null,outerAngularCoverageDeg:analysis.measurements?.outerCircle?.angularCoverageDeg??null,innerAngularCoverageDeg:analysis.measurements?.innerCircle?.angularCoverageDeg??null};
      boundaries.push(boundary('ANNULUS_GATES_NOT_OPTIMIZED','Observed boundaries support geometric circle fitting, but residual and angular-coverage gates are fixed engineering assumptions. Their values were not searched or verified as manufacturing tolerances.',refs('feature-evidence','feature-circles')));
    } else if(node.op==='topology.holes') {
      for(const choice of choices)choice.observedValues={featureStatus:analysis.status,closedHoleCount:analysis.measurements?.closedHoleCount??null,ignoredHoleCount:featureEvidence.ignoredHoles?.length??0,observedHoleAreas:(featureEvidence.holes||[]).map(hole=>({id:hole.id,area:hole.area})),ignoredHoleAreas:clone(featureEvidence.ignoredHoles||[]),expectedPositionComparisons:clone(featureEvidence.expectedPositionComparisons||[])};
      boundaries.push(boundary('HOLE_SPECIFICATION_SCOPE','Enclosed holes are observations. Missing/open-hole claims require supplied expected positions and optional radius; no registration or nominal hole layout is inferred.',refs('feature-evidence')));
      boundaries.push(boundary('HOLE_THRESHOLDS_NOT_OPTIMIZED','The area cutoff and position tolerance are supplied values or fixed defaults. They were not searched for optimum performance.',refs('feature-evidence')));
    }
    for(const [index,message] of (analysis.limitations||[]).entries())boundaries.push(boundary(`FEATURE_LIMITATION_${index+1}`,String(message),refs('feature-evidence')));
  } else if(node.op==='rules.evaluate') {
    const evaluation=execution?.outputs?.evaluation||{},rules=node.params?.rules||[],evaluated=evaluation.rules||[],upstream=execution?.ruleBasis;
    if(get('rules'))Object.assign(get('rules'),{reason:rules.length?'The rule list is explicitly supplied by the saved plan; runtime does not infer product tolerances.':'No acceptance rule or tolerance was supplied; measurements are retained and acceptance remains UNKNOWN/SPEC_MISSING.',evidenceRefs:refs('rule-evaluation'),observedValues:{ruleCount:rules.length,status:evaluation.status,reason:evaluation.reason},comparison:unsearched('alternative acceptance specifications')});
    for(const [index,rule] of rules.entries())for(const name of ['min','max','equals','unit'])if(rule[name]!==undefined){const actual=evaluated[index];add(`rules[${index}].${name}`,rule[name],{method:'supplied-acceptance-rule',reason:'This bound or target is specified in the plan. It is not derived from image pixels, a generic method default or a runtime tolerance search.',evidenceRefs:refs('rule-evaluation'),observedValues:{measurement:rule.measurement,actual:actual?.actual??null,status:actual?.status??'UNKNOWN',reason:actual?.reason??null,featureStatus:upstream?.featureStatus??null,overallStatus:evaluation.status,overallReason:evaluation.reason},comparison:{performed:actual?.actual!==undefined&&['PASS','FAIL'].includes(actual.status),status:actual?.actual!==undefined&&['PASS','FAIL'].includes(actual.status)?'evaluated':'not-compared',scope:'observed measurement versus this supplied acceptance specification',optimizationPerformed:false,selectionApplied:false,claim:'Evaluating a supplied bound is not choosing or optimizing that bound.'}});}
    for(const [index,rule] of rules.entries())if(rule.min===undefined&&rule.max===undefined&&rule.equals===undefined)add(`rules[${index}].specification`,null,{status:'not-supplied',method:'no-acceptance-bound',reason:'A measurement name alone supplies no acceptance bound or target; this rule remains UNKNOWN/SPEC_MISSING.',evidenceRefs:refs('rule-evaluation'),observedValues:{measurement:rule.measurement,status:evaluated[index]?.status??'UNKNOWN',reason:evaluated[index]?.reason??'SPEC_MISSING'},comparison:unsearched('no acceptance bound supplied')});
    boundaries.push(boundary('SPECIFICATIONS_ARE_INPUTS','Acceptance limits and expected counts/positions must come from an explicit specification. Missing rules remain UNKNOWN/SPEC_MISSING; an uncertain feature cannot establish a reliable pass/fail.',refs('rule-evaluation')));
    if(!rules.length||rules.some(rule=>rule.min===undefined&&rule.max===undefined&&rule.equals===undefined))boundaries.push(boundary('SPEC_MISSING','No acceptance tolerance or target was supplied for at least one measurement.',refs('rule-evaluation')));
    if(choices.some(choice=>choice.source==='agent'))boundaries.push(boundary('AGENT_RULE_PROPOSAL','Agent-supplied rule values are recorded as agent proposals; executing them does not confirm that a human supplied or accepted the specification.',refs('rule-evaluation')));
    if(!context.scale.valid)boundaries.push(boundary('UNCALIBRATED',`Physical unit conversion unavailable: ${context.scale.reason}. Pixel measurements are retained.`,refs('rule-evaluation')));
  }
  if(analysis)decision.gates=featureDecisionGates(node,analysis,execution,choices,refs('feature-evidence'));
  if(trace.status==='FAILED')boundaries.push(boundary(trace.error.code,trace.error.message,trace.artifacts.map(entry=>entry.id)));
  return decision;
}

export async function runPipeline(image,plan,{inputIdentity,scale}={}) {
  const snapshot=clone(plan),validation=validatePipeline(snapshot);
  if(!validation.valid){const error=new PipelineExecutionError('PIPELINE_INVALID','算子圖驗證失敗',{errors:validation.errors});error.validation=validation;throw error;}
  const source=imagePixels(image),pixelFingerprint=`${source.width}x${source.height}:${fingerprintBytes(source.gray)}`,header=new TextEncoder().encode(`${source.width}x${source.height}:gray8:`),imageBytes=new Uint8Array(header.length+source.gray.length);imageBytes.set(header);imageBytes.set(source.gray,header.length);
  const [imageSha,planHash]=await Promise.all([sha256(imageBytes),sha256(new TextEncoder().encode(stable(snapshot)))]);
  const context={scale:normalizeScale(clone(scale))},result={schema:PIPELINE_RESULT_SCHEMA,pipelineId:snapshot.id,pipelineRevision:snapshot.revision,planHash,planFingerprint:pipelineFingerprint(snapshot),runId:uuid(),startedAt:new Date().toISOString(),status:'OK',inputIdentity:clone(inputIdentity??null),image:{width:source.width,height:source.height,sha256:imageSha,sourceSha256:image.sha256??null,pixelFingerprint},calibration:context.scale,nodes:[],measurements:{},classification:{status:'UNKNOWN',reason:'SPEC_MISSING',rules:[]},artifacts:[],limitations:[],validationWarnings:validation.warnings},outputs=new Map(),byId=new Map(snapshot.nodes.map(node=>[node.id,node]));
  for(const id of validation.order) {
    const node=byId.get(id),definition=OPERATOR_REGISTRY[node.op],params={},parameterSources={};
    for(const [key,schema] of Object.entries(definition.params))if(schema.default!==undefined){params[key]=clone(schema.default);parameterSources[key]='operator-default';}
    for(const [key,value] of Object.entries(node.params||{})){params[key]=clone(value);parameterSources[key]=node.parameterSources?.[key]||'plan';}
    const trace={id:node.id,op:node.op,version:node.version,inputs:clone(node.inputs),status:'OK',durationMs:0,parameters:clone(params),parameterSources,parameterDerivations:{},justification:clone(node.justification),artifacts:[],outputSummary:{}};
    const inputs={};let missing;
    for(const [key,value] of Object.entries(node.inputs)){const ref=referenceOf(value);if(ref.source)inputs[key]=source;else{const producer=outputs.get(ref.node);if(!producer||!(ref.output in producer)){missing=ref.node;break;}inputs[key]=producer[ref.output];}}
    if(missing){trace.status='SKIPPED';trace.error={code:'UPSTREAM_FAILED',message:`上游節點 ${missing} 沒有產生所需輸出`};trace.decision=nodeDecision(trace,node,snapshot,context);result.nodes.push(trace);continue;}
    const began=now();let execution;
    try {
      execution=await executors[node.op](inputs,params,context);
      if(execution.outputs.analysis?.evidence?.parameterSweep){
        const binding={runId:result.runId,pipelineId:snapshot.id,pipelineRevision:snapshot.revision,nodeId:node.id,imageSha256:imageSha,sourceSha256:image.sha256??null,inputIdentity:clone(inputIdentity??null),regionReference:clone(node.inputs.region)};
        execution.outputs.analysis.evidence.parameterSweep.binding=binding;
        const savedEvidence=execution.artifacts.find(artifact=>artifact.id==='feature-evidence');if(savedEvidence?.data?.parameterSweep)savedEvidence.data.parameterSweep.binding=clone(binding);
      }
      outputs.set(node.id,execution.outputs);trace.outputSummary=clone(execution.summary||{});trace.artifacts=clone(execution.artifacts||[]).map((artifact,index)=>({...artifact,id:`${node.id}:${artifact.id||index}`,nodeId:node.id}));
      const analysis=execution.outputs.analysis;
      if(analysis){Object.assign(result.measurements,clone(analysis.measurements||{}));for(const [key,record] of Object.entries(analysis.parameters||{})){trace.parameters[key]=clone(record.value);trace.parameterSources[key]=Object.hasOwn(node.params||{},key)?node.parameterSources?.[key]||snapshot.provenance?.source||'plan':record.source;trace.parameterDerivations[key]={source:record.source,description:record.description};}result.limitations.push(...(clone(analysis.limitations)||[]));if(!['OK','SUCCESS','VALID','MEASURED'].includes(String(analysis.status).toUpperCase())){trace.featureStatus=analysis.status;result.status='PARTIAL';}}
      if(execution.outputs.evaluation)result.classification=clone(execution.outputs.evaluation);
    }catch(error){trace.status='FAILED';trace.error={code:error.code||'OPERATOR_FAILED',message:error.message,details:clone(error.details||{})};trace.artifacts=clone(error.artifacts||[]).map((artifact,index)=>({...artifact,id:`${node.id}:${artifact.id||index}`,nodeId:node.id}));result.limitations.push({nodeId:node.id,code:trace.error.code,message:trace.error.message});}
    trace.durationMs=Math.max(0,now()-began);trace.decision=nodeDecision(trace,node,snapshot,context,execution);result.nodes.push(trace);result.artifacts.push(...trace.artifacts);
  }
  if(result.nodes.some(node=>node.status==='FAILED')){result.status=Object.keys(result.measurements).length?'PARTIAL':'FAILED';if(result.classification.reason==='SPEC_MISSING')result.classification={status:'UNKNOWN',reason:'PIPELINE_FAILED',rules:[]};}
  if(!context.scale.valid)result.limitations.push({code:'UNCALIBRATED',reason:context.scale.reason,message:'缺少有效且可追溯的毫米標定；尺寸僅保留像素單位。'});
  result.completedAt=new Date().toISOString();result.durationMs=result.nodes.reduce((sum,node)=>sum+node.durationMs,0);
  // Bind only artifacts and decisions actually produced above. Author promises stay
  // on the plan and never become observed evidence by being copied into a trace.
  result.evidenceBinding=pipelineEvidenceBinding(result);
  for(const trace of result.nodes){
    const binding={...result.evidenceBinding,nodeId:trace.id};trace.evidenceBinding=binding;
    for(const artifact of trace.artifacts){artifact.binding={...binding};artifact.contentFingerprint=pipelineArtifactFingerprint(artifact);}
    trace.decision.binding={...binding};trace.executionFingerprint=pipelineTraceFingerprint(trace);trace.decisionFingerprint=pipelineEvidenceFingerprint(trace.decision);
  }
  result.deliveryAudit=auditPipelineEvidenceDelivery(snapshot,result);
  for(const trace of result.nodes)trace.deliveryAudit=clone(result.deliveryAudit.nodes.find(node=>node.nodeId===trace.id));
  return result;
}
