# AgentCV 观感基线 v1

浅色无限板视觉规范（对照 tldraw / Miro 干净度）。文件：`visual-baseline-v1.html` / `.png`。

## Tokens

| Token | 值 | 用途 |
|-------|-----|------|
| `--bg-board` | `#fafbfc` + 18px 点阵 `#d1d5db` | 无限板底 |
| `--bg-chrome` | `#ffffff` | 卡片 / 工具条 / 抽屉 |
| `--border` | `#e5e7eb` / `#d1d5db` | 轻边 |
| `--text` | `#111827` / `#6b7280` | 主 / 次文案 |
| `--accent-roi` | `#2563eb` 实线 + 8% 填充 | 可编辑共享 ROI |
| `--accent-ghost` | `#64748b` 虚线 | 下游幽灵 ROI |
| `--accent-measure` | `#0d9488` | 测距线 + px 读数 |
| `--tool-size` | 工具条宽 52px；图标 18px；标签 10px | 左浮工具条 |
| `--toolbar-radius` | 12px | 浮层圆角 |
| `--shadow` | `0 2–4px / 6–14%` | 轻投影，忌重灰 |

## 本轮（v1）范围

**In**
- 浅色无限板（近白 + 软点阵），非灰暗空板 / 卡片堆
- 同板 ≥2 检测图；实线可编辑 ROI + 虚线幽灵 ROI
- 工具条入口可见：选 / **线 / 距 / 圆**（可先只出几何 + px）
- 图上测距读数为主反馈；JSON 收进底部次级抽屉
- 迷你 DAG 仅 Locate→Defect，意图条「OK/划痕」；**Offset = 0**

**Out（勿当本轮完成）**
- 原位气泡完整人核验打磨、测距钉边入库、自由无限布拖拽引擎
- 真实 OpenCV / DL 精度与真实测试图替换（后续对接）
- 橱窗式三节点（Locate→Offset→Defect）默认 demo

## 硬原则

契约绿 ≠ 画板交付。首屏必须以图像为主画布；无意图节点不得进默认 demo。
