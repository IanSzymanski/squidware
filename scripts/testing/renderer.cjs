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

/** A serial backlog can exceed one operation's deadline while making progress.
 * Keep an idle deadline and an absolute cap; never retry the work itself. */
async function waitForProgress(probe, label, { idleTimeoutMs = 30000, timeoutMs = 120000, ...options } = {}) {
  let progress = -1, advancedAt = Date.now();
  await waitFor(async () => {
    const state = await probe();
    if (state.error) throw new Error(`${label}: ${state.error}`);
    if (state.progress > progress) { progress = state.progress; advancedAt = Date.now(); }
    if (state.done) return true;
    if (Date.now() - advancedAt >= idleTimeoutMs) throw new Error(`Timed out: ${label} · no progress beyond ${progress}`);
    return false;
  }, label, { ...options, timeoutMs });
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
        // Starting a second typeahead on the same focused select otherwise appends
        // to Chromium’s previous search prefix. A real blur/focus starts a new session.
        control.blur();
        control.focus();
        const probe = { released: 0, keys: [...prefix].map(key => key.toLowerCase()) };
        // Earlier input (for example Return after typing a name) can release
        // after this listener attaches. Count only this sequence, in order.
        probe.listener = event => {
          if (event.key?.toLowerCase() === probe.keys[probe.released]) probe.released++;
        };
        control.__squidwareSelectProbe = probe;
        control.addEventListener('keyup', probe.listener, true);
        return { prefix, label };
      }
    }
    throw new Error('Ambiguous native option label: ' + label);
  })()`);
  try {
    for (const character of choice.prefix) {
      for (const type of ['keyDown', 'char', 'keyUp']) window.webContents.sendInputEvent({ type, keyCode: character });
    }
    // The value can already match, or match an early ambiguous prefix. Do not
    // let queued typeahead characters spill into the next focused input.
    await waitFor(() => window.webContents.executeJavaScript(`(() => {
      const control = document.querySelector(${query});
      return control?.__squidwareSelectProbe?.released === ${choice.prefix.length} && control.value === ${JSON.stringify(String(value))};
    })()`), `native option ${choice.label} in ${selector}`, { timeoutMs });
  } catch (error) {
    const observed = await window.webContents.executeJavaScript(`({ value: document.querySelector(${query})?.value, focused: document.activeElement?.outerHTML, probe: document.querySelector(${query})?.__squidwareSelectProbe && {released: document.querySelector(${query}).__squidwareSelectProbe.released, keys: document.querySelector(${query}).__squidwareSelectProbe.keys} })`).catch(() => null);
    throw new Error(`${error.message}; observed ${JSON.stringify(observed)}`, { cause: error });
  } finally {
    await window.webContents.executeJavaScript(`(() => {
      const control = document.querySelector(${query}), probe = control?.__squidwareSelectProbe;
      if (probe) { control.removeEventListener('keyup', probe.listener, true); delete control.__squidwareSelectProbe; }
    })()`).catch(() => {});
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
  const [width, height] = window.getContentSize();
  const viewport = await window.webContents.executeJavaScript(viewportExpression);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) {
        window.setContentSize(width + 1, height); await pause(150);
        window.setContentSize(width, height);
        await waitViewport(window, viewport, `viewport settled for retry of ${name}`, { timeoutMs });
      }
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
    // A successful capture normally leaves the client size untouched. Avoid
    // reapplying identical bounds: macOS can constrain even a no-op resize by
    // another two pixels on a window at the display's visible-frame limit.
    const current = window.getContentSize();
    if (current[0] !== width || current[1] !== height) window.setContentSize(width, height);
    await waitViewport(window, viewport, `viewport restored after ${name}`, { timeoutMs });
  }
}
module.exports = { pause, waitFor, waitForProgress, key, selectNativeOption, capturePage, waitViewport, settleNativeViewport };
