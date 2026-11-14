import {nodeDocumentation} from './node-documentation.js';
import {activeWorkpieceExecution} from './workpiece-live-state.js';
import {workpieceArtifactPixel} from './workpiece-live-state.js';
import {openFlowNodePanel} from './flow-node-panel.js';
import {openOperatorTopology} from './operator-topology-view.js';
import {buildCurrentSchemeFlow} from './current-scheme-flow.js';
import {programScope,engineeringFlow} from './program-scope.js';
import {ProgramFlowMap} from './program-flow-map.js';
import {iconButton} from './ui-icons.js';
import {renderNodeDocumentation,nodeDocumentationActions} from './node-documentation-view.js';
import {buildProgramFlow as buildDetachedProgramFlow,programFlowForAsset,programFlowNode} from './program-flow.js';
import './program-flow-view.css';

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const labels={NOT_FOUND:'正常執行，目標未找到',FAULT:'執行故障',BRANCH_NOT_SELECTED:'本件未選分支',DECLARED:'已宣告，未執行',SUCCEEDED:'已執行',FAILED:'程式錯誤',TIMEOUT:'執行逾時',SKIPPED:'未執行',RUNNING:'執行中',UNKNOWN:'紀錄未知'};
const copy=x=>JSON.parse(JSON.stringify(x));
// Rendering reads execution facts; edits go through the project's commands.
const buildProgramFlow=(project,options)=>buildDetachedProgramFlow(project,{...options,shareImmutableFacts:true});
/** Navigation is derived solely from saved executions. Each node has its own
 * editable inquiry board; navigation never rewrites code, outputs or the answer. */
export class ProgramFlowView{
 constructor(owner){this.owner=owner;this.topologyRequest=0;this.page=0;this.selectedId=null;this.runId=null;this.section='tool';this.expanded=new Set();this.cameras=new Map();this.navigation=false;this.request=0;this.evidencePage=0;this.textPage=0;this.localGraph={expanded:false,x:10,y:10,inPage:0,outPage:0};}
 button(text,fn,cls){return this.owner.button(text,fn,cls);}
 refreshFlow(){
  const v=this.owner;if(this.data!==v.project.data){this.data=v.project.data;this.runId=null;this.selectedId=null;this.navigation=false;this.expanded.clear();this.cameras.clear();this.page=0;this.map?.destroy();this.map=null;this.lastBoardId=null;this.evidenceNodeId=null;this.detailsOpen=false;this.request++;this.pending=null;this.pendingTarget=null;}
  const board=v.board(),binding=board?.programBinding,runs=v.project.data.algorithmRuns||[];
  if(!this.pending&&board?.id!==this.lastBoardId){this.evidenceNodeId=null;this.lastBoardId=board?.id;if(binding){this.selectedId=binding.nodeId;this.runId=binding.runId;}else{this.selectedId=null;this.runId=null;}this.evidencePage=0;this.textPage=0;this.fullText=false;}
  if(this.pendingTarget){this.selectedId=this.pendingTarget.id;this.runId=this.pendingTarget.runId;}
  const boundRun=(this.pendingTarget&&runs.find(run=>run.runId===this.pendingTarget.runId))||(binding&&runs.find(run=>run.runId===binding.runId)),imageId=boundRun?.sourceBinding?.images?.[0]?.imageId||v.project.image?.id;
  // Selecting a run only needs provenance metadata. Constructing every saved
  // trace here copied historical JSON artifacts on every progress refresh,
  // even when the current scheme supplies the displayed graph below.
  const matching=runs.filter(run=>!imageId||(run.sourceBinding?.images||[]).some(image=>image.imageId===imageId));
  if(!binding&&!this.pending)this.runId=matching.at(-1)?.runId||null;
  if(!matching.some(run=>run.runId===this.runId))this.runId=matching.at(-1)?.runId||null;
  const canonical=v.project.data.purposeScheme?.execution?.unit==='workpiece',schemeFlow=buildCurrentSchemeFlow(v.project,{runId:activeWorkpieceExecution(v.project)||canonical&&!binding&&!this.pendingTarget?undefined:this.runId});this.schemeFlow=schemeFlow.available;
  const all=schemeFlow.available?schemeFlow.flow:buildProgramFlow(v.project,{imageId}),roots=all.roots.map(id=>programFlowNode(all,id));
  this.flow=schemeFlow.available?schemeFlow.flow:this.runId?buildProgramFlow(v.project,{runId:this.runId}):{nodes:[],edges:[],roots:[],diagnostics:[]};
  this.flowViewKey=schemeFlow.available?schemeFlow.key:this.runId;
  if(!schemeFlow.available&&schemeFlow.reason?.startsWith('STALE_'))this.flow.diagnostics.push({code:schemeFlow.reason,message:schemeFlow.message});
  if(!programFlowNode(this.flow,this.selectedId))this.selectedId=this.flow.nodes.find(n=>n.actualNodeId===this.selectedId||n.definition&&n.runId&&n.runId===this.runId)?.id||this.flow.roots.find(id=>programFlowNode(this.flow,id)?.runId===this.runId)||this.flow.roots[0]||null;
  return schemeFlow.available?this.flow.roots.map(id=>programFlowNode(this.flow,id)):roots;
 }
 sync(){
  const v=this.owner,steps=document.getElementById('steps');if(!steps?.parentElement)return;
  const active=v.opened&&v.embedded&&!v.historicalSnapshot;document.body.classList.toggle('canvas-program-mode',active);
  if(!active){this.map?.collapse();this.host?.remove();this.host=null;steps.hidden=false;return;}
  const roots=this.refreshFlow();this.runRoots=roots;
  if(!this.map)this.map=new ProgramFlowMap({onSurfaceChange:()=>queueMicrotask(()=>{if(v.opened&&v.area&&v.currentLocalThread()?.reference?.kind==='program_flow')v.syncLocalQuestion();}),loadImagePreview:id=>v.project.readImageThumbnail(id,{maxDimension:200}),onSelect:id=>v.perform(()=>this.openNode(id)),onContextMenu:(id,event)=>this.contextMenu(id,event),onError:error=>v.onError?.(error.message||String(error)),onCameraChange:()=>window.dispatchEvent(new Event('agentcv-workspace-view-changed'))});
  if(!this.host){
   this.versionSignature=null;this.host=el('section',undefined,'program-flow-rail');this.host.setAttribute('aria-label','實際程式流程');steps.after(this.host);
   this.projectToggle=this.button('',()=>{},'program-project-toggle');
   this.graphHeading=el('div',undefined,'program-flow-heading');this.graphHeading.append(el('strong','程式流程'));
   this.runButton=iconButton(this.button('',()=>{const root=this.flow?.roots?.find(id=>programFlowNode(this.flow,id)?.runId===this.runId)||this.flow?.roots?.[0];if(root)return this.openNode(root);}), 'overlay','整段程序畫板');this.diagnosticButton=iconButton(this.button('',()=>v.onOpenAlgorithmRecord?.({runId:this.runId})), 'help','查看流程紀錄缺漏');this.graphHeading.append(this.diagnosticButton,this.runButton);
   this.empty=el('p','在圖上圈畫並詢問 Agent。實際執行後，程序、分支與輸出會出現在這裡。','program-empty');this.empty.onclick=()=>this.map.expand();this.host.addEventListener('click',event=>{if(event.target===this.host)this.map.expand();});
   this.actions=el('div',undefined,'program-flow-actions');
   const selected=()=>programFlowNode(this.flow,this.selectedId)||programFlowNode(this.flow,this.flow?.roots?.[0]);
   this.canvasButton=iconButton(this.button('',()=>{const node=selected();if(node)return this.openNode(node.id);}), 'images','節點畫板');
   this.evidenceButton=iconButton(this.button('',()=>{if(this.detailsOpen){this.detailsOpen=false;this.evidenceNodeId=null;v.render();}else{const node=selected();if(node)this.openEvidence(node.id);}}), 'info','節點文檔');
   this.codeButton=iconButton(this.button('',()=>{const node=selected();if(node?.runId)return v.onOpenAlgorithmRecord?.({runId:node.runId});if(node?.boundary)return this.openBoundary(node);if(node?.definition)return this.openDefinition(node);}), 'file','程式與紀錄');
   this.actions.append(this.canvasButton,this.evidenceButton,this.codeButton);this.host.append(this.projectToggle,this.graphHeading,this.empty,this.map.element,this.actions);
  }else if(this.map.element.parentElement!==this.host)this.host.insertBefore(this.map.element,this.actions);
  this.navigation=false;this.projectToggle.hidden=true;this.host.classList.remove('project-navigation');steps.hidden=true;
  for(const item of [this.graphHeading,this.map.element,this.actions])item.hidden=this.navigation||!roots.length;this.empty.hidden=this.navigation||!!roots.length;
  if(this.navigation)return;
  const heading=this.graphHeading.querySelector('strong'),headingText=this.schemeFlow?'方案流程':'程式流程';if(heading.textContent!==headingText)heading.textContent=headingText;const root=programFlowNode(this.flow,this.flow.roots?.find(id=>programFlowNode(this.flow,id)?.runId===this.runId)||this.flow.roots?.[0]);this.runButton.setAttribute('aria-pressed',String(this.selectedId===root?.id));

  this.evidenceButton.setAttribute('aria-pressed',String(!!this.detailsOpen));for(const b of [this.runButton,this.canvasButton,this.evidenceButton,this.codeButton])b.disabled=!roots.length;
  const currentRun=this.runId,updateDiagnostics=()=>{if(!this.host||this.runId!==currentRun)return;const diagnostics=[...(this.flow.diagnostics||[]),...(this.map.geometry?.diagnostics||[])];this.diagnosticButton.hidden=!diagnostics.length;this.diagnosticButton.title=diagnostics.map(d=>d.message||d.code).join('\n');};
  const boundarySelected=programFlowNode(this.flow,this.selectedId)?.boundary;this.codeButton.disabled=!!boundarySelected||!roots.length;const projection=engineeringFlow(this.flow);updateDiagnostics();this.map.update({flow:projection,selectedId:projection.owner(this.selectedId),runId:this.flowViewKey||this.runId}).then(updateDiagnostics);
 }
 openBoundary(node){this.boundaryDialog?.close();this.boundaryDialog=openFlowNodePanel({project:this.owner.project,node,flow:this.flow,onImageManager:this.owner.onImageManager,onNavigate:id=>this.openNode(id),onRefresh:()=>this.owner.render(),onError:this.owner.onError,onRunInspection:this.owner.onRunInspection,onCancelExecution:this.owner.onCancelExecution,onLoadDecisionEvidence:this.owner.onLoadDecisionEvidence});return {boundary:true,nodeId:node.id};}

 async openInnerTopology(id=this.selectedId){let node;if(id?.startsWith('scheme::')){this.refreshFlow();const declared=this.flow?.nodes.find(n=>n.id===id)||buildCurrentSchemeFlow(this.owner.project).flow?.nodes.find(n=>n.id===id);if(!declared)throw Error('此方案節點已不存在');if(!declared.actualNodeId)return this.openDefinition(declared);id=declared.actualNodeId;}node=programFlowNode(buildProgramFlow(this.owner.project),id);if(!node)throw Error('此節點沒有可查看的實算程序。');this.innerTopology?.dialog?.close();const request=++this.topologyRequest;const opened=await openOperatorTopology({project:this.owner.project,runId:node.runId,scopeId:node.id,records:{read:reference=>{if(!this.owner.onReadInspectionUnit)throw Error('單件結果儲存未連接');return this.owner.onReadInspectionUnit(reference);}},isCurrent:()=>request===this.topologyRequest,onDialog:dialog=>{if(request===this.topologyRequest)this.innerTopology={dialog};},onEvidence:id=>this.openEvidence(id),onArtifact:(instanceId,artifactId)=>this.addArtifact(node.runId+'::'+instanceId,artifactId),onRecord:artifactId=>this.owner.onOpenAlgorithmRecord?.({runId:node.runId,artifactId})});if(request===this.topologyRequest)this.innerTopology=opened;return opened;}
 openDefinition(node){this.definitionDialog?.remove();const d=el('dialog',undefined,'canvas-project-dialog');d.setAttribute('aria-label','節點文檔');d.append(el('h3',node.title),el('p',node.executed?'目前方案的設計說明':'已宣告，尚無本件實算。'),this.button('關閉',()=>d.close()),nodeDocumentationActions(node),renderNodeDocumentation(node));document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();this.definitionDialog=d;return {definition:true,nodeId:node.id};}
 async openNode(id,{mode='output'}={}){
  const v=this.owner;if(id?.startsWith('scheme::')){const node=buildCurrentSchemeFlow(v.project).flow?.nodes.find(n=>n.id===id);if(!node)throw Error('方案節點已不存在');if(node.boundary)return this.openBoundary(node);if(node.actualNodeId)return this.openNode(node.actualNodeId,{mode});if(mode==='output'){this.selectedId=id;this.evidenceNodeId=null;this.revealSelected=true;v.outputView.focus(node.schemeNodeId,mode);v.render();return {nodeId:id,waiting:true};}return this.openDefinition(node);}if(v.historicalSnapshot)throw Error('歷史快照為唯讀；請返回目前畫板後再切換程序。');this.refreshFlow();const flow=buildProgramFlow(v.project),node=programFlowNode(flow,id);if(!node)throw Error('此程序已不存在，請重新選擇。');if(mode==='output'){const run=v.project.data.algorithmRuns.find(r=>r.runId===node.runId);if(run?.schemeNodeId){this.selectedId=id;this.evidenceNodeId=null;this.runId=node.runId;v.outputView.focus(run.schemeNodeId,'output');v.render();return {nodeId:id,focused:true};}}
  const epoch=v.project.epoch,data=v.project.data,request=++this.request,originBoardId=v.boardId;this.pending=request;this.pendingTarget={id,runId:node.runId};let targetBoardId=null,createdBoard=false;const current=()=>request===this.request&&v.project.epoch===epoch&&v.project.data===data&&!v.historicalSnapshot&&v.opened&&(v.boardId===originBoardId||v.boardId===targetBoardId);
  try{
  this.cameras.set(v.boardId,{zoom:v.zoom,pan:{...v.pan},selected:[...v.selected]});this.evidencePage=0;this.textPage=0;this.fullText=false;
  this.selectedId=id;this.runId=node.runId;this.evidenceNodeId=null;
  let board=v.state().boards.find(b=>b.programBinding?.nodeId===id);
  if(!board){
   createdBoard=true;board=v.project.createInquiryBoard({title:node.title,programBinding:{runId:node.runId,nodeId:id}});
   const run=data.algorithmRuns.find(r=>r.runId===node.runId),references=[],boundary=programScope(v.project,{programBinding:{runId:node.runId,nodeId:id}},node.runId);
   for(const source of boundary?.includeOriginal?(node.sourceImages||[]).filter(s=>!boundary.inputImageIds.size||boundary.inputImageIds.has(s.imageId)):[]){const image=data.images.find(i=>i.id===source.imageId&&i.sha256===source.imageSha256);if(image){const dataURL=v.project.readImageAsset?await v.project.readImageAsset(image.id):image.dataURL;if(!current())return;references.push({label:image.name,kind:'original',dataURL,width:image.width,height:image.height,source:{imageId:image.id,inputSha256:image.sha256,coordinateSpace:'original-image-pixels'}});}}
   const predecessorArtifacts=boundary?.inputs||new Set(),artifacts=run.artifacts.filter(a=>predecessorArtifacts.has(a.id)||boundary?.owned.has(a.id)).map(a=>{const dataURL=a.dataURL||a.dataUrl||workpieceArtifactPixel(v.project,run.workpieceUnit?.id,run.runId,a.id);return dataURL?{...a,dataURL,dataUrl:dataURL}:a});
   for(const artifact of artifacts)if(artifact.type==='image'&&(artifact.dataUrl||artifact.dataURL))references.push({label:artifact.name||artifact.id,kind:'stage',dataURL:artifact.dataUrl||artifact.dataURL,width:artifact.width,height:artifact.height,source:{runId:run.runId,codeSha256:run.codeSha256,artifactId:artifact.id,artifactSha256:artifact.sha256,traceNodeId:artifact.traceNodeId,coordinateSpace:'algorithm-output-pixels',sourceBindings:copy(run.sourceBinding)}});
   // A panel has finite capacity; remaining images stay accessible via the
   // real output selector instead of manufacturing, shrinking or discarding them.
   const loads=[];let rowY=0,rowHeight=0,columnX=0;for(let i=0;i<Math.min(references.length,28);i++){if(!current())return;const result=v.project.addInquiryImage(references[i],{boardId:board.id,position:{x:columnX,y:rowY},actor:references[i].kind==='original'?'human':'agent'});rowHeight=Math.max(rowHeight,result.item.height);columnX=result.item.x+result.item.width+64;if(i%2===1){rowY+=rowHeight+64;rowHeight=0;columnX=0;}loads.push(v.loadImage(result.asset));}await Promise.all(loads);if(!current())return;
  }
  if(!current())return;
  targetBoardId=board.id;this.revealSelected=true;await v.open({boardId:board.id});if(!current())return;if(createdBoard&&v.board()?.artifactGroups?.length){v.project.layoutCanvasArtifactGroups(board.id,{arrangeInputs:true});v.render();v.fit();}this.pending=null;this.pendingTarget=null;this.selectedId=id;this.runId=node.runId;this.lastBoardId=board.id;const selectedRun=data.algorithmRuns.find(r=>r.runId===node.runId);if(selectedRun?.schemeNodeId)v.outputView.focus(selectedRun.schemeNodeId,mode);v.render();const camera=this.cameras.get(board.id);if(camera){v.zoom=camera.zoom;v.pan={...camera.pan};v.selected=new Set(camera.selected.filter(itemId=>board.items.some(item=>item.id===itemId)));v.paint();}this.sync();
  }finally{if(this.pending===request){this.pending=null;this.pendingTarget=null;this.sync();}}
 }
 openEvidence(id){
  if(id?.startsWith('scheme::')){const defined=buildCurrentSchemeFlow(this.owner.project).flow?.nodes.find(n=>n.id===id);if(!defined)throw Error('方案節點已不存在');if(defined.boundary)return this.openBoundary(defined);this.evidenceNodeId=defined.id;this.detailsOpen=true;this.owner.render();return;}
  const node=programFlowNode(buildProgramFlow(this.owner.project),id);if(!node)throw Error('此圖對應的程序紀錄不存在。');
  this.evidenceNodeId=node.id;this.detailsOpen=true;this.section='tool';this.evidencePage=0;this.textPage=0;this.fullText=false;this.owner.render();
 }
 appendAssetEvidence(menu,asset){
  const result=programFlowForAsset(this.owner.project,asset);if(result.unavailable){const b=this.button('節點文檔：來源待核對',()=>{throw Error(result.unavailable)});menu.append(b);return;}
  const nodes=result.nodes||[];if(!nodes.length){const b=this.button('節點文檔：尚無算法執行紀錄',()=>{});b.disabled=true;menu.append(b);return;}for(const node of nodes){const label=nodes.length===1?'查看節點文檔':`節點文檔 · ${node.title}`;menu.append(this.button(label,()=>{this.owner.hideMenu();return this.openEvidence(node.id)}));}
 }
 captureReference(id=null){this.refreshFlow();return this.owner.project.captureProgramFlowReference({scope:id?'node':'whole-flow',nodeId:id,runId:this.schemeFlow?this.flow.nodes.find(n=>n.runId)?.runId:this.runId,boardId:this.owner.boardId});}
 async askFlow(id=null){
  this.owner.hideMenu();this.refreshFlow();
  const target=id&&this.flow?.nodes?.some(node=>node.id===id)?id:null;
  const reference=this.captureReference(target);
  return this.owner.openProgramFlowQuestion(reference);
 }
 renameNode(id){
  const v=this.owner;v.hideMenu();if(v.historicalSnapshot)throw Error('歷史快照為唯讀，請返回目前方案');
  this.refreshFlow();const node=this.flow.nodes.find(n=>n.id===id);if(!node?.schemeNodeId)throw Error('請選擇目前方案中的模塊');
  const schemeId=v.project.purposeScheme.id,dialog=el('dialog',undefined,'canvas-project-dialog');dialog.setAttribute('aria-label','重新命名節點');
  const form=el('form'),label=el('label','節點名稱'),input=el('input'),hint=el('small','僅修改顯示名稱；保留程式、連線與既有執行結果。'),error=el('p');input.value=node.title;input.maxLength=80;input.required=true;input.setAttribute('aria-label','節點名稱');label.append(input);error.setAttribute('role','alert');
  const controls=el('div'),cancel=el('button','取消'),save=el('button','保存名稱');cancel.type='button';save.type='submit';cancel.onclick=()=>dialog.close();controls.append(cancel,save);form.append(el('h3','重新命名節點'),label,hint,error,controls);dialog.append(form);
  form.onsubmit=event=>{event.preventDefault();try{v.project.renameFlowNode(node.schemeNodeId,input.value,{schemeId});dialog.close();v.render();}catch(e){error.textContent=e.message;}};
  dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();input.focus();input.select();return dialog;
 }
 contextMenu(id,event){
  event.preventDefault();event.stopPropagation();this.owner.hideMenu();const menu=el('div',undefined,'inquiry-menu');menu.setAttribute('role','menu');
  if(id){menu.append(this.button('詢問此節點',()=>this.askFlow(id)));if(!this.owner.historicalSnapshot&&this.flow?.nodes.find(n=>n.id===id)?.schemeNodeId)menu.append(this.button('重新命名',()=>this.renameNode(id)));}
  menu.append(this.button('詢問整個流程',()=>this.askFlow()));
  if(id){menu.append(this.button('內部算子拓撲',()=>{this.owner.hideMenu();this.map?.collapse();return this.openInnerTopology(id)}));menu.append(this.button('查看節點文檔',()=>{this.owner.hideMenu();this.map?.collapse();this.openEvidence(id)}));}
  (this.map?.dialog||document.body).append(menu);menu.style.left=Math.max(5,Math.min(window.innerWidth-menu.offsetWidth-5,event.clientX))+'px';menu.style.top=Math.max(5,Math.min(window.innerHeight-menu.offsetHeight-5,event.clientY))+'px';this.owner.menu=menu;const dismiss=event=>{if(!menu.contains(event.target))this.owner.hideMenu()};this.owner.dismissMenu=dismiss;setTimeout(()=>{if(this.owner.menu===menu)document.addEventListener('pointerdown',dismiss)},0);
 }

 focusAsset(asset){const result=programFlowForAsset(this.owner.project,asset);if(result.unavailable)throw Error(result.unavailable);const node=result.nodes?.[0];if(!node)throw Error('此圖沒有保存的程序紀錄。');return this.openNode(node.id);}
 renderContext(area,node){
  const state=this.localGraph||(this.localGraph={expanded:false,x:10,y:10,inPage:0,outPage:0});
  if(state.nodeId!==node.id){state.nodeId=node.id;state.inPage=0;state.outPage=0;}
  const box=el('section',undefined,'program-node-context'+(state.expanded?' is-expanded':''));box.setAttribute('aria-label','目前程序的輸入輸出與分支');
  const minimumTop=()=>{const actions=area.querySelector('.intent-selection-actions');return (actions?.offsetTop||10)+(actions?.offsetHeight||44)+8;};
  box.style.left=Math.max(0,state.x||0)+'px';box.style.top=Math.max(minimumTop(),state.y||0)+'px';
  const audit=node.evidenceAudit?.status,auditLabel=node.definition&&!node.executed?'未執行，依據僅為提案':audit==='READY_FOR_REVIEW'?'依據待審查':audit==='NOT_EXECUTED'?'未執行，不作交付':node.legacy?'內部步驟未記錄':'查看執行紀錄';
  const header=el('header',undefined,'program-local-header'),label=el('span');label.append(el('strong',node.title),el('small',` · ${labels[node.status]||node.status} · ${auditLabel}`));
  const toggle=iconButton(this.button('',()=>{state.expanded=!state.expanded;this.owner.render();window.dispatchEvent(new Event('agentcv-workspace-view-changed'));}),state.expanded?'zoom-out':'zoom-in',state.expanded?'收合相關步驟':'展開相關步驟');toggle.setAttribute('aria-expanded',String(state.expanded));
  header.append(label,this.button('內部算子拓撲',()=>this.openInnerTopology(this.owner.board()?.programBinding?.nodeId||node.id)),toggle);box.append(header);const interfaces=el('details',undefined,'program-boundary-interfaces');interfaces.append(el('summary',node.kind==='step'?'算子輸入／輸出接口':'工程節點輸入／輸出接口'),el('p','輸入：'+Object.keys(node.inputs||{}).join('、')),el('p','輸出：'+[...new Set([...Object.keys(node.declaredOutputs||{}),...Object.keys(node.outputs||{})])].join('、')));box.append(interfaces);
  const unavailable=(node.sourceImages||[]).filter(source=>!this.owner.project.data.images.some(image=>image.id===source.imageId&&image.sha256===source.imageSha256));if(unavailable.length){const warning=el('small',`歷史來源 ${unavailable.length} 張原圖已移除或內容身份改變；不使用當前圖像代替。`,'program-source-warning');warning.setAttribute('role','status');box.append(warning);}
  if(state.expanded){
   const incoming=this.flow.edges.filter(e=>e.kind==='dependency'&&e.to===node.id).map(e=>programFlowNode(this.flow,e.from)).filter(Boolean),outgoing=this.flow.edges.filter(e=>e.kind==='dependency'&&e.from===node.id).map(e=>programFlowNode(this.flow,e.to)).filter(Boolean);
   const diagram=el('div',undefined,'program-local-diagram');diagram.setAttribute('aria-label','此步驟的直接依賴');
   const column=(targets,direction,pageKey)=>{const col=el('div',undefined,'program-local-column '+direction);col.append(el('small',direction==='before'?'前置步驟':'後續步驟'));const pages=Math.max(1,Math.ceil(targets.length/3));state[pageKey]=Math.max(0,Math.min(state[pageKey]||0,pages-1));
    const list=el('div',undefined,'program-local-list');for(const target of targets.slice(state[pageKey]*3,state[pageKey]*3+3)){const b=this.button(target.title,()=>this.openNode(target.id),'program-local-node');b.dataset.programLocalNode=target.id;b.dataset.status=target.status;b.dataset.judgement=target.judgement||'UNKNOWN';b.title=target.title+' · '+(labels[target.status]||target.status)+(target.judgement?' · '+target.judgement:'');list.append(b);}if(!targets.length)list.append(el('span','無','program-local-empty'));col.append(list);
    if(pages>1){const nav=el('div',undefined,'program-local-pages'),prev=this.button('‹',()=>{state[pageKey]--;this.owner.render();}),next=this.button('›',()=>{state[pageKey]++;this.owner.render();});prev.disabled=state[pageKey]===0;next.disabled=state[pageKey]>=pages-1;prev.setAttribute('aria-label',direction==='before'?'前一組前置步驟':'前一組後續步驟');next.setAttribute('aria-label',direction==='before'?'下一組前置步驟':'下一組後續步驟');nav.append(prev,el('small',`${state[pageKey]+1} / ${pages}`),next);col.append(nav);}return col;};
   const current=el('div',undefined,'program-local-current');current.append(el('small','目前'),el('strong',node.title));diagram.append(column(incoming,'before','inPage'),current,column(outgoing,'after','outPage'));box.append(diagram);
   const footer=el('footer',undefined,'program-local-footer');footer.append(this.button('完整流程圖',()=>this.map?.expand()));const images=node.artifacts.filter(a=>a.type==='image'&&(a.dataUrl||a.dataURL));if(images.length){const select=el('select');select.setAttribute('aria-label','選擇節點輸出圖像');for(const artifact of images){const option=el('option',artifact.name||artifact.id);option.value=artifact.id;select.append(option);}footer.append(select,this.button('查看輸出',()=>this.addArtifact(node.id,select.value)));}box.append(footer);
  }
  header.onpointerdown=e=>{if(e.target.closest('button'))return;e.preventDefault();header.setPointerCapture?.(e.pointerId);const start={x:e.clientX,y:e.clientY,left:parseFloat(box.style.left)||0,top:parseFloat(box.style.top)||minimumTop()};header.onpointermove=ev=>{state.x=Math.max(0,Math.min(area.clientWidth-box.offsetWidth,start.left+ev.clientX-start.x));state.y=Math.max(minimumTop(),Math.min(area.clientHeight-box.offsetHeight,start.top+ev.clientY-start.y));box.style.left=state.x+'px';box.style.top=state.y+'px';};header.onpointerup=()=>{state.manual=true;header.onpointermove=null;header.onpointerup=null;window.dispatchEvent(new Event('agentcv-workspace-view-changed'));};};
  area.append(box);requestAnimationFrame(()=>{if(!box.isConnected)return;if(area.clientWidth&&box.offsetWidth){
   if(state.expanded&&!state.manual){const w=box.offsetWidth,h=box.offsetHeight,aw=area.clientWidth,ah=area.clientHeight,v=this.owner,pad=12,candidates=[[pad,minimumTop()],[aw-w-pad,minimumTop()],[pad,ah-h-pad-55],[aw-w-pad,ah-h-pad-55],[pad,ah-h-pad],[aw-w-pad,ah-h-pad]].map(([x,y])=>({x:Math.max(0,x),y:Math.max(0,y)}));const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));const obstacles=(v.board()?.items||[]).map(i=>({x:i.x*v.zoom+v.pan.x,y:i.y*v.zoom+v.pan.y,w:i.width*v.zoom,h:i.height*v.zoom}));const ar=area.getBoundingClientRect();for(const control of area.querySelectorAll('.intent-selection-actions,.inquiry-zoom,.intent-question-bubble,.program-evidence-panel')){const r=control.getBoundingClientRect();if(r.width&&r.height)obstacles.push({x:r.left-ar.left,y:r.top-ar.top,w:r.width,h:r.height});}candidates.sort((a,b)=>obstacles.reduce((sum,o)=>sum+overlap({...a,w,h},o),0)-obstacles.reduce((sum,o)=>sum+overlap({...b,w,h},o),0));state.x=candidates[0].x;state.y=candidates[0].y;}
   state.x=Math.max(0,Math.min(state.x||0,area.clientWidth-box.offsetWidth));state.y=Math.max(minimumTop(),Math.min(state.y||0,area.clientHeight-box.offsetHeight));box.style.left=state.x+'px';box.style.top=state.y+'px';}});
 }
 async addArtifact(nodeId,artifactId){
  const v=this.owner;if(v.historicalSnapshot)throw Error('歷史快照為唯讀。');await this.openNode(nodeId);
  if(v.board()?.programBinding?.nodeId!==nodeId||v.historicalSnapshot)return;
  const node=programFlowNode(buildProgramFlow(v.project),nodeId),run=v.project.data.algorithmRuns.find(r=>r.runId===node?.runId),artifact=node?.artifacts.find(a=>a.id===artifactId&&a.type==='image');if(!run||!artifact)throw Error('此輸出圖像已不存在。');
  let item=v.board().items.find(item=>{const source=v.asset(item)?.source;return source?.runId===run.runId&&source?.artifactId===artifactId&&source?.artifactSha256===artifact.sha256;});
  if(!item){if(v.board().items.length>=32)return v.onOpenAlgorithmRecord?.({runId:run.runId,artifactId});const result=v.project.addInquiryImage({label:(artifact.name||artifact.id)+' · 節點輸出',kind:'stage',dataURL:artifact.dataUrl||artifact.dataURL,width:artifact.width,height:artifact.height,source:{runId:run.runId,codeSha256:run.codeSha256,artifactId,artifactSha256:artifact.sha256,traceNodeId:artifact.traceNodeId,coordinateSpace:'algorithm-output-pixels',sourceBindings:copy(run.sourceBinding)}},{boardId:v.boardId,actor:'human'});item=result.item;await v.loadImage(result.asset);}
  if(v.board()?.programBinding?.nodeId!==nodeId||v.historicalSnapshot)return;v.selected=new Set([item.id]);v.render();v.fit({selectedOnly:true});
 }
 renderDetails(area,{flowCurrent=false}={}){
  if(!area||!this.owner.embedded||this.owner.historicalSnapshot)return;
  const existing=area.querySelector('.program-evidence-panel'),outputActive=this.owner.outputView?.mode==='output'&&!!this.owner.outputView?.surface?.section?.isConnected;
  if(!this.detailsOpen&&outputActive){existing?.remove();return;}
  if(!flowCurrent)this.refreshFlow();const node=programFlowNode(this.flow,this.selectedId)||programFlowNode(this.flow,this.flow?.roots?.[0]);if(!node)return;
  if(this.owner.board()?.programBinding&&!outputActive&&!area.querySelector('.program-node-context'))this.renderContext(area,node);
  if(!this.detailsOpen){existing?.remove();return;}
  const evidenceNode=this.evidenceNodeId&&(programFlowNode(this.flow,this.evidenceNodeId)||programFlowNode(buildProgramFlow(this.owner.project),this.evidenceNodeId));
  if(this.evidenceNodeId&&!evidenceNode){existing?.remove();this.detailsOpen=false;this.evidenceNodeId=null;return;}
  const selected=evidenceNode||node,signature=selected.id+'\0'+selected.title+'\0'+nodeDocumentation(selected).text;
  if(existing?.documentationSignature===signature)return existing;
  existing?.remove();const panel=this.renderEvidence(area,selected);panel.documentationSignature=signature;return panel;
 }
 renderEvidence(area,node){
  const box=el('section',undefined,'program-evidence-panel node-document-panel');box.setAttribute('aria-label','節點文檔');const header=el('header');header.append(el('strong',node.title+' · 節點文檔'),this.button('×',()=>{this.detailsOpen=false;this.evidenceNodeId=null;this.owner.render();}));box.append(header);
  const body=el('div',undefined,'program-evidence-body');body.append(nodeDocumentationActions(node),renderNodeDocumentation(node));box.append(body);area.append(box);return box;
 }

 close(){this.topologyRequest++;this.innerTopology?.dialog?.close();this.map?.collapse();this.request++;this.pending=null;this.pendingTarget=null;this.host?.remove();this.host=null;this.detailsOpen=false;this.evidenceNodeId=null;document.body.classList.remove('canvas-program-mode');const steps=document.getElementById('steps');if(steps)steps.hidden=false;}
}
