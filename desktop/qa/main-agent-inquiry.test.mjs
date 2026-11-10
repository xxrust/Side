import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {checkMainAgentInquiries} from './main-agent-inquiry-checks.mjs';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');

test('inquiry menus quote their exact scope into the existing main Agent',async()=>{
 const h=await createHarness();
 try{
  await h.api.startupReady;
  h.api.project.data.purposeScheme={id:'inquiry-qa',execution:{unit:'workpiece',inputSlots:[{id:'image',required:true}]},operatorGraph:{nodes:[{id:'prepare',title:'Prepare',code:'result = {}',parameters:{}},{id:'inspect',title:'Inspect',code:'result = {}',parameters:{},inputs:{image:{nodeId:'prepare',artifactId:'mask'}}}],edges:[{from:'prepare',to:'inspect'}]}};
  // Execute the identical check function inside the application realm.
  const result=await h.w.eval(`(${checkMainAgentInquiries.toString()})(AgentCVDesktop)`);
  assert.equal(result.prompts.length,4);assert.equal(result.checks.length,5);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
