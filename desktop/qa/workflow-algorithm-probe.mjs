// QA probe against production modules; not a substitute for the UI walkthrough.
import {createRequire} from 'node:module';
import {Workspace} from '../src/workspace.js';
const require=createRequire(import.meta.url),{workflowFixtures}=require('./workflow-fixtures.cjs'),{createCanvas,loadImage}=require('../../qa/node_modules/@napi-rs/canvas');
const xs=(await workflowFixtures()).filter(x=>x.variant!=='original'),p=new Workspace();
async function raster(dataURL){const image=await loadImage(dataURL),c=createCanvas(image.width,image.height),ctx=c.getContext('2d');ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,image.width,image.height).data,gray=Float32Array.from({length:image.width*image.height},(_,i)=>rgba[i*4]);return {image,width:image.width,height:image.height,gray,sha256:Buffer.from(await crypto.subtle.digest('SHA-256',rgba)).toString('hex')}}
await p.addImages(xs.map(x=>({...x,dataUrl:x.dataURL})),raster);p.setWorkpiece({name:'Generic assembly'});p.setRegion(p.workflow.workpiece.id,[{x:60,y:50},{x:380,y:50},{x:380,y:250},{x:60,y:250}]);
const check=p.addCheck({name:'Overall width',kind:'width',targetId:p.workflow.workpiece.id,min:315,max:325,unit:'px'});p.buildRecipe();
for(const i of p.data.images){const r=await p.runImage(i.id);console.log(i.name,JSON.stringify(r.checks[check.id]))}
