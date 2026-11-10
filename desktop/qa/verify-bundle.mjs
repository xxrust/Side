// Verify the delivered bundle and its actual Pi sidecar without driving a GUI.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=process.argv[2]?path.resolve(process.argv[2]):path.resolve(root,'../AgentCV.app');
const resources=path.join(app,'Contents/Resources/bridge');
execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'pipe'});
const architecture=execFileSync('file',[path.join(app,'Contents/MacOS/agentcv-desktop')],{encoding:'utf8'}).trim();
assert.match(architecture,/Mach-O 64-bit executable arm64/);
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const resourcesVerified={};
for(const name of ['pi-bridge.mjs','pi-auth.mjs','agent-contract.json','cv-runtime.py']){
  assert.equal(digest(path.join(resources,name)),digest(path.join(root,'scripts',name)));
  resourcesVerified[name]=digest(path.join(resources,name));
}
fs.mkdirSync(path.join(root,'runtime'),{recursive:true});
const node=path.join(os.homedir(),'.local/bin/node');
const child=spawn(node,[path.join(resources,'pi-bridge.mjs')],{
  cwd:path.join(root,'runtime'),env:{...process.env,PI_OFFLINE:'1',PI_TELEMETRY:'0'},stdio:['pipe','pipe','pipe'],
});
let buffer='',ready;
const timer=setTimeout(()=>child.kill(),30000);
child.stdout.setEncoding('utf8');
child.stdout.on('data',chunk=>{
  buffer+=chunk;let split;
  while((split=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,split);buffer=buffer.slice(split+1);
    const event=JSON.parse(line);
    if(event.type==='ready'){
      ready={model:event.model,availableModelCount:event.models.length,tools:event.tools};
      child.stdin.end();
    }
  }
});
const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal}))});
clearTimeout(timer);
assert.equal(exit.code,0);
assert.ok(ready);const expectedTools=JSON.parse(fs.readFileSync(path.join(root,'scripts/agent-contract.json'))).tools.map(t=>t.function.name);assert.deepEqual(ready.tools,expectedTools);
const evidence={checkedAt:new Date().toISOString(),bundle:app,node,architecture,signature:'valid local ad-hoc signature',resourcesVerified,piBridge:ready,nativeUiAcceptance:'Not assessed by this bundle verifier; see the separately recorded native UI run.'};
fs.writeFileSync(path.join(root,'qa/bundle-verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
