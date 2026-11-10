// Pure metadata code shared by the UI and the isolated source-analysis worker.
export const defaultSourceModel={provider:'codex',modelId:'gpt-6.1-terra',enabled:true};
const copy=v=>structuredClone(v);
export function sourceModelConfig(input=defaultSourceModel){
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['provider','modelId','enabled'].includes(k))||typeof input.provider!=='string'||!input.provider.trim()||input.provider.length>200||typeof input.modelId!=='string'||!input.modelId.trim()||input.modelId.length>200||typeof input.enabled!=='boolean')throw Error('圖像源模型設定無效');return copy(input);
}
export function buildSourceStructure(images,entries=[]){
 if(!Array.isArray(images)||!images.length||images.length>100000||!Array.isArray(entries)||entries.length>100000)throw Error('圖像來源清單數量無效');
 const raw=images.map(i=>String(i.source_relative_path||i.source_path||i.name||'').replaceAll('\\','/'));
 let prefix=[];if(raw.every(s=>s.startsWith('/')||/^[A-Za-z]:\//.test(s))){prefix=raw[0].split('/').slice(0,-1);for(const p of raw)while(prefix.length&&!p.startsWith(prefix.join('/')+'/'))prefix.pop();}
 const relative=raw.map((s,i)=>{const p=prefix.length?[prefix.at(-1),s.slice(prefix.join('/').length+1)].join('/'):s;if(p.startsWith('/')||/^[A-Za-z]:/.test(p))return String(images[i].name||p.split('/').at(-1));return p;});
 const paths=new Set(['']),check=p=>{if(typeof p!=='string'||p.split('/').some(x=>!x||x==='.'||x==='..')||/^[A-Za-z]:/.test(p)||p.split('/').length>64||p.length>4096)throw Error('檔案相對路徑無效');},ancestors=(p,isDirectory=false)=>{check(p);const parts=p.split('/');for(let n=1;n<parts.length+(isDirectory?1:0);n++)paths.add(parts.slice(0,n).join('/'));};
 entries=entries.map(e=>e?.kind==='directory'&&typeof e.path==='string'?{...e,path:e.path.replace(/\/+$/,'')}:e);
 for(const p of relative)ancestors(p);for(const e of entries){if(!e||!['file','directory'].includes(e.kind))throw Error('目錄結構格式無效');ancestors(e.path,e.kind==='directory');}
 if(paths.size>10000)throw Error('文件夾層級項目過多');const sorted=[...paths].sort(),byPath=new Map(sorted.map((path,i)=>[path,{id:'folder-'+i,path,parentId:null,directCount:0,count:0,extensions:{},samples:[],otherFileCount:0,otherFileSamples:[]}]));
 for(const [path,g]of byPath)if(path)g.parentId=byPath.get(path.includes('/')?path.slice(0,path.lastIndexOf('/')):'').id;
 const byId=new Map([...byPath.values()].map(g=>[g.id,g]));
 const files=relative.map((path,index)=>{const dir=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'',g=byPath.get(dir),name=path.split('/').at(-1),ext=name.includes('.')?name.slice(name.lastIndexOf('.')).toLowerCase():'(無副檔名)';g.directCount++;g.extensions[ext]=(g.extensions[ext]||0)+1;if(g.samples.length<3)g.samples.push(name);for(let current=g;current;current=byId.get(current.parentId))current.count++;
 return {imageId:images[index].id,path,groupId:g.id};});
 const importedPaths=new Set(relative),seen=new Set();for(const e of entries){if(e.kind!=='file'||importedPaths.has(e.path)||seen.has(e.path))continue;seen.add(e.path);const g=byPath.get(e.path.includes('/')?e.path.slice(0,e.path.lastIndexOf('/')):'');g.otherFileCount++;if(g.otherFileSamples.length<3)g.otherFileSamples.push(e.path.split('/').at(-1));}
 return {schema:'agentcv-source-structure-1',totalImages:images.length,groups:[...byPath.values()],files};
}
export const meaningKeys=['sampleModel','category','quality','defectLabels','batch','condition','ignore'];
export function meaningFields(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!meaningKeys.includes(k)))throw Error('資料含義欄位無效');const result={};
 for(const key of meaningKeys){const v=value[key];if(v===undefined)continue;if(key==='ignore'){if(typeof v!=='boolean')throw Error('整理用途必須為布林值');}else if(key==='defectLabels'){if(!Array.isArray(v)||v.length>24||v.some(x=>typeof x!=='string'||x.length>200))throw Error('缺陷標籤格式無效');}else if(typeof v!=='string'||v.length>500||key==='quality'&&!['','OK','NG','UNKNOWN'].includes(v))throw Error('資料含義文字無效');if(typeof v==='string'&&!v.trim())continue;result[key]=typeof v==='string'?v.trim():copy(v);}return result;
}
export function validateSourceSuggestions(response,groups){
 if(!response||!Array.isArray(response.groups)||response.groups.length>groups.length)throw Error('模型沒有返回有效的目錄建議');const ids=new Set(groups.map(g=>g.id)),seen=new Set();
 return response.groups.map(row=>{if(!row||!ids.has(row.id)||seen.has(row.id)||Object.keys(row).some(k=>!['id','meaning','reason','question'].includes(k)))throw Error('模型建議引用了不存在或重複的目錄');seen.add(row.id);if(typeof row.reason!=='string'||row.reason.length>2000||typeof row.question!=='string'||row.question.length>2000)throw Error('模型建議需附依據與待確認問題');return {id:row.id,meaning:meaningFields(row.meaning),reason:row.reason,question:row.question};});
}
export function inheritedMeaning(structure,decisions,groupId){const byId=new Map(structure.groups.map(g=>[g.id,g])),chain=[],seen=new Set();for(let g=byId.get(groupId);g;g=byId.get(g.parentId)){if(seen.has(g.id))throw Error('目錄關係包含循環');seen.add(g.id);chain.unshift(g.id);}let result={};for(const id of chain){const fields=decisions[id];if(fields){if(fields.ignore)continue;for(const [k,v]of Object.entries(fields))if(k!=='ignore')result[k]=copy(v);}}return result;}
export function structurePrompt(groups,totalImages){return {totalImages,directories:groups.map(({id,path,parentId,directCount,count,extensions,samples,otherFileCount,otherFileSamples})=>({id,path,parentId,directCount,count,extensions,samples,otherFileCount,otherFileSamples}))};}

export function structureBatches(structure){const batches=[];let groups=[];for(const group of structure.groups){const proposed=[...groups,group];if(proposed.length>32||JSON.stringify(structurePrompt(proposed,structure.totalImages)).length>40000){if(groups.length)batches.push(structurePrompt(groups,structure.totalImages));groups=[];}groups.push(group);}if(groups.length)batches.push(structurePrompt(groups,structure.totalImages));return batches;}

// Shared validation keeps conversational revisions on the same folder IDs and
// meaning schema as the initial import. A response is always a proposal.
export function validateSourceDiscussion(value,groups){
 if(!value||typeof value.message!=='string'||!value.message.trim()||value.message.length>8000)throw Error('圖像管理員沒有返回有效的對話說明');
 if(value.notes!==undefined&&(typeof value.notes!=='string'||value.notes.length>12000))throw Error('對話備忘格式無效');
 return {message:value.message.trim(),groups:validateSourceSuggestions({...value,groups:value.groups??[]},groups),...(value.notes!==undefined?{notes:value.notes}:{})};
}
export function sourceDiscussionContext(input,groups){
 if(!input||!Array.isArray(input.messages)||!input.messages.length||input.messages.length>100)throw Error('匯入對話內容無效');
 const messages=input.messages.map(m=>{if(!m||!['user','assistant'].includes(m.role)||typeof m.text!=='string'||m.text.length>8000)throw Error('匯入對話訊息無效');return {role:m.role,text:m.text};});
 if(messages.at(-1).role!=='user')throw Error('需要人類的本輪說明');
 const ids=new Set(groups.map(g=>g.id)),draft={};for(const [id,value]of Object.entries(input.draft||{})){if(!ids.has(id))throw Error('草案引用了不存在的目錄');draft[id]=meaningFields(value);}
 if(input.groupId!==null&&input.groupId!==undefined&&!ids.has(input.groupId))throw Error('對話選取的目錄不存在');
 if(input.notes!==undefined&&(typeof input.notes!=='string'||input.notes.length>12000))throw Error('對話備忘格式無效');
 let saved=null;if(input.saved!=null){if(typeof input.saved.at!=='string'||!Number.isFinite(Date.parse(input.saved.at)))throw Error('保存紀錄時間無效');const savedGroups={};for(const [id,value]of Object.entries(input.saved.groups||{})){if(!ids.has(id))throw Error('保存紀錄引用不存在的目錄');savedGroups[id]=meaningFields(value);}saved={at:input.saved.at,groups:savedGroups};}
 return {messages,draft,groupId:input.groupId||null,...(input.notes?{notes:input.notes}:{}),...(saved?{saved}:{})};
}
