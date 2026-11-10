# Mission（God 下达 — 深度贯彻，冲）

从既有 AgentCV / CVagent session fork。工作根：`/Users/liangshiben/13-cv`。

## 核心要求（刚补充，必须遵守）
1. **两组 benchmark 并行**，用 **多个 subagent** 同时推进，提速、防陷入局部优化。
2. **禁止 mock / 合成假数据 / 假指标**。只用真实下载的公开图集与真实 GT。
3. 平台缺批量验证就边测边改（含 piagent / CV skill / plugin），改完继续真跑。

## 两套图集（并行，不要串成一条长队）
A. **DeepPCB** https://github.com/tangsanli5201/DeepPCB → `/Users/liangshiben/13-cv/benchmarks/DeepPCB`
B. **VisA PCB1（不够加 PCB2）** 数据 https://amazon-visual-anomaly.s3.us-west-2.amazonaws.com/VisA_20220922.tar （CC BY 4.0）→ `/Users/liangshiben/13-cv/benchmarks/VisA`（可只解 PCB 子集）

## 并行分工建议
- Subagent-A：DeepPCB 下载+harness+端到端传统管线（对齐/差分/形态学/轮廓/bbox IoU）+ 暴露平台缺口
- Subagent-B：VisA-PCB 下载/抽取+掩膜评分管线+图级 OK/NG + 平台缺口
- Subagent-C（你或第三人）：合入平台批量/piagent/skill 修复，供 A/B 持续重跑
主 agent 协调，禁止等 A 做完再开 B。

## 评分与证据
- DeepPCB：真实 bbox IoU / 检出率；VisA-PCB：真实像素 IoU 或 F1 + 图级准确率
- 证据：图>数字>文字；失败样例留可视化；公式与子集规模写清

## 交付 `13-cv/benchmarks/reports/`
REPORT.md + 指标 JSON/CSV + 可视化路径 + 一键复跑命令。诚实记录卡点。完成后中文短总结。

立刻：确认 piagent 入口 → 并行拉数 → 并行小子集真跑 → 改平台 → 扩量 → 出报告。冲！
