'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const { root, output, profile, bundle } = require(process.argv.find(a => a.startsWith('--analysis-manifest=')).slice('--analysis-manifest='.length));
const { analyzeTransition, createPerformanceFixture } = require(bundle);
app.disableHardwareAcceleration(); app.setPath('userData', profile); BrowserWindow.prototype.show = function () {};
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure; const checks = [], metrics = {};
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); window.webContents.on('render-process-gone', (_e, d) => { failure = new Error(d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const qa = 'window.__analysisQA', editor = qa + '.editor', state = editor + '.getState()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 20000, failure: () => failure });
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  const qa = window.__analysisQA = { editor: null, workers: [], responses: [], requests: [], errors: [], hold: false, failStart: false };
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      if (qa.failStart) { qa.failStart = false; throw new Error('Injected worker startup failure'); }
      super(...args); qa.workers.push(this);
      this.addEventListener('message', event => qa.responses.push(event.data));
    }
    postMessage(message) { qa.requests.push(message); if (!qa.hold) super.postMessage(message); }
  };
  window.addEventListener('error', event => qa.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => qa.errors.push(String(event.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) qa.editor = v; visit(f.child); visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
const ready = () => wait("document.querySelector('[data-analysis-status]')?.dataset.analysisStatus==='ready'", 'current worker result');
async function oracle() {
  await ready();
  const p = await evaluate(state + '.project.present'), index = await evaluate(state + '.selection.activeIndex');
  assert.deepEqual(await evaluate(qa + '.responses.at(-1).result.issues'), analyzeTransition(p, index));
}
async function capture(name) {
  await evaluate("document.activeElement?.blur(); document.querySelector('.transition-check').scrollIntoView({block:'nearest'})");
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await capturePage(window, output, name);
}
app.whenReady().then(async () => {
  try {
    await fs.rm(path.join(output, 'failure.txt'), { force: true });
    await waitFor(() => !!window, 'window'); await wait("!!document.querySelector('.set-card')", 'initial renderer');
    window.setContentSize(1366, 768); window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    window.webContents.reload(); await wait(`!!${editor} && ${state}.preferences.status==='saved'`, 'store and preferences');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,inspectorChecksOpen:true})`);
    const project = createPerformanceFixture('maximum');
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}}); ${editor}.setValue('ui','dialog',null); ${editor}.dispatch('set.select',{index:1})`);
    await oracle(); metrics.initial = await evaluate(qa + '.responses.at(-1).result.stats');
    metrics.fieldHeight = await evaluate("document.querySelector('.field-container').getBoundingClientRect().height");
    assert.ok(metrics.initial.exactPairs < metrics.initial.possiblePairs);
    assert.equal(await evaluate(qa + '.workers.length'), 1);
    await capture('analysis-ready.png'); pass('production file:// worker loads under desktop CSP and maximum-size flags match the brute-force oracle');
    const id = project.performers[0].id;
    await evaluate(`${editor}.dispatch('positions.move',{index:1,updates:{[${JSON.stringify(id)}]:{x:41,y:20}}})`); await oracle();
    metrics.localized = await evaluate(qa + '.responses.at(-1).result.stats');
    assert.equal(metrics.localized.mode, 'incremental'); assert.equal(metrics.localized.changedPerformers, 1); assert.ok(metrics.localized.exactPairs <= 499);
    await evaluate(`${editor}.dispatch('history.undo')`); await oracle();
    // Hold delivery to keep pending state observable while testing real native input.
    await evaluate(`${qa}.hold=true; ${editor}.dispatch('positions.move',{index:1,updates:{[${JSON.stringify(id)}]:{x:42,y:20}}}); ${editor}.setValue('selection','selectedIds',[${JSON.stringify(id)}]); ${editor}.setValue('ui','snap',false)`);
    await wait("document.querySelector('[data-analysis-status]')?.dataset.analysisStatus==='pending'", 'checking state');
    assert.equal(await evaluate("document.querySelectorAll('.issue-list button,.check-passed').length"), 0);
    const previous = await evaluate(qa + '.responses.at(-1)');
    await evaluate(`${qa}.workers.at(-1).onmessage({data:${JSON.stringify(previous)}})`);
    assert.equal(await evaluate("document.querySelector('[data-analysis-status]').dataset.analysisStatus"), 'pending');
    await capture('analysis-pending.png');
    await evaluate("document.activeElement?.blur(); document.querySelector('.move-selection-right').focus()"); await key(window, 'Return', [], 30);
    await wait(`${state}.project.present.sets[1].positions[${JSON.stringify(id)}].x!==42`, 'native keyboard nudge during pending analysis');
    pass('pending checks clear old flags, reject stale replies and allow native keyboard gestures');
    await evaluate(`${qa}.hold=false; ${editor}.dispatch('history.undo')`); await oracle();
    await evaluate(`new Promise(resolve=>{const times=[];let frame=0;function tick(){const start=performance.now();${editor}.dispatch('positions.move',{index:1,updates:{[${JSON.stringify(id)}]:{x:42+(frame%8)*.125,y:20}}});times.push(performance.now()-start);if(++frame<30)setTimeout(tick,0);else{${qa}.dispatchTimes=times;resolve();}}tick();})`);
    await oracle(); metrics.rapidEditDispatchMs = await evaluate(qa + '.dispatchTimes');
    await evaluate(`${editor}.dispatch('set.select',{index:2}); ${editor}.dispatch('set.select',{index:3}); ${editor}.dispatch('set.select',{index:1})`); await oracle();
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}}); ${editor}.dispatch('set.select',{index:1})`); await oracle();
    assert.equal(await evaluate(qa + '.responses.at(-1).result.stats.mode'), 'full');
    pass('rapid edits, undo, set changes and same-ID replacement retain correct flags and reset project caches');
    await evaluate(`${qa}.workers.at(-1).onmessageerror(new MessageEvent('messageerror')); ${qa}.failStart=true`);
    await wait("document.querySelector('[data-analysis-status]').dataset.analysisStatus==='error'", 'worker failure');
    await capture('analysis-failed.png');
    await evaluate("document.querySelector('[aria-label=\"Retry transition check\"]').focus()"); await key(window, 'Return');
    await wait("document.querySelector('.transition-check').textContent.includes('could not start')", 'constructor failure');
    await evaluate("document.querySelector('[aria-label=\"Retry transition check\"]').focus()"); await key(window, 'Return'); await oracle();
    assert.equal(await evaluate(qa + '.workers.length'), 2);
    pass('worker decode/startup failures show an actionable state and keyboard retry creates a fresh worker');
    for (const theme of ['light', 'high-contrast']) {
      await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);
      await capture(`analysis-${theme}.png`);
    }
    window.setContentSize(1024, 720); window.webContents.setZoomFactor(1.25); await settleNativeViewport(window, 'enlarged transition check');
    await capture('analysis-enlarged.png');
    assert.equal(await evaluate("document.querySelector('.transition-check').getBoundingClientRect().width>100"), true);
    assert.deepEqual(await evaluate(qa + '.errors'), []);
    pass('ready, pending and failure states use shared controls; supported themes and enlarged narrow layout remain readable');
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, metrics, source: require(process.argv.find(a => a.startsWith('--analysis-manifest=')).slice('--analysis-manifest='.length)).source }, null, 2));
    app.exit(0);
  } catch (error) { console.error(error); await fs.writeFile(path.join(output, 'failure.txt'), error.stack); app.exit(1); }
});
