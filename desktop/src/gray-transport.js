// Keep native pipeline IPC binary-sized. JSON arrays turn one byte into a
// multi-character number plus separators; base64-u8 keeps the request small
// while remaining portable between the browser and the Rust host.
export function encodeGray8(bytes){
 if(!bytes||typeof bytes.length!=='number')throw Error('gray8 像素資料無效');
 const source=bytes instanceof Uint8Array?bytes:Uint8Array.from(bytes,value=>Math.max(0,Math.min(255,Math.round(value))));
 let binary='';
 const chunk=0x8000;
 for(let offset=0;offset<source.length;offset+=chunk)binary+=String.fromCharCode(...source.subarray(offset,offset+chunk));
 if(typeof btoa!=='function')throw Error('目前環境不支援 gray8 base64 編碼');
 return {grayEncoding:'base64-u8',grayBase64:btoa(binary)};
}

export function nativeGrayImage(raster,extra={}){
 if(!raster?.gray)throw Error('Rust 原生方案需要已解碼的 gray8 原圖');
 return {width:raster.width,height:raster.height,...encodeGray8(raster.gray),...extra};
}
