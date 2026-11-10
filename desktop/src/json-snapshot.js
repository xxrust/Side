// Copy JSON data without encoding large immutable image strings and parsing them
// again on the UI thread. Containers remain independent for undo/history.
export function jsonSnapshot(value){
 const stack=new Set();
 const assign=(target,key,item)=>{
  // Keep the JSON-shaped snapshot safe for the special __proto__ key without
  // paying the defineProperty cost for every ordinary field.
  if(key==='__proto__')Object.defineProperty(target,key,{value:item,writable:true,enumerable:true,configurable:true});
  else target[key]=item;
 };
 function copy(value,key=''){
  if(value&&typeof value.toJSON==='function')value=value.toJSON(key);
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?(value===0?0:value):null;
  if(typeof value==='bigint')throw new TypeError('BigInt cannot be serialized');
  if(typeof value!=='object')return undefined;
  if(stack.has(value))throw new TypeError('Circular JSON data');stack.add(value);
  let result;
  if(Array.isArray(value)){result=new Array(value.length);for(let i=0;i<value.length;i++)result[i]=copy(value[i],String(i))??null;}
  else {result={};for(const key of Object.keys(value)){const item=copy(value[key],key);if(item!==undefined)assign(result,key,item);}}
  stack.delete(value);return result;
 }
 return copy(value);
}
