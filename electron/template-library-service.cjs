'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseTemplateLibrary, serializeTemplateLibrary, TEMPLATE_LIMITS } = require('./template-library-codec.cjs');
const empty = () => serializeTemplateLibrary({ format: 'squidware-template-library', version: 1, entries: [] });

async function readLibraryFile(filename) {
  const { O_RDONLY, O_NONBLOCK } = require('node:fs').constants;
  const handle = await fs.open(filename, O_RDONLY | O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > TEMPLATE_LIMITS.bytes) throw new Error('Template libraries must be regular files up to 1 MiB.');
    const buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > stat.size) throw new Error('The library changed while reading. Try again.');
    return buffer.subarray(0, offset).toString('utf8');
  } finally { await handle.close(); }
}

function createTemplateLibraryService(directory, atomicWrite) {
  const filename = path.join(directory, 'template-library.json');
  let loaded, expected = null, readOnly = false, queue = Promise.resolve(), pending = 0;
  const current = async () => { try { return await readLibraryFile(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
  const initialize = () => loaded ||= (async () => {
    try {
      expected = await current();
      return { content: expected === null ? empty() : serializeTemplateLibrary(parseTemplateLibrary(expected)) };
    } catch (error) {
      readOnly = true;
      return { content: empty(), readOnly: true,
        warning: `${error.message} The original personal library is untouched. Restore a supported template-library.json or update Squidware, then restart.` };
    }
  })();
  function save(content) {
    const canonical = serializeTemplateLibrary(parseTemplateLibrary(content));
    pending++;
    const request = queue.then(async () => {
      await initialize();
      if (readOnly) throw new Error('The personal library could not be read. Restore it or update Squidware before saving.');
      if (await current() !== expected) throw new Error('The personal library changed on disk. Restart before saving to avoid replacing those changes.');
      await fs.mkdir(directory, { recursive: true });
      await atomicWrite(filename, canonical);
      expected = canonical;
      loaded = Promise.resolve({ content: canonical });
    });
    queue = request.finally(() => { pending--; }).catch(() => {});
    return request;
  }
  return { read: initialize, save, drain: () => queue, get pending() { return pending > 0; } };
}
module.exports = { createTemplateLibraryService, readLibraryFile };
