# Agent 原生操作面（硬约束，与 UI 同级）

产品是 **Agent-native**：没有界面时，Agent 也必须能完整操作。UI 只是同 API 的一种客户端。

## 必须暴露的程序化 API（本轮就要有，至少 TypeScript / JS 模块 + 可单测）

对图与执行，禁止「只能点 UI」：

1. **图读写**：load / save project；list/get nodes & edges；validate（含方案 B 闸）
2. **图编辑**：add/remove/revise node；propose/accept/reject edges（含 shares 必须同源 requires）；set ROI / assets / boards
3. **执行**：run graph / run node；读 runs、blocked_by、stale；regression 快照
4. **Agent 闭环**：`AgentRuntime.propose` → **不直接写图**；经 `applyProposal` / `reject*` 由宿主确认后写入
5. **观测**：订阅或查询 graph/run 状态变更（最小可用：同步 get + 事件回调即可）

## 验收

- 纯脚本（无窗口）能：建图 → 加 Locate/Offset/Defect → 连 requires/shares(B) → 跑执行器 → 读结果
- UI 只调用上述 API，不另开一套旁路写盘
- 文档：在 `CODEX-REPORT.md` 列 API 表（函数名 / 输入输出 / 对应 PRD 验收 ID）

## 非目标

不绑死具体 Agent 供应商；不要求本轮做完完整 RPC 服务，但模块边界要留好，后续可挂 HTTP/IPC。
