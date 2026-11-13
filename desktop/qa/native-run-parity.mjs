// Exercise the actual production import constructor, not a test reconstruction
// of its output. These cases migrate run metadata, not CV algorithm semantics.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {assembleAlgorithmRunEnvelope} from '../src/algorithm-workspace.js';
const normalized=value=>JSON.parse(JSON.stringify(value));
export async function verifyNativeRunEnvelope(call){
 const archived=(JSON.parse(await fs.readFile(new URL('./fixtures/execution-facts-record.json',import.meta.url),'utf8'))).run;
 let runEnvelopeCases=0;
 const codes=[archived.code,undefined,''];
 const docs=[undefined,null,'Authored free-form design description'];
 const visuals=[undefined,null,[],[{id:'actual-visual',caption:'Observed pixels'}],false];
 const executions=[undefined,null,false,{}, {status:'COMPLETED'}, {status:'FAULT',reason:'OBSERVED_FAILURE'}];
 for(const status of ['SUCCEEDED','FAILED','TIMEOUT'])for(const execution of executions)for(const backend of [undefined,'rust-native','python-extension',''])for(const code of codes){
  const index=runEnvelopeCases;
  const args={title:'Actual authored node',scheme_node_id:'actual-node',code,artifactMode:[undefined,null,'inspection'][index%3],
   justification:index%2?undefined:{boundaries:[]},documentation:docs[index%docs.length],
   workpieceUnit:index%7?{id:'actual-unit',imageIds:['actual-original'],views:null}:undefined,
   referenceInputs:index%7?{master:'actual-reference'}:undefined};
  const context={source:index%13?archived.sourceBinding:{images:[]},calibration:index%3?null:undefined,targets:index%4?[]:undefined};
  const compilation={ok:true,order:['actual-node'],diagnostics:[]},visualEvidence=[{id:'authored-visual',caption:'Authored reference'}];
  const parameters={threshold:3,actual:[1,2,3]},outputs=[{id:'actual-data',type:'evidence'}],proposal={valid:true,errors:[]},schemeNode={documentation:'Scheme description'};
  const run={...structuredClone(archived),status,execution,backend,
   // Simulate conflicting extension metadata: only authored fields may win.
   title:'extension override',parameters:{threshold:900},sourceBinding:{images:[{imageId:'other'}]},
   source:{imageId:'other'},documentation:'extension override',justification:{replacement:true},
   schema:'extension override',humanConfirmed:true,code:'extension override',
   visualEvidence:visuals[index%visuals.length],artifactMode:index%2?'references':undefined,
   runtimeInputResources:[{imageId:'actual-original',kind:'runtime-original'}],
   result:{actual:3,valid:status==='SUCCEEDED'},artifacts:[{id:'actual-data',type:'json',data:{actual:3}}]};
  delete run.workpieceUnit;delete run.referenceInputs;
  const authored=normalized({...args,mode:'scheme',parameters,expectedOutputs:outputs,visualEvidence,
   proposalAudit:proposal,documentation:args.documentation??schemeNode.documentation});
  const shared=normalized({sourceBinding:context.source,compilation,inputContext:{calibration:context.calibration,targets:context.targets},workpieceUnit:args.workpieceUnit,referenceInputs:args.referenceInputs});
  const expected=normalized(assembleAlgorithmRunEnvelope(run,{args,mode:'scheme',compilation,context,visualEvidence,parameters,outputs,proposal,schemeNode}));
  expected.nativeRunEnvelopeBackend='rust-native-run-v1';
  const actual=await call({run:normalized(run),authored,shared,nodeId:args.scheme_node_id},'inspection_run');
  assert.equal(actual.error,undefined,JSON.stringify(actual));
  assert.deepEqual(actual.result,expected,`complete production run envelope ${index}`);
  assert.equal(actual.result.runtimeInputResources,undefined);
  runEnvelopeCases++;
 }
 return {runEnvelopeCases};
}
