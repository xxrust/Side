import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const {GlobalFonts}=require('../../qa/node_modules/@napi-rs/canvas');
GlobalFonts.setAlias('Heiti TC','-apple-system');
const packet=path.resolve('../reviews/2026-10-25-blind-operation/operator-packets/T01');
const output=path.resolve('../reviews/2026-10-25-framework-retest/decision-preview-0.10.3');
await fs.mkdir(output,{recursive:true});
const task=JSON.parse(await fs.readFile(path.join(packet,'task.json'),'utf8'));
const input=task.inputs.at(-1),bytes=await fs.readFile(path.join(packet,input.file));
const h=await createHarness();
try{
 await h.api.addImages([{name:input.file,dataUrl:'data:image/png;base64,'+bytes.toString('base64')}]);
 const p=h.api.project;p.createPipeline({task:'gear',goal:'核對既有 T01 的實算選擇依據',parameters:{features:{expectedTeeth:task.normalSpecification.nominalTeeth}}});
 await p.runPipelineImage();await h.api.go(6);
 const records=[];
 for(const [nodeId,section,parameterName,figureId,comparisonIndex,name]of [
  ['features','parameters','smoothingWindow',null,0,'gear-baseline'],
  ['features','parameters','smoothingWindow',null,2,'gear-comparison-3'],
  ['features','boundary',null,'acceptance-gates-0',0,'gear-acceptance-gates'],
  ['segment','tool',null,'otsu-variance',0,'otsu-variance'],
  ['components','tool',null,'components-0',0,'component-selection'],
 ]){
  h.api.pipelineView.select(nodeId);h.api.pipelineView.openEvidence(section,{parameterName,figureId});
  const viewer=h.api.pipelineView.evidenceViewer;viewer.state.comparisonIndex=comparisonIndex;viewer.render();
  const image=viewer.current.svg.match(/href="data:image\/png;base64,([^\"]+)"/);
  if(!image)throw Error('Renderer did not return a plot');
  await fs.writeFile(path.join(output,name+'.png'),Buffer.from(image[1],'base64'));
  records.push({file:name+'.png',...viewer.snapshot()});h.api.pipelineView.closeEvidence();
 }
 await fs.writeFile(path.join(output,'scope.json'),JSON.stringify({scope:'Local pixel replay and shared figure renderer preview. This is not a native desktop UI run or blind usability acceptance.',source:path.join(packet,input.file),records},null,2)+'\n');
 if(h.errors.length)throw Error(JSON.stringify(h.errors));
 console.log(output);
}finally{h.close();}
