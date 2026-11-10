import {svg,text,rect,line,circle,arrow,ink,points} from './svg-kit.js';
// These are educational diagrams, deliberately separate from the current-image evidence.
const badge=(x,y,label,color=ink.green)=>rect(x,y,240,29,ink.card,color,5)+text(x+12,y+20,label,13,color);
const panel=(i,title,content,caption)=>{const x=20+i*315;return rect(x,40,290,238)+text(x+14,65,title,16,ink.green)+`<g transform="translate(${x+15},83)">${content}</g>`+text(x+14,261,caption,12,ink.muted)};
const grid=(values,{x=0,y=0,size=23,colours=false,dots=false}={})=>values.map((row,gy)=>row.map((v,gx)=>{const color=colours?['#20313b','#91edbd','#78bddd','#f4b362'][v]:v?'#e8f3e9':'#213441';return rect(x+gx*size,y+gy*size,size-2,size-2,color,'#456471',1)+(dots&&v?circle(x+gx*size+size/2,y+gy*size+size/2,3,ink.orange):'')}).join('')).join('');
const object=(x=30,y=10,w=180,h=110)=>rect(x,y,w,h,'#b9ced1',ink.text,2)+rect(x+w*.23,y+h*.25,w*.43,h*.4,ink.bg,ink.line,0);
const polygon=[{x:25,y:25},{x:225,y:25},{x:225,y:60},{x:135,y:60},{x:135,y:109},{x:225,y:109},{x:225,y:145},{x:25,y:145}];
const poly=(ps,fill,stroke=ink.green,extra='')=>`<polygon points="${points(ps)}" fill="${fill}" stroke="${stroke}" stroke-width="2" ${extra}/>`;
const axes=(labels)=>line(10,110,245,110,ink.muted)+labels.map(([x,s])=>line(x,105,x,115)+text(x,135,s,12,ink.muted,'text-anchor="middle"')).join('');
const pattern=(x,y,w=64,h=50)=>rect(x,y,w,h,'#b9ced1',ink.muted,1)+rect(x+w*.23,y+h*.27,w*.45,h*.42,ink.bg,ink.bg,1);
const slots=content=>content.map(([title,body,caption],i)=>panel(i,title,body,caption)).join('')+arrow(311,160,333,160)+arrow(626,160,648,160);
const titles={original:'原圖輸入',gray:'灰階與採樣',binary:'閾值分割',components:'連通區',hull:'凸包',template:'參考模板',locate:'模板定位',edges:'找線',measure:'幾何量測',decide:'規則判定'};
function overview(id){switch(id){
 case 'original':return [
 ['① 導入原圖',object()+text(45,145,'像素內容保持原樣',15),'圖片與成像配置分開保存'],
 ['② 綁定這一份輸入',rect(12,15,225,57)+text(27,49,'寬 × 高 · SHA-256',19)+arrow(125,80,125,109)+text(25,140,'指紋不同 → 不是同一像素輸入',13),'指紋追溯檔案，無法辨識工件'],
 ['③ 顯示與計算',grid([[0,1,0],[1,1,1],[0,1,0]],{x:15,size:38})+arrow(139,56,163,56)+text(170,50,'縮放',16)+text(170,80,'只改顯示',13),'放大能看像素，不生成新細節']];
 case 'gray':return [
 ['① 三個色彩通道',rect(10,12,62,100,'#bd4242')+rect(82,12,62,100,'#40965a')+rect(154,12,62,100,'#3f6ab3')+text(25,139,'R',18)+text(98,139,'G',18)+text(170,139,'B',18),'彩色差異會被壓縮成亮度差'],
 ['② 合成亮度，再取點',text(4,25,'Y = .299R + .587G + .114B',16)+grid([[0,0,0,1,1,1],[0,0,0,1,1,1],[0,0,1,1,1,1],[0,0,1,1,1,1]],{x:10,y:45,size:28})+[0,2,4].flatMap(x=>[0,2].map(y=>circle(23+x*28,58+y*28,5,ink.orange))).join(''),'示例 s=2，橙點才真正被讀取'],
 ['③ 輸出灰階網格',grid([[0,0,1],[0,1,1]],{x:55,y:25,size:47})+text(12,146,'沒取到的位置不會被平均補回',13),'大間隔更快，也可能漏掉細線']];
 case 'binary':return [
 ['① 看亮度分布',Array.from({length:20},(_,i)=>{const h=Math.round(80*Math.exp(-(((i-4)/2)**2))+105*Math.exp(-(((i-15)/3)**2)));return rect(10+i*11,135-h,8,h,ink.blue,ink.blue,0)}).join('')+line(5,138,240,138)+text(15,158,'暗',13)+text(210,158,'亮',13),'直方圖回答：各亮度有多少格'],
 ['② 找最能分開兩組的 T',`<path d="M 10 137 Q 80 0 125 22 Q 185 25 240 137" fill="none" stroke="${ink.orange}" stroke-width="3"/>`+line(125,14,125,140,ink.green,2)+text(136,48,'最大值',16,ink.green)+text(45,161,'同樣最大 → 取最早 T',14),'曲線最大值是數學目標，非正確率'],
 ['③ 閾值比較 → 黑／白',text(10,28,'亮前景示例：T = 100',17)+text(15,73,'40 ≤ 100',18)+rect(175,49,44,31,ink.bg)+text(15,122,'160 > 100',18)+rect(175,99,44,31,'#fff')+text(15,158,'暗前景則反過來',14),'白色只代表符合條件，尚非工件']];
 case 'components':return [
 ['① 二值圖中的白格',grid([[1,1,0,0,0,0],[1,1,0,1,1,0],[0,0,1,1,1,0],[0,0,0,0,0,1]],{x:30,y:13,size:31}),'上下左右相接才視為同區塊'],
 ['② 分配不同區塊標籤',grid([[1,1,0,0,0,0],[1,1,0,2,2,0],[0,0,2,2,2,0],[0,0,0,0,0,3]],{x:30,y:13,size:31,colours:true}),'斜角相接不把綠區和藍區合併'],
 ['③ 篩選，再按面積排序',badge(3,5,'占比 · 圖邊 · 跨度 → 通過')+badge(3,50,'太小／跨圖邊 → 拒絕',ink.red)+text(10,110,'通過者：大 → 小 → 前 8 個',16)+text(10,148,'大小不是「像工件」的分數',14,ink.orange),'回到「依據」可核對本圖每項數值']];
 case 'hull':return [
 ['① 連通區有凹口',poly(polygon,ink.green)+text(148,92,'凹口',14,ink.orange),'綠色為原有區域'],
 ['② 像拉緊一圈橡皮筋',poly(polygon,'none',ink.muted)+poly([{x:25,y:25},{x:225,y:25},{x:225,y:145},{x:25,y:145}],'none',ink.orange)+[{x:25,y:25},{x:225,y:25},{x:225,y:145},{x:25,y:145}].map(p=>circle(p.x,p.y,5)).join(''),'只保留最外側支撐頂點'],
 ['③ 凹口被包進範圍',rect(25,25,200,120,ink.orange,ink.orange,0)+poly(polygon,ink.green)+text(146,93,'新增',14,ink.bg),'橙色可能是缺口／孔洞，不能當原輪廓']];
 case 'template':return [
 ['① 已確認的對象範圍',object(30,22,180,105)+rect(30,22,180,105,'none',ink.green,0),'圈選只指定搜尋意圖'],
 ['② 包圍盒再外擴',object(40,35,160,89)+rect(15,10,210,139,'none',ink.orange,0)+text(52,171,'背景也被擷取進來',14,ink.orange),'外擴至少 6 px 或短邊 12%'],
 ['③ 取 22 × 22 灰階點',Array.from({length:22},(_,y)=>Array.from({length:22},(_,x)=>circle(58+x*6,8+y*6,1.6,(x>6&&x<14&&y>5&&y<14)?ink.muted:ink.green)).join('')).join('')+text(67,158,'共 484 點',16),'稀疏模板，不是逐像素外觀全檢']];
 case 'locate':return [
 ['① 模板與待測圖片',pattern(2,28,73,59)+arrow(83,57,113,57)+rect(128,5,115,135)+pattern(153,52,60,49),'目前要求同解析度、只搜尋平移'],
 ['② 搜尋多個位置峰',`<path d="M 5 143 L 45 141 L 66 83 L 86 139 L 132 139 L 163 21 L 191 140 L 240 142" fill="none" stroke="${ink.blue}" stroke-width="3"/>`+circle(163,21,5)+text(165,13,'最佳',13,ink.green)+text(45,74,'次佳',13,ink.orange),'粗搜尋後精修最多 5 個分離位置'],
 ['③ 三道門一起通過',badge(5,5,'相關性 ZNCC ≥ 門檻')+badge(5,52,'亮度差 MAE ≤ 門檻')+badge(5,99,'最佳 − 次佳 ≥ 峰差門檻'),'分數高仍可能定位錯，需驗證圖集']];
 case 'edges':return [
 ['① 在意圖附近搜尋',rect(10,47,235,65,'#203e47',ink.orange,0)+line(10,79,245,79,ink.orange,1,'stroke-dasharray="5 4"')+line(14,54,240,54,ink.muted,3)+line(14,88,240,86,ink.green,3)+line(14,107,240,107,ink.muted,3),'橙帶限定搜尋，不在全背景任意找'],
 ['② 檢查支持與擬合',line(10,72,240,76,ink.green,2)+[13,32,49,75,98,119,143,180,207,230].map((x,i)=>circle(x,74+[1,-2,2,0,-1,2,0,-1,1,0][i]*3,3,ink.blue)+line(x,74,x,74+[1,-2,2,0,-1,2,0,-1,1,0][i]*3,ink.orange)).join('')+text(16,131,'有多少支持點？是否連續？',14)+text(16,158,'偏離直線多遠（RMS）？',14),'低殘差只是其中一個條件'],
 ['③ 通過後再比較位置',badge(5,4,'覆蓋／連續性／殘差均通過')+text(10,83,'離意圖更近 → 優先候選',16)+text(10,125,'多條太接近 → UNKNOWN',15,ink.orange),'可人工點選，選擇會記入新方案']];
 case 'measure':return [
 ['① 取得四條合格邊',line(20,25,230,32,ink.green)+line(23,138,234,145,ink.green)+line(34,8,38,157,ink.blue)+line(217,12,221,160,ink.blue),'任一側失敗，尺寸仍是 UNKNOWN'],
 ['② 相交得到四角',poly([{x:34,y:25},{x:217,y:32},{x:221,y:145},{x:38,y:138}],'none')+[[34,25],[217,32],[221,145],[38,138]].map(([x,y])=>circle(x,y,5,ink.orange)).join('')+text(100,91,'4 交點',18),'檢查近矩形假設與退化交點'],
 ['③ 邊長與標定換算',text(5,30,'寬 = (上邊長 + 下邊長) / 2',16)+text(5,76,'高 = (左邊長 + 右邊長) / 2',16)+arrow(119,92,119,115)+text(18,148,'px → 有效實測標定 → mm',16,ink.green),'角點可靠性與標定都影響尺寸']];
 case 'decide':return [
 ['① 有效量測 + 人定規格',text(10,30,'量測示例：10.02 mm',20)+text(10,79,'規格示例：9.90–10.10 mm',16)+text(10,132,'規格由人確認，不能猜',16,ink.orange),'示例數字不是目前專案的正式公差'],
 ['② 比較是否落在範圍內',rect(60,47,140,42,'#2c6650',ink.green,0)+axes([[60,'下限'],[200,'上限']])+circle(134,69,6)+line(134,75,134,106,ink.green)+text(82,27,'含兩端邊界',15,ink.green),'值與單位都有效才進入比較'],
 ['③ 結果有三種',badge(5,3,'OK：有效且在範圍內')+badge(5,49,'NG：有效但超出範圍',ink.red)+badge(5,95,'UNKNOWN：證據不足',ink.orange),'UNKNOWN 不應被當成 NG 或 OK']];
 default:return [];
}}
function parameters(id){switch(id){
 case 'original':return [['唯讀輸入',object()+text(27,150,'尺寸 / 指紋 / 原圖座標',16),'這些讀值不是算法旋鈕'],['人提供的成像資料',text(8,32,'像元尺寸 × Binning',20)+line(10,48,235,48)+text(77,77,'鏡頭倍率',20)+arrow(125,93,125,121)+text(12,151,'理論比例 ≠ 實測標定',16,ink.orange),'第一步保存並確認成像配置'],['顯示倍率',grid([[1,0],[0,1]],{x:65,y:10,size:55})+text(40,150,'畫布放大：原圖仍相同',15),'更改顯示不改變物理尺寸']];
 case 'gray':return [['固定轉換約定',text(10,40,'R × .299',22,'#ed8e8e')+text(10,85,'G × .587',22,ink.green)+text(10,130,'B × .114',22,ink.blue),'權重不是從本圖學得'],['自動速度策略',text(5,28,'s = ceil(最長邊 / 400)',19)+text(5,76,'至少為 1',20)+arrow(120,92,120,120)+text(10,151,'400 = 工程預設',18,ink.orange),'沒有自動證明它是最佳採樣間隔'],['可手動試調',text(10,37,'s = 1',22,ink.green)+text(116,37,'s = 4',22,ink.orange)+grid([[1,1,1,1],[1,1,1,1],[1,1,1,1]],{x:10,y:58,size:23})+grid([[1,0,0,0],[0,0,0,0],[0,0,0,0]],{x:129,y:58,size:23}),'回到本圖依據比較被漏掉的細節']];
 case 'binary':return [['自動由曲線求出',overview('binary')[1][1],'本圖重新計算，不是固定 64'],['手動覆蓋',text(10,35,'直接改 T 或點曲線',19)+rect(35,58,165,48)+text(67,89,'T = 100',24,ink.green)+text(12,147,'切為手動，可恢復 Otsu',16),'本圖立即重算，尚未自動採用範圍'],['極性控制白色條件',text(8,35,'亮前景：Y > T → 白',18)+text(8,81,'暗前景：Y ≤ T → 白',18)+text(8,133,'白格數 = 遮罩實算輸出',15,ink.orange),'條件由極性推導，格數是唯讀']];
 case 'components':return [['固定四鄰接',grid([[0,1,0],[1,1,1],[0,1,0]],{x:65,y:10,size:40})+text(15,155,'斜角未列入相鄰',16),'不是自動比較四鄰接與八鄰接後選出'],['固定工程篩選',text(7,29,'0.3% ≤ 占比 ≤ 90%',19)+text(7,76,'接觸圖邊 < 3 側',19)+text(7,123,'兩軸跨度均 ≥ 5 格',19),'本圖依據會逐項畫出通過與拒絕'],['固定顯示上限',text(13,36,'通過者依面積排序',19)+text(28,95,'1  2  3  …  8',28,ink.green)+text(13,147,'第 9 名仍可能是真工件',15,ink.orange),'前 8 是清單限制，非算法置信度']];
 case 'hull':return [['沒有獨立閾值',poly(polygon,'none')+text(144,91,'已選邊界',13),'選定點集後，幾何結果由座標決定'],['以轉向判斷頂點',circle(18,128,5)+circle(115,73,5,ink.orange)+circle(232,22,5)+line(18,128,115,73,ink.muted,2)+line(115,73,232,22,ink.muted,2)+text(3,163,'共線／轉向不符 → 退回中點',14),'本圖可重播真實座標及叉積'],['可改的是上游',badge(7,3,'換連通區')+badge(7,49,'改閾值／採樣間隔')+badge(7,95,'人工修正圈選',ink.orange),'不能直接改頂點數或新增格數']];
 case 'template':return [['圈選由人確認',object()+rect(30,10,180,110,'none',ink.green,0),'工件身分不是由模板尺寸決定'],['固定外擴規則',object(47,41,146,75)+rect(20,14,200,128,'none',ink.orange,0)+text(16,165,'max(6 px, 短邊 × 12%)',16),'背景也會成為定位依據的一部分'],['固定採樣規格',overview('template')[2][1],'22 × 22 是工程預設，不是最佳解證明']];
 case 'locate':return [['本版預設門檻',badge(7,3,'ZNCC ≥ 0.90')+badge(7,49,'MAE ≤ 24 灰階')+badge(7,95,'峰差 ≥ 0.035'),'目前方案高級參數可覆蓋'],['三者是 AND',text(8,39,'相關通過',17)+text(8,81,'誤差未過',17,ink.red)+text(8,123,'峰差通過',17)+arrow(142,80,180,80,ink.orange)+text(182,88,'拒絕',19,ink.orange),'一個漂亮分數不能替代全部條件'],['用圖集驗證適用範圍',line(15,143,243,143)+[25,49,85,140,165,214].map((x,i)=>circle(x,120-i*12,5,i<2?ink.red:ink.green)).join('')+text(5,23,'正確 / 錯誤樣本分數分布',16)+text(8,163,'需要人工真值，不能當通用保證',13),'預設值未由目前圖片集自動校準']];
 case 'edges':return [['搜尋與方向',text(5,32,'灰階差預設 18',20)+text(5,78,'方向偏差預設 15°',19)+text(5,129,'搜尋半寬：7%，限 12–45 px',15),'高級參數可調，以方案實際值為準'],['完整比較切向平均',text(8,37,'1 → 5 → 9 → 15 px',24,ink.green)+rect(8,65,225,12,ink.blue)+rect(8,96,225,34,'#346574')+text(8,155,'八組全算，通過後仍比較線位',15),'優先少平均；不宣稱精度最佳'],['固定品質門檻',badge(7,3,'覆蓋 ≥ 65%')+badge(7,49,'RMS ≤ 1.5 px')+badge(7,95,'連續性 ≥ 55%'),'另需局部支持、缺口與意圖距離條件']];
 case 'measure':return [['先過幾何約束',line(20,20,225,29,ink.green,3)+line(20,125,225,134,ink.green,3)+text(20,77,'對邊方向差 ≤ 3°',17)+text(20,163,'正交誤差 ≤ 5°',17),'固定近矩形模型，不適用任意輪廓'],['px 轉 mm 的來源',text(14,33,'像素長度',22)+text(98,75,'×',24,ink.green)+text(14,118,'已確認雙軸實測比例',18)+text(9,161,'理論像元／倍率不冒充實測',14,ink.orange),'比例與當前成像配置必須相容'],['哪些能改',badge(7,3,'可修改：上游 ROI / 找線')+badge(7,49,'可重做：實測標定')+badge(7,95,'唯讀：四角、寬、高',ink.blue),'修改後需重算與重新驗證']];
 case 'decide':return [['上下限由人提供',text(16,35,'規格文件 / 工程要求',20)+arrow(125,52,125,90)+text(16,126,'人確認單位與上下限',19,ink.green),'算法不能自行猜正式公差'],['量測與規格單位一致',text(8,40,'10.02 mm ↔ 9.90–10.10 mm',17,ink.green)+text(8,104,'320 px ↔ 10 mm',19,ink.red)+text(8,151,'不可混用單位直接比較',16),'無有效標定時，毫米結果為 UNKNOWN'],['驗證真值另存',badge(7,3,'人工答案：你預先知道的結果')+badge(7,49,'算法結果：本次計算輸出',ink.blue)+badge(7,95,'比較兩者：漏檢／誤拒',ink.orange),'不能讓 Agent 自己生驗收答案']];
 default:return overview(id);
}}
function limits(id){switch(id){
 case 'original':return [['指紋相同',object(),'表示像素輸入相同'],['畫面可能有多個物件',pattern(8,20,90,72)+pattern(140,65,90,72),'指紋不提供工件語義'],['需要人工確認',rect(5,9,110,97,'none',ink.green)+text(9,147,'圈選並確認要檢查哪個物件',14),'這是人與 Agent 協作的輸入']];
 case 'gray':return [['細線剛好在取樣點之間',grid([[0,0,1,0,0,0],[0,0,1,0,0,0],[0,0,1,0,0,0],[0,0,1,0,0,0]],{x:30,y:20,size:31})+[0,3].flatMap(x=>[0,3].map(y=>circle(44+x*31,34+y*31,5,ink.orange))).join(''),'白細線存在，但橙色取樣點沒讀到'],['輸出竟然全暗',grid([[0,0],[0,0]],{x:65,y:25,size:52})+text(13,154,'失敗：採樣點之外細節遺失',14,ink.red),'大間隔不能保證保留缺陷'],['怎麼核對與修正',badge(7,3,'看本圖逐像素局部')+badge(7,49,'縮小採樣間隔，再比較')+badge(7,95,'必要時改用彩色特徵',ink.orange),'減少間隔後仍需圖集驗證']];
 case 'binary':return [['光照不均',Array.from({length:9},(_,i)=>rect(15+i*24,20,24,115,`rgb(${35+i*22},${35+i*22},${35+i*22})`,'none',0)).join('')+object(70,47,100,59),'同一物件可能一邊暗、一邊亮'],['一個閾值切錯邊界',grid([[0,0,0,1,1,1],[0,0,1,1,1,1],[0,0,1,1,1,1],[0,0,0,1,1,1]],{x:30,y:12,size:31}),'曲線最大仍不等於正確分割'],['看遮罩，而非只看 T',badge(7,3,'前景漏掉了嗎？',ink.orange)+badge(7,49,'背景混入了嗎？',ink.orange)+badge(7,95,'不同圖片仍成立嗎？',ink.orange),'分布交疊時需換照明或換方法']];
 case 'components':return [['斜角接觸',grid([[1,0],[0,1]],{x:63,y:15,size:57})+text(45,157,'四鄰接：兩個區塊',16),'人看似相接，算法仍視為分開'],['背景也能通過',rect(20,20,210,104,ink.blue)+pattern(85,47,68,47)+text(20,157,'大而連通 ≠ 就是工件',16,ink.orange),'符合面積與跨度只代表通過工程篩選'],['核對本圖，再確認',badge(7,3,'比較被拒與通過的區塊')+badge(7,49,'必要時改閾值／改極性')+badge(7,95,'人工確認工件身分',ink.orange),'不能從面積排序推導語義正確率']];
 case 'hull':return [['缺口本來存在',poly(polygon,ink.green)+text(146,92,'缺口',15,ink.red),'原始缺陷在像素上仍存在'],['凸包把它包住',rect(25,25,200,120,ink.orange,ink.orange,0)+poly(polygon,ink.green)+text(146,92,'被填入',13,ink.bg),'不代表缺口合格或已消失'],['凸包只作搜尋範圍',badge(7,3,'原區塊與新增範圍分色')+badge(7,49,'精密輪廓需其他方法',ink.orange)+badge(7,95,'不能拿凸包做凹口缺陷判定',ink.red),'幾何可正確，語義仍可能不適用']];
 case 'template':return [['稀疏點間有缺陷',object()+line(85,10,85,119,ink.red,5)+[40,65,110,140,170,199].map(x=>circle(x,35,4)).join(''),'紅細痕沒有落到綠色取樣點'],['模板可能完全沒變',text(15,43,'484 個取樣值仍相同',20)+text(15,101,'匹配分數仍可很高',19,ink.orange),'定位模板不會證明表面沒有缺陷'],['任務要分開',badge(7,3,'定位：找到對象在哪裡')+badge(7,49,'量測：檢查幾何尺寸',ink.blue)+badge(7,95,'外觀：需額外像素檢查',ink.orange),'不能把定位通過當作外觀全檢']];
 case 'locate':return [['兩個相似目標',pattern(8,22,90,75)+pattern(145,68,90,75),'兩處可能都產生高分'],['最高分不一定可靠',`<path d="M 8 143 L 46 140 L 73 28 L 102 141 L 154 140 L 181 31 L 216 142 L 245 143" fill="none" stroke="${ink.orange}" stroke-width="3"/>`+text(56,20,'.97',15)+text(166,23,'.96',15),'示例峰差太小 → 拒絕唯一定位'],['本版未單獨檢出這些變化',text(7,36,'旋轉 / 縮放 / 遮擋',20,ink.orange)+text(7,89,'也可能碰巧通過門檻',17)+text(7,139,'請用獨立圖片與人工複核',16),'沒有第二候選也不是唯一性證明']];
 case 'edges':return [['背景線也很直',line(10,42,243,42,ink.red,4)+line(10,100,243,102,ink.green,3)+text(30,30,'背景',15,ink.red)+text(30,134,'工件邊',15,ink.green),'背景線的殘差甚至可能更低'],['幾何合格 ≠ 意圖正確',badge(7,3,'覆蓋通過')+badge(7,49,'殘差通過')+badge(7,95,'卻選到背景',ink.red),'必須同時核對位置與真實圖像'],['用 ROI 與人選消歧義',rect(5,77,240,50,'none',ink.orange,0)+line(10,42,243,42,ink.red,4)+line(10,100,243,102,ink.green,3)+text(17,157,'縮小搜尋帶 / 點選真正候選',14),'選擇記錄後仍需重新跑圖集']];
 case 'measure':return [['四邊看似合理',overview('measure')[1][1],'幾何相交本身可能完全正確'],['但模型假設不成立',poly([{x:30,y:35},{x:225,y:16},{x:195,y:147},{x:60,y:129}],'none',ink.orange)+text(36,167,'透視 / 非平面 / 畸變',16,ink.orange),'低擬合殘差不是尺寸誤差上界'],['校準與場景一起核對',badge(7,3,'近矩形、平面、成像穩定')+badge(7,49,'有效實測標定')+badge(7,95,'跨樣本與標準件驗證',ink.orange),'只在驗證過的條件內使用結果']];
 case 'decide':return [['可靠找到目標',pattern(60,20,130,103)+text(19,154,'可給出「找到」的證據',15,ink.green),'可靠定位是存在的正向證據'],['沒找到不等於缺失',rect(18,16,215,116)+text(46,84,'未可靠定位',22,ink.orange)+text(12,158,'可能因照明 / 遮擋 / 位置變化',13),'目前不能直接把未找到判為缺失 NG'],['保留 UNKNOWN',badge(7,3,'證據不足 → UNKNOWN',ink.orange)+badge(7,49,'人工答案與算法結果分開')+badge(7,95,'補證據，再驗證與發布',ink.blue),'不強迫每張圖都輸出 OK 或 NG']];
 default:return overview(id);
}}
export function toolDiagram(id,tab='overview'){const data=(tab==='parameters'?parameters:tab==='limits'?limits:overview)(id);return svg(text(21,24,'教學示意 · '+titles[id]+' · '+(tab==='parameters'?'參數從哪裡來':tab==='limits'?'何時不能相信結果':'輸入 → 方法 → 輸出'),14,ink.muted)+slots(data),{width:960,height:292,label:titles[id]+'工具圖解（教學示意，非目前圖片實算）'});}
