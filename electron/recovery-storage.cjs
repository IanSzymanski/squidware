'use strict';
const defaultFs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { parseProjectV2, serializeProjectV2 } = require('./project-codec.cjs');
const LIMITS = Object.freeze({ versions: 20, bytes: 100 * 1024 * 1024, fileBytes: 21 * 1024 * 1024 });
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = text => createHash('sha256').update(text).digest('hex');

// This module runs in a worker. Only the main process supplies the directory.
function createRecoveryStorage(directory, { fs = defaultFs } = {}) {
  let catalog;
  let warnings = [];
  async function atomic(filename, text, stillCurrent = () => true) {
    const temporary = path.join(directory, `.${path.basename(filename)}.${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(text); await handle.sync(); await handle.close(); handle = null;
      if (!stillCurrent()) { await fs.unlink(temporary); return false; }
      await fs.rename(temporary, filename);
      return true;
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await fs.unlink(temporary).catch(() => {});
      throw error;
    }
  }
  async function read(id) {
    if (typeof id !== 'string' || !ID.test(id)) throw new Error('Choose a recovery copy from the list.');
    const filename = path.join(directory, `${id}.json`);
    const handle = await fs.open(filename, 'r');
    let text;
    try {
      if ((await handle.stat()).size > LIMITS.fileBytes) throw new Error('Recovery copy exceeds the supported size.');
      const buffer = Buffer.alloc(LIMITS.fileBytes + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset > LIMITS.fileBytes) throw new Error('Recovery copy exceeds the supported size.');
      text = buffer.subarray(0, offset).toString('utf8');
    } finally { await handle.close(); }
    const data = JSON.parse(text);
    if (data.format !== 1 || data.id !== id || !Number.isSafeInteger(data.createdAt)
        || data.createdAt < 0 || data.createdAt > 8640000000000000
        || !Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.content !== 'string'
        || hash(data.content) !== data.sha256 || !['automatic', 'legacy'].includes(data.source)) {
      throw new Error('Recovery copy failed its integrity check. The original has been preserved.');
    }
    const project = parseProjectV2(data.content);
    const version = { id, createdAt: data.createdAt, revision: data.revision, source: data.source,
      projectId: project.id, title: project.title, performers: project.performers.length,
      sets: project.sets.length, bytes: Buffer.byteLength(text), legacyHash: data.legacyHash };
    return { project, version };
  }
  async function list(refresh = false) {
    await fs.mkdir(directory, { recursive: true });
    if (!catalog || refresh) {
      catalog = []; warnings = [];
      const filenames = (await fs.readdir(directory)).filter(name => ID.test(name.slice(0, -5)) && name.endsWith('.json'));
      if (filenames.length > 100) throw new Error('Too many recovery files. Save a project file and check the application recovery folder.');
      for (const filename of filenames) {
        try { catalog.push((await read(filename.slice(0, -5))).version); }
        catch (error) { warnings.push(`A recovery copy could not be opened; its original is preserved. ${error.message}`); }
      }
      catalog.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    }
    return { versions: catalog.map(({ legacyHash, ...version }) => version), warnings: [...warnings], limits: LIMITS };
  }
  async function write(project, revision, stillCurrent = () => true, legacyHash) {
    await list();
    // Validation and serialization are deliberately outside the renderer/main thread.
    const content = serializeProjectV2(project);
    if (!stillCurrent()) return { status: 'stale' };
    const id = randomUUID();
    const createdAt = Math.max(Date.now(), (catalog[0]?.createdAt || 0) + 1);
    if (createdAt > 8640000000000000) throw new Error('A recovery timestamp is outside the supported range. Save a project file and check the recovery folder.');
    const data = { format: 1, id, createdAt, revision, source: legacyHash ? 'legacy' : 'automatic', legacyHash,
      sha256: hash(content), content };
    const text = JSON.stringify(data) + '\n';
    if (!await atomic(path.join(directory, `${id}.json`), text, stillCurrent)) return { status: 'stale' };
    const version = { id, createdAt, revision, source: data.source, projectId: project.id, title: project.title,
      performers: project.performers.length, sets: project.sets.length, bytes: Buffer.byteLength(text), legacyHash };
    catalog.unshift(version);
    let bytes = catalog.reduce((sum, item) => sum + item.bytes, 0);
    while (catalog.length > 1 && (catalog.length > LIMITS.versions || bytes > LIMITS.bytes)) {
      const oldest = catalog.at(-1);
      // Delete only known valid versions, after the new copy is durable. Unreadable originals stay untouched.
      try { await fs.unlink(path.join(directory, `${oldest.id}.json`)); }
      catch (error) { if (error.code !== 'ENOENT') { warnings.push('Some older copies could not be removed. Check available disk space.'); break; } }
      bytes -= oldest.bytes; catalog.pop();
    }
    return { status: 'saved', version: { ...version, legacyHash: undefined } };
  }
  async function migrate(content) {
    if (typeof content !== 'string' || Buffer.byteLength(content) > 10 * 1024 * 1024) {
      throw new Error('Legacy recovery must be text no larger than 10 MB. Its browser original was kept.');
    }
    await list();
    const digest = hash(content);
    const original = path.join(directory, `legacy-${digest}.txt`);
    // Preserve byte-for-byte even when the source is malformed or from a future version.
    await fs.access(original).catch(async error => {
      if (error.code !== 'ENOENT') throw error;
      await atomic(original, content);
    });
    let project;
    try { project = parseProjectV2(content); }
    catch (error) { return { status: 'unreadable', warning: `Legacy recovery was preserved in the application recovery folder. ${error.message}` }; }
    const marker = path.join(directory, `legacy-${digest}.migrated`);
    try { await fs.access(marker); return { status: 'migrated' }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!catalog.some(version => version.legacyHash === digest)) await write(project, 0, () => true, digest);
    await atomic(marker, 'Migrated successfully\n');
    return { status: 'migrated' };
  }
  return { list, read, write, migrate };
}
module.exports = { createRecoveryStorage, LIMITS, ID };
