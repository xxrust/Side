import {externalEditors} from './external-run-files.js';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
export function createExternalFilesView({api,onError=()=>{}}){
 let dialog=null;
 return {async open(run,kind='code'){
  const prepared=await api.prepare(run);dialog?.remove();dialog=el('dialog');dialog.className='external-files-dialog';dialog.setAttribute('aria-label','執行證據檔案');
  const heading=el('header');heading.append(el('h3',run.title||'執行證據'));const close=el('button','×');close.setAttribute('aria-label','關閉檔案入口');close.onclick=()=>dialog.close();heading.append(close);dialog.append(heading,el('p','實算唯讀快照；請選擇應用查看。完整程式與資料不在平台內鋪開。'));
  const files=el('div');for(const file of prepared.files){const row=el('div'),button=el('button',file.name);button.title=file.path;button.setAttribute('aria-label','開啟檔案 '+file.name);row.append(button,el('small',file.kind==='code'?'程式':file.kind==='logs'?'輸出／錯誤':file.kind==='environment'?'環境紀錄':'完整數據'));button.onclick=()=>{row.querySelector('select')?.remove();row.querySelector('[data-open]')?.remove();const select=el('select');select.setAttribute('aria-label',file.name+' 的開啟方式');for(const app of externalEditors){const option=el('option',app.label);option.value=app.id;select.append(option)}const open=el('button','開啟');open.dataset.open='true';open.onclick=async()=>{open.disabled=true;try{await api.open(file.reference,select.value)}catch(error){onError(error.message);const note=el('p',error.message);note.setAttribute('role','alert');row.append(note)}finally{open.disabled=false}};row.append(select,open);select.focus();};files.append(row);if(file.kind===kind)button.dataset.current='true';}
  dialog.append(files);dialog.addEventListener('close',()=>{dialog.remove();dialog=null},{once:true});document.body.append(dialog);dialog.showModal();
 }};
}
