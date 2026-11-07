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

/** `reachability` also opens every overflow menu and tucked panel natively and walks keyboard focus through them;
 * `panels` shows Cast and runs previews where the field reserve alone would tuck their panel. */
module.exports = async function checkBreakpointMatrix({ window, evaluate, editor, state, capture, pass, reachability = false, panels = !reachability }) {
  const wait = (source, label) => waitFor(() => evaluate(source), label, { timeoutMs: 20000 });
  const frames = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  // A hidden window drops to about one frame per second after native input; a stay-awake capture restores frames, so
  // the focus and layout waits that follow keys and clicks settle promptly.
  const wake = () => window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  const key = async (code, modifiers = []) => { await sendKey(window, code, modifiers, 20); await wake(); };
  const active = () => evaluate("document.activeElement?.getAttribute('aria-label')");
  // CDP mouse input takes viewport CSS px, the space getBoundingClientRect reports under the UI scale's CSS zoom.
  async function nativeClick(selector) {
    const point = await evaluate(`(() => { const n = ${selector}; n.scrollIntoView({ block: 'nearest' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await wake();
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
    await wake();
  }
  const byName = (name, scope = 'document') => `[...${scope}.querySelectorAll('[aria-label]')].find(n => n.getAttribute('aria-label') === ${JSON.stringify(name)})`;
  const reachableIn = (names, scope) => evaluate(`(${JSON.stringify(names)}).filter(name => { const n = ${byName('NAME', scope).replace('"NAME"', 'name')}; if (!n) return true; n.scrollIntoView({ block: 'nearest' }); const r = n.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(r.width > 0 && r.left >= 0 && r.right <= innerWidth + .5 && r.top >= 0 && r.bottom <= innerHeight + .5 && hit && n.contains(hit)); })`);
  /** `keepFocus` resizes the window as a writer would, leaving focus where it is. */
  async function applySize(width, height, scale, keepFocus = false) {
    window.setContentSize(width, height); window.webContents.setZoomFactor(1);
    await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:${scale}}))`);
    await settleNativeViewport(window, `breakpoint viewport ${width}x${height}@${scale}`); await wake();
    await wait(`(() => { const s = document.querySelector('.studio'); return Math.abs(s.clientWidth - ${width / scale}) <= 1 && Math.abs(s.clientHeight - ${height / scale}) <= 1; })()`, `effective viewport ${width}x${height}@${scale}`);
    if (keepFocus) { await frames(); return; }
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
        // As axe's aria-valid-attr-value rule: aria-controls must name an element unless the control reports aria-expanded=false.
        assert.deepEqual(await evaluate("[...document.querySelectorAll('.app-header [aria-controls]')].filter(n => n.getAttribute('aria-expanded') !== 'false' && n.getAttribute('aria-controls').split(/\\s+/).some(id => !document.getElementById(id))).map(n => n.getAttribute('aria-label'))"), [], `${label} header and Menu controls reference elements that exist`);
        await nativeClick("document.querySelector('.menu-dismiss')"); await wait("!document.querySelector('.dropdown')", `${label} Menu closed`);
      }
      if (transportFolded.length) {
        await nativeClick(byName('More playback options')); await wait("!!document.querySelector('.overflow-menu-panel')", `${label} More playback options open`);
        assert.deepEqual(await reachableIn(transportFolded, "document.querySelector('.overflow-menu-panel')"), [], `${label} folded transport controls are reachable`);
        await key('Escape'); await wait("!document.querySelector('.overflow-menu-panel') && document.activeElement?.getAttribute('aria-label')==='More playback options'", `${label} Escape closes More and restores focus`);
      }
      for (const [pane, name, inside] of [['sets', 'Set list', 'Add set'], ['side', 'Inspector', 'Close Inspector']]) {
        if (!m.panes[pane]) continue;
        const closed = `!document.querySelector('.workspace-pane--overlay') && document.activeElement?.getAttribute('aria-label')===${JSON.stringify(`Show ${name}`)}`;
        await nativeClick(byName(`Show ${name}`)); await wait("!!document.querySelector('.workspace-pane--overlay')", `${label} ${name} overlay`);
        assert.deepEqual(await reachableIn([inside], "document.querySelector('.workspace-pane--overlay')"), [], `${label} ${inside} is reachable in the ${name} overlay`);
        await key('Escape'); await wait(closed, `${label} Escape closes the ${name} overlay`);
        // The overlay's heading button closes a tucked pane without collapsing it: the saved layout and preset stay.
        const saved = await evaluate(`JSON.stringify(${state}.preferences.value.workspaceLayout)`);
        await nativeClick(byName(`Show ${name}`)); await wait("!!document.querySelector('.workspace-pane--overlay')", `${label} ${name} overlay again`);
        assert.equal(await evaluate("document.querySelector('.workspace-pane--overlay .workspace-pane-heading button').getAttribute('aria-label')"), `Close ${name}`);
        await nativeClick("document.querySelector('.workspace-pane--overlay .workspace-pane-heading button')"); await wait(closed, `${label} the heading button closes the ${name} overlay`);
        assert.equal(await evaluate(`JSON.stringify(${state}.preferences.value.workspaceLayout)`), saved, `${label} closing the tucked ${name} leaves the saved layout unchanged`);
        assert.equal(await evaluate(`document.querySelector('#workspace-pane-${pane === 'sets' ? 'sets' : 'inspector'}').hidden`), true, `${label} ${name} stays tucked`);
      }
    }
    await capture(`breakpoints-${label}.png`);
  }
  /** Panels the writer asks for at sizes where the field reserve alone tucks them: Cast from its header tab, and the
   * Inspector a preview needs. Run by the field suite; the accessibility suite's 500-performer show and reachability
   * walks already use its time budget. */
  async function checkDemandedPanels() {
    const savedLayout = () => evaluate(`JSON.stringify(${state}.preferences.value.workspaceLayout)`);
    /** Short windows at 150% outside the matrix, where Cast docked beside the narrower field would wrap the field toolbar
     * and scroll the workspace (and, with classic scrollbars, re-tuck and re-dock every frame): Cast opens over the field
     * instead, steadily, and the workspace fits without scrolling with the field at the matrix floor. */
    async function checkShortWindow(label) {
      await wake();
      const states = await evaluate("new Promise(resolve => { const out = []; const tick = () => { const p = document.querySelector('#workspace-pane-cast'), b = document.querySelector('.studio-body'); out.push([p.hidden, p.classList.contains('workspace-pane--overlay'), b.clientWidth, b.scrollHeight > b.clientHeight + 1, b.scrollWidth > b.clientWidth + 1].join()); if (out.length < 4) requestAnimationFrame(tick); else resolve(out); }; tick(); })");
      assert.equal(new Set(states).size, 1, `${label} Cast stays put from frame to frame: ${states.join(' | ')}`);
      const m = await evaluate(probe); const context = `${label} ${JSON.stringify(m)}`;
      assert.ok(m.header.oneRow && m.transport.oneRow && !m.bodyScroll && !m.documentOverflow, `${label} the workspace fits without scrolling under a one-row header and transport: ${context}`);
      assert.ok(m.drawn.width >= FLOOR.width && m.drawn.height >= FLOOR.height, `${label} the field keeps the matrix floor: ${context}`);
    }
    const tabs = "document.querySelector('.workspace-tabs')";
    const noOverflow = "document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('.studio-body').scrollWidth <= document.querySelector('.studio-body').clientWidth + 1";
    // The header Cast tab shows Cast where the field reserve alone would tuck it: docked beside a narrower field, or
    // over the field where even that does not fit, always with focus inside it and the saved layout unchanged.
    // `current`: Cast is already shown but tucked (restored at startup, or the window narrowed), so only the overlay opens.
    // 1014 × 650 @150% is a short window outside the matrix (see checkShortWindow).
    for (const [width, height, scale, over, current] of [[1024, 700, 1.25, false], [900, 650, 1.25, false], [800, 600, 1, false], [900, 650, 1.5, true], [900, 650, 1.5, true, true], [1014, 650, 1.5, true]]) {
      const label = `${width}x${height}@${scale}${current ? ' (Cast current)' : ''}`;
      await applySize(width, height, scale); const saved = await savedLayout();
      if (current) { await evaluate(`${editor}.setValue('ui','castPanelOpen',true)`); await wait("!!document.querySelector('[aria-label=\"Show Cast\"]') && !document.querySelector('.workspace-pane--overlay')", `${label} Cast tucked`); }
      await evaluate(`${byName('Cast', tabs)}.focus()`); await key('Return');
      await wait("(() => { const pane = document.querySelector('#workspace-pane-cast'); return !!pane && !pane.hidden && !pane.inert && pane.contains(document.activeElement); })()", `${label} the Cast tab shows Cast with focus inside it`);
      assert.equal(await evaluate("document.querySelector('#workspace-pane-cast').classList.contains('workspace-pane--overlay')"), over, `${label} Cast ${over ? 'opens over' : 'docks beside'} the field`);
      assert.deepEqual(await reachableIn(['Find a performer'], "document.querySelector('#workspace-pane-cast')"), [], `${label} Cast search is unobstructed`);
      assert.ok(await evaluate(noOverflow), `${label} Cast fits without overflow`);
      if (width === 1014) await checkShortWindow(label);
      if (over) { await key('Escape'); await wait("!document.querySelector('.workspace-pane--overlay') && document.activeElement?.getAttribute('aria-label')==='Show Cast'", `${label} Escape closes the Cast overlay`); }
      assert.equal(await savedLayout(), saved, `${label} showing Cast leaves the saved layout unchanged`);
      await evaluate(`${byName('Design', tabs)}.focus()`); await key('Return');
      await wait(`!${state}.ui.castPanelOpen && !document.querySelector('#workspace-pane-cast') && document.activeElement !== document.body`, `${label} Design returns to the Inspector with focus kept`);
    }
    pass('the header Cast tab docks Cast beside a narrower field at 1024 × 700 @125%, 900 × 650 @125% and 800 × 600 @100%, opens it over the field at 900 × 650 @150% (also when Cast is already current) and on the short 1014 × 650 @150% where docking would scroll the workspace, and moves focus into it without changing the saved layout');
    // Docking is crowded only when it adds scrolling, and only in the situation measured: at 1024 × 700 @150% the 3D
    // view's taller field floor can crowd Cast, which then opens over the field (also when 3D is chosen beside a docked
    // Cast), yet Cast docks again in 2D. 1200 × 600 @150% already scrolls without a panel; Cast and a preview's
    // Inspector open over the field there instead of adding to it.
    const castShown = (focused = true) => `(() => { const p = document.querySelector('#workspace-pane-cast'); return !!p && !p.hidden && !p.inert${focused ? ' && p.contains(document.activeElement)' : ''}; })()`;
    const placement = `(() => { const p = document.querySelector('#workspace-pane-cast'), b = document.querySelector('.studio-body'); return { over: p.classList.contains('workspace-pane--overlay'), scroll: b.scrollHeight - b.clientHeight }; })()`;
    const scrolled = "(b => b.scrollHeight - b.clientHeight)(document.querySelector('.studio-body'))";
    const viewSelect = async view => { await evaluate(`${editor}.dispatch('view.select', { view: '${view}' })`); await wait(`!!document.querySelector('.field-container')?.classList.contains('is-3d') === ${view === '3d'}`, `${view} view`); await frames(); };
    await applySize(1024, 700, 1.5); const castSaved = await savedLayout();
    await viewSelect('3d'); const idle3d = await evaluate(scrolled);
    await evaluate(`${byName('Cast', tabs)}.focus()`); await key('Return'); await wait(castShown(), '1024x700@1.5 in 3D the Cast tab shows Cast');
    await wait(`(p => p.over || p.scroll <= ${idle3d + 1})(${placement})`, '1024x700@1.5 in 3D Cast docks only where it adds no scrolling');
    if ((await evaluate(placement)).over) { await key('Escape'); await wait("document.activeElement?.getAttribute('aria-label')==='Show Cast'", '1024x700@1.5 Escape closes Cast over the 3D view'); }
    await viewSelect('2d'); await wait(`${castShown(false)} && !(${placement}).over`, '1024x700@1.5 back in 2D Cast docks again');
    await evaluate(`${byName('Cast', tabs)}.focus()`); await key('Return'); await wait(`${castShown()} && !(${placement}).over`, '1024x700@1.5 the Cast tab in 2D docks Cast with focus in it');
    await viewSelect('3d');
    await wait(`${castShown()} && (p => p.over || p.scroll <= ${idle3d + 1})(${placement})`, '1024x700@1.5 choosing 3D opens a crowded docked Cast over the field with focus kept, never tucking it');
    if ((await evaluate(placement)).over) await key('Escape');
    await viewSelect('2d'); await evaluate(`${byName('Design', tabs)}.focus()`); await key('Return'); await wait(`!${state}.ui.castPanelOpen`, '1024x700@1.5 Design');
    assert.equal(await savedLayout(), castSaved, '1024x700@1.5 Cast in 2D and 3D leaves the saved layout unchanged');
    await applySize(1200, 600, 1.5); const idleShort = await evaluate(scrolled);
    await evaluate(`${byName('Cast', tabs)}.focus()`); await key('Return'); await wait(castShown(), '1200x600@1.5 the Cast tab shows Cast');
    assert.deepEqual(await evaluate(`(p => ({ over: p.over, added: p.scroll > ${idleShort + 1} }))(${placement})`), { over: true, added: false }, '1200x600@1.5 Cast opens over the field without adding to the workspace scroll');
    await key('Escape'); await evaluate(`${byName('Design', tabs)}.focus()`); await key('Return'); await wait(`!${state}.ui.castPanelOpen`, '1200x600@1.5 Design');
    pass('Cast docks only where docking adds no scrolling, judged per window size, view and panel: over the 3D view at 1024 × 700 @150% yet docked again in 2D, opened over the field rather than tucked when 3D is chosen beside it, and over the field at 1200 × 600 @150%, which already scrolls');
    // The Command palette shows Cast the same way, with focus moving from the field into Cast's search rather than staying
    // under a scrim. In focus mode, which hides panels and must never show an overlay or scrim, it leaves focus mode first.
    const mod = process.platform === 'darwin' ? 'meta' : 'control';
    for (const [width, height, scale, over, focusMode] of [[1024, 700, 1.25, false, false], [900, 650, 1.5, true, false], [900, 650, 1.5, true, true], [1024, 700, 1.25, false, true]]) {
      const label = `${width}x${height}@${scale}${focusMode ? ' in focus mode' : ''}`;
      await applySize(width, height, scale); const saved = await savedLayout();
      if (focusMode) { await evaluate(`${editor}.dispatch('layout.focus')`); await wait("!!document.querySelector('.studio--focus')", `${label} focus mode`); }
      await evaluate("document.querySelector('.field-stage__svg').focus()"); await key('K', [mod]);
      await wait("document.activeElement?.getAttribute('aria-label')==='Search commands or drill phrases'", `${label} palette open`);
      await window.webContents.debugger.sendCommand('Input.insertText', { text: 'Show Cast beside field' });
      await wait("document.querySelector('.palette-result--active')?.getAttribute('aria-label')==='Show Cast beside field'", `${label} palette result`);
      await key('Return');
      await wait("(() => { const pane = document.querySelector('#workspace-pane-cast'); return !!pane && !pane.hidden && !pane.inert && !document.querySelector('dialog[open]') && document.activeElement?.getAttribute('aria-label')==='Find a performer' && pane.contains(document.activeElement); })()", `${label} the palette shows Cast with focus in its search`);
      assert.deepEqual(await evaluate("[!!document.querySelector('.studio--focus'), document.querySelector('#workspace-pane-cast').classList.contains('workspace-pane--overlay')]"), [false, over], `${label} the palette leaves focus mode and ${over ? 'opens Cast over' : 'docks Cast beside'} the field`);
      assert.deepEqual(await reachableIn(['Find a performer'], "document.querySelector('#workspace-pane-cast')"), [], `${label} Cast search is unobstructed`);
      if (over) { await key('Escape'); await wait("!document.querySelector('.workspace-pane--overlay') && document.activeElement?.getAttribute('aria-label')==='Show Cast'", `${label} Escape closes the Cast overlay`); }
      assert.equal(await savedLayout(), saved, `${label} the palette leaves the saved layout unchanged`);
      await evaluate(`${byName('Design', tabs)}.focus()`); await key('Return');
      await wait(`!${state}.ui.castPanelOpen && !document.querySelector('#workspace-pane-cast') && document.activeElement !== document.body`, `${label} Design returns to the Inspector`);
    }
    // With Cast docked and the Set list open over the field, showing Cast closes the Set list rather than moving focus
    // into a search the scrim covers.
    await applySize(1024, 700, 1.25); await evaluate(`${editor}.setValue('ui','castPanelOpen',true)`); await wait(`${castShown(false)} && !(${placement}).over`, '1024x700@1.25 Cast docked');
    await nativeClick(byName('Show Set list')); await wait("!!document.querySelector('#workspace-pane-sets.workspace-pane--overlay') && !!document.querySelector('.workspace-overlay-dismiss')", '1024x700@1.25 Set list over the field beside docked Cast');
    await key('K', [mod]); await wait("document.activeElement?.getAttribute('aria-label')==='Search commands or drill phrases'", '1024x700@1.25 palette over the Set list');
    await window.webContents.debugger.sendCommand('Input.insertText', { text: 'Show Cast beside field' });
    await wait("document.querySelector('.palette-result--active')?.getAttribute('aria-label')==='Show Cast beside field'", '1024x700@1.25 palette result'); await key('Return');
    await wait("document.activeElement?.getAttribute('aria-label')==='Find a performer' && !document.querySelector('.workspace-overlay-dismiss') && !document.querySelector('#workspace-pane-sets.workspace-pane--overlay')", '1024x700@1.25 showing docked Cast closes the Set list over the field and focuses Cast');
    assert.deepEqual(await reachableIn(['Find a performer'], "document.querySelector('#workspace-pane-cast')"), [], '1024x700@1.25 the focused Cast search is unobstructed');
    await evaluate(`${byName('Design', tabs)}.focus()`); await key('Return'); await wait(`!${state}.ui.castPanelOpen`, '1024x700@1.25 Design');
    pass('Show Cast beside field from the Command palette moves focus from the field into Cast, docked or over the field, and from focus mode leaves focus mode first instead of covering the window with an empty scrim; beside an open Set list it closes the Set list first');
    // A preview keeps its subject in view: the Inspector docks beside a narrower field where it did before #178, and
    // where it cannot it opens over the field without a scrim while the field fits beside it.
    const ids = await evaluate(`JSON.stringify(${state}.project.present.performers.map(p => p.id))`);
    const inspector = "document.querySelector('#workspace-pane-inspector')";
    const ended = `(() => { const pane = ${inspector}; return pane.hidden && !document.querySelector('.workspace-pane--overlay') && !document.querySelector('.workspace-overlay-dismiss') && !!document.activeElement?.closest('.field-stage__svg'); })()`;
    // 1000 × 650 @150% is a short window outside the matrix where docking would scroll the workspace (see checkShortWindow).
    for (const [width, height, scale, over] of [[1024, 700, 1.5, false], [900, 650, 1.25, false], [900, 650, 1.5, true], [800, 600, 1.5, true], [1000, 650, 1.5, true]]) {
      const label = `${width}x${height}@${scale}`;
      await applySize(width, height, scale); const saved = await savedLayout();
      await evaluate(`${editor}.setValue('selection','selectedIds',${ids}); ${editor}.dispatch('transform.mirror')`);
      await wait("!!document.querySelector('.transform-preview-banner') && !document.querySelector('#workspace-pane-inspector').hidden", `${label} transform preview`);
      await evaluate('document.activeElement?.blur()'); await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
      await wait("!document.querySelector('[role=tooltip]')", `${label} help dismissed`); await frames(); await frames();
      const view = await evaluate(`(() => { const field = document.querySelector('.field-container'); const shown = n => { const r = n.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.width > 0 && !!hit && field.contains(hit); };
        return { scrim: !!document.querySelector('.workspace-overlay-dismiss'), overlay: document.querySelector('#workspace-pane-inspector').classList.contains('workspace-pane--overlay'), surface: shown(document.querySelector('[data-field-surface]')), banner: shown(document.querySelector('.transform-preview-banner')), noOverflow: ${noOverflow} }; })()`);
      assert.deepEqual(view, { scrim: false, overlay: over, surface: true, banner: true, noOverflow: true }, `${label} the preview's field and banner stay in view`);
      assert.deepEqual(await reachableIn(['Apply transform', 'Cancel transform', 'Play show'], 'document'), [], `${label} Apply, Cancel and Play are reachable during the preview`);
      if (width === 1000) assert.equal(await evaluate("(b => b.scrollHeight <= b.clientHeight + 1)(document.querySelector('.studio-body'))"), true, `${label} the preview fits without scrolling the workspace`);
      await capture(`breakpoints-preview-${label}.png`);
      // The preview's placement ends with it: the Inspector the writer never opened tucks again, no scrim appears, and
      // focus Cancel held moves to the field.
      await nativeClick(byName('Cancel transform')); await wait(`!${state}.ui.transformPreview && ${ended}`, `${label} the preview's Inspector tucks when it ends, with focus on the field`);
      assert.equal(await savedLayout(), saved, `${label} the preview leaves the saved layout unchanged`);
      await evaluate(`${editor}.setValue('selection','selectedIds',[])`);
    }
    pass('transform previews keep the field, banner, Apply/Cancel and Play visible: the Inspector docks at 1024 × 700 @150% and 900 × 650 @125% and opens over the field without a scrim at 900 × 650 and 800 × 600 @150% and on the short 1000 × 650 @150%, and tucks again with focus on the field when the preview ends');
    const openOver = `(() => { const pane = ${inspector}; return pane.classList.contains('workspace-pane--overlay') && !pane.hidden && !pane.inert && pane.contains(document.activeElement); })()`;
    const mirror = async label => {
      await evaluate(`${editor}.setValue('selection','selectedIds',${ids}); ${editor}.dispatch('transform.mirror')`);
      await wait(`!!${state}.ui.transformPreview && !${inspector}.hidden && document.activeElement?.getAttribute('aria-label')==='Transform operation'`, `${label} transform preview with focus on its operation`);
    };
    // At 1024 × 700 @150% the Inspector docks only for a preview. Play (which drops the preview), Escape and Apply all
    // end it with the Inspector tucked, no scrim, and the field and transport in view.
    await applySize(1024, 700, 1.5);
    await mirror('1024x700@1.5 Play'); await nativeClick(byName('Play show'));
    await wait(`!${state}.ui.transformPreview && ${state}.playback.playing && ${inspector}.hidden && !document.querySelector('.workspace-overlay-dismiss')`, '1024x700@1.5 Play ends the preview with the Inspector tucked and no scrim');
    assert.deepEqual(await evaluate("(() => { const s = document.querySelector('[data-field-surface]').getBoundingClientRect(); const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2); return !!hit && document.querySelector('.field-container').contains(hit); })()"), true, '1024x700@1.5 the field stays in view during playback');
    assert.deepEqual(await reachableIn(['Pause playback'], 'document'), [], '1024x700@1.5 Pause is reachable during playback');
    await nativeClick(byName('Pause playback')); await wait(`!${state}.playback.playing`, '1024x700@1.5 paused');
    await evaluate(`${editor}.setValue('playback','playing',false); ${editor}.setValue('playback','count',0); ${editor}.setValue('selection','activeIndex',0)`);
    await mirror('1024x700@1.5 Escape'); await key('Escape'); await wait(`!${state}.ui.transformPreview && ${ended}`, '1024x700@1.5 Escape ends the preview with the Inspector tucked and focus on the field');
    await mirror('1024x700@1.5 Apply'); await evaluate('document.activeElement?.blur()'); await wait("!document.querySelector('[role=tooltip]')", '1024x700@1.5 help dismissed');
    await nativeClick(byName('Apply transform')); await wait(`!${state}.ui.transformPreview && ${ended}`, '1024x700@1.5 Apply ends the preview with the Inspector tucked and focus on the field');
    await evaluate(`${editor}.dispatch('history.undo'); ${editor}.setValue('selection','selectedIds',[])`); await wait(`${state}.project.revision === ${project}`, '1024x700@1.5 the applied mirror undone');
    pass('at 1024 × 700 @150% a preview the writer started with the Inspector tucked ends, by Play, Escape or Apply, with the Inspector tucked again, no scrim, and the field, Pause or focus on the field');
    // An Inspector the writer opened over the field docks while a preview needs it and is still open over the field,
    // with focus inside it, when the preview ends: by Cancel, or by Escape in coordinate entry (which refocuses Place).
    for (const [width, height, scale] of [[1024, 700, 1.5], [900, 650, 1.25]]) {
      const label = `${width}x${height}@${scale}`;
      await applySize(width, height, scale); const saved = await savedLayout();
      await evaluate(`${editor}.setValue('selection','selectedIds',${ids})`);
      await nativeClick(byName('Show Inspector')); await wait(openOver, `${label} Show Inspector opens it over the field`);
      await nativeClick(byName('Mirror selection', inspector));
      // The preview's panel scrolls into view and focuses its operation, whose help would cover Cancel: wait for that
      // focus, then leave it before clicking Cancel.
      await wait(`!!${state}.ui.transformPreview && !${inspector}.hidden && !${inspector}.classList.contains('workspace-pane--overlay') && document.activeElement?.getAttribute('aria-label')==='Transform operation'`, `${label} the preview docks the Inspector`);
      await evaluate('document.activeElement?.blur()'); await wait("!document.querySelector('[role=tooltip]')", `${label} help dismissed`);
      await nativeClick(byName('Cancel transform'));
      await wait(`!${state}.ui.transformPreview && ${openOver}`, `${label} the Inspector stays open over the field after Cancel, with focus inside it`);
      await nativeClick(byName('Enter coordinates', inspector));
      await wait(`!!${state}.ui.coordinatePreview && document.activeElement?.getAttribute('aria-label')==='Drill phrase' && !${inspector}.classList.contains('workspace-pane--overlay')`, `${label} coordinate entry docks the Inspector`);
      await key('Escape');
      await wait(`!${state}.ui.coordinatePreview && ${openOver} && document.activeElement?.getAttribute('aria-label')==='Enter coordinates'`, `${label} Escape in coordinate entry returns focus to Place in the still-open Inspector`);
      await key('Escape'); await wait("!document.querySelector('.workspace-pane--overlay') && document.activeElement?.getAttribute('aria-label')==='Show Inspector'", `${label} Escape then closes the Inspector overlay`);
      assert.equal(await savedLayout(), saved, `${label} the previews leave the saved layout unchanged`);
      await evaluate(`${editor}.setValue('selection','selectedIds',[])`);
    }
    // Shrinking the window during a preview opens the Inspector over the field without a scrim, whether it docked
    // without demand (from 1366 × 768 @150%) or only for the preview (from 1024 × 700 @150%): Apply, Cancel and Play
    // stay reachable and a focused Apply keeps focus. When the preview ends the Inspector tucks again.
    for (const start of [[1366, 768, 1.5], [1024, 700, 1.5]]) {
      const label = `${start[0]}x${start[1]}@${start[2]}`;
      await applySize(...start); await mirror(`${label} before shrinking`);
      assert.equal(await evaluate(`${inspector}.classList.contains('workspace-pane--overlay')`), false, `${label} the preview docks the Inspector`);
      await evaluate(`${byName('Apply transform', inspector)}.focus()`); await applySize(...MINIMUM, true);
      await wait(`${inspector}.classList.contains('workspace-pane--overlay') && !${inspector}.hidden && !document.querySelector('.workspace-overlay-dismiss') && document.activeElement?.getAttribute('aria-label')==='Apply transform'`, `${label} shrinking during the preview opens the Inspector over the field, focus kept on Apply`);
      await evaluate('document.activeElement?.blur()'); await wait("!document.querySelector('[role=tooltip]')", `${label} help dismissed after shrinking`);
      assert.deepEqual(await reachableIn(['Apply transform', 'Cancel transform', 'Play show'], 'document'), [], `${label} Apply, Cancel and Play stay reachable after shrinking during the preview`);
      await nativeClick(byName('Cancel transform')); await wait(`!${state}.ui.transformPreview && ${ended}`, `${label} the shrunken preview's Inspector tucks when it ends, with focus on the field`);
    }
    // A preview's Inspector takes the place of a Set list open over the field, with focus moved into it, so Apply and
    // Cancel stay reachable: when the preview starts there (1000 × 650 @150%, where docking would scroll the workspace)
    // and when the window shrinks to it beside a docked preview (from 1000 × 700 @150%). The Set list the writer opened
    // is back, with focus, once the preview ends.
    const setsOver = "!!document.querySelector('#workspace-pane-sets.workspace-pane--overlay')";
    for (const shrink of [false, true]) {
      const label = shrink ? '1000x700@1.5 shrunk to 1000x650@1.5' : '1000x650@1.5';
      await applySize(1000, shrink ? 700 : 650, 1.5);
      if (shrink) { await mirror(label); assert.equal(await evaluate(`${inspector}.classList.contains('workspace-pane--overlay')`), false, `${label} the preview docks the Inspector`); }
      await nativeClick(byName('Show Set list')); await wait(`${setsOver} && document.querySelector('#workspace-pane-sets').contains(document.activeElement)`, `${label} Set list open over the field with focus`);
      if (shrink) await applySize(1000, 650, 1.5, true);
      else await evaluate(`${editor}.setValue('selection','selectedIds',${ids}); ${editor}.dispatch('transform.mirror')`);
      await wait(`!!${state}.ui.transformPreview && ${inspector}.classList.contains('workspace-pane--overlay') && !${inspector}.hidden && !${setsOver} && !document.querySelector('.workspace-overlay-dismiss') && ${inspector}.contains(document.activeElement)`, `${label} the preview's Inspector replaces the Set list over the field, with focus inside it`);
      await evaluate('document.activeElement?.blur()'); await wait("!document.querySelector('[role=tooltip]')", `${label} help dismissed`);
      assert.deepEqual(await reachableIn(['Apply transform', 'Cancel transform', 'Play show'], 'document'), [], `${label} Apply, Cancel and Play are reachable`);
      await nativeClick(byName('Cancel transform'));
      await wait(`!${state}.ui.transformPreview && ${inspector}.hidden && ${setsOver} && document.querySelector('#workspace-pane-sets').contains(document.activeElement)`, `${label} after the preview the Set list the writer opened is back, with focus`);
      await key('Escape'); await wait(`!${setsOver} && document.activeElement?.getAttribute('aria-label')==='Show Set list'`, `${label} Escape closes the Set list`);
      await evaluate(`${editor}.setValue('selection','selectedIds',[])`);
    }
    // At 1200 × 600 @150%, which scrolls without a panel, a preview opens the Inspector over the field rather than
    // docking it and scrolling further.
    await applySize(1200, 600, 1.5); const idleShortPreview = await evaluate(scrolled); await mirror('1200x600@1.5');
    assert.deepEqual(await evaluate(`({ over: ${inspector}.classList.contains('workspace-pane--overlay'), scrim: !!document.querySelector('.workspace-overlay-dismiss'), added: ${scrolled} > ${idleShortPreview + 1} })`), { over: true, scrim: false, added: false }, '1200x600@1.5 the preview opens the Inspector over the field without a scrim or added scrolling');
    await evaluate(`${editor}.dispatch('transform.cancel')`); await wait(`!${state}.ui.transformPreview`, '1200x600@1.5 preview cancelled');
    // Focus mode hides every panel: a preview there neither shows a scrim nor narrows the field for an invisible overlay,
    // and one Escape after it still leaves focus mode.
    await applySize(900, 650, 1.5); await evaluate(`${editor}.dispatch('layout.focus')`); await wait("!!document.querySelector('.studio--focus')", 'focus mode for a preview');
    await evaluate(`${editor}.dispatch('transform.mirror')`); await wait(`!!${state}.ui.transformPreview`, 'preview in focus mode'); await frames();
    assert.deepEqual(await evaluate("(() => { const body = document.querySelector('.studio-body'), field = document.querySelector('.field-container').getBoundingClientRect(), s = document.querySelector('[data-field-surface]').getBoundingClientRect(); const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2); return { scrim: !!document.querySelector('.workspace-overlay-dismiss'), previewOverlay: body.dataset.previewOverlay ?? null, wide: field.width >= body.getBoundingClientRect().width - 60, field: !!hit && document.querySelector('.field-container').contains(hit) }; })()"), { scrim: false, previewOverlay: null, wide: true, field: true }, 'a preview in focus mode keeps the whole field, with no scrim or overlay margin');
    await evaluate(`${editor}.dispatch('transform.cancel')`); await wait(`!${state}.ui.transformPreview`, 'preview in focus mode cancelled');
    await evaluate("document.querySelector('.field-stage__svg').focus()"); await key('Escape'); await wait("!document.querySelector('.studio--focus') && !document.querySelector('.workspace-overlay-dismiss')", 'one Escape leaves focus mode after the preview');
    await evaluate(`${editor}.setValue('selection','selectedIds',[])`);
    pass('an Inspector the writer opened over the field stays open with focus inside it after a preview that docked it (Cancel, coordinate Escape); shrinking during a preview (from 1366 × 768 or 1024 × 700 @150%) opens the Inspector over the field with Apply, Cancel and Play reachable and tucks it when the preview ends; a preview takes the place of a Set list open over the field at 1000 × 650 @150%, starting there or shrinking to it, and gives the Set list back afterwards; 1200 × 600 @150% opens the preview Inspector over the field; and focus mode never shows a scrim or overlay margin');
  }
  for (const [width, height] of SIZES) for (const scale of SCALES) await verify(width, height, scale);
  pass('UI-scale matrix 900–1920 px × 100–150%: one-row header and transport, unobstructed Save/Undo/Redo/Export/play/set navigation/show count, no scrolling, and a drawn field ≥ 480 × 260 at 1366 × 768 @150% and 900 × 650 @100%');
  await verify(...MINIMUM, false);
  assert.equal(metrics.at(-1).tiers.transport, 'narrow', 'the smallest supported window exercises the narrow transport');
  pass('the smallest supported window (800 × 600 @150%) keeps a one-row header, a pinned one-row transport and every folded control reachable');
  if (panels) await checkDemandedPanels();
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
    // A dialog opened from a folded control returns focus to it: More stays open underneath while the dialog is open.
    await applySize(...MINIMUM);
    await evaluate(`${byName('More playback options')}.focus()`); await key('Return'); await wait("!!document.querySelector('.overflow-menu-panel')", 'More playback options at the smallest window');
    await evaluate(`${byName('Rehearsal passages', "document.querySelector('.overflow-menu-panel')")}.focus()`); await key('Return');
    await wait(`${state}.ui.dialog==='rehearsal' && !!document.querySelector('dialog[open]')?.contains(document.activeElement)`, 'Rehearsal passages dialog from More');
    await key('Escape');
    await wait(`!${state}.ui.dialog && document.activeElement?.getAttribute('aria-label')==='Rehearsal passages' && !!document.querySelector('.overflow-menu-panel')?.contains(document.activeElement)`, 'the dialog returns focus to its folded opener');
    await key('Escape'); await wait("!document.querySelector('.overflow-menu-panel') && document.activeElement?.getAttribute('aria-label')==='More playback options'", 'Escape then closes More');
    // A UI scale change while that dialog is open moves its opener from More to the transport (narrow to compact): the
    // folded controls keep their own nodes, and focus follows Rehearsal passages instead of landing on another control.
    await key('Return'); await wait("!!document.querySelector('.overflow-menu-panel')", 'More playback options again');
    await evaluate(`${byName('Rehearsal passages', "document.querySelector('.overflow-menu-panel')")}.focus()`); await key('Return');
    await wait(`${state}.ui.dialog==='rehearsal' && !!document.querySelector('dialog[open]')?.contains(document.activeElement)`, 'Rehearsal passages dialog from More again');
    await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:1}))`);
    await wait("document.querySelector('.studio').dataset.transport==='compact' && !document.querySelector('.overflow-menu-panel [aria-label=\"Rehearsal passages\"]')", 'the transport widens under the dialog');
    await key('Escape');
    await wait(`!${state}.ui.dialog && document.activeElement?.getAttribute('aria-label')==='Rehearsal passages' && !!document.activeElement.closest('.transport-options') && !document.activeElement.closest('.overflow-menu-panel')`, 'focus follows Rehearsal passages to the transport');
    // Without a dialog, focus on a folded control follows it too when a UI scale change moves it out of More.
    await applySize(...MINIMUM);
    await evaluate(`${byName('More playback options')}.focus()`); await key('Return'); await wait("!!document.querySelector('.overflow-menu-panel')", 'More playback options for a tier change');
    await evaluate(`${byName('Rehearsal passages', "document.querySelector('.overflow-menu-panel')")}.focus()`);
    await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:1}))`);
    await wait("document.querySelector('.studio').dataset.transport==='compact' && document.activeElement?.getAttribute('aria-label')==='Rehearsal passages' && !!document.activeElement.closest('.transport-options') && !document.querySelector('.overflow-menu-panel')", 'focus follows Rehearsal passages out of More on a tier change');
    await applySize(...MINIMUM);
    pass('a dialog opened from More playback options returns focus to its opener inside More, Escape then returns to the More trigger, and focus follows the opener, or a focused folded control, when a UI scale change moves it to the transport');
    // Focus that left an option for the page (a press on plain text) stays there: a later tier change, a dialog opened and
    // closed from the page, or a preview's Enter-apply never pulls it back into the transport, where Space would open More.
    const plain = "document.querySelector('.show-count small')", onPage = "document.activeElement===document.body", mod = process.platform === 'darwin' ? 'meta' : 'control';
    const stays = async label => assert.equal(await evaluate(onPage), true, `${label}: ${await active()}`), set = await evaluate(`${state}.selection.activeIndex`);
    await applySize(1366, 768, 1);
    await nativeClick(byName('Loop show')); await wait(`${state}.playback.loop && document.activeElement?.getAttribute('aria-label')==='Loop show'`, 'Loop show by pointer');
    await nativeClick(plain); await wait(onPage, 'a press on plain text leaves focus on the page');
    await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:1.5}))`); await wait("document.querySelector('.studio').dataset.transport==='compact'", 'Loop show folds into More');
    await stays('a tier change after focus left Loop show keeps focus on the page');
    await key('Space'); await wait(`${state}.playback.playing`, 'Space plays after the tier change'); await key('Space'); await wait(`!${state}.playback.playing`, 'Space pauses');
    await nativeClick(byName('More playback options')); await wait("!!document.querySelector('.overflow-menu-panel')", 'More playback options by pointer');
    await nativeClick(byName('Loop show', "document.querySelector('.overflow-menu-panel')")); await wait(`!${state}.playback.loop && document.activeElement?.getAttribute('aria-label')==='Loop show'`, 'Loop show in More by pointer');
    await nativeClick(plain); await wait(`!document.querySelector('.overflow-menu-panel') && ${onPage}`, 'a press on plain text closes More and leaves focus on the page');
    await key('K', [mod]); await wait("document.activeElement?.getAttribute('aria-label')==='Search commands or drill phrases'", 'palette from the page');
    await key('Escape'); await wait(`!${state}.ui.paletteOpen && !document.querySelector('dialog[open]')`, 'palette closed'); await stays('closing a dialog opened from the page keeps focus there');
    // A preview in the band docks the Inspector and folds rehearsal passages and audio away until Enter applies it
    // (at a set again: playback paused between sets, where positions are read-only).
    const revision = await evaluate(`${state}.project.revision`);
    await applySize(1024, 700, 1.5);
    await evaluate(`${editor}.dispatch('set.select',{index:${set}}); ${editor}.setValue('selection','selectedIds',${state}.project.present.performers.slice(0,4).map(p=>p.id)); ${editor}.dispatch('transform.mirror')`);
    await wait(`!!${state}.ui.transformPreview && document.querySelector('.studio').dataset.transport==='narrow'`, 'a preview narrows the transport');
    await nativeClick(byName('More playback options')); await wait("!!document.querySelector('.overflow-menu-panel')", 'More playback options during the preview');
    await evaluate(`${byName('Rehearsal passages', "document.querySelector('.overflow-menu-panel')")}.focus()`);
    await nativeClick(plain); await wait(`!document.querySelector('.overflow-menu-panel') && ${onPage}`, 'a press on plain text leaves More for the page');
    await key('Return'); await wait(`!${state}.ui.transformPreview && document.querySelector('.studio').dataset.transport==='compact'`, 'Enter applies the preview');
    assert.equal(await evaluate("!!document.activeElement?.closest('.transport-options')"), false, `Enter-apply keeps focus out of the transport: ${await active()}`);
    if (await evaluate("!!document.querySelector('.workspace-pane--overlay')")) { await key('Escape'); await wait("!document.querySelector('.workspace-pane--overlay')", 'Inspector overlay closed after the preview'); }
    await evaluate(`${editor}.dispatch('history.undo'); ${editor}.setValue('selection','selectedIds',[])`); await wait(`${state}.project.revision===${revision}`, 'the applied preview undone');
    pass('focus that left a transport option for the page stays there through a tier change, a dialog opened from the page and a preview applied with Enter, so Space plays and pauses');
  }
  // Auto-tucking and overlays are temporary: the saved layout and production are unchanged.
  assert.equal(await evaluate(`JSON.stringify({ layout: ${state}.preferences.value.workspaceLayout, cast: ${state}.preferences.value.castPanelOpen })`), layoutBefore);
  assert.equal(await evaluate(`${state}.project.revision`), project);
  await applySize(1366, 768, 1);
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: false });
  pass('resizing through every breakpoint and opening tucked panels leaves the saved layout preference and production unchanged');
  return metrics;
};
