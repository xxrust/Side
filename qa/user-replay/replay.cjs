// Replays the user's saved image/annotations through application event handlers.
// JSDOM events are not native browser hit-testing. Test tolerances are NOT production specifications.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {w,$,click,set,snapshot,pointer,open,errors,svg,createCanvas}=require('../dom-harness.cjs');
const trace=[],out=__dirname,record=(step,detail={})=>{trace.push({step,...detail});console.log(step,JSON.stringify(detail));};
const tool=()=>snapshot().images[0].objects.find(o=>o.type==='find_line');
const move=(dx,dy)=>{let t=tool();const start={x:t.x+10,y:t.y+5},end={x:start.x+dx,y:start.y+dy};let handle=svg.querySelector(`[data-roi-move][data-object="${t.id}"]`);assert.ok(handle,'dedicated ROI handle exists');pointer(handle,'pointerdown',start);pointer(svg,'pointermove',end);assert.match($('searchFeedback').textContent,/正在移動/);assert.equal($('candidateList').children.length,0);assert.equal($('guidanceAction').disabled,true);pointer(svg,'pointerup',end);};
(async()=>{
 const original=JSON.parse(fs.readFileSync(path.join(out,'input.agentcv.json')));await open(original);assert.equal(snapshot().images[0].sha256,original.images[0].sha256);record('開啟使用者較新專案，原圖指紋一致',{width:original.images[0].width,height:original.images[0].height});
 click('guidanceAction');assert.equal($('detectPane').hidden,false);click('guidanceAction');let t=tool();assert.equal(t.result.status,'AWAITING_SELECTION');assert.ok(t.result.candidates.length);assert.equal(t.result.selected_ids.length,0);record('原搜尋框與參數重算，得到候選而不自動採用',{roi:{x:t.x,y:t.y,width:t.width,height:t.height},candidates:t.result.candidates.map(c=>({geometry:c.geometry,coverage:c.coverage,quality:c.quality}))});
 let previous=t.result.run_id;move(8,0);t=tool();assert.notEqual(t.result.run_id,previous);assert.ok(t.result.candidates.length);record('ROI橫移8px，清除舊候選並重新計算',{status:t.result.status,count:t.result.candidates.length});
 move(0,200);t=tool();assert.equal(t.result.status,'UNKNOWN');assert.equal(svg.querySelectorAll('[data-candidate]').length,0);assert.equal(snapshot().images[0].objects.find(o=>o.id===t.drawing_source_id).visible,false);record('ROI移到工件內部，UNKNOWN且圖上不殘留舊結果',{reason:t.result.reason});
 move(0,-200);t=tool();assert.ok(t.result.candidates.length);assert.equal(t.result.selected_ids.length,0);record('ROI移回上邊，重新產生待採用候選');
 // Explicitly choose the candidate closest to the engineer's hand-drawn upper edge.
 const intent=snapshot().images[0].objects.find(o=>o.id===t.drawing_source_id),ymid=(intent.from.y+intent.to.y)/2;
 const chosen=t.result.candidates.map((c,i)=>({c,i,d:Math.abs((c.geometry.from.y+c.geometry.to.y)/2-ymid)})).sort((a,b)=>a.d-b.d)[0];
 if(chosen.i===0){$('candidateList').querySelector('.candidate-adopt').click();}else{for(let i=0;i<chosen.i;i++)click('candidateNext');$('candidateList').querySelector('.candidate-adopt').click();}
 assert.equal(tool().result.selected_ids.length,1);record('明確採用與原手繪意圖相符的上邊',{angle:chosen.c.geometry.angle_deg});
 w.document.querySelector('[data-step="measure"]').click();w.document.querySelector('[data-measure-tab="list"]').click();$('measurementList').querySelector('button.danger').click();record('驗證副本移除舊版默認的支持跨度量測，原專案保持原樣');
 record('採用後主要操作',{label:$('guidanceAction').textContent,disabled:$('guidanceAction').disabled,title:$('guidanceTitle').textContent});click('guidanceAction');record('量測頁導向',{label:$('guidanceAction').textContent,step:w.document.body.dataset.flowStep});assert.equal($('measureFlow').hidden,false);assert.equal($('measureKind').value,'');click('guidanceAction');assert.equal(snapshot().config.measurements.length,0);assert.match($('taskFeedback').textContent,/選擇/);
 set('measureKind','line_angle');set('measureName','流程驗證：上邊傾角');click('guidanceAction');assert.equal(snapshot().config.measurements.length,1);record('選擇單線傾角量測，未把支持跨度當工件邊長');
 click('guidanceAction');assert.equal($('ruleMin').value,'');assert.equal($('ruleMax').value,'');click('guidanceAction');assert.equal(snapshot().config.tolerances.length,0);record('未填工藝公差時拒絕保存，不產生默認OK');
 // Review-ready project deliberately has no invented production tolerance.
 w.AgentCVFlow.runCurrent();assert.equal(snapshot().images[0].result.status,'UNKNOWN');fs.writeFileSync(path.join(out,'measurement-ready.agentcv.json'),JSON.stringify(snapshot(),null,2));
 // Explicit test-only acceptance band, used solely to verify all three branches.
 set('ruleMin','-1');set('ruleMax','1');click('guidanceAction');click('guidanceAction');let p=snapshot();assert.equal(p.images[0].result.status,'OK');record('測試公差−1°至1°：OK（僅流程驗證，非工藝公差）',{value:p.images[0].result.measurements[0].value,unit:p.images[0].result.measurements[0].unit});
 w.document.querySelector('[data-step="classify"]').click();set('ruleMin','1');set('ruleMax','2');click('addRule');click('guidanceAction');assert.equal(snapshot().images[0].result.status,'NG');record('測試公差1°至2°：NG');
 w.document.querySelector('[data-step="annotate"]').click();w.AgentCVWorkbench.select(t.id,'candidates');move(0,200);w.AgentCVFlow.runCurrent();assert.equal(snapshot().images[0].result.status,'UNKNOWN');record('來源移開失效後再判定：UNKNOWN，不沿用OK／NG');
 move(-8,-200);$('candidateList').querySelector('.candidate-adopt').click();w.document.querySelector('[data-step="classify"]').click();set('ruleMin','-1');set('ruleMax','1');click('addRule');click('guidanceAction');p=snapshot();assert.equal(p.images[0].result.status,'OK');
 p.validation_note='Only workflow verification. The -1 to +1 degree tolerance is a test fixture, NOT the user\'s production specification.';
 fs.writeFileSync(path.join(out,'closed-loop-demo.agentcv.json'),JSON.stringify(p,null,2));
 const decoded=w.AgentCVWorkbench.pixels(),canvas=createCanvas(decoded.width,decoded.height),ctx=canvas.getContext('2d'),rgba=ctx.createImageData(decoded.width,decoded.height);
 for(let i=0;i<decoded.gray.length;i++){rgba.data[4*i]=rgba.data[4*i+1]=rgba.data[4*i+2]=decoded.gray[i];rgba.data[4*i+3]=255;}ctx.putImageData(rgba,0,0);t=tool();ctx.strokeStyle='#ffcf87';ctx.lineWidth=2;ctx.strokeRect(t.x,t.y,t.width,t.height);for(const c of t.result.candidates){ctx.strokeStyle='#40e5ff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(c.geometry.from.x,c.geometry.from.y);ctx.lineTo(c.geometry.to.x,c.geometry.to.y);ctx.stroke();}fs.writeFileSync(path.join(out,'detected-upper-edge.png'),canvas.toBuffer('image/png'));
 const earlier=JSON.parse(fs.readFileSync(path.join(out,'input-earlier.agentcv.json')));await open(earlier);assert.equal(snapshot().images[0].sha256,earlier.images[0].sha256);w.document.querySelector('[data-step="annotate"]').click();
 // Select the earlier project's upper hand-drawn line through the object list.
 w.AgentCVWorkbench.setTab('objects');for(let i=0;i<10;i++){const b=[...$('objectList').querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent.startsWith('#3 '));if(b){b.click();break;}click('objectNext');}
 click('guidanceAction');const earlierTool=tool();assert.equal(earlierTool.drawing_source_id,'object-3');record('較早專案選取上邊手繪線，正確建立對應搜尋框',{status:earlierTool.result.status,count:earlierTool.result.candidates?.length||0});fs.writeFileSync(path.join(out,'earlier-search-ready.agentcv.json'),JSON.stringify(snapshot(),null,2));
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'closed-loop-trace.json'),JSON.stringify({kind:'DOM handlers + exact original raster; not browser visual acceptance',trace},null,2));record('全部閉環斷言通過');w.close();
})().catch(e=>{fs.writeFileSync(path.join(out,'closed-loop-trace.json'),JSON.stringify({trace,error:e.message},null,2));console.error(e);w.close();process.exit(1);});
