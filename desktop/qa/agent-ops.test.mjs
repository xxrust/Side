import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {AgentOps} from '../src/agent-ops.js';
const node=(id,kind='Locate')=>({id,kind,title:id,version:1,rationale:'Synthetic fixture, not industrial evidence',params:kind==='Locate'?{roi:{x:0,y:0,w:10,h:10}}:{metric:'contrast',threshold:10},applicability:{confidence:{min:.5,max:1}}});
const edge=(kind)=>({id:kind,kind,from:'a',to:'b',contract:{version:'current'}});
const fixture={nodes:[node('a'),node('b','Defect'),node('c','Defect')],edges:[edge('requires'),edge('shares')]};
const success=async()=>({status:'succeeded',metrics:{confidence:.8},evidence:'synthetic',conformance:'unknown'});
test('AgentOps immutable queries, atomic create/remove and explicit rejection; workspace survives',()=>{
 const ops=new AgentOps();let changes=0;ops.subscribe(()=>changes++);
 assert.equal(ops.create(fixture).status,'accepted');const p=ops.snapshot();p.nodes.length=0;assert.equal(ops.list().nodes.length,3);
 const before=ops.save();assert.equal(ops.remove({edges:['requires']}).status,'invalid_proposal');assert.equal(ops.save(),before);
 ops.setWorkspace({assets:[{id:'image'}],boards:{a:{draft:'human intent'}}});ops.reject(fixture,'requires');assert.equal(ops.snapshot().boards.a.draft,'human intent');
 assert.equal(ops.remove({edges:['requires','shares']}).status,'accepted');ops.revise('a',{title:'revised'});assert.equal(ops.get('a').version,2);
 assert.equal(ops.remove({nodes:['a']}).status,'accepted');assert.equal(ops.get('a'),undefined);assert.ok(changes>=5);
});
test('run one evaluates prerequisites only; all runs and reports available without window',async()=>{
 const seen=[];const ops=new AgentOps(undefined,{Locate:async x=>{seen.push(x.node.id);return success();},Defect:async x=>{seen.push(x.node.id);return success();}});ops.create(fixture);
 await ops.run('b');assert.deepEqual(seen,['a','b']);assert.equal(ops.status().c,undefined);await ops.run();assert.equal(ops.status().c.status,'succeeded');
 const report=ops.report();assert.match(report.svg,/<svg/);assert.match(report.html,/agentcv-regression-0.2/);assert.equal(report.json.runs.b.conformance,'unknown');
});
test('CLI headless roundtrip produces JSON + HTML + SVG and persists invalid-proposal zero writes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'agentcv-'));const project=join(dir,'project.json'),input=join(dir,'proposal.json'),adapter=join(dir,'adapter.mjs'),out=join(dir,'results');
 const cli=(...args)=>JSON.parse(execFileSync(process.execPath,['scripts/agentcv.mjs',...args,'--project',project],{encoding:'utf8'}));
 await writeFile(input,JSON.stringify(fixture));await writeFile(adapter,`const run=async()=>({status:'succeeded',metrics:{confidence:.8}});export default {Locate:run,Defect:run};`);
 cli('init');assert.equal(cli('create','--input',input).status,'accepted');cli('run','--node','b','--adapter',adapter,'--out',out);
 let report=JSON.parse(await readFile(join(out,'runs.json'),'utf8'));assert.equal(report.runs.a.status,'succeeded');assert.equal(report.runs.c,undefined);
 cli('run','--all','--adapter',adapter,'--out',out);report=JSON.parse(await readFile(join(out,'runs.json'),'utf8'));assert.equal(report.runs.c.status,'succeeded');
 assert.match(await readFile(join(out,'report.svg'),'utf8'),/<svg/);assert.match(await readFile(join(out,'report.html'),'utf8'),/AgentCV/);
 const before=await readFile(project,'utf8');await writeFile(input,JSON.stringify({nodes:[],edges:[{...edge('shares'),id:'bad',to:'c'}]}));
 assert.throws(()=>cli('accept','--input',input));assert.equal(await readFile(project,'utf8'),before);
 assert.equal(cli('status').runs.b.status,'succeeded');
});
