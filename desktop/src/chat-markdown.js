// Model replies are untrusted text. Host Markdown is text-only. Visual markup
// is handed to an optional isolated-artifact renderer, never inserted here.
const punctuation=/[\\`*{}\[\]()#+\-.!_>~|]/;
const make=(doc,tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node};

export function safeMarkdownUrl(value,{allowHttp=true}={}){
  if(typeof value!=='string'||/[\u0000-\u0020\u007f\\]/.test(value))return null;
  try{const url=new URL(value);return !url.username&&!url.password&&(url.protocol==='https:'||allowHttp&&url.protocol==='http:')?url.href:null}catch{return null}
}

function linkEnd(text,start){
  let depth=1,quote=null;
  for(let i=start;i<text.length;i++){
    const char=text[i];if(char==='\\'){i++;continue}
    if(quote){if(char===quote)quote=null;continue}
    if(char==='"'||char==="'"){quote=char;continue}
    if(char==='(')depth++;if(char===')'&&!--depth)return i;
  }
  return -1;
}

function appendInline(parent,text,options,depth=0){
  const doc=parent.ownerDocument;if(depth>16){parent.append(doc.createTextNode(text));return}
  let buffer='';const flush=()=>{if(buffer){parent.append(doc.createTextNode(buffer));buffer=''}};
  const appendLink=(label,destination,title)=>{
    const url=safeMarkdownUrl(destination,options);if(!url){buffer+=label+(destination?` (${destination})`:'');return}
    flush();const a=make(doc,'a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';if(title)a.title=title;
    appendInline(a,label,{...options,links:false},depth+1);
    if(options.openLink)a.addEventListener('click',event=>{event.preventDefault();options.openLink(url)});
    parent.append(a);
  };
  for(let i=0;i<text.length;){
    if(text[i]==='\\'&&punctuation.test(text[i+1]||'')){buffer+=text[i+1];i+=2;continue}
    if(text[i]==='\n'){
      if(buffer.endsWith('  ')||buffer.endsWith('\\')){buffer=buffer.replace(/(?: {2,}|\\)$/,'');flush();parent.append(make(doc,'br'))}
      else buffer+='\n';i++;continue;
    }
    if(text[i]==='`'){
      const run=text.slice(i).match(/^`+/)[0],end=text.indexOf(run,i+run.length);
      if(end>=0){flush();const value=text.slice(i+run.length,end).replace(/\n/g,' ');parent.append(make(doc,'code',/^ .* $/.test(value)&&value.trim()?value.slice(1,-1):value));i=end+run.length;continue}
    }
    // Images stay text, so a reply cannot fetch a remote URL while rendering.
    if(text[i]==='!'&&text[i+1]==='['){const close=text.indexOf(']',i+2);if(close>=0&&text[close+1]==='('){const end=linkEnd(text,close+2);if(end>=0){buffer+=`[圖片：${text.slice(i+2,close)}]`;i=end+1;continue}}}
    if(options.links!==false&&text[i]==='['){
      const close=text.indexOf(']',i+1);
      if(close>=0&&text[close+1]==='('){const end=linkEnd(text,close+2);if(end>=0){
        const target=text.slice(close+2,end).trim(),parts=target.match(/^(?:<([^<>]+)>|(\S+?))(?:\s+["'](.*)["'])?$/);
        if(parts){appendLink(text.slice(i+1,close),parts[1]||parts[2],parts[3]);i=end+1;continue}
      }}
    }
    if(options.links!==false&&text[i]==='<'){
      const end=text.indexOf('>',i+1),value=end>=0?text.slice(i+1,end):'';
      if(safeMarkdownUrl(value,options)){appendLink(value,value);i=end+1;continue}
    }
    const delimiter=['***','___','**','__','~~','*','_'].find(value=>text.startsWith(value,i));
    if(delimiter){
      const end=text.indexOf(delimiter,i+delimiter.length),inside=end>=0?text.slice(i+delimiter.length,end):'';
      const intraword=delimiter.includes('_')&&/[\p{L}\p{N}]/u.test(text[i-1]||'')&&/[\p{L}\p{N}]/u.test(text[i+delimiter.length]||'');
      if(inside&&!/^\s|\s$/.test(inside)&&!intraword){
        flush();const tag=delimiter==='~~'?'del':delimiter.length>=2?'strong':'em',node=make(doc,tag);
        if(delimiter.length===3){const em=make(doc,'em');appendInline(em,inside,options,depth+1);node.append(em)}else appendInline(node,inside,options,depth+1);
        parent.append(node);i=end+delimiter.length;continue;
      }
    }
    buffer+=text[i++];
  }
  flush();
}

function tableCells(line){
  const value=line.trim().replace(/^\|/,'').replace(/(?<!\\)\|$/,''),cells=[];let cell='',code=false;
  for(let i=0;i<value.length;i++){const c=value[i];if(c==='\\'&&value[i+1]==='|'){cell+='|';i++;continue}if(c==='`')code=!code;if(c==='|'&&!code){cells.push(cell.trim());cell=''}else cell+=c}cells.push(cell.trim());return cells;
}
const separator=line=>{const cells=tableCells(line);return cells.length>0&&cells.every(cell=>/^:?-{3,}:?$/.test(cell))?cells:null};
const listItem=line=>line.match(/^( *)([-+*]|\d+[.)])\s+(.*)$/);
const fence=line=>line.match(/^ {0,3}(`{3,}|~{3,})([^`]*)$/);
const heading=line=>{const match=line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*$/);if(match)match[2]=match[2].replace(/\s+#+$/,'');return match};
const quote=line=>/^ {0,3}> ?/.test(line);
const horizontal=line=>/^ {0,3}(?:\*\s*){3,}$|^ {0,3}(?:-\s*){3,}$|^ {0,3}(?:_\s*){3,}$/.test(line);
// A complete standalone root is required. Partial streaming markup stays text.
function rawVisualBlock(lines,index){
 if(!/^\s*(?:<!doctype\s+html|<\?xml\b|<(?:html|svg|div|section|article|main|figure|canvas)\b)/i.test(lines[index]||''))return null;
 const beginning=lines.slice(index).join('\n'),match=beginning.match(/^\s*(?:<!doctype\s+html[^>]*>\s*|<\?xml[^>]*>\s*)?<(?<root>html|svg|div|section|article|main|figure|canvas)\b/i);if(!match)return null;
 const root=match.groups.root.toLowerCase(),tags=new RegExp(`<\\/?${root}\\b[^>]*>`,'gi');let depth=0,end=0,tag;
 while((tag=tags.exec(beginning))){if(/^<\//.test(tag[0]))depth--;else if(!/\/>$/.test(tag[0]))depth++;if(depth===0){end=tags.lastIndex;break;}}
 if(!end)return null;const trailing=beginning.slice(end).split('\n')[0];if(trailing.trim())return null;
 const source=beginning.slice(0,end).trim();return {source,language:root==='svg'?'svg':'html',lineCount:beginning.slice(0,end).split('\n').length};
}
const isBlock=(lines,index)=>!lines[index]?.trim()||fence(lines[index])||heading(lines[index])||quote(lines[index])||horizontal(lines[index])||listItem(lines[index])||/^\s*(?:<!doctype\s+html|<html\b|<svg\b|<\?xml\b|<(?:div|section|article|main|figure|canvas)\b)/i.test(lines[index])||(lines[index]?.includes('|')&&separator(lines[index+1]||''));

function appendBlocks(parent,lines,options,depth=0){
  const doc=parent.ownerDocument;if(depth>16){parent.append(make(doc,'p',lines.join('\n')));return}
  for(let i=0;i<lines.length;){
    const line=lines[i];if(!line.trim()){i++;continue}
    if(options.renderVisual){const raw=rawVisualBlock(lines,i);if(raw){const metadata={...raw,index:++options.visualState.index,title:options.tableState.title||'',raw:true,complete:true},visual=options.renderVisual(metadata);if(visual){parent.append(visual);i+=raw.lineCount;continue;}}}
    const f=fence(line);
    if(f){const body=[];i++;while(i<lines.length&&!new RegExp(`^ {0,3}${f[1][0]}{${f[1].length},}\\s*$`).test(lines[i]))body.push(lines[i++]);const complete=i<lines.length;if(complete)i++;
      const language=f[2].trim().split(/\s+/)[0];if(complete&&options.renderVisual&&(/^(?:html|htm|svg)$/i.test(language)||/^xml$/i.test(language)&&/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(body.join('\n')))){const visual=options.renderVisual({language:language.toLowerCase(),source:body.join('\n'),index:++options.visualState.index,title:options.tableState.title||'',raw:false,complete});if(visual){parent.append(visual);continue;}}
      const pre=make(doc,'pre'),code=make(doc,'code',body.join('\n'));if(/^[\w+.-]+$/.test(language))code.dataset.language=language;pre.append(code);parent.append(pre);continue;
    }
    const h=heading(line);if(h){const node=make(doc,'h'+h[1].length);appendInline(node,h[2],options);options.tableState.title=node.textContent;parent.append(node);i++;continue}
    if(horizontal(line)){parent.append(make(doc,'hr'));i++;continue}
    if(quote(line)){const body=[];while(i<lines.length&&quote(lines[i]))body.push(lines[i++].replace(/^ {0,3}> ?/,''));const node=make(doc,'blockquote');appendBlocks(node,body,options,depth+1);parent.append(node);continue}
    const item=listItem(line);
    if(item){const indent=item[1].length,ordered=/^\d/.test(item[2]),list=make(doc,ordered?'ol':'ul');if(ordered){const start=parseInt(item[2],10);if(start!==1)list.start=start}
      while(i<lines.length){const next=listItem(lines[i]);if(!next||next[1].length!==indent||/^\d/.test(next[2])!==ordered)break;
        const content=[next[3]],continuation=indent+next[2].length+1;i++;
        while(i<lines.length){const following=listItem(lines[i]);if(following&&following[1].length<=indent)break;
          if(!lines[i].trim()){if(lines[i+1]&&/^\s+/.test(lines[i+1])){content.push('');i++;continue}break}
          const spaces=lines[i].match(/^ */)[0].length;if(spaces<=indent)break;content.push(lines[i].slice(Math.min(continuation,spaces)));i++;
        }
        const li=make(doc,'li'),task=content[0].match(/^\[([ xX])\]\s+(.*)$/);if(task){content[0]=task[2];li.classList.add('md-task');const check=make(doc,'span',task[1]===' '?'☐':'☑');check.className='md-task-marker';check.setAttribute('aria-label',task[1]===' '?'未完成':'已完成');li.append(check)}
        appendBlocks(li,content,options,depth+1);list.append(li);
      }
      parent.append(list);continue;
    }
    const align=line.includes('|')?separator(lines[i+1]||''):null;
    if(align){const start=i,headers=tableCells(line),rows=[],table=make(doc,'table'),thead=make(doc,'thead'),tr=make(doc,'tr'),tbody=make(doc,'tbody');
      const addRow=(row,values,tag)=>{for(let c=0;c<headers.length;c++){const cell=make(doc,tag);if(tag==='th')cell.scope='col';if(align[c]?.startsWith(':')&&align[c]?.endsWith(':'))cell.style.textAlign='center';else if(align[c]?.endsWith(':'))cell.style.textAlign='right';appendInline(cell,values[c]||'',options);row.append(cell)}};
      addRow(tr,headers,'th');thead.append(tr);i+=2;while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){const row=make(doc,'tr'),values=tableCells(lines[i++]);rows.push(headers.map((_,column)=>values[column]||''));addRow(row,values,'td');tbody.append(row)}table.append(thead,tbody);
      const index=++options.tableState.index,metadata={table,source:lines.slice(start,i).join('\n'),index,title:options.tableState.title||'',rowCount:rows.length,columnCount:headers.length,headers,rows};
      const custom=options.renderTable?.(metadata);if(custom){parent.append(custom)}else{const wrap=make(doc,'div');wrap.className='md-table-wrap';wrap.append(table);parent.append(wrap)}continue;
    }
    const paragraph=[line];i++;while(i<lines.length&&!isBlock(lines,i))paragraph.push(lines[i++]);const p=make(doc,'p');appendInline(p,paragraph.join('\n'),options);parent.append(p);
  }
}

/** Render assistant Markdown. Source remains in chat data for save/copy/history. */
export function renderChatMarkdown(source,{document:doc=globalThis.document,openLink,allowHttp=true,renderTable,renderVisual}={}){
  const root=make(doc,'div');root.className='text markdown-body';
  appendBlocks(root,String(source??'').replace(/\r\n?/g,'\n').replace(/\t/g,'    ').split('\n'),{openLink,allowHttp,renderTable,renderVisual,visualState:{index:0},tableState:{index:0,title:''}});return root;
}
