export const PIPELINE_SCHEMA = 'agentcv-pipeline-1';
export const PIPELINE_RESULT_SCHEMA = 'agentcv-pipeline-result-1';

const number = (minimum, maximum, defaultValue) => ({type:'number',minimum,maximum,...(defaultValue === undefined ? {} : {default:defaultValue})});
const integer = (minimum, maximum, defaultValue) => ({...number(minimum,maximum,defaultValue),type:'integer'});
const enumeration = (values, defaultValue) => ({type:'string',enum:values,default:defaultValue});
const definitions = [
  {op:'image.grayscale',title:'灰階影像',inputs:{image:'image'},outputs:{image:'image'},params:{},description:'使用原圖完整解析度灰階像素；彩色來源依 Rec.601 亮度轉換。'},
  {op:'segment.otsu',title:'Otsu 分割',inputs:{image:'image'},outputs:{binary:'binary'},params:{polarity:enumeration(['auto','dark','bright'],'auto'),threshold:integer(0,255)},description:'完整解析度全域 Otsu。auto 以邊界背景估計前景極性；同亮度或邊界歧義會明示。'},
  {op:'regions.components',title:'連通物件與孔洞',inputs:{binary:'binary'},outputs:{region:'region'},params:{selection:enumeration(['unique','largest','component'],'unique'),componentId:integer(1,16000000),minArea:integer(1,16000000,12),excludeBoundary:{type:'boolean',default:true}},description:'8 連通前景、4 連通背景；保留凹陷、內孔和原始座標。預設要求唯一候選，多物件需顯式選擇。'},
  {op:'shape.gear',title:'齒輪輪廓',inputs:{region:'region'},outputs:{analysis:'analysis'},params:{expectedTeeth:integer(3,1000),sampleCount:integer(120,4096),smoothingWindow:integer(3,683),minProminence:{...number(0,1000000),exclusiveMinimum:0},minPeakDistance:{...number(0,1366),exclusiveMinimum:0}},description:'從實際輪廓估計齒峰與穩定性；期望齒數僅來自明確提供的規格。'},
  {op:'geometry.annulus',title:'圓環幾何',inputs:{region:'region'},outputs:{analysis:'analysis'},params:{maxRelativeResidual:{...number(0,.5),exclusiveMinimum:0,exclusiveMaximum:.5},maxResidualPx:{...number(0,100000),exclusiveMinimum:0},minAngularCoverageDeg:{...number(0,360),exclusiveMinimum:0}},description:'擬合實際外緣及內孔，回報殘差與覆蓋度，不把任意封閉輪廓當圓。'},
  {op:'geometry.two_boundary',title:'兩層邊界幾何',inputs:{image:'image'},outputs:{analysis:'analysis'},params:{seedLevel:integer(0,255,65),externalLevel:number(0,255,80),widthPrior:number(1,100000),heightPrior:number(1,100000),pkgWidth:number(1,100000),pkgHeight:number(1,100000),widthTolerance:number(0,100000,10),heightTolerance:number(0,100000,12),minSeparationPx:number(0,100000,4),pixelTolerancePx:number(0,100000,4),cornerRadius:number(0,100000,65),scoreDeltas:{type:'array',items:number(-100000,100000)},toleranceTrialsPx:{type:'array',items:number(0,100000)}},description:'Rust gray8 搜尋、四側候選、外露邊、尺寸先驗、姿態與 clearance；目前是兩層邊界移植中的 typed pipeline 核心。'},
  {op:'topology.holes',title:'孔洞拓樸與位置',inputs:{region:'region'},outputs:{analysis:'analysis'},params:{expectedPositions:{type:'array',items:{type:'object',required:['x','y'],properties:{id:{type:'string'},x:number(-1000000,1000000),y:number(-1000000,1000000),radius:{...number(0,1000000),exclusiveMinimum:0}},additionalProperties:false}},positionTolerancePx:{...number(0,1000000),exclusiveMinimum:0},minHoleArea:number(0,16000000)},description:'計算封閉背景孔；有明確位置規格時才推論缺孔或外連孔。'},
  {op:'rules.evaluate',title:'規則判定',inputs:{analysis:'analysis'},outputs:{evaluation:'evaluation'},params:{rules:{type:'array',default:[],items:{type:'object',required:['measurement'],properties:{id:{type:'string'},measurement:{type:'string'},min:{type:'number'},max:{type:'number'},equals:{type:['number','string','boolean']},unit:{type:'string'}},additionalProperties:false}}},description:'量測先保留，缺規格為 UNKNOWN/SPEC_MISSING；缺有效標定時不產生毫米。'},
];

const artifactCatalog={
  'image.grayscale':[['grayscale-image','image'],['grayscale-conversion','evidence'],['grayscale-histogram','histogram']],
  'segment.otsu':[['otsu-histogram','histogram'],['otsu-threshold-variance','curves'],['otsu-polarity','evidence'],['segmented-mask','mask']],
  'regions.components':[['component-candidates','evidence'],['selected-region','mask'],['region-contours','contours']],
  'shape.gear':[['feature-evidence','evidence'],['feature-curves','curves'],['feature-contours','contours'],['feature-points','points'],['feature-circles','circles']],
  'geometry.annulus':[['feature-evidence','evidence'],['feature-circles','circles'],['feature-contours','contours']],
  'geometry.two_boundary':[['feature-evidence','evidence'],['feature-overlay','image'],['feature-curves','curves'],['feature-contours','contours'],['feature-points','points'],['feature-circles','circles']],
  'topology.holes':[['feature-evidence','evidence'],['feature-circles','circles'],['feature-contours','contours'],['feature-points','points']],
  'rules.evaluate':[['rule-evaluation','evidence']],
};
const gateCatalog={
  'shape.gear':['gear.repetition','gear.peak_parameters','gear.complete_boundary','gear.angular_support','gear.minimum_peaks','gear.radial_range','gear.spectral_amplitude','gear.parameter_count_agreement','gear.tip_fit','gear.tip_rms','gear.tip_max_abs','gear.pitch_variation','gear.ordinary_gap_fraction','gear.root_support','gear.radial_depth_model','gear.nominal_missing_consistency',...['candidate_count','finite_fit','radius','support','coverage','rms','max_abs','adopted'].map(id=>`gear.hole_center.${id}`)],
  'geometry.annulus':['annulus.complete_boundary','annulus.one_hole',...['outer','inner'].flatMap(side=>['finite_fit','radius','support','coverage','rms','max_abs'].map(id=>`annulus.${side}.${id}`)),'annulus.inner_containment'],
  'geometry.two_boundary':['two_boundary.support','two_boundary.pkg_anchor','two_boundary.clearance','two_boundary.decision'],
  'topology.holes':['holes.complete_boundary','holes.expected_positions_resolved'],
};
const derived={ 'segment.otsu':['threshold'],'shape.gear':['sampleCount','smoothingWindow','minProminence','minPeakDistance'] };
const absent={'regions.components':['componentId'],'shape.gear':['expectedTeeth'],'topology.holes':['expectedPositions']};
export const OPERATOR_REGISTRY = Object.freeze(Object.assign(Object.create(null),Object.fromEntries(definitions.map(definition => [definition.op,Object.freeze({...definition,version:1,parameterSchema:{type:'object',properties:definition.params,additionalProperties:false},
  parameterOrigins:Object.fromEntries(Object.keys(definition.params).map(name=>[name,{whenExplicit:'agent-proposal or human-input, checked against saved provenance',whenOmitted:derived[definition.op]?.includes(name)?'data-derived':absent[definition.op]?.includes(name)?'not-supplied':'operator-default',...(definition.params[name].default!==undefined?{default:definition.params[name].default}:{}),note:derived[definition.op]?.includes(name)?'Image-derived formula with engineering constants, not an optimized accuracy claim. Binary input may bypass threshold selection.':absent[definition.op]?.includes(name)?'No nominal specification or candidate ID is inferred from pixels.':'Fixed engineering policy; absence of public default does not imply no effective value.'}])),
  evidenceArtifacts:artifactCatalog[definition.op].map(([id,type])=>({id,type,availability:'Actual outputs depend on execution; inspect this run. Feature overlays may be conditional.'})),evidenceGates:gateCatalog[definition.op]||[],
})]))));

export function getPipelineCapabilities() {
  return JSON.parse(JSON.stringify({schema:PIPELINE_SCHEMA,registryVersion:2,defaultExecutionBackend:'rust-native',inputReference:'$image or nodeId.outputName (also {node,output})',executionBackends:[{id:'rust-native',status:'available-in-desktop',operators:['image.grayscale','segment.otsu','regions.components','topology.holes','geometry.annulus','geometry.two_boundary','rules.evaluate'],note:'Rust 計算灰階、直方圖、閾值、二值遮罩、連通物件選擇、孔洞拓樸、圓環擬合、兩層邊界核心與明確規格比較；其他內建算子按 JS worker 執行。'},{id:'js-worker',status:'available',operators:Object.keys(OPERATOR_REGISTRY).filter(op=>!['image.grayscale','segment.otsu','regions.components','topology.holes','geometry.annulus','geometry.two_boundary','rules.evaluate'].includes(op)),note:'保留目前完整內建算子覆蓋。'}],operators:Object.values(OPERATOR_REGISTRY),evidenceContract:{schema:'agentcv-pipeline-evidence-audit-1',requiredForAgentSubmission:false,planningStatus:'READY_FOR_TRIAL; actualEvidence=PENDING, never delivered before a run',templateInput:'documentations keyed by node id; explicit graphs use node.documentation. Free-form Markdown, no fixed sections. Legacy justification references are optional.',sources:['agent-proposal','human-input','operator-default','data-derived','not-supplied'],selectors:[{kind:'artifact',type:'evidence'},{kind:'artifact',type:'curves',id:'feature-curves'},{kind:'gate',id:'gear.radial_range'},{kind:'execution-status',allowed:['OK']}],selectorNotes:'Artifact/gate selectors refer only to this node. Use per-operator catalog, not invented IDs. Execution-status checks execution only, not accuracy. Gates may honestly be NOT_EVALUATED/NOT_APPLICABLE. Do not claim PASS in planning.',delivery:'Actual run/artifact/decision checks and every effective parameter must pass; copied audit labels are ignored. DIAGNOSTIC_ONLY and INCOMPLETE are not delivered. Missing specifications preserve UNKNOWN.'},types:{image:'Full-resolution width, height and grayscale pixels.',binary:'Full-resolution binary mask, foreground=1.',region:'Single full-resolution selected foreground object, exterior background, actual outer contour and enclosed holes.',analysis:'Measurements, evidence, feature status and limitations.',evaluation:'PASS, FAIL or UNKNOWN, per-rule results and reasons.'},boundaries:['No inferred physical scale.','No inferred tolerance or expected topology.','Ambiguous foreground candidates require explicit selection.','Only registered operator version 1 is executable.','Global Otsu assumes separable intensity classes; failed segmentation is reported.','No file-name, image-hash or sample-specific behavior.']}));
}

export function referenceOf(value) {
  if (value === '$image') return {source:true,type:'image'};
  if (typeof value === 'string') {
    const split=value.lastIndexOf('.');
    if(split>0 && split<value.length-1) return {node:value.slice(0,split),output:value.slice(split+1)};
  }
  if(value && typeof value==='object' && !Array.isArray(value) && typeof value.node==='string' && typeof value.output==='string') return {node:value.node,output:value.output};
  return null;
}

function checkValue(value,schema,path,errors) {
  const types=Array.isArray(schema.type)?schema.type:[schema.type];
  const actual=Array.isArray(value)?'array':value===null?'null':typeof value;
  if(!types.some(type => type==='integer'?Number.isInteger(value):type===actual)) { errors.push({code:'PARAMETER_TYPE',path,message:`${path} 必須為 ${types.join('/')}`});return; }
  if(typeof value==='number' && (!Number.isFinite(value) || (schema.minimum!==undefined&&value<schema.minimum) || (schema.maximum!==undefined&&value>schema.maximum) || (schema.exclusiveMinimum!==undefined&&value<=schema.exclusiveMinimum) || (schema.exclusiveMaximum!==undefined&&value>=schema.exclusiveMaximum))) errors.push({code:'PARAMETER_RANGE',path,message:`${path} 超出有效範圍`});
  if(schema.enum&&!schema.enum.includes(value)) errors.push({code:'PARAMETER_ENUM',path,message:`${path} 不在支持選項內`});
  if(actual==='array'&&schema.items) value.forEach((entry,index)=>checkValue(entry,schema.items,`${path}[${index}]`,errors));
  if(actual==='object'&&schema.properties) {
    for(const required of schema.required||[]) if(value[required]===undefined) errors.push({code:'PARAMETER_REQUIRED',path:`${path}.${required}`,message:`缺少 ${required}`});
    for(const [key,entry] of Object.entries(value)) {
      if(!Object.hasOwn(schema.properties,key)) {if(schema.additionalProperties===false)errors.push({code:'PARAMETER_UNKNOWN',path:`${path}.${key}`,message:`不支持參數 ${key}`});}
      else checkValue(entry,schema.properties[key],`${path}.${key}`,errors);
    }
  }
}

export function validatePipeline(plan) {
  const errors=[],warnings=[],order=[];
  const fail=(code,path,message)=>errors.push({code,path,message});
  if(!plan||typeof plan!=='object'||Array.isArray(plan)) return {valid:false,ok:false,errors:[{code:'PLAN_REQUIRED',path:'',message:'需要算子圖'}],warnings,order};
  if(plan.schema!==PIPELINE_SCHEMA) fail('SCHEMA_UNSUPPORTED','schema',`需要 ${PIPELINE_SCHEMA}`);
  if(!Number.isInteger(plan.revision)||plan.revision<1) fail('REVISION_INVALID','revision','revision 必須為正整數');
  if(typeof plan.id!=='string'||!plan.id.trim()) fail('ID_REQUIRED','id','算子圖需要非空 id');
  if(!Array.isArray(plan.nodes)||!plan.nodes.length) return {valid:false,ok:false,errors:[...errors,{code:'NODES_REQUIRED',path:'nodes',message:'算子圖需要至少一個節點'}],warnings,order};
  if(plan.nodes.length>128) fail('NODE_LIMIT','nodes','最多支持 128 個節點');
  const byId=new Map();
  for(const [index,node] of plan.nodes.entries()) {
    const path=`nodes[${index}]`;
    if(!node||typeof node!=='object'||Array.isArray(node)) {fail('NODE_INVALID',path,'節點必須是物件');continue;}
    if(typeof node.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]*$/.test(node.id)) fail('NODE_ID_INVALID',`${path}.id`,'節點 id 需以英文字母開頭，僅含字母、數字、_、-');
    else if(byId.has(node.id)) fail('NODE_ID_DUPLICATE',`${path}.id`,`重複 id ${node.id}`);
    else byId.set(node.id,node);
    const definition=OPERATOR_REGISTRY[node.op];
    if(!definition) {fail('OP_UNSUPPORTED',`${path}.op`,`不支持算子 ${node.op}`);continue;}
    if(node.version!==definition.version) fail('VERSION_UNSUPPORTED',`${path}.version`,`${node.op} 僅支持版本 ${definition.version}`);
    checkValue(node.params??{},definition.parameterSchema,`${path}.params`,errors);
    if(node.op==='shape.gear'&&node.params?.smoothingWindow!==undefined&&node.params.smoothingWindow%2!==1) fail('PARAMETER_RANGE',`${path}.params.smoothingWindow`,'平滑視窗必須為奇數');
    if(node.op==='rules.evaluate'&&Array.isArray(node.params?.rules))for(const [ruleIndex,rule] of node.params.rules.entries())if(rule&&rule.min!==undefined&&rule.max!==undefined&&rule.min>rule.max)fail('RULE_RANGE',`${path}.params.rules[${ruleIndex}]`,'規格下限大於上限');
    if(node.op==='regions.components'&&node.params?.selection==='component'&&!Number.isInteger(node.params.componentId)) fail('COMPONENT_ID_REQUIRED',`${path}.params.componentId`,'指定候選需要 componentId');
    if(!node.inputs||typeof node.inputs!=='object'||Array.isArray(node.inputs)) {fail('INPUTS_REQUIRED',`${path}.inputs`,'需要明確輸入引用');continue;}
    for(const name of Object.keys(node.inputs)) if(!Object.hasOwn(definition.inputs,name))fail('INPUT_UNKNOWN',`${path}.inputs.${name}`,`算子沒有輸入 ${name}`);
    for(const name of Object.keys(definition.inputs)) if(!(name in node.inputs)) fail('INPUT_REQUIRED',`${path}.inputs.${name}`,`缺少輸入 ${name}`);
  }
  for(const [id,node] of byId) {
    const definition=OPERATOR_REGISTRY[node.op];if(!definition||!node.inputs||typeof node.inputs!=='object')continue;
    for(const [name,value] of Object.entries(node.inputs)) {
      const ref=referenceOf(value),path=`nodes.${id}.inputs.${name}`;
      if(!ref){fail('REFERENCE_INVALID',path,'輸入引用必須為 $image 或 nodeId.output');continue;}
      const producer=ref.source?null:byId.get(ref.node);
      if(!ref.source&&!producer){fail('REFERENCE_MISSING',path,`不存在節點 ${ref.node}`);continue;}
      const producerOutputs=ref.source?null:OPERATOR_REGISTRY[producer.op]?.outputs;
      const type=ref.source?'image':producerOutputs&&Object.hasOwn(producerOutputs,ref.output)?producerOutputs[ref.output]:undefined;
      if(!type){fail('OUTPUT_MISSING',path,`不存在輸出 ${ref.output}`);continue;}
      if(definition.inputs[name]&&type!==definition.inputs[name])fail('TYPE_MISMATCH',path,`${type} 無法接入 ${definition.inputs[name]}`);
    }
  }
  const colors=new Map();
  function visit(id) {
    if(colors.get(id)===2)return;
    if(colors.get(id)===1){fail('CYCLE',`nodes.${id}`,'算子圖有循環依賴');return;}
    colors.set(id,1);
    for(const value of Object.values(byId.get(id)?.inputs||{})){const ref=referenceOf(value);if(ref&&!ref.source&&byId.has(ref.node))visit(ref.node);}
    colors.set(id,2);order.push(id);
  }
  for(const id of byId.keys())visit(id);
  if(!plan.nodes.some(node=>node?.op==='rules.evaluate'))warnings.push({code:'NO_RULES_NODE',message:'此圖沒有分類節點，仍可保留量測'});
  return {valid:errors.length===0,ok:errors.length===0,errors,warnings,order};
}

export function createPipelinePlan({task='gear',parameters={},rules=[],id,revision=1,name,justifications={},documentations={}}={}) {
  const featureOps={gear:'shape.gear',annulus:'geometry.annulus',ring:'geometry.annulus',holes:'topology.holes',two_boundary:'geometry.two_boundary'};
  const op=featureOps[task];if(!op)throw new Error(`不支持任務模板 ${task}；可使用註冊表組裝顯式節點`);
  const reserved=new Set(['grayscale','segmentation','segment','components','features']);
  const features=parameters.features??Object.fromEntries(Object.entries(parameters).filter(([key])=>!reserved.has(key)));
  const plan={schema:PIPELINE_SCHEMA,id:id||`pipeline-${globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}`,revision,name:name||`${task} pipeline`,task,nodes:task==='two_boundary' ? [
    {id:'features',op,version:1,inputs:{image:'$image'},params:features,parameterSources:Object.fromEntries(Object.keys(features).map(key=>[key,'user']))},
    {id:'rules',op:'rules.evaluate',version:1,inputs:{analysis:'features.analysis'},params:{rules}},
  ] : [
    {id:'grayscale',op:'image.grayscale',version:1,inputs:{image:'$image'},params:parameters.grayscale||{}},
    {id:'segment',op:'segment.otsu',version:1,inputs:{image:'grayscale.image'},params:parameters.segmentation||parameters.segment||{}},
    {id:'components',op:'regions.components',version:1,inputs:{binary:'segment.binary'},params:parameters.components||{}},
    {id:'features',op,version:1,inputs:{region:'components.region'},params:features,parameterSources:Object.fromEntries(Object.keys(features).map(key=>[key,'user']))},
    {id:'rules',op:'rules.evaluate',version:1,inputs:{analysis:'features.analysis'},params:{rules}},
  ]};
  for(const node of plan.nodes)if(Object.hasOwn(documentations||{},node.id))node.documentation=documentations[node.id];
  for(const node of plan.nodes)if(Object.hasOwn(justifications||{},node.id))node.justification=JSON.parse(JSON.stringify(justifications[node.id]));
  return plan;
}
