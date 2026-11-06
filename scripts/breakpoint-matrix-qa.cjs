'use strict';
// UI-scale-aware breakpoints (#178): the window size × UI scale matrix shared by the field presentation and
// accessibility suites. Native window sizes and the UI scale preference drive the layout; assertions read the
// rendered result (rows, hit tests, drawn field), never the thresholds in src/editor/breakpoints.ts.
const assert = require('node:assert/strict');
const { key: sendKey, settleNativeViewport, waitFor } = require('./testing/renderer.cjs');

const SIZES = [[900, 650], [1024, 700], [1366, 768], [1920, 1080]];
const SCALES = [1, 1.25, 1.5];
/** The issue's acceptance points need a drawn field of at least 480 × 260 window px; every other point keeps a usable floor. */
const ACCEPTANCE = new Set(['1366x768@1.5', '900x650@1']);
const TARGET = { width: 480, height: 260 };
/** The desktop window's minimum content size at the largest UI scale. */
const MINIMUM = [800, 600, 1.5];
const FLOOR = { width: 400, height: 210 };
const REQUIRED = ['Command palette', 'Undo', 'Redo', 'Save', 'Export', 'Project menu', 'Design', 'Cast', 'Production sheet', 'First set', 'Previous set', 'Previous count', 'Play show', 'Next count', 'Next set', 'Last set', 'Mute audio'];
const HEADER_FOLDED = ['Workspace layout', 'Focus field', 'Help', 'History'];
const TRANSPORT_FOLDED = { full: [], compact: ['Loop show', 'Metronome', 'Playback speed'], narrow: ['Rehearsal passages', 'Attach audio', 'Loop show', 'Metronome', 'Playback speed'] };

const probe = `(() => {
  const scale = Number(document.documentElement.style.getPropertyValue('--ui-scale')) || 1;
  const studio = document.querySelector('.studio');
  const named = name => [...document.querySelectorAll('[aria-label]')].filter(n => n.getAttribute('aria-label') === name);
  const reachable = n => { if (!n || !n.getClientRects().length) return false; const r = n.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.left < -.5 || r.top < -.5 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5) return false; const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && n.contains(hit); };
  const oneRow = nodes => { const rects = nodes.filter(n => n.getClientRects().length).map(n => n.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0); return rects.length > 1 && Math.max(...rects.map(r => r.top)) < Math.min(...rects.map(r => r.bottom)); };
  const header = document.querySelector('.app-header'), transport = document.querySelector('.transport'), body = document.querySelector('.studio-body');
  const svg = document.querySelector('.field-stage__svg').getBoundingClientRect(), surface = document.querySelector('[data-field-surface]').getBoundingClientRect();
  const field = document.querySelector('.field-container').getBoundingClientRect();
  const names = ${JSON.stringify([...REQUIRED, ...HEADER_FOLDED, ...TRANSPORT_FOLDED.narrow, 'Show Set list', 'Show Inspector', 'More playback options'])};
  return { scale, viewport: [innerWidth, innerHeight], effective: [studio.clientWidth, studio.clientHeight], tiers: { ...studio.dataset },
    header: { height: header.getBoundingClientRect().height / scale, oneRow: oneRow([...header.children, ...header.querySelector('.header-actions').children]), overflow: header.scrollWidth > header.clientWidth + 1 },
    transport: { height: transport.getBoundingClientRect().height / scale, oneRow: oneRow([...transport.querySelectorAll('.transport-options > *, .play-controls > *, .count-display > *')]) },
    reachable: Object.fromEntries(names.map(name => [name, named(name).some(reachable)])), present: Object.fromEntries(names.map(name => [name, named(name).length])),
    showCount: reachable(document.querySelector('.show-count')),
    panes: { sets: document.querySelector('#workspace-pane-sets').hidden, side: document.querySelector('.workspace-pane--right').hidden },
    field: { width: field.width, height: field.height, effectiveHeight: field.height / scale },
    drawn: { width: Math.min(svg.right, surface.right) - Math.max(svg.left, surface.left), height: Math.min(svg.bottom, surface.bottom) - Math.max(svg.top, surface.top) },
    documentOverflow: document.documentElement.scrollWidth > innerWidth + 1, bodyScroll: body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1 };
})()`;

/** `reachability` also opens every overflow menu and tucked panel natively and walks keyboard focus through them. */
module.exports = async function checkBreakpointMatrix({ window, evaluate, editor, state, capture, pass, reachability = false }) {
  const wait = (source, label) => waitFor(() => evaluate(source), label, { timeoutMs: 20000 });
  const frames = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const key = (code, modifiers = []) => sendKey(window, code, modifiers, 20);
  const active = () => evaluate("document.activeElement?.getAttribute('aria-label')");
  // CDP mouse input takes viewport CSS px, the space getBoundingClientRect reports under the UI scale's CSS zoom.
  async function nativeClick(selector) {
    const point = await evaluate(`(() => { const n = ${selector}; n.scrollIntoView({ block: 'nearest' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
  }
  const byName = (name, scope = 'document') => `[...${scope}.querySelectorAll('[aria-label]')].find(n => n.getAttribute('aria-label') === ${JSON.stringify(name)})`;
  const reachableIn = (names, scope) => evaluate(`(${JSON.stringify(names)}).filter(name => { const n = ${byName('NAME', scope).replace('"NAME"', 'name')}; if (!n) return true; n.scrollIntoView({ block: 'nearest' }); const r = n.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(r.width > 0 && r.left >= 0 && r.right <= innerWidth + .5 && r.top >= 0 && r.bottom <= innerHeight + .5 && hit && n.contains(hit)); })`);
  async function applySize(width, height, scale) {
    window.setContentSize(width, height); window.webContents.setZoomFactor(1);
    await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:${scale}}))`);
    await settleNativeViewport(window, `breakpoint viewport ${width}x${height}@${scale}`);
    await wait(`(() => { const s = document.querySelector('.studio'); return Math.abs(s.clientWidth - ${width / scale}) <= 1 && Math.abs(s.clientHeight - ${height / scale}) <= 1; })()`, `effective viewport ${width}x${height}@${scale}`);
    await frames(); await evaluate(`${editor}.dispatch('field.fit')`); await frames(); await frames();
    // Leave no hover or focus help over the controls being hit-tested.
    await evaluate('document.activeElement?.blur()');
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
    await wait("!document.querySelector('[role=tooltip]')", 'help dismissed before measuring');
  }

  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await evaluate(`${editor}.setValue('ui','dialog',null); ${editor}.setValue('ui','menu',false); ${editor}.setValue('ui','focusMode',false); ${editor}.setValue('ui','view','2d'); ${editor}.setValue('ui','workspace','design'); ${editor}.setValue('ui','castPanelOpen',false); ${editor}.setValue('selection','selectedIds',[])`);
  const layoutBefore = await evaluate(`JSON.stringify({ layout: ${state}.preferences.value.workspaceLayout, cast: ${state}.preferences.value.castPanelOpen })`);
  const project = await evaluate(`${state}.project.revision`);
  const metrics = [];
  /** `matrix` points must fit without scrolling and keep the drawn-field floor; the smallest supported window at 150%
   * may scroll the workspace, but keeps the header, the pinned transport and every folded control reachable. */
  async function verify(width, height, scale, matrix = true) {
    const label = `${width}x${height}@${scale}`;
    await applySize(width, height, scale);
    const m = await evaluate(probe); metrics.push({ label, ...m });
    const tiers = m.tiers; const context = `${label} ${JSON.stringify(m)}`;
    assert.ok(m.header.oneRow && m.header.height <= 50 && !m.header.overflow, `header is one row: ${context}`);
    assert.ok(m.transport.oneRow, `transport is one row: ${context}`);
    assert.deepEqual(REQUIRED.filter(name => !m.reachable[name]), [], `required controls are visible and unobstructed: ${context}`);
    assert.equal(m.showCount, true, `show count visible: ${context}`);
    // Folded controls leave the header and transport entirely (no hidden duplicates); unfolded ones stay reachable.
    const headerFolded = tiers.header !== 'full' ? HEADER_FOLDED : [];
    for (const name of HEADER_FOLDED) assert.equal(headerFolded.includes(name) ? m.present[name] === 0 : m.reachable[name], true, `${name} in the header: ${context}`);
    const transportFolded = TRANSPORT_FOLDED[tiers.transport];
    for (const name of TRANSPORT_FOLDED.narrow) assert.equal(transportFolded.includes(name) ? m.present[name] === 0 : m.reachable[name], true, `${name} in the transport: ${context}`);
    assert.equal(m.reachable['More playback options'], transportFolded.length > 0, `More playback options: ${context}`);
    // Tucked panels keep their Show button; nothing scrolls or overflows.
    if (m.panes.sets) assert.ok(m.reachable['Show Set list'], `tucked set list can be shown: ${context}`);
    if (m.panes.side) assert.ok(m.reachable['Show Inspector'], `tucked Inspector can be shown: ${context}`);
    assert.equal(m.documentOverflow, false, `no document overflow: ${context}`);
    if (matrix) {
      assert.equal(m.bodyScroll, false, `workspace fits without scrolling: ${context}`);
      const minimum = ACCEPTANCE.has(label) ? TARGET : FLOOR;
      assert.ok(m.drawn.width >= minimum.width && m.drawn.height >= minimum.height, `drawn field at least ${minimum.width} × ${minimum.height}: ${context}`);
    }
    if (reachability) {
      if (headerFolded.length) {
        await nativeClick(byName('Project menu')); await wait("!!document.querySelector('.dropdown')", `${label} Menu open`);
        assert.deepEqual(await reachableIn(HEADER_FOLDED, "document.querySelector('.dropdown')"), [], `${label} folded header controls are reachable in Menu`);
        await nativeClick("document.querySelector('.menu-dismiss')"); await wait("!document.querySelector('.dropdown')", `${label} Menu closed`);
      }
      if (transportFolded.length) {
        await nativeClick(byName('More playback options')); await wait("!!document.querySelector('.overflow-menu-panel')", `${label} More playback options open`);
        assert.deepEqual(await reachableIn(transportFolded, "document.querySelector('.overflow-menu-panel')"), [], `${label} folded transport controls are reachable`);
        await key('Escape'); await wait("!document.querySelector('.overflow-menu-panel') && document.activeElement?.getAttribute('aria-label')==='More playback options'", `${label} Escape closes More and restores focus`);
      }
      for (const [pane, name, inside] of [['sets', 'Set list', 'Add set'], ['side', 'Inspector', 'Collapse Inspector']]) {
        if (!m.panes[pane]) continue;
        await nativeClick(byName(`Show ${name}`)); await wait("!!document.querySelector('.workspace-pane--overlay')", `${label} ${name} overlay`);
        assert.deepEqual(await reachableIn([inside], "document.querySelector('.workspace-pane--overlay')"), [], `${label} ${inside} is reachable in the ${name} overlay`);
        await key('Escape'); await wait(`!document.querySelector('.workspace-pane--overlay') && document.activeElement?.getAttribute('aria-label')===${JSON.stringify(`Show ${name}`)}`, `${label} Escape closes the ${name} overlay`);
      }
    }
    await capture(`breakpoints-${label}.png`);
  }
  for (const [width, height] of SIZES) for (const scale of SCALES) await verify(width, height, scale);
  pass('UI-scale matrix 900–1920 px × 100–150%: one-row header and transport, unobstructed Save/Undo/Redo/Export/play/set navigation/show count, no scrolling, and a drawn field ≥ 480 × 260 at 1366 × 768 @150% and 900 × 650 @100%');
  await verify(...MINIMUM, false);
  assert.equal(metrics.at(-1).tiers.transport, 'narrow', 'the smallest supported window exercises the narrow transport');
  pass('the smallest supported window (800 × 600 @150%) keeps a one-row header, a pinned one-row transport and every folded control reachable');
  if (reachability) {
    // Keyboard order at 1366 × 768 @150%: folded controls appear in Menu and More in their original order.
    await applySize(1366, 768, 1.5);
    assert.deepEqual(await evaluate("[document.querySelector('.studio').dataset.header, document.querySelector('.studio').dataset.transport]"), ['compact', 'compact']);
    await evaluate(`${byName('Command palette')}.focus()`);
    const order = [];
    for (let i = 0; i < 5; i++) { await key('Tab'); order.push(await active()); }
    assert.deepEqual(order, ['Undo', 'Redo', 'Save', 'Export', 'Project menu']);
    await key('Return'); await wait("!!document.querySelector('.dropdown')", 'keyboard Menu');
    const menu = [];
    for (let i = 0; i < 5; i++) { await key('Tab'); menu.push(await active()); }
    assert.deepEqual(menu, [...HEADER_FOLDED, 'Command palette']);
    await evaluate(`${byName('Workspace layout', "document.querySelector('.dropdown')")}.focus()`); await key('Return');
    await wait("!!document.querySelector('#workspace-layout-options') && !document.querySelector('.dropdown') && document.activeElement?.getAttribute('aria-label')==='Close layout options'", 'layout options from Menu take focus');
    await key('Escape'); await wait("!document.querySelector('#workspace-layout-options') && document.activeElement?.getAttribute('aria-label')==='Project menu'", 'Escape returns focus to Menu');
    await evaluate(`${byName('Attach audio')}.focus()`); await key('Tab'); assert.equal(await active(), 'More playback options');
    await key('Return'); await wait("!!document.querySelector('.overflow-menu-panel')", 'keyboard More playback options');
    const transport = [];
    for (let i = 0; i < 4; i++) { await key('Tab'); transport.push(await active()); }
    assert.deepEqual(transport, [...TRANSPORT_FOLDED.compact, 'First set']);
    await wait("!document.querySelector('.overflow-menu-panel')", 'focus leaving More closes it');
    await key('Tab', ['shift']); assert.equal(await active(), 'More playback options');
    await key('Return'); await key('Tab'); assert.equal(await active(), 'Loop show');
    await key('Escape'); await wait("!document.querySelector('.overflow-menu-panel') && document.activeElement?.getAttribute('aria-label')==='More playback options'", 'Escape closes More');
    pass('folded controls keep their order: header Tab order, Menu (layout, focus, Help, History first), layout options focus/return, and More playback options open, close and return focus by keyboard');
  }
  // Auto-tucking and overlays are temporary: the saved layout and production are unchanged.
  assert.equal(await evaluate(`JSON.stringify({ layout: ${state}.preferences.value.workspaceLayout, cast: ${state}.preferences.value.castPanelOpen })`), layoutBefore);
  assert.equal(await evaluate(`${state}.project.revision`), project);
  await applySize(1366, 768, 1);
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: false });
  pass('resizing through every breakpoint and opening tucked panels leaves the saved layout preference and production unchanged');
  return metrics;
};
