'use strict';
const { capturePage, key: sendKey, waitFor: waitUntil } = require('./testing/renderer.cjs');
const { app, BrowserWindow, dialog, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { auditText } = require('./accessibility-audit.cjs');
const manifest = require(process.argv.find(arg => arg.startsWith('--accessibility-manifest=')).slice('--accessibility-manifest='.length));
const { root, output, profile, fixture } = manifest;
const checks = []; const audits = [];
let window;
let failure;
const savedFile = path.join(output, `saved-${process.pid}.squid`);
const csvFile = path.join(output, `coordinates-${process.pid}.csv`);
app.setPath('userData', profile);
BrowserWindow.prototype.show = function () {};
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
dialog.showSaveDialog = async (_window, options) => ({ canceled: false, filePath: options.title.includes('CSV') ? csvFile : savedFile });
dialog.showMessageBox = async () => ({ response: 1 });
app.on('browser-window-created', (_event, created) => {
  window = created; created.webContents.setBackgroundThrottling(false);
  created.webContents.on('render-process-gone', (_event, details) => { failure = new Error(`Renderer exited: ${details.reason}`); });
});
require(path.join(root, 'electron/main.cjs'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => window.webContents.executeJavaScript(source);
const waitFor = (condition, label) => waitUntil(condition, label, { timeoutMs: 25000, failure: () => failure });
const uiWait = (source, label) => waitFor(() => evaluate(source), label);
function native(label) {
  function find(menu) { for (const item of menu?.items || []) { if (item.label === label) return item; const nested = find(item.submenu); if (nested) return nested; } }
  const item = find(Menu.getApplicationMenu()); if (!item) throw new Error(`Menu missing: ${label}`); item.click();
}
const key = (keyCode, modifiers = []) => sendKey(window, keyCode, modifiers, 5);
async function tabTo(selector, backwards = false) {
  // The maximum Cast has three controls per performer. Native workspace
  // activation may reset the focus origin, requiring a full traversal.
  const limit = await evaluate("document.querySelectorAll('button, input, select, textarea, a[href], [tabindex]').length + 1");
  for (let index = 0; index < limit; index++) {
    if (await evaluate(`document.activeElement?.matches(${JSON.stringify(selector)})`)) return;
    await key('Tab', backwards ? ['shift'] : []);
  }
  throw new Error(`Tab could not reach ${selector}`);
}
async function audit(label) {
  const result = await evaluate(`(${auditText.toString()})()`);
  audits.push({ label, ...result });
  assert.deepEqual(result.failures, [], `Text contrast/size: ${label}`);
  assert.ok(result.checked > 100, 'Expected a populated renderer audit');
}
const capture = name => capturePage(window, output, name);
const editor = 'window.__accessibilityQA.editor';
const focusId = () => evaluate("document.activeElement?.getAttribute('data-performer-id')");
const revision = () => evaluate(`${editor}.getState().project.revision`);
const pass = label => { checks.push(label); console.log(`PASS ${label}`); };
function instrument() {
  window.confirm = () => true;
  window.__accessibilityQA = { editor: null };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) {
      function visit(fiber) { if (!fiber) return; const value = fiber.memoizedProps?.value; if (value?.getState && value?.dispatch) window.__accessibilityQA.editor = value; visit(fiber.child); visit(fiber.sibling); }
      visit(root.current);
    }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
  };
}

app.whenReady().then(async () => {
  try {
    await waitFor(() => Boolean(window), 'window'); await uiWait("!!document.querySelector('.field-performer')", 'renderer');
    window.setContentSize(1366, 768);
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    window.webContents.reload(); await uiWait(`!!${editor}`, 'instrumented editor');
    native('Open project…'); await uiWait("document.querySelectorAll('.field-performer').length === 500", 'maximum cast');
    const initial = JSON.parse(await fs.readFile(fixture, 'utf8')); const ids = initial.performers.map(person => person.id);
    const baseline = await revision();
    assert.equal(await evaluate("document.querySelectorAll('.field-stage__svg [tabindex=" + '"0"' + "]').length"), 1);
    assert.equal(await evaluate("document.querySelector('.field-stage__svg').tabIndex"), -1);
    await tabTo('[aria-label="Fit field"]'); await key('Tab'); assert.equal(await focusId(), ids[0]);
    await key('Tab'); assert.equal(await evaluate("!!document.activeElement.closest('.field-stage__svg')"), false);
    await key('Tab', ['shift']); assert.equal(await focusId(), ids[0]);
    await key('Tab', ['shift']); assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), 'Fit field');
    await key('Tab');
    pass('Tab and Shift+Tab enter and leave a 500-performer field in one stop');

    await key('Right'); const rightId = await focusId();
    assert.ok(initial.sets[0].positions[rightId].x > initial.sets[0].positions[ids[0]].x);
    assert.equal(await revision(), baseline);
    await key('Home');
    const visited = [await focusId()];
    for (let index = 1; index < ids.length; index++) { await key('PageDown'); await uiWait(`document.activeElement?.getAttribute('data-performer-id')===${JSON.stringify(ids[index])}`, 'roster focus '+index); visited.push(await focusId()); }
    assert.deepEqual(visited, ids);
    assert.equal(await revision(), baseline);
    await key('PageDown'); assert.equal(await focusId(), ids.at(-1));
    await key('Home'); await key('Return');
    await key('PageDown'); await key('Space', ['shift']);
    assert.deepEqual(await evaluate(`${editor}.getState().selection.selectedIds`), ids.slice(0, 2));
    assert.equal(await evaluate(`${editor}.getState().playback.playing`), false);
    await key('Right', ['alt']); await key('Down', ['alt', 'shift']);
    const moved = await evaluate(`${editor}.getState().project.present.sets[0].positions`);
    for (const id of ids.slice(0, 2)) assert.deepEqual(moved[id], { x: initial.sets[0].positions[id].x + .625, y: initial.sets[0].positions[id].y + 2.5 });
    assert.deepEqual(moved[ids[2]], initial.sets[0].positions[ids[2]]);
    pass('spatial focus does not edit; all 500 dots including overlaps are reachable; selection and modifier nudges are distinct');

    await tabTo('[aria-label="Zoom in"]', true); await key('Return'); await key('Return'); await key('Return');
    await tabTo('.field-performer[tabindex="0"]'); await key('End');
    await uiWait("document.querySelector('.field-readout strong')?.textContent.includes('P500')", 'focused readout');
    assert.equal(await evaluate("document.activeElement.classList.contains('field-performer--focused')"), true);
    assert.equal(await evaluate("getComputedStyle(document.activeElement.querySelector('.field-focus-ring')).visibility"), 'visible');
    const visible = await evaluate("(() => { const dot = document.activeElement.getBoundingClientRect(); const field = document.querySelector('.field-stage__svg').getBoundingClientRect(); return dot.left >= field.left && dot.right <= field.right && dot.top >= field.top && dot.bottom <= field.bottom; })()");
    assert.equal(visible, true);
    await audit('design at 1366 × 768'); await capture('field-keyboard.png');
    pass('focused performers reveal coordinates, distinct focus outlines and off-viewport positions at 1366 × 768');

    await tabTo('.inspector textarea');
    // Cocoa app-menu accelerators require a visible key window. Exercise their
    // native menu entry in this intentionally hidden macOS test window instead.
    if (process.platform === 'darwin') native('Select all'); else await key('A', ['control']);
    await uiWait("document.activeElement.selectionStart===0 && document.activeElement.selectionEnd===document.activeElement.value.length", 'note text selected');
    await window.webContents.debugger.sendCommand('Input.insertText', { text: 'Keyboard-only rehearsal note' });
    await uiWait("document.querySelector('.inspector textarea').value==='Keyboard-only rehearsal note'", 'note draft entered'); await key('Return');
    await uiWait(`${editor}.getState().project.present.sets[0].notes==='Keyboard-only rehearsal note'`, 'note committed');
    native('Save As…'); await waitFor(async () => { try { return JSON.parse(await fs.readFile(savedFile, 'utf8')).sets[0].notes === 'Keyboard-only rehearsal note'; } catch { return false; } }, 'native save');
    await tabTo('.rail-button[aria-label="Show"]', true); await key('Space');
    await uiWait("!!document.querySelector('.production-workspace')", 'keyboard Show activation');
    assert.equal(await evaluate(`${editor}.getState().playback.playing`), false);
    await audit('production overview');
    await tabTo('.rail-button[aria-label="Cast"]', true); await key('Return'); await uiWait("document.querySelectorAll('.cast-table tbody tr').length === 500", 'cast review');
    await audit('cast');
    await tabTo('.rail-button[aria-label="Design"]', true); await key('Return');
    await tabTo('[aria-label="Next set"]'); await key('Return');
    await tabTo('.timeline-scrubber'); await key('Right');
    await uiWait("!!document.querySelector('.field-preview-banner')", 'keyboard preview');
    await tabTo('.field-performer[tabindex="0"]', true); const locked = await revision();
    await key('Right', ['alt']); assert.equal(await revision(), locked);
    await key('Right'); assert.equal(await revision(), locked);
    await audit('read-only transition');
    await tabTo('.field-preview-banner button', true); await key('Return');
    await uiWait("!document.querySelector('.field-preview-banner')", 'keyboard edit recovery');
    pass('keyboard-only note/save, Cast/Show review and preview recovery preserve edit locks and native button activation');

    await tabTo('.project-title', true); await key('Return'); await uiWait("document.querySelector('.modal h2')?.textContent === 'Production settings'", 'settings');
    await audit('settings'); await tabTo('.modal .modal-actions .button'); await key('Return');
    await tabTo('.header-actions > .button.primary'); await key('Return');
    await uiWait("document.querySelector('.modal h2')?.textContent === 'Take it to the field'", 'export');
    await audit('export'); await tabTo('.export-secondary > button:first-child'); await key('Return');
    await waitFor(async () => { try { return (await fs.stat(csvFile)).size > 0; } catch { return false; } }, 'CSV export');
    assert.equal((await fs.readFile(csvFile, 'utf8')).trim().split('\n').length, 500 * 128 + 1);
    pass('the 500-performer production completes a keyboard-only native save and coordinate export');

    window.webContents.setZoomFactor(1.25); await pause(100);
    await audit('design at 125% UI zoom');
    await tabTo('.header-actions > .button.primary', true);
    assert.equal(await evaluate("(() => { const bounds = document.activeElement.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight; })()"), true);
    await capture('enlarged-text.png');
    const accessibility = await window.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    assert.equal(accessibility.nodes.filter(node => !node.ignored && node.role?.value === 'button' && !node.name?.value).length, 0);
    pass('enlarged UI text remains readable, keyboard controls stay reachable, and exposed buttons have accessible names');

    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: checks, audits, viewport: await evaluate('({ width: innerWidth, height: innerHeight })'), rendererNodeAccess: await evaluate('typeof window.require') }, null, 2));
     app.exit(0);
  } catch (error) {
     console.error(error);
    await fs.writeFile(path.join(output, 'failed-audits.json'), JSON.stringify(audits, null, 2));
    if (window && !window.isDestroyed()) { await capture('failure.png').catch(() => {}); console.error(await evaluate("({ focus: document.activeElement?.outerHTML?.slice(0, 500), toast: document.querySelector('.toast')?.textContent })").catch(() => null)); }
    app.exit(1);
  }
});
