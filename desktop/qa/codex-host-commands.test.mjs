import test from 'node:test';
import assert from 'node:assert/strict';
import {Workspace} from '../src/workspace.js';
import {Agent} from '../src/agent.js';

function host() {
  const project = new Workspace();
  const commands = [];
  const agent = new Agent(project, {page:()=>0, locked:()=>false, update(){}, activity(){}, reference:()=>null, settings(){}});
  agent.connected=true;
  agent.model='gpt-6.1-sol[low]';
  agent.provider='codex';
  agent.runtime={activeAdapter:{id:'codex'}};
  agent.wire=async command=>commands.push(command);
  return {agent,commands,project};
}
test('Codex native goal is preserved separately from project context',async()=>{
  const {agent,commands}=host();
  await agent.send('/goal Check the visible lid',null,{conversation:{threadId:'goal-test'}});
  assert.equal(commands.at(-1).native_command,'/goal Check the visible lid');
  assert.ok(commands.at(-1).message.includes('目前專案狀態'));
  assert.equal(commands.at(-1).thread_id,'goal-test');
});
test('goal pause and permission reply work during an active turn',async()=>{
  const {agent,commands}=host();
  agent.busy=true;
  await agent.command('/goal pause');
  assert.deepEqual(commands.at(-1),{type:'goal_control',action:'pause'});
  agent.permissionRequest='permission';
  await agent.command('/deny');
  assert.deepEqual(commands.at(-1),{type:'permission_response',id:'permission',result:{allow:false}});
});
test('runtime command discovery forwards compact and status and retains Pi command behavior',async()=>{
  const {agent}=host();
  await agent.event({type:'commands',commands:[{name:'compact'},{name:'status'}]});
  assert.equal(await agent.command('/compact'),false);
  assert.equal(await agent.command('/status'),false);
  agent.runtime={activeAdapter:{id:'pi'}};
  assert.equal(await agent.command('/goal Check'),true);
});

test('new main conversation identity survives a saved project reload',async()=>{
 const {agent,project}=host();
 agent.reset();
 const saved=JSON.parse(JSON.stringify(project.data));
 assert.equal(saved.agentConversationId,agent.mainThreadId);
 const restored=host();restored.project.data=saved;
 await restored.agent.send('Continue the new conversation');
 assert.equal(restored.commands.at(-1).thread_id,saved.agentConversationId);
});

test('ordinary board reference sends metadata without rendering all board pixels',async()=>{
 const {agent,commands}=host();
 const board=agent.p.createInquiryBoard({title:"context test"});
 agent.ui.reference=()=>({kind:'visual_inquiry',snapshot:{id:board.id,revision:1,items:[]}});
 agent.ui.visualImages=()=>{throw Error('must not export whole board')};
 await agent.send('請修改參數');
 assert.deepEqual(commands.at(-1).images,[]);
 assert.match(commands.at(-1).message,/get_visual_image/);
});
test('algorithm auto-publication retains results without touching canvas',async()=>{
 const {agent}=host();
 agent.publishVisualResults=()=>{throw Error('must not add images')};
 const result=await agent.publishVisualRun({run_id:'saved-run'});
 assert.equal(result.status,'SAVED_NOT_PUBLISHED');
 assert.equal(result.run_id,'saved-run');
});
test('Codex repeats only metadata for identical images in the same conversation',async()=>{
 const {agent,commands}=host();
 agent.models=[{id:agent.model,provider:agent.provider,input:['text','image']}];
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE2kAAAAASUVORK5CYII=';
 await agent.send('第一輪',image);
 assert.equal(commands.at(-1).images.length,1);
 agent.busy=false;agent.turn=null;
 await agent.send('接續討論',image);
 assert.equal(commands.at(-1).images.length,0);
 agent.reset();
 await agent.send('新對話',image);
 assert.equal(commands.at(-1).images.length,1);
});
