import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {programFlowLayoutKey,layoutProgramFlow} from '../src/program-flow-layout.js';
const require=createRequire(import.meta.url),{JSDOM}=require('../../qa/node_modules/jsdom'),{createCanvas}=require('../../qa/node_modules/@napi-rs/canvas'),{build}=require('esbuild');
const graph=()=>({nodes:[{id:'image',kind:'source',boundary:true,title:'original-a.bmp',status:'AVAILABLE',imageIds:['a']},{id:'node',kind:'step',title:'Analyze',status:'RUNNING'}],edges:[{id:'data',kind:'dependency',from:'image',to:'node'}]});
test('layout geometry ignores display titles but retains actual geometry inputs',async()=>{
 const flow=graph(),renamed=structuredClone(flow);renamed.nodes[0].title='a much longer original-b.bmp';
 assert.equal(programFlowLayoutKey(flow),programFlowLayoutKey(renamed));
 const shape=layout=>({width:layout.width,height:layout.height,nodes:layout.nodes.map(({id,x,y,width,height})=>({id,x,y,width,height})),edges:layout.edges});
 assert.deepEqual(shape(await layoutProgramFlow(flow)),shape(await layoutProgramFlow(renamed)));
 for(const mutate of [f=>f.nodes[0].kind='decision',f=>f.nodes[0].boundary=false,f=>f.nodes[1].role='input',f=>f.nodes[1].parentId='image',f=>f.edges[0].to='image',f=>Object.assign(f.edges[0],{provenance:'classification-route',label:'a real branch condition'})]){
  const changed=structuredClone(flow);mutate(changed);assert.notEqual(programFlowLayoutKey(changed),programFlowLayoutKey(flow));
 }
});
test('map reuses positions and camera across image titles while rendering current metadata and handlers',async()=>{
 const built=await build({stdin:{contents:"export {ProgramFlowMap} from './src/program-flow-map.js';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'iife',globalName:'FlowMap',platform:'browser',loader:{'.css':'empty'},logLevel:'silent'});
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLCanvasElement.prototype.getContext=()=>createCanvas(1,1).getContext('2d');w.eval(built.outputFiles[0].text);
 const selected=[],map=new w.FlowMap.ProgramFlowMap({onSelect:id=>selected.push(id)});w.document.body.append(map.element);
 try{
  const flow=graph(),ready=map.update({flow,runId:'scheme'});await ready;const geometry=map.geometry;map.main.needsFit=false;map.main.camera={x:12,y:15,scale:.5};
  const next=structuredClone(flow);next.nodes[0].title='original-b.bmp';next.nodes[0].imageIds=['b'];next.nodes[1].status='SUCCEEDED';
  assert.equal(map.update({flow:next,runId:'scheme'}),ready);assert.equal(map.geometry,geometry);assert.equal(map.cache.size,1);assert.deepEqual({...map.main.camera},{x:12,y:15,scale:.5});
  const source=map.main.world.querySelector('[data-program-node="image"]');assert.ok(source.textContent.includes('original-b.bmp'));assert.ok(!source.textContent.includes('original-a.bmp'));
  assert.equal(map.main.world.querySelector('[data-program-node="node"]').getAttribute('data-status'),'SUCCEEDED');source.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.deepEqual(selected,['image']);
  delete next.nodes[0].title;assert.equal(map.update({flow:next,runId:'scheme'}),ready);assert.ok(map.main.world.querySelector('[data-program-node="image"]').textContent.includes('未命名步驟'));assert.ok(!map.main.world.textContent.includes('original-a.bmp'));
  next.nodes[0].kind='decision';const changed=map.update({flow:next,runId:'scheme'});assert.notEqual(changed,ready);await changed;assert.notEqual(map.geometry,geometry);
 }finally{dom.window.close();}
});
test('unchanged nodes retain their SVG preview and pending load across status updates',async()=>{
 const built=await build({stdin:{contents:"export {ProgramFlowMap} from './src/program-flow-map.js';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'iife',globalName:'FlowMap',platform:'browser',loader:{'.css':'empty'},logLevel:'silent'});
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLCanvasElement.prototype.getContext=()=>createCanvas(1,1).getContext('2d');w.eval(built.outputFiles[0].text);
 const requests=[],selected=[],pending={};const map=new w.FlowMap.ProgramFlowMap({onSelect:id=>selected.push(id),loadImagePreview:id=>{requests.push(id);return new Promise(resolve=>pending[id]=resolve);}});w.document.body.append(map.element);
 try{
  const flow=graph();await map.update({flow,runId:'scheme'});await Promise.resolve();
  const source=map.main.world.querySelector('[data-program-node="image"]'),load=map.main.previewLoads[0];source.focus();
  flow.nodes[1].status='SUCCEEDED';await map.update({flow,runId:'scheme',selectedId:'image'});
  assert.equal(map.main.world.querySelector('[data-program-node="image"]'),source);assert.equal(map.main.previewLoads[0],load);assert.equal(source.getAttribute('aria-current'),'step');assert.equal(w.document.activeElement,source);assert.deepEqual(requests,['a']);
  pending.a({dataURL:'data:image/png;base64,AAAA'});await load;const picture=source.querySelector('image');assert.equal(picture.getAttribute('data-image-id'),'a');
  flow.nodes[1].durationMs=8;await map.update({flow,runId:'scheme'});assert.equal(source.querySelector('image'),picture);assert.deepEqual(requests,['a']);
  source.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.deepEqual(selected,['image']);
  flow.nodes[0].imageIds=['b'];await map.update({flow,runId:'scheme'});await Promise.resolve();assert.equal(source.isConnected,false);assert.deepEqual(requests,['a','b']);
  const stale=map.main.world.querySelector('[data-program-node="image"]'),staleLoad=map.main.previewLoads[0];flow.nodes[0].imageIds=['c'];await map.update({flow,runId:'scheme'});await Promise.resolve();
  pending.b({dataURL:'data:image/png;base64,BBBB'});await staleLoad;assert.equal(stale.querySelector('image'),null);
  pending.c({dataURL:'data:image/png;base64,CCCC'});await Promise.all(map.main.previewLoads);assert.equal(map.main.world.querySelector('image').getAttribute('data-image-id'),'c');
  const reused=map.main.world.innerHTML;map.main.nodeViews.clear();map._render(map.main);await Promise.resolve();pending.c({dataURL:'data:image/png;base64,CCCC'});await Promise.all(map.main.previewLoads);assert.equal(map.main.world.innerHTML,reused);
  await map.update({flow:{nodes:[],edges:[]},runId:'empty'});assert.equal(map.main.world.children.length,0);assert.equal(map.main.nodeViews.size,0);
 }finally{map.destroy();dom.window.close();}
});

test('unchanged edges retain connected SVG while changed status, identity and geometry invalidate it',async()=>{
 const built=await build({stdin:{contents:"export {ProgramFlowMap} from './src/program-flow-map.js';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'iife',globalName:'FlowMap',platform:'browser',loader:{'.css':'empty'},logLevel:'silent'});
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLCanvasElement.prototype.getContext=()=>createCanvas(1,1).getContext('2d');w.eval(built.outputFiles[0].text);
 const map=new w.FlowMap.ProgramFlowMap();w.document.body.append(map.element);
 try{
  const flow=graph();flow.edges[0].executed=false;flow.edges[0].label='shared_data';flow.edges[0].provenance='classification-route';await map.update({flow,runId:'scheme'});
  assert.ok(map.geometry.edges[0].labelLayout);const label=map.main.world.querySelector('[data-edge-label="data"]');
  const edge=()=>map.main.world.querySelector('[data-program-edge="data"]');let before=edge();
  const sourceNode=map.main.world.querySelector('[data-program-node="image"]');
  const mutations=[],observer=new w.MutationObserver(records=>mutations.push(...records));observer.observe(map.main.world,{childList:true});
  flow.nodes[1].durationMs=12;await map.update({flow,runId:'scheme'});assert.equal(edge(),before);assert.equal(before.isConnected,true);assert.equal(map.main.world.querySelector('[data-edge-label="data"]'),label);
  // Replacing the leading source must not detach/reinsert the unchanged edge,
  // ports, label or trailing step (identity alone would miss those mutations).
  mutations.length=0;observer.takeRecords();
  const stableChildren=new Set([...map.main.world.childNodes].filter(node=>node!==sourceNode));
  flow.nodes[0].imageIds=['new-source'];await map.update({flow,runId:'scheme'});
  mutations.push(...observer.takeRecords());observer.disconnect();
  const touched=mutations.flatMap(record=>[...record.addedNodes,...record.removedNodes]);
  assert.ok(touched.includes(sourceNode));assert.ok(touched.length>0);
  assert.ok(touched.every(node=>!stableChildren.has(node)),'unchanged siblings never leave or move within the SVG');
  flow.edges[0].executed=true;await map.update({flow,runId:'scheme'});assert.notEqual(edge(),before);assert.equal(before.isConnected,false);assert.ok(edge().classList.contains('is-executed'));before=edge();
  flow.nodes[0].title='current-source.bmp';await map.update({flow,runId:'scheme'});assert.notEqual(edge(),before);assert.match(edge().getAttribute('aria-label'),/current-source.bmp/);before=edge();
  flow.nodes[1].kind='decision';await map.update({flow,runId:'scheme'});assert.notEqual(edge(),before);before=edge();
  delete flow.edges[0].provenance;
  for(const labelText of ['shared_data','changed label','']){
   flow.edges[0].label=labelText;await map.update({flow,runId:'scheme'});const retained=edge();
   flow.nodes[1].durationMs++;await map.update({flow,runId:'scheme'});assert.equal(edge(),retained);
   const fresh=new w.FlowMap.ProgramFlowMap();w.document.body.append(fresh.element);
   try{await fresh.update({flow,runId:'scheme'});const normalize=s=>s.replace(/program-flow-arrow-\d+/g,'arrow');assert.equal(normalize(map.main.world.innerHTML),normalize(fresh.main.world.innerHTML),'reused free-label layout matches a clean render');}finally{fresh.destroy();}
  }
  before=edge();
  flow.edges=[];await map.update({flow,runId:'scheme'});assert.equal(edge(),null);assert.equal(before.isConnected,false);assert.equal(map.main.edgeViews.size,0);
 }finally{map.destroy();dom.window.close();}
});
