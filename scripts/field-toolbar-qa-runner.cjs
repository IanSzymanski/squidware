'use strict';
const assert=require('node:assert/strict');
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const {capturePage,key:sendKey,waitFor,settleNativeViewport,revealFieldTool}=require('./testing/renderer.cjs');
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
// The tool strip, the view controls over the field and the menus they open hold the field's commands. A tool the
// strip shows is clicked there. One that a narrow strip folded away, or that lives in a menu (Motion, Shape, Arrange,
// View options), is reached by opening the menu that owns it, as a writer would.
const strip='.field-command-toolbar',view='.canvas-view',focusedLabel="document.activeElement?.getAttribute('aria-label')";
const trigger=menu=>`button[aria-haspopup=menu][aria-label="${menu}"]`,opened=menu=>`[role=menu][aria-label="${menu}"]:not([hidden])`;
async function action(title){
 const located=await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const named=[...document.querySelectorAll('button[aria-label=${JSON.stringify(title)}]')],shown=n=>!!n.getClientRects().length;
  const tool=named.find(n=>shown(n)&&(n.closest(${JSON.stringify(strip+','+view)})||n.closest('[role=menu]')))??named.find(shown);
  if(tool){tool.setAttribute('data-qa-action','');resolve('tool');return;}
  const item=named.find(n=>{const menu=n.closest('[role=menu]');return menu&&[...document.querySelectorAll('[aria-controls]')].some(t=>t.getAttribute('aria-controls')===menu.id&&shown(t)&&t.closest(${JSON.stringify(strip+','+view)}));});
  if(item)item.setAttribute('data-qa-action','');resolve(item?'menu':null);})))`);
 assert.ok(located,`${title} is on the tool strip, the view controls or one of their menus`);
 if(located==='menu')await revealFieldTool(window,'[data-qa-action]');
 await clickSelector('[data-qa-action]');
 await evaluate("document.querySelectorAll('[data-qa-action]').forEach(n=>n.removeAttribute('data-qa-action'))");
}
async function viewport(width,height,scale=1){window.setContentSize(width,height);window.webContents.setZoomFactor(scale);await settleNativeViewport(window,'toolbar viewport');}
async function snapshot(name){
 await settleNativeViewport(window,'toolbar settled');
 await evaluate('document.activeElement?.blur()');await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await wait("!document.querySelector('[role=tooltip]')",'capture without help');
 const layout=await evaluate(`(()=>{const t=document.querySelector(${JSON.stringify(strip)}),r=t.getBoundingClientRect(),f=document.querySelector('.field-container').getBoundingClientRect(),v=document.querySelector(${JSON.stringify(view)});const shown=n=>!!n.getClientRects().length;return {name:${JSON.stringify(name)},context:t.dataset.context,toolbar:r.toJSON(),field:f.toJSON(),viewport:[innerWidth,innerHeight],uiScale:Number(document.documentElement.style.getPropertyValue('--ui-scale'))||1,items:[...t.querySelectorAll('button')].filter(shown).map(n=>({title:n.getAttribute('aria-label'),rect:n.getBoundingClientRect().toJSON()})),tabStops:[...t.querySelectorAll('button')].filter(n=>shown(n)&&n.tabIndex===0).length,hiddenStops:[...t.querySelectorAll('button')].filter(n=>!shown(n)&&n.tabIndex===0).length,viewStops:[...v.querySelectorAll('button')].filter(n=>shown(n)&&n.tabIndex===0).length,viewItems:[...v.querySelectorAll('button')].filter(shown).map(n=>({title:n.getAttribute('aria-label'),rect:n.getBoundingClientRect().toJSON()}))};})()`);
 assert.equal(layout.tabStops,1,JSON.stringify(layout));assert.equal(layout.hiddenStops,0,JSON.stringify(layout));assert.equal(layout.viewStops,1,JSON.stringify(layout));
 assert.ok(layout.items.length>0,JSON.stringify(layout));
 assert.ok(layout.toolbar.height/layout.uiScale<=44,JSON.stringify(layout));
 assert.ok(layout.field.top>=layout.toolbar.bottom-1,JSON.stringify(layout));
 for(const n of layout.items){assert.ok(n.rect.top>=layout.toolbar.top&&n.rect.bottom<=layout.toolbar.bottom+1,JSON.stringify(layout));assert.ok(n.rect.left>=layout.toolbar.left-1&&n.rect.right<=layout.toolbar.right+1,`${n.title} (${n.rect.left}–${n.rect.right}) is inside the ${layout.toolbar.width} px tool strip (${layout.toolbar.left}–${layout.toolbar.right}) in ${name}: ${JSON.stringify(layout)}`);}
 // The view controls float in the field's apron: inside the field area and never over the tool strip.
 for(const n of layout.viewItems){assert.ok(n.rect.top>=layout.toolbar.bottom-1&&n.rect.left>=layout.field.left&&n.rect.right<=layout.field.right+1,`${n.title} is inside the field area: ${JSON.stringify(layout)}`);}
 metrics.push(layout);await capturePage(window,output,name+'.png');return layout;
}
const commands=()=>evaluate(`[...new Set([...document.querySelectorAll(${JSON.stringify(strip+' [data-command]')})].map(n=>n.dataset.command))].sort()`);
app.whenReady().then(async()=>{try{
 await waitFor(()=>!!window,'toolbar window');await wait("!!document.querySelector('.field-stage__svg')",'field');
 window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Page.enable');await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});window.webContents.reload();
 await wait(`!!${editor}&&${state}.preferences.status==='saved'`,'toolbar store');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 const project=JSON.parse(await fs.readFile(path.join(output,'fixture.json'),'utf8'));
 await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}});${editor}.dispatch('layout.preset',{preset:'write'});${editor}.dispatch('set.select',{index:1});`);
 await viewport(1366,768);await wait("document.querySelector('[role=toolbar][aria-label=\"Field tools\"]')?.dataset.context==='selection'",'selection context');
 const original=await evaluate(`JSON.stringify(${state}.project.present)`);
 const initial=await snapshot('selection-1366');assert.ok(initial.field.height>=470,JSON.stringify(initial));await viewport(1024,700);await snapshot('selection-1024');await viewport(1366,768);
 // Each toolbar is one Tab stop: arrows, Home and End move inside it, and Tab leaves it.
 await evaluate("document.querySelector('[data-toolbar-item=\"view-2d\"]').focus()");await key('Right');assert.equal(await evaluate('document.activeElement.dataset.toolbarItem'),'view-3d');
 await key('End');assert.equal(await evaluate(`document.activeElement===[...document.querySelectorAll(${JSON.stringify(view+' button')})].filter(n=>n.getClientRects().length).at(-1)`),true,'End reaches the last view control');
 await key('Home');assert.equal(await evaluate(focusedLabel),'Travel paths');
 await evaluate(`document.querySelector(${JSON.stringify(strip+' [aria-label="Select performers"]')}).focus()`);await key('Right');assert.equal(await evaluate(focusedLabel),'Lasso selection');
 await key('End');assert.equal(await evaluate(focusedLabel),'Collapse Inspector');await key('Home');assert.equal(await evaluate(focusedLabel),'Select performers');
 await key('Left');assert.equal(await evaluate(focusedLabel),'Collapse Inspector','Left wraps from the first tool to the last');
 await key('Left');assert.equal(await evaluate(focusedLabel),'Staging props');await key('Left');assert.equal(await evaluate(`${focusedLabel}+'|'+document.activeElement.getAttribute('aria-haspopup')`),'Motion|menu');
 assert.equal(await evaluate(`[...document.querySelectorAll(${JSON.stringify(strip+' button')})].filter(n=>n.tabIndex===0).map(n=>n.getAttribute('aria-label')).join()`),'Motion','the tool strip keeps one Tab stop, on the control used last');
 await key('Tab');await wait(`!document.activeElement.closest(${JSON.stringify(strip)})&&document.activeElement!==document.body`,'Tab leaves the tool strip');
 await key('Tab',['shift']);await wait(`${focusedLabel}==='Motion'&&!!document.activeElement.closest(${JSON.stringify(strip)})`,'Shift+Tab returns to the control used last');
 await key('Down');
 await wait(`!!document.activeElement.closest(${JSON.stringify(opened('Motion'))})`,'arrow enters Motion');await key('Escape');await wait(`document.activeElement===document.querySelector(${JSON.stringify(trigger('Motion'))})&&!document.querySelector(${JSON.stringify(opened('Motion'))})`,'Escape returns to the Motion button');
 pass('field toolbar is one Tab stop with horizontal navigation and an escapable keyboard overflow menu');
 await action('Shared routes');await wait(`${state}.ui.dialog==='routes'`,'shared routes from Motion');await key('Escape');await wait(`!${state}.ui.dialog && document.activeElement===document.querySelector(${JSON.stringify(trigger('Motion'))})`,'route editor returns focus to Motion');
 assert.equal(await evaluate(focusedLabel),'Motion','dialog returns to Motion');
 await key('Down');await wait(`!!document.activeElement.closest(${JSON.stringify(opened('Motion'))})`,'menu focus before changing context');
 const menuFocus=await evaluate(focusedLabel);
 await evaluate(`${editor}.setValue('selection','selectedIds',[${JSON.stringify(project.performers[0].id)}])`);
 // Tools stay where they are when the selection changes, so the open menu keeps its focused action. It is now available.
 await wait(`document.querySelector(${JSON.stringify(strip)}).dataset.context==='performer' && ${focusedLabel}===${JSON.stringify(menuFocus)} && !!document.activeElement.closest(${JSON.stringify(opened('Motion'))}) && !!document.activeElement.getClientRects().length && document.activeElement.getAttribute('aria-disabled')!=='true'`,'context change preserves a visible toolbar focus stop');
 await key('Escape');await wait(`document.activeElement===document.querySelector(${JSON.stringify(trigger('Motion'))})&&!document.querySelector(${JSON.stringify(opened('Motion'))})`,'Escape returns to the visible Motion button after the context change');
 pass('changing selection while Motion owns focus keeps a visible focus stop and Escape returns to the trigger');
 await viewport(1024,720,1.5);await evaluate(`document.querySelector(${JSON.stringify(trigger('Motion'))}).focus()`);await key('Down');
 await wait(`!!document.activeElement?.closest(${JSON.stringify(opened('Motion'))}) && document.querySelector('[role=tooltip] strong')?.textContent===document.activeElement.getAttribute('aria-label')`,'keyboard help in narrow overflow');
 await action('Edit movement timing');await wait(`${state}.ui.dialog==='movement-schedule'`,'pointer opens timing beside keyboard menu help');await key('Escape');await wait(`!${state}.ui.dialog && document.activeElement===document.querySelector(${JSON.stringify(trigger('Motion'))})`,'timing editor returns focus to Motion');await viewport(1366,768);
 pass('keyboard overflow help does not intercept a pointer click on a neighboring action');
 await evaluate(`${editor}.setValue('selection','selectedIds',${JSON.stringify(project.performers.slice(0,3).map(p=>p.id))})`);
 await wait(`document.querySelector(${JSON.stringify(strip)}).dataset.context==='group'`,'group context');await snapshot('group-1366');await viewport(1024,700);await snapshot('group-1024');await viewport(1366,768);
 assert.equal(await evaluate("document.querySelectorAll('.inspector .selection-actions,.inspector-scroll > button').length"),0);
 await action('Rotate selection');await wait(`!!${state}.ui.transformPreview`,'transform opened');
 // A preview owns the strip: its name, Cancel and Apply, and the panel button. Nothing else can start from there.
 assert.deepEqual(await commands(),['transform.apply','transform.cancel']);
 await snapshot('preview-1366');await viewport(1024,700);await snapshot('preview-1024');await viewport(1366,768);assert.equal(await evaluate(`document.querySelector(${JSON.stringify(view+' [aria-label="3D preview"]')}).getAttribute('aria-disabled')`),'true');
 await evaluate(`document.querySelector(${JSON.stringify(trigger('View options'))}).focus()`);await key('Return');await wait(`!!document.querySelector(${JSON.stringify(opened('View options'))})`,'Enter opens a menu during a preview without applying');assert.ok(await evaluate(`${state}.ui.transformPreview`));await key('Escape');await wait(`!document.querySelector(${JSON.stringify(opened('View options'))})`,'first Escape closes the menu');assert.ok(await evaluate(`${state}.ui.transformPreview`),'first Escape closes the menu only');await key('Escape');await wait(`!${state}.ui.transformPreview`,'second Escape cancels preview');
 assert.equal(await evaluate(`JSON.stringify(${state}.project.present)`),original);
 await action('Rotate selection');await wait(`!!${state}.ui.transformPreview`,'new transform');
 await evaluate(`${editor}.dispatch('transform.update',{options:{...${state}.ui.transformPreview.options,angle:10}})`);
 await action('Apply transform');await wait(`${state}.project.past.length===1`,'one named undo');await evaluate(`${editor}.dispatch('history.undo')`);assert.equal(await evaluate(`JSON.stringify(${state}.project.present)`),original);
 pass('launchers move out of the Inspector; preview Apply/Cancel, nested Escape, exact geometry and named undo remain shared commands');
 await evaluate(`${editor}.setValue('selection','selectedIds',[${JSON.stringify(project.performers[0].id)}])`);
 await wait(`document.querySelector(${JSON.stringify(strip)}).dataset.context==='performer'`,'individual context');await snapshot('performer-1366');await viewport(1024,700);await snapshot('performer-1024');await viewport(1366,768);
 await action('Edit performer path');await wait(`${state}.ui.dialog==='path'`,'individual path launched');await key('Escape');await wait(`!${state}.ui.dialog`,'path closed');await key('Escape');
 await action('3D preview');await wait(`document.querySelector(${JSON.stringify(strip)}).dataset.context==='3d'`,'3D context');await wait("!!document.querySelector('.stage-three__canvas')||!!document.querySelector('.stage-three__fallback')",'3D loaded');
 // The 3D strip holds cameras and review (passages, problems, video), and no editing tools.
 assert.deepEqual(await commands(),['analysis.problems-open','dialog.open','rehearsal.open','view.camera']);
 assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(strip+' button')})].filter(n=>n.getClientRects().length).map(n=>n.getAttribute('aria-label'))`),['Perspective camera','Front camera','Press box camera','Overhead camera','Rehearsal passages','Show-wide problems','Rehearsal video','Collapse Inspector']);
 await action('Front camera');await wait(`${state}.ui.camera.preset==='front'`,'front camera state');assert.equal(await evaluate(`document.querySelector(${JSON.stringify(strip+' [aria-label="Front camera"]')}).getAttribute('aria-pressed')`),'true');await snapshot('camera-1366');await viewport(1024,700);await snapshot('camera-1024');await viewport(1366,768);
 await action('2D field');await evaluate(`${editor}.dispatch('playback.toggle')`);await wait(`document.querySelector(${JSON.stringify(strip)}).dataset.context==='playback'`,'playback context');
 // Playing: the strip says so and offers the way back to editing, and no tools; Pause is in the transport.
 assert.deepEqual(await commands(),[]);
 const playing=await evaluate(`({status:document.querySelector(${JSON.stringify(strip+' [role=status] strong')})?.textContent,buttons:[...document.querySelectorAll(${JSON.stringify(strip+' button')})].filter(n=>n.getClientRects().length).map(n=>n.getAttribute('aria-label'))})`);
 assert.equal(playing.status,'Playing');assert.equal(playing.buttons.length,2,JSON.stringify(playing));assert.match(playing.buttons[0],/^Go to set \d+ to edit$/);assert.equal(playing.buttons[1],'Collapse Inspector');
 await snapshot('playback-1366');await viewport(1024,700);await snapshot('playback-1024');await viewport(1366,768);await action('Pause playback');await wait(`!${state}.playback.playing`,'paused from the transport');await evaluate(`${editor}.dispatch('set.select',{index:1})`);
 pass('individual path entry, active 3D camera presets and playback contexts expose only applicable actions');
 for(const [width,height,scale,theme] of [[1024,700,1,'dark'],[1366,768,1,'light'],[1366,768,1,'high-contrast'],[1024,700,1.5,'dark']]){
   await viewport(width,height,scale);await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`);
   await snapshot(`${theme}-${width}-${scale}`);
   await clickSelector(trigger('Motion'));await wait(`!!document.querySelector(${JSON.stringify(opened('Motion'))})`,'narrow overflow');
   const menu=await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const m=document.querySelector(${JSON.stringify(opened('Motion'))}).getBoundingClientRect();resolve({rect:m.toJSON(),viewport:[innerWidth,innerHeight],items:document.querySelectorAll(${JSON.stringify(opened('Motion')+' [role=menuitem]')}).length});})))`);
   assert.ok(menu.items>=9&&menu.rect.left>=0&&menu.rect.top>=0&&menu.rect.right<=menu.viewport[0]+1&&menu.rect.bottom<=menu.viewport[1]+1,`the Motion menu opens inside the window: ${JSON.stringify(menu)}`);
   await capturePage(window,output,`more-${theme}-${width}-${scale}.png`);await key('Escape');await wait(`!document.querySelector(${JSON.stringify(opened('Motion'))})`,'menu closed');
 }
 await evaluate(`${editor}.setValue('selection','selectedIds',${JSON.stringify(project.performers.slice(0,3).map(p=>p.id))})`);await viewport(900,650);await evaluate(`${editor}.setValue('preferences','value',p=>({...p,uiScale:1.5}))`);await action('Rotate selection');await wait(`!!${state}.ui.transformPreview`,'narrow preview');await snapshot('preview-900-1.5');
 // The preview's panel opens over the field here. Apply and Cancel stay on the strip, clear of it.
 for(const name of ['Apply transform','Cancel transform'])assert.ok(await evaluate(`(n=>{if(!n?.getClientRects().length)return false;const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})(document.querySelector(${JSON.stringify(strip+` .toolbar-commit [aria-label="${name}"]`)}))`),'preview commits stay on the row');
 await action('Cancel transform');await wait(`!${state}.ui.transformPreview`,'narrow toolbar cancellation');
 assert.equal(await evaluate(`JSON.stringify(${state}.project.present)`),original);
 pass('default, narrow, enlarged and all-theme rows keep the field clear, expose overflow and preserve physical geometry');
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,metrics},null,2));app.exit(0);
}catch(error){console.error(error);if(window&&!window.isDestroyed()){console.error(await evaluate(`({context:document.querySelector('.field-command-toolbar')?.dataset.context,active:document.activeElement?.outerHTML.slice(0,300),dialog:${state}.ui.dialog,toast:${state}.ui.toast})`).catch(()=>null));await capturePage(window,output,'failure.png').catch(()=>{});}app.exit(1);}});
