'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {settleNativeViewport}=require('./testing/renderer.cjs');
// Assignment choices/paths belong here; the editor owner retains shape handles,
// draft validation and the existing file-dialog race matrix.
module.exports=async function({project,editor,state,evaluate,wait,key,capture:takeScreenshot,window,pass,saved,Menu}) {
  const ids=project.performers.slice(0,4).map(p=>p.id);const layouts=[];
  const capture=async name=>{await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});await evaluate('document.activeElement?.blur()');await wait("!document.querySelector('.tooltip-panel')",'dismissed help before capture');await takeScreenshot(name);};
  const control=async selector=>{
    // Moving off a hover trigger is part of approaching a different control.
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});
    await wait(`new Promise(resolve=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||n.getAttribute('aria-disabled')==='true')return resolve(false);n.scrollIntoView({block:'nearest'});requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=n.getBoundingClientRect();window.__assignmentPoint={x:r.x+r.width/2,y:r.y+r.height/2};resolve(n.contains(document.elementFromPoint(window.__assignmentPoint.x,window.__assignmentPoint.y)));}));})`,'actionable '+selector);
    await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
    const point=await evaluate('window.__assignmentPoint');
    for(const type of ['mouseMoved','mousePressed','mouseReleased'])await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:type==='mouseMoved'?0:1});
  };
  const number=label=>`[...document.querySelectorAll('label.form-label')].find(n=>n.firstChild?.textContent===${JSON.stringify(label)}).querySelector('input')`;
  const edit=async(label,value)=>{await evaluate(`(()=>{const n=${number(label)};n.focus();n.select()})()`);await window.webContents.debugger.sendCommand('Input.insertText',{text:String(value)});await key('Return');await wait(`!${state}.ui.pendingDraft`,'committed '+label);};
  const mode=async value=>{
    const selector=value==='position'?'[aria-label="Positional assignment"]':'[aria-label="Roster assignment"]';
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);await key('Return');
    await wait(`${state}.ui.formationPreview.options.assignment===${JSON.stringify(value)} && document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-pressed')==='true'`,'native assignment choice');
  };
  const positions=()=>evaluate(`Object.fromEntries(${JSON.stringify(ids)}.map(id=>{const n=document.querySelector('[data-performer-id="'+id+'"]');const m=n.transform.baseVal.consolidate().matrix;return [id,{x:m.e,y:m.f}]}))`);
  function near(actual,expected){for(const id of ids)for(const axis of ['x','y'])assert.ok(Math.abs(actual[id][axis]-expected[id][axis])<1e-5,JSON.stringify({id,actual:actual[id],expected:expected[id]}));}
  const menu=label=>{function find(m){for(const item of m?.items??[]){if(item.label===label)return item;const child=find(item.submenu);if(child)return child;}}const item=find(Menu.getApplicationMenu());assert.ok(item?.click);item.click(item,window,{});};
  window.setContentSize(1366,768);window.webContents.setZoomFactor(1);await settleNativeViewport(window,'assignment baseline');
  await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}});${editor}.setValue('selection','selectedIds',${JSON.stringify(ids)});${editor}.setValue('ui','workspace','design');${editor}.setValue('ui','view','2d');${editor}.setValue('ui','castPanelOpen',false);${editor}.setValue('preferences','value',{...${state}.preferences.value,fieldOrientation:'audience-bottom',inspectorFormationOpen:true});`);
  await wait("!!document.querySelector('[aria-label=\"Shape selection\"]')",'selection controls');
  await capture('assignment-before.png');
  await control('[aria-label="Line formation"]');await edit('Width · yd',24);await edit('Center X · yd',50);await edit('Center Y · yd',25);
  await wait("document.querySelectorAll('[data-formation-path]').length===4",'four assignment paths');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Positional assignment\"]').getAttribute('aria-pressed')"),'true');
  const positional=Object.fromEntries(ids.map((id,i)=>[id,{x:62-i*8,y:25}]));near(await positions(),positional);
  assert.deepEqual(await evaluate(`${state}.project.present`),project);assert.equal(await evaluate(`${state}.project.past.length`),0);
  await capture('assignment-positional.png');
  const positionalTravel=await evaluate("document.querySelector('.formation-travel').textContent");assert.match(positionalTravel,/21.86 yd/);
  await mode('roster');near(await positions(),Object.fromEntries(ids.map((id,i)=>[id,{x:38+i*8,y:25}])));
  const rosterTravel=await evaluate("document.querySelector('.formation-travel').textContent");assert.match(rosterTravel,/75.51 yd/);
  await capture('assignment-roster.png');await mode('position');near(await positions(),positional);
  pass('native keyboard assignment choice changes visible ID paths and travel; reversed groups retain positional order and preview adds no history');
  await edit('Rotation · °',180);near(await positions(),Object.fromEntries(ids.map((id,i)=>[id,{x:38+i*8,y:25}])));await edit('Rotation · °',0);near(await positions(),positional);
  for(const [width,zoom] of [[1366,1],[1366,1.25],[1120,1],[1120,1.25]]){
    window.setContentSize(width,768);window.webContents.setZoomFactor(zoom);await settleNativeViewport(window,'assignment layout');
    await control('[aria-label="Cancel formation"]');await wait(`!${state}.ui.formationPreview`,'layout comparison without preview');
    const baselineHeight=await evaluate("document.querySelector('.field-container').getBoundingClientRect().height");
    await control('[aria-label="Line formation"]');await edit('Center Y · yd',25);
    await evaluate("document.querySelector('[aria-label=\"Formation assignment\"]').scrollIntoView({block:'nearest'})");
    const metrics=await evaluate("(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};return {viewport:{width:innerWidth,height:innerHeight},field:rect('.field-container'),assignment:rect('[aria-label=\"Formation assignment\"]'),apply:rect('[aria-label=\"Apply formation\"]'),cancel:rect('[aria-label=\"Cancel formation\"]')}})()");
    for(const r of [metrics.assignment,metrics.apply,metrics.cancel])assert.ok(r.left>=0&&r.right<=metrics.viewport.width+.5&&r.top>=0&&r.bottom<=metrics.viewport.height+.5,JSON.stringify(metrics));
    assert.ok(Math.abs(metrics.field.height-baselineHeight)<.5,JSON.stringify({baselineHeight,...metrics}));
    if(width===1366&&zoom===1)assert.ok(metrics.field.height>=470,JSON.stringify(metrics));
    assert.ok(metrics.field.height*zoom>=300,JSON.stringify(metrics));layouts.push({width,zoom,baselineHeight,...metrics});await capture('assignment-'+width+'-'+zoom+'.png');
    await evaluate("document.querySelector('.formation-travel').scrollIntoView({block:'nearest'})");
    await wait("(()=>{const r=document.querySelector('.formation-travel').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()",'travel remains reachable');
    if(width===1120&&zoom===1.25)await capture('assignment-travel-enlarged.png');
  }
  window.webContents.setZoomFactor(1);window.setContentSize(1366,768);await settleNativeViewport(window,'assignment restored');
  await control('[aria-label="Apply formation"]');await wait(`!${state}.ui.formationPreview`,'applied assignment');
  const applied=await evaluate(`${state}.project.present`);near(applied.sets[0].positions,positional);assert.deepEqual(applied.performers,project.performers);assert.deepEqual(applied.sets.slice(1),project.sets.slice(1));
  assert.equal(await evaluate(`${state}.project.past.length`),1);assert.match(await evaluate(`${state}.project.past[0].name`),/positional assignment/);
  menu('Undo drill edit');await wait(`${state}.project.future.length===1`,'assignment undo');assert.deepEqual(await evaluate(`${state}.project.present`),project);
  menu('Redo drill edit');await wait(`${state}.project.past.length===1`,'assignment redo');assert.deepEqual(await evaluate(`${state}.project.present`),applied);
  menu('Save As…');await wait("document.querySelector('.save-state').textContent==='Project file saved'",'saved assignment');assert.deepEqual(JSON.parse(await fs.readFile(saved,'utf8')),applied);
  menu('Open project…');await wait(`${state}.project.past.length===0`,'reopened assignment');assert.deepEqual(await evaluate(`${state}.project.present`),applied);
  pass('rotation keeps assignment identity; laptop/enlarged layouts retain controls; Apply is one named undo and native save/reopen preserves roster identity and geometry');
  return {layouts,positionalTravel,rosterTravel};
};
