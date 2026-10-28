'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key: sendKey, pause, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--score-map-manifest=')).slice('--score-map-manifest='.length));
const { root, output, profile, bundle } = manifest;
const { fixture, parseProject, totalCounts, setStartCount, createPerformanceFixture, compileScore, scorePosition, scoreLabel, scoreAccent, parseMeterText } = require(bundle);
const savedFile = path.join(output, 'created.squid');
app.disableHardwareAcceleration(); app.setPath('userData', profile);
// Match the editor suite's fixed-size layout capture. A visible macOS window
// can be constrained by the runner's Dock/menu bar before the 768px assertion.
const showWindow = BrowserWindow.prototype.show;
BrowserWindow.prototype.show = function () {};
dialog.showSaveDialog = async () => ({ canceled: false, filePath: savedFile });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [savedFile] });
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure; const checks = [], viewports = [];
app.on('browser-window-created', (_e, w) => { window = w; w.webContents.setBackgroundThrottling(false); w.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message); }); w.webContents.on('render-process-gone', (_e, d) => { failure = new Error(d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = async source => { try { return await window.webContents.executeJavaScript(source); } catch(error) { console.error('Renderer probe failed: '+source.slice(0,300)); throw error; } };
const editor = 'window.__scoreQA.editor', state = editor + '.getState()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 20000, failure: () => failure });
const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const key = async (...args) => { await sendKey(...args); await frames(); };
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  const qa = window.__scoreQA = { editor: null, clicks: [], nodes: [], errors: [] };
  const Original = window.AudioWorkletNode;
  window.AudioWorkletNode = class extends Original {
    constructor(context, name, options) {
      super(context, name, options);
      if (name === 'squidware-metronome') {
        qa.nodes.push(this);
        if (!qa.context) {
          const addModule = context.audioWorklet.addModule.bind(context.audioWorklet);
          context.audioWorklet.addModule = (...args) => qa.rejectWorklet ? Promise.reject(new Error('Injected audio processor failure')) : addModule(...args);
        }
        qa.context = context;
        this.port.addEventListener('message', e => { if (e.data.type === 'click') qa.clicks.push({ ...e.data, deliveredAt: performance.now() }); });
        this.port.start(); this.port.postMessage({ type: 'diagnostics', diagnostics: true });
      }
    }
  };
  window.addEventListener('error', e => qa.errors.push(e.message));
  window.addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, r) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) qa.editor = v; visit(f.child); visit(f.sibling); } visit(r.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function click(selector) {
  const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e) throw Error('Missing '+${JSON.stringify(selector)}); e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
  await frames();
}
const button = name => `[aria-label=${JSON.stringify(name)}]`;
async function type(selector, text) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.select();})()`);
  await window.webContents.debugger.sendCommand('Input.insertText', { text: String(text) }); await frames();
}
async function capture(name) {
  await evaluate(`${editor}.setValue('ui','toast',''); document.activeElement?.blur()`);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await capturePage(window, output, name);
  viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container')?.getBoundingClientRect().height,dialogHeight:document.querySelector('dialog[open]')?.getBoundingClientRect().height})`));
}
const present = () => evaluate(state + '.project.present');
const cell = (row, column) => `.sheet-scroll [data-row="${row}"][data-column="${column}"]`;
async function load(project) {
  await evaluate(`${editor}.setValue('ui','pendingDraft',false); ${editor}.setValue('ui','dialog',null); ${editor}.dispatch('project.load',{project:${JSON.stringify(project)}}); ${editor}.dispatch('workspace.show',{workspace:'production'})`); await frames();
}
async function pasteData(text) {
  await evaluate('document.activeElement?.blur()');
  await click(button('Paste spreadsheet range'));
  await type(button('Spreadsheet data'), text);
}
async function nativePaste(row, column, text) {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
  await click(cell(row,column));
  await window.webContents.paste(); await frames();
  await wait(`${state}.ui.dialog==='sheet-paste'`, 'native clipboard review');
}
const events='10,6/8:3+3,A\n22,7/8:2+2+3,B';
async function openScore(){await evaluate('document.activeElement?.blur()');await click(button('Score map'));await wait(`${state}.ui.dialog==='score'`,'score panel');}
async function fillScore(){await type(button('Opening meter'),'4/4');await type(button('First full measure'),'1');await type(button('Pickup counts'),'2');await type(button('Score events'),events);}
app.whenReady().then(async()=>{
 try{
  await waitFor(()=>!!window,'window');await wait("!!document.querySelector('.set-card')",'renderer');window.setContentSize(1366,768);window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Page.enable');await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});
  window.webContents.reload();await wait(`!!${editor}&&${state}.preferences.status==='saved'`,'store');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)",'recovery');
  const p=fixture();p.moves.forEach(m=>m.tempo=300);await load(p);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Score position\"]').textContent"),'M1 · beat 1');
  await evaluate(`${editor}.dispatch('workspace.show',{workspace:'design'})`);await frames();await capture('score-field.png');
  const fixed=viewports.at(-1);assert.deepEqual([fixed.width,fixed.height],[1366,768]);assert.ok(fixed.fieldHeight>=470,JSON.stringify(fixed));
  await evaluate(`${editor}.dispatch('workspace.show',{workspace:'production'})`);await frames();
  BrowserWindow.prototype.show=showWindow;window.show();window.focus();await settleNativeViewport(window,'visible score');
  await openScore();await fillScore();assert.match(await evaluate("document.querySelector('.score-preview').textContent"),/M3 · beat 1.*M5 · beat 1/s);
  assert.equal(await evaluate(state+'.ui.pendingDraft'),true);assert.deepEqual(await present(),p);await capture('score-preview.png');
  await type(button('Score events'),'3,6/8,A');assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply score map\"]').disabled"),true);
  assert.match(await evaluate("document.querySelector('.score-panel [role=alert]').textContent"),/next bar starts at count 6/);await capture('score-invalid.png');
  await key(window,'Escape');await wait(`${state}.ui.dialog===null`,'cancel score');assert.deepEqual(await present(),p);assert.equal(await evaluate(state+'.ui.pendingDraft'),false);
  pass('legacy default map and 1366×768 field budget; pending preview, invalid bar anchor and Escape preserve the show');
  await openScore();await fillScore();await click(button('Apply score map'));await wait(`${state}.ui.dialog===null`,'map applied');
  const scored=await present(),map=compileScore(scored);
  assert.equal(await evaluate(state+'.project.past.length'),1);assert.deepEqual(scored.sets,p.sets);assert.deepEqual(scored.moves,p.moves);
  assert.deepEqual(scored.score.changes.map(c=>c.count),[10,22]);assert.equal(scored.score.pickupCounts,2);
  await click(button('Undo'));assert.deepEqual(await present(),p);await click(button('Redo'));assert.deepEqual(await present(),scored);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Score position\"]').textContent"),'M0 · beat 3');
  assert.match(await evaluate("document.querySelector('.sheet-scroll tbody tr:nth-child(2) th').textContent"),/M4 · beat 1/);
  pass('one undoable map applies pickups, compound and mixed meters without altering written tempos, geometry or motion');
  await type(cell(1,4),'3/4');await key(window,'Return');
  assert.equal((await present()).score.changes.find(c=>c.count===16).meter.numerator,3);
  assert.equal(await evaluate(state+'.project.past.length'),2);await evaluate('document.activeElement?.blur()');await click(button('Undo'));assert.deepEqual(await present(),scored);
  await type(cell(2,1),'1');await key(window,'Return');assert.match(await evaluate("document.querySelector('.sheet-error').textContent"),/beyond the show's 17 counts/);assert.deepEqual(await present(),scored);await key(window,'Escape');
  pass('Meter/Mark sheet columns use atomic commands and invalid count edits cannot strand musical anchors');
  await openScore();await type(button('Go to measure'),'3');await type(button('Go to beat'),'1');await click(button('Go to score position'));
  await wait(`${state}.ui.dialog===null`,'measure navigation');assert.equal(await evaluate(state+'.playback.count'),10);
  await openScore();await click(button('Go to rehearsal mark B'));await wait(`${state}.ui.dialog===null`,'mark navigation');assert.equal(await evaluate(state+'.playback.count'),22);
  await evaluate(`${editor}.dispatch('workspace.show',{workspace:'design'})`);await frames();await click(button('Rehearsal mark A'));assert.equal(await evaluate(state+'.playback.count'),10);
  assert.match(await evaluate("document.querySelector('[aria-label=\"Score position\"]').textContent"),/M3 · beat 1 · A/);await capture('score-timeline.png');
  pass('measure/beat and rehearsal-mark navigation match sheet positions, timeline markers and count readouts');
  await evaluate(`${editor}.dispatch('metronome.configure',{meter:{numerator:4,denominator:4,grouping:[4]},enabled:true,countInBars:0,speed:1.5});${editor}.dispatch('playback.scrub',{count:0})`);
  await wait('window.__scoreQA.nodes.length>0','audio worklet');await pause(150);await evaluate('window.__scoreQA.clicks=[]');await click(button('Play show'));
  await wait('window.__scoreQA.clicks.filter(c=>c.phase===\'show\').length>=31','mixed-meter clicks');await click(button('Pause playback'));await wait(`!${state}.playback.playing`,'pause');
  const audio=await evaluate('window.__scoreQA.clicks.filter(c=>c.phase===\'show\')');
  assert.ok(audio.some(c=>c.count===0));assert.ok(audio.some(c=>c.count===22));
  for(const event of audio)assert.equal(event.accent,scoreAccent(event.count,map.spans),JSON.stringify(event));
  for(let i=1;i<audio.length;i++)assert.ok(Math.abs(audio[i].time-audio[i-1].time-.2/1.5)<.02,JSON.stringify(audio));
  await evaluate(`${editor}.setValue('playback','countInBars',1);${editor}.dispatch('playback.scrub',{count:10});window.__scoreQA.clicks=[]`);await click(button('Play show'));
  await wait(`${state}.playback.clockStatus.startsWith('Count-in')`,'compound lead-in');assert.equal(await evaluate(state+'.playback.count'),10);
  await wait('window.__scoreQA.clicks.some(c=>c.phase===\'show\')','lead-in finished');await click(button('Pause playback'));
  const counted=await evaluate('window.__scoreQA.clicks');assert.equal(counted.filter(c=>c.phase==='count-in').length,6);assert.deepEqual(counted.filter(c=>c.phase==='count-in').map(c=>c.accent),['bar','beat','beat','group','beat','beat']);assert.equal(counted.find(c=>c.phase==='show').count,10);
  pass('real audio-thread clicks share pickup, compound/mixed boundaries and a six-count lead-in at the active meter');
  await evaluate('document.activeElement?.blur()');await click(button('Save'));
  await waitFor(async()=>{try{assert.deepEqual(parseProject(await fs.readFile(savedFile,'utf8')),scored);return true;}catch{return false;}},'native score save');
  const epoch=await evaluate(state+'.ui.projectEpoch');await key(window,'o',[process.platform==='darwin'?'meta':'control']);await wait(`${state}.ui.projectEpoch>${epoch}`,'native score reopen');assert.deepEqual(await present(),scored);
  pass('native save/reopen retains score metadata, geometry, identities and written timing');
  await evaluate(`${editor}.dispatch('workspace.show',{workspace:'production'})`);await frames();
  for(const theme of ['dark','light','high-contrast']){await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);await capture(`score-sheet-${theme}.png`);await openScore();await capture(`score-map-${theme}.png`);await key(window,'Escape');}
  window.setContentSize(1024,720);window.webContents.setZoomFactor(1.5);await settleNativeViewport(window,'enlarged score');await openScore();await fillScore();await type(button('Pickup counts'),'1');
  await evaluate("document.querySelector('[aria-label=\"Apply score map\"]').focus()");await capture('score-map-enlarged.png');
  assert.equal(await evaluate("(()=>{const r=document.querySelector('[aria-label=\"Apply score map\"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()"),true);
  await key(window,'Escape');await wait(`${state}.ui.dialog===null`,'enlarged cancel');
  pass('supported themes and narrow 150% scale retain map preview, errors, keyboard navigation and reachable actions');
  window.webContents.setZoomFactor(1);window.setContentSize(1366,768);await settleNativeViewport(window,'maximum score');
  const maximum=createPerformanceFixture('maximum');maximum.score={firstMeasure:1,pickupCounts:0,changes:Array.from({length:256},(_,i)=>({count:(i+1)*12,meter:parseMeterText(i%2?'4/4':'6/8')})),marks:Array.from({length:256},(_,i)=>({count:i*15,label:`Mark${i}`}))};
  await load(maximum);await openScore();assert.equal(await evaluate("!!document.querySelector('.score-panel [role=alert]')"),false);await type(button('Score events'),await evaluate("document.querySelector('[aria-label=\"Score events\"]').value.replace('Mark255','Final255')"));await click(button('Apply score map'));await wait(`${state}.ui.dialog===null`,'maximum map edited');await openScore();await click(button('Go to rehearsal mark Final255'));await wait(`${state}.ui.dialog===null`,'maximum mark');assert.equal(await evaluate(state+'.playback.count'),3825);
  assert.equal(await evaluate(state+'.project.past.length'),1);await click(button('Undo'));assert.deepEqual(await present(),maximum);
  assert.deepEqual(await evaluate('window.__scoreQA.errors'),[]);
  pass('maximum 128-set/500-performer show retains bounded rulers and all 256 meter changes and marks remain editable, reachable and reversible');
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,audio,countIn:counted,source:manifest.source,scope:manifest.scope},null,2));app.exit(0);
 }catch(error){console.error(error);await fs.writeFile(path.join(output,'failure.txt'),error.stack);if(window)await capturePage(window,output,'failure.png').catch(()=>{});app.exit(1);}
});
