import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {renderChatMarkdown,safeMarkdownUrl} from '../src/chat-markdown.js';
const require=createRequire(import.meta.url),{JSDOM}=require('../../qa/node_modules/jsdom');

const fixture=source=>{const dom=new JSDOM('<!doctype html><body></body>'),node=renderChatMarkdown(source,{document:dom.window.document});dom.window.document.body.append(node);return {dom,node,close:()=>dom.window.close()}};

test('Pi Markdown displays headings, emphasis, lists, table, quote and code as semantic selectable content',()=>{
  const f=fixture('# 齒輪核對\n\n得到 **15 個齒峰**，`window = 7`。\n\n1. 查看原圖\n2. 核對結果\n   - 選中的齒\n   - *局部曲線*\n\n| 參數 | 實算值 |\n| :--- | ---: |\n| 平滑窗口 | 7 |\n| 齒數 | **15** |\n\n> 尚未提供公差。\n\n```python\nvalue = 7\nprint(value)\n```');
  try{const n=f.node;assert.equal(n.querySelector('h1').textContent,'齒輪核對');assert.equal(n.querySelector('strong').textContent,'15 個齒峰');assert.equal(n.querySelector('ol').children.length,2);assert.equal(n.querySelectorAll('ol ul>li').length,2);assert.equal(n.querySelector('em').textContent,'局部曲線');assert.equal(n.querySelectorAll('table tbody tr').length,2);assert.equal(n.querySelector('th:last-child').style.textAlign,'right');assert.equal(n.querySelector('blockquote p').textContent,'尚未提供公差。');assert.equal(n.querySelector('pre code').textContent,'value = 7\nprint(value)');assert.equal(n.querySelector('pre code').dataset.language,'python');assert.ok(n.classList.contains('markdown-body'));assert.equal(n.querySelector('input'),null)}finally{f.close()}
});

test('raw HTML and model-supplied URLs never create executable elements or fetch images',()=>{
  const f=fixture('<script>globalThis.pwned=1</script>\n<img src=x onerror=alert(1)>\n<svg onload=alert(1)>\n\n[unsafe](javascript:alert(1)) [data](data:text/html,pwned) [file](file:///etc/passwd) ![remote](https://example.com/tracker.png)\n\n```html\n<img onerror=alert(1)>\n```');
  try{assert.equal(f.node.querySelectorAll('script,img,svg,iframe,object,embed,input,style').length,0);assert.equal(f.node.querySelectorAll('a').length,0);assert.match(f.node.textContent,/<script>/);assert.match(f.node.textContent,/javascript:alert\(1\)/);assert.match(f.node.textContent,/\[圖片：remote\]/);assert.equal(f.dom.window.pwned,undefined);assert.equal(f.node.querySelector('pre code').textContent,'<img onerror=alert(1)>')}finally{f.close()}
});

test('HTTP links use one explicit external opener while preserving readable labels and safe URL parsing',()=>{
  const dom=new JSDOM('<!doctype html>'),opened=[],node=renderChatMarkdown('[OpenCV **官方**](https://docs.opencv.org/a(b) "工具說明")\n\n<https://example.com/reference>',{document:dom.window.document,openLink:url=>opened.push(url)});
  try{const a=node.querySelector('a');assert.equal(a.textContent,'OpenCV 官方');assert.equal(a.title,'工具說明');assert.equal(a.href,'https://docs.opencv.org/a(b)');assert.equal(a.target,'_blank');assert.equal(a.rel,'noopener noreferrer');const event=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true});a.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.deepEqual(opened,['https://docs.opencv.org/a(b)']);assert.equal(node.querySelectorAll('a').length,2);
    for(const url of ['javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html,<script>x</script>','file:///tmp/a','vbscript:msgbox(1)','https://exa\nmple.com','https://example.com/a b','https://user:pass@example.com/','https://example.com\\evil','&#106;avascript:alert(1)'])assert.equal(safeMarkdownUrl(url),null,url);
    assert.equal(safeMarkdownUrl('HTTPS://example.com'),'https://example.com/');
    const native=renderChatMarkdown('[TLS](https://example.com/) [legacy](http://example.com/)',{document:dom.window.document,allowHttp:false});assert.equal(native.querySelectorAll('a').length,1);assert.equal(native.querySelector('a').textContent,'TLS');assert.match(native.textContent,/legacy \(http:\/\/example.com\/\)/);
  }finally{dom.window.close()}
});

test('incomplete streaming text, literal escapes and fenced HTML remain readable without throwing',()=>{
  for(const text of ['**尚未完成','[說明](https://example.com','```js\nconst x = "<script>";','> **提示**\n> 仍在試算','- [x] 已核對\n- [ ] 待確認','字元 \\* 不是強調；a_b_c 保留','| 名稱 | 值 |\n| --- | --- |\n| `a|b` | x\\|y |']){
    const f=fixture(text);try{assert.equal(f.node.querySelector('script'),null);assert.ok(f.node.textContent.length>0);if(text.includes('a_b_c'))assert.match(f.node.textContent,/a_b_c/);if(text.includes('x\\|y'))assert.equal(f.node.querySelector('tbody td:last-child').textContent,'x|y')}finally{f.close()}
  }
});

test('the real chat renders assistant Markdown while preserving source and literal user/tool messages',async()=>{
  const {createHarness}=require('./workflow-ui-harness.cjs'),h=await createHarness();
  try{const source='## 本圖依據\n\n**15 齒**，請核對 `7`。\n\n| 指標 | 值 |\n| --- | --- |\n| 齒數 | 15 |';h.api.project.data.chat.push({role:'user',text:'**這是原始輸入**'},{role:'assistant',text:source},{role:'system',text:'**工具原文**'});h.api.render();
    assert.equal(h.$('messages').querySelector('.assistant h2').textContent,'本圖依據');const card=h.$('messages').querySelector('.assistant .chat-sheet-card');assert.ok(card);assert.equal(h.$('messages').querySelector('.assistant table'),null);card.click();await h.tick();assert.equal(h.w.document.querySelector('.chat-sheet-dialog[open] .chat-sheet-grid table tbody td:last-child').textContent,'15');assert.equal(h.$('messages').querySelector('.user .text').textContent,'**這是原始輸入**');assert.equal(h.$('messages').querySelector('.system .text').textContent,'**工具原文**');assert.equal(h.api.project.data.chat[1].text,source);assert.deepEqual(h.errors,[]);
  }finally{h.close()}
});
