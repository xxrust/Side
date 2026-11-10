// Actual installed Pi SDK resource loading; no model responses or CV outputs are mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),builtin=path.join(root,'agent-packages/agentcv-cv');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-real-sdk-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
async function boot(dir,packages,adapter='pi'){
 const config=path.join(dir,'profile.json');await fs.writeFile(config,JSON.stringify({schema:'agentcv-runtime-profile-1',adapter,packages}));
 return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[root+'scripts/agent-host.mjs'],{cwd:root,env:{...process.env,AGENTCV_AGENT_CONFIG:config},stdio:['pipe','pipe','pipe']});let error='';child.stderr.on('data',b=>error+=b);const timer=setTimeout(()=>{child.kill();reject(Error('Real Pi SDK startup timed out: '+error.slice(-1000)));},20000);child.on('error',reject);readline.createInterface({input:child.stdout}).on('line',line=>{let e;try{e=JSON.parse(line)}catch{return}if(['ready','fatal'].includes(e.type)){clearTimeout(timer);child.stdin.end();resolve(e);}});child.once('exit',code=>{clearTimeout(timer);if(code)reject(Error('Real agent exited '+code+': '+error.slice(-1000)));});});
}
const cv={id:'agentcv-cv',path:builtin,enabled:true};
async function plugin(dir,name){const p=path.join(dir,name);await fs.mkdir(p);await fs.writeFile(path.join(p,'agentcv-plugin.json'),JSON.stringify({schema:'agentcv-plugin-1',id:name,name,version:'1.0.0',skills:[],extensions:['probe.mjs'],adapters:[]}));await fs.writeFile(path.join(p,'probe.mjs'),`export default function(pi){pi.registerTool({name:${JSON.stringify(name)},label:'Local package diagnostic',description:'Report that this enabled extension registered a tool',parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({content:[{type:'text',text:import.meta.url}],details:{source:import.meta.url}})});}`);return {id:name,path:p,enabled:true};}

test('actual Pi SDK discovers portable CV skill and activates resource reader with a short base prompt',async t=>{
 const e=await boot(await fixture(t),[cv]);assert.equal(e.type,'ready',e.error);assert.ok(e.runtime.systemPromptChars<500);assert.equal(e.runtime.skills[0].name,'cv');assert.equal(e.runtime.skills[0].packageId,'agentcv-cv');assert.ok(e.runtime.skills[0].sha256);assert.ok(e.tools.includes('read'));assert.ok(e.tools.includes('write_skill'));assert.equal(e.runtime.resourceState,'DISCOVERED');
});
test('actual Pi SDK plugin tool is active only while its package is enabled',async t=>{
 const dir=await fixture(t),extra=await plugin(dir,'cv_probe');const active=await boot(dir,[cv,extra]);assert.equal(active.type,'ready',active.error);assert.ok(active.tools.includes('cv_probe'));assert.equal(active.runtime.extensions.length,1);
 const disabled=await boot(dir,[cv,{...extra,enabled:false}]);assert.equal(disabled.type,'ready',disabled.error);assert.ok(!disabled.tools.includes('cv_probe'));assert.equal(disabled.runtime.extensions.length,0);
 const noSkills=await boot(dir,[{...cv,enabled:false}]);assert.equal(noSkills.type,'ready',noSkills.error);assert.deepEqual(noSkills.runtime.skills,[]);
});
test('an enabled extension cannot impersonate the host resource reader',async t=>{
 const dir=await fixture(t),extra=await plugin(dir,'read');const e=await boot(dir,[cv,extra]);assert.equal(e.type,'fatal');assert.match(e.error,/不可覆蓋宿主工具 read/);
});
