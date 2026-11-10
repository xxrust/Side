import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {captureProgramFlowReference,programFlowAgentReference} from '../src/program-flow-inquiry.js';
import {buildCurrentSchemeFlow} from '../src/current-scheme-flow.js';
import {savedThreadTurns} from '../src/agent-thread-context.js';
import {Agent} from '../src/agent.js';

// Saved real Pi/OpenCV executions. These tests inspect context/transport only;
// they never invent model replies or substitute computed execution outputs.
const savedPi=JSON.parse(fs.readFileSync(new URL('../../codex-audit-logs/20261029-restore-and-iterate/refinement/completed.agentcv.json',import.meta.url),'utf8'));
const savedUnit=JSON.parse(fs.readFileSync(new URL('../../codex-audit-logs/20261029-canonical-ui/actual-workpiece.agentcv.json',import.meta.url),'utf8'));

test('whole-flow and node questions retain the entire saved graph and exact scheme/selected-unit provenance without code or pixels',()=>{
 for(const data of [savedPi,savedUnit]){
  const flow=buildCurrentSchemeFlow(data),whole=captureProgramFlowReference(data),nodeId=flow.flow.nodes.at(-1).id,node=captureProgramFlowReference(data,{scope:'node',nodeId});
  assert.equal(whole.kind,'program_flow');assert.equal(whole.graph.source,'buildCurrentSchemeFlow');
  assert.equal(whole.schemeId,data.purposeScheme.id);assert.equal(whole.schemeFingerprint,whole.graph.scheme.fingerprint);
  assert.deepEqual(whole.graph.nodes.map(n=>n.id),flow.flow.nodes.map(n=>n.id));
  assert.deepEqual(whole.graph.edges.map(e=>[e.from,e.to]),flow.flow.edges.map(e=>[e.from,e.to]));
  assert.deepEqual(node.graph.nodes,whole.graph.nodes);assert.deepEqual(node.graph.edges,whole.graph.edges);assert.equal(node.graph.selectedNodeId,nodeId);
  assert.equal(whole.graph.selection.unitId,flow.unitId||null);assert.equal(whole.graph.selection.executionId,flow.executionId||null);assert.deepEqual(whole.graph.selection.runIds,flow.runIds);
  assert.ok(whole.graph.nodes.every(n=>'role'in n&&'runId'in n));assert.ok(whole.graph.edges.every(e=>'semantic'in e&&'executed'in e));
  assert.doesNotMatch(JSON.stringify(whole),/data:image|"code":|"base64":/);assert.ok(Object.isFrozen(whole.graph.nodes));
  assert.deepEqual(programFlowAgentReference(JSON.parse(JSON.stringify(node))),node);
  assert.throws(()=>captureProgramFlowReference(data,{scope:'node',nodeId:'foreign-node'}),/不屬於/);
  assert.throws(()=>captureProgramFlowReference(data,{nodeId}),/整個流程/);
  assert.throws(()=>programFlowAgentReference({...whole,scope:'node'}),/範圍不一致/);
  assert.throws(()=>programFlowAgentReference({...whole,schemeId:'other-scheme'}),/方案或範圍不一致/);
 }
});

test('historical run questions are explicitly read-only and never masquerade as the current scheme',()=>{
 const runId=savedPi.algorithmRuns[0].runId,ref=captureProgramFlowReference(savedPi,{runId});
 assert.equal(ref.graph.source,'buildProgramFlow');assert.equal(ref.graph.historical,true);assert.equal(ref.graph.readOnly,true);assert.equal(ref.schemeId,null);
 assert.equal(ref.graph.unavailableReason,'HISTORICAL_EXECUTION');assert.deepEqual(ref.graph.selection.runIds,[runId]);assert.ok(ref.graph.nodes.every(n=>n.runId===runId));
 assert.throws(()=>captureProgramFlowReference({algorithmRuns:[]},{runId:'missing'}),/尚無/);
 const renamed=structuredClone(savedPi);renamed.purposeScheme.operatorGraph.nodes[0].title+=' changed';assert.throws(()=>captureProgramFlowReference(renamed),/方案已改變/);
});

test('Workspace API freezes per-turn references across actual save/reload and Agent transports the complete graph on the same thread',async()=>{
 const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
 try{
  await h.api.loadProject(h.w.JSON.parse(JSON.stringify(savedUnit)));
  const p=h.api.project,board=p.createInquiryBoard({title:'流程問答 QA'}),reference=p.captureProgramFlowReference({boardId:board.id});
  const thread=p.createCanvasThread({boardId:board.id,question:'檢查整個流程的命名',reference});
  const turn=p.beginCanvasThreadTurn(thread.id,{question:thread.question,reference});
  p.completeCanvasThreadTurn(thread.id,turn.id,{status:'SENT',messages:[],chatEnd:p.data.chat.length});
  const serialized=p.serialize();p.dirty=false;await h.api.loadProject(h.w.JSON.parse(serialized));
  assert.deepEqual(JSON.parse(JSON.stringify(p.getCanvasThread(thread.id).turns[0].reference)),JSON.parse(JSON.stringify(reference)));
  const restored=savedThreadTurns(p,thread.id);assert.deepEqual(restored[0].reference,JSON.parse(JSON.stringify(reference)));
  const focused=p.captureProgramFlowReference({boardId:board.id,scope:'node',nodeId:reference.graph.nodes.at(-1).id});
  const ui={page:()=>6,selection:()=>({}),reference:()=>focused,locked:()=>false,activity(){},update(){}};
  const agent=new Agent(p,ui),requests=[];agent.connected=true;agent.model='context-inspection';agent.provider='qa';
  // Capture outbound transport only: no assistant message or execution result.
  agent.wire=async request=>requests.push(request);
  await agent.send('這個節點呢？',null,{conversation:{threadId:thread.id,turnId:'follow-up'}});
  assert.equal(agent.visualBoardId(),board.id);assert.equal(requests[0].thread_id,thread.id);assert.deepEqual(requests[0].images,[]);
  const context=agent.context();assert.deepEqual(context.reference.graph,JSON.parse(JSON.stringify(focused.graph)));assert.equal(context.referenceMatchesCurrentImage,null);
  assert.ok(requests[0].message.includes(JSON.stringify(reference.graph)),'reload history includes the original whole-flow graph');
  assert.ok(requests[0].message.includes(JSON.stringify(focused.graph)),'current turn includes the node scope and complete graph');
  assert.match(requests[0].message,/指定節點/);assert.doesNotMatch(requests[0].message,/data:image|本次視覺問詢固定快照/);
  assert.equal(p.data.chat.at(-1).visualSnapshot,undefined);assert.deepEqual(p.data.chat.at(-1).reference.graph,JSON.parse(JSON.stringify(focused.graph)));
 }finally{h.close()}
});
