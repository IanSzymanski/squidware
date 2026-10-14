'use strict';
const { app, BrowserWindow, dialog, Menu } = require('electron');
const fs = require('node:fs/promises'); const path = require('node:path'); const assert = require('node:assert/strict');
const manifest = require(process.argv.find(arg => arg.startsWith('--thumbnail-manifest=')).slice('--thumbnail-manifest='.length));
const { root, output, profile, fixture, baseline } = manifest;
app.setPath('userData', profile);
let window; const checks = []; const measurements = {};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => window.webContents.executeJavaScript(source).catch(error => { console.error('Failed QA expression:', source); throw error; });
const store = 'window.__thumbnailQA.editor'; const state = store + '.getState()';
BrowserWindow.prototype.show = function () {};
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
dialog.showMessageBox = async () => ({ response: 1 });
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); });
require(path.join(root, 'electron/main.cjs'));
async function waitFor(condition, label) { const started = Date.now(); while (Date.now() - started < 30000) { if (await condition()) return; await pause(15); } throw new Error('Timed out: ' + label); }
const uiWait = (source, label) => waitFor(() => evaluate(source), label);
function native(label) { function find(menu) { for (const item of menu?.items || []) { if (item.label === label) return item; const nested = find(item.submenu); if (nested) return nested; } } const item = find(Menu.getApplicationMenu()); assert.ok(item, label); item.click(); }
function instrument() {
  const qa = window.__thumbnailQA = { editor: null, thumbnails: 0, membershipBuilds: 0, membershipScans: 0, commits: 0, lastCommit: 0, mode: 'counts', errors: [] };
  const thumbnailFibers = new WeakMap();
  window.confirm = () => true;
  window.addEventListener('error', event => qa.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => qa.errors.push(String(event.reason)));
  const OriginalSet = window.Set;
  window.Set = class extends OriginalSet { constructor(values) { super(values); if (qa.mode === 'counts' && values && values === qa.editor?.getState().selection.selectedIds) qa.membershipBuilds++; } };
  const includes = Array.prototype.includes;
  Array.prototype.includes = function(...args) { if (qa.mode === 'counts' && this === qa.editor?.getState().selection.selectedIds) qa.membershipScans++; return includes.apply(this, args); };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) {
      qa.commits++; qa.lastCommit = performance.now();
      if (qa.mode !== 'counts' && qa.editor) return;
      const visit = fiber => {
        if (!fiber) return;
        const value = fiber.memoizedProps?.value;
        if (value?.getState && value?.dispatch) qa.editor = value;
        if ([0, 15].includes(fiber.tag) && fiber.child?.type === 'svg' && fiber.child.memoizedProps?.className === 'mini-field') {
          // Bailouts can retain an old subtree's PerformedWork flag across commits.
          // Count only a newly committed component fiber for the same SVG element.
          const node = fiber.child.stateNode;
          if ((fiber.flags & 1) && thumbnailFibers.get(node) !== fiber) qa.thumbnails++;
          thumbnailFibers.set(node, fiber);
        }
        visit(fiber.child); visit(fiber.sibling);
      };
      visit(root.current);
    }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function counts(label, action, expected) {
  const before = await evaluate("(({ thumbnails, membershipBuilds, membershipScans, commits }) => ({ thumbnails, membershipBuilds, membershipScans, commits }))(window.__thumbnailQA)");
  await evaluate(action); await pause(90);
  const after = await evaluate("(({ thumbnails, membershipBuilds, membershipScans, commits }) => ({ thumbnails, membershipBuilds, membershipScans, commits }))(window.__thumbnailQA)");
  const result = Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]])); measurements[label] = result;
  if (!baseline && expected !== undefined) assert.equal(result.thumbnails, expected, label);
  console.log(label + ': ' + JSON.stringify(result)); return result;
}
const pass = label => { checks.push(label); console.log('PASS ' + label); };
const thumbnail = (index = 0) => evaluate(`(() => { const svg = document.querySelectorAll('.mini-field')[${index}]; const dot = svg.querySelector('circle'); return { count: svg.querySelectorAll('circle').length, x: Number(dot.getAttribute('cx')), color: dot.getAttribute('fill') }; })()`);
const timeout = setTimeout(() => { console.error('Thumbnail QA timed out'); app.exit(1); }, 175000);
app.whenReady().then(async () => {
  try {
    await waitFor(() => Boolean(window), 'window'); await uiWait("!!document.querySelector('.field-performer')", 'renderer');
    window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: '(' + instrument.toString() + ')()' }); window.webContents.reload();
    await uiWait(`!!window.__thumbnailQA?.editor && ${state}.preferences.status !== 'loading'`, 'store');
    if (await evaluate("!!document.querySelector('dialog[open]')")) await evaluate(`${store}.setValue('ui','dialog',null)`);
    native('Open project…'); await uiWait("document.querySelectorAll('.mini-field').length === 128 && document.querySelectorAll('.field-performer').length === 500", 'maximum fixture');
    await pause(400);
    const project = await evaluate(state + '.project.present'); const id = project.performers[0].id; const originalX = project.sets[0].positions[id].x;
    const dispatch = (command, args) => `${store}.dispatch(${JSON.stringify(command)}, ${JSON.stringify(args)})`;
    await evaluate(`${store}.setValue('selection', 'selectedIds', [${JSON.stringify(id)}])`); await pause(90);
    await counts('one-set-dot-edit', dispatch('positions.move', { index: 0, updates: { [id]: { ...project.sets[0].positions[id], x: originalX + .125 } } }), 1);
    assert.equal((await thumbnail()).x, originalX + .125 + 5);
    await counts('undo-dot', dispatch('history.undo'), 1); assert.equal((await thumbnail()).x, originalX + 5);
    await counts('redo-dot', dispatch('history.redo'), 1); assert.equal((await thumbnail()).x, originalX + .125 + 5);
    pass('thumbnail coordinates stay correct through a dot edit and undo/redo');
    await counts('set-metadata', dispatch('set.update', { index: 0, update: { notes: 'Thumbnail QA note', name: 'Renamed picture' } }), 0);
    await counts('move-timing', dispatch('set.update', { index: 1, update: { counts: 40, tempo: 150 } }), 0);
    await counts('performer-name', dispatch('performer.update', { id, update: { name: 'Renamed performer' } }), 0);
    pass('metadata changes preserve displayed thumbnail geometry');
    await counts('used-section-color', dispatch('section.update', { id: project.sections[0].id, update: { color: '#112233' } }), 128);
    assert.equal((await thumbnail()).color, '#112233'); assert.equal((await thumbnail(127)).color, '#112233');
    await counts('unused-section-color', dispatch('section.update', { id: project.sections[4].id, update: { color: '#445566' } }), 0);
    await counts('performer-section', dispatch('performer.update', { id, update: { sectionId: project.sections[1].id } }), 128);
    assert.equal((await thumbnail()).color, project.sections[1].color); assert.equal((await thumbnail(127)).color, project.sections[1].color);
    pass('thumbnail colors follow used section colors and performer reassignment');
    const selection = await counts('section-selection', "document.querySelectorAll('.field-legend button')[1].click()", 0);
    if (!baseline) assert.equal(selection.membershipBuilds, 1);
    assert.equal(await evaluate(state + '.selection.selectedIds.length'), 126);
    assert.equal(await evaluate("document.querySelectorAll('.field-legend button')[1].classList.contains('selected')"), true);
    measurements.emptySectionSelected = await evaluate("document.querySelectorAll('.field-legend button')[4].classList.contains('selected')");
    if (!baseline) assert.equal(measurements.emptySectionSelected, false);
    await evaluate(`${store}.setValue('ui','workspace','cast')`); await uiWait("document.querySelectorAll('.cast-table tbody tr').length === 500", 'Cast');
    assert.equal(await evaluate("document.querySelectorAll('.cast-table tbody input[type=checkbox]:checked').length"), 126);
    await evaluate("document.querySelector('.cast-table tbody input[type=checkbox]').click()"); await pause(90);
    assert.equal(await evaluate(state + '.selection.selectedIds.includes(' + JSON.stringify(id) + ')'), false);
    await evaluate(`${store}.setValue('ui','workspace','design')`); await pause(90);
    assert.equal(await evaluate("document.querySelectorAll('.field-legend button')[1].classList.contains('selected')"), false);
    await counts('undo-section', dispatch('history.undo'), 128); assert.equal((await thumbnail()).color, '#112233');
    await counts('redo-section', dispatch('history.redo'), 128); assert.equal((await thumbnail()).color, project.sections[1].color);
    pass('legend and Cast selection stay consistent through reassignment and undo/redo');
    await counts('roster-removal', dispatch('performers.remove', { ids: [id] }), 128);
    assert.equal((await thumbnail()).count, 499); assert.equal(await evaluate(state + '.selection.selectedIds.length'), 0);
    await counts('undo-removal', dispatch('history.undo'), 128); assert.equal((await thumbnail()).count, 500);
    assert.equal(await evaluate("document.querySelectorAll('.field-performer[aria-pressed=true]').length"), 0);
    pass('removing a performer and undoing it keep roster geometry and selection highlighting current');
    await counts('select-all', dispatch('selection.all'), 0);
    const playback = await counts('playback', `(async () => { ${store}.dispatch('set.select',{index:0}); ${store}.dispatch('playback.toggle'); await new Promise(resolve=>setTimeout(resolve,600)); ${store}.dispatch('playback.toggle'); })()`, 0);
    if (!baseline) { assert.equal(playback.membershipBuilds, 0); assert.equal(playback.membershipScans, 0); }
    assert.equal(playback.thumbnails, 0);
    assert.equal(await evaluate("document.querySelectorAll('.field-performer[aria-pressed=true]').length"), 500);
    pass('playback retains every thumbnail and keeps selection highlighting synchronized');
    await evaluate(`${store}.dispatch('set.select',{index:0}); ${store}.setValue('selection','selectedIds',[${JSON.stringify(id)}]); window.__thumbnailQA.mode='timing'`); await pause(150);
    const edits = await evaluate(`(async () => {
      const qa = window.__thumbnailQA; const samples = [];
      const id = ${JSON.stringify(id)}; const x = qa.editor.getState().project.present.sets[0].positions[id].x;
      for (let index=0;index<25;index++) {
        const point = qa.editor.getState().project.present.sets[0].positions[id]; const before = qa.commits; const start = performance.now();
        const changed = qa.editor.dispatch('positions.move', { index:0, updates:{ [id]:{ ...point,x:x+(index%2 ? 0 : .125) } } }); const dispatchMs = performance.now()-start;
        await new Promise(resolve=>setTimeout(resolve,0)); if (!changed || qa.commits===before) throw new Error('Edit failed to commit');
        if (index>=5) samples.push({ dispatchMs, commitLatencyMs:qa.lastCommit-start }); await new Promise(resolve=>setTimeout(resolve,20));
      }
      return samples;
    })()`);
    measurements.edits = edits;
    assert.deepEqual(await evaluate("window.__thumbnailQA.errors"), []);
    await fs.writeFile(path.join(output,'results.json'), JSON.stringify({ ...manifest, checks, measurements, electron:process.versions.electron, note:'Actual production React renderer and editor commands. Fiber work counts are sampled separately from timing; timing disables tree walking. No physical presentation or school-laptop qualification.' },null,2));
    clearTimeout(timeout); app.exit(0);
  } catch(error) { console.error(error); if(window) console.error(await evaluate("document.body.innerText.slice(-1600)").catch(()=>'No renderer')); clearTimeout(timeout); app.exit(1); }
});

