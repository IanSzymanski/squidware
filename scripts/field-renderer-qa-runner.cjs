'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
process.on('uncaughtException', error => { console.error(error); app.exit(1); });
process.on('unhandledRejection', error => { console.error(error); app.exit(1); });
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const manifest = require(process.argv.find(arg => arg.startsWith('--field-renderer-manifest=')).slice('--field-renderer-manifest='.length));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = manifest.profile;
app.setPath('userData', profile);
app.on('window-all-closed', () => {});
// This component harness uses the production desktop recovery backend. Full
// main/preload trust enforcement is separately covered by desktop/editor QA.
const recovery = require(path.join(manifest.root, 'electron/recovery-service.cjs')).createRecoveryService(path.join(profile, 'recovery'));
const preferences = require(path.join(manifest.root, 'electron/preferences-service.cjs')).createPreferencesService(profile, async (filename, content) => {
  // Ordered preference writes use an isolated atomic replacement in this component harness.
  const temporary = filename + '.qa-temporary';
  await fs.writeFile(temporary, content); await fs.rename(temporary, filename);
});
const appUrl = pathToFileURL(path.join(manifest.appBuild, 'index.html')).href;
for (const [channel, action] of [
  ['read-template-library', () => ({version:1,templates:[]})],
  ['read-preferences', () => preferences.read()], ['save-preferences', value => preferences.save(value)], ['reset-preferences', () => preferences.reset()],
  ['begin-recovery', () => recovery.begin()], ['list-recoveries', token => recovery.list(token)],
  ['read-recovery', (token, id) => recovery.read(token, id)],
  ['write-recovery', (token, sequence, revision, project) => recovery.write(token, sequence, revision, project)],
  ['migrate-recovery', (token, content) => recovery.migrate(token, content)],
]) ipcMain.handle(`squidware:${channel}`, async (event, ...args) => {
  if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== appUrl) throw new Error('Untrusted QA frame.');
  return action(...args);
});

function instrument(project) {
  const qa = window.__fieldQA = { editor: null, errors: [], frames: [] };
  window.addEventListener('error', e => qa.errors.push(e.message));
  window.addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) {
      if (qa.editor) return;
      function visit(f) {
        if (!f) return;
        const value = f.memoizedProps?.value;
        if (value?.getState && value?.dispatch) { qa.editor = value; if (!qa.loaded) { qa.loaded = true; queueMicrotask(() => value.dispatch('project.load', {project})); } }
        visit(f.child); visit(f.sibling);
      } visit(root.current);
    }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
const summarize = values => { const sorted = [...values].sort((a,b)=>a-b); return { samples: sorted.length, median: sorted[Math.floor(sorted.length*.5)], p95: sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))] }; };
async function run(fixture) {
  const window = new BrowserWindow({ width:1366,height:768,show:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:path.join(manifest.root,'electron/preload.cjs'),backgroundThrottling:false} });
  await window.loadURL('about:blank'); window.webContents.debugger.attach('1.3');
  const command = (method,args) => window.webContents.debugger.sendCommand(method,args);
  const evaluate = source => window.webContents.executeJavaScript(source);
  const { waitFor } = require('./testing/renderer.cjs');
  const wait = (source,label) => waitFor(()=>evaluate(source),label,{timeoutMs:20000});
  const editor = 'window.__fieldQA.editor'; const state = editor+'.getState()';
  const dispatch = (id,args) => evaluate(`${editor}.dispatch(${JSON.stringify(id)},${JSON.stringify(args)})`);
  const reports = [];
  try {
    await command('Page.enable'); await command('Performance.enable'); await command('Emulation.setFocusEmulationEnabled',{enabled:true});
    await command('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})(${JSON.stringify(fixture.project)})`});
    await window.loadURL(appUrl);
    await wait(`document.querySelectorAll('.field-performer').length===${fixture.project.performers.length} && !!${editor}`,'fixture');
    await evaluate(`${editor}.setValue('ui','dialog',null)`); window.setContentSize(1366,768); await require('./testing/renderer.cjs').settleNativeViewport(window); await pause(1500);
    for (const rate of manifest.profileWorkloads ? [1,4] : []) {
      await command('Emulation.setCPUThrottlingRate',{rate});
      for (const workload of ['scrub','playback','drag','resize']) {
        await dispatch('set.select',{index:0}); await pause(150);
        await evaluate(`${editor}.setValue('selection','selectedIds',${JSON.stringify(fixture.project.performers.map(p=>p.id))}); ${editor}.setValue('ui','snap',false)`);
        const point = await evaluate("(()=>{const n=[...document.querySelectorAll('.field-performer')].at(-1);const p=new DOMPoint(0,0).matrixTransform(n.getScreenCTM());return{x:p.x,y:p.y}})()");
        const mouse = args => command('Input.dispatchMouseEvent',args);
        if(workload==='drag') { assert.equal(await evaluate("document.querySelector('.field-stage').classList.contains('field-stage--readonly')"),false,'editable drag'); await mouse({type:'mouseMoved',...point}); await mouse({type:'mousePressed',...point,button:'left',buttons:1,clickCount:1}); }
        if(workload==='playback') await dispatch('playback.toggle');
        if(workload==='resize') await dispatch('playback.scrub',{count:4.25});
        // Warm up real geometry, font/path caches, and two compositor opportunities.
        if(workload==='scrub') for(let i=0;i<8;i++) await dispatch('playback.scrub',{count:2+i/8});
        await pause(250);
        if(workload==='playback' && fixture.name==='maximum' && rate===1) { await command('Profiler.enable'); await command('Profiler.start'); }
        const metricsBefore = (await command('Performance.getMetrics')).metrics;
        await evaluate(`window.__fieldQA.frames=[]; window.__fieldQA.measure=true; (()=>{let last=performance.now(); function tick(now){if(!window.__fieldQA.measure)return; window.__fieldQA.frames.push(now-last);last=now;requestAnimationFrame(tick)}requestAnimationFrame(tick)})()`);
        const elapsed=[];
        for(let i=0;i<48;i++) {
          const start=performance.now();
          if(workload==='scrub') await dispatch('playback.scrub',{count:3+i/16});
          if(workload==='drag') await mouse({type:'mouseMoved',x:point.x+8+i*.6,y:point.y+5+Math.sin(i/8)*5,button:'left',buttons:1});
          if(workload==='resize') window.setContentSize(1366-(i%2)*100,768+(i%2)*30);
          await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
          elapsed.push(performance.now()-start);
        }
        const metricsAfter=(await command('Performance.getMetrics')).metrics;
        if(workload==='playback' && fixture.name==='maximum' && rate===1) { const {profile}=await command('Profiler.stop'); await fs.writeFile(path.join(manifest.output,'maximum-playback.cpuprofile'),JSON.stringify(profile)); }
        const frames=await evaluate('window.__fieldQA.measure=false; window.__fieldQA.frames.slice(2)');
        const metric = name => metricsAfter.find(m=>m.name===name).value-metricsBefore.find(m=>m.name===name).value;
        const report={fixture:fixture.name,cpuRate:rate,workload,twoRafMs:summarize(elapsed),rafIntervalMs:summarize(frames),taskMsPerOpportunity:metric('TaskDuration')*1000/(frames.length+2),scriptMsPerOpportunity:metric('ScriptDuration')*1000/(frames.length+2),layoutMsPerOpportunity:metric('LayoutDuration')*1000/(frames.length+2)};
        reports.push(report); console.log(JSON.stringify(report));
        if(workload==='drag') { assert.equal(await evaluate("!!document.querySelector('[data-snap-preview]')"),true,'actual drag preview'); await mouse({type:'mouseReleased',x:point.x+36,y:point.y+5,button:'left',clickCount:1}); await dispatch('history.undo');}
        if(workload==='playback') await dispatch('playback.toggle');
        window.setContentSize(1366,768);
      }
    }
    await command('Emulation.setCPUThrottlingRate',{rate:1});
    await dispatch('set.select',{index:0}); await evaluate(`${editor}.setValue('selection','selectedIds',[${JSON.stringify(fixture.project.performers[0].id)}])`); await pause(200);
    await fs.writeFile(path.join(manifest.output,`${fixture.name}.png`),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
    if(manifest.baseline) {
      await dispatch('playback.scrub',{count:4.25});
      await evaluate(`${editor}.setValue('selection','selectedIds',[${JSON.stringify(fixture.project.performers[1].id)}]); document.querySelector('.field-performer').focus()`);
      for(const type of ['keyDown','keyUp']) await command('Input.dispatchKeyEvent',{type,key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
      await evaluate('document.activeElement.blur()'); await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
      await require('./testing/renderer.cjs').capturePage(window,manifest.output,fixture.name+'-baseline.png');
    }
    const correctness = manifest.baseline ? null : await require('./testing/field-canvas.cjs')({window,evaluate,command,dispatch,state,editor,fixture,output:manifest.output,wait});
    assert.deepEqual(await evaluate('window.__fieldQA.errors'),[]);
    return {reports, correctness};
  } finally {window.destroy();}
}
app.whenReady().then(async()=>{
  try { const reports=[],checks=[]; for(const fixture of manifest.fixtures) {const result=await run(fixture); reports.push(...result.reports); if(result.correctness)checks.push({fixture:fixture.name,...result.correctness});} await fs.writeFile(path.join(manifest.output,'results.json'),JSON.stringify({...manifest,reports,checks,note:'Sequential software-host CDP CPU rate 1/4; 8 scrub warmups, 48 samples per workload. Two-rAF includes two compositor opportunities; CDP TaskDuration includes all renderer main-thread tasks.'},null,2));app.exit(0); }
  catch(error){console.error(error);app.exit(1);}
});
