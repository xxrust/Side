# 统一图片渲染框选择性整合

本地分支：`integrate/unified-image-renderer`。旧版基线 `c14dad4`，选择性取自新版 `origin/main` 的 `8b717f6`，未整体合入该快照。

## 合入范围

引入 `ImageRenderer`，接入主界面节点输入／输出、画板图像源预览、图像源弹窗原图和判定依据图。支持配适、鼠标锚点缩放、拖动、1:1、最大化和恢复。原图加入画板使用预览下方的 `+` 按钮，避免拖动预览时误触加入。

主界面、图像源弹窗使用完整图像。画板图像源卡片继续使用缩略图，其 1:1 表示缩略图实际像素；查看完整像素可将原图加入画板或打开图像源弹窗。

未合入动画文章／输出示例，以及其他画布删除旋转操作的变更。此前记录的重复测试存储问题继续暂缓，未改动执行或持久化逻辑。

## 已复现并修正的问题

- 主界面输入／输出卡片使用网格子网格布局，新增渲染框却设置 `height:0`。实测可视区域高度为 0，图片缩成约 12×8；改为正常填充网格行。
- 判定依据图受旧 `figure` 居中规则影响，渲染框宽度变成 0；修正交叉轴拉伸，并明确隐藏空态。
- 原最大化修改父容器内联样式，受画板变换和裁剪影响；改为独立 modal 顶层宿主，不改变父容器布局。Esc、恢复、清图、关闭来源弹窗、释放实例均会退出最大化。
- 同图重复刷新、窗口变化可能丢失相机位置；保留缩放和平移，恢复最大化前的视图。缩放画板内的指针坐标换算为渲染框本地坐标。
- 狭窄主界面工具栏可能裁掉最大化按钮；允许工具栏换行。
- 替换图片、重建主界面、清理来源缓存时释放旧渲染器和观察器；避免异步旧预览写入已替换实例。
- 缩略图按解码后的实际尺寸显示，不再假装是完整原图的像素尺寸。

## 验证

独立 Chromium 测试页面：`desktop/qa/image-renderer.browser.html`。先在 `desktop` 启动 Vite，再打开 `/qa/image-renderer.browser.html`。`window.rendererCheck` 返回结果。

7 组浏览器回归通过，覆盖主界面尺寸和空态、窄栏按钮、锚点缩放、同图刷新、窗口变化、画板缩放坐标、最大化与 Esc、1:1、换图、清理、图像源原图／判定依据图、嵌套弹窗及缩略图缓存释放。分别在较窄视口和 1440×920 逻辑尺寸下验证。

实际工作台页面额外通过 `runWorkbenchRendererCheck(window.AgentCVDesktop)` 验证：两侧图片均已加载，状态 READY，1440×920 下两个渲染框均为 370×632，连续刷新 10 次保留图像、缩放和最大化状态。此测试仅使用合成图片和明确构造的界面数据，不代表算法准确率验证。运行时必须使用隔离浏览器上下文，避免替换用户工程。

工作台截图：`reviews/viewport-integration/main-browser.png`（本地验证产物，不提交）。

现有测试命令：

```powershell
node --test qa/image-viewport.test.mjs qa/source-preview-order.test.mjs qa/source-decision-live-cache.test.mjs
```

6 项通过，含图像源切图时序和千图虚拟条带。另有 `node-output-model.test.mjs`、`source-image-labels.test.mjs` 依赖未上传的 `codex-audit-logs` 历史工程，因缺少文件无法运行；未把这些测试记为通过。

## Windows 构建

```powershell
$env:CARGO_TARGET_DIR='E:\personal_project\mycv\viewport-build\target'
npx.cmd --no-install tauri build --no-bundle -- --locked
```

最终构建成功，原生程序启动后窗口标题为 `SIDE · 視覺檢測`，进程正常响应并创建 WebView2。启动检查使用独立 WebView 数据目录，检查后已结束测试进程；原来运行中的旧程序未关闭。原生启动检查与 Chromium 图片交互验证分开记录。

可执行文件：`E:\personal_project\mycv\viewport-build\target\release\agentcv-desktop.exe`。版本号仍为 `0.16.7`，通过此路径区分旧版。SHA-256：`BE30F563E261A07EDF25B8EE4C311891203C276DBA28400B095CA07373804804`。

构建保留原有 4 项 Rust 未使用代码警告，以及 Vite 混合导入／大包提示。构建前的本地生成文件已备份至 `E:\personal_project\mycv\viewport-merge-backup`。未推送远端。


## 图像源对齐与 RGB 回归修正

后续复现：图像源原图下方文件名占用高度，左、右渲染框分别为 361×204 和 361×228，竖图显示大小因此不一致。改为共享标题、图片、文件名三行布局；相同尺寸竖图的两个渲染框现均为 361×204，显示图像均为 123×184。文件名过长以省略号显示，不再挤压图片。

RGB 读数和取色移入共享 ImageRenderer，每个窗口只保留一个右下角读数，覆盖图像源原图、依据图、主界面输入／输出、缩略图和最大化窗口。复用 1×1 采样画布，使用当前缩放和平移换算像素坐标；离开图片、切图或清图时重置读数，避免显示上一位置的颜色。

更新后 9 组浏览器回归通过，包含竖图／长文件名下的等大图片，以及已知像素在缩放、平移、父画板缩放、最大化和恢复后的准确 RGB 数值。实际工作台两侧取色与 10 次连续刷新检查通过。原有 6 项测试通过；Windows Release 重新编译成功，输出路径不变。本轮未重复执行原生界面启动检查。

## 当前内存输出被摘要策略误挡

桌面默认使用 `artifactMode: memory` 和 `artifactRetention.mode: metadata`。当前工件像素保存在进程缓存；重新读取其单件记录后，产物会带上 `pixelRetention: metadata-only`。输出模型已从缓存补齐像素，但显示层与圈选引用仍直接按该标记拒绝。隔离浏览器中复现为状态 `READY`、输入图正常、输出区显示“本批次只保留此图的摘要”。

修正显示和圈选引用：以已解析产物中是否实际存在像素判断可用性。记录加载接口先核对当前工件、运算和产物身份，再使用内存缓存；返回临时预览，不把缓存写回工程。持久化保留策略保持原样；切工件或重开工程后，真正没有保存像素的历史记录仍提示仅摘要，不尝试读取不存在的图片。

新增 `desktop/qa/node-output-memory.test.mjs`：使用真实 Python/OpenCV 执行灰阶和 Canny 输出，经过默认内存模式、摘要保存、单件记录恢复后，验证像素 SHA-256、圈选引用、当前选择及产物身份校验；同时验证重开工程和切换工件后不可读取旧缓存、预览不会进入工程存储。默认使用 `python`，可通过 `AGENTCV_QA_PYTHON` 指定解释器。

```powershell
node --test qa/node-output-memory.test.mjs qa/image-viewport.test.mjs qa/source-preview-order.test.mjs qa/source-decision-live-cache.test.mjs qa/artifact-retention.test.mjs qa/stage-output-policy.test.mjs
```

12 项测试通过。9 组浏览器渲染回归通过；实际工作台用内存缓存加摘要恢复路径验证两图显示、准确 RGB、缩放、最大化、连续刷新 10 次和圈选引用，并验证缓存清除后的摘要空态。浏览器工作台使用合成图验证界面，真实 OpenCV 验证由上述 Node 测试独立执行。

旧版进程仍在使用原来的可执行文件，本次改用独立构建目录：

```powershell
$env:CARGO_TARGET_DIR='E:\personal_project\mycv\viewport-output-build\target'
npx.cmd --no-install tauri build --no-bundle -- --locked
```

本轮 Windows Release 构建成功，保留原有 4 项 Rust 未使用代码警告及 Vite 提示。新程序为 `E:\personal_project\mycv\viewport-output-build\target\release\agentcv-desktop.exe`，SHA-256 为 `4EA63C8447507109CBF8D974800CCB69B11A930BC3D4871FB3B61ABBF3CB9505`。独立 WebView 数据目录启动验证通过：窗口正常响应并创建 WebView2，验证后只结束测试启动的进程，用户原有进程保留。启动证据在构建目录 `startup-verification.json`。
