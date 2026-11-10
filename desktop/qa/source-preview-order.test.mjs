import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs'),esbuild=require('esbuild');
const pause=()=>new Promise(r=>setTimeout(r,10)),until=async fn=>{const deadline=Date.now()+5000;while(!fn()){if(Date.now()>deadline)throw Error('UI did not settle');await pause();}};
test('source previews precede pixel selection and evidence can load before execution housekeeping ends',async()=>{
 const h=await createHarness();let release;try{
 const url='data:image/png;base64,'+fs.readFileSync(new URL('../../research/opencv-traditional-10-2026-10-25/assets/box.png',import.meta.url)).toString('base64');
 await h.api.project.addImages([{name:'one.png',dataUrl:url},{name:'two.png',dataUrl:url}],h.api.decode);
 const built=await esbuild.build({entryPoints:['src/flow-node-panel.js'],bundle:true,write:false,format:'iife',globalName:'SourcePanel',loader:{'.css':'empty'}});h.w.eval(built.outputFiles[0].text);
 h.api.project.data.images[0].sourceMeaning={fields:{sampleModel:'LID'}};
 const p=h.api.project,ids=p.data.images.map(i=>i.id),select=p.selectImage.bind(p);let previewBeforeSelect=false,executionStarted=false,loads=0;
 p.selectImage=async id=>{previewBeforeSelect=h.w.document.querySelector('.flow-source-original img').dataset.imageId===id;return select(id);};
 const gate=new Promise(r=>release=r),dialog=h.w.SourcePanel.openFlowNodePanel({project:p,node:{id:'source',kind:'source',imageIds:ids},flow:{nodes:[],edges:[]},onLoadDecisionEvidence:async()=>{loads++;return {state:'WAITING',message:'此圖尚未檢測'};},onRunInspection:async options=>{executionStarted=true;await options.onResultReady();await gate;}});
 await until(()=>dialog.querySelector('.flow-source-original img').dataset.imageId===ids[0]);assert.equal(dialog.querySelectorAll('select').length,0);assert.equal(dialog.querySelectorAll('.flow-source-meta').length,2);const before=loads;dialog.querySelectorAll('.flow-source-gallery button')[1].click();await until(()=>executionStarted&&loads>before);assert.equal(previewBeforeSelect,true);assert.equal(dialog.getAttribute('aria-busy'),'true');assert.equal(dialog.querySelector('.flow-source-original img').dataset.imageId,ids[1]);assert.doesNotMatch(dialog.querySelector('.flow-source-original figcaption').textContent,/載入/);release();await until(()=>dialog.getAttribute('aria-busy')==='false');dialog.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await until(()=>dialog.getAttribute('aria-busy')==='false'&&dialog.querySelector('.flow-source-original img').dataset.imageId===ids[0]);dialog.close();assert.deepEqual(h.errors,[]);
 }finally{release?.();h.close();}
});

test('thousand-image strip renders only a window and scrolls without page boundaries',async()=>{
 const h=await createHarness();try{
 const url='data:image/png;base64,'+fs.readFileSync(new URL('../../research/opencv-traditional-10-2026-10-25/assets/box.png',import.meta.url)).toString('base64');
 await h.api.project.addImages([{name:'original.png',dataUrl:url}],h.api.decode);
 const p=h.api.project,original=p.data.images[0];for(let i=1;i<1001;i++)p.data.images.push({...original,id:'strip-'+i,name:'sample-'+i+'.png'});
 const built=await esbuild.build({entryPoints:['src/flow-node-panel.js'],bundle:true,write:false,format:'iife',globalName:'SourcePanel',loader:{'.css':'empty'}});h.w.eval(built.outputFiles[0].text);
 const dialog=h.w.SourcePanel.openFlowNodePanel({project:p,node:{id:'reference',kind:'reference',imageIds:p.data.images.map(i=>i.id)},flow:{nodes:[],edges:[]}});
 await until(()=>dialog.querySelectorAll('.flow-source-gallery button').length>0);const strip=dialog.querySelector('.flow-source-gallery');assert.ok(strip.querySelectorAll('button').length<=16);assert.equal(dialog.querySelectorAll('select').length,0);
 strip.scrollLeft=184*998;strip.dispatchEvent(new h.w.Event('scroll'));await until(()=>strip.querySelector('[data-image-id="strip-1000"]'));assert.ok(strip.querySelectorAll('button').length<=16);dialog.close();
 }finally{h.close();}
});
