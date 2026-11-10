import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {annotationKey} from '../src/canvas-relations.js';
import {placeCurrentSourceOriginal} from './canvas-original-fixture.mjs';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
test('current canvas shell preserves real multi-assets, source relations, unique marks, distance and question drafts without the removed wizard',async()=>{
 const h=await createHarness();try{
  const {api,w}=h,p=api.project,v=api.inquiryView;
  const images=await Promise.all(['box.png','box_in_scene.png'].map(async name=>({name,dataUrl:'data:image/png;base64,'+(await readFile(new URL('../../research/opencv-traditional-10-2026-10-25/assets/'+name,import.meta.url))).toString('base64')})));
  await api.addImages(images);await placeCurrentSourceOriginal(h);
  assert.equal(api.page,6);assert.ok(v.embedded);assert.equal(w.document.querySelectorAll('.pipeline-create-form,[data-pipeline-target]').length,0);
  const b=v.board(),source=p.canvasProjectContext(b.id).sources[0];assert.equal(source.imageIds.length,2);
  const reference=p.addReference({name:'inspection-notes.txt',type:'text',text:'Compare the annotated edges on this source; no acceptance tolerance specified.'});
  const docs=p.addCanvasReferenceSpace(b.id,{title:'Inspection notes',referenceIds:[reference.id]});
  p.linkCanvasSpaces(b.id,{fromSpaceId:docs.id,toSpaceId:source.id,predicate:'reference_for',description:'Notes apply to the two source images'});
  const context=p.canvasProjectContext(b.id);assert.equal(context.references.find(r=>r.id===docs.id).records[0].extractedText,reference.extractedText);assert.ok(context.relations.some(r=>r.fromSpaceId===docs.id&&r.toSpaceId===source.id));
  const item=b.items[0];for(const y of [30,130]){const a=p.addInquiryAnnotation(b.id,item.id,w.JSON.parse(JSON.stringify({type:'line',points:[{x:20,y},{x:160,y}]})));v.annotationSelections.add(annotationKey(item.id,a.id));}
  assert.equal(new Set(v.board().items[0].annotations.map(a=>a.id)).size,2);v.selected.add(item.id);v.addDistance();assert.equal(p.data.canvasRelations[0].result.value,100);assert.equal(p.data.canvasRelations[0].result.status,'ANNOTATION_ONLY');
  await v.ask();const input=v.panel.querySelector('[aria-label="畫板問題"]');assert.ok(input);input.value='Why this distance?';input.dispatchEvent(new w.Event('input',{bubbles:true}));
  await assert.rejects(()=>v.sendLocalQuestion(),/連接 Pi/);assert.equal(v.currentLocalThread().question,'Why this distance?');assert.equal(v.currentLocalThread().status,'DRAFT');assert.equal(p.data.chat.length,0);
  const saved=JSON.parse(p.serialize());assert.equal(saved.canvasThreads[0].question,'Why this distance?');assert.equal(saved.canvasThreads[0].snapshot.selection.annotationKeys.length,2);assert.equal(saved.canvasRelations[0].result.value,100);assert.equal(saved.images.length,2);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
