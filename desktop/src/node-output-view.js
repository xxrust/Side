import {discussReference,mountInputPane,mountWorkspaceHistory} from './focused-workspace.js';
import {resolveNodeOutput,outputImageReference} from './node-output-model.js';
import {artifactDisplayName} from './artifact-presentation.js';
import {iconButton} from './ui-icons.js';
import {ImageRenderer} from './image-renderer.js';
import './node-output-view.css';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const labels={READY:'本件輸出',RUNNING:'正在執行',RESTORE_REQUIRED:'正在載回本件紀錄',WAITING:'等待本件輸出',DECLARED:'尚未執行',PENDING:'等待執行',SKIPPED:'本件已跳過',NOT_FOUND:'未找到目標',FAULT:'執行故障',STALE:'結果已過期'};
export class NodeOutputView{
 constructor(owner){this.owner=owner;this.data=owner.project.data;this.mode='output';this.schemeNodeId=null;this.page=0;this.signature=null;this.lastPixelFrame=null;}
 target(){const v=this.owner,run=v.project.data.algorithmRuns?.find(r=>r.runId===v.board()?.programBinding?.runId);return this.schemeNodeId||run?.schemeNodeId||this.owner.project.purposeScheme?.operatorGraph?.nodes?.at(-1)?.id||null;}
 focus(schemeNodeId,mode='output'){if(this.schemeNodeId!==schemeNodeId){this.page=0;this.lastPixelFrame=null;}this.schemeNodeId=schemeNodeId;this.mode=mode;}
 setMode(mode){this.mode=mode;this.owner.render();window.dispatchEvent(new Event('agentcv-workspace-view-changed'));}
 mount(heading,work,area){
  const v=this.owner,p=v.project;if(this.data!==p.data){this.data=p.data;this.mode='output';this.schemeNodeId=null;this.page=0;this.signature=null;}
  const target=this.target(),nav=el('nav',undefined,'node-display-modes');nav.setAttribute('aria-label','節點顯示模式');
  for(const [mode,label]of [['output','輸入／輸出'],['canvas','討論畫布']]){const b=v.button(label,()=>this.setMode(mode));b.setAttribute('aria-pressed',String(this.mode===mode));b.disabled=mode==='output'&&(!target||!!v.historicalSnapshot);nav.append(b);}heading.append(nav);
  const active=this.mode==='output'&&target&&!v.historicalSnapshot;work.classList.toggle('node-output-mode',!!active);v.panel.classList.toggle('showing-node-output',!!active);if(!active)return;
  this.createSurface(area);this.refresh();
 }
 createSurface(area){
  const v=this.owner,p=v.project,section=el('section',undefined,'node-output-view'),header=el('header'),identity=el('div'),title=el('strong'),name=el('small'),status=el('small'),gallery=el('div',undefined,'node-output-gallery'),card=el('article',undefined,'node-output-card'),heading=el('header',undefined,'node-image-heading'),outputName=el('span'),empty=el('div',undefined,'node-output-empty'),actions=el('div',undefined,'node-output-actions'),pager=el('nav',undefined,'node-output-pages'),history=el('div'),rgb=el('output','RGB —','image-rgb-readout'),renderer=new ImageRenderer({label:'本步輸出'}),image=renderer.image,viewport=renderer.viewport;
  section.setAttribute('aria-label','目前工件的即時輸出');identity.append(title,name,status);header.append(identity);heading.append(el('strong','本步輸出'),outputName);image.draggable=false;empty.setAttribute('role','status');renderer.viewport.append(empty,rgb);const ask=v.button('圈選／詢問',()=>this.toCanvas(this.currentModel,this.currentArtifact,{ask:true}));actions.append(ask);viewport.oncontextmenu=e=>{e.preventDefault();if(!ask.disabled)v.perform(()=>this.toCanvas(this.currentModel,this.currentArtifact,{ask:true}));};viewport.addEventListener('pointermove',event=>{const rect=image.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;if(image.naturalWidth&&x>=0&&y>=0&&x<rect.width&&y<rect.height){const sx=Math.floor(x/rect.width*image.naturalWidth),sy=Math.floor(y/rect.height*image.naturalHeight),sample=document.createElement('canvas');sample.width=sample.height=1;const sc=sample.getContext('2d');try{sc.drawImage(image,sx,sy,1,1,0,0,1,1);const d=sc.getImageData(0,0,1,1).data;rgb.textContent=`RGB ${d[0]}, ${d[1]}, ${d[2]}`}catch{rgb.textContent='RGB —'}}});card.append(heading,renderer.root,actions);gallery.append(card);
  section.append(header,gallery,pager,history);area.append(section);
  this.surface={section,title,name,status,outputName,image,empty,ask,pager,history,renderer,reset:()=>renderer.fit(),hasFrame:false,epoch:p.epoch,boardId:v.boardId};this.surface.input=mountInputPane(v,{},gallery);
 }

 refresh(){
  const v=this.owner,p=v.project,u=this.surface;if(!u?.section.isConnected||u.epoch!==p.epoch||u.boardId!==v.boardId||this.mode!=='output'||v.historicalSnapshot)return false;
  const model=resolveNodeOutput(p,{schemeNodeId:this.target()}),signature=[p.epoch,model.schemeNodeId,model.unitId,model.run?.runId,model.status,model.artifacts.map(a=>a.id+':'+a.sha256).join('|')].join(':');
  if(signature!==this.signature){this.page=0;this.signature=signature;}
  this.currentModel=model;this.page=Math.max(0,Math.min(this.page,model.artifacts.length-1));const a=model.artifacts[this.page];this.currentArtifact=a;
  const set=(element,text)=>{if(element.textContent!==text)element.textContent=text;};
  if(u.section.dataset.status!==model.status)u.section.dataset.status=model.status;if(u.section.dataset.runId!==(model.run?.runId||''))u.section.dataset.runId=model.run?.runId||'';
  set(u.title,model.title||'');set(u.name,p.image?.name||'');set(u.status,labels[model.status]||model.status);set(u.outputName,a?artifactDisplayName(a):'');u.input.update(model);
  const url=a?.dataURL||a?.dataUrl,hasPixels=!!url&&a?.pixelRetention!=='metadata-only';if(hasPixels){if(u.renderer.source?.src!==url){u.renderer.setSource({src:url,width:a.width,height:a.height,alt:artifactDisplayName(a)});u.hasFrame=true;}this.lastPixelFrame={url,label:artifactDisplayName(a),width:a.width,height:a.height};u.image.hidden=false;u.image.alt=artifactDisplayName(a);u.empty.classList.remove('node-output-retained-note');u.empty.hidden=true;u.ask.disabled=false;}
  else if(this.lastPixelFrame){if(u.renderer.source?.src!==this.lastPixelFrame.url){u.renderer.setSource({src:this.lastPixelFrame.url,width:this.lastPixelFrame.width,height:this.lastPixelFrame.height,alt:this.lastPixelFrame.label});u.hasFrame=true;}u.image.hidden=false;u.image.alt=this.lastPixelFrame.label;u.empty.classList.add('node-output-retained-note');u.empty.hidden=false;set(u.empty,`尚無新像素；保留上一個可用輸出：${this.lastPixelFrame.label}`);u.ask.disabled=true;if(a&&a.pixelRetention!=='metadata-only')this.ensureImage(model,a,u.section);else if(!a&&model.status==='RESTORE_REQUIRED')this.ensureRecord(model,u.section);}
  else{u.renderer.clear();u.image.hidden=true;u.empty.classList.remove('node-output-retained-note');u.empty.hidden=false;set(u.empty,a?.pixelRetention==='metadata-only'?'本批次只保留此圖的摘要；需要像素時請重跑此工件或改用完整圖像保留':a?'正在讀取本次產物…':model.reason||'等待本件輸出');u.ask.disabled=true;if(a&&a.pixelRetention!=='metadata-only')this.ensureImage(model,a,u.section);else if(!a&&model.status==='RESTORE_REQUIRED')this.ensureRecord(model,u.section);}
  const pagesKey=model.artifacts.map(a=>a.id).join('|')+':'+this.page;
  if(u.pagesKey!==pagesKey){u.pagesKey=pagesKey;u.pager.replaceChildren();const previous=v.button('‹',()=>{this.page--;this.refresh();}),next=v.button('›',()=>{this.page++;this.refresh();});previous.setAttribute('aria-label','上一組輸出圖');next.setAttribute('aria-label','下一組輸出圖');previous.disabled=this.page===0;next.disabled=this.page>=model.artifacts.length-1;u.pager.append(previous,el('span',`${model.artifacts.length?this.page+1:0} / ${model.artifacts.length}`),next);model.artifacts.forEach((a,i)=>{const b=v.button(String(i+1),()=>{this.page=i;this.refresh();});b.title=artifactDisplayName(a);b.setAttribute('aria-label','查看輸出 '+(i+1));b.setAttribute('aria-pressed',String(i===this.page));u.pager.append(b);});}u.pager.hidden=model.artifacts.length<=1;
  const process=model.run?.artifacts?.filter(a=>a.type==='image'&&!model.artifacts.some(o=>o.id===a.id))||[],processKey=JSON.stringify([model.run?.runId,process.map(a=>[a.id,!!(a.dataURL||a.dataUrl)])]);
  if(u.processKey!==processKey){u.processKey=processKey;u.process?.remove();u.process=null;if(process.length){const details=el('details',undefined,'workspace-process'),strip=el('div',undefined,'workspace-filmstrip');details.append(el('summary',`本步過程圖 · ${process.length} 張`),strip);for(const a of process){const b=v.button(artifactDisplayName(a),()=>this.toCanvas({...model,artifacts:[...model.artifacts,a]},a,{ask:true}),'workspace-history-card'),url=a.dataURL||a.dataUrl;if(url){const img=el('img');img.src=url;img.alt=artifactDisplayName(a);b.prepend(img);}else b.disabled=true;strip.append(b);}u.section.insertBefore(details,u.history);u.process=details;}}
  const historyKey=JSON.stringify((p.data.canvasThreads||[]).map(t=>[t.id,t.status,t.deletedAt,t.question,t.turns?.length]));if(u.historyKey!==historyKey){u.historyKey=historyKey;u.history.replaceChildren();mountWorkspaceHistory(v,u.history,model);}
  return true;
 }

 recordKey(model){return JSON.stringify([this.owner.project.epoch,model.executionId,model.unitId,model.recordRef]);}
 async ensureRecord(model,section,{retry=false}={}){
  const v=this.owner,p=v.project,key=this.recordKey(model),epoch=p.epoch,activeId=p.image?.id||p.data.activeId,nodeId=model.schemeNodeId;
  this.recordLoads||=new Map();this.recordErrors||=new Map();
  // A unit record contains all nodes. Navigating within that same unit must not
  // cancel the shared read and leave the new node waiting on an abandoned promise.
  const isCurrent=()=>{if(v.project!==p||p.epoch!==epoch||(p.image?.id||p.data.activeId)!==activeId)return false;const now=resolveNodeOutput(p,{schemeNodeId:nodeId});return now.executionId===model.executionId&&now.unitId===model.unitId&&JSON.stringify(now.recordRef)===JSON.stringify(model.recordRef);};
  const showError=error=>{if(!section||!isCurrent())return;const empty=section.querySelector('.node-output-empty');if(!empty)return;empty.replaceChildren(el('p','執行紀錄讀取失敗：'+error.message));empty.append(v.button('重試讀取',()=>this.ensureRecord(model,section,{retry:true})));};
  if(retry)this.recordErrors.delete(key);
  if(this.recordErrors.has(key)){showError(this.recordErrors.get(key));return;}
  if(this.recordLoads.has(key))return this.recordLoads.get(key);
  if(!v.onLoadOutputRecord){showError(Error('目前環境未提供紀錄讀取接口'));return;}
  const task=Promise.resolve().then(()=>v.onLoadOutputRecord(model,{epoch,activeId,isCurrent})).then(()=>{if(!isCurrent())return;if(resolveNodeOutput(p,{schemeNodeId:nodeId}).status==='RESTORE_REQUIRED')throw Error('保存紀錄未包含此節點的實算資料，請核對存檔後重試');if(v.opened)v.render();}).catch(error=>{if(isCurrent()){this.recordErrors.set(key,error);if(v.opened)v.render();else showError(error);}}).finally(()=>this.recordLoads.delete(key));
  this.recordLoads.set(key,task);return task;
 }
 async ensureImage(model,artifact,section){
  if(artifact?.pixelRetention==='metadata-only')return;
  const v=this.owner,p=v.project,key=model.run.runId+':'+artifact.id;
  this.loading||=new Set();if(this.loading.has(key)||!v.onLoadOutputImage)return;this.loading.add(key);
  const epoch=p.epoch,activeId=p.image?.id||p.data.activeId;
  const isCurrent=()=>{if(v.project!==p||p.epoch!==epoch||(p.image?.id||p.data.activeId)!==activeId)return false;const now=resolveNodeOutput(p,{schemeNodeId:model.schemeNodeId});return now.run?.runId===model.run.runId&&now.artifacts.some(a=>a.id===artifact.id&&a.sha256===artifact.sha256);};
  try{await v.onLoadOutputImage(model,artifact,{isCurrent});if(isCurrent()&&v.opened)v.render();}
  catch(error){if(isCurrent()&&section?.isConnected){const note=section.querySelector('.node-output-empty');if(note)note.textContent='圖像讀取失敗：'+String(error?.message||error||'未知錯誤');}}
  finally{this.loading.delete(key);}
 }
 async toCanvas(model,artifact,{ask=false,live=false}={}){
  const v=this.owner,reference=outputImageReference(model,artifact);
  if(live)throw Error('討論中的圖固定在提問時；請從即時輸入／輸出查看新執行。');
  return discussReference(v,reference,{schemeNodeId:model.schemeNodeId});
 }

 fromItem(item){const v=this.owner,asset=v.asset(item),run=v.project.data.algorithmRuns?.find(r=>r.runId===asset?.source?.runId),id=item.liveOutput?.schemeNodeId||run?.schemeNodeId;if(!id)return false;this.focus(id);v.render();return true;}
 appendItemActions(menu,item){const v=this.owner,run=v.project.data.algorithmRuns?.find(r=>r.runId===v.asset(item)?.source?.runId),id=item.liveOutput?.schemeNodeId||run?.schemeNodeId;if(!id)return;menu.append(v.button('查看此節點即時輸出',()=>{v.hideMenu();this.fromItem(item);}));if(item.liveOutput)menu.append(v.button('固定目前這張圖',()=>{v.hideMenu();v.project.freezeInquiryLiveOutput(v.boardId,item.id);v.render();}));else menu.append(v.button('另加一張實時圖',()=>{v.hideMenu();const model=resolveNodeOutput(v.project,{schemeNodeId:id}),artifact=model.artifacts.find(a=>a.id===v.asset(item)?.source?.artifactId);if(!artifact)throw Error('本件沒有這個輸出接口，請先執行');return this.toCanvas(model,artifact,{live:true});}));}
}
