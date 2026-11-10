# Real-image batch bridge

`node desktop/scripts/agentcv-benchmark-batch.mjs --help`

The batch bridge is a headless client of the existing `runAlgorithm` API and `cv-runtime.py`, not a parallel CV execution implementation. Each sample has its own Workspace, so multiple workers do not bypass per-project execution locks.

```json
{"schema":"agentcv-blind-batch-1","dataset":"public dataset","split":"frozen test","samples":[{"id":"opaque-id","images":[{"path":"/absolute/input.png","role":"test"}]}]}
```

Pass `--manifest FILE --program PY --parameters JSON --justification JSON --expected-outputs JSON --out DIR --jobs 2`. The Python SDK exposes genuine `image`, `images`, `image_records`, `parameters`, `cv2`, `np`, `procedure`, `step`, `save_image`, `save_json`; assign predictions to `result`. Input image filenames visible to Python are opaque, role-bearing names. GT and class directories are absent from the dispatch source. This is operational separation, not an OS sandbox. Review arbitrary Python code for GT access and preserve genuine split/model provenance.

Artifacts include `batch-results.json`, CSV, immutable per-sample `request.json`, runtime `result.json`, enriched `run.json`, `workspace.agentcv.json`, native image/JSON files and `rerun.sh`. `--no-workspaces` reduces full-test storage; retain some loadable sample Workspaces. A missing or failed sample is recorded without stopping later samples. Every run stores input/code/parameter hashes; parameter values resolving to existing files are hashed as model/script provenance. Directory-valued models need their own file inventory.

Program success and three-evidence audit status are separate from predictive accuracy. The bridge does not read GT or compute accuracy: dataset-specific external scorers must use genuine GT, publish formulas/split sizes/unknown policies, and retain failure overlays. A step without its own complete triad remains diagnostic even when Python succeeds.
