'use strict';
const assert = require('node:assert/strict');
const { app, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key: sendKey, keyWithRelease, waitFor, settleNativeViewport, selectNativeOption, installConfirmShim } = require('./testing/renderer.cjs');
const manifest = require(process.argv.find(a => a.startsWith('--templates-manifest=')).slice('--templates-manifest='.length));
const { root, output, profile, files, bundle } = manifest;
const { createDemoProject, parseProject, parseTemplateLibrary } = require(bundle);
const phase = process.argv.find(a => a.startsWith('--phase=')).slice('--phase='.length);
app.disableHardwareAcceleration(); app.setPath('userData', profile);
let window, failure, openPath, savePath;
dialog.showOpenDialog = async () => openPath ? { filePaths: [openPath] } : { canceled: true };
dialog.showSaveDialog = async () => savePath ? { filePath: savePath } : { canceled: true };
dialog.showMessageBox = async () => ({ response: 1 });
app.on('browser-window-created', (_e, value) => { window = value; window.webContents.setBackgroundThrottling(false); window.webContents.on('render-process-gone', (_event, details) => { failure = new Error(details.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = text => window.webContents.executeJavaScript(text);
const qa = 'window.__templateQA', store = qa + '.editor', state = store + '.getState()';
const wait = (text, label) => waitFor(() => evaluate(text), label, { timeoutMs: 20000, failure: () => failure });
// A queued Enter must finish before focus moves to a select, where it would
// open a native popup and swallow the next typeahead selection.
const key = (window, keyCode, modifiers = []) => keyCode === 'Return'
  ? keyWithRelease(window, keyCode, modifiers, { releaseKey: 'Enter' })
  : sendKey(window, keyCode, modifiers);
const checks = [], viewports = [];
function instrument() {
  const qa = window.__templateQA = { editor: null, errors: [] };
  window.addEventListener('error', e => qa.errors.push(e.message));
  window.addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; }, onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const value = f.memoizedProps?.value; if (value?.getState && value?.dispatch) qa.editor = value; visit(f.child); visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
const node = label => `([...document.querySelectorAll('dialog[open] [aria-label],dialog[open] button,dialog[open] label')].find(n=>n.getAttribute('aria-label')===${JSON.stringify(label)}||n.tagName==='BUTTON'&&n.textContent.trim()===${JSON.stringify(label)}||n.tagName==='LABEL'&&n.textContent.trim().startsWith(${JSON.stringify(label)})))`;
async function press(label) {
  await wait(`(()=>{const n=${node(label)};return !!n&&!n.disabled&&n.getAttribute('aria-disabled')!=='true';})()`, 'enabled ' + label);
  await evaluate(`(()=>{const n=${node(label)};if(n.disabled||n.getAttribute('aria-disabled')==='true')throw Error('Disabled '+${JSON.stringify(label)});n.scrollIntoView({block:'nearest'});n.focus();})()`);
  await key(window, 'Return');
}
async function type(label, text) {
  await evaluate(`(()=>{const n=${node(label)},input=n.matches('input,textarea')?n:n.querySelector('input,textarea');input.scrollIntoView({block:'nearest'});input.focus();input.select();})()`);
  await window.webContents.insertText(text); await key(window, 'Return');
}
async function choose(name) {
  await evaluate(`(()=>{const n=[...document.querySelectorAll('.template-list button')].find(n=>n.querySelector('strong').textContent===${JSON.stringify(name)});if(!n)throw Error('Missing saved template');n.scrollIntoView({block:'nearest'});n.focus();})()`);
  await key(window, 'Return');
}
async function open() { await evaluate(`${store}.dispatch('templates.open')`); await wait("!!document.querySelector('.templates-modal[open]')", 'templates'); }
async function close() { await press('Cancel / close'); await wait(`${state}.ui.dialog===null`, 'closed'); }
async function capture(name) {
  await evaluate(`${store}.setValue('ui','toast','');document.activeElement?.blur()`);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await wait("!document.querySelector('[role=tooltip]')", 'tooltip hidden');
  await capturePage(window, output, name);
  viewports.push(await evaluate(`({name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,fieldHeight:document.querySelector('.field-container')?.getBoundingClientRect().height,overflow:document.querySelector('.modal')?.scrollWidth>document.querySelector('.modal')?.clientWidth})`));
}
const pass = text => { checks.push(text); console.log('PASS ' + text); };
const libraryFile = path.join(profile, 'template-library.json');
const readLibrary = async () => parseTemplateLibrary(await fs.readFile(libraryFile, 'utf8'));

app.whenReady().then(async () => { try {
  await waitFor(() => !!window, 'window'); await wait("!!document.querySelector('.set-card')", 'renderer');
  window.show(); window.focus(); window.setContentSize(1366, 768);
  window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Page.enable');
  await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
  await installConfirmShim(source => window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source }));
  window.webContents.reload(); await wait(`!!${store}&&${state}.preferences.status==='saved'`, 'editor ready');
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (phase === 'read') {
    await wait(`${state}.ui.dialog==='recovery'`, 'recovery choice after restart');
    await press('Continue editing'); await wait(`${state}.ui.dialog===null`, 'recovery dismissed');
    await open(); await wait("document.querySelectorAll('.template-list button').length===5", 'durable library loaded');
    assert.equal((await readLibrary()).entries.length, 5);
    await choose('Adaptable line'); await capture('templates-restarted.png');
    assert.deepEqual(await evaluate(qa + '.errors'), []);
    await fs.writeFile(path.join(output, 'restart.json'), JSON.stringify({ checks: ['five templates survive a full native process restart'], source: manifest.source }, null, 2)); app.exit(0); return;
  }
  const original = createDemoProject(); original.title = 'Private production'; original.ensemble = 'Private school'; original.performers[0].name = 'Private student'; original.sections[0].name = 'Private section lead'; original.sets[0].notes = 'Private notes';
  await evaluate(`${store}.dispatch('project.load',{project:${JSON.stringify(original)}})`);
  await evaluate(`document.querySelector('[aria-label="Project menu"]').click()`);
  await evaluate(`document.querySelector('[aria-label="Templates"]').focus()`); await key(window, 'Return');
  await wait("!!document.querySelector('.templates-modal[open]')", 'menu entry'); await capture('templates-empty.png');
  const initial = await evaluate(state + '.project');
  await press('Save new template'); await type('Template name', 'Marching setup'); await capture('templates-capture-show.png');
  await press('Save template to library'); await wait("document.querySelectorAll('.template-list button').length===1", 'setup saved');
  assert.deepEqual(await evaluate(state + '.project'), initial);
  let library = await readLibrary(); assert.equal(library.entries[0].sections[0].name, 'Section 1');
  assert.equal(JSON.stringify(library).includes('Private'), false); await close();
  await evaluate('document.activeElement?.blur()'); await key(window, 'N', [process.platform === 'darwin' ? 'meta' : 'control']);
  await wait("!!document.querySelector('[aria-label=" + JSON.stringify('Show template') + "]')", 'new setup picker');
  await selectNativeOption(window, '[aria-label="Show template"]', 0); await capture('templates-new-production.png');
  // The loaded production is unsaved: replacing it asks in-app, starting on Cancel.
  await evaluate("window.__qaConfirmResponse='manual'"); await press('Create from template');
  await wait("document.querySelector('dialog.confirm-dialog[open] h2')?.textContent==='Replace this production?' && document.activeElement?.matches('.confirm-dialog__cancel')", 'replace confirmation on Cancel');
  await key(window, 'Return'); await wait(`!${state}.ui.confirmation && !document.querySelector('.confirm-dialog') && ${state}.ui.dialog==='new'`, 'replacement canceled');
  assert.deepEqual(await evaluate(state + '.project.present'), original);
  await evaluate('window.__qaConfirmResponse=true'); await press('Create from template'); await wait(`${state}.project.present.id!==${JSON.stringify(original.id)}`, 'new production');
  const fresh = await evaluate(state + '.project.present'); assert.equal(fresh.performers.length, 64); assert.equal(fresh.sets.length, 1); assert.ok(fresh.performers.every(p => p.name === '' && p.label.startsWith('S'))); assert.notEqual(fresh.performers[0].id, original.performers[0].id);
  pass('menu and native keyboard New production use privacy-safe setup previews, unsaved replacement cancellation and fresh identities');
  const ids = original.performers.slice(0, 8).map(p => p.id);
  await evaluate(`${store}.dispatch('project.load',{project:${JSON.stringify(original)}});${store}.setValue('selection','selectedIds',${JSON.stringify(ids)})`);
  await open(); await press('Save new template'); await type('Template name', 'Eight-dot picture'); await selectNativeOption(window, '[aria-label="Template kind"]', 'snapshot'); await press('Save template to library');
  await wait("document.querySelectorAll('.template-list button').length===2", 'snapshot saved');
  await type('Template center X · yd', '50'); await type('Template center Y · yd', '25'); await capture('templates-snapshot-preview.png');
  assert.deepEqual(await evaluate(state + '.project.present'), original); await close(); assert.deepEqual(await evaluate(state + '.project.present'), original);
  await open(); await choose('Eight-dot picture'); await type('Template center X · yd', '50'); await type('Template center Y · yd', '25');
  await press('Apply saved formation'); await wait(`${state}.ui.dialog===null`, 'formation applied');
  const applied = await evaluate(state + '.project.present'); assert.deepEqual(applied.performers, original.performers); assert.deepEqual(applied.moves, original.moves); assert.deepEqual(applied.sets.slice(1), original.sets.slice(1));
  for (const p of original.performers.slice(8)) assert.deepEqual(applied.sets[0].positions[p.id], original.sets[0].positions[p.id]);
  assert.match(await evaluate(state + '.project.past.at(-1).name'), /Apply saved formation/);
  await evaluate('document.activeElement?.blur()'); await key(window, 'Z', [process.platform === 'darwin' ? 'meta' : 'control']); await wait(`${state}.project.present.sets[0].positions[${JSON.stringify(ids[0])}].x===${original.sets[0].positions[ids[0]].x}`, 'undo snapshot');
  assert.deepEqual(await evaluate(state + '.project.present'), original);
  await key(window, 'Z', [process.platform === 'darwin' ? 'meta' : 'control', 'shift']); await wait(`${state}.project.past.length===1`, 'redo snapshot');
  const savedProject = path.join(files, 'templated.squid'); savePath = savedProject;
  await key(window, 'S', [process.platform === 'darwin' ? 'meta' : 'control']); await wait(`${state}.fileSession.savedRevision===${state}.project.revision`, 'native project save');
  assert.deepEqual(parseProject(await fs.readFile(savedProject, 'utf8')), applied);
  pass('snapshot previews and Cancel are pure; Apply changes only selected dots, names one undo action, supports native undo/redo and saves through the project codec');
  await open(); await press('Save new template'); await type('Template name', 'Adaptable line'); await selectNativeOption(window, '[aria-label="Template kind"]', 'parametric'); await selectNativeOption(window, '[aria-label="Template shape"]', 'line'); await press('Save template to library');
  await wait("document.querySelectorAll('.template-list button').length===3", 'parametric saved');
  const sixteen = original.performers.slice(0, 16).map(p => p.id);
  await evaluate(`${store}.setValue('selection','selectedIds',${JSON.stringify(sixteen)})`); await wait("document.querySelector('[role=alert]')?.textContent.includes('selection changed')", 'stale selection');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply saved formation\"]').getAttribute('aria-disabled')"), 'true');
  await choose('Eight-dot picture'); await wait("document.querySelector('[role=alert]')?.textContent.includes('exactly 8')", 'count mismatch'); await capture('templates-count-error.png');
  await choose('Adaptable line'); await type('Template center X · yd', '0'); await wait("document.querySelector('[role=alert]')?.textContent.includes('boundary')", 'boundary block'); await capture('templates-boundary-error.png');
  await type('Template center X · yd', '50'); await type('Template center Y · yd', '25');
  await evaluate("document.querySelector('[data-template-center]').focus()"); await key(window, 'Right');
  await wait("Number([...document.querySelectorAll('.template-parameters label')].find(n=>n.textContent.startsWith('Template center X')).querySelector('input').value)>50", 'keyboard handle sync');
  await type('Template center X · yd', '50');
  const pointer = await evaluate("(()=>{const svg=document.querySelector('.template-preview'),matrix=svg.getScreenCTM();const start=new DOMPoint(50,25).matrixTransform(matrix),end=new DOMPoint(55,25).matrixTransform(matrix);svg.scrollIntoView({block:'nearest'});return {start:{x:start.x,y:start.y},end:{x:end.x,y:end.y}};})()");
  // Read after any scroll before dispatching real pointer events.
  const drag = await evaluate("(()=>{const matrix=document.querySelector('.template-preview').getScreenCTM(),a=new DOMPoint(50,25).matrixTransform(matrix),b=new DOMPoint(55,25).matrixTransform(matrix);return {a:{x:a.x,y:a.y},b:{x:b.x,y:b.y}};})()");
  assert.ok(Number.isFinite(pointer.start.x));
  window.webContents.sendInputEvent({ type: 'mouseDown', ...drag.a, button: 'left', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseMove', ...drag.b, button: 'left', buttons: ['left'] });
  window.webContents.sendInputEvent({ type: 'mouseUp', ...drag.b, button: 'left', clickCount: 1 });
  await wait("Number([...document.querySelectorAll('.template-parameters label')].find(n=>n.textContent.startsWith('Template center X')).querySelector('input').value)>54", 'pointer center sync');
  await type('Template center X · yd', '50');
  await type('Template rotation · °', '180'); await type('Template rotation · °', '0');
  for (const theme of ['dark', 'light', 'high-contrast']) { await evaluate(`${store}.setValue('preferences','value',p=>({...p,theme:${JSON.stringify(theme)}}))`); await capture('templates-' + theme + '.png'); }
  window.setContentSize(1024, 720); await evaluate(`${store}.setValue('preferences','value',p=>({...p,uiScale:1.5}))`); await settleNativeViewport(window); await capture('templates-enlarged.png');
  await evaluate("document.querySelector('[aria-label=\"Apply saved formation\"]').focus();document.activeElement.scrollIntoView({block:'nearest'})");
  const focused = await evaluate("(()=>{const r=document.activeElement.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight,overflow:document.querySelector('.modal').scrollWidth>document.querySelector('.modal').clientWidth};})()"); assert.ok(focused.top >= 0 && focused.bottom <= focused.height); assert.equal(focused.overflow, false);
  await key(window, 'Return'); await wait(`${state}.ui.dialog===null`, '16 member parametric apply');
  window.setContentSize(1366, 768); await evaluate(`${store}.setValue('preferences','value',p=>({...p,theme:'dark',uiScale:1}))`); await settleNativeViewport(window);
  pass('count mismatches, stale selection and field overflow block Apply; adaptable shapes support 16 members, handle keyboard/numeric sync, three themes and narrow 150% scale');
  const beforeLibraryIo = await evaluate(state + '.project');
  await open(); await press('Review library export'); await capture('templates-export-review.png');
  savePath = undefined; await press('Export library file'); await wait("[...document.querySelectorAll('.modal [role=status]')].some(n=>n.textContent.includes('canceled'))", 'canceled export');
  const exported = path.join(files, 'shared.squidlib'); savePath = exported; await press('Export library file'); await waitFor(() => fs.stat(exported).then(() => true, () => false), 'native export');
  const content = await fs.readFile(exported, 'utf8'); library = parseTemplateLibrary(content); assert.equal(library.entries.length, 3); assert.equal(content.includes('Private'), false); assert.equal(content.includes(original.id), false);
  const newer = path.join(files, 'newer.squidlib'); await fs.writeFile(newer, JSON.stringify({ format: 'squidware-template-library', version: 99, entries: [] }));
  openPath = newer; await press('Import template library'); await wait("document.querySelector('[role=alert]')?.textContent.includes('unsupported')", 'newer import blocked'); assert.equal((await readLibrary()).entries.length, 3);
  openPath = exported; await press('Import template library'); await wait("!!document.querySelector('[aria-label=\"Review imported templates\"]')", 'import preview'); await press('Cancel import'); assert.equal((await readLibrary()).entries.length, 3);
  await press('Import template library'); await press('Add imported templates'); await wait("document.querySelectorAll('.template-list button').length===6", 'merged import');
  await evaluate("document.querySelector('.template-management summary').focus()"); await key(window, 'Return'); await type('Rename template', 'Renamed setup'); await press('Rename saved template');
  await wait("[...document.querySelectorAll('.template-list strong')].some(n=>n.textContent==='Renamed setup')", 'renamed');
  await evaluate("document.querySelector('.template-management summary').focus()"); await key(window, 'Return');
  // Removal confirms in-app over the library; Escape cancels only the confirmation and keeps the template.
  const removeConfirmation = "document.querySelector('dialog.confirm-dialog[open] h2')?.textContent==='Remove “Renamed setup”?' && document.activeElement?.matches('.confirm-dialog__cancel') && !document.querySelector('.tooltip-panel')";
  await evaluate("window.__qaConfirmResponse='manual'"); await press('Remove saved template'); await wait(removeConfirmation, 'remove confirmation on Cancel');
  // Cancel closes only the confirmation and returns focus to the control that asked, as window.confirm did.
  await key(window, 'Escape'); await wait(`!document.querySelector('.confirm-dialog') && !!document.querySelector('.templates-modal[open]') && ${state}.ui.dialog==='templates' && document.activeElement===${node('Remove saved template')}`, 'removal canceled with focus restored');
  assert.equal(await evaluate("document.querySelectorAll('.template-list button').length"), 6); assert.equal((await readLibrary()).entries.length, 6);
  await press('Remove saved template'); await wait(removeConfirmation, 'second remove confirmation'); await press('Remove template'); await wait("document.querySelectorAll('.template-list button').length===5", 'removed');
  await evaluate('window.__qaConfirmResponse=true');
  assert.deepEqual(await evaluate(state + '.project'), beforeLibraryIo);
  pass('native export disclosure/cancel, version rejection, import review/cancel/append, rename and confirmed remove (Escape keeps the template) preserve production history and project save destination');
  assert.deepEqual(await evaluate(qa + '.errors'), []); assert.ok(viewports.every(v => !v.overflow));
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, viewports, source: manifest.source, host: process.platform, backend: 'Electron software rendering; native input and controlled OS file dialogs; 64-member/6-set production', limits: 'Linux software host; no human or physical-device validation claimed.' }, null, 2));
  app.exit(0);
} catch (error) { console.error(error); console.error(await evaluate(`({dialog:${state}.ui.dialog,toast:${state}.ui.toast,errors:${qa}.errors,alerts:[...document.querySelectorAll('[role=alert]')].map(n=>n.textContent)})`).catch(() => null)); await capturePage(window, output, 'failure-' + phase + '.png').catch(() => {}); app.exit(1); } });
