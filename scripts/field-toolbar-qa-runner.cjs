'use strict';
const assert=require('node:assert/strict');
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const {capturePage,key:sendKey,waitFor,settleNativeViewport}=require('./testing/renderer.cjs');
const {root,output,profile}=require(process.argv.find(a=>a.startsWith('--toolbar-manifest=')).slice('--toolbar-manifest='.length));
app.disableHardwareAcceleration();app.setPath('userData',profile);BrowserWindow.prototype.show=function(){};
let window,failure;const checks=[],metrics=[];
app.on('browser-window-created',(_e,w)=>{window=w;w.webContents.setBackgroundThrottling(false);w.webContents.on('render-process-gone',(_e,d)=>failure=Error(d.reason));});
require(path.join(root,'electron/main.cjs'));
const editor='window.__toolbarQA',state=editor+'.getState()',evaluate=code=>window.webContents.executeJavaScript(code);
const wait=(code,label)=>waitFor(()=>evaluate(code),label,{timeoutMs:15000,failure:()=>failure});
const key=(code,modifiers=[])=>sendKey(window,code,modifiers,20);
const pass=label=>{checks.push(label);console.log('PASS '+label);};
function instrument(){window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(){return 1;},onCommitFiberRoot(_id,r){function walk(f){if(!f)return;const v=f.memoizedProps?.value;if(v?.getState&&v?.dispatch)window.__toolbarQA=v;walk(f.child);walk(f.sibling);}walk(r.current);},onCommitFiberUnmount(){},onPostCommitFiberRoot(){}};}
async function clickSelector(selector){
 await wait(`!!document.querySelector(${JSON.stringify(selector)})?.getClientRects().length`,'visible '+selector);
 const p=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 for(const type of ['mouseMoved','mousePressed','mouseReleased'])await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...p,...(type==='mouseMoved'?{}:{button:'left',buttons:type==='mousePressed'?1:0,clickCount:1})});
}
async function action(title){
 const selector=`.field-command-toolbar button[aria-label="${title}"]`;
 if(!await evaluate(`!!document.querySelector(${JSON.stringify(selector)})?.getClientRects().length`))await clickSelector('[aria-label="More field tools"]');
 await clickSelector(selector);
}
async function viewport(width,height,scale=1){window.setContentSize(width,height);window.webContents.setZoomFactor(scale);await settleNativeViewport(window,'toolbar viewport');}
async function snapshot(name){
 await settleNativeViewport(window,'toolbar settled');
 await evaluate('document.activeElement?.blur()');await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await wait("!document.querySelector('[role=tooltip]')",'capture without help');
 const layout=await evaluate(`(()=>{const t=document.querySelector('.field-command-toolbar'),r=t.getBoundingClientRect(),f=document.querySelector('.field-container').getBoundingClientRect();return {name:${JSON.stringify(name)},context:t.dataset.context,toolbar:r.toJSON(),field:f.toJSON(),viewport:[innerWidth,innerHeight],uiScale:Number(document.documentElement.style.getPropertyValue('--ui-scale'))||1,items:[...t.querySelectorAll('[data-toolbar-item]')].filter(n=>n.getClientRects().length).map(n=>({title:n.getAttribute('aria-label'),rect:n.getBoundingClientRect().toJSON()})),tabStops:t.querySelectorAll('[data-toolbar-item][tabindex="0"]').length};})()`);
 assert.equal(layout.tabStops,1,JSON.stringify(layout));
 assert.ok(layout.toolbar.height/layout.uiScale<=44,JSON.stringify(layout));
 assert.ok(layout.field.top>=layout.toolbar.bottom-1,JSON.stringify(layout));
 for(const n of layout.items){assert.ok(n.rect.top>=layout.toolbar.top&&n.rect.bottom<=layout.toolbar.bottom+1,JSON.stringify(layout));assert.ok(n.rect.right<=layout.toolbar.right+1,JSON.stringify(layout));}
 metrics.push(layout);await capturePage(window,output,name+'.png');return layout;
}
app.whenReady().then(async()=>{try{
 await waitFor(()=>!!window,'toolbar window');await wait("!!document.querySelector('.field-stage__svg')",'field');
 window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Page.enable');await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});window.webContents.reload();
 await wait(`!!${editor}&&${state}.preferences.status==='saved'`,'toolbar store');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 const project=JSON.parse(await fs.readFile(path.join(output,'fixture.json'),'utf8'));
 await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}});${editor}.dispatch('layout.preset',{preset:'write'});${editor}.dispatch('set.select',{index:1});`);
 await viewport(1366,768);await wait("document.querySelector('[role=toolbar][aria-label=\"Field tools\"]')?.dataset.context==='selection'",'selection context');
 const original=await evaluate(`JSON.stringify(${state}.project.present)`);
 const initial=await snapshot('selection-1366');assert.ok(initial.field.height>=470,JSON.stringify(initial));await viewport(1024,700);await snapshot('selection-1024');await viewport(1366,768);
 await evaluate("document.querySelector('[data-toolbar-item=\"view-2d\"]').focus()");await key('Right');assert.equal(await evaluate('document.activeElement.dataset.toolbarItem'),'view-3d');await key('End');assert.equal(await evaluate('document.activeElement.dataset.toolbarItem'),'more');await key('Down');
 await wait("!!document.activeElement.closest('.field-tools-menu')",'arrow enters More');await key('Escape');assert.equal(await evaluate('document.activeElement.dataset.toolbarItem'),'more');
 pass('field toolbar is one Tab stop with horizontal navigation and an escapable keyboard overflow menu');
 await action('Shared routes');await wait(`${state}.ui.dialog==='routes'`,'shared routes from More');await key('Escape');await wait(`!${state}.ui.dialog`,'route dialog dismissed');
 assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"),'More field tools','dialog returns to More');
 await evaluate(`${editor}.setValue('selection','selectedIds',${JSON.stringify(project.performers.slice(0,3).map(p=>p.id))})`);
 await wait("document.querySelector('.field-command-toolbar').dataset.context==='group'",'group context');await snapshot('group-1366');await viewport(1024,700);await snapshot('group-1024');await viewport(1366,768);
 assert.equal(await evaluate("document.querySelectorAll('.inspector .selection-actions,.inspector-scroll > button').length"),0);
 await action('Rotate selection');await wait(`!!${state}.ui.transformPreview`,'transform opened');
 await snapshot('preview-1366');await viewport(1024,700);await snapshot('preview-1024');await viewport(1366,768);assert.equal(await evaluate("document.querySelector('.field-command-toolbar [aria-label=\"3D preview\"]').getAttribute('aria-disabled')"),'true');
 await evaluate("document.querySelector('[aria-label=\"More field tools\"]').focus()");await key('Return');await wait("!!document.querySelector('.field-tools-menu:not([hidden])')",'Enter opens preview More without applying');assert.ok(await evaluate(`${state}.ui.transformPreview`));await key('Escape');assert.ok(await evaluate(`${state}.ui.transformPreview`),'first Escape closes More only');await key('Escape');await wait(`!${state}.ui.transformPreview`,'second Escape cancels preview');
 assert.equal(await evaluate(`JSON.stringify(${state}.project.present)`),original);
 await action('Rotate selection');await wait(`!!${state}.ui.transformPreview`,'new transform');
 await evaluate(`${editor}.dispatch('transform.update',{options:{...${state}.ui.transformPreview.options,angle:10}})`);
 await action('Apply transform');await wait(`${state}.project.past.length===1`,'one named undo');await evaluate(`${editor}.dispatch('history.undo')`);assert.equal(await evaluate(`JSON.stringify(${state}.project.present)`),original);
 pass('launchers move out of the Inspector; preview Apply/Cancel, nested Escape, exact geometry and named undo remain shared commands');
 await evaluate(`${editor}.setValue('selection','selectedIds',[${JSON.stringify(project.performers[0].id)}])`);
 await wait("document.querySelector('.field-command-toolbar').dataset.context==='performer'",'individual context');await snapshot('performer-1366');await viewport(1024,700);await snapshot('performer-1024');await viewport(1366,768);
 await action('Edit performer path');await wait(`${state}.ui.dialog==='path'`,'individual path launched');await key('Escape');await wait(`!${state}.ui.dialog`,'path closed');await key('Escape');
 await action('3D preview');await wait("document.querySelector('.field-command-toolbar').dataset.context==='3d'",'3D context');await wait("!!document.querySelector('.stage-three__canvas')||!!document.querySelector('.stage-three__fallback')",'3D loaded');
 assert.equal(await evaluate("document.querySelectorAll('.field-command-toolbar [data-command]:not([data-command=\"view.camera\"])').length"),0);
 await action('Front camera');await wait(`${state}.ui.camera.preset==='front'`,'front camera state');assert.equal(await evaluate("document.querySelector('.field-command-toolbar [aria-label=\"Front camera\"]').getAttribute('aria-pressed')"),'true');await snapshot('camera-1366');await viewport(1024,700);await snapshot('camera-1024');await viewport(1366,768);
 await action('2D field');await evaluate(`${editor}.dispatch('playback.toggle')`);await wait("document.querySelector('.field-command-toolbar').dataset.context==='playback'",'playback context');await snapshot('playback-1366');await viewport(1024,700);await snapshot('playback-1024');await viewport(1366,768);await action('Pause playback');await evaluate(`${editor}.dispatch('set.select',{index:1})`);
 pass('individual path entry, active 3D camera presets and playback contexts expose only applicable actions');
 for(const [width,height,scale,theme] of [[1024,700,1,'dark'],[1366,768,1,'light'],[1366,768,1,'high-contrast'],[1024,700,1.5,'dark']]){
   await viewport(width,height,scale);await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);
   await snapshot(`${theme}-${width}-${scale}`);
   await clickSelector('[aria-label="More field tools"]');await wait("!!document.querySelector('.field-tools-menu')",'narrow overflow');await capturePage(window,output,`more-${theme}-${width}-${scale}.png`);await key('Escape');
 }
 await evaluate(`${editor}.setValue('selection','selectedIds',${JSON.stringify(project.performers.slice(0,3).map(p=>p.id))})`);await viewport(900,650);await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:1.5}))`);await action('Rotate selection');await wait(`!!${state}.ui.transformPreview`,'narrow preview');await snapshot('preview-900-1.5');
 for(const name of ['Apply transform','Cancel transform'])assert.ok(await evaluate(`!!document.querySelector('.field-primary [aria-label="${name}"]')?.getClientRects().length`),'preview commits stay on the row');
 await action('Cancel transform');await wait(`!${state}.ui.transformPreview`,'narrow toolbar cancellation');
 assert.equal(await evaluate(`JSON.stringify(${state}.project.present)`),original);
 pass('default, narrow, enlarged and all-theme rows keep the field clear, expose overflow and preserve physical geometry');
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,metrics},null,2));app.exit(0);
}catch(error){console.error(error);if(window&&!window.isDestroyed()){console.error(await evaluate(`({context:document.querySelector('.field-command-toolbar')?.dataset.context,active:document.activeElement?.outerHTML,dialog:${state}.ui.dialog,toast:${state}.ui.toast})`).catch(()=>null));await capturePage(window,output,'failure.png').catch(()=>{});}app.exit(1);}});
