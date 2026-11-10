import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {flowVisual} from '../src/flow-visual-grammar.js';
import {buildProgramFlow} from '../src/program-flow.js';
import {layoutProgramFlow,programFlowLayoutKey} from '../src/program-flow-layout.js';

const all=layout=>[...layout.nodes,...layout.groups];
function geometry(layout,flow){
 const objects=all(layout),byId=new Map(objects.map(node=>[node.id,node]));
 assert.equal(new Set(objects.map(node=>node.id)).size,objects.length);
 assert.equal(objects.length+layout.entries.length,flow.nodes.length);
 for(const node of objects){
  assert.ok([node.x,node.y,node.width,node.height].every(Number.isFinite));
  assert.ok(node.width>0&&node.height>0);
  assert.ok(node.x>=0&&node.y>=0&&node.x+node.width<=layout.width+.01&&node.y+node.height<=layout.height+.01);
  const parent=byId.get(node.layoutParentId);
  if(parent){assert.ok(node.x>=parent.x&&node.y>parent.y);assert.ok(node.x+node.width<=parent.x+parent.width+.01&&node.y+node.height<=parent.y+parent.height+.01);}
  const original=flow.nodes.find(item=>item.id===node.id);
  for(const property of ['instanceId','parentId','title','status','judgement','runId','stepId','sourceImages'])assert.deepEqual(node[property],original[property]);
 }
 for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++){
  const a=objects[i],b=objects[j];if(a.layoutParentId!==b.layoutParentId)continue;
  assert.ok(a.x+a.width<=b.x+.01||b.x+b.width<=a.x+.01||a.y+a.height<=b.y+.01||b.y+b.height<=a.y+.01,`${a.id} overlaps ${b.id}`);
 }
 assert.deepEqual(layout.edges.map(({points,...edge})=>edge),flow.edges.filter(edge=>edge.kind==='dependency'));
 for(const edge of layout.edges){
  assert.ok(edge.points.length>=2,edge.id);
  assert.ok(edge.points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));
  const onBoundary=(p,n)=>p.x>=n.x-.01&&p.x<=n.x+n.width+.01&&p.y>=n.y-.01&&p.y<=n.y+n.height+.01&&(Math.abs(p.x-n.x)<.01||Math.abs(p.x-n.x-n.width)<.01||Math.abs(p.y-n.y)<.01||Math.abs(p.y-n.y-n.height)<.01);
  assert.ok(onBoundary(edge.points[0],byId.get(edge.from)),`source route ${edge.id}`);
  assert.ok(onBoundary(edge.points.at(-1),byId.get(edge.to)),`target route ${edge.id}`);
  for(let i=1;i<edge.points.length;i++)assert.ok(edge.points[i].x===edge.points[i-1].x||edge.points[i].y===edge.points[i-1].y,`orthogonal ${edge.id}`);
 }
}

for(const name of ['actual-pi-workspace-portable','actual-python-workspace'])test(`lays out the saved ${name} real execution without losing provenance or branches`,async()=>{
 const fixture=JSON.parse(await fs.readFile(new URL(`../../reviews/2026-10-27-program-flow/${name}.agentcv.json`,import.meta.url),'utf8'));
 const flow=buildProgramFlow(fixture),before=JSON.stringify(flow),layout=await layoutProgramFlow(flow);
 assert.ok(flow.nodes.length>3);assert.ok(flow.edges.some(edge=>edge.kind==='dependency'));
 geometry(layout,flow);assert.equal(JSON.stringify(flow),before);
 for(const node of [...all(layout),...layout.entries,...layout.runRoots]){for(const field of ['artifacts','ownArtifacts','outputs','inputs','code','justification','parameters'])assert.equal(field in node,false,`layout must not retain ${field}`);}
 assert.equal(layout.diagnostics.filter(item=>item.code.startsWith('LAYOUT_')).length,0);
 assert.ok(layout.entries.length>0);assert.ok(!layout.nodes.some(node=>node.kind==='run'));
 assert.deepEqual(all(layout).map(node=>node.id).sort(),flow.nodes.filter(node=>node.kind!=='run').map(node=>node.id).sort());
 assert.deepEqual(await layoutProgramFlow(flow),layout,'same saved graph produces stable geometry');
});

// Small graph inputs exercise the layout algorithm, not fabricated CV results.
const small=(nodes,pairs)=>({nodes:nodes.map(node=>({title:node.id,kind:'step',...node})),edges:pairs.map(([from,to],index)=>({id:`edge-${index}`,kind:'dependency',from,to})),diagnostics:[]});
test('compound layout supports fork/join, cross-procedure dependencies, nested groups and independent peers',async()=>{
 const flow=small([{id:'p',kind:'procedure'},{id:'a',parentId:'p'},{id:'q',kind:'procedure'},{id:'b',parentId:'q'},{id:'c',parentId:'q'},{id:'nested',kind:'procedure',parentId:'q'},{id:'join',parentId:'nested'},{id:'independent',parentId:'p'}],[['a','b'],['a','c'],['b','join'],['c','join']]);
 const layout=await layoutProgramFlow(flow);geometry(layout,flow);
 assert.equal(layout.groups.length,3);assert.equal(layout.nodes.length,5);
 const byId=new Map(all(layout).map(node=>[node.id,node]));
 assert.ok(byId.get('a').y<byId.get('b').y);assert.ok(byId.get('a').y<byId.get('c').y);
 assert.ok(byId.get('b').y<byId.get('join').y);assert.ok(byId.get('c').y<byId.get('join').y);
 assert.equal(layout.edges.some(edge=>edge.from==='independent'||edge.to==='independent'),false);
 const nested=small([{id:'outer',kind:'procedure'},{id:'inner',kind:'procedure',parentId:'outer'},{id:'first',parentId:'inner'},{id:'second',parentId:'inner'}],[['first','second']]);
 const spaced=await layoutProgramFlow(nested,{nodeGap:48,layerGap:80});geometry(spaced,nested);
 const first=spaced.nodes.find(node=>node.id==='first'),second=spaced.nodes.find(node=>node.id==='second');
 assert.ok(second.y-first.y-first.height>=80,'every nested procedure must receive the configured layer gap');
});

test('repeated call labels remain separate instances, empty procedure and legacy run remain selectable',async()=>{
 const flow=small([{id:'call#1',title:'same step'},{id:'call#2',title:'same step'},{id:'empty',kind:'procedure'},{id:'legacy',kind:'run',legacy:true}],[['call#1','call#2']]);
 const layout=await layoutProgramFlow(flow);geometry(layout,flow);
 assert.equal(layout.nodes.length,4);assert.equal(layout.groups.length,0);assert.equal(layout.entries.length,0);
 assert.deepEqual(layout.runRoots.map(node=>node.id),['legacy']);
 assert.ok(layout.nodes.find(node=>node.id==='call#1').y<layout.nodes.find(node=>node.id==='call#2').y);
});

test('empty graph returns finite empty bounds and absent endpoints produce diagnostics, never fabricated nodes',async()=>{
 const empty=await layoutProgramFlow({nodes:[],edges:[]});assert.equal(empty.width,0);assert.equal(empty.height,0);
 const layout=await layoutProgramFlow(small([{id:'real'}],[['missing','real']]));
 assert.equal(layout.nodes.length,1);assert.equal(layout.edges.length,0);assert.equal(layout.diagnostics[0].code,'LAYOUT_MISSING_ENDPOINT');
});

test('unrelated observed steps stay parallel even when timestamps suggest execution order',async()=>{
 const flow=small([{id:'earlier',startedAt:'2026-10-27T00:00:00Z'},{id:'later',startedAt:'2026-10-27T00:01:00Z'},{id:'third',startedAt:'2026-10-27T00:02:00Z'}],[]);
 const layout=await layoutProgramFlow(flow);geometry(layout,flow);
 assert.equal(new Set(layout.nodes.map(node=>node.y)).size,1);assert.equal(layout.edges.length,0);
 const key=programFlowLayoutKey(flow);assert.equal(programFlowLayoutKey(flow,{direction:'DOWN',nodeWidth:150}),key);assert.equal(layout.nodes[0].width,flowVisual(flow.nodes[0]).width);assert.equal(layout.nodes[0].height,flowVisual(flow.nodes[0]).height);flow.nodes[0].status='FAILED';flow.nodes[0].outputs={value:3};assert.equal(programFlowLayoutKey(flow),key);
 flow.edges.push({id:'observed',kind:'dependency',from:'earlier',to:'later'});assert.notEqual(programFlowLayoutKey(flow),key);
});

test('dependencies attached to procedure instances keep exact group endpoints',async()=>{
 const flow=small([{id:'p',kind:'procedure'},{id:'a',parentId:'p'},{id:'q',kind:'procedure'},{id:'b',parentId:'q'}],[['p','b'],['a','q']]);
 geometry(await layoutProgramFlow(flow),flow);
});
