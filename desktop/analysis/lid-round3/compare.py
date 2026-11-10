import cv2,numpy as np
D=upstream['features']['artifact']['data'];P=parameters['baseline'];G=parameters['decision']
def ref(data,vis,caption):return {'kind':'artifact','type':'evidence','id':data,'visuals':[{'id':vis,'caption':caption}]}
W={'tool':{'reason':'將本件光學包絡比與12張良品的開發分布對照。此比例描述可見組件變長，不代表lid對pkg的物理超出。最終分類由唯一classificationSpec處理。','expectedEvidence':[ref('comparison','distribution','每列一張開發良品區間；黑列是本件實算區間。位置越右代表短/長邊比越大。')]},'parameters':[{'name':'baseline','source':'agent-proposal','reason':'12張人類確認良品的像素實算分布；只作開發基準，已看過與用於選參，不能叫獨立驗證。baseline只含訓練得到的數字，不按本件名稱或ID選類。','verification':ref('comparison','distribution','開發良品編號G01至G12對應已保存manifest；本件區間由上游計算，不由表查答案。')},{'name':'decision','source':'agent-proposal','reason':'暫用良品上界0.795、歪斜下界0.805，中間未知；觀察域0.755–0.875。開發的良品上界約0.789，歪斜下界約0.808，取中間0.800並留0.010未知帶。這不是人類量產規格。','verification':ref('comparison','threshold_view','橫軸為當前區間與試驗切點；顯示0.790/0.795/0.800/0.805/0.810的位置，不把切點比較說成新獨立準確率。')}],'boundaries':[{'condition':'區間跨界、上游定位/尺度/穩定性不過、超出開發觀察域時UNKNOWN；其他40張缺陷未驗證。比例無法排除光照/批次混淆。','check':ref('comparison','limits_view','上下游9組設定的區間逐一列出；此敏感性圖沒有涵蓋未見光照與隱藏物體。'),'onFailure':'UNKNOWN'}]}
def chart(intervals,labels,cuts,title):
 v=np.full((650,1000,3),255,np.uint8);lo=.75;hi=.88
 def xx(x):return int(170+(x-lo)/(hi-lo)*780)
 for t in np.arange(.75,.881,.01):
  cv2.line(v,(xx(t),65),(xx(t),580),(230,230,230),1);cv2.putText(v,f'{t:.2f}',(xx(t)-15,610),0,.43,(0,0,0),1)
 for t in cuts:cv2.line(v,(xx(t),65),(xx(t),580),(60,60,220),2)
 for i,((a,b),lab) in enumerate(zip(intervals,labels)):
  y=100+i*int(440/max(len(intervals)-1,1));cv2.putText(v,lab,(15,y+5),0,.48,(0,0,0),1)
  if a is None or b is None:continue
  cv2.line(v,(xx(a),y),(xx(b),y),(0,130,0) if lab.startswith('G') else (30,30,30),4);cv2.circle(v,(xx((a+b)/2),y),4,(0,0,0),-1)
 cv2.putText(v,title,(20,35),0,.65,(0,0,0),2);cv2.putText(v,'Optical envelope short / long ratio (unitless)',(240,640),0,.6,(0,0,0),1);return v
with procedure('comparison',name='基準比較',inputs={'features':'upstream:features','overlay':'upstream:view'},outputs={'comparison':'comparison','result_view':'result_view'},parameters=parameters,justification=W) as pr:
 with step('compare',name='開發基準對照',parameters=parameters,inputs={'features':'upstream:features'},outputs={'comparison':'comparison'},justification=W) as st:
  current=[D.get('lower'),D.get('upper')];ratios=P['ratios'];center=float(np.median(ratios));deviation=D['proxyRatio']-center if D.get('proxyRatio') is not None else None
  intervals=P['intervals']+[current];labels=[f'G{i+1:02}' for i in range(len(ratios))]+['current']
  distribution=chart(intervals,labels,[G['goodUpper'],G['skewLower']],'12 GOOD development references + current interval')
  threshold_view=chart([current],['current'],G['trialCuts'],'Cut positions - current interval vs development guard band')
  limit_intervals=[[r['lower'],r['upper']] for r in D['candidates']];limit_labels=[f's{r["sigma"]}/t{r["level"]}' for r in D['candidates']]
  limits_view=chart(limit_intervals,limit_labels,[G['goodUpper'],G['skewLower']],'9 extraction settings + +/-2px dimension perturbation')
  usable=bool(D['usable'] and D.get('lower') is not None and D.get('upper') is not None)
  data={'valid':True,'usable':usable,'lower':D.get('lower'),'upper':D.get('upper'),'ratio':D.get('proxyRatio'),'baselineMedian':center,'deviation':deviation,'baseline':P,'decisionProposal':G,'boundaryChecks':D['boundaryChecks'],'limits':'DEVELOPMENT PROXY ONLY; no measured physical containment; other 40 defects untested; not blinded validation'}
  view=upstream['view']['image'].copy();cv2.putText(view,f'vs GOOD median {center:.5f}; delta {deviation:.5f}' if deviation is not None else 'UNKNOWN - no usable envelope',(20,125),0,.62,(255,255,255),2)
  save_image('result_view',view);save_image('distribution',distribution);save_image('threshold_view',threshold_view,section='parameters');save_image('limits_view',limits_view,section='boundary');save_json('comparison',data);st.set_output('comparison',data);st.set_output('boundaryChecks',D['boundaryChecks']);pr.set_output('comparison',data);pr.set_output('result_view','result_view')
result=data
