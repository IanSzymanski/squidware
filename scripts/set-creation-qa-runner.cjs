'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--set-creation-manifest=')).slice('--set-creation-manifest='.length));
const { root, output, profile, bundle } = manifest;
const { fixture, parseProject, totalCounts } = require(bundle);
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
const editor = 'window.__setCreationQA.editor', state = editor + '.getState()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 20000, failure: () => failure });
const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  const qa = window.__setCreationQA = { editor: null, errors: [] };
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
  viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container').getBoundingClientRect().height,dialogHeight:document.querySelector('dialog[open]')?.getBoundingClientRect().height})`));
}
async function chooseSet(index) { await click(`.set-card:nth-child(${index+1})`); await wait(`${state}.selection.activeIndex===${index}`, 'set selection'); }
async function openWithKey(code, modifiers = []) { await evaluate('document.activeElement?.blur()'); await key(window, code, modifiers); await wait(`${state}.ui.dialog==='set-create' && document.activeElement?.getAttribute('aria-label')==='Creation counts'`, 'set creation dialog and initial focus'); }
const present = () => evaluate(state + '.project.present');
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'window'); await wait("!!document.querySelector('.set-card')", 'renderer');
    window.setContentSize(1366, 768);
    window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    window.webContents.reload(); await wait(`!!${editor} && ${state}.preferences.status==='saved'`, 'store and preferences');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)", 'recovery startup');
    const project = fixture();
    await evaluate(`${editor}.setValue('ui','dialog',null); ${editor}.dispatch('project.load',{project:${JSON.stringify(project)}})`); await frames();
    await chooseSet(1);
    if (manifest.baseline) { await capture('set-creation-before.png'); app.exit(0); return; }
    await capture('set-creation-after.png');
    const layout = viewports.at(-1);
    assert.deepEqual([layout.width,layout.height],[1366,768], 'fixed-size layout viewport');
    assert.ok(layout.fieldHeight >= 470, `Field height at 1366×768: ${JSON.stringify(layout)}`);
    // Keep the behavior checks in a visible native window. Its actual content
    // area may be smaller on a constrained desktop; settle that layout first.
    BrowserWindow.prototype.show = showWindow;
    window.show(); window.focus(); await frames(); await settleNativeViewport(window, 'visible set-creation window');
    await evaluate("document.querySelector('input[aria-label=\"Set name\"]').focus()");
    for (const [code, modifiers] of [['n',[]],['d',[]],['n',['shift']],['d',['shift']]]) await key(window,code,modifiers);
    assert.equal(await evaluate(state+'.ui.dialog'),null);
    assert.deepEqual(await present(),project);
    await evaluate('document.activeElement?.blur()');
    const shortcuts = [['new','n',[]],['duplicate','d',[]],['insert-before','n',['shift']],['hold','d',['shift']]];
    for (const [kind, code, modifiers] of shortcuts) {
      await openWithKey(code, modifiers);
      assert.equal(await evaluate(state + '.ui.setCreationKind'), kind);
      const original = await present();
      const defaultCount = await evaluate("Number(document.querySelector('[aria-label=\"Creation counts\"]').value)");
      assert.equal(defaultCount, kind === 'duplicate' ? project.moves[0].counts : 32);
      assert.match(await evaluate("document.querySelector('.set-creation-summary').textContent"), /grid|Copy positions|preceding|Keep the current/);
      await capture(`set-creation-${kind}.png`);
      await type(button('Creation counts'), '0');
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply set creation\"]').disabled"), true);
      await click(button('Apply set creation')); assert.deepEqual(await present(), original);
      await key(window, 'Escape'); await wait(`${state}.ui.dialog===null`, 'cancel'); assert.deepEqual(await present(), original);
      await openWithKey(code, modifiers);
      await type(button('Creation counts'), '13'); await type(button('Creation tempo'), '143.25');
      await click(button('Apply set creation')); await wait(`${state}.ui.dialog===null`, 'applied');
      const next = await present(), at = kind === 'insert-before' ? 1 : 2, created = next.sets[at];
      assert.equal(next.sets.length, project.sets.length+1);
      assert.equal(totalCounts(next),totalCounts(project)+13);
      assert.equal(await evaluate(state+'.project.past.length'),1);
      assert.deepEqual(next.sets.filter(s=>s.id!==created.id), project.sets);
      if (kind === 'new') assert.notDeepEqual(created.positions, project.sets[1].positions);
      else assert.deepEqual(created.positions, project.sets[kind==='insert-before'?0:1].positions);
      if (kind === 'duplicate') assert.equal(created.notes,project.sets[1].notes);
      await click(button('Undo')); assert.deepEqual(await present(),project);
      await click(button('Redo')); assert.deepEqual(await present(),next);
      await click(button('Undo')); await chooseSet(1);
    }
    pass('all four native shortcuts open review; invalid timing and Cancel preserve the show; Apply, Undo and Redo preserve the documented properties and identities');
    await click(button('Add set')); await click(button('Hold positions'));
    await type(button('Creation counts'), '17'); await click(button('Apply set creation'));
    const accepted = await present();
    await click(button('Save'));
    await waitFor(async()=>{try{return JSON.stringify(parseProject(await fs.readFile(savedFile,'utf8')))===JSON.stringify(accepted);}catch{return false;}},'native saved project');
    const epoch = await evaluate(state+'.ui.projectEpoch');
    await evaluate('document.activeElement?.blur()'); await key(window,'o',[process.platform==='darwin'?'meta':'control']);
    await wait(`${state}.ui.projectEpoch>${epoch}`, 'native reopened project');
    assert.deepEqual(await present(),accepted);
    pass('pointer action selection and real native save/reopen retain committed geometry, notes, timing and IDs');
    await chooseSet(0); await openWithKey('n',['shift']);
    assert.match(await evaluate("document.querySelector('.set-creation-summary').textContent"),/new opening has zero counts/);
    await click(button('Apply set creation'));
    const opening = await present(); assert.deepEqual(opening.sets[0].positions,accepted.sets[0].positions);
    assert.equal(opening.moves[0].toSetId,accepted.sets[0].id); assert.equal(opening.moves[0].counts,32);
    await click(button('Undo')); assert.deepEqual(await present(),accepted);
    pass('inserting before opening creates a zero-count picture and a separate hold into the former opening');
    await chooseSet(1); await click(button('Duplicate current set'));
    assert.equal(await evaluate(state+'.ui.setCreationKind'),'duplicate'); await key(window,'Escape'); await wait(`${state}.ui.dialog===null`, 'duplicate cancel');
    await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,newSetCounts:24})`);
    await click(button('Add set')); await wait(`${state}.ui.dialog==='set-create'`, 'default-count dialog'); assert.equal(await evaluate("document.querySelector('[aria-label=\"Creation counts\"]').value"),'24');
    for (const theme of ['dark','light','high-contrast']) {
      await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`); await capture(`set-creation-${theme}.png`);
    }
    window.setContentSize(1024,720); window.webContents.setZoomFactor(1.5); await settleNativeViewport(window,'enlarged creation dialog');
    await evaluate("document.querySelector('[aria-label=\"Apply set creation\"]').focus()"); await capture('set-creation-enlarged.png');
    assert.equal(await evaluate("(()=>{const r=document.querySelector('[aria-label=\"Apply set creation\"]').getBoundingClientRect(); return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})()"),true);
    await key(window,'Escape');
    assert.deepEqual(await evaluate('window.__setCreationQA.errors'),[]);
    pass('Inspector duplicate, personal count defaults, supported themes and a narrow enlarged dialog retain keyboard access');
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,source:manifest.source,scope:manifest.scope},null,2)); app.exit(0);
  } catch(error) { console.error(error); console.error('Captured viewports:', JSON.stringify(viewports)); await fs.writeFile(path.join(output,'failure.txt'),error.stack); app.exit(1); }
});
