import {canvasThreadTurns} from './canvas-thread-history.js';
import {schemeFingerprint} from './purpose-compiler.js';
import {workpieceArtifactPixel} from './workpiece-live-state.js';
import {iconButton} from './ui-icons.js';
import {ImageRenderer} from './image-renderer.js';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
export async function discussReference(view,reference,{schemeNodeId,question}={}){
 if(!reference?.dataURL)throw Error('目前沒有可引用的圖像');
 const epoch=view.project.epoch,projectData=view.project.data;
 if(/^blob:/.test(reference.dataURL)||/^data:image\/(?:bmp|x-ms-bmp);base64,/i.test(reference.dataURL)||/^(?:http:\/\/agentcv-memory\.localhost\/|agentcv-memory:\/\/localhost\/)[a-f0-9]{64}$/.test(reference.dataURL)){
  const image=new Image();image.crossOrigin='anonymous';image.src=reference.dataURL;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const context=canvas.getContext('2d');if(!context)throw Error('無法轉換引用圖像');
  context.drawImage(image,0,0);
  reference={...reference,dataURL:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height};
 }
 const assertCurrent=()=>{if(view.project.epoch!==epoch||view.project.data!==projectData)throw Error('專案已切換，未加入舊引用');};
 assertCurrent();
 let board=view.board();const isDiscussion=board?.title.startsWith('討論 · ');
 if(!isDiscussion){board=view.project.createInquiryBoard({title:'討論 · '+(reference.label||'圖像')});await view.open({boardId:board.id});}
 assertCurrent();
 const selected=new Set(view.selected),result=await view.addReference(reference,{x:Math.max(0,...board.items.map(i=>i.x+i.width))+40,y:40});
 selected.add(result.item.id);view.selected=selected;view.outputView.mode='canvas';view.outputView.schemeNodeId=schemeNodeId||reference.source?.schemeNodeId||null;
 const snapshot=view.snapshot({selectedOnly:true}),image=await view.composite({snapshot}),text=question||'請根據引用的圖像與標註分析問題，先說明觀察依據與適用邊界。';
 assertCurrent();await view.onAsk?.({text,question:text,reference:{kind:'visual_inquiry',boardId:view.boardId,revision:snapshot.revision,snapshot},images:[image],visual:{images:[image],attachments:snapshot.items.map(i=>({assetId:i.assetId,itemId:i.id,label:i.asset.label,source:i.asset.source})),snapshot}});
 view.fit();return result;
}
export function mountInputPane(view,initial,gallery){
 const card=el('article',undefined,'node-output-card node-input-card'),header=el('header',undefined,'node-image-heading'),label=el('strong','本步實際輸入'),choices=el('div',undefined,'node-input-choices'),note=el('small'),actions=el('div',undefined,'node-output-actions'),renderer=new ImageRenderer({label:'本步實際輸入'});choices.setAttribute('aria-label','選擇本步輸入');header.append(label,choices);card.append(header,renderer.root,note,actions);gallery.prepend(card);
 let model=initial,sources=[],selected=0,current=null,generation=0,signature='',originalFrame=null,displayedOriginal=null,destroyed=false;
 const originalFrames=new Set();
 const retireOriginalFrames=()=>{for(const frame of originalFrames)if(destroyed||frame!==originalFrame&&frame!==displayedOriginal){frame.retired=true;frame.display?.dispose();originalFrames.delete(frame);}};
 // This pane holds one already verified display snapshot. New executions can
 // update their inquiry binding without rereading/re-hashing the same original.
 // Image/source edits, undo, project changes and image switching invalidate it.
 const originalKey=record=>[view.project.epoch,record.id,record.width,record.height,record.sha256,record.contentSha256,record.dataURL,JSON.stringify(record.assetRef)];
 const originalURL=record=>{const key=originalKey(record),data=view.project.data;if(originalFrame?.data===data&&key.every((value,index)=>value===originalFrame.key[index]))return originalFrame.promise;const frame={key,data};originalFrame=frame;originalFrames.add(frame);retireOriginalFrames();frame.promise=(view.project.readImageDisplay?view.project.readImageDisplay(record.id):view.project.readImageAsset(record.id).then(src=>({src,dispose(){}}))).then(display=>{frame.display=display;if(frame.retired||destroyed){display.dispose();throw Error('原圖顯示準備已過期');}frame.url=display.src;return frame;});frame.promise.catch(()=>{if(originalFrame===frame)originalFrame=null;retireOriginalFrames();});return frame.promise;};
 const edit=view.button('標記／詢問',async()=>{const reference=current,display=displayedOriginal?.display,epoch=view.project.epoch,data=view.project.data,schemeNodeId=model.schemeNodeId;const dataURL=display?.snapshot?await display.snapshot():reference?.dataURL;if(epoch!==view.project.epoch||data!==view.project.data)throw Error('專案已切換，未加入舊引用');return discussReference(view,{...reference,dataURL},{schemeNodeId});});edit.disabled=true;actions.append(edit);
 const resolve=async(next,source,guard)=>{
  if(!source)return null;
  let ref,originalDisplay;if(source.original){originalDisplay=await originalURL(source.original);ref={label:source.label,kind:'original',dataURL:originalDisplay.url,width:source.original.width,height:source.original.height,source:{kind:'project-original',imageId:source.original.id,inputSha256:source.identity.imageSha256,schemeNodeId:next.schemeNodeId,runId:next.run?.runId,unitId:next.unitId,executionId:next.executionId,coordinateSpace:'original-image-pixels'}};}
  else{let a=source.artifact;const cached=workpieceArtifactPixel(view.project,next.unitId,source.run.runId,a.id);if(!a.dataURL&&!a.dataUrl&&cached)a={...a,dataURL:cached,dataUrl:cached};if(!a.dataURL&&!a.dataUrl){await view.onLoadOutputImage?.({...next,run:source.run},a,guard);a=view.project.data.algorithmRuns.find(r=>r.runId===source.run.runId)?.artifacts.find(x=>x.id===a.id)||a;}const dataURL=a.dataURL||a.dataUrl||workpieceArtifactPixel(view.project,next.unitId,source.run.runId,a.id);if(!dataURL)throw Error('此輸入圖尚未載入');ref={label:source.label,kind:'stage',dataURL,width:a.width,height:a.height,source:{kind:'algorithm-output',schemeNodeId:source.run.schemeNodeId,runId:source.run.runId,artifactId:a.id,artifactSha256:a.sha256,unitId:next.unitId,executionId:next.executionId,coordinateSpace:'algorithm-output-pixels'}};}
  const frame=await renderer.prepareSource({src:ref.dataURL,width:ref.width,height:ref.height,alt:ref.label,role:source.original?'input':undefined});return {ref,frame,originalDisplay};
 };
 const commit=(ready,deferFit=false)=>{if(!ready)return;renderer.commitSource(ready.frame,{deferFit});displayedOriginal=ready.originalDisplay||null;retireOriginalFrames();current=ready.ref;renderer.image.hidden=false;card.dataset.imageId=model.imageId||'';card.dataset.unitId=model.unitId||'';edit.disabled=false;note.textContent='';};
 const prepareReady=next=>{
  const active=view.project.imageRecord(next.imageId),saved=originalFrame;
  if(!active||!saved?.url||saved.data!==view.project.data||!originalKey(active).every((value,index)=>value===saved.key[index]))return null;
  const ref={label:'工件 · '+active.name,kind:'original',dataURL:saved.url,width:active.width,height:active.height,source:{kind:'project-original',imageId:active.id,inputSha256:active.sha256,schemeNodeId:next.schemeNodeId,runId:next.run?.runId,unitId:next.unitId,executionId:next.executionId,coordinateSpace:'original-image-pixels'}};
  const frame=renderer.readySource({src:ref.dataURL,width:ref.width,height:ref.height,alt:ref.label,role:'input'});
  return frame?{ref,frame,originalDisplay:saved}:null;
 };
 const prepare=async(next,guard)=>{const active=view.project.imageRecord(next.imageId);if(!active)throw Error('找不到此工件的原圖，保留目前畫面');return resolve(next,{label:'工件 · '+active.name,original:active,identity:{imageSha256:active.sha256}},guard);};
 const load=async()=>{const ticket=++generation,epoch=view.project.epoch,data=view.project.data,activeId=view.project.image?.id,source=sources[selected];edit.disabled=true;try{
  const guard={activeId,isCurrent:()=>ticket===generation&&epoch===view.project.epoch&&data===view.project.data&&activeId===view.project.image?.id};
  const ready=await resolve(model,source,guard);if(!guard.isCurrent()||!card.isConnected)return;if(ready)commit(ready);else note.textContent='等待本步輸入';
 }catch(e){if(ticket===generation&&card.isConnected)note.textContent=e.message;}};
 const update=(next,{prepared,deferFit=false}={})=>{const active=view.project.imageRecord(next.imageId),key=[view.project.epoch,active?.id,next.schemeNodeId,next.run?.runId,next.unitId].join(':');if(key===signature){if(prepared)commit(prepared,deferFit);return;}model=next;signature=key;generation++;sources=[];selected=0;edit.disabled=true;
  if(active)sources.push({label:'工件 · '+active.name,original:active,identity:{imageSha256:active.sha256}});
  for(const identity of model.run?.sourceBinding?.images||[]){const original=view.project.imageRecord(identity.imageId);if(original&&original.id!==active?.id&&original.sha256===identity.imageSha256)sources.push({label:(Object.values(model.run.referenceInputs||{}).includes(original.id)?'參考 · ':'工件 · ')+original.name,original,identity});}
  for(const [slot,binding]of Object.entries(model.run?.upstreamBindings||{})){const producer=view.project.data.algorithmRuns.find(r=>r.runId===binding.runId),artifact=producer?.artifacts.find(a=>a.id===binding.artifactId&&a.type==='image');if(producer&&producer.workpieceUnit?.id===model.run?.workpieceUnit?.id&&artifact&&(artifact.pixelRetention!=='metadata-only'||workpieceArtifactPixel(view.project,model.unitId,producer.runId,artifact.id)))sources.push({label:slot+' · '+artifact.name,run:producer,artifact});}
  choices.replaceChildren();for(const [i,source]of sources.entries()){const b=view.button(source.label,()=>{selected=i;for(const [j,child]of [...choices.children].entries())child.setAttribute('aria-pressed',String(i===j));void load();});b.setAttribute('aria-pressed',String(i===0));choices.append(b);}if(prepared)commit(prepared,deferFit);else queueMicrotask(load);
 };update(initial);return {update,prepare,prepareReady,card,renderer,restore:()=>renderer.restoreMaximize(),destroy:()=>{destroyed=true;generation++;renderer.destroy();retireOriginalFrames();}};
}
export function mountWorkspaceHistory(view,section,model){
 const bar=el('section',undefined,'workspace-history');bar.setAttribute('aria-label','圖文討論時間線');const heading=el('header');heading.append(el('strong','圖文時間線'));
 const list=el('div',undefined,'workspace-filmstrip');
 const threads=view.project.canvasThreadsContext(),assets=view.state().assets;
 const deleted=(view.project.data.canvasThreads||[]).filter(t=>t.deletedAt).sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt));
 if(deleted.length){const restore=view.button('復原刪除',()=>{view.project.restoreCanvasThread(deleted[0].id);view.render();},'workspace-history-restore');restore.title='復原最近刪除的討論（'+deleted.length+' 段可復原）';heading.append(restore);}
 for(const thread of threads){const turns=canvasThreadTurns(thread,view.project.data.chat),snapshot=turns.at(-1)?.snapshot||thread.snapshot;if(!snapshot?.items?.length&&!thread.question&&!turns.length)continue;const button=view.button('',async()=>{await view.open({boardId:thread.boardId});view.activeThreadId=null;view.outputView.mode='canvas';view.selected=new Set(snapshot?.items?.map(item=>item.id)||[]);view.render();view.fit();},'workspace-history-card');
  const item=snapshot?.items?.[0],asset=assets.find(a=>a.id===item?.assetId)||item?.asset;if(asset?.dataURL){const image=el('img');image.src=asset.dataURL;image.alt=asset.label;button.append(image);}const question=turns[0]?.question||thread.question||'圖像討論';button.append(el('strong',question.slice(0,48)),el('small',`${thread.status==='SENDING'?'處理中':thread.status==='DRAFT'?'草稿':'已保存'} · 固定圖`));button.title=question;
  const entry=el('article',undefined,'workspace-history-entry');entry.dataset.threadId=thread.id;entry.addEventListener('keydown',event=>event.stopPropagation());
  const remove=view.icon('delete','刪除此段圖文討論','',()=>{
   const live=view.project.getCanvasThread(thread.id);if(!live)return;
   if(view.questionDrafts.has(thread.id)&&view.questionDrafts.get(thread.id)!==live.question)view.project.updateCanvasThread(thread.id,{question:view.questionDrafts.get(thread.id)});
   view.project.deleteCanvasThread(thread.id);view.questionDrafts.delete(thread.id);if(view.activeThreadId===thread.id)view.activeThreadId=null;view.render();
  },'workspace-history-delete');
  remove.disabled=thread.status==='SENDING'||thread.turns?.some(t=>t.status==='SENDING');remove.title=remove.disabled?'Agent 正在回覆，結束或停止後可刪除':'刪除此段討論；可復原，共用圖像與實算紀錄保留';
  entry.append(button,remove);list.append(entry);
 }
 if(!list.children.length)list.append(el('small','標記與提問後，圖、問題和回答會一起保留在這裡。'));
 const versions=el('details',undefined,'workspace-versions');versions.append(el('summary','方案版本與執行紀錄'));
 const groups=new Map();for(const execution of view.project.data.datasetExecutions||[]){if(!groups.has(execution.schemeFingerprint))groups.set(execution.schemeFingerprint,[]);groups.get(execution.schemeFingerprint).push(execution);}
 const current=schemeFingerprint(view.project.purposeScheme||{});for(const [basis,executions]of groups){const group=el('section',undefined,'workspace-version-card');const lastRun=executions.at(-1)?.units?.at(-1)?.runIds?.map(id=>view.project.data.algorithmRuns.find(r=>r.runId===id)).filter(Boolean).at(-1),thumb=lastRun?.artifacts?.findLast(a=>a.type==='image'&&(a.dataURL||a.dataUrl));if(thumb){const image=el('img');image.src=thumb.dataURL||thumb.dataUrl;image.alt='此方案的實際執行縮圖';group.append(image);}group.append(el('strong',`${basis===current?'目前方案':'歷史方案'} · ${basis.slice(0,8)}`));for(const e of executions.slice(-12)){const record=el('div');record.append(el('small',`${e.startedAt||''} · ${e.processed} 件 · ${e.status}`));const unit=e.units?.findLast(u=>u.imageIds?.includes(view.project.data.activeId))||e.units?.at(-1);if(unit?.recordRef&&view.onReadInspectionUnit){const button=view.button('預覽此件圖像',()=>previewHistoricalUnit(view,unit.recordRef), 'workspace-record-preview');button.disabled=!view.onReadInspectionUnit;record.append(button);}group.append(record);}versions.append(group);}heading.append(versions);bar.append(heading,list);section.append(bar);
}

export function mountReferenceChips(view,composer){
 const row=el('nav',undefined,'discussion-reference-chips');row.setAttribute('aria-label','目前固定圖與標記');
 for(const item of view.board()?.items||[]){if(view.selected.size&&!view.selected.has(item.id))continue;const asset=view.asset(item);if(!asset)continue;const b=view.button('〔'+asset.label+'〕 · '+item.annotations.length+' 個標記',()=>{view.selected=new Set([item.id]);view.tool='select';view.render();view.fit({selectedOnly:true});});b.title='固定於引用時 · '+JSON.stringify(asset.source);row.append(b);}
 composer.prepend(row);
}
export async function previewHistoricalUnit(view,reference){
 const epoch=view.project.epoch,saved=await view.onReadInspectionUnit(reference);if(epoch!==view.project.epoch)throw Error('專案已切換');
 const figures=(saved.runs||[]).flatMap(run=>(run.artifacts||[]).filter(a=>a.type==='image').map(artifact=>({run,artifact})));const dialog=el('dialog',undefined,'historical-image-preview'),heading=el('header'),close=view.button('關閉',()=>dialog.close());heading.append(el('strong','歷史實算預覽 · '+saved.record?.at),close);const selector=el('select');selector.setAttribute('aria-label','歷史紀錄圖像');for(const [i,f]of figures.entries()){const o=el('option',(f.run.title||f.run.schemeNodeId)+'／'+f.artifact.name);o.value=i;selector.append(o);}const image=el('img'),status=el('p'),ask=view.button('引用並標記',()=>{const f=figures[Number(selector.value)],ref={label:selector.selectedOptions[0].textContent,kind:'stage',dataURL:image.src,width:f.artifact.width,height:f.artifact.height,source:{kind:'historical-algorithm-output',runId:f.run.runId,artifactId:f.artifact.id,artifactSha256:f.artifact.sha256,schemeNodeId:f.run.schemeNodeId,unitId:saved.record.unitId,executionId:saved.executionId,schemeFingerprint:saved.record.schemeFingerprint,coordinateSpace:'algorithm-output-pixels'}};dialog.close();return discussReference(view,ref,{schemeNodeId:f.run.schemeNodeId});});let generation=0;
 const load=async()=>{const n=++generation,f=figures[Number(selector.value)];ask.disabled=true;image.removeAttribute('src');if(!f){status.textContent='本次沒有保存圖像';return;}status.textContent='歷史紀錄，預覽不更改目前方案與工件';try{let url=f.artifact.dataURL||f.artifact.dataUrl;if(!url)url=(await view.onReadInspectionArtifact({...reference,runId:f.run.runId,artifactId:f.artifact.id})).dataURL;if(n!==generation||epoch!==view.project.epoch||!dialog.isConnected)return;image.src=url;ask.disabled=false;}catch(e){status.textContent=e.message;}};selector.onchange=load;dialog.append(heading,selector,image,status,ask);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();void load();
}
