'use strict';
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
  await wait(`new Promise(resolve=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n || n.disabled || n.getAttribute('aria-disabled')==='true' || !n.getClientRects().length){resolve(false);return;}n.scrollIntoView({block:'nearest'});requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=n.getBoundingClientRect();window.__workspacePoint={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};resolve(n.contains(document.elementFromPoint(window.__workspacePoint.x,window.__workspacePoint.y)));}));})`, 'actionable ' + selector);
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  const point = await evaluate('window.__workspacePoint');
  await evaluate(`window.__workspaceClick=null;window.__workspaceExpected=document.querySelector(${JSON.stringify(selector)});document.addEventListener('click',e=>{window.__workspaceClick=e.target},{once:true,capture:true})`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
  await wait('!!window.__workspaceClick', 'native click ' + selector);
  assert.ok(await evaluate('window.__workspaceExpected.contains(window.__workspaceClick)'), selector + ' receives native input');
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
async function preset(name) {
  await control('[aria-label="Workspace layout"]'); await control(`[aria-label="${name} preset"]`);
  await control('[aria-label="Close layout options"]');
  await wait(`${state}.preferences.value.workspaceLayout.preset==='${name.toLowerCase()}'`, name + ' preset applied');
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
      for (const [width, height, zoom] of [[1000, 700, 1], [850, 680, 1], [1366, 768, 2], [1000, 700, 2]]) {
        await viewport(width, height, zoom); await measure(`${width}x${height}@${zoom}`);
        const hiddenPane = await evaluate("document.querySelector('#workspace-pane-sets').hidden ? 'Set list' : document.querySelector('#workspace-pane-inspector').hidden ? 'Inspector' : null");
        if (hiddenPane) {
          await control(`[aria-label="Show ${hiddenPane}"]`);
          await wait("!!document.querySelector('.workspace-pane--overlay')", 'narrow pane overlay');
          await capture(`workspace-${width}-${zoom}.png`); await key('Escape'); await wait("!document.querySelector('.workspace-pane--overlay')", 'overlay Escape');
        } else await capture(`workspace-${width}-${zoom}.png`);
      }
      await preset('Write');
      await control('[aria-label="Show Inspector"]');
      await control('[aria-label="Rotate selection"]'); await wait(`!!${state}.ui.transformPreview`, 'preview in narrow Inspector overlay');
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Collapse Inspector\"]').getAttribute('aria-disabled')"), 'true');
      // Opening a transform focuses its operation select. Leave that native
      // control before asserting the editor's Escape shortcut.
      await wait("document.activeElement.getAttribute('aria-label')==='Transform operation'", 'preview operation focus');
      await key('Tab', ['shift']);
      await wait("document.activeElement.getAttribute('aria-label')==='Cancel transform'", 'native Shift+Tab to preview action');
      await key('Escape'); await wait(`!${state}.ui.transformPreview`, 'Escape cancels preview before dismissing overlay');
      assert.ok(await evaluate("!!document.querySelector('.workspace-pane--overlay')"));
      await key('Escape'); await wait("!document.querySelector('.workspace-pane--overlay')", 'second Escape dismisses overlay');
      pass('narrow overlays preserve preview controls and let Escape cancel the edit before dismissing the panel');
      await viewport(1366, 768); await preset('Write');
      await control('.workspace-tab[aria-label="Cast"]');
      await control('[aria-label="Resize Cast"]'); await key('Left', ['shift']);
      await wait(`${state}.preferences.value.workspaceLayout.castWidth===340`, 'Cast keyboard resize');
      await control('[aria-label="Workspace layout"]');
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
