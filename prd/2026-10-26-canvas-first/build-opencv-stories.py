from pathlib import Path
from PIL import Image
import json,hashlib
ROOT=Path('/Users/liangshiben/13-cv')
SOURCE=ROOT/'research/opencv-traditional-10-2026-10-25'
DEST=ROOT/'prd/2026-10-26-canvas-first'
cases=json.loads((SOURCE/'cases.json').read_text())
manifest=json.loads((SOURCE/'test-manifest.json').read_text())
annotations=json.loads((SOURCE/'annotations.json').read_text())
truth={x['file']:x for x in annotations['images']}
files={f['file']:f for c in manifest['cases'] for f in c['files']}
# Product interactions below are proposals for review, not algorithm executions.
stories={
'gear':{
 'userStory':'作為檢驗工程師，我想直接指著齒輪詢問是否缺齒及缺口在哪，不必先選齒輪模式或填算法參數。',
 'humanGoal':'幫我看這一件的齒是否完整，把疑似少齒的位置圈給我看。',
 'boardExpression':['把完整與待測齒輪放在同一畫板；完整圖可標為「參考」，品質答案與待測圖分開。','圈出工件或一段齒緣並說明目標；已有明確物件時，直接點物件提問。'],
 'tools':['選取／移動圖片','鋼筆或掩膜圈選','箭頭＋物件註解','可選：找圓提供孔中心意圖'],
 'agentFirstReturn':'先在原圖回畫採用的真實外輪廓、孔、中心與逐齒編號；疑似缺口在原圖有可點選角區。點該角區，可連動看局部原圖與角向數據。',
 'sceneCorrection':'若中心抓錯，工程師點原圖的另一個中心候選，或用找圓工具在孔上實算後點選；Agent 保留選擇及原因，重算同一方案，而非要求重建案例。',
 'done':['每個實際可見齒及疑似缺口都能回指原圖；預期位置與實測位置使用不同符號。','沒有正式名義齒數／缺陷規格時可先報觀察和候選，不擅自判工業OK／NG。','針對已提供的本例設計規格做整組完整／缺齒／偏心的回歸，不只挑一張成功。'],
 'unknown':'輪廓不完整或多個中心導致缺口位置不穩時，在圖上標失效區並給出相應觀察；不得把凸包填出的齒谷或預期齒位置當測點。',
 'multiImageRelation':'3張合成圖共用同一玩具設計來源；完整圖是參考，缺齒／偏心是同源反例，不是獨立實拍批次。',
 'anchors':[{'image':'synthetic/gear-ok.png','kind':'point','xy':[256,256],'label':'設計中心','basis':'annotations.json generated design；非算法量測'},{'image':'synthetic/gear-eccentric.png','kind':'point','xy':[268,256],'label':'設計偏心孔中心','basis':'annotations.json generated design；非算法量測'}]
},
'washer':{
 'userStory':'作為量測工程師，我想在圖上指出要量的內外兩條邊與它們的中心關係，直接檢查偏心，而不是先選圓環任務。',
 'humanGoal':'我要量這兩圈的直徑，以及它們兩個中心相差多少。',
 'boardExpression':['在同一原圖上圈兩個環帶，文字分別叫「外緣」與「內孔」。','可直接拖入同心參考圖和偏心待測圖，畫箭頭表達要比較的中心關係。'],
 'tools':['環形／自由ROI','找圓：即時計算全部候選','點候選圓採用','關係箭頭與文字'],
 'agentFirstReturn':'在原圖同時畫出全部合格圓候選，將擬採用的內外兩圈分色，附真正支持點、兩個中心與連線；數值放在圖下，展開可看周向支持及殘差。',
 'sceneCorrection':'遇到倒角或陰影產生多個圓，工程師在原圖點另一個候選、移動環形ROI或直接說「要這條外緣」；選擇記錄為意圖，Agent 按新意圖重算。',
 'done':['兩個圓的角色與支持點清楚，沒有把最小包圍圓默認當量測圓。','提供px尺寸與中心距；要求mm時使用同成像條件有效標定，不能只靠倍率。','同心／偏心兩張在同一方案下驗證；被遮擋的角區與不足支持不補造。'],
 'unknown':'透視、橢圓或局部反光令某條邊支持不足時，指出是哪一圈及哪個角區失效，不能只給整張UNKNOWN。',
 'multiImageRelation':'兩張合成環件提供同源對照；smarties只是額外圓候選素材，不能拿其圓徑當墊圈尺寸標準。',
 'anchors':[{'image':'synthetic/washer-eccentric.png','kind':'circle','center':[256,256],'radius':156,'label':'設計外圓','basis':'annotations.json generated design；非找圓輸出'},{'image':'synthetic/washer-eccentric.png','kind':'circle','center':[272,256],'radius':78,'label':'設計內圓','basis':'annotations.json generated design；非找圓輸出'}]
},
'holes':{
 'userStory':'作為工程師，我想直接指出哪個工件、哪些區域算孔，以及相對哪條基準量位置；系統能理解包含與基準關係。',
 'humanGoal':'這些孔屬於這塊板；幫我查有沒有少孔，並以這條邊為基準比較孔位。',
 'boardExpression':['圈工件，點一個孔並說「像這樣的封閉內孔」；在原圖標基準邊。','把三孔參考圖、缺孔圖、開口圖放在同一畫板；可在開口處註解「這個連到外面，不算封閉孔」。'],
 'tools':['鋼筆／掩膜','找直線作基準候選','找圓或點選孔候選','包含關係箭頭'],
 'agentFirstReturn':'回圖列出工件外形、封閉孔ID與開口，使用不同標記；顯示工件局部基準、實際孔位與參考孔位的連線，缺孔是「預期位置」而非捏造測點。',
 'sceneCorrection':'若把開槽當孔，工程師點該候選說「連到外部，不是孔」；或改點真正基準線。Agent 修正物件關係與方案，再跑三張，不要求先找算法選單。',
 'done':['孔與所屬工件、基準、孔ID匹配均能回圖核對；一張圖可有多個孔級結果。','沒有名義孔位或公差時只報測得位置及差異，不從參考圖自造製造公差。','三孔、少孔、外連開口三種設計狀態分開處理。'],
 'unknown':'不可見的孔不能一律等於真實缺孔；基準無法可靠建立時，保留可見孔的觀察，孔位尺寸與規格判定明確失效。',
 'multiImageRelation':'三張鈑金圖是同一合成設計的衍生反例；官方hierarchy圖是解釋輪廓包含關係的教學素材，不作實拍輸入。',
 'anchors':[{'image':'synthetic/panel-ok.png','kind':'points','points':[[150,256],[256,256],[362,256]],'labels':['H1','H2','H3'],'basis':'annotations.json nominalHoles；設計位置，非實算孔中心'}]
},
'orientation':{
 'userStory':'作為工程師，我想一次指出一圖中哪些是零件、哪個方向算朝向，取得逐件結果，而不是先選角度量測類型。',
 'humanGoal':'檢查每一個零件的擺放方向；這個方向是我所說的朝向。',
 'boardExpression':['點一個實際零件表示「這種物件」，再畫一根方向箭頭。','若要分頭尾，直接在可辨識端部點註解；不要求工程師填PCA或角度算法。'],
 'tools':['點選多個對象','方向箭頭','鋼筆排除板框','可選：找直線作方向基準'],
 'agentFirstReturn':'在原圖逐件編號，畫採用輪廓、中心及方向箭頭；板框和背景另列排除。每件可點選查看方向支持、角度與歧義狀態。',
 'sceneCorrection':'工程師直接刪掉誤識別的板框對象，或翻轉某一件的方向箭頭並解釋頭部特徵；Agent 將這個局部修正轉為可回歸的識別意圖。',
 'done':['每件都有自己的結果與對應原圖，不用一個總結果代表整圖。','無法區分頭尾時，顯示無向角或雙向箭頭；只有提供頭尾證據才顯示有向朝向。','新增同類件或換位置後可用同方案重跑，而非手填每件角度答案。'],
 'unknown':'近對稱／近圓形件、黏連件或不可辨識頭尾時，只拒絕對應的方向判定，圖上清楚顯示需要哪個提示。',
 'multiImageRelation':'pca_test1是官方原圖；pca_output只是官方教學結果，不可冒充平台的首次回圖或角度真值。',
 'anchors':[]
},
 'touching':{
 'userStory':'作為工程師，我想在重疊或接觸的物件上直接表達「這是兩件」或「這其實是一件」，而非用算法參數猜分界。',
 'humanGoal':'把接觸在一起的物件分開，告訴我有幾件；分界也要畫出來。',
 'boardExpression':['圈出整群顆粒或兩顆接觸處，直接發問。','歧義時在每一件內部各點一下，或畫「應分開／應合併」的短筆劃；可同時引用局部放大與原圖。'],
 'tools':['掩膜與畫筆','點提示','分離／合併語意註解','多圖同板放大對照'],
 'agentFirstReturn':'原圖疊上逐件分色遮罩、ID與候選分界；另可切換距離／支持圖看分界依據，不先把中間圖當唯一的正確分割。',
 'sceneCorrection':'若兩件被合併，工程師在它們內部各點一個提示；若一件被切成兩塊，圈兩塊說「同一件」。Agent 回傳更新前後遮罩與ID變更，不要求填種子門檻。',
 'done':['每個計數都有可見實例，而非只交總數。','局部修正、來源及重算範圍被記錄；多分和少分不會因總數恰好相等而被掩蓋。','另跑接觸程度不同的圖片；反覆手改只作用於單圖時須明示，不能稱為通用分離規則。'],
 'unknown':'嚴重遮擋、沒有可辨界線且人也無法確定實際件數時，保留該區歧義；不從不可見區域補造物件。',
 'multiImageRelation':'硬幣原圖為官方示例；距離／種子／分水嶺結果是官方教學產物。密集圓珠是另一真實場景，尺寸與數量分布不同，不能直接當相同樣品的驗證圖。',
 'anchors':[]
},
'continuity':{
 'userStory':'作為工程師，我想畫出哪兩端應連通、哪兩條線應分離，讓Agent檢查這個關係是否被破壞。',
 'humanGoal':'這一條的兩端應該連著；相鄰兩條不能搭在一起。找出斷口或橋接位置。',
 'boardExpression':['在原圖點兩個端點，用連線／文字表達「應連通」；對相鄰線表達「應分離」。','拖入完整、斷線、橋接三張圖，在缺陷局部圈畫並標為對照例。'],
 'tools':['端點標記','關係連線與註解','鋼筆／掩膜限定線區','可選：找直線提供支持範圍'],
 'agentFirstReturn':'在未修補的原圖上編出每條線與端點，圈出實際斷口／橋接候選；用圖表示「應連通／實際是否連通」，處理前後像素可切換對照。',
 'sceneCorrection':'若正常交點被當短接，直接點該位置註記「這裡本來就允許相連」；若降噪補掉斷口，在前後圖上指出差異。Agent 改關係定義或預處理並回放三張。',
 'done':['斷線與橋接分項定位，保留原始缺陷像素。','不以修補後變連通作為原件合格證據。','每項規則能回指人指定的端點／網路關係；最小可檢缺口要經實拍驗證。'],
 'unknown':'缺口小於成像可辨能力或遮罩不穩時，標明該條線、該局部的失效原因；不能因沒檢出就判沒有斷口。',
 'multiImageRelation':'3張線柵為同源合成關係反例；notes是官方樂譜，不是真PCB，也不等於已有導線工業數據。',
 'anchors':[{'image':'synthetic/traces-break.png','kind':'rect','xywh':[250,211,14,16],'label':'設計斷口區','basis':'annotations.json defectRegion；人工設計真值，非CV回圖'},{'image':'synthetic/traces-bridge.png','kind':'rect','xywh':[285,227,14,58],'label':'設計橋接區','basis':'annotations.json defectRegion；人工設計真值，非CV回圖'}]
},
'color':{
 'userStory':'作為分揀工程師，我想直接在實物上指幾種顏色並命名，讓系統找出每件類別與混料，而非先輸入色彩閾值。',
 'humanGoal':'這幾種是我接受的顏色，把每件分出來並標出不屬於這些顏色的物件。',
 'boardExpression':['在代表物件的內部用小掩膜取樣，直接命名類別；避開背景和高光。','可加入更多批次或反例圖，點物件標真實類別／未知；類別名稱由人給，不是軟件固定下拉表。'],
 'tools':['畫筆取樣與掩膜','物件點選','文字命名類別','同板多圖例與反例'],
 'agentFirstReturn':'原圖逐件編號及色標，旁邊顯示本次有效採樣像素與顏色分布；點類別可看它實際收進哪些像素，未知物件保留獨立顏色標記。',
 'sceneCorrection':'工程師直接把錯分類物件改成正確類別，或圈掉高光說「不要用這些像素判色」；Agent 比較修改前後分布與混淆，而不是要人猜HSV數字。',
 'done':['分類是逐件聚合，不以全圖某色像素數當件數。','新色、混色與強高光可被拒絕；不硬塞最接近的已知類。','顏色示教圖和保留驗證圖分組，列逐件混淆與UNKNOWN，不自造人工色標真值。'],
 'unknown':'光照／白平衡漂移、有效像素不足或類別重疊時，直接在相應物件上顯示未知與原因。',
 'multiImageRelation':'smarties為官方單張照片，也出現在圓物件案例；同一圖的重用不增加獨立樣本數，逐件人工色標目前未提供。',
 'anchors':[]
},
'pose':{
 'userStory':'作為工程師，我想把參考圖與現場圖放在一起，指出「找這個東西」，並把後續檢查區搬到它現在的位置。',
 'humanGoal':'在這張場景裡找到參考圖這個標籤，把我畫的檢查區一起搬過去。',
 'boardExpression':['把參考物和場景圖拖進同一畫板，用引用／箭頭表達它們是同一個目標。','在參考圖畫檢查ROI；必要時在場景中點一下期望的那個同款實例。'],
 'tools':['多圖同板','鋼筆／矩形ROI','圖片之間的對應箭頭','候選實例點選'],
 'agentFirstReturn':'同板回畫參考物與場景候選的四角、對應支持與搬移後ROI；可點開矯正局部圖，並看有效覆蓋範圍，原圖座標與矯正座標分清。',
 'sceneCorrection':'多個相似標籤時直接點要找的那一件；背景特徵被採用時在原圖劃除它們；Agent 依修正回傳新候選與差異，不要求人填變換矩陣。',
 'done':['定位結果及跟隨ROI都能在現場原圖核對。','參考圖和場景來源始終成對保存，不能只量已矯正圖而丟失原圖映射。','目標位置正確與後續品質OK／NG分開確認。'],
 'unknown':'無足夠可見支持、重複目標不能唯一決定或平面假設失效時，圈出不確定候選／無效ROI區，不硬搬檢查區。',
 'multiImageRelation':'box.png是參考模板，box_in_scene.png是場景；doc-homography_findobj是官方教學輸出，不能充當平台已完成定位。',
 'anchors':[]
},
'difference':{
 'userStory':'作為印刷檢驗工程師，我想直接對照良品與待測圖，指出要找缺印／異物，也能說明哪個區域不需要比較。',
 'humanGoal':'把這張和良品對好後，找真正的缺印或多出來的東西；單純位置偏移不要算缺陷。',
 'boardExpression':['把參考圖、只有位移圖、位移加缺印圖放同一畫板；明示哪張作參考。','在要比較區畫掩膜；若有批號等可變區，直接圈出並註記「這裡略過」。'],
 'tools':['多圖並排／疊合','鋼筆或掩膜','局部差異引用','可變區註解'],
 'agentFirstReturn':'先回原圖與對齊後疊圖，再回差分熱圖及映回待測原圖的缺陷區；有效重疊邊界與忽略區可見。每個候選差異可一鍵放大原圖核對。',
 'sceneCorrection':'若把錯位邊當缺印，工程師在原圖與疊圖同時引用該處說「這裡沒對齊」；若真缺陷被配準吃掉，指出同一局部。Agent 分開修正配準與缺陷判斷，不用一個閾值遮掩。',
 'done':['只有位移的設計圖不誤當缺陷；有缺印圖的候選映回正確原圖位置。','配準成敗、有效比較區與缺陷結論分開呈現。','允收缺陷面積／類型來自人工規格；缺陷遮罩是評估真值，不能拿來當算法輸入提示。'],
 'unknown':'對齊不穩、有效區太小或光度變化不可分辨時，明確標無效區，不能用差分數值直接宣稱NG。',
 'multiImageRelation':'參考、平移、缺印為同源合成衍生圖，必須在同一資料分組；mask只作評估標註；fruits_ecc是配準素材，不是印刷缺陷集。',
 'anchors':[{'image':'synthetic/print-defect.png','kind':'rect','xywh':[228,265,35,35],'label':'設計缺印編輯窗口','basis':'annotations.json defectRegionInImage；不是算法分割的缺陷面積，也不是整個矩形都缺印'}]
},
'qr':{
 'userStory':'作為工程師，我想直接圈出標籤讀內容，再用工單要求核對；讀不到時能看到碼圖為何不可讀。',
 'humanGoal':'讀這個標籤的內容，再和我給的工單料號核對。',
 'boardExpression':['在圖上圈碼或直接點它；把工單文字或可讀附件一併引用。','可將同一碼的不同視角放在一起，比較哪些視角能讀；多碼時直接點選本次要核對的碼。'],
 'tools':['矩形／鋼筆ROI','多圖引用','碼候選點選','文字與資料附件引用'],
 'agentFirstReturn':'原圖畫碼四角、放大矯正碼圖，內容以可複製字串顯示；料號規則及比對結果與讀碼狀態分開。點任一讀碼失敗圖可看同一ROI的原像素。',
 'sceneCorrection':'讀錯目標碼時直接點另一個候選；工單欄位歧義時引用精確欄位說明。Agent 改目標或對照字段，不要求工程師先選讀碼算法或把料號硬塞尺寸表。',
 'done':['每個字串可回指實際原圖和四角；格式不同的輸出用文字／表格承接。','可靠讀到但不符人提供規則才判NG；未提供工單規則只報讀碼結果。','5個視角分別實算並列出讀到、讀不到與原因；同碼視角不當5種獨立料號。'],
 'unknown':'反光／模糊／遮擋導致解碼失敗為UNKNOWN，不直接說料號錯；工單內容不可解析時保留未核對。',
 'multiImageRelation':'5張version_1視角為同一payload/編碼圖樣；dataset_config提供官方參考角點與原字串。不是5個獨立產品或料號。',
 'anchors':[]
}
}
items=[]
for c in cases:
 st=stories[c['slug']]
 images=[]
 for label,relative,note in c['images']:
  p=SOURCE/relative
  with Image.open(p) as im:w,h=im.size
  m=files.get(relative,{})
  meta={'label':label,'file':relative,'absolutePath':str(p),'relativeToPrd':'../../research/opencv-traditional-10-2026-10-25/'+relative,'width':w,'height':h,'role':m.get('role','candidate-input'),'upstream':m.get('upstream'),'sourceGroup':m.get('sourceGroup'),'note':note,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'isSynthetic':relative.startswith('synthetic/'),'containsUpstreamOutput':m.get('role','').startswith('upstream-example-output'),'hasReferenceAnswer':m.get('referenceAnswer') is not None}
  if relative in truth:meta['evaluatorOnlyDesignTruth']={k:v for k,v in truth[relative]['design'].items() if k!='outerPolygon'}
  if m.get('referenceAnswer') is not None:meta['referenceAnswerMetadata']=m['referenceAnswer']
  images.append(meta)
 items.append({'caseId':c['id'],'slug':c['slug'],'name':c['name'],'sourceCategory':c['origin'],'hero':next(x for x in images if x['file']==c['hero']),'questionInOriginalCollection':c['question'],'outputNeeds':c['outputs'],'inputDataDescription':c['data'],'truthLimit':c['truth'],'missingBeforeProductionAcceptance':c['missing'],'priorCollectionRunState':'collected-not-executed (historical collection manifest; this PRD task does not rerun CV or audit later product execution)','images':images,'sourceReferences':c['sources'],'story':st,'proposedInteractionBudget':{'afterImport':'用一次畫板組合（可包含多圖／標註）＋一句目的開始；不先填算法或任務類型。','happyPath':'Agent回圖後，可在同一畫板確認要採用的對象／關係，再試跑整組圖片。','correction':'有歧義時一次局部點選／圈畫可提交修正；不可要求重新建項目、換任務類型或在別欄重輸同一意圖。','status':'PRD目標待審；不是已測完成時間或保證只需固定點擊數。'},'proposedAcceptance':{'interaction':'畫板與對話可完成表達／回圖／局部修正，不要求工程師知道算法名稱。','traceability':'每張回圖、對象、工具結果與數據綁原圖及運算版本；人畫的提示與CV實算支持分開。','evidence':'方法、逐參數選用理由、適用邊界可從當前圖直接展開；圖＞數字＞文字。','regression':'完整輸入組合、逐對象結果、人工參考答案與UNKNOWN分開保存；同源衍生圖不洩漏為獨立驗證。','delivery':'回傳一張漂亮圖或整體UNKNOWN皆不算自動完成；須對照本story的done逐項核對。'}})
out={'schema':'agentcv-canvas-user-story-catalog-draft-1','date':'2026-10-26','status':'PRD討論稿／交互故事，不是已實作界面或本輪CV實算結果','sourceDirectory':str(SOURCE),'scope':'既有10例的目標與樣圖整理；故事索引不是產品任務分類，任意新問題仍使用同一共用畫板。','collectionTruthPolicy':['保留合成、官方原圖、官方教學輸出、人工標註的不同角色。','設計答案供評估者核對；不得由檔名／合成生成參數／NG標籤反推算法輸出或自行設定正式公差。','若在PRD圖中使用設計錨點，必標示「交互示意／設計真值，非本輪實算」。','原collection manifest是歷史收錄狀態；本任務不據此判斷後續版本的全部實作測試結果。'],'commonInteractionContract':['人可自由混用單圖、多圖、鋼筆、掩膜、文字、關係箭頭及真實找線／找圓工具，不先進入固定任務模式。','Agent先理解物件、指向、關係和目標；必要澄清應引用畫板中的具體對象，避免長問卷。','Agent將中間圖、候選、支持點與結果帶回同一畫板；畫板上的人類修正保留ID與版本。','任何結果圖可直接右鍵引用、多圖組合詢問；文字註解不再有第二層「文字的註解」。','候選多條／多圓時展示並允許直接選，不因存在多候選就整體棄用。','不確定時指出失效局部、實際條件、門檻與可行下一步；保留已通過對象。','七步整理資料與成果，不作表達前的強制類別／表單關卡。'],'stories':items}
(DEST/'opencv-stories.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'output':str(DEST/'opencv-stories.json'),'cases':len(items),'imageReferences':sum(len(x['images']) for x in items),'missingAssets':[im['absolutePath'] for c in items for im in c['images'] if not Path(im['absolutePath']).is_file()]},ensure_ascii=False))
# Stable aliases for the illustrated PRD renderer. Overlay coordinates are review
# illustrations grounded in the visible inputs / design annotations; no CV runs.
overlay_specs={
 'gear':{'human':[{'type':'rect','x':88,'y':88,'width':336,'height':336,'label':'這個工件（圈選示意）'}],'agent':[{'type':'circle','cx':256,'cy':256,'r':48,'label':'孔／中心支持的展示位置'}],'basis':'合成設計中心及孔徑；外框為目視圈選示意'},
 'washer':{'human':[{'type':'circle','cx':256,'cy':256,'r':156,'label':'外緣意圖'},{'type':'circle','cx':272,'cy':256,'r':78,'label':'內孔意圖'}],'agent':[{'type':'line','x1':256,'y1':256,'x2':272,'y2':256,'label':'應展示兩中心關係'}],'basis':'annotations.json的兩個設計圓；不是找圓運算'},
 'holes':{'human':[{'type':'circle','cx':150,'cy':256,'r':33,'label':'像這樣的孔'},{'type':'line','x1':94,'y1':145,'x2':418,'y2':145,'label':'以這條邊為基準'}],'agent':[{'type':'circle','cx':150,'cy':256,'r':25,'label':'H1位置示意'},{'type':'circle','cx':256,'cy':256,'r':25,'label':'H2位置示意'},{'type':'circle','cx':362,'cy':256,'r':25,'label':'H3位置示意'}],'basis':'孔中心與半徑為generated design，基準線是目視示意'},
 'orientation':{'human':[{'type':'rect','x':229,'y':43,'width':362,'height':99,'label':'這類零件'},{'type':'line','x1':285,'y1':112,'x2':555,'y2':67,'label':'我要表達的方向'}],'agent':[{'type':'line','x1':265,'y1':112,'x2':555,'y2':67,'label':'逐件方向的展示位置'},{'type':'line','x1':184,'y1':154,'x2':196,'y2':432,'label':'另一件須有獨立結果'}],'basis':'官方原圖目視定位，非角度真值或PCA結果'},
 'touching':{'human':[{'type':'rect','x':65,'y':49,'width':54,'height':96,'label':'這裡應分開'},{'type':'circle','cx':95,'cy':75,'r':4,'label':'提示A'},{'type':'circle','cx':90,'cy':119,'r':4,'label':'提示B'}],'agent':[{'type':'circle','cx':95,'cy':75,'r':22,'label':'實例候選A的展示位置'},{'type':'circle','cx':90,'cy':119,'r':22,'label':'實例候選B的展示位置'}],'basis':'官方硬幣原圖的目視位置；圓只代表PRD實例示意，不是分割邊界或數量真值'},
 'continuity':{'human':[{'type':'line','x1':90,'y1':219,'x2':421,'y2':219,'label':'這兩端應連通'}],'agent':[{'type':'rect','x':250,'y':211,'width':14,'height':16,'label':'此處應展示實際斷口證據'}],'basis':'連線為人類關係提示；斷口區來自generated design評估標註'},
 'color':{'human':[{'type':'circle','cx':278,'cy':124,'r':8,'label':'取樣／命名類別A'}],'agent':[{'type':'rect','x':241,'y':90,'width':58,'height':58,'label':'逐件候選A的展示位置'},{'type':'rect','x':349,'y':52,'width':58,'height':60,'label':'另一件須單獨判色'}],'basis':'官方照片目視取樣，非人工色類真值或已分類結果'},
 'pose':{'human':[{'type':'rect','x':82,'y':158,'width':205,'height':145,'label':'參考圖所指的目標區'}],'agent':[{'type':'rect','x':82,'y':158,'width':205,'height':145,'label':'候選／搬移ROI的展示位置'}],'basis':'官方場景目視框選；不是已計算單應性四角或已驗定位'},
 'difference':{'human':[{'type':'rect','x':104,'y':239,'width':306,'height':112,'label':'比較這段印刷'}],'agent':[{'type':'rect','x':228,'y':265,'width':35,'height':35,'label':'差異應映回這個局部'}],'basis':'差異局部為generated design的編輯窗口，非算法缺陷遮罩，也不代表矩形全區都缺印'},
 'qr':{'human':[{'type':'rect','x':70,'y':150,'width':375,'height':260,'label':'讀這個碼'}],'agent':[{'type':'line','x1':159,'y1':167,'x2':404,'y2':170,'label':'四角展示位置示意'},{'type':'line','x1':404,'y1':170,'x2':418,'y2':391},{'type':'line','x1':418,'y1':391,'x2':82,'y2':381},{'type':'line','x1':82,'y1':381,'x2':159,'y2':167}],'basis':'官方dataset_config中的version_1_down參考角點，非本平台解碼輸出'}
}
for c in out['stories']:
 c['id']=c['slug'];c['title']=c['name'];c['goal']=c['story']['humanGoal'];c['userStory']=c['story']['userStory']
 c['hero']['path']=c['hero']['relativeToPrd'];c['hero']['nature']='本專案合成設計輸入，非工業實拍' if c['hero']['isSynthetic'] else 'OpenCV官方樣圖／照片，非本輪平台運算'
 c['references']=[{**im,'path':im['relativeToPrd'],'nature':'合成設計輸入' if im['isSynthetic'] else '官方原始素材'} for im in c['images'] if im['role']=='candidate-input' and im['file']!=c['hero']['file']]
 c['story']['humanExpression']=c['story']['boardExpression'];c['story']['correction']=c['story']['sceneCorrection'];c['story']['completion']=c['story']['done']
 c['overlays']={**overlay_specs[c['slug']],'coordinateSpace':'hero原圖像素；width/height以hero真尺寸為準','status':'PRD交互示意，非本輪CV實算、人工採用或工業驗收','renderingRule':'任一human/agent overlay出現時，所在畫面必標「互動示意／待實算」；不得配上已量測／通過等狀態。'}
 c['sources']=c['sourceReferences'];c['acceptanceStatus']={'prd':'討論稿，未經用戶逐故事確認','interaction':'待實作／操作驗收','cv':'本任務未重跑；舊collection狀態不代替後續版本的真實測試狀態','production':False}
(DEST/'opencv-stories.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('Renderer aliases and illustrative overlays added.')
