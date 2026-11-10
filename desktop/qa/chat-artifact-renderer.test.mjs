import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import {ChatArtifactView,buildArtifactDocument,ARTIFACT_CSP} from '../src/chat-artifact-renderer.js';
import {renderChatMarkdown} from '../src/chat-markdown.js';
const require=createRequire(import.meta.url),{JSDOM}=require('../../qa/node_modules/jsdom');
function harness(){const dom=new JSDOM('<!doctype html><body></body>',{url:'https://agentcv.test/'}),doc=dom.window.document;dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'))};const saved=[],view=new ChatArtifactView({document:doc,onSave:async value=>saved.push(value)});view.syncEpoch(1);return {dom,doc,view,saved,render:source=>{const root=renderChatMarkdown(source,{document:doc,renderVisual:metadata=>view.card(metadata,{epoch:1,sourceChatIndex:3})});doc.body.append(root);return root},close:()=>{view.close();dom.window.close()}}}

test('complete fenced and standalone HTML/SVG create compact cards; partial streams and other code remain source',()=>{
 const h=harness();try{
  const root=h.render('# 圖解\n\n```html\n<div><button>說明</button></div>\n```\n\n<svg viewBox="0 0 20 20"><circle r="5" /></svg>\n\n後續說明。\n\n```python\nprint(1)\n```');
  assert.equal(root.querySelectorAll('.chat-artifact-card').length,2);assert.equal(root.querySelectorAll('iframe,svg,script').length,0);assert.match(root.textContent,/後續說明/);assert.equal(root.querySelector('pre code').dataset.language,'python');
  for(const source of ['```html\n<div>未完成','<svg viewBox="0 0 10 10"><circle r="2" />','<div>尚未結束']){assert.equal(h.render(source).querySelectorAll('.chat-artifact-card').length,0);}
  assert.equal(h.render('<!doctype html>\n<html><body><canvas></canvas></body></html>').querySelectorAll('.chat-artifact-card').length,1);
  assert.equal(h.render('<div><div>巢狀</div></div>').querySelectorAll('.chat-artifact-card').length,1);
 }finally{h.close()}
});

test('preview uses an opaque script sandbox, source stays selectable, saving preserves exact markup and provenance',async()=>{
 const h=harness();try{const markup='<svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" /></svg>',root=h.render('```svg\n'+markup+'\n```');root.querySelector('button').click();await h.view.previewReady;let dialog=h.doc.querySelector('dialog[open]'),frame=dialog.querySelector('iframe');
  assert.equal(frame.getAttribute('sandbox'),'allow-scripts');assert.equal(frame.getAttribute('referrerpolicy'),'no-referrer');assert.equal(frame.getAttribute('csp'),null,'document response owns CSP; no unsupported embedded-CSP handshake');assert.match(frame.src,/^data:text\/html/);assert.equal(h.doc.querySelector('svg'),null);assert.equal(frame.hasAttribute('srcdoc'),false);
  [...dialog.querySelectorAll('nav button')].find(b=>b.textContent==='原始碼').click();assert.equal(dialog.querySelector('pre').textContent,markup);assert.equal(frame.hidden,true);
  [...dialog.querySelectorAll('footer button')].find(b=>b.textContent==='加入收藏').click();await new Promise(r=>setTimeout(r,0));assert.equal(h.saved[0].source,markup);assert.equal(h.saved[0].mime,'image/svg+xml');assert.equal(h.saved[0].origin.sourceChatIndex,3);
  h.view.syncEpoch(2);assert.equal(h.doc.querySelector('dialog'),null);root.querySelector('button').click();assert.equal(h.doc.querySelector('dialog'),null,'stale project cards cannot open after epoch changes');
 }finally{h.close()}
});

test('document builder strips external active resources, redirects, nested browsing contexts and host markup injection',()=>{
 const h=harness();try{const source='<html><head><base href="https://evil.test"><meta http-equiv="refresh" content="0;url=https://evil.test"><link rel="stylesheet" href="https://evil.test/x"></head><body><img src="https://evil.test/i" srcset="https://evil.test/j 2x"><svg><use href="https://evil.test/x#y"/><use href="#local"/></svg><a href="https://evil.test/" target="_blank" ping="https://evil.test/p">remote</a><iframe srcdoc="attack"></iframe><script src="https://evil.test/code"></script><script>window.localOnly=1</script></body></html>';
  const html=buildArtifactDocument(source,{document:h.doc,title:'</title><script>hostAttack()</script>'}),isolated=new JSDOM(html),doc=isolated.window.document;
  try{assert.equal(doc.querySelectorAll('base,link,iframe,form').length,0);assert.equal(doc.querySelector('meta[http-equiv="refresh"]'),null);assert.equal(doc.querySelector('img').hasAttribute('src'),false);assert.equal(doc.querySelector('img').hasAttribute('srcset'),false);assert.equal(doc.querySelectorAll('script[src],a[href],a[target],a[ping]').length,0);assert.equal(doc.querySelectorAll('use[href="#local"]').length,1);assert.equal(doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content,ARTIFACT_CSP);assert.match(doc.body.textContent,/window.localOnly/);assert.equal(doc.title,'</title><script>hostAttack()</script>');}finally{isolated.window.close()}
 }finally{h.close()}
});

const chrome='/Users/liangshiben/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
test('real browser runs isolated response interactivity under strict host CSP while blocking host access and external requests',{skip:!fs.existsSync(chrome)},async()=>{
 const {chromium}=await import('/Users/liangshiben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');const browser=await chromium.launch({headless:true,executablePath:chrome}),h=harness();let html='';
 const server=http.createServer((request,response)=>{response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':ARTIFACT_CSP,'Cache-Control':'no-store'});response.end(html)});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{const page=await browser.newPage(),requests=[];await page.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();requests.push(route.request().url());return route.abort()});await page.setContent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; frame-src '+origin+'; style-src \'unsafe-inline\'"><div id="host">HOST</div>');
  await page.evaluate(()=>{window.__TAURI_INTERNALS__={invoke:()=>{window.hostBridgeTouched=true}};window.hostBridgeTouched=false});
  html=buildArtifactDocument('<button id="navigate" onclick="location.href=\'https://evil.test/navigate\'">navigate</button><button id="interactive" onclick="this.textContent=\'clicked\'">ready</button><svg id="drawing" viewBox="0 0 20 20"></svg><script>document.body.dataset.bridge=String(typeof window.__TAURI_INTERNALS__);try{parent.__TAURI_INTERNALS__.invoke()}catch(e){document.body.dataset.bridgeDenied="yes"}try{parent.document.getElementById("host").textContent="PWNED"}catch(e){document.body.dataset.denied="yes"}var circle=document.createElementNS("http://www.w3.org/2000/svg","circle");circle.setAttribute("r",5);document.getElementById("drawing").append(circle);fetch("https://evil.test/fetch").catch(()=>{});var img=new Image();img.src="https://evil.test/image";document.body.append(img);</script>',{document:h.doc});
  await page.evaluate(src=>{const f=document.createElement('iframe');f.setAttribute('sandbox','allow-scripts');f.src=src;document.body.append(f)},origin+'/preview');
  const frame=await (async()=>{for(let n=0;n<50;n++){const f=page.frames()[1];if(f&&await f.locator('#interactive').count())return f;await page.waitForTimeout(50)}throw Error('sandbox did not load')})();
  await frame.locator('#interactive').click();assert.equal(await frame.locator('#interactive').textContent(),'clicked');assert.equal(await frame.locator('#drawing circle').count(),1,'inline script actually rendered SVG');assert.equal(await frame.locator('body').getAttribute('data-denied'),'yes');assert.equal(await page.locator('#host').textContent(),'HOST');
  assert.equal(await frame.locator('body').getAttribute('data-bridge'),'undefined');assert.equal(await frame.locator('body').getAttribute('data-bridge-denied'),'yes');assert.equal(await page.evaluate(()=>window.hostBridgeTouched),false);
  await frame.locator('#navigate').click();await page.waitForTimeout(250);assert.deepEqual(requests,[],'script-triggered iframe self-navigation, fetch and image must never reach external network transport');assert.equal(await page.locator('#host').textContent(),'HOST');assert.equal(await page.evaluate(()=>window.hostBridgeTouched),false);
 }finally{h.close();await browser.close();await new Promise(resolve=>server.close(resolve))}
});
