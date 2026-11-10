import {placeCurrentSourceOriginal} from './canvas-original-fixture.mjs';
// Real DOM edits and production host tools. The outbound transport is observed;
// these tests never synthesize assistant responses or algorithm results.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const from=(h,x)=>h.w.JSON.parse(JSON.stringify(x));
async function until(h,predicate){for(let i=0;i<120;i++){if(predicate())return;await h.tick()}throw Error('Timed out waiting for real canvas operation')}
async function fixture(){const h=await createHarness();for(let n=0;n<2;n++){const c=h.w.document.createElement('canvas');c.width=320;c.height=240;const ctx=c.getContext('2d');ctx.fillStyle='#151515';ctx.fillRect(0,0,320,240);ctx.fillStyle='#eeeeee';ctx.fillRect(40+n*5,40,230,160);await h.api.addImages([{name:`actual-camera-${n}.png`,dataUrl:c.toDataURL()}])}h.api.project.selectImage(h.api.project.data.images[0].id);await h.api.go(6);await until(h,()=>h.api.inquiryView.opened&&!h.api.inquiryView.workflowPending);const v=h.api.inquiryView;await placeCurrentSourceOriginal(h);await v.ask();v.questionDrafts.set(v.currentLocalThread().id,'分析原圖中的工件');return h}
function pointer(h,type,x,y){const v=h.api.inquiryView,item=v.board().items[0],asset=v.asset(item),world={x:item.x+x/asset.width*item.width,y:item.y+y/asset.height*item.height},e=new h.w.MouseEvent(type,{clientX:world.x*v.zoom+v.pan.x,clientY:world.y*v.zoom+v.pan.y,button:0,bubbles:true,cancelable:true});Object.defineProperty(e,'pointerId',{value:3});v.canvas.dispatchEvent(e)}
async function begin(h){const a=h.api.agent,commands=[];a.turn='actual-host-tool-change-impact';a.turnEpoch=h.api.project.epoch;a.turnReference={kind:'visual_inquiry',snapshot:h.api.inquiryView.snapshot()};a.turnVisualBoardId=h.api.inquiryView.boardId;a.expectedStamp=a.stamp();a.wire=async command=>commands.push(command);await request(h,commands,'get_context');return commands}
async function request(h,commands,name,args={}){const a=h.api.agent,id=name+':'+commands.length;await a.event(from(h,{type:'tool_request',turn:a.turn,id,name,args}));const response=commands.find(c=>c.type==='tool_response'&&c.id===id);assert.ok(response,'production tool event must return a response');return response.result}
async function calculate(h,commands){const result=await request(h,commands,'suggest_foreground');assert.ok(!result.error,result.error);assert.ok(Array.isArray(result.candidates)&&result.candidates.length>0,'actual pixel worker returns foreground candidates');return result}
function changed(result,reason){assert.equal(result.code,'AGENT_INPUT_CHANGED');assert.equal(result.retryable,true);assert.match(result.error,reason);assert.ok(result.details,'specific changed-input details are returned to Pi')}

test('moving a local question bubble, wheel zoom and image rearrangement do not block actual original-pixel calculation',async()=>{
 const h=await fixture();try{const v=h.api.inquiryView,p=h.api.project,commands=await begin(h),before=p.data.events.length,thread=v.currentLocalThread();
  const header=v.panel.querySelector('.intent-question-bubble header');assert.ok(header);const start=new h.w.MouseEvent('pointerdown',{clientX:300,clientY:90,bubbles:true,cancelable:true});Object.defineProperty(start,'pointerId',{value:1});header.addEventListener('pointerdown',header.onpointerdown,{once:true});header.dispatchEvent(start);header.addEventListener('pointermove',header.onpointermove,{once:true});header.dispatchEvent(new h.w.MouseEvent('pointermove',{clientX:350,clientY:140}));header.addEventListener('pointerup',header.onpointerup,{once:true});header.dispatchEvent(new h.w.MouseEvent('pointerup'));assert.ok(p.data.events.length>before);assert.ok(Number.isFinite(thread.x));await calculate(h,commands);
  const zoom=v.zoom;v.canvas.dispatchEvent(new h.w.WheelEvent('wheel',{deltaY:-120,clientX:150,clientY:150,bubbles:true,cancelable:true}));assert.notEqual(v.zoom,zoom);await calculate(h,commands);
  v.setTool('select');const previous=v.board().items[0].x;pointer(h,'pointerdown',15,15);pointer(h,'pointermove',30,25);pointer(h,'pointerup',30,25);assert.notEqual(v.board().items[0].x,previous);await calculate(h,commands);
  const item=v.board().items[0],oldWidth=item.width;pointer(h,'pointerdown',320,240);pointer(h,'pointermove',340,255);pointer(h,'pointerup',340,255);assert.notEqual(v.board().items[0].width,oldWidth);await calculate(h,commands);assert.equal(p.data.chat.filter(m=>m.role==='assistant').length,0);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('changing original image or algorithm ROI returns specific input conflicts and context refresh enables real recomputation',async()=>{
 for(const category of ['image','roi']){const h=await fixture();try{const commands=await begin(h),p=h.api.project;
  if(category==='image'){const other=p.data.images[1],source=h.api.inquiryView.panel.querySelector('[aria-label="搜尋與選擇來源圖片"]');assert.ok(source,'current source collection image selector');source.click();const search=h.w.document.querySelector('[aria-label="搜尋全部來源圖片"]');search.value=other.name;search.dispatchEvent(new h.w.Event('input',{bubbles:true}));h.w.document.querySelector('.canvas-source-file-row .icon-label-button').click();await until(h,()=>p.image.id===other.id);assert.equal(p.image.id,other.id)}else{p.setRegion(p.workflow.workpiece.id,from(h,[{x:40,y:40},{x:270,y:40},{x:270,y:200},{x:40,y:200}]))}
  changed(await request(h,commands,'suggest_foreground'),category==='image'?/原圖|圖片|工作圖|圖像/:/ROI|範圍|輪廓/);const refresh=await request(h,commands,'get_context');assert.ok(!refresh.error,refresh.error);await calculate(h,commands);assert.equal(p.data.chat.filter(m=>m.role==='assistant').length,0);assert.deepEqual(h.errors,[]);
 }finally{h.close()}}
});

test('changed annotation geometry and actual find-line parameters require an explicit refresh rather than silently using stale intent',async()=>{
 for(const category of ['annotation','parameters']){const h=await fixture();try{const v=h.api.inquiryView,p=h.api.project,item=v.board().items[0];let mark;
  if(category==='annotation'){v.setTool('line');pointer(h,'pointerdown',50,55);pointer(h,'pointermove',200,55);pointer(h,'pointerup',200,55);mark=v.board().items[0].annotations[0];assert.ok(mark)}else{v.setTool('find-line');pointer(h,'pointerdown',30,25);pointer(h,'pointermove',280,65);pointer(h,'pointerup',280,65);await until(h,()=>v.board().items[0].geometryTools?.[0]?.result);assert.ok(v.board().items[0].geometryTools[0].result.evidence.edgePointCount>0)}
  const commands=await begin(h);
  if(category==='annotation'){p.updateInquiryAnnotation(v.boardId,item.id,mark.id,from(h,{points:[{x:50,y:65},{x:200,y:65}]}))}else{const tool=v.board().items[0].geometryTools[0];p.updateInquiryGeometryTool(v.boardId,item.id,tool.id,from(h,{parameters:{...tool.parameters,threshold:30}}));assert.equal(v.board().items[0].geometryTools[0].result,null)}
  changed(await request(h,commands,'suggest_foreground'),category==='annotation'?/標註|標記/:/參數|幾何/);const refresh=await request(h,commands,'get_visual_context');assert.ok(!refresh.error,refresh.error);await calculate(h,commands);assert.equal(p.data.chat.filter(m=>m.role==='assistant').length,0);assert.deepEqual(h.errors,[]);
 }finally{h.close()}}
});
test('reading tool capabilities remains available during a conflict without silently accepting changed computational inputs',async()=>{
 const h=await fixture();try{const commands=await begin(h),p=h.api.project;p.setRegion(p.workflow.workpiece.id,from(h,[{x:45,y:45},{x:260,y:45},{x:260,y:190},{x:45,y:190}]));
  const capabilities=await request(h,commands,'get_inspection_capabilities');assert.ok(!capabilities.error,capabilities.error);changed(await request(h,commands,'suggest_foreground'),/ROI|範圍|輪廓/);
  const refresh=await request(h,commands,'get_context');assert.ok(!refresh.error,refresh.error);await calculate(h,commands);assert.equal(p.data.chat.filter(m=>m.role==='assistant').length,0);assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});
