// Generated from data-contract-schema.js; do not edit. No runtime eval.
import helper0Module from "ajv/dist/runtime/ucs2length.js"; const helper0 = helper0Module.default || helper0Module;
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {"title":"AgentCV node data contract","description":"Explicit port meaning. Exact kind, frame and units must agree across an edge; no implicit conversion. Geometry JSON repeats coordinates; measurements contain value/unit; homography contains matrix/from/to. Contracts do not prove algorithm accuracy.","anyOf":[{"type":"object","properties":{"kind":{"enum":["image","mask"]},"coordinates":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","coordinates"],"additionalProperties":false},{"type":"object","properties":{"kind":{"enum":["points","contours","roi"]},"coordinates":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","coordinates"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"homography"},"from":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false},"to":{"type":"object","properties":{"frame":{"anyOf":[{"type":"object","properties":{"kind":{"const":"input"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"reference"},"slot":{"type":"string","minLength":1}},"required":["kind","slot"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"artifact"},"nodeId":{"type":"string","minLength":1},"artifactId":{"type":"string","minLength":1}},"required":["kind","nodeId","artifactId"],"additionalProperties":false}]},"unit":{"enum":["px","mm","m"]}},"required":["frame","unit"],"additionalProperties":false}},"required":["kind","from","to"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"measurement"},"unit":{"type":"string","minLength":1}},"required":["kind","unit"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"classification"},"categories":{"type":"array","items":{"type":"string","minLength":1},"minItems":1,"uniqueItems":true}},"required":["kind","categories"],"additionalProperties":false},{"type":"object","properties":{"kind":{"enum":["json","file"]}},"required":["kind"],"additionalProperties":false}]};
const func1 = helper0;

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
const _errs0 = errors;
let valid0 = false;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.coordinates === undefined){
const err1 = {instancePath,schemaPath:"#/anyOf/0/required",keyword:"required",params:{missingProperty: "coordinates"},message:"must have required property '"+"coordinates"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "coordinates"))){
const err2 = {instancePath,schemaPath:"#/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(!((data0 === "image") || (data0 === "mask"))){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/anyOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema31.anyOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.coordinates !== undefined){
let data1 = data.coordinates;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.frame === undefined){
const err4 = {instancePath:instancePath+"/coordinates",schemaPath:"#/anyOf/0/properties/coordinates/required",keyword:"required",params:{missingProperty: "frame"},message:"must have required property '"+"frame"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.unit === undefined){
const err5 = {instancePath:instancePath+"/coordinates",schemaPath:"#/anyOf/0/properties/coordinates/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 in data1){
if(!((key1 === "frame") || (key1 === "unit"))){
const err6 = {instancePath:instancePath+"/coordinates",schemaPath:"#/anyOf/0/properties/coordinates/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data1.frame !== undefined){
let data2 = data1.frame;
const _errs9 = errors;
let valid3 = false;
const _errs10 = errors;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.kind === undefined){
const err7 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data2.slot === undefined){
const err8 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key2 in data2){
if(!((key2 === "kind") || (key2 === "slot"))){
const err9 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data2.kind !== undefined){
if("input" !== data2.kind){
const err10 = {instancePath:instancePath+"/coordinates/frame/kind",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "input"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data2.slot !== undefined){
let data4 = data2.slot;
if(typeof data4 === "string"){
if(func1(data4) < 1){
const err11 = {instancePath:instancePath+"/coordinates/frame/slot",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/0/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/coordinates/frame/slot",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/0/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var _valid1 = _errs10 === errors;
valid3 = valid3 || _valid1;
if(_valid1){
var props0 = true;
}
const _errs16 = errors;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.kind === undefined){
const err14 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data2.slot === undefined){
const err15 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key3 in data2){
if(!((key3 === "kind") || (key3 === "slot"))){
const err16 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data2.kind !== undefined){
if("reference" !== data2.kind){
const err17 = {instancePath:instancePath+"/coordinates/frame/kind",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "reference"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data2.slot !== undefined){
let data6 = data2.slot;
if(typeof data6 === "string"){
if(func1(data6) < 1){
const err18 = {instancePath:instancePath+"/coordinates/frame/slot",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/1/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err19 = {instancePath:instancePath+"/coordinates/frame/slot",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/1/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
}
else {
const err20 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid1 = _errs16 === errors;
valid3 = valid3 || _valid1;
if(_valid1){
if(props0 !== true){
props0 = true;
}
}
const _errs22 = errors;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.kind === undefined){
const err21 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data2.nodeId === undefined){
const err22 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data2.artifactId === undefined){
const err23 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
for(const key4 in data2){
if(!(((key4 === "kind") || (key4 === "nodeId")) || (key4 === "artifactId"))){
const err24 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data2.kind !== undefined){
if("artifact" !== data2.kind){
const err25 = {instancePath:instancePath+"/coordinates/frame/kind",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "artifact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data2.nodeId !== undefined){
let data8 = data2.nodeId;
if(typeof data8 === "string"){
if(func1(data8) < 1){
const err26 = {instancePath:instancePath+"/coordinates/frame/nodeId",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/coordinates/frame/nodeId",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data2.artifactId !== undefined){
let data9 = data2.artifactId;
if(typeof data9 === "string"){
if(func1(data9) < 1){
const err28 = {instancePath:instancePath+"/coordinates/frame/artifactId",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
else {
const err29 = {instancePath:instancePath+"/coordinates/frame/artifactId",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/2/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err30 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var _valid1 = _errs22 === errors;
valid3 = valid3 || _valid1;
if(_valid1){
if(props0 !== true){
props0 = true;
}
}
if(!valid3){
const err31 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/0/properties/coordinates/properties/frame/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
else {
errors = _errs9;
if(vErrors !== null){
if(_errs9){
vErrors.length = _errs9;
}
else {
vErrors = null;
}
}
}
}
if(data1.unit !== undefined){
let data10 = data1.unit;
if(!(((data10 === "px") || (data10 === "mm")) || (data10 === "m"))){
const err32 = {instancePath:instancePath+"/coordinates/unit",schemaPath:"#/anyOf/0/properties/coordinates/properties/unit/enum",keyword:"enum",params:{allowedValues: schema31.anyOf[0].properties.coordinates.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
}
else {
const err33 = {instancePath:instancePath+"/coordinates",schemaPath:"#/anyOf/0/properties/coordinates/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
}
else {
const err34 = {instancePath,schemaPath:"#/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
var _valid0 = _errs1 === errors;
valid0 = valid0 || _valid0;
if(_valid0){
var props1 = true;
}
const _errs31 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err35 = {instancePath,schemaPath:"#/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(data.coordinates === undefined){
const err36 = {instancePath,schemaPath:"#/anyOf/1/required",keyword:"required",params:{missingProperty: "coordinates"},message:"must have required property '"+"coordinates"+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
for(const key5 in data){
if(!((key5 === "kind") || (key5 === "coordinates"))){
const err37 = {instancePath,schemaPath:"#/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.kind !== undefined){
let data11 = data.kind;
if(!(((data11 === "points") || (data11 === "contours")) || (data11 === "roi"))){
const err38 = {instancePath:instancePath+"/kind",schemaPath:"#/anyOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema31.anyOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.coordinates !== undefined){
let data12 = data.coordinates;
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
if(data12.frame === undefined){
const err39 = {instancePath:instancePath+"/coordinates",schemaPath:"#/anyOf/1/properties/coordinates/required",keyword:"required",params:{missingProperty: "frame"},message:"must have required property '"+"frame"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if(data12.unit === undefined){
const err40 = {instancePath:instancePath+"/coordinates",schemaPath:"#/anyOf/1/properties/coordinates/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
for(const key6 in data12){
if(!((key6 === "frame") || (key6 === "unit"))){
const err41 = {instancePath:instancePath+"/coordinates",schemaPath:"#/anyOf/1/properties/coordinates/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data12.frame !== undefined){
let data13 = data12.frame;
const _errs39 = errors;
let valid9 = false;
const _errs40 = errors;
if(data13 && typeof data13 == "object" && !Array.isArray(data13)){
if(data13.kind === undefined){
const err42 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(data13.slot === undefined){
const err43 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
for(const key7 in data13){
if(!((key7 === "kind") || (key7 === "slot"))){
const err44 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data13.kind !== undefined){
if("input" !== data13.kind){
const err45 = {instancePath:instancePath+"/coordinates/frame/kind",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "input"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data13.slot !== undefined){
let data15 = data13.slot;
if(typeof data15 === "string"){
if(func1(data15) < 1){
const err46 = {instancePath:instancePath+"/coordinates/frame/slot",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/0/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err47 = {instancePath:instancePath+"/coordinates/frame/slot",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/0/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err48 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
var _valid2 = _errs40 === errors;
valid9 = valid9 || _valid2;
if(_valid2){
var props2 = true;
}
const _errs46 = errors;
if(data13 && typeof data13 == "object" && !Array.isArray(data13)){
if(data13.kind === undefined){
const err49 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if(data13.slot === undefined){
const err50 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
for(const key8 in data13){
if(!((key8 === "kind") || (key8 === "slot"))){
const err51 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data13.kind !== undefined){
if("reference" !== data13.kind){
const err52 = {instancePath:instancePath+"/coordinates/frame/kind",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "reference"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data13.slot !== undefined){
let data17 = data13.slot;
if(typeof data17 === "string"){
if(func1(data17) < 1){
const err53 = {instancePath:instancePath+"/coordinates/frame/slot",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/1/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err54 = {instancePath:instancePath+"/coordinates/frame/slot",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/1/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err55 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var _valid2 = _errs46 === errors;
valid9 = valid9 || _valid2;
if(_valid2){
if(props2 !== true){
props2 = true;
}
}
const _errs52 = errors;
if(data13 && typeof data13 == "object" && !Array.isArray(data13)){
if(data13.kind === undefined){
const err56 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(data13.nodeId === undefined){
const err57 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(data13.artifactId === undefined){
const err58 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
for(const key9 in data13){
if(!(((key9 === "kind") || (key9 === "nodeId")) || (key9 === "artifactId"))){
const err59 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data13.kind !== undefined){
if("artifact" !== data13.kind){
const err60 = {instancePath:instancePath+"/coordinates/frame/kind",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "artifact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data13.nodeId !== undefined){
let data19 = data13.nodeId;
if(typeof data19 === "string"){
if(func1(data19) < 1){
const err61 = {instancePath:instancePath+"/coordinates/frame/nodeId",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err62 = {instancePath:instancePath+"/coordinates/frame/nodeId",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
if(data13.artifactId !== undefined){
let data20 = data13.artifactId;
if(typeof data20 === "string"){
if(func1(data20) < 1){
const err63 = {instancePath:instancePath+"/coordinates/frame/artifactId",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err64 = {instancePath:instancePath+"/coordinates/frame/artifactId",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/2/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err65 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
var _valid2 = _errs52 === errors;
valid9 = valid9 || _valid2;
if(_valid2){
if(props2 !== true){
props2 = true;
}
}
if(!valid9){
const err66 = {instancePath:instancePath+"/coordinates/frame",schemaPath:"#/anyOf/1/properties/coordinates/properties/frame/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
else {
errors = _errs39;
if(vErrors !== null){
if(_errs39){
vErrors.length = _errs39;
}
else {
vErrors = null;
}
}
}
}
if(data12.unit !== undefined){
let data21 = data12.unit;
if(!(((data21 === "px") || (data21 === "mm")) || (data21 === "m"))){
const err67 = {instancePath:instancePath+"/coordinates/unit",schemaPath:"#/anyOf/1/properties/coordinates/properties/unit/enum",keyword:"enum",params:{allowedValues: schema31.anyOf[1].properties.coordinates.properties.unit.enum},message:"must be equal to one of the allowed values"};
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
const err68 = {instancePath:instancePath+"/coordinates",schemaPath:"#/anyOf/1/properties/coordinates/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err69 = {instancePath,schemaPath:"#/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var _valid0 = _errs31 === errors;
valid0 = valid0 || _valid0;
if(_valid0){
if(props1 !== true){
props1 = true;
}
}
const _errs61 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err70 = {instancePath,schemaPath:"#/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(data.from === undefined){
const err71 = {instancePath,schemaPath:"#/anyOf/2/required",keyword:"required",params:{missingProperty: "from"},message:"must have required property '"+"from"+"'"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if(data.to === undefined){
const err72 = {instancePath,schemaPath:"#/anyOf/2/required",keyword:"required",params:{missingProperty: "to"},message:"must have required property '"+"to"+"'"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
for(const key10 in data){
if(!(((key10 === "kind") || (key10 === "from")) || (key10 === "to"))){
const err73 = {instancePath,schemaPath:"#/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data.kind !== undefined){
if("homography" !== data.kind){
const err74 = {instancePath:instancePath+"/kind",schemaPath:"#/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "homography"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data.from !== undefined){
let data23 = data.from;
if(data23 && typeof data23 == "object" && !Array.isArray(data23)){
if(data23.frame === undefined){
const err75 = {instancePath:instancePath+"/from",schemaPath:"#/anyOf/2/properties/from/required",keyword:"required",params:{missingProperty: "frame"},message:"must have required property '"+"frame"+"'"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if(data23.unit === undefined){
const err76 = {instancePath:instancePath+"/from",schemaPath:"#/anyOf/2/properties/from/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
for(const key11 in data23){
if(!((key11 === "frame") || (key11 === "unit"))){
const err77 = {instancePath:instancePath+"/from",schemaPath:"#/anyOf/2/properties/from/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
if(data23.frame !== undefined){
let data24 = data23.frame;
const _errs69 = errors;
let valid15 = false;
const _errs70 = errors;
if(data24 && typeof data24 == "object" && !Array.isArray(data24)){
if(data24.kind === undefined){
const err78 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
if(data24.slot === undefined){
const err79 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
for(const key12 in data24){
if(!((key12 === "kind") || (key12 === "slot"))){
const err80 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
if(data24.kind !== undefined){
if("input" !== data24.kind){
const err81 = {instancePath:instancePath+"/from/frame/kind",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "input"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
if(data24.slot !== undefined){
let data26 = data24.slot;
if(typeof data26 === "string"){
if(func1(data26) < 1){
const err82 = {instancePath:instancePath+"/from/frame/slot",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/0/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
else {
const err83 = {instancePath:instancePath+"/from/frame/slot",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/0/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
}
else {
const err84 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
var _valid3 = _errs70 === errors;
valid15 = valid15 || _valid3;
if(_valid3){
var props3 = true;
}
const _errs76 = errors;
if(data24 && typeof data24 == "object" && !Array.isArray(data24)){
if(data24.kind === undefined){
const err85 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
if(data24.slot === undefined){
const err86 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
for(const key13 in data24){
if(!((key13 === "kind") || (key13 === "slot"))){
const err87 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
if(data24.kind !== undefined){
if("reference" !== data24.kind){
const err88 = {instancePath:instancePath+"/from/frame/kind",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "reference"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
}
if(data24.slot !== undefined){
let data28 = data24.slot;
if(typeof data28 === "string"){
if(func1(data28) < 1){
const err89 = {instancePath:instancePath+"/from/frame/slot",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/1/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
else {
const err90 = {instancePath:instancePath+"/from/frame/slot",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/1/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
}
else {
const err91 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
var _valid3 = _errs76 === errors;
valid15 = valid15 || _valid3;
if(_valid3){
if(props3 !== true){
props3 = true;
}
}
const _errs82 = errors;
if(data24 && typeof data24 == "object" && !Array.isArray(data24)){
if(data24.kind === undefined){
const err92 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
if(data24.nodeId === undefined){
const err93 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
if(data24.artifactId === undefined){
const err94 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
for(const key14 in data24){
if(!(((key14 === "kind") || (key14 === "nodeId")) || (key14 === "artifactId"))){
const err95 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
}
if(data24.kind !== undefined){
if("artifact" !== data24.kind){
const err96 = {instancePath:instancePath+"/from/frame/kind",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "artifact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
if(data24.nodeId !== undefined){
let data30 = data24.nodeId;
if(typeof data30 === "string"){
if(func1(data30) < 1){
const err97 = {instancePath:instancePath+"/from/frame/nodeId",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/2/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
else {
const err98 = {instancePath:instancePath+"/from/frame/nodeId",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/2/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
if(data24.artifactId !== undefined){
let data31 = data24.artifactId;
if(typeof data31 === "string"){
if(func1(data31) < 1){
const err99 = {instancePath:instancePath+"/from/frame/artifactId",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/2/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
else {
const err100 = {instancePath:instancePath+"/from/frame/artifactId",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/2/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
}
}
else {
const err101 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
var _valid3 = _errs82 === errors;
valid15 = valid15 || _valid3;
if(_valid3){
if(props3 !== true){
props3 = true;
}
}
if(!valid15){
const err102 = {instancePath:instancePath+"/from/frame",schemaPath:"#/anyOf/2/properties/from/properties/frame/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
else {
errors = _errs69;
if(vErrors !== null){
if(_errs69){
vErrors.length = _errs69;
}
else {
vErrors = null;
}
}
}
}
if(data23.unit !== undefined){
let data32 = data23.unit;
if(!(((data32 === "px") || (data32 === "mm")) || (data32 === "m"))){
const err103 = {instancePath:instancePath+"/from/unit",schemaPath:"#/anyOf/2/properties/from/properties/unit/enum",keyword:"enum",params:{allowedValues: schema31.anyOf[2].properties.from.properties.unit.enum},message:"must be equal to one of the allowed values"};
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
const err104 = {instancePath:instancePath+"/from",schemaPath:"#/anyOf/2/properties/from/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
}
if(data.to !== undefined){
let data33 = data.to;
if(data33 && typeof data33 == "object" && !Array.isArray(data33)){
if(data33.frame === undefined){
const err105 = {instancePath:instancePath+"/to",schemaPath:"#/anyOf/2/properties/to/required",keyword:"required",params:{missingProperty: "frame"},message:"must have required property '"+"frame"+"'"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
if(data33.unit === undefined){
const err106 = {instancePath:instancePath+"/to",schemaPath:"#/anyOf/2/properties/to/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
for(const key15 in data33){
if(!((key15 === "frame") || (key15 === "unit"))){
const err107 = {instancePath:instancePath+"/to",schemaPath:"#/anyOf/2/properties/to/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
}
if(data33.frame !== undefined){
let data34 = data33.frame;
const _errs95 = errors;
let valid20 = false;
const _errs96 = errors;
if(data34 && typeof data34 == "object" && !Array.isArray(data34)){
if(data34.kind === undefined){
const err108 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
if(data34.slot === undefined){
const err109 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/0/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
for(const key16 in data34){
if(!((key16 === "kind") || (key16 === "slot"))){
const err110 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
}
if(data34.kind !== undefined){
if("input" !== data34.kind){
const err111 = {instancePath:instancePath+"/to/frame/kind",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "input"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
}
if(data34.slot !== undefined){
let data36 = data34.slot;
if(typeof data36 === "string"){
if(func1(data36) < 1){
const err112 = {instancePath:instancePath+"/to/frame/slot",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/0/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
}
else {
const err113 = {instancePath:instancePath+"/to/frame/slot",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/0/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
}
}
else {
const err114 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
var _valid4 = _errs96 === errors;
valid20 = valid20 || _valid4;
if(_valid4){
var props4 = true;
}
const _errs102 = errors;
if(data34 && typeof data34 == "object" && !Array.isArray(data34)){
if(data34.kind === undefined){
const err115 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
if(data34.slot === undefined){
const err116 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/1/required",keyword:"required",params:{missingProperty: "slot"},message:"must have required property '"+"slot"+"'"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
for(const key17 in data34){
if(!((key17 === "kind") || (key17 === "slot"))){
const err117 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key17},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
}
if(data34.kind !== undefined){
if("reference" !== data34.kind){
const err118 = {instancePath:instancePath+"/to/frame/kind",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "reference"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
}
if(data34.slot !== undefined){
let data38 = data34.slot;
if(typeof data38 === "string"){
if(func1(data38) < 1){
const err119 = {instancePath:instancePath+"/to/frame/slot",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/1/properties/slot/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
}
else {
const err120 = {instancePath:instancePath+"/to/frame/slot",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/1/properties/slot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
}
}
else {
const err121 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
var _valid4 = _errs102 === errors;
valid20 = valid20 || _valid4;
if(_valid4){
if(props4 !== true){
props4 = true;
}
}
const _errs108 = errors;
if(data34 && typeof data34 == "object" && !Array.isArray(data34)){
if(data34.kind === undefined){
const err122 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
if(data34.nodeId === undefined){
const err123 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
if(data34.artifactId === undefined){
const err124 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/2/required",keyword:"required",params:{missingProperty: "artifactId"},message:"must have required property '"+"artifactId"+"'"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
for(const key18 in data34){
if(!(((key18 === "kind") || (key18 === "nodeId")) || (key18 === "artifactId"))){
const err125 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key18},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
}
if(data34.kind !== undefined){
if("artifact" !== data34.kind){
const err126 = {instancePath:instancePath+"/to/frame/kind",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "artifact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
if(data34.nodeId !== undefined){
let data40 = data34.nodeId;
if(typeof data40 === "string"){
if(func1(data40) < 1){
const err127 = {instancePath:instancePath+"/to/frame/nodeId",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/2/properties/nodeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
else {
const err128 = {instancePath:instancePath+"/to/frame/nodeId",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/2/properties/nodeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
}
if(data34.artifactId !== undefined){
let data41 = data34.artifactId;
if(typeof data41 === "string"){
if(func1(data41) < 1){
const err129 = {instancePath:instancePath+"/to/frame/artifactId",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/2/properties/artifactId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
}
else {
const err130 = {instancePath:instancePath+"/to/frame/artifactId",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/2/properties/artifactId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
}
}
else {
const err131 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
var _valid4 = _errs108 === errors;
valid20 = valid20 || _valid4;
if(_valid4){
if(props4 !== true){
props4 = true;
}
}
if(!valid20){
const err132 = {instancePath:instancePath+"/to/frame",schemaPath:"#/anyOf/2/properties/to/properties/frame/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
else {
errors = _errs95;
if(vErrors !== null){
if(_errs95){
vErrors.length = _errs95;
}
else {
vErrors = null;
}
}
}
}
if(data33.unit !== undefined){
let data42 = data33.unit;
if(!(((data42 === "px") || (data42 === "mm")) || (data42 === "m"))){
const err133 = {instancePath:instancePath+"/to/unit",schemaPath:"#/anyOf/2/properties/to/properties/unit/enum",keyword:"enum",params:{allowedValues: schema31.anyOf[2].properties.to.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
}
}
else {
const err134 = {instancePath:instancePath+"/to",schemaPath:"#/anyOf/2/properties/to/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
}
}
else {
const err135 = {instancePath,schemaPath:"#/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
var _valid0 = _errs61 === errors;
valid0 = valid0 || _valid0;
if(_valid0){
if(props1 !== true){
props1 = true;
}
}
const _errs117 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err136 = {instancePath,schemaPath:"#/anyOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
if(data.unit === undefined){
const err137 = {instancePath,schemaPath:"#/anyOf/3/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
for(const key19 in data){
if(!((key19 === "kind") || (key19 === "unit"))){
const err138 = {instancePath,schemaPath:"#/anyOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
}
if(data.kind !== undefined){
if("measurement" !== data.kind){
const err139 = {instancePath:instancePath+"/kind",schemaPath:"#/anyOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "measurement"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
}
if(data.unit !== undefined){
let data44 = data.unit;
if(typeof data44 === "string"){
if(func1(data44) < 1){
const err140 = {instancePath:instancePath+"/unit",schemaPath:"#/anyOf/3/properties/unit/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
}
else {
const err141 = {instancePath:instancePath+"/unit",schemaPath:"#/anyOf/3/properties/unit/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
}
}
else {
const err142 = {instancePath,schemaPath:"#/anyOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
var _valid0 = _errs117 === errors;
valid0 = valid0 || _valid0;
if(_valid0){
if(props1 !== true){
props1 = true;
}
}
const _errs123 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err143 = {instancePath,schemaPath:"#/anyOf/4/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
if(data.categories === undefined){
const err144 = {instancePath,schemaPath:"#/anyOf/4/required",keyword:"required",params:{missingProperty: "categories"},message:"must have required property '"+"categories"+"'"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
for(const key20 in data){
if(!((key20 === "kind") || (key20 === "categories"))){
const err145 = {instancePath,schemaPath:"#/anyOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
}
if(data.kind !== undefined){
if("classification" !== data.kind){
const err146 = {instancePath:instancePath+"/kind",schemaPath:"#/anyOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "classification"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
}
if(data.categories !== undefined){
let data46 = data.categories;
if(Array.isArray(data46)){
if(data46.length < 1){
const err147 = {instancePath:instancePath+"/categories",schemaPath:"#/anyOf/4/properties/categories/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
const len0 = data46.length;
for(let i0=0; i0<len0; i0++){
let data47 = data46[i0];
if(typeof data47 === "string"){
if(func1(data47) < 1){
const err148 = {instancePath:instancePath+"/categories/" + i0,schemaPath:"#/anyOf/4/properties/categories/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
}
else {
const err149 = {instancePath:instancePath+"/categories/" + i0,schemaPath:"#/anyOf/4/properties/categories/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
}
let i1 = data46.length;
let j0;
if(i1 > 1){
const indices0 = {};
for(;i1--;){
let item0 = data46[i1];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err150 = {instancePath:instancePath+"/categories",schemaPath:"#/anyOf/4/properties/categories/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
break;
}
indices0[item0] = i1;
}
}
}
else {
const err151 = {instancePath:instancePath+"/categories",schemaPath:"#/anyOf/4/properties/categories/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
}
}
else {
const err152 = {instancePath,schemaPath:"#/anyOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
var _valid0 = _errs123 === errors;
valid0 = valid0 || _valid0;
if(_valid0){
if(props1 !== true){
props1 = true;
}
}
const _errs131 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err153 = {instancePath,schemaPath:"#/anyOf/5/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
for(const key21 in data){
if(!(key21 === "kind")){
const err154 = {instancePath,schemaPath:"#/anyOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
}
}
if(data.kind !== undefined){
let data48 = data.kind;
if(!((data48 === "json") || (data48 === "file"))){
const err155 = {instancePath:instancePath+"/kind",schemaPath:"#/anyOf/5/properties/kind/enum",keyword:"enum",params:{allowedValues: schema31.anyOf[5].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
const err156 = {instancePath,schemaPath:"#/anyOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
var _valid0 = _errs131 === errors;
valid0 = valid0 || _valid0;
if(_valid0){
if(props1 !== true){
props1 = true;
}
}
if(!valid0){
const err157 = {instancePath,schemaPath:"#/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
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
validate20.errors = vErrors;
evaluated0.props = props1;
return errors === 0;
}
validate20.evaluated = {"dynamicProps":true,"dynamicItems":false};

