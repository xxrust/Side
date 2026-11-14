import {renderNodeDocumentation,nodeDocumentationActions} from './node-documentation-view.js';
import {iconButton,iconLabelButton} from './ui-icons.js';
import './algorithm-run-view.css';
import {fullRotation} from './image-viewport.js';

const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined){node.textContent=String(text);if(['p','strong'].includes(tag))node.title=String(text)}if(cls)node.className=cls;return node};
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const rows=value=>Array.isArray(value)?value:[];
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const finite=Number.isFinite;
const present=value=>typeof value==='string'&&value.trim()?value.trim():null;
const text=value=>value===undefined?'未提供':value===null?'未取得':typeof value==='string'?value:JSON.stringify(value);
const short=(value,max=160)=>{const full=text(value);return full.length>max?full.slice(0,max)+'…':full};
const sectionNames={document:'節點文檔'};
const sourceNames={'agent-proposal':'Agent 提出','agent-explicit':'Agent 明確設定','human-input':'人工提供','operator-default':'算子預設','engineering-default':'工程預設','inherited-recipe':'沿用方案','data-derived':'本次資料推導','not-supplied':'未提供'};
const errorText=error=>present(error)||(record(error)?[error.type,error.message].filter(Boolean).join(': '):null);
const imageIdentity=image=>({...image,imageId:image?.imageId??image?.id,imageSha256:image?.imageSha256??image?.inputSha256??image?.sha256});
function normalizeBinding(binding={},runId){
 const first=record(binding.images?.[0])?imageIdentity(binding.images[0]):{},normalized={...binding};
 for(const key of ['imageId','imageSha256','pixelFingerprint','width','height'])if(normalized[key]===undefined&&first[key]!==undefined)normalized[key]=first[key];
 if(normalized.imageSha256===undefined&&normalized.inputSha256!==undefined)normalized.imageSha256=normalized.inputSha256;
 if(normalized.runId===undefined&&runId!==undefined)normalized.runId=runId;
 return normalized;
}
const inputBindings=binding=>Array.isArray(binding.images)?binding.images:binding.imageId!==undefined?[binding]:null;
function sameBinding(a,b){
 if(!a||!b)return true;const left=normalizeBinding(a),right=normalizeBinding(b);
 if(['imageId','imageSha256','pixelFingerprint','width','height','runId','projectEpoch','workflowRevision'].some(key=>left[key]!==undefined&&right[key]!==undefined&&left[key]!==right[key]))return false;
 const leftInputs=inputBindings(left),rightInputs=inputBindings(right);if(!leftInputs||!rightInputs)return true;
 if(leftInputs.length!==rightInputs.length)return false;
 // Image order is semantic: algorithm code can address images[0], images[1].
 // Compare identity fields, not JSON property order or unrelated annotations.
 return leftInputs.every((image,index)=>{const l=imageIdentity(image),r=imageIdentity(rightInputs[index]);return !['imageId','imageSha256','pixelFingerprint','width','height'].some(key=>l[key]!==undefined&&r[key]!==undefined&&l[key]!==r[key])});
}
const bindingOf=run=>normalizeBinding(run?.sourceBinding||run?.source||{},run?.runId);
const imageURL=artifact=>artifact?.dataUrl||artifact?.dataURL;
const rasterURL=url=>typeof url==='string'&&/^data:image\/(?:png|jpe?g|webp|gif|bmp);base64,/i.test(url);
const artifactTitle=(artifact,index)=>present(artifact?.name)||present(artifact?.label)||present(artifact?.id)||`圖 ${index+1}`;
function valueAt(value,path){let current=value;for(const key of String(path).split('.')){if(current===null||current===undefined)return undefined;current=current[key]}return current}
function compactFacts(value,prefix='',failed=false,depth=0){
 if(depth>6)return [{label:prefix||'內容',value:'巢狀資料，展開完整數據查看',priority:9}];
 if(Array.isArray(value))return [{label:prefix||'資料',value:`${value.length} 項（完整數據可展開）`,priority:6}];
 if(record(value)){const rejected=failed||value.pass===false||value.status==='FAIL';return Object.entries(value).flatMap(([key,item])=>compactFacts(item,prefix?prefix+'.'+key:key,rejected,depth+1))}
 const key=prefix.split('.').at(-1)||'',priority=(failed?-10:0)+(/expression/i.test(key)?-1:/spread/i.test(key)?0:typeof value==='number'?2:value===false?3:typeof value==='boolean'?4:5);
 return [{label:prefix||'值',value:typeof value==='number'&&finite(value)?Number(value.toPrecision(7)):text(value),priority}];
}
const limitedFacts=(value,count)=>compactFacts(value).sort((a,b)=>a.priority-b.priority).slice(0,count);

/** A reader for one real, immutable programmable-CV run. It does not execute or
 * certify the program and never turns a program-authored check into acceptance. */
export class AlgorithmRunView{
 constructor({onReference,onClose,isCurrent,onOpenExternal,loadRunDetails}={}){
  Object.assign(this,{onReference,onClose,isCurrent,onOpenExternal,loadRunDetails});this.openGeneration=0;
  this.dialog=el('dialog',undefined,'algorithm-run-dialog');this.dialog.id='algorithmRunDialog';this.dialog.setAttribute('aria-label','算法程式 · 圖像結果與節點文檔');
  document.body.append(this.dialog);this.section='document';this.index=0;this.page=0;this.camera=null;this.rotation=0;this.run=null;this.repeat=null;
  this.dialog.addEventListener('close',()=>{this.openGeneration++;this.stopRepeat();this.run=null;this.dialog.replaceChildren();this.onClose?.()});
  this.dialog.addEventListener('keydown',event=>{
   if(/INPUT|TEXTAREA|SELECT|PRE/.test(event.target.tagName))return;
   if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();this.move(event.key==='ArrowLeft'?-1:1)}
   else if(event.key==='0'){event.preventDefault();this.fit()}
   else if(event.key==='1'){event.preventDefault();this.zoomTo(1)}
   else if(event.key==='Escape'&&this.dialog.classList.contains('is-maximized')){event.preventDefault();this.toggleMaximize(false)}
  });
  this.resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(this.camera?.fitted)this.fit();else this.paintImage()}):null;
  this.releaseRepeat=()=>this.stopRepeat();for(const name of ['pointerup','pointercancel','blur'])window.addEventListener(name,this.releaseRepeat);
 }
 button(label,action,cls){const button=el('button',label,cls);button.type='button';button.onclick=action;return button}
 glyph(icon,label,action){return iconButton(this.button('',action),icon,label)}
 open(run,{section='document',artifactId}={}){
  if(!record(run))throw Error('請提供真實算法執行紀錄');
  if(run.deferredProcedureTrace!==undefined)return this.openDeferred(run,{section,artifactId});
  this.openGeneration++;this.stopRepeat();this.run=clone(run);this.section=Object.hasOwn(sectionNames,section)?section:'document';this.page=0;this.camera=null;this.rotation=0;this.drawer=null;
  const binding=bindingOf(this.run),all=rows(this.run.artifacts);this.rejectedArtifacts=all.filter(artifact=>!sameBinding(artifact.sourceBinding||artifact.source,binding));
  this.artifacts=all.filter(artifact=>artifact.type==='image'&&sameBinding(artifact.sourceBinding||artifact.source,binding));
  this.index=Math.max(0,this.artifacts.findIndex(artifact=>artifact.id===artifactId));
  if(!artifactId)this.chooseSectionImage();this.render();if(!this.dialog.open)this.dialog.showModal();this.resizeObserver?.observe(this.viewport);
  return this;
 }
 async openDeferred(run,options){
  const generation=++this.openGeneration,current=()=>generation===this.openGeneration;
  this.stopRepeat();this.run=null;this.artifacts=[];this.drawer=null;
  const message=el('p','正在讀取完整程序證據…');message.setAttribute('role','status');
  this.dialog.replaceChildren(message,this.button('關閉',()=>this.close()));
  if(!this.dialog.open)this.dialog.showModal();
  try{
   if(!this.loadRunDetails)throw Error('完整程序證據讀取未連接');
   const complete=await this.loadRunDetails(run,{isCurrent:current});
   if(!current())return null;
   if(!record(complete)||complete.runId!==run.runId||complete.deferredProcedureTrace!==undefined)throw Error('完整程序證據與指定運算不一致');
   return this.open(complete,options);
  }catch(error){
   if(current()){message.textContent='無法讀取完整程序證據：'+String(error?.message||error);message.setAttribute('role','alert');}
   return null;
  }
 }
 close(){this.openGeneration++;this.stopRepeat();if(this.dialog.open)this.dialog.close()}
 destroy(){this.openGeneration++;this.stopRepeat();this.resizeObserver?.disconnect();for(const name of ['pointerup','pointercancel','blur'])window.removeEventListener(name,this.releaseRepeat);this.dialog.remove();this.run=null}
 currentArtifact(){return this.artifacts?.[this.index]||null}
 snapshot(){
  if(!this.run)return null;const artifact=this.currentArtifact(),binding=bindingOf(this.run);
  return {schema:'agentcv-algorithm-view-snapshot-1',runId:this.run.runId,sourceBinding:clone(binding),codeSha256:this.run.codeSha256||null,artifactId:artifact?.id||null,artifactSha256:artifact?.sha256||null,artifactName:artifact?artifactTitle(artifact,this.index):null,section:this.section,status:this.run.status,width:artifact?.width??null,height:artifact?.height??null,historical:this.isCurrent?this.isCurrent(binding,this.run)!==true:!!this.run.historical,scope:'保存的算法試算產物；未人工採用，程式完成不等於工程驗收。'};
 }
 reference(){const artifact=this.currentArtifact();if(this.loadError||!artifact||!rasterURL(imageURL(artifact)))return;this.onReference?.({run:clone(this.run),artifact:clone(artifact),snapshot:this.snapshot()})}
 chooseSectionImage(){const index=this.artifacts.findIndex(artifact=>artifact.section===this.section||rows(artifact.sections).includes(this.section));if(index>=0){this.index=index;this.camera=null}}
 setSection(section){if(!Object.hasOwn(sectionNames,section))return;this.section=section;this.page=0;this.chooseSectionImage();this.render()}
 move(delta){if(!this.artifacts?.length)return;const index=Math.max(0,Math.min(this.artifacts.length-1,this.index+delta));if(index===this.index)return;this.index=index;this.camera=null;this.render()}
 stopRepeat(){if(this.repeat){clearTimeout(this.repeat);this.repeat=null}}
 stepButton(direction){const button=this.glyph(direction<0?'previous':'next',direction<0?'前一張；按住連續切換':'後一張；按住連續切換',event=>{if(!event||event.detail===0)this.move(direction)});button.disabled=direction<0?this.index<=0:this.index>=this.artifacts.length-1;
  button.onpointerdown=event=>{if(event.button!==0||button.disabled)return;event.preventDefault();this.stopRepeat();this.move(direction);const advance=()=>{if(!this.dialog.open)return;this.move(direction);this.repeat=setTimeout(advance,180)};this.repeat=setTimeout(advance,400)};
  for(const name of ['pointerup','pointercancel','pointerleave'])button.addEventListener(name,()=>this.stopRepeat());return button;
 }
 render(){
  if(!this.run)return;this.resizeObserver?.disconnect();this.loadError=false;const run=this.run,binding=bindingOf(run),artifact=this.currentArtifact(),d=this.dialog;d.replaceChildren();d.dataset.runId=run.runId||'';d.dataset.imageId=binding.imageId||'';d.dataset.section=this.section;d.dataset.status=run.status||'UNKNOWN';
  const header=el('header',undefined,'algorithm-run-heading'),title=el('div');title.append(el('h2',present(run.title)||'算法程式 · 本次結果'),el('small',`${run.status==='SUCCEEDED'?'程式已執行':run.status==='TIMEOUT'?'執行逾時':run.status==='FAILED'?'執行失敗':'執行狀態未提供'} · Agent 試算 · ${(run.runId||'未提供 run').slice(0,16)}`));header.append(title,this.button('執行檔案',()=>this.showDrawer('code'),'algorithm-run-records'),this.button('最大化',()=>this.toggleMaximize(),'algorithm-run-maximize'),this.glyph('close','關閉算法結果',()=>this.close()));d.append(header);

  const content=el('div',undefined,'algorithm-run-content');d.append(content);this.renderFilmstrip(content);
  const visual=el('section',undefined,'algorithm-run-visual');content.append(visual);const imageHeading=el('div',undefined,'algorithm-run-image-heading');imageHeading.append(el('strong',artifact?artifactTitle(artifact,this.index):'本輪沒有圖像產物'),el('small',artifact?`${artifact.width||'—'} × ${artifact.height||'—'} px`:'保留執行記錄'));visual.append(imageHeading);
  this.viewport=el('div',undefined,'algorithm-run-viewport');this.viewport.setAttribute('aria-label','算法實算圖；滾輪縮放，拖曳平移');visual.append(this.viewport);
  if(artifact&&rasterURL(imageURL(artifact))){this.image=el('img');this.image.alt=artifactTitle(artifact,this.index)+' · 本輪算法保存圖';this.image.draggable=false;this.image.onload=()=>this.camera?this.paintImage():this.fit();const loadingImage=this.image;this.image.onerror=()=>{if(this.image!==loadingImage)return;this.loadError=true;this.image=null;const empty=el('div',undefined,'algorithm-run-empty');empty.append(el('strong','此輪產物無法解碼為圖片'),el('p','已保留產物身份與完整記錄；不以其他輪次的圖替代。'));this.viewport.replaceChildren(empty);const quote=this.dialog.querySelector('.algorithm-run-footer>button');if(quote)quote.disabled=true};this.image.src=imageURL(artifact);this.viewport.append(this.image);this.bindViewport();}
  else{this.image=null;const empty=el('div',undefined,'algorithm-run-empty');empty.append(el('strong',run.status==='FAILED'?'本次程式執行失敗':run.status==='TIMEOUT'?'本次執行逾時':artifact?'圖像已保存，預覽尚未載入':'這次沒有保存圖像'),el('p',errorText(run.error)||present(run.message)||'可展開程式、輸出與錯誤記錄；此處不沿用其他輪次的圖。'));if(run.error||run.traceback||run.stderr)empty.append(this.button('查看完整錯誤',()=>this.showDrawer('logs')));this.viewport.append(empty)}
  const tools=el('div',undefined,'algorithm-run-image-controls'),prev=this.stepButton(-1),next=this.stepButton(1);tools.append(prev,el('small',this.artifacts.length?`${this.index+1} / ${this.artifacts.length}`:'0 / 0'),next,this.glyph('zoom-out','縮小',()=>this.zoomBy(.8)),this.glyph('fit','配適原圖比例',()=>this.fit()),this.button('1:1',()=>this.zoomTo(1)),this.glyph('zoom-in','放大',()=>this.zoomBy(1.25)));this.zoomLabel=el('output','—');tools.append(this.zoomLabel);visual.append(tools);
  const inspector=el('aside',undefined,'algorithm-run-inspector');inspector.setAttribute('aria-label','節點文檔');content.append(inspector);this.renderExplanation(inspector);
  const footer=el('footer',undefined,'algorithm-run-footer'),identity=el('small',`${this.snapshot().historical?'歷史試算':'保存來源'} · ${binding.width||'—'} × ${binding.height||'—'} px · ${(binding.imageSha256||binding.inputSha256||'未提供原圖 SHA').slice(0,20)} · ${run.durationMs!==undefined?Number(run.durationMs).toFixed(0)+' ms':'未提供耗時'}`);identity.title=JSON.stringify(binding,null,2);footer.append(identity);const reference=iconLabelButton(this.button('引用此圖問 Agent',()=>this.reference()),'quote');reference.disabled=!artifact||!rasterURL(imageURL(artifact));footer.append(reference);d.append(footer);
  if(this.rejectedArtifacts.length){const notice=el('small',`${this.rejectedArtifacts.length} 個產物來源與本次運算不一致，未混入圖像。`,'algorithm-run-source-warning');notice.setAttribute('role','status');footer.prepend(notice)}
  if(this.run.procedureTrace?.capture?.mode==='essential'){const notice=el('p','日常檢測未採集完整過程數據；需要時請讓 Agent 對此圖片開啟診斷重跑。新診斷不會補寫歷史觀測。','algorithm-run-capture-notice');notice.setAttribute('role','status');this.dialog.append(notice);}
  this.resizeObserver?.observe(this.viewport);queueMicrotask(()=>{if(this.camera)this.paintImage();else if(this.image?.complete)this.fit()});if(this.drawer)this.showDrawer(this.drawer);
 }
 renderFilmstrip(parent){const strip=el('nav',undefined,'algorithm-run-filmstrip');strip.setAttribute('aria-label','本輪圖像序列');parent.append(strip);const count=4,page=Math.floor(this.index/count),visible=this.artifacts.slice(page*count,page*count+count);for(const [local,artifact]of visible.entries()){const index=page*count+local,button=this.button('',()=>{this.index=index;this.camera=null;this.render()},'algorithm-run-thumbnail');button.setAttribute('aria-label',`第 ${index+1} 張：${artifactTitle(artifact,index)}`);button.setAttribute('aria-pressed',String(index===this.index));if(rasterURL(imageURL(artifact))){const thumb=el('img');thumb.src=imageURL(artifact);thumb.alt='';thumb.draggable=false;button.append(thumb)}else button.append(el('span','無預覽','algorithm-run-thumbnail-empty'));const label=el('span',`${index+1} · ${artifactTitle(artifact,index)}`);label.title=artifactTitle(artifact,index);button.append(label);strip.append(button)}if(!visible.length)strip.append(el('small','本次沒有圖像'));if(this.artifacts.length>count){const pager=el('div',undefined,'algorithm-run-filmstrip-pager'),previous=this.glyph('previous','前四張',()=>{this.index=Math.max(0,(page-1)*count);this.camera=null;this.render()}),next=this.glyph('next','後四張',()=>{this.index=Math.min(this.artifacts.length-1,(page+1)*count);this.camera=null;this.render()});previous.disabled=page===0;next.disabled=(page+1)*count>=this.artifacts.length;pager.append(previous,next);strip.append(pager)}}
 verification(selector){
  if(!record(selector))return {label:'尚未提供檢查引用',value:'未評估',state:'missing'};
  if(selector.kind==='artifact'){const artifacts=rows(this.run.artifacts).filter(a=>sameBinding(a.sourceBinding||a.source,bindingOf(this.run))),matches=artifacts.filter(a=>(!selector.id||a.id===selector.id)&&(!selector.type||(a.type==='json'?'evidence':a.type)===selector.type));return {label:'實際產物',value:matches.length?matches.map((a,i)=>artifactTitle(a,i)).join('、'):'此輪未保存對應產物',state:matches.length?'recorded':'missing'}}
  if(selector.kind==='execution-status')return {label:'執行記錄',value:this.run.status||'未提供',state:this.run.status==='SUCCEEDED'?'recorded':'missing'};
  if(selector.kind==='gate'){const data=this.run.result||{},sets=[data.gates,data.boundaryChecks,data.checks,this.run.gates,this.run.boundaryChecks],check=sets.flatMap(set=>Array.isArray(set)?set:record(set)?Object.entries(set).map(([id,entry])=>record(entry)?{id,...entry}:{id,value:entry}):[]).find(entry=>entry.id===selector.id||entry.name===selector.id),complete=check&&Object.hasOwn(check,'actual')&&Object.hasOwn(check,'threshold');return {label:`程式輸出檢查 · ${selector.id||'未命名'}`,value:check?(!complete?'缺 actual／threshold 比較條件，未驗證；':'')+text(check):'本次程式未輸出此檢查；未評估',state:complete&&check.status==='PASS'?'recorded':'missing',check,complete:!!complete}}
  return {label:'檢查引用',value:'未支援的引用型別；未評估',state:'missing'};
 }
 evidenceBlock(parent,selector){const item=this.verification(selector),box=el('div',undefined,'algorithm-run-observation');box.dataset.state=item.state;box.append(el('small',item.label));box.title=text(item.value);
  if(selector?.kind==='gate'){
   box.title=item.label;
   box.classList.add('algorithm-run-gate');const status=!item.check?'NOT_EVALUATED':!item.complete?'UNVERIFIED':item.check.status||'NOT_EVALUATED',badge=el('strong',status==='PASS'?'程式自檢 PASS':status==='FAIL'?'程式自檢 FAIL':status==='UNVERIFIED'?'未驗證 · 缺比較條件':'未評估','algorithm-run-gate-status');badge.dataset.status=status;box.append(badge);
   if(!item.check)box.append(el('span','本次程式未輸出此檢查；未評估'));
   else{const values=el('dl',undefined,'algorithm-run-gate-values'),add=(label,value)=>{const key=el('dt',label),entry=el('dd',short(value,100));key.title=label;entry.title=text(value);values.append(key,entry)};if(!item.complete)add('缺少欄位',[...(!Object.hasOwn(item.check,'actual')?['actual']:[]),...(!Object.hasOwn(item.check,'threshold')?['threshold']:[])].join('、'));
    for(const row of limitedFacts(item.check.threshold,2))if(Object.hasOwn(item.check,'threshold'))add('條件 · '+row.label,row.value);
    for(const row of limitedFacts(item.check.actual,6))if(Object.hasOwn(item.check,'actual'))add('實際 · '+row.label,row.value);
    box.append(values,this.button('展開完整檢查數據',()=>this.showDrawer('result'),'algorithm-run-gate-expand'));
   }
  }else box.append(el('span',short(item.value,220)));
  parent.append(box);
 }
 renderExplanation(parent){parent.append(nodeDocumentationActions(this.run),renderNodeDocumentation(this.run));}
 bindViewport(){
  const viewport=this.viewport;viewport.onwheel=event=>{event.preventDefault();const rect=viewport.getBoundingClientRect(),point={x:event.clientX-rect.left,y:event.clientY-rect.top};this.zoomBy(Math.exp(-event.deltaY*.002),point)};viewport.onpointerdown=event=>{if(event.button!==0&&event.button!==1)return;event.preventDefault();if(!this.camera)this.fit();this.drag={x:event.clientX,y:event.clientY,left:this.camera?.x||0,top:this.camera?.y||0};viewport.setPointerCapture?.(event.pointerId);viewport.classList.add('panning')};viewport.onpointermove=event=>{if(!this.drag||!this.camera)return;this.camera.x=this.drag.left+event.clientX-this.drag.x;this.camera.y=this.drag.top+event.clientY-this.drag.y;this.camera.fitted=false;this.paintImage()};for(const name of ['pointerup','pointercancel'])viewport.addEventListener(name,()=>{this.drag=null;viewport.classList.remove('panning')});viewport.oncontextmenu=event=>{event.preventDefault();this.showReferenceMenu(event.clientX,event.clientY)};
 }
 imageSize(){const artifact=this.currentArtifact();return {width:artifact?.width||this.image?.naturalWidth||1,height:artifact?.height||this.image?.naturalHeight||1}}
 fit(){if(!this.viewport||!this.image)return;const {width,height}=this.imageSize(),w=this.viewport.clientWidth,h=this.viewport.clientHeight;if(!w||!h)return;const scale=Math.min(w/width,h/height)*.97;this.camera={scale,x:(w-width*scale)/2,y:(h-height*scale)/2,fitted:true};this.rotation=0;this.paintImage()}
 zoomTo(scale,point){if(!this.viewport||!this.image)return;const {width,height}=this.imageSize(),x=point?.x??this.viewport.clientWidth/2,y=point?.y??this.viewport.clientHeight/2,old=this.camera||{scale:1,x:0,y:0},next=Math.max(.01,Math.min(64,scale));this.camera={scale:next,x:x-(x-old.x)/old.scale*next,y:y-(y-old.y)/old.scale*next,fitted:false};this.paintImage()}
 zoomBy(factor,point){if(!this.camera)this.fit();if(this.camera)this.zoomTo(this.camera.scale*factor,point)}
 paintImage(){if(!this.image||!this.camera)return;const {width,height}=this.imageSize(),{scale,x,y}=this.camera;Object.assign(this.image.style,{width:width*scale+'px',height:height*scale+'px',left:x+'px',top:y+'px',transform:`rotate(${this.rotation}deg)`});if(this.zoomLabel)this.zoomLabel.textContent=(scale*100).toFixed(scale<1?1:0)+'%'}
 rotateBy(delta){this.rotation=fullRotation(this.rotation+(Number(delta)||0));this.camera&&(this.camera.fitted=false);this.paintImage()}
 toggleMaximize(force){const on=force===undefined?!this.dialog.classList.contains('is-maximized'):!!force;this.dialog.classList.toggle('is-maximized',on);const b=this.dialog.querySelector('.algorithm-run-maximize');if(b)b.textContent=on?'恢復大小':'最大化';queueMicrotask(()=>{if(this.camera?.fitted)this.fit();else this.paintImage()})}
 showReferenceMenu(x,y){this.dialog.querySelector('.algorithm-run-context-menu')?.remove();const menu=el('div',undefined,'algorithm-run-context-menu');menu.setAttribute('role','menu');Object.assign(menu.style,{left:Math.min(x,innerWidth-230)+'px',top:Math.min(y,innerHeight-65)+'px'});const button=iconLabelButton(this.button('引用此圖問 Agent',()=>{menu.remove();this.reference()}),'quote');button.setAttribute('role','menuitem');menu.append(button);this.dialog.append(menu);button.focus();const dismiss=event=>{if(!menu.contains(event.target)){menu.remove();this.dialog.removeEventListener('pointerdown',dismiss)}};queueMicrotask(()=>this.dialog.addEventListener('pointerdown',dismiss));menu.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();menu.remove()}}}
 showDrawer(section='code'){
  this.drawer=null;this.dialog.querySelector('.algorithm-run-drawer')?.remove();
  if(this.onOpenExternal)return this.onOpenExternal(this.run,section==='result'?'data':section);
  const notice=el('p','程式與完整紀錄請在桌面版透過檔案入口開啟。','algorithm-run-file-notice');notice.setAttribute('role','status');this.dialog.querySelector('.algorithm-run-file-notice')?.remove();this.dialog.append(notice);
 }
}
