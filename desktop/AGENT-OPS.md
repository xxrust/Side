# AgentOps v0.2

UI、脚本共用 `src/agent-ops.js` 的 `AgentOps`；无窗口入口：

```sh
npm run agentcv -- init --project /tmp/demo.agentcv.json
npm run agentcv -- create --project /tmp/demo.agentcv.json --input qa/fixtures/dag-v02/proposal.json
npm run agentcv -- run --all --project /tmp/demo.agentcv.json --adapter qa/fixtures/dag-v02/synthetic-adapter.mjs --out /tmp/agentcv-results
npm run agentcv -- run --node defect --project /tmp/demo.agentcv.json --adapter qa/fixtures/dag-v02/synthetic-adapter.mjs --out /tmp/agentcv-one
npm run agentcv -- status --project /tmp/demo.agentcv.json
npm run agentcv -- report --project /tmp/demo.agentcv.json --out /tmp/agentcv-report
```

`runs.json`、`report.html`、`report.svg` 均落盘。示例 adapter 只验证执行契约，输出 `synthetic-fixture`，不做图像检测，不判工业合格。未提供 adapter 时节点明确 failed，下游 blocked。实际算法模块默认导出 `{Locate,Offset,Defect}` 异步处理函数，输入 `{node,inputs}`，输出 `{status,metrics,evidence,conformance}`；执行器不传已知标签。

- `create/accept --input proposal.json`：原子接受节点/边包；方案 B 闸拒绝时退出码 2，项目文件不写。
- `revise --node ID --input patch.json`：保留 ID，升版并沿 requires 失效下游。
- `revise --edge ID --input patch.json`：原子修改边，重新过完整图校验，结果标 stale。
- `remove --input removal.json`：`{"nodes":["id"],"edges":["edgeId"]}`；删除节点同时移除关联边；删除 requires 留下裸 shares 会拒绝，需同包删除。
- `reject --input proposal.json [--edge ID]`：记录否决；删除提案中的 requires 时同时去掉配对 shares，正式图不变。
- `workspace --input workspace.json`：设置 `{assets,boards}`，包含图片/PDF、ROI 选择、视野、气泡、关系钉。
- `validate --input proposal.json`：查询字段路径错误；`status` 查询全部 runs/blocked_by/stale/oob。

API 不依赖 DOM、Tauri 或 Agent 提供方，可后续挂 IPC/HTTP。`snapshot/list/get/status` 返回副本，`subscribe` 提供状态回调；`propose(runtime,intent)` 仅生成待审包，须显式 `accept` 才写入。

默认页面是 DAG。旧壳仅作为 `qa/fixtures/legacy-shell.html` 测试夹具保留，旧算法与旧 UI 测试仍运行，不构成产品路由。
