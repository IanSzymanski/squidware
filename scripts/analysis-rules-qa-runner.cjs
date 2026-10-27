'use strict';
const assert = require('node:assert/strict'), { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, selectNativeOption, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--analysis-rules-manifest=')).slice('--analysis-rules-manifest='.length));
const { root, output, profile, bundle } = manifest, { fixture, parseProject, analyzeTransition } = require(bundle);
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
const evaluate = async source => { try { return await window.webContents.executeJavaScript(source); } catch(error) { throw new Error(error.message+' · '+source.slice(0,250)); } }, editor = 'window.__rulesQA.editor', state=editor+'.getState()';
const wait = (expression,label) => waitFor(()=>evaluate(expression),label,{timeoutMs:20000,failure:()=>failure});
const frames = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const pass = label => { checks.push(label); console.log('PASS '+label); };
function instrument() {
 window.confirm=()=>true;
 const NativeWorker=window.Worker;
 window.Worker=class extends NativeWorker {
  constructor(...args){super(...args);window.__rulesQA.workers.push(this);this.addEventListener('message',event=>window.__rulesQA.responses.push(event.data));}
  postMessage(message){window.__rulesQA.requests.push(message);if(!window.__rulesQA.hold)super.postMessage(message);}
 };

 const qa=window.__rulesQA={editor:null,errors:[],workers:[],responses:[],requests:[],hold:false}; window.addEventListener('error',e=>qa.errors.push(e.message));window.addEventListener('unhandledrejection',e=>qa.errors.push(String(e.reason)));
 window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(){return 1;},onCommitFiberRoot(_id,root){function visit(f){if(!f)return;const v=f.memoizedProps?.value;if(v?.getState&&v?.dispatch)qa.editor=v;if(v?.getSnapshot&&v?.draft)qa.analysis=v;visit(f.child);visit(f.sibling);}visit(root.current);},onCommitFiberUnmount(){},onPostCommitFiberRoot(){}};
}
async function click(selector) {
 const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Unavailable '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 for(const type of ['mouseMoved','mousePressed','mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})}); await frames();
}
async function text(selector,value) { await click(selector); await key(window,'a',[process.platform==='darwin'?'meta':'control']); await window.webContents.debugger.sendCommand('Input.insertText',{text:value}); await frames(); }
async function capture(name) { await evaluate("(()=>{document.activeElement?.blur();const modal=document.querySelector('dialog');if(modal)modal.scrollTop=0})()"); await capturePage(window,output,name);viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container')?.getBoundingClientRect().height,timelineHeight:document.querySelector('.timeline')?.getBoundingClientRect().height})`)); }
async function ready() { await wait("document.querySelector('[data-analysis-status]')?.dataset.analysisStatus==='ready'",'worker ready'); }
async function oracle() { await ready();const p=await evaluate(state+'.project.present'), index=await evaluate(state+'.selection.activeIndex');assert.deepEqual(await evaluate('window.__rulesQA.analysis.getSnapshot().moves['+(index-1)+'].issues'),analyzeTransition(p,index)); }
app.whenReady().then(async()=>{try{
 await waitFor(()=>!!window,'window');await wait("!!document.querySelector('.set-card')",'renderer');window.setContentSize(1366,768);
 window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Page.enable');await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});window.webContents.reload();
 await wait(`!!${editor} && ${state}.preferences.status==='saved'`,'store');await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)",'recovery');
 const p=fixture();await evaluate(`${editor}.setValue('ui','dialog',null);${editor}.dispatch('project.load',{project:${JSON.stringify(p)}});${editor}.setValue('preferences','value',{...${state}.preferences.value,inspectorChecksOpen:true});${editor}.dispatch('set.select',{index:1});${editor}.setValue('selection','selectedIds',['a'])`);await frames();
 await ready();await evaluate("document.querySelector('.transition-check').scrollIntoView({block:'end'})");await capture(manifest.baseline?'analysis-rules-before.png':'analysis-rules-default.png');const layout=viewports.at(-1);assert.deepEqual([layout.width,layout.height],[1366,768]);assert.ok(layout.fieldHeight>=470,JSON.stringify(layout));if(manifest.baseline){app.exit(0);return;}
 assert.equal(await evaluate('window.__rulesQA.analysis.getSnapshot().moves[window.__rulesQA.editor.getState().selection.activeIndex-1].issues.length'),0);assert.match(await evaluate("document.querySelector('.transition-check').textContent"),/2 unknown/);
 BrowserWindow.prototype.show=showWindow;window.show();window.focus();await frames();await settleNativeViewport(window,'visible rules window');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 await click('[aria-label="Analysis rules"]');await wait("!!document.querySelector('[aria-label=\"Rule scope\"]')",'rule editor');
 await selectNativeOption(window,'[aria-label="Rule scope"]','section:brass');await text('[aria-label="Rule minimum spacing"]','2');await key(window,'Tab');assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Rule maximum stride');await text('[aria-label="Rule maximum stride"]','.75');
 await selectNativeOption(window,'[aria-label="Rule scope"]','project');await selectNativeOption(window,'[aria-label="Direction rule"]','backward');await text('[aria-label="Rule maximum stride"]','.5');
 await selectNativeOption(window,'[aria-label="Rule scope"]','section:brass');await text('[aria-label="Rule maximum stride"]','.4');await selectNativeOption(window,'[aria-label="Declare selected direction"]','backward');await capture('analysis-rules-editor-dark.png');
 await evaluate('window.__rulesQA.hold=true');await click('[aria-label="Save rules"]');await wait(`!document.querySelector('dialog') && document.querySelector('[data-analysis-status]')?.dataset.analysisStatus==='pending'`,'rules invalidate worker');assert.equal(await evaluate("document.querySelectorAll('.issue-list button').length"),0);
 await wait('window.__rulesQA.requests.some(r=>r.input?.tracks[0].maximumStride===.4)','new request');await evaluate('window.__rulesQA.hold=false;window.__rulesQA.workers.at(-1).postMessage(window.__rulesQA.requests.at(-1))');await oracle();
 assert.equal(await evaluate(state+'.project.past.length'),1);assert.equal(await evaluate('window.__rulesQA.analysis.getSnapshot().moves[window.__rulesQA.editor.getState().selection.activeIndex-1].issues.length'),2);assert.match(await evaluate("document.querySelector('.transition-check').textContent"),/0.4 yd\/count/);assert.match(await evaluate("document.querySelector('.transition-check').textContent"),/Minimum 2 yd/);await evaluate("document.querySelector('.transition-check').scrollIntoView({block:'end'})");await capture('analysis-rules-flags.png');
 const geometry=JSON.stringify(p.sets);assert.equal(await evaluate(`JSON.stringify(${state}.project.present.sets)`),geometry);const rules=await evaluate(state+'.project.present.analysisRules');assert.equal(rules.sections[0].directions.backward.maximumStride,.4);assert.equal(await evaluate(state+'.project.present.moves[0].marchingDirections.a'),'backward');
 pass('native rule/declaration drafts save as one transaction, clear stale flags and update mixed-section worker outcomes without editing positions');
 const n=await evaluate('window.__rulesQA.requests.length');await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,minimumSpacing:5,maximumStride:.1})`);await frames();assert.equal(await evaluate('window.__rulesQA.requests.length'),n);await oracle();
 await evaluate(`${editor}.dispatch('history.undo')`);await oracle();assert.equal(await evaluate('window.__rulesQA.analysis.getSnapshot().moves[window.__rulesQA.editor.getState().selection.activeIndex-1].issues.length'),0);await evaluate(`${editor}.dispatch('history.redo')`);await oracle();assert.equal(await evaluate('window.__rulesQA.analysis.getSnapshot().moves[window.__rulesQA.editor.getState().selection.activeIndex-1].issues.length'),2);
 pass('personal preferences do not change active-project flags; undo/redo restores rules and declared directions together');
 await evaluate(`${editor}.dispatch('file.save-as')`);await waitFor(async()=>{try{return(await fs.stat(savePath)).size>0;}catch{return false;}},'native save');const saved=parseProject(await fs.readFile(savePath,'utf8'));assert.deepEqual(saved.analysisRules,rules);assert.equal(saved.moves[0].marchingDirections.a,'backward');
 await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(p)}});${editor}.dispatch('file.open')`);await wait(`${state}.project.present.analysisRules?.sections?.length===1`,'native reopen');await evaluate(`${editor}.dispatch('set.select',{index:1})`);await oracle();
 pass('native save/reopen preserves portable rules and direction declarations independently of local preferences');
 await click('[aria-label="Analysis rules"]');await selectNativeOption(window,'[aria-label="Rule scope"]','project');await text('[aria-label="Rule minimum spacing"]','-1');assert.equal(await evaluate("document.querySelector('[aria-label=\"Save rules\"]').disabled"),true);assert.match(await evaluate("document.querySelector('[role=\"alert\"]').textContent"),/0.1 to 5/);await key(window,'Escape');await wait("!document.querySelector('dialog')",'cancel rules');assert.deepEqual(await evaluate(state+'.project.present.analysisRules'),rules);await oracle();
 await click('[aria-label="Analysis rules"]');for(const theme of ['light','high-contrast']){await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);await frames();await capture('analysis-rules-'+theme+'.png');}
 window.setContentSize(1024,720);window.webContents.setZoomFactor(1.5);await settleNativeViewport(window,'enlarged rules editor');await capture('analysis-rules-enlarged.png');await evaluate("document.querySelector('[aria-label=\"Save rules\"]').focus()");assert.ok(await evaluate("(()=>{const r=document.querySelector('[aria-label=\"Save rules\"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"));await key(window,'Escape');
 pass('invalid numeric rules are blocked, Escape discards drafts, and supported themes/enlarged layouts retain acceptance controls');
 // Personal thresholds are copied once when the user creates a production.
 await evaluate(`${editor}.dispatch('file.new')`);await wait("!!document.querySelector('.new-options')",'new production');await click('.new-options button');await wait(`${state}.project.present.performers.length===0`,'blank production');assert.deepEqual(await evaluate(state+'.project.present.analysisRules.defaults'),{minimumSpacing:5,maximumStride:.1});
 pass('personal defaults are copied into newly created productions, leaving imported projects portable');
 assert.deepEqual(await evaluate('window.__rulesQA.errors'),[]);await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,scope:manifest.scope},null,2));app.exit(0);
}catch(error){console.error(error);if(window)await capture('failure.png').catch(()=>{});await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,error:error.stack},null,2));app.exit(1);}});
