import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePlan, implementationOrder, releaseReady } from './release-plan.mjs';
import { versionedPackage } from './release-version.mjs';
const plan = JSON.parse(await readFile(new URL('../release-plan.json', import.meta.url), 'utf8'));
test('release membership is unique, increasing and respects dependency order', () => { assert.equal(validatePlan(plan).size, 97); });
test('future releases cannot depend on an earlier issue assigned to a later release', () => { const invalid = structuredClone(plan); invalid.dependencies[5] = [90]; assert.throws(() => validatePlan(invalid), /later-release/); });
test('cycles are rejected even within one release', () => { const invalid = structuredClone(plan); invalid.dependencies[5] = [6]; assert.throws(() => validatePlan(invalid), /cycle/); });
test('closed as not planned, missing and reopened issues do not fulfill a release', () => {
  const release = plan.releases[0], complete = release.issues.map(number => ({ number, state: 'closed', state_reason: 'completed' }));
  assert.equal(releaseReady(plan, release, complete, new Set()), true);
  for (const change of [{ state_reason: 'not_planned' }, { state: 'open' }]) assert.equal(releaseReady(plan, release, [{ ...complete[0], ...change }, ...complete.slice(1)], new Set()), false);
  assert.equal(releaseReady(plan, release, complete.slice(1), new Set()), false);
});
test('publication proceeds in order and cannot skip an unfinished prior release', () => {
  const complete = plan.releases.flatMap(release => release.issues.map(number => ({ number, state: 'closed', state_reason: 'completed' })));
  assert.equal(releaseReady(plan, plan.releases[1], complete, new Set()), false);
  assert.equal(releaseReady(plan, plan.releases[1], complete, new Set(['0.5.0'])), true);
  complete.find(issue => issue.number === 5).state = 'open';
  assert.equal(releaseReady(plan, plan.releases[1], complete, new Set(['0.5.0'])), false);
});
test('the implementation queue keeps the foundation sequence and orders all prerequisites first', () => {
  const completed = new Set([2,4,8,15,19,23]);
  const issues = plan.releases.flatMap(release => release.issues.map(number => ({ number, title: `Task ${number}`, state: completed.has(number) ? 'closed' : 'open', state_reason: completed.has(number) ? 'completed' : null, priority: 'P2', effort: 'M', importance: 3 })));
  const ordered = implementationOrder(plan, issues).map(issue => issue.number);
  assert.deepEqual(ordered.slice(0, 4), [5,6,7,38]); assert.equal(ordered.length, 91);
  for (const id of ordered) for (const dep of plan.dependencies[id] || []) if (!completed.has(dep)) assert.ok(ordered.indexOf(dep) < ordered.indexOf(id));
});
test('release version serialization matches the package used to build assets', () => {
  assert.equal(JSON.parse(versionedPackage('{"name":"squidware","version":"0.1.0"}', '0.5.0')).version, '0.5.0');
  for (const version of ['latest','v0.5.0','0.5.0; echo token']) assert.throws(() => versionedPackage('{}', version));
});
