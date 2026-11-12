'use strict';
const {revealFieldTool}=require('./testing/renderer.cjs');
const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'); const path = require('node:path');
const { capturePage, key: sendKey, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const { root, output, profile, baseline } = require(process.argv.find(a => a.startsWith('--workspace-manifest=')).slice('--workspace-manifest='.length));
const phase = process.argv.find(a => a.startsWith('--phase='))?.slice('--phase='.length);
app.disableHardwareAcceleration(); app.setPath('userData', profile);
BrowserWindow.prototype.show = function () {};
let window; let failure; const checks = []; const metrics = [];
app.on('browser-window-created', (_event, created) => {
  window = created; window.webContents.setBackgroundThrottling(false);
  window.webContents.on('render-process-gone', (_event, details) => { failure = new Error(`Renderer exited: ${details.reason}`); });
});
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const editor = 'window.__workspaceQA'; const state = editor + '.getState()';
const wait = (source, label) => waitFor(() => evaluate(source), label, { timeoutMs: 15000, failure: () => failure });
const key = (code, modifiers = []) => sendKey(window, code, modifiers, 20);
const capture = name => capturePage(window, output, name);
function instrument() {
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) window.__workspaceQA = v; visit(f.child); visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
const pass = label => { checks.push(label); console.log('PASS ' + label); };
async function control(selector) {
  // These cases own focus recovery from the Inspector's pinned preview controls.
  if(['Apply transform','Cancel transform','Apply formation','Cancel formation','Apply spacing','Cancel spacing','Apply coordinates','Cancel coordinate entry'].some(name=>selector==='[aria-label="'+name+'"]'))selector='.selection-bar '+selector; await revealFieldTool(window,selector);
  await wait(`new Promise(resolve=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n || n.disabled || n.getAttribute('aria-disabled')==='true' || !n.getClientRects().length){resolve(false);return;}n.scrollIntoView({block:'nearest'});requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=n.getBoundingClientRect();window.__workspacePoint={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};resolve(n.contains(document.elementFromPoint(window.__workspacePoint.x,window.__workspacePoint.y)));}));})`, 'actionable ' + selector);
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  const point = await evaluate('window.__workspacePoint');
  await evaluate(`window.__workspaceClick=null;window.__workspaceExpected=document.querySelector(${JSON.stringify(selector)});document.addEventListener('click',e=>{window.__workspaceClick=e.target},{once:true,capture:true})`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
  await wait('!!window.__workspaceClick', 'native click ' + selector);
  assert.ok(await evaluate('window.__workspaceExpected.contains(window.__workspaceClick)'), selector + ' receives native input');
}
// Clicks the scrim beside an open overlay, on the side away from the pane.
async function clickScrim() {
  const point = await evaluate("(()=>{const s=document.querySelector('.workspace-overlay-dismiss').getBoundingClientRect(),p=document.querySelector('.workspace-pane--overlay').getBoundingClientRect();const x=Math.round(p.left>s.left+s.width/2?s.left+20:s.right-20),y=Math.round(s.top+s.height/2);return {x,y,hit:document.elementFromPoint(x,y)?.classList.contains('workspace-overlay-dismiss')}})()");
  assert.ok(point.hit, 'the scrim is clickable beside the overlay');
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
}
async function viewport(width, height, zoom = 1) {
  window.setContentSize(width, height); window.webContents.setZoomFactor(zoom);
  await settleNativeViewport(window, 'workspace display change');
  assert.deepEqual(await evaluate('[innerWidth,innerHeight]'), [Math.round(width / zoom), Math.round(height / zoom)], 'test must exercise the requested viewport');
  await wait("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(document.querySelector('.field-container').getBoundingClientRect().width>100))))", 'workspace layout after display change');
}
async function measure(label) {
  const result = await evaluate(`(()=>{const r=document.querySelector('.field-container').getBoundingClientRect();return {fieldWidth:r.width,fieldHeight:r.height,viewport:[innerWidth,innerHeight],header:document.querySelector('.app-header').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
  assert.equal(result.overflow, false, label + ' has no document overflow'); metrics.push({ label, ...result }); return result;
}
// Pressed presets render visibly active (2px accent border and a check mark); a custom layout says so instead.
const presetState = "(()=>{const probe=document.createElement('i');probe.style.color='var(--accent)';document.body.append(probe);const accent=getComputedStyle(probe).color;probe.remove();return {custom:document.querySelector('.layout-custom')?.textContent??null,presets:[...document.querySelectorAll('.layout-presets .button')].map(b=>{const s=getComputedStyle(b);return [b.getAttribute('aria-label'),b.getAttribute('aria-pressed'),!!b.querySelector('.lucide-check'),s.borderTopColor===accent&&parseFloat(s.borderTopWidth)>=1.5]})}})()";
const expectedPresets = current => ({ custom: current === 'custom' ? 'Custom layout: choose a preset to restore its panels and widths.' : null,
  presets: ['Write', 'Review', 'Rehearse'].map(name => { const on = name.toLowerCase() === current; return [`${name} preset`, String(on), on, on]; }) });
// #178: below the compact header breakpoint, Layout opens from Menu and moves focus into its options.
async function openLayout() {
  if (await evaluate("document.querySelector('.studio').dataset.header === 'full'")) {
    await control('[aria-label="Workspace layout"]');
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Workspace layout\"]').getAttribute('aria-expanded')"), 'true');
  } else {
    assert.equal(await evaluate("document.querySelector('.header-actions [aria-label=\"Workspace layout\"]')"), null, 'compact header folds Layout into Menu');
    await control('[aria-label="Project menu"]'); await control('.dropdown [aria-label="Workspace layout"]');
    await wait("!!document.querySelector('#workspace-layout-options') && document.activeElement?.getAttribute('aria-label')==='Close layout options'", 'layout options from Menu');
  }
}
async function preset(name) {
  await openLayout();
  const current = await evaluate(`${state}.preferences.value.workspaceLayout.preset`);
  assert.deepEqual(await evaluate(presetState), expectedPresets(current), 'Layout popover shows the current preset');
  await control(`[aria-label="${name} preset"]`);
  await wait(`${state}.preferences.value.workspaceLayout.preset==='${name.toLowerCase()}'`, name + ' preset applied');
  await wait(`document.querySelector('[aria-label="${name} preset"]')?.getAttribute('aria-pressed')==='true'`, name + ' preset pressed');
  assert.deepEqual(await evaluate(presetState), expectedPresets(name.toLowerCase()), name + ' preset renders active');
  await control('[aria-label="Close layout options"]');
}
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'workspace window'); await wait("!!document.querySelector('.field-stage__svg')", 'initial renderer');
    window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    window.webContents.reload(); await wait(`!!${editor} && ${state}.preferences.status==='saved'`, 'workspace preferences ready');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await viewport(1366, 768);
    if (baseline) {
      await measure('before'); await capture('workspace-before.png'); pass('baseline captured at 1366 × 768');
    } else if (phase === 'read') {
      assert.deepEqual(await evaluate(`${state}.preferences.value.workspaceLayout`), { preset: 'custom', setsWidth: 290, inspectorWidth: 310, castWidth: 360, setsCollapsed: false, inspectorCollapsed: false, castCollapsed: false });
      assert.equal(await evaluate(`${state}.ui.castPanelOpen`), true); assert.equal(await evaluate(`${state}.ui.focusMode`), false);
      await wait("document.querySelector('.cast-dock')?.getBoundingClientRect().width===360", 'Cast width restored across process restart');
      await capture('workspace-restored.png'); pass('intentional widths, panel choice and collapse states survive a fresh desktop process; focus starts escapable');
      // #178: Cast restored at startup beside the 3D view of a 1024 × 700 window at 150% (a matrix size) never opens a
      // scrim: it docks without scrolling the workspace or starts tucked behind Show Cast. Choosing 2D, where it fits,
      // then docks it with no scrolling: the crowding decision belongs to the view it was measured in.
      await viewport(1024, 700);
      await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:1.5})); ${editor}.setValue('ui','view','3d')`);
      await wait(`${state}.preferences.status==='saved'`, '150% UI scale and the 3D view saved');
      window.webContents.reload();
      await wait(`!!${editor} && ${state}.preferences.status==='saved' && ${state}.ui.castPanelOpen && ${state}.ui.view==='3d' && !!document.querySelector('.field-container.is-3d') && document.querySelector('.studio').clientWidth<700`, 'Cast, the 3D view and 150% restored at startup');
      const cast = "(()=>{const p=document.querySelector('#workspace-pane-cast'),b=document.querySelector('.studio-body'),s=document.querySelector('[aria-label=\"Show Cast\"]')?.getBoundingClientRect(),hit=s&&document.elementFromPoint(s.x+s.width/2,s.y+s.height/2);return [p.hidden?'tucked':p.classList.contains('workspace-pane--overlay')?'over':'docked',b.scrollHeight-b.clientHeight<=1,!!hit?.closest('[aria-label=\"Show Cast\"]'),!!document.querySelector('.workspace-overlay-dismiss')].join()})()";
      const settled = await evaluate(`new Promise(resolve=>{const out=[];const tick=()=>{out.push(${cast});if(out.length<6)requestAnimationFrame(tick);else resolve(out)};requestAnimationFrame(tick)})`);
      assert.ok(['docked,true,false,false', 'tucked,true,true,false', 'tucked,false,true,false'].includes(settled.at(-1)) && new Set(settled.slice(-3)).size === 1, `Cast restored beside the 3D view docks without scrolling or starts tucked behind Show Cast, with no scrim: ${settled.join(' | ')}`);
      await control('[aria-label="2D field"]');
      await wait(`${cast}==='docked,true,false,false'`, 'choosing 2D docks the restored Cast without scrolling the workspace');
      await capture('workspace-restored-cast-2d.png'); pass('Cast restored at startup beside the 3D view at 1024 × 700 @150% shows no scrim and docks without scrolling once 2D is chosen');
    } else {
      const original = await evaluate(`${state}.project`);
      const initial = await measure('write'); assert.ok(initial.fieldHeight >= 470, JSON.stringify(initial)); await capture('workspace-write.png');
      await preset('Review');
      assert.ok(await evaluate("document.querySelector('#workspace-pane-inspector').hidden"));
      assert.ok((await measure('review')).fieldWidth > initial.fieldWidth + 200); await capture('workspace-review.png');
      await control('[aria-label="Show Inspector"]'); await wait("!document.querySelector('#workspace-pane-inspector').hidden", 'restore Inspector');
      await preset('Rehearse'); await capture('workspace-rehearse.png');
      assert.ok(await evaluate("document.querySelector('#workspace-pane-sets').hidden && document.querySelector('#workspace-pane-inspector').hidden"));
      await preset('Write');
      // Native separator input, including cancellation and one accepted pointer gesture.
      await control('[aria-label="Resize Set list"]'); await key('Right');
      await wait(`${state}.preferences.value.workspaceLayout.setsWidth===226`, 'keyboard resize');
      await key('Home'); await wait(`${state}.preferences.value.workspaceLayout.setsWidth===160`, 'minimum pane width');
      await key('End'); await wait(`${state}.preferences.value.workspaceLayout.setsWidth===360`, 'maximum pane width');
      await key('Enter'); await wait("document.querySelector('#workspace-pane-sets').hidden", 'keyboard collapse');
      await control('[aria-label="Show Set list"]'); await preset('Write');
      const point = await evaluate("(()=>{const r=document.querySelector('[aria-label=\"Resize Set list\"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+80)}})()");
      async function drag(cancel) {
        await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
        await wait("document.activeElement.getAttribute('aria-label')==='Resize Set list'", 'resize pointer down acknowledged');
        await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + 74, y: point.y, button: 'left', buttons: 1 });
        await wait("document.querySelector('[aria-label=\"Resize Set list\"]').getAttribute('aria-valuenow')==='290'", 'resize pointer preview acknowledged');
        if (cancel) await key('Escape');
        await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x + 74, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
      }
      await drag(true); assert.equal(await evaluate(`${state}.preferences.value.workspaceLayout.setsWidth`), 216);
      await drag(false); await wait(`${state}.preferences.value.workspaceLayout.setsWidth===290`, 'accepted pointer resize');
      pass('native arrows/Home/End resize, Enter collapses, pointer drag accepts once and Escape cancels its draft');
      // Focus uses real keyboard dispatch and Escape before the field selection handler.
      await evaluate(`${editor}.setValue('selection','selectedIds',[${state}.project.present.performers[0].id])`);
      await control('[aria-label="Focus field"]'); const focused = await measure('focus');
      assert.ok(focused.fieldHeight > initial.fieldHeight + 80); assert.ok(focused.fieldWidth > initial.fieldWidth + 300);
      await capture('workspace-focus.png'); await key('Escape'); await wait("!document.querySelector('.studio--focus')", 'Escape restores workspace');
      assert.equal(await evaluate(`${state}.selection.selectedIds.length`), 1);
      await key('F', [process.platform === 'darwin' ? 'meta' : 'control', 'shift']); await wait("!!document.querySelector('.studio--focus')", 'focus keyboard shortcut');
      await control('[aria-label="Exit focus"]'); pass('focus increases field space, preserves selection on Escape and has pointer/keyboard restore');
      // Narrow windows tuck the set list first, then the Inspector; opening one over the field never writes the saved layout.
      const savedLayout = await evaluate(`JSON.stringify(${state}.preferences.value.workspaceLayout)`);
      const docked = await evaluate("[document.querySelector('#workspace-pane-sets').hidden, document.querySelector('#workspace-pane-inspector').hidden]");
      // castOverlay: whether Cast shown from its header tab docks beside a narrower field (false) or opens over it (true).
      // 1366 × 768 at zoom 2 (683 × 384, below the smallest supported height) already scrolls; docking Cast beside the
      // single-row toolbar lets Cast dock without adding scrolling; the narrower 500px view still overlays it.
      for (const [width, height, zoom, tucked, castOverlay] of [[1000, 700, 1, [false, false]], [850, 680, 1, [true, false]], [1366, 768, 2, [true, true], false], [1000, 700, 2, [true, true], true]]) {
        await viewport(width, height, zoom); await measure(`${width}x${height}@${zoom}`);
        assert.deepEqual(await evaluate("[document.querySelector('#workspace-pane-sets').hidden, document.querySelector('#workspace-pane-inspector').hidden]"), tucked, `${width}x${height}@${zoom} tucks the set list first`);
        const hiddenPane = await evaluate("document.querySelector('#workspace-pane-sets').hidden ? 'Set list' : document.querySelector('#workspace-pane-inspector').hidden ? 'Inspector' : null");
        if (hiddenPane) {
          await control(`[aria-label="Show ${hiddenPane}"]`);
          await wait("!!document.querySelector('.workspace-pane--overlay')", 'narrow pane overlay');
          await capture(`workspace-${width}-${zoom}.png`); await key('Escape'); await wait("!document.querySelector('.workspace-pane--overlay')", 'overlay Escape');
          // Its heading button closes a tucked pane without collapsing it or making the layout Custom.
          await control(`[aria-label="Show ${hiddenPane}"]`); await wait("!!document.querySelector('.workspace-pane--overlay')", 'narrow pane overlay again');
          await control('.workspace-pane--overlay .workspace-pane-heading button');
          await wait(`!document.querySelector('.workspace-pane--overlay') && document.activeElement?.getAttribute('aria-label')==='Show ${hiddenPane}'`, 'heading button closes the overlay');
          // A click on the field around the overlay closes it like Escape and returns focus to Show, without the keyboard
          // focus style (and its help) even when the overlay was opened from the keyboard.
          await key('Tab', ['shift']); await key('Tab'); await wait(`document.activeElement?.getAttribute('aria-label')==='Show ${hiddenPane}' && document.activeElement.matches(':focus-visible')`, 'Show reached with Tab');
          await key('Return'); await wait("!!document.querySelector('.workspace-pane--overlay')", 'narrow pane overlay from the keyboard for a click beside it');
          await clickScrim();
          await wait(`!document.querySelector('.workspace-pane--overlay') && document.activeElement?.getAttribute('aria-label')==='Show ${hiddenPane}'`, 'a click beside the overlay closes it and focuses Show');
          assert.equal(await evaluate("document.activeElement.matches(':focus-visible')"), false, 'a pointer click beside the overlay focuses Show without the keyboard focus style');
          // So does a pointer click on the overlay's Close button after a keyboard open.
          await key('Tab', ['shift']); await key('Tab'); await wait(`document.activeElement?.getAttribute('aria-label')==='Show ${hiddenPane}' && document.activeElement.matches(':focus-visible')`, 'Show reached with Tab again');
          await key('Return'); await wait("!!document.querySelector('.workspace-pane--overlay .workspace-pane-heading button:focus-visible')", 'narrow pane overlay from the keyboard for its Close button');
          await control('.workspace-pane--overlay .workspace-pane-heading button');
          await wait(`!document.querySelector('.workspace-pane--overlay') && document.activeElement?.getAttribute('aria-label')==='Show ${hiddenPane}'`, 'a click on Close closes the overlay and focuses Show');
          assert.deepEqual(await evaluate(`[document.activeElement.matches(':focus-visible'), !!document.querySelector('[role=tooltip]')?.textContent.startsWith('Show ${hiddenPane}')]`), [false, false], 'a pointer click on Close focuses Show without the keyboard focus style or its help');
        } else await capture(`workspace-${width}-${zoom}.png`);
        if (castOverlay !== undefined) {
          await control('.workspace-tab[aria-label="Cast"]');
          await wait("(()=>{const p=document.querySelector('#workspace-pane-cast');return !!p&&!p.hidden&&!p.inert&&p.contains(document.activeElement)})()", 'Cast tab shows Cast with focus inside');
          assert.equal(await evaluate("document.querySelector('#workspace-pane-cast').classList.contains('workspace-pane--overlay')"), castOverlay, `${width}x${height}@${zoom} Cast ${castOverlay ? 'opens over' : 'docks beside'} the field`);
          assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true, 'Cast fits without overflow');
          await capture(`workspace-cast-${width}-${zoom}.png`);
          await control('.workspace-tab[aria-label="Design"]'); await wait(`!${state}.ui.castPanelOpen && !document.querySelector('.workspace-pane--overlay')`, 'Design returns to the Inspector');
        }
        assert.equal(await evaluate(`JSON.stringify(${state}.preferences.value.workspaceLayout)`), savedLayout, 'auto-tucking and overlays leave the saved layout unchanged');
      }
      await viewport(1366, 768);
      assert.deepEqual(await evaluate("[document.querySelector('#workspace-pane-sets').hidden, document.querySelector('#workspace-pane-inspector').hidden]"), docked, 'panels dock again when the window grows');
      assert.equal(await evaluate(`JSON.stringify(${state}.preferences.value.workspaceLayout)`), savedLayout);
      pass('narrow and zoomed windows tuck the set list, then the Inspector, open them over the field (closing with Escape or the heading button), show Cast docked or over the field from its tab, and restore the unchanged saved layout when the window grows');
      await viewport(1000, 700, 2);
      await preset('Write');
      // Start the preview in the same turn as the native reveal click, before
      // its scheduled heading focus. The preview must retain parameter focus.
      await evaluate(`document.querySelector('[aria-label="Show Inspector"]').addEventListener('click',()=>queueMicrotask(()=>${editor}.dispatch('transform.preview',{})),{once:true})`);
      await control('[aria-label="Show Inspector"]');
      await wait(`!!${state}.ui.transformPreview`, 'preview in narrow Inspector overlay');
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Close Inspector\"]').getAttribute('aria-disabled')"), 'true');
      // No scrim hides the preview, and the field fits beside the overlay (this window is below the supported minimum,
      // so the workspace scrolls under the pinned timeline; the matrix checks hit-testing at supported sizes).
      assert.deepEqual(await evaluate("(()=>{const f=document.querySelector('.field-container').getBoundingClientRect(),o=document.querySelector('.workspace-pane--overlay').getBoundingClientRect();return [!!document.querySelector('.workspace-overlay-dismiss'),f.width>100&&f.right<=o.left+1]})()"), [false, true], 'preview field stays visible beside the narrow Inspector overlay');
      // Opening a transform focuses its operation select. Leave that native
      // control before asserting the editor's Escape shortcut.
      await wait("document.activeElement.getAttribute('aria-label')==='Transform operation'", 'preview operation focus');
      await key('Tab', ['shift']);
      await wait("document.activeElement.getAttribute('aria-label')==='Cancel transform'", 'native Shift+Tab to preview action');
      await key('Escape'); await wait(`!${state}.ui.transformPreview`, 'Escape cancels preview before dismissing overlay');
      assert.ok(await evaluate("!!document.querySelector('.workspace-pane--overlay')"));
      await key('Escape'); await wait("!document.querySelector('.workspace-pane--overlay')", 'second Escape dismisses overlay');
      pass('narrow overlays preserve preview controls and let Escape cancel the edit before dismissing the panel');
      // A pane the user collapsed and then restored over the field, by Show or by a preview, offers Collapse there, which
      // collapses it again; Close (layout unchanged) is only for panes the window tucked.
      await preset('Rehearse');
      await control('[aria-label="Show Set list"]'); await wait("!!document.querySelector('#workspace-pane-sets.workspace-pane--overlay')", 'restored Set list over the field');
      assert.equal(await evaluate("document.querySelector('.workspace-pane--overlay .workspace-pane-heading button').getAttribute('aria-label')"), 'Collapse Set list');
      await control('.workspace-pane--overlay .workspace-pane-heading button');
      await wait(`${state}.preferences.value.workspaceLayout.setsCollapsed && !document.querySelector('.workspace-pane--overlay') && document.activeElement?.getAttribute('aria-label')==='Show Set list'`, 'Collapse collapses the restored Set list again');
      // The header Cast tab restores a collapsed Cast the same way.
      await evaluate(`${editor}.dispatch('layout.update', { update: { castCollapsed: true } })`);
      await control('.workspace-tab[aria-label="Cast"]'); await wait("!!document.querySelector('#workspace-pane-cast.workspace-pane--overlay')", 'the Cast tab restores the collapsed Cast over the field');
      assert.equal(await evaluate("document.querySelector('.workspace-pane--overlay .workspace-pane-heading button').getAttribute('aria-label')"), 'Collapse Cast');
      await control('.workspace-pane--overlay .workspace-pane-heading button');
      await wait(`${state}.preferences.value.workspaceLayout.castCollapsed && !document.querySelector('.workspace-pane--overlay') && document.activeElement?.getAttribute('aria-label')==='Show Cast'`, 'Collapse collapses the restored Cast again');
      await control('.workspace-tab[aria-label="Design"]'); await wait(`!${state}.ui.castPanelOpen`, 'Design after the restored Cast');
      // A preview shows a collapsed Inspector over the field without a scrim, and without writing the saved layout; that
      // placement ends with the preview, which leaves the Inspector collapsed, the Review preset chosen, no overlay or scrim
      // behind and focus on the field area.
      await preset('Review');
      await evaluate(`${editor}.setValue('selection','selectedIds',[${state}.project.present.performers[0].id]); ${editor}.dispatch('transform.mirror')`);
      await wait(`!!${state}.ui.transformPreview && !!document.querySelector('#workspace-pane-inspector.workspace-pane--overlay') && !document.querySelector('.workspace-overlay-dismiss') && ${state}.preferences.value.workspaceLayout.inspectorCollapsed`, 'a preview shows the collapsed Inspector over the field, leaving it collapsed in the saved layout');
      await control('[aria-label="Cancel transform"]');
      await wait(`!${state}.ui.transformPreview && document.querySelector('#workspace-pane-inspector').hidden && !document.querySelector('.workspace-pane--overlay') && !document.querySelector('.workspace-overlay-dismiss') && document.activeElement === document.querySelector('.main-workspace > .field-container')`, 'the preview\'s Inspector placement ends with it, focus on the field area');
      assert.deepEqual(await evaluate(`(({ preset, setsCollapsed, inspectorCollapsed, castCollapsed }) => ({ preset, setsCollapsed, inspectorCollapsed, castCollapsed }))(${state}.preferences.value.workspaceLayout)`), { preset: 'review', setsCollapsed: false, inspectorCollapsed: true, castCollapsed: false });
      pass('a pane restored over the field by Show or the Cast tab offers Collapse, which restores the collapsed choice; a preview shows a collapsed Inspector over the field only while it runs, leaving the Review preset unchanged');
      // Unchecking a pane in the layout options collapses it, also Cast the writer showed where it docks only beside a
      // narrower field: no overlay or scrim takes its place. Checking it again restores it by the same rules.
      await viewport(1024, 700, 1.5);
      const castDocked = "(p=>!!p&&!p.hidden&&!p.classList.contains('workspace-pane--overlay'))(document.querySelector('#workspace-pane-cast'))";
      await control('.workspace-tab[aria-label="Cast"]'); await wait(`${castDocked} && document.querySelector('#workspace-pane-cast').contains(document.activeElement)`, 'the Cast tab docks Cast beside a narrower field');
      const castOption = '#workspace-layout-options .layout-pane-option:has([aria-label="Cast width"]) input[type=checkbox]';
      await openLayout(); await control(castOption);
      await wait(`${state}.preferences.value.workspaceLayout.castCollapsed && document.querySelector('#workspace-pane-cast').hidden && !document.querySelector('.workspace-pane--overlay, .workspace-overlay-dismiss')`, 'unchecking Cast collapses it without an overlay or scrim');
      await control(castOption); await wait(`!${state}.preferences.value.workspaceLayout.castCollapsed && ${castDocked}`, 'checking Cast again docks it');
      await control('[aria-label="Close layout options"]'); await control('.workspace-tab[aria-label="Design"]'); await wait(`!${state}.ui.castPanelOpen`, 'Design after the layout options');
      pass('unchecking Cast in the layout options collapses Cast the writer showed, with no overlay or scrim, and checking it docks it again');
      await viewport(1366, 768); await preset('Write');
      await control('.workspace-tab[aria-label="Cast"]');
      await control('[aria-label="Resize Cast"]'); await key('Left', ['shift']);
      await wait(`${state}.preferences.value.workspaceLayout.castWidth===340`, 'Cast keyboard resize');
      await openLayout();
      // Slider input receives native key events and exposes a precise pixel value.
      for (const [name, value] of [['Set list', 290], ['Inspector', 310], ['Cast', 360]]) {
        await control(`[aria-label="${name} width"]`); await key('Home');
        const min = name === 'Set list' ? 160 : name === 'Inspector' ? 235 : 280;
        for (let i = min; i < value; i++) await key('Right');
      }
      await control('[aria-label="Close layout options"]');
      await wait(`${state}.preferences.status==='saved'`, 'durable layout preferences');
      assert.deepEqual(await evaluate(`${state}.project`), original); await capture('workspace-cast.png');
      await control('[aria-label="Focus field"]'); await wait(`${state}.ui.focusMode`, 'leave temporary focus active before process restart');
      pass('Layout sliders support precise native keyboard input; sizing/presets/focus leave production and undo history unchanged');
    }
    await fs.writeFile(path.join(output, `results${phase ? '-' + phase : ''}.json`), JSON.stringify({ passed: checks, metrics, platform: process.platform }, null, 2));
    app.exit(0);
  } catch (error) { console.error(error); if (window && !window.isDestroyed()) await capture('failure.png').catch(() => {}); app.exit(1); }
});
