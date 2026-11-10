// Engineering hierarchy contributes lifecycle prerequisites, not fake data edges.
// A parent's own saved execution remains immutable; purpose status is aggregated.
export function hierarchyOf(nodes){
 const byId=new Map(nodes.map(n=>[n.id,n])),children=new Map(nodes.map(n=>[n.id,[]]));for(const node of nodes)if(children.has(node.parentId))children.get(node.parentId).push(node.id);
 const inside=(id,parent)=>{let n=byId.get(id),seen=new Set();while(n?.parentId&&!seen.has(n.id)){seen.add(n.id);if(n.parentId===parent)return true;n=byId.get(n.parentId);}return false;};
 const descendants=id=>nodes.filter(n=>inside(n.id,id)).map(n=>n.id);
 return {byId,children,inside,descendants};
}
export function lifecycleOrder(nodes,edges){
 const hierarchy=hierarchyOf(nodes),derived=[];
 for(const edge of edges)if(!hierarchy.inside(edge.to,edge.from))for(const child of hierarchy.descendants(edge.from))if(child!==edge.to&&!edges.some(e=>e.from===child&&e.to===edge.to)&&!derived.some(e=>e.from===child&&e.to===edge.to))derived.push({from:child,to:edge.to,kind:'parent-completion',parentId:edge.from});
 const all=[...edges,...derived],seen=new Set(),order=[];while(order.length<nodes.length){const node=nodes.find(n=>!seen.has(n.id)&&all.filter(e=>e.to===n.id).every(e=>seen.has(e.from)));if(!node)return {ok:false,order,dependencies:derived};seen.add(node.id);order.push(node.id);}return {ok:true,order,dependencies:derived};
}
export function aggregatePurposeStates(nodes,states){
 const hierarchy=hierarchyOf(nodes),byState=new Map(states.map(s=>[s.nodeId,s])),done=new Set();
 const visit=id=>{const own=byState.get(id);if(!own)return 'PENDING';if(done.has(id))return own.status;const ownStatus=own.ownStatus??own.status;own.ownStatus=ownStatus;const relevant=(hierarchy.children.get(id)||[]).map(child=>byState.get(child)).filter(child=>!(child?.status==='SKIPPED'&&child.reason==='BRANCH_NOT_SELECTED'));const observed=relevant.map(child=>({id:child?.nodeId,status:child?visit(child.nodeId):'PENDING'})),alternatives=new Set(hierarchy.byId.get(id)?.prerequisites?.anyOf||[]),recovered=observed.some(child=>alternatives.has(child.id)&&child.status==='VALID'),statuses=observed.filter(child=>!recovered||!alternatives.has(child.id)).map(child=>child.status);let status=ownStatus,reason=null;
  if(ownStatus==='FAULT'||observed.some(child=>child.status==='FAULT')){status='FAULT';if(ownStatus!=='FAULT')reason='CHILD_FAULT_PROPAGATED';}
  else if(ownStatus==='RUNNING'||statuses.includes('RUNNING'))status='RUNNING';
  else if(ownStatus==='PENDING')status='PENDING';
  else if(statuses.includes('PENDING'))status=ownStatus==='VALID'?'RUNNING':'PENDING';
  else if(ownStatus==='NOT_FOUND'||statuses.includes('NOT_FOUND')){status='NOT_FOUND';if(ownStatus!=='NOT_FOUND')reason='CHILD_RESULT_UNAVAILABLE';}
  else if(ownStatus!=='VALID'||statuses.some(s=>s!=='VALID')){status='SKIPPED';if(ownStatus==='VALID')reason='CHILD_PREREQUISITE_UNAVAILABLE';}
  own.status=status;own.purposeStatus=status;own.purposeValid=status==='VALID';if(reason)own.purposeReason=reason;done.add(id);return status;
 };for(const node of nodes)visit(node.id);return byState;
}
