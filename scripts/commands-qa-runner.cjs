'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog, Menu, clipboard } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key: sendKey, waitFor, settleNativeViewport, selectNativeOption } = require('./testing/renderer.cjs');
const { auditText } = require('./accessibility-audit.cjs');
const { root, output, profile } = require(process.argv.find(a => a.startsWith('--commands-manifest=')).slice('--commands-manifest='.length));
const phase = process.argv.find(a => a.startsWith('--phase='))?.slice(8);
const saved = path.join(output, 'commands.squid');
app.disableHardwareAcceleration(); app.setPath('userData', profile); BrowserWindow.prototype.show = function () {};
let saves = 0;
dialog.showSaveDialog = async () => { saves++; return { canceled: false, filePath: saved }; };
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [saved] });
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure; const checks = [], audits = [], layouts = [];
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); window.webContents.on('render-process-gone', (_e, d) => { failure = new Error('Renderer exited: ' + d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const editor = 'window.__commandsQA.editor', state = editor + '.getState()';
const wait = (source, label) => waitFor(() => evaluate(source), label, { timeoutMs: 15000, failure: () => failure });
const key = (code, modifiers = []) => sendKey(window, code, modifiers, 20);
const primary = process.platform === 'darwin' ? 'meta' : 'control';
const pass = label => { checks.push(label); console.log('PASS ' + label); };
const debug = (method, args) => window.webContents.debugger.sendCommand(method, args);
function instrument() {
  window.confirm = () => true; window.__commandsQA = { editor: null, errors: [] };
  window.addEventListener('error', e => window.__commandsQA.errors.push(e.message));
  window.addEventListener('unhandledrejection', e => window.__commandsQA.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) window.__commandsQA.editor = v; visit(f.child); visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  const point = await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};if(!n.contains(document.elementFromPoint(p.x,p.y)))throw new Error('Obscured: '+${JSON.stringify(selector)});return p;})()`);
  for (const type of ['mouseMoved','mousePressed','mouseReleased']) await debug('Input.dispatchMouseEvent', {type,...point,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:type==='mouseMoved'?0:1});
}
const button = title => '[aria-label=' + JSON.stringify(title) + ']';
async function type(selector, text) {
  await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.focus();n.select()})()`);
  await debug('Input.insertText', { text });
  await wait(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(text)}`, 'typed ' + text);
}
const search = text => type(button('Search commands or drill phrases'), text);
async function field() { await evaluate("document.querySelector('.field-stage__svg').focus()"); }
async function palette() { await field(); await key('k', [primary]); await wait(`${state}.ui.paletteOpen && document.activeElement?.getAttribute('role')==='combobox'`, 'palette keyboard and focus'); }
async function close() { await click('.modal [aria-label="Close dialog"]'); await wait("!document.querySelector('dialog[open]')", 'closed modal'); }
function menu(label, invoke = true) {
  function find(m) {for(const item of m?.items??[]){if(item.label===label)return item;const child=find(item.submenu);if(child)return child;}}
  const item = find(Menu.getApplicationMenu()); assert.ok(item?.click, label); if(invoke)item.click(item,window,{}); return item;
}
async function preferences() { menu('Preferences…'); await wait("document.querySelector('dialog[open] h2')?.textContent==='Preferences'", 'Preferences'); }
async function shortcuts() { await click('.shortcut-preferences summary'); await wait("document.querySelector('.shortcut-preferences').open", 'shortcut preferences'); }
async function record(name, code, modifiers = []) {
  await type(button('Find a shortcut'), name); await click(button('Change shortcut: '+name));
  await key(code, modifiers); await wait(`document.querySelector(${JSON.stringify(button('Change shortcut: '+name))}).getAttribute('aria-pressed')==='false'`, 'finished recording');
}
async function audit(label) {const result=await evaluate(`(${auditText.toString()})({includeDisabled:true})`);audits.push({label,...result});assert.deepEqual(result.failures,[],label);}
async function capture(name) {await debug('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});await evaluate('document.activeElement?.blur()');await capturePage(window,output,name);}
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'commands window'); await wait("!!document.querySelector('.studio')", 'renderer');
    window.webContents.debugger.attach('1.3'); await debug('Page.enable');
    await debug('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrument.toString()})()`});
    window.webContents.reload(); await wait(`!!${editor} && ${state}.preferences.status==='saved'`, 'commands store and durable preferences');
    await debug('Emulation.setFocusEmulationEnabled',{enabled:true});
    window.setContentSize(1366,768);await settleNativeViewport(window,'commands baseline');
    if (phase === 'write') {
      // Fixture setup only: behavior below uses native input and real command handlers.
      await evaluate(`(()=>{const s=${state},p=structuredClone(s.project.present);p.performers=p.performers.slice(0,2);p.sets=p.sets.map(set=>({...set,positions:Object.fromEntries(p.performers.map((person,i)=>[person.id,{x:30+i*4,y:20+i}]))}));p.moves=p.moves.map(m=>({...m,paths:{}}));${editor}.dispatch('project.load',{project:p});${editor}.setValue('selection','selectedIds',p.performers.map(p=>p.id));})()`);
      const ids = await evaluate(`${state}.selection.selectedIds`), baseline = await evaluate(`${state}.project`);
      const height = await evaluate("document.querySelector('.field-container').getBoundingClientRect().height"); assert.ok(height>=470); layouts.push({width:1366,scale:1,height});
      await capture('commands-before.png'); await palette(); await audit('dark palette'); await capture('commands-dark-search.png');
      await search('move 4 forward'); await wait("document.querySelector('.palette-phrase button')?.disabled===false",'valid move');
      assert.deepEqual(await evaluate(`${state}.project`),baseline);await key('Return');await wait(`!!${state}.ui.coordinatePreview && !${state}.ui.paletteOpen`,'field move preview');
      await click(button('Apply coordinates'));await wait(`${state}.project.past.length===1`,'one applied move');
      assert.equal(await evaluate(`${state}.project.present.sets[0].positions[${JSON.stringify(ids[0])}].y`),22.5);
      await field();await key('z',[primary]);await wait(`${state}.project.past.length===0`,'single keyboard undo');
      assert.deepEqual(await evaluate(`${state}.project.present`),baseline.present);
      pass('Ctrl/Cmd+K opens focused command search; move 4 forward previews before Apply and records one undoable edit');
      for (const [phrase, preview, cancel] of [['mirror across 50','transformPreview','Cancel transform'],['interval 2 steps horizontal','spacingPreview','Cancel spacing']]) {
        await palette();await search(phrase);await key('Return');await wait(`!!${state}.ui.${preview}`,'opened '+preview);await click(button(cancel));
        assert.deepEqual(await evaluate(`${state}.project.present`),baseline.present);
      }
      const label = baseline.present.performers[0].label;
      await palette();await search(`place ${label} at Side 1: on the 40; on front hash`);await key('Return');await wait(`!!${state}.ui.coordinatePreview`,'label coordinate preview');
      assert.deepEqual(await evaluate(`${state}.selection.selectedIds`),[ids[0]]);await click(button('Apply coordinates'));await wait(`${state}.project.present.sets[0].positions[${JSON.stringify(ids[0])}].x===40`,'applied labelled coordinate');await field();await key('z',[primary]);await wait(`${state}.project.past.length===0`,'labelled coordinate undo');assert.deepEqual(await evaluate(`${state}.project.present`),baseline.present);
      await palette();await search('interval 2 steps');await key('Return');assert.equal(await evaluate(`${state}.ui.paletteOpen`),true);assert.match(await evaluate("document.querySelector('.palette-phrase').textContent"),/axis/);await key('Escape');
      await evaluate(`${editor}.setValue('selection','selectedIds',[])`);await palette();await search('mirror');await key('Return');assert.equal(await evaluate(`${state}.ui.paletteOpen`),true);assert.match(await evaluate("document.querySelector('.palette-results').textContent"),/Select performers/);await capture('commands-disabled.png');await key('Escape');
      assert.deepEqual(await evaluate(`${state}.project.present`),baseline.present);
      pass('mirror/interval cancel preserves geometry; labelled coordinate Apply and undo restore the production; invalid syntax and empty selection cannot mutate');
      // Check keyboard navigation and ordinary text entry rather than dispatching edit commands.
      await field();await key('Right');const view=await evaluate(`${state}.ui.view`);await key('Tab');assert.equal(await evaluate(`${state}.ui.view`),view);
      await click('.workspace-tab[aria-label="Cast"]');await wait("!!document.querySelector('[aria-label=\"Find a performer\"]')",'Cast search');
      const typingBefore=await evaluate(`({project:${state}.project,tool:${state}.ui.tool,view:${state}.ui.view,paths:${state}.ui.showPaths})`);
      await type(button('Find a performer'),'vhlpadmtj');await key('a',[primary]);
      await key('c',[primary]);await waitFor(async()=>await clipboard.readText()==='vhlpadmtj','native copy in text entry',{timeoutMs:15000});await key('x',[primary]);await wait("document.querySelector('[aria-label=\"Find a performer\"]').value===''",'native cut in text entry');await key('v',[primary]);await wait("document.querySelector('[aria-label=\"Find a performer\"]').value==='vhlpadmtj'",'native paste in text entry');await key('z',[primary]);await wait("document.querySelector('[aria-label=\"Find a performer\"]').value===''",'native text undo');await key('z',[primary,'shift']);await wait("document.querySelector('[aria-label=\"Find a performer\"]').value==='vhlpadmtj'",'native text redo');
      assert.deepEqual(await evaluate(`({project:${state}.project,tool:${state}.ui.tool,view:${state}.ui.view,paths:${state}.ui.showPaths})`),typingBefore);
      assert.deepEqual(await evaluate(`${state}.selection.selectedIds`),[]);await type(button('Find a performer'),'');
      await click('.workspace-tab[aria-label="Design"]');
      pass('Tab keeps focus navigation, field arrows remain available, and ordinary typing/select-all in Cast never invokes editor shortcuts');
      await preferences();await shortcuts();await record('Select performers','F2');await wait(`${state}.preferences.value.shortcutBindings['tool.box']==='F2'`,'recorded F2');
      await record('Pan field','F2');assert.match(await evaluate("document.querySelector('.shortcut-preferences [role=alert]').textContent"),/Already used/);
      await record('Pan field','w',[primary]);assert.match(await evaluate("document.querySelector('.shortcut-preferences [role=alert]').textContent"),/reserved/);
      await record('Save production','u',[primary,'shift']);await wait(`${state}.preferences.value.shortcutBindings['file.save']==='Primary+Shift+U' && ${state}.preferences.status==='saved'`,'durable save binding');
      await record('Play / pause','F4');
      assert.equal(menu('Save',false).accelerator,'CmdOrCtrl+Shift+U');assert.equal(saves,0,'recording must not invoke a save');
      await audit('shortcut recorder');await capture('commands-bindings.png');await close();
      await field();await key('h');await wait(`${state}.ui.tool==='pan'`,'pan key');await key('v');assert.equal(await evaluate(`${state}.ui.tool`),'pan');await key('F2');await wait(`${state}.ui.tool==='select'`,'rebound key');
      await key('F4');await wait(`${state}.playback.playing`,'rebound playback from field');await key('F4');await wait(`!${state}.playback.playing`,'rebound pause from field');await click('.set-card');
      await preferences();await shortcuts();await type(button('Find a shortcut'),'Play / pause');await click(button('Reset shortcut: Play / pause'));await wait(`${state}.preferences.value.shortcutBindings['playback.toggle']===undefined`,'playback default restored');await close();await field();
      await key('u',[primary,'shift']);await wait(`${state}.fileSession.savedRevision===${state}.project.revision && ${state}.fileSession.fileOperation===null`,'rebound native save');assert.equal(saves,1);
      assert.deepEqual(JSON.parse(await fs.readFile(saved,'utf8')),baseline.present);
      pass('recording validates collisions/reserved keys without invoking commands; old keys stop working and rebound native save executes once');
      menu('Squidware Help');await wait("document.querySelector('dialog[open] h2')?.textContent==='Help'",'current shortcut help');
      assert.match(await evaluate("[...document.querySelectorAll('.shortcut-list>div')].find(n=>n.querySelector('dt').textContent==='Select performers').textContent"),/F2/);await close();
      await evaluate(`${editor}.setValue('selection','selectedIds',[${JSON.stringify(ids[0])}])`);
      // Appearance is fixture context here; the themes suite owns persistence and switching behavior.
      for (const [theme,width,scale] of [['light',1366,1],['high-contrast',1000,1.25],['dark',850,1.5]]) {
        await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)},uiScale:${scale}})`);
        window.setContentSize(width,width===1366?768:700);await settleNativeViewport(window,'commands '+theme);
        await palette();await search('move 4 forward');await audit(theme+' enlarged phrase');
        const bounds=await evaluate("(()=>{const n=document.querySelector('dialog[open]'),r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}})()");
        assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.right<=bounds.width+1&&bounds.bottom<=bounds.height+1,JSON.stringify(bounds));
        await capture('commands-'+theme+'-'+width+'.png');await key('Escape');layouts.push({theme,width,scale});
      }
      await wait(`${state}.preferences.status==='saved'`,'all preferences saved');
      pass('Help reflects bindings; dark/light/high-contrast palette controls pass text contrast and fit laptop/enlarged narrow windows');
    } else {
      await wait(`${state}.ui.dialog==='recovery'`, 'recovery decision after restart');
      await click('.modal .modal-actions button:last-child');await wait(`${state}.ui.dialog===null`, 'continue editing after recovery');
      assert.deepEqual(await evaluate(`${state}.preferences.value.shortcutBindings`),{'tool.box':'F2','file.save':'Primary+Shift+U'});
      assert.equal(menu('Save',false).accelerator,'CmdOrCtrl+Shift+U');menu('Open project…');await wait(`${state}.fileSession.savedRevision!==null && !${state}.fileSession.fileOperation`,'native reopened project');
      await field();await key('h');await key('F2');await wait(`${state}.ui.tool==='select'`,'fresh process rebound tool');
      await preferences();await shortcuts();await click('.shortcut-preferences>button');await wait(`${state}.preferences.status==='saved' && !Object.keys(${state}.preferences.value.shortcutBindings).length`,'reset all bindings');await close();
      assert.equal(menu('Save',false).accelerator,'CmdOrCtrl+S');await field();await key('h');await key('v');await wait(`${state}.ui.tool==='select'`,'default key restored');
      await key('F2');assert.equal(await evaluate(`${state}.ui.tool`),'select');await key('s',[primary]);await wait(`${state}.fileSession.fileOperation===null`,'default save after reset');
      pass('bindings survive a fresh Electron process and native reopen; Reset all restores key dispatch and native menu accelerators');
    }
    assert.deepEqual(await evaluate('window.__commandsQA.errors'),[]);
    await fs.writeFile(path.join(output,'results-'+phase+'.json'),JSON.stringify({phase,checks,audits,layouts,electron:process.versions.electron},null,2));app.exit(0);
  } catch (error) {console.error(error);if(window){console.error(await evaluate('document.body.innerText.slice(-2000)').catch(()=>''));await capturePage(window,output,'failure.png').catch(()=>{});}app.exit(1);}
});
