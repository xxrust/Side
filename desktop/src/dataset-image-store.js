// An image source is an indexed collection of immutable encoded assets. Only
// the selected inspection unit is decoded; canvas objects are not the dataset.
import {encodedImageSha256,createImageThumbnail} from './image.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const positive=(value,fallback)=>Number.isSafeInteger(value)&&value>0?value:fallback;
export function imageAssetIdentity(record){
 if(!record)return null;
 const digest=record.contentSha256||record.assetRef?.sha256;
 return {imageId:record.id,width:record.width,height:record.height,...(digest?{contentSha256:digest}:{legacyPixelSha256:record.sha256||null,legacyEncodedSource:record.dataURL||null})};
}
export function validImageAssetRef(ref){
 return !!ref&&typeof ref==='object'&&!Array.isArray(ref)&&typeof ref.root==='string'&&ref.root.length>0&&typeof ref.$asset==='string'&&/^assets\/[a-f0-9]{64}\.[a-z0-9]+$/.test(ref.$asset)&&/^image\/(?:png|jpeg|webp|bmp)$/.test(ref.mime||'')&&/^[a-f0-9]{64}$/.test(ref.sha256||'')&&Number.isSafeInteger(ref.size)&&ref.size>0&&ref.$asset.startsWith('assets/'+ref.sha256+'.');
}
export function rasterBytes(raster){
 const dimensions=positive(raster?.width,0)*positive(raster?.height,0);
 // Browser Image pixels are resident even though their bytes are not exposed.
 return (raster?.gray?.byteLength||0)+(raster?.rgba?.byteLength||0)+(raster?.image?dimensions*4:0);
}
export class RasterCache extends Map{
 constructor({maxEntries=8,maxBytes=256*1024*1024,isPinned=()=>false}={}){super();this.maxEntries=positive(maxEntries,8);this.maxBytes=positive(maxBytes,256*1024*1024);this.isPinned=isPinned;this.bytes=0;this.evictions=0;}
 get(id){if(!super.has(id))return undefined;const value=super.get(id);super.delete(id);super.set(id,value);return value;}
 peek(id){return super.get(id);}
 delete(id){const value=super.get(id);if(value)this.bytes-=rasterBytes(value);return super.delete(id);}
 clear(){super.clear();this.bytes=0;}
 set(id,value){
  const bytes=rasterBytes(value);if(bytes>this.maxBytes)throw Error(`圖片解碼需要約 ${Math.ceil(bytes/1048576)} MB，超過目前像素快取預算；請調整資源預算。`);
  const old=super.get(id),nextBytes=this.bytes-(old?rasterBytes(old):0)+bytes;
  const candidates=[...super.keys()].filter(key=>key!==id&&!this.isPinned(key));let needed=nextBytes,entries=this.size-(old?1:0)+1;
  const evict=[];for(const key of candidates){if(needed<=this.maxBytes&&entries<=this.maxEntries)break;needed-=rasterBytes(super.get(key));entries--;evict.push(key);}
  // A workpiece can use several cameras. Never silently evict a leased input.
  if(needed>this.maxBytes)throw Error('目前工件的必要圖像加上顯示圖超過像素快取預算；請調整資源預算。');
  for(const key of evict){this.delete(key);this.evictions++;}if(old)this.delete(id);super.set(id,value);this.bytes+=bytes;return this;
 }
 trim(){for(const key of [...super.keys()]){if(this.size<=this.maxEntries&&this.bytes<=this.maxBytes)break;if(!this.isPinned(key)){this.delete(key);this.evictions++;}}}
}
export class DatasetImageStore{
 constructor(project,options={}){this.project=project;this.generation=0;this.pending=new Map();this.leases=new Map();this.thumbnails=new Map();this.thumbnailPending=new Map();this.thumbnailBytes=0;this.loads=0;this.tail=Promise.resolve();this.thumbnailTail=Promise.resolve();this.configure(options);}
 configure(options={}){if(options.readAsset)this.readAsset=options.readAsset;if(options.decode)this.decode=options.decode;this.thumbnailer=options.thumbnailer||this.thumbnailer||createImageThumbnail;if(!this.cache)this.cache=new RasterCache({maxEntries:options.cacheEntries,maxBytes:options.cacheBytes,isPinned:id=>this.pinned(id)});else{this.cache.maxEntries=positive(options.cacheEntries,this.cache.maxEntries);this.cache.maxBytes=positive(options.cacheBytes,this.cache.maxBytes);this.cache.trim();}return this;}
 pinned(id){return this.project.data?.activeId===id||(this.leases.get(id)||0)>0;}
 reset({keepCache=false}={}){this.generation++;this.pending.clear();this.leases.clear();this.thumbnails.clear();this.thumbnailPending.clear();this.thumbnailBytes=0;if(!keepCache)this.cache.clear();else for(const [id,raster]of this.cache){const image=this.project.imageRecord(id);if(!image||image.contentSha256&&raster.contentSha256!==image.contentSha256||!image.contentSha256&&raster.sha256!==image.sha256)this.cache.delete(id);}this.loads=0;}
 pin(ids){const generation=this.generation,distinct=[...new Set(ids)];for(const id of distinct){if(!this.project.imageRecord(id))throw Error('必要圖像不存在：'+id);}for(const id of distinct)this.leases.set(id,(this.leases.get(id)||0)+1);let released=false;return()=>{if(released)return;released=true;if(generation!==this.generation)return;for(const id of distinct){const n=(this.leases.get(id)||0)-1;if(n>0)this.leases.set(id,n);else this.leases.delete(id);}this.cache.trim();};}
 async read(record){
  if(!record)throw Error('圖片不存在');let url=record.dataURL;
  if(!url&&record.assetRef){if(!validImageAssetRef(record.assetRef))throw Error('圖片資產引用格式錯誤');if(!this.readAsset)throw Error('尚未連接圖像資產讀取器');const result=await this.readAsset(copy(record.assetRef),{imageId:record.id});url=typeof result==='string'?result:result?.dataURL||result?.dataUrl;}
  if(typeof url!=='string'||!url)throw Error('原圖沒有可讀取的內容');
  if(url.startsWith('data:image/')){const digest=await encodedImageSha256(url),expected=record.contentSha256||record.assetRef?.sha256;if(expected&&expected!==digest)throw Error(`原圖檔案內容雜湊不一致：${record.name||record.id}`);}
  return url;
 }
 ensure(id){
  const cached=this.cache.get(id);if(cached)return Promise.resolve(cached);if(this.pending.has(id))return this.pending.get(id);
  const record=this.project.imageRecord(id),generation=this.generation,epoch=this.project.epoch;if(!record)return Promise.reject(Error('圖片不存在：'+id));if(!this.decode)return Promise.reject(Error('尚未連接圖像解碼器'));
  const current=()=>generation===this.generation&&epoch===this.project.epoch&&this.project.imageRecord(id)===record;
  const task=this.tail.catch(()=>{}).then(async()=>{if(!current())throw Error('專案已改變，未載入舊圖片');const again=this.cache.get(id);if(again)return again;const url=await this.read(record);if(!current())throw Error('專案已改變，未載入舊圖片');const raster=await this.decode(url);if(!current())throw Error('專案已改變，未套用舊圖片像素');this.project.acceptDecodedImage(record,raster);this.cache.set(id,raster);this.loads++;return raster;});
  this.tail=task;this.pending.set(id,task);task.then(()=>{if(this.pending.get(id)===task)this.pending.delete(id);},()=>{if(this.pending.get(id)===task)this.pending.delete(id);});return task;
 }
 thumbnail(id,{maxDimension=256}={}){
  const record=this.project.imageRecord(id);if(!record)return Promise.reject(Error('圖片不存在'));const key=id+':'+maxDimension,generation=this.generation;
  if(this.thumbnails.has(key)){const value=this.thumbnails.get(key);this.thumbnails.delete(key);this.thumbnails.set(key,value);return Promise.resolve(value);}
  if(this.thumbnailPending.has(key))return this.thumbnailPending.get(key);
  const task=this.thumbnailTail.catch(()=>{}).then(async()=>{
   if(generation!==this.generation||this.project.imageRecord(id)!==record)throw Error('專案已改變，未讀取舊縮圖');
   const rendered=await this.thumbnailer(await this.read(record),{maxDimension});if(generation!==this.generation||this.project.imageRecord(id)!==record)throw Error('專案已改變，未套用舊縮圖');
   const value={...rendered,imageId:id,contentSha256:record.contentSha256||record.assetRef?.sha256,role:'thumbnail',coordinateSpace:'thumbnail-pixels',scaleX:rendered.width/record.width,scaleY:rendered.height/record.height};const bytes=value.dataURL.length*2;
   while(this.thumbnails.size&&(this.thumbnails.size>=64||this.thumbnailBytes+bytes>16*1024*1024)){const first=this.thumbnails.keys().next().value;this.thumbnailBytes-=this.thumbnails.get(first).dataURL.length*2;this.thumbnails.delete(first);}
   if(bytes<=16*1024*1024){this.thumbnails.set(key,value);this.thumbnailBytes+=bytes;}return value;
  });this.thumbnailTail=task;this.thumbnailPending.set(key,task);task.then(()=>{if(this.thumbnailPending.get(key)===task)this.thumbnailPending.delete(key)},()=>{if(this.thumbnailPending.get(key)===task)this.thumbnailPending.delete(key)});return task;
 }

 info(){return {schema:'agentcv-image-cache-1',entries:this.cache.size,bytes:this.cache.bytes,maxEntries:this.cache.maxEntries,maxBytes:this.cache.maxBytes,pinned:[...new Set([this.project.data?.activeId,...this.leases.keys()].filter(Boolean))],loads:this.loads,evictions:this.cache.evictions,pending:this.pending.size,thumbnailEntries:this.thumbnails.size,thumbnailBytes:this.thumbnailBytes};}
}
