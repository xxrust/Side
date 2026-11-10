import cv2,numpy as np,json,pathlib

def locate(g):
 c=max(cv2.findContours((cv2.GaussianBlur(g,(0,0),1.5)>65).astype('uint8'),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)[0],key=cv2.contourArea)
 return list(cv2.boundingRect(c))

def scan(g,box):
 x,y,w,h=box;cx=x+w/2;cy=y+h/2;rows={};curves={}
 for side in ['top','bottom','left','right']:
  horizontal=side in ['top','bottom'];base=(y if side=='top' else y+h) if horizontal else (x if side=='left' else x+w)
  normal=np.arange(int(base)-70,int(base)+70);tang=np.linspace((x+.22*w) if horizontal else (y+.22*h),(x+.78*w) if horizontal else (y+.78*h),121).astype(np.float32);mid=cx if horizontal else cy
  out=[]
  for slope in np.arange(-.06,.0601,.002):
   n=normal[None,:]+slope*(tang[:,None]-mid);t=np.broadcast_to(tang[:,None],n.shape)
   vals=cv2.remap(g,(t if horizontal else n).astype('float32'),(n if horizontal else t).astype('float32'),cv2.INTER_LINEAR)
   p=np.mean(vals,axis=0);grad=np.gradient(p);sgn=1 if side in ['top','left'] else -1
   # all gradient local maxima and minima; last physical decision done jointly
   for kind,z in [('rise',sgn*grad),('valley',-p)]:
    for j in range(9,len(normal)-9):
     if z[j]>=max(z[j-2:j+3]) and ((kind=='rise' and z[j]>3) or (kind=='valley' and p[j]<170 and min(max(p[j-8:j]),max(p[j+1:j+9]))-p[j]>6)):
      out.append({'side':side,'kind':kind,'pos':float(normal[j]),'slope':float(slope),'strength':float(z[j]) if kind=='rise' else float(min(max(p[j-8:j]),max(p[j+1:j+9]))-p[j]),'intensity':float(p[j])})
  out.sort(key=lambda q:q['strength'],reverse=True);selected=[]
  for q in out:
   if all(abs(q['pos']-r['pos'])>4 or q['kind']!=r['kind'] for r in selected):selected.append(q)
  rows[side]=selected[:10]
 return rows
if __name__=='__main__':
 R=pathlib.Path(__file__).parent;M=json.load(open(R/'development_manifest.json'))['images']
 allrows=[]
 for i in [0,5]:
  im=cv2.imread(str(pathlib.Path('/Users/liangshiben/Desktop')/M[i]['source_relative_path']));g=cv2.GaussianBlur(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY),(0,0),1.5);box=locate(g);r=scan(g,box);allrows.append({'i':i,'bbox':box,'candidates':r});print(i,json.dumps(r))
 (R/'draft_candidates.json').write_text(json.dumps(allrows,indent=2))
