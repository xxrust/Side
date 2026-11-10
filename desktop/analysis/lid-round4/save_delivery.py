from pathlib import Path
import json,shutil,hashlib,math,numpy as np
R=Path(__file__).parent
runs=json.load(open(R/'final_runs.json'));man=json.load(open(R/'development_manifest.json'))['images'];batch=json.load(open(R/'host_execution.json'))
rows=[]
for i,(r,m) in enumerate(zip(runs,man)):
 d=R/'results'/f'{i:02d}';d.mkdir(parents=True,exist_ok=True)
 for a in r['artifacts']:
  if a['id'] in ['overlay','geometry','geometry_data'] or i in [0,5]:
   ref=a['assetRef'];src=Path(ref['root'])/ref['$asset'];b=src.read_bytes();assert hashlib.sha256(b).hexdigest()==ref['sha256'];shutil.copyfile(src,d/a['name'])
 if i in [0,5]:
  src=Path('/Users/liangshiben/Desktop')/m['source_relative_path'];bb=src.read_bytes();assert hashlib.sha256(bb).hexdigest()==m['contentSha256'];shutil.copyfile(src,d/'original.bmp')
 dat=json.load(open(d/'geometry_data.json'));ss=dat['selected'];edge={}
 for tag in ['lid','pkg']:
  edge[tag]={}
  for k,q in ss[tag].items():
   hz=k in ['top','bottom'];pts=np.array(q['points']);res=None
   if len(pts):
    # midpoint in original search box
    srca=next(a for a in r['artifacts'] if a['id']=='search_data')['assetRef'];box=json.load(open(Path(srca['root'])/srca['$asset']))['bbox'];mid=box[0]+box[2]/2 if hz else box[1]+box[3]/2
    t=pts[:,0] if hz else pts[:,1];v=pts[:,1] if hz else pts[:,0];err=v-(q['pos']+q['slope']*(t-mid));res={'rmsPx':float(np.sqrt(np.mean(err**2))),'p95AbsPx':float(np.percentile(abs(err),95)),'n':len(pts)}
   edge[tag][k]={kk:vv for kk,vv in q.items() if kk!='points'};edge[tag][k]['supportResidual']=res
 unknown=[]
 for k,b in dat['clearance'].items():
  if b['low']<=0<=b['high']:unknown.append(k+' clearance crosses zero')
 for tag in ['lid','pkg']:
  for k,q in edge[tag].items():
   if q['kind']=='estimated':unknown.append(tag+' '+k+' unresolved/estimated')
 if not dat['cornerStable']:unknown.append('corner radius has competing peaks or low coverage')
 rows.append({'i':i,'name':m['name'],'imageId':m['id'],'contentSha256':m['contentSha256'],'runId':r['runId'],'recordRef':batch['units'][i]['recordRef'],'category':batch['units'][i]['categoryId'],'expected':batch['units'][i]['expectedClassification'],'evidenceReady':batch['units'][i]['evidenceReady'],'edges':edge,'clearance':dat['clearance'],'corners':{tag:[{'corner':q['corner'],'radius':q['best']['r'],'range80':q['range80'],'score':q['best']['score'],'coverage':q['best']['coverage']} for q in dat['corners'][tag]] for tag in ['lid','pkg']},'unknownReasons':unknown,'artifacts':{'overlay':str(d/'overlay.png'),'geometry':str(d/'geometry.json'),'data':str(d/'geometry_data.json')}})
(R/'verified_rows.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
for i in [0,5]:
 print(i,rows[i]['name'],'clearance',rows[i]['clearance'])
 print('edges',[(tag,k,round(v['pos'],2),v['kind'],v['supportResidual']) for tag,obj in rows[i]['edges'].items() for k,v in obj.items()])
print('pkg measured dimensions only')
for rr in rows[4:]:
 p=rr['edges']['pkg'];ww=p['right']['pos']-p['left']['pos'] if all(p[k]['kind']=='measured' for k in ['left','right']) else None;hh=p['bottom']['pos']-p['top']['pos'] if all(p[k]['kind']=='measured' for k in ['top','bottom']) else None;print(rr['name'],ww,hh)
print('saved',len(rows),'rows')
