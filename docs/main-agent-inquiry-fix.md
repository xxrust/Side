# 询问入口统一到主 Agent

2026-11-11，修复单 Agent 迁移后“询问此节点”“询问整个流程”等入口无反应的问题。

## 原因与行为

`openProgramFlowQuestion` 仍创建旧的 canvas thread，而 `singleAgentMode` 的渲染会移除旧问询气泡。主对话的 `quoteVisual` 只接受图片快照，不能接收流程引用，也不会展开被收起的主面板。

流程询问现在直接进入主对话输入框。节点询问保留准确的选中节点和完整流程；整个流程询问明确使用 whole-flow 范围。放大的流程图先收起，主面板自动展开并聚焦。用户可补充问题后发送，已有手写草稿会保留。

图片、局部标注及关系询问共用这一入口，局部引用带上 annotation ID、坐标和选中关系。引用克隆为当时快照，后续导航或编辑不会改变已引用内容。工具、表格、旧方案及本体引导的提问也使用同一面板展开逻辑。没有创建 canvas thread，也没有重置主 Agent。

## 验证

- `node --test qa/main-agent-inquiry.test.mjs`：实际渲染节点的 contextmenu、菜单点击和主表单发送通过；覆盖节点、整个流程、局部标注、图片关系、草稿保留及引用快照。
- 连同 single-agent-surface、visual-inquiry-model、canvas-relations、visual-inquiry-agent 共 22 项，20 项通过。visual-inquiry-agent 的两项已有断言失败：CV skill 旧文案、期望 prompt 中 reference 被删除。这两项依赖的 agent.js、agent-prompt-context.js、CV skill 和测试文件均与本次修改前 HEAD 一致，本次未修改这些行为。
- 真实 Windows Tauri：使用独立 `studio.agentcv.desktop.inquiry.qa` 配置，导入原始图片和原方案，通过真实菜单及主表单验证。节点引用为 `scheme::shared_preprocess`，完整流程 9 个节点；四次发送均为同一个 `thread_id=main`、同一个 session key，canvas thread 数量为 0。输入框在原生窗口内可见，没有旧局部输入框。仅拦截发送传输，没有调用外部模型或伪造模型回复。
- 首次原生运行的功能检查均通过，但证据收集器直接读取可缺省的 canvasThreads.length 报错；修正收集器后，在空白 QA 配置下完整重放通过。

证据：仓库外 `E:\personal_project\mycv\main-agent-inquiry-verification\evidence\main-agent-inquiry.json` 和 `main-agent-inquiry.png`。验证脚本为 `desktop/qa/native-main-agent-inquiry.mjs`。

正式程序一直运行，未关闭。其恢复文件在此期间自行变化，因此不能声称哈希未变；独立配置核对显示正式工程仍为 33 张图、56 条聊天，QA 为 1 张图、4 条测试提问，正式工程没有 QA 标记内容。没有恢复或覆盖正式会话文件。

## 正式构建

采用原始 tauri.conf.json 编译，不含 QA identifier 或调试端口；保留之前的 Windows Python 发现修复。

程序：`E:\personal_project\mycv\viewport-output-build\target\release\agentcv-desktop.exe`

SHA256：`115C5EBC2474CBA43FFFBEA55227747C169716BE0D62141D294D02515569B6FA`

当前仍运行的是 `viewport-build\target\release\agentcv-desktop.exe`；保存并关闭旧程序后打开上述新路径即可使用本次修复。
