# Agent 與能力套件

平台的圖像、標記、運算、依據及提交檢查由宿主 API 管理；Agent 透過相同工具操作。系統提示只描述圖像協作角色。方法與可復用工作知識在標準 SKILL.md 中，按需要讀取參考文件。Skill 不獲得修改人工答案或跳過宿主檢查的額外權限。

## 管理入口

Agent 設定 → 能力套件：新增本機資料夾、啟停或移除套件、選擇執行器，按「套用並重新連接 Agent」。保存配置和重連分開；忙碌回合不能切換。配置檔為 app data 下的 agent-profile.json，與專案、圖像和服務商帳戶分開。

啟用表示加入資源目錄；實際讀取留 path、SHA-256、packageId、回合及 manifestHash。不能由啟用勾選推斷 Agent 已讀過技能。Pi 使用 read 工具按需讀啟用 skill 根內的文字；修改正文或 references 後重新連接會更新 manifestHash。資源版本不會自動更新既有算法程式或重寫歷史結果。

原始 CV 套件在 `agent-packages/agentcv-cv/`。本機開發預覽優先使用專案中的資源，獨立安裝使用隨 App 提供的資源；也可把技能放到自己的版本管理目錄後從設定加入。修改技能無須改 Pi SDK 或工具合約；新增宿主工具仍需實作真正的宿主執行器。

## 標準 skill

可直接新增包含 SKILL.md 的資料夾。SKILL.md 使用 `name`、`description` YAML frontmatter，正文可相對連結 references/。支援一個套件放多個 skill。啟用同名技能會明確報錯，避免不清楚哪一份生效。

## Plugin manifest

資料夾可放 `agentcv-plugin.json`：

```json
{
  "schema":"agentcv-plugin-1",
  "id":"my-cv-package",
  "name":"我的圖像處理能力",
  "version":"1.0.0",
  "skills":["skills"],
  "extensions":["extensions/extra-tools.mjs"],
  "adapters":[{"id":"my-agent","name":"我的 Agent","entry":"adapters/bridge.mjs","protocol":"agentcv-stdio-1"}]
}
```

各陣列只列實際需要且存在的資源；僅提供 skill 時 extensions/adapters 可留空。skills 可指定單一 skill 目錄、SKILL.md 或集合目錄。也支援 Pi package.json 的 pi.skills/pi.extensions；不在這裡自動下載或執行遠端套件。

Pi extension 使用已安裝 Pi SDK 的 extension API，僅明確啟用的 extensions 會載入。新增工具名會加入本次可用工具；不能覆蓋宿主工具名。Skill 是可攜知識，Pi extension 是 Pi 專用執行程式；其他 Agent 需要其自己的對應實作。

## 更換 Agent 本身

內建執行器是 Pi。其他 Agent 由 plugin 的 adapter entry 接入；不是切模型服務商，也不會把任意 CLI 自動變成相容 Agent。entry 是本機 Node .mjs，啟動它需要的真實引擎並實作 `agentcv-stdio-1`。本次未內建 Hermes 等其他引擎。

宿主供環境變數：

- AGENTCV_AGENT_CONFIG：當前配置 JSON 的絕對路徑。
- AGENTCV_RESOURCE_DIR：內建套件根目錄。
- AGENTCV_TOOL_CONTRACT：宿主工具 JSON Schema 與簡短角色提示。
- AGENTCV_RESOURCES_API：可 import 的引擎無關資源模組；提供 loadAgentProfile/readAgentResource/describeAgentProfile。
- AGENTCV_ADAPTER_PROTOCOL：外部 adapter 的 agentcv-stdio-1。

stdin/stdout 每行是一個 JSON 物件；stdout 僅放協議訊息，診斷寫 stderr。

| 方向 | 訊息 |
| --- | --- |
| 宿主→adapter | prompt {id,message,images}；images 為真實 image content parts |
| adapter→宿主 | ready {models,model,runtime?}；模型資料須是真正選用的服務商與模型 |
| adapter→宿主 | turn_start {turn}、text_delta {turn,delta}、turn_end {turn} |
| adapter→宿主 | tool_request {id,turn,name,args} |
| 宿主→adapter | tool_response {id,result}；宿主依當前圖像/畫板/依據合約執行 |
| 宿主→adapter | abort、reset、models、set_model；帳戶命令只在支援時處理 |
| adapter→宿主 | error/agent_error/fatal {id?,turn?,error,category?}；不得吞錯或靜默切回 Pi |
| adapter→宿主 | resource_read {turn,path,sha256,packageId,name?}：只有實際讀取成功後才發 |

ready.runtime 的 activeAdapter/config/manifestHash 由宿主標明；skills/extensions/capabilities 可由 adapter 回報實際載入內容。不回報則呈現 resources OFFERED，不能當作已載入。自建 Agent 應將技能目錄接到自己的發現/讀取機制，或使用資源模組按需讀取，並保留實際讀取回執。宿主不會代它聲稱已讀過所有技能。

## 邊界與驗證

`agent-resources.mjs` 掃描與讀取範圍是啟用套件內的 skill 資源，拒絕路徑/符號連結逃逸；有界文字讀取不等於限制 CV 算法。算法與輸出走宿主既有可編程接口。切換資源或引擎不會繼承既有試算為正式交付。

已有真實檔案/子程序與已安裝 Pi SDK 測試，核對套件停用、plugin 工具是否真正可用、資源雜湊、stdio 與失敗路徑。這些檢查證明載入和協議行為；技能品質還需要真實問題、算法結果及工程師審核。
