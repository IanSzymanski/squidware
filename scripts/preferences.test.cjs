'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs/promises'); const path = require('node:path'); const os = require('node:os');
const { createPreferencesService } = require('../electron/preferences-service.cjs');
const { defaultPreferences } = require('../electron/preferences-codec.cjs');
async function setup(t, initial) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'squidware-preferences-'));
  t.after(async () => { const relative = path.relative(os.tmpdir(), directory); assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative)); await fs.rm(directory, { recursive: true, force: true }); });
  const filename = path.join(directory, 'preferences.json'); if (initial !== undefined) await fs.writeFile(filename, initial);
  const atomic = async (target, content) => { const temporary = target + '.test-tmp'; await fs.writeFile(temporary, content); await fs.rename(temporary, target); };
  return { directory, filename, atomic, service: createPreferencesService(directory, atomic) };
}
test('missing preferences get defaults; canonical settings survive a fresh service', async t => {
  const h = await setup(t); assert.deepEqual((await h.service.read()).preferences, defaultPreferences());
  const preferences = { ...defaultPreferences(), panelLayout: 'compact', paperSize: 'a4', zoom: 2, newSetCounts: 24, transient: { x: 10 } };
  await h.service.save(preferences);
  assert.deepEqual((await createPreferencesService(h.directory, h.atomic).read()).preferences, { ...defaultPreferences(), panelLayout: 'compact', paperSize: 'a4', zoom: 2, newSetCounts: 24 });
  assert.deepEqual(await fs.readdir(h.directory), ['preferences.json']);
});
test('editing increments persist across native services and invalid increments cannot replace them', async t => {
  const h = await setup(t);
  const chosen = { ...defaultPreferences(), nudgeUnit: 'steps', nudgeStep: 1, fastNudgeStep: 4, rotationStep: 30, scaleStep: 25 };
  await h.service.save(chosen);
  const restarted = createPreferencesService(h.directory, h.atomic);
  assert.deepEqual((await restarted.read()).preferences, chosen);
  const original = await fs.readFile(h.filename, 'utf8');
  assert.throws(() => restarted.save({ ...chosen, scaleStep: 100 }), /scaleStep/);
  assert.equal(await fs.readFile(h.filename, 'utf8'), original);
});
test('older and corrupt files recover defaults and preserve exact originals on first write', async t => {
  for (const original of ['{"version":0,"zoom":2}', '{broken', 'x'.repeat(32769), '{"zoom":-10}']) {
    const h = await setup(t, original); const read = await h.service.read(); assert.ok(read.warning);
    assert.equal(read.preferences.zoom, original.includes('"version":0') ? 2 : 1);
    await h.service.save({ ...read.preferences, paperSize: 'a4' });
    const preserved = (await fs.readdir(h.directory)).filter(name => name.startsWith('preferences-preserved-')); assert.equal(preserved.length, 1);
    assert.equal(await fs.readFile(path.join(h.directory, preserved[0]), 'utf8'), original);
    assert.equal(JSON.parse(await fs.readFile(h.filename, 'utf8')).version, 1);
  }
});

test('decimal-only v1 preferences retain their output mode after a native service restart', async t => {
  for (const coordinateDecimals of [0, 1, 2]) {
    const original = { ...defaultPreferences(), coordinateDecimals }; delete original.coordinatePrecision;
    const h = await setup(t, JSON.stringify(original)); const read = await h.service.read();
    assert.equal(read.preferences.coordinatePrecision, 'decimal'); assert.equal(read.preferences.coordinateDecimals, coordinateDecimals);
    await h.service.save(read.preferences);
    const restarted = (await createPreferencesService(h.directory, h.atomic).read()).preferences;
    assert.equal(restarted.coordinatePrecision, 'decimal'); assert.equal(restarted.coordinateDecimals, coordinateDecimals);
  }
});
test('newer versions remain untouched until reset, which preserves the original', async t => {
  const original = '{"version":99,"future":{"value":2}}'; const h = await setup(t, original);
  assert.equal((await h.service.read()).readOnly, true);
  await assert.rejects(h.service.save(defaultPreferences()), /newer/); assert.equal(await fs.readFile(h.filename, 'utf8'), original);
  assert.deepEqual(await h.service.reset(), defaultPreferences()); await h.service.save({ ...defaultPreferences(), zoom: 2 });
  const preserved = (await fs.readdir(h.directory)).find(name => name.startsWith('preferences-preserved-')); assert.equal(await fs.readFile(path.join(h.directory, preserved), 'utf8'), original);
});
test('failed storage preserves data and subsequent writes retry in request order', async t => {
  const h = await setup(t, JSON.stringify({ ...defaultPreferences(), zoom: 2 })); let fail = true;
  const service = createPreferencesService(h.directory, async (target, content) => { if (fail) throw new Error('Disk full'); await h.atomic(target, content); });
  await assert.rejects(service.save(defaultPreferences()), /Disk full/); assert.equal(JSON.parse(await fs.readFile(h.filename, 'utf8')).zoom, 2);
  fail = false; await Promise.all([service.save({ ...defaultPreferences(), zoom: 1.5 }), service.reset(), service.save({ ...defaultPreferences(), zoom: 3 })]);
  assert.equal((await createPreferencesService(h.directory, h.atomic).read()).preferences.zoom, 3);
  assert.throws(() => service.save({ ...defaultPreferences(), zoom: NaN }), /zoom/);
});

