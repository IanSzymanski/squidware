'use strict';
const assert = require('node:assert/strict');
const { app, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, selectNativeOption, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--timeline-manifest=')).slice('--timeline-manifest='.length));
const { root, output, profile, bundle } = manifest;
const { fixture, setStartCount, totalCounts } = require(bundle);
app.disableHardwareAcceleration(); app.setPath('userData', profile);
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure; const checks = [], viewports = [];
app.on('browser-window-created', (_e, w) => { window = w; w.webContents.setBackgroundThrottling(false); w.webContents.on('render-process-gone', (_e, d) => { failure = new Error(d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const editor = 'window.__timelineQA.editor', state = editor + '.getState()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 20000, failure: () => failure });
const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const pass = label => { checks.push(label); console.log('PASS ' + label); };
async function selectTimelineSet(index) {
  await evaluate('document.activeElement?.blur()');
  await selectNativeOption(window, '[aria-label="Go to timeline set"]', String(index));
}
function instrument() {
  const qa = window.__timelineQA = { editor: null, errors: [] };
  window.addEventListener('error', e => qa.errors.push(e.message)); window.addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) qa.editor = v; visit(f.child); visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function click(label) {
  const point = await evaluate(`(()=>{const e=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']'); if(!e) throw Error('Missing '+${JSON.stringify(label)}); e.scrollIntoView({block:'nearest',inline:'nearest'}); const r=e.getBoundingClientRect(); const x=r.x+r.width/2,y=r.y+r.height/2; if(x<0||y<0||x>=innerWidth||y>=innerHeight||!e.contains(document.elementFromPoint(x,y))) throw Error('Unreachable native click: '+${JSON.stringify(label)}+' '+JSON.stringify({x,y,width:innerWidth,height:innerHeight})); return {x,y};})()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
  await frames();
}
async function capture(name) {
  await evaluate(`${editor}.setValue('ui','toast',''); document.activeElement?.blur()`);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await capturePage(window, output, name);
  viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container').getBoundingClientRect().height,timelineHeight:document.querySelector('.timeline').getBoundingClientRect().height})`));
}
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'window'); await wait("!!document.querySelector('.set-card')", 'renderer');
    window.show(); window.focus(); window.setContentSize(manifest.smallDesktop ? 1024 : 1366, manifest.smallDesktop ? 647 : 768); await settleNativeViewport(window, 'visible timeline');
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
    assert.match(await evaluate("document.querySelector('.move-count').textContent"), /Opening.*01.*Count 0/);
    await click('Timeline view');
    await click('Zoom timeline in'); await click('Zoom timeline in');
    assert.ok(await evaluate("Number(document.querySelector('[aria-label=\"Pan timeline\"]').max)>0"));
    for (let i = 0; i < 128; i++) {
      await selectTimelineSet(i);
      await frames();
      assert.equal(await evaluate(state + '.playback.count'), setStartCount(project, i));
      assert.equal(await evaluate(state + '.selection.activeIndex'), i);
      assert.equal(await evaluate("!!document.querySelector('.playhead')"), true);
    }
    pass('native picker intentionally visits all 128 set arrivals at useful zoom, including opening and final sets');
    await selectTimelineSet(2);
    for (let i = 0; i < 11; i++) await click('Zoom timeline in');
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
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Follow playhead\"]').getAttribute('aria-pressed')"), 'false');
    assert.equal(await evaluate(state + '.playback.count'), 9);
    await click('Follow playhead'); assert.equal(await evaluate("!!document.querySelector('.playhead')"), true);
    pass('keyboard pan leaves count untouched, disables follow, and re-enabling follow returns to the playhead');
    await evaluate(`${editor}.dispatch('playback.scrub',{count:8.25}); document.activeElement?.blur()`); await frames();
    await key(window, '.'); await wait(`${state}.playback.count===9.25`, 'period count step');
    await key(window, ','); await wait(`${state}.playback.count===8.25`, 'comma count step');
    assert.match(await evaluate("document.querySelector('.move-count').textContent"), /Move 7.25 \/ 8/);
    assert.equal(await evaluate("document.querySelector('.show-count strong').textContent"), '8.25');
    await click('Next count'); assert.equal(await evaluate(state + '.playback.count'), 9.25);
    await click('Previous count'); assert.equal(await evaluate(state + '.playback.count'), 8.25);
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
    await click('Fit show timeline'); await click('Zoom timeline in'); await click('Zoom timeline in');
    await evaluate(`${editor}.dispatch('playback.scrub',{count:0}); ${editor}.setValue('playback','speed',1.5)`);
    await click('Play show'); await wait(`${state}.playback.playing`, 'native Play starts playback'); await wait(`${state}.playback.count>2`, 'playback advancement');
    assert.equal(await evaluate("!!document.querySelector('.playhead')"), true); await click('Pause playback');
    pass('ordinary typing does not step counts, and follow keeps the running clock visible');
    for (const theme of ['light','high-contrast']) {
      await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);
      await capture(`timeline-${theme}.png`);
    }
    window.setContentSize(1024, 720); window.webContents.setZoomFactor(1.25); await settleNativeViewport(window, 'enlarged timeline');
    for (const label of ['Zoom timeline in','Go to timeline set','Next count','Play show']) {
      await evaluate(`document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']').focus()`); await frames();
      assert.equal(await evaluate(`(()=>{const e=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');const r=e.getBoundingClientRect();return r.width>0 && r.right<=innerWidth && r.bottom<=innerHeight;})()`), true, label);
    }
    await evaluate("document.querySelector('.count-display').scrollIntoView({block:'end'})"); await frames();
    await capture('timeline-enlarged.png');
    assert.equal(await evaluate(`JSON.stringify(${state}.project.present)`), original);
    assert.deepEqual(await evaluate('window.__timelineQA.errors'), []);
    pass('all themes and enlarged narrow layout retain controls; navigation leaves saved geometry, timing and history untouched');
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,source:manifest.source,scope:'targeted',sandboxDisabled:process.argv.includes('--no-sandbox')},null,2)); app.exit(0);
  } catch (error) { console.error(error); console.error(await evaluate(`({playback:${state}.playback,pendingDraft:${state}.ui.pendingDraft,toast:${state}.ui.toast,viewport:{width:innerWidth,height:innerHeight},active:document.activeElement?.outerHTML})`).catch(()=>null)); await capturePage(window,output,'failure.png').catch(()=>{}); await fs.writeFile(path.join(output,'failure.txt'),error.stack); app.exit(1); }
});
