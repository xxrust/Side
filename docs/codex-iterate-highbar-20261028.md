# Mission（God 下达 — 高目标迭代，必须冲到可部署门槛）

工作根：`/Users/liangshiben/13-cv`。这是对上一轮 **真实基线** 的强制迭代，不是重做基线。

## 上一轮事实（已完成，勿重造假成绩）
- 报告：`benchmarks/reports/REPORT.md`
- DeepPCB（480 对，IoU>0.5，class-agnostic）：F1 **49.50%**
- VisA PCB1（200 张，像素 micro）：F1 **3.68%**，图级准确率 **55%**
- 平台批量桥接、盲测、复现已通；算法质量未达部署。

## 本轮硬目标（验收门槛 — 达不到就继续迭代，禁止提前收工）
必须把算法质量冲到下列门槛；**未达门槛不得宣称完成**，只能在耗尽合理迭代轮次后写「硬天花板 + 证据」。

### DeepPCB（class-agnostic bbox）
- 主指标：held-out **480** 对上 IoU>0.5 的 F1 **≥ 0.90**
- 辅：IoU>0.33 F1 **≥ 0.92**；FP/图可控（写清预算）
- 探索集（先前看过的 20 张）与校准/验证仍隔离；**禁止**用 final 480 调参后再报同一 480

### VisA PCB1（不够可扩 PCB2，但主验收仍 PCB1）
- 图级 OK/NG：**accuracy ≥ 0.95** 且异常召回 **≥ 0.90**（UNKNOWN 计入错误）
- 像素 micro F1：**≥ 0.40**（冲刺目标 ≥ 0.55）
- 配准拒绝率压到 **≤ 2%**，且拒绝策略可解释

### 平台 / AgentCV / piagent
- 所有最终分数必须经平台 `agentcv-benchmark-batch` 真跑可复现
- 继续禁止 mock / 合成缺陷 / 假 GT / 假分数
- 并行多 subagent；边改边跑

## 迭代协议（强制）
1. **多轮闭环**：失败归因 → 改方法/参数/特征 → 仅在开发/校准集验证 → 再盲测 held-out → 写 delta
2. 至少尝试并留下真对比的路线（不限于）：更稳配准（局部/分块/多模板）、光照归一、区域屏蔽（丝印/边缘）、多尺度、自适应阈值、形态学/连通域后处理、模板差分 vs 特征异常、级联（粗检→精检）
3. 每轮保存：配置 hash、指标 JSON、失败可视化 top-N、相对上一轮的 ΔF1
4. **不得**为冲分污染 test；需要新验收集时从 train/unused 切，并写清
5. 传统 CV 优先；若证明传统硬天花板，可引入轻量非 DL 统计/经典 ML（如 PCA/OC-SVM on handcrafted），**仍禁止**深度网络权重伪造；若必须 DL 才能过线，先停下写证据再问，不要偷偷上

## 并行分工
- Subagent-A：DeepPCB 冲 F1≥0.90（多轮）
- Subagent-B：VisA 冲图级+像素门槛（多轮）
- Subagent-C：平台/skill/批量与复现护栏，服务 A/B 重跑
主 agent 协调，禁止等 A 完再开 B。模型用 **fast**（`/fast` 或 `-m fast`）。

## 交付（覆盖写到 `benchmarks/reports/`，保留上一轮子目录可归档为 `reports/baseline-20261028/` 若需要）
- `REPORT.md`：是否达标、每轮 Δ、最终公式与子集、失败样例
- metrics JSON/CSV、可视化、一键 `bash benchmarks/run_all.sh` 复跑
- 中文短总结：达标 / 未达标原因 / 下一步唯一建议

立刻开干：读上一轮 REPORT → 并行立项 → 多轮迭代直到门槛或硬天花板证据齐全。冲！
