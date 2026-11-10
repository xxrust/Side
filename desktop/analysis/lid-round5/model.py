import cv2,numpy as np,itertools,math
SIDES=['top','bottom','left','right']
def sel(d,v,c):return {'kind':'artifact','type':'evidence','id':d,'visuals':[{'id':v,'caption':c}]}
def why(reason,groups,data='geometry_data',vis='overlay',pv=None,bv=None):
 if pv is None:pv='edge_profiles' if data=='edge_data' else vis
 if bv is None:bv=vis
 return {'tool':{'reason':reason,'expectedEvidence':[sel(data,vis,'本次原圖支持與模型估計分開；虛線不冒充物理測得輪廓。')]},'parameters':[{'name':k,'source':'agent-proposal','reason':REASONS[k],'verification':sel(data,pv,'同一輸入的實際候選/剖面與設定；未比較者明示為暫用。')} for k in groups],'boundaries':[{'condition':'獨立物體支持、整體幾何與候選歧義須符合開發範圍；絕對精度/其他缺陷/其他40張仍未驗證。','check':sel(data,bv,'本件真實候選、殘差或支持圖；校準缺口不阻塞已授權開發判別。'),'onFailure':'UNKNOWN'}]}
REASONS={'search': '繼承第四輪65灰階搜尋、sigma1.5；只找搜尋域，不把亮連通區命名為pkg。未比較新照明。', 'scan': '繼承中央56%、121點、±70px、斜率±.06/步長.002。每件實比sigma1/1.5/2.5，五組四邊候選保留；不從檔名/ID選峰。', 'lidPrior': '繼承梯度框683x529、尺度10/12px，來源第四輪人類示教身份及開發像素。此為找峰先驗，不是物理邊界或分類規格。', 'pkgPrior': '繼承708x550px與8px尺寸尺度，源於開發良品外露邊；有獨立一橫一豎外露帶才可推估遮擋。換lid候選時固定pkg支持。', 'quality': '繼承逐邊3px/未解邊6px/尺寸8px敏感性與分離4px，僅用於方向性SKEW證據。亮背景80及暗縫對比6為歷史設定；不當已校準誤差。', 'poseModel': '本輪12張已授權good的舊實測邊經正交pose擬合，lid約684.5–688.3 x 529.8–537.0，選687x532，尺寸評分尺度6px；允收±10px。實測段90百分位法向殘差上限5px，區分模型殘差與絕對定位誤差。破碎pkg邊若90百分位殘差>5px且對邊有支持，保留拒絕點並以對邊+尺寸推估；不放寬品質上限。共同角支持>=3、分數>=.7、覆蓋>=.7為開發品質範圍，保存各候選，並非精度校準。', 'radiusModel': '40–140px逐2px，共同半徑但兩物體各自pose；四角歸一化分數等權，遮住pkg角不計。±6px剖面以lid內側亮肩(100到180)、pkg外側背景(110到50)加權；真曲線比較原始梯度與加權結果，排除pkg外沿被叫lid。80%候選族仍保留，不要求各角獨立半徑小範圍。灰階設定為本批開發提案，未做跨光源校準。', 'decision': '開發像素容差4px，以本批名義可見邊90百分位殘差最高約3.75px向上取整作開發提案，並比對同分候選族最低-3.40px；非為其他工件制定標準；不是毫米公差/95%誤差。逐件實比容差0/3/4/5與分數差.5/1/2/3，正式選差2。若可用模型族越出容差仍UNKNOWN；方向性SKEW優先保留。', 'display': '110px半寬局部圖保持原像素比例；顯示設定不參與分類，未調優。'}
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

# This file is embedded verbatim into model.py by build.py; no runtime file imports.
def rotmat(m):
 c,s=math.cos(m['theta']),math.sin(m['theta']);return np.array([[c,-s],[s,c]])

def pose_from_edges(edges,box,tag):
 slopes=[(1 if k in SIDES[:2] else -1)*q['slope'] for k,q in edges.items() if q['kind']!='estimated']
 theta=math.atan(float(np.median(slopes)));rot=rotmat({'theta':theta});loc={};residual={};measured={}
 for k,q in edges.items():
  pts=np.array(q['points'] or linepoints(k,q['pos'],q['slope'],box));z=pts@rot;ax=1 if k in SIDES[:2] else 0
  loc[k]=float(np.median(z[:,ax]));residual[k]=float(np.quantile(abs(z[:,ax]-loc[k]),parameters['poseModel']['residualQuantile']));measured[k]=q['kind']!='estimated'
 w=loc['right']-loc['left'];h=loc['bottom']-loc['top'];cen=np.array([(loc['right']+loc['left'])/2,(loc['bottom']+loc['top'])/2])@rot.T
 return {'cx':float(cen[0]),'cy':float(cen[1]),'w':w,'h':h,'theta':theta,'normalResidualPx':residual,'measuredSides':measured,'r':parameters['quality']['cornerRadius'],'kind':'single-pose orthogonal rounded-rectangle estimate'}

def sdf(points,m):
 z=(np.asarray(points)-[m['cx'],m['cy']])@rotmat(m);q=abs(z)-[m['w']/2-m['r'],m['h']/2-m['r']]
 return np.linalg.norm(np.maximum(q,0),axis=1)+np.minimum(np.max(q,axis=1),0)-m['r']

def arcs(m,r,full=False):
 A=parameters['radiusModel'];pts=[];ns=[];ci=[]
 for i,(sx,sy,a) in enumerate([(-1,-1,180),(1,-1,270),(1,1,0),(-1,1,90)]):
  rr=[0,90] if full else A['angleRangeDeg'];ang=np.deg2rad(a+np.linspace(rr[0],rr[1],A['samples']));norm=np.stack([np.cos(ang),np.sin(ang)],axis=1);cen=np.array([sx*(m['w']/2-r),sy*(m['h']/2-r)])
  pts.extend((cen+norm*r)@rotmat(m).T+[m['cx'],m['cy']]);ns.extend(norm@rotmat(m).T);ci.extend([i]*A['samples'])
 return np.array(pts),np.array(ns),np.array(ci)

def boundary(m):
 p,_,ci=arcs(m,m['r'],True);out=[]
 for i in range(4):
  a=p[ci==i];b=p[ci==(i+1)%4];out.extend(a);out.extend(np.linspace(a[-1],b[0],parameters['poseModel']['sideSamples'])[1:-1])
 return np.array(out)

def fit_radius(g,m,tag,lid=None):
 A=parameters['radiusModel'];trials=[]
 for r in np.arange(A['radiusRange'][0],A['radiusRange'][1]+.1,A['radiusStep']):
  pts,ns,ci=arcs(m,float(r));vv=[]
  for d in A['normalOffsets']:
   pp=pts+ns*d;vv.append(cv2.remap(g,pp[:,0].astype('float32')[None,:],pp[:,1].astype('float32')[None,:],cv2.INTER_LINEAR)[0].astype(float))
  raw=(vv[0]-vv[-1])/(A['normalOffsets'][-1]-A['normalOffsets'][0]);grad=raw.copy()
  if tag=='lid':grad*=np.clip((vv[0]-A['lidBrightFloor'])/A['lidBrightScale'],0,1)
  else:grad*=np.clip((A['pkgDarkCeiling']-vv[-1])/A['pkgDarkScale'],0,1)
  visible=np.ones(len(pts),bool) if lid is None else sdf(pts,lid)>A['independentArcDistancePx']
  per=[];rawper=[];cov=[];profile=[]
  for i in range(4):
   mask=(ci==i)&visible;ok=int(mask.sum())>=A['minVisibleSamples']
   per.append(float(np.mean(np.clip(grad[mask],0,A['gradientClip']))) if ok else None)
   rawper.append(float(np.mean(np.clip(raw[mask],0,A['gradientClip']))) if ok else None)
   cov.append(float(np.mean(grad[mask]>A['gradientMin'])) if ok else None)
   profile.append([float(np.mean(v[ci==i])) for v in vv])
  trials.append({'r':float(r),'perCornerScore':per,'rawPerCornerScore':rawper,'perCornerCoverage':cov,'profiles':profile,'visibleFraction':float(visible.mean())})
 for field,out in [('perCornerScore','score'),('rawPerCornerScore','rawScore')]:
  peaks=[max(q[field][i] or 0 for q in trials) for i in range(4)]
  for q in trials:
   vv=[q[field][i]/peaks[i] for i in range(4) if q[field][i] is not None and peaks[i]>A['minimumCornerPeak']]
   q[out]=float(np.mean(vv)) if len(vv)>=A['minSupportedCorners'] else 0.
 best=max(trials,key=lambda q:q['score']);rawbest=max(trials,key=lambda q:q['rawScore']);near=[q['r'] for q in trials if q['score']>=best['score']*A['relativeFamilyScore']]
 model=dict(m,r=best['r']);info={'selectedRadius':best['r'],'rawGradientRadius':rawbest['r'],'score':best['score'],'coverage':float(np.mean([v for v in best['perCornerCoverage'] if v is not None])) if any(v is not None for v in best['perCornerCoverage']) else 0.,'supportedCorners':sum(v is not None and v>=A['minimumCornerPeak'] for v in best['perCornerScore']),'familyRadiusRange':[min(near),max(near)],'perCornerScore':best['perCornerScore'],'trials':trials}
 return model,info

def coherent_candidate(g,entry,box,joint,candidateIndex,sigma):
 M=parameters['poseModel'];models={tag:pose_from_edges(entry[tag],box,tag) for tag in ['lid','pkg']};fit={};rejected={}
 # Broken exterior traces may not belong to a straight pkg side. Exclude only
 # with a supported opposite side; keep observed points and the rejection reason.
 pkgEdges=dict(entry['pkg'])
 for k,op,axis in [('left','right','Width'),('right','left','Width'),('top','bottom','Height'),('bottom','top','Height')]:
  m=models['pkg'];e=entry['pkg']
  if m['measuredSides'][k] and m['normalResidualPx'][k]>M['maxNormalResidualPx'] and m['measuredSides'][op] and m['normalResidualPx'][op]<=M['maxNormalResidualPx']:
   rejected[k]={'observed':e[k],'residualPx':m['normalResidualPx'][k],'reason':'fragmented exterior incompatible with single pose; opposite supported side plus same-part size used'}
   pkgEdges[k]={'pos':e[op]['pos']+(-1 if k in ['left','top'] else 1)*M['pkg'+axis],'slope':e[op]['slope'],'kind':'estimated','method':'opposite measured side plus dimensional model after rejecting fragmented trace','edgeIntervalPx':parameters['quality']['dimensionTrialPx'],'points':[]}
 if rejected:
  entry=dict(entry,pkg=pkgEdges);models['pkg']=pose_from_edges(pkgEdges,box,'pkg')
 models['pkg']['rejectedSides']=rejected
 models['lid'],fit['lid']=fit_radius(g,models['lid'],'lid');models['pkg'],fit['pkg']=fit_radius(g,models['pkg'],'pkg',models['lid'])
 shapePenalty=((models['lid']['w']-M['lidWidth'])/M['lidWidthScale'])**2+((models['lid']['h']-M['lidHeight'])/M['lidHeightScale'])**2
 shapeSupport=sum(float(np.mean([v for v in fit[tag]['perCornerScore'] if v is not None])) if any(v is not None for v in fit[tag]['perCornerScore']) else 0 for tag in fit)
 score=joint['score']-shapePenalty+M['arcScoreWeight']*shapeSupport
 pts=boundary(models['lid']);cl=-sdf(pts,models['pkg']);idx=int(np.argmin(cl));family=[]
 for lr,pr in itertools.product(fit['lid']['familyRadiusRange'],fit['pkg']['familyRadiusRange']):
  lm=dict(models['lid'],r=lr);pm=dict(models['pkg'],r=pr);family.append({'lidRadius':lr,'pkgRadius':pr,'minClearancePx':float((-sdf(boundary(lm),pm)).min())})
 residual=max(v for tag in models for k,v in models[tag]['normalResidualPx'].items() if models[tag]['measuredSides'][k])
 dimensionOk=all(abs(models[tag][axis]-M[tag+dim])<=M[tag+dim+'Limit'] for tag in ['lid','pkg'] for axis,dim in [('w','Width'),('h','Height')])
 radiusOk=all(fit[tag]['score']>=M['minRadiusScore'] and fit[tag]['coverage']>=M['minArcCoverage'] and fit[tag]['supportedCorners']>=M['minArcCorners'] for tag in ['lid','pkg'])
 quality=bool(entry['pkgAnchorValid'] and residual<=M['maxNormalResidualPx'] and dimensionOk and radiusOk)
 return {'candidateIndex':candidateIndex,'sigma':sigma,'models':models,'radiusFit':fit,'score':float(score),'lineScore':joint['score'],'shapePenalty':float(shapePenalty),'shapeSupport':shapeSupport,'minClearancePx':float(cl.min()),'minimumPoint':pts[idx].tolist(),'family':family,'familyMinimumPx':min(v['minClearancePx'] for v in family),'maxMeasuredNormalResidualPx':residual,'dimensionOk':bool(dimensionOk),'radiusOk':bool(radiusOk),'quality':quality,'independent':entry['pkgAnchorValid'],'visiblePkgSides':entry['visiblePkgSides'],'edges':{tag:entry[tag] for tag in ['lid','pkg']}}

def candidate_edges(g,box,joint,base):
 # Keep independently assigned pkg supports fixed while comparing lid peaks.
 # Otherwise choosing a lid peak can move pkg to absorb a real overhang.
 lid={k:refine(g,k,joint['lines'][k],exterior(g,k,box),box) for k in SIDES}
 for k in SIDES:
  ext=exterior(g,k,box);outside=(ext['pos']-base['pkg'][k]['pos'])*(1 if k in ['top','left'] else -1)
  if base['pkgAnchorValid'] and outside < -parameters['pkgPrior']['heightTolerance'] and abs(ext['pos']-lid[k]['pos'])<parameters['quality']['maxLidExteriorRecheckPx']:
   lid[k]=dict(ext,kind='measured',method='external metal boundary; independent pkg anchors exclude pkg here',edgeIntervalPx=parameters['quality']['edgeTrialPx'])
 return dict(base,lid=lid)

def plot_radii(best):
 out=np.full((720,1100,3),255,np.uint8)
 for j,tag in enumerate(['lid','pkg']):
  ox=65;oy=45+350*j;ts=best['radiusFit'][tag]['trials'];A=parameters['radiusModel'];xr=A['radiusRange'];scale=950/(xr[1]-xr[0])
  for val in [0,.25,.5,.75,1]:
   yy=int(oy+255-val*220);cv2.line(out,(ox,yy),(1030,yy),(220,220,220),1);cv2.putText(out,str(val),(10,yy),0,.45,(20,20,20),1)
  for field,col in [('rawScore',(150,150,150)),('score',(0,140,0) if tag=='lid' else (220,140,0))]:
   pp=np.array([[ox+(q['r']-xr[0])*scale,oy+255-q[field]*220] for q in ts],np.int32);cv2.polylines(out,[pp],False,col,2)
  xx=int(ox+(best['models'][tag]['r']-xr[0])*scale);cv2.line(out,(xx,oy+25),(xx,oy+260),(0,0,200),1)
  for rad in np.arange(xr[0],xr[1]+1,20):cv2.putText(out,str(int(rad)),(int(ox+(rad-xr[0])*scale)-10,oy+280),0,.5,(0,0,0),1)
  cv2.putText(out,tag+' shared radius (px); gray raw gradient / color identity-weighted',(ox,oy),0,.6,(0,0,0),1)
 return out

def plot_candidates(candidates,selected):
 out=np.full((650,1100,3),255,np.uint8);vals=[q['minClearancePx'] for q in candidates];lo=min(-5,min(vals)-3);hi=max(12,max(vals)+3)
 def yy(v):return int(540-(v-lo)/(hi-lo)*440)
 cv2.line(out,(70,yy(0)),(1050,yy(0)),(0,0,220),2)
 for v in np.linspace(lo,hi,6):cv2.putText(out,f'{v:.1f}',(5,yy(v)),0,.45,(20,20,20),1)
 for j,q in enumerate(candidates):
  x=100+j*920/max(1,len(candidates)-1);col=(0,160,0) if q['quality'] else (140,140,140);cv2.circle(out,(int(x),yy(q['minClearancePx'])),5,col,-1);cv2.line(out,(int(x),yy(q['familyMinimumPx'])),(int(x),yy(q['minClearancePx'])),col,2)
  cv2.putText(out,str(q['candidateIndex']),(int(x)-5,575),0,.45,(0,0,0),1)
 cv2.putText(out,'Each sigma / line candidate: nominal clearance and shared-radius family minimum (px)',(20,35),0,.57,(0,0,0),1)
 cv2.putText(out,'Green: model quality eligible; gray: rejected; red: geometric zero',(20,65),0,.55,(0,0,0),1)
 return out

def draw_model(im,m,col):
 pts=boundary(m)
 for i in range(0,len(pts)-1,2):cv2.line(im,tuple(np.rint(pts[i]).astype(int)),tuple(np.rint(pts[min(i+1,len(pts)-1)]).astype(int)),col,1,cv2.LINE_AA)

def detail_view(im,best):
 # Four corner neighborhoods plus right side at original scale, paired raw/overlay.
 m=best['models']['lid'];corners=np.array([[-m['w']/2,-m['h']/2],[m['w']/2,-m['h']/2],[m['w']/2,m['h']/2],[-m['w']/2,m['h']/2],[m['w']/2,0]])@rotmat(m).T+[m['cx'],m['cy']]
 marked=im.copy()
 for tag,col in [('lid',(20,240,20)),('pkg',(255,180,0))]:draw_model(marked,best['models'][tag],col)
 panels=[];half=parameters['display']['cropHalfSize']
 for j,(x,y) in enumerate(corners):
  x=int(x);y=int(y);x0=max(0,x-half);y0=max(0,y-half);x1=min(im.shape[1],x+half);y1=min(im.shape[0],y+half);row=np.full((2*half+30,4*half,3),25,np.uint8)
  a=im[y0:y1,x0:x1];b=marked[y0:y1,x0:x1];row[30:30+a.shape[0],:a.shape[1]]=a;row[30:30+b.shape[0],2*half:2*half+b.shape[1]]=b
  cv2.putText(row,['TL','TR','BR','BL','RIGHT'][j]+f'  crop origin ({x0},{y0}) raw | estimated model',(5,20),0,.45,(255,255,255),1);panels.append(row)
 return np.vstack(panels)

with procedure('objects',name='兩層邊界',inputs={'image':image_records[0]['id']},outputs={'geometry_data':'geometry_data','overlay':'overlay'},parameters=parameters,justification=why('從原圖分開lid焊接外緣與pkg外露外緣，尺寸只補遮擋部分，並保留未成立的身份。',list(parameters))) as pr:
 with step('search',name='工件搜尋',parameters={'search':parameters['search']},inputs={'image':image_records[0]['id']},outputs={'search_data':'search_data'},justification=why('暗背景上的最大金屬連通支持只限定搜尋域，不能命名為pkg。',['search'],'search_data','search_view')) as st:
  g0=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY);g=cv2.GaussianBlur(g0,(0,0),parameters['search']['sigma']);box=locate(g);sv=image.copy()
  if box is not None:x,y,w,h=box;cv2.rectangle(sv,(x,y),(x+w,y+h),(0,200,255),1)
  save_image('search_view',sv);save_json('search_data',{'bbox':box});st.set_output('bbox',box)
 if box is None:
  data={'valid':False,'code':'NOT_FOUND','reason':'No metal support above seed level','skewSupported':False,'containedSupported':False}
  save_json('geometry_data',data)
 else:
  with step('edges',name='邊緣歸屬',depends_on=['search'],inputs={'bbox':'search_data'},outputs={'edge_data':'edge_data'},parameters={k:parameters[k] for k in ['scan','lidPrior','pkgPrior','quality']},justification=why('先找多個連續梯度線，聯合四邊方向及lid尺寸排除內部焊道峰；再用暗縫或金屬/背景交界定位。pkg以可見外露邊加獨立尺寸先驗完成。',['scan','lidPrior','pkgPrior','quality'],'edge_data','edge_view')) as st:
   alltrials=[];selected=None
   for sigma in parameters['scan']['sigmas']:
    gg=cv2.GaussianBlur(g0,(0,0),sigma);rows=scan(gg,box);joint=choose(rows);lid={k:refine(gg,k,joint[0]['lines'][k],exterior(gg,k,box),box) for k in SIDES};ext={k:exterior(gg,k,box) for k in SIDES}
    # Determine independently visible pkg sides from separated exterior bands.
    gaps={k:(lid[k]['pos']-ext[k]['pos'])*(1 if k in ['top','left'] else -1) for k in SIDES}
    visible={k:gaps[k]>parameters['quality']['minIndependentSeparationPx'] for k in SIDES}
    # One horizontal and one vertical exterior constrain pkg pose; retain absent sides as estimates.
    hs=[k for k in ['top','bottom'] if visible[k]];vs=[k for k in ['left','right'] if visible[k]]
    ah=max(hs,key=lambda k:gaps[k]) if hs else 'bottom';av=max(vs,key=lambda k:gaps[k]) if vs else 'left'
    a=(ext[ah]['slope']-ext[av]['slope'])/2;ww=parameters['pkgPrior']['width'];hh=parameters['pkgPrior']['height'];pkg={}
    for k in SIDES:
     if visible[k]:pkg[k]=dict(ext[k],kind='measured',method='separate exposed pkg to background, independently from lid rim',edgeIntervalPx=3.)
    for k in ['top','bottom']:
     if k not in pkg:pkg[k]={'pos':ext[ah]['pos']+(0 if k==ah else (hh if k=='bottom' else -hh)),'slope':a,'kind':'estimated','method':'pkg '+ah+' plus good-image height prior','edgeIntervalPx':11.,'points':[]}
    for k in ['left','right']:
     if k not in pkg:pkg[k]={'pos':ext[av]['pos']+(0 if k==av else (ww if k=='right' else -ww)),'slope':-a,'kind':'estimated','method':'pkg '+av+' plus good-image width prior','edgeIntervalPx':11.,'points':[]}
    # When an exterior is outside the pkg reconstructed from independent exposed bands,
    # it cannot be that pkg edge under the saved dimensional hypothesis. Recheck lid proximity.
    for k in SIDES:
     outside=(ext[k]['pos']-pkg[k]['pos'])*(1 if k in ['top','left'] else -1)
     if hs and vs and outside < -parameters['pkgPrior']['heightTolerance'] and abs(ext[k]['pos']-lid[k]['pos'])<12:
      lid[k]=dict(ext[k],kind='measured',method='outer metal edge; pkg excluded by independent visible sides and size prior',edgeIntervalPx=3.)
    pp=polygon(pkg,box);lp=polygon(lid,box);lc=rounded(lp,parameters['quality']['cornerRadius']);pc=rounded(pp,parameters['quality']['cornerRadius'])
    # Signed straight-side clearance at rounded lid model points, positive inside.
    margins={}
    for k in SIDES:
     hz=k in SIDES[:2];q=pkg[k];xy=np.array(linepoints(k,lid[k]['pos'],lid[k]['slope'],box));mid=box[0]+box[2]/2 if hz else box[1]+box[3]/2;normal=xy[:,1] if hz else xy[:,0];tan=xy[:,0] if hz else xy[:,1];dd=(normal-(q['pos']+q['slope']*(tan-mid)))*(1 if k in ['top','left'] else -1)/math.sqrt(1+q['slope']**2);margins[k]=float(dd.min())
    entry={'sigma':sigma,'joint':joint,'lid':lid,'pkg':pkg,'margins':margins,'lidPolygon':lp,'pkgPolygon':pp,'lidCurve':lc,'pkgCurve':pc,'candidateLines':rows,'visiblePkgSides':[k for k in SIDES if visible[k]],'pkgAnchorValid':bool(hs and vs),'pkgAnchors':[ah,av]};alltrials.append(entry)
    if sigma==parameters['search']['sigma']:selected=entry
   edgeview=image.copy()
   for tag,col in [('lid',(20,240,20)),('pkg',(255,180,0))]:
    for k,q in selected[tag].items():drawseg(edgeview,linepoints(k,q['pos'],q['slope'],box),col,q['kind']=='estimated',2)
   ep,_=plots(g,box,selected['lid'],selected['pkg'],selected['candidateLines'])
   save_image('edge_view',edgeview);save_image('edge_profiles',ep,section='parameters');save_json('edge_data',{'selected':selected,'trials':alltrials});st.set_output('selected',selected)
  with step('coherent',name='整體輪廓',depends_on=['edges'],inputs={'edgeCandidates':'edge_data'},outputs={'model_data':'model_data','model_view':'model_view'},parameters={k:parameters[k] for k in ['poseModel','radiusModel','display']},justification=why('用同一姿態、長寬與共同半徑把四角連成一個物體；固定獨立pkg支持後才比較lid峰，不用包含結果挑輪廓。',['poseModel','radiusModel','display'],'model_data','model_view','radius_trials','candidate_trials')) as st:
   candidates=[]
   for base in alltrials:
    gg=cv2.GaussianBlur(g0,(0,0),base['sigma'])
    for ci,joint in enumerate(base['joint']):
     entry=base if ci==0 else candidate_edges(gg,box,joint,base)
     candidates.append(coherent_candidate(gg,entry,box,joint,ci,base['sigma']))
   nominal=[q for q in candidates if q['sigma']==parameters['search']['sigma']];best=max(nominal,key=lambda q:q['score'])
   mv=image.copy()
   for tag,col in [('lid',(20,240,20)),('pkg',(255,180,0))]:
    draw_model(mv,best['models'][tag],col)
    for k,q in best['edges'][tag].items():
     drawseg(mv,linepoints(k,q['pos'],q['slope'],box),col,q['kind']=='estimated',2)
   modeldata={'selected':best,'candidates':candidates,'scope':'DRAFT-derived development pixel model; all outputs here freshly computed from this input; no labels or IDs used for selection'}
   save_image('model_view',mv);save_image('radius_trials',plot_radii(best),section='parameters');save_image('candidate_trials',plot_candidates(candidates,best),section='boundary');save_image('details',detail_view(image,best),section='boundary');save_json('model_data',modeldata);st.set_output('model_data',modeldata)
  with step('relation',name='包含核對',depends_on=['coherent','edges'],inputs={'models':'model_data','directionalEvidence':'edge_data'},outputs={'geometry_data':'geometry_data','overlay':'overlay'},parameters={'decision':parameters['decision'],'display':parameters['display']},justification=why('單側越界沿用方向所需的獨立支持；GOOD改為品質合格的整體模型內未見越界，並保留同分候選與像素容差。這不是精密物理證明。',['decision','display'],'geometry_data','overlay','decision_trials','model_clearance')) as st:
   D=parameters['decision'];lid=selected['lid'];pkg=selected['pkg']
   bounds={k:{'nominal':selected['margins'][k],'low':min(q['margins'][k]-q['pkg'][k]['edgeIntervalPx']-q['lid'][k]['edgeIntervalPx'] for q in alltrials),'high':max(q['margins'][k]+q['pkg'][k]['edgeIntervalPx']+q['lid'][k]['edgeIntervalPx'] for q in alltrials)} for k in SIDES}
   independent=all(q['pkgAnchorValid'] for q in alltrials)
   skew=bool(independent and any(v['high']<0 and lid[k]['kind']!='estimated' for k,v in bounds.items()))
   # Compare each smoothing setting at its own best likelihood, keeping all real candidates.
   winners=[max([q for q in candidates if q['sigma']==s],key=lambda q:q['score']) for s in parameters['scan']['sigmas']]
   plausible=[]
   for win in winners:
    plausible.extend(q for q in candidates if q['sigma']==win['sigma'] and q['score']>=win['score']-D['candidateScoreDelta'] and q['quality'])
   quality=bool(independent and all(q['quality'] for q in winners))
   minFamily=min([q['familyMinimumPx'] for q in plausible],default=None)
   nominalMin=best['minClearancePx'];contained=bool(not skew and quality and nominalMin>=-D['pixelTolerancePx'] and minFamily is not None and minFamily>=-D['pixelTolerancePx'])
   # A clearly supported overhang remains decisive even if a global lid candidate is poor.
   shown=next(q for q in nominal if q['candidateIndex']==0) if skew else best
   nominalMin=shown['minClearancePx']
   finalHint='SKEW' if skew else ('GOOD' if contained else 'UNKNOWN')
   checks=[{'id':'independent_pkg_support','status':'PASS' if independent else 'FAIL','actual':{'visibleSides':selected['visiblePkgSides'],'anchors':selected['pkgAnchors']},'threshold':'independent separated pkg support in one horizontal and one vertical direction'},
    {'id':'coherent_model_quality','status':'PASS' if quality else 'FAIL','actual':[{'sigma':q['sigma'],'residualPx':q['maxMeasuredNormalResidualPx'],'dimensionOk':q['dimensionOk'],'radiusOk':q['radiusOk']} for q in winners],'threshold':parameters['poseModel']},
    {'id':'model_clearance','status':'PASS' if contained else ('FAIL' if skew else 'NOT_EVALUATED'),'actual':{'nominalPx':nominalMin,'candidateFamilyMinimumPx':minFamily,'scope':'development modeled containment only'},'threshold':{'minimumPx':-D['pixelTolerancePx'],'candidateScoreDelta':D['candidateScoreDelta']}},
    {'id':'physical_calibration','status':'NOT_EVALUATED','actual':'no independent metrology or unseen acceptance; deliberately separate from executable development classification','threshold':'human acceptance and calibrated boundary error'}]
   sweeps=[]
   for delta,tol in itertools.product(D['deltaTrials'],D['toleranceTrialsPx']):
    ps=[q for win in winners for q in candidates if q['sigma']==win['sigma'] and q['score']>=win['score']-delta and q['quality']];mn=min([q['familyMinimumPx'] for q in ps],default=None)
    sweeps.append({'scoreDelta':delta,'pixelTolerancePx':tol,'candidateFamilyMinimumPx':mn,'category':'SKEW' if skew else ('GOOD' if quality and nominalMin>=-tol and mn is not None and mn>=-tol else 'UNKNOWN')})
   data={'valid':True,'skewSupported':skew,'containedSupported':contained,'classificationHint':finalHint,'independentSupports':bool(independent),'clearance':bounds,'modelClearance':{'nominalPx':nominalMin,'candidateFamilyMinimumPx':minFamily,'minimumPoint':shown['minimumPoint']},'modelQuality':quality,'selectedModel':shown['models'],'selectedCandidate':{'sigma':shown['sigma'],'index':shown['candidateIndex'],'score':shown['score']},'directionalSource':{'selected':selected,'bounds':bounds},'candidateSummary':[{k:q[k] for k in ['candidateIndex','sigma','score','minClearancePx','familyMinimumPx','quality','dimensionOk','radiusOk','maxMeasuredNormalResidualPx']} for q in candidates],'plausibleCandidateKeys':[[q['sigma'],q['candidateIndex']] for q in plausible],'decisionTrials':sweeps,'boundaryChecks':checks,'scope':'模型內未見超容差越界，僅歪斜檢查；人類授權的開發像素模型。實測支持、估計輪廓、人類示教分開；非精密物理包含或獨立驗收。'}
   ov=image.copy();objects=[]
   for tag,col in [('lid',(20,240,20)),('pkg',(255,180,0))]:
    draw_model(ov,shown['models'][tag],col);pp=boundary(shown['models'][tag]);objects.append({'id':tag+'-model','type':'polyline','label':tag+' 單姿態共同半徑模型（推估）','geometry':{'points':[{'x':float(x),'y':float(y)} for x,y in np.vstack([pp,pp[:1]])]}})
    for k,q in shown['edges'][tag].items():
     pts=linepoints(k,q['pos'],q['slope'],box);drawseg(ov,pts,col,q['kind']=='estimated',2);objects.append({'id':tag+'-'+k,'type':'line','label':tag+' '+k+' '+q['kind'],'geometry':{'points':[{'x':a,'y':b} for a,b in pts]}})
     if q.get('points'):objects.append({'id':tag+'-'+k+'-support','type':'polyline','label':tag+' '+k+' 像素支持，非人工GT','geometry':{'points':[{'x':a,'y':b} for a,b in q['points']]}})
   texts=['GREEN lid / CYAN pkg; dashed = coherent model estimate','Solid central segments = measured pixel support; no mm claim',finalHint+' : '+('directional overhang evidence retained' if skew else 'model containment / skew inspection only'),f'nominal {nominalMin:.2f}px; plausible family min {('unavailable' if minFamily is None else format(minFamily,'.2f'))}px; tolerance {D["pixelTolerancePx"]}px']
   for j,txt in enumerate(texts):cv2.putText(ov,txt,(15,25+24*j),0,.56,(255,255,255),2)
   cv=plot_candidates(candidates,best);dv=np.full((450,800,3),255,np.uint8)
   for ri,delta in enumerate(D['deltaTrials']):
    for ci,tol in enumerate(D['toleranceTrialsPx']):
     q=next(z for z in sweeps if z['scoreDelta']==delta and z['pixelTolerancePx']==tol);c=(120,200,120) if q['category']=='GOOD' else ((130,130,230) if q['category']=='SKEW' else (190,190,190));x=170+ci*140;y=60+ri*80;cv2.rectangle(dv,(x,y),(x+110,y+55),c,-1);cv2.putText(dv,q['category'],(x+10,y+32),0,.5,(0,0,0),1)
    cv2.putText(dv,'delta '+str(delta),(15,95+ri*80),0,.55,(0,0,0),1)
   for ci,tol in enumerate(D['toleranceTrialsPx']):cv2.putText(dv,str(tol)+' px',(185+ci*140,35),0,.55,(0,0,0),1)
   cv2.putText(dv,'Same input: actual score-family / tolerance trials; not accuracy',(15,420),0,.55,(0,0,0),1)
   save_image('overlay',ov);save_image('model_clearance',cv,section='boundary');save_image('decision_trials',dv,section='parameters');save_json('geometry_data',data);save_layers('geometry',[{'id':'coherent-objects','objects':objects}]);st.set_output('geometry_data',data);st.set_output('boundaryChecks',checks);pr.set_output('geometry_data',data);pr.set_output('overlay','overlay')
result=data
