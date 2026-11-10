import test from 'node:test';
import assert from 'node:assert/strict';
import {Workspace} from '../src/workspace.js';

test('Agent scheme edits are durable proposals until a human adopts them',()=>{
  const project=new Workspace(),formal={id:'formal',operatorGraph:{nodes:[],edges:[]}},candidate={id:'candidate',operatorGraph:{nodes:[],edges:[]}};
  project.data.purposeScheme=formal;
  const result=project.setPurposeScheme(candidate,{actor:'agent'});
  assert.equal(result.status,'PENDING_REVIEW');
  assert.equal(project.purposeScheme.id,'formal');
  assert.equal(project.data.pendingPurposeScheme.proposalId,result.proposalId);
  assert.equal(project.data.events.at(-1).action,'purpose_scheme_proposed');
  const rejected=project.rejectPurposeSchemeProposal(result.proposalId,'測試拒絕');
  assert.equal(rejected.status,'REJECTED');
  assert.equal(project.data.pendingPurposeScheme,undefined);
  assert.equal(project.purposeScheme.id,'formal');
  assert.equal(project.data.lastRejectedPurposeScheme.reason,'測試拒絕');
});

test('a proposal cannot overwrite a formal scheme changed after it was created',()=>{
  const project=new Workspace(),formal={id:'formal',operatorGraph:{nodes:[],edges:[]}},candidate={id:'candidate',operatorGraph:{nodes:[],edges:[]}};
  project.data.purposeScheme=formal;
  const stale=project.setPurposeScheme(candidate,{actor:'agent'});
  const baseFingerprint=project.data.pendingPurposeScheme.baseSchemeFingerprint;
  project.setPurposeScheme({...formal,operatorGraph:{nodes:[{id:'human-node'}],edges:[]}});
  assert.throws(()=>project.adoptPurposeSchemeProposal(stale.proposalId),error=>{
    assert.equal(error.code,'SCHEME_PROPOSAL_STALE');
    assert.equal(error.details.baseSchemeFingerprint,baseFingerprint);
    return true;
  });
  assert.equal(project.purposeScheme.operatorGraph.nodes[0].id,'human-node');
  assert.equal(project.data.pendingPurposeScheme.proposalId,stale.proposalId);
});
