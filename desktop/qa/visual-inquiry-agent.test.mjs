import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Agent} from '../src/agent.js';
import {inquiryMethods,prepareInquiry} from '../src/visual-inquiry-model.js';
import {agentTools,systemPrompt} from '../src/agent-contract.js';
import fs from 'node:fs';

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const image={type:'image',data:png,mimeType:'image/png'};
function harness(){
 const p={epoch:1,data:{activeId:'one',events:[],chat:[]},workflow:{revision:1},image:{id:'one',sha256:'sha-one'},context(){return {image:{id:this.image.id}}},mutate(action,fn,detail){fn();this.data.events.push({action,detail})}};Object.assign(p,inquiryMethods);prepareInquiry(p.data);
 const ui={page:()=>6,selection:()=>null,reference:()=>null,locked:()=>false,activity(){},update(){}};
 const a=new Agent(p,ui),commands=[];a.connected=true;a.model='vision';a.provider='qa';a.models=[{id:'vision',provider:'qa',input:['text','image']},{id:'text',provider:'qa',input:['text']}];a.wire=async command=>commands.push(command);
 return {a,p,ui,commands};
}
function ref(label='first'){return {label,kind:'stage',width:1,height:1,dataURL:'data:image/png;base64,'+png,source:{imageId:'one',inputSha256:'sha-one',runId:'historic-run',historical:true}}}

test('explicit visual question sends multiple image parts and freezes per-message board/attachment history without base64',async()=>{
 const {a,p,ui,commands}=harness(),added=p.addInquiryImage(ref()),boardId=added.board.id,itemId=added.item.id;
 p.addInquiryAnnotation(boardId,itemId,{type:'text',points:[{x:0,y:0}],text:'原註解'});
 const snapshot=p.captureInquirySnapshot(boardId),reference={kind:'visual_inquiry',boardId,snapshot};ui.reference=()=>reference;ui.visualContext=()=>({...p.inquiryContext(),catalog:[{id:'step4',source:ref().source}]});
 ui.visualImages=async()=>({images:[image,{dataURL:ref().dataURL}],attachments:[{assetId:added.asset.id,label:'first',source:ref().source}],snapshot});
 await a.send('兩張圖的差異是什麼？',null,await ui.visualImages());const prompt=commands[0],message=p.data.chat[0];assert.equal(prompt.type,'prompt');assert.deepEqual(prompt.images,[image,image]);assert.equal(message.visualSnapshot.revision,snapshot.revision);assert.equal(message.attachments[0].assetId,added.asset.id);assert.ok(!JSON.stringify(message).includes(png));assert.ok(!prompt.message.includes(png));assert.equal(JSON.parse(prompt.message.split('目前專案狀態（原圖座標）：')[1].split('\n最近對話')[0]).visual.read,'get_visual_context');
 p.addInquiryAnnotation(boardId,itemId,{type:'text',points:[{x:1,y:1}],text:'後加的內容'});reference.snapshot={revision:999};assert.equal(message.visualSnapshot.items[0].annotations.length,1);assert.equal(message.reference.snapshot.revision,snapshot.revision);assert.equal(a.context().reference.snapshot.revision,snapshot.revision);
 await a.event({type:'turn_end',turn:a.turn});await a.send('延續上一張');assert.equal(p.data.chat[0].visualSnapshot.items[0].annotations.length,1);assert.ok(!commands.at(-1).message.includes(png));assert.deepEqual(commands.at(-1).images,[],'board continuation never attaches history pixels automatically');
});

test('non-vision/unknown capability and invalid explicit pixels reject before chat/state/wire, leaving a visual draft usable',async()=>{
 const {a,p,ui,commands}=harness(),draft={kind:'visual_inquiry',snapshot:{revision:2}};ui.reference=()=>draft;
 for(const model of ['text','unknown']){a.model=model;await assert.rejects(a.send('看圖',null,{images:[image],snapshot:draft.snapshot}),/圖像/);assert.equal(p.data.chat.length,0);assert.equal(a.busy,false);assert.equal(a.preparing,false);assert.equal(commands.length,0);assert.equal(ui.reference(),draft)}
 a.model='vision';await assert.rejects(a.send('看圖',null,{images:[{...image,mimeType:'image/jpeg'}]}),/格式不符/);assert.equal(commands.length,0);await a.send('看圖',null,{images:[image],snapshot:draft.snapshot});assert.equal(commands.length,1);
});

test('real-image/show tools keep fixed source references; actor spoofing cannot edit human annotations or CV ROI',async()=>{
 const {a,p,ui}=harness(),added=p.addInquiryImage(ref()),originalROI=[{x:5,y:5}];p.data.cvROI=structuredClone(originalROI);const human=p.addInquiryAnnotation(added.board.id,added.item.id,{type:'text',points:[{x:0,y:0}],text:'工程師原文'}),calls=[];
 ui.visualAction=async(name,args)=>{calls.push({name,args});if(name==='get_visual_image')return {_visualImages:[image],source:ref().source};if(name==='show_visual_image')return {attachments:[{assetId:added.asset.id,label:'歷史齒輪圖',source:ref().source}],snapshot:p.captureInquirySnapshot(added.board.id)};if(name==='annotate_visual_board')return p.addInquiryAnnotation(args.board_id,args.item_id,{type:args.type,points:args.points,text:args.text},{actor:args.actor});};
 const pixels=await a.execute('get_visual_image',{asset_id:added.asset.id});assert.deepEqual(pixels._visualImages,[image]);assert.equal(pixels.source.historical,true);
 await a.execute('show_visual_image',{asset_id:added.asset.id,caption:'這是當次歷史圖'});const displayed=p.data.chat.at(-1);assert.equal(displayed.role,'assistant');assert.equal(displayed.attachments[0].source.runId,'historic-run');assert.equal(displayed.visualSnapshot.items[0].annotations[0].text,'工程師原文');
 await a.execute('annotate_visual_board',{actor:'human',board_id:added.board.id,item_id:added.item.id,type:'text',points:[{x:1,y:1}],text:'Agent 補充'});assert.equal(calls.at(-1).args.actor,'agent');const item=p.inquiryContext().board.items[0];assert.equal(item.annotations[1].author,'agent');assert.throws(()=>p.updateInquiryAnnotation(added.board.id,added.item.id,human.id,{text:'覆寫'},{actor:'agent'}),/不可修改/);assert.deepEqual(p.data.cvROI,originalROI);assert.equal(displayed.visualSnapshot.items[0].annotations.length,1);assert.ok(!JSON.stringify(displayed).includes(png));
 a.model='text';await assert.rejects(a.execute('get_visual_image',{asset_id:added.asset.id}),/只支援文字/);
});

test('stopped/changed projects and stale shared board block delayed tool results and refresh context explicitly',async()=>{
 const {a,p,ui,commands}=harness();let resolve;ui.visualContext=()=>({board:{id:'board',revision:p.data.events.length}});ui.visualAction=async(name,args,guard)=>{if(name==='get_visual_context')return ui.visualContext();await new Promise(r=>resolve=r);assert.equal(guard.isCurrent(),false);return {attachments:[{assetId:'old'}]}};
 a.turn='turn';a.turnEpoch=p.epoch;a.expectedStamp=a.stamp();const old=a.event({type:'tool_request',turn:'turn',id:'show',name:'show_visual_image',args:{asset_id:'old'}});await Promise.resolve();a.stop();resolve();await old;assert.equal(p.data.chat.length,0);assert.match(commands.at(-1).result.error,/停止|變更/);
 a.turn='new-turn';a.turnEpoch=p.epoch;a.expectedStamp=a.stamp();p.data.events.push({action:'human-mask'});p.workflow.workpiece={description:'人工修改了工件定義'};await a.event({type:'tool_request',turn:'new-turn',id:'stale',name:'annotate_visual_board',args:{}});assert.match(commands.at(-1).result.error,/新狀態/);await a.event({type:'tool_request',turn:'new-turn',id:'refresh',name:'get_context',args:{}});assert.equal(commands.at(-1).result.visual.board.revision,1);assert.deepEqual(a.expectedStamp,a.stamp());
 const pending=a.event({type:'tool_request',turn:'new-turn',id:'late-project',name:'show_visual_image',args:{asset_id:'old'}});await Promise.resolve();p.epoch++;resolve();await pending;assert.match(commands.at(-1).result.error,/變更/);assert.ok(!p.data.chat.some(m=>m.attachments));
});

test('cancel while assembling image parts preserves the draft and never starts a turn',async()=>{
 const {a,p,ui,commands}=harness();a.runtime={activeAdapter:{id:'codex'}};ui.reference=()=>({kind:'visual_inquiry',snapshot:{revision:1}});const pending=a.send('明確附圖',null,{images:[image]});await Promise.resolve();a.stop();await assert.rejects(pending,/取消|變更/);assert.equal(commands.length,0);assert.equal(p.data.chat.length,0);assert.equal(a.busy,false);
});

test('visual contract is generated identically for Pi and keeps image-first/source/ownership rules',()=>{
 assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../scripts/agent-contract.json',import.meta.url))),{tools:agentTools,systemPrompt});const tools=agentTools.map(t=>t.function.name);for(const name of ['get_visual_context','get_visual_image','show_visual_image','add_visual_image','annotate_visual_board'])assert.ok(tools.includes(name));assert.ok(systemPrompt.length<500);const skill=fs.readFileSync(new URL('../agent-packages/agentcv-cv/skills/cv/SKILL.md',import.meta.url),'utf8'),canvas=fs.readFileSync(new URL('../agent-packages/agentcv-cv/skills/cv/references/canvas.md',import.meta.url),'utf8');assert.match(skill,/圖 > 數字 > 文字/);assert.match(skill,/實際像素/);assert.match(canvas,/歷史/);
});

test('dense frozen geometry stays complete in saved chat while context, current prompt, history and image-tool metadata remain bounded',async()=>{
 const {a,p,ui,commands}=harness(),points=Array.from({length:4096},(_,i)=>({x:i/4096,y:(i%23)/23}));
 const snapshot={schema:'agentcv-visual-inquiry-snapshot-1',id:'dense-board',revision:7,items:[{id:'dense-item',type:'image',assetId:'dense-asset',x:0,y:0,width:1,height:1,asset:{id:'dense-asset',width:1,height:1,source:{runId:'original-run'}},annotations:Array.from({length:32},(_,i)=>({id:'a'+i,type:'pen',points,text:'筆跡 '+i,author:'human'}))}]};
 ui.reference=()=>({kind:'visual_inquiry',boardId:snapshot.id,snapshot});ui.visualContext=()=>({board:snapshot});for(let i=0;i<9;i++)p.data.chat.push({role:i%2?'assistant':'user',text:'歷史問詢 '+i,canvasThreadId:a.mainThreadId,visualSnapshot:snapshot});
 await a.send('請看標註',null,{images:[image],snapshot});const wire=commands.at(-1),saved=p.data.chat.at(-1);assert.equal(saved.visualSnapshot.items[0].annotations.length,32);assert.equal(saved.visualSnapshot.items[0].annotations[0].points.length,4096);assert.equal(saved.reference.snapshot.items[0].annotations[0].points.length,4096);assert.ok(wire.message.length<150000,'prompt bytes '+wire.message.length);assert.ok(JSON.stringify(snapshot).length>2000000);
 const context=JSON.parse(wire.message.split('目前專案狀態（原圖座標）：')[1].split('\n最近對話：')[0]),history=JSON.parse(wire.message.split('\n最近對話：')[1].split('\n本次視覺問詢固定快照：')[0]),summary=JSON.parse(wire.message.split('\n本次視覺問詢固定快照：')[1]);
 assert.equal(context.reference,undefined);assert.equal(context.visual.board.items,undefined);assert.equal(context.visual.read,'get_visual_context');assert.equal(summary.items[0].annotations[0].pointCount,4096);assert.equal(summary.items[0].annotationCount,32);assert.equal(summary.items[0].annotationsTruncated,true);assert.equal(summary.geometrySummary,true);assert.ok(history.length>0);assert.ok(history.every(m=>m.visualSnapshot.itemCount===1&&!m.visualSnapshot.items));assert.match(summary.geometry,/未提供完整向量分頁/);
 ui.visualAction=async name=>name==='get_visual_image'?{snapshot,_visualImages:[image]}:{snapshot,attachments:[{assetId:'dense-asset'}]};const tool=await a.execute('get_visual_image',{asset_id:'dense-asset'});assert.equal(tool.snapshot.items[0].annotations[0].points.length,16);const show=await a.execute('show_visual_image',{asset_id:'dense-asset'});assert.equal(show.snapshot.items[0].annotations[0].points.length,16);assert.equal(p.data.chat.at(-1).visualSnapshot.items[0].annotations[0].points.length,4096);
});
