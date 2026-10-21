'use strict';
const { waitFor: waitUntil, capturePage, key: sendKey } = require('./testing/renderer.cjs');
const { app, BrowserWindow, dialog, Menu } = require('electron');
const fs = require('node:fs/promises'); const path = require('node:path'); const assert = require('node:assert/strict');
const manifest = require(process.argv.find(arg => arg.startsWith('--preferences-manifest=')).slice('--preferences-manifest='.length));
const phase = process.argv.find(arg => arg.startsWith('--phase=')).slice(8);
const { root, output, profile, fixtureFile, otherFile, coordinateBundle } = manifest;
const { coordinateDescription, performerMoveOutput, sampleProject } = require(coordinateBundle);
// Exercise graceful quit while the actual atomic preferences replacement is pending.
if (phase === 'reset-restart') { const rename = fs.rename; fs.rename = async (...args) => { if (path.basename(args[1]) === 'preferences.json') await new Promise(resolve => setTimeout(resolve, 300)); return rename(...args); }; }
const { defaultPreferences } = require(path.join(root, 'electron/preferences-codec.cjs'));
const { auditText } = require('./accessibility-audit.cjs');
app.setPath('userData', profile);
let window; let openedFile = fixtureFile; let savedFile = path.join(output, `unchanged-${process.pid}.squid`);
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
  await evaluate(`(() => { const node = [...document.querySelectorAll('.preferences-fields label')].find(node => node.textContent.startsWith(${JSON.stringify(label)})).querySelector('input'); node.focus(); node.select(); window.__preferencesQA.numberInput = node; })()`);
  await uiWait('document.activeElement === window.__preferencesQA.numberInput', 'number input focus: ' + label);
  // The text is already selected. A redundant Ctrl/Cmd+A can be handled by the
  // native menu after focus changes and select the ensemble instead on Windows.
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
  await uiWait("window.__preferencesQA.numberInput.value === ''", 'number input cleared: ' + label);
  if (String(value)) await window.webContents.debugger.sendCommand('Input.insertText', { text: String(value) }); await pause(35);
  if (commit) { await evaluate('document.activeElement.blur()'); await pause(35); }
}
async function toggle(label) { await evaluate(`[...document.querySelectorAll('.preferences-toggles label')].find(node => node.textContent === ${JSON.stringify(label)}).querySelector('input').click()`); await pause(35); }
const state = () => evaluate('window.__preferencesQA.editor.getState()');
async function saved() { await uiWait("window.__preferencesQA.editor.getState().preferences.status === 'saved'", 'preferences saved'); }
async function done() { await evaluate("[...document.querySelectorAll('.modal-actions button')].find(button => button.textContent === 'Done').click()"); await uiWait("!document.querySelector('dialog[open]')", 'dialog closed'); }
async function pdf(paper) {
  savedFile = path.join(output, `${paper}-${process.pid}.pdf`); native('Export drill book PDF…'); await uiWait("document.querySelector('.modal h2')?.textContent === 'Export'", 'export');
  await click('.export-pdf'); await waitFor(async () => { try { return (await fs.stat(savedFile)).size > 100; } catch { return false; } }, 'PDF');
  await uiWait("!window.__preferencesQA.editor.getState().ui.printing", 'print finished');
  const content = (await fs.readFile(savedFile)).toString('latin1'); const match = content.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/); assert.ok(match, 'PDF page dimensions');
  const expected = paper === 'a4' ? [841.89, 595.28] : [792, 612]; assert.ok(Math.abs(Number(match[1]) - expected[0]) < 1.5); assert.ok(Math.abs(Number(match[2]) - expected[1]) < 1.5);
}

async function checkCoordinateOutput(project) {
  const previousDestination = savedFile;
  const id = project.performers[0].id;
  window.setContentSize(1366, 768);
  await number('Field zoom', 1);
  for (const precision of ['whole', 'half', 'quarter']) {
    await select('Coordinate precision', precision); await saved(); await done();
    const expected = coordinateDescription(project.sets[0].positions[id], project.field, { coordinatePrecision: precision });
    const dot = `.field-stage__svg [data-performer-id="${id}"]`;
    await evaluate(`document.querySelector(${JSON.stringify(dot)}).focus()`);
    await uiWait(`document.activeElement === document.querySelector(${JSON.stringify(dot)})`, 'coordinate performer focus');
    await sendKey(window, 'Return');
    await uiWait(`window.__preferencesQA.editor.getState().selection.selectedIds.length === 1 && window.__preferencesQA.editor.getState().selection.selectedIds[0] === ${JSON.stringify(id)}`, 'native coordinate performer selection');
    await uiWait(`document.querySelector('.selection-coordinate')?.textContent === ${JSON.stringify(expected)} && document.querySelector('.field-readout span')?.textContent === ${JSON.stringify(expected)}`, 'Inspector and field precision');
    assert.ok(await evaluate(`document.querySelector('[data-performer-id="${id}"]').getAttribute('aria-label').includes(${JSON.stringify(expected)})`));
    if (precision === 'quarter') {
      await evaluate('document.querySelector(\'.toast [aria-label="Dismiss notification"]\')?.click()');
      await evaluate("document.querySelector('.selected-performer').scrollIntoView({block:'center'})");
      await capturePage(window, output, 'coordinate-quarter-field.png');
      window.webContents.setZoomFactor(1.25); await capturePage(window, output, 'coordinate-enlarged.png');
      window.webContents.setZoomFactor(1); window.setContentSize(1120, 768); await capturePage(window, output, 'coordinate-narrow.png');
      window.setContentSize(1366, 768);
    }
    await click('.workspace-tab[aria-label="Cast"]');
    await uiWait("!!document.querySelector('[aria-label=\"Full Cast table\"]')", 'Cast dock');
    await click('[aria-label="Full Cast table"]');
    await uiWait(`document.querySelector('.coordinate-cell')?.textContent === ${JSON.stringify(expected)}`, 'Cast coordinate precision');
    await click('.workspace-tab[aria-label="Design"]');
    savedFile = path.join(output, `coordinates-${precision}-${process.pid}.csv`);
    native('Export drill book PDF…'); await uiWait("document.querySelector('.modal h2')?.textContent === 'Export'", 'export');
    await click('.export-options label:nth-child(2) input');
    await click('.export-secondary button:first-child');
    await waitFor(async () => { try { return (await fs.readFile(savedFile, 'utf8')).includes('"' + expected + '"'); } catch { return false; } }, 'native CSV precision');
    const editor = 'window.__preferencesQA.editor';
    await evaluate(`${editor}.setValue('ui','printing',true)`);
    await uiWait("document.querySelectorAll('#print-output .performer-page tbody tr').length === 6", 'dot sheet rows');
    assert.equal(await evaluate("document.querySelector('#print-output .performer-page tbody tr td:nth-child(3)').textContent"), expected);
    assert.equal(await evaluate("document.querySelectorAll('#print-output .performer-page tbody tr')[1].querySelector('td:nth-child(4)').textContent"), performerMoveOutput(project, 1, id, { coordinatePrecision: precision }).description);
    await evaluate(`${editor}.setValue('ui','printing',false); ${editor}.dispatch('playback.scrub',{count:4})`);
    const preview = coordinateDescription(sampleProject(project, 4).positions[id], project.field, { coordinatePrecision: precision });
    await uiWait(`!!document.querySelector('.field-preview-banner') && document.querySelector('.field-readout span')?.textContent === ${JSON.stringify(preview)}`, 'read-only preview coordinate precision');
    await evaluate(`${editor}.dispatch('set.select',{index:0}); ${editor}.setValue('selection','selectedIds',[])`);
    assert.deepEqual((await state()).project.present, project);
    await openPreferences();
    if (precision === 'quarter') {
      await evaluate('document.activeElement?.blur()'); await uiWait("!document.querySelector('[role=tooltip]')", 'clean preference capture');
      await capturePage(window, output, 'coordinate-preferences.png');
    }
  }
  pass('whole/half/quarter precision agrees across field focus, read-only previews, Inspector, Cast, native CSV and dot sheets without a production edit');
  savedFile = previousDestination;
}

app.whenReady().then(async () => {
  try {
    await waitFor(() => Boolean(window), 'window'); await uiWait("!!document.querySelector('.field-performer')", 'renderer');
    window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: '(' + instrument.toString() + ')()' }); window.webContents.reload();
    await uiWait("!!window.__preferencesQA?.editor && window.__preferencesQA.editor.getState().preferences.status !== 'loading'", 'preferences startup');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    // Preferences and recovery initialize independently. On restart, recovery
    // can offer its dialog after preferences load and block the native open.
    // Wait for that startup decision, then dismiss the actual recovery dialog.
    await uiWait("['Recovery ready', 'Recovery copies available'].includes(document.querySelector('.recovery-indicator')?.textContent)", 'recovery startup');
    if (await evaluate("window.__preferencesQA.editor.getState().ui.dialog === 'recovery'")) {
      await evaluate("[...document.querySelectorAll('.modal-actions button')].find(button => button.textContent === 'Continue editing').click()");
    }
    await uiWait("!document.querySelector('dialog[open]')", 'startup dialogs closed');
    native('Open project…'); await uiWait("window.__preferencesQA.editor.getState().fileSession.savedRevision !== null", 'opened fixture');
    const before = await state(); const original = before.project.present; const revision = before.project.revision;
    if (phase === 'write') {
      assert.match(await evaluate("document.querySelector('.statusbar').textContent"), /Shift \+ click/);
      await evaluate('document.activeElement?.blur()'); native('Select all');
      await uiWait("window.__preferencesQA.editor.getState().preferences.value.selectionHintDismissed", 'selection hint retired');
      await evaluate("window.__preferencesQA.editor.setValue('selection','selectedIds',[])");
      assert.doesNotMatch(await evaluate("document.querySelector('.statusbar').textContent"), /Shift \+ click/);
      pass('selecting performers retires the introductory hint after clearing selection without a project edit');
    }
    await openPreferences();
    if (phase === 'write') {
      assert.ok(before.preferences.error.includes('Older')); assert.equal(before.ui.zoom, 1.1);
      await checkCoordinateOutput(original);
      await done();
      for (const section of ['Set properties', 'Formation tools', 'Transition check']) {
        await evaluate(`document.querySelector('summary[aria-label="${section} section"]').focus()`);
        await sendKey(window, 'Return');
        const key = section === 'Set properties' ? 'inspectorSetOpen' : section === 'Formation tools' ? 'inspectorFormationOpen' : 'inspectorChecksOpen';
        await uiWait(`window.__preferencesQA.editor.getState().preferences.value.${key} === ${section !== 'Set properties'}`, 'disclosure preference updated');
      }
      await saved();
      const expansion = (await state()).preferences.value;
      assert.equal(expansion.inspectorSetOpen, false); assert.equal(expansion.inspectorFormationOpen, true); assert.equal(expansion.inspectorChecksOpen, true);
      assert.deepEqual((await state()).project.present, original);
      await openPreferences();
      await select('Panel layout', 'compact'); await select('Label visibility', 'none'); await toggle('Previous paths'); await toggle('Next paths'); await toggle('Field grid'); await toggle('Snap to grid');
      await select('Step grid', 6); await select('Grid subdivision', 2); await select('Group snapping', 'individual');
      await number('Field zoom', 1.6); await number('Nudge · yards', 1.25); await number('Fast nudge', 5);
      await select('Nudge units','steps'); await number('Rotate preset · degrees',30); await number('Scale preset · %',25);
      await select('Coordinate precision', 'half'); await select('Paper', 'a4'); await select('Packet default', 'coordinates'); await select('Shape', 'block');
      await number('Width · yards', 30); await number('Depth · yards', 15); await number('Rotation', 30); await number('Block columns', 4); await number('Spacing', 2); await number('Stride', .75);
      await saved();
      await select('Audience orientation', 'audience-top');
      await select('Label visibility', 'selected');
      await number('Dot radius', 5); await number('Label size', 16);
      await select('Performer coloring', 'custom');
      await evaluate("(() => {const n=document.querySelector('[aria-label=\"Custom performer color\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'#ee99dd');n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}))})()");
      await saved();
      const chosen = (await state()).preferences.value; await fs.writeFile(path.join(output, 'expected.json'), JSON.stringify(chosen));
      await number('Nudge · steps', '', false); assert.equal((await state()).ui.pendingDraft, false); assert.equal((await state()).project.revision, revision);
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
      assert.deepEqual(other.snapping, { steps:12, subdivision:4, target:'markings', group:'anchor' });
      pass('opening another production retains its own grid, field, timing and audio rules and the personal defaults');
      assert.equal((await fs.readdir(profile)).filter(name => name.startsWith('preferences-preserved-')).length, 1);
      pass('the older preferences original is preserved when the upgraded file is written');
    } else if (phase === 'restart') {
      const expected = JSON.parse(await fs.readFile(path.join(output, 'expected.json'), 'utf8')); assert.deepEqual((await state()).preferences.value, expected); assert.equal((await state()).ui.zoom, 1.6);
      assert.equal(expected.selectionHintDismissed, true);
      assert.equal(expected.fieldOrientation, 'audience-top'); assert.equal(expected.fieldDotRadiusPx, 5); assert.equal(expected.fieldLabelSizePx, 16);
      assert.equal(expected.selectionLabelsOnly, true); assert.equal(expected.fieldColorMode, 'custom'); assert.equal(expected.fieldCustomColor, '#ee99dd');
      assert.equal(expected.coordinatePrecision, 'half');
      assert.equal(expected.nudgeUnit,'steps'); assert.equal(expected.rotationStep,30); assert.equal(expected.scaleStep,25);
      assert.deepEqual(expected.snapDefaults, { steps:6, subdivision:2, target:'grid', group:'individual' });
      assert.equal(expected.inspectorSetOpen, false); assert.equal(expected.inspectorFormationOpen, true); assert.equal(expected.inspectorChecksOpen, true);
      for (const [key, open] of [['inspectorSetOpen', false], ['inspectorFormationOpen', true], ['inspectorChecksOpen', true]]) {
        assert.equal(await evaluate(`document.querySelector('[data-inspector-section="${key}"]').open`), open);
      }
      assert.doesNotMatch(await evaluate("document.querySelector('.statusbar').textContent"), /Shift \+ click/);
      assert.ok(await evaluate("document.querySelector('.studio').classList.contains('studio--compact')"));
      const audit = await evaluate('(' + auditText.toString() + ')()'); assert.deepEqual(audit.failures, []); assert.ok(audit.checked > 100);
      const [width, height] = window.getSize(); window.setSize(width + 1, height); await pause(150);
      await fs.writeFile(path.join(output, 'preferences.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()); await done();
      pass('representative layout, toggles, zoom, increments, shape, coordinate, paper and threshold settings survive a new desktop process');
      const id = original.performers[0].id; const point = original.sets[0].positions[id];
      await evaluate(`window.__preferencesQA.editor.setValue('selection','selectedIds',[${JSON.stringify(id)}]); document.querySelector('[data-performer-id="${id}"]').focus()`);
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Left', modifiers: ['alt'] }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Left', modifiers: ['alt'] }); await pause(100);
      assert.equal((await state()).project.present.sets[0].positions[id].x, point.x + .78125); native('Undo drill edit'); await uiWait(`window.__preferencesQA.editor.getState().project.present.sets[0].positions[${JSON.stringify(id)}].x === ${point.x}`, 'undo nudge');
      pass('the saved step unit and nudge amount control actual field keyboard movement; rotation/scale increments also survive restart');
      await pdf('a4'); await openPreferences(); await select('Paper', 'letter'); await saved(); await done(); await pdf('letter');
      pass('native PDF exports honor A4 and Letter landscape page dimensions');
      native('New production'); await uiWait("document.querySelector('.modal h2')?.textContent === 'New production'", 'new grid production');
      await click('.new-options button:first-child');
      await uiWait("window.__preferencesQA.editor.getState().project.present.performers.length === 0", 'blank grid show');
      assert.deepEqual((await state()).project.present.snapping, expected.snapDefaults);
      savedFile = path.join(output, 'new-grid-show.squid'); native('Save As…');
      await waitFor(async () => { try { return JSON.parse(await fs.readFile(savedFile, 'utf8')).snapping?.steps === 6; } catch { return false; } }, 'new grid show saved');
      await uiWait("window.__preferencesQA.editor.getState().fileSession.fileOperation === null", 'new grid save completed');
      openedFile = fixtureFile; native('Open project…'); await uiWait("window.__preferencesQA.editor.getState().project.present.performers.length > 0", 'original show reopened');
      assert.deepEqual((await state()).project.present, original);
      pass('placement defaults survive restart, seed and save a new show, and never override an opened show');
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

