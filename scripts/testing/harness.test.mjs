import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runProcess } from './process.mjs';
import { runChecks, selectSuites, desktopConcurrency } from './suites.mjs';
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
  assert.equal(desktopConcurrency([]), 1);
  assert.equal(desktopConcurrency(['--jobs=2']), 2);
  assert.equal(selectSuites(['--suite=themes', '--jobs=2'])[0].name, 'themes');
  for (const value of ['0', '5', '1.5', 'two', '']) assert.throws(() => selectSuites([`--jobs=${value}`]), /jobs/);
  assert.throws(() => selectSuites(['--jobs=2', '--jobs=3']), /one --jobs/);
  assert.throws(() => selectSuites(['--jobs=2', '--list']), /alone/);
});

test('parallel suites respect the worker limit, retain order and failures, and serialize reports', async () => {
  const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
  const gates = Array.from({ length: 4 }, deferred), starts = Array.from({ length: 4 }, deferred);
  let active = 0, peak = 0, reporting = 0;
  const snapshots = [];
  const complete = runChecks(gates.map((_, i) => ({ name: String(i) })), async check => {
    const i = Number(check.name); active++; peak = Math.max(peak, active); starts[i].resolve();
    try { await gates[i].promise; return { status: 'passed' }; } finally { active--; }
  }, async results => {
    assert.equal(++reporting, 1); snapshots.push(results.map(result => result.name));
    await Promise.resolve(); reporting--;
  }, { concurrency: 2 });
  await Promise.all(starts.slice(0, 2).map(start => start.promise)); assert.equal(active, 2);
  gates[1].resolve(); await starts[2].promise;
  gates[0].reject(new Error('first suite failed')); await starts[3].promise;
  gates[3].resolve(); gates[2].resolve();
  const results = await complete;
  assert.equal(peak, 2); assert.equal(active, 0);
  assert.deepEqual(results.map(result => result.name), ['0', '1', '2', '3']);
  assert.deepEqual(results.map(result => result.status), ['error', 'passed', 'passed', 'passed']);
  assert.match(results[0].error, /first suite failed/);
  assert.equal(snapshots.length, 4); assert.deepEqual(snapshots[0], ['1']);
  assert.deepEqual(snapshots.at(-1), ['0', '1', '2', '3']);
  await assert.rejects(runChecks([], () => {}, undefined, { concurrency: 0 }), /concurrency/);
});

test('native dropdown selection uses real typeahead for numeric labels without Home or an OS popup', async () => {
  let selected = '1.5', buffer = '';
  const events = [], options = [{ value: '1', label: '100%' }, { value: '1.1', label: '110%' }, { value: '1.25', label: '125%' }, { value: '1.5', label: '150%' }];
  const control = { tagName: 'SELECT', disabled: false, options, get value() { return selected; }, set value(_) { throw new Error('Do not replace native selection with a DOM setter.'); }, focus() { context.document.activeElement = this; buffer = ''; } };
  const context = { document: { querySelector: () => control, activeElement: null } };
  const window = { webContents: {
    executeJavaScript: async source => vm.runInNewContext(source, context),
    sendInputEvent(event) { events.push(event); if (event.type === 'char') { buffer += event.keyCode; const target = options.find(option => option.label.startsWith(buffer)); if (target) selected = target.value; } },
  } };
  for (const value of ['1', '1.25', '1.5']) { await renderer.selectNativeOption(window, '[aria-label="UI scale"]', value); assert.equal(selected, value); }
  assert.ok(events.some(event => event.type === 'char'));
  assert.ok(events.every(event => !['Home', 'Down', 'Return'].includes(event.keyCode)));
  await assert.rejects(renderer.selectNativeOption(window, 'select', 'unknown'), /Missing native option/);
  options.push({ value: 'duplicate', label: '125%' });
  await assert.rejects(renderer.selectNativeOption(window, 'select', '1.25'), /Ambiguous native option/);
  options.pop(); window.webContents.sendInputEvent = () => {}; selected = '1.5';
  await assert.rejects(renderer.selectNativeOption(window, 'select', '1', { timeoutMs: 30 }), /Timed out: native option.*observed.*1.5/);
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
  // Diagnostic sampling must not assume two scheduled frames finish within a
  // 30 ms deadline when the other native tests are using the worker pool.
  const fixed = { webContents: { executeJavaScript: async () => ({ width: 1366, height: 768, dpr: 1 }) } };
  await assert.rejects(renderer.waitViewport(fixed, { width: 999, height: 768, dpr: 1 }, 'bad viewport', { timeoutMs: 30 }), /bad viewport; expected.*999.*observed.*1366/);
  const hung = { webContents: { executeJavaScript: () => new Promise(() => {}) } };
  await assert.rejects(renderer.waitViewport(hung, { width: 999, height: 768 }, 'hung viewport', { timeoutMs: 30 }), /hung viewport; expected.*999.*observed null/);
});

test('capture settles size/zoom and restores client pixels even when native frame insets change', async t => {
  const output = await temporary(t);
  const context = { innerWidth: 1366, innerHeight: 768, devicePixelRatio: 1, requestAnimationFrame: callback => {
    assert.ok(context.innerWidth < 1000, 'Layout frames must follow the observed native viewport');
    return setTimeout(callback, 1);
  } };
  let bounds = [1136, 807];
  let insetHeight = 39;
  const timers = [];
  const apply = () => {
    context.innerWidth = Math.round((bounds[0] - 16) / 1.25);
    context.innerHeight = Math.round((bounds[1] - insetHeight) / 1.25);
    context.devicePixelRatio = 1.25;
  };
  const window = {
    getSize: () => [...bounds], getContentSize: () => [bounds[0] - 16, bounds[1] - insetHeight],
    setSize(width, height) { bounds = [width, height]; timers.push(setTimeout(apply, 30)); },
    setContentSize(width, height) { bounds = [width + 16, height + insetHeight]; timers.push(setTimeout(apply, 30)); },
    webContents: {
      getZoomFactor: () => 1.25,
      executeJavaScript: source => Promise.resolve(vm.runInNewContext(source, context)),
      async capturePage() {
        assert.equal(context.devicePixelRatio, 1.25, 'Pending zoom must settle before capture');
        assert.ok(context.innerWidth < 1000, 'Pending resize must settle before capture');
        insetHeight += 2; apply();
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

test('a compositor retry captures the requested viewport after a content-size nudge', async t => {
  const output = await temporary(t);
  const context = { innerWidth: 1366, innerHeight: 768, devicePixelRatio: 1, requestAnimationFrame: callback => setTimeout(callback, 1) };
  let attempts = 0;
  const sizes = [];
  const window = {
    getContentSize: () => [context.innerWidth, context.innerHeight],
    setContentSize(width, height) {
      assert.ok(width !== context.innerWidth || height !== context.innerHeight, 'Do not reapply unchanged native bounds after capture');
      sizes.push([width, height]); context.innerWidth = width; context.innerHeight = height;
    },
    webContents: {
      getZoomFactor: () => 1,
      executeJavaScript: source => Promise.resolve(vm.runInNewContext(source, context)),
      async capturePage() {
        assert.equal(context.innerWidth, 1366); assert.equal(context.innerHeight, 768);
        const empty = ++attempts === 1;
        return { isEmpty: () => empty, toPNG: () => Buffer.from('retry pixels') };
      },
    },
  };
  await renderer.capturePage(window, output, 'retry.png', { timeoutMs: 1000 });
  assert.equal(attempts, 2);
  assert.ok(sizes.some(([width]) => width === 1367));
  assert.equal(context.innerWidth, 1366);
  assert.equal(await readFile(path.join(output, 'retry.png'), 'utf8'), 'retry pixels');
});
