'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { createRecoveryStorage, LIMITS } = require('../electron/recovery-storage.cjs');
const { createRecoveryService } = require('../electron/recovery-service.cjs');
const { parseProjectV2 } = require('../electron/project-codec.cjs');
const fixture = require('node:fs').readFileSync(path.join(__dirname, '../src/fixtures/schema-v2.squid'), 'utf8');
const legacy = require('node:fs').readFileSync(path.join(__dirname, '../src/fixtures/schema-v1.squid'), 'utf8');
async function directory(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'squidware-recovery-test-'));
  t.after(async () => {
    assert.ok(folder.startsWith(os.tmpdir()) && path.basename(folder).startsWith('squidware-recovery-test-'));
    await fs.rm(folder, { recursive: true, force: true });
  });
  return folder;
}
function maximumProject() {
  const project = JSON.parse(fixture);
  project.id = randomUUID(); project.title = 'Maximum recovery production';
  project.performers = Array.from({ length: 500 }, (_, index) => ({ id: randomUUID(), label: `P${index + 1}`, name: '', sectionId: project.sections[0].id }));
  project.sets = Array.from({ length: 128 }, (_, index) => ({ id: randomUUID(), name: `Set ${index + 1}`, notes: 'n'.repeat(10000),
    positions: Object.fromEntries(project.performers.map((performer, ordinal) => [performer.id, { x: (ordinal % 25) * 3.8 + 0.123456789, y: Math.floor(ordinal / 25) * 2.5 + 0.123456789 }])) }));
  project.moves = project.sets.slice(1).map((set, index) => ({ id: randomUUID(), fromSetId: project.sets[index].id, toSetId: set.id, counts: 32, tempo: 120, transition: 'linear', paths: {} }));
  return parseProjectV2(JSON.stringify(project));
}
test('maximum UUID production exceeds 5 MB and survives worker shutdown/restart without browser storage', async t => {
  const folder = await directory(t); const project = maximumProject();
  assert.ok(Buffer.byteLength(JSON.stringify(project)) > 5 * 1024 * 1024);
  const first = createRecoveryService(folder); t.after(() => first.close());
  const opened = await first.begin();
  const result = await first.write(opened.session, 1, 4, project);
  await first.close();
  const second = createRecoveryService(folder); t.after(() => second.close());
  const restarted = await second.begin();
  assert.equal(restarted.versions[0].id, result.version.id);
  assert.deepEqual((await second.read(restarted.session, result.version.id)).project, project);
});
test('delayed sequences and expired renderer sessions cannot replace the latest copy; undo revisions can decrease', async t => {
  const service = createRecoveryService(await directory(t)); t.after(() => service.close());
  const { session } = await service.begin(); const project = JSON.parse(fixture);
  await service.write(session, 2, 5, { ...project, title: 'Newest' });
  assert.equal((await service.write(session, 1, 8, { ...project, title: 'Stale' })).status, 'stale');
  await service.write(session, 3, 1, { ...project, title: 'Undo is current' });
  const next = await service.begin();
  assert.throws(() => service.write(session, 4, 9, project), /session expired/);
  assert.equal((await service.read(next.session, next.versions[0].id)).project.title, 'Undo is current');
});
test('burst writes coalesce in the worker and the highest accepted sequence wins', async t => {
  const service = createRecoveryService(await directory(t)); t.after(() => service.close());
  const { session } = await service.begin();
  await Promise.all(Array.from({ length: 12 }, (_, index) => service.write(session, index + 1, index, { ...JSON.parse(fixture), title: `Revision ${index}` })));
  const list = await service.list(session);
  assert.equal((await service.read(session, list.versions[0].id)).project.title, 'Revision 11');
});
test('failed replacement and stale writes preserve the last durable copy and clean temporary files', async t => {
  const folder = await directory(t); const storage = createRecoveryStorage(folder); const project = JSON.parse(fixture);
  const saved = await storage.write(project, 1);
  const failed = createRecoveryStorage(folder, { fs: { ...fs, rename: async () => { throw new Error('Disk unavailable'); } } });
  await assert.rejects(failed.write({ ...project, title: 'Incomplete' }, 2), /Disk unavailable/);
  let current = true;
  const interrupted = createRecoveryStorage(folder, { fs: { ...fs, open: async (...args) => {
    const handle = await fs.open(...args);
    if (args[1] === 'wx') return { writeFile: async text => { await handle.writeFile(text); current = false; }, sync: () => handle.sync(), close: () => handle.close() };
    return handle;
  } } });
  assert.equal((await interrupted.write(project, 3, () => current)).status, 'stale');
  assert.deepEqual(await fs.readdir(folder), [`${saved.version.id}.json`]);
  assert.equal((await createRecoveryStorage(folder).list()).versions[0].id, saved.version.id);
});
test('hard interruption leaving partial temporary files cannot displace a verified version', async t => {
  const folder = await directory(t); const storage = createRecoveryStorage(folder);
  const saved = await storage.write(JSON.parse(fixture), 1);
  await fs.writeFile(path.join(folder, `.interrupted.${randomUUID()}.tmp`), '{partial');
  const corruptId = randomUUID(); await fs.writeFile(path.join(folder, `${corruptId}.json`), '{corrupt');
  const list = await createRecoveryStorage(folder).list();
  assert.equal(list.versions[0].id, saved.version.id); assert.equal(list.warnings.length, 1);
  assert.equal(await fs.readFile(path.join(folder, `${corruptId}.json`), 'utf8'), '{corrupt');
});
test('terminating a worker during a native write preserves the prior complete version after restart', async t => {
  const folder = await directory(t); const storage = createRecoveryStorage(folder);
  const saved = await storage.write(JSON.parse(fixture), 1);
  const { Worker } = require('node:worker_threads');
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const fs = require('node:fs/promises');
    const { createRecoveryStorage } = require(workerData.module);
    const storage = createRecoveryStorage(workerData.folder, { fs: { ...fs, open: async (...args) => {
      const handle = await fs.open(...args);
      if (args[1] !== 'wx') return handle;
      return { writeFile: async text => {
        await handle.writeFile(text.slice(0, 200));
        parentPort.postMessage('partial-written');
        await new Promise(() => {});
      }, sync: () => handle.sync(), close: () => handle.close() };
    } } });
    storage.write(workerData.project, 2).catch(error => parentPort.postMessage(error.message));
  `, { eval: true, workerData: { folder, project: maximumProject(), module: path.resolve(__dirname, '../electron/recovery-storage.cjs') } });
  t.after(() => worker.terminate());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Partial write was not reached.')), 10000);
    worker.once('message', message => { clearTimeout(timeout); message === 'partial-written' ? resolve() : reject(new Error(message)); });
    worker.once('error', error => { clearTimeout(timeout); reject(error); });
  });
  await worker.terminate();
  const restarted = createRecoveryService(folder); t.after(() => restarted.close());
  const reopened = await restarted.begin();
  assert.equal(reopened.versions[0].id, saved.version.id);
  assert.deepEqual((await restarted.read(reopened.session, saved.version.id)).project, JSON.parse(fixture));
});
test('legacy migration is idempotent, validates v1/v2, and preserves unreadable originals byte for byte', async t => {
  const folder = await directory(t); const storage = createRecoveryStorage(folder);
  assert.equal((await storage.migrate(legacy)).status, 'migrated');
  assert.equal((await storage.migrate(legacy)).status, 'migrated');
  assert.equal((await storage.migrate(fixture)).status, 'migrated');
  const invalid = '\uFEFF{unreadable original';
  assert.equal((await storage.migrate(invalid)).status, 'unreadable');
  const copies = (await fs.readdir(folder)).filter(name => name.startsWith('legacy-') && name.endsWith('.txt'));
  assert.ok((await Promise.all(copies.map(name => fs.readFile(path.join(folder, name), 'utf8')))).includes(invalid));
  const list = await storage.list(); assert.equal(list.versions.length, 2);
  for (const version of list.versions) assert.equal((await storage.read(version.id)).project.schemaVersion, 2);
});
test('invalid newer projects and missing/unavailable storage produce actionable failures and keep valid copies', async t => {
  const folder = await directory(t); const service = createRecoveryService(folder); t.after(() => service.close());
  const { session } = await service.begin(); const saved = await service.write(session, 1, 1, JSON.parse(fixture));
  await assert.rejects(service.write(session, 2, 2, { schemaVersion: 99 }), /Recovery unavailable.*Save a project file/);
  assert.equal((await service.list(session)).versions[0].id, saved.version.id);
  const blocked = path.join(folder, 'blocked'); await fs.writeFile(blocked, 'file');
  const unavailable = createRecoveryService(path.join(blocked, 'recovery')); t.after(() => unavailable.close());
  await assert.rejects(unavailable.begin(), /Recovery unavailable.*Save a project file/);
});
test('retention expires only oldest valid copies after a successful write and retains corrupt originals', async t => {
  const folder = await directory(t); const storage = createRecoveryStorage(folder); const corruptId = randomUUID();
  await fs.mkdir(folder, { recursive: true }); await fs.writeFile(path.join(folder, `${corruptId}.json`), 'unreadable');
  for (let revision = 1; revision <= 23; revision++) await storage.write({ ...JSON.parse(fixture), title: `Production ${revision}` }, revision);
  const list = await createRecoveryStorage(folder).list();
  assert.equal(list.versions.length, LIMITS.versions); assert.equal(list.versions[0].title, 'Production 23');
  assert.equal(list.versions.at(-1).title, 'Production 4'); assert.equal(list.warnings.length, 1);
});
test('byte retention bounds maximum-size copies and integrity failures preserve their original bytes', async t => {
  const folder = await directory(t); const storage = createRecoveryStorage(folder); const project = maximumProject();
  for (let revision = 1; revision <= 19; revision++) await storage.write(project, revision);
  const list = await storage.list();
  assert.ok(list.versions.length < LIMITS.versions);
  assert.ok(list.versions.reduce((sum, version) => sum + version.bytes, 0) <= LIMITS.bytes);
  const filename = path.join(folder, `${list.versions[0].id}.json`);
  const data = JSON.parse(await fs.readFile(filename, 'utf8')); data.content = data.content.replace('Maximum recovery production', 'Changed recovery production');
  const corrupt = JSON.stringify(data); await fs.writeFile(filename, corrupt);
  await assert.rejects(storage.read(list.versions[0].id), /integrity check/);
  assert.equal(await fs.readFile(filename, 'utf8'), corrupt);
  assert.ok((await createRecoveryStorage(folder).list()).versions.length > 0);
});
test('invalid timestamp metadata is preserved and cannot break the version chooser', async t => {
  const folder = await directory(t); const storage = createRecoveryStorage(folder);
  const saved = await storage.write(JSON.parse(fixture), 1);
  const filename = path.join(folder, `${saved.version.id}.json`);
  const data = JSON.parse(await fs.readFile(filename, 'utf8')); data.createdAt = Number.MAX_SAFE_INTEGER;
  const corrupt = JSON.stringify(data); await fs.writeFile(filename, corrupt);
  const list = await createRecoveryStorage(folder).list();
  assert.equal(list.versions.length, 0); assert.equal(list.warnings.length, 1);
  assert.equal(await fs.readFile(filename, 'utf8'), corrupt);
});
module.exports = { maximumProject };
