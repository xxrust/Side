# 從圖像源形成可編譯的單件方案

先讀 get_context、get_canvas_project_context、get_purpose_scheme_capabilities。圖像源、參考資料、標記、關係和分類卡均在畫板上；不能要求工程師先從固定形狀或算子清單選需求。大量圖片用 get_dataset_images 分頁；需要看哪一張再取其像素。

## 先確定輸出類別

classificationSpec 聲明 categories（品質 good/bad/undetermined 與類別ID分開）、metrics（型別、單位與範圍）、rules、coverage、missing、conflicts、aggregation 與 fault。最終結果 categoryId 只有一個，categoryIds相容陣列長度也必須1；同件多個瑕疵另放defectLabels。aggregation.multilabel不能作最終分類。來源記錄人類、文件或獲授權的推論，不能自稱 human confirmed。良品可以有多個尺寸分檔；區間端點、重疊優先、缺量測和定位失敗映射必須清楚。UNKNOWN 只有工程規格明確聲明時才是合法產品類別；不要讓工具內部狀態自動變產品分類。

缺資訊時保存可追溯問題：使用 add_canvas_card kind=consultation 並在當前對話提出具體問題。compile_scheme 回傳 questions/errors 的 path/code/hint 也會顯示在諮詢卡。工程師回答後，保留回答來源再修訂分類規格；不要猜測或替人填 confirmed。已授權以good樣本暫訂試驗值時，可做明確標為試驗的提案，不冒充工業規格或獨立真值。

## 依輸出反推前提與節點

由目的分類需要什麼量往前倒推，形成 operatorGraph；節點是有目的的算子組合，例如專用濾波、找線、構矩形可內聚為定位。真正共用的預處理獨立計算給下游。工程節點 parentId 最多三層，圖容器與內部算子不算一層。聲明完整分支，再由實際單件記錄標出走過／未走的路；不得由一次trace刪掉宣告分支。

固定參考資產用execution.referenceInputs:{slot:真實imageId}，Python references[slot]/reference_records[slot]讀取，影像身份依然綁來源。不可把模板放進待檢來源逐件計數，亦不可假裝成同工件多相機。

新方案使用 execution:{unit:'workpiece',inputSlots:[...],dataContracts:'required'}；常態只有一張image。多相機必須明確同工件分組及views，不能把整個圖像源作為一個輸入。節點保存 code、parameters、expected_outputs、節點文檔和具名 inputs；輸入引用用 {nodeId,artifactId,dataContract} 加真實 edge。產出與輸入的型別、座標系、單位依 [data-contracts.md](data-contracts.md) 聲明，由平台驗證。下游用 upstream[slot].image（真圖片）或 upstream[slot].artifact.data（真JSON），不得重算後冒稱共享。

result 以 valid:true 加真實量測值，或 valid:false,code:'NOT_FOUND' 表示正常未找到；metricBindings 把 nodeId/result path 綁定到分類指標。FAULT 是運行故障獨立出口，不作NG證據。內部 invoke 的 requires/any_of/when 統一阻擋依賴並讓獨立支路繼續。具體可執行介面讀 execution.md 與 capabilities，別虛構接口。

## 編譯、單件驗證、資料集回歸

1. 先 validate_purpose_scheme 提交完整候選 JSON；這是只讀預檢，不覆寫目前方案。依 errors 的 code/path/hint 與 questions 修正，再 set_purpose_scheme 保存並 compile_scheme 核對。格式、引用與拓撲由平台檢查，不能只在對話中宣稱修好；結構可編譯不代表算法已驗收。
2. run_workpiece_scheme 先執行當前一件，核對真圖、圖層、數據、節點文檔、正常NOT_FOUND和FAULT出口；get_algorithm_run按需讀資料。把結果放回發問畫板，不跳到舊頁。
3. run_dataset_scheme 對圖像源逐件執行同一編譯方案，get_dataset_execution分頁讀進度／單件摘要，get_inspection_unit按ref讀回選件。不把所有產圖展開在畫板，也不把整圖集逐張傳模型。
4. 將真實有來源的人工標籤與推斷分開。get_dataset_execution 統計未標註不計準確率；FAULT獨列，不能當正確NG。人類確認的expected若透過 units_json 提供必須附 provenance，不能自行生成human標籤。
5. 核對每步三依據、獨立樣本／反例、召回和誤判、時間及未測限制。保存圖像源關聯的classification/statistics卡。未標答案、未給節拍或未完成現場驗收時明說，delivered:false；三依據完整與案例通過不能取代發布條件。

舊 purposeCard/imagingConstraintCard/acceptanceCard 與逐圖 cases 大腳本僅作既有專案相容路徑；不要用它替新需求建立全資料集一次運算。

## 圖形與執行語意

方案概覽必須連通待檢影像／固定參考、目的節點、分類條件、產品出口與獨立故障出口。目的節點可展開其真算子／輸入／產物；不要拿一排結果圖代替完整方案。主圖的角色由 schema 決定，Agent 不必拼 HTML 假造可執行流程。

用具名 inputs、metricBindings、when 與依賴實例交代線的實質內容：產生者 → 消費者是資料流，條件決定是否執行是控制流，parentId 是包含而不是先後。若同一對節點兼具資料與執行前提，兩種來源都保留；不能依排列順序或時間戳補線。來源可用不等於使用過、節點已執行不等於產品合格；圖上的本件路徑只能來自保存的單件事實。

給目的節點、指標與分類取工程師可理解的名稱，細節放入可展開的節點文檔。禁止為美化流程而增造量測結果、分支或刪掉未走過的路。驗收時分別看側欄概覽、完整方案、節點內部，並核對正常、否定與真實故障的呈現。
