# Agent 原生操作面（用户锁，2026-10-27）

产品是 **Agent 原生**：实质操作不依赖图形界面、不需要点鼠标。
界面只是可选视图；Agent / CLI / 自动化必须以同一套 API 完成工作。

## 必须可无界面完成（验收）
1. 建/改/删图节点与边（含方案 B 的 schema 闸）
2. 接受/拒绝提案（invalid_proposal → 0 写入）
3. 触发单节点 / 全量回归执行
4. 拿到结构化结果（JSON）+ **结果图表/报告文件**（如 PNG/SVG/HTML/CSV），无需打开桌面窗口
5. 查询 runs / blocked_by / stale / oob 状态

## 交付形态（本轮第一刀就要有骨架）
- `AgentOps`（或等价）可编程 API：上述操作均为函数/命令，不经过 UI 事件
- CLI 入口（如 `agentcv run --all`、`agentcv report`）调用同一 API
- UI 只是该 API 的消费者；禁止「只有点按钮才能跑」的路径
- 回归产物落到磁盘（例如 `runs/<id>/report.{json,html,png}`），Agent 读文件即可验收

## 非目标澄清
不是「完全没有 UI」；是 **UI 非必需**。人可看图，Agent 必须能不点鼠标做完验证闭环。
