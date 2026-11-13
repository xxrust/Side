import {hierarchyOf,aggregatePurposeStates} from './workpiece-lifecycle.js';

const clone=value=>JSON.parse(JSON.stringify(value));
export const nodeRunState=run=>!run?'SKIPPED':run.execution?.status==='FAULT'||run.status!=='SUCCEEDED'?'FAULT':run.result?.valid===false?'NOT_FOUND':'VALID';

// The production JS scheduler remains the compatibility oracle while ownership
// moves into Rust. Keep execution, progress and failure policy as explicit ports.
export async function scheduleWorkpieceNodes({nodes,graph,nodeStates,runMap,runs,inputFault,
 cancelled=()=>false,execute,onNodeStart=()=>{},recordNodeState,isFatalError=()=>false}){
 const hierarchy=hierarchyOf(graph.nodes);
 const prerequisiteState=(id,consumer)=>hierarchy.inside(consumer,id)?nodeRunState(runMap.get(id))
  :aggregatePurposeStates(graph.nodes,nodeStates).get(id)?.status||'PENDING';
 for(const node of nodes){
  if(inputFault){recordNodeState({nodeId:node.id,status:'SKIPPED',reason:'INPUT_UNAVAILABLE'});continue;}
  if(cancelled()){recordNodeState({nodeId:node.id,status:'SKIPPED',reason:'CANCELLED'});continue;}
  const parents=(graph.edges||[]).filter(e=>e.to===node.id).map(e=>e.from),alternatives=node.prerequisites?.anyOf||[],selected=node.when?prerequisiteState(node.when.nodeId,node.id):null;
  const when=node.when?(node.when.status==='COMPLETED'?['VALID','NOT_FOUND'].includes(selected):selected===node.when.status):true;
  const required=parents.filter(p=>p!==node.when?.nodeId&&!alternatives.includes(p));
  if(!when||required.some(p=>prerequisiteState(p,node.id)!=='VALID')||alternatives.length&&!alternatives.some(p=>prerequisiteState(p,node.id)==='VALID')){
   recordNodeState({nodeId:node.id,status:'SKIPPED',reason:!when?'BRANCH_NOT_SELECTED':'PREREQUISITE_UNAVAILABLE',blockedBy:required.filter(p=>prerequisiteState(p,node.id)!=='VALID')});continue;
  }
  const upstream={};let unavailable=false;
  for(const [slot,input]of Object.entries(node.inputs||{})){
   const parent=runMap.get(input.nodeId),artifact=parent?.artifacts.find(a=>a.id===input.artifactId);
   if(prerequisiteState(input.nodeId,node.id)!=='VALID'||!artifact){if(alternatives.includes(input.nodeId))continue;unavailable=true;break;}
   upstream[slot]={nodeId:input.nodeId,runId:parent.runId,artifact:clone(artifact)};
  }
  if(unavailable){recordNodeState({nodeId:node.id,status:'SKIPPED',reason:'REQUIRED_ARTIFACT_UNAVAILABLE'});continue;}
  const nodeStart=performance.now();onNodeStart(node);
  let run;
  try{run=await execute(node,upstream);}
  catch(error){if(isFatalError(error))throw error;recordNodeState({nodeId:node.id,status:'FAULT',reason:'DISPATCH_FAULT',error:{type:error?.name||'Error',message:String(error?.message||error)},durationMs:performance.now()-nodeStart});continue;}
  runMap.set(node.id,run);runs.push(run);
  recordNodeState({nodeId:node.id,runId:run.runId,status:nodeRunState(run),execution:clone(run.execution),durationMs:performance.now()-nodeStart,evidenceStatus:run.evidenceAudit?.status});
 }
}
