from pathlib import Path
import base64,json,shutil,hashlib
r=Path(__file__).resolve().parent
root=r.parents[1]
review=json.loads((r/'interaction-review.json').read_text())
cv=json.loads((r/'opencv-stories.json').read_text())
a=r/'assets';a.mkdir(exist_ok=True)
source=root/'reviews/2026-10-26-pi-presentation/isolated-acceptance-project/assets/7bf06dd945fc7a0bdbf3d34b7b8514e6daec7c331ea3fc8030a8a56ad7009c67.jpg'
shutil.copy2(source,a/'crystal-camera.jpg')
crystal_image={'path':'assets/crystal-camera.jpg','width':1280,'height':1024,'label':'晶振原圖','nature':'使用者相機原圖','role':'本圖','isSynthetic':False,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
history_run=json.loads((root/'desktop/runtime/cv-runs/py-65ebe12e61cee-25676-0/result.json').read_text())
history_artifact=next(item for item in history_run['artifacts'] if item['id']=='overlay')
shutil.copy2(history_artifact['path'],a/'crystal-history-overlay.png')
history_image={'path':'assets/crystal-history-overlay.png','width':1280,'height':1024,'label':'歷史找邊圖・只作參照','nature':'歷史運算產物，非本稿新結果','role':'reference-only','isHistory':True,'isSynthetic':False,'sha256':history_artifact['sha256']}
crystals=[]
for original in reversed(review['stories']):
 offset=original['id']=='crystal-relative-offset'
 shapes=[{'type':'rect','x':164,'y':80,'width':1032,'height':780,'label':'#1 基座：人的指認','labelX':70,'labelY':65},{'type':'rect','x':190,'y':109,'width':978,'height':717,'label':'#2 蓋板：人的指認','labelX':70,'labelY':200}] if offset else [{'type':'line','x1':380,'y1':84,'x2':982,'y2':84,'label':'#1 我要量這圈'},{'type':'rect','x':355,'y':48,'width':660,'height':88,'label':'#2 找線控件：可拖動／實算'}]
 agent_shapes=[{'type':'rect','x':164,'y':80,'width':1032,'height':780,'label':'預期：兩組完整邊線','labelX':630,'labelY':40},{'type':'rect','x':190,'y':109,'width':978,'height':717,'label':''},{'type':'line','x1':680,'y1':460,'x2':715,'y2':439,'label':'相對位移：待實算','labelX':630,'labelY':350},{'type':'circle','cx':680,'cy':460,'r':10,'label':'#1 中心（示意）','labelX':360,'labelY':490},{'type':'circle','cx':715,'cy':439,'r':10,'label':'#2 中心（示意）','labelX':865,'labelY':545}] if offset else [{'type':'line','x1':164,'y1':900,'x2':1196,'y2':900,'label':'寬度：待實算'},{'type':'line','x1':1240,'y1':80,'x2':1240,'y2':860,'label':'高度：待實算'}]
 goal='這兩層分別是蓋板和基座。兩層的邊都用同一套條件找，量相對中心偏移，再看各側餘量。' if offset else '量我指出的這一圈外框的寬和高；不是反光帶，也不是手繪框的尺寸。'
 human=['分別圈出兩層，直接命名並畫出「相對於」關係。','需要精準指向時，在其中一側放找線控件，點實算候選；把「同一套參數」寫在這次問題上。'] if offset else ['在要量的交界畫提示線、圈一段，或直接放找線控件點選候選。','原位加一句「量這一圈的寬和高」，引用圖元交給 Agent；不另填檢查方式。']
 story={'humanExpression':human,'agentFirstReturn':('我會把兩層的完整邊線、各自中心及相對偏移一起畫回來，並標出四側餘量。所有側都保持你要求的同一套條件；有歧義就直接標在原位置。' if offset else '我會搜尋你指的那圈真實交界，把四側候選、採用線及寬高畫回原圖。反光帶不會直接當成工件邊；不清楚的位置會另外標出。'),'correction':original['frames'][3]['human']+' '+original['frames'][3]['agent'],'completion':original['definitionOfDone'],'unknown':'具體標出哪個對象、哪一側、哪個前提不成立，保留其餘有效部分。人工指認位置與量測精度分開；Agent須就缺口繼續提出可檢驗的下一步，不能反覆只回UNKNOWN。','tools':['鋼筆／掩膜','文字與關係箭頭','真實找線控件','候選點選／排除','多圖同板'],'multiImageRelation':'原圖是本次計算來源；第二張歷史找邊產物只作參照，不算第二張待測實例，也不是這份PRD的新計算。可再加入NG實例或工程資料。'}
 crystals.append({'id':original['id'],'title':'晶振：兩層相對偏移' if offset else '晶振：任意輪廓寬高','goal':goal,'userStory':original['userStory'],'hero':crystal_image,'images':[crystal_image,history_image],'references':[],'story':story,'overlays':{'human':shapes,'agent':agent_shapes,'status':'PRD互動示意／待實算','basis':'僅用來說明人在圖上如何指認及預期回圖；圖元位置不是演算法輸出、人工真值或正式公差。'},'outputNeeds':['兩層完整幾何與兩個中心','水平／垂直偏移及總偏移','各側餘量與不可判定位置'] if offset else ['本圖實算邊線與多候選','寬、高與有效尺度','逐側拒因與跨圖結果'],'sourceReferences':original['id'],'originalFrames':original['frames'],'label':'晶振 B' if not offset else '晶振 A'})
stories=crystals
for i,s in enumerate(cv['stories']):
 def copy_image(image,index):
  src=Path(image['absolutePath']);name=f'{s["id"]}-{index}{src.suffix.lower()}';shutil.copy2(src,a/name)
  return {'path':'assets/'+name,'width':image['width'],'height':image['height'],'label':image.get('label',name),'nature':image.get('nature') or ('合成測試圖' if image.get('isSynthetic') else 'OpenCV來源圖'),'role':image.get('role','參照'),'isSynthetic':image.get('isSynthetic',False),'containsUpstreamOutput':image.get('containsUpstreamOutput',False),'upstream':image.get('upstream'),'sha256':image.get('sha256')}
 images=[copy_image(im,j) for j,im in enumerate(s['images'])]
 hero=next(im for im in images if im['sha256']==s['hero']['sha256'])
 stories.append({'id':s['id'],'title':s['title'],'goal':s['goal'],'userStory':s['userStory'],'hero':hero,'images':images,'references':s.get('references',[]),'story':s['story'],'overlays':s['overlays'],'outputNeeds':s['outputNeeds'],'sourceReferences':s['sourceReferences'],'sourceNature':s['sourceCategory'],'truthLimit':s['truthLimit'],'label':f'OpenCV {i+1:02d}'})
payload={'schema':'agentcv-user-story-prd-draft-1','version':'0.1','date':'2026-10-26','status':'DISCUSSION_DRAFT','core':review['core'],'stories':stories,'criteria':review['cleanInteractionCriteria'],'decisions':review['alignmentDecisions'],'risks':review['prdRisks'],'sourceCollection':'../../research/opencv-traditional-10-2026-10-25/index.html','originalConsensus':'../../reviews/2026-10-24-workflow/rounds.json'}
(r/'prd.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2))
template=(r/'template.html').read_text()
(r/'index.html').write_text(template.replace('/*__PRD_DATA__*/',json.dumps(payload,ensure_ascii=False).replace('</','<\\/')))
print(json.dumps({'output':str(r/'index.html'),'stories':len(stories),'assets':len(list(a.iterdir())),'status':'discussion draft, no product implementation'},ensure_ascii=False))
