import {renderChatMarkdown} from './chat-markdown.js';
import {buildArtifactDocument} from './chat-artifact-renderer.js';
import {nodeDocumentation} from './node-documentation.js';

export const articleStyles=`
:root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;color:#24323a;background:#fff}
*{box-sizing:border-box}body{margin:0;background:#fff;color:#24323a;font-size:16px;line-height:1.9}
main{max-width:880px;margin:auto;padding:36px 36px 70px}h1{font-size:30px;line-height:1.45;margin:0 0 24px}h2{font-size:23px;line-height:1.5;margin:38px 0 16px}h3{font-size:18px;margin:28px 0 12px}p{margin:0 0 1.1em;overflow-wrap:anywhere}a{color:#126394}code{font-size:.9em;background:#f0f3f5;padding:2px 4px;border-radius:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;background:#f4f6f8}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:10px;border:1px solid #cbd5dc;text-align:left}th{background:#f1f5f7}blockquote{margin:20px 0;padding:10px 20px;border-left:3px solid #85a6b8;background:#f5f8fa}figure{margin:24px 0;break-inside:avoid}iframe{width:100%;height:650px;border:1px solid #d5dfe5;border-radius:8px;background:white;display:block}figcaption{font-size:13px;color:#586c78;margin-top:6px}.reading-toolbar{padding:14px 24px;border-bottom:1px solid #d5dfe5;display:flex;gap:16px;align-items:center;position:sticky;top:0;background:#fff;z-index:1;font-size:14px}button{background:#fff;color:#24323a;border:1px solid #a9bac5;border-radius:6px;padding:8px 14px;cursor:pointer}.print-note{color:#647783;font-size:13px}
@media(max-width:650px){main{padding:24px 18px}h1{font-size:25px}h2{font-size:21px}.reading-toolbar{position:static;flex-wrap:wrap}iframe{height:620px}}
@page{size:A4;margin:16mm 15mm 18mm}
iframe[data-format=svg]{height:470px}
@media print{.reading-toolbar{display:none}body{font-size:10.5pt;line-height:1.65}main{max-width:none;padding:0}h1{font-size:21pt}h2{font-size:16pt;margin:24px 0 10px;break-after:avoid}h3{font-size:13pt;margin:18px 0 8px;break-after:avoid}p{orphans:3;widows:3;margin-bottom:.85em}table{font-size:9pt;break-inside:avoid}th,td{padding:7px}thead{display:table-header-group}tr,figure{break-inside:avoid}iframe{height:130mm;border:0;border-radius:0}iframe[data-format=svg]{height:100mm}a{color:#24323a}pre{font-size:9pt}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

export function documentationVisual(metadata,{document:doc=globalThis.document}={}){
 const figure=doc.createElement('figure'),frame=doc.createElement('iframe');
 frame.title=metadata.title||'文章圖解';frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('referrerpolicy','no-referrer');
 const svg=metadata.language==='svg';if(svg)frame.dataset.format='svg';
 const html=buildArtifactDocument(metadata.source+(svg?'<style>@media print{body{padding:0}svg{display:block;max-height:98mm}}</style>':''),{document:doc,title:frame.title,theme:'light'});
 const caption=doc.createElement('figcaption');caption.textContent=metadata.title||'文章圖解';figure.append(frame,caption);
 return {figure,frame,html};
}

export function buildNodeDocumentationPage(node,{document:doc=globalThis.document,printOnLoad=false}={}){
 const main=doc.createElement('main');main.append(renderChatMarkdown(nodeDocumentation(node).text||'尚未編寫節點文檔。',{document:doc,renderVisual:metadata=>{const visual=documentationVisual(metadata,{document:doc});visual.frame.srcdoc=visual.html;return visual.figure}}));
 const title=doc.createElement('title');title.textContent=(node.title||'節點')+' · 節點文章';
 return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; frame-src 'self' about:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">${title.outerHTML}<style>${articleStyles}</style></head><body><nav class="reading-toolbar"><strong>AgentCV · 節點文章</strong><button id="print-article">列印／另存 PDF</button><span class="print-note">PDF 保留圖解的列印當下狀態；互動請使用 HTML。</span></nav>${main.outerHTML}<script>document.getElementById('print-article').onclick=()=>window.print();${printOnLoad?"window.addEventListener('load',()=>setTimeout(()=>window.print(),300));":''}</script></body></html>`;
}

/** Open an authored demonstration as a single viewport, using the same sandbox
 * document builder as inline figures. Do not insert its markup into the host. */
export function buildNodeAnimationPage(node,{document:doc=globalThis.document}={}){
 let animation=null;
 renderChatMarkdown(nodeDocumentation(node).text,{document:doc,renderVisual:metadata=>{if(!animation&&/\bdata-node-animation(?:\s|=|>)/.test(metadata.source))animation=metadata;return doc.createElement('span');}});
 if(!animation)throw Error('此節點尚未編寫動畫示範');
 return buildArtifactDocument(animation.source,{document:doc,title:(node.title||'節點')+' · 動畫示範',theme:'light'});
}
