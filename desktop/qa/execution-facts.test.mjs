import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Workspace} from '../src/workspace.js';
import {jsonSnapshot,immutableJson,projectSnapshot,freezeParsedJson} from '../src/json-snapshot.js';
import {sealProjectExecutionFacts,rememberNativeExecutionFacts,sealParsedNativeExecutionFacts} from '../src/execution-facts.js';
import {durableInspectionProduct} from '../src/inspection-records.js';
import {serializeProject} from '../src/project-serialization.js';
import {reviseAlgorithmEvidence,effectiveAlgorithmRun} from '../src/algorithm-evidence-revisions.js';
import {readAlgorithmRun} from '../src/algorithm-workspace.js';

test('privately parsed native facts are frozen without a second copy while response metadata stays editable',()=>{
 const incoming={runs:[{result:{nested:[{value:3}]},procedureTrace:{nodes:[]},structuredLayers:[],artifacts:[{id:'data',data:{values:[1,2]}}]}]};
 const parsed=JSON.parse(JSON.stringify(incoming)),run=parsed.runs[0],facts=run.result,data=run.artifacts[0].data;
 assert.equal(sealParsedNativeExecutionFacts(parsed),parsed);
 assert.equal(run.result,facts);assert.equal(run.artifacts[0].data,data);
 assert.throws(()=>{facts.nested[0].value=9;},TypeError);assert.throws(()=>data.values.push(3),TypeError);
 run.artifacts[0].contractBinding={valid:true};run.timing={totalMs:1};
 sealProjectExecutionFacts({algorithmRuns:parsed.runs});assert.equal(run.result,facts);
 const history=projectSnapshot(parsed);assert.equal(history.runs[0].result,facts);
 const editable=jsonSnapshot(parsed);editable.runs[0].result.nested[0].value=5;
 assert.equal(facts.nested[0].value,3);incoming.runs[0].result.nested[0].value=8;assert.equal(facts.nested[0].value,3);
 const special=freezeParsedJson(JSON.parse('{"__proto__":{"value":1},"values":[-0,1e400]}'));
 assert.deepEqual(special,immutableJson(JSON.parse('{"__proto__":{"value":1},"values":[-0,1e400]}')));
 assert.equal(Object.is(special.values[0],-0),false);assert.equal(Object.getPrototypeOf(special),Object.prototype);
});

test('native save references survive retention copies while replacements and project files keep complete facts',()=>{
 const run={schema:'agentcv-algorithm-run-1',runId:'actual',artifacts:[],result:{value:3},procedureTrace:{nodes:[{id:'actual-step'}]},nativeResult:{measurements:{value:3}},nativeFactRef:{kind:'runtime-memory',runId:'actual',artifactId:'__execution_facts',token:'actual-reference'},nativeFactFields:['result','procedureTrace','nativeResult']};
 sealProjectExecutionFacts({algorithmRuns:[run]});rememberNativeExecutionFacts(run);
 assert.throws(()=>{run.nativeResult.measurements.value=99;},TypeError);
 const saved=durableInspectionProduct({runs:[{...run,artifacts:[]}]});
 assert.equal(saved.runs[0].result,undefined);assert.equal(saved.runs[0].procedureTrace,undefined);assert.deepEqual(saved.runs[0].nativeFactRef,run.nativeFactRef);
 const replaced=durableInspectionProduct({runs:[{...run,result:{replacement:true}}]});
 assert.deepEqual(replaced.runs[0].result,{replacement:true});assert.deepEqual(replaced.runs[0].procedureTrace,run.procedureTrace);assert.equal(replaced.runs[0].nativeFactRef,undefined);
 const project=JSON.parse(serializeProject({algorithmRuns:[run]})).algorithmRuns[0];
 assert.deepEqual(project.result,run.result);assert.deepEqual(project.procedureTrace,run.procedureTrace);assert.equal(project.nativeFactRef,undefined);assert.equal(project.nativeFactFields,undefined);
});

test('shared JSON is recursively immutable, normalized, detached from incoming objects and editable through ordinary reads',()=>{
 const source={nested:[{value:1}],nonfinite:Infinity,zero:-0,missing:undefined};
 const facts=immutableJson(source),history=projectSnapshot({facts,selection:{value:1}});
 assert.deepEqual(facts,JSON.parse(JSON.stringify(source)));
 assert.equal(history.facts,facts);assert.equal(history.facts.nested[0],facts.nested[0]);
 source.nested[0].value=8;assert.equal(facts.nested[0].value,1);
 assert.throws(()=>{history.facts.nested[0].value=2;},TypeError);
 assert.throws(()=>history.facts.nested.push({value:3}),TypeError);
 const read=jsonSnapshot(facts);read.nested[0].value=4;assert.equal(facts.nested[0].value,1);
 const shallow=Object.freeze({nested:{value:1}}),copy=projectSnapshot(shallow);
 shallow.nested.value=7;assert.equal(copy.nested.value,1);
});

test('historical execution scheme snapshots share immutable definitions while current editing and history reads stay detached',()=>{
 const scheme={operatorGraph:{nodes:[{id:'actual',code:'result=1',parameters:{threshold:3}}]}},data={purposeScheme:scheme,datasetExecutions:[{id:'historical',schemeSnapshot:jsonSnapshot(scheme)}]};
 const before=JSON.stringify(data);sealProjectExecutionFacts(data);assert.equal(JSON.stringify(data),before);
 const saved=data.datasetExecutions[0].schemeSnapshot,history=projectSnapshot(data);
 assert.equal(history.datasetExecutions[0].schemeSnapshot,saved);
 data.purposeScheme.operatorGraph.nodes[0].parameters.threshold=4;
 assert.equal(saved.operatorGraph.nodes[0].parameters.threshold,3);
 assert.equal(history.purposeScheme.operatorGraph.nodes[0].parameters.threshold,3);
 assert.throws(()=>{saved.operatorGraph.nodes[0].parameters.threshold=8;},TypeError);
 const read=jsonSnapshot(saved);read.operatorGraph.nodes[0].parameters.threshold=9;
 assert.equal(saved.operatorGraph.nodes[0].parameters.threshold,3);
});

test('loaded workpiece units share immutable snapshots while batch counters and ordinary reads remain independent',()=>{
 const source={datasetExecutions:[{id:'batch',status:'CANCELLED',processed:1,counts:{completed:1},units:[{unitId:'unit',imageIds:['actual'],cycleTiming:{totalMs:3},recordRef:{root:'E:/original.agentcv',$asset:'assets/unit.json',sha256:'a'.repeat(64)}}]}]};
 const expected=JSON.stringify(source);sealProjectExecutionFacts(source);assert.equal(JSON.stringify(source),expected);
 const unit=source.datasetExecutions[0].units[0],history=projectSnapshot(source);
 assert.equal(history.datasetExecutions[0].units[0],unit);
 source.datasetExecutions[0].processed=2;source.datasetExecutions[0].counts.completed=2;
 assert.equal(history.datasetExecutions[0].processed,1);assert.equal(history.datasetExecutions[0].counts.completed,1);
 assert.throws(()=>{unit.cycleTiming.totalMs=99;},TypeError);
 const read=jsonSnapshot(unit);read.imageIds[0]='reader';read.recordRef.root='E:/reader.agentcv';
 assert.equal(unit.imageIds[0],'actual');assert.equal(unit.recordRef.root,'E:/original.agentcv');
 const p=new Workspace();p.data.datasetExecutions=source.datasetExecutions;p.checkpoint();p.relocateProjectAssets('E:/new.agentcv');
 assert.equal(p.data.datasetExecutions[0].units[0].recordRef.root,'E:/new.agentcv');
 assert.equal(p.undoStack.at(-1).datasetExecutions[0].units[0],unit);
 p.undo();assert.equal(p.data.datasetExecutions[0].units[0].recordRef.root,'E:/original.agentcv');
 p.redo();assert.equal(p.data.datasetExecutions[0].units[0].recordRef.root,'E:/new.agentcv');
});

test('real saved inspection facts survive explanation revisions, replacement, undo/redo and independent editable reads',()=>{
 const filename=new URL('./fixtures/execution-facts-record.json',import.meta.url),saved=JSON.parse(fs.readFileSync(filename,'utf8'));
 const p=new Workspace();p.data.images=saved.images;p.data.activeId=saved.images[0].id;p.data.algorithmRuns=[saved.run];
 const serialized=JSON.stringify(p.data);sealProjectExecutionFacts(p.data);
 assert.equal(JSON.stringify(p.data),serialized);
 const run=p.data.algorithmRuns.find(r=>r.procedureTrace?.nodes?.length),trace=run.procedureTrace,facts=JSON.stringify({result:run.result,trace,artifacts:run.artifacts});
 const beforeRevisions=run.evidenceRevisions?.length||0;
 reviseAlgorithmEvidence(p,{run_id:run.runId,expected_revision:beforeRevisions,reason:'QA: explanation revision must remain undoable with shared execution facts',parameterNotes:'QA notes only; no algorithm or evidence change.'});
 assert.equal(p.undoStack.at(-1).algorithmRuns.find(r=>r.runId===run.runId).procedureTrace,trace);
 assert.equal(JSON.stringify({result:run.result,trace:run.procedureTrace,artifacts:run.artifacts}),facts);
 const read=readAlgorithmRun(p,run.runId);read.procedureTrace.nodes[0].name='editable reader';
 assert.notEqual(trace.nodes[0].name,'editable reader');
 p.undo();let restored=p.data.algorithmRuns.find(r=>r.runId===run.runId);
 assert.equal(restored.evidenceRevisions?.length||0,beforeRevisions);assert.equal(restored.procedureTrace,trace);
 p.redo();restored=p.data.algorithmRuns.find(r=>r.runId===run.runId);
 assert.equal(restored.evidenceRevisions.length,beforeRevisions+1);
 assert.equal(effectiveAlgorithmRun(restored).explanationParameterNotes,'QA notes only; no algorithm or evidence change.');
 p.checkpoint();restored.result=immutableJson({replacement:true});restored.artifacts[0].path='new-path';
 p.undo();restored=p.data.algorithmRuns.find(r=>r.runId===run.runId);
 assert.equal(JSON.stringify({result:restored.result,trace:restored.procedureTrace,artifacts:restored.artifacts}),facts);
 p.redo();assert.equal(p.data.algorithmRuns.find(r=>r.runId===run.runId).result.replacement,true);
});

test('Save As relocates references inside shared facts without changing undo history or non-asset roots',()=>{
 const p=new Workspace(),asset={storage:'workspace',$asset:'assets/file.json',sha256:'a'.repeat(64),root:'E:/old.agentcv'};
 p.data.algorithmRuns=[{runId:'relocation',result:{asset,unrelated:{root:'domain-root'}},procedureTrace:{nodes:[{outputs:{asset}}]},artifacts:[{type:'json',data:{asset}}]}];
 sealProjectExecutionFacts(p.data);const before=JSON.stringify(p.data);p.checkpoint();
 p.relocateProjectAssets('E:/new.agentcv');
 const run=p.data.algorithmRuns[0];assert.equal(run.result.asset.root,'E:/new.agentcv');
 assert.equal(run.procedureTrace.nodes[0].outputs.asset.root,'E:/new.agentcv');assert.equal(run.artifacts[0].data.asset.root,'E:/new.agentcv');
 assert.equal(run.result.unrelated.root,'domain-root');assert.throws(()=>{run.result.asset.root='corrupted';},TypeError);
 assert.equal(JSON.stringify(p.undoStack.at(-1)),before);
 p.undo();assert.equal(JSON.stringify(p.data),before);p.redo();assert.equal(p.data.algorithmRuns[0].result.asset.root,'E:/new.agentcv');
});
