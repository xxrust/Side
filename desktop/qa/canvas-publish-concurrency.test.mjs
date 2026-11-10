// Real project/controller, actual camera bytes and locally computed OpenCV edges.
// Only image-loading completion is gated to reproduce a human UI race.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Project} from '../src/model.js';
import {inquiryMethods} from '../src/visual-inquiry-model.js';
const require=createRequire(import.meta.url),esbuild=require('esbuild');
const {loadImage}=require('../../qa/node_modules/@napi-rs/canvas');
const root=fileURLToPath(new URL('..',import.meta.url));
const built=await esbuild.build({entryPoints:[path.join(root,'src/visual-agent-controller.js')],bundle:true,write:false,platform:'node',format:'esm',loader:{'.css':'empty'},logLevel:'silent'});
const {VisualAgentController}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
class InquiryProject extends Project {} Object.assign(InquiryProject.prototype,inquiryMethods);
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}};
let directory,camera,edges,runId;
before(async()=>{
 directory=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-publish-concurrency-'));runId=randomUUID();
 const source=path.join(root,'../assets/7bf06dd945fc7a0bdbf3d34b7b8514e6daec7c331ea3fc8030a8a56ad7009c67.jpg');
 const sha=createHash('sha256').update(await fs.readFile(source)).digest('hex');
 const result=spawnSync(path.join(root,'runtime/python/bin/python3'),['-c',`
import cv2,sys,os
image=cv2.imread(sys.argv[1],cv2.IMREAD_COLOR)
assert image is not None
image=cv2.resize(image,(192,128),interpolation=cv2.INTER_AREA)
edges=cv2.Canny(image,64,128)
assert cv2.imwrite(os.path.join(sys.argv[2],'camera.png'),image)
assert cv2.imwrite(os.path.join(sys.argv[2],'edges.png'),edges)
assert cv2.countNonZero(edges)>0
`,source,directory],{encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr||result.error?.message);
 const asset=async(id,file,kind,source)=>({id,label:file,kind,width:192,height:128,dataURL:'data:image/png;base64,'+(await fs.readFile(path.join(directory,file))).toString('base64'),source});
 camera=await asset('actual-camera','camera.png','original',{imageId:path.basename(source),inputSha256:sha,coordinateSpace:'original-image-pixels'});
 edges=await asset('actual-opencv-edges','edges.png','stage',{imageId:path.basename(source),inputSha256:sha,runId,artifactId:'opencv-canny',coordinateSpace:'asset-pixels',algorithm:'cv2.Canny',parameters:{threshold1:64,threshold2:128}});
});
after(async()=>{if(directory)await fs.rm(directory,{recursive:true,force:true});});
function setup(){
 const project=new InquiryProject(),first=project.addInquiryImage(camera),other=project.createInquiryBoard({title:'Human-selected board'}),otherImage=project.addInquiryImage(camera,{boardId:other.id});project.selectInquiryBoard(first.board.id);
 const entered=deferred(),release=deferred(),fits=[],renders=[];
 const view={opened:true,boardId:first.board.id,historicalSnapshot:null,selected:new Set([first.item.id]),panel:{isConnected:true},canvasSize:()=>({width:900,height:580}),render(){renders.push(this.boardId)},fit(options){fits.push({boardId:this.boardId,options})},async loadImage(asset){const image=await loadImage(asset.dataURL);assert.equal(image.width,asset.width);assert.equal(image.height,asset.height);entered.resolve();await release.promise;}};
 const sources={catalog:()=>[{source_id:'actual-opencv-canny',source:structuredClone(edges.source)}],resolve:async()=>structuredClone(edges)};
 const controller=new VisualAgentController({project,view,sources});
 const switchBoard=()=>{project.selectInquiryBoard(other.id);view.boardId=other.id;view.selected=new Set([otherImage.item.id]);return view.selected;};
 return {project,view,controller,entered,release,fits,renders,switchBoard,boardId:first.board.id,otherId:other.id};
}
const guard={isCurrent:()=>true};

test('placeAsset does not fit or change selection after the human switches boards during actual image loading',async()=>{
 const h=setup(),asset=h.project.registerInquiryAsset(edges,{actor:'agent'});
 const pending=h.controller.placeAsset(asset,h.boardId,guard);await h.entered.promise;const selection=h.switchBoard();h.release.resolve();const receipt=await pending;
 assert.equal(receipt.board_id,h.boardId);assert.equal(receipt.added,true);assert.ok(h.project.ensureInquiry().boards.find(b=>b.id===h.boardId).items.some(item=>item.id===receipt.item_id));assert.equal(h.view.boardId,h.otherId);assert.equal(h.view.selected,selection);assert.deepEqual(h.fits,[]);assert.deepEqual(h.renders,[]);
});

test('explicit-position add_visual_image preserves the new board selection and viewport across loadImage await',async()=>{
 const h=setup();
 const pending=h.controller.action('add_visual_image',{source_id:'actual-opencv-canny',board_id:h.boardId,x:321,y:123},guard);await h.entered.promise;const selection=h.switchBoard();h.release.resolve();const receipt=await pending;
 const item=h.project.ensureInquiry().boards.find(b=>b.id===h.boardId).items.find(item=>item.id===receipt.item_id);
 assert.equal(item.x,321);assert.equal(item.y,123);assert.equal(item.author,'agent');assert.equal(h.view.boardId,h.otherId);assert.equal(h.view.selected,selection);assert.deepEqual(h.fits,[]);assert.deepEqual(h.renders,[]);
 assert.ok(!h.project.data.events.some(event=>event.action==='inquiry_layout_applied'),'explicit coordinates bypass auto layout');
});

test('publishResults rejects an output deleted by the human during loadImage without writing dangling relations',async()=>{
 const h=setup();
 const pending=h.controller.publishResults({pipeline_run_id:runId,board_id:h.boardId},guard);const rejected=assert.rejects(pending,/發布期間被移除/);await h.entered.promise;
 const item=h.project.ensureInquiry().boards.find(b=>b.id===h.boardId).items.find(item=>item.assetId===edges.id);assert.ok(item);h.project.removeInquiryItem(h.boardId,item.id);h.release.resolve();await rejected;
 const board=h.project.ensureInquiry().boards.find(b=>b.id===h.boardId);assert.ok(!board.items.some(candidate=>candidate.id===item.id));assert.deepEqual(h.project.data.canvasRelations||[],[]);assert.ok(!h.project.data.events.some(event=>event.action==='agent_image_relation_added'));assert.deepEqual(h.fits,[]);
});
