'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key: sendKey, waitFor, settleNativeViewport, selectNativeOption } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--movement-schedule-manifest=')).slice('--movement-schedule-manifest='.length));
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
const editor = 'window.__scheduleQA.editor', state = editor + '.getState()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 20000, failure: () => failure });
const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const key = async (...args) => { await sendKey(...args); await frames(); };
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  const qa = window.__scheduleQA = { editor: null, errors: [] };
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
const apply = '[aria-label="Apply movement timing"]';
async function openSchedule() {
 await evaluate('document.activeElement?.blur()');await click(button('Edit movement timing'));
 await wait(`${state}.ui.dialog==='movement-schedule'`,'schedule editor');
}
async function choose(name,value) { await selectNativeOption(window,button(name),value);await frames(); }
async function fillSchedule() {
 await type(button('Interval 1 Departure count'),2);await type(button('Interval 1 Arrival count'),6);
 await click(button('Add movement interval'));await choose('Interval 2 movement','hold');
 await type(button('Interval 2 End count'),8);await click(button('Add movement interval'));
 await type(button('Interval 1 Arrival X yards'),20);await type(button('Interval 1 Arrival Y yards'),25);
 await choose('Interval 3 movement','cubic');await type(button('Interval 3 Arrival count'),12);
 for(const [name,value] of [['Control 1 X',20],['Control 1 Y',35],['Control 2 X',30],['Control 2 Y',35]]) await type(button(`Interval 3 ${name}`),value);
}
async function fieldMatches(project,count) {
 await evaluate(`${editor}.dispatch('playback.scrub',{count:${count}})`);await frames();
 const expected=sampleProject(project,count).positions;
 for(const id of ['a','b']) assert.equal(await evaluate(`document.querySelector('.field-stage__svg [data-performer-id=${id}]').getAttribute('transform')`),`translate(${expected[id].x} ${expected[id].y})`);
}
app.whenReady().then(async()=>{
 try {
  await waitFor(()=>!!window,'window');await wait("!!document.querySelector('.set-card')",'renderer');
  window.setContentSize(1366,768);window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Page.enable');
  await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});
  window.webContents.reload();await wait(`!!${editor}&&${state}.preferences.status==='saved'`,'store');
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)",'recovery');
  const p=fixture();await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(p)}});${editor}.dispatch('workspace.show',{workspace:'design'});${editor}.dispatch('set.select',{index:1})`);await frames();
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(button('Edit movement timing'))}).getAttribute('aria-disabled')`),'true');
  await capture('schedule-before.png');assert.deepEqual([viewports.at(-1).width,viewports.at(-1).height],[1366,768]);assert.ok(viewports.at(-1).fieldHeight>=470);
  BrowserWindow.prototype.show=showWindow;window.show();window.focus();await settleNativeViewport(window,'visible schedule');
  await click('[data-performer-id="a"]');await openSchedule();await fillSchedule();
  assert.match(await evaluate("document.querySelector('[aria-label=\"Movement schedule summary\"]').textContent"),/Hold 0–2; Travel 2–6; Hold 6–8; Curve 8–12; Hold 12–16/);
  assert.match(await evaluate("document.querySelector('[aria-label=\"Movement preview position\"]').textContent"),/X 20.000, Y 25.000/);
  await evaluate("document.querySelector('[data-schedule-row=\"0\"]').scrollIntoView({block:'start'})");await capture('schedule-intervals.png');
  await evaluate("document.querySelector('.path-preview').scrollIntoView({block:'center'})");await capture('schedule-preview.png');assert.deepEqual(await present(),p);assert.equal(await evaluate(state+'.project.past.length'),0);
  await type(button('Interval 2 Start count'),5);assert.equal(await evaluate(`document.querySelector(${JSON.stringify(apply)}).getAttribute('aria-disabled')`),'true');
  assert.match(await evaluate("document.querySelector('.movement-schedule-panel [role=alert]').textContent"),/overlaps/);await capture('schedule-invalid.png');
  await key(window,'Escape');await wait(`${state}.ui.dialog===null`,'cancel');assert.deepEqual(await present(),p);assert.equal(await evaluate(state+'.ui.pendingDraft'),false);
  pass('explicit single selection, native interval/control/waypoint input, implicit gaps, overlapping validation and Escape preserve production/history');
  await openSchedule();await fillSchedule();await evaluate(`document.querySelector(${JSON.stringify(apply)}).focus()`);await key(window,'Return');await wait(`${state}.ui.dialog===null`,'keyboard apply A');
  const first=await present();assert.equal(await evaluate(state+'.project.past.length'),1);assert.deepEqual(first.sets,p.sets);assert.equal(first.moves[0].paths.a.segments.length,3);
  await click('[data-performer-id="b"]');await openSchedule();await type(button('Interval 1 Departure count'),4);await type(button('Interval 1 Arrival count'),14);await click(apply);await wait(`${state}.ui.dialog===null`,'apply B');
  const scheduled=await present();assert.deepEqual(scheduled.moves[0].paths.a,first.moves[0].paths.a);assert.deepEqual(scheduled.sets,p.sets);assert.deepEqual(scheduled.tempoMap,p.tempoMap);assert.equal(await evaluate(state+'.project.past.length'),2);
  await evaluate(`${editor}.dispatch('history.undo');${editor}.dispatch('history.undo')`);assert.deepEqual(await present(),p);
  await evaluate(`${editor}.dispatch('history.redo');${editor}.dispatch('history.redo')`);assert.deepEqual(await present(),scheduled);
  for(const count of [0,2,4,6,7,8,10,12,14,16]) await fieldMatches(scheduled,count);
  await fieldMatches(scheduled,7);await capture('schedule-applied.png');
  await evaluate(`${editor}.dispatch('playback.scrub',{count:6.25})`);await evaluate('document.activeElement?.blur()');await key(window,'Space');
  const live=()=>evaluate(`({count:${state}.playback.count,a:document.querySelector('.field-stage__svg [data-performer-id=a]').getAttribute('transform'),b:document.querySelector('.field-stage__svg [data-performer-id=b]').getAttribute('transform')})`);
  await wait(`${state}.playback.count>6.5`,'movement hold playback');const before=await live();
  await wait(`${state}.playback.count>7.25`,'other performer advances through hold');const after=await live();
  assert.ok(before.count<after.count&&after.count<8,JSON.stringify({before,after}));
  assert.equal(before.a,'translate(20 25)');assert.equal(after.a,'translate(20 25)');assert.notEqual(before.b,after.b,'B moves while A holds');
  await key(window,'Space');await wait(`!${state}.playback.playing`,'pause');
  pass('independent A/B schedules, one transaction each, atomic undo/redo, analytic boundary scrubs and live stationary A while B/show clock advance');
  await evaluate(`${editor}.dispatch('file.save')`);await wait(`${state}.fileSession.savedRevision===${state}.project.revision`,'native save');
  assert.equal(JSON.parse(await fs.readFile(savedFile,'utf8')).schemaVersion,6);assert.deepEqual(parseProject(await fs.readFile(savedFile,'utf8')),scheduled);
  await evaluate(`${editor}.dispatch('file.open')`);await wait(`${state}.project.past.length===0&&${state}.project.present.moves[0].paths.a?.segments.length===3`,'native reopen');assert.deepEqual(await present(),scheduled);
  exportDestination=path.join(output,'scheduled.csv');await evaluate(`${editor}.dispatch('file.export')`);await frames();await click('.export-secondary button');await wait(`${state}.ui.dialog===null`,'CSV');assert.match(await fs.readFile(exportDestination,'utf8'),/Timed path/);
  exportDestination=path.join(output,'scheduled.pdf');await evaluate(`${editor}.dispatch('file.export')`);await frames();await click('.export-options label:nth-child(2)');await click('.export-pdf');await wait(`${state}.ui.toast==='PDF saved'`,'PDF');assert.ok((await fs.stat(exportDestination)).size>1000);exportDestination=null;
  await evaluate(`${editor}.dispatch('set.select',{index:1});${editor}.setValue('selection','selectedIds',['a'])`);await frames();
  await click(button('Edit performer path'));await wait(`${state}.ui.dialog==='movement-schedule'`,'saved schedule routes to timing editor');
  // Focus help owns Escape while open; blur it before testing modal dismissal.
  await evaluate('document.activeElement?.blur()');await key(window,'Escape');await wait(`${state}.ui.dialog===null`,'close routed schedule');
  for(const theme of ['dark','light','high-contrast']) {
   await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);await openSchedule();await capture(`schedule-${theme}.png`);await key(window,'Escape');await wait(`${state}.ui.dialog===null`,'theme cancel');
  }
  window.setContentSize(1024,720);window.webContents.setZoomFactor(1.5);await settleNativeViewport(window,'enlarged schedule');await openSchedule();await type(button('Interval 1 Departure count'),3);
  await evaluate(`document.querySelector(${JSON.stringify(apply)}).focus()`);await capture('schedule-enlarged.png');
  assert.equal(await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(apply)}).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()`),true);
  await evaluate(`document.querySelector(${JSON.stringify(apply)}).focus()`);await key(window,'Return');await wait(`${state}.ui.dialog===null`,'enlarged keyboard Apply');
  const changed=await present();assert.equal(changed.moves[0].paths.a.segments[0].startCount,3);assert.deepEqual(changed.moves[0].paths.b,scheduled.moves[0].paths.b);
  assert.deepEqual(changed.moves[0].paths.a.segments.map(s=>s.id),scheduled.moves[0].paths.a.segments.map(s=>s.id));assert.deepEqual(await evaluate('window.__scheduleQA.errors'),[]);
  pass('v6 native save/reopen, CSV/PDF, safe path-editor routing, themes and narrow 150% keyboard apply retain identities and independent timing');
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,liveHold:{before,after},source:manifest.source,scope:manifest.scope},null,2));app.exit(0);
 }catch(error){console.error(error);console.error(await evaluate(`({dialog:${state}.ui.dialog,pendingDraft:${state}.ui.pendingDraft,count:${state}.playback.count,selection:${state}.selection.selectedIds,toast:${state}.ui.toast})`).catch(()=>null));await fs.writeFile(path.join(output,'failure.txt'),error.stack);if(window)await capturePage(window,output,'failure.png').catch(()=>{});app.exit(1);}
});
