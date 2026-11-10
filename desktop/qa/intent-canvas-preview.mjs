import fs from 'node:fs';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='/Users/liangshiben/13-cv/reviews/2026-10-27-canvas-entry';
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
try{
 const p=await browser.newPage({viewport:{width:1440,height:920}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:1420');await p.waitForFunction(()=>!!window.AgentCVDesktop);
 const dataURL='data:image/png;base64,'+fs.readFileSync('/Users/liangshiben/13-cv/prd/2026-10-26-concept-agreement/assets/crystal-camera.png').toString('base64');
 await p.evaluate(async dataURL=>{await AgentCVDesktop.addImages([{name:'晶振原圖.png',dataUrl:dataURL}]);await AgentCVDesktop.go(6)},dataURL);
 await p.waitForFunction(()=>AgentCVDesktop.inquiryView.board()?.items.length===1);await p.waitForTimeout(400);
 await p.screenshot({path:out+'/canvas-entry.png'});
 const screen=await p.locator('body').innerText();if(screen.includes('請明確選擇齒輪'))throw Error('Restrictive category UI remains');
 const details=await p.evaluate(()=>{const v=AgentCVDesktop.inquiryView;const item=v.board().items[0];const a=AgentCVDesktop.project.addInquiryAnnotation(v.boardId,item.id,{type:'line',points:[{x:180,y:150},{x:1100,y:150}],text:'參照邊',color:'#ffd88d',strokeWidth:3});const b=AgentCVDesktop.project.addInquiryAnnotation(v.boardId,item.id,{type:'line',points:[{x:180,y:190},{x:1100,y:190}],text:'待比較邊',color:'#9af0bf',strokeWidth:3});v.annotationSelections=new Set([JSON.stringify([item.id,a.id]),JSON.stringify([item.id,b.id])]);v.selected=new Set([item.id]);v.render();return {boardId:v.boardId}});
 await p.locator('[data-intent-action="distance"]').click();await p.locator('[data-intent-action="ask"]').click();await p.getByLabel('畫板問題',{exact:true}).fill('請比較這兩個標記的位置，先說明需要哪些定位證據。');
 await p.screenshot({path:out+'/canvas-question.png'});
 await p.locator('[data-intent-action="send"]').click();await p.waitForTimeout(200);
 const draft=await p.evaluate(()=>({thread:AgentCVDesktop.inquiryView.currentLocalThread(),relations:AgentCVDesktop.project.data.canvasRelations,chat:AgentCVDesktop.project.data.chat}));
 if(draft.relations[0]?.result.value!==40)throw Error('Source pixel distance mismatch');
 if(draft.chat.some(x=>x.role==='assistant'))throw Error('Disconnected test invented an assistant reply');
 if(!draft.thread.question)throw Error('Question lost');
 await p.locator('#settingsDialog [data-close="settingsDialog"]').click().catch(()=>{});
 const clipping=await p.evaluate(()=>{const canvas=document.querySelector('#visualInquiryCanvas').getBoundingClientRect();return {width:canvas.width,height:canvas.height,bodyOverflow:document.body.scrollWidth>innerWidth,toolBottom:[...document.querySelectorAll('.inquiry-tools button')].at(-1).getBoundingClientRect().bottom,canvasBottom:canvas.bottom}});
 fs.writeFileSync(out+'/browser-verification.json',JSON.stringify({errors,clipping,relationValue:draft.relations[0].result.value,threadStatus:draft.thread.status,scope:'Real browser UI, true annotation coordinates; no model request or formal CV accuracy acceptance'},null,2));
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({errors,clipping,relationValue:40,board:details.boardId}));
}finally{await browser.close()}
