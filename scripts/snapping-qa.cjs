'use strict';
const assert = require('node:assert/strict');
const { settleNativeViewport } = require('./testing/renderer.cjs');

// Field QA owns placement input and previews. Schema/native suites own file validation.
module.exports = async function ({ project, editor, state, evaluate, wait, click, key, input, capture, window, pass }) {
  window.setContentSize(1366, 768); window.webContents.setZoomFactor(1);
  await settleNativeViewport(window, 'snapping baseline');
  const people = project.performers.slice(0, 3); const ids = people.map(p => p.id);
  const positions = { [ids[0]]: { x: 40.1, y: 20.2 }, [ids[1]]: { x: 42.7, y: 21.1 }, [ids[2]]: { x: 70, y: 30 } };
  const fixture = { ...project, title: 'Grid and snapping QA', performers: people, sets: project.sets.map(set => ({ ...set, positions })), moves: project.moves.map(move => ({ ...move, paths: {} })) };
  await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(fixture)}}); ${editor}.setValue('ui','snap',true); ${editor}.setValue('ui','showGrid',true); ${editor}.setValue('ui','zoom',1); ${editor}.setValue('ui','fitVersion',99); ${editor}.setValue('ui','showPaths',false); ${editor}.setValue('ui','showNextPaths',false); ${editor}.setValue('selection','selectedIds',${JSON.stringify(ids.slice(0,2))})`);
  await wait("document.querySelectorAll('.field-performer').length===3", 'placement fixture');
  assert.ok(await evaluate("(() => {const a=document.querySelector('.field-snap-status').getBoundingClientRect();return ['.field-topline','.field-keyboard-help'].every(selector=>{const b=document.querySelector(selector).getBoundingClientRect();return a.bottom<=b.top || b.bottom<=a.top})})()"), 'snap status must not overlap field information');
  const before = await evaluate(`${state}.project`);
  await capture('snapping-before.png');
  const control = async selector => { const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); await click(point); };
  const configure = async (steps, subdivision, group, target = 'grid') => {
    await control('[aria-label="Grid and snapping"]'); await wait("document.querySelector('.modal h2')?.textContent==='Grid and snapping'", 'grid dialog');
    // Select change events set up native dropdown values; real Tab/Enter below verify access and commit.
    await evaluate(`(() => {const values=${JSON.stringify([steps,subdivision,target,group])};[...document.querySelectorAll('.modal select')].forEach((n,i)=>{n.value=values[i];n.dispatchEvent(new Event('change',{bubbles:true}));});})()`);
  };
  await configure(6, 2, 'individual');
  await evaluate("document.querySelector('.modal select').focus()");
  for (let i=0; i<4; i++) await key('Tab');
  assert.equal(await evaluate('document.activeElement.textContent'), 'Cancel'); await key('Return');
  await wait("!document.querySelector('.modal')", 'grid cancellation');
  assert.deepEqual(await evaluate(`${state}.project`), before);
  await configure(6, 2, 'individual');
  await evaluate("document.querySelector('.modal select').focus()");
  for (let i=0; i<5; i++) await key('Tab');
  assert.equal(await evaluate('document.activeElement.textContent'), 'Apply rules'); await key('Return');
  await wait(`${state}.project.present.snapping?.steps===6 && !document.querySelector('.modal')`, 'grid apply');
  assert.deepEqual(await evaluate(`${state}.project.present.sets[0].positions`), positions);
  assert.equal(await evaluate(`${state}.project.past.at(-1).name`), 'Change grid and snapping');
  await capture('snapping-individual.png');
  pass('Grid dialog exposes keyboard-reachable choices and Apply/Cancel; changing rules is one undoable edit without moving dots');

  const screen = point => evaluate(`(() => {const p=new DOMPoint(${point.x},${point.y}).matrixTransform(document.querySelector('[data-field-geometry]').getScreenCTM());return {x:p.x,y:p.y}})()`);
  const shown = () => evaluate(`Object.fromEntries(${JSON.stringify(ids.slice(0,2))}.map(id=>{const xy=document.querySelector('[data-performer-id="'+id+'"]').getAttribute('transform').slice(10,-1).split(' ').map(Number);return [id,{x:xy[0],y:xy[1]}]}))`);
  const drag = async () => {
    const start = await screen(positions[ids[0]]); const end = await screen({ x: 42.1, y: 21.3 });
    await input('mouseMoved',start); await input('mousePressed',start,{button:'left',clickCount:1}); await input('mouseMoved',end,{button:'left',buttons:1});
    await wait("!!document.querySelector('[data-snap-preview]')", 'individual drag preview');
    return end;
  };
  const revision = await evaluate(`${state}.project.revision`);
  let end = await drag(); const preview = await shown();
  assert.equal(await evaluate(`${state}.project.revision`), revision);
  const near = (actual, expected) => assert.ok(Math.abs(actual-expected)<1e-7, `${actual} vs ${expected}`);
  near(preview[ids[0]].x, 505/12); near(preview[ids[0]].y, 21.25);
  near(preview[ids[1]].x, 535/12); near(preview[ids[1]].y, 265/12);
  await capture('snapping-drag-preview.png');
  await key('Escape'); await input('mouseReleased',end,{button:'left',clickCount:1});
  assert.deepEqual(await evaluate(`${state}.project.present.sets[0].positions`), positions);
  await evaluate(`${editor}.setValue('selection','selectedIds',${JSON.stringify(ids.slice(0,2))})`);
  end = await drag(); const accepted = await shown();
  await input('mouseReleased',end,{button:'left',clickCount:1});
  await wait(`!document.querySelector('[data-snap-preview]') && ${state}.project.revision>${revision}`, 'drag commit');
  const committed = await evaluate(`${state}.project.present.sets[0].positions`);
  for (const id of ids.slice(0,2)) assert.deepEqual(committed[id],accepted[id]);
  assert.deepEqual(committed[ids[2]],positions[ids[2]]);
  await evaluate(`${editor}.dispatch('history.undo')`);
  assert.deepEqual(await evaluate(`${state}.project.present.sets[0].positions`),positions);
  pass('native drag previews individual snapping without an edit; Escape cancels; release commits exactly the preview and Undo restores offsets');

  await evaluate(`${editor}.dispatch('snapping.update',{settings:{steps:6,subdivision:2,target:'grid',group:'anchor'}}); ${editor}.setValue('selection','selectedIds',${JSON.stringify(ids.slice(0,2))}); document.querySelector('.field-stage__svg').focus()`);
  await key('Right',['alt']);
  const keyboard = await evaluate(`${state}.project.present.sets[0].positions`);
  near(keyboard[ids[1]].x-keyboard[ids[0]].x,2.6); near(keyboard[ids[0]].y,20.2); near(keyboard[ids[1]].y,21.1);
  await evaluate(`${editor}.dispatch('history.undo'); document.querySelector('[aria-label="Move selection right"]').click()`);
  assert.deepEqual(await evaluate(`${state}.project.present.sets[0].positions`),keyboard);
  await evaluate(`${editor}.dispatch('history.undo'); ${editor}.setValue('preferences','value',{...${state}.preferences.value,fieldOrientation:'audience-top'}); document.querySelector('.field-stage__svg').focus()`);
  await key('Left',['alt']);
  assert.deepEqual(await evaluate(`${state}.project.present.sets[0].positions`),keyboard);
  await capture('snapping-flipped.png');
  pass('native Alt-arrow, Inspector and flipped-field movement share targets and keep rigid group offsets');

  await control('[aria-label="Grid and snapping"]');
  for (const [width,zoom,name] of [[1366,1,'snapping-settings.png'],[1366,1.25,'snapping-enlarged.png'],[1120,1,'snapping-narrow.png']]) {
    window.setContentSize(width,768); window.webContents.setZoomFactor(zoom); await settleNativeViewport(window,'grid settings layout');
    assert.equal(window.getContentSize()[0],width,'native content width matches the recorded layout case');
    assert.ok(await evaluate("[...document.querySelectorAll('.modal select,.modal-actions button')].every(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})"));
    await capture(name);
  }
  await key('Escape'); window.webContents.setZoomFactor(1); window.setContentSize(1366,768);
  pass('placement controls fit 1366×768, enlarged 125% UI and a 1120px content width');
};
