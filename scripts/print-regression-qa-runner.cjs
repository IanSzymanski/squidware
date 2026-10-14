'use strict';
const {app,BrowserWindow,dialog}=require('electron');const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
const manifest=require(process.argv.find(arg=>arg.startsWith('--print-manifest=')).slice('--print-manifest='.length));
const {root,output,profile,cases}=manifest;app.setPath('userData',profile);let window;let destination;const results=[];
BrowserWindow.prototype.show=function(){};dialog.showMessageBox=async()=>({response:1});dialog.showSaveDialog=async()=>({canceled:false,filePath:destination});
app.on('browser-window-created',(_event,created)=>{window=created;window.webContents.setBackgroundThrottling(false);});require(path.join(root,'electron/main.cjs'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));const evaluate=source=>window.webContents.executeJavaScript(source);
async function wait(source,label){const start=Date.now();while(Date.now()-start<30000){if(await evaluate(source))return;await pause(20);}throw new Error('Timed out: '+label);}
function instrument(){window.__printQA={editor:null};window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(){return 1;},onCommitFiberRoot(_id,root){function visit(fiber){if(!fiber)return;const value=fiber.memoizedProps?.value;if(value?.getState&&value?.dispatch)window.__printQA.editor=value;visit(fiber.child);visit(fiber.sibling);}visit(root.current);},onCommitFiberUnmount(){},onPostCommitFiberRoot(){}};}
const editor='window.__printQA.editor';const timeout=setTimeout(()=>{console.error('Print QA timed out');app.exit(1);},230000);
app.whenReady().then(async()=>{try{
  while(!window)await pause(20);await wait("!!document.querySelector('.set-card')",'initial renderer');window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Page.enable');await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});
  window.webContents.reload();await wait('!!window.__printQA?.editor','editor');
  for(const entry of cases){const project=JSON.parse(await fs.readFile(entry.fixture,'utf8'));destination=path.join(output,entry.name+'.pdf');
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}});${editor}.setValue('ui','dialog',null);${editor}.setValue('preferences','value',{...${editor}.getState().preferences.value,paperSize:${JSON.stringify(entry.paper)}});${editor}.setValue('ui','printMode',${JSON.stringify(entry.mode)});${editor}.setValue('ui','printing',true)`);
    await wait(`document.querySelectorAll('#print-output .print-page').length===${entry.mode==='charts'?project.sets.length:project.performers.length}`,'print DOM');
    // Wait for fonts and layout, then exercise the actual sender-checked native PDF handler.
    await evaluate('document.fonts.ready');await pause(150);
    const dom=await evaluate("Array.from(document.querySelectorAll('#print-output .print-page')).map(page=>({charts:page.querySelectorAll('svg').length,rows:page.querySelectorAll('tbody tr').length}))");
    if(entry.coordinateRows)assert.equal(dom.reduce((sum,page)=>sum+page.rows,0),entry.coordinateRows);
    if(entry.mode==='charts') {
      const positions=await evaluate("Array.from(document.querySelectorAll('#print-output .print-page')).map(page=>Object.fromEntries(Array.from(page.querySelectorAll('[data-performer-id]')).map(dot=>[dot.dataset.performerId,dot.getAttribute('transform')])))");
      project.sets.forEach((set,index)=>project.performers.forEach(person=>{const point=set.positions[person.id];assert.equal(positions[index][person.id],`translate(${point.x} ${point.y})`);}));
    }
    const saved=await evaluate(`window.squidware.exportPdf(${JSON.stringify(entry.paper)})`);assert.equal(saved,destination);assert.ok((await fs.stat(destination)).size>1000);
    await evaluate(`${editor}.setValue('ui','printing',false)`);results.push({name:entry.name,paper:entry.paper,mode:entry.mode,fixtureBytes:(await fs.stat(entry.fixture)).size,performers:project.performers.length,sets:project.sets.length,dom,pdfBytes:(await fs.stat(destination)).size});console.log('PASS native PDF '+entry.name);
  }
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({...manifest,results,platform:process.platform,electron:process.versions.electron,gpu:app.getGPUFeatureStatus(),gpuInfo:await app.getGPUInfo('basic')},null,2));clearTimeout(timeout);app.exit(0);
}catch(error){console.error(error);clearTimeout(timeout);app.exit(1);}});
