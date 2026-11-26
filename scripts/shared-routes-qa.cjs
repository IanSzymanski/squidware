'use strict';
const {revealFieldTool}=require('./testing/renderer.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { settleNativeViewport, selectNativeOption } = require('./testing/renderer.cjs');

module.exports = async function ({ project, geometry, editor, state, evaluate, wait, key, capture: screenshot, window, pass, saved, Menu }) {
  const layouts = [], timings = [];
  const control = async selector => { await revealFieldTool(window,selector);
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
  async function open() {  await click('Shared routes'); await wait("!!document.querySelector('.shared-routes-panel')", 'docked route editor'); }
  async function apply(count) { await click('Apply shared route'); await wait(`!${state}.ui.dialog && ${state}.project.present.sharedRoutes?.length===${count}`, 'accepted route'); }

  window.setContentSize(1366, 768); window.webContents.setZoomFactor(1); await settleNativeViewport(window, 'route baseline');
  await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}})`);
  // A new route sits at half the field height (160/3/2 yd); inputs and readouts show yards to at most three decimals.
  const newRouteShown = async () => {
    assert.deepEqual(await evaluate("['Start X','Start Y','Segment end X','Segment end Y'].map(l=>document.querySelector('[aria-label=\"'+l+'\"]').value)"), ['25', '26.667', '75', '26.667']);
    assert.match(await evaluate("document.querySelector('[aria-label=\"Route geometry summary\"]').textContent"), /^Open · 1 segments · 50 yd · /);
  };
  await capture('routes-before.png'); await open(); await newRouteShown();
  assert.equal(await evaluate("document.querySelectorAll('dialog[open], .shared-routes-panel svg').length"), 0);
  assert.equal(await evaluate("document.querySelector('.travel-field').closest('.field-stage__svg')!==null"), true);
  assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')"), 'Cancel shared routes');
  assert.equal(await evaluate(`${editor}.dispatch('history.undo')`), false);
  assert.deepEqual(await evaluate(`${state}.selection.selectedIds`), []);
  await type('Route name', 'S stroke'); await click('Draw shared route stroke');
  const drawing = '.field-stage__svg .travel-field.is-drawing';
  await wait(`!!document.querySelector(${JSON.stringify(drawing)})`, 'shared route stroke mode enabled');
  const physicalPoints = Array.from({ length: 41 }, (_, i) => ({ x: 15 + 70 * i / 40, y: 26 + 10 * Math.sin(i / 40 * Math.PI * 2) }));
  // Project from the committed drawing surface and use the same coordinates
  // for hit testing and input. A point behind a panel cannot start a stroke.
  const projected = await evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(drawing)});
    const matrix = field.getScreenCTM();
    return ${JSON.stringify(physicalPoints)}.map(point => {
      const { x, y } = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return { point: { x, y }, hit: field.contains(document.elementFromPoint(x, y)) };
    });
  })()`);
  assert.ok(projected.every(({ hit }) => hit), `Route stroke must hit the drawing field: ${JSON.stringify(projected.filter(({ hit }) => !hit))}`);
  const points = projected.map(({ point }) => point);
  const pointer = (type, point, button, buttons, clickCount = 0) =>
    window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, button, buttons, clickCount });
  const capturedPoints = "document.querySelector('.travel-field.is-drawing .travel-stroke')?.points.numberOfItems";
  const began = performance.now();
  await pointer('mouseMoved', points[0], 'none', 0);
  await pointer('mousePressed', points[0], 'left', 1, 1);
  await wait(`${capturedPoints} === 1`, 'shared route stroke captured its start');
  for (const [index, point] of points.slice(1).entries()) {
    await pointer('mouseMoved', point, 'left', 1);
    // A debugger reply can precede the renderer update on a busy runner.
    // Observe each rendered point to keep rapid moves from coalescing.
    await wait(`${capturedPoints} === ${index + 2}`, `shared route stroke captured point ${index + 2}`);
  }
  await pointer('mouseReleased', points.at(-1), 'left', 0, 1);
  await wait(`Number(document.querySelector('[aria-label="Route captured points"]')?.textContent.split(' ')[0]) >= ${points.length}
    && !!document.querySelector('button[aria-label="Fit shared route"]:not([aria-disabled="true"]):enabled')`, 'shared route stroke released and ready to fit');
  assert.deepEqual(await present(), project);
  await click('Fit shared route'); await wait("!document.querySelector('[aria-label=\"Route captured points\"]')", 'fitted native stroke');
  timings.push({ captureAndFitMs: performance.now() - began, sourcePoints: 41 });
  await capture('route-fitted-stroke.png'); await apply(1);
  let accepted = await present();
  // Compare native capture against the existing canonical fit, allowing one native pixel.
  const expected = geometry.compileRoute(geometry.fitSharedRoute(accepted.sharedRoutes[0], physicalPoints, .15, true, false, project.field));
  const actual = geometry.compileRoute(accepted.sharedRoutes[0]);
  for (let i = 0; i <= 100; i++) {
    const a = actual.atDistance(actual.length * i / 100), b = expected.atDistance(expected.length * i / 100);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < .35, 'Main-field fit differs from canonical geometry');
  }
  assert.ok(accepted.sharedRoutes[0].segments.length > 4); assert.equal(accepted.sharedRoutes[0].name, 'S stroke');
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

  for (const [theme, width, scale] of [['dark', 1366, 1], ['light', 1366, 1], ['high-contrast', 1366, 1], ['dark', 900, 1.25], ['dark', 1024, 1.5]]) {
    window.setContentSize(width, 768); await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)},uiScale:${scale}})`); await settleNativeViewport(window, 'route layout'); await open();
    await evaluate("document.querySelector('.shared-routes-panel .path-fields').scrollTop=0");
    // The route field's hit area reaches past the 4 yd Fit apron and is clipped by the stage, so measure what is on screen:
    // the stage, the whole playing surface inside it, and a point of that surface the side panel leaves free for input.
    const metrics = await evaluate(`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
      const canvas=document.querySelector('[aria-label="Editable shared route field"]'),matrix=canvas.getScreenCTM(),field=${JSON.stringify({ width: project.field.width, height: project.field.height })};
      const at=(x,y)=>new DOMPoint(x,y).matrixTransform(matrix),corners=[at(0,0),at(field.width,field.height)],free=at(field.width/4,field.height/2);
      const surface={left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
      const hit=s=>{const n=document.querySelector(s),r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));};
      return {viewport:{width:innerWidth,height:innerHeight},field:rect('.field-container'),panel:rect('.shared-routes-panel'),apply:rect('[aria-label="Apply shared route"]'),cancel:rect('[aria-label="Cancel shared routes"]'),canvas:rect('[aria-label="Editable shared route field"]'),stage:rect('.field-stage__svg'),surface,
        freeFieldHit:canvas.contains(document.elementFromPoint(free.x,free.y)),applyHit:hit('[aria-label="Apply shared route"]'),cancelHit:hit('[aria-label="Cancel shared routes"]')}})()`);
    for (const r of [metrics.panel, metrics.apply, metrics.cancel, metrics.stage]) assert.ok(r.left >= 0 && r.right <= metrics.viewport.width + .5 && r.top >= 0 && r.bottom <= metrics.viewport.height + .5, JSON.stringify(metrics));
    assert.ok(metrics.canvas.left <= metrics.stage.left + .5 && metrics.canvas.right >= metrics.stage.right - .5 || metrics.canvas.top <= metrics.stage.top + .5 && metrics.canvas.bottom >= metrics.stage.bottom - .5, JSON.stringify(metrics));
    assert.ok(metrics.surface.left >= metrics.stage.left - .5 && metrics.surface.right <= metrics.stage.right + .5 && metrics.surface.top >= metrics.stage.top - .5 && metrics.surface.bottom <= metrics.stage.bottom + .5, JSON.stringify(metrics));
    assert.deepEqual([metrics.freeFieldHit, metrics.applyHit, metrics.cancelHit], [true, true, true], JSON.stringify(metrics));
    if (width === 1366) assert.ok(metrics.field.height >= 470, JSON.stringify(metrics));
    layouts.push({ theme, width, scale, ...metrics }); await capture(`route-${theme}-${width}-${scale}.png`); await click('Cancel shared routes');
  }
  window.setContentSize(1366, 768); await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,uiScale:1})`); await settleNativeViewport(window, 'delete route');
  await open(); await click('Delete shared route'); assert.deepEqual(await present(), closed); await click('Confirm delete shared route'); await wait(`${state}.project.present.sharedRoutes.length===1 && !${state}.ui.dialog`, 'confirmed deletion');
  menu('Undo drill edit'); await wait(`${state}.project.present.sharedRoutes.length===2`, 'undo deletion'); assert.deepEqual(await present(), closed);
  menu('Save As…'); await wait("document.querySelector('.save-state').textContent==='Project file saved'", 'final native save'); menu('Open project…'); await wait(`${state}.project.past.length===0`, 'final native reopen'); assert.deepEqual(await present(), closed);
  pass('dark/light/high-contrast and enlarged narrow layouts retain controls; deletion confirmation and undo restore geometry; final native save/reopen retains route IDs and seam');
  // The real viewport survives entering a docked editor; pan and flipped keys use its CTM.
  const frames = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await evaluate(`${editor}.setValue('ui','zoom',1.25)`); await open();
  assert.equal(await evaluate(`${state}.ui.zoom`), 1.25);
  const beforePan = await evaluate("document.querySelector('.field-stage__svg').getAttribute('viewBox')");
  const center = await evaluate("(()=>{const r=document.querySelector('.field-stage__svg').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  for (const [type,x] of [['mouseDown',center.x],['mouseMove',center.x+40],['mouseUp',center.x+40]]) {
    window.webContents.sendInputEvent({type,x:Math.round(x),y:Math.round(center.y),button:'middle',modifiers:type==='mouseMove'?['middleButtonDown']:[]}); await frames();
  }
  assert.notEqual(await evaluate("document.querySelector('.field-stage__svg').getAttribute('viewBox')"), beforePan);
  await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,fieldOrientation:'audience-top'})`); await frames();
  await evaluate("document.querySelector('.travel-field').focus()"); await key('Right');
  assert.equal(Number(await evaluate("document.querySelector('[aria-label=\"Start X\"]').value")), Number((closed.sharedRoutes[0].start.x - .1).toFixed(3)));
  await capture('route-flipped-panned.png'); await key('Escape'); await wait(`!${state}.ui.dialog`, 'field Escape cancel');
  assert.deepEqual(await present(), closed);
  await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,fieldOrientation:'audience-bottom'});${editor}.setValue('ui','zoom',1)`); await frames();
  const layoutBefore = await evaluate(`${state}.preferences.value.workspaceLayout`);
  await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,workspaceLayout:{...${state}.preferences.value.workspaceLayout,inspectorCollapsed:true}});${editor}.setValue('ui','focusMode',true);${editor}.dispatch('routes.open')`); await frames();
  assert.equal(await evaluate("!!document.querySelector('.studio--focus')"), false);
  assert.equal(await evaluate("document.querySelector('#workspace-pane-inspector').hidden"), false);
  assert.equal(await evaluate("document.querySelectorAll('.field-readout').length"), 0);
  assert.equal(await evaluate(`${state}.preferences.value.workspaceLayout.inspectorCollapsed`), true);
  await key('Escape'); await frames();
  assert.equal(await evaluate("!!document.querySelector('.studio--focus')"), true);
  await evaluate(`${editor}.setValue('ui','focusMode',false);${editor}.setValue('preferences','value',{...${state}.preferences.value,workspaceLayout:${JSON.stringify(layoutBefore)}})`); await frames();
  for (const action of ["dispatch('playback.scrub',{count:4})", "dispatch('set.select',{index:1})", "dispatch('playback.toggle')"]) {
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(closed)}});${editor}.dispatch('routes.open')`); await frames();
    await type('Route name', 'Discard on navigation');
    await evaluate(`${editor}.${action}`); await wait(`!${state}.ui.dialog`, 'transport discards route draft');
    assert.deepEqual(await present(), closed);
  }
  await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(closed)}})`); await frames();
  pass('current zoom, native pan, flipped keyboard edits, field Escape, collapsed Inspector and focus restoration, transport discard and unobstructed main geometry');
  // Start with the command as setup, then use only native Tab, Space and text input.
  await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}});${editor}.dispatch('routes.open')`); await frames();
  async function tabTo(label) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`document.activeElement?.getAttribute('aria-label')===${JSON.stringify(label)}`)) return;
      await key('Tab');
    }
    throw Error('Keyboard could not reach '+label);
  }
  async function enter(label, value) {
    await tabTo(label); await key('A',[process.platform==='darwin'?'meta':'control']);
    await window.webContents.debugger.sendCommand('Input.insertText',{text:String(value)}); await key('Tab');
  }
  await enter('Route name','Keyboard route');
  await tabTo('Place shared route anchors'); await key('Space');
  await wait("!!document.querySelector('[aria-label=\"Route captured points\"]')", 'keyboard anchors enabled');
  for (const [x,y] of [[20,15],[50,35],[80,15]]) {
    await enter('Route anchor X',x); await enter('Route anchor Y',y);
    await tabTo('Add numeric route anchor'); await key('Space');
  }
  await tabTo('Fit shared route'); await key('Space');
  await wait("!document.querySelector('[aria-label=\"Route captured points\"]')", 'keyboard fit');
  await tabTo('Apply shared route'); await key('Space'); await wait(`!${state}.ui.dialog`, 'keyboard apply');
  const keyboardProject = await present();
  assert.equal(keyboardProject.sharedRoutes[0].name, 'Keyboard route');
  assert.deepEqual(keyboardProject.sharedRoutes[0].start, {x:20,y:15});
  assert.deepEqual(keyboardProject.sharedRoutes[0].segments.map(s=>s.to), [{x:50,y:35},{x:80,y:15}]);
  assert.deepEqual(keyboardProject.sets, project.sets); assert.deepEqual(keyboardProject.moves, project.moves);
  assert.equal(await evaluate(`${state}.project.past.length`), 1);
  menu('Undo drill edit'); await wait(`!${state}.project.present.sharedRoutes`, 'undo keyboard route');
  assert.deepEqual(await present(), project);
  pass('native keyboard-only route naming, numeric anchors, Fit and Apply complete the primary task as one undo');
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
