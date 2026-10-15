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

/** Only compositor capture is retried; behavior assertions are never rerun here. */
async function capturePage(window, output, name) {
  const [width, height] = window.getSize();
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
  } finally { window.setSize(width, height); }
}
module.exports = { pause, waitFor, key, capturePage };
