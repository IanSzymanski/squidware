'use strict';
const { waitFor: waitUntil } = require('./testing/renderer.cjs');
const { app, BrowserWindow, dialog, Menu } = require('electron');
const fs = require('node:fs/promises'); const path = require('node:path'); const assert = require('node:assert/strict');
const manifest = require(process.argv.find(arg => arg.startsWith('--preferences-manifest=')).slice('--preferences-manifest='.length));
const phase = process.argv.find(arg => arg.startsWith('--phase=')).slice(8);
const { root, output, profile, fixtureFile, otherFile } = manifest;
// Exercise graceful quit while the actual atomic preferences replacement is pending.
if (phase === 'reset-restart') { const rename = fs.rename; fs.rename = async (...args) => { if (path.basename(args[1]) === 'preferences.json') await new Promise(resolve => setTimeout(resolve, 300)); return rename(...args); }; }
const { defaultPreferences } = require(path.join(root, 'electron/preferences-codec.cjs'));
const { auditText } = require('./accessibility-audit.cjs');
app.setPath('userData', profile);
let window; let openedFile = fixtureFile; let savedFile = path.join(output, 'unchanged.squid');
const checks = []; const pass = label => { checks.push(label); console.log('PASS ' + label); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => window.webContents.executeJavaScript(source).catch(error => { console.error('Failed QA expression:', source); throw error; });
BrowserWindow.prototype.show = function () {};
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [openedFile] });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: savedFile });
dialog.showMessageBox = async () => ({ response: 1 });
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); });
require(path.join(root, 'electron/main.cjs'));
const waitFor = (condition, label) => waitUntil(condition, label, { timeoutMs: 25000 });
const uiWait = (source, label) => waitFor(() => evaluate(source), label);
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(40); }
function native(label) { function find(menu) { for (const item of menu?.items || []) { if (item.label === label) return item; const nested = find(item.submenu); if (nested) return nested; } } const item = find(Menu.getApplicationMenu()); assert.ok(item, label); item.click(); }
function instrument() {
  window.__preferencesQA = { editor: null }; window.confirm = () => true;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { const visit = fiber => { if (!fiber) return; const value = fiber.memoizedProps?.value; if (value?.getState && value?.dispatch) window.__preferencesQA.editor = value; visit(fiber.child); visit(fiber.sibling); }; visit(root.current); },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function openPreferences() {
  await click('button[aria-label="Project menu"]');
  await evaluate("[...document.querySelectorAll('.dropdown button')].find(button => button.textContent === 'Preferences').click()");
  await uiWait("document.querySelector('.modal h2')?.textContent === 'Preferences'", 'Preferences modal');
}
async function select(label, value) {
  await evaluate(`(() => { const node = [...document.querySelectorAll('.preferences-fields label')].find(node => node.textContent.startsWith(${JSON.stringify(label)})).querySelector('select'); node.value = ${JSON.stringify(String(value))}; node.dispatchEvent(new Event('change', { bubbles: true })); })()`); await pause(35);
}
async function number(label, value, commit = true) {
  await evaluate(`(() => { const node = [...document.querySelectorAll('.preferences-fields label')].find(node => node.textContent.startsWith(${JSON.stringify(label)})).querySelector('input'); node.focus(); node.select(); })()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] });
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
  if (String(value)) await window.webContents.debugger.sendCommand('Input.insertText', { text: String(value) }); await pause(35);
  if (commit) { await evaluate('document.activeElement.blur()'); await pause(35); }
}
async function toggle(label) { await evaluate(`[...document.querySelectorAll('.preferences-toggles label')].find(node => node.textContent === ${JSON.stringify(label)}).querySelector('input').click()`); await pause(35); }
const state = () => evaluate('window.__preferencesQA.editor.getState()');
async function saved() { await uiWait("window.__preferencesQA.editor.getState().preferences.status === 'saved'", 'preferences saved'); }
async function done() { await evaluate("[...document.querySelectorAll('.modal-actions button')].find(button => button.textContent === 'Done').click()"); await uiWait("!document.querySelector('dialog[open]')", 'dialog closed'); }
async function pdf(paper) {
  savedFile = path.join(output, paper + '.pdf'); native('Export drill book PDF…'); await uiWait("document.querySelector('.modal h2')?.textContent === 'Take it to the field'", 'export');
  await click('.export-pdf'); await waitFor(async () => { try { return (await fs.stat(savedFile)).size > 100; } catch { return false; } }, 'PDF');
  await uiWait("!window.__preferencesQA.editor.getState().ui.printing", 'print finished');
  const content = (await fs.readFile(savedFile)).toString('latin1'); const match = content.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/); assert.ok(match, 'PDF page dimensions');
  const expected = paper === 'a4' ? [841.89, 595.28] : [792, 612]; assert.ok(Math.abs(Number(match[1]) - expected[0]) < 1.5); assert.ok(Math.abs(Number(match[2]) - expected[1]) < 1.5);
}

app.whenReady().then(async () => {
  try {
    await waitFor(() => Boolean(window), 'window'); await uiWait("!!document.querySelector('.field-performer')", 'renderer');
    window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: '(' + instrument.toString() + ')()' }); window.webContents.reload();
    await uiWait("!!window.__preferencesQA?.editor && window.__preferencesQA.editor.getState().preferences.status !== 'loading'", 'preferences startup');
    if (await evaluate("!!document.querySelector('dialog[open]')")) await evaluate("window.__preferencesQA.editor.setValue('ui', 'dialog', null)");
    native('Open project…'); await uiWait("window.__preferencesQA.editor.getState().fileSession.savedRevision !== null", 'opened fixture');
    const before = await state(); const original = before.project.present; const revision = before.project.revision;
    await openPreferences();
    if (phase === 'write') {
      assert.ok(before.preferences.error.includes('Older')); assert.equal(before.ui.zoom, 1.1);
      await select('Panel layout', 'compact'); await toggle('Performer labels'); await toggle('Previous paths'); await toggle('Field grid'); await toggle('Snap to grid');
      await number('Field zoom', 1.6); await number('Nudge · yards', 1.25); await number('Fast nudge', 5);
      await select('Coordinate decimals', 0); await select('Paper', 'a4'); await select('Packet default', 'coordinates'); await select('Shape', 'block');
      await number('Width · yards', 30); await number('Depth · yards', 15); await number('Rotation', 30); await number('Block columns', 4); await number('Spacing', 2); await number('Stride', .75);
      await saved();
      const chosen = (await state()).preferences.value; await fs.writeFile(path.join(output, 'expected.json'), JSON.stringify(chosen));
      await number('Nudge · yards', '', false); assert.equal((await state()).ui.pendingDraft, false); assert.equal((await state()).project.revision, revision);
      await evaluate("[...document.querySelectorAll('.modal-actions button')].find(button => button.textContent === 'Done').click()"); await pause(50);
      assert.ok(await evaluate("!!document.querySelector('dialog[open]')")); assert.equal((await state()).fileSession.savedRevision, revision);
      await evaluate("document.querySelector('.preferences-fields [aria-invalid=true]').focus()");
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await pause(50);
      await done(); assert.equal(await evaluate("document.querySelector('.save-state').textContent.toLowerCase().includes('saved')"), true);
      assert.deepEqual((await state()).project.present, original); assert.equal((await state()).project.revision, revision);
      native('Save As…'); await waitFor(async () => { try { return JSON.parse(await fs.readFile(savedFile, 'utf8')).schemaVersion === 2; } catch { return false; } }, 'unchanged project saved');
      await uiWait("window.__preferencesQA.editor.getState().fileSession.fileOperation === null", 'save completed');
      assert.deepEqual(JSON.parse(await fs.readFile(savedFile, 'utf8')), original);
      pass('personal settings and invalid preference drafts leave project data, revision and save state unchanged');
      openedFile = otherFile; native('Open project…'); await uiWait("window.__preferencesQA.editor.getState().project.present.title.includes('Another production')", 'other show');
      const other = (await state()).project.present; assert.equal(other.field.preset, 'high-school'); assert.equal(other.audioOffsetSeconds, 4); assert.equal(other.moves[0].tempo, 144); assert.deepEqual((await state()).preferences.value, chosen);
      pass('opening another production retains its field, timing and audio rules and the personal settings');
      assert.equal((await fs.readdir(profile)).filter(name => name.startsWith('preferences-preserved-')).length, 1);
      pass('the older preferences original is preserved when the upgraded file is written');
    } else if (phase === 'restart') {
      const expected = JSON.parse(await fs.readFile(path.join(output, 'expected.json'), 'utf8')); assert.deepEqual((await state()).preferences.value, expected); assert.equal((await state()).ui.zoom, 1.6);
      assert.ok(await evaluate("document.querySelector('.studio').classList.contains('studio--compact')"));
      const audit = await evaluate('(' + auditText.toString() + ')()'); assert.deepEqual(audit.failures, []); assert.ok(audit.checked > 100);
      const [width, height] = window.getSize(); window.setSize(width + 1, height); await pause(150);
      await fs.writeFile(path.join(output, 'preferences.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()); await done();
      pass('representative layout, toggles, zoom, increments, shape, coordinate, paper and threshold settings survive a new desktop process');
      const id = original.performers[0].id; const point = original.sets[0].positions[id];
      await evaluate(`window.__preferencesQA.editor.setValue('selection','selectedIds',[${JSON.stringify(id)}]); document.querySelector('[data-performer-id="${id}"]').focus()`);
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right', modifiers: ['alt'] }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right', modifiers: ['alt'] }); await pause(100);
      assert.equal((await state()).project.present.sets[0].positions[id].x, point.x + 1.25); native('Undo drill edit'); await uiWait(`window.__preferencesQA.editor.getState().project.present.sets[0].positions[${JSON.stringify(id)}].x === ${point.x}`, 'undo nudge');
      pass('the saved nudge increment controls actual field keyboard movement');
      await pdf('a4'); await openPreferences(); await select('Paper', 'letter'); await saved(); await done(); await pdf('letter');
      pass('native PDF exports honor A4 and Letter landscape page dimensions');
      await openPreferences(); await evaluate("[...document.querySelectorAll('.modal-actions button')].find(button => button.textContent === 'Reset defaults').click()"); await saved();
      assert.deepEqual((await state()).preferences.value, defaultPreferences()); assert.deepEqual((await state()).project.present, original); await done();
      pass('Reset defaults restores personal choices without changing the production');
    } else if (phase === 'reset-restart') {
      assert.deepEqual((await state()).preferences.value, defaultPreferences()); assert.equal((await state()).ui.zoom, 1); pass('reset defaults remain in effect after another desktop restart');
      await select('Paper', 'a4'); await uiWait("window.__preferencesQA.editor.getState().preferences.status === 'saving'", 'delayed preferences write');
    } else { assert.deepEqual((await state()).preferences.value, { ...defaultPreferences(), paperSize: 'a4' }); await done(); pass('normal quit waits for an in-flight preference replacement and the setting survives restart'); }
    await fs.writeFile(path.join(output, 'results-' + phase + '.json'), JSON.stringify({ passed: checks, phase, electron: process.versions.electron }, null, 2));
    if (phase === 'reset-restart') { app.quit(); return; }
     app.exit(0);
  } catch (error) { console.error(error); if (window) console.error(await evaluate("document.body.innerText.slice(-2000)").catch(() => 'No renderer'));  app.exit(1); }
});

