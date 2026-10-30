'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key: sendKey, waitFor, settleNativeViewport, selectNativeOption } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--paths-manifest=')).slice('--paths-manifest='.length));
const { root, output, profile, bundle } = manifest;
const { fixture, parseProject, sampleProject } = require(bundle);
const savedFile = path.join(output, 'created.squid');
let exportDestination = null;
app.disableHardwareAcceleration(); app.setPath('userData', profile);
// Match the editor suite's fixed-size layout capture. A visible macOS window
// can be constrained by the runner's Dock/menu bar before the 768px assertion.
const showWindow = BrowserWindow.prototype.show;
BrowserWindow.prototype.show = function () {};
dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportDestination ?? savedFile });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [savedFile] });
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure; const checks = [], viewports = [];
app.on('browser-window-created', (_e, w) => { window = w; w.webContents.setBackgroundThrottling(false); w.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message); }); w.webContents.on('render-process-gone', (_e, d) => { failure = new Error(d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = async source => { try { return await window.webContents.executeJavaScript(source); } catch(error) { console.error('Renderer probe failed: '+source.slice(0,300)); throw error; } };
const editor = 'window.__pathsQA.editor', state = editor + '.getState()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 20000, failure: () => failure });
const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const key = async (...args) => { await sendKey(...args); await frames(); };
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  const qa = window.__pathsQA = { editor: null, errors: [] };
  window.addEventListener('error', e => qa.errors.push(e.message));
  window.addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, r) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) qa.editor = v; visit(f.child); visit(f.sibling); } visit(r.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function click(selector) {
  const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e) throw Error('Missing '+${JSON.stringify(selector)}); e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
  await frames();
}
const button = name => `[aria-label=${JSON.stringify(name)}]`;
async function type(selector, text) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.select();})()`);
  await window.webContents.debugger.sendCommand('Input.insertText', { text: String(text) }); await frames();
}
async function capture(name) {
  await evaluate(`${editor}.setValue('ui','toast',''); document.activeElement?.blur()`);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await capturePage(window, output, name);
  viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container')?.getBoundingClientRect().height,dialogHeight:document.querySelector('dialog[open]')?.getBoundingClientRect().height})`));
}
const present = () => evaluate(state + '.project.present');
const apply = '[aria-label="Apply performer path"]';
async function openPath() {
  await evaluate('document.activeElement?.blur()');
  await click(button('Edit performer path'));
  await wait(`${state}.ui.dialog==='path'`, 'path editor');
}
async function fillCurve() {
  await selectNativeOption(window, '[aria-label="Travel geometry"]', 'cubic');
  for (const [name, value] of [['Control 1 X',10],['Control 1 Y',30],['Control 2 X',30],['Control 2 Y',30]]) await type(button(name),value);
}
app.whenReady().then(async () => {
 try {
  await waitFor(() => !!window, 'window'); await wait("!!document.querySelector('.set-card')", 'renderer');
  window.setContentSize(1366,768); window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Page.enable');
  await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});
  window.webContents.reload(); await wait(`!!${editor}&&${state}.preferences.status==='saved'`, 'store');
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)", 'recovery');
  const p=fixture();
  await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(p)}});${editor}.dispatch('workspace.show',{workspace:'design'});${editor}.dispatch('set.select',{index:1})`); await frames();
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(button('Edit performer path'))}).getAttribute('aria-disabled')`),'true');
  BrowserWindow.prototype.show=showWindow;window.show();window.focus();await settleNativeViewport(window,'visible paths');
  await click('[data-performer-id="a"]');
  assert.deepEqual(await evaluate(state+'.selection.selectedIds'),['a']);
  await capture('paths-before.png');assert.ok(viewports.at(-1).fieldHeight>=470,JSON.stringify(viewports.at(-1)));
  await openPath();await fillCurve();await capture('paths-preview.png');
  assert.match(await evaluate("document.querySelector('[aria-label=\"Path preview position\"]').textContent"),/X 20.000, Y 26.250/);
  assert.deepEqual(await present(),p);assert.equal(await evaluate(state+'.project.past.length'),0);
  await type(button('Control 1 X'),-1);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(apply)}).getAttribute('aria-disabled')`),'true');
  assert.match(await evaluate("document.querySelector('.path-panel [role=alert]').textContent"),/control1.x/);
  await capture('paths-invalid.png');await key(window,'Escape');await wait(`${state}.ui.dialog===null`,'cancel');
  assert.deepEqual(await present(),p);assert.equal(await evaluate(state+'.ui.pendingDraft'),false);
  pass('native selection, numeric preview, known cubic midpoint, invalid controls and Escape leave history untouched');
  await openPath();await fillCurve();await click(apply);await wait(`${state}.ui.dialog===null`,'applied');
  const curved=await present();assert.equal(curved.moves[0].paths.a.segments[0].kind,'cubic');assert.deepEqual(curved.sets,p.sets);
  assert.equal(await evaluate(state+'.project.past.length'),1);
  await wait("document.querySelector('[data-analysis-status=error]')?.textContent.includes('has not been checked')",'curved analysis unavailable');
  await evaluate(`${editor}.dispatch('history.undo')`);assert.deepEqual(await present(),p);
  await evaluate(`${editor}.dispatch('history.redo')`);assert.deepEqual(await present(),curved);
  await evaluate(`${editor}.dispatch('playback.scrub',{count:8})`);await frames();
  const expected=sampleProject(curved,8).positions.a;
  assert.equal(await evaluate("document.querySelector('.field-stage__svg [data-performer-id=a]').getAttribute('transform')"),`translate(${expected.x} ${expected.y})`);
  await evaluate(`${editor}.dispatch('set.select',{index:1});${editor}.dispatch('display.paths')`);await frames();
  assert.equal(await evaluate("document.querySelector('[data-neighbor-path]').getAttribute('d')"),'M 10 10 C 10 30 30 30 30 20');
  await capture('paths-applied.png');
  pass('one undo/redo transaction, shared scrub geometry, exact vector neighbor curve and explicit unavailable analysis');
  await evaluate(`${editor}.dispatch('file.save')`);await wait(`${state}.fileSession.savedRevision===${state}.project.revision`,'native save');
  assert.equal(JSON.parse(await fs.readFile(savedFile,'utf8')).schemaVersion,5);
  assert.deepEqual(parseProject(await fs.readFile(savedFile,'utf8')),curved);
  await evaluate(`${editor}.dispatch('file.open')`);await wait(`${state}.project.present.moves[0].paths.a?.segments[0].kind==='cubic'&&${state}.project.past.length===0`,'reopen curve');
  assert.deepEqual(await present(),curved);
  exportDestination=path.join(output,'curved.csv');
  await evaluate(`${editor}.dispatch('file.export')`);await frames();await click('.export-secondary button');
  await wait(`${state}.ui.dialog===null`,'CSV export');
  const csv=await fs.readFile(exportDestination,'utf8');assert.match(csv,/Curved path/);
  exportDestination=path.join(output,'curved.pdf');
  await evaluate(`${editor}.dispatch('file.export')`);await frames();await click('.export-options label:nth-child(2)');await click('.export-pdf');
  await wait(`${state}.ui.toast==='PDF saved'`,'curved PDF export');
  assert.ok((await fs.stat(exportDestination)).size>1000);exportDestination=null;
  pass('native coordinate CSV and PDF exports use curved move descriptions');
  await evaluate(`${editor}.dispatch('set.select',{index:1});${editor}.setValue('selection','selectedIds',['a'])`);await frames();
  for(const theme of ['dark','light','high-contrast']) {
    await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);
    await openPath();await capture(`paths-${theme}.png`);await key(window,'Escape');await wait(`${state}.ui.dialog===null`,'theme cancel');
  }
  window.setContentSize(1024,720);window.webContents.setZoomFactor(1.5);await settleNativeViewport(window,'enlarged paths');
  await openPath();await type(button('Control 1 Y'),31);
  await evaluate(`document.querySelector(${JSON.stringify(apply)}).focus()`);await capture('paths-enlarged.png');
  assert.equal(await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(apply)}).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()`),true);
  await evaluate(`document.querySelector(${JSON.stringify(apply)}).focus()`);await key(window,'Return');await wait(`${state}.ui.dialog===null`,'keyboard apply');
  assert.equal((await present()).moves[0].paths.a.segments[0].control1.y,31);
  pass('native v5 save/reopen, supported themes and narrow 150% view retain reachable keyboard Apply');
  assert.deepEqual(await evaluate('window.__pathsQA.errors'),[]);
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,source:manifest.source,scope:manifest.scope},null,2));app.exit(0);
 } catch(error) { console.error(error);await fs.writeFile(path.join(output,'failure.txt'),error.stack);if(window)await capturePage(window,output,'failure.png').catch(()=>{});app.exit(1); }
});
