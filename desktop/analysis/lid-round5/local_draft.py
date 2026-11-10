"""Local exploratory regression only; final host scheme execution is separate."""
import json,pathlib,hashlib,cv2,sys
R=pathlib.Path(__file__).parent
class Trace:
 def __init__(self,*a,**kw):pass
 def __enter__(self):return self
 def __exit__(self,*a):pass
 def set_output(self,*a):pass
 def set_judgement(self,*a):pass
M=json.load(open(R.parent/'lid-round4/development_manifest.json'))['images'];out=[]
for i,m in enumerate(M):
 if len(sys.argv)>1 and i not in [int(x) for x in sys.argv[1:]]:continue
 path=pathlib.Path('/Users/liangshiben/Desktop')/m['source_relative_path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==m['contentSha256'];image=cv2.imread(str(path));dest=R/f'draft/full/{i:02}';dest.mkdir(parents=True,exist_ok=True)
 def si(k,a,**kw):cv2.imwrite(str(dest/(k+'.png')),a)
 def sj(k,a,**kw):(dest/(k+'.json')).write_text(json.dumps(a,ensure_ascii=False,indent=2))
 env=dict(image=image,image_records=[{'id':m['id']}],parameters=json.load(open(R/'parameters.json')),procedure=Trace,step=Trace,save_image=si,save_json=sj,save_layers=lambda *a:None)
 exec((R/'model.py').read_text(),env);d=env['result'];out.append({'i':i,'imageId':m['id'],'result':d})
 print(i,d['classificationHint'],d['modelQuality'],d['modelClearance'],flush=True)
(R/'draft/local_full_results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
