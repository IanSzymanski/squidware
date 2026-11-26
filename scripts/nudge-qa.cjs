'use strict';
const {revealFieldTool}=require('./testing/renderer.cjs');
const assert = require('node:assert/strict');
const { settleNativeViewport } = require('./testing/renderer.cjs');

module.exports = async function ({project,editor,state,evaluate,wait,click,key,capture,window,pass}) {
  window.setContentSize(1366,768); window.webContents.setZoomFactor(1); await settleNativeViewport(window,'nudge viewport');
  const people=project.performers.slice(0,3); const ids=people.map(p=>p.id);
  const points={ [ids[0]]:{x:40.1,y:20.2},[ids[1]]:{x:42.7,y:21.1},[ids[2]]:{x:70,y:30} };
  const fixture={...project,title:'Editing increments QA',snapping:{steps:8,subdivision:1,target:'grid',group:'anchor'},performers:people,sets:project.sets.map(set=>({...set,positions:points})),moves:project.moves.map(move=>({...move,paths:{}}))};
  const shape=()=>evaluate(`${state}.project.present.sets[0].positions`);
  const history=()=>evaluate(`${state}.project.past.length`);
  async function reset(prefs={},snap=true,show=fixture) {
    await evaluate(`${editor}.setValue('ui','pendingDraft',false); ${editor}.setValue('ui','dialog',null); ${editor}.dispatch('project.load',{project:${JSON.stringify(show)}}); ${editor}.setValue('selection','selectedIds',${JSON.stringify(ids.slice(0,2))}); ${editor}.setValue('ui','workspace','design'); ${editor}.setValue('ui','snap',${snap}); ${editor}.setValue('ui','zoom',1); ${editor}.setValue('preferences','value',{...${state}.preferences.value,nudgeUnit:'yards',nudgeStep:.625,fastNudgeStep:2.5,rotationStep:15,scaleStep:10,fieldOrientation:'audience-bottom',inspectorSelectionOpen:true,inspectorSetOpen:false,...${JSON.stringify(prefs)}})`);
    await wait(`${state}.selection.selectedIds.length===2 && !${state}.ui.transformPreview && !${state}.ui.formationPreview && !document.querySelector('.modal') && !document.querySelector('.field-stage--readonly')`,'nudge reset');
  }
  async function focusField() { await evaluate("document.querySelector('.field-stage__svg').focus()"); }
  async function focusGlobal() { await evaluate('document.activeElement?.blur()'); }
  // Native input uses window (DIP) coordinates; getBoundingClientRect reports CSS pixels, which differ under page zoom.
  async function button(selector,shift=false) { await revealFieldTool(window,selector); const zoom=window.webContents.getZoomFactor(); const p=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); await click({x:p.x*zoom,y:p.y*zoom},shift?1:0); }
  async function hover(selector) { const zoom=window.webContents.getZoomFactor(); const p=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); window.webContents.sendInputEvent({type:'mouseMove',x:Math.round(p.x*zoom),y:Math.round(p.y*zoom)}); }
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} vs ${b}`);
  await reset(); await capture('increments-before.png');
  for(const fast of [false,true]) {
    await reset(); await evaluate(`${editor}.dispatch('selection.nudge',{key:'ArrowRight',fast:${fast}})`); const expected=await shape();
    assert.equal(await history(),1);
    for(const entry of ['field','global','button']) {
      await reset();
      if(entry==='button') await button('[aria-label="Move selection right"]',fast);
      else { await (entry==='field'?focusField():focusGlobal()); await key('Right',fast?['alt','shift']:['alt']); }
      await wait(`${state}.project.past.length===1`,'one '+entry+' nudge');
      assert.deepEqual(await shape(),expected); assert.match(await evaluate(`${state}.project.past[0].name`),/^Nudge 2 performers/);
      await evaluate(`${editor}.dispatch('history.undo')`); assert.deepEqual(await shape(),points);
    }
    await reset({fieldOrientation:'audience-top'}); await focusField(); await key('Left',fast?['alt','shift']:['alt']); assert.deepEqual(await shape(),expected);
  }
  pass('direct command, field/global keys, normal/Shift-click buttons and flipped keys produce identical normal/fast positions and one named undo');

  await reset({},false); await focusField();
  await evaluate("window.__nudgeKeyEvents=[]; window.__nudgeListener=e=>{if(e.key==='ArrowRight')window.__nudgeKeyEvents.push({repeat:e.repeat,trusted:e.isTrusted})};document.addEventListener('keydown',window.__nudgeListener,true)");
  for(let i=0;i<3;i++) { window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right',modifiers:i?['alt','isautorepeat']:['alt']}); await wait(`${state}.project.past.length===${i+1}`,'held key step '+i); }
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right',modifiers:['alt']});
  near((await shape())[ids[0]].x,41.975); assert.equal(await history(),3);
  const events=await evaluate("document.removeEventListener('keydown',window.__nudgeListener,true);window.__nudgeKeyEvents");
  assert.deepEqual(events,[{repeat:false,trusted:true},{repeat:true,trusted:true},{repeat:true,trusted:true}]);
  await evaluate(`${editor}.dispatch('history.undo')`); near((await shape())[ids[0]].x,41.35);
  pass('trusted held-key events, including two auto-repeats, execute once each and undo one increment');

  for(const steps of [6,12]) {
    const show={...fixture,snapping:{...fixture.snapping,steps,subdivision:4}};
    await reset({nudgeUnit:'steps',nudgeStep:1,fastNudgeStep:4},false,show); await focusField(); await key('Right',['alt']); near((await shape())[ids[0]].x,40.1+5/steps);
    // Field help states both amounts; the Inspector labels its Move buttons with the normal one and their help states the Shift amount.
    assert.ok(await evaluate("(()=>{const help=document.querySelector('.field-keyboard-help').textContent;return help.includes('Alt+arrows: 1 step')&&help.includes('Shift+Alt: 4 steps')&&document.querySelector('.selection-section .move-buttons').previousElementSibling.textContent==='Move1 step'})()"));
    // An earlier click may have left the pointer on the button; help opens when the pointer enters it.
    // Native moves have no acknowledgement and can coalesce, so observe the pointer leaving before it returns.
    await hover('.selection-section .selection-coordinate'); await wait("!document.querySelector('[aria-label=\"Move selection right\"]').matches(':hover')",'pointer off the move button');
    await hover('[aria-label="Move selection right"]');
    await wait("[...document.querySelectorAll('[role=tooltip]')].some(n=>n.querySelector('strong')?.textContent==='Move selection right'&&n.textContent.includes('Shift-click requests 4 steps'))",'Inspector move help states the fast amount');
    await hover('.selection-section .selection-coordinate'); await wait("!document.querySelector('[role=tooltip]')",'move help dismissed');
  }
  pass('production step units use 6/12-to-5 full steps independently of quarter-grid subdivision and help shows both configured amounts');

  await reset({},false); await focusField(); await key('Right'); assert.deepEqual(await shape(),points); assert.equal(await history(),0);
  for(const kind of ['input','textarea','contenteditable']) {
    await evaluate(`(()=>{const n=document.createElement(${JSON.stringify(kind==='contenteditable'?'div':kind)});n.id='nudge-text-fixture';n.style.cssText='position:fixed;top:90px;left:30px';${kind==='contenteditable'?"n.contentEditable='true';":""}document.body.append(n);n.focus()})()`);
    await key('Right',['alt']); await key('Right',['alt','shift']); assert.deepEqual(await shape(),points); assert.equal(await history(),0);
    await evaluate("document.querySelector('#nudge-text-fixture').remove()");
  }
  for(const mode of ['empty','draft','preview','playing']) {
    await reset({},false);
    await evaluate(mode==='empty'?`${editor}.setValue('selection','selectedIds',[])`:mode==='draft'?`${editor}.setValue('ui','pendingDraft',true)`:mode==='preview'?`${editor}.dispatch('transform.preview',{})`:`${editor}.setValue('playback','playing',true)`);
    await focusField(); await key('Right',['alt']); await focusGlobal(); await key('Right',['alt']); assert.deepEqual(await shape(),points); assert.equal(await history(),0);
  }
  const edge={...fixture,sets:fixture.sets.map(set=>({...set,positions:{...points,[ids[0]]:{x:97.4,y:20.2},[ids[1]]:{x:100,y:21.1}}}))};
  await reset({},true,edge); await focusField(); await key('Right',['alt']); await key('Right',['alt']); assert.deepEqual(await shape(),edge.sets[0].positions); assert.equal(await history(),0);
  pass('plain arrows navigate; inputs/contenteditable, empty selection, drafts, previews and playback reject nudges; repeated off-grid edge nudges remain still');

  await reset({rotationStep:30,scaleStep:25}); await button('[aria-label="Rotate selection 30° clockwise"]');
  await wait(`${state}.ui.transformPreview?.options.angle===30`,'configured rotation'); assert.deepEqual(await shape(),points); await capture('increments-rotation.png');
  await button('[aria-label="Cancel transform"]'); await wait(`!${state}.ui.transformPreview`,'rotation canceled'); await button('[aria-label="Expand selection by 25%"]');
  await wait(`${state}.ui.transformPreview?.options.scale===1.25`,'configured scale'); assert.deepEqual(await shape(),points); await capture('increments-scale.png');
  await button('[aria-label="Apply transform"]'); await wait(`${state}.project.past.length===1 && !${state}.ui.transformPreview`,'configured transform applied'); assert.equal(await history(),1); near((await shape())[ids[0]].x,39.775);
  await evaluate(`${editor}.dispatch('history.undo')`); assert.deepEqual(await shape(),points);
  pass('configured 30-degree/25-percent buttons enter exact previews without editing; Apply is one reversible edit');

  await button('[aria-label="Project menu"]');
  await wait("(()=>{const n=document.querySelector('[role=menu][aria-label=\"Project menu\"] [aria-label=\"Preferences\"]');return !!n&&!n.closest('[role=menu]').hidden&&n.getClientRects().length>0})()",'project menu available');
  await button('[role=menu][aria-label="Project menu"] [aria-label="Preferences"]'); await wait("document.querySelector('.modal h2')?.textContent==='Preferences'",'increment preferences');
  for(const [width,zoom,name] of [[1366,1,'increments-preferences.png'],[1366,1.25,'increments-preferences-enlarged.png'],[1120,1,'increments-preferences-narrow.png']]) {
    window.setContentSize(width,768); window.webContents.setZoomFactor(zoom); await settleNativeViewport(window,'increment preferences layout');
    // Start each size from Appearance so the Editing jump below cannot pass on the previous iteration's state.
    const section=title=>`document.querySelector('.preferences-nav [aria-pressed=true]')?.textContent===${JSON.stringify(title)} && document.activeElement?.matches('.preferences-section > h3') && document.activeElement.textContent===${JSON.stringify(title)}`;
    await button('.preferences-nav [aria-label="Appearance"]'); await wait(section('Appearance'),'Appearance preferences section');
    // The Editing section nav jumps past Appearance and Field display; increments lead that group, clear of the pinned nav.
    await button('.preferences-nav [aria-label="Editing"]');
    await wait("document.querySelector('.preferences-nav [aria-pressed=true]')?.textContent==='Editing' && document.activeElement?.matches('.preferences-section > h3') && document.activeElement.textContent==='Editing' && document.activeElement.parentElement.querySelector('h4')?.textContent==='Editing increments'",'Editing preferences section');
    assert.ok(await evaluate("(()=>{const nav=document.querySelector('.preferences-nav').getBoundingClientRect().bottom;return ['Nudge ·','Fast nudge ·','Rotate preset ·','Scale preset ·'].every(label=>{const n=[...document.querySelectorAll('.preferences-fields label')].find(n=>n.textContent.startsWith(label)).querySelector('input');const r=n.getBoundingClientRect();return r.top>=nav && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth})})()"));
    await capture(name);
  }
  await key('Escape'); window.webContents.setZoomFactor(1); window.setContentSize(1120,768); await settleNativeViewport(window,'step help layout');
  await reset({nudgeUnit:'steps',nudgeStep:1,fastNudgeStep:4});
  // Keyboard help is drawn only after a key press in the field, and then takes the place of the field's hint line.
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.field-keyboard-help')).clipPath"), 'inset(50%)', 'idle keyboard help is not drawn');
  await focusField(); await key('Right');
  assert.ok(await evaluate("(()=>{const n=document.querySelector('.field-keyboard-help');const r=n.getBoundingClientRect();const drawn=s=>{const e=document.querySelector(s);if(!e)return false;const c=getComputedStyle(e);return c.display!=='none'&&c.visibility!=='hidden'};return getComputedStyle(n).clipPath==='none'&&r.height>10&&/4 steps/.test(n.textContent)&&!drawn('.field-topline')&&!drawn('.canvas-hint')&&!document.querySelector('.field-snap-status')})()"),'keyboard step help replaces field information');
  await capture('increments-field-narrow.png');
  pass('configured editing controls remain reachable at 1366/1120px and 125% UI zoom; step help stays separate from field information');
};
