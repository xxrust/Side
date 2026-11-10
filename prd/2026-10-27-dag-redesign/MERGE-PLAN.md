# MERGE-PLAN · DAG v0.2 Hybrid

日期：2026-10-27（Asia/Shanghai）  
分支：`merge/dag-v0.2-hybrid`（自 Codex `e76b9a4` + PRD G1–G3 文案 `17aec27`；tip 以 `git rev-parse merge/dag-v0.2-hybrid` 为准）  
对照：Origin [PR #1](https://cursor.com/codebase/go-d/agentcv/pull/1) · `cursor/dag-redesign-first-slice-038e` @ `3809d38`  
**评审口径（用户锁）**：**交互体验优先**；深度算法优化本阶段不重要。算法 adapter 合成夹具即可。

> **合入 main / push：本文件不授权。** Hybrid 仅本地准备，待用户确认后再合。

---

## A. 文件级对照

| 职责 | Codex（底） | 云端 PR #1 | 谁更完整 | Hybrid 决策 |
|------|-------------|------------|----------|-------------|
| Schema / 方案 B 闸 | `dag-schema.js` + `dag-model.validateGraph` | `schema-gate.js` | **Codex**（字段路径、原子拒收、测更全） | 保留 Codex；不并入 OOP gate |
| 执行器 / OOB / blocked_by | `dag-executor.js` | `graph-executor.js` | **Codex**（已有 B3/B4/OOB/stale 测） | 保留命名 `dag-executor`；不双轨 |
| AgentOps | create/revise/remove/workspace/subscribe/CLI | accept/runAll/exportRuns | **Codex** API 面更宽 | 保留 Codex；吸收 reporter 结构 |
| 报告 | 内联 `buildReport`（薄） | `regression-reporter.js`（summary + option_b） | **云端命名/结构更清晰** | **已吸收**：抽出 `regression-reporter.js`，JSON 增 `summary`/`validation` |
| CLI | `scripts/agentcv.mjs` + `npm run agentcv` | `scripts/cli.js`（run-all/inspect/validate） | **Codex** 命令更全 | 保留 agentcv；**已加** `run-all`/`inspect` 别名 |
| 默认 DAG UI / 同板 / 幽灵 ROI | `dag-app.js` + DOM 测 | `dag-view.js` SVG 骨架 | **Codex**（交互骨架完整） | 保留 Codex UI |
| 文档 | `AGENT-OPS.md` + CODEX-REPORT | `DAG-IMPLEMENTATION.md` | **云端文档结构清晰** | **已吸收**改写为 Hybrid 版 `desktop/DAG-IMPLEMENTATION.md` |
| 无界面 G 验收 | agent-ops CLI 测 | headless-validation | 互补 | **已加** `qa/headless-g123.test.mjs` |
| 旧 model.js 集成 | 未改旧 Project（新 schema `agentcv-dag-0.2`） | 改 `model.js` → 0.9 | Codex 更干净隔离 | **不**并入云端 model.js 补丁（避免双 schema） |

命名冲突：`dag-executor` vs `graph-executor`、`dag-schema` vs `schema-gate` → **一律 Codex 名**。

---

## B. 合并策略（已执行）

1. 以 Codex 为唯一运行时底（413 测基线 + 交互骨架）。  
2. 手工移植云端优点，**不** `git merge` 无关历史。  
3. 原则不丢：方案 B、AgentOps 无界面、G1–G3、无 Electron。  
4. **交互优先**：评审先看默认 DAG、同板多图/幽灵 ROI、操作是否都走 AgentOps、人能否不靠聊天完成核验骨架。  
5. 算法：合成 adapter 即可；不为精度扩 scope。

---

## C. 已合并项

- [x] `desktop/src/regression-reporter.js`（summary + `validation.option_b_compliant` + HTML 方案 B 区）  
- [x] `agent-ops.js` 改用 reporter；对外仍 `export buildReport`  
- [x] CLI 别名 `run-all` → `run --all`，`inspect` → `status`  
- [x] `qa/headless-g123.test.mjs`（G1 闸+blocked_by / G2 落盘机读 / G3 workspace 同模型）  
- [x] `desktop/DAG-IMPLEMENTATION.md`（映射表 + 交互范围）  
- [x] 本 `MERGE-PLAN.md`

## D. 未合并项（有意不做 / 留给用户审）

| 项 | 原因 |
|----|------|
| 云端 `DagGraph` / `GraphExecutor` / `schema-gate` 整文件 | 与 Codex 功能重叠；双轨会破坏 G3「无旁路」 |
| 云端对旧 `model.js` 的 0.9 补丁 | Codex 用独立 `agentcv-dag-0.2`；合并会搅旧壳 |
| 云端 `dag-view.js` | Codex `dag-app.js` 已含默认入口 + 同板/幽灵；view 仅 SVG 草稿 |
| 旧 CV 算法全量 adapter | **本阶段不扩**；合成夹具足够验契约 |
| 原位气泡/测距完整打磨 | 已标 **v0.3**；骨架（草稿/钉/workspace API）在 Codex |
| merge main / push | **等用户确认** |

---

## E. 交互优缺点（评审优先读）

> **范围钉死（产品/Canvas/用户口径）**  
> - **本轮交互必过**：① 冷启动无深链默认进 DAG（`index.html` → `dag-app.js`）；② 同板 ≥2 图/资产 + 幽灵 ROI 骨架；③ 点幽灵可跳回共享源；④ AgentOps/CLI 无鼠标闭环（G1–G3）。  
> - **不进本轮必过**：原位气泡、测距/关系钉的完整人核验 —— **骨架可选展示；完整人核验 = v0.3**。  
> - **勿误收 Fig2**：不得因气泡/测距做了半截就当 Fig2 全过；也不得因未完成气泡/测距扣本轮交互分。

### 本轮交互必过（可验收）

| 点 | 说明 | 证据 |
|----|------|------|
| 默认 DAG 入口 | 冷启动无深链：`index.html` → `dag-app.js`；非七步壳 | 见下「冷启动核查」；`qa/dag-ui.test.mjs`（含 **A1 负向**：无 `1 › 2` / `.pipeline-workbench` / 七步向导入口） |
| 同板多图 / PDF | ≥2 图 + PDF 同板 | 同上 DOM 测 |
| 幽灵 ROI + 跳回共享源 | 下游只读幽灵；源可编唯一 ROI；点幽灵/「打开共享源」跳回 | `dag-app.js` 幽灵 overlay + 打开按钮；dag-ui |
| AgentOps 无鼠标 | UI create/run/revise/workspace 与 CLI 同面；无旁路写盘 | `AGENT-OPS.md`、G1–G3 |
| 审提议不靠聊天 | 提议审核条 / 否决边；无 chat 面板 | dag-ui 断言无 `[class*=chat]` |

### 骨架可选展示（≠ 本轮已过 / ≠ Fig2 全过）

| 点 | 本轮状态 | 完整打磨 |
|----|----------|----------|
| 气泡草稿 / 确认 | 可选展示（工具条可开草稿气泡） | **v0.3** 完整人核验 |
| 距离 / 关系钉 | 可选展示（人工 px 钉） | **v0.3** 标定与钉边 |

### 缺点 / 风险（请用户重点看）

| 点 | 说明 | 建议 |
|----|------|------|
| 气泡/测距仍是骨架 | 确认后无在线回答；钉为人工 px，未标定 | **不挡本轮**；完整交互 → v0.3；勿当 Fig2 全过 |
| 画板非无限自由排布 | 固定网格摆资产 + 平移缩放 | 若强依赖 Miro 感，下轮再开 |
| 报告 HTML 刚加方案 B 区 | 视觉偏简；Agent 以 JSON `validation` 为准 | 交互评审不必卡 HTML 美观 |
| **旧七步仅夹具 — 无产品入口** | 旧壳/`app.js`/`plan-view`/`agent-contract` 七步文案仍在仓库；**产品 UI 不得有「返回七步 / 线性向导」入口**（夹具 `qa/fixtures/legacy-shell.html` 除外） | 冷启动核查已证入口切 DAG；合入前勿再挂回七步导航 |
| 算法诚实失败 | 无 adapter 即 failed/blocked | **符合本阶段**；勿据此否决交互 |

### 冷启动核查（2026-10-27 · Mac `~/13-cv` · `merge/dag-v0.2-hybrid`）

| 检查项 | 结果 |
|--------|------|
| `desktop/index.html` 默认入口 | **过**：唯一 script 为 `/src/dag-app.js`；title「AgentCV · 依赖画板」 |
| Tauri/Vite 产品入口 | **过**：`tauri.conf.json` `devUrl` → Vite → 上述 `index.html`；无第二产品 HTML 入口 |
| 产品 UI「返回七步/线性向导」 | **无**：`dag-app.js` / `dag-*.js` / `agent-ops.js` 无「七步」「返回七」「线性向导」「go_to_step」按钮或路由 |
| 列表切换 ≠ 回七步 | `dag-app` 仅有「列表视图 / 切回 DAG」拓扑折叠，不是线性向导 |
| 旧七步残留位置 | `src/app.js`、`plan-view.js`、`agent-contract.js`（含 `go_to_step`）、`qa/fixtures/legacy-shell.html` —— **未挂到产品入口**；仅夹具/遗留模块 |
| 幽灵跳回共享源 | 幽灵 overlay 可点选共享源对象；工作区有「打开 {共享源标题}」将 `selected` 切回共享定位节点 |

| **A1 负向已加**（`qa/dag-ui.test.mjs`） | **已加**：加载默认 `index`/`dag-app` 后断言 DOM 无 `.pipeline-workbench`、无 `/1\s*[›>]\s*2/` 线性步骤条、无「七步/返回七步/线性向导」文案与入口按钮；旧壳仍允许仅在测夹具 |

结论：冷启动默认 DAG；产品面无回七步入口；旧七步仅夹具/遗留代码，验收须保持「无产品导航回七步」；**A1 负向已加**。

---

## F. 测试结果

（提交前跑 `cd desktop && npm test`；结果填入下方。）

```
cd desktop && npm test
ℹ tests 416
ℹ pass 416
ℹ fail 0
duration_ms ~17s
（基线 Codex 413 + headless-g123 3；regression-reporter 浏览器安全后 dag-ui 绿）
```

专项：`node --test qa/dag-v02.test.mjs qa/agent-ops.test.mjs qa/dag-ui.test.mjs qa/headless-g123.test.mjs`

---

## G. 建议用户审哪些点

1. **交互**：默认进 DAG？同板多图+幽灵 ROI 是否够本轮骨架？  
2. **AgentOps 唯一写路径**：是否接受「UI = 可选消费者」+ CLI 别名？  
3. **报告**：JSON 新增 `summary`/`validation` 是否破坏你已有脚本？（`schema` 仍为 `agentcv-regression-0.2`，`runs` 保留）  
4. **未合并 OOP/model.js**：是否同意不引入双轨？  
5. **合入时机**：确认后再 merge `merge/dag-v0.2-hybrid` → `main`（本分支未 push）。

---

## H. 还缺什么

- 用户确认后的 **merge main**（本任务刻意不做）  
- v0.3：气泡完整核验、测距标定、旧算法 adapter（非本切片）  
- 主 PRD 正文 G1–G3 落盘若尚未 commit，与 hybrid 实现分开审  
