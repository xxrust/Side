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
