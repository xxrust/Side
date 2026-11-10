import {iconButton,iconLabelButton} from './ui-icons.js';
import './chat-sheet.css';

const make=(doc,tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node};
const clone=value=>JSON.parse(JSON.stringify(value));
const columnName=index=>{let label='';for(let n=index+1;n;n=Math.floor((n-1)/26))label=String.fromCharCode(65+(n-1)%26)+label;return label};
const bounds=(a,b)=>({from:{row:Math.min(a.row,b.row),column:Math.min(a.column,b.column)},to:{row:Math.max(a.row,b.row),column:Math.max(a.column,b.column)}});
const address=point=>columnName(point.column)+(point.row+2);
const isNumber=text=>/^\s*[-+−]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?(?:\s*(?:%|°|px|mm|µm|μm|um|rad|deg))?\s*$/i.test(text);
const fingerprint=text=>{let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}return (hash>>>0).toString(16)};

export function sheetCSV(headers,rows){
 const field=value=>{let text=String(value??'');if(/^\s*[=+@]/.test(text)&&!isNumber(text)||/^\s*-(?!\d|\.\d)/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};
 return '\ufeff'+[headers,...rows].map(row=>row.map(field).join(',')).join('\r\n');
}

/** Chat tables are historical read-only artifacts, independent of live CV state. */
export class ChatSheetView{
 constructor({document:doc=globalThis.document,onAsk,onExport,onError,copyText,openLink}={}){this.doc=doc;this.onAsk=onAsk;this.onExport=onExport;this.onError=onError;this.copyText=copyText;this.openLink=openLink;this.epoch=null;this.dialog=null;this.selection=null}
 syncEpoch(epoch){if(this.epoch!==epoch){this.close();this.epoch=epoch}}
 card(metadata,origin={}){
  const doc=this.doc,index=metadata.index,headers=[...metadata.table.querySelectorAll('thead th')].map(cell=>cell.textContent),rows=[...metadata.table.querySelectorAll('tbody tr')].map(row=>[...row.cells].map(cell=>cell.textContent)),title=metadata.title||headers.filter(Boolean).slice(0,3).join(' · ')||'資料表';
  const snapshot={title,index,source:metadata.source,headers,rows,table:metadata.table.cloneNode(true),origin:{...origin},id:`chat-${origin.sourceChatIndex??0}-sheet-${index}-${fingerprint(metadata.source)}`};
  const card=make(doc,'button',undefined,'chat-sheet-card');card.type='button';card.dataset.sheetIndex=String(index);card.dataset.sheetId=snapshot.id;card.setAttribute('aria-label',`開啟表格 ${index}：${title}，${rows.length} 行 × ${headers.length} 列`);card.setAttribute('aria-haspopup','dialog');
  const glyph=make(doc,'span',undefined,'chat-sheet-glyph');iconButton(glyph,'sheet','表格');glyph.removeAttribute('aria-label');glyph.removeAttribute('title');glyph.setAttribute('aria-hidden','true');
  const info=make(doc,'span',undefined,'chat-sheet-summary'),name=make(doc,'strong',`表格 ${index} · ${title}`),size=make(doc,'span',`${rows.length} 行 × ${headers.length} 列 · 點擊展開`),preview=make(doc,'small',headers.join(' · '));name.title=title;preview.title=headers.join(' · ');info.append(name,size,preview);card.append(glyph,info);card.onclick=()=>{if(origin.epoch!==undefined&&origin.epoch!==this.epoch)return;this.open(snapshot,card)};return card;
 }
 button(label,action,icon){const button=make(this.doc,'button',label);button.type='button';button.onclick=()=>this.perform(action);return icon?iconLabelButton(button,icon,label):button}
 perform(action){try{const result=action();if(result?.catch)result.catch(error=>this.error(error))}catch(error){this.error(error)}}
 error(error){if(this.feedback)this.feedback.textContent=error.message||String(error);this.onError?.(error.message||String(error))}
 close(){if(this.dialog?.open)this.dialog.close();if(this.dialog)this.cleanup()}
 cleanup(){const dialog=this.dialog;this.doc.removeEventListener('pointerup',this.pointerUp);this.dialog=null;this.selection=null;this.snapshot=null;dialog?.remove();if(this.opener?.isConnected)this.opener.focus();this.opener=null}
 open(snapshot,opener){
  this.close();this.snapshot=snapshot;this.opener=opener;this.anchor=null;this.selection=null;this.focusCell=null;this.dragSelecting=false;this.ignoreClick=false;
  const doc=this.doc,dialog=make(doc,'dialog',undefined,'chat-sheet-dialog');this.dialog=dialog;dialog.setAttribute('aria-labelledby','chatSheetTitle');
  const heading=make(doc,'header',undefined,'chat-sheet-heading'),titles=make(doc,'div'),title=make(doc,'h2',`表格 ${snapshot.index} · ${snapshot.title}`);title.id='chatSheetTitle';
  titles.append(title,make(doc,'p',`${snapshot.rows.length} 行 × ${snapshot.headers.length} 列 · 對話快照 · 唯讀`));
  const close=iconButton(this.button('關閉表格',()=>this.close()),'close','關閉表格','Esc');close.autofocus=true;heading.append(titles,close);
  const toolbar=make(doc,'div',undefined,'chat-sheet-toolbar'),search=make(doc,'input');search.type='search';search.placeholder='搜尋表格';search.setAttribute('aria-label','搜尋表格');this.search=search;
  this.copyButton=this.button('複製表格',()=>this.copy(),'copy');this.exportButton=this.button('匯出 CSV',()=>this.export(),'export');toolbar.append(search,this.copyButton,this.exportButton);
  const grid=make(doc,'div',undefined,'chat-sheet-grid'),table=snapshot.table.cloneNode(true);this.grid=grid;this.table=table;table.setAttribute('role','grid');table.setAttribute('aria-label',snapshot.title);table.className='chat-sheet-table';
  const headRow=table.tHead.rows[0],corner=make(doc,'th','#');corner.scope='col';corner.className='chat-sheet-row-number';headRow.prepend(corner);
  for(const [column,cell]of [...headRow.cells].slice(1).entries()){const address=make(doc,'span',columnName(column),'chat-sheet-column-letter');cell.prepend(address);cell.dataset.column=String(column)}
  for(const [row,tr]of [...table.tBodies[0].rows].entries()){
   for(const [column,cell]of [...tr.cells].entries()){
    cell.dataset.row=String(row);cell.dataset.col=String(column);cell.tabIndex=row===0&&column===0?0:-1;cell.setAttribute('aria-selected','false');cell.setAttribute('aria-label',`${columnName(column)}${row+2} · ${snapshot.headers[column]}：${snapshot.rows[row][column]}`);
    if(isNumber(snapshot.rows[row][column]))cell.classList.add('chat-sheet-number');
    cell.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();this.ignoreClick=true;this.dragSelecting=true;this.choose(row,column,event.shiftKey)};
    cell.onpointerenter=()=>{if(this.dragSelecting)this.choose(row,column,true,false)};
    cell.onclick=event=>{if(this.ignoreClick){this.ignoreClick=false;return}this.choose(row,column,event.shiftKey)};
   }
   const label=make(doc,'th',String(row+2),'chat-sheet-row-number');label.scope='row';label.title=`資料第 ${row+1} 行`;tr.prepend(label);
  }
  table.addEventListener('click',event=>{const link=event.target.closest?.('a');if(link){event.preventDefault();if(this.openLink)this.perform(()=>this.openLink(link.href))}});
  this.pointerUp=()=>{this.dragSelecting=false};doc.addEventListener('pointerup',this.pointerUp);grid.append(table);
  const footer=make(doc,'footer',undefined,'chat-sheet-footer'),state=make(doc,'div',undefined,'chat-sheet-state');this.feedback=make(doc,'span');this.feedback.setAttribute('role','status');state.append(this.feedback,make(doc,'small','點選儲存格；Shift 點選或拖動可框選，⌘C / Ctrl+C 複製。'));
  const actions=make(doc,'div',undefined,'chat-sheet-actions');this.askSelected=this.button('引用選取問 Agent',()=>this.ask(false),'quote');this.askSelected.disabled=true;this.askAll=this.button('引用整表問 Agent',()=>this.ask(true),'quote');actions.append(this.askSelected,this.askAll);footer.append(state,actions);
  dialog.append(heading,toolbar,grid,footer);dialog.addEventListener('close',()=>{if(this.dialog===dialog)this.cleanup()});dialog.addEventListener('cancel',()=>{});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.close()});
  search.oninput=()=>this.filter(search.value);
  dialog.addEventListener('keydown',event=>this.key(event));doc.body.append(dialog);dialog.showModal();this.refreshSelection();
 }
 choose(row,column,extend=false,focus=true){
  const point={row,column};if(!extend||!this.anchor)this.anchor=point;this.focusCell=point;this.selection=bounds(this.anchor,point);this.refreshSelection();
  if(focus){const cell=this.table.querySelector(`td[data-row="${row}"][data-col="${column}"]`);cell?.focus({preventScroll:true})}
 }
 refreshSelection(){
  if(!this.dialog)return;const range=this.selection;for(const cell of this.table.querySelectorAll('td')){const row=Number(cell.dataset.row),column=Number(cell.dataset.col),selected=!!range&&row>=range.from.row&&row<=range.to.row&&column>=range.from.column&&column<=range.to.column;cell.setAttribute('aria-selected',String(selected));cell.classList.toggle('selected',selected);cell.tabIndex=this.focusCell?.row===row&&this.focusCell?.column===column?0:-1}
  this.askSelected.disabled=!range;const label=range?'複製選取':'複製表格';iconLabelButton(this.copyButton,'copy',label);
  const visible=[...this.table.tBodies[0].rows].filter(row=>!row.hidden).length,total=this.snapshot.rows.length;this.feedback.textContent=range?`已選 ${address(range.from)}:${address(range.to)} · ${(range.to.row-range.from.row+1)*(range.to.column-range.from.column+1)} 格`:`${this.search.value?`找到 ${visible} / ${total} 行`:`${total} 行 × ${this.snapshot.headers.length} 列`}`;
 }
 filter(value){this.selection=null;this.anchor=null;this.focusCell=null;const query=value.trim().toLocaleLowerCase();for(const [index,row]of [...this.table.tBodies[0].rows].entries())row.hidden=!!query&&!this.snapshot.rows[index].join(' ').toLocaleLowerCase().includes(query);this.refreshSelection()}
 cells(all=false){const s=this.snapshot,r=!all&&this.selection;return {headers:r?s.headers.slice(r.from.column,r.to.column+1):[...s.headers],rows:r?s.rows.slice(r.from.row,r.to.row+1).map(row=>row.slice(r.from.column,r.to.column+1)):s.rows.map(row=>[...row])}}
 async copy(){const data=this.cells(),text=(this.selection?data.rows:[data.headers,...data.rows]).map(row=>row.map(value=>value.replace(/\t/g,'    ').replace(/\r?\n/g,' ')).join('\t')).join('\n');if(this.copyText)await this.copyText(text);else{
   try{if(!this.doc.defaultView.navigator.clipboard?.writeText)throw Error('clipboard unavailable');await this.doc.defaultView.navigator.clipboard.writeText(text)}catch{const input=make(this.doc,'textarea');input.value=text;input.className='chat-sheet-copy-buffer';this.dialog.append(input);input.focus();input.select();const copied=this.doc.execCommand?.('copy');input.remove();if(!copied)throw Error('未能複製，請選取儲存格後使用 ⌘C / Ctrl+C')}
  }if(this.feedback)this.feedback.textContent=this.selection?'已複製選取儲存格':'已複製完整表格（含表頭）';return text}
 async export(){const s=this.snapshot,content=sheetCSV(s.headers,s.rows),filename=`agentcv-table-${s.index}.csv`;if(!this.onExport)throw Error('尚未提供匯出介面');const result=await this.onExport({content,filename,type:'text/csv'});if(result!==false&&this.feedback)this.feedback.textContent='已匯出完整表格（含表頭）';return content}
 ask(all){
  const s=this.snapshot;if(!s||!all&&!this.selection)return;const data=this.cells(all),selection=all?null:clone(this.selection),reference={kind:'chat_sheet',sheetId:s.id,title:`表格 ${s.index} · ${s.title}`,sourceChatIndex:s.origin.sourceChatIndex,tableIndex:s.index,sourceMessageAt:s.origin.sourceMessageAt||null,sourceMarkdown:s.source,headers:data.headers,rows:data.rows,selection,totalRows:s.rows.length,totalColumns:s.headers.length,scope:'聊天中 Agent 回覆的唯讀表格快照；不是重新執行算法所得，也不是工程師核准的品質真值。'};
  if(JSON.stringify(reference).length>100000||data.rows.length*data.headers.length>2000)throw Error('引用內容超過單次上限，請選取較小範圍後提問');
  const text=selection?`關於「${reference.title}」的 ${address(selection.from)}:${address(selection.to)}，請結合引用的表頭與數據解釋：`:`關於「${reference.title}」，請結合引用的完整表格解釋：`;this.close();this.onAsk?.({text,reference});return reference;
 }
 key(event){
  const typing=/INPUT|TEXTAREA|SELECT/.test(event.target.tagName);if(typing)return;
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='c'){event.preventDefault();this.perform(()=>this.copy());return}
  const moves={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]},step=moves[event.key];if(!step||!event.target.matches?.('td'))return;event.preventDefault();const rows=[...this.table.tBodies[0].rows].map((tr,index)=>!tr.hidden?index:null).filter(index=>index!==null),current=this.focusCell||{row:rows[0]??0,column:0},position=rows.indexOf(current.row),row=rows[Math.max(0,Math.min(rows.length-1,position+step[0]))],column=Math.max(0,Math.min(this.snapshot.headers.length-1,current.column+step[1]));if(row!==undefined)this.choose(row,column,event.shiftKey);
 }
}
