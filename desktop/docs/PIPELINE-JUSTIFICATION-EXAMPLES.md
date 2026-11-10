# Pipeline 三項依據示例模板

本文件提供 AgentCV desktop pipeline 已註冊 7 個算子的完整 justification 模板，供 Agent 參考填寫三項必要依據（tool / parameters / boundary）。

## 三項依據規範（systemPrompt 紀律）

每次 `run_algorithm` 前、`create_pipeline` / `set_pipeline_graph` 提交前，三項必要依據（tool / parameters / boundary）必須完整填寫：

1. **tool.reason** 須說明本案選用理由（不只是工具定義）
2. **parameters** 須逐個註明來源（`agent-proposal` / `human-input` / `operator-default` / `data-derived` / `not-supplied`）與驗證引用
3. **boundaries** 須明確前提條件與失敗處置

**重要紀律**：重設會話或重新規劃後，**禁止沿用舊輪次的 justification**；缺漏依據時宿主會原子拒絕並返回 errors，不建立半份方案。

---

## 1. image.grayscale（灰階影像）

### 算子資訊

- **op**: `image.grayscale`
- **version**: 1
- **title**: 灰階影像
- **parameters**: 無公開參數
- **evidenceArtifacts**: 3 個（grayscale-image, histogram-grayscale, stats）

### 示例 justification

```json
{
  "tool": {
    "reason": "本案需要穩定的單通道亮度圖供後續 Otsu 分割；彩色原圖需轉為 Rec.601 灰階，避免通道選擇不一致影響閾值。",
    "expectedEvidence": [
      {"kind": "artifact", "type": "image", "id": "grayscale-image"}
    ]
  },
  "parameters": [],
  "boundaries": [
    {
      "condition": "原圖已成功載入且像素可用（非空、非損壞）",
      "check": {"kind": "execution-status", "allowed": ["OK"]},
      "onFailure": "STOP"
    }
  ]
}
```

### 填寫說明

- **tool.reason**：說明為何本案需要灰階（例如後續 Otsu 需要單通道），不只說「灰階轉換」
- **parameters**：無公開參數，使用空陣列 `[]`
- **boundaries**：可引用 execution-status 或 grayscale-image 產物，確認輸入有效

---

## 2. segment.otsu（Otsu 分割）

### 算子資訊

- **op**: `segment.otsu`
- **version**: 1
- **title**: Otsu 分割
- **parameters**: 
  - `polarity` — enum: ['auto','dark','bright'], default: 'auto'
  - `threshold` — integer: [0,255], optional（data-derived）
- **evidenceArtifacts**: 4 個（otsu-binary, otsu-histogram, otsu-threshold-variance, otsu-polarity）
- **parameterOrigins**:
  - `polarity` — whenOmitted: 'operator-default'
  - `threshold` — whenOmitted: 'data-derived'

### 示例 justification

```json
{
  "tool": {
    "reason": "本案背景均勻且目標對比度穩定；Otsu 全域閾值可自動選出二值化門檻，將齒輪前景從背景分開，無需人工標註樣本。",
    "expectedEvidence": [
      {"kind": "artifact", "type": "histogram", "id": "otsu-histogram"},
      {"kind": "artifact", "type": "curves", "id": "otsu-threshold-variance"}
    ]
  },
  "parameters": [
    {
      "name": "polarity",
      "source": "operator-default",
      "reason": "本案邊界背景足以估計前景極性；使用工程預設 auto，讓算法從邊界判定，未針對本案優化。",
      "verification": {"kind": "artifact", "type": "evidence", "id": "otsu-polarity"}
    },
    {
      "name": "threshold",
      "source": "data-derived",
      "reason": "Otsu 從直方圖自動計算類間方差最大的閾值；本次推導值將保存在 evidence，無需人工規格。",
      "verification": {"kind": "artifact", "type": "evidence", "id": "otsu-threshold-variance"}
    }
  ],
  "boundaries": [
    {
      "condition": "直方圖顯示兩個可分峰（前景與背景）",
      "check": {"kind": "artifact", "type": "histogram", "id": "otsu-histogram"},
      "onFailure": "UNKNOWN"
    },
    {
      "condition": "極性自動判定無歧義（邊界背景一致）",
      "check": {"kind": "artifact", "type": "evidence", "id": "otsu-polarity"},
      "onFailure": "UNKNOWN"
    },
    {
      "condition": "執行成功（無異常、無梯度錯誤）",
      "check": {"kind": "execution-status", "allowed": ["OK"]},
      "onFailure": "STOP"
    }
  ]
}
```

### 填寫說明

- **tool.reason**：說明為何全域 Otsu 適用（背景均勻、對比穩定等），不只說「需要分割」
- **parameters**：
  - `polarity` — source: `operator-default`（工程預設 auto）
  - `threshold` — source: `data-derived`（從直方圖推導）
- **boundaries**：可引用 otsu-histogram / otsu-polarity / otsu-threshold-variance 產物

---

## 3. regions.components（連通物件與孔洞）

### 算子資訊

- **op**: `regions.components`
- **version**: 1
- **title**: 連通物件與孔洞
- **parameters**:
  - `selection` — enum: ['unique','largest','component'], default: 'unique'
  - `componentId` — integer: [1,16000000], optional
  - `minArea` — integer: [1,16000000], default: 12
  - `excludeBoundary` — boolean, default: true
- **evidenceArtifacts**: 3 個（component-candidates, selected-region, region-contours）
- **parameterOrigins**:
  - `componentId` — whenOmitted: 'not-supplied'（僅 selection='component' 時需要）

### 示例 justification

```json
{
  "tool": {
    "reason": "本案分割後需要唯一前景物件；regions.components 8連通提取，要求候選唯一或人工選定 id，避免最大塊靜默猜測導致錯選。",
    "expectedEvidence": [
      {"kind": "artifact", "type": "evidence", "id": "component-candidates"},
      {"kind": "artifact", "type": "mask", "id": "selected-region"}
    ]
  },
  "parameters": [
    {
      "name": "selection",
      "source": "agent-proposal",
      "reason": "本案期望唯一候選；使用 unique 模式，多物件時拒絕而非靜默猜測，避免後續輪廓錯誤。",
      "verification": {"kind": "artifact", "type": "evidence", "id": "component-candidates"}
    },
    {
      "name": "componentId",
      "source": "not-supplied",
      "reason": "selection=unique 時不需要 componentId；若後續出現多候選，則需人工補 id 或改用 selection=largest。",
      "verification": {"kind": "execution-status", "allowed": ["OK"]}
    },
    {
      "name": "minArea",
      "source": "operator-default",
      "reason": "使用工程預設 12 像素過濾椒鹽噪點；未針對本案優化最小面積，實算後觀察候選清單。",
      "verification": {"kind": "artifact", "type": "evidence", "id": "component-candidates"}
    },
    {
      "name": "excludeBoundary",
      "source": "operator-default",
      "reason": "觸邊物件輪廓不完整；使用預設 true 排除，確保完整外緣供後續齒輪分析，未優化。",
      "verification": {"kind": "artifact", "type": "mask", "id": "selected-region"}
    }
  ],
  "boundaries": [
    {
      "condition": "候選數量為 1（唯一前景，無歧義）",
      "check": {"kind": "artifact", "type": "evidence", "id": "component-candidates"},
      "onFailure": "UNKNOWN"
    },
    {
      "condition": "選中 region 面積 >= minArea（非噪點碎片）",
      "check": {"kind": "artifact", "type": "evidence", "id": "component-candidates"},
      "onFailure": "STOP"
    },
    {
      "condition": "選中 region 輪廓閉合且不觸邊",
      "check": {"kind": "artifact", "type": "mask", "id": "selected-region"},
      "onFailure": "UNKNOWN"
    }
  ]
}
```

### 填寫說明

- **tool.reason**：說明為何需要唯一候選機制（避免靜默猜測），不只說「需要連通域」
- **parameters**：
  - `selection` — source: `agent-proposal`（選擇 unique 或 largest）
  - `componentId` — source: `not-supplied`（unique 時不需要）
  - `minArea` / `excludeBoundary` — source: `operator-default`（工程預設）
- **boundaries**：引用 component-candidates / selected-region 產物

---

## 4. shape.gear（齒輪輪廓）

### 算子資訊

- **op**: `shape.gear`
- **version**: 1
- **title**: 齒輪輪廓
- **parameters**:
  - `expectedTeeth` — integer: [3,1000], optional（**not-supplied**，僅來自使用者規格）
  - `sampleCount` — integer: [120,4096], optional（**data-derived**）
  - `smoothingWindow` — integer: [3,683], optional（**data-derived**）
  - `minProminence` — number: (0,1000000), optional（**data-derived**）
  - `minPeakDistance` — number: (0,1366), optional（**data-derived**）
- **evidenceArtifacts**: 5 個（feature-evidence, feature-curves, feature-points, feature-circles, feature-lines）
- **evidenceGates**: 17 個（gear.* gates，包含 complete_boundary / repetition / minimum_peaks / parameter_count_agreement 等）
- **parameterOrigins**:
  - `expectedTeeth` — whenOmitted: 'not-supplied'
  - 其餘 4 個 — whenOmitted: 'data-derived'

### 示例 justification

```json
{
  "tool": {
    "reason": "本案需要齒輪齒峰計數與穩定性分析；shape.gear 在極徑曲線上找峰，期望齒數只來自使用者明確提供的規格，不從像素反推，避免靜默補全缺齒。",
    "expectedEvidence": [
      {"kind": "artifact", "type": "evidence", "id": "feature-evidence"},
      {"kind": "artifact", "type": "curves", "id": "feature-curves"},
      {"kind": "artifact", "type": "points", "id": "feature-points"}
    ]
  },
  "parameters": [
    {
      "name": "expectedTeeth",
      "source": "not-supplied",
      "reason": "本案無明確齒數規格（使用者未提供）；實際齒峰數將保存為 MEASURED，無法判定缺齒，只能報告觀察值。",
      "verification": {"kind": "artifact", "type": "evidence", "id": "feature-evidence"}
    },
    {
      "name": "sampleCount",
      "source": "data-derived",
      "reason": "從輪廓採樣點數與圓周推導採樣密度；公式為 max(120, min(輪廓長度, 4096))，見 evidence，非優化值。",
      "verification": {"kind": "artifact", "type": "evidence", "id": "feature-evidence"}
    },
    {
      "name": "smoothingWindow",
      "source": "data-derived",
      "reason": "從採樣間隔推導平滑視窗（奇數）；抑制噪聲但保留齒峰，公式見 evidence，未針對本案優化。",
      "verification": {"kind": "artifact", "type": "curves", "id": "feature-curves"}
    },
    {
      "name": "minProminence",
      "source": "data-derived",
      "reason": "從徑向範圍推導最小顯著性；過濾碎峰但保留真齒，公式為 radialRange * 0.15，見 evidence，未優化。",
      "verification": {"kind": "artifact", "type": "curves", "id": "feature-curves"}
    },
    {
      "name": "minPeakDistance",
      "source": "data-derived",
      "reason": "從期望齒距推導最小峰間距（防止同一齒雙峰）；公式為 sampleCount / (expectedTeeth * 2)，無 expectedTeeth 時使用保守值，見 evidence。",
      "verification": {"kind": "artifact", "type": "evidence", "id": "feature-evidence"}
    }
  ],
  "boundaries": [
    {
      "condition": "輪廓完整（360° 覆蓋，無缺口）",
      "check": {"kind": "gate", "id": "gear.complete_boundary"},
      "onFailure": "UNKNOWN"
    },
    {
      "condition": "極徑曲線平滑後可識別峰（重複性穩定）",
      "check": {"kind": "gate", "id": "gear.repetition"},
      "onFailure": "UNKNOWN"
    },
    {
      "condition": "實際峰數 >= 3（避免碎片被當齒輪）",
      "check": {"kind": "gate", "id": "gear.minimum_peaks"},
      "onFailure": "STOP"
    },
    {
      "condition": "參數推導一致（sampleCount/smoothingWindow/prominence/distance 公式有效）",
      "check": {"kind": "gate", "id": "gear.parameter_count_agreement"},
      "onFailure": "STOP"
    }
  ]
}
```

### 填寫說明

- **tool.reason**：說明為何需要齒輪分析（齒峰計數、穩定性），不只說「檢測齒輪」
- **parameters**：
  - `expectedTeeth` — source: `not-supplied`（無規格）或 `human-input`（使用者提供）
  - 其餘 4 個 — source: `data-derived`（公式推導，需說明公式）
- **boundaries**：可引用 17 個 gear.* gates，選 3-5 個關鍵 gate

---

## 5. geometry.annulus（圓環幾何）

### 算子資訊

- **op**: `geometry.annulus`
- **version**: 1
- **title**: 圓環幾何
- **parameters**:
  - `maxRelativeResidual` — number: (0,0.5), optional
  - `maxResidualPx` — number: (0,100000), optional
  - `minAngularCoverageDeg` — number: (0,360), optional
- **evidenceArtifacts**: 3 個（feature-evidence, feature-circles, feature-lines）
- **evidenceGates**: 9 個（annulus.* gates，包含 complete_boundary / outer.rms / inner.rms / inner_containment 等）

### 示例 justification

```json
{
  "tool": {
    "reason": "本案需要圓環外緣與內孔擬合；geometry.annulus 拟合内外圆，回报残差与覆盖度，不把任意封閉輪廓當圓，避免形狀誤判。",
    "expectedEvidence": [
      {"kind": "artifact", "type": "evidence", "id": "feature-evidence"},
      {"kind": "artifact", "type": "circles", "id": "feature-circles"}
    ]
  },
  "parameters": [
    {
      "name": "maxRelativeResidual",
      "source": "operator-default",
      "reason": "使用工程預設相對殘差門檻（未明確值則使用算子內部預設）；真實擬合誤差需實算後檢查，未針對本案優化。",
      "verification": {"kind": "gate", "id": "annulus.outer.rms"}
    },
    {
      "name": "maxResidualPx",
      "source": "operator-default",
      "reason": "使用工程預設絕對殘差門檻（像素）；擬合質量需實算驗證，未針對本案優化。",
      "verification": {"kind": "gate", "id": "annulus.inner.rms"}
    },
    {
      "name": "minAngularCoverageDeg",
      "source": "operator-default",
      "reason": "使用工程預設最小角度覆蓋（避免碎片被當圓）；未針對本案優化覆蓋度，實算後觀察實際覆蓋。",
      "verification": {"kind": "gate", "id": "annulus.outer.coverage"}
    }
  ],
  "boundaries": [
    {
      "condition": "外緣完整且內孔唯一（拓撲正確）",
      "check": {"kind": "gate", "id": "annulus.complete_boundary"},
      "onFailure": "UNKNOWN"
    },
    {
      "condition": "外圓擬合殘差 <= maxRelativeResidual（圓度合格）",
      "check": {"kind": "gate", "id": "annulus.outer.rms"},
      "onFailure": "UNKNOWN"
    },
    {
      "condition": "內圓擬合殘差 <= maxRelativeResidual（內孔圓度合格）",
      "check": {"kind": "gate", "id": "annulus.inner.rms"},
      "onFailure": "UNKNOWN"
    },
    {
      "condition": "內圓被外圓包含（內含關係成立，非偏心過大）",
      "check": {"kind": "gate", "id": "annulus.inner_containment"},
      "onFailure": "STOP"
    }
  ]
}
```

### 填寫說明

- **tool.reason**：說明為何需要圓環拟合（內外圓殘差、覆蓋度），不只說「檢測圓環」
- **parameters**：3 個參數全部 source: `operator-default`（工程預設，如實說明未優化）
- **boundaries**：可引用 9 個 annulus.* gates，選 3-4 個關鍵 gate

---

## 6. topology.holes（孔洞拓樸與位置）

### 算子資訊

- **op**: `topology.holes`
- **version**: 1
- **title**: 孔洞拓樸與位置
- **parameters**:
  - `expectedPositions` — array of {id, x, y, radius}, optional（**not-supplied**）
  - `positionTolerancePx` — number: (0,1000000), optional
  - `minHoleArea` — number: [0,16000000], optional
- **evidenceArtifacts**: 4 個（feature-evidence, feature-circles, feature-lines, feature-points）
- **evidenceGates**: 2 個（holes.complete_boundary / holes.expected_positions_resolved）
- **parameterOrigins**:
  - `expectedPositions` — whenOmitted: 'not-supplied'

### 示例 justification

```json
{
  "tool": {
    "reason": "本案需要孔洞計數與位置分析；topology.holes 枚舉封閉背景孔，有明確位置規格時才推論缺孔，無規格則只保留拓撲事實，不靜默猜測缺孔。",
    "expectedEvidence": [
      {"kind": "artifact", "type": "evidence", "id": "feature-evidence"},
      {"kind": "artifact", "type": "circles", "id": "feature-circles"}
    ]
  },
  "parameters": [
    {
      "name": "expectedPositions",
      "source": "not-supplied",
      "reason": "本案無明確孔位規格（使用者未提供）；實際孔數與位置將保存為 MEASURED，無法判定缺孔，只能報告觀察值。",
      "verification": {"kind": "artifact", "type": "evidence", "id": "feature-evidence"}
    },
    {
      "name": "positionTolerancePx",
      "source": "operator-default",
      "reason": "使用工程預設位置容差；只在有 expectedPositions 時才比對，未針對本案優化。",
      "verification": {"kind": "execution-status", "allowed": ["OK"]}
    },
    {
      "name": "minHoleArea",
      "source": "operator-default",
      "reason": "使用工程預設最小孔面積；過濾噪點但保留真孔，未針對本案優化。",
      "verification": {"kind": "artifact", "type": "evidence", "id": "feature-evidence"}
    }
  ],
  "boundaries": [
    {
      "condition": "外輪廓完整（孔是封閉內部，非邊界缺口）",
      "check": {"kind": "gate", "id": "holes.complete_boundary"},
      "onFailure": "UNKNOWN"
    },
    {
      "condition": "expectedPositions 規格已解析（有規格時才檢查）",
      "check": {"kind": "gate", "id": "holes.expected_positions_resolved"},
      "onFailure": "UNKNOWN"
    },
    {
      "condition": "實際孔數 > 0 或無孔但無 expectedPositions（拓撲有效）",
      "check": {"kind": "artifact", "type": "evidence", "id": "feature-evidence"},
      "onFailure": "UNKNOWN"
    }
  ]
}
```

### 填寫說明

- **tool.reason**：說明孔洞分析目的（計數、位置），不只說「檢測孔洞」
- **parameters**：
  - `expectedPositions` — source: `not-supplied`（無規格）或 `human-input`（使用者提供）
  - 其餘 2 個 — source: `operator-default`（工程預設）
- **boundaries**：可引用 2 個 holes.* gates + feature-evidence 產物

---

## 7. rules.evaluate（規則判定）

### 算子資訊

- **op**: `rules.evaluate`
- **version**: 1
- **title**: 規則判定
- **parameters**:
  - `rules` — array of {id, measurement, min, max, equals, unit}, default: []
- **evidenceArtifacts**: 1 個（rule-evaluation）

### 示例 justification

```json
{
  "tool": {
    "reason": "本案需要規則判定（PASS/FAIL/UNKNOWN）；rules.evaluate 將量測值對照規格輸出判定結果，缺規格時保留 SPEC_MISSING，不靜默補全規格。",
    "expectedEvidence": [
      {"kind": "artifact", "type": "evidence", "id": "rule-evaluation"}
    ]
  },
  "parameters": [
    {
      "name": "rules",
      "source": "agent-proposal",
      "reason": "本案有 N 條規格（或 [] 表示無規格）；規格只能來自使用者明確提供，不從樣本答案反推，避免過擬合。",
      "verification": {"kind": "artifact", "type": "evidence", "id": "rule-evaluation"}
    }
  ],
  "boundaries": [
    {
      "condition": "上游 analysis 有效（非 FAILED，有量測值）",
      "check": {"kind": "execution-status", "allowed": ["OK"]},
      "onFailure": "UNKNOWN"
    },
    {
      "condition": "規格與實際量測欄位匹配（無未知 measurement）",
      "check": {"kind": "artifact", "type": "evidence", "id": "rule-evaluation"},
      "onFailure": "UNKNOWN"
    }
  ]
}
```

### 填寫說明

- **tool.reason**：說明判定需求（規格對照），不只說「需要判定」
- **parameters**：
  - `rules` — source: `agent-proposal`（Agent 建立）或 `human-input`（使用者提供）
  - 如果 rules 來自使用者明確提供，使用 `human-input`
- **boundaries**：引用 execution-status / rule-evaluation 產物

---

## 填寫紀律總結

### tool.reason（案例具體性）

- ❌ **不要只複述定義**：「需要灰階」、「需要分割」、「檢測齒輪」
- ✅ **要說明本案適用假設**：「本案背景均勻」、「本案期望唯一候選」、「本案無明確齒數規格」

### parameters.source（五枚舉）

- `agent-proposal` — Agent 建立的顯式數值
- `human-input` — 使用者提供的規格
- `operator-default` — 工程預設（要如實寫「未優化」）
- `data-derived` — 資料推導（要寫公式或推導依據）
- `not-supplied` — 未提供（要說明為何不需要）

### boundaries（前提條件與失敗處置）

- `condition` — 具體可檢查的前提（不要只寫「穩定可靠」）
- `check` — 引用 artifact / gate / execution-status
- `onFailure` — `STOP` / `UNKNOWN` / `REQUEST_HUMAN`

---

## 參考文件

- `desktop/src/pipeline-registry.js` — 算子註冊表（OPERATOR_REGISTRY）
- `desktop/src/pipeline-evidence-contract.js` — 三項依據驗證邏輯
- `desktop/src/algorithm-run-view.js` — 面板三項顯示（sectionNames）
- `desktop/src/agent-contract.js` — systemPrompt 紀律（並入後本體文本）
- `desktop/CODEX-PI-PANEL-JUSTIFICATION-REPORT.md` — 第三刀評估報告

---

**文件版本**：v1.0  
**更新時間**：2026-10-28
