import pathlib,json,hashlib,copy
R=pathlib.Path(__file__).parent;old=R.parent/'lid-round4'
P=json.load(open(old/'parameters.json'));P.pop('cornerFit')
P['poseModel']={'lidWidth':687,'lidHeight':532,'lidWidthScale':6,'lidHeightScale':6,'lidWidthLimit':10,'lidHeightLimit':10,'pkgWidth':708,'pkgHeight':550,'pkgWidthLimit':10,'pkgHeightLimit':10,'arcScoreWeight':.15,'residualQuantile':.9,'maxNormalResidualPx':5,'minRadiusScore':.7,'minArcCoverage':.7,'minArcCorners':3,'sideSamples':61}
P['radiusModel']={'radiusRange':[40,140],'radiusStep':2,'angleRangeDeg':[5,85],'samples':41,'normalOffsets':[-6,-3,0,3,6],'lidBrightFloor':100,'lidBrightScale':80,'pkgDarkCeiling':110,'pkgDarkScale':60,'independentArcDistancePx':4,'minVisibleSamples':9,'gradientClip':20,'gradientMin':3,'minimumCornerPeak':2,'minSupportedCorners':2,'relativeFamilyScore':.8}
P['decision']={'pixelTolerancePx':4,'candidateScoreDelta':2,'deltaTrials':[.5,1,2,3],'toleranceTrialsPx':[0,3,4,5]}
P['display']={'cropHalfSize':110,'description':'crop/render settings only, no classification effect'}
for k in ['cornersConfirmed','cornerClearancePx','displayCornerRadius']:P['quality'].pop(k,None)
reasons={
'search':'繼承第四輪65灰階搜尋、sigma1.5；只找搜尋域，不把亮連通區命名為pkg。未比較新照明。',
'scan':'繼承中央56%、121點、±70px、斜率±.06/步長.002。每件實比sigma1/1.5/2.5，五組四邊候選保留；不從檔名/ID選峰。',
'lidPrior':'繼承梯度框683x529、尺度10/12px，來源第四輪人類示教身份及開發像素。此為找峰先驗，不是物理邊界或分類規格。',
'pkgPrior':'繼承708x550px與8px尺寸尺度，源於開發良品外露邊；有獨立一橫一豎外露帶才可推估遮擋。換lid候選時固定pkg支持。',
'quality':'繼承逐邊3px/未解邊6px/尺寸8px敏感性與分離4px，僅用於方向性SKEW證據。亮背景80及暗縫對比6為歷史設定；不當已校準誤差。',
'poseModel':'本輪12張已授權good的舊實測邊經正交pose擬合，lid約684.5–688.3 x 529.8–537.0，選687x532，尺寸評分尺度6px；允收±10px。實測段90百分位法向殘差上限5px，區分模型殘差與絕對定位誤差。破碎pkg邊若90百分位殘差>5px且對邊有支持，保留拒絕點並以對邊+尺寸推估；不放寬品質上限。共同角支持>=3、分數>=.7、覆蓋>=.7為開發品質範圍，保存各候選，並非精度校準。',
'radiusModel':'40–140px逐2px，共同半徑但兩物體各自pose；四角歸一化分數等權，遮住pkg角不計。±6px剖面以lid內側亮肩(100到180)、pkg外側背景(110到50)加權；真曲線比較原始梯度與加權結果，排除pkg外沿被叫lid。80%候選族仍保留，不要求各角獨立半徑小範圍。灰階設定為本批開發提案，未做跨光源校準。',
'decision':'開發像素容差4px，以本批名義可見邊90百分位殘差最高約3.75px向上取整作開發提案，並比對同分候選族最低-3.40px；非為其他工件制定標準；不是毫米公差/95%誤差。逐件實比容差0/3/4/5與分數差.5/1/2/3，正式選差2。若可用模型族越出容差仍UNKNOWN；方向性SKEW優先保留。',
'display':'110px半寬局部圖保持原像素比例；顯示設定不參與分類，未調優。'}
header='''import cv2,numpy as np,itertools,math
SIDES=['top','bottom','left','right']
def sel(d,v,c):return {'kind':'artifact','type':'evidence','id':d,'visuals':[{'id':v,'caption':c}]}
def why(reason,groups,data='geometry_data',vis='overlay',pv=None,bv=None):
 if pv is None:pv='edge_profiles' if data=='edge_data' else vis
 if bv is None:bv=vis
 return {'tool':{'reason':reason,'expectedEvidence':[sel(data,vis,'本次原圖支持與模型估計分開；虛線不冒充物理測得輪廓。')]},'parameters':[{'name':k,'source':'agent-proposal','reason':REASONS[k],'verification':sel(data,pv,'同一輸入的實際候選/剖面與設定；未比較者明示為暫用。')} for k in groups],'boundaries':[{'condition':'獨立物體支持、整體幾何與候選歧義須符合開發範圍；絕對精度/其他缺陷/其他40張仍未驗證。','check':sel(data,bv,'本件真實候選、殘差或支持圖；校準缺口不阻塞已授權開發判別。'),'onFailure':'UNKNOWN'}]}
'''
source=(old/'model.py').read_text();defs=source[source.index('def locate('):source.index('def corners(')]
# Preserve fourth-round directional reconstruction verbatim, register its parameters.
entry=source[source.index("with procedure('objects'"):source.index("  with step('shape'")]
entry=entry.replace("parameters={k:v for k,v in parameters.items() if k not in ['search','cornerFit']}","parameters={k:parameters[k] for k in ['scan','lidPrior','pkgPrior','quality']}")
entry=entry.replace("outputs={'geometry_data':'geometry_data','overlay':'overlay'},parameters={k:parameters[k]", "outputs={'edge_data':'edge_data'},parameters={k:parameters[k]")
code=header+'REASONS='+repr(reasons)+'\n'+defs+(R/'coherent.py').read_text()+'\n'+entry+(R/'finish_model.py').read_text()
compile(code,'round5','exec');(R/'model.py').write_text(code);(R/'parameters.json').write_text(json.dumps(P,ensure_ascii=False,indent=2))
base=json.load(open(old/'final_scheme_snapshot.json'));base=base.get('scheme',base)
(R/'preserved_round4_scheme.json').write_text(json.dumps(base,ensure_ascii=False,indent=2)) if not (R/'preserved_round4_scheme.json').exists() else None
scheme=copy.deepcopy(base);scheme['id']='lid-pkg-coherent-development-r5';scheme['version']=1
scheme.pop('fingerprints',None)
spec=scheme['classificationSpec'];spec['id']=scheme['id'];spec['categories'][0]['label']='模型內未見超容差越界，僅歪斜檢查'
spec['provenance'].append({'type':'agent-inference','status':'inferred','ref':'thread:collab-lid-20261105-round5;turn:f4f9d735-b3b3-46a8-b37d-6029cb47a624;analysis/lid-round5/parameters.json','authorization':'人類明確授權以12張good建立開發像素容差/形狀範圍；非獨立人工驗收'})
images=['search_view','edge_view','edge_profiles','model_view','radius_trials','candidate_trials','details','overlay','model_clearance','decision_trials']
coords={'kind':'image','coordinates':{'frame':{'kind':'input','slot':'image'},'unit':'px'}}
outs=[{'id':k,'type':'image','role':'result' if k=='overlay' else 'intermediate','dataContract':coords if k in ['search_view','edge_view','model_view','overlay'] else {'kind':'image','coordinates':{'frame':{'kind':'artifact','nodeId':'objects','artifactId':k},'unit':'px'}}} for k in images]+[{'id':k,'type':'evidence','dataContract':{'kind':'json'}} for k in ['search_data','edge_data','model_data','geometry_data','geometry']]
ns={};exec(header+'REASONS='+repr(reasons),ns);just=ns['why']('由兩物體獨立邊支持建立各自單pose圓角矩形，保留方向性越界證據，再做已授權開發像素包含分類。',list(P),'geometry_data','overlay','radius_trials','model_clearance')
scheme['operatorGraph']={'nodes':[{'id':'objects','title':'兩層邊界','code':code,'parameters':P,'expected_outputs':outs,'justification':just}],'edges':[]}
(R/'scheme.json').write_text(json.dumps(scheme,ensure_ascii=False,indent=2));(R/'justification.json').write_text(json.dumps(just,ensure_ascii=False,indent=2))
print('code sha256',hashlib.sha256(code.encode()).hexdigest(),'bytes',len(code))
