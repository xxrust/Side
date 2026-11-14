# macOS framework diagnostic — acceptance remains open

The current user requirement is unchanged operators, correct execution and
display, and a per-image complete cycle no greater than operator time + 100 ms.
Neither a mean nor a headless run proves that requirement.

This checkout is `xxrust/Side`, main at `efe1679e`. Local changes are uncommitted.
The native Python JSON helper initially failed to link on macOS. A PyO3 build
script now supplies extension-module linker arguments. The frontend and native
release builds succeeded; 15 native JSON contract tests passed.

## Diagnostic specimen and scope

`desktop/qa/profile-workpiece-session.mjs` loads a session snapshot into the
production Workspace and runs its unchanged scheme through the production JS
workpiece runner, native headless service and resident Python runtime. Encoded
inputs are hash-checked and copied into a new isolated directory; a new workspace
receives synchronous, acknowledged durable records. The source project is not
written. Existing evidence directories cannot be reused.

The local specimen is Lid-Pkg, image `10_2.bmp`, 1280 × 1024, three operators:
`shared_preprocess`, `objects`, `unweld_analysis`. Artifacts are under the ignored
`framework-performance/` directory. Attempts 01–03 were harness setup failures
(missing/invalid record workspace and missing input manifest), retained as failed
observations. Attempt 04 completed. Attempt 05 is a CPU profile and is not used
as performance acceptance evidence.

The headless transport uses JSON pipes rather than Tauri's compact binary
response. It seals privately parsed execution facts as the desktop importer
does, but it does not emulate the desktop shared-fact wire compaction. It also
does not include WebView input/output display or navigation. These results locate
costs; they are not a substitute for real desktop measurements.

## First measured optimization

The pinned `sha2` 0.10.9 dependency uses software SHA-256 on aarch64 without its
`asm` feature. Enable that feature only on aarch64; the dependency detects CPU
support and retains a software fallback. All original and output byte checks
remain enabled. No operator code, parameter, classification rule or pixel
generation was changed.

Sequential control/candidate runs, each one cold plus 15 warm observations:

| Headless diagnostic | Control | Hardware SHA-256 |
| --- | ---: | ---: |
| Mean full call, including synchronous save | 624.20 ms | 595.94 ms |
| Mean overhead above measured algorithm-only time | 162.55 ms | 133.65 ms |
| Maximum observed overhead | 210.03 ms | 164.64 ms |
| Mean native artifact verification | 14.12 ms | 7.63 ms |
| Cold full call | 1162.38 ms | 965.15 ms |

Evidence: `mac-control-06/result.json`, `mac-sha-07/result.json`, and
`sha-comparison.json`. Operator code hashes, complete numerical result objects
and every returned artifact hash agree across all 32 observations. The selected
specimen succeeds in every observation. Two native memory-resource tests passed,
including forged-reference rejection, expiry, and immutable fact leases.

The mean difference is about 29 ms for this diagnostic; it is not a guaranteed
desktop saving. The 100 ms maximum overhead target is still unmet, even before
display. Cold starts are also above budget and remain explicitly visible.

## Remaining work

Confirm the user's precise target specimen/platform; the local restored project
is a candidate, not confirmation of the reported Windows or Mac measurements.
Measure release Tauri execution in an isolated QA profile through actual image
decode and presentation, including source navigation and archival semantics.
Then reduce remaining response construction/import, SDK output, persistence and
presentation overhead without weakening checks or changing operators. Validate
multiple original inputs, output pixels, fault/cancellation behavior, record
reopen and bounded resource usage. No overall performance or display acceptance
has been claimed.

## Actual desktop follow-up: incomplete acceptance

An isolated `studio.agentcv.performance.qa` release app uses an APFS-cloned
project and separate recovery directory. Its opt-in observer starts on the real
Execute once click, requires matched completed-unit input/output identities,
decoded visible image elements, enabled controls, and two animation frames. It
records natural archive completion separately. This is stronger evidence than
the headless harness, but it is still a small sample, not maximum-cycle acceptance.

The shared-fact headless wire diagnostic (`mac-wire-08`) measured 15 warm
observations with mean overhead 95.08 ms and maximum 105.25 ms, excluding GUI.
This corrects protocol fidelity; it must not be presented as a new optimization.

Native preview handoff now transfers an already decoded image only after exact
artifact verification. Seven focused tests pass, including premature/mismatched
handoff rejection, one-time ownership transfer, and decode failure. The actual
QA window displays the original and overlay side by side. These checks do not
prove all images or continuous-run behavior.

Added QA-only application phase markers to distinguish navigation/rendering from
native execution. Current evidence is saved in
`framework-performance/desktop-qa-01/phase-observations.json` (local, ignored).
A new cold click measured 811 ms visible, 477.45 ms algorithm, 333.55 ms overhead;
the following warm click measured 668 ms visible, 458.22 ms algorithm, 209.78 ms
overhead. Natural durable completion was 1011 ms and 834 ms respectively.
For the warm click, handler start was at 6 ms, dataset return at 581 ms,
auto-navigation completed at 614 ms, final synchronous render completed at
618 ms, and the verified visible frame at 668 ms. Recorded unit time was
552 ms. Thus next-image preparation/navigation took 33 ms and display settlement
another 50 ms after synchronous render; neither is covered by native-only timing.
Cold-start and warm maximum requirements both remain unmet.

Next work should measure and reduce repeated original-byte reading/hashing,
next-image decoding, and publication-to-visible-frame latency, retaining the
existing selection guards, byte verification, bounded caches and archival
integrity. QA observations currently persist in the cloned project after each
sample; their effect on subsequent checkpoints must also be isolated before
using larger batches for acceptance.

## Bounded exact-byte hashing and next-image preparation

`encodedImageSha256` now shares successful/in-flight hashes only for identical
immutable encoded strings, bounded to four entries and 16 MiB of retained string
storage. It does not cache a file path or skip file reads. Changed bytes obtain a
new digest; failed hashes are evicted. A real 1,311,798-byte original BMP retained
its expected SHA-256. In a Node-only 20-call microbenchmark, repeated baseline
hashing averaged 5.22 ms versus 0.002 ms for the same cached string; this is not a
browser or whole-cycle latency claim (`encoded-hash-comparison.json`).

Single-image auto-advance now prepares at most one next non-reference raster
while the current native session runs. It uses the same verified bounded image
store and releases its pin at completion/failure. It neither selects an image
nor bypasses any existing completion, source, filter, epoch or user-selection
checks in `advanceSourceAfterExecution`. Batch and manual-selection modes do not
start this speculative preparation. Operator code and parameters are unchanged.

Twelve focused tests passed (six existing real-image store tests and six new
hash-cache/preparation tests). The old image-file-identity suite could not load
its absent `reviews/2026-10-27-program-flow/actual-pi-workspace.agentcv.json`
fixture; it is not counted as passing. Release QA bundling and diff checks passed.

Actual desktop samples after hash caching alone: cold 785 ms / 463.56 ms
algorithm, warm 658 ms / 465.10 ms algorithm. After next-image preparation:
cold 786 ms / 482.56 ms algorithm, warm 638 ms / 472.19 ms algorithm. These are
successive different images, not controlled A/B samples. The measured warm
navigation phase fell from 32 ms to 1 ms, confirming preparation was moved out of
the post-compute wait. The latter warm overhead remains 165.81 ms, and natural
archive observation was 852 ms. Evidence is in `hash-cache-observations.json`
and `next-image-observations.json` within the local isolated QA directory.

Acceptance remains incomplete: cold start, remaining native/framework overhead,
actual frame settlement, full-dataset maximum, cancellation/error display and
archive reopen still require further work and verification.

## Observer correction and exact builtin encoder checks

The observer accumulated full result copies AND original-image Data URLs in
project metadata. The latter dominated: approximately 1.7 MB per observation.
Full pre-correction observations were copied to
`desktop-qa-01/observations-before-qa-compaction.json`. The QA observer now stores
artifact hashes/run references instead of result trees and records original
image identity instead of copying Data URLs. After migration, 14 observations
occupy about 174 KB serialized, compared with 21 MB for the earlier 12. Full
results and original bytes remain in existing content-addressed unit archives.
This is a measurement correction, not a claimed production optimization.

The SDK encoder now uses exact builtin type checks rather than constructing
Python type wrappers for each scalar. Subclasses still use the same fallback;
float spelling, normalization, key collision rules and output bytes are unchanged.
All 15 native JSON contract tests passed. Alternating 20 calls per version over
seven real archived JSON artifacts measured 13.39 ms average before and 12.00 ms
after. Every encoded byte matched across versions. The independent reader checked
both archive-container and logical-asset SHA-256 before benchmarking. Evidence:
`encoder-artifact-comparison.json`, with local reproducer `compare-encoders.py`.

The corrected observer plus encoder build measured cold visible cycle 750 ms,
algorithm 467.4 ms (overhead 282.6 ms); its following warm sample measured 631 ms,
algorithm 468.7 ms (overhead 162.3 ms). The warm final synchronous render ended
at 591 ms, with verified visibility at 631 ms. These remain single successive
images, not a controlled A/B comparison or proof of a maximum. New evidence:
`desktop-qa-01/compact-frame-observations.json`. Both cold and warm targets remain
unmet; next investigation should focus on original/output pair preparation and
remaining native/SDK overhead, with full-dataset maximum acceptance still pending.

## Input display preparation overlaps execution

ImageRenderer now shares one pending decoded frame for the same source URL and
dimensions. A superseding selection/progress request therefore cannot consume a
verified prefetch and then redundantly fetch/decode that same frame. Different
identities/dimensions remain separate; failures clear the preparation for retry;
clear/destroy/direct source replacement discard the retained preparation. The
caller still decides whether the prepared frame belongs to its current unit.

Added QA-only input/output decode, preparation and commit markers. The actual
warm coalescing-only observation had no duplicate decode: input decoding started
at 598 ms after dataset completion at 590 ms, became ready at 612 ms, and the
verified visible cycle completed at 632 ms. Thus duplicate prevention alone is
not claimed as an observed speedup for that sample.

Single-workpiece execution now asks the existing input pane to prepare its
current original while the native session runs. This uses the original verified
read path and renderer's bounded single-frame preparation; it does not publish
an image early or replace source/unit validation at final pair commit. In the
following warm desktop observation input decoding completed at 93 ms while the
algorithm was still running. Final preparation reused that frame. The measured
cycle was 607 ms, algorithm 465.96 ms, overhead 141.04 ms; natural archive
observation was 832 ms. Cold cycle remained 751 ms (465.42 ms algorithm).
Evidence: `desktop-qa-01/coalesced-frame-observations.json` and
`desktop-qa-01/prepared-input-observations.json`. These successive different
images establish phase behavior, not controlled full-cycle A/B performance.

Eleven focused tests passed: seven existing preview/bridge checks plus four
new preparation checks using actual PNG decoding under JSDOM/native canvas.
They cover no premature publication, exact shared-image ownership, distinct
identities, failure/retry, omitted dimensions and final run/unit rebinding.
JSDOM checks do not substitute for native layout. Release bundle and diff checks
passed. The 100 ms maximum target remains unachieved, including cold startup,
continuous/full-dataset coverage and durable record acceptance.

## Immutable audit events reduce repeated snapshot traversal

A Node preflight profile of the current isolated project found roughly 4.16 ms
mean for the whole undo snapshot and 0.93 ms mean for validation. Events and
historical executions were the largest snapshot subtrees; these are diagnostic
Node figures, not WebKit timing (`frontend-preflight-profile.json`).

New events now capture detached immutable JSON values. Restored events are sealed
once in both base Project and Workspace load paths. Undo snapshots can share the
unchanged event payloads while keeping the event list and editable project
fields independent. Caller mutation of a detail object no longer changes a
previously recorded event. No operator source or parameters were modified.

Twelve event/snapshot/execution-fact tests passed, including save/reopen,
undo-history sharing, editable-field separation, exact restored JSON values and
independent evidence revisions. The isolated release bundle and diff checks
passed. A 30-sample alternating Node comparison over 2,653 real events retained
identical serialized JSON and measured mean snapshot time 3.88 ms before versus
3.03 ms with immutable events. The candidate maximum was 21.35 ms versus 4.54 ms
before, so this experiment does NOT demonstrate a maximum-latency improvement.
Evidence: `event-snapshot-comparison.json`. Native desktop performance of this
change remains to be measured; the last verified warm full-cycle overhead is
still approximately 141 ms, above the requested maximum.

## Remove fixed archival delay from complete-cycle readiness

The desktop archive default previously waited up to 500 ms for a batch, and the
frontend checked completion every 250 ms. The default coalescing window is now
5 ms and active receipt polling is 16 ms. An empty worker uses a condition-variable
wait rather than waking every 5 ms. Failed writes stop automatic polling until
retry; transport/acknowledgement errors back off to 250 ms. Disposing the frontend
tracker prevents an in-flight poll from scheduling another timer.

Queue capacity, immutable leases, failure ownership, acknowledgement, save
identity checks, explicit close flush and durable-write behavior are unchanged.
Six frontend archive tests and five Rust archive tests passed, including a single
unit writing without another image or explicit flush, count batching,
backpressure, failure/retry, receipt identity, automatic completion discovery and
disposal during a pending poll. Release build and diff checks passed.

The actual new warm desktop observation completed both visible display and
observed durable archival at 613 ms, with algorithm time 468.87 ms and overhead
144.13 ms. Its archive reported 21.99 ms write time and 0.009 ms queue wait.
The previous different-image sample observed durability at 832 ms, so the main
confirmed improvement is removal of the separate late archival wait, not a
controlled claim of a 219 ms computation speedup. Cold cycle was 757 ms with
451.8 ms algorithm time and remains over budget. Both actual samples had durable
receipts by the time the visible frame was ready.

Independently read the latest saved record and all seven stored structured
artifacts from disk, checking physical pack hashes and logical artifact SHA-256.
The current operator code/parameters still equal the isolated source snapshot.
This does not replace full-dataset numerical/pixel parity or UI history reopen.
Evidence: `desktop-qa-01/fast-archive-observations.json`. The requested complete
maximum <= algorithm +100 ms is still unmet, including cold startup.


### 分段派發實測（2026-11-13，詳細 QA 計時）

僅 QA build 新增 runner validation/checkpoint/input-ready 及 native session preparation/dispatch/import 標記，沒有修改算子。已重新完成 release app build，透過正常工具列按鈕各執行一次冷啟動與暖機。證據：`framework-performance/desktop-qa-01/detailed-phase-observations.json`。

- 冷啟動：完整顯示與自然保存 766 ms，算子 476.3515 ms，額外 289.6485 ms。
- 暖機：完整顯示與自然保存 605 ms，算子 456.2521 ms，額外 148.7479 ms。
- 暖機點擊到 native dispatch 為 28 ms，其中 checkpoint 11 ms；dispatch 539 ms，包含算子及約 82.75 ms 其餘開銷；返回到完整顯示 38 ms，其中 input/output commit 分別在 584/590 ms 完成，605 ms 滿足兩次顯示機會。
- 此為不同圖像的定位樣本，不能當作受控速度改善或最大值驗收。冷暖皆未達標，持續圖像全集與故障路徑仍待驗證。下一優先項是 native dispatch 非算子耗時，並處理冷啟動。
- 同步收緊 QA 就緒條件：執行按鈕必須實際存在且 enabled；按鈕缺失不可被當作已恢復可操作。該條件修改是在以上測量後完成，尚未重新打包實測。


### 成對圖像版面測量（2026-11-13）

將輸入與輸出圖的同步提交拆成 DOM 更新、同批讀取目前 viewport 尺寸、同批 camera fit/paint。所有標題、輸入選項與歷史 DOM 更新先完成，兩個 bounds 在任何 fit 寫入之前讀取；不使用過時尺寸快取。一般單圖提交仍即時完成；同 source 保持 zoom/pan，clear/setSource/destroy 清除待完成提交。

驗證：圖像準備及 native preview 共 12 項測試通過，包括兩個 viewport 的讀取順序、不同尺寸置中、原圖相機保留及清除待提交狀態。QA release build 成功。正常工具列執行一冷兩暖，原圖和 overlay 目視顯示正常；算子 code/parameters 與隔離測試初始工作階段完全相同。

證據：`framework-performance/desktop-qa-01/batched-layout-observations.json`。冷啟動 visible 751 ms、durable 752 ms、algorithm 469.245 ms；兩次暖機 visible/durable 分別 589/590 ms、594/594 ms，algorithm 462.217/451.989 ms，完整顯示且保存的額外耗時 127.783/142.011 ms。兩個 commit 標記在各樣本中同時完成，分別為 742、575、580 ms。相較先前循序提交間隔約 6 ms，已消除此處的第二次測量；不同圖像與有限樣本不能證明總週期最大值改善。依然未達算子+100 ms，不豁免冷啟動。

原生派發詳細證據另存 `native-dispatch-breakdown.json`，保留 SDK、Python、report 編碼與讀取、native session 時間。後續仍須降低這些開銷，且驗證全集連續執行與故障恢復。


### 專案啟動時準備 Python 執行環境（2026-11-13）

新增 `prepare_inspection_runtime`，沿用真實派發的 scheme fingerprint/definition 檢查、runtime root、環境鎖與執行鎖。resident worker 的建立共用同一函式，prepare 僅載入 numpy/PIL/可選 cv2 與環境資訊，不執行算子、不讀原圖、不建立執行結果、不增加 calls。相同進程重複準備可直接返回；協議準備失敗清除進程，正常執行仍保留原本的初始化路徑。

恢復啟動專案後、啟用執行控制之前等待 preparation；UI 啟動提示為「正在準備檢測執行環境…」。錯誤記錄在 `AgentCVDesktop.runtimePreparation` 並允許後續正常執行自行重試。此變更將初始化移到 app startup，沒有消除 app startup 成本，也未覆蓋啟動後改換方案／進程失效／新開專案的所有冷啟動情況，不能豁免這些最大週期情形。

驗證：真實 Python socket 協議 2 項（重複準備無算子／檔案輸出、依賴失敗回覆並重試）；JS 準備請求 2 項；Rust resident plan 2 項通過。release build 成功，重新啟動 QA app 後由正常工具列執行首張圖。`prepared-runtime-first-observation.json` 記錄 visible=durable=619 ms，algorithm=461.8402 ms，overhead=157.1598 ms。新進程 pid 48768，三節點 calls=1/2/3 且 coldStart=false，說明初始化已提前而非執行過暖機算子。與先前未預備首張額外約282ms相比有改善，但圖像不同，不作精確受控 A/B 速度聲明。仍不達 +100ms 上限。

QA observer 增加 runtimePreparation 元資料，以便下次 build 保存初始化花費；此欄位是在本次首張測量後添加，尚未重新打包。


### 共享事實候選索引的雜湊成本（2026-11-13）

`shared_facts.rs` 將每個 JSON 容器的 DefaultHasher 改成輕量候選索引。此 hash 只選出可能相同的子樹，並非內容驗證或安全 digest；真正共享前仍逐層執行 `same`，保留 object key 次序、integer/float 表示、負零及特殊鍵的比較。所有 SHA256 資產／身份校驗未改。

同一份 `mac-sha-07/last-native-response.json`（4,018,975 bytes）做 release Rust 回覆壓縮、編碼與釋放測量。保留舊測試 binary，在四輪中交替啟動新舊 binary，每次內含 48 次編碼樣本。證據 `framework-performance/shared-index-alternating.json`：舊版平均 6.14035 ms、觀測最大 6.70046 ms；新版平均 4.97509 ms、觀測最大 5.39067 ms。兩版 wire 完全相同（1,608,952 bytes、67 links），每次還原均與原始序列化逐位元組相同。

Rust 人為 hash collision 與特殊 JSON 值測試 2 項通過；真實回覆 roundtrip 顯式執行通過；JS shared-facts 還原測試 4 項通過。此為局部受控測試，排除算子、IPC、畫面及歸檔，不能代表完整單張最大週期。尚未用此索引改動重新打包桌面；最新完整桌面證據仍是前一節首張額外157.2ms，目標尚未達成。


### 33 張連續執行與完成畫面優先更新（2026-11-13）

發現既有畫面 scheduler 將完成工件與節點進度共同限制在 150ms 間隔。新增 completion-aware request：新 `completedWorkpiece` 身份立即 flush 畫面；相同完成工件及中途節點事件仍合併。身份在 render 前記錄，以阻止同步訂閱重入重複立即刷新；舊 timer 可取消。排程及圖像準備 7 項測試通過。

新增 QA-only 被動連續觀察器與 runner 迭代起點通知。由正常連續按鈕觸發，不自行執行算子、不手動 flush 歸檔。首張包含工具列與 preflight，之後每張從 runner 迭代進入開始，至身份匹配的輸入/輸出圖像完成解碼且歷經兩次顯示機會、自然歸檔 SAVED。持續執行期間控制本來停用，因此逐張可見門檻不要求按鈕 enabled；批次結束另驗證控制恢復。此量測不代表每張的發送間隔或無重疊 wall-time 總和。

最新 release app（也包含候選雜湊及啟動預備）已完成來源 33 張連續執行。證據 `continuous-33-observation.json`、`continuous-33-execution.json`：32 張達到圖像/保存觀察條件，這32張額外耗時平均165.3806ms、最大246.4603ms；最大在首張，算子476.5397ms，完整週期723ms。其餘亦有最高192.1051ms，不能以排除首張達標。啟動預備150.3419ms，calls=0；成本明確保留在證據。

第33張 `未焊_20250527180855299.bmp`、imageId `6496c5e2-75df-4ce1-b052-ecaf24234d70` 的 objects 算子回報 `StructuredLayerContractError`，位置 `structuredLayers[0].objects[9].geometry.points[0]` 非有限 x/y。觀察器正確判定整體 FAIL，沒有以32張成功掩蓋故障或給出全批最大已通過。算子 code/parameters 與初始隔離專案完全相同。

以先前保留 `framework-performance/baseline-desktop`、同一原圖、同一算子及參數，透過 headless 診斷重現完全相同的錯誤及位置（`fault-baseline-10/last-native-response.json`）。這是已有輸出契約故障，未放寬驗證、未修改算子。33份已保存紀錄的 SHA256 全部獨立核對通過；這只是紀錄完整性，不替代所有圖像產物逐一像素比對。

未完成事項仍包含：+100ms 最大週期、前端回覆/顯示準備開銷、換方案與失效進程的冷啟動、既有無效算子輸出的處理邊界、完整故障/取消與重開驗證。不能宣告目標完成。


### 連續派發時提前解碼本件輸入顯示（2026-11-13）

native session bridge 的 onStart 現在帶入實際 request 及 isCurrent guard；app 以 request.shared.workpieceUnit.imageIds[0] 準備本件輸入顯示，取代僅單張執行使用的 navigation.imageId。圖像讀取/解碼與原生算法重疊，仍不提前發布，最終 commit 使用原有 unit/run/selection 檢查。13項 bridge/圖像準備測試通過，含兩個不同 unit 的 request 身份及失效 guard。

release desktop 重啟後，再從正常連續按鈕執行相同33張。`continuous-prepared-input-observation.json`：32張完成顯示與保存，額外耗時平均150.3600ms、最大234.0643ms；除首張以外最大163.5750ms。首張全週期709ms、算法474.9357ms。前次32張平均165.3806ms、最大246.4603ms；這是完整資料集前後觀測而非交替受控環境，不能聲稱任何平台都保證此改善。第33張同樣原有算子故障，整體FAIL。

逐張對照兩次33份保存紀錄：所有紀錄SHA256校驗通過，所有節點 result 和 structuredLayers 完全一致（包含故障件的既有輸出）。比較證據 `continuous-prepared-input-comparison.json`；執行摘要 `continuous-prepared-input-execution.json`。

進一步定位：本次 input 階段平均37.41ms、最大76ms；這是派發前的 project.ensureImagePixels，與 renderer 的顯示解碼不同，尚未透過下一工件預取重疊。這是下一主要優化方向；需使用真實迭代順序、受限的預取/固定引用數量、取消/變更時釋放，保留正常讀取校驗及失敗行為。目標仍未達+100ms。


### 下一工件像素準備與原生派發重疊（2026-11-13）

新增 workpiece-input-prefetch：讀取 runner 真實 iterator 的下一件，僅在目前 native session 已派發後啟動其普通 ensureImagePixels。只保留一件 lookahead；pin 沿用有界 image store，轉入正式工件時保留至正式派發已取得原有 pins。取消、專案/方案變更、結束、讀取錯誤釋放；預取失敗由正式 input-read 正常重試/報錯，不產生分類或忽略故障。只為 app 明確啟用，且 options.units 為陣列或無指定才讀取下一件；未知外部 async stream 保持原有消費節奏。

預取與 dataset-image-store 共9項測試通過。release app 從正常連續按鈕重跑33張，證據 `continuous-prefetch-observation.json`、`continuous-prefetch-execution.json`。32張可完整觀察；平均額外126.0209ms、最大238.7863ms（首張全週期717ms、算法478.2137ms）；後31張最大140.6010ms，全部成功樣本仍超過+100ms。輸入準備後31張平均7.9355ms、最大9ms，對比前次全體平均37.41ms，預取已明顯縮短後續派發前等待；首張無上一件可重疊，仍是主要最大值。

33份新舊保存紀錄的SHA256均通過，所有節點的result與structuredLayers完全相同，證據 `continuous-prefetch-comparison.json`。第33張依然是已在基準版重現的原有無效座標故障，整批驗收FAIL。未修改算子，不排除首張或故障件來宣告完成。


### 撤回同步快取實驗：只搬移等待時間（2026-11-13）

嘗試在已有匹配尺寸、內容身份且無讀取錯誤的 raster 時同步返回，避開 ensureImagePixels 的微任務等待。相關10項測試通過，release app 完成33張測量；證據 `continuous-ready-pixels-observation.json` / `continuous-ready-pixels-execution.json`。32張成功樣本額外耗時平均126.7806ms、最大242.0167ms，非首張最大138.4731ms；第33張仍為既有同一算子故障。

後31張input由約7.94ms變為0，但scheduling平均增至26.9352ms，完整週期未比前一版平均126.0209ms改善。這證明cached await期間讓出的前端工作只是延後執行，不能將計時區段歸零當作真正加速。33份新舊紀錄SHA256校驗通過，全部數值結果與structuredLayers一致，見 `continuous-ready-pixels-comparison.json`。

已撤回這次 readyImagePixels API、runner同步捷徑及其專項測試，保留上一版受限預取與既有讀取語義。後續應分析主執行緒在 Promise 回覆後執行的實際工作，而非添加更多沒有端到端收益的快取捷徑。目標仍未達成。


### 真實 WebView 前端同步工作分段（2026-11-13）

新增僅QA啟用的 frontend-work-observer，包裝現有實例/renderer prototype 方法，保留this、返回值（包括原Promise）及例外，無sink時直接呼叫原方法。專項測試通過。觀察器記錄巢狀同步區段；不能把這些total當成互斥時間相加，也不包含非同步I/O的等待。

release app 完成同樣33張連續執行，證據 `continuous-frontend-profile.json`。32張成功觀察平均額外127.0151ms、最大240.6579ms，第33張同一既有算子錯誤。主要發現：

- imageRenderer.bounds：67次、總239ms、最高8ms；大部分input/output paired refresh的同步時間在強制讀clientWidth/clientHeight。
- output.refresh：135次、總285ms、最高8ms，包含上述bounds，不能重複相加。
- flow.sync：102次、總111ms、最高3ms；flow.renderDetails總1ms；single-agent的syncLocalQuestion總0ms，沒有理由刪除這些流程功能以求速度。
- project.checkpoint：1次13ms；project.event/notify的147/144ms互相包含（430次），並非額外291ms。
- imageStore.ensure同步本體65次總0ms，先前cached await的8ms不是ensure內像素複製，應處理在讓出執行權期間跑的實際版面工作。

下一步以既有ResizeObserver已確認的viewport尺寸減少同步layout讀取，必須驗證首次顯示、變更視窗尺寸、最大化、變更標題造成的版面差異，以及實際畫面和全週期；未實作或宣稱已改善。此輪只新增觀察與證據，目標仍未達標。

### 使用已觀察的視口尺寸（2026-11-13）

paired commit 使用 ResizeObserver 最近一次有效尺寸，首次、隱藏或沒有 observer 時仍同步測量；resize 回調重新配適圖片或保持手動相機比例並調整中心，最大化/恢復時清除舊尺寸。6項圖片準備測試通過，release bundle 成功，實際桌面確認輸入圖最大化和恢復，並從正常連續按鈕完成33件測量。

證據 continuous-observed-bounds-observation.json / execution.json / comparison.json：32件成功觀察平均額外116.6031ms，最大241.3605ms（首張，完整706ms）。對比上輪平均127.0151ms有改善，但最大值未改善且仍不滿足+100ms要求。bounds同步呼叫由67次/239ms降至1次/7ms，output.refresh總時間由285ms降至37ms；這些是巢狀量測，不可相加。33份保存紀錄SHA256均核對，全部result與structuredLayers與預取版本一致。第33件仍是原有算子無效座標故障，整批FAIL；不能宣稱全部運行正常或性能驗收通過。

另外重新fetch核對 origin 為 https://github.com/xxrust/Side.git，main與遠端同步於efe1679（包含47afb08），本地和遠端均僅main；上述框架修改仍未提交。

### 原圖解碼分段量測（2026-11-13）

新增僅QA啟用的 imageDecode.elapsed 區段；包含await等待，不能當同步CPU時間或與frontendSpans相加。完整連續33件的證據為 continuous-decode-profile-observation.json / execution.json。32件成功觀察平均額外117.6863ms，最大222.9372ms；最後一件既有FAULT。

首張input總59ms；解碼分段為browser-load12、canvas-read8、inspection3、gray3、pixel-hash6ms（encoded-hash命中快取近0）。整批32次解碼的browser-load總220ms、canvas-read261ms、inspection81ms、gray65ms、pixel-hash77ms，後續主要與原生運算重疊。由此排除灰階迴圈為首張主要瓶頸；輸入階段尚有約27ms在解碼前。下一實驗保持檔案校驗與資料URL內容，改用binary IPC傳輸，驗證是否能減少大型JSON字串處理。

### 撤回原圖binary IPC實驗（2026-11-13）

試行read_workspace_image_wire：沿用read_workspace_asset_bytes的授權、路徑、大小、SHA檢查，僅以原始UTF-8資料URL回傳，前端仍核對encoded digest。4項JS傳輸/快取測試及2項Rust來源索引測試通過，release build成功。第一次批次與測試程序重疊，不用於性能判定；完成後重新啟動QA app，單獨跑完整33件。

獨立證據continuous-image-wire-observation.json / execution.json / comparison.json：32件成功觀察平均額外114.7329ms、最大238.6581ms，非首張最大127.5260ms；首張input70ms（原JSON版本59ms），其中pixel-hash等待16ms（前輪6ms）。平均微小差異不足以證明收益，最大值沒有改善。33份保存記錄雜湊及每個run的result/structuredLayers全部一致，第33件依舊FAULT。已撤回新IPC命令、JS接線與專項測試，保留解碼分段QA及證據。尚未達+100ms目標。

### 像素雜湊與像素分析重疊（2026-11-13）

WebCrypto pixel digest 在RGBA讀取後立即啟動，接著執行原有直方圖、灰階轉換，最後仍await digest才返回解碼結果。沒有省略任何校驗、變更灰階數值或提前發布像素。彩色、灰階、透明度白底合成的實際PNG測試核對decoded SHA、encoded SHA、inspection及Float32灰階值；與快取測試合計4項通過，release build通過。

continuous-overlap-hash-observation.json / execution.json / comparison.json保存本輪33件證據。pixel-hash-wait整批由約77ms降至3ms（32次），但後續解碼已被預取重疊，不能把這74ms當成週期改善。32件完整觀察平均額外117.3465ms、最大254.0468ms，非首張最大140.0935ms；首張input63ms。完整週期未證明改善，+100ms目標仍未達成。33份保存紀錄SHA核對及全部result/structuredLayers均一致；最後一件仍原有算子FAULT。

後續架構約束：selectedImages要求pixels已存在，sourceBinding同時包含imageSha256與contentSha256，prepare/import/isCurrent皆比較來源；applyDecodedImage可能更新pixel SHA並保存decoder-change告警。不能只刪除ensureImagePixels來提早派發。任何原生file-backed並行方案都必須保持讀取錯誤、解碼差異、取消、專案切換及持久化記錄的完整語義，並在正式發布前通過原有像素身份校驗。本輪未改變此依賴。

### SDK整數編碼配置（2026-11-13）

先試驗把PyDict.keys列表改成直接遍歷作string-key驗證；真實7份、1,890,301 bytes JSON產物的60次基準平均10.9665→11.0453ms，無收益，已撤回。隨後只修改exact builtin int：i64/u64可表示的值直接由serde_json輸出十進位，不建立Python字串；超界Python大整數仍用原有str路徑，自訂子類仍走原fallback。增加signed/unsigned/2^53/2^63/2^64/1024-bit邊界比較；完整16項native-json契約測試通過。最初系統python缺numpy導致5項環境錯誤，換用應用實際desktop/runtime/python/bin/python3後全部通過，未跳過測試。

四輪交錯前後基準（每版240次，所有輸出與Python fallback位元組一致）平均11.1016→10.7816ms；最大11.5936→13.2306ms，不能聲稱改善最壞延遲。證據native-json-int-alternating.json及benchmark-json-dict.py/corpus保存於framework-performance。

release app由正常連續按鈕執行33件，continuous-integer-encode-observation.json / execution.json / comparison.json：32件完整觀察平均額外115.3084ms、最大221.5135ms，非首張最大133.2892ms，首張input57ms。所有33份保存紀錄SHA與每個run的result/structuredLayers均核對一致；第33件仍原有FAULT。跨輪首張波動較大，不將本輪最大值下降歸因於約0.32ms的encoder改善。仍未達算子總時間+100ms，沒有宣布驗收完成。

### 第一件原圖讀取與快照建立重疊（2026-11-13）

workpiece-input-prefetch新增prime：只取真實iterator的第一件並啟動原有ensureImagePixels，不等待解碼結束；runner在checkpoint前等待prime啟動，再做原有批次建立。僅明確prefetchInputs且普通來源/陣列單元啟用，未知外部串流不提前消費；resume不新增首件預取。取消、來源改變與正式input-read校驗仍保留，沒有提前執行算子。批次鎖與預取釋放移到涵蓋整個準備流程的finally，修正checkpoint或其他setup拋錯後可能留鎖的問題。

預取/圖像快取11項測試通過；workpiece-runtime完整34項通過，新增真實圖片測試確認ensure先於checkpoint，checkpoint故障不派發算子、lease清零，隨後同專案可成功重跑。release bundle通過。

continuous-first-input-observation.json / execution.json / comparison.json：32件可完整觀察平均額外117.3446ms、最大215.2020ms，非首張最大130.7389ms。首張input51ms，checkpoint17ms；首張toolbar到顯示+持久保存694ms，算法478.7980ms。33份保存紀錄雜湊、每個run的result與structuredLayers逐一一致，第33件仍原有FAULT。最大值較上輪221.5135ms小，但單輪差異不作穩定最壞值保證，仍未達+100ms。

進一步分解：後續件unit decision到實際顯示/自然保存約36–49ms。原生preview-ready目前等整個graph與decision之後才發出；可研究在選中node已完成原生校驗時提前發出純解碼提示，保持最終source/parity/commit gates控制正式顯示，不改變節點排程或算子。此項尚未實作。

### 選中節點完成後提早預解碼（2026-11-13）

inspection_service在選中node完成原有output/evidence/fact校驗後暫存preview hint，於同一node-completed事件之後、下一node-started之前發出。僅預解碼，最終來源、結果一致性與保存確認仍控制正式顯示；算子及排程不變。8項Rust commit測試及8項JS preview/session測試通過，含兩節點事件順序、保存失敗不得宣告成功。

continuous-early-preview-observation.json / execution.json / comparison.json：首張preview於派發後542ms到達，下一node同時開始、548ms完成，session549ms完成，提示較原整圖完成後提前約7ms。32件完整觀察平均額外115.3554ms、最大232.5495ms、非首張最大132.0766ms，沒有一件≤100ms。33份保存紀錄雜湊、所有result與structuredLayers一致，第33件仍原有FAULT。提前事件不能當作完成驗收。

### 新歸檔任務下一事件迴圈即查詢狀態（2026-11-13）

track新任務後setTimeout(0)發出第一次status讀取，讓runner先在本事件的微任務中完成單件摘要加入；不再先等待16ms。仍未完成則維持16ms輪詢，invoke錯誤保持250ms退避，FAILED停止自動輪詢。7項archive測試通過，包括下一task首次查詢、未完成間隔、錯誤退避、身份匹配、確認失敗重試及dispose。

continuous-first-poll-observation.json / execution.json / comparison.json：32件完整觀察平均額外115.0394ms、最大220.4845ms、非首張最大131.3298ms；僅1件≤100ms，後31件decision之後完整週期平均仍36.5161ms。相對前輪平均差異很小，未證明整體收益，顯示等待仍主導部分尾端時間。33份保存紀錄的SHA與全部result/structuredLayers一致。兩輪release build通過，最後一件原有FAULT仍在，+100ms目標未完成。

### 連續顯示分段與量測歷史的干擾（2026-11-13）

連續觀察器現在記錄既有qaExecutionPhase，包含原生返回、import、輸出decode與input/output commit（至多10000個事件）。發現QA連續歷史本身已達約4.7MB；已完成的QA觀察改用immutableJson，restore時凍結既有歷史，避免每次undo checkpoint複製測試工具累積資料。全部原有QA觀察先備份qa-evidence-before-freezing.json，實際重開測量後逐值核對完整保留，沒有刪除歷史或縮小真實執行資料。checkpoint由上輪約17ms降至本輪9ms；這是降低觀察工具干擾，不能算成正式產品收益。json-snapshot測試及release build通過。

continuous-display-phases-observation.json / execution.json / analysis.json / comparison.json：32件完整觀察平均額外114.3690ms、最大220.6344ms。結果返回至output commit平均7.2188ms、最大9ms；輸出decode等待平均2.7813ms、最大4ms；commit至兩次繪製機會的visible確認平均30.0313ms、最大43ms。仍按原兩次繪製驗證及自然持久保存計算完整週期，未扣除顯示等待。33份記錄SHA及全部result/structuredLayers一致；第33件仍既有FAULT。

首張實際時間線：toolbar handler12ms、validation18–21ms、checkpoint25–34ms、unit-start35ms、input-ready94ms、native dispatch98ms、native return662ms、import664ms、output commit671ms、完整visible+durable701ms。這再次確認主要首張瓶頸在原生派發之前的串行原圖準備，以及原生本體的非算子工作。單純調整預覽與輪詢不足以滿足+100ms。目標未完成。

### 撤回已準備原圖的顯示來源重用（2026-11-13）

試行顯示端接續已有pending ensureImagePixels或快取raster，核對內容SHA、尺寸、project/record身份及實際image.src摘要後，重用其資料URL（不轉移Image元素，避免renderer.clear破壞算子快取）；沒有可驗證raster時仍讀原圖。9項重用/配對圖片測試通過，release build通過。

修復DOM測試harness未定義VITE_INSPECTION_QA及缺getIdentifier mock的既有建置問題後，node-output-view四項測試中兩項仍失敗（同步切頁斷言、右鍵問詢composer）。將focused-workspace恢復到本實驗前的讀取路徑，整套重跑同樣兩項失敗；未宣稱該套全綠。harness修正保留；測試結果/tmp/side-prepared-display-tests.log及baseline-all.log。

continuous-reused-original-observation.json / execution.json / comparison.json：read呼叫由97降至64，但首張input仍59ms，平均額外123.3431ms、最大221.8875ms，非首張最大164.4364ms；零件符合+100ms。顯示解碼反而等到灰階準備後才開始（首張input-ready86ms、display decode92ms），完整週期無收益。33份記錄SHA及全部result/structuredLayers一致，末件仍原有FAULT。已撤回重用helper、接線與專項測試，保留證據與harness修正；不將減少讀取次數當成性能驗收。
# 完整週期預算核對（2026-11-13）

## 撤回主程式 LTO 試驗，定位浮點格式重複工作

主程式 `src-tauri` 曾試用 thin LTO／單一 codegen unit。完整批次 `continuous-host-lto-*` 驗證全部 33 份保存紀錄與 result／structuredLayers 一致，但成功樣本平均額外 114.7400ms、最大 217.9953ms，相對上一版 114.1977ms／216.3000ms 沒有整體改善，已撤回主程式編譯設定。原生 JSON 輔助庫先前有獨立微基準支持的 LTO 設定仍保留。

檢查真實 JSON corpus 發現最大產物有 70,650 個浮點數、15,585 個不同 bit pattern，原先每次編碼 4096 個格式快取上限之外尚有 16,135 次可重用的浮點格式。調整 per-call 上限至 16384，仍只重用 CPython 格式化的相同 bit pattern，編碼結束後釋放，無跨工件快取或無界增長。四輪交替微基準各 240 次，之前平均 10.6062ms／最大 11.0820ms，之後平均 8.2486ms／最大 8.8641ms；每次驗證整批位元組與 Python 參考一致，16 項契約測試通過。證據：`framework-performance/native-json-float-cap-alternating.json`。微基準不代表完整週期達標。

## 原生 JSON 輔助庫編譯優化

`desktop/native-json/Cargo.toml` 的 release profile 啟用 thin LTO 與單一 codegen unit，未改編碼演算法、浮點格式或算子。16 項 native JSON 契約測試通過。以 7 份真實 JSON 產物、共 1,890,301 bytes 做四輪交替量測，每版本 240 次：原編譯平均 10.8059ms／最大 11.1631ms，優化編譯平均 10.2301ms／最大 10.6120ms；每次都比對 Python 參考輸出的全部位元組。證據：`framework-performance/native-json-lto-alternating.json`。此最大值只代表本次微基準。

重建桌面 app 後用普通連續執行按鈕測試 33 張，保存 `continuous-json-lto-{observation,execution,comparison,audit}.json`。32 張成功樣本平均額外 114.1977ms、最大 216.3000ms，後續樣本最大 128.9423ms，仍只有 1 張在 100ms 以內；第 33 張保持原有故障。全部 33 份新舊保存紀錄雜湊有效，所有 result 與 structuredLayers 完全一致。SDK 平均由 21.7167ms 降至 20.8423ms，但完整週期差異很小，不足以證明整體最大延遲改善；保留此有獨立編碼微基準支持的建置設定，完整目標仍未完成。

新增 `desktop/qa/audit-cycle-budget.py`，讀取既有桌面 observation 與 execution，核對每份保存紀錄 SHA-256、runId 集合及原始 `program.algorithmMs`。將完整週期分為互不重複的 SDK、原生端其餘工作、session bridge、unit 內 dispatch 以外、unit 計時區間以外五項，逐件核對其總和等於實際額外耗時。最後一項在首張包含 toolbar preflight，不能全部解讀成顯示耗時；保存與顯示採較晚完成者，不能把兩者相加。

對 `continuous-display-phases` 的回溯核對輸出保存於 `framework-performance/desktop-qa-01/continuous-budget-audit.json`。全部 33 份保存紀錄雜湊有效，32 張成功觀察的平均額外耗時 114.369ms、最大 220.634ms，只有 1 張不超過 100ms，另有 1 張算子原有故障。平均互斥分項為：SDK 21.717ms、原生端其餘工作 31.183ms、session bridge 19.063ms、unit 內 dispatch 以外 6.031ms、unit 區間以外 36.375ms。分項最大值發生在不同工件，不能相加。

此為既有量測的可重現核對，不是新的性能改善或新的桌面驗收。後續須同時處理原生資料輸出／傳輸路徑與首張準備；僅改善首張讀圖不能消除後續工件平均 110.941ms、最大 123.806ms 的額外耗時。此後續樣本統計僅供定位，不縮小全批驗收範圍。


浮點快取調整的桌面實測：`continuous-float-cache-{observation,execution,comparison,audit}.json`。32 張成功樣本平均額外 112.9250ms、最大 231.5195ms；SDK 平均 18.8904ms（前版 20.8423ms）。後續工件平均 109.0994ms、最大 133.3328ms，只有 1 張符合 +100ms；首張準備在本輪增加，最大延遲未改善。33 份新舊紀錄 SHA-256 均通過，result 與 structuredLayers 相同，算子 id／code／parameters 與初始 source-session 相同。保留有交替微基準及 SDK 分項支持的局部改善，仍不得宣稱完整目標達標。

## 預載圖片交接核對（2026-11-13）

`ImageRenderer.decodeSource` 不再對轉移進來的已解碼預覽圖片重設 `crossOrigin`；新建圖片仍在載入前設定。避免在解碼後修改會影響 fetch 的屬性，但不能據此宣稱 WebKit 原先一定重新載入。新增交接測試驗證 CORS 屬性只寫一次、decode 只呼叫一次、未提交前不可見，dispose 不清除已交接圖片；相關 15 項測試通過。QA phases 區分 preview-transferred 與 fresh-decode。

實際桌面批次 `continuous-preview-transfer-*` 出現 33 次 output-preview-transferred、0 次 output-fresh-decode，以及 33 次 input-fresh-decode，證明原生輸出預載交接確實運作。32 張成功樣本平均額外 117.8846ms、最大 222.4599ms；全部 33 份紀錄雜湊有效，result／structuredLayers 與上一版相同，原有第33張算子故障不變。這是交接語意修正及路徑證據，沒有證明完整週期加速。後續應評估原圖 encoded bytes 直接傳輸與解碼，避免 base64 往返；先前撤回的 UTF-8 data URL binary IPC 試驗仍有 base64，不能等同此方向。

## 原圖 encoded bytes 直接傳輸（2026-11-13）

新增 `read_workspace_image_bytes` 原生命令，沿用 workspace 原始位元組讀取／路徑／大小／SHA-256 核驗，限制圖片 MIME，以 Tauri binary response 回傳原始編碼檔案，不做 Base64。`DatasetImageStore.ensure` 對 file-backed 原圖採用可選 readAssetBytes／decodeBytes，保留 generation／epoch／record 身分檢查、長度核對、請求合併、像素快取及原有重試／錯誤回報。內嵌圖與未配置 binary reader 的呼叫者維持原流程，顯示／縮圖／匯出 API 仍回傳原 Data URL。

`decodeBytes` 同步建立 immutable Blob 與 WebCrypto 輸入快照，驗證 encoded SHA-256 後以 Blob URL 交由同一瀏覽器解碼、白底 canvas、RGBA SHA-256、inspection、Float32 灰階流程處理；成功或失敗均 revoke Blob URL。保留 BMP 實際標頭覆蓋錯誤 MIME 的舊相容行為。未改算子。新增測試驗證檔案／像素／灰階／provenance 完全相同、錯誤雜湊、解碼失敗與 URL 回收、呼叫後原 buffer 改寫不影響快照、binary 長度錯誤不進解碼、請求合併與專案切換 gate。相關 9 項 JS 測試與 2 項 Rust source-store 測試通過。

桌面證據 `continuous-binary-image-{observation,execution,comparison,audit}.json`：32 張成功樣本平均額外 112.4411ms、最大 202.1209ms；首張 input-ready 在 click 後 83ms（前一版 91ms）。後續樣本平均 109.5482ms、最大 121.2708ms，0 張符合 +100ms。33 份新舊紀錄 SHA-256 核對有效，所有 result／structuredLayers／sourceBinding 完全相同；全部原圖 sha256／contentSha256／width／height 與初始 source-session 相同。第33張原有故障保持不變。這只是一輪完整桌面證據，不能視為最大延遲保證；完整目標仍未完成。

## 撤回 encoded hash 與瀏覽器載入重疊試驗（2026-11-13）

試驗令 byte-input 的 SHA-256 與 Blob 圖片載入同時開始，並等待兩者成功及 hash 相符才分析像素。新增受控測試證明雜湊未完成時不採用像素，其他一致性／錯誤回收測試通過。完整桌面 `continuous-parallel-decode-*` 顯示成功樣本平均額外 118.3729ms、最大 210.4053ms，首張 input-ready 86ms（前版83ms），unit 區間以外等待平均44.0625ms（前版38.1563ms）。33份新舊紀錄SHA與全部result／structuredLayers／sourceBinding一致，所有圖片身份與原始專案一致。未觀察到完整週期改善，已撤回該排程改動與僅針對該排程的測試；保留原版先驗hash再解碼的binary傳輸。微小工作重疊可能改變WebView事件時序，不能僅因可並行就宣稱加速。

## 共享門檻排除與 RGBA 單次掃描（2026-11-13）

使用實際 `mac-sha-07/last-native-response.json`，以相同 serde／serde_json／indexmap 版本隔離比較共享門檻 256／1024／4096／16384，各40次交錯執行；每次還原後驗證 Rust JSON 全部位元組一致。原生壓縮＋編碼＋釋放平均依次7.1195／5.4210／4.8571／4.8443ms，wire大小1527463／1605027／1608952／1760579 bytes。Node V8解析、共享還原與seal平均8.7805／7.9265／8.0081／8.8651ms；此微基準在每次之前GC，不能作為WebKit或完整週期證據。沒有足夠理由改變現行4096門檻。原始結果見 `shared-threshold-benchmark.json`、`shared-threshold-js-benchmark.json`。

框架的 input inspection 與 Float32 gray 準備原先各掃描一次RGBA；改為 inspection 可選填入 gray，重用同一次加權亮度運算。histogram、全圖achromatic分類、grayProvenance與白底合成規則不變。對全部16,777,216種uint8 RGB組合比較Float32位元、每組histogram與colorPixels，再驗證256種純灰階，全部相同；原有decode身份測試亦通過。單張真實圖像交錯100次（前5次保留在原始資料但warm統計不含）：原二次掃描平均5.5518ms／最大6.5575ms，單次平均4.0852ms／最大4.7332ms。這是Node微基準，不是桌面驗收。證據：`rgba-preparation-benchmark.json`；測試：`desktop/qa/rgba-preparation.test.mjs`。

單次RGBA掃描的桌面驗證：`continuous-rgba-scan-{observation,execution,comparison,audit}.json`。32次inspection＋gray合計由132ms降至115ms，最大單次合併區段4ms。32張成功樣本完整額外耗時平均110.7512ms、最大198.8146ms；後續樣本平均107.9105ms、最大120.4239ms；2張符合+100ms。33份新舊保存紀錄雜湊與全部result／structuredLayers／sourceBinding一致，全部原圖sha256／contentSha256／尺寸與初始專案相同，第33張原算子故障不變。首張input-ready77ms相對前版83ms，但handler/preflight也有不同，不能把6ms全部歸因於本次掃描合併。保留有位元一致性與局部分項支持的改動，完整目標未達標。

## 撤回原圖顯示 Blob 與同時讀取合併試驗（2026-11-13）

曾讓輸入畫面直接讀取binary原圖，核對encoded SHA後建立短期Blob URL，renderer解碼後即revoke，窗格快取已解碼frame；同時進行中的binary read以record／assetRef合併，稍後再次讀取不使用持續bytes快取，仍回讀核驗。標記／詢問會先從已顯示像素產生可攜PNG，避免存入臨時URL。18項測試驗證像素一致性、lease回收、來源切換、請求合併與可攜引用。

桌面`continuous-binary-display-*`顯示成功樣本平均額外115.5605ms、最大212.0885ms；unit外區段平均41.875ms，前版為36.34375ms。首張unit-start35ms→input-ready85ms，50ms與前版27ms→77ms完全相同。33份新舊紀錄SHA有效，全部result／structuredLayers／sourceBinding以及原圖檔案／像素sha與尺寸均一致，原有第33張算子故障仍存在。未證明完整週期改善，已撤回所有本次display lease／讀取合併／引用轉換改動及專用測試；恢復後16項相關測試通過。上一版pixel preparation的binary傳輸與RGBA單次掃描仍保留。


## 原生產物單次雜湊核驗（2026-11-13）

`verify_artifact_bytes` 原先計算實際位元組 SHA-256 後，對記憶體非圖像產物呼叫 `memory_resources::retain`，再次計算相同 SHA-256。新增私有欄位的 `VerifiedBytes`，由 Rust 擁有 Vec 並計算摘要，只提供唯讀存取；檢查宣告 SHA／大小並解析實際 JSON 後，整個容器消耗式轉交 `retain_verified`。沒有接受呼叫者提供的摘要，沒有跳過實際 bytes 核驗，其他 retain 呼叫仍自行計算雜湊。原始 JSON 拼寫、空白及位元組仍由相同 registry 保存，預算與過期機制不變。

2 項 memory-resource 測試通過；cv_runtime 基本測試 5 項通過（包括新增損壞內容／長度不符／hash 正確但 JSON 無效的拒絕及精確原始 bytes 保留），1 項既有 portable-file 測試在 saved/result 全樹相等斷言失敗。暫時恢復改動前 verification／retain 呼叫後也重現該相同斷言失敗，隨即恢復本次程式碼；未改測試以隱藏失敗。實際 Python resident inspection 測試通過，涵蓋精確產物 bytes、原圖資源重用、程序重啟、過期資源重載、崩潰／逾時及恢復。證據為 `framework-performance/native-verified-*.log`。

本次只證明移除同一 owned bytes 的第二次 SHA 運算及上述契約成立；尚未完成此版本的桌面完整週期量測，不宣稱延遲改善或 +100ms 達標。最新已量測保留版本仍為 continuous-rgba-scan，且第33張原算子錯誤未解決。


單次雜湊版本桌面驗證：`continuous-verified-bytes-{observation,execution,comparison,audit}.json`。普通連續執行33張，32張成功樣本額外耗時平均107.8012ms、最大176.9900ms；後續樣本平均105.5693ms、最大117.2610ms；6張在+100ms內。第33張保持原有算子無效座標故障。全部33份新舊保存紀錄SHA有效，result／structuredLayers／sourceBinding一致，原圖檔案／像素SHA與尺寸和初始專案一致。

每工件各節點 retainBytesMs 合計平均由1.6422ms降至1.0301ms，最大由2.3353ms降至1.5720ms，符合移除重複摘要的局部預期。nativeOther平均31.0996→30.4207ms；但unit外區段也由36.3438→34.6563ms，首張準備也不同，因此不能把整體平均約2.95ms或最大約21.82ms下降全歸因於此次改動。保留該改動；完整驗收仍為false，不能排除首張或故障來宣稱完成。


## 排除低收益前端正零寫回與原生位址索引試驗（2026-11-13）

最新保存 observation 顯示 session bridge 平均19.0173ms；一個代表樣本私有JSON解碼／解析／還原凍結共10ms，原生壓縮＋編碼6.4646ms、釋放0.9855ms，不能把這些巢狀值再加到完整週期。

僅在忽略的 framework-performance 目錄進行兩個隔離試驗，正式程式沒有改動。`benchmark-zero-normalization.mjs` 對實際4MB回應交替各100次凍結，排除parse及每次事前GC，但保留全部樣本：現行每個零寫回平均6.2503ms，僅負零寫回平均6.1992ms。逐次核對完整JSON輸出，另驗證負零正規化、overflow→null與子容器凍結。這是Node V8診斷，不是WebKit桌面驗收；約0.05ms差異不足以採用。

`shared-address-bench` 保持4096共享門檻、精確相等判定與JSON輸出，只將host-owned Value位址cache的預設雜湊換成整數混合；每版本100次交替，逐次還原並比較所有Rust JSON位元組。壓縮＋編碼＋釋放平均4.8855ms→4.8574ms，約0.03ms，未採用。完整樣本在 `zero-normalization-benchmark.json`、`shared-address-benchmark.json`；隔離程式保留以供重現。兩者均不能視為完整週期改善；最新正式桌面結果仍是 continuous-verified-bytes，完整目標未達標。


## 原圖解碼與顯示尾段的逐件時序核對（2026-11-13）

新增可重現診斷 `framework-performance/audit-presentation-tail.py`，對 continuous-verified-bytes 33組原始phase逐件配對，核對32個成功樣本 start≤input-ready≤dispatch≤return≤import≤output-commit≤visible，再保留原先兩個rAF機會與自然archive觀測。結果 `continuous-verified-bytes-presentation-tail.json`：原圖顯示解碼完成平均早於session回傳486.6875ms，最少也早427ms；因此消除這次獨立解碼未必縮短當前關鍵路徑，不能只把解碼時間從總時間扣除。此時序也不能排除資源競爭。

回傳→import平均1.4688ms，import→output commit平均5.8125ms，commit→觀測到visible平均28.75ms（最大39ms），回傳→最終觀測完成平均36.0313ms（最大46ms）。durable觀測時間與visible相同，不代表真實磁碟寫入在該刻才完成；observer對兩者採樣，不能將二者相加或縮短採樣條件來達標。首張unit內等待原圖39ms，其他工件近乎已預備完成。此為既有實測的關鍵路徑證據，不是新速度改善。

目前不直接借用raster cache的HTMLImageElement：renderer會把元素移入DOM，clear／setSource也會改寫src，與像素快取所有權衝突；若重構需明確租約和多窗格隔離，不能只傳入同一元素。更應優先評估在完整原生終態已驗證後提早發布最終顯示資料，與大結果編碼／接收重疊；必須保留停止／專案切換／run與source身分／完整結果及保存驗證，尚未實作或宣稱收益。


## 完整匯入後同步提交已準備圖像對（2026-11-13）

未採用早於完整匯入的終態顯示；改為完整native response經原有驗證／匯入、resolveNodeOutput取得最終model後，若輸入與輸出都已解碼，在同一refresh直接成對commit，省去Promise.all及第二次refresh。`readySource`只取renderer已完成的frame或最終artifact身分核對通過且decode已resolve的native preview；未解碼預覽不轉移ownership，缺任一frame仍走原有async路徑。input prepareReady核對project data／epoch及完整原圖key，重新綁定本次run／unit／execution；不借用計算raster元素，不改算子、保存時序或驗收observer。

16項圖片準備／原生預覽測試通過，含新增未驗證／decode未完成／尺寸不符不可同步取得、轉移一次、不提前發布、原圖epoch失效及本次run身分重新綁定。桌面33張證據`continuous-ready-pair-{observation,execution,comparison,audit}.json`：全部33份紀錄雜湊正確，result／structuredLayers／sourceBinding與前版相同，原圖檔案與像素SHA及尺寸與初始專案相同。第33張原有算子FAULT不變。

32張成功樣本import→output commit平均5.8125→2.8438ms，確認局部提交路徑縮短；但完整額外耗時平均109.0892ms、最大177.9543ms，後續最大122.0608ms，6張符合+100ms，相較前版107.8012／176.9900ms沒有整體改善。保留局部提交簡化以供後續時序調整，不宣稱完整性能收益；完整目標與首張等待、既有FAULT仍未解決。


## Typed report物件預留容量（2026-11-13）

Rust report_wire解析器的object已讀取且核驗宣告length，原先卻以Map::new逐次增長。改為Map::with_capacity(length.min(4096))，保持既有frame／節點／深度檢查，限制對惡意或非常大宣告的立即預留，超過上限仍可正常逐步增長。未變更Python算子、JSON產物、wire格式、數字表示、字典插入順序或重複key的覆蓋語意。

`report-capacity-fixture.py`由實際保存工件第6張的runs重建代表性report，移除Rust才填入的artifact.data，再使用正式Python native helper編碼，產生1,582,881 bytes fixture；它不是原始socket全封包capture，不可冒稱完整桌面實測。隔離Rust crate使用相同serde_json與preserve_order等特性，各版本交替200次，每次都將結果重新編碼並驗證全部位元組相同。第一次未限預留上限平均3.6552→3.1313ms；採正式4096上限再測平均3.6443→3.1269ms，中位3.6016→3.0906ms，最大8.8145→5.9698ms。全部樣本保存於report-capacity-{bounded-benchmark,benchmark}.json，程式位於report-capacity-bench。

3項封包測試通過（1項要求明確原始capture的測試維持ignored），涵蓋浮點bits與整數範圍、Unicode、錯誤tag／長度／非有限數／深度，新增0／2／17／4096／4097欄位的順序、重複key及截斷檢查。實際Python resident inspection測試通過，包含精確產物bytes與故障恢復。這是約0.52ms的局部微基準收益；尚未對這個版本重建並完成桌面批次，不宣稱完整+100ms目標達成。最新桌面正式量測仍為continuous-ready-pair。


物件容量版本桌面驗證：`continuous-report-capacity-{observation,execution,comparison,audit}.json`。33份新舊保存紀錄SHA有效，result／structuredLayers／sourceBinding／run code／parameters完全一致，原圖檔案／像素SHA與尺寸一致。第33張原有算子FAULT不變。32張成功樣本每工件reportParseMs合計平均3.8765→3.3441ms，最大4.4958→3.8939ms，與隔離微基準約0.52ms收益一致；完整樣本保存在report-capacity-parse-comparison.json。

完整額外耗時平均108.2893ms、最大192.9338ms，後續平均105.5588ms、最大125.0108ms，8張在+100ms內。前版完整平均109.0892ms、最大177.9543ms；平均稍降但首張最大變差，不能宣稱最大延遲改善或完整目標達成。保留有真實分項支持的容量預留。新增collect-desktop-comparison.py供後續一致地擷取已完成觀測及核對全部33份紀錄，包含程式與參數，沒有調整observer或驗收門檻。


## 撤回不透明計算canvas試驗（2026-11-13）

計算原圖本來先填白底再drawImage，試將getContext改為alpha:false，期望減少回讀透明通道處理。3項像素／灰階測試通過，包含透明圖白底合成；桌面continuous-opaque-canvas全部33份紀錄SHA有效，result／structuredLayers／sourceBinding／code／parameters與前版相同，原圖檔案／像素SHA與尺寸一致，第33張原有FAULT不變。

32次canvas-read合計277→259ms，首張7→8ms，沒有顯示穩定的首張收益。完整額外平均111.5516ms、最大220.1732ms，後續最大131.2625ms，較前版108.2893／192.9338ms更差；本輪其他等待也變長，不能全部歸因於alpha設定，但沒有理由保留此試驗。因此恢復原先willReadFrequently:true，未改算子或驗收方式，重新建置恢復版本。證據continuous-opaque-canvas-{observation,execution,comparison,audit}.json。正式程式基線仍為report-capacity。


## 首張並行準備的原生保存閘門基礎（2026-11-13，前端尚未啟用）

新增inspection_input_gate及verify_inspection_session_input命令。只有明確awaitInputVerification:true的file-backed Python session建立閘門；既有呼叫不建立閘門，nativePipeline拒絕使用（仍需要實際灰階pixels）。gate登記在spawn_blocking前，使用session registration生命周期、上限8個active gate、獨立Condvar；來源確認必須與該次shared.sourceBinding完整相等。拒絕、錯誤來源、取消或10秒逾時皆失敗；一次解決後不可覆蓋，session結束即移除，未知／過期確認拒絕。

execute_inspection_session在save callback實際enqueue／同步保存之前等待gate；未要求commit的session則在回傳前等待。保存已放行後不重新因較晚取消而否定已保存終態。此gate只是比對瀏覽器完成核驗的回報，自己不宣稱已驗證pixels；下一步仍需前端嚴格限制適用輸入、並行解碼、核對最終來源身分、錯誤／取消處理及fallback，不能單靠metadata跳過原圖核驗。

3項gate測試通過：waiter被相同身分喚醒、重複／過期確認、錯誤來源、拒絕、取消、逾時、普通session不進gate、nativePlan／非file-backed拒絕。8項既有inspection_commit測試通過。前端尚未設定awaitInputVerification，故目前正常桌面行為及最新實測基線仍是continuous-report-capacity；未宣稱本步有性能收益，也未完成首張並行實作。證據framework-performance/input-gate-{tests,commit-tests}.log。


保存閘門前端協議（仍未啟用runner並行）：新增native-input-verification.js，接收實際解碼核驗promise與本次完整sourceBinding快照；僅在同session／execution／unit且sequence合法的session-started後送出verify_inspection_session_input。核驗可先完成，但不能早於原生登記確認；來源不符、核驗失敗、取消或專案失效送accepted:false，確認傳輸失敗觸發取消，結果回傳後仍需確認task成功才能採用。dispose後不送遲到確認。普通沒有inputVerification的呼叫不新增await。

native-session-bridge的inputVerification選項才設定awaitInputVerification:true；目前workpiece runner尚未傳入，因此沒有改變既有正常派發次序。14項輸入閘門／preview／bridge測試通過，含先核驗後登記、等待解碼、錯誤來源、專案切換、取消、核驗拒絕、啟動失敗後遲到結果、錯誤session事件、確認傳輸失敗及既有preview所有權契約。下一步仍必須實作受限file-backed Python的待核驗metadata派發、確認前後身分比對、失敗處理與fallback，再做完整桌面驗收；目前不宣稱新延遲收益。證據framework-performance/input-gate-bridge-tests.log。


## 首張受限並行準備已接入桌面（2026-11-13）

新增pending-input-preparation的私有WeakMap capability：只允許具完整pixel SHA、合法content-addressed file assetRef、合理尺寸且無inline dataURL的目前原圖記錄；比對project／data／epoch／record指標及完整來源key，單件finally撤銷。algorithmExecutionContext／prepareAlgorithmExecution只在這個capability下允許尚無pixel cache的metadata請求；必須是compiled file-backed scheme Python，不允許nativePlan，也沒有製造假的raster。

桌面入口啟用parallelInputVerification。只有仍有未cache輸入且全為Python節點時採此路徑，正常內嵌／native／已cache路徑不變。實際ensureImagePixels仍執行並與原生派發重疊，完成後使用必須存在的真實pixels重建完整sourceBinding，與派發前身分比較再透過上一節gate確認。失敗丟棄預先派發結果，保存正常INPUT_UNAVAILABLE故障且不採用任何預先產物；專案切換不寫回舊專案。補正並行核驗期間使用者取消的處理，保存CANCELLED而非誤報整批FAULT。inputVerification.elapsedMs只作重疊診斷，不加到完整週期或排除於其外。

39項pending-input／workpiece-runtime測試通過，含既有34項實際Python逐件測試、新增capability失效／fallback、解碼未完先派發、核驗失敗正常fault及取消不採用speculative runs。3項原生gate測試通過，加入未確認waiter不可完成的檢查；最終app重新建置成功。

完整桌面證據continuous-parallel-input-{observation,execution,comparison,audit}.json：首張click後20ms派發、80ms原圖核驗完成，64ms核驗區間與native dispatch重疊。全部33份保存紀錄SHA有效，result／structuredLayers／sourceBinding／code／parameters與continuous-report-capacity一致，原圖檔案／像素SHA及尺寸一致。32個成功完整週期額外平均106.8910ms、最大170.3797ms；後續平均104.8430ms、最大124.7364ms，9張在+100ms內。原有第33張FAULT不變。相對前版108.2893／192.9338ms有改善但不保證最大值；完整驗收仍false。

此桌面批次在取消分支補正前執行，正常完成路徑相同；取消補正以新增受控runner測試驗證並重建。首張原生shared_preprocess的框架額外47.257ms，其中Python inputs-and-decode28.861ms、imports-and-environment6.931ms，顯示瀏覽器等待移出關鍵路徑後仍有原生首次解碼成本；後續應核對編解碼器初始化，不可用預跑算子或排除首張來達標。


## 基本編解碼器在環境準備時註冊（2026-11-13）

新增benchmark-decoder-initialization.py，36個全新Python行程交替測試baseline／Image.preinit加setNumThreads(1)／完整Image.init。使用實際第一張原圖，逐次核對完整BGR雜湊、尺寸、EXIF方向一致，沒有算子。baseline首次thread設定＋header＋decode＋copies平均6.5704ms；preinit準備5.4045ms、後續首次讀圖0.8537ms；完整init準備381.1041ms、讀圖1.0727ms，未採用完整init。準備時間全部另存，不能冒稱工作消失或當作桌面完整週期。

既有resident prepare加入Image.preinit()及cv2.setNumThreads(1)，不打開任何工件，不產生結果，不跑算子，正常每次執行仍保留原有thread設定。resident-preparation.py把Image.open與execute都替換成禁止執行，驗證重複準備、故意import失敗後重試、basic codec註冊次數與無檔案輸出；2項測試通過。

桌面continuous-basic-codecs-{observation,execution,comparison,audit}.json：33份新舊保存紀錄SHA有效，全部result／structuredLayers／sourceBinding／code／parameters一致，原圖檔案／像素SHA與尺寸一致，第33張算子FAULT仍在。32個成功樣本完整額外平均110.9485ms、最大163.5760ms；後續平均109.2508ms、最大118.9924ms，2張符合+100ms。首張imports-and-environment6.9312→0.0134ms、inputs-and-decode28.8605→1.5024ms，nativeOther80.0254→46.4488ms；但unit外區段48→71ms且其他樣本平均變慢，不能把全週期差異全部歸因於初始化。runtimePreparation.calls=0，準備時間109.0187ms完整保存（前一輪293.2728ms，系統時序差異不能當作本次收益）。保留有獨立fresh-process與桌面首張分項支持的基本初始化，完整目標仍未完成。


## 目前版本呈現尾段重新對齊

將 audit-presentation-tail.py 改為明確接受 observation 路徑，移除先前只適用同步原圖準備的 ready<=dispatch 假設；保留 start<=ready<=returned 與完整 dispatch/import/commit/visible 次序檢查。分開列出 inputPreparationBeforeDispatchMs 和 inputPreparationOverlappingDispatchMs，不將重疊區間相加；保留所有 incompleteRows，不把第33張故障算成成功。已對 continuous-basic-codecs 和較早 continuous-verified-bytes 記錄執行成功。這只是回溯診斷，未修改正式 observer 或週期驗收。

目前 basic-codecs 的 returnToImport 平均1.5625ms、importToOutputCommit 平均2.9063ms；commitToObservedVisible 平均35.625ms、最大46ms，returnToObservedComplete 平均40.0938ms、最大50ms。原圖顯示解碼平均早於 native 返回490.2813ms，首張核驗與 dispatch 重疊51ms。這些資料不支持再把原圖等待當主要後續瓶頸；兩次呈現觀測依然保留。

原生每工件 verification 平均7.187ms，其中實際 JSON bytes 解析4.823ms、雜湊1.155ms、retainBytes1.008ms；retainedFacts平均1.643ms。這些都是巢狀分項，不可再加到完整週期。下一步應以原生結果傳輸、驗證與保存資料流的實際分項決定優化，單靠約2ms流程圖更新不足以保證+100ms。完整目標仍未達成，未變更算子。


## 撤回 SDK 快照 list 預留試驗

檢查目前原生保存記錄確認 objects 節點 set_output 的 SDK 快照有約4ms成本。試將 native-json normalize_value 的逐項 PyList.append 改成先保留原有 Python iterator 遍歷（避免 fallback 修改輸入時改變行為），收集為預留容量的 Rust Vec，最後一次建立 PyList；未改算子、數值正規化或 trace 長序列摘要規則。

16項 native-json 契約測試通過。benchmark-normalizer-list.py 在同一 Python 行程載入基線及候選獨立 helper，各120次交替執行真實 json-artifact-corpus，每次完整比較所有輸出。基線平均3.99695ms、中位3.76315ms；候選平均4.11515ms、中位4.06873ms。較低候選最大值不能抵銷平均與中位變差，故撤回候選並重建原先 helper。證據 normalizer-list-benchmark.json；未進行候選桌面批次，不宣稱全週期改善。現有桌面驗收基線與未達標結論不變。


## 原生回覆編碼分項及根資料重用試驗

encode_session_response 新增 compactNs 與 jsonEncodeNs，均為原有 encodeNs 的巢狀分項；保留原本完整編碼、tree release 與週期計時。前端只在兩個新欄位都為非負安全整數且合計不超過 encodeNs 時採用，舊版沒有分項的回覆仍可讀。2項Rust回覆測試、8項bridge/preview測試通過，包含錯誤／缺少／超出總區段分項與舊版相容性。

重新建置後實際點擊連續執行，保存 continuous-response-parts-{observation,execution,comparison,audit}.json。全部33份保存紀錄SHA有效，結果、結構圖層、來源、算子程式及參數與basic-codecs相同，原圖像素／檔案SHA及尺寸一致；第33張原有算子FAULT未變。32個成功完整週期額外平均106.62994ms、最大154.61425ms，後續平均105.08206ms、最大123.99942ms，6張符合+100ms。這輪只增加計時，不將相對前輪的數值波動冒稱優化收益，驗收仍false。

實際 encodeMs 平均6.46388ms，其中compactMs平均4.66141ms、最大6.07804ms，jsonEncodeMs平均1.80237ms、最大2.74958ms；releaseMs平均0.76771ms。另從前輪真實保存run確認 reportParseMs平均3.41987ms、artifactReadMs0.30303ms、imageReadMs1.02550ms、worker serializationMs2.66442ms，SDK平均18.97564ms，首張program compilation合計10.22917ms。分項皆依其既有巢狀scope解讀，不重複相加。

在隔離shared-root-bench測試完全相同大型根資料重用既有fingerprint：仍做ordered recursive same核對再重用候選索引，保持既有連結生成與完整還原。使用本輪第6工件保存runs重建fixture（不是原始socketcapture），基線／候選各100次交替，逐次重新編碼還原並與原始bytes比較。基線平均3.12705ms、中位3.08460ms；候選平均3.12259ms、中位3.09308ms，輸出均57links／1567014bytes。收益約0.004ms且中位稍差，沒有採入正式shared_facts；原始完整資料核驗未改。證據shared-root-benchmark.json與隔離crate。


## 首張快照與 SDK 雜湊調查

continuous-response-parts 首張 click 到handler-start13ms、checkpoint24→33ms、unit-start34ms、dispatch40ms；首張準備仍完整計入週期。以source-session還原內容並執行既有sealProjectExecutionFacts，Node分欄快照診斷顯示canvasThreads、datasetExecutions、visualInquiry、chat是主要複製欄位；此為Node診斷，不冒稱桌面WebKit時間。這些欄位仍有可編輯狀態，沒有為降低耗時而直接共享可變資料。

嘗試SDK既有immutable bytes快照改用native-json內sha2 0.10.9及aarch64 asm。對同一3932160 bytes各200次交替計時、每次對照完整SHA-256：hashlib平均1.17618ms、中位1.158ms；native平均1.37719ms、中位1.35525ms，較慢。另獨立測量macOS CC_SHA256同一bytes200次平均1.18971ms、中位1.15792ms，沒有顯示系統替代路徑收益。未更改任何原圖或SDK hash呼叫；已移除試驗helper函數與sha2依賴、重新生成原有依賴鎖定檔及重建helper。原有16項契約測試再次通過，helper Rust原始碼與試驗前備份逐位元組相同。證據sdk-sha-benchmark.json與sdk-system-sha-benchmark.json。最新正式桌面基線仍continuous-response-parts，目標尚未達成。


## 撤回快照循環檢查容器試驗

針對JSON快照每個容器的Set查詢／加入／刪除成本，試用深度32以前祖先array.includes，深度達32再建立Set限制深層查詢成本；仍逐個複製可變容器、只共享原先sealed值，toJSON、特殊key、數值與循環語意不變。snapshot-stack-benchmark.json記錄真實source-session專案基線／候選各80次交替，每次對全部序列化資料、獨立images容器與共享immutable events核對，另驗證1／31／32／33／100層循環及深層展開後的共享兄弟容器獨立性。Node平均2.29419→1.54822ms、中位2.25229→1.52458ms。43項快照／事件／實際Python工件回歸測試通過。

完整桌面continuous-snapshot-stack-{observation,execution,comparison,audit}.json全部33份保存紀錄SHA有效，result／structuredLayers／sourceBinding／code／parameters與response-parts相同，原圖檔案／像素SHA及尺寸一致，第33張原有算子FAULT仍存在。首張checkpoint仍9ms，dispatch40→44ms；32成功樣本完整額外平均110.37281ms、最大161.02566ms，後續平均108.73885ms、最大121.66450ms，5張在+100ms內。Node微基準收益未在WebKit首張快照分項重現，完整週期也未改善，故恢復原json-snapshot.js及本試驗專用測試，再重新建置原先版本；不把Node結果外推成桌面收益。正式基線恢復response-parts，完整目標仍未達成。


## 點擊後首次編譯與前端準備並行

新增prepare-programs常駐協議與prepare_inspection_programs原生命令。只接收既有resolve_plan完整來源核對後的Python節點原始碼；限制32份／4MiB來源、8MiB編碼frame，序列化通道使用既有執行鎖及worker鎖，錯誤回覆／逾時使worker失效。只呼叫既有compiled_program，不執行使用者程式、不讀圖、不建立run或artifact，不增加worker.calls。原快取仍依精確來源bytes區分、每次實際執行重新綁定全部巢狀code filename，沒有共享globals或closure。語法錯誤不快取；發出編譯warning的來源移出預先快取，仍由正式編譯產生其實際檔名與原有診斷輸出。

桌面只在使用者點擊批次且方案／標定驗證、批次鎖成功之後呼叫，與prime input和checkpoint重疊；checkpoint之後await確認，再核對epoch／workflow revision／scheme fingerprint才寫入批次。這不是startup warmup，所有編譯等待保留在首張click-to-completion。可選準備失敗只記錄diagnostic並走原本正常編譯執行，未改算子與驗收標準。entry.programPreparation保留完整結果與時間；runner-program-preparation-start/complete保留對齊證據。

4項Python編譯準備測試通過，包括真實TCP協議、重複準備、錯誤來源後恢復、不執行有副作用程式、不生成檔案、來源／容量界限、巢狀traceback實際路徑、不同globals、warning保留。2項既有環境準備測試通過。39項既有前端／實際Python工件測試通過；另5項針對準備命令、開始早於checkpoint／派發晚於確認、epoch切換拒絕採用與釋放鎖、準備失敗仍正常實算的測試通過。cargo check與最終QA app建置通過。

完整桌面continuous-program-preparation-{observation,execution,comparison,audit}.json：33份保存紀錄SHA有效，結果／結構圖層／來源／算子程式／參數與response-parts相同；原圖檔案SHA、像素SHA與尺寸一致；第33張原有算子FAULT仍在。準備於click+18ms開始，checkpoint21→28ms，準備33ms完成，unit-start34ms、dispatch39ms。實際prepared3／rejected0／calls0，compileMs9.85517、preparationMs10.27117，未排除於完整週期。正式首張3節點compilation合計0.33688ms（前版10.22917ms），證明編譯與既有前端準備有實際重疊。

32個成功完整週期額外平均111.02898ms、最大147.74612ms；後續平均109.84456ms、最大130.19766ms，5張符合+100ms。首張相較前版154.61425ms降低約6.87ms，但後續及平均變慢，不能宣稱全面穩定改善。保留有首張分項和完整時間支持的並行編譯；正式驗收仍false，不能完成目標。


## SDK 純量葉容器直接複製

實際保存紀錄 objects 的 coherent 步驟 model_data 追蹤輸出約1.6MB，set_output平均約4ms。native-json normalize_value新增僅限exact builtin的純量葉容器路徑：字典必須所有key為exact str，全部值為None／exact str、bool、int或有限float；list／tuple同樣限定全部值為純量，使用CPython直接copy／slice／tuple-to-list建立獨立容器。巢狀或非有限值、NumPy／自訂類別與非字串key繼續原正規化；trace長序列大於1024仍走既有摘要與雜湊規則。只共享本來不可變的純量，沒有共享可變字典或陣列、沒有略過驗證、沒有改變算子。

只試字典時實際corpus交替微基準中位3.91810→3.87554ms，收益很小；加入純量list／tuple後基線／候選各120次交替，平均4.11291→3.22198ms、中位3.90267→3.19529ms，每次完整比較正規化輸出。保存normalizer-dict-leaf-benchmark.json、normalizer-leaf-benchmark.json及benchmark-normalizer-leaf.py。17項native JSON契約測試通過，新增字典／list／tuple重複引用的獨立快照、key順序、負零、大整數及異常值fallback檢查；39項實際Python工件回歸通過。QA app建置通過。

完整桌面continuous-scalar-leaf-{observation,execution,comparison,audit}.json：33份保存紀錄SHA有效，result／structuredLayers／sourceBinding／code／parameters與program-preparation相同；原圖像素／檔案SHA及尺寸一致，第33張原有算子FAULT仍在。32成功樣本每工件set_output平均4.00241→3.35972ms，SDK合計19.03214→18.34377ms，支持約0.64～0.69ms局部收益。完整額外平均109.69363ms、最大154.24067ms；後續平均108.25663ms、最大125.67054ms，4張符合+100ms。前版完整平均111.02898、最大147.74612ms，平均較低但首張最大較高，不能宣稱已改善所有週期或達成門檻。保留具獨立微基準及真實SDK分項支持的直接複製路徑，驗收仍false。


## 單次算子內浮點拼寫快取與產物核驗補強

native-json新增可選EncodingCache，僅保留最多16384個有限IEEE浮點bits對應CPython原生格式化bytes。runtime在每次算子執行內建立獨立快取，僅inspection/memory的save_json使用；不跨工件、不快取使用者容器、不改變數字拼寫或JSON產物格式。每次encode先移出cache map，再編碼與呼叫fallback，結束後（含失敗）放回；Python fallback重入期間不持有PyClass borrow，重入只影響快取命中，不影響當次輸出或造成死鎖。既有兩參數encode及無helper路徑保留。

float-cache-scope-benchmark.json是把corpus包為單一list的收益上界診斷，不是正式傳輸格式。正式獨立產物、每組新cache的float-cache-per-run-benchmark.json各100次交替、逐產物位元組比較，平均7.95290→7.07063ms、中位7.89300→7.02394ms。18項native JSON契約測試通過，包括超過容量的20000隨機float bits、反向重複、正負零、失敗後重試、重入及修改輸入不沿用舊值；39項實際Python工件測試與QA建置通過。

補強collect-desktop-comparison.py：原先run.get('code')對外部codeRef可能兩邊皆空，不能單靠那項檢查證明算子未變。現在讀取實際codeRef檔案，核對長度、SHA、codeSha256及dispatchCodeSha256，再比對保存方案及source-session原始方案的code與parameters；未包含scheme的逐件context依該批schemeSnapshot，並與有完整scheme的首件及schemeFingerprint核對。另解析ACVPAK01索引與相對payload offset，核對物理容器SHA、所有index entries的順序／連續偏移／大小／SHA與無尾隨內容，再逐份比較原始JSON產物bytes。錯誤offset、digest、size三項負例皆被拒絕（comparison-checker-negative-cases.json）。先對scalar-leaf/program-preparation重新核對通過，再使用於新版本；沒有放寬驗收。

完整桌面continuous-run-float-cache-{observation,execution,comparison,audit}.json：33份保存紀錄及code資產有效、code／參數與原始方案一致，result／structuredLayers／sourceBinding未變，原圖像素／檔案SHA與尺寸一致，所有原始JSON產物逐位元組相同；第33張原有算子FAULT仍在。每工件save_json平均8.01711→7.42239ms、SDK合計18.34377→17.73696ms。32成功樣本完整額外平均107.42117ms、最大148.55587ms；後續平均106.09425ms、最大139.49145ms，7張符合+100ms。雖平均及首張改善，後續最大反而變高；保留有獨立微基準和SDK分項支持的快取，不能宣稱每張達標。正式驗收仍false。


## 前端凍結迴圈與畫面同步分項診斷

freezeParsedJson 的 object 遍歷改為 for-in 加 Object.hasOwn，避免為每個解析座標物件建立 Object.keys 陣列；只處理 own properties，保留遞迴凍結與數值正規化。新增繼承 enumerable getter 不被讀取、不凍結繼承物件、own 巢狀物件凍結與負零／非有限值檢查；18項針對性測試通過。Node 實際還原 corpus 各100次交替平均5.11053→3.51800ms，中位3.87204→3.23208ms。WebKit continuous-freeze-loop 還原／凍結平均6.59375→6.12500ms，最大11→17ms；局部平均有改善，但最大未改善，不能由 Node 微基準推論桌面尾延遲。完整額外平均111.55891ms、最大174.03221ms，6張符合100ms；與 run-float-cache 比較33份紀錄及code／參數／原始JSON產物核驗通過，原有第33張FAULT保留。暫保留局部平均有證據的迴圈修改，未通過整體驗收。

freeze-loop 第23張 output.refresh 同步耗時44ms。為定位而將既有 resolveNodeOutput 與 frame-key 建立抽為不改語義的方法，QA observer 增加 output.resolveModel／frameKey／target、input.prepareReady／update 與 renderer.readySource。每次 refresh 前檢查 surface，替換後仍可觀測；同一 renderer prototype 不重複包裹。新增替換surface的測試，連同回傳值／receiver／例外保真兩項測試通過；QA app建置通過。這些分項彼此巢狀，不可相加為獨立週期成本。

continuous-refresh-probe 正常工具列連續執行33張，完整保存與強化比較通過：實際code資產及dispatch hash、參數、result、structuredLayers、sourceBinding、圖像身份與原始JSON產物bytes不變。output.resolveModel 最大4ms、output.refresh 最大5ms，frameKey測量為0ms（WebKit時鐘解析度內，不能當作零成本）。未重現44ms尖峰；flow.sync 在9076ms記錄49ms，但第17張8882ms開始、9436ms派發完成，尖峰與算子執行重疊，不能把49ms直接當作結尾可消除成本。該張輸出9441ms提交，下一件9449ms派發，下一張預取9467ms開始解碼，上一件9471ms才完成呈現／保存觀察；後續應量測預取CPU工作與呈現機會的干擾，而非據單次尖峰修改結果查詢或流程圖。

本輪32成功樣本完整額外平均112.37274ms、最大174.96850ms；後續平均110.35352ms、最大141.52579ms，3張符合100ms。SDK平均17.78429ms、nativeOther30.38351ms、bridge20.04869ms、unitOutsideDispatch3.875ms、outsideUnit40.28125ms。33份durable紀錄核驗通過，第33張原有算子FAULT仍在。保留完整首張、自然保存和兩次rAF觀察，acceptancePassed仍為false，目標未完成。


## 預取避開已提交圖像的呈現時段

桌面批次的 one-unit lookahead 新增 deferInputPrefetch。只有後續 speculative ensureImagePixels 等待兩次 requestAnimationFrame，隱藏視窗以50ms timer保證繼續；取消會清除frame與timer。首張prime直接準備，實際iterator.next不等待這個hint，當前工件必要的讀取／來源核驗不延遲。並非依QA observer決定排程，且未更改兩次rAF呈現驗收、保存poll、週期起訖或算子計時。預取只是挪到當前算子期間執行，沒有從完整週期扣除工作。

新增slot.retired檢查：快速工件可能在延後讀取前就已消費該slot，釋放時標記過期，避免之後再次讀取或pin舊圖；保留原有順序、取消與故障正常重試。presentation-yield、workpiece-input-prefetch及實際Python workpiece-runtime共49項測試通過，最終QA app建置通過。

正常工具列完整桌面continuous-presentation-yield及continuous-presentation-yield-final兩輪各33份durable紀錄與refresh-probe比較，實際code資產／dispatch hash、參數、result／structuredLayers、sourceBinding、原圖hash與尺寸、所有JSON產物bytes一致；第33張既有FAULT仍存在。診斷與驗收文件均保存於desktop-qa-01，匯總為presentation-yield-timing-comparison.json。

改動前32成功樣本完整額外平均112.37274ms／最大174.96850ms。候選第一輪104.45837／151.93221ms；補上slot過期檢查後第二輪103.03159／130.56679ms。後續成功工件第二輪平均102.14336ms／最大124.82317ms；兩輪各12張符合100ms。提交到呈現的平均／最大從35.28125／48ms，先降為29.78125／35ms，複測28.93750／33ms；返回到完整觀察平均41.15625→34.31250→33.31250ms。兩次桌面結果支持保留排程改動，但不能把單輪最大下降當作全域上界保證。首張仍完整計入，FAULT未排除出批次驗收，acceptancePassed=false。

剩餘尖峰：第一輪第26張objects的program-compilation階段31.06850ms，programCache entries3／hits77／misses3，並非重新編譯來源的cache miss。類似尖峰在先前輪次重現；下一步需要區分code filename rebinding、Python GC與其他階段成本，尚不能斷言由GC造成或調整其政策。


## 程式快取命中尖峰：第2代GC的直接量測

新增program_binding_gc_probe，只在實際compiled_program呼叫期間註冊gc.callbacks，固定三代計數／耗時／collected／uncollectable；finally移除callback。沒有gc.collect、disable、set_threshold，沒有改變算子、演算法時間或週期扣除方式。結果放在timing.programBindingGc，scope明確標記program-compilation內的巢狀診斷，不可重複加總或扣除。五項resident-program-preparation測試通過，含強制回收後例外的callback清理及GC設定不變；39項實際Python工件測試通過，QA app建置通過。

完整桌面continuous-binding-gc各observation／execution／comparison／audit及binding-gc-diagnostic.json記錄99次節點執行。第26張objects編譯階段28.92104ms，其中gen2回收28.70254ms，collected157881、uncollectable0；programCache仍entries3、hits77、misses3。因此這個重現尖峰幾乎全部是編譯／檔名綁定期間觸發的第2代回收，並非source cache miss。另第19張2.30987ms內gen1回收2.06213ms。這是因果定位的進展，不是已降低回收成本；下一步需分析過期執行module／namespace／SDK closure的所有權與可達性，不能直接提高門檻、關閉GC或把回收推到驗收外。

33份durable紀錄及實際code資產、dispatch hash、參數、result／structuredLayers、sourceBinding、原圖身份與原始JSON bytes均與presentation-yield-final一致；第33張原有FAULT不變。32成功完整額外平均106.73913ms、最大168.30366ms，11張符合100ms；後續平均105.35496ms。最大來自unit c91b9abf-b470-4472-835f-29b42734de72的outsideUnit97ms，該件nativeOther29.79279ms，並非上述GC尖峰所在件。故解決GC仍不足以證明每張達標，首張、圖像呈現及自然保存仍需完整驗證。acceptancePassed=false，目標保持未完成。


## 過期命名空間的循環引用與回收邊界候選（未採用）

inspect-runtime-garbage.py在獨立Python行程中以第一張原圖、三個實際算子code／參數／upstream重建執行，逐次與保存的result／structuredLayers完全比較。只在隔離行程使用DEBUG_SAVEALL與強制GC；桌面worker的回收設定未改。先執行3個工件並回收，再觀察3個工件：保留的不可達物件160743個，主要147795個list、12309個dict；有6份舊算子namespace及81個算子函數。namespace中自身globals指回該namespace的函數數量為1／26（各3份），每份直接持有的NumPy array nbytes約9.18MB／32.40MB；這個bytes數字可能包含重複array引用，不是RSS。證實函數↔globals循環會延長過期資料壽命。不能因為module被替換就直接clear globals，否則可能破壞外部仍持有的函數／類別；本輪未採取這種修改。

benchmark-boundary-gc.py比較33次相同實際工件、每次完整三節點，回收時間包含在工件wall time。這是Python-only診斷，包含request重建／deepcopy及結果比較，沒有桌面呈現、host核驗、首張冷啟動與不同圖片分布，不能當正式驗收。正常策略額外平均19.76451／最大37.35900ms；每工件開始gc.collect(2)平均28.76818／最大29.85000ms，回收平均9.48720ms。完整Python週期平均472.7933→479.8203ms。雖較小單次最大，固定增加約9ms平均成本，不採用。

另測gc.collect(1)：33次額外平均20.03490／最大20.82525ms，回收平均1.12307ms，但完整週期平均482.0912ms、最大503.15954ms，未見完整wall-time改善；結尾gen2 sweep仍需10.17979ms、回收53431個物件。不能只看扣除algorithmMs之後的差額判定改善。進一步8+8次全週期gc callback診斷（boundary-gc-timing-shift.json）顯示兩策略皆在第3／6次出現gen2回收，正常約17.95／23.07ms，gen1邊界候選約16.65／24.46ms；未消除完整回收，也未證明成本移動到特定階段，不能聲稱已證實「移到算子計時內」。所有這些試驗的算子結果／層資料均核對相同。

兩種邊界回收策略均僅在隔離腳本中試驗，沒有改動production回收策略。保留上輪programBindingGc診斷及既有預取改善；桌面最新正式證據仍為continuous-binding-gc，acceptancePassed=false。回收是已證實的其中一個尖峰來源，但一般策略改動尚無足夠收益，後續應繼續量測可消除的framework資料複製／保留與獨立native／bridge成本，不能以移動計時歸屬達成目標。


## Rust 主機配置器：隔離比較與完整桌面實測

依mimalloc Rust官方crate文件（https://docs.rs/mimalloc/0.1.52/mimalloc/）以global_allocator僅替換Rust-owned host allocations；不做DYLD preload、不攔截Python／OpenCV／foreign API配置。新增可關閉的mimalloc-host feature，確認測試後列為default；--no-default-features可回到原platform allocator。鎖檔只新增mimalloc0.1.52及libmimalloc-sys0.1.49，沒有升級其他套件。此輪實際平台為macOS ARM64，未取得Windows／Linux性能或運行驗證。

allocator-bench以同一production report_wire與shared_facts副本、實際重建的報告／完整response corpus，兩個獨立可執行檔4輪交替、各240次樣本，每次比對解析後JSON與壓縮wire的完整位元組。平均parse3.13525→2.38901ms、clone1.28963→1.20048ms、compact+encode+drop3.02628→2.47778ms；中位亦下降。資料在allocator-benchmark.json。這不是桌面或所有allocator工作負載的上界證明。5項解析／共享契約測試通過；2項需另提供capture的ignored測試未算通過，但微基準每次實際fixture byte比較皆通過。主機feature啟用下另通過2項memory_resources（身份、過期、immutable tree lease）及5項inspection_service（錯誤／依賴／取消／envelope／fact身份）測試，共12項。

正常工具列continuous-mimalloc-host完整33張，強化比較確認保存紀錄SHA、實際code資產與dispatch hash、參數、result／structuredLayers、sourceBinding、原圖身份及原始JSON產物bytes均與continuous-binding-gc一致；第33張既有算子FAULT保持。主機verification平均7.27424→6.68888ms，sessionBridge19.18213→18.12638ms，nativeOther30.36912→29.40222ms；retainedFacts反而1.61430→1.68588ms，不宣稱每一分項皆改善。

完整額外平均103.78079ms、最大154.50458ms；後續平均102.14454ms、最大145.20092ms，14張符合100ms。前版106.73913／168.30366ms含不同的呈現尖峰，不能把全部差額歸因配置器；保留有隔離及native／bridge分項證據的改動。首張、呈現、保存、fault均未排除，驗收仍false。初次feature明確啟用QA建置與桌面實測通過，以預設feature命令重建亦已成功，確認後續一般建置沿用同一配置。

本輪首張phases：handler10ms、validation14→18、program preparation19→39、checkpoint24→33、unit start40、session prepare41→46、dispatch46；完整652ms減algorithm497.49542ms=154.50458ms。後續可檢查程式準備等待與前端session preparation是否能重疊；不可把首張preflight排除或預先執行算子。


## 首張前端請求準備與編譯等待重疊（撤回）

試驗將runner的preparePrograms join延後到native-workpiece-session完成所有節點request準備後、actual executeSession前；join後再次檢查scheme／epoch／source，空批次及錯誤退出也等待準備結束，避免未計入背景工作。44項workpiece-runtime與inspection-runtime-preparation測試通過，含prepared-before-join／來源變更不派發／empty batch join，QA建置通過。

正常工具列continuous-preflight-overlap完成33張，保存紀錄、code資產與dispatch hash、參數、結果／layers、來源／原圖身份及原始JSON bytes皆與mimalloc-host相同，第33張既有FAULT不變。phases證明request準備39→43ms與program preparation23→49ms重疊，dispatch仍在49ms；前版dispatch46ms。扣除handler啟動14ms與前版10ms差異後，只早約1ms；不能由程式結構推論節省6ms。服務回覆compile9.80817ms、preparation10.43254ms，但前端觀察等待26ms；前版compile11.84658、preparation12.50417、前端等待20ms。額外IPC／排程延遲尚未定位，未主張特定原因。

候選完整額外平均105.15305ms、最大158.95695ms；後續平均103.41744ms、最大130.59746ms，16張符合100ms。雖符合張數較多，首張及平均沒有支持收益，撤回重疊與beforeDispatch hook，恢復前版等待位置。保留本輪發現的空批次修正：無algorithmRuns時以空陣列產生結果，避免未執行任何節點就TypeError；新增回歸確認準備完成後才結束空批次。恢復後3項針對性測試通過，QA預設配置重新建置成功並重啟確認QA ready。

當前一般批次的最近對應正式性能證據仍為continuous-mimalloc-host（平均103.78079、最大154.50458ms），不是被撤回候選的測量值。首張、完整呈現與保存、FAULT皆未移出驗收；目標仍未完成。


## 準備服務分項、畫面回呼間隔與輸入顯示解碼排程

prepare_inspection_programs新增commandTiming：從命令進入到worker完成，拆queue/setup/locks、plan解析、worker呼叫；compileMs與preparationMs仍是worker內的巢狀分項。前端新增clientTiming.invokeMs與有符號unattributedMs（invoke-native total），保留時鐘解析度可能出現的負值；只標成含IPC解析／排程／交付的未歸因差額，不冒稱純transport，不扣除驗收時間。4項針對性測試通過，QA建置成功。continuous-preparation-timing：invoke17ms，queue0.19796、plan0.69779、worker11.60175、command total12.49838ms，差額4.50162ms，compile10.86246ms、calls0。完整額外平均104.02410／最大150.98550ms，15張符合100ms。此剩餘差額不足以解釋大的呈現尖峰。

被動continuous observer新增最多4096筆大於25ms的frameGaps，以及每件最多16筆presentationChecks（ready／busy／pending／modelUnitId／inputImageId）。ready判定、兩次rAF、自然保存、首張與後續計時起點全未改。continuous-presentation-gaps的最大後續件兩次檢查都ready=true，但間隔79ms（tick entry gap76ms）；其他慢件有65／54ms。同步畫面span僅數ms，證明至少這些尾延遲並非配對身份暫時失配。該輪完整額外平均109.72077／最大157.18321ms、9張符合100ms，提交到呈現平均35.5／最大94ms。

追查發現onStart中的input.prepare是「目前工件的輸入顯示圖」解碼，不等同已延後的next-unit verified-pixel prefetch。onStart實際在invoke之前呼叫（不是收到session-started事件時），其非同步資產讀取及解碼可能落在前一張提交後兩次呈現之間。新增prepareInputDisplay：已有frame時用既有兩次rAF／50ms fallback讓出呈現機會；無frame立即準備。等待前後檢查signal及isCurrent，app額外確認epoch、同一surface、output模式；延後的舊surface／來源不可啟動準備。沒有提前顯示未核驗圖像，最終paired commit仍使用原驗證。19項presentation-yield／workpiece-prefetch／native-preview測試通過（取消、來源失效、首張不延後、既有preview身份等），QA建置通過。

兩輪各重啟app後正常工具列執行：continuous-display-yield完整額外平均102.41862／最大144.58416ms，後續平均101.05845／最大123.04171ms，11張符合100ms；continuous-display-yield-repeat平均103.31594／最大142.94346ms，後續平均102.03764／最大140.55729ms，16張符合100ms。提交到呈現平均／最大依序30.0625／49ms、29.375／38ms；兩次ready檢查間隔最大36／20ms，均低於前版79ms。保留具兩輪呈現分項支持的顯示準備排程，不能宣稱所有週期穩定達標。

上述每輪33份保存紀錄與強化比較皆通過：實際code資產、dispatch hash、參數、result／structuredLayers、sourceBinding、原圖身份及原始JSON bytes完全相同；第33張原有算子FAULT仍在。複測另有unit 6eb301ab-111c-48b8-9c43-b84de3536748的bridge66.81429ms：native encode5.32667／release0.34846、前端decode/parse/restore/freeze合計9ms、sentAt到前端的診斷transit51ms，顯示還有獨立於已改善呈現路徑的回覆交付尖峰。它的完整額外140.55729ms，不能從驗收移除。正式acceptancePassed仍為false，目標未完成。

## Tauri 回覆傳輸路徑實測

核對本地鎖定的Tauri 2.12.5 scripts/ipc-protocol.js及src/ipc/protocol.rs：macOS預設使用custom-protocol fetch，失敗才退回postMessage；不能僅從後者的Raw回覆分支推斷正式執行走eval。新增僅QA包安裝的ipc-fetch-observer，觀察execute_inspection_session的fetch開始、headers到達、原body reader開始／完成。保留原response、receiver、body bytes與錯誤，不額外消費body，不保存payload／headers或invoke key；非目標及未啟用觀察時保留原promise。加入promise continuation會有微小量測擾動，不能視為完全零成本。4項probe及既有frontend observer契約測試通過，QA app建置通過。

continuous-ipc-fetch重啟後正常工具列33張；觀察到33次arrayBuffer路徑，32成功件逐筆與hostResponse bytes及unit時間範圍核對。body read平均0.34375ms、最大約1ms（目前時鐘約1ms解析度）；sentAt到frontend transit平均0.96875ms、最大8ms。此輪未重現先前51ms交付尖峰，不能宣稱已修復，也沒有理由把傳輸換成另一條路徑。原continuous-display-yield-repeat尖峰與52ms rAF gap重疊，但已量測的同步span不足以解釋；尚不能歸因JS GC或OS調度。

本輪最大完整額外149.89687ms，unit 08190ff3-ad8a-4dc0-beee-741096c04323的transit僅1ms；兩次畫面身份均ready=true，相隔51ms，commit到第二次觀察73ms。自然保存和visible同在第二次tick被觀察，不能由此推論保存本身用了73ms。下一步需區分實際archive完成通知與被動tick觀察等待，及未量測的WebKit／主執行緒停頓，不能縮短驗收的兩次呈現標準。

32成功件完整額外平均103.88989ms、最大149.89687ms，15張符合100ms；第33張既有算子FAULT保留。33份durable紀錄、實際code資產／dispatch hash、參數、result／structuredLayers、sourceBinding、原圖身份與原始JSON產物bytes皆與display-yield-repeat相同。證據為continuous-ipc-fetch-{observation,execution,comparison,audit}.json及ipc-fetch-diagnostic.json。acceptancePassed=false；本輪是定位證據與QA工具進展，沒有宣稱性能改善或完成目標。

## 保存通知與呈現觀察分離，1ms併批候選撤回

updateArchiveStatus僅QA配置傳遞狀態給被動observer，記錄queue／archive／execution／unit身份、狀態、既有native timing及通知時間。通知在apply receipt及ack之後，是前端套用完成的上界，不是磁碟寫入完成的精確時間。沒有提前標SAVED、主動flush或改變兩次rAF驗收。9項前端archive／fetch probe測試通過，QA建置成功。

continuous-archive-notification正常工具列33件：32成功完整額外平均105.46794ms／最大146.98075ms，12張≤100ms；第33件原有FAULT。32成功件通知均與execution/unit身份配對，排隊平均5.97273ms、寫入19.56239ms。通知平均在第一次ready呈現檢查之後6.28125ms，durable被tick觀察在通知之後平均9.5ms（4–13ms），所有成功件durableMs==visibleMs。status的age-queue-write平均12.34702ms是寫入結束到狀態快照的近似差額，仍含未拆解的worker釋放／鎖等成本，不能當成純IPC延遲。這些額外診斷沒有從完整週期扣掉任何等待。

試驗將預設archive interval從5ms改為1ms，保留8件最大併批、記憶體上限、單worker、idle Condvar及所有保存與核驗機制。5項Rust archive契約測試通過、QA建置成功。continuous-archive-one-ms的排隊平均降至1.21877ms，寫入19.34746ms；但完整額外平均106.51740ms／最大147.57587ms，13張≤100ms，outsideUnit平均34.99999→36.21875ms。降低排隊在本輪沒有轉成完整週期收益，因此撤回interval改動；不能以改善單一分項當作完成性能目標。

兩輪各33份durable紀錄、實際code資產／dispatch hash、參數、result／structuredLayers、sourceBinding、原圖身份及原始JSON產物bytes核對一致。所有證據保存於desktop-qa-01的continuous-archive-notification、continuous-archive-one-ms檔案組及archive-notification-diagnostic.json。保留QA通知診斷，production併批等待恢復5ms；兩輪acceptancePassed均false，目標未完成。

## 凍結遍歷與雙數值座標特例：桌面不採用

實際compact wire含15960個陣列、4711個物件，先在獨立Node行程比較顯式堆疊候選。各100次交替、每次完整序列化內容核對，restore+seal平均4.52488→5.49954ms，反而變慢，未進正式程式。接著僅對兩元素皆number的陣列直接處理，仍按原規則將-0正規化為0、非有限數值轉null，凍結並登錄immutable provenance；其餘容器維持原遍歷。Node各100次交替平均5.14956→3.54269ms、中位3.95071→3.23333ms，完整內容相同。以上為同一corpus不同試驗行程，不將不同輪baseline混算。

座標候選新增涵蓋零／負零、非有限值、巢狀與其他長度陣列的回歸，18項snapshot／execution-facts／shared-facts／events測試通過，QA建置通過。兩次冷啟動正常工具列各33張：continuous-freeze-pair完整額外平均106.40662ms／最大150.63425ms、14張≤100ms；continuous-freeze-pair-repeat平均107.24006ms／最大161.14696ms、17張≤100ms。restore+freeze平均6.125／6.1875ms，對照archive-notification的6.21875ms，差異極小且最大未穩定降低（13／11ms，對照11ms）。Node收益沒有可靠轉為WebKit收益，完整週期亦未改善，因此撤回座標特例，保留通用語義回歸測試及隔離候選證據。

兩輪33份durable紀錄、實際code資產／dispatch hash、參數、結果／圖層、sourceBinding、原圖身份與JSON產物原始bytes核驗一致；既有第33件FAULT保持，acceptancePassed=false。沒有改算子、保存或呈現驗收範圍。

複測unit cc44aec6-e215-4755-a0d6-6035f2d8fa27捕捉新的回覆尖峰：native sentAt到前端33ms，fetch headers/bodyStart/bodyEnd皆11356ms（約1ms時鐘解析度），同時rAF在11355ms記錄37ms gap，該區間已量測同步frontend spans無≥2ms項目。host decode/parse/restore/freeze合計8ms；延遲發生於fetch headers回呼以前，不是arrayBuffer讀取或凍結。仍不能據此區分WebKit傳輸調度、未覆蓋主執行緒工作或GC；下一步應針對該區間取得執行緒層級證據，不再以body讀取微優化代替尖峰定位。

## WebKit 與 Rust 主機執行緒取樣

使用macOS內建sample，對當時執行中的QA host PID14491及唯一WebContent PID14494各取樣25秒、間隔2ms；後者啟動時間晚於app約0.8秒，與本次QA啟動對應。正常工具列執行完整33件，sample工具兩個session皆正常完成，報告為framework-performance/host-cycle-sample.txt與webcontent-cycle-sample.txt。這是會擾動執行的診斷輪，不是性能驗收或改動收益比較。

WebContent報告physical footprint約1.4G、peak1.8G；host406.4M、peak972.3M。WebContent主執行緒10584個取樣中，大多停在runloop等待（其中10073進mach_msg等待路徑）。Heap Collector threads的主要取樣也為條件等待，未取得可把特定停頓歸因GC的時間線。sample是彙總call graph，不能以整輪比例推論某個33ms尖峰期間在做什麼。

值得追查的實際工作：WebContent top-of-stack URLParser 28個樣本，部分可追至setJSHTMLImageElement_src→HTMLImageElement::selectImageSource→Document::completeURL；DataURLDecoder背景工作有12個base64DecodeInternal樣本；影像indexed conversion有73個樣本。Object.freeze亦可看到JSC轉換array storage及SparseArrayValueMap配置，但尚無證據支持移除凍結或變更資料語義。這些樣本不能直接相加成每張耗時或當作既有尖峰的因果證明。

原圖顯示mountInputPane仍經readImageAsset產生／核驗data URL，再由ImageRenderer解碼；verified-pixel準備則已使用binary bytes+Blob並於解碼後revoke URL。後續可檢查如何安全共用已核驗的編碼內容或解碼圖，減少第二次大型URL解析及解碼；必須保留source identity、像素核驗、舊frame生命週期及引用討論的可保存原圖，不可直接讓renderer清除仍由raster cache使用的image.src。

本輪保存session大小82,600,514 bytes，包含52份continuous QA觀察約18.08MB、186次datasetExecutions約45.87MB、25133項events約12.97MB（詳thread-sample-history-sizes.json；JSON尺寸不是heap歸因）。歷史資料完整保留，未藉刪除紀錄降低工作量。continuous-thread-sample各observation／execution／comparison／audit保存33份durable核驗，code／參數／結果圖層／來源／原圖及產物bytes一致，第33張原有FAULT；取樣擾動下32成功額外平均110.81842ms／最大255.21358ms、最大transit13ms，另有183ms rAF gap。未重現先前33ms transit，亦不能把本輪數值當成未取樣正式版性能。目標仍未完成。

## 原圖顯示改用核驗二進位 Blob URL

新增DatasetImageStore.readDisplay與Project.readImageDisplay，僅file-backed且具binary reader的原圖顯示走原始ArrayBuffer；檢查引用格式、實際byte長度、完整SHA256同時符合assetRef及contentSha256，再檢查project epoch／store generation／record identity。Blob與WebCrypto在await前分別快照同一輸入，URL不提前公開。inline原圖及沒有binary reader環境保留原read路徑。仍實際讀取與核驗原檔，沒有重用未驗證的縮圖或省略原圖完整性檢查，也沒有修改算子／Python解碼／灰階／像素hash。

mountInputPane保留一份目前準備及一份已顯示original lease；新準備不撤銷可見舊圖，只有新frame提交才釋放舊lease。過期讀取完成後立即釋放，pane destroy釋放已持有及之後返回的資源。沒有將raster cache的HTMLImageElement直接交給renderer，避免clear/destroy影響其他像素使用者。Blob URL只用於臨時顯示；「標記／詢問」先捕捉同一Blob的可攜data URL快照，再執行既有引用流程，期間專案切換仍拒絕，URL撤銷後已捕捉Blob仍可產生原始bytes一致的快照。QA phase以明確input role識別Blob來源，未改時間起訖、兩次rAF或保存驗收。

18項dataset-image-store及image-preparation測試通過，包含實際PNG bytes讀取／解碼尺寸、雜湊及長度拒絕、URL撤銷、project切換、顯示前後lease持有、過期與destroy釋放；另補引用快照在URL撤銷後仍與原始data URL完全一致的測試並通過。QA app建置及兩輪冷啟動正常工具列33張均完成。兩輪每份durable紀錄、實際code資產及dispatch hash、參數、result／structuredLayers、sourceBinding、原圖身份及JSON產物bytes與archive-notification一致；原有第33張算子FAULT不變。

baseline原圖display decode平均23.09091ms／最大66ms；continuous-binary-display平均14.06061ms／最大19ms，複測continuous-binary-display-repeat平均16.27273ms／最大60ms。保留兩輪支持的局部平均收益，不能宣稱最大解碼停頓已消除，更不能把與算子重疊的解碼減少量直接當作完整週期減少量。完整額外第一輪106.32985ms／最大173.89862ms、14張≤100ms；複測106.28979ms／最大185.93950ms、15張≤100ms，仍未通過。對照baseline105.46794／146.98075ms，不宣稱整體性能改善。

複測最大unit 706ef8f7-3bc9-4447-92a4-2d59bf270327的sessionBridge65.94812ms、outsideUnit67ms；第一次呈現檢查仍pending，之後兩次ready。這與前述獨立回覆交付／呈現停頓相符，但未證明根因。證據為continuous-binary-display、continuous-binary-display-repeat各檔案組及binary-display-comparison-timing.json。完整acceptancePassed=false，+100ms最大週期與整批正常執行的目標均仍未達成。

## 可見性與焦點排除背景節流假設

核對本地Tauri 2.12.5／tauri-utils 2.10.2設定文件：預設background throttling描述為view隱藏／最小化後的suspend策略。未直接修改此設定、作業系統優先權或電源設定。QA continuous observer僅在起點、visibility/focus/blur事件與>25ms rAF gap記錄document.visibilityState／hasFocus；結束時清除事件listener，完整週期標準不變。QA app建置通過。

continuous-surface-state正常工具列33件：起點visible且focused=true，全輪沒有visibilitychange/focus/blur變更，42個>25ms gap也全為visible且focused=true，最大72ms。這不支持把本輪停頓歸因視窗隱藏或失焦；仍不等於排除所有OS／WebKit調度。差額平均104.69194ms／最大144.41984ms，15張≤100ms。33份保存紀錄、code／dispatch hash、參數、結果／圖層、sourceBinding、原圖身份及原始JSON產物bytes核對一致，第33張原有FAULT未變，acceptancePassed=false。

surface-state-diagnostic.json對齊gap內既有phase／frontend span結束／archive notification／fetch headers回呼。具體例子：9197→9245ms的48ms rAF gap之內，9213ms收到fetch headers、9224ms完成session dispatch、9225ms完成import、9229ms開始output frame準備。6532→6590ms的58ms gap之內，6539ms收到archive通知。故至少這些完整gap不能被描述為連續的JS停止；缺少觀測事件的區間則不能反推沒有JS工作或必然GC。下一步應檢查繪圖／版面與未覆蓋的非同步流程圖更新，而不是把rAF間隔直接當成GC時間或改背景節流來掩蓋它。

## 流程圖幾何快取不再因原圖檔名失效

programFlowLayoutKey原本包含每個node.title。檢查layoutProgramFlow可知節點尺寸依kind／boundary模式／port role及設定決定，文字只在SVG固定區域截短，不進入ELK節點幾何；classification branch labels則確實保留排線空間，仍必須納入鍵。現改為id／parentId／kind／role、整體boundary模式、dependency endpoints／classification labels及原設定；同一工件方案僅換檔名、時間與狀態，仍重新渲染當前metadata但共用幾何與camera。清空title時明確使用當前undefined，不回退到cache裡舊標題。

QA加flow-layout-start（實際cache miss）及flow-layout-ready（含既有promise取用完成，不等同每次新layout）記錄。改動前continuous-flow-layout-probe在33張中33次重新排列、34次ready；前幾次新layout的可配對elapsed約22、9、9、7ms。改動後兩次冷啟動完整批次continuous-flow-geometry-cache／continuous-flow-geometry-repeat均0次新layout，正常啟動已完成的同方案幾何可供所有圖片使用。沒有預執行算子或移出必要首張影像準備；消除的是純檔名造成的重算。

新增實際ELK幾何比較與JSDOM SVG回歸：不同長度檔名的幾何相同，kind／role／boundary／parent／edge／branch condition改動仍失效；同一map的promise／geometry／camera保持，文字、狀態、點擊與清空標題更新正確。新增2項及既有5項獨立layout測試通過。原有兩個saved-workspace測試因缺reviews/2026-10-27-program-flow/actual-pi-workspace-portable.agentcv.json及actual-python-workspace.agentcv.json而ENOENT，不能宣稱整套9項通過。補充清空title案例後2項針對性測試再通過。

baseline完整額外平均104.58491ms／最大146.80133ms、16張≤100ms；候選第一輪108.81707／154.41717ms、10張≤100ms；複測106.64608／161.25379ms、10張≤100ms。原排版大多與算子重疊，不能直接把每次layout elapsed扣成週期收益。保留有直接證據的無效重排消除及幾何鍵正確性修正，但不宣稱完整性能改善；複測仍有bridge最大66.09858ms等獨立尾延遲。

三輪各33份durable紀錄及實際code／dispatch hash／參數／結果圖層／sourceBinding／原圖身份／JSON原始bytes核對一致，第33張原有算子FAULT未變。兩輪候選完整acceptancePassed=false，目標保持未完成。

## 流程圖同步 SVG 重建量測

QA frontend-work-observer新增對實際ProgramFlowMap instance的update／_render／_resize／_fit／_apply／_selection量測；flow.sync前後發現新map，涵蓋sync建立map後的promise渲染，替換map亦重新掛載。只記同步區段，保留receiver、原promise及例外；每instance只包一次。新增非同步與替換map回歸，3項observer測試通過，QA建置通過。production流程與算子未改。

正常工具列完整33張continuous-flow-render-probe，33份durable紀錄、實際code資產／dispatch hash、參數、結果／圖層、sourceBinding、原圖身份及JSON原始bytes與continuous-flow-geometry-repeat一致。32成功件完整額外平均106.33199ms／最大143.28571ms，10張≤100ms；第33張既有FAULT，acceptancePassed=false。

flowMap._render共99次，合計218ms、最大5ms；update共102次、合計225ms，兩者巢狀不可相加。44個>25ms rAF gap中最大的77／74／64ms，均未與已記錄的≥2ms _render同步區段重疊；55ms gap僅有4ms重疊。證據保存flow-render-diagnostic.json。這排除了把本輪最大整段gap直接解釋為已量測SVG建立的做法，但沒有覆蓋方法返回後的style/layout/paint或非同步thumbnail插入，不能宣稱排除瀏覽器渲染成本。後續優先追查這些未覆蓋區段及每張三次重建導致的後續版面工作，避免以小型同步微優化代替尖峰定位。最大週期與整批正常執行目標仍未完成。

## 流程圖保留未變節點與縮圖

ProgramFlowMap._render不再先清空整個SVG world。每surface僅保留當前nodeViews，依layout version／位置尺寸／種類／標題／狀態／實際顯示timing／品質／reason／imageId建立簽章；相同節點保留原group、已解碼image與未完成preview promise，選中標記仍更新。改變節點重新建立，按原順序插入並移除不再使用的節點，維持包含框→edges→leaves的堆疊順序。失敗或無效preview可在下一次render重試。換圖後過期group斷開，舊回呼不可把錯誤圖片插入當前圖；空流程清空cache。沒有快取或改動算子輸出，沒有省略正常狀態更新。

3項幾何／DOM測試通過，新增驗證pending promise及SVG image身份保留、只改其他節點不重新載入縮圖、焦點及選中標記、點擊、換圖與過期回覆、清空流程，以及重用結果與強制完整重建後innerHTML一致。額外flow-execution-timing與flow-visual-grammar測試無法載入：分別缺codex-audit-logs/20261030-cards-mapping-stability/native-session-readonly-snapshot.json及codex-audit-logs/20261029-failure-repair/pi-mapping-closure/turn4/completed.agentcv.json，不能宣稱整套通過。QA建置成功。

兩次冷啟動正常工具列33張continuous-flow-node-reuse／continuous-flow-node-repeat，每輪33份durable、code資產／dispatch hash、參數、結果圖層、來源身份及JSON原始bytes與continuous-flow-render-probe完全一致。第二輪執行中實際截圖確認原圖、overlay輸出及流程圖縮圖顯示；仍以每件匹配影像兩次rAF加自然保存量測完整週期，沒有刪除歷史或改變首張起點。

baseline 99次_render共218ms／最大5ms；候選兩輪同為99次但合計174／168ms，最大6／5ms。局部同步總工作減少約20–23%，保留此改動，但不能把每輪節省直接轉為完整週期收益。完整額外第一輪平均103.29499ms／最大152.41983ms，15張≤100ms；複測105.88232／158.58587ms，11張≤100ms。複測bridge最大65.91875ms、outsideUnit最大74ms，最長rAF gap82ms，仍有獨立尾延遲。原有第33張FAULT不變，兩輪acceptancePassed=false；全體正常與最大+100ms目標未完成。

## 一般回呼間隔與預覽解碼時間線

針對continuous-flow-node-repeat最大bridge的afabaa2d-b640-40db-b750-e323cec5077a：native response transit47ms，fetch headers5960ms、bodyEnd5961ms，host decode/parse/restore合計9ms，rAF5909→5991間隔82ms；不能解釋為body讀取或JSON解析47ms。QA新增10ms setInterval心跳（僅記>25ms間隔、上限4096、finish即clear）及preview-decode-start／ready phase，不改production預覽決策。8項native-preview-prefetch測試通過、QA建置成功。

正常工具列完整33張continuous-preview-heartbeat，保存紀錄／code資產及dispatch hash／參數／結果圖層／sourceBinding／圖像身份／JSON原始bytes全與前輪一致。完整額外平均110.21893ms／最大219.45854ms，5張≤100ms，第33張原有FAULT；額外計時器可能擾動排程，本輪不當作優化收益比較，也不宣稱無觀測成本。

捕捉41個一般timer gap，最大14670→14763ms共93ms，與rAF14650→14764ms的114ms gap重疊。該區間沒有已記錄的≥2ms同步frontend spans；preview已於14649完成解碼、輸入與輸出於14650提交，archive通知14765才被觀測到。故至少此例並非單純rAF較晚而一般計時器照常，但仍不能區分JS未覆蓋工作、style/layout/paint、GC、記憶體壓縮或OS排程。另一個timer60ms gap內有多個phase，不能將整段統稱凍結。詳preview-heartbeat-diagnostic.json及原observation。

批次結束後主機快照：16GB機器約15GB used，compressor5608MB、unused858MB，swap0；當時CPU約81%idle。這是事後快照，不能證明尖峰時CPU或記憶體壓力，也未關閉其他應用或刪除歷史。後續需要將資源／執行緒證據與尖峰同步，或測量減少主動執行期記憶體分配的候選；目前沒有證據支持放寬呈現與保存驗收。目標未完成。

## 同步程序與記憶體資源取樣

本機沒有xctrace（xcrun找不到工具），改用本地SDK宣告的host_statistics64與proc_pid_rusage(RUSAGE_INFO_V2)實作獨立C取樣器sample-resource-timeline.c。每20ms讀取全機壓縮／解壓縮／swap及WebContent CPU／resident／footprint／pagein／diskread計數，以CLOCK_REALTIME毫秒對齊QA startedAt，CLOCK_MONOTONIC量測探針時間。只讀、未要求root、不改其他程式或優先權；45秒取樣完整覆蓋17.510秒批次。已核對當時host PID21547及同時啟動的唯一WebContent21550。clang -Wall -Werror編譯通過。原始resource-timeline.json保留；其中webUserNs/webSystemNs欄名誤標，值實為Mach ticks。修正版本為resource-timeline-corrected.json及resource-timeline-diagnostic.json，見下方校準更正。

平均單次讀取0.03860ms、最大1.424ms，外部樣本間隔最大25.525ms。這是同一app後續暖批次並附帶診斷，不與冷啟動作收益比較。continuous-resource-timeline完整33份durable紀錄／code及dispatch hash／參數／結果圖層／sourceBinding／圖像身份／JSON原始bytes核對一致；32成功完整額外平均108.85139ms／最大188.97395ms，9張≤100ms；第33張既有FAULT，acceptancePassed=false。

最大timer gap6251→6333ms共82ms，最近包圍樣本6236.977→6353.074ms中全機compressions增量0、decompressions7頁、swapin/out0；經本機125/3 timebase修正，WebContent user增加113.52692ms、system92.96238ms，合計206.48929ms（程序所有執行緒總和，區間116.097ms），pageins與diskread均0。外部探針仍每約21–25ms獲得樣本，因此不能把它描述為全機同時停止82ms。另兩個61／60ms timer gaps包圍區間壓縮解壓縮均0，WebContent CPU增量修正為73.05225／82.74621ms。這些區間有顯著CPU活動，不能排除計算或GC；程序級計數不是主執行緒堆疊，包圍區間也比gap長，仍不能歸因特定工作。49ms另一gap伴隨2586頁全機解壓縮，不能把全機計數直接歸因本app。

原先依錯誤單位判斷「低CPU、優先查等待」已撤回；後續須按執行緒定位CPU工作，不任意改收集策略。框架最大+100ms與全批正常仍未達成，算子與驗收口徑未改。


## 更正 proc_pid_rusage CPU 計數單位

發現45秒樣本的原始user+system增量僅約142M，而實際前端同步工作已超過此數值若當奈秒的範圍，因此新增calibrate-rusage-clock.c做獨立可重現校準。使用CLOCK_PROCESS_CPUTIME_ID控制250ms忙迴圈，同時量測RUSAGE_INFO_V2原始user/system及mach_timebase_info：實測process CPU250001000ns、原始計數6000227、timebase125/3，換算250009458ns，誤差約0.0034%。這直接證實本機原始欄位為Mach ticks而非ns。

sample-resource-timeline.c升schema v2，欄位明確命名webUserTicks/webSystemTicks，記錄timebaseNumer/Denom，不再暗示已換算。原始v1證據保持，另產生corrected版本與重算診斷。上述82ms gap包圍區間的CPU應為206.48929ms；先前約5ms及「同步CPU工作不支持」的推論是換算錯誤，已在原段落修正並撤回，不作下一步決策依據。全機壓縮／swap、外部樣本間隔及完整週期量測不受此更正影響。下一步以已校準單位量測各執行緒，區分GC、渲染及其他CPU工作。應用與算子本輪未改，沒有新增性能收益聲稱。

## 唯一執行緒 ID 同步 CPU 量測

新增sample-thread-timeline.c；先用CLOCK_THREAD_CPUTIME_ID控制250ms忙迴圈，核對proc_threadinfo的user+system原始增量250010000，對照250.006292ms，證明此介面以ns表示，不能套用proc_pid_rusage的125/3換算。普通PROC_PIDLISTTHREADS回傳的handle不能完整涵蓋WebKit非pthread執行緒，初次試取發現空／不完整清單即停止，未拿來作批次分析。依Apple XNU proc_info_private.h的PROC_PIDLISTTHREADIDS=28及proc_info.c的thuniqueid路徑，改用唯一ID配PROC_PIDTHREADID64INFO；本機讀取成功，觀測最多20執行緒，包括JSC Heap Collector／Heap Helper／JIT／libpas scavenger。這是獨立只讀診斷工具，未加入產品依賴。來源：https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info_private.h 、https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/proc_info.c 。

45秒外部20ms取樣覆蓋continuous-thread-timeline暖批次17495ms。33份durable紀錄、code與dispatch hash、參數、結果圖層、sourceBinding、原圖身份及JSON產物bytes一致。32成功完整額外平均111.44106ms／最大205.10900ms，5張≤100ms，第33張既有FAULT，acceptancePassed=false。僅為診斷，不與無取樣冷啟動作性能收益比較。

最大timer gap5350→5455約105ms，包圍樣本5330.569→5471.930ms內Thread1097299 CPU增量70.580ms，JIT Worklist Helper2.835ms，其餘已捕捉執行緒各<0.5ms。批次後單獨sample一秒確認同一Thread1097299為com.apple.main-thread（thread-identity-sample.txt），該事後堆疊只用作身份，不當成先前尖峰的堆疊。另一50ms gap包圍樣本1692.632→1758.740ms，主執行緒CPU65.170ms，支持主執行緒有顯著未歸因工作。

105ms gap內5409開始preview decode、5411收到fetch headers、5424完成dispatch、5428 import、5441結束view.render、5451派發下一件；所以不能把整個gap稱為連續凍結。主執行緒可能包含JS、同步GC、style/layout/paint或其他回呼，僅thread counter仍無法區分；新生／退出執行緒的CPU差值也只涵蓋首末可見樣本，不能以零增量證明未工作。原始thread-timeline.json、校準thread-clock-calibration.json與分析thread-timeline-diagnostic.json已保存。下一步應取得尖峰附近主執行緒堆疊，而非繼續假定主要是等待。

取樣器每次列舉及讀取平均0.08744ms，最大17.236ms；最大值不可忽略，可能同樣受排程或查詢等待影響，也提醒此輪有探針擾動，不能據此宣稱production最差時間就是205ms。此次沒有產品或算子修改，目標仍未完成。

## 一秒堆疊視窗與側欄欄寬候選（待複測）

以sample-stack-windows.py連續取得38個一秒、1ms取樣視窗，45.020秒，主機WebContent PID21550；每份保存command wall起訖與原始sample報告。command起訖包含symbolization，不能當成所有樣本精確時間。正常工具列continuous-stack-windows完整33份強核驗一致，第33張FAULT；診斷額外平均120.41128ms／最大275.54255ms，取樣擾動明顯，不能作收益基準。

timer gap111ms落在window13 command範圍；82ms在14，76/67ms在27，60ms在20。window27主執行緒出現LocalFrameViewLayoutContext::layout／performLayout的44個巢狀樣本，RenderGrid intrinsic track sizing子樹29個，內部還有InlineFormattingContext minimumMaximumContentSize與文字量測。這是約一秒彙總，不證明全部76ms gap由layout造成；嵌套樣本不可相加成耗時。抽取main-13/14/20/27.txt及stack-windows-diagnostic.json保留。取得了實際Grid／文字排版路徑，可用來挑候選，不再僅按thread CPU猜測GC。

檢查CSS，agent-panel為grid但沒有顯式column，位於外層固定330px（窄窗290px）工作區欄。新增grid-template-columns:minmax(0,1fr)候選，讓已分配的寬度決定欄寬，避免implicit auto track的內容最小寬度參與；不改字體、內容、圖片或外層側欄寬度。備份workspace-layout-before-agent-column.css，QA建置成功。尚未證明上述layout堆疊具體來自側欄，這是待驗證假設。

冷啟動、不帶外部sample的continuous-agent-column，使用與continuous-preview-heartbeat相同QA設定（含10ms heartbeat），33份durable／code及dispatch hash／參數／結果圖層／來源及圖像身份／JSON原始bytes一致。完整額外平均103.48018ms／最大140.80888ms，15張≤100ms；原有第33張FAULT，acceptancePassed=false。相較heartbeat baseline110.21893／219.45854ms下降，但單輪波動不足以宣稱確定收益。候選目前保留於worktree，下一輪需冷啟動複測及檢查正常影像與側欄版面；若未呈現可靠收益則撤回。最大+100ms目標仍未達成。

## 側欄欄寬候選複測後撤回

continuous-agent-column-repeat冷啟動正常工具列33張，完整額外平均107.15317ms／最大172.92996ms，16張≤100ms；33份durable、code及dispatch hash／參數／結果圖層／sourceBinding／原圖身份／原始JSON bytes與baseline一致。批次中截圖可見成對原圖與overlay、正常縮圖、側欄長文字及輸入框，未出現欄寬溢出或圖像消失。第33張原有FAULT仍在，acceptancePassed=false。

候選第一輪103.48018／140.80888ms，複測回到107.15317／172.92996ms，尚無足夠穩定收益，也不能證明取樣的intrinsic Grid熱點就是agent-panel。因此撤回workspace-layout.css的單一候選規則，確認該檔與原版一致，重新建置QA app成功並啟動至QA ready；未更改算子或其他已驗證優化。保留兩輪證據，不將其列為已完成的性能修正。

另讀app.js確認正常連續執行working分支早退至requestExecutionViewUpdate，沒有在每件進入下方renderChat重建整段對話的路徑。不能僅憑長對話或Grid堆疊斷言每張都重畫對話；下一步應定位實際更新中的nested Grid與圖像視窗，而不是重複針對側欄猜測。目標仍未完成。

## 圖像 viewport containment 候選撤回

檢查node-output-gallery共用row subgrid、image-renderer flex viewport及其絕對定位圖片／工具列後，曾限定普通雙欄視窗加入contain:strict；最大化dialog不在此選擇器範圍。目的是阻止視窗內部更新參與外層intrinsic sizing，並非更動圖片、畫面驗收或算子。備份node-output-before-viewport-containment.css，QA建置成功。

冷啟動正常工具列continuous-viewport-containment完整33份durable／code及dispatch hash／參數／結果圖層／sourceBinding／圖像身份／原始JSON bytes核對一致；實際截圖輸入與輸出仍有完整尺寸，最後一張原有FAULT不變。完整額外平均106.95765ms／最大209.36263ms，11張≤100ms，沒有足夠收益。

最慢unit317a64c9-cee1-46e9-80cc-bd1188ffbcb3的bridge22.26983ms、transit3ms，但outsideUnit129ms；兩次已ready的presentationChecks為9747與9850ms，相隔103ms。可見仍存在呈現機會間隔尖峰，不能以此候選宣稱修好Grid成本，更不能跳過第二次呈現檢查。撤回此條CSS，恢復原node-output-view.css；不保留無效候選。目標仍未完成。

## 歷史快照與觀測器自身成本排查

重新fetch確認Side/main為efe1679，包含47afb08；工作區修改保留。上一個僅確認倉庫與啟動的回合沒有性能進展。本輪先檢查AppSession：執行中beforeCapture與capture均有working保護，沒有證據支持連續執行時反覆序列化完整工作階段。

新增可重跑診斷framework-performance/profile-restored-snapshot.mjs，以last-session.json重建sealProjectExecutionFacts與QA歷史immutableJson規則，再量projectSnapshot。輸出restored-snapshot-profile.json：datasetExecutions約51,157,582 bytes，但2662個不可變子樹共享，實際可變容器4441；7次Node完整快照為6.158、4.437、3.109、2.891、2.880、2.874、2.836ms。這不是WebKit驗收，也不證明沒有GC影響；不能由序列化檔案大小推論每次checkpoint複製51MB。沒有凍結仍需被archive更新的batch或刪除歷史。

在QA continuous observer增加自身tick計時，包含getBoundingClientRect可能強制的同步layout；不改任何ready條件、兩次呈現機會、算子分母或自然durable保存規則。建置成功，冷啟動正常工具列continuous-observer-cost。1035次tick合計35ms、最大8ms，唯一≥2ms tick在597ms開始。64ms rAF間隔為597→661ms，即此8ms不足以單獨解釋整段間隔；最大86ms間隔亦沒有≥2ms觀測tick。這排除了「本輪全部長間隔都是觀測器同步檢查耗時」的解釋，但並非證明觀測完全零擾動。

33份durable紀錄、實際code資產與dispatch hash、code參數、結果圖層、sourceBinding、圖像身份及原始JSON bytes全部核對通過。32份完整成功觀察額外平均105.64463ms／最大189.43938ms，15張≤100ms；首張outsideUnit108ms。最後一張原有StructuredLayerContractError仍存在，整批驗收false。沒有更改算子，也沒有把本次診斷宣稱為性能改善。下一步應返回首張呈現與native/bridge成本的具體路徑，不能再僅由歷史大小或觀測rAF間隔猜測主因。

## 原生成本定位與檔名重綁循環垃圾修正

新增framework-performance/profile-native-budget.py，讀取33份SHA核對過的durable紀錄，輸出各nested timing的平均、最大及對應unit，明確不相加重疊區間。native-budget-observer-cost.json顯示JSON產物解析平均4.75062ms、最大5.21946ms；objects的model_data單一產物約1.49MB，其他四份總量僅約0.22MB，簡單跨產物平行解析無法消除主項。編譯／重綁最大31.03754ms，其中gen2 GC30.74683ms；set_output最大19.66000ms。

檢查compiled_program發現其遞迴區域bind函式捕獲自己，每次呼叫留下function/cell循環。改成模組級bind_program_filename，仍逐層重綁所有CodeType的co_filename，沿用原有快取、常量及新exec namespace語義。沒有修改算子、GC啟用狀態、threshold或安排額外collect。隔離測試暫停自動GC以觀察垃圾，100次原版產生400個待循環回收物件（其中100個bind函式），修正後0；證據binding-cycle-comparison.json。新增重綁不留循環垃圾測試；resident-program-preparation 6、cv-runtime-memory 10、resident-preparation 2全部通過。

QA重建成功，冷啟動正常工具列continuous-binding-cycle。33份durable/code實際bytes及dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes全部一致。成功32份完整週期額外平均104.39186ms、最大167.97509ms，15張≤100ms，第33張原有FAULT不變，驗收false。

此輪同一unit ce0ec159-42ba-4e4f-a8ba-c082f11da5cc仍有gen2 GC32.05350ms，不能把最大額外耗時189→168ms的單輪波動歸因於修正。保留消除可證實循環垃圾的框架修正，但它沒有解決主要回收尖峰。set_output最大19.83929ms仍在同一unit 3e5cb763-f600-4c41-aa5c-1bbbbc21da4d；這提供可重現的資料相關路徑，後續應檢查該輸出的trace normalization，而非直接調GC政策。整體目標仍未完成。

## set_output 尖峰的實際 GC 歸因

前輪為有進展：消除框架遞迴bind閉包垃圾，且完整批次揭示主要尖峰仍在。本輪比較普通unit與3e5cb763-f600-4c41-aa5c-1bbbbc21da4d的procedureTrace輸出：coherent/model_data約1.58MB與1.62MB，均無長sequence摘要，不支持「只有該張多了巨大摘要雜湊」的假設。

新增隔離診斷profile-trace-normalization.py，讀33份核對SHA的保存port值，不執行算子，以正常GC策略重做trace_value三輪並核對結果相等。trace-normalization-profile.json可見normalization確實可觸發gen2回收；其中120ms案例因診斷同時持有全部33份大樹，不可當作桌面實測，也不證明原20ms尖峰的原因。

因此增加program_execution_gc_probe，gc.callbacks只記錄實際collection的generation/ms/collected及當時exclusive SDK service；user callback以SDKClock.user的depth=0正確標為null。記錄最多256筆，不改GC政策，不額外collect，也不扣減或移轉任何algorithm/sdk週期時間。callback在finally移除。新增測試驗證SDK與user callback歸因、例外cleanup、GC threshold與enabled狀態不變；program-preparation 7與memory 10測試通過，QA建置成功。

正常工具列冷啟動continuous-sdk-gc：33份durable、code資產/dispatch hash、參數、結果圖層、sourceBinding、圖像身份與raw JSON bytes全部核對一致。32份完整成功觀察額外平均103.09102ms／最大162.30145ms，20張≤100ms；第33張FAULT仍在，驗收false。此為診斷回合，不宣稱性能改善。

sdk-gc-collections.json確認同一unit 3e5cb763-f600-4c41-aa5c-1bbbbc21da4d的objects/set_output總25.17225ms，其中gen2 collection22.69067ms、collected153684、uncollectable0。因此這次SDK尖峰主要來自回收，而不是trace normalization固有計算量。另有user-code內gen2 29.14721ms、21.69875ms等，仍自然包含在原算法計時；不得把SDK回收挪入算法分母來達標。需要降低真正的生命週期／分配成本，不能僅把GC安排移出計時或清空可能仍被使用者函式引用的globals。目標未完成。

## 常駐傳輸暫存物的生命週期修正

上一輪實測確認SDK set_output內gen2回收；本輪檢查serve發現report bytes、images、artifacts、data等傳送區域變數在channel.flush後仍由長駐迴圈持有，直到後續請求才逐步覆蓋。將原傳送流程原樣抽出send_resident_result，使傳輸暫存引用於函式返回時釋放；serve在送完後清除payload/request/encoded額外引用。沒有清空使用者module globals、沒有更動resident artifacts/decoded/originals快取或Windows mapping下一請求確認後關閉的生命週期，也沒有修改算子或GC政策。

新增resident-transport-lifetime.py真實socket協議測試：fake執行產生可弱引用report及實際report/artifact/preview bytes，主機完整讀取，再發prepare-programs而不執行新算子，檢查report已釋放且下游artifact快取仍可讀。舊迴圈版本在reportReleased斷言失敗，新版通過（transport-lifetime-regression.json）；此證據只證明框架多餘引用釋放，不宣稱使用者globals引用中的大型報告也會立即消失。transport 1、program-preparation 7、memory 10測試全部通過，QA建置成功。

冷啟動正常工具列continuous-transport-lifetime：33份durable紀錄、實際code資產/dispatch hash、參數、結果圖層、sourceBinding、圖像身份與raw JSON bytes全部核對一致。32份完整成功觀察額外平均104.33581ms／最大153.08612ms，12張≤100ms，最後一張原有FAULT不變，驗收false。

同一unit 3e5cb763-f600-4c41-aa5c-1bbbbc21da4d仍在set_output內gen2回收153684物件、24.19438ms。故保留已證實減少額外引用持有的修正，但不能歸因單輪max162→153ms波動，也不能稱其解決GC。主要未解項仍是執行環境循環垃圾、原生與bridge固定成本及呈現尾端尖峰；目標仍未完成。

## SDK JSON 編碼兩個候選撤回

上一輪有進展：縮短常駐傳輸暫存引用生命週期並完成批次核對。本輪轉查固定SDK編碼成本；對一份實際coherent/model_data計數，75959個float、10988種bit pattern，現有16384上限足以覆蓋；另有22123 lists、2065 dicts。沒有證據支持直接擴大float cache。

新增framework-performance/bench-json-key-scan.py：取SHA核對的durable紀錄內真實model_data，每輪新建per-run float cache，正常GC策略，100次SDK編碼逐次與Python原有fallback的完整bytes比對。固定1485260 bytes、SHA256 7e25c7452353e7779e0e6c439e68ebe94cee2e9febf86c1590b3a43f5ef03fa0。

原版json-key-scan-before平均4.66376ms／median4.64506ms。候選一以dict.iter驗證字串key，消除dict.keys建立暫存Python list，平均4.62676ms／median4.60575ms。候選二單獨將float spelling從Vec改為inline32bytes（長文字仍完整輸出，只不快取），平均4.62066ms／median4.60394ms。兩次18項native-json-contract均通過，所有100次bytes一致，測量區間沒有GC collection；但僅不足1%差異，沒有足夠收益值得保留額外候選。

已撤回兩候選，重建原編碼器成功。json-key-scan-restored平均4.65910ms／median4.66994ms，完整bytes仍一致。重新核對lib.rs SHA與上一個已驗證desktop app bundle的build-receipt完全相同。因此未保留未證明收益的編碼修改，也未為微小隔離差異宣稱整體週期改善。本輪未重做桌面完整批次；最近有效桌面結果仍為continuous-transport-lifetime平均104.33581ms／最大153.08612ms、驗收false。目標未完成。

## 呈現等待與首張工具列成本定位

上一輪已測兩個JSON候選並撤回無足夠收益的修改。本輪重讀presentation-yield、prefetch與renderer：兩次rAF延遲只用於speculative input preparation及input display準備，沒有在最終輸出commit後再串接相同等待。continuous-transport-lifetime-presentation-tail顯示輸入顯示在native返回前平均481.625ms／最少448ms完成，commit至兩次呈現驗收平均28.4375ms／最大33ms；不能把這些準備等待全算成串接尾端成本或移除兩次呈現驗收。

該輪首張handler-start前21ms尚未細分。新增Node診斷profile-toolbar-compile.mjs及profile-first-validation.mjs：Node冷啟動各子段不穩定，不能據此聲稱WebKit schema編譯需30ms，亦沒有改成跳過工具列校驗。QA frontend-work-observer增加compilePurposeScheme、validatePurposeScheme、syncCanvasConsultations包裝，3項receiver/promise/exception與動態wrapper測試通過，建置成功。

冷啟動正常工具列continuous-toolbar-spans實測：handler-start11ms；compilePurposeScheme共8ms，其中validatePurposeScheme5ms、syncCanvasConsultations3ms；checkpoint8ms；runner-unit-start37ms。這些都是nested spans，不能重複相加。33份durable紀錄/code資產與dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes一致，成功32份完整額外平均103.81821ms／最大144.80262ms，15張≤100ms；第33張原有FAULT不變，驗收false。

本輪只增加QA診斷，沒有生產執行路徑修改，也不把單輪max變動當成改善。syncCanvasConsultations目前即使不新增卡片，仍ensureProjectCanvas後clone完整visualInquiry，可研究保留相同行為的lazy copy；需實測收益與卡片/undo語義測試，不能跳過真實校驗或將首張起點往後移。目標未完成。

## 諮詢卡同步改為需要寫入才複製

上一輪有進展：量出首張compilePurposeScheme中的syncCanvasConsultations成本。本輪修正canvas-project-model.js：已有專案畫板時直接prepareProjectCanvases驗證，避免ensureProjectCanvas產生隨即丟棄的detached回傳；先查已有consultation卡，已有者不再掃描datasetExecutions建完整inspectionCardContext；收集真正缺少且有待詢問問題的來源後，才clone visualInquiry，沿原順序計算避讓位置並一次commit。缺少畫板時仍走原建立路徑，方案校驗及畫板引用驗證均保留。

新增canvas-consultation-sync.test.mjs兩項：多來源缺卡時一次建立、避讓、無重複、單一undo邊界及redo完整復原；已有卡片時不讀取執行歷史，無效原件引用仍拒絕。兩項通過，workpiece-runtime全部40項通過。舊canvas-project-model整組依賴缺少的reviews fixture，本輪未據此聲稱該組通過。Node saved-project profile同步部分由前輪0.49–2.60ms降到0.016–0.339ms，僅作診斷。

QA重建成功，冷啟動正常工具列continuous-consultation-lazy。33份durable/code資產與dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes全部核對一致。桌面syncCanvasConsultations一次1ms（前輪3ms），compile總3ms（前輪8ms，其中validation亦由5變2，不能全歸因本修正）。handler-start4ms、runner-unit-start26ms；首張仍從click0開始計時。

成功32份完整額外平均105.27657ms／最大151.71400ms，12張≤100ms，最後一張原有FAULT不變，驗收false。保留有局部證據、減少無效複製與歷史掃描的修正；不把前置局部下降宣稱為整體達標，也不能以單輪總體波動推論已改善峰值。目標仍未完成。

## 回收與主機回傳重疊的可行性邊界

上一輪已修正諮詢同步並完成42項測試/桌面批次。本輪確認resident_worker所有操作由WORKER mutex串行，execute_inspection_session在native graph完成後才compact/encode response，瀏覽器又有decode/parse/restore/freeze。因此背景回收若不帶等待完成的回執，可能漏算尾端或把等待推至下一件，不能這樣驗收；未更改生產協議或GC策略。

新增framework-performance/benchmark-tail-gc.py，重播實際33張原始code/參數/inputs/upstream，檢查status、result、structuredLayers（包含故障時欄位是否缺失）一致。兩種模式均使用普通GC策略，候選額外在每件尾端collect(2)，完整計入elapsed與overhead，不假設任何重疊。測試只在隔離Python程序執行，不影響桌面worker。

第一版持有33份完整durable reports，包含全部大型procedureTrace，得到tail GC約129.69ms；這是診斷額外存活堆的干擾，不能套用桌面環境。原證據另存tail-gc-feasibility-full-fixture-heap.json。修正為只保留重播/結果核對所需欄位，去除原紀錄procedureTrace等非必要大樹後重測。

有效隔離結果tail-gc-feasibility.json：ordinary Python-only額外平均22.30657ms／最大25.80729ms；tail-full-gc平均32.47534ms／最大34.53688ms。GC平均11.02824ms、最小9.86458ms、最大11.88458ms。此測試仍持有核對資料，不是桌面驗收；它明確顯示直接串接GC平均多約10.17ms，不能保留這種直列策略作為加速。

現有continuous-consultation-lazy的browser bridgeTimeline中session-completed事件到completedMs平均15.875ms、範圍11–29ms。事件遞送不等於worker實際完成起點，因此不是可直接扣除的可用重疊時間，只支持設計有完成回執、保留序列鎖、timeout/cancel與身份核對的候選，並在完整週期結束前等待回收完成。下一步若實作需實測重疊及全33資料一致性；不把回收移出算法/框架計時分母。本輪無生產修改，最近完整驗收仍continuous-consultation-lazy 105.27657／151.71400ms、false。目標未完成。

## 帶完成回執的回收重疊候選（僅 QA 啟用，未推廣）

前輪已界定直接串接collect(2)增加成本。本輪實作候選：native graph/保存佇列准入完成後，以resident_worker既有序列鎖及同一channel送collect-garbage，背景工作只針對已核對PID/call的worker；主機可同時compact/encode回傳。runtime_maintenance維護最多8張、60秒過期ticket，await命令核對完整reference、單次取用、等待完成或傳遞錯誤。Python回執綁定id/pid/last_run_call；錯誤身份不執行回收。沒有改算子、沒有disable或改GC threshold。

native-session-bridge在解析到ticket後啟動await，繼續restore/freeze，之後必須收到operation/id/pid/call及gcMs有效的回執，才complete預覽與return結果。等待成本保留於dispatch/bridge，回收不得移到完整週期外。QA VITE_INSPECTION_QA=1才自動請求候選；一般版預設不請求。維護錯誤使本次結果不發布，不能假裝成功。

驗證：Rust cargo check通過；runtime_maintenance兩項測試驗證錯身份不消耗ticket、單次取用及worker錯誤；JS兩項新增測試覆蓋binary/ordinary結果的真等待、錯unit/stale receipt/失敗不發布，加既有input-gate六項共8項；真實socket測試覆蓋錯call拒絕、正確回執及既有產物快取保留。共11項通過，QA建置成功。

冷啟動正常工具列continuous-maintenance-overlap：33份durable/code資產與dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes全一致。另逐一核對全部33件（含FAULT）maintenance receipt與unitId及最後實際run resident PID/call一致；程序執行期SDK內gen2 collection為0。

成功32份完整額外平均106.87911ms／最大166.47100ms，13張≤100ms；第33張原有FAULT不變，驗收false。GC平均12.09098ms／最大14.11625ms；roundTrip平均12.31127ms／最大14.35117ms；browser joinWait平均0.375ms／最大2ms。SDK額外最大19.02267ms（前輪48.84466ms），證明重疊回收壓低該SDK尖峰，但session bridge平均20.60413ms、outsideUnit平均37.90625ms／最大102ms，整體仍未改善到要求，不能宣稱成功。

此候選目前僅QA請求，尚需冷啟動複測後決定保留／撤回，不能以局部SDK峰值下降替代全週期驗收。生產預設未啟用回收策略。目標未完成。

## 回收重疊冷啟動複測與回傳尖峰定位

本輪重新檢查正確Side origin/main為efe1679，包含47afb08；現存桌面批次已終止（33/33 FAULT），未重啟或重跑。收集continuous-maintenance-repeat，33份durable紀錄、原始code資產/dispatch hash、參數、結果圖層、sourceBinding、圖像身份及原始JSON bytes均與前輪一致。全部33張maintenance回執逐一對照最後實際run的PID/call與unitId，包含FAULT，均相符。GC平均12.12112ms／最大15.51708ms，roundTrip平均12.33720ms／最大15.75ms，joinWait平均0.48485ms／最大3ms。

成功32張完整額外平均105.35330ms／最大188.37054ms，16張≤100ms；第33張原有FAULT不變，acceptancePassed=false。SDK額外最大17.94483ms，連續兩輪顯示局部尖峰降低，但整體最大值仍超標。候選暫留QA研究，不推廣到一般版；不得將局部結果當成整體改善。

最大單位efce9be2-c6f8-44fa-a85f-8b52ef4b5a62：algorithm438.62946ms、完整627ms。互斥額外分解SDK15.96179、nativeOther26.00729、bridge89.40146、unitOutsideDispatch9、outsideUnit48ms。nativeResponse transit66ms（wall-clock診斷，不是獨立可加時間），fetch headers在15731ms到達，arrayBuffer同一毫秒完成。preview decode start15653→ready15724，同期timer gap73ms、rAF gap76ms，已包裝的frontend spans沒有≥2ms項目。只證明decode等待、回傳延遲及主執行緒停頓重疊，不能據此認定image.decode本身消耗71ms CPU，也不能排除未被包裝的layout/GC/native protocol工作。peak-window.json保留原始窗口。下一步應針對這段未歸因的主執行緒停頓，而非繼續調整已穩定的SDK。

另修正native-session-bridge診斷欄位：maintenance invoke啟動成本獨立記為maintenanceStartMs，不再混入restoreMs；整體dispatch與完整週期不變。8項bridge/input-verification測試通過。此診斷修正尚未重建桌面包，以上批次屬修正前；不得用新欄位倒推既有證據。目標未完成。

## 圖片 URL 回呼改為背景供應候選

上一輪完成回收重疊複測及尖峰窗口定位，屬有進展。本輪讀取本機Tauri2.12.5與wry0.57.1實作：同步register_uri_scheme_protocol直接呼叫protocol_handler再respond；現有memory_resources::response會鎖REGISTRY查找Arc，解鎖後複製完整圖片body。這條路徑不應讓平台URL回呼承擔鎖等待/圖片複製，故main.rs改用register_asynchronous_uri_scheme_protocol及tauri::async_runtime::spawn_blocking，仍呼叫原response；token查詢、失效、headers及bytes邏輯不變。這只是消除回呼上的工作，未證明它是前輪76ms停頓根因。

cargo check通過，memory_resources兩項身份/失效/不可變tree租約測試通過，QA release建置成功。冷啟動正常工具列continuous-async-memory，33份durable/code資產與dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-maintenance-repeat全一致。新包亦包含上一輪maintenanceStartMs計時拆分。

成功32張完整額外平均105.38044ms／最大156.96804ms，12張≤100ms；第33張原有FAULT不變，acceptancePassed=false。預覽decode等待平均10.18182ms／最大29ms；前兩輪maintenance-overlap為9.69697/31ms、repeat為11.60606/71ms，因此不能把單輪最大下降當成穩定收益。完整平均幾乎不變。候選暫留供後續定位，不宣稱整體性能改善或已達標。

本輪最大單位08190ff3-ad8a-4dc0-beee-741096c04323互斥分解：SDK17.62795、nativeOther37.42867、bridge60.91142、unitOutsideDispatch4、outsideUnit37ms。native response encode12.9335ms（compact8.90008、JSON4.03329）、transit26ms。rAF gap89ms於16502結束，preview-decode-start16500、ready16525；可見這次長停頓大部分發生在preview解碼請求之前，不能只歸因圖片解碼。輸入圖平均在native回傳前475.65625ms就緒；return至import1.75ms、import至output commit3.75ms、commit至兩次實際呈現30.03125ms。仍需定位未包裝的停頓及降低固定框架成本，不移除呈現或durable驗收。目標未完成。

## 恢復專案去除第二份全量複製

上一輪完成背景供圖候選與桌面核對。本輪檢查實際session：qaContinuousObservations77份/27,869,374bytes，datasetExecutions211份/60,197,431bytes，events35,883份/18,485,297bytes；沒有刪除或裁短任何歷史。Workspace.load先clone(input)、prepareWorkflow，Project.load又clone一次，造成整份候選重複分配。

改為Project.load對私有clone執行prepareLoadedData hook；Workspace覆寫hook執行既有prepareWorkflow，載入入口僅以shallow schema wrapper轉換workspace schema。所有領域驗證仍在圖片解碼與this.data替換前執行；本輪沒有改算子或縮小記錄內容。workspace/execution-facts/dataset-image-store原33項通過；新增frozen caller輸入可載入、normalization只影響載入副本、其後編輯不改caller、decode失敗保留原this.data及內容測試通過（workspace組重跑全通過）。

Node獨立診斷single-load-copy-diagnostic.json量被移除的clone：專案111,314,269bytes，單次clone113.07196ms、heapUsed暫態增加73,897,128bytes（包含尚未回收的暫存分配，且在後續JSON serialization之前採樣）。這是隔離Node證據，不是WebKit啟動時間、保留堆大小或每張週期改善證明。

QA release建置成功，冷啟動恢復後正常工具列continuous-single-load。33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-async-memory全部一致。成功32張完整額外平均104.45258ms／最大145.44354ms、5張≤100ms；第33張原有FAULT不變，acceptancePassed=false。最大是首張：SDK17.70487、nativeOther35.33292、bridge19.40575、unitOutsideDispatch10、outsideUnit63ms，首張click/preflight仍計入。

保留去除明確重複分配的修正；不把單輪最大值下降當成穩定週期收益。平均仍>100ms，後續仍須降低固定SDK/native/bridge成本及首張前置成本，並處理原有故障的限制。目標未完成。

## 固定成本重查：解析入口與雜湊移植均未採用

上一輪完成單次複製載入修改及整批測試，屬有進展。本輪未變更正式執行碼；重讀SDK save_json與Rust核驗，inspection/memory transport已只傳原始JSON bytes，沒有同時夾帶重複data樹。Rust解析保存bytes形成核驗視圖，不能單純跳過。

新增隔離allocator-bench/src/bin/json-parse.rs，以最新單位durable hash核對後抽出的model_data原始1,485,260bytes，100輪交替serde_json::from_slice與from_str(含UTF8驗證)，每次重新編碼與原解析結果完整bytes相同。slice平均3.44841ms/median3.34348ms；validatedStr平均3.33077ms/median3.25219ms。約0.1ms差異不足支持正式改動；json-parse-modes.json保留證據，正式仍from_slice。

重新產出continuous-single-load-native-profile.json，33份durable SHA核對（含FAULT），nested欄位不得相加：SDK save_image平均5.551ms/max6.365、save_json7.299/8.427、set_output2.658/3.629；native JSON核驗解析4.818/5.8；worker serialization2.536/2.914。確認save_image已直接初始化最終Python BMP bytes，無額外Rust Vec→Python整圖副本。

另隔離比較同一3,932,160bytes零值BGR buffer之100次SHA256，包含hexdigest/hex輸出；Python OpenSSL平均1.21730ms，Rust sha2 0.10.9 asm候選1.67908ms，digest完全一致。這只是否定目前直接移植hash實作的證據，不推論全部真實圖像/CPU環境；沒有改動正式SDK或增加其依賴。測試依賴僅放ignored framework-performance/allocator-bench。

本輪兩個候選均未採用，也沒有新的桌面批次。最近完整驗收仍continuous-single-load額外平均104.45258ms／最大145.44354ms，第33張原有FAULT，false。後續應處理上述數毫秒級固定成本或主執行緒停頓，不能把微小隔離差異當成達標。目標未完成。

## 跨工件浮點拼字快取候選撤回

上一輪以實測排除JSON解析入口及hash移植，本輪針對SDK save_json固定成本檢查跨工件數值重用。新增bench-cross-unit-floats.py，逐份驗證最新durable SHA，取32張成功工件真實coherent/model_data（故障張不在此隔離encoder基準內，完整驗收範圍仍33張），每次輸出與Python既有fallback完整bytes相同；普通GC不變，fresh與persistent交替順序。32張共221315種float bit patterns，249503個distinct-per-unit值曾在較早單位出現，但這不等於有界cache命中數。

原有固定16384、滿後不再加入策略直接跨工件共用：fresh平均5.75240ms／median5.81083，persistent9.03406／9.12540。快取被早期座標佔滿後，後續新座標在同一圖內的重複也無法快取，故直接持久化是退化，不能採用。

實作隔離FIFO候選：HashMap+VecDeque總16384 entries，新增時淘汰最舊值；精確float bits與CPython spelling及reentrant take語義不變。不在Python正式execute路徑啟用跨工件cache，只用隔離基準的explicit cache測試。18項native-json-contract通過，32張輸出bytes一致；fresh平均5.88578ms／median5.99146，persistent5.94092／6.09977。FIFO雖避免舊persistent退化，仍沒有優於既有per-run快取，不能增加複雜度只修一個尚未啟用的策略。

已將候選保存到ignored framework-performance/native-json-fifo-candidate.rs，恢復正式lib.rs並cmp確認與候選前完全一致，重建原native extension成功。證據cross-unit-floats-before.json、cross-unit-floats-fifo.json。沒有保留正式程式改動，也沒有聲稱全週期收益；最近桌面仍continuous-single-load，額外104.45258/145.44354ms，FAULT未變，目標未完成。

## 固定十進位浮點格式化加速（保留）

上一輪完成FIFO候選測試與撤回。本輪檢查瀏覽器restoreSharedNativeFacts/freezeParsedJson，已有來源凍結與WeakSet重用，未找到可直接刪除的重大重複遍歷。轉查SDK浮點拼字：原本對每個cache miss都經CPython PyOS_double_to_string配置臨時字串；實際幾何主要為固定十進位範圍。

隔離float-spelling.rs先以serde_json使用的zmij拼字加Python樣式轉換，對502278個有限隨機/十進位邊界值與Python repr比較無差異。這是候選探索，不是所有f64的形式證明，也不是最終正式實作。正式實作只將±0及1e-4≤abs(number)<1e16交給已鎖定zmij1.0.23 Buffer，其他數值仍用CPython與原有有界快取；非有限數值、特殊Python型別及fallback語義不變。zmij此前已是serde_json的transitive依賴，新增直接依賴鎖定同版本；cargo offline更新沒有升級套件。

新增native-json-contract測試：binary exponent -14..53各1000種mantissa及正負號，另加十進位-4..16次方與相鄰float，正反序完整bytes比對Python；含既有隨機bits、極值、±0、NaN/Infinity、mutation/reentry/exception等共19項通過。實際model_data1485260bytes、SHA7e25c7452353e7779e0e6c439e68ebe94cee2e9febf86c1590b3a43f5ef03fa0，100次fresh cache平均2.69044ms／median2.67323，前期原版約4.66ms，全部bytes一致，測量區間0次GC。

第一版仍cache固定十進位拼字，冷啟動continuous-decimal-format：33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-single-load一致。SDK save_json平均4.50072ms（原7.299ms），SDK整體14.00201ms；成功32張完整額外105.00591ms／最大169.93771，14張≤100ms；第33張原有FAULT，false。不能以SDK收益掩蓋其他階段波動。

最終版讓固定十進位直接寫入，免去此類值的hash查詢/每個distinct float的Vec拼字配置，科學記號仍用原cache。隔離100次平均2.68551ms／median2.65852，與有cache版時間相近但少了這些配置；19項測試仍通過。QA重新建置後冷啟動continuous-decimal-direct：33份全部strong comparison再次一致。SDK save_json平均4.11695ms／最大4.50308，SDK總平均13.62484；成功32張完整額外平均103.01047ms／最大137.82992，14張≤100ms；原FAULT仍在，acceptancePassed=false。

保留有兩輪SDK局部收益及bytes一致證據的最終直接格式化版本。完整首張click/preflight、兩次呈現及自然durable保存均保留，沒有改算子；全週期最大仍未≤100ms，目標未完成。

## typed report 迭代避免暫存 Python iterator

上一輪完成固定十進位編碼優化與兩次整批核對。本輪先檢查shared_facts索引，發現先前shared-address/shared-root已有收益不足的對照證據，因此沒有重複試驗。改查wire_value：已確認exact builtin list/tuple後仍value.try_iter建立Python iterator。

最終實作對tuple用PyTuple原生iterator；對list使用index與即時items.len()/get_item，避免CPython iterator配置並保留Python live-list iteration行為。中間試用PyList.iter後讀pyo3原始碼發現會min(initial_length,current_length)，可能忽略fallback新增項目，已在正式測試前改成即時長度。其他型別仍走原fallback；wire tags、length、depth、node/frame bounds與內容皆未改，算子未改。

bench-report-iteration.py以SHA核對的最新第6件durable runs去掉主機添加的artifact.data，重建實際report fixture（非原始socketcapture）。100次編碼完整wire bytes一致，1589182bytes、SHA1d2b8c42e6fc729f2366e3405ed0fae675559a9e9d11625008474234b722ce9a。原版平均2.45644ms／median2.45146；最終live-index版平均2.13033／median2.12069。19項native-json-contract通過，QA build成功。

冷啟動正常工具列continuous-report-iteration：33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-decimal-direct全一致。worker serialization平均2.21181ms／最大2.58896ms。成功32張完整額外平均99.32298ms／最大146.34600ms，23張≤100ms；第33張原有FAULT，acceptancePassed=false。平均小於100不等於最大達標，也不能把整體本輪波動全部歸因這個約0.3ms局部修正。

最大為第一張：SDK16.51388、nativeOther31.55946、bridge19.27267、unitOutsideDispatch10、outsideUnit69ms。首張phases：handler7、runner validation12→15、program preparation17→41（nested checkpoint22→33）、unit start42、session dispatch48ms；保留click0起點。第二大109.49925ms，bridge30.71471ms；其餘仍有超100工件。下一步可針對首張42ms前置與正常工件bridge固定成本，不能移動計時起點或剔除首張。目標未完成。

## 移除桌面批次的獨立預編譯往返

上一輪使用者要求分析額外任務的必要性，已以現有紀錄確認首張prepare-programs client24ms、實際compile10.75921ms，且正常execute的compiled_program仍會處理cache miss。本輪不再僅加速該額外請求：app.js移除自動傳入preparePrograms及未使用的import，桌面正常批次直接走execute；通用runner可選preparePrograms API仍保留供其他呼叫者。啟動時prepareInspectionRuntime仍只準備函式庫，不預執行算子。

40項workpiece-runtime、7項resident-program-preparation通過，QA build成功。冷啟動正常工具列continuous-inline-compile：33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-report-iteration全一致。entry.programPreparation不存在；首張三節點compile cache misses1/2/3、hits均0，phase compilation0.51562+7.21092+0.53654=8.26308ms，位於program_seconds計時之外但完整包含於native及首張週期，沒有移進算法分母。

首張phases：handler6、runner validation10→12、checkpoint14→24、unit start24、dispatch30ms；前輪分別handler7、validation12→15、checkpoint22→33、unit start42、dispatch48。首張完整額外131.76933ms（前146.34600），互斥SDK15.28692、nativeOther36.96517、bridge18.51725、unitOutsideDispatch9、outsideUnit52ms。這支持移除額外往返及等待的收益，但兩輪仍有編譯本身耗時差異，不能將全部14.58ms都說成純IPC節省。

成功32張完整額外平均99.48969ms／最大165.88100ms，27張≤100ms；原第33張FAULT仍在，acceptancePassed=false。最大值出現在其他單位，bridge67.44921ms，不能以首張改善或平均<100ms宣稱全部達標。保留流程簡化；後續仍需縮短checkpoint／首次session準備並定位回傳尖峰。沒有移除驗證、快取隔離、undo或呈現/durable驗收。目標未完成。

## 恢復後的已結束批次共享完整不可變摘要

上一輪移除獨立預編譯往返並驗證首張派發改善。本輪profile-restored-snapshot重查實際session：datasetExecutions59576337bytes、4931個mutable containers、3148個已共享子樹；其餘主要mutable為canvasThreads4377、chat3002、algorithmRuns1180。不是所有59MB都在每次深拷貝，但批次摘要的可變容器仍造成重複遍歷。

sealProjectExecutionFacts在恢復時將COMPLETED/COMPLETED_WITH_FAULTS/FAULT/CANCELLED批次整體建立immutable副本；已immutable直接重用，RUNNING及未知狀態保持可變。沒有刪除歷史。inspection-archive對歷史immutable批次採copy-on-write並同步修正undo/redo；目前runner持有的可變entry仍就地替換units，保持live identity。workpiece-runner續跑immutable批次時複製可變header/counters、slice units，保留既有immutable單位與方案；不直接更動歷史物件。

相關58項測試通過（runner41含可變/恢復後immutable兩種真實續跑；execution-facts與archive17含晚到回執、來源隔離、正常running可寫、重複seal、歷史asset relocation及undo/redo）。初次舊測試把CANCELLED歷史批次直接改counter而失敗，已按新的copy-on-write歷史邊界更新，仍驗證counter獨立、單位共享與undo/redo；新增實際resume覆蓋此路徑，並未刪除驗證。

Node同一session診斷：datasetExecutions mutable containers4931→1（外層清單），221個批次root共享；JSON內容bytes完全不變。7次完整projectSnapshot：原7.19854/6.00200/4.07317/3.78196/3.61567/3.55167/4.16937ms；候選5.82204/4.38154/2.76325/2.56971/2.44179/2.34987/2.29521ms。這不是WebKit或完整週期收益證明。

QA build成功，冷啟動正常工具列continuous-terminal-history：33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-inline-compile全一致。桌面checkpoint16→24ms共8ms（前輪10ms）；handler7、unit-start25、dispatch30ms，前輪dispatch亦30ms，因此首張派發沒有整體提前。首張額外140.07188ms（前131.76933），nativeOther40.68988ms等波動仍在。

成功32張完整額外平均99.89475ms／最大146.22675ms，25張≤100ms；第33張原有FAULT不變，acceptancePassed=false。保留減少歷史摘要重複複製的修正及其copy-on-write邊界測試，不將單輪max下降或局部checkpoint改善等同全部達標。目標未完成。

## 工具列選取與 runner 完整驗證分離

重新確認 flowExecutionRequest→Workspace.compilePurposeScheme 與 runDatasetScheme→validateProjectScheme 在工具列執行時重複完整方案檢查。新增 flowExecutionSelection 僅負責選取工件／來源與固定參考圖、多視圖邊界；工具列使用此選取入口，明確保留 syncCanvasConsultations。既有 flowExecutionRequest 保持嚴格編譯入口供其他呼叫者使用。runner 的完整驗證、失敗阻擋、準備期間方案身份檢查均未移除，不將先前編譯結果跨非同步流程重用。

workpiece-runtime 43 項全通過，包括新增選取後改成無效方案必須在 checkpoint/dispatch 前拒絕、選取入口不編譯但經真實 runner 完成來源兩張執行。QA release build 成功。正常工具列 continuous-selection-validation 整批33份 durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes 與 continuous-terminal-history 全一致。

成功32張完整額外平均100.70613ms、最大169.86446ms、25張≤100ms，第33張原有FAULT，acceptancePassed=false。首張137.10358ms（前140.07188）；handler-start3ms（前7），runner validation8→12、checkpoint16→25、unit-start26、node準備30/31/32。不能把handler提早等同整個首張固定收益；後續階段波動抵消部分節省。

最大單位6eb301ab-111c-48b8-9c43-b84de3536748：SDK13.22683、nativeOther27.05654、bridge18.58108、unitOutsideDispatch5、outsideUnit106ms。兩次呈現檢查17006與17070，間隔64ms；visible587ms、durable610ms，算法440.13554ms。同期timer gap67ms；已包裝frontend spans沒有對應長函式（全批最大checkpoint9ms）。此輪尖峰集中在單位返回後的呈現／保存通知等待，不是方案驗證，也不能據此確定未包裝的主線程工作來源。保留消除重複檢查的簡化，不宣稱完整週期達標；後續應查此主線程停頓與durable通知延遲。原始證據與audit均保存於 framework-performance/desktop-qa-01/continuous-selection-validation-*。

## 輸入核驗 canvas 重用候選撤回

上一輪已完成重複驗證簡化及實際批次。本輪對169.86446ms尖峰重新定位：第32張保存queuedToWrite6.26071ms、write17.25713ms，回調17078ms；結果16984返回、16992提交畫面、下一張17000派發，17006→17070兩次呈現間隔64ms。回執套用在ack之前，QA durable直接觀察unit.recordRef，不能透過提早onChange消除此停頓。一般timer亦67ms延遲，尚無證據把原因限於保存輪詢。

調查前端核驗：每張仍需canvas RGBA雜湊驗證及inputInspection/gray（與原生encoded身份驗證不同），不直接刪除。嘗試每document一個可重用工作canvas，僅保留≤4*1024*1024pixels（RGBA約16MiB），大圖仍臨時；尺寸不變不重設backing store。同步draw/getImageData在await之前完成，返回RGBA獨立。image-decode-identity與dataset-image-store共12項通過，新增並發透明度／不同尺寸像素SHA與灰階全比較，確認四次解碼僅一個工作canvas。

QA build成功，正常工具列continuous-decode-canvas整批33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-selection-validation全部一致。成功32張額外平均104.78750ms、最大201.66533ms、21張≤100ms，原第33張FAULT不變、驗收false。canvas-read32次總278ms（前291）、max11ms不變，局部僅約0.4ms/張；沒有完整週期改善證據。

最大單位efce9be2-c6f8-44fa-a85f-8b52ef4b5a62：SDK13.32267、nativeOther28.27758、bridge104.06508、unitOutside9、outside47ms；frame gap104ms於16064結束，另79ms於14823。不能以兩輪波動證明canvas重用導致退化，但新增常駐canvas沒有足夠收益支持。已撤回本輪image.js與新增候選測試，候選保存在framework-performance/image-decode-canvas-candidate.js與candidate-test.txt；其他既有修改保留。候選app已確認退出（isRunning=false），撤回後QA release重新建置成功（/tmp/side-decode-canvas-restore-build.log），尚未重跑恢復版桌面批次。目標仍未完成。

補充本輪最大尖峰：nativeResponse transit79ms、hostResponse parse2/restore7ms；bridge invokeReturn579ms而native491.93492ms，timer gap94ms。preview15962開始/16004 ready，session16069返回；下一張input-decode16127才開始，不能把這個尖峰直接歸因於下一張的canvas核驗工作。

## QA 預設回到正式版普通 GC 行為

上一輪已撤回canvas重用並重建，本輪檢查QA版仍自動對每張請求runtimeMaintenance，與正式版不同。改為只有VITE_INSPECTION_QA=1且VITE_INSPECTION_QA_GC=1才啟用該實驗；預設QA與正式版皆使用Python普通GC。不disable GC、不改threshold、不改算子。原maintenance的身份核對、等待與失敗處理仍保留供明確實驗。8項input-verification/runtime-maintenance測試通過，QA build成功。

正常工具列continuous-ordinary-gc：33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-selection-validation一致，逐一確認33份unit timing均無runtimeMaintenance。成功32張額外平均102.38396ms、最大180.63392ms、24張≤100ms；第33張原有FAULT不變，false。SDK平均14.50032ms/max37.89516（maintenance基準13.45683/max15.71816），bridge平均20.10174/max69.28142。最大6eb301ab-111c-48b8-9c43-b84de3536748：SDK14.23575、nativeOther30.11675、bridge69.28142、unitOutside9、outside58ms。

自然gen2共10次：9次發生在user-code時間範圍（service=null，7.75012至27.34987ms），1次在set_output（24.19758ms）。這些只按既有計時實際歸屬，不扣除、不把回收刻意搬入算法分母；也不能用算法時間增加造成的額外差異宣稱優化。強制回收對SDK尖峰有效但未解決全週期，預設取消此QA專屬工作可使後續測量更貼近正式版，不宣稱已改善整體效率。保留明確opt-in設定；下一步仍需降低固定SDK/native成本與回傳尖峰。目標未完成。
成功32張完整週期平均：maintenance基準556.34375ms（算法455.63762ms）；普通GC565.18750ms（算法462.80354ms）。因此此輪沒有總耗時加速證據，不能把預設QA行為校正描述為產品提速。

## 按 Agent 使用方式重新盤點資料（使用者要求先分析）

本輪暫停微調，抽查continuous-ordinary-gc第6張已保存記錄，按緊湊UTF-8 JSON計邏輯欄位大小（不是實際IPC大小，已有shared-fact壓縮）：objects run 2090627 bytes，procedureTrace1848968、structuredLayers74469、documentation68573、result47437。trace中一個節點outputs1694432bytes，與model_data原始產物1694418bytes同量級；其他outputs47475/38730/48805。此證據支持優先檢查「大型詳細證據是否必須每張都完整送往前端與建立歷史樹」，不支持刪除原始記錄或跳過產物驗證。

目前圖依賴：objects與unweld_analysis只消費shared_preprocess的shared_data/shared_gray；objects的model_data/edge_data沒有在此圖中作為下游輸入。它們仍可能供Agent事後分析、契約核驗及重開使用，因此建議保留原始資產與索引，但普通即時路徑延後載入詳細trace/model/edge；判定所需result欄位不能一併省去。agent-run-reader已有artifact_id/path/offset/limit與封存讀取入口，可擴展成按需讀取而非把全量資料同步進瀏覽器。

預覽分析：1280×1024縮至640×512，BGR像素從3932160降至983040，RGBA顯示面從5242880降至1310720，均減75%。此為像素量上限推算，不是完整耗時改善測量。只縮CSS無法省編碼/傳輸/解碼；應產生獨立預覽，保留原圖/算子輸入/量測座標/原始資產身份，標明preview尺寸與scale。放大、精細圈選、Agent請求細節時需取原解析度或原圖裁片。既有QA目前要求natural dimensions為原始尺寸，後續若實作預覽，需驗證可逆座標映射及實際原始身份，不只是降低驗收要求。

建議順序：先以小摘要+資產索引替代前端全量詳細證據，其次按視窗實際像素需求產生顯示預覽，再將逐節點詳盡追蹤/GC與IPC診斷明確放入診斷模式。保留既有歷史，不改算子，不把功能刪除當性能提升。普通模式可保留判定、身份、錯誤、核心量測、基本耗時與當前預覽；詳細候選/逐步證據由Agent按需讀取；強制GC/細粒度效能探針預設關閉。此輪提供優先級與資料證據，沒有實作新的資料裁剪。

## 詳細追蹤按需化：整批可行性與消費端邊界驗證

本輪沿用使用者要求的資料架構方向，沒有繼續微調編碼器。新增ignored probe-deferred-trace.mjs，讀取continuous-ordinary-gc全部33份實際保存記錄並逐一核對SHA；對99個run的procedureTrace，只將非boundaryChecks且JSON≥4096bytes的outputs值投影為明確deferred引用，包含runId/nodeInstanceId/結構化path。所有實際原始記錄保持不變，130個延後值均按引用路徑完整取回並deepEqual，沒有以摘要代替完整證據。

99份trace邏輯JSON由54720811降至1055477bytes（約98.07%），這不是實際IPC節省或整體速度測量。逐份執行真實auditAlgorithmProcedureTrace，完整與投影的審核結果deepEqual；buildProgramFlow的整體拓撲、診斷與除明確延後outputs外的所有節點欄位也deepEqual。原有FAULT包含在核對範圍內，boundaryChecks/parameters/status/justification/artifactIds等均未裁剪。結果保存在desktop-qa-01/deferred-trace-feasibility.json。

正式接入仍需處理的真實消費邊界：原生commit必須先持有完整facts與可恢復封存引用，再投影回傳；agent-run-reader目前優先返回本地run，需遇到deferred時轉按封存讀取；program-flow節點詳情、AlgorithmRunView與事後evidence revisions不能把deferred描述當原始輸出。需要對晚到回覆做project epoch/run identity檢查，並保留缺失/保存失敗時的明確錯誤。前端evidenceAudit的輸出值保留規則已由上述99份證明，但還不是所有任意方案的充分證明。這輪是完整實際圖集的設計驗證，尚未啟用正式傳輸裁剪或改驗收門檻；下一步按上述入口實作按需解析後才可量測桌面。目標仍未完成。

## 按需完整證據讀取：Agent 入口已接通

新增inspection-run-details.js，集中從dataset unit取得recordRef或PENDING archive引用。readCompleteInspectionRun只在明確agentcv-deferred-procedure-trace-1標記存在時讀完整記錄；驗證marker/run/unit/execution身份、封存run membership、原始sourceBinding/workpieceUnit/codeSha256一致，拒絕仍帶deferred標記的「完整」回覆。每次await後檢查project.data、epoch、原run物件是否仍屬目前history及呼叫者guard。讀取返回私有完整run，不膨脹活躍歷史，保留本地後補evidenceRevisions。

agent-run-reader原先遇到本地run就直接返回；現在若該run是deferred，先透過上述入口取完整封存再執行原有分頁／摘要工具。正常完整run不增加IO，既有封存查找也支援等待中的archive引用。此輪尚未讓native產生deferred回傳，避免詳情UI尚未接妥就讓使用者看見占位值。

inspection-run-details六項測試與workpiece-runtime43項共49項全通過。覆蓋：普通run零IO、pending引用交由archive service處理、讀取不修改project、保留後補說明、錯execution/unit/run membership/source/code與不完整封存拒絕、project replacement/epoch/run replacement/caller取消後的晚回覆拒絕、缺少或偽造deferred來源不降級為摘要。真實Python封存測試另插入本地deferred run，確認Agent仍讀取實際measurement.columnMeans分頁、讀取次數增加1、結果與原封存一致，且本地摘要與專案內容不變。日誌/tmp/side-deferred-reader-tests.log。

尚需完成：詳情面板與程序節點的按需入口、native commit後的投影、晚到回覆/錯誤UI處理、整批桌面與完整封存一致性驗證。沒有宣稱本輪已減少IPC或達到100ms；目前桌面build仍為前輪ordinary-gc版本，正式回傳投影未啟用。目標仍未完成。

## 完整紀錄面板按需讀取與過期回覆保護

AlgorithmRunView新增loadRunDetails入口。完整run仍同步開啟，只有明確deferredProcedureTrace標記才進入非同步讀取；讀取期間顯示狀態與關閉按鈕，清空舊run/artifacts，失敗顯示錯誤而不把摘要當完整證據。openGeneration在新選取、close、dialog close事件與destroy時遞增，晚到讀取不能重新開窗或覆蓋新run。回覆需runId一致且無deferred標記。

app接入readCompleteInspectionRun與describeAlgorithmRun，沿用上一輪的source/unit/epoch檢查；引用圖片、開啟程式抽屜、讀取explanation snapshot等依賴open完成的呼叫改成await，失敗/取消不引用其他選取。所有正常完整run行為保留。

algorithm-run-view與inspection-run-details共16項測試通過，新增loading→完整證據、close/replace/destroy三種late reply、缺loader/讀取失敗/錯run/仍為摘要四種錯誤。前端vite production build通過（首次從repo root執行找不到index.html，改用desktop cwd後成功，非原始碼錯誤）。日誌/tmp/side-deferred-view-tests.log與/tmp/side-deferred-view-build.log。尚未啟用native回傳投影，沒有新桌面性能結果；還需處理ProgramFlowView節點詳情等直接讀取outputs入口，然後才可啟用並驗證完整封存與顯示。目標未完成。

## 內部算子拓撲按需讀取已接通

重新檢查ProgramFlowView消費路徑：一般節點文檔只呈現documentation與接口名稱，無須為開啟文檔載入大型outputs；真正展示輸出值的是operator-topology-view所選算子接口。於此入口新增readCompleteInspectionRun，只有deferred run才讀取封存，先顯示可關閉的載入面板。完整run放在面板私有graphProject（images+單一完整run），不修改project.data或活躍歷史。普通完整run仍不增加IO。

ProgramFlowView使用topologyRequest與onDialog立即持有載入dialog；重新開啟拓撲時會關閉舊dialog，較晚完成的舊讀取不能覆蓋新handle。close使請求失效並關閉dialog。載入與ELK layout後均檢查原project data/epoch/run identity及呼叫者current guard；關閉、專案切換或新請求後的舊回覆不發布。讀取錯誤顯示alert，沒有用deferred描述偽裝模型資料。

新增operator-topology-deferred五項，與inspection-run-details六項、algorithm-run-view十項合計21項通過；覆蓋真實DOM載入→完整接口、project不變、關閉/epoch/caller失效、保存錯誤、完整run零IO。原operator-topology與graphics兩組無法啟動，原因是缺少codex-audit-logs/20261029-failure-repair/pi-mapping-closure/turn4/completed.agentcv.json，未替換為合成資料或聲稱通過。前端vite build成功。日誌/tmp/side-deferred-topology-tests.log（5通過2缺fixture失敗）、/tmp/side-deferred-topology-boundaries.log（21通過）、/tmp/side-deferred-topology-build.log。

下一步是native commit擁有完整資料後的回傳投影，並驗證前端審核、保存、Agent/面板完整讀取與正式批次。尚未啟用傳輸裁剪，沒有新的桌面性能數據，目標未完成。

## 原生按需證據投影已啟用，完整桌面驗證

新增deferred_trace.rs，inspection_service在inspection_commit成功取得SAVED或owned PENDING回執之後才投影browser response。大型trace.outputs值（JSON≥4096bytes）改為帶runId/instanceId/結構化path的明確deferred引用，boundaryChecks與其他trace欄位原樣保留。大小判斷採有限Write探針，達門檻即停止，不編碼整份值再判斷。另檢查到artifact.data仍含同一大型模型，因此一併投影有memoryRef、契約精確為{"kind":"json"}且沒有任何graph input引用的大型JSON產物；有下游消費或typed geometry/measurement等契約皆保留完整data。result、structuredLayers、code、原始JSON bytes與host驗證不變。run附agentcv-deferred-procedure-trace-1身份標記，上一輪Agent/面板讀取入口因而會取完整封存。

createNativeSessionExecutor新增預設false的deferProcedureTrace選項，僅有commit才發送；desktop普通檢測啟用，stage capture仍完整回傳。native graph判定與完整保存先於投影；未把SDK/編碼/投影成本移進algorithmMs。7項Rust測試通過，含真實execute_with_commit確認save closure收到5000項完整模型而回覆為引用、無commit/錯identity拒絕、typed/consumed artifact不裁剪、門檻含JSON escaping。JS bridge/input/details14項通過。QA release build成功。

冷啟動正常工具列continuous-deferred-trace完成33張。33份durable SHA/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/原始JSON bytes與continuous-ordinary-gc全一致；另逐一核對297個封存trace node的outputs與parameters相同、封存run無deferred標記。成功32張decoded input/output仍1280×1024，兩次呈現與自然durable保存門檻未變，第33張原FAULT不變。

成功32張hostResponse平均1428832.97→372232.38bytes（約減74%），parse2.53125→0.5625ms、restore5.8125→0.15625ms、hostResponse total9.46875→1.875ms；sessionBridge平均20.10174→6.69545ms/max16.98942。完整額外平均106.73067ms/max145.26488ms，11張≤100ms，false；前輪102.38396/max180.63392。nativeOther平均32.31857、unitOutside3.59375、outsideUnit49.84375ms，不能以bridge局部收益宣稱全週期改善。最大是首張：SDK15.85171、nativeOther44.15254、bridge9.26063、unitOutside12、outside64ms。

archive平均queue6.018→5.949ms、write19.026→18.742ms，回執age39.08→44.263ms。更早回到瀏覽器後，原本被其他處理遮住的保存/呈現等待成為較大尾段，仍需處理；不以early return代替真正保存完成。presentation-tail證據已生成。

桌面再手動選取「歪斜與包含分析」（當前live objects run確實帶deferred標記），開啟「程式與紀錄」，看到該節點的完整檔案入口而非載入/錯誤狀態；AlgorithmRunView只在完整回覆無deferred且身份一致時才能進入此畫面，驗證實際按需讀取可用。注意首次開啟選到unweld，已關閉後明確選objects再驗證，未把前者算作deferred測試。當前app停在objects完整檔案入口，來源與圖像保留；本輪沒有commit/push。目標未完成。


## 保存完成通知與資料策略結論

原生archive在writer完成並更新終態、釋放鎖後發送inspection-archive-changed提示；前端只據此立即重新查詢權威保存狀態，不能由事件直接標記SAVED。保留輪詢後備，忽略錯queue；poll進行中到達的提示保留到下一次查詢，避免讀到舊PENDING後仍等待完整輪詢間隔。Rust archive 6項與JS archive 10項通過，QA release build成功。

正常工具列continuous-archive-notify完成33張，33份durable/code/dispatch/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-deferred-trace核對一致。32張成功的完整額外平均97.25875ms、最大156.87709ms、26張≤100ms；前輪106.73067ms、最大145.26488ms、11張≤100ms。平均改善但最大未改善，單批不構成穩定上限保證，第33張既有FAULT仍在，acceptancePassed=false。SDK平均14.14705、nativeOther31.90447、bridge6.30098、unitOutside4.0、outside40.90625ms；return至觀測完成平均41.84375ms，呈現commit至完成平均31.6875ms。圖像仍為原解析度，沒有更改算子或保存驗收。

面向Agent的策略：常駐身份/版本/判定/核心量測/錯誤/資產索引；完整詳細證據封存一次並按需讀取；重複大型trace與artifact內嵌值不必每張送往瀏覽器；未開啟面板的完整詳情與拓撲按需構建；強制GC及細粒度效能探針僅診斷時開啟。尚無足夠證據直接停止生成model/edge產物，它們仍可能承擔核驗或事後分析。低解析度預覽僅為後續候選，未實作也未宣稱提速；必須保留原圖、原坐標及放大時取原圖/裁片能力。


## 解碼完成後晚到 load 事件不再重複適配畫面

上一輪屬進展：保存通知已實作並產生完整33張證據。檢查continuous-archive-notify超標圖：部分output commit之後再次imageRenderer.fit/bounds，單次約8ms；load callback對已prepare/decode且finishCommit完成的frame仍無條件fit，形成冗餘同步layout。ImageRenderer現在記住commit的image與src；匹配的晚到load事件保留onLoad通知但不重新fit/paint，尺寸改變仍由ResizeObserver處理。普通setSource變更會撤銷標記，因此一般首次載入仍在取得尺寸後適配。沒有更改像素、座標、預覽解析度或算子。

image-preparation共10項通過，新增測試涵蓋load早於配對finishCommit不讀layout、finish後late load不改camera、手動zoom保持、ordinary setSource仍fit。QA release build成功，日誌/tmp/side-late-image-load-tests.log及/tmp/side-late-image-load-build.log。

正常工具列continuous-late-image-load完成33張；durable SHA/實際code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes全部與continuous-archive-notify一致，第33張既有FAULT不變。32張成功完整額外平均94.38474ms、最大154.15874ms、28張≤100ms，acceptancePassed=false（前輪97.25875/max156.87709/26張）。bounds由4次/30ms降為1次/7ms，fit由69次/31ms降為66次/7ms。output commit至兩次呈現平均31.6875→27.5ms，最大65→34ms；return至完成平均41.84375→38.84375ms。這是單批觀測，不能保證穩定最大值。

本輪最大3e5cb763-f600-4c41-aa5c-1bbbbc21da4d：SDK38.56570、nativeOther30.60588、bridge22.98717、unitOutside9、outside53ms；首張140.85784ms。修正已減少一條具體重複顯示路徑，但SDK/bridge尖峰仍存在。較低解析度預覽尚未實作，不將此輪改善歸因於縮圖。目標仍未完成，無commit/push。


## 使用者調整首張延遲驗收範圍

使用者明確要求「現在不對第一幅圖的測試時間做強制100ms以內的要求」。自此首張完整週期仍量測、報告並驗證執行/顯示/保存，只豁免首張的算子外100ms延遲門檻；第二張起不變。此前歷史數據及驗收結論保留，不回寫舊audit。audit-cycle-budget.py schema更新為2，新增budgetPolicy/firstUnit/budgetedRows/budgetedUnitCount/budgetedWithin100ms/overBudgetUnits，預設按使用者新規則；--include-first可重現舊規則。按原始observation第一個unitId判定豁免，不能因第一張FAULT而把第二張移作首張。被豁免張仍需完整觀測與durable SHA，FAULT仍使驗收失敗。4項Python測試驗證這些邊界通過；continuous observer往後也記錄政策，未改計時或呈現閘門。

以continuous-late-image-load重新審核，另存continuous-late-image-load-first-exempt-audit.json：第二張起31張成功，平均額外92.88561ms、最大154.15874ms、28張≤100ms，3張超標（9d616c59、6a5bb056、3e5cb763）；第33張既有FAULT保持。acceptancePassed仍false。這是同一批實測的新政策審核，不是重新執行或新的性能改善。

最大3e5cb763之objects SDK set_output26.10804ms，其中programGc記錄gen2回收23.40963ms、collected153684，明確證明此尖峰主要來自GC。未關閉GC或把成本搬入算法分母。既有namespace循環及強制每件回收試驗已記錄，未重做已否定策略；直接clear globals會破壞外部仍可達函數，不能採用。後續需從減少框架資料複製/保留著手。無commit/push，目標未完成。


## 半尺寸輸出預覽的實際算子隔離測試

上一輪完成使用者指定的首張延遲豁免及測試，屬進展。本輪使用probe-low-resolution-preview.py，在獨立Python行程讀取continuous-late-image-load第1/6/20/28張完整封存（逐份SHA核對），以實際code資產（codeSha256核對）、參數、來源與upstream執行12次原算子。每次status/result/structuredLayers與封存一致。攔截SDK preview_bmp取得實際像素，原始preview仍正常返回；沒有修改產品輸出解析度或算子。

對每份預覽以交替順序各8次比較現有native preview_bmp與cv2.INTER_AREA縮小一半+相同native encoder，包含縮圖與tobytes成本；核對原始raw SHA前後相同、縮圖BMP可解碼且尺寸正確。12份預覽平均3058742→764982bytes（約75%減少），每份8次中位數再平均full0.09804ms、half含resize0.07261ms。這是微基準、不是桌面週期/最壞值/視覺品質驗收；未改runtime GC策略，沒有移動算法計時。完整證據low-resolution-preview-probe.json，另保存第6張objects原圖/半尺寸BMP供後續顯示驗證。

結論：縮圖生成在此資料集成本很小，但編碼本身只有約0.1ms，不應把縮圖稱為SDK尖峰解法；可望改善的是約75%傳輸/解碼/顯示像素負荷，尚待桌面驗證。現有native host尺寸驗證、preview prefetch identity、renderer RGB取樣與原坐標、zoom到原圖、QA identity均假定單一原尺寸，正式接入需明確分開original與preview身份，不能只改width/height騙過契約。也發現三節點均生成live preview，即使只有selected node會預取；若延後非選中節點生成，必須先確保原像素可供稍後切換，不可直接丟棄metadata-only圖像。沒有採用未完整接通的縮圖，最新桌面仍為continuous-late-image-load，後續31張成功3張超標且既有FAULT，目標未完成。


## 雙解析度顯示端：原圖座標、精細取樣與晚到回覆

上一輪半尺寸成本測試屬進展，本輪實作ImageRenderer可選source.preview={src,width,height}。source.src/width/height仍是原圖，顯示camera與CSS尺寸仍以原圖坐標計算；preview只決定初始解碼資源。檢查預覽為正整數尺寸、不大於原圖、URL不同，decode/ready階段核對實際preview尺寸。來源比較含preview身份，避免不同預覽共用過期pending。

paint按view.scale*devicePixelRatio判定預覽像素是否足夠；不足時ensureOriginal非同步載入source.src，實際尺寸必須等於原圖尺寸，替換image但不改camera。RGB取樣先要求完整原圖，載入中不回報縮圖色值。原圖失敗保留目前預覽並通知錯誤，不以縮圖冒充原圖；同一來源失敗不在每次paint無限重試。新來源/setSource/clear/destroy後，generation+source身份檢查拒絕晚到回覆。同一來源progress更新重用已升級原圖，不降回preview。普通不帶preview來源沿用原路徑。

image-preparation及native-preview-prefetch合計24項測試通過；新增6項涵蓋原坐標/原尺寸/相機保持、RGB不造假、replace/clear/destroy晚到回覆、原圖尺寸錯誤保留預覽且只報錯一次、preview契約尺寸錯誤、DPR及ready frame升級後不降級。vite build通過，日誌/tmp/side-preview-renderer-tests.log與/tmp/side-preview-renderer-build.log。尚未將原生preview資料接入，也未啟用正式半尺寸顯示，不宣稱此輪改善桌面耗時。

DPR是必要限制：1280原圖在約350 CSS px的區域、DPR=2時需要約700個實體像素，640寬preview並不足夠；直接固定半尺寸將觸發原圖升級，可能沒有收益。後續原生預覽尺寸應按實際顯示需求選擇（例如更合適的寬度），並接入原始資源保留、preview身份、prefetch/輸出source傳遞與QA縮圖坐標/來源驗證。不能為了縮圖收益忽略高DPI或像素取樣正確性。目標仍未完成，首張延遲豁免維持，無commit/push。


## 原生獨立預覽資源（尚未啟用前端請求）

新增display_preview.rs，僅接受現有native encoder產生的有界BMP（40-byte DIB、positive dimensions、無壓縮、24-bit BGR或標準8-bit灰階palette）。檢查header/file length/stride/palette/尺寸，保留原圖bytes不變。preview按max dimension等比例四捨五入，採pixel-center bilinear與8-bit權重，輸出同通道BMP、padding清零；不放大。這不是前輪cv2.INTER_AREA算法，不能沿用其耗時或視覺品質結論。

cv_runtime可選previewMaxDimension 64..4096，執行前驗證；只在inspection live pixels路徑附加displayPreview，其metadata含schema/src/實際縮圖尺寸/reference/originalReference/sampling。原dataUrl仍指向原尺寸BMP，artifact原尺寸/原始bytes/hash/下游算子均不變；兩份資源屬相同scope並服從原有記憶體限額與淘汰。inspection_service只向previewNodeId對應節點轉交session提供的尺寸。前端還未發出此參數，正式執行保持原尺寸，尚未聲稱端到端可用或提速。

3項Rust測試通過：彩色中心混色與原始bytes不變、灰階palette/stride/比例與不放大、逐截斷/錯header/過大或不合法尺寸拒絕。另5項inspection_service測試通過，日誌/tmp/side-native-display-preview-tests.log及/tmp/side-preview-service-tests.log。以實際第6張objects BMP做release優化微基準（10 warmup+100 samples）：640x512/983094bytes中位1.121708ms、最大2.373042；768x614/1414710bytes中位1.640375ms、最大1.815459；1024x819/2516022bytes中位2.880583ms、最大3.259500。這是額外原生成本，不能從完整週期扣除，也不是Python/OpenCV微基準0.07ms。首個獨立rustc命令漏edition導致編譯失敗，補--edition=2021後成功，未改產品edition。

需繼續接通實際viewport需求、native hint與prefetch final身份確認、NodeOutputView傳遞與QA原圖/preview身份座標核對，然後桌面比較收益。原生CPU縮圖若收益不足應撤回或改用已有OpenCV縮圖路徑，不能僅因bytes減少就宣稱改善。無commit/push；目標未完成。


## 顯示預覽端到端實驗與實際完整週期

新增display-preview.js，核對preview schema/sampling/尺寸、兩份runtime-memory reference的runId/artifactId/scope/mime/SHA/token，且原圖與預覽URL各自指向相應token。native progress hint在有displayPreview時發送縮圖尺寸/URL；prefetch完成時再按最終已核對artifact確認縮圖，未確認前不發布。NodeOutputView將original source與validated preview一同交給renderer。bridge新增previewMaxDimension callback，app僅VITE_INSPECTION_QA_PREVIEW=1且非stageCapture時請求，按viewport最大邊*DPR向上取32倍數（64..4096）。正常產品預設不發請求。

QA continuous觀測增加sourceMatches：原始source URL與dimensions須等於actual artifact；preview開啟時實際natural dimensions及URL須等於已驗證preview，否則須等於原圖。輸入圖仍原始尺寸。保留兩次呈現與自然durable保存，新增displayIdentity以供回溯，首張只豁免延遲上限。26項前端相關測試通過，包含錯run/scope/artifact/token/hash/尺寸/來源URL拒絕與final binding後才轉移縮圖。QA opt-in release build成功。

重啟前發現原QA app已停在單張17_22且選unweld；重啟後明確選objects，正常工具列執行continuous-display-preview。33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-late-image-load全一致。32張成功均實際顯示input1280x1024/output1024x819，displayIdentity.previewActive=true/sourceMatches=true。第33張既有FAULT不變。

按首張豁免規則，後續31張成功額外平均97.31575ms、最大123.30679ms、21張≤100ms；先前未縮圖92.88561/max154.15874/28張。最大下降但平均與達標張數變差，單批不能證明整體提速。後續SDK平均14.33944/nativeOther37.97937/bridge5.02919/unitOutside3.77419/outside36.19355ms；nativeOther比前版增加，符合縮圖新增CPU成本。最大3e5cb763：SDK39.03237/native37.49554/bridge4.77888/unitOutside3/outside39ms，原GC尖峰仍存在。首張143.75604ms照常報告，不適用100ms門檻。

舊audit-presentation-tail工具因output-committed有34次而units33次，拒絕按位置對齊；沒有跳過額外事件強行生成分解，也沒有宣稱該工具通過。正式cycle audit不依賴此假設，acceptancePassed=false。

桌面實驗後補足持久化邊界：displayPreview屬程序內暫存能力，不應寫入durable archive/project recovery或ordinary project JSON。native strip_inline與borrowed serializer同時剔除；JS durableInspectionProduct/app-session/project-serialization/artifact-retention對應去除但不修改live來源。10項JS保存相關測試及1項native serializer對照測試通過；初次cargo filter錯名執行0項，改用實際test名後1項通過，未把0項當驗證。前端最終vite build通過。這些保存邊界修正晚於上述桌面批次，尚未重新打包驗證；當前運行QA app為opt-in實驗build，正式功能仍由建置開關控制。

下一步應按圖片適配比例而非viewport最大邊估計實體像素需求，避免本輪過度保守地生成1024寬；仍需比較完整週期及放大/取樣的實際桌面行為，若原生縮圖成本不能抵銷收益就撤回預設啟用方向。目標未完成，無commit/push。


## 按實際適配比例選取預覽尺寸

上一輪完成端到端預覽與desktop量測，屬進展。本輪新增fittedPreviewLimit：依目前output原圖比例、viewport扣除fit padding後的最小適配scale及DPR估算需要的實體像素；向上取32倍數並留一像素rounding餘量。未知/隱藏尺寸、要求不小於原圖或超過4096時不建立preview。下一張若改變比例導致不足，renderer既有density check仍會取原圖，沒有犧牲放大品質。app experimental callback改用這個估算，VITE_INSPECTION_QA_PREVIEW=1 opt-in維持，沒有設為正式預設。

28項前端相關測試通過，新增橫/直向適配、DPR1/1.5/2/3、viewport矩陣中四捨五入短邊仍滿足實體需求、原圖已小於需求及未知尺寸不縮圖。QA release build成功，也包含上一輪晚補的持久化邊界修正。日誌/tmp/side-fitted-preview-tests.log與/tmp/side-fitted-preview-build.log。

正常工具列continuous-fitted-preview完成33張，durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-display-preview一致；逐份另外確認33份durable記錄的artifact均不含displayPreview。成功32張中首張使用1280x1024原圖，其餘31張實際output704x563（previewActive/sourceMatches true，BMP1189110bytes），input仍1280x1024。第33張原FAULT不變。

首張額外122.46858ms只報告不做100ms門檻。後續31張成功額外平均93.34973ms/max129.48858ms、27張≤100ms，acceptancePassed=false；前輪1024寬97.31575/max123.30679/21張，未縮圖baseline92.88561/max154.15874/28張。故本輪縮圖比1024策略平均好，但未證明比不縮圖整體更好或解決上限，不預設啟用。後續nativeOther平均34.53340ms，比前輪37.97937下降；bridge5.35134/outside35.41935ms。

4張超標：8116174b 129.48858（outside63ms）、16da3492 113.33412（bridge11.85808/unitOutside10/outside44）、6a5bb056 102.20338（nativeOther51.01362）、3e5cb763 120.71763（SDK37.48342）。仍包含呈現/排程與GC等不同來源，不能單靠縮圖宣稱達成。

批次後經CUA在真實輸出面板點「原始尺寸1:1」，AX顯示100%，截圖看到完整細節與圖層且無原圖載入失敗。這是實際UI可用性證據；精確natural dimensions與不改camera的升級行為另由前輪自動測試驗證，沒有聲稱僅由截圖能證明逐像素相同。當前QA app留在100%輸出視圖，未改任何算子。無commit/push，目標仍未完成。


## 桌面結果驗證尖峰：確認為自然GC而非固定驗證成本

上一輪尺寸調整/整批/真實UI驗證屬進展。本輪查continuous-fitted-preview中6a5bb056原生額外51.01362ms，objects result-validation17.94221ms，已有programGc只覆蓋user exec，不能據此說明validation內事件。先新增ignored probe-result-validation-gc.py，獨立行程重放33張真實code/參數/upstream，逐份核對code SHA與result/structuredLayers/status（含原FAULT），只對execute直接呼叫的json_value與validate_structured_layers暫掛GC觀測，回收策略不變。98次json_value平均0.05957ms/max1.33292，98次validate_structured_layers平均0.05691/max1.03550，未重現桌面尖峰；結果result-validation-gc-probe.json。這只能否定本批孤立呼叫固定需要17ms，不能證明桌面原因。

program_execution_gc_probe新增phase標籤參數，execute result-validation區間使用同樣被動callback記錄到timing.resultValidationGc，scope明確是框架驗證，未修改algorithmMs、未做強制GC/threshold變更/關閉GC。callback在exception也移除。resident-program-preparation共8項通過，新增框架scope/回收策略/清理測試。QA release build成功，這次未啟用VITE_INSPECTION_QA_PREVIEW，回到預設原圖路徑；預覽功能仍保留opt-in。

正常工具列continuous-validation-gc完成33張，durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-late-image-load一致。原FAULT不變。首張豁免後31張成功額外平均92.52043ms/max156.10249ms，25張≤100ms，acceptancePassed=false。這是診斷版本，未宣稱性能改善。

同一6a5bb056 objects重現result-validation17.81292ms，其中gen1回收0.95604ms、gen2回收16.64433ms/collected106589/uncollectable0；兩段GC合計17.60038ms，足以定位此驗證尖峰主要為自然GC，並非必須跳過資料核驗才能減少的驗證工作。詳細nested證據continuous-validation-gc-validation-gc.json。所有GC仍計入完整額外時間，沒有扣除。後續應處理執行資料持有/回收或降低其他固定成本以留下足夠餘量，不重做已證明更慢且可能挪動計時的盲目GC策略。當前QA app為原尺寸診斷版，無commit/push；目標未完成。


## 不可達物件的循環所有權核對

上一輪桌面確認result-validation內gen2回收16.644ms，屬新證據。本輪檢查SDKClock.wrap/ProcedureTrace/ProcedureUnit與execute中save_image/save_json/save_layers/register閉包，並新增ignored inspect-runtime-cycle-ownership.py，沿用隔離真實算子重放（3個工件warmup、再3個工件，結果/圖層與封存一致），只在隔離行程使用DEBUG_SAVEALL取得不可達物件快照。桌面GC設定與算子完全未改。

快照160719個物件，直接referent圖在分析時排除81條「__agentcv_algorithm__函數→自身globals」邊後，仍有161460條邊；以入度拓樸消去可移除全部160719個頂點，剩餘cycle或cycle-dependent物件為0。這是反事實引用圖分析，未對任何真實物件刪除引用；說明此批不可達子圖沒有獨立於算子function/globals循環之外的框架循環，並非證明所有方案/所有時間永遠無框架循環。6份舊namespace、81個算子函數，細節runtime-cycle-ownership-diagnostic.json。

因此不再將直接clear globals或清空SDK持有的trace當作安全的通用修正；外部仍可使用的函數/類別與其全域資料不可破壞。此輪沒有修改product runtime或移動回收時間，只增加可重跑診斷與結論，沒有新的desktop性能結果。下一步降低固定前端更新與原生處理成本以留足餘量，不能把已確認的算子namespace循環當成可任意刪掉的框架資料。最新桌面仍continuous-validation-gc，後續31張成功25張達標/max156.10249且既有FAULT，目標未完成，無commit/push。

## 流程圖連線重用與首張豁免驗證

program-flow-map在幾何與連線標籤上下文相同時重用SVG連線、端點與標籤；執行狀態、來源名稱、視覺語意或幾何改變會重建對應元素。自由標籤保留佔位框，任一標籤或順序改變會使標籤位置快取失效。以Map代替每條邊重複find節點。沒有節流或刪除執行事件。

4項流程圖快取測試通過，涵蓋DOM身份、狀態/名稱/幾何失效與自由標籤重用後畫面和全新建立完全一致。QA release build成功，未啟用低解析度預覽。首張豁免審計另4項Python測試通過：只免延遲門檻，仍要求正確執行、顯示及durable記錄。

正常工具列continuous-edge-reuse完成33張；33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-validation-gc一致。第33張原FAULT不變。首張額外147.09966ms只報告；後續31張成功額外平均93.30371ms/max113.75654ms，26張≤100ms，acceptancePassed=false。基準92.52043/max156.10249/25張；單批最大值下降不能宣稱整體穩定改善，平均並未下降。

兩批flowMap._render均100次，累計176→157ms，flow.sync229→199ms，view.render278→255ms（巢狀數值不可相加）。前端局部成本下降，但完整週期仍受其他成本影響。保留此局部重用，未修改算子、未降低圖像解析度、無commit/push；尚未達成後續各張100ms要求。

## 避免SVG排序游標使未改動元素重複移動

上一輪連線重用與整批測試屬進展。本輪檢查完整presentation tail：continuous-edge-reuse正常對齊33筆階段，成功32張commit至兩次呈現平均34.28125ms；原生JSON解析仍佔objects約4.55ms，但沒有跳過核驗或重試既有from_str實驗。

發現program-flow-map的逐項insertBefore在前方舊元素被替換後，cursor仍停在淘汰元素上，會把其後已重用的元素也逐一移動。改為先移除不在新children集合的元素，再進行原有順序校正，保留未變元素的DOM位置。新增MutationObserver斷言：替換圖像來源節點後，未變連線/端點/標籤/後續步驟不出現在addedNodes/removedNodes。4項流程圖測試通過，QA release build成功；日誌/tmp/side-flow-reconcile-tests.log與/tmp/side-flow-reconcile-build.log。沒有變更執行事件或算子。

原尺寸正常工具列continuous-flow-reconcile完成33張，33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes均與continuous-edge-reuse一致，原FAULT不變。首張額外129.21175ms豁免延遲門檻。後續31張成功平均90.78475ms/max114.28659ms，28張≤100ms；前輪93.30371/max113.75654/26張。acceptancePassed=false，不把單批平均改善當成穩定上限保證。

flowMap._render累計157→168ms，flow.sync199→202ms，view.render255→263ms，局部計時沒有改善證據；MutationObserver則證實消除了不必要移動。commit至觀測visible平均34.28125→32.25ms，return至完成38.75→36.6875ms。保留有明確DOM行為改善的修正，但不據此推論全部時間差來自本修改。

剩餘3張：6a5bb056額外103.43050ms/nativeOther48.95017；ce0ec159額外114.28659ms/bridge15.51667，其中response parse3ms+freeze3ms、transit7ms；3e5cb763額外109.83475ms/SDK37.49850。前兩個既有GC相關工件仍需固定成本餘量，新bridge尖峰顯示傳輸/主線程仍會波動。無commit/push，目標未完成。

## 原生JSON產物逐項成本與延後解析可行性

上一輪SVG排序修正及整批屬進展。本輪先核對execution-facts/json-snapshot/native-session-bridge：現有WeakSet已避免共享事實重複凍結，不能再以去重名義刪除必要保護。重新從33份SHA驗證封存彙總native profile，verification.jsonParseMs平均4.729ms、最大5.265ms；沒有重跑已否決的from_str微優化。

新增ignored profile-json-artifact-corpus.py，驗證33份record與230份JSON產物（含ACVPAK01各entry offset/size/hash及trailing邊界），擷取原始bytes供獨立Rust基準。230份內容SHA全不同，跨工件完整JSON快取沒有命中機會。新增allocator-bench/src/bin/artifact-parse-profile.rs，沿用產品serde_json float_roundtrip/preserve_order及mimalloc，逐份再核SHA，2次warmup+10次解析，分開記錄parse與drop中位數。沒有修改產品路徑/算子/GC，也沒有將孤立基準視為desktop驗收。

json-artifact-parse-profile.json結果：model_data平均1544911bytes，解析中位數的跨工件平均3.34091ms、最大4.45456ms、drop平均0.22266ms；edge_data0.30143、geometry_data0.09242、geometry0.21655ms，其餘三類各<0.001ms。model_data佔這組分項平均約84.5%，應優先評估此大型證據的解析時機，而非小型metadata快取。

已核實方案model_data為plain json契約，沒有graph input消費；目前deferred_trace只在完整解析/保存後才投影。inspection_commit已將有memoryRef的JSON data從保存表示移除並標記dataStorage=artifact-bytes，inspection_files::hydrate_json_artifact讀取時驗SHA/bytes再恢復data。這提供後續提前延後解析的現有基礎，但尚不能直接跳過：必須保留完整JSON合法性核驗、只適用未消費plain契約、確保native audit/Agent按需讀取/錯誤路徑都能辨識明確引用，且typed與downstream輸入仍即時完整解析。此輪沒有預設啟用或宣稱節省3.34ms。

最新完整桌面驗收仍continuous-flow-reconcile：首張豁免後31張成功28張達標，平均90.78475/max114.28659ms，另第33張既有FAULT。目標未完成，無commit/push。

## 大型JSON延後建樹的嚴格核驗候選

上一輪230份真實JSON產物逐項成本與讀取路徑核對屬進展。本輪新增隔離候選allocator-bench/src/validate_json.rs：使用相同serde_json deserialize_any數值/字串/容器解析，但visitor僅逐項消費，不配置完整Value樹。未使用IgnoredAny快跳，因其數字略過不等同Value的溢位檢查；保留有限浮點檢查、字串/鍵UTF-8與Unicode合法性、巢狀深度及尾端完整消費。尚未接入產品。

4項release測試通過（/tmp/side-json-validation-tests.log）：一般scalar/容器/重複鍵/__proto__、無效UTF8與孤立surrogate、深度0..139對照、所有fixture截斷與每個位置256種byte替換，以及7種mantissa×exponent[-400,400]和正負1..400位整數。每例接受/拒絕皆對照同features的serde_json::Value。這是已覆蓋範圍的等價證據，不宣稱窮盡全部輸入。

新增artifact-validation-profile.rs，230份產物逐份重新驗SHA，交替順序各2次warmup+20次量測，完整建樹路徑包括drop，避免把釋放成本漏算。json-artifact-validation-profile.json：model_data的跨工件中位數平均parse+release3.67335ms→validate1.92188ms，局部差1.75147ms；edge_data0.33665→0.15690，geometry_data0.10338→0.04537，geometry0.22960→0.08658ms。完整JSON快取仍230份全不同；不會嘗試無命中的快取。

再次確認native evidence audit只讀artifact描述，plain json output contract不做typed value檢查，現有durable_run會去除data、保存immutable bytes，hydrate_json_artifact讀取時核SHA與長度恢復完整data。後續接入應由session依精確plain契約、無graph消費、commit+defer選項生成名單，拒絕節點request覆蓋該政策；只對實際受保留的memory JSON且大於門檻使用候選，其他照常解析。早期引用需在commit成功後被deferred_trace識別並標記完整讀取，失敗不能偽裝完整資料。這些接線與端到端測試尚未完成，因此本輪未改產品路徑，也未做新的桌面性能宣稱。

最新desktop仍continuous-flow-reconcile，後續31張成功28張≤100ms、max114.28659ms，另既有算子FAULT；目標未完成，無commit/push。

## 接入未消費大型JSON的提前核驗與按需建樹

上一輪嚴格visitor候選及230份交替基準屬進展。本輪加入產品json_validation.rs（沿用4項語法/UTF8/數字/深度/破壞對照測試），inspection_service僅在deferProcedureTrace+commit下，由完整graph推導精確plain json契約、沒有任何input消費的artifact ID。節點request不得覆蓋deferredJsonArtifactIds；service覆蓋shared來源中的同名值。cv_runtime再次核對expectedOutputs的plain契約，只對inspection、實際memory bytes、≥4096bytes、名單內JSON使用嚴格visitor，仍驗原始bytes SHA/長度/總量，保留immutable memoryRef。其他產物維持完整Value解析，算子未變。

早期data採既有agentcv-deferred-artifact-value-1明確runId/artifactId引用。durable_run既有artifact-bytes路徑去除data、保留完整bytes；deferred_trace在取得SAVED或owned PENDING後辨識早期引用並附完整讀取標記。保存失敗不發布完整結果，不把引用偽裝資料值。新增真實memory驗證測試涵蓋原bytes讀回、hash錯誤、巨大overflow數字、trailing bytes、小資料及無名單回退；policy/commit測試涵蓋typed/consumed排除、opt-in、節點覆蓋拒絕、保存表示無marker、成功才標記。

4項json_validation、10項deferred相關Rust測試、21項JS完整讀取/面板測試通過。2項packed_assets初次並行時1項因scratch mkdir AlreadyExists失敗（非產品核驗失敗），以--test-threads=1重跑2項通過。日誌/tmp/side-early-json-tests.log、/tmp/side-early-json-integration-tests.log、/tmp/side-early-json-reader-tests.log、/tmp/side-early-json-pack-serial-tests.log。原尺寸QA release build成功，/tmp/side-early-json-build.log。

正常工具列continuous-early-json完成33張；33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-flow-reconcile一致；32張成功的實際decoded input/output均1280×1024，第33張原StructuredLayerContractError不變。首張額外134.32350ms豁免；後續31張成功平均90.16690/max173.80617ms、29張≤100ms，acceptancePassed=false。前輪90.78475/max114.28659/28張。verification.jsonParseMs（現包含嚴格核驗）33張平均4.729→2.28392ms；後續nativeOther平均32.38367→29.36824ms，但不能據此宣稱最大上限改善。

兩張超標：3e5cb763額外106.43125ms（SDK37.01937），a08e6a1e額外173.80617ms（bridge69.34250、outside56ms）。後者是獨立傳輸/主線程尖峰，不能從驗收扣掉。

真實桌面讀取驗證：第一次「程式與紀錄」實際打開unweld，未作為大型證據驗證；關閉兩層面板後明確選objects再開啟，成功產生完整證據檔案入口。讀取該UI導出的external-records/2b885c9e0c8652bac83427c63783c721c9c8d77257206b52575dd4992c97e5d5/result.json（8502845bytes），其search_data/edge_data/model_data/geometry_data逐份data與前輪SHA驗證的原始JSON解析值完全相同；證據continuous-early-json-ui-readback.json。因此本輪確實驗證提前引用經保存、按需讀取恢復大型完整值，非僅靠載入畫面推論。當前QA app留在objects完整檔案入口，無commit/push；目標未完成。

## 最新回覆尖峰與跨回呼停頓對齊

上一輪提前JSON核驗、完整UI讀回及33張整批屬進展。本輪新增ignored analyze-delivery-stalls.py，從最新實際observation按unit起點與下一unit起點唯一配對IPC fetch，對native transit≥10ms者抽取body時段、前端同步span聯集（避免巢狀相加）、timer/rAF間隔、preview phase、archive通知與observer耗時。native sentAt為wall clock，投影到performance時軸標明近似，不扣除任何驗收時間，也不把跨入下一unit的phase誤當本件算子工作。

continuous-early-json-delivery-stalls.json只有a08e6a1e命中：nativeTransit64ms，bodyStart=bodyEnd（約1ms時鐘精度，非證明物理零耗時），hostResponse parse約1ms/freeze1ms；同窗timer間隔100ms（15062→15162），rAF間隔111ms（15031→15142）。已量測同步span聯集7ms，包含view.render/flow.sync/notify巢狀去重；observer另有15142開始7ms的long tick。preview-decode-start15059、preview-decode-ready15141（82ms elapsed，不能當作82ms CPU）；輸出同於15142提交。

此證據說明尖峰並非body讀取或JSON解析耗時，且不只單一IPC回覆晚到：timer/frame/image decode completion/archive通知也在相近區段延遲。archive通知at15164，native timing queuedToWrite6.25267ms/write16.64771ms/age114.34371ms，不可將通知age當成實際寫入成本。現有spans覆蓋不足以區分WebKit內部GC/解碼、未觀測主線程工作或OS排程；沒有宣稱根因已確定，也沒有更改計時或略過呈現。

檢查preview ownership與ImageRenderer交換流程後，沒有直接清除舊img.src：既有準備frame可能被其他讀取路徑重用，未先驗明生命週期不宜破壞。此輪只新增可重跑的對齊診斷，產品未新增變更、沒有新桌面批次。下一步應取得該共同停頓的執行緒/圖像載入階段證據，而非繼續將64ms交付延遲歸因於已降至約2ms的JSON處理。最新驗收仍後續31張成功29張≤100ms、max173.80617ms與既有第33張FAULT；目標未完成，無commit/push。

## 區分原生圖像交付與WebKit呈現停頓

上一輪回覆/回呼時間線分析屬進展。本輪新增memory_delivery.rs：僅編譯環境VITE_INSPECTION_QA=1時記錄agentcv-memory請求進入到spawn_blocking開始、response構造（含registry lookup/bytes copy）與responder.respond呼叫耗時；1024筆上限，不保留像素。native-preview-prefetch在QA才記錄同URL的start/load/decode事件，使用addEventListener不覆蓋renderer onload，並以sink identity避免晚到事件污染下一批。continuous observer在完成所有cycle計時後讀回native snapshot，記錄1000筆上限。普通版不記錄，完成與兩次呈現門檻不變；新欄位未扣減任何耗時。

12項預覽/身份轉移測試通過（/tmp/side-memory-delivery-preview-tests.log），QA build成功（/tmp/side-memory-delivery-build.log）。正常工具列continuous-memory-delivery完成33張，33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes與continuous-early-json一致；原FAULT不變。首張延遲豁免後31張成功平均91.96104ms/max169.61092ms，26張≤100ms，acceptancePassed=false；這是診斷版本，不宣稱性能改善。

實際native diagnostic enabled=true，33次圖像請求、99筆瀏覽器image事件。新增analyze-image-delivery.py以精確resource token唯一join，生成continuous-memory-delivery-image-delivery.json。33次queue平均0.01031/max0.01450ms、responseConstruction平均0.25014/max0.36546ms、responderCall平均0.46941/max0.52833ms，皆status200。不能將responder返回當作WebKit已收到或已呈現。

本輪無native transit≥10ms，卻有b64a1160額外166.85608ms（outsideUnit116ms）與ce0ec159額外169.61092ms（outsideUnit108ms）。前者preview decode6ms且在6759完成，input/output於6765提交；後者decode11ms於13454完成、13470提交，但timer間隔101ms、rAF間隔104ms，觀測visible延至13573。後者flow.sync/view.render有16/20ms巢狀span，仍不足以單獨解釋完整停頓；本批observer自身max約1ms。這把本輪兩個大尖峰位置縮至已解碼後的瀏覽器呈現/回呼排程，native圖像queue/copy/respond不是這兩次停頓的主要耗時。仍不能據此區分JSC GC、WebKit內部呈現與OS排程，也不能外推上一批64ms回覆事件的根因。

保留QA診斷便於後續執行緒證據對齊；未改算子、解析度、GC策略或驗收。無commit/push，目標未完成。

## 更新後WebKit堆疊取樣與穩定文字節點

上一輪native圖像交付診斷與整批屬進展。本輪先確認QA host PID57951於23:49:28啟動、唯一WebContent57954於23:49:29啟動。延伸sample-stack-windows.py可指定輸出目錄/總時間/取樣間隔，拒絕覆寫已有index；以5ms間隔取26個一秒視窗，共30.956秒，所有sample成功，目錄stack-windows-delivery。這比舊1ms取樣稀疏，仍有擾動，不能當作驗收收益測試。

取樣期間正常工具列continuous-stack-delivery完成33張，全部強核驗與continuous-memory-delivery一致，原FAULT不變。首張豁免後31張成功平均88.57833/max108.18762ms，29張≤100ms；不把這批較低耗時歸因診斷或視為上限改善。沒有重現上一輪101ms timer gap：最大65ms在702ms（首張呈現附近），後續較大gap36ms在14060。gap-windows.json按command wall範圍對齊；command範圍包括symbolization，不能當成精確sample起訖。

window06主執行緒包含LocalFrameViewLayoutContext::layout/performLayout 10個巢狀樣本，RenderView/RenderBlock/文字排版；window17可見RenderGrid/RenderFlexibleBox layout、RemoteLayerTreeDrawingArea::updateRendering與CoreGraphics圖像繪製。main-06/17.txt保存子樹。這再次支持檢查實際DOM更新觸發點，但無法證明某元素或GC就是上一輪100ms停頓根因，也未再套用已否決的Grid/containment CSS猜測。

檢查具體更新路徑後，ImageRenderer.paint每次重設相同zoomLabel.textContent，ProgramFlowView.sync每次重設相同graphHeading strong文字；改為值不同才寫入，保留未變文字節點。不改文字/字體/尺寸/來源/執行事件。新增準備測試核對重複paint保留文字節點、zoom改變即時顯示200%、clear顯示—；17項image-preparation通過（/tmp/side-stable-label-tests.log），前端Vite build成功（/tmp/side-stable-label-vite.log）。此小改晚於取樣批次，尚未重新打包或桌面性能量測，不宣稱它消除了尖峰。

目前正在運行的QA app仍是memory-delivery診斷build；最新穩定標題修改僅在worktree/前端build。目標未完成，無commit/push。

## 穩定文字節點：無外部取樣的桌面複驗

上一輪WebKit取樣及兩處文字節點重用屬進展。本輪重新打包QA release成功（/tmp/side-stable-label-build.log），冷啟動正常工具列continuous-stable-label，未啟動sample或其他外部取樣器。33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes均與continuous-memory-delivery一致，32張成功decoded input/output皆1280×1024，第33張原算子FAULT不變。

首張額外139.16683ms只報告。後續31張成功平均87.60570/max108.36458ms，28張≤100ms，acceptancePassed=false。對照未帶sample的memory-delivery診斷批次91.96104/max169.61092/26張，本輪平均及最大較低，但前次約100ms呈現停頓未重現，不能把整個差值歸因兩處文字修改或保證上限。

三張超標：6a5bb056額外100.31104ms（nativeOther47.39104）；6331c4aa額外103.70479ms（bridge10.77462/unitOutside9/outside47）；3e5cb763額外108.36458ms（SDK37.76208）。其餘固定成本後續平均SDK14.44276/nativeOther29.94693/bridge5.76439/unitOutside3.80645/outside33.64516ms。圖像交付診斷仍啟用，native queue max0.01938ms、response construction max0.48667ms、responder call max2.25188ms。

同時核對尚未選中節點的預覽建立路徑：Python save_image仍會對各節點宣告的result/final/output產物建立BMP；不直接刪除，因目前raw像素除graph consumer外多為metadata-only，直接停用會破壞之後切換節點的圖像顯示。NATIVE_JSON.preview_bmp接收不可變bytes，前置raw=bytes亦確保圖像轉換與後續hash/graph retention使用同一快照；在未建立可驗證的原始像素按需保留機制前，不以移除拷貝換取競態。此輪未修改這條路徑。

當前QA app已含穩定文字更新，正常顯示與保存驗證完成，尚未達到全部後續圖像+100ms要求。無commit/push，目標未完成。

## 節點返回後年輕代回收：隔離比較，未採用

重新檢查resident交接：send_resident_result後已釋放payload/request/encoded暫存，未找到可安全移除的新持有者。新增ignored probe-node-boundary-gc.py，比較ordinary與每節點返回後gc.collect(0)/gc.collect(1)，自動GC保持啟用；完整elapsed包含額外回收及結果驗證，不清空算子globals、不改算子。33份原code SHA與結果/structuredLayers核對，原FAULT仍保留。

首次系統Python缺numpy而失敗，改用desktop/runtime/python/bin/python3。首版探針保留過多歷史證據物件樹，會干擾GC成本，結果另存node-boundary-gc-full-fixture-*，不作性能結論。修正版只保留必要request欄位與canonical結果JSON字串，釋放歷史樹後再量測；三模式均正常完成。比較檔為framework-performance/desktop-qa-01/node-boundary-gc-comparison.json。

排除首張後32份（包含原FAULT，並非桌面31成功張口徑），ordinary完整週期平均472.63893/max497.65183ms，額外平均21.16213/max44.42259ms；gen0完整平均482.97577/max512.04796，額外20.84119/max44.48516；gen1完整平均481.55792/max506.47863，額外19.62451/max21.22441。gen1雖縮小扣除算子後差額，本輪完整週期未改善，不能視為收益。單次順序比較不足以證明因果或穩定退步，亦不支持採用。

後續節點邊界強制回收gen0共96次、gen1共96次，兩者collected皆0；execute內自然gen2仍分別11次與16次（ordinary11次）。gen1未消除老年代回收，只改變回收時序。此隔離探針不含native/UI/archive，且請求所有宣告圖像輸出，不能代替桌面驗收。產品GC策略未變，未新增桌面批次。

首張僅豁免延遲門檻，仍驗證結果、顯示與保存。最新桌面仍continuous-stable-label：首張額外139.16683ms報告但不判超時；後續31張成功平均87.60570/max108.36458ms，28張≤100ms，另原FAULT。目標未完成，無commit/push。

## 已正規化圖層改用原生嚴格JSON編碼

上一輪年輕代回收隔離比較排除無完整週期收益方案，屬新證據。本輪檢查SDK保存路徑，save_layers已完成validate_structured_layers，save_normalized_json仍以Python json.dumps編碼。新增ignored probe-layer-encoding.py，32份geometry原始bytes逐份核SHA，交替順序2次warmup+20次量測，原生strict/compact與原始bytes完全相同。跨圖像median平均stdlib0.71280ms、nativeStrict0.16270ms、nativeCompact0.16197ms，證據layer-encoding-comparison.json。

產品僅將save_normalized_json的compact分支改用report_json_bytes(data)+換行，沿用既有嚴格encode_report與無native時的嚴格fallback；不再次做SDK正規化、不放寬非有限值/不支援值/循環錯誤。非compact縮排格式不變。19項native-json-contract測試通過（含20000隨機float精確拼寫、Unicode/異常/無native fallback）；隔離真實33件重放全部result/structuredLayers與JSON產物hash相同，原FAULT不變。日誌/tmp/side-layer-encoding-contract.log、/tmp/side-layer-encoding-replay.log。隔離完整週期不作桌面收益宣稱。

QA release build成功（/tmp/side-layer-encoding-build.log），重新啟動正常工具列整批continuous-layer-encoding，無外部取樣。33份durable/code資產/dispatch hash/參數/結果圖層/sourceBinding/圖像身份/raw JSON bytes均與continuous-stable-label一致；32張成功decoded input/output皆1280×1024且sourceMatches=true、無preview，第33張原算子FAULT不變。

首張額外145.40321ms只報告。後續31張成功平均84.66696/max108.71484ms，30張≤100ms，acceptancePassed=false。前輪87.60570/max108.36458/28張，平均較低但最大值未改善，不能保證全部上限。33次save_layers服務平均1.05326→0.47086ms，與局部編碼收益方向一致；不把全批差值全部歸因本次改動。

僅3e5cb763超時：額外108.71484ms，SDK36.35700/nativeOther31.54613/bridge3.81171/unitOutside4/outside33。objects的set_output24.94687ms包含自然gen2回收22.60333ms（153693物件），此時間仍完整計入。這仍是需要預留空間的真實SDK尖峰，未改GC策略或計時口徑。當前QA app含此改動，無commit/push，目標未完成。

## 原生固定成本複查與合併事實複製／計量候選

上一輪原生嚴格圖層編碼及桌面33張驗證屬進展。本輪對continuous-layer-encoding的33份SHA核驗紀錄重新分解，continuous-layer-encoding-native-budget.json：每工件native preparation平均3.063ms、verification4.442ms、retainedFacts1.611ms；exchange reportParse2.668ms、worker serialization2.134ms；Python inputs/decode2.456ms、request1.930ms、result-validation0.962ms（max17.444ms）。這些為巢狀診斷，不可與完整額外耗時重複相加。

檢查目前memory transport已不在每節點寫algorithm/request/result檔，run/outputs目錄仍是對算子公開的可寫路徑；未以刪除目錄破壞SDK行為。retain_facts則先複製完整JSON樹，再由memory_resources::json_allocation遍歷計算保留預算。新增ignored allocator-bench/src/bin/fact-clone-profile.rs隔離比較普通clone+allocation與一次遞迴同時複製/計量；沿用相同Value/array capacity/string capacity與object保守192bytes計量公式，不降低保留預算。

從33份實際紀錄（record SHA有效、code資產另核SHA）抽出99個fact bundles，包含原FAULT；保留runId/workpieceUnit/result/procedureTrace/structuredLayers/nativeResult/code。每份交替順序2次warmup+20次量測，所有候選序列化bytes與原樹一致，候選size逐次等於現行allocation對其實際拷貝的結果。production相同serde_json float_roundtrip/preserve_order及mimalloc。結果fact-clone-comparison.json：普通每份median的平均0.395794ms、合併0.533357ms（每工件換算約1.18738→1.60007ms）。即使少一次遍歷，重新構造Map等操作仍可能增加成本；未以此單獨量測斷言具體根因。

候選未採用，產品原生保留邏輯未改；沒有新增桌面批次，也未宣稱上限改善。日誌/tmp/side-fact-clone-profile.log，所有程序已正常結束。最新桌面仍continuous-layer-encoding：首張只報告，後續31成功30張≤100ms、平均84.66696/max108.71484ms，另原FAULT；目標未完成，無commit/push。

## 依使用者更正：以資料必要性重設優化方向

使用者明確要求不要糾結0.1ms量級；Agent偶爾需要的資料可透過重測指定圖片取得。本輪開始曾嘗試提前建立瀏覽器trace投影、移動完整樹而非複製，9項deferred與service/reader測試已通過，但尚未打包／桌面測試。收到更正後已完整撤回本輪該候選及其新測試；保留此前已驗證產品變更。沒有將局部clone省時作為後續主線。

新增agent-data-necessity-inventory.json，從continuous-layer-encoding全部33份SHA有效紀錄與實際code SHA核對，盤點99節點的trace outputs、產物位元組與完整graph消費關係。平均每張objects.coherent.model_data trace為1,544,910bytes，同名JSON產物1,544,911bytes（末尾換行）；兩處重複保存。所有trace具名輸出平均合計約1.67MB，其中geometry_data在objects與relation各約43KB、edges.selected約34KB。objects的model_data、edge_data（約134KB）、geometry_data（約43KB）、search_data，以及unweld_data均無下游graph consumer。這不代表可刪除算子內部modeldata等運算變數，而是它們的診斷快照／編碼／傳輸／保存不必每張執行。

建議產品政策：
- 普通檢測保留原圖／原圖資產身份、實際程式版本與參數／必要環境版本、最終result及分類、必要boundaryChecks、節點成功／故障狀態與簡要錯誤、下游實際消費的shared_gray/shared_data，以及當前輸出畫面的必要圖像。原圖與固定程式可引用既有資產，不必每件另複製。
- 大型procedureTrace.outputs（模型候選、搜尋明細、selected、重複geometry_data）預設不做完整快照；保留步驟身份／狀態／輸出名稱與明確未採集標記。boundaryChecks與判定輸入不能一併略過。
- 無下游消費的plain JSON診斷產物預設按需；Agent指定圖片／節點診斷重跑時完整採集。geometry由save_layers產生，不能僅因graph契約寫plain JSON就刪除；需根據實際畫面／結構圖層消費獨立判定。切換到未採集的中間輸出也應明確提示重跑，不能呈現空資料或舊圖片冒充本次輸出。
- 普通執行保留足夠重跑條件，按需診斷另建新run並連結原run；新結果不能冒稱歷史當時的快照。若原圖／程式／環境不可取得，應明確拒絕同條件重跑。
- 不以低解析度縮放代替資料政策；此前預覽試驗沒有證明完整週期收益。畫面需要時可獨立使用適配尺寸預覽、放大／取像素回原圖，但不影響算法原始解析度。

目前SDK與Agent契約宣稱expected_outputs皆為實際完整產物，宿主audit缺項會FAULT；因此不能只在save_json/set_output短路而不更新資料採集契約。下一步需把普通檢測／指定圖片完整診斷作為明確政策，讓SDK、產物audit、保存、Agent讀取與UI共同識別「未採集，可診斷重跑」。驗收仍要求算子原碼／參數／原圖、判定、必要下游資料與畫面一致；對按需資料以診斷重跑驗證，不能用偽空資料通過完整證據檢查。此政策分析未直接改產品預設，也未新增桌面批次。

## 日常過程輸出不採集，指定圖片可完整診斷重跑

延續使用者資料必要性的指示，本輪落實第一條採集政策，而非繼續調整微小複製成本。ProcedureTrace新增full/essential模式，預設full以保持獨立試算相容；workpiece-runner在普通inspection且未指定diagnostics時傳essential。set_output保留boundaryChecks、None/bool/int/float及≤1024字元的普通字串；其他診斷輸出不呼叫trace_value、不建完整快照，記錄agentcv-uncaptured-procedure-value-1 / NOT_CAPTURED。仍回傳算子的原value，未改算子原碼／參數／實際算法變數。這是明確改變診斷採集契約，不是假造空值，也不是把完整值延後解析。result、structuredLayers、圖像、上下游資料、獨立JSON產物暫時全部保留；invoke/inputs等其他trace路徑亦未在此輪停用。

run_workpiece_scheme/run_dataset_scheme增加diagnostics:boolean與expected_scheme_fingerprint。Agent診斷請求必須明確指定圖片或units；runner在派發前拒絕方案指紋不符。diagnostics:true回到full過程採集，產生新run，不回填歷史。單獨run_algorithm原有full預設不變，開啟階段保存的inline模式也維持full。diagnostic-capture.js供Agent讀取、摘要與外部匯出使用：NOT_CAPTURED讀取不回傳空資料，提供原runId、明確圖片與方案指紋的診斷重跑參數；缺身份時不提供可用重跑配方。此配方是重新執行目前相符方案，不宣稱復原歷史環境／隨機狀態。

5項Python採集測試通過，涵蓋昂貴tolist絕不被觸發、set_output回傳原物件、真實boundaryChecks及非有限值處理、full快照隔離、無效模式；44項workpiece-runtime測試通過，含實際Python派發兩種模式及指紋不符零派發；讀取／Agent選圖／畫面提示相關測試通過。日誌/tmp/side-procedure-capture-tests.log、/tmp/side-essential-trace-runtime-suite.log、/tmp/side-diagnostic-capture-js-tests.log、/tmp/side-essential-trace-external-tests.log。

ignored probe-trace-capture-replay.py以full及essential各重放原33件、99節點。原code SHA、status/result/structuredLayers、JSON產物SHA一致；full所有過程輸出與原紀錄一致；essential除明確未採集輸出外，步驟身份／依賴／狀態／參數／artifactIds與所有boundaryChecks一致。原第33件FAULT不變。兩個探針與build／測試有重疊，且包含驗證工作，故不以其耗時作性能收益證據。

QA release build後冷啟動正常工具列continuous-essential-trace，無外部取樣。33份durable/code資產/dispatch hash/參數/result/structuredLayers/sourceBinding/圖像身份/raw JSON bytes與continuous-layer-encoding一致。另逐一比對所有trace必要欄位及輸出名稱，229個診斷port明確未採集，99節點皆標essential，boundaryChecks未被省略。資料比較essential-trace-data-comparison.json：平均每工件保存trace 1,693,819.58→32,599.79 bytes；worker report 1,400,113.48→214,848.24 bytes。這是停止建立重複診斷快照的實際結果，並非只縮小畫面呈現。

首張額外116.15025ms只報告。後續31成功圖像額外平均75.36546/max137.18167ms，30張≤100ms，acceptancePassed=false；完整週期平均541.03226→530.35484ms，算法平均456.36530→454.98937ms。SDK平均13.92982→10.33379ms、nativeOther29.92066→21.04843ms。單批仍有獨立尖峰，不能宣稱全部上限已達標。efce9be2超標，nativeTransit28ms、body讀取1ms、同窗timer gap56ms/rAF73ms，已觀測同步span聯集7ms；不猜測GC／OS根因，也不扣除這段耗時。

實際桌面讀取發現外部檔案入口仍叫「完整數據」，已改成「已保存數據」，新增日常未採集／指定圖片診斷重跑／不回填歷史提示；AlgorithmRunView提示在rerender後保留。外部result.json附diagnosticRerun。第二次QA build僅補此讀取提示與匯出配方，已冷啟動並在真實「程式與紀錄」入口觀察到提示與新標籤。UI導出的external-records/146545d8e1f99f76f72d261789213c69b197c57a213e7228fcb30e06c0670cd2/result.json核對essential及diagnostics:true、原圖ID與scheme fingerprint均存在；未透過Agent聊天發送指令。未因提示修改另跑性能批次。

尚未停用無下游消費的獨立model_data/edge_data/geometry_data JSON產物，也未完成所有按需中間圖像政策；下一步沿資料必要性處理該部分，不回到0.1ms微調。當前QA app含essential採集及讀取提示，原FAULT仍存在，目標未完成，無commit/push。


## 日常省略未被下游消費的診斷 JSON：實際桌面驗證

本輪續作前檢查 authoritative 日誌：native capture 4 passed、3 個明確診斷測試 ignored；JavaScript 17 passed，另 program-visual-evidence-audit 因缺少既有 reviews/2026-10-27-program-flow/actual-pi-workspace-portable.agentcv.json 而未執行，不能算通過。上輪為檢查證據與政策對齊，本輪實際完成打包、原圖重放與桌面驗證。

普通 inspection essential 模式由宿主根據已核對方案計算 optionalJsonArtifactIds，只適用純 JSON 契約、非 result/final 且無 graph 下游消費者；SDK save_json 跳過這類診斷產物的正規化、編碼及保存。boundary section 與 save_layers 路徑保留。未採集產物使用明確 collection/NOT_CAPTURED，沒有虛構 sha256、bytes、data 或資產。宿主核驗採集政策、資料契約、workspace 保存與 Agent reader 一致識別；摘要保留 collection，audit 明列 uncapturedArtifacts。這不是省略算子內部計算，也未改原算子。此政策並不等於任意未消費資料皆可刪除：必要結果、圖層、邊界與 typed contract 仍保留。

probe-artifact-capture-replay.py 使用原 33 張與實際 code SHA，各跑 essential/full。兩種均逐一比對原 status/result/structuredLayers、保留 JSON SHA、步驟身份/狀態/參數/依賴及 boundaryChecks。essential 明確未採集 165 項（objects search_data/edge_data/model_data/geometry_data 及 unweld_data 各33）；full 0 項未採集，所有原 JSON SHA 及完整 trace 恢復一致。這是新執行的觀測，不能冒稱還原歷史環境。探針包含驗證成本且 essential 與 build 重疊，不作性能驗收數據。

QA release build 通過（/tmp/side-optional-json-build.log），冷啟動正常工具列連續33張，continuous-optional-json。新獨立 collector 明確區分保留的 byte-identical JSON 與未採集項目，不沿用所有 raw JSON 相同的舊斷言。33份持久化紀錄、code資產/dispatch SHA、參數、scheme、result、structuredLayers、sourceBinding、原圖身份比對一致；省去165份診斷JSON，共56,811,851 bytes。32張成功均核對原解析度1280×1024的輸入輸出、sourceMatches、preview關閉與兩次presentation opportunity；沒有以低解析度獲得此結果。

首張額外107.906498ms只報告；後續31成功全部≤100ms，額外平均67.287381ms/max86.813170ms。平均SDK6.426747、nativeOther17.238293、bridge5.590083、unitOutside3.677419、outside34.354839ms。正常持久化、畫面尾段與排程均計入，未手動flush或扣除尖峰。單批成功不是所有輸入/所有執行的上限保證，仍需後續穩定性確認。

第33張原有StructuredLayerContractError仍保留，32成功/1FAULT，整體acceptancePassed=false，目標未完成。沒有更改算子、放寬幾何核驗或將故障排除後宣稱完整驗收。無commit/push。證據位於framework-performance/desktop-qa-01/continuous-optional-json-{comparison,audit,display-check,observation,execution}.json及artifact-capture-replay-{essential,full}.json。


## 採集政策後的穩定性複測、低解析度對照及原故障定位

上輪為實際進展：完成optional JSON打包/33件兩模式重放/桌面測試。此輪先核對現有diff及證據，未繼續0.1ms微調。正常同程序第二批continuous-optional-json-repeat的31張受限成功件，額外平均70.649342/max133.814836ms，30/31≤100ms，完整週期平均520.129032ms。33份結果/圖層/程式/參數/保留JSON與初始對照一致。超標b18dd0d1：start1551ms、unit結束2062ms、output commit2064ms，presentation checks2078及2161ms；timer gap82ms/rAF gap約81ms。已觀測同步view render5ms在2068ms結束；預取下一圖2168ms才開始。不能將83ms停頓指認為某個未觀測GC/OS/圖像根因，亦未從週期扣除。analyze-delivery-stalls只篩bridge延遲，該批空rows不代表無呈現延遲。

為回答低解析度顯示是否有整體收益，在現有資料政策基礎上以VITE_INSPECTION_QA_PREVIEW=1獨立build（不改產品預設），執行cold/warm兩批。continuous-optional-json-preview：首張原圖、其餘31成功輸出704×563，輸入始終1280×1024；額外平均69.013142/max93.318704ms，31/31≤100，完整週期平均524.645161ms。repeat：32成功皆預覽，額外平均71.984490/max93.902874ms，31/31≤100，完整週期平均519.258065ms。真實桌面截圖觀察到輸入與輪廓疊圖正常。兩批成功最大較低，但平均成本沒有一致收益，不能據此承諾消除偶發停頓或直接啟用預設；恢復不帶QA_PREVIEW的build。保留該功能作可選研究，沒有改算子解析度。

補強圖像保真證據：四批各165個image artifact的sha256/bytes/width/height/channels/dtype/rasterEncoding與continuous-essential-trace逐一一致；每批32成功的sourceMatches、原圖尺寸及兩次presentation checks身份核對通過。optional-json-display-comparison.json保存結果。collector補上此核對，並仍區分診斷JSON未採集與保留JSON位元組相同，不虛構已保存的原圖產物內容（既有metadata-only圖像保留政策不在此輪修改）。

原FAULT重新定位：probe-original-fault.py只重跑同一故障圖片與原code/參數，包裝validate_structured_layers觀察入口參數後呼叫原驗證器並原樣拋錯；未改算子。save_layers之前的raw objectId=pkg-model，首點實際repr為{'x': nan, 'y': nan}。錯誤不是JSON省略、序列化或框架將有限值轉為None。原code第348行建立pkg-model輪廓、第361行save_layers失敗；original-fault-raw-full.json記錄raw值與baseline相同status/result/layers/JSON核對。該探針含診斷及build競爭，耗時不作驗收。不得以填0、刪點或放寬finite核驗宣稱圖像正常。

整體仍未驗收：原33件包含固定算子FAULT，原解析度複測亦仍有一張額外133.8ms。無commit/push；本輪未改產品算法或偷偷排除失敗圖片。後續應針對剩餘實際必要的呈現/資料工作，不能把已成功單批當作最大週期保證。


## 原算子限制與正常執行驗收的阻塞審核

本輪重新讀取目前Agent資料讀取/採集契約、桌面排程與原FAULT證據，沒有新增未驗證的產品改動。原始NaN故障在最近至少三個連續goal回合均存在；此輪再次對continuous-optional-json、repeat、preview-repeat的故障紀錄驗證record SHA，並核對原方案code SHA與實際dispatch SHA一致。所有objects均FAILED，同一StructuredLayerContractError。原始save_layers參數pkg-model首點為NaN的探針證據仍在。保持算子不變時，不能正當地聲稱該圖片成功產生有效幾何。

已向使用者提出驗收語義澄清：框架如實報告並隔離既有算子FAULT，是否符合「程序執行正常」；或每張必須成功而需另評估算子修復。不是自行縮小範圍，也沒有改算法、補0或刪掉故障圖。+100ms要求未取消；原解析度仍有一次額外133.8ms呈現停頓，不能宣稱性能驗收完成。前面已做資料採集政策與低解析度對照等有實際效益/判別力的工作；在此約束衝突未釐清前，停止無止境重跑相同輸入或猜測微小優化。目標為blocked而非complete，待使用者釐清後繼續。所有本地改動保留，無commit/push。


## 使用者停止速度工作：修復執行中主畫面切圖回歸

使用者明確要求不再提升速度，優先修復已反覆出現的執行中切圖失效。本輪沒有性能優化或速度驗收。查得三層問題：resolveNodeOutput無條件採用active execution；completed display以完成當下的selection revision重新取得顯示權；NodeOutputView在無新輸出且hasFrame時無條件提前返回，連手動選擇的輸入也不更新。另外app批次收尾以navigation.batch直接選最後圖片，圖像源busy又禁止縮圖/前後/鍵盤瀏覽。

修正：runner從批次開始固定selectionRevision（未初始化正規化為0），所有live/completed publication沿用此版本；手動選圖後不再跟隨該批次，後續完成不得重取顯示權。resolveNodeOutput尊重這個版本。畫面區分同次自動進度的保留與手動選取沒有輸出的圖片，後者更新輸入與空結果，不能持續顯示他件輸出。已有輸出的慢載入仍保持成對原子提交與舊請求失效保護。app收尾只有選取版本未變時才自動選最後圖/讀回最後紀錄。圖像源busy期間縮圖、前後和方向鍵改為瀏覽，不啟動競爭任務；canvas來源同樣避免執行中再次派發。

node-output-memory新增真實App bundle + 真實Python/OpenCV整合回歸：從已完成畫面開始、讓兩件執行器停在受控gate，透過真實來源縮圖選未執行的第三張，驗證輸入圖/空輸出/當前身份在執行中、下一件開始、整批結束均保持；再切回已完成及未執行圖。另涵蓋來源dialog自己busy的單件執行，切圖不能派發第二個任務。原有自動選圖UI斷言更正為手動重選須顯示該圖；修正舊測試誤選img而非button、直接修改凍結快照與失敗注入繞過readImageDisplay的過時寫法。

最後scripts/check-selection-regression.mjs 11/11通過，並加入package-local.mjs正式打包的前置硬門檻；失敗即拒絕交付。workpiece-runtime本輪44項通過。曾跑額外node-output-view.test.mjs，既有2項失敗（未等待async輸出、流程問答composer）；沒有將它們宣稱通過，未擴大至無關問答修復。切圖/多輸出paging/慢載入/過期返回由上述實際bundle整合測試覆蓋。

QA app真實桌面操作：正常連續執行中打開圖像源、方向鍵選10_2.bmp，提示「已切換瀏覽圖片；目前檢測繼續執行」。關閉來源面板後，16/33時主畫面輸入仍10_2.bmp；33/33結束後輸入及流程來源仍10_2.bmp，沒有強制選最後FAULT圖。另驗證停止執行後保留手選圖。這是功能驗證，含人工切圖/開窗，不作性能數據。原算子FAULT未修改。

正式npm run package成功，簽名核驗成功，交付/Users/liangshiben/13-cv/AgentCV.app（0.16.9），receipt desktop/runtime/local-app-install.json；沒有替換運行中的程序。日誌/tmp/side-selection-production-package.log、/tmp/side-selection-release-gate.log。正式包包含全部產品修復；其後只增加測試和未來打包門檻，沒有再改前端。無commit/push。
