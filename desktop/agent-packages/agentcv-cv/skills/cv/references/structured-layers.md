# 計算幾何圖層：先讀契約，再保存

編寫 `save_layers` 前，讀取 `get_algorithm_capabilities().sdk.structuredLayers`。Python producer 與畫板 consumer 共用 `structured-layers-contract.json`；SDK 返回完整 schema、預設規則和範例，不要靠記憶猜欄位。

| 物件 type | geometry 必填內容 | 表達 |
| --- | --- | --- |
| `roi` | `points:[{x,y},…]`，至少3點 | 封閉多邊形搜尋範圍 |
| `line` | `points:[{x,y},{x,y}]` | 直線段 |
| `polyline` | `points:[{x,y},…]`，至少2點 | 開放折線 |
| `blob` | `points:[{x,y},…]`，至少3點 | 封閉實測輪廓 |
| `circle` | `center:{x,y}, radius`，radius>0 | 擬合圓或明確說明的幾何圓 |
| `measurement` | `points:[{x,y},…], value, unit` | 實際量測數字及其位置 |
| `note` | `points:[{x,y},…], text` | 與圖中位置相連的說明 |

`polygon` **不是**合法 type，也沒有自動別名。多邊形使用 `roi` 和 `geometry.points`。量測的 `value`、`unit` 位於 `geometry` 內；`geometry.from/to` 不能代替 `points`。所有數字必須有限，不能用 NaN 表達找不到；找不到應回傳正常 NOT_FOUND，不能生成假幾何。

## 身份與自動補充

每層必須自行提供唯一 `id` 及 `objects`；每個物件必須提供唯一 `id`、合法 `type` 和真正計算的 `geometry`。每次 run 最多256層、每層20000物件、每個物件100000點。

- `imageId` 是本次 `image_records[i]['id']`。單張輸入可省略；多張工件輸入必須明確指出是哪一張，不能拿檔名或畫板資產ID代替。固定參考圖的ID來自 `reference_records[slot]['id']`；要在參考圖上產生幾何時必須明確指定。
- `sourceId` 預設為本層 `imageId`，同樣必須指向本次實際輸入影像。
- `stepId` 在 `with step(...)` 內自動綁定當前真實 instanceId；在區塊外呼叫時，必須填已執行過的 step。無歧義的基礎 step id 會解析為 instanceId；重複執行的 step 請用 `contour#2` 這種確切身份。
- 缺少物件 `coordinateSpace` 時，SDK 補 `{imageId:本層imageId, kind:'original-image-pixels', unit:'px'}`。座標值一律是原圖像素；不會因顯示縮放而改變。
- 跨另一張輸入影像的座標必須提供可逆 `coordinateSpace.transform=[a,b,c,d,tx,ty]`，意義為 `x'=a*x+c*y+tx`、`y'=b*x+d*y+ty`。沒有實際座標關係時不能假設對齊。
- SDK 補 `locked:true`。工程師仍能選取與問詢；人工修改應另留版本，不覆寫計算事實。

幾何可以延伸到影像邊界外；SDK不自動裁切。算法必須說明採樣、遮罩和邊界處置。

## 真實計算的保存方式

以下是取得實際輪廓後的保存結構。輪廓是怎麼選出的、為何有資格作為工件，仍需節點文檔；不能因為這段程式可執行就宣稱定位可靠。

```python
with step('contour-measurement'):
    # contour 必須來自前述真實找輪廓與選擇結果；不存在時走 NOT_FOUND。
    x, y, width, height = cv2.boundingRect(contour)
    points = [{'x': float(p[0][0]), 'y': float(p[0][1])} for p in contour]
    save_layers('measured-geometry', [{
        'id': 'actual-contour-and-width',
        'imageId': image_records[0]['id'],
        'objects': [
            {'id': 'actual-contour', 'type': 'blob',
             'geometry': {'points': points}},
            {'id': 'bounding-width', 'type': 'measurement',
             'geometry': {
                 'points': [{'x': float(x), 'y': float(y)},
                            {'x': float(x + width), 'y': float(y)}],
                 'value': float(width), 'unit': 'px'},
             'label': '輪廓包圍盒寬度，非精密邊緣擬合'}
        ]
    }])
```

`save_layers` 保存前驗證整批；非法type、欄位、來源、座標或step會給出 `code/path/type/hint`，本批不寫入不可用的圖層檔。讀取錯誤後按具體路徑修正，再重跑；不能只改說明文字或繞過SDK直接塞 `structuredLayers`。直接指派也會在執行結束時驗證。

畫板對舊版非法圖層會回傳 `diagnostics` 並隔離該層；其他正確圖層仍顯示。這不代表舊事實已被修復，不能改寫歷史檔案來隱藏問題。
