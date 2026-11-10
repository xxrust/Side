import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutOverlayLabels,overlayBoxesOverlap} from '../src/pipeline-overlay-layout.js';

function fixture(scale,{cluster=false}={}){
 const viewport={x:0,y:0,width:900,height:600},center={x:450,y:300},radius=175*scale,labels=[],markers=[];
 for(let i=0;i<15;i++){
  const angle=cluster?.3+i*.025:i/15*Math.PI*2,anchor={x:center.x+radius*Math.cos(angle),y:center.y+radius*Math.sin(angle)};
  markers.push({...anchor,radius:3});labels.push({id:`peak-${i}`,text:`齒 ${i+1}`,anchor,width:i<9?32:38,height:17,radial:{center,radius}});
 }
 const adjacent=labels[2].anchor,missing={x:adjacent.x+4*scale,y:adjacent.y+7*scale};markers.push({...missing,radius:5});labels.push({id:'missing',text:'M1',anchor:missing,width:25,height:17});
 markers.push({...center,radius:3},{x:center.x+2*scale,y:center.y,radius:3});labels.push({id:'center',text:'採用的齒形中心',anchor:center,width:94,height:17},{id:'hole',text:'孔中心',anchor:{x:center.x+2*scale,y:center.y},width:44,height:17});
 return {labels,markers,viewport};
}

for(const scale of [.3,.5,1])for(const cluster of [false,true])test(`overlay labels avoid every marker and each other at scale ${scale}, cluster=${cluster}`,()=>{
 const fixtureData=fixture(scale,{cluster}),before=JSON.stringify(fixtureData),layout=layoutOverlayLabels(fixtureData.labels,fixtureData);
 assert.equal(layout.unplaced.length,0);assert.equal(layout.placed.length,18);assert.equal(JSON.stringify(fixtureData),before,'observed marker and anchor inputs must never move');
 for(const [index,item]of layout.placed.entries()){
  assert.ok(item.box.x>=4&&item.box.y>=4);assert.ok(item.box.x+item.box.width<=896&&item.box.y+item.box.height<=596);
  for(const marker of fixtureData.markers){const box={x:marker.x-marker.radius,y:marker.y-marker.radius,width:marker.radius*2,height:marker.radius*2};assert.equal(overlayBoxesOverlap(item.box,box,2.9),false,`${item.id} must avoid marker footprint`)}
  for(const other of layout.placed.slice(0,index))assert.equal(overlayBoxesOverlap(item.box,other.box,2.9),false,`${item.id} must avoid ${other.id}`);
  assert.deepEqual(item.leader.from,fixtureData.labels.find(label=>label.id===item.id).anchor);
  if(item.radial){const {center,radius}=item.radial,x=Math.max(item.box.x,Math.min(center.x,item.box.x+item.box.width)),y=Math.max(item.box.y,Math.min(center.y,item.box.y+item.box.height));assert.ok(Math.hypot(x-center.x,y-center.y)>=radius+2.9,'peak text belongs outside the actual workpiece extent')}
 }
});

test('edge labels stay within the viewport and impossible labels are explicit rather than drawn over markers',()=>{
 const labels=[{id:'edge',text:'M1',anchor:{x:2,y:2},width:25,height:17}],markers=[{x:2,y:2,radius:5}],layout=layoutOverlayLabels(labels,{markers,viewport:{x:0,y:0,width:160,height:80}});assert.equal(layout.unplaced.length,0);assert.ok(layout.placed[0].box.x>=4&&layout.placed[0].box.y>=4);
 const impossible=layoutOverlayLabels([{...labels[0],width:200}],{viewport:{x:0,y:0,width:80,height:40}});assert.equal(impossible.placed.length,0);assert.equal(impossible.unplaced[0].reason,'VIEWPORT_TOO_SMALL');
});
