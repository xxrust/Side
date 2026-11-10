// Deterministic generic rasters for end-to-end QA. These are not product examples.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createCanvas,loadImage}=require('../../qa/node_modules/@napi-rs/canvas');
async function workflowFixtures(){
 const output=[];
 for(const variant of ['normal','oversize','missing-feature','unobservable']){
  const cv=createCanvas(480,320),ctx=cv.getContext('2d');ctx.fillStyle='#141414';ctx.fillRect(0,0,480,320);
  const body={x:60,y:50,width:variant==='oversize'?350:320,height:200};
  if(variant!=='unobservable'){
   ctx.fillStyle='#dcdcdc';ctx.fillRect(body.x,body.y,body.width,body.height);
   if(variant!=='missing-feature'){ctx.fillStyle='#333333';ctx.beginPath();ctx.arc(170,150,28,0,Math.PI*2);ctx.fill()}
  }
  const rgba=ctx.getImageData(0,0,480,320).data;
  output.push({name:variant+'.png',variant,width:480,height:320,dataURL:cv.toDataURL('image/png'),sha256:crypto.createHash('sha256').update(rgba).digest('hex'),expected:{width:variant==='unobservable'?'UNKNOWN':variant==='oversize'?'NG':'OK',feature:variant==='unobservable'?'UNKNOWN':variant==='missing-feature'?'NG':'OK'},geometry:variant==='unobservable'?null:{body,feature:variant==='missing-feature'?null:{x:170,y:150,radius:28}}});
 }
 const source=path.resolve(__dirname,'../../qa/user-replay/source.png');
 if(fs.existsSync(source)){
  const image=await loadImage(source),cv=createCanvas(image.width,image.height),ctx=cv.getContext('2d');ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,image.width,image.height).data;
  output.push({name:'original-workpiece.png',variant:'original',width:image.width,height:image.height,dataURL:cv.toDataURL('image/png'),sha256:crypto.createHash('sha256').update(rgba).digest('hex'),expected:{}});
 }
 return output;
}
module.exports={workflowFixtures};
