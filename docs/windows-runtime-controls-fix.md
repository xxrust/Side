# Windows 节点性能、停止与主 Agent 询问修复（0.16.8）

2026-11-11，Windows 真实 Tauri / WebView2 桌面验证。源码分支：`integrate/unified-image-renderer`。

用户正在运行的程序来自 `viewport-build/target/release`，不包含上一轮主 Agent 询问修复。此次提供版本号明确的独立程序目录，并修正原迁移包的启动器，避免再次启动旧版。运行中的用户程序及原工程不强制退出或改写。

## 实现

- 运行器不再为了报告环境而加载 SciPy、Matplotlib、Torch 等当前节点未使用的库，也不在每次冷启动列举所有安装包。显式环境探测仍真实导入并核对完整环境；正常算法可自行导入任意库。未导入的模块标为 `importChecked: false`，不冒充可用性验证。
- 每次调用默认使用一个 OpenCV 工作线程，避免小图和高频基础操作占用所有核心。用户代码仍可自行设置线程数，下一节点恢复默认。增加真实环境加载、输入解码、算法及结果校验耗时；算法阶段包含其内部图像编码和产物保存，不能再次相加。
- 工具栏、图像源窗口和 Escape 统一取消当前检测；前台和后台方案均注册控制器。Escape 在捕获阶段生效，因此不被弹窗、输入框或画布吞掉。输入法组合及修饰键保留正常行为。
- 停止采用节点边界语义：等待正在运行的节点结束，保存已发生的事实，然后停止后续节点和工件。不会强行杀死当前 Python 节点。原生验证断言停止后只允许在途节点产生一个运行记录。
- Windows Python 和 Agent 后台子进程使用 `CREATE_NO_WINDOW`，防止弹出终端抢走停止键焦点。Windows 启动参数接入已有文档加载入口，支持新版启动器打开指定 `.agentcv` 工程。
- 询问功能沿用 `cd88f27` 的统一主 Agent 路由：节点、整个流程、局部标注和图像关系均引用到主输入框，不创建画布会话。

## 当前 Lid-Pkg 方案的独立性能副本

`desktop/analysis/lid-runtime/optimize.py` 只接受经 AST 核对的 round-5 函数，生成单独工程副本，不改写用户原工程，也不对任意用户算法隐式改写。

共同半径搜索由逐半径、逐角、逐采样偏移调用改为数组批处理，完整保留 51 个半径、四角、全部偏移、候选和分类阈值。坐标网格、半径分数、可见性、覆盖率、候选族和最终输出都做数值对照。

精确的 3609 ms 历史记录并非每次重启 Python：该次 resident 为热调用，歪斜节点最终因非有限坐标传入 `cv2.line` 而失败。其原因是缺少实测 pkg 边，仍继续建立姿态和搜索半径。优化副本在姿态输入无实测边时直接报告 `INSUFFICIENT_MEASURED_EDGES`；仍是执行故障，不计作合格或准确率。

交付副本 `E:/personal_project/mycv/Lid-Pkg-性能修复-0.16.8.agentcv` 保留原工程 33 张图片与历史，方案版本为 2。旧历史仍按原算法版本区分，新代码不会冒用旧结果。

## 原生验证与实测

所有 GUI 验证在独立 identifier `studio.agentcv.desktop.runtime.qa` 中运行。通过 CDP 操作的是原生 Tauri 窗口，执行经过真实 Tauri IPC、Rust 和本机 Python。未使用浏览器 fixture 推断 Python 性能。

证据根目录：`E:/personal_project/mycv/node-performance-diagnosis`。

| 验证 | 证据 | 结果 |
| --- | --- | --- |
| 工具栏按钮、输入框 Escape、弹窗按钮/键盘、图像源内部启动后的按钮/键盘 | `final-acceptance/native-runtime.json` | 六种情形均 CANCELLED，无后续节点或工件派发；两次完整成功执行各 3 节点 |
| 原方案与优化方案、相同成功原图的结果及图片 | `comparison-batch/comparison.json` | 全部结果值在 1e-10 相对容差内一致；三节点全部图片 SHA-256 完全一致 |
| 成功样本歪斜节点 | 同上 | 2985 ms → 1828 ms，约减少 39%；为一次同机 A/B，非所有样本的时限承诺 |
| 退化样本歪斜节点 | 同上 | 2657 ms → 609 ms，均报告故障；明确原因替代后期绘图崩溃 |
| 故障后下一节点冷启动 | `baseline/native-runtime.json`、`final2/native-runtime.json` | 未焊节点原 2609–2640 ms，运行器修复后 656–703 ms；不同轮次负载有差异 |
| 正常输出图及 RGB | `comparison-batch/comparison.json` | 三张 1280×1024 输出正常解码，RGB 实际采样正常 |
| 节点/流程/局部/关系四类引用 | `final-acceptance/native-runtime.json` | 主输入框可见、完整引用到达同一 main thread，无 canvas thread 或 reset |
| 实际 Agent 节点询问与后续流程询问 | `real-node-inquiry.json`、`real-followup-inquiry.json` | Agent 正确回答 scheme::objects / 歪斜与包含分析；后续回答 9 节点并记住上次节点，同一 sessionId、sessionReused=true |
| 启动参数打开独立交付工程 | `document-launch.json` | 0.16.8、方案版本 2、33 张原图全部可读取 |

实际 Agent 验证使用应用原有 Codex 连接，没有拦截传输或伪造回答；四类全面路由断言另外拦截发送端验证，明确与真实模型验证区分。

成功样本优化后仍需约 1.4–2.0 秒（最后完整回归范围），这是完整候选搜索与产物的实际时间，没有宣称达到毫秒级。停止也需要等待当前节点及记录保存完成。

## 回归与复现

```powershell
node --test qa/flow-execution-controls-regression.test.mjs qa/inspection-stop-shortcut.test.mjs qa/main-agent-inquiry.test.mjs qa/source-preview-order.test.mjs
python qa/cv-runtime-overhead.py
python qa/lid-runtime-equivalence.py
cargo test --locked resident_real_images_reuse_process_preserve_inputs_and_restart_after_fault -- --nocapture
```

前六项 JS 断言、一个运行器 Python 用例、三个几何/半径等价用例、Rust resident 的缓存/故障重启/崩溃/超时用例均通过。本机 Python 为 Miniconda Python 3.12.7。Rust 用例首次在过长 Windows 临时目录遇到路径长度限制，改用本工作区短临时目录后通过，未改产品逻辑绕过。

`qa/execution-timing-breakdown.test.mjs` 因缺少历史 `codex-audit-logs/20261031-decision-evidence/runtime-evidence.json` 无法运行，未计入通过。未运行整仓依赖历史资料的全套测试。

新增的原生探针均独立于成熟 `qa/native-desktop-execution.mjs`，没有修改其原验证行为。原生可重复命令见各脚本文件顶部和脚本参数，输入使用上述证据目录真实图像 fixture；QA identifier 防护用于拒绝修改正式用户 profile。
