// Shared by the DOM regression and the isolated native WebView acceptance run.
// Captures outbound transport only; never calls a model or invents its reply.
export async function checkMainAgentInquiries(api){
 const {project:p,inquiryView:v,agent}=api,doc=document,checks=[],frames=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const waitFor=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for inquiry UI');};
 const input=doc.getElementById('chatInput'),threads=(p.data.canvasThreads||[]).length,namespace=agent.sessionNamespace,threadId=p.data.agentConversationId||agent.mainThreadId;
 const initial={wire:agent.wire,connected:agent.connected,model:agent.model,provider:agent.provider};
 agent.wire=async frame=>{frames.push(JSON.parse(JSON.stringify(frame)));};agent.connected=true;agent.model='inquiry-transport-check';agent.provider='qa';
 doc.getElementById('shareImage').checked=false;
 const submit=async()=>{
  const count=frames.filter(f=>f.type==='prompt').length;
  doc.getElementById('chatForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await waitFor(()=>frames.filter(f=>f.type==='prompt').length>count&&!input.value);
  const frame=frames.filter(f=>f.type==='prompt').at(-1),reference=p.data.chat.findLast(m=>m.role==='user').reference;
  check(frame.thread_id===threadId,'Inquiry switched away from the existing main thread');
  check(frame.session_key===`${namespace}:${p.epoch}:${threadId}`,'Inquiry changed the main session key');
  check(!frame.parent_thread_id&&!frame.parent_turn_id,'Inquiry unexpectedly branched');
  agent.stop();return {frame,reference};
 };
 const collapseChat=()=>{if(!doc.body.classList.contains('intent-chat-collapsed'))v.onToggleChat();};
 const visible=()=>{
  check(!doc.body.classList.contains('intent-chat-collapsed'),'Main chat remained collapsed');
  check(!doc.querySelector('.program-flow-map-dialog[open]'),'Expanded flow still blocks the main chat');
  check(doc.activeElement===input,'Main composer was not focused');
  check(!doc.getElementById('quotedContext').hidden,'Missing main composer reference');
 };
 const menuClick=async(id,label)=>{
  const map=v.programFlow.map,surface=map.expanded||map.main;
  await map.ready;await surface.layoutReady;
  const target=id?[...surface.world.querySelectorAll('[data-program-node]')].find(n=>n.dataset.programNode===id):surface.viewport;
  check(target,`Missing rendered flow node: ${id}`);
  target.dispatchEvent(new MouseEvent('contextmenu',{clientX:100,clientY:100,bubbles:true,cancelable:true}));
  const button=[...v.menu.querySelectorAll('button')].find(b=>b.textContent===label);
  check(button,`Missing menu command: ${label}`);button.click();await waitFor(()=>!v.menu);visible();
 };
 try{
  await v.open();v.programFlow.refreshFlow();
  const graph=v.programFlow.flow,node=graph.nodes.find(n=>n.schemeNodeId);
  check(node,'No declared node for inquiry test');
  input.value='';collapseChat();v.programFlow.map.expand();
  await menuClick(node.id,'詢問此節點');
  const captured=JSON.parse(JSON.stringify(agent.ui.reference()));
  check(captured.kind==='program_flow'&&captured.scope==='node'&&captured.graph.selectedNodeId===node.id,'Wrong node reference');
  check(equal(captured.graph.nodes.map(n=>n.id),graph.nodes.map(n=>n.id)),'Node inquiry lost the complete graph');
  v.programFlow.selectedId=graph.nodes.at(-1).id;
  check(equal(agent.ui.reference(),captured),'Navigation mutated the captured node reference');
  const nodeTurn=await submit();check(nodeTurn.frame.message.includes(node.id),'Selected node absent from outgoing prompt');
  check(equal(nodeTurn.reference,captured),'Saved main chat lost the captured graph');
  checks.push('Node context menu reveals main chat from expanded flow and preserves complete frozen graph');

  collapseChat();await menuClick(null,'詢問整個流程');
  check(agent.ui.reference().scope==='whole-flow'&&agent.ui.reference().graph.selectedNodeId===null,'Wrong whole-flow scope');
  await submit();checks.push('Whole-flow inquiry uses the same main thread and session');

  input.value='Keep my unfinished question';collapseChat();await menuClick(node.id,'詢問此節點');
  check(input.value==='Keep my unfinished question','Inquiry overwrote the user draft');input.value='';
  // A real raster, annotation and semantic image relation; no algorithm outputs are fabricated.
  const canvas=doc.createElement('canvas');canvas.width=80;canvas.height=60;canvas.getContext('2d').fillRect(0,0,80,60);
  const ref={kind:'original',label:'Inquiry scope QA',width:80,height:60,dataURL:canvas.toDataURL('image/png'),source:{kind:'qa-image',coordinateSpace:'asset-pixels'}};
  const first=await v.addReference(ref),second=await v.addReference({...ref,label:'Related image'});
  const annotation=p.addInquiryAnnotation(v.boardId,first.item.id,{type:'rect',points:[{x:5,y:5},{x:30,y:25}],text:'Selected local area'});
  v.selected=new Set([first.item.id]);v.annotationSelections=new Set([JSON.stringify([first.item.id,annotation.id])]);v.annotationSelection={itemId:first.item.id,id:annotation.id};
  collapseChat();await v.openLocalQuestion();visible();
  const local=agent.ui.reference();
  check(local.snapshot.items.length===1&&local.snapshot.items[0].id===first.item.id,'Local inquiry included unrelated images');
  check(local.snapshot.selection.annotations[0].annotationId===annotation.id,'Local inquiry lost selected annotation identity');
  p.updateInquiryAnnotation?.(v.boardId,first.item.id,annotation.id,{text:'Changed later'});
  check(agent.ui.reference().snapshot.selection.annotations[0].annotation.text==='Selected local area','Live edit mutated local reference');
  const localTurn=await submit();check(localTurn.frame.message.includes(annotation.id),'Local selection absent from outgoing context');
  checks.push('Local annotation identity and captured coordinates reach the main Agent without a new thread');

  const relation=v.addImageRelation({fromItemId:first.item.id,toItemId:second.item.id,label:'Compare these images'});
  collapseChat();v.imageRelationMenu({clientX:100,clientY:100},relation);
  [...v.menu.querySelectorAll('button')].find(b=>b.textContent==='詢問這條關係').click();
  await waitFor(()=>agent.ui.reference()?.snapshot?.selection?.relationIds?.[0]===relation.id);visible();
  const linked=agent.ui.reference();check(linked.snapshot.items.length===2,'Relation inquiry lost one endpoint');
  check(linked.snapshot.relations.some(r=>r.id===relation.id&&r.label===relation.label),'Relation inquiry lost relation semantics');
  await submit();checks.push('Relation menu carries both images and selected relation to the same main Agent');
  check((p.data.canvasThreads||[]).length===threads,'Inquiry created a legacy canvas session');
  check(agent.sessionNamespace===namespace&&!frames.some(f=>f.type==='reset'),'Inquiry reset the main Agent');
  checks.push('All four sends preserve the existing main session; no canvas threads, reset or model calls');
  return {checks,prompts:frames.filter(f=>f.type==='prompt').map(f=>({threadId:f.thread_id,sessionKey:f.session_key,imageCount:f.images.length})),threadCount:threads};
 }finally{agent.stop();Object.assign(agent,initial);}
}
