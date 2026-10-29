'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--split-transition-manifest=')).slice('--split-transition-manifest='.length));
const { root, output, profile, bundle } = manifest;
const { parseProject, sampleProject, totalCounts, countToSeconds, createPerformanceFixture } = require(bundle);
const savedFile = path.join(output, 'split.squid'), checks = [], layouts = [];
app.disableHardwareAcceleration(); app.setPath('userData', profile);
BrowserWindow.prototype.show = function () {};
dialog.showSaveDialog = async () => ({ canceled: false, filePath: savedFile });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [savedFile] });
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure;
app.on('browser-window-created', (_e, w) => { window = w; w.webContents.setBackgroundThrottling(false); w.webContents.on('render-process-gone', (_e, d) => { failure = new Error(d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const editor = 'window.__splitQA.editor', state = editor + '.getState()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 20000, failure: () => failure });
const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const debug = (method, params = {}) => window.webContents.debugger.sendCommand(method, params);
const named = name => `[aria-label=${JSON.stringify(name)}]`;
const pass = label => { checks.push(label); console.log('PASS '+label); };
function instrument() {
  const qa = window.__splitQA = { editor: null, errors: [] };
  window.addEventListener('error', e => qa.errors.push(e.message)); window.addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) qa.editor = v; visit(f.child); visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function click(selector) {
  await wait(`new Promise(resolve=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||n.getAttribute('aria-disabled')==='true')return resolve(false);n.scrollIntoView({block:'nearest'});requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=n.getBoundingClientRect();window.__splitQA.point={x:r.x+r.width/2,y:r.y+r.height/2};resolve(n.contains(document.elementFromPoint(window.__splitQA.point.x,window.__splitQA.point.y)));}));})`, 'actionable '+selector);
  const point = await evaluate('window.__splitQA.point');
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await debug('Input.dispatchMouseEvent', { type, ...point, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
  await frames();
}
async function type(selector, text) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.select()})()`);
  await debug('Input.insertText', { text: String(text) }); await frames();
}
async function capture(name) {
  await evaluate('document.activeElement?.blur()'); await debug('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await wait("!document.querySelector('.tooltip-panel')", 'dismissed help'); await capturePage(window, output, name);
  layouts.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container').getBoundingClientRect().height,dialogHeight:document.querySelector('dialog[open]')?.getBoundingClientRect().height})`));
}
async function open() {
  await click(named('Split transition')); await wait(`${state}.ui.dialog==='set-split' && document.activeElement?.getAttribute('aria-label')==='Split at move count'`, 'split dialog and focus');
}
const present = () => evaluate(state + '.project.present');
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'window'); await wait("!!document.querySelector('.set-card')", 'renderer');
    window.setContentSize(1366, 768); window.webContents.debugger.attach('1.3'); await debug('Page.enable');
    await debug('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    window.webContents.reload(); await wait(`!!${editor} && ${state}.preferences.status==='saved'`, 'store and preferences');
    await debug('Emulation.setFocusEmulationEnabled', { enabled: true });
    await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)", 'recovery startup');
    const project = parseProject(await fs.readFile(path.join(root,'src/fixtures/schema-v1.squid'),'utf8'));
    project.moves[0].transition = 'linear';
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}}); ${editor}.dispatch('set.select',{index:1}); ${editor}.setValue('preferences','value',{...${state}.preferences.value,inspectorSetOpen:true})`); await frames();
    if (manifest.baseline) { await capture('split-before.png'); app.exit(0); return; }
    await capture('split-after.png'); assert.ok(layouts.at(-1).fieldHeight >= 470);
    await open();
    for (const count of ['0','0.5','16']) {
      await type(named('Split at move count'), count);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(named('Apply transition split'))}).disabled`),true);
      assert.deepEqual(await present(), project);
    }
    await type(named('Split at move count'),'5');
    const expected = sampleProject(project,5).positions;
    const dots = await evaluate("Object.fromEntries([...document.querySelectorAll('.split-fields figure:last-child [data-performer-id]')].map(n=>[n.dataset.performerId,n.getAttribute('transform')]))");
    for (const [id, point] of Object.entries(expected)) assert.equal(dots[id],`translate(${point.x} ${point.y})`);
    await key(window,'Tab'); await key(window,'Right');
    assert.equal(Number(await evaluate(`document.querySelector(${JSON.stringify(named('Compare at move count'))}).value`)),5.01);
    await click(named('Show split picture'));
    assert.equal(Number(await evaluate(`document.querySelector(${JSON.stringify(named('Compare at move count'))}).value`)),5);
    await capture('split-linear.png'); await key(window,'Escape'); await wait(`${state}.ui.dialog===null`, 'Escape cancel');
    assert.deepEqual(await present(),project); assert.equal(await evaluate(state+'.project.past.length'),0);
    pass('native count entry rejects boundaries/fractions, renders every engine-sampled dot, and Escape cancels without history');
    await evaluate('document.activeElement?.blur()'); await key(window,'k',[process.platform==='darwin'?'meta':'control']);
    await type(named('Search commands or drill phrases'),'split transition'); await key(window,'Return');
    await wait(`${state}.ui.dialog==='set-split'`, 'palette split'); await type(named('Split at move count'),'5');
    // Tab from the count input traverses the comparison, preview reset, Cancel and Apply.
    await key(window,'Tab'); await key(window,'Tab'); await key(window,'Tab'); await key(window,'Tab');
    assert.equal(await evaluate('document.activeElement?.getAttribute("aria-label")'),'Apply transition split'); await key(window,'Return');
    await wait(`${state}.project.present.sets.length===4 && ${state}.ui.dialog===null`, 'keyboard apply');
    const accepted = await present(); assert.deepEqual(accepted.sets[1].positions,expected);
    assert.deepEqual(accepted.moves.slice(0,2).map(m=>m.counts),[5,11]); assert.equal(totalCounts(accepted),totalCounts(project));
    assert.equal(countToSeconds(accepted,totalCounts(accepted)),countToSeconds(project,totalCounts(project)));
    assert.equal(await evaluate(state+'.project.past.at(-1).name'),'Split transition · count 5');
    await click(named('Undo')); assert.deepEqual(await present(),project); await click(named('Redo')); assert.deepEqual(await present(),accepted);
    await click(named('Save'));
    await waitFor(async()=>{try{return JSON.stringify(parseProject(await fs.readFile(savedFile,'utf8')))===JSON.stringify(accepted);}catch{return false;}},'native saved split');
    const epoch = await evaluate(state+'.ui.projectEpoch'); await evaluate('document.activeElement?.blur()'); await key(window,'o',[process.platform==='darwin'?'meta':'control']);
    await wait(`${state}.ui.projectEpoch>${epoch}`, 'native reopen'); assert.deepEqual(await present(),accepted);
    pass('palette and native Tab/Enter apply one named undo; native save/reopen retains sampled geometry and split move identities');
    project.moves[0].transition = 'ease'; await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}}); ${editor}.dispatch('playback.scrub',{count:5})`);
    await open(); assert.equal(await evaluate(`document.querySelector(${JSON.stringify(named('Split at move count'))}).value`),'5');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(named('Apply transition split'))}).disabled`),true);
    await click(named('Show largest motion change'));
    const difference = await evaluate("document.querySelector('.split-fields figure:first-child [data-performer-id=a]').getAttribute('transform')!==document.querySelector('.split-fields figure:last-child [data-performer-id=a]').getAttribute('transform')"); assert.equal(difference,true);
    await capture('split-easing-change.png');
    await click(named('Accept easing change')); await type(named('Split at move count'),'6');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(named('Accept easing change'))}).checked`),false);
    await click(named('Accept easing change')); await click(named('Apply transition split'));
    assert.deepEqual((await present()).sets[1].positions,sampleProject(project,6).positions);
    pass('paused playhead seeds the split; eased preview shows the motion change, requires acknowledgment and resets it after count edits');
    const maximum = createPerformanceFixture('maximum'); maximum.sets.pop(); maximum.moves.pop();
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(maximum)}}); ${editor}.dispatch('set.split-open')`);
    await wait("document.querySelectorAll('.split-fields figure:last-child [data-performer-id]').length===500", 'maximum cast preview');
    await click(named('Accept easing change')); await click(named('Apply transition split'));
    await wait(`${state}.project.present.sets.length===128`, 'maximum split'); assert.equal(Object.keys((await present()).sets[1].positions).length,500);
    assert.equal(await evaluate(`${editor}.dispatch('set.split-open')`),false);
    pass('500 performers preview and commit at the final available set slot; the set limit prevents another split');
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}}); ${editor}.dispatch('set.select',{index:1}); ${editor}.dispatch('set.split-open')`);
    for (const theme of ['dark','light','high-contrast']) {
      await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`); await capture(`split-${theme}.png`);
    }
    await click(named('Accept easing change'));
    for (const [width,height,zoom] of [[1120,768,1.25],[1024,720,1.5]]) {
      window.setContentSize(width,height); window.webContents.setZoomFactor(zoom); await settleNativeViewport(window,'split enlarged');
      await evaluate(`document.querySelector(${JSON.stringify(named('Split at move count'))}).focus()`);
      for (let step=0; step<10 && await evaluate('document.activeElement?.getAttribute("aria-label")')!=='Apply transition split'; step++) await key(window,'Tab');
      assert.equal(await evaluate('document.activeElement?.getAttribute("aria-label")'),'Apply transition split'); await frames();
      assert.equal(await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(named('Apply transition split'))}).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()`),true);
      await capture(`split-${width}-${zoom}.png`);
    }
    await key(window,'Escape'); assert.deepEqual(await evaluate('window.__splitQA.errors'),[]);
    pass('all supported themes and 125%/150% narrow layouts keep the split review and actions accessible');
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,layouts,platform:process.platform,localSandboxDisabled:process.env.ELECTRON_DISABLE_SANDBOX==='1'},null,2)); app.exit(0);
  } catch(error) { console.error(error); if(window&&!window.isDestroyed()) await capturePage(window,output,'failure.png').catch(()=>{}); app.exit(1); }
});
