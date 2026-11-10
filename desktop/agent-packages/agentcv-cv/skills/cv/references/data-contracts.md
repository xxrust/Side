# 節點資料契約與平台回饋

新建完整方案使用 `execution.dataContracts:"required"`。這是目的節點間的接口，不是把 OpenCV 逐算子重包裝。`expected_outputs[].dataContract` 宣告產物語義，`inputs.<slot>.dataContract` 宣告消費端需求；兩端必須一致。細節以 `get_purpose_scheme_capabilities.canonicalSchema` 與 `get_algorithm_capabilities.dataContractSchema` 為準。

## 選擇接口

| kind | 儲存方法／資料內容 |
|---|---|
| image | `save_image`；`coordinates` 指定像素座標系 |
| mask | 同上，必須單通道、0/1 或 0/像素型別最大值的二值圖 |
| points / roi | `save_json`：`{coordinates,points:[{x,y},...]}`，ROI 至少三點 |
| contours | `save_json`：`{coordinates,contours:[[{x,y},...],...]}`；可以沒有輪廓，但每條已有輪廓至少一點 |
| homography | `save_json`：`{from,to,matrix:[[...],[...],[...]]}`；from/to 是兩個 coordinates，matrix 是有限 3×3 矩陣 |
| measurement | 契約 `{kind:"measurement",unit:"px2"}`；資料 `{value:實算有限數值,unit:"px2"}` |
| classification | 契約 categories 是合法 ID 陣列；資料 `{categoryId:實際類別ID}`。這不是另建一份最終分類規格 |
| json / file | 任意 JSON / 檔案。此時只驗證傳輸型別，不宣稱已驗證其內部語義；不能用來規避已知輪廓、座標或量測接口 |

`coordinates` 例：`{frame:{kind:"input",slot:"image"},unit:"px"}`。
固定模板用 `{kind:"reference",slot:"template"}`；某步產圖用 `{kind:"artifact",nodeId:"segment",artifactId:"resized"}`。座標系綁定到本次真實來源／產物，不填猜測的 image ID。單圖 draft 使用 input slot `image`；多圖使用具名 workpiece inputSlots/views。

縮放／裁切圖像擁有新座標系。若輪廓需回原圖，程式必須真正做反變換後輸出原圖座標，不能只改 coordinates。平台檢查引用、尺寸、資料格式與單位，不會證明變換數學正確；仍要疊圖目檢及回歸。

例如輪廓端口宣告：

```json
{"id":"contours","type":"evidence","dataContract":{"kind":"contours","coordinates":{"frame":{"kind":"input","slot":"image"},"unit":"px"}}}
```

下游 `inputs.curves` 指向產生者 nodeId/artifactId，複用相同 dataContract。有真實 edge 後，讀 `upstream["curves"]["artifact"]["data"]`；平台只傳同件本次有效上游。不能拿歷史 run 填入或重算後宣稱用了該輸入。

## 依實際回饋修正

- `validate_purpose_scheme` 的 `errors` 帶 code/path/hint；先修完整候選，再保存、編譯與執行。`DATA_CONTRACT_MISMATCH` 要比較生產端與消費端，不只是照錯誤文字換名稱。
- `get_algorithm_run` 的 `dataContractAudit` 記錄實際產物檢查及已解析的來源綁定；`execution.errors` 亦保留失敗位置。Python status=SUCCEEDED 不等於輸出有效：平台可因契約違反給 execution=FAULT，並阻止下游。
- 正常 `result.valid:false` 可以缺少未取得的量測，依分類規格處理。若仍有產物，其資料格式必須正確；不得把格式錯誤偽裝為正常 NG。
- 舊方案沒有契約時，編譯 warnings 明示未驗證覆蓋；修改時逐步補齊，不聲稱舊方案已獲型別保證。

任何檢查通過都不是算法準確率、召回率或正式驗收的替代品。
