import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {loadAgentProfile,saveAgentProfile,describeAgentProfile,readAgentResource,writeAgentSkill,inspectAgentPackage,readAgentProfileForSettings} from '../scripts/agent-resources.mjs';
const scripts=fileURLToPath(new URL('../scripts/',import.meta.url));
async function fixture(t){const cwd=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-resources-')));t.after(()=>fs.rm(cwd,{recursive:true,force:true}));const builtinRoot=path.join(cwd,'builtin');await fs.mkdir(builtinRoot);await fs.writeFile(path.join(builtinRoot,'SKILL.md'),'---\nname: cv\n---\nCV instructions\n');return {cwd,builtinRoot,configPath:path.join(cwd,'profile.json')};}
const config=(root,extra={})=>({schema:'agentcv-runtime-profile-1',adapter:'pi',packages:[{id:'agentcv-cv',path:root,enabled:true}],...extra});
async function plugin(opts,{adapters=[]}={}){const root=path.join(opts.cwd,'plugin');await fs.mkdir(path.join(root,'skills','demo'),{recursive:true});await fs.writeFile(path.join(root,'skills','demo','SKILL.md'),'---\nname: demo\n---\none\ntwo\nthree\n');await fs.writeFile(path.join(root,'extension.mjs'),'export default ()=>{};');await fs.writeFile(path.join(root,'adapter.mjs'),"process.stdout.write(JSON.stringify({type:'ready',adapter:'demo'})+'\\n');");await fs.writeFile(path.join(root,'agentcv-plugin.json'),JSON.stringify({schema:'agentcv-plugin-1',id:'demo',name:'Demo',version:'1.0.0',skills:['skills/demo'],extensions:['extension.mjs'],adapters}));return root;}
test('default profile discovers builtin single skill and stable manifest hash',async t=>{const opts=await fixture(t),profile=await loadAgentProfile(opts);assert.deepEqual(profile.config,config(opts.builtinRoot,{adapter:'codex'}));assert.deepEqual(profile.skillPaths,[opts.builtinRoot]);assert.equal(profile.activeAdapter.id,'codex');assert.deepEqual(profile.adapters,[{id:'pi',name:'Pi'},{id:'codex',name:'Codex CLI · ACP'}]);assert.equal(profile.manifestHash,(await loadAgentProfile(opts)).manifestHash);assert.deepEqual(describeAgentProfile(profile).config,profile.config);});
test('enabled plugin exposes skills, extensions, adapter and bounded resource text',async t=>{const opts=await fixture(t),root=await plugin(opts,{adapters:[{id:'demo',name:'Demo Adapter',entry:'adapter.mjs',protocol:'agentcv-stdio-1'}]});const profile=await saveAgentProfile(config(opts.builtinRoot,{adapter:'demo',packages:[{id:'demo',path:root,enabled:true}]}),opts);assert.equal(profile.packages[0].version,'1.0.0');assert.equal(profile.extensionPaths[0],path.join(root,'extension.mjs'));assert.equal(profile.activeAdapter.entry,path.join(root,'adapter.mjs'));const read=await readAgentResource(profile,'SKILL.md',{offset:4,limit:2});assert.equal(read.text,'one\ntwo');assert.equal(read.totalLines,6);assert.equal(read.packageId,'demo');assert.equal(read.truncated,true);assert.match(read.sha256,/^[a-f0-9]{64}$/);assert.deepEqual((await loadAgentProfile(opts)).config,profile.config);});
test('disabled missing packages do not expose resources or prevent loading',async t=>{const opts=await fixture(t),cfg=config(opts.builtinRoot);cfg.packages.push({id:'missing',path:path.join(opts.cwd,'missing'),enabled:false});const profile=await saveAgentProfile(cfg,opts);assert.equal(profile.packages.length,2);assert.equal(profile.skillPaths.length,1);cfg.packages[1].enabled=true;await assert.rejects(saveAgentProfile(cfg,opts),/missing.*unavailable/);});
test('invalid saves preserve existing profile and leave no temporary files',async t=>{const opts=await fixture(t);await saveAgentProfile(config(opts.builtinRoot),opts);const before=await fs.readFile(opts.configPath,'utf8');await assert.rejects(saveAgentProfile({...config(opts.builtinRoot),adapter:'absent'},opts),/adapter.*unavailable/);assert.equal(await fs.readFile(opts.configPath,'utf8'),before);assert.deepEqual((await fs.readdir(opts.cwd)).sort(),['builtin','profile.json']);});
test('rejects malformed profiles and duplicate package or skill names',async t=>{const opts=await fixture(t);await assert.rejects(saveAgentProfile({...config(opts.builtinRoot),schema:'old'},opts),/schema/);await assert.rejects(saveAgentProfile(config(opts.builtinRoot,{packages:[{id:'x',path:opts.builtinRoot}]}),opts),/explicit boolean/);await assert.rejects(saveAgentProfile(config(opts.builtinRoot,{packages:[{id:'x',path:opts.builtinRoot,enabled:true},{id:'x',path:opts.builtinRoot,enabled:false}]}),opts),/Duplicate package id/);const second=path.join(opts.cwd,'second');await fs.mkdir(second);await fs.copyFile(path.join(opts.builtinRoot,'SKILL.md'),path.join(second,'SKILL.md'));await assert.rejects(saveAgentProfile(config(opts.builtinRoot,{packages:[{id:'x',path:opts.builtinRoot,enabled:true},{id:'y',path:second,enabled:true}]}),opts),/Duplicate skill name/);});
test('rejects invalid manifests, traversal, symlink escapes and duplicate adapters',async t=>{const opts=await fixture(t),root=await plugin(opts),manifest=path.join(root,'agentcv-plugin.json');const valid=JSON.parse(await fs.readFile(manifest,'utf8')),cfg=config(root,{packages:[{id:'demo',path:root,enabled:true}]});for(const [update,pattern] of [[{schema:'bad'},/schema/],[{skills:['../builtin']},/escapes/],[{skills:['missing']},/missing/],[{adapters:[{id:'pi',name:'duplicate',entry:'adapter.mjs',protocol:'agentcv-stdio-1'}]},/Duplicate adapter/],[{adapters:[{id:'a',name:'A',entry:'adapter.mjs',protocol:'bad'}]},/protocol/]]){await fs.writeFile(manifest,JSON.stringify({...valid,...update}));await assert.rejects(saveAgentProfile(cfg,opts),pattern);}await fs.symlink(opts.builtinRoot,path.join(root,'escape'));await fs.writeFile(manifest,JSON.stringify({...valid,skills:['escape']}));await assert.rejects(saveAgentProfile(cfg,opts),/symlink escapes/);await fs.writeFile(manifest,'{');await assert.rejects(saveAgentProfile(cfg,opts),/Cannot read JSON/);});
test('Pi package.json resources are supported',async t=>{const opts=await fixture(t),root=await plugin(opts);await fs.rm(path.join(root,'agentcv-plugin.json'));await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'pi-demo',version:'2',pi:{skills:['skills/demo'],extensions:['extension.mjs']}}));const profile=await saveAgentProfile(config(root,{packages:[{id:'pi-demo',path:root,enabled:true}]}),opts);assert.equal(profile.skillPaths.length,1);assert.equal(profile.extensionPaths.length,1);assert.equal(profile.packages[0].name,'pi-demo');});
test('resource reading rejects escapes, binary, oversized files and invalid bounds',async t=>{const opts=await fixture(t),profile=await loadAgentProfile(opts);const outside=path.join(opts.cwd,'secret.txt');await fs.writeFile(outside,'private');await fs.symlink(outside,path.join(opts.builtinRoot,'escape.txt'));await assert.rejects(readAgentResource(profile,'escape.txt'),/symlink escapes/);await assert.rejects(readAgentResource(profile,outside),/outside/);await fs.writeFile(path.join(opts.builtinRoot,'binary'),Buffer.from([0,1,2]));await assert.rejects(readAgentResource(profile,'binary'),/text file/);await fs.writeFile(path.join(opts.builtinRoot,'big.txt'),'x'.repeat(512*1024+1));await assert.rejects(readAgentResource(profile,'big.txt'),/512 KB/);await assert.rejects(readAgentResource(profile,'SKILL.md',{offset:0}),/offset/);await assert.rejects(readAgentResource(profile,'SKILL.md',{limit:0}),/limit/);});
test('CLI saves and gets profile; external adapter runs with contract environment',async t=>{const opts=await fixture(t),root=await plugin(opts,{adapters:[{id:'demo',name:'Demo',entry:'adapter.mjs',protocol:'agentcv-stdio-1'}]});const cfg=config(root,{adapter:'demo',packages:[{id:'demo',path:root,enabled:true}]});const env={...process.env,AGENTCV_AGENT_CONFIG:opts.configPath};let result=spawnSync(process.execPath,[path.join(scripts,'agent-resources.mjs'),'--save'],{env,input:JSON.stringify(cfg),encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).config.adapter,'demo');result=spawnSync(process.execPath,[path.join(scripts,'agent-resources.mjs'),'--get'],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).activeAdapter.id,'demo');await fs.writeFile(path.join(root,'adapter.mjs'),"process.stdout.write(JSON.stringify({type:'ready',protocol:process.env.AGENTCV_ADAPTER_PROTOCOL,config:process.env.AGENTCV_AGENT_CONFIG,contract:process.env.AGENTCV_TOOL_CONTRACT})+'\\n');");result=spawnSync(process.execPath,[path.join(scripts,'agent-host.mjs')],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);const ready=JSON.parse(result.stdout);assert.equal(ready.protocol,'agentcv-stdio-1');assert.equal(ready.config,opts.configPath);assert.equal(ready.contract,path.join(scripts,'agent-contract.json'));await fs.writeFile(path.join(root,'adapter.mjs'),'process.exit(7);');result=spawnSync(process.execPath,[path.join(scripts,'agent-host.mjs')],{env,encoding:'utf8'});assert.equal(result.status,7);assert.equal(JSON.parse(result.stdout).type,'fatal');});

test('host forwards stdio input and SIGINT then shuts down its adapter',async t=>{
  const opts=await fixture(t),root=await plugin(opts,{adapters:[{id:'demo',name:'Demo',entry:'adapter.mjs',protocol:'agentcv-stdio-1'}]});
  await saveAgentProfile(config(root,{adapter:'demo',packages:[{id:'demo',path:root,enabled:true}]}),opts);
  await fs.writeFile(path.join(root,'adapter.mjs'),`process.stdin.setEncoding('utf8');process.stdin.on('data',data=>process.stdout.write(JSON.stringify({type:'echo',data})+'\\n'));process.on('SIGINT',()=>{process.stdout.write(JSON.stringify({type:'signal',signal:'SIGINT'})+'\\n');process.exit(0)});process.stdout.write(JSON.stringify({type:'ready'})+'\\n');`);
  const child=spawn(process.execPath,[path.join(scripts,'agent-host.mjs')],{env:{...process.env,AGENTCV_AGENT_CONFIG:opts.configPath},stdio:['pipe','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  let output='';child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>output+=chunk);
  const waitFor=async type=>{const deadline=Date.now()+5000;while(!output.split('\n').filter(Boolean).some(line=>JSON.parse(line).type===type)){if(Date.now()>deadline)throw Error('Adapter response timeout: '+output);await new Promise(resolve=>setTimeout(resolve,10));}};
  await waitFor('ready');child.stdin.write('hello\n');await waitFor('echo');const ended=once(child,'exit');child.kill('SIGINT');await ended;
  assert.ok(output.includes('SIGINT'));assert.equal(child.exitCode,0);assert.ok(!output.includes('fatal'));
});
test('host reports invalid selected adapters as fatal without starting Pi',async t=>{
  const opts=await fixture(t);await fs.writeFile(opts.configPath,JSON.stringify(config(opts.builtinRoot,{adapter:'disabled'})));
  const result=spawnSync(process.execPath,[path.join(scripts,'agent-host.mjs')],{env:{...process.env,AGENTCV_AGENT_CONFIG:opts.configPath},encoding:'utf8'});
  assert.equal(result.status,1);const event=JSON.parse(result.stdout);assert.equal(event.type,'fatal');assert.match(event.error,/disabled/);
});

test('inspect discovers real identities and validates resources without saving a profile',async t=>{
  const opts=await fixture(t),root=await plugin(opts);
  assert.deepEqual(await inspectAgentPackage(root,opts),{id:'demo',path:root,name:'Demo',version:'1.0.0'});
  assert.equal((await inspectAgentPackage(opts.builtinRoot,opts)).id,'cv');
  let result=spawnSync(process.execPath,[path.join(scripts,'agent-resources.mjs'),'--inspect'],{input:JSON.stringify({path:root}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).id,'demo');
  await assert.rejects(fs.access(opts.configPath));
  await fs.rm(path.join(root,'agentcv-plugin.json'));
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'@example/pi-skills',version:'2.0',pi:{skills:['skills/demo']}}));
  assert.equal((await inspectAgentPackage(root,opts)).id,'@example/pi-skills');
  await fs.rm(path.join(root,'skills','demo','SKILL.md'));
  await assert.rejects(inspectAgentPackage(root,opts),/missing|contains no SKILL.md/);
});
test('references and scripts change the manifest hash and escaping nested symlinks fail',async t=>{
  const opts=await fixture(t);await fs.mkdir(path.join(opts.builtinRoot,'references'));const reference=path.join(opts.builtinRoot,'references','guide.md');await fs.writeFile(reference,'first');
  const first=await loadAgentProfile(opts);await fs.writeFile(reference,'second');const second=await loadAgentProfile(opts);assert.notEqual(first.manifestHash,second.manifestHash);
  await fs.mkdir(path.join(opts.builtinRoot,'scripts'));await fs.writeFile(path.join(opts.builtinRoot,'scripts','run.py'),'print(1)');assert.notEqual(second.manifestHash,(await loadAgentProfile(opts)).manifestHash);
  const outside=path.join(opts.cwd,'outside.md');await fs.writeFile(outside,'outside');await fs.symlink(outside,path.join(opts.builtinRoot,'references','escape.md'));await assert.rejects(loadAgentProfile(opts),/symlink escapes/);
});
test('external ready uses host runtime identity and preserves only self-reported loaded resources',async t=>{
  const opts=await fixture(t),root=await plugin(opts,{adapters:[{id:'demo',name:'Demo',entry:'adapter.mjs',protocol:'agentcv-stdio-1'}]});
  const profile=await saveAgentProfile(config(root,{adapter:'demo',packages:[{id:'demo',path:root,enabled:true}]}),opts);
  const run=()=>spawnSync(process.execPath,[path.join(scripts,'agent-host.mjs')],{env:{...process.env,AGENTCV_AGENT_CONFIG:opts.configPath},encoding:'utf8'});
  await fs.writeFile(path.join(root,'adapter.mjs'),`console.log(JSON.stringify({type:'ready',runtime:{activeAdapter:{id:'spoof'},manifestHash:'spoof',config:{},skills:[{name:'loaded'}],extensions:['loaded.mjs'],capabilities:{vision:true}}}));console.log('{"type":"custom", "data":1}');`);
  let result=run();assert.equal(result.status,0,result.stderr);let lines=result.stdout.trimEnd().split('\n'),ready=JSON.parse(lines[0]);assert.equal(ready.runtime.activeAdapter.id,'demo');assert.equal(ready.runtime.config.adapter,'demo');assert.notEqual(ready.runtime.manifestHash,'spoof');assert.deepEqual(ready.runtime.skills,[{name:'loaded'}]);assert.deepEqual(ready.runtime.extensions,['loaded.mjs']);assert.deepEqual(ready.runtime.capabilities,{vision:true});assert.equal(lines[1],'{"type":"custom", "data":1}');
  await fs.writeFile(path.join(root,'adapter.mjs'),`console.log(JSON.stringify({type:'ready'}));`);result=run();assert.equal(result.status,0,result.stderr);ready=JSON.parse(result.stdout);assert.equal(ready.runtime.resourceState,'OFFERED');assert.deepEqual(ready.runtime.skills,[]);assert.ok(ready.runtime.skillPaths.length>0);
  await fs.writeFile(path.join(root,'adapter.mjs'),`process.stdin.resume();process.stdin.on('end',()=>process.exit(0));console.log(JSON.stringify({type:'ready'}));`);result=run();assert.equal(result.status,0,result.stderr);
});

test('Pi skill collections flatten nested roots and accept explicit SKILL.md files',async t=>{
  const opts=await fixture(t),root=await plugin(opts);await fs.rm(path.join(root,'agentcv-plugin.json'));
  const collection=path.join(root,'skills');
  for(const [relative,name] of [['nested/second','second'],['.hidden/ignored','ignored-hidden'],['node_modules/ignored','ignored-modules'],['.git/ignored','ignored-git']]) {
    const dir=path.join(collection,relative);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'SKILL.md'),`---\nname: ${name}\n---\nSkill body`);
  }
  // Finding a skill stops discovery before nested examples can become extra skills.
  const nestedExample=path.join(collection,'demo','examples','example');await fs.mkdir(nestedExample,{recursive:true});await fs.writeFile(path.join(nestedExample,'SKILL.md'),'---\nname: example\n---');
  const manifest=path.join(root,'package.json');await fs.writeFile(manifest,JSON.stringify({name:'pi-collection',pi:{skills:['./skills']}}));
  let profile=await saveAgentProfile(config(root,{packages:[{id:'pi-collection',path:root,enabled:true}]}),opts);
  assert.deepEqual(profile.skillPaths,[path.join(collection,'demo'),path.join(collection,'nested','second')]);assert.equal(profile.resourceRoots.length,2);
  await fs.writeFile(manifest,JSON.stringify({name:'pi-collection',pi:{skills:['skills/demo/SKILL.md','skills/nested/second/SKILL.md']}}));
  profile=await loadAgentProfile(opts);assert.equal(profile.skillPaths.length,2);assert.equal((await inspectAgentPackage(root,opts)).id,'pi-collection');
  await fs.mkdir(path.join(root,'empty'));await fs.writeFile(manifest,JSON.stringify({name:'pi-collection',pi:{skills:['empty']}}));await assert.rejects(loadAgentProfile(opts),/contains no SKILL.md/);
});
test('skill collections reject canonical escapes and tolerate ignored directory symlinks',async t=>{
  const opts=await fixture(t),root=await plugin(opts);await fs.rm(path.join(root,'agentcv-plugin.json'));await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'collection',pi:{skills:['skills']}}));
  await fs.symlink(opts.builtinRoot,path.join(root,'skills','.hidden-outside'));let profile=await saveAgentProfile(config(root,{packages:[{id:'collection',path:root,enabled:true}]}),opts);assert.equal(profile.skillPaths.length,1);
  await fs.symlink(opts.builtinRoot,path.join(root,'skills','outside'));await assert.rejects(loadAgentProfile(opts),/symlink escapes plugin/);
});

test('settings can repair a moved enabled plugin while startup and saves remain strict',async t=>{
 const opts=await fixture(t),root=await plugin(opts,{adapters:[{id:'demo',name:'Demo',entry:'adapter.mjs',protocol:'agentcv-stdio-1'}]});
 const cfg=config(root,{adapter:'demo',packages:[{id:'demo',path:root,enabled:true}]});await saveAgentProfile(cfg,opts);
 await fs.rename(root,root+'-moved');const original=await fs.readFile(opts.configPath,'utf8');
 await assert.rejects(loadAgentProfile(opts),/unavailable/);await assert.rejects(saveAgentProfile(cfg,opts),/unavailable/);
 assert.equal(await fs.readFile(opts.configPath,'utf8'),original);
 const startup=spawnSync(process.execPath,[path.join(scripts,'agent-host.mjs')],{env:{...process.env,AGENTCV_AGENT_CONFIG:opts.configPath},encoding:'utf8'});assert.equal(startup.status,1);assert.equal(JSON.parse(startup.stdout).type,'fatal');assert.match(JSON.parse(startup.stdout).error,/demo.*unavailable/);
 const settings=await readAgentProfileForSettings(opts);assert.deepEqual(settings.config,cfg);assert.equal(settings.activeAdapter.id,'demo');assert.equal(settings.activeAdapter.available,false);assert.equal(settings.packages[0].enabled,true);assert.equal(settings.packages[0].available,false);assert.equal(settings.adapters[0].id,'pi');assert.match(settings.manifestHash,/^error:/);assert.ok(settings.diagnostics.some(item=>item.packageId==='demo'));
 const result=spawnSync(process.execPath,[path.join(scripts,'agent-resources.mjs'),'--get'],{env:{...process.env,AGENTCV_AGENT_CONFIG:opts.configPath},encoding:'utf8'});assert.equal(result.status,0,result.stderr);const fromCLI=JSON.parse(result.stdout);assert.deepEqual(fromCLI.config,cfg);assert.equal(fromCLI.activeAdapter.id,'demo');assert.equal(fromCLI.activeAdapter.available,false);assert.ok(fromCLI.diagnostics.length>0);
 const fixed={...settings.config,adapter:'pi',packages:settings.config.packages.map(pkg=>({...pkg,enabled:false}))};await saveAgentProfile(fixed,opts);assert.equal((await loadAgentProfile(opts)).activeAdapter.id,'pi');assert.deepEqual((await readAgentProfileForSettings(opts)).diagnostics,[]);
});
test('settings retains healthy adapter discovery beside broken and duplicate packages',async t=>{
 const opts=await fixture(t),root=await plugin(opts,{adapters:[{id:'demo',name:'Demo',entry:'adapter.mjs',protocol:'agentcv-stdio-1'}]});
 const cfg=config(root,{adapter:'demo',packages:[{id:'demo',path:root,enabled:true},{id:'missing',path:path.join(opts.cwd,'missing'),enabled:true}]});
 await fs.writeFile(opts.configPath,JSON.stringify(cfg));let settings=await readAgentProfileForSettings(opts);assert.equal(settings.activeAdapter.id,'demo');assert.equal(settings.activeAdapter.available,true);assert.ok(settings.adapters.some(adapter=>adapter.id==='demo'));assert.equal(settings.packages.length,2);assert.deepEqual(settings.config,cfg);await assert.rejects(loadAgentProfile(opts),/unavailable/);
 cfg.packages=[cfg.packages[0],{...cfg.packages[0]}];await fs.writeFile(opts.configPath,JSON.stringify(cfg));settings=await readAgentProfileForSettings(opts);assert.deepEqual(settings.config,cfg);assert.match(settings.diagnostics[0].message,/Duplicate package id/);assert.equal(settings.activeAdapter.id,'demo');assert.equal(settings.activeAdapter.available,false);
});
test('settings refuses corrupted JSON and invalid basic schema without modifying the file',async t=>{
 const opts=await fixture(t);
 for(const input of ['{',JSON.stringify({schema:'old',adapter:'pi',packages:[]}),JSON.stringify({schema:'agentcv-runtime-profile-1',adapter:'pi',packages:[{id:'x',path:'x',enabled:'yes'}]})]) {
  await fs.writeFile(opts.configPath,input);await assert.rejects(readAgentProfileForSettings(opts));assert.equal(await fs.readFile(opts.configPath,'utf8'),input);
  const result=spawnSync(process.execPath,[path.join(scripts,'agent-resources.mjs'),'--get'],{env:{...process.env,AGENTCV_AGENT_CONFIG:opts.configPath},encoding:'utf8'});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.ok(result.stderr.includes('AgentCV:'));
 }
});

test('skill writes require current hash, preserve before/after and reject non-skill files',async t=>{
 const opts=await fixture(t),profile=await loadAgentProfile(opts),before=await readAgentResource(profile,'SKILL.md');
 const text='---\nname: cv\ndescription: Explain visual evidence.\n---\nUpdated instructions\n';
 const receipt=await writeAgentSkill(profile,{path:'SKILL.md',text,expectedSha256:before.sha256,reason:'Explain parameter tradeoffs using actual plots'});
 assert.equal((await readAgentResource(profile,'SKILL.md')).text,text.trimEnd());
 assert.equal(await fs.readFile(path.join(receipt.historyPath,'before.txt'),'utf8'),'---\nname: cv\n---\nCV instructions\n');
 assert.equal(await fs.readFile(path.join(receipt.historyPath,'after.txt'),'utf8'),text);
 assert.equal(JSON.parse(await fs.readFile(path.join(receipt.historyPath,'change.json'))).sha256,receipt.sha256);
 await assert.rejects(writeAgentSkill(profile,{path:'SKILL.md',text,expectedSha256:before.sha256,reason:'stale'}),/changed since read/);
 await fs.writeFile(path.join(opts.builtinRoot,'run.py'),'print(1)');
 const code=await readAgentResource(profile,'run.py');
 await assert.rejects(writeAgentSkill(profile,{path:'run.py',text:'print(2)',expectedSha256:code.sha256,reason:'code'}),/not executable/);
 await assert.rejects(writeAgentSkill(profile,{path:opts.configPath,text,expectedSha256:receipt.sha256,reason:'escape'}),/outside/);
});
test('editing signed app skills uses writable copy and leaves bundled package unchanged',async t=>{
 const opts=await fixture(t),appRoot=path.join(opts.cwd,'AgentCV.app','Contents','Resources','cv');await fs.mkdir(appRoot,{recursive:true});
 const original='---\nname: cv\ndescription: Original.\n---\nOriginal';await fs.writeFile(path.join(appRoot,'SKILL.md'),original);
 const profile=await saveAgentProfile(config(appRoot),opts),before=await readAgentResource(profile,'SKILL.md');
 const receipt=await writeAgentSkill(profile,{path:'SKILL.md',text:original.replace('Original.','Improved.'),expectedSha256:before.sha256,reason:'User requested clearer guidance'});
 assert.equal(await fs.readFile(path.join(appRoot,'SKILL.md'),'utf8'),original);
 assert.ok(!receipt.path.includes('.app/'));
 const reloaded=await loadAgentProfile(opts);assert.equal(reloaded.skillPaths[0],path.dirname(receipt.path));assert.notEqual(reloaded.manifestHash,profile.manifestHash);
 assert.match((await readAgentResource(reloaded,'SKILL.md')).text,/Improved/);
});
