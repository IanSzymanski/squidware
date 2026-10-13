'use strict';
const { app, BrowserWindow, dialog, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const manifestArg = process.argv.find(value => value.startsWith('--editor-qa-manifest='));
if (!manifestArg) throw new Error('Run through scripts/editor-qa.mjs.');
const manifest = require(manifestArg.slice('--editor-qa-manifest='.length));
const { root, output } = manifest;
const checks = [];
let window;
let openPath = path.join(output, 'boundary.squid');
const savedFile = path.join(output, `saved-${process.pid}.squid`);
let destination = savedFile;
let saves = 0;
let scriptFailure;
require('node:fs').mkdirSync(path.join(output, `profile-${process.pid}`), { recursive: true });
app.setPath('userData', path.join(output, `profile-${process.pid}`));
// The production main owns all security settings and handlers. Only suppress its show call.
BrowserWindow.prototype.show = function () {};
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [openPath] });
dialog.showSaveDialog = async () => { saves++; return { canceled: false, filePath: destination }; };
dialog.showMessageBox = async () => ({ response: 1 });
dialog.showErrorBox = (_title, message) => { scriptFailure = new Error(message); };
app.on('browser-window-created', (_event, created) => {
  window = created;
  created.webContents.setBackgroundThrottling(false);
  created.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message); });
  created.webContents.on('render-process-gone', (_event, details) => { scriptFailure = new Error(`Renderer exited: ${details.reason}`); });
});
const timeout = setTimeout(() => { console.error('Editor QA timed out.'); app.exit(1); }, 120000);
require(path.join(root, 'electron', 'main.cjs'));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => window.webContents.executeJavaScript(source);
async function waitFor(condition, label) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (scriptFailure) throw scriptFailure;
    if (await condition()) return;
    await pause(25);
  }
  throw new Error(`Timed out: ${label}`);
}
const uiWait = (source, label) => waitFor(() => evaluate(source), label);
async function clickText(text, scope = 'body', allowDisabled = false) {
  await evaluate(`(() => { const button = [...document.querySelector(${JSON.stringify(scope)}).querySelectorAll('button')].find(node => node.textContent.trim() === ${JSON.stringify(text)}); if (!button || (button.disabled && !${allowDisabled})) throw new Error('Button unavailable: ' + ${JSON.stringify(text)}); if (!button.disabled) button.click(); })()`);
  await pause(30);
}
async function clickSelector(selector) {
  await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node || node.disabled) throw new Error('Control unavailable: ' + ${JSON.stringify(selector)}); node.click(); })()`);
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
async function savedProject(expected) {
  let project;
  await waitFor(async () => {
    try { project = JSON.parse(await fs.readFile(savedFile, 'utf8')); return expected(project); } catch { return false; }
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
async function capture(name) {
  const screenshot = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  await fs.writeFile(path.join(output, name), screenshot.toPNG());
}

app.whenReady().then(async () => {
  try {
    await waitFor(() => Boolean(window), 'production window');
    await uiWait("!!document.querySelector('.field-performer')", 'production renderer');
    window.webContents.debugger.attach('1.3');
    assert.equal(await evaluate('typeof window.require'), 'undefined');
    assert.equal(await evaluate('!!window.squidware'), true);
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
    let saved = await savedProject(p => p.sets[1].counts === 1024);
    assert.equal(saved.sections.length, 64);
    assert.equal(saved.sets[1].notes.length, 10000);
    assert.equal(saved.sets[1].tempo, 400);
    pass('boundary file opens and saves without clamping untouched values');

    await editNumber('Counts', 1);
    await editNumber('Tempo · BPM', 20);
    menuAction('Save');
    saved = await savedProject(p => p.sets[1].counts === 1 && p.sets[1].tempo === 20);
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
    saved = await savedProject(p => p.sets[1].counts === 1024);
    assert.equal(saved.performers.length, 64);
    pass('invalid cast amounts keep the dialog open and cannot add the previous amount');

    menuAction('Select all');
    await uiWait("document.querySelectorAll('.field-performer[aria-pressed=true]').length === 64", 'selection');
    pass('native selection updates the field');

    menuAction('Save');
    saved = await savedProject(p => p.sets[1].counts === 1024);
    const beforeFormation = JSON.stringify(saved.sets[1].positions);
    await editNumber('Width · yd', 0);
    await clickText('Apply formation');
    await keyOnNumber('Width · yd', 'Escape');
    menuAction('Save');
    await pause(150);
    saved = await savedProject(p => p.sets[1].counts === 1024);
    assert.equal(JSON.stringify(saved.sets[1].positions), beforeFormation);
    pass('an invalid formation draft cannot apply the previous dimensions');
    await clickText('Apply formation');
    menuAction('Save');
    saved = await savedProject(p => JSON.stringify(p.sets[1].positions) !== beforeFormation);
    assert.equal(saved.performers.length, 64);
    assert.equal(saved.sets[0].counts, 0);
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
    await evaluate(`document.querySelector(${JSON.stringify(dotSelector)}).focus()`);
    await uiWait("!!document.querySelector('.field-readout')", 'focused performer details');
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription(saved.sets[1].positions[person.id], saved.field));
    assert.match(await evaluate("document.querySelector('.field-readout strong').textContent"), new RegExp(person.label));
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(dotSelector)}).getAttribute('aria-label').includes(${JSON.stringify(saved.sections.find(s => s.id === person.sectionId).name)})`), true);
    await evaluate(`document.querySelector(${JSON.stringify(dotSelector)}).blur()`);
    await hoverPoint(saved.sets[1].positions[person.id].x, saved.sets[1].positions[person.id].y);
    const hoverScreen = await screenPoint(saved.sets[1].positions[person.id].x, saved.sets[1].positions[person.id].y);
    const hoveredId = await evaluate(`document.elementFromPoint(${hoverScreen.x}, ${hoverScreen.y}).closest('[data-performer-id]').getAttribute('data-performer-id')`);
    const hovered = saved.performers.find(item => item.id === hoveredId);
    assert.equal(await evaluate("document.querySelector('.field-readout strong').textContent"), [hovered.label, hovered.name, saved.sections.find(item => item.id === hovered.sectionId).name].filter(Boolean).join(' · '));
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription(saved.sets[1].positions[hoveredId], saved.field));
    await hoverPoint(20, 20);
    assert.equal(await evaluate("document.querySelector('.field-readout strong').textContent"), 'Cursor');
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription({ x: 20, y: 20 }, saved.field));
    await clickSelector('[title="Zoom in"]');
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
    await clickSelector('[title="Fit field"]');
    await hoverPoint(-3, 20);
    assert.equal(await evaluate("!!document.querySelector('.field-readout')"), false);
    pass('cursor and keyboard performer details match drill coordinates through zoom, pan and out-of-field movement');

    await evaluate(`document.querySelector(${JSON.stringify(dotSelector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
    await scrubCount(512);
    await uiWait("!!document.querySelector('.field-preview-banner')", 'visible between-set banner');
    assert.match(await evaluate("document.querySelector('.field-preview-banner').textContent"), /Move 1 → 2.*Count 512.*512 \/ 1024/);
    assert.equal(await evaluate(`${numberSelector('X · yards from left')}.disabled && ${numberSelector('Y · yards from back')}.disabled`), true);
    assert.equal(await evaluate("document.querySelector('.apply-formation').disabled"), true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(dotSelector)})).cursor`), 'default');
    assert.equal(await evaluate("document.querySelector('.field-stage__svg').getAttribute('aria-describedby')"), 'field-preview-message');
    const beforePreview = JSON.stringify(saved.sets[1].positions);
    await evaluate(`document.querySelector(${JSON.stringify(dotSelector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); document.querySelector('.apply-formation').click()`);
    const previewDot = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(dotSelector)}); const point = new DOMPoint(0, 0).matrixTransform(element.getScreenCTM()); return { x: point.x, y: point.y }; })()`);
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...previewDot, button: 'left', clickCount: 1 });
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: previewDot.x + 40, y: previewDot.y, buttons: 1 });
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: previewDot.x + 40, y: previewDot.y, button: 'left', clickCount: 1 });
    menuAction('Save');
    await pause(150);
    saved = await savedProject(p => p.sets[1].counts === 1024);
    assert.equal(JSON.stringify(saved.sets[1].positions), beforePreview);
    await capture('field-preview.png');
    await clickSelector('.field-preview-banner button');
    await uiWait("!document.querySelector('.field-preview-banner')", 'one-click editing recovery');
    assert.equal(await evaluate("document.querySelector('.timeline-scrubber').value"), '1024');
    assert.equal(await evaluate(`${numberSelector('X · yards from left')}.disabled`), false);
    assert.equal(await evaluate("document.querySelector('.apply-formation').disabled"), false);
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
    single.sets = [{ ...single.sets[0], counts: 0 }];
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
    await evaluate(`document.querySelector(${JSON.stringify(dotSelector)}).focus()`);
    await uiWait("document.querySelector('.field-readout strong')?.textContent.includes('Avery')", 'named performer details');
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), 'Side 1: on the 40-yard line; on back hash');
    for (const boundaryPerson of single.performers.slice(2, 4)) {
      const selector = `.field-performer[data-performer-id="${boundaryPerson.id}"]`;
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
      await uiWait(`document.querySelector('.field-readout strong')?.textContent.includes(${JSON.stringify(boundaryPerson.label)})`, 'boundary performer details');
      assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription(single.sets[0].positions[boundaryPerson.id], single.field));
    }
    const overlapSelector = `.field-performer[data-performer-id="${single.performers[1].id}"]`;
    await evaluate(`document.querySelector(${JSON.stringify(overlapSelector)}).focus()`);
    await uiWait(`document.querySelector('.field-readout strong')?.textContent.includes(${JSON.stringify(single.performers[1].label)})`, 'overlapping focused performer');
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), 'Side 1: on the 40-yard line; on back hash');
    window.setSize(1250, 800);
    await pause(100);
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), 'Side 1: on the 40-yard line; on back hash');
    await capture('field-focus.png');
    pass('single-set shows stay editable; overlapping dots, optional names and resized fields expose accurate keyboard details');

    const screenshot = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    await fs.writeFile(path.join(output, 'editor.png'), screenshot.toPNG());
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: checks, saveDialogs: saves, rendererNodeAccess: false }, null, 2));
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    clearTimeout(timeout); console.error(error);
    if (window && !window.isDestroyed()) {
      try { console.error('Renderer diagnostic:', await evaluate("JSON.stringify({ toast: document.querySelector('.toast')?.textContent, fields: [...document.querySelectorAll('input[type=number]')].map(input => ({ label: input.parentElement?.firstChild?.textContent, value: input.value, invalid: input.getAttribute('aria-invalid'), disabled: input.disabled })) })")); } catch {}
    }
    app.exit(1);
  }
});
