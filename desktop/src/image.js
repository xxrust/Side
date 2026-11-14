import {inspectRgbaInput} from './input-inspection.js';

// File identity must not depend on the browser's JPEG/color decoder. Decoded
// RGBA identity remains separate because measurements bind to actual pixels.
const encodedHashes=new Map();let encodedHashBytes=0;
const maxEncodedHashBytes=16*1024*1024,maxEncodedHashEntries=4;
// Keys are exact immutable byte strings, never paths or claimed hashes. A file
// read still happens on every request; altered bytes must get a fresh digest.
export function encodedImageSha256(dataURL){
  if(typeof dataURL!=='string')return hashEncodedImage(dataURL);
  const found=encodedHashes.get(dataURL);
  if(found){encodedHashes.delete(dataURL);encodedHashes.set(dataURL,found);return found;}
  const task=hashEncodedImage(dataURL),bytes=dataURL.length*2;
  if(bytes<=maxEncodedHashBytes){
    while(encodedHashes.size&&(encodedHashes.size>=maxEncodedHashEntries||encodedHashBytes+bytes>maxEncodedHashBytes)){
      const key=encodedHashes.keys().next().value;encodedHashBytes-=key.length*2;encodedHashes.delete(key);
    }
    encodedHashes.set(dataURL,task);encodedHashBytes+=bytes;
    task.catch(()=>{if(encodedHashes.get(dataURL)===task){encodedHashes.delete(dataURL);encodedHashBytes-=bytes;}});
  }
  return task;
}
async function hashEncodedImage(dataURL){
  const base64=typeof dataURL==='string'&&dataURL.startsWith('data:image/')&&dataURL.includes(';base64,')?dataURL.slice(dataURL.indexOf(',')+1):null;
  if(!base64)throw Error('專案圖片不是有效的內嵌圖片');
  let decoded;try{decoded=atob(base64)}catch{throw Error('專案圖片 Base64 編碼無效')}
  const bytes=new Uint8Array(decoded.length);for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// Read dimensions from encoded headers without allocating decoded pixel planes.
// Unknown/legacy formats return null so the caller can use its supplied decoder.
export function encodedImageDimensions(dataURL){
 if(typeof dataURL!=='string'||!dataURL.startsWith('data:image/')||!dataURL.includes(';base64,'))return null;
 let raw;try{raw=atob(dataURL.slice(dataURL.indexOf(',')+1));}catch{return null;}
 const b=Uint8Array.from(raw,c=>c.charCodeAt(0)),v=new DataView(b.buffer),ok=(w,h)=>Number.isSafeInteger(w)&&Number.isSafeInteger(h)&&w>0&&h>0&&w*h<=64_000_000?{width:w,height:h}:null;
 if(b.length>=24&&b[0]===137&&String.fromCharCode(...b.slice(1,4))==='PNG')return ok(v.getUint32(16),v.getUint32(20));
 if(b.length>=26&&b[0]===66&&b[1]===77)return ok(Math.abs(v.getInt32(18,true)),Math.abs(v.getInt32(22,true)));
 if(b.length>=30&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP'){
  const kind=String.fromCharCode(...b.slice(12,16));if(kind==='VP8X')return ok(1+b[24]+(b[25]<<8)+(b[26]<<16),1+b[27]+(b[28]<<8)+(b[29]<<16));
  if(kind==='VP8 '&&b[23]===157&&b[24]===1&&b[25]===42)return ok(v.getUint16(26,true)&16383,v.getUint16(28,true)&16383);
  if(kind==='VP8L'&&b[20]===47){const bits=v.getUint32(21,true);return ok((bits&16383)+1,((bits>>>14)&16383)+1);}
 }
 if(b.length>=4&&b[0]===255&&b[1]===216){
  let orientation=1,size=null;for(let at=2;at+4<=b.length;){if(b[at++]!==255)break;while(at<b.length&&b[at]===255)at++;const marker=b[at++];if(marker===217||marker===218)break;if(marker===0||marker===1||marker>=208&&marker<=215)continue;if(at+2>b.length)break;const length=v.getUint16(at);if(length<2||at+length>b.length)break;
   if(marker===225&&length>=16&&String.fromCharCode(...b.slice(at+2,at+8))==='Exif\0\0'){try{const t=at+8,little=v.getUint16(t)===0x4949,offset=v.getUint32(t+4,little),ifd=t+offset,count=v.getUint16(ifd,little);for(let i=0;i<count;i++){const e=ifd+2+12*i;if(e+12>at+length)break;if(v.getUint16(e,little)===0x112){orientation=v.getUint16(e+8,little);break;}}}catch{}}
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7)size={width:v.getUint16(at+5),height:v.getUint16(at+3)};at+=length;
  }if(size){if([5,6,7,8].includes(orientation))[size.width,size.height]=[size.height,size.width];return ok(size.width,size.height);}
 }
 return null;
}

export async function createImageThumbnail(dataURL,{maxDimension=256}={}){
 if(!Number.isSafeInteger(maxDimension)||maxDimension<32||maxDimension>1024)throw Error('縮圖邊長必須為32至1024像素');
 const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('無法讀取縮圖原件'));image.src=dataURL});
 const scale=Math.min(1,maxDimension/Math.max(image.naturalWidth,image.naturalHeight)),width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0,width,height);const thumbnail={dataURL:canvas.toDataURL('image/png'),width,height};image.src='';return thumbnail;
}

export async function decode(dataURL){
  // QA intervals include asynchronous waiting; they are not synchronous CPU spans.
  const qa=import.meta.env?.VITE_INSPECTION_QA==='1';let phaseStart=qa?performance.now():0;
  const phase=name=>{if(qa){const end=performance.now();globalThis.AgentCVDesktop?.qaFrontendSpan?.('imageDecode.elapsed.'+name,end-phaseStart);phaseStart=end;}};
  const contentSha256=await encodedImageSha256(dataURL);phase('encoded-hash');
  // Some legacy exports labelled BMP bytes as JPEG. Browser decoders need the actual MIME.
  const base64=dataURL.split(',')[1];if(!base64||!dataURL.startsWith('data:image/'))throw Error('專案圖片不是有效的內嵌圖片');
  const prefix=atob(base64.slice(0,16));if(prefix.startsWith('BM'))dataURL='data:image/bmp;base64,'+base64;
  return decodeRasterSource(dataURL,contentSha256,phase);
}

// Native asset reads can supply their original encoded bytes directly. Blob
// and WebCrypto each snapshot the same bytes before yielding; no base64 roundtrip.
export async function decodeBytes(buffer,{mime,expectedSha256}={}){
  const qa=import.meta.env?.VITE_INSPECTION_QA==='1';let phaseStart=qa?performance.now():0;
  const phase=name=>{if(qa){const end=performance.now();globalThis.AgentCVDesktop?.qaFrontendSpan?.('imageDecode.elapsed.'+name,end-phaseStart);phaseStart=end;}};
  if(!(buffer instanceof ArrayBuffer)||!buffer.byteLength)throw Error('原圖位元組無效');
  if(!/^image\/(?:png|jpeg|webp|bmp)$/.test(mime||''))throw Error('原圖類型無效');
  const bytes=new Uint8Array(buffer);
  if(bytes[0]===66&&bytes[1]===77)mime='image/bmp';
  const blob=new Blob([buffer],{type:mime});
  const contentSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(expectedSha256&&expectedSha256!==contentSha256)throw Error('原圖檔案內容雜湊不一致');
  phase('encoded-hash');
  const src=URL.createObjectURL(blob);
  try{return await decodeRasterSource(src,contentSha256,phase);}
  finally{URL.revokeObjectURL(src);}
}

async function decodeRasterSource(src,contentSha256,phase){
  const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('無法解碼圖片'));image.src=src});
  phase('browser-load');
  const width=image.naturalWidth,height=image.naturalHeight;if(!width||!height||width*height>64_000_000)throw Error('單張圖片超過目前 6400 萬像素解碼預算');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,width,height).data;phase('canvas-read');
  // WebCrypto copies the input bytes at invocation; pixel analysis only reads them.
  const pixelDigest=crypto.subtle.digest('SHA-256',rgba);
  const gray=new Float32Array(width*height),inputInspection=inspectRgbaInput(rgba,gray);
  phase('inspection-and-gray');
  const sha256=Array.from(new Uint8Array(await pixelDigest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  phase('pixel-hash-wait');
  const grayProvenance={source:'image.decode@1',applied:!inputInspection.achromatic,formula:inputInspection.achromatic?'Y = R = G = B; copy existing intensity':'0.299*R + 0.587*G + 0.114*B',coefficients:inputInspection.achromatic?null:{red:.299,green:.587,blue:.114},inputRepresentation:'canvas-rgba8',precision:'float32',alphaCompositing:'white',colorManagement:'browser canvas; no explicit linearization or photometric/ICC calibration',inputInspection};
  const decoder={representation:'browser-canvas-rgba8',userAgent:globalThis.navigator?.userAgent||'unknown',alphaCompositing:'white'};
  return {width,height,gray,image,sha256,decodedSha256:sha256,contentSha256,decoder,grayProvenance,inputInspection};
}
