import {createActualExternalFileTransport} from './external-files-real-transport.mjs';
import {bindCurrentAlgorithmRequest} from './current-algorithm-request.mjs';
// End-to-end DOM actions backed by imported OpenCV pixels and actual Python runs.
// Native process transport is replaced only by the real local cv-runtime subprocess.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {algorithmContext,runAlgorithm} from '../src/algorithm-workspace.js';
const require=createRequire(import.meta.url),{createHarness}=require('./workflow-ui-harness.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function actualPython(request){
 const directory=await fs.mkdtemp(path.join(root,'runtime/canvas-records-qa-')),runId=randomUUID(),requestPath=path.join(directory,'request.json');
 await fs.writeFile(requestPath,JSON.stringify({...request,runId}));
 const child=spawn(path.join(root,'runtime/python/bin/python3'),[path.join(root,'scripts/cv-runtime.py'),'--run',requestPath,directory],{cwd:directory,env:{PATH:'/usr/bin:/bin',PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
 let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});assert.equal(code,0,error);
 return JSON.parse(await fs.readFile(JSON.parse(output.trim()).resultFile,'utf8'));
}
async function setup(){
 const h=await createHarness();h.w.__native.invoke=await createActualExternalFileTransport();const {api}=h,p=api.project,a=api.agent,from=value=>h.w.JSON.parse(JSON.stringify(value));
 const bytes=await fs.readFile(path.join(root,'../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg'));
 await api.addImages([{name:'opencv-stuff.jpg',dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')}]);
 const added=p.addInquiryImage(from({id:'records-camera',kind:'original',label:p.image.name,width:p.image.width,height:p.image.height,dataURL:p.image.dataURL,source:{imageId:p.image.id,inputSha256:p.image.sha256,coordinateSpace:'original-image-pixels'}}));
 const view=api.inquiryView;await view.open({boardId:added.board.id});a.busy=true;a.turn='canvas-records-real';a.turnEpoch=p.epoch;a.turnReference={kind:'visual_inquiry',snapshot:p.captureInquirySnapshot(added.board.id)};a.expectedStamp=a.stamp();
 a.ui.runAlgorithm=(args,display)=>{assert.equal(display.stayOnBoard,true);return runAlgorithm(p,args,actualPython)};
 const run=async(args)=>{const result=await a.execute('run_algorithm',from(args));return {result,record:p.data.algorithmRuns.at(-1)}};
 function rightClick(item){if(!view.historicalSnapshot){const group=p.canvasArtifactGroups(view.boardId).find(g=>!g.expanded&&g.processItemIds.includes(item.id));if(group){p.updateCanvasArtifactGroup(view.boardId,group.id,{expanded:true});p.layoutCanvasArtifactGroups(view.boardId);view.render();item=view.board().items.find(i=>i.id===item.id);}}const rect=view.canvas.getBoundingClientRect(),event=new h.w.MouseEvent('contextmenu',{button:2,clientX:rect.left+view.pan.x+(item.x+item.width*.27)*view.zoom,clientY:rect.top+view.pan.y+(item.y+item.height*.31)*view.zoom,bubbles:true,cancelable:true});view.canvas.dispatchEvent(event);assert.ok(view.menu?.isConnected,'right-click opened actual board menu');return view.menu}
 async function clickRecord(menu,runId,artifactId){const candidates=[...menu.querySelectorAll('[data-action="algorithm-record"]')],button=candidates.find(b=>b.dataset.runId===runId&&(artifactId===undefined||b.dataset.artifactId===artifactId));assert.ok(button,`right-click record ${runId}/${artifactId}: ${menu.textContent}`);button.click();await h.tick();return h.$('algorithmRunDialog')}
 return {...h,p,a,from,added,view,run,rightClick,clickRecord};
}
function input(p,iteration,{fail=false}={}){
 const artifact='edges',code=fail?`# deliberately-failed-run-${iteration}\nraise RuntimeError('actual-canvas-record-failure-${iteration}')\n`:`# genuine-canny-run-${iteration}\nsave_image('original', image, section='tool')\nedges = cv2.Canny(image, parameters['low'], parameters['high'])\nsave_image('${artifact}', edges, section='tool')\nsave_json('stats', {'count':int(np.count_nonzero(edges))}, section='parameters')\nresult = {'iteration':${iteration},'boundaryChecks':[{'id':'pixels_available','status':'PASS' if image.size else 'FAIL','actual':int(image.size),'threshold':1}]}\n`;
 return bindCurrentAlgorithmRequest({title:`真實記錄測試 ${iteration}`,image_ids:[p.image.id],code,parameters_json:JSON.stringify({low:iteration===1?32:96,high:iteration===1?96:192}),source:algorithmContext(p).source,expected_outputs:[{id:'original',type:'image',role:'result'},{id:artifact,type:'image',role:'result'},{id:'stats',type:'evidence'}],justification:{tool:{reason:'以本次導入的真實 OpenCV 影像計算Canny梯度邊緣，保留原圖與結果以核對程式版本；僅為診斷試算，沒有工件身份或現場驗收結論。',expectedEvidence:[{kind:'artifact',type:'image',id:artifact}]},parameters:['low','high'].map(name=>({name,source:'agent-proposal',reason:`本輪明確提出${name}作對照設定，核對其保存值與實算邊緣；未將它宣稱為自動推導或最佳參數。`,verification:{kind:'artifact',type:'evidence',id:'stats'}})),boundaries:[{condition:'僅在原始像素存在時執行影像診斷；梯度圖未證明工件語意與跨圖穩定性。',check:{kind:'gate',id:'pixels_available'},onFailure:'UNKNOWN'}]}},algorithmContext(p));
}
function camera(view){return {zoom:view.zoom,pan:{...view.pan},boardId:view.boardId,historical:!!view.historicalSnapshot}}
function closeDialog(h){const dialog=h.$('algorithmRunDialog'),button=dialog.querySelector('[aria-label="關閉算法結果"]');assert.ok(button);button.click();assert.equal(dialog.open,false)}
async function externalFiles(h,dialog){const button=[...dialog.querySelectorAll('button')].find(b=>b.textContent==='執行檔案');assert.ok(button,'record exposes the external source/diagnostic file entry');const available=h.w.__native.isTauri;h.w.__native.isTauri=()=>true;try{button.click();}finally{h.w.__native.isTauri=available;}let files;for(let n=0;n<100;n++){files=h.w.document.querySelector('[aria-label="執行證據檔案"]');if(files)break;await h.tick();}assert.ok(files?.open,'real saved file chooser opens');const paths=Object.fromEntries([...files.querySelectorAll('button[title]')].map(b=>[b.textContent,b.title]));files.querySelector('[aria-label="關閉檔案入口"]').click();return paths;}
async function assertRecord(h,dialog,run,artifactId){assert.equal(dialog.open,true);assert.equal(dialog.dataset.runId,run.runId);assert.equal(dialog.dataset.status,run.status);assert.equal(dialog.querySelector('pre[aria-label="完整算法程式"]'),null,'source is opened as an external immutable file rather than a platform editor');const files=await externalFiles(h,dialog);assert.equal(await fs.readFile(files['algorithm.py'],'utf8'),run.code);if(artifactId){const artifact=run.artifacts.find(a=>a.id===artifactId);assert.equal(dialog.querySelector('.algorithm-run-viewport img')?.src,artifact.dataUrl||artifact.dataURL);assert.match(dialog.querySelector('.algorithm-run-thumbnail[aria-pressed="true"]')?.textContent||'',new RegExp(artifactId))}}


test('result-image right click is bound to its original run, artifact and code; historical replay and original-image related runs retain failure records',async()=>{
 const h=await setup();try{
  assert.equal(h.$('openAlgorithmRuns'),null,'standalone program-history entry is removed');
  const first=await h.run(input(h.p,1)),second=await h.run(input(h.p,2)),failed=await h.run(input(h.p,3,{fail:true}));
  assert.equal(first.record.status,'SUCCEEDED');assert.equal(second.record.status,'SUCCEEDED');assert.equal(failed.record.status,'FAILED');assert.match(failed.record.traceback,/actual-canvas-record-failure-3/);assert.notEqual(first.record.code,second.record.code);assert.notDeepEqual(first.record.parameters,second.record.parameters);assert.equal(failed.record.artifacts.length,0);
  if(process.env.AGENTCV_RECORD_REVIEW_DIR)await fs.writeFile(path.join(process.env.AGENTCV_RECORD_REVIEW_DIR,'actual-python-workspace.agentcv.json'),h.p.serialize());
  const board=()=>h.p.ensureInquiry().boards.find(b=>b.id===h.added.board.id),firstItem=board().items.find(i=>{const a=h.view.asset(i);return a.source.runId===first.record.runId&&a.source.artifactId==='edges'});assert.ok(firstItem,'first run edges really published on canvas');
  const page=h.api.page;h.view.zoom=.63;h.view.pan={x:44,y:78};h.view.paint();const before=camera(h.view),menu=h.rightClick(firstItem);assert.match(menu.textContent,/算法程式與紀錄/);
  const dialog=await h.clickRecord(menu,first.record.runId,'edges');await assertRecord(h,dialog,first.record,'edges');assert.notEqual(dialog.dataset.runId,failed.record.runId,'never opens latest run by default');assert.equal(h.api.page,page);closeDialog(h);assert.deepEqual(camera(h.view),before);assert.equal(h.view.opened,true);
  const frozen=h.p.captureInquirySnapshot(h.added.board.id);await h.view.openSnapshot(frozen);h.view.zoom=.58;h.view.pan={x:31,y:67};h.view.paint();const historical=camera(h.view),historicalItem=h.view.board().items.find(i=>i.id===firstItem.id);
  assert.ok(historicalItem);await assertRecord(h,await h.clickRecord(h.rightClick(historicalItem),first.record.runId,'edges'),first.record,'edges');closeDialog(h);assert.deepEqual(camera(h.view),historical);assert.equal(h.api.page,page);
  await h.view.open({boardId:h.added.board.id});const original=board().items.find(i=>i.id===h.added.item.id),originalMenu=h.rightClick(original),group=[...originalMenu.querySelectorAll('button')].find(b=>/相關算法程式與紀錄/.test(b.textContent));assert.ok(group,'original image offers related-run group');assert.match(group.textContent,/3/);group.click();await h.tick();
  const list=h.view.menu||originalMenu,entries=[...list.querySelectorAll('[data-action="algorithm-record"]')];for(const run of [first.record,second.record,failed.record])assert.ok(entries.some(b=>b.dataset.runId===run.runId),`original lists real run ${run.runId}`);
  const failureDialog=await h.clickRecord(list,failed.record.runId);await assertRecord(h,failureDialog,failed.record);assert.match(failureDialog.textContent,/執行失敗|沒有圖像/);const diagnosticFiles=await externalFiles(h,failureDialog);assert.match(await fs.readFile(diagnosticFiles['execution.log.json'],'utf8'),/actual-canvas-record-failure-3/);closeDialog(h);assert.equal(h.api.page,page);assert.equal(h.view.boardId,h.added.board.id);assert.equal(h.view.opened,true);
 }finally{h.close()}
});
