import {isImmutableJson} from './json-snapshot.js';
// Compare JSON data without allocating sorted copies and serialized strings.
// Native responses and project snapshots are ordinary data. Unusual objects
// retain the previous canonical-JSON behavior through the slow path.
const unsupported=Symbol('non-json-data');
const omitted=value=>{
 // JSON.stringify invokes a function's toJSON before deciding to omit it.
 if(typeof value==='function'&&typeof value.toJSON==='function')throw unsupported;
 return value===undefined||typeof value==='function'||typeof value==='symbol';
};
const unusual=value=>{
 if(value===null||typeof value!=='object')return false;
 if(typeof value.toJSON==='function')return true;
 const proto=Object.getPrototypeOf(value);
 return !Array.isArray(value)&&proto!==Object.prototype&&proto!==null;
};
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
export function jsonDataEqual(left,right){
 const leftPath=new Set(),rightPath=new Set();
 const scalar=value=>typeof value==='number'&&!Number.isFinite(value)?null:value;
 function equal(a,b){
  a=scalar(a);b=scalar(b);
  if(omitted(a)||omitted(b))return omitted(a)&&omitted(b);
  if(typeof a==='bigint'||typeof b==='bigint')throw unsupported;
  if(unusual(a)||unusual(b))throw unsupported;
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return a===b;
  if(a===b&&isImmutableJson(a))return true;
  if(leftPath.has(a)||rightPath.has(b))throw unsupported;
  const array=Array.isArray(a);
  if(array!==Array.isArray(b))return false;
  leftPath.add(a);rightPath.add(b);
  let same=true;
  if(array){
   same=a.length===b.length;
   for(let i=0;same&&i<a.length;i++)same=equal(omitted(a[i])?null:a[i],omitted(b[i])?null:b[i]);
  }else{
   let count=0,other=0;
   for(const key of Object.keys(a))if(!omitted(a[key])){
    count++;if(!Object.hasOwn(b,key)||omitted(b[key])||!equal(a[key],b[key])){same=false;break;}
   }
   if(same){for(const key of Object.keys(b))if(!omitted(b[key]))other++;same=count===other;}
  }
  leftPath.delete(a);rightPath.delete(b);return same;
 }
 try{return equal(left,right);}catch(error){if(error!==unsupported)throw error;return canonical(left)===canonical(right);}
}
