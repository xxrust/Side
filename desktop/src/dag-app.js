import './dag.css';
import {emptyProject,serializeProject,loadProject,upstreamSources} from './dag-model.js';
import {AgentOps} from './agent-ops.js';
import {MockRuntime} from './agent-runtime.js';
const $=s=>document.querySelector(s),el=(tag,text,parent)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;parent?.append(e);return e;};
let project=emptyProject(),selected=null,pending=null,list=false;
try{const saved=localStorage.getItem('agentcv-dag-v02');if(saved)project=loadProject(saved);}catch{}
const ops=new AgentOps(project);
const refresh=()=>{project=ops.snapshot();};
const persist=()=>{try{ops.setWorkspace(project);localStorage.setItem('agentcv-dag-v02',ops.save());}catch{message('自动保存空间不足，请导出项目 JSON');}};
function message(text){$('#notice').textContent=text;}
const node=(id,kind,title,params)=>({id,kind,title,version:1,rationale:'用户画板意图的结构演示，尚未提供算法证据。',params,applicability:{usage:'仅演示依赖结构；未核验工业边界'}});
function proposal(){const prefix='n'+Date.now();const a=prefix+'-loc',b=prefix+'-offset',c=prefix+'-defect';return {nodes:[node(a,'Locate','共享定位',{roi:{x:20,y:20,w:55,h:50},method:'human-roi'}),node(b,'Offset','相对偏移',{refNodeId:a,transform:{dx:0,dy:0}}),node(c,'Defect','表面瑕疵',{metric:'contrast',threshold:20})],edges:[[a,b,'requires'],[a,b,'shares'],[a,c,'requires'],[a,c,'shares'],[b,c,'requires']].map(([from,to,kind],i)=>({id:prefix+'-e'+i,from,to,kind,contract:{output:'roi-pose',version:'current'}}))};}
function board(){return project.boards[selected]??=( {zoom:1,x:0,y:0,selected:[],draft:'',bubbles:[],pins:[]} );}
function button(parent,text,fn){const b=el('button',text,parent);b.onclick=async()=>{try{await fn();}catch(e){message(e.message);}};return b;}
function render(){
 const app=$('#app');app.replaceChildren();const header=el('header',undefined,app);el('strong','◈ AgentCV',header);el('span','依赖图 · 意图画板',header);
 button(header,'导入图片',()=>pick('image/*',false));button(header,'导入文件夹',()=>pick('image/*',true));button(header,'钉 PDF',()=>pick('application/pdf',false));button(header,'打开项目',open);button(header,'导出 JSON',save);
 button(header,'提议依赖样例',async()=>{pending=await ops.propose(new MockRuntime(proposal()),project.boards);render();});
 button(header,'本地执行',async()=>{await ops.run();refresh();persist();render();message('已离线执行；未配置算法的节点明确失败，下游沿 requires 阻塞。');});
 const notice=el('div','项目自动保存在本机；可导出可审查的 JSON。示例提议不代表算法结论。',app);notice.id='notice';notice.setAttribute('role','status');
 const layout=el('main',undefined,app),graph=el('section',undefined,layout);graph.className='graph-panel';const gh=el('div',undefined,graph);gh.className='section-head';el('h2','依赖 DAG',gh);button(gh,list?'切回 DAG':'列表视图',()=>{list=!list;render();});
 el('p','蓝实线 requires · 青虚线 shares 共享实例扇出',graph).className='legend';
 const area=el('div',undefined,graph);area.className=list?'node-list':'dag';
 if(!project.nodes.length)el('p','导入资料，在板上标记意图；也可查看并审核结构样例。',area);
 const positions=new Map();function depth(id,seen=new Set()){if(seen.has(id))return 0;seen.add(id);return Math.max(0,...project.edges.filter(e=>e.to===id&&e.kind==='requires').map(e=>depth(e.from,new Set(seen))+1));}
 const levels={};for(const n of project.nodes){const d=depth(n.id),row=levels[d]||0;levels[d]=row+1;positions.set(n.id,{x:15+d*205,y:20+row*145});}
 if(!list){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','edges');svg.setAttribute('width',Math.max(650,project.nodes.length*205));svg.setAttribute('height',Math.max(320,...Object.values(levels).map(x=>x*145+20)));svg.innerHTML='<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#6e9dff"/></marker></defs>';area.append(svg);for(const e of project.edges){const a=positions.get(e.from),b=positions.get(e.to),path=document.createElementNS(svg.namespaceURI,'path'),off=e.kind==='shares'?14:0;path.setAttribute('d',`M ${a.x+180} ${a.y+44+off} C ${a.x+200} ${a.y+44+off}, ${b.x-20} ${b.y+44+off}, ${b.x} ${b.y+44+off}`);path.setAttribute('class',e.kind);path.setAttribute('marker-end','url(#arrow)');const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=e.kind+' · '+e.id;path.append(title);svg.append(path);}}
 for(const n of project.nodes){const card=button(area,'',()=>{selected=n.id;persist();render();});card.className='node '+(n.id===selected?'active':'');if(!list){card.style.left=positions.get(n.id).x+'px';card.style.top=positions.get(n.id).y+'px';}el('small',n.kind+' · v'+n.version,card);el('b',n.title,card);if(project.edges.some(e=>e.from===n.id&&e.kind==='shares'))el('span','共享',card).className='badge';el('small',project.runs[n.id]?.status||'待执行',card);}
 const panel=el('section',undefined,layout);panel.className='work-panel';renderWorkspace(panel);
 if(pending){const review=el('section',undefined,app);review.className='review';el('h3','Agent 提议 · 待人工确认',review);el('p','只提出依赖结构；不包含算法运行证据。可逐边否决，意图标记保留。',review);for(const e of pending.edges){const row=el('div',undefined,review);el('span',`${e.from} → ${e.to} · ${e.kind}`,row);button(row,'否决此边',()=>{pending=ops.reject(pending,e.id);refresh();persist();render();});}const details=el('details',undefined,review);el('summary','解释 / 参数 / 适用边界',details);el('pre',JSON.stringify(pending,null,2),details);button(review,'接受提议',()=>{const result=ops.accept(pending);if(result.status==='accepted'){refresh();selected=pending.nodes[0]?.id;pending=null;persist();render();}else message(JSON.stringify(result));});button(review,'否决整包',()=>{ops.reject(pending);refresh();persist();pending=null;render();});}
}
function renderWorkspace(panel){
 const n=project.nodes.find(n=>n.id===selected);if(!n)selected='intent';const state=board();const toolbar=el('div',undefined,panel);toolbar.className='section-head';el('h2',n?n.title+' · 节点工作区':'人类意图画板',toolbar);
 button(toolbar,'问题气泡',()=>{if(!state.selected.length)throw Error('先选中图片或 ROI');state.bubbles.push({id:crypto.randomUUID(),text:state.draft||'这些标记之间是什么关系？',status:'draft',x:30,y:35});persist();render();});
 button(toolbar,'距离 / 关系钉',()=>{if(state.selected.length!==2)throw Error('请选择两张图片上的对象（按住 Shift 多选）');state.pins.push({objects:[...state.selected],name:'中心距离',ax:0,ay:0,bx:100,by:0});persist();render();});
 button(toolbar,'重置视野',()=>{state.zoom=1;state.x=state.y=0;persist();render();});
 const viewport=el('div',undefined,panel);viewport.className='viewport';const world=el('div',undefined,viewport);world.className='world';const transform=()=>world.style.transform=`translate(${state.x}px,${state.y}px) scale(${state.zoom})`;transform();
 viewport.onwheel=e=>{e.preventDefault();const rect=viewport.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,z=state.zoom,next=Math.max(.25,Math.min(3,z*Math.exp(-e.deltaY*.001)));state.x=x-(x-state.x)*next/z;state.y=y-(y-state.y)*next/z;state.zoom=next;transform();persist();};
 viewport.onpointerdown=e=>{if(e.target!==viewport&&e.target!==world)return;const x=e.clientX,y=e.clientY,ox=state.x,oy=state.y;viewport.setPointerCapture(e.pointerId);viewport.onpointermove=e=>{state.x=ox+e.clientX-x;state.y=oy+e.clientY-y;transform();};viewport.onpointerup=()=>{viewport.onpointermove=null;persist();};};
 const sources=n?.kind==='Locate'?[n]:n?upstreamSources(project,n.id):[];
 for(const [index,a] of project.assets.entries()){
 const item=el('article',undefined,world);item.className='asset '+(state.selected.includes(a.id)?'selected':'');item.style.left=(30+(index%2)*355)+'px';item.style.top=(25+Math.floor(index/2)*310)+'px';el('b',a.name,item);
 item.onclick=e=>{if(e.target.closest('input,button,object'))return;state.selected=e.shiftKey?[...new Set([...state.selected,a.id])]:[a.id];persist();render();};
 if(a.mime==='application/pdf'){const obj=el('object',undefined,item);obj.type='application/pdf';obj.data=a.dataUrl;el('a','打开 PDF',item).href=a.dataUrl;continue;}
 const picture=el('div',undefined,item);picture.className='picture';const img=el('img',undefined,picture);img.src=a.dataUrl;img.alt=a.name;
 for(const source of sources){const roi=source.params.roi;if(!roi)continue;const overlay=el('div',undefined,picture);overlay.className='roi '+(source.id!==n?.id?'ghost':'');Object.assign(overlay.style,{left:roi.x+'%',top:roi.y+'%',width:roi.w+'%',height:roi.h+'%'});el('span',(source.id===n?.id?'共享源':'只读幽灵')+' · v'+source.version,overlay);overlay.onclick=e=>{e.stopPropagation();state.selected=[source.id];persist();render();};}
 }
 if(!project.assets.length)el('p','在同一画板导入多张检测图与 PDF；按住 Shift 选择两个对象。',world);
 if(n?.kind==='Locate'){
 const edit=el('fieldset',undefined,panel);el('legend','唯一可编辑 ROI（百分比坐标；所有图片共用，需核验成像配置）',edit);
 for(const key of ['x','y','w','h']){const label=el('label',key,edit),input=el('input',undefined,label);input.type='number';input.min=0;input.max=100;input.value=n.params.roi?.[key]??0;input.onchange=()=>{try{const roi={...n.params.roi,[key]:Number(input.value)};if(Object.values(roi).some(x=>!Number.isFinite(x)||x<0)||roi.w<=0||roi.h<=0||roi.x+roi.w>100||roi.y+roi.h>100)throw Error('ROI 必须在图片范围内');ops.revise(n.id,{params:{...n.params,roi}});refresh();persist();render();}catch(e){message(e.message);}};}
 }else if(sources.length){const info=el('div',undefined,panel);el('span','幽灵 ROI 只读；编辑请回共享源。',info);sources.forEach(s=>button(info,'打开 '+s.title,()=>{selected=s.id;render();}));}
 const draft=el('input',undefined,panel);draft.placeholder='选中标记后，在这里写问题草稿';draft.value=state.draft;draft.oninput=()=>{state.draft=draft.value;persist();};
 for(const bubble of state.bubbles){const box=el('section',undefined,world);box.className='bubble';box.style.left=bubble.x+'px';box.style.top=bubble.y+'px';const handle=el('b',bubble.status==='draft'?'人类草稿 · 拖动':'已确认的问题 · 拖动',box);handle.onpointerdown=e=>{e.stopPropagation();handle.setPointerCapture(e.pointerId);const x=e.clientX,y=e.clientY,ox=bubble.x,oy=bubble.y;handle.onpointermove=e=>{bubble.x=ox+(e.clientX-x)/state.zoom;bubble.y=oy+(e.clientY-y)/state.zoom;box.style.left=bubble.x+'px';box.style.top=bubble.y+'px';};handle.onpointerup=()=>{handle.onpointermove=null;persist();};};const input=el('textarea',undefined,box);input.value=bubble.text;input.oninput=()=>{bubble.text=input.value;persist();};button(box,'确认问题',()=>{bubble.status='confirmed';persist();render();message('问题已确认并保留在画板；尚未接入在线回答。');});button(box,bubble.collapsed?'展开':'收合',()=>{bubble.collapsed=!bubble.collapsed;persist();render();});if(bubble.collapsed)input.hidden=true;}
 for(const pin of state.pins){const field=el('fieldset',undefined,panel);el('legend',pin.objects.map(id=>project.assets.find(a=>a.id===id)?.name||id).join(' ↔ '),field);for(const key of ['name','ax','ay','bx','by']){const label=el('label',key,field),input=el('input',undefined,label);input.value=pin[key];input.type=key==='name'?'text':'number';input.onchange=()=>{pin[key]=key==='name'?input.value:Number(input.value);persist();render();};}el('output',`${Math.hypot(pin.bx-pin.ax,pin.by-pin.ay).toFixed(2)} px · 人工定义坐标，未校准`,field);}
 if(n){const detail=el('details',undefined,panel);el('summary','节点解释 / 参数 / 适用边界 / 执行记录',detail);el('pre',JSON.stringify({node:n,run:project.runs[n.id]},null,2),detail);}
}
async function pick(accept,folder){const input=document.createElement('input');input.type='file';input.accept=accept;input.multiple=true;if(folder)input.webkitdirectory=true;input.onchange=async()=>{try{for(const file of input.files){if(!file.type.startsWith('image/')&&file.type!=='application/pdf')continue;const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});project.assets.push({id:crypto.randomUUID(),name:file.name,mime:file.type,dataUrl});}persist();render();}catch(e){message(e.message);}};input.click();}
function save(){persist();const blob=new Blob([ops.save()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='project.agentcv.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function open(){const input=document.createElement('input');input.type='file';input.accept='.json,.agentcv';input.onchange=async()=>{try{const next=loadProject(await input.files[0].text());ops.load(serializeProject(next));refresh();selected=null;pending=null;persist();render();}catch(e){message(e.message);}};input.click();}
render();
