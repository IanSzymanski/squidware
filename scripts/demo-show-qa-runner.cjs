'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path');
const { app, BrowserWindow, dialog } = require('electron');
const { capturePage, key, waitFor, pause, revealFieldTool, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--demo-show-manifest=')).slice('--demo-show-manifest='.length));
const { root, output, profile, bundle, recording } = manifest;
const { parseProject, setStartCount } = require(bundle);
const timing = require(path.join(root, 'scripts/demo-show/space-show-timing.json'));
process.argv.push('--squidware-showcase-demo');
app.disableHardwareAcceleration(); app.setPath('userData', profile);
// Match the other fixed-size screenshot suites: showing a window lets macOS
// constrain it to the runner display's smaller visible work area.
BrowserWindow.prototype.show = function () {};
dialog.showMessageBox = async () => ({ response: 1 });
dialog.showOpenDialog = async () => ({ filePaths: [recording] });
let window, failure;
app.on('browser-window-created', (_event, created) => {
  window = created; window.webContents.setBackgroundThrottling(false);
  window.webContents.on('render-process-gone', (_e, details) => { failure = Error(details.reason); });
});
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const qa = 'window.__demoQA', editor = qa + '.editor', state = editor + '.getState()', audio = 'document.querySelector("audio")';
const wait = (expression, label, timeoutMs = 25000) => waitFor(() => evaluate(expression), label, { timeoutMs, failure: () => failure });
const checks = [], arrivals = [], playback = [];
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  const qa = window.__demoQA = { editor: null, errors: [] };
  window.addEventListener('error', event => qa.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => qa.errors.push(String(event.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) {
      function visit(fiber) {
        if (!fiber) return;
        const value = fiber.memoizedProps?.value;
        if (value?.getState && value?.dispatch) qa.editor = value;
        visit(fiber.child); visit(fiber.sibling);
      }
      visit(root.current);
    }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function press(label) {
  await evaluate(`(() => {const button=[...document.querySelectorAll('button')].find(n=>n.textContent.includes(${JSON.stringify(label)})); if(!button)throw Error('Missing '+${JSON.stringify(label)}); button.focus();})()`);
  await key(window, 'Return');
}
async function toggle(playing) {
  await evaluate('document.activeElement?.blur()'); await key(window, 'Space');
  await wait(`${state}.playback.playing===${playing}`, playing ? 'playing' : 'paused');
}
const transforms = () => evaluate("[...document.querySelectorAll('.field-performer')].map(n=>n.getAttribute('transform'))");
const clean = () => evaluate(`${state}.project.revision===${state}.fileSession.cleanRevision && !${state}.ui.pendingDraft && ${state}.fileSession.savedRevision===null`);
function sourceSeconds(count) {
  const movement = timing.movements.find(m => count <= m.offsetCount + m.counts);
  return movement.offsetSeconds + movement.times[count - movement.offsetCount];
}
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'window');
    await wait("document.querySelectorAll('.field-performer').length===165", 'default Tether startup');
    window.setContentSize(1366, 768); window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    const start = performance.now(); window.webContents.reload();
    await wait(`!!${editor} && document.querySelectorAll('.field-performer').length===165 && ${state}.preferences.status==='saved'`, 'instrumented production ready');
    const readyMs = performance.now() - start;
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    const expected = parseProject(await fs.readFile(path.join(root, 'examples/tether-space-show.squid'), 'utf8'));
    assert.deepEqual(await evaluate(state + '.project.present'), expected);
    assert.equal(await clean(), true);
    assert.equal(await evaluate(state + '.fileSession.audioUrl'), '');
    // An ordinary launch offers the start dialog over the loaded show. Its Explore the demo action only closes it.
    await wait("(()=>{const d=document.querySelector('dialog.welcome');return !!d&&d.open&&d.matches(':modal')&&d.contains(document.activeElement)})()", 'start dialog at launch');
    assert.equal(await evaluate("document.querySelector('dialog.welcome h1').textContent"), 'Write your show');
    assert.match(await evaluate("[...document.querySelectorAll('dialog.welcome .welcome-action')].find(n=>n.textContent.includes('Explore the demo')).textContent"), /Tether · 165 performers, 67 sets/);
    await press('Explore the demo'); await wait("!document.querySelector('dialog.welcome') && !document.querySelector('dialog[open]')", 'start dialog closed by Explore the demo');
    assert.deepEqual(await evaluate(state + '.project.present'), expected); assert.equal(await clean(), true);
    pass('ordinary startup loads the authored 165-member/67-set Tether cleanly, without a recording, under a start dialog that Explore the demo closes');

    await evaluate(`${editor}.setValue('preferences','value',p=>({...p,minimumSpacing:2,maximumStride:.6,snapDefaults:{steps:6,subdivision:1,target:'grid',group:'individual'}}))`);
    await evaluate(`${editor}.dispatch('dialog.open',{dialog:'new'})`);
    await press('Blank production'); await wait(`${state}.project.present.performers.length===0 && !${state}.ui.dialog`, 'blank production');
    assert.deepEqual(await evaluate(state + '.project.present.analysisRules.defaults'), { minimumSpacing: 2, maximumStride: .6 });
    assert.equal(await evaluate(state + '.project.present.snapping.steps'), 6);
    await evaluate(`${editor}.dispatch('dialog.open',{dialog:'new'})`);
    await press('Explore the demo'); await wait(`${state}.project.present.title==='Tether' && !${state}.ui.dialog`, 'Explore the demo');
    assert.deepEqual(await evaluate(state + '.project.present'), expected); assert.equal(await clean(), true);
    await evaluate(`${editor}.dispatch('workspace.select',{id:'field'})`);
    await wait("document.querySelectorAll('.field-performer').length===165", 'field workspace');
    pass('personal defaults seed blank productions; native Explore the demo preserves the authored show and opens cleanly');

    await evaluate(`${editor}.dispatch('analysis.problems-open')`);
    await wait("document.querySelector('[data-show-analysis-status]')?.dataset.showAnalysisStatus==='ready'", 'all 66 moves checked', 150000);
    const analysis = await evaluate("document.querySelector('.problems-panel [role=status]').textContent");
    assert.match(analysis, /66 \/ 66 moves checked · 1 finding/);
    assert.equal(await evaluate("document.querySelectorAll('.problem-result').length"), 1);
    assert.ok(expected.sets.find(s => s.name === 'TE 5 · Layers').notes.includes('TEACHING FINDING'));
    await key(window, 'Escape'); await wait(`${state}.ui.dialog===null`, 'analysis closed');
    pass('production worker completes show-wide analysis with exactly the explained teaching finding');
    await settleNativeViewport(window, 'Tether screenshot viewport');
    const viewport = await evaluate("({width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container').getBoundingClientRect().height})");
    assert.equal(viewport.width, 1366); assert.equal(viewport.height, 768); assert.ok(viewport.fieldHeight >= 470);
    await capturePage(window, output, 'tether-1366.png');

    await evaluate(`${editor}.dispatch('playback.scrub',{count:8})`);
    const before = await transforms(); await toggle(true);
    const frames = await evaluate(`new Promise(resolve=>{const intervals=[];let previous=performance.now(),start=previous;function frame(now){intervals.push(now-previous);previous=now;if(now-start>=2000)resolve(intervals);else requestAnimationFrame(frame);}requestAnimationFrame(frame);})`);
    await wait(`${state}.playback.count>8`, 'silent playback count advances');
    assert.notDeepEqual(await transforms(), before); await toggle(false);
    frames.sort((a,b) => a-b);
    const cadence = { samples: frames.length, medianMs: frames[Math.floor(frames.length * .5)], p95Ms: frames[Math.floor(frames.length * .95)] };
    pass('tempo-map playback advances count and field geometry; frame cadence is recorded');

    // Use the actual native audio bridge and media element; only the OS file
    // picker is controlled. The generated silence tests transport, not music.
    await revealFieldTool(window, '[aria-label="Attach audio"]');
    await evaluate("document.querySelector('[aria-label=\"Attach audio\"]').focus()"); await key(window, 'Return');
    await wait(`${state}.fileSession.audioToken && !${state}.fileSession.audioLoading && ${audio}.readyState>=3`, 'generated media attached');
    for (let i = 0; i < expected.sets.length; i++) {
      const count = setStartCount(expected, i), seconds = sourceSeconds(count);
      await evaluate(`${editor}.dispatch('playback.scrub',{count:${count}})`);
      await wait(`!${audio}.seeking && Math.abs(${audio}.currentTime-${seconds})<.025`, 'recording arrival ' + expected.sets[i].name);
      arrivals.push({ set: expected.sets[i].name, count, expectedSeconds: seconds, mediaSeconds: await evaluate(audio + '.currentTime') });
    }
    pass('real media seeks match the independent score timing at all 67 set arrivals');
    for (const [count, speed] of [[8, .75], [320, 1.5], [648, 1], [1000, 1.5]]) {
      await evaluate(`${editor}.setValue('playback','speed',${speed}); ${editor}.dispatch('playback.scrub',{count:${count}})`);
      await wait(`!${audio}.seeking`, 'seek settled'); await toggle(true);
      await wait(`${state}.playback.count>${count + 1}`, 'aligned media count advances');
      const reading = await evaluate(`({count:${state}.playback.count,seconds:${audio}.currentTime,rate:${audio}.playbackRate})`);
      const { countToSeconds } = require(bundle);
      assert.equal(reading.rate, speed);
      assert.ok(Math.abs(reading.seconds - countToSeconds(expected, reading.count)) < .15, JSON.stringify(reading));
      playback.push(reading); await toggle(false);
      const paused = await evaluate(audio + '.currentTime'); await pause(100);
      assert.ok(Math.abs(await evaluate(audio + '.currentTime') - paused) < .03);
    }
    pass('aligned media drives playback in all four movements at rehearsal speeds and remains still when paused');
    assert.deepEqual(await evaluate(qa + '.errors'), []);
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, readyMs, cadence, viewport, analysis, arrivals, playback, source: manifest.source,
      note: 'Generated silence verifies media transport against authored timing, not audible synchronization to an unavailable Space show recording. Cadence is host evidence; 16.7 ms is an investigation target, not a hardware qualification.' }, null, 2));
    app.exit(0);
  } catch (error) {
    console.error(error);
    console.error(await evaluate(`({dialog:${state}.ui.dialog,playback:${state}.playback,toast:${state}.ui.toast})`).catch(() => null));
    await capturePage(window, output, 'failure.png').catch(() => {});
    await fs.writeFile(path.join(output, 'failure.txt'), error.stack); app.exit(1);
  }
});
