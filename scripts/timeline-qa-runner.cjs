'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--timeline-manifest=')).slice('--timeline-manifest='.length));
const { root, output, profile, bundle } = manifest;
const { fixture, setStartCount, totalCounts } = require(bundle);
app.disableHardwareAcceleration(); app.setPath('userData', profile);
dialog.showMessageBox = async () => ({ response: 1 });
// Keep the window hidden until the fixed-viewport fit check: once shown, macOS
// can constrain the native window to its shorter desktop work area.
const showWindow = BrowserWindow.prototype.show;
BrowserWindow.prototype.show = function () {};
let window, failure; const checks = [], viewports = [];
app.on('browser-window-created', (_e, w) => { window = w; w.webContents.setBackgroundThrottling(false); w.webContents.on('render-process-gone', (_e, d) => { failure = new Error(d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const editor = 'window.__timelineQA.editor', state = editor + '.getState()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 20000, failure: () => failure });
const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const pass = label => { checks.push(label); console.log('PASS ' + label); };
const named = label => `[aria-label=${JSON.stringify(label)}]`;
// Find set in the transport is the set picker: a search field that takes a set number, and Enter to go there.
const finderTrigger = '.transport .set-jump', finderInput = '.set-finder input[aria-label="Find set"]';
async function selectTimelineSet(index) {
  await evaluate('document.activeElement?.blur()');
  await click(finderTrigger);
  await wait(`document.activeElement===document.querySelector(${JSON.stringify(finderInput)}) && document.activeElement.value===''`, 'Find set opens on an empty search');
  await window.webContents.debugger.sendCommand('Input.insertText', { text: String(index + 1) });
  await wait(`document.querySelector(${JSON.stringify(finderInput)})?.value===${JSON.stringify(String(index + 1))} && document.querySelectorAll('.set-finder [role=option]').length===1`, 'Find set lists set ' + (index + 1));
  await key(window, 'Return');
  await wait(`!document.querySelector('.set-finder') && ${state}.selection.activeIndex===${index}`, 'Find set goes to set ' + (index + 1));
}
// Zoom, fit and follow are items of the Timeline options menu; zoom and follow keep it open.
const timelineMenu = '[role=menu][aria-label="Timeline options"]', timelineItem = label => `${timelineMenu} ${named(label)}`;
const timelineMenuOpen = () => evaluate(`document.querySelector(${JSON.stringify(timelineMenu)}).hidden===false`);
async function closeTimelineMenu() {
  if (!await timelineMenuOpen()) return;
  await key(window, 'Escape'); await wait(`document.querySelector(${JSON.stringify(timelineMenu)}).hidden`, 'Timeline options closed'); await frames();
}
async function chooseTimeline(label, times = 1) {
  if (!await timelineMenuOpen()) { await click('button' + named('Timeline options')); await wait(`document.querySelector(${JSON.stringify(timelineMenu)}).hidden===false`, 'Timeline options open'); await frames(); }
  for (let i = 0; i < times; i++) await click(timelineItem(label));
  await closeTimelineMenu();
}
const moveReadout = () => evaluate("(()=>{const n=document.querySelector('.move-count'),value=n.querySelector('.readout-value');return {heading:n.querySelector('.move-heading').textContent,count:value.querySelector('strong')?.textContent??null,of:value.querySelector('small')?.textContent??null,status:value.getAttribute('role')==='status'};})()");
function instrument() {
  const qa = window.__timelineQA = { editor: null, errors: [] };
  window.addEventListener('error', e => qa.errors.push(e.message)); window.addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) qa.editor = v; visit(f.child); visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function click(selector) {
  const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e) throw Error('Missing '+${JSON.stringify(selector)}); e.scrollIntoView({block:'nearest',inline:'nearest'}); const r=e.getBoundingClientRect(); const x=r.x+r.width/2,y=r.y+r.height/2; if(x<0||y<0||x>=innerWidth||y>=innerHeight||!e.contains(document.elementFromPoint(x,y))) throw Error('Unreachable native click: '+${JSON.stringify(selector)}+' '+JSON.stringify({x,y,width:innerWidth,height:innerHeight})); return {x,y};})()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
  await frames();
}
async function capture(name) {
  await evaluate(`${editor}.setValue('ui','toast',''); document.activeElement?.blur()`);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await capturePage(window, output, name);
  viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container').getBoundingClientRect().height,timelineHeight:document.querySelector('.timeline').getBoundingClientRect().height,setStripHeight:document.querySelector('.timeline .set-strip')?.getBoundingClientRect().height??0})`));
}
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'window'); await wait("!!document.querySelector('.set-card')", 'renderer');
    window.setContentSize(1366, 768); await settleNativeViewport(window, 'review timeline');
    window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    window.webContents.reload(); await wait(`!!${editor} && ${state}.preferences.status==='saved'`, 'store and preferences');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)", 'recovery startup');
    const project = fixture();
    await evaluate(`${editor}.setValue('ui','dialog',null); ${editor}.dispatch('project.load',{project:${JSON.stringify(project)}})`); await frames();
    if (manifest.baseline) { await capture('timeline-before.png'); app.exit(0); return; }
    const original = await evaluate(`JSON.stringify(${state}.project.present)`);
    await capture('timeline-fit-dark.png');
    // The opening reads "Opening 0" in the move readout, and Find set beside it carries the set number.
    assert.deepEqual(await moveReadout(), { heading: 'Opening', count: '0', of: null, status: false });
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(finderTrigger)} + ' .set-jump-number').textContent`), '01');
    // Measure the fixed 1366 x 768 review viewport while hidden. macOS constrains a shown window
    // to its physical desktop, which can be smaller than this review viewport.
    // The strip of set cards now sits under the timeline; the transport and tracks keep the timeline's height
    // budget, and with the cards showing the field keeps its own.
    { const fit = viewports.at(-1); assert.deepEqual([fit.width, fit.height], [1366, 768]); assert.ok(fit.setStripHeight > 0 && fit.timelineHeight - fit.setStripHeight <= 122 && fit.fieldHeight >= 470, JSON.stringify(fit)); }
    BrowserWindow.prototype.show = showWindow; window.show(); window.focus(); if (manifest.smallDesktop) window.setContentSize(1024, 647); await settleNativeViewport(window, 'visible timeline');
    // Tab follows set order: the opening set comes first, the problem row adds at most one stop, then the playhead.
    // The problem count is in the top bar, ahead of the timeline; Timeline options is the last transport control.
    assert.equal(await evaluate("(()=>{const badge=document.querySelector('.topbar .problem-count-badge'),timeline=document.querySelector('.timeline');return /^Show-wide problems/.test(badge.getAttribute('aria-label'))&&badge.tabIndex===0&&!badge.disabled&&badge.getClientRects().length>0&&!!(badge.compareDocumentPosition(timeline)&Node.DOCUMENT_POSITION_FOLLOWING);})()"), true);
    await evaluate("document.querySelector('button[aria-label=\"Timeline options\"]').focus()");
    const order = [];
    // Each Tab reaches a differently named control; wait for it so a slow focus change is never read twice.
    for (let i = 0, previous = 'Timeline options'; i < 140 && order.at(-1) !== 'Timeline playhead'; i++) {
      await key(window, 'Tab'); await wait(`document.activeElement?.getAttribute('aria-label') !== ${JSON.stringify(previous)}`, 'Tab moves focus');
      order.push(previous = await evaluate("document.activeElement?.getAttribute('aria-label')"));
    }
    const setStops = order.filter(label => /^(Opening set|Set \d+):/.test(label));
    assert.match(order[0], /^Opening set:/);
    assert.deepEqual(setStops.map(label => label.startsWith('Opening') ? 1 : Number(/^Set (\d+)/.exec(label)[1])), Array.from({ length: 128 }, (_, i) => i + 1));
    assert.ok(order.length - setStops.length - 1 <= 1, JSON.stringify(order.slice(setStops.length)));
    assert.equal(order.at(-1), 'Timeline playhead'); await evaluate('document.activeElement?.blur()');
    pass('timeline Tab order runs from Timeline options through the opening set and all 128 sets in order, then at most one problem-row stop and the playhead; the problem badge is a stop in the top bar');
    await chooseTimeline('Zoom in', 2);
    assert.ok(await evaluate("Number(document.querySelector('[aria-label=\"Pan timeline\"]').max)>0"));
    for (let i = 0; i < 128; i++) {
      await selectTimelineSet(i);
      await frames();
      assert.equal(await evaluate(state + '.playback.count'), setStartCount(project, i));
      assert.equal(await evaluate(state + '.selection.activeIndex'), i);
      assert.equal(await evaluate("!!document.querySelector('.playhead')"), true);
    }
    pass('Find set intentionally visits all 128 set arrivals at useful zoom, including opening and final sets');
    await selectTimelineSet(2);
    await chooseTimeline('Zoom in', 11);
    await capture('timeline-zoom-dark.png');
    const point = await evaluate("(()=>{const r=document.querySelector('.timeline-scrubber').getBoundingClientRect();return {x:r.x+r.width*.371,y:r.y+r.height/2};})()");
    for (const type of ['mouseMoved','mousePressed','mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});
    await frames();
    const scrubbed = await evaluate(state + '.playback.count');
    assert.ok(scrubbed>9 && scrubbed<41 && Math.abs(scrubbed-Math.round(scrubbed))>.001);
    assert.equal(await evaluate("document.querySelector('.show-count strong').textContent"),String(Math.round(scrubbed*1000)/1000));
    await selectTimelineSet(2); await frames();
    const pan = '[aria-label="Pan timeline"]';
    await evaluate(`document.querySelector(${JSON.stringify(pan)}).focus()`); await key(window, 'End'); await frames();
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(timelineItem('Follow playhead'))}).getAttribute('aria-checked')`), 'false');
    assert.equal(await evaluate(state + '.playback.count'), 9);
    await chooseTimeline('Follow playhead');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(timelineItem('Follow playhead'))}).getAttribute('aria-checked')`), 'true');
    assert.equal(await evaluate("!!document.querySelector('.playhead')"), true);
    pass('keyboard pan leaves count untouched, disables follow, and re-enabling follow returns to the playhead');
    await evaluate(`${editor}.dispatch('playback.scrub',{count:8.25}); document.activeElement?.blur()`); await frames();
    await key(window, '.'); await wait(`${state}.playback.count===9.25`, 'period count step');
    await key(window, ','); await wait(`${state}.playback.count===8.25`, 'comma count step');
    assert.deepEqual(await moveReadout(), { heading: 'Move', count: '7.25', of: '/ 8', status: false });
    assert.equal(await evaluate("document.querySelector('.show-count strong').textContent"), '8.25');
    // The count steps are drawn as +1 and −1.
    assert.deepEqual(await evaluate("['Previous count','Next count'].map(label=>document.querySelector('.play-controls [aria-label=\"'+label+'\"]').textContent)"), ['−1', '+1']);
    await click(named('Next count')); assert.equal(await evaluate(state + '.playback.count'), 9.25);
    await click(named('Previous count')); assert.equal(await evaluate(state + '.playback.count'), 8.25);
    for (const count of [0, totalCounts(project)]) {
      await evaluate(`${editor}.dispatch('playback.scrub',{count:${count}}); document.activeElement?.blur()`);
      await key(window, count === 0 ? ',' : '.'); assert.equal(await evaluate(state + '.playback.count'), count);
    }
    pass('pointer and keyboard steps preserve fractional position, agree with local/show readouts and clamp at both ends');
    await evaluate(`${editor}.dispatch('set.select',{index:1})`); await frames();
    const textInput = 'input[aria-label="Set name"]';
    assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(textInput)})`));
    await evaluate(`document.querySelector(${JSON.stringify(textInput)}).focus()`);
    await key(window, ','); await key(window, '.'); assert.equal(await evaluate(state + '.playback.count'), 1);
    await key(window, 'Escape'); await evaluate('document.activeElement?.blur()');
    await chooseTimeline('Fit whole show'); await chooseTimeline('Zoom in', 2);
    await evaluate(`${editor}.dispatch('playback.scrub',{count:0}); ${editor}.setValue('playback','speed',1.5)`);
    await click(named('Play show')); await wait(`${state}.playback.playing`, 'native Play starts playback'); await wait(`${state}.playback.count>2`, 'playback advancement');
    const running = await evaluate(`(()=>{const move=document.querySelector('.move-count'),value=move.querySelector('.readout-value');return {playing:${state}.playback.playing,show:document.querySelector('.show-count strong').textContent,heading:move.querySelector('.move-heading').textContent,move:value.textContent,status:value.getAttribute('role')==='status',score:document.querySelector('[aria-label="Score position"]').textContent,valuetext:document.querySelector('[aria-label="Timeline playhead"]').getAttribute('aria-valuetext')};})()`);
    assert.equal(running.playing, true); assert.match(running.show, /^\d+$/); assert.doesNotMatch(`${running.score} ${running.valuetext}`, /\d\.\d/, JSON.stringify(running));
    if (running.heading === 'Move' && !running.status) assert.match(running.move, /^\d+\/ \d+$/, JSON.stringify(running));
    assert.equal(await evaluate("!!document.querySelector('.playhead')"), true); await click(named('Pause playback'));
    pass('ordinary typing does not step counts, follow keeps the running clock visible, and running readouts show whole counts');
    for (const theme of ['light','high-contrast']) {
      await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);
      await capture(`timeline-${theme}.png`);
    }
    window.setContentSize(1024, 720); window.webContents.setZoomFactor(1.25); await settleNativeViewport(window, 'enlarged timeline');
    const inViewport = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();return r.width>0 && r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight;})()`);
    for (const selector of ['button' + named('Timeline options'), finderTrigger, named('Next count'), named('Play show')]) {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`); await frames();
      assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(selector)})`), true, selector);
      assert.equal(await inViewport(selector), true, selector);
    }
    // Zoom lives in the Timeline options menu and the picker in the Find set popover: both open inside the window.
    await click('button' + named('Timeline options')); await wait(`document.querySelector(${JSON.stringify(timelineMenu)}).hidden===false`, 'enlarged Timeline options'); await frames();
    for (const label of ['Zoom in', 'Zoom out', 'Fit whole show', 'Follow playhead']) assert.equal(await inViewport(timelineItem(label)), true, label);
    await closeTimelineMenu();
    await click(finderTrigger); await wait(`document.activeElement===document.querySelector(${JSON.stringify(finderInput)})`, 'enlarged Find set'); await frames();
    assert.equal(await inViewport(finderInput), true, 'Find set search'); assert.equal(await inViewport('.set-finder'), true, 'Find set popover');
    await key(window, 'Escape'); await wait("!document.querySelector('.set-finder')", 'enlarged Find set closed');
    await evaluate("document.querySelector('.count-display').scrollIntoView({block:'end'})"); await frames();
    await capture('timeline-enlarged.png');
    assert.equal(await evaluate(`JSON.stringify(${state}.project.present)`), original);
    assert.deepEqual(await evaluate('window.__timelineQA.errors'), []);
    pass('all themes and enlarged narrow layout retain controls; navigation leaves saved geometry, timing and history untouched');
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,source:manifest.source,scope:'targeted',sandboxDisabled:process.argv.includes('--no-sandbox')},null,2)); app.exit(0);
  } catch (error) { console.error(error); console.error(await evaluate(`({playback:${state}.playback,pendingDraft:${state}.ui.pendingDraft,toast:${state}.ui.toast,viewport:{width:innerWidth,height:innerHeight},active:document.activeElement?.outerHTML})`).catch(()=>null)); await capturePage(window,output,'failure.png').catch(()=>{}); await fs.writeFile(path.join(output,'failure.txt'),error.stack); app.exit(1); }
});
