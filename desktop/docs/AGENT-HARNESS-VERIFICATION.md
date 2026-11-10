# Agent harness 迭代與驗收帳本

目標：人類主要透過面板提出需求；Agent 執行開發；平台負責形式驗證；Agent 易於取得可操作的回饋；用 OpenCV 實例 benchmark 驗證。這份帳本不能替代實算、UI 或模型實際回覆。

Git 分支：`codex/agent-harness-20261102`。`8516575` 保存 0.15.8 累積源碼基線；不是全套舊測試通過聲明。後續每階段以小提交記錄。

## 本輪交付核對（最終）

| 要求 | 完成證據 | 界限 |
|---|---|---|
| 面板需求 → 真 Pi → 真執行 | pi-repair-02 完成修復，pi-authoring-01 完成新建及迭代執行 | 精確分離算法未達標，後續試驗明記 INCOMPLETE |
| 平台形式驗證與可讀回饋 | 共用 schema、唯讀候選驗證、code/path/hint、端口型別／單位／座標來源、實際 mask／幾何格式檢查 | 不證明算法精度或任意 Python 的所有內部語義 |
| 單一權威方案及來源 | purposeScheme 驅動流程圖／編譯／執行，真實 trace 驅動內部拓撲，同件父節點資料綁定 | 舊方案無型別宣告維持 warnings，不冒稱已驗證 |
| OpenCV 與耐久 benchmark | 真 box/scene/fruits 與 smarties，真 Pi 自主修復；1000 件、2000 次節點執行，0 FAULT | 2 張原圖重複，不是 1000 張獨立準確率樣本；完整週期平均 61.31 ms 未達 50 ms |
| 全面回歸 | full-regression-final.log：815/815，無失敗／跳過 | 包含真實像素與原生紀錄；DOM 測試不宣稱原生桌面截圖驗收 |
| 本體／skill 反饋 | project-workflow、data-contracts、validation 更新；格式檢查通過 | Pi 仍可能算法設計失敗，須保存拒因與未完成結果 |
| 官方比較與取捨 | AGENT-HARNESS-REVIEW.md 完成五家官方資料核對及成本／相容性取捨 | 完整 debugger／模組庫是後續候選，不是此輪已實作 |
| 建置、安裝、保留工作 | 0.15.9 打包、簽章核對、啟動；舊 app/session/profile/受影響 skill 備份；原專案名稱、圖像身份及方案內容一致 | installation.json；桌面畫面未用 computer-use 取證 |
| 安裝後實測 | 已安裝 binary 2 件、4 次節點執行、0 FAULT；安裝版 Pi SDK ready、74 tools 與契約 hash 相符 | 無標註樣本不生成準確率 |
| Git | 基線、契約、實測修復、UI 修復、發行分階段提交 | 本輪無關檔案保留，不納入提交 |

本輪平台迭代交付完成。算法精確分離與嚴格 50 ms 生產目標沒有被宣稱完成；它們是此次 benchmark 明確暴露的後續項目。

## 2026-11-02 第一階段

- 新增 source schema 的建置時驗證器，Ajv 僅用來生成程式；WebView 無需開放 eval。
- 新增 read-only `validate_purpose_scheme` 與能力入口。
- 平台編譯另檢查固定參考圖像是否真的存在；只讀 metadata。
- 新增候選唯讀、格式診斷、來源引用、實際 Agent tool event 往返測試。
- 55 項相關測試通過；其中實算使用真實 PNG 與 native dispatcher / OpenCV，未捏造模型答覆或運算值。
- 檢查資料：`../codex-audit-logs/20261102-agent-harness/feedback-roundtrip.json`、`regression.log`、`executed.agentcv.json`。
- `npm run build` 通過；尚未以此階段取代 0.15.8 安裝版。待後續接口與端到端 benchmark 完整再部署。

新 benchmark 中修復候選由測試程式提交，不得稱為模型自主修復。整體目標仍未完成。

## 依序續作

1. 補齊語義接口與座標／單位的顯式契約及運算時拒因，保留任意算法能力與舊方案相容性。
2. 在同一面板流程觀察／引用診斷；驗證修改、上游依賴、固定結果與新執行的界限。
3. 用實際 Pi 和 OpenCV 公開案例跑建構／修正／執行／讀回 benchmark；分開形式通過、案例正確與工業驗收。
4. 查官方產品文件評估調試與模組復用，對照既有能力，選低風險增量。
5. 完成相容性、UI、真實執行與效能檢查，部署並作要求逐項完成審查。

技術參考：Ajv 官方 JSON Schema 2020-12 支援說明 https://ajv.js.org/json-schema.html 。來源僅支持驗證器選型，不能證明本產品的算法正確性。

## 2026-11-02 第二階段：端口語義與實際資料

- 新增共用 dataContract schema，工具能力、建置時驗證器、方案編譯與執行後審計使用相同宣告。涵蓋 image/mask、points/roi/contours、homography、measurement、classification、json/file；不是重新封裝 OpenCV。
- 新方案可指定 execution.dataContracts=required，強制每個產物與連接輸入有契約。既有未宣告方案繼續相容，但回傳 DATA_CONTRACT_MISSING warnings，不宣稱完成語義驗證。CV skill 已要求新建方案使用 required。
- 編譯檢查端口型別、座標來源、單位一致及實際 transport；沒有隱式轉換。輸出 ID 重複也在執行前拒絕。
- 實際執行檢查 JSON 幾何與有限值、量測單位、平面變換格式／退化、圖像尺寸及二值 mask 像素。資料契約故障以 execution=FAULT 保存，Python 程序原始 status 保留；正常 NOT_FOUND 可無量測。錯誤節點的下游不使用資料，後續工件繼續。
- 座標系解析到同件輸入／固定參考／實際產圖的身份、內容雜湊或 runId。縮放後圖像可有自己的座標系，沿明確上游資料傳遞。這不證明幾何變換數學正確；疊圖、標註與獨立回歸仍必要。
- 直接執行目的節點不能提交歷史上游替代本次方案依賴；平台從本次有效 run 取回真產物，而非信任提交資料。
- qa/data-contract.test.mjs 使用真實 OpenCV box/box_in_scene，實際 threshold/findContours/contourArea/getPerspectiveTransform；包含刻意錯誤單位、非二值 mask、錯誤尺寸及零矩陣反例。8 項通過。最終 63 項相關回歸通過（包含這 8 項），建置與 skill 格式檢查通過。
- 證據：`data-contract-runtime.json`、`data-contract-tests.log`、`data-contract-regression.log`、`data-contract-build.log`（同本階段 audit 目錄）。尚未部署；尚不能以此聲稱模型自主修復成功。

下一步：用真實 Pi 經面板做錯誤修復及新建方案 benchmark，觀察其能否使用這些契約與平台拒因；其後完成 UI/部署/官方比較與逐項審查。

## 2026-11-02 第三階段：真 Pi、原生耐久與回歸審查

所有紀錄位於 `codex-audit-logs/20261102-agent-harness/`，區分如下：

| 驗證 | 實際結果 | 界限 |
|---|---|---|
| pi-repair-02：面板要求修復一條錯誤依賴 | Pi 讀取平台錯誤，完整候選預檢後保存與執行；6 次 Python 節點執行，原算法、參數、分類規則保持不變；scene 映射、fruits 不映射 | pi-repair-01 在模型發送前因測試入口已隱藏而失敗，保留紀錄；不是算法失敗 |
| pi-authoring-01：從無方案的 smarties/fruits 專案開始 | Pi 自主寫兩個目的節點與嚴格端口契約。平台攔下 826×356 比較圖被錯誤宣告為 413×356 原圖座標；Pi 修正後單圖與圖集均實算、讀回、呈現 | 工作流程通過；13 個連通候選仍有兩物件合併，精確計數要求未達成，不能把自檢當 GT |
| pi-refinement-01：同一問題接續修正 | 保存兩次真正分離試驗與對照，Pi 明確說明面積／邊界尚不可靠 | 未更新完整方案、未跑全來源，benchmark 狀態 INCOMPLETE；沒有用後處理的答案代替 Pi。report.scope 的舊字串包含 fresh authoring，應以 sessionScope／原 threadId 的接續紀錄為準 |
| native-authoring-1000 | 同兩張原圖交替各 500 次，2000 次節點執行，0 FAULT；總耗時 61467.488 ms。檢測平均 47.0793 ms、P95 63.4908 ms；包含耐久保存的週期平均 61.3117 ms、P95 79.9013 ms、最大 189.0937 ms | 原生 headless，不含 UI paint；不是 1000 張獨立驗收圖，也未達完整週期 50 ms。主控 Node RSS 不能冒稱整個 Rust/Python 記憶體 |
| 輸出檢視 | verified-output-view.png／verified-canvas-view.png 經實際產物讀取後截圖 | authoring 原始 actual-pi-result.png 為測試讀取介面未接妥時的 loading，不作呈現通過證據；沒有改模型產物 |

實測後修正：
- 不支援的 `$patch` 現在回傳 SCHEME_PATCH_UNSUPPORTED 和完整候選操作方式，而非無關的舊規格錯誤。
- 懸空邊不再附加假的循環診斷。
- 輸出契約 FAULT 會使 evidenceAudit 為 DIAGNOSTIC_ONLY，不能同時顯示依據就緒。63 項相關回歸再次通過（observed-feedback-regression.log）。
- 新來源檢查造成舊整批方案的合法資料邊被拒絕。已加入僅限當次編譯執行的 legacy run 集合，仍從已保存的真實父節點取資料，不能傳入歷史 run 冒充。8 項舊方案＋8 項端口測試均通過（legacy-contract-regression.log）。
- CV validation skill 增加：不能把連通域數當作已分開物件數；目檢已發現不符合目的時不得宣稱完成。

完整回歸初次 815 項中 781 通過、34 失敗（full-regression.log）。正在逐項修復／核對，其中快捷鍵因輸出模式狀態與實際畫面不一致而失效已修復，17 項相關檢查通過。舊測試中明確要展示的結果應宣告 role=result，歷史圖指定 artifact；不能為通過舊測試恢復自動鋪滿所有中間圖。

**尚未完成：**其餘完整回歸、最終建置與桌面部署、安裝後驗證及最終 checklist 審查。算法分離 benchmark 未通過亦保留，不以端口正確宣稱算法有效。

### 完整回歸的後續修復

- 可見畫布快捷鍵：以實際 showing-node-output 狀態隔離；沒有輸出可顯示時，不因內部預設 mode=output 吞掉畫布操作。明確加入引用圖時切到討論畫布。17 項真實像素／標註／鍵盤相關檢查通過。
- 同件跨節點載回：共用 unit record 的讀取不可因節點切換被取消，仍逐次核對 epoch、工件、方案、executionId、unitId、recordRef。否則新節點等待的是舊節點已取消的 Promise。錯誤回饋也修正為可在新建 DOM 中顯示。5 項 current-workpiece-selection 檢查通過，包含實際檔案讀取、同件切換、別件隔離及不存在檔案的重試。
- 測試預期同步已確認的產品變更：輸出圖宣告 role=result；歷史展示指定 artifact；查程序畫板明確 mode=canvas；自動切換使用 switch/aria-checked；計時只顯示 n ms；待諮詢移至項目列；統計為專案級四頁面而非來源選擇器。這些測試仍使用真實算法／已保存原生紀錄，沒有改圖片或偽造執行值。

## 0.15.9 最終交付

- 完整回歸最終 815 項全數通過；前一輪 814/815 的載回錯誤在最後修復後重新跑完整套件確認，未刪除或跳過測試。
- 最後源碼重新打包為 0.15.9，簽章核對成功並啟動 `/Users/liangshiben/13-cv/AgentCV.app`；舊版與工作階段備份於 audit 的 installation-backup。
- 已安裝程序實際執行兩張原圖、四次節點運算；Pi bridge 從安裝資源與使用者 profile 啟動，74 個平台工具 hash 與 build manifest 相符。啟用中的 CV skill 只合入此次三個參考文件，保留其餘內容。
- 原專案與方案未被 benchmark 替換。瀏覽器共用 UI 的產圖已核對；沒有把它宣稱為 native computer-use 截圖。
