import {immutableJson,freezeParsedJson} from './json-snapshot.js';
const nativeFacts=new WeakMap();
export function sealParsedNativeExecutionFacts(result){
 for(const run of result.runs||[]){
  for(const key of ['result','procedureTrace','structuredLayers','nativeResult'])if(run[key]!==undefined)run[key]=freezeParsedJson(run[key]);
  for(const artifact of run.artifacts||[])if(artifact.data!==undefined)artifact.data=freezeParsedJson(artifact.data);
 }
 return result;
}
export function rememberNativeExecutionFacts(run){
 if(run.nativeFactRef?.kind==='runtime-memory'&&Array.isArray(run.nativeFactFields))nativeFacts.set(run.nativeFactRef,new Map(run.nativeFactFields.map(key=>[key,run[key]])));
}
export function nativeExecutionFactFields(run){
 const saved=run.nativeFactRef&&nativeFacts.get(run.nativeFactRef);
 return saved&&run.nativeFactFields?.length===saved.size&&run.nativeFactFields.every(key=>saved.has(key)&&saved.get(key)===run[key])?new Set(saved.keys()):null;
}

// Execution facts never change after validation. Explanations are separate
// revisions; artifact paths, preview URLs and selection remain editable.
export function sealAlgorithmExecutionFacts(run){
 for(const key of ['result','procedureTrace','structuredLayers','nativeResult'])if(run[key]!==undefined)run[key]=immutableJson(run[key]);
 for(const artifact of run.artifacts||[])if(artifact.data!==undefined)artifact.data=immutableJson(artifact.data);
 return run;
}
export function sealProjectExecutionFacts(data){
 for(const run of data.algorithmRuns||[])sealAlgorithmExecutionFacts(run);
 // Each stored execution owns a historical definition, never the editable
 // current scheme. Sharing its normalized frozen tree keeps undo snapshots
 // from copying the same source and parameters for every historical cycle.
 for(const execution of data.datasetExecutions||[]){
  if(execution.schemeSnapshot!==undefined)execution.schemeSnapshot=immutableJson(execution.schemeSnapshot);
  // A completed unit is an observation. Only the surrounding batch counters,
  // progress and UI timing keep changing. Share each immutable unit across
  // undo snapshots instead of cloning all prior units on every execution.
  if(Array.isArray(execution.units))execution.units=execution.units.map(unit=>immutableJson(unit));
 }
}
