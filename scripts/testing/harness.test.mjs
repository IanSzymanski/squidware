import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runProcess } from './process.mjs';
import { runChecks, selectSuites } from './suites.mjs';
import { outputDirectory } from './launcher.mjs';
import renderer from './renderer.cjs';
import vm from 'node:vm';

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

test('viewport settlement waits for delayed native resize and reports mismatched geometry', async () => {
  const context = { innerWidth: 1120, innerHeight: 768, devicePixelRatio: 1, requestAnimationFrame: callback => setTimeout(callback, 1) };
  const window = { webContents: { executeJavaScript: source => Promise.resolve(vm.runInNewContext(source, context)) } };
  const resized = setTimeout(() => { context.innerWidth = 1366; }, 30);
  try { await renderer.waitViewport(window, { width: 1366, height: 768, dpr: 1 }, 'native resize', { timeoutMs: 1000 }); }
  finally { clearTimeout(resized); }
  assert.equal(context.innerWidth, 1366);
  await assert.rejects(renderer.waitViewport(window, { width: 999, height: 768, dpr: 1 }, 'bad viewport', { timeoutMs: 30 }), /bad viewport; expected.*999.*observed.*1366/);
});

test('capture settles pending native size and zoom before recording the restoration viewport', async t => {
  const output = await temporary(t);
  const context = { innerWidth: 1366, innerHeight: 768, devicePixelRatio: 1, requestAnimationFrame: callback => setTimeout(callback, 1) };
  let bounds = [1136, 807];
  const timers = [];
  const apply = () => {
    context.innerWidth = Math.round((bounds[0] - 16) / 1.25);
    context.innerHeight = Math.round((bounds[1] - 39) / 1.25);
    context.devicePixelRatio = 1.25;
  };
  const window = {
    getSize: () => [...bounds], getContentSize: () => [bounds[0] - 16, bounds[1] - 39],
    setSize(width, height) { bounds = [width, height]; timers.push(setTimeout(apply, 30)); },
    webContents: {
      getZoomFactor: () => 1.25,
      executeJavaScript: source => Promise.resolve(vm.runInNewContext(source, context)),
      async capturePage() {
        assert.equal(context.devicePixelRatio, 1.25, 'Pending zoom must settle before capture');
        assert.ok(context.innerWidth < 1000, 'Pending resize must settle before capture');
        return { isEmpty: () => false, toPNG: () => Buffer.from('fixture pixels') };
      },
    },
  };
  timers.push(setTimeout(apply, 40));
  try { await renderer.capturePage(window, output, 'settled.png', { timeoutMs: 1000 }); }
  finally { timers.forEach(clearTimeout); }
  assert.equal(context.innerWidth, 896);
  assert.equal(context.innerHeight, 614);
  assert.equal(context.devicePixelRatio, 1.25);
  assert.equal(await readFile(path.join(output, 'settled.png'), 'utf8'), 'fixture pixels');
});
