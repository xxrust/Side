# Windows 桌面节点派发失败

用户报告节点持续出现 Python 错误后，检查实际桌面恢复文件及最近三份已保存单件记录：首节点 `shared_preprocess` 均为 `DISPATCH_FAULT`，`objects`、`unweld_analysis` 因前置节点失败而跳过。运行目录只有 `algorithm.py` 和 `request.json`，尚未创建 Python 结果。这说明这些测试没有生成新的输出图；先前通过合成图验证出的摘要显示问题不能解释本次节点执行故障。

## 已复现的原因

双击启动的程序继承资源管理器环境，`PATH` 没有 Miniconda，应用管理目录也没有 Python 虚拟环境。旧版只检查管理环境、`AGENTCV_PYTHON`、Unix 路径及 `PATH`，因此返回：

> 找不到 Python 3。請配置 AGENTCV_PYTHON，或建立專案的 runtime/python 環境。

同一失败请求从开发终端经 Rust 原生入口重放成功，从正在运行的桌面进程的环境重放失败。开发终端已经激活 Miniconda，直接 Python 测试因此不能覆盖双击启动场景。Windows 用户注册表实际登记了 Miniconda 的安装位置。

Tauri 拒绝调用时返回字符串，旧版逐件执行器读取 `error.name` 和 `error.message`，使保存后的节点错误变成 `{}`，丢失原始故障信息。

## 修改

- Windows 的 Python 发现增加 PEP 514 注册表安装信息，包括当前用户、系统及 32/64 位视图；继续优先使用已有管理环境、明确配置和 PATH，不修改用户系统环境变量。
- 节点派发及图片读取错误保存原始字符串信息；从未成功执行过节点的工程也能正常保存故障记录。
- 保留之前“当前缓存像素不应被摘要保留标记挡住”的独立修复。

## 实际桌面验证

`desktop/qa/native-desktop-execution.mjs` 连接真实 Tauri WebView，调用生产应用的 `runPurposeScheme`，经过实际 Tauri IPC、Rust 运行时、Python 常驻进程、单件保存和输出面板。它拒绝操作没有 `.qa` 后缀的应用标识，并要求启动时没有现有图片或工程路径。不是通过普通浏览器模拟 Python 返回值。

使用用户原始未焊 BMP（SHA-256 `3acedf2878d93ee0e76c7ab679272beace6cdc0d6cb4177fa83f6dfa4707a337`）和未改动的三节点方案，在独立 QA 应用标识下，从资源管理器环境启动：PATH 内没有 `python.exe`、没有 `AGENTCV_PYTHON`、没有管理虚拟环境。

结果：自动选择本机 Miniconda Python 3.12.7；三个节点均 `SUCCEEDED`／`COMPLETED`，执行故障数为 0；`shared_overlay`、`overlay`、`unweld_output` 均在原生 WebView 中解码并显示为 1280×1024，取色为 `RGB 77, 77, 77`，圈选引用按钮可用。这验证执行与图像可用性，不作检测准确率结论。

证据保存在仓库外 `E:\personal_project\mycv\native-python-diagnosis\isolated-desktop-evidence`：`native-desktop-report.json`、`native-output.png`。验证后 QA 进程已结束，正式版恢复文件哈希前后相同。

首次原生验证仅覆盖 `APPDATA` 环境变量，未隔离 Windows Known Folder API，曾向正式版恢复目录及工程暂存索引写入 QA 数据。之后确认正式版恢复文件重新包含原有 33 张图片，备份恢复文件；核对 QA 单件记录未被工程 manifest 或恢复文件引用，移出该记录并删除其精确暂存索引行。最终干净验证采用独立应用标识，重复全流程通过。

QA 临时构建配置在仓库外，包含 `.qa` 应用标识和本地 CDP 端口；最终交付使用原始正式配置，不包含调试端口。最终程序路径：`E:\personal_project\mycv\viewport-build\target\release\agentcv-desktop.exe`。前一轮 `viewport-output-build` 目录中的程序不包含本次 Python 发现修复。

补充回归：`node --test qa/node-output-memory.test.mjs` 包含原生字符串错误保存及真实 OpenCV 内存输出、摘要恢复、缓存过期验证。

最终正式配置 Release 构建成功；13 项相关 Node 测试通过。正式二进制在资源管理器环境下重放最初失败请求，再次 `SUCCEEDED`，自动找到 Python 3.12.7。程序 SHA-256：`255A294AD858F31D8B462DFCC498185384D149D60190DE6951D3CC703ED996D8`。证据：诊断目录 `final-release-verification.json`。Rust 保留 4 项既有未使用代码警告，Vite 保留既有混合导入及大包提示。
