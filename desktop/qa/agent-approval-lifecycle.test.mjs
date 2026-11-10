import test from 'node:test';
import assert from 'node:assert/strict';
import {Workspace} from '../src/workspace.js';
import {Agent} from '../src/agent.js';

function host(){
  const project=new Workspace();
  const commands=[];
  const agent=new Agent(project,{page:()=>0,locked:()=>false,update(){},activity(){},reference:()=>null,settings(){}});
  agent.connected=true;
  agent.turn='turn-1';
  agent.turnEpoch=project.epoch;
  agent.busy=true;
  agent.expectedStamp=agent.stamp();
  agent.wire=async command=>commands.push(command);
  return {project,agent,commands};
}

test('host approval is visible, command-addressable and executes only after approval',async()=>{
  const {agent,commands}=host();
  let executed=0;
  agent.execute=async()=>{executed++;return {ok:true}};
  const pending=agent.event({type:'tool_request',turn:'turn-1',id:'tool-1',name:'run_dataset_scheme',args:{}});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(agent.hostPermissionSnapshot().length,1);
  assert.equal(agent.hostPermissionSnapshot()[0].tool,'run_dataset_scheme');
  assert.equal(await agent.command('/allow tool-1'),true);
  await pending;
  assert.equal(executed,1);
  assert.deepEqual(commands.at(-1),{type:'tool_response',id:'tool-1',result:{ok:true}});
});

test('stopping or ending a turn rejects every pending host approval',async()=>{
  const {agent,commands}=host();
  let executed=0;
  agent.execute=async()=>{executed++;return {ok:true}};
  const first=agent.event({type:'tool_request',turn:'turn-1',id:'tool-1',name:'run_dataset_scheme',args:{}});
  const second=agent.event({type:'tool_request',turn:'turn-1',id:'tool-2',name:'run_pipeline_batch',args:{}});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(agent.hostPermissionSnapshot().length,2);
  await agent.event({type:'turn_end',turn:'turn-1'});
  await Promise.all([first,second]);
  assert.equal(agent.hostPermissionSnapshot().length,0);
  assert.equal(executed,0);
  assert.equal(commands.filter(command=>command.type==='tool_response').length,2);
  assert.equal(agent.resolveHostPermission('tool-1',true),false);
});
