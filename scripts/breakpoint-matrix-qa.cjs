'use strict';
const {showRightPanel}=require('./testing/renderer.cjs');
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
const REQUIRED = ['Command palette', 'Undo', 'Redo', 'Export', 'Project menu', 'Write mode', 'Plan mode', 'Rehearse mode', 'Find set', 'Previous set', 'Previous count', 'Play show', 'Next count', 'Next set', 'Mute audio', 'Timeline options'];
/** First set and Last set leave the narrow transport by design; Find set reaches every set there. */
const EDGE_SETS = ['First set', 'Last set'];
/** Actions the old header folded into its Menu in narrow windows now always live in one named menu: a single
 * instance each, never a hidden duplicate in the bar, behind a trigger that stays reachable. */
const MENU_HOMES = { 'Focus field': 'View options', Help: 'Project menu', History: 'Project menu' };
const HEADER_FOLDED = Object.keys(MENU_HOMES);
const TRANSPORT_FOLDED = { full: [], compact: ['Loop show', 'Metronome', 'Playback speed'], narrow: ['Rehearsal passages', 'Attach audio', 'Loop show', 'Metronome', 'Playback speed'] };
/** Where the whole-show count must be on screen. In a narrower strip it gives way to the move count, which always stays. */
const SHOW_COUNT = new Set(['1366x768@1', '1920x1080@1', '1920x1080@1.25', '1920x1080@1.5']);

const probe = `(() => {
  const scale = Number(document.documentElement.style.getPropertyValue('--ui-scale')) || 1;
  const studio = document.querySelector('.studio');
  const named = name => [...document.querySelectorAll('[aria-label]')].filter(n => n.getAttribute('aria-label') === name);
  const reachable = n => { if (!n || !n.getClientRects().length) return false; const r = n.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.left < -.5 || r.top < -.5 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5) return false; const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && n.contains(hit); };
  const oneRow = nodes => { const rects = nodes.filter(n => n.getClientRects().length).map(n => n.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0); return rects.length > 1 && Math.max(...rects.map(r => r.top)) < Math.min(...rects.map(r => r.bottom)); };
  const header = document.querySelector('.app-header'), transport = document.querySelector('.transport'), body = document.querySelector('.studio-body');
  const svg = document.querySelector('.field-stage__svg').getBoundingClientRect(), surface = document.querySelector('[data-field-surface]').getBoundingClientRect();
  const field = document.querySelector('.field-container').getBoundingClientRect();
  const names = ${JSON.stringify([...REQUIRED, ...EDGE_SETS, 'Save', ...HEADER_FOLDED, ...TRANSPORT_FOLDED.narrow, 'Show Inspector', 'Collapse Inspector', 'More playback options'])};
  const homes = ${JSON.stringify(MENU_HOMES)};
  const readout = selector => { const n = document.querySelector(selector); return { reachable: reachable(n), displayed: !!n && n.getClientRects().length > 0 }; };
  return { scale, viewport: [innerWidth, innerHeight], effective: [studio.clientWidth, studio.clientHeight], tiers: { ...studio.dataset },
    header: { height: header.getBoundingClientRect().height / scale, oneRow: oneRow([...header.children, ...header.querySelector('.header-actions').children]), overflow: header.scrollWidth > header.clientWidth + 1 },
    transport: { height: transport.getBoundingClientRect().height / scale, oneRow: oneRow([...transport.querySelectorAll('.transport-options > *, .play-controls > *, .count-display > *')]) },
    reachable: Object.fromEntries(names.map(name => [name, named(name).some(reachable)])), present: Object.fromEntries(names.map(name => [name, named(name).length])),
    // One instance of each menu action, inside the menu named for it, whose trigger is on screen and unobstructed.
    menus: Object.fromEntries(Object.entries(homes).map(([name, home]) => { const menu = named(name).length === 1 ? named(name)[0].closest('[role=menu]') : null; return [name, !!menu && menu.getAttribute('aria-label') === home && [...document.querySelectorAll('[aria-controls]')].some(n => n.getAttribute('aria-controls') === menu.id && reachable(n))]; })),
    dirty: !!document.querySelector('.save-state--unsaved'), headerSave: !!document.querySelector('.app-header .header-save'),
    moveCount: readout('.move-count'), showCount: readout('.show-count'),
    panes: { side: document.querySelector('.side-panel').hidden },
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
  const reachableIn = (names, scope) => evaluate(`(${JSON.stringify(names)}).filter(name => { const n = [...${scope}.querySelectorAll('[aria-label]')].find(n=>n.getAttribute('aria-label')===name&&n.getClientRects().length); if (!n) return true; n.scrollIntoView({ block: 'nearest' }); const r = n.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(r.width > 0 && r.left >= 0 && r.right <= innerWidth + .5 && r.top >= 0 && r.bottom <= innerHeight + .5 && hit && n.contains(hit)); })`);
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
    // The top bar offers Save only while there are unsaved changes, and then it is in reach like the rest. The Project
    // menu always keeps its own Save.
    assert.equal(m.dirty ? m.headerSave && m.reachable.Save : !m.headerSave, true, `Save ${m.dirty ? 'is reachable in the top bar with unsaved changes' : 'is absent from the top bar of a saved production'}: ${context}`);
    for (const name of EDGE_SETS) assert.equal(tiers.transport === 'narrow' ? !m.reachable[name] : m.reachable[name], true, `${name} in the ${tiers.transport} transport: ${context}`);
    // The move count always stays; the show count is on screen in wide windows and otherwise not drawn at all, never clipped or covered.
    assert.equal(m.moveCount.reachable, true, `move count visible: ${context}`);
    assert.equal(SHOW_COUNT.has(label) ? m.showCount.reachable : m.showCount.reachable || !m.showCount.displayed, true, `show count ${SHOW_COUNT.has(label) ? 'visible' : 'visible or not drawn'}: ${context}`);
    // Focus field, Help and History live in a named menu at every size: one instance each behind a reachable trigger.
    const headerFolded = HEADER_FOLDED;
    for (const name of HEADER_FOLDED) assert.equal(m.menus[name], true, `${name} has one home in ${MENU_HOMES[name]}: ${context}`);
    // Folded transport controls leave the transport entirely (no hidden duplicates); unfolded ones stay reachable.
    const transportFolded = TRANSPORT_FOLDED[tiers.transport];
    for (const name of TRANSPORT_FOLDED.narrow) assert.equal(transportFolded.includes(name) ? m.present[name] === 0 : m.reachable[name], true, `${name} in the transport: ${context}`);
    assert.equal(m.reachable['More playback options'], transportFolded.length > 0, `More playback options: ${context}`);
    // A side panel that does not fit beside the field keeps its Show button; a docked one can be collapsed. Nothing scrolls or overflows.
    assert.ok(m.reachable[m.panes.side ? 'Show Inspector' : 'Collapse Inspector'], `${m.panes.side ? 'the hidden Inspector can be shown' : 'the docked Inspector can be collapsed'}: ${context}`);
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
        // A notification toast (bottom center, above the transport) must not cover the open menu's options.
        await evaluate(`${editor}.setValue('ui','toast','Notification over More playback options')`); await wait("!!document.querySelector('.toast')", `${label} toast shown`);
        await nativeClick(byName('More playback options')); await wait("!!document.querySelector('.overflow-menu-panel')", `${label} More playback options open`);
        assert.deepEqual(await reachableIn(transportFolded, "document.querySelector('.overflow-menu-panel')"), [], `${label} folded transport controls are reachable, also under a notification toast`);
        await evaluate(`${editor}.setValue('ui','toast','')`); await key('Escape'); await wait("!document.querySelector('.overflow-menu-panel') && document.activeElement?.getAttribute('aria-label')==='More playback options'", `${label} Escape closes More and restores focus`);
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
        assert.equal(await evaluate("document.querySelector('.workspace-pane--overlay .workspace-pane-heading .icon-button').getAttribute('aria-label')"), `Close ${name}`);
        await nativeClick("document.querySelector('.workspace-pane--overlay .workspace-pane-heading .icon-button')"); await wait(closed, `${label} the heading button closes the ${name} overlay`);
        assert.equal(await evaluate(`JSON.stringify(${state}.preferences.value.workspaceLayout)`), saved, `${label} closing the tucked ${name} leaves the saved layout unchanged`);
        assert.equal(await evaluate(`document.querySelector('#workspace-pane-${pane === 'sets' ? 'sets' : 'inspector'}').hidden`), true, `${label} ${name} stays tucked`);
      }
    }
    await capture(`breakpoints-${label}.png`);
  }
  /** The one side panel at sizes where the window cannot always dock it: Cast from its tab or the Command palette, and
   * the Inspector a preview needs. It docks where the field keeps its reserve and otherwise opens over the field; closing
   * it returns focus to its button, and none of this changes the saved layout. Run by the field suite; the accessibility
   * suite's 500-performer show and reachability walks already use its time budget. */
  async function checkDemandedPanels() {
    const savedLayout = () => evaluate(`JSON.stringify(${state}.preferences.value.workspaceLayout)`);
    const pane = "document.querySelector('.side-panel')";
    const shown = (tab, focused = true) => `(() => { const p = document.querySelector('#workspace-pane-${tab}'); return !!p && !p.hidden && !p.inert${focused ? ' && p.contains(document.activeElement)' : ''}; })()`;
    const over = `${pane}.classList.contains('workspace-pane--overlay')`;
    const scrim = "!!document.querySelector('.workspace-overlay-dismiss')";
    // A closed panel leaves no overlay or scrim, and focus on the button that shows it again.
    const closedTo = name => `${pane}.hidden && !${scrim} && document.activeElement?.getAttribute('aria-label')===${JSON.stringify(`Show ${name}`)}`;
    const noOverflow = "document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('.studio-body').scrollWidth <= document.querySelector('.studio-body').clientWidth + 1";
    const scrolled = "(b => b.scrollHeight - b.clientHeight)(document.querySelector('.studio-body'))";
    const ids = await evaluate(`JSON.stringify(${state}.project.present.performers.map(p => p.id))`);
    const viewSelect = async view => { await evaluate(`${editor}.dispatch('view.select', { view: '${view}' })`); await wait(`!!document.querySelector('.field-container')?.classList.contains('is-3d') === ${view === '3d'}`, `${view} view`); await frames(); };
    const backToInspector = async (label, wasOver) => {
      await showRightPanel(window, 'inspector');
      await wait(`!${state}.ui.castPanelOpen && !document.querySelector('#workspace-pane-cast') && document.activeElement !== document.body`, `${label} Design returns to the Inspector with focus kept`);
      if (wasOver) { await key('Escape'); await wait(closedTo('Inspector'), `${label} Escape closes the Inspector over the field with focus on Show Inspector`); }
    };

    /** A short window at 150%: the panel stays put from frame to frame, the workspace fits without scrolling under a
     * one-row header and transport, and the field beside a panel open over it keeps the matrix floor. */
    async function checkShortWindow(label) {
      await wake();
      const states = await evaluate("new Promise(resolve => { const out = []; const tick = () => { const p = document.querySelector('.side-panel'), b = document.querySelector('.studio-body'); out.push([p.id, p.hidden, p.classList.contains('workspace-pane--overlay'), b.clientWidth, b.scrollHeight > b.clientHeight + 1, b.scrollWidth > b.clientWidth + 1].join()); if (out.length < 4) requestAnimationFrame(tick); else resolve(out); }; tick(); })");
      assert.equal(new Set(states).size, 1, `${label} Cast stays put from frame to frame: ${states.join(' | ')}`);
      const m = await evaluate(probe); const context = `${label} ${JSON.stringify(m)}`;
      assert.ok(m.header.oneRow && m.transport.oneRow && !m.bodyScroll && !m.documentOverflow, `${label} the workspace fits without scrolling under a one-row header and transport: ${context}`);
      assert.ok(m.drawn.width >= FLOOR.width && m.drawn.height >= FLOOR.height, `${label} the field under Cast keeps the matrix floor: ${context}`);
    }

    // The Cast tab shows Cast docked beside the field where the window leaves the field its reserve, and over the field
    // (dimming it) everywhere narrower, always with focus inside it and without adding scrolling.
    // `current`: Cast is already the panel's tab but hidden (restored at startup, or the window narrowed).
    for (const [width, height, scale, expectOver, current] of [[1366, 768, 1, false], [1024, 700, 1, false], [1024, 700, 1.25, true], [900, 650, 1.25, true], [800, 600, 1, true], [900, 650, 1.5, true], [900, 650, 1.5, true, true], [1014, 650, 1.5, true], [1200, 600, 1.5, true]]) {
      const label = `${width}x${height}@${scale}${current ? ' (Cast current)' : ''}`;
      await applySize(width, height, scale); const saved = await savedLayout(), idle = await evaluate(scrolled);
      if (current) { await evaluate(`${editor}.setValue('ui','castPanelOpen',true)`); await wait(`!!document.querySelector('[aria-label="Show Cast"]') && ${pane}.hidden && !${scrim}`, `${label} Cast hidden behind Show Cast`); }
      await showRightPanel(window, 'cast');
      await wait(shown('cast'), `${label} the Cast tab shows Cast with focus inside it`);
      assert.deepEqual(await evaluate(`[${over}, ${scrim}]`), [expectOver, expectOver], `${label} Cast ${expectOver ? 'opens over the dimmed field' : 'docks beside the field'}`);
      assert.deepEqual(await reachableIn(['Find a performer'], "document.querySelector('#workspace-pane-cast')"), [], `${label} Cast search is unobstructed`);
      assert.ok(await evaluate(noOverflow), `${label} Cast fits without overflow`);
      assert.ok(await evaluate(scrolled) <= idle + 1, `${label} Cast adds no workspace scrolling`);
      if (width === 1014) await checkShortWindow(label);
      if (expectOver) {
        await key('Escape'); await wait(closedTo('Cast'), `${label} Escape closes the Cast overlay with focus on Show Cast`);
        // The overlay's own Close button closes it the same way.
        await nativeClick(byName('Show Cast')); await wait(`${shown('cast', false)} && ${over}`, `${label} Show Cast opens it over the field again`);
        assert.equal(await evaluate(`${pane}.querySelector('.workspace-pane-heading .icon-button').getAttribute('aria-label')`), 'Close Cast');
        await nativeClick(`${pane}.querySelector('.workspace-pane-heading .icon-button')`); await wait(closedTo('Cast'), `${label} the heading button closes the Cast overlay with focus on Show Cast`);
      }
      assert.equal(await savedLayout(), saved, `${label} showing Cast leaves the saved layout unchanged`);
      await backToInspector(label, expectOver);
    }
    pass('the Cast tab docks Cast at 1366 × 768 and 1024 × 700 @100% and opens it over the dimmed field at 1024 × 700 @125%, 900 × 650 @125% and @150% (also when Cast is already current), 800 × 600 @100% and the short 1014 × 650 and 1200 × 600 @150%, with focus in it, no added scrolling and the saved layout unchanged; Escape or its Close button returns focus to Show Cast');

    // The 3D view takes the same panel: over the view in a narrow window, and a docked Cast stays docked with focus kept.
    await applySize(1024, 700, 1.5); const castSaved = await savedLayout();
    await viewSelect('3d'); const idle3d = await evaluate(scrolled);
    await showRightPanel(window, 'cast'); await wait(shown('cast'), '1024x700@1.5 in 3D the Cast tab shows Cast');
    assert.deepEqual(await evaluate(`[${over}, ${scrolled} <= ${idle3d + 1}]`), [true, true], '1024x700@1.5 in 3D Cast opens over the view without adding scrolling');
    await key('Escape'); await wait(closedTo('Cast'), '1024x700@1.5 Escape closes Cast over the 3D view, leaving no overlay or scrim');
    await viewSelect('2d'); await backToInspector('1024x700@1.5', true);
    assert.equal(await savedLayout(), castSaved, '1024x700@1.5 Cast in 3D leaves the saved layout unchanged');
    await applySize(1366, 768, 1); const wideSaved = await savedLayout();
    const dockCast = async label => { await showRightPanel(window, 'cast'); await wait(`${shown('cast')} && !${over}`, `${label} the Cast tab docks Cast with focus in it`); };
    await dockCast('1366x768@1'); await viewSelect('3d');
    await wait(`${shown('cast')} && !${over} && !${scrim}`, '1366x768@1 choosing 3D keeps docked Cast docked with focus kept');
    await viewSelect('2d');
    // A resize never opens a docked panel over the field. With focus on the field it hides behind Show Cast, focus
    // kept; where the panel itself held focus, focus moves to Show Cast instead of falling to the page.
    await evaluate("document.querySelector('.field-stage__svg').focus()"); await applySize(900, 650, 1.5, true);
    await wait(`${pane}.hidden && !${scrim} && !!document.querySelector('[aria-label="Show Cast"]') && !!document.activeElement?.closest('.field-stage__svg')`, '900x650@1.5 shrinking hides docked Cast behind Show Cast, with focus kept on the field');
    await applySize(1366, 768, 1, true); await wait(`${shown('cast', false)} && !${over}`, '1366x768@1 growing back docks Cast again');
    await dockCast('1366x768@1'); await evaluate(`${byName('Find a performer')}.focus()`); await applySize(900, 650, 1.5, true);
    await wait(closedTo('Cast'), '900x650@1.5 shrinking hides Cast that holds focus and moves focus to Show Cast');
    await applySize(1366, 768, 1, true); await wait(`${shown('cast', false)} && !${over}`, '1366x768@1 growing back docks Cast once more');
    // Cast the writer showed keeps that intent through a preview, which borrows the panel for its Inspector.
    await evaluate(`${editor}.setValue('selection','selectedIds',${ids}); ${editor}.dispatch('transform.mirror')`);
    await wait(`!!${state}.ui.transformPreview && ${shown('inspector', false)} && !${over}`, '1366x768@1 a preview beside docked Cast shows its Inspector');
    await evaluate(`${editor}.dispatch('transform.cancel')`); await wait(`!${state}.ui.transformPreview && ${shown('cast', false)} && !${over}`, '1366x768@1 Cast docks again after the preview');
    await evaluate(`${editor}.setValue('selection','selectedIds',[])`); await backToInspector('1366x768@1', false);
    assert.equal(await savedLayout(), wideSaved, '1366x768@1 3D, resizing and a preview beside Cast leave the saved layout unchanged');
    pass('Cast opens over the 3D view at 1024 × 700 @150% without adding scrolling and stays docked with focus when 3D is chosen at 1366 × 768; a resize hides a docked Cast behind Show Cast, keeping focus on the field or moving it from Cast to Show Cast, and docks it again when the window grows; a preview borrows the panel and gives Cast back');

    // The Command palette shows Cast the same way, with focus moving from the field into Cast's search. In focus mode,
    // which hides panels and must never show an overlay or scrim, it leaves focus mode first.
    const mod = process.platform === 'darwin' ? 'meta' : 'control';
    for (const [width, height, scale, expectOver, focusMode] of [[1366, 768, 1, false, false], [900, 650, 1.5, true, false], [900, 650, 1.5, true, true], [1366, 768, 1, false, true]]) {
      const label = `${width}x${height}@${scale}${focusMode ? ' in focus mode' : ''}`;
      await applySize(width, height, scale); const saved = await savedLayout();
      if (focusMode) { await evaluate(`${editor}.dispatch('layout.focus')`); await wait("!!document.querySelector('.studio--focus')", `${label} focus mode`); }
      await evaluate("document.querySelector('.field-stage__svg').focus()"); await key('K', [mod]);
      await wait("document.activeElement?.getAttribute('aria-label')==='Search commands or drill phrases'", `${label} palette open`);
      await window.webContents.debugger.sendCommand('Input.insertText', { text: 'Show Cast beside field' });
      await wait("document.querySelector('.palette-result--active')?.getAttribute('aria-label')==='Show Cast beside field'", `${label} palette result`);
      await key('Return');
      await wait("(() => { const p = document.querySelector('#workspace-pane-cast'); return !!p && !p.hidden && !p.inert && !document.querySelector('dialog[open]') && document.activeElement?.getAttribute('aria-label')==='Find a performer' && p.contains(document.activeElement); })()", `${label} the palette shows Cast with focus in its search`);
      assert.deepEqual(await evaluate(`[!!document.querySelector('.studio--focus'), ${over}]`), [false, expectOver], `${label} the palette leaves focus mode and ${expectOver ? 'opens Cast over' : 'docks Cast beside'} the field`);
      assert.deepEqual(await reachableIn(['Find a performer'], "document.querySelector('#workspace-pane-cast')"), [], `${label} Cast search is unobstructed`);
      // Escape in a text field belongs to the field, so the panel is closed from its tab.
      if (expectOver) { await evaluate("document.querySelector('#panel-tab-cast').focus()"); await key('Escape'); await wait(closedTo('Cast'), `${label} Escape on the Cast tab closes the Cast overlay`); }
      assert.equal(await savedLayout(), saved, `${label} the palette leaves the saved layout unchanged`);
      await backToInspector(label, expectOver);
    }
    pass('Show Cast beside field from the Command palette moves focus from the field into Cast, docked or over the field, and from focus mode leaves focus mode first instead of covering the window with an empty scrim');

    // A preview keeps its subject in view: its Inspector docks where the panel fits and otherwise opens over the field
    // without a scrim. Its name, Apply and Cancel are in the tool strip.
    const inspector = "document.querySelector('#workspace-pane-inspector')";
    const tool = name => byName(name, "document.querySelector('.toolbar')");
    // When a preview ends, focus its controls held goes to the Inspector's selection header where the Inspector stays,
    // and to the field area (never the field's performers, where Space would select one) where it hides again.
    const ended = wasOver => wasOver
      ? `(${pane}.hidden && !${scrim} && document.activeElement === document.querySelector('.main-workspace .field-container'))`
      : `(!${inspector}.hidden && !${over} && !${scrim} && document.activeElement === document.querySelector('.selection-bar'))`;
    // Apply, Cancel and every labeled control of the transport row, with the move count, are where they are without
    // scrolling anything into view.
    const hit = `(() => { const transport = [...document.querySelectorAll('.transport [aria-label], .transport .move-count')].filter(n => n.getClientRects().length), name = n => n.getAttribute('aria-label') ?? n.className;
      const missing = ['Previous set', 'Previous count', 'Play show', 'Next count', 'Next set', 'move-count readout', 'Mute audio'].filter(label => !transport.some(n => name(n) === label));
      return [...missing, ...['Apply transform', 'Cancel transform'].map(label => ${byName('NAME', "document.querySelector('.toolbar')").replace('"NAME"', 'label')} ?? label), ...transport].filter(n => { if (typeof n === 'string') return true; const r = n.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + .5 && !!e && n.contains(e)); }).map(n => typeof n === 'string' ? n : name(n)); })()`;
    // The focused control is whole: inside the window and every ancestor that clips it.
    const focusWhole = "(a => { const r = a.getBoundingClientRect(); let top = 0, bottom = innerHeight; for (let n = a.parentElement; n; n = n.parentElement) if (getComputedStyle(n).overflowY !== 'visible') { const c = n.getBoundingClientRect(); top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom); } return r.height > 0 && r.top >= top - .5 && r.bottom <= bottom + .5; })(document.activeElement)";
    const mirror = async label => {
      await evaluate(`${editor}.setValue('selection','selectedIds',${ids}); ${editor}.dispatch('transform.mirror')`);
      await wait(`!!${state}.ui.transformPreview && !${inspector}.hidden && document.activeElement?.getAttribute('aria-label')==='Transform operation'`, `${label} transform preview with focus on its operation`);
    };
    const quiet = async label => { await evaluate('document.activeElement?.blur()'); await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }); await wait("!document.querySelector('[role=tooltip]')", `${label} help dismissed`); await frames(); await frames(); };
    for (const [width, height, scale, expectOver] of [[1366, 768, 1, false], [1024, 700, 1, false], [1024, 700, 1.5, true], [900, 650, 1.25, true], [900, 650, 1.5, true], [800, 600, 1.5, true], [800, 600, 1, true], [1000, 650, 1.5, true], [1014, 650, 1.5, true], [1200, 650, 1.5, true], [1000, 620, 1.5, true], [1200, 600, 1.5, true]]) {
      const label = `${width}x${height}@${scale}`;
      await applySize(width, height, scale); const saved = await savedLayout(), idle = await evaluate(scrolled);
      await mirror(label);
      // The operation the preview focused is whole in the panel's scroll area.
      await wait(focusWhole, `${label} the preview's focused operation is whole in view`);
      await quiet(label);
      const view = await evaluate(`(() => { const field = document.querySelector('.field-container'); const shown = n => { const r = n.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.width > 0 && !!hit && n.contains(hit); };
        const surface = document.querySelector('[data-field-surface]').getBoundingClientRect(), at = document.elementFromPoint(surface.left + surface.width / 2, surface.top + surface.height / 2);
        return { scrim: ${scrim}, overlay: ${over}, surface: surface.width > 0 && !!at && field.contains(at), status: shown(document.querySelector('.toolbar .toolbar-preview[role=status]')), noOverflow: ${noOverflow} }; })()`);
      assert.deepEqual(view, { scrim: false, overlay: expectOver, surface: true, status: true, noOverflow: true }, `${label} the preview's field and name stay in view, its Inspector ${expectOver ? 'over the field' : 'docked'} without a scrim`);
      assert.deepEqual(await evaluate(hit), [], `${label} Apply, Cancel and every control of the transport row, with the move count, are in view during the preview`);
      assert.deepEqual(await reachableIn(['Apply transform', 'Cancel transform', 'Play show'], 'document'), [], `${label} Apply, Cancel and Play are reachable during the preview`);
      assert.ok(await evaluate(scrolled) <= idle + 1, `${label} the preview adds no workspace scrolling (${idle} px without it)`);
      await capture(`breakpoints-preview-${label}.png`);
      await nativeClick(tool('Cancel transform')); await wait(`!${state}.ui.transformPreview && ${ended(expectOver)}`, `${label} the preview ends with ${expectOver ? 'its Inspector hidden again and focus on the field area' : 'focus on the selection header'}`);
      assert.equal(await savedLayout(), saved, `${label} the preview leaves the saved layout unchanged`);
      await evaluate(`${editor}.setValue('selection','selectedIds',[])`);
    }
    pass('transform previews keep the field, their name, Apply/Cancel, the focused operation and every transport control and the move count visible: the Inspector docks at 1366 × 768 and 1024 × 700 @100% and opens over the field without a scrim at every narrower or shorter size down to 800 × 600 @150%, adds no scrolling, and when the preview ends hides again with focus on the field area, or keeps focus on the selection header where it is docked');

    // With the preview's Inspector over the field, Escape in an open More playback options closes the menu first,
    // returning focus to its trigger and keeping the preview; the next Escape cancels the preview and leaves focus there.
    const more = byName('More playback options');
    for (const size of [[900, 650, 1.5], MINIMUM]) {
      const label = `${size[0]}x${size[1]}@${size[2]}`;
      await applySize(...size); await mirror(`${label} More`);
      await nativeClick(more); await wait("!!document.querySelector('.overflow-menu-panel')", `${label} More playback options open during the preview`);
      await evaluate("document.querySelector('.overflow-menu-panel button').focus()"); await key('Escape');
      await wait(`!document.querySelector('.overflow-menu-panel') && document.activeElement === ${more} && !!${state}.ui.transformPreview && ${over}`, `${label} Escape in More closes it with focus on its trigger and keeps the preview`);
      await key('Escape');
      await wait(`!${state}.ui.transformPreview && ${pane}.hidden && !${scrim} && document.activeElement === ${more}`, `${label} the next Escape cancels the preview with focus kept on More playback options`);
      assert.deepEqual(await reachableIn(['More playback options'], 'document'), [], `${label} focus after the preview is on a visible, unobstructed control`);
      await evaluate(`${editor}.setValue('selection','selectedIds',[])`);
    }
    pass('during a preview with the Inspector over the field (900 × 650 and 800 × 600 @150%), Escape closes an open More playback options first, with focus on its trigger and the preview kept; the next Escape cancels the preview');
    // The Project menu takes Escape first the same way.
    const projectMenu = "document.querySelector('[role=menu][aria-label=\"Project menu\"]')";
    await applySize(900, 650, 1.5); await mirror('900x650@1.5 Project menu');
    await nativeClick(byName('Project menu')); await wait(`${projectMenu}.hidden === false`, '900x650@1.5 Project menu open during the preview');
    await evaluate(`${projectMenu}.querySelector('[role^=menuitem]').focus()`); await key('Escape');
    await wait(`${projectMenu}.hidden && document.activeElement?.getAttribute('aria-label')==='Project menu' && !!${state}.ui.transformPreview`, '900x650@1.5 Escape in the Project menu closes it with focus on its button and keeps the preview');
    await key('Escape'); await wait(`!${state}.ui.transformPreview && document.activeElement?.getAttribute('aria-label')==='Project menu'`, '900x650@1.5 the next Escape cancels the preview with focus kept on the Project menu');
    // A preview started from the keyboard (here the Command palette) shows its first control's help, which never takes the
    // click meant for Apply, wherever it is placed: one click applies.
    for (const [phrase, name, apply, kind] of [['Mirror across 50', 'Transform operation', 'Apply transform', 'transformPreview'], ['Align and space selection', 'Align coordinates', 'Apply spacing', 'spacingPreview']]) {
      const label = `900x650@1.5 palette ${kind}`, revision = await evaluate(`${state}.project.revision`);
      await evaluate(`${editor}.setValue('selection','selectedIds',${ids}); document.activeElement?.blur()`); await key('K', [mod]);
      await wait("document.activeElement?.getAttribute('aria-label')==='Search commands or drill phrases'", `${label} palette open`);
      await window.webContents.debugger.sendCommand('Input.insertText', { text: phrase }); await key('Return');
      await wait(`!!${state}.ui.${kind} && document.activeElement?.getAttribute('aria-label')===${JSON.stringify(name)} && !!document.querySelector('[role=tooltip]')?.textContent.startsWith(${JSON.stringify(name)})`, `${label} focuses ${name} with its help`);
      await nativeClick(tool(apply)); await wait(`!${state}.ui.${kind} && ${state}.project.revision !== ${revision}`, `${label} one click on ${apply} applies`);
      await evaluate(`${editor}.dispatch('history.undo'); ${editor}.setValue('selection','selectedIds',[])`); await wait(`${state}.project.revision === ${revision}`, `${label} undone`);
    }
    pass('at 900 × 650 @150% Escape in an open Project menu closes it first with focus on its button and the preview kept; a preview started from the Command palette shows its first control\'s help, and one click on Apply applies it');

    // At 1024 × 700 @150% the Inspector shows only for a preview. Play (which drops the preview), Escape and Apply all
    // end it with the Inspector hidden again, no scrim, and the field and transport in view.
    await applySize(1024, 700, 1.5);
    await mirror('1024x700@1.5 Play'); await nativeClick(byName('Play show'));
    await wait(`!${state}.ui.transformPreview && ${state}.playback.playing && ${pane}.hidden && !${scrim}`, '1024x700@1.5 Play ends the preview with the Inspector hidden and no scrim');
    assert.deepEqual(await evaluate("(() => { const s = document.querySelector('[data-field-surface]').getBoundingClientRect(); const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2); return !!hit && document.querySelector('.field-container').contains(hit); })()"), true, '1024x700@1.5 the field stays in view during playback');
    assert.deepEqual(await reachableIn(['Pause playback'], 'document'), [], '1024x700@1.5 Pause is reachable during playback');
    await nativeClick(byName('Pause playback')); await wait(`!${state}.playback.playing`, '1024x700@1.5 paused');
    await evaluate(`${editor}.setValue('playback','playing',false); ${editor}.setValue('playback','count',0); ${editor}.setValue('selection','activeIndex',0)`);
    await mirror('1024x700@1.5 Escape'); await key('Escape'); await wait(`!${state}.ui.transformPreview && ${ended(true)}`, '1024x700@1.5 Escape ends the preview with the Inspector hidden and focus on the field area');
    await mirror('1024x700@1.5 Apply'); await quiet('1024x700@1.5');
    await nativeClick(tool('Apply transform')); await wait(`!${state}.ui.transformPreview && ${ended(true)}`, '1024x700@1.5 Apply ends the preview with the Inspector hidden and focus on the field area');
    await evaluate(`${editor}.dispatch('history.undo'); ${editor}.setValue('selection','selectedIds',[])`); await wait(`${state}.project.revision === ${project}`, '1024x700@1.5 the applied mirror undone');
    pass('at 1024 × 700 @150% a preview ends, by Play, Escape or Apply, with the Inspector hidden again, no scrim, and the field, Pause or focus on the field area');

    // An Inspector the writer opened over the field stays the writer's through a preview: the scrim lifts while the
    // preview runs, and it is still open, with focus inside it, when the preview ends by Cancel, or by Escape in
    // coordinate entry (which refocuses the panel's heading). Escape then closes it.
    const openOver = `(() => { const p = ${inspector}; return p.classList.contains('workspace-pane--overlay') && !p.hidden && !p.inert && p.contains(document.activeElement); })()`;
    for (const [width, height, scale] of [[1024, 700, 1.5], [900, 650, 1.25]]) {
      const label = `${width}x${height}@${scale}`;
      await applySize(width, height, scale); const saved = await savedLayout();
      await evaluate(`${editor}.setValue('selection','selectedIds',${ids})`);
      await showRightPanel(window, 'inspector'); await wait(`${openOver} && ${scrim}`, `${label} Show Inspector opens it over the dimmed field`);
      await evaluate(`${editor}.dispatch('transform.preview',{operation:'across-50'})`);
      await wait(`!!${state}.ui.transformPreview && ${openOver} && !${scrim} && document.activeElement?.getAttribute('aria-label')==='Transform operation'`, `${label} the preview keeps the Inspector open and lifts the scrim`);
      await quiet(label); await nativeClick(tool('Cancel transform'));
      await wait(`!${state}.ui.transformPreview && ${openOver}`, `${label} the Inspector stays open over the field after Cancel, with focus inside it`);
      await evaluate(`${editor}.dispatch('coordinates.preview',{})`);
      await wait(`!!${state}.ui.coordinatePreview && document.activeElement?.getAttribute('aria-label')==='Drill phrase' && ${openOver}`, `${label} coordinate entry in the open Inspector`);
      await key('Escape');
      await wait(`!${state}.ui.coordinatePreview && ${openOver} && !!document.activeElement?.closest('.workspace-pane-heading')`, `${label} Escape in coordinate entry returns focus to the still-open Inspector heading`);
      await key('Escape'); await wait(closedTo('Inspector'), `${label} Escape then closes the Inspector overlay`);
      if (scale === 1.5) {
        // Play during a preview beside the Inspector the writer opened closes that panel rather than playing the show
        // behind it, and focus stays on Pause, so Space pauses.
        await showRightPanel(window, 'inspector'); await wait(openOver, `${label} Show Inspector again`);
        await evaluate(`${editor}.dispatch('transform.preview',{operation:'across-50'})`); await wait(`!!${state}.ui.transformPreview && !${inspector}.hidden`, `${label} a preview in the Inspector the writer opened`);
        await nativeClick(byName('Play show'));
        await wait(`${state}.playback.playing && !${state}.ui.transformPreview && ${pane}.hidden && !${scrim} && document.activeElement?.getAttribute('aria-label')==='Pause playback'`, `${label} Play closes the Inspector over the field, focus kept on Pause`);
        await key('Space'); await wait(`!${state}.playback.playing`, `${label} Space on Pause pauses`);
        await evaluate(`${editor}.setValue('playback','count',0); ${editor}.setValue('selection','activeIndex',0)`);
      }
      assert.equal(await savedLayout(), saved, `${label} the previews leave the saved layout unchanged`);
      await evaluate(`${editor}.setValue('selection','selectedIds',[])`);
    }
    // Shrinking the window during a preview moves its docked Inspector over the field without a scrim: Apply, Cancel and
    // Play stay reachable and the focused control keeps focus, whole in view. When the preview ends it hides again.
    for (const [start, held] of [[[1366, 768, 1.5], 'Cancel transform'], [[1366, 768, 1], 'Transform operation']]) {
      const label = `${start[0]}x${start[1]}@${start[2]}`;
      await applySize(...start); await mirror(`${label} before shrinking`);
      assert.equal(await evaluate(over), false, `${label} the preview docks the Inspector`);
      // Focus on Cancel in the tool strip, or on the operation the preview focused, scrolled to the bottom edge of the docked panel.
      await evaluate(held === 'Cancel transform' ? `${tool(held)}.focus()` : `${byName(held, inspector)}.scrollIntoView({ block: 'end' })`);
      assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')"), held, `${label} focus before shrinking`);
      await applySize(...MINIMUM, true);
      await wait(`${over} && !${inspector}.hidden && !${scrim} && document.activeElement?.getAttribute('aria-label')===${JSON.stringify(held)} && ${focusWhole}`, `${label} shrinking during the preview opens the Inspector over the field, focus kept on ${held} and whole in view`);
      await quiet(`${label} after shrinking`);
      assert.deepEqual(await reachableIn(['Apply transform', 'Cancel transform', 'Play show'], 'document'), [], `${label} Apply, Cancel and Play stay reachable after shrinking during the preview`);
      await nativeClick(tool('Cancel transform')); await wait(`!${state}.ui.transformPreview && ${ended(true)}`, `${label} the shrunken preview's Inspector hides when it ends, with focus on the field area`);
      await evaluate(`${editor}.setValue('selection','selectedIds',[])`);
    }
    // Focus mode hides every panel: a preview there neither shows a scrim nor an Inspector over the field, and one
    // Escape after it still leaves focus mode.
    await applySize(900, 650, 1.5); await evaluate(`${editor}.setValue('selection','selectedIds',${ids}); ${editor}.dispatch('layout.focus')`); await wait("!!document.querySelector('.studio--focus')", 'focus mode for a preview');
    await evaluate(`${editor}.dispatch('transform.mirror')`); await wait(`!!${state}.ui.transformPreview`, 'preview in focus mode'); await frames();
    assert.deepEqual(await evaluate(`(() => { const body = document.querySelector('.studio-body'), field = document.querySelector('.field-container').getBoundingClientRect(), s = document.querySelector('[data-field-surface]').getBoundingClientRect(); const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2); return { scrim: ${scrim}, panel: !${pane}.hidden, wide: field.width >= body.getBoundingClientRect().width - 60, field: !!hit && document.querySelector('.field-container').contains(hit) }; })()`), { scrim: false, panel: false, wide: true, field: true }, 'a preview in focus mode keeps the whole field, with no scrim or panel over it');
    await evaluate(`${editor}.dispatch('transform.cancel')`); await wait(`!${state}.ui.transformPreview`, 'preview in focus mode cancelled');
    await evaluate("document.querySelector('.field-stage__svg').focus()"); await key('Escape'); await wait(`!document.querySelector('.studio--focus') && !${scrim}`, 'one Escape leaves focus mode after the preview');
    await evaluate(`${editor}.setValue('selection','selectedIds',[])`);
    pass('an Inspector the writer opened over the field stays open with focus inside it through a preview (Cancel, coordinate Escape), and Play during such a preview at 1024 × 700 @150% closes it with focus on Pause; shrinking during a docked preview (from 1366 × 768 @150% or @100%) opens the Inspector over the field with Apply, Cancel and Play reachable and the focused control whole in view, and hides it when the preview ends; and focus mode never shows a scrim or a panel over the field');
  }
  for (const [width, height] of SIZES) for (const scale of SCALES) await verify(width, height, scale);
  pass('UI-scale matrix 900–1920 px × 100–150%: one-row header and transport, unobstructed Save/Undo/Redo/Export/modes/play/set navigation, the move count always and the show count in wide windows, no scrolling, and a drawn field ≥ 480 × 260 at 1366 × 768 @150% and 900 × 650 @100%');
  await verify(...MINIMUM, false);
  // Without a set-list pane beside it, the transport of the smallest supported window folds only loop, metronome and speed.
  assert.equal(metrics.at(-1).tiers.transport, 'compact', 'the smallest supported window exercises a folded transport');
  pass('the smallest supported window (800 × 600 @150%) keeps a one-row header, a pinned one-row transport and every folded control reachable');
  if (panels) await checkDemandedPanels();
  // The accessibility suite's reachability walks below (and the one inside verify) still address the old header Menu,
  // workspace switcher and set-list pane; they are ported with that suite.
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
    for (let i = 0; i < 4; i++) { await key('Tab'); menu.push(await active()); }
    assert.deepEqual(menu, [...HEADER_FOLDED, 'Command palette']);
    await key('Escape');
    await evaluate(`${byName('Switch workspace')}.focus()`); await key('Return');
    await wait("!!document.querySelector('#workspace-options') && document.activeElement?.classList.contains('workspace-choice')", 'workspace options take focus');
    await key('Escape'); await wait("!document.querySelector('#workspace-options') && document.activeElement?.getAttribute('aria-label')==='Switch workspace'", 'Escape returns focus to workspace switcher');
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
    await stays('a preview applied with Enter from the page keeps focus on the page');
    await key('Space'); await wait(`${state}.playback.playing`, 'Space plays after Enter-apply'); await key('Space'); await wait(`!${state}.playback.playing`, 'Space pauses after Enter-apply');
    if (await evaluate("!!document.querySelector('.workspace-pane--overlay')")) { await key('Escape'); await wait("!document.querySelector('.workspace-pane--overlay')", 'Inspector overlay closed after the preview'); }
    await evaluate(`${editor}.dispatch('set.select',{index:${set}}); ${editor}.dispatch('history.undo'); ${editor}.setValue('selection','selectedIds',[])`); await wait(`${state}.project.revision===${revision}`, 'the applied preview undone');
    pass('focus that left a transport option for the page stays there through a tier change, a dialog opened from the page and a preview applied with Enter, so Space plays and pauses');
    // Focus a preview's Apply or Cancel held when it ended moves where Space plays and pauses, the selection stays and no
    // performer readout appears: to the Inspector's Selection actions where the Inspector stays docked (1366 × 768 @100%),
    // to the field area where it tucks again (1024 × 700 @150%); the focus outline shows only after a key. Enter on the
    // page applies the preview and leaves focus there.
    const all = await evaluate(`JSON.stringify(${state}.project.present.performers.map(p => p.id))`), count = JSON.parse(all).length;
    for (const [width, height, scale, spot] of [[1366, 768, 1, '.selection-bar'], [1024, 700, 1.5, '.main-workspace .field-container']]) {
      await applySize(width, height, scale);
      for (const end of ['pointer Apply', 'keyboard Apply', 'pointer Cancel', 'Enter on the page']) {
        const label = `${width}x${height}@${scale} ${end}`, before = await evaluate(`${state}.project.revision`);
        await evaluate(`${editor}.dispatch('set.select',{index:${set}}); ${editor}.setValue('selection','selectedIds',${all}); ${editor}.dispatch('transform.mirror')`);
        await wait(`!!${state}.ui.transformPreview && document.activeElement?.getAttribute('aria-label')==='Transform operation'`, `${label} preview`);
        const page = end === 'Enter on the page';
        if (end === 'keyboard Apply') { await key('Tab', ['shift']); await key('Tab', ['shift']); assert.equal(await active(), 'Apply transform'); await key('Return'); }
        else if (page) { await nativeClick(plain); await wait(onPage, `${label} focus on the page`); await key('Return'); }
        else await nativeClick(byName(end === 'pointer Apply' ? 'Apply transform' : 'Cancel transform', "document.querySelector('.selection-bar')"));
        await wait(`!${state}.ui.transformPreview && ${page ? onPage : `document.activeElement === document.querySelector(${JSON.stringify(spot)})`}`, `${label} ${page ? 'keeps focus on the page' : `moves focus to ${spot}`}`);
        assert.equal(await evaluate("document.activeElement.matches(':focus-visible')"), end === 'keyboard Apply', `${label} shows the focus outline only after a key`);
        await key('Space'); await wait(`${state}.playback.playing`, `${label} Space plays`); await key('Space'); await wait(`!${state}.playback.playing`, `${label} Space pauses`);
        assert.deepEqual(await evaluate(`[${state}.selection.selectedIds.length, !!document.querySelector('.field-readout')]`), [count, false], `${label} keeps the selection and shows no performer readout`);
        await evaluate(`${editor}.dispatch('set.select',{index:${set}})${end === 'pointer Cancel' ? '' : `; ${editor}.dispatch('history.undo')`}`); await wait(`${state}.project.revision===${before}`, `${label} undone`);
      }
    }
    // A formation preview started from the Command palette with focus on the page leaves it there, so Enter applies it.
    await applySize(1366, 768, 1);
    await evaluate(`${editor}.dispatch('set.select',{index:${set}}); ${editor}.setValue('selection','selectedIds',${state}.project.present.performers.slice(0,4).map(p=>p.id))`);
    await nativeClick(plain); await wait(onPage, 'focus on the page for a palette preview'); await key('K', [mod]);
    await wait("document.activeElement?.getAttribute('aria-label')==='Search commands or drill phrases'", 'palette for a formation preview');
    await window.webContents.debugger.sendCommand('Input.insertText', { text: 'Preview scatter formation' }); await key('Return');
    await wait(`!!${state}.ui.formationPreview && !document.querySelector('dialog[open]') && ${onPage}`, 'a palette formation preview keeps focus on the page');
    await key('Return'); await wait(`!${state}.ui.formationPreview && ${state}.project.revision!==${revision}`, 'Enter applies the palette formation preview');
    await evaluate(`${editor}.dispatch('history.undo'); ${editor}.setValue('selection','selectedIds',[])`); await wait(`${state}.project.revision===${revision}`, 'the palette formation undone');
    pass('when a preview ends by a pointer or keyboard Apply or by Cancel, focus moves to the Inspector\'s Selection actions at 1366 × 768 @100% and to the field area at 1024 × 700 @150%, with the outline only after a key, and Enter on the page applies it with focus kept there; Space then plays and pauses with the selection kept and no performer readout; a formation preview started from the Command palette keeps focus on the page, so Enter applies it');
    // A wider tier that removes ⋯ while it has focus, or under a dialog opened while it had focus, moves focus to the first
    // option that left the menu, now in ⋯'s place, instead of the page (where Space would play): by a resize, focus mode
    // and a UI scale change under Preferences.
    const onMore = async label => { await evaluate(`${byName('More playback options')}.focus()`); await wait("document.activeElement?.getAttribute('aria-label')==='More playback options'", label); };
    const lands = (name, label) => wait(`document.querySelector('.studio').dataset.transport==='full' && document.activeElement?.getAttribute('aria-label')===${JSON.stringify(name)} && !!document.activeElement.closest('.transport-options')`, label);
    // Keep UI scale and panel choices fixed during this native resize. Changing
    // scale at the same time can pass through compact, whose first folded
    // option is Loop. Tucked panels let this one resize span narrow and full.
    const resizeLayout = await evaluate(`${state}.preferences.value.workspaceLayout`);
    await evaluate(`${editor}.setValue('preferences','value',p=>({...p,workspaceLayout:{...p.workspaceLayout,setsCollapsed:true,inspectorCollapsed:true}}))`);
    await applySize(...MINIMUM);
    await wait("document.querySelector('.studio').dataset.transport==='narrow'", 'narrow transport before the resize');
    await onMore('More playback options in the narrow transport');
    await applySize(1920, 1080, 1.5, true); await lands('Rehearsal passages', 'a resize to the full transport moves focus from More to Rehearsal passages');
    await evaluate(`${editor}.setValue('preferences','value',p=>({...p,workspaceLayout:${JSON.stringify(resizeLayout)}}))`);
    await applySize(1024, 700, 1); assert.equal(await evaluate("document.querySelector('.studio').dataset.transport"), 'compact'); await onMore('More playback options before focus mode');
    await evaluate(`${editor}.dispatch('layout.focus')`); await lands('Loop show', 'focus mode moves focus from More to Loop show');
    await evaluate(`${editor}.dispatch('layout.focus')`); await wait(`!${state}.ui.focusMode`, 'focus mode ends');
    await applySize(1366, 768, 1.5); await onMore('More playback options before Preferences');
    await evaluate(`${editor}.dispatch('preferences.open')`); await wait(`${state}.ui.dialog==='preferences' && !!document.querySelector('dialog[open]')?.contains(document.activeElement)`, 'Preferences from More');
    await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:1}))`); await wait("document.querySelector('.studio').dataset.transport==='full'", 'the transport widens under Preferences');
    await key('Escape'); await lands('Loop show', 'closing Preferences opened from More moves focus to Loop show');
    // A confirmation is a dialog too: opened through the palette from Rehearsal passages, which folds away under it, it
    // returns focus to ⋯. (The suite's confirmation shim leaves it to real input meanwhile.)
    const titled = await evaluate(`${state}.project.revision`);
    await evaluate(`window.__qaConfirmBefore=window.__qaConfirmResponse; window.__qaConfirmResponse='manual'; ${editor}.dispatch('project.update',{title:'Unsaved title'})`); await applySize(1024, 700, 1.5);
    await evaluate(`${byName('Rehearsal passages', "document.querySelector('.transport-options')")}.focus()`); await key('K', [mod]);
    await wait("document.activeElement?.getAttribute('aria-label')==='Search commands or drill phrases'", 'palette from Rehearsal passages');
    await window.webContents.debugger.sendCommand('Input.insertText', { text: 'Open production' }); await wait("document.querySelector('.palette-result--active')?.getAttribute('aria-label')==='Open production'", 'Open production in the palette');
    await key('Return'); await wait(`!!${state}.ui.confirmation && !!document.querySelector('dialog.confirm-dialog[open]')?.contains(document.activeElement)`, 'the open confirmation');
    await applySize(...MINIMUM, true); await wait("document.querySelector('.studio').dataset.transport==='narrow'", 'Rehearsal passages folds away under the confirmation');
    await key('Escape'); await wait(`!${state}.ui.confirmation && !document.querySelector('dialog[open]') && document.activeElement?.getAttribute('aria-label')==='More playback options'`, 'the confirmation returns focus to More');
    await evaluate(`window.__qaConfirmResponse=window.__qaConfirmBefore; ${editor}.dispatch('history.undo')`); await wait(`${state}.project.revision===${titled}`, 'the title edit undone');
    pass('focus on More playback options, or a dialog opened while it has focus, moves to the first option that left the menu when a resize, focus mode or a UI scale change removes ⋯; a confirmation over a tier change returns focus to ⋯ like other dialogs');
  }
  // Auto-tucking and overlays are temporary: the saved layout and production are unchanged.
  assert.equal(await evaluate(`JSON.stringify({ layout: ${state}.preferences.value.workspaceLayout, cast: ${state}.preferences.value.castPanelOpen })`), layoutBefore);
  assert.equal(await evaluate(`${state}.project.revision`), project);
  await applySize(1366, 768, 1);
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: false });
  pass('resizing through every breakpoint and opening tucked panels leaves the saved layout preference and production unchanged');
  return metrics;
};
