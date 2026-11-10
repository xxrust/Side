// Native, cross-project visual knowledge storage. Content is local inline data;
// callers cannot choose paths, fetch URLs, or promote historical evidence to facts.
// HTML/SVG source (including code) is archived inertly and returned unchanged;
// only the isolated renderer decides whether/how to execute it.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const MAX_BYTES=16*1024*1024,MAX_ENTRIES=10000;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const roles=new Set(['schematic','evidence','result','reference']);
const mimes=new Set(['image/png','image/jpeg','image/webp','image/svg+xml','text/html']);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=s=>{throw Error(`Visual asset library: ${s}`)};
const text=(x,name,max=8000,fallback='')=>{if(x===undefined)return fallback;if(typeof x!=='string'||x.length>max||/[\u0000-\u0008\u000e-\u001f]/.test(x))fail(`${name} must be text up to ${max} characters`);return x.trim()};
function strings(value,name){if(value===undefined)return [];if(!Array.isArray(value)||value.length>64)fail(`${name} must contain at most 64 strings`);return [...new Set(value.map(v=>{const s=text(v,name,120);if(!s)fail(`${name} cannot contain empty labels`);return s}))]}
function provenance(value){
 if(value===undefined)return {};
 if(!object(value))fail('provenance must be an object');
 const allowed=['projectId','projectName','runId','artifactId','messageId','sourceSha256','sourceHashes','author','capturedAt','kind','coordinateSpace','nodeId','boardId'];
 for(const k of Object.keys(value))if(!allowed.includes(k))fail(`unsupported provenance field ${k}`);
 const result={};for(const [k,v]of Object.entries(value))result[k]=k==='sourceHashes'?strings(v,'sourceHashes'):text(v,`provenance.${k}`,1000);
 for(const hash of [result.sourceSha256,...(result.sourceHashes||[])].filter(Boolean))if(!/^[a-f0-9]{64}$/i.test(hash))fail('source hashes must be SHA-256');
 return result;
}
function verifyInline(dataUrl,providedHash){
 if(typeof dataUrl!=='string'||dataUrl.length>MAX_BYTES*1.4+200)fail('inline content exceeds 16 MB');
 const match=/^data:([^;,]+)(?:;charset=utf-8)?(;base64)?,([\s\S]*)$/i.exec(dataUrl);
 if(!match||!mimes.has(match[1].toLowerCase()))fail('only inline PNG, JPEG, WebP, SVG or HTML are supported');
 const mime=match[1].toLowerCase();let bytes;
 if(match[2]){if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(match[3]))fail('invalid base64 content');bytes=Buffer.from(match[3],'base64')}
 else{if(!['image/svg+xml','text/html'].includes(mime))fail('raster content must be base64');try{bytes=Buffer.from(decodeURIComponent(match[3]),'utf8')}catch{fail('invalid inline text encoding')}}
 if(!bytes.length||bytes.length>MAX_BYTES)fail('inline content must be 1 byte to 16 MB');
 if(mime==='image/png'&&!(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'))fail('PNG signature does not match MIME');
 if(mime==='image/jpeg'&&!(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217))fail('JPEG signature does not match MIME');
 if(mime==='image/webp'&&!(bytes.length>=16&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'))fail('WebP signature does not match MIME');
 let content;
 if(['image/svg+xml','text/html'].includes(mime)){
  try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{fail('inline graphic must be UTF-8')}
  if(mime==='image/svg+xml'&&!/<svg(?:\s|>)/i.test(content))fail('SVG root missing');
  if(mime==='text/html'&&!/<(?:!doctype\s+html|html|body|div|section|svg|table|canvas|article|main|figure)(?:\s|>)/i.test(content))fail('HTML markup missing');
  // Do not execute, fetch, sanitize or rewrite archived markup. The
  // ChatArtifactView isolated renderer supplies its own sandbox and network CSP.
 }
 const sha256=digest(bytes);if(providedHash!==undefined&&providedHash!==sha256)fail('content SHA-256 mismatch');
 return {mime,bytes,sha256,content};
}
export function defaultVisualAssetLibraryRoot(){return process.env.AGENTCV_ASSET_LIBRARY_DIR||path.join(os.homedir(),process.platform==='darwin'?'Library/Application Support/studio.agentcv.desktop':'.local/share/agentcv','visual-library')}
async function ensureRoot(root){root=path.resolve(root);await fs.mkdir(root,{recursive:true});const canonical=await fs.realpath(root);for(const dir of ['entries','blobs','locks']){const target=path.join(canonical,dir);await fs.mkdir(target,{recursive:true});if(await fs.realpath(target)!==target)fail('library directories must not be symlinks')}return canonical}
async function atomic(filename,bytes){const temporary=filename+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temporary,bytes,{flag:'wx',mode:0o600});await fs.rename(temporary,filename)}finally{await fs.rm(temporary,{force:true})}}
async function locked(root,id,fn){const lock=path.join(root,'locks',id);let acquired=false;for(let i=0;i<100;i++){try{await fs.mkdir(lock);acquired=true;break}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,50))}}if(!acquired)fail('asset is busy; retry shortly');try{return await fn()}finally{await fs.rmdir(lock)}}
function idOf(id){if(typeof id!=='string'||!/^visual-[a-f0-9]{64}$/.test(id))fail('invalid asset ID');return id}
async function readEntry(root,id){const filename=path.join(root,'entries',idOf(id)+'.json');const stat=await fs.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128*1024)fail('invalid entry metadata');const entry=JSON.parse(await fs.readFile(filename,'utf8'));if(entry.id!==id||entry.sha256!==id.slice(7)||entry.schema!=='agentcv-reusable-visual-1')fail('asset metadata identity mismatch');return entry}
function metadata(input,payload){
 const title=text(input.title,'title',300)||'未命名圖像',role=input.role??'reference';if(!roles.has(role))fail('invalid asset role');
 return {title,role,tags:strings(input.tags,'tags'),topics:strings(input.topics,'topics'),method:text(input.method,'method',1000),applicability:text(input.applicability,'applicability'),limits:text(input.limits,'limits'),provenance:provenance(input.provenance),mime:payload.mime,sha256:payload.sha256,bytes:payload.bytes.length};
}
export async function saveVisualAsset(input,{root=defaultVisualAssetLibraryRoot()}={}){
 if(!object(input)||Object.keys(input).some(k=>!['dataUrl','title','role','tags','topics','method','applicability','limits','provenance','sha256'].includes(k)))fail('save accepts inline content and documented metadata only');
 const payload=verifyInline(input.dataUrl,input.sha256),meta=metadata(input,payload);root=await ensureRoot(root);const id='visual-'+payload.sha256;
 return locked(root,id,async()=>{
  let previous;try{previous=await readEntry(root,id)}catch(e){if(e.code!=='ENOENT')throw e}
  const blob=path.join(root,'blobs',payload.sha256);try{await fs.writeFile(blob,payload.bytes,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;const stat=await fs.lstat(blob);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES||digest(await fs.readFile(blob))!==payload.sha256)fail('existing content blob failed integrity verification')}
  const now=new Date().toISOString(),capture={...meta,at:now};delete capture.sha256;delete capture.bytes;delete capture.mime;
  const entry={schema:'agentcv-reusable-visual-1',...(previous||meta),id,sha256:payload.sha256,mime:payload.mime,bytes:payload.bytes.length,createdAt:previous?.createdAt||now,updatedAt:now,tags:[...new Set([...(previous?.tags||[]),...meta.tags])],topics:[...new Set([...(previous?.topics||[]),...meta.topics])],captures:[...(previous?.captures||[]),capture].slice(-64),scope:'可重用的歷史圖解／產物；不代表當前圖像的量測證據。',metadataStatus:meta.method&&meta.applicability&&meta.limits?'author-described':'incomplete'};
  if(!previous&&(await fs.readdir(path.join(root,'entries'))).filter(f=>f.endsWith('.json')).length>=MAX_ENTRIES)fail('asset library limit reached');
  while(Buffer.byteLength(JSON.stringify(entry))>120*1024&&entry.captures.length>1)entry.captures.shift();
  if(Buffer.byteLength(JSON.stringify(entry))>120*1024)fail('metadata exceeds library entry limit');
  await atomic(path.join(root,'entries',id+'.json'),JSON.stringify(entry));return {entry,created:!previous,deduplicated:!!previous};
 });
}
export async function searchVisualAssets(input={},{root=defaultVisualAssetLibraryRoot()}={}){
 if(!object(input)||Object.keys(input).some(k=>!['query','role','tags','limit','offset'].includes(k)))fail('unsupported search field');
 const query=text(input.query,'query',1000).toLocaleLowerCase().split(/\s+/).filter(Boolean),tags=strings(input.tags,'tags'),role=input.role;
 if(role!==undefined&&!roles.has(role))fail('invalid role');
 const limit=input.limit??24,offset=input.offset??0;if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>MAX_ENTRIES)fail('invalid search page');
 root=await ensureRoot(root);const files=(await fs.readdir(path.join(root,'entries'))).filter(f=>/^visual-[a-f0-9]{64}\.json$/.test(f));if(files.length>MAX_ENTRIES)fail('asset library metadata limit exceeded');
 const entries=[];for(const file of files){const entry=await readEntry(root,file.slice(0,-5));const haystack=JSON.stringify(entry).toLocaleLowerCase();if((!role||entry.role===role)&&tags.every(t=>entry.tags.includes(t))&&query.every(word=>haystack.includes(word)))entries.push(entry)}
 entries.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));return {entries:entries.slice(offset,offset+limit),total:entries.length,offset,limit,contentIncluded:false};
}
export async function getVisualAsset(input,{root=defaultVisualAssetLibraryRoot()}={}){
 if(!object(input)||Object.keys(input).some(k=>k!=='id'))fail('get accepts an asset ID only');root=await ensureRoot(root);const entry=await readEntry(root,input.id),blob=path.join(root,'blobs',entry.sha256),stat=await fs.lstat(blob);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)fail('invalid asset blob');const bytes=await fs.readFile(blob);if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)fail('saved content integrity check failed');
 const dataUrl=`data:${entry.mime};base64,${bytes.toString('base64')}`;verifyInline(dataUrl,entry.sha256);
 return {entry,dataUrl,...(['image/svg+xml','text/html'].includes(entry.mime)?{content:new TextDecoder().decode(bytes)}:{})};
}
async function cli(){const command=process.argv[2],fn={'--save':saveVisualAsset,'--search':searchVisualAssets,'--get':getVisualAsset}[command];if(!fn)fail('usage --save|--search|--get');let text='';for await(const part of process.stdin){text+=part;if(text.length>MAX_BYTES*1.4+100000)fail('request too large')}process.stdout.write(JSON.stringify(await fn(JSON.parse(text||'{}')))+'\n')}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))cli().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1});
