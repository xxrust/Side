import {invoke} from '@tauri-apps/api/core';
import {defaultSourceModel,structureBatches} from '../scripts/source-structure.mjs';
import {createImportTask,imageManagerTasks,updateImportTask,confirmImportMeaning,beginImportDiscussion,finishImportDiscussion,failImportDiscussion} from './image-manager-model.js';
import {buildImportReview,importMeaningDescription} from './image-manager-review.js';
import {renderImportTree} from './image-manager-tree.js';
import {renderChatMarkdown} from './chat-markdown.js';
import './chat-markdown.css';
import './image-manager.css';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const labels={QUEUED:'等待分析',ANALYZING:'分析中',REVIEW:'待確認',PARTIAL:'部分建議待確認',FAILED:'分析未完成',DISABLED:'自動分析已關閉',CONFIRMED:'含義已確認'};
export class ImageManagerView{
 constructor(project,{request=args=>invoke('image_manager_request',{request:args}),refresh=()=>{},notify=()=>{}}={}){Object.assign(this,{project,request,refresh,notify});this.queue=[];this.busy=false;this.collapsed=new Set();this.composers=new Map();this.config={...defaultSourceModel};}
 active(){return typeof document!=='undefined'&&!!document?.documentElement?.isConnected;}
 task(id=this.taskId){return imageManagerTasks(this.project).find(t=>t.id===id);}
 enqueue(sourceId,images,fileStructure,{open=false,autoAnalyze=true}={}){const id=createImportTask(this.project,sourceId,images,fileStructure);if(open)this.open(sourceId);if(this.task(id).status==='FAILED'){this.refresh();this.notify(this.task(id).errors[0]);return id;}if(!autoAnalyze){updateImportTask(this.project,id,{status:'REVIEW'});this.refresh();return id;}this.queue.push({id,data:this.project.data});this.refresh();this.notify('圖像管理員已收到匯入結構，正在分析…');void this.process();return id;}
 recoverMissingImports(){
  const imported=new Set((this.project.data.events||[]).filter(e=>e.action==='images_imported').map(e=>e.image_id));let count=0;
  for(const source of (this.project.data.visualInquiry?.boards||[]).flatMap(b=>b.projectSpaces?.sources||[])){
   if(imageManagerTasks(this.project,source.id).length||!source.imageIds.some(id=>imported.has(id)))continue;
   const images=source.imageIds.map(id=>this.project.imageRecord(id)).filter(Boolean);if(!images.length||!images.every(i=>i.source_relative_path))continue;
   this.enqueue(source.id,images);count++;
  }return count;
 }
 async process(){if(this.busy)return;this.busy=true;try{while(this.queue.length){const {id,data}=this.queue.shift();const current=()=>this.active()&&this.project.data===data&&this.task(id);if(!current())continue;try{const {config}=await this.request({mode:'config'});if(!current())continue;this.config=config;if(!config.enabled){updateImportTask(this.project,id,{status:'DISABLED'});this.notify('圖像管理員自動分析已關閉；可在模型設定開啟。');continue;}updateImportTask(this.project,id,{status:'ANALYZING',suggestions:[],models:[],errors:[]});this.refresh();if(this.dialog?.open&&this.taskId===id)this.render();const t=this.task(id),suggestions=[],models=[],errors=[],messages=[];for(const structure of structureBatches(t.structure)){if(!current())break;try{const response=await this.request({mode:'analyze',structure});if(!current())break;suggestions.push(...response.groups);models.push(response.model);if(response.message)messages.push(response.message);}catch(e){errors.push(String(e.message||e));break;}}
 if(current()){updateImportTask(this.project,id,{status:errors.length?(suggestions.length?'PARTIAL':'FAILED'):'REVIEW',suggestions,models,errors,...(messages.length?{conversation:[...(t.conversation||[]),{id:crypto.randomUUID(),role:'assistant',text:messages.join('\n\n').slice(0,16000),at:new Date().toISOString()}]}:{})});this.notify(errors.length?'圖像管理員未完成全部分析；可重試或人工填寫。':'圖像管理員已閱讀檔案結構，可以直接對話。');}
 }catch(e){if(current()){updateImportTask(this.project,id,{status:'FAILED',errors:[String(e.message||e)]});this.notify('圖像管理員啟動失敗：'+String(e.message||e));}}finally{const orphan=this.task(id);if(this.active()&&this.project.data!==data&&orphan&&['QUEUED','ANALYZING'].includes(orphan.status))updateImportTask(this.project,id,{status:'FAILED',errors:['專案或撤銷狀態已變更，舊分析未套用；可重新分析。']});if(this.active())this.refresh();if(this.active()&&this.dialog?.open&&this.taskId===id)this.render();}}}finally{this.busy=false;}}
 retry(){const t=this.task();if(!t||['QUEUED','ANALYZING'].includes(t.status))return;this.errorMessage='';if(t.status==='CONFIRMED'){const images=t.structure.files.map(f=>{const i=this.project.imageRecord(f.imageId);return i?{...i,source_relative_path:f.path}:null;}).filter(Boolean);this.taskId=this.enqueue(t.sourceId,images);this.render();return;}updateImportTask(this.project,t.id,{status:'QUEUED'});this.queue.push({id:t.id,data:this.project.data});this.render();void this.process();}
 presentPending(){
  if(this.dialog?.open)return false;
  if(document.querySelector('dialog[open]')){if(!this.pendingPresentationListener){this.pendingPresentationListener=()=>{if(!document.querySelector('dialog[open]')){document.removeEventListener('close',this.pendingPresentationListener,true);this.pendingPresentationListener=null;this.presentPending();}};document.addEventListener('close',this.pendingPresentationListener,true);}return false;}
  const sources=(this.project.data.visualInquiry?.boards||[]).flatMap(b=>b.projectSpaces?.sources||[]),task=[...imageManagerTasks(this.project)].reverse().find(t=>(!t.presentedAt||t.presentationVersion!==2)&&t.status!=='CONFIRMED'&&sources.some(s=>s.id===t.sourceId&&t.structure.files.some(f=>s.imageIds.includes(f.imageId))));
  if(!task)return false;this.open(task.sourceId,task.id);return true;
 }
 open(sourceId,taskId){this.sourceId=sourceId;this.taskId=taskId||imageManagerTasks(this.project,sourceId).at(-1)?.id;this.tab='conversation';this.showFiles=false;this.reviewLimit=8;this.groupId=null;this.errorMessage='';this.query='';this.collapsed.clear();if(this.dialog){this.dialog.remove();}const dialog=el('dialog',undefined,'image-manager');this.dialog=dialog;dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);this.render();dialog.showModal();const task=this.task();if(task)updateImportTask(this.project,task.id,{presentedAt:new Date().toISOString(),presentationVersion:2});requestAnimationFrame(()=>dialog.querySelector('textarea:not(:disabled)')?.focus());}
 button(text,action){const b=el('button',text);b.type='button';b.onclick=()=>{try{const result=action();if(result?.catch)result.catch(e=>this.error(e));}catch(e){this.error(e)}};return b;}
 error(e){this.errorMessage=String(e.message||e);this.render();}
 draft(t){return structuredClone(t.draft||t.decisions||{});}
 render(){
  const d=this.dialog;if(!d||!this.active())return;const focused=d.querySelector('textarea')===document.activeElement,selection=focused?[document.activeElement.selectionStart,document.activeElement.selectionEnd]:null;d.replaceChildren();const header=el('header'),controls=el('div');controls.append(this.button(this.tab==='model'?'返回對話':'模型設定',()=>{this.tab=this.tab==='model'?'conversation':'model';this.render();if(this.tab==='model')void this.loadModels();}),this.button('關閉',()=>d.close()));header.append(el('strong','圖像管理員'),controls);d.append(header);
  if(this.errorMessage)d.append(el('p',this.errorMessage,'image-manager-error'));if(this.tab==='model'){this.renderSettings(d);return;}
  const tasks=imageManagerTasks(this.project,this.sourceId);if(!tasks.length){d.append(el('p','匯入圖片後，我會先與你釐清目錄和分類的含義。'));const source=(this.project.data.visualInquiry?.boards||[]).flatMap(b=>b.projectSpaces?.sources||[]).find(s=>s.id===this.sourceId),images=(source?.imageIds||[]).map(id=>this.project.imageRecord(id)).filter(Boolean);if(images.length)d.append(this.button('開始整理這批圖片',()=>{this.taskId=this.enqueue(this.sourceId,images);this.render();}));return;}
  const chooser=el('select');chooser.setAttribute('aria-label','圖像管理員任務');for(const t of [...tasks].reverse()){const o=el('option',`${new Date(t.createdAt).toLocaleString()} · ${t.structure.totalImages} 張`);o.value=t.id;chooser.append(o);}chooser.value=this.taskId||tasks.at(-1).id;this.taskId=chooser.value;chooser.onchange=()=>{this.taskId=chooser.value;this.groupId=null;this.collapsed.clear();this.query='';this.reviewLimit=8;this.render();};
  const t=this.task(),groups=t.structure.groups,selected=groups.find(g=>g.id===this.groupId)||groups[0];this.groupId=selected.id;
  const status=el('div',undefined,'image-manager-summary');const attachment=this.button(`▸ 匯入資料 · ${t.structure.totalImages} 張`,()=>{this.showFiles=!this.showFiles;this.render();});attachment.setAttribute('aria-expanded',String(!!this.showFiles));status.append(attachment,el('small',t.discussionStatus==='SENDING'?'正在回覆…':['QUEUED','ANALYZING'].includes(t.status)?'正在閱讀檔案結構…':t.models?.at(-1)?.modelId||this.config.modelId));d.append(status);
  const columns=el('div',undefined,'image-manager-columns'),tree=el('aside',undefined,'image-manager-tree'),body=el('section',undefined,'image-manager-editor'),search=el('input'),treeRows=el('div');search.placeholder='搜尋資料夾';search.setAttribute('aria-label','搜尋匯入目錄');search.value=this.query||'';
  const populate=()=>{treeRows.replaceChildren(renderImportTree({groups,selectedId:selected.id,query:search.value,collapsed:this.collapsed,onSelect:id=>{this.groupId=id;this.render();this.dialog.querySelector(`[data-group-id="${id}"] .image-manager-folder-name`)?.focus();},onToggle:id=>{if(this.collapsed.has(id))this.collapsed.delete(id);else this.collapsed.add(id);populate();treeRows.querySelector(`[data-group-id="${id}"] .image-manager-folder-name`)?.focus();}}));};search.oninput=()=>{this.query=search.value;populate();};populate();if(tasks.length>1)tree.append(chooser);tree.append(el('strong','匯入目錄'),search,treeRows,el('small','數字包含子資料夾。點選資料夾，直接在下方說明想調整的地方。'));const showTree=this.showFiles;if(showTree)columns.append(tree);else columns.classList.add('chat-only');columns.append(body);d.append(columns);
  this.renderConversation(body,t,selected);if(focused)requestAnimationFrame(()=>{const input=d.querySelector('textarea:not(:disabled)');if(input){input.focus();input.setSelectionRange(...selection);}});
 }
 renderConversation(body,t,selected){
  body.classList.add('is-conversation');
  const scope=el('div',undefined,'image-manager-scope');scope.append(el('small','引用資料夾'),el('strong',selected.path),this.button('取消引用',()=>{this.groupId=null;this.render();}));if(selected.path)body.append(scope);const feed=el('div',undefined,'image-manager-conversation');feed.setAttribute('role','log');feed.setAttribute('aria-label','本批圖片的整理對話');
  const messages=(t.conversation||[]).filter(m=>m.origin!=='saved-import-questions');

  for(const message of messages){const bubble=el('article',undefined,'image-manager-message '+message.role);bubble.append(el('small',(message.role==='user'?'你':'圖像管理員')+(message.at?' · '+new Date(message.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'')),message.role==='assistant'?renderChatMarkdown(message.text):el('p',message.text));if(message.role==='user'&&message.groupId){const g=t.structure.groups.find(g=>g.id===message.groupId);bubble.append(el('small','關注：'+(g?.path||'全部圖片')));}feed.append(bubble);}
  for(const error of [...(t.errors||[]),...(t.discussionError?[t.discussionError]:[])])feed.append(el('p',error,'image-manager-error'));
  if(t.discussionStatus==='SENDING')feed.append(el('p','正在回覆…','image-manager-status'));
  const review=this.renderReview(t);if(review)feed.append(review);body.append(feed);requestAnimationFrame(()=>{if(feed.isConnected)feed.scrollTop=feed.scrollHeight;});
  const composer=el('form',undefined,'image-manager-composer'),input=el('textarea'),actions=el('div'),locked=['QUEUED','ANALYZING'].includes(t.status)||t.discussionStatus==='SENDING';input.setAttribute('aria-label','告訴圖像管理員資料的含義');input.placeholder='直接聊聊你的想法…';input.rows=3;input.maxLength=4000;input.value=this.composers.get(t.id)||'';input.disabled=t.discussionStatus==='SENDING';input.oninput=()=>this.composers.set(t.id,input.value);input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();composer.requestSubmit();}};
  const send=el('button','傳送');send.type='submit';send.disabled=locked;actions.append(el('small','Enter 傳送 · Shift+Enter 換行'),send);composer.append(input,actions);composer.onsubmit=e=>{e.preventDefault();if(locked)return;void this.sendDiscussion(t.id,input.value).catch(error=>this.error(error));};body.append(composer);
 }
 async sendDiscussion(id,text){
  const t=this.task(id);if(!text.trim())return;this.errorMessage='';
  const data=this.project.data,groupId=this.groupId,turnId=beginImportDiscussion(this.project,id,text,this.draft(t),groupId),current=()=>this.active()&&this.project.data===data&&this.task(id)?.discussionTurnId===turnId;
  this.composers.set(id,'');this.render();this.refresh();
  try{
   const groups=[],messages=[],models=[],notes=[];
   for(const structure of structureBatches(t.structure)){
    if(!current())return;const ids=new Set(structure.directories.map(g=>g.id)),history=(t.conversation||[]).filter(m=>m.origin!=='saved-import-questions').map(m=>({role:m.role,text:((m.groupId?'[當時關注目錄：'+(t.structure.groups.find(g=>g.id===m.groupId)?.path||'全部圖片')+']\n':'')+m.text).slice(0,8000)})),draft=Object.fromEntries(Object.entries(t.draft||{}).filter(([key])=>ids.has(key)));let conversation=history.slice(-16);const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
    const request={mode:'discuss',structure,discussion:{messages:conversation,draft,notes:t.notes||'',saved:t.confirmation?{at:t.confirmation.at,groups:Object.fromEntries(Object.entries(t.decisions||{}).filter(([key])=>ids.has(key)))}:null,groupId:ids.has(groupId)?groupId:null}};
    while(bytes(request)>118000&&conversation.length>1){conversation.shift();}
    if(bytes(request)>118000)throw Error('這個目錄的對話內容過大，請先縮短本輪說明');
    const response=await this.request(request);if(!current())return;groups.push(...response.groups);messages.push(response.message);models.push(response.model);if(response.notes)notes.push(response.notes);
   }
   if(!current())return;finishImportDiscussion(this.project,id,turnId,{groups,message:messages.join('\n\n').slice(0,16000),models,...(notes.length?{notes:[...new Set(notes)].join('\n\n').slice(0,12000)}:{})});
  }catch(error){if(current())failImportDiscussion(this.project,id,turnId,error);throw error;}
  finally{if(this.active()){if(this.project.data!==data&&this.task(id)?.discussionStatus==='SENDING')failImportDiscussion(this.project,id,turnId,Error('專案或撤銷狀態已變更；舊回覆未套用。'));this.refresh();if(this.dialog?.open&&this.taskId===id)this.render();}}
 }
 focusRevision(groupId=null,name='這份整理'){
  this.groupId=groupId;this.render();requestAnimationFrame(()=>{const input=this.dialog?.querySelector('textarea');if(!input)return;if(!input.value){input.value=`${name}，我想改成：`;this.composers.set(this.taskId,input.value);}input.focus();input.setSelectionRange(input.value.length,input.value.length);});
 }
 renderReview(t){
  const review=buildImportReview(this.project,t);if(!review.hasProposal)return null;
  const card=el('section',undefined,'image-manager-review'),header=el('header'),title=el('div');card.setAttribute('aria-label','圖片整理結果');
  title.append(el('strong',review.saved?'已保存的圖片標記':'這樣整理，可以嗎？'),el('small',`${review.count} 張圖片${review.saved&&t.confirmation?.at?' · '+new Date(t.confirmation.at).toLocaleString():''}${review.missing?` · ${review.missing} 張已移出此圖像源`:''}`));
  const state=el('span',review.saved?'✓ 已保存':'尚未保存','image-manager-review-state');state.classList.toggle('saved',review.saved);header.append(title,state);card.append(header);
  const rows=el('div',undefined,'image-manager-review-rows'),locked=['QUEUED','ANALYZING'].includes(t.status)||t.discussionStatus==='SENDING';
  for(const row of review.rows.slice(0,this.reviewLimit||8)){const item=el('div',undefined,'image-manager-review-row'),name=el('div'),detail=el('div'),edit=this.button('修改',()=>this.focusRevision(row.id,`「${row.name}」這 ${row.count} 張`));name.append(el('strong',row.name),el('small',`${row.count} 張`));name.title=row.path;detail.append(el('p',importMeaningDescription(row.fields,row)));edit.disabled=locked;edit.setAttribute('aria-label',`修改 ${row.name} 的整理`);item.append(name,detail,edit);rows.append(item);}card.append(rows);
  if(review.rows.length>(this.reviewLimit||8))card.append(this.button(`再顯示 ${Math.min(8,review.rows.length-(this.reviewLimit||8))} 組`,()=>{this.reviewLimit=(this.reviewLimit||8)+8;this.render();}));
  if(!review.saved){const actions=el('div',undefined,'image-manager-review-actions'),change=this.button('我想調整',()=>this.focusRevision()),save=this.button('確認保存',()=>{const receipt=confirmImportMeaning(this.project,t.id,this.draft(t));this.refresh();this.errorMessage='';this.notify(`已保存 ${receipt.stored} 張圖片的標記`);this.render();});save.classList.add('primary');save.disabled=locked||!review.count;change.disabled=locked;actions.append(change,save);card.append(actions);}
  return card;
 }
 async loadModels(){this.settingsLoading=true;this.render();try{const response=await this.request({mode:'models'});this.config=response.config;this.models=response.models;this.errorMessage='';}catch(e){this.error(e);}finally{this.settingsLoading=false;if(this.dialog?.open&&this.tab==='model')this.render();}}
 renderSettings(d){d.append(el('p','圖像管理員使用目前 Agent 執行器的帳戶，模型可獨立設定；只讀取檔案結構摘要，不傳圖片像素。'));const select=el('select');select.setAttribute('aria-label','圖像管理員模型');const models=[...(this.models||[])];if(!models.some(m=>m.provider===this.config.provider&&m.modelId===this.config.modelId))models.unshift({...this.config,name:this.config.modelId+'（目前設定，待核對可用性）'});for(const m of models){const o=el('option',`${m.name} · ${m.provider}`);o.value=JSON.stringify([m.provider,m.modelId]);select.append(o);}select.value=JSON.stringify([this.config.provider,this.config.modelId]);const enabled=el('input');enabled.type='checkbox';enabled.checked=this.config.enabled;const label=el('label','匯入後自動分析檔案結構');label.prepend(enabled);d.append(select,label,this.button('保存管理員設定',async()=>{const [provider,modelId]=JSON.parse(select.value);const response=await this.request({mode:'save',config:{provider,modelId,enabled:enabled.checked}});this.config=response.config;this.notify('圖像管理員設定已保存；主對話模型未改動。');this.render();}));for(const control of d.querySelectorAll('select,input,footer button'))control.disabled=!!this.settingsLoading;const save=d.lastElementChild;if(save?.tagName==='BUTTON')save.disabled=!!this.settingsLoading||!this.models;}
}
