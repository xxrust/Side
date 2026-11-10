# Codex CLI / ACP integration

The desktop host runs `@agentclientprotocol/codex-acp` 2.5.0 over ACP v1 JSON-RPC stdio. That adapter starts the installed Codex CLI App Server. AgentCV retains its existing UI-to-host event contract and exposes its actual project tools through a session-scoped MCP stdio relay. Codex keeps its native shell/file tools and agent loop.

## Runtime selection

New profiles default to `codex`. The desktop performs a one-time migration of an existing `pi` selection and saves `agent-profile.json.before-codex`. The migration marker is `codex-default-v1.json` beside the profile. Later explicit selections of Pi remain respected. Both built-in adapters appear in the existing runtime settings.

The installed Codex CLI must be available. Native startup passes its discovered executable through `AGENTCV_CODEX_PATH` / `CODEX_PATH`. Authentication uses that CLI's existing account. `/login` and `/logout` explain the corresponding terminal commands. In-app Codex authentication is not implemented in this change.

## Commands and sessions

- `/model` opens model settings. `/model <model-id>` calls the ACP model operation. The selected model and reasoning variant persist in the adapter's local session index.
- `/goal <objective>` passes the original command to Codex. It receives the native active/paused/complete state via the adapter's negotiated goal metadata extension. AgentCV keeps the initiating turn and guarded project tools available through goal continuations.
- `/goal pause`, `/goal resume`, and `/goal clear` retain native meanings. Pause/clear controls can be sent while the turn is active. `/stop` cancels the foreground operation and pauses an active goal.
- `/status`, `/compact`, `/mcp`, `/skills`, and the adapter-advertised commands are forwarded. `/help` includes the runtime command list.
- `/new` starts a fresh main conversation. Existing saved canvas-thread sessions remain indexed.
- Canvas threads and the main project's stable board identity map to persisted Codex session IDs. Reopening uses ACP `session/load`. Replayed messages do not append duplicate current chat output.

ACP permission requests retain their tool identity. AgentCV's own MCP calls are allowed once through the existing tool guard. Other requests display Allow/Reject buttons. Cancel, disconnect, and session mismatches reject pending tools. Each MCP relay token belongs to one session and can access only its active AgentCV turn.

Enabled CV skills retain the platform's bounded, hashed reader and audited writer. Pi extensions are not automatically executed inside Codex. The runtime advertises skills as offered resources until actually read. Images remain native MCP/ACP image content. UI diagnostic events omit raw tool-output pixel copies.

## Local verification

Evidence is under `desktop/runtime/codex-validation/` in this worktree. It includes the real CLI model list, native command discovery, model switching, persistent session marker recovery, native goal completion, migration followed by an explicit switch back to Pi, and live real-image transport. Integration-test adapters operate on an isolated copy of saved project metadata and original image bytes.

Run the focused protocol and profile regression checks with:

```sh
node --test qa/json-rpc-peer.test.mjs qa/codex-host-commands.test.mjs qa/agent-resources.test.mjs
```

The worktree starts at commit `1812614`. Uncommitted changes in the primary checkout were not copied. The produced application bundle is local to this worktree. Deployment to the primary desktop installation is a separate step.

Verified on 2026-11-04 with installed `codex-cli 0.166.0-alpha.5.1`:

- [x] 27 focused protocol/profile/command checks pass.
- [x] CLI model listing and model change use the real ACP adapter.
- [x] Native `/goal` reads the actual package manifest and reports active → complete. Clear removes the goal.
- [x] A remembered marker survives terminating and restarting the host through ACP session loading.
- [x] Real 1280 × 1024 skew BMP reaches Codex through `get_visual_image`.
- [x] Codex submits code through the existing `runAlgorithm` platform function and actual Python/OpenCV runtime. It handles structured validation failures and retries successfully. Result mean is `48.953120422363284`, with real `gray` image and `stats` JSON artifacts. This validates integration, not skew classification accuracy.
- [x] One-time Pi → Codex migration preserves the original profile backup. A later explicit Pi choice starts the real Pi engine successfully.
- [x] Frontend production build, Rust check, desktop packaging and local signature verification pass.

The older `agent-thread-sessions.test.mjs` still depends on a historical review fixture absent from this worktree. Its four ENOENT failures are recorded in `runtime/codex-validation/regression.log`. The new command tests use the current Workspace constructor and exercise the affected command paths directly. Full-suite success is not claimed.

## Primary checkout merge — 2026-11-05

Merged `codex/codex-cli-acp` (`cb9b4c9`) into `codex/source-meaning-model-20261103` after `ec3af77`. Version-only conflicts use 0.16.0. The primary checkout's reference-only image transport, file-backed inputs, persistent output DOM, and source-strip improvements remain in place.

- 39 focused checks pass: JSON-RPC, Codex host commands, agent resources, node output, source preview ordering, and visual inquiry. The output tests include actual Python/OpenCV artifacts.
- `npm ci`, production desktop packaging, and strict deep signature verification pass.
- Live ACP initialization succeeds with Codex CLI 0.166.0-alpha.5.1, but `session/new` fails with `failed to load workspace requirements: other error`. The same direct probe fails in the unchanged Codex worktree, so this is not a merge conflict regression. Live conversation acceptance remains blocked by this CLI startup condition.
- The built bundle has not replaced or restarted the user's installed application. Prior validation above describes the original worktree's earlier run, not a successful live session in this merged build.

### Startup recheck after server upgrade — 2026-11-05

After the user's Codex server upgrade, the same packaged-host probe succeeds: `ready` reports adapter `codex`, model `gpt-6.1-terra[high]`, and `/status` finishes with `turn_end` and exit 0. The earlier workspace-requirements startup blocker no longer reproduces. Native computer control also works again. Opened the merged build directly from `desktop/src-tauri/target/release/bundle/macos/AgentCV.app`; the saved project and input/output images restored, and the expanded conversation visibly reports `Codex CLI · ACP · codex / gpt-6.1-terra[high]`. This verifies startup/status and desktop connection, not a new algorithm-development run. The separate repository-root application bundle was not replaced.

## Image manager runtime repair — 0.16.1

The separate `image-manager.mjs` worker previously bypassed runtime selection and read Pi's credentials directly. It now follows the selected `codex`/`pi` adapter, preserves an independently configured model, and rejects unsupported adapters rather than silently falling back. The Codex role uses the same discovered CLI executable/account, an isolated metadata session, and validated candidate JSON; permission requests are denied and no project MCP server is exposed to this role. UI/model validation still requires human confirmation before applying labels.

Removed the hardcoded assistant greeting from display and request history. Progress and failures are system states, and successful discussion retries clear obsolete initial errors. Default manager model is `gpt-6.1-terra`; existing explicit model choices remain respected.

Verification: 12 focused runtime/protocol/command tests pass. Real CLI requests over the actual 56-file lid folder metadata completed initial analysis and a separate test follow-up, returning five candidate folder categories; no pixels were sent and no test candidates were applied to the user's project. Native 0.16.1 UI displayed a genuine `gpt-6.1-terra[low]` reply. The older `qa/image-manager.test.mjs` suite cannot start because its historical `20261031-source-label-regression/session-project-readonly.agentcv.json` fixture was deleted; it is not counted as passing. No historical user data was recreated.

Call-site audit: the executable model session entry points are the selected main host adapter and this role worker. `pi-bridge.mjs` and `pi-auth.mjs` remain intentional support for explicitly selected Pi. This audit does not promise that external third-party adapters are supported by the manager.
