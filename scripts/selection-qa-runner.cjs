'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key: sendKey, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const { root, output, profile, fixture } = require(process.argv.find(a => a.startsWith('--selection-manifest=')).slice('--selection-manifest='.length));
const phase = process.argv.find(a => a.startsWith('--phase='))?.slice('--phase='.length);
const saved = path.join(output, 'saved-groups.squid');
app.disableHardwareAcceleration(); app.setPath('userData', profile); BrowserWindow.prototype.show = function () {};
dialog.showSaveDialog = async () => ({ canceled: false, filePath: saved });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [phase === 'read' ? saved : fixture] });
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure; const checks = [], metrics = [];
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); window.webContents.on('render-process-gone', (_e, d) => { failure = new Error('Renderer exited: ' + d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const editor = 'window.__selectionQA.editor', state = editor + '.getState()';
const wait = (source, label) => waitFor(() => evaluate(source), label, { timeoutMs: 15000, failure: () => failure });
const key = (code, modifiers = []) => sendKey(window, code, modifiers, 20);
const capture = async name => {
  if (name !== 'failure.png') {
    await evaluate('document.activeElement?.blur()');
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
    await wait("!document.querySelector('[role=tooltip]')", 'dismiss help before visual evidence');
  }
  return capturePage(window, output, name);
};
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  window.confirm = () => true;
  window.__selectionQA = { editor: null, errors: [] };
  window.addEventListener('error', e => window.__selectionQA.errors.push(e.message));
  window.addEventListener('unhandledrejection', e => window.__selectionQA.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) window.__selectionQA.editor = v; visit(f.child); visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function control(selector, modifiers = 0) {
  await wait(`new Promise(resolve=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n || n.disabled || n.getAttribute('aria-disabled')==='true' || !n.getClientRects().length){resolve(false);return;}n.scrollIntoView({block:'nearest'});requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=n.getBoundingClientRect();window.__selectionPoint={x:r.x+r.width/2,y:r.y+r.height/2};resolve(n.contains(document.elementFromPoint(window.__selectionPoint.x,window.__selectionPoint.y)));}));})`, 'actionable ' + selector);
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  const point = await evaluate('window.__selectionPoint');
  await evaluate(`window.__selectionClick=null;window.__selectionExpected=document.querySelector(${JSON.stringify(selector)});document.addEventListener('click',e=>{window.__selectionClick=e.target},{once:true,capture:true})`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, modifiers, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
  await wait('!!window.__selectionClick', 'native click ' + selector);
  assert.ok(await evaluate('window.__selectionExpected.contains(window.__selectionClick)'), selector + ' receives native input');
}
async function text(selector, value) {
  await control(selector);
  await wait(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`, 'native text focus ' + selector);
  // Hidden macOS windows do not route simulated menu accelerators reliably.
  // Select the input text explicitly, as the editor/preferences owners do.
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);
  // Inserting an empty string does not delete the selected text on macOS.
  await key('Backspace');
  await wait(`document.querySelector(${JSON.stringify(selector)}).value === ''`, 'native text clear ' + selector);
  if (value) await window.webContents.debugger.sendCommand('Input.insertText', { text: value });
  await wait(`document.querySelector(${JSON.stringify(selector)}).value === ${JSON.stringify(value)}`, 'native text entry ' + selector);
}
const selected = () => evaluate(`${state}.selection.selectedIds`);
const open = () => control('.canvas-toolbar [aria-label="Selection tools and groups"]');
const close = () => control('[aria-label="Close selection tools"]');
async function viewport(width, height, zoom = 1) { window.setContentSize(width, height); window.webContents.setZoomFactor(zoom); await settleNativeViewport(window, 'selection viewport'); assert.deepEqual(await evaluate('[innerWidth,innerHeight]'), [Math.round(width / zoom), Math.round(height / zoom)]); }
async function group(name) { await text('[aria-label="New selection group name"]', name); await control('[aria-label="Save selection group"]'); await wait(`${state}.project.present.selectionGroups?.some(g=>g.name===${JSON.stringify(name)})`, 'saved group ' + name); }
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'selection window'); await wait("!!document.querySelector('.field-stage__svg')", 'initial renderer');
    window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    window.webContents.reload(); await wait(`!!${editor} && ${state}.preferences.status==='saved'`, 'selection store');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true }); await viewport(1366, 768);
    await evaluate(`${editor}.dispatch('file.open')`); await wait(`${state}.project.present.title==='Selection and saved groups'`, 'native fixture open');
    const project = await evaluate(`${state}.project.present`), ids = project.performers.map(p => p.id);
    if (phase === 'read') {
      const expected = JSON.parse(await fs.readFile(saved, 'utf8')); assert.deepEqual(project, expected);
      await open(); await control('[aria-label="Recall group Backs"]'); await wait(`${state}.selection.selectedIds.length===2`, 'fresh process group recall');
      assert.deepEqual(await selected(), ids.slice(3)); await capture('selection-restored.png');
      pass('native save/reopen in a fresh desktop process preserves named overlapping groups and recalls exact performer IDs');
    } else {
      const before = await evaluate(`${state}.project`);
      const fieldHeight = await evaluate("document.querySelector('.field-container').getBoundingClientRect().height"); assert.ok(fieldHeight >= 470, String(fieldHeight)); metrics.push({ fieldHeight });
      const sectionButtons = await evaluate("[...document.querySelectorAll('.field-legend button')].map(n=>n.getAttribute('aria-label'))");
      await control(`[aria-label=${JSON.stringify(sectionButtons[0])}]`);
      await evaluate(`document.querySelector(${JSON.stringify(`[aria-label=${JSON.stringify(sectionButtons[1])}]`)}).focus()`); await key('Return', ['shift']);
      await wait(`${state}.selection.selectedIds.length===5`, 'native Shift-Enter additive section'); assert.deepEqual(await selected(), ids);
      await capture('selection-sections.png');
      await control('.workspace-tab[aria-label="Cast"]'); await text('[aria-label="Find a performer"]', 'A');
      await control('#workspace-pane-cast [aria-label="Selection tools and groups"]'); await control('[aria-label="Invert visible selection"]');
      assert.deepEqual(await selected(), ids.slice(3)); assert.equal(await evaluate("document.querySelectorAll('.cast-list li.selected').length"), 0);
      assert.ok(await evaluate("document.querySelector('.cast-filter-notice').textContent.includes('2 selected')"));
      assert.deepEqual(await evaluate(`${state}.project`), before); pass('native additive section selection and filtered invert share field/Cast state without project edits and preserve hidden selections');
      await group('Backline'); await close(); await text('[aria-label="Find a performer"]', '');
      await control(`.cast-list [data-cast-id="${ids[1]}"] > button`); await control(`.cast-list [data-cast-id="${ids[3]}"] > button`, process.platform === 'darwin' ? 4 : 2);
      assert.deepEqual(await selected(), [ids[1], ids[3]]); await open(); await group('Overlap');
      await text('[aria-label="Name for group Backline"]', 'Backs'); await key('Return'); await wait(`${state}.project.present.selectionGroups[0].name==='Backs'`, 'rename group');
      const renamed = await evaluate(`${state}.project`);
      await text('[aria-label="Name for group Backs"]', 'Overlap'); await key('Return'); await wait("!!document.querySelector('.selection-saved-group [aria-invalid=true]')", 'duplicate name rejected');
      assert.deepEqual(await evaluate(`${state}.project`), renamed); await control('[aria-label="Name for group Backs"]'); await key('Escape'); await wait(`!${state}.ui.pendingDraft`, 'Escape cancels invalid rename');
      await control('[aria-label="Delete group Overlap"]'); await control('[aria-label="Undo"]'); await wait(`${state}.project.present.selectionGroups.length===2`, 'group delete undo');
      assert.deepEqual(await evaluate(`${state}.project.present.sets`), project.sets); assert.deepEqual(await evaluate(`${state}.project.present.performers`), project.performers);
      await capture('selection-groups.png'); pass('overlapping named ID groups, rename validation and delete/undo preserve every position and section');
      await close(); await control('.workspace-tab[aria-label="Cast"]');
      // Rank/file review is a selection session, not an edit preview.
      await open(); await control('[aria-label="Preview rank"]'); await wait(`!!${state}.ui.selectionPreview`, 'rank preview');
      // The default anchor is A2, already selected. Choose A1 explicitly for the boundary fixture.
      await evaluate("document.querySelector('[aria-label=\"Selection anchor\"]').focus()");
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Selection anchor\"]').value"), ids[1]);
      // A closed macOS select does not use Home to choose its first option.
      await key('Up');
      await wait(`document.querySelector('[aria-label="Selection anchor"]').value===${JSON.stringify(ids[0])} && !${state}.ui.selectionPreview`, 'native anchor choice and stale review cancellation');
      await control('[aria-label="Preview rank"]'); await wait(`${state}.ui.selectionPreview.spec.anchorId===${JSON.stringify(ids[0])}`, 'native anchor selection');
      const rankBefore = await evaluate(`${state}.project`), initialIds = await selected();
      assert.deepEqual(await evaluate(`${state}.ui.selectionPreview.ids`), ids.slice(0, 2));
      assert.ok(await evaluate(`${state}.ui.selectionPreview.candidates.find(p=>p.id===${JSON.stringify(ids[2])}).boundary`));
      await control('[aria-label="Include A3 in selection"]'); await capture('selection-rank-preview.png');
      await control('[aria-label="Cancel selection preview"]'); assert.deepEqual(await selected(), initialIds); assert.deepEqual(await evaluate(`${state}.project`), rankBefore);
      await control('[aria-label="Preview rank"]'); await text('[aria-label="Selection tolerance in yards"]', '0.3'); await wait(`!${state}.ui.selectionPreview`, 'changed tolerance invalidates membership review'); assert.deepEqual(await selected(), initialIds);
      await text('[aria-label="Selection tolerance in yards"]', '0.25'); await control('[aria-label="Preview rank"]');
      await evaluate("document.querySelector('.field-stage__svg').focus()"); await key('Escape'); await wait(`!${state}.ui.selectionPreview`, 'field Escape cancels selection review');
      assert.deepEqual(await selected(), initialIds); await key('Escape'); await wait(`!${state}.ui.selectionToolsOpen`, 'second field Escape closes selection tools'); assert.deepEqual(await selected(), initialIds);
      await open(); await control('[aria-label="Preview rank"]'); await control('[aria-label="Apply selection"]'); assert.deepEqual(await selected(), ids.slice(0, 2));
      await open(); await control('[aria-label="Preview file"]'); await control('[aria-label="Apply selection"]'); assert.deepEqual(await selected(), [ids[0], ids[3]]);
      assert.deepEqual(await evaluate(`${state}.project`), rankBefore); pass('native rank/file preview, boundary inclusion, Cancel and Apply alter only selection with keyboard anchor/tolerance alternatives');
      await control('[aria-label="Lasso selection"]'); await key('V'); await wait(`${state}.ui.tool==='select'`, 'V tool shortcut'); await key('L'); await wait(`${state}.ui.tool==='lasso'`, 'lasso tool');
      const polygon = [{ x: 28, y: 20 }, { x: 46, y: 20 }, { x: 46, y: 28 }, { x: 28, y: 28 }];
      const fieldPoints = () => evaluate(`(()=>{const m=document.querySelector('[data-field-geometry]').getScreenCTM();return ${JSON.stringify(polygon)}.map(p=>{const q=new DOMPoint(p.x,p.y).matrixTransform(m);return {x:q.x,y:q.y}})})()`);
      async function draw(cancel) {
        await settleNativeViewport(window, 'lasso geometry after layout changes');
        const points = await fieldPoints();
        await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...points[0], button: 'left', buttons: 1, clickCount: 1 });
        await wait("!!document.querySelector('[data-selection-lasso]')", 'lasso pointer start acknowledged');
        for (let i = 1; i < points.length; i++) { await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points[i], button: 'left', buttons: 1 }); await wait(`document.querySelector('[data-selection-lasso]').getAttribute('points').trim().split(' ').length>=${i + 1}`, 'lasso point acknowledged'); }
        if (cancel) await key('Escape');
        await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...points.at(-1), button: 'left', buttons: 0, clickCount: 1 });
      }
      await control('[aria-label="Focus field"]'); await wait("!!document.querySelector('.studio--focus')", 'focus before lasso cancellation');
      await draw(true); assert.ok(await evaluate("!!document.querySelector('.studio--focus')")); await key('Escape'); await wait("!document.querySelector('.studio--focus')", 'second Escape restores workspace'); assert.deepEqual(await selected(), [ids[0], ids[3]]); assert.equal(await evaluate(`${state}.ui.selectionPreview`), null);
      await draw(false); await wait(`!!${state}.ui.selectionPreview`, 'native lasso review'); assert.deepEqual(await evaluate(`${state}.ui.selectionPreview.ids`), ids.slice(0, 2));
      await capture('selection-lasso-preview.png'); await control('[aria-label="Apply selection"]'); assert.deepEqual(await selected(), ids.slice(0, 2));
      assert.deepEqual(await evaluate(`${state}.project`), rankBefore); pass('native freehand lasso previews exact IDs; gesture Escape in focus mode preserves the previous selection and Apply adds no geometry/history edit');
      for (const [width, height, scale] of [[850, 680, 1], [1000, 700, 2]]) {
        await viewport(width, height, scale); await evaluate(`${editor}.dispatch('selection.tools')`);
        await control('[aria-label="Selection tolerance in yards"]'); await key('Up');
        await control('.selection-tools-panel details details > summary');
        await text('[aria-label="Lasso points in yards"]', polygon.map(p => `${p.x}, ${p.y}`).join('\n')); await control('[aria-label="Preview typed lasso"]');
        await control('[aria-label="Apply selection"]'); assert.deepEqual(await selected(), ids.slice(0, 2));
        assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false); await evaluate(`${editor}.dispatch('selection.tools')`);
        await capture(`selection-${width}-${scale}.png`); await close();
      }
      pass('keyboard polygon entry and native tolerance input remain reachable at 850 px and 200% UI zoom');
      await viewport(1366, 768); await open(); await control('[aria-label="Recall group Backs"]'); await close();
      // Removal updates all overlapping memberships in one transaction; Undo restores them.
      const beforeRemoval = await evaluate(`${state}.project.present`); await evaluate(`${editor}.dispatch('performers.remove',{ids:[${JSON.stringify(ids[3])}]})`);
      assert.ok(await evaluate(`${state}.project.present.selectionGroups.every(g=>!g.performerIds.includes(${JSON.stringify(ids[3])}))`));
      await control('[aria-label="Undo"]'); assert.deepEqual(await evaluate(`${state}.project.present`), beforeRemoval);
      await control('[aria-label="Project menu"]'); await control('[aria-label="Save as"]'); await wait(`${state}.fileSession.savedRevision===${state}.project.revision && !${state}.fileSession.fileOperation`, 'native save complete');
      assert.deepEqual(JSON.parse(await fs.readFile(saved, 'utf8')), beforeRemoval);
      pass('performer removal prunes every group in one named undo; native save retains restored memberships and unchanged geometry');
    }
    assert.deepEqual(await evaluate('window.__selectionQA.errors'), []);
    await fs.writeFile(path.join(output, `results-${phase}.json`), JSON.stringify({ passed: checks, metrics, platform: process.platform }, null, 2)); app.exit(0);
  } catch (error) { console.error(error); if (window && !window.isDestroyed()) await capture('failure.png').catch(() => {}); app.exit(1); }
});
