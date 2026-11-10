import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/liangshiben/13-cv/prd/2026-10-26-concept-agreement';
fs.mkdirSync(root+'/output/pdf',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
try {
 const page=await browser.newPage({viewport:{width:1000,height:1200}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+root+'/print.html');await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
 const layout=await page.evaluate(()=>[...document.querySelectorAll('.page')].map((p,i)=>{const foot=p.querySelector('footer').getBoundingClientRect();const children=[...p.children].filter(c=>c.tagName!=='FOOTER');return {page:i+1,bottom:Math.max(...children.map(c=>c.getBoundingClientRect().bottom))-p.getBoundingClientRect().top,footer:foot.top-p.getBoundingClientRect().top,overflow:Math.max(...children.map(c=>c.getBoundingClientRect().bottom))>foot.top-6}}));
 const images=await page.locator('image').evaluateAll(es=>es.map(e=>({src:e.getAttribute('href')})));
 const result={pages:layout.length,errors,layout,images:images.length,scope:'Document rendering only; no CV execution.'};
 fs.writeFileSync(root+'/qa/layout.json',JSON.stringify(result,null,2));
 if(layout.some(x=>x.overflow))throw Error('Page content collides with footer: '+JSON.stringify(layout.filter(x=>x.overflow)));
 await page.emulateMedia({media:'print'});
 await page.pdf({path:root+'/output/pdf/AgentCV-PRD-v0.1-review.pdf',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,tagged:true,outline:true});
 console.log(JSON.stringify({pages:layout.length,errors,pdf:root+'/output/pdf/AgentCV-PRD-v0.1-review.pdf'}));
}finally{await browser.close()}
