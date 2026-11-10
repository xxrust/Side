// Uses the installed Pi SDK with a fresh, empty HOME. Never logs in or prompts a model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import path from 'node:path';
const entry=process.env.AGENTCV_PI_ENTRY||path.join(homedir(),'.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js');
let installed=true;try{await access(entry)}catch{installed=false}
test('bridge without credentials keeps login, help and reset available with model:null',{skip:!installed,timeout:30000},async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'agentcv-pi-empty-'));
 const child=spawn(process.execPath,['scripts/pi-bridge.mjs'],{env:{PATH:process.env.PATH,HOME:root,PI_CODING_AGENT_DIR:root,AGENTCV_PI_ENTRY:entry,PI_OFFLINE:'1',PI_TELEMETRY:'0'},stdio:['pipe','pipe','pipe']});
 const events=[],waiters=[];let buffer='';
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const e=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);events.push(e);for(const w of [...waiters])if(w.filter(e)){waiters.splice(waiters.indexOf(w),1);clearTimeout(w.timer);w.resolve(e)}}});
 child.stderr.resume();
 const wait=filter=>new Promise((resolve,reject)=>{const found=events.find(filter);if(found){resolve(found);return}const w={filter,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('Pi event timeout'))},20000)};waiters.push(w)});
 const send=command=>child.stdin.write(JSON.stringify(command)+'\n');
 try{
  const ready=await wait(e=>e.type==='ready'||e.type==='fatal');assert.equal(ready.type,'ready');assert.equal(ready.model,null);
  send({type:'prompt',id:'help',message:'/help'});await wait(e=>e.type==='command_result');assert(!events.some(e=>e.type==='turn_start'));
  send({type:'prompt',id:'login',message:'/login'});const providers=await wait(e=>e.type==='auth_providers');assert(providers.providers.length>0);assert.equal(providers.action,'login');
  send({type:'auth_reply',id:'expired',value:'private-value-never-log'});await wait(e=>e.type==='auth_error');
  send({type:'reset',id:'new'});await wait(e=>e.type==='reset_done'&&e.id==='new');const models=await wait(e=>e.type==='models');assert.equal(models.model,null);
  assert(!JSON.stringify(events).includes('private-value-never-log'));assert(!events.some(e=>e.type==='turn_start'||e.type==='auth_success'));
 }finally{child.stdin.end();await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve()},3000);child.once('exit',()=>{clearTimeout(timer);resolve()})});for(const w of waiters)clearTimeout(w.timer);await rm(root,{recursive:true,force:true})}
});
