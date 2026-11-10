from pathlib import Path
import json,html
P=Path(__file__).parent
E=html.escape

def svg(body,label='概念示意，非實測結果'):
 return '<svg viewBox="0 0 1080 460" role="img" aria-label="'+E(label)+'" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#5a807c"/></marker></defs><rect width="1080" height="460" rx="20" fill="#eaf0ed"/>'+body+'<text x="24" y="440" font-size="13" fill="#667972">概念畫稿 · 圖上框線與數值位置均為說明用途，非算法結果</text></svg>'
def txt(x,y,s,size=18,color='#263f39'):
 return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}">{E(s)}</text>'
def box(x,y,w,h,title,sub='',accent=False):
 return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{"#d1e8db" if accent else "#fff"}" stroke="#9bb5a9"/>'+txt(x+18,y+32,title,20)+(txt(x+18,y+59,sub,15) if sub else '')
def line(x,y,u,v,dash=False):
 return f'<path d="M{x} {y}L{u} {v}" stroke="#5a807c" stroke-width="2" fill="none" marker-end="url(#arrow)"'+(' stroke-dasharray="6 5"' if dash else '')+'/>'
def image(x,y,w,h,name='crystal-camera'):
 return f'<image href="assets/{name}.png" x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet"/>'
def poly(points,color='#9af0bf'):
 return f'<polygon points="{points}" fill="none" stroke="{color}" stroke-width="3"/>'
chapters=[]
def add(id,kicker,title,lead,diagram,items,criteria,extra=''):
 chapters.append(dict(id=id,kicker=kicker,title=title,lead=lead,diagram=diagram,items=items,criteria=criteria,extra=extra))

add('core','01 / 產品核心','把意圖畫出來，讓 Agent 建立可解釋的方案',
 '工程師用圖、標記與關係表達目的；Agent 反推前提、提出方案、執行試驗；人就在結果上核對與修正。',
 svg(image(32,40,390,340)+poly('93,91 367,94 366,318 91,317')+txt(100,365,'人：這個面相對外框歪斜了嗎？',18)+box(472,70,252,92,'圖像＋實質標記','對象、幾何、關係、來源與版本',True)+line(422,195,472,116)+line(724,116,775,116)+box(775,70,272,92,'Agent 推導與試驗','缺前提時提出問題，不猜結論')+box(775,245,272,110,'可執行的依賴流程','圖像證據 → 數值 → 解釋')+line(910,162,910,245)+line(775,300,440,300)+txt(480,286,'回到畫板共同核對',18)),
 [('表達自由','不要求先選齒輪、孔、寬高等固定類別；例子不能成為能力邊界。'),('Agent 主導','人定義目的與取捨；Agent 負責推導、調用算法、比較與補足證據。'),('保留未知','執行成功、證據充分、符合規格分開表示；單張成功不等於現場可靠。')],
 ['未預設的需求也能由畫板提出。','人類標註、Agent 提議與影像實測有明確來源。','本文件只供概念審核；不代表軟體已具備圖中功能。'])

add('inputs','02 / 從資料開始','先知道圖像代表什麼，再談能測什麼',
 '導入多張實例及參考資料，建立成像條件、對象介紹與已知結果；資料不足也能探索，但不能冒充正式量測。',
 svg(box(32,40,320,100,'圖片與成像配置','單張／多選／資料夾；像素與物理尺度',True)+box(32,167,320,92,'工件參考資料','介紹、圖紙、3D、規格與來源')+box(32,286,320,92,'實例與已知結果','OK／NG 類型／未知；可附標註')+line(352,90,445,194)+line(352,212,445,212)+line(352,332,445,233)+box(445,150,280,130,'同一項目的資料脈絡','Agent 可提議工件與關係')+line(725,215,786,215)+box(786,150,262,130,'畫板上確認與修正','示教不是固定模板填寫')),
 [('空項目入口','中央顯示「導入圖片」「導入圖片資料夾」；導入後列表居左，可選圖、重命名、標已知判定。'),('成像與校準','記錄感測器像元尺寸、鏡頭倍率、分辨率、裁切／縮放，以及實測校準、畸變等資訊；標明來源與不確定性。'),('量綱可信','像元尺寸／倍率只提供有條件的理想換算，不能取代實際校準；無有效校準只報 px。不同配置的圖不可默認共用尺度。')],
 ['新圖能追到所屬成像配置；改倍率、縮放或配置會提示尺度需重核。','標籤可以不完整，但未知不能偽裝 OK；標籤來源可追溯。','已知標籤只作驗證依據，不可偷用來生成待驗證結果。'])

add('dependencies','03 / 方案怎麼出現','從結論往回追前提，合併可共用的成果',
 '流程不是預先寫死的頁面序列。Agent 先解釋目標需要什麼證據，再反推到現有資料，缺口顯式保留。',
 svg(box(30,45,270,90,'人類目標','偏移？表面是否有凹坑？',True)+line(300,90,360,90)+box(360,45,330,90,'倒推必要前提','對象定義／定位／可辨識影像')+line(690,90,750,90)+box(750,45,300,90,'核對可取得的證據','缺資料 → 提問或補拍')+txt(35,194,'執行方向：',17)+box(35,220,270,96,'lid／pkg 識別與定位','存在性與定位可靠性分開結論',True)+line(305,268,410,268)+box(410,193,275,82,'相對位置計算','座標、角度、量測誤差')+box(410,318,275,82,'lid 有效表面區域','排除邊緣、遮擋與不可辨區')+line(305,268,410,356)+line(685,235,770,235)+box(770,193,280,82,'偏移判定','需要人定義合格條件')+line(685,356,770,356)+box(770,318,280,82,'表面瑕疵判斷','影像不足時不可斷言是凹坑')),
 [('規劃前','列出目標、必要前提、缺口與預計如何核對；人可在圖上補充或糾正。'),('執行中','每個產物是否足以支持下游，由下游需求判斷；定位成功不自動代表精度足夠。'),('路線變更','換方法、換物理特徵或縮小範圍，保留原因與受影響目標；只完成 lid 不能宣稱整個偏移任務完成。')],
 ['共用定位結果，避免偏移與瑕疵節點各造一份不一致定位。','未知存在、確定不存在、存在但定位不可靠可分辨。','凹坑與暗斑的區別若無證據，標為未知並提出可區分的試驗。'])

add('layers','04 / 節點與步驟','節點回答問題，步驟取得證據，試驗決定怎麼做',
 '按可獨立審核的結論組織節點；不是一個函數一個節點。節點可分組、拆合，證據與結果身份不隨版面改變。',
 svg(box(30,45,300,100,'節點：lid 定位','輸出輪廓／座標系／有效範圍',True)+line(330,95,390,95)+box(390,45,650,100,'節點級核對','處理鏈是否抓對物理邊界？是否滿足下游精度？')+box(30,195,235,90,'候選搜尋','輸入 → 候選圖')+line(265,240,293,240)+box(293,195,235,90,'輪廓細化','候選 → 輪廓圖')+line(528,240,556,240)+box(556,195,235,90,'幾何與誤差核對','輪廓 → 可用定位')+line(675,285,675,330)+box(400,330,640,76,'每一步可展開：方法選擇／參數比較／適用邊界','共同門檻不能因換算法而消失')),
 [('節點','有明確輸入、輸出、消費者、結論與失敗處置；存在性與定位可同組但不能混為同一結論。'),('步驟','有可核對的資料變換或推斷；灰階等純變換也要說明必要性，不必為簡單確定性換算造無意義試驗。'),('試驗','在固定目標與判據下比較候選方法／參數，保留未選原因與反例；同一原圖的兩種算法不視為獨立真值。')],
 ['單步擬合誤差小，仍必須核對是否擬合正確對象。','哪些處理需要展開到哪個粒度，保留為待審核設計細節。','執行結果、品質檢查、規格判定各有狀態，不用一個 PASS 混合。'])

# Static layout story, not a usable product replica.
layout='<rect x="24" y="34" width="1032" height="374" rx="12" fill="#fff" stroke="#9bb5a9"/>'
layout+='<rect x="24" y="34" width="190" height="374" rx="12" fill="#dce7e1"/>'
for i,t in enumerate(['AgentCV／專案','工件定位  ←','相對偏移','表面瑕疵','展開依賴圖']):layout+=txt(43,72+i*53,t,17)
layout+=txt(242,68,'節點結果／內部步驟',18)+image(243,88,610,266)+txt(245,383,'輸入圖  ←  本步圖  →  輸出圖',17)+box(876,88,160,190,'對話收合','需要時再展開')
layout+=txt(876,321,'圖片集：居左',15)+txt(244,109,'',14)
add('workspace','05 / 工作環境','一個工作區，按節點切換；每個節點留住現場',
 '左側流程導覽選節點，中央畫板聚焦當前內容。完整依賴圖按需展開；對話通常收起，圖像保留主要空間。',svg(layout),
 [('切換節點','保留圖片、縮放、視野、選中標記、氣泡位置及草稿；返回時恢復，不重新找位置。'),('切換步驟','預設看節點結果；展開後看前一步／本步／後一步圖；需要才並排，保留矩形原圖比例。'),('圖像操作','滾輪以指標為中心縮放，放大時清晰看像素；工具用圖示並提供提示。避免靠縱向捲動找主要操作。')],
 ['不在頂部重複顯示左側已有的當前階段；品牌、版本、專案操作集中左側。','畫板與結果不做狹窄文字卡片；詳細參數／證據按需展開。','大流程的折疊、搜尋與面板尺寸屬待確認提案，不能當成已獲批准的具體版式。'])

b=image(30,35,590,375)+poly('150,91 523,94 522,338 148,338')+poly('139,80 538,81 540,352 137,352','#ecb76b')+line(525,98,670,102)+box(670,45,375,155,'Luna 問題草稿 · 尚未發送','選中：lid 輪廓 ＋ pkg 輪廓',True)+txt(688,133,'「這兩個輪廓能可靠計算偏移嗎？」',17)+txt(688,169,'可改寫／刪除／自行輸入／人按發送',15)+box(670,243,375,144,'回答仍在此處','先看局部疊圖、比較圖與數值')+txt(687,340,'拖動／收合；連線指向選中的對象',16)
add('ask','06 / 核心故事 A','選中對象，就地問；不必把圖搬到聊天欄',
 '工程師選一個或多個標記，點詢問；Luna 提供問題草稿，人確認後發送，回答在相連氣泡中出現。',svg(b),
 [('人做什麼','選中輪廓、線、區域、關係或任一步驟產物；點詢問，也可直接寫自己的問題。'),('Agent 得到什麼','相關圖像／局部像素、標記幾何與文字、關係、座標映射、來源版本、當前目標；不是只有截圖。'),('現場如何變化','可拖動、收合、編輯說明；回答引用的圖能再被選中詢問。Luna 不在每次拖動時打斷操作，也不自動發送。')],
 ['同時選兩個標記時，Agent 明確知道問的是哪兩個及什麼關係。','切換節點不丟草稿；發送後保留問題與當時引用的版本。','詢問不默認授權改正式方案；Agent 可提議或在討論層添加內容，正式變更要可核對。'])

b=image(30,35,600,375)+poly('159,95 522,98 520,334 158,333')+poly('146,82 538,83 539,350 145,350','#ecb76b')
b+='<path d="M522 175L538 175M522 160L522 190M538 160L538 190" stroke="#edb467" stroke-width="3"/>'+line(538,175,685,142)+box(685,65,355,160,'距離控件：選 A ＋ B','定義：此處法向間距',True)+txt(705,165,'值：由當前引用對象計算',18)+txt(705,194,'未校準 → px；非預造數值',15)+box(685,275,355,110,'控件也是關係對象','可改定義、加說明、直接詢問')
add('distance','07 / 核心故事 B','距離是兩個對象的關係，不必再畫兩次',
 '選中兩個標記，點距離圖示，就地生成尺寸控件；端點與方向直接畫出，讓人看清到底量了什麼。',svg(b),
 [('快速建立','點點是直線距離，點線是垂距；線線、輪廓輪廓有多種定義時，就地選最小間隙、中心距或指定方向等。'),('避免偽精度','非平行線沒有單一固定間距；需指定量測位置或範圍。手繪標記幾何與真實影像量測分開標示。'),('持續關聯','控件引用 A、B 的版本；標記移動會更新或標記待計算。找線／找圓 ROI 移動須重算，失效時不能殘留舊結果。')],
 ['自動選的距離定義必須可見、可改，不在背景猜測。','實際找線／找圓可顯示多個合格候選，人工選擇與排除也進入關係資料與歷史。','Ctrl/Cmd+Z 撤銷、重做、Delete 刪除及右鍵操作需符合平台慣例；不打斷文字編輯。'])

b=box(30,35,310,85,'為何使用這個方法？','原圖／候選結果／替代法比較',True)+box(385,35,310,85,'為何選這組參數？','試驗範圍／比較圖／選擇準則',True)+box(740,35,310,85,'適用邊界在哪裡？','反例／誤差／失效與處置',True)
b+=image(30,150,310,208)+image(385,150,310,208)+image(740,150,310,208)
b+=txt(46,390,'不能只說「適合找邊」',16)+txt(400,390,'不能只解釋參數用途',16)+txt(754,390,'不能只寫「光照穩定」',16)
add('evidence','08 / 每步的解釋契約','圖像證據在前，選擇結論必須跟得上試驗',
 '規劃前說假設與比較計畫；執行中留下真實產物；執行後以觀察作決定。不得用預先寫好的理由替代事後核對。',svg(b),
 [('方法依據','指出當前要辨識的物理特徵與候選假設；比較合理替代方案。簡單確定性處理可說明不比較的理由，不能機械增加灰階等空步驟。'),('參數依據','逐個影響決策的參數保留來源、可改值、實際生效值；比較關鍵值及交互影響，承認未試部分，不宣稱窮盡或全局最優。'),('邊界依據','顯示哪些像素／區段不可靠、影響哪個結論；區分同圖自洽、跨圖測試與真值誤差。97%可靠不能掩蓋關鍵邊失效。')],
 ['腳本檢查真實引用、必要試驗與決策鏈；缺項返回步驟／參數／缺少證據及補全建議。','草稿與診斷可以保存；缺必要證據不得作為可交付節點。形式通過不代表工業可靠性通過。','深層可展開到算法、參數、支撐點與程式版本；工具問號含 SVG 說明，選字可問 Agent。'])

add('versions','09 / 多節點共作','引用同一份成果，變更能沿依賴傳遞',
 '下游不複製一份無來源的輪廓。每個引用都能返回原圖、生成步驟與版本；討論圖與正式輸出保留關係。',
 svg(box(30,55,300,105,'定位結果 v3','輪廓、座標、誤差與有效區',True)+line(330,106,430,106)+box(430,55,280,105,'偏移計算','引用：定位 v3')+line(330,106,430,262)+box(430,212,280,105,'瑕疵檢測','引用：定位 v3')+box(780,55,270,262,'比較畫板','跨節點引用圖像與標記')+line(710,105,780,105)+line(710,264,780,264)+box(30,325,680,82,'定位改成 v4 → 受影響結果標記「待重算」','舊結果保留對照；不得繼續充當當前有效結果')),
 [('跨圖討論','任意平台圖像都能引用到比較畫板，保留座標映射；可用真實找線／找圓、筆、掩膜及關係控件。'),('共創來源','Agent 的新標註與圖像可在共同畫板出現；標示作者、引用與作用，提議和已採用方案分開。'),('回讀驗證','工具執行成功、產物已保存、界面確實載入，是不同事實；保存產物身份與顯示回執，不能只靠 Agent 聲稱改好。')],
 ['上游變更或成像配置變更後，相關下游失效狀態可追查原因。','用目前資料重新核對後，才恢復有效狀態。','寬表以可點選 sheet 引用開大面板；對話支援 Markdown 與圖像引用，不塞窄表格。'])

story='''<div class="story"><div><b>① 表達</b><p>工程師指認 lid、pkg，選兩者問「是否偏移，表面是否有凹坑？」可用參考圖補充對象定義。</p></div><div><b>② 推導</b><p>Agent 說明需定位兩者、建立有效表面區域；若現有成像不足以區分凹坑與污漬，先提出缺口。</p></div><div><b>③ 共作</b><p>顯示多個邊界候選；人點選正確外沿。Agent 記錄排除原因、比較方法與參數，不能只追求擬合小。</p></div><div><b>④ 核對</b><p>同一定位供偏移與瑕疵引用；看尺寸控件及局部不可靠段。在誤差不足以支撐判定時保留未知。</p></div><div><b>⑤ 驗證</b><p>在已知 OK／不同 NG／困難樣本上批跑，查漏檢、誤判與未知；保留不參與調參的驗證圖。</p></div><div><b>⑥ 交付</b><p>留下可重現流程、實際算法／環境、三項證據、資料版本、判定規則、未覆蓋邊界與回退版本。</p></div></div>'''
add('crystal','10 / 完整用戶故事','晶振：從一句問題，走到可核對的檢測方案',
 '這是一個說明交互的故事，不指定晶振必須使用哪種算法，也不宣稱這張原圖已完成偏移或凹坑驗證。',
 svg(image(30,30,510,375)+box(590,50,450,95,'先把對象和關係說清楚','lid 相對 pkg；有效表面；合格條件',True)+box(590,172,450,95,'再確認證據足夠支撐結論','定位精度／成像能力／誤判反例')+box(590,294,450,95,'最後檢驗完整目標是否達成','不是只抓到一條邊或一圈輪廓')),
 [('操作主體','故事每一步都要回答：人做了什麼、Agent 收到什麼、畫板如何變化、人如何核對。'),('任務完整性','相對位置任務不能用單一 lid 輪廓冒充完成；凹坑判斷不能用暗斑檢出冒充。'),('異常分支','工件不存在、圖像模糊、候選歧義、精度不足分別處理，不混為一個 UNKNOWN。')],
 ['完整故事應可由不知算法的操作人走通，再由專業人展開核對依據。','此處不填假測量值、不畫假缺陷、不預選最佳算法。'],story)

cases=[('齒輪齒數與缺齒','圈對象，指出疑似缺口','週期性是否成立？遮擋是否被誤認缺齒？'),('墊圈內外徑與偏心','選兩個圓／輪廓與中心關係','非圓、透視與斷弧是否影響擬合？'),('多孔鈑金孔數與孔位','圈範圍，標出應有孔的關係','內部紋理是否被當孔？可見不等於貫穿。'),('多工件擺放方向','標參考方向，指出旋轉關係','對稱件方向是否有歧義？'),('黏連顆粒計數','指示哪裡應分成兩個','分離是否切碎單物體？'),('線路斷線與橋接','畫連通關係，標疑似斷點','線寬變化、交叉與陰影能否區分？'),('彩色零件分揀','給顏色實例與所屬類別','色偏／反光／成像配置變化影響？'),('複雜背景平面定位','引用模板，圈場景對象','匹配是否幾何一致？重複紋理誤匹配？'),('配準後缺印／異物','放參考圖與待測圖，標差異','差異是缺陷還是配準／光照誤差？'),('QR 料號核對','圈碼區，給預期內容／規則','未讀出、讀錯、不符合規則分開。')]
extra='<div class="tablewrap"><table><thead><tr><th>故事／需求</th><th>人如何表達</th><th>Agent 必須面對的問題</th></tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+E(v)+'</td>' for v in r)+'</tr>' for r in cases)+'</tbody></table></div><p class="small">來源：既有 OpenCV 用例收集；這些是本產品交互與算法驗證的候選故事，不是已完成驗收、也不是正式工業真值集。詳見 <a href="../2026-10-26-canvas-first/opencv-stories.json">原始用例與來源紀錄</a>。</p>'
add('coverage','11 / 通用性驗證','同一套表達方式，能承接不同的檢測問題',
 '晶振是深度故事；已有十個 OpenCV 案例用來檢查平台是否又退回固定表單與固定算法。',
 svg(image(30,60,290,270,'gear-0')+image(395,60,250,270,'touching-0')+image(735,60,310,270,'pose-0')+txt(65,380,'圈對象 → 問週期與缺口',19)+txt(380,380,'畫關係 → 問分離與計數',19)+txt(742,380,'給參考 → 問位置與可信度',19)),
 [('一致交互','換樣品不必換一套產品操作：選對象、表達關係、提出問題、看證據、核對。'),('算法開放','傳統 CV、深度學習與自訂算法均可提議；依賴、資料、算力與許可缺口要說明，不以固定工具清單封死能力。'),('驗證誠實','官方範例素材未必有工業規格或完整真值；教學輸出不能充當本系統正確答案。')],
 ['不得為新增案例增設一個強迫選擇的產品入口分類。','正式驗收須補齊每例的真值、判據、困難樣本及允許的不確定性。'],extra)

extra='''<div class="tablewrap"><table><thead><tr><th>待確認</th><th>目前提案</th><th>不能先假定</th></tr></thead><tbody><tr><td>Luna 的身份</td><td>負責就地問題草稿的交互角色</td><td>是否獨立模型、何時調用及延遲預算尚未定</td></tr><tr><td>節點與步驟粒度</td><td>按結論與資料變換拆分，保留共用結果</td><td>可見步驟的預設展開深度尚未定</td></tr><tr><td>試驗預算</td><td>先驗證關鍵方法／參數與已知反例</td><td>不要求所有組合窮舉；停止準則待定</td></tr><tr><td>正式採用操作</td><td>討論、試驗、正式版本清楚分開</td><td>每次低風險試算是否需確認、發布權限待定</td></tr><tr><td>版面與硬體</td><td>畫板主體、左側流程、收合對話</td><td>精確尺寸、目標螢幕與鍵位尚未做操作驗收</td></tr></tbody></table></div>'''
add('delivery','12 / 驗收與後續','先審概念，再審操作故事，之後才進實作',
 '本版狀態：概念 PRD 草案 v0.1。共識與提案分開；未經用戶審核，不把畫稿當作已批准的實作規格。',
 svg(box(30,65,300,110,'節點／步驟優化','同目標、同判據比較方法與參數',True)+line(330,120,395,120)+box(395,65,300,110,'全流程重驗','下游精度、漏檢／誤判／未知／耗時')+line(695,120,760,120)+box(760,65,290,110,'保留或回退','回寫收益、退步與適用條件')+box(30,245,1020,125,'項目交付物：可執行流程 ＋ 可追溯證據 ＋ 可重現版本','包含來源圖與成像配置、標記關係、實際生效參數、算法依賴、規則、驗證報告與已知邊界')),
 [('驗收底線','能從自由意圖走到依賴圖；就地詢問與距離關係成立；逐步證據可追查；版本失效能傳遞；完整目標不漏項。'),('優化約束','人定義漏檢、誤判、未知率、節拍與複核成本的取捨；局部改善必須重驗受影響下游，測試集與調參集區分。'),('交付邊界','本輪只有 PRD 文件與呈現檢查；沒有算法效果驗收、沒有產品修改、沒有部署或發布。現場接入與正式發布規則需另行定義。')],
 ['晶振故事先審通，再以其他案例檢查通用性；不先鋪開修改所有案例。','優化歷史保留失敗假設與人類糾正，後續方案應主動核對相關前例。','數學模型可證明有條件性質；真實影像識別仍須實證，不能承諾任意噪聲下皆正確。'],extra)

meta={'title':'AgentCV｜畫板協作與可解釋流程','version':'0.1','date':'2026-10-26','status':'CONCEPT_DRAFT_PENDING_USER_REVIEW','scope':'Concept PRD only. No product changes or CV execution.','agreementPolicy':'會話共識屬方向；詳細版面、Luna執行架構、驗收閾值與發布權限屬待確認提案。','chapters':chapters,'reviewInputs':['使用者於本會話對產品核心、節點依賴、畫板詢問與距離控件的說明','../2026-10-26-canvas-first/opencv-stories.json','../../reviews/2026-10-26-pi-evidence-audit/content-audit.json','../../reviews/2026-10-26-pi-evidence-audit/execution-audit.json','../../reviews/2026-10-26-pi-evidence-audit/host-audit.json','../../references/ontology-engineering/v2.0.0-rc.7/SKILL.md']}
(P/'prd.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
nav=''.join(f'<a href="#{c["id"]}"><span>{i+1:02}</span>{E(c["title"].split("，")[0].split("；")[0])}</a>' for i,c in enumerate(chapters))
sections=''
for i,c in enumerate(chapters):
 sections+=f'<section id="{c["id"]}" data-chapter="{i}"'+(' hidden' if i else '')+'><div class="kicker">'+c['kicker']+'</div><h1>'+E(c['title'])+'</h1><p class="lead">'+E(c['lead'])+'</p><figure>'+c['diagram']+'</figure><div class="principles">'+''.join('<article><h2>'+E(a)+'</h2><p>'+E(b)+'</p></article>' for a,b in c['items'])+'</div>'+c['extra']+'<details class="criteria"><summary>本章審核點 · '+str(len(c['criteria']))+' 項</summary><ul>'+''.join('<li>'+E(s)+'</li>' for s in c['criteria'])+'</ul></details></section>'
css='''*{box-sizing:border-box}html{font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif;color:#203b34;background:#f8f7f1}body{margin:0}header{height:68px;background:#173d33;color:#fff;padding:0 30px;display:flex;align-items:center;justify-content:space-between;gap:16px}header b{font-size:20px}header span{font-size:13px;color:#c9ddcf}.shell{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:calc(100vh - 68px)}aside{padding:24px 14px;border-right:1px solid #dbe2d7;background:#f1f3ec}aside .label{font-size:11px;letter-spacing:2px;color:#728578;margin:0 12px 15px}nav a{display:flex;gap:10px;align-items:center;text-decoration:none;font-size:13px;line-height:1.6;color:#486052;padding:10px;border-radius:7px;margin:3px 0}nav a span{font-size:11px;color:#7c9184}nav a[aria-current=page]{background:#dbe8db;color:#173d33;font-weight:700}.scope{font-size:12px;color:#758477;line-height:1.7;border-top:1px solid #d5dfd0;margin:24px 12px 0;padding-top:16px}main{max-width:1270px;padding:34px 42px 25px;width:100%;margin:auto;align-self:start}.kicker{font-size:12px;font-weight:700;letter-spacing:1.5px;color:#528068}h1{font-size:30px;line-height:1.3;margin:12px 0}p{line-height:1.8}p.lead{font-size:16px;max-width:950px;color:#627367;margin:0 0 22px}figure{margin:0 0 25px}figure svg{width:100%;height:auto;display:block}svg text{font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif}.principles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}.principles article{border-top:2px solid #8fae94;padding-top:12px}h2{font-size:16px;margin:0 0 5px}.principles p{font-size:14px;margin:0;color:#5b6c60}.criteria{border:1px solid #dce3d8;border-radius:9px;padding:12px 16px;margin-top:23px;color:#556b59;font-size:13px;line-height:1.8}summary{cursor:pointer;font-weight:600}li{margin:7px 0}.pager{display:flex;justify-content:space-between;align-items:center;margin-top:25px;padding-top:18px;border-top:1px solid #dce3d8;font-size:12px;color:#758477}.pager button{background:white;border:1px solid #b8ccbb;color:#234b36;padding:10px 20px;border-radius:7px;cursor:pointer;font:inherit;font-size:14px}.pager button:disabled{opacity:.4;cursor:default}.small{font-size:12px;color:#738474}.story{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:22px}.story div{padding:16px;background:#eef2e9;border-radius:8px}.story b{font-size:15px}.story p{font-size:13px;margin:7px 0 0;color:#5e7062}table{border-collapse:collapse;width:100%;font-size:13px;line-height:1.7;margin-top:22px}td,th{text-align:left;padding:12px;border-bottom:1px solid #dae2d5;vertical-align:top}th{background:#eaf0e4;font-weight:600}a{color:#2c7450}.sources{margin-top:24px;font-size:12px;color:#788979;line-height:1.9}.sources a{margin-right:12px}[hidden]{display:none!important}@media(min-width:1550px){main{padding-top:45px}h1{font-size:35px}}@media(max-width:1000px){.shell{grid-template-columns:180px minmax(0,1fr)}main{padding:25px 22px}nav a{font-size:12px}h1{font-size:25px}.principles{gap:12px}.principles p{font-size:13px}}@media(max-width:700px){header{padding:10px 16px;height:auto;min-height:68px;flex-wrap:wrap}.shell{display:block}aside{border-right:0;padding:12px}nav{display:flex;overflow:auto}nav a{min-width:150px}.scope,aside .label{display:none}.principles,.story{grid-template-columns:1fr}main{padding:22px 15px}h1{font-size:24px}.tablewrap{overflow:auto}table{min-width:600px}}@media print{header,aside,.pager{display:none}.shell{display:block}main{max-width:none;padding:0}section,section[hidden]{display:block!important;break-before:page}figure{break-inside:avoid}.criteria ul{display:block}.criteria{break-inside:avoid}section:first-child{break-before:auto}}'''
js='''const sections=[...document.querySelectorAll('section[data-chapter]')],links=[...document.querySelectorAll('nav a')];let current=0;function show(){let id=location.hash.slice(1)||sections[0].id;let idx=sections.findIndex(s=>s.id===id);current=idx<0?0:idx;sections.forEach((s,i)=>s.hidden=i!==current);links.forEach((a,i)=>{if(i===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});document.getElementById('count').textContent=`概念 PRD · ${current+1} / ${sections.length}`;document.getElementById('prev').disabled=current===0;document.getElementById('next').disabled=current===sections.length-1;document.title='AgentCV PRD｜'+sections[current].querySelector('h1').textContent;window.scrollTo(0,0)}document.getElementById('prev').onclick=()=>location.hash=sections[Math.max(0,current-1)].id;document.getElementById('next').onclick=()=>location.hash=sections[Math.min(sections.length-1,current+1)].id;window.addEventListener('hashchange',show);show();'''
htmlout='<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AgentCV｜概念 PRD v0.1</title><style>'+css+'</style></head><body><header><b>AgentCV / 產品概念 PRD</b><span>v0.1 · 2026-10-26 · 待審核草案 · 非軟體原型</span></header><div class="shell"><aside><p class="label">文件章節 / 非產品流程</p><nav aria-label="PRD章節">'+nav+'</nav><p class="scope">本輪：對齊概念與操作邏輯。<br>沒有修改現有軟體。<br>圖像為既有素材，框線為示意。</p></aside><main>'+sections+'<div class="pager"><button id="prev">← 上一章</button><span id="count"></span><button id="next">下一章 →</button></div><div class="sources">審查來源：<a href="../../reviews/2026-10-26-pi-evidence-audit/content-audit.json">Pi 依據內容</a><a href="../../reviews/2026-10-26-pi-evidence-audit/execution-audit.json">實際執行日誌</a><a href="../../reviews/2026-10-26-pi-evidence-audit/host-audit.json">宿主合約缺口</a><a href="../../references/ontology-engineering/v2.0.0-rc.7/SKILL.md">本體論 skill</a><a href="prd.json">結構化 PRD</a></div></main></div><script>'+js+'</script></body></html>'
(P/'index.html').write_text(htmlout)
print(json.dumps({'chapters':len(chapters),'htmlBytes':len(htmlout.encode()),'status':meta['status']}))
