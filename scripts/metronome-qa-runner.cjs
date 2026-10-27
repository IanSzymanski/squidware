'use strict';
const assert = require('node:assert/strict');
const { app, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, selectNativeOption, waitFor, pause, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--metronome-manifest=')).slice('--metronome-manifest='.length));
const { root, output, profile, recording } = manifest;
app.disableHardwareAcceleration(); app.setPath('userData', profile);
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure; const checks = [], measurements = [], viewports = [];
app.on('browser-window-created', (_event, w) => { window = w; w.webContents.setBackgroundThrottling(false); w.webContents.on('render-process-gone', (_e,d) => { failure = new Error(d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const qa = 'window.__clickQA', editor = qa + '.editor', state = editor + '.getState()';
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { timeoutMs: 20000, failure: () => failure });
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  const qa = window.__clickQA = { editor: null, clicks: [], nodes: [], errors: [] };
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
async function click(label) {
  const rect = await evaluate(`(() => {const n=[...document.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')===${JSON.stringify(label)}||n.textContent.trim()===${JSON.stringify(label)}); if(!n)throw new Error('Missing button '+${JSON.stringify(label)});n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for (const type of ['mouseMoved','mousePressed','mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...rect, ...(type === 'mouseMoved' ? {} : { button:'left',clickCount:1 }) });
}
async function capture(name) {
  await evaluate(`${editor}.setValue('ui','toast',''); document.activeElement?.blur()`);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type:'mouseMoved',x:0,y:0 });
  await capturePage(window, output, name);
  viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container').getBoundingClientRect().height,timelineHeight:document.querySelector('.timeline').getBoundingClientRect().height})`));
}
async function toggle() { await evaluate('document.activeElement?.blur()'); await key(window,'Space'); }
async function stop() { if (await evaluate(state+'.playback.playing')) await toggle(); await wait(`!${state}.playback.playing`, 'stopped'); }
async function clear() { await evaluate(qa + '.clicks=[]'); }
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window,'window'); await wait("!!document.querySelector('.set-card')",'renderer');
    window.setContentSize(1366,768); window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source:`(${instrument.toString()})()` });
    window.webContents.reload(); await wait(`!!${editor} && ${state}.preferences.status==='saved'`,'store');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled:true });
    window.show(); window.focus();
    await wait(`${qa}.nodes.length>0`,'production audio worklet loaded');
    const tempo = await evaluate(state+'.project.present.moves[0].tempo');
    await evaluate(`${editor}.setValue('ui','dialog',null); ${editor}.dispatch('playback.scrub',{count:0})`);
    await capture('metronome-workspace.png');
    // Native pointer route from the project settings; no additional timeline row.
    await evaluate(`${editor}.dispatch('dialog.open',{dialog:'settings'})`);
    await click('Metronome and count-in…'); await wait("document.querySelector('dialog h2')?.textContent==='Metronome and count-in'",'metronome dialog');
    await selectNativeOption(window,'[aria-label="Meter preset"]','6/8');
    await selectNativeOption(window,'[aria-label="Count-in"]','1');
    await capture('metronome-dark.png');
    await click('Apply'); await wait(`!${state}.ui.dialog`,'configuration applied');
    assert.deepEqual(await evaluate(state+'.project.present.meter'), { numerator:6,denominator:8,grouping:[3,3] });
    assert.equal(await evaluate(state+'.playback.countInBars'),1);
    await evaluate(`${editor}.dispatch('history.undo')`); assert.equal(await evaluate(state+'.project.present.meter'),undefined);
    await evaluate(`${editor}.dispatch('history.redo')`); assert.equal(await evaluate(state+'.project.present.meter.numerator'),6);
    pass('native settings route saves compound grouping as one undo action and retains session count-in');
    await evaluate(`${editor}.dispatch('metronome.configure',{meter:{numerator:6,denominator:8,grouping:[3,3]},enabled:true,countInBars:1,speed:1.5}); ${editor}.dispatch('playback.scrub',{count:3})`);
    await wait(`${qa}.nodes.length>=2`,'new meter worklet'); await clear(); await toggle();
    await wait(`${state}.playback.clockStatus.startsWith('Count-in')`,'visible count-in status');
    assert.equal(await evaluate(state+'.playback.count'),3); await capture('metronome-count-in.png');
    await wait(`${qa}.clicks.filter(c=>c.phase==='show').length>=2`,'count-in reaches show count'); await stop();
    const counted = await evaluate(qa+'.clicks');
    const lead = counted.filter(c=>c.phase==='count-in'), show = counted.filter(c=>c.phase==='show');
    assert.equal(lead.length,6); assert.equal(show[0].count,3);
    assert.deepEqual(lead.map(c=>c.accent),['bar','beat','beat','group','beat','beat']);
    assert.ok(Math.abs(show[0].time-lead[0].time-6*(60/tempo)/1.5)<.02,JSON.stringify(counted));
    measurements.push({ fixture:'compound count-in',clicks:counted });
    pass('six-count lead-in at 1.5× holds the requested count and lands the first show click on count 3');
    // Clicks are reported from the actual audio render block, while a deliberate
    // main-thread busy loop prevents timers, frames and message delivery.
    for (const [numerator,denominator,grouping] of [[3,4,[3]],[4,4,[4]],[6,8,[3,3]]]) {
      await evaluate(`${editor}.dispatch('metronome.configure',{meter:{numerator:${numerator},denominator:${denominator},grouping:${JSON.stringify(grouping)}},enabled:true,countInBars:0,speed:1.5}); ${editor}.dispatch('playback.scrub',{count:0})`);
      await pause(100); await clear(); await toggle(); await wait(`${qa}.clicks.length>=2`,'clicks running');
      const before = await evaluate(`${qa}.context.currentTime`);
      await evaluate('(() => {const end=performance.now()+1600;while(performance.now()<end){} })()');
      await pause(100); await stop();
      const events = await evaluate(qa+'.clicks');
      const during = events.filter(e=>e.time>before+.05&&e.time<before+1.5);
      assert.ok(during.length>=4,JSON.stringify({before,events}));
      for(let i=1;i<events.length;i++) assert.ok(Math.abs(events[i].time-events[i-1].time-(60/tempo)/1.5)<.015,JSON.stringify(events));
      for(const e of events) assert.equal(e.accent,e.count%numerator===0?'bar':numerator===6&&e.count%6===3?'group':'beat');
      measurements.push({ fixture:`${numerator}/${denominator} renderer blocked 1600ms`,before,clicks:events });
    }
    pass('3/4, 4/4 and 6/8 clicks retain exact audio-time spacing through 1600ms rendering stalls');
    await clear(); await pause(600); assert.deepEqual(await evaluate(qa+'.clicks'),[]);
    await evaluate(`${editor}.dispatch('playback.scrub',{count:12})`); await pause(400); assert.deepEqual(await evaluate(qa+'.clicks'),[]);
    await toggle(); await wait(`${qa}.clicks.length>=1`,'resume'); await stop(); await pause(50); await clear(); await pause(600); assert.deepEqual(await evaluate(qa+'.clicks'),[]);
    pass('pause, stopped seek and resume cancel pending clicks without a delayed tail');
    // The recording shares the count-in hold and the existing media clock.
    const doc = await window.webContents.debugger.sendCommand('DOM.getDocument');
    const { nodeId } = await window.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[accept="audio/*"]'});
    await window.webContents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId,files:[recording]});
    await wait(`${state}.fileSession.audioUrl && !${state}.fileSession.audioLoading && document.querySelector('audio').readyState>=3`,'recording ready');
    await evaluate(`${editor}.dispatch('metronome.configure',{meter:{numerator:3,denominator:4,grouping:[3]},enabled:true,countInBars:1,speed:1}); ${editor}.dispatch('playback.scrub',{count:3})`);
    await pause(100); await clear(); await toggle();
    await wait(`${state}.playback.clockStatus.startsWith('Count-in')`,'track count-in');
    const held = await evaluate(`({count:${state}.playback.count,paused:document.querySelector('audio').paused,time:document.querySelector('audio').currentTime})`);
    assert.equal(held.count,3); assert.equal(held.paused,true);
    await wait(`${state}.playback.clockStatus==='Audio clock' && ${state}.playback.count>4`,'track and clicks running');
    const paired = await evaluate(`({count:${state}.playback.count,time:document.querySelector('audio').currentTime,clicks:${qa}.clicks})`);
    assert.ok(Math.abs(paired.count*60/tempo-paired.time)<.1,JSON.stringify(paired));
    assert.equal(paired.clicks.filter(c=>c.phase==='count-in').length,3);
    measurements.push({fixture:'track-backed count-in',held,paired}); await stop();
    // A blocked renderer at the handover must never skip into the recording.
    await evaluate(`${editor}.dispatch('playback.scrub',{count:3})`); await pause(50); await clear(); await toggle();
    await wait(`${state}.playback.clockStatus.startsWith('Count-in')`,'blocked handover lead-in');
    await evaluate('(() => {const end=performance.now()+1800;while(performance.now()<end){} })()');
    await wait(`${state}.playback.clockStatus==='Audio clock' && ${state}.playback.count>3.2 && ${qa}.clicks.some(c=>c.phase==='show')`,'blocked handover starts recording and renders its first click');
    const handover = await evaluate(`({count:${state}.playback.count,time:document.querySelector('audio').currentTime,clicks:${qa}.clicks})`);
    const started = handover.clicks.filter(c=>c.phase==='show');
    assert.ok(started.length>0); assert.equal(started[0].count,3);
    measurements.push({fixture:'1800ms renderer stall across recording count-in handover',...handover}); await stop();
    pass('a renderer stall across the lead-in handover starts the recording and first show click at the intended count');
    // Cancel a second lead-in before the track starts, then verify silence.
    await toggle(); await wait(`${state}.playback.clockStatus.startsWith('Count-in')`,'second count-in'); await stop();
    await pause(50); await clear(); await pause(600); assert.deepEqual(await evaluate(qa+'.clicks'),[]);
    assert.equal(await evaluate("document.querySelector('audio').paused"),true);
    pass('track-backed count-in holds audio, follows media time, and cancels before recording playback');
    // A short whole-show loop owns the boundary click once, without replaying lead-in.
    await evaluate(`(() => {const p=structuredClone(${state}.project.present);p.sets=p.sets.slice(0,2);p.moves=p.moves.slice(0,1);p.moves[0].counts=3;p.moves[0].tempo=240;p.moves[0].paths={};${editor}.dispatch('project.load',{project:p});${editor}.setValue('fileSession','audioUrl','');${editor}.setValue('fileSession','audioName','');${editor}.setValue('playback','countInBars',0);${editor}.setValue('playback','loop',true);${editor}.dispatch('playback.scrub',{count:0});})()`);
    await pause(100); await clear(); await toggle(); await wait(`${qa}.clicks.length>=10`,'four short loops'); await stop();
    const looped = await evaluate(qa+'.clicks');
    assert.ok(looped.every(c=>c.phase==='show'&&c.count>=0&&c.count<3));
    for(let i=1;i<looped.length;i++) { assert.equal(looped[i].count,(looped[i-1].count+1)%3,JSON.stringify(looped));assert.ok(Math.abs(looped[i].time-looped[i-1].time-.25)<.02,JSON.stringify(looped)); }
    measurements.push({fixture:'three-count loop',clicks:looped});
    pass('short loops emit each boundary beat once and never repeat the count-in');
    const beforeCancel = await evaluate(`JSON.stringify(${state}.project.present)`);
    await evaluate(`${editor}.dispatch('dialog.open',{dialog:'metronome'})`);
    await wait("!!document.querySelector('[aria-label=\"Accent grouping\"]')",'meter draft mounted');
    await evaluate("document.querySelector('[aria-label=\"Accent grouping\"]').focus()");
    await key(window,'A',process.platform==='darwin'?['meta']:['control']);
    await window.webContents.insertText('2+2');
    await wait("document.querySelector('[aria-label=\"Accent grouping\"]').getAttribute('aria-invalid')==='true'",'invalid grouping feedback');
    assert.equal(await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Apply').disabled"),true);
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
    await key(window,'Escape'); await wait(`!${state}.ui.dialog`,'keyboard cancel');
    assert.equal(await evaluate(`JSON.stringify(${state}.project.present)`),beforeCancel);
    pass('invalid groups disable Apply and native Escape discards the pending meter draft');
    for(const theme of ['dark','light','high-contrast']) {
      await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}}); ${editor}.dispatch('dialog.open',{dialog:'metronome'})`);
      await capture(`metronome-${theme}.png`);
      await click('Cancel'); await wait(`!${state}.ui.dialog`,'cancel');
    }
    window.setContentSize(1120,768); window.webContents.setZoomFactor(1.25); await settleNativeViewport(window,'enlarged');
    await evaluate(`${editor}.dispatch('dialog.open',{dialog:'metronome'})`); await capture('metronome-enlarged.png');
    assert.equal(await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Apply').getBoundingClientRect().bottom<=innerHeight"),true);
    await click('Cancel'); await wait(`!${state}.ui.dialog`,'cancel enlarged');
    window.setContentSize(1120,680); await settleNativeViewport(window,'short enlarged dialog');
    await evaluate(`${editor}.dispatch('dialog.open',{dialog:'metronome'})`);
    await wait("!!document.querySelector('[aria-label=\"Count-in\"]')",'short dialog mounted');
    await selectNativeOption(window,'[aria-label="Count-in"]','2');
    await capture('metronome-short.png');
    assert.equal(await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Apply').getBoundingClientRect().bottom<=innerHeight"),true);
    await click('Cancel'); await wait(`!${state}.ui.dialog`,'cancel short dialog');
    await evaluate(`${qa}.rejectWorklet=true; ${editor}.dispatch('project.update',{title:'Unavailable click output'}); ${editor}.setValue('playback','countInBars',0)`);
    await pause(100); await toggle(); await wait(`${state}.playback.clockStatus.includes('Metronome unavailable') && ${state}.playback.count>.3`,'unavailable processor fallback');
    await capture('metronome-unavailable.png'); await stop();
    pass('an unavailable audio processor leaves rehearsal running and reports the missing click output');
    assert.deepEqual(await evaluate(qa+'.errors'),[]);
    pass('all themes and enlarged narrow-window controls remain usable; Cancel leaves production unchanged');
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,measurements,viewports,source:manifest.source},null,2));app.exit(0);
  } catch(error) {console.error(error); await fs.writeFile(path.join(output,'failure-details.json'),JSON.stringify(await evaluate(`({clicks:${qa}.clicks,playback:${state}.playback,errors:${qa}.errors})`).catch(()=>null),null,2)); await fs.writeFile(path.join(output,'failure.txt'),error.stack);app.exit(1);}
});
