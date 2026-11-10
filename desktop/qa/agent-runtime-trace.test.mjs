import test from 'node:test';
import assert from 'node:assert/strict';
import {Workspace} from '../src/workspace.js';
import {Agent} from '../src/agent.js';

test('turn metadata retains model, risk and completed tool trace',()=>{
  const project=new Workspace(),agent=new Agent(project,{update(){},locked:()=>false});
  agent.turn='turn-1';agent.turnConversation={threadId:'thread-1',turnId:'turn-1'};agent.provider='codex';agent.model='gpt-test';
  const question=agent.record('user','核對一次讀取');
  agent.beginToolActivity('get_visual_context','tool-1',{board_id:'board-1'});
  agent.finishToolActivity('tool-1',{status:'done',result:{items:[]}});
  assert.equal(question.agentRuntime.model.id,'gpt-test');
  assert.equal(question.agentRuntime.toolTrace.length,1);
  assert.equal(question.agentRuntime.toolTrace[0].risk,'read');
  assert.equal(question.agentRuntime.toolTrace[0].status,'done');
  assert.ok(Number.isFinite(question.agentRuntime.toolTrace[0].elapsedMs));
  assert.equal(question.agentRuntime.cost.status,'UNAVAILABLE');
});
