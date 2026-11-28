'use strict';
const {activateWorkspace,showRightPanel}=require('./testing/renderer.cjs');
const { capturePage, revealFieldTool, waitFor: waitUntil, key: sendKey, settleNativeViewport, installConfirmShim } = require('./testing/renderer.cjs');
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
// Several controls share a name between a bar and a menu, and a menu's actions stay mounted while it is closed. Resolve
// the one a writer can use: the control on screen, else the action in a menu whose button is on screen (opened first).
async function locate(selector) {
  const found = await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('[data-qa-target]').forEach(node => node.removeAttribute('data-qa-target'));
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})], shown = node => !!node.getClientRects().length;
    const visible = nodes.find(shown);
    const item = visible ? null : nodes.find(node => { const menu = node.closest('[role=menu][hidden]'); return menu && [...document.querySelectorAll('[aria-controls]')].some(trigger => trigger.getAttribute('aria-controls') === menu.id && shown(trigger)); });
    (visible ?? item ?? nodes[0])?.setAttribute('data-qa-target', '');
    resolve(visible ? 'visible' : item ? 'menu' : nodes.length ? 'hidden' : null);
  })))`);
  if (!found) throw new Error('Control unavailable: ' + selector);
  if (found === 'menu') await revealFieldTool(window, '[data-qa-target]');
  return '[data-qa-target]';
}
async function clickSelector(selector) {
  const node = await locate(selector);
  await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(node)}); if (!node || node.disabled || node.getAttribute('aria-disabled') === 'true') throw new Error('Control unavailable: ' + ${JSON.stringify(selector)}); node.click(); })()`);
  await pause(30);
  if (selector.startsWith('.set-card')) await uiWait(`document.querySelector(${JSON.stringify(selector)})?.classList.contains('selected')`, 'set selection');
}
async function clickLabel(label, allowDisabled = false) {
  const node = await locate(`[aria-label="${label}"]`);
  await evaluate(`(() => { const button = document.querySelector(${JSON.stringify(node)}); const off = button.disabled || button.getAttribute('aria-disabled') === 'true'; if (off && !${allowDisabled}) throw new Error('Button unavailable: ' + ${JSON.stringify(label)}); if (!off) button.click(); })()`);
  await pause(30);
}
/** An action in the Project menu, opened the way a writer opens it. */
const fromProjectMenu = action => clickSelector(`.dropdown[role=menu] [aria-label="${action}"]`);
/** The show count in the transport. */
const showCount = "Number(document.querySelector('.show-count strong').textContent)";
const numberSelector = label => `([...document.querySelectorAll('label.form-label')].find(node => node.firstChild?.textContent === ${JSON.stringify(label)})?.querySelector('input'))`;
async function editNumber(label, value) {
  await uiWait(`!!${numberSelector(label)} && !${numberSelector(label)}.disabled`, `${label} numeric input ready`);
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
/** Geometry reported with a failed layout assertion, so a platform-specific failure can be read from the log. */
const LAYOUT_DIAGNOSTIC = "(() => { const rect = s => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }; const sc = document.querySelector('.field-container'); const stage = document.querySelector('.field-stage'); const scroller = [sc, stage, ...document.querySelectorAll('.field-container *')].find(n => n && n.scrollWidth > n.clientWidth + 1 || n && n.scrollHeight > n.clientHeight + 1); return { inner: [innerWidth, innerHeight], dpr: devicePixelRatio, tiers: { ...document.querySelector('.studio').dataset }, container: rect('.field-container'), svg: rect('.field-stage__svg'), surface: rect('[data-field-surface]'), panel: rect('.side-panel'), toolbar: rect('.canvas-toolbar'), transport: rect('.transport'), scroller: scroller ? [scroller.className.toString().slice(0, 40), scroller.scrollLeft, scroller.scrollTop, scroller.scrollWidth, scroller.clientWidth, scroller.scrollHeight, scroller.clientHeight] : null, font: getComputedStyle(document.body).fontFamily.slice(0, 60), active: (document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || '').slice(0, 60) }; })()";
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
  await evaluate("document.querySelector('.field-command-toolbar button[tabindex=\"0\"]').focus()");
  await uiWait("!!document.activeElement?.closest('.field-command-toolbar')", 'tool strip focus before the field');
  await sendKey(window, 'Tab'); await uiWait("document.activeElement?.matches('.field-performer')", 'Tab enters the field'); await sendKey(window, 'Home');
  for (let step = 0; step < index; step++) await sendKey(window, 'PageDown');
  await uiWait(`document.activeElement?.matches(${JSON.stringify(selector)})`, 'keyboard performer focus');
}

async function typeText(selector, text) {
  await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) throw new Error('Text field unavailable'); input.focus(); input.select(); })()`);
  let entered = '';
  for (const character of text) {
    entered += character;
    await window.webContents.debugger.sendCommand('Input.insertText', { text: character });
    // Protocol input acknowledgement can precede React's controlled draft.
    await uiWait(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});return document.activeElement===n && n.value===${JSON.stringify(entered)};})()`, 'native text draft ' + selector);
  }
  await uiWait(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(text)}))))`, 'settled text draft ' + selector);
}
async function fieldKey(selector, key) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await sendKey(window, key === 'Enter' ? 'Return' : key);
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
  // #178: the inventory depends on width (narrower windows fold controls into menus), so settle the 1366 × 768 layout first.
  await settleNativeViewport(window, 'action clarity viewport');
  await uiWait("document.querySelector('.studio').dataset.header === 'full' && document.querySelector('.studio').dataset.transport === 'full'", 'full header and transport at 1366 × 768');
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  // A custom glyph has no class name, so its drawing identifies it.
  const inventory = await evaluate("[...document.querySelectorAll('button')].map(n=>({name:n.getAttribute('aria-label'),text:n.textContent.trim(),icon:n.querySelector('svg')?.getAttribute('class')||n.querySelector('svg')?.innerHTML,shown:!!n.getClientRects().length,menu:n.closest('[role=menu]')?.getAttribute('aria-label')??null}))");
  await fs.writeFile(path.join(output, 'control-inventory.json'), JSON.stringify(inventory, null, 2));
  assert.equal(inventory.filter(n => n.name === 'Add set').length, 1);
  assert.equal(inventory.filter(n => n.name === 'Help').length, 1);
  const icon = name => inventory.find(n => n.name === name)?.icon;
  const distinct = ['Show paths from previous set', 'Show paths to next set', 'Select all', 'Show labels', 'Attach audio', 'Metronome', 'First set', 'Previous set', 'Next set', 'Last set'].map(icon);
  assert.ok(distinct.every(Boolean), JSON.stringify(distinct)); assert.equal(new Set(distinct).size, distinct.length);
  // The count steps beside Play read as what they do, not as a fifth and sixth arrow.
  assert.deepEqual(['Previous count', 'Next count'].map(name => inventory.find(n => n.name === name)?.text), ['−1', '+1']);
  // History is a clock-arrow glyph, distinct from the Undo/Redo arrows in the top bar; Recovery copies keeps its own.
  assert.match(icon('History'), /lucide-history/); assert.equal(new Set(['History', 'Undo', 'Redo', 'Recovery copies'].map(icon)).size, 4);
  await capture('action-clarity-design.png');
  const projectMenu = '.dropdown[role=menu]:not([hidden])';
  for (const [action, heading] of [['New production', 'New production'], ['Production settings', 'Production settings'], ['Preferences', 'Preferences']]) {
    await evaluate('document.querySelector(\'button[aria-label="Project menu"]\').focus()');
    await sendKey(window, 'Return'); await uiWait(`!!document.querySelector('${projectMenu}')?.contains(document.activeElement)`, 'project menu');
    await evaluate(`document.querySelector('${projectMenu} [aria-label="${action}"]').focus()`);
    await sendKey(window, 'Return');
    await uiWait(`document.querySelector('.modal h2')?.textContent === '${heading}'`, heading);
    await clickSelector('.modal [aria-label="Close dialog"]');
    await uiWait("!document.querySelector('dialog[open]')", `${heading} closed`);
  }
  await evaluate('document.querySelector(\'.topbar [aria-label="Export"]\').focus()'); await sendKey(window, 'Return');
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
  // The section chips in the Inspector's header are the field's color key and its fastest selection.
  const point = await evaluate("(() => {const r=document.querySelector('.inspector .field-legend button').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
  for (const type of ['mouseDown', 'mouseUp']) window.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 });
  await uiWait("document.querySelector('.field-legend button').getAttribute('aria-pressed') === 'true'", 'pointer section selection');
  assert.equal(await evaluate("document.querySelector('.selection-count').textContent"), '24 selected');
  await evaluate("document.querySelectorAll('.field-legend button')[0].focus()"); await sendKey(window, 'Tab'); await sendKey(window, 'Return');
  await uiWait("document.querySelectorAll('.field-legend button')[1].getAttribute('aria-pressed') === 'true'", 'keyboard section selection');
  assert.equal(await evaluate("document.querySelectorAll('.field-legend button')[0].getAttribute('aria-pressed')"), 'false');
  await clickSelector('.inspector [aria-label="Clear selection"]');
  await uiWait("document.querySelector('.selection-count').textContent === '0 selected'", 'selection cleared');
  // The one hint line on the field's margin replaced the status bar.
  assert.equal(await evaluate("document.querySelectorAll('.canvas-hint[data-hint]').length"), 1);
  assert.doesNotMatch(await evaluate("document.querySelector('.canvas-hint').textContent"), /Shift \+ click/);
  await clickSelector('.inspector [aria-label="Select all for editing"]');
  await uiWait("!!document.querySelector('.inspector [aria-label=\"Clear selection\"]') && document.querySelector('.selection-count').textContent === '64 selected'", 'select-all becomes clear');
  // The Select menu in the tool strip clears it from the keyboard.
  const clear = await locate('[role=menu][aria-label="Select menu"] [aria-label="Clear selection"]');
  await evaluate(`document.querySelector(${JSON.stringify(clear)}).focus()`); await sendKey(window, 'Return');
  await uiWait("document.querySelector('.selection-count').textContent === '0 selected' && document.activeElement === document.querySelector('button[aria-label=\"Select menu\"]')", 'toolbar clear selection');
  // Selection is not an edit: the untouched demo still has nothing to save.
  assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'No changes');
  // Cast and the production sheet are named by their tab and mode, and by their landmarks.
  await showRightPanel(window,'cast'); await uiWait("!!document.querySelector('aside.cast-dock[aria-label=\"Cast panel\"]')?.getClientRects().length && document.querySelector('#panel-tab-cast').getAttribute('aria-selected') === 'true' && document.querySelector('#panel-tab-cast').textContent.startsWith('Cast') && !!document.querySelector('.field-stage__svg')", 'Cast beside field');
  await activateWorkspace(window,'production'); await uiWait("!!document.querySelector('table[aria-label=\"Production sheet cells\"]')?.getClientRects().length && document.querySelector('[aria-label=\"Plan mode\"]').getAttribute('aria-pressed') === 'true'", 'sheet heading');
  await activateWorkspace(window,'design');
  pass('native pointer and Tab/Enter select sections with pressed state; hint stays retired after clearing; Cast and Production sheet have direct headings');
}

async function checkCompactChrome() {
  const measurements = [];
  for (const [width, scale] of [[1366, 1], [1366, 1.25], [1120, 1], [1120, 1.25]]) {
    window.setContentSize(width, 768); window.webContents.setZoomFactor(scale);
    await settleNativeViewport(window, 'compact viewport scale applied');
    await fromProjectMenu('New production');
    await clickSelector('.new-options button:nth-child(2)');
    await uiWait("document.querySelectorAll('.field-performer').length === 64", 'compact demo creation');
    if (await evaluate("!!document.querySelector('[aria-label=\"Dismiss notification\"]')")) await clickSelector('[aria-label="Dismiss notification"]');
    // A control is clipped when no button of that name is on screen, inside the window and on top at its center.
    const clippedControls = names => evaluate(`${JSON.stringify(names)}.filter(name => ![...document.querySelectorAll('button[aria-label="'+name+'"]')].some(node => { const r=node.getBoundingClientRect(); return r.width>0 && r.left>=0 && r.right<=innerWidth+.5 && r.top>=0 && r.bottom<=innerHeight+.5 && node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }))`);
    // Help lives in the Project menu at every width; the top bar keeps the three modes and command search. Save joins it once there is something to save.
    // Only the narrowest transport (the 1120 px window at 125%) folds First set and Last set away; Find set reaches every set there.
    const narrowTransport = await evaluate("document.querySelector('.studio').dataset.transport === 'narrow'");
    assert.equal(narrowTransport, width === 1120 && scale === 1.25, `narrowest transport at ${width}px / ${scale}×`);
    const required = ['Undo','Redo','Export','Write mode','Plan mode','Rehearse mode','Project menu','Command palette','Play show',...(narrowTransport ? ['Find set','Previous set','Next set'] : ['First set','Last set']),'Select performers','Motion','Collapse Inspector','2D field','3D preview','Add set'];
    const measure = await evaluate(`(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
      return { viewport:{width:innerWidth,height:innerHeight}, compactHeader:document.querySelector('.studio').dataset.header !== 'full', header:rect('.app-header'), toolbar:rect('.canvas-toolbar'), field:rect('.field-container'), timeline:rect('.timeline'), transport:rect('.transport'), tracks:rect('.timeline-tracks'), emptyAudioLane:!!document.querySelector('.audio-track'), legendInInspector:!!document.querySelector('.inspector .field-legend')?.getClientRects().length, legendInField:!!document.querySelector('.field-container .field-legend') };
    })()`);
    measure.clipped = await clippedControls(required);
    measurements.push({ width, scale, ...measure });
    assert.deepEqual(measure.clipped, [], `Required controls at ${width}px / ${scale}×`);
    // The section key is in the Inspector's header; nothing permanent sits on the field.
    assert.equal(measure.emptyAudioLane, false); assert.deepEqual([measure.legendInInspector, measure.legendInField], [true, false]);
    // The header stays one row at every width and browser zoom; effective widths below 1200 px drop its labels.
    assert.ok(measure.header.height <= 50, JSON.stringify(measure.header)); assert.equal(measure.compactHeader, !(width === 1366 && scale === 1));
    await fromProjectMenu('Help'); await uiWait("document.querySelector('.modal h2')?.textContent === 'Help'", 'Help from the Project menu');
    await clickSelector('.modal [aria-label="Close dialog"]');
    if (width === 1366 && scale === 1) {
      // The transport and the count timeline keep the old timeline's budget; the set cards below them are the set list.
      assert.ok(measure.header.height <= 50); assert.ok(measure.field.height >= 470); assert.ok(measure.transport.height + measure.tracks.height <= 125, JSON.stringify(measure));
    }
    await capture(`compact-${width}-${scale}.png`);
    // Exercise native input at both scales, including a narrow enlarged window.
    // One click adds the next set, holding this one.
    await clickSelector('[aria-label="Add set"]');
    const name = `Compact ${width} ${scale}`;
    await typeText('.inspector input[aria-label="Set name"]', name); await fieldKey('.inspector input[aria-label="Set name"]', 'Enter');
    await editNumber('Counts', 12);
    // The transport names the current set, as does its card. The narrowest transport draws the set's number alone.
    await uiWait(`document.querySelector('.set-jump-name').textContent === ${JSON.stringify(name)} && !!document.querySelector('.set-jump-number').getClientRects().length && !!document.querySelector('.set-jump-name').getClientRects().length === ${!narrowTransport} && document.querySelector('.set-card.selected .set-row-name').textContent === ${JSON.stringify(name)}`, 'canvas set name');
    await evaluate('document.querySelector(\'[aria-label="Play show"]\').focus()'); await sendKey(window, 'Return');
    await uiWait(`!!document.querySelector('[aria-label="Pause playback"]') && ${showCount}>0`, 'compact playback advances');
    await evaluate('document.querySelector(\'[aria-label="Pause playback"]\').focus()'); await sendKey(window, 'Return');
    await uiWait("!!document.querySelector('[aria-label=\"Play show\"]')", 'compact playback paused');
    await clickSelector('.set-card:nth-child(2)');
    destination = path.join(output, `compact-${width}-${scale}-${process.pid}.squid`);
    assert.deepEqual(await clippedControls(['Save']), [], `Save is offered in the top bar at ${width}px / ${scale}×`);
    await evaluate('document.querySelector(\'.topbar [aria-label="Save"]\').focus()'); await sendKey(window, 'Return');
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
  const { coordinateDescription } = require(path.join(output, 'boundary-fixture.cjs'));
  // The Inspector reads a position as its side caption, then yard line and hash, one phrase to a line.
  const capital = text => text.charAt(0).toUpperCase() + text.slice(1);
  function coordinateText(point, single) {
    const where = coordinateDescription(point, fixture.field).split('; '), side = /^(Side [12]): (.+)$/.exec(where[0]);
    return [!single && 'Center', side?.[1]].filter(Boolean).join(' · ') + (side ? [capital(side[2]), ...where.slice(1).map(capital)] : where).join('');
  }
  const strip = "document.querySelector('.field-command-toolbar')";
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
    const node = await locate(selector);
    const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(node)}).getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`);
    for (const type of ['mouseDown', 'mouseUp']) window.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 });
  }
  async function keyboard(selector) {
    const node = await locate(selector);
    await evaluate(`document.querySelector(${JSON.stringify(node)}).focus()`); await sendKey(window, 'Return');
  }
  const tool = name => `.field-command-toolbar [aria-label="${name}"], [role=menu][aria-label="Shape"] [aria-label="${name}"], [role=menu][aria-label="Arrange"] [aria-label="${name}"]`;
  const section = name => `summary[aria-label="${name} section"]`;
  async function cancelNumberDraft(label) {
    const input = numberSelector(label);
    await uiWait(`${input}.getBoundingClientRect().height > 0`, 'number draft visible for cancellation');
    await evaluate(`${input}.focus()`);
    await uiWait(`document.activeElement === ${input}`, 'number draft focused for cancellation');
    await sendKey(window, 'Escape');
    await uiWait(`${input}.getAttribute('aria-invalid') === 'false'`, 'number draft canceled');
  }

  // The set's details stay open beside the selection. With nothing selected every shape tool is unavailable and says why.
  if (!await evaluate("document.querySelector('[data-inspector-section=inspectorSetOpen]').open")) await keyboard(section('Set 1 details'));
  assert.deepEqual(await evaluate(`[...${strip}.querySelectorAll('[data-command="formation.preview"]')].map(node => node.getAttribute('aria-disabled'))`), ['true', 'true', 'true', 'true', 'true']);
  await keyboard(tool('Line formation'));
  assert.equal(await evaluate("!!document.querySelector('.formation-parameters')"), false);
  await sendKey(window,'Escape');
  assert.deepEqual(await snapshot(), fixture, 'empty selection does not reshape the ensemble');
  await selectionCapture('selection-empty.png');

  await pointer(`.field-stage__svg [data-performer-id="${fixture.performers[0].id}"]`);
  await uiWait("document.querySelector('.selection-count').textContent === '1 selected'", 'single selection');
  // One performer: where they stand in drill vocabulary, and the exact yards one step away.
  assert.equal(await evaluate("document.querySelector('.selection-bounds .selection-coordinate').textContent"), coordinateText({ x: 30, y: 20 }, true));
  assert.equal(await evaluate("!!document.querySelector('.exact-position')"), true);
  assert.deepEqual(await evaluate(`[${numberSelector('X · yards from left')}.value, ${numberSelector('Y · yards from back')}.value]`), ['30', '20']);
  assert.equal(await evaluate(`${strip}.querySelector('[aria-label="Rotate selection"]').getAttribute('aria-disabled')`), null);
  await selectionCapture('selection-single.png');

  await pointer('.inspector .field-legend button:first-child');
  await uiWait("document.querySelector('.selection-count').textContent === '2 selected'", 'group selection');
  // A group: its center the same way, and its size in steps (6 yards is 9.6 eight-to-five steps).
  assert.equal(await evaluate("document.querySelector('.selection-bounds .selection-coordinate').textContent"), coordinateText({ x: 33, y: 20 }, false));
  assert.equal(await evaluate("(([dt, dd]) => dt.textContent + ' ' + dd.textContent)(document.querySelector('.selection-stats > div').children)"), 'Size 9.6 × 0steps');
  assert.equal(await evaluate("!!document.querySelector('.exact-position')"), false);
  // The move buttons are in the Inspector, in reading order: left, back, front, right.
  await evaluate("document.querySelector('.inspector .move-selection-left').focus()");
  await uiWait("document.activeElement.getAttribute('aria-label') === 'Move selection left'", 'move action focus');
  const reached = [];
  for (let step = 0; step < 3; step++) { await sendKey(window, 'Tab'); reached.push(await evaluate("document.activeElement.getAttribute('aria-label')")); }
  assert.deepEqual(reached, ['Move selection back', 'Move selection front', 'Move selection right']);
  await sendKey(window, 'Return');
  const moved = await snapshot();
  for (const [i, performer] of fixture.performers.entries()) {
    assert.deepEqual(moved.sets[0].positions[performer.id], {x:fixture.sets[0].positions[performer.id].x + (i < 2 ? .625 : 0), y:fixture.sets[0].positions[performer.id].y});
  }
  assert.deepEqual(moved.sets[1], fixture.sets[1]);
  const moveHistory = await openHistory(); assert.equal(moveHistory.length, 1); assert.match(moveHistory[0], /Nudge 2 performers/);
  await clickSelector('.modal [aria-label="Close dialog"]');
  menuAction('Undo drill edit'); assert.deepEqual(await snapshot(), fixture);
  await keyboard(tool('Rotate selection'));
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

  await keyboard(tool('Line formation'));
  await uiWait("document.activeElement?.matches('.formation-grid button')", 'formation reveal settled');
  // A preview shows its own parameters and nothing else in the panel: the set's fields return when it ends.
  assert.deepEqual(await evaluate("[!!document.querySelector('.inspector .inspector-tool .formation-parameters'), !!document.querySelector('.inspector input[aria-label=\"Set name\"]'), !!document.querySelector('.inspector .set-timing')]"), [true, false, false]);
  // An invalid formation draft stays until canceled; selection changes discard the preview.
  await editNumber('Length · steps', 0);
  assert.equal(await evaluate(`${numberSelector('Length · steps')}.value`), '0');
  assert.equal(await evaluate(`${numberSelector('Length · steps')}.getAttribute('aria-invalid')`), 'true');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply formation\"]').getAttribute('aria-disabled')"), 'true');
  await cancelNumberDraft('Length · steps');
  // The section chips give way to the preview's parameters, so the selection changes from the keyboard or the Edit menu.
  menuAction('Select all');
  await uiWait("!document.querySelector('.formation-parameters') && document.querySelector('.selection-count').textContent === '4 selected'", 'selection change discards contextual preview');
  assert.deepEqual(await snapshot(), fixture);
  // Set timing is unrelated to selection and must also retain incomplete input.
  await clickSelector('.set-card:nth-child(2)');
  await editNumber('Counts', 0);
  await pointer('.inspector .field-legend button:first-child');
  await uiWait("document.querySelector('.selection-count').textContent === '2 selected'", 'selection changed beside a set draft');
  assert.equal(await evaluate(`${numberSelector('Counts')}.value`), '0');
  assert.equal(await evaluate(`${numberSelector('Counts')}.getAttribute('aria-invalid')`), 'true');
  await cancelNumberDraft('Counts');
  // A collapsed section keeps the drafts mounted inside it: an out-of-range exact position survives closing and reopening Position.
  await clickSelector('.inspector [aria-label="Clear selection"]'); await uiWait("document.querySelector('.selection-count').textContent === '0 selected'", 'selection cleared before the position draft');
  await pointer(`.field-stage__svg [data-performer-id="${fixture.performers[0].id}"]`);
  await uiWait("document.querySelector('.selection-count').textContent === '1 selected' && !!document.querySelector('.exact-position')", 'single selection for the position draft');
  if (!await evaluate("document.querySelector('.selected-performer').open")) await keyboard('.selected-performer > summary');
  await editNumber('X · yards from left', 999);
  await keyboard(section('Position')); await uiWait("!document.querySelector('.selection-section').open", 'Position collapsed');
  await keyboard(section('Position')); await uiWait("document.querySelector('.selection-section').open", 'Position reopened');
  assert.equal(await evaluate(`${numberSelector('X · yards from left')}.value`), '999');
  assert.equal(await evaluate(`${numberSelector('X · yards from left')}.getAttribute('aria-invalid')`), 'true');
  await cancelNumberDraft('X · yards from left');
  assert.deepEqual(await snapshot(), fixture);
  await pointer('.inspector .field-legend button:first-child');
  await uiWait("document.querySelector('.selection-count').textContent === '2 selected'", 'group selection restored');
  pass('invalid formation drafts stay until cancellation and collapsed sections keep theirs; changed selection cancels contextual previews and preserves unrelated invalid set drafts');

  await keyboard(tool('Line formation')); await uiWait("!!document.querySelector('.formation-parameters')", 'line preview');
  await editNumber('Length · steps', 16);
  await uiWait("document.querySelector('.formation-grid [aria-label=\"Line formation\"]').getAttribute('aria-pressed') === 'true'", 'line chosen');
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
    // The five operations on a selection are on screen: in the Inspector, on the tool strip, or in the strip's Shape and
    // Arrange menus once a narrow strip folds its groups away. A folded tool keeps its action under the menu's own label.
    const clipped=[];
    for(const names of [['Move selection left'],['Rotate selection'],['Line formation','Line'],['Mirror selection','Mirror across the 50'],['Align selection']]){
      let visible=false;
      for(const name of names){
        const selector=name.startsWith('Move')?`.inspector [aria-label="${name}"]`:tool(name);
        if(!await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].some(n=>n.getClientRects().length||(m=>m&&[...document.querySelectorAll('[aria-controls]')].some(t=>t.getAttribute('aria-controls')===m.id&&t.getClientRects().length))(n.closest('[role=menu]')))`))continue;
        const node=await locate(selector);
        visible=await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const n=document.querySelector(${JSON.stringify(node)});n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();resolve(r.width>0&&r.left>=0&&r.right<=innerWidth+.5&&r.top>=0&&r.bottom<=innerHeight+.5&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)));})))`);
        if(await evaluate("!!document.querySelector('[role=menu][data-escape-scope]')")){await sendKey(window,'Escape');await uiWait("!document.querySelector('[role=menu][data-escape-scope]')",'menu closed after reaching '+name);}
        if(visible)break;
      }
      if(!visible)clipped.push(names[0]);
    }
    assert.deepEqual(clipped, [], `selection operations at ${width}px / ${scale}×`);
    const fieldHeight = await evaluate("document.querySelector('.field-container').getBoundingClientRect().height");
    if (width===1366 && scale===1) assert.ok(fieldHeight>=470);
    measurements.push({width,scale,fieldHeight,clipped});
    await selectionCapture(`selection-group-${width}-${scale}.png`);
  }
  window.webContents.setZoomFactor(1); window.setContentSize(1366,768);
  await settleNativeViewport(window, 'restored selection viewport');
  await keyboard(tool('Mirror selection') + ', [role=menu][aria-label="Arrange"] [aria-label="Mirror across the 50"]');
  await uiWait("!!document.querySelector('.transform-panel')", 'mirror preview open');
  assert.equal(await evaluate(`${strip}.dataset.context`),'preview');
  assert.equal(await evaluate(`${strip}.querySelector('[data-command="spacing.preview"]')`),null);
  assert.deepEqual(await snapshot(), fixture);
  await keyboard('[aria-label="Cancel transform"]');
  await uiWait("!document.querySelector('.transform-panel')", 'mirror preview canceled');
  await scrubCount(1);
  // Between sets the strip names the move and offers the way back; the selection is kept.
  await uiWait(`${strip}.dataset.context === 'scrub' && !!${strip}.querySelector('.toolbar-commit button')?.getClientRects().length`, 'preview selection recovery');
  assert.equal(await evaluate("document.querySelector('.selection-count').textContent"), '2 selected');
  assert.equal(await evaluate(`${strip}.querySelector('[data-command="formation.preview"]')`),null);
  await selectionCapture('selection-preview.png');
  await keyboard('.field-command-toolbar .toolbar-commit button');
  await uiWait(`!document.querySelector('.field-preview-banner') && !document.querySelector('#field-lock-message') && ${strip}.dataset.context === 'group'`, 'selection return to set');
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
  async function keyboard(selector) { const node=await locate(selector); await evaluate(`document.querySelector(${JSON.stringify(node)}).focus()`); await sendKey(window,'Return'); }
  // Rotate and Mirror are tools on the strip, or actions in its Arrange menu once a narrow strip folds the group away.
  const launcher={'Rotate selection':'.field-command-toolbar [aria-label="Rotate selection"], [role=menu][aria-label="Arrange"] [aria-label="Rotate selection"]','Mirror selection':'.field-command-toolbar [aria-label="Mirror selection"], [role=menu][aria-label="Arrange"] [aria-label="Mirror across the 50"]'};
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
    await keyboard(launcher[operation]); await uiWait("!!document.querySelector('.transform-panel')",'exact preview open');
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
  await keyboard('.inspector .field-legend button:first-child'); await uiWait("document.querySelector('.selection-count').textContent==='2 selected'",'exact selection');
  assert.deepEqual(await savedSnapshot(),fixture);
  await open(); await editNumber('Angle · degrees',90);
  const typed=await displayed(); near(typed,{[ids[0]]:{x:33,y:17},[ids[1]]:{x:33,y:23}});
  assert.deepEqual(await savedSnapshot(),fixture,'preview must not leak into a project save');
  await captureExact('transform-rotation.png');
  const layout=[];
  for(const [width,zoom] of [[1366,1],[1366,1.25],[1120,1],[1120,1.25]]) {
    window.setContentSize(width,768); window.webContents.setZoomFactor(zoom);
    await settleNativeViewport(window, 'transform viewport');
    const clipped=await evaluate(`['Apply transform','Cancel transform','Undo','Export','Project menu'].filter(name=>![...document.querySelectorAll('button[aria-label="'+name+'"]')].some(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+.5&&r.top>=0&&r.bottom<=innerHeight+.5&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}))`);
    assert.deepEqual(clipped,[]);
    // A preview leaves the saved file clean, so the top bar does not offer Save; the parameters sit in the docked panel.
    assert.deepEqual(await evaluate("[!!document.querySelector('.topbar .header-save'),!!document.querySelector('.side-panel:not(.side-panel--overlay) .transform-panel')?.getClientRects().length]"),[false,true]); layout.push({width,zoom,clipped}); await captureExact(`transform-${width}-${zoom}.png`);
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

  await open(); await evaluate('document.activeElement.blur()'); await sendKey(window,'H');
  await uiWait("document.querySelector('.field-stage').classList.contains('field-stage--pan')",'pan tool from its shortcut during a preview');
  const panStart=await screenPoint(80,40);
  for(const event of [{type:'mouseMoved',...panStart},{type:'mousePressed',...panStart,button:'left',buttons:1,clickCount:1},{type:'mouseMoved',x:panStart.x+24,y:panStart.y+12,button:'left',buttons:1},{type:'mouseReleased',x:panStart.x+24,y:panStart.y+12,button:'left',buttons:0,clickCount:1}]) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',event);
  await sendKey(window,'V'); await uiWait("!document.querySelector('.field-stage').classList.contains('field-stage--pan')",'select tool from its shortcut during a preview'); await nativeDrag('pivot',()=>({x:40,y:25}));
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
  await open(); await editNumber('Angle · degrees',15); menuAction('Select all');
  await uiWait("!document.querySelector('.transform-panel')&&document.querySelector('.selection-count').textContent==='4 selected'",'selection change invalidates transform'); assert.deepEqual(await savedSnapshot(),fixture);
  const first=fixture.performers[0].id; await keyboard('.inspector .field-legend button:first-child');
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
    await installConfirmShim(evaluate);
    // The untouched startup demo is clean but never saved: neutral status, no Save marker and no close prompt.
    assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'No changes');
    assert.equal(await evaluate("document.querySelector('.save-state .status-dot').classList.contains('idle')"), true);
    // The top bar offers Save only while there is something to save.
    assert.equal(await evaluate("document.querySelector('.topbar .header-save, .topbar button[aria-label=\"Save\"]')"), null);
    const startupMessages = messages.length; let startupClosePrevented = false;
    window.emit('close', { preventDefault() { startupClosePrevented = true; } });
    await pause(60);
    assert.equal(startupClosePrevented, false); assert.equal(messages.length, startupMessages);
    pass('production renderer and actual isolated preload load; the untouched demo reports No changes and closes without an unsaved prompt');
    await checkActionClarity();

    menuAction('Open project…');
    await uiWait("document.querySelector('.project-title')?.textContent.includes('Editor boundary QA')", 'boundary import');
    assert.equal(await evaluate(`${numberSelector('Counts')}.disabled`), true);
    assert.equal(await evaluate(`${numberSelector('Tempo · BPM')}.disabled`), true);
    // An unavailable control says why in its tooltip rather than in a paragraph in the panel. Tab reaches a disabled
    // field so the reason can be read from the keyboard.
    await evaluate("[...document.querySelectorAll('.inspector .field-legend button')].at(-1).focus()");
    for (const [label, reason] of [['Counts', 'The opening set has no incoming move and always has zero counts.'], ['Tempo · BPM', 'The opening set has no incoming move; select a later set to edit tempo.']]) {
      await sendKey(window, 'Tab');
      await uiWait(`document.activeElement?.matches('.tooltip-disabled-field[aria-disabled=true]') && document.activeElement.getAttribute('aria-label') === ${JSON.stringify(label)} && document.activeElement.contains(${numberSelector(label)})`, `Tab reaches the unavailable ${label} field`);
      await uiWait(`document.querySelector('[role=tooltip]')?.textContent === ${JSON.stringify(label)} + document.querySelector('[role=tooltip] p').textContent + ${JSON.stringify('Unavailable: ' + reason)}`, `${label} explains why it is unavailable`);
    }
    await evaluate('document.activeElement.blur()');
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

    await showRightPanel(window,'cast');
    await clickSelector('[aria-label="Add performers"]');
    await editNumber('Number of performers', 0);
    await clickText('Add performers', '.modal', true);
    assert.equal(await evaluate("!!document.querySelector('.modal[open]')"), true);
    await keyOnNumber('Number of performers', 'Escape');
    await clickSelector('.modal [aria-label="Close dialog"]');
    await activateWorkspace(window,'design');
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
    await clickSelector('.field-command-toolbar [aria-label="Line formation"]');
    await uiWait("!!document.querySelector('.formation-parameters')", 'line formation preview');
    await editNumber('Length · steps', 0);
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply formation\"]').getAttribute('aria-disabled')"), 'true');
    await clickLabel('Apply formation', true);
    await keyOnNumber('Length · steps', 'Escape');
    menuAction('Save');
    await pause(150);
    saved = await savedProject(p => p.moves[0].counts === 1024);
    assert.equal(JSON.stringify(saved.sets[1].positions), beforeFormation);
    pass('an invalid formation draft cannot apply the previous dimensions');
    await clickLabel('Apply formation');
    menuAction('Save');
    saved = await savedProject(p => JSON.stringify(p.sets[1].positions) !== beforeFormation);
    assert.equal(saved.performers.length, 64);
    assert.equal(saved.schemaVersion, 2);
    assert.equal(saved.sets[0].counts, undefined);
    assert.equal(saved.moves[0].fromSetId, saved.sets[0].id);
    assert.equal(saved.moves[0].toSetId, saved.sets[1].id);
    pass('formation application mutates only the intended set and keeps a valid roster');

    const initialCount = await evaluate(showCount);
    await clickSelector('[aria-label="Play show"]');
    await uiWait("document.querySelector('[aria-label=\"Pause playback\"]') !== null", 'playback start');
    await uiWait(`${showCount} > ${initialCount}`, 'playhead progression');
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
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription({ x: 20, y: 20 }, saved.field),
      JSON.stringify({ hover: await screenPoint(20, 20), zoom: await evaluate("document.querySelector('[aria-label=\"Zoom in\"]')?.parentElement?.textContent"), readout: await evaluate("document.querySelector('.field-readout')?.textContent"), layout: await evaluate(LAYOUT_DIAGNOSTIC) }));
    await evaluate("document.querySelector('.field-stage__svg').style.transform = 'scaleX(-1)'");
    await hoverPoint(20, 20);
    assert.equal(await evaluate("document.querySelector('.field-readout span').textContent"), coordinateDescription({ x: 20, y: 20 }, saved.field),
      JSON.stringify({ mirrored: true, hover: await screenPoint(20, 20), under: await evaluate(`(() => { const p = new DOMPoint(20, 20).matrixTransform(document.querySelector('.field-stage__svg').getScreenCTM()); const hit = document.elementFromPoint(p.x, p.y); return (hit?.getAttribute('class') || hit?.tagName || 'nothing').toString().slice(0, 60) + ' in ' + (hit?.closest('.field-container, .side-panel, .toolbar, .timeline, .topbar')?.className.toString().slice(0, 40) || 'elsewhere'); })()`), readout: await evaluate("document.querySelector('.field-readout')?.textContent"), layout: await evaluate(LAYOUT_DIAGNOSTIC) }));
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
    // Between sets the tool strip says so in place of its tools, and the transport reads the count within the move.
    const strip = "document.querySelector('.field-command-toolbar')", lock = "document.querySelector('#field-lock-message')";
    await uiWait(`${strip}.dataset.context === 'scrub' && !!${lock}?.getClientRects().length`, 'visible between-set banner');
    assert.match(await evaluate(`${lock}.textContent`), /^Between setsMove 1 → 2$/);
    assert.match(await evaluate("document.querySelector('.move-count .readout-value').textContent"), /^512\/ 1024$/);
    assert.equal(await evaluate("!!document.querySelector('.move-count').getClientRects().length"), true);
    // The same message describes the field to assistive technology.
    assert.match(await evaluate("document.querySelector('#field-preview-message').textContent"), /Move 1 → 2.*Count 512.*512 \/ 1024/);
    assert.equal(await evaluate(`${numberSelector('X · yards from left')}.disabled && ${numberSelector('Y · yards from back')}.disabled`), true);
    assert.deepEqual(await evaluate(`[...${strip}.querySelectorAll('[data-command]')].map(node => node.dataset.command)`), [], 'no editing tool is offered between sets');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(dotSelector)})).cursor`), 'default');
    assert.equal(await evaluate("document.querySelector('.field-stage__svg').getAttribute('aria-describedby').split(/\\s+/).includes('field-preview-message')"), true);
    const beforePreview = JSON.stringify(saved.sets[1].positions);
    await evaluate(`document.querySelector(${JSON.stringify(dotSelector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
    const previewDot = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(dotSelector)}); const point = new DOMPoint(0, 0).matrixTransform(element.getScreenCTM()); return { x: point.x, y: point.y }; })()`);
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...previewDot, button: 'left', clickCount: 1 });
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: previewDot.x + 40, y: previewDot.y, buttons: 1 });
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: previewDot.x + 40, y: previewDot.y, button: 'left', clickCount: 1 });
    menuAction('Save');
    await pause(150);
    saved = await savedProject(p => p.moves[0].counts === 1024);
    assert.equal(JSON.stringify(saved.sets[1].positions), beforePreview);
    await capture('field-preview.png');
    assert.equal(await evaluate(`${strip}.querySelector('.toolbar-commit button').getAttribute('aria-label')`), 'Go to set 2 to edit');
    await clickSelector('.field-command-toolbar .toolbar-commit button');
    await uiWait(`!document.querySelector('.field-preview-banner') && !${lock} && ${strip}.dataset.context === 'performer'`, 'one-click editing recovery');
    assert.equal(await evaluate("document.querySelector('.timeline-scrubber').value"), '1024');
    assert.equal(await evaluate(`${numberSelector('X · yards from left')}.disabled`), false);
    assert.equal(await evaluate(`${strip}.querySelector('[data-command="formation.preview"]').getAttribute('aria-disabled') === 'true'`), false);
    pass('between-set preview blocks drag, nudge, formation and Inspector edits and recovers at the named arrival');

    await clickSelector('[aria-label="Play show"]');
    await uiWait(`${strip}.dataset.context === 'playback' && ${lock}?.textContent.startsWith('Playing')`, 'playback lock');
    await clickSelector('.field-command-toolbar .toolbar-commit button');
    await uiWait(`!${lock} && !['playback', 'scrub'].includes(${strip}.dataset.context)`, 'playback lock removed');
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
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.history-actions button')].map(b => [b.textContent.split(' ')[0], b.getAttribute('aria-disabled')])"), [['Undo', null], ['Redo', 'true']]);
    await clickSelector('.history-actions button:first-child');
    // The emptied list is a sentence, not a bare bordered list; the now-unavailable Undo looks unavailable (the design
    // system's unavailable text color, which stays readable, instead of the available Redo's) and reads unavailable.
    await uiWait("!!document.querySelector('.history-empty')", 'history empty state after undo');
    // The two buttons change color over a short transition; read them once it has finished.
    await uiWait("[...document.querySelectorAll('.history-actions button')].every(button => button.getAnimations().length === 0)", 'history actions settled after undo');
    assert.deepEqual(await evaluate("({ list: !!document.querySelector('.history-list:not(.future)'), empty: document.querySelector('.history-empty')?.textContent, undo: [document.querySelector('.history-actions button:first-child').getAttribute('aria-disabled'), (() => { const undo = document.querySelector('.history-actions button:first-child'), redo = document.querySelector('.history-actions button:nth-child(2)'), probe = document.createElement('span'); probe.style.color = 'var(--disabled-text)'; document.body.append(probe); const unavailable = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(undo).color === unavailable && getComputedStyle(redo).color !== unavailable && getComputedStyle(undo).opacity === '1'; })()], redo: document.querySelector('.history-actions button:nth-child(2)').getAttribute('aria-label') })"), { list: false, empty: 'No actions to undo.', undo: ['true', true], redo: `Redo ${actions[0]}` });
    // Undoing past the saved revision brings Save into the top bar, with the unsaved dot beside the title; redo takes both away.
    const unsaved = "[!!document.querySelector('.topbar .header-save')?.getClientRects().length, document.querySelector('.save-state').classList.contains('save-state--unsaved'), document.querySelector('.save-state .status-dot').classList.contains('unsaved')]";
    assert.deepEqual(await evaluate(unsaved), [true, true, true]);
    await clickSelector('.history-actions button:nth-child(2)');
    assert.deepEqual(await evaluate(unsaved), [false, false, false]);
    await clickSelector('.modal [aria-label="Close dialog"]');
    pass('40-character note drafts commit as one named action; undo and redo restore saved revision status');

    await typeText('.inspector textarea', 'Cancel this note draft');
    await fieldKey('.inspector textarea', 'Escape');
    assert.equal(await evaluate("document.querySelector('.inspector textarea').value"), 'N'.repeat(40));
    actions = await openHistory();
    assert.equal(actions.length, 1);
    await clickSelector('.modal [aria-label="Close dialog"]');
    pass('Escape cancels a text draft without creating history or changing the production');

    await showRightPanel(window,'cast');
    await clickSelector('[aria-label="Full Cast table"]');
    await uiWait("!!document.querySelector('.cast-table')", 'full Cast table');
    await typeText('.cast-table input[placeholder="Add a name"]', 'A'.repeat(40));
    await fieldKey('.cast-table input[placeholder="Add a name"]', 'Enter');
    await activateWorkspace(window,'design');
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
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.history-actions button')].map(b => b.getAttribute('aria-disabled'))"), ['true', 'true']);
    assert.equal(await evaluate("document.querySelector('.history-empty')?.textContent"), 'No actions to undo.');
    await clickSelector('.modal [aria-label="Close dialog"]');
    pass('file loads clear history and the history panel exposes its retention policy');

    assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'Project file saved');
    await typeText('.inspector textarea', 'A pending draft on a saved file');
    assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'Unsaved changes · Draft pending');
    for (const width of [1120, 1250]) {
      window.setSize(width, 800); await settleNativeViewport(window, 'draft-status viewport');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.save-state')).display !== 'none' && document.querySelector('.save-state').getBoundingClientRect().right <= document.querySelector('.header-actions').getBoundingClientRect().left"), true);
      // The full header spells the status out. Below 1200 px it keeps the amber unsaved dot beside the title.
      assert.deepEqual(await evaluate("[document.querySelector('.studio').dataset.header, !!document.querySelector('.save-state .status-dot.unsaved')?.getClientRects().length, !!document.querySelector('.save-state-text').getClientRects().length]"), [width < 1200 ? 'compact' : 'full', true, width >= 1200]);
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

    // Drive the in-app confirmation with real input instead of the shim.
    await evaluate("window.__qaConfirmResponse = 'manual'");
    const confirmations = await evaluate('window.__qaConfirmations.length');
    const confirmOpen = async (title, label) => {
      await uiWait(`document.querySelector('dialog.confirm-dialog[open] h2')?.textContent === ${JSON.stringify(title)}`, label);
      await uiWait("document.activeElement?.matches('.confirm-dialog__cancel') && !document.querySelector('.tooltip-panel')", `${label} focuses Cancel without a tooltip`);
    };
    const newProductionOnly = "!document.querySelector('.confirm-dialog') && document.querySelectorAll('dialog[open]').length === 1 && document.querySelector('dialog[open] h2')?.textContent === 'New production'";
    openPath = historyFile;
    menuAction('Open project…');
    await confirmOpen('Open another project?', 'open confirmation');
    await capture('file-confirm-open.png');
    await sendKey(window, 'Escape');
    await uiWait("!document.querySelector('dialog[open]')", 'Escape cancels the open confirmation');
    assert.equal(await evaluate("document.querySelector('.inspector textarea').value"), 'A later edit during save');
    assert.equal(await evaluate("document.querySelector('.save-state').textContent"), 'Unsaved changes');
    menuAction('New production');
    await uiWait("document.querySelector('.modal h2')?.textContent === 'New production'", 'new project prompt');
    await clickSelector('.new-options button:first-child');
    await confirmOpen('Replace this production?', 'replace confirmation');
    assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 2);
    await sendKey(window, 'Escape');
    await uiWait(newProductionOnly, 'Escape cancels only the replace confirmation');
    await clickSelector('.new-options button:first-child');
    await confirmOpen('Replace this production?', 'second replace confirmation');
    await clickSelector('.confirm-dialog__cancel');
    await uiWait(newProductionOnly, 'Cancel keeps New production open');
    assert.equal(await evaluate("document.querySelector('.inspector textarea').value"), 'A later edit during save');
    await clickSelector('.new-options button:first-child');
    await confirmOpen('Replace this production?', 'accepted replace confirmation');
    await clickSelector('.confirm-dialog__confirm');
    await uiWait("!document.querySelector('dialog[open]') && document.querySelector('.save-state').textContent === 'No changes'", 'new production has no changes');
    assert.equal(await evaluate("document.querySelectorAll('.set-strip .set-card').length"), 1);
    assert.equal(await evaluate("document.querySelector('.save-state .status-dot').classList.contains('idle')"), true);
    assert.equal(await evaluate('window.__qaConfirmations.length'), confirmations + 4);
    await evaluate('window.__qaConfirmResponse = true');
    menuAction('New production');
    await uiWait("document.querySelector('.modal h2')?.textContent === 'New production'", 'clean new project prompt');
    await clickSelector('.new-options button:first-child');
    await uiWait("!document.querySelector('dialog[open]') && document.querySelector('.save-state').textContent === 'No changes'", 'clean production replaced');
    assert.equal(await evaluate('window.__qaConfirmations.length'), confirmations + 4);
    const savesBefore = saves; destination = path.join(output, `new-production-${process.pid}.squid`);
    menuAction('Save');
    await savedProject(p => p.title === 'Untitled show' && p.sets.length === 1, destination);
    assert.equal(saves, savesBefore + 1);
    await uiWait("document.querySelector('.save-state').textContent === 'Project file saved'", 'new production saved');
    pass('in-app confirmations focus Cancel; Escape and Cancel preserve edits and New production; confirming creates a production with no changes whose first save still asks for a destination');
    await activateWorkspace(window,'design');
    await capture('file-save-status.png');

    await checkCompactChrome();
    await checkSelectionInspector();
    await checkExactTransforms();
    openPath = path.join(output, 'selection.squid'); menuAction('Open project…');
    await uiWait("document.querySelector('.project-title').textContent.includes('Selection Inspector QA') && document.querySelector('.set-card:first-child').classList.contains('selected')", 'formation fixture');
    await require('./formation-preview-qa.cjs')({ window, output, evaluate, uiWait, clickSelector, resolve: locate, editNumber, numberSelector, capture, pass, menuAction, openHistory,
      fixture: JSON.parse(await fs.readFile(openPath, 'utf8')),
      snapshot: async filename => { destination = filename; menuAction('Save As…'); const project = await savedProject(p => p.title === 'Selection Inspector QA', filename); await uiWait("document.querySelector('.save-state').textContent === 'Project file saved'", 'formation snapshot'); return project; } });
    await capture('editor.png');
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: checks, saveDialogs: saves, rendererNodeAccess: false }, null, 2));

    app.exit(0);
  } catch (error) {
     console.error(error);
    if (window && !window.isDestroyed()) {
      await capture('failure.png').catch(() => {});
      try { console.error('Renderer diagnostic:', await evaluate("JSON.stringify({ toast: document.querySelector('.toast')?.textContent, active: document.activeElement?.outerHTML.slice(0, 240), dialogs: [...document.querySelectorAll('dialog[open] h2')].map(node => node.textContent), fields: [...document.querySelectorAll('input[type=number]')].map(input => ({ label: input.parentElement?.firstChild?.textContent, value: input.value, invalid: input.getAttribute('aria-invalid'), disabled: input.disabled })) })")); } catch {}
    }
    app.exit(1);
  }
});
