import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {Workspace} from '../src/workspace.js';
import {algorithmContext} from '../src/algorithm-workspace.js';
import {algorithmPresentationCapabilities,proposeAlgorithmPresentation,readAlgorithmPresentation,beginAlgorithmPresentationRender,recordAlgorithmPresentationRender,prepareAlgorithmPresentations} from '../src/algorithm-presentation.js';

const require=createRequire(import.meta.url),{createCanvas,loadImage}=require('../../qa/node_modules/@napi-rs/canvas');
const clone=value=>JSON.parse(JSON.stringify(value));
async function decode(dataURL){const image=await loadImage(dataURL),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,image.width,image.height).data,gray=new Float32Array(image.width*image.height);for(let i=0;i<gray.length;i++)gray[i]=rgba[i*4];return {width:image.width,height:image.height,gray,rgba,sha256:createHash('sha256').update(Buffer.from(dataURL.split(',')[1],'base64')).digest('hex')};}
async function fixture(){
 const canvas=createCanvas(64,48),ctx=canvas.getContext('2d');ctx.fillStyle='#101010';ctx.fillRect(0,0,64,48);ctx.fillStyle='#eee';ctx.fillRect(10,10,30,20);const dataURL=canvas.toDataURL('image/png'),project=new Workspace();await project.addImages([{name:'camera-one.png',dataUrl:dataURL},{name:'camera-two.png',dataUrl:dataURL}],decode);
 const source=clone(algorithmContext(project).source),run={schema:'agentcv-algorithm-run-1',runId:'actual-recorded-run',status:'SUCCEEDED',code:'result = measured_values',codeSha256:'saved-program-code-sha',sourceBinding:source,parameters:{threshold:18},result:{measurement:{width:30,height:20,unit:'px'},message:'本次量測保留為 TRIAL',boundaryChecks:[{id:'quality',status:'FAIL',actual:2,threshold:1.5}]},justification:{tool:{reason:'引用本次實算影像與逐側品質，不把範圍當尺寸',expectedEvidence:[{kind:'artifact',type:'image',id:'overlay'}]},parameters:[{name:'threshold',source:'agent-proposal',reason:'本次明確設定對比門檻18，尚未證明跨樣本適用',verification:{kind:'artifact',type:'evidence',id:'stats'}}],boundaries:[{condition:'殘差需在門檻內，否則保留診斷',check:{kind:'gate',id:'quality'},onFailure:'UNKNOWN'}]},evidenceAudit:{status:'DIAGNOSTIC_ONLY',delivered:false},artifacts:[{id:'overlay',name:'overlay.png',type:'image',dataUrl:dataURL,width:64,height:48,sha256:createHash('sha256').update(Buffer.from(dataURL.split(',')[1],'base64')).digest('hex'),source:clone(source)},{id:'stats',type:'json',source:clone(source),data:{rows:[{side:'top',rms:0.5,support:20},{side:'left',rms:2,support:15}],points:[{distance:0,intensity:12},{distance:1,intensity:40},{distance:2,intensity:180}]}}]};project.data.algorithmRuns=[run];return {project,run};
}
function declaration(project){return {title:'四側找邊圖像與數字',imageId:project.image.id,outputId:'first',layout:'focus',components:[{id:'overlay',kind:'image',title:'原圖與邊線',source:{artifactId:'overlay'}},{id:'size',kind:'metrics',title:'本次尺寸',source:{path:'measurement'},fields:[{label:'寬',path:'width',unit:'px'},{label:'高',path:'height',unit:'px'}]},{id:'quality',kind:'table',title:'逐側品質',source:{artifactId:'stats',path:'rows'},columns:[{label:'側別',path:'side'},{label:'RMS',path:'rms'}]},{id:'profile',kind:'plot',title:'灰階剖面',source:{artifactId:'stats',path:'points'},x:'distance',series:[{label:'灰階',path:'intensity'}]},{id:'note',kind:'text',title:'實算說明',source:{path:'message'}}]};}
function propose(project,run,patch={}){return proposeAlgorithmPresentation(project,{run_id:run.runId,presentation_json:JSON.stringify({...declaration(project),...patch})});}

test('a persisted presentation resolves five visual kinds from actual run records and preserves the complete triad',async()=>{
 const {project,run}=await fixture(),before=clone(project.workflow),labels=clone(project.image.labels),presentation=propose(project,run),read=readAlgorithmPresentation(project,{include_data:true});
 assert.equal(presentation.current,true);assert.equal(presentation.sourceCurrent,true);assert.equal(presentation.applicable,true);assert.equal(presentation.runId,run.runId);assert.equal(presentation.outputId,'first');assert.equal(project.data.activeAlgorithmPresentationId,presentation.id);assert.ok(presentation.components.every(component=>!Object.hasOwn(component,'data')));assert.deepEqual(read.justification,run.justification);assert.equal(read.evidenceAudit.status,'DIAGNOSTIC_ONLY');assert.equal(read.components[0].data.dataUrl,run.artifacts[0].dataUrl);assert.equal(read.components[0].data.artifactSha256,run.artifacts[0].sha256);assert.deepEqual(read.components[1].data.fields.map(field=>field.value),[30,20]);assert.deepEqual(read.components[2].data.rows,[['top',0.5],['left',2]]);assert.deepEqual(read.components[3].data.series[0].points,[{x:0,y:12,index:0},{x:1,y:40,index:1},{x:2,y:180,index:2}]);assert.equal(read.components[4].data.text,run.result.message);assert.deepEqual(project.workflow,before);assert.deepEqual(project.image.labels,labels);assert.equal(presentation.renderReceipt,null);assert.match(algorithmPresentationCapabilities().scope,/不改算法/);
});

test('bad references, HTML/script kinds, arbitrary image URLs, dangerous paths, nonnumeric plots and duplicate IDs reject atomically',async()=>{
 const {project,run}=await fixture();
 const invalid=[
  value=>value.components[0].kind='html',
  value=>value.components[0].source={url:'https://example.com/fake.png'},
  value=>value.components[0].source={path:'imageUrl'},
  value=>value.components[0].source.artifactId='missing-artifact',
  value=>value.components[1].fields[0].path='inventedWidth',
  value=>value.components[1].source.path='constructor',
  value=>value.components[2].source.path='points.0',
  value=>value.components[3].series[0].path='missingIntensity',
  value=>value.components[4].source.path='measurement',
  value=>value.components[1].id=value.components[0].id,
  value=>value.imageId=project.data.images[1].id,
 ];
 for(const mutate of invalid){const value=declaration(project);mutate(value);const before=JSON.stringify(project.data),undo=project.undoStack.length;assert.throws(()=>proposeAlgorithmPresentation(project,{run_id:run.runId,presentation_json:JSON.stringify(value)}),error=>error.code.startsWith('PRESENTATION_')&&error.errors[0].path.length>0);assert.equal(JSON.stringify(project.data),before);assert.equal(project.undoStack.length,undo);}
 run.artifacts[1].data.points[1].intensity='not a number';assert.throws(()=>propose(project,run),error=>error.code==='PRESENTATION_NUMERIC_REQUIRED');
});

test('diagnostic and partial failed runs may be displayed without becoming accepted inspection results',async()=>{
 const {project,run}=await fixture();run.status='FAILED';run.traceback='ValueError: candidate rejected';const view=propose(project,run);assert.equal(view.runStatus,'FAILED');assert.equal(view.current,true);assert.equal(view.evidenceAudit.delivered,false);assert.equal(project.image.result,undefined);assert.equal(project.workflow.recipe,null);assert.equal(project.workflow.publication,null);
 run.artifacts[0].source.images[0].imageSha256='another-source';assert.throws(()=>propose(project,run),error=>error.code==='PRESENTATION_ARTIFACT_SOURCE_MISMATCH');
});

test('cross-image selection is explicitly inapplicable, and ROI/configuration changes make the original view stale',async()=>{
 const {project,run}=await fixture(),presentation=propose(project,run),sourceImage=project.image.id;await project.selectImage(project.data.images[1].id);let read=readAlgorithmPresentation(project);assert.equal(read.status,'INAPPLICABLE');assert.equal(read.inapplicable,true);assert.equal(read.applicable,false);assert.equal(read.sourceCurrent,true);assert.equal(read.current,false);assert.equal(read.imageId,sourceImage);await project.selectImage(sourceImage);assert.equal(readAlgorithmPresentation(project).current,true);
 project.setRegion(project.workflow.workpiece.id,[{x:8,y:8},{x:42,y:8},{x:42,y:38},{x:8,y:38}]);read=readAlgorithmPresentation(project);assert.equal(read.id,presentation.id);assert.equal(read.status,'STALE');assert.equal(read.sourceCurrent,false);assert.equal(read.current,false);
});

test('a host render receipt requires the latest view token and real image dimensions; mounted and loaded remain distinct',async()=>{
 const {project,run}=await fixture(),presentation=propose(project,run),session=beginAlgorithmPresentationRender(project,presentation.id,{selectedComponentId:'overlay',section:'tool'}),pending=recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:session.token,components:[{componentId:'overlay',status:'mounted',width:800,height:600}],viewport:{width:1000,height:700}});assert.equal(pending.status,'PENDING_IMAGE');assert.equal(pending.latest,true);assert.equal(pending.validForCurrentView,true);assert.equal(pending.current,true);assert.match(pending.claim,/不證明/);
 assert.throws(()=>recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:session.token,components:[{componentId:'overlay',status:'loaded',width:800,height:600}]}),error=>error.code==='PRESENTATION_RECEIPT_INVALID');
 const loaded=recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:session.token,components:[{componentId:'overlay',status:'loaded',width:800,height:600,naturalWidth:64,naturalHeight:48}]});assert.equal(loaded.status,'MOUNTED');assert.equal(loaded.components[0].naturalWidth,64);assert.equal(loaded.components[0].artifactId,'overlay');assert.equal(loaded.components[0].artifactSha256,run.artifacts[0].sha256);assert.equal(readAlgorithmPresentation(project).renderReceipt.id,loaded.id);assert.throws(()=>recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:session.token,components:[{componentId:'overlay',status:'loaded',naturalWidth:64,naturalHeight:48,artifactSha256:'wrong'}]}),error=>error.code==='PRESENTATION_RECEIPT_ARTIFACT_MISMATCH');
 const next=beginAlgorithmPresentationRender(project,presentation.id,{selectedComponentId:'quality',section:'boundary'});assert.equal(readAlgorithmPresentation(project).renderReceipt.latest,false);assert.throws(()=>recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:session.token,components:[]}),error=>error.code==='PRESENTATION_RENDER_STALE');
 const current=recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:next.token,components:[{componentId:'quality',status:'mounted',width:700,height:400}]});assert.equal(current.section,'boundary');assert.equal(current.selectedComponentId,'quality');assert.equal(current.renderToken,next.token);assert.equal(current.status,'MOUNTED');
 const errors=recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:next.token,components:[{componentId:'quality',status:'error',error:'Failed to create table'}]});assert.equal(errors.status,'ERROR');assert.match(errors.components[0].error,/table/);
});

test('changing image or source after rendering invalidates receipt applicability without rewriting history',async()=>{
 const {project,run}=await fixture(),presentation=propose(project,run),session=beginAlgorithmPresentationRender(project,presentation.id),receipt=recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:session.token,components:[{componentId:'overlay',status:'loaded',naturalWidth:64,naturalHeight:48}]});await project.selectImage(project.data.images[1].id);let read=readAlgorithmPresentation(project);assert.equal(read.renderReceipt.latest,false);assert.equal(read.renderReceipt.validForCurrentView,false);assert.equal(read.renderReceipt.current,false);assert.equal(read.renderReceipt.currentAtRender,true);assert.equal(receipt.current,true,'saved observation remains historical');assert.throws(()=>recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:session.token,components:[]}),error=>error.code==='PRESENTATION_RENDER_STALE');await project.selectImage(presentation.imageId);assert.equal(readAlgorithmPresentation(project).renderReceipt.latest,false,'switching back still requires a new host render');project.pixels.get(presentation.imageId).gray[0]+=1;read=readAlgorithmPresentation(project);assert.equal(read.current,false);assert.equal(read.renderReceipt.validForCurrentView,false);
});

test('saving and reopening preserves references and receipt history but never treats a previous process mount as live UI proof',async()=>{
 const {project,run}=await fixture(),presentation=propose(project,run),session=beginAlgorithmPresentationRender(project,presentation.id,{selectedComponentId:'size',section:'parameters'});recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:session.token,components:[{componentId:'size',status:'mounted',width:400,height:200}]});const saved=clone(project.data),restored=new Workspace();await restored.load(saved,decode);const read=readAlgorithmPresentation(restored,{include_data:true});assert.equal(read.id,presentation.id);assert.equal(read.current,true);assert.equal(read.components[1].data.fields[0].value,30);assert.equal(read.renderReceipt.latest,false);assert.equal(read.renderReceipt.validForCurrentView,false);assert.equal(read.renderReceipt.section,'parameters');assert.equal(read.justification.tool.reason,run.justification.tool.reason);assert.equal(restored.data.algorithmPresentations.length,1);
});

test('large real arrays retain source totals, deterministic plot sampling and explicit truncation without materializing them into tool responses',async()=>{
 const {project,run}=await fixture();run.artifacts[1].data.rows=Array.from({length:900},(_,i)=>({side:'side-'+i,rms:i/10}));run.artifacts[1].data.points=Array.from({length:5000},(_,i)=>({distance:i,intensity:i*i}));run.result.message='a'.repeat(13000);const presentation=propose(project,run),read=readAlgorithmPresentation(project,{include_data:true}),table=read.components[2].data,plot=read.components[3].data,note=read.components[4].data;assert.equal(table.totalRows,900);assert.equal(table.rows.length,200);assert.equal(table.omittedRows,700);assert.equal(plot.totalPoints,5000);assert.equal(plot.shownPoints,2048);assert.equal(plot.sampled,true);assert.deepEqual(plot.series[0].points[0],{x:0,y:0,index:0});assert.deepEqual(plot.series[0].points.at(-1),{x:4999,y:4999*4999,index:4999});assert.equal(note.totalCharacters,13000);assert.equal(note.text.length,12000);assert.equal(note.truncated,true);assert.ok(JSON.stringify(presentation).length<7000);assert.ok(!JSON.stringify(project.data.algorithmPresentations).includes('49980001'));
});

test('same-run result or artifact payload changes invalidate data fingerprints and their render receipts',async()=>{
 const {project,run}=await fixture(),presentation=propose(project,run),session=beginAlgorithmPresentationRender(project,presentation.id,{selectedComponentId:'size'});recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:session.token,components:[{componentId:'size',status:'mounted'}]});run.result.measurement.width=31;let read=readAlgorithmPresentation(project);assert.equal(read.dataCurrent,false);assert.equal(read.sourceCurrent,false);assert.equal(read.renderReceipt.current,false);assert.equal(read.renderReceipt.currentAtRender,true);assert.equal(read.renderReceipt.latest,false);assert.equal(read.renderReceipt.validForCurrentView,false);run.result.measurement.width=30;assert.equal(readAlgorithmPresentation(project).dataCurrent,true);run.artifacts[1].data.rows[0].rms=1.25;read=readAlgorithmPresentation(project);assert.equal(read.dataCurrent,false);assert.equal(read.current,false);
});

test('saved presentation and receipt validation is atomic and does not create a live render session',async()=>{
 const {project,run}=await fixture(),presentation=propose(project,run),session=beginAlgorithmPresentationRender(project,presentation.id);recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:session.token,components:[{componentId:'overlay',status:'loaded',naturalWidth:64,naturalHeight:48}]});
 const valid=clone(project.data);prepareAlgorithmPresentations(valid);assert.equal(valid.algorithmPresentations[0].id,presentation.id);assert.equal(valid.algorithmPresentationReceipts.length,1);
 for(const mutate of [data=>data.algorithmPresentations[0].components[0].source.artifactId='missing',data=>data.activeAlgorithmPresentationId='not-present',data=>data.algorithmPresentationReceipts[0].runId='wrong-run',data=>data.algorithmPresentations.push(clone(data.algorithmPresentations[0])),data=>data.algorithmPresentationReceipts[0].components[0].componentId='unknown']){
  const invalid=clone(project.data);mutate(invalid);const before=JSON.stringify(invalid);assert.throws(()=>prepareAlgorithmPresentations(invalid),error=>error.code.startsWith('PRESENTATION_'));assert.equal(JSON.stringify(invalid),before);
 }
 const empty={};prepareAlgorithmPresentations(empty);assert.deepEqual(empty,{algorithmPresentations:[],algorithmPresentationReceipts:[],activeAlgorithmPresentationId:null});const {project:other}=await fixture();other.data=valid;assert.equal(readAlgorithmPresentation(other).renderReceipt.latest,false,'loading saved records cannot instantiate a host render token');
});

test('an image receipt cannot borrow the dimensions of a different loaded image',async()=>{
 const {project,run}=await fixture(),presentation=propose(project,run),session=beginAlgorithmPresentationRender(project,presentation.id);assert.throws(()=>recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:session.token,components:[{componentId:'overlay',status:'loaded',naturalWidth:1280,naturalHeight:1024}]}),error=>error.code==='PRESENTATION_RECEIPT_IMAGE_MISMATCH');assert.equal(project.data.algorithmPresentationReceipts,undefined);
});

test('data fallback displays arbitrary actual JSON and missing failed-run outputs without invented values',async()=>{
 const {project,run}=await fixture();run.status='FAILED';run.result={custom:{shape:'irregular',samples:[1,2,3],accepted:false}};run.error={message:'ValueError: no supported contour',line:17};run.artifacts=[];
 const components=[{id:'json-result',kind:'data',title:'程式原始輸出',source:{}},{id:'run-error',kind:'data',title:'本次錯誤',source:{scope:'run',path:'error'}},{id:'execution',kind:'data',title:'執行狀態',source:{scope:'run',path:'status'}},{id:'not-produced',kind:'data',title:'尚無量測',source:{path:'measurement.width'}}];
 propose(project,run,{components});const read=readAlgorithmPresentation(project,{include_data:true});assert.equal(read.runStatus,'FAILED');assert.deepEqual(JSON.parse(read.components[0].data.text),run.result);assert.deepEqual(JSON.parse(read.components[1].data.text),run.error);assert.equal(read.components[2].data.text,'"FAILED"');assert.equal(read.components[3].data.text,'尚未輸出結果');assert.equal(read.components[3].data.truncated,false);assert.equal(read.evidenceAudit.delivered,false);assert.equal(project.image.result,undefined);assert.ok(algorithmPresentationCapabilities().kinds.includes('data'));assert.equal(algorithmPresentationCapabilities().dataExample.source.scope,'run');
 const before=read.presentationDataFingerprint;run.error.message='A changed real error';const changed=readAlgorithmPresentation(project);assert.equal(changed.dataCurrent,false);assert.equal(changed.current,false);assert.equal(changed.presentationDataFingerprint,before);
});

test('run scope is restricted to displayable execution fields and never exposes code, artifacts or credentials',async()=>{
 const {project,run}=await fixture();run.credentials={token:'not-displayable'};
 for(const path of ['', 'code','artifacts','sourceBinding','parameters','credentials.token','constructor','__proto__']){
  const component={id:'data',kind:'data',title:'不允許的欄位',source:{scope:'run',path}},before=JSON.stringify(project.data);assert.throws(()=>propose(project,run,{components:[component]}),error=>error.code==='PRESENTATION_RUN_PATH_FORBIDDEN');assert.equal(JSON.stringify(project.data),before);
 }
 assert.throws(()=>propose(project,run,{components:[{id:'invalid',kind:'data',title:'無效範圍',source:{scope:'run',artifactId:'stats'}}]}),error=>error.code==='PRESENTATION_SOURCE_INVALID');
});

test('unsupported root, kind-specific and field display properties are rejected atomically rather than pretending to change the UI',async()=>{
 const {project,run}=await fixture(),cases=[
  value=>{value.style={width:'90vw'};return 'style';},
  value=>{value.size='large';return 'size';},
  value=>{value.components[0].style={height:800};return 'components.0.style';},
  value=>{value.components[0].width=1280;return 'components.0.width';},
  value=>{value.components[1].columns=[];return 'components.1.columns';},
  value=>{value.components[2].fields=[];return 'components.2.fields';},
  value=>{value.components[3].lineWidth=4;return 'components.3.lineWidth';},
  value=>{value.components[4].fontSize=24;return 'components.4.fontSize';},
  value=>{value.components[1].fields[0].style={color:'green'};return 'components.1.fields.0.style';},
  value=>{value.components[2].columns[0].size='large';return 'components.2.columns.0.size';},
  value=>{value.components[3].series[0].color='red';return 'components.3.series.0.color';},
  value=>{value.components=[{id:'raw',kind:'data',title:'保底資料',source:{},html:'<b>pretend</b>'}];return 'components.0.html';},
 ];
 for(const mutate of cases){const value=declaration(project),path=mutate(value),before=JSON.stringify(project.data),undo=project.undoStack.length;assert.throws(()=>proposeAlgorithmPresentation(project,{run_id:run.runId,presentation_json:JSON.stringify(value)}),error=>{assert.equal(error.code,'PRESENTATION_FIELD_UNSUPPORTED');assert.equal(error.errors[0].path,path);assert.match(error.errors[0].hint,/僅支援/);assert.match(error.errors[0].hint,/componentExamples/);return true;});assert.equal(JSON.stringify(project.data),before);assert.equal(project.undoStack.length,undo);}
 const capabilities=algorithmPresentationCapabilities();assert.deepEqual(Object.keys(capabilities.componentExamples),capabilities.kinds);for(const kind of capabilities.kinds){const example=capabilities.componentExamples[kind];assert.equal(example.kind,kind);assert.ok(example.id);assert.ok(example.title);assert.ok(example.source);assert.ok(Object.keys(example).every(key=>[...capabilities.allowedProperties.componentCommon,...capabilities.allowedProperties.kindSpecific[kind]].includes(key)));}assert.match(capabilities.allowedProperties.unknownProperties,/原子拒絕/);
});

test('observing a render after save never makes the project perpetually dirty',async()=>{
 const {project,run}=await fixture(),presentation=propose(project,run);project.dirty=false;
 const session=beginAlgorithmPresentationRender(project,presentation.id,{selectedComponentId:'overlay'});
 recordAlgorithmPresentationRender(project,{presentationId:presentation.id,renderToken:session.token,components:[{componentId:'overlay',status:'loaded',naturalWidth:64,naturalHeight:48}]});
 assert.equal(project.dirty,false,'a render observation is not an unsaved domain edit');
 assert.equal(readAlgorithmPresentation(project).renderReceipt.latest,true);
 assert.equal(project.data.algorithmPresentationReceipts.length,1,'observations remain available for the next explicit save');
});
