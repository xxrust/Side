// All adapters use AgentCV's LF-delimited JSON stdio contract.
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadRuntimeAgentProfile,describeAgentProfile} from './agent-resources.mjs';
const emit = event => process.stdout.write(JSON.stringify(event)+'\n');
const fatal = error => emit({type:'fatal',error:String(error?.message || error),category:'adapter'});
async function main() {
  const profile = await loadRuntimeAgentProfile();
  process.env.AGENTCV_AGENT_CONFIG = profile.configPath;
  process.env.AGENTCV_RESOURCE_DIR ||= fileURLToPath(new URL('../agent-packages/',import.meta.url));
  process.env.AGENTCV_RESOURCES_API ||= fileURLToPath(new URL('./agent-resources.mjs',import.meta.url));
  process.env.AGENTCV_TOOL_CONTRACT ||= fileURLToPath(new URL('./agent-contract.json',import.meta.url));
  if (profile.activeAdapter.id==='codex') { await import('./codex-bridge.mjs'); return; }
  if (profile.activeAdapter.id==='pi') { await import('./pi-bridge.mjs'); return; }
  const adapter=profile.activeAdapter;
  if(adapter.protocol!=='agentcv-stdio-1') throw Error(`Unsupported adapter protocol: ${adapter.protocol}`);
  const child=spawn(process.execPath,[adapter.entry],{stdio:['pipe','pipe','inherit'],env:{...process.env,AGENTCV_ADAPTER_PROTOCOL:'agentcv-stdio-1'}});
  let stopping=false, timer, eofTimer, failed=false, buffer='';
  const report=error=>{if(failed)return;failed=true;fatal(error);process.exitCode=1;};
  const stop=signal=>{if(stopping)return;stopping=true;child.kill(signal);timer=setTimeout(()=>child.kill('SIGKILL'),3000);timer.unref();};
  const term=()=>stop('SIGTERM'), interrupt=()=>stop('SIGINT');
  process.on('SIGTERM',term); process.on('SIGINT',interrupt);
  process.stdin.pipe(child.stdin);
  const stdinEnd=()=>{eofTimer=setTimeout(()=>stop('SIGTERM'),3000);eofTimer.unref();};
  process.stdin.once('end',stdinEnd);
  child.stdin.on('error',error=>{if(error.code!=='EPIPE'){report(error);stop('SIGTERM');}});
  const forward=line=>{
    let event;
    try { event=JSON.parse(line); } catch { report(`Adapter ${adapter.id} emitted invalid LF JSON`);stop('SIGTERM');return; }
    if(event?.type!=='ready'){process.stdout.write(line+'\n');return;}
    const advertised=event.runtime && typeof event.runtime==='object' && !Array.isArray(event.runtime) ? event.runtime : {};
    const skills=Array.isArray(advertised.skills) ? advertised.skills : Array.isArray(event.skills) ? event.skills : [];
    const extensions=Array.isArray(advertised.extensions) ? advertised.extensions : Array.isArray(event.extensions) ? event.extensions : [];
    const capabilities=advertised.capabilities ?? event.capabilities;
    const resourceState=Array.isArray(advertised.skills) || Array.isArray(event.skills) ? (advertised.resourceState ?? event.resourceState ?? 'REPORTED') : 'OFFERED';
    emit({...event,runtime:{...advertised,...describeAgentProfile(profile),skills,extensions,...(capabilities===undefined?{}:{capabilities}),resourceState}});
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(line.trim())forward(line);}});
  child.stdout.on('end',()=>{if(buffer.trim())report(`Adapter ${adapter.id} stdout ended without LF-delimited JSON`);});
  child.once('error',error=>{report(error);});
  child.once('close',(code,signal)=>{
    clearTimeout(timer);clearTimeout(eofTimer);process.off('SIGTERM',term);process.off('SIGINT',interrupt);
    process.stdin.off('end',stdinEnd);process.stdin.unpipe(child.stdin);process.stdin.pause();
    if(!stopping && (code!==0 || signal)){report(`Adapter ${adapter.id} exited ${signal ? `with signal ${signal}` : `with code ${code}`}`);process.exitCode=code || 1;}
    else if(!failed)process.exitCode=code || 0;
  });
}
main().catch(error=>{fatal(error);process.exitCode=1;});
