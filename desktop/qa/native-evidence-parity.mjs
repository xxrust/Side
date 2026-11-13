// Migration oracle: call the actual production evidence audits, including their
// error ordering/messages. Controlled mutations are not algorithm accuracy tests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {auditAlgorithmRun} from '../src/algorithm-workspace.js';
import {hasVerifiedImagePixels} from '../src/pipeline-evidence-contract.js';
const normalized=value=>JSON.parse(JSON.stringify(value));
export async function verifyNativeEvidence(call){
 let evidenceAuditCases=0,evidencePixelCases=0;
 const real=(JSON.parse(await fs.readFile(new URL('./fixtures/execution-facts-record.json',import.meta.url),'utf8'))).run;
 const compare=async(run,expected=run.expectedOutputs||[])=>{
  const oracle=normalized(auditAlgorithmRun(run,expected)),native=await call({run,expected},'inspection_evidence');
  assert.equal(native.error,undefined,JSON.stringify(native));
  assert.deepEqual(native.result,oracle,`root/procedure evidence ${evidenceAuditCases}`);evidenceAuditCases++;
 };
 await compare(real);
 const node=(instanceId='step-1',extra={})=>({instanceId,kind:'step',status:'SUCCEEDED',parentInstanceId:null,parameters:{threshold:3},parameterSources:{threshold:'human-input'},outputs:{},artifactIds:['data'],dependencyInstances:[],...extra});
 const base={status:'SUCCEEDED',execution:{status:'COMPLETED'},parameters:{threshold:3},result:{boundaryChecks:[{id:'limit',status:'PASS',actual:3,threshold:4}]},dataContractAudit:{errors:[]},expectedOutputs:[{id:'data',type:'evidence'}],artifacts:[{id:'data',type:'json',traceNodeId:'step-1',data:{actual:3}},{id:'pixels',type:'image',dataURL:'data:image/bmp;base64,AA==',traceNodeId:'step-1'}],procedureTrace:{schema:'agentcv-procedure-trace-1',nodes:[node()]}};
 const mutations=[
  ()=>{},r=>{delete r.procedureTrace;},r=>{r.procedureTrace=null;},r=>{r.procedureTrace={schema:'invalid',nodes:[]};},r=>{r.procedureTrace.nodes=[];},r=>{r.procedureTrace.nodes=[null,{},node()];},
  r=>{r.procedureTrace.nodes.push(node());},r=>{r.procedureTrace.nodes[0].instanceId='';},r=>{r.procedureTrace.nodes[0].instanceId=17;},
  r=>{r.procedureTrace.nodes[0].kind='invalid';r.procedureTrace.nodes[0].status='RUNNING';},r=>{r.procedureTrace.nodes[0].judgement='FAIL';},
  r=>{r.procedureTrace.nodes[0].parentInstanceId='missing';},r=>{r.procedureTrace.nodes[0].dependencyInstances=['missing'];},
  r=>{r.procedureTrace.nodes[0].parameters=null;r.procedureTrace.nodes[0].outputs=[];},r=>{r.procedureTrace.nodes[0].artifactIds=['absent'];},
  r=>{r.procedureTrace.nodes[0].parameterSources={threshold:'inferred-human'};},
  r=>{r.procedureTrace.nodes[0].parameters={'z':1,'12':1,'2':1,'a':1};r.procedureTrace.nodes[0].parameterSources={'z':'bad','12':'bad','2':'bad','a':'bad'};},
  r=>{r.procedureTrace.nodes[0].status='FAILED';},r=>{r.procedureTrace.nodes[0].status='SKIPPED';},r=>{r.procedureTrace.nodes[0].status='SKIPPED';r.procedureTrace.nodes[0].skipReason='prerequisite absent';},
  r=>{r.status='FAILED';r.execution.status='FAULT';},r=>{r.status='TIMEOUT';},r=>{r.artifacts=[];},r=>{r.dataContractAudit.errors=[{code:'ACTUAL_CONTRACT_ERROR',path:'artifacts.data',message:'observed mismatch'}];},
  r=>{r.result.boundaryChecks=[];},r=>{r.result.boundaryChecks[0].status='FAIL';},r=>{delete r.result.boundaryChecks[0].actual;},r=>{delete r.result.boundaryChecks[0].threshold;},r=>{r.result.boundaryChecks[0].status='NOT_EVALUATED';},r=>{r.result.boundaryChecks={};}
 ];
 const selectors=[
  {kind:'artifact',type:'evidence',id:'data'}, {kind:'artifact',type:'image',id:'pixels'}, {kind:'artifact',type:'evidence',id:'absent'},
  {kind:'artifact',type:'evidence'}, {kind:'artifact',type:'file',id:'data'}, {kind:'artifact',type:'unregistered',id:'../outside'},
  {kind:'gate',id:'limit'},{kind:'gate',id:'missing'},{kind:'gate',id:'todo'},{kind:'gate',id:'\ufeff'},{kind:'gate',id:'\u0085'},
  {kind:'execution-status',allowed:['OK']},{kind:'execution-status',allowed:['PASS']},{kind:'execution-status',allowed:[]},{kind:'unknown'},
  {kind:'artifact',type:'image',id:'pixels',caption:'todo'},
  {kind:'artifact',type:'image',id:'pixels',visuals:[]},
  ...['pixels','missing'].flatMap(id=>[
   {kind:'artifact',type:'image',id:'pixels',visuals:[{id,caption:'实际像素支持观察'}]},
   {kind:'artifact',type:'image',id:'pixels',visuals:[{id,caption:'…',z:'unsupported',a:'unsupported'}]},
   {kind:'artifact',type:'image',id:'pixels',visuals:[{id,kind:'project-image',caption:'现有参考图'}]},
   {kind:'artifact',type:'image',id:'pixels',visuals:[{id,kind:'invalid',caption:'现有参考图'}]}
  ]),
  {kind:'gate',id:'limit',z:'invalid',a:'invalid',caption:'当前边界'},
  {kind:'artifact',type:'image',id:'pixels',visuals:[null]},
 ];
 for(const mutate of mutations)for(const s of selectors){
  const run=structuredClone(base),justification={tool:{expectedEvidence:[s]},parameters:[{name:'threshold',verification:s}],boundaries:[{check:s}]};
  run.justification=structuredClone(justification);run.procedureTrace.nodes[0].justification=structuredClone(justification);
  run.procedureTrace.nodes[0].outputs.boundaryChecks=structuredClone(run.result.boundaryChecks);
  mutate(run);await compare(run);
 }
 // Container/leaf ownership, repeated instances, unavailable dependencies and
 // cyclic parent references must produce the same ordered diagnostics.
 for(const parent of [null,'missing','container','step-1'])for(const owner of ['step-1','container','unrelated',null])for(const status of ['SUCCEEDED','FAILED','SKIPPED']){
  const run=structuredClone(base);run.procedureTrace.nodes=[node('container',{kind:'procedure',artifactIds:['data','pixels']}),node('step-1',{parentInstanceId:parent,status}),node('unrelated',{artifactIds:[],dependencyInstances:['step-1']})];
  run.artifacts.forEach(a=>{a.traceNodeId=owner;});await compare(run);
 }
 for(const s of selectors){const run=structuredClone(base);run.procedureTrace.nodes[0].justification={tool:{expectedEvidence:[s]},parameters:[{name:'threshold',verification:s}],boundaries:[{check:s}]};run.procedureTrace.nodes[0].status='SKIPPED';run.procedureTrace.nodes[0].skipReason='observed unavailable prerequisite';run.artifacts=[];await compare(run);}
 const sha256='a'.repeat(64),pixel={type:'image',hostBytesVerified:true,width:20,height:10,bytes:200,mime:'image/bmp',sha256,path:'C:\\actual\\pixels.bmp'};
 const pixelMutations=[()=>{},r=>{r.dataURL='inline';},r=>{r.dataURL={};},r=>{r.width=1.5;},r=>{r.bytes=0;},r=>{r.width=2**53;},r=>{r.hostBytesVerified=false;},r=>{r.sha256='A'.repeat(64);},r=>{r.mime='IMAGE/BMP';},r=>{r.mime='image/';},r=>{r.mime='image/💠';},r=>{r.mime='image/bmp\n';},r=>{r.path='/actual/image.bmp';},r=>{r.path='\\\\server\\share\\actual.bmp';},r=>{r.path='C:\\actual\\..\\other.bmp';},r=>{r.path='relative.bmp';},r=>{r.path='C:\\actual\\bad\u0000.bmp';},r=>{r.path='x'.repeat(4097);}];
 for(const asset of [undefined,null,{kind:'algorithm-artifact',path:pixel.path,sha256,mime:pixel.mime},{$asset:`assets/${sha256}.bmp`,sha256,mime:pixel.mime,size:200},{$asset:`assets/${sha256}.bmp`,sha256,mime:pixel.mime,size:200,root:'C:\\actual'},{kind:'algorithm-artifact',path:pixel.path,sha256:'b'.repeat(64),mime:pixel.mime}])for(const mutate of pixelMutations){
  const image={...pixel,...(asset===undefined?{}:{assetRef:asset})};mutate(image);
  const native=await call(image,'inspection_evidence_pixels');assert.equal(native.error,undefined);assert.equal(native.result,hasVerifiedImagePixels(image),`verified pixels ${evidencePixelCases}`);evidencePixelCases++;
 }
 return {evidenceAuditCases,evidencePixelCases};
}
