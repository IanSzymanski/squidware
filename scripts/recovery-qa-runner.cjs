'use strict';
const { app, BrowserWindow, dialog, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const manifest = require(process.argv.find(arg => arg.startsWith('--recovery-manifest=')).slice('--recovery-manifest='.length));
const phase = process.argv.find(arg => arg.startsWith('--phase=')).slice(8);
const { root, output, profile, fixtureFile } = manifest;
app.setPath('userData', profile);
let window;
const checks = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => window.webContents.executeJavaScript(source);
BrowserWindow.prototype.show = function () {};
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixtureFile] });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(output, 'restored.squid') });
dialog.showMessageBox = async () => ({ response: 1 });
app.on('browser-window-created', (_event, created) => { window = created; created.webContents.setBackgroundThrottling(false); });
require(path.join(root, 'electron/main.cjs'));
async function waitFor(condition, label) {
  const started = Date.now();
  while (Date.now() - started < 25000) { if (await condition()) return; await pause(15); }
  throw new Error(`Timed out: ${label}`);
}
const uiWait = (source, label) => waitFor(() => evaluate(source), label);
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(35); }
function native(label) {
  function find(menu) { for (const item of menu?.items || []) { if (item.label === label) return item; const nested = find(item.submenu); if (nested) return nested; } }
  find(Menu.getApplicationMenu()).click();
}
async function copies() {
  try {
    const names = (await fs.readdir(path.join(profile, 'recovery'))).filter(name => /^[0-9a-f-]{36}\.json$/.test(name));
    return (await Promise.all(names.map(async name => JSON.parse(await fs.readFile(path.join(profile, 'recovery', name), 'utf8'))))).sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}
const pass = label => { checks.push(label); console.log(`PASS ${label}`); };
function instrument(legacy) {
  const state = window.__recoveryQA = { editor: null, serializations: 0, storageWrites: 0 };
  window.confirm = () => true;
  if (legacy && !sessionStorage.getItem('recovery-qa-seeded')) { localStorage.setItem('squidware.autosave.v1', legacy); sessionStorage.setItem('recovery-qa-seeded', 'yes'); }
  const stringify = JSON.stringify;
  JSON.stringify = function(value, ...args) { if (value?.schemaVersion === 2) state.serializations++; return stringify.call(this, value, ...args); };
  const write = Storage.prototype.setItem;
  Storage.prototype.setItem = function(...args) { state.storageWrites++; return write.apply(this, args); };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) {
      const visit = fiber => { if (!fiber) return; const value = fiber.memoizedProps?.value; if (value?.getState && value?.dispatch) state.editor = value; visit(fiber.child); visit(fiber.sibling); };
      visit(root.current);
    }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
  };
}
const timeout = setTimeout(() => { console.error('Recovery QA timed out.'); app.exit(1); }, 140000);
app.whenReady().then(async () => {
  try {
    await waitFor(() => Boolean(window), 'window');
    await uiWait("!!document.querySelector('.field-performer')", 'renderer');
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    const legacy = phase === 'write' ? await fs.readFile(path.join(root, 'src/fixtures/schema-v1.squid'), 'utf8') : null;
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})(${JSON.stringify(legacy)})` });
    window.webContents.reload();
    await uiWait("!!window.__recoveryQA?.editor && document.querySelector('.modal h2')?.textContent === 'Recovery copies'", 'startup chooser');
    if (phase === 'write') {
      assert.equal(await evaluate("localStorage.getItem('squidware.autosave.v1')"), null);
      assert.equal((await copies()).length, 1);
      await click('.recovery-list li:first-child button');
      await uiWait("document.querySelector('.project-title').textContent.includes('Compatibility fixture')", 'migrated legacy restore');
      assert.equal(await evaluate("window.__recoveryQA.editor.getState().fileSession.needsSaveAs"), true);
      assert.equal(await evaluate("window.__recoveryQA.editor.getState().fileSession.savedRevision"), null);
      pass('legacy migration opens a chooser and restored copies require Save As');
      native('Open project…');
      await uiWait("document.querySelector('.project-title').textContent.includes('Maximum recovery QA')", 'maximum file');
      await uiWait("document.querySelector('.recovery-indicator').textContent === 'Recovery copy saved'", 'initial maximum recovery');
      await evaluate("window.__recoveryQA.serializations = 0; window.__recoveryQA.storageWrites = 0; window.__recoveryQA.editor.dispatch('set.update', { index: 0, update: { notes: 'First committed recovery edit' } });");
      await uiWait("document.querySelector('.recovery-indicator').textContent === 'Writing recovery…'", 'worker starts');
      const measurement = await evaluate(`(async () => {
        const state = window.__recoveryQA; const store = state.editor; const samples = []; const timerDelays = [];
        const first = store.getState().project.present.performers[0].id;
        let last = performance.now(); const interval = setInterval(() => { const now = performance.now(); timerDelays.push(now - last); last = now; }, 16);
        const writingAtFirstEdit = document.querySelector('.recovery-indicator').textContent === 'Writing recovery…';
        for (let index = 0; index < 20; index++) {
          const start = performance.now(); const point = store.getState().project.present.sets[0].positions[first];
          store.dispatch('positions.move', { index: 0, updates: { [first]: { ...point, x: point.x + 0.01 } } });
          samples.push(performance.now() - start); await new Promise(resolve => setTimeout(resolve, 35));
        }
        clearInterval(interval);
        return { samples, timerDelays, writingAtFirstEdit, serializations: state.serializations, storageWrites: state.storageWrites, electron: navigator.userAgent };
      })()`);
      assert.equal(measurement.serializations, 0); assert.equal(measurement.storageWrites, 0);
      assert.equal(measurement.writingAtFirstEdit, true);
      await uiWait("document.querySelector('.recovery-indicator').textContent === 'Recovery copy saved'", 'latest maximum copy');
      await fs.writeFile(path.join(output, 'measurement.json'), JSON.stringify({ ...manifest, ...measurement, scope: '20 actual store edits with production React rendering while native recovery runs; timer delays include renderer/IPC overhead. Host measurement, no school-laptop qualification.' }, null, 2));
      pass('editing continues during worker recovery without renderer serialization or localStorage writes');
      const current = (await copies())[0]; assert.equal(JSON.parse(current.content).performers.length, 500); assert.equal(JSON.parse(current.content).sets.length, 128);
      await fs.writeFile(path.join(output, 'expected.squid'), current.content);
      pass('maximum production and latest committed coordinates are durably recovered');
    } else {
      const expected = JSON.parse(await fs.readFile(path.join(output, 'expected.squid'), 'utf8'));
      assert.ok(await evaluate("document.querySelectorAll('.recovery-list li').length >= 2"));
      const [width, height] = window.getSize(); window.setSize(width + 1, height); await pause(150);
      await fs.writeFile(path.join(output, 'recovery-chooser.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
      await click('.recovery-list li:first-child button');
      await uiWait("document.querySelectorAll('.field-performer').length === 500 && document.querySelectorAll('.set-card').length === 128", 'maximum restored after process restart');
      assert.deepEqual(await evaluate('window.__recoveryQA.editor.getState().project.present'), expected);
      assert.equal(await evaluate('window.__recoveryQA.editor.getState().fileSession.needsSaveAs'), true);
      native('Save As…');
      await waitFor(async () => { try { return JSON.parse(await fs.readFile(path.join(output, 'restored.squid'), 'utf8')).title === expected.title; } catch { return false; } }, 'restored project file');
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(output, 'restored.squid'), 'utf8')), expected);
      pass('fresh process restores every maximum-size position and move and saves a portable file');
      await click('.recovery-indicator');
      await click('.modal .modal-actions button:first-child');
      await uiWait("document.querySelector('.recovery-list').textContent.includes('Compatibility fixture')", 'competing productions');
      await uiWait("!document.querySelector('.recovery-list li button').disabled", 'refresh finished');
      await evaluate("[...document.querySelectorAll('.recovery-list li')].find(node => node.querySelector('strong').textContent === 'Compatibility fixture').querySelector('button').click()");
      await uiWait("document.querySelector('.project-title').textContent.includes('Compatibility fixture')", 'older production selected');
      assert.equal(await evaluate('window.__recoveryQA.editor.getState().fileSession.needsSaveAs'), true);
      pass('users can select an older competing production and retain Save As protection');
    }
    await fs.writeFile(path.join(output, `results-${phase}.json`), JSON.stringify({ passed: checks }, null, 2));
    clearTimeout(timeout); app.exit(0);
  } catch (error) { clearTimeout(timeout); console.error(error); if (window) console.error(await evaluate("JSON.stringify({ body: document.body.innerText.slice(-1800), qa: !!window.__recoveryQA, editor: !!window.__recoveryQA?.editor, legacy: localStorage.getItem('squidware.autosave.v1')?.slice(0,80), seed: sessionStorage.getItem('recovery-qa-seeded') })").catch(() => 'No renderer')); app.exit(1); }
});
