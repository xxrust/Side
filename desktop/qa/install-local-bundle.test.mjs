import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {installLocalBundle} from '../scripts/install-local-bundle.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentcv-install-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  return {root, destination: path.join(root, 'AgentCV.app'), prepared: path.join(root, '.prepared.app')};
}
async function bundle(location, version) {
  await fs.mkdir(location, {recursive: true});
  await fs.writeFile(path.join(location, 'version'), version);
}

test('repeated successful installations keep only the newest bundle', async t => {
  const {root, destination, prepared} = await fixture(t);
  await bundle(destination, 'old');
  for (const version of ['new', 'newest']) {
    await bundle(prepared, version);
    await installLocalBundle(prepared, destination);
    assert.equal(await fs.readFile(path.join(destination, 'version'), 'utf8'), version);
    assert.deepEqual(await fs.readdir(root), ['AgentCV.app']);
  }
});

test('failed replacement restores the previously installed bundle', async t => {
  const {root, destination, prepared} = await fixture(t);
  await bundle(destination, 'working');
  await assert.rejects(installLocalBundle(prepared, destination), {code: 'ENOENT'});
  assert.equal(await fs.readFile(path.join(destination, 'version'), 'utf8'), 'working');
  assert.deepEqual(await fs.readdir(root), ['AgentCV.app']);
});

test('first installation leaves no rollback directory', async t => {
  const {root, destination, prepared} = await fixture(t);
  await bundle(prepared, 'first');
  await installLocalBundle(prepared, destination);
  assert.equal(await fs.readFile(path.join(destination, 'version'), 'utf8'), 'first');
  assert.deepEqual(await fs.readdir(root), ['AgentCV.app']);
});
