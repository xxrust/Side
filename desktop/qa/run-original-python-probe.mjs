// A genuine current-user-image program probe. It only writes a separate review
// directory; it never edits the user's workspace, specifications, or findings.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),projectRoot=path.dirname(desktop),project=JSON.parse(fs.readFileSync(path.join(projectRoot,'before-update.agentcv.json'),'utf8'));
const input=project.images.find(image=>image.id===project.activeId)||project.images[0],target=project.workflow.recipe.targets[0];
const base=path.join(projectRoot,'reviews/2026-10-25-open-algorithms');fs.mkdirSync(base,{recursive:true});
const directory=fs.mkdtempSync(path.join(base,'original-python-probe-'));
const code=`
import cv2
import numpy as np
box=parameters['bounds']; band=parameters['searchBand']; threshold=parameters['gradientThreshold']
overlay=image.copy(); plots=np.full((4*160,960,3),22,np.uint8); rows=[]
for index,side in enumerate(['top','bottom','left','right']):
    horizontal=side in ['top','bottom']
    boundary=box['y'] if side=='top' else box['y']+box['height'] if side=='bottom' else box['x'] if side=='left' else box['x']+box['width']
    tangent0=int((box['x'] if horizontal else box['y'])+(box['width'] if horizontal else box['height'])*.2)
    tangent1=int((box['x'] if horizontal else box['y'])+(box['width'] if horizontal else box['height'])*.8)
    n0=max(0,int(boundary-band));n1=min(gray.shape[0] if horizontal else gray.shape[1],int(boundary+band))
    roi=gray[n0:n1,tangent0:tangent1] if horizontal else gray[tangent0:tangent1,n0:n1]
    profile=np.median(roi,axis=1 if horizontal else 0).astype(np.float32)
    smooth=cv2.GaussianBlur(profile.reshape(1,-1),(5,1),0).ravel()
    gradient=np.diff(smooth)
    hits=np.flatnonzero(np.abs(gradient)>=threshold)
    groups=[]
    for hit in hits:
        if not groups or hit>groups[-1][-1]+1:groups.append([int(hit)])
        else:groups[-1].append(int(hit))
    candidates=[float(n0+np.average(group,weights=np.abs(gradient[group]))+.5) for group in groups]
    ordered=sorted(candidates,reverse=side in ['bottom','right'])
    row={'side':side,'scanDirection':'increasing-coordinate' if side in ['top','left'] else 'decreasing-coordinate','roiNormal':[n0,n1],'candidateCoordinates':ordered,'first':ordered[0] if ordered else None,'last':ordered[-1] if ordered else None}
    rows.append(row)
    for number,position in enumerate(ordered):
        color=(80,220,150) if number==0 else (200,100,240) if number==len(ordered)-1 else (70,160,220)
        p=int(round(position))
        a,b=((tangent0,p),(tangent1,p)) if horizontal else ((p,tangent0),(p,tangent1))
        cv2.line(overlay,a,b,color,2)
        cv2.putText(overlay,f'{side} #{number+1}',a,cv2.FONT_HERSHEY_SIMPLEX,.45,color,1)
    y0=index*160
    cv2.putText(plots,f'{side}: actual median gray profile; threshold = {threshold:g}',(20,y0+24),cv2.FONT_HERSHEY_SIMPLEX,.55,(200,220,225),1)
    points=np.array([[30+int(i/max(1,len(profile)-1)*900),y0+140-int(value/255*100)] for i,value in enumerate(profile)],np.int32)
    cv2.polylines(plots,[points],False,(150,230,180),1)
    for number,position in enumerate(ordered):
        x=30+int((position-n0)/max(1,len(profile)-1)*900)
        cv2.line(plots,(x,y0+40),(x,y0+145),(80,170,240),1)
        cv2.putText(plots,str(number+1),(x+3,y0+50),cv2.FONT_HERSHEY_SIMPLEX,.4,(210,210,255),1)
save_image('ordered-candidates',overlay,section='tool')
save_image('median-profiles',plots,section='parameters')
save_json('scan-orders',rows,section='boundary')
result={'status':'UNKNOWN','candidateOrdering':rows,'boundaryChecks':[{'id':'all-sides-have-candidates','status':'PASS' if all(row['first'] is not None for row in rows) else 'FAIL','actual':sum(row['first'] is not None for row in rows),'threshold':4}],'scope':'Real original pixel program probe; first/last is applied to candidate order, not claimed object identity, complete line fit or accepted dimension. No workspace changes.'}
`;
const request={runId:'original-pixel-python-probe',title:'原圖四側 first/last 程式探測（非驗收）',code,parameters:{bounds:target.template.bounds,searchBand:45,gradientThreshold:5},images:[{id:input.id,name:'original-camera-image',width:input.width,height:input.height,dataUrl:input.dataURL}],sourceBinding:{imageId:input.id,imageSha256:input.sha256,recipeId:project.workflow.recipe.id,recipeRevision:project.workflow.recipe.revision,scope:'read-only original image probe'},justification:{tool:{reason:'以實際原圖驗證 Python 對任意選序算法可編程，顯示所有候選及 first/last。'},parameters:[{name:'gradientThreshold',reason:'本次診斷明確選5灰階差以保留曲線候選，未宣稱最佳或工件精度。'}],boundaries:[{condition:'這只驗證候選選序可執行，不宣稱完整線擬合、物件身分或正式尺寸。'}]}};
fs.writeFileSync(path.join(directory,'request.json'),JSON.stringify(request));
const executed=spawnSync(path.join(desktop,'runtime/python/bin/python3'),[path.join(desktop,'scripts/cv-runtime.py'),'--run',path.join(directory,'request.json'),directory],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
if(executed.status!==0)throw Error(executed.stderr);
const result=JSON.parse(fs.readFileSync(path.join(directory,'result.json'),'utf8'));
if(result.status!=='SUCCEEDED')throw Error(result.traceback||JSON.stringify(result.error));
console.log(JSON.stringify({status:result.status,runDirectory:directory,inputs:result.inputs.map(i=>({id:i.id,width:i.width,height:i.height,sha256:i.sha256})),candidateOrders:result.result.candidateOrdering,artifacts:result.artifacts.map(a=>({id:a.id,path:a.path,width:a.width,height:a.height})),classification:result.result.status},null,2));
