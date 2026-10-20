'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Wait for an observable state, with a deadline even if a renderer probe hangs. */
async function waitFor(condition, label, { timeoutMs = 20000, intervalMs = 20, failure = () => null } = {}) {
  let stopped = false;
  let timer;
  const deadline = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), timeoutMs); });
  try {
    await Promise.race([deadline, (async () => {
      while (!stopped) {
        const error = failure(); if (error) throw error;
        if (await condition()) return;
        await pause(intervalMs);
      }
    })()]);
  } finally { stopped = true; clearTimeout(timer); }
}

async function key(window, keyCode, modifiers = [], settleMs = 5) {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  if (keyCode === 'Return' || keyCode === 'Space') window.webContents.sendInputEvent({ type: 'char', keyCode: keyCode === 'Return' ? '\r' : ' ', modifiers });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  await pause(settleMs);
}

/** Native typeahead avoids OS select popups and platform-specific Home/End keys. */
async function selectNativeOption(window, selector, value, { timeoutMs = 15000 } = {}) {
  const query = JSON.stringify(selector);
  const choice = await window.webContents.executeJavaScript(`(() => {
    const control = document.querySelector(${query});
    if (!control || control.tagName !== 'SELECT' || control.disabled) throw new Error('Unavailable native select: ' + ${query});
    const options = [...control.options].filter(option => !option.disabled);
    const target = options.find(option => option.value === ${JSON.stringify(String(value))});
    if (!target) throw new Error('Missing native option: ' + ${JSON.stringify(String(value))});
    const label = target.label.trim();
    let prefix = '';
    for (const character of label) {
      prefix += character;
      if (options.filter(option => option.label.trim().toLowerCase().startsWith(prefix.toLowerCase())).length === 1) {
        control.focus();
        return { prefix, label };
      }
    }
    throw new Error('Ambiguous native option label: ' + label);
  })()`);
  for (const character of choice.prefix) {
    for (const type of ['keyDown', 'char', 'keyUp']) window.webContents.sendInputEvent({ type, keyCode: character });
  }
  try {
    await waitFor(() => window.webContents.executeJavaScript(`document.querySelector(${query})?.value === ${JSON.stringify(String(value))}`), `native option ${choice.label} in ${selector}`, { timeoutMs });
  } catch (error) {
    const observed = await window.webContents.executeJavaScript(`({ value: document.querySelector(${query})?.value, focused: document.activeElement?.outerHTML })`).catch(() => null);
    throw new Error(`${error.message}; observed ${JSON.stringify(observed)}`, { cause: error });
  }
}

const viewportExpression = '({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})';
async function waitViewport(window, expected, label = 'restored viewport', { timeoutMs = 20000 } = {}) {
  let observed;
  const matches = value => value.width === expected.width && value.height === expected.height && (expected.dpr === undefined || value.dpr === expected.dpr);
  try {
    await waitFor(async () => {
      // The browser's resize acknowledgement can precede renderer layout.
      observed = await window.webContents.executeJavaScript(viewportExpression);
      if (!matches(observed)) return false;
      // Give ResizeObserver/React two frames after the target is observed,
      // rather than spending those frames while the old viewport is present.
      observed = await window.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(${viewportExpression}))))`);
      return matches(observed);
    }, label, { timeoutMs });
  } catch (error) {
    throw new Error(`${error.message}; expected ${JSON.stringify(expected)}, observed ${JSON.stringify(observed ?? null)}`, { cause: error });
  }
}

/** Await native content/zoom propagation before deriving or asserting geometry. */
async function settleNativeViewport(window, label = 'native viewport', options = {}) {
  const [contentWidth, contentHeight] = window.getContentSize();
  const zoom = window.webContents.getZoomFactor();
  await waitViewport(window, { width: Math.round(contentWidth / zoom), height: Math.round(contentHeight / zoom) }, label, options);
}

/** Only compositor capture is retried; behavior assertions are never rerun here. */
async function capturePage(window, output, name, { timeoutMs = 20000 } = {}) {
  // A caller may have just resized or zoomed. The old renderer viewport is not
  // a restoration target: derive CSS dimensions from the native content size.
  await settleNativeViewport(window, `viewport settled before ${name}`, { timeoutMs });
  const [width, height] = window.getSize();
  const viewport = await window.webContents.executeJavaScript(viewportExpression);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      window.setSize(width + 1 + attempt % 2, height); await pause(150);
      try {
        const screenshot = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
        if (screenshot.isEmpty()) throw new Error('Empty compositor surface');
        await fs.writeFile(path.join(output, name), screenshot.toPNG()); return;
      } catch (error) {
        if (attempt === 2) throw error;
        console.warn(`Capture retry ${attempt + 1} for ${name}: ${error.message}`);
      }
    }
  } finally {
    window.setSize(width, height);
    await waitViewport(window, viewport, `viewport restored after ${name}`, { timeoutMs });
  }
}
module.exports = { pause, waitFor, key, selectNativeOption, capturePage, waitViewport, settleNativeViewport };
