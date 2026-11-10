import json,pathlib,hashlib,collections,math,ast
R=pathlib.Path(__file__).parent
batch=json.load(open(R/'host_execution.json'));rows=json.load(open(R/'host_geometry.json'));runs=json.load(open(R/'host_runs.json'))
prior=json.load(open(R.parent.parent/'runtime/collab-lid/round5/reviewed-failures.json'))
manifest=json.load(open(R.parent/'lid-round4/development_manifest.json'))['images'];byid={m['id']:m for m in manifest}
notes=[
'lid上沿在pkg推估上沿外側；左、下pkg外露帶清楚。lid左/下暗縫與上/右外輪廓身份一致；上側SKEW沿用方向性證據。',
'lid向上/左旋轉，pkg由右/下外露帶定位；左側未分離不再阻擋上側判斷。lid下沿虛線仍為估計。',
'lid上側大幅超出；右/下pkg外露帶獨立。完整GOOD模型品質未成立，但不影響方向性SKEW。',
'lid上沿在pkg上側推估線外；下側露出帶支持pkg。右沿兩者貼近，仍不把右側近峰當越界必要條件。',
'左側lid估計線靠近外沿，四角共享半徑後連接一致；右/上/下pkg有外露支持，未把左側未解暗縫當直接測得。',
'右側原像素是亮焊道外的灰階肩部，兩層分離弱；右側lid保持推估，其他邊與共同圓角支持單pose。另讀details四角/右側原圖對照。',
'左側光帶近乎合併，模型補左邊；上/右外露pkg及下沿提供支持。圓角外輪廓與焊道分開，候選族跨零但未超4px開發容差。',
'上側窄帶及右上圓角多峰；原始梯度共同半徑42px貼pkg外沿，亮肩身份加權改選90px lid，兩組曲線保留並目檢。',
'左側不連續暗凹仍可見；右、上、下可約束pkg，左線標推估。刮痕在本任務範圍外，GOOD只指歪斜檢查。',
'下側寬焊道有兩組候選；整體長寬與圓角支持選候選1，pkg固定由外露帶約束。左側很窄，名義模型間隙約2.67px。',
'上側光帶緊貼，右外沿可辨；綠lid線沒有跳到內部焊道亮峰，四角一致；本件候選族最小仍4.35px。',
'左側破碎外沿是最敏感例；sigma1的pkg左支持90百分位殘差5.46px被拒絕，保存原點，以右側+尺寸推估。名義1.88px、候選族-3.40px；3px時UNKNOWN，4px開發模型下GOOD，非精密證明。',
'左側凹口/斷裂不可當兩物體越界，pkg左側由右/下及尺寸模型補；原圖右角與模型相符。保留其他瑕疵未檢查聲明。',
'上沿很窄但有連續亮肩；四角及右側共同模型保持一致，左側小間隙仍為模型層級判定。',
'頂部長亮帶與焊道峰共存；所選lid直邊與角連接合理，pkg外沿保持獨立；細亮片身份未獨立標註，未宣稱材質精密邊界。',
'下側亮帶後缺穩定獨立暗縫，lid下沿保持推估；上/左右可見支持配合共同形狀限定輪廓。右下角模型沒有採用內側焊道峰。']
assert batch['processed']==batch['total']==16
assert sum(batch['counts']['exits'].values())==16
assert sum(batch['counts']['categories'].values())==16
assert {u['imageIds'][0] for u in batch['units']}=={x['imageId'] for x in prior}
code=(R/'model.py').read_bytes();codehash=hashlib.sha256(code).hexdigest()
items=[];audit=[]
for i,(row,rr,u,n) in enumerate(zip(rows,runs,batch['units'],notes)):
 d=row['value'];run=rr['run'];m=byid[u['imageIds'][0]]
 assert row['runId']==u['runIds'][0]==run['runId']
 assert run['codeSha256']==codehash
 assert run['sourceBinding']['images'][0]['contentSha256']==m['contentSha256']
 assert run['sourceBinding']['schemeFingerprint']==batch['schemeFingerprint']
 assert run['evidenceAudit']['status']=='READY_FOR_REVIEW'
 assert d['classificationHint']==u['categoryId']
 pa=run['evidenceAudit']['procedureAudit'];assert all(not x['errors'] for x in pa['nodes'])
 a={'i':i,'imageId':m['id'],'name':m['name'],'contentSha256':m['contentSha256'],'expected':u['expectedClassification'],'actual':u['categoryId'],'previous':prior[i]['actual'],'runId':run['runId'],'recordRef':u['recordRef'],'clearance':d['modelClearance'],'modelQuality':d['modelQuality'],'visualObservation':n,'visualArtifacts':['overlay']+(['details'] if i in [5,11] else [])+(['radius_trials'] if i==7 else []),'humanConfirmedVisualReview':False}
 items.append(a);audit.append({'imageId':m['id'],'runId':run['runId'],'sourceBinding':run['sourceBinding'],'evidenceStatus':run['evidenceAudit']['status'],'procedureStatus':pa['status'],'stepCount':len(pa['nodes'])})
result={'author':'agent','humanConfirmed':False,'method':'16張逐張get_visual_image(reference_json, run_id, artifact_id=overlay)讀封存真像素；另讀第5/11 details及第7 radius_trials（0-based）。不是獨立人工GT。','executionId':batch['id'],'items':items}
(R/'visual_review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
(R/'delivery_audit.json').write_text(json.dumps({'codeSha256':codehash,'schemeFingerprint':batch['schemeFingerprint'],'same16Inputs':True,'conservation':True,'independentAcceptance':False,'other40Tested':False,'records':audit},ensure_ascii=False,indent=2))
# Reproducible aggregate parameter comparison from host-produced per-image trials.
summ=[]
for delta,tol in [(de,to) for de in [.5,1,2,3] for to in [0,3,4,5]]:
 cs=collections.Counter(next(t['category'] for t in x['value']['decisionTrials'] if t['scoreDelta']==delta and t['pixelTolerancePx']==tol) for x in rows)
 summ.append({'scoreDelta':delta,'pixelTolerancePx':tol,'counts':dict(cs),'sourceExecutionId':batch['id']})
(R/'parameter_comparison.json').write_text(json.dumps(summ,indent=2))
sourceManifest={'scope':'same 16 development images; labels are external scoring only','images':manifest}
(R/'development_manifest.json').write_text(json.dumps(sourceManifest,ensure_ascii=False,indent=2))
print('Verified',batch['counts']['categories'],'code',codehash)
print('table')
for a in items:print(f"| {a['i']+1} | {a['name']} | {a['actual']} | {a['clearance']['nominalPx']:.2f} | {a['clearance']['candidateFamilyMinimumPx']} |")
