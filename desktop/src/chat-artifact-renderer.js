// Generated documents stay in an opaque-origin sandbox. Their source is never
// inserted into the application DOM and the host listens to no child messages.
const make=(doc,tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const fingerprint=text=>{let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}return (hash>>>0).toString(16);};
export function visualArtifactKind(language,source){
 const kind=String(language||'').toLowerCase();if(['html','htm'].includes(kind))return 'html';if(kind==='svg'||kind==='xml'&&/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source||''))return 'svg';return null;
}
export const ARTIFACT_CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
/** Detached template parsing is inert: no generated nodes enter the host DOM. */
export function buildArtifactDocument(source,{document:doc=globalThis.document,title='Agent 圖解',theme='dark'}={}){
 const template=doc.createElement('template');template.innerHTML=String(source??'');
 for(const node of template.content.querySelectorAll('base,meta,link,iframe,frame,frameset,object,embed,portal,form'))node.remove();
 for(const node of template.content.querySelectorAll('*')){
  for(const attribute of [...node.attributes]){
   const name=attribute.name.toLowerCase(),value=attribute.value.trim();
   if(name==='srcdoc'||name==='srcset'||name==='ping'||name==='action'||name==='formaction'||name==='target'||name==='download'||name==='autofocus')node.removeAttribute(attribute.name);
   if(['src','href','xlink:href','poster','background'].includes(name)&&!value.startsWith('#')&&!/^data:(?:image\/|font\/|audio\/|video\/)/i.test(value))node.removeAttribute(attribute.name);
  }
  if(node.tagName?.toLowerCase()==='script'){
   node.removeAttribute('src');node.removeAttribute('integrity');node.removeAttribute('crossorigin');
   // Import maps and remote modules have no offline meaning in this renderer.
   if(node.getAttribute('type')==='importmap')node.remove();
  }
 }
 const escaped=String(title).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const guard="document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a,area');if(a){var h=a.getAttribute('href')||a.getAttribute('xlink:href')||'';if(h.charAt(0)!=='#')e.preventDefault();}},true);document.addEventListener('submit',function(e){e.preventDefault();},true);window.addEventListener('error',function(e){if(!document.body||document.getElementById('artifact-render-error'))return;var n=document.createElement('p');n.id='artifact-render-error';n.textContent='圖解未完整顯示：'+(e.message||'腳本執行失敗');n.style.cssText='position:fixed;bottom:0;left:0;right:0;margin:0;padding:10px;background:#492f25;color:#ffe3b7;font:13px/1.5 system-ui;z-index:2147483647';document.body.append(n);});";
 const palette=theme==='light'?'color-scheme:light;background:#fff;color:#24323a':'color-scheme:dark;background:#10212a;color:#e4eee9';
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaped}</title><style>html{${palette}}body{margin:0;padding:16px;box-sizing:border-box;font:15px/1.6 system-ui,sans-serif}svg{max-width:100%;height:auto}canvas{max-width:100%}*{box-sizing:border-box}@media print{button{display:none!important}}</style><script>${guard}</script></head><body>${template.innerHTML}</body></html>`;
}

export class ChatArtifactView{
 constructor({document:doc=globalThis.document,onSave,onError,preparePreview}={}){this.doc=doc;this.preparePreview=preparePreview;this.onSave=onSave;this.onError=onError;this.epoch=null;this.dialog=null;}
 syncEpoch(epoch){if(this.epoch!==epoch){this.close();this.epoch=epoch;}}
 card(metadata,origin={}){
  const language=visualArtifactKind(metadata.language,metadata.source);if(!language)return null;
  const snapshot={source:String(metadata.source),language,title:metadata.title||`${language.toUpperCase()} 圖解`,index:metadata.index||1,origin:{...origin},id:`visual-${fingerprint(metadata.source)}`};
  const card=make(this.doc,'button',undefined,'chat-artifact-card');card.type='button';card.dataset.artifactId=snapshot.id;card.setAttribute('aria-haspopup','dialog');card.setAttribute('aria-label',`開啟${snapshot.title}`);
  const glyph=make(this.doc,'span',language==='svg'?'◇':'▧','chat-artifact-glyph'),summary=make(this.doc,'span',undefined,'chat-artifact-summary');summary.append(make(this.doc,'strong',snapshot.title),make(this.doc,'small',`${language.toUpperCase()} · 點擊展開圖解`));card.append(glyph,summary);
  card.onclick=()=>{if(origin.epoch!==undefined&&origin.epoch!==this.epoch)return;this.open(snapshot,card)};return card;
 }
 close(){const dialog=this.dialog;if(!dialog)return;this.dialog=null;this.frame?.remove();this.frame=null;this.releasePreview?.();this.releasePreview=null;if(dialog.open)dialog.close();dialog.remove();if(this.opener?.isConnected)this.opener.focus();this.opener=null;}
 perform(action){try{const result=action();result?.catch?.(error=>this.error(error))}catch(error){this.error(error)}}
 error(error){if(this.feedback)this.feedback.textContent=error.message||String(error);this.onError?.(error.message||String(error));}
 open(snapshot,opener){
  this.close();this.snapshot={...snapshot};this.opener=opener;const doc=this.doc,dialog=make(doc,'dialog',undefined,'chat-artifact-dialog');this.dialog=dialog;dialog.setAttribute('aria-label',snapshot.title||'Agent 圖解');
  const heading=make(doc,'header'),title=make(doc,'h2',snapshot.title||'Agent 圖解'),close=make(doc,'button','×');close.type='button';close.setAttribute('aria-label','關閉圖解');close.onclick=()=>this.close();heading.append(title,close);
  const toolbar=make(doc,'nav'),preview=make(doc,'button','圖解'),source=make(doc,'button','原始碼');preview.type=source.type='button';toolbar.append(preview,source);
  const frame=make(doc,'iframe');this.frame=frame;frame.title=snapshot.title||'Agent 圖解';frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('referrerpolicy','no-referrer');frame.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; fullscreen 'none'");
  // The native preview scheme serves a separate document response with its
  // own CSP. srcdoc/data inherit the application's script-src and cannot run
  // interactive diagrams under a strict host CSP.
  const html=buildArtifactDocument(snapshot.source,{document:doc,title:snapshot.title});
  const code=make(doc,'pre',snapshot.source,'chat-artifact-source');code.hidden=true;const stage=make(doc,'div',undefined,'chat-artifact-stage');stage.append(frame,code);
  const setMode=raw=>{frame.hidden=raw;code.hidden=!raw;preview.setAttribute('aria-pressed',String(!raw));source.setAttribute('aria-pressed',String(raw));};preview.onclick=()=>setMode(false);source.onclick=()=>setMode(true);setMode(false);
  const footer=make(doc,'footer');this.feedback=make(doc,'span','正在準備隔離預覽…');footer.append(this.feedback);
  if(this.onSave){const save=make(doc,'button','加入收藏');save.type='button';save.onclick=()=>this.perform(async()=>{save.disabled=true;try{const saved=await this.onSave({...this.snapshot,mime:snapshot.language==='svg'?'image/svg+xml':'text/html'});if(saved!==false&&this.feedback)this.feedback.textContent='已加入收藏';}finally{save.disabled=false}});footer.append(save);}
  dialog.append(heading,toolbar,stage,footer);dialog.addEventListener('cancel',event=>{event.preventDefault();this.close()});dialog.addEventListener('close',()=>{if(this.dialog===dialog)this.close()});doc.body.append(dialog);dialog.showModal();close.focus();
  this.previewReady=(async()=>{try{
   const prepared=this.preparePreview?await this.preparePreview({document:html,source:snapshot.source,language:snapshot.language,title:snapshot.title}):{url:'data:text/html;charset=utf-8,'+encodeURIComponent(html)};
   const url=typeof prepared==='string'?prepared:prepared?.url;if(!url)throw Error('隔離預覽服務未回傳文件位址');
   const dispose=typeof prepared==='object'&&typeof prepared.dispose==='function'?prepared.dispose:null;
   if(this.dialog!==dialog){dispose?.();return;}this.releasePreview=dispose;frame.src=url;
   this.feedback.textContent=this.preparePreview?'本地隔離圖解 · 可互動 · 不存取專案或網路':'瀏覽器隔離預覽；桌面互動由隔離服務提供';
  }catch(error){if(this.dialog===dialog){frame.remove();this.error(error);}}})();return dialog;
 }
}
