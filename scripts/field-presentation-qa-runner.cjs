'use strict';
const { capturePage, key: sendKey, waitFor: waitUntil } = require('./testing/renderer.cjs');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'); const path = require('node:path'); const assert = require('node:assert/strict');
const { root, output, profile, fixture, baseline } = require(process.argv.find(arg => arg.startsWith('--field-manifest=')).slice('--field-manifest='.length));
app.disableHardwareAcceleration();
app.setPath('userData', profile);
BrowserWindow.prototype.show = function () {};
dialog.showMessageBox = async () => ({ response: 1 });
let window; const checks = [];
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); });
require(path.join(root, 'electron/main.cjs'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => window.webContents.executeJavaScript(source);
const editor = 'window.__fieldQA.editor'; const state = editor + '.getState()';
const wait = (source, label) => waitUntil(() => evaluate(source), label, { timeoutMs: 20000 });
function instrument() {
  window.__fieldQA = { editor: null };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(fiber) { if (!fiber) return; const value = fiber.memoizedProps?.value; if (value?.getState && value?.dispatch) window.__fieldQA.editor = value; visit(fiber.child); visit(fiber.sibling); } visit(root.current); },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
const capture = name => capturePage(window, output, name);
const pass = label => { checks.push(label); console.log('PASS '+label); };
const input = (type, point, extra = {}) => {
  // sendInputEvent also works with hidden software-composited windows, where
  // DevTools' mouse acknowledgement can wait indefinitely for a visible frame.
  const types = { mouseMoved: 'mouseMove', mousePressed: 'mouseDown', mouseReleased: 'mouseUp' };
  window.webContents.sendInputEvent({ type:types[type], x:Math.round(point.x), y:Math.round(point.y), ...extra, modifiers:extra.modifiers ? ['shift'] : [] });
};
async function click(point, modifiers = 0) { await input('mouseMoved', point); await input('mousePressed', point, { button: 'left', clickCount: 1, modifiers }); await input('mouseReleased', point, { button: 'left', clickCount: 1, modifiers }); }
const key = (keyCode, modifiers = []) => sendKey(window, keyCode, modifiers, 20);
const center = id => evaluate(`(() => { const n = [...document.querySelectorAll('.field-performer')].find(n=>n.dataset.performerId===${JSON.stringify(id)}); const p = new DOMPoint(0,0).matrixTransform(n.getScreenCTM()); return {x:p.x,y:p.y}; })()`);
async function selected(id) { await wait(`${state}.selection.selectedIds.length===1 && ${state}.selection.selectedIds[0]===${JSON.stringify(id)}`, 'selected '+id); }
async function assertLabels() {
  const result = await evaluate(`(() => {
    const box = n => { const r=n.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}; };
    const labels=[...document.querySelectorAll('[data-performer-label]')].map(box);
    const dots=[...document.querySelectorAll('.field-dot')].map(box); const viewport=box(document.querySelector('.field-stage__svg'));
    const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    return {count:labels.length, collisions:labels.flatMap((a,i)=>labels.slice(i+1).filter(b=>overlap(a,b))).length,
      dotCollisions:labels.flatMap(a=>dots.filter(b=>overlap(a,b))).length,
      clipped:labels.filter(a=>a.left<viewport.left||a.right>viewport.right||a.top<viewport.top||a.bottom>viewport.bottom).length,
      sizes:[...document.querySelectorAll('[data-performer-label]')].map(n=>Number(n.getAttribute('font-size'))*n.getScreenCTM().a),dpr:devicePixelRatio};
  })()`);
  assert.ok(result.count > 0); assert.equal(result.collisions, 0); assert.equal(result.dotCollisions, 0); assert.equal(result.clipped, 0);
  // Fractional desktop scaling can round emulated viewport dimensions subpixel-wise.
  assert.ok(result.sizes.every(size => Math.abs(size-12)<.1), JSON.stringify({sizes:result.sizes.slice(0,4),dpr:result.dpr}));
}

app.whenReady().then(async () => {
  try {
    while (!window) await pause(20);
    await wait("!!document.querySelector('.field-performer')", 'renderer');
    window.setContentSize(1366, 768); window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    window.webContents.reload(); await wait(`!!${editor}`, 'store');
    const content = await fs.readFile(fixture, 'utf8');
    await evaluate(`${editor}.dispatch('project.load', {project:JSON.parse(${JSON.stringify(content)})}); ${editor}.setValue('ui','dialog',null)`);
    await wait("document.querySelectorAll('.field-performer').length===500", 'dense block'); await pause(200);
    const baselineViewport = await evaluate("(() => {const field=document.querySelector('.field-stage__svg').getBoundingClientRect(); return {width:innerWidth,height:innerHeight,devicePixelRatio,fieldWidth:field.width,fieldHeight:field.height};})()");
    await capture('dense-1366.png');
    if (baseline) {  app.exit(0); return; }
    const project = await evaluate(state+'.project.present'); const ids = project.performers.map(p=>p.id);
    const positions = project.sets[0].positions; const originalRevision = await evaluate(state+'.project.revision');
    // Native Chromium mouse input, rather than dispatching DOM pointer events.
    const block = ids.filter((_,i)=>i%25<8 && Math.floor(i/25)<8 && i>0);
    for (const id of block) { await click(await center(id)); await selected(id); }
    pass('every distinct center in an 8x8 two-step block is mouse-selectable within the 500-performer cast');
    for (const zoom of [.6, 1, 3]) {
      await evaluate(`${editor}.setValue('ui','zoom',${zoom}); ${editor}.setValue('ui','fitVersion',${zoom})`); await pause(80);
      for (const id of [ids[212],ids[213],ids[237],ids[238]]) { await click(await center(id)); await selected(id); }
      const radius = await evaluate("(() => {const n=document.querySelector('.field-dot');return Number(n.getAttribute('r'))*n.getScreenCTM().a})()");
      assert.ok(Math.abs(radius-3)<.01); await assertLabels();
    }
    pass('nearest selection, 6px dots and 12px collision-free labels work at 60%, 100% and 300% zoom');
    await evaluate(`${editor}.setValue('ui','zoom',1); ${editor}.setValue('ui','fitVersion',5)`); await pause(100);
    const tied = await center(ids[0]);
    for (const id of [ids[0],ids.at(-2),ids.at(-1),ids[0]]) { await click(tied); await selected(id); }
    pass('repeated native clicks cycle coincident dots in stable ID order');
    assert.equal(await evaluate(state+'.project.revision'), originalRevision);
    const reordered = { ...project, performers:[...project.performers].reverse() };
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(reordered)}})`); await pause(100);
    const reloadedRevision = await evaluate(state+'.project.revision');
    for (const id of [ids[212],ids[213]]) { await click(await center(id)); await selected(id); }
    await click(await center(ids[0])); await selected(ids[0]);
    pass('reversing the roster preserves nearest and initial tied hit results');
    await window.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:true});
    const touch = await center(ids[212]);
    for (const type of ['touchStart','touchEnd']) await window.webContents.debugger.sendCommand('Input.dispatchTouchEvent',{type,touchPoints:type==='touchStart'?[{x:touch.x,y:touch.y,radiusX:12,radiusY:12}]:[]});
    await selected(ids[212]);
    await window.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:false});
    pass('Chromium touch input selects the nearest dense-field dot');
    await input('mouseMoved',await center(ids[213])); await wait("document.querySelector('.field-readout strong')?.textContent.startsWith('P214 ')", 'nearest hover readout');
    const button = '[aria-label="Show performer labels"]';
    await evaluate(`${editor}.setValue('selection','selectedIds',[${JSON.stringify(ids[25])}]); document.querySelector(${JSON.stringify(button)}).focus()`);
    await key('Return');
    await wait(`${state}.ui.selectionLabelsOnly && ${state}.ui.showLabels`, 'selected label mode');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-performer-label]')].map(n=>n.getAttribute('data-performer-label'))"),[ids[25]]);
    await key('Return'); await wait("!document.querySelector('[data-performer-label]')", 'hidden labels');
    await key('Return'); await wait(`${state}.ui.showLabels && !${state}.ui.selectionLabelsOnly`, 'all labels');
    await assertLabels(); pass('the existing keyboard-accessible label button cycles all / selected-focus / hidden; hover uses the same nearest hit');
    assert.deepEqual(await evaluate(state+'.project.present.sets[0].positions'), positions);
    assert.equal(await evaluate(state+'.project.revision'), reloadedRevision);
    pass('pointer selection, labels and zoom preserve physical coordinates and edit revision');
    await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:2,mobile:false}); await pause(100);
    await assertLabels(); await click(await center(ids[237])); await selected(ids[237]); await capture('dense-dpi2.png');
    await window.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
    window.webContents.setZoomFactor(1.25); await pause(100); await assertLabels(); await capture('enlarged-125.png');
    window.webContents.setZoomFactor(1); window.setContentSize(1024,768); await pause(100); await assertLabels(); await capture('narrow-1024.png');
    const narrowViewport = await evaluate('({width:innerWidth,height:innerHeight})');
    pass('labels remain readable without overlaps at 2x DPI, 125% UI zoom and the minimum supported window size');
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: checks, baselineViewport, narrowViewport, platform:process.platform, rendererNodeAccess:await evaluate('typeof window.require') }, null, 2));
     app.exit(0);
  } catch (error) {  console.error(error); if (window && !window.isDestroyed()) await capture('failure.png').catch(() => {}); app.exit(1); }
});
