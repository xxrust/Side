import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Workspace as Project} from '../src/workspace.js';
import {createRequire} from 'node:module';
import {Agent,compactVisualSnapshot} from '../src/agent.js';
import {canvasProjectAgentContext,readReferenceText} from '../src/canvas-agent-context.js';
import {captureAgentInputs,assessAgentChanges,refreshAgentBaseline,refreshesAgentInputs} from '../src/agent-change-impact.js';
const require=createRequire(import.meta.url),esbuild=require('esbuild');
const bundled=await esbuild.build({entryPoints:['src/visual-agent-controller.js'],bundle:true,write:false,platform:'node',format:'esm',loader:{'.css':'empty'},logLevel:'silent'});
const {VisualAgentController}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));

// Existing saved project contains actual pixels and saved algorithm outputs, never generated answers.
const saved=JSON.parse(readFileSync(new URL('../../reviews/2026-10-27-program-flow/actual-pi-workspace-portable.agentcv.json',import.meta.url)));
function project(){const p=new Project();p.data=structuredClone(saved);const w=p.workflow;w.references.push({id:'engineering-document',name:'工程說明',status:'TEXT',text:'完整內容'.repeat(7000)+'全文結尾',dataURL:'data:application/pdf;base64,AAAA'});const board=p.ensureProjectCanvas();return {p,board};}

test('real saved project semantics survive JSON, tool reads return full reference and precise image identities without binary bytes',async()=>{
 const {p,board}=project(),source=board.projectSpaces.sources[0],ref=board.projectSpaces.references[0];
 p.updateCanvasSpace(board.id,ref.id,{text:'這組影像使用相同的工件介紹'});
 p.linkCanvasSpaces(board.id,{fromSpaceId:ref.id,toSpaceId:source.id,imageIds:[p.data.images[0].id],description:'只適用第一張'});
 p.data=JSON.parse(JSON.stringify(p.data));
 const full=canvasProjectAgentContext(p,board.id,{includeGeometry:true});
 assert.deepEqual(full.sources[0].imageIds,p.data.images.map(i=>i.id));assert.equal(full.sources[0].images[0].sha256,p.data.images[0].sha256);
 const document=full.references[0].records.find(r=>r.id==='engineering-document');assert.equal(document.availableTextChars,28004);assert.equal(document.text,undefined,'large reference text is read explicitly, never duplicated in every canvas context');assert.equal(document.read,'read_reference');const first=readReferenceText(p,{reference_id:document.id}),second=readReferenceText(p,{reference_id:document.id,offset:first.nextOffset});assert.equal(first.text.length+second.text.length,28004);assert.ok((first.text+second.text).endsWith('全文結尾'));assert.equal(second.nextOffset,null);assert.equal(full.references[0].text,'這組影像使用相同的工件介紹');
 assert.equal(full.relations[0].imageIds,undefined);assert.deepEqual(full.relations[1].imageIds,[p.data.images[0].id]);assert.ok(!JSON.stringify(full).includes('base64,'));
 const controller=new VisualAgentController({project:p,view:{},sources:{catalog:()=>[]}});
 assert.deepEqual((await controller.action('get_canvas_project_context',{board_id:board.id})).references,full.references);
 const visual=await controller.action('get_visual_context',{board_id:board.id});assert.equal(visual.canvasProject.boardId,board.id);
 const agent=new Agent(p,{page:()=>6,locked:()=>false,visualContext:()=>visual});
 assert.equal((await agent.execute('get_context',{})).canvasProject.boardId,board.id);
 assert.deepEqual(await agent.execute('get_canvas_project_context',{board_id:board.id}),full);
 let text='',offset=0;do{const part=await agent.execute('read_reference',{reference_id:'engineering-document',offset});text+=part.text;offset=part.nextOffset;}while(offset!==null);
 assert.equal(text,p.workflow.references.find(r=>r.id==='engineering-document').text);assert.throws(()=>readReferenceText(p,{reference_id:'engineering-document',offset:-1}),/offset/);
});

test('snapshot preserves historical reference text/relationships; full vector tool does not invent original coordinates for renders',()=>{
 const {p,board}=project(),image=p.data.images[0];
 const added=p.addInquiryImage({kind:'original',label:image.name||'原圖',width:image.width,height:image.height,dataURL:image.dataURL,source:{imageId:image.id,coordinateSpace:'original-image-pixels'}},{boardId:board.id});
 const points=Array.from({length:40},(_,i)=>({x:i,y:i}));p.addInquiryAnnotation(board.id,added.item.id,{type:'pen',points,text:'工程師的範圍'});
 const snapshot=p.captureInquirySnapshot(board.id),compact=compactVisualSnapshot(snapshot);
 const old=snapshot.projectReferenceRecords.find(r=>r.id==='engineering-document').text;p.workflow.references.find(r=>r.id==='engineering-document').text='更新後';
 assert.equal(snapshot.projectReferenceRecords.find(r=>r.id==='engineering-document').text,old);assert.equal(compact.projectReferenceRecords.find(r=>r.id==='engineering-document').text,old);assert.ok(snapshot.projectSpaces.relations.length);assert.ok(!JSON.stringify(snapshot).includes('data:application/pdf'));
 const full=canvasProjectAgentContext(p,board.id,{includeGeometry:true});assert.deepEqual(full.items[0].annotations[0].points,points);assert.equal(full.items[0].coordinateBinding.originalImageCoordinates,true);
 const rendered=p.addInquiryImage({kind:'stage',label:'真圖作為渲染座標引用',width:image.width,height:image.height,dataURL:image.dataURL,source:{imageId:image.id,coordinateSpace:'render-pixels'}},{boardId:board.id});
 const renderContext=canvasProjectAgentContext(p,board.id,{includeGeometry:true});assert.equal(renderContext.items.find(i=>i.id===rendered.item.id).coordinateBinding.originalImageCoordinates,false);
 assert.throws(()=>canvasProjectAgentContext(p,'missing'),/不存在/);
});

test('layout/preview changes leave computational inputs intact, reference text/bindings invalidate and context read refreshes',()=>{
 const {p,board}=project(),reference=board.projectSpaces.references[0],source=board.projectSpaces.sources[0],stamp=()=>captureAgentInputs(p,{boardId:board.id});const before=stamp();
 p.updateCanvasSpace(board.id,source.id,{x:400,y:500,width:800,height:600,selectedImageId:source.imageIds[0]});assert.equal(assessAgentChanges(before,stamp(),{tool:'run_algorithm'}).affected,false);
 p.updateCanvasSpace(board.id,reference.id,{text:'更改適用條件'});const after=stamp();assert.ok(assessAgentChanges(before,after,{tool:'run_algorithm'}).changes.some(c=>c.category==='canvas-project'));
 assert.ok(refreshesAgentInputs('get_canvas_project_context'));const refreshed=refreshAgentBaseline(before,after,'get_canvas_project_context');assert.equal(assessAgentChanges(refreshed,after,{tool:'run_algorithm'}).affected,false);
});
