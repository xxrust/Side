import {algorithmRunCurrent} from './algorithm-workspace.js';

const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const finite=Number.isFinite;
const stable=value=>JSON.stringify(value,(_,item)=>record(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const sessions=new WeakMap();
const limits=Object.freeze({components:32,metrics:24,columns:24,tableRows:200,plotSeries:8,plotPoints:2048,textCharacters:12000});
const kinds=['image','metrics','table','plot','text','data'];
const runRoots=['status','title','error','stdout','stderr','traceback','environment','result'];
const sections=['document','tool','parameters','boundary'];
const uid=()=>crypto.randomUUID();
function fingerprint(value){const encoded=stable(value);let a=2166136261,b=2246822507;for(let i=0;i<encoded.length;i++){a=Math.imul(a^encoded.charCodeAt(i),16777619);b=Math.imul(b^encoded.charCodeAt(i),3266489909);}return `${encoded.length}:`+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
function fail(code,path,message,hint){const error=Error(message);error.code=code;error.errors=[{code,path,message,hint:hint??'使用 get_algorithm_run 讀取該 run 的真實產物與欄位，再修正 presentation_json；視圖只引用資料，不填造數值或 HTML。'}];throw error;}
function onlyKeys(value,allowed,path){for(const key of Object.keys(value))if(!allowed.includes(key))fail('PRESENTATION_FIELD_UNSUPPORTED',path?`${path}.${key}`:key,`不支援的視圖欄位：${path?path+'.':''}${key}`,'此位置僅支援 '+allowed.join(' / ')+'；不要傳入未實作的 size、style 或任意版面設定。先讀 get_algorithm_capabilities.presentation 的 componentExamples，使用實際支援的結構再提交。');}
function name(value,path,max=200){if(typeof value!=='string'||!value.trim()||value.length>max)fail('PRESENTATION_TEXT_INVALID',path,`${path} 需要 ${max} 字以內的非空文字`);return value;}
function id(value,path){if(typeof value!=='string'||!/^[-\w.]{1,120}$/.test(value))fail('PRESENTATION_ID_INVALID',path,`${path} 需要穩定且不重複的 ID`);return value;}
function pathValue(root,path='',label='source.path',{allowMissing=false}={}){
 if(typeof path!=='string'||path.length>1000)fail('PRESENTATION_PATH_INVALID',label,'資料路徑需為 1000 字以內的字串');
 let value=root;
 for(const key of path.split('.').filter(Boolean)){if(['__proto__','prototype','constructor'].includes(key))fail('PRESENTATION_PATH_MISSING',label,`不允許存取資料欄位：${path}`);if(value===null||typeof value!=='object'||!Object.hasOwn(value,key)){if(allowMissing)return undefined;fail('PRESENTATION_PATH_MISSING',label,`沒有實際資料欄位：${path}`);}value=value[key];}
 return value;
}
function boundScalar(value,path){if(value===null||typeof value==='boolean'||typeof value==='string'||finite(value))return typeof value==='string'?value.slice(0,500):value;fail('PRESENTATION_SCALAR_REQUIRED',path,'數字卡或表格儲存格需要實際純量；物件請繼續指定欄位路徑');}
function getRun(project,runId){const run=project.data.algorithmRuns?.find(run=>run.runId===runId);if(!run)fail('PRESENTATION_RUN_MISSING','run_id','找不到指定的真實算法運算紀錄');return run;}
function assertArtifactBinding(run,artifact){
 if(artifact.source){const source=clone(artifact.source),boundRunId=source.runId;delete source.runId;if(boundRunId!==undefined&&boundRunId!==run.runId||stable(source)!==stable(run.sourceBinding))fail('PRESENTATION_ARTIFACT_SOURCE_MISMATCH',`artifacts.${artifact.id}.source`,'產物來源與指定運算不一致');}
}
function resolveSource(run,component,path){
 if(!record(component.source)||Object.keys(component.source).some(key=>!['artifactId','path','scope'].includes(key))||component.source.scope!==undefined&&!['run','result'].includes(component.source.scope))fail('PRESENTATION_SOURCE_INVALID',`${path}.source`,'來源僅接受 artifactId、相對資料 path 及 scope:run／result');
 if(component.source.artifactId!==undefined){
  if(component.source.scope==='run')fail('PRESENTATION_SOURCE_INVALID',`${path}.source.scope`,'run scope 不能同時指定 artifactId；產物使用其自身資料路徑');
  id(component.source.artifactId,`${path}.source.artifactId`);const artifact=run.artifacts?.find(artifact=>artifact.id===component.source.artifactId);
  if(!artifact)fail('PRESENTATION_ARTIFACT_MISSING',`${path}.source.artifactId`,'指定產物沒有在這次運算產生');assertArtifactBinding(run,artifact);
  if(component.kind==='image'){
   if(component.source.path)fail('PRESENTATION_IMAGE_PATH_INVALID',`${path}.source.path`,'圖片直接引用產物 ID，不讀任意資料網址');
   const dataUrl=artifact.dataUrl||artifact.dataURL;
   if(artifact.type!=='image'||typeof dataUrl!=='string'||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(dataUrl)||!finite(artifact.width)||artifact.width<=0||!finite(artifact.height)||artifact.height<=0)fail('PRESENTATION_IMAGE_INVALID',`${path}.source`,'這不是具有效像素內容及尺寸的實算圖片產物');
   return {artifact,data:{dataUrl,width:artifact.width,height:artifact.height,artifactId:artifact.id,artifactSha256:artifact.sha256??null}};
  }
  if(artifact.type!=='json'||!Object.hasOwn(artifact,'data'))fail('PRESENTATION_DATA_UNAVAILABLE',`${path}.source`,'數字與圖表必須引用已保存的 JSON 產物，不能把檔案路徑當數據');
  return {artifact,data:pathValue(artifact.data,component.source.path??'',`${path}.source.path`,{allowMissing:component.kind==='data'})};
 }
 if(component.kind==='image')fail('PRESENTATION_IMAGE_ARTIFACT_REQUIRED',`${path}.source`,'圖片必須引用本次運算的 image 產物 ID');
 if(component.source.scope==='run'){
  const root=typeof component.source.path==='string'?component.source.path.split('.').filter(Boolean)[0]:null;
  if(!runRoots.includes(root))fail('PRESENTATION_RUN_PATH_FORBIDDEN',`${path}.source.path`,'run scope 僅能讀 status／title／error／stdout／stderr／traceback／environment／result，不能讀程式、任意檔案或認證資料');
  return {artifact:null,data:pathValue(run,component.source.path,`${path}.source.path`,{allowMissing:component.kind==='data'})};
 }
 return {artifact:null,data:pathValue(run.result,component.source.path??'',`${path}.source.path`,{allowMissing:component.kind==='data'})};
}
function normalizeFields(fields,path,max){
 if(!Array.isArray(fields)||!fields.length||fields.length>max)fail('PRESENTATION_FIELDS_INVALID',path,`需要 1–${max} 個明確欄位`);
 return fields.map((field,index)=>{const at=`${path}.${index}`;if(!record(field))fail('PRESENTATION_FIELDS_INVALID',at,'欄位需要 label 和 path');onlyKeys(field,['label','path','unit'],at);name(field.label,`${at}.label`,120);if(typeof field.path!=='string'||field.path.length>1000)fail('PRESENTATION_PATH_INVALID',`${at}.path`,'欄位需要相對資料路徑');if(field.unit!==undefined&&(typeof field.unit!=='string'||field.unit.length>40))fail('PRESENTATION_UNIT_INVALID',`${at}.unit`,'顯示單位需為 40 字以內的文字；不能代替標定或數值換算');return {label:field.label,path:field.path,...(field.unit===undefined?{}:{unit:field.unit})};});
}
function resolveComponent(run,input,index){
 const at=`components.${index}`;if(!record(input))fail('PRESENTATION_COMPONENT_INVALID',at,'每個視圖元件需要 ID、kind、title 與來源');
 id(input.id,`${at}.id`);name(input.title,`${at}.title`);if(!kinds.includes(input.kind))fail('PRESENTATION_KIND_INVALID',`${at}.kind`,'可用 image／metrics／table／plot／text／data；不能注入 HTML 或腳本');
 onlyKeys(input,['id','kind','title','source',...({metrics:['fields'],table:['columns'],plot:['series','x']}[input.kind]||[])],at);
 const component={id:input.id,kind:input.kind,title:input.title,source:clone(input.source)},resolved=resolveSource(run,component,at),value=resolved.data;
 if(input.kind==='image')return {...component,data:value};
 if(input.kind==='metrics'){
  component.fields=normalizeFields(input.fields,`${at}.fields`,limits.metrics);
  return {...component,data:{fields:component.fields.map(field=>({...field,value:boundScalar(pathValue(value,field.path,`${at}.fields.${field.path}`),`${at}.fields.${field.path}`)}))}};
 }
 if(input.kind==='table'){
  if(!Array.isArray(value))fail('PRESENTATION_ARRAY_REQUIRED',`${at}.source`,'表格來源必須是實際資料陣列');component.columns=normalizeFields(input.columns,`${at}.columns`,limits.columns);
  return {...component,data:{columns:component.columns,rows:value.slice(0,limits.tableRows).map((row,rowIndex)=>component.columns.map(column=>boundScalar(pathValue(row,column.path,`${at}.rows.${rowIndex}.${column.path}`),`${at}.rows.${rowIndex}.${column.path}`))),totalRows:value.length,omittedRows:Math.max(0,value.length-limits.tableRows)}};
 }
 if(input.kind==='plot'){
  if(!Array.isArray(value))fail('PRESENTATION_ARRAY_REQUIRED',`${at}.source`,'曲線來源必須是實際資料陣列');component.series=normalizeFields(input.series,`${at}.series`,limits.plotSeries);if(input.x!==undefined&&(typeof input.x!=='string'||input.x.length>1000))fail('PRESENTATION_PATH_INVALID',`${at}.x`,'曲線 x 需為相對欄位路徑，不填則用原陣列索引');if(input.x!==undefined)component.x=input.x;
  const count=Math.min(value.length,limits.plotPoints),indices=Array.from({length:count},(_,i)=>count===1?0:Math.round(i*(value.length-1)/(count-1)));
  const series=component.series.map(field=>({...field,points:indices.map(index=>{const x=input.x===undefined?index:pathValue(value[index],input.x,`${at}.x`),y=pathValue(value[index],field.path,`${at}.series.${field.path}`);if(!finite(x)||!finite(y))fail('PRESENTATION_NUMERIC_REQUIRED',`${at}.series.${field.path}`,'曲線座標必須是實際有限數字；不自動猜數字或刪除失敗資料點');return {x,y,index};})}));
  return {...component,data:{series,totalPoints:value.length,shownPoints:count,sampled:count<value.length}};
 }
 if(input.kind==='data'){const rendered=value===undefined?'尚未輸出結果':JSON.stringify(value,null,2);if(typeof rendered!=='string')fail('PRESENTATION_JSON_DATA_REQUIRED',`${at}.source`,'資料元件需要真實 JSON 輸出');return {...component,data:{text:rendered.slice(0,limits.textCharacters),totalCharacters:rendered.length,truncated:rendered.length>limits.textCharacters}};}
 if(typeof value!=='string')fail('PRESENTATION_STRING_REQUIRED',`${at}.source`,'文字元件需要真實字串輸出；數字或物件請用數字卡、表格、曲線或 data');
 return {...component,data:{text:value.slice(0,limits.textCharacters),totalCharacters:value.length,truncated:value.length>limits.textCharacters}};
}
function getStored(project,presentationId){const id=presentationId||project.data.activeAlgorithmPresentationId,presentation=project.data.algorithmPresentations?.find(item=>item.id===id);if(!presentation)fail('PRESENTATION_MISSING','presentation_id','尚未建立或找不到指定的算法視圖');return presentation;}
export function presentationDataFingerprint(run,presentation){return fingerprint(presentation.components.map((component,index)=>{const resolved=resolveSource(run,component,`components.${index}`);return {component,artifactId:resolved.artifact?.id??null,artifactSha256:resolved.artifact?.sha256??null,data:resolved.data};}));}
function state(project,presentation,run){const applicable=project.image?.id===presentation.imageId,dataCurrent=presentation.presentationDataFingerprint===presentationDataFingerprint(run,presentation),sourceCurrent=dataCurrent&&stable(presentation.sourceBinding)===stable(run.sourceBinding)&&presentation.codeSha256===(run.codeSha256??null)&&algorithmRunCurrent(project,run);return {applicable,inapplicable:!applicable,dataCurrent,sourceCurrent,current:applicable&&sourceCurrent,status:!applicable?'INAPPLICABLE':sourceCurrent?'CURRENT':'STALE'};}

export function algorithmPresentationCapabilities(){return {schema:'agentcv-algorithm-presentation-contract-1',kinds:[...kinds],layouts:['focus','compare'],limits:{...limits},allowedProperties:{root:['title','imageId','outputId','layout','components'],componentCommon:['id','kind','title','source'],kindSpecific:{image:[],metrics:['fields'],table:['columns'],plot:['series','x'],text:[],data:[]},field:['label','path','unit'],unknownProperties:'原子拒絕；不忽略未支援的 size、style 或版面選項，不能聲稱它們已生效。'},componentExamples:{image:{id:'overlay',kind:'image',title:'原圖與結果',source:{artifactId:'overlay'}},metrics:{id:'size',kind:'metrics',title:'本次寬度',source:{path:'measurement'},fields:[{label:'寬度',path:'width',unit:'px'}]},table:{id:'quality',kind:'table',title:'逐側品質',source:{artifactId:'stats',path:'rows'},columns:[{label:'側別',path:'side'},{label:'RMS',path:'rms'}]},plot:{id:'profile',kind:'plot',title:'實算剖面',source:{artifactId:'profile',path:'points'},x:'distance',series:[{label:'強度',path:'intensity'}]},text:{id:'note',kind:'text',title:'實算說明',source:{path:'message'}},data:{id:'execution-error',kind:'data',title:'本次執行錯誤',source:{scope:'run',path:'error'}}},dataReferences:'source:{artifactId?,path?,scope?:result|run}；有 artifactId 從該 JSON 產物讀，否則預設從 run.result 讀。scope:run 僅允許 status/title/error/stdout/stderr/traceback/environment/result 根欄位。圖片只接受實際 image 產物。metrics.fields/table.columns/plot.series 使用相對資料路徑；plot.x 不填則為索引。data 可保底展示任何真實 JSON，未輸出欄位顯示「尚未輸出結果」，不補造數值。',dataExample:{id:'execution-error',kind:'data',title:'本次執行錯誤',source:{scope:'run',path:'error'}},scope:'只宣告真實運算資料的顯示方式，不執行 HTML／JS，不改算法、人工答案或發布。節點文檔連回原運算記錄；可展示失敗／診斷運算，但不能把展示成功當算法通過。',renderReceipt:'宿主回執記錄元件掛載與圖片載入，不能證明人眼可見、圖像語義正確、量測準確或已完成工程驗收。'};}
export function proposeAlgorithmPresentation(project,{run_id,presentation_json}){
 const run=getRun(project,run_id);let input;try{input=typeof presentation_json==='string'?JSON.parse(presentation_json):presentation_json}catch{fail('PRESENTATION_JSON_INVALID','presentation_json','視圖宣告不是有效 JSON');}
 if(!record(input))fail('PRESENTATION_JSON_INVALID','presentation_json','視圖宣告需要 JSON 物件');name(input.title,'title');
 onlyKeys(input,['title','imageId','outputId','layout','components'],'');
 if(!run.sourceBinding?.images?.some(image=>image.imageId===input.imageId))fail('PRESENTATION_IMAGE_MISMATCH','imageId','視圖圖片必須是該運算真正使用的輸入圖片');
 if(!['focus','compare'].includes(input.layout??'focus'))fail('PRESENTATION_LAYOUT_INVALID','layout','版面可用 focus 或 compare');
 if(input.outputId!==undefined)id(input.outputId,'outputId');
 if(!Array.isArray(input.components)||!input.components.length||input.components.length>limits.components)fail('PRESENTATION_COMPONENTS_INVALID','components',`需要 1–${limits.components} 個實際資料元件`);
 const components=input.components.map((component,index)=>resolveComponent(run,component,index));if(new Set(components.map(component=>component.id)).size!==components.length)fail('PRESENTATION_DUPLICATE_ID','components','同一視圖的元件 ID 不可重複');
 const presentation={schema:'agentcv-algorithm-presentation-1',id:uid(),revision:1,title:input.title,imageId:input.imageId,outputId:input.outputId??null,layout:input.layout??'focus',runId:run.runId,codeSha256:run.codeSha256??null,sourceBinding:clone(run.sourceBinding),components:components.map(({data,...component})=>component),createdAt:new Date().toISOString(),author:'agent',stage:'TRIAL'};
 presentation.presentationDataFingerprint=presentationDataFingerprint(run,presentation);
 project.checkpoint();project.data.algorithmPresentations||=[];project.data.algorithmPresentations.push(presentation);project.data.activeAlgorithmPresentationId=presentation.id;sessions.delete(project);project.event('algorithm_presentation_proposed',{presentation_id:presentation.id,run_id:run.runId,image_id:presentation.imageId,component_ids:presentation.components.map(component=>component.id)});
 return readAlgorithmPresentation(project,{presentation_id:presentation.id});
}
export function readAlgorithmPresentation(project,{presentation_id,include_data=false}={}){
 const presentation=getStored(project,presentation_id),run=getRun(project,presentation.runId),binding=state(project,presentation,run);let session=sessions.get(project);
 if(session&&(session.imageId!==(project.image?.id??null)||!binding.sourceCurrent)){sessions.delete(project);session=null;}
 const stored=project.data.algorithmPresentationReceipts?.filter(receipt=>receipt.presentationId===presentation.id).at(-1),receipt=stored?{...clone(stored),currentAtRender:stored.current,current:binding.current,sourceCurrent:binding.sourceCurrent,applicable:binding.applicable,latest:!!session&&session.token===stored.renderToken&&session.presentationId===presentation.id&&session.imageId===project.image?.id&&session.revision===presentation.revision,validForCurrentView:!!session&&session.token===stored.renderToken&&binding.current}:null;
 return {...clone(presentation),...binding,runStatus:run.status,evidenceAudit:clone(run.evidenceAudit),justification:clone(run.justification),documentation:run.documentation,components:include_data?presentation.components.map((component,index)=>resolveComponent(run,component,index)):clone(presentation.components),renderReceipt:receipt,scope:'資料顯示與工程採用分開；CURRENT 只指來源及目前圖片適用，不能代表算法或量測已通過。'};
}
export function beginAlgorithmPresentationRender(project,presentationId,{selectedComponentId,section='tool'}={}){
 const presentation=getStored(project,presentationId);if(!sections.includes(section))fail('PRESENTATION_SECTION_INVALID','section','依據頁可用 tool／parameters／boundary');
 const selected=selectedComponentId??presentation.components[0].id;if(!presentation.components.some(component=>component.id===selected))fail('PRESENTATION_COMPONENT_MISSING','selectedComponentId','找不到指定的視圖元件');
 const session={token:uid(),presentationId:presentation.id,revision:presentation.revision,runId:presentation.runId,imageId:project.image?.id??null,selectedComponentId:selected,section};sessions.set(project,session);return clone(session);
}
export function recordAlgorithmPresentationRender(project,{presentationId,renderToken,components,viewport}={}){
 const presentation=getStored(project,presentationId),run=getRun(project,presentation.runId),session=sessions.get(project),binding=state(project,presentation,run);
 if(!session||session.token!==renderToken||session.presentationId!==presentationId||session.revision!==presentation.revision||session.imageId!==(project.image?.id??null))fail('PRESENTATION_RENDER_STALE','renderToken','這不是目前畫面最後一次渲染；切換圖片或依據頁後需要重新建立宿主回執');
 if(!Array.isArray(components)||components.length>presentation.components.length)fail('PRESENTATION_RECEIPT_INVALID','components','宿主回執需列出本視圖實際掛載的元件');
 const seen=new Set(),observed=components.map((item,index)=>{
  const expected=presentation.components.find(component=>component.id===item.componentId);if(!expected||seen.has(item.componentId)||!['mounted','loaded','error'].includes(item.status))fail('PRESENTATION_RECEIPT_INVALID',`components.${index}`,'回執元件 ID 與狀態不屬於本視圖');seen.add(item.componentId);
  const artifact=expected.source.artifactId?run.artifacts.find(artifact=>artifact.id===expected.source.artifactId):null;
  if(item.artifactId!==undefined&&item.artifactId!==(artifact?.id??null)||item.artifactSha256!==undefined&&item.artifactSha256!==(artifact?.sha256??null))fail('PRESENTATION_RECEIPT_ARTIFACT_MISMATCH',`components.${index}`,'宿主觀察的產物 ID 或摘要與指定元件來源不一致');
  if(item.status==='loaded'&&expected.kind!=='image')fail('PRESENTATION_RECEIPT_INVALID',`components.${index}.status`,'只有實際圖片有載入狀態');
  const dimensions={};for(const key of ['width','height','naturalWidth','naturalHeight'])if(item[key]!==undefined){if(!finite(item[key])||item[key]<0)fail('PRESENTATION_RECEIPT_INVALID',`components.${index}.${key}`,'尺寸必須來自有限非負的實際觀察');dimensions[key]=item[key];}
  if(expected.kind==='image'&&item.status==='loaded'&&(!(dimensions.naturalWidth>0)||!(dimensions.naturalHeight>0)))fail('PRESENTATION_RECEIPT_INVALID',`components.${index}`,'圖片 loaded 需要真實 naturalWidth／naturalHeight，不能只憑元件已掛載');
  if(expected.kind==='image'&&item.status==='loaded'){if(dimensions.naturalWidth!==artifact?.width||dimensions.naturalHeight!==artifact?.height)fail('PRESENTATION_RECEIPT_IMAGE_MISMATCH',`components.${index}`,'實際載入圖片尺寸與指定實算產物不同，不能沿用另一張圖的回執');}
  return {componentId:item.componentId,kind:expected.kind,status:item.status,artifactId:artifact?.id??null,artifactSha256:artifact?.sha256??null,path:expected.source.path??'',...dimensions,...(item.status==='error'?{error:String(item.error||'元件顯示失敗').slice(0,500)}:{})};
 });
 const viewportRecord={};if(viewport!==undefined){if(!record(viewport))fail('PRESENTATION_RECEIPT_INVALID','viewport','viewport 需要實際觀察的寬高');for(const key of ['width','height'])if(viewport[key]!==undefined){if(!finite(viewport[key])||viewport[key]<0)fail('PRESENTATION_RECEIPT_INVALID',`viewport.${key}`,'視口尺寸無效');viewportRecord[key]=viewport[key];}}
 const selected=observed.find(component=>component.componentId===session.selectedComponentId),receipt={schema:'agentcv-algorithm-render-receipt-1',id:uid(),presentationId:presentation.id,revision:presentation.revision,renderToken,runId:run.runId,imageId:presentation.imageId,activeImageId:project.image?.id??null,presentationDataFingerprint:presentation.presentationDataFingerprint,current:binding.current,sourceCurrent:binding.sourceCurrent,applicable:binding.applicable,selectedComponentId:session.selectedComponentId,section:session.section,components:observed,viewport:viewportRecord,renderedAt:new Date().toISOString(),status:observed.some(component=>component.status==='error')?'ERROR':!selected?'INCOMPLETE':selected.kind==='image'&&selected.status!=='loaded'?'PENDING_IMAGE':'MOUNTED',claim:'元件掛載／圖片載入觀察；不證明畫面人眼可見、內容正確或工程驗收通過。'};
 project.data.algorithmPresentationReceipts||=[];project.data.algorithmPresentationReceipts.push(receipt);if(project.data.algorithmPresentationReceipts.length>100)project.data.algorithmPresentationReceipts.splice(0,project.data.algorithmPresentationReceipts.length-100);
 return {...clone(receipt),latest:true,validForCurrentView:binding.current};
}

/** Validate saved references without executing programs or treating saved receipts as live UI. */
export function prepareAlgorithmPresentations(data){
 const presentations=data.algorithmPresentations??[],receipts=data.algorithmPresentationReceipts??[];
 if(!Array.isArray(presentations)||presentations.length>1000||!Array.isArray(receipts)||receipts.length>100)fail('PRESENTATION_SAVED_INVALID','algorithmPresentations','已保存的算法視圖或回執清單格式／數量無效');
 const ids=new Set();
 for(const presentation of presentations){
  if(!record(presentation)||presentation.schema!=='agentcv-algorithm-presentation-1'||!Number.isInteger(presentation.revision)||presentation.revision<1||!Array.isArray(presentation.components)||!presentation.components.length||presentation.components.length>limits.components||typeof presentation.presentationDataFingerprint!=='string')fail('PRESENTATION_SAVED_INVALID','algorithmPresentations','已保存視圖缺少有效 schema、修訂、資料指紋或元件');
  id(presentation.id,'presentation.id');name(presentation.title,'presentation.title');if(ids.has(presentation.id))fail('PRESENTATION_DUPLICATE_ID','algorithmPresentations','已保存的視圖 ID 重複');ids.add(presentation.id);
  const run=data.algorithmRuns?.find(run=>run.runId===presentation.runId);if(!run||!run.sourceBinding?.images?.some(image=>image.imageId===presentation.imageId)||!record(presentation.sourceBinding)||!['focus','compare'].includes(presentation.layout))fail('PRESENTATION_SAVED_SOURCE_INVALID','algorithmPresentations','已保存視圖引用不存在的運算、圖片或版面');
  if(presentation.outputId!==null&&presentation.outputId!==undefined)id(presentation.outputId,'presentation.outputId');
  const componentIds=new Set();presentation.components.forEach((component,index)=>{resolveComponent(run,component,index);if(componentIds.has(component.id))fail('PRESENTATION_DUPLICATE_ID','components','已保存視圖元件 ID 重複');componentIds.add(component.id);});
 }
 if(data.activeAlgorithmPresentationId!==undefined&&data.activeAlgorithmPresentationId!==null&&!ids.has(data.activeAlgorithmPresentationId))fail('PRESENTATION_SAVED_ACTIVE_INVALID','activeAlgorithmPresentationId','目前視圖引用不存在的已保存視圖');
 const receiptIds=new Set();for(const receipt of receipts){
  const presentation=presentations.find(item=>item.id===receipt?.presentationId);if(!record(receipt)||receipt.schema!=='agentcv-algorithm-render-receipt-1'||!presentation||receipt.runId!==presentation.runId||receipt.imageId!==presentation.imageId||!Number.isInteger(receipt.revision)||!Array.isArray(receipt.components)||receipt.components.length>limits.components||!presentation.components.some(component=>component.id===receipt.selectedComponentId)||!sections.includes(receipt.section)||typeof receipt.renderToken!=='string'||typeof receipt.renderedAt!=='string'||!['ERROR','INCOMPLETE','PENDING_IMAGE','MOUNTED'].includes(receipt.status))fail('PRESENTATION_SAVED_RECEIPT_INVALID','algorithmPresentationReceipts','已保存宿主回執缺少有效來源、元件或狀態');
  id(receipt.id,'receipt.id');if(receiptIds.has(receipt.id))fail('PRESENTATION_DUPLICATE_ID','algorithmPresentationReceipts','已保存回執 ID 重複');receiptIds.add(receipt.id);
  const seen=new Set();for(const component of receipt.components){if(!record(component)||!presentation.components.some(item=>item.id===component.componentId&&item.kind===component.kind)||seen.has(component.componentId)||!['mounted','loaded','error'].includes(component.status))fail('PRESENTATION_SAVED_RECEIPT_INVALID','algorithmPresentationReceipts.components','已保存回執元件不屬於該視圖');seen.add(component.componentId);}
 }
 // Apply defaults only after all validation succeeds. No program, image load or render occurs here.
 data.algorithmPresentations=presentations;data.algorithmPresentationReceipts=receipts;if(data.activeAlgorithmPresentationId===undefined)data.activeAlgorithmPresentationId=null;
}
