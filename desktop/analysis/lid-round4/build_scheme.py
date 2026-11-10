import json,pathlib
R=pathlib.Path(__file__).parent
p=R/'model.py';s=p.read_text()
s=s.replace("parameters={k:v for k,v in parameters.items() if k!='search'}", "parameters={k:v for k,v in parameters.items() if k not in ['search','cornerFit']}")
s=s.replace("['scan','lidPrior','pkgPrior','quality'])) as st:","['scan','lidPrior','pkgPrior','quality'],'edge_data','edge_view')) as st:")
s=s.replace("   st.set_output('selected',selected)","""   edgeview=image.copy()
   for tag,col in [('lid',(20,240,20)),('pkg',(255,180,0))]:
    for k,q in selected[tag].items():drawseg(edgeview,linepoints(k,q['pos'],q['slope'],box),col,q['kind']=='estimated',2)
   ep,_=plots(g,box,selected['lid'],selected['pkg'],selected['candidateLines'])
   save_image('edge_view',edgeview);save_image('edge_profiles',ep,section='parameters');save_json('edge_data',{'selected':selected,'trials':alltrials});st.set_output('selected',selected)""")
s=s.replace("'sensitivity' if", "'sensitivity' if")
s=s.replace("'profiles' if data=='geometry_data' else vis", "'corner_trials' if data=='geometry_data' and 'cornerFit' in groups else ('profiles' if data=='geometry_data' else ('edge_profiles' if data=='edge_data' else vis))")
s=s.replace("   save_image('corner_view',corner_view,section='boundary')", """   save_image('corner_view',corner_view,section='boundary')
   cpv=np.full((720,1100,3),255,np.uint8)
   for ci in range(4):
    ox=70+(ci%2)*550;oy=30+(ci//2)*350
    for z in [0,10,20,30]:
     yy=oy+270-z*7;cv2.line(cpv,(ox,yy),(ox+430,yy),(225,225,225),1);cv2.putText(cpv,str(z),(ox-35,yy),0,.4,(30,30,30),1)
    for tag,col in [('lid',(20,180,20)),('pkg',(220,130,0))]:
     rr=sorted(cornerdata[tag][ci]['trials'],key=lambda r:r['r']);pts=np.array([[ox+(q['r']-40)*4,oy+270-q['score']*7] for q in rr],np.int32);cv2.polylines(cpv,[pts],False,col,2)
    cv2.putText(cpv,['top-left','top-right','bottom-right','bottom-left'][ci],(ox,oy+18),0,.6,(0,0,0),1)
    for rad in [40,60,80,100,120,140]:cv2.putText(cpv,str(rad),(ox+(rad-40)*4-8,oy+295),0,.4,(0,0,0),1)
    cv2.putText(cpv,'radius px / gradient gray per px',(ox,oy+320),0,.5,(0,0,0),1)
   save_image('corner_trials',cpv,section='parameters')""")
p.write_text(s)
P=json.load(open(R/'parameters.json'))
old=json.load(open(R/'preserved_proxy_scheme.json'));old=old.get('scheme',old)
def selector(data,vis,caption):return {'kind':'artifact','type':'evidence','id':data,'visuals':[{'id':vis,'caption':caption}]}
reasons={'search':'低閾值65與sigma1.5只定搜尋域；不把最大亮連通區命名為pkg。未新增成像場景驗證。','scan':'斜率與梯度候選在相同完整原圖比較；sigma1/1.5/2.5敏感性保留。中央56%避開圓角；實際支持段之外是外推。','lidPrior':'從標註圖與11_15像素直邊推得梯度框約683x529，±10/12px為定位先驗；不是按外包絡比例分類。','pkgPrior':'11_15外露四邊約708x550px；±8px為暫用尺寸敏感範圍。僅用可見pkg左下邊定位，隱藏上/右邊標推估，不把焊道第二峰叫pkg。','quality':'3px實測線位、6px未分離邊、8px尺寸擾動為保守開發試驗；不是已校準誤差。含缺測、穩定性與完整包含檢查。','cornerFit':'40至140px圓角實掃，四角分別保留80%峰區；多峰/無獨立邊不算完整包含。半徑不是分類特徵。'}
why={'tool':{'reason':'由人類綠線確認lid身份；原圖左下露出帶是pkg。先量兩物體各自支持，遮擋邊以良品尺寸先驗推估，再計有正負號的lid到pkg邊距。完整包含與單側超出分開要求證據。','expectedEvidence':[selector('geometry_data','overlay','綠lid、青pkg；實線僅在實際支持段，虛線為外推或推估；上青線不再冒充lid。')]},'parameters':[{'name':k,'source':'agent-proposal','reason':reasons[k],'verification':selector('geometry_data','corner_trials' if k=='cornerFit' else 'profiles','原始剖面與圓角分數曲線顯示候選/歧義；設定完整保存，未宣稱最優。')} for k in P], 'boundaries':[{'condition':'UNKNOWN包含尚未分清的邊與圓角；尺寸先驗可能不適用其他批次，40張其他缺陷未驗證。','check':selector('geometry_data','uncertainty','三種平滑加逐邊線位與隱藏尺寸擾動，畫出正內負外區間；非95%置信或工業誤差保證。'),'onFailure':'UNKNOWN'}]}
img={'kind':'image','coordinates':{'frame':{'kind':'input','slot':'image'},'unit':'px'}}
images=['overlay','search_view','edge_view','edge_profiles','profiles','uncertainty','corner_view','corner_trials']
outs=[{'id':k,'type':'image','role':'result' if k=='overlay' else 'intermediate','dataContract':img if k in ['overlay','search_view','edge_view','corner_view'] else {'kind':'image','coordinates':{'frame':{'kind':'artifact','nodeId':'objects','artifactId':k},'unit':'px'}}} for k in images]+[{'id':k,'type':'evidence','dataContract':{'kind':'json'}} for k in ['geometry_data','geometry','search_data','edge_data']]
e=[{'nodeId':'objects','artifactId':'overlay','label':'兩層邊界：實測支持與尺寸推估分開'}]
spec={'schema':'agentcv-classification-spec-1','id':'lid-pkg-physical-development','provenance':[{'type':'human','status':'confirmed','ref':'thread:collab-lid-20261105-round4;turn:6b3eddd6-207a-4f2b-870b-6b8322dca531;lid超出pkg才是歪斜；未知不算良品，FAULT獨立'},{'type':'agent-inference','status':'inferred','ref':'analysis/lid-round4/parameters.json','authorization':'使用者允許尺寸先驗與遮擋推估；數值及模型為開發提案，不是人工驗收'}], 'categories':[{'id':'GOOD','label':'包含成立（僅歪斜檢查）','quality':'good','evidence':e},{'id':'SKEW','label':'lid超出pkg（開發幾何）','quality':'bad','evidence':e},{'id':'UNKNOWN','label':'兩物體關係證據不足','quality':'undetermined','evidence':e}], 'metrics':[{'id':'skewSupported','type':'boolean'},{'id':'containedSupported','type':'boolean'}], 'rules':[{'id':'overhang','categoryId':'SKEW','defectLabels':['lid超出pkg'],'when':{'metric':'skewSupported','equals':True},'evidence':e},{'id':'containment','categoryId':'GOOD','when':{'all':[{'metric':'skewSupported','equals':False},{'metric':'containedSupported','equals':True}]},'evidence':e}], 'coverage':{'policy':'fallback','fallbackCategoryId':'UNKNOWN'},'missing':{'NOT_FOUND':'UNKNOWN','MISSING':'UNKNOWN','SKIPPED':'UNKNOWN'},'conflicts':{'mode':'priority','priority':['overhang','containment']},'aggregation':{'mode':'priority','priority':['UNKNOWN','SKEW','GOOD']},'fault':{'exit':'FAULT'}}
scheme={'id':'lid-pkg-physical-development','version':1,'execution':{'unit':'workpiece','inputSlots':[{'id':'image','required':True}],'dataContracts':'required'},'classificationSpec':spec,'operatorGraph':{'nodes':[{'id':'objects','title':'兩層邊界','code':s,'parameters':P,'expected_outputs':outs,'justification':why}], 'edges':[]},'metricBindings':[{'metric':k,'nodeId':'objects','path':k} for k in ['skewSupported','containedSupported']]}
(R/'scheme.json').write_text(json.dumps(scheme,ensure_ascii=False,indent=2));(R/'justification.json').write_text(json.dumps(why,ensure_ascii=False,indent=2))
print('scheme bytes',len(json.dumps(scheme)))
