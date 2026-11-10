// WKWebView may cancel window.confirm without presenting a dialog. Keep this
// decision in the document so desktop and browser users see the same controls.
let pending;
export function confirmAction(message,{title='確認切換專案',confirmLabel='繼續',cancelLabel='取消'}={}){
 if(pending)return pending;
 const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='confirm-action-dialog';dialog.setAttribute('aria-label',title);
 const heading=document.createElement('h2');heading.textContent=title;
 const description=document.createElement('p');description.textContent=message;
 const actions=document.createElement('div');actions.className='row';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent=cancelLabel;
 const proceed=document.createElement('button');proceed.type='button';proceed.className='primary';proceed.textContent=confirmLabel;
 actions.append(cancel,proceed);dialog.append(heading,description,actions);
 pending=new Promise(resolve=>{let settled=false;const finish=value=>{if(settled)return;settled=true;dialog.remove();pending=null;if(previous?.isConnected)previous.focus();resolve(value)};cancel.onclick=()=>finish(false);proceed.onclick=()=>finish(true);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false)});dialog.addEventListener('close',()=>finish(false));document.body.append(dialog);dialog.showModal();cancel.focus();});
 return pending;
}
