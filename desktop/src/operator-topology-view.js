import {readCompleteInspectionRun} from './inspection-run-details.js';
import {buildOperatorTopology} from './operator-topology.js';
import {layoutProgramFlow} from './program-flow-layout.js';
import './operator-topology-view.css';

const ns='http://www.w3.org/2000/svg';
const svg=(tag,attrs={})=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e};
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
const statusName=s=>({SUCCEEDED:'已執行',SKIPPED:'未執行',NOT_FOUND:'目標未找到',FAULT:'執行故障',FAILED:'執行失敗',TIMEOUT:'逾時',RUNNING:'執行中'})[s]||s||'未記錄';
const statusGlyph=s=>({SUCCEEDED:'✓',SKIPPED:'−',NOT_FOUND:'∅',FAULT:'!',FAILED:'!',TIMEOUT:'!',RUNNING:'↻'})[s]||'○';
const hasCondition=n=>n.condition!==null&&n.condition!==undefined;
const clip=(text,length=25)=>{const chars=Array.from(String(text));return chars.length>length?chars.slice(0,length-1).join('')+'…':chars.join('')};
const roleName=node=>node.role==='input'?'輸入':node.role==='output'?(node.metadata?.type==='image'?'圖像產物':'數據產物'):node.role==='procedure'?'子程序':'算子';
const appendText=(parent,value,attrs)=>{const text=svg('text',attrs);text.textContent=value;parent.append(text);return text};
const preview=value=>{if(value===null)return 'null';if(typeof value!=='object')return String(value);if(Array.isArray(value))return `${value.length} 項`;return Object.entries(value).slice(0,5).map(([k,v])=>`${k}: ${v&&typeof v==='object'?Array.isArray(v)?v.length+'項':'物件':String(v)}`).join(' · ')};

// Shapes describe recorded interface roles, never a guess based on tool names.
function nodeBody(node,width,height){
 const attrs={class:'operator-node-body'};
 if(node.role==='input')return svg('path',{...attrs,d:`M0 0 H${width-16} L${width} ${height/2} L${width-16} ${height} H0 Z`});
 if(node.role==='output')return svg('path',{...attrs,d:`M0 0 H${width-16} L${width} 16 V${height} H0 Z`});
 return svg('rect',{...attrs,width,height,rx:7});
}
// ELK sees bounds; attach wires to the actual input arrow / folded artifact.
function portAnchor(node,position,p,neighbor){
 if(!position||!neighbor||!['input','output'].includes(node?.role))return p;
 const {x,y,width:w,height:h}=position,lx=Math.max(0,Math.min(w,p.x-x)),ly=Math.max(0,Math.min(h,p.y-y)),vertical=Math.abs(p.x-neighbor.x)<.01;
 if(node.role==='input'){
  if(vertical){const inset=Math.max(0,lx-(w-16))*h/32;return {x:p.x,y:y+(neighbor.y<y+h/2?inset:h-inset)};}
  return {x:neighbor.x<x+w/2?x:x+w-16*Math.abs(2*ly/h-1),y:p.y};
 }
 if(vertical)return {x:p.x,y:neighbor.y<y+h/2?y+Math.max(0,lx-(w-16)):y+h};
 return {x:neighbor.x<x+w/2?x:x+w-Math.max(0,16-ly),y:p.y};
}
function shapeIcon(node,x,y){
 const g=svg('g',{transform:`translate(${x} ${y})`,class:'operator-role-icon','aria-hidden':'true'});
 if((node.role==='input'&&node.metadata?.imageId)||(node.role==='output'&&node.metadata?.type==='image')){
  g.append(svg('rect',{x:0,y:0,width:17,height:13,rx:2}),svg('path',{d:'M2 11 L7 6 L11 10 L14 7 L16 10'}),svg('circle',{cx:12,cy:4,r:1}));
 }else if(node.role==='input')g.append(svg('path',{d:'M1 3 V13 H6 M11 3 H16 V13 M5 8 H12 M9 5 L12 8 L9 11'}));
 else if(node.role==='output')g.append(svg('path',{d:'M3 0 H12 L16 4 V15 H3 Z M12 0 V4 H16 M6 7 H13 M6 10 H13'}));
 else g.append(svg('path',{d:'M1 2 H16 V14 H1 Z M4 2 V14 M13 2 V14'}));
 return g;
}
function createLegend(){
 const legend=el('div');legend.className='operator-topology-legend';legend.hidden=true;
 for(const [kind,label]of [['input','輸入端口'],['operator','算子'],['output','產物'],['procedure','子程序包含'],['condition','有執行條件'],['data','資料傳遞'],['control','執行前提']]){
  const item=el('span'),key=svg('svg',{viewBox:'0 0 30 20','aria-hidden':'true',class:'legend-'+kind});
  if(kind==='data'||kind==='control')key.append(svg('path',{d:'M1 10 H27 M22 5 L28 10 L22 15',class:kind==='control'?'control-line':'data-line'}));
  else if(kind==='condition')key.append(svg('path',{d:'M15 1 L28 10 L15 19 L2 10 Z'}));
  else if(kind==='procedure')key.append(svg('path',{d:'M2 7 V2 H12 L15 5 H28 V18 H2 Z'}));
  else {const body=nodeBody({role:kind},26,16);body.setAttribute('transform','translate(2 2)');key.append(body);}
  item.append(key,document.createTextNode(label));legend.append(item);
 }
 const states=el('span','✓ 已執行　∅ 未找到　− 未執行　! 故障　○ 未記錄');states.className='operator-state-legend';legend.append(states);return legend;
}

export async function openOperatorTopology({project,runId,scopeId,onEvidence,onArtifact,onRecord,records,isCurrent=()=>true,onDialog}){
 const dialog=el('dialog');dialog.className='operator-topology-dialog';dialog.setAttribute('aria-label','節點內部算子拓撲');
 const data=project.data||project,epoch=project.epoch,run=data.algorithmRuns?.find(run=>run.runId===runId),returnFocus=document.activeElement;
 const current=()=>isCurrent()&&(project.data||project)===data&&project.epoch===epoch&&data.algorithmRuns?.includes(run)&&dialog.isConnected;
 dialog.addEventListener('close',()=>{dialog.remove();if(returnFocus?.isConnected)returnFocus.focus()});
 let graphProject=project;
 if(run?.deferredProcedureTrace!==undefined){
  const message=el('p','正在讀取完整程序證據…'),cancel=el('button','關閉');message.setAttribute('role','status');cancel.onclick=()=>dialog.close();
  dialog.append(message,cancel);document.body.append(dialog);onDialog?.(dialog);dialog.showModal();
  try{
   const loaded=await readCompleteInspectionRun(project,run,records,{isCurrent:current});
   if(!current()){if(dialog.isConnected)dialog.close();return {dialog,cancelled:true};}
   graphProject={data:{images:data.images,algorithmRuns:[loaded.run]}};
   dialog.replaceChildren();
  }catch(error){
   if(!current()){if(dialog.isConnected)dialog.close();return {dialog,cancelled:true};}
   message.textContent='無法讀取完整程序證據：'+String(error?.message||error);message.setAttribute('role','alert');return {dialog,error};
  }
 }
 const flow=buildOperatorTopology(graphProject,runId,scopeId);
 const header=el('header'),heading=el('div');heading.append(el('strong',flow.title+' · 內部算子'),el('small','輸入 → 算子 → 產物 · 點選查看接口與依據'));
 const close=el('button','關閉');close.onclick=()=>dialog.close();header.append(heading,close);
 const notice=el('div');notice.className='operator-topology-notice';notice.append(el('span',flow.coverage));for(const d of flow.diagnostics){const warning=el('p',d.message||d.code);warning.dataset.diagnostic=d.code;notice.append(warning);}
 const toolbar=el('nav'),zoomOut=el('button','−'),fit=el('button','配適'),zoomIn=el('button','＋'),legendButton=el('button','圖例');zoomOut.setAttribute('aria-label','縮小算子拓撲');zoomIn.setAttribute('aria-label','放大算子拓撲');legendButton.setAttribute('aria-expanded','false');toolbar.append(zoomOut,fit,zoomIn,legendButton,el('small','實線：資料　虛線：執行前提'));
 const viewport=el('div');viewport.className='operator-topology-viewport';const canvas=svg('svg',{role:'group','aria-label':'本節點的真實內部資料與執行前提拓撲'}),legend=createLegend();viewport.append(canvas,legend);legendButton.onclick=()=>{legend.hidden=!legend.hidden;legendButton.setAttribute('aria-expanded',String(!legend.hidden))};
 const detail=el('section');detail.className='operator-topology-detail';detail.setAttribute('aria-label','所選算子接口');detail.append(el('span','點選算子、連線或產物查看來源。'));
 dialog.append(header,notice,toolbar,viewport,detail);document.body.append(dialog);onDialog?.(dialog);if(!dialog.open)dialog.showModal();
 const geometry=await layoutProgramFlow(flow,{direction:'RIGHT',nodeWidth:250,nodeHeight:76,portHeight:42,layerGap:72,nodeGap:22,groupHeader:40,balanced:true});if(!current()){if(dialog.isConnected)dialog.close();return {dialog,flow,cancelled:true};}
 const defs=svg('defs');for(const kind of ['data','control']){const marker=svg('marker',{id:`inner-${kind}-${runId}`,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto'});marker.append(svg('path',{d:kind==='data'?'M0 0 L10 5 L0 10 Z':'M1 1 L9 5 L1 9',fill:kind==='data'?'#94b9c9':'none',stroke:'#94b9c9','stroke-width':1.4}));defs.append(marker);}canvas.append(defs);
 const positions=[...geometry.groups,...geometry.nodes],byId=new Map(flow.nodes.map(n=>[n.id,n]));let camera={x:0,y:0,w:geometry.width||1000,h:geometry.height||600};
 const apply=()=>canvas.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.w} ${camera.h}`),fitAll=()=>{camera={x:0,y:0,w:geometry.width||1000,h:geometry.height||600};apply()},zoom=factor=>{const w=camera.w*factor,h=camera.h*factor;if(w<20||w>100000)return;camera={x:camera.x+(camera.w-w)/2,y:camera.y+(camera.h-h)/2,w,h};apply()};zoomIn.onclick=()=>zoom(.8);zoomOut.onclick=()=>zoom(1.25);fit.onclick=fitAll;
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?.85:1.18)},{passive:false});let drag;
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('[data-operator-node],[data-topology-edge]'))return;drag={x:e.clientX,y:e.clientY,camera:{...camera}};canvas.setPointerCapture?.(e.pointerId)});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;const bounds=canvas.getBoundingClientRect();camera.x=drag.camera.x-(e.clientX-drag.x)*camera.w/Math.max(1,bounds.width);camera.y=drag.camera.y-(e.clientY-drag.y)*camera.h/Math.max(1,bounds.height);apply()});for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>drag=null);
 for(const node of geometry.groups){const g=svg('g',{class:'operator-container','data-container':node.id}),w=node.width,h=node.height;g.append(svg('path',{transform:`translate(${node.x} ${node.y})`,d:`M0 10 Q0 0 10 0 H${Math.min(150,w-40)} L${Math.min(162,w-28)} 8 H${w-10} Q${w} 8 ${w} 18 V${h-10} Q${w} ${h} ${w-10} ${h} H10 Q0 ${h} 0 ${h-10} Z`}));canvas.append(g);}
 const clearSelection=()=>{canvas.querySelectorAll('.selected').forEach(e=>e.classList.remove('selected'));detail.replaceChildren()};
 const select=node=>{
  clearSelection();Array.from(canvas.querySelectorAll('[data-operator-node]')).find(e=>e.dataset.operatorNode===node.id)?.classList.add('selected');detail.append(el('strong',node.title+' · '+statusName(node.status)));if(Number.isFinite(node.durationMs))detail.append(el('span',`實測 ${node.durationMs.toFixed(3)} ms`));
  for(const [label,value]of [['輸入',node.inputs],['輸出',node.outputs],['條件',node.condition],['來源',node.metadata]])if(value&&typeof value==='object'&&Object.keys(value).length){const part=el('div');part.append(el('b',label+'：'));for(const [key,v]of Object.entries(value))part.append(el('span',key+' = '+preview(v)));detail.append(part);}
  if(hasCondition(node)&&typeof node.condition!=='object')detail.append(el('span','條件：'+String(node.condition)));if(node.skipReason)detail.append(el('p','未執行原因：'+node.skipReason));if(node.error)detail.append(el('p','錯誤：'+(node.error.message||node.error)));
  if(node.role==='operator'||node.role==='procedure'){const evidence=el('button','節點文檔');evidence.onclick=()=>{dialog.close();onEvidence?.(node.id)};detail.append(evidence);}
  if(node.artifactId){const isImage=node.metadata.type==='image',show=el('button',isImage?'在畫板查看產物':'完整數據（外部開啟）');show.onclick=()=>{dialog.close();if(isImage)onArtifact?.(node.metadata.producer,node.artifactId);else onRecord?.(node.artifactId)};detail.append(show);}
 };
 const endpoints=[];
 for(let edge of geometry.edges){
  if(!edge.points?.length)continue;edge={...edge,points:edge.points.map(p=>({...p}))};edge.points[0]=portAnchor(byId.get(edge.from),positions.find(p=>p.id===edge.from),edge.points[0],edge.points[1]);edge.points[edge.points.length-1]=portAnchor(byId.get(edge.to),positions.find(p=>p.id===edge.to),edge.points.at(-1),edge.points.at(-2));const record=flow.edges.find(e=>e.id===edge.id),bases=[record?.basis,...(record?.additionalBasis||[])],control=bases.includes('dependencyInstances')&&!bases.some(b=>['artifact-input-id','artifact-producer','upstream-slot','input-image-id'].includes(b)),kind=control?'control':'data',g=svg('g',{'data-topology-edge':edge.id,'data-edge-kind':kind,tabindex:0,role:'button',class:'operator-edge','aria-label':`${byId.get(edge.from)?.title||edge.from} → ${byId.get(edge.to)?.title||edge.to}，${control?'執行前提':'資料傳遞'}`}),d=edge.points.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ');
  g.append(svg('path',{d,class:'operator-edge-hit'}),svg('path',{d,class:`operator-edge-route ${kind}-line`,'marker-end':`url(#inner-${kind}-${runId})`}));const title=svg('title');title.textContent=`${record?.label||'前提'} · ${record?.basis||'saved dependency'}`;g.append(title);
  const selectEdge=()=>{clearSelection();g.classList.add('selected');detail.append(el('strong',control?'執行前提':bases.includes('dependencyInstances')?'資料傳遞 · 同時為執行前提':'資料傳遞'),el('span',`${byId.get(edge.from)?.title||edge.from} → ${byId.get(edge.to)?.title||edge.to}`),el('span',record?.label||''),el('span','紀錄來源：'+[record?.basis,...(record?.additionalBasis||[])].filter(Boolean).join('、')))};g.onclick=selectEdge;g.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();selectEdge()}};canvas.append(g);endpoints.push(edge.points[0],edge.points.at(-1));
 }
 for(const position of positions){
  const node=byId.get(position.id);if(!node)continue;const group=geometry.groups.some(g=>g.id===node.id),height=group?40:position.height,w=position.width,g=svg('g',{'data-operator-node':node.id,'data-shape':group?'container':node.role==='input'?'input-port':node.role==='output'?'artifact':'process',tabindex:0,role:'button','aria-label':`${roleName(node)}，${node.title}，${statusName(node.status)}${hasCondition(node)?'，有執行條件':''}`,transform:`translate(${position.x} ${position.y})`,class:`operator-node role-${node.role} state-${String(node.status||'unrecorded').toLowerCase()}`});
  if(group)g.append(svg('rect',{class:'operator-group-hit',width:w,height,rx:7}));else g.append(nodeBody(node,w,height));
  if(node.role==='output')g.append(svg('path',{d:`M${w-16} 0 V16 H${w}`,class:'operator-fold'}));
  const typeY=group?23:18,titleY=group?23:node.role==='operator'?40:34;
  if(group){g.append(shapeIcon(node,12,14));appendText(g,clip(node.title,Math.max(16,Math.floor((w-80)/9))),{x:38,y:titleY,class:'operator-name'});}
  else {g.append(shapeIcon(node,12,8));appendText(g,roleName(node),{x:36,y:typeY,class:'operator-type'});appendText(g,clip(node.title.replace(/^(圖像|數據|上游|邊界) · /,''),25),{x:12,y:titleY,class:'operator-name'});}
  appendText(g,statusGlyph(node.status),{x:w-24,y:group?24:18,class:'operator-state','aria-hidden':'true'});
  const tooltip=svg('title');tooltip.textContent=`${node.title} · ${statusName(node.status)}`;g.append(tooltip);
  if(!group&&node.role!=='input'&&node.role!=='output'){
   appendText(g,Number.isFinite(node.durationMs)?`${node.durationMs.toFixed(2)} ms`:statusName(node.status),{x:12,y:height-12,class:'operator-timing'});
   if(hasCondition(node)){const badge=svg('g',{class:'operator-condition','data-condition':node.id,'aria-label':'有執行條件',transform:`translate(${w-57} ${height-24})`});badge.append(svg('path',{d:'M8 0 L16 8 L8 16 L0 8 Z'}));appendText(badge,'?',{x:8,y:12,'text-anchor':'middle'});const t=svg('title');t.textContent='執行條件：'+preview(node.condition);badge.append(t);g.append(badge);}
  }
  g.onclick=()=>select(node);g.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();select(node)}};canvas.append(g);
 }
 const seen=new Set();for(const p of endpoints){const key=`${p.x},${p.y}`;if(seen.has(key))continue;seen.add(key);canvas.append(svg('circle',{cx:p.x,cy:p.y,r:3,class:'operator-connection-port','aria-hidden':'true'}));}
 fitAll();return {dialog,flow,geometry,canvas};
}
