import {emptyProject,loadProject,serializeProject,validateGraph,acceptProposal,reviseNode,rejectEdge} from './dag-model.js';
import {executeGraph} from './dag-executor.js';
import {buildReport as buildRegressionReport} from './regression-reporter.js';
/** Shared UI/headless operation boundary. Snapshots never expose owned state. */
export class AgentOps {
 #project; #listeners=new Set();
 constructor(project=emptyProject(),algorithms={}){this.#project=loadProject(serializeProject(project));this.algorithms=algorithms;}
 snapshot(){return structuredClone(this.#project);}
 subscribe(fn){this.#listeners.add(fn);return ()=>this.#listeners.delete(fn);}
 #emit(){for(const fn of this.#listeners)fn(this.snapshot());}
 load(text){this.#project=loadProject(text);this.#emit();return this.snapshot();}
 save(){return serializeProject(this.#project);}
 validate(proposal){return validateGraph(proposal);}
 list(){return {nodes:this.snapshot().nodes,edges:this.snapshot().edges};}
 get(id){return this.snapshot().nodes.find(n=>n.id===id);}
 status(){return this.snapshot().runs;}
 setWorkspace({assets,boards}){this.#project.assets=structuredClone(assets);this.#project.boards=structuredClone(boards);this.#emit();}
 async propose(runtime,intent){return runtime.propose({intent:structuredClone(intent),graph:this.snapshot()});}
 create(proposal){return this.accept(proposal);}
 accept(proposal){const result=acceptProposal(this.#project,proposal);if(result.status==='accepted')this.#emit();return result;}
 revise(id,patch){reviseNode(this.#project,id,patch);this.#emit();return this.get(id);}
 reviseEdge(id,patch){const p=this.snapshot(),edge=p.edges.find(e=>e.id===id);if(!edge)throw Error('unknown edge');Object.assign(edge,structuredClone(patch),{id});const errors=validateGraph({nodes:p.nodes,edges:p.edges});if(errors.length)return {status:'invalid_proposal',errors};for(const n of p.nodes)p.runs[n.id]={status:'stale',previous:p.runs[n.id],blocked_by:[]};this.#project=p;this.#emit();return {status:'accepted'};}
 remove({nodes=[],edges=[]}){const p=this.snapshot();p.nodes=p.nodes.filter(n=>!nodes.includes(n.id));p.edges=p.edges.filter(e=>!edges.includes(e.id)&&!nodes.includes(e.from)&&!nodes.includes(e.to));const errors=validateGraph({nodes:p.nodes,edges:p.edges});if(errors.length)return {status:'invalid_proposal',errors};for(const n of p.nodes){p.runs[n.id]={status:'stale',previous:p.runs[n.id],blocked_by:[]};}for(const id of nodes){delete p.runs[id];delete p.boards[id];}this.#project=p;this.#emit();return {status:'accepted'};}
 reject(proposal,edgeId){const q=structuredClone(proposal);if(edgeId)rejectEdge(this.#project,q,edgeId);else this.#project.rejections.push({proposal:q,status:'rejected'});this.#emit();return edgeId?q:null;}
 async run(id=null){const report=await executeGraph(this.#project,this.algorithms,id);this.#emit();return report;}
 report(){return buildReport(this.#project);}
}
export function buildReport(project){return buildRegressionReport(project);}
