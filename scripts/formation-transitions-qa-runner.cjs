'use strict';
const {capturePage,key:sendKey,keyWithRelease,waitFor}=require('./testing/renderer.cjs');
const {app,BrowserWindow,dialog,Menu}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const {root,output,profile,fixture,largeFixtures,bundle}=require(process.argv.find(a=>a.startsWith('--transition-manifest=')).slice('--transition-manifest='.length));
app.disableHardwareAcceleration();app.setPath('userData',profile);BrowserWindow.prototype.show=function(){};
const saved=path.join(output,'applied.squid');dialog.showMessageBox=async()=>({response:1});dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});
let window,failure;const checks=[];
app.on('browser-window-created',(_e,w)=>{window=w;w.webContents.setBackgroundThrottling(false);w.webContents.on('render-process-gone',(_e,d)=>{failure=Error(d.reason);});});
require(path.join(root,'electron/main.cjs'));
const editor='window.__transitionQA.editor',state=editor+'.getState()',evaluate=s=>window.webContents.executeJavaScript(s);
const wait=(s,label)=>waitFor(()=>evaluate(s),label,{timeoutMs:35000,failure:()=>failure});
const key=(code,modifiers=[])=>code==='Return'?keyWithRelease(window,code,modifiers,{releaseKey:'Enter'}):sendKey(window,code,modifiers,20);
function instrument(){window.__transitionQA={editor:null};window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(){return 1;},onCommitFiberRoot(_id,root){function walk(f){if(!f)return;const v=f.memoizedProps?.value;if(v?.getState&&v?.dispatch)window.__transitionQA.editor=v;walk(f.child);walk(f.sibling);}walk(root.current);},onCommitFiberUnmount(){},onPostCommitFiberRoot(){}};}
const capture=name=>capturePage(window,output,name),pass=s=>{checks.push(s);console.log('PASS '+s);};
app.whenReady().then(async()=>{try{
 await waitFor(()=>!!window,'transition window');await wait("!!document.querySelector('.field-stage__svg')",'renderer');
 window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Page.enable');await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});window.webContents.reload();await wait(`!!${editor}&&${state}.preferences.status==='saved'`,'transition store');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 const api=require(bundle),project=api.parseProject(await fs.readFile(fixture,'utf8'));
 const metrics=await require('./formation-transitions-qa.cjs')({api,project,largeFixtures,editor,state,evaluate,wait,key,capture,window,pass,saved,Menu});
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({passed:checks,metrics,platform:process.platform},null,2));app.exit(0);
}catch(error){console.error(error);if(window&&!window.isDestroyed()){console.error(await evaluate(`({dialog:${state}.ui.dialog,toast:${state}.ui.toast,alerts:[...document.querySelectorAll('[role=alert]')].map(n=>n.textContent)})`).catch(()=>null));await capture('failure.png').catch(()=>{});}app.exit(1);}});
