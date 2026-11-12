'use strict';
const {revealFieldTool}=require('./testing/renderer.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {settleNativeViewport,selectNativeOption}=require('./testing/renderer.cjs');
// Assignment choices/paths belong here; the editor owner retains shape handles,
// draft validation and the existing file-dialog race matrix.
module.exports=async function({project,editor,state,evaluate,wait,key,capture:takeScreenshot,window,pass,saved,Menu}) {
  const ids=project.performers.slice(0,4).map(p=>p.id);const layouts=[];
  const capture=async name=>{await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});await evaluate('document.activeElement?.blur()');await wait("!document.querySelector('.tooltip-panel')",'dismissed help before capture');await takeScreenshot(name);};
  const control=async selector=>{ await revealFieldTool(window,selector);
    await evaluate('document.activeElement?.blur()');
    // Move off the previous help trigger before approaching a different control.
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});
    await wait(`new Promise(resolve=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||n.getAttribute('aria-disabled')==='true')return resolve(false);n.scrollIntoView({block:'nearest'});requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=n.getBoundingClientRect();window.__assignmentPoint={x:r.x+r.width/2,y:r.y+r.height/2};resolve(n.contains(document.elementFromPoint(window.__assignmentPoint.x,window.__assignmentPoint.y)));}));})`,'actionable '+selector);
    await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
    const point=await evaluate('window.__assignmentPoint');
    for(const type of ['mouseMoved','mousePressed','mouseReleased'])await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:type==='mouseMoved'?0:1});
  };
  const number=label=>`[...document.querySelectorAll('label.form-label')].find(n=>n.firstChild?.textContent===${JSON.stringify(label)}).querySelector('input')`;
  const edit=async(label,value)=>{await evaluate(`(()=>{const n=${number(label)};n.focus();n.select()})()`);await window.webContents.debugger.sendCommand('Input.insertText',{text:String(value)});await key('Return');await wait(`!${state}.ui.pendingDraft`,'committed '+label);};
  const menu=label=>{function find(m){for(const item of m?.items??[]){if(item.label===label)return item;const child=find(item.submenu);if(child)return child;}}const item=find(Menu.getApplicationMenu());assert.ok(item?.click);item.click(item,window,{});};
  window.setContentSize(1366,768);window.webContents.setZoomFactor(1);await settleNativeViewport(window,'live baseline');
  await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}});${editor}.setValue('selection','selectedIds',${JSON.stringify(ids)});${editor}.setValue('preferences','value',{...${state}.preferences.value,fieldOrientation:'audience-bottom',inspectorFormationOpen:true});`);
  await revealFieldTool(window,'[aria-label="Line formation"]');
  await wait("!!document.querySelector('[aria-label=\"Line formation\"]')",'formation panel');
  await capture('live-before.png');
  await control('[aria-label="Line formation"]');await edit('Width · yd',24);await edit('Center X · yd',50);await edit('Center Y · yd',25);
  await control('.live-keep input');
  await wait(`!!${state}.ui.formationPreview.live`,'keep editable');
  await evaluate("document.querySelector('[aria-label=\"Formation name\"]').focus();document.querySelector('[aria-label=\"Formation name\"]').select()");
  await window.webContents.debugger.sendCommand('Input.insertText',{text:'Front line'});await key('Tab');
  await control('[aria-label="Apply formation"]');await wait(`!!${state}.project.present.sets[0].liveFormations?.length`,'saved live line');
  let applied=await evaluate(`${state}.project.present`);const id=applied.sets[0].liveFormations[0].id;
  assert.equal(applied.sets[0].liveFormations[0].name,'Front line');assert.equal(await evaluate(`${state}.project.past.length`),1);
  await capture('live-after.png');
  menu('Save As…');await wait("document.querySelector('.save-state').textContent==='Project file saved'",'native live save');
  assert.equal(JSON.parse(await fs.readFile(saved,'utf8')).schemaVersion,7);
  menu('Open project…');await wait(`${state}.project.past.length===0`,'native live reopen');assert.deepEqual(await evaluate(`${state}.project.present`),applied);
  await evaluate(`document.querySelector('[aria-label="Edit Front line"]').focus()`);await key('Return');
  await wait(`!!${state}.ui.formationPreview?.live`,'keyboard live edit');
  const originalOptions=await evaluate(`${state}.ui.formationPreview.options`);
  const start=await evaluate(`(()=>{const p=new DOMPoint(0,0).matrixTransform(document.querySelector('[data-formation-handle="end"]').getScreenCTM());return {x:p.x,y:p.y};})()`);
  for(const event of [{type:'mouseMoved',...start},{type:'mousePressed',...start,button:'left',buttons:1,clickCount:1},{type:'mouseMoved',x:start.x+25,y:start.y,button:'left',buttons:1},{type:'mouseReleased',x:start.x+25,y:start.y,button:'left',buttons:0,clickCount:1}])await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',event);
  await wait(`${state}.ui.formationPreview.options.width!==${originalOptions.width}`,'endpoint moved');
  assert.deepEqual(await evaluate(`${state}.project.present`),applied);
  await key('Escape');await wait(`!${state}.ui.formationPreview`,'Escape cancels');assert.deepEqual(await evaluate(`${state}.project.present`),applied);
  pass('native checkbox/name creation, v7 save/reopen, keyboard Edit, endpoint drag and Escape retain saved geometry');
  for(const kind of ['arc','block']) {
    const name=applied.sets[0].liveFormations[0].name;
    await control(`[aria-label="Edit ${name}"]`);await control(`[aria-label="${kind==='arc'?'Arc':'Block'} formation"]`);
    if(kind==='arc') await edit('Bulge · yd',8); else {await edit('Depth · yd',10);await edit('Block columns',2);}
    await control('[aria-label="Apply formation"]');await wait(`!${state}.ui.formationPreview`,'saved '+kind);
    applied=await evaluate(`${state}.project.present`);assert.equal(applied.sets[0].liveFormations[0].kind,kind);
    menu('Undo drill edit');await wait(`${state}.project.future.length===1`,'live geometry undo');menu('Redo drill edit');await wait(`${state}.project.future.length===0`,'live geometry redo');assert.deepEqual(await evaluate(`${state}.project.present`),applied);
  }
  await control('[aria-label="Edit Front line"]');await wait("!!document.querySelector('.live-members summary')",'live parameters mounted');await evaluate("document.querySelector('.live-members summary').focus();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");assert.equal(await evaluate("document.activeElement===document.querySelector('.live-members summary')"),true,'formation opening keeps focus already moved into its parameters');await key('Return');await wait("document.querySelector('.live-members').open",'keyboard member expansion');await key('Space');await wait("!document.querySelector('.live-members').open",'Space collapses members');assert.equal(await evaluate(`${state}.playback.playing`),false);await key('Return');await wait("document.querySelector('.live-members').open",'Enter reopens members');
  await control('.live-member-list label:first-child input');await wait(`${state}.ui.formationPreview.ids.length===3`,'removed member preview');
  assert.deepEqual(await evaluate(`${state}.project.present`),applied);
  await capture('live-members.png');await control('[aria-label="Apply formation"]');await wait(`!${state}.ui.formationPreview`,'member applied');
  applied=await evaluate(`${state}.project.present`);assert.equal(applied.sets[0].liveFormations[0].members.length,3);
  pass('arc bulge/block dimensions and columns use the same live preview; native membership checkbox previews redistribution; one undo restores each accepted edit');
  // Ordinary per-dot editing goes through the shared command and transaction path.
  const member=applied.sets[0].liveFormations[0].members[0].performerId;
  await evaluate(`${editor}.dispatch('positions.move',{index:0,updates:{[${JSON.stringify(member)}]:{x:5,y:5}}})`);
  await wait(`${state}.project.present.sets[0].liveFormations[0].members.length===2`,'manual dot detached');
  await control('[aria-label="Edit Front line"]');await control('[aria-label="Redistribute members"]');
  assert.equal(await evaluate(`${state}.ui.formationPreview.live.slotCount`),2);
  await control('[aria-label="Apply formation"]');await wait(`!${state}.ui.formationPreview`,'redistribution applied');
  applied=await evaluate(`${state}.project.present`);assert.deepEqual(applied.sets[0].positions[member],{x:5,y:5});
  // Copy control uses native keyboard selection; source remains unchanged.
  await selectNativeOption(window,'.live-formation select',project.sets[1].id,{accepted:()=>evaluate(`!!${state}.ui.formationPreview && ${state}.ui.formationPreview.setId===${JSON.stringify(project.sets[1].id)} && ${state}.selection.activeIndex===1`)});
  await wait(`!!${state}.ui.formationPreview && ${state}.selection.activeIndex===1`,'copy to next set');
  assert.deepEqual(await evaluate(`${state}.project.present`),applied);await control('[aria-label="Apply formation"]');await wait(`!${state}.ui.formationPreview`,'copy applied');
  let copied=await evaluate(`${state}.project.present`);assert.deepEqual(copied.sets[0],applied.sets[0]);assert.notEqual(copied.sets[1].liveFormations[0].id,id);
  await evaluate(`${editor}.dispatch('set.select',{index:0});${editor}.dispatch('live.copy',{id:${JSON.stringify(id)},targetSetId:${JSON.stringify(project.sets[1].id)}})`);
  await wait("document.querySelector('.transform-result--error')?.textContent.includes('another live formation')",'copy conflict message');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply formation\"]').getAttribute('aria-disabled')"),'true');await capture('live-conflict.png');
  await control('[aria-label="Cancel formation"]');
  await control('[aria-label="Detach Front line"]');await wait(`!${state}.project.present.sets[1].liveFormations`,'detach all');
  menu('Undo drill edit');await wait(`!!${state}.project.present.sets[1].liveFormations`,'undo detach');
  assert.deepEqual(await evaluate(`${state}.project.present`),copied);
  pass('moving one dot detaches it without moving others; explicit redistribution preserves detached dots; copy previews, conflicts block Apply, and detach has undo');
  for(const [theme,width,scale] of [['dark',1366,1],['light',1366,1],['high-contrast',1366,1],['dark',1120,1.25]]) {
    window.setContentSize(width,768);
    await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)},uiScale:${scale}})`);
    await settleNativeViewport(window,'live layout');
    await control('[aria-label="Edit Front line"]');
    await evaluate("document.querySelector('.live-settings').scrollIntoView({block:'nearest'})");
    const metrics=await evaluate("(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};return {viewport:{width:innerWidth,height:innerHeight},field:rect('.field-container'),name:rect('[aria-label=\"Formation name\"]'),apply:rect('[aria-label=\"Apply formation\"]'),cancel:rect('[aria-label=\"Cancel formation\"]')}})()");
    for(const r of [metrics.name,metrics.apply,metrics.cancel])assert.ok(r.left>=0&&r.right<=metrics.viewport.width+.5&&r.top>=0&&r.bottom<=metrics.viewport.height+.5,JSON.stringify(metrics));
    if(width===1366)assert.ok(metrics.field.height>=470,JSON.stringify(metrics));
    layouts.push({theme,width,scale,...metrics});await capture(`live-${theme}-${width}-${scale}.png`);await control('[aria-label="Cancel formation"]');
  }
  assert.deepEqual(await evaluate(`${state}.project.present`),copied);
  menu('Save As…');await wait("document.querySelector('.save-state').textContent==='Project file saved'",'final native save');
  menu('Open project…');await wait(`${state}.project.past.length===0`,'final native reopen');assert.deepEqual(await evaluate(`${state}.project.present`),copied);
  pass('dark/light/high-contrast and enlarged narrow layout retain keyboard/numeric controls and field; final native save/reopen preserves slots and copied shape IDs');
  const responsiveness=[];
  for(const count of [2,64,500]) {
    const roster=Array.from({length:count},(_,i)=>({id:`live-p-${i}`,label:`P${i+1}`,name:'',sectionId:project.sections[0].id}));
    const positions=Object.fromEntries(roster.map((p,i)=>[p.id,{x:10+80*i/Math.max(1,count-1),y:25}]));
    const fixture={...project,performers:roster,sets:[{id:'live-benchmark',name:'Live benchmark',notes:'',positions}],moves:[]};
    const elapsed=await evaluate(`new Promise(resolve=>{${editor}.dispatch('project.load',{project:${JSON.stringify(fixture)}});${editor}.setValue('selection','selectedIds',${JSON.stringify(roster.map(p=>p.id))});const start=performance.now();${editor}.dispatch('formation.preview',{kind:'block'});${editor}.dispatch('formation.update',{options:{center:{x:50,y:25},width:60,height:30,rotation:0,columns:20,assignment:'roster'}});${editor}.dispatch('live.configure',{enabled:true});requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-start)));})`);
    await wait(`${state}.ui.formationPreview.ids.length===${count}`,'bounded live preview');
    assert.equal(await evaluate("document.querySelectorAll('[data-formation-path]').length"),count);
    await control('[aria-label="Apply formation"]');await wait(`!${state}.ui.formationPreview`,'bounded live acceptance');
    assert.equal(await evaluate(`${state}.project.present.sets[0].liveFormations[0].members.length`),count);
    responsiveness.push({count,previewReadyMs:elapsed});
  }
  pass('2, 64 and 500-member desktop previews and acceptance retain every performer with measured readiness');
  return {layouts,responsiveness};
};
