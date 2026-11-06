'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { settleNativeViewport, selectNativeOption } = require('./testing/renderer.cjs');

module.exports = async function ({ project, editor, state, evaluate, wait, key, capture: screenshot, window, pass, saved, Menu }) {
  const layouts = [], timings = [];
  const control = async selector => {
    await evaluate('document.activeElement?.blur()');
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
    await wait(`new Promise(resolve=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||n.getAttribute('aria-disabled')==='true')return resolve(false);n.scrollIntoView({block:'nearest'});requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=n.getBoundingClientRect();window.__routePoint={x:r.x+r.width/2,y:r.y+r.height/2};resolve(n.contains(document.elementFromPoint(window.__routePoint.x,window.__routePoint.y)));}));})`, 'actionable ' + selector);
    await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    const point = await evaluate('window.__routePoint');
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
  };
  const click = label => control(`[aria-label=${JSON.stringify(label)}]`);
  async function type(label, value) {
    await evaluate(`(()=>{const n=document.querySelector('[aria-label=${JSON.stringify(label)}]');n.scrollIntoView({block:'nearest'});n.focus();n.select()})()`);
    await window.webContents.debugger.sendCommand('Input.insertText', { text: String(value) });
    await key('Tab');
    await wait(`document.querySelector('[aria-label=${JSON.stringify(label)}]')?.value===${JSON.stringify(String(value))}`, 'input ' + label);
  }
  const capture = async name => {
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
    await evaluate('document.activeElement?.blur()'); await wait("!document.querySelector('.tooltip-panel')", 'dismissed help'); await screenshot(name);
  };
  const menu = label => {
    function find(m) { for (const item of m?.items ?? []) { if (item.label === label) return item; const child = find(item.submenu); if (child) return child; } }
    const item = find(Menu.getApplicationMenu()); assert.ok(item?.click); item.click(item, window, {});
  };
  const present = () => evaluate(`${state}.project.present`);
  // Small or enlarged windows tuck the Inspector (#178); open it over the field, as a user would, before using its launchers.
  const showInspector = async () => { if (await evaluate("!!document.querySelector('#workspace-pane-inspector')?.hidden")) { await click('Show Inspector'); await wait("!!document.querySelector('#workspace-pane-inspector.workspace-pane--overlay:not([hidden])')", 'Inspector overlay'); } };
  async function open() { await showInspector(); await click('Shared routes'); await wait("!!document.querySelector('.shared-routes-panel')", 'route dialog'); }
  async function apply(count) { await click('Apply shared route'); await wait(`!${state}.ui.dialog && ${state}.project.present.sharedRoutes?.length===${count}`, 'accepted route'); }

  window.setContentSize(1366, 768); window.webContents.setZoomFactor(1); await settleNativeViewport(window, 'route baseline');
  await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}})`);
  // A new route sits at half the field height (160/3/2 yd); inputs and readouts show yards to at most three decimals.
  const newRouteShown = async () => {
    assert.deepEqual(await evaluate("['Start X','Start Y','Segment end X','Segment end Y'].map(l=>document.querySelector('[aria-label=\"'+l+'\"]').value)"), ['25', '26.667', '75', '26.667']);
    assert.match(await evaluate("document.querySelector('[aria-label=\"Route geometry summary\"]').textContent"), /^Open · 1 segments · 50 yd · /);
  };
  await capture('routes-before.png'); await open(); await newRouteShown();
  assert.deepEqual(await evaluate(`${state}.selection.selectedIds`), []);
  await type('Route name', 'S stroke'); await click('Draw shared route stroke');
  await evaluate("document.querySelector('[aria-label=\"Editable shared route field\"]').scrollIntoView({block:'center'})");
  const matrix = await evaluate("(()=>{const m=document.querySelector('[aria-label=\"Editable shared route field\"]').getScreenCTM();return {a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f}})()");
  const screen = p => ({ x: matrix.a * p.x + matrix.c * p.y + matrix.e, y: matrix.b * p.x + matrix.d * p.y + matrix.f });
  const points = Array.from({ length: 41 }, (_, i) => screen({ x: 15 + 70 * i / 40, y: 26 + 10 * Math.sin(i / 40 * Math.PI * 2) }));
  const began = performance.now();
  for (let i = 0; i < points.length; i++) {
    if (!i) { await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points[i] }); await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...points[i], button: 'left', buttons: 1, clickCount: 1 }); }
    else await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points[i], button: 'left', buttons: 1 });
  }
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...points.at(-1), button: 'left', buttons: 0, clickCount: 1 });
  await wait("Number(document.querySelector('[aria-label=\"Route captured points\"]').textContent.split(' ')[0])>30", 'native captured stroke');
  assert.deepEqual(await present(), project);
  await click('Fit shared route'); await wait("!document.querySelector('[aria-label=\"Route captured points\"]')", 'fitted native stroke');
  timings.push({ captureAndFitMs: performance.now() - began, sourcePoints: 41 });
  await capture('route-fitted-stroke.png'); await apply(1);
  let accepted = await present(); assert.ok(accepted.sharedRoutes[0].segments.length > 4); assert.equal(accepted.sharedRoutes[0].name, 'S stroke');
  assert.deepEqual(accepted.sets, project.sets); assert.deepEqual(accepted.moves, project.moves); assert.equal(await evaluate(`${state}.project.past.length`), 1);
  menu('Undo drill edit'); await wait(`!${state}.project.present.sharedRoutes`, 'undo stroke'); menu('Redo drill edit'); await wait(`${state}.project.present.sharedRoutes?.length===1`, 'redo stroke'); assert.deepEqual(await present(), accepted);
  menu('Save As…'); await wait("document.querySelector('.save-state').textContent==='Project file saved'", 'native route save');
  assert.equal(JSON.parse(await fs.readFile(saved, 'utf8')).schemaVersion, 8);
  menu('Open project…'); await wait(`${state}.project.past.length===0`, 'native route reopen'); assert.deepEqual(await present(), accepted);
  pass('native freehand S capture and fit, single undo/redo, unselected cast isolation and native v8 save/reopen');

  await open(); await evaluate("document.querySelector('[aria-label=\"Editable shared route field\"]').scrollIntoView({block:'center'});document.querySelector('[aria-label=\"Editable shared route field\"]').focus()");
  const start = accepted.sharedRoutes[0].start;
  await key('Right'); await wait(`Number(document.querySelector('[aria-label="Start X"]').value)>${start.x}`, 'keyboard route start');
  assert.deepEqual(await present(), accepted);
  await type('Control 1 X', 35);
  await evaluate("document.querySelector('[aria-label=\"Editable shared route field\"]').scrollIntoView({block:'center'})");
  const beforeDrag = await evaluate("Number(document.querySelector('[aria-label=\"Control 1 X\"]').value)");
  const handle = await evaluate("(()=>{const n=document.querySelector('[data-travel-handle$=\"-1\"]');const p=new DOMPoint(0,0).matrixTransform(n.getScreenCTM());return {x:p.x,y:p.y}})()");
  for (const event of [{ type: 'mouseMoved', ...handle }, { type: 'mousePressed', ...handle, button: 'left', buttons: 1, clickCount: 1 }, { type: 'mouseMoved', x: handle.x + 15, y: handle.y, button: 'left', buttons: 1 }]) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', event);
  await wait(`Number(document.querySelector('[aria-label="Control 1 X"]').value)!==${beforeDrag}`, 'native route handle moved');
  await key('Escape'); await wait(`Number(document.querySelector('[aria-label="Control 1 X"]').value)===${beforeDrag}`, 'Escape restores route handle');
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...handle, button: 'left', buttons: 0, clickCount: 1 });
  await type('Control 1 X', 35); await click('Cancel shared routes'); await wait(`!${state}.ui.dialog`, 'numeric cancel'); assert.deepEqual(await present(), accepted);
  await open(); await type('Control 1 X', 35); await apply(1);
  accepted = await present(); assert.equal(accepted.sharedRoutes[0].segments[0].control1.x, 35);
  await open(); await click('Reverse shared route'); await apply(1);
  const reversed = await present(); assert.deepEqual(reversed.sharedRoutes[0].start, accepted.sharedRoutes[0].segments.at(-1).to);
  menu('Undo drill edit'); await wait(`${state}.project.future.length===1`, 'undo route reverse'); assert.deepEqual(await present(), accepted);
  pass('native keyboard and control drag previews, Escape rollback, numeric cancel/apply, and explicit direction reversal');

  await open(); await click('New shared route'); await newRouteShown(); await type('Route name', 'Closed outline'); await click('Closed shared route'); await click('Place shared route anchors');
  for (const [x, y] of [[20, 15], [80, 15], [80, 40], [20, 40]]) { await type('Route anchor X', x); await type('Route anchor Y', y); await click('Add numeric route anchor'); }
  await click('Fit shared route'); await wait("document.querySelector('[aria-label=\"Route geometry summary\"]').textContent.startsWith('Closed')", 'closed numeric fit');
  await click('Split route segment'); await wait("document.querySelector('[aria-label=\"Route segment\"]').options.length===5", 'split exact route');
  await click('Reverse shared route'); await type('Seam X', 21);
  await capture('route-closed-seam.png'); await apply(2);
  const closed = await present(); assert.equal(closed.sharedRoutes[1].closed, true); assert.deepEqual(closed.sharedRoutes[1].segments.at(-1).to, closed.sharedRoutes[1].start); assert.equal(closed.sharedRoutes[1].start.x, 21);
  assert.deepEqual(closed.sets, project.sets); assert.deepEqual(closed.moves, project.moves);
  await open(); await selectNativeOption(window, '[aria-label="Saved route"]', closed.sharedRoutes[1].id);
  await type('Route name', 'S stroke'); await wait("document.querySelector('[role=alert]')?.textContent.includes('unique')", 'duplicate route name');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply shared route\"]').getAttribute('aria-disabled')"), 'true'); await capture('route-invalid-name.png');
  await click('Cancel shared routes'); assert.deepEqual(await present(), closed);
  pass('closed numeric anchors add a seam, split/reverse/seam edits preserve closure, duplicate names block Apply, cancel preserves both routes');

  for (const [theme, width, scale] of [['dark', 1366, 1], ['light', 1366, 1], ['high-contrast', 1366, 1], ['dark', 900, 1.25]]) {
    window.setContentSize(width, 768); await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)},uiScale:${scale}})`); await settleNativeViewport(window, 'route layout'); await open();
    await evaluate("document.querySelector('[aria-label=\"Editable shared route field\"]').scrollIntoView({block:'center'})");
    const metrics = await evaluate("(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};return {viewport:{width:innerWidth,height:innerHeight},field:rect('.field-container'),modal:rect('.shared-routes-panel'),apply:rect('[aria-label=\"Apply shared route\"]'),cancel:rect('[aria-label=\"Cancel shared routes\"]'),canvas:rect('[aria-label=\"Editable shared route field\"]')}})()");
    for (const r of [metrics.modal, metrics.apply, metrics.cancel, metrics.canvas]) assert.ok(r.left >= 0 && r.right <= metrics.viewport.width + .5 && r.top >= 0 && r.bottom <= metrics.viewport.height + .5, JSON.stringify(metrics));
    if (width === 1366) assert.ok(metrics.field.height >= 470, JSON.stringify(metrics));
    layouts.push({ theme, width, scale, ...metrics }); await capture(`route-${theme}-${width}-${scale}.png`); await click('Cancel shared routes');
  }
  window.setContentSize(1366, 768); await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,uiScale:1})`); await settleNativeViewport(window, 'delete route');
  await open(); await click('Delete shared route'); assert.deepEqual(await present(), closed); await click('Confirm delete shared route'); await wait(`${state}.project.present.sharedRoutes.length===1 && !${state}.ui.dialog`, 'confirmed deletion');
  menu('Undo drill edit'); await wait(`${state}.project.present.sharedRoutes.length===2`, 'undo deletion'); assert.deepEqual(await present(), closed);
  menu('Save As…'); await wait("document.querySelector('.save-state').textContent==='Project file saved'", 'final native save'); menu('Open project…'); await wait(`${state}.project.past.length===0`, 'final native reopen'); assert.deepEqual(await present(), closed);
  pass('dark/light/high-contrast and enlarged narrow layouts retain controls; deletion confirmation and undo restore geometry; final native save/reopen retains route IDs and seam');
  for (const count of [2, 64, 500]) {
    const performers = Array.from({ length: count }, (_, i) => ({ id: `route-member-${i}`, label: `P${i + 1}`, name: '', sectionId: project.sections[0].id }));
    const positions = Object.fromEntries(performers.map((p, i) => [p.id, { x: 5 + 90 * (i % 25) / 24, y: 5 + 40 * Math.floor(i / 25) / 19 }]));
    const fixture = { ...project, selectionGroups: [], performers, sharedRoutes: closed.sharedRoutes, sets: project.sets.map(s => ({ ...s, positions })), moves: project.moves.map(m => ({ ...m, paths: {} })) };
    const readyMs = await evaluate(`new Promise(resolve=>{${editor}.dispatch('project.load',{project:${JSON.stringify(fixture)}});const start=performance.now();${editor}.dispatch('routes.open');requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-start)));})`);
    await wait("!!document.querySelector('[aria-label=\"Editable shared route field\"]')", 'bounded route preview');
    timings.push({ performers: count, previewReadyMs: readyMs }); await click('Cancel shared routes');
  }
  pass('2, 64 and 500-performer route previews report readiness while route geometry remains independent of cast size');
  return { layouts, timings };
};
