'use strict';
const {revealFieldTool}=require('./testing/renderer.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {settleNativeViewport,selectNativeOption}=require('./testing/renderer.cjs');
// Assignment choices/paths belong here; the editor owner retains shape handles,
// draft validation and the existing file-dialog race matrix.
module.exports=async function({largeFixtures,project,editor,state,evaluate,wait,key,capture:takeScreenshot,window,pass,saved,Menu}) {
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
  window.setContentSize(1366,768);window.webContents.setZoomFactor(1);await settleNativeViewport(window,'scatter baseline');
  await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(project)}});${editor}.setValue('selection','selectedIds',${JSON.stringify(ids)});${editor}.setValue('preferences','value',{...${state}.preferences.value,fieldOrientation:'audience-bottom',inspectorFormationOpen:true});`);
  await revealFieldTool(window,'[aria-label="Line formation"]');
  await wait("!!document.querySelector('[aria-label=\"Line formation\"]')",'formation panel');
  await capture('scatter-before.png');
  await control('[aria-label="Scatter formation"]');await wait(`!!${state}.ui.formationPreview?.scatter`,'scatter preview');
  const first=await evaluate(`${state}.ui.formationPreview.scatter`);
  await wait("document.querySelector('[data-draft-analysis-status]')?.dataset.draftAnalysisStatus==='ready'",'shared worker checks');
  assert.ok(await evaluate("document.querySelector('[data-neighbor=next] [data-neighbor-path]')?.getAttribute('d')?.includes('M')"));
  await capture('scatter-uniform.png');assert.deepEqual(await evaluate(`${state}.project.present`),project);
  const initial=await evaluate(`${state}.ui.formationPreview`),slot=initial.live.slots[0];
  await selectNativeOption(window,'[aria-label="Scatter member"]',slot);
  await control('[aria-label="Pin scatter member"]');
  await control('[aria-label="Reroll scatter"]');await wait(`${state}.ui.formationPreview.scatter.seed!==${JSON.stringify(first.seed)}`,'new seed');
  let generated=await evaluate(`${state}.ui.formationPreview.scatter`);assert.deepEqual(generated.points[slot],first.points[slot]);assert.notDeepEqual(generated.points,first.points);
  await selectNativeOption(window,'[aria-label="Scatter density"]','clustered');
  assert.equal(await evaluate(`${state}.ui.formationPreview.scatterPending`),true);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply formation\"]').getAttribute('aria-disabled')"),'true');
  assert.deepEqual(await evaluate(`${state}.ui.formationPreview.scatter.points`),generated.points);
  await control('[aria-label="Regenerate scatter"]');await wait(`!${state}.ui.formationPreview.scatterPending`,'explicit clustered generation');await capture('scatter-clustered.png');
  // Selected region corners use pointer input; Escape rolls back both geometry
  // and the requirement to regenerate. Numeric fields are the keyboard path.
  const drag=async(selector,dx,dy,cancel=false)=>{
    const start=await evaluate(`(()=>{const p=new DOMPoint(0,0).matrixTransform(document.querySelector(${JSON.stringify(selector)}).getScreenCTM());return {x:p.x,y:p.y};})()`);
    for(const e of [{type:'mouseMoved',...start},{type:'mousePressed',...start,button:'left',buttons:1,clickCount:1},{type:'mouseMoved',x:start.x+dx,y:start.y+dy,button:'left',buttons:1}])await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',e);
    if(cancel)await key('Escape');await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x+dx,y:start.y+dy,button:'left',buttons:0,clickCount:1});
  };
  const beforeGesture=await evaluate(`${state}.ui.formationPreview.scatter`);
  await drag('[data-scatter-handle=vertex][data-scatter-index="0"]',-15,-10,true);
  assert.deepEqual(await evaluate(`${state}.ui.formationPreview.scatter`),beforeGesture);assert.equal(await evaluate(`!!${state}.ui.formationPreview.scatterPending`),false);
  await control('[aria-label="Pin scatter member"]');
  await selectNativeOption(window,'[aria-label="Scatter region"]','ellipse');await control('[aria-label="Regenerate scatter"]');
  await wait(`!${state}.ui.formationPreview.scatterPending`,'ellipse regeneration');await capture('scatter-ellipse.png');
  await selectNativeOption(window,'[aria-label="Scatter region"]','polygon');await control('[aria-label="Insert region vertex"]');
  await wait(`${state}.ui.formationPreview.scatter.region.vertices.length===5`,'split polygon edge');
  await selectNativeOption(window,'[aria-label="Region vertex"]',1);await control('[aria-label="Delete region vertex"]');await wait(`${state}.ui.formationPreview.scatter.region.vertices.length===4`,'delete polygon vertex');
  await control('[aria-label="Regenerate scatter"]');await capture('scatter-polygon.png');
  await selectNativeOption(window,'[aria-label="Scatter member"]',slot);
  await control('[aria-label="Pin scatter member"]');
  const pinnedPoint=await evaluate(`${state}.ui.formationPreview.scatter.points[${slot}]`);
  await evaluate(`${editor}.setValue('ui','snap',false)`);
  await edit('Scatter dot X · yd',pinnedPoint.x+.25);
  await wait(`${state}.ui.formationPreview.scatter.points[${slot}].x>${pinnedPoint.x}`,'manual override');
  const beforeDotDrag=await evaluate(`${state}.ui.formationPreview.scatter`);
  await drag(`[data-scatter-handle=dot][data-scatter-index="${slot}"]`,8,0,true);assert.deepEqual(await evaluate(`${state}.ui.formationPreview.scatter`),beforeDotDrag);
  await control('[aria-label="Reroll scatter"]');assert.deepEqual(await evaluate(`${state}.ui.formationPreview.scatter.points[${slot}]`),beforeDotDrag.points[slot]);
  generated=await evaluate(`${state}.ui.formationPreview.scatter`);
  await edit('Minimum spacing · yd',100);await control('[aria-label="Regenerate scatter"]');
  await wait("document.querySelector('.scatter-fields [role=alert]')?.textContent.includes('No partial arrangement')",'infeasible generation message');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply formation\"]').getAttribute('aria-disabled')"),'true');
  assert.deepEqual(await evaluate(`${state}.project.present`),project);assert.deepEqual(await evaluate(`${state}.ui.formationPreview.scatter.points`),generated.points);await capture('scatter-infeasible.png');
  await edit('Minimum spacing · yd',1);await control('[aria-label="Regenerate scatter"]');
  await control('[aria-label="Apply formation"]');await wait(`!${state}.ui.formationPreview`,'scatter applied');
  const accepted=await evaluate(`${state}.project.present`),shape=accepted.sets[0].liveFormations[0];
  assert.equal(await evaluate(`${state}.project.past.length`),1);assert.deepEqual(accepted.moves,project.moves);
  for(const p of project.performers.slice(4))assert.deepEqual(accepted.sets[0].positions[p.id],project.sets[0].positions[p.id]);
  await capture('scatter-applied.png');menu('Undo drill edit');await wait(`${state}.project.future.length===1`,'undo scatter');assert.deepEqual(await evaluate(`${state}.project.present`),project);
  menu('Redo drill edit');await wait(`${state}.project.future.length===0`,'redo scatter');
  menu('Save As…');await wait("document.querySelector('.save-state').textContent==='Project file saved'",'native v10 save');assert.equal(JSON.parse(await fs.readFile(saved,'utf8')).schemaVersion,10);
  menu('Open project…');await wait(`${state}.project.past.length===0`,'native v10 reopen');assert.deepEqual(await evaluate(`${state}.project.present`),accepted);
  pass('seeded previews, fixed pins/reroll, explicit density/region regeneration, polygon editing, numeric dot overrides, native canceled gestures, infeasibility without partial edits, one-step undo/redo and native v10 files');
  for(const [theme,width,scale] of [['dark',1366,1],['light',1366,1],['high-contrast',1366,1],['dark',1120,1.25]]) {
    window.setContentSize(width,768);await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)},uiScale:${scale}})`);await settleNativeViewport(window,'scatter layout');
    await control(`[aria-label="Edit ${shape.name}"]`);await evaluate("document.querySelector('.scatter-fields').scrollIntoView({block:'nearest'})");
    const metrics=await evaluate("(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height}};return {viewport:{width:innerWidth,height:innerHeight},field:rect('.field-container'),seed:rect('[aria-label=\"Scatter seed\"]'),apply:rect('[aria-label=\"Apply formation\"]'),cancel:rect('[aria-label=\"Cancel formation\"]')}})()");
    for(const r of [metrics.seed,metrics.apply,metrics.cancel])assert.ok(r.left>=0&&r.right<=metrics.viewport.width+.5&&r.top>=0&&r.bottom<=metrics.viewport.height+.5,JSON.stringify(metrics));if(width===1366)assert.ok(metrics.field.height>=470,JSON.stringify(metrics));
    await wait("document.querySelector('[data-draft-analysis-status]')?.dataset.draftAnalysisStatus==='ready'",'rendered movement checks');
    layouts.push({theme,width,scale,...metrics});await capture(`scatter-${theme}-${width}-${scale}.png`);await control('[aria-label="Cancel formation"]');
  }
  assert.deepEqual(await evaluate(`${state}.project.present`),accepted);
  pass('stored scatter reopens without reshuffling; dark/light/high-contrast and enlarged narrow controls keep Apply/Cancel and numeric region entry reachable');
  window.setContentSize(1366,768);await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:'dark',uiScale:1})`);await settleNativeViewport(window,'scatter dense review');
  const sizes=[];
  for(const fixture of JSON.parse(await fs.readFile(largeFixtures,'utf8'))) {
    await evaluate(`${editor}.dispatch('project.load',{project:${JSON.stringify(fixture)}});${editor}.setValue('selection','selectedIds',${JSON.stringify(fixture.performers.map(p=>p.id))})`);
    const start=Date.now();await control('[aria-label="Scatter formation"]');await wait(`!!${state}.ui.formationPreview?.scatter`,'dense scatter preview');
    sizes.push({members:fixture.performers.length,nativeActionToPreviewMs:Date.now()-start});
    await wait("document.querySelector('[data-draft-analysis-status]')?.dataset.draftAnalysisStatus==='ready'",'dense shared checks');
    if(fixture.performers.length>=64){const before=await evaluate(`${state}.ui.formationPreview.scatter`);await control('[aria-label="Show scatter movement paths"]');await wait("document.querySelector('[data-draft-analysis-status]')?.dataset.draftAnalysisStatus==='ready'",'hidden-path checks active');assert.equal(await evaluate("document.querySelectorAll('[data-neighbor-path],.problem-preview .problem-path').length"),0);assert.deepEqual(await evaluate(`${state}.ui.formationPreview.scatter`),before);}
    await capture(`scatter-${fixture.performers.length}-uniform.png`);
    if(fixture.performers.length===64){await selectNativeOption(window,'[aria-label="Scatter density"]','clustered');await edit('Cluster strength',1);await control('[aria-label="Regenerate scatter"]');await wait("document.querySelector('[data-draft-analysis-status]')?.dataset.draftAnalysisStatus==='ready'",'clustered shared checks');await capture('scatter-64-clustered.png');}
    assert.deepEqual(await evaluate(`${state}.project.present`),fixture);await control('[aria-label="Cancel formation"]');
  }
  pass('native 2/64/500-member previews and worker checks complete; 64-member uniform/clustered output reviewed without changing the production');
  return {layouts,sizes};
};
