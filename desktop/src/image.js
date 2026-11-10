import {inspectRgbaInput} from './input-inspection.js';

// File identity must not depend on the browser's JPEG/color decoder. Decoded
// RGBA identity remains separate because measurements bind to actual pixels.
export async function encodedImageSha256(dataURL){
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
  const contentSha256=await encodedImageSha256(dataURL);
  // Some legacy exports labelled BMP bytes as JPEG. Browser decoders need the actual MIME.
  const base64=dataURL.split(',')[1];if(!base64||!dataURL.startsWith('data:image/'))throw Error('專案圖片不是有效的內嵌圖片');
  const prefix=atob(base64.slice(0,16));if(prefix.startsWith('BM'))dataURL='data:image/bmp;base64,'+base64;
  const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('無法解碼圖片'));image.src=dataURL});
  const width=image.naturalWidth,height=image.naturalHeight;if(!width||!height||width*height>64_000_000)throw Error('單張圖片超過目前 6400 萬像素解碼預算');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,width,height).data,inputInspection=inspectRgbaInput(rgba),gray=new Float32Array(width*height);for(let i=0;i<gray.length;i++)gray[i]=inputInspection.achromatic?rgba[4*i]:rgba[4*i]*.299+rgba[4*i+1]*.587+rgba[4*i+2]*.114;
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const grayProvenance={source:'image.decode@1',applied:!inputInspection.achromatic,formula:inputInspection.achromatic?'Y = R = G = B; copy existing intensity':'0.299*R + 0.587*G + 0.114*B',coefficients:inputInspection.achromatic?null:{red:.299,green:.587,blue:.114},inputRepresentation:'canvas-rgba8',precision:'float32',alphaCompositing:'white',colorManagement:'browser canvas; no explicit linearization or photometric/ICC calibration',inputInspection};
  const decoder={representation:'browser-canvas-rgba8',userAgent:globalThis.navigator?.userAgent||'unknown',alphaCompositing:'white'};
  return {width,height,gray,image,sha256,decodedSha256:sha256,contentSha256,decoder,grayProvenance,inputInspection};
}
