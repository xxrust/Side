import cv2,numpy as np,json,pathlib,math

def corners(g,poly,tag):
 a=np.array(poly);out=[]
 for i,v in enumerate(a):
  pre=a[(i-1)%4];nxt=a[(i+1)%4];u=(pre-v)/np.linalg.norm(pre-v);w=(nxt-v)/np.linalg.norm(nxt-v);rows=[]
  for r in np.arange(40.,101.,2.):
   center=v+r*(u+w);pa=v+r*u;pb=v+r*w;aa=math.atan2(pa[1]-center[1],pa[0]-center[0]);bb=math.atan2(pb[1]-center[1],pb[0]-center[0]);dd=(bb-aa+math.pi)%(2*math.pi)-math.pi;ang=aa+np.linspace(.1,.9,41)*dd;norm=np.stack([np.cos(ang),np.sin(ang)],axis=1);pts=center+norm*r
   vals=[]
   for d in [-4.,-2.,0.,2.,4.]:
    p=pts+norm*d;vals.append(cv2.remap(g,p[:,0].astype('float32')[None,:],p[:,1].astype('float32')[None,:],cv2.INTER_LINEAR)[0].astype(float))
   grad=(vals[0]-vals[4])/8.;score=float(np.mean(np.maximum(grad,0)));coverage=float(np.mean(grad>3))
   rows.append({'r':r,'score':score,'coverage':coverage,'medianIntensity':float(np.median(vals[2])),'points':pts.tolist(),'normal':norm.tolist()})
  rows.sort(key=lambda r:r['score'],reverse=True);best=rows[0];out.append({'corner':i,'best':best,'range80':[min(r['r'] for r in rows if r['score']>=best['score']*.8),max(r['r'] for r in rows if r['score']>=best['score']*.8)],'trials':[{k:v for k,v in r.items() if k not in ['points','normal']} for r in rows]})
 return out
if __name__=='__main__':
 R=pathlib.Path(__file__).parent;M=json.load(open(R/'development_manifest.json'))['images']
 for i,run in [(0,'py-65f8c933a8e2e-72955-0'),(5,'py-65f8c95529a50-72955-1')]:
  im=cv2.imread(str(pathlib.Path('/Users/liangshiben/Desktop')/M[i]['source_relative_path']));g=cv2.GaussianBlur(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY),(0,0),1.5);d=json.load(open(pathlib.Path('runtime/cv-runs')/run/'outputs/geometry_data.json'))['selected'];vv=im.copy();allr={}
  for tag,col in [('lid',(0,255,0)),('pkg',(255,180,0))]:
   rows=corners(g,d[tag+'Polygon'],tag);allr[tag]=rows
   print(i,tag,[(r['corner'],r['best']['r'],round(r['best']['score'],2),r['best']['coverage'],r['range80']) for r in rows])
   for r in rows:cv2.polylines(vv,[np.array(r['best']['points'],np.int32)],False,col,2)
  cv2.imwrite(str(R/f'draft-corners-{i}.png'),vv);(R/f'draft-corners-{i}.json').write_text(json.dumps(allr,indent=2))
