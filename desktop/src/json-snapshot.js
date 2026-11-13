// Copy JSON data without encoding large immutable image strings and parsing them
// again on the UI thread. Containers remain independent for undo/history.
const immutableValues=new WeakSet();
export const isImmutableJson=value=>!!value&&typeof value==='object'&&immutableValues.has(value);
function snapshot(value,{shareImmutable=false,freeze=false}={}){
 const stack=new Set();
 const assign=(target,key,item)=>{
  // Keep the JSON-shaped snapshot safe for the special __proto__ key without
  // paying the defineProperty cost for every ordinary field.
  if(key==='__proto__')Object.defineProperty(target,key,{value:item,writable:true,enumerable:true,configurable:true});
  else target[key]=item;
 };
 function copy(value,key=''){
  if(shareImmutable&&isImmutableJson(value))return value;
  if(value&&typeof value.toJSON==='function')value=value.toJSON(key);
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?(value===0?0:value):null;
  if(typeof value==='bigint')throw new TypeError('BigInt cannot be serialized');
  if(typeof value!=='object')return undefined;
  if(stack.has(value))throw new TypeError('Circular JSON data');stack.add(value);
  let result;
  if(Array.isArray(value)){result=new Array(value.length);for(let i=0;i<value.length;i++)result[i]=copy(value[i],String(i))??null;}
  else {result={};for(const key of Object.keys(value)){const item=copy(value[key],key);if(item!==undefined)assign(result,key,item);}}
  stack.delete(value);
  if(freeze){Object.freeze(result);immutableValues.add(result);}
  return result;
 }
 return copy(value);
}
// Ordinary callers still receive detached, editable containers. Only project
// history shares values created by immutableJson, which freezes every child
// after JSON normalization. Object.freeze on an arbitrary root is insufficient.
export const jsonSnapshot=value=>snapshot(value);
export const immutableJson=value=>snapshot(value,{shareImmutable:true,freeze:true});
export const projectSnapshot=value=>snapshot(value,{shareImmutable:true});

// Only for newly parsed, privately owned JSON from the native binary response.
// JSON.parse has already detached every container; copying it again before
// freezing just duplicates the largest execution facts on the UI thread.
// Ordinary caller-owned values must continue through immutableJson instead.
export function freezeParsedJson(value){
 if(typeof value==='number')return Number.isFinite(value)?(value===0?0:value):null;
 if(value===null||typeof value!=='object')return value;
 if(immutableValues.has(value))return value;
 // Parsed strings, booleans and ordinary finite numbers already have their
 // final value. Avoid a recursive call and a write for every scalar sample.
 if(Array.isArray(value)){for(let i=0;i<value.length;i++){
  const item=value[i];if(item!==null&&typeof item==='object')freezeParsedJson(item);
  else if(typeof item==='number'){if(item===0)value[i]=0;else if(!Number.isFinite(item))value[i]=null;}
 }}else for(const key of Object.keys(value)){
  const item=value[key];if(item!==null&&typeof item==='object')freezeParsedJson(item);
  else if(typeof item==='number'){if(item===0)value[key]=0;else if(!Number.isFinite(item))value[key]=null;}
 }
 Object.freeze(value);immutableValues.add(value);return value;
}
