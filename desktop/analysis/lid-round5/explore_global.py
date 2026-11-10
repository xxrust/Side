"""DRAFT: compare coherent rounded rectangles on preserved round4 edge observations.
No host result is claimed. All pixel files are hash checked against the manifest.
"""
import cv2, numpy as np, json, pathlib, math, hashlib
R=pathlib.Path(__file__).parent
P=json.load(open(R.parent/'lid-round4/parameters.json'))
old=(R.parent/'lid-round4/model.py').read_text().split("with procedure('objects'")[0]
exec(old,globals())
parameters=P

def pose_from_edges(edges,box,tag):
    # Orthogonal rigid rectangle; measured and estimated lines retain distinct weights.
    slopes=[(1 if k in SIDES[:2] else -1)*q['slope'] for k,q in edges.items() if q['kind']!='estimated']
    theta=math.atan(float(np.median(slopes)))
    C,S=math.cos(theta),math.sin(theta);rot=np.array([[C,-S],[S,C]])
    local={}; residual={}
    for k,q in edges.items():
        pts=np.array(q['points'] or linepoints(k,q['pos'],q['slope'],box))
        z=pts@rot; ax=1 if k in SIDES[:2] else 0
        local[k]=float(np.median(z[:,ax]));residual[k]=float(np.quantile(abs(z[:,ax]-local[k]),.9))
    w=local['right']-local['left'];h=local['bottom']-local['top']
    cen=np.array([(local['right']+local['left'])/2,(local['bottom']+local['top'])/2])@rot.T
    return {'cx':float(cen[0]),'cy':float(cen[1]),'w':w,'h':h,'theta':theta,'residual':residual,'r':65.}

def rotmat(m):
    c,s=math.cos(m['theta']),math.sin(m['theta']);return np.array([[c,-s],[s,c]])

def sdf(points,m):
    z=(np.asarray(points)-[m['cx'],m['cy']])@rotmat(m)
    q=abs(z)-[m['w']/2-m['r'],m['h']/2-m['r']]
    return np.linalg.norm(np.maximum(q,0),axis=1)+np.minimum(np.max(q,axis=1),0)-m['r']

def arcs(m,r,n=41):
    pts=[];ns=[];ci=[]
    for i,(sx,sy,a) in enumerate([(-1,-1,180),(1,-1,270),(1,1,0),(-1,1,90)]):
        ang=np.deg2rad(a+np.linspace(5,85,n));norm=np.stack([np.cos(ang),np.sin(ang)],axis=1)
        cen=np.array([sx*(m['w']/2-r),sy*(m['h']/2-r)])
        pts.extend((cen+norm*r)@rotmat(m).T+[m['cx'],m['cy']]);ns.extend(norm@rotmat(m).T);ci.extend([i]*n)
    return np.array(pts),np.array(ns),np.array(ci)

def fit_radius(g,m,tag,lid=None):
    trials=[]
    for r in range(40,142,2):
        pts,ns,ci=arcs(m,r);v=[]
        for d in [-6,-3,0,3,6]:
            pp=pts+ns*d;v.append(cv2.remap(g,pp[:,0].astype('float32')[None,:],pp[:,1].astype('float32')[None,:],cv2.INTER_LINEAR)[0].astype(float))
        grad=(v[0]-v[4])/12
        if tag=='lid': grad=grad*np.clip((v[0]-100)/80,0,1)
        else: grad=grad*np.clip((110-v[4])/60,0,1)
        visible=np.ones(len(pts),bool) if lid is None else sdf(pts,lid)>4
        # Per-corner normalization later prevents one bright weld dominating radius.
        per=[float(np.mean(np.clip(grad[(ci==i)&visible],0,20))) if np.sum((ci==i)&visible)>8 else None for i in range(4)]
        trials.append({'r':r,'per':per,'coverage':float(np.mean(grad[visible]>3)) if visible.any() else 0,'visible':float(visible.mean())})
    peak=[max(q['per'][i] or 0 for q in trials) for i in range(4)]
    for q in trials:
        vv=[q['per'][i]/peak[i] for i in range(4) if q['per'][i] is not None and peak[i]>2]
        q['score']=float(np.mean(vv)) if len(vv)>1 else 0
    best=max(trials,key=lambda q:q['score']);m=dict(m,r=best['r'])
    return m,trials

def run():
    M=json.load(open(R.parent/'lid-round4/development_manifest.json'))['images'];out=[]
    (R/'draft').mkdir(exist_ok=True)
    for i,record in enumerate(M):
        path=pathlib.Path('/Users/liangshiben/Desktop')/record['source_relative_path']
        assert hashlib.sha256(path.read_bytes()).hexdigest()==record['contentSha256']
        im=cv2.imread(str(path));g=cv2.GaussianBlur(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY),(0,0),1.5)
        d=json.load(open(R.parent/f'lid-round4/results/{i:02}/geometry_data.json'));box=locate(g)
        ms={tag:pose_from_edges(d['selected'][tag],box,tag) for tag in ['lid','pkg']}
        ms['lid'],lt=fit_radius(g,ms['lid'],'lid');ms['pkg'],pt=fit_radius(g,ms['pkg'],'pkg',ms['lid'])
        pts,_,_=arcs(ms['lid'],ms['lid']['r']);clear=-sdf(pts,ms['pkg'])
        ov=im.copy()
        for tag,col in [('lid',(20,240,20)),('pkg',(255,180,0))]:
            p,_,_=arcs(ms[tag],ms[tag]['r']);cv2.polylines(ov,[p.astype('int32')],True,col,1,cv2.LINE_AA)
        cv2.imwrite(str(R/f'draft/{i:02}.png'),ov)
        row={'i':i,'imageId':record['id'],'models':ms,'radiusTrials':{'lid':lt,'pkg':pt},'minClearance':float(clear.min()),'oldSkew':d['skewSupported']};out.append(row)
        print(i,[(k,round(v['w'],1),round(v['h'],1),round(v['theta']*180/math.pi,2),v['r'],round(max(v['residual'].values()),1)) for k,v in ms.items()],round(float(clear.min()),1),flush=True)
    (R/'draft/global.json').write_text(json.dumps(out,indent=2))

if __name__=='__main__':run()
