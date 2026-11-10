// Actual app, saved real-Pi board and real pointer clicks. No model or CV output is fabricated.
import fs from 'node:fs';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/liangshiben/13-cv',out=root+'/reviews/2026-10-27-relation-details';
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'}),report={status:'NOT_RUN',views:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:920}});await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>!!window.AgentCVDesktop);
 await page.evaluate(async serialized=>{await AgentCVDesktop.loadProject(serialized);await AgentCVDesktop.go(6)},fs.readFileSync(root+'/reviews/2026-10-27-change-impact/live-workspace.agentcv.json','utf8'));
 await page.waitForFunction(()=>AgentCVDesktop.inquiryView.opened&&AgentCVDesktop.inquiryView.board()?.items.length===2);
 const text='不同來源的比較參考，不共用量測座標。\n此連線僅表達兩張圖的討論關係，不代表已完成配準或尺寸量測。\n若要比較實際尺寸，需先確認各自的成像配置、有效標定及要比較的幾何對象；畫板上顯示的大小可自由縮放，不能直接當成物件的實際尺寸。';
 await page.evaluate(text=>{const v=AgentCVDesktop.inquiryView,p=AgentCVDesktop.project,r=p.data.canvasRelations[0];p.mutate('relation_description_updated',()=>{r.label=text});const t=v.currentLocalThread();if(t)t.collapsed=true;v.fit();},text);
 for(const zoom of [.45,1,2]){
  const click=await page.evaluate(zoom=>{const v=AgentCVDesktop.inquiryView;v.zoom=zoom;v.expandedRelationId=null;v.render();const r=v.relationRecords()[0],a=v.board().items.find(i=>i.id===r.fromItemId),b=v.board().items.find(i=>i.id===r.toItemId);v.pan={x:480-(a.x+a.width+b.x)/2*zoom,y:200-(a.y+a.height/2+b.y+b.height/2)/2*zoom};v.paint();const rect=v.canvas.getBoundingClientRect();return {x:rect.left+480,y:rect.top+222,revision:v.board().revision,events:AgentCVDesktop.project.data.events.length}},zoom);
  await page.mouse.click(click.x,click.y);const panel=page.getByRole('region',{name:'完整關係說明'});await panel.waitFor();
  const state=await page.evaluate(()=>{const v=AgentCVDesktop.inquiryView,p=v.relationDetails.getBoundingClientRect(),a=v.area.getBoundingClientRect();return {text:v.relationDetails.querySelector('.inquiry-relation-full-text').textContent,within:p.left>=a.left&&p.right<=a.right&&p.top>=a.top&&p.bottom<=a.bottom,revision:v.board().revision,events:AgentCVDesktop.project.data.events.length}});
  if(state.text!==text||!state.within||state.events!==click.events||state.revision!==click.revision)throw Error('Expanded relation text/layout/source invariance failed at zoom '+zoom);
  report.views.push({zoom,...state});if(zoom===1)await page.screenshot({path:out+'/expanded-relation.png'});
  await panel.getByLabel('收合關係說明',{exact:true}).click();if(await panel.count())throw Error('Close did not collapse details');
 }
 report.status='PASS';
}catch(e){report.status='FAILED';report.error=e.message;process.exitCode=1;}finally{await browser.close();fs.writeFileSync(out+'/browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error}));}
