'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { defaultPreferences, validatePreferences } = require('./preferences-codec.cjs');
function createPreferencesService(directory, atomicWrite) {
  const filename = path.join(directory, 'preferences.json');
  let preserve = false; let readOnly = false; let loaded;
  let queue = Promise.resolve();
  let pending = 0;
  async function read() {
    try {
      const handle = await fs.open(filename, 'r');
      let content;
      try { const stats = await handle.stat(); if (!stats.isFile() || stats.size > 32768) throw new Error('Preferences exceed the 32 KiB limit.'); const buffer = Buffer.alloc(32769); let offset = 0; while (offset < buffer.length) { const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset); if (!bytesRead) break; offset += bytesRead; } if (offset > 32768) throw new Error('Preferences exceed the 32 KiB limit.'); content = buffer.subarray(0, offset).toString('utf8'); }
      finally { await handle.close(); }
      const parsed = JSON.parse(content);
      const preferences = validatePreferences(parsed);
      preserve = parsed.version !== 1;
      return { preferences, ...(preserve ? { warning: 'Older preferences were upgraded with defaults. The original is preserved before saving.' } : {}) };
    } catch (error) {
      if (error.code === 'ENOENT') return { preferences: defaultPreferences() };
      preserve = true;
      readOnly = /newer|unsupported/.test(error.message);
      return { preferences: defaultPreferences(), warning: `${error.message} The original preferences are preserved.`, readOnly };
    }
  }
  const initialize = () => loaded ||= read();
  function write(value, reset = false) {
    const preferences = validatePreferences(value);
    pending++;
    const request = queue.then(async () => {
      await initialize();
      if (readOnly && !reset) throw new Error('Update Squidware or reset the newer preferences before saving changes.');
      await fs.mkdir(directory, { recursive: true });
      if (preserve || reset) {
        await fs.copyFile(filename, path.join(directory, `preferences-preserved-${Date.now()}-${randomUUID()}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
      await atomicWrite(filename, `${JSON.stringify(preferences, null, 2)}\n`);
      preserve = false; readOnly = false; loaded = Promise.resolve({ preferences });
      return preferences;
    });
    queue = request.finally(() => { pending--; }).catch(() => {});
    return request;
  }
  return { read: initialize, save: value => write(value), reset: () => write(defaultPreferences(), true), drain: () => queue, get pending() { return pending > 0; } };
}
module.exports = { createPreferencesService };
