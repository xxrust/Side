// AgentCV package discovery is independent of any agent SDK.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';

const builtinAdapters = () => [{id:'pi', name:'Pi'}, {id:'codex', name:'Codex CLI · ACP'}];
const SCHEMA = 'agentcv-runtime-profile-1';
const here = path.dirname(fileURLToPath(import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const within = (root, target) => target === root || (!path.relative(root, target).startsWith(`..${path.sep}`) && path.relative(root, target) !== '..' && !path.isAbsolute(path.relative(root, target)));
function fail(message) { throw new Error(`AgentCV: ${message}`); }
function nonempty(value, label) { if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`); return value; }
async function exists(filename) { try { await fs.lstat(filename); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function json(filename) { try { return JSON.parse(await fs.readFile(filename, 'utf8')); } catch (error) { fail(`Cannot read JSON ${filename}: ${error.message}`); } }
function options({configPath, builtinRoot, cwd = process.cwd()} = {}) {
  cwd = path.resolve(cwd);
  return {cwd, configPath: path.resolve(cwd, configPath || process.env.AGENTCV_AGENT_CONFIG || 'agent-profile.json'), builtinRoot: path.resolve(cwd, builtinRoot || (process.env.AGENTCV_RESOURCE_DIR ? path.join(process.env.AGENTCV_RESOURCE_DIR, 'agentcv-cv') : path.join(here, '../agent-packages/agentcv-cv')))};
}
async function contained(root, relative, label, kind) {
  nonempty(relative, label);
  if (path.isAbsolute(relative)) fail(`${label} must be relative to its plugin`);
  const lexical = path.resolve(root, relative);
  if (!within(root, lexical)) fail(`${label} escapes plugin root: ${relative}`);
  let canonical, stat;
  try { canonical = await fs.realpath(lexical); stat = await fs.stat(canonical); } catch (error) { fail(`${label} is missing or inaccessible: ${lexical} (${error.message})`); }
  if (!within(root, canonical)) fail(`${label} symlink escapes plugin root: ${relative}`);
  if (kind === 'file' && !stat.isFile() || kind === 'directory' && !stat.isDirectory()) fail(`${label} must be a ${kind}: ${relative}`);
  return canonical;
}
async function discoverSkills(packageRoot, relative, label) {
  const entry = await contained(packageRoot, relative, label);
  const stat = await fs.stat(entry);
  if (stat.isFile()) {
    if (path.basename(entry) !== 'SKILL.md') fail(`${label} file must be SKILL.md: ${relative}`);
    return [path.dirname(entry)];
  }
  if (!stat.isDirectory()) fail(`${label} must be a skill directory, collection directory, or SKILL.md file`);
  const found=[], visited=new Set(); let count=0;
  async function walk(directory, depth) {
    if(depth>16) fail(`Skill collection nesting exceeds 16 levels: ${entry}`);
    const canonical=await fs.realpath(directory);
    if(!within(packageRoot,canonical)) fail(`${label} symlink escapes plugin root: ${directory}`);
    if(visited.has(canonical)) return; visited.add(canonical);
    if(await exists(path.join(canonical,'SKILL.md'))) {
      await contained(packageRoot,path.relative(packageRoot,path.join(canonical,'SKILL.md')),`${label} SKILL.md`,'file');
      found.push(canonical); return;
    }
    const children=(await fs.readdir(canonical,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'));
    for(const child of children) {
      if(child.name.startsWith('.') || child.name==='node_modules') continue;
      if(++count>4096) fail(`Skill collection exceeds 4096 entries: ${entry}`);
      if(!child.isDirectory() && !child.isSymbolicLink()) continue;
      const target=await contained(packageRoot,path.relative(packageRoot,path.join(canonical,child.name)),label);
      if((await fs.stat(target)).isDirectory()) await walk(target,depth+1);
    }
  }
  await walk(entry,0);
  if(!found.length) fail(`${label} collection contains no SKILL.md files: ${relative}`);
  return found;
}
// Hash the same bounded text resources that can be read through readAgentResource.
async function skillResourceHashes(skillRoot, packageRoot) {
  const entries=[], visited=new Set(); let count=0, bytesRead=0;
  async function walk(directory, depth) {
    if(depth>16) fail(`Skill resource nesting exceeds 16 levels: ${directory}`);
    const canonical=await fs.realpath(directory);
    if(!within(packageRoot,canonical) || !within(skillRoot,canonical)) fail(`Skill resource symlink escapes skill root: ${directory}`);
    if(visited.has(canonical)) return; visited.add(canonical);
    const children=(await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'));
    for(const child of children) {
      if(child.name==='node_modules' || child.name.startsWith('.') && (child.isDirectory() || child.isSymbolicLink())) continue;
      if(++count>4096) fail(`Skill resources exceed 4096 entries: ${skillRoot}`);
      const target=path.join(directory,child.name), resolved=await fs.realpath(target);
      if(!within(packageRoot,resolved) || !within(skillRoot,resolved)) fail(`Skill resource symlink escapes skill root: ${target}`);
      const stat=await fs.stat(resolved);
      if(stat.isDirectory()) { await walk(target,depth+1); continue; }
      if(!stat.isFile() || stat.size>512*1024) continue;
      bytesRead+=stat.size;if(bytesRead>32*1024*1024) fail(`Skill text scan exceeds 32 MB: ${skillRoot}`);
      const bytes=await fs.readFile(resolved); let text;
      try { text=new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { continue; }
      if(/[\x00-\x08\x0e-\x1f]/.test(text)) continue;
      entries.push({path:path.relative(skillRoot,target),sha256:digest(bytes)});
    }
  }
  await walk(skillRoot,0);
  return entries;
}
async function build(config, opts) {
  if (!config || config.schema !== SCHEMA) fail(`Profile schema must be ${SCHEMA}`);
  nonempty(config.adapter, 'adapter');
  if (!Array.isArray(config.packages)) fail('packages must be an array');
  const ids = new Set(), roots = new Set(), names = new Set(), skillNames = new Set();
  const packages = [], skillPaths = [], extensionPaths = [], resourceRoots = [], adapters = builtinAdapters(), manifests = [];
  const normalized = {schema:SCHEMA, adapter:config.adapter, packages:[]};
  for (const spec of config.packages) {
    if (!spec || typeof spec !== 'object') fail('Invalid package entry');
    const id = nonempty(spec.id, 'package id');
    if (ids.has(id)) fail(`Duplicate package id: ${id}`); ids.add(id);
    if (typeof spec.enabled !== 'boolean') fail(`Package ${id} requires explicit boolean enabled`);
    const configuredPath = path.resolve(opts.cwd, nonempty(spec.path, `Package ${id} path`));
    normalized.packages.push({id,path:configuredPath,enabled:spec.enabled});
    const item = {id,path:configuredPath,enabled:spec.enabled,name:id,version:null};
    packages.push(item);
    // Disabled packages may be unavailable (for example an unplugged drive).
    if (!spec.enabled) continue;
    let root;
    try { root = await fs.realpath(configuredPath); if (!(await fs.stat(root)).isDirectory()) fail(`Package ${id} path is not a directory`); } catch (error) { fail(`Package ${id} is unavailable: ${configuredPath} (${error.message})`); }
    if (roots.has(root)) fail(`Duplicate enabled package path: ${root}`); roots.add(root);
    item.path = root;
    const manifestFile = path.join(root, 'agentcv-plugin.json'), packageFile = path.join(root, 'package.json');
    let manifest, skills = [], extensions = [], extraAdapters = [];
    if (await exists(manifestFile)) {
      await contained(root, 'agentcv-plugin.json', 'Plugin manifest', 'file');
      manifest = await json(manifestFile);
      if (!manifest || manifest.schema !== 'agentcv-plugin-1') fail(`Invalid plugin schema in ${manifestFile}`);
      if (nonempty(manifest.id, 'Plugin id') !== id) fail(`Plugin id ${manifest.id} does not match configured id ${id}`);
      item.name = nonempty(manifest.name, `Plugin ${id} name`);
      item.version = nonempty(manifest.version, `Plugin ${id} version`);
      skills = manifest.skills ?? []; extensions = manifest.extensions ?? []; extraAdapters = manifest.adapters ?? [];
    } else if (await exists(packageFile)) {
      await contained(root, 'package.json', 'Package manifest', 'file');
      manifest = await json(packageFile);
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail(`Invalid package manifest in ${packageFile}`);
      if (manifest.pi !== undefined && (!manifest.pi || typeof manifest.pi !== 'object' || Array.isArray(manifest.pi))) fail(`Package ${id} pi resources must be an object`);
      if (manifest.name !== undefined) nonempty(manifest.name, `Package ${id} name`);
      if (manifest.version !== undefined) nonempty(manifest.version, `Package ${id} version`);
      item.name = manifest.name || id; item.version = manifest.version || null;
      skills = manifest.pi?.skills ?? []; extensions = manifest.pi?.extensions ?? [];
      if (!manifest.pi && !(await exists(path.join(root, 'SKILL.md')))) fail(`Package ${id} has no AgentCV or Pi resource manifest`);
      if (!manifest.pi) skills = ['.'];
    } else if (await exists(path.join(root, 'SKILL.md'))) { skills = ['.']; manifest = {singleSkill:true}; }
    else fail(`Package ${id} requires agentcv-plugin.json, package.json pi resources, or SKILL.md`);
    if (names.has(item.name)) fail(`Duplicate enabled package name: ${item.name}`); names.add(item.name);
    for (const [label, values] of [['skills',skills],['extensions',extensions],['adapters',extraAdapters]]) if (!Array.isArray(values)) fail(`Plugin ${id} ${label} must be an array`);
    manifests.push({id,root,manifest});
    for (const relative of skills) {
      const discovered = await discoverSkills(root, relative, `Plugin ${id} skill`);
      for (const skillRoot of discovered) {
        const skillFile = await contained(root, path.relative(root,path.join(skillRoot,'SKILL.md')), `Plugin ${id} SKILL.md`, 'file');
        const content = await fs.readFile(skillFile,'utf8');
        const name = /^name:\s*["']?([^\r\n"']+)["']?\s*$/m.exec(content)?.[1]?.trim() || path.basename(skillRoot);
        if (skillNames.has(name)) fail(`Duplicate skill name: ${name}`); skillNames.add(name);
        if (skillPaths.includes(skillRoot)) fail(`Duplicate skill path: ${skillRoot}`);
        skillPaths.push(skillRoot); resourceRoots.push({path:skillRoot,packageId:id,packageRoot:root});
        manifests.push({skillFile,sha256:digest(content),resources:await skillResourceHashes(skillRoot,root)});
      }
    }
    for (const relative of extensions) {
      if (typeof relative !== 'string' || !/\.(?:[cm]?js|tsx?)$/i.test(relative)) fail(`Plugin ${id} extension must be a JS/TS file`);
      const entry = await contained(root,relative,`Plugin ${id} extension`,'file');
      if (extensionPaths.includes(entry)) fail(`Duplicate extension path: ${entry}`);
      extensionPaths.push(entry); manifests.push({entry,sha256:digest(await fs.readFile(entry))});
    }
    for (const adapter of extraAdapters) {
      if (!adapter || typeof adapter !== 'object') fail(`Invalid adapter in plugin ${id}`);
      nonempty(adapter.id,'Adapter id'); nonempty(adapter.name,'Adapter name');
      if (adapters.some(value=>value.id===adapter.id)) fail(`Duplicate adapter id: ${adapter.id}`);
      if (adapter.protocol !== 'agentcv-stdio-1') fail(`Adapter ${adapter.id} requires protocol agentcv-stdio-1`);
      if (typeof adapter.entry !== 'string' || !adapter.entry.endsWith('.mjs')) fail(`Adapter ${adapter.id} entry must be .mjs`);
      const entry = await contained(root,adapter.entry,`Adapter ${adapter.id} entry`,'file');
      adapters.push({id:adapter.id,name:adapter.name,entry,protocol:adapter.protocol,packageId:id});
      manifests.push({entry,sha256:digest(await fs.readFile(entry))});
    }
  }
  const activeAdapter = adapters.find(adapter=>adapter.id===config.adapter);
  if (!activeAdapter) fail(`Selected adapter is unavailable or disabled: ${config.adapter}`);
  return {config:normalized,configPath:opts.configPath,packages,skillPaths,extensionPaths,resourceRoots,adapters,activeAdapter,manifestHash:digest(JSON.stringify({config:normalized,manifests})),diagnostics:[]};
}
export async function inspectAgentPackage(requestedPath, input = {}) {
  const opts = options(input);
  const configuredPath = path.resolve(opts.cwd, nonempty(requestedPath, 'Package path'));
  let root;
  try { root = await fs.realpath(configuredPath); } catch (error) { fail(`Package is unavailable: ${configuredPath} (${error.message})`); }
  let id;
  if (await exists(path.join(root,'agentcv-plugin.json'))) {
    await contained(root,'agentcv-plugin.json','Plugin manifest','file');
    id = (await json(path.join(root,'agentcv-plugin.json')))?.id;
  } else if (await exists(path.join(root,'package.json'))) {
    await contained(root,'package.json','Package manifest','file');
    const manifest = await json(path.join(root,'package.json'));
    id = manifest?.name;
    if (!id && !manifest?.pi && await exists(path.join(root,'SKILL.md'))) {
      const skillFile = await contained(root,'SKILL.md','Skill file','file');
      id = /^name:\s*["']?([^\r\n"']+)["']?\s*$/m.exec(await fs.readFile(skillFile,'utf8'))?.[1]?.trim() || path.basename(root);
    }
  } else {
    const skillFile = await contained(root,'SKILL.md','Skill file','file');
    id = /^name:\s*["']?([^\r\n"']+)["']?\s*$/m.exec(await fs.readFile(skillFile,'utf8'))?.[1]?.trim() || path.basename(root);
  }
  nonempty(id,'Package identity (manifest id, package name, or skill name)');
  const profile = await build({schema:SCHEMA,adapter:'pi',packages:[{id,path:root,enabled:true}]},opts);
  const {name,version} = profile.packages[0];
  return {id,path:root,name,version};
}
export async function loadAgentProfile(input = {}) {
  const opts = options(input);
  const config = await exists(opts.configPath) ? await json(opts.configPath) : {schema:SCHEMA,adapter:'codex',packages:[{id:'agentcv-cv',path:opts.builtinRoot,enabled:true}]};
  return build(config,opts);
}
// Every role must resolve the desktop upgrade before choosing its transport.
// In particular, import recovery may start the image manager before the main agent.
export async function loadRuntimeAgentProfile({defaultAdapter=process.env.AGENTCV_DEFAULT_ADAPTER,...input} = {}) {
  let profile = await loadAgentProfile(input);
  if (defaultAdapter !== 'codex') return profile;
  const migration = path.join(path.dirname(profile.configPath),'codex-default-v1.json');
  if (await exists(migration)) return loadAgentProfile(input);
  await fs.mkdir(path.dirname(profile.configPath),{recursive:true});
  if (profile.config.adapter === 'pi') {
    await fs.copyFile(profile.configPath,profile.configPath+'.before-codex',constants.COPYFILE_EXCL).catch(error=>{if(!['ENOENT','EEXIST'].includes(error.code))throw error;});
    profile = await saveAgentProfile({...profile.config,adapter:'codex'},{...input,configPath:profile.configPath});
  }
  // Two roles can initialize together. Completing the same migration is harmless;
  // an existing marker also protects later explicit choices, including Pi.
  await fs.writeFile(migration,JSON.stringify({adapter:profile.config.adapter,at:new Date().toISOString()}),{flag:'wx',mode:0o600}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  return loadAgentProfile(input);
}
// Settings must remain editable when an enabled drive/plugin has disappeared.
// This describes the broken configuration; it is never used to start an agent.
export async function readAgentProfileForSettings(input = {}) {
  const opts = options(input);
  const config = await exists(opts.configPath) ? await json(opts.configPath) : {schema:SCHEMA,adapter:'codex',packages:[{id:'agentcv-cv',path:opts.builtinRoot,enabled:true}]};
  if(!config || config.schema!==SCHEMA) fail(`Profile schema must be ${SCHEMA}`);
  nonempty(config.adapter,'adapter');
  if(!Array.isArray(config.packages)) fail('packages must be an array');
  for(const spec of config.packages) {
    if(!spec || typeof spec!=='object' || Array.isArray(spec)) fail('Invalid package entry');
    nonempty(spec.id,'package id'); nonempty(spec.path,`Package ${spec.id} path`);
    if(typeof spec.enabled!=='boolean') fail(`Package ${spec.id} requires explicit boolean enabled`);
  }
  try {
    const profile=await build(config,opts);
    return {...profile,config,activeAdapter:{...profile.activeAdapter,available:true}};
  } catch(error) {
    const diagnostics=[{code:'PROFILE_RESOURCES_INVALID',message:error.message}];
    const packages=[],skillPaths=[],extensionPaths=[],resourceRoots=[],adapters=builtinAdapters(),adapterConflicts=new Set();
    for(const spec of config.packages) {
      if(!spec.enabled) {packages.push({id:spec.id,path:path.resolve(opts.cwd,spec.path),enabled:false,name:spec.id,version:null});continue;}
      try {
        const partial=await build({schema:SCHEMA,adapter:'pi',packages:[spec]},opts);
        packages.push({...partial.packages[0],available:true});
        skillPaths.push(...partial.skillPaths);extensionPaths.push(...partial.extensionPaths);resourceRoots.push(...partial.resourceRoots);
        for(const adapter of partial.adapters.filter(adapter=>!builtinAdapters().some(builtin=>builtin.id===adapter.id))) {
          if(adapters.some(candidate=>candidate.id===adapter.id)) adapterConflicts.add(adapter.id);
          else adapters.push(adapter);
        }
      } catch(packageError) {
        packages.push({id:spec.id,path:path.resolve(opts.cwd,spec.path),enabled:true,name:spec.id,version:null,available:false});
        diagnostics.push({code:'PACKAGE_UNAVAILABLE',packageId:spec.id,message:packageError.message});
      }
    }
    const availableAdapters=adapters.filter(adapter=>!adapterConflicts.has(adapter.id));
    const selected=availableAdapters.find(adapter=>adapter.id===config.adapter);
    const activeAdapter=selected ? {...selected,available:true} : {id:config.adapter,name:config.adapter,available:false};
    if(!selected) diagnostics.push({code:'ADAPTER_UNAVAILABLE',message:`Selected adapter is unavailable or ambiguous: ${config.adapter}`});
    return {config,configPath:opts.configPath,packages,skillPaths:[...new Set(skillPaths)],extensionPaths:[...new Set(extensionPaths)],resourceRoots,adapters:availableAdapters,activeAdapter,manifestHash:`error:${digest(JSON.stringify({config,diagnostics}))}`,diagnostics};
  }
}
export async function saveAgentProfile(config, input = {}) {
  const opts = options(input), profile = await build(config,opts);
  await fs.mkdir(path.dirname(opts.configPath),{recursive:true});
  const temp = `${opts.configPath}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temp,'wx',0o600);
    try { await handle.writeFile(JSON.stringify(profile.config,null,2)+'\n'); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temp,opts.configPath);
  }
  finally { await fs.rm(temp,{force:true}); }
  return profile;
}
export function describeAgentProfile(profile) {
  const {config,configPath,packages,skillPaths,extensionPaths,resourceRoots,adapters,activeAdapter,manifestHash,diagnostics} = profile;
  return {config,configPath,packages,skillPaths,extensionPaths,resourceRoots,adapters,activeAdapter,manifestHash,diagnostics};
}
export async function readAgentResource(profile, requestedPath, {offset=1,limit=240} = {}) {
  nonempty(requestedPath,'Resource path');
  if (!Number.isSafeInteger(offset) || offset < 1 || !Number.isSafeInteger(limit) || limit < 1) fail('Resource offset must be >= 1 and limit >= 1');
  const candidates = path.isAbsolute(requestedPath) ? [requestedPath] : profile.resourceRoots.map(root=>path.resolve(root.path,requestedPath));
  const matches = [];
  for (const candidate of candidates) {
    const lexicalRoot = profile.resourceRoots.find(root=>within(root.path,path.resolve(candidate)));
    if (!lexicalRoot) continue;
    let canonical;
    try { canonical = await fs.realpath(candidate); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const root = profile.resourceRoots.find(root=>within(root.path,canonical) && within(root.packageRoot || root.path,canonical));
    if (!root || !within(lexicalRoot.path,canonical)) fail(`Resource symlink escapes enabled skill root: ${requestedPath}`);
    if (!matches.some(item=>item.path===canonical)) matches.push({path:canonical,root});
  }
  if (!matches.length) fail(`Resource is missing or outside enabled skill roots: ${requestedPath}`);
  if (matches.length > 1) fail(`Ambiguous resource path: ${requestedPath}; use an absolute path`);
  const match = matches[0], handle = await fs.open(match.path,'r');
  let bytes;
  try { const stat=await handle.stat(); if(!stat.isFile()) fail('Resource must be a text file'); if(stat.size>512*1024) fail('Resource exceeds 512 KB'); bytes=await handle.readFile(); if(bytes.length>512*1024) fail('Resource exceeds 512 KB'); } finally { await handle.close(); }
  let content;
  try { content = new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { fail('Resource must be UTF-8 text'); }
  if (content.includes('\0') || /[\x01-\x08\x0e-\x1f]/.test(content)) fail('Resource must be a text file');
  const lines = content ? content.split(/\r\n|\n|\r/) : []; if (lines.at(-1)==='' && content) lines.pop();
  const text = lines.slice(offset-1,offset-1+limit).join('\n');
  return {path:match.path,text,sha256:digest(bytes),totalLines:lines.length,offset,truncated:offset>1 || offset-1+limit<lines.length,packageId:match.root.packageId};
}
// Skill editing is a resource capability, not arbitrary filesystem access.
const skillWrites = new Map();
export async function writeAgentSkill(profile, {path:requestedPath, text, expectedSha256, reason}) {
  nonempty(reason,'Skill change reason');
  if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>512*1024||/[\x00-\x08\x0e-\x1f]/.test(text)) fail('Skill content must be nonempty UTF-8 text up to 512 KB');
  if(!/^[a-f0-9]{64}$/.test(expectedSha256||'')) fail('Read the resource first and supply its expectedSha256');
  const previous=await readAgentResource(profile,requestedPath,{limit:1200});
  if(!/\.(?:md|txt)$/i.test(previous.path)) fail('write_skill edits skill instructions and references (.md/.txt), not executable code');
  if(skillWrites.has(previous.path)) fail('Another skill write is in progress; read again and retry');
  skillWrites.set(previous.path,true);
  try {
    const before=await fs.readFile(previous.path);
    if(digest(before)!==expectedSha256) fail('Skill changed since read; read the latest text and revise against its SHA-256');
    if(path.basename(previous.path)==='SKILL.md' && (!/^---\r?\n/.test(text)||!/^name:\s*\S+/m.test(text)||!/^description:\s*\S+/m.test(text))) fail('SKILL.md requires YAML frontmatter with name and description');
    const root=profile.resourceRoots.find(r=>within(r.path,previous.path));
    const changeId=randomUUID(),historyRoot=path.join(path.dirname(profile.configPath),'skill-history',changeId);
    await fs.mkdir(historyRoot,{recursive:true});
    await fs.writeFile(path.join(historyRoot,'before.txt'),before,{flag:'wx'});
    await fs.writeFile(path.join(historyRoot,'after.txt'),text,{flag:'wx'});
    let target=previous.path,nextConfig;
    // Never mutate signed application resources. Fork the enabled package to a
    // writable profile-owned location, retaining its manifest and relative links.
    if(/\.app(?:[\/\\]|$)/.test(root.packageRoot||root.path)) {
      const packageRoot=root.packageRoot||root.path,copyRoot=path.join(path.dirname(profile.configPath),'agent-packages',root.packageId+'-'+changeId);
      await fs.mkdir(path.dirname(copyRoot),{recursive:true});await fs.cp(packageRoot,copyRoot,{recursive:true,dereference:true});
      target=path.join(copyRoot,path.relative(packageRoot,previous.path));
      nextConfig={...profile.config,packages:profile.config.packages.map(p=>p.id===root.packageId?{...p,path:copyRoot}:p)};
    }
    const temp=target+'.'+changeId+'.tmp';
    try {await fs.writeFile(temp,text,{flag:'wx'});if(digest(await fs.readFile(previous.path))!==expectedSha256)fail('Skill changed during write; read again');await fs.rename(temp,target);}finally{await fs.rm(temp,{force:true});}
    if(nextConfig)await saveAgentProfile(nextConfig,{configPath:profile.configPath});
    const receipt={schema:'agentcv-skill-change-1',id:changeId,path:target,previousPath:previous.path,packageId:root.packageId,previousSha256:expectedSha256,sha256:digest(text),reason,at:new Date().toISOString(),historyPath:historyRoot,reload:'Read the updated file now; skill discovery/system prompt refresh on a new agent session or reset. Existing conversation context is retained.'};
    await fs.writeFile(path.join(historyRoot,'change.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
    return receipt;
  } finally {skillWrites.delete(previous.path);}
}
async function cli() {
  const command=process.argv[2];
  if(!['--get','--save','--inspect'].includes(command)) fail('Usage: node agent-resources.mjs --get|--save|--inspect');
  let result;
  if(command==='--save' || command==='--inspect') {
    let text=''; for await(const chunk of process.stdin) text+=chunk;
    const input=JSON.parse(text);
    result=command==='--inspect' ? await inspectAgentPackage(input.path) : describeAgentProfile(await saveAgentProfile(input));
  } else result=describeAgentProfile(await readAgentProfileForSettings());
  process.stdout.write(JSON.stringify(result)+'\n');
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) cli().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
