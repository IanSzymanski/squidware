import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runProcess } from './process.mjs';
import { runChecks, selectSuites } from './suites.mjs';
import { outputDirectory } from './launcher.mjs';
import renderer from './renderer.cjs';

async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'squidware-harness-'));
  t.after(async () => {
    const target = path.resolve(directory);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('squidware-harness-'));
    await rm(target, { recursive: true, force: true });
  });
  return directory;
}
test('nonzero exits retain stdout/stderr and cannot report success', async t => {
  const directory = await temporary(t); const logFile = path.join(directory, 'failure.log');
  const result = await runProcess(process.execPath, ['-e', "console.log('before failure'); console.error('specific failure'); process.exitCode=7"], { logFile, live: false });
  assert.equal(result.status, 'failed'); assert.equal(result.exitCode, 7);
  const log = await readFile(logFile, 'utf8'); assert.match(log, /before failure/); assert.match(log, /specific failure/);
});
test('spawn failures and signals are failures rather than successful empty results', async () => {
  const missing = await runProcess(path.join(os.tmpdir(), 'squidware-command-that-does-not-exist'), [], { live: false });
  assert.equal(missing.status, 'error'); assert.match(missing.error, /ENOENT/);
  const signaled = await runProcess(process.execPath, ['-e', "process.kill(process.pid,'SIGTERM')"], { live: false });
  assert.notEqual(signaled.status, 'passed');
});
test('a timeout stops the child and its grandchild instead of leaving background work alive', async t => {
  const directory = await temporary(t); const heartbeat = path.join(directory, 'heartbeat.txt');
  const worker = `const fs=require('node:fs');setInterval(()=>fs.writeFileSync(${JSON.stringify(heartbeat)},String(Date.now())),20);`;
  const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(worker)}],{stdio:'ignore'});setInterval(()=>{},1000);`;
  const result = await runProcess(process.execPath, ['-e', parent], { timeoutMs: 3000, live: false });
  assert.equal(result.status, 'timed_out');
  const before = await readFile(heartbeat, 'utf8');
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(await readFile(heartbeat, 'utf8'), before, 'Grandchild must stop writing after the timeout');
});
test('one failed suite does not erase later evidence and every selected suite has a status', async () => {
  const seen = [];
  const results = await runChecks([{ name: 'first' }, { name: 'broken' }, { name: 'last' }], async check => {
    seen.push(check.name); if (check.name === 'broken') throw new Error('fixture preparation failed');
    return { status: 'passed' };
  });
  assert.deepEqual(seen, ['first', 'broken', 'last']);
  assert.deepEqual(results.map(result => result.status), ['passed', 'error', 'passed']);
  assert.match(results[1].error, /preparation failed/);
});
test('targeted runs reject typos and duplicates; options never become output directory names', () => {
  assert.throws(() => selectSuites(['--suite=playbak']), /Unknown desktop suite/);
  assert.throws(() => selectSuites(['--suite=editor,editor']), /only once/);
  assert.throws(() => selectSuites(['--unknown']), /Unknown arguments/);
  assert.throws(() => selectSuites(['--suite=editor', '--list']), /alone/);
  assert.equal(outputDirectory(['--force-3d-fallback'], '/tmp/results'), path.resolve('/tmp/results'));
  assert.equal(outputDirectory(['--output=chosen', '--baseline'], 'fallback'), path.resolve('chosen'));
  assert.throws(() => outputDirectory(['one', '--output=two'], 'fallback'), /one output directory/);
});
test('renderer waits use observed state and time out even when a probe never resolves', async () => {
  let probes = 0;
  await renderer.waitFor(() => ++probes === 3, 'ready', { intervalMs: 1, timeoutMs: 1000 });
  assert.equal(probes, 3);
  await assert.rejects(renderer.waitFor(() => new Promise(() => {}), 'hung renderer', { timeoutMs: 30 }), /Timed out: hung renderer/);
  await assert.rejects(renderer.waitFor(() => true, 'crashed renderer', { failure: () => new Error('Renderer exited') }), /Renderer exited/);
});
