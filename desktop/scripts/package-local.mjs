// Build without touching a running bundle; deliver the signed app at the repo root.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {installLocalBundle} from './install-local-bundle.mjs';
const desktop=path.resolve(import.meta.dirname,'..'),repo=path.dirname(desktop);
const cli=path.join(desktop,'node_modules/.bin/tauri'),staging=path.join(desktop,'runtime/local-package-target');
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{cwd:desktop,stdio:'inherit',env});if(r.error)throw r.error;if(r.status!==0)throw Error(cmd+' exited '+r.status);}
run(process.execPath,[path.join(desktop,'scripts/check-selection-regression.mjs')]);
run(cli,['build','--no-bundle']);
await fs.mkdir(path.join(staging,'release'),{recursive:true});
await fs.copyFile(path.join(desktop,'src-tauri/target/release/agentcv-desktop'),path.join(staging,'release/agentcv-desktop'));
run(cli,['bundle','--bundles','app'],{...process.env,CARGO_TARGET_DIR:staging});
const bundle=path.join(staging,'release/bundle/macos/AgentCV.app'),target=path.join(repo,'AgentCV.app');
run('codesign',['--verify','--deep','--strict',bundle]);
const active=execFileSync('ps',['-axo','comm='],{encoding:'utf8'}).split('\n').some(s=>s.trim()===path.join(target,'Contents/MacOS/agentcv-desktop'));
const destination=active?path.join(repo,'AgentCV-待替換.app'):target;
const temporary=path.join(repo,`.AgentCV-install-${process.pid}.app`);
run('ditto',[bundle,temporary]);run('codesign',['--verify','--deep','--strict',temporary]);
await installLocalBundle(temporary,destination);
const version=JSON.parse(await fs.readFile(path.join(desktop,'package.json'),'utf8')).version;
let fileTypeRegistered=false;
if(!active){
 const registration=spawnSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',['-f',destination],{stdio:'inherit'});
 fileTypeRegistered=registration.status===0;
}
const receipt={version,path:destination,backup:null,runningAppReplaced:false,requiresQuit:active,fileTypeRegistered,builtAt:new Date().toISOString()};
await fs.writeFile(path.join(desktop,'runtime/local-app-install.json'),JSON.stringify(receipt,null,2)+'\n');
await fs.rm(bundle,{recursive:true,force:true});
console.log(active?'目前根目錄程式仍在運行；新版已保存為 '+destination+'，退出後可替換。':'已交付 '+destination+' · '+version);
