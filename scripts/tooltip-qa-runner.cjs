'use strict';
const {revealFieldTool}=require('./testing/renderer.cjs');
const { key: sendKey, keyWithRelease, waitFor: waitUntil, capturePage, settleNativeViewport } = require('./testing/renderer.cjs');
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
// A name can belong to more than one mounted control (the Plan sheet's Counts column and the Inspector's Counts
// field); an optional scope says which one is meant.
const selector = (name, scope = '') => `${scope ? scope + ' ' : ''}[data-tooltip-name=${JSON.stringify(name)}]`;
const tooltip = () => evaluate("document.querySelector('[role=tooltip]')?.innerText || ''");
const key = (keyCode, modifiers = []) => sendKey(window, keyCode, modifiers, 15);
const frames = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
// Focus help follows :focus-visible. Programmatic focus after a pointer action
// shows none, so reach each control with native Tab/Shift+Tab (keyboard modality).
async function focus(name, scope) {
  await revealFieldTool(window,selector(name, scope));
  const target = `document.querySelector(${JSON.stringify(selector(name, scope))})`;
  await evaluate(`${target}.focus()`);
  await keyWithRelease(window, 'Tab', [], { releaseKey: 'Tab' }); await keyWithRelease(window, 'Tab', ['shift'], { releaseKey: 'Tab' });
  await revealFieldTool(window,selector(name, scope));
  await evaluate(`if (document.activeElement !== ${target}) ${target}.focus()`);
  await uiWait(`document.activeElement === ${target} && document.querySelector('[role=tooltip] strong')?.textContent === ${JSON.stringify(name)}`, 'focus help: ' + name);
}
async function click(name, scope) {
  await revealFieldTool(window,selector(name, scope));
  const point = await evaluate(`(() => { const control = document.querySelector(${JSON.stringify(selector(name, scope))}); control.scrollIntoView({ block: 'nearest' }); const rect = control.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
}
const contained = (name, scope) => evaluate(`(() => { const a = document.querySelector(${JSON.stringify(selector(name, scope))}).getBoundingClientRect(), p = document.querySelector('.tooltip-panel').getBoundingClientRect(), w = document.documentElement.clientWidth, h = document.documentElement.clientHeight;
  return (p.left >= 0 && p.top >= 0 && p.right <= w && p.bottom <= h && !(p.left < a.right && p.right > a.left && p.top < a.bottom && p.bottom > a.top)) || JSON.stringify({ name, anchor: a, panel: p, w, h }); })()`);
async function hover(name, hidden = false, scope) {
  await revealFieldTool(window,selector(name, scope));
  await evaluate('document.activeElement?.blur()');
  const point = await evaluate(`(() => { const control = document.querySelector(${JSON.stringify(selector(name, scope))}); control.scrollIntoView({ block: 'nearest' }); const rect = control.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  if(hidden){window.hide();assert.equal(window.isVisible(),false,'hidden capture exercises a hidden native window');}
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
      // A production without unsaved changes has no Save button in the top bar: Save is in the Project menu, whose row
      // shows the shortcut beside its name. The Save button and its own help are checked below, once there is an edit.
      assert.equal(await evaluate("document.querySelectorAll('[data-tooltip-name=\"Save\"]').length === 1 && !!document.querySelector('[role=menu][aria-label=\"Project menu\"] [data-tooltip-name=\"Save\"]')"), true);
      await hover('Save'); await pause(230); assert.equal(await tooltip(), '');
      await uiWait("document.querySelector('[role=tooltip] strong')?.textContent === 'Save'", 'delayed hover');
      assert.match(await evaluate("document.querySelector('[role=menu][aria-label=\"Project menu\"] [data-tooltip-name=\"Save\"] .shortcut-keycaps').innerText"), nativeSaveKeys);
      await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 300 });
      // Native input acknowledgement can precede the renderer's delayed dismissal.
      await uiWait("!document.querySelector('[role=tooltip]')", 'hover help dismissed on pointer leave');
      // Escape on the menu button closes the menu the pointer left open.
      await evaluate("document.querySelector('[data-menu-trigger][aria-label=\"Project menu\"]').focus()"); await key('Escape');
      await uiWait("document.querySelector('[role=menu][aria-label=\"Project menu\"]').hidden && !document.querySelector('[role=tooltip]')", 'Project menu closed');
      await evaluate('document.activeElement?.blur()');
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
      // Show field grid is a checkable item of View options: one Escape closes its help and the menu, and keyboard
      // focus (with its own help) returns to the menu button.
      await key('Escape');await uiWait("document.querySelector('[role=menu][aria-label=\"View options\"]').hidden && document.activeElement === document.querySelector('[data-menu-trigger][aria-label=\"View options\"]') && document.querySelector('[role=tooltip] strong')?.textContent === 'View options'", 'Escape closes item help and the View options menu');
      assert.equal(await evaluate(`${editor}.getState().selection.selectedIds.length`), 1);
      await focus('Show field grid');await key('Return'); await focus('Show field grid'); assert.match(await tooltip(), /Current: Off/);
      await evaluate(`${editor}.setValue('selection', 'selectedIds', []); ${editor}.setValue('preferences', 'value', {...${editor}.getState().preferences.value, inspectorFormationOpen: true})`); await focus('Line formation');
      assert.match(await tooltip(), /Unavailable:.*Select performers.*first/);
      await evaluate(`${editor}.setValue('selection', 'selectedIds', [${editor}.getState().project.present.performers[0].id])`);
      await focus('Line formation');
      assert.match(await tooltip(), /Arrange the 1 selected performer in a line\. Adjust on the field, then Apply\./);
      for (const name of ['Align selection']) {
        await focus(name); assert.match(await tooltip(), /Unavailable:.*Select at least two performers/);
        await key('Return'); await key('Space');
        assert.equal(await evaluate(`${editor}.getState().project.revision`), revision);
      }
      await focus('Mirror selection'); assert.match(await tooltip(), /Flip the selection across the 50 yard line/);
      pass('Escape dismisses help without clearing selection; toggle and formation explanations stay current');

      await evaluate(`${editor}.setValue('selection', 'selectedIds', ${editor}.getState().project.present.performers.slice(0, 4).map(p => p.id))`);
      const previewRevision = await evaluate(`${editor}.getState().project.revision`);
      // Each preview moves keyboard focus (and its help) into the preview; the
      // transform preview starts on a select, which still forwards Escape.
      for (const [name, preview, tag] of [['Line formation', 'formationPreview', 'BUTTON'], ['Align selection', 'spacingPreview', 'BUTTON'], ['Rotate selection', 'transformPreview', 'SELECT']]) {
        await focus(name); await key('Return');
        await uiWait(`!!${editor}.getState().ui.${preview} && document.activeElement.tagName === ${JSON.stringify(tag)} && document.querySelector('[role=tooltip] strong')?.textContent === document.activeElement.closest('[data-tooltip-name]')?.getAttribute('data-tooltip-name')`, `${name} preview focus help`);
        await key('Escape'); await uiWait(`!${editor}.getState().ui.${preview}`, `one Escape cancels ${name}`);
        await frames(); assert.equal(await tooltip(), '', name);
        assert.equal(await evaluate(`${editor}.getState().selection.selectedIds.length`), 4, name);
        assert.equal(await evaluate(`${editor}.getState().project.revision`), previewRevision, name);
      }
      await evaluate(`${editor}.setValue('selection', 'selectedIds', [${editor}.getState().project.present.performers[0].id])`);
      pass('one Escape closes preview help and cancels shape, align and transform previews while keeping the selection');

      await evaluate(`${editor}.dispatch('set.select', { index: 0 })`); await focus('Counts', '.inspector .set-timing'); await pause(150);
      assert.match(await tooltip(), /Counts/);
      assert.match(await tooltip(), /opening set.*zero counts/);
      assert.equal(await evaluate("document.querySelector('.tooltip-disabled-field input').disabled"), true);
      await key('Space'); assert.equal(await evaluate(`${editor}.getState().playback.playing`), false);
      await key('Tab'); assert.equal(await evaluate("document.activeElement.getAttribute('data-tooltip-name')"), 'Tempo · BPM');
      await evaluate(`${editor}.dispatch('set.select', { index: 1 })`); await focus('Counts', '.inspector .set-timing');
      assert.equal(await evaluate("document.activeElement.tagName"), 'INPUT');
      assert.ok(await evaluate("document.activeElement.getAttribute('aria-describedby').split(' ').every(id => document.getElementById(id))"));
      pass('Inspector fields retain native disabled behavior and expose focusable explanations');

      // Between sets the tool strip names the move and offers the way back to editing.
      await evaluate(`${editor}.dispatch('playback.scrub', { count: 1 })`); await focus('Go to set 2 to edit');
      assert.match(await tooltip(), /Go to set 2 to edit\s+Stop at this set so its positions can be edited\./);assert.equal(await evaluate("document.activeElement.getAttribute('aria-disabled')"),null);
      assert.equal(await evaluate("document.querySelector('#field-lock-message').textContent"), 'Between setsMove 1 → 2');
      await key('Return'); await uiWait(`${editor}.getState().selection.activeIndex === 1 && !document.querySelector('#field-lock-message')`, 'Enter returns to editing at the set');
      assert.equal(await evaluate(`${editor}.getState().project.revision`), revision);
      await evaluate(`${editor}.dispatch('set.select', { index: 0 })`);
      // Every set card, section chip and view control has help; so does every shape choice while a formation is previewed.
      const covered = selectors => evaluate(`${JSON.stringify(selectors)}.map(selector => { const controls = Array.from(document.querySelectorAll(selector)); return controls.length > 0 && controls.every(control => control.hasAttribute('data-tooltip-name')); })`);
      assert.deepEqual(await covered(['.set-strip .set-card', '.selection-bar .field-legend button', '.view-switch button']), [true, true, true]);
      await focus('Line formation');await key('Return');await uiWait("!!document.querySelector('.formation-grid button')",'formation help controls');
      assert.deepEqual(await covered(['.set-strip .set-card', '.formation-grid button', '.view-switch button']), [true, true, true]);await key('Escape');
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
              const cameraGroup=document.querySelector('.studio--focus .field-container .stage-three__controls')??document.querySelector('.field-command-toolbar .stage-three__controls');
              const camera=cameraGroup.getBoundingClientRect();
              const legend=document.querySelector('.field-legend').getBoundingClientRect();
              const banner=document.querySelector('.field-preview-banner')?.getBoundingClientRect();
              const restore=document.querySelector('.focus-restore')?.getBoundingClientRect();
              const overlap=r=>!!r && camera.left<r.right && camera.right>r.left && camera.top<r.bottom && camera.bottom>r.top;
              const controls=[...new Set([...cameraGroup.querySelectorAll('button,select'),...document.querySelectorAll('.stage-three__quality select')])].filter(n=>n.getClientRects().length);
              const obscured=controls.filter(n=>{const r=n.getBoundingClientRect(); return !n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}).map(n=>n.getAttribute('aria-label'));
              return { camera:camera.toJSON(), legend:legend.toJSON(), banner:banner?.toJSON(), restore:restore?.toJSON(), overlapsLegend:overlap(legend), overlapsPreview:overlap(banner), overlapsRestore:overlap(restore), obscured, controls:controls.map(n=>n.getAttribute('aria-label')), cameras:controls.filter(n=>/ camera$/.test(n.getAttribute('aria-label')||'')).length, quality:controls.filter(n=>n.tagName==='SELECT').length };
            })()`);
            assert.equal(layout.overlapsLegend, false, JSON.stringify(layout)); assert.equal(layout.overlapsPreview, false, JSON.stringify(layout)); assert.equal(layout.overlapsRestore, false, JSON.stringify(layout)); assert.deepEqual(layout.obscured, [], JSON.stringify(layout));
            // Four camera presets and the quality choice are on screen in every arrangement; Exit focus exists in focus mode.
            assert.ok(layout.camera.width > 0 && layout.cameras === 4 && layout.quality >= 1, JSON.stringify(layout)); assert.equal(!!layout.restore?.width, focusMode, JSON.stringify(layout));
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
    // The zoom cluster floats over the 2D field; over the 3D stage it is hidden, and the camera controls take its place.
    assert.equal(await evaluate("(() => { const zoom = [...document.querySelectorAll('.field-container .canvas-zoom button')]; return JSON.stringify(zoom.map(control => [control.getAttribute('aria-label'), control.getClientRects().length])); })()"),JSON.stringify([['Zoom out',0],['Fit field',0],['Zoom in',0]]),'3D hides 2D zoom tools');
    if (await evaluate("!!document.querySelector('.stage-three__fallback[role=alert]')")) {
      await focus('Return to 2D field'); assert.match(await tooltip(), /editable field/);
    } else { await focus('Overhead camera'); assert.match(await tooltip(), /straight down/); }
    if (force3DFallback) assert.equal(await evaluate("!!document.querySelector('.stage-three__fallback[role=alert]')"), true);
    await evaluate(`${editor}.setValue('ui', 'view', '2d')`);
    await uiWait("[...document.querySelectorAll('.field-container .canvas-zoom button')].filter(control => control.getClientRects().length).length === 3", '2D zoom tools return');
    pass('3D zoom limitations and camera effects are explained');

    // The top bar shows Save while the production has unsaved changes. One real edit puts it there for the checks below.
    assert.equal(await evaluate("!!document.querySelector('.topbar [data-tooltip-name=\"Save\"]')"), false);
    assert.equal(await evaluate(`${editor}.dispatch('set.update', { index: 0, update: { notes: 'Help for unsaved changes' } })`), true);
    await uiWait("!!document.querySelector('.topbar .header-save[data-tooltip-name=\"Save\"]')?.getClientRects().length && document.querySelector('.save-state').classList.contains('save-state--unsaved')", 'Save button for unsaved changes');
    await focus('Save', '.topbar');
    assert.equal(await evaluate("document.activeElement.getAttribute('title')"), null);
    assert.match(await tooltip(), nativeSaveKeys); assert.match(await tooltip(), /Current: Unsaved changes/);
    assert.equal(await contained('Save', '.topbar'), true);
    // The recovery indicator sits in the top bar at full width; a narrower header keeps recovery in the Project menu.
    await focus('Recovery copies', '.topbar'); await frames(); assert.equal(await contained('Recovery copies', '.topbar'), true);
    // Controls at the window's edges under UI scale: the transport's first and last controls on the bottom row (left
    // and right edge) and the Project menu in the top-left corner. Help stays inside the viewport and never covers
    // its own control. Focus mode hides the top bar.
    for (const scale of [1.25, 1.5]) {
      await evaluate(`${editor}.setValue('preferences', 'value', {...${editor}.getState().preferences.value, uiScale: ${scale}})`);
      for (const focusMode of [false, true]) {
        await evaluate(`if (${editor}.getState().ui.focusMode !== ${focusMode}) ${editor}.dispatch('layout.focus')`);
        await uiWait(`!!document.querySelector('.studio--focus') === ${focusMode} && document.documentElement.style.getPropertyValue('--ui-scale') === '${scale}'`, 'scaled tooltip layout'); await frames();
        if (!focusMode) assert.equal(await evaluate("document.querySelector('.studio').dataset.header === 'compact' && !document.querySelector('.topbar .recovery-indicator').getClientRects().length && !!document.querySelector('[role=menu][aria-label=\"Project menu\"] [data-tooltip-name=\"Recovery copies\"]')"), true, 'compact header keeps recovery in the Project menu');
        for (const name of focusMode ? ['First set', 'Timeline options'] : ['First set', 'Timeline options', 'Project menu']) {
          const scope = name === 'Project menu' ? '.topbar' : '.transport';
          await focus(name, scope); await frames(); const placed = await contained(name, scope);
          assert.equal(placed, true, `${name} at ${scale}${focusMode ? ' in focus mode' : ''}: ${placed}`);
        }
      }
      await evaluate(`if (${editor}.getState().ui.focusMode) ${editor}.dispatch('layout.focus')`);
    }
    await evaluate(`${editor}.setValue('preferences', 'value', {...${editor}.getState().preferences.value, uiScale: 1})`);
    await uiWait("!document.querySelector('.studio--focus') && document.documentElement.style.getPropertyValue('--ui-scale') === '1'", 'restored tooltip scale');
    await focus('Save', '.topbar');
    await hover('Save', true, '.topbar'); await uiWait("document.querySelector('[role=tooltip] strong')?.textContent === 'Save'", 'hover screenshot'); await pause(80);
    assert.match(await tooltip(), nativeSaveKeys);
    // A hidden Linux window may stop producing compositor frames after 3D
    // fallback. Electron's capture API explicitly wakes it without showing it.
    await capturePage(window, output, 'focus-help.png');
    assert.equal(window.isVisible(),false,'capture preserves the hidden window');
    pass('hidden-window screenshot completes after 3D controls or fallback');
    if (force3DFallback) { await finish(); return; }
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 300 });
    await uiWait("!document.querySelector('[role=tooltip]')", 'hover help dismissed before Help');
    await evaluate(`${editor}.dispatch('help.open')`); await uiWait("!!document.querySelector('dialog[open] .shortcut-list')", 'help dialog');
    const saveKeys = () => evaluate("Array.from(document.querySelectorAll('.shortcut-list > div')).find(row => row.querySelector('dt').textContent === 'Save production').querySelector('dd').innerText");
    assert.match(await saveKeys(), nativeSaveKeys);
    await focus('Close dialog'); assert.equal(await evaluate("!!document.querySelector('dialog[open] [role=tooltip]')"), true);
    // Escape closes help and continues to the dialog: one press dismisses both.
    await key('Escape'); await uiWait("!document.querySelector('dialog[open]')", 'one Escape closes help and dialog'); assert.equal(await tooltip(), '');
    // A pointer-opened dialog focuses Close without :focus-visible, so no help covers its intro.
    await click('Help'); await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 300 });
    await uiWait(`!!document.activeElement?.matches('dialog[open] [aria-label="Close dialog"]')`, 'pointer-opened Help focuses Close'); await frames();
    assert.equal(await evaluate("document.activeElement.matches(':focus-visible')"), false); assert.equal(await tooltip(), '');
    await key('Escape'); await uiWait("!document.querySelector('dialog[open]')", 'pointer-opened dialog closes with one Escape');
    pass('descriptions use aria-describedby, stay inside the viewport and work inside modal top layers; pointer-opened dialogs show no help and one Escape closes help with its dialog');

    await evaluate("Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })");
    await evaluate(`${editor}.setValue('ui', 'toast', 'Platform QA')`); await focus('Save', '.topbar'); assert.match(await tooltip(), /Cmd\s+S/);
    await evaluate(`${editor}.dispatch('help.open')`); await uiWait("!!document.querySelector('dialog[open] .shortcut-list')", 'Mac help');
    assert.match(await saveKeys(), /Cmd\s+S/); await evaluate(`${editor}.setValue('ui', 'dialog', null)`);
    pass('Windows and emulated macOS tooltip/help keycaps agree with the current registry');

    await evaluate("document.activeElement?.blur(); document.querySelector('.topbar [data-tooltip-name=\"Save\"]').dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, pointerType: 'touch' }))");
    await pause(450); assert.equal(await tooltip(), '');
    await evaluate("document.querySelector('.topbar [data-tooltip-name=\"Save\"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); document.querySelector('.topbar [data-tooltip-name=\"Save\"]').focus()");
    await pause(30); assert.equal(await tooltip(), '');
    pass('touch hover/focus does not leave persistent help or require an extra tap');
    await finish();
  } catch (error) { console.error(error); console.error(await tooltip().catch(() => 'Renderer unavailable')); console.error(await evaluate("JSON.stringify({ events: window.__tooltipQA.events, active: document.activeElement.outerHTML.slice(0, 200), panel: document.querySelector('.tooltip-panel')?.getBoundingClientRect() })").catch(() => 'No diagnostics'));  app.exit(1); }
});
