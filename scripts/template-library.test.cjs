'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { createTemplateLibraryService, readLibraryFile } = require('../electron/template-library-service.cjs');
const { serializeTemplateLibrary } = require('../electron/template-library-codec.cjs');
const empty = serializeTemplateLibrary({ format: 'squidware-template-library', version: 1, entries: [] });
const named = name => serializeTemplateLibrary({ format: 'squidware-template-library', version: 1, entries: [{ kind: 'formation', name, sourceCount: 2, coordinateFrame: 'yards-relative-center', geometry: { kind: 'parametric', shape: 'line', width: 10, height: 0, columns: 2 } }] });
async function setup(t, content) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'squidware-template-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'template-library.json');
  if (content !== undefined) await fs.writeFile(filename, content);
  const atomic = async (target, value) => { await fs.writeFile(target + '.tmp', value); await fs.rename(target + '.tmp', target); };
  return { directory, filename, atomic, service: createTemplateLibraryService(directory, atomic) };
}
test('native personal library is separate, canonical and durable across service restarts', async t => {
  const h = await setup(t); assert.equal((await h.service.read()).content, empty);
  assert.deepEqual(await fs.readdir(h.directory), []);
  await h.service.save(named('Saved shape'));
  assert.equal((await createTemplateLibraryService(h.directory, h.atomic).read()).content, named('Saved shape'));
  assert.deepEqual(await fs.readdir(h.directory), ['template-library.json']);
});
test('corrupt, oversized and newer stored libraries remain untouched and read-only', async t => {
  for (const original of ['{broken', '{"format":"squidware-template-library","version":99,"entries":[]}', 'x'.repeat(1024 * 1024 + 1)]) {
    const h = await setup(t, original), result = await h.service.read();
    assert.equal(result.readOnly, true); assert.ok(result.warning.includes('untouched'));
    await assert.rejects(h.service.save(empty), /could not be read/);
    assert.equal(await fs.readFile(h.filename, 'utf8'), original);
  }
});
test('bounded native file reading rejects directories and oversized libraries', async t => {
  const h = await setup(t, 'x'.repeat(1024 * 1024 + 1));
  await assert.rejects(readLibraryFile(h.filename), /1 MiB/); await assert.rejects(readLibraryFile(h.directory), /regular files/);
});
test('invalid writes fail before disk access; failures retain durable data and retries preserve request order', async t => {
  const h = await setup(t, named('Original')); let fail = true;
  const service = createTemplateLibraryService(h.directory, async (...args) => { if (fail) throw new Error('Disk full'); await h.atomic(...args); });
  assert.throws(() => service.save('{}'));
  await assert.rejects(service.save(empty), /Disk full/); assert.equal(await fs.readFile(h.filename, 'utf8'), named('Original'));
  fail = false;
  const first = service.save(named('First')), second = service.save(named('Second'));
  assert.equal(service.pending, true); await Promise.all([first, second]); await service.drain(); assert.equal(service.pending, false);
  assert.equal((await service.read()).content, named('Second'));
  assert.equal(await fs.readFile(h.filename, 'utf8'), named('Second'));
});
test('external library edits cannot be overwritten by a stale native session', async t => {
  const h = await setup(t, named('Original')); await h.service.read();
  await fs.writeFile(h.filename, named('External'));
  await assert.rejects(h.service.save(named('Stale')), /changed on disk/);
  assert.equal(await fs.readFile(h.filename, 'utf8'), named('External'));
});
