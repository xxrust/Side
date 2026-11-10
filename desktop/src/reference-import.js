// The picker and drop target share the same real file ingestion, not an
// animation-only path. Prepare all bytes before committing any reference.
export async function readReferenceFiles(files,{readData,onReading=()=>{}}){
 const list=Array.from(files||[]);
 if(list.length>40||list.reduce((sum,file)=>sum+file.size,0)>64*1024*1024)throw Error('參考資料一次最多 40 份、64 MB');
 if(list.some(file=>file.size>32*1024*1024))throw Error('單份參考資料最多 32 MB');
 if(list.length)onReading();
 const records=[];
 for(const file of list){
  const isText=/\.(txt|md|json|csv|gltf)$/i.test(file.name)||file.type.startsWith('text/'),image=file.type.startsWith('image/');
  const text=isText?(await file.text()).slice(0,512000):null;
  records.push({name:file.name,mime:file.type||'application/octet-stream',dataURL:await readData(file),type:isText?'text':'attachment',text,extractedText:text,parseStatus:isText?'text':image?'image':'unparsed',parseNote:isText?'可讀文字':image?'可預覽圖片':'原件保留，尚未解析內容／幾何'});
 }
 return records;
}

export function chooseReferenceFiles(input){
 return new Promise((resolve,reject)=>{
  const finish=files=>{input.onchange=null;input.oncancel=null;input.value='';resolve(files);};
  input.value='';input.onchange=()=>finish(Array.from(input.files||[]));input.oncancel=()=>finish([]);
  try{input.click()}catch(error){input.onchange=null;input.oncancel=null;reject(error)}
 });
}
