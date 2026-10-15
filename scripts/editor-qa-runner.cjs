'use strict';
const { capturePage, waitFor: waitUntil, key: sendKey } = require('./testing/renderer.cjs');
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
    await clickText('Add performers');
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
    await editNumber('Width · yd', 0);
    await clickText('Apply formation');
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
    assert.equal(await evaluate("document.querySelector('.apply-formation').getAttribute('aria-disabled') === 'true'"), true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(dotSelector)})).cursor`), 'default');
    assert.equal(await evaluate("document.querySelector('.field-stage__svg').getAttribute('aria-describedby').split(/\\s+/).includes('field-preview-message')"), true);
    const beforePreview = JSON.stringify(saved.sets[1].positions);
    await evaluate(`document.querySelector(${JSON.stringify(dotSelector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); document.querySelector('.apply-formation').click()`);
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
    assert.equal(await evaluate("document.querySelector('.apply-formation').getAttribute('aria-disabled') === 'true'"), false);
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
    await typeText('.cast-table input[placeholder="Add a name"]', 'A'.repeat(40));
    await fieldKey('.cast-table input[placeholder="Add a name"]', 'Enter');
    await clickText('Design');
    await clickSelector('.project-title');
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

    await clickSelector('.project-title');
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
      window.setSize(width, 800); await pause(60);
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

    await clickSelector('.project-title');
    await editNumber('Audio sync offset · seconds', 99999);
    await clickText('Done', '.modal');
    assert.equal(await evaluate("document.querySelector('.modal h2').textContent"), 'Production settings');
    menuAction('New project');
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
    menuAction('New project');
    await uiWait("document.querySelector('.modal h2')?.textContent === 'A new beginning'", 'new project prompt');
    await clickSelector('.new-options button:first-child');
    assert.equal(await evaluate("document.querySelector('.inspector textarea').value"), 'A later edit during save');
    await evaluate('window.__qaConfirmResponse = true');
    await clickSelector('.new-options button:first-child');
    await uiWait("document.querySelector('.save-state').textContent === 'Unsaved changes'", 'new production unsaved');
    assert.equal(await evaluate("document.querySelector('.set-panel .count-badge').textContent"), '1');
    pass('open and new-project cancellation preserve edits; a new production requires an explicit file save');
    await clickText('Design');
    await capture('file-save-status.png');

    await capture('editor.png');
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: checks, saveDialogs: saves, rendererNodeAccess: false }, null, 2));

    app.exit(0);
  } catch (error) {
     console.error(error);
    if (window && !window.isDestroyed()) {
      try { console.error('Renderer diagnostic:', await evaluate("JSON.stringify({ toast: document.querySelector('.toast')?.textContent, fields: [...document.querySelectorAll('input[type=number]')].map(input => ({ label: input.parentElement?.firstChild?.textContent, value: input.value, invalid: input.getAttribute('aria-invalid'), disabled: input.disabled })) })")); } catch {}
    }
    app.exit(1);
  }
});
