'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key: sendKey, waitFor, settleNativeViewport, selectNativeOption } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--path-operations-manifest=')).slice('--path-operations-manifest='.length));
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
const editor = 'window.__pathopsQA.editor', state = editor + '.getState()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 20000, failure: () => failure });
const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const key = async (...args) => { await sendKey(...args); await frames(); };
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  const qa = window.__pathopsQA = { editor: null, errors: [] };
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
const present=()=>evaluate(state+'.project.present');
const apply=button('Apply move operation');
async function open(){await evaluate('document.activeElement?.blur()');await click(button('Move operations'));await wait(`${state}.ui.dialog==='path-operations'`,'move operations');}
async function choose(value){await selectNativeOption(window,button('Move operation'),value);await frames();}
async function applyPlan(){await click(apply);await wait(`${state}.ui.dialog===null`,'operation applied');}
app.whenReady().then(async()=>{try{
 await waitFor(()=>!!window,'window');await wait("!!document.querySelector('.set-card')",'renderer');window.setContentSize(1366,768);window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Page.enable');await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});window.webContents.reload();await wait(`!!${editor}&&${state}.preferences.status==='saved'`,'store');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)",'recovery');
 const p=fixture();await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(p)}});${editor}.dispatch('workspace.show',{workspace:'design'})`);await frames();await capture('operations-before.png');assert.deepEqual([viewports.at(-1).width,viewports.at(-1).height],[1366,768]);assert.ok(viewports.at(-1).fieldHeight>=470);
 BrowserWindow.prototype.show=showWindow;window.show();window.focus();await settleNativeViewport(window,'visible operations');if(manifest.smallDesktop){window.setContentSize(1024,647);await settleNativeViewport(window,'constrained operations');}await click('[data-performer-id="a"]');
 await open();await type(button('New move counts'),32);assert.match(await evaluate("document.querySelector('[aria-label=\"Move operation summary\"]').textContent"),/16 to 32/);await capture('operations-resize.png');assert.deepEqual(await present(),p);await type(button('New move counts'),0);assert.equal(await evaluate(`document.querySelector(${JSON.stringify(apply)}).getAttribute('aria-disabled')`),'true');await capture('operations-invalid.png');await key(window,'Escape');await wait(`${state}.ui.dialog===null`,'cancel invalid resize');assert.deepEqual(await present(),p);
 await open();await type(button('New move counts'),32);await applyPlan();const resized=await present();assert.equal(resized.moves[0].counts,32);assert.deepEqual(resized.moves[0].paths.a.segments.map(s=>[s.startCount,s.endCount]),[[4,12],[12,16],[16,24]]);assert.deepEqual(resized.sets,p.sets);assert.equal(await evaluate(state+'.project.past.length'),1);await evaluate(`${editor}.dispatch('history.undo')`);assert.deepEqual(await present(),p);
 await open();await choose('reverse');await capture('operations-reverse.png');await applyPlan();const reversed=await present();assert.deepEqual(reversed.sets[0].positions.a,p.sets[1].positions.a);assert.deepEqual(reversed.sets[1].positions.a,p.sets[0].positions.a);assert.deepEqual(reversed.sets[0].positions.b,p.sets[0].positions.b);await open();await choose('reverse');await applyPlan();assert.deepEqual(await present(),p);await evaluate(`${editor}.dispatch('history.undo');${editor}.dispatch('history.undo')`);assert.deepEqual(await present(),p);
 pass('opening-set count rescale, invalid preview/Cancel, one undo, selected-endpoint reversal and double reverse preserve detailed paths and unrelated performers');
 await open();await choose('copy');await click(button('Copy interval 2'));assert.match(await evaluate("document.querySelector('.path-operations-panel [role=alert]').textContent"),/contiguous/);await click(button('Copy interval 1'));assert.match(await evaluate("document.querySelector('[aria-label=\"Move operation summary\"]').textContent"),/counts 8–12/);const revision=await evaluate(state+'.project.revision');await click(button('Copy movement interval range'));await wait(`${state}.ui.dialog===null`,'copied');assert.equal(await evaluate(state+'.project.revision'),revision);assert.equal(await evaluate(state+'.project.past.length'),0);assert.equal(await evaluate(state+'.ui.movementClipboard.intervals.length'),1);
 await evaluate(`${editor}.dispatch('set.select',{index:2})`);await frames();await click('[data-performer-id="b"]');await open();await choose('paste');assert.match(await evaluate("document.querySelector('.path-operations-panel [role=alert]').textContent"),/destination easing/);await click(button('Accept destination timing'));await capture('operations-paste.png');assert.match(await evaluate("document.querySelector('[aria-label=\"Move operation summary\"]').textContent"),/53.13/);
 await type(button('Paste start count'),1);await type(button('Paste duration'),4);assert.match(await evaluate("document.querySelector('.path-operations-panel [role=alert]').textContent"),/cut an existing travel/);assert.deepEqual(await present(),p);await type(button('Paste start count'),0);await type(button('Paste duration'),8);await selectNativeOption(window,button('Paste coordinate frame'),'field');assert.match(await evaluate("document.querySelector('.path-operations-panel [role=alert]').textContent"),/endpoints/);await selectNativeOption(window,button('Paste coordinate frame'),'fit');await applyPlan();const pasted=await present();assert.deepEqual(pasted.sets,p.sets);assert.deepEqual(pasted.moves[0],p.moves[0]);assert.equal(pasted.moves[1].paths.b.segments[0].kind,'cubic');assert.equal(await evaluate(state+'.project.past.length'),1);
 await evaluate(`${editor}.dispatch('playback.scrub',{count:20})`);await frames();assert.equal(await evaluate("document.querySelector('.field-stage__svg [data-performer-id=b]').getAttribute('transform')"),'translate(35 36.25)');await capture('operations-applied.png');await evaluate(`${editor}.dispatch('history.undo')`);assert.deepEqual(await present(),p);await evaluate(`${editor}.dispatch('history.redo')`);assert.deepEqual(await present(),pasted);
 pass('contiguous segment copy is session-only; explicit A1→A2 paste reviews coordinate rotation/easing and rejects travel cuts/incompatible frames atomically');
 await evaluate(`${editor}.dispatch('file.save')`);await wait(`${state}.fileSession.savedRevision===${state}.project.revision`,'saved');assert.deepEqual(parseProject(await fs.readFile(savedFile,'utf8')),pasted);await evaluate(`${editor}.dispatch('file.open')`);await wait(`${state}.project.past.length===0&&${state}.project.present.moves[1].paths.b?.segments.length===1`,'reopened');assert.deepEqual(await present(),pasted);assert.equal(await evaluate(state+'.ui.movementClipboard'),null);
 exportDestination=path.join(output,'operations.csv');await evaluate(`${editor}.dispatch('file.export')`);await frames();await click('.export-secondary button');await wait(`${state}.ui.dialog===null`,'CSV');assert.match(await fs.readFile(exportDestination,'utf8'),/Curved path/);exportDestination=path.join(output,'operations.pdf');await evaluate(`${editor}.dispatch('file.export')`);await frames();await click('.export-options label:nth-child(2)');await click('.export-pdf');await wait(`${state}.ui.toast==='PDF saved'`,'PDF');exportDestination=null;
 await evaluate(`${editor}.dispatch('set.select',{index:2});${editor}.setValue('selection','selectedIds',['b'])`);await frames();for(const theme of ['dark','light','high-contrast']){await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);await open();await type(button('New move counts'),12);await capture(`operations-${theme}.png`);await key(window,'Escape');await wait(`${state}.ui.dialog===null`,'theme cancel');}
 window.setContentSize(1024,720);window.webContents.setZoomFactor(1.5);await settleNativeViewport(window,'enlarged operations');await open();await type(button('New move counts'),12);await evaluate(`document.querySelector(${JSON.stringify(apply)}).focus()`);await capture('operations-enlarged.png');assert.equal(await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(apply)}).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()`),true);await evaluate(`document.querySelector(${JSON.stringify(apply)}).focus()`);await key(window,'Return');await wait(`${state}.ui.dialog===null`,'keyboard apply');assert.equal((await present()).moves[1].counts,12);assert.deepEqual(await evaluate('window.__pathopsQA.errors'),[]);
 pass('native persistence/export, project-isolated clipboard, three themes and enlarged keyboard Apply preserve operation results');
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,source:manifest.source,scope:manifest.scope},null,2));app.exit(0);
}catch(error){console.error(error);console.error(await evaluate(`({dialog:${state}.ui.dialog,draft:${state}.ui.pendingDraft,toast:${state}.ui.toast})`).catch(()=>null));await fs.writeFile(path.join(output,'failure.txt'),error.stack);if(window)await capturePage(window,output,'failure.png').catch(()=>{});app.exit(1);}});
