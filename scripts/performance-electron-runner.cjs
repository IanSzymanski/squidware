'use strict';

const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const manifestPath = process.argv.find(value => value.startsWith('--manifest='))?.slice('--manifest='.length);
if (!manifestPath) throw new Error('Use performance-electron.mjs to prepare the manifest.');
const delay = duration => new Promise(resolve => setTimeout(resolve, duration));
app.on('window-all-closed', () => {});

// Runs before the production React bundle using CDP, without editing the app.
function installInstrumentation(fixtureText) {
  localStorage.setItem('squidware.autosave.v1', fixtureText);
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const state = window.__squidwarePerformance = {
    commits: 0, renders: {}, lastCommitAt: 0, appRafCallbacks: 0, glDrawCalls: 0, storageWrites: [], errors: [],
  };
  const storageSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    const start = performance.now();
    try { return storageSet.call(this, key, value); }
    finally { state.storageWrites.push({ key, durationMs: performance.now() - start, characters: value.length }); }
  };
  window.addEventListener('error', event => state.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => state.errors.push(String(event.reason)));
  document.addEventListener('webglcontextlost', () => state.errors.push('WebGL graphics context was lost.'), true);
  window.requestAnimationFrame = callback => nativeRaf(timestamp => { state.appRafCallbacks++; callback(timestamp); });
  for (const constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!constructor) continue;
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = constructor.prototype[method];
      if (typeof original !== 'function') continue;
      constructor.prototype[method] = function(...args) { state.glDrawCalls++; return original.apply(this, args); };
    }
  }
  let rendererId = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(),
    inject(renderer) { const id = ++rendererId; this.renderers.set(id, renderer); return id; },
    onCommitFiberRoot(_id, root) {
      state.commits++; state.lastCommitAt = performance.now();
      const visit = fiber => {
        if (!fiber) return;
        // PerformedWork is set on components rendered during this commit.
        // Production names are minified; totals and raw names are preserved.
        if ((fiber.flags & 1) && [0, 1, 11, 14, 15].includes(fiber.tag)) {
          const type = fiber.type;
          const name = type?.displayName || type?.name || type?.render?.name || 'anonymous';
          state.renders[name] = (state.renders[name] || 0) + 1;
        }
        visit(fiber.child); visit(fiber.sibling);
      };
      visit(root.current);
    }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
  };
  state.frames = async duration => {
    const started = performance.now(); const samples = []; let previous;
    const commits = state.commits; const raf = state.appRafCallbacks; const gl = state.glDrawCalls;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Animation frames unavailable in profiling window.')), duration + 5000);
      const tick = timestamp => {
        if (previous !== undefined) samples.push(timestamp - previous);
        previous = timestamp;
        if (performance.now() - started >= duration) { clearTimeout(timeout); resolve(); } else nativeRaf(tick);
      };
      nativeRaf(tick);
    });
    return { rawMs: samples, elapsedMs: performance.now() - started, commits: state.commits - commits,
      appRafCallbacks: state.appRafCallbacks - raf, glDrawCalls: state.glDrawCalls - gl };
  };
  state.measureEdit = async (key, label) => {
    const field = document.querySelector('.field-stage__svg');
    if (!field) throw new Error('2D field unavailable for edit measurement.');
    const first = field.querySelector('[data-performer-id]');
    const before = first.getAttribute('transform');
    const commits = state.commits;
    const start = performance.now();
    performance.mark(`${label}:start`);
    field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const eventDispatchMs = performance.now() - start;
    // A fresh task follows the discrete event's React microtasks. This value is
    // wall time, not CPU time; tracing supplies main-thread task occupancy.
    await new Promise(resolve => setTimeout(resolve, 0));
    performance.mark(`${label}:processed`);
    const processingElapsedMs = performance.now() - start;
    const commitLatencyMs = state.commits > commits ? state.lastCommitAt - start : null;
    const nextFrame = callback => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Animation frames unavailable during edit.')), 5000);
      nativeRaf(() => { clearTimeout(timeout); callback?.(); resolve(performance.now() - start); });
    });
    const firstFrameMs = await nextFrame(() => performance.mark(`${label}:frame`));
    // The next rAF is a paint opportunity, not proof of physical display scanout.
    const paintOpportunityMs = await nextFrame();
    const after = document.querySelector('.field-stage__svg [data-performer-id]').getAttribute('transform');
    if (after === before) throw new Error('Edit did not change the first performer; measurements would be invalid.');
    return { label, eventDispatchMs, processingElapsedMs, commitLatencyMs, firstFrameMs, paintOpportunityMs, commits: state.commits - commits };
  };
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2);
  return sorted.length ? { samples: sorted.length, medianMs: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], minMs: sorted[0], maxMs: sorted.at(-1) } : { samples: 0, medianMs: null, p95Ms: null };
}

async function profileFixture(manifest, fixture) {
  console.log(`${fixture.name}: opening isolated production window.`);
  const window = new BrowserWindow({ show: false, width: 1440, height: 1000,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false,
      offscreen: true, backgroundThrottling: false, preload: path.resolve(__dirname, '..', 'electron', 'preload.cjs') } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const expectedUrl = pathToFileURL(path.join(manifest.build, 'index.html')).href;
  window.webContents.on('will-navigate', (event, url) => { if (url !== expectedUrl) event.preventDefault(); });
  // Materialize a renderer before sending Page commands; Electron can queue
  // them indefinitely on a BrowserWindow that has never loaded a document.
  await window.loadURL('about:blank');
  const debuggerApi = window.webContents.debugger;
  debuggerApi.attach('1.3');
  const command = (method, args) => debuggerApi.sendCommand(method, args);
  const evaluate = code => window.webContents.executeJavaScript(code);
  const trace = [];
  let traceComplete;
  const completion = new Promise(resolve => { traceComplete = resolve; });
  debuggerApi.on('message', (_event, method, params) => {
    if (method === 'Tracing.dataCollected') trace.push(...params.value);
    if (method === 'Tracing.tracingComplete') traceComplete();
  });
  await command('Page.enable');
  const fixtureText = await fs.readFile(fixture.filename, 'utf8');
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `(${installInstrumentation.toString()})(${JSON.stringify(fixtureText)});` });
  const started = Date.now();
  console.log(`${fixture.name}: loading production URL.`);
  await window.loadURL(expectedUrl);
  console.log(`${fixture.name}: production URL loaded.`);
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate("Boolean(document.querySelector('.field-stage__svg [data-performer-id]'))")) break;
    if (attempt === 99) throw new Error('Production app failed to mount.');
    await delay(100);
  }
  const initialMountElapsedMs = Date.now() - started;
  await evaluate("document.querySelectorAll('.set-card')[1].click()");
  await delay(1000);
  const loaded = await evaluate("({ title: document.querySelector('.project-title')?.textContent, sets: document.querySelectorAll('.set-card').length, performers: document.querySelectorAll('.field-stage__svg [data-performer-id]').length, node: typeof window.require, errors: window.__squidwarePerformance.errors })");
  console.log(`${fixture.name}: production fixture mounted; measuring edits.`);
  const fixtureReadyElapsedMs = Date.now() - started;
  if (loaded.sets !== fixture.sets || loaded.performers !== fixture.performers || loaded.node !== 'undefined' || loaded.errors.length) throw new Error(`Invalid production fixture mount: ${JSON.stringify(loaded)}`);
  await evaluate("(() => { const performer = document.querySelector('.field-stage__svg [data-performer-id]'); performer.focus(); performer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()");
  await delay(100);
  await command('Performance.enable');
  await command('Profiler.enable');
  await command('Profiler.start');
  await command('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame', options: 'record-as-much-as-possible', transferMode: 'ReportEvents' });
  const memorySnapshot = async () => ({ rendererHeap: await command('Runtime.getHeapUsage'), electronProcesses: app.getAppMetrics() });
  const memory = { beforeEdits: await memorySnapshot() };
  await evaluate("performance.mark('keyboard-edits:start')");
  const baseline = await evaluate('JSON.parse(JSON.stringify({ commits: window.__squidwarePerformance.commits, renders: window.__squidwarePerformance.renders }))');
  const edits = [];
  for (let index = 0; index < manifest.warmup + manifest.repetitions; index++) {
    const label = `edit-${index}`;
    const sample = await evaluate(`window.__squidwarePerformance.measureEdit(${JSON.stringify(index % 2 ? 'ArrowLeft' : 'ArrowRight')}, ${JSON.stringify(label)})`);
    if (index >= manifest.warmup) edits.push(sample);
  }
  const afterEdits = await evaluate('JSON.parse(JSON.stringify({ commits: window.__squidwarePerformance.commits, renders: window.__squidwarePerformance.renders }))');
  await evaluate("performance.mark('keyboard-edits:finish')");
  await delay(1000); // Include the application's debounced recovery save in trace.
  memory.afterEdits = await memorySnapshot();
  const beforeDrag = await evaluate("Array.from(document.querySelectorAll('.field-stage__svg [data-performer-id]'), item => item.getAttribute('transform'))");
  await evaluate("performance.mark('drag:start')");
  const dragFramesPromise = evaluate(`window.__squidwarePerformance.frames(${manifest.frameWindowMs})`);
  const location = await evaluate("(() => { const rect = document.querySelector('.field-stage__svg [data-performer-id] circle[r=\"0.52\"]').getBoundingClientRect(); return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }; })()");
  window.webContents.sendInputEvent({ type: 'mouseDown', ...location, button: 'left', clickCount: 1 });
  for (let index = 1; index <= 60; index++) {
    window.webContents.sendInputEvent({ type: 'mouseMove', x: location.x + Math.round(Math.sin(index / 60 * Math.PI) * 35), y: location.y, button: 'left', buttons: ['left'] });
    await delay(16);
  }
  window.webContents.sendInputEvent({ type: 'mouseMove', x: location.x + 7, y: location.y, button: 'left', buttons: ['left'] });
  await delay(16);
  window.webContents.sendInputEvent({ type: 'mouseUp', x: location.x + 7, y: location.y, button: 'left', clickCount: 1 });
  const drag = await dragFramesPromise;
  await evaluate("performance.mark('drag:finish')");
  const afterDrag = await evaluate("Array.from(document.querySelectorAll('.field-stage__svg [data-performer-id]'), item => item.getAttribute('transform'))");
  drag.changedPerformers = afterDrag.filter((transform, index) => transform !== beforeDrag[index]).length;
  if (!drag.changedPerformers) throw new Error('Drag did not change performer positions; measurements would be invalid.');
  const playbackStart = await evaluate("({ count: Number(document.querySelector('[aria-label=\"Timeline playhead\"]').value), transforms: Array.from(document.querySelectorAll('.field-stage__svg [data-performer-id]'), item => item.getAttribute('transform')) })");
  await evaluate("performance.mark('playback:start')");
  await evaluate("document.querySelector('[aria-label=\"Play show\"]').click()");
  const playback = await evaluate(`window.__squidwarePerformance.frames(${manifest.frameWindowMs})`);
  const playbackEnd = await evaluate("({ count: Number(document.querySelector('[aria-label=\"Timeline playhead\"]').value), transforms: Array.from(document.querySelectorAll('.field-stage__svg [data-performer-id]'), item => item.getAttribute('transform')) })");
  playback.startCount = playbackStart.count; playback.endCount = playbackEnd.count;
  playback.changedPerformers = playbackEnd.transforms.filter((transform, index) => transform !== playbackStart.transforms[index]).length;
  if (!(playback.endCount > playback.startCount) || !playback.changedPerformers) throw new Error('Playback did not advance the playhead and performer positions; measurements would be invalid.');
  await evaluate("document.querySelector('[aria-label=\"Pause playback\"]').click()");
  await evaluate("performance.mark('playback:finish')");
  await evaluate("Array.from(document.querySelectorAll('.view-switch button')).find(button => button.textContent.includes('3D')).click()");
  await delay(1000);
  const stage = await evaluate("({ canvas: Boolean(document.querySelector('.stage-three canvas')), error: document.querySelector('.stage-three__fallback')?.textContent ?? null, canvases: document.querySelectorAll('.stage-three canvas').length })");
  if (!stage.canvas || stage.error || !await evaluate('window.__squidwarePerformance.glDrawCalls')) throw new Error(`3D failed to initialize: ${JSON.stringify(stage)}`);
  await evaluate("performance.mark('idle-3d:start')");
  const idle3D = stage.canvases ? await evaluate(`window.__squidwarePerformance.frames(${manifest.frameWindowMs})`) : null;
  await evaluate("performance.mark('idle-3d:finish')");
  stage.error = await evaluate("document.querySelector('.stage-three__fallback')?.textContent ?? null");
  memory.after3D = await memorySnapshot();
  const gpu = await app.getGPUInfo('complete');
  const storageWrites = await evaluate('window.__squidwarePerformance.storageWrites');
  const errors = await evaluate('window.__squidwarePerformance.errors');
  const performanceMetrics = await command('Performance.getMetrics');
  const cpu = await command('Profiler.stop');
  await command('Tracing.end');
  await completion;
  await fs.writeFile(path.join(manifest.output, `${fixture.name}-trace.json`), JSON.stringify({ traceEvents: trace }));
  await fs.writeFile(path.join(manifest.output, `${fixture.name}.cpuprofile`), JSON.stringify(cpu.profile));
  if (errors.length || stage.error) throw new Error(`Renderer failed during profiling: ${JSON.stringify({ errors, stage })}`);
  const main = trace.find(event => event.name === 'thread_name' && event.args?.name === 'CrRendererMain');
  const tasks = main ? trace.filter(event => event.name === 'RunTask' && event.ph === 'X' && event.pid === main.pid && event.tid === main.tid) : [];
  const phaseCpu = {};
  for (const phase of ['keyboard-edits', 'drag', 'playback', 'idle-3d']) {
    const start = trace.find(event => event.name === `${phase}:start` && event.pid === main?.pid);
    const finish = trace.find(event => event.name === `${phase}:finish` && event.pid === main?.pid);
    if (!start || !finish) { phaseCpu[phase] = null; continue; }
    const rawMs = tasks.map(task => Math.max(0, Math.min(task.ts + task.dur, finish.ts) - Math.max(task.ts, start.ts)) / 1000).filter(duration => duration > 0);
    const wallMs = (finish.ts - start.ts) / 1000;
    const taskMs = rawMs.reduce((sum, duration) => sum + duration, 0);
    phaseCpu[phase] = { wallMs, mainThreadTaskMs: taskMs, mainThreadTaskPercent: taskMs / wallMs * 100, longTasksOver50ms: rawMs.filter(duration => duration > 50).length, tasks: summarize(rawMs) };
  }
  for (const edit of edits) {
    const start = trace.find(event => event.name === `${edit.label}:start` && event.pid === main?.pid);
    const finish = trace.find(event => event.name === `${edit.label}:processed` && event.pid === main?.pid);
    // Sum only non-overlapping top-level main-thread tasks within the action's
    // start/processing marks. Delayed recovery work is separately traced.
    edit.mainThreadTaskMs = start && finish ? tasks.reduce((sum, task) => sum + Math.max(0, Math.min(task.ts + task.dur, finish.ts) - Math.max(task.ts, start.ts)) / 1000, 0) : null;
  }
  const metrics = {};
  for (const key of ['eventDispatchMs', 'processingElapsedMs', 'commitLatencyMs', 'mainThreadTaskMs', 'firstFrameMs', 'paintOpportunityMs']) metrics[key] = summarize(edits.map(edit => edit[key]).filter(value => value !== null));
  const frameSummary = sample => sample ? { ...sample, intervals: summarize(sample.rawMs), frameBudgetMs: 1000 / 60,
    jitterToleranceMs: 1, intervalsOverBudgetWithTolerance: sample.rawMs.filter(ms => ms > 1000 / 60 + 1).length,
    intervalsOver33_3ms: sample.rawMs.filter(ms => ms > 1000 / 30).length } : null;
  const renders = Object.fromEntries(Object.entries(afterEdits.renders).map(([name, count]) => [name, count - (baseline.renders[name] || 0)]));
  const result = { ...fixture, loaded, initialMountElapsedMs, fixtureReadyElapsedMs, metrics, edits, renderCounts: { commits: afterEdits.commits - baseline.commits, componentRenders: renders,
    note: 'Measured edit period includes warmups; production component names are minified. Instrumentation adds overhead.' },
    drag: frameSummary(drag), playback: frameSummary(playback), idle3D: frameSummary(idle3D), stage, memory, gpu, phaseCpu,
    storageWrites, errors, performanceMetrics: performanceMetrics.metrics, trace: `${fixture.name}-trace.json`, cpuProfile: `${fixture.name}.cpuprofile`,
    mainThreadTasks: { samples: tasks.length, ...summarize(tasks.map(task => task.dur / 1000)) } };
  window.destroy();
  console.log(`${fixture.name}: edit dispatch median ${metrics.eventDispatchMs.medianMs.toFixed(2)} ms, renderer task time ${metrics.mainThreadTaskMs.medianMs?.toFixed(2)} ms, next paint opportunity ${metrics.paintOpportunityMs.medianMs.toFixed(2)} ms`);
  return result;
}

(async () => {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  app.setPath('userData', manifest.profile);
  await app.whenReady();
  console.log('Electron ready for profiling.');
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const timeout = setTimeout(() => { console.error('Electron profiling timed out.'); app.exit(1); }, 240000);
  const report = { ...manifest, electron: process.versions.electron, chrome: process.versions.chrome, viewport: { width: 1440, height: 1000, hidden: true, offscreen: true, backgroundThrottling: false },
    gpu: null, budget: { mainThreadEditMs: 1000 / 60, frameIntervalMs: 1000 / 60 },
    limitations: [
      'This isolated production renderer uses a hidden offscreen Electron window; it does not measure physical screen scanout or native menu/file dialog latency.',
      'Synthetic keyboard edits exercise actual renderer handlers; drag uses Electron mouse input. Main-thread task time sums trace-task wall durations between action start and next-task marks; it is occupancy, not exact OS CPU time.',
      'Next-frame and second-rAF paint opportunity are latency proxies, not confirmed presentation timestamps.',
      'initialMountElapsedMs stops when field DOM mounts; fixtureReadyElapsedMs additionally includes switching to set 2 and one second of settling.',
      'The drag frame window includes 60 input moves at approximately 16 ms intervals plus the final release; longer frame windows also include idle time.',
      'Memory snapshots are uncollected heap/working-set observations, not retained-project allocation or a leak measurement. Electron process memory is reported in KiB.',
      'DevTools fiber hook, requestAnimationFrame/WebGL wrappers, CDP tracing and CPU sampling add measurement overhead.',
      'No representative school laptop qualification; hardware metadata records the actual host.',
    ], results: [] };
  for (const fixture of manifest.fixtures) {
    report.results.push(await profileFixture(manifest, fixture));
    report.gpu = report.results.at(-1).gpu;
    await fs.writeFile(path.join(manifest.output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  clearTimeout(timeout);
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
