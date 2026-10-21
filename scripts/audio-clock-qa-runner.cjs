'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, selectNativeOption, waitFor, pause, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--audio-clock-manifest=')).slice('--audio-clock-manifest='.length));
const { root, output, profile, bundle, recording, shortRecording } = manifest;
const { fixture, countToSeconds, secondsToCount, sampleProject, totalCounts } = require(bundle);
app.disableHardwareAcceleration(); app.setPath('userData', profile);
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure; const checks = [], measurements = [], viewports = [];
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); window.webContents.on('render-process-gone', (_e, d) => { failure = new Error(d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const qa = 'window.__audioQA', editor = qa + '.editor', state = editor + '.getState()', audio = 'document.querySelector("audio")';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 20000, failure: () => failure });
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  const qa = window.__audioQA = { editor: null, seeks: [], plays: 0, rejectPlay: false, errors: [] };
  const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { ...descriptor, set(value) { qa.seeks.push(value); return descriptor.set.call(this, value); } });
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { qa.plays++; if (qa.rejectPlay) return Promise.reject(new Error('Injected playback failure')); return play.call(this); };
  window.addEventListener('error', e => qa.errors.push(e.message)); window.addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) qa.editor = v; visit(f.child); visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function capture(name) {
  await evaluate(`${editor}.setValue('ui','toast','')`);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await capturePage(window, output, name);
  viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container').getBoundingClientRect().height,timelineHeight:document.querySelector('.timeline').getBoundingClientRect().height})`));
}
async function attach(file) {
  const before = await evaluate(state + '.fileSession.audioUrl');
  const doc = await window.webContents.debugger.sendCommand('DOM.getDocument');
  const { nodeId } = await window.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[accept="audio/*"]' });
  await window.webContents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files: [file] });
  await wait(`${state}.fileSession.audioUrl!==${JSON.stringify(before)} && !${state}.fileSession.audioLoading && ${audio}.readyState>=3`, 'decoded and playable recording');
}
async function toggle() {
  await evaluate('document.activeElement?.blur()'); await key(window, 'Space');
}
async function settleFrames() { await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'); }
async function snapshot() {
  return evaluate(`({ count:${state}.playback.count, media:${audio}.currentTime, seeks:${qa}.seeks.length, plays:${qa}.plays, playing:${state}.playback.playing, status:${state}.playback.clockStatus, paused:${audio}.paused })`);
}
async function synchronized(project) {
  await settleFrames(); const s = await snapshot();
  assert.ok(Math.abs(countToSeconds(project, s.count) + project.audioOffsetSeconds - s.media) < .15, JSON.stringify(s));
  const geometry = await evaluate("Object.fromEntries([...document.querySelectorAll('.field-performer')].map(n=>[n.dataset.performerId,n.getAttribute('transform')]))");
  const expected = sampleProject(project, s.count).positions;
  for (const [id, transform] of Object.entries(geometry)) {
    const values = transform.match(/translate\(([-\d.e+]+)[ ,]+([-\d.e+]+)\)/);
    assert.ok(values, transform);
    assert.ok(Math.abs(Number(values[1]) - expected[id].x) < .1 && Math.abs(Number(values[2]) - expected[id].y) < .1);
  }
  return s;
}
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'window'); await wait("!!document.querySelector('.set-card')", 'initial renderer');
    // Audio end can throttle rAF in a hidden Chromium window even with
    // background throttling disabled. Rehearse in a visible native window.
    window.show(); window.focus();
    window.setContentSize(1366, 768); window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    window.webContents.reload(); await wait(`!!${editor} && ${state}.preferences.status==='saved'`, 'store and preferences');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    const project = fixture();
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}})`);
    await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)", 'recovery initialization');
    await evaluate(`${editor}.setValue('ui','dialog',null)`);
    await attach(recording); assert.equal(await evaluate(audio + '.duration'), 600);
    await capture('audio-attached.png');
    pass('a real ten-minute WAV attaches and decodes through the production file input');
    for (const speed of [.5, .75, 1, 1.25, 1.5]) {
      await evaluate(`${editor}.dispatch('playback.scrub',{count:1000})`);
      await selectNativeOption(window, '[aria-label="Playback speed"]', String(speed));
      await toggle(); await wait(`${state}.playback.clockStatus==='Audio clock' && !${audio}.paused`, 'audio clock running');
      await pause(250); const before = await synchronized(project);
      await evaluate('(() => {const end=performance.now()+900;while(performance.now()<end){} })()');
      const after = await synchronized(project);
      assert.ok(after.media > before.media + speed * .5, JSON.stringify({ before, after }));
      assert.equal(after.seeks, before.seeks, 'Dropped frames must never cause correction seeks');
      assert.equal(await evaluate(audio + '.playbackRate'), speed);
      measurements.push({ speed, before, after, errorSeconds: countToSeconds(project, after.count) - after.media });
      await toggle(); await wait(`!${state}.playback.playing && ${audio}.paused`, 'paused');
      const stopped = await snapshot(); await pause(200);
      assert.equal((await snapshot()).count, stopped.count); assert.ok(Math.abs((await snapshot()).media - stopped.media) < .05);
    }
    pass('all five rehearsal speeds follow media after renderer stalls without correction seeks; native Space pauses both clocks');
    const beforeResume = await snapshot(); await toggle(); await pause(200); await toggle();
    assert.equal((await snapshot()).seeks, beforeResume.seeks, 'Resume must not seek');
    await evaluate(`${editor}.dispatch('playback.scrub',{count:1023}); ${editor}.setValue('playback','speed',1.5)`);
    await toggle(); await wait(`${state}.playback.count>1025`, 'tempo boundary'); await synchronized(project); await toggle();
    assert.equal(await evaluate(state + '.selection.activeIndex'), 2);
    pass('resume preserves audio position and the field/count mapping crosses a written tempo boundary');
    await evaluate("document.querySelector('[aria-label=\"Timeline playhead\"]').focus()"); await key(window, 'Home');
    await wait(`${state}.playback.count===0 && ${audio}.currentTime===0 && !${state}.playback.playing`, 'native scrub to opening');
    await evaluate(`${editor}.dispatch('project.update',{audioOffsetSeconds:2}); ${editor}.dispatch('playback.scrub',{count:10})`);
    await wait(`${audio}.currentTime===7`, 'positive offset');
    project.audioOffsetSeconds = 2; await toggle(); await pause(250); await synchronized(project); await toggle();
    await evaluate(`${editor}.dispatch('project.update',{audioOffsetSeconds:-1}); ${editor}.dispatch('playback.scrub',{count:0})`);
    project.audioOffsetSeconds = -1; await toggle();
    await wait(`${state}.playback.clockStatus.includes('Before audio') && ${state}.playback.count>0`, 'silent lead-in');
    assert.equal(await evaluate(audio + '.paused'), true);
    await wait(`${state}.playback.clockStatus==='Audio clock' && ${audio}.currentTime>.1`, 'lead-in handover'); await synchronized(project); await toggle();
    pass('keyboard scrubbing seeks intentionally; positive offsets skip into audio and negative offsets delay it without losing show time');
    await evaluate(`${editor}.dispatch('playback.scrub',{count:2})`); await attach(shortRecording);
    assert.equal(await evaluate(state + '.playback.playing'), false);
    await toggle(); await wait(`${state}.playback.clockStatus.includes('Audio ended')`, 'silent tail');
    const tail = await snapshot(); await wait(`${state}.playback.count > ${tail.count + .2}`, 'silent tail advances'); await toggle();
    pass('replacing a track pauses playback and a short recording hands over to the silent clock at its end');
    await attach(recording); await evaluate(`${editor}.dispatch('project.update',{audioOffsetSeconds:0})`);
    const shortProject = fixture(2), duration = totalCounts(shortProject);
    shortProject.moves[2].tempo = 137; // Non-exact seconds must still stop at an exact count.
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(shortProject)}}); ${editor}.setValue('playback','loop',true); ${editor}.dispatch('playback.scrub',{count:${duration - .2}})`);
    await settleFrames(); const beforeLoop = await snapshot(); await toggle();
    await wait(`${state}.playback.count<2 && ${state}.playback.clockStatus==='Audio clock'`, 'loop rewind');
    assert.equal((await snapshot()).seeks, beforeLoop.seeks + 1, 'One intentional loop seek');
    await toggle(); await evaluate(`${editor}.setValue('playback','loop',false); ${editor}.dispatch('playback.scrub',{count:${duration - .2}})`);
    await toggle(); await wait(`!${state}.playback.playing && ${state}.playback.count===${duration}`, 'show end');
    assert.equal(await evaluate(audio + '.paused'), true);
    pass('loop boundaries seek audio and field together once; non-looping playback stops at the exact final count');
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}}); ${editor}.dispatch('playback.scrub',{count:10}); ${qa}.rejectPlay=true`);
    await toggle(); await wait(`${state}.playback.clockStatus.includes('Audio unavailable')`, 'audio failure fallback');
    const failed = await snapshot(); await pause(300); assert.ok((await snapshot()).count > failed.count); assert.equal((await snapshot()).plays, failed.plays);
    await capture('audio-failed.png');
    await toggle(); await evaluate(qa + '.rejectPlay=false'); await toggle();
    await wait(`${state}.playback.clockStatus==='Audio clock'`, 'explicit playback retry'); await synchronized(project); await toggle();
    pass('failed play falls back continuously with a useful status, avoids retry loops, and retries on the next explicit play action');
    for (const theme of ['dark', 'light', 'high-contrast']) {
      await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);
      await capture(`audio-${theme}.png`);
    }
    window.setContentSize(1024, 720); window.webContents.setZoomFactor(1.25); await settleNativeViewport(window, 'enlarged audio status');
    await capture('audio-enlarged.png');
    assert.equal(await evaluate("document.querySelector('.audio-clock-status').getBoundingClientRect().bottom<=innerHeight"), true);
    await evaluate(`${editor}.setValue('fileSession','audioUrl',''); ${editor}.setValue('fileSession','audioName',''); ${editor}.dispatch('playback.scrub',{count:0})`);
    await toggle(); await wait(`${state}.playback.count>.5`, 'silent fallback clock'); await toggle();
    assert.equal(await evaluate("!!document.querySelector('.audio-track')"), false);
    assert.deepEqual(await evaluate(qa + '.errors'), []);
    pass('supported themes, enlarged layout and audio-free fallback retain transport access and hide the unused audio lane');
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, measurements, viewports, source: manifest.source, note: 'Generated local recording in production Electron. Automated timing evidence does not claim listening or physical-device qualification.' }, null, 2));
    app.exit(0);
  } catch (error) { console.error(error); console.error(await snapshot().catch(() => null)); await fs.writeFile(path.join(output, 'failure.txt'), error.stack); app.exit(1); }
});
