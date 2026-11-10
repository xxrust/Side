import cv2, numpy as np

def selector(data,visual,caption):
 return {'kind':'artifact','type':'evidence','id':data,'visuals':[{'id':visual,'caption':caption}]}
def why(data,visual,reason,groups,boundary):
 return {'tool':{'reason':reason,'expectedEvidence':[selector(data,'overlay' if data=='features' else visual,'青色是原圖實測包絡；黃色是統計框，兩者均不是隱藏pkg。')]},'parameters':[{'name':k,'source':'agent-proposal','reason':PARAM_REASON[k],'verification':selector(data,'sensitivity' if data=='features' else visual,'三條曲線對應sigma，橫軸65/80/95灰階；候選差異已保存。其餘品質限制本次未調優。')} for k in groups],'boundaries':[{'condition':boundary,'check':selector(data,'optical_view' if data=='features' else visual,'洋紅200灰階紋路位於亮帶內部，不能當另一物體；物理包含尚未建立。'),'onFailure':'UNKNOWN'}]}
PARAM_REASON={
 'search':'sigma=1/1.5/2.5 px與seed=65灰階為這批開發提出。65低於外帶灰階且高於暗背景；以三種平滑觀察定位變動。面積至少影像10%、邊界距5 px、填充率0.85、競爭物件比例0.4均是未獨立調優的防錯設定。',
 'envelope':'閾值65/80/95與sigma逐一交叉實算，選80/1.5作展示，分類使用所有9組的範圍。保留seed範圍內所有真實亮點，避免只留最大分量而丟失斷開外帶。200灰階等亮線僅解說焊道光學峰，不參與分類。',
 'quality':'長邊650–780 px、短邊500–650 px限定本成像尺度；ratio跨度上限0.015、長寬各±2 px擾動是Agent暫提，非人類尺寸公差或95%置信界。未涵蓋系統性照明誤差。'}
S=parameters['search'];E=parameters['envelope'];Q=parameters['quality']
def label(v,t,y=30,col=(255,255,255)):
 cv2.putText(v,t,(20,y),cv2.FONT_HERSHEY_SIMPLEX,.62,col,2,cv2.LINE_AA)
def plot(rows):
 v=np.full((600,960,3),255,np.uint8);valid=[r for r in rows if r.get('ratio') is not None]
 low=min([r['ratio'] for r in valid]+[.76])-.005;high=max([r['ratio'] for r in valid]+[.85])+.005
 for yy in np.linspace(low,high,6):
  y=int(510-(yy-low)/(high-low)*430);cv2.line(v,(100,y),(900,y),(225,225,225),1);cv2.putText(v,f'{yy:.3f}',(25,y+5),0,.5,(30,30,30),1)
 for j,t in enumerate(E['levels']):
  x=180+j*300;cv2.putText(v,str(t),(x-15,540),0,.6,(0,0,0),1)
 for j,sg in enumerate(S['sigmas']):
  pts=[];col=[(190,90,10),(10,150,10),(160,10,160)][j]
  for r in valid:
   if r['sigma']==sg:
    x=180+E['levels'].index(r['level'])*300;y=int(510-(r['ratio']-low)/(high-low)*430);pts.append((x,y));cv2.circle(v,(x,y),5,col,-1)
  if len(pts)>1:cv2.polylines(v,[np.array(pts,np.int32)],False,col,2)
  cv2.putText(v,f'sigma={sg}px',(180+j*250,40),0,.55,col,2)
 cv2.putText(v,'threshold (gray 0-255); y = short / long optical envelope',(110,580),0,.6,(0,0,0),1)
 return v

with procedure('envelope_features',name='包絡特徵',inputs={'image':image_records[0]['id']},outputs={'features':'features','overlay':'overlay'},parameters=parameters,justification=why('features','overlay','從可見金屬組件提取平移與旋轉不變的形狀代理；不把lid/pkg合併包絡稱作pkg，更不生成隱藏矩形。',['search','envelope','quality'],'只針對本批16張開發圖；其他40張未驗證，物理越界及mm未量測。')) as pr:
 with step('search',name='搜尋範圍',parameters={'search':S},inputs={'image':image_records[0]['id']},outputs={'search':'search_data'},justification=why('search_data','search_view','原圖為亮金屬組件、暗夾具背景；由低灰階連通區取得完整搜尋支持。填洞僅限制候選來源，後續尺寸仍只使用真實前景像素。',['search'],'亮背景連上工件或兩件相連會錯定位；面積、填充、競爭物件與截邊檢查失敗走UNKNOWN。')) as st:
  loc=[];working=[];g0=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY);sv=image.copy()
  for sg in S['sigmas']:
   g=cv2.GaussianBlur(g0,(0,0),sg);cs,_=cv2.findContours((g>S['seedLevel']).astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE);cs=sorted(cs,key=cv2.contourArea,reverse=True)
   if not cs:
    loc.append({'sigma':sg,'found':False});working.append(None);continue
   c=cs[0];area=float(cv2.contourArea(c));x,y,w,h=cv2.boundingRect(c);rect=cv2.minAreaRect(c);rw,rh=rect[1];fill=area/max(rw*rh,1);rival=float(cv2.contourArea(cs[1])/max(area,1)) if len(cs)>1 else 0
   okay=area>=g.size*S['minAreaRatio'] and min(x,y,g.shape[1]-x-w,g.shape[0]-y-h)>=S['borderPx'] and fill>=S['minFill'] and rival<=S['maxRivalRatio']
   support=np.zeros_like(g);cv2.drawContours(support,[c],-1,1,-1)
   row={'sigma':sg,'found':True,'valid':bool(okay),'areaPx2':area,'bbox':[x,y,w,h],'fill':fill,'rivalRatio':rival};loc.append(row);working.append((g,support,c))
   if sg==E['selectedSigma']:cv2.drawContours(sv,[c],-1,(255,220,0),2)
  label(sv,'CYAN: search envelope of visible metal, NOT a PKG boundary',30,(255,220,0))
  save_image('search_view',sv);save_json('search_data',{'candidates':loc,'parameters':S});st.set_output('search',loc)
 with step('geometry',name='包絡比例',depends_on=['search'],inputs={'search':'search_data'},outputs={'features':'features','overlay':'overlay'},parameters={'envelope':E,'quality':Q},justification=why('features','sensitivity','在搜尋支持內保留每個門檻的全部真實亮點，連通區斷開也保留。最小包圍框僅計算可見組件形狀比，沒有推估pkg。替代完整lid/pkg重建仍有邊身份歧義。',['envelope','quality'],'外形代理可被其他缺陷或光照改變；只有本批良品/歪斜開發區分，不是物理外溢測量。')) as st:
  rows=[];selected=None;overlay=image.copy();objects=[];bright=image.copy();allbounds=[]
  for sg,work in zip(S['sigmas'],working):
   if work is None:continue
   g,support,c=work
   for t in E['levels']:
    mask=((g>t)&(support>0)).astype(np.uint8);pts=cv2.findNonZero(mask)
    if pts is None:continue
    rect=cv2.minAreaRect(pts);short,long=sorted(rect[1]);ratio=float(short/long) if long>0 else 0.;cs,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    e=Q['dimensionErrorPx'];lo=max(0,(short-e)/(long+e));hi=(short+e)/max(long-e,1)
    row={'sigma':sg,'level':t,'shortPx':float(short),'longPx':float(long),'ratio':ratio,'lower':float(lo),'upper':float(hi),'componentCount':len(cs),'areaPx2':int(mask.sum()),'center':[float(q) for q in rect[0]],'boxAngleDeg':float(rect[2])};rows.append(row);allbounds.append((lo,hi))
    if sg==E['selectedSigma'] and t==E['selectedLevel']:
     selected=row;box=cv2.boxPoints(rect);cv2.drawContours(overlay,cs,-1,(255,220,0),1)
     cv2.polylines(overlay,[box.astype(np.int32)],True,(0,210,255),1)
     for j,co in enumerate(cs):
      if len(co)>=3:objects.append({'id':'envelope-'+str(j),'type':'blob','label':'實測等亮輪廓；混合lid/pkg可見外形','geometry':{'points':[{'x':float(x),'y':float(y)} for x,y in co[:,0,:]]}})
     objects.append({'id':'proxy-box','type':'polyline','label':'包絡統計框，非物體或遮擋重建','geometry':{'points':[{'x':float(x),'y':float(y)} for x,y in np.vstack([box,box[0]])]}})
     bc,_=cv2.findContours(((g>E['opticalLevel'])&(support>0)).astype(np.uint8),cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE);cv2.drawContours(bright,bc,-1,(255,0,255),1);cv2.drawContours(bright,cs,-1,(255,220,0),1)
  ratios=[r['ratio'] for r in rows];low=float(min(v[0] for v in allbounds)) if allbounds else None;high=float(max(v[1] for v in allbounds)) if allbounds else None;spread=float(max(ratios)-min(ratios)) if ratios else None
  complete=len(rows)==len(S['sigmas'])*len(E['levels']) and all(r.get('valid',False) for r in loc)
  scale=bool(rows) and all(Q['longRangePx'][0]<=r['longPx']<=Q['longRangePx'][1] and Q['shortRangePx'][0]<=r['shortPx']<=Q['shortRangePx'][1] for r in rows)
  stable=spread is not None and spread<=Q['maxRatioSpread'];usable=bool(complete and scale and stable)
  checks=[{'id':'localization','status':'PASS' if complete else 'FAIL','actual':[r.get('valid',False) for r in loc],'threshold':'all 3 supports valid and 9 candidates'}, {'id':'scale','status':'PASS' if scale else 'FAIL','actual':[[r['shortPx'],r['longPx']] for r in rows],'threshold':Q}, {'id':'stability','status':'PASS' if stable else 'FAIL','actual':spread,'threshold':Q['maxRatioSpread']},{'id':'physical_containment','status':'NOT_EVALUATED','actual':'mixed visible-metal envelope only','threshold':'separate physical lid/pkg with calibrated uncertainty'}]
  data={'valid':True,'usable':usable,'proxyRatio':selected['ratio'] if selected else None,'lower':low,'upper':high,'spread':spread,'selected':selected,'candidates':rows,'localization':loc,'boundaryChecks':checks,'meaning':'development optical-envelope proxy, not lid/pkg physical overhang','uncertainty':'range over 9 extraction settings plus independent +/-2px dimension perturbations; not statistical confidence or a bound on systematic image error','scope':'12 good + 4 skew development images; other40 untested; no filename, path, expected label or annotation used to predict'}
  label(overlay,'CYAN: observed envelope; YELLOW: its statistic box (NOT pkg)',30,(255,220,0));label(overlay,'DEVELOPMENT PROXY ONLY - no physical containment claim',60,(0,210,255))
  if selected:label(overlay,f'short/long={selected["ratio"]:.5f}  sensitivity=[{low:.5f},{high:.5f}]',90)
  label(bright,'MAGENTA: optical isophote at 200; CYAN: envelope at 80',30,(255,0,255));label(bright,'Multiple bright ridges are NOT separate physical objects',60,(255,0,255))
  save_image('overlay',overlay);save_image('optical_view',bright);save_image('sensitivity',plot(rows),section='parameters');save_json('features',data);save_layers('geometry',[{'id':'optical-envelope','objects':objects}]);st.set_output('features',data);st.set_output('boundaryChecks',checks);pr.set_output('features',data);pr.set_output('overlay','overlay')
result=data
