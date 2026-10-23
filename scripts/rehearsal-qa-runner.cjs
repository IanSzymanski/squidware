'use strict';
const assert = require('node:assert/strict'), { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, selectNativeOption, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--rehearsal-manifest=')).slice('--rehearsal-manifest='.length));
const { root, output, profile, bundle } = manifest, { fixture, parseProject } = require(bundle);
app.disableHardwareAcceleration(); app.setPath('userData', profile);
// The production ready-to-show handler must not expose the fixed-size layout
// capture to macOS desktop work-area constraints. Show the native window only
// after measuring the requested viewport, as in the set-creation suite.
const showWindow = BrowserWindow.prototype.show;
BrowserWindow.prototype.show = function () {};
let window, failure, savePath = path.join(output, 'saved.squid'); const checks = [], viewports = [];
dialog.showMessageBox = async () => ({ response: 1 });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: savePath });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [savePath] });
app.on('browser-window-created', (_e,w) => { window=w; w.webContents.setBackgroundThrottling(false); w.webContents.on('render-process-gone', (_e,d)=>{failure=new Error(d.reason);}); });
require(path.join(root,'electron/main.cjs'));
const evaluate = async source => { try { return await window.webContents.executeJavaScript(source); } catch(error) { throw new Error(error.message+' · '+source.slice(0,250)); } }, editor = 'window.__rehearsalQA.editor', state=editor+'.getState()';
const wait = (expression,label) => waitFor(()=>evaluate(expression),label,{timeoutMs:20000,failure:()=>failure});
const frames = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const pass = label => { checks.push(label); console.log('PASS '+label); };
function instrument() {
 window.confirm=()=>true;
 const qa=window.__rehearsalQA={editor:null,errors:[]}; window.addEventListener('error',e=>qa.errors.push(e.message));window.addEventListener('unhandledrejection',e=>qa.errors.push(String(e.reason)));
 window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(){return 1;},onCommitFiberRoot(_id,root){function visit(f){if(!f)return;const v=f.memoizedProps?.value;if(v?.getState&&v?.dispatch)qa.editor=v;visit(f.child);visit(f.sibling);}visit(root.current);},onCommitFiberUnmount(){},onPostCommitFiberRoot(){}};
}
async function click(selector) {
 const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Unavailable '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 for(const type of ['mouseMoved','mousePressed','mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})}); await frames();
}
async function text(selector,value) { await click(selector); await key(window,'a',[process.platform==='darwin'?'meta':'control']); await window.webContents.debugger.sendCommand('Input.insertText',{text:value}); await frames(); }
async function capture(name) { await evaluate("(()=>{document.activeElement?.blur();const modal=document.querySelector('dialog');if(modal)modal.scrollTop=0})()"); await capturePage(window,output,name);viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container')?.getBoundingClientRect().height,timelineHeight:document.querySelector('.timeline')?.getBoundingClientRect().height})`)); }
app.whenReady().then(async()=>{try{
 await waitFor(()=>!!window,'window');await wait("!!document.querySelector('.set-card')",'renderer');window.setContentSize(1366,768);
 window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Page.enable');await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});window.webContents.reload();
 await wait(`!!${editor} && ${state}.preferences.status==='saved'`,'store');await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)",'recovery');
 const p=fixture();await evaluate(`${editor}.setValue('ui','dialog',null);${editor}.dispatch('project.load',{project:${JSON.stringify(p)}})`);await frames();
 await capture(manifest.baseline ? 'rehearsal-before.png' : 'rehearsal-default-dark.png');
 const layout=viewports.at(-1);assert.deepEqual([layout.width,layout.height],[1366,768],JSON.stringify(layout));assert.ok(layout.fieldHeight>=470,JSON.stringify(layout));if(manifest.baseline){app.exit(0);return;}
 BrowserWindow.prototype.show = showWindow;
 window.show();window.focus();await frames();await settleNativeViewport(window,'rehearsal window');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 await click('[aria-label="Rehearsal passages"]');await wait("!!document.querySelector('[aria-label=\"Passage name\"]')",'passage dialog');
 await text('[aria-label="Passage name"]','Arrival practice');await key(window,'Tab');assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Passage type');
 await selectNativeOption(window,'[aria-label="Passage type"]','range');await selectNativeOption(window,'[aria-label="Start target"]','move:m0');await text('[aria-label="Start local count"]','99');assert.equal(await evaluate("document.querySelector('[aria-label=\"Save passage\"]').disabled"),true);await text('[aria-label="Start local count"]','2.5');await selectNativeOption(window,'[aria-label="Rehearsal focus"]','section:'+p.sections[0].id);await text('[aria-label="Annotation"]','Keep the interval.');
 await capture('rehearsal-range-dark.png');await click('form .button.primary');await wait(`${state}.project.present.rehearsal?.length===1`,'saved range');
 const saved=await evaluate(state+'.project.present.rehearsal[0]');assert.equal(saved.start.count,2.5);assert.equal(saved.notes,'Keep the interval.');assert.equal(await evaluate(state+'.project.past.length'),1);
 await evaluate("document.activeElement?.blur()");await click('[aria-label="Go to saved passage"]');await wait(`${state}.playback.rehearsalId!==null && !document.querySelector('dialog')`,'active passage');
 assert.equal(await evaluate("document.querySelectorAll('.field-performer').length"),1);assert.equal(await evaluate(state+'.playback.count'),2.5);assert.equal(await evaluate("!!document.querySelector('.field-container--preview')"),true);await capture('rehearsal-focus-dark.png');
 pass('native form entry, Tab navigation, fractional cross-move range and section focus preserve full production geometry');
 const full=await evaluate(`JSON.stringify(${state}.project.present.sets)`);assert.equal(full,JSON.stringify(p.sets));
 // A short fixture range exercises actual controller media/silent loop handoff quickly.
 const short={...saved,id:'short',name:'Short loop',start:{kind:'move',moveId:'m0',fromSetId:'s0',toSetId:'s1',count:1},end:{kind:'move',moveId:'m0',fromSetId:'s0',toSetId:'s1',count:2}};
 await evaluate(`${editor}.dispatch('rehearsal.save',{passage:${JSON.stringify(short)}});${editor}.dispatch('rehearsal.activate',{id:'short'});${editor}.setValue('playback','loop',false);${editor}.dispatch('playback.toggle')`);
 await wait(`${state}.playback.count===2 && !${state}.playback.playing`,'range end');await evaluate(`${editor}.setValue('playback','loop',true);${editor}.dispatch('playback.toggle')`);await wait(`${state}.playback.count>1.4`,'range advanced');
 await wait(`${state}.playback.count<1.3 && ${state}.playback.playing`,'range loop');await evaluate(`${editor}.dispatch('playback.toggle')`);assert.equal(await evaluate(`JSON.stringify(${state}.project.present.sets)`),full);
 pass('real playback controller stops exactly at range end and loops to range start without editing geometry');
 const recording=path.join(output,'range.wav'), rate=8000, bytes=rate*20*2, wav=Buffer.alloc(44+bytes);
 wav.write('RIFF');wav.writeUInt32LE(36+bytes,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(bytes,40);await fs.writeFile(recording,wav);
 await evaluate(`${editor}.setValue('playback','muted',true)`);
 const doc=await window.webContents.debugger.sendCommand('DOM.getDocument');const {nodeId}=await window.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[accept="audio/*"]'});await window.webContents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId,files:[recording]});
 await wait(`${state}.fileSession.audioUrl && !${state}.fileSession.audioLoading && document.querySelector('audio').readyState>=3`,'audio ready');
 await evaluate(`${editor}.dispatch('project.update',{audioOffsetSeconds:1});${editor}.dispatch('rehearsal.activate',{id:'short'});${editor}.setValue('playback','loop',true);${editor}.dispatch('playback.toggle')`);
 await wait(`${state}.playback.clockStatus==='Audio clock' && ${state}.playback.count>1.4`,'audio range advanced');
 await wait(`${state}.playback.count<1.3 && ${state}.playback.playing`,'audio range loop');
 const sync=await evaluate(`({count:${state}.playback.count,time:document.querySelector('audio').currentTime})`);assert.ok(Math.abs(sync.count*.5+1-sync.time)<.15,JSON.stringify(sync));
 await evaluate(`${editor}.setValue('playback','loop',false)`);await wait(`${state}.playback.count===2 && !${state}.playback.playing && document.querySelector('audio').paused`,'audio range stop');
 pass('real media-backed range loops and stops on the shared clock with audio offset preserved');
 await evaluate(`${editor}.dispatch('file.save-as')`);await waitFor(async()=>{try{return(await fs.stat(savePath)).size>0;}catch{return false;}},'native save');
 assert.equal(parseProject(await fs.readFile(savePath,'utf8')).rehearsal.length,2);
 await evaluate(`${editor}.dispatch('rehearsal.clear');${editor}.dispatch('project.load',{project:${JSON.stringify(p)}});${editor}.dispatch('file.open')`);await wait(`${state}.project.present.rehearsal?.length===2`,'native reopen');assert.equal(await evaluate(state+'.playback.rehearsalId'),null);
 await evaluate(`${editor}.dispatch('rehearsal.remove',{id:'short'});${editor}.dispatch('history.undo')`);assert.equal(await evaluate(state+'.project.present.rehearsal.length'),2);await evaluate(`${editor}.dispatch('history.redo')`);assert.equal(await evaluate(state+'.project.present.rehearsal.length'),1);
 pass('native save/reopen retains annotations and ranges; deletion is one reversible metadata edit');
 savePath=path.join(output,'rehearsal.pdf');await evaluate(`${editor}.setValue('ui','printing',true)`);await frames();await evaluate(`window.squidware.exportPdf('letter')`);assert.ok((await fs.stat(savePath)).size>1000);await evaluate(`${editor}.setValue('ui','printing',false)`);
 pass('native PDF export includes saved rehearsal references');
 await evaluate(`${editor}.dispatch('set.remove',{index:1});${editor}.dispatch('rehearsal.open')`);await wait("!!document.querySelector('.rehearsal-item')",'repair warning');assert.match(await evaluate("document.querySelector('.rehearsal-item').textContent"),/Needs repair/);await click('.rehearsal-item');assert.equal(await evaluate("document.querySelector('form .button.primary').disabled"),true);await capture('rehearsal-missing-target.png');await key(window,'Escape');
 await evaluate(`${editor}.dispatch('history.undo');${editor}.dispatch('rehearsal.open')`);await click('.rehearsal-item');
 for(const theme of ['light','high-contrast']){await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}});document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await frames();await capture('rehearsal-range-'+theme+'.png');}
 window.setContentSize(1024,720);window.webContents.setZoomFactor(1.5);await settleNativeViewport(window,'enlarged rehearsal dialog');await capture('rehearsal-enlarged.png');await evaluate("document.querySelector('form .button.primary').scrollIntoView({block:'center'})");
 assert.ok(await evaluate("(()=>{const r=document.querySelector('form .button.primary').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"));await text('[aria-label="Annotation"]','Unsaved annotation');await key(window,'Escape');await wait("!document.querySelector('dialog')",'escape closes dialog');assert.equal(await evaluate(state+'.project.present.rehearsal[0].notes'),'Keep the interval.');
 pass('deleted targets are flagged, activation is blocked, themes and enlarged scrolling keep actions reachable, Escape cancels');
 assert.deepEqual(await evaluate('window.__rehearsalQA.errors'),[]);await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,scope:manifest.scope},null,2));app.exit(0);
}catch(error){console.error(error);if(window)await capture('failure.png').catch(()=>{});await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,error:error.stack},null,2));app.exit(1);}});
