// Generated from workpiece-schema.js; do not edit. No runtime eval.
import helper0Module from "ajv/dist/runtime/ucs2length.js"; const helper0 = helper0Module.default || helper0Module;
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","title":"AgentCV compiled workpiece plan","type":"object","required":["id","execution","classificationSpec","operatorGraph","metricBindings"],"properties":{"id":{"type":"string","minLength":1},"version":{"type":["number","string"]},"execution":{"type":"object","required":["unit","inputSlots"],"properties":{"unit":{"const":"workpiece"},"dataContracts":{"enum":["required","legacy"],"description":"New schemes use required: every declared artifact and connected input has an explicit dataContract. Legacy schemes warn about untyped ports."},"timingRequirement":{"type":"object","required":["maxUnitMs","provenance"],"properties":{"maxUnitMs":{"type":"number","exclusiveMinimum":0},"provenance":{"$ref":"#/$defs/provenance"}},"description":"Optional sourced workpiece wall-time target in milliseconds; absence asks the human and never invents a limit."},"referenceInputs":{"type":"object","additionalProperties":{"type":"string","minLength":1},"description":"Fixed reference assets, slot to image ID. These are not workpiece views or regression units; Python references[slot] and reference_records[slot] expose actual pixels and provenance."},"inputSlots":{"type":"array","minItems":1,"items":{"type":"object","required":["id","required"],"properties":{"id":{"type":"string","minLength":1},"required":{"type":"boolean"}}}}}},"classificationSpec":{"$ref":"#/$defs/classification"},"operatorGraph":{"type":"object","required":["nodes","edges"],"properties":{"nodes":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/node"}},"edges":{"type":"array","items":{"type":"object","required":["from","to"],"properties":{"from":{"type":"string","minLength":1},"to":{"type":"string","minLength":1}}}}}},"metricBindings":{"type":"array","items":{"type":"object","required":["metric","nodeId","path"],"properties":{"metric":{"type":"string","minLength":1},"nodeId":{"type":"string","minLength":1},"path":{"type":"string","minLength":1,"description":"Dot path within the actual producer run.result, not an image ID or filename."}}}}},"$defs":{"decisionEvidence":{"type":"array","minItems":1,"items":{"type":"object","required":["nodeId","artifactId"],"properties":{"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1},"label":{"type":"string"}}},"description":"Explicit image references in this scheme. Categories use these for OK/fallback; matched rules use them for NG; metrics use them when missing. Resolved only against the same workpiece execution."},"provenance":{"type":"object","required":["type","ref","status"],"properties":{"type":{"enum":["human","document","agent-inference"]},"ref":{"type":"string","minLength":1},"status":{"enum":["confirmed","inferred"]},"authorization":{"type":"string","minLength":1,"description":"Required for agent-inference, which must retain inferred status."}}},"interval":{"type":"object","required":["min","max","includeMin","includeMax"],"properties":{"min":{"type":"number"},"max":{"type":"number"},"includeMin":{"type":"boolean"},"includeMax":{"type":"boolean"}}},"condition":{"oneOf":[{"type":"object","required":["metric","equals"],"additionalProperties":false,"properties":{"metric":{"type":"string","minLength":1},"equals":{"type":["number","boolean","string"]}}},{"type":"object","required":["metric","in"],"additionalProperties":false,"properties":{"metric":{"type":"string","minLength":1},"in":{"type":"array","minItems":1,"items":{"type":["number","boolean","string"]}}}},{"type":"object","required":["metric","interval"],"additionalProperties":false,"properties":{"metric":{"type":"string","minLength":1},"interval":{"$ref":"#/$defs/interval"}}},{"type":"object","required":["all"],"additionalProperties":false,"properties":{"all":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/condition"}}}},{"type":"object","required":["any"],"additionalProperties":false,"properties":{"any":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/condition"}}}},{"type":"object","required":["not"],"additionalProperties":false,"properties":{"not":{"$ref":"#/$defs/condition"}}}]},"metric":{"type":"object","required":["id"],"properties":{"id":{"type":"string","minLength":1},"evidence":{"$ref":"#/$defs/decisionEvidence"},"type":{"enum":["number","boolean","enum"],"default":"number"},"unit":{"type":"string"},"range":{"type":"object","required":["min","max"],"properties":{"min":{"type":"number"},"max":{"type":"number"}}},"values":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"string"}}},"description":"number requires unit and finite range min<max. boolean requires no numeric encoding. enum requires finite values. Compiler enforces conditional requirements."},"classification":{"type":"object","description":"One classification decision per specification. Rules, missing mappings and fallback are conditions on outgoing category branches, never extra operator nodes. Final category aggregation and rule-conflict priority remain explicit. Independent sequential algorithm decisions remain in their own procedures.","required":["schema","id","provenance","categories","metrics","rules","coverage","missing","conflicts","aggregation","fault"],"properties":{"schema":{"const":"agentcv-classification-spec-1"},"id":{"type":"string","minLength":1},"provenance":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/provenance"}},"categories":{"type":"array","minItems":1,"items":{"type":"object","required":["id","label","quality"],"properties":{"id":{"type":"string","minLength":1},"label":{"type":"string","minLength":1},"evidence":{"$ref":"#/$defs/decisionEvidence"},"quality":{"enum":["good","bad","undetermined"]}}}},"metrics":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/metric"}},"rules":{"type":"array","minItems":1,"items":{"type":"object","required":["id","categoryId","when"],"properties":{"id":{"type":"string","minLength":1},"categoryId":{"type":"string","minLength":1},"label":{"type":"string"},"evidence":{"$ref":"#/$defs/decisionEvidence"},"defectLabels":{"type":"array","items":{"type":"string","minLength":1}},"when":{"$ref":"#/$defs/condition"}}}},"coverage":{"type":"object","required":["policy"],"properties":{"policy":{"enum":["exhaustive","fallback"]},"fallbackCategoryId":{"type":"string","minLength":1}},"description":"Compound all/any/not requires explicit fallback; simple numeric intervals and discrete domains can be checked for exhaustive coverage."},"missing":{"type":"object","required":["NOT_FOUND","MISSING","SKIPPED"],"properties":{"NOT_FOUND":{"type":"string","minLength":1},"MISSING":{"type":"string","minLength":1},"SKIPPED":{"type":"string","minLength":1}}},"conflicts":{"type":"object","required":["mode"],"properties":{"mode":{"enum":["priority","multilabel"]},"priority":{"type":"array","items":{"type":"string","minLength":1}}}},"aggregation":{"type":"object","description":"Exactly one final category. priority orders all categories. Legacy all-good is accepted only for one metric with priority rules, where uniqueness is provable; multilabel is never a final exit.","required":["mode"],"properties":{"mode":{"enum":["all-good","priority"]},"priority":{"type":"array","items":{"type":"string","minLength":1}}}},"fault":{"type":"object","required":["exit"],"properties":{"exit":{"const":"FAULT"}}}}},"selector":{"oneOf":[{"type":"object","required":["kind","type","id"],"properties":{"kind":{"const":"artifact"},"type":{"enum":["image","evidence","file"]},"id":{"type":"string","minLength":1}}},{"type":"object","required":["kind","id"],"properties":{"kind":{"const":"gate"},"id":{"type":"string","minLength":1}}},{"type":"object","required":["kind"],"properties":{"kind":{"const":"execution-status"}}}]},"justification":{"type":"object","description":"Optional legacy explanation and explicit references. New prose uses documentation."},"node":{"type":"object","required":["id","expected_outputs"],"anyOf":[{"required":["code"]},{"required":["nativePlan"]}],"properties":{"id":{"type":"string","minLength":1},"title":{"type":"string"},"parentId":{"type":"string","minLength":1,"description":"At most three engineering node levels; graph container and internal operators do not add levels. Parent purpose validity aggregates descendants, and the parent own execution record remains separate and immutable."},"code":{"type":"string","minLength":1,"description":"Optional arbitrary runnable Python. Use this only when the node has no nativePlan."},"nativePlan":{"type":"object","required":["backend","plan"],"properties":{"backend":{"const":"rust-native"},"plan":{"type":"object","required":["nodes"],"properties":{"nodes":{"type":"array","minItems":1,"items":{"type":"object","required":["op"],"properties":{"op":{"type":"string","minLength":1},"params":{"type":"object"}}}}}}},"description":"Typed Rust execution plan. Its backend is explicit and is preferred over Python."},"executionBackend":{"enum":["rust-native","python-extension"],"description":"Resolved backend recorded for audit; nativePlan is required for rust-native."},"parameters":{"type":"object"},"expected_outputs":{"type":"array","minItems":1,"maxItems":48,"items":{"type":"object","required":["id","type"],"properties":{"id":{"type":"string","minLength":1,"pattern":"^[A-Za-z0-9_.-]{1,120}$"},"type":{"enum":["image","evidence","file"]},"dataContract":{"title":"AgentCV node data contract","description":"Explicit port meaning. Exact kind, frame and units must agree across an edge; no implicit conversion. Geometry JSON repeats coordinates; measurements contain value/unit; homography contains matrix/from/to. Contracts do not prove algorithm accuracy.","anyOf":[{"type":"object","properties":{"kind":{"enum":["image","mask"]},"coordinates":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","coordinates"],"additionalProperties":false},{"type":"object","properties":{"kind":{"enum":["points","contours","roi"]},"coordinates":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","coordinates"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"homography"},"from":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false},"to":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","from","to"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"measurement"},"unit":{"type":"string","minLength":1}},"required":["kind","unit"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"classification"},"categories":{"type":"array","items":{"type":"string","minLength":1},"minItems":1,"uniqueItems":true}},"required":["kind","categories"],"additionalProperties":false},{"type":"object","properties":{"kind":{"enum":["json","file"]}},"required":["kind"],"additionalProperties":false}]},"role":{"enum":["result","intermediate"]}}}},"inputs":{"type":"object","additionalProperties":{"type":"object","required":["nodeId","artifactId"],"properties":{"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1},"dataContract":{"title":"AgentCV node data contract","description":"Explicit port meaning. Exact kind, frame and units must agree across an edge; no implicit conversion. Geometry JSON repeats coordinates; measurements contain value/unit; homography contains matrix/from/to. Contracts do not prove algorithm accuracy.","anyOf":[{"type":"object","properties":{"kind":{"enum":["image","mask"]},"coordinates":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","coordinates"],"additionalProperties":false},{"type":"object","properties":{"kind":{"enum":["points","contours","roi"]},"coordinates":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","coordinates"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"homography"},"from":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false},"to":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","from","to"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"measurement"},"unit":{"type":"string","minLength":1}},"required":["kind","unit"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"classification"},"categories":{"type":"array","items":{"type":"string","minLength":1},"minItems":1,"uniqueItems":true}},"required":["kind","categories"],"additionalProperties":false},{"type":"object","properties":{"kind":{"enum":["json","file"]}},"required":["kind"],"additionalProperties":false}]}}},"description":"Each slot needs a matching graph edge and actual declared upstream artifact. Python receives upstream[slot].artifact.data or upstream[slot].image."},"when":{"type":"object","required":["nodeId","status"],"properties":{"nodeId":{"type":"string","minLength":1},"status":{"enum":["VALID","NOT_FOUND","FAULT","COMPLETED"]}}},"prerequisites":{"type":"object","properties":{"anyOf":{"type":"array","items":{"type":"string","minLength":1}}}},"documentation":{"type":"string","maxLength":64000,"description":"自由 Markdown 節點文章：從檢測實體、缺陷或關係的本質出發，把特徵定位、身份依據、數值量測與實際判定講清楚。按需配可追溯實測圖及自包含 HTML/SVG 原理圖解，區分實測、推估與示意；無固定欄目，不虛構試驗。"},"justification":{"$ref":"#/$defs/justification"}}},"unit":{"type":"object","required":["id","imageIds"],"properties":{"id":{"type":"string","minLength":1},"imageIds":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"string","minLength":1}},"views":{"type":"object","additionalProperties":{"type":"string","minLength":1}},"expected":{"type":"object","required":["categoryIds","provenance"],"properties":{"categoryIds":{"type":"array","items":{"type":"string","minLength":1},"minItems":1,"maxItems":1,"uniqueItems":true},"provenance":{"type":"object","required":["type","status","ref"],"properties":{"type":{"const":"human"},"status":{"const":"confirmed"},"ref":{"type":"string","minLength":1}}}}}},"description":"Normally one image per physical workpiece. Multi-view requires named views matching execution.inputSlots. Expected labels are optional and never inferred from file names."}}};
const schema32 = {"type":"object","required":["type","ref","status"],"properties":{"type":{"enum":["human","document","agent-inference"]},"ref":{"type":"string","minLength":1},"status":{"enum":["confirmed","inferred"]},"authorization":{"type":"string","minLength":1,"description":"Required for agent-inference, which must retain inferred status."}}};
const func1 = helper0;
const schema33 = {"type":"object","description":"One classification decision per specification. Rules, missing mappings and fallback are conditions on outgoing category branches, never extra operator nodes. Final category aggregation and rule-conflict priority remain explicit. Independent sequential algorithm decisions remain in their own procedures.","required":["schema","id","provenance","categories","metrics","rules","coverage","missing","conflicts","aggregation","fault"],"properties":{"schema":{"const":"agentcv-classification-spec-1"},"id":{"type":"string","minLength":1},"provenance":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/provenance"}},"categories":{"type":"array","minItems":1,"items":{"type":"object","required":["id","label","quality"],"properties":{"id":{"type":"string","minLength":1},"label":{"type":"string","minLength":1},"evidence":{"$ref":"#/$defs/decisionEvidence"},"quality":{"enum":["good","bad","undetermined"]}}}},"metrics":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/metric"}},"rules":{"type":"array","minItems":1,"items":{"type":"object","required":["id","categoryId","when"],"properties":{"id":{"type":"string","minLength":1},"categoryId":{"type":"string","minLength":1},"label":{"type":"string"},"evidence":{"$ref":"#/$defs/decisionEvidence"},"defectLabels":{"type":"array","items":{"type":"string","minLength":1}},"when":{"$ref":"#/$defs/condition"}}}},"coverage":{"type":"object","required":["policy"],"properties":{"policy":{"enum":["exhaustive","fallback"]},"fallbackCategoryId":{"type":"string","minLength":1}},"description":"Compound all/any/not requires explicit fallback; simple numeric intervals and discrete domains can be checked for exhaustive coverage."},"missing":{"type":"object","required":["NOT_FOUND","MISSING","SKIPPED"],"properties":{"NOT_FOUND":{"type":"string","minLength":1},"MISSING":{"type":"string","minLength":1},"SKIPPED":{"type":"string","minLength":1}}},"conflicts":{"type":"object","required":["mode"],"properties":{"mode":{"enum":["priority","multilabel"]},"priority":{"type":"array","items":{"type":"string","minLength":1}}}},"aggregation":{"type":"object","description":"Exactly one final category. priority orders all categories. Legacy all-good is accepted only for one metric with priority rules, where uniqueness is provable; multilabel is never a final exit.","required":["mode"],"properties":{"mode":{"enum":["all-good","priority"]},"priority":{"type":"array","items":{"type":"string","minLength":1}}}},"fault":{"type":"object","required":["exit"],"properties":{"exit":{"const":"FAULT"}}}}};
const schema35 = {"type":"array","minItems":1,"items":{"type":"object","required":["nodeId","artifactId"],"properties":{"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1},"label":{"type":"string"}}},"description":"Explicit image references in this scheme. Categories use these for OK/fallback; matched rules use them for NG; metrics use them when missing. Resolved only against the same workpiece execution."};
const schema36 = {"type":"object","required":["id"],"properties":{"id":{"type":"string","minLength":1},"evidence":{"$ref":"#/$defs/decisionEvidence"},"type":{"enum":["number","boolean","enum"],"default":"number"},"unit":{"type":"string"},"range":{"type":"object","required":["min","max"],"properties":{"min":{"type":"number"},"max":{"type":"number"}}},"values":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"string"}}},"description":"number requires unit and finite range min<max. boolean requires no numeric encoding. enum requires finite values. Compiler enforces conditional requirements."};

function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate22.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err1 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
else {
const err2 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.evidence !== undefined){
let data1 = data.evidence;
if(Array.isArray(data1)){
if(data1.length < 1){
const err3 = {instancePath:instancePath+"/evidence",schemaPath:"#/$defs/decisionEvidence/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
let data2 = data1[i0];
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.nodeId === undefined){
const err4 = {instancePath:instancePath+"/evidence/" + i0,schemaPath:"#/$defs/decisionEvidence/items/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data2.artifactId === undefined){
const err5 = {instancePath:instancePath+"/evidence/" + i0,schemaPath:"#/$defs/decisionEvidence/items/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data2.nodeId !== undefined){
let data3 = data2.nodeId;
if(typeof data3 === "string"){
if(func1(data3) < 1){
const err6 = {instancePath:instancePath+"/evidence/" + i0+"/nodeId",schemaPath:"#/$defs/decisionEvidence/items/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/evidence/" + i0+"/nodeId",schemaPath:"#/$defs/decisionEvidence/items/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data2.artifactId !== undefined){
let data4 = data2.artifactId;
if(typeof data4 === "string"){
if(func1(data4) < 1){
const err8 = {instancePath:instancePath+"/evidence/" + i0+"/artifactId",schemaPath:"#/$defs/decisionEvidence/items/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/evidence/" + i0+"/artifactId",schemaPath:"#/$defs/decisionEvidence/items/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data2.label !== undefined){
if(typeof data2.label !== "string"){
const err10 = {instancePath:instancePath+"/evidence/" + i0+"/label",schemaPath:"#/$defs/decisionEvidence/items/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath:instancePath+"/evidence/" + i0,schemaPath:"#/$defs/decisionEvidence/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
else {
const err12 = {instancePath:instancePath+"/evidence",schemaPath:"#/$defs/decisionEvidence/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.type !== undefined){
let data6 = data.type;
if(!(((data6 === "number") || (data6 === "boolean")) || (data6 === "enum"))){
const err13 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/enum",keyword:"enum",params:{allowedValues: schema36.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.unit !== undefined){
if(typeof data.unit !== "string"){
const err14 = {instancePath:instancePath+"/unit",schemaPath:"#/properties/unit/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.range !== undefined){
let data8 = data.range;
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
if(data8.min === undefined){
const err15 = {instancePath:instancePath+"/range",schemaPath:"#/properties/range/required",keyword:"required",params:{missingProperty: "min"},message:"must have required property '"+"min"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data8.max === undefined){
const err16 = {instancePath:instancePath+"/range",schemaPath:"#/properties/range/required",keyword:"required",params:{missingProperty: "max"},message:"must have required property '"+"max"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data8.min !== undefined){
if(!(typeof data8.min == "number")){
const err17 = {instancePath:instancePath+"/range/min",schemaPath:"#/properties/range/properties/min/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data8.max !== undefined){
if(!(typeof data8.max == "number")){
const err18 = {instancePath:instancePath+"/range/max",schemaPath:"#/properties/range/properties/max/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath:instancePath+"/range",schemaPath:"#/properties/range/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.values !== undefined){
let data11 = data.values;
if(Array.isArray(data11)){
if(data11.length < 1){
const err20 = {instancePath:instancePath+"/values",schemaPath:"#/properties/values/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
const len1 = data11.length;
for(let i1=0; i1<len1; i1++){
if(typeof data11[i1] !== "string"){
const err21 = {instancePath:instancePath+"/values/" + i1,schemaPath:"#/properties/values/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
let i2 = data11.length;
let j0;
if(i2 > 1){
const indices0 = {};
for(;i2--;){
let item0 = data11[i2];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err22 = {instancePath:instancePath+"/values",schemaPath:"#/properties/values/uniqueItems",keyword:"uniqueItems",params:{i: i2, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i2+" are identical)"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
break;
}
indices0[item0] = i2;
}
}
}
else {
const err23 = {instancePath:instancePath+"/values",schemaPath:"#/properties/values/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
}
else {
const err24 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
validate22.errors = vErrors;
return errors === 0;
}
validate22.evaluated = {"props":{"id":true,"evidence":true,"type":true,"unit":true,"range":true,"values":true},"dynamicProps":false,"dynamicItems":false};

const schema39 = {"oneOf":[{"type":"object","required":["metric","equals"],"additionalProperties":false,"properties":{"metric":{"type":"string","minLength":1},"equals":{"type":["number","boolean","string"]}}},{"type":"object","required":["metric","in"],"additionalProperties":false,"properties":{"metric":{"type":"string","minLength":1},"in":{"type":"array","minItems":1,"items":{"type":["number","boolean","string"]}}}},{"type":"object","required":["metric","interval"],"additionalProperties":false,"properties":{"metric":{"type":"string","minLength":1},"interval":{"$ref":"#/$defs/interval"}}},{"type":"object","required":["all"],"additionalProperties":false,"properties":{"all":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/condition"}}}},{"type":"object","required":["any"],"additionalProperties":false,"properties":{"any":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/condition"}}}},{"type":"object","required":["not"],"additionalProperties":false,"properties":{"not":{"$ref":"#/$defs/condition"}}}]};
const schema40 = {"type":"object","required":["min","max","includeMin","includeMax"],"properties":{"min":{"type":"number"},"max":{"type":"number"},"includeMin":{"type":"boolean"},"includeMax":{"type":"boolean"}}};
const wrapper0 = {validate: validate24};

function validate24(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate24.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.metric === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "metric"},message:"must have required property '"+"metric"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.equals === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "equals"},message:"must have required property '"+"equals"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "metric") || (key0 === "equals"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.metric !== undefined){
let data0 = data.metric;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err3 = {instancePath:instancePath+"/metric",schemaPath:"#/oneOf/0/properties/metric/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/metric",schemaPath:"#/oneOf/0/properties/metric/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.equals !== undefined){
let data1 = data.equals;
if(((!(typeof data1 == "number")) && (typeof data1 !== "boolean")) && (typeof data1 !== "string")){
const err5 = {instancePath:instancePath+"/equals",schemaPath:"#/oneOf/0/properties/equals/type",keyword:"type",params:{type: schema39.oneOf[0].properties.equals.type},message:"must be number,boolean,string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs8 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.metric === undefined){
const err7 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "metric"},message:"must have required property '"+"metric"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.in === undefined){
const err8 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "in"},message:"must have required property '"+"in"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key1 in data){
if(!((key1 === "metric") || (key1 === "in"))){
const err9 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.metric !== undefined){
let data2 = data.metric;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err10 = {instancePath:instancePath+"/metric",schemaPath:"#/oneOf/1/properties/metric/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/metric",schemaPath:"#/oneOf/1/properties/metric/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.in !== undefined){
let data3 = data.in;
if(Array.isArray(data3)){
if(data3.length < 1){
const err12 = {instancePath:instancePath+"/in",schemaPath:"#/oneOf/1/properties/in/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
if(((!(typeof data4 == "number")) && (typeof data4 !== "boolean")) && (typeof data4 !== "string")){
const err13 = {instancePath:instancePath+"/in/" + i0,schemaPath:"#/oneOf/1/properties/in/items/type",keyword:"type",params:{type: schema39.oneOf[1].properties.in.items.type},message:"must be number,boolean,string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath:instancePath+"/in",schemaPath:"#/oneOf/1/properties/in/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
else {
const err15 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid0 = _errs8 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs17 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.metric === undefined){
const err16 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "metric"},message:"must have required property '"+"metric"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data.interval === undefined){
const err17 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "interval"},message:"must have required property '"+"interval"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
for(const key2 in data){
if(!((key2 === "metric") || (key2 === "interval"))){
const err18 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.metric !== undefined){
let data5 = data.metric;
if(typeof data5 === "string"){
if(func1(data5) < 1){
const err19 = {instancePath:instancePath+"/metric",schemaPath:"#/oneOf/2/properties/metric/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/metric",schemaPath:"#/oneOf/2/properties/metric/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.interval !== undefined){
let data6 = data.interval;
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
if(data6.min === undefined){
const err21 = {instancePath:instancePath+"/interval",schemaPath:"#/$defs/interval/required",keyword:"required",params:{missingProperty: "min"},message:"must have required property '"+"min"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data6.max === undefined){
const err22 = {instancePath:instancePath+"/interval",schemaPath:"#/$defs/interval/required",keyword:"required",params:{missingProperty: "max"},message:"must have required property '"+"max"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data6.includeMin === undefined){
const err23 = {instancePath:instancePath+"/interval",schemaPath:"#/$defs/interval/required",keyword:"required",params:{missingProperty: "includeMin"},message:"must have required property '"+"includeMin"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data6.includeMax === undefined){
const err24 = {instancePath:instancePath+"/interval",schemaPath:"#/$defs/interval/required",keyword:"required",params:{missingProperty: "includeMax"},message:"must have required property '"+"includeMax"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data6.min !== undefined){
if(!(typeof data6.min == "number")){
const err25 = {instancePath:instancePath+"/interval/min",schemaPath:"#/$defs/interval/properties/min/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data6.max !== undefined){
if(!(typeof data6.max == "number")){
const err26 = {instancePath:instancePath+"/interval/max",schemaPath:"#/$defs/interval/properties/max/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data6.includeMin !== undefined){
if(typeof data6.includeMin !== "boolean"){
const err27 = {instancePath:instancePath+"/interval/includeMin",schemaPath:"#/$defs/interval/properties/includeMin/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data6.includeMax !== undefined){
if(typeof data6.includeMax !== "boolean"){
const err28 = {instancePath:instancePath+"/interval/includeMax",schemaPath:"#/$defs/interval/properties/includeMax/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
}
else {
const err29 = {instancePath:instancePath+"/interval",schemaPath:"#/$defs/interval/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
else {
const err30 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var _valid0 = _errs17 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
const _errs33 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.all === undefined){
const err31 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "all"},message:"must have required property '"+"all"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
for(const key3 in data){
if(!(key3 === "all")){
const err32 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.all !== undefined){
let data11 = data.all;
if(Array.isArray(data11)){
if(data11.length < 1){
const err33 = {instancePath:instancePath+"/all",schemaPath:"#/oneOf/3/properties/all/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
const len1 = data11.length;
for(let i1=0; i1<len1; i1++){
if(!(wrapper0.validate(data11[i1], {instancePath:instancePath+"/all/" + i1,parentData:data11,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
}
}
else {
const err34 = {instancePath:instancePath+"/all",schemaPath:"#/oneOf/3/properties/all/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
}
else {
const err35 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var _valid0 = _errs33 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
if(props0 !== true){
props0 = true;
}
}
const _errs39 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.any === undefined){
const err36 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "any"},message:"must have required property '"+"any"+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
for(const key4 in data){
if(!(key4 === "any")){
const err37 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.any !== undefined){
let data13 = data.any;
if(Array.isArray(data13)){
if(data13.length < 1){
const err38 = {instancePath:instancePath+"/any",schemaPath:"#/oneOf/4/properties/any/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
const len2 = data13.length;
for(let i2=0; i2<len2; i2++){
if(!(wrapper0.validate(data13[i2], {instancePath:instancePath+"/any/" + i2,parentData:data13,parentDataProperty:i2,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
}
}
else {
const err39 = {instancePath:instancePath+"/any",schemaPath:"#/oneOf/4/properties/any/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
}
else {
const err40 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
var _valid0 = _errs39 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
if(props0 !== true){
props0 = true;
}
}
const _errs45 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.not === undefined){
const err41 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "not"},message:"must have required property '"+"not"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
for(const key5 in data){
if(!(key5 === "not")){
const err42 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data.not !== undefined){
if(!(wrapper0.validate(data.not, {instancePath:instancePath+"/not",parentData:data,parentDataProperty:"not",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
}
}
else {
const err43 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var _valid0 = _errs45 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
if(props0 !== true){
props0 = true;
}
}
}
}
}
}
}
if(!valid0){
const err44 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate24.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate24.evaluated = {"dynamicProps":true,"dynamicItems":false};


function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate21.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schema === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema"},message:"must have required property '"+"schema"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.provenance === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "provenance"},message:"must have required property '"+"provenance"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.categories === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "categories"},message:"must have required property '"+"categories"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.metrics === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "metrics"},message:"must have required property '"+"metrics"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.rules === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rules"},message:"must have required property '"+"rules"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.coverage === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "coverage"},message:"must have required property '"+"coverage"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.missing === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "missing"},message:"must have required property '"+"missing"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.conflicts === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "conflicts"},message:"must have required property '"+"conflicts"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.aggregation === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "aggregation"},message:"must have required property '"+"aggregation"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.fault === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fault"},message:"must have required property '"+"fault"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.schema !== undefined){
if("agentcv-classification-spec-1" !== data.schema){
const err11 = {instancePath:instancePath+"/schema",schemaPath:"#/properties/schema/const",keyword:"const",params:{allowedValue: "agentcv-classification-spec-1"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func1(data1) < 1){
const err12 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.provenance !== undefined){
let data2 = data.provenance;
if(Array.isArray(data2)){
if(data2.length < 1){
const err14 = {instancePath:instancePath+"/provenance",schemaPath:"#/properties/provenance/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
let data3 = data2[i0];
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.type === undefined){
const err15 = {instancePath:instancePath+"/provenance/" + i0,schemaPath:"#/$defs/provenance/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data3.ref === undefined){
const err16 = {instancePath:instancePath+"/provenance/" + i0,schemaPath:"#/$defs/provenance/required",keyword:"required",params:{missingProperty: "ref"},message:"must have required property '"+"ref"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data3.status === undefined){
const err17 = {instancePath:instancePath+"/provenance/" + i0,schemaPath:"#/$defs/provenance/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data3.type !== undefined){
let data4 = data3.type;
if(!(((data4 === "human") || (data4 === "document")) || (data4 === "agent-inference"))){
const err18 = {instancePath:instancePath+"/provenance/" + i0+"/type",schemaPath:"#/$defs/provenance/properties/type/enum",keyword:"enum",params:{allowedValues: schema32.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data3.ref !== undefined){
let data5 = data3.ref;
if(typeof data5 === "string"){
if(func1(data5) < 1){
const err19 = {instancePath:instancePath+"/provenance/" + i0+"/ref",schemaPath:"#/$defs/provenance/properties/ref/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/provenance/" + i0+"/ref",schemaPath:"#/$defs/provenance/properties/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data3.status !== undefined){
let data6 = data3.status;
if(!((data6 === "confirmed") || (data6 === "inferred"))){
const err21 = {instancePath:instancePath+"/provenance/" + i0+"/status",schemaPath:"#/$defs/provenance/properties/status/enum",keyword:"enum",params:{allowedValues: schema32.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data3.authorization !== undefined){
let data7 = data3.authorization;
if(typeof data7 === "string"){
if(func1(data7) < 1){
const err22 = {instancePath:instancePath+"/provenance/" + i0+"/authorization",schemaPath:"#/$defs/provenance/properties/authorization/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
else {
const err23 = {instancePath:instancePath+"/provenance/" + i0+"/authorization",schemaPath:"#/$defs/provenance/properties/authorization/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
}
else {
const err24 = {instancePath:instancePath+"/provenance/" + i0,schemaPath:"#/$defs/provenance/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath:instancePath+"/provenance",schemaPath:"#/properties/provenance/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.categories !== undefined){
let data8 = data.categories;
if(Array.isArray(data8)){
if(data8.length < 1){
const err26 = {instancePath:instancePath+"/categories",schemaPath:"#/properties/categories/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
const len1 = data8.length;
for(let i1=0; i1<len1; i1++){
let data9 = data8[i1];
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
if(data9.id === undefined){
const err27 = {instancePath:instancePath+"/categories/" + i1,schemaPath:"#/properties/categories/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(data9.label === undefined){
const err28 = {instancePath:instancePath+"/categories/" + i1,schemaPath:"#/properties/categories/items/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(data9.quality === undefined){
const err29 = {instancePath:instancePath+"/categories/" + i1,schemaPath:"#/properties/categories/items/required",keyword:"required",params:{missingProperty: "quality"},message:"must have required property '"+"quality"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(data9.id !== undefined){
let data10 = data9.id;
if(typeof data10 === "string"){
if(func1(data10) < 1){
const err30 = {instancePath:instancePath+"/categories/" + i1+"/id",schemaPath:"#/properties/categories/items/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/categories/" + i1+"/id",schemaPath:"#/properties/categories/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data9.label !== undefined){
let data11 = data9.label;
if(typeof data11 === "string"){
if(func1(data11) < 1){
const err32 = {instancePath:instancePath+"/categories/" + i1+"/label",schemaPath:"#/properties/categories/items/properties/label/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
else {
const err33 = {instancePath:instancePath+"/categories/" + i1+"/label",schemaPath:"#/properties/categories/items/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data9.evidence !== undefined){
let data12 = data9.evidence;
if(Array.isArray(data12)){
if(data12.length < 1){
const err34 = {instancePath:instancePath+"/categories/" + i1+"/evidence",schemaPath:"#/$defs/decisionEvidence/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
const len2 = data12.length;
for(let i2=0; i2<len2; i2++){
let data13 = data12[i2];
if(data13 && typeof data13 == "object" && !Array.isArray(data13)){
if(data13.nodeId === undefined){
const err35 = {instancePath:instancePath+"/categories/" + i1+"/evidence/" + i2,schemaPath:"#/$defs/decisionEvidence/items/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(data13.artifactId === undefined){
const err36 = {instancePath:instancePath+"/categories/" + i1+"/evidence/" + i2,schemaPath:"#/$defs/decisionEvidence/items/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(data13.nodeId !== undefined){
let data14 = data13.nodeId;
if(typeof data14 === "string"){
if(func1(data14) < 1){
const err37 = {instancePath:instancePath+"/categories/" + i1+"/evidence/" + i2+"/nodeId",schemaPath:"#/$defs/decisionEvidence/items/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
else {
const err38 = {instancePath:instancePath+"/categories/" + i1+"/evidence/" + i2+"/nodeId",schemaPath:"#/$defs/decisionEvidence/items/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data13.artifactId !== undefined){
let data15 = data13.artifactId;
if(typeof data15 === "string"){
if(func1(data15) < 1){
const err39 = {instancePath:instancePath+"/categories/" + i1+"/evidence/" + i2+"/artifactId",schemaPath:"#/$defs/decisionEvidence/items/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
else {
const err40 = {instancePath:instancePath+"/categories/" + i1+"/evidence/" + i2+"/artifactId",schemaPath:"#/$defs/decisionEvidence/items/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data13.label !== undefined){
if(typeof data13.label !== "string"){
const err41 = {instancePath:instancePath+"/categories/" + i1+"/evidence/" + i2+"/label",schemaPath:"#/$defs/decisionEvidence/items/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
}
else {
const err42 = {instancePath:instancePath+"/categories/" + i1+"/evidence/" + i2,schemaPath:"#/$defs/decisionEvidence/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
}
else {
const err43 = {instancePath:instancePath+"/categories/" + i1+"/evidence",schemaPath:"#/$defs/decisionEvidence/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data9.quality !== undefined){
let data17 = data9.quality;
if(!(((data17 === "good") || (data17 === "bad")) || (data17 === "undetermined"))){
const err44 = {instancePath:instancePath+"/categories/" + i1+"/quality",schemaPath:"#/properties/categories/items/properties/quality/enum",keyword:"enum",params:{allowedValues: schema33.properties.categories.items.properties.quality.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
}
else {
const err45 = {instancePath:instancePath+"/categories/" + i1,schemaPath:"#/properties/categories/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
}
else {
const err46 = {instancePath:instancePath+"/categories",schemaPath:"#/properties/categories/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data.metrics !== undefined){
let data18 = data.metrics;
if(Array.isArray(data18)){
if(data18.length < 1){
const err47 = {instancePath:instancePath+"/metrics",schemaPath:"#/properties/metrics/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
const len3 = data18.length;
for(let i3=0; i3<len3; i3++){
if(!(validate22(data18[i3], {instancePath:instancePath+"/metrics/" + i3,parentData:data18,parentDataProperty:i3,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
errors = vErrors.length;
}
}
}
else {
const err48 = {instancePath:instancePath+"/metrics",schemaPath:"#/properties/metrics/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data.rules !== undefined){
let data20 = data.rules;
if(Array.isArray(data20)){
if(data20.length < 1){
const err49 = {instancePath:instancePath+"/rules",schemaPath:"#/properties/rules/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
const len4 = data20.length;
for(let i4=0; i4<len4; i4++){
let data21 = data20[i4];
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
if(data21.id === undefined){
const err50 = {instancePath:instancePath+"/rules/" + i4,schemaPath:"#/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if(data21.categoryId === undefined){
const err51 = {instancePath:instancePath+"/rules/" + i4,schemaPath:"#/properties/rules/items/required",keyword:"required",params:{missingProperty: "categoryId"},message:"must have required property '"+"categoryId"+"'"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(data21.when === undefined){
const err52 = {instancePath:instancePath+"/rules/" + i4,schemaPath:"#/properties/rules/items/required",keyword:"required",params:{missingProperty: "when"},message:"must have required property '"+"when"+"'"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if(data21.id !== undefined){
let data22 = data21.id;
if(typeof data22 === "string"){
if(func1(data22) < 1){
const err53 = {instancePath:instancePath+"/rules/" + i4+"/id",schemaPath:"#/properties/rules/items/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
else {
const err54 = {instancePath:instancePath+"/rules/" + i4+"/id",schemaPath:"#/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data21.categoryId !== undefined){
let data23 = data21.categoryId;
if(typeof data23 === "string"){
if(func1(data23) < 1){
const err55 = {instancePath:instancePath+"/rules/" + i4+"/categoryId",schemaPath:"#/properties/rules/items/properties/categoryId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
else {
const err56 = {instancePath:instancePath+"/rules/" + i4+"/categoryId",schemaPath:"#/properties/rules/items/properties/categoryId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data21.label !== undefined){
if(typeof data21.label !== "string"){
const err57 = {instancePath:instancePath+"/rules/" + i4+"/label",schemaPath:"#/properties/rules/items/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data21.evidence !== undefined){
let data25 = data21.evidence;
if(Array.isArray(data25)){
if(data25.length < 1){
const err58 = {instancePath:instancePath+"/rules/" + i4+"/evidence",schemaPath:"#/$defs/decisionEvidence/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
const len5 = data25.length;
for(let i5=0; i5<len5; i5++){
let data26 = data25[i5];
if(data26 && typeof data26 == "object" && !Array.isArray(data26)){
if(data26.nodeId === undefined){
const err59 = {instancePath:instancePath+"/rules/" + i4+"/evidence/" + i5,schemaPath:"#/$defs/decisionEvidence/items/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(data26.artifactId === undefined){
const err60 = {instancePath:instancePath+"/rules/" + i4+"/evidence/" + i5,schemaPath:"#/$defs/decisionEvidence/items/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if(data26.nodeId !== undefined){
let data27 = data26.nodeId;
if(typeof data27 === "string"){
if(func1(data27) < 1){
const err61 = {instancePath:instancePath+"/rules/" + i4+"/evidence/" + i5+"/nodeId",schemaPath:"#/$defs/decisionEvidence/items/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
else {
const err62 = {instancePath:instancePath+"/rules/" + i4+"/evidence/" + i5+"/nodeId",schemaPath:"#/$defs/decisionEvidence/items/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
if(data26.artifactId !== undefined){
let data28 = data26.artifactId;
if(typeof data28 === "string"){
if(func1(data28) < 1){
const err63 = {instancePath:instancePath+"/rules/" + i4+"/evidence/" + i5+"/artifactId",schemaPath:"#/$defs/decisionEvidence/items/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
else {
const err64 = {instancePath:instancePath+"/rules/" + i4+"/evidence/" + i5+"/artifactId",schemaPath:"#/$defs/decisionEvidence/items/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
if(data26.label !== undefined){
if(typeof data26.label !== "string"){
const err65 = {instancePath:instancePath+"/rules/" + i4+"/evidence/" + i5+"/label",schemaPath:"#/$defs/decisionEvidence/items/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
}
else {
const err66 = {instancePath:instancePath+"/rules/" + i4+"/evidence/" + i5,schemaPath:"#/$defs/decisionEvidence/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
}
else {
const err67 = {instancePath:instancePath+"/rules/" + i4+"/evidence",schemaPath:"#/$defs/decisionEvidence/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
if(data21.defectLabels !== undefined){
let data30 = data21.defectLabels;
if(Array.isArray(data30)){
const len6 = data30.length;
for(let i6=0; i6<len6; i6++){
let data31 = data30[i6];
if(typeof data31 === "string"){
if(func1(data31) < 1){
const err68 = {instancePath:instancePath+"/rules/" + i4+"/defectLabels/" + i6,schemaPath:"#/properties/rules/items/properties/defectLabels/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
else {
const err69 = {instancePath:instancePath+"/rules/" + i4+"/defectLabels/" + i6,schemaPath:"#/properties/rules/items/properties/defectLabels/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
}
else {
const err70 = {instancePath:instancePath+"/rules/" + i4+"/defectLabels",schemaPath:"#/properties/rules/items/properties/defectLabels/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data21.when !== undefined){
if(!(validate24(data21.when, {instancePath:instancePath+"/rules/" + i4+"/when",parentData:data21,parentDataProperty:"when",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
}
}
else {
const err71 = {instancePath:instancePath+"/rules/" + i4,schemaPath:"#/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
}
else {
const err72 = {instancePath:instancePath+"/rules",schemaPath:"#/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
if(data.coverage !== undefined){
let data33 = data.coverage;
if(data33 && typeof data33 == "object" && !Array.isArray(data33)){
if(data33.policy === undefined){
const err73 = {instancePath:instancePath+"/coverage",schemaPath:"#/properties/coverage/required",keyword:"required",params:{missingProperty: "policy"},message:"must have required property '"+"policy"+"'"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
if(data33.policy !== undefined){
let data34 = data33.policy;
if(!((data34 === "exhaustive") || (data34 === "fallback"))){
const err74 = {instancePath:instancePath+"/coverage/policy",schemaPath:"#/properties/coverage/properties/policy/enum",keyword:"enum",params:{allowedValues: schema33.properties.coverage.properties.policy.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data33.fallbackCategoryId !== undefined){
let data35 = data33.fallbackCategoryId;
if(typeof data35 === "string"){
if(func1(data35) < 1){
const err75 = {instancePath:instancePath+"/coverage/fallbackCategoryId",schemaPath:"#/properties/coverage/properties/fallbackCategoryId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
else {
const err76 = {instancePath:instancePath+"/coverage/fallbackCategoryId",schemaPath:"#/properties/coverage/properties/fallbackCategoryId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
}
else {
const err77 = {instancePath:instancePath+"/coverage",schemaPath:"#/properties/coverage/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
if(data.missing !== undefined){
let data36 = data.missing;
if(data36 && typeof data36 == "object" && !Array.isArray(data36)){
if(data36.NOT_FOUND === undefined){
const err78 = {instancePath:instancePath+"/missing",schemaPath:"#/properties/missing/required",keyword:"required",params:{missingProperty: "NOT_FOUND"},message:"must have required property '"+"NOT_FOUND"+"'"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
if(data36.MISSING === undefined){
const err79 = {instancePath:instancePath+"/missing",schemaPath:"#/properties/missing/required",keyword:"required",params:{missingProperty: "MISSING"},message:"must have required property '"+"MISSING"+"'"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if(data36.SKIPPED === undefined){
const err80 = {instancePath:instancePath+"/missing",schemaPath:"#/properties/missing/required",keyword:"required",params:{missingProperty: "SKIPPED"},message:"must have required property '"+"SKIPPED"+"'"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
if(data36.NOT_FOUND !== undefined){
let data37 = data36.NOT_FOUND;
if(typeof data37 === "string"){
if(func1(data37) < 1){
const err81 = {instancePath:instancePath+"/missing/NOT_FOUND",schemaPath:"#/properties/missing/properties/NOT_FOUND/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
else {
const err82 = {instancePath:instancePath+"/missing/NOT_FOUND",schemaPath:"#/properties/missing/properties/NOT_FOUND/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
if(data36.MISSING !== undefined){
let data38 = data36.MISSING;
if(typeof data38 === "string"){
if(func1(data38) < 1){
const err83 = {instancePath:instancePath+"/missing/MISSING",schemaPath:"#/properties/missing/properties/MISSING/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
else {
const err84 = {instancePath:instancePath+"/missing/MISSING",schemaPath:"#/properties/missing/properties/MISSING/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
if(data36.SKIPPED !== undefined){
let data39 = data36.SKIPPED;
if(typeof data39 === "string"){
if(func1(data39) < 1){
const err85 = {instancePath:instancePath+"/missing/SKIPPED",schemaPath:"#/properties/missing/properties/SKIPPED/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
else {
const err86 = {instancePath:instancePath+"/missing/SKIPPED",schemaPath:"#/properties/missing/properties/SKIPPED/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
}
else {
const err87 = {instancePath:instancePath+"/missing",schemaPath:"#/properties/missing/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
if(data.conflicts !== undefined){
let data40 = data.conflicts;
if(data40 && typeof data40 == "object" && !Array.isArray(data40)){
if(data40.mode === undefined){
const err88 = {instancePath:instancePath+"/conflicts",schemaPath:"#/properties/conflicts/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
if(data40.mode !== undefined){
let data41 = data40.mode;
if(!((data41 === "priority") || (data41 === "multilabel"))){
const err89 = {instancePath:instancePath+"/conflicts/mode",schemaPath:"#/properties/conflicts/properties/mode/enum",keyword:"enum",params:{allowedValues: schema33.properties.conflicts.properties.mode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
if(data40.priority !== undefined){
let data42 = data40.priority;
if(Array.isArray(data42)){
const len7 = data42.length;
for(let i7=0; i7<len7; i7++){
let data43 = data42[i7];
if(typeof data43 === "string"){
if(func1(data43) < 1){
const err90 = {instancePath:instancePath+"/conflicts/priority/" + i7,schemaPath:"#/properties/conflicts/properties/priority/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
else {
const err91 = {instancePath:instancePath+"/conflicts/priority/" + i7,schemaPath:"#/properties/conflicts/properties/priority/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
}
else {
const err92 = {instancePath:instancePath+"/conflicts/priority",schemaPath:"#/properties/conflicts/properties/priority/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
}
else {
const err93 = {instancePath:instancePath+"/conflicts",schemaPath:"#/properties/conflicts/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
}
if(data.aggregation !== undefined){
let data44 = data.aggregation;
if(data44 && typeof data44 == "object" && !Array.isArray(data44)){
if(data44.mode === undefined){
const err94 = {instancePath:instancePath+"/aggregation",schemaPath:"#/properties/aggregation/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
if(data44.mode !== undefined){
let data45 = data44.mode;
if(!((data45 === "all-good") || (data45 === "priority"))){
const err95 = {instancePath:instancePath+"/aggregation/mode",schemaPath:"#/properties/aggregation/properties/mode/enum",keyword:"enum",params:{allowedValues: schema33.properties.aggregation.properties.mode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
}
if(data44.priority !== undefined){
let data46 = data44.priority;
if(Array.isArray(data46)){
const len8 = data46.length;
for(let i8=0; i8<len8; i8++){
let data47 = data46[i8];
if(typeof data47 === "string"){
if(func1(data47) < 1){
const err96 = {instancePath:instancePath+"/aggregation/priority/" + i8,schemaPath:"#/properties/aggregation/properties/priority/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
else {
const err97 = {instancePath:instancePath+"/aggregation/priority/" + i8,schemaPath:"#/properties/aggregation/properties/priority/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
}
else {
const err98 = {instancePath:instancePath+"/aggregation/priority",schemaPath:"#/properties/aggregation/properties/priority/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
}
else {
const err99 = {instancePath:instancePath+"/aggregation",schemaPath:"#/properties/aggregation/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
if(data.fault !== undefined){
let data48 = data.fault;
if(data48 && typeof data48 == "object" && !Array.isArray(data48)){
if(data48.exit === undefined){
const err100 = {instancePath:instancePath+"/fault",schemaPath:"#/properties/fault/required",keyword:"required",params:{missingProperty: "exit"},message:"must have required property '"+"exit"+"'"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
if(data48.exit !== undefined){
if("FAULT" !== data48.exit){
const err101 = {instancePath:instancePath+"/fault/exit",schemaPath:"#/properties/fault/properties/exit/const",keyword:"const",params:{allowedValue: "FAULT"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
}
}
else {
const err102 = {instancePath:instancePath+"/fault",schemaPath:"#/properties/fault/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
}
else {
const err103 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
validate21.errors = vErrors;
return errors === 0;
}
validate21.evaluated = {"props":{"schema":true,"id":true,"provenance":true,"categories":true,"metrics":true,"rules":true,"coverage":true,"missing":true,"conflicts":true,"aggregation":true,"fault":true},"dynamicProps":false,"dynamicItems":false};

const schema41 = {"type":"object","required":["id","expected_outputs"],"anyOf":[{"required":["code"]},{"required":["nativePlan"]}],"properties":{"id":{"type":"string","minLength":1},"title":{"type":"string"},"parentId":{"type":"string","minLength":1,"description":"At most three engineering node levels; graph container and internal operators do not add levels. Parent purpose validity aggregates descendants, and the parent own execution record remains separate and immutable."},"code":{"type":"string","minLength":1,"description":"Optional arbitrary runnable Python. Use this only when the node has no nativePlan."},"nativePlan":{"type":"object","required":["backend","plan"],"properties":{"backend":{"const":"rust-native"},"plan":{"type":"object","required":["nodes"],"properties":{"nodes":{"type":"array","minItems":1,"items":{"type":"object","required":["op"],"properties":{"op":{"type":"string","minLength":1},"params":{"type":"object"}}}}}}},"description":"Typed Rust execution plan. Its backend is explicit and is preferred over Python."},"executionBackend":{"enum":["rust-native","python-extension"],"description":"Resolved backend recorded for audit; nativePlan is required for rust-native."},"parameters":{"type":"object"},"expected_outputs":{"type":"array","minItems":1,"maxItems":48,"items":{"type":"object","required":["id","type"],"properties":{"id":{"type":"string","minLength":1,"pattern":"^[A-Za-z0-9_.-]{1,120}$"},"type":{"enum":["image","evidence","file"]},"dataContract":{"title":"AgentCV node data contract","description":"Explicit port meaning. Exact kind, frame and units must agree across an edge; no implicit conversion. Geometry JSON repeats coordinates; measurements contain value/unit; homography contains matrix/from/to. Contracts do not prove algorithm accuracy.","anyOf":[{"type":"object","properties":{"kind":{"enum":["image","mask"]},"coordinates":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","coordinates"],"additionalProperties":false},{"type":"object","properties":{"kind":{"enum":["points","contours","roi"]},"coordinates":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","coordinates"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"homography"},"from":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false},"to":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","from","to"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"measurement"},"unit":{"type":"string","minLength":1}},"required":["kind","unit"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"classification"},"categories":{"type":"array","items":{"type":"string","minLength":1},"minItems":1,"uniqueItems":true}},"required":["kind","categories"],"additionalProperties":false},{"type":"object","properties":{"kind":{"enum":["json","file"]}},"required":["kind"],"additionalProperties":false}]},"role":{"enum":["result","intermediate"]}}}},"inputs":{"type":"object","additionalProperties":{"type":"object","required":["nodeId","artifactId"],"properties":{"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1},"dataContract":{"title":"AgentCV node data contract","description":"Explicit port meaning. Exact kind, frame and units must agree across an edge; no implicit conversion. Geometry JSON repeats coordinates; measurements contain value/unit; homography contains matrix/from/to. Contracts do not prove algorithm accuracy.","anyOf":[{"type":"object","properties":{"kind":{"enum":["image","mask"]},"coordinates":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","coordinates"],"additionalProperties":false},{"type":"object","properties":{"kind":{"enum":["points","contours","roi"]},"coordinates":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","coordinates"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"homography"},"from":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false},"to":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","from","to"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"measurement"},"unit":{"type":"string","minLength":1}},"required":["kind","unit"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"classification"},"categories":{"type":"array","items":{"type":"string","minLength":1},"minItems":1,"uniqueItems":true}},"required":["kind","categories"],"additionalProperties":false},{"type":"object","properties":{"kind":{"enum":["json","file"]}},"required":["kind"],"additionalProperties":false}]}}},"description":"Each slot needs a matching graph edge and actual declared upstream artifact. Python receives upstream[slot].artifact.data or upstream[slot].image."},"when":{"type":"object","required":["nodeId","status"],"properties":{"nodeId":{"type":"string","minLength":1},"status":{"enum":["VALID","NOT_FOUND","FAULT","COMPLETED"]}}},"prerequisites":{"type":"object","properties":{"anyOf":{"type":"array","items":{"type":"string","minLength":1}}}},"documentation":{"type":"string","maxLength":64000,"description":"自由 Markdown 節點文章：從檢測實體、缺陷或關係的本質出發，把特徵定位、身份依據、數值量測與實際判定講清楚。按需配可追溯實測圖及自包含 HTML/SVG 原理圖解，區分實測、推估與示意；無固定欄目，不虛構試驗。"},"justification":{"$ref":"#/$defs/justification"}}};
const schema42 = {"type":"object","description":"Optional legacy explanation and explicit references. New prose uses documentation."};
const pattern4 = new RegExp("^[A-Za-z0-9_.-]{1,120}$", "u");

function validate27(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate27.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs1 = errors;
let valid0 = false;
const _errs2 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.code === undefined){
const err0 = {instancePath,schemaPath:"#/anyOf/0/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
var _valid0 = _errs2 === errors;
valid0 = valid0 || _valid0;
const _errs3 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.nativePlan === undefined){
const err1 = {instancePath,schemaPath:"#/anyOf/1/required",keyword:"required",params:{missingProperty: "nativePlan"},message:"must have required property '"+"nativePlan"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
var _valid0 = _errs3 === errors;
valid0 = valid0 || _valid0;
if(!valid0){
const err2 = {instancePath,schemaPath:"#/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
else {
errors = _errs1;
if(vErrors !== null){
if(_errs1){
vErrors.length = _errs1;
}
else {
vErrors = null;
}
}
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.expected_outputs === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expected_outputs"},message:"must have required property '"+"expected_outputs"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.title !== undefined){
if(typeof data.title !== "string"){
const err7 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.parentId !== undefined){
let data2 = data.parentId;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err8 = {instancePath:instancePath+"/parentId",schemaPath:"#/properties/parentId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/parentId",schemaPath:"#/properties/parentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.code !== undefined){
let data3 = data.code;
if(typeof data3 === "string"){
if(func1(data3) < 1){
const err10 = {instancePath:instancePath+"/code",schemaPath:"#/properties/code/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/code",schemaPath:"#/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.nativePlan !== undefined){
let data4 = data.nativePlan;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.backend === undefined){
const err12 = {instancePath:instancePath+"/nativePlan",schemaPath:"#/properties/nativePlan/required",keyword:"required",params:{missingProperty: "backend"},message:"must have required property '"+"backend"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data4.plan === undefined){
const err13 = {instancePath:instancePath+"/nativePlan",schemaPath:"#/properties/nativePlan/required",keyword:"required",params:{missingProperty: "plan"},message:"must have required property '"+"plan"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data4.backend !== undefined){
if("rust-native" !== data4.backend){
const err14 = {instancePath:instancePath+"/nativePlan/backend",schemaPath:"#/properties/nativePlan/properties/backend/const",keyword:"const",params:{allowedValue: "rust-native"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data4.plan !== undefined){
let data6 = data4.plan;
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
if(data6.nodes === undefined){
const err15 = {instancePath:instancePath+"/nativePlan/plan",schemaPath:"#/properties/nativePlan/properties/plan/required",keyword:"required",params:{missingProperty: "nodes"},message:"must have required property '"+"nodes"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data6.nodes !== undefined){
let data7 = data6.nodes;
if(Array.isArray(data7)){
if(data7.length < 1){
const err16 = {instancePath:instancePath+"/nativePlan/plan/nodes",schemaPath:"#/properties/nativePlan/properties/plan/properties/nodes/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
const len0 = data7.length;
for(let i0=0; i0<len0; i0++){
let data8 = data7[i0];
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
if(data8.op === undefined){
const err17 = {instancePath:instancePath+"/nativePlan/plan/nodes/" + i0,schemaPath:"#/properties/nativePlan/properties/plan/properties/nodes/items/required",keyword:"required",params:{missingProperty: "op"},message:"must have required property '"+"op"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data8.op !== undefined){
let data9 = data8.op;
if(typeof data9 === "string"){
if(func1(data9) < 1){
const err18 = {instancePath:instancePath+"/nativePlan/plan/nodes/" + i0+"/op",schemaPath:"#/properties/nativePlan/properties/plan/properties/nodes/items/properties/op/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/nativePlan/plan/nodes/" + i0+"/op",schemaPath:"#/properties/nativePlan/properties/plan/properties/nodes/items/properties/op/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data8.params !== undefined){
let data10 = data8.params;
if(!(data10 && typeof data10 == "object" && !Array.isArray(data10))){
const err20 = {instancePath:instancePath+"/nativePlan/plan/nodes/" + i0+"/params",schemaPath:"#/properties/nativePlan/properties/plan/properties/nodes/items/properties/params/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath:instancePath+"/nativePlan/plan/nodes/" + i0,schemaPath:"#/properties/nativePlan/properties/plan/properties/nodes/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
else {
const err22 = {instancePath:instancePath+"/nativePlan/plan/nodes",schemaPath:"#/properties/nativePlan/properties/plan/properties/nodes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
}
else {
const err23 = {instancePath:instancePath+"/nativePlan/plan",schemaPath:"#/properties/nativePlan/properties/plan/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
}
else {
const err24 = {instancePath:instancePath+"/nativePlan",schemaPath:"#/properties/nativePlan/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.executionBackend !== undefined){
let data11 = data.executionBackend;
if(!((data11 === "rust-native") || (data11 === "python-extension"))){
const err25 = {instancePath:instancePath+"/executionBackend",schemaPath:"#/properties/executionBackend/enum",keyword:"enum",params:{allowedValues: schema41.properties.executionBackend.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.parameters !== undefined){
let data12 = data.parameters;
if(!(data12 && typeof data12 == "object" && !Array.isArray(data12))){
const err26 = {instancePath:instancePath+"/parameters",schemaPath:"#/properties/parameters/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.expected_outputs !== undefined){
let data13 = data.expected_outputs;
if(Array.isArray(data13)){
if(data13.length > 48){
const err27 = {instancePath:instancePath+"/expected_outputs",schemaPath:"#/properties/expected_outputs/maxItems",keyword:"maxItems",params:{limit: 48},message:"must NOT have more than 48 items"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(data13.length < 1){
const err28 = {instancePath:instancePath+"/expected_outputs",schemaPath:"#/properties/expected_outputs/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
const len1 = data13.length;
for(let i1=0; i1<len1; i1++){
let data14 = data13[i1];
if(data14 && typeof data14 == "object" && !Array.isArray(data14)){
if(data14.id === undefined){
const err29 = {instancePath:instancePath+"/expected_outputs/" + i1,schemaPath:"#/properties/expected_outputs/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(data14.type === undefined){
const err30 = {instancePath:instancePath+"/expected_outputs/" + i1,schemaPath:"#/properties/expected_outputs/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(data14.id !== undefined){
let data15 = data14.id;
if(typeof data15 === "string"){
if(func1(data15) < 1){
const err31 = {instancePath:instancePath+"/expected_outputs/" + i1+"/id",schemaPath:"#/properties/expected_outputs/items/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(!pattern4.test(data15)){
const err32 = {instancePath:instancePath+"/expected_outputs/" + i1+"/id",schemaPath:"#/properties/expected_outputs/items/properties/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9_.-]{1,120}$"},message:"must match pattern \""+"^[A-Za-z0-9_.-]{1,120}$"+"\""};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
else {
const err33 = {instancePath:instancePath+"/expected_outputs/" + i1+"/id",schemaPath:"#/properties/expected_outputs/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data14.type !== undefined){
let data16 = data14.type;
if(!(((data16 === "image") || (data16 === "evidence")) || (data16 === "file"))){
const err34 = {instancePath:instancePath+"/expected_outputs/" + i1+"/type",schemaPath:"#/properties/expected_outputs/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema41.properties.expected_outputs.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data14.dataContract !== undefined){
let data17 = data14.dataContract;
const _errs36 = errors;
let valid10 = false;
const _errs37 = errors;
if(data17 && typeof data17 == "object" && !Array.isArray(data17)){
if(data17.kind === undefined){
const err35 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(data17.coordinates === undefined){
const err36 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/required",keyword:"required",params:{missingProperty: "coordinates"},message:"must have required property '"+"coordinates"+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
for(const key0 in data17){
if(!((key0 === "kind") || (key0 === "coordinates"))){
const err37 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data17.kind !== undefined){
let data18 = data17.kind;
if(!((data18 === "image") || (data18 === "mask"))){
const err38 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema41.properties.expected_outputs.items.properties.dataContract.anyOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data17.coordinates !== undefined){
let data19 = data17.coordinates;
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
if(data19.frame === undefined){
const err39 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/required",keyword:"required",params:{missingProperty: "frame"},message:"must have required property '"+"frame"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if(data19.unit === undefined){
const err40 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
for(const key1 in data19){
if(!((key1 === "frame") || (key1 === "unit"))){
const err41 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data19.frame !== undefined){
let data20 = data19.frame;
const _errs45 = errors;
let valid13 = false;
const _errs46 = errors;
if(data20 && typeof data20 == "object" && !Array.isArray(data20)){
if(data20.kind === undefined){
const err42 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(data20.slot === undefined){
const err43 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
for(const key2 in data20){
if(!((key2 === "kind") || (key2 === "slot"))){
const err44 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data20.kind !== undefined){
if("input" !== data20.kind){
const err45 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "input"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data20.slot !== undefined){
let data22 = data20.slot;
if(typeof data22 === "string"){
if(func1(data22) < 1){
const err46 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
else {
const err47 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
}
else {
const err48 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
var _valid2 = _errs46 === errors;
valid13 = valid13 || _valid2;
if(_valid2){
var props0 = true;
}
const _errs52 = errors;
if(data20 && typeof data20 == "object" && !Array.isArray(data20)){
if(data20.kind === undefined){
const err49 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if(data20.slot === undefined){
const err50 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
for(const key3 in data20){
if(!((key3 === "kind") || (key3 === "slot"))){
const err51 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data20.kind !== undefined){
if("reference" !== data20.kind){
const err52 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "reference"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data20.slot !== undefined){
let data24 = data20.slot;
if(typeof data24 === "string"){
if(func1(data24) < 1){
const err53 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
else {
const err54 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
}
else {
const err55 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var _valid2 = _errs52 === errors;
valid13 = valid13 || _valid2;
if(_valid2){
if(props0 !== true){
props0 = true;
}
}
const _errs58 = errors;
if(data20 && typeof data20 == "object" && !Array.isArray(data20)){
if(data20.kind === undefined){
const err56 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(data20.nodeId === undefined){
const err57 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(data20.artifactId === undefined){
const err58 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
for(const key4 in data20){
if(!(((key4 === "kind") || (key4 === "nodeId")) || (key4 === "artifactId"))){
const err59 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data20.kind !== undefined){
if("artifact" !== data20.kind){
const err60 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "artifact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data20.nodeId !== undefined){
let data26 = data20.nodeId;
if(typeof data26 === "string"){
if(func1(data26) < 1){
const err61 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/nodeId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
else {
const err62 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/nodeId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
if(data20.artifactId !== undefined){
let data27 = data20.artifactId;
if(typeof data27 === "string"){
if(func1(data27) < 1){
const err63 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/artifactId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
else {
const err64 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/artifactId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
}
else {
const err65 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
var _valid2 = _errs58 === errors;
valid13 = valid13 || _valid2;
if(_valid2){
if(props0 !== true){
props0 = true;
}
}
if(!valid13){
const err66 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
else {
errors = _errs45;
if(vErrors !== null){
if(_errs45){
vErrors.length = _errs45;
}
else {
vErrors = null;
}
}
}
}
if(data19.unit !== undefined){
let data28 = data19.unit;
if(!(((data28 === "px") || (data28 === "mm")) || (data28 === "m"))){
const err67 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/unit",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/properties/unit/enum",keyword:"enum",params:{allowedValues: schema41.properties.expected_outputs.items.properties.dataContract.anyOf[0].properties.coordinates.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
}
else {
const err68 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/properties/coordinates/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
}
else {
const err69 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var _valid1 = _errs37 === errors;
valid10 = valid10 || _valid1;
if(_valid1){
var props1 = true;
}
const _errs67 = errors;
if(data17 && typeof data17 == "object" && !Array.isArray(data17)){
if(data17.kind === undefined){
const err70 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(data17.coordinates === undefined){
const err71 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/required",keyword:"required",params:{missingProperty: "coordinates"},message:"must have required property '"+"coordinates"+"'"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
for(const key5 in data17){
if(!((key5 === "kind") || (key5 === "coordinates"))){
const err72 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
if(data17.kind !== undefined){
let data29 = data17.kind;
if(!(((data29 === "points") || (data29 === "contours")) || (data29 === "roi"))){
const err73 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema41.properties.expected_outputs.items.properties.dataContract.anyOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data17.coordinates !== undefined){
let data30 = data17.coordinates;
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
if(data30.frame === undefined){
const err74 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/required",keyword:"required",params:{missingProperty: "frame"},message:"must have required property '"+"frame"+"'"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
if(data30.unit === undefined){
const err75 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
for(const key6 in data30){
if(!((key6 === "frame") || (key6 === "unit"))){
const err76 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
if(data30.frame !== undefined){
let data31 = data30.frame;
const _errs75 = errors;
let valid19 = false;
const _errs76 = errors;
if(data31 && typeof data31 == "object" && !Array.isArray(data31)){
if(data31.kind === undefined){
const err77 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
if(data31.slot === undefined){
const err78 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
for(const key7 in data31){
if(!((key7 === "kind") || (key7 === "slot"))){
const err79 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
if(data31.kind !== undefined){
if("input" !== data31.kind){
const err80 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "input"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
if(data31.slot !== undefined){
let data33 = data31.slot;
if(typeof data33 === "string"){
if(func1(data33) < 1){
const err81 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
else {
const err82 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
}
else {
const err83 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
var _valid3 = _errs76 === errors;
valid19 = valid19 || _valid3;
if(_valid3){
var props2 = true;
}
const _errs82 = errors;
if(data31 && typeof data31 == "object" && !Array.isArray(data31)){
if(data31.kind === undefined){
const err84 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
if(data31.slot === undefined){
const err85 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
for(const key8 in data31){
if(!((key8 === "kind") || (key8 === "slot"))){
const err86 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
if(data31.kind !== undefined){
if("reference" !== data31.kind){
const err87 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "reference"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
if(data31.slot !== undefined){
let data35 = data31.slot;
if(typeof data35 === "string"){
if(func1(data35) < 1){
const err88 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
}
else {
const err89 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
}
else {
const err90 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
var _valid3 = _errs82 === errors;
valid19 = valid19 || _valid3;
if(_valid3){
if(props2 !== true){
props2 = true;
}
}
const _errs88 = errors;
if(data31 && typeof data31 == "object" && !Array.isArray(data31)){
if(data31.kind === undefined){
const err91 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
if(data31.nodeId === undefined){
const err92 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
if(data31.artifactId === undefined){
const err93 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
for(const key9 in data31){
if(!(((key9 === "kind") || (key9 === "nodeId")) || (key9 === "artifactId"))){
const err94 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
}
if(data31.kind !== undefined){
if("artifact" !== data31.kind){
const err95 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "artifact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
}
if(data31.nodeId !== undefined){
let data37 = data31.nodeId;
if(typeof data37 === "string"){
if(func1(data37) < 1){
const err96 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/nodeId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
else {
const err97 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/nodeId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
if(data31.artifactId !== undefined){
let data38 = data31.artifactId;
if(typeof data38 === "string"){
if(func1(data38) < 1){
const err98 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/artifactId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
else {
const err99 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame/artifactId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
}
else {
const err100 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
var _valid3 = _errs88 === errors;
valid19 = valid19 || _valid3;
if(_valid3){
if(props2 !== true){
props2 = true;
}
}
if(!valid19){
const err101 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
else {
errors = _errs75;
if(vErrors !== null){
if(_errs75){
vErrors.length = _errs75;
}
else {
vErrors = null;
}
}
}
}
if(data30.unit !== undefined){
let data39 = data30.unit;
if(!(((data39 === "px") || (data39 === "mm")) || (data39 === "m"))){
const err102 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates/unit",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/properties/unit/enum",keyword:"enum",params:{allowedValues: schema41.properties.expected_outputs.items.properties.dataContract.anyOf[1].properties.coordinates.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
}
else {
const err103 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/coordinates",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/properties/coordinates/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
}
}
else {
const err104 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
var _valid1 = _errs67 === errors;
valid10 = valid10 || _valid1;
if(_valid1){
if(props1 !== true){
props1 = true;
}
}
const _errs97 = errors;
if(data17 && typeof data17 == "object" && !Array.isArray(data17)){
if(data17.kind === undefined){
const err105 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
if(data17.from === undefined){
const err106 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/required",keyword:"required",params:{missingProperty: "from"},message:"must have required property '"+"from"+"'"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
if(data17.to === undefined){
const err107 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/required",keyword:"required",params:{missingProperty: "to"},message:"must have required property '"+"to"+"'"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
for(const key10 in data17){
if(!(((key10 === "kind") || (key10 === "from")) || (key10 === "to"))){
const err108 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
if(data17.kind !== undefined){
if("homography" !== data17.kind){
const err109 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "homography"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
}
if(data17.from !== undefined){
let data41 = data17.from;
if(data41 && typeof data41 == "object" && !Array.isArray(data41)){
if(data41.frame === undefined){
const err110 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/required",keyword:"required",params:{missingProperty: "frame"},message:"must have required property '"+"frame"+"'"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
if(data41.unit === undefined){
const err111 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
for(const key11 in data41){
if(!((key11 === "frame") || (key11 === "unit"))){
const err112 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
}
if(data41.frame !== undefined){
let data42 = data41.frame;
const _errs105 = errors;
let valid25 = false;
const _errs106 = errors;
if(data42 && typeof data42 == "object" && !Array.isArray(data42)){
if(data42.kind === undefined){
const err113 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
if(data42.slot === undefined){
const err114 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
for(const key12 in data42){
if(!((key12 === "kind") || (key12 === "slot"))){
const err115 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
}
if(data42.kind !== undefined){
if("input" !== data42.kind){
const err116 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "input"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
}
if(data42.slot !== undefined){
let data44 = data42.slot;
if(typeof data44 === "string"){
if(func1(data44) < 1){
const err117 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
}
else {
const err118 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
}
}
else {
const err119 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
var _valid4 = _errs106 === errors;
valid25 = valid25 || _valid4;
if(_valid4){
var props3 = true;
}
const _errs112 = errors;
if(data42 && typeof data42 == "object" && !Array.isArray(data42)){
if(data42.kind === undefined){
const err120 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
if(data42.slot === undefined){
const err121 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
for(const key13 in data42){
if(!((key13 === "kind") || (key13 === "slot"))){
const err122 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
}
if(data42.kind !== undefined){
if("reference" !== data42.kind){
const err123 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "reference"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
}
if(data42.slot !== undefined){
let data46 = data42.slot;
if(typeof data46 === "string"){
if(func1(data46) < 1){
const err124 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
}
else {
const err125 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
}
}
else {
const err126 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
var _valid4 = _errs112 === errors;
valid25 = valid25 || _valid4;
if(_valid4){
if(props3 !== true){
props3 = true;
}
}
const _errs118 = errors;
if(data42 && typeof data42 == "object" && !Array.isArray(data42)){
if(data42.kind === undefined){
const err127 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
if(data42.nodeId === undefined){
const err128 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
if(data42.artifactId === undefined){
const err129 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
for(const key14 in data42){
if(!(((key14 === "kind") || (key14 === "nodeId")) || (key14 === "artifactId"))){
const err130 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
}
if(data42.kind !== undefined){
if("artifact" !== data42.kind){
const err131 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "artifact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
}
if(data42.nodeId !== undefined){
let data48 = data42.nodeId;
if(typeof data48 === "string"){
if(func1(data48) < 1){
const err132 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame/nodeId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
}
else {
const err133 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame/nodeId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
}
if(data42.artifactId !== undefined){
let data49 = data42.artifactId;
if(typeof data49 === "string"){
if(func1(data49) < 1){
const err134 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame/artifactId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
}
else {
const err135 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame/artifactId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
}
}
else {
const err136 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
var _valid4 = _errs118 === errors;
valid25 = valid25 || _valid4;
if(_valid4){
if(props3 !== true){
props3 = true;
}
}
if(!valid25){
const err137 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
else {
errors = _errs105;
if(vErrors !== null){
if(_errs105){
vErrors.length = _errs105;
}
else {
vErrors = null;
}
}
}
}
if(data41.unit !== undefined){
let data50 = data41.unit;
if(!(((data50 === "px") || (data50 === "mm")) || (data50 === "m"))){
const err138 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from/unit",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/properties/unit/enum",keyword:"enum",params:{allowedValues: schema41.properties.expected_outputs.items.properties.dataContract.anyOf[2].properties.from.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
}
}
else {
const err139 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/from",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/from/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
}
if(data17.to !== undefined){
let data51 = data17.to;
if(data51 && typeof data51 == "object" && !Array.isArray(data51)){
if(data51.frame === undefined){
const err140 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/required",keyword:"required",params:{missingProperty: "frame"},message:"must have required property '"+"frame"+"'"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
if(data51.unit === undefined){
const err141 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
for(const key15 in data51){
if(!((key15 === "frame") || (key15 === "unit"))){
const err142 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
}
if(data51.frame !== undefined){
let data52 = data51.frame;
const _errs131 = errors;
let valid30 = false;
const _errs132 = errors;
if(data52 && typeof data52 == "object" && !Array.isArray(data52)){
if(data52.kind === undefined){
const err143 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
if(data52.slot === undefined){
const err144 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
for(const key16 in data52){
if(!((key16 === "kind") || (key16 === "slot"))){
const err145 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
}
if(data52.kind !== undefined){
if("input" !== data52.kind){
const err146 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "input"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
}
if(data52.slot !== undefined){
let data54 = data52.slot;
if(typeof data54 === "string"){
if(func1(data54) < 1){
const err147 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
}
else {
const err148 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
}
}
else {
const err149 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
var _valid5 = _errs132 === errors;
valid30 = valid30 || _valid5;
if(_valid5){
var props4 = true;
}
const _errs138 = errors;
if(data52 && typeof data52 == "object" && !Array.isArray(data52)){
if(data52.kind === undefined){
const err150 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
if(data52.slot === undefined){
const err151 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
for(const key17 in data52){
if(!((key17 === "kind") || (key17 === "slot"))){
const err152 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key17},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
}
if(data52.kind !== undefined){
if("reference" !== data52.kind){
const err153 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "reference"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
}
if(data52.slot !== undefined){
let data56 = data52.slot;
if(typeof data56 === "string"){
if(func1(data56) < 1){
const err154 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
}
}
else {
const err155 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame/slot",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
}
}
else {
const err156 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
var _valid5 = _errs138 === errors;
valid30 = valid30 || _valid5;
if(_valid5){
if(props4 !== true){
props4 = true;
}
}
const _errs144 = errors;
if(data52 && typeof data52 == "object" && !Array.isArray(data52)){
if(data52.kind === undefined){
const err157 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
if(data52.nodeId === undefined){
const err158 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
if(data52.artifactId === undefined){
const err159 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
for(const key18 in data52){
if(!(((key18 === "kind") || (key18 === "nodeId")) || (key18 === "artifactId"))){
const err160 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key18},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
}
}
if(data52.kind !== undefined){
if("artifact" !== data52.kind){
const err161 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "artifact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
}
if(data52.nodeId !== undefined){
let data58 = data52.nodeId;
if(typeof data58 === "string"){
if(func1(data58) < 1){
const err162 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame/nodeId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
}
else {
const err163 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame/nodeId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
}
if(data52.artifactId !== undefined){
let data59 = data52.artifactId;
if(typeof data59 === "string"){
if(func1(data59) < 1){
const err164 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame/artifactId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
}
else {
const err165 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame/artifactId",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
}
}
else {
const err166 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
}
var _valid5 = _errs144 === errors;
valid30 = valid30 || _valid5;
if(_valid5){
if(props4 !== true){
props4 = true;
}
}
if(!valid30){
const err167 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/frame",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
else {
errors = _errs131;
if(vErrors !== null){
if(_errs131){
vErrors.length = _errs131;
}
else {
vErrors = null;
}
}
}
}
if(data51.unit !== undefined){
let data60 = data51.unit;
if(!(((data60 === "px") || (data60 === "mm")) || (data60 === "m"))){
const err168 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to/unit",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/properties/unit/enum",keyword:"enum",params:{allowedValues: schema41.properties.expected_outputs.items.properties.dataContract.anyOf[2].properties.to.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
}
}
else {
const err169 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/to",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/properties/to/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
}
}
else {
const err170 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
var _valid1 = _errs97 === errors;
valid10 = valid10 || _valid1;
if(_valid1){
if(props1 !== true){
props1 = true;
}
}
const _errs153 = errors;
if(data17 && typeof data17 == "object" && !Array.isArray(data17)){
if(data17.kind === undefined){
const err171 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err171];
}
else {
vErrors.push(err171);
}
errors++;
}
if(data17.unit === undefined){
const err172 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/3/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err172];
}
else {
vErrors.push(err172);
}
errors++;
}
for(const key19 in data17){
if(!((key19 === "kind") || (key19 === "unit"))){
const err173 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
}
if(data17.kind !== undefined){
if("measurement" !== data17.kind){
const err174 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "measurement"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
}
}
if(data17.unit !== undefined){
let data62 = data17.unit;
if(typeof data62 === "string"){
if(func1(data62) < 1){
const err175 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/unit",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/3/properties/unit/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
}
else {
const err176 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/unit",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/3/properties/unit/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
}
}
else {
const err177 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
var _valid1 = _errs153 === errors;
valid10 = valid10 || _valid1;
if(_valid1){
if(props1 !== true){
props1 = true;
}
}
const _errs159 = errors;
if(data17 && typeof data17 == "object" && !Array.isArray(data17)){
if(data17.kind === undefined){
const err178 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/4/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
if(data17.categories === undefined){
const err179 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/4/required",keyword:"required",params:{missingProperty: "categories"},message:"must have required property '"+"categories"+"'"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
}
for(const key20 in data17){
if(!((key20 === "kind") || (key20 === "categories"))){
const err180 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
}
if(data17.kind !== undefined){
if("classification" !== data17.kind){
const err181 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "classification"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
}
}
if(data17.categories !== undefined){
let data64 = data17.categories;
if(Array.isArray(data64)){
if(data64.length < 1){
const err182 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/categories",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/4/properties/categories/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err182];
}
else {
vErrors.push(err182);
}
errors++;
}
const len2 = data64.length;
for(let i2=0; i2<len2; i2++){
let data65 = data64[i2];
if(typeof data65 === "string"){
if(func1(data65) < 1){
const err183 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/categories/" + i2,schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/4/properties/categories/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err183];
}
else {
vErrors.push(err183);
}
errors++;
}
}
else {
const err184 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/categories/" + i2,schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/4/properties/categories/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err184];
}
else {
vErrors.push(err184);
}
errors++;
}
}
let i3 = data64.length;
let j0;
if(i3 > 1){
const indices0 = {};
for(;i3--;){
let item0 = data64[i3];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err185 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/categories",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/4/properties/categories/uniqueItems",keyword:"uniqueItems",params:{i: i3, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i3+" are identical)"};
if(vErrors === null){
vErrors = [err185];
}
else {
vErrors.push(err185);
}
errors++;
break;
}
indices0[item0] = i3;
}
}
}
else {
const err186 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/categories",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/4/properties/categories/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err186];
}
else {
vErrors.push(err186);
}
errors++;
}
}
}
else {
const err187 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err187];
}
else {
vErrors.push(err187);
}
errors++;
}
var _valid1 = _errs159 === errors;
valid10 = valid10 || _valid1;
if(_valid1){
if(props1 !== true){
props1 = true;
}
}
const _errs167 = errors;
if(data17 && typeof data17 == "object" && !Array.isArray(data17)){
if(data17.kind === undefined){
const err188 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/5/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err188];
}
else {
vErrors.push(err188);
}
errors++;
}
for(const key21 in data17){
if(!(key21 === "kind")){
const err189 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err189];
}
else {
vErrors.push(err189);
}
errors++;
}
}
if(data17.kind !== undefined){
let data66 = data17.kind;
if(!((data66 === "json") || (data66 === "file"))){
const err190 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract/kind",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/5/properties/kind/enum",keyword:"enum",params:{allowedValues: schema41.properties.expected_outputs.items.properties.dataContract.anyOf[5].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err190];
}
else {
vErrors.push(err190);
}
errors++;
}
}
}
else {
const err191 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err191];
}
else {
vErrors.push(err191);
}
errors++;
}
var _valid1 = _errs167 === errors;
valid10 = valid10 || _valid1;
if(_valid1){
if(props1 !== true){
props1 = true;
}
}
if(!valid10){
const err192 = {instancePath:instancePath+"/expected_outputs/" + i1+"/dataContract",schemaPath:"#/properties/expected_outputs/items/properties/dataContract/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err192];
}
else {
vErrors.push(err192);
}
errors++;
}
else {
errors = _errs36;
if(vErrors !== null){
if(_errs36){
vErrors.length = _errs36;
}
else {
vErrors = null;
}
}
}
}
if(data14.role !== undefined){
let data67 = data14.role;
if(!((data67 === "result") || (data67 === "intermediate"))){
const err193 = {instancePath:instancePath+"/expected_outputs/" + i1+"/role",schemaPath:"#/properties/expected_outputs/items/properties/role/enum",keyword:"enum",params:{allowedValues: schema41.properties.expected_outputs.items.properties.role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err193];
}
else {
vErrors.push(err193);
}
errors++;
}
}
}
else {
const err194 = {instancePath:instancePath+"/expected_outputs/" + i1,schemaPath:"#/properties/expected_outputs/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err194];
}
else {
vErrors.push(err194);
}
errors++;
}
}
}
else {
const err195 = {instancePath:instancePath+"/expected_outputs",schemaPath:"#/properties/expected_outputs/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err195];
}
else {
vErrors.push(err195);
}
errors++;
}
}
if(data.inputs !== undefined){
let data68 = data.inputs;
if(data68 && typeof data68 == "object" && !Array.isArray(data68)){
for(const key22 in data68){
let data69 = data68[key22];
if(data69 && typeof data69 == "object" && !Array.isArray(data69)){
if(data69.nodeId === undefined){
const err196 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/inputs/additionalProperties/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err196];
}
else {
vErrors.push(err196);
}
errors++;
}
if(data69.artifactId === undefined){
const err197 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/inputs/additionalProperties/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err197];
}
else {
vErrors.push(err197);
}
errors++;
}
if(data69.nodeId !== undefined){
let data70 = data69.nodeId;
if(typeof data70 === "string"){
if(func1(data70) < 1){
const err198 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/nodeId",schemaPath:"#/properties/inputs/additionalProperties/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err198];
}
else {
vErrors.push(err198);
}
errors++;
}
}
else {
const err199 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/nodeId",schemaPath:"#/properties/inputs/additionalProperties/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err199];
}
else {
vErrors.push(err199);
}
errors++;
}
}
if(data69.artifactId !== undefined){
let data71 = data69.artifactId;
if(typeof data71 === "string"){
if(func1(data71) < 1){
const err200 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/artifactId",schemaPath:"#/properties/inputs/additionalProperties/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err200];
}
else {
vErrors.push(err200);
}
errors++;
}
}
else {
const err201 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/artifactId",schemaPath:"#/properties/inputs/additionalProperties/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err201];
}
else {
vErrors.push(err201);
}
errors++;
}
}
if(data69.dataContract !== undefined){
let data72 = data69.dataContract;
const _errs182 = errors;
let valid42 = false;
const _errs183 = errors;
if(data72 && typeof data72 == "object" && !Array.isArray(data72)){
if(data72.kind === undefined){
const err202 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err202];
}
else {
vErrors.push(err202);
}
errors++;
}
if(data72.coordinates === undefined){
const err203 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/required",keyword:"required",params:{missingProperty: "coordinates"},message:"must have required property '"+"coordinates"+"'"};
if(vErrors === null){
vErrors = [err203];
}
else {
vErrors.push(err203);
}
errors++;
}
for(const key23 in data72){
if(!((key23 === "kind") || (key23 === "coordinates"))){
const err204 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key23},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err204];
}
else {
vErrors.push(err204);
}
errors++;
}
}
if(data72.kind !== undefined){
let data73 = data72.kind;
if(!((data73 === "image") || (data73 === "mask"))){
const err205 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema41.properties.inputs.additionalProperties.properties.dataContract.anyOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err205];
}
else {
vErrors.push(err205);
}
errors++;
}
}
if(data72.coordinates !== undefined){
let data74 = data72.coordinates;
if(data74 && typeof data74 == "object" && !Array.isArray(data74)){
if(data74.frame === undefined){
const err206 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/required",keyword:"required",params:{missingProperty: "frame"},message:"must have required property '"+"frame"+"'"};
if(vErrors === null){
vErrors = [err206];
}
else {
vErrors.push(err206);
}
errors++;
}
if(data74.unit === undefined){
const err207 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err207];
}
else {
vErrors.push(err207);
}
errors++;
}
for(const key24 in data74){
if(!((key24 === "frame") || (key24 === "unit"))){
const err208 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key24},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err208];
}
else {
vErrors.push(err208);
}
errors++;
}
}
if(data74.frame !== undefined){
let data75 = data74.frame;
const _errs191 = errors;
let valid45 = false;
const _errs192 = errors;
if(data75 && typeof data75 == "object" && !Array.isArray(data75)){
if(data75.kind === undefined){
const err209 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err209];
}
else {
vErrors.push(err209);
}
errors++;
}
if(data75.slot === undefined){
const err210 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err210];
}
else {
vErrors.push(err210);
}
errors++;
}
for(const key25 in data75){
if(!((key25 === "kind") || (key25 === "slot"))){
const err211 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key25},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err211];
}
else {
vErrors.push(err211);
}
errors++;
}
}
if(data75.kind !== undefined){
if("input" !== data75.kind){
const err212 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "input"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err212];
}
else {
vErrors.push(err212);
}
errors++;
}
}
if(data75.slot !== undefined){
let data77 = data75.slot;
if(typeof data77 === "string"){
if(func1(data77) < 1){
const err213 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err213];
}
else {
vErrors.push(err213);
}
errors++;
}
}
else {
const err214 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err214];
}
else {
vErrors.push(err214);
}
errors++;
}
}
}
else {
const err215 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err215];
}
else {
vErrors.push(err215);
}
errors++;
}
var _valid7 = _errs192 === errors;
valid45 = valid45 || _valid7;
if(_valid7){
var props5 = true;
}
const _errs198 = errors;
if(data75 && typeof data75 == "object" && !Array.isArray(data75)){
if(data75.kind === undefined){
const err216 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err216];
}
else {
vErrors.push(err216);
}
errors++;
}
if(data75.slot === undefined){
const err217 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err217];
}
else {
vErrors.push(err217);
}
errors++;
}
for(const key26 in data75){
if(!((key26 === "kind") || (key26 === "slot"))){
const err218 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key26},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err218];
}
else {
vErrors.push(err218);
}
errors++;
}
}
if(data75.kind !== undefined){
if("reference" !== data75.kind){
const err219 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "reference"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err219];
}
else {
vErrors.push(err219);
}
errors++;
}
}
if(data75.slot !== undefined){
let data79 = data75.slot;
if(typeof data79 === "string"){
if(func1(data79) < 1){
const err220 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err220];
}
else {
vErrors.push(err220);
}
errors++;
}
}
else {
const err221 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err221];
}
else {
vErrors.push(err221);
}
errors++;
}
}
}
else {
const err222 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err222];
}
else {
vErrors.push(err222);
}
errors++;
}
var _valid7 = _errs198 === errors;
valid45 = valid45 || _valid7;
if(_valid7){
if(props5 !== true){
props5 = true;
}
}
const _errs204 = errors;
if(data75 && typeof data75 == "object" && !Array.isArray(data75)){
if(data75.kind === undefined){
const err223 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err223];
}
else {
vErrors.push(err223);
}
errors++;
}
if(data75.nodeId === undefined){
const err224 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err224];
}
else {
vErrors.push(err224);
}
errors++;
}
if(data75.artifactId === undefined){
const err225 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err225];
}
else {
vErrors.push(err225);
}
errors++;
}
for(const key27 in data75){
if(!(((key27 === "kind") || (key27 === "nodeId")) || (key27 === "artifactId"))){
const err226 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key27},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err226];
}
else {
vErrors.push(err226);
}
errors++;
}
}
if(data75.kind !== undefined){
if("artifact" !== data75.kind){
const err227 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "artifact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err227];
}
else {
vErrors.push(err227);
}
errors++;
}
}
if(data75.nodeId !== undefined){
let data81 = data75.nodeId;
if(typeof data81 === "string"){
if(func1(data81) < 1){
const err228 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/nodeId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err228];
}
else {
vErrors.push(err228);
}
errors++;
}
}
else {
const err229 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/nodeId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err229];
}
else {
vErrors.push(err229);
}
errors++;
}
}
if(data75.artifactId !== undefined){
let data82 = data75.artifactId;
if(typeof data82 === "string"){
if(func1(data82) < 1){
const err230 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/artifactId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err230];
}
else {
vErrors.push(err230);
}
errors++;
}
}
else {
const err231 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/artifactId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err231];
}
else {
vErrors.push(err231);
}
errors++;
}
}
}
else {
const err232 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err232];
}
else {
vErrors.push(err232);
}
errors++;
}
var _valid7 = _errs204 === errors;
valid45 = valid45 || _valid7;
if(_valid7){
if(props5 !== true){
props5 = true;
}
}
if(!valid45){
const err233 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/frame/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err233];
}
else {
vErrors.push(err233);
}
errors++;
}
else {
errors = _errs191;
if(vErrors !== null){
if(_errs191){
vErrors.length = _errs191;
}
else {
vErrors = null;
}
}
}
}
if(data74.unit !== undefined){
let data83 = data74.unit;
if(!(((data83 === "px") || (data83 === "mm")) || (data83 === "m"))){
const err234 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/unit",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/properties/unit/enum",keyword:"enum",params:{allowedValues: schema41.properties.inputs.additionalProperties.properties.dataContract.anyOf[0].properties.coordinates.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err234];
}
else {
vErrors.push(err234);
}
errors++;
}
}
}
else {
const err235 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/properties/coordinates/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err235];
}
else {
vErrors.push(err235);
}
errors++;
}
}
}
else {
const err236 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err236];
}
else {
vErrors.push(err236);
}
errors++;
}
var _valid6 = _errs183 === errors;
valid42 = valid42 || _valid6;
if(_valid6){
var props6 = true;
}
const _errs213 = errors;
if(data72 && typeof data72 == "object" && !Array.isArray(data72)){
if(data72.kind === undefined){
const err237 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err237];
}
else {
vErrors.push(err237);
}
errors++;
}
if(data72.coordinates === undefined){
const err238 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/required",keyword:"required",params:{missingProperty: "coordinates"},message:"must have required property '"+"coordinates"+"'"};
if(vErrors === null){
vErrors = [err238];
}
else {
vErrors.push(err238);
}
errors++;
}
for(const key28 in data72){
if(!((key28 === "kind") || (key28 === "coordinates"))){
const err239 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key28},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err239];
}
else {
vErrors.push(err239);
}
errors++;
}
}
if(data72.kind !== undefined){
let data84 = data72.kind;
if(!(((data84 === "points") || (data84 === "contours")) || (data84 === "roi"))){
const err240 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema41.properties.inputs.additionalProperties.properties.dataContract.anyOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err240];
}
else {
vErrors.push(err240);
}
errors++;
}
}
if(data72.coordinates !== undefined){
let data85 = data72.coordinates;
if(data85 && typeof data85 == "object" && !Array.isArray(data85)){
if(data85.frame === undefined){
const err241 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/required",keyword:"required",params:{missingProperty: "frame"},message:"must have required property '"+"frame"+"'"};
if(vErrors === null){
vErrors = [err241];
}
else {
vErrors.push(err241);
}
errors++;
}
if(data85.unit === undefined){
const err242 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err242];
}
else {
vErrors.push(err242);
}
errors++;
}
for(const key29 in data85){
if(!((key29 === "frame") || (key29 === "unit"))){
const err243 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key29},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err243];
}
else {
vErrors.push(err243);
}
errors++;
}
}
if(data85.frame !== undefined){
let data86 = data85.frame;
const _errs221 = errors;
let valid51 = false;
const _errs222 = errors;
if(data86 && typeof data86 == "object" && !Array.isArray(data86)){
if(data86.kind === undefined){
const err244 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err244];
}
else {
vErrors.push(err244);
}
errors++;
}
if(data86.slot === undefined){
const err245 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err245];
}
else {
vErrors.push(err245);
}
errors++;
}
for(const key30 in data86){
if(!((key30 === "kind") || (key30 === "slot"))){
const err246 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key30},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err246];
}
else {
vErrors.push(err246);
}
errors++;
}
}
if(data86.kind !== undefined){
if("input" !== data86.kind){
const err247 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "input"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err247];
}
else {
vErrors.push(err247);
}
errors++;
}
}
if(data86.slot !== undefined){
let data88 = data86.slot;
if(typeof data88 === "string"){
if(func1(data88) < 1){
const err248 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err248];
}
else {
vErrors.push(err248);
}
errors++;
}
}
else {
const err249 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err249];
}
else {
vErrors.push(err249);
}
errors++;
}
}
}
else {
const err250 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err250];
}
else {
vErrors.push(err250);
}
errors++;
}
var _valid8 = _errs222 === errors;
valid51 = valid51 || _valid8;
if(_valid8){
var props7 = true;
}
const _errs228 = errors;
if(data86 && typeof data86 == "object" && !Array.isArray(data86)){
if(data86.kind === undefined){
const err251 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err251];
}
else {
vErrors.push(err251);
}
errors++;
}
if(data86.slot === undefined){
const err252 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err252];
}
else {
vErrors.push(err252);
}
errors++;
}
for(const key31 in data86){
if(!((key31 === "kind") || (key31 === "slot"))){
const err253 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key31},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err253];
}
else {
vErrors.push(err253);
}
errors++;
}
}
if(data86.kind !== undefined){
if("reference" !== data86.kind){
const err254 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "reference"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err254];
}
else {
vErrors.push(err254);
}
errors++;
}
}
if(data86.slot !== undefined){
let data90 = data86.slot;
if(typeof data90 === "string"){
if(func1(data90) < 1){
const err255 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err255];
}
else {
vErrors.push(err255);
}
errors++;
}
}
else {
const err256 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err256];
}
else {
vErrors.push(err256);
}
errors++;
}
}
}
else {
const err257 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err257];
}
else {
vErrors.push(err257);
}
errors++;
}
var _valid8 = _errs228 === errors;
valid51 = valid51 || _valid8;
if(_valid8){
if(props7 !== true){
props7 = true;
}
}
const _errs234 = errors;
if(data86 && typeof data86 == "object" && !Array.isArray(data86)){
if(data86.kind === undefined){
const err258 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err258];
}
else {
vErrors.push(err258);
}
errors++;
}
if(data86.nodeId === undefined){
const err259 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err259];
}
else {
vErrors.push(err259);
}
errors++;
}
if(data86.artifactId === undefined){
const err260 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err260];
}
else {
vErrors.push(err260);
}
errors++;
}
for(const key32 in data86){
if(!(((key32 === "kind") || (key32 === "nodeId")) || (key32 === "artifactId"))){
const err261 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key32},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err261];
}
else {
vErrors.push(err261);
}
errors++;
}
}
if(data86.kind !== undefined){
if("artifact" !== data86.kind){
const err262 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "artifact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err262];
}
else {
vErrors.push(err262);
}
errors++;
}
}
if(data86.nodeId !== undefined){
let data92 = data86.nodeId;
if(typeof data92 === "string"){
if(func1(data92) < 1){
const err263 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/nodeId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err263];
}
else {
vErrors.push(err263);
}
errors++;
}
}
else {
const err264 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/nodeId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err264];
}
else {
vErrors.push(err264);
}
errors++;
}
}
if(data86.artifactId !== undefined){
let data93 = data86.artifactId;
if(typeof data93 === "string"){
if(func1(data93) < 1){
const err265 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/artifactId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err265];
}
else {
vErrors.push(err265);
}
errors++;
}
}
else {
const err266 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame/artifactId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err266];
}
else {
vErrors.push(err266);
}
errors++;
}
}
}
else {
const err267 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err267];
}
else {
vErrors.push(err267);
}
errors++;
}
var _valid8 = _errs234 === errors;
valid51 = valid51 || _valid8;
if(_valid8){
if(props7 !== true){
props7 = true;
}
}
if(!valid51){
const err268 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/frame/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err268];
}
else {
vErrors.push(err268);
}
errors++;
}
else {
errors = _errs221;
if(vErrors !== null){
if(_errs221){
vErrors.length = _errs221;
}
else {
vErrors = null;
}
}
}
}
if(data85.unit !== undefined){
let data94 = data85.unit;
if(!(((data94 === "px") || (data94 === "mm")) || (data94 === "m"))){
const err269 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates/unit",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/properties/unit/enum",keyword:"enum",params:{allowedValues: schema41.properties.inputs.additionalProperties.properties.dataContract.anyOf[1].properties.coordinates.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err269];
}
else {
vErrors.push(err269);
}
errors++;
}
}
}
else {
const err270 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/coordinates",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/properties/coordinates/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err270];
}
else {
vErrors.push(err270);
}
errors++;
}
}
}
else {
const err271 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err271];
}
else {
vErrors.push(err271);
}
errors++;
}
var _valid6 = _errs213 === errors;
valid42 = valid42 || _valid6;
if(_valid6){
if(props6 !== true){
props6 = true;
}
}
const _errs243 = errors;
if(data72 && typeof data72 == "object" && !Array.isArray(data72)){
if(data72.kind === undefined){
const err272 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err272];
}
else {
vErrors.push(err272);
}
errors++;
}
if(data72.from === undefined){
const err273 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/required",keyword:"required",params:{missingProperty: "from"},message:"must have required property '"+"from"+"'"};
if(vErrors === null){
vErrors = [err273];
}
else {
vErrors.push(err273);
}
errors++;
}
if(data72.to === undefined){
const err274 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/required",keyword:"required",params:{missingProperty: "to"},message:"must have required property '"+"to"+"'"};
if(vErrors === null){
vErrors = [err274];
}
else {
vErrors.push(err274);
}
errors++;
}
for(const key33 in data72){
if(!(((key33 === "kind") || (key33 === "from")) || (key33 === "to"))){
const err275 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key33},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err275];
}
else {
vErrors.push(err275);
}
errors++;
}
}
if(data72.kind !== undefined){
if("homography" !== data72.kind){
const err276 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "homography"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err276];
}
else {
vErrors.push(err276);
}
errors++;
}
}
if(data72.from !== undefined){
let data96 = data72.from;
if(data96 && typeof data96 == "object" && !Array.isArray(data96)){
if(data96.frame === undefined){
const err277 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/required",keyword:"required",params:{missingProperty: "frame"},message:"must have required property '"+"frame"+"'"};
if(vErrors === null){
vErrors = [err277];
}
else {
vErrors.push(err277);
}
errors++;
}
if(data96.unit === undefined){
const err278 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err278];
}
else {
vErrors.push(err278);
}
errors++;
}
for(const key34 in data96){
if(!((key34 === "frame") || (key34 === "unit"))){
const err279 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key34},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err279];
}
else {
vErrors.push(err279);
}
errors++;
}
}
if(data96.frame !== undefined){
let data97 = data96.frame;
const _errs251 = errors;
let valid57 = false;
const _errs252 = errors;
if(data97 && typeof data97 == "object" && !Array.isArray(data97)){
if(data97.kind === undefined){
const err280 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err280];
}
else {
vErrors.push(err280);
}
errors++;
}
if(data97.slot === undefined){
const err281 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err281];
}
else {
vErrors.push(err281);
}
errors++;
}
for(const key35 in data97){
if(!((key35 === "kind") || (key35 === "slot"))){
const err282 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key35},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err282];
}
else {
vErrors.push(err282);
}
errors++;
}
}
if(data97.kind !== undefined){
if("input" !== data97.kind){
const err283 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "input"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err283];
}
else {
vErrors.push(err283);
}
errors++;
}
}
if(data97.slot !== undefined){
let data99 = data97.slot;
if(typeof data99 === "string"){
if(func1(data99) < 1){
const err284 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err284];
}
else {
vErrors.push(err284);
}
errors++;
}
}
else {
const err285 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err285];
}
else {
vErrors.push(err285);
}
errors++;
}
}
}
else {
const err286 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err286];
}
else {
vErrors.push(err286);
}
errors++;
}
var _valid9 = _errs252 === errors;
valid57 = valid57 || _valid9;
if(_valid9){
var props8 = true;
}
const _errs258 = errors;
if(data97 && typeof data97 == "object" && !Array.isArray(data97)){
if(data97.kind === undefined){
const err287 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err287];
}
else {
vErrors.push(err287);
}
errors++;
}
if(data97.slot === undefined){
const err288 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err288];
}
else {
vErrors.push(err288);
}
errors++;
}
for(const key36 in data97){
if(!((key36 === "kind") || (key36 === "slot"))){
const err289 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key36},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err289];
}
else {
vErrors.push(err289);
}
errors++;
}
}
if(data97.kind !== undefined){
if("reference" !== data97.kind){
const err290 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "reference"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err290];
}
else {
vErrors.push(err290);
}
errors++;
}
}
if(data97.slot !== undefined){
let data101 = data97.slot;
if(typeof data101 === "string"){
if(func1(data101) < 1){
const err291 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err291];
}
else {
vErrors.push(err291);
}
errors++;
}
}
else {
const err292 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err292];
}
else {
vErrors.push(err292);
}
errors++;
}
}
}
else {
const err293 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err293];
}
else {
vErrors.push(err293);
}
errors++;
}
var _valid9 = _errs258 === errors;
valid57 = valid57 || _valid9;
if(_valid9){
if(props8 !== true){
props8 = true;
}
}
const _errs264 = errors;
if(data97 && typeof data97 == "object" && !Array.isArray(data97)){
if(data97.kind === undefined){
const err294 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err294];
}
else {
vErrors.push(err294);
}
errors++;
}
if(data97.nodeId === undefined){
const err295 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err295];
}
else {
vErrors.push(err295);
}
errors++;
}
if(data97.artifactId === undefined){
const err296 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err296];
}
else {
vErrors.push(err296);
}
errors++;
}
for(const key37 in data97){
if(!(((key37 === "kind") || (key37 === "nodeId")) || (key37 === "artifactId"))){
const err297 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key37},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err297];
}
else {
vErrors.push(err297);
}
errors++;
}
}
if(data97.kind !== undefined){
if("artifact" !== data97.kind){
const err298 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "artifact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err298];
}
else {
vErrors.push(err298);
}
errors++;
}
}
if(data97.nodeId !== undefined){
let data103 = data97.nodeId;
if(typeof data103 === "string"){
if(func1(data103) < 1){
const err299 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame/nodeId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err299];
}
else {
vErrors.push(err299);
}
errors++;
}
}
else {
const err300 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame/nodeId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err300];
}
else {
vErrors.push(err300);
}
errors++;
}
}
if(data97.artifactId !== undefined){
let data104 = data97.artifactId;
if(typeof data104 === "string"){
if(func1(data104) < 1){
const err301 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame/artifactId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err301];
}
else {
vErrors.push(err301);
}
errors++;
}
}
else {
const err302 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame/artifactId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err302];
}
else {
vErrors.push(err302);
}
errors++;
}
}
}
else {
const err303 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err303];
}
else {
vErrors.push(err303);
}
errors++;
}
var _valid9 = _errs264 === errors;
valid57 = valid57 || _valid9;
if(_valid9){
if(props8 !== true){
props8 = true;
}
}
if(!valid57){
const err304 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/frame/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err304];
}
else {
vErrors.push(err304);
}
errors++;
}
else {
errors = _errs251;
if(vErrors !== null){
if(_errs251){
vErrors.length = _errs251;
}
else {
vErrors = null;
}
}
}
}
if(data96.unit !== undefined){
let data105 = data96.unit;
if(!(((data105 === "px") || (data105 === "mm")) || (data105 === "m"))){
const err305 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from/unit",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/properties/unit/enum",keyword:"enum",params:{allowedValues: schema41.properties.inputs.additionalProperties.properties.dataContract.anyOf[2].properties.from.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err305];
}
else {
vErrors.push(err305);
}
errors++;
}
}
}
else {
const err306 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/from",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/from/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err306];
}
else {
vErrors.push(err306);
}
errors++;
}
}
if(data72.to !== undefined){
let data106 = data72.to;
if(data106 && typeof data106 == "object" && !Array.isArray(data106)){
if(data106.frame === undefined){
const err307 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/required",keyword:"required",params:{missingProperty: "frame"},message:"must have required property '"+"frame"+"'"};
if(vErrors === null){
vErrors = [err307];
}
else {
vErrors.push(err307);
}
errors++;
}
if(data106.unit === undefined){
const err308 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err308];
}
else {
vErrors.push(err308);
}
errors++;
}
for(const key38 in data106){
if(!((key38 === "frame") || (key38 === "unit"))){
const err309 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key38},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err309];
}
else {
vErrors.push(err309);
}
errors++;
}
}
if(data106.frame !== undefined){
let data107 = data106.frame;
const _errs277 = errors;
let valid62 = false;
const _errs278 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.kind === undefined){
const err310 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err310];
}
else {
vErrors.push(err310);
}
errors++;
}
if(data107.slot === undefined){
const err311 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err311];
}
else {
vErrors.push(err311);
}
errors++;
}
for(const key39 in data107){
if(!((key39 === "kind") || (key39 === "slot"))){
const err312 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key39},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err312];
}
else {
vErrors.push(err312);
}
errors++;
}
}
if(data107.kind !== undefined){
if("input" !== data107.kind){
const err313 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "input"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err313];
}
else {
vErrors.push(err313);
}
errors++;
}
}
if(data107.slot !== undefined){
let data109 = data107.slot;
if(typeof data109 === "string"){
if(func1(data109) < 1){
const err314 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err314];
}
else {
vErrors.push(err314);
}
errors++;
}
}
else {
const err315 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err315];
}
else {
vErrors.push(err315);
}
errors++;
}
}
}
else {
const err316 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err316];
}
else {
vErrors.push(err316);
}
errors++;
}
var _valid10 = _errs278 === errors;
valid62 = valid62 || _valid10;
if(_valid10){
var props9 = true;
}
const _errs284 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.kind === undefined){
const err317 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err317];
}
else {
vErrors.push(err317);
}
errors++;
}
if(data107.slot === undefined){
const err318 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err318];
}
else {
vErrors.push(err318);
}
errors++;
}
for(const key40 in data107){
if(!((key40 === "kind") || (key40 === "slot"))){
const err319 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key40},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err319];
}
else {
vErrors.push(err319);
}
errors++;
}
}
if(data107.kind !== undefined){
if("reference" !== data107.kind){
const err320 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "reference"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err320];
}
else {
vErrors.push(err320);
}
errors++;
}
}
if(data107.slot !== undefined){
let data111 = data107.slot;
if(typeof data111 === "string"){
if(func1(data111) < 1){
const err321 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err321];
}
else {
vErrors.push(err321);
}
errors++;
}
}
else {
const err322 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame/slot",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err322];
}
else {
vErrors.push(err322);
}
errors++;
}
}
}
else {
const err323 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err323];
}
else {
vErrors.push(err323);
}
errors++;
}
var _valid10 = _errs284 === errors;
valid62 = valid62 || _valid10;
if(_valid10){
if(props9 !== true){
props9 = true;
}
}
const _errs290 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.kind === undefined){
const err324 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err324];
}
else {
vErrors.push(err324);
}
errors++;
}
if(data107.nodeId === undefined){
const err325 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err325];
}
else {
vErrors.push(err325);
}
errors++;
}
if(data107.artifactId === undefined){
const err326 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err326];
}
else {
vErrors.push(err326);
}
errors++;
}
for(const key41 in data107){
if(!(((key41 === "kind") || (key41 === "nodeId")) || (key41 === "artifactId"))){
const err327 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key41},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err327];
}
else {
vErrors.push(err327);
}
errors++;
}
}
if(data107.kind !== undefined){
if("artifact" !== data107.kind){
const err328 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "artifact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err328];
}
else {
vErrors.push(err328);
}
errors++;
}
}
if(data107.nodeId !== undefined){
let data113 = data107.nodeId;
if(typeof data113 === "string"){
if(func1(data113) < 1){
const err329 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame/nodeId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err329];
}
else {
vErrors.push(err329);
}
errors++;
}
}
else {
const err330 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame/nodeId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err330];
}
else {
vErrors.push(err330);
}
errors++;
}
}
if(data107.artifactId !== undefined){
let data114 = data107.artifactId;
if(typeof data114 === "string"){
if(func1(data114) < 1){
const err331 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame/artifactId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err331];
}
else {
vErrors.push(err331);
}
errors++;
}
}
else {
const err332 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame/artifactId",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err332];
}
else {
vErrors.push(err332);
}
errors++;
}
}
}
else {
const err333 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err333];
}
else {
vErrors.push(err333);
}
errors++;
}
var _valid10 = _errs290 === errors;
valid62 = valid62 || _valid10;
if(_valid10){
if(props9 !== true){
props9 = true;
}
}
if(!valid62){
const err334 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/frame",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/frame/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err334];
}
else {
vErrors.push(err334);
}
errors++;
}
else {
errors = _errs277;
if(vErrors !== null){
if(_errs277){
vErrors.length = _errs277;
}
else {
vErrors = null;
}
}
}
}
if(data106.unit !== undefined){
let data115 = data106.unit;
if(!(((data115 === "px") || (data115 === "mm")) || (data115 === "m"))){
const err335 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to/unit",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/properties/unit/enum",keyword:"enum",params:{allowedValues: schema41.properties.inputs.additionalProperties.properties.dataContract.anyOf[2].properties.to.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err335];
}
else {
vErrors.push(err335);
}
errors++;
}
}
}
else {
const err336 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/to",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/properties/to/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err336];
}
else {
vErrors.push(err336);
}
errors++;
}
}
}
else {
const err337 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err337];
}
else {
vErrors.push(err337);
}
errors++;
}
var _valid6 = _errs243 === errors;
valid42 = valid42 || _valid6;
if(_valid6){
if(props6 !== true){
props6 = true;
}
}
const _errs299 = errors;
if(data72 && typeof data72 == "object" && !Array.isArray(data72)){
if(data72.kind === undefined){
const err338 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err338];
}
else {
vErrors.push(err338);
}
errors++;
}
if(data72.unit === undefined){
const err339 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/3/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err339];
}
else {
vErrors.push(err339);
}
errors++;
}
for(const key42 in data72){
if(!((key42 === "kind") || (key42 === "unit"))){
const err340 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key42},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err340];
}
else {
vErrors.push(err340);
}
errors++;
}
}
if(data72.kind !== undefined){
if("measurement" !== data72.kind){
const err341 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "measurement"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err341];
}
else {
vErrors.push(err341);
}
errors++;
}
}
if(data72.unit !== undefined){
let data117 = data72.unit;
if(typeof data117 === "string"){
if(func1(data117) < 1){
const err342 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/unit",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/3/properties/unit/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err342];
}
else {
vErrors.push(err342);
}
errors++;
}
}
else {
const err343 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/unit",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/3/properties/unit/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err343];
}
else {
vErrors.push(err343);
}
errors++;
}
}
}
else {
const err344 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err344];
}
else {
vErrors.push(err344);
}
errors++;
}
var _valid6 = _errs299 === errors;
valid42 = valid42 || _valid6;
if(_valid6){
if(props6 !== true){
props6 = true;
}
}
const _errs305 = errors;
if(data72 && typeof data72 == "object" && !Array.isArray(data72)){
if(data72.kind === undefined){
const err345 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/4/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err345];
}
else {
vErrors.push(err345);
}
errors++;
}
if(data72.categories === undefined){
const err346 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/4/required",keyword:"required",params:{missingProperty: "categories"},message:"must have required property '"+"categories"+"'"};
if(vErrors === null){
vErrors = [err346];
}
else {
vErrors.push(err346);
}
errors++;
}
for(const key43 in data72){
if(!((key43 === "kind") || (key43 === "categories"))){
const err347 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key43},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err347];
}
else {
vErrors.push(err347);
}
errors++;
}
}
if(data72.kind !== undefined){
if("classification" !== data72.kind){
const err348 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "classification"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err348];
}
else {
vErrors.push(err348);
}
errors++;
}
}
if(data72.categories !== undefined){
let data119 = data72.categories;
if(Array.isArray(data119)){
if(data119.length < 1){
const err349 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/categories",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/4/properties/categories/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err349];
}
else {
vErrors.push(err349);
}
errors++;
}
const len3 = data119.length;
for(let i4=0; i4<len3; i4++){
let data120 = data119[i4];
if(typeof data120 === "string"){
if(func1(data120) < 1){
const err350 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/categories/" + i4,schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/4/properties/categories/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err350];
}
else {
vErrors.push(err350);
}
errors++;
}
}
else {
const err351 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/categories/" + i4,schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/4/properties/categories/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err351];
}
else {
vErrors.push(err351);
}
errors++;
}
}
let i5 = data119.length;
let j1;
if(i5 > 1){
const indices1 = {};
for(;i5--;){
let item1 = data119[i5];
if(typeof item1 !== "string"){
continue;
}
if(typeof indices1[item1] == "number"){
j1 = indices1[item1];
const err352 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/categories",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/4/properties/categories/uniqueItems",keyword:"uniqueItems",params:{i: i5, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i5+" are identical)"};
if(vErrors === null){
vErrors = [err352];
}
else {
vErrors.push(err352);
}
errors++;
break;
}
indices1[item1] = i5;
}
}
}
else {
const err353 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/categories",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/4/properties/categories/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err353];
}
else {
vErrors.push(err353);
}
errors++;
}
}
}
else {
const err354 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err354];
}
else {
vErrors.push(err354);
}
errors++;
}
var _valid6 = _errs305 === errors;
valid42 = valid42 || _valid6;
if(_valid6){
if(props6 !== true){
props6 = true;
}
}
const _errs313 = errors;
if(data72 && typeof data72 == "object" && !Array.isArray(data72)){
if(data72.kind === undefined){
const err355 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/5/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err355];
}
else {
vErrors.push(err355);
}
errors++;
}
for(const key44 in data72){
if(!(key44 === "kind")){
const err356 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key44},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err356];
}
else {
vErrors.push(err356);
}
errors++;
}
}
if(data72.kind !== undefined){
let data121 = data72.kind;
if(!((data121 === "json") || (data121 === "file"))){
const err357 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract/kind",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/5/properties/kind/enum",keyword:"enum",params:{allowedValues: schema41.properties.inputs.additionalProperties.properties.dataContract.anyOf[5].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err357];
}
else {
vErrors.push(err357);
}
errors++;
}
}
}
else {
const err358 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err358];
}
else {
vErrors.push(err358);
}
errors++;
}
var _valid6 = _errs313 === errors;
valid42 = valid42 || _valid6;
if(_valid6){
if(props6 !== true){
props6 = true;
}
}
if(!valid42){
const err359 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/dataContract",schemaPath:"#/properties/inputs/additionalProperties/properties/dataContract/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err359];
}
else {
vErrors.push(err359);
}
errors++;
}
else {
errors = _errs182;
if(vErrors !== null){
if(_errs182){
vErrors.length = _errs182;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err360 = {instancePath:instancePath+"/inputs/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/inputs/additionalProperties/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err360];
}
else {
vErrors.push(err360);
}
errors++;
}
}
}
else {
const err361 = {instancePath:instancePath+"/inputs",schemaPath:"#/properties/inputs/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err361];
}
else {
vErrors.push(err361);
}
errors++;
}
}
if(data.when !== undefined){
let data122 = data.when;
if(data122 && typeof data122 == "object" && !Array.isArray(data122)){
if(data122.nodeId === undefined){
const err362 = {instancePath:instancePath+"/when",schemaPath:"#/properties/when/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err362];
}
else {
vErrors.push(err362);
}
errors++;
}
if(data122.status === undefined){
const err363 = {instancePath:instancePath+"/when",schemaPath:"#/properties/when/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err363];
}
else {
vErrors.push(err363);
}
errors++;
}
if(data122.nodeId !== undefined){
let data123 = data122.nodeId;
if(typeof data123 === "string"){
if(func1(data123) < 1){
const err364 = {instancePath:instancePath+"/when/nodeId",schemaPath:"#/properties/when/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err364];
}
else {
vErrors.push(err364);
}
errors++;
}
}
else {
const err365 = {instancePath:instancePath+"/when/nodeId",schemaPath:"#/properties/when/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err365];
}
else {
vErrors.push(err365);
}
errors++;
}
}
if(data122.status !== undefined){
let data124 = data122.status;
if(!((((data124 === "VALID") || (data124 === "NOT_FOUND")) || (data124 === "FAULT")) || (data124 === "COMPLETED"))){
const err366 = {instancePath:instancePath+"/when/status",schemaPath:"#/properties/when/properties/status/enum",keyword:"enum",params:{allowedValues: schema41.properties.when.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err366];
}
else {
vErrors.push(err366);
}
errors++;
}
}
}
else {
const err367 = {instancePath:instancePath+"/when",schemaPath:"#/properties/when/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err367];
}
else {
vErrors.push(err367);
}
errors++;
}
}
if(data.prerequisites !== undefined){
let data125 = data.prerequisites;
if(data125 && typeof data125 == "object" && !Array.isArray(data125)){
if(data125.anyOf !== undefined){
let data126 = data125.anyOf;
if(Array.isArray(data126)){
const len4 = data126.length;
for(let i6=0; i6<len4; i6++){
let data127 = data126[i6];
if(typeof data127 === "string"){
if(func1(data127) < 1){
const err368 = {instancePath:instancePath+"/prerequisites/anyOf/" + i6,schemaPath:"#/properties/prerequisites/properties/anyOf/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err368];
}
else {
vErrors.push(err368);
}
errors++;
}
}
else {
const err369 = {instancePath:instancePath+"/prerequisites/anyOf/" + i6,schemaPath:"#/properties/prerequisites/properties/anyOf/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err369];
}
else {
vErrors.push(err369);
}
errors++;
}
}
}
else {
const err370 = {instancePath:instancePath+"/prerequisites/anyOf",schemaPath:"#/properties/prerequisites/properties/anyOf/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err370];
}
else {
vErrors.push(err370);
}
errors++;
}
}
}
else {
const err371 = {instancePath:instancePath+"/prerequisites",schemaPath:"#/properties/prerequisites/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err371];
}
else {
vErrors.push(err371);
}
errors++;
}
}
if(data.documentation !== undefined){
let data128 = data.documentation;
if(typeof data128 === "string"){
if(func1(data128) > 64000){
const err372 = {instancePath:instancePath+"/documentation",schemaPath:"#/properties/documentation/maxLength",keyword:"maxLength",params:{limit: 64000},message:"must NOT have more than 64000 characters"};
if(vErrors === null){
vErrors = [err372];
}
else {
vErrors.push(err372);
}
errors++;
}
}
else {
const err373 = {instancePath:instancePath+"/documentation",schemaPath:"#/properties/documentation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err373];
}
else {
vErrors.push(err373);
}
errors++;
}
}
if(data.justification !== undefined){
let data129 = data.justification;
if(!(data129 && typeof data129 == "object" && !Array.isArray(data129))){
const err374 = {instancePath:instancePath+"/justification",schemaPath:"#/$defs/justification/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err374];
}
else {
vErrors.push(err374);
}
errors++;
}
}
}
else {
const err375 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err375];
}
else {
vErrors.push(err375);
}
errors++;
}
validate27.errors = vErrors;
return errors === 0;
}
validate27.evaluated = {"props":{"id":true,"title":true,"parentId":true,"code":true,"nativePlan":true,"executionBackend":true,"parameters":true,"expected_outputs":true,"inputs":true,"when":true,"prerequisites":true,"documentation":true,"justification":true},"dynamicProps":false,"dynamicItems":false};


function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.execution === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "execution"},message:"must have required property '"+"execution"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.classificationSpec === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "classificationSpec"},message:"must have required property '"+"classificationSpec"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.operatorGraph === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "operatorGraph"},message:"must have required property '"+"operatorGraph"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.metricBindings === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "metricBindings"},message:"must have required property '"+"metricBindings"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.version !== undefined){
let data1 = data.version;
if((!(typeof data1 == "number")) && (typeof data1 !== "string")){
const err7 = {instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: schema31.properties.version.type},message:"must be number,string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.execution !== undefined){
let data2 = data.execution;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.unit === undefined){
const err8 = {instancePath:instancePath+"/execution",schemaPath:"#/properties/execution/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data2.inputSlots === undefined){
const err9 = {instancePath:instancePath+"/execution",schemaPath:"#/properties/execution/required",keyword:"required",params:{missingProperty: "inputSlots"},message:"must have required property '"+"inputSlots"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data2.unit !== undefined){
if("workpiece" !== data2.unit){
const err10 = {instancePath:instancePath+"/execution/unit",schemaPath:"#/properties/execution/properties/unit/const",keyword:"const",params:{allowedValue: "workpiece"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data2.dataContracts !== undefined){
let data4 = data2.dataContracts;
if(!((data4 === "required") || (data4 === "legacy"))){
const err11 = {instancePath:instancePath+"/execution/dataContracts",schemaPath:"#/properties/execution/properties/dataContracts/enum",keyword:"enum",params:{allowedValues: schema31.properties.execution.properties.dataContracts.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data2.timingRequirement !== undefined){
let data5 = data2.timingRequirement;
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
if(data5.maxUnitMs === undefined){
const err12 = {instancePath:instancePath+"/execution/timingRequirement",schemaPath:"#/properties/execution/properties/timingRequirement/required",keyword:"required",params:{missingProperty: "maxUnitMs"},message:"must have required property '"+"maxUnitMs"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data5.provenance === undefined){
const err13 = {instancePath:instancePath+"/execution/timingRequirement",schemaPath:"#/properties/execution/properties/timingRequirement/required",keyword:"required",params:{missingProperty: "provenance"},message:"must have required property '"+"provenance"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data5.maxUnitMs !== undefined){
let data6 = data5.maxUnitMs;
if(typeof data6 == "number"){
if(data6 <= 0 || isNaN(data6)){
const err14 = {instancePath:instancePath+"/execution/timingRequirement/maxUnitMs",schemaPath:"#/properties/execution/properties/timingRequirement/properties/maxUnitMs/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/execution/timingRequirement/maxUnitMs",schemaPath:"#/properties/execution/properties/timingRequirement/properties/maxUnitMs/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data5.provenance !== undefined){
let data7 = data5.provenance;
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
if(data7.type === undefined){
const err16 = {instancePath:instancePath+"/execution/timingRequirement/provenance",schemaPath:"#/$defs/provenance/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data7.ref === undefined){
const err17 = {instancePath:instancePath+"/execution/timingRequirement/provenance",schemaPath:"#/$defs/provenance/required",keyword:"required",params:{missingProperty: "ref"},message:"must have required property '"+"ref"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data7.status === undefined){
const err18 = {instancePath:instancePath+"/execution/timingRequirement/provenance",schemaPath:"#/$defs/provenance/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(data7.type !== undefined){
let data8 = data7.type;
if(!(((data8 === "human") || (data8 === "document")) || (data8 === "agent-inference"))){
const err19 = {instancePath:instancePath+"/execution/timingRequirement/provenance/type",schemaPath:"#/$defs/provenance/properties/type/enum",keyword:"enum",params:{allowedValues: schema32.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data7.ref !== undefined){
let data9 = data7.ref;
if(typeof data9 === "string"){
if(func1(data9) < 1){
const err20 = {instancePath:instancePath+"/execution/timingRequirement/provenance/ref",schemaPath:"#/$defs/provenance/properties/ref/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/execution/timingRequirement/provenance/ref",schemaPath:"#/$defs/provenance/properties/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data7.status !== undefined){
let data10 = data7.status;
if(!((data10 === "confirmed") || (data10 === "inferred"))){
const err22 = {instancePath:instancePath+"/execution/timingRequirement/provenance/status",schemaPath:"#/$defs/provenance/properties/status/enum",keyword:"enum",params:{allowedValues: schema32.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data7.authorization !== undefined){
let data11 = data7.authorization;
if(typeof data11 === "string"){
if(func1(data11) < 1){
const err23 = {instancePath:instancePath+"/execution/timingRequirement/provenance/authorization",schemaPath:"#/$defs/provenance/properties/authorization/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/execution/timingRequirement/provenance/authorization",schemaPath:"#/$defs/provenance/properties/authorization/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath:instancePath+"/execution/timingRequirement/provenance",schemaPath:"#/$defs/provenance/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath:instancePath+"/execution/timingRequirement",schemaPath:"#/properties/execution/properties/timingRequirement/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data2.referenceInputs !== undefined){
let data12 = data2.referenceInputs;
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
for(const key0 in data12){
let data13 = data12[key0];
if(typeof data13 === "string"){
if(func1(data13) < 1){
const err27 = {instancePath:instancePath+"/execution/referenceInputs/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/execution/properties/referenceInputs/additionalProperties/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/execution/referenceInputs/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/execution/properties/referenceInputs/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
}
else {
const err29 = {instancePath:instancePath+"/execution/referenceInputs",schemaPath:"#/properties/execution/properties/referenceInputs/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data2.inputSlots !== undefined){
let data14 = data2.inputSlots;
if(Array.isArray(data14)){
if(data14.length < 1){
const err30 = {instancePath:instancePath+"/execution/inputSlots",schemaPath:"#/properties/execution/properties/inputSlots/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
const len0 = data14.length;
for(let i0=0; i0<len0; i0++){
let data15 = data14[i0];
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
if(data15.id === undefined){
const err31 = {instancePath:instancePath+"/execution/inputSlots/" + i0,schemaPath:"#/properties/execution/properties/inputSlots/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(data15.required === undefined){
const err32 = {instancePath:instancePath+"/execution/inputSlots/" + i0,schemaPath:"#/properties/execution/properties/inputSlots/items/required",keyword:"required",params:{missingProperty: "required"},message:"must have required property '"+"required"+"'"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(data15.id !== undefined){
let data16 = data15.id;
if(typeof data16 === "string"){
if(func1(data16) < 1){
const err33 = {instancePath:instancePath+"/execution/inputSlots/" + i0+"/id",schemaPath:"#/properties/execution/properties/inputSlots/items/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
else {
const err34 = {instancePath:instancePath+"/execution/inputSlots/" + i0+"/id",schemaPath:"#/properties/execution/properties/inputSlots/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data15.required !== undefined){
if(typeof data15.required !== "boolean"){
const err35 = {instancePath:instancePath+"/execution/inputSlots/" + i0+"/required",schemaPath:"#/properties/execution/properties/inputSlots/items/properties/required/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
}
else {
const err36 = {instancePath:instancePath+"/execution/inputSlots/" + i0,schemaPath:"#/properties/execution/properties/inputSlots/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath:instancePath+"/execution/inputSlots",schemaPath:"#/properties/execution/properties/inputSlots/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
}
else {
const err38 = {instancePath:instancePath+"/execution",schemaPath:"#/properties/execution/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.classificationSpec !== undefined){
if(!(validate21(data.classificationSpec, {instancePath:instancePath+"/classificationSpec",parentData:data,parentDataProperty:"classificationSpec",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
}
if(data.operatorGraph !== undefined){
let data19 = data.operatorGraph;
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
if(data19.nodes === undefined){
const err39 = {instancePath:instancePath+"/operatorGraph",schemaPath:"#/properties/operatorGraph/required",keyword:"required",params:{missingProperty: "nodes"},message:"must have required property '"+"nodes"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if(data19.edges === undefined){
const err40 = {instancePath:instancePath+"/operatorGraph",schemaPath:"#/properties/operatorGraph/required",keyword:"required",params:{missingProperty: "edges"},message:"must have required property '"+"edges"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if(data19.nodes !== undefined){
let data20 = data19.nodes;
if(Array.isArray(data20)){
if(data20.length < 1){
const err41 = {instancePath:instancePath+"/operatorGraph/nodes",schemaPath:"#/properties/operatorGraph/properties/nodes/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
const len1 = data20.length;
for(let i1=0; i1<len1; i1++){
if(!(validate27(data20[i1], {instancePath:instancePath+"/operatorGraph/nodes/" + i1,parentData:data20,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
errors = vErrors.length;
}
}
}
else {
const err42 = {instancePath:instancePath+"/operatorGraph/nodes",schemaPath:"#/properties/operatorGraph/properties/nodes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data19.edges !== undefined){
let data22 = data19.edges;
if(Array.isArray(data22)){
const len2 = data22.length;
for(let i2=0; i2<len2; i2++){
let data23 = data22[i2];
if(data23 && typeof data23 == "object" && !Array.isArray(data23)){
if(data23.from === undefined){
const err43 = {instancePath:instancePath+"/operatorGraph/edges/" + i2,schemaPath:"#/properties/operatorGraph/properties/edges/items/required",keyword:"required",params:{missingProperty: "from"},message:"must have required property '"+"from"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(data23.to === undefined){
const err44 = {instancePath:instancePath+"/operatorGraph/edges/" + i2,schemaPath:"#/properties/operatorGraph/properties/edges/items/required",keyword:"required",params:{missingProperty: "to"},message:"must have required property '"+"to"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(data23.from !== undefined){
let data24 = data23.from;
if(typeof data24 === "string"){
if(func1(data24) < 1){
const err45 = {instancePath:instancePath+"/operatorGraph/edges/" + i2+"/from",schemaPath:"#/properties/operatorGraph/properties/edges/items/properties/from/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
else {
const err46 = {instancePath:instancePath+"/operatorGraph/edges/" + i2+"/from",schemaPath:"#/properties/operatorGraph/properties/edges/items/properties/from/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data23.to !== undefined){
let data25 = data23.to;
if(typeof data25 === "string"){
if(func1(data25) < 1){
const err47 = {instancePath:instancePath+"/operatorGraph/edges/" + i2+"/to",schemaPath:"#/properties/operatorGraph/properties/edges/items/properties/to/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
else {
const err48 = {instancePath:instancePath+"/operatorGraph/edges/" + i2+"/to",schemaPath:"#/properties/operatorGraph/properties/edges/items/properties/to/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
}
else {
const err49 = {instancePath:instancePath+"/operatorGraph/edges/" + i2,schemaPath:"#/properties/operatorGraph/properties/edges/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
}
else {
const err50 = {instancePath:instancePath+"/operatorGraph/edges",schemaPath:"#/properties/operatorGraph/properties/edges/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
}
else {
const err51 = {instancePath:instancePath+"/operatorGraph",schemaPath:"#/properties/operatorGraph/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data.metricBindings !== undefined){
let data26 = data.metricBindings;
if(Array.isArray(data26)){
const len3 = data26.length;
for(let i3=0; i3<len3; i3++){
let data27 = data26[i3];
if(data27 && typeof data27 == "object" && !Array.isArray(data27)){
if(data27.metric === undefined){
const err52 = {instancePath:instancePath+"/metricBindings/" + i3,schemaPath:"#/properties/metricBindings/items/required",keyword:"required",params:{missingProperty: "metric"},message:"must have required property '"+"metric"+"'"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if(data27.nodeId === undefined){
const err53 = {instancePath:instancePath+"/metricBindings/" + i3,schemaPath:"#/properties/metricBindings/items/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if(data27.path === undefined){
const err54 = {instancePath:instancePath+"/metricBindings/" + i3,schemaPath:"#/properties/metricBindings/items/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(data27.metric !== undefined){
let data28 = data27.metric;
if(typeof data28 === "string"){
if(func1(data28) < 1){
const err55 = {instancePath:instancePath+"/metricBindings/" + i3+"/metric",schemaPath:"#/properties/metricBindings/items/properties/metric/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
else {
const err56 = {instancePath:instancePath+"/metricBindings/" + i3+"/metric",schemaPath:"#/properties/metricBindings/items/properties/metric/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data27.nodeId !== undefined){
let data29 = data27.nodeId;
if(typeof data29 === "string"){
if(func1(data29) < 1){
const err57 = {instancePath:instancePath+"/metricBindings/" + i3+"/nodeId",schemaPath:"#/properties/metricBindings/items/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
else {
const err58 = {instancePath:instancePath+"/metricBindings/" + i3+"/nodeId",schemaPath:"#/properties/metricBindings/items/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
if(data27.path !== undefined){
let data30 = data27.path;
if(typeof data30 === "string"){
if(func1(data30) < 1){
const err59 = {instancePath:instancePath+"/metricBindings/" + i3+"/path",schemaPath:"#/properties/metricBindings/items/properties/path/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
else {
const err60 = {instancePath:instancePath+"/metricBindings/" + i3+"/path",schemaPath:"#/properties/metricBindings/items/properties/path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
}
else {
const err61 = {instancePath:instancePath+"/metricBindings/" + i3,schemaPath:"#/properties/metricBindings/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
}
else {
const err62 = {instancePath:instancePath+"/metricBindings",schemaPath:"#/properties/metricBindings/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
}
else {
const err63 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"props":{"id":true,"version":true,"execution":true,"classificationSpec":true,"operatorGraph":true,"metricBindings":true},"dynamicProps":false,"dynamicItems":false};

