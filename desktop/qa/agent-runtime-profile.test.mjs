import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadRuntimeAgentProfile,loadAgentProfile,saveAgentProfile} from '../scripts/agent-resources.mjs';
const exec=promisify(execFile);
async function setup(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-runtime-profile-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const options={configPath:path.join(dir,'profile.json'),defaultAdapter:'codex'};
 const initial=await loadAgentProfile(options);
 await saveAgentProfile({...initial.config,adapter:'pi'},options);
 return options;
}
test('a secondary role initializes the upgrade before the main agent, then preserves explicit Pi choices',async t=>{
 const opts=await setup(t);
 const before=await fs.readFile(opts.configPath,'utf8');
 assert.equal((await loadRuntimeAgentProfile(opts)).activeAdapter.id,'codex');
 assert.equal(await fs.readFile(opts.configPath+'.before-codex','utf8'),before);
 const current=await loadAgentProfile(opts);
 await saveAgentProfile({...current.config,adapter:'pi'},opts);
 assert.equal((await loadRuntimeAgentProfile(opts)).activeAdapter.id,'pi');
 assert.equal(await fs.readFile(opts.configPath+'.before-codex','utf8'),before);
});
test('concurrent role processes all observe the completed migration',async t=>{
 const opts=await setup(t),module=new URL('../scripts/agent-resources.mjs',import.meta.url).href;
 const code=`import {loadRuntimeAgentProfile} from ${JSON.stringify(module)}; console.log((await loadRuntimeAgentProfile(JSON.parse(process.argv[1]))).activeAdapter.id);`;
 const results=await Promise.all(Array.from({length:6},()=>exec(process.execPath,['--input-type=module','-e',code,JSON.stringify(opts)])));
 for(const result of results)assert.equal(result.stdout.trim(),'codex');
 assert.equal((await loadAgentProfile(opts)).activeAdapter.id,'codex');
 assert.equal(JSON.parse(await fs.readFile(opts.configPath+'.before-codex')).adapter,'pi');
});
test('non-desktop callers keep an explicitly selected Pi runtime',async t=>{
 const opts=await setup(t);
 assert.equal((await loadRuntimeAgentProfile({...opts,defaultAdapter:'pi'})).activeAdapter.id,'pi');
 assert.equal(await fs.access(opts.configPath+'.before-codex').then(()=>true,()=>false),false);
});
