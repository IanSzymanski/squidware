'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, selectNativeOption, waitFor, waitForProgress, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--analysis-manifest=')).slice('--analysis-manifest='.length));
const { root, output, profile, bundle } = manifest;
const { analyzeTransition, createPerformanceFixture, fixture, findingName, performerLabels } = require(bundle);
app.disableHardwareAcceleration(); app.setPath('userData', profile);
const showWindow = BrowserWindow.prototype.show; BrowserWindow.prototype.show = function () {};
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure; const checks = [], metrics = {}, viewports = [];
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); window.webContents.on('render-process-gone', (_e, d) => { failure = new Error(d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source).catch(error => { throw Error(error.message+' · '+source.slice(0,250)); });
const qa = 'window.__analysisQA', editor = qa + '.editor', state = editor + '.getState()', analysis = qa+'.analysis', snapshot = analysis+'.getSnapshot()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 30000, failure: () => failure });
const frames = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  const qa = window.__analysisQA = { editor: null, analysis: null, workers: [], requests: [], errors: [], hold: false, failStart: false, queued: new Map() };
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) { if (qa.failStart) { qa.failStart=false; throw Error('Injected worker startup failure'); } super(...args); qa.workers.push(this); }
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
async function capture(name) { await evaluate("document.activeElement?.blur()");await capturePage(window,output,name);viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container')?.getBoundingClientRect().height})`)); }
async function openProblems() { await click('.problem-count-badge');await wait("!!document.querySelector('.problems-panel')",'problems dialog'); }
// Timeline problem row: each marker's rectangle, Tab state, visible badge and finding count (singles 1; groups lead with
// their size, after the badge when it abbreviates thousands).
const timelineRow = () => evaluate("[...document.querySelectorAll('.problem-track .problem-marker')].map(e=>{const r=e.getBoundingClientRect(),label=e.getAttribute('aria-label');return {label,tab:e.tabIndex,left:r.left,right:r.right,top:r.top,bottom:r.bottom,group:e.getAttribute('aria-haspopup')==='menu',expanded:e.getAttribute('aria-expanded'),badge:e.textContent.trim(),size:e.getAttribute('aria-haspopup')==='menu'?Number(/^(?:\\d+k\\+? · )?(\\d+) /.exec(label)[1]):1}})");
const focusedLabel = () => evaluate("document.activeElement?.getAttribute('aria-label')");
const focusReaches = label => wait(`document.activeElement?.getAttribute('aria-label')===${JSON.stringify(label)}`, 'keyboard focus '+label);
const named = /^(Spacing|Stride)( \S+ (yd|yd\/count|steps per 5 yd))? · \S.* · count \d+$|^(\d+k\+? · )?\d+ (spacing |stride )?problems( \(\d+ spacing, \d+ stride\))? · \S.* · counts? \d+(–\d+)?$/;
function rowGeometry(row, trackWidth) {
  assert.ok(row.length > 0 && row.length <= Math.ceil((trackWidth + 24) / 24), `bounded markers: ${row.length}`);
  assert.equal(row.filter(m => m.tab === 0).length, 1, 'one roving Tab stop'); assert.equal(row.filter(m => m.tab !== 0 && m.tab !== -1).length, 0);
  for (const [i, m] of row.entries()) {
    assert.ok(m.right - m.left >= 23.99 && m.bottom - m.top >= 23.99, `24 px target: ${JSON.stringify(m)}`);
    if (i) assert.ok(row[i - 1].right <= m.left + .5, `markers overlap: ${JSON.stringify([row[i - 1], m])}`);
    assert.match(m.label, named); assert.doesNotMatch(m.label, /Problem marker|\d\.\d+ count|count \d+\.\d/);
    // Label in Name (WCAG 2.5.3): a group's only visible text, its badge, starts its accessible name.
    if (m.group) assert.ok(m.badge && m.label.startsWith(m.badge), `visible badge in name: ${JSON.stringify(m)}`);
  }
}
// Group sizes stay inside their 24 px markers (no clipped digits).
const badgesFit = async () => assert.deepEqual(await evaluate("[...document.querySelectorAll('.problem-marker-count')].filter(e=>{const m=e.parentElement.getBoundingClientRect(),r=e.getBoundingClientRect();return r.left<m.left-.1||r.right>m.right+.1||e.scrollWidth>e.clientWidth+.5}).map(e=>e.textContent)"),[]);
async function tooltipInView(label) {
  await wait(`document.querySelector('.tooltip-panel')?.textContent.startsWith(${JSON.stringify(label)})`, 'marker keyboard help');
  const r = await evaluate("(()=>{const r=document.querySelector('.tooltip-panel').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}})()");
  assert.ok(r.left >= 0 && r.top >= 0 && r.right <= r.width && r.bottom <= r.height, `help stays in the viewport: ${JSON.stringify(r)}`);
}
async function close() {
  // Screenshots blur the focused control while the native pointer can still
  // hover Close. Restore dialog focus and park the pointer on the heading before
  // Escape; open help no longer consumes Escape, so one press closes the dialog.
  const point=await evaluate("(()=>{const d=document.querySelector('dialog');d.focus();const r=d.querySelector('h2').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await mouse('mouseMoved',point);
  await wait("!document.querySelector('dialog .tooltip-panel')",'dialog hover help dismissed');
  await key(window,'Escape');await wait("!document.querySelector('dialog')",'dialog closes');
}
async function mouse(type,point,extra={}) { await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,...extra}); }
async function startDrag() {
  await evaluate(`${editor}.dispatch('set.select',{index:1});${editor}.setValue('selection','selectedIds',['p0']);${editor}.setValue('ui','snap',false)`);await frames();
  const point=await evaluate("(()=>{const g=document.querySelector('[data-field-geometry]');const p=new DOMPoint(22,10).matrixTransform(g.getScreenCTM());return{x:p.x,y:p.y};})()");
  await mouse('mouseMoved',point);await mouse('mousePressed',point,{button:'left',clickCount:1});return point;
}
app.whenReady().then(async () => {
  try {
    await waitFor(()=>!!window,'window');await wait("!!document.querySelector('.set-card')",'renderer');
    window.setContentSize(1366,768);window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});window.webContents.reload();
    await wait(`!!${editor} && !!${analysis} && ${state}.preferences.status==='saved'`,'store, analysis and preferences');
    await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)",'recovery');
    const project=fixture();await evaluate(`${editor}.setValue('ui','dialog',null);${editor}.dispatch('project.load',{project:${JSON.stringify(project)}});${editor}.setValue('preferences','value',{...${state}.preferences.value,inspectorChecksOpen:true});${editor}.dispatch('set.select',{index:1})`);
    const moves=await oracle(), total=moves.reduce((n,m)=>n+m.issues.length,0);assert.ok(total>120);metrics.findings=total;
    await capture('problems-field-dark.png');assert.deepEqual([viewports.at(-1).width,viewports.at(-1).height],[1366,768]);assert.ok(viewports.at(-1).fieldHeight>=470);
    // Capture fixed-size layout before showing the window: macOS can constrain
    // visible windows to its desktop work area despite setContentSize(…,768).
    window.setContentSize(1120,768);await settleNativeViewport(window,'fixed narrow analysis');await capture('problems-field-narrow.png');
    assert.deepEqual([viewports.at(-1).width,viewports.at(-1).height],[1120,768]);assert.ok(viewports.at(-1).fieldHeight>=470);
    window.setContentSize(1366,768);await settleNativeViewport(window,'fixed analysis restored');
    await openProblems();assert.equal(await evaluate("document.querySelectorAll('.problem-result').length"),40);assert.match(await evaluate("document.querySelector('.problems-panel .problem-pagination').textContent"),new RegExp('of '+total+' matching'));
    await capture('problems-panel-dark.png');
    BrowserWindow.prototype.show=showWindow;window.show();window.focus();await frames();await settleNativeViewport(window,'visible analysis window');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
    const seen=await evaluate("[...document.querySelectorAll('.problem-result')].map(e=>e.textContent)");
    // Every page is reached with native keyboard input; no row is silently dropped.
    while(!await evaluate("document.querySelector('[aria-label=\"Next problems page\"]').getAttribute('aria-disabled')==='true'")) {
      await evaluate("document.querySelector('[aria-label=\"Next problems page\"]').focus()");await key(window,'Return');
      seen.push(...await evaluate("[...document.querySelectorAll('.problem-result')].map(e=>e.textContent)"));
    }
    assert.equal(seen.length,total);assert.equal(new Set(seen).size,total);
    await selectNativeOption(window,'[aria-label="Problem type"]','stride');await selectNativeOption(window,'[aria-label="Problem move"]','m1');
    assert.equal(await evaluate("document.querySelectorAll('.problem-result').length"),16);await selectNativeOption(window,'[aria-label="Problem sort"]','severity');
    await click('[aria-label="Find a problem"]');await window.webContents.debugger.sendCommand('Input.insertText',{text:'p15'});await frames();
    assert.equal(await evaluate("document.querySelectorAll('.problem-result').length"),1);assert.match(await evaluate("document.querySelector('.problem-result').textContent"),/Performer IDs: p15/);
    pass('all moves match the reference; every finding is reachable through native keyboard pagination, sorting, move/type filters and performer search');
    const row=moves[1].issues.find(i=>i.type==='stride'&&i.performerIds[0]==='p15');const before=await evaluate(`JSON.stringify(${state}.project)`);
    await click('.problem-result');await wait("!document.querySelector('dialog')",'finding navigation');
    assert.equal(await evaluate(state+'.playback.count'),row.atCount);assert.equal(await evaluate(state+'.selection.activeIndex'),2);assert.deepEqual(await evaluate(state+'.selection.selectedIds'),['p15']);
    assert.equal(await evaluate(`JSON.stringify(${state}.project)`),before);assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-problem-performer]')].map(e=>e.dataset.problemPerformer)"),['p15']);
    await capture('problems-selected.png');
    pass('finding input seeks the exact count, selects the right IDs and highlights paths without modifying project/history');
    // Timeline problem row: one Tab stop, 24 px targets, descriptive names, every finding reachable by keyboard.
    await evaluate(`${editor}.dispatch('set.select',{index:1});${editor}.setValue('selection','selectedIds',[])`);await frames();
    const trackWidth=await evaluate("document.querySelector('.problem-track').getBoundingClientRect().width");const markers=await timelineRow();rowGeometry(markers,trackWidth);await badgesFit();
    assert.equal(markers.reduce((n,m)=>n+m.size,0),total);assert.ok(markers.some(m=>m.group));
    assert.ok(await evaluate("(()=>{const r=document.querySelector('.problem-count-badge').getBoundingClientRect();return r.width>=24&&r.height>=24})()"));
    assert.equal(await evaluate("document.querySelector('.problem-track').getAttribute('role')"),'toolbar');
    await evaluate("[...document.querySelectorAll('.set-track > button')].at(-1).focus()");await key(window,'Tab');
    assert.ok(await evaluate("document.activeElement.matches('.problem-track .problem-marker[tabindex=\\'0\\']')"),'Tab enters the problem row');
    await key(window,'Tab');await focusReaches('Timeline playhead');await key(window,'Tab',['shift']);assert.ok(await evaluate("document.activeElement.matches('.problem-track .problem-marker')"));
    await key(window,'Home');await focusReaches(markers[0].label);await tooltipInView(markers[0].label);
    let reached=0;const unchanged=await evaluate(`JSON.stringify(${state}.project)`);
    for(const m of markers){
      await focusReaches(m.label);
      if(m.group){await key(window,'Return');await wait(`document.activeElement?.getAttribute('role')==='menuitem' && document.querySelector('.problem-track .problem-marker[aria-expanded=true]')?.getAttribute('aria-label')===${JSON.stringify(m.label)}`,'cluster list');
        const items=await evaluate("[...document.querySelectorAll('.problem-cluster-list [role=menuitem]')].map(e=>e.textContent)");assert.equal(items.length,m.size);reached+=items.length;
        await key(window,'Down');await wait(`document.activeElement?.textContent===${JSON.stringify(items[1])}`,'Down moves within the list');
        await key(window,'Escape');await wait(`!document.querySelector('.problem-cluster-list') && document.activeElement?.getAttribute('aria-label')===${JSON.stringify(m.label)}`,'Escape returns to the marker');
      } else reached++;
      await key(window,'Right');
    }
    await key(window,'End');await focusReaches(markers.at(-1).label);await tooltipInView(markers.at(-1).label);
    assert.equal(reached,total);assert.deepEqual(await evaluate(`${state}.selection.selectedIds`),[]);assert.equal(await evaluate(`JSON.stringify(${state}.project)`),unchanged);
    // Choosing from a group by keyboard and by pointer reviews that finding and returns focus to its marker.
    const group=markers.find(m=>m.group);await evaluate(`[...document.querySelectorAll('.problem-track .problem-marker')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(group.label)}).focus()`);
    await key(window,'Return');await wait("document.activeElement?.getAttribute('role')==='menuitem'",'cluster list');await key(window,'End');await wait("document.activeElement===[...document.querySelectorAll('.problem-cluster-list [role=menuitem]')].at(-1)",'End reaches the last finding');const last=await evaluate("document.activeElement.textContent");await key(window,'Return');
    await wait(`!document.querySelector('.problem-cluster-list') && ${snapshot}.selected!==null && document.activeElement?.getAttribute('aria-label')===${JSON.stringify(group.label)}`,'keyboard group choice');
    const chosen=await evaluate(snapshot+'.selected'),labels=performerLabels(project);assert.ok(last.startsWith(findingName(chosen.issue,labels)),last);
    assert.equal(await evaluate(state+'.playback.count'),chosen.issue.atCount);assert.deepEqual(await evaluate(state+'.selection.selectedIds'),chosen.issue.performerIds);assert.ok(await evaluate("document.querySelectorAll('[data-problem-performer]').length>0"));
    await evaluate(`${editor}.dispatch('set.select',{index:1})`);await frames();
    await click('.problem-track .problem-marker[aria-haspopup=menu]');await wait("!!document.querySelector('.problem-cluster-list [role=menuitem]')",'pointer cluster list');await capture('problems-timeline-group.png');
    const firstItem=await evaluate("document.querySelector('.problem-cluster-list [role=menuitem]').textContent");await click('.problem-cluster-list [role=menuitem]');
    await wait(`!document.querySelector('.problem-cluster-list') && ${snapshot}.selected!==null`,'pointer group choice');assert.ok(firstItem.startsWith(findingName((await evaluate(snapshot+'.selected')).issue,labels)));
    assert.equal(await evaluate(state+'.playback.count'),(await evaluate(snapshot+'.selected')).issue.atCount);
    pass('the problem row is one Tab stop of non-overlapping 24 px markers named by type, performers and whole count; arrows reach every finding, groups list theirs, Escape returns and choices seek and select');
    // Escape in a group list closes only the list, also in focus mode and over a tucked-panel overlay (the workspace
    // handles Escape in the capture phase); the next Escape then belongs to the workspace.
    await evaluate(`${editor}.dispatch('set.select',{index:1});${analysis}.clearSelection()`);await frames();
    async function escapeFromGroup(label) {
      const marker=await evaluate("document.querySelector('.problem-track .problem-marker[aria-haspopup=menu]').getAttribute('aria-label')");
      await evaluate(`[...document.querySelectorAll('.problem-track .problem-marker')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(marker)}).focus()`);await key(window,'Return');
      await wait("document.activeElement?.getAttribute('role')==='menuitem'",label+' group list');await key(window,'Escape');
      await wait(`!document.querySelector('.problem-cluster-list') && document.activeElement?.getAttribute('aria-label')===${JSON.stringify(marker)}`,label+': Escape returns to the group marker');
    }
    await evaluate(`${editor}.dispatch('layout.focus')`);await wait(`${state}.ui.focusMode && !!document.querySelector('.studio--focus')`,'focus mode');await frames();
    await escapeFromGroup('focus mode');assert.equal(await evaluate(`${state}.ui.focusMode`),true,'Escape in the list keeps focus mode');
    await key(window,'Escape');await wait(`!${state}.ui.focusMode`,'the next Escape exits focus mode');await frames();
    window.setContentSize(900,650);await settleNativeViewport(window,'tucked analysis layout');
    await click('[aria-label="Show Set list"]');await wait("!!document.querySelector('.workspace-pane--overlay[data-pane=sets]')",'Set list overlay');
    await escapeFromGroup('overlay');assert.ok(await evaluate("!!document.querySelector('.workspace-pane--overlay[data-pane=sets]')"),'Escape in the list keeps the overlay');
    await key(window,'Escape');await wait("!document.querySelector('.workspace-pane--overlay')",'the next Escape closes the overlay');
    // A layout change closes an open list instead of leaving it over a moved marker; focus stays on the row.
    await evaluate("document.querySelector('.problem-track .problem-marker[aria-haspopup=menu]').focus()");await key(window,'Return');await wait("document.activeElement?.getAttribute('role')==='menuitem'",'group list before focus mode');
    await evaluate(`${editor}.dispatch('layout.focus')`);await wait(`${state}.ui.focusMode && !document.querySelector('.problem-cluster-list') && document.activeElement?.matches('.problem-track .problem-marker')`,'focus mode closes the list and keeps focus on the row');
    await evaluate(`${editor}.dispatch('layout.focus')`);await wait(`!${state}.ui.focusMode`,'focus mode restored');
    window.setContentSize(1366,768);await settleNativeViewport(window,'analysis window restored');
    pass('Escape in a group list returns to its marker in focus mode and over a tucked-panel overlay before the workspace handles Escape; layout changes close an open list and keep focus in the row');
    // Native drag: cancel with Escape, then repeat and commit one history entry.
    let point=await startDrag();const baseline=await evaluate(`JSON.stringify(${state}.project)`);
    await evaluate(`${qa}.hold=true`);await mouse('mouseMoved',{x:point.x+40,y:point.y+50},{button:'left',buttons:1});
    await wait("document.querySelector('[data-draft-analysis-status]')?.dataset.draftAnalysisStatus==='pending'",'pending drag');
    assert.equal(await evaluate("document.querySelectorAll('[data-problem-performer]').length"),0);assert.equal(await evaluate(`JSON.stringify(${state}.project)`),baseline);
    await capture('problems-drag-pending.png');await evaluate(`${qa}.release()`);await wait("document.querySelector('[data-draft-analysis-status]')?.dataset.draftAnalysisStatus==='ready'",'draft checks');
    assert.equal(await evaluate(snapshot+'.draft.results.length'),2);await capture('problems-drag-ready.png');
    const requestCount=await evaluate(qa+'.requests.length');
    for(let i=0;i<20;i++)await mouse('mouseMoved',{x:point.x+40+i,y:point.y+50},{button:'left',buttons:1});
    assert.ok((await evaluate(qa+'.requests.length'))-requestCount<25,'draft worker snapshots are throttled');
    await evaluate("document.querySelector('.field-stage__svg').focus()");await key(window,'Escape');await mouse('mouseReleased',{x:point.x+60,y:point.y+50},{button:'left',clickCount:1});
    await wait(`${snapshot}.draft===null`,'cancel clears draft');assert.equal(await evaluate(`JSON.stringify(${state}.project)`),baseline);
    point=await startDrag();const past=await evaluate(state+'.project.past.length');
    await mouse('mouseMoved',{x:point.x+30,y:point.y+50},{button:'left',buttons:1});await mouse('mouseReleased',{x:point.x+30,y:point.y+50},{button:'left',clickCount:1});await oracle();
    assert.equal(await evaluate(state+'.project.past.length'),past+1);assert.equal(await evaluate(snapshot+'.draft'),null);
    await evaluate(`${editor}.dispatch('history.undo')`);await oracle();assert.deepEqual(await evaluate(state+'.project.present.sets'),project.sets);
    pass('native drags check both adjacent moves in an isolated throttled worker; pending previews hide old overlays, Escape cancels and commit/undo retains one edit');
    // Make worker failure observable while a current move is awaiting delivery.
    await evaluate(`${editor}.dispatch('set.select',{index:1});${qa}.hold=true;${editor}.dispatch('positions.move',{index:1,updates:{p0:{x:24,y:20}}})`);
    await wait(`${qa}.queued.size>0`,'held committed request');await evaluate(`${qa}.workers[0].onmessageerror(new MessageEvent('messageerror'));${qa}.release()`);
    await wait(`${snapshot}.moves.some(m=>m.status==='error') && !${snapshot}.moves.some(m=>m.status==='pending')`,'unavailable move');await openProblems();await capture('problems-unavailable.png');
    await evaluate(`${qa}.workers.at(-1).onmessageerror(new MessageEvent('messageerror'));${qa}.failStart=true`);await click('[aria-label="Retry show checks"]');await wait("document.querySelector('.problems-panel').textContent.includes('could not start')",'startup failure');
    await evaluate("document.querySelector('[aria-label=\"Retry show checks\"]').focus()");await key(window,'Return');await oracle();await close();
    pass('decode and startup failures remain visible as unavailable moves and native keyboard retry recovers without synchronous analysis');
    // Large show, rapid edits, undo and replacement: no whole-show worker clone.
    const maximum=createPerformanceFixture('maximum');const started=Date.now();
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(maximum)}});${editor}.dispatch('set.select',{index:1})`);await ready();metrics.maximumShowMs=Date.now()-started;
    assert.equal(await evaluate(snapshot+'.moves.length'),127);const maxMoves=await evaluate(snapshot+'.moves');for(const i of [1,64,127])assert.deepEqual(maxMoves[i-1].issues,analyzeTransition(maximum,i));
    const id=maximum.performers[0].id;
    await evaluate(`new Promise(resolve=>{const times=[];let frame=0;function tick(){const t=performance.now();${editor}.dispatch('positions.move',{index:1,updates:{[${JSON.stringify(id)}]:{x:42+(frame%8)*.125,y:20}}});times.push(performance.now()-t);if(++frame<30)setTimeout(tick,0);else{${qa}.dispatchTimes=times;resolve();}}tick();})`);await ready();
    const current=await evaluate(state+'.project.present');for(const i of [1,2,127])assert.deepEqual(await evaluate(`${snapshot}.moves[${i-1}].issues`),analyzeTransition(current,i));metrics.rapidEditDispatchMs=await evaluate(qa+'.dispatchTimes');
    assert.equal(await evaluate(`${qa}.requests.filter(r=>r.input).every(r=>r.input.tracks.length<=500 && !r.input.sets)`),true);
    const maximumTotal=await evaluate(`${snapshot}.moves.reduce((n,m)=>n+m.issues.length,0)`),maximumRow=await timelineRow();
    if(maximumTotal){rowGeometry(maximumRow,await evaluate("document.querySelector('.problem-track').getBoundingClientRect().width"));await badgesFit();assert.equal(maximumRow.reduce((n,m)=>n+m.size,0),maximumTotal);}metrics.maximum={findings:maximumTotal,markers:maximumRow.length};
    // Choosing from a group beside Cast returns to Design and the Inspector: the track widens and dense groups regroup,
    // replacing the focused marker. Keyboard focus stays on the row's remembered marker, never the document body.
    assert.ok(maximumRow.filter(m=>m.group).length>=4,'dense maximum groups');
    const designWidth=await evaluate("document.querySelector('.problem-track').getBoundingClientRect().width");let regrouped=0;
    for(const index of [1,2,3]){
      await evaluate(`${editor}.dispatch('cast.show',{mode:'panel'})`);await wait(`${state}.ui.castPanelOpen && document.querySelector('.problem-track').getBoundingClientRect().width<${designWidth}`,'Cast beside the field');await frames();
      await evaluate(`(()=>{const m=[...document.querySelectorAll('.problem-track .problem-marker[aria-haspopup=menu]')][${index}];window.__chosenMarker=m;m.focus();})()`);await key(window,'Return');
      await wait("document.activeElement?.getAttribute('role')==='menuitem'",'group list beside Cast');await key(window,'Return');
      await wait(`!${state}.ui.castPanelOpen && ${snapshot}.selected!==null && !document.querySelector('.problem-cluster-list') && document.querySelector('.problem-track').getBoundingClientRect().width===${designWidth}`,'review from Cast');await frames();await frames();
      regrouped+=await evaluate('Number(!window.__chosenMarker.isConnected)');
      assert.ok(await evaluate("document.activeElement?.matches('.problem-track .problem-marker[tabindex=\"0\"]')"),`focus stays on the problem row: ${await evaluate("document.activeElement?.outerHTML.slice(0,120)")}`);
      await evaluate(`${analysis}.clearSelection();${editor}.dispatch('set.select',{index:1})`);await frames();
    }
    assert.ok(regrouped>0,'reviews from Cast regroup the row');metrics.castReviewsRegrouped=regrouped;
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}});${editor}.dispatch('set.select',{index:1})`);await oracle();
    pass('127 moves with 500 performers complete with bounded DOM markers whose names start with their badges; choosing from Cast keeps focus in the regrouped row; rapid edits and same-ID project replacement keep reference-correct results');
    await openProblems();for(const theme of ['light','high-contrast']){await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);await capture(`problems-${theme}.png`);}
    await close();
    window.setContentSize(1024,720);window.webContents.setZoomFactor(1.25);await settleNativeViewport(window,'enlarged analysis');await openProblems();await capture('problems-enlarged.png');
    await evaluate("document.querySelector('[aria-label=\"Next problems page\"]').focus()");await key(window,'Return');assert.ok(await evaluate("(()=>{const r=document.activeElement.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"));await close();
    assert.deepEqual(await evaluate(qa+'.errors'),[]);pass('supported themes, narrow field layout, enlarged text, keyboard focus and modal dismissal remain usable');
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,metrics,viewports,source:manifest.source,runtime:manifest.runtime},null,2));app.exit(0);
  } catch(error) { console.error(error);if(window)console.error('Worker progress',await evaluate(`({expected:${state}.project.present.moves.length,moves:${snapshot}.moves.map(m=>({index:m.index,status:m.status,error:m.error})),requests:${qa}.requests.length})`).catch(()=>null));if(window)await capture('failure.png').catch(()=>{});await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,metrics,viewports,error:error.stack},null,2));app.exit(1); }
});
