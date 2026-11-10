import sys,json,pathlib,cv2,numpy as np,math
from explore_global import *

def reconstruct(g,box,joint):
    lid={k:refine(g,k,joint['lines'][k],exterior(g,k,box),box) for k in SIDES}
    ext={k:exterior(g,k,box) for k in SIDES}
    gaps={k:(lid[k]['pos']-ext[k]['pos'])*(1 if k in ['top','left'] else -1) for k in SIDES}
    visible={k:gaps[k]>parameters['quality']['minIndependentSeparationPx'] for k in SIDES}
    hs=[k for k in ['top','bottom'] if visible[k]];vs=[k for k in ['left','right'] if visible[k]]
    ah=max(hs,key=lambda k:gaps[k]) if hs else 'bottom';av=max(vs,key=lambda k:gaps[k]) if vs else 'left'
    a=(ext[ah]['slope']-ext[av]['slope'])/2;ww=parameters['pkgPrior']['width'];hh=parameters['pkgPrior']['height'];pkg={}
    for k in SIDES:
        if visible[k]:pkg[k]=dict(ext[k],kind='measured',edgeIntervalPx=3.)
    for k in ['top','bottom']:
        if k not in pkg:pkg[k]={'pos':ext[ah]['pos']+(0 if k==ah else (hh if k=='bottom' else -hh)),'slope':a,'kind':'estimated','edgeIntervalPx':11.,'points':[]}
    for k in ['left','right']:
        if k not in pkg:pkg[k]={'pos':ext[av]['pos']+(0 if k==av else (ww if k=='right' else -ww)),'slope':-a,'kind':'estimated','edgeIntervalPx':11.,'points':[]}
    for k in SIDES:
        outside=(ext[k]['pos']-pkg[k]['pos'])*(1 if k in ['top','left'] else -1)
        if hs and vs and outside < -parameters['pkgPrior']['heightTolerance'] and abs(ext[k]['pos']-lid[k]['pos'])<12:
            lid[k]=dict(ext[k],kind='measured',edgeIntervalPx=3.)
    return {'lid':lid,'pkg':pkg,'pkgAnchorValid':bool(hs and vs),'visiblePkgSides':[k for k in SIDES if visible[k]]}

def assess(g,entry,box,joint):
    ms={tag:pose_from_edges(entry[tag],box,tag) for tag in ['lid','pkg']}
    ms['lid'],lt=fit_radius(g,ms['lid'],'lid');ms['pkg'],pt=fit_radius(g,ms['pkg'],'pkg',ms['lid'])
    b={tag:max(tr,key=lambda q:q['score']) for tag,tr in [('lid',lt),('pkg',pt)]}
    score=joint['score']-((ms['lid']['w']-687)/6)**2-((ms['lid']['h']-532)/6)**2+.15*sum(np.mean([v for v in b[tag]['per'] if v is not None]) for tag in b)
    pts,_,_=arcs(ms['lid'],ms['lid']['r']);cl=-sdf(pts,ms['pkg'])
    return {'models':ms,'score':float(score),'lineScore':joint['score'],'minClearance':float(cl.min()),'radiusTrials':{'lid':lt,'pkg':pt},'independent':entry['pkgAnchorValid']}

if __name__=='__main__':
    M=json.load(open(R.parent/'lid-round4/development_manifest.json'))['images'];out=[]
    for i,record in enumerate(M):
        path=pathlib.Path('/Users/liangshiben/Desktop')/record['source_relative_path'];im=cv2.imread(str(path));g=cv2.GaussianBlur(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY),(0,0),1.5);box=locate(g)
        d=json.load(open(R.parent/f'lid-round4/results/{i:02}/geometry_data.json'));cs=[];base=reconstruct(g,box,d['selected']['joint'][0])
        for j,joint in enumerate(d['selected']['joint']):
            en=reconstruct(g,box,joint);en['pkg']=base['pkg'];en['pkgAnchorValid']=base['pkgAnchorValid'];z=assess(g,en,box,joint);z['candidate']=j;cs.append(z)
        out.append({'i':i,'candidates':cs})
        print(i,[(z['candidate'],round(z['score'],2),round(z['minClearance'],1),[z['models'][t]['r'] for t in ['lid','pkg']]) for z in sorted(cs,key=lambda z:z['score'],reverse=True)],flush=True)
    (R/'draft/candidates.json').write_text(json.dumps(out,indent=2))
