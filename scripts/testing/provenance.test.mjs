import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sourceIdentity, verifyBuild, writeBuildStamp } from './provenance.mjs';

const execute = promisify(execFile);
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'squidware-provenance-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('squidware-provenance-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const git = (...args) => execute('git', ['-C', root, ...args], { windowsHide: true });
  await git('init');
  await fs.writeFile(path.join(root, '.gitignore'), 'dist/\nelectron/\n.qa/\n');
  await fs.writeFile(path.join(root, 'pnpm-lock.yaml'), 'fixture lock\n');
  await fs.writeFile(path.join(root, 'source.txt'), 'original source\n');
  await git('add', '.');
  await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
  await fs.mkdir(path.join(root, 'dist'));
  await fs.mkdir(path.join(root, 'electron'));
  await fs.writeFile(path.join(root, 'dist/index.html'), '<main>built</main>');
  for (const name of ['project', 'preferences']) await fs.writeFile(path.join(root, `electron/${name}-codec.cjs`), 'module.exports = {};');
  return { root, git };
}

test('a passing build cannot certify edited source, lockfiles, or new untracked source', async t => {
  const { root } = await fixture(t);
  await assert.rejects(verifyBuild(root), /pnpm build/);
  const original = await sourceIdentity(root);
  await writeBuildStamp(root, original);
  assert.equal((await verifyBuild(root)).source.revision, original.revision);
  for (const file of ['source.txt', 'pnpm-lock.yaml', 'new-source.txt']) {
    const target = path.join(root, file);
    const previous = await fs.readFile(target).catch(() => null);
    await fs.writeFile(target, 'changed\n');
    assert.notEqual((await sourceIdentity(root)).contentHash, original.contentHash);
    await assert.rejects(verifyBuild(root), /stale/);
    if (previous) await fs.writeFile(target, previous); else await fs.rm(target);
  }
  await verifyBuild(root);
});

test('modified output or an edit during a build cannot inherit an earlier success stamp', async t => {
  const { root } = await fixture(t);
  const before = await sourceIdentity(root);
  await writeBuildStamp(root, before);
  await fs.writeFile(path.join(root, 'dist/index.html'), 'different build');
  await assert.rejects(verifyBuild(root), /output changed/);
  await fs.writeFile(path.join(root, 'source.txt'), 'edited during build');
  await assert.rejects(writeBuildStamp(root, before), /Source changed during/);
});

test('committing identical working contents keeps build identity while recording the current revision', async t => {
  const { root, git } = await fixture(t);
  await fs.writeFile(path.join(root, 'source.txt'), 'work in progress\n');
  const before = await sourceIdentity(root);
  assert.equal(before.dirty, true);
  await writeBuildStamp(root, before);
  await git('add', 'source.txt');
  await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'commit tested contents');
  const after = await sourceIdentity(root);
  assert.notEqual(after.revision, before.revision);
  assert.equal(after.dirty, false);
  assert.equal(after.contentHash, before.contentHash);
  await verifyBuild(root, after);
});
