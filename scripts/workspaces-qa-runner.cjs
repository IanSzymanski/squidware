'use strict';
const assert = require('node:assert/strict');
const {app,BrowserWindow} = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const {capturePage,key:sendKey,waitFor,settleNativeViewport} = require('./testing/renderer.cjs');
const {root,output,profile} = require(process.argv.find(a=>a.startsWith('--workspaces-manifest=')).slice('--workspaces-manifest='.length));
const phase = process.argv.find(a=>a.startsWith('--phase='))?.slice('--phase='.length);
app.disableHardwareAcceleration(); app.setPath('userData',profile); BrowserWindow.prototype.show=function(){};
let window,failure; const checks=[],metrics=[];
app.on('browser-window-created',(_e,w)=>{window=w;w.webContents.setBackgroundThrottling(false);w.webContents.on('render-process-gone',(_e,d)=>failure=Error(d.reason));});
require(path.join(root,'electron/main.cjs'));
const editor='window.__workspacesQA',state=editor+'.getState()', evaluate=code=>window.webContents.executeJavaScript(code);
const wait=(code,label)=>waitFor(()=>evaluate(code),label,{timeoutMs:15000,failure:()=>failure});
const key=(code,modifiers=[])=>sendKey(window,code,modifiers,20);
const pass=label=>{checks.push(label);console.log('PASS '+label);};
function instrument(){window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(){return 1;},onCommitFiberRoot(_id,r){function walk(f){if(!f)return;const v=f.memoizedProps?.value;if(v?.getState&&v?.dispatch)window.__workspacesQA=v;walk(f.child);walk(f.sibling);}walk(r.current);},onCommitFiberUnmount(){},onPostCommitFiberRoot(){}};}
async function click(selector){
 await wait(`!!document.querySelector(${JSON.stringify(selector)})?.getClientRects().length`,'visible '+selector);
 const p=await evaluate(`new Promise(resolve=>{const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'nearest'});requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=n.getBoundingClientRect();resolve({x:r.x+r.width/2,y:r.y+r.height/2});}));})`);
 for(const type of ['mouseMoved','mousePressed','mouseReleased'])await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...p,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:type==='mouseMoved'?0:1});
}
async function choose(name,id=name.toLowerCase()) { await click('[aria-label="Switch workspace"]'); await click(`[aria-label="${name} workspace"]`); await wait(`${state}.preferences.value.workspaces.active===${JSON.stringify(id)}&&!document.querySelector('#workspace-options')`,'workspace '+name); }
async function text(selector,value) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`); await key('A',[process.platform==='darwin'?'meta':'control']); await window.webContents.debugger.sendCommand('Input.insertText',{text:value}); }
async function screenshot(name){await settleNativeViewport(window,'workspace settled');await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await capturePage(window,output,name+'.png');}
app.whenReady().then(async()=>{try{
 await waitFor(()=>!!window,'window');await wait("!!document.querySelector('.field-stage__svg')",'field');
 window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Page.enable');await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});window.webContents.reload();
 await wait(`!!${editor}&&${state}.preferences.status==='saved'`,'store');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 if(phase==='read') {
   assert.equal(await evaluate(`${state}.preferences.value.workspaces.entries.find(w=>w.id===${state}.preferences.value.workspaces.active).name`),'Daily writing');
   assert.equal(await evaluate(`${state}.preferences.value.workspaceLayout.setsWidth`),290);
   assert.equal(await evaluate(`${state}.ui.castPanelOpen`),true);
   await screenshot('custom-restarted');pass('named custom workspace, widths, right-panel tab and active header survive a new process');
 } else {
 const original=await evaluate(`JSON.stringify(${state}.project)`);
 for(const [width,height] of [[1366,768],[1920,1080]]) {
   window.setContentSize(width,height);await settleNativeViewport(window,'size');
   for(const name of ['Field','Design','Production','Rehearse']) {
     await choose(name);
     await wait(`document.querySelector('.workspace-trigger')?.textContent===${JSON.stringify(name)}`,'active header');
     const m=await evaluate(`(()=>{const f=document.querySelector('.field-container').getBoundingClientRect();return {workspace:${JSON.stringify(name)},viewport:[innerWidth,innerHeight],field:f.toJSON(),overflow:document.documentElement.scrollWidth>innerWidth,header:document.querySelector('.app-header').getBoundingClientRect().toJSON()}})()`);
     metrics.push(m);assert.equal(m.overflow,false);if(name==='Field'&&width===1366)assert.ok(m.field.height>=470,JSON.stringify(m));
     if(name==='Production')assert.equal(await evaluate("document.querySelector('#panel-content-inspector').hidden"),true);
     await screenshot(`${name.toLowerCase()}-${width}`);
   }
 }
 assert.equal(await evaluate(`JSON.stringify(${state}.project)`),original);pass('all built-ins at laptop and desktop sizes preserve the project and give Field at least 470px of height');
 await choose('Design');window.setContentSize(1366,768);await settleNativeViewport(window,'laptop');
 await text('[aria-label="Set name"]','Uncommitted workspace draft');await wait(`${state}.ui.pendingDraft`,'draft');
 await key('1',[process.platform==='darwin'?'meta':'control']);await wait(`${state}.preferences.value.workspaces.active==='field'`,'workspace shortcut from input');
 assert.equal(await evaluate(`JSON.stringify(${state}.project)`),original);assert.equal(await evaluate(`${state}.ui.pendingDraft`),true);
 await choose('Production');await choose('Design');
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Set name\"]').value"),'Uncommitted workspace draft');
 assert.equal(await evaluate(`JSON.stringify(${state}.project)`),original);
 await evaluate("document.querySelector('[aria-label=\"Set name\"]').focus()");await key('Escape');await wait(`!${state}.ui.pendingDraft`,'draft cancelled');
 pass('keyboard and pointer workspace switches retain an uncommitted draft, project data and undo history');
 await click('#panel-tab-cast');await wait(`${state}.ui.castPanelOpen`,'Cast tab');await click('[aria-label="Full Cast table"]');await wait(`${state}.ui.dialog==='cast-table'`,'full roster dialog');await key('Escape');await wait(`!${state}.ui.dialog`,'roster closed');
 await click('#panel-tab-inspector');await evaluate("document.querySelector('#panel-tab-inspector').focus()");await key('Right');await wait(`${state}.ui.castPanelOpen&&document.activeElement.id==='panel-tab-cast'`,'arrow tab navigation');
 pass('Cast and Inspector tabs support native pointer and keyboard input; full roster remains reachable');
 await click('[aria-label="Switch workspace"]');await click('.workspace-manage button:first-child');await text('[aria-label="Workspace name"]','Writing');await click('.workspace-name-form .primary');
 await wait(`${state}.preferences.value.workspaces.active.startsWith('custom-')`,'custom saved');const id=await evaluate(`${state}.preferences.value.workspaces.active`);
 await click('.workspace-manage button:nth-child(2)');await text('[aria-label="Workspace name"]','Renamed writing');await click('.workspace-name-form .primary');await wait(`document.querySelector('.workspace-trigger').textContent==='Renamed writing'`,'rename');
 await click('[aria-label="Close workspace options"]');await choose('Field');await choose('Renamed writing',id);
 await click('[aria-label="Switch workspace"]');await click('.workspace-manage button:last-child');await wait(`${state}.preferences.value.workspaces.active==='design'`,'delete');
 assert.equal(await evaluate(`${state}.preferences.value.workspaces.entries.some(w=>w.id===${JSON.stringify(id)})`),false);
 await choose('Field');await evaluate(`${editor}.dispatch('layout.update',{update:{setsCollapsed:false}})`);await click('[aria-label="Switch workspace"]');await click('.workspace-manage button:last-child');await wait(`${state}.preferences.value.workspaceLayout.setsCollapsed`,'reset built-in');await click('[aria-label="Close workspace options"]');
 pass('save, rename, switch, delete and reset use native controls without adding an undo entry');
 for(const [theme,scale] of [['light',1],['high-contrast',1],['dark',1.5]]) {
   await evaluate(`${editor}.setValue('preferences','value',p=>({...p,theme:${JSON.stringify(theme)},uiScale:${scale}}))`);window.setContentSize(1024,700);await settleNativeViewport(window,'theme/scale');
   await click('[aria-label="Switch workspace"]');await screenshot(`switcher-${theme}-${scale}`);
   const r=await evaluate("document.querySelector('#workspace-options').getBoundingClientRect().toJSON()");assert.ok(r.left>=0&&r.right<=1025,JSON.stringify(r));await key('Escape');
 }
 await evaluate(`${editor}.setValue('preferences','value',p=>({...p,theme:'dark',uiScale:1}))`);window.setContentSize(1366,768);await choose('Design');await click('#panel-tab-cast');
 await evaluate(`${editor}.dispatch('layout.update',{update:{setsWidth:290}})`);await click('[aria-label="Switch workspace"]');await click('.workspace-manage button:first-child');await text('[aria-label="Workspace name"]','Daily writing');await click('.workspace-name-form .primary');await click('[aria-label="Close workspace options"]');
 await wait(`${state}.preferences.status==='saved'`,'preferences durable');assert.equal(await evaluate(`JSON.stringify(${state}.project)`),original);
 pass('all themes and 150% UI scale keep the switcher on screen; final custom arrangement is durable');
 }
 await fs.writeFile(path.join(output,`results-${phase}.json`),JSON.stringify({checks,metrics},null,2));app.exit(0);
}catch(error){console.error(error);if(window&&!window.isDestroyed()){console.error(await evaluate(`({active:${state}.preferences.value.workspaces.active,draft:${state}.ui.pendingDraft,focus:document.activeElement?.outerHTML,toast:${state}.ui.toast})`).catch(()=>null));await capturePage(window,output,'failure.png').catch(()=>{});}app.exit(1);}});
