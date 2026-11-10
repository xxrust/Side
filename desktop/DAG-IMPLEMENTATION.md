# DAG 重新设计 — Hybrid 实现说明

> **分工**：以本机 Codex `codex/dag-v0.2` 为运行时底；吸收 Origin [PR #1](https://cursor.com/codebase/go-d/agentcv/pull/1) 的文档结构、reporter 命名与无界面 G 验收口径。  
> **本阶段优先级**：**交互体验优先**；算法 adapter 用合成夹具即可，不为精度扩 scope。

## 文件映射（Codex 名 ← 云端对照）

| 职责 | Hybrid / Codex | Origin PR #1（未并入并行运行时） |
|------|----------------|----------------------------------|
| 域模型 + 方案 B 闸 | `src/dag-model.js` + `src/dag-schema.js` | `src/dag-model.js` + `src/schema-gate.js` |
| 图执行 / OOB / blocked_by | `src/dag-executor.js` | `src/graph-executor.js` |
| Agent 操作面 | `src/agent-ops.js` | `src/agent-ops.js`（API 更窄） |
| 回归报告 | `src/regression-reporter.js`（hybrid 吸收） | `src/regression-reporter.js` |
| CLI | `scripts/agentcv.mjs`（含 `run-all`/`inspect` 别名） | `scripts/cli.js` |
| 默认 DAG UI | `src/dag-app.js` + `dag.css` | `src/dag-view.js`（仅 SVG 骨架） |
| Runtime 可替换 | `src/agent-runtime.js` | （未单独抽出） |
| 文档 | 本文 + `AGENT-OPS.md` | `DAG-IMPLEMENTATION.md` |

**冲突处理**：不保留两套 executor/schema。命名以 Codex 为准（`dag-executor` / `dag-schema`）；云端 OOP `DagGraph`/`GraphExecutor` 类不并入，以免双路径写盘。

## 方案 B（锁定）

1. `shares` = 共享实例扇出  
2. 凡 `shares` 必须有同源 `requires`  
3. `blocked_by` **仅**沿 `requires`  
4. 裸 `shares` → `invalid_proposal`，0 写入  

## Agent 原生（G1–G3）

- **G1** 无窗口：建图 → 闸（含裸 shares）→ 跑回归 → 读 `blocked_by`  
- **G2** 报告落盘 JSON/HTML/SVG；`validation.option_b_compliant` 可机读  
- **G3** UI 只消费同一 `AgentOps`（含 `setWorkspace` 意图），无旁路写盘  

```bash
cd desktop
npm run agentcv -- init --project /tmp/demo.agentcv.json
npm run agentcv -- create --project /tmp/demo.agentcv.json --input qa/fixtures/dag-v02/proposal.json
npm run agentcv -- run-all --project /tmp/demo.agentcv.json --adapter qa/fixtures/dag-v02/synthetic-adapter.mjs --out /tmp/out
npm run agentcv -- inspect --project /tmp/demo.agentcv.json
```

## 交互范围（本切片）

**必做骨架**：默认进 DAG；同板 ≥2 图/PDF；幽灵 ROI；意图（标记/测距钉/气泡草稿）可走 `workspace` API。  
**标 v0.3**：原位气泡完整人核验打磨、真实测距标定。  
**不做**：深度 CV 算法优化、Electron。

## 测试

```bash
cd desktop
npm test
node --test qa/dag-v02.test.mjs qa/agent-ops.test.mjs qa/dag-ui.test.mjs qa/headless-g123.test.mjs
```
