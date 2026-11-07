'use strict';
const { waitFor: waitUntil, key: sendKey, capturePage } = require('./testing/renderer.cjs');
const { app, BrowserWindow, screen, webContents } = require('electron');
const fs = require('node:fs/promises'); const path = require('node:path'); const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const manifest = require(process.argv.find(arg => arg.startsWith('--popout-manifest=')).slice('--popout-manifest='.length));
const phase = process.argv.find(arg => arg.startsWith('--phase=')).slice(8);
const { root, output, profile, softwareWebgl } = manifest;
const fixtures = require(manifest.fixtures).fixtures;
// Linux CI has no GPU: SwiftShader exercises real rendering. Elsewhere an unavailable
// context must still pass through the fallback, lifecycle and DOM/state mirroring checks.
if (softwareWebgl) { app.commandLine.appendSwitch('use-angle', 'swiftshader'); app.commandLine.appendSwitch('enable-unsafe-swiftshader'); }
app.setPath('userData', profile);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = []; const metrics = {};
const pass = label => { checks.push(label); console.log(`${phase}: PASS ${label}`); };
const editor = 'window.__popoutQA.editor';
let main; let popout = null;
const focusCalls = new Map();
// Hidden like the other suites; the 3D window itself is shown natively by its creation options.
BrowserWindow.prototype.show = function () {};
const nativeFocus = BrowserWindow.prototype.focus;
BrowserWindow.prototype.focus = function () { focusCalls.set(this.id, (focusCalls.get(this.id) ?? 0) + 1); return nativeFocus.call(this); };
app.on('browser-window-created', (_event, created) => {
  if (main) return;
  main = created; main.webContents.setBackgroundThrottling(false);
  main.webContents.on('did-create-window', child => { popout = child; });
});
const evaluate = source => main.webContents.executeJavaScript(source).catch(error => { console.error('Failed QA expression:', source.slice(0, 400)); throw error; });
const uiWait = (source, label, timeoutMs = 30000) => waitUntil(() => evaluate(source), label, { timeoutMs });
const live = () => !!popout && !popout.isDestroyed();
const childEval = source => popout.webContents.executeJavaScript(source);
const childWait = (source, label, timeoutMs = 30000) => waitUntil(async () => live() && await childEval(source).catch(() => false), label, { timeoutMs });
const windowCount = () => BrowserWindow.getAllWindows().filter(window => !window.isDestroyed()).length;
const cdp = (method, params) => main.webContents.debugger.sendCommand(method, params);

function instrument() {
  const qa = window.__popoutQA = { editor: null, root: null, errors: [], childDeletes: 0 };
  window.addEventListener('error', event => qa.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => qa.errors.push(String(event.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) {
      qa.root = root;
      if (qa.editor) return;
      const visit = fiber => { while (fiber && !qa.editor) { const value = fiber.memoizedProps?.value; if (value?.getState && value?.dispatch) qa.editor = value; visit(fiber.child); fiber = fiber.sibling; } };
      visit(root.current);
    }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
  qa.find = predicate => { const found = []; const visit = fiber => { while (fiber) { if (predicate(fiber)) found.push(fiber); visit(fiber.child); fiber = fiber.sibling; } }; if (qa.root) visit(qa.root.current); return found; };
  const props = (test) => qa.find(fiber => typeof fiber.type === 'function' && fiber.memoizedProps && test(fiber.memoizedProps)).map(fiber => fiber.memoizedProps);
  // The read-only 3D window renders Stage3D without onSelect; the inline view and the 2D field select.
  qa.stage = () => props(p => 'quality' in p && 'positions' in p && !p.onSelect).at(-1);
  qa.inline = () => props(p => 'quality' in p && 'positions' in p && !!p.onSelect).at(-1);
  qa.field = () => props(p => 'neighbors' in p && 'positions' in p).at(-1);
  qa.child = () => qa.find(fiber => fiber.tag === 4 && fiber.stateNode?.containerInfo?.ownerDocument !== document)[0]?.stateNode.containerInfo.ownerDocument.defaultView ?? null;
  const same = (a, b) => !!a && !!b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(id => b[id] && Math.abs(a[id].x - b[id].x) < 1e-9 && Math.abs(a[id].y - b[id].y) < 1e-9);
  qa.mirror = () => {
    const stage = qa.stage(), field = qa.field(), state = qa.editor.getState(), shown = qa.child()?.document.querySelector('.popout-3d');
    const selected = state.selection.selectedIds;
    return { stage: !!stage, inline: !!qa.inline(), performers: stage?.project.performers.length ?? 0, positions: stage ? Object.keys(stage.positions).length : 0,
      selectionMatches: !!stage && stage.selectedIds.length === selected.length && stage.selectedIds.every((id, i) => id === selected[i]), selected: selected.length,
      matchesField: same(stage?.positions, field?.positions), matchesSet: same(stage?.positions, state.project.present.sets[state.selection.activeIndex].positions),
      count: state.playback.count, shownCount: shown ? Number(shown.dataset.count) : null, shownSet: shown ? Number(shown.dataset.setIndex) : null, activeIndex: state.selection.activeIndex,
      status: shown?.querySelector('.popout-3d__status')?.textContent ?? '' };
  };
  qa.stagePosition = id => qa.stage()?.positions[id] ?? null;
}

// Runs in the 3D window's own realm: frame records compare the count it drew with the editor's count at that moment.
function childInstrument() {
  const qa = window.opener.__popoutQA;
  const state = window.__childQA = { draws: 0, rafs: 0, frames: [] };
  window.addEventListener('error', event => qa.errors.push(`3D window: ${event.message}`));
  qa.events ??= [];
  window.addEventListener('pagehide', () => qa.events.push(`pagehide canvases=${document.querySelectorAll('canvas').length} deletes=${qa.childDeletes}`));
  for (const constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!constructor) continue;
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = constructor.prototype[method]; if (!original) continue;
      constructor.prototype[method] = function (...args) { state.draws++; return original.apply(this, args); };
    }
    for (const method of ['deleteBuffer', 'deleteTexture', 'deleteProgram']) {
      const original = constructor.prototype[method];
      constructor.prototype[method] = function (...args) { qa.childDeletes++; return original.apply(this, args); };
    }
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(time => {
    state.rafs++; const before = state.draws; callback(time);
    if (state.draws > before && state.frames.length < 5000) state.frames.push({ t: performance.timeOrigin + performance.now(), shown: Number(document.querySelector('.popout-3d')?.dataset.count), main: qa.editor.getState().playback.count });
  });
}

async function startRenderer() {
  while (!main) await pause(15);
  await uiWait("!!document.querySelector('.set-card')", 'initial renderer');
  main.setContentSize(1366, 768);
  main.webContents.debugger.attach('1.3');
  await cdp('Page.enable');
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
  main.webContents.reload();
  await uiWait(`!!${editor} && !!document.querySelector('.set-card') && ${editor}.getState().ui.popout3d === 'closed' && ${editor}.getState().preferences.status === 'saved'`, 'instrumented desktop renderer');
  // After a restart, earlier phases' recovery copies offer a startup dialog that would block keyboard shortcuts.
  await uiWait("['Recovery ready', 'Recovery copies available'].includes(document.querySelector('.recovery-indicator')?.textContent)", 'recovery startup');
  if (await evaluate(`${editor}.getState().ui.dialog === 'recovery'`)) await evaluate("[...document.querySelectorAll('.modal-actions button')].find(button => button.textContent === 'Continue editing').click()");
  await uiWait("!document.querySelector('dialog[open]')", 'startup dialogs closed');
}
async function loadFixture(fixture) {
  await evaluate(`${editor}.dispatch('project.load', { project: JSON.parse(${JSON.stringify(fixture.content)}) })`);
  await uiWait(`${editor}.getState().project.present.performers.length === ${fixture.count} && document.querySelectorAll('.field-performer').length === ${fixture.count}`, `${fixture.name} fixture`, 60000);
  await evaluate(`${editor}.dispatch('set.select', { index: 0 }); ${editor}.setValue('selection', 'selectedIds', []); ${editor}.setValue('ui', 'snap', false)`);
}
async function openPopout(how = 'command') {
  if (how === 'command') assert.equal(await evaluate(`${editor}.dispatch('view.popout')`), true);
  else if (how === 'button') await evaluate("document.querySelector('.popout-3d-button[aria-label=\"Open 3D window\"]').click()");
  else { await evaluate('document.activeElement?.blur()'); await sendKey(main, 'T', ['shift'], 20); }
  await waitUntil(() => live() && windowCount() === 2, `3D window opened by ${how}`);
  await childWait("!!document.querySelector('.popout-3d')", `3D window content (${how})`);
  await childWait("!!document.querySelector('.stage-three__canvas canvas, .stage-three__fallback[role=alert]')", '3D renderer or fallback', 60000);
  if (!await childEval('!!window.__childQA')) await childEval(`(${childInstrument.toString()})()`);
  return !await childEval("!!document.querySelector('.stage-three__fallback[role=alert]')");
}
async function closedAndReleased(label, before) {
  await waitUntil(() => !live() && windowCount() === 1, `${label}: window closed`);
  await uiWait(`${editor}.getState().ui.popout3d === 'closed' && !window.__popoutQA.stage() && !!document.querySelector('.popout-3d-button[aria-label="Open 3D window"]')`, `${label}: inline option restored`);
  assert.equal(webContents.getAllWebContents().filter(contents => !contents.isDestroyed()).length, 1, `${label}: the 3D window's webContents is released`);
  return (await evaluate('window.__popoutQA.childDeletes')) - before;
}
const frameMetrics = frames => {
  const intervals = frames.slice(1).map((frame, i) => frame.t - frames[i].t).sort((a, b) => a - b);
  const lag = frames.map(frame => Math.abs(frame.main - frame.shown));
  return { frames: frames.length, distinctCounts: new Set(frames.map(frame => frame.shown)).size, medianIntervalMs: Math.round(intervals[Math.floor(intervals.length / 2)] ?? Infinity),
    p95IntervalMs: Math.round(intervals[Math.floor(intervals.length * .95)] ?? Infinity), maxLagCounts: lag.length ? Math.max(...lag) : 0 };
};
// Lenient hosted-CI thresholds; recorded metrics show actual cadence. Software rendering at 500 performers is the slowest case.
const cadence = { demo: { median: 400, p95: 1500 }, maximum: { median: 800, p95: 2500 } };

async function mirrorFixture(fixture) {
  await loadFixture(fixture);
  const project = JSON.parse(fixture.content); const id = project.performers[0].id;
  const webgl = await openPopout(fixture.name === 'demo' ? 'command' : 'button');
  metrics[fixture.name] = { webgl };
  let mirror = await evaluate('window.__popoutQA.mirror()');
  assert.deepEqual([mirror.stage, mirror.inline, mirror.performers, mirror.positions, mirror.matchesSet, mirror.shownCount, mirror.shownSet], [true, false, fixture.count, fixture.count, true, 0, 0], JSON.stringify(mirror));
  pass(`${fixture.name}: ${fixture.count} performers open in one 3D window at the editor's set and count (${webgl ? 'WebGL rendering' : 'WebGL unavailable: fallback'})`);

  // Edits, selection and previews reach the 3D window in the same commit as the 2D field.
  const target = { x: 26, y: 18 };
  const edit = await evaluate(`(async () => { const t0 = performance.timeOrigin + performance.now(); const draws = window.__popoutQA.child().__childQA.draws;
    ${editor}.dispatch('positions.move', { index: ${editor}.getState().selection.activeIndex, updates: { ${JSON.stringify(id)}: ${JSON.stringify(target)} } });
    await new Promise(resolve => setTimeout(resolve)); const immediate = window.__popoutQA.stagePosition(${JSON.stringify(id)});
    return { t0, draws, immediate }; })()`);
  assert.deepEqual(edit.immediate, target, 'an edit reaches the 3D scene before the next frame');
  if (webgl) {
    await childWait(`window.__childQA.draws > ${edit.draws}`, `${fixture.name}: frame after edit`);
    metrics[fixture.name].editToFrameMs = Math.round((await childEval(`window.__childQA.frames.find(frame => frame.t >= ${edit.t0})?.t ?? performance.timeOrigin + performance.now()`)) - edit.t0);
    assert.ok(metrics[fixture.name].editToFrameMs < 2000, JSON.stringify(metrics[fixture.name]));
  }
  await evaluate(`${editor}.dispatch('selection.all')`);
  await childWait(`document.querySelector('.popout-3d__status').textContent.includes('${fixture.count} selected')`, 'selection status in 3D window');
  mirror = await evaluate('window.__popoutQA.mirror()');
  assert.deepEqual([mirror.selectionMatches, mirror.selected, mirror.matchesField, mirror.matchesSet], [true, fixture.count, true, true], JSON.stringify(mirror));
  assert.equal(await evaluate(`${editor}.dispatch('transform.preview', { operation: 'rotate-scale', angle: 15, scale: 1 })`), true);
  await uiWait(`!!${editor}.getState().ui.transformPreview && !!window.__popoutQA.field()`, 'transform preview');
  mirror = await evaluate('window.__popoutQA.mirror()');
  assert.deepEqual([mirror.matchesField, mirror.matchesSet], [true, false], 'the 3D window shows the transform preview, not the committed set');
  assert.match(mirror.status, /Transform preview/);
  await evaluate(`${editor}.dispatch('transform.cancel')`);
  await uiWait('window.__popoutQA.mirror().matchesSet', 'preview canceled in 3D');
  pass(`${fixture.name}: edits, selection highlighting and transform previews mirror the 2D field in the same commit`);

  // An uncommitted 2D drag follows live in 3D, then commits as one edit.
  if (fixture.name === 'demo') {
    await evaluate(`${editor}.setValue('selection', 'selectedIds', [${JSON.stringify(id)}])`); await pause(100);
    const point = await evaluate(`(() => { const node = document.querySelector('.field-performer[data-performer-id=${JSON.stringify(id)}]'); const p = new DOMPoint(0, 0).matrixTransform(node.getScreenCTM()); return { x: p.x, y: p.y }; })()`);
    assert.equal(await evaluate(`document.elementFromPoint(${point.x}, ${point.y})?.closest('[data-performer-id]')?.getAttribute('data-performer-id')`), id, 'the drag hits the intended performer');
    const revision = await evaluate(`${editor}.getState().project.revision`);
    const mouse = args => cdp('Input.dispatchMouseEvent', args);
    await mouse({ type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 }); await pause(80);
    for (let step = 1; step <= 6; step++) { await mouse({ type: 'mouseMoved', x: point.x + step * 8, y: point.y + step * 3, button: 'left', buttons: 1 }); await pause(25); }
    await uiWait(`(p => !!p && Math.abs(p.x - ${target.x}) > .5)(window.__popoutQA.stagePosition(${JSON.stringify(id)}))`, 'live drag in 3D');
    assert.equal(await evaluate(`${editor}.getState().project.revision`), revision, 'the drag is not committed yet');
    await mouse({ type: 'mouseReleased', x: point.x + 48, y: point.y + 18, button: 'left', buttons: 0, clickCount: 1 });
    await uiWait(`${editor}.getState().project.revision !== ${revision} && window.__popoutQA.mirror().matchesSet`, 'committed drag in 3D');
    pass('demo: an uncommitted 2D drag moves the 3D performer live and the release commits it');
  }

  // Scrubbing follows the playhead between sets.
  for (const count of [16.5, 40.25, 3]) {
    await evaluate(`${editor}.dispatch('playback.scrub', { count: ${count} })`);
    await childWait(`Number(document.querySelector('.popout-3d').dataset.count) === ${count}`, `scrub ${count}`);
    mirror = await evaluate('window.__popoutQA.mirror()');
    assert.deepEqual([mirror.shownCount, mirror.shownSet, mirror.matchesField], [count, mirror.activeIndex, true], JSON.stringify(mirror));
  }
  pass(`${fixture.name}: scrubbing shows the same count, set and sampled positions as the 2D field`);

  // Playback: every 3D frame shows the editor's current count. Detailed shadows are recorded; the
  // lightweight quality (a user choice for slower devices) must keep a usable cadence even in software rendering.
  for (const quality of ['detailed', 'lightweight']) {
    await setQuality(quality);
    await evaluate(`${editor}.dispatch('playback.scrub', { count: 0 })`); await pause(webgl ? 1200 : 200);
    if (webgl) await childEval('window.__childQA.frames = []');
    assert.equal(await evaluate(`${editor}.dispatch('playback.toggle')`), true);
    const samples = [];
    for (let i = 0; i < 16; i++) { await pause(150); samples.push(await evaluate('(m => [m.count, m.shownCount])(window.__popoutQA.mirror())')); }
    await evaluate(`${editor}.dispatch('playback.toggle')`);
    assert.ok(samples.every(([count, shown]) => count === shown), `DOM mirror lag: ${JSON.stringify(samples)}`);
    assert.ok(samples.at(-1)[0] > samples[0][0], 'playback advanced while the 3D window followed');
    if (!webgl) continue;
    const m = metrics[fixture.name][quality] = frameMetrics(await childEval('window.__childQA.frames'));
    assert.ok(m.maxLagCounts <= .25, `3D frames lag the editor: ${JSON.stringify(m)}`);
    if (quality === 'detailed') { assert.ok(m.frames >= 2 && m.distinctCounts >= 2, JSON.stringify(m)); continue; }
    assert.ok(m.frames >= 5 && m.distinctCounts >= 5, JSON.stringify(m));
    assert.ok(m.medianIntervalMs <= cadence[fixture.name].median && m.p95IntervalMs <= cadence[fixture.name].p95, `3D frame cadence: ${JSON.stringify(m)}`);
  }
  pass(`${fixture.name}: playback updates the 3D window at the editor's count${webgl ? ` (${JSON.stringify(metrics[fixture.name])})` : ' (DOM/state mirror)'}`);
  await setQuality('detailed');
  await evaluate(`${editor}.dispatch('set.select', { index: 0 })`);
  await capturePopout(`popout-${fixture.name}.png`);
  return webgl;
}
async function setQuality(quality) {
  await childEval(`(() => { const input = document.querySelector('[aria-label="3D quality"]'); if (!input || input.value === ${JSON.stringify(quality)}) return; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(input, ${JSON.stringify(quality)}); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await childWait(`!document.querySelector('[aria-label="3D quality"]') || document.querySelector('[aria-label="3D quality"]').value === ${JSON.stringify(quality)}`, `3D quality ${quality}`);
}
async function capturePopout(name) {
  await pause(300);
  const image = await popout.webContents.capturePage();
  if (!image.isEmpty()) await fs.writeFile(path.join(output, name), image.toPNG());
}

async function mirrorPhase() {
  await startRenderer();
  assert.equal(await evaluate("document.querySelector('.popout-3d-button')?.getAttribute('aria-label')"), 'Open 3D window');
  // Before the window exists: external URLs and other names are denied.
  for (const request of ["window.open('https://example.com/')", "window.open('', 'other-frame', 'popup')", "window.open('about:blank', '_blank')", "window.open('file:///', 'squidware-3d-preview')"]) {
    assert.equal(await evaluate(`${request} === null`), true, request); assert.equal(windowCount(), 1, request);
  }
  pass('external URLs, other frame names and non-blank preview requests are denied');

  const webgl = await mirrorFixture(fixtures[0]);
  // Exactly one window: repeated requests focus it, from the command, toolbar, shortcut and a direct same-name open.
  const focused = () => focusCalls.get(popout.id) ?? 0;
  for (const [how, run] of [['command', () => evaluate(`${editor}.dispatch('view.popout')`)], ['toolbar', () => evaluate("document.querySelector('.popout-3d-button[aria-label=\"Show 3D window\"]').click()")],
    ['shortcut', async () => { await evaluate('document.activeElement?.blur()'); await sendKey(main, 'T', ['shift'], 20); }]]) {
    const before = focused(); await run();
    await waitUntil(() => focused() > before, `${how} focuses the existing 3D window`); assert.equal(windowCount(), 2, how);
  }
  assert.equal(await evaluate("window.open('', 'squidware-3d-preview', 'popup') === window.__popoutQA.child()"), true, 'a second same-name request returns the existing window');
  assert.equal(windowCount(), 2);
  for (const request of ["window.open('', 'nested', 'popup')", "window.open('https://example.com/')", "window.open('', 'squidware-3d-preview-2', 'popup')"]) assert.equal(await childEval(`${request} === null`), true, `3D window: ${request}`);
  await childEval("location.href = 'https://example.com/'"); await pause(300);
  assert.equal(await childEval('location.href'), 'about:blank'); assert.equal(windowCount(), 2);
  pass('one 3D window: the command, toolbar and Shift+T focus it; it cannot open windows or navigate');

  // The child is sandboxed, has no bridge and enforces the app CSP.
  const preferences = popout.webContents.getLastWebPreferences();
  assert.deepEqual([preferences.sandbox, preferences.contextIsolation, preferences.nodeIntegration, preferences.webviewTag, preferences.preload || null], [true, true, false, false, null]);
  assert.deepEqual(await childEval('[typeof window.squidware, typeof window.require, typeof process, location.href]'), ['undefined', 'undefined', 'undefined', 'about:blank']);
  const csp = await childEval(`new Promise(resolve => { const violations = []; document.addEventListener('securitypolicyviolation', event => violations.push(event.violatedDirective));
    const script = document.createElement('script'); script.textContent = 'window.__inlineRan = true'; document.head.append(script);
    const image = new Image(); image.src = 'https://example.com/blocked.png'; document.body.append(image);
    fetch('https://example.com/').catch(() => {});
    setTimeout(() => { script.remove(); image.remove(); resolve({ ran: !!window.__inlineRan, violations: [...new Set(violations)].sort(), meta: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'), styled: getComputedStyle(document.querySelector('.popout-3d__status')).display }); }, 500); })`);
  assert.equal(csp.ran, false); assert.ok(['script-src-elem', 'img-src', 'connect-src'].every(directive => csp.violations.includes(directive)), JSON.stringify(csp));
  assert.deepEqual([csp.meta, csp.styled], [true, 'flex']);
  pass(`the 3D window is sandboxed without the desktop bridge and enforces the app CSP (${csp.violations.join(', ')} blocked); app styles apply`);

  // Hidden or minimized windows stop drawing; the editor keeps mirroring state.
  if (webgl) {
    const hiddenRun = async (label, hide, show) => {
      await hide(); await childWait("document.visibilityState === 'hidden'", `${label}: hidden`);
      const draws = await childEval('window.__childQA.draws');
      await evaluate(`${editor}.dispatch('playback.toggle')`); await pause(900); await evaluate(`${editor}.dispatch('playback.toggle')`);
      assert.equal(await childEval('window.__childQA.draws'), draws, `${label}: no frames while hidden`);
      assert.equal((await evaluate('window.__popoutQA.mirror()')).shownCount, await evaluate(`${editor}.getState().playback.count`));
      await show(); await childWait("document.visibilityState === 'visible'", `${label}: visible`);
      await evaluate(`${editor}.dispatch('playback.scrub', { count: 8 })`);
      await childWait(`window.__childQA.draws > ${draws}`, `${label}: rendering resumes`);
    };
    await hiddenRun('hide', () => popout.hide(), () => popout.showInactive());
    popout.minimize(); await pause(800);
    if (popout.isMinimized()) { await hiddenRun('minimize', async () => {}, () => popout.restore()); pass('a minimized 3D window pauses rendering and resumes on restore'); }
    else { metrics.minimize = 'not supported by this window manager'; popout.restore(); }
    pass('a hidden 3D window issues no frames during playback and resumes when shown');
  }

  // A graphics failure in the window is actionable and leaves 2D editing intact.
  const project = JSON.parse(fixtures[0].content);
  await evaluate(`${editor}.dispatch('set.select', { index: 0 })`);
  if (webgl) await childEval("document.querySelector('.popout-3d canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()");
  await childWait("!!document.querySelector('.stage-three__fallback[role=alert]')", '3D failure message');
  const failure = await childEval("({ text: document.querySelector('.stage-three__fallback').textContent, actions: [...document.querySelectorAll('.stage-three__fallback button')].map(button => button.getAttribute('aria-label')) })");
  assert.match(failure.text, webgl ? /graphics context was interrupted.*Reload the 3D preview/ : /could not render a WebGL preview/);
  assert.deepEqual(failure.actions, ['Reload 3D preview', 'Close 3D window']);
  await capturePopout('popout-failure.png');
  assert.equal(await evaluate(`${editor}.dispatch('positions.move', { index: 0, updates: { ${JSON.stringify(project.performers[1].id)}: { x: 61, y: 22 } } })`), true);
  await uiWait(`document.querySelectorAll('.field-performer').length === ${fixtures[0].count} && ${editor}.getState().project.present.sets[0].positions[${JSON.stringify(project.performers[1].id)}].x === 61`, '2D edit after 3D failure');
  await childEval("document.querySelector('.stage-three__fallback button[aria-label=\"Reload 3D preview\"]').click()");
  await childWait(webgl ? "!!document.querySelector('.stage-three__canvas canvas') && !document.querySelector('.stage-three__fallback')" : "!!document.querySelector('.stage-three__fallback[role=alert]')", 'reloaded 3D preview');
  if (webgl) { const draws = await childEval('window.__childQA.draws'); await evaluate(`${editor}.dispatch('playback.scrub', { count: 5 })`); await childWait(`window.__childQA.draws > ${draws}`, 'reloaded preview renders'); }
  pass(`3D failure in the window shows Reload/Close actions while 2D editing continues (${webgl ? 'context loss, then reload' : 'unavailable WebGL'})`);

  // While popped out the field shows a placeholder, never a second renderer; Return 3D here closes the window.
  await evaluate(`${editor}.dispatch('view.select', { view: '3d' })`);
  await uiWait("!!document.querySelector('.popout-3d-placeholder') && !document.querySelector('.field-container .stage-three__canvas')", 'inline placeholder');
  assert.equal(await evaluate('!!window.__popoutQA.inline()'), false);
  await capturePage(main, output, 'main-placeholder.png');
  let deletes = await evaluate('window.__popoutQA.childDeletes');
  await evaluate("document.querySelector('.popout-3d-placeholder button[aria-label=\"Return 3D here\"]').click()");
  const releasedByCommand = await closedAndReleased('Return 3D here', deletes);
  await uiWait("!!document.querySelector('.field-container .stage-three__canvas canvas, .field-container .stage-three__fallback[role=alert]') && !!window.__popoutQA.inline()", 'inline 3D restored');
  if (webgl) assert.ok(releasedByCommand > 0, 'closing disposes the 3D window renderer');
  pass('while open, the field shows one placeholder instead of a second renderer; Return 3D here closes the window and restores inline 3D');

  // Opening from inline 3D moves the field back to 2D; closing the OS window releases its renderer.
  const webglAgain = await openPopout('shortcut');
  // Use the reopened window (a first software frame can take a second) so its renderer holds GPU resources.
  if (webglAgain) { await evaluate(`${editor}.dispatch('playback.scrub', { count: 12 })`); await childWait('window.__childQA.draws > 0', 'reopened window renders'); }
  assert.equal(await evaluate(`${editor}.getState().ui.view`), '2d');
  deletes = await evaluate('window.__popoutQA.childDeletes');
  popout.close();
  const releasedByClose = await closedAndReleased('window close', deletes);
  if (webglAgain) assert.ok(releasedByClose > 0, 'the OS close disposes the renderer');
  assert.match((await evaluate('window.__popoutQA.events')).at(-1), /^pagehide canvases=0/, 'the scene unmounts while the closing document still exists');
  assert.deepEqual(await evaluate('window.__popoutQA.errors'), []);
  pass('closing the window releases its renderer and webContents; the main window stays usable');

  await mirrorFixture(fixtures[1]);
  // Geometry persists through the renderer's preferences after moves/resizes.
  const display = screen.getPrimaryDisplay().workArea;
  popout.setBounds({ x: display.x + 40, y: display.y + 30, width: 720, height: 460 }); await pause(200);
  const moved = popout.getNormalBounds();
  const file = path.join(profile, 'preferences.json');
  await waitUntil(async () => { try { const saved = JSON.parse(await fs.readFile(file, 'utf8')).popout3dBounds; return !!saved && ['x', 'y', 'width', 'height'].every(key => saved[key] === moved[key]) && Number.isInteger(saved.displayId); } catch { return false; } }, 'saved window geometry');
  popout.close(); await closedAndReleased('500 window close', 0);
  await fs.writeFile(path.join(output, 'expected-bounds.json'), JSON.stringify(moved));
  assert.deepEqual(await evaluate('window.__popoutQA.errors'), []);
  pass(`window geometry is saved per device after moving and resizing (${JSON.stringify(moved)})`);
  return webgl;
}

const inside = (bounds, area, tolerance = 16) => bounds.x >= area.x - tolerance && bounds.y >= area.y - tolerance && bounds.x + bounds.width <= area.x + area.width + tolerance && bounds.y + bounds.height <= area.y + area.height + tolerance;
const onSomeDisplay = bounds => screen.getAllDisplays().some(display => inside(bounds, display.workArea));
async function restorePhase() {
  await startRenderer();
  const expected = JSON.parse(await fs.readFile(path.join(output, 'expected-bounds.json'), 'utf8'));
  await openPopout('shortcut');
  const restored = popout.getNormalBounds();
  metrics.restore = { expected, restored };
  assert.ok(['x', 'y', 'width', 'height'].every(key => Math.abs(restored[key] - expected[key]) <= 24), JSON.stringify(metrics.restore));
  assert.ok(onSomeDisplay(restored), JSON.stringify(restored));
  pass(`after a restart Shift+T reopens the 3D window at its saved bounds (${JSON.stringify(restored)})`);
  // Theme and UI scale follow the editor into the window; the toolbar button stays reachable when enlarged.
  const appearance = (theme, uiScale) => evaluate(`${editor}.setValue('preferences', 'value', { ...${editor}.getState().preferences.value, theme: '${theme}', uiScale: ${uiScale} })`);
  await appearance('light', 1.25);
  await childWait("document.documentElement.dataset.theme === 'light' && getComputedStyle(document.documentElement).zoom === '1.25' && getComputedStyle(document.querySelector('.popout-3d__status')).backgroundColor === 'rgb(255, 255, 255)'", 'light theme and 125% scale in the 3D window');
  await uiWait("(() => { const r = document.querySelector('.popout-3d-button').getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.popout-3d-button'); })()", 'unobstructed toolbar button at 125%');
  await capturePopout('popout-light-125.png'); await capturePage(main, output, 'toolbar-light-125.png');
  await appearance('dark', 1);
  await childWait("document.documentElement.dataset.theme === 'dark' && getComputedStyle(document.documentElement).zoom === '1'", 'default appearance in the 3D window');
  pass('the 3D window follows the light theme and 125% UI scale; the toolbar button stays reachable and unobstructed');
  popout.close(); await closedAndReleased('restore close', 0);

  // The browser build has no bridge, so the feature stays hidden.
  const browser = new BrowserWindow({ show: false, width: 1366, height: 768, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    browser.webContents.setBackgroundThrottling(false);
    await browser.loadURL(pathToFileURL(path.join(root, 'dist', 'index.html')).href);
    await waitUntil(() => browser.webContents.executeJavaScript("!!document.querySelector('.set-card')"), 'renderer without desktop bridge');
    assert.deepEqual(await browser.webContents.executeJavaScript("[typeof window.squidware, !!document.querySelector('.popout-3d-button'), [...document.querySelectorAll('.view-switch button')].map(button => button.getAttribute('aria-label'))]"), ['undefined', false, ['2D field', '3D preview']]);
    pass('without the desktop bridge (browser build) the 3D window button stays hidden and the inline 3D option remains');
  } finally { browser.destroy(); }
}
async function clampPhase() {
  // Off-screen saved bounds on a connected display are pulled fully onto that display after a restart.
  const primary = screen.getPrimaryDisplay();
  const file = path.join(profile, 'preferences.json');
  const stored = JSON.parse(await fs.readFile(file, 'utf8'));
  stored.popout3dBounds = { x: primary.workArea.x + 50000, y: primary.workArea.y - 40000, width: 820, height: 500, displayId: primary.id };
  await fs.writeFile(file, JSON.stringify(stored));
  require(path.join(root, 'electron/main.cjs'));
  await startRenderer();
  await openPopout('command');
  const clamped = popout.getNormalBounds(), area = primary.workArea;
  metrics.offscreen = { saved: stored.popout3dBounds, clamped, workArea: area };
  assert.ok(inside(clamped, area), JSON.stringify(metrics.offscreen));
  assert.ok(Math.abs(clamped.x + clamped.width - (area.x + area.width)) <= 24 && Math.abs(clamped.y - area.y) <= 40, `clamped to the nearest edge: ${JSON.stringify(metrics.offscreen)}`);
  pass(`saved off-screen bounds open fully on screen after a restart (${JSON.stringify(clamped)})`);
  popout.close(); await closedAndReleased('off-screen close', 0);

  // A display that is no longer connected falls back to the centered primary display.
  await evaluate(`${editor}.setValue('preferences', 'value', { ...${editor}.getState().preferences.value, popout3dBounds: { x: -25000, y: 9000, width: 700, height: 440, displayId: 987654321 } })`);
  await waitUntil(async () => { try { return JSON.parse(await fs.readFile(file, 'utf8')).popout3dBounds?.displayId === 987654321; } catch { return false; } }, 'saved missing-display bounds');
  await openPopout('command');
  const centered = popout.getNormalBounds();
  metrics.missingDisplay = { centered, workArea: area };
  assert.ok(inside(centered, area), JSON.stringify(metrics.missingDisplay));
  assert.ok(Math.abs(centered.x + centered.width / 2 - (area.x + area.width / 2)) <= 24 && Math.abs(centered.y + centered.height / 2 - (area.y + area.height / 2)) <= 40, `centered: ${JSON.stringify(metrics.missingDisplay)}`);
  pass(`bounds saved for a missing display reopen centered on the primary display (${JSON.stringify(centered)})`);
  popout.close(); await closedAndReleased('missing display close', 0);
  assert.deepEqual(await evaluate('window.__popoutQA.errors'), []);
}

if (phase !== 'clamp') require(path.join(root, 'electron/main.cjs'));
app.whenReady().then(async () => {
  try {
    if (phase === 'mirror') metrics.webgl = await mirrorPhase();
    else if (phase === 'restore') await restorePhase();
    else if (phase === 'clamp') await clampPhase();
    else throw new Error(`Unknown phase: ${phase}`);
    await fs.writeFile(path.join(output, `${phase}-results.json`), JSON.stringify({ phase, checks, metrics, softwareWebgl, electron: process.versions.electron, platform: process.platform, displays: screen.getAllDisplays().map(({ id, workArea }) => ({ id, workArea })) }, null, 2));
    if (phase === 'clamp') {
      const phases = await Promise.all(['mirror', 'restore', 'clamp'].map(async name => JSON.parse(await fs.readFile(path.join(output, `${name}-results.json`), 'utf8'))));
      await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ phases, note: 'Production main/preload/renderer; hidden editor window, native 3D window. Cadence thresholds are lenient for hosted CI; metrics record actual values.' }, null, 2));
    }
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
