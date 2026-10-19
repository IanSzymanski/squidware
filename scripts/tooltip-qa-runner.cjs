'use strict';
const { key: sendKey, waitFor: waitUntil, capturePage, settleNativeViewport } = require('./testing/renderer.cjs');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'); const path = require('node:path'); const assert = require('node:assert/strict');
const { root, output, profile, force3DFallback, softwareWebgl } = require(process.argv.find(arg => arg.startsWith('--tooltip-manifest=')).slice('--tooltip-manifest='.length));
if (softwareWebgl) {
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
}
app.setPath('userData', profile);
let window; const checks = [];
const nativeSaveKeys = process.platform === 'darwin' ? /Cmd\s+S/ : /Ctrl\s+S/;
BrowserWindow.prototype.show = function () {};
dialog.showMessageBox = async () => ({ response: 1 });
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); });
require(path.join(root, 'electron/main.cjs'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => window.webContents.executeJavaScript(source).catch(error => { console.error('Failed QA expression:', source); throw error; });
const uiWait = (source, label) => waitUntil(() => evaluate(source), label, { timeoutMs: 15000 });
const editor = 'window.__tooltipQA.editor';
const selector = name => `[data-tooltip-name=${JSON.stringify(name)}]`;
const tooltip = () => evaluate("document.querySelector('[role=tooltip]')?.innerText || ''");
const key = (keyCode, modifiers = []) => sendKey(window, keyCode, modifiers, 15);
async function focus(name) {
  await evaluate(`document.activeElement?.blur(); document.querySelector(${JSON.stringify(selector(name))}).focus()`);
  await uiWait(`document.querySelector('[role=tooltip] strong')?.textContent === ${JSON.stringify(name)}`, 'focus help: ' + name);
}
async function hover(name) {
  await evaluate('document.activeElement?.blur()');
  const point = await evaluate(`(() => { const control = document.querySelector(${JSON.stringify(selector(name))}); control.scrollIntoView({ block: 'nearest' }); const rect = control.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 300 }); await pause(120);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
}
function instrument(force3DFallback) {
  if (force3DFallback) {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return String(kind).startsWith('webgl') ? null : getContext.call(this, kind, ...args);
    };
  }
  const qa = window.__tooltipQA = { editor: null, errors: [], events: [] };
  for (const type of ['pointerenter', 'pointerleave', 'focusin', 'focusout']) document.addEventListener(type, event => { if (event.target.getAttribute?.('data-tooltip-name')) qa.events.push([type, event.target.getAttribute('data-tooltip-name')]); }, true);
  window.addEventListener('error', event => qa.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => qa.errors.push(String(event.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { const visit = fiber => { if (!fiber) return; const value = fiber.memoizedProps?.value; if (value?.getState && value?.dispatch) qa.editor = value; visit(fiber.child); visit(fiber.sibling); }; visit(root.current); },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
const pass = label => { checks.push(label); console.log('PASS ' + label); };
async function finish() {
  assert.deepEqual(await evaluate('window.__tooltipQA.errors'), []);
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, force3DFallback, electron: process.versions.electron, platform: process.platform,
    note: force3DFallback ? 'Unavailable WebGL and post-fallback help/capture only.' : 'Native and emulated Mac keycaps and touch; physical-device and assistive-technology review remains #64.' }, null, 2));
  app.exit(0);
}

app.whenReady().then(async () => {
  try {
    while (!window) await pause(15);
    await uiWait("!!document.querySelector('.set-card')", 'initial renderer');
    window.setContentSize(1366, 768);
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    // Hidden-window keyboard help needs page focus independent of prior pointer scenarios.
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})(${!!force3DFallback})` });
    window.webContents.reload(); await uiWait(`!!${editor} && !!document.querySelector('.set-card')`, 'renderer');
    await key('Tab');
    await uiWait("document.activeElement.hasAttribute('data-tooltip-name')", 'initial native Tab focus');

    if (!force3DFallback) {
      await hover('Save'); await pause(230); assert.equal(await tooltip(), '');
      await uiWait("document.querySelector('[role=tooltip] strong')?.textContent === 'Save'", 'delayed hover');
      assert.match(await tooltip(), nativeSaveKeys);
      await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 300 });
      // Native input acknowledgement can precede the renderer's delayed dismissal.
      await uiWait("!document.querySelector('[role=tooltip]')", 'hover help dismissed on pointer leave');
      pass('pointer help waits approximately 400 ms and dismisses on leave');

      await focus('Undo'); assert.match(await tooltip(), /Unavailable:.*no earlier edits/);
      const revision = await evaluate(`${editor}.getState().project.revision`);
      await key('Return'); await key('Space');
      assert.equal(await evaluate(`${editor}.getState().project.revision`), revision);
      await key('Tab'); assert.equal(await evaluate("document.activeElement.getAttribute('data-tooltip-name')"), 'Redo');
      await key('Tab', ['shift']); assert.equal(await evaluate("document.activeElement.getAttribute('data-tooltip-name')"), 'Undo');
      pass('disabled actions are keyboard reachable, explain their state and ignore Enter/Space');

      await evaluate(`${editor}.setValue('selection', 'selectedIds', [${editor}.getState().project.present.performers[0].id])`);
      await focus('Show field grid'); assert.match(await tooltip(), /Current: On/);
      await key('Escape'); assert.equal(await tooltip(), '');
      assert.equal(await evaluate(`${editor}.getState().selection.selectedIds.length`), 1);
      await key('Return'); await focus('Show field grid'); assert.match(await tooltip(), /Current: Off/);
      await evaluate(`${editor}.setValue('selection', 'selectedIds', []); ${editor}.setValue('preferences', 'value', {...${editor}.getState().preferences.value, inspectorFormationOpen: true})`); await focus('Preview formation');
      assert.match(await tooltip(), /Unavailable:.*Select performers first/);
      await evaluate(`${editor}.setValue('selection', 'selectedIds', [${editor}.getState().project.present.performers[0].id])`);
      assert.match(await tooltip(), /Preview a shape for 1 selected performer/);
      for (const name of ['Align selection']) {
        await focus(name); assert.match(await tooltip(), /Unavailable:.*Select at least two performers/);
        await key('Return'); await key('Space');
        assert.equal(await evaluate(`${editor}.getState().project.revision`), revision);
      }
      await focus('Mirror selection'); assert.match(await tooltip(), /Preview a mirror across the 50/);
      pass('Escape dismisses help without clearing selection; toggle and formation explanations stay current');

      await evaluate(`${editor}.dispatch('set.select', { index: 0 })`); await focus('Counts'); await pause(150);
      assert.match(await tooltip(), /Counts/);
      assert.match(await tooltip(), /opening set.*zero counts/);
      assert.equal(await evaluate("document.querySelector('.tooltip-disabled-field input').disabled"), true);
      await key('Space'); assert.equal(await evaluate(`${editor}.getState().playback.playing`), false);
      await key('Tab'); assert.equal(await evaluate("document.activeElement.getAttribute('data-tooltip-name')"), 'Tempo · BPM');
      await evaluate(`${editor}.dispatch('set.select', { index: 1 })`); await focus('Counts');
      assert.equal(await evaluate("document.activeElement.tagName"), 'INPUT');
      assert.ok(await evaluate("document.activeElement.getAttribute('aria-describedby').split(' ').every(id => document.getElementById(id))"));
      pass('Inspector fields retain native disabled behavior and expose focusable explanations');

      await evaluate(`${editor}.dispatch('playback.scrub', { count: 1 })`); await focus('Preview formation');
      assert.match(await tooltip(), /Unavailable:.*Return to a set/);
      await key('Return'); assert.equal(await evaluate(`${editor}.getState().project.revision`), revision);
      await evaluate(`${editor}.dispatch('set.select', { index: 0 })`);
      const coverage = await evaluate("['.set-card', '.field-legend button', '.formation-grid button', '.view-switch button'].map(selector => Array.from(document.querySelectorAll(selector)).every(control => control.hasAttribute('data-tooltip-name'))) ");
      assert.deepEqual(coverage, [true, true, true, true]);
      pass('preview actions explain edit recovery; set, legend, formation and view controls all have help');
    }

    await evaluate(`${editor}.setValue('ui', 'view', '3d')`);
    // Camera controls mount before the renderer effect runs. Wait for its
    // canvas or error state so unavailable WebGL cannot remove a control
    // between choosing it and focusing its help.
    await uiWait("!!document.querySelector('.stage-three__canvas canvas, .stage-three__fallback[role=alert]')", 'initialized 3D renderer or fallback');
    if (softwareWebgl) assert.equal(await evaluate("!!document.querySelector('.stage-three__fallback[role=alert]')"), false, 'Software WebGL must exercise the camera layout; fallback has a separate suite.');
    if (!await evaluate("!!document.querySelector('.stage-three__fallback[role=alert]')")) {
      const layouts = [];
      await evaluate('document.activeElement?.blur()');
      await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type:'mouseMoved', x:0, y:0 });
      await uiWait("!document.querySelector('[role=tooltip]')", 'clear camera layout overlays');
      for (const [width, scale] of [[1366, 1], [1120, 1.25]]) {
        window.setContentSize(width, 768); window.webContents.setZoomFactor(scale);
        await settleNativeViewport(window, '3D viewport scale');
        for (const focusMode of [false, true]) {
          await evaluate(`if (${editor}.getState().ui.focusMode !== ${focusMode}) ${editor}.dispatch('layout.focus')`);
          await uiWait(`!!document.querySelector('.studio--focus') === ${focusMode}`, '3D focus mode');
          for (const preview of [false, true]) {
            await evaluate(`${editor}.dispatch(${JSON.stringify(preview ? 'playback.scrub' : 'set.select')}, ${JSON.stringify(preview ? {count:1} : {index:0})})`);
            await uiWait(`!!document.querySelector('.field-preview-banner') === ${preview}`, '3D preview state');
            await settleNativeViewport(window, '3D overlay geometry');
            const layout = await evaluate(`(() => {
              const camera=document.querySelector('.stage-three__controls').getBoundingClientRect();
              const legend=document.querySelector('.field-legend').getBoundingClientRect();
              const banner=document.querySelector('.field-preview-banner')?.getBoundingClientRect();
              const restore=document.querySelector('.focus-restore')?.getBoundingClientRect();
              const overlap=r=>!!r && camera.left<r.right && camera.right>r.left && camera.top<r.bottom && camera.bottom>r.top;
              const obscured=[...document.querySelectorAll('.stage-three__controls button,.stage-three__controls select')].filter(n=>{const r=n.getBoundingClientRect(); return !n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}).map(n=>n.getAttribute('aria-label'));
              return { camera:camera.toJSON(), legend:legend.toJSON(), banner:banner?.toJSON(), restore:restore?.toJSON(), overlapsLegend:overlap(legend), overlapsPreview:overlap(banner), overlapsRestore:overlap(restore), obscured };
            })()`);
            assert.equal(layout.overlapsLegend, false, JSON.stringify(layout)); assert.equal(layout.overlapsPreview, false, JSON.stringify(layout)); assert.equal(layout.overlapsRestore, false, JSON.stringify(layout)); assert.deepEqual(layout.obscured, [], JSON.stringify(layout));
            layouts.push({width,scale,focusMode,preview,...layout});
            await capturePage(window, output, `camera-${width}-${scale}-${focusMode ? 'focus-' : ''}${preview ? 'preview' : 'set'}.png`);
          }
        }
      }
      await evaluate(`if (${editor}.getState().ui.focusMode) ${editor}.dispatch('layout.focus')`);
      await uiWait("!document.querySelector('.studio--focus')", 'restore full workspace');
      await fs.writeFile(path.join(output, 'camera-layouts.json'), JSON.stringify(layouts,null,2));
      window.webContents.setZoomFactor(1); window.setContentSize(1366,768);
      await settleNativeViewport(window, 'restored 3D viewport');
      await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled:true });
      await evaluate(`${editor}.dispatch('set.select', {index:0})`);
      pass('3D camera buttons and quality remain unobstructed by the section legend, preview banner and Exit focus at default and narrow enlarged sizes');
    }
    await focus('Zoom in'); assert.match(await tooltip(), /Unavailable:.*Switch to 2D/);
    if (await evaluate("!!document.querySelector('.stage-three__fallback[role=alert]')")) {
      await focus('Return to 2D field'); assert.match(await tooltip(), /editable field/);
    } else { await focus('Overhead camera'); assert.match(await tooltip(), /straight down/); }
    if (force3DFallback) assert.equal(await evaluate("!!document.querySelector('.stage-three__fallback[role=alert]')"), true);
    await evaluate(`${editor}.setValue('ui', 'view', '2d')`);
    pass('3D zoom limitations and camera effects are explained');

    await focus('Save');
    assert.equal(await evaluate("document.activeElement.getAttribute('title')"), null);
    assert.ok(await evaluate("(() => { const r = document.querySelector('.tooltip-panel').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()"));
    await hover('Save'); await uiWait("!!document.querySelector('[role=tooltip]')", 'hover screenshot'); await pause(80);
    // A hidden Linux window may stop producing compositor frames after 3D
    // fallback. Electron's capture API explicitly wakes it without showing it.
    await capturePage(window, output, 'focus-help.png');
    pass('hidden-window screenshot completes after 3D controls or fallback');
    if (force3DFallback) { await finish(); return; }
    await evaluate(`${editor}.dispatch('help.open')`); await uiWait("!!document.querySelector('dialog[open] .shortcut-list')", 'help dialog');
    const saveKeys = () => evaluate("Array.from(document.querySelectorAll('.shortcut-list > div')).find(row => row.querySelector('dt').textContent === 'Save production').querySelector('dd').innerText");
    assert.match(await saveKeys(), nativeSaveKeys);
    await focus('Close dialog'); assert.equal(await evaluate("!!document.querySelector('dialog[open] [role=tooltip]')"), true);
    await key('Escape'); assert.equal(await tooltip(), ''); assert.equal(await evaluate("!!document.querySelector('dialog[open]')"), true);
    await key('Escape'); await uiWait("!document.querySelector('dialog[open]')", 'dialog dismissal');
    pass('descriptions use aria-describedby, stay inside the viewport and work inside modal top layers');

    await evaluate("Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })");
    await evaluate(`${editor}.setValue('ui', 'toast', 'Platform QA')`); await focus('Save'); assert.match(await tooltip(), /Cmd\s+S/);
    await evaluate(`${editor}.dispatch('help.open')`); await uiWait("!!document.querySelector('dialog[open] .shortcut-list')", 'Mac help');
    assert.match(await saveKeys(), /Cmd\s+S/); await evaluate(`${editor}.setValue('ui', 'dialog', null)`);
    pass('Windows and emulated macOS tooltip/help keycaps agree with the current registry');

    await evaluate("document.activeElement?.blur(); document.querySelector('[data-tooltip-name=\"Save\"]').dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, pointerType: 'touch' }))");
    await pause(450); assert.equal(await tooltip(), '');
    await evaluate("document.querySelector('[data-tooltip-name=\"Save\"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); document.querySelector('[data-tooltip-name=\"Save\"]').focus()");
    await pause(30); assert.equal(await tooltip(), '');
    pass('touch hover/focus does not leave persistent help or require an extra tap');
    await finish();
  } catch (error) { console.error(error); console.error(await tooltip().catch(() => 'Renderer unavailable')); console.error(await evaluate("JSON.stringify({ events: window.__tooltipQA.events, active: document.activeElement.outerHTML.slice(0, 200), panel: document.querySelector('.tooltip-panel')?.getBoundingClientRect() })").catch(() => 'No diagnostics'));  app.exit(1); }
});
