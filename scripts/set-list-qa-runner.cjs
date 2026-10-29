'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const { root, output, profile, bundle } = require(process.argv.find(a => a.startsWith('--set-list-manifest=')).slice('--set-list-manifest='.length));
const { createPerformanceFixture, parseProject, setStartCount } = require(bundle);
const savedFile = path.join(output, 'reordered.squid'), checks = [], layouts = [], errors = [];
app.disableHardwareAcceleration(); app.setPath('userData', profile);
BrowserWindow.prototype.show = function () {};
dialog.showSaveDialog = async () => ({ canceled: false, filePath: savedFile });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [savedFile] });
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure;
app.on('browser-window-created', (_e, w) => {
  window = w; w.webContents.setBackgroundThrottling(false);
  w.webContents.on('console-message', d => { if (d.level === 'error') errors.push(d.message); });
  w.webContents.on('render-process-gone', (_e, d) => { failure = new Error(d.reason); });
});
require(path.join(root, 'electron/main.cjs'));
const evaluate = s => window.webContents.executeJavaScript(s);
const editor = 'window.__setListQA.editor', state = editor + '.getState()';
const wait = (s, label) => waitFor(() => evaluate(s), label, { timeoutMs: 20000, failure: () => failure });
const debug = (method, params = {}) => window.webContents.debugger.sendCommand(method, params);
const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  window.__setListQA = { editor: null, errors: [] };
  window.addEventListener('error', e => window.__setListQA.errors.push(e.message));
  window.addEventListener('unhandledrejection', e => window.__setListQA.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { const visit = f => { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) window.__setListQA.editor = v; visit(f.child); visit(f.sibling); }; visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function point(selector) {
  await debug('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await wait(`new Promise(resolve=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.getAttribute('aria-disabled')==='true')return resolve(false);n.scrollIntoView({block:'nearest'});requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=n.getBoundingClientRect();window.__setListQA.point={x:r.x+r.width/2,y:r.y+r.height/2};resolve(n.contains(document.elementFromPoint(window.__setListQA.point.x,window.__setListQA.point.y)));}));})`, 'actionable ' + selector);
  return evaluate('window.__setListQA.point');
}
async function click(selector) {
  const p = await point(selector);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await debug('Input.dispatchMouseEvent', { type, ...p, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
  await frames();
}
async function type(selector, value) {
  await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.focus();n.select()})()`);
  await debug('Input.insertText', { text: String(value) });
  await wait(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});return document.activeElement===n&&n.value===${JSON.stringify(String(value))}})()`, 'observed native input '+selector); await frames();
}
const named = s => `[aria-label=${JSON.stringify(s)}]`;
const row = id => `[data-set-id=${JSON.stringify(id)}]`;
async function capture(name) {
  await evaluate('document.activeElement?.blur()'); await debug('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await wait("!document.querySelector('.tooltip-panel')", 'dismissed help'); await capturePage(window, output, name);
}
async function visibleCurrent() {
  await wait("(()=>{const n=document.querySelector('.set-card[aria-current]'),s=document.querySelector('.set-list');if(!n)return false;const a=n.getBoundingClientRect(),b=s.getBoundingClientRect();return a.top>=b.top-.5&&a.bottom<=b.bottom+.5})()", 'revealed current set');
}
async function dragRow(fromId, toId) {
  const source = await point(row(fromId)), target = await point(row(toId));
  let intercepted;
  const handler = (_e, method, params) => { if (method === 'Input.dragIntercepted') intercepted = params.data; };
  window.webContents.debugger.on('message', handler);
  await debug('Input.setInterceptDrags', { enabled: true });
  try {
    await debug('Input.dispatchMouseEvent', { type: 'mouseMoved', ...source });
    await debug('Input.dispatchMouseEvent', { type: 'mousePressed', ...source, button: 'left', buttons: 1, clickCount: 1 });
    await debug('Input.dispatchMouseEvent', { type: 'mouseMoved', x: source.x + 12, y: source.y + 12, button: 'left', buttons: 1 });
    await debug('Input.dispatchMouseEvent', { type: 'mouseMoved', ...target, button: 'left', buttons: 1 });
    await waitFor(() => !!intercepted, 'native intercepted set drag');
    assert.ok(intercepted.items.some(item => item.mimeType === 'application/x-squidware-set'));
    for (const type of ['dragEnter', 'dragOver', 'drop']) await debug('Input.dispatchDragEvent', { type, ...target, data: intercepted });
    await debug('Input.dispatchMouseEvent', { type: 'mouseReleased', ...target, button: 'left', buttons: 0, clickCount: 1 });
  } finally { await debug('Input.setInterceptDrags', { enabled: false }); window.webContents.debugger.off('message', handler); }
  await frames();
}
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'window'); await wait("!!document.querySelector('.field-stage__svg')", 'renderer');
    window.setContentSize(1366, 768); window.webContents.setZoomFactor(1); await settleNativeViewport(window, 'set list reference');
    window.webContents.debugger.attach('1.3'); await debug('Page.enable');
    await debug('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` }); window.webContents.reload();
    await wait(`!!${editor} && ${state}.preferences.status==='saved'`, 'store and preferences');
    await wait("['Recovery ready','Recovery copies available'].includes(document.querySelector('.recovery-indicator')?.textContent)", 'recovery startup');
    await evaluate(`${editor}.setValue('ui','dialog',null)`); await debug('Emulation.setFocusEmulationEnabled', { enabled: true });
    const maximum = parseProject(JSON.stringify(createPerformanceFixture('maximum')));
    maximum.sets[39].name = 'Ballad arrival'; maximum.sets[99].name = 'Ballad reprise';
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(maximum)}})`);
    await wait("document.querySelectorAll('.set-card').length===128", 'maximum compact list');
    assert.equal(await evaluate("document.querySelectorAll('.mini-field').length"), 0);
    const reference = await evaluate("({width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container').getBoundingClientRect().height,rowHeight:document.querySelector('.set-card').getBoundingClientRect().height,add:document.querySelectorAll('.set-panel [aria-label=\"Add set\"]').length})");
    assert.equal(reference.width, 1366); assert.equal(reference.height, 768); assert.ok(reference.fieldHeight >= 470); assert.equal(reference.rowHeight, 32); assert.equal(reference.add, 1); layouts.push({ name: 'reference', ...reference }); await capture('set-list-compact.png');
    await type(named('Find set'), '040'); await key(window, 'Return'); await wait(`${state}.selection.activeIndex===39`, 'number jump'); await visibleCurrent();
    assert.equal(await evaluate("document.querySelectorAll('.set-card').length"), 1);
    await type(named('Find set'), 'ballad'); assert.equal(await evaluate("document.querySelectorAll('.set-card').length"), 2); await capture('set-list-search.png'); await evaluate("document.querySelector('[aria-label=\"Find set\"]').focus()");
    await key(window, 'Return'); await key(window, 'End'); await wait(`${state}.selection.activeIndex===99`, 'filtered End'); await visibleCurrent();
    await key(window, 'Home'); await wait(`${state}.selection.activeIndex===39`, 'filtered Home');
    await type(named('Find set'), 'not found'); assert.equal(await evaluate("document.querySelectorAll('.set-card').length"), 0); await capture('set-list-empty.png'); await evaluate("document.querySelector('[aria-label=\"Find set\"]').focus()");
    await key(window, 'Escape'); await wait("document.querySelectorAll('.set-card').length===128", 'escape clears search'); await visibleCurrent();
    await wait("document.activeElement.matches('.set-card[aria-current]')", 'Escape restores current-row focus');
    // A user can leave search before its deferred focus restoration runs.
    await evaluate("(()=>{const n=document.querySelector('[aria-label=\"Find set\"]');n.focus();n.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('[aria-label=\"Move current set to position\"]').focus()})()"); await frames();
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), 'Move current set to position');
    assert.equal(await evaluate(`${state}.project.past.length`), 0);
    pass('128-set number/name navigation, filtered Home/End, no-match recovery and current-row reveal create no history');
    await type(named('Move current set to position'), '12'); await wait("document.querySelector('[aria-label=\"Move set to position\"]').getAttribute('aria-disabled')!=='true'", 'direct reorder ready'); await key(window, 'Return');
    await wait(`${state}.project.present.sets[11].id===${JSON.stringify(maximum.sets[39].id)} && ${state}.project.past.length===1`, 'single direct reorder');
    let accepted = await evaluate(state + '.project.present'); assert.equal(await evaluate(`${state}.selection.activeIndex`), 11); assert.equal(await evaluate(`${state}.playback.count`), setStartCount(accepted, 11)); await visibleCurrent(); await capture('set-list-reordered.png');
    await evaluate(`${editor}.dispatch('history.undo')`); await wait(`${state}.selection.activeIndex===39`, 'undo retains identity'); assert.deepEqual(await evaluate(state + '.project.present'), maximum);
    await evaluate(`${editor}.dispatch('history.redo')`); await wait(`${state}.selection.activeIndex===11`, 'redo retains identity'); assert.deepEqual(await evaluate(state + '.project.present'), accepted);
    await type(named('Move current set to position'), '999'); assert.equal(await evaluate("document.querySelector('[aria-label=\"Move set to position\"]').getAttribute('aria-disabled')"), 'true'); assert.match(await evaluate("document.querySelector('.set-order-note').textContent"), /whole position/);
    await key(window, 'Return'); assert.equal(await evaluate(`${state}.project.past.length`), 1);
    await type(named('Move current set to position'), '12');
    pass('set 40 moves to position 12 in one named undo; undo/redo preserve active identity and invalid positions cannot commit');
    await evaluate(`${editor}.dispatch('file.save-as')`); await wait(`${state}.fileSession.saveStatus==='Project file saved'`, 'saved native reordered show');
    assert.deepEqual(parseProject(await fs.readFile(savedFile, 'utf8')), accepted);
    await evaluate(`${editor}.dispatch('file.open')`); await wait(`${state}.project.past.length===0`, 'native reopen'); assert.deepEqual(await evaluate(state + '.project.present'), accepted);
    await click(named('Show set thumbnails')); await wait(`${state}.preferences.value.setThumbnails && ${state}.preferences.status==='saved'`, 'saved thumbnail preference'); assert.equal(await evaluate("document.querySelectorAll('.mini-field').length"), 128);
    assert.equal(await evaluate('(async()=> (await window.squidware.readPreferences()).preferences.setThumbnails)()'), true);
    assert.equal(await evaluate(`${state}.project.past.length`), 0); await capture('set-list-thumbnails.png');
    await click(named('Show set thumbnails')); await wait("document.querySelectorAll('.mini-field').length===0", 'compact restored');
    pass('native save/reopen preserves all reordered data; optional thumbnails persist as personal preferences without a project edit');
    const small = parseProject(JSON.stringify(createPerformanceFixture('demo')));
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(small)}});${editor}.dispatch('set.select',{index:1})`); await frames();
    await dragRow(small.sets[2].id, small.sets[4].id);
    await wait(`${state}.project.present.sets[4].id===${JSON.stringify(small.sets[2].id)}`, 'native drag drop');
    assert.equal(await evaluate(`${state}.project.past.length`), 1); assert.equal(await evaluate(`${state}.selection.activeIndex`), 1);
    await evaluate(`${editor}.dispatch('history.undo')`); assert.deepEqual(await evaluate(state + '.project.present'), small);
    await evaluate(`document.querySelector(${JSON.stringify(row(small.sets[1].id))}).focus()`); await key(window, 'Down', ['alt']); await wait(`${state}.selection.activeIndex===2 && ${state}.project.present.sets[2].id===${JSON.stringify(small.sets[1].id)}`, 'keyboard reorder');
    assert.equal(await evaluate(`${state}.project.past.length`), 1); await evaluate(`${editor}.dispatch('history.undo')`);
    pass('native pointer drag and Alt+Down use atomic reorder while preserving active set identity');
    for (const theme of ['dark', 'light', 'high-contrast']) {
      await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`); await frames(); await capture('set-list-' + theme + '.png');
    }
    for (const [width, height, zoom] of [[1120,768,1.25],[1024,720,1.5]]) {
      window.setContentSize(width, height); window.webContents.setZoomFactor(zoom); await settleNativeViewport(window, 'set list enlarged');
      if (await evaluate("!!document.querySelector('[aria-label=\"Show Set list\"]') && !document.querySelector('.set-panel')?.getBoundingClientRect().width")) await click(named('Show Set list'));
      const metrics = await evaluate("(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}};return {viewport:{width:innerWidth,height:innerHeight},list:rect('.set-list'),search:rect('[aria-label=\"Find set\"]'),move:rect('[aria-label=\"Move current set to position\"]'),add:rect('.set-panel [aria-label=\"Add set\"]')}})()");
      for (const r of [metrics.search, metrics.move, metrics.add]) assert.ok(r.top>=0&&r.bottom<=metrics.viewport.height+.5&&r.left>=0&&r.right<=metrics.viewport.width+.5, JSON.stringify(metrics));
      assert.ok(metrics.list.height >= 64); layouts.push({ width, height, zoom, ...metrics }); await capture(`set-list-${width}-${zoom}.png`);
    }
    pass('supported themes and enlarged narrow layouts retain search, reorder, rows and the single Add control');
    assert.deepEqual(errors, []); assert.deepEqual(await evaluate('window.__setListQA.errors'), []);
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: checks, layouts, platform: process.platform }, null, 2)); app.exit(0);
  } catch (error) { console.error(error); console.error('Set-list diagnostic',await evaluate("({focus:document.activeElement?.outerHTML.slice(0,300),position:document.querySelector('#set-order-position')?.value,query:document.querySelector('[aria-label=\"Find set\"]')?.value,moveDisabled:document.querySelector('[aria-label=\"Move set to position\"]')?.getAttribute('aria-disabled'),active:window.__setListQA?.editor?.getState().selection.activeIndex,history:window.__setListQA?.editor?.getState().project.past.length})").catch(()=>null)); if (window && !window.isDestroyed()) await capturePage(window, output, 'failure.png').catch(() => {}); app.exit(1); }
});
