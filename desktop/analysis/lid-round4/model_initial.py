import cv2,numpy as np,itertools,math
SIDES=['top','bottom','left','right']

def sel(d,v,c):return {'kind':'artifact','type':'evidence','id':d,'visuals':[{'id':v,'caption':c}]}
def why(reason,groups,data='geometry_data',vis='overlay'):
 return {'tool':{'reason':reason,'expectedEvidence':[sel(data,vis,'實線為有像素支持的邊段；虛線為外推或尺寸先驗補出的邊及圓角。')]},'parameters':[{'name':k,'source':'agent-proposal','reason':REASONS[k],'verification':sel(data,'profiles' if data=='geometry_data' else vis,'保存實算剖面/候選分數；未比較的設定不是最優值。')} for k in groups],'boundaries':[{'condition':'各物體必須有獨立支持；同一焊道峰不證明第二物體；隱藏邊依尺寸先驗，無獨立精度真值。','check':sel(data,'uncertainty' if data=='geometry_data' else vis,'線位變動與模型殘差；未知不可當GOOD。'),'onFailure':'UNKNOWN'}]}
REASONS={
 'search':'65灰階、sigma1.5、最大連通面積為本批暗夾具定位的開發設定；只定搜尋框不授予物體身份。',
 'scan':'中央56%直邊，121採樣點，方向掃描±0.06斜率/0.002步長，±70px法向範圍。比較sigma1/1.5/2.5；不把平滑穩定當絕對精度。',
 'lidPrior':'梯度邊框預期寬683±10、高529±12px，來自標註圖與11_15的局部像素試算；用以排除同焊道內峰及錯混pkg下沿，非分類比例或人工尺寸規格。',
 'pkgPrior':'11_15的四側最外80灰階支持給約708x550px；暫用寬708±8、高550±8。尺寸先驗只能推估遮住的邊，不能叫實測。',
 'quality':'線段支持殘差與參數位移另存；3px邊定位、8px尺寸不確定是開發敏感範圍，非校準誤差保證。完整GOOD須額外通過兩物體/圓角證據檢查。'}

def locate(g):
 cs=cv2.findContours((g>parameters['search']['seedLevel']).astype('uint8'),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)[0]
 if not cs:return None
 c=max(cs,key=cv2.contourArea);return list(cv2.boundingRect(c))

def scan(g,box):
 x,y,w,h=box;cx=x+w/2;cy=y+h/2;rows={}
 for side in SIDES:
  hz=side in SIDES[:2];base=(y if side=='top' else y+h) if hz else (x if side=='left' else x+w)
  normal=np.arange(int(base)-parameters['scan']['normalRange'],int(base)+parameters['scan']['normalRange']);tang=np.linspace((x+.22*w) if hz else (y+.22*h),(x+.78*w) if hz else (y+.78*h),121).astype(np.float32);mid=cx if hz else cy;out=[]
  for slope in np.arange(-.06,.0601,.002):
   n=normal[None,:]+slope*(tang[:,None]-mid);t=np.broadcast_to(tang[:,None],n.shape)
   vals=cv2.remap(g,(t if hz else n).astype('float32'),(n if hz else t).astype('float32'),cv2.INTER_LINEAR)
   p=np.mean(vals,axis=0);grad=np.gradient(p);z=(1 if side in ['top','left'] else -1)*grad
   for j in range(9,len(normal)-9):
    if z[j]>=max(z[j-2:j+3]) and z[j]>3:out.append({'side':side,'pos':float(normal[j]),'slope':float(slope),'strength':float(z[j])})
  out.sort(key=lambda q:q['strength'],reverse=True);rr=[]
  for q in out:
   if all(abs(q['pos']-r['pos'])>4 for r in rr):rr.append(q)
  rows[side]=rr[:7]
 return rows

def choose(rows):
 cand=[];P=parameters['lidPrior']
 for ts,bs,ls,rs in itertools.product(*(rows[k] for k in SIDES)):
  wd=rs['pos']-ls['pos'];ht=bs['pos']-ts['pos'];aa=np.array([ts['slope'],bs['slope'],-ls['slope'],-rs['slope']]);ad=float(np.std(aa));score=sum(math.log(max(q['strength'],1)) for q in [ts,bs,ls,rs])-((wd-P['width'])/P['widthTolerance'])**2-((ht-P['height'])/P['heightTolerance'])**2-(ad/.015)**2
  cand.append({'score':score,'width':wd,'height':ht,'angleSlope':float(np.mean(aa)),'angleSpread':ad,'lines':dict(zip(SIDES,[ts,bs,ls,rs]))})
 return sorted(cand,key=lambda q:q['score'],reverse=True)[:5]

def linepoints(side,pos,slope,box):
 x,y,w,h=box;hz=side in SIDES[:2];mid=x+w/2 if hz else y+h/2;a=x+.22*w if hz else y+.22*h;b=x+.78*w if hz else y+.78*h
 return [[float(t),float(pos+slope*(t-mid))] if hz else [float(pos+slope*(t-mid)),float(t)] for t in [a,b]]
def sample(g,side,pos,slope,box,normalRadius=18):
 x,y,w,h=box;hz=side in SIDES[:2];mid=x+w/2 if hz else y+h/2;tang=np.linspace(x+.22*w if hz else y+.22*h,x+.78*w if hz else y+.78*h,121).astype('float32');n=np.arange(math.floor(pos-normalRadius),math.ceil(pos+normalRadius)+1,dtype='float32');nn=n[None,:]+slope*(tang[:,None]-mid);tt=np.broadcast_to(tang[:,None],nn.shape);v=cv2.remap(g,(tt if hz else nn).astype('float32'),(nn if hz else tt).astype('float32'),cv2.INTER_LINEAR)
 return n,np.mean(v,axis=0),tang,v

def exterior(g,side,box):
 x,y,w,h=box;hz=side in SIDES[:2];base=(y if side=='top' else y+h) if hz else (x if side=='left' else x+w);n,p,t,v=sample(g,side,base,0,box,70);out=[]
 for ti,a in zip(t,v):
  ids=np.where(a>80)[0]
  if len(ids):
   j=ids[0] if side in ['top','left'] else ids[-1];out.append([float(ti),float(n[j])])
 a=np.array(out);coef=np.polyfit(a[:,0],a[:,1],1)
 for _ in range(3):
  err=a[:,1]-np.polyval(coef,a[:,0]);keep=abs(err)<max(2.,3*np.median(abs(err)));coef=np.polyfit(a[keep,0],a[keep,1],1)
 mid=x+w/2 if hz else y+h/2;return {'pos':float(np.polyval(coef,mid)),'slope':float(coef[0]),'rms':float(np.sqrt(np.mean((a[keep,1]-np.polyval(coef,a[keep,0]))**2))),'coverage':float(keep.mean()),'points':[[float(t),float(v)] if hz else [float(v),float(t)] for t,v in a[keep]]}

def refine(g,side,line,ext,box):
 sign=-1 if side in ['top','left'] else 1;n,p,t,v=sample(g,side,line['pos'],line['slope'],box,18);offset=(n-line['pos'])*sign
 # When original gradient coincides with exterior, use actual low-level outer boundary.
 if abs(ext['pos']-line['pos'])<5:
  return dict(ext,kind='measured',method='metal/background crossing at 80',edgeIntervalPx=3.,points=ext['points'])
 # dark separator outward of selected weld slope; do not assign other peaks as pkg
 cand=[j for j in range(2,len(n)-2) if 1<=offset[j]<=9 and p[j]<=min(p[j-2:j+3])]
 if cand:
  j=min(cand,key=lambda j:p[j]);strength=min(max(p[max(0,j-7):j]),max(p[j+1:j+8]))-p[j]
  if strength>=6:
   pp=[]
   for ti,vv in zip(t,v):
    k0=max(1,j-3);k1=min(len(n)-1,j+4);jj=k0+int(np.argmin(vv[k0:k1]));pp.append([float(ti),float(n[jj]+line['slope']*(ti-(box[0]+box[2]/2 if side in SIDES[:2] else box[1]+box[3]/2)))])
   if side not in SIDES[:2]:pp=[[b,a] for a,b in pp]
   return {'pos':float(n[j]),'slope':line['slope'],'kind':'measured-separator','method':'dark seam adjacent to selected lid rim; geometry consistency required','edgeIntervalPx':3.,'separatorContrast':float(strength),'points':pp}
 return dict(line,pos=line['pos']+sign*3,kind='estimated',method='no resolved separator; provisional 3px outward from weld gradient',edgeIntervalPx=6.,points=[])

def drawseg(im,pts,col,dash=False,width=2):
 a,b=np.array(pts[0]),np.array(pts[1]);N=max(2,int(np.linalg.norm(b-a)/8))
 if not dash:cv2.line(im,tuple(np.rint(a).astype(int)),tuple(np.rint(b).astype(int)),col,width,cv2.LINE_AA)
 else:
  for j in range(0,N,2):
   p=a+(b-a)*j/N;q=a+(b-a)*min(j+1,N)/N;cv2.line(im,tuple(np.rint(p).astype(int)),tuple(np.rint(q).astype(int)),col,width)
def polygon(lines,box):
 x,y,w,h=box;cx=x+w/2;cy=y+h/2
 def intersect(a,b):
  # y=ma(x-cx)+pa, x=mb(y-cy)+pb
  ma=lines[a]['slope'];mb=lines[b]['slope'];pa=lines[a]['pos']-ma*cx;pb=lines[b]['pos']-mb*cy;xx=(mb*pa+pb)/(1-mb*ma);return [float(xx),float(ma*xx+pa)]
 return [intersect('top','left'),intersect('top','right'),intersect('bottom','right'),intersect('bottom','left')]
def rounded(poly,r=65):
 a=np.array(poly);o=[]
 for i,v in enumerate(a):
  pre=a[(i-1)%4];nxt=a[(i+1)%4];u=(pre-v)/np.linalg.norm(pre-v);w=(nxt-v)/np.linalg.norm(nxt-v);center=v+r*(u+w);pa=v+r*u;pb=v+r*w
  aa=math.atan2(pa[1]-center[1],pa[0]-center[0]);bb=math.atan2(pb[1]-center[1],pb[0]-center[0]);dd=(bb-aa+math.pi)%(2*math.pi)-math.pi
  for t in np.linspace(0,1,20):o.append((center+r*np.array([math.cos(aa+t*dd),math.sin(aa+t*dd)])).tolist())
 return o

def plots(g,box,lid,pkg,scanrows):
 im=np.full((820,1200,3),255,np.uint8);data={}
 for k,side in enumerate(SIDES):
  ox=60+(k%2)*600;oy=40+(k//2)*400;n,p,t,v=sample(g,side,lid[side]['pos'],lid[side]['slope'],box,60);data[side]={'normal':n.tolist(),'mean':p.tolist(),'lid':lid[side]['pos'],'pkg':pkg[side]['pos']}
  cv2.putText(im,side+' normal position (px)',(ox,oy),0,.6,(0,0,0),1)
  for z in [0,80,160,240]:
   yy=oy+330-int(z);cv2.line(im,(ox,yy),(ox+480,yy),(220,220,220),1);cv2.putText(im,str(z),(ox-40,yy),0,.4,(40,40,40),1)
  xy=np.array([[ox+(a-n[0])*4,oy+330-b] for a,b in zip(n,p)],np.int32);cv2.polylines(im,[xy],False,(30,30,30),2)
  for obj,col in [(lid,(20,170,20)),(pkg,(230,140,0))]:
   xx=int(ox+(obj[side]['pos']-n[0])*4);cv2.line(im,(xx,oy+50),(xx,oy+340),col,2)
  for a in n[::20]:cv2.putText(im,str(round(float(a))),(int(ox+(a-n[0])*4)-12,oy+360),0,.4,(0,0,0),1)
 return im,data

with procedure('objects',name='兩層邊界',inputs={'image':image_records[0]['id']},outputs={'geometry_data':'geometry_data','overlay':'overlay'},parameters=parameters,justification=why('從原圖分開lid焊接外緣與pkg外露外緣，尺寸只補遮擋部分，並保留未成立的身份。',list(parameters))) as pr:
 with step('search',name='工件搜尋',parameters={'search':parameters['search']},inputs={'image':image_records[0]['id']},outputs={'search_data':'search_data'},justification=why('暗背景上的最大金屬連通支持只限定搜尋域，不能命名為pkg。',['search'],'search_data','search_view')) as st:
  g0=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY);g=cv2.GaussianBlur(g0,(0,0),parameters['search']['sigma']);box=locate(g);sv=image.copy()
  if box is not None:x,y,w,h=box;cv2.rectangle(sv,(x,y),(x+w,y+h),(0,200,255),1)
  save_image('search_view',sv);save_json('search_data',{'bbox':box});st.set_output('bbox',box)
 with step('edges',name='邊緣歸屬',depends_on=['search'],inputs={'bbox':'search_data'},outputs={'geometry_data':'geometry_data','overlay':'overlay'},parameters={k:v for k,v in parameters.items() if k!='search'},justification=why('先找多個連續梯度線，聯合四邊方向及lid尺寸排除內部焊道峰；再用暗縫或金屬/背景交界定位。pkg以可見外露邊加獨立尺寸先驗完成。',['scan','lidPrior','pkgPrior','quality'])) as st:
  alltrials=[];selected=None
  for sigma in parameters['scan']['sigmas']:
   gg=cv2.GaussianBlur(g0,(0,0),sigma);rows=scan(gg,box);joint=choose(rows);lid={k:refine(gg,k,joint[0]['lines'][k],exterior(gg,k,box),box) for k in SIDES};ext={k:exterior(gg,k,box) for k in SIDES}
   # pkg independent left+bottom revealed bands. Visibility evaluated by separation from lid.
   a=(ext['bottom']['slope']-ext['left']['slope'])/2;ww=parameters['pkgPrior']['width'];hh=parameters['pkgPrior']['height'];pkg={}
   for k in ['left','bottom']:pkg[k]=dict(ext[k],kind='measured',method='exposed pkg to background',edgeIntervalPx=3.)
   pkg['top']={'pos':pkg['bottom']['pos']-hh,'slope':a,'kind':'estimated','method':'pkg bottom plus good-image height prior','edgeIntervalPx':11.,'points':[]}
   pkg['right']={'pos':pkg['left']['pos']+ww,'slope':-a,'kind':'estimated','method':'pkg left plus good-image width prior','edgeIntervalPx':11.,'points':[]}
   # If observed exterior agrees with independent prediction and is separated from lid, retain measured side.
   for k in ['top','right']:
    separation=(lid[k]['pos']-ext[k]['pos'])*(1 if k=='top' else -1)
    if abs(ext[k]['pos']-pkg[k]['pos'])<=parameters['pkgPrior']['heightTolerance'] and separation>=4:
     pkg[k]=dict(ext[k],kind='measured',method='outer edge agrees with independent pkg size and separate lid edge',edgeIntervalPx=3.)
   pp=polygon(pkg,box);lp=polygon(lid,box);lc=rounded(lp,parameters['quality']['cornerRadius']);pc=rounded(pp,parameters['quality']['cornerRadius'])
   # Signed straight-side clearance at rounded lid model points, positive inside.
   margins={}
   for k in SIDES:
    hz=k in SIDES[:2];q=pkg[k];xy=np.array(lc);mid=box[0]+box[2]/2 if hz else box[1]+box[3]/2;normal=xy[:,1] if hz else xy[:,0];tan=xy[:,0] if hz else xy[:,1];dd=(normal-(q['pos']+q['slope']*(tan-mid)))*(1 if k in ['top','left'] else -1)/math.sqrt(1+q['slope']**2);margins[k]=float(dd.min())
   entry={'sigma':sigma,'joint':joint,'lid':lid,'pkg':pkg,'margins':margins,'lidPolygon':lp,'pkgPolygon':pp,'lidCurve':lc,'pkgCurve':pc,'candidateLines':rows};alltrials.append(entry)
   if sigma==parameters['search']['sigma']:selected=entry
  lid=selected['lid'];pkg=selected['pkg'];ov=image.copy();objects=[]
  for obj,col,tag in [(lid,(20,240,20),'lid'),(pkg,(255,180,0),'pkg')]:
   poly=selected[tag+'Curve'];
   for j in range(len(poly)):drawseg(ov,[poly[j],poly[(j+1)%len(poly)]],col,True,1)
   for k in SIDES:
    q=obj[k];pts=linepoints(k,q['pos'],q['slope'],box);drawseg(ov,pts,col,q['kind']=='estimated',3)
    objects.append({'id':tag+'-'+k,'type':'line','label':tag+' '+k+' '+q['kind']+'; '+q['method'],'geometry':{'points':[{'x':a,'y':b} for a,b in pts]},'evidenceKind':q['kind']})
    if q['points']:objects.append({'id':tag+'-'+k+'-support','type':'polyline','label':'實測支持點，非手繪GT','geometry':{'points':[{'x':a,'y':b} for a,b in q['points']]}})
   objects.append({'id':tag+'-model','type':'polyline','label':tag+' 圓角模型（推估，radius未獨立辨識）','geometry':{'points':[{'x':a,'y':b} for a,b in poly+[poly[0]]]}})
  bounds={k:{'nominal':selected['margins'][k],'low':min(q['margins'][k]-q['pkg'][k]['edgeIntervalPx']-q['lid'][k]['edgeIntervalPx'] for q in alltrials),'high':max(q['margins'][k]+q['pkg'][k]['edgeIntervalPx']+q['lid'][k]['edgeIntervalPx'] for q in alltrials)} for k in SIDES}
  independent=all((lid[k]['pos']-pkg[k]['pos'])*(1 if k=='left' else -1)>4 for k in ['left','bottom'])
  skew=independent and any(v['high']<0 for v in bounds.values());full=False # corner/physical calibration not established by side fit alone
  checks=[{'id':'independent_pkg_support','status':'PASS' if independent else 'FAIL','actual':{k:abs(lid[k]['pos']-pkg[k]['pos']) for k in ['left','bottom']},'threshold':'>4px on left and bottom, material assignment reviewed'},{'id':'corner_identity','status':'NOT_EVALUATED','actual':'65px rounded corners are model estimates, not traced lid/pkg borders','threshold':'independent pixel support for both complete boundaries'},{'id':'physical_calibration','status':'NOT_EVALUATED','actual':'good-image size prior, not metrology','threshold':'same-part dimensional tolerance and imaging variation'}]
  data={'valid':True,'skewSupported':bool(skew),'containedSupported':full,'independentSupports':bool(independent),'clearance':bounds,'selected':selected,'trials':alltrials,'boundaryChecks':checks,'scope':'development geometry, partial direct support; estimated hidden edges and corners identified; no filename/labels in prediction'}
  for j,txt in enumerate(['GREEN lid / CYAN pkg','SOLID measured edge segment; DASH estimated/model','Corners dashed: assumed radius, not measured',''+('TOP OVERHANG supported within trial bounds' if skew else 'CONTAINMENT UNKNOWN: corner/right-edge identity unresolved')]):cv2.putText(ov,txt,(20,28+j*25),0,.6,(255,255,255),2)
  prof,pdata=plots(g,box,lid,pkg,selected['candidateLines']);data['profiles']=pdata
  uv=np.full((600,1000,3),255,np.uint8);lo=min(v['low'] for v in bounds.values())-5;hi=max(v['high'] for v in bounds.values())+5
  for k,j in zip(SIDES,range(4)):
   v=bounds[k];yy=100+j*115
   def xx(q):return int(140+(q-lo)/(hi-lo)*800)
   cv2.line(uv,(xx(0),50),(xx(0),550),(0,0,255),1);cv2.putText(uv,k,(15,yy),0,.7,(0,0,0),1);cv2.line(uv,(xx(v['low']),yy),(xx(v['high']),yy),(150,60,0),7);cv2.circle(uv,(xx(v['nominal']),yy),6,(0,150,0),-1);cv2.putText(uv,f'{v["low"]:.1f}..{v["high"]:.1f}px',(xx(v['low']),yy-20),0,.55,(0,0,0),1)
  cv2.putText(uv,'Signed lid clearance to pkg: positive inside; trial bounds NOT 95% CI',(20,580),0,.6,(0,0,0),1)
  save_image('overlay',ov);save_image('profiles',prof,section='parameters');save_image('uncertainty',uv,section='boundary');save_json('geometry_data',data);save_layers('geometry',[{'id':'two-objects','objects':objects}]);st.set_output('geometry_data',data);st.set_output('boundaryChecks',checks);pr.set_output('geometry_data',data);pr.set_output('overlay','overlay')
result=data
