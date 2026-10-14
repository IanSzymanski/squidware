'use strict';
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'); const path = require('node:path'); const assert = require('node:assert/strict');
const manifest = require(process.argv.find(arg => arg.startsWith('--playback-manifest=')).slice('--playback-manifest='.length));
const { root, output, profile, fixture } = manifest;
app.setPath('userData', profile);
let window; const checks = []; const profiles = {};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
BrowserWindow.prototype.show = function () {};
dialog.showMessageBox = async () => ({ response: 1 });
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source).catch(error => { console.error('Failed expression:', source.slice(0,500)); throw error; });
const editor = 'window.__playbackQA.editor'; const state = editor + '.getState()';
async function wait(source, label) { const start = Date.now(); while (Date.now() - start < 20000) { if (await evaluate(source)) return; await pause(20); } throw new Error('Timed out: ' + label); }
function instrument() {
  const qa = window.__playbackQA = { editor: null, renders: {}, errors: [] }; const previous = new Map();
  window.addEventListener('error', e => qa.errors.push(e.message));
  window.addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) {
      function visit(fiber) {
        if (!fiber) return;
        const value = fiber.memoizedProps?.value;
        if (value?.getState && value?.dispatch) qa.editor = value;
        if ([0, 15].includes(fiber.tag)) {
          const name = fiber.type?.displayName || fiber.elementType?.displayName || (fiber.memoizedProps?.label === 'Counts' ? 'InspectorCounts' : null);
          if (name && (fiber.flags & 1) && previous.get(name) !== fiber) qa.renders[name] = (qa.renders[name] || 0) + 1;
          if (name) previous.set(name, fiber);
        }
        visit(fiber.child); visit(fiber.sibling);
      } visit(root.current);
    }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
const counts = () => evaluate('({...window.__playbackQA.renders})');
async function measureRenders(name, action) {
  const before = await counts(); await action(); await pause(80); const after = await counts();
  const diff = Object.fromEntries(new Set([...Object.keys(before), ...Object.keys(after)]).values().map(key => [key, (after[key] || 0) - (before[key] || 0)]));
  profiles[name] = diff; return diff;
}
const pass = text => { checks.push(text); console.log('PASS ' + text); };
const timeout = setTimeout(() => { console.error('Playback QA timed out'); app.exit(1); }, 120000);
app.whenReady().then(async () => {
  try {
    while (!window) await pause(20);
    await wait("!!document.querySelector('.set-card')", 'initial UI');
    window.setContentSize(1366, 768); window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    window.webContents.reload(); await wait('!!window.__playbackQA?.editor', 'store');
    const content = await fs.readFile(fixture, 'utf8');
    await evaluate(`${editor}.dispatch('project.load', {project:JSON.parse(${JSON.stringify(content)})}); ${editor}.setValue('ui','dialog',null)`);
    await wait("document.querySelectorAll('.field-performer').length===500", 'maximum fixture');
    await wait("document.querySelector('.recovery-indicator')?.textContent==='Recovery copy saved'", 'fixture recovery finished');
    await evaluate(`${editor}.dispatch('playback.scrub',{count:1})`); await pause(250);
    let diff = await measureRenders('fractional-scrub', async () => {
      for (let i = 0; i < 12; i++) { await evaluate(`${editor}.dispatch('playback.scrub',{count:${2 + i / 4}})`); await pause(20); }
    });
    assert.equal(diff.StaticFieldMarkings, 0); assert.equal(diff.EditorShell, 0); assert.equal(diff.InspectorCounts, 0); assert.ok(diff.EditorTimeline >= 12);
    const transforms = await evaluate("Array.from(document.querySelectorAll('.field-performer')).map(n=>n.getAttribute('transform'))");
    assert.equal(transforms.length, 500);
    pass('500-performer fractional scrub updates the timeline while shell, Inspector and static markings remain idle');
    await evaluate(`${editor}.dispatch('playback.toggle')`); await wait(`${state}.playback.playing`, 'playback started'); await pause(250);
    const beforeCount = await evaluate(state + '.playback.count');
    diff = await measureRenders('real-playback', async () => { await pause(600); await wait(`${state}.playback.count > ${beforeCount}`, 'clock advanced'); });
    assert.ok(await evaluate(state + '.playback.count') > beforeCount);
    assert.notDeepEqual(await evaluate("Array.from(document.querySelectorAll('.field-performer')).map(n=>n.getAttribute('transform'))"), transforms);
    assert.equal(diff.StaticFieldMarkings, 0); assert.equal(diff.EditorShell, 0); assert.equal(diff.InspectorCounts, 0); assert.ok(diff.EditorTimeline > 0);
    await evaluate(`${editor}.dispatch('playback.toggle')`);
    pass('real playback advances geometry and count without redrawing the static field or unrelated shell controls');
    await evaluate(`${editor}.setValue('ui','workspace','cast'); ${editor}.dispatch('playback.toggle')`); await pause(250);
    diff = await measureRenders('cast-playback', () => pause(400)); assert.equal(diff.CastWorkspace, 0); assert.equal(diff.EditorShell, 0);
    await evaluate(`${editor}.dispatch('playback.toggle'); ${editor}.setValue('ui','workspace','design'); ${editor}.dispatch('set.select',{index:0})`); await pause(200);
    pass('Cast remains idle during playback');
    diff = await measureRenders('grid-invalidation', () => evaluate(`${editor}.setValue('ui','showGrid', !${state}.ui.showGrid)`)); assert.equal(diff.StaticFieldMarkings, 1);
    diff = await measureRenders('field-invalidation', () => evaluate(`${editor}.dispatch('project.update',{preset:'high-school'})`)); assert.equal(diff.StaticFieldMarkings, 1);
    diff = await measureRenders('zoom-fit-resize', async () => { await evaluate(`${editor}.setValue('ui','zoom',1.4)`); window.setContentSize(1200,800); await pause(100); await evaluate(`${editor}.setValue('ui','fitVersion',1)`); }); assert.equal(diff.StaticFieldMarkings, 0);
    assert.equal(await evaluate("document.querySelector('.field-stage__svg').getAttribute('viewBox').split(' ').length"), 4);
    pass('grid and field type invalidate markings; zoom, fit and resize retain the static drawing');
    const project = await evaluate(state + '.project.present'); const id = project.performers.at(-1).id;
    await wait("document.querySelector('.recovery-indicator')?.textContent==='Recovery copy saved'", 'field change recovery finished');
    await evaluate(`${editor}.setValue('ui','zoom',1); ${editor}.setValue('selection','selectedIds',[${JSON.stringify(id)}]); ${editor}.setValue('ui','snap',false)`); await pause(100);
    const point = await evaluate(`(() => {const n=Array.from(document.querySelectorAll('.field-performer')).find(n=>n.dataset.performerId===${JSON.stringify(id)}); const p=new DOMPoint(0,0).matrixTransform(n.getScreenCTM()); return {x:p.x,y:p.y};})()`);
    const hit = await evaluate(`document.elementFromPoint(${point.x},${point.y})?.closest('[data-performer-id]')?.getAttribute('data-performer-id')`);
    assert.equal(hit,id, 'The drag must hit the intended topmost performer.');
    const revision = await evaluate(state + '.project.revision'); const history = await evaluate(state + '.project.past.length');
    const mouse = args => window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', args);
    await mouse({type:'mousePressed',...point,button:'left',buttons:1,clickCount:1}); await pause(100);
    diff = await measureRenders('drag-preview', async () => {
      for (let step=1;step<=6;step++) { await mouse({type:'mouseMoved',x:point.x+step*5,y:point.y+step*2,button:'left',buttons:1}); await pause(20); }
    });
    assert.equal(await evaluate(state + '.project.revision'), revision); assert.equal(diff.StaticFieldMarkings, 0); assert.equal(diff.EditorShell, 0);
    await mouse({type:'mouseReleased',x:point.x+30,y:point.y+12,button:'left',buttons:0,clickCount:1}); await pause(200);
    assert.equal(await evaluate(state + '.project.past.length'), history+1);
    assert.notDeepEqual(await evaluate(`${state}.project.present.sets[0].positions[${JSON.stringify(id)}]`), project.sets[0].positions[id]);
    await evaluate(`${editor}.dispatch('history.undo')`); assert.deepEqual(await evaluate(`${state}.project.present.sets[0].positions[${JSON.stringify(id)}]`), project.sets[0].positions[id]);
    pass('pointer drag previews keep project history unchanged and release commits one undoable action');
    await evaluate(`${editor}.dispatch('playback.scrub',{count:32.1})`); await pause(100);
    assert.equal(await evaluate(state + '.selection.activeIndex'), 2); assert.equal(await evaluate("!!document.querySelector('.field-preview-banner')"), true);
    await evaluate(`${editor}.dispatch('set.select',{index:2})`); await pause(100);
    assert.equal(await evaluate(state + '.playback.count'), 64); assert.equal(await evaluate("!!document.querySelector('.field-preview-banner')"), false);
    assert.equal(await evaluate("document.querySelectorAll('.field-performer[aria-pressed=true]').length"), 1);
    assert.deepEqual(await evaluate('window.__playbackQA.errors'), []);
    pass('move boundaries, preview locks, direct set recovery and selection remain synchronized');
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({...manifest,checks,profiles,platform:process.platform,electron:process.versions.electron,note:'Production React committed-work counts; profiling adds overhead. No representative-hardware or assistive-technology qualification.'},null,2));
    clearTimeout(timeout); app.exit(0);
  } catch(error) {console.error(error);console.error({profiles,playback:await evaluate(`${state}.playback`).catch(()=>null)});clearTimeout(timeout);app.exit(1);}
});
