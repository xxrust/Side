import ELK from 'elkjs/lib/elk.bundled.js';
import {flowVisual} from './flow-visual-grammar.js';


// Reserve space for semantic branch labels in ELK, rather than dropping them
// when an unlabelled route has no spare room. Full condition stays in metadata.
export function classificationBranchLabel(edge){
 if(edge.provenance!=='classification-route'||!edge.label)return null;
 const lines=[];let line='',width=0;for(const char of edge.label){const size=char.charCodeAt(0)>255?11:6;if(width+size>180&&line){lines.push(line);line='';width=0;}line+=char;width+=size;}if(line)lines.push(line);
 const shown=lines.slice(0,3);if(lines.length>3)shown[2]=shown[2].slice(0,-1)+'…';return {lines:shown,width:190,height:shown.length*15+8};
}

const ROOT='__program_layout_root__';
const defaults={nodeWidth:150,nodeHeight:62,groupPadding:16,groupHeader:56,nodeGap:22,layerGap:36,margin:16,direction:'DOWN',balanced:false,portHeight:null};
const list=value=>Array.isArray(value)?value:[];
const configuration=options=>Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,options?.[key]??value]));
const project=(value,keys)=>Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
// Geometry caches must never retain the source program, dense arrays or image
// artifact bytes. Evidence panels resolve the original node through its ID.
const nodeMetadata=node=>({...project(node,['id','parentId','kind','title','status','judgement','runId','instanceId','stepId','legacy','codeSha256','durationMs','skipReason']),...(node.sourceImages?{sourceImages:node.sourceImages.map(image=>project(image,['imageId','imageSha256','width','height','pixelFingerprint','assetFingerprint']))}:{})});

/** Status/evidence changes do not change geometry. The caller can cache this
 * key and rebind the current node metadata when reusing positions. */
export function programFlowLayoutKey(flow,options={}){
 return JSON.stringify([list(flow?.nodes).map(({id,parentId,kind,title})=>[id,parentId,kind,title]),list(flow?.edges).filter(edge=>edge.kind==='dependency').map(edge=>[edge.id,edge.from,edge.to,classificationBranchLabel(edge)]),configuration(options)]);
}

/** Layout saved instances, never infer execution from containment or names.
 * Positions and routes are absolute graph coordinates. Nonempty procedures
 * live in groups; leaf steps, empty procedures and legacy runs live in nodes.
 * Hidden run roots remain selectable through the external entries.
 */
export async function layoutProgramFlow(flow,options={}){
 const config=configuration({...(flow?.nodes?.some(n=>n.boundary)?{nodeWidth:210,nodeHeight:62,nodeGap:44,layerGap:66}:{}),...options}),diagnostics=[...list(flow?.diagnostics)];
 // ELK does not inherit spacing from the root into compound subgraphs.
 // Apply the same policy at every procedure's own layout boundary.
 const sharedLayoutOptions={
  'elk.algorithm':'layered','elk.direction':config.direction,'elk.hierarchyHandling':'INCLUDE_CHILDREN',
  ...(config.balanced?{'elk.layered.nodePlacement.bk.fixedAlignment':'BALANCED'}:{}),
  'elk.edgeRouting':'ORTHOGONAL','elk.spacing.nodeNode':String(config.nodeGap),
  'elk.layered.spacing.nodeNodeBetweenLayers':String(config.layerGap),
 };
 const input=list(flow?.nodes),byId=new Map();
 for(const node of input){
  if(!node?.id||byId.has(node.id)){diagnostics.push({code:'LAYOUT_INVALID_NODE',nodeId:node?.id});continue;}
  byId.set(node.id,node);
 }
 const dependencies=list(flow?.edges).filter(edge=>edge.kind==='dependency');
 const used=new Set(dependencies.flatMap(edge=>[edge.from,edge.to]));
 const hidden=new Set(input.filter(node=>node.kind==='run'&&input.some(child=>child.parentId===node.id)&&!used.has(node.id)).map(node=>node.id));
 const visible=[...byId.values()].filter(node=>!hidden.has(node.id));
 const elkNodes=new Map(),parents=new Map();
 for(const node of visible){
  let parent=byId.get(node.parentId),seen=new Set([node.id]);
  while(parent&&(hidden.has(parent.id)||parent.kind!=='procedure')){
   if(seen.has(parent.id)){parent=null;break;}
   seen.add(parent.id);parent=byId.get(parent.parentId);
  }
  if(parent){
   let cursor=parent;
   while(cursor){
    if(seen.has(cursor.id)){diagnostics.push({code:'LAYOUT_CYCLIC_PARENT',nodeId:node.id});parent=null;break;}
    seen.add(cursor.id);cursor=byId.get(cursor.parentId);
   }
  }
  parents.set(node.id,parent?.id||ROOT);
  const group=node.kind==='procedure',visual=flow?.nodes?.some(n=>n.boundary)?flowVisual(node):null;
  elkNodes.set(node.id,{id:node.id,width:visual?.width||config.nodeWidth,height:group?(visual?.height||config.groupHeader+config.groupPadding):((node.role==='input'||node.role==='output')&&config.portHeight?config.portHeight:(visual?.height||config.nodeHeight)),...(group?{children:[],edges:[],layoutOptions:{...sharedLayoutOptions,'elk.padding':`[top=${config.groupHeader},left=${config.groupPadding},bottom=${config.groupPadding},right=${config.groupPadding}]`}}:{})});
 }
 const graph={id:ROOT,children:[],edges:[],layoutOptions:{
  ...sharedLayoutOptions,
  'elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.semiInteractive':'true',
  'elk.padding':`[top=${config.margin},left=${config.margin},bottom=${config.margin},right=${config.margin}]`,
 }};
 for(const node of visible)(elkNodes.get(parents.get(node.id))||graph).children.push(elkNodes.get(node.id));
 const valid=[];
 // Edges belong to their lowest common compound container. ELK then routes
 // cross-procedure edges through the actual group boundaries.
 const chain=id=>{const result=[ROOT],seen=new Set();let next=parents.get(id);while(next&&next!==ROOT&&!seen.has(next)){seen.add(next);result.splice(1,0,next);next=parents.get(next);}return result;};
 for(const edge of dependencies){
  if(!elkNodes.has(edge.from)||!elkNodes.has(edge.to)){diagnostics.push({code:'LAYOUT_MISSING_ENDPOINT',edgeId:edge.id,from:edge.from,to:edge.to});continue;}
  if(edge.from===edge.to){diagnostics.push({code:'LAYOUT_SELF_DEPENDENCY',edgeId:edge.id});}
  const source=chain(edge.from),target=chain(edge.to);let owner=ROOT;
  for(let i=0;i<Math.min(source.length,target.length)&&source[i]===target[i];i++)owner=source[i];
  const branchLabel=classificationBranchLabel(edge);(elkNodes.get(owner)||graph).edges.push({id:edge.id,sources:[edge.from],targets:[edge.to],...(branchLabel?{labels:[{id:edge.id+':label',text:branchLabel.lines.join('\n'),width:branchLabel.width,height:branchLabel.height,layoutOptions:{'elk.edgeLabels.placement':'CENTER'}}]}:{})});valid.push(edge);
 }
 if(!visible.length)return {schema:'agentcv-program-flow-layout-1',width:0,height:0,nodes:[],groups:[],edges:[],entries:input.filter(node=>hidden.has(node.id)).map(nodeMetadata),runRoots:input.filter(node=>node.kind==='run').map(nodeMetadata),diagnostics};
 const laidOut=await new ELK().layout(graph),nodes=[],routes=new Map(),labels=new Map();
 function flatten(container,offsetX=0,offsetY=0){
  for(const edge of list(container.edges)){
   const sections=list(edge.sections),points=[];
   for(const section of sections){
    for(const point of [section.startPoint,...list(section.bendPoints),section.endPoint].filter(Boolean)){
     const absolute={x:point.x+offsetX,y:point.y+offsetY},last=points.at(-1);
     if(!last||last.x!==absolute.x||last.y!==absolute.y)points.push(absolute);
    }
   }
   routes.set(edge.id,points);if(edge.labels?.[0]){const l=edge.labels[0];labels.set(edge.id,{x:l.x+offsetX,y:l.y+offsetY,width:l.width,height:l.height,lines:l.text.split('\n')});}
  }
  for(const child of list(container.children)){
   const original=byId.get(child.id),x=offsetX+child.x,y=offsetY+child.y;
   nodes.push({...nodeMetadata(original),x,y,width:child.width,height:child.height,layoutParentId:parents.get(child.id)===ROOT?null:parents.get(child.id),isGroup:original.kind==='procedure'&&list(child.children).length>0});
   flatten(child,x,y);
  }
 }
 flatten(laidOut);
 const edges=valid.map(edge=>{
  const points=routes.get(edge.id)||[];
  if(points.length<2)diagnostics.push({code:'LAYOUT_UNROUTED_DEPENDENCY',edgeId:edge.id});
  return {...edge,points,...(labels.has(edge.id)?{labelLayout:labels.get(edge.id)}:{})};
 });
 return {schema:'agentcv-program-flow-layout-1',width:laidOut.width,height:laidOut.height,nodes:nodes.filter(node=>!node.isGroup),groups:nodes.filter(node=>node.isGroup),edges,entries:input.filter(node=>hidden.has(node.id)).map(nodeMetadata),runRoots:input.filter(node=>node.kind==='run').map(nodeMetadata),diagnostics};
}
