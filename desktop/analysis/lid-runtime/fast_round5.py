"""Optimize the known round-5 detector without changing the search grid or rules."""
from pathlib import Path
import ast
import copy
import sys
import json
from optimize import optimize_code, functions

SCAN_PEAKS = '''   peaks=(z[9:-9]>3)
   for shift in (-2,-1,1,2):
    peaks &= z[9:-9]>=z[9+shift:len(z)-9+shift]
   for j in np.flatnonzero(peaks)+9:
    out.append({'side':side,'pos':float(normal[j]),'slope':float(slope),'strength':float(z[j])})'''

CHOOSE = '''def choose(rows):
 P=parameters['lidPrior']
 combos=list(itertools.product(*(rows[k] for k in SIDES)))
 if not combos:return []
 angles=np.array([[t['slope'],b['slope'],-l['slope'],-r['slope']] for t,b,l,r in combos])
 spreads=angles.std(axis=1);means=angles.mean(axis=1);cand=[]
 for i,(ts,bs,ls,rs) in enumerate(combos):
  wd=rs['pos']-ls['pos'];ht=bs['pos']-ts['pos'];ad=float(spreads[i])
  score=sum(math.log(max(q['strength'],1)) for q in (ts,bs,ls,rs))-((wd-P['width'])/P['widthTolerance'])**2-((ht-P['height'])/P['heightTolerance'])**2-(ad/.015)**2
  cand.append((score,i,wd,ht,ad))
 return [{'score':score,'width':wd,'height':ht,'angleSlope':float(means[i]),'angleSpread':ad,'lines':dict(zip(SIDES,combos[i]))} for score,i,wd,ht,ad in sorted(cand,key=lambda q:q[0],reverse=True)[:5]]
'''

GRIDS = ''' angle=np.deg2rad(np.array([180,270,0,90])[:,None]+np.linspace(*A['angleRangeDeg'],A['samples'])[None,:])
 normals=np.stack([np.cos(angle),np.sin(angle)],axis=2)
 centers=(np.array([m['w']/2,m['h']/2])[None,:]-radii[:,None])[:,None,:]*np.array([[-1,-1],[1,-1],[1,1],[-1,1]])
 rotation=rotmat(m).T
 points=((centers[:,:,None,:]+normals[None,:,:,:]*radii[:,None,None,None])@rotation+[m['cx'],m['cy']]).reshape(len(radii),-1,2)
 normals=(normals@rotation).reshape(1,-1,2)'''

SUMMARY = '''def summarize_model(candidate):
    return {**candidate, 'radiusFit':{
        tag:{k:v for k,v in fit.items() if k!='trials'}
        for tag,fit in candidate['radiusFit'].items()}}
'''

def replace_once(code, old, new):
    if code.count(old) != 1:
        raise ValueError("Unexpected round-5 source: " + old[:100])
    return code.replace(old,new,1)

def accelerate(code):
    canonical=(Path(__file__).parents[1]/"lid-round5/model.py").read_text(encoding="utf-8")
    known=functions(optimize_code(canonical))
    actual=functions(code)
    for name in ("scan","choose","fit_radius","candidate_edges","exterior"):
        if ast.dump(actual[name],include_attributes=False)!=ast.dump(known[name],include_attributes=False):
            raise ValueError("Unrecognized round-5 function: "+name)
    lines=code.splitlines(keepends=True)
    n=actual["choose"]
    lines[n.lineno-1:n.end_lineno]=[CHOOSE]
    code="".join(lines)
    code=replace_once(code,
        "   for j in range(9,len(normal)-9):\n    if z[j]>=max(z[j-2:j+3]) and z[j]>3:out.append({'side':side,'pos':float(normal[j]),'slope':float(slope),'strength':float(z[j])})",
        SCAN_PEAKS)
    code=replace_once(code,
        " grids=[arcs(m,float(r)) for r in radii]\n points=np.stack([q[0] for q in grids]);normals=np.stack([q[1] for q in grids])",
        GRIDS)
    code=replace_once(code,"def candidate_edges(g,box,joint,base):","def candidate_edges(g,box,joint,base,exterior_edges):")
    code=replace_once(code,"refine(g,k,joint['lines'][k],exterior(g,k,box),box)","refine(g,k,joint['lines'][k],exterior_edges[k],box)")
    code=replace_once(code,"ext=exterior(g,k,box);outside=","ext=exterior_edges[k];outside=")
    code=replace_once(code,
        "rows=scan(gg,box);joint=choose(rows);lid={k:refine(gg,k,joint[0]['lines'][k],exterior(gg,k,box),box) for k in SIDES};ext={k:exterior(gg,k,box) for k in SIDES}",
        "rows=scan(gg,box);joint=choose(rows);ext={k:exterior(gg,k,box) for k in SIDES};lid={k:refine(gg,k,joint[0]['lines'][k],ext[k],box) for k in SIDES};edge_cache[sigma]=ext")
    code=replace_once(code,"   alltrials=[];selected=None","   alltrials=[];selected=None;edge_cache={}")
    code=replace_once(code,"candidate_edges(gg,box,joint,base)","candidate_edges(gg,box,joint,base,edge_cache[base['sigma']])")
    code=replace_once(code,"def plot_radii(best):",SUMMARY+"\ndef plot_radii(best):")
    start=code.index("   mv=image.copy()")
    end=code.index("  with step('relation'",start)
    debug=code[start:end].rstrip().splitlines()
    code=code[:start]+"""   if globals().get('capture_stage_diagnostics',True):
"""+''.join(" "+line+"\n" for line in debug)+"""   else:
    modeldata={'selected':summarize_model(best),'candidates':[summarize_model(q) for q in candidates],
               'scope':'Inspection summary. All candidates and radii were evaluated; per-radius profiles can be generated with stage diagnostics.'}
    save_json('model_data',modeldata)
    st.set_output('model_data',{'artifactId':'model_data','candidateCount':len(candidates),'selectedCandidate':best['candidateIndex']})
"""+code[end:]
    compile(code,"fast-round5","exec")
    return code

def optimize_scheme(scheme):
    scheme=copy.deepcopy(scheme)
    node,=[n for n in scheme["operatorGraph"]["nodes"] if n["id"]=="objects"]
    node["code"]=accelerate(node["code"])
    scheme["version"]=scheme.get("version",1)+1
    scheme.pop("fingerprints",None)
    return scheme

if __name__=="__main__":
    source,destination=map(Path,sys.argv[1:])
    data=json.loads(source.read_text(encoding="utf-8"))
    data["scheme"]=optimize_scheme(data["scheme"])
    with destination.open("x",encoding="utf-8") as output:
        json.dump(data,output,ensure_ascii=False)
