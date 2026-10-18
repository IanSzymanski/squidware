'use strict';
const { capturePage, key: sendKey, waitFor } = require('./testing/renderer.cjs');
const { app, BrowserWindow, dialog, Menu } = require('electron');
const fs = require('node:fs/promises'); const path = require('node:path');
const { root, output, profile, fixture } = require(process.argv.find(arg=>arg.startsWith('--coordinate-manifest=')).slice('--coordinate-manifest='.length));
app.disableHardwareAcceleration(); app.setPath('userData', profile);
BrowserWindow.prototype.show = function () {};
dialog.showMessageBox = async () => ({ response: 1 });
const saved=path.join(output,'applied.squid');
dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});
let window; let failure; const checks = [];
app.on('browser-window-created', (_event, created) => {
  window = created; window.webContents.setBackgroundThrottling(false);
  window.webContents.on('console-message', details => { if(details.level==='error')console.error(details.message); });
  window.webContents.on('render-process-gone', (_event, details) => { failure = new Error(`Renderer exited: ${details.reason}`); });
});
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const editor = 'window.__coordinateQA.editor'; const state = editor+'.getState()';
const wait = (source,label) => waitFor(()=>evaluate(source),label,{timeoutMs:20000,failure:()=>failure});
function instrument() {
  window.__coordinateQA = { editor: null };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber:true,renderers:new Map(),inject(){return 1;},
    onCommitFiberRoot(_id,root){function visit(f){if(!f)return;const v=f.memoizedProps?.value;if(v?.getState && v?.dispatch)window.__coordinateQA.editor=v;visit(f.child);visit(f.sibling);}visit(root.current);},
    onCommitFiberUnmount(){},onPostCommitFiberRoot(){} };
}
const capture = name => capturePage(window,output,name);
const key = (keyCode,modifiers=[]) => sendKey(window,keyCode,modifiers,20);
const pass = label => {checks.push(label);console.log('PASS '+label);};
app.whenReady().then(async()=>{
  try {
    await waitFor(()=>!!window,'Coordinate entry window'); await wait("!!document.querySelector('.field-stage__svg')",'initial renderer');
    window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});
    window.webContents.reload(); await wait(`!!${editor}`,'Coordinate entry store');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
    const project = JSON.parse(await fs.readFile(fixture,'utf8'));
    const metrics = await require('./coordinate-entry-qa.cjs')({project,editor,state,evaluate,wait,key,capture,window,pass,saved,Menu});
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({passed:checks,metrics,platform:process.platform},null,2));
    app.exit(0);
  } catch(error) {console.error(error);if(window && !window.isDestroyed())await capture('failure.png').catch(()=>{});app.exit(1);}
});
