'use strict';
const {revealFieldTool}=require('./testing/renderer.cjs');
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, waitFor, settleNativeViewport, selectNativeOption } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--path-authoring-manifest=')).slice('--path-authoring-manifest='.length));
const { root, output, profile, bundle } = manifest, { fixture, parseProject, sampleProject, sampleMovement, createPerformanceFixture, formatYards } = require(bundle);
app.disableHardwareAcceleration(); app.setPath('userData', profile);
const show = BrowserWindow.prototype.show; BrowserWindow.prototype.show = function () {};
const file = path.join(output, 'drawn.squid');
dialog.showSaveDialog = async () => ({ filePath: file }); dialog.showOpenDialog = async () => ({ filePaths: [file] }); dialog.showMessageBox = async () => ({ response: 1 });
let window, failure; const checks = [], viewports = [], timings = [];
app.on('browser-window-created', (_e, w) => { window = w; w.webContents.setBackgroundThrottling(false); w.webContents.on('render-process-gone', (_e, d) => failure = Error(d.reason)); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = s => window.webContents.executeJavaScript(s), editor = 'window.__drawQA.editor', state = editor + '.getState()';
const wait = (s, label) => waitFor(() => evaluate(s), label, { timeoutMs: 25000, failure: () => failure });
const frames = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const pass = s => { checks.push(s); console.log('PASS ' + s); };
function instrument() {
  const qa = window.__drawQA = { editor: null, errors: [] };
  window.addEventListener('error', e => qa.errors.push(e.message)); window.addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; }, onCommitFiberRoot(_id, r) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) qa.editor = v; visit(f.child); visit(f.sibling); } visit(r.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
const button = s => `[aria-label=${JSON.stringify(s)}]`;
async function click(selector) { await revealFieldTool(window,selector);
  const p = await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error('Missing '+${JSON.stringify(selector)});n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await mouse('mousePressed', p); await mouse('mouseReleased', p); await frames();
}
async function mouse(type, p) {
  const types = { mousePressed: 'mouseDown', mouseReleased: 'mouseUp', mouseMoved: 'mouseMove' };
  window.webContents.sendInputEvent({ type: types[type], x: Math.round(p.x), y: Math.round(p.y), button: 'left', ...(type === 'mouseMoved' ? { modifiers: ['leftButtonDown'] } : { clickCount: 1 }) });
  await frames();
}
async function field(p) { return evaluate(`(()=>{const s=document.querySelector('.travel-field');s.scrollIntoView({block:'center'});const p=new DOMPoint(${p.x},${p.y}).matrixTransform(s.getScreenCTM());return {x:p.x,y:p.y};})()`); }
async function type(name, value) {
  await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(button(name))});n.focus();n.select();})()`);
  await window.webContents.debugger.sendCommand('Input.insertText', { text: String(value) }); await frames();
}
async function press(value) { await key(window, value); await frames(); }
async function capture(name) {
  await evaluate(`${editor}.setValue('ui','toast',''); document.activeElement?.blur()`);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await capturePage(window, output, name);
  viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container')?.getBoundingClientRect().height,dialogHeight:document.querySelector('dialog[open]')?.getBoundingClientRect().height})`));
}
async function load(p, id = 'a') {
  await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(p)}});${editor}.dispatch('workspace.show',{workspace:'design'});${editor}.dispatch('set.select',{index:1});${editor}.setValue('selection','selectedIds',[${JSON.stringify(id)}])`); await frames();
}
const present = () => evaluate(state + '.project.present');
app.whenReady().then(async () => { try {
  await waitFor(() => !!window, 'window'); await wait("!!document.querySelector('.set-card')", 'renderer');
  window.setContentSize(1366,768); window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Page.enable');
  await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
  window.webContents.reload(); await wait(`!!${editor}&&${state}.preferences.status==='saved'`, 'store');
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)", 'recovery');
  const p = fixture(); await load(p); await capture('authoring-before.png');
  assert.deepEqual([viewports.at(-1).width,viewports.at(-1).height],[1366,768]); assert.ok(viewports.at(-1).fieldHeight >= 470);
  await evaluate(`${editor}.dispatch('path.open')`); await frames();
  await selectNativeOption(window, button('Travel geometry'), 'cubic');
  for (const [n,v] of [['Control 1 X',10],['Control 1 Y',30],['Control 2 X',30],['Control 2 Y',30]]) await type(n,v);
  if (manifest.baseline) { await capture('authoring-before-dialog.png'); await fs.writeFile(path.join(output,'results.json'),JSON.stringify({baseline:true,viewports},null,2)); app.exit(0); return; }
  BrowserWindow.prototype.show=show; window.show(); window.focus(); await settleNativeViewport(window,'authoring');
  const initial = await evaluate("document.querySelector('[aria-label=\"Control 1 X\"]').value");
  let start = await field({x:10,y:30}), end = await field({x:16,y:25});
  await evaluate("window.__drawQA.pointer=[];window.__drawQA.field=document.querySelector('.travel-field');for(const t of ['pointerdown','pointermove','pointercancel','gotpointercapture','lostpointercapture'])window.__drawQA.field.addEventListener(t,e=>window.__drawQA.pointer.push({type:t,buttons:e.buttons,x:e.clientX,y:e.clientY,pointer:e.pointerId,connected:e.target.isConnected,active:document.activeElement?.tagName}))");
  await mouse('mousePressed',start); await frames(); await mouse('mouseMoved',end); await frames();
  const dragValue=Number(await evaluate("document.querySelector('[aria-label=\"Control 1 X\"]').value"));
  if(Math.abs(dragValue-16)>=.25)console.log('Native drag failure',JSON.stringify({value:dragValue,start,end,events:await evaluate('window.__drawQA.pointer'),sameField:await evaluate("window.__drawQA.field===document.querySelector('.travel-field')")}));
  assert.ok(Math.abs(Number(await evaluate("document.querySelector('[aria-label=\"Control 1 X\"]').value"))-16)<.25);
  await press('Escape'); await mouse('mouseReleased',end);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Control 1 X\"]').value"),initial);
  assert.equal(await evaluate(state+'.ui.dialog'),'path');
  start=await field({x:10,y:30});end=await field({x:16,y:25});
  await mouse('mousePressed',start);await mouse('mouseMoved',end);await mouse('mouseReleased',end);await frames();
  // Inputs show at most three decimals; the proposed path keeps the exact dragged coordinates.
  const shown = () => evaluate("[...document.querySelectorAll('.path-controls input')].map(n=>n.value)");
  const proposed = async () => (await evaluate("document.querySelector('.travel-field .path-proposed').getAttribute('d')")).split(' ').slice(4,8);
  const numeric = await shown(), exact = await proposed();
  assert.ok(Math.abs(+exact[0]-16)<.25);assert.ok(Math.abs(+exact[1]-25)<.25);assert.deepEqual(numeric,exact.map(v=>formatYards(+v)));
  await evaluate("document.querySelector('.travel-field').focus()");await press('Right');
  const nudged = await proposed();
  assert.ok(Math.abs(+nudged[0]-(+exact[0]+.1))<1e-8);assert.deepEqual(nudged.slice(1),exact.slice(1));
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Control 1 X\"]').value"),formatYards(+nudged[0]));
  await selectNativeOption(window,button('Path field zoom'),'4');await capture('authoring-handles-zoom.png');
  await selectNativeOption(window,button('Path field zoom'),'1');
  for (const [i,n] of ['Control 1 X','Control 1 Y','Control 2 X','Control 2 Y'].entries()) await type(n,exact[i]);
  const d=await evaluate("document.querySelector('.travel-field .path-proposed').getAttribute('d')");
  assert.equal(d,`M 10 10 C ${exact.join(' ')} 30 20`);assert.deepEqual(await shown(),exact);
  assert.deepEqual(await present(),p);assert.equal(await evaluate(state+'.project.past.length'),0);
  await capture('authoring-handles-dark.png'); await press('Escape');assert.deepEqual(await present(),p);
  pass('native handle drag, drag Escape rollback, keyboard nudge, numeric equivalence, zoom and dialog cancel');

  // Drawing one scheduled interval must preserve the leading/trailing holds.
  const scheduled=structuredClone(p);scheduled.moves[0].paths={a:{segments:[{id:'lead',kind:'hold',startCount:0,endCount:4},{id:'travel',kind:'line',startCount:4,endCount:12},{id:'tail',kind:'hold',startCount:12,endCount:16}]}};
  await load(scheduled);await evaluate(`${editor}.dispatch('path.draw-open')`);await frames();
  await click(button('Place path anchors'));
  for (const [i,point] of [{x:15,y:25},{x:25,y:5}].entries()) { await click(button('Add numeric path anchor'));await type(`Draw anchor ${i+1} X`,point.x);await type(`Draw anchor ${i+1} Y`,point.y); }
  await click(button('Fit drawn path'));await frames();
  assert.equal(await evaluate("document.querySelectorAll('[data-schedule-row]').length"),5);
  assert.deepEqual(await present(),scheduled);assert.equal(await evaluate(state+'.project.past.length'),0);
  await evaluate("document.querySelector('.travel-field').scrollIntoView({block:'center'})");await capture('authoring-drawn-preview.png');
  await click(button('Apply movement timing'));await wait(`${state}.ui.dialog===null`,'apply');
  const saved=await present(), segments=saved.moves[0].paths.a.segments;
  assert.deepEqual(segments[0],scheduled.moves[0].paths.a.segments[0]);assert.deepEqual(segments.at(-1),scheduled.moves[0].paths.a.segments.at(-1));
  assert.equal(segments[1].startCount,4);assert.equal(segments.at(-2).endCount,12);assert.deepEqual(saved.sets,scheduled.sets);
  assert.equal(await evaluate(state+'.project.past.length'),1);
  await evaluate(`${editor}.dispatch('history.undo')`);assert.deepEqual(await present(),scheduled);
  await evaluate(`${editor}.dispatch('history.redo')`);assert.deepEqual(await present(),saved);
  await evaluate(`${editor}.dispatch('file.save')`);await wait(`${state}.fileSession.savedRevision===${state}.project.revision`,'save');
  assert.deepEqual(parseProject(await fs.readFile(file,'utf8')),saved);
  await evaluate(`${editor}.dispatch('file.open')`);await wait(`${state}.project.present.moves[0].paths.a.segments.length===5&&${state}.project.past.length===0`,'reopen');
  assert.deepEqual(await present(),saved);
  pass('numeric S route replaces one interval, holds/endpoints stay fixed, one undo/redo, native save/reopen');
  await evaluate(`${editor}.dispatch('set.select',{index:1});${editor}.setValue('selection','selectedIds',['a']);${editor}.dispatch('schedule.open')`);await wait(`${state}.ui.dialog==='movement-schedule'`,'reopened schedule');await frames();
  const ticks=await evaluate("[...document.querySelectorAll('[data-travel-count]')].map(n=>({count:+n.dataset.travelCount,transform:n.getAttribute('transform')}))");
  assert.ok(ticks.length>=17);
  for (const tick of ticks) { const expected=sampleMovement(saved.sets[0].positions.a,saved.sets[1].positions.a,saved.moves[0].paths.a,tick.count,16,saved.moves[0].transition); assert.equal(tick.transform,`translate(${expected.x} ${expected.y})`); }
  await press('Escape');
  for (const count of [0,2,4,7,10,12,14,16]) {
    await evaluate(`${editor}.dispatch('playback.scrub',{count:${count}})`);await frames();
    const expected=sampleProject(saved,count).positions.a;
    assert.equal(await evaluate("document.querySelector('.field-stage__svg [data-performer-id=a]').getAttribute('transform')"),`translate(${expected.x} ${expected.y})`);
  }
  pass('held and fractional count ticks use shared playback samples; applied field scrub reproduces the fitted path');

  await load(p);await evaluate(`${editor}.dispatch('path.draw-open')`);await frames();
  // Native freehand capture in reverse, explicit reversal, then fit.
  const points=[{x:30,y:20},{x:27,y:12},{x:22,y:8},{x:18,y:24},{x:13,y:22},{x:10,y:10}];
  await mouse('mousePressed',await field(points[0]));for(const point of points.slice(1))await mouse('mouseMoved',await field(point));await mouse('mouseReleased',await field(points.at(-1)));await frames();
  await click(button('Fit drawn path'));assert.match(await evaluate("document.querySelector('.draw-travel [role=alert]').textContent"),/fixed interval/);
  await capture('authoring-attachment-error.png');await click(button('Reverse captured stroke'));await click(button('Fit drawn path'));await frames();
  assert.ok(await evaluate("document.querySelectorAll('[data-schedule-row]').length")>1);
  await press('Escape');assert.deepEqual(await present(),p);assert.equal(await evaluate(state+'.project.past.length'),0);
  pass('native freehand capture, attachment rejection, explicit capture reversal and canceled fit');

  const zoomSamples=[];
  for(const zoom of [1,2]) {
    await load(p);await evaluate(`${editor}.dispatch('path.draw-open')`);await frames();await selectNativeOption(window,button('Path field zoom'),String(zoom));
    const forward=[...points].reverse();await mouse('mousePressed',await field(forward[0]));for(const point of forward.slice(1))await mouse('mouseMoved',await field(point));await mouse('mouseReleased',await field(forward.at(-1)));
    await click(button('Fit drawn path'));await frames();
    assert.ok(await evaluate("document.querySelectorAll('[data-schedule-row]').length")>1);
    zoomSamples.push(await evaluate("[...document.querySelectorAll('.travel-field .path-proposed')].flatMap(p=>Array.from({length:21},(_,i)=>{const q=p.getPointAtLength(p.getTotalLength()*i/20);return {x:q.x,y:q.y}}))"));
    await press('Escape');
  }
  function distanceToSegments(p,ps){return Math.min(...ps.slice(1).map((b,i)=>{const a=ps[i],x=b.x-a.x,y=b.y-a.y,u=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1)));return Math.hypot(p.x-a.x-u*x,p.y-a.y-u*y)}));}
  for(const [i,samples] of zoomSamples.entries())for(const point of samples)assert.ok(distanceToSegments(point,zoomSamples[1-i])<.35,'Zoom-equivalent capture deviated more than tolerance plus one native pixel');
  await load(p);await evaluate(`${editor}.dispatch('path.draw-open')`);await frames();await evaluate("document.querySelector('.travel-field').focus()");await press('Escape');
  assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Cancel drawn stroke\"]')"),false);assert.equal(await evaluate(state+'.ui.dialog'),'path-draw');await press('Escape');assert.equal(await evaluate(state+'.ui.dialog'),null);
  pass('native field-space strokes at 1x/2x agree within 0.35 yd including pixel quantization; Escape exits capture then dialog');

  for(const [theme,width,scale] of [['light',1366,1],['high-contrast',1366,1],['dark',1024,1.5]]) {
    await load(p);await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)},uiScale:${scale}})`);window.setContentSize(width,768);await settleNativeViewport(window,'authoring theme');
    await evaluate(`${editor}.dispatch('path.draw-open')`);await frames();await click(button('Place path anchors'));await capture(`authoring-${theme}-${width}.png`);await evaluate("document.querySelector('.travel-field').scrollIntoView({block:'center'})");await capture(`authoring-field-${theme}-${width}.png`);
    for(const name of ['Fit drawn path','Cancel drawn stroke','Apply movement timing']) { await evaluate(`document.querySelector(${JSON.stringify(button(name))}).scrollIntoView({block:'nearest'})`); assert.ok(await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(button(name))}).getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<=innerHeight})()`)); }
    await press('Escape');
  }
  pass('dark/light/high-contrast and 150% UI scale preserve reachable capture and Apply/Cancel controls');
  window.setContentSize(1366,768);await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:'dark',uiScale:1})`);await settleNativeViewport(window,'authoring maximum');
  for(const count of [2,64,500]) {
    const maximum=createPerformanceFixture(count===500?'maximum':'demo');maximum.performers=maximum.performers.slice(0,count);maximum.sets=maximum.sets.slice(0,2).map(s=>({...s,positions:Object.fromEntries(maximum.performers.map(p=>[p.id,s.positions[p.id]]))}));maximum.moves=maximum.moves.slice(0,1);const id=maximum.performers[0].id;await load(maximum,id);
    const started=performance.now();await evaluate(`${editor}.dispatch('schedule.open')`);await frames();
    timings.push({performers:count,openAndTwoFramesMs:performance.now()-started,handles:await evaluate("document.querySelectorAll('[data-travel-handle]').length"),ticks:await evaluate("document.querySelectorAll('[data-travel-count]').length")});
    await selectNativeOption(window,button('Interval 1 movement'),'cubic');await frames();
    const changedAt=performance.now();await type('Interval 1 Control 1 Y',20);timings.at(-1).numericEditAndTwoFramesMs=performance.now()-changedAt;assert.equal(await evaluate("document.querySelectorAll('[data-travel-handle]').length"),2);
    await press('Escape');
  }
  pass('2/64/500 performer render cost recorded with bounded selected-path ticks and handles');
  assert.deepEqual(await evaluate('window.__drawQA.errors'),[]);
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,timings,source:manifest.source,scope:manifest.scope},null,2)); app.exit(0);
} catch(e) {console.error(e.stack);try{await capture('authoring-failed.png');}catch{}app.exit(1);} });
