'use strict';
const { app, BrowserWindow, session, ipcMain } = require('electron');
process.on('uncaughtException', error => { console.error(error); app.exit(1); });
process.on('unhandledRejection', error => { console.error(error); app.exit(1); });
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL, fileURLToPath } = require('node:url');
const manifest = require(process.argv.find(arg => arg.startsWith('--stage3d-manifest=')).slice('--stage3d-manifest='.length));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = path.join(manifest.output, `profile-${process.pid}`);
require('node:fs').mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.on('window-all-closed', () => {});
// This component harness uses the production desktop recovery backend. Full
// main/preload trust enforcement is separately covered by desktop/editor QA.
const recovery = require(path.join(manifest.root, 'electron/recovery-service.cjs')).createRecoveryService(path.join(profile, 'recovery'));
const preferences = require(path.join(manifest.root, 'electron/preferences-service.cjs')).createPreferencesService(profile, async (filename, content) => {
  // Ordered preference writes use an isolated atomic replacement in this component harness.
  const temporary = filename + '.qa-temporary';
  await fs.writeFile(temporary, content); await fs.rename(temporary, filename);
});
const appUrl = pathToFileURL(path.join(manifest.build, 'index.html')).href;
for (const [channel, action] of [
  ['read-preferences', () => preferences.read()], ['save-preferences', value => preferences.save(value)], ['reset-preferences', () => preferences.reset()],
  ['begin-recovery', () => recovery.begin()], ['list-recoveries', token => recovery.list(token)],
  ['read-recovery', (token, id) => recovery.read(token, id)],
  ['write-recovery', (token, sequence, revision, project) => recovery.write(token, sequence, revision, project)],
  ['migrate-recovery', (token, content) => recovery.migrate(token, content)],
]) ipcMain.handle(`squidware:${channel}`, async (event, ...args) => {
  if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== appUrl) throw new Error('Untrusted QA frame.');
  return action(...args);
});

function instrument(content, baseline) {
  if (baseline) localStorage.setItem('squidware.autosave.v1', content);
  const state = window.__stageQA = { contexts: 0, lost: 0, raf: 0, draws: 0, created: {}, deleted: {}, instances: [], errors: [], editor: null };
  const seen = new WeakSet();
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const context = getContext.call(this, type, ...args);
    if (context && /^webgl/.test(type) && !seen.has(context)) {
      seen.add(context); state.contexts++;
      this.addEventListener('webglcontextlost', () => state.lost++);
    }
    return context;
  };
  const raf = requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(time => { state.raf++; callback(time); });
  for (const constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!constructor) continue;
    for (const kind of ['Buffer', 'Texture', 'Program']) for (const action of ['create', 'delete']) {
      const method = action + kind;
      const original = constructor.prototype[method];
      constructor.prototype[method] = function(...args) {
        const result = original.apply(this, args);
        const inventory = action === 'create' ? state.created : state.deleted;
        if (action === 'create' ? result : args[0]) inventory[kind] = (inventory[kind] || 0) + 1;
        return result;
      };
    }
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = constructor.prototype[method];
      if (!original) continue;
      constructor.prototype[method] = function(...args) {
        state.draws++;
        if (method.endsWith('Instanced')) state.instances.push(args.at(-1));
        return original.apply(this, args);
      };
    }
  }
  window.addEventListener('error', event => state.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => state.errors.push(String(event.reason)));
  // Use the same command store the production controls use; no test API ships in the app.
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) {
      const visit = fiber => {
        if (!fiber) return;
        const value = fiber.memoizedProps?.value;
        if (value?.getState && value?.dispatch) {
          state.editor = value;
          if (!baseline && !state.fixtureLoaded) { state.fixtureLoaded = true; queueMicrotask(() => value.dispatch('project.load', { project: JSON.parse(content) })); }
        }
        visit(fiber.child); visit(fiber.sibling);
      };
      visit(root.current);
    }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
  };
}

async function run(fixture, blockLazy = false) {
  console.log(`${fixture.name}: creating isolated renderer`);
  const window = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(manifest.root, 'electron/preload.cjs'), backgroundThrottling: false } });
  // Page commands otherwise queue indefinitely before a renderer exists.
  await window.loadURL('about:blank');
  window.webContents.debugger.attach('1.3');
  const command = (method, args) => window.webContents.debugger.sendCommand(method, args);
  const requestedScripts = new Set();
  window.webContents.debugger.on('message', (_event, method, params) => {
    if (method === 'Network.requestWillBeSent' && /\.js$/.test(params.request.url)) requestedScripts.add(params.request.url);
  });
  const evaluate = source => window.webContents.executeJavaScript(source);
  const checks = [];
  const pass = label => { checks.push(label); console.log(`${fixture.name}: PASS ${label}`); };
  const waitFor = async (source, label) => {
    for (let i = 0; i < 150; i++) { if (await evaluate(source)) return; await pause(50); }
    throw new Error(`Timed out: ${label}`);
  };
  const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(100); };
  const view = async type => { await evaluate(`Array.from(document.querySelectorAll('.view-switch button')).find(button => button.textContent.includes(${JSON.stringify(type)})).click()`); await pause(100); };
  const snapshot = () => evaluate('(({ contexts, lost, raf, draws, created, deleted, errors }) => ({ contexts, lost, raf, draws, created, deleted, errors }))(window.__stageQA)');
  const idle = async () => { await pause(2000); const before = await snapshot(); await pause(2000); const after = await snapshot(); return { durationMs: 2000, raf: after.raf - before.raf, draws: after.draws - before.draws }; };
  const dispatch = async (id, args) => { assert.equal(await evaluate(`window.__stageQA.editor.dispatch(${JSON.stringify(id)}, ${JSON.stringify(args)})`), true); await pause(150); };
  const screenshot = async name => { await fs.writeFile(path.join(manifest.output, `${fixture.name}-${name}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()); };
  try {
    await command('Page.enable');
    await command('Network.enable');
    console.log(`${fixture.name}: debugger ready`);
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})(${JSON.stringify(fixture.content)}, ${manifest.baseline})` });
    await window.loadURL(pathToFileURL(path.join(manifest.build, 'index.html')).href);
    console.log(`${fixture.name}: production page loaded`);
    await waitFor('!!document.querySelector(".field-performer") && !!window.__stageQA.editor', 'production field');
    await pause(900);
    // File:// pages do not expose reliable Resource Timing entries; record actual requests.
    const startupResources = [...requestedScripts];
    assert.ok(startupResources.length > 0);
    const startupBytes = (await Promise.all(startupResources.map(url => fs.stat(fileURLToPath(url)).then(stat => stat.size)))).reduce((sum, size) => sum + size, 0);
    if (!manifest.baseline) { assert.equal(startupResources.some(url => /\/three-|\/Stage3D-/.test(url)), false); pass('3D and Three.js are absent from startup requests'); }
    if (blockLazy) {
      await command('Network.setBlockedURLs', { urls: ['*Stage3D-*.js'] });
      await view('3D');
      await waitFor('!!document.querySelector(".stage-three__fallback[role=alert]")', 'lazy import failure');
      await click('.stage-three__fallback button');
      await waitFor('!!document.querySelector(".field-performer")', '2D after import failure');
      await dispatch('positions.move', { index: 0, updates: { [fixture.firstId]: { x: 45, y: 20 } } });
      pass('failed 3D chunk load returns to an editable 2D field');
      return { fixture: fixture.name, importFailure: true, checks };
    }
    await view('3D');
    await waitFor('!!document.querySelector(".stage-three canvas") && window.__stageQA.draws > 0', 'rendered 3D scene');
    const initial = await snapshot();
    const initialIdle = await idle();
    if (manifest.baseline) {
      await screenshot('initial');
      await view('2D'); await pause(200);
      return { fixture: fixture.name, startupBytes, startupResources: startupResources.map(url => path.basename(fileURLToPath(url))), initial, initialIdle, disposed: await snapshot() };
    }
    assert.equal(initialIdle.raf, 0); assert.equal(initialIdle.draws, 0);
    pass('paused 3D issues no frames or draw calls after settling');
    const contextCount = initial.contexts;
    await click('.stage-three__controls button:nth-child(2)');
    assert.ok((await snapshot()).draws > initial.draws);
    const canvasPoint = await evaluate("(() => { const box = document.querySelector('.stage-three canvas').getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()");
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...canvasPoint, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: canvasPoint.x + 70, y: canvasPoint.y + 25, buttons: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: canvasPoint.x + 70, y: canvasPoint.y + 25, button: 'left', clickCount: 1 });
    const cameraIdle = await idle(); assert.equal(cameraIdle.draws, 0); assert.equal(cameraIdle.raf, 0);
    pass('camera presets and orbit damping redraw then return to idle');
    const project = JSON.parse(fixture.content);
    await dispatch('section.update', { id: project.sections[0].id, update: { color: '#ff5577' } });
    assert.equal((await snapshot()).contexts, contextCount);
    await dispatch('project.update', { preset: project.field.preset === 'college' ? 'high-school' : 'college' });
    assert.equal((await snapshot()).contexts, contextCount);
    pass('section recoloring and field texture changes retain the graphics context');
    if (fixture.count < 500) {
      const csv = `label,name,section\nQAExtra,Extra,"${fixture.section.replaceAll('"', '""')}"\n`;
      await evaluate(`(() => { const transfer = new DataTransfer(); transfer.items.add(new File([${JSON.stringify(csv)}], 'qa.csv', { type: 'text/csv' })); const input = document.querySelector('input[accept=".csv"]'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await waitFor(`window.__stageQA.editor.getState().project.present.performers.length === ${fixture.count + 1}`, 'roster growth');
      await pause(150);
      assert.equal((await snapshot()).contexts, contextCount);
      assert.equal(await evaluate('Math.max(...window.__stageQA.instances.slice(-40))'), (fixture.count + 1) * 2);
      pass('roster growth expands instance buffers without recreating the renderer');
    }
    await dispatch('performers.remove', { ids: [fixture.firstId] });
    assert.equal((await snapshot()).contexts, contextCount);
    await dispatch('history.undo');
    const currentIds = await evaluate('window.__stageQA.editor.getState().project.present.performers.map(person => person.id)');
    await dispatch('performers.remove', { ids: currentIds });
    assert.equal((await snapshot()).contexts, contextCount);
    await dispatch('history.undo');
    await dispatch('positions.move', { index: 0, updates: { [fixture.firstId]: { x: 45, y: 20 } } });
    await dispatch('selection.all');
    const afterEdits = await snapshot();
    assert.equal(afterEdits.contexts, contextCount); assert.ok(afterEdits.draws > initial.draws);
    pass('roster removal, undo, positions and selection redraw in the retained context');
    await pause(500);
    const lightBefore = await snapshot();
    await evaluate("(() => { const input = document.querySelector('[aria-label=\"3D quality\"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(input, 'lightweight'); input.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await waitFor(`window.__stageQA.draws > ${lightBefore.draws}`, 'lightweight render');
    const lightIdle = await idle(); assert.equal(lightIdle.draws, 0);
    const lightAfter = await snapshot();
    const lightweightDraws = lightAfter.draws - lightBefore.draws;
    const lightweightFrames = lightAfter.raf - lightBefore.raf;
    assert.equal((await snapshot()).contexts, contextCount);
    await screenshot('lightweight');
    await view('2D'); await view('3D');
    await waitFor('!!document.querySelector(".stage-three canvas")', '3D remount');
    assert.equal(await evaluate("document.querySelector('[aria-label=\"3D quality\"]').value"), 'lightweight');
    await idle();
    const detailedBefore = await snapshot();
    await evaluate("(() => { const input = document.querySelector('[aria-label=\"3D quality\"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(input, 'detailed'); input.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await waitFor(`window.__stageQA.draws > ${detailedBefore.draws}`, 'detailed render');
    const detailedIdle = await idle(); assert.equal(detailedIdle.draws, 0);
    const detailedAfter = await snapshot();
    const detailedDraws = detailedAfter.draws - detailedBefore.draws;
    const detailedFrames = detailedAfter.raf - detailedBefore.raf;
    assert.ok(detailedDraws / detailedFrames > lightweightDraws / lightweightFrames && lightweightDraws > 0, JSON.stringify({ detailedDraws, detailedFrames, lightweightDraws, lightweightFrames }));
    await screenshot('detailed');
    await dispatch('playback.toggle');
    const playingBefore = await snapshot(); await pause(1000); const playingAfter = await snapshot();
    assert.ok(playingAfter.draws > playingBefore.draws);
    await dispatch('playback.toggle');
    const pausedIdle = await idle(); assert.equal(pausedIdle.draws, 0); assert.equal(pausedIdle.raf, 0);
    pass('quality choice survives view switching; playback renders and pause returns to idle');
    for (let i = 0; i < 3; i++) { await view('2D'); await view('3D'); await waitFor('!!document.querySelector(".stage-three canvas")', 'repeated 3D mount'); await pause(150); }
    await evaluate("document.querySelector('.stage-three canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()");
    await waitFor('!!document.querySelector(".stage-three__fallback [role=alert]") || !!document.querySelector(".stage-three__fallback[role=alert]")', 'context loss fallback');
    await screenshot('failure');
    await click('.stage-three__fallback button');
    await waitFor('!!document.querySelector(".field-performer")', '2D after failure');
    await pause(200);
    const disposed = await snapshot();
    assert.equal(disposed.lost, disposed.contexts);
    for (const kind of ['Buffer', 'Texture', 'Program']) assert.ok(disposed.deleted[kind] > 0);
    assert.equal(disposed.errors.length, 0);
    pass('repeated switches dispose GPU resources and context loss returns to usable 2D');
    return { fixture: fixture.name, startupBytes, startupResources: startupResources.map(url => path.basename(fileURLToPath(url))), initial, initialIdle, cameraIdle, pausedIdle, lightweightDraws, lightweightFrames, detailedDraws, detailedFrames, disposed, checks };
  } finally { window.destroy(); }
}

(async () => {
  console.log('Waiting for Electron');
  await app.whenReady();
  console.log('Electron ready');
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const timeout = setTimeout(() => { console.error('3D QA timed out'); app.exit(1); }, 240000);
  try {
    const fixtures = [];
    for (const fixture of manifest.fixtures) fixtures.push(await run(fixture));
    if (!manifest.baseline) fixtures.push(await run(manifest.fixtures[0], true));
    await fs.writeFile(path.join(manifest.output, 'report.json'), JSON.stringify({ hardware: manifest.hardware, buildSha256: manifest.buildSha256, electron: process.versions.electron, chrome: process.versions.chrome, gpu: await app.getGPUInfo('complete'), baseline: manifest.baseline, fixtures }, null, 2));
    clearTimeout(timeout); app.exit(0);
  } catch (error) { clearTimeout(timeout); console.error(error); app.exit(1); }
})();
