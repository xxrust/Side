// Session tests use real files and the imported OpenCV sample's actual bytes.
// Deferred disk writes exercise ordering only; no model or algorithm is mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {AppSession} from '../src/app-session.js';
const image='data:image/jpeg;base64,'+(await fs.readFile(new URL('../../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg',import.meta.url))).toString('base64');
const project=name=>({schema:'agentcv-workspace-0.9',images:[{id:'source',name,dataURL:image}],activeId:'source',chat:[],visualInquiry:{boards:[],assets:[]}});
const copy=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function storage(initial){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-app-session-')),file=path.join(dir,'last-session.json'),writes=[];let sequence=0,gate=null;
 if(initial!==undefined)await fs.writeFile(file,initial);
 return {file,writes,setGate(value){gate=value;},async read(){try{return await fs.readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}},async write(content){const held=gate;gate=null;if(held){held.started.resolve();await held.release.promise;}const temporary=path.join(dir,'write-'+(++sequence));await fs.writeFile(temporary,content);await fs.rename(temporary,file);writes.push(JSON.parse(content));return {path:file,bytes:Buffer.byteLength(content)};},async close(){await fs.rm(dir,{recursive:true,force:true});}};
}
test('real stored workspace restores exact image bytes, selected view and unsaved draft with saved baseline',async()=>{
 const saved=project('saved.jpg'),draft=project('draft.jpg'),ui={page:6,boardId:'node-board',zoom:1.7,pan:{x:32,y:65}};
 const s=await storage(JSON.stringify({schema:'agentcv-app-session-1',project:draft,savedProject:saved,ui,dirty:true,projectPath:'/real/source.agentcv.json'}));let restored;
 try{const session=new AppSession({store:s,capture:()=>null,restore:value=>restored=value});await session.ready;assert.deepEqual(restored.project,draft);assert.equal(restored.project.images[0].dataURL,image);assert.deepEqual(restored.ui,ui);assert.deepEqual(session.savedProject,saved);assert.equal(session.projectPath,'/real/source.agentcv.json');assert.equal(s.writes.length,0);}finally{await s.close();}
});
test('corrupt startup state is reported and no empty automatic snapshot replaces the actual damaged file',async()=>{
 const broken='{truncated-session',s=await storage(broken),errors=[];let captures=0;
 try{const session=new AppSession({store:s,capture:()=>{captures++;return {project:project('blank'),ui:{},dirty:false};},restore:()=>assert.fail('Corrupt data must not restore'),onError:error=>errors.push(error),delay:5});await session.ready;session.schedule();assert.equal(await session.flush(),false);await new Promise(r=>setTimeout(r,15));assert.equal(captures,0);assert.equal(s.writes.length,0);assert.equal(await fs.readFile(s.file,'utf8'),broken);assert.equal(session.blocked,true);assert.match(errors[0],/原紀錄已保留/);session.acceptProject(project('explicit-import'));await session.flush();clearTimeout(session.timer);assert.equal(JSON.parse(await fs.readFile(s.file,'utf8')).project.images[0].name,'blank','explicit acceptance permits a current snapshot again');}finally{await s.close();}
});
test('concurrent real disk writes retain newest captured draft in strict dispatch order',async()=>{
 const s=await storage(),firstStarted=deferred(),firstRelease=deferred();let name='first.jpg';
 try{const session=new AppSession({store:s,capture:()=>({project:project(name),ui:{page:6},dirty:true}),restore:()=>{}});await session.ready;s.setGate({started:firstStarted,release:firstRelease});const first=session.flush();await firstStarted.promise;name='second.jpg';const second=session.flush();await Promise.resolve();firstRelease.resolve();await Promise.all([first,second]);assert.deepEqual(s.writes.map(v=>v.project.images[0].name),['first.jpg','second.jpg']);assert.equal(JSON.parse(await fs.readFile(s.file,'utf8')).project.images[0].name,'second.jpg');}finally{await s.close();}
});
test('discard serializes behind an in-flight draft and blocks newly scheduled draft writes before saving the baseline',async()=>{
 const s=await storage(),started=deferred(),release=deferred(),saved={...project('saved.jpg'),workspaceView:{page:6,inquiry:{opened:true,boardId:'saved-board',zoom:1.5}}};let name='unsaved.jpg';
 try{const session=new AppSession({store:s,capture:()=>({project:project(name),ui:{page:6},dirty:true}),restore:()=>{},delay:5});await session.ready;session.acceptProject(saved,'/original/project.json');clearTimeout(session.timer);saved.images[0].name='caller-mutated';s.setGate({started,release});const draftWrite=session.flush();await started.promise;const discard=session.discard(project('empty'));await Promise.resolve();name='late-unsaved.jpg';session.schedule();assert.equal(await session.flush(),false);release.resolve();await Promise.all([draftWrite,discard]);await new Promise(r=>setTimeout(r,15));assert.deepEqual(s.writes.map(v=>v.project.images[0].name),['unsaved.jpg','saved.jpg']);const current=JSON.parse(await fs.readFile(s.file,'utf8'));assert.equal(current.dirty,false);assert.equal(current.projectPath,'/original/project.json');assert.deepEqual(current.ui,saved.workspaceView,'discard restores the view saved with the baseline rather than the discarded draft view');assert.equal(session.blocked,true);}finally{await s.close();}
});
test('a deliberately accepted later project can write again after discard even if equal to a previously captured draft',async()=>{
 const s=await storage();let value={project:project('draft.jpg'),ui:{page:6},dirty:true};
 try{const session=new AppSession({store:s,capture:()=>copy(value),restore:()=>{}});await session.ready;session.acceptProject(project('baseline'));clearTimeout(session.timer);await session.flush();await session.discard(project('empty'));session.acceptProject(project('draft.jpg'));clearTimeout(session.timer);assert.equal(await session.flush(),true);assert.equal(JSON.parse(await fs.readFile(s.file,'utf8')).project.images[0].name,'draft.jpg');}finally{await s.close();}
});
test('undoing to an already saved state while another snapshot is writing still saves the final reverted state',async()=>{
 const s=await storage();let name='A.jpg';const started=deferred(),release=deferred();
 try{const session=new AppSession({store:s,capture:()=>({project:project(name),ui:{page:6},dirty:true}),restore:()=>{}});await session.ready;await session.flush();s.setGate({started,release});name='B.jpg';const middle=session.flush();await started.promise;name='A.jpg';const reverted=session.flush();await Promise.resolve();release.resolve();await Promise.all([middle,reverted]);assert.deepEqual(s.writes.map(row=>row.project.images[0].name),['A.jpg','B.jpg','A.jpg']);assert.equal(JSON.parse(await fs.readFile(s.file,'utf8')).project.images[0].name,'A.jpg');assert.equal(session.pendingWrites,0);}finally{await s.close();}
});
test('cached saved baseline writes exactly the bytes of single-pass encoding and refreshes when the baseline changes',async()=>{
 const {serializeProject}=await import('../src/project-serialization.js');
 const raw=[],store={async read(){return null;},async write(content){raw.push(content);return {};}};
 let value={project:project('draft.jpg'),ui:{page:6},dirty:true};
 const session=new AppSession({store,capture:()=>value,restore:()=>{}});await session.ready;
 session.acceptProject(project('saved-1.jpg'),'/p.agentcv');clearTimeout(session.timer);
 // Reference: the previous single-pass encoder (baseline last, then the timestamp appended).
 const expectedFor=(captured,content)=>{const single=serializeProject({schema:'agentcv-app-session-1',...captured,projectPath:'/p.agentcv',savedAt:undefined,...(captured.dirty?{savedProject:session.savedProject}:{})});return single.slice(0,-1)+',"savedAt":'+JSON.stringify(JSON.parse(content).savedAt)+'}';};
 await session.flush();assert.equal(raw[0],expectedFor(value,raw[0]));
 value={project:project('draft-2.jpg'),ui:{page:6},dirty:true};await session.flush();assert.equal(raw[1],expectedFor(value,raw[1]));
 session.acceptProject(project('saved-2.jpg'),'/p.agentcv');clearTimeout(session.timer);await session.flush();
 assert.equal(raw[2],expectedFor(value,raw[2]));assert.equal(JSON.parse(raw[2]).savedProject.images[0].name,'saved-2.jpg');
 value={project:project('clean.jpg'),ui:{page:1},dirty:false};await session.flush();
 assert.equal(JSON.parse(raw[3]).savedProject,undefined);
});
