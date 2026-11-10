import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {normalizeStructuredLayers,structuredLayerMethods,prepareStructuredLayerViews,structuredLayersContract} from '../src/structured-result-layers.js';
import {algorithmCapabilities} from '../src/algorithm-workspace.js';
const desktop=path.resolve(import.meta.dirname,'..'),bytes=fs.readFileSync(path.join(desktop,'../research/opencv-traditional-10-2026-10-25/assets/box.png'));
const image={id:'actual-opencv-box',name:'box.png',width:324,height:223,dataUrl:'data:image/png;base64,'+bytes.toString('base64')};
const code=`
with step('actual-contour'):
    threshold,binary=cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    contours,_=cv2.findContours(binary,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    contour=max(contours,key=cv2.contourArea)
    points=[{'x':float(p[0][0]),'y':float(p[0][1])} for p in contour]
    x,y,w,h=cv2.boundingRect(contour)
    rect=[{'x':float(x),'y':float(y)},{'x':float(x+w),'y':float(y)},{'x':float(x+w),'y':float(y+h)},{'x':float(x),'y':float(y+h)}]
    centre,radius=cv2.minEnclosingCircle(contour)
    objects=[{'id':'actual-roi','type':parameters.get('firstType','roi'),'geometry':{'points':rect}},
             {'id':'actual-top','type':'line','geometry':{'points':rect[:2]}},
             {'id':'actual-open-contour','type':'polyline','geometry':{'points':points[:5]}},
             {'id':'actual-blob','type':'blob','geometry':{'points':points}},
             {'id':'actual-circle','type':'circle','geometry':{'center':{'x':float(centre[0]),'y':float(centre[1])},'radius':float(radius)}},
             {'id':'actual-width','type':'measurement','geometry':{'points':rect[:2],'value':float(w),'unit':'px'}},
             {'id':'actual-area','type':'note','geometry':{'points':[rect[0]],'text':'Actual contour area='+str(cv2.contourArea(contour))}}]
    layer={'id':'actual-geometry','objects':objects}
    if parameters.get('unknownStep'): layer['stepId']='not-executed'
    if parameters.get('unknownCoordinates'): objects[0]['coordinateSpace']={'imageId':'not-an-input'}
    if parameters.get('misplacedMeasurement'):
        objects[5]['value']=objects[5]['geometry'].pop('value')
        objects[5]['unit']=objects[5]['geometry'].pop('unit')
    save_image('actual-binary',binary)
    if parameters.get('directAssignment'):
        layer.update({'imageId':image_records[0]['id'],'sourceId':image_records[0]['id'],'stepId':'actual-contour#1'})
        structuredLayers=[layer]
    else:
        save_layers('actual-layer-record', [layer])
result={'actualContourArea':float(cv2.contourArea(contour)),'actualWidth':float(w)}
`;
function run(parameters={}){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agentcv-layer-contract-')),request={runId:crypto.randomUUID(),title:'Actual OpenCV structured geometry contract',code,images:[image],sourceBinding:{images:[{imageId:image.id,width:image.width,height:image.height}]},parameters};fs.writeFileSync(path.join(directory,'request.json'),JSON.stringify(request));const execution=spawnSync(path.join(desktop,'runtime/python/bin/python3'),[path.join(desktop,'scripts/cv-runtime.py'),'--run',path.join(directory,'request.json'),directory],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});assert.equal(execution.status,0,execution.stderr);return {directory,report:JSON.parse(fs.readFileSync(path.join(directory,'result.json'),'utf8'))};}
const actual=run();
test('real Python save_layers output round-trips through the same JS contract for every supported shape',()=>{
 const {report,directory}=actual;assert.equal(report.status,'SUCCEEDED',JSON.stringify(report.error));assert.ok(report.result.actualContourArea>0);const normalized=normalizeStructuredLayers(report,{images:[image]});assert.deepEqual(normalized[0].objects.map(o=>o.type),structuredLayersContract['x-agentcv'].objectTypes);assert.equal(normalized[0].imageId,image.id);assert.equal(normalized[0].sourceId,image.id);assert.equal(normalized[0].stepId,'actual-contour#1');assert.ok(normalized[0].objects.every(o=>o.locked&&o.coordinateSpace.imageId===image.id&&o.coordinateSpace.kind==='original-image-pixels'));assert.equal(normalized[0].objects.find(o=>o.type==='measurement').geometry.value,report.result.actualWidth);const artifact=report.artifacts.find(a=>a.id==='actual-layer-record');assert.deepEqual(JSON.parse(fs.readFileSync(artifact.path,'utf8')),report.structuredLayers);assert.ok(fs.statSync(path.join(directory,'outputs','actual-binary.png')).size>0);assert.equal(algorithmCapabilities().sdk.structuredLayers.contract.$id,structuredLayersContract.$id);
});
test('Python rejects illegal types, invented steps, unknown coordinates and misplaced measurement fields before saving an unusable layer',()=>{
 for(const [parameters,pathSuffix,expectedType]of [[{firstType:'polygon'},'.objects[0].type','polygon'],[{unknownStep:true},'.stepId',null],[{unknownCoordinates:true},'.objects[0].coordinateSpace.imageId','roi'],[{misplacedMeasurement:true},'.objects[5].geometry.value','measurement'],[{firstType:'polygon',directAssignment:true},'.objects[0].type','polygon']]){
  const {directory,report}=run(parameters);try{assert.equal(report.status,'FAILED');assert.equal(report.error.type,'StructuredLayerContractError');assert.ok(report.error.details.path.endsWith(pathSuffix),JSON.stringify(report.error));assert.ok(report.error.details.hint);if(expectedType)assert.equal(report.error.details.type,expectedType);assert.ok(!report.artifacts.some(a=>a.id==='actual-layer-record'));assert.ok(!fs.existsSync(path.join(directory,'outputs','actual-layer-record.json')));}finally{fs.rmSync(directory,{recursive:true,force:true});}
 }
});
test('actual historical bad Pi layers produce diagnostics without poisoning unrelated valid runs or changing historical facts',()=>{
 const historical=JSON.parse(fs.readFileSync(path.join(desktop,'../codex-audit-logs/20261029-core-pi-followup-selected/completed.agentcv.json'),'utf8'));historical.images.push({...image,dataURL:image.dataUrl});historical.algorithmRuns.push(actual.report);const board=historical.visualInquiry.boards.find(b=>b.items.length),assetId=crypto.randomUUID();historical.visualInquiry.assets.push({id:assetId,width:image.width,height:image.height,dataURL:actual.report.artifacts.find(a=>a.type==='image').dataUrl,source:{runId:actual.report.runId,imageId:image.id,coordinateSpace:'original-image-pixels'}});board.items.push({id:crypto.randomUUID(),assetId});const before=JSON.stringify(historical),context=structuredLayerMethods.getCanvasStructuredContext.call({data:historical},board.id),targeted=structuredLayerMethods.getCanvasStructuredContext.call({data:historical},board.id,{runId:actual.report.runId});assert.ok(targeted.layers.length>0);assert.ok(targeted.layers.every(layer=>layer.runId===actual.report.runId));assert.deepEqual(targeted.diagnostics,[]);assert.ok(context.diagnostics.some(d=>d.code==='STRUCTURED_LAYER_TYPE'&&d.path.endsWith('.type')&&d.hint.includes('roi')));assert.ok(context.diagnostics.every(d=>d.path&&d.code&&d.hint&&d.runId));assert.equal(JSON.stringify(historical),before);assert.doesNotThrow(()=>prepareStructuredLayerViews(historical));assert.equal(JSON.stringify(historical),before);
 const invalid=historical.algorithmRuns.find(r=>r.structuredLayers?.some(l=>l.objects.some(o=>o.type==='polygon')));assert.throws(()=>normalizeStructuredLayers(invalid,historical),error=>error.code==='STRUCTURED_LAYER_TYPE'&&error.details.path.includes('objects['));fs.rmSync(actual.directory,{recursive:true,force:true});
});
