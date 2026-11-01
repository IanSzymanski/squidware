'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, selectNativeOption, waitFor, waitForProgress, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--detailed-analysis-manifest=')).slice('--detailed-analysis-manifest='.length));
const { root, output, profile, bundle } = manifest;
const { analyzeTransition, parseProject, sampleProject, fixture } = require(bundle);
app.disableHardwareAcceleration(); app.setPath('userData', profile);
const showWindow = BrowserWindow.prototype.show; BrowserWindow.prototype.show = function () {};
dialog.showMessageBox = async () => ({ response: 1 });
const savedFile=path.join(output,'detailed.squid');dialog.showSaveDialog=async()=>({canceled:false,filePath:savedFile});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[savedFile]});
let window, failure; const checks = [], metrics = {}, viewports = [];
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); window.webContents.on('render-process-gone', (_e, d) => { failure = new Error(d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source).catch(error => { throw Error(error.message+' · '+source.slice(0,250)); });
const qa = 'window.__detailedQA', editor = qa + '.editor', state = editor + '.getState()', analysis = qa+'.analysis', snapshot = analysis+'.getSnapshot()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 30000, failure: () => failure });
const frames = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  const qa = window.__detailedQA = { editor: null, analysis: null, workers: [], requests: [], responses: [], errors: [], hold: false, failStart: false, queued: new Map() };
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) { if (qa.failStart) { qa.failStart=false; throw Error('Injected worker startup failure'); } super(...args); qa.workers.push(this);this.addEventListener('message',event=>qa.responses.push(event.data)); }
    postMessage(message) { qa.requests.push(message); if(qa.hold)qa.queued.set(this,message); else super.postMessage(message); }
  };
  qa.release = () => { qa.hold=false; for(const [worker,message] of qa.queued)NativeWorker.prototype.postMessage.call(worker,message);qa.queued.clear(); };
  window.addEventListener('error', event => qa.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => qa.errors.push(String(event.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) qa.editor = v; if(v?.getSnapshot && v?.draft && v?.retry)qa.analysis=v;visit(f.child);visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
const ready = () => waitForProgress(async () => {
  const progress = await evaluate(`({expected:${state}.project.present.moves.length,moves:${snapshot}.moves.map(m=>({index:m.index,status:m.status,error:m.error}))})`);
  const failed = progress.moves.find(m => m.status === 'error');
  const completed = progress.moves.filter(m => m.status === 'ready').length;
  return { done: progress.moves.length === progress.expected && completed === progress.expected, progress: completed,
    error: failed ? `move ${failed.index}: ${failed.error}` : undefined };
}, 'whole-show worker results', { idleTimeoutMs: 30000, timeoutMs: 120000, failure: () => failure });
async function oracle() { await ready(); const p=await evaluate(state+'.project.present'), moves=await evaluate(snapshot+'.moves'); for(const m of moves)assert.deepEqual(m.issues,analyzeTransition(p,m.index)); return moves; }
async function click(selector) {
  const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Unavailable '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});await frames();
}
async function capture(name) { await evaluate(`${editor}.setValue('ui','toast','');document.activeElement?.blur()`);await mouse('mouseMoved',{x:0,y:0});await capturePage(window,output,name);viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container')?.getBoundingClientRect().height})`)); }
async function openProblems() { await click('[aria-label="Timeline problems"]');await wait("!!document.querySelector('.problems-panel')",'problems dialog'); }
async function close() {
  // Screenshots blur the focused control while the native pointer can still
  // hover Close. Clear that help and restore dialog focus before testing Escape;
  // an open tooltip deliberately consumes Escape without closing its dialog.
  const point=await evaluate("(()=>{const d=document.querySelector('dialog');d.focus();const r=d.querySelector('h2').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await mouse('mouseMoved',point);
  await wait("!document.querySelector('dialog .tooltip-panel')",'dialog hover help dismissed');
  await key(window,'Escape');await wait("!document.querySelector('dialog')",'dialog closes');
}
async function mouse(type,point,extra={}) { await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,...extra}); }

const named=label=>`[aria-label=${JSON.stringify(label)}]`;
async function load(p){await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(p)}})`);await ready();}
async function type(label,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(named(label))});e.focus();e.select();})()`);await window.webContents.debugger.sendCommand('Input.insertText',{text:String(value)});await frames();}
app.whenReady().then(async()=>{try{
 await waitFor(()=>!!window,'window');await wait("!!document.querySelector('.set-card')",'renderer');window.setContentSize(1366,768);window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Page.enable');await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});window.webContents.reload();await wait(`!!${editor}&&!!${analysis}&&${state}.preferences.status==='saved'`,'providers');await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)",'recovery');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 const p=fixture();await load(p);await evaluate(`${editor}.dispatch('set.select',{index:1})`);await capture('detailed-before.png');assert.deepEqual([viewports.at(-1).width,viewports.at(-1).height],[1366,768]);assert.ok(viewports.at(-1).fieldHeight>=470);BrowserWindow.prototype.show=showWindow;window.show();window.focus();await settleNativeViewport(window,'visible detailed analysis');
 const moves=await oracle();metrics.crossing=moves[0].issues;assert.equal(metrics.crossing.find(i=>i.type==='collision').certainty,'confirmed');
 await openProblems();await selectNativeOption(window,named('Problem type'),'collision');await capture('detailed-confirmed.png');assert.match(await evaluate("document.querySelector('.problem-result').textContent"),/Confirmed violation.*Show counts/s);await click('.problem-result');await wait(`${state}.ui.dialog===null`,'finding seek');await frames();assert.equal(await evaluate(state+'.playback.count'),4);assert.deepEqual(await evaluate(state+'.selection.selectedIds'),['a','b']);assert.equal(await evaluate("document.querySelector('[data-problem-performer=a] path').getAttribute('d')"),'M 10 10 C 10 30 30 30 30 10');for(const id of ['a','b']){assert.equal(await evaluate(`document.querySelector('[data-performer-id=${id}]').getAttribute('transform')`),'translate(20 25)');assert.deepEqual(await evaluate(`(()=>{const c=document.querySelector('[data-problem-performer=${id}] circle');return [Number(c.getAttribute('cx')),Number(c.getAttribute('cy'))]})()`),[20,25]);}await capture('detailed-selected.png');
 await click(named('Play show'));await wait(`${state}.playback.count>4.5`,'live curved playback');await click(named('Pause playback'));await frames();const count=await evaluate(state+'.playback.count'),expected=sampleProject(p,count).positions.a;assert.equal(await evaluate("document.querySelector('[data-performer-id=a]').getAttribute('transform')"),`translate(${expected.x} ${expected.y})`);pass('worker/reference bounds detect the curved crossing; native finding seeks, full vector overlays and live playback share exact geometry');
 await evaluate(`${editor}.dispatch('set.select',{index:1});${editor}.setValue('selection','selectedIds',['a'])`);await frames();await click(named('Edit performer path'));await wait(`${state}.ui.dialog==='path'`,'path editor');await type('Control 1 Y',31);await evaluate(`${qa}.hold=true`);await click(named('Apply performer path'));await wait(`${snapshot}.moves[0].status==='pending'`,'path invalidation');assert.equal(await evaluate(snapshot+'.moves[0].issues.length'),0);assert.equal(await evaluate("document.querySelectorAll('[data-problem-performer]').length"),0);await capture('detailed-pending.png');await evaluate(qa+'.release()');await oracle();assert.equal(await evaluate(`${qa}.responses.filter(r=>r.result).at(-1).result.stats.mode`),'incremental');assert.equal(await evaluate(`${qa}.responses.filter(r=>r.result).at(-1).result.stats.changedPerformers`),1);
 const edited=await evaluate(state+'.project.present');await evaluate(`${editor}.dispatch('history.undo')`);await oracle();assert.deepEqual(await evaluate(state+'.project.present'),p);await evaluate(`${editor}.dispatch('history.redo')`);await oracle();await evaluate(`${editor}.dispatch('file.save')`);await wait(`${state}.fileSession.savedRevision===${state}.project.revision`,'native save');assert.deepEqual(parseProject(await fs.readFile(savedFile,'utf8')),edited);await evaluate(`${editor}.dispatch('file.open')`);await wait(`${state}.project.past.length===0`,'native reopen');await oracle();assert.deepEqual(await evaluate(state+'.project.present'),edited);pass('native control edit clears stale flags/overlays, recomputes one track incrementally and retains findings through undo/redo and native save/reopen');
 await load(fixture('fast'));await evaluate(`${editor}.dispatch('set.select',{index:1})`);const fast=(await oracle())[0].issues;assert.ok(fast.some(i=>i.type==='stride'&&i.certainty==='confirmed'&&i.measurement.lower>1000));assert.ok(Math.abs(fast.find(i=>i.type==='collision').atCount-.115)<1e-8);metrics.fast=fast;await openProblems();await capture('detailed-fast.png');await close();
 await load(fixture('unresolved'));await evaluate(`${editor}.dispatch('set.select',{index:1})`);await openProblems();assert.match(await evaluate("document.querySelector('.problems-panel').textContent"),/Bounds remain unresolved/);await capture('detailed-unresolved.png');await close();
 await load(fixture('possible'));await evaluate(`${editor}.dispatch('set.select',{index:1})`);metrics.possible=(await oracle())[0].issues;assert.equal(metrics.possible[0].certainty,'possible');for(const theme of ['dark','light','high-contrast']){await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);await openProblems();await capture('detailed-'+theme+'.png');assert.match(await evaluate("document.querySelector('.problem-bound').textContent"),/Possible violation/);await close();}
 window.setContentSize(1024,720);window.webContents.setZoomFactor(1.5);await settleNativeViewport(window,'enlarged detailed problems');await openProblems();await evaluate("document.querySelector('.problem-result').focus();document.activeElement.scrollIntoView({block:'nearest'})");await capture('detailed-enlarged.png');await evaluate("document.querySelector('.problem-result').focus()");await wait("document.querySelector('dialog [role=tooltip]')?.textContent.includes('Review show counts')",'keyboard range help');await key(window,'Return');await wait(`${state}.ui.dialog===null`,'enlarged keyboard review');assert.equal(await evaluate(snapshot+'.selected.issue.certainty'),'possible');pass('fast fractional submoves report peak stride and between-count crossings; tangent uncertainty is explicit in three themes and enlarged native keyboard review');
 window.webContents.setZoomFactor(1);window.setContentSize(1366,768);await settleNativeViewport(window,'maximum detailed window');const max=fixture('maximum');await evaluate(`${qa}.responses=[];${qa}.frameCount=0;${qa}.frameGaps=[];${qa}.lastFrame=performance.now();${qa}.tick=()=>{const now=performance.now();${qa}.frameGaps.push(now-${qa}.lastFrame);${qa}.lastFrame=now;${qa}.frameCount++;${qa}.frame=requestAnimationFrame(${qa}.tick)};${qa}.frame=requestAnimationFrame(${qa}.tick);${editor}.dispatch('project.load',{project:${JSON.stringify(max)}})`);await frames();await click(named('Next set'));assert.equal(await evaluate(state+'.selection.activeIndex'),1);assert.equal(await evaluate(`${snapshot}.moves.some(m=>m.status==='pending')`),true);await ready();await evaluate(`cancelAnimationFrame(${qa}.frame)`);const actual=await evaluate(snapshot+'.moves[0].issues');assert.deepEqual(actual,analyzeTransition(max,1));metrics.maximum=await evaluate(`({frames:${qa}.frameCount,maxFrameGap:Math.max(...${qa}.frameGaps),responses:${qa}.responses.filter(r=>r.result).map(r=>({stats:r.result.stats,issues:r.result.issues.length}))})`);assert.ok(metrics.maximum.frames>2);assert.equal(await evaluate(snapshot+'.moves.length'),127);await capture('detailed-maximum.png');assert.deepEqual(await evaluate(qa+'.errors'),[]);pass('500 performers and 128 pictures complete in real workers while native set input and renderer frames continue');
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,metrics,viewports,source:manifest.source,scope:manifest.scope},null,2));app.exit(0);
}catch(error){console.error(error);console.error(await evaluate(`({dialog:${state}.ui.dialog,toast:${state}.ui.toast,moves:${snapshot}.moves.map(m=>({index:m.index,status:m.status,error:m.error}))})`).catch(()=>null));await capturePage(window,output,'failure.png').catch(()=>{});await fs.writeFile(path.join(output,'failure.txt'),error.stack);app.exit(1);}});
