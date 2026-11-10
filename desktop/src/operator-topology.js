import {buildProgramFlow} from './program-flow.js';
const list=x=>Array.isArray(x)?x:[];
/** Inner graph is reconstructed from saved instance dependencies and explicit
 * image/upstream/artifact bindings. Sequential order is never a data edge. */
export function buildOperatorTopology(project,runId,scopeId){
 const data=project.data||project,run=list(data.algorithmRuns).find(r=>r.runId===runId);if(!run)throw Error('此節點的實算紀錄不存在');
 const full=buildProgramFlow([run]),root=full.roots[0],scope=full.nodes.find(n=>n.id===(scopeId||root));if(!scope)throw Error('此內部程序實例不存在');
 const included=new Set([scope.id]);let changed=true;while(changed){changed=false;for(const edge of full.edges)if(edge.kind==='contains'&&included.has(edge.from)&&!included.has(edge.to)){included.add(edge.to);changed=true;}}
 const raw=new Map(list(run.procedureTrace?.nodes).map(n=>[runId+'::'+n.instanceId,n])),nodes=full.nodes.filter(n=>included.has(n.id)&&n.kind!=='run').map(n=>({...n,parentId:included.has(n.parentId)&&n.parentId!==root?n.parentId:null,status:raw.get(n.id)?.execution?.status==='FAULT'?'FAULT':raw.get(n.id)?.validity?.status==='NOT_FOUND'?'NOT_FOUND':n.status,role:n.kind==='procedure'?'procedure':'operator'})),ids=new Set(nodes.map(n=>n.id)),edges=[],diagnostics=[...full.diagnostics];
 const append=(from,to,basis,label)=>{if(from===to)return;const existing=edges.find(e=>e.from===from&&e.to===to);if(existing){existing.additionalBasis=[...new Set([...(existing.additionalBasis||[]),basis])];if(existing.label!==label)existing.label+='；'+label;return;}edges.push({id:`${basis}:${from}:${to}`,from,to,kind:'dependency',basis,label});};
 for(const edge of full.edges.filter(e=>e.kind==='dependency')){if(ids.has(edge.from)&&ids.has(edge.to))append(edge.from,edge.to,'dependencyInstances','已記錄的執行前提');else if(ids.has(edge.to)||ids.has(edge.from)){const externalId=ids.has(edge.to)?edge.from:edge.to,external=full.nodes.find(n=>n.id===externalId);if(external&&!ids.has(externalId)){nodes.push({...external,parentId:null,kind:'step',role:ids.has(edge.to)?'input':'output',title:'邊界 · '+external.title});ids.add(externalId)}append(edge.from,edge.to,'dependencyInstances','跨入／跨出前提');}}
 const sourceById=new Map(list(run.sourceBinding?.images).map(image=>[image.imageId,image])),upstream=run.upstreamBindings||{},artifacts=list(run.artifacts),artifactById=new Map(artifacts.map(a=>[a.id,a]));
 const addInput=(id,title,metadata,to,basis)=>{if(!ids.has(id)){nodes.push({id,title,role:'input',kind:'step',status:'SUCCEEDED',parentId:null,metadata,inputs:{},outputs:{},runId});ids.add(id)}append(id,to,basis,'輸入');};
 const strings=value=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(strings):value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
 for(const node of [...nodes].filter(n=>raw.has(n.id))){const item=raw.get(node.id);for(const declared of list(item.dependsOn)){if(!list(item.dependencyInstances).length)diagnostics.push({code:'UNRESOLVED_OPERATOR_DEPENDENCY',nodeId:node.id,message:`${node.title} 宣告前提 ${declared}，卻沒有保存依賴實例；未按次序補線。`});}
  for(const [port,value]of Object.entries(item.inputs||{}))for(const ref of strings(value)){
   if(node.kind==='procedure'&&nodes.some(child=>child.parentId===node.id&&strings(child.inputs).includes(ref)))continue;
   const image=sourceById.get(ref);if(image){const label=list(data.images).find(i=>i.id===ref)?.name||ref;addInput('input-image:'+runId+':'+ref,'圖像 · '+label,{imageId:ref,port,sha256:image.imageSha256,width:image.width,height:image.height},node.id,'input-image-id');continue;}
   if(ref.startsWith('upstream.')){const slot=ref.slice(9),binding=upstream[slot];if(binding){addInput('input-upstream:'+runId+':'+slot,'上游 · '+slot,{...binding,port},node.id,'upstream-slot');}else diagnostics.push({code:'MISSING_UPSTREAM_INPUT',nodeId:node.id,message:`${node.title} 的 ${port} 引用 ${ref}，缺少已保存的上游綁定。`});continue;}
   const artifact=artifactById.get(ref);if(artifact?.traceNodeId){const producer=runId+'::'+artifact.traceNodeId;if(ids.has(producer))append(producer,node.id,'artifact-input-id',`產物 ${ref} → ${port}`);}
  }
 }
 // Each exported artifact stays attached to its exact recorded producer.
 for(const artifact of artifacts){const producer=runId+'::'+artifact.traceNodeId;if(!included.has(producer))continue;const id='output:'+runId+':'+artifact.id;nodes.push({id,title:(artifact.type==='image'?'圖像 · ':'數據 · ')+artifact.id,kind:'step',role:'output',status:'SUCCEEDED',parentId:null,runId,artifactId:artifact.id,metadata:{type:artifact.type,sha256:artifact.sha256,producer:artifact.traceNodeId},inputs:{},outputs:{}});ids.add(id);append(producer,id,'artifact-producer','產生');}
 const operators=nodes.filter(n=>n.role==='operator');if(!operators.length)diagnostics.push({code:'NO_OPERATOR_TRACE',message:'未保存內部算子實例；只有整段執行紀錄，無法還原演算法拓撲。'});
 if(operators.length>1&&!edges.some(e=>raw.has(e.from)&&raw.has(e.to)))diagnostics.push({code:'NO_OPERATOR_DEPENDENCIES',message:'已記錄多個算子，但沒有算子間前提／產物引用。它們可能獨立，也可能漏記；不能按執行次序畫成鏈。'});
 return {schema:'agentcv-operator-topology-1',runId,scopeId:scope.id,title:scope.title,nodes,edges,roots:nodes.filter(n=>!n.parentId).map(n=>n.id),diagnostics,coverage:'僅顯示本次已保存的實例與條件；未記錄的分支不推演為已執行。'};
}
