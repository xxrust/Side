import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {programScope,engineeringFlow} from '../src/program-scope.js';import {buildProgramFlow} from '../src/program-flow.js';
test('real nested OpenCV procedures expose only declared cross-node interfaces, not every internal operator image',async()=>{const root=path.resolve('.'),dir=await fs.mkdtemp(path.join(root,'runtime/scope-real-'));try{const bytes=await fs.readFile('../research/opencv-traditional-10-2026-10-25/assets/stuff.jpg'),request={runId:'real-nested-scope',title:'Engineering boundary verification',sourceBinding:{images:[{imageId:'actual-opencv-source',imageSha256:'test-bound-source'}]},images:[{id:'actual-opencv-source',dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')}],parameters:{},code:`
with procedure('locate', '定位工件', outputs={'mask':'binary foreground'}) as p:
    with step('smooth', '平滑') as s:
        smoothed=cv2.GaussianBlur(gray,(3,3),0)
        save_image('smoothed',smoothed)
        s.set_output('smoothed',smoothed)
    with step('segment', '分割', depends_on=['smooth'], inputs={'smoothed':smoothed}) as s:
        t,mask=cv2.threshold(smoothed,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
        save_image('mask',mask)
        s.set_output('mask',mask)
    p.set_output('mask',mask)
with procedure('inspect', '連通區分析', depends_on=['locate'], inputs={'mask':mask}, outputs={'blob':'component visualization'}) as p:
    with step('components', '連通區', inputs={'mask':mask}) as s:
        count,labels=cv2.connectedComponents(mask)
        colored=cv2.applyColorMap((labels%256).astype(np.uint8),cv2.COLORMAP_JET)
        save_image('blob',colored)
        s.set_output('count',int(count))
    p.set_output('count',int(count))
result={'purpose':'real trace interface verification only'}
`};const file=path.join(dir,'request.json');await fs.writeFile(file,JSON.stringify(request));const child=spawn(path.join(root,'runtime/python/bin/python3'),[path.join(root,'scripts/cv-runtime.py'),'--run',file,dir],{cwd:dir,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);const exit=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject)});assert.equal(exit,0,stderr);const run=JSON.parse(await fs.readFile(JSON.parse(stdout.trim()).resultFile,'utf8'));assert.equal(run.status,'SUCCEEDED',run.traceback);const project={data:{algorithmRuns:[run]}},scope=id=>programScope(project,{programBinding:{runId:run.runId,nodeId:run.runId+'::'+id}},run.runId),locate=scope('locate#1'),inspect=scope('inspect#1'),segment=scope('segment#1');const whole=programScope(project,{},run.runId);assert.deepEqual([...whole.outputs],['blob']);assert.deepEqual([...locate.outputs],['mask']);assert.ok(locate.owned.has('smoothed'));assert.ok(!locate.outputs.has('smoothed'));assert.deepEqual([...inspect.inputs],['mask']);assert.deepEqual([...inspect.outputs],['blob']);assert.deepEqual([...segment.inputs],['smoothed']);assert.deepEqual([...segment.outputs],['mask']);const flow=buildProgramFlow(project),main=engineeringFlow(flow);assert.equal(main.nodes.filter(n=>n.kind==='procedure').length,2);assert.equal(main.nodes.filter(n=>n.kind==='step').length,0);assert.ok(main.edges.some(e=>e.kind==='dependency'&&e.from.endsWith('locate#1')&&e.to.endsWith('inspect#1')));}finally{await fs.rm(dir,{recursive:true,force:true})}});
