// Preserve the editable historical source while giving known operators a
// typed Rust execution plan.  The migration is intentionally narrow: it only
// recognizes the existing two-boundary node by its saved title/parameter
// contract and never guesses a plan for arbitrary Python.
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));

export function twoBoundaryNativePlan(parameters={}){
 const search=parameters.search||{},lid=parameters.lidPrior||{},pkg=parameters.pkgPrior||{},quality=parameters.quality||{},decision=parameters.decision||{};
 const features={
  seedLevel:Number.isFinite(search.seedLevel)?search.seedLevel:65,
  externalLevel:Number.isFinite(quality.externalLevel)?quality.externalLevel:80,
  widthPrior:Number.isFinite(lid.width)?lid.width:683,
  heightPrior:Number.isFinite(lid.height)?lid.height:529,
  pkgWidth:Number.isFinite(pkg.width)?pkg.width:708,
  pkgHeight:Number.isFinite(pkg.height)?pkg.height:550,
  widthTolerance:Number.isFinite(lid.widthTolerance)?lid.widthTolerance:10,
  heightTolerance:Number.isFinite(lid.heightTolerance)?lid.heightTolerance:12,
  minSeparationPx:Number.isFinite(quality.minIndependentSeparationPx)?quality.minIndependentSeparationPx:4,
  pixelTolerancePx:Number.isFinite(decision.pixelTolerancePx)?decision.pixelTolerancePx:4,
  cornerRadius:Number.isFinite(quality.cornerRadius)?quality.cornerRadius:65,
  scoreDeltas:Array.isArray(decision.deltaTrials)?clone(decision.deltaTrials):[0.5,1,2,3],
  toleranceTrialsPx:Array.isArray(decision.toleranceTrialsPx)?clone(decision.toleranceTrialsPx):[0,3,4,5]
 };
 const supplied=new Set([
  ...Object.keys(search).filter(key=>Number.isFinite(search[key])).map(key=>key),
  ...Object.keys(lid).filter(key=>Number.isFinite(lid[key])).map(key=>key==='width'?'widthPrior':key==='height'?'heightPrior':key==='widthTolerance'?'widthTolerance':key==='heightTolerance'?'heightTolerance':key),
  ...Object.keys(pkg).filter(key=>Number.isFinite(pkg[key])).map(key=>key==='width'?'pkgWidth':key==='height'?'pkgHeight':key),
  ...Object.keys(quality).filter(key=>Number.isFinite(quality[key])).map(key=>key==='minIndependentSeparationPx'?'minSeparationPx':key==='externalLevel'?'externalLevel':key==='cornerRadius'?'cornerRadius':key),
  ...Object.keys(decision).filter(key=>Array.isArray(decision[key])||Number.isFinite(decision[key])).map(key=>key==='deltaTrials'?'scoreDeltas':key)
 ]);
 return {schema:'agentcv-native-plan-1',backend:'rust-native',operator:'geometry.two_boundary',migration:'two-boundary-python-to-rust-v1',plan:{schema:'agentcv-pipeline-1',id:'two-boundary-rust-native',revision:1,task:'two_boundary',nodes:[
  {id:'features',op:'geometry.two_boundary',version:1,inputs:{image:'$image'},params:features,parameterSources:Object.fromEntries(Object.keys(features).map(key=>[key,supplied.has(key)?'agent-proposal':'native-default']))},
  {id:'rules',op:'rules.evaluate',version:1,inputs:{analysis:'features.analysis'},params:{rules:[]},parameterSources:{rules:'not-supplied'}}
 ]}};
}

export function migrateNativePlans(data){
 const nodes=data?.purposeScheme?.operatorGraph?.nodes;if(!Array.isArray(nodes))return {changed:false,count:0};
 let count=0;
 for(const node of nodes){
  if(node?.nativePlan||node?.executionBackend==='rust-native')continue;
  if(node?.title!=='兩層邊界'||typeof node.code!=='string'||!node.code.includes('SIDES')||!node.code.includes('pose_from_edges'))continue;
  node.nativePlan=twoBoundaryNativePlan(node.parameters||{});node.executionBackend='rust-native';node.executionNote='保留原 Python 來源供回復；本節點實際執行使用 Rust typed pipeline。';count++;
 }
 return {changed:count>0,count};
}
