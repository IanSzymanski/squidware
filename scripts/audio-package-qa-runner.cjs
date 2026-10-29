'use strict';
const assert = require('node:assert/strict');
const { app, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key, selectNativeOption, waitFor, pause, settleNativeViewport } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--audio-package-manifest=')).slice('--audio-package-manifest='.length));
const { root, output, profile, recording, files } = manifest;
app.disableHardwareAcceleration(); app.setPath('userData', profile);
let openPath, savePath, confirmation = 1, lastReview, window, failure;
dialog.showOpenDialog = async () => openPath ? { filePaths: [openPath] } : { canceled: true };
dialog.showSaveDialog = async () => savePath ? { filePath: savePath } : { canceled: true };
dialog.showMessageBox = async (_window, options) => { lastReview = options; return { response: confirmation }; };
app.on('browser-window-created', (_e, created) => { window = created; window.webContents.setBackgroundThrottling(false); window.webContents.on('render-process-gone', (_e,d) => failure = new Error(d.reason)); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const store = 'window.__packageQA.editor', state = store + '.getState()', media = 'document.querySelector("audio")';
const checks = [], viewports = [];
const wait = (expression, label) => waitFor(() => evaluate(expression), label, { failure: () => failure });
const pass = message => { checks.push(message); console.log('PASS ' + message); };
function instrument() {
  const qa = window.__packageQA = { editor: null, errors: [] };
  window.confirm = () => true;
  window.addEventListener('error', e => qa.errors.push(e.message)); window.addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) qa.editor = v; visit(f.child); visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
const button = label => `[aria-label="${label}"]`;
async function click(selector) {
  const point = await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)}); if(!n || n.disabled) throw new Error('Unavailable '+${JSON.stringify(selector)});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  window.webContents.sendInputEvent({ type:'mouseDown', ...point, button:'left', clickCount:1 }); window.webContents.sendInputEvent({ type:'mouseUp', ...point, button:'left', clickCount:1 });
}
async function pressButton(label) {
  await evaluate(`([...document.querySelectorAll('.modal button')].find(n=>n.textContent.trim()===${JSON.stringify(label)}) || document.querySelector(${JSON.stringify(button(label))})).focus()`);
  await key(window,'Return');
}
async function capture(name) {
  await evaluate(`${store}.setValue('ui','toast','');document.activeElement?.blur()`);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
  await wait("!document.querySelector('[role=tooltip]')",'help dismissed for capture');
  await capturePage(window,output,name);
  viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container')?.getBoundingClientRect().height,modal:document.querySelector('.modal')?.getBoundingClientRect().toJSON()})`));
}
async function open(filename) {
  openPath=filename; const epoch=await evaluate(state+'.ui.projectEpoch'); await evaluate(`${store}.setValue('ui','toast','');document.activeElement?.blur()`); await key(window,'O',[process.platform==='darwin'?'meta':'control']);
  await wait(`${state}.ui.projectEpoch!==${epoch} || ${state}.ui.toast.includes('Could not open')`, 'project open result');
  await wait(`${state}.fileSession.fileOperation===null`, 'project dialog closed');
}
async function showPackage() { await evaluate(`${store}.dispatch('dialog.open',{dialog:'package'})`); await wait("!!document.querySelector('[aria-label=\"Audio storage\"]')",'package preview'); }
async function exportPackage(mode, filename) {
  await showPackage(); await selectNativeOption(window,button('Audio storage'),mode); savePath=filename;
  await pressButton('Export package…'); await wait(`${state}.fileSession.fileOperation===null`, 'export completed');
}
app.whenReady().then(async () => {
  try {
    await waitFor(()=>!!window,'window'); await wait("!!document.querySelector('.set-card')",'renderer'); window.show(); window.focus();
    window.setContentSize(1366,768); window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`}); window.webContents.reload();
    await wait(`!!${store} && ${state}.preferences.status==='saved'`,'editor and preferences');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
    await wait("['Recovery ready','Recovery copies available','Recovery copy saved'].includes(document.querySelector('.recovery-indicator')?.textContent)",'recovery');
    await evaluate(`${store}.setValue('ui','dialog',null)`); await capture('audio-before.png');
    await showPackage(); assert.ok(await evaluate("[...document.querySelectorAll('.modal button')].find(n=>n.textContent==='Export package…').disabled"));
    await capture('package-empty.png'); await pressButton('Close dialog'); await wait(`${state}.ui.dialog===null`,'modal closed'); await wait(`${state}.ui.dialog===null`,'preview closed');
    openPath=recording; await click(button('Attach audio')); await wait(`${state}.fileSession.audioToken && !${state}.fileSession.audioLoading && ${media}.readyState>=3`,'native recording decoded');
    await evaluate(`${store}.dispatch('project.update',{audioOffsetSeconds:2})`);
    const expected=await evaluate(`${state}.project.present`), savedRevision=await evaluate(`${state}.fileSession.savedRevision`);
    const bundled=path.join(files,'bundled.squidpack');
    await showPackage(); await capture('package-dark.png'); await key(window,'Tab'); assert.ok(await evaluate("document.querySelector('.modal').contains(document.activeElement)"));
    confirmation=0; await exportPackage('bundle',bundled); assert.equal(await fs.stat(bundled).catch(()=>null),null); assert.equal(await evaluate(state+'.ui.dialog'),'package');
    confirmation=1; await exportPackage('bundle',bundled); assert.match(lastReview.detail,/recording.wav/); assert.match(lastReview.detail,/Package size: \d+ bytes/); assert.match(lastReview.detail,/no upload/);
    assert.equal(await evaluate(state+'.fileSession.savedRevision'),savedRevision); pass('native attach, package preview, keyboard activation and cancel; export does not mark plain project saved');
    const transferred=path.join(files,'Transferred'); await fs.mkdir(transferred,{recursive:true}); const copied=path.join(transferred,'renamed.squidpack'); await fs.copyFile(bundled,copied);
    await open(copied); await wait(`${state}.fileSession.audioName==='recording.wav' && ${media}.readyState>=3 && !${state}.fileSession.audioLoading`,'bundled audio reopened');
    assert.deepEqual(await evaluate(state+'.project.present'),expected); assert.equal(await evaluate(media+'.duration'),60);
    await evaluate(`${store}.dispatch('playback.scrub',{count:10})`); await wait(`Math.abs(${media}.currentTime-${2 + 600 / expected.moves[0].tempo})<.01`,'restored offset seeks recording');
    await evaluate('document.activeElement?.blur()'); await key(window,'Space'); await wait(`${state}.playback.clockStatus==='Audio clock' && ${state}.playback.count>10.1`,'package media playback'); await key(window,'Space');
    await capture('package-reopened.png'); pass('transferred bundle restores the exact drill and recording, offset and actual media-clock playback');
    openPath=recording; await click(button('Replace audio')); await wait(`${state}.fileSession.audioReferenceAvailable && !${state}.fileSession.audioLoading`,'local reference recording');
    const reference=path.join(files,'referenced.squidpack'); await exportPackage('reference',reference); assert.match(lastReview.detail,/Reference: recording.wav/);
    const folder=path.join(files,'Renamed-folder'); await fs.mkdir(folder,{recursive:true}); const moved=path.join(folder,'show.squidpack'); await fs.copyFile(reference,moved); await fs.copyFile(recording,path.join(folder,'recording.wav'));
    await open(moved); await wait(`${state}.fileSession.audioUrl && !${state}.fileSession.audioLoading`,'relative audio in renamed folder'); assert.deepEqual(await evaluate(state+'.project.present'),expected);
    await fs.rename(path.join(folder,'recording.wav'),path.join(folder,'relinked.wav')); await open(moved);
    await wait(`${state}.fileSession.audioWarning.includes('Missing or changed')`,'persistent missing recording message'); assert.deepEqual(await evaluate(state+'.project.present'),expected); assert.equal(await evaluate(state+'.fileSession.audioUrl'),'');
    await capture('package-missing.png'); openPath=path.join(folder,'relinked.wav');
    await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent==='Relink audio').focus()"); await key(window,'Return');
    await wait(`${state}.fileSession.audioName==='relinked.wav' && !${state}.fileSession.audioWarning && ${media}.readyState>=3`,'recording relinked'); assert.deepEqual(await evaluate(state+'.project.present'),expected);
    pass('relative recording relocates with its folder; missing audio preserves drill/offset and keyboard relink restores playback');
    const corrupt=path.join(files,'corrupt.squidpack'); await fs.writeFile(corrupt,'malformed archive'); await open(corrupt); await wait(`${state}.ui.toast.includes('Could not open')`,'malformed package error'); assert.deepEqual(await evaluate(state+'.project.present'),expected);
    pass('malformed package leaves the active production and recording intact');
    for (const theme of ['light','high-contrast']) {
      await evaluate(`${store}.setValue('preferences','value',p=>({...p,theme:${JSON.stringify(theme)}}))`); await showPackage(); await capture('package-'+theme+'.png'); await pressButton('Close dialog'); await wait(`${state}.ui.dialog===null`,'modal closed');
    }
    await evaluate(`${store}.setValue('preferences','value',p=>({...p,theme:'dark',uiScale:1.5}))`); window.setContentSize(1024,720); await settleNativeViewport(window); await showPackage(); await capture('package-enlarged.png');
    await evaluate("document.querySelector('[aria-label=\"Audio storage\"]').focus()"); await key(window,'Tab'); await key(window,'Tab'); await key(window,'Tab');
    const reachable=await evaluate("(() => {const n=document.activeElement,r=n.getBoundingClientRect();return {text:n.textContent,top:r.top,bottom:r.bottom,height:innerHeight};})()");
    assert.match(reachable.text,/Export package/); assert.ok(reachable.top>=0 && reachable.bottom<=reachable.height,JSON.stringify(reachable));
    await capture('package-enlarged-controls.png');
    pass('shared dark/light/high-contrast styles and keyboard-reachable package controls at 1024×720 and 150% scale');
    assert.deepEqual(await evaluate('window.__packageQA.errors'),[]);
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,viewports,source:manifest.source,runtime:manifest.runtime,note:'Real production renderer, preload and native handlers. Dialog selection/confirmation is controlled; keyboard and pointer input is native. Generated WAV; no physical output qualification.'},null,2)); app.exit(0);
  } catch(error) { console.error(error); console.error(await evaluate(`({file:${state}.fileSession,toast:${state}.ui.toast,dialog:${state}.ui.dialog,errors:window.__packageQA.errors})`).catch(()=>null)); await capturePage(window,output,'failure.png').catch(()=>{}); await fs.writeFile(path.join(output,'failure.txt'),error.stack); app.exit(1); }
});
