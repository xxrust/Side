import {nodeDocumentation} from './node-documentation.js';
import {renderChatMarkdown} from './chat-markdown.js';
import './node-documentation-view.css';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {documentationVisual,buildNodeDocumentationPage,buildNodeAnimationPage} from './node-documentation-page.js';

export function renderNodeDocumentation(node){
 const record=nodeDocumentation(node),body=documentElement('article','node-document');
 body.setAttribute('aria-label','節點文檔');
 if(record.legacy){const note=documentElement('small','node-document-origin');note.textContent='舊版說明 · 保留原有內容';body.append(note);}
 const releases=[];let removed=false;
 const dispose=()=>{removed=true;for(const release of releases.splice(0))release();};
 body.append(renderChatMarkdown(record.text||'尚未編寫節點文檔。',{openLink:url=>isTauri()?invoke('open_auth_url',{url}):window.open(url,'_blank','noopener'),renderVisual:metadata=>{
  const visual=documentationVisual(metadata);visual.figure.className='node-document-figure';
  if(isTauri())invoke('create_visual_preview',{document:visual.html}).then(prepared=>{if(removed){invoke('release_visual_preview',{id:prepared.id});return}releases.push(()=>invoke('release_visual_preview',{id:prepared.id}).catch(()=>{}));visual.frame.src=prepared.url;}).catch(error=>{visual.figure.textContent='圖解未能載入：'+error.message;});
  else visual.frame.srcdoc=visual.html;
  return visual.figure;
 }}));
 queueMicrotask(()=>{if(!body.isConnected){dispose();return}const observer=new MutationObserver(()=>{if(!body.isConnected){dispose();observer.disconnect();}});observer.observe(body.ownerDocument.body,{childList:true,subtree:true});});
 return body;
}
export function nodeDocumentationActions(node){
 const toolbar=documentElement('div','node-document-actions'),feedback=documentElement('span','node-document-feedback');feedback.setAttribute('role','status');
 const actions=[...(/\bdata-node-animation(?:\s|=|>)/.test(nodeDocumentation(node).text)?[['動畫模式','animate']]:[]),['在瀏覽器開啟','open'],['匯出 HTML','save'],['列印／另存 PDF','print']];
 for(const [label,mode]of actions){
  const button=documentElement('button','');button.type='button';button.textContent=label;
  button.onclick=async()=>{button.disabled=true;try{const html=mode==='animate'?buildNodeAnimationPage(node):buildNodeDocumentationPage(node,{printOnLoad:mode==='print'});if(isTauri()){await invoke(mode==='save'?'save_node_article':'open_node_article',{document:html,...(mode==='save'?{}:{print:mode==='print'})});feedback.textContent=mode==='print'?'已開啟瀏覽器列印；在目的地選擇另存 PDF。':mode==='save'?'':'已在瀏覽器開啟。';}else{const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));if(mode==='save'){const a=document.createElement('a');a.href=url;a.download='node-article.html';a.click();}else window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}}catch(error){feedback.textContent=error.message||String(error);}finally{button.disabled=false;}};
  toolbar.append(button);
 }
 toolbar.append(feedback);return toolbar;
}
function documentElement(tag,className){const element=document.createElement(tag);element.className=className;return element;}
