import cv2,numpy as np,json,hashlib,pathlib
root=pathlib.Path(__file__).parent
manifest=json.loads((root/'development_manifest.json').read_text())
def extract(im):
 g=cv2.GaussianBlur(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY),(0,0),1.5)
 cs,_=cv2.findContours((g>80).astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
 c=max(cs,key=cv2.contourArea);x,y,w,h=cv2.boundingRect(c);cx=x+w/2;cy=y+h/2
 sides=[]
 for side,axis,sign in [('L',0,-1),('R',0,1),('T',1,-1),('B',1,1)]:
  half=(w if axis==0 else h)/2;thalf=(h if axis==0 else w)/2;ctr=cx if axis==0 else cy;tc=cy if axis==0 else cx
  rr=np.arange(half*.65,half*1.22,.5);tt=np.linspace(tc-thalf*.55,tc+thalf*.55,61)
  profiles=[]
  for t in tt:
   xs=ctr+sign*rr if axis==0 else np.full(len(rr),t);ys=np.full(len(rr),t) if axis==0 else ctr+sign*rr
   profiles.append(cv2.remap(g,xs.astype('float32')[None,:],ys.astype('float32')[None,:],cv2.INTER_LINEAR)[0])
  profiles=np.array(profiles)
  levels=[]
  for level in [50,65,80,100,120,140,160,180,200,220]:
   pts=[]
   for t,prof in zip(tt,profiles):
    j=np.where(prof>level)[0]
    if len(j) and j[-1]<len(rr)-1:
     k=j[-1];a=(level-float(prof[k]))/(float(prof[k+1])-float(prof[k]));pts.append([t,ctr+sign*(rr[k]+a*.5)])
   pts=np.array(pts);coef=None;rms=None
   if len(pts)>30:
    keep=np.ones(len(pts),bool)
    for _ in range(4):
     if keep.sum()<20:break
     coef=np.polyfit(pts[keep,0]-tc,pts[keep,1],1);err=pts[:,1]-np.polyval(coef,pts[:,0]-tc);keep=np.abs(err)<3
    if keep.sum()>=20:
     coef=np.polyfit(pts[keep,0]-tc,pts[keep,1],1);rms=float(np.sqrt(np.mean((pts[keep,1]-np.polyval(coef,pts[keep,0]-tc))**2)))
    else:coef=None
   levels.append({'level':level,'pos':None if coef is None else float(coef[1]),'slope':None if coef is None else float(coef[0]),'rms':rms,'n':int(keep.sum()) if coef is not None else 0})
  sides.append({'side':side,'levels':levels})
 return {'bbox':[x,y,w,h],'sides':sides}
if __name__=='__main__':
 out=[]
 for m in manifest['images']:
  p=pathlib.Path('/Users/liangshiben/Desktop')/m['source_relative_path'];b=p.read_bytes();assert hashlib.sha256(b).hexdigest()==m['contentSha256']
  im=cv2.imdecode(np.frombuffer(b,np.uint8),cv2.IMREAD_COLOR);r=extract(im);r.update(id=m['id'],name=m['name']);out.append(r)
  print(m['name'],r['bbox'],[[q['pos'] and round(q['pos'],1) for q in s['levels']] for s in r['sides']])
 (root/'draft_threshold_probes.json').write_text(json.dumps(out,indent=2))
