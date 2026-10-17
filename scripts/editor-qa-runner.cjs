'use strict';
const { capturePage, waitFor: waitUntil, key: sendKey, settleNativeViewport } = require('./testing/renderer.cjs');
const { app, BrowserWindow, dialog, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const manifestArg = process.argv.find(value => value.startsWith('--editor-qa-manifest='));
if (!manifestArg) throw new Error('Run through scripts/editor-qa.mjs.');
const manifest = require(manifestArg.slice('--editor-qa-manifest='.length));
const { root, output, profile } = manifest;
const checks = [];
let window;
let openPath = path.join(output, 'boundary.squid');
const savedFile = path.join(output, `saved-${process.pid}.squid`);
let destination = savedFile;
let saves = 0;
let cancelSave = false;
let saveGate;
let releaseSave;
let saveDialogWaiting = false;
let messageResponse = 1;
const messages = [];
let scriptFailure;
app.setPath('userData', profile);
// The production main owns all security settings and handlers. Only suppress its show call.
BrowserWindow.prototype.show = function () {};
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [openPath] });
dialog.showSaveDialog = async () => {
  saves++;
  if (saveGate) { saveDialogWaiting = true; await saveGate; saveGate = undefined; saveDialogWaiting = false; }
  return { canceled: cancelSave, filePath: destination };
};
dialog.showMessageBox = async (_window, options) => { messages.push(options); return { response: messageResponse }; };
dialog.showErrorBox = (_title, message) => { scriptFailure = new Error(message); };
app.on('browser-window-created', (_event, created) => {
  window = created;
  created.webContents.setBackgroundThrottling(false);
  created.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message); });
  created.webContents.on('render-process-gone', (_event, details) => { scriptFailure = new Error(`Renderer exited: ${details.reason}`); });
});

require(path.join(root, 'electron', 'main.cjs'));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => window.webContents.executeJavaScript(source);
const waitFor = (condition, label) => waitUntil(condition, label, { timeoutMs: 15000, failure: () => scriptFailure });
const uiWait = (source, label) => waitFor(() => evaluate(source), label);
async function clickText(text, scope = 'body', allowDisabled = false) {
  await evaluate(`(() => { const button = [...document.querySelector(${JSON.stringify(scope)}).querySelectorAll('button')].find(node => node.textContent.trim() === ${JSON.stringify(text)}); if (!button || ((button.disabled || button.getAttribute('aria-disabled') === 'true') && !${allowDisabled})) throw new Error('Button unavailable: ' + ${JSON.stringify(text)}); if (!button.disabled && button.getAttribute('aria-disabled') !== 'true') button.click(); })()`);
  await pause(30);
}
async function clickSelector(selector) {
  await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node || node.disabled || node.getAttribute('aria-disabled') === 'true') throw new Error('Control unavailable: ' + ${JSON.stringify(selector)}); node.click(); })()`);
  await pause(30);
  if (selector.startsWith('.set-card')) await uiWait(`document.querySelector(${JSON.stringify(selector)})?.classList.contains('selected')`, 'set selection');
}
const numberSelector = label => `([...document.querySelectorAll('label.form-label')].find(node => node.firstChild?.textContent === ${JSON.stringify(label)})?.querySelector('input'))`;
async function editNumber(label, value) {
  await evaluate(`(() => { const input = ${numberSelector(label)}; if (!input || input.disabled) throw new Error('Number field unavailable'); input.focus(); input.select(); })()`);
  await window.webContents.debugger.sendCommand('Input.insertText', { text: String(value) });
  await pause(20);
  await evaluate(`${numberSelector(label)}.blur()`);
  await pause(30);
}
async function keyOnNumber(label, key) {
  await evaluate(`(() => { const input = ${numberSelector(label)}; input.focus(); input.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true })); })()`);
  await pause(30);
}
function menuAction(label) {
  function find(menu) {
    for (const item of menu?.items || []) { if (item.label === label) return item; const nested = find(item.submenu); if (nested) return nested; }
  }
  const item = find(Menu.getApplicationMenu());
  if (!item?.click) throw new Error(`Native menu unavailable: ${label}`);
  item.click(item, window, {});
}
async function savedProject(expected, filename = savedFile) {
  let project;
  await waitFor(async () => {
    try { project = JSON.parse(await fs.readFile(filename, 'utf8')); return expected(project); } catch { return false; }
  }, 'saved project contents');
  return project;
}
const pass = label => { checks.push(label); console.log(`PASS ${label}`); };

async function scrubCount(count) {
  await evaluate(`(() => { const input = document.querySelector('.timeline-scrubber'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${count}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await pause(50);
}
async function screenPoint(x, y) {
  return evaluate(`(() => { const point = new DOMPoint(${x}, ${y}).matrixTransform(document.querySelector('.field-stage__svg').getScreenCTM()); return { x: point.x, y: point.y }; })()`);
}
async function hoverPoint(x, y) {
  const point = await screenPoint(x, y);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await pause(60);
}
const capture = name => capturePage(window, output, name);

async function focusFieldPerformer(selector) {
  const index = await evaluate(`[...document.querySelectorAll('.field-performer')].findIndex(node => node.matches(${JSON.stringify(selector)}))`);
  assert.ok(index >= 0, `Performer exists: ${selector}`);
  await evaluate("document.querySelector('[aria-label=\"Fit field\"]').focus()");
  await sendKey(window, 'Tab'); await sendKey(window, 'Home');
  for (let step = 0; step < index; step++) await sendKey(window, 'PageDown');
  await uiWait(`document.activeElement?.matches(${JSON.stringify(selector)})`, 'keyboard performer focus');
}

async function typeText(selector, text) {
  await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) throw new Error('Text field unavailable'); input.focus(); input.select(); })()`);
  for (const character of text) await window.webContents.debugger.sendCommand('Input.insertText', { text: character });
  await pause(30);
}
async function fieldKey(selector, key) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }))`);
  await pause(30);
}
async function colorValue(selector, color) {
  await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(color)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await pause(30);
}
async function openHistory() {
  await clickSelector('[aria-label="History"]');
  await uiWait("document.querySelector('.modal h2')?.textContent === 'History'", 'history panel');
  return evaluate("[...document.querySelectorAll('.history-list:not(.future) li')].map(node => node.querySelector('span').textContent)");
}

async function checkActionClarity() {
  window.setContentSize(1366, 768);
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  const inventory = await evaluate("[...document.querySelectorAll('button')].map(n=>({name:n.getAttribute('aria-label'),text:n.textContent.trim(),icon:n.querySelector('svg')?.getAttribute('class')}))");
  await fs.writeFile(path.join(output, 'control-inventory.json'), JSON.stringify(inventory, null, 2));
  assert.equal(inventory.filter(n => n.name === 'Add set').length, 1);
  assert.equal(inventory.filter(n => n.name === 'Help').length, 1);
  const icon = name => inventory.find(n => n.name === name)?.icon;
  const distinct = ['Show paths from previous set', 'Show paths to next set', 'Select all performers', 'Show performer labels', 'Attach audio', 'Metronome'].map(icon);
  assert.ok(distinct.every(Boolean)); assert.equal(new Set(distinct).size, distinct.length);
  await capture('action-clarity-design.png');
  for (const [action, heading] of [['New production', 'New production'], ['Production settings', 'Production settings'], ['Preferences', 'Preferences']]) {
    await evaluate('document.querySelector(\'[aria-label="Project menu"]\').focus()');
    await sendKey(window, 'Return'); await uiWait("!!document.querySelector('.dropdown')", 'project menu');
    await evaluate(`document.querySelector('[aria-label="${action}"]').focus()`);
    await sendKey(window, 'Return');
    await uiWait(`document.querySelector('.modal h2')?.textContent === '${heading}'`, heading);
    await clickSelector('.modal [aria-label="Close dialog"]');
  }
  await evaluate('document.querySelector(\'[aria-label="Export"]\').focus()'); await sendKey(window, 'Return');
  await uiWait("document.querySelector('.modal h2')?.textContent === 'Export'", 'export');
  await clickSelector('.modal [aria-label="Close dialog"]');
  await clickSelector('[aria-label="Help"]');
  await uiWait("document.querySelector('.modal h2')?.textContent === 'Help'", 'help');
  assert.match(await evaluate("document.querySelector('.modal').textContent"), /Review body clearance and traffic/);
  await capture('action-clarity-help.png');
  await clickSelector('.modal [aria-label="Close dialog"]');
  menuAction('Squidware Help'); await uiWait("document.querySelector('.modal h2')?.textContent === 'Help'", 'native help');
  await clickSelector('.modal [aria-label="Close dialog"]');
  pass('one Add set and Help control; distinct audited icons; keyboard menu, settings, preferences, export and native Help remain reachable');
  const point = await evaluate("(() => {const r=document.querySelector('.field-legend button').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
  for (const type of ['mouseDown', 'mouseUp']) window.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 });
  await uiWait("document.querySelector('.field-legend button').getAttribute('aria-pressed') === 'true'", 'pointer section selection');
  assert.equal(await evaluate("document.querySelector('.selection-count').textContent"), '24 selected');
  await evaluate("document.querySelectorAll('.field-legend button')[0].focus()"); await sendKey(window, 'Tab'); await sendKey(window, 'Return');
  await uiWait("document.querySelectorAll('.field-legend button')[1].getAttribute('aria-pressed') === 'true'", 'keyboard section selection');
  assert.equal(await evaluate("document.querySelectorAll('.field-legend button')[0].getAttribute('aria-pressed')"), 'false');
  await clickSelector('[aria-label="Clear selection"]');
  await uiWait("document.querySelector('.selection-count').textContent === '0 selected'", 'selection cleared');
  assert.doesNotMatch(await evaluate("document.querySelector('.statusbar').textContent"), /Shift \+ click/);
  await clickSelector('[aria-label="Select all performers"]');
  await uiWait("!!document.querySelector('.canvas-toolbar [aria-label=\"Clear selection\"]')", 'select-all becomes clear');
  await evaluate('document.querySelector(\'.canvas-toolbar [aria-label="Clear selection"]\').focus()'); await sendKey(window, 'Return');
  await uiWait("document.querySelector('.selection-count').textContent === '0 selected'", 'toolbar clear selection');
  assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'Unsaved changes');
  await clickSelector('.workspace-tab[aria-label="Cast"]'); await uiWait("!!document.querySelector('.cast-dock h2') && !!document.querySelector('.field-stage__svg')", 'Cast beside field');
  await clickSelector('.workspace-tab[aria-label="Production sheet"]'); await uiWait("document.querySelector('h1').textContent.startsWith('Production sheet')", 'sheet heading');
  await clickSelector('.workspace-tab[aria-label="Design"]');
  pass('native pointer and Tab/Enter select sections with pressed state; hint stays retired after clearing; Cast and Production sheet have direct headings');
}

async function checkCompactChrome() {
  const measurements = [];
  for (const [width, scale] of [[1366, 1], [1366, 1.25], [1120, 1], [1120, 1.25]]) {
    window.setContentSize(width, 768); window.webContents.setZoomFactor(scale);
    await settleNativeViewport(window, 'compact viewport scale applied');
    await clickSelector('[aria-label="Project menu"]'); await clickSelector('[aria-label="New production"]');
    await clickSelector('.new-options button:nth-child(2)');
    await uiWait("document.querySelectorAll('.field-performer').length === 64", 'compact demo creation');
    if (await evaluate("!!document.querySelector('[aria-label=\"Dismiss notification\"]')")) await clickSelector('[aria-label="Dismiss notification"]');
    const measure = await evaluate(`(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
      const required = ['Save','Undo','Export','Design','Cast','Production sheet','Help','Project menu','Play show','Add set','Fit field','2D field','3D preview'];
      const clipped = required.filter(name => { const node = document.querySelector('[aria-label="'+name+'"]'); if (!node) return true; const r=node.getBoundingClientRect(); const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return r.width===0 || r.left<0 || r.right>innerWidth+.5 || r.top<0 || r.bottom>innerHeight+.5 || !node.contains(top); });
      return { viewport:{width:innerWidth,height:innerHeight}, header:rect('.app-header'), toolbar:rect('.canvas-toolbar'), field:rect('.field-container'), timeline:rect('.timeline'), statusbar:rect('.statusbar'), clipped, emptyAudioLane:!!document.querySelector('.audio-track'), legendInField:!!document.querySelector('.field-container .field-legend') };
    })()`);
    measurements.push({ width, scale, ...measure });
    assert.deepEqual(measure.clipped, [], `Required controls at ${width}px / ${scale}×`);
    assert.equal(measure.emptyAudioLane, false); assert.equal(measure.legendInField, true);
    if (width === 1366 && scale === 1) {
      assert.ok(measure.header.height <= 50); assert.ok(measure.field.height >= 470); assert.ok(measure.timeline.height <= 125);
    }
    await capture(`compact-${width}-${scale}.png`);
    // Exercise native input at both scales, including a narrow enlarged window.
    await clickSelector('[aria-label="Add set"]');
    const name = `Compact ${width} ${scale}`;
    await typeText('.inspector input[aria-label="Set name"]', name); await fieldKey('.inspector input[aria-label="Set name"]', 'Enter');
    await editNumber('Counts', 12);
    await uiWait(`document.querySelector('.canvas-set-title').textContent.includes(${JSON.stringify(name)})`, 'canvas set name');
    await evaluate('document.querySelector(\'[aria-label="Play show"]\').focus()'); await sendKey(window, 'Return');
    await uiWait("!!document.querySelector('[aria-label=\"Pause playback\"]') && Number(document.querySelector('.count-display strong').textContent)>0", 'compact playback advances');
    await evaluate('document.querySelector(\'[aria-label="Pause playback"]\').focus()'); await sendKey(window, 'Return');
    await clickSelector('.set-card:nth-child(2)');
    destination = path.join(output, `compact-${width}-${scale}-${process.pid}.squid`);
    await evaluate('document.querySelector(\'[aria-label="Save"]\').focus()'); await sendKey(window, 'Return');
    const saved = await savedProject(p => p.sets.some(set => set.name === name), destination);
    assert.equal(saved.moves.find(move => move.toSetId === saved.sets.find(set => set.name === name).id).counts, 12);
    await uiWait("document.querySelector('.save-state').textContent === 'Project file saved'", 'compact saved status');
    // Real audio decoding adds the lane only after a track is attached.
    const wav = Buffer.alloc(44 + 16000);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16);
    wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28);
    wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(16000,40);
    const audioFile = path.join(output, 'compact-audio.wav'); await fs.writeFile(audioFile, wav);
    const { root: dom } = await window.webContents.debugger.sendCommand('DOM.getDocument');
    const { nodeId } = await window.webContents.debugger.sendCommand('DOM.querySelector', { nodeId:dom.nodeId, selector:'input[accept="audio/*"]' });
    await window.webContents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files:[audioFile] });
    await uiWait("!!document.querySelector('.audio-track.has-audio')", 'attached audio lane');
    measurements.at(-1).attachedAudioFieldHeight = await evaluate("document.querySelector('.field-container').getBoundingClientRect().height");
    assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'Project file saved');
    if (width === 1366 && scale === 1) await capture('compact-attached-audio.png');
  }
  await fs.writeFile(path.join(output, 'compact-measurements.json'), JSON.stringify(measurements, null, 2));
  window.webContents.setZoomFactor(1); window.setContentSize(1366, 768);
  await settleNativeViewport(window, 'restored compact viewport');
  pass('compact field/header/timeline budgets, no empty audio lane, decoded audio, and unclipped create/edit/play/save at 1366/1120 px and 100/125% scale');
}

async function checkSelectionInspector() {
  openPath = path.join(output, 'selection.squid');
  menuAction('Open project…');
  await uiWait("document.querySelector('.project-title').textContent.includes('Selection Inspector QA')", 'selection fixture');
  window.setContentSize(1366, 768); window.webContents.setZoomFactor(1);
  await settleNativeViewport(window, 'selection Inspector viewport');
  const fixture = JSON.parse(await fs.readFile(openPath, 'utf8'));
  async function selectionCapture(name) {
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
    await evaluate('document.querySelector(\'.toast [aria-label="Dismiss notification"]\')?.click(); document.activeElement?.blur()');
    await uiWait("!document.querySelector('.toast')", 'clean selection capture');
    await uiWait("!document.querySelector('[role=tooltip]')", 'selection help dismissed for capture');
    await evaluate("document.querySelector('.inspector-scroll').scrollTop = 0");
    await capture(name);
  }
  let saveSequence = 0;
  async function snapshot() {
    destination = path.join(output, `selection-${process.pid}-${saveSequence++}.squid`);
    menuAction('Save As…');
    const saved = await savedProject(p => p.title === fixture.title, destination);
    await uiWait("document.querySelector('.save-state').textContent === 'Project file saved'", 'selection snapshot saved');
    return saved;
  }
  async function pointer(selector) {
    const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`);
    for (const type of ['mouseDown', 'mouseUp']) window.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 });
  }
  async function keyboard(selector) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`); await sendKey(window, 'Return');
  }
  const section = name => `summary[aria-label="${name} section"]`;
  async function cancelNumberDraft(label, sectionName) {
    const input = numberSelector(label);
    if (!await evaluate(`${input}.closest('details').open`)) await keyboard(section(sectionName));
    await uiWait(`${input}.getBoundingClientRect().height > 0`, 'number draft visible for cancellation');
    await evaluate(`${input}.focus()`);
    await uiWait(`document.activeElement === ${input}`, 'number draft focused for cancellation');
    await sendKey(window, 'Escape');
    await uiWait(`${input}.getAttribute('aria-invalid') === 'false'`, 'number draft canceled');
  }

  // Inspect collapsed sections without discarding their mounted drafts.
  if (await evaluate("document.querySelector('.formation-section').open")) await keyboard(section('Formation tools'));
  if (!await evaluate("document.querySelector('[data-inspector-section=inspectorSetOpen]').open")) await keyboard(section('Set properties'));
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Shape selection\"]').getAttribute('aria-disabled')"), 'true');
  await keyboard(section('Formation tools'));
  await keyboard('[aria-label="Preview formation"]');
  assert.deepEqual(await snapshot(), fixture, 'empty selection does not reshape the ensemble');
  await selectionCapture('selection-empty.png');

  await pointer(`[data-performer-id="${fixture.performers[0].id}"]`);
  await uiWait("document.querySelector('.selection-count').textContent === '1 selected'", 'single selection');
  assert.match(await evaluate("document.querySelector('.selection-bounds').textContent"), /X 30 · Y 20 yd/);
  assert.equal(await evaluate("!!document.querySelector('.exact-position')"), true);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Rotate selection\"]').getAttribute('aria-disabled')"), null);
  await selectionCapture('selection-single.png');

  await pointer('.field-legend button:first-child');
  await uiWait("document.querySelector('.selection-count').textContent === '2 selected'", 'group selection');
  assert.match(await evaluate("document.querySelector('.selection-bounds').textContent"), /Center 33, 20 ydBounds 6 × 0 yd/);
  assert.equal(await evaluate("!!document.querySelector('.exact-position')"), false);
  await keyboard('[aria-label="Move selection"]');
  await uiWait("document.activeElement.getAttribute('aria-label') === 'Move selection left'", 'move action focus');
  await sendKey(window, 'Tab');
  assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), 'Move selection right');
  await sendKey(window, 'Return');
  const moved = await snapshot();
  for (const [i, performer] of fixture.performers.entries()) {
    assert.deepEqual(moved.sets[0].positions[performer.id], {x:fixture.sets[0].positions[performer.id].x + (i < 2 ? .625 : 0), y:fixture.sets[0].positions[performer.id].y});
  }
  assert.deepEqual(moved.sets[1], fixture.sets[1]);
  const moveHistory = await openHistory(); assert.equal(moveHistory.length, 1); assert.match(moveHistory[0], /Transform 2 performers/);
  await clickSelector('.modal [aria-label="Close dialog"]');
  menuAction('Undo drill edit'); assert.deepEqual(await snapshot(), fixture);
  await keyboard('[aria-label="Rotate selection"]');
  await uiWait("!!document.querySelector('.transform-panel')", 'rotate preview panel');
  await uiWait("document.activeElement.getAttribute('aria-label') === 'Transform operation'", 'transform panel focus');
  await editNumber('Angle · degrees', 15);
  await keyboard('[aria-label="Apply transform"]');
  await uiWait("!document.querySelector('.transform-panel')", 'rotation applied');
  const rotated = await snapshot();
  const first = rotated.sets[0].positions[fixture.performers[0].id];
  assert.ok(Math.abs(first.x - (33 - 3 * Math.cos(Math.PI / 12))) < 1e-9);
  assert.ok(Math.abs(first.y - (20 - 3 * Math.sin(Math.PI / 12))) < 1e-9);
  menuAction('Undo drill edit'); assert.deepEqual(await snapshot(), fixture);
  pass('selection bar reports single coordinates and group bounds; native pointer/keyboard moves and rotates only the selection with one undo');

  await keyboard('[aria-label="Shape selection"]');
  await uiWait("document.activeElement?.matches('.formation-grid button')", 'formation reveal settled before unrelated text draft');
  await typeText('input[aria-label="Set name"]', 'Unrelated set draft');
  await uiWait("document.activeElement?.matches('input[aria-label=\"Set name\"]') && document.activeElement.value==='Unrelated set draft'", 'unrelated text draft focused');
  await sendKey(window, 'Escape');
  // A contextual formation draft survives collapse until canceled; selection changes discard the preview.
  await editNumber('Width · yd', 0);
  await keyboard(section('Formation tools'));
  await keyboard(section('Formation tools'));
  assert.equal(await evaluate(`${numberSelector('Width · yd')}.value`), '0');
  assert.equal(await evaluate(`${numberSelector('Width · yd')}.getAttribute('aria-invalid')`), 'true');
  await cancelNumberDraft('Width · yd', 'Formation tools');
  await pointer('.field-legend button:nth-child(2)');
  await uiWait("!document.querySelector('.formation-parameters')", 'selection change discards contextual preview');
  assert.deepEqual(await snapshot(), fixture);
  // Set properties are unrelated to selection and must also retain incomplete input.
  await clickSelector('.set-card:nth-child(2)');
  await editNumber('Counts', 0);
  await pointer('.field-legend button:first-child');
  await keyboard(section('Set properties')); await keyboard(section('Set properties'));
  assert.equal(await evaluate(`${numberSelector('Counts')}.value`), '0');
  assert.equal(await evaluate(`${numberSelector('Counts')}.getAttribute('aria-invalid')`), 'true');
  await cancelNumberDraft('Counts', 'Set properties');
  pass('collapsed formation drafts survive until cancellation; changed selection cancels contextual previews and preserves unrelated invalid set drafts');

  await keyboard('[aria-label="Shape selection"]');
  await keyboard('[aria-label="Line formation"]'); await editNumber('Width · yd', 10);
  await uiWait("document.querySelector('[aria-label=\"Line formation\"]').getAttribute('aria-pressed') === 'true'", 'line chosen');
  await keyboard('[aria-label="Apply formation"]');
  const shaped = await snapshot();
  assert.deepEqual(shaped.sets[0], fixture.sets[0]);
  for (const [i, performer] of fixture.performers.entries()) {
    assert.deepEqual(shaped.sets[1].positions[performer.id], i < 2 ? {x:i===0?28:38,y:20} : fixture.sets[1].positions[performer.id]);
  }
  const shapeHistory = await openHistory(); assert.equal(shapeHistory.length,1); assert.match(shapeHistory[0],/Apply line to 2 performers/);
  await clickSelector('.modal [aria-label="Close dialog"]');
  menuAction('Undo drill edit'); assert.deepEqual(await snapshot(),fixture);
  pass('keyboard formation application reshapes only the explicitly selected pair on the active set and undoes in one step');

  const measurements = [];
  for (const [width, scale] of [[1366, 1], [1366, 1.25], [1120, 1], [1120, 1.25]]) {
    window.setContentSize(width, 768); window.webContents.setZoomFactor(scale);
    await settleNativeViewport(window, 'selection viewport');
    await evaluate('document.activeElement?.blur()');
    const clipped = await evaluate(`['Move selection','Rotate selection','Shape selection','Mirror selection','Align selection'].filter(name => {
      const n=document.querySelector('[aria-label="'+name+'"]'); const r=n.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return r.width===0 || r.left<0 || r.right>innerWidth+.5 || r.top<0 || r.bottom>innerHeight+.5 || !n.contains(hit);
    })`);
    assert.deepEqual(clipped, []);
    const fieldHeight = await evaluate("document.querySelector('.field-container').getBoundingClientRect().height");
    if (width===1366 && scale===1) assert.ok(fieldHeight>=470);
    measurements.push({width,scale,fieldHeight,clipped});
    await selectionCapture(`selection-group-${width}-${scale}.png`);
  }
  window.webContents.setZoomFactor(1); window.setContentSize(1366,768);
  await settleNativeViewport(window, 'restored selection viewport');
  await keyboard('[aria-label="Mirror selection"]');
  await uiWait("!!document.querySelector('.transform-panel')", 'mirror preview open');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Mirror selection\"]').getAttribute('aria-disabled')"), 'true');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Align selection\"]').getAttribute('aria-disabled')"), 'true');
  assert.deepEqual(await snapshot(), fixture);
  await keyboard('[aria-label="Cancel transform"]');
  await uiWait("!document.querySelector('.transform-panel')", 'mirror preview canceled');
  await scrubCount(1);
  await uiWait("document.querySelector('.selection-bar .return-to-set') !== null", 'preview selection recovery');
  for (const name of ['Move selection','Rotate selection','Shape selection','Preview formation']) {
    assert.equal(await evaluate(`document.querySelector('[aria-label="${name}"]').getAttribute('aria-disabled')`), 'true');
  }
  await selectionCapture('selection-preview.png');
  await keyboard('.selection-bar .return-to-set');
  await uiWait("!document.querySelector('.field-preview-banner')", 'selection return to set');
  await fs.writeFile(path.join(output,'selection-measurements.json'),JSON.stringify(measurements,null,2));
  pass('selection actions remain unclipped at 1366/1120 px and 100/125%; preview locks edits and offers keyboard recovery; mirrors preview and future alignment explains availability');
}


async function checkExactTransforms() {
  openPath = path.join(output, 'selection.squid'); menuAction('Open project…');
  await uiWait("document.querySelector('.project-title').textContent.includes('Selection Inspector QA') && document.querySelector('.set-card:first-child').classList.contains('selected')", 'exact transform fixture');
  window.setContentSize(1366,768); window.webContents.setZoomFactor(1);
  await settleNativeViewport(window, 'exact transform viewport');
  const fixture=JSON.parse(await fs.readFile(openPath,'utf8')); const ids=fixture.performers.slice(0,2).map(p=>p.id);
  let sequence=0;
  async function keyboard(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`); await sendKey(window,'Return'); }
  async function savedSnapshot() {
    destination=path.join(output,`transform-${process.pid}-${sequence++}.squid`); menuAction('Save As…');
    const project=await savedProject(p=>p.title===fixture.title,destination);
    await uiWait("document.querySelector('.save-state').textContent === 'Project file saved'",'transform snapshot'); return project;
  }
  async function choose(label,value) {
    await evaluate(`(() => { const n=document.querySelector('select[aria-label="${label}"]'); n.value=${JSON.stringify(value)}; n.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await uiWait(`document.querySelector('select[aria-label="${label}"]').value === ${JSON.stringify(value)}`,'transform choice');
  }
  async function open(operation='Rotate selection') {
    await keyboard(`[aria-label="${operation}"]`); await uiWait("!!document.querySelector('.transform-panel')",'exact preview open');
    await uiWait("document.activeElement.getAttribute('aria-label')==='Transform operation'",'exact panel keyboard focus');
  }
  async function cancel() { await keyboard('[aria-label="Cancel transform"]'); await uiWait("!document.querySelector('.transform-panel')",'exact preview canceled'); }
  async function apply() { await keyboard('[aria-label="Apply transform"]'); await uiWait("!document.querySelector('.transform-panel')",'exact preview applied'); }
  const displayed = () => evaluate("Object.fromEntries([...document.querySelectorAll('[data-performer-id]')].map(n=>{const m=n.transform.baseVal.consolidate().matrix;return [n.dataset.performerId,{x:m.e,y:m.f}]}))");
  function near(actual,expected) { for(const id of ids) for(const axis of ['x','y']) assert.ok(Math.abs(actual[id][axis]-expected[id][axis])<.0001,`${id} ${axis}: ${actual[id][axis]} vs ${expected[id][axis]}`); }
  async function nativeDrag(kind, convert, escape=false) {
    const geometry=await evaluate(`(() => { const get=kind=>{const m=document.querySelector('[data-transform-handle="'+kind+'"]').transform.baseVal.consolidate().matrix;return {x:m.e,y:m.f}};return {start:get('${kind}'),pivot:get('pivot')}; })()`);
    const end=convert(geometry.start,geometry.pivot); const start=await screenPoint(geometry.start.x,geometry.start.y); const target=await screenPoint(end.x,end.y);
    for(const event of [{type:'mouseMoved',...start},{type:'mousePressed',...start,button:'left',buttons:1,clickCount:1},{type:'mouseMoved',...target,button:'left',buttons:1}]) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',event);
    if(escape) await sendKey(window,'Escape');
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...target,button:'left',buttons:0,clickCount:1});
  }
  async function captureExact(name) {
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
    await evaluate('document.querySelector(\'.toast [aria-label="Dismiss notification"]\')?.click(); document.activeElement?.blur(); document.querySelector(\'.inspector-scroll\').scrollTop=0');
    await uiWait("!document.querySelector('[role=tooltip]') && !document.querySelector('.toast')",'clean transform evidence'); await capture(name);
  }
  await keyboard('.field-legend button:first-child'); await uiWait("document.querySelector('.selection-count').textContent==='2 selected'",'exact selection');
  assert.deepEqual(await savedSnapshot(),fixture);
  await open(); await editNumber('Angle · degrees',90);
  const typed=await displayed(); near(typed,{[ids[0]]:{x:33,y:17},[ids[1]]:{x:33,y:23}});
  assert.deepEqual(await savedSnapshot(),fixture,'preview must not leak into a project save');
  await captureExact('transform-rotation.png');
  const layout=[];
  for(const [width,zoom] of [[1366,1],[1366,1.25],[1120,1],[1120,1.25]]) {
    window.setContentSize(width,768); window.webContents.setZoomFactor(zoom);
    await settleNativeViewport(window, 'transform viewport');
    const clipped=await evaluate(`['Apply transform','Cancel transform','Save','Undo','Export'].filter(name=>{const n=document.querySelector('[aria-label="'+name+'"]');const r=n.getBoundingClientRect();return r.width===0||r.left<0||r.right>innerWidth+.5||r.top<0||r.bottom>innerHeight+.5||!n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})`);
    assert.deepEqual(clipped,[]); layout.push({width,zoom,clipped}); await captureExact(`transform-${width}-${zoom}.png`);
  }
  window.setContentSize(1366,768); window.webContents.setZoomFactor(1); await settleNativeViewport(window, 'restored transform viewport'); await cancel();
  near(await displayed(),fixture.sets[0].positions); assert.deepEqual(await savedSnapshot(),fixture);
  await open();
  await nativeDrag('rotate',(p,c)=>({x:c.x-(p.y-c.y),y:c.y+(p.x-c.x)}));
  await uiWait(`Math.abs(Number(${numberSelector('Angle · degrees')}.value)-90)<.0001`,'native rotation preview');
  near(await displayed(),typed); assert.deepEqual(await savedSnapshot(),fixture);
  await apply(); const committed=await savedSnapshot(); near(committed.sets[0].positions,typed);
  assert.deepEqual(committed.sets[1],fixture.sets[1]); for(const p of fixture.performers.slice(2)) assert.deepEqual(committed.sets[0].positions[p.id],fixture.sets[0].positions[p.id]);
  const history=await openHistory(); assert.equal(history.length,1); assert.match(history[0],/Rotate\/scale 2 performers/); await clickSelector('.modal [aria-label="Close dialog"]');
  menuAction('Undo drill edit'); assert.deepEqual(await savedSnapshot(),fixture);
  pass('typed and native dragged rotation agree; saves retain original geometry during preview; Apply affects selected/current-set dots with one undo');

  await open();
  await clickSelector('[aria-label="Zoom in"]'); await clickSelector('[aria-label="Zoom in"]'); await clickSelector('[aria-label="Zoom in"]');
  await nativeDrag('scale',(p,c)=>({x:c.x+2*(p.x-c.x),y:c.y+2*(p.y-c.y)}));
  await uiWait(`Math.abs(Number(${numberSelector('Scale · percent')}.value)-200)<.001`,'native scale preview');
  const scaled=await displayed(); near(scaled,{[ids[0]]:{x:27,y:20},[ids[1]]:{x:39,y:20}}); await cancel();
  await clickSelector('[aria-label="Fit field"]'); await open(); await editNumber('Scale · percent',200); near(await displayed(),scaled); await cancel();
  await open(); await nativeDrag('rotate',(p,c)=>({x:c.x-(p.y-c.y),y:c.y+(p.x-c.x)}),true);
  await uiWait(`Number(${numberSelector('Angle · degrees')}.value)===0`,'Escape restores handle draft');
  assert.ok(await evaluate("!!document.querySelector('.transform-panel')")); await cancel();
  pass('scale handle at 160% field zoom matches typed percentage; Escape cancels an active handle gesture without applying or leaving the preview');

  await open(); await clickSelector('[aria-label="Pan field"]');
  const panStart=await screenPoint(80,40);
  for(const event of [{type:'mouseMoved',...panStart},{type:'mousePressed',...panStart,button:'left',buttons:1,clickCount:1},{type:'mouseMoved',x:panStart.x+24,y:panStart.y+12,button:'left',buttons:1},{type:'mouseReleased',x:panStart.x+24,y:panStart.y+12,button:'left',buttons:0,clickCount:1}]) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',event);
  await clickSelector('[aria-label="Select performers"]'); await nativeDrag('pivot',()=>({x:40,y:25}));
  await uiWait("document.querySelector('select[aria-label=\"Transform pivot\"]').value==='custom'",'dragged custom pivot');
  assert.ok(Math.abs(Number(await evaluate(`${numberSelector('Pivot X · yards')}.value`))-40)<.0001);
  await editNumber('Angle · degrees',180); near(await displayed(),{[ids[0]]:{x:50,y:30},[ids[1]]:{x:44,y:30}});
  await choose('Transform pivot','performer'); await choose('Pivot performer',ids[1]); await editNumber('Angle · degrees',90);
  near(await displayed(),{[ids[0]]:{x:36,y:14},[ids[1]]:{x:36,y:20}});
  await choose('Transform pivot','field'); await choose('Pivot field reference','back-hash'); await editNumber('Angle · degrees',180);
  near(await displayed(),{[ids[0]]:{x:70,y:20},[ids[1]]:{x:64,y:20}}); await captureExact('transform-field-pivot.png'); await cancel();
  pass('pivot handle, chosen performer and field hash references share the numeric transform geometry');

  await open('Mirror selection'); near(await displayed(),{[ids[0]]:{x:70,y:20},[ids[1]]:{x:64,y:20}}); await captureExact('transform-mirror.png');
  await apply(); const mirrored=await savedSnapshot(); assert.deepEqual(mirrored.performers,fixture.performers); assert.deepEqual(mirrored.sets[1],fixture.sets[1]);
  menuAction('Undo drill edit'); assert.deepEqual(await savedSnapshot(),fixture);
  await open('Mirror selection'); await choose('Transform operation','front-back'); near(await displayed(),{[ids[0]]:{x:30,y:fixture.field.height-20},[ids[1]]:{x:36,y:fixture.field.height-20}}); await cancel();
  await open(); await editNumber('Scale · percent',10000);
  await uiWait("document.querySelector('.transform-result--error')?.textContent.includes('boundary')",'invalid boundary preview');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply transform\"]').getAttribute('aria-disabled')"),'true');
  await keyboard('[aria-label="Apply transform"]'); assert.deepEqual(await savedSnapshot(),fixture); await captureExact('transform-boundary.png'); await cancel();
  await open(); await editNumber('Scale · percent',0); await keyboard('[aria-label="Apply transform"]'); assert.ok(await evaluate("!!document.querySelector('.transform-panel [aria-invalid=true]')")); await cancel();
  await open(); await editNumber('Angle · degrees',15); await keyboard('.field-legend button:nth-child(2)');
  await uiWait("!document.querySelector('.transform-panel')",'selection change invalidates transform'); assert.deepEqual(await savedSnapshot(),fixture);
  const first=fixture.performers[0].id; await keyboard('.field-legend button:first-child');
  await evaluate(`document.querySelector('[data-performer-id="${first}"]').focus()`); await sendKey(window,'Return');
  await open(); await choose('Transform pivot','field'); await editNumber('Angle · degrees',180);
  near(await displayed(),{[ids[0]]:{x:70,y:fixture.field.height-20},[ids[1]]:fixture.sets[0].positions[ids[1]]}); await cancel();
  assert.deepEqual(await savedSnapshot(),fixture);
  await fs.writeFile(path.join(output,'transform-layouts.json'),JSON.stringify(layout,null,2));
  pass('field-axis mirrors preserve identity; invalid scales/bounds cannot apply; selection changes discard stale previews; singleton transforms allow non-origin pivots');
}


app.whenReady().then(async () => {
  try {
    await waitFor(() => Boolean(window), 'production window');
    await uiWait("!!document.querySelector('.field-performer')", 'production renderer');
    window.webContents.debugger.attach('1.3');
    assert.equal(await evaluate('typeof window.require'), 'undefined');
    assert.equal(await evaluate('!!window.squidware'), true);
    await evaluate('window.__qaConfirmResponse = true; window.confirm = () => window.__qaConfirmResponse; true');
    assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'Unsaved changes');
    pass('production renderer and actual isolated preload load');
    await checkActionClarity();

    menuAction('Open project…');
    await uiWait("document.querySelector('.project-title')?.textContent.includes('Editor boundary QA')", 'boundary import');
    assert.equal(await evaluate(`${numberSelector('Counts')}.disabled`), true);
    assert.equal(await evaluate(`${numberSelector('Tempo · BPM')}.disabled`), true);
    assert.equal(await evaluate("document.querySelector('.inspector').textContent.includes('stored tempo does not affect playback')"), true);
    pass('opening-set timing is disabled and explained');

    await clickSelector('.set-card:nth-child(2)');
    assert.equal(await evaluate(`${numberSelector('Counts')}.value`), '1024');
    assert.equal(await evaluate(`${numberSelector('Tempo · BPM')}.value`), '400');
    await evaluate(`${numberSelector('Counts')}.focus(); ${numberSelector('Counts')}.blur();`);
    menuAction('Save As…');
    let saved = await savedProject(p => p.moves[0].counts === 1024);
    assert.equal(saved.sections.length, 64);
    assert.equal(saved.sets[1].notes.length, 10000);
    assert.equal(saved.moves[0].tempo, 400);
    pass('boundary file opens and saves without clamping untouched values');

    await editNumber('Counts', 1);
    await editNumber('Tempo · BPM', 20);
    menuAction('Save');
    saved = await savedProject(p => p.moves[0].counts === 1 && p.moves[0].tempo === 20);
    pass('minimum valid count and tempo commit through commands and save');

    const bytesBeforeInvalid = await fs.readFile(savedFile, 'utf8');
    await editNumber('Counts', 0);
    assert.equal(await evaluate(`${numberSelector('Counts')}.getAttribute('aria-invalid')`), 'true');
    menuAction('Save');
    await pause(100);
    assert.equal(await fs.readFile(savedFile, 'utf8'), bytesBeforeInvalid);
    await keyOnNumber('Counts', 'Escape');
    assert.equal(await evaluate(`${numberSelector('Counts')}.value`), '1');
    pass('invalid numeric drafts have inline feedback, block save, and Escape restores the value');

    await editNumber('Counts', 1024);
    menuAction('Undo drill edit');
    await uiWait(`${numberSelector('Counts')}.value === '1'`, 'native undo');
    menuAction('Redo drill edit');
    await uiWait(`${numberSelector('Counts')}.value === '1024'`, 'native redo');
    pass('native undo/redo use the shared commands');

    await clickText('Cast');
    await clickSelector('[aria-label="Add performers"]');
    await editNumber('Number of performers', 0);
    await clickText('Add performers', '.modal', true);
    assert.equal(await evaluate("!!document.querySelector('.modal[open]')"), true);
    await keyOnNumber('Number of performers', 'Escape');
    await clickSelector('.modal [aria-label="Close dialog"]');
    await clickText('Design');
    menuAction('Save');
    saved = await savedProject(p => p.moves[0].counts === 1024);
    assert.equal(saved.performers.length, 64);
    pass('invalid cast amounts keep the dialog open and cannot add the previous amount');

    menuAction('Select all');
    await uiWait("document.querySelectorAll('.field-performer[aria-pressed=true]').length === 64", 'selection');
    pass('native selection updates the field');

    menuAction('Save');
    saved = await savedProject(p => p.moves[0].counts === 1024);
    const beforeFormation = JSON.stringify(saved.sets[1].positions);
    await clickSelector('[aria-label="Shape selection"]');
    await editNumber('Width · yd', 0);
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply formation\"]').getAttribute('aria-disabled')"), 'true');
    await clickText('Apply formation', 'body', true);
    await keyOnNumber('Width · yd', 'Escape');
    menuAction('Save');
    await pause(150);
    saved = await savedProject(p => p.moves[0].counts === 1024);
    assert.equal(JSON.stringify(saved.sets[1].positions), beforeFormation);
    pass('an invalid formation draft cannot apply the previous dimensions');
    await clickText('Apply formation');
    menuAction('Save');
    saved = await savedProject(p => JSON.stringify(p.sets[1].positions) !== beforeFormation);
    assert.equal(saved.performers.length, 64);
    assert.equal(saved.schemaVersion, 2);
    assert.equal(saved.sets[0].counts, undefined);
    assert.equal(saved.moves[0].fromSetId, saved.sets[0].id);
    assert.equal(saved.moves[0].toSetId, saved.sets[1].id);
    pass('formation application mutates only the intended set and keeps a valid roster');

    const initialCount = await evaluate("Number(document.querySelector('.count-display strong').textContent)");
    await clickSelector('[aria-label="Play show"]');
    await uiWait("document.querySelector('[aria-label=\"Pause playback\"]') !== null", 'playback start');
    await uiWait(`Number(document.querySelector('.count-display strong').textContent) > ${initialCount}`, 'playhead progression');
    await clickSelector('[aria-label="Pause playback"]');
    await clickSelector('.set-card:nth-child(2)');
    pass('playback advances and returns to an editable set');

    await clickText('Export');
    destination = path.join(output, `coordinates-${process.pid}.csv`);
    await clickText('Coordinates CSV');
    await waitFor(() => fs.stat(destination).then(stat => stat.size > 100, () => false), 'CSV export');
    assert.match(await fs.readFile(destination, 'utf8'), /Arrival count.*Move counts.*Tempo/);
    await clickText('Export');
    destination = path.join(output, `chart-${process.pid}.svg`);
    await clickText('Current chart SVG');
    await waitFor(() => fs.stat(destination).then(stat => stat.size > 100, () => false), 'SVG export');
    assert.match(await fs.readFile(destination, 'utf8'), /<svg/);
    pass('CSV and SVG export use actual main-process handlers');

    openPath = savedFile;
    menuAction('Open project…');
    await uiWait("document.querySelector('.set-card.selected .set-number')?.textContent === '01'", 'reopen reset');
    await clickSelector('.set-card:nth-child(2)');
    assert.equal(await evaluate(`${numberSelector('Counts')}.value`), '1024');
    assert.equal(await evaluate(`${numberSelector('Tempo · BPM')}.value`), '20');
    pass('saved production reopens with timing and geometry intact');

    const { coordinateDescription } = require(path.join(output, 'boundary-fixture.cjs'));
    const person = saved.performers[0];
    const dotSelector = `.field-performer[data-performer-id="${person.id}"]`;
    await focusFieldPerformer(dotSelector);
    await uiWait("!!document.querySelector('.field-readout')", 'focused performer details');
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription(saved.sets[1].positions[person.id], saved.field));
    assert.match(await evaluate("document.querySelector('.field-readout strong').textContent"), new RegExp(person.label));
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(dotSelector)}).getAttribute('aria-label').includes(${JSON.stringify(saved.sections.find(s => s.id === person.sectionId).name)})`), true);
    await evaluate(`document.querySelector(${JSON.stringify(dotSelector)}).blur()`);
    await hoverPoint(saved.sets[1].positions[person.id].x, saved.sets[1].positions[person.id].y);
    // The contract is nearest center, with stable IDs for coincident dots.
    // SVG paint order is not an oracle for which performer the user pointed at.
    const target = saved.sets[1].positions[person.id];
    const hovered = saved.performers.filter(item => {
      const point = saved.sets[1].positions[item.id];
      return Math.hypot(point.x - target.x, point.y - target.y) < 1e-8;
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
    const hoveredId = hovered.id;
    await uiWait(`document.querySelector('.field-readout strong')?.textContent.startsWith(${JSON.stringify(hovered.label + ' ·')})`, 'nearest performer hover');
    assert.equal(await evaluate("document.querySelector('.field-readout strong').textContent"), [hovered.label, hovered.name, saved.sections.find(item => item.id === hovered.sectionId).name].filter(Boolean).join(' · '));
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription(saved.sets[1].positions[hovered.id], saved.field));
    await hoverPoint(20, 20);
    assert.equal(await evaluate("document.querySelector('.field-readout strong').textContent"), 'Cursor');
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription({ x: 20, y: 20 }, saved.field));
    await clickSelector('[aria-label="Zoom in"]');
    await hoverPoint(20, 20);
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription({ x: 20, y: 20 }, saved.field));
    await evaluate("document.querySelector('.field-stage__svg').style.transform = 'scaleX(-1)'");
    await hoverPoint(20, 20);
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription({ x: 20, y: 20 }, saved.field));
    await evaluate("document.querySelector('.field-stage__svg').style.transform = ''");
    await hoverPoint(20, 20);
    const panStart = await screenPoint(50, 25);
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...panStart, button: 'middle', clickCount: 1 });
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: panStart.x + 35, y: panStart.y + 20, button: 'middle', buttons: 4 });
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: panStart.x + 35, y: panStart.y + 20, button: 'middle', clickCount: 1 });
    await hoverPoint(20, 20);
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription({ x: 20, y: 20 }, saved.field));
    await capture('field-coordinates.png');
    await clickSelector('[aria-label="Fit field"]');
    await hoverPoint(-3, 20);
    assert.equal(await evaluate("!!document.querySelector('.field-readout')"), false);
    pass('cursor and keyboard performer details match drill coordinates through zoom, pan and out-of-field movement');

    await evaluate(`document.querySelector(${JSON.stringify(dotSelector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
    await scrubCount(512);
    await uiWait("!!document.querySelector('.field-preview-banner')", 'visible between-set banner');
    assert.match(await evaluate("document.querySelector('.field-preview-banner').textContent"), /Move 1 → 2.*Count 512.*512 \/ 1024/);
    assert.equal(await evaluate(`${numberSelector('X · yards from left')}.disabled && ${numberSelector('Y · yards from back')}.disabled`), true);
    assert.equal(await evaluate("document.querySelector('.preview-formation').getAttribute('aria-disabled') === 'true'"), true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(dotSelector)})).cursor`), 'default');
    assert.equal(await evaluate("document.querySelector('.field-stage__svg').getAttribute('aria-describedby').split(/\\s+/).includes('field-preview-message')"), true);
    const beforePreview = JSON.stringify(saved.sets[1].positions);
    await evaluate(`document.querySelector(${JSON.stringify(dotSelector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); document.querySelector('.preview-formation').click()`);
    const previewDot = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(dotSelector)}); const point = new DOMPoint(0, 0).matrixTransform(element.getScreenCTM()); return { x: point.x, y: point.y }; })()`);
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...previewDot, button: 'left', clickCount: 1 });
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: previewDot.x + 40, y: previewDot.y, buttons: 1 });
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: previewDot.x + 40, y: previewDot.y, button: 'left', clickCount: 1 });
    menuAction('Save');
    await pause(150);
    saved = await savedProject(p => p.moves[0].counts === 1024);
    assert.equal(JSON.stringify(saved.sets[1].positions), beforePreview);
    await capture('field-preview.png');
    await clickSelector('.field-preview-banner button');
    await uiWait("!document.querySelector('.field-preview-banner')", 'one-click editing recovery');
    assert.equal(await evaluate("document.querySelector('.timeline-scrubber').value"), '1024');
    assert.equal(await evaluate(`${numberSelector('X · yards from left')}.disabled`), false);
    assert.equal(await evaluate("document.querySelector('.preview-formation').getAttribute('aria-disabled') === 'true'"), false);
    pass('between-set preview blocks drag, nudge, formation and Inspector edits and recovers at the named arrival');

    await clickSelector('[aria-label="Play show"]');
    await uiWait("!!document.querySelector('.field-preview-banner')", 'playback lock');
    await clickSelector('.field-preview-banner button');
    assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Play show\"]')"), true);
    assert.equal(await evaluate("!!document.querySelector('.field-preview-banner')"), false);
    pass('preview recovery stops running playback and removes the edit lock');

    const single = structuredClone(saved);
    single.title = 'Single set coordinate QA';
    single.field.preset = 'high-school';
    single.sets = [single.sets[0]];
    single.moves = [];
    single.performers[0].name = 'Avery';
    single.sets[0].positions[person.id] = { x: 40, y: 160 / 9 };
    single.sets[0].positions[single.performers[1].id] = { x: 40, y: 160 / 9 };
    single.sets[0].positions[single.performers[2].id] = { x: 0, y: 0 };
    single.sets[0].positions[single.performers[3].id] = { x: single.field.width, y: single.field.height };
    openPath = path.join(output, 'single.squid');
    await fs.writeFile(openPath, JSON.stringify(single));
    menuAction('Open project…');
    await uiWait("document.querySelector('.project-title').textContent.includes('Single set coordinate QA')", 'single-set import');
    await scrubCount(0);
    assert.equal(await evaluate("!!document.querySelector('.field-preview-banner')"), false);
    await focusFieldPerformer(dotSelector);
    await uiWait("document.querySelector('.field-readout strong')?.textContent.includes('Avery')", 'named performer details');
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), 'Side 1: on the 40-yard line; on back hash');
    for (const boundaryPerson of single.performers.slice(2, 4)) {
      const selector = `.field-performer[data-performer-id="${boundaryPerson.id}"]`;
      await focusFieldPerformer(selector);
      await uiWait(`document.querySelector('.field-readout strong')?.textContent.includes(${JSON.stringify(boundaryPerson.label)})`, 'boundary performer details');
      assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription(single.sets[0].positions[boundaryPerson.id], single.field));
    }
    const overlapSelector = `.field-performer[data-performer-id="${single.performers[1].id}"]`;
    await focusFieldPerformer(overlapSelector);
    await uiWait(`document.querySelector('.field-readout strong')?.textContent.includes(${JSON.stringify(single.performers[1].label)})`, 'overlapping focused performer');
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), 'Side 1: on the 40-yard line; on back hash');
    window.setSize(1250, 800);
    await pause(100);
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), 'Side 1: on the 40-yard line; on back hash');
    await capture('field-focus.png');
    pass('single-set shows stay editable; overlapping dots, optional names and resized fields expose accurate keyboard details');

    const historyFile = path.join(output, `history-${process.pid}.squid`);
    destination = historyFile;
    await typeText('.inspector textarea', 'N'.repeat(40));
    menuAction('Save As…');
    let historySaved = await savedProject(p => p.sets[0].notes === 'N'.repeat(40), historyFile);
    let actions = await openHistory();
    assert.equal(actions.length, 1);
    assert.match(actions[0], /^Edit notes — Set 1/);
    await clickSelector('.history-actions button:first-child');
    assert.equal(await evaluate("[...document.querySelectorAll('.header-actions button')].find(button => button.textContent.startsWith('Save')).textContent.includes('•')"), true);
    await clickSelector('.history-actions button:nth-child(2)');
    assert.equal(await evaluate("[...document.querySelectorAll('.header-actions button')].find(button => button.textContent.startsWith('Save')).textContent.includes('•')"), false);
    await clickSelector('.modal [aria-label="Close dialog"]');
    pass('40-character note drafts commit as one named action; undo and redo restore saved revision status');

    await typeText('.inspector textarea', 'Cancel this note draft');
    await fieldKey('.inspector textarea', 'Escape');
    assert.equal(await evaluate("document.querySelector('.inspector textarea').value"), 'N'.repeat(40));
    actions = await openHistory();
    assert.equal(actions.length, 1);
    await clickSelector('.modal [aria-label="Close dialog"]');
    pass('Escape cancels a text draft without creating history or changing the production');

    await clickText('Cast');
    await clickSelector('[aria-label="Full Cast table"]');
    await uiWait("!!document.querySelector('.cast-table')", 'full Cast table');
    await typeText('.cast-table input[placeholder="Add a name"]', 'A'.repeat(40));
    await fieldKey('.cast-table input[placeholder="Add a name"]', 'Enter');
    await clickText('Design');
    await clickSelector('[aria-label="Project menu"]'); await clickSelector('[aria-label="Production settings"]');
    await typeText('.modal label.form-label input', 'History QA production');
    await fieldKey('.modal label.form-label input', 'Enter');
    for (const color of ['#112233', '#445566', '#778899']) await colorValue('.modal input[type=color]', color);
    await clickText('Done', '.modal');
    menuAction('Save');
    historySaved = await savedProject(p => p.title === 'History QA production' && p.sections[0].color === '#778899', historyFile);
    assert.equal(historySaved.performers[0].name, 'A'.repeat(40));
    actions = await openHistory();
    assert.equal(actions.length, 4);
    assert.match(actions[0], /^Recolor /);
    assert.equal(actions[1], 'Rename production');
    assert.equal(actions[2], `Rename ${historySaved.performers[0].label}`);
    await capture('named-history.png');
    await clickSelector('.modal [aria-label="Close dialog"]');
    pass('performer names, production title and a multi-change color session each produce one named action');

    await clickSelector('[aria-label="Project menu"]'); await clickSelector('[aria-label="Production settings"]');
    await colorValue('.modal input[type=color]', '#ffffff');
    await fieldKey('.modal input[type=color]', 'Escape');
    assert.equal(await evaluate("document.querySelector('.modal input[type=color]').value"), '#778899');
    await clickText('Done', '.modal');
    actions = await openHistory(); assert.equal(actions.length, 4);
    await clickSelector('.modal [aria-label="Close dialog"]');
    pass('Escape cancels a color session without applying its preview or adding history');

    await clickSelector('[aria-label="Select performers"]');
    // This case owns drag/undo, not coincident-dot cycling (owned by field QA).
    const dragId = single.performers[4].id;
    const dragFrom = single.sets[0].positions[dragId];
    const pressed = await screenPoint(dragFrom.x, dragFrom.y);
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...pressed });
    for (let frame = 1; frame <= 12; frame++) {
      const moved = await screenPoint(dragFrom.x + frame / 12 * 2.5, dragFrom.y + frame / 12 * 1.25);
      await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, ...moved });
    }
    const released = await screenPoint(dragFrom.x + 2.5, dragFrom.y + 1.25);
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...released });
    await pause(60);
    actions = await openHistory(); assert.equal(actions.length, 5); assert.match(actions[0], /^Move .* — Set 1/);
    await clickSelector('.modal [aria-label="Close dialog"]');
    menuAction('Save');
    historySaved = await savedProject(p => p.sets[0].positions[dragId].x !== dragFrom.x, historyFile);
    pass('a multi-frame pointer drag commits one named movement action');

    openPath = historyFile;
    menuAction('Open project…');
    await pause(100);
    actions = await openHistory(); assert.equal(actions.length, 0);
    assert.equal(await evaluate("document.querySelector('.history-policy').textContent.includes('80 actions')"), true);
    await clickSelector('.modal [aria-label="Close dialog"]');
    pass('file loads clear history and the history panel exposes its retention policy');

    assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'Project file saved');
    await typeText('.inspector textarea', 'A pending draft on a saved file');
    assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'Unsaved changes · Draft pending');
    for (const width of [1120, 1250]) {
      window.setSize(width, 800); await settleNativeViewport(window, 'draft-status viewport');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.save-state')).display !== 'none' && document.querySelector('.save-state').getBoundingClientRect().right <= document.querySelector('.header-actions').getBoundingClientRect().left"), true);
    }
    await capture('file-draft-status.png');
    messageResponse = 0;
    let prevented = false;
    window.emit('close', { preventDefault() { prevented = true; } });
    await pause(60);
    assert.equal(prevented, true);
    assert.equal(messages.at(-1).title, 'Unsaved project');
    await fieldKey('.inspector textarea', 'Escape');
    assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'Project file saved');
    pass('draft status remains visible at minimum desktop widths and triggers the native close guard; Escape restores clean status');

    await clickSelector('[aria-label="Project menu"]'); await clickSelector('[aria-label="Production settings"]');
    await editNumber('Audio sync offset · seconds', 99999);
    await clickText('Done', '.modal');
    assert.equal(await evaluate("document.querySelector('.modal h2').textContent"), 'Production settings');
    menuAction('New production');
    await pause(50);
    assert.equal(await evaluate("document.querySelector('.modal h2').textContent"), 'Production settings');
    menuAction('Open project…');
    await pause(50);
    assert.equal(await evaluate(`${numberSelector('Audio sync offset · seconds')}.value`), '99999');
    await keyOnNumber('Audio sync offset · seconds', 'Escape');
    await clickText('Done', '.modal');
    assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'Project file saved');
    pass('invalid modal drafts survive Done, New and Open until corrected or canceled');

    const savedBytes = await fs.readFile(historyFile, 'utf8');
    await typeText('.inspector textarea', 'A committed unsaved note');
    await fieldKey('.inspector textarea', 'Enter');
    cancelSave = true;
    menuAction('Save As…');
    await uiWait("document.querySelector('.save-state').textContent === 'Unsaved changes · Save canceled'", 'canceled save status');
    assert.equal(await fs.readFile(historyFile, 'utf8'), savedBytes);
    cancelSave = false;
    destination = path.join(output, `missing-${process.pid}`, 'cannot-save.squid');
    menuAction('Save As…');
    await uiWait("document.querySelector('.save-state').textContent === 'Unsaved changes · Save failed'", 'failed save status');
    assert.equal(await fs.readFile(historyFile, 'utf8'), savedBytes);
    pass('canceled and failed native saves retain unsaved edits and the previous project file');

    destination = path.join(output, `save-status-${process.pid}.squid`);
    saveGate = new Promise(resolve => { releaseSave = resolve; });
    menuAction('Save As…');
    await waitFor(() => saveDialogWaiting, 'delayed save dialog');
    await uiWait("document.querySelector('.save-state').textContent.includes('Saving…')", 'saving status');
    await typeText('.inspector textarea', 'A later edit during save');
    await fieldKey('.inspector textarea', 'Enter');
    releaseSave();
    await savedProject(p => p.sets[0].notes === 'A committed unsaved note', destination);
    await uiWait("document.querySelector('.save-state').textContent === 'Unsaved changes'", 'later edit remains unsaved');
    await uiWait("document.querySelector('.recovery-indicator').textContent === 'Recovery copy saved'", 'independent recovery status');
    assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'Unsaved changes');
    menuAction('Undo drill edit');
    await uiWait("document.querySelector('.save-state').textContent === 'Project file saved'", 'undo to saved snapshot');
    menuAction('Redo drill edit');
    await uiWait("document.querySelector('.save-state').textContent === 'Unsaved changes'", 'redo away from saved snapshot');
    pass('edits during a native save stay unsaved after recovery; undo and redo compare the captured saved revision');

    await evaluate('window.__qaConfirmResponse = false');
    openPath = historyFile;
    menuAction('Open project…');
    await pause(60);
    assert.equal(await evaluate("document.querySelector('.inspector textarea').value"), 'A later edit during save');
    menuAction('New production');
    await uiWait("document.querySelector('.modal h2')?.textContent === 'New production'", 'new project prompt');
    await clickSelector('.new-options button:first-child');
    assert.equal(await evaluate("document.querySelector('.inspector textarea').value"), 'A later edit during save');
    await evaluate('window.__qaConfirmResponse = true');
    await clickSelector('.new-options button:first-child');
    await uiWait("document.querySelector('.save-state').textContent === 'Unsaved changes'", 'new production unsaved');
    assert.equal(await evaluate("document.querySelector('.set-panel .count-badge').textContent"), '1');
    pass('open and new-project cancellation preserve edits; a new production requires an explicit file save');
    await clickText('Design');
    await capture('file-save-status.png');

    await checkCompactChrome();
    await checkSelectionInspector();
    await checkExactTransforms();
    openPath = path.join(output, 'selection.squid'); menuAction('Open project…');
    await uiWait("document.querySelector('.project-title').textContent.includes('Selection Inspector QA') && document.querySelector('.set-card:first-child').classList.contains('selected')", 'formation fixture');
    await require('./formation-preview-qa.cjs')({ window, output, evaluate, uiWait, clickSelector, editNumber, numberSelector, capture, pass, menuAction, openHistory,
      fixture: JSON.parse(await fs.readFile(openPath, 'utf8')),
      snapshot: async filename => { destination = filename; menuAction('Save As…'); const project = await savedProject(p => p.title === 'Selection Inspector QA', filename); await uiWait("document.querySelector('.save-state').textContent === 'Project file saved'", 'formation snapshot'); return project; } });
    await capture('editor.png');
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: checks, saveDialogs: saves, rendererNodeAccess: false }, null, 2));

    app.exit(0);
  } catch (error) {
     console.error(error);
    if (window && !window.isDestroyed()) {
      await capture('failure.png').catch(() => {});
      try { console.error('Renderer diagnostic:', await evaluate("JSON.stringify({ toast: document.querySelector('.toast')?.textContent, fields: [...document.querySelectorAll('input[type=number]')].map(input => ({ label: input.parentElement?.firstChild?.textContent, value: input.value, invalid: input.getAttribute('aria-invalid'), disabled: input.disabled })) })")); } catch {}
    }
    app.exit(1);
  }
});
