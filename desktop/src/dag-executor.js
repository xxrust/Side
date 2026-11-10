import {validateGraph} from './dag-model.js';
// Runtime is deliberately absent here. Algorithms receive inputs, never known labels.
export async function executeGraph(project,algorithms={},target=null){
 const errors=validateGraph({nodes:project.nodes,edges:project.edges});if(errors.length)throw Error(JSON.stringify(errors));
 if(target&&!project.nodes.some(n=>n.id===target))throw Error("unknown node: "+target);
 const done=new Set(),runs=structuredClone(project.runs);
 async function run(node){if(done.has(node.id))return;const edges=project.edges.filter(e=>e.to===node.id&&e.kind==='requires');for(const e of edges)await run(project.nodes.find(n=>n.id===e.from));
 const blocked_by=edges.flatMap(e=>{const r=runs[e.from];return r.status==='succeeded'?[]:[{nodeId:e.from,edgeId:e.id,field:r.field||r.blocked_by?.[0]?.field||'execution',causes:r.blocked_by||[]}];});
 const versions=Object.fromEntries(edges.map(e=>[e.from,project.nodes.find(n=>n.id===e.from).version]));let result;
 if(blocked_by.length)result={status:'blocked',blocked_by};else try{
 const handler=algorithms[node.kind];if(!handler)throw Error('未配置本地算法');
 const output=await handler({node:structuredClone(node),inputs:Object.fromEntries(edges.map(e=>[e.from,structuredClone(runs[e.from])]))});
 if(!output||!['succeeded','failed','oob'].includes(output.status))throw Error('算法状态不合法');
 result={...output};
 for(const [field,bounds] of Object.entries(node.applicability))if(output.status==='succeeded'&&bounds&&typeof bounds==='object'&&('min'in bounds||'max'in bounds)){
 const value=output.metrics?.[field];if(!Number.isFinite(value)||bounds.min!==undefined&&value<=bounds.min||bounds.max!==undefined&&value>=bounds.max){result.status='oob';result.field='applicability.'+field;break;}}
 }catch(error){result={status:'failed',field:'execution',error:error.message};}
 runs[node.id]={...result,nodeVersion:node.version,inputVersions:versions,evidence:result.evidence??'unknown',conformance:result.conformance??'unknown'};done.add(node.id);}
 for(const node of project.nodes.filter(n=>!target||n.id===target))await run(node);project.runs=runs;return {schema:'agentcv-regression-0.2',runs:structuredClone(runs)};
}
