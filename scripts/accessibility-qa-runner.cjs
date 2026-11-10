'use strict';
const { capturePage, key: sendKey, waitFor: waitUntil, settleNativeViewport, installConfirmShim } = require('./testing/renderer.cjs');
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
  window.__accessibilityQA = { editor: null };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) {
      function visit(fiber) { if (!fiber) return; const value = fiber.memoizedProps?.value; if (value?.getState && value?.dispatch) window.__accessibilityQA.editor = value; visit(fiber.child); visit(fiber.sibling); }
      visit(root.current);
    }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
  };
}

// Timeline problem row (#180), self-contained: one Tab stop in set order, 24 × 24 px targets,
// named controls, valid ARIA references and states, readable text and in-viewport help.
async function timelineProblemChecks() {
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await uiWait("/^Show-wide problems: \\d+ findings?$/.test(document.querySelector('.problem-count-badge')?.getAttribute('aria-label')) && !!document.querySelector('.problem-track .problem-marker')", 'checked timeline problem markers');
  const inspect = () => evaluate(`(() => {
    const name = e => (e.getAttribute('aria-label') || e.textContent || '').trim(), track = document.querySelector('.problem-track');
    const targets = [...document.querySelectorAll('.problem-track .problem-marker, .problem-count-badge')].map(e => { const r = e.getBoundingClientRect(); return { label: name(e), left: r.left, right: r.right, width: r.width, height: r.height }; });
    const markers = [...track.querySelectorAll('.problem-marker')].map(e => e.getBoundingClientRect());
    const scope = [...document.querySelectorAll('.timeline, .problem-cluster-list')];
    const within = selector => scope.flatMap(root => [...root.querySelectorAll(selector)]);
    const refs = within('[aria-describedby], [aria-labelledby]').flatMap(e => ((e.getAttribute('aria-describedby') || '') + ' ' + (e.getAttribute('aria-labelledby') || '')).split(' ').filter(Boolean));
    const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
    const menu = document.querySelector('.problem-cluster-list [role=menu]');
    return { role: track.getAttribute('role'), name: track.getAttribute('aria-label'), tabStops: track.querySelectorAll('[tabindex="0"]').length,
      untabbable: [...track.querySelectorAll('.problem-marker')].filter(e => e.tabIndex !== 0 && e.tabIndex !== -1).length,
      small: targets.filter(t => t.width < 24 || t.height < 24), overlaps: markers.filter((r, i) => i && markers[i - 1].right > r.left + .5).length,
      unnamed: within('button, input, select, [tabindex], [role=menuitem]').filter(e => !name(e)).map(e => e.outerHTML.slice(0, 120)),
      // Label in Name (WCAG 2.5.3): visible marker text (a group's size badge) starts the accessible name.
      labelNotInName: [...track.querySelectorAll('.problem-marker')].filter(e => e.textContent.trim() && !name(e).startsWith(e.textContent.trim())).map(e => [e.textContent.trim(), name(e)]),
      popupState: [...track.querySelectorAll('[aria-haspopup]')].filter(e => !['true', 'false'].includes(e.getAttribute('aria-expanded'))).length,
      dangling: refs.filter(id => !document.getElementById(id)), duplicateIds: ids.filter((id, i) => id && ids.indexOf(id) !== i),
      menu: menu && { labelled: !!document.getElementById(menu.getAttribute('aria-labelledby'))?.textContent.trim(), items: menu.querySelectorAll('[role=menuitem]').length,
        stops: menu.querySelectorAll('[role=menuitem][tabindex="0"]').length, foreign: [...menu.children].filter(e => e.getAttribute('role') !== 'menuitem').length } };
  })()`);
  const clean = (result, label) => {
    assert.equal(result.role, 'toolbar', label); assert.equal(result.name, 'Problem markers', label); assert.equal(result.tabStops, 1, label); assert.equal(result.untabbable, 0, label);
    assert.deepEqual(result.small, [], `24 px targets: ${label}`); assert.equal(result.overlaps, 0, label); assert.deepEqual(result.unnamed, [], label); assert.deepEqual(result.labelNotInName, [], `label in name: ${label}`);
    assert.equal(result.popupState, 0, label); assert.deepEqual(result.dangling, [], label); assert.deepEqual(result.duplicateIds, [], label);
  };
  clean(await inspect(), 'timeline at rest');
  const label = () => evaluate("document.activeElement?.getAttribute('aria-label')");
  await tabTo('[aria-label="Timeline view"]');
  const order = [];
  // Each Tab reaches a differently named control; wait for it so a slow focus change is never read twice.
  for (let i = 0, previous = 'Timeline view'; i < 140 && order.at(-1) !== 'Timeline playhead'; i++) {
    await key('Tab'); await uiWait(`document.activeElement?.getAttribute('aria-label') !== ${JSON.stringify(previous)}`, 'Tab moves focus'); order.push(previous = await label());
  }
  const sets = order.filter(name => /^(Opening set|Set \d+):/.test(name)), problemStops = order.filter((_, i) => i > order.indexOf(sets.at(-1)) && i < order.length - 1);
  assert.match(order[0], /^Show-wide problems: \d+ finding/); assert.match(order[1], /^Opening set:/);
  // Every set of the loaded production is a stop, in order (the expected length comes from the project, not the tab order).
  const setCount = await evaluate(`${editor}.getState().project.present.sets.length`); assert.equal(setCount, 128);
  assert.deepEqual(sets.map(name => name.startsWith('Opening') ? 1 : Number(/^Set (\d+)/.exec(name)[1])), Array.from({ length: setCount }, (_, i) => i + 1));
  assert.equal(problemStops.length, 1, JSON.stringify(problemStops)); assert.equal(order.at(-1), 'Timeline playhead');
  await key('Tab', ['shift']); await uiWait(`document.activeElement?.getAttribute('aria-label') === ${JSON.stringify(problemStops[0])}`, 'Shift+Tab returns to the problem row');
  const help = async edge => {
    const target = `[...document.querySelectorAll('.problem-track .problem-marker')].at(${edge})`;
    await uiWait(`document.activeElement === ${target} && document.querySelector('.tooltip-panel')?.textContent.startsWith(${target}.getAttribute('aria-label'))`, 'marker help');
    return evaluate("(() => { const r = document.querySelector('.tooltip-panel').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()");
  };
  await key('End'); assert.equal(await help(-1), true, 'last marker help in view');
  await key('Home'); assert.equal(await help(0), true, 'first marker help in view');
  const group = await evaluate("(() => { const all = [...document.querySelectorAll('.problem-track .problem-marker')]; return all.findIndex(e => e.getAttribute('aria-haspopup') === 'menu'); })()");
  if (group >= 0) {
    for (let i = 0; i < group; i++) await key('Right');
    await uiWait(`document.activeElement === document.querySelectorAll('.problem-track .problem-marker')[${group}]`, 'arrow keys reach the first group');
    const opener = await label(); await key('Return');
    await uiWait("document.activeElement?.getAttribute('role') === 'menuitem'", 'problem group list');
    const open = await inspect(); clean(open, 'problem group open');
    assert.ok(open.menu.labelled && open.menu.items >= 2 && open.menu.stops === 1 && open.menu.foreign === 0, JSON.stringify(open.menu));
    const tree = await window.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    const nodes = tree.nodes.filter(node => !node.ignored);
    assert.equal(nodes.filter(node => node.role?.value === 'toolbar' && node.name?.value === 'Problem markers').length, 1);
    assert.equal(nodes.filter(node => node.role?.value === 'menuitem' && !node.name?.value).length, 0);
    assert.equal(nodes.filter(node => node.role?.value === 'menu' && node.name?.value).length, 1);
    await audit('timeline problem group list'); await capture('timeline-problem-group.png');
    await key('Escape'); await uiWait(`!document.querySelector('.problem-cluster-list') && document.activeElement?.getAttribute('aria-label') === ${JSON.stringify(opener)}`, 'Escape returns to the group marker');
  }
  await evaluate('document.activeElement?.blur()');
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: false });
  pass(`timeline Tab order follows set order with one problem-row stop; ${group >= 0 ? 'its group list and ' : ''}markers meet 24 px targets, naming, ARIA and in-viewport help checks`);
}

app.whenReady().then(async () => {
  try {
    await waitFor(() => Boolean(window), 'window'); await uiWait("!!document.querySelector('.field-performer')", 'renderer');
    window.setContentSize(1366, 768);
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` }); await installConfirmShim(source => window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source }));
    window.webContents.reload(); await uiWait(`!!${editor}`, 'instrumented editor');
    native('Open project…'); await uiWait("document.querySelectorAll('.field-performer').length === 500", 'maximum cast');
    const initial = JSON.parse(await fs.readFile(fixture, 'utf8')); const ids = initial.performers.map(person => person.id);
    const baseline = await revision();
    // A hidden test window has no OS focus, so focus events would never fire; emulate a focused window for this check.
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await evaluate("document.querySelector('.field-legend button:last-child').focus()");
    const legendReachable = await evaluate("(() => { const button=document.activeElement.getBoundingClientRect(); const row=document.querySelector('.field-legend-scroll').getBoundingClientRect(); return button.left>=row.left-.5 && button.right<=row.right+.5 && button.top>=row.top && button.bottom<=row.bottom; })()");
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: false });
    assert.equal(legendReachable, true);
    assert.equal(await revision(), baseline);
    pass('keyboard focus reveals the last section in the floating legend without editing the production');
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
    await timelineProblemChecks();

    await tabTo('.inspector textarea');
    // Cocoa app-menu accelerators require a visible key window. Exercise their
    // native menu entry in this intentionally hidden macOS test window instead.
    if (process.platform === 'darwin') native('Select all'); else await key('A', ['control']);
    await uiWait("document.activeElement.selectionStart===0 && document.activeElement.selectionEnd===document.activeElement.value.length", 'note text selected');
    await window.webContents.debugger.sendCommand('Input.insertText', { text: 'Keyboard-only rehearsal note' });
    await uiWait("document.querySelector('.inspector textarea').value==='Keyboard-only rehearsal note'", 'note draft entered'); await key('Return');
    await uiWait(`${editor}.getState().project.present.sets[0].notes==='Keyboard-only rehearsal note'`, 'note committed');
    native('Save As…'); await waitFor(async () => { try { return JSON.parse(await fs.readFile(savedFile, 'utf8')).sets[0].notes === 'Keyboard-only rehearsal note'; } catch { return false; } }, 'native save');
    await tabTo('.workspace-tab[aria-label="Production sheet"]', true); await key('Space');
    await uiWait("!!document.querySelector('.production-workspace')", 'keyboard Show activation');
    assert.equal(await evaluate(`${editor}.getState().playback.playing`), false);
    await audit('production overview');
    await tabTo('.workspace-tab[aria-label="Cast"]', true); await key('Return'); await uiWait("document.querySelectorAll('.cast-list li').length === 500", 'docked Cast review');
    await tabTo('[aria-label="Full Cast table"]'); await key('Return'); await uiWait("document.querySelectorAll('.cast-table tbody tr').length === 500", 'full Cast review');
    await audit('cast');
    await tabTo('.workspace-tab[aria-label="Design"]', true); await key('Return');
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

    await tabTo('[aria-label="Project menu"]', true); await key('Return'); await uiWait("!!document.querySelector('.dropdown')", 'project menu');
    await tabTo('[aria-label="Production settings"]'); await key('Return'); await uiWait("document.querySelector('.modal h2')?.textContent === 'Production settings'", 'settings');
    await audit('settings'); await tabTo('.modal .modal-actions .button'); await key('Return');
    await tabTo('.header-actions > .button.primary'); await key('Return');
    await uiWait("document.querySelector('.modal h2')?.textContent === 'Export'", 'export');
    await audit('export');
    // The contents choice belongs to the PDF section; the other formats form one full-width vertical list.
    assert.deepEqual(await evaluate("[...document.querySelectorAll('dialog[open] section[aria-labelledby]')].map(s => [document.getElementById(s.getAttribute('aria-labelledby')).textContent, [...s.querySelectorAll('[role=radiogroup][aria-label=\"PDF contents\"] strong, button')].map(n => n.textContent.trim())])"),
      [['PDF drill book', ['Field charts', 'Performer coordinate sheets', 'Save PDF']], ['Other formats', ['Coordinates CSV', 'Current chart SVG', 'Portable production with audio…']]]);
    assert.ok(await evaluate("(() => { const r = [...document.querySelectorAll('.export-secondary > button')].map(n => n.getBoundingClientRect()); return r.every((b, i) => Math.abs(b.left - r[0].left) < 1 && Math.abs(b.width - r[0].width) < 1 && (!i || b.top >= r[i - 1].bottom)); })()"), 'other export formats stack in one column');
    await tabTo('.export-secondary > button:first-child'); await key('Return');
    await waitFor(async () => { try { return (await fs.stat(csvFile)).size > 0; } catch { return false; } }, 'CSV export');
    assert.equal((await fs.readFile(csvFile, 'utf8')).trim().split('\n').length, 500 * 128 + 1);
    pass('the 500-performer production completes a keyboard-only native save and coordinate export');

    window.webContents.setZoomFactor(1.25); await settleNativeViewport(window, 'enlarged accessibility viewport');
    await audit('design at 125% UI zoom');
    await tabTo('.header-actions > .button.primary', true);
    assert.equal(await evaluate("(() => { const bounds = document.activeElement.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight; })()"), true);
    await capture('enlarged-text.png');
    const accessibility = await window.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    assert.equal(accessibility.nodes.filter(node => !node.ignored && node.role?.value === 'button' && !node.name?.value).length, 0);
    pass('enlarged UI text remains readable, keyboard controls stay reachable, and exposed buttons have accessible names');

    // #178 UI-scale breakpoints: a self-contained block. Every size × scale keeps required controls visible, folded
    // controls reachable through Menu, More playback options or tucked-panel overlays, and a logical keyboard order.
    window.webContents.setZoomFactor(1);
    const breakpoints = await require('./breakpoint-matrix-qa.cjs')({ window, evaluate, editor, state: `${editor}.getState()`, capture, pass, reachability: true });
    await audit('design after the UI-scale breakpoint matrix');

    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: checks, audits, breakpoints, viewport: await evaluate('({ width: innerWidth, height: innerHeight })'), rendererNodeAccess: await evaluate('typeof window.require') }, null, 2));
     app.exit(0);
  } catch (error) {
     console.error(error);
    await fs.writeFile(path.join(output, 'failed-audits.json'), JSON.stringify(audits, null, 2));
    if (window && !window.isDestroyed()) { await capture('failure.png').catch(() => {}); console.error(await evaluate("({ focus: document.activeElement?.outerHTML?.slice(0, 500), toast: document.querySelector('.toast')?.textContent })").catch(() => null)); }
    app.exit(1);
  }
});
