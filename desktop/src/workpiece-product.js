// Durable workpiece facts, independent of transient UI timings and audit views.
// The native session uses this production path as its migration oracle.
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
export function workpieceRegression(spec,resolution,result,{faults=[],cancelled=false,knownCategoryIds=spec.categories.map(category=>String(category.id))}={}){
 const expected=resolution.expected,known=Array.isArray(expected?.categoryIds)&&expected.categoryIds.length===1&&expected.provenance?.type==='human'&&expected.provenance.status==='confirmed'&&typeof expected.provenance.ref==='string'&&expected.provenance.ref.trim().length>0&&expected.categoryIds.every(id=>knownCategoryIds.includes(String(id)));
 const regression=!known?{status:resolution.reason==='EXPECTED_SOURCE_LABEL_UNMAPPED'?'UNMAPPED':'UNLABELLED',...(resolution.reason?{reason:resolution.reason}:{}),...(expected?{reason:expected.categoryIds?.length!==1?'EXPECTED_FINAL_CATEGORY_NOT_UNIQUE':'EXPECTED_SOURCE_UNCONFIRMED_OR_CATEGORY_UNDEFINED'}:{})}:faults.length?{status:'FAULT',expected:expected.categoryIds}:cancelled||!result.valid?{status:'NOT_EVALUATED',expected:expected.categoryIds}:{status:[...result.categoryIds].sort().join('|')===[...expected.categoryIds].sort().join('|')?'MATCH':'MISMATCH',expected:expected.categoryIds};
 if(known)regression.expectedProvenance=clone(expected.provenance);
 regression.labelSource=clone(resolution.origin);
 return {known,regression};
}
export function workpieceRecordFields({unit,imageIds,referenceInputs,referenceIdentities,fingerprint,runs,regression,result,faults=[],cancelled=false}){
 return {schema:'agentcv-workpiece-result-1',unitId:unit.id,imageIds,views:unit.views||null,referenceInputs:clone(referenceInputs),referenceIdentities,finalExit:cancelled?'CANCELLED':faults.length?'FAULT':'PRODUCT:'+result.categoryId,schemeFingerprint:fingerprint,regression,runIds:runs.map(run=>run.runId)};
}
