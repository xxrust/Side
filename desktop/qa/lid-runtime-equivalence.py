"""Independent numerical checks for the explicit round-5 optimization copy."""
from pathlib import Path
import ast, importlib.util, math, unittest
import cv2, numpy as np
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('optimize',root/'analysis/lid-runtime/optimize.py')
optimize=importlib.util.module_from_spec(spec);spec.loader.exec_module(optimize)
code=(root/'analysis/lid-round5/model.py').read_text(encoding='utf-8')
import json
parameters=json.loads((root/'analysis/lid-round5/parameters.json').read_text(encoding='utf-8'))
def load(source):
 tree=ast.parse(source);tree.body=[n for n in tree.body if isinstance(n,ast.FunctionDef)]
 ns={'np':np,'cv2':cv2,'math':math,'parameters':parameters,'SIDES':['top','bottom','left','right']}
 exec(compile(tree,'functions-only','exec'),ns);return ns
before,after=load(code),load(optimize.optimize_code(code))
def compare(a,b):
 if isinstance(a,dict):
  assert a.keys()==b.keys()
  for k in a:compare(a[k],b[k])
 elif isinstance(a,list):
  assert len(a)==len(b)
  for x,y in zip(a,b):compare(x,y)
 elif isinstance(a,(int,float)) and not isinstance(a,bool):np.testing.assert_allclose(a,b,rtol=1e-12,atol=1e-12)
 else:assert a==b,(a,b)
class Equivalence(unittest.TestCase):
 def test_complete_arc_grids_and_corner_order(self):
  rng=np.random.default_rng(7711)
  for _ in range(30):
   m=dict(cx=rng.uniform(100,900),cy=rng.uniform(100,700),w=rng.uniform(500,750),h=rng.uniform(400,600),theta=rng.uniform(-.2,.2),r=60.)
   for full in (False,True):
    for radius in (40.,78.,140.):
     a=before['arcs'](m,radius,full);b=after['arcs'](m,radius,full)
     for x,y in zip(a,b):np.testing.assert_allclose(x,y,rtol=1e-12,atol=1e-12)
 def test_all_radius_candidates_scores_profiles_and_selected_radii(self):
  y,x=np.indices((800,1000));g=np.clip(200-(np.hypot((x-500)/1.3,y-400)-230)*15,0,255).astype('uint8')
  m=dict(cx=500.,cy=400.,w=687.,h=532.,theta=.012,r=65.)
  for tag,lid in [('lid',None),('pkg',dict(m,w=670.,h=510.))]:
   a=before['fit_radius'](g,m,tag,lid);b=after['fit_radius'](g,m,tag,lid)
   compare(a[0],b[0]);compare(a[1],b[1]);self.assertEqual(len(b[1]['trials']),51)
 def test_no_measured_pose_fails_before_radius_search(self):
  edges={k:{'pos':i*100.,'slope':0.,'kind':'estimated','points':[]} for i,k in enumerate(['top','bottom','left','right'])}
  with self.assertRaisesRegex(ValueError,'INSUFFICIENT_MEASURED_EDGES: lid'):
   after['pose_from_edges'](edges,[0,0,1000,800],'lid')
if __name__=='__main__':unittest.main()
