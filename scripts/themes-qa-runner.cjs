'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const { capturePage, key: sendKey, selectNativeOption, waitFor, settleNativeViewport } = require('./testing/renderer.cjs');
const { auditText } = require('./accessibility-audit.cjs');
const { root, output, profile } = require(process.argv.find(a => a.startsWith('--themes-manifest=')).slice('--themes-manifest='.length));
const phase = process.argv.find(a => a.startsWith('--phase='))?.slice(8);
const saved = path.join(output, 'appearance.squid');
app.disableHardwareAcceleration(); app.setPath('userData', profile); BrowserWindow.prototype.show = function () {};
dialog.showSaveDialog = async () => ({ canceled: false, filePath: saved });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [saved] });
dialog.showMessageBox = async () => ({ response: 1 });
let window, failure; const checks = [], audits = [], metrics = [];
app.on('browser-window-created', (_event, created) => { window = created; window.webContents.setBackgroundThrottling(false); window.webContents.on('render-process-gone', (_e, d) => { failure = new Error('Renderer exited: ' + d.reason); }); });
require(path.join(root, 'electron/main.cjs'));
const evaluate = source => window.webContents.executeJavaScript(source);
const editor = 'window.__themesQA.editor', state = editor + '.getState()';
const wait = (source, label) => waitFor(() => evaluate(source), label, { timeoutMs: 15000, failure: () => failure });
const key = (code, modifiers = []) => sendKey(window, code, modifiers, 20);
const pass = label => { checks.push(label); console.log('PASS ' + label); };
function instrument() {
  window.confirm = () => true;
  window.__themesQA = { editor: null, errors: [] };
  window.addEventListener('error', e => window.__themesQA.errors.push(e.message));
  window.addEventListener('unhandledrejection', e => window.__themesQA.errors.push(String(e.reason)));
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; },
    onCommitFiberRoot(_id, root) { function visit(f) { if (!f) return; const v = f.memoizedProps?.value; if (v?.getState && v?.dispatch) window.__themesQA.editor = v; visit(f.child); visit(f.sibling); } visit(root.current); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  const point = await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)}), r=n.getBoundingClientRect(); const p={x:r.x+r.width/2,y:r.y+r.height/2}; if(!n.contains(document.elementFromPoint(p.x,p.y))) throw new Error('Obscured: '+${JSON.stringify(selector)}); return p; })()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
}
async function select(label, value) {
  const selector = 'select[aria-label=' + JSON.stringify(label) + ']';
  await evaluate(`(() => { const n=[...document.querySelectorAll('label')].find(n=>n.firstChild?.textContent===${JSON.stringify(label)})?.querySelector('select');n.setAttribute('aria-label',${JSON.stringify(label)}); })()`);
  await selectNativeOption(window, selector, value);
  await key('Tab');
}
async function preferences() {
  await click('[aria-label="Project menu"]'); await click('.dropdown [aria-label="Preferences"]');
  await wait("document.querySelector('dialog[open] h2')?.textContent==='Preferences'", 'preferences');
}
async function close() { await click('.modal [aria-label="Close dialog"]'); await wait("!document.querySelector('dialog[open]')", 'closed'); }
async function capture(name) {
  await evaluate('document.activeElement?.blur()');
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await wait("!document.querySelector('[role=tooltip]')", 'help dismissed');
  await capturePage(window, output, name);
}
async function audit(label) {
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const result = await evaluate(`(${auditText.toString()})({includeDisabled:true})`); audits.push({ label, ...result });
  assert.deepEqual(result.failures, [], label); assert.ok(result.checked > 40, label);
}
async function focus(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`); await key('Tab'); await key('Tab', ['shift']);
  if (selector.includes('data-performer-id')) return;
  const style = await evaluate(`(() => { const s=getComputedStyle(document.activeElement);return {width:s.outlineWidth,style:s.outlineStyle,color:s.outlineColor}; })()`);
  assert.ok(parseFloat(style.width) >= 2 && style.style === 'solid', JSON.stringify(style));
}
async function viewport(width, height) { window.setContentSize(width, height); await settleNativeViewport(window, 'theme viewport'); }
app.whenReady().then(async () => {
  try {
    await waitFor(() => !!window, 'theme window'); await wait("!!document.querySelector('.field-stage__svg')", 'initial renderer');
    window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Page.enable');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument.toString()})()` });
    window.webContents.reload(); await wait(`!!${editor} && ${state}.preferences.status==='saved'`, 'theme store');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true }); await viewport(1366, 768);
    if (phase === 'restart') {
      await wait("document.documentElement.dataset.theme==='high-contrast' && getComputedStyle(document.documentElement).zoom==='1.25'", 'restored appearance');
      await evaluate(`${editor}.dispatch('file.open')`); await wait(`${state}.fileSession.savedRevision!==null`, 'reopened file');
      assert.deepEqual(await evaluate(`${state}.project.present`), JSON.parse(await fs.readFile(saved, 'utf8')));
      await audit('restored high contrast at 125%'); await capture('themes-restored.png');
      pass('theme and UI scale survive a fresh sandboxed desktop process; native project save/reopen preserves every section color and coordinate');
    } else {
      // Exercise a legacy lime Brass color in an existing production as well as new gold defaults.
      assert.equal(await evaluate(`${state}.project.present.sections[0].color`), '#f0bf62');
      await evaluate(`${editor}.dispatch('section.update',{id:${state}.project.present.sections[0].id,update:{color:'#c3e889'}})`);
      const original = await evaluate(`${state}.project`);
      const id = original.present.performers[0].id;
      await click('[aria-label="Undo"]'); await click('[aria-label="Redo"]');
      await evaluate(`${editor}.setValue('selection','selectedIds',[${JSON.stringify(id)}])`);
      const baseline = await evaluate(`${state}.project`);
      for (const theme of ['dark', 'light', 'high-contrast']) {
        await evaluate(`${editor}.setValue('selection','selectedIds',[${JSON.stringify(id)}])`);
        await viewport(1366, 768); await preferences(); await select('Interface theme', theme); await select('UI scale', 1);
        await wait(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`, 'applied theme');
        await audit(theme + ' preferences'); await capture(`themes-${theme}-preferences.png`); await close();
        await focus('.header-actions [aria-label="Save"]');
        await focus(`[data-performer-id="${id}"]`);
        await wait("getComputedStyle(document.activeElement.querySelector('.field-focus-ring')).visibility==='visible'", 'field keyboard focus');
        const dot = await evaluate(`(() => {const p=document.querySelector('[data-performer-id="${id}"]');return {fill:p.querySelector('.field-dot').getAttribute('fill'),selection:getComputedStyle(p.querySelector('.field-selection-ring')).stroke,focus:getComputedStyle(p.querySelector('.field-focus-ring')).stroke};})()`);
        assert.equal(dot.fill, '#c3e889'); assert.notEqual(dot.selection, 'rgb(195, 232, 137)'); assert.equal(dot.focus, dot.selection);
        await audit(theme + ' selected Brass'); await capture(`themes-${theme}-field.png`);
        const fieldHeight = await evaluate("document.querySelector('.field-container').getBoundingClientRect().height"); metrics.push({ theme, fieldHeight }); assert.ok(fieldHeight >= 470, String(fieldHeight));
        await click('.workspace-tab[aria-label="Cast"]'); await audit(theme + ' Cast');
        await click('.workspace-tab[aria-label="Production sheet"]'); await audit(theme + ' sheet');
        await click('.workspace-tab[aria-label="Design"]');
        await click('.header-actions [aria-label="Export"]'); await audit(theme + ' Export'); await close();
        await preferences();
        const number = '.preferences-fields input[type=number]'; await click(number); await evaluate(`document.querySelector(${JSON.stringify(number)}).select()`); await key('Backspace'); await key('Tab');
        await wait("!!document.querySelector('.preferences-fields [aria-invalid=true]')", 'invalid preference'); await audit(theme + ' validation error');
        await evaluate("document.querySelector('.preferences-fields [aria-invalid=true]').focus()"); await key('Escape'); await close();
        await click('.canvas-toolbar [aria-label="Fit field"]');
        await viewport(1000, 700); await preferences(); await select('UI scale', 1.25); await audit(theme + ' 125% preferences'); await close();
        await click('[aria-label="Workspace layout"]'); await audit(theme + ' enlarged layout controls'); await capture(`themes-${theme}-layout.png`); await key('Escape');
        await click('[aria-label="Selection tools and groups"]'); await audit(theme + ' enlarged selection tools'); await capture(`themes-${theme}-selection.png`); await click('[aria-label="Close selection tools"]');
        await click('.header-actions [aria-label="Save"]'); await wait(`${state}.fileSession.fileOperation===null`, 'native save');
        const hit = await evaluate(`(() => { const svg=document.querySelector('.field-stage__svg'), matrix=document.querySelector('[data-field-geometry]').getScreenCTM(); const bounds=svg.getBoundingClientRect(); for(const person of ${state}.project.present.performers){const p=${state}.project.present.sets[0].positions[person.id], point=new DOMPoint(p.x,p.y).matrixTransform(matrix); const target=document.elementFromPoint(point.x,point.y); if(point.x>bounds.left && point.x<bounds.right && target?.closest('.field-stage__svg')) return {id:person.id,x:point.x,y:point.y};} return null;})()`);
        assert.ok(hit, 'A field dot remains available at 125%');
        for(const type of ['mouseMoved','mousePressed','mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x:hit.x,y:hit.y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:type==='mouseMoved'?0:1});
        await wait(`${state}.selection.selectedIds.length===1 && ${state}.selection.selectedIds[0]===${JSON.stringify(hit.id)}`, 'scaled native field hit');
        await audit(theme + ' 125% design'); await capture(`themes-${theme}-1000-125.png`);
        await viewport(850, 650); await preferences(); await select('UI scale', 1.5); await audit(theme + ' 150% preferences'); await close();
        await click('.header-actions [aria-label="Export"]'); await audit(theme + ' 150% Export'); await close();
        await capture(`themes-${theme}-850-150.png`);
        assert.deepEqual(await evaluate(`${state}.project`), baseline, 'Appearance must preserve project, history and revision');
      }
      pass('all three themes pass rendered text/placeholder contrast, visible focus, legacy Brass selection, disabled controls, errors, Cast, sheet, Export and small-window enlarged controls');
      await viewport(1366, 768); await preferences(); await select('UI scale', 1.25); await close();
      await wait(`${state}.preferences.status==='saved'`, 'durable appearance');
      await evaluate(`${editor}.dispatch('file.save-as')`); await wait(`${state}.fileSession.fileOperation===null`, 'save settled');
      assert.deepEqual(JSON.parse(await fs.readFile(saved, 'utf8')), baseline.present);
      pass('appearance changes leave production geometry, colors, edit history and revision unchanged');
    }
    assert.deepEqual(await evaluate('window.__themesQA.errors'), []);
    await fs.writeFile(path.join(output, 'results-' + phase + '.json'), JSON.stringify({ phase, checks, audits, metrics, electron: process.versions.electron }, null, 2));
    app.exit(0);
  } catch (error) {
    console.error(error); if (window) { console.error(await evaluate('document.body.innerText.slice(-1500)').catch(() => 'No renderer')); await capturePage(window, output, 'failure.png').catch(() => {}); }
    app.exit(1);
  }
});
