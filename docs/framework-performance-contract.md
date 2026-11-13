# Rust inspection framework latency contract

Version 1, 2026-11-11. Goal: framework overhead <50 ms per complete desktop
inspection. Algorithm source, parameters, search rules and classifications stay
unchanged. The existing 0.16.9 project is the frozen specimen; the original
pre-optimization scheme must also remain executable.

## Timing oracle

Start at the actual desktop Execute click. Finish only after successful durable
record commit, enabled operation controls, current original and result image
decoded and displayed. Include auto-navigation when enabled; report it separately
as well. Report cold starts separately, never mix them into warmed percentiles.

Algorithm time is the actual user program execution interval minus measured SDK
services (output handling, instrumentation, validation). Do not subtract the whole
Python/node/worker interval: decode, IPC, trace construction and serialization are
framework work. Nested timings must not be added twice. Keep a conservative
inclusive-program figure alongside the stricter algorithm-only metric.

Acceptance needs real Windows Tauri desktop runs, unchanged code hashes, matching
numeric results, original/result pixels, RGB, scaling/maximize, original/output
inquiry to the main Agent, source navigation, cancellation at node boundaries,
record reopen, actual failure propagation, and bounded memory across repeated runs.
No default PNG debug capture. Saving must remain acknowledged, with errors visible.
All requested functionality stays in the timing boundary.

## Architecture under implementation

Rust owns compiled sessions, resource lifetimes and supervision. A persistent
Python extension remains for arbitrary existing algorithms. Ordinary inspection
uses bounded framed messages and immutable memory handles instead of per-node
request/result/log files and Base64 image JSON. A native image resource protocol
serves output pixels directly. SDK values retain their existing public semantics.
Durable records retain measurement facts, graph/source/parameter identity and
evidence; runtime pixels remain memory-only unless debug capture is requested.

Optimization priorities: remove file/encoding roundtrips, remove redundant
serialization/validation of immutable plan definitions, separate presentation
refresh from execution, and then move graph scheduling across the bridge. Debug
and recovery routes remain explicit and preserve original evidence.

## Evidence and gates

Disposable artifacts: workspace root/framework-performance/. Never operate the
user's original project or production profile for measurement. Verify native QA
identifier, project root, code hashes, Python availability and input content
before runs. Preserve unrelated/generated worktree changes.

Every run writes specimen, timestamps, result.json, per-phase observations,
native console-window events and screenshot. A failed identity, changed result,
missing image or record failure invalidates performance acceptance. The <50 ms
gate remains unmet until demonstrated; partial improvements are not completion.
