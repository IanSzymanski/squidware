'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = async function checkCanvas({window,evaluate,command,dispatch,state,editor,fixture,output,wait}) {
  const {settleNativeViewport} = require('./renderer.cjs');
  const checks=[], metrics=[]; const pass=label=>{checks.push(label);console.log('PASS '+fixture.name+': '+label);};
  const frames=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const canvasReady="document.querySelector('[data-field-canvas]')?.style.visibility==='visible' && document.querySelector('.field-drawing')?.getAttribute('opacity')==='0'";
  const capture=async name=>{await settleNativeViewport(window); await frames(); const result=await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true}); await fs.writeFile(path.join(output,`${fixture.name}-${name}.png`),result.toPNG());return result;};
  await dispatch('set.select',{index:0});
  const revision=await evaluate(state+'.project.revision');
  await dispatch('playback.scrub',{count:4.25}); await wait(canvasReady,'canvas paints fractional sample');
  await evaluate("window.__canvasButton=document.querySelector('.field-performer'); window.__canvasElement=document.querySelector('[data-field-canvas]')");
  for(const dpr of [1,2]) {
    await command('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:dpr,mobile:false});
    for(const orientation of ['audience-bottom','audience-top']) for(const zoom of [.6,1,3]) {
      await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,fieldOrientation:${JSON.stringify(orientation)}}); ${editor}.setValue('ui','zoom',${zoom})`);
      await frames(); await wait(canvasReady,'canvas after view change');
      const sample=await evaluate(`(()=>{
        const canvas=document.querySelector('[data-field-canvas]'), box=canvas.getBoundingClientRect(), svg=document.querySelector('.field-stage__svg');
        const matrix=document.querySelector('[data-field-geometry]').getScreenCTM();
        const expected=${JSON.stringify(fixture.sample)};
        let errors=0; for(const [id,point] of Object.entries(expected)) {const node=[...document.querySelectorAll('.field-performer')].find(n=>n.dataset.performerId===id); const [x,y]=node.getAttribute('transform').slice(10,-1).split(' ').map(Number); if(Math.abs(x-point.x)>1e-8||Math.abs(y-point.y)>1e-8)errors++;}
        const ids=[...document.querySelectorAll('.field-performer')].map(n=>n.dataset.performerId).reverse();
        const id=ids.find(id=>{const p=new DOMPoint(expected[id].x,expected[id].y).matrixTransform(matrix); return p.x>box.left+12&&p.x<box.right-12&&p.y>box.top+12&&p.y<box.bottom-12;});
        if(!id)throw new Error('No visible sample');
        const p=new DOMPoint(expected[id].x,expected[id].y).matrixTransform(matrix);
        const x=(p.x-box.left)*canvas.width/box.width,y=(p.y-box.top)*canvas.height/box.height;
        const pixel=[...canvas.getContext('2d').getImageData(Math.floor(x),Math.floor(y),1,1).data];
        const person=${state}.project.present.performers.find(p=>p.id===id), color=${state}.project.present.sections.find(s=>s.id===person.sectionId).color;
        return {id,pixel,color,errors,width:canvas.width,height:canvas.height,cssWidth:box.width,cssHeight:box.height,dpr:devicePixelRatio,tabStops:svg.querySelectorAll('.field-performer[tabindex="0"]').length,retained:window.__canvasButton===document.querySelector('.field-performer')};
      })()`);
      assert.equal(sample.errors,0,'engine/SVG sample parity'); assert.equal(sample.tabStops,1); assert.equal(sample.retained,true);
      assert.ok(Math.abs(sample.width-Math.ceil(sample.cssWidth*dpr))<=1,JSON.stringify(sample)); assert.ok(Math.abs(sample.height-Math.ceil(sample.cssHeight*dpr))<=1);
      assert.ok(sample.pixel[3]>200,'opaque dot at canonical position');
      const rgb=sample.color.slice(1).match(/../g).map(s=>parseInt(s,16));
      assert.ok(rgb.every((v,i)=>Math.abs(v-sample.pixel[i])<65),JSON.stringify(sample)); metrics.push({dpr,orientation,zoom,...sample});
    }
  }
  await evaluate('new Promise(resolve=>setTimeout(resolve,400))');
  await evaluate("window.__idleContext=document.querySelector('[data-field-canvas]').getContext('2d'); window.__idleClear=window.__idleContext.clearRect; window.__idleDraws=0; window.__idleContext.clearRect=function(...args){window.__idleDraws++;return window.__idleClear.apply(this,args)}; true");
  await evaluate('new Promise(resolve=>setTimeout(resolve,400))');
  assert.equal(await evaluate('window.__idleDraws'),0,'paused canvas has no animation loop');
  await evaluate('window.__idleContext.clearRect=window.__idleClear; true');
  pass('paused canvas performs no redraws after settling');
  pass('canvas pixels and all performer transforms match engine samples at DPR 1/2, both orientations and zoom 0.6/1/3; one retained field Tab stop');
  await command('Emulation.clearDeviceMetricsOverride');
  await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,fieldOrientation:'audience-bottom'}); ${editor}.setValue('ui','zoom',1); ${editor}.setValue('selection','selectedIds',[${JSON.stringify(fixture.project.performers[0].id)}])`);
  await frames();
  // The SVG buttons keep focus while the pixels and their coordinates advance.
  await evaluate("window.__canvasButton.focus()");
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await frames();
  const focused=await evaluate('document.activeElement.getAttribute("data-performer-id")'); assert.ok(focused);
  const aria=await evaluate('document.activeElement.getAttribute("aria-label")');
  await dispatch('playback.scrub',{count:28.25}); await frames();
  assert.equal(await evaluate('document.activeElement.getAttribute("data-performer-id")'),focused);
  assert.notEqual(await evaluate('document.activeElement.getAttribute("aria-label")'),aria);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}); await frames();
  assert.deepEqual(await evaluate(state+'.selection.selectedIds'),[focused]);
  pass('native arrows focus, Enter selects, and focused coordinates update while scrubbing without replacing buttons');
  await dispatch('playback.scrub',{count:4.25}); await frames();
  await evaluate('document.activeElement.blur()'); await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0}); await frames();
  const canvasImage=await capture('canvas');
  await evaluate("document.querySelector('[data-field-canvas]').dispatchEvent(new Event('contextlost'))");
  await wait("document.querySelector('.field-drawing').getAttribute('opacity')==='1'",'SVG context-loss fallback');
  const svgImage=await capture('svg-fallback');
  const a=canvasImage.toBitmap(), b=svgImage.toBitmap(); assert.equal(a.length,b.length);
  let different=0; for(let i=0;i<a.length;i+=4) if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>70) different++;
  const fraction=different/(a.length/4); assert.ok(fraction<.035,`canvas/vector pixel mismatch ${fraction}`); metrics.push({canvasSvgPixelDifferenceFraction:fraction});
  await evaluate("document.querySelector('[data-field-canvas]').dispatchEvent(new Event('contextrestored'))"); await wait(canvasReady,'restored context repaints');
  // Deny only the dynamic surface; label measurement and other app canvases remain available.
  await evaluate("window.__nativeGetContext=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(...args){return this.dataset.fieldCanvas?null:window.__nativeGetContext.apply(this,args)}; document.querySelector('[data-field-canvas]').dispatchEvent(new Event('contextrestored'))");
  await wait("document.querySelector('.field-drawing').getAttribute('opacity')==='1'",'unavailable canvas fallback');
  await dispatch('playback.scrub',{count:7.25}); await frames();
  assert.equal(await evaluate('window.__canvasButton===document.querySelector(".field-performer")'),true);
  await evaluate("HTMLCanvasElement.prototype.getContext=window.__nativeGetContext; document.querySelector('[data-field-canvas]').dispatchEvent(new Event('contextrestored'))"); await wait(canvasReady,'available canvas restored');
  pass('representative pixels match the SVG fallback; lost/unavailable contexts preserve buttons and recover automatically');
  const context=await evaluate("window.__failContext=document.querySelector('[data-field-canvas]').getContext('2d'); window.__nativeClear=window.__failContext.clearRect; window.__failContext.clearRect=()=>{throw new Error('injected allocation/draw failure')}; true"); assert.equal(context,true);
  await dispatch('playback.scrub',{count:8.25}); await wait("document.querySelector('.field-drawing').getAttribute('opacity')==='1'",'draw-error fallback');
  await evaluate("window.__failContext.clearRect=window.__nativeClear; document.querySelector('[data-field-canvas]').dispatchEvent(new Event('contextrestored'))"); await wait(canvasReady,'draw-error recovery');
  pass('drawing failure returns to current vector geometry without a renderer error');
  for(const theme of ['dark','light','high-contrast']) {
    await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,theme:${JSON.stringify(theme)}})`); await frames();
    await capture(theme);
  }
  window.setContentSize(1000,700);
  await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,uiScale:1.25})`); await frames(); await capture('narrow-125');
  window.setContentSize(1366,768); await settleNativeViewport(window); await evaluate(`${editor}.setValue('preferences','value',{...${state}.preferences.value,uiScale:1,theme:'dark'})`);
  await dispatch('set.select',{index:0}); await frames();
  const height=await evaluate("document.querySelector('.field-container').getBoundingClientRect().height"); assert.ok(height>=470,`field height ${height}`);metrics.push({fieldHeight:height});
  assert.equal(await evaluate(state+'.project.revision'),revision);
  pass('themes, 125% narrow layout and view changes preserve coordinates/history and at least 470px laptop field height');
  const parity=async label=>{
    await wait(canvasReady,label+' canvas'); await evaluate('document.activeElement.blur()'); await frames();
    const before=(await capture(label+'-canvas')).toBitmap();
    await evaluate("document.querySelector('[data-field-canvas]').dispatchEvent(new Event('contextlost'))"); await wait("document.querySelector('.field-drawing').getAttribute('opacity')==='1'",label+' fallback');
    const after=(await capture(label+'-vector')).toBitmap();assert.equal(before.length,after.length);
    let different=0;for(let i=0;i<before.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(before[i+k]-after[i+k])))>70)different++;
    const fraction=different/(before.length/4);assert.ok(fraction<.01,`${label} canvas/vector mismatch ${fraction}`);metrics.push({label,pixelDifferenceFraction:fraction});
    await evaluate("document.querySelector('[data-field-canvas]').dispatchEvent(new Event('contextrestored'))");await wait(canvasReady,label+' restored');
  };
  await dispatch('set.select',{index:1});await evaluate(`${editor}.setValue('selection','selectedIds',[]); ${editor}.setValue('ui','showPaths',true); ${editor}.setValue('ui','showNextPaths',true)`);
  await wait("document.querySelectorAll('[data-neighbor-path]').length>0",'neighbor paths');await frames();await parity('neighbor-paths');
  await evaluate(`${editor}.setValue('ui','showPaths',false); ${editor}.setValue('ui','showNextPaths',false)`);
  await dispatch('set.select',{index:0});await evaluate(`${editor}.setValue('selection','selectedIds',[${JSON.stringify(fixture.project.performers[0].id)}])`);
  await dispatch('selection.preview',{spec:{kind:'rank',anchorId:fixture.project.performers[0].id,tolerance:.2}});
  await wait("document.querySelectorAll('[data-selection-candidate]').length>0",'selection candidates');await frames();await parity('selection-preview');await dispatch('selection.cancel');
  pass('canvas neighboring paths/arrowheads and selection candidates match vector pixels; cancel preserves the edit');
  await dispatch('set.select',{index:0});
  await evaluate(`${editor}.setValue('selection','selectedIds',${JSON.stringify(fixture.project.performers.map(p=>p.id))}); ${editor}.setValue('ui','snap',false)`);await frames();
  const point=await evaluate("(()=>{const n=[...document.querySelectorAll('.field-performer')].at(-1), p=new DOMPoint(0,0).matrixTransform(n.getScreenCTM());return{x:p.x,y:p.y}})()");
  const mouse=(type,x,y)=>command('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:type==='mouseMoved'?0:1});
  const originalTransforms=await evaluate("[...document.querySelectorAll('.field-performer')].map(n=>n.getAttribute('transform'))");
  await mouse('mousePressed',point.x,point.y);await mouse('mouseMoved',point.x+30,point.y+15);await wait("!!document.querySelector('[data-snap-preview]')",'drag preview');await wait(canvasReady,'drag canvas');
  assert.notDeepEqual(await evaluate("[...document.querySelectorAll('.field-performer')].map(n=>n.getAttribute('transform'))"),originalTransforms);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await mouse('mouseReleased',point.x+30,point.y+15);await frames();
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.field-performer')].map(n=>n.getAttribute('transform'))"),originalTransforms);assert.equal(await evaluate(state+'.project.revision'),revision);
  const history=await evaluate(state+'.project.past.length');
  await mouse('mousePressed',point.x,point.y);await mouse('mouseMoved',point.x+25,point.y+10);await wait("!!document.querySelector('[data-snap-preview]')",'second drag preview');await mouse('mouseReleased',point.x+25,point.y+10);await frames();
  assert.equal(await evaluate(state+'.project.past.length'),history+1);await dispatch('history.undo');await frames();
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.field-performer')].map(n=>n.getAttribute('transform'))"),originalTransforms);
  pass('native full-roster drag uses canvas; Escape restores every vector transform, release commits once and Undo restores the same geometry');
  return {checks,metrics};
};
