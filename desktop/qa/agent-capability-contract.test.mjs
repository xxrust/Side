// Contract parity, real Pi SDK schema conversion, and restored tool dispatch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {agentTools,systemPrompt} from '../src/agent-contract.js';
import {Agent} from '../src/agent.js';
import {Workspace} from '../src/workspace.js';
import {createVisualAssetLibrary} from '../src/visual-asset-library.js';
import {saveVisualAsset,searchVisualAssets,getVisualAsset} from '../scripts/visual-asset-library.mjs';
const get=name=>agentTools.find(t=>t.function.name===name)?.function;
// This portable name baseline deliberately covers all 52 previously shipping
// tools and the Purpose APIs. New tools may be added; removals require review.
const baseline=`add_canvas_image_label add_part add_relation add_visual_image adopt_algorithm_output annotate_visual_board build_recipe compile_scheme connect_visual_images create_pipeline get_algorithm_capabilities get_algorithm_context get_algorithm_presentation get_algorithm_run get_canvas_artifact_groups get_canvas_project_context get_context get_edge_search_context get_inspection_capabilities get_pipeline_capabilities get_pipeline_evidence get_purpose_scheme get_purpose_scheme_capabilities get_visual_asset get_visual_context get_visual_image go_to_step group_canvas_artifacts install_algorithm_packages present_algorithm_result propose_check propose_label propose_region read_reference revise_algorithm_evidence run_algorithm run_current run_pipeline run_pipeline_batch run_purpose_scheme save_visual_asset search_visual_assets select_image set_algorithm_presentation set_canvas_artifact_group set_inspection_view set_pipeline_graph set_pipeline_view set_purpose_scheme set_target_note set_workpiece_info show_algorithm_run show_visual_asset show_visual_image suggest_foreground trial_edge_search verify_pipeline_delivery`.split(' ');
test('shipping capability baseline and generated bridge contract cannot silently lose tools',async()=>{
 const names=agentTools.map(t=>t.function.name);assert.equal(new Set(names).size,names.length);
 for(const name of baseline)assert.ok(names.includes(name),`${name} was removed from Pi's callable tools`);
 assert.deepEqual(JSON.parse(await fs.readFile(new URL('../scripts/agent-contract.json',import.meta.url),'utf8')),{tools:agentTools,systemPrompt});
 assert.ok(systemPrompt.length<=500);assert.match(systemPrompt,/skill/);assert.match(systemPrompt,/完整方案/);assert.doesNotMatch(systemPrompt,/齒輪|圓環|Halcon|image\.grayscale|shape\.gear/i);
});
test('every published tool has an actual Agent or visual-controller dispatch branch',async()=>{
 const source=(await Promise.all(['agent.js','visual-agent-controller.js','agent-workpiece-tools.js'].map(file=>fs.readFile(new URL('../src/'+file,import.meta.url),'utf8')))).join('\n');
 const dispatch=new Set([...source.matchAll(/name\s*===\s*['"]([^'"]+)['"]/g)].map(m=>m[1]));
 for(const {function:{name}} of agentTools)assert.ok(dispatch.has(name),`${name} has a schema but no current dispatch handler`);
});
async function sdkSchema(){const entry=process.env.AGENTCV_PI_ENTRY||path.join(os.homedir(),'.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js'),require=createRequire(entry),Type=(await import(pathToFileURL(require.resolve('typebox')))).Type,{Check}=await import(pathToFileURL(require.resolve('typebox/value'))),bridge=await fs.readFile(new URL('../scripts/pi-bridge.mjs',import.meta.url),'utf8'),source=bridge.slice(bridge.indexOf('function typed(s)'),bridge.search(/\n(?:let|const) profile=/));assert.ok(source.includes('return Type.Object'));const typed=Function('Type',source+';return typed')(Type);return {typed,Check};}
test('actual installed Pi schema converter accepts restored visuals/revisions and enforces current source bindings',async()=>{
 const {typed,Check}=await sdkSchema();for(const tool of agentTools)assert.ok(typed(tool.function.parameters),`Pi SDK converts ${tool.function.name}`);
 const visual={kind:'artifact',type:'image',id:'actual-output',caption:'看綠色支持點',visuals:[{id:'actual-output',caption:'此圖對應本次原圖'}]},j={tool:{reason:'本圖紋理可供對應。',expectedEvidence:[visual]},parameters:[],boundaries:[{condition:'未驗證獨立精度。',check:visual,onFailure:'UNKNOWN'}]},run=get('run_algorithm').parameters.properties.justification;
 assert.equal(Check(typed(run),j),false,'fresh execution requires current source metadata');assert.equal(Check(typed(run),{...j,meta:{sourceFingerprint:'current-source',schemeFingerprint:'current-scheme'}}),true);
 const revision=typed(get('revise_algorithm_evidence').parameters);assert.equal(Check(revision,{run_id:'saved-run',expected_revision:0,reason:'僅重寫解說',justification:j,nodes:[{instanceId:'step#1',parameterNotes:'繼承父層設定。'}]}),true);
 assert.equal(Check(revision,{run_id:'saved-run',expected_revision:0,reason:'保留缺圖',nodes:[{instanceId:'step#1',evidenceGap:'原步驟未保存圖。',justification:{...j,tool:{reason:'只解釋原始記錄。',expectedEvidence:[]}}}]}),true);
 const saved=typed(get('get_visual_asset').parameters);assert.equal(Check(saved,{asset_id:'real-id',include_content:true,offset:2,limit:16000}),true);assert.equal(Check(saved,{asset_id:'real-id',offset:-1}),false);assert.equal(Check(saved,{asset_id:'real-id',limit:16001}),false);
 assert.equal(Check(typed(get('set_purpose_scheme').parameters),{scheme_json:'{}',bind_current_sources:true}),true);
});
test('restored asset tools dispatch to durable storage and paginate exact saved source rather than regenerate',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentcv-contract-assets-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const library=createVisualAssetLibrary({invoke:(command,{request})=>({'visual_asset_library_save':saveVisualAsset,'visual_asset_library_search':searchVisualAssets,'visual_asset_library_get':getVisualAsset}[command])(request,{root:dir})}),p=new Workspace(),shown=[];
 const a=new Agent(p,{locked:()=>false,reference:()=>null,visualLibrary:library,saveVisualAsset:args=>library.save(args),showSavedVisual:async args=>{const record=await library.get({id:args.asset_id});shown.push(record);return {displayed:true,assetId:record.entry.id}}});
 const content='<div><h2>支持點與外推</h2><p>這是收藏的歷史圖解。</p></div>',saved=await a.execute('save_visual_asset',{title:'可復用定位解釋',role:'schematic',content,mimeType:'text/html'}),found=await a.execute('search_visual_assets',{query:'定位'});
 assert.equal(found.total,1);assert.equal(found.contentIncluded,false);assert.equal(JSON.stringify(found).includes(content),false);
 const page=await a.execute('get_visual_asset',{asset_id:saved.entry.id,include_content:true,offset:5,limit:9});assert.equal(page.content,content.slice(5,14));assert.equal(page.contentLength,content.length);assert.equal(page.contentTruncated,true);
 const receipt=await a.execute('show_visual_asset',{asset_id:saved.entry.id});assert.equal(receipt.displayed,true);assert.equal(shown[0].content,content);
});
test('restored revision tool appends commentary to a real saved OpenCV run without changing execution facts',async()=>{
 const data=JSON.parse(await fs.readFile(new URL('../../OpenCV封面定位.agentcv.json',import.meta.url),'utf8')),p=new Workspace();p.data=data;const run=data.algorithmRuns.at(-1),revision=run.evidenceRevisions?.length||0,facts=JSON.stringify({code:run.code,parameters:run.parameters,sourceBinding:run.sourceBinding,result:run.result,artifacts:run.artifacts}),a=new Agent(p,{locked:()=>false,reference:()=>null});
 const result=await a.execute('revise_algorithm_evidence',{run_id:run.runId,expected_revision:revision,reason:'核對解說工具仍可操作保存的真實運算。',parameterNotes:'本次僅驗證解說修訂路徑，沒有新增參數試驗。'});
 assert.equal(result.revision,revision+1);assert.equal(run.evidenceRevisions.at(-1).parameterNotes,'本次僅驗證解說修訂路徑，沒有新增參數試驗。');assert.equal(JSON.stringify({code:run.code,parameters:run.parameters,sourceBinding:run.sourceBinding,result:run.result,artifacts:run.artifacts}),facts);
});
