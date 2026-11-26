'use strict';
const {revealFieldTool}=require('./testing/renderer.cjs');
const { capturePage, key: sendKey, waitFor: waitUntil, waitViewport, settleNativeViewport } = require('./testing/renderer.cjs');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'); const path = require('node:path'); const assert = require('node:assert/strict');
const { root, output, profile, fixture, baseline } = require(process.argv.find(arg => arg.startsWith('--field-manifest=')).slice('--field-manifest='.length));
app.disableHardwareAcceleration();
app.setPath('userData', profile);
BrowserWindow.prototype.show = function () {};
dialog.showMessageBox = async () => ({ response: 1 });
let window; const checks = [];
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); });
require(path.join(root, 'electron/main.cjs'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => window.webContents.executeJavaScript(source);
const editor = 'window.__fieldQA.editor'; const state = editor + '.getState()';
const wait = (source, label) => waitUntil(() => evaluate(source), label, { timeoutMs: 20000 });
function instrument() {
  window.__fieldQA = { editor: null };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(fiber) { if (!fiber) return; const value = fiber.memoizedProps?.value; if (value?.getState && value?.dispatch) window.__fieldQA.editor = value; visit(fiber.child); visit(fiber.sibling); } visit(root.current); },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
const capture = name => capturePage(window, output, name);
const pass = label => { checks.push(label); console.log('PASS '+label); };
const input = (type, point, extra = {}) => {
  // sendInputEvent also works with hidden software-composited windows, where
  // DevTools' mouse acknowledgement can wait indefinitely for a visible frame.
  const types = { mouseMoved: 'mouseMove', mousePressed: 'mouseDown', mouseReleased: 'mouseUp' };
  // Electron's native mouseMove schema carries held buttons in modifiers.
  // A numeric `buttons` property alone can release capture on macOS.
  const modifiers = [...(extra.modifiers ? ['shift'] : []), ...(type === 'mouseMoved' && extra.buttons === 1 ? ['leftButtonDown'] : [])];
  window.webContents.sendInputEvent({ type:types[type], x:Math.round(point.x), y:Math.round(point.y), ...extra, modifiers });
};
async function click(point, modifiers = 0) { await input('mouseMoved', point); await input('mousePressed', point, { button: 'left', clickCount: 1, modifiers }); await input('mouseReleased', point, { button: 'left', clickCount: 1, modifiers }); }
const key = (keyCode, modifiers = []) => sendKey(window, keyCode, modifiers, 20);
async function checkNeighbors(project) {
  const performers = project.performers.slice(1, 5).map((person, index) => ({ ...person, sectionId: project.sections[index % 2].id }));
  const sets = [0, 1, 2].map(index => ({ id: `neighbor-${index}`, name: ['Departure', 'Arrival', 'Release'][index], notes: '',
    positions: Object.fromEntries(performers.map((person, i) => [person.id, { x: 35 + index * 7.5 + i * 2.5, y: 20 + i * 3.75 }])) }));
  // A ghost coincides with a real editable dot: it must never win a hit test.
  sets[1].positions[performers[1].id] = { ...sets[0].positions[performers[0].id] };
  const fixture = { ...project, title: 'Neighboring set review', performers, sets,
    moves: [0, 1].map(index => ({ ...project.moves[0], id: `neighbor-move-${index}`, fromSetId: sets[index].id, toSetId: sets[index + 1].id, counts: 16, transition: index ? 'linear' : 'ease', paths: {} })) };
  window.setContentSize(1366, 768);
  await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(fixture)}}); ${editor}.dispatch('set.select',{index:1}); ${editor}.setValue('ui','sectionFilter','all'); ${editor}.setValue('ui','showPaths',false); ${editor}.setValue('ui','showNextPaths',false)`);
  await wait("document.querySelectorAll('.field-performer').length===4", 'neighbor fixture');
  const before = await evaluate(`${state}.project`);
  await capture('neighbors-before.png');
  const previous = '[aria-label="Show paths from previous set"]';
  const next = '[aria-label="Show paths to next set"]';
  const clickControl = async selector => { await revealFieldTool(window,selector); const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); await click(point); };
  await clickControl(previous); await wait(`${state}.ui.showPaths`, 'previous toggle');
  await clickControl(next); await wait("document.querySelectorAll('[data-neighbor]').length===2", 'both neighbors');
  assert.equal(await evaluate("document.querySelectorAll('[data-neighbor-dot]').length"), 8);
  const firstPath = await evaluate(`document.querySelector('[data-neighbor=previous] [data-neighbor-performer="${performers[0].id}"] [data-neighbor-path]').getAttribute('d')`);
  assert.equal(firstPath, 'M 35 20 L 42.5 20');
  assert.ok(await evaluate("document.querySelector('.neighbor-legend').textContent.includes('From set 1') && document.querySelector('.neighbor-legend').textContent.includes('To set 3')"));
  assert.equal(await evaluate("document.querySelectorAll('[data-neighbor-overlays] [tabindex], [data-neighbor-overlays] [role=button]').length"), 0);
  await capture('neighbors-both.png');
  await click(await center(performers[1].id)); await selected(performers[1].id);
  assert.equal(await evaluate("document.querySelectorAll('[data-neighbor-dot]').length"), 2);
  pass('both neighbors use ordered endpoints, distinct circle/diamond ghosts and dashed/dotted paths; ghosts do not intercept native selection');

  await evaluate(`${editor}.setValue('selection','selectedIds',${JSON.stringify([performers[0].id, performers[1].id])}); ${editor}.setValue('ui','sectionFilter',${JSON.stringify(project.sections[1].id)})`);
  await wait("document.querySelectorAll('[data-neighbor-dot]').length===2", 'selection and section intersection');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-neighbor-performer]')].map(node=>node.dataset.neighborPerformer)"), [performers[1].id, performers[1].id]);
  await evaluate(`${editor}.setValue('ui','sectionFilter',${JSON.stringify(project.sections[2].id)})`);
  await wait("!document.querySelector('[data-neighbor]') && document.querySelector('.neighbor-legend').textContent.includes('No performers match')", 'empty review scope');
  await revealFieldTool(window,previous);
  await evaluate(`${editor}.setValue('ui','sectionFilter','all'); document.querySelector(${JSON.stringify(previous)}).focus()`);
  await key('Down'); assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Show paths to next set');
  await key('Return'); await wait("document.querySelectorAll('[data-neighbor]').length===1", 'keyboard next off');
  assert.equal(await evaluate("document.querySelector('[data-neighbor]').dataset.neighbor"), 'previous');
  await revealFieldTool(window,next);await evaluate(`document.querySelector(${JSON.stringify(next)}).focus()`);
  await key('Return'); await wait("document.querySelectorAll('[data-neighbor]').length===2", 'keyboard next on');
  pass('selection intersects the section filter and real Tab/Enter input controls the next overlay independently');

  for (const [index, direction, disabled] of [[0, 'next', previous], [2, 'previous', next]]) {
    await evaluate(`${editor}.dispatch('set.select',{index:${index}})`);
    await wait(`document.querySelectorAll('[data-neighbor]').length===1 && document.querySelector('[data-neighbor]').dataset.neighbor==='${direction}'`, 'endpoint neighbor');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(disabled)}).getAttribute('aria-disabled')`), 'true');
  }
  await evaluate(`${editor}.dispatch('set.select',{index:1}); ${editor}.dispatch('playback.scrub',{count:17})`);
  await wait("!document.querySelector('[data-neighbor]') && !document.querySelector('.neighbor-legend')", 'between-set overlays hidden');
  await evaluate(`${editor}.dispatch('set.select',{index:1}); ${editor}.setValue('playback','playing',true)`);
  await wait("!document.querySelector('[data-neighbor]')", 'playing overlays hidden');
  await evaluate(`${editor}.dispatch('set.select',{index:1}); ${editor}.setValue('ui','view','3d')`);
  await wait("!document.querySelector('[data-neighbor]')", '3D overlays hidden');
  await evaluate(`${editor}.setValue('ui','view','2d'); ${editor}.setValue('selection','selectedIds',[])`);
  await wait("document.querySelectorAll('[data-neighbor-dot]').length===8", 'review restored');
  assert.deepEqual((await evaluate(`${state}.project`)).present, before.present);
  assert.equal(await evaluate(`${state}.project.revision`), before.revision);
  assert.deepEqual(await evaluate(`${state}.project.past`), before.past);
  pass('first/last sets have no phantom neighbors; playback, scrubbing and 3D hide review geometry without changing project or history');
  const dragPoint = await center(performers[0].id);
  await input('mousePressed', dragPoint, {button:'left',clickCount:1});
  await input('mouseMoved', {x:dragPoint.x+12,y:dragPoint.y}, {button:'left',buttons:1});
  await wait("!!document.querySelector('.field-stage--moving') && !document.querySelector('[data-neighbor]')", 'drag ghosts hidden');
  // The section legend is in the Inspector header, clear of the field. What does float over the field steps aside:
  // the view and zoom clusters dim and the travel-path legend is not shown.
  assert.ok(await evaluate("(()=>{const a=document.querySelector('.field-legend').getBoundingClientRect(),b=document.querySelector('.field-container').getBoundingClientRect();return a.width>0&&(a.left>=b.right||a.right<=b.left||a.top>=b.bottom||a.bottom<=b.top)})()"), 'section legend sits outside the field');
  await wait("(()=>{const dim=['.canvas-view','.canvas-zoom-row'].map(s=>document.querySelector(s)),legend=document.querySelector('.neighbor-legend');return dim.every(n=>n&&Number(getComputedStyle(n).opacity)===.35)&&(!legend||getComputedStyle(legend).display==='none')})()", 'field overlays step aside while dragging');
  assert.equal(await evaluate(`${state}.project.revision`), before.revision);
  // Return to the anchor before release so this probe makes no production edit.
  await input('mouseMoved', dragPoint, {button:'left',buttons:1});
  await input('mouseReleased', dragPoint, {button:'left',clickCount:1});
  await wait("!!document.querySelector('[data-neighbor]') && ['.canvas-view','.canvas-zoom-row'].every(s=>Number(getComputedStyle(document.querySelector(s)).opacity)===1) && getComputedStyle(document.querySelector('.neighbor-legend')).display!=='none' && Number(getComputedStyle(document.querySelector('.field-legend')).opacity)===1", 'drag review, field overlays and legends restored');
  await evaluate(`${editor}.setValue('selection','selectedIds',[])`);
  pass('uncommitted drag previews suppress ghosts and restore them on release');
  window.webContents.setZoomFactor(1.25); await capture('neighbors-enlarged.png');
  window.webContents.setZoomFactor(1); window.setContentSize(1120, 768); await capture('neighbors-narrow.png');
  for (const selector of [previous, next]) assert.ok(await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight})()`));
  window.setContentSize(1366, 768);
  // Windows can deliver the resize after setContentSize returns. Native input
  // must use geometry from the restored viewport, after the narrow capture.
  await waitViewport(window, { width:1366, height:768, dpr:await evaluate('devicePixelRatio') }, 'neighbor viewport restored before flipped selection');
  await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,fieldOrientation:'audience-top'}); ${editor}.setValue('selection','selectedIds',[])`);
  await wait("!!document.querySelector('[data-field-geometry=audience-top]') && document.querySelectorAll('[data-neighbor]').length===2", 'flipped neighboring sets');
  await click(await center(performers[1].id)); await selected(performers[1].id);
  assert.equal(await evaluate("document.querySelectorAll('[data-neighbor-dot]').length"), 2);
  assert.ok(await evaluate("document.querySelector('[data-neighbor-path]').getScreenCTM().a < 0"));
  assert.deepEqual((await evaluate(`${state}.project`)).present, before.present);
  await capture('neighbors-flipped.png');
  pass('flipped previous/next ghosts and paths turn with the field while native hit testing still selects the canonical performer');
  await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,fieldOrientation:'audience-bottom'})`);
}
const center = id => evaluate(`(() => { const n = [...document.querySelectorAll('.field-performer')].find(n=>n.dataset.performerId===${JSON.stringify(id)}); const p = new DOMPoint(0,0).matrixTransform(n.getScreenCTM()); return {x:p.x,y:p.y}; })()`);
async function selected(id) { await wait(`${state}.selection.selectedIds.length===1 && ${state}.selection.selectedIds[0]===${JSON.stringify(id)}`, 'selected '+id); }
// Defaults from DEFAULT_FIELD_PRESENTATION (src/components/fieldPresentation.ts): 3.5 px dot radius, 11 px labels.
const DOT_RADIUS_PX = 3.5, LABEL_SIZE_PX = 11;
async function assertLabels() {
  await wait(`[...document.querySelectorAll('[data-performer-label]')].every(n=>Math.abs(Number(n.getAttribute('font-size'))*n.getScreenCTM().a-${LABEL_SIZE_PX})<.1)`,'label geometry after viewport update');
  const result = await evaluate(`(() => {
    const box = n => { const r=n.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}; };
    const selectedIds=new Set(${state}.selection.selectedIds);
    // A selected or keyboard-focused performer is always named, even over a neighbor; every other label must be clear.
    const forced=n=>selectedIds.has(n.getAttribute('data-performer-label'))||n.closest('.field-performer').classList.contains('field-performer--focused');
    const nodes=[...document.querySelectorAll('[data-performer-label]')];
    const labels=nodes.map(box), free=nodes.filter(n=>!forced(n)).map(box);
    const labeled=new Set(nodes.map(n=>n.getAttribute('data-performer-label')));
    const dots=[...document.querySelectorAll('.field-dot')].map(box); const viewport=box(document.querySelector('.field-stage__svg'));
    const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    return {count:labels.length, freeCount:free.length, collisions:free.flatMap((a,i)=>free.slice(i+1).filter(b=>overlap(a,b))).length,
      dotCollisions:free.flatMap(a=>dots.filter(b=>overlap(a,b))).length,
      unlabeledSelected:[...selectedIds].filter(id=>document.querySelector('.field-performer[data-performer-id="'+id+'"]')&&!labeled.has(id)),
      clipped:labels.filter(a=>a.left<viewport.left||a.right>viewport.right||a.top<viewport.top||a.bottom>viewport.bottom).length,
      sizes:nodes.map(n=>Number(n.getAttribute('font-size'))*n.getScreenCTM().a),dpr:devicePixelRatio};
  })()`);
  assert.ok(result.count > 0); assert.ok(result.freeCount > 0, JSON.stringify(result.count));
  assert.equal(result.collisions, 0); assert.equal(result.dotCollisions, 0); assert.equal(result.clipped, 0);
  assert.deepEqual(result.unlabeledSelected, []);
  // Fractional desktop scaling can round emulated viewport dimensions subpixel-wise.
  assert.ok(result.sizes.every(size => Math.abs(size-LABEL_SIZE_PX)<.1), JSON.stringify({sizes:result.sizes.slice(0,4),dpr:result.dpr}));
}

app.whenReady().then(async () => {
  try {
    while (!window) await pause(20);
    await wait("!!document.querySelector('.field-performer')", 'renderer');
    window.setContentSize(1366, 768); window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    window.webContents.reload(); await wait(`!!${editor}`, 'store');
    const content = await fs.readFile(fixture, 'utf8');
    await evaluate(`${editor}.dispatch('project.load', {project:JSON.parse(${JSON.stringify(content)})}); ${editor}.setValue('ui','dialog',null)`);
    await wait("document.querySelectorAll('.field-performer').length===500", 'dense block'); await pause(200);
    const baselineViewport = await evaluate("(() => {const field=document.querySelector('.field-stage__svg').getBoundingClientRect(); return {width:innerWidth,height:innerHeight,devicePixelRatio,fieldWidth:field.width,fieldHeight:field.height};})()");
    await capture('dense-1366.png');
    if (baseline) {  app.exit(0); return; }
    const project = await evaluate(state+'.project.present'); const ids = project.performers.map(p=>p.id);
    const positions = project.sets[0].positions; const originalRevision = await evaluate(state+'.project.revision');
    // Native Chromium mouse input, rather than dispatching DOM pointer events.
    const block = ids.filter((_,i)=>i%25<8 && Math.floor(i/25)<8 && i>0);
    for (const id of block) { await click(await center(id)); await selected(id); }
    pass('every distinct center in an 8x8 two-step block is mouse-selectable within the 500-performer cast');
    for (const zoom of [.6, 1, 3]) {
      await evaluate(`${editor}.setValue('ui','zoom',${zoom}); ${editor}.setValue('ui','fitVersion',${zoom})`); await pause(80);
      for (const id of [ids[212],ids[213],ids[237],ids[238]]) { await click(await center(id)); await selected(id); }
      const radius = await evaluate("(() => {const n=document.querySelector('.field-dot');return Number(n.getAttribute('r'))*n.getScreenCTM().a})()");
      assert.ok(Math.abs(radius-DOT_RADIUS_PX)<.01, String(radius)); await assertLabels();
    }
    pass('nearest selection, 7px dots, 11px labels that are collision-free when unselected and a label for every selected performer work at 60%, 100% and 300% zoom');
    await evaluate(`${editor}.setValue('ui','zoom',1); ${editor}.setValue('ui','fitVersion',5)`); await pause(100);
    const tied = await center(ids[0]);
    for (const id of [ids[0],ids.at(-2),ids.at(-1),ids[0]]) { await click(tied); await selected(id); }
    pass('repeated native clicks cycle coincident dots in stable ID order');
    assert.equal(await evaluate(state+'.project.revision'), originalRevision);
    const reordered = { ...project, performers:[...project.performers].reverse() };
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(reordered)}})`); await pause(100);
    const reloadedRevision = await evaluate(state+'.project.revision');
    for (const id of [ids[212],ids[213]]) { await click(await center(id)); await selected(id); }
    await click(await center(ids[0])); await selected(ids[0]);
    pass('reversing the roster preserves nearest and initial tied hit results');
    await window.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:true});
    const touch = await center(ids[212]);
    for (const type of ['touchStart','touchEnd']) await window.webContents.debugger.sendCommand('Input.dispatchTouchEvent',{type,touchPoints:type==='touchStart'?[{x:touch.x,y:touch.y,radiusX:12,radiusY:12}]:[]});
    await selected(ids[212]);
    await window.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:false});
    pass('Chromium touch input selects the nearest dense-field dot');
    await input('mouseMoved',await center(ids[213])); await wait("document.querySelector('.field-readout strong')?.textContent.startsWith('P214 ')", 'nearest hover readout');
    // Label visibility is one choice of three (menu radio items) in the View options menu, chosen here with native keys.
    const labelChoice = async name => {
      const selector = `[role=menu][aria-label="View options"] [aria-label="${name}"]`;
      await revealFieldTool(window,selector); await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
      await key('Return');
      await wait(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-checked')==='true'`, name+' checked');
      assert.deepEqual(await evaluate(`[...document.querySelectorAll('[role=menu][aria-label="View options"] [role=menuitemradio][aria-checked=true]')].map(n=>n.getAttribute('aria-label')).filter(n=>/labels|Selected only/.test(n))`), [name]);
    };
    await evaluate(`${editor}.setValue('selection','selectedIds',[${JSON.stringify(ids[25])}])`);
    await labelChoice('Selected only');
    await wait(`${state}.ui.selectionLabelsOnly && ${state}.ui.showLabels`, 'selected label mode');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-performer-label]')].map(n=>n.getAttribute('data-performer-label'))"),[ids[25]]);
    await labelChoice('Hide labels'); await wait("!document.querySelector('[data-performer-label]')", 'hidden labels');
    await labelChoice('Show labels'); await wait(`${state}.ui.showLabels && !${state}.ui.selectionLabelsOnly`, 'all labels');
    await key('Escape'); await wait(`document.querySelector('[role=menu][aria-label="View options"]').hidden && document.activeElement.getAttribute('aria-label')==='View options'`, 'View options closed with focus on its button');
    await assertLabels(); pass('the keyboard-accessible View options menu chooses all / selected-focus / hidden labels; hover uses the same nearest hit');
    assert.deepEqual(await evaluate(state+'.project.present.sets[0].positions'), positions);
    assert.equal(await evaluate(state+'.project.revision'), reloadedRevision);
    pass('pointer selection, labels and zoom preserve physical coordinates and edit revision');
    await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:2,mobile:false});
    await waitViewport(window, { width:1366, height:768, dpr:2 }, 'dense DPI viewport');
    await assertLabels(); await click(await center(ids[237])); await selected(ids[237]); await capture('dense-dpi2.png');
    await window.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
    window.webContents.setZoomFactor(1.25); await settleNativeViewport(window, 'enlarged label viewport'); await assertLabels(); await capture('enlarged-125.png');
    window.webContents.setZoomFactor(1); window.setContentSize(1024,768); await settleNativeViewport(window, 'narrow label viewport'); await assertLabels(); await capture('narrow-1024.png');
    const narrowViewport = await evaluate('({width:innerWidth,height:innerHeight})');
    pass('labels remain readable without overlaps at 2x DPI, 125% UI zoom and the minimum supported window size');
    await require('./field-display-qa.cjs')({project,editor,state,evaluate,wait,click,key,input,capture,window,pass});
    await checkNeighbors(project);
    await require('./snapping-qa.cjs')({project,editor,state,evaluate,wait,click,key,input,capture,window,pass});
    await require('./nudge-qa.cjs')({project,editor,state,evaluate,wait,click,key,capture,window,pass});
    // #178: header, transport and drawn-field bounds across 900–1920 px windows at 100/125/150% UI scale.
    const breakpoints = await require('./breakpoint-matrix-qa.cjs')({window,evaluate,editor,state,capture,pass});
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: checks, baselineViewport, narrowViewport, breakpoints, platform:process.platform, rendererNodeAccess:await evaluate('typeof window.require') }, null, 2));
     app.exit(0);
  } catch (error) {  console.error(error); if (window && !window.isDestroyed()) await capture('failure.png').catch(() => {}); app.exit(1); }
});
