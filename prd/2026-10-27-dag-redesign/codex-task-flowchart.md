# AgentCV 流程图拷问修复（Codex）

工作目录：解压后的 `desktop/`（来自 PR #2 WIP `c05ddc1`，已含 topo-order / chain-executor / 半成品流程图）。

## 已锁硬约束（禁违反）
1. 主战场=画板面板；流程图挂**当前意图浮岛/同级画板容器**，禁止 `document.body` 固定 `top:400px` 浮层。
2. 流程图唯一来源：`exportProcessFlow` / `computeTopologicalOrder`（`src/topo-order.js`）与 chain-executor/run **同一导出**；`renderProcessFlow` 必须调用它，禁直接用 chainResults 当序。
3. 两图分离：依赖图边「需要」；流程图边「先跑→ / 失败停」。意图不进序；定位非必现。
4. 面层只显非空 `displayName`；禁裸 kind/函数名当主标签；禁 `displayName || kind` 当主路径（缺 displayName 应不渲染/断言失败）。
5. run 订阅：pass/fail/blocked 上色；fail 红 + 下游灰。
6. 点开下钻：同 run/topo 导出的详情面板（禁 `alert`）。
7. 暖纸底 `#f7f5f2`；禁蓝 UI；禁 Offset 文案。
8. 交前自证：测断言 流程图序≡run/topo 序；截两张图（浮岛流程中文名+先跑边；Locate fail→红停+下游灰）。

## 本轮必改
- 修 `renderProcessFlow`：挂画板/浮岛；调用 `exportProcessFlow`；去掉 alert；fail/blocked 上色。
- 补/修测试与截图脚本（能无 UI 跑断言的保留）。
- 写 `CODEX-FLOW-REPORT.md`：改动文件、导出入口、拷问 A+B 逐条过/不过+证据。不过关别声称完成。

不要另起工程壳；不要重做 OpenCV；不要问要不要做。
