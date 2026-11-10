import test from 'node:test';
import assert from 'node:assert/strict';
import {Workspace} from '../src/workspace.js';
import {algorithmContext} from '../src/algorithm-workspace.js';
import {algorithmOutputCapabilities,evaluateAlgorithmOutput,adoptAlgorithmOutput,readCurrentAlgorithmOutput,clearAlgorithmOutput,algorithmOutputSummaries} from '../src/algorithm-pipeline.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const dims={width:300,height:200},sides=['top','bottom','left','right'];
const artifact=(id,type)=>({id,type,sha256:id==='overlay'?'a'.repeat(64):'b'.repeat(64),hostBytesVerified:true});
function evidence(boundary='first_scope') {return {
 tool:{reason:'根據工件四側支持點擬合直線，選掃描第一條，支持點與疊圖保留供核對。',expectedEvidence:[{kind:'artifact',type:'image',id:'overlay'},{kind:'artifact',type:'evidence',id:'supports'}]},
 parameters:[{name:'search',source:'agent-proposal',reason:'沿既定搜尋帶逐像素掃描；工程預設尚未最佳化，用支持點檢查擬合。',verification:{kind:'artifact',type:'evidence',id:'supports'}}],
 boundaries:[{condition:'僅本first輸出的四側支持點、品質與跨度完整；last另行保留失敗。',check:{kind:'gate',id:boundary},onFailure:'UNKNOWN'}]
}}
function line(side){
 const horizontal=side==='top'||side==='bottom',axis=horizontal?'x':'y',normal=side==='top'?30:side==='bottom'?150:side==='left'?40:240,from=horizontal?40:30,to=horizontal?240:150,make=t=>horizontal?{x:t,y:normal}:{x:normal,y:t};
 return {id:side,geometry:{from:make(from),to:make(to)},support:{sampleSpan:{axis,from,to,step:1},points:Array.from({length:to-from+1},(_,i)=>{const p=make(from+i);return [p.x,p.y]})},evidenceRefs:['overlay','supports'],checks:[{id:'rms',metric:'rms_px',operator:'<=',threshold:1.5,unit:'px'},{id:'coverage',metric:'coverage',operator:'>=',threshold:.65,unit:'ratio'},{id:'support',metric:'support_count',operator:'>=',threshold:3,unit:'points'},{id:'continuity',metric:'continuity',operator:'>=',threshold:.55,unit:'ratio'},{id:'gap',metric:'max_gap_ratio',operator:'<=',threshold:.15,unit:'ratio'}]};
}
async function fixture(){
 const project=new Workspace();await project.addImages([{name:'fixture.png',dataUrl:'data:image/png;base64,AA=='}],async()=>({...dims,gray:new Float32Array(dims.width*dims.height),sha256:'c'.repeat(64)}));
 const image=project.image,target=project.workflow.workpiece;project.setRegion(target.id,[{x:38,y:28},{x:242,y:28},{x:242,y:152},{x:38,y:152}]);
 const width=project.addCheck({name:'寬度',targetId:target.id,kind:'width',unit:'px',min:199,max:201}),height=project.addCheck({name:'高度',targetId:target.id,kind:'height',unit:'px',min:119,max:121}),angle=project.addCheck({name:'角度',targetId:target.id,kind:'angle',unit:'deg',min:-1,max:1});
 const output={id:'first',imageId:image.id,targetId:target.id,coordinateSpace:'original-pixels',selection:{rule:'first',scanDirection:'outside-in',reason:'按人要求從背景向工件取第一條合格線。'},lines:Object.fromEntries(sides.map(side=>[side,line(side)])),evidenceRefs:['overlay','supports'],justification:evidence(),boundaryChecks:[{id:'first_scope',status:'PASS',actual:{validSides:4},threshold:{validSides:4}}],excludedRunBoundaryChecks:[{id:'both_selections',reason:'整run同時包含last的失敗；本輸出只檢查first，並保留本scope獨立gate。'}]};
 const run={runId:'native-run',status:'SUCCEEDED',title:'first與last分開的四側線試跑',code:'# original executable Python',parameters:{search:{threshold:18}},sourceBinding:algorithmContext(project).source,justification:evidence(),expectedOutputs:[{id:'overlay',type:'image'},{id:'supports',type:'evidence'}],artifacts:[artifact('overlay','image'),artifact('supports','json')],evidenceAudit:{status:'DIAGNOSTIC_ONLY'},result:{boundaryChecks:[{id:'both_selections',status:'FAIL',actual:{first:true,last:false},threshold:{all:true}}],measurementOutputs:[output]}};
 project.data.algorithmRuns=[run];return {project,run,output,image,target,width,height,angle};
}

test('optional geometry adapter discovers contract without limiting arbitrary program results',()=>{
 const capabilities=algorithmOutputCapabilities();assert.equal(capabilities.optional,true);assert.equal(capabilities.sourceField,'result.measurementOutputs');assert.match(capabilities.scope,/任意算法/);
});
test('scoped first output feeds width/height/angle despite unrelated whole-program last failure',async()=>{
 const {project,run,width,height,angle}=await fixture(),value=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});
 assert.equal(value.current,true);assert.equal(value.adoptable,true,JSON.stringify(value.errors));assert.equal(value.status,'OK');assert.equal(value.measurement.status,'MEASURED');assert.equal(value.checks[width.id].value,200);assert.equal(value.checks[height.id].value,120);assert.equal(value.checks[angle.id].value,0);assert.equal(value.edges.top.metrics.max_gap_ratio,0);
 assert.equal(run.evidenceAudit.status,'DIAGNOSTIC_ONLY');assert.equal(run.result.boundaryChecks[0].status,'FAIL');assert.equal(value.delivered,false);
});
test('adopt and clear preserve original recipe, human answers, and workflow revision; undo works',async()=>{
 const {project,run,image,width}=await fixture();project.workflow.recipe={id:'original',params:{edgeIntents:{outer:true}}};image.labels[width.id]={source:'human',status:'OK',reason:'人類原答案'};
 const before=copy({recipe:project.workflow.recipe,labels:image.labels,revision:project.workflow.revision}),adopted=adoptAlgorithmOutput(project,{runId:run.runId,outputId:'first'});
 assert.equal(adopted.active,true);assert.deepEqual({recipe:project.workflow.recipe,labels:image.labels,revision:project.workflow.revision},before);assert.equal(readCurrentAlgorithmOutput(project).measurement.width,200);assert.equal(algorithmOutputSummaries(project)[0].active,true);
 assert.equal(clearAlgorithmOutput(project).cleared,true);assert.equal(readCurrentAlgorithmOutput(project),null);project.undo();assert.equal(readCurrentAlgorithmOutput(project).outputId,'first');
});
test('old runs with summary numbers but no geometry never silently become adopted',async()=>{
 const {project,run}=await fixture();run.result={summary:{width:200}};const value=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(value.adoptable,false);assert.equal(value.errors[0].code,'ALGORITHM_OUTPUT_NOT_FOUND');assert.throws(()=>adoptAlgorithmOutput(project,{runId:run.runId,outputId:'first'}),/ALGORITHM_OUTPUT_NOT_FOUND/);
});
test('stale image, target or workflow source rejects adoption rather than presenting a current pass',async()=>{
 const {project,run,target}=await fixture();project.setRegion(target.id,[{x:35,y:28},{x:242,y:28},{x:242,y:152},{x:35,y:152}]);const value=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(value.current,false);assert.equal(value.status,'UNKNOWN');assert.equal(value.measurement.status,'UNKNOWN');assert.throws(()=>adoptAlgorithmOutput(project,{runId:run.runId,outputId:'first'}),/ALGORITHM_OUTPUT_STALE/);
});
test('read refuses altered program or output after adoption even if source pixels stayed unchanged',async()=>{
 const {project,run,output}=await fixture();adoptAlgorithmOutput(project,{runId:run.runId,outputId:'first'});run.code+='\n# changed';const changed=readCurrentAlgorithmOutput(project);assert.equal(changed.current,false);assert.equal(changed.status,'UNKNOWN');assert.ok(changed.errors.some(error=>error.code==='ALGORITHM_ADOPTED_OUTPUT_CHANGED'));
});
test('global failed boundary cannot be silently hidden by a first-only output',async()=>{
 const {project,run,output}=await fixture();delete output.excludedRunBoundaryChecks;const value=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(value.adoptable,false);assert.ok(value.errors.some(error=>error.code==='PROGRAM_BOUNDARY_SCOPE_REQUIRED'));
});
test('missing parameter rationale and absent visual artifact block adoption with actionable errors',async()=>{
 const {project,run,output}=await fixture();output.justification.parameters=[];run.artifacts=run.artifacts.filter(artifact=>artifact.id!=='overlay');const value=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(value.adoptable,false);assert.ok(value.errors.some(error=>error.code==='PARAMETER_JUSTIFICATION_MISSING'));assert.ok(value.errors.some(error=>error.code==='OUTPUT_EVIDENCE_MISSING'));
});
test('one failing side remains unknown while three valid sides and numeric failure stay visible',async()=>{
 const {project,run,output}=await fixture();output.lines.left.support.points=output.lines.left.support.points.filter((_,i)=>i%3===0);const value=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(value.adoptable,true);assert.equal(value.edges.top.status,'FOUND');assert.equal(value.edges.right.status,'FOUND');assert.equal(value.edges.bottom.status,'FOUND');assert.equal(value.edges.left.status,'UNKNOWN');assert.equal(value.edges.left.checks.find(check=>check.id==='coverage').pass,false);assert.equal(value.measurement.status,'UNKNOWN');assert.equal(value.status,'UNKNOWN');
});
test('cross-parameter spread is recomputed at common span and fails a conflicting trial',async()=>{
 const {project,run,output}=await fixture(),line=output.lines.top;line.parameterTrials=[{id:'w1',geometry:copy(line.geometry)},{id:'w5',geometry:{from:{x:40,y:40},to:{x:240,y:40}}}];line.checks.push({id:'agreement',metric:'parameter_spread_px',operator:'<=',threshold:3,unit:'px'});
 const value=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(value.edges.top.metrics.parameter_spread_px,10);assert.equal(value.edges.top.status,'UNKNOWN');assert.equal(value.measurement.status,'UNKNOWN');
});
test('contradictory declared actual and malformed geometry reject adoption',async()=>{
 const {project,run,output}=await fixture();output.lines.top.checks[0].actual=2;output.lines.left.geometry.to=copy(output.lines.left.geometry.from);const value=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(value.adoptable,false);assert.ok(value.errors.some(error=>error.code==='LINE_DECLARED_METRIC_MISMATCH'));assert.ok(value.errors.some(error=>error.code==='LINE_GEOMETRY_INVALID'));
});
test('scoped failed gate keeps output UNKNOWN and no dimension leaks to checks',async()=>{
 const {project,run,output,width}=await fixture();output.boundaryChecks[0].status='FAIL';const value=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(value.adoptable,true);assert.equal(value.status,'UNKNOWN');assert.equal(value.measurement.status,'UNKNOWN');assert.equal(value.checks[width.id].value,undefined);
});
test('physical units require valid confirmed calibration and use per-axis scales',async()=>{
 const {project,run,output,width,height}=await fixture();project.workflow.checks.find(check=>check.id===width.id).unit='mm';project.workflow.checks.find(check=>check.id===width.id).min=1.9;project.workflow.checks.find(check=>check.id===width.id).max=2.1;
 project.workflow.checks.find(check=>check.id===height.id).unit='mm';project.workflow.checks.find(check=>check.id===height.id).min=2.3;project.workflow.checks.find(check=>check.id===height.id).max=2.5;
 const noScale=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(noScale.checks[width.id].status,'UNKNOWN');assert.equal(noScale.checks[width.id].value,undefined);
 project.scale=()=>({status:'VALID',mmPerPixelX:.01,mmPerPixelY:.02,profileId:'confirmed-camera'});const scaled=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(scaled.checks[width.id].value,2);assert.equal(scaled.checks[height.id].value,2.4);assert.equal(scaled.status,'OK');assert.equal(scaled.checks[width.id].calibration.profileId,'confirmed-camera');
});

test('malformed output rationale or null quality checks yield schema errors instead of crashing',async()=>{
 const {project,run,output}=await fixture();output.justification={tool:{reason:'缺少圖像依據',expectedEvidence:{}},parameters:{},boundaries:{}};output.lines.top.checks=[null];const value=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(value.adoptable,false);assert.ok(value.errors.length>0);
});
test('reversed line endpoint ordering does not turn a horizontal edge into a 180 degree angle',async()=>{
 const {project,run,output,angle}=await fixture();for(const side of sides){const g=output.lines[side].geometry;[g.from,g.to]=[g.to,g.from]}const value=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(value.status,'OK');assert.equal(value.checks[angle.id].value,0);
});
test('zero coverage policy or fewer than three required supports cannot qualify an empty rule',async()=>{
 const {project,run,output}=await fixture();output.lines.top.checks.find(check=>check.metric==='coverage').threshold=0;output.lines.top.checks.find(check=>check.metric==='support_count').threshold=1;const value=evaluateAlgorithmOutput(project,{runId:run.runId,outputId:'first'});assert.equal(value.adoptable,false);assert.ok(value.errors.some(error=>error.code==='LINE_QUALITY_DIRECTION_INVALID'));
});
