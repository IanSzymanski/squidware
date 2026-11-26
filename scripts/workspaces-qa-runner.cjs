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
// Write, Plan and Rehearse are the modes in the top bar. Every other arrangement, and saving, renaming, deleting and
// resetting, lives in the Workspaces dialog that the Project menu opens.
const modes={design:'Write',production:'Plan',rehearse:'Rehearse'},listed='dialog[open] .workspace-list';
const menuItem=(menu,item)=>`[role=menu][aria-label="${menu}"] [aria-label="${item}"]`;
async function fromMenu(menu,item){await click(`button[aria-haspopup=menu][aria-label="${menu}"]`);await click(menuItem(menu,item));}
async function openWorkspaces(){await fromMenu('Project menu','Workspaces');await wait(`!!document.querySelector('${listed}')`,'Workspaces dialog');}
async function closeWorkspaces(){await click('dialog[open] .modal-actions .button');await wait(`!document.querySelector('${listed}')`,'Workspaces dialog closed');}
async function choose(name,id=name.toLowerCase()) {
 if(modes[id]){const mode=`[aria-label="${modes[id]} mode"]`;await click(mode);await wait(`${state}.preferences.value.workspaces.active===${JSON.stringify(id)}&&document.querySelector('${mode}').getAttribute('aria-pressed')==='true'`,'workspace '+name);return;}
 const row=`${listed} [aria-label="${name} workspace"]`;await openWorkspaces();await click(row);
 await wait(`${state}.preferences.value.workspaces.active===${JSON.stringify(id)}&&document.querySelector('${row}').getAttribute('aria-pressed')==='true'&&document.querySelectorAll('${listed} .workspace-choice[aria-pressed=true]').length===1`,'workspace '+name);
 await closeWorkspaces();
}
async function text(selector,value) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`); await key('A',[process.platform==='darwin'?'meta':'control']); await window.webContents.debugger.sendCommand('Input.insertText',{text:value}); }
async function screenshot(name){await settleNativeViewport(window,'workspace settled');await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await capturePage(window,output,name+'.png');}
app.whenReady().then(async()=>{try{
 await waitFor(()=>!!window,'window');await wait("!!document.querySelector('.field-stage__svg')",'field');
 window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Page.enable');await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});window.webContents.reload();
 await wait(`!!${editor}&&${state}.preferences.status==='saved'`,'store');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 if(phase==='read') {
   assert.equal(await evaluate(`${state}.preferences.value.workspaces.entries.find(w=>w.id===${state}.preferences.value.workspaces.active).name`),'Daily writing');
   assert.equal(await evaluate(`${state}.preferences.value.workspaceLayout.setsWidth`),290);
   // The side panel has one width for both tabs; the saved arrangement brings it back with its Cast tab.
   assert.deepEqual(await evaluate(`[${state}.preferences.value.workspaceLayout.inspectorWidth,${state}.preferences.value.workspaceLayout.castWidth]`),[340,340]);
   assert.equal(await evaluate(`${state}.ui.castPanelOpen`),true);
   await wait("document.querySelector('#panel-tab-cast')?.getAttribute('aria-selected')==='true'&&!document.querySelector('#workspace-pane-cast').hidden",'restored Cast tab');
   assert.equal(await evaluate("Math.round(document.querySelector('#workspace-pane-cast').getBoundingClientRect().width)"),340);
   // A custom workspace keeps the mode it was saved from in the top bar and is the one marked in Workspaces.
   assert.deepEqual(await evaluate("[...document.querySelectorAll('.mode-switch > button[aria-pressed=true]')].map(n=>n.getAttribute('aria-label'))"),['Write mode']);
   await openWorkspaces();assert.deepEqual(await evaluate(`[...document.querySelectorAll('${listed} .workspace-choice[aria-pressed=true]')].map(n=>n.getAttribute('aria-label'))`),['Daily writing workspace']);await closeWorkspaces();
   await screenshot('custom-restarted');pass('named custom workspace, widths, right-panel tab and active header survive a new process');
 } else {
 const original=await evaluate(`JSON.stringify(${state}.project)`);
 for(const [width,height] of [[1366,768],[1920,1080]]) {
   window.setContentSize(width,height);await settleNativeViewport(window,'size');
   for(const name of ['Field','Design','Production','Rehearse']) {
     await choose(name);
     // The top bar names the stage of work behind the arrangement; Field is an arrangement of Write.
     const mode=(modes[name.toLowerCase()]??'Write')+' mode';
     await wait(`JSON.stringify([...document.querySelectorAll('.mode-switch > button[aria-pressed=true]')].map(n=>n.getAttribute('aria-label')))===${JSON.stringify(JSON.stringify([mode]))}`,'active header');
     const m=await evaluate(`(()=>{const f=document.querySelector('.field-container').getBoundingClientRect();return {workspace:${JSON.stringify(name)},viewport:[innerWidth,innerHeight],field:f.toJSON(),overflow:document.documentElement.scrollWidth>innerWidth,header:document.querySelector('.app-header').getBoundingClientRect().toJSON()}})()`);
     metrics.push(m);assert.equal(m.overflow,false);if(name==='Field'&&width===1366)assert.ok(m.field.height>=470,JSON.stringify(m));
     if(name==='Production'){
       assert.equal(await evaluate("document.querySelector('#panel-content-inspector').hidden"),true);
       // Plan is the production sheet alone: no side panel and no field beside it.
       assert.deepEqual(await evaluate("[document.querySelector('.side-panel').hidden,document.querySelector('.workspace-field').hidden,!!document.querySelector('.workspace-sheet').getClientRects().length]"),[true,true,true]);
     }
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
 await click('#panel-tab-cast');await wait(`${state}.ui.castPanelOpen`,'Cast tab');await fromMenu('More Cast actions','Full Cast table');await wait(`${state}.ui.dialog==='cast-table'`,'full roster dialog');await key('Escape');await wait(`!${state}.ui.dialog`,'roster closed');
 await click('#panel-tab-inspector');await evaluate("document.querySelector('#panel-tab-inspector').focus()");await key('Right');await wait(`${state}.ui.castPanelOpen&&document.activeElement.id==='panel-tab-cast'`,'arrow tab navigation');
 pass('Cast and Inspector tabs support native pointer and keyboard input; full roster remains reachable');
 // A narrow window tucks the side panel away; the tool strip's panel button opens it over the field.
 window.setContentSize(900,650);await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:1.25}))`);await settleNativeViewport(window,'narrow tab transition');
 await wait("document.querySelector('#workspace-pane-cast').hidden&&!document.querySelector('.workspace-pane--overlay')",'side panel tucked in a narrow window');
 await click('[aria-label="Show Cast"]');await wait("!document.querySelector('#workspace-pane-cast').hidden&&document.querySelector('#workspace-pane-cast').classList.contains('workspace-pane--overlay')",'Cast opens over the field');
 await click('#panel-tab-inspector');await wait(`!${state}.ui.castPanelOpen && !document.querySelector('#workspace-pane-inspector').hidden && document.querySelector('#workspace-pane-inspector').contains(document.activeElement)`,'a tucked Inspector opens with focus after choosing its tab');
 window.setContentSize(1366,768);await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:1}))`);await settleNativeViewport(window,'tab viewport restored');await click('#panel-tab-cast');
 await openWorkspaces();await evaluate('document.activeElement.blur()');await key('Escape');await wait(`!document.querySelector('${listed}') && document.activeElement?.getAttribute('aria-label')==='Project menu'`,'workspace Escape also closes from the page');
 pass('choosing a tucked Inspector keeps focus in its open panel, and Escape dismisses workspace options from the page');
 await openWorkspaces();await text('[aria-label="New workspace name"]','Writing');await click('.workspace-save .primary');
 await wait(`${state}.preferences.value.workspaces.active.startsWith('custom-')`,'custom saved');const id=await evaluate(`${state}.preferences.value.workspaces.active`);
 await wait(`document.querySelector('${listed} li.selected .workspace-choice')?.getAttribute('aria-label')==='Writing workspace'`,'saved workspace listed as active');
 await click(`${listed} li.selected > button.button.small`);await text('[aria-label="Workspace name"]','Renamed writing');await click('.workspace-rename .primary');
 await wait(`document.querySelector('${listed} li.selected .workspace-choice')?.getAttribute('aria-label')==='Renamed writing workspace'&&document.querySelector('${listed} li.selected strong').textContent==='Renamed writing'`,'rename');
 await closeWorkspaces();await choose('Field');await choose('Renamed writing',id);
 await openWorkspaces();await click(`${listed} [aria-label="Delete Renamed writing"]`);await wait(`${state}.preferences.value.workspaces.active==='design'`,'delete');
 assert.equal(await evaluate(`${state}.preferences.value.workspaces.entries.some(w=>w.id===${JSON.stringify(id)})`),false);
 assert.equal(await evaluate(`!!document.querySelector('${listed} [aria-label="Renamed writing workspace"]')`),false);await closeWorkspaces();
 await choose('Field');window.setContentSize(900,650);await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:1.5}))`);await settleNativeViewport(window,'reset with an open panel');await click('[aria-label="Show Inspector"]');await wait("!!document.querySelector('.workspace-pane--overlay')&&!!document.querySelector('.workspace-overlay-dismiss')",'side panel open over the Field workspace');assert.equal(await evaluate(`${state}.preferences.value.workspaceLayout.inspectorCollapsed`),false);await openWorkspaces();await click(`${listed} [aria-label="Reset Field"]`);await wait(`${state}.preferences.value.workspaceLayout.inspectorCollapsed && !document.querySelector('.workspace-pane--overlay, .workspace-overlay-dismiss')`,'reset built-in closes its temporary panel');await closeWorkspaces();window.setContentSize(1366,768);await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:1}))`);await settleNativeViewport(window,'reset viewport restored');
 pass('save, rename, switch, delete and reset use native controls without adding an undo entry');
 // Workspaces is a shared dialog frame, 480 px wide in effective pixels at every theme and UI scale.
 for(const [theme,scale] of [['light',1],['high-contrast',1],['dark',1.25],['dark',1.5]]) {
   await evaluate(`${editor}.setValue('preferences','value',p=>({...p,theme:${JSON.stringify(theme)},uiScale:${scale}}))`);window.setContentSize(1024,700);await settleNativeViewport(window,'theme/scale');
   await openWorkspaces();await screenshot(`switcher-${theme}-${scale}`);
   const bounds=await evaluate("({rect:document.querySelector('dialog.modal[open]').getBoundingClientRect().toJSON(),list:document.querySelector('dialog[open] .workspace-list').getBoundingClientRect().toJSON(),viewport:[innerWidth,innerHeight]})"),r=bounds.rect;
   assert.ok(r.width<=480*scale+1,`shared theme styles cannot widen the Workspaces dialog: ${JSON.stringify(bounds)}`);
   assert.ok(r.left>=0&&r.right<=bounds.viewport[0]+1&&r.top>=0&&r.bottom<=bounds.viewport[1]+1,JSON.stringify(bounds));
   assert.ok(bounds.list.left>=r.left&&bounds.list.right<=r.right,JSON.stringify(bounds));
   await key('Escape');await wait(`!document.querySelector('${listed}')`,'Workspaces dialog dismissed');
 }
 await evaluate(`${editor}.setValue('preferences','value',p=>({...p,theme:'dark',uiScale:1}))`);window.setContentSize(1366,768);await choose('Design');await click('#panel-tab-cast');
 await evaluate(`${editor}.dispatch('layout.update',{update:{setsWidth:290,inspectorWidth:340,castWidth:340}})`);await openWorkspaces();await text('[aria-label="New workspace name"]','Daily writing');await click('.workspace-save .primary');
 await wait(`document.querySelector('${listed} li.selected .workspace-choice')?.getAttribute('aria-label')==='Daily writing workspace'`,'final custom workspace listed as active');await closeWorkspaces();
 await wait(`${state}.preferences.status==='saved'`,'preferences durable');assert.equal(await evaluate(`JSON.stringify(${state}.project)`),original);
 pass('all themes and 150% UI scale keep the switcher on screen; final custom arrangement is durable');
 }
 await fs.writeFile(path.join(output,`results-${phase}.json`),JSON.stringify({checks,metrics},null,2));app.exit(0);
}catch(error){console.error(error);if(window&&!window.isDestroyed()){console.error(await evaluate(`({active:${state}.preferences.value.workspaces.active,draft:${state}.ui.pendingDraft,focus:document.activeElement?.outerHTML.slice(0,400),toast:${state}.ui.toast})`).catch(()=>null));await capturePage(window,output,'failure.png').catch(()=>{});}app.exit(1);}});
