// The UI and agents use the same durable visual library client. Native failures
// propagate; browser IndexedDB is a real local library, never mock placeholders.
const roles=new Set(['schematic','evidence','result','reference']);
const MAX=16*1024*1024;
const text=(v,name,max=8000)=>{if(v===undefined)return '';if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000e-\u001f]/.test(v))throw Error(`${name} 文字格式無效`);return v.trim()};
const labels=(v,name)=>{if(v===undefined)return [];if(!Array.isArray(v)||v.length>64)throw Error(`${name} 最多64項`);return [...new Set(v.map(s=>{const t=text(s,name,120);if(!t)throw Error(`${name} 不可空白`);return t}))]};
const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s)};
function normalize(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('需要圖像資產內容');
 const {content,mimeType,mime,dataURL,...rest}=input;
 if(!rest.dataUrl&&dataURL)rest.dataUrl=dataURL;
 if(!rest.dataUrl&&typeof content==='string'){const kind=mimeType||mime;if(!['text/html','image/svg+xml'].includes(kind))throw Error('文字圖解需要 HTML 或 SVG MIME');rest.dataUrl=`data:${kind};base64,${base64(new TextEncoder().encode(content))}`;}
 return rest;
}
async function browserPayload(input){
 const match=typeof input.dataUrl==='string'&&/^data:([^;,]+)(?:;charset=utf-8)?(;base64)?,([\s\S]*)$/i.exec(input.dataUrl);
 if(!match||!['image/png','image/jpeg','image/webp','image/svg+xml','text/html'].includes(match[1].toLowerCase())||input.dataUrl.length>MAX*1.4+200)throw Error('需要16MB以內本地PNG/JPEG/WebP/SVG/HTML');
 const mime=match[1].toLowerCase();let bytes;
 try{if(match[2]){if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(match[3]))throw Error();bytes=Uint8Array.from(atob(match[3]),c=>c.charCodeAt(0));}else{if(!['text/html','image/svg+xml'].includes(mime))throw Error();bytes=new TextEncoder().encode(decodeURIComponent(match[3]));}}catch{throw Error('本地圖像編碼無效')}
 if(!bytes.length||bytes.length>MAX)throw Error('圖像內容大小無效');
 const ascii=(a,b)=>String.fromCharCode(...bytes.subarray(a,b));
 if(mime==='image/png'&&!(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)&&ascii(12,16)==='IHDR'))throw Error('PNG內容與MIME不符');
 if(mime==='image/jpeg'&&!(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217))throw Error('JPEG內容與MIME不符');
 if(mime==='image/webp'&&!(bytes.length>=16&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'))throw Error('WebP內容與MIME不符');
 if(['image/svg+xml','text/html'].includes(mime)){
  const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  // Preserve exact markup inertly; execution belongs to the isolated renderer.
  if(mime==='image/svg+xml'&&!/<svg(?:\s|>)/i.test(content)||mime==='text/html'&&!/<(?:!doctype\s+html|html|body|div|section|svg|table|canvas|article|main|figure)(?:\s|>)/i.test(content))throw Error('缺少圖解結構');
 }
 const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(input.sha256!==undefined&&input.sha256!==sha256)throw Error('圖像SHA-256不符');
 return {mime,sha256,bytes:bytes.length,dataUrl:`data:${mime};base64,${base64(bytes)}`};
}
function openLibrary(){
 if(!globalThis.indexedDB)throw Error('本環境沒有原生資產庫或IndexedDB儲存能力');
 return new Promise((resolve,reject)=>{const r=indexedDB.open('agentcv-reusable-visual-library',1);r.onupgradeneeded=()=>{r.result.createObjectStore('entries',{keyPath:'id'});r.result.createObjectStore('blobs');};r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result)});
}
function requestValue(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
function browserMeta(input,payload){
 const allowed=['dataUrl','title','role','tags','topics','method','applicability','limits','provenance','sha256'];if(Object.keys(input).some(k=>!allowed.includes(k)))throw Error('圖像資產含未知欄位');
 const role=input.role??'reference';if(!roles.has(role))throw Error('圖像用途無效');
 let provenance=input.provenance||{};if(typeof provenance!=='object'||Array.isArray(provenance))throw Error('來源格式無效');
 const allowedProvenance=['projectId','projectName','runId','artifactId','messageId','sourceSha256','sourceHashes','author','capturedAt','kind','coordinateSpace','nodeId','boardId'];
 provenance=Object.fromEntries(Object.entries(provenance).map(([k,v])=>{if(!allowedProvenance.includes(k))throw Error('來源含未知欄位');return [k,k==='sourceHashes'?labels(v,k):text(v,k,1000)]}));
 for(const hash of [provenance.sourceSha256,...(provenance.sourceHashes||[])].filter(Boolean))if(!/^[a-f0-9]{64}$/i.test(hash))throw Error('來源hash需為SHA-256');
 return {title:text(input.title,'名稱',300)||'未命名圖像',role,tags:labels(input.tags,'標籤'),topics:labels(input.topics,'主題'),method:text(input.method,'方法',1000),applicability:text(input.applicability,'適用條件'),limits:text(input.limits,'限制'),provenance,mime:payload.mime,sha256:payload.sha256,bytes:payload.bytes};
}
export function createVisualAssetLibrary({invoke}={}){
 const native=invoke||(globalThis.__TAURI_INTERNALS__?async(name,args)=>(await import('@tauri-apps/api/core')).invoke(name,args):null);
 const dispatch=async(command,request)=>{if(native)return native(`visual_asset_library_${command}`,{request});
  const db=await openLibrary();try{
   if(command==='save'){
    const payload=await browserPayload(request),meta=browserMeta(request,payload),id='visual-'+payload.sha256;
    return await new Promise((resolve,reject)=>{const tx=db.transaction(['entries','blobs'],'readwrite'),store=tx.objectStore('entries'),read=store.get(id);let result;
     read.onsuccess=()=>{try{const previous=read.result,at=new Date().toISOString(),capture={...meta,at};delete capture.mime;delete capture.sha256;delete capture.bytes;
      const entry={schema:'agentcv-reusable-visual-1',...(previous||meta),id,createdAt:previous?.createdAt||at,updatedAt:at,tags:[...new Set([...(previous?.tags||[]),...meta.tags])],topics:[...new Set([...(previous?.topics||[]),...meta.topics])],captures:[...(previous?.captures||[]),capture].slice(-16),scope:'可重用的歷史圖解／產物；不代表當前圖像的量測證據。',metadataStatus:meta.method&&meta.applicability&&meta.limits?'author-described':'incomplete'};store.put(entry);tx.objectStore('blobs').put(payload.dataUrl,payload.sha256);result={entry,created:!previous,deduplicated:!!previous};}catch(e){tx.abort();reject(e)}};
     tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('圖像保存已取消'));
    });
   }
   if(command==='search'){
    if(Object.keys(request).some(k=>!['query','role','tags','limit','offset'].includes(k)))throw Error('搜尋含未知欄位');
    const query=text(request.query,'搜尋',1000).toLocaleLowerCase().split(/\s+/).filter(Boolean),tags=labels(request.tags,'標籤'),limit=request.limit??24,offset=request.offset??0;
    if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>10000||request.role!==undefined&&!roles.has(request.role))throw Error('搜尋頁面無效');
    const all=await requestValue(db.transaction('entries').objectStore('entries').getAll()),entries=all.filter(e=>(!request.role||e.role===request.role)&&tags.every(t=>e.tags.includes(t))&&query.every(q=>JSON.stringify(e).toLocaleLowerCase().includes(q))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
    return {entries:entries.slice(offset,offset+limit),total:entries.length,offset,limit,contentIncluded:false};
   }
   if(command==='get'){
    if(typeof request.id!=='string'||!/^visual-[a-f0-9]{64}$/.test(request.id)||Object.keys(request).some(k=>k!=='id'))throw Error('圖像資產ID無效');
    const entry=await requestValue(db.transaction('entries').objectStore('entries').get(request.id));if(!entry)throw Error('圖像資產不存在');
    const dataUrl=await requestValue(db.transaction('blobs').objectStore('blobs').get(entry.sha256));const payload=await browserPayload({dataUrl,sha256:entry.sha256});
    const content=['text/html','image/svg+xml'].includes(entry.mime)?new TextDecoder().decode(Uint8Array.from(atob(payload.dataUrl.split(',')[1]),c=>c.charCodeAt(0))):undefined;
    return {entry,dataUrl:payload.dataUrl,...(content===undefined?{}:{content})};
   }
  }finally{db.close()}
 };
 return {save:input=>dispatch('save',normalize(input)),search:(input={})=>dispatch('search',input),get:input=>dispatch('get',input)};
}
