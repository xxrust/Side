import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {Workspace} from '../src/workspace.js';
import {readReferenceFiles} from '../src/reference-import.js';
import {canvasProjectAgentContext,readReferenceText} from '../src/canvas-agent-context.js';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const readData=async file=>`data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;

test('real reference bytes commit and bind atomically; Agent reads the same text; undo removes both',async()=>{
 const p=new Workspace(),board=p.ensureProjectCanvas(),space=board.projectSpaces.references[0];
 const bytes=await fs.readFile(new URL('../package.json',import.meta.url));
 const file=new File([bytes],'package.json',{type:'application/json'}),records=await readReferenceFiles([file],{readData});
 const before=p.workflow.references.length,imported=p.importCanvasReferences(board.id,space.id,records);
 assert.equal(imported.length,1);assert.equal(imported[0].extractedText,bytes.toString());
 const ctx=canvasProjectAgentContext(p,board.id);assert.equal(ctx.references[0].records[0].id,imported[0].id);
 assert.match(JSON.stringify(readReferenceText(p,{reference_id:imported[0].id})),/agentcv-desktop/);
 p.undo();assert.equal(p.workflow.references.length,before);assert.equal(p.canvasProjectContext(board.id).references[0].referenceIds.length,0);
 p.redo();assert.equal(p.canvasProjectContext(board.id).references[0].referenceIds[0],imported[0].id);
 const saved=JSON.parse(p.serialize()),loaded=new Workspace();await loaded.load(saved);assert.equal(loaded.workflow.references[0].dataURL,records[0].dataURL);
});

test('all bytes prepare first; read failure, size limits and missing destination preserve workspace',async()=>{
 const p=new Workspace(),board=p.ensureProjectCanvas(),space=board.projectSpaces.references[0],before=JSON.stringify(p.data);
 const good=new File(['real text'],'a.txt',{type:'text/plain'}),broken={name:'b.txt',size:1,type:'text/plain',text:async()=>{throw Error('read denied')}};
 await assert.rejects(()=>readReferenceFiles([good,broken],{readData}),/read denied/);assert.equal(JSON.stringify(p.data),before);
 await assert.rejects(()=>readReferenceFiles(Array(41).fill(good),{readData}),/40/);
 await assert.rejects(()=>readReferenceFiles([{...broken,size:33*1024*1024}],{readData}),/32 MB/);
 assert.throws(()=>p.importCanvasReferences(board.id,'missing',[{name:'a'}]),/不存在/);assert.equal(JSON.stringify(p.data),before);
 assert.throws(()=>p.importCanvasReferences(board.id,space.id,[{name:'a'},{}]),/名稱/);assert.equal(JSON.stringify(p.data),before);
});

test('actual UI file picker cancellation, import, redraw and real drop target',async()=>{
 const h=await createHarness();try{
  await h.api.startupReady;const p=h.api.project;p.newProject();await h.tick();
  const card=()=>h.w.document.querySelector('.canvas-project-reference'),eater=()=>card().querySelector('.reference-eater');
  assert.ok(eater());const node=eater();
  card().querySelector('.canvas-project-actions button').click();await h.tick();assert.equal(eater().dataset.state,'choosing');
  h.$('browserReferences').dispatchEvent(new h.w.Event('cancel'));await h.tick();assert.equal(eater().dataset.state,'hungry');assert.equal(p.workflow.references.length,0);
  card().querySelector('.canvas-project-actions button').click();await h.files('browserReferences',[new File(['工件規格：上限 50 ms'],'requirements.txt',{type:'text/plain'})]);await h.tick();
  assert.equal(p.workflow.references.length,1);assert.equal(p.canvasProjectContext(h.api.inquiryView.boardId).references[0].referenceIds.length,1);
  assert.equal(eater(),node,'redraw reattaches the same mascot');assert.equal(eater().dataset.state,'eating');
  await new Promise(r=>setTimeout(r,900));assert.equal(eater().dataset.state,'happy');await new Promise(r=>setTimeout(r,1350));assert.equal(eater().dataset.compact,'true');
  const drop=new h.w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{types:['Files'],files:[new File(['second document'],'extra.md',{type:'text/plain'})]}});card().dispatchEvent(drop);await h.tick();await h.tick();
  assert.equal(p.workflow.references.length,2);assert.equal(h.api.inquiryView.board().items.length,0,'reference drop did not create a canvas image');assert.equal(p.canvasProjectContext(h.api.inquiryView.boardId).references[0].referenceIds.length,2);
  assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('switching projects during a file picker never imports into the new project',async()=>{
 const h=await createHarness();try{await h.api.startupReady;h.api.project.newProject();await h.tick();h.w.document.querySelector('.canvas-project-reference .canvas-project-actions button').click();await h.tick();h.api.project.newProject();await h.tick();await h.files('browserReferences',[new File(['old project'],'old.txt',{type:'text/plain'})]);await h.tick();assert.equal(h.api.project.workflow.references.length,0);assert.equal(h.w.document.querySelector('.reference-eater').dataset.state,'hungry');assert.deepEqual(h.errors,[]);}finally{h.close()}
});
