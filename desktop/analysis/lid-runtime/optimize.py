"""Prepare a separate copy of the known round-5 scheme; never mutate user projects.

Only replace verified function bodies. Thresholds, candidate counts, radius grid
and classification rules remain those of the source scheme.
"""
from pathlib import Path
import ast, copy, json, sys

ARCS = '''def arcs(m,r,full=False):
 A=parameters['radiusModel'];rr=[0,90] if full else A['angleRangeDeg']
 angle=np.deg2rad(np.array([180,270,0,90])[:,None]+np.linspace(rr[0],rr[1],A['samples'])[None,:])
 normals=np.stack([np.cos(angle),np.sin(angle)],axis=2)
 centers=np.array([[-1,-1],[1,-1],[1,1],[-1,1]])*np.array([m['w']/2-r,m['h']/2-r])
 rotation=rotmat(m).T
 points=((centers[:,None,:]+normals*r)@rotation+[m['cx'],m['cy']]).reshape(-1,2)
 return points,(normals@rotation).reshape(-1,2),np.repeat(np.arange(4),A['samples'])
'''

FIT = '''def fit_radius(g,m,tag,lid=None):
 A=parameters['radiusModel'];trials=[]
 radii=np.arange(A['radiusRange'][0],A['radiusRange'][1]+.1,A['radiusStep'])
 grids=[arcs(m,float(r)) for r in radii]
 points=np.stack([q[0] for q in grids]);normals=np.stack([q[1] for q in grids])
 vv=[]
 for d in A['normalOffsets']:
  pp=points+normals*d
  vv.append(cv2.remap(g,pp[:,:,0].astype('float32'),pp[:,:,1].astype('float32'),cv2.INTER_LINEAR).astype(float))
 raw=(vv[0]-vv[-1])/(A['normalOffsets'][-1]-A['normalOffsets'][0]);grad=raw.copy()
 if tag=='lid':grad*=np.clip((vv[0]-A['lidBrightFloor'])/A['lidBrightScale'],0,1)
 else:grad*=np.clip((A['pkgDarkCeiling']-vv[-1])/A['pkgDarkScale'],0,1)
 visible=np.ones(points.shape[:2],bool) if lid is None else (sdf(points.reshape(-1,2),lid)>A['independentArcDistancePx']).reshape(points.shape[:2])
 shape=(len(radii),4,A['samples']);mask=visible.reshape(shape);counts=mask.sum(axis=2);supported=counts>=A['minVisibleSamples']
 def corner_means(values):
  total=np.where(mask,values.reshape(shape),0).sum(axis=2)
  return np.divide(total,counts,out=np.zeros_like(total),where=counts>0)
 per=corner_means(np.clip(grad,0,A['gradientClip']))
 rawper=corner_means(np.clip(raw,0,A['gradientClip']))
 coverage=corner_means((grad>A['gradientMin']).astype(float))
 profiles=np.stack(vv).reshape(len(vv),*shape).mean(axis=3).transpose(1,2,0)
 for j,r in enumerate(radii):
  values=lambda a:[float(a[j,i]) if supported[j,i] else None for i in range(4)]
  trials.append({'r':float(r),'perCornerScore':values(per),'rawPerCornerScore':values(rawper),'perCornerCoverage':values(coverage),'profiles':profiles[j].tolist(),'visibleFraction':float(visible[j].mean())})
'''

def functions(code):
 return {n.name:n for n in ast.parse(code).body if isinstance(n,ast.FunctionDef)}

def optimize_code(code):
 canonical=(Path(__file__).parents[1]/'lid-round5/model.py').read_text(encoding='utf-8')
 original,known=functions(code),functions(canonical)
 for name in ('arcs','fit_radius','pose_from_edges'):
  if ast.dump(original[name],include_attributes=False)!=ast.dump(known[name],include_attributes=False):
   raise ValueError('Unrecognized round-5 function; refusing to modify '+name)
 lines=code.splitlines(keepends=True)
 changes={ 'arcs':ARCS }
 pose=''.join(lines[original['pose_from_edges'].lineno-1:original['pose_from_edges'].end_lineno])
 marker=" theta=math.atan(float(np.median(slopes)));"
 assert pose.count(marker)==1
 pose=pose.replace(marker," if not slopes or not np.isfinite(slopes).all():\n  raise ValueError('INSUFFICIENT_MEASURED_EDGES: '+tag+' has no finite measured edge; pose and containment cannot be established')\n"+marker)
 changes['pose_from_edges']=pose
 fit=''.join(lines[original['fit_radius'].lineno-1:original['fit_radius'].end_lineno])
 changes['fit_radius']=FIT+fit[fit.index(" for field,out in "):]
 for name in sorted(changes,key=lambda n:original[n].lineno,reverse=True):
  n=original[name];lines[n.lineno-1:n.end_lineno]=[changes[name].rstrip()+'\n']
 result=''.join(lines);compile(result,'optimized-round5','exec');return result

def optimize_scheme(scheme):
 scheme=copy.deepcopy(scheme)
 nodes=[n for n in scheme['operatorGraph']['nodes'] if n['id']=='objects']
 if len(nodes)!=1:raise ValueError('Expected one objects node')
 node=nodes[0];node['code']=optimize_code(node['code'])
 scheme['version']=scheme.get('version',1)+1
 scheme.pop('fingerprints',None)
 return scheme

if __name__=='__main__':
 source,destination=map(Path,sys.argv[1:])
 if destination.exists():raise ValueError('Refusing to replace existing output')
 data=json.loads(source.read_text(encoding='utf-8'))
 data['scheme']=optimize_scheme(data['scheme'])
 destination.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
