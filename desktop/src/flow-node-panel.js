import {sourceFilteredIds} from './source-classification-filter.js';
import {sourceFilterBar} from './source-filter-view.js';
import {createExecutionViewScheduler} from './execution-view-scheduler.js';
import {activeWorkpieceExecution,completedWorkpiece,retainedWorkpieceOutput} from './workpiece-live-state.js';
import {SourceDecisionView} from './source-decision-view.js';
import {flowNodePresentation,sourceCollections} from './flow-node-contract.js';
import './flow-node-panel.css';
import {sourceImageLabels} from './source-image-labels.js';
import {ImageRenderer} from './image-renderer.js';
const list=x=>Array.isArray(x)?x:[],el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function openFlowNodePanel({project,node,flow,onNavigate,onRefresh,onError,onImageManager,onRunInspection,onCancelExecution,onLoadDecisionEvidence}){
 const dialog=el('dialog',undefined,'flow-node-panel'),head=el('header'),close=el('button','×');close.type='button';close.setAttribute('aria-label','關閉節點面板');close.onclick=()=>dialog.close();head.append(el('h2',['source','reference'].includes(node.kind)?(node.kind==='source'?'圖像源':'參考圖集'):flowNodePresentation(project,node,flow).title),close);dialog.append(head);dialog.setAttribute('aria-label','流程節點操作');const epoch=project.epoch;
 const safe=fn=>async()=>{try{await fn()}catch(e){onError?.(e.message);if(dialog.open){let error=dialog.querySelector('[role=alert]');if(!error){error=el('p',undefined,'flow-node-error');error.setAttribute('role','alert');dialog.append(error);}error.textContent=e.message;}}};
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=safe(fn);return b;};
 const jump=id=>{dialog.close();return onNavigate?.(id);};
 if(['source','reference'].includes(node.kind)){
  dialog.classList.add('flow-source-panel');
  const collections=sourceCollections(project,node),tabs=el('div',undefined,'flow-source-collections');let collectionIndex=0;tabs.setAttribute('aria-label','圖像源圖集');collections.forEach((s,i)=>{const tab=button(`${s.title} · ${s.imageIds.length} 張`,()=>{collectionIndex=i;selected=null;gallery.scrollLeft=0;return draw();});tab.setAttribute('aria-pressed',String(i===0));tabs.append(tab);});head.insertBefore(tabs,close);const currentName=el('span',undefined,'flow-source-current-name');head.insertBefore(currentName,close);
  const displayImage=collection=>{const retained=retainedWorkpieceOutput(project),completed=completedWorkpiece(project),id=retained?.imageId||(completed?.sourceId===collection.id?completed.record.imageIds[0]:null);return node.kind==='source'&&collection.imageIds.includes(id)?id:project.image?.id;};
  let selected=node.imageIds?.includes(displayImage(collections[0]))?displayImage(collections[0]):node.imageIds?.[0],busy=false,runningImageId=null,resultReady=false,sourceController=null,evidenceRequestKey=null;const preview=el('figure'),caption=el('figcaption'),renderer=new ImageRenderer({label:'圖像源原圖'});preview.append(renderer.root,caption);const gallery=el('div',undefined,'flow-source-gallery'),nav=el('nav'),message=el('p',node.kind==='reference'?'固定參考圖只預覽，不作待檢工件。':'點選縮圖即切換目前圖片，並執行一次檢測。','flow-source-message');message.setAttribute('aria-live','polite');const pair=el('div',undefined,'flow-source-pair'),evidence=new SourceDecisionView();preview.className='flow-source-original';preview.prepend(el('h3','原圖'));pair.append(preview);if(node.kind==='source')pair.append(evidence.element);const filters=el('div');dialog.append(filters,pair,gallery,nav,message);
  const track=el('div',undefined,'flow-source-track');gallery.append(track);let renderGallery=()=>{},scrollFrame;gallery.addEventListener('scroll',()=>{cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(()=>renderGallery());});dialog.addEventListener('keydown',event=>{if(event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target.closest('input,textarea,select,[contenteditable=true]')||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const ids=sourceFilteredIds(project,collections[collectionIndex]),id=ids[ids.indexOf(selected)+(event.key==='ArrowRight'?1:-1)];if(id)void safe(()=>choose(id))();});
  const sourceExists=id=>(project.data.visualInquiry?.boards||[]).some(b=>b.projectSpaces?.sources?.some(s=>s.id===id));
  const choose=async id=>{
   if(busy||activeWorkpieceExecution(project)){
    if(epoch!==project.epoch)throw Error('專案已切換');
    const collection=collections[collectionIndex];selected=id;
    if(node.kind!=='reference'){if(sourceExists(collection.id))await project.selectSourceImage(collection.id,id);else await project.selectImage(id);}
    message.textContent='已切換瀏覽圖片；目前檢測繼續執行。';onRefresh?.();await draw();return;
   }
   busy=true;runningImageId=id;sourceController=new AbortController();resultReady=false;const collection=collections[collectionIndex];
   try{if(epoch!==project.epoch)throw Error('專案已切換');selected=id;const index=sourceFilteredIds(project,collection).indexOf(id),left=index*184;if(left<gallery.scrollLeft||left+184>gallery.scrollLeft+gallery.clientWidth)gallery.scrollLeft=Math.max(0,left-184);
    await draw();
    if(node.kind==='reference')return;
    if(sourceExists(collection.id)){const choice=await project.selectSourceImage(collection.id,id);if(!choice.selected)throw Error('圖片選取已改變，未啟動舊圖片檢測');}else await project.selectImage(id);
    message.textContent='檢測中…';await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    if(!onRunInspection)throw Error('尚未連接真實檢測執行器');
    await onRunInspection({controller:sourceController,onResultReady:async()=>{if(epoch===project.epoch&&dialog.open){resultReady=true;message.textContent='檢測完成。';await draw();}},units:[{id:crypto.randomUUID(),imageIds:[id]}],...(sourceExists(collection.id)?{sourceId:collection.id}:{})});
    if(epoch!==project.epoch)return;
    if(collection.imageIds.includes(displayImage(collection)))selected=displayImage(collection);
    if(selected!==id){const index=sourceFilteredIds(project,collection).indexOf(selected),left=index*184;if(index>=0&&(left<gallery.scrollLeft||left+184>gallery.scrollLeft+gallery.clientWidth))gallery.scrollLeft=Math.max(0,left-184);}
    message.textContent=project.data.datasetExecutions?.at(-1)?.status==='CANCELLED'?'已停止檢測。':selected!==id?'檢測完成，已準備下一張；點選圖片或執行一次可繼續。':'檢測完成。';
   }catch(error){message.textContent='檢測未完成：'+error.message;throw error;}finally{busy=false;runningImageId=null;sourceController=null;if(dialog.open&&epoch===project.epoch)await draw();}
  };
  const draw=async()=>{const live=activeWorkpieceExecution(project),collection=collections[collectionIndex],ids=sourceFilteredIds(project,collection);filters.replaceChildren(sourceFilterBar(project,collection,()=>safe(async()=>{const ids=sourceFilteredIds(project,collection);if(ids.length&&sourceExists(collection.id))await project.selectSourceImage(collection.id,ids[0]);selected=ids[0];onRefresh?.();await draw();})()));for(const b of filters.querySelectorAll('button,select'))b.disabled=busy;for(const [i,b] of [...tabs.children].entries()){b.disabled=busy;b.setAttribute('aria-pressed',String(i===collectionIndex));}dialog.setAttribute('aria-busy',String(busy));if(!ids.includes(selected))selected=ids[0];nav.replaceChildren();const completed=completedWorkpiece(project),waiting=busy&&!resultReady&&selected===runningImageId||live?.imageIds?.includes(selected)&&!completed?.record.imageIds.includes(selected),lastExecution=project.data.datasetExecutions?.at(-1),label=sourceImageLabels(project,selected,collection.id).last,evidenceKey=JSON.stringify([selected,collection.id,!!waiting,label?.executionId,label?.unitId]);if(waiting){evidenceRequestKey=evidenceKey;pair.setAttribute('aria-busy','true');}const previous=button('‹',()=>choose(ids[ids.indexOf(selected)-1])),next=button('›',()=>choose(ids[ids.indexOf(selected)+1]));previous.setAttribute('aria-label','上一張圖片');next.setAttribute('aria-label','下一張圖片');previous.disabled=ids.indexOf(selected)<=0;next.disabled=ids.indexOf(selected)>=ids.length-1;nav.append(previous,el('span',`${ids.length?ids.indexOf(selected)+1:0} / ${ids.length} 張`),next);
   if(sourceExists(collection.id)&&onImageManager){const manager=button('圖像管理員',()=>{dialog.close();return onImageManager(collection.id)});manager.disabled=busy;nav.append(manager);}
   if(node.kind==='source'&&sourceExists(collection.id)){const source=(project.data.visualInquiry?.boards||[]).flatMap(b=>b.projectSpaces?.sources||[]).find(s=>s.id===collection.id),toggle=button('自動切換',()=>{project.setSourceAutoAdvance(collection.id,!source.autoAdvance);onRefresh?.();return draw()});toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(source.autoAdvance===true));toggle.append(el('span',undefined,'flow-switch-track'));toggle.disabled=busy;toggle.className='flow-source-auto';toggle.title='每次只檢測一張；完成後準備下一張，最後一張回到第一張；不會自動啟動下一次檢測。';nav.append(toggle);}
   if(node.kind==='source'&&(busy||live)&&onCancelExecution){const stop=button('停止檢測（Esc）',()=>{sourceController?.abort();onCancelExecution();stop.disabled=true;message.textContent='停止中 · 等待目前節點結束';});stop.dataset.action='stop-source';nav.append(stop);}
   track.style.width=`${ids.length*184}px`;
   let lastWindow='';renderGallery=()=>{const start=Math.max(0,Math.floor(gallery.scrollLeft/184)-2),visible=ids.slice(start,start+Math.max(16,Math.ceil(gallery.clientWidth/184)+4)),key=[start,selected,busy,lastExecution?.id,lastExecution?.processed].join('|');if(key===lastWindow)return;lastWindow=key;
    const children=[];
    for(const [offset,id] of visible.entries()){
     const image=project.imageRecord(id);if(!image)continue;
     const b=button('',()=>choose(id));b.style.left=`${(start+offset)*184}px`;b.disabled=false;b.title=image.name;b.setAttribute('aria-label',image.name);b.setAttribute('aria-pressed',String(id===selected));b.dataset.imageId=id;
     const img=el('img');img.alt='';const labels=sourceImageLabels(project,id,collection.id),meta=el('div',undefined,'flow-source-meta'),manual=el('small','標註：'+labels.manual.text,'flow-source-label'),last=el('small','實測：'+(node.kind==='reference'?'參考':labels.last?labels.last.text:'未檢測'),'flow-source-label');
     manual.title=labels.manual.reason||manual.textContent;last.title=[last.textContent,labels.last?.at,labels.last?.schemeNote].filter(Boolean).join(' · ');last.dataset.historical=String(labels.last?.historical===true);meta.append(manual,last);b.append(img,meta);children.push(b);
     project.readImageThumbnail(id,{maxDimension:240}).then(value=>{if(img.isConnected&&epoch===project.epoch)img.src=value.dataURL;}).catch(()=>{if(img.isConnected)img.alt='縮圖未載入';});
    }
    // The fixed-width track survives scroll updates: never collapse scrollWidth.
    track.replaceChildren(...children);
   };renderGallery();


   if(selected&&!waiting&&evidenceKey!==evidenceRequestKey){
    evidenceRequestKey=evidenceKey;const imageId=selected,image=project.imageRecord(imageId),data=project.data;
    const current=()=>evidenceKey===evidenceRequestKey&&imageId===selected&&data===project.data&&epoch===project.epoch&&dialog.open;
    pair.setAttribute('aria-busy','true');
    const original=project.readImageAsset(imageId).then(src=>renderer.prepareSource({src,width:image?.width,height:image?.height,alt:image?.name||'選中原圖'}));
    const decision=node.kind==='source'?Promise.resolve(onLoadDecisionEvidence?.({imageId,sourceId:collection.id})).then(model=>evidence.prepare(model||{reasons:[],message:'尚未連接判定依據讀取器'})):Promise.resolve(null);
    Promise.all([original,decision]).then(([frame,prepared])=>{
     if(!current())return;
     // Both detached image elements are decoded. Commit the pair and its
     // identity in the same task; no clear/reset occurs during preparation.
     renderer.commitSource(frame);renderer.source.imageId=imageId;renderer.image.dataset.imageId=imageId;
     if(prepared)void evidence.show(prepared.model,current,{prepared});
     caption.textContent=image?.name||'';currentName.textContent=image?.name||'';currentName.title=currentName.textContent;
     pair.setAttribute('aria-busy','false');
    }).catch(error=>{if(current()){pair.setAttribute('aria-busy','false');message.textContent='圖像準備失敗：'+String(error?.message||error);}});
   }
  };const viewUpdates=createExecutionViewScheduler(()=>{if(dialog.open&&!busy&&epoch===project.epoch)void safe(draw)();},{intervalMs:150});let observed='';const unsubscribe=project.on?.(()=>{if(epoch!==project.epoch){dialog.close();return;}if(busy||!dialog.open)return;const last=project.data.datasetExecutions?.at(-1),key=[project.image?.id,last?.id,last?.status,last?.processed,activeWorkpieceExecution(project)?.phase].join('|');if(key===observed)return;observed=key;const collection=collections[collectionIndex];if(collection.imageIds.includes(displayImage(collection)))selected=displayImage(collection);viewUpdates.request();});dialog.addEventListener('close',()=>{renderer.destroy();evidence.renderer.destroy();cancelAnimationFrame(scrollFrame);viewUpdates.dispose();evidence.clear('');unsubscribe?.();});queueMicrotask(safe(draw));
 }else{
  const model=flowNodePresentation(project,node,flow);dialog.append(el('p',model.purpose,'flow-node-purpose'));if(model.objects.length){const objects=el('section');objects.append(el('h3','判定對象'));for(const o of model.objects)objects.append(button(`${o.title}：${o.value} ${o.unit} ← ${o.source}`,()=>jump(o.from)));dialog.append(objects);}
  if(model.origins?.length){
   const origins=el('section',undefined,'flow-node-origins');origins.append(el('h3',node.kind==='system-exit'?'故障來源':'結果來源'));
   for(const origin of model.origins){
    origins.append(button(`${origin.title} → ${model.title}`,()=>jump(origin.from)));
    if(origin.active&&origin.matchedRuleIds.length)origins.append(el('p','本件命中規則：'+origin.matchedRuleIds.join('、')));
    if(origin.active&&origin.observedMissing.length)origins.append(el('p','本件失效原因：'+origin.observedMissing.map(o=>`${o.metric} · ${o.status}`).join('、')));
    if(origin.active&&origin.conditionEvidence==='unavailable'&&node.kind==='category')origins.append(el('small','已保存本件分類出口；摘要未保存逐條規則命中依據，不能由類別反推。'));
    if(origin.conditions.length){const declared=el('details');declared.append(el('summary','查看上游宣告的到達條件'),el('small','以下是分類規格，並非本件命中紀錄。'));for(const c of origin.conditions)declared.append(el('p',c.label));origins.append(declared);}
   }
   dialog.append(origins);
  }
  if(model.resolution){const policy=el('details');policy.append(el('summary','多條件命中時如何選擇'),el('p','規則處理：'+model.resolution.conflicts?.mode+'；規則優先序：'+(model.resolution.conflicts?.priority||[]).join(' → ')),el('p','最終類別：'+model.resolution.aggregation?.mode+'；類別優先序：'+(model.resolution.aggregation?.priority||[]).join(' → ')),el('small','條件是候選原因；出口由上述規則彙總，只選一個類別。高亮表示保存的最終出口。'));dialog.append(policy);}if(model.branches.length){const routes=el('section',undefined,'flow-node-routes');routes.append(el('h3','條件與去向'));for(const b of model.branches){const row=button(`${b.active?'● ':''}${b.label} → ${b.title}`,()=>jump(b.to));row.title=b.condition;row.dataset.active=String(b.active);routes.append(row);if(b.conditions?.length){const detail=el('details');detail.append(el('summary','條件與本件依據'));for(const c of b.conditions)detail.append(el('p',c.label+(c.ruleId?' · 規則 '+c.ruleId:'')));detail.append(el('small',b.conditionEvidence==='unavailable'?'僅有摘要；沒有保存逐條件命中明細。':'已記錄規則：'+(b.matchedRuleIds?.join('、')||'無數值規則命中')));routes.append(detail);}}if(node.kind==='rule')routes.append(el('small','未命中時繼續按分類規則判定；沒有宣告獨立 False 連線，不會虛構去向。'));dialog.append(routes);}
  dialog.append(el('p','本件結果：'+model.result,'flow-node-result'));if(node.kind==='decision'&&node.executed&&model.branches.length&&!model.branches.some(b=>b.active))dialog.append(el('small','已保存最終分類；摘要未含規則命中明細，未推測分支高亮。'));if(model.missing.length){const details=el('details');details.append(el('summary','無有效量測時的去向'));for(const m of model.missing)details.append(button(`${m.state} → ${m.title}`,()=>jump(m.to)));dialog.append(details);}if(node.kind==='category')dialog.append(el('p','品質：'+({'good':'良品','bad':'不良品','undetermined':'待定'})[project.data.purposeScheme.classificationSpec.categories.find(c=>'scheme::category:'+c.id===node.id)?.quality]));
 }
 dialog.addEventListener('close',()=>{dialog.remove();onRefresh?.();});document.body.append(dialog);dialog.showModal();return dialog;
}
