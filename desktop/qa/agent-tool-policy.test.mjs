import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {toolPolicy,toolRisk,TOOL_RISK} from '../src/agent-tool-policy.js';
import {agentTools} from '../src/agent-contract.js';

test('host tool registry classifies side effects and keeps draft work cheap',()=>{
  assert.equal(toolRisk('get_visual_context'),TOOL_RISK.READ);
  assert.equal(toolPolicy('get_visual_context').requiresHumanApproval,false);
  assert.equal(toolPolicy('run_algorithm',{mode:'draft'}).requiresHumanApproval,false);
  assert.equal(toolPolicy('run_algorithm',{mode:'scheme'}).requiresHumanApproval,true);
  assert.equal(toolPolicy('run_dataset_scheme').requiresHumanApproval,true);
  assert.equal(toolPolicy('install_algorithm_packages').risk,TOOL_RISK.ENVIRONMENT);
  assert.equal(toolPolicy('set_purpose_scheme').risk,TOOL_RISK.PROJECT_WRITE);
  assert.equal(toolPolicy('run_algorithm').requiresHumanApproval,false);
  assert.equal(toolPolicy('run_algorithm',{scheme_node_id:'measure'}).requiresHumanApproval,true);
  assert.equal(toolPolicy('apply_canvas_consultation').requiresHumanApproval,true);
});

test('every generated host tool carries explicit risk metadata',()=>{
  assert.ok(agentTools.length>=80);
  for(const {function:fn} of agentTools){
    assert.ok(fn.risk,fn.name);
    assert.equal(typeof fn.requiresHumanApproval,'boolean',fn.name);
    assert.notEqual(fn.risk,TOOL_RISK.UNKNOWN,fn.name);
  }
});

test('unregistered future tools fail closed',()=>{
  assert.equal(toolRisk('future_unregistered_tool'),TOOL_RISK.UNKNOWN);
  assert.equal(toolPolicy('future_unregistered_tool').requiresHumanApproval,true);
});

test('Codex native tools default to read-only and prompt does not advertise shell writes',async()=>{
  const source=await fs.readFile(new URL('../scripts/codex-bridge.mjs',import.meta.url),'utf8');
  assert.match(source,/INITIAL_AGENT_MODE:\s*process\.env\.INITIAL_AGENT_MODE\|\|'read-only'/);
  assert.doesNotMatch(source,/Files and shell tools are available for development/);
  assert.match(source,/Native file and shell tools are read-only/);
});

test('packaged runtime uses app-data runtime root instead of the source checkout',async()=>{
  const source=await fs.readFile(new URL('../src-tauri/src/main.rs',import.meta.url),'utf8');
  const runtime=await fs.readFile(new URL('../src-tauri/src/cv_runtime.rs',import.meta.url),'utf8');
  assert.match(source,/AGENTCV_RUNTIME_ROOT/);
  assert.match(source,/app_data_dir\(\).*join\("runtime"\)/s);
  assert.doesNotMatch(source,/let root = if dev\.exists\(\)/);
  assert.match(runtime,/fn runtime_root\(\)/);
  assert.match(runtime,/AGENTCV_RUNTIME_ROOT/);
});
