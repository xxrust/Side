import {proposalSchema,validateSchema} from './dag-schema.js';
const copy=x=>structuredClone(x);
export const emptyProject=()=>({schema:'agentcv-dag-0.2',nodes:[],edges:[],assets:[],boards:{},rejections:[],runs:{}});
export function validateGraph(proposal){
 const errors=validateSchema(proposalSchema,proposal);if(errors.length)return errors;
 const ids=new Map(),edgeIds=new Set(),pairs=new Set();const error=(path,message)=>errors.push({path,message});
 proposal.nodes.forEach((n,i)=>{if(ids.has(n.id))error(`$.nodes[${i}].id`,'duplicate id');ids.set(n.id,n);
 if(n.kind==='Locate'&&!(n.params.roi||n.params.pose))error(`$.nodes[${i}].params`,'Locate requires roi or pose');
 if(n.kind==='Defect'&&(!n.params.metric||!Number.isFinite(n.params.threshold)))error(`$.nodes[${i}].params`,'Defect requires metric and numeric threshold');});
 proposal.edges.forEach((e,i)=>{const p=`$.edges[${i}]`,key=[e.from,e.to,e.kind].join(':');if(edgeIds.has(e.id)||pairs.has(key))error(p,'duplicate edge');edgeIds.add(e.id);pairs.add(key);
 if(!ids.has(e.from)||!ids.has(e.to)||e.from===e.to)error(p,'invalid endpoint');
 if(e.kind==='shares'){
 if(ids.get(e.from)?.kind!=='Locate')error(p,'shared source must be Locate');
 if(!proposal.edges.some(r=>r.kind==='requires'&&r.from===e.from&&r.to===e.to))error(p,'shares requires same-source requires (plan B)');}
 });
 proposal.nodes.forEach((n,i)=>{if(n.kind==='Offset'&&(!n.params.transform||!proposal.edges.some(e=>e.kind==='requires'&&e.to===n.id&&e.from===n.params.refNodeId&&ids.get(e.from)?.kind==='Locate')))error(`$.nodes[${i}].params`,'Offset requires transform and Locate refNodeId prerequisite');});
 const visiting=new Set(),done=new Set();function visit(id){if(visiting.has(id)){error('$.edges','cycle');return;}if(done.has(id))return;visiting.add(id);for(const e of proposal.edges.filter(e=>e.from===id))visit(e.to);visiting.delete(id);done.add(id);}for(const id of ids.keys())visit(id);
 return errors;
}
// Validate the entire candidate before any node/edge write. Rejected packages are diagnostic only.
export function acceptProposal(project,proposal){
 const shape=validateSchema(proposalSchema,proposal);const candidate=shape.length?null:{nodes:[...project.nodes,...proposal.nodes],edges:[...project.edges,...proposal.edges]};
 const errors=shape.length?shape:validateGraph(candidate);
 if(errors.length)return {status:'invalid_proposal',errors};
 project.nodes=copy(candidate.nodes);project.edges=copy(candidate.edges);return {status:'accepted',errors:[]};
}
export function serializeProject(project){return JSON.stringify(project,null,2)+'\n';}
export function loadProject(text){const p=JSON.parse(text);if(p.schema!=='agentcv-dag-0.2')throw Error('需要 DAG v0.2 项目；旧工程请保留原文件');const errors=validateGraph({nodes:p.nodes,edges:p.edges});if(errors.length)throw Error(JSON.stringify(errors));if(!Array.isArray(p.assets)||!p.boards||!p.runs||!Array.isArray(p.rejections))throw Error('项目工作区字段缺失');return p;}
export function upstreamSources(project,id){const found=new Set();function walk(to){for(const e of project.edges.filter(e=>e.to===to&&e.kind==='requires'))if(!found.has(e.from)){found.add(e.from);walk(e.from);}}walk(id);return project.nodes.filter(n=>n.kind==='Locate'&&found.has(n.id));}
export function reviseNode(project,id,patch){const n=project.nodes.find(n=>n.id===id);if(!n)throw Error('unknown node');const next={...copy(n),...copy(patch),id:n.id,version:n.version+1};const candidate={nodes:project.nodes.map(x=>x.id===id?next:x),edges:project.edges};const errors=validateGraph(candidate);if(errors.length)throw Error(JSON.stringify(errors));project.nodes=candidate.nodes;
 const seen=new Set([id]);function mark(from){for(const e of project.edges.filter(e=>e.from===from&&e.kind==='requires'))if(!seen.has(e.to)){seen.add(e.to);const old=project.runs[e.to];project.runs[e.to]={status:'stale',previous:old,blocked_by:[{nodeId:from,edgeId:e.id,field:'version'}]};mark(e.to);}}mark(id);delete project.runs[id];}
export function rejectEdge(project,proposal,edgeId){const edge=proposal.edges.find(e=>e.id===edgeId);if(!edge)return;project.rejections.push(copy(edge));proposal.edges=proposal.edges.filter(e=>e.id!==edgeId&&!(edge.kind==='requires'&&e.kind==='shares'&&e.from===edge.from&&e.to===edge.to));}
