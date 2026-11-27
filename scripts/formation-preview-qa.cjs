'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { key, keyWithRelease, pause } = require('./testing/renderer.cjs');

// Formation integration belongs to the editor owner; field QA continues to own hit testing.
module.exports = async function ({window,output,evaluate,uiWait,clickSelector,resolve,editNumber,numberSelector,capture,pass,menuAction,openHistory,fixture,snapshot}) {
  window.setContentSize(1366,768); window.webContents.setZoomFactor(1);
  await clickSelector('[aria-label="Fit field"]');
  const ids=fixture.performers.slice(0,2).map(p=>p.id); let sequence=0;
  const saved=()=>snapshot(path.join(output,`formation-${process.pid}-${sequence++}.squid`));
  // The panel reads lengths in the production's steps (eight to five yards here); the center's exact yards are one step away.
  const steps=yards=>yards/.625;
  // A shape is a tool on the strip, or an action in its Shape menu once a narrow strip folds the group away.
  const shape=label=>`.field-command-toolbar [aria-label="${label} formation"], [role=menu][aria-label="Shape"] [aria-label="${label}"]`;
  async function screenshot(name) { await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:12,y:70}); await evaluate("document.querySelector('.toast button')?.click()"); await pause(40); await capture(name); }
  async function keyboard(selector) { const node=await resolve(selector); await evaluate(`document.querySelector(${JSON.stringify(node)}).focus()`); await keyWithRelease(window,'Return',[],{releaseKey:'Enter'}); }
  async function open(label) { await keyboard(shape(label)); await uiWait(`document.querySelector('.formation-grid [aria-label="${label} formation"]')?.getAttribute('aria-pressed')==='true'`,`${label} formation preview`); }
  async function center(x,y) {
    if(!await evaluate("document.querySelector('.formation-center details').open")) { await keyboard('.formation-center details > summary'); await uiWait("document.querySelector('.formation-center details').open",'exact center shown'); }
    await editNumber('Center X · yd',x); await editNumber('Center Y · yd',y);
  }
  async function shown() { return evaluate(`Object.fromEntries(${JSON.stringify(ids)}.map(id=>{const n=document.querySelector('[data-performer-id="'+id+'"]');const p=n.transform.baseVal.consolidate().matrix;return [id,{x:p.e,y:p.f}]}))`); }
  function near(actual,expected) { for(const id of ids) for(const axis of ['x','y']) assert.ok(Math.abs(actual[id][axis]-expected[id][axis])<.00002,`${id} ${axis}: ${actual[id][axis]} vs ${expected[id][axis]}`); }
  async function cancel() { await keyboard('[aria-label="Cancel formation"]'); await uiWait("!document.querySelector('.formation-parameters')",'formation canceled'); }
  async function drag(kind,target,cancelGesture=false) {
    const start=await evaluate(`(()=>{const p=new DOMPoint(0,0).matrixTransform(document.querySelector('[data-formation-handle="${kind}"]').getScreenCTM());return {x:p.x,y:p.y};})()`);
    const end=await evaluate(`(()=>{const p=new DOMPoint(${target.x},${target.y}).matrixTransform(document.querySelector('[data-field-geometry]').getScreenCTM());return {x:p.x,y:p.y};})()`);
    for(const event of [{type:'mouseMoved',...start},{type:'mousePressed',...start,button:'left',buttons:1,clickCount:1},{type:'mouseMoved',...end,button:'left',buttons:1}]) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',event);
    await pause(50); if(cancelGesture) await key(window,'Escape');
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',buttons:0,clickCount:1});
  }
  await clickSelector('.inspector .field-legend button:first-child'); await screenshot('formation-before.png');
  for(const [label,depth] of [['Line',null],['Arc','Bulge · steps'],['Circle','Depth · steps'],['Block','Depth · steps'],['Wave','Depth · steps']]) {
    await open(label); await editNumber(label==='Line'?'Length · steps':'Width · steps',steps(10)); if(depth) await editNumber(depth,steps(6)); await editNumber('Rotation · °',0);
    assert.match(await evaluate("document.querySelector('.field-keyboard-help').textContent"), /Enter: apply formation.*Escape: cancel preview/);
    // The strip names the preview and holds its two ways out.
    assert.deepEqual(await evaluate("[document.querySelector('.field-command-toolbar').dataset.context,document.querySelector('.field-command-toolbar .toolbar-preview strong').textContent,...[...document.querySelectorAll('.field-command-toolbar [data-command]')].map(n=>n.dataset.command)]"),['preview',`${label} formation`,'formation.cancel','formation.apply']);
    assert.deepEqual(await saved(),fixture); await screenshot(`formation-${label.toLowerCase()}.png`);
    await evaluate("document.querySelector('.field-stage__svg').focus()"); await key(window,'Escape');
    await uiWait("!document.querySelector('.formation-parameters')",'field Escape cancels'); assert.deepEqual(await saved(),fixture);
  }
  pass('all five formations preview without changing saved geometry; field Escape cancels without history');
  await open('Line'); await editNumber('Length · steps',steps(200));
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Apply formation\"]').getAttribute('aria-disabled')"),'true');
  await evaluate("document.querySelector('.field-stage__svg').focus()"); await key(window,'Return');
  assert.deepEqual(await saved(),fixture); await screenshot('formation-boundary.png'); await cancel();
  await open('Line'); await editNumber('Length · steps',steps(10));
  await drag('end',{x:38,y:30});
  await uiWait(`Math.abs(Number(${numberSelector('Rotation · °')}.value)-45)<.001`,'endpoint updates rotation');
  const dragged=await shown(); near(dragged,{[ids[0]]:{x:28,y:20},[ids[1]]:{x:38,y:30}});
  // The field shows hundredths of a step; the geometry above is exact.
  assert.ok(Math.abs(Number(await evaluate(`${numberSelector('Length · steps')}.value`))-steps(Math.sqrt(200)))<=.05,"Length shows the dragged length to a tenth of a step");
  await drag('end',{x:43,y:30},true); near(await shown(),dragged); await screenshot('formation-endpoints.png'); await cancel();
  await open('Line');
  await editNumber('Length · steps',steps(Math.sqrt(200))); await editNumber('Rotation · °',45); await center(33,25); near(await shown(),dragged);
  await evaluate("document.querySelector('.field-stage__svg').focus()"); await key(window,'Return');
  await uiWait("!document.querySelector('.formation-parameters')",'field Enter applies');
  const applied=await saved(); near(applied.sets[0].positions,dragged); assert.deepEqual(applied.sets[1],fixture.sets[1]);
  for(const p of fixture.performers.slice(2)) assert.deepEqual(applied.sets[0].positions[p.id],fixture.sets[0].positions[p.id]);
  const history=await openHistory(); assert.equal(history.length,1); assert.match(history[0],/Apply line to 2 performers/); await clickSelector('.modal [aria-label="Close dialog"]');
  menuAction('Undo drill edit'); assert.deepEqual(await saved(),fixture);
  pass('native endpoints match numeric geometry; active-drag Escape restores parameters; field Enter applies once and undo restores the production');
  await open('Arc'); await editNumber('Width · steps',steps(12)); await editNumber('Bulge · steps',steps(6)); await center(33,20); await editNumber('Rotation · °',0);
  await drag('bulge',{x:33,y:29}); await uiWait(`Math.abs(Number(${numberSelector('Bulge · steps')}.value)-${steps(12)})<.001`,'arc bulge parameter');
  near(await shown(),{[ids[0]]:{x:27,y:17},[ids[1]]:{x:39,y:17}}); await cancel();
  const measurements=[];
  for(const [width,scale] of [[1366,1],[1366,1.25],[1120,1],[1120,1.25]]) {
    window.setContentSize(width,768); window.webContents.setZoomFactor(scale); await uiWait(`Math.abs(innerWidth-${width/scale})<1`,'formation layout');
    await open('Block'); await editNumber('Width · steps',steps(12)); await editNumber('Depth · steps',steps(6)); await editNumber('Columns',2);
    const clipped=await evaluate(`['Apply formation','Cancel formation'].filter(name=>{const n=document.querySelector('[aria-label="'+name+'"]');const r=n.getBoundingClientRect();return r.width===0||r.left<0||r.right>innerWidth+.5||r.top<0||r.bottom>innerHeight+.5||!n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})`);
    assert.deepEqual(clipped,[]); measurements.push({width,scale,clipped}); await screenshot(`formation-layout-${width}-${scale}.png`); await cancel();
  }
  window.webContents.setZoomFactor(1); window.setContentSize(1366,768);
  await fs.writeFile(path.join(output,'formation-layouts.json'),JSON.stringify(measurements,null,2));
  pass('arc bulge preserves the baseline; Apply/Cancel stay usable at 1366/1120 px and 100/125% UI scale');
};
