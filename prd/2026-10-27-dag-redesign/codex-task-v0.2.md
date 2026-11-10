# AgentCV v0.2 实现任务（Codex 主笔）

在现有仓库 `/Users/liangshiben/13-cv/desktop` 上改造（不要另起空仓）。先读：
- `../prd/2026-10-27-dag-redesign/AgentCV-PRD-v0.2.md`（关键锁：**方案 B**）
- `../prd/2026-10-27-dag-redesign/agent-api-addendum.md`（**Agent 原生 / 无鼠标操作面** —— 刚锁）

## 已锁契约（勿重开）
- 默认 UI = 依赖 DAG；线性七步/左侧步骤条 = 废案。
- 边：`requires` 硬前提；`shares` = 共享实例扇出（删「软」）。
- **方案 B**：凡 `shares` 必须同时有同源 `requires`；裸 `shares` → schema 闸拒收；`blocked_by` **只沿 requires**。
- 节点 kind 仅 Locate / Offset / Defect；三件套 rationale/params/applicability；invalid_proposal → 0 写入。
- 画板：同板≥2 图+PDF、可编辑 ROI=1、下游幽灵 ROI、原位气泡、测距/关系钉；核心流可不打开右侧对话。
- 壳：Tauri only；AgentRuntime 可替换（现状 pi+Codex 只写在「现状」）。
- **Agent 原生**：实质操作不靠点鼠标。全量测试、出结果图/报告，必须能通过 API/CLI 在无界面下完成；UI 只是同一 API 的消费者。

## 本轮交付（可合并的第一刀）
若分支上已有 `dag-model` / `dag-executor` / `agent-runtime` 草稿，**接着改，不要推倒重来**。
1. 图模型 + 持久化 + schema 闸 + 本地执行器（含 B3/B7/S5 单测）
2. **AgentOps API + CLI 骨架**：create/revise/reject、run one/all、导出 runs JSON + 结果报告/图表文件到磁盘；禁止「只能点按钮才跑」
3. 默认入口改为 DAG（拆掉七步默认壳）
4. 节点工作区骨架：同板多图 + 幽灵 ROI；气泡/测距可最小可用，但不要只剩聊天主路径
5. 提交到本地 git（基线 a12b802）；分支 `codex/dag-v0.2`；commit 对照 PRD + agent-api-addendum 验收行

## 非目标
不重写全部 CV 算法；不换 Agent 供应商；不引入 Electron；不要求本轮做完精美图表库（有结构化报告 + 至少一种可落盘图/表即可）。

写完后留下 `prd/2026-10-27-dag-redesign/CODEX-REPORT.md`：改了什么、测过什么、未做项、对照验收 ID（含 AgentOps 无界面路径）。
