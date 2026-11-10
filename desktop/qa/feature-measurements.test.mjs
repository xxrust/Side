import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Project} from '../src/model.js';
import {inquiryMethods,inquiryGeometryBinding,prepareInquiry} from '../src/visual-inquiry-model.js';
import {runInquiryGeometry} from '../src/inquiry-geometry.js';
import {measureFeatures,resolveFeatureMeasurement,modesFor} from '../src/feature-measurements.js';
import {decodeBenchmarkImage} from '../scripts/agentcv-benchmark-batch.mjs';
import {compactVisualSnapshot} from '../src/agent.js';
class MeasurementProject extends Project{} Object.assign(MeasurementProject.prototype,inquiryMethods);
const bytes=fs.readFileSync(new URL('../../research/opencv-traditional-10-2026-10-25/assets/smarties.png',import.meta.url)),dataURL='data:image/png;base64,'+bytes.toString('base64');
const decoded=decodeBenchmarkImage(dataURL),regions=[{x:233,y:82,width:72,height:72},{x:343,y:47,width:68,height:70}];
async function actual(){const pixels=await decoded,p=new MeasurementProject(),{board,item,asset}=p.addInquiryImage({label:'OpenCV smarties.png',kind:'original',dataURL,width:pixels.width,height:pixels.height,source:{imageId:'smarties',coordinateSpace:'original-image-pixels'}}),ids=[];for(const roi of regions){const input={kind:'circle',roi,parameters:{}},result=runInquiryGeometry(pixels,input);assert.equal(result.status,'READY');result.inputBinding=inquiryGeometryBinding(asset,input);const tool=p.addInquiryGeometryTool(board.id,item.id,{...input,result});p.selectInquiryGeometryCandidate(board.id,item.id,tool.id,result.candidates[0].id);ids.push(tool.id);}return {p,board,item,ids,pixels};}

test('well-defined analytic distances include extended lines, angles, intersecting and nested circles',()=>{
 const circle=(x,y,r)=>({type:'circle',center:{x,y},radius:r}),line=(ax,ay,bx,by)=>({type:'line',from:{x:ax,y:ay},to:{x:bx,y:by}}),a=line(0,0,10,0),b=line(0,4,10,4);
 assert.equal(measureFeatures(a,b,'line-midpoint').value,4);assert.equal(measureFeatures(a,line(0,0,0,10),'angle').value,90);
 assert.equal(measureFeatures(a,circle(5,8,3),'line-circle-center').value,8);assert.equal(measureFeatures(a,circle(5,8,3),'line-circle-gap').value,5);assert.equal(measureFeatures(a,circle(5,2,3),'line-circle-gap').value,0);
 for(const [first,second,d]of [[circle(0,0,3),circle(10,0,2),5],[circle(0,0,10),circle(2,0,3),5],[circle(0,0,3),circle(2,0,10),5],[circle(0,0,5),circle(6,0,4),0],[circle(0,0,5),circle(0,0,3),2],[circle(0,0,5),circle(0,0,5),0]]){const r=measureFeatures(first,second,'circle-gap');assert.equal(r.value,d);assert.ok(Math.abs(Math.hypot(r.endpoints[0].x-r.endpoints[1].x,r.endpoints[0].y-r.endpoints[1].y)-d)<1e-8);}
 assert.throws(()=>measureFeatures(a,b,'circle-gap'));assert.deepEqual(modesFor('arrow','circle'),[]);
});

test('OpenCV photo detections drive typed measurements, saved projects, immutable questions and independent snapshot clones',async()=>{
 const {p,board,item,ids}=await actual(),m=p.addFeatureMeasurement(board.id,{itemId:item.id,toolIds:ids,mode:'circle-center'}),first=p.featureMeasurementContext(board.id)[0].result;assert.equal(first.status,'READY');assert.ok(first.value>113&&first.value<115);assert.equal(first.provenance.features.length,2);
 const snap=p.captureInquirySnapshot(board.id),summary=compactVisualSnapshot(snap);assert.equal(summary.measurementResults[0].value,first.value);assert.equal(summary.measurements[0].id,m.id);
 const saved=JSON.parse(p.serialize());prepareInquiry(saved);assert.equal(resolveFeatureMeasurement(saved.visualInquiry.boards[0],m).value,first.value);
 const cloned=p.cloneInquirySnapshot(snap);assert.notEqual(cloned.measurements[0].itemId,item.id);assert.ok(cloned.measurements[0].toolIds.every(id=>!ids.includes(id)));assert.equal(resolveFeatureMeasurement(cloned,cloned.measurements[0]).value,first.value);
 p.updateInquiryGeometryTool(board.id,item.id,ids[0],{parameters:{threshold:50}});assert.equal(p.featureMeasurementContext(board.id)[0].result.status,'UNAVAILABLE');assert.equal(p.featureMeasurementContext(board.id)[0].result.value,null);assert.equal(resolveFeatureMeasurement(snap,m).value,first.value);
 p.undo();assert.equal(p.featureMeasurementContext(board.id)[0].result.value,first.value);p.removeFeatureMeasurement(board.id,m.id);assert.equal(p.featureMeasurementContext(board.id).length,0);p.undo();assert.equal(p.featureMeasurementContext(board.id)[0].result.value,first.value);
 p.removeInquiryGeometryTool(board.id,item.id,ids[0]);assert.match(p.featureMeasurementContext(board.id)[0].result.reason,/移除/);p.removeInquiryItem(board.id,item.id);assert.equal(p.featureMeasurementContext(board.id).length,0);p.undo();assert.equal(p.featureMeasurementContext(board.id).length,1);
});

test('annotations, unchecked candidates, injected numbers and cross-image references cannot become feature measurements',async()=>{
 const {p,board,item,ids}=await actual(),before=JSON.stringify(p.data);for(const input of [{itemId:item.id,toolIds:['arrow',ids[0]],mode:'line-circle-gap'},{itemId:item.id,toolIds:ids,mode:'circle-center',value:1},{itemId:item.id,toolIds:[ids[0],ids[0]],mode:'circle-center'},{itemId:'other-image',toolIds:ids,mode:'circle-center'}]){assert.throws(()=>p.addFeatureMeasurement(board.id,input));assert.equal(JSON.stringify(p.data),before);}
 p.selectInquiryGeometryCandidate(board.id,item.id,ids[0],null);assert.throws(()=>p.addFeatureMeasurement(board.id,{itemId:item.id,toolIds:ids,mode:'circle-center'}),/確認/);
});
