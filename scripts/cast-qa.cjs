'use strict';
const assert = require('node:assert/strict');
const { settleNativeViewport } = require('./testing/renderer.cjs');

module.exports = async function checkCast({ project, editor, state, evaluate, wait, click, key, capture, window, pass }) {
  const layouts = [];
  await evaluate(`window.__castEvents=[];for(const type of ['keydown','keyup','pointerdown','pointerup','click'])document.addEventListener(type,e=>{const n=e.target.closest?.('.cast-list button,dialog button');if(n){window.__castEvents.push({type,key:e.key,shift:e.shiftKey,ctrl:e.ctrlKey,meta:e.metaKey,detail:e.detail,trusted:e.isTrusted,label:n.getAttribute('aria-label')||n.textContent.trim(),selection:${state}.selection.selectedIds});window.__castEvents=window.__castEvents.slice(-40);}},true)`);
  const ids = project.performers.map(p => p.id);
  const row = id => `.cast-dock [data-cast-id="${id}"] button`;
  const control = async (selector, modifiers = []) => {
    // Native dialog centering and selection reveal can settle after React commits.
    // Wait for an actionable target; never retry a click or its behavior assertion.
    await wait(`new Promise(resolve=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n || n.disabled || n.getAttribute('aria-disabled')==='true'){resolve(false);return;}n.scrollIntoView({block:'nearest'});requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!n.isConnected){resolve(false);return;}const r=n.getBoundingClientRect();const x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);const hit=document.elementFromPoint(x,y);window.__castClickPoint={x,y};resolve(!!hit && n.contains(hit));}));})`, 'native click target '+selector);
    const point = await evaluate('window.__castClickPoint');
    for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) window.webContents.sendInputEvent({type,...point,button:'left',clickCount:1,modifiers});
  };
  const selection = () => evaluate(`${state}.selection.selectedIds`);
  const selected = async expected => { try { await wait(`JSON.stringify([...${state}.selection.selectedIds].sort())===${JSON.stringify(JSON.stringify([...expected].sort()))}`, 'Cast shared selection '+expected.map(id=>project.performers.find(p=>p.id===id)?.label).join(',')); } catch(error) { console.error('Expected selection',expected,'Observed',await selection(),'Native events',await evaluate('window.__castEvents ?? []')); throw error; } };
  const text = async (selector, value) => {
    await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.focus();n.select()})()`);
    await window.webContents.debugger.sendCommand('Input.insertText', {text:value});
  };
  window.setContentSize(1366,768); window.webContents.setZoomFactor(1); await settleNativeViewport(window,'Cast baseline');
  await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}});${editor}.setValue('ui','workspace','design');${editor}.setValue('ui','castPanelOpen',false);${editor}.setValue('ui','view','2d');${editor}.setValue('ui','zoom',1);${editor}.setValue('ui','showPaths',false);${editor}.setValue('ui','showNextPaths',false);${editor}.setValue('preferences','value',{...${state}.preferences.value,fieldOrientation:'audience-bottom'})`);
  await wait("document.querySelectorAll('.field-performer').length===500 && !!document.querySelector('.inspector')",'Cast baseline field');
  const before = await evaluate(`${state}.project`);
  const fieldHeight = await evaluate("document.querySelector('.field-container').getBoundingClientRect().height");
  await capture('cast-before.png');
  await control('.workspace-tab[aria-label="Cast"]');
  await wait("document.querySelectorAll('.cast-list li').length===500 && !!document.querySelector('.field-stage__svg') && !document.querySelector('.inspector')",'Cast dock beside field');
  assert.equal(await evaluate("document.querySelector('.field-container').getBoundingClientRect().height"),fieldHeight);
  await control(row(ids[212])); await selected([ids[212]]);
  assert.equal(await evaluate(`document.querySelector('[data-performer-id="${ids[212]}"]').getAttribute('aria-pressed')`),'true');
  const point = await evaluate(`(()=>{const r=document.querySelector('[data-performer-id="${ids[237]}"] .field-dot').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await click(point); await selected([ids[237]]);
  await wait(`document.querySelector(${JSON.stringify(row(ids[237]))}).getAttribute('aria-pressed')==='true'`,'field reveals Cast selection');
  assert.ok(await evaluate(`(()=>{const a=document.querySelector(${JSON.stringify(row(ids[237]))}).getBoundingClientRect(),b=document.querySelector('.cast-dock .table-scroll').getBoundingClientRect();return a.top>=b.top && a.bottom<=b.bottom})()`));
  assert.ok(await evaluate("!!document.activeElement.closest('.field-stage__svg')"),'reveal must keep field focus');
  await capture('cast-docked.png');
  pass('Cast docks beside the field without reducing its height; native row/dot selection shares IDs and reveals rows without stealing field focus');

  const target = project.performers[497];
  await text('[aria-label="Find a performer"]',target.label);
  await wait("document.querySelectorAll('.cast-list li').length===1 && !!document.querySelector('.cast-filter-notice')",'filtered selection notice');
  await selected([ids[237]]);
  await control('[aria-label="Select all visible performers"]'); await selected([ids[237],target.id]);
  await control('[aria-label="Select all visible performers"]'); await selected([ids[237]]);
  await control('.cast-filter-notice button');
  await wait("document.querySelectorAll('.cast-list li').length===500 && !document.querySelector('.cast-filter-notice')",'explicit reveal clears filters');
  await control('.field-legend button');
  const members = project.performers.filter(p=>p.sectionId===project.sections[0].id).map(p=>p.id); await selected(members);
  assert.equal(await evaluate("document.querySelectorAll('.cast-list .selected').length"),members.length);
  pass('search and section selection retain hidden IDs; visible bulk selection only changes filtered members and explicit reveal clears filters');

  await control(row(ids[212])); await control(row(ids[214]),['shift']); await selected(ids.slice(212,215));
  await control(row(ids[213]),[process.platform==='darwin'?'meta':'control']); await selected([ids[212],ids[214]]);
  await key('Down');
  assert.equal(await evaluate("document.activeElement.closest('[data-cast-id]').dataset.castId"),ids[214]);
  await selected([ids[212],ids[214]]); await evaluate('window.__castEvents=[]'); await key('Space'); await selected([ids[212]]);
  assert.equal(await evaluate("window.__castEvents.filter(e=>e.type==='click' && e.trusted && e.detail===0).length"),1,'Space must use one native button activation');
  await key('Space'); await selected([ids[212],ids[214]]); await key('Space'); await selected([ids[212]]);
  await key('End'); assert.equal(await evaluate("document.activeElement.closest('[data-cast-id]').dataset.castId"),ids.at(-1));
  await key('Home'); await key('Return'); await selected([ids[0]]);
  assert.equal(await evaluate("document.querySelectorAll('.cast-list button[tabindex=\"0\"]').length"),1);
  await key('Down',['shift']); await selected(ids.slice(0,2));
  await control(row(ids[212]));
  await wait(`!!document.querySelector('[aria-label="Name for ${project.performers[212].label}"]')`,'single-performer editor');
  assert.deepEqual((await evaluate(`${state}.project`)).present,before.present);
  assert.equal(await evaluate(`${state}.project.past.length`),0);
  pass('maximum Cast uses one list Tab stop; native arrows/Home/End navigate, Space toggles and Shift ranges preserve selection without editing history');

  const person = project.performers[212]; const nameSelector = `[aria-label="Name for ${person.label}"]`;
  await text(nameSelector,'Casey');
  await wait(`${state}.ui.pendingDraft`,'name draft');
  assert.equal(await evaluate(`${state}.project.past.length`),0);
  // A shared-selection client changing focus must not unmount the current name draft.
  await evaluate(`${editor}.setValue('selection','selectedIds',[${JSON.stringify(ids[213])}])`);
  await wait(`document.querySelector(${JSON.stringify(nameSelector)})?.value==='Casey'`,'name draft retained across selection');
  await key('Return');
  await wait(`${state}.project.present.performers[212].name==='Casey' && ${state}.project.past.length===1`,'one name commit');
  assert.equal(await evaluate(`${state}.project.past[0].name`),`Rename ${person.label}`);
  await evaluate(`${editor}.dispatch('history.undo')`); await wait(`${state}.project.past.length===0`,'name undo');
  assert.equal(await evaluate(`${state}.project.present.performers[212].name`),person.name);
  await evaluate(`${editor}.dispatch('history.redo')`); await wait(`${state}.project.present.performers[212].name==='Casey'`,'name redo');
  await control(row(ids[212])); await wait(`!!document.querySelector(${JSON.stringify(nameSelector)})`,'name editor restored');
  await text(nameSelector,'Cancel this'); await key('Escape'); assert.equal(await evaluate(`${state}.project.past.length`),1);
  const nextSection = project.sections.find(s=>s.id!==person.sectionId).id;
  await evaluate(`(()=>{const n=document.querySelector('[aria-label="Section for ${person.label}"]');n.value=${JSON.stringify(nextSection)};n.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait(`${state}.project.present.performers[212].sectionId===${JSON.stringify(nextSection)} && ${state}.project.past.length===2`,'section commit');
  assert.deepEqual(await evaluate(`${state}.project.present.sets.map(s=>s.positions)`),project.sets.map(s=>s.positions));
  assert.deepEqual((await evaluate(`${state}.project.present.performers[212]`)),{...person,name:'Casey',sectionId:nextSection});
  await control('[aria-label="Filter section"]'); await key('Escape');
  await evaluate(`(()=>{const n=document.querySelector('[aria-label="Filter section"]');n.value=${JSON.stringify(person.sectionId)};n.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait("!!document.querySelector('.cast-filter-notice')",'changed section explains hidden selection');
  await capture('cast-filtered.png');
  await control('.cast-filter-notice button');
  pass('name drafts survive shared selection changes, Enter commits one named undo and Escape cancels; section reassignment preserves identity and all set geometry');

  await control('[aria-label="Full Cast table"]'); await wait("document.querySelectorAll('.cast-table tbody tr').length===500",'full table');
  await selected([ids[212]]); await capture('cast-full-table.png');
  await control('[aria-label="Dock Cast beside field"]'); await wait("!!document.querySelector('.cast-dock') && !!document.querySelector('.field-stage__svg')",'redocked');
  await control('[aria-label="Remove selected performers"]'); await wait("!!document.querySelector('dialog[open]')",'remove Cast confirmation');
  // showModal focuses Close; dismiss its focus help by moving to Cancel.
  // The tooltip can cover the confirmation button until focus leaves Close.
  await key('Tab'); await wait("document.activeElement.matches('.modal-actions .subtle') && !document.querySelector('dialog .tooltip-panel')",'confirmation keyboard focus');
  await control('.modal .danger'); await wait("document.querySelectorAll('.cast-list li').length===499",'removed Cast row');
  await selected([]); assert.ok(await evaluate(`${state}.project.present.sets.every(s=>!s.positions[${JSON.stringify(ids[212])}])`));
  await evaluate(`${editor}.dispatch('history.undo')`); await wait("document.querySelectorAll('.cast-list li').length===500",'removed performer undo');
  await control(row(ids[212]));
  pass('full table and dock retain selection; confirmed removal reconciles rows, selection and every set, and undo restores the performer');

  for (const [width,zoom,name] of [[1366,1,'cast-docked-1366.png'],[1366,1.25,'cast-enlarged.png'],[1120,1,'cast-narrow.png']]) {
    window.setContentSize(width,768);window.webContents.setZoomFactor(zoom);await settleNativeViewport(window,'Cast layout');
    assert.deepEqual(window.getContentSize(),[width,768]);
    const layout = await evaluate("(()=>{const r=s=>{const a=document.querySelector(s).getBoundingClientRect();return {top:a.top,bottom:a.bottom,left:a.left,right:a.right,width:a.width,height:a.height}};return {width:innerWidth,height:innerHeight,field:r('.field-container'),cast:r('.cast-dock'),edit:r('.cast-edit'),list:r('.cast-dock .table-scroll'),footer:r('.statusbar')}})()");
    assert.ok(layout.field.width>400 && layout.field.height*zoom>=400,JSON.stringify(layout));
    assert.ok(layout.cast.right<=layout.width && layout.edit.bottom<=layout.footer.top && layout.list.height>=80,JSON.stringify(layout));
    await wait(`(()=>{const a=document.querySelector(${JSON.stringify(row(ids[212]))}).getBoundingClientRect(),b=document.querySelector('.cast-dock .table-scroll').getBoundingClientRect();return a.top>=b.top-.5 && a.bottom<=b.bottom+.5})()`,'selected row remains revealed after layout');
    layouts.push({nativeWidth:width,zoom,...layout});
    await capture(name);
  }
  window.webContents.setZoomFactor(1);window.setContentSize(1366,768);await settleNativeViewport(window,'Cast layout restore');
  await control('[aria-label="Show Inspector"]'); await wait("!!document.querySelector('.inspector') && !document.querySelector('.cast-dock')",'Inspector restored');
  await selected([ids[212]]);
  pass('Cast, editing controls and field remain visible at 1366/1120px and 125% UI zoom; closing the dock restores Inspector without changing selection');
  return { beforeFieldHeight:fieldHeight, layouts };
};
