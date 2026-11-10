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

可执行文件：`E:\personal_project\mycv\viewport-build\target\release\agentcv-desktop.exe`。版本号仍为 `0.16.7`，通过此路径区分旧版。SHA-256：`AEEF9A7C12B35A26BAD37347A82806636D5D6CB9B11F81A80D279E1EBAF944B7`。

构建保留原有 4 项 Rust 未使用代码警告，以及 Vite 混合导入／大包提示。构建前的本地生成文件已备份至 `E:\personal_project\mycv\viewport-merge-backup`。未推送远端。
