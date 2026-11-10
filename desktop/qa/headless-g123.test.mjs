/**
 * G1–G3 headless acceptance (hybrid, from Origin PR #1 intent + Codex AgentOps).
 * Interaction-first: ops go through AgentOps/CLI; synthetic adapter only — no CV accuracy.
 * Run: node --test qa/headless-g123.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {AgentOps} from '../src/agent-ops.js';
import {optionBCompliant, blockedByOnlyRequires} from '../src/regression-reporter.js';

const proposal = JSON.parse(await readFile(new URL('./fixtures/dag-v02/proposal.json', import.meta.url)));

test('G1: no-window script — create → bare-shares gate → run → read blocked_by', async () => {
  const ops = new AgentOps(undefined, {
    Locate: async () => ({status: 'failed', field: 'params.roi', evidence: 'synthetic', conformance: 'unknown'}),
    Offset: async () => ({status: 'succeeded', metrics: {confidence: .8}, evidence: 'synthetic', conformance: 'unknown'}),
    Defect: async () => ({status: 'succeeded', metrics: {confidence: .8}, evidence: 'synthetic', conformance: 'unknown'})
  });
  assert.equal(ops.create(proposal).status, 'accepted');
  const bare = {
    nodes: [{...proposal.nodes[2], id: 'orphan'}],
    edges: [{id: 'bare', from: 'loc', to: 'orphan', kind: 'shares', contract: {version: 'current'}}]
  };
  const rejected = ops.accept(bare);
  assert.equal(rejected.status, 'invalid_proposal');
  assert.equal(ops.list().nodes.length, 3);
  await ops.run();
  const runs = ops.status();
  assert.equal(runs.loc.status, 'failed');
  for (const id of ['offset', 'defect']) {
    assert.equal(runs[id].status, 'blocked');
    for (const b of runs[id].blocked_by) {
      const edge = ops.list().edges.find(e => e.id === b.edgeId);
      assert.equal(edge.kind, 'requires');
    }
  }
});

test('G2: report lands on disk — Agent reads JSON validation without desktop', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentcv-g2-'));
  const project = join(dir, 'project.json');
  const out = join(dir, 'out');
  const input = join(dir, 'proposal.json');
  await writeFile(input, JSON.stringify(proposal));
  const cli = (...args) => JSON.parse(execFileSync(process.execPath, ['scripts/agentcv.mjs', ...args, '--project', project], {encoding: 'utf8'}));
  cli('init');
  assert.equal(cli('create', '--input', input).status, 'accepted');
  cli('run-all', '--adapter', 'qa/fixtures/dag-v02/synthetic-adapter.mjs', '--out', out);
  const report = JSON.parse(await readFile(join(out, 'runs.json'), 'utf8'));
  assert.equal(report.schema, 'agentcv-regression-0.2');
  assert.equal(report.validation.option_b_compliant, true);
  assert.equal(report.validation.blocked_by_only_requires, true);
  assert.ok(report.summary.total_nodes >= 3);
  assert.match(await readFile(join(out, 'report.html'), 'utf8'), /方案 B/);
  assert.match(await readFile(join(out, 'report.svg'), 'utf8'), /<svg/);
});

test('G3: UI is optional consumer — workspace intent via AgentOps, no second write path', () => {
  const ops = new AgentOps();
  assert.equal(ops.create(proposal).status, 'accepted');
  ops.setWorkspace({
    assets: [{id: 'i1', name: 'a.png', mime: 'image/png', dataUrl: 'data:image/png;base64,AA=='}, {id: 'i2', name: 'b.png', mime: 'image/png', dataUrl: 'data:image/png;base64,AA=='}],
    boards: {loc: {zoom: 1, x: 0, y: 0, selected: ['i1'], draft: 'ROI relation?', bubbles: [], pins: [{objects: ['i1', 'i2'], name: 'center', ax: 0, ay: 0, bx: 10, by: 0}]}}
  });
  const snap = ops.snapshot();
  assert.equal(snap.assets.length, 2);
  assert.equal(snap.boards.loc.pins.length, 1);
  assert.equal(optionBCompliant(snap), true);
  assert.equal(blockedByOnlyRequires(snap), true);
  // Same object model round-trips through save/load — UI would call the same AgentOps
  const again = new AgentOps();
  again.load(ops.save());
  assert.deepEqual(again.snapshot().boards.loc.pins, snap.boards.loc.pins);
});
