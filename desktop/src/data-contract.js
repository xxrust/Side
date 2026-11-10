import validateContract from './data-contract-schema.generated.js';

const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const stable=x=>JSON.stringify(x,(_,v)=>record(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const same=(a,b)=>stable(a)===stable(b);
const frames=c=>[c?.coordinates,c?.from,c?.to].filter(Boolean);
const transport=c=>['image','mask'].includes(c.kind)?'image':c.kind==='file'?'file':'evidence';
const issue=(code,path,message)=>({code,path,message,hint:'讀取 dataContract 與 canonicalSchema；修正來源、型別、座標系或單位，validate_purpose_scheme 通過後重新執行。不可只改標籤冒充座標轉換。'});

export function dataContractIssues(contract,path='dataContract'){
 if(validateContract(contract))return [];
 return [issue('DATA_CONTRACT_INVALID',path,'資料契約格式不完整或不支援。'),...validateContract.errors.map(e=>issue('DATA_CONTRACT_INVALID',path+e.instancePath.replaceAll('/','.'),e.message))];
}

export function compileDataContracts(scheme){
 const errors=[],warnings=[],nodes=scheme.operatorGraph?.nodes||[],byId=new Map(nodes.map(n=>[n.id,n])),strict=scheme.execution?.dataContracts==='required';
 const missing=(path)=>{(strict?errors:warnings).push(issue('DATA_CONTRACT_MISSING',path,'此端口沒有語義契約，無法驗證型別、座標系與單位。'));};
 const check=(c,path,node)=>{
  if(!c){missing(path);return false;}
  const invalid=dataContractIssues(c,path);errors.push(...invalid);if(invalid.length)return false;
  for(const coordinates of frames(c)){
   const f=coordinates.frame;
   let valid=f.kind==='input'?scheme.execution.inputSlots?.some(s=>s.id===f.slot):f.kind==='reference'?Object.hasOwn(scheme.execution.referenceInputs||{},f.slot):false;
   if(f.kind==='artifact'){
    const producer=byId.get(f.nodeId),artifact=producer?.expected_outputs?.find(o=>o.id===f.artifactId);
    valid=artifact?.type==='image'&&(f.nodeId===node.id||Object.values(node.inputs||{}).some(i=>
     (i.nodeId===f.nodeId&&i.artifactId===f.artifactId)||frames(byId.get(i.nodeId)?.expected_outputs?.find(o=>o.id===i.artifactId)?.dataContract).some(c=>same(c.frame,f))));
   }
   if(!valid)errors.push(issue('COORDINATE_FRAME_UNAVAILABLE',path,'座標系必須引用本件具名輸入、固定參考，或本節點／明確圖像輸入的實際圖像產物。'));
   if(['image','mask'].includes(c.kind)&&coordinates.unit!=='px')errors.push(issue('IMAGE_COORDINATES_REQUIRE_PIXELS',path,'圖像柵格座標使用 px；物理座標需明確量測或幾何轉換。'));
  }
  return true;
 };
 for(const [index,node]of nodes.entries()){
  const base=`operatorGraph.nodes.${index}`;
  for(const [i,output]of (node.expected_outputs||[]).entries()){
   const path=`${base}.expected_outputs.${i}.dataContract`;
   if(check(output.dataContract,path,node)&&transport(output.dataContract)!==output.type)errors.push(issue('DATA_TRANSPORT_MISMATCH',path,`契約 ${output.dataContract.kind} 必須以 ${transport(output.dataContract)} 保存。`));
  }
  for(const [slot,input]of Object.entries(node.inputs||{})){
   const path=`${base}.inputs.${slot}.dataContract`,producer=byId.get(input.nodeId)?.expected_outputs?.find(o=>o.id===input.artifactId);
   if(check(input.dataContract,path,node)&&!same(input.dataContract,producer?.dataContract))errors.push(issue('DATA_CONTRACT_MISMATCH',path,'輸入契約與上游輸出不同；沒有隱式型別、單位或座標轉換。'));
  }
 }
 return {errors,warnings};
}

function frameBinding(coordinates,run,scheme,upstream){
 const f=coordinates.frame;
 if(f.kind==='input'||f.kind==='reference'){
  const slots=scheme?.execution?.inputSlots||[];
  const id=f.kind==='reference'?run.referenceInputs?.[f.slot]?.id||scheme?.execution?.referenceInputs?.[f.slot]
   :run.workpieceUnit?.views?.[f.slot]||(slots.length===1&&slots[0].id===f.slot?run.workpieceUnit?.imageIds?.[0]:null)
    ||(!run.workpieceUnit&&f.slot==='image'&&run.sourceBinding?.images?.length===1?run.sourceBinding.images[0].imageId:null);
  const image=run.sourceBinding?.images?.find(i=>i.imageId===id);
  if(!image)return null;
  return {frame:f,unit:coordinates.unit,imageId:id,contentSha256:image.contentSha256||image.imageSha256,width:image.width,height:image.height};
 }
 const entry=f.nodeId===run.schemeNodeId?{runId:run.runId,artifact:run.artifacts?.find(a=>a.id===f.artifactId)}
  :Object.values(upstream||{}).find(i=>i.nodeId===f.nodeId&&i.artifact?.id===f.artifactId);
 if(!entry?.artifact)return Object.values(upstream||{}).flatMap(i=>i.artifact?.contractBinding?.frames||[]).find(b=>same(b.frame,f)&&b.unit===coordinates.unit)||null;
 const a=entry.artifact;
 return {frame:f,unit:coordinates.unit,runId:entry.runId,artifactId:a.id,contentSha256:a.sha256,width:a.width,height:a.height};
}

// Checks the actual output, not the algorithm's self-declared pass/fail text.
// An absent measurement after normal NOT_FOUND is allowed; a malformed present
// measurement is never passed to consumers. Existing execution FAULT stays intact.
export function auditDataContracts(run,expected,{scheme,upstream}={}){
 const errors=[],bindings={},finite=Number.isFinite;
 const points=(v,min=0)=>Array.isArray(v)&&v.length>=min&&v.every(p=>record(p)&&finite(p.x)&&finite(p.y));
 for(const [index,output]of expected.entries()){
  const c=output.dataContract;if(!c)continue;
  const path=`expected_outputs.${index}`,invalid=dataContractIssues(c,path+'.dataContract');errors.push(...invalid);if(invalid.length)continue;
  if(run.status!=='SUCCEEDED'||run.execution?.status==='FAULT')continue;
  const a=run.artifacts?.find(a=>a.id===output.id),add=(code,message)=>errors.push(issue(code,path,message));
  if(!a){if(run.result?.valid!==false)add('DATA_OUTPUT_MISSING',`缺少宣告的產物 ${output.id}。`);continue;}
  if((a.type==='json'?'evidence':a.type)!==transport(c)){add('DATA_OUTPUT_TYPE_MISMATCH',`${output.id} 的實際儲存型別不符合 ${c.kind}。`);continue;}
  const resolved=frames(c).map(coord=>frameBinding(coord,run,scheme,upstream));
  if(resolved.some(b=>!b))add('DATA_FRAME_UNRESOLVED',`${output.id} 的座標系未能綁定本次真實圖像。`);
  bindings[output.id]={dataContract:c,frames:resolved.filter(Boolean)};
  const data=a.data;
  if(['image','mask'].includes(c.kind)){
   if(!Number.isInteger(a.width)||a.width<1||!Number.isInteger(a.height)||a.height<1)add('DATA_IMAGE_INVALID','實際圖像沒有有效尺寸。');
   const b=resolved[0];if(b&&(a.width!==b.width||a.height!==b.height))add('DATA_IMAGE_FRAME_SIZE_MISMATCH','圖像尺寸與宣告的像素座標系不一致；縮放／裁切產物應有自己的座標系。');
   if(c.kind==='mask'&&(a.channels!==1||a.binary!==true))add('DATA_MASK_INVALID','mask 必須由實際單通道二值像素產生；請檢查分割結果與執行核心版本。');
  }else if(c.kind==='measurement'){
   if(!record(data)||!finite(data.value))add('DATA_MEASUREMENT_INVALID','量測產物需為 {value:有限數值, unit:宣告單位}。');
   if(data?.unit!==c.unit)add('DATA_UNIT_MISMATCH','實際量測單位與端口契約不一致。');
  }else if(['points','contours','roi'].includes(c.kind)){
   if(!same(data?.coordinates,c.coordinates))add('DATA_COORDINATES_MISMATCH','幾何資料的 coordinates 與端口契約不一致。');
   if(c.kind==='contours'?!Array.isArray(data?.contours)||!data.contours.every(v=>points(v,1)):!points(data?.points,c.kind==='roi'?3:0))add('DATA_GEOMETRY_INVALID','幾何資料須使用有限 {x,y} 點；ROI 至少三點，每條輪廓至少一點。');
  }else if(c.kind==='homography'){
   if(!same(data?.from,c.from)||!same(data?.to,c.to))add('DATA_COORDINATES_MISMATCH','變換 from/to 座標系與端口契約不一致。');
   const m=data?.matrix;
   if(!Array.isArray(m)||m.length!==3||!m.every(r=>Array.isArray(r)&&r.length===3&&r.every(finite)))add('DATA_TRANSFORM_INVALID','平面投影 matrix 必須為有限數值的 3×3 矩陣。');
   else {
    const scale=Math.max(...m.flat().map(Math.abs)),n=m.map(r=>r.map(v=>v/scale));
    const det=n[0][0]*(n[1][1]*n[2][2]-n[1][2]*n[2][1])-n[0][1]*(n[1][0]*n[2][2]-n[1][2]*n[2][0])+n[0][2]*(n[1][0]*n[2][1]-n[1][1]*n[2][0]);
    if(!scale||det===0)add('DATA_TRANSFORM_DEGENERATE','此矩陣退化，不能表示可逆平面映射；未取得映射應回報正常 NOT_FOUND。');
   }
   // This is a representation check, not evidence that the fitted mapping is accurate.
  }else if(c.kind==='classification'&&!c.categories.includes(data?.categoryId))add('DATA_CATEGORY_INVALID','分類產物 categoryId 不在契約類別內。');
 }
 return {schema:'agentcv-data-contract-audit-1',valid:errors.length===0,errors,bindings,checked:expected.filter(o=>o.dataContract).length,untyped:expected.filter(o=>!o.dataContract).length,scope:'實際端口資料、來源綁定、有限數值與格式檢查；不證明算法精度或幾何轉換正確性。'};
}
