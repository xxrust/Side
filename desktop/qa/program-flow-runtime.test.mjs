// Integration: saved execution graph built from real OpenCV operations and
// runtime-produced PNG bytes. No substitute runtime, model, or pixel outputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {buildProgramFlow,programFlowNode,programFlowForAsset} from '../src/program-flow.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('real Python trace builds branch graph and reverse-resolves actual PNG to innermost producer',async()=>{
 const directory=await fs.mkdtemp(path.join(root,'runtime/program-flow-real-'));
 try{
  const bytes=await fs.readFile(path.join(root,'../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg'));
  const runId=randomUUID(),sourceBinding={images:[{imageId:'opencv-stuff',imageSha256:'bound-source'}]},request={runId,title:'OpenCV sample graph',sourceBinding,parameters:{},images:[{id:'opencv-stuff',name:'stuff.jpg',dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')}],code:`
with procedure('inspect', '檢查真實原圖') as p:
    with step('segment', 'Otsu分割', inputs={'original': image_records[0]['id']}) as s:
        threshold, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        s.set_output('threshold', float(threshold))
        save_image('mask', mask)
    with step('components', '連通區', depends_on=['segment']) as s:
        count, labels = cv2.connectedComponents(mask, connectivity=8)
        s.set_output('components', int(count))
        s.set_judgement('UNKNOWN')
        save_json('counts', {'count':int(count)})
    with step('edges', '邊緣診斷', depends_on=['segment']) as s:
        edges = cv2.Canny(image, 40, 120)
        s.set_output('edgePixels', int(np.count_nonzero(edges)))
        save_image('edges', edges)
    run_step('alternate', lambda s: save_image('not-created', image), when=False, depends_on=['components'])
result = {'purpose':'圖像執行追溯，不是工件正式判定'}
`};
  const requestPath=path.join(directory,'request.json');await fs.writeFile(requestPath,JSON.stringify(request));
  const child=spawn(path.join(root,'runtime/python/bin/python3'),[path.join(root,'scripts/cv-runtime.py'),'--run',requestPath,directory],{cwd:directory,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});assert.equal(exit,0,stderr);
  const run=JSON.parse(await fs.readFile(JSON.parse(stdout.trim()).resultFile,'utf8'));assert.equal(run.status,'SUCCEEDED',run.traceback);
  const flow=buildProgramFlow([run]),inspect=programFlowNode(flow,`${runId}::inspect#1`),edgeNode=programFlowNode(flow,`${runId}::edges#1`);
  assert.equal(flow.nodes.length,6);assert.equal(inspect.ownArtifacts.length,0,'parent inherits outputs without pretending to produce them');
  assert.deepEqual(inspect.artifacts.map(a=>a.id).sort(),['counts','edges','mask']);
  assert.equal(edgeNode.artifacts.length,1);assert.ok(edgeNode.artifacts[0].dataUrl.startsWith('data:image/png;base64,'));
  assert.ok(edgeNode.outputs.edgePixels>0);assert.equal(programFlowNode(flow,`${runId}::components#1`).judgement,'UNKNOWN');
  assert.equal(programFlowNode(flow,`${runId}::alternate#1`).status,'SKIPPED');assert.ok(!run.artifacts.some(a=>a.id==='not-created'));
  const dependency=flow.edges.filter(e=>e.kind==='dependency');
  assert.ok(dependency.some(e=>e.from===`${runId}::segment#1`&&e.to===`${runId}::components#1`));
  assert.ok(dependency.some(e=>e.from===`${runId}::segment#1`&&e.to===`${runId}::edges#1`));
  const artifact=run.artifacts.find(a=>a.id==='edges');
  const reverse=programFlowForAsset([run],{source:{runId,artifactId:artifact.id,artifactSha256:artifact.sha256,codeSha256:run.codeSha256}});
  assert.equal(reverse.nodes[0].id,edgeNode.id);assert.equal(flow.diagnostics.length,0);
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
