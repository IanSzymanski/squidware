'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key: sendKey, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--production-sheet-manifest=')).slice('--production-sheet-manifest='.length));
const { root, output, profile, bundle } = manifest;
const { fixture, parseProject, totalCounts, setStartCount, createPerformanceFixture } = require(bundle);
const savedFile = path.join(output, 'created.squid');
app.disableHardwareAcceleration(); app.setPath('userData', profile);
// Match the editor suite's fixed-size layout capture. A visible macOS window
// can be constrained by the runner's Dock/menu bar before the 768px assertion.
const showWindow = BrowserWindow.prototype.show;
BrowserWindow.prototype.show = function () {};
dialog.showSaveDialog = async () => ({ canceled: false, filePath: savedFile });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [savedFile] });
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure; const checks = [], viewports = [];
app.on('browser-window-created', (_e, w) => { window = w; w.webContents.setBackgroundThrottling(false); w.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message); }); w.webContents.on('render-process-gone', (_e, d) => { failure = new Error(d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = async source => { try { return await window.webContents.executeJavaScript(source); } catch(error) { console.error('Renderer probe failed: '+source.slice(0,300)); throw error; } };
const editor = 'window.__sheetQA.editor', state = editor + '.getState()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 20000, failure: () => failure });
const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const key = async (...args) => { await sendKey(...args); await frames(); };
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  const qa = window.__sheetQA = { editor: null, errors: [] };
  window.addEventListener('error', e => qa.errors.push(e.message)); window.addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) qa.editor = v; visit(f.child); visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
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
const cell = (row, column) => `.sheet-scroll [data-row="${row}"][data-column="${column}"]`;
async function load(project) {
  await evaluate(`${editor}.setValue('ui','pendingDraft',false); ${editor}.setValue('ui','dialog',null); ${editor}.dispatch('project.load',{project:${JSON.stringify(project)}}); ${editor}.dispatch('workspace.show',{workspace:'production'})`); await frames();
}
async function pasteData(text) {
  await evaluate('document.activeElement?.blur()');
  await click(button('Paste spreadsheet range'));
  await type(button('Spreadsheet data'), text);
}
async function nativePaste(row, column, text) {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
  await click(cell(row,column));
  await window.webContents.paste(); await frames();
  await wait(`${state}.ui.dialog==='sheet-paste'`, 'native clipboard review');
}
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'window'); await wait("!!document.querySelector('.set-card')", 'renderer');
    window.setContentSize(1366,768); window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});
    window.webContents.reload(); await wait(`!!${editor} && ${state}.preferences.status==='saved'`, 'store');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
    await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)", 'recovery startup');
    const project = fixture(); await load(project);
    if (manifest.baseline) { await capture('sheet-before.png'); app.exit(0); return; }
    await capture('sheet-after.png');
    assert.deepEqual([viewports.at(-1).width,viewports.at(-1).height],[1366,768]);
    BrowserWindow.prototype.show = showWindow; window.show(); window.focus(); await frames(); await settleNativeViewport(window,'visible sheet');
    await type(cell(1,0),'Renamed'); await key(window,'Tab');
    assert.equal(await evaluate('document.activeElement.dataset.column'),'1');
    assert.equal((await present()).sets[1].name,'Renamed');
    await type(cell(1,1),'19'); await key(window,'Return');
    assert.equal(await evaluate('document.activeElement.dataset.row'),'2');
    assert.equal((await present()).moves[0].counts,19);
    assert.equal(await evaluate(state+'.selection.activeIndex'),2);
    assert.equal(await evaluate(state+'.playback.count'),43);
    await type(cell(2,2),'999'); await key(window,'Tab');
    assert.match(await evaluate("document.querySelector('.sheet-error').textContent"),/Row 3 · BPM/);
    assert.equal((await present()).moves[1].tempo,144);
    assert.equal(await evaluate(state+'.ui.pendingDraft'),true);
    await key(window,'Escape'); assert.equal(await evaluate(state+'.ui.pendingDraft'),false);
    await type(cell(2,3),'Discard notes'); await key(window,'Escape');
    assert.equal((await present()).sets[2].notes,project.sets[2].notes);
    pass('native Tab/Enter navigate cells and synchronize active set/timeline; invalid edits and Escape preserve data');
    await evaluate('document.activeElement?.blur()'); await click(button('Undo')); await click(button('Undo'));
    assert.deepEqual(await present(),project);
    await type('.inspector .form-row input[type=number]','-1'); await click(cell(0,0));
    assert.equal(await evaluate(state+'.selection.activeIndex'),2);
    assert.equal(await evaluate("document.querySelector('.inspector .form-row input[type=number]').value"),'-1');
    assert.equal(await evaluate(state+'.ui.pendingDraft'),true);
    assert.deepEqual(await present(),project);
    await evaluate("document.querySelector('.inspector .form-row input[type=number]').focus()"); await key(window,'Escape');
    assert.equal(await evaluate(state+'.ui.pendingDraft'),false);
    pass('focusing a sheet cell preserves an unrelated invalid Inspector draft and its active set');
    await nativePaste(0,0,'Opening\t0\t100\t"Line 1\nLine 2"\nTravel\t12\t143.25\tWatch spacing\nEnd\t30\t150\t');
    assert.deepEqual(await present(),project);
    assert.match(await evaluate("document.querySelector('.sheet-paste-modal').textContent"),/12 cells · 0 new sets · 0 errors/);
    await capture('sheet-paste-preview.png');
    await click(button('Apply spreadsheet paste')); await wait(`${state}.ui.dialog===null`,'paste applied');
    const accepted = await present();
    assert.equal(totalCounts(accepted),42); assert.equal(accepted.sets[0].notes,'Line 1\nLine 2'); assert.equal(accepted.sets[2].notes,'');
    assert.deepEqual(accepted.sets.map(s=>s.positions),project.sets.map(s=>s.positions));
    assert.equal(await evaluate(state+'.project.past.length'),1);
    assert.equal(await evaluate(state+'.playback.count'),setStartCount(accepted,await evaluate(state+'.selection.activeIndex')));
    await click(button('Undo')); assert.deepEqual(await present(),project);
    await click(button('Redo')); assert.deepEqual(await present(),accepted);
    pass('real native clipboard TSV opens a non-destructive preview and applies every cell as one reversible command');
    await click(button('Save'));
    await waitFor(async()=>{try{return JSON.stringify(parseProject(await fs.readFile(savedFile,'utf8')))===JSON.stringify(accepted);}catch{return false;}},'native saved sheet');
    const epoch = await evaluate(state+'.ui.projectEpoch');
    await evaluate('document.activeElement?.blur()'); await key(window,'o',[process.platform==='darwin'?'meta':'control']);
    await wait(`${state}.ui.projectEpoch>${epoch}`,'native reopen'); assert.deepEqual(await present(),accepted);
    await evaluate(`${editor}.dispatch('workspace.show',{workspace:'production'})`); await frames();
    pass('real native save/reopen retains sheet metadata, timing, geometry and IDs');
    await load(project); await click(cell(0,0));
    for (const invalid of ['Name,1,500,notes\nValid,16,120,notes', 'a,b,c,d,e', '"unclosed', 'a,0,120,\nb,16,120', 'x'.repeat(161)+',0,120,']) {
      await pasteData(invalid);
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply spreadsheet paste\"]').disabled"),true);
      await capture('sheet-invalid.png');
      await click('dialog button.button.subtle'); await wait(`${state}.ui.dialog===null`,'cancel invalid');
      assert.deepEqual(await present(),project); assert.equal(await evaluate(state+'.project.past.length'),0);
    }
    pass('malformed CSV, nonrectangular data, invalid opening counts, over-limit names and tempo cannot commit');
    await pasteData('"Start, here",0,100,"Quoted ""note"""\r\nMove,8,110,\r\nEnd,16,120,\r\nNew,24,130,Appended\r\n');
    await click(button('Apply spreadsheet paste')); await wait(`${state}.ui.dialog===null`,'CSV applied');
    const extended = await present(); assert.equal(extended.sets.length,4); assert.equal(extended.sets[0].name,'Start, here');
    assert.equal(extended.sets[0].notes,'Quoted "note"'); assert.deepEqual(extended.sets[3].positions,project.sets[2].positions);
    assert.equal(extended.moves[2].counts,24); assert.equal(await evaluate(state+'.project.past.length'),1);
    await click(button('Undo')); assert.deepEqual(await present(),project);
    await click(button('Append sheet row')); await wait(`${state}.selection.activeIndex===3`,'append row');
    await type(cell(3,0),'New row'); await key(window,'Tab');
    assert.equal((await present()).sets[3].name,'New row');
    pass('quoted CSV and appended rows block out a production while preserving existing pictures and using hold positions');
    const maximum = createPerformanceFixture('maximum'); await load(maximum);
    await click(cell(127,0)); await type(cell(127,0),'Last picture'); await key(window,'Tab');
    assert.equal(await evaluate('document.activeElement.dataset.row'),'127');
    assert.equal(await evaluate('document.activeElement.dataset.column'),'1');
    await key(window,'Tab',['shift']); assert.equal(await evaluate('document.activeElement.dataset.column'),'0');
    await type(cell(127,0),'Cancel last'); await key(window,'Escape'); assert.equal((await present()).sets[127].name,'Last picture');
    await evaluate('document.activeElement?.blur()'); await click(button('Undo')); assert.deepEqual(await present(),maximum);
    await click(cell(127,0)); await pasteData('Too many\t16\t120\t\nExtra\t16\t120\t');
    assert.match(await evaluate("document.querySelector('.sheet-paste-modal').textContent"),/128-set limit/);
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply spreadsheet paste\"]').disabled"),true);
    await key(window,'Escape'); await wait(`${state}.ui.dialog===null`,'cancel excess'); assert.deepEqual(await present(),maximum);
    await click(cell(0,0));
    const allRows = Array.from({length:128},(_,i)=>[`Sheet ${i+1}`,i?16:0,132,`Row ${i+1}`].join('\t')).join('\n');
    await pasteData(allRows); await click(button('Apply spreadsheet paste')); await wait(`${state}.ui.dialog===null`,'128-row paste');
    assert.equal((await present()).sets[127].name,'Sheet 128'); assert.equal(await evaluate(state+'.project.past.length'),1);
    await click(button('Undo')); assert.deepEqual(await present(),maximum);
    pass('128-set keyboard editing, cancellation, over-limit rejection and all 512 cells in one undo pass at 500 performers');
    await load(project); await pasteData('Changed\t0\t100\t');
    await evaluate(`${editor}.dispatch('set.update',{index:1,update:{name:'Concurrent'}})`); await frames();
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply spreadsheet paste\"]').disabled"),true);
    await key(window,'Escape'); await wait(`${state}.ui.dialog===null`,'stale canceled');
    pass('stale preview cannot overwrite a newer project revision');
    await load(project);
    for (const theme of ['dark','light','high-contrast']) {
      await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`); await capture(`sheet-${theme}.png`);
    }
    await pasteData('Bad\t1\t999\t'); await capture('sheet-errors.png');
    await key(window,'Escape'); await wait(`${state}.ui.dialog===null`,'theme preview close');
    window.setContentSize(1024,720); window.webContents.setZoomFactor(1.5); await settleNativeViewport(window,'enlarged sheet');
    await click(cell(2,3)); await type(cell(2,3),'Keyboard reachable'); await key(window,'Return');
    assert.equal((await present()).sets[2].notes,'Keyboard reachable'); await capture('sheet-enlarged.png');
    await pasteData('Notes only');
    await evaluate("document.querySelector('[aria-label=\"Apply spreadsheet paste\"]').focus()"); await capture('sheet-preview-enlarged.png');
    assert.equal(await evaluate("(()=>{const r=document.querySelector('[aria-label=\"Apply spreadsheet paste\"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()"),true);
    await key(window,'Escape'); await wait(`${state}.ui.dialog===null`,'enlarged cancel');
    await evaluate(`${editor}.dispatch('workspace.show',{workspace:'design'})`); await frames();
    window.webContents.setZoomFactor(1); window.setContentSize(1366,768); await settleNativeViewport(window,'field');
    await capture('sheet-field.png');
    assert.ok(viewports.at(-1).fieldHeight>=470,JSON.stringify(viewports.at(-1)));
    assert.deepEqual(await evaluate('window.__sheetQA.errors'),[]);
    pass('supported themes, narrow enlarged sheet and paste controls remain keyboard reachable; Design retains field height');
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,source:manifest.source,scope:manifest.scope},null,2)); app.exit(0);
  } catch(error) {
    console.error(error); console.error('viewports',JSON.stringify(viewports)); await fs.writeFile(path.join(output,'failure.txt'),error.stack);
    if(window) await capturePage(window,output,'failure.png').catch(()=>{}); app.exit(1);
  }
});
