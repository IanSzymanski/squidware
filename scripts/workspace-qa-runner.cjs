'use strict';
const {activateWorkspace,showRightPanel}=require('./testing/renderer.cjs');
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
  // A control inside a closed menu (Focus field is in View options) is revealed by opening that menu first.
  await revealFieldTool(window,selector);
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
  const point = await evaluate("(()=>{const s=document.querySelector('.workspace-overlay-dismiss').getBoundingClientRect(),p=document.querySelector('.workspace-pane--overlay').getBoundingClientRect();const x=Math.round(p.left+p.width/2>s.left+s.width/2?s.left+20:s.right-20),y=Math.round(s.top+s.height/2);const at=document.elementFromPoint(x,y);return {x,y,hit:at?.classList.contains('workspace-overlay-dismiss'),at:at?.outerHTML.slice(0,160)}})()");
  assert.ok(point.hit, 'the scrim is clickable beside the overlay: ' + JSON.stringify(point));
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
  const result = await evaluate(`(()=>{const r=document.querySelector('.field-container').getBoundingClientRect(),p=document.querySelector('.side-panel');return {fieldWidth:r.width,fieldHeight:r.height,panel:p.hidden?0:p.getBoundingClientRect().width,viewport:[innerWidth,innerHeight],header:document.querySelector('.app-header').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
  assert.equal(result.overflow, false, label + ' has no document overflow'); metrics.push({ label, ...result }); return result;
}
// The shell has one side panel (Inspector or Cast, one width) beside the field. These layout fixtures keep the
// breakpoint/resize regression owner. The workspaces suite owns native switching, active names and arrangement management.
const layout = `${state}.preferences.value.workspaceLayout`;
const paneHidden = "document.querySelector('#workspace-pane-inspector, #workspace-pane-cast').hidden";
const overlay = "document.querySelector('.workspace-pane--overlay')", scrim = "document.querySelector('.workspace-overlay-dismiss')";
const closeButton = '.workspace-pane--overlay .workspace-pane-heading .icon-button';
const focusedLabel = "document.activeElement?.getAttribute('aria-label')";
async function preset(name) {
  if (await evaluate(`!!${overlay}`)) { await key('Escape'); await wait(`!${overlay}`, 'prior panel overlay dismissed'); }
  await evaluate(`${editor}.dispatch('layout.preset',{preset:${JSON.stringify(name.toLowerCase())}})`);
  await wait(`${layout}.preset==='${name.toLowerCase()}'`, name + ' layout fixture');
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
      // One width serves both tabs, so the separator writes it to both. Nothing in the shell resizes a set list any more.
      assert.deepEqual(await evaluate(layout), { preset: 'custom', setsWidth: 216, inspectorWidth: 318, castWidth: 318, setsCollapsed: false, inspectorCollapsed: false, castCollapsed: false });
      assert.equal(await evaluate(`${state}.ui.castPanelOpen`), true); assert.equal(await evaluate(`${state}.ui.focusMode`), false);
      await wait("document.querySelector('#workspace-pane-cast')?.getBoundingClientRect().width===318 && !!document.querySelector('#workspace-pane-cast .cast-dock')?.getClientRects().length", 'Cast width restored across process restart');
      await capture('workspace-restored.png'); pass('intentional widths, panel choice and collapse states survive a fresh desktop process; focus starts escapable');
      // #178: Cast restored at startup beside the 3D view of a 1024 × 700 window at 150% (a matrix size) never opens a
      // scrim. The field would keep less than its reserve beside the panel, so Cast starts tucked behind Show Cast
      // without scrolling the workspace, in 3D and in 2D alike, and Show Cast opens it over the field.
      await viewport(1024, 700);
      await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:1.5})); ${editor}.setValue('ui','view','3d')`);
      await wait(`${state}.preferences.status==='saved'`, '150% UI scale and the 3D view saved');
      window.webContents.reload();
      await wait(`!!${editor} && ${state}.preferences.status==='saved' && ${state}.ui.castPanelOpen && ${state}.ui.view==='3d' && !!document.querySelector('.field-container.is-3d') && document.querySelector('.studio').clientWidth<700`, 'Cast, the 3D view and 150% restored at startup');
      const cast = "(()=>{const p=document.querySelector('#workspace-pane-cast'),b=document.querySelector('.studio-body'),s=document.querySelector('[aria-label=\"Show Cast\"]')?.getBoundingClientRect(),hit=s&&document.elementFromPoint(s.x+s.width/2,s.y+s.height/2);return [p.hidden?'tucked':p.classList.contains('workspace-pane--overlay')?'over':'docked',b.scrollHeight-b.clientHeight<=1,!!hit?.closest('[aria-label=\"Show Cast\"]'),!!document.querySelector('.workspace-overlay-dismiss')].join()})()";
      const settled = await evaluate(`new Promise(resolve=>{const out=[];const tick=()=>{out.push(${cast});if(out.length<6)requestAnimationFrame(tick);else resolve(out)};requestAnimationFrame(tick)})`);
      assert.ok(settled.at(-1) === 'tucked,true,true,false' && new Set(settled.slice(-3)).size === 1, `Cast restored beside the 3D view starts tucked behind Show Cast without scrolling the workspace, with no scrim: ${settled.join(' | ')}`);
      await control('[aria-label="2D field"]');
      await wait(`${state}.ui.view==='2d' && !document.querySelector('.field-container.is-3d') && ${cast}==='tucked,true,true,false'`, 'choosing 2D keeps the restored Cast tucked without scrolling the workspace');
      await control('[aria-label="Show Cast"]');
      await wait(`!!${overlay} && !!${scrim} && !document.querySelector('#workspace-pane-cast').hidden && document.querySelector('#workspace-pane-cast').contains(document.activeElement) && (b=>b.scrollHeight-b.clientHeight<=1)(document.querySelector('.studio-body'))`, 'Show Cast opens the restored Cast over the field with focus inside');
      await capture('workspace-restored-cast-2d.png'); pass('Cast restored at startup beside the 3D view at 1024 × 700 @150% shows no scrim, stays tucked without scrolling once 2D is chosen and opens over the field from Show Cast');
    } else {
      const original = await evaluate(`${state}.project`);
      const initial = await measure('write'); assert.ok(initial.fieldHeight >= 470, JSON.stringify(initial)); assert.equal(initial.panel, 288, 'the Inspector docks at its minimum width'); await capture('workspace-write.png');
      await preset('Review');
      assert.ok(await evaluate("document.querySelector('#workspace-pane-inspector').hidden"));
      assert.ok((await measure('review')).fieldWidth > initial.fieldWidth + 200); await capture('workspace-review.png');
      await control('[aria-label="Show Inspector"]'); await wait("!document.querySelector('#workspace-pane-inspector').hidden", 'restore Inspector');
      await preset('Rehearse'); await capture('workspace-rehearse.png');
      assert.ok(await evaluate("document.querySelector('#workspace-pane-inspector').hidden && !document.querySelector('.workspace-pane:not([hidden])')"));
      await preset('Write');
      // Native separator input, including cancellation and one accepted pointer gesture. The panel is on the right, so
      // Left widens it. Home and End use its limits.
      const widths = `[${layout}.inspectorWidth,${layout}.castWidth].join()`;
      await control('[aria-label="Resize Inspector"]'); await key('Left');
      await wait(`${widths}==='298,298'`, 'keyboard resize');
      await key('Home'); await wait(`${widths}==='288,288'`, 'minimum pane width');
      await key('End'); await wait(`${widths}==='420,420'`, 'maximum pane width');
      await key('Enter'); await wait(`${paneHidden} && ${layout}.inspectorCollapsed && ${focusedLabel}==='Show Inspector'`, 'keyboard collapse');
      await control('[aria-label="Show Inspector"]'); await preset('Write');
      const writeLayout = await evaluate(`JSON.stringify(${layout})`);
      const point = await evaluate("(()=>{const r=document.querySelector('[aria-label=\"Resize Inspector\"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+80)}})()");
      async function drag(cancel) {
        await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
        await wait(`${focusedLabel}==='Resize Inspector'`, 'resize pointer down acknowledged');
        await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x - 74, y: point.y, button: 'left', buttons: 1 });
        await wait("document.querySelector('[aria-label=\"Resize Inspector\"]').getAttribute('aria-valuenow')==='362'", 'resize pointer preview acknowledged');
        if (cancel) await key('Escape');
        await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x - 74, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
      }
      await drag(true); await wait("document.querySelector('[aria-label=\"Resize Inspector\"]').getAttribute('aria-valuenow')==='288'", 'cancelled resize returns to the saved width');
      assert.equal(await evaluate(`JSON.stringify(${layout})`), writeLayout, 'a cancelled resize leaves the saved layout as it was');
      await drag(false); await wait(`${widths}==='362,362'`, 'accepted pointer resize');
      assert.equal(await evaluate("document.querySelector('#workspace-pane-inspector').getBoundingClientRect().width"), 362);
      pass('native arrows/Home/End resize, Enter collapses, pointer drag accepts once and Escape cancels its draft');
      // Focus uses real keyboard dispatch and Escape before the field selection handler.
      await evaluate(`${editor}.setValue('selection','selectedIds',[${state}.project.present.performers[0].id])`);
      await control('[aria-label="Focus field"]'); await wait("!!document.querySelector('.studio--focus')", 'focus mode'); const focused = await measure('focus');
      // The field takes the side panel's room and the whole window width; the top bar, tool strip and set strip give it height.
      assert.ok(focused.fieldHeight > initial.fieldHeight + 80, JSON.stringify(focused)); assert.equal(focused.panel, 0);
      assert.ok(focused.fieldWidth >= initial.fieldWidth + initial.panel - 1 && focused.fieldWidth >= focused.viewport[0] - 1, JSON.stringify([initial, focused]));
      await capture('workspace-focus.png'); await key('Escape'); await wait("!document.querySelector('.studio--focus')", 'Escape restores workspace');
      assert.equal(await evaluate(`${state}.selection.selectedIds.length`), 1);
      await key('F', [process.platform === 'darwin' ? 'meta' : 'control', 'shift']); await wait("!!document.querySelector('.studio--focus')", 'focus keyboard shortcut');
      await control('[aria-label="Exit focus"]'); await wait(`!document.querySelector('.studio--focus') && !${state}.ui.focusMode && ${focusedLabel}==='Project menu'`, 'Exit focus restores the workspace and returns focus to the top bar');
      pass('focus increases field space, preserves selection on Escape and has pointer/keyboard restore');
      // A window too narrow to leave the field its 544 px beside the panel tucks the panel away; opening it over the
      // field never writes the saved layout. The panel is 362 px wide here: 1000 px docks it (638 left), 850 px does not (488).
      const savedLayout = await evaluate(`JSON.stringify(${layout})`);
      const docked = await evaluate(paneHidden);
      // castOverlay: whether Cast shown from its tab docks beside the field (false) or opens over it (true). One rule
      // serves both tabs, so Cast opens over the field exactly where the Inspector is tucked.
      for (const [width, height, zoom, tucked, castOverlay] of [[1000, 700, 1, false, false], [850, 680, 1, true, true], [1366, 768, 2, true, true], [1000, 700, 2, true, true]]) {
        await viewport(width, height, zoom); await measure(`${width}x${height}@${zoom}`);
        assert.equal(await evaluate(paneHidden), tucked, `${width}x${height}@${zoom} ${tucked ? 'tucks' : 'docks'} the side panel`);
        assert.deepEqual(await evaluate(`[!!${overlay},!!${scrim}]`), [false, false], 'a tucked panel leaves no overlay or scrim');
        if (tucked) {
          await control('[aria-label="Show Inspector"]');
          await wait(`!!${overlay} && !!${scrim}`, 'narrow pane overlay');
          await capture(`workspace-${width}-${zoom}.png`); await key('Escape'); await wait(`!${overlay} && ${focusedLabel}==='Show Inspector'`, 'overlay Escape');
          // Its heading button closes a tucked pane without collapsing it or making the layout Custom.
          await control('[aria-label="Show Inspector"]'); await wait(`!!${overlay}`, 'narrow pane overlay again');
          assert.equal(await evaluate(`document.querySelector(${JSON.stringify(closeButton)}).getAttribute('aria-label')`), 'Close Inspector');
          await control(closeButton);
          await wait(`!${overlay} && ${focusedLabel}==='Show Inspector'`, 'heading button closes the overlay');
          // A click on the field around the overlay closes it like Escape and returns focus to Show, without the keyboard
          // focus style (and its help) even when the overlay was opened from the keyboard.
          await key('Tab', ['shift']); await key('Tab'); await wait(`${focusedLabel}==='Show Inspector' && document.activeElement.matches(':focus-visible')`, 'Show reached with Tab');
          await key('Return'); await wait(`!!${overlay}`, 'narrow pane overlay from the keyboard for a click beside it');
          await clickScrim();
          await wait(`!${overlay} && ${focusedLabel}==='Show Inspector'`, 'a click beside the overlay closes it and focuses Show');
          assert.equal(await evaluate("document.activeElement.matches(':focus-visible')"), false, 'a pointer click beside the overlay focuses Show without the keyboard focus style');
          // So does a pointer click on the overlay's Close button after a keyboard open.
          await key('Tab', ['shift']); await key('Tab'); await wait(`${focusedLabel}==='Show Inspector' && document.activeElement.matches(':focus-visible')`, 'Show reached with Tab again');
          await key('Return'); await wait(`!!document.querySelector(${JSON.stringify(closeButton + ':focus-visible')})`, 'narrow pane overlay from the keyboard for its Close button');
          await control(closeButton);
          await wait(`!${overlay} && ${focusedLabel}==='Show Inspector'`, 'a click on Close closes the overlay and focuses Show');
          assert.deepEqual(await evaluate(`[document.activeElement.matches(':focus-visible'), !!document.querySelector('[role=tooltip]')?.textContent.startsWith('Show Inspector')]`), [false, false], 'a pointer click on Close focuses Show without the keyboard focus style or its help');
        } else await capture(`workspace-${width}-${zoom}.png`);
        await showRightPanel(window,'cast');
        await wait("(()=>{const p=document.querySelector('#workspace-pane-cast');return !!p&&!p.hidden&&!p.inert&&p.contains(document.activeElement)})()", 'Cast tab shows Cast with focus inside');
        assert.equal(await evaluate("document.querySelector('#workspace-pane-cast').classList.contains('workspace-pane--overlay')"), castOverlay, `${width}x${height}@${zoom} Cast ${castOverlay ? 'opens over' : 'docks beside'} the field`);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true, 'Cast fits without overflow');
        await capture(`workspace-cast-${width}-${zoom}.png`);
        await showRightPanel(window,'inspector'); await wait(`!${state}.ui.castPanelOpen && !document.querySelector('#workspace-pane-inspector').hidden && document.querySelector('#workspace-pane-inspector').contains(document.activeElement)`, 'Inspector tab returns to the visible Inspector with focus');
        // The panel button explicitly opens a tucked panel. End that requested
        // overlay before the next viewport tests automatic tucking from idle.
        if (await evaluate(`!!${overlay}`)) { await key('Escape'); await wait(`!${overlay}`, 'chosen Inspector overlay dismissed before the next size'); }
        assert.equal(await evaluate(`JSON.stringify(${layout})`), savedLayout, 'auto-tucking and overlays leave the saved layout unchanged');
      }
      await viewport(1366, 768);
      assert.equal(await evaluate(paneHidden), docked, 'the panel docks again when the window grows');
      assert.equal(await evaluate(`JSON.stringify(${layout})`), savedLayout);
      pass('narrow and zoomed windows tuck the side panel, open it over the field (closing with Escape, the heading button or a click beside it), show Cast docked or over the field from its tab, and restore the unchanged saved layout when the window grows');
      await viewport(1000, 700, 2);
      await preset('Write');
      // Start the preview in the same turn as the native reveal click, before
      // its scheduled heading focus. Window bubbling follows React's click handler;
      // a target listener would run before reveal and test a different ordering.
      await evaluate(`window.addEventListener('click',()=>queueMicrotask(()=>${editor}.dispatch('transform.preview',{})),{once:true})`);
      await control('[aria-label="Show Inspector"]');
      await wait(`!!${state}.ui.transformPreview`, 'preview in narrow Inspector overlay');
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Close Inspector\"]').getAttribute('aria-disabled')"), 'true');
      // No scrim hides the preview. The panel opens over the field rather than beside it, and more than 100 px of field
      // stays in view beside it (this window is below the supported minimum; the matrix checks hit-testing at supported sizes).
      assert.deepEqual(await evaluate(`(()=>{const f=document.querySelector('.field-container').getBoundingClientRect(),o=${overlay}.getBoundingClientRect();return [!!${scrim},f.width>100&&o.left-f.left>100]})()`), [false, true], 'preview field stays visible beside the narrow Inspector overlay');
      // Opening a transform focuses its operation select. Leave that native
      // control before asserting the editor's Escape shortcut.
      await wait(`${focusedLabel}==='Transform operation'`, 'preview operation focus');
      await key('Tab', ['shift']);
      await wait(`${focusedLabel}==='Clear selection' && document.activeElement.matches('.workspace-pane--overlay button')`, 'native Shift+Tab to the control before the preview');
      await key('Escape'); await wait(`!${state}.ui.transformPreview`, 'Escape cancels preview before dismissing overlay');
      assert.ok(await evaluate(`!!${overlay}`));
      await key('Escape'); await wait(`!${overlay}`, 'second Escape dismisses overlay');
      pass('narrow overlays preserve preview controls and let Escape cancel the edit before dismissing the panel');
      // Showing a panel the writer had collapsed is the explicit choice the saved layout records: over the field it
      // has the one Close button, which ends the overlay and returns focus to Show without collapsing it again.
      await preset('Rehearse');
      await control('[aria-label="Show Inspector"]'); await wait("!!document.querySelector('#workspace-pane-inspector.workspace-pane--overlay')", 'collapsed Inspector shown over the field');
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(closeButton)}).getAttribute('aria-label')`), 'Close Inspector');
      assert.equal(await evaluate(`${layout}.inspectorCollapsed`), false, 'Show restores the collapsed Inspector in the saved layout');
      await control(closeButton);
      await wait(`!${layout}.inspectorCollapsed && !${overlay} && !${scrim} && ${focusedLabel}==='Show Inspector'`, 'Close ends the overlay of the restored Inspector');
      // The Cast tab restores a collapsed Cast the same way.
      await evaluate(`${editor}.dispatch('layout.update', { update: { castCollapsed: true } })`);
      await showRightPanel(window,'cast'); await wait("!!document.querySelector('#workspace-pane-cast.workspace-pane--overlay')", 'the Cast tab restores the collapsed Cast over the field');
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(closeButton)}).getAttribute('aria-label')`), 'Close Cast');
      assert.equal(await evaluate(`${layout}.castCollapsed`), false, 'the Cast tab restores the collapsed Cast in the saved layout');
      await control(closeButton);
      await wait(`!${layout}.castCollapsed && !${overlay} && !${scrim} && ${focusedLabel}==='Show Cast'`, 'Close ends the overlay of the restored Cast');
      await showRightPanel(window,'inspector'); await wait(`!${state}.ui.castPanelOpen`, 'Design after the restored Cast');
      // A preview shows a collapsed Inspector over the field without a scrim, and without writing the saved layout; that
      // placement ends with the preview, which leaves the Inspector collapsed, the Review preset chosen, no overlay or scrim
      // behind and focus on the field area.
      await preset('Review');
      await evaluate(`${editor}.setValue('selection','selectedIds',[${state}.project.present.performers[0].id]); ${editor}.dispatch('transform.mirror')`);
      await wait(`!!${state}.ui.transformPreview && !!document.querySelector('#workspace-pane-inspector.workspace-pane--overlay') && !${scrim} && ${layout}.inspectorCollapsed`, 'a preview shows the collapsed Inspector over the field, leaving it collapsed in the saved layout');
      await control('[aria-label="Cancel transform"]');
      await wait(`!${state}.ui.transformPreview && document.querySelector('#workspace-pane-inspector').hidden && !${overlay} && !${scrim} && document.activeElement === document.querySelector('.main-workspace .field-container')`, 'the preview\'s Inspector placement ends with it, focus on the field area');
      assert.deepEqual(await evaluate(`(({ preset, setsCollapsed, inspectorCollapsed, castCollapsed }) => ({ preset, setsCollapsed, inspectorCollapsed, castCollapsed }))(${layout})`), { preset: 'review', setsCollapsed: false, inspectorCollapsed: true, castCollapsed: false });
      pass('a panel restored over the field by Show or the Cast tab is restored in the saved layout and closes back to Show; a preview shows a collapsed Inspector over the field only while it runs, leaving the Review preset unchanged');
      // One rule docks the panel for both tabs: at 1024 × 700 @150% the Cast tab opens Cast over the field. Where Cast
      // docks, the tool strip's panel button collapses it with no overlay or scrim in its place and docks it again.
      await viewport(1024, 700, 1.5);
      const castDocked = "(p=>!!p&&!p.hidden&&!p.classList.contains('workspace-pane--overlay'))(document.querySelector('#workspace-pane-cast'))";
      await showRightPanel(window,'cast'); await wait("!!document.querySelector('#workspace-pane-cast.workspace-pane--overlay') && document.querySelector('#workspace-pane-cast').contains(document.activeElement)", 'the Cast tab opens Cast over a field too narrow to dock it');
      await key('Escape'); await wait(`!${overlay} && !${scrim} && !${layout}.castCollapsed && ${focusedLabel}==='Show Cast'`, 'Escape closes Cast over the field without collapsing it');
      await viewport(1024, 700); await wait(castDocked, 'Cast docks where the field keeps its room');
      await control('[aria-label="Collapse Cast"]');
      await wait(`${layout}.castCollapsed && document.querySelector('#workspace-pane-cast').hidden && !document.querySelector('.workspace-pane--overlay, .workspace-overlay-dismiss')`, 'collapsing Cast leaves no overlay or scrim');
      await control('[aria-label="Show Cast"]'); await wait(`!${layout}.castCollapsed && ${castDocked}`, 'showing Cast again docks it');
      await showRightPanel(window,'inspector'); await wait(`!${state}.ui.castPanelOpen`, 'Design after the panel button');
      pass('the Cast tab opens Cast over a field too narrow to dock it; the panel button collapses a docked Cast, with no overlay or scrim, and docks it again');
      await viewport(1366, 768); await preset('Write');
      await showRightPanel(window,'cast');
      await control('[aria-label="Resize Cast"]'); await key('Left', ['shift']);
      await wait(`${widths}==='328,328'`, 'Cast keyboard resize');
      // The separator is the width control: it receives native key events and exposes a precise pixel value.
      const separator = "document.querySelector('[aria-label=\"Resize Cast\"]')";
      await key('Home'); await wait(`${separator}.getAttribute('aria-valuenow')==='288' && ${separator}.getAttribute('aria-valuemin')==='288' && ${separator}.getAttribute('aria-valuemax')==='420'`, 'separator limits');
      for (let i = 0; i < 3; i++) await key('Left');
      await wait(`${widths}==='318,318' && ${separator}.getAttribute('aria-valuenow')==='318' && ${separator}.getAttribute('aria-valuetext').startsWith('318 pixels') && document.querySelector('#workspace-pane-cast').getBoundingClientRect().width===318`, 'separator exposes its pixel width');
      await wait(`${state}.preferences.status==='saved'`, 'durable layout preferences');
      assert.deepEqual(await evaluate(`${state}.project`), original); await capture('workspace-cast.png');
      await control('[aria-label="Focus field"]'); await wait(`${state}.ui.focusMode`, 'leave temporary focus active before process restart');
      pass('The separator supports precise native keyboard input; sizing/presets/focus leave production and undo history unchanged');
    }
    await fs.writeFile(path.join(output, `results${phase ? '-' + phase : ''}.json`), JSON.stringify({ passed: checks, metrics, platform: process.platform }, null, 2));
    app.exit(0);
  } catch (error) { console.error(error); if (window && !window.isDestroyed()) { console.error(await evaluate("({ focus: document.activeElement?.outerHTML.slice(0, 300), panel: document.querySelector('.side-panel')?.outerHTML.slice(0, 300) })").catch(() => null)); await capture('failure.png').catch(() => {}); } app.exit(1); }
});
