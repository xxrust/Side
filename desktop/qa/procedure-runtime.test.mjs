// Real Python/OpenCV executions against an imported OpenCV sample; no model or pixel mocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function execute(code){
 const directory=await fs.mkdtemp(path.join(root,'runtime/procedure-trace-qa-'));
 const pixels=await fs.readFile(path.join(root,'../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg'));
 const request={runId:randomUUID(),title:'True procedure execution',code,parameters:{},images:[{id:'opencv-stuff',name:'stuff.jpg',dataUrl:'data:image/jpeg;base64,'+pixels.toString('base64')}]};
 const requestPath=path.join(directory,'request.json');await fs.writeFile(requestPath,JSON.stringify(request));
 const child=spawn(path.join(root,'runtime/python/bin/python3'),[path.join(root,'scripts/cv-runtime.py'),'--run',requestPath,directory],{cwd:directory,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
 let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
 const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
 assert.equal(exit,0,stderr);return JSON.parse(await fs.readFile(JSON.parse(stdout.trim()).resultFile,'utf8'));
}

test('real nested procedures record original input, repeated stable steps, actual artifacts, NG and skipped branches independently',async()=>{
 const run=await execute(`
with procedure('inspect', 'Inspect imported sample', inputs={'original': image_records[0]['id']}, outputs={'judgement': 'string'}) as p:
    with step('segment', 'Otsu segmentation', inputs={'original': image_records[0]['id']}, outputs={'mask':'image'}, parameters={'mode':'otsu'}, parameter_sources={'mode':'agent-proposal'}) as s:
        threshold, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        s.set_output('threshold', float(threshold))
        s.set_output('mask', save_image('mask', mask))
    for attempt in range(2):
        with step('count', 'Connected components', depends_on=['segment'], inputs={'mask':'mask'}, parameters={'connectivity':8}) as s:
            count, labels = cv2.connectedComponents(mask, connectivity=8)
            s.set_output('components', int(count))
            save_json('count-' + str(attempt), {'components': int(count)})
            s.set_judgement('NG')
    run_step('not-selected', lambda s: (_ for _ in ()).throw(RuntimeError('must not execute')), when=False, depends_on=['count'])
    run_step('blocked-child', lambda s: save_image('must-not-exist', image), depends_on=['not-selected'])
    p.set_judgement('NG')
result = {'inputShape': list(image.shape)}
`);
 assert.equal(run.status,'SUCCEEDED',run.traceback);assert.equal(run.procedureTrace.schema,'agentcv-procedure-trace-1');
 const nodes=run.procedureTrace.nodes;assert.deepEqual(nodes.map(n=>n.id),['inspect','segment','count','count','not-selected','blocked-child']);
 assert.deepEqual(nodes.map(n=>n.instanceId),['inspect#1','segment#1','count#1','count#2','not-selected#1','blocked-child#1']);
 assert.equal(nodes[0].judgement,'NG');assert.equal(nodes[0].status,'SUCCEEDED');assert.deepEqual(nodes[0].artifactIds,['mask','count-0','count-1']);
 assert.equal(nodes[1].parentInstanceId,'inspect#1');assert.equal(nodes[1].parameters.mode,'otsu');assert.equal(nodes[1].parameterSources.mode,'agent-proposal');
 assert.equal(typeof nodes[1].outputs.threshold,'number');assert.ok(nodes[1].outputs.threshold>0);assert.deepEqual(nodes[1].declaredOutputs,{mask:'image'});
 assert.deepEqual(nodes[2].dependencyInstances,['segment#1']);assert.deepEqual(nodes[4].dependencyInstances,['count#2']);assert.equal(nodes[4].status,'SKIPPED');assert.equal(nodes[5].status,'SKIPPED');
 assert.match(nodes[5].skipReason,/Prerequisite/);assert.ok(!run.artifacts.some(a=>a.id==='must-not-exist'));
 const mask=run.artifacts.find(a=>a.id==='mask');assert.equal(mask.traceNodeId,'segment#1');assert.equal(mask.procedureId,'inspect');assert.equal(mask.stepId,'segment');assert.ok(mask.dataUrl.startsWith('data:image/png;base64,'));
});

test('actual Python exceptions retain failed step and parent, completed earlier outputs, and traceback',async()=>{
 const run=await execute(`
with procedure('inspect'):
    with step('prepare'):
        save_image('original', image)
    with step('fit', depends_on=['prepare']) as s:
        s.set_judgement('UNKNOWN')
        raise ValueError('real fit prerequisite failed')
`);
 assert.equal(run.status,'FAILED');assert.match(run.traceback,/real fit prerequisite failed/);
 assert.deepEqual(run.procedureTrace.nodes.map(n=>n.status),['FAILED','SUCCEEDED','FAILED']);
 assert.equal(run.procedureTrace.nodes[2].judgement,'UNKNOWN');assert.equal(run.procedureTrace.nodes[2].error.type,'ValueError');
 assert.equal(run.artifacts[0].traceNodeId,'prepare#1');assert.ok(run.procedureTrace.nodes.every(n=>n.finishedAt&&Number.isFinite(n.durationMs)));
});

test('legacy arbitrary Python remains unrestricted and emits no fabricated algorithm stages',async()=>{
 const run=await execute(`from statistics import mean\nedges = cv2.Canny(image, 40, 120)\nsave_image('edges', edges)\nresult = {'mean':mean([2,4,6]), 'edgePixels':int(np.count_nonzero(edges))}\n`);
 assert.equal(run.status,'SUCCEEDED',run.traceback);assert.deepEqual(run.procedureTrace.nodes,[]);assert.equal(run.result.mean,4);assert.ok(run.result.edgePixels>0);assert.equal(run.artifacts[0].traceNodeId,undefined);
});

test('dependency references require actual earlier executions; descriptive conditions do not pretend to skip Python body',async()=>{
 const run=await execute(`
with step('descriptive-condition', condition={'selected':False}) as s:
    s.set_output('executed', True)
    save_json('actual', {'executed':True})
with step('missing-dependency', depends_on=['nonexistent']):
    save_image('never', image)
`);
 assert.equal(run.status,'FAILED');assert.match(run.error.message,/no recorded execution/);
 assert.equal(run.procedureTrace.nodes.length,1);assert.equal(run.procedureTrace.nodes[0].status,'SUCCEEDED');assert.equal(run.procedureTrace.nodes[0].outputs.executed,true);assert.equal(run.artifacts.length,1);
});

test('real raster ports preserve exact array fingerprints instead of duplicating millions of pixels in tool output',async()=>{
 const run=await execute(`
import hashlib
with procedure('inspect', inputs={'image':image}) as p:
    with step('edges', inputs={'image':image}) as s:
        edges=cv2.Canny(image,40,120)
        s.set_output('edgePixels', edges)
        s.set_output('longValues', list(range(2000)))
        save_image('edges',edges)
        result={'sha256':hashlib.sha256(edges.tobytes(order='C')).hexdigest()}
`);
 assert.equal(run.status,'SUCCEEDED',run.traceback);const nodes=run.procedureTrace.nodes,port=nodes[1].outputs.edgePixels;
 assert.equal(nodes[0].inputs.image.kind,'array');assert.deepEqual(nodes[0].inputs.image.shape,[480,640,3]);
 assert.equal(port.kind,'array');assert.equal(port.sha256,run.result.sha256);assert.deepEqual(port.shape,[480,640]);assert.equal(port.dtype,'uint8');
 assert.equal(nodes[1].outputs.longValues.kind,'sequence');assert.equal(nodes[1].outputs.longValues.count,2000);
 assert.ok(JSON.stringify(run.procedureTrace).length<10000,'actual raster trace remains small enough for model tools');
});
