// Private native wire protocol. Restore complete immutable facts before the
// ordinary result importer, source audit or disk oracle can observe the result.
import {freezeParsedJson} from './json-snapshot.js';
const own=(object,key)=>Object.hasOwn(object,key);
const invalid=()=>{throw Error('SESSION_SHARED_FACTS_INVALID');};
function pathValid(path){
 if(!Array.isArray(path)||path.length<3||path.length>128||path[0]!=='runs'||!Number.isSafeInteger(path[1])||path[1]<0)return false;
 const fact=['result','procedureTrace','structuredLayers','nativeResult'].includes(path[2]);
 const artifact=path[2]==='artifacts'&&path.length>=5&&Number.isSafeInteger(path[3])&&path[3]>=0&&path[4]==='data';
 return (fact||artifact)&&path.every(p=>typeof p==='string'||Number.isSafeInteger(p)&&p>=0);
}
function read(root,path){
 let value=root;
 for(const key of path){
  if(value===null||typeof value!=='object'||!own(value,key)||(Array.isArray(value)?!Number.isSafeInteger(key):typeof key!=='string'))invalid();
  value=value[key];
 }
 return value;
}
const prefix=(a,b)=>a.length<=b.length&&a.every((key,i)=>key===b[i]);
export function restoreSharedNativeFacts(result){
 if(!own(result,'_sharedFacts'))return {links:0};
 const meta=result._sharedFacts;
 if(!meta||meta.backend!=='rust-shared-facts-v1'||!Array.isArray(meta.links)||!meta.links.length||meta.links.length>4096)invalid();
 for(const link of meta.links){
  if(!link||!pathValid(link.from)||!pathValid(link.to)||prefix(link.from,link.to)||prefix(link.to,link.from))invalid();
  const source=read(result,link.from),parent=read(result,link.to.slice(0,-1)),key=link.to.at(-1);
  if(source===null||typeof source!=='object'||parent===null||typeof parent!=='object'||Object.isFrozen(parent)||read(result,link.to)!==null)invalid();
  // Earlier sources are complete before a later alias uses them. Freezing also
  // rejects a corrupted link that attempts to write back into an earlier source.
  const frozen=freezeParsedJson(source);
  Object.defineProperty(parent,key,{value:frozen,writable:true,enumerable:true,configurable:true});
 }
 delete result._sharedFacts;
 return {links:meta.links.length};
}
