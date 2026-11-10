// Pure AgentCV image transport and model capability checks. No SDK or model calls.
export function imageParts(values){
  if(!Array.isArray(values)||values.length>16)throw Error('圖像輸入必須為陣列，且最多 16 張');
  let total=0;return values.map(value=>{
    if(value?.type!=='image'||!['image/png','image/jpeg','image/webp'].includes(value.mimeType)||typeof value.data!=='string')throw Error('圖像輸入缺少本地 PNG、JPEG 或 WebP 像素');
    const data=value.data.replace(/\s/g,'');total+=data.length;
    if(!data||data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data)||data.length>44_739_244||total>89_478_488)throw Error('圖像編碼無效或超過傳送上限');
    const header=Buffer.from(data.slice(0,32),'base64'),mime=value.mimeType;
    if(mime==='image/png'&&!header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||mime==='image/jpeg'&&!(header[0]===255&&header[1]===216&&header[2]===255)||mime==='image/webp'&&!(header.toString('ascii',0,4)==='RIFF'&&header.toString('ascii',8,12)==='WEBP'))throw Error('圖像內容與宣告格式不符');
    return {type:'image',data,mimeType:mime};
  });
}
export function requireVision(model){if(!Array.isArray(model?.input)||!model.input.includes('image'))throw Error('目前模型未聲明支援圖像輸入；請保留草稿並切換支援圖像的模型')}
export function visualToolResult(value,model){
  const images=imageParts(value?._visualImages||[]);if(images.length)requireVision(model);
  const details=JSON.parse(JSON.stringify(value??null,(key,v)=>key==='_visualImages'||/^(?:dataURL|dataUrl|base64)$/.test(key)||typeof v==='string'&&/^data:image\//i.test(v)||key==='data'&&typeof v==='string'&&/^[A-Za-z0-9+/=\s]+$/.test(v)?undefined:v));
  return {content:[{type:'text',text:JSON.stringify(details)},...images],details};
}
