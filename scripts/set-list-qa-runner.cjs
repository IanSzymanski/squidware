'use strict';
const {revealFieldTool}=require('./testing/renderer.cjs');
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const { root, output, profile, bundle } = require(process.argv.find(a => a.startsWith('--set-list-manifest=')).slice('--set-list-manifest='.length));
const { createPerformanceFixture, parseProject, setStartCount, setTiming } = require(bundle);
const savedFile = path.join(output, 'reordered.squid'), checks = [], layouts = [], errors = [];
app.disableHardwareAcceleration(); app.setPath('userData', profile);
BrowserWindow.prototype.show = function () {};
dialog.showSaveDialog = async () => ({ canceled: false, filePath: savedFile });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [savedFile] });
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure;
app.on('browser-window-created', (_e, w) => {
  window = w; w.webContents.setBackgroundThrottling(false);
  w.webContents.on('console-message', d => { if (d.level === 'error') errors.push(d.message); });
  w.webContents.on('render-process-gone', (_e, d) => { failure = new Error(d.reason); });
});
require(path.join(root, 'electron/main.cjs'));
const evaluate = s => window.webContents.executeJavaScript(s);
const editor = 'window.__setListQA.editor', state = editor + '.getState()';
const wait = (s, label) => waitFor(() => evaluate(s), label, { timeoutMs: 20000, failure: () => failure });
const debug = (method, params = {}) => window.webContents.debugger.sendCommand(method, params);
const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  window.__setListQA = { editor: null, errors: [] };
  window.addEventListener('error', e => window.__setListQA.errors.push(e.message));
  window.addEventListener('unhandledrejection', e => window.__setListQA.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { const visit = f => { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) window.__setListQA.editor = v; visit(f.child); visit(f.sibling); }; visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function point(selector) {
  await debug('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await wait(`new Promise(resolve=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.getAttribute('aria-disabled')==='true')return resolve(false);n.scrollIntoView({block:'nearest'});requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=n.getBoundingClientRect();window.__setListQA.point={x:r.x+r.width/2,y:r.y+r.height/2};resolve(n.contains(document.elementFromPoint(window.__setListQA.point.x,window.__setListQA.point.y)));}));})`, 'actionable ' + selector);
  return evaluate('window.__setListQA.point');
}
async function click(selector) { await revealFieldTool(window,selector);
  const p = await point(selector);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await debug('Input.dispatchMouseEvent', { type, ...p, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
  await frames();
}
async function type(selector, value) {
  await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.focus();n.select()})()`);
  await debug('Input.insertText', { text: String(value) });
  await wait(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});return document.activeElement===n&&n.value===${JSON.stringify(String(value))}})()`, 'observed native input '+selector); await frames();
}
const named = s => `[aria-label=${JSON.stringify(s)}]`;
const row = id => `.set-strip [data-set-id=${JSON.stringify(id)}]`;
// The set list is on demand: Find set in the transport opens a popover with a search field and every set as a row.
const finder = '.set-finder', finderInput = '.set-finder input[aria-label="Find set"]', finderTrigger = '.transport .set-jump';
const finderRows = () => evaluate("Array.from(document.querySelectorAll('.set-finder [role=option]'),n=>({number:n.querySelector('.set-finder-number').textContent,name:n.querySelector('.menu-item-label').textContent,hint:n.querySelector('.menu-item-hint').textContent,active:n.dataset.active==='true',current:n.getAttribute('aria-selected')==='true'}))");
async function openFinder() {
  await click(finderTrigger);
  await wait(`document.querySelector(${JSON.stringify(finderTrigger)}).getAttribute('aria-expanded')==='true' && document.activeElement===document.querySelector(${JSON.stringify(finderInput)}) && document.activeElement.value===''`, 'Find set opens on an empty search');
}
const finderClosed = label => wait(`!document.querySelector(${JSON.stringify(finder)}) && document.activeElement===document.querySelector(${JSON.stringify(finderTrigger)})`, label);
const thumbnailsItem = '[role=menu][aria-label="Timeline options"] [aria-label="Set thumbnails"]';
const persistedThumbnails = () => evaluate('(async()=> (await window.squidware.readPreferences()).preferences.setThumbnails)()');
async function capture(name) {
  await evaluate('document.activeElement?.blur()'); await debug('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await wait("!document.querySelector('.tooltip-panel')", 'dismissed help'); await capturePage(window, output, name);
}
async function visibleCurrent() {
  // The strip scrolls sideways; the current card must be wholly inside it.
  await wait("(()=>{const n=document.querySelector('.set-strip .set-card[aria-current]'),s=document.querySelector('.set-strip .set-list');if(!n)return false;const a=n.getBoundingClientRect(),b=s.getBoundingClientRect();return a.width>0&&a.left>=b.left-.5&&a.right<=b.right+.5&&a.top>=b.top-.5&&a.bottom<=b.bottom+.5})()", 'revealed current set');
}
async function dragRow(fromId, toId) {
  const source = await point(row(fromId)), target = await point(row(toId));
  let intercepted;
  const handler = (_e, method, params) => { if (method === 'Input.dragIntercepted') intercepted = params.data; };
  window.webContents.debugger.on('message', handler);
  await debug('Input.setInterceptDrags', { enabled: true });
  try {
    await debug('Input.dispatchMouseEvent', { type: 'mouseMoved', ...source });
    await debug('Input.dispatchMouseEvent', { type: 'mousePressed', ...source, button: 'left', buttons: 1, clickCount: 1 });
    await debug('Input.dispatchMouseEvent', { type: 'mouseMoved', x: source.x + 12, y: source.y + 12, button: 'left', buttons: 1 });
    await debug('Input.dispatchMouseEvent', { type: 'mouseMoved', ...target, button: 'left', buttons: 1 });
    await waitFor(() => !!intercepted, 'native intercepted set drag');
    assert.ok(intercepted.items.some(item => item.mimeType === 'application/x-squidware-set'));
    for (const type of ['dragEnter', 'dragOver', 'drop']) await debug('Input.dispatchDragEvent', { type, ...target, data: intercepted });
    await debug('Input.dispatchMouseEvent', { type: 'mouseReleased', ...target, button: 'left', buttons: 0, clickCount: 1 });
  } finally { await debug('Input.setInterceptDrags', { enabled: false }); window.webContents.debugger.off('message', handler); }
  await frames();
}
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'window'); await wait("!!document.querySelector('.field-stage__svg')", 'renderer');
    window.setContentSize(1366, 768); window.webContents.setZoomFactor(1); await settleNativeViewport(window, 'set list reference');
    window.webContents.debugger.attach('1.3'); await debug('Page.enable');
    await debug('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` }); window.webContents.reload();
    await wait(`!!${editor} && ${state}.preferences.status==='saved'`, 'store and preferences');
    await wait("['Recovery ready','Recovery copies available'].includes(document.querySelector('.recovery-indicator')?.textContent)", 'recovery startup');
    await evaluate(`${editor}.setValue('ui','dialog',null)`); await debug('Emulation.setFocusEmulationEnabled', { enabled: true });
    const maximum = parseProject(JSON.stringify(createPerformanceFixture('maximum')));
    maximum.sets[39].name = 'Ballad arrival'; maximum.sets[99].name = 'Ballad reprise';
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(maximum)}})`);
    await wait("document.querySelectorAll('.set-strip .set-card').length===128", 'maximum set strip');
    // The strip is a storyboard by default: every card carries its thumbnail. Compact cards are a personal preference, checked below.
    assert.equal(await evaluate("document.querySelectorAll('.set-strip .mini-field').length"), 128);
    const reference = await evaluate("({width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container').getBoundingClientRect().height,cardWidth:document.querySelector('.set-strip .set-card').getBoundingClientRect().width,add:document.querySelectorAll('.set-strip [aria-label=\"Add set\"]').length,addControls:document.querySelectorAll('[aria-label=\"Add set\"]').length})");
    assert.equal(reference.width, 1366); assert.equal(reference.height, 768); assert.ok(reference.fieldHeight >= 470, JSON.stringify(reference)); assert.equal(reference.cardWidth, 88); assert.equal(reference.add, 1); assert.equal(reference.addControls, 1); layouts.push({ name: 'reference', ...reference }); await capture('set-list-strip.png');
    // Home and End walk the cards in show order and keep the current card in view and focused.
    assert.equal(await evaluate(`${state}.selection.activeIndex`), 0);
    await evaluate("document.querySelector('.set-strip .set-card[aria-current]').focus()");
    await key(window, 'End'); await wait(`${state}.selection.activeIndex===127 && document.activeElement.matches('.set-strip .set-card[aria-current]')`, 'End reaches the last set'); await visibleCurrent();
    await key(window, 'Home'); await wait(`${state}.selection.activeIndex===0 && document.activeElement.matches('.set-strip .set-card[aria-current]')`, 'Home returns to the opening set'); await visibleCurrent();
    // A number addresses one set of the unfiltered show order.
    await openFinder();
    let rows = await finderRows(); assert.equal(rows.length, 128); assert.deepEqual(rows.filter(r => r.current).map(r => r.number), ['01']); assert.deepEqual(rows.filter(r => r.active).map(r => r.number), ['01']);
    await type(finderInput, '040'); rows = await finderRows();
    assert.deepEqual(rows.map(r => [r.number, r.name]), [['40', 'Ballad arrival']]);
    // The row carries what the old list's counts and BPM columns did.
    assert.equal(rows[0].hint, `${setTiming(maximum, 39).counts} counts · ${setTiming(maximum, 39).tempo} BPM`);
    await key(window, 'Return'); await wait(`${state}.selection.activeIndex===39`, 'number jump'); await finderClosed('number jump returns focus to Find set'); await visibleCurrent();
    assert.equal(await evaluate("document.querySelectorAll('.set-strip .set-card').length"), 128);
    // A name filters the rows. Arrow keys move through the matches only; Enter goes to the active one.
    await openFinder(); await type(finderInput, 'ballad'); rows = await finderRows();
    assert.deepEqual(rows.map(r => r.number), ['40', '100']); assert.deepEqual(rows.map(r => r.active), [true, false]); assert.deepEqual(rows.map(r => r.current), [true, false]);
    await capture('set-list-search.png'); await evaluate(`document.querySelector(${JSON.stringify(finderInput)}).focus()`);
    await key(window, 'Up'); await wait("document.querySelector('.set-finder [role=option][data-active=true] .set-finder-number')?.textContent==='100'", 'Up wraps to the last match');
    await key(window, 'Return'); await wait(`${state}.selection.activeIndex===99`, 'last filtered match'); await finderClosed('filtered jump returns focus to Find set'); await visibleCurrent();
    await openFinder(); await type(finderInput, 'ballad'); await key(window, 'Down'); await wait("document.querySelector('.set-finder [role=option][data-active=true] .set-finder-number')?.textContent==='100'", 'Down reaches the second match');
    await key(window, 'Down'); await wait("document.querySelector('.set-finder [role=option][data-active=true] .set-finder-number')?.textContent==='40'", 'Down wraps to the first match');
    await key(window, 'Return'); await wait(`${state}.selection.activeIndex===39`, 'first filtered match'); await finderClosed('first match returns focus to Find set'); await visibleCurrent();
    await openFinder(); await type(finderInput, 'not found'); assert.deepEqual(await finderRows(), []);
    assert.equal(await evaluate("document.querySelector('.set-finder .empty-state[role=status]').textContent"), 'No matching sets. Enter a number from 1 to 128, or part of a name.');
    await capture('set-list-empty.png'); await evaluate(`document.querySelector(${JSON.stringify(finderInput)}).focus()`);
    // Enter without a match goes nowhere; Escape leaves search, restores the whole list and returns focus to Find set.
    await key(window, 'Return'); await frames(); assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(finder)}) && ${state}.selection.activeIndex`), 39);
    await key(window, 'Escape'); await finderClosed('Escape leaves search'); await visibleCurrent();
    assert.equal(await evaluate("document.querySelectorAll('.set-strip .set-card').length"), 128);
    await openFinder(); rows = await finderRows(); assert.equal(rows.length, 128); assert.deepEqual(rows.filter(r => r.active).map(r => r.number), ['40']);
    // A user can leave search and move on at once: closing never pulls focus back afterwards.
    await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(finderInput)});n.focus();n.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('[aria-label="Timeline options"]').focus()})()`); await frames();
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), 'Timeline options'); assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(finder)})`), false);
    assert.equal(await evaluate(`${state}.project.past.length`), 0);
    pass('128-set number/name navigation, Home/End on the strip, arrow keys over filtered matches, no-match recovery and current-card reveal create no history');
    // The set list no longer reserves a footer for direct positions; the Command palette keeps the one-step reorder.
    const palette = named('Search commands or drill phrases');
    await evaluate(`${editor}.dispatch('palette.open')`); await wait(`!!document.querySelector(${JSON.stringify(palette)})`, 'palette open');
    await type(palette, 'Move current set to position 12'); await wait(`(()=>{const input=document.querySelector(${JSON.stringify(palette)});return document.getElementById(input.getAttribute('aria-activedescendant'))?.querySelector('strong')?.textContent==='Move current set to position 12'})()`, 'direct reorder ready'); await key(window, 'Return');
    await wait(`${state}.project.present.sets[11].id===${JSON.stringify(maximum.sets[39].id)} && ${state}.project.past.length===1`, 'single direct reorder');
    let accepted = await evaluate(state + '.project.present'); assert.equal(await evaluate(`${state}.selection.activeIndex`), 11); assert.equal(await evaluate(`${state}.playback.count`), setStartCount(accepted, 11)); await visibleCurrent(); await capture('set-list-reordered.png');
    await evaluate(`${editor}.dispatch('history.undo')`); await wait(`${state}.selection.activeIndex===39`, 'undo retains identity'); assert.deepEqual(await evaluate(state + '.project.present'), maximum);
    await evaluate(`${editor}.dispatch('history.redo')`); await wait(`${state}.selection.activeIndex===11`, 'redo retains identity'); assert.deepEqual(await evaluate(state + '.project.present'), accepted);
    await evaluate(`${editor}.dispatch('palette.open')`); await wait(`!!document.querySelector(${JSON.stringify(palette)})`, 'palette reopened');
    await type(palette, 'Move current set to position 999'); assert.equal(await evaluate("document.querySelectorAll('.palette-result').length"), 0);
    await key(window, 'Return'); await frames(); assert.equal(await evaluate(`${state}.project.past.length`), 1);
    // Typing the current position selects that exact, unavailable row, never a longer number such as 120.
    await type(palette, 'Move current set to position 12');
    await wait(`(()=>{const input=document.querySelector(${JSON.stringify(palette)});const option=document.getElementById(input.getAttribute('aria-activedescendant'));return option?.querySelector('strong')?.textContent==='Move current set to position 12'&&option.getAttribute('aria-disabled')==='true'})()`, 'current position unavailable');
    await key(window, 'Return'); await frames();
    assert.equal(await evaluate(`${state}.project.past.length`), 1); assert.equal(await evaluate(`${state}.project.present.sets[11].id`), maximum.sets[39].id);
    await key(window, 'Escape'); await wait(`!document.querySelector(${JSON.stringify(palette)})`, 'palette closed');
    pass('set 40 moves to position 12 from the Command palette in one named undo; undo/redo preserve active identity and invalid positions cannot commit');
    await evaluate(`${editor}.dispatch('file.save-as')`); await wait(`${state}.fileSession.saveStatus==='Project file saved'`, 'saved native reordered show');
    assert.deepEqual(parseProject(await fs.readFile(savedFile, 'utf8')), accepted);
    await evaluate(`${editor}.dispatch('file.open')`); await wait(`${state}.project.past.length===0`, 'native reopen'); assert.deepEqual(await evaluate(state + '.project.present'), accepted);
    // Thumbnails are a personal preference in Timeline options. Turning them off gives compact cards; neither choice edits the project.
    await click(thumbnailsItem); await wait(`!${state}.preferences.value.setThumbnails && ${state}.preferences.status==='saved'`, 'saved compact preference');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(thumbnailsItem)}).getAttribute('aria-checked')`), 'false');
    assert.equal(await evaluate("document.querySelectorAll('.set-strip .mini-field').length"), 0); assert.equal(await evaluate("document.querySelectorAll('.set-strip .set-card').length"), 128);
    assert.equal(await evaluate("document.querySelector('.set-strip .set-card').getBoundingClientRect().height"), 28);
    assert.equal(await persistedThumbnails(), false); assert.equal(await evaluate(`${state}.project.past.length`), 0);
    await key(window, 'Escape'); await wait("document.querySelector('[role=menu][aria-label=\"Timeline options\"]').hidden", 'Timeline options closed'); await visibleCurrent(); await capture('set-list-compact.png');
    await click(thumbnailsItem); await wait(`${state}.preferences.value.setThumbnails && ${state}.preferences.status==='saved'`, 'saved thumbnail preference');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(thumbnailsItem)}).getAttribute('aria-checked')`), 'true');
    assert.equal(await evaluate("document.querySelectorAll('.set-strip .mini-field').length"), 128); assert.equal(await persistedThumbnails(), true);
    assert.equal(await evaluate(`${state}.project.past.length`), 0);
    await key(window, 'Escape'); await wait("document.querySelector('[role=menu][aria-label=\"Timeline options\"]').hidden", 'Timeline options closed again'); await capture('set-list-thumbnails.png');
    pass('native save/reopen preserves all reordered data; optional thumbnails persist as personal preferences without a project edit');
    const small = parseProject(JSON.stringify(createPerformanceFixture('demo')));
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(small)}});${editor}.dispatch('set.select',{index:1})`); await frames();
    await dragRow(small.sets[2].id, small.sets[4].id);
    await wait(`${state}.project.present.sets[4].id===${JSON.stringify(small.sets[2].id)}`, 'native drag drop');
    assert.equal(await evaluate(`${state}.project.past.length`), 1); assert.equal(await evaluate(`${state}.selection.activeIndex`), 1);
    await evaluate(`${editor}.dispatch('history.undo')`); assert.deepEqual(await evaluate(state + '.project.present'), small);
    // Alt with an arrow moves the focused card one position; the card keeps focus and stays current.
    for (const arrow of ['Right', 'Down']) {
      await evaluate(`document.querySelector(${JSON.stringify(row(small.sets[1].id))}).focus()`); await key(window, arrow, ['alt']); await wait(`${state}.selection.activeIndex===2 && ${state}.project.present.sets[2].id===${JSON.stringify(small.sets[1].id)}`, 'keyboard reorder with Alt+' + arrow);
      assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(row(small.sets[1].id))})`), true);
      assert.equal(await evaluate(`${state}.project.past.length`), 1); await evaluate(`${editor}.dispatch('history.undo')`); assert.deepEqual(await evaluate(state + '.project.present'), small);
    }
    await evaluate(`${editor}.dispatch('set.select',{index:2})`); await evaluate(`document.querySelector(${JSON.stringify(row(small.sets[2].id))}).focus()`); await key(window, 'Left', ['alt']); await wait(`${state}.selection.activeIndex===1 && ${state}.project.present.sets[1].id===${JSON.stringify(small.sets[2].id)}`, 'keyboard reorder with Alt+Left');
    assert.equal(await evaluate(`${state}.project.past.length`), 1); await evaluate(`${editor}.dispatch('history.undo')`); assert.deepEqual(await evaluate(state + '.project.present'), small);
    pass('native pointer drag and Alt+arrow keys use atomic reorder while preserving active set identity');
    for (const theme of ['dark', 'light', 'high-contrast']) {
      await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`); await frames(); await capture('set-list-' + theme + '.png');
    }
    // Enlarged narrow layouts. A short window (under 620 effective px) gives the strip's height to the field; search and
    // every row stay in Find set. 1120×800 at 125% is as narrow and still tall enough for the strip.
    for (const [width, height, zoom] of [[1120,768,1.25],[1024,720,1.5],[1120,800,1.25]]) {
      window.setContentSize(width, height); window.webContents.setZoomFactor(zoom); await settleNativeViewport(window, 'set list enlarged');
      const inside = (r, v) => r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= v.height + .5 && r.left >= 0 && r.right <= v.width + .5;
      const short = await evaluate("document.querySelector('.studio').dataset.height==='short'");
      assert.equal(short, await evaluate('innerHeight<620'), 'short layout follows the height breakpoint');
      await openFinder();
      const metrics = await evaluate("(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}};return {viewport:{width:innerWidth,height:innerHeight},trigger:rect('.transport .set-jump'),finder:rect('.set-finder'),search:rect('.set-finder input[aria-label=\"Find set\"]'),rows:rect('.set-finder-list'),row:rect('.set-finder [role=option]'),options:document.querySelectorAll('.set-finder [role=option]').length,strip:document.querySelector('.set-strip').getClientRects().length,addControls:document.querySelectorAll('[aria-label=\"Add set\"]').length}})()");
      for (const r of [metrics.trigger, metrics.finder, metrics.search, metrics.rows]) assert.ok(inside(r, metrics.viewport), JSON.stringify(metrics));
      assert.equal(metrics.options, small.sets.length); assert.ok(metrics.rows.height >= 2 * metrics.row.height, JSON.stringify(metrics)); assert.equal(metrics.addControls, 1);
      await capture(`set-list-${width}x${height}-${zoom}.png`); await evaluate(`document.querySelector(${JSON.stringify(finderInput)}).focus()`);
      await key(window, 'Escape'); await finderClosed('Find set closed at ' + width + '×' + height);
      assert.equal(metrics.strip > 0, !short, JSON.stringify(metrics));
      if (!short) {
        const strip = await evaluate("(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}};return {list:rect('.set-strip .set-list'),card:rect('.set-strip .set-card'),add:rect('.set-strip [aria-label=\"Add set\"]')}})()");
        for (const r of [strip.list, strip.add]) assert.ok(inside(r, metrics.viewport), JSON.stringify({ metrics, strip }));
        assert.ok(strip.list.width >= 2 * strip.card.width && strip.list.height >= strip.card.height, JSON.stringify(strip)); await visibleCurrent(); Object.assign(metrics, strip);
      }
      layouts.push({ width, height, zoom, short, ...metrics });
    }
    assert.deepEqual(layouts.slice(1).map(l => l.short), [true, true, false]);
    pass('supported themes and enlarged narrow layouts retain search, rows and the single Add control');
    assert.deepEqual(errors, []); assert.deepEqual(await evaluate('window.__setListQA.errors'), []);
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: checks, layouts, platform: process.platform }, null, 2)); app.exit(0);
  } catch (error) { console.error(error); console.error('Set-list diagnostic',await evaluate("({focus:document.activeElement?.outerHTML.slice(0,300),query:document.querySelector('.set-finder input')?.value,active:window.__setListQA?.editor?.getState().selection.activeIndex,history:window.__setListQA?.editor?.getState().project.past.length})").catch(()=>null)); if (window && !window.isDestroyed()) await capturePage(window, output, 'failure.png').catch(() => {}); app.exit(1); }
});
