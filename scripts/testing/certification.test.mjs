import { test } from 'node:test';
import assert from 'node:assert/strict';
import { certificationLayer, certificationPlan, successfulPrintOutput } from './certification.mjs';

test('local certification covers the combined hosted layers, including PDFs and packaged startup', () => {
  const source = certificationPlan('source');
  const desktop = certificationPlan('desktop');
  const local = certificationPlan('all');
  assert.deepEqual(local, [...source, ...desktop.slice(1)]);
  assert.ok(local.findIndex(step => step.name === 'build') < local.findIndex(step => step.name === 'workflows'));
  assert.deepEqual(desktop.find(step => step.name === 'workflows').args, ['scripts/run-desktop-regressions.mjs', process.platform === 'darwin' ? '--jobs=1' : '--jobs=2']);
  for (const owner of ['source', 'contracts', 'native', 'workflows', 'pdf-inspection', 'package', 'packaged-startup']) assert.ok(local.some(step => step.name === owner));
  assert.equal(certificationLayer([]), 'all');
  assert.throws(() => certificationLayer(['--layer=desktop', '--layer=source']), /Use pnpm/);
  assert.throws(() => certificationLayer(['--layer=typo']), /Use pnpm/);
  assert.throws(() => certificationLayer(['--unknown']), /Use pnpm/);
});

test('macOS certification isolates the native desktop and audio output without changing coverage', () => {
  const plans = ['darwin', 'linux', 'win32'].map(platform => certificationPlan('desktop', { platform }));
  for (const [index, plan] of plans.entries()) {
    assert.deepEqual(plan.find(step => step.name === 'workflows').args,
      ['scripts/run-desktop-regressions.mjs', index === 0 ? '--jobs=1' : '--jobs=2']);
    assert.deepEqual(plan.filter(step => step.name !== 'workflows'), plans[0].filter(step => step.name !== 'workflows'));
  }
});

test('Linux sandbox setup is explicit and occurs before native application launch', () => {
  const plan = certificationPlan('desktop', { platform: 'linux', configureSandbox: true });
  assert.ok(plan.findIndex(step => step.name === 'sandbox-mode') < plan.findIndex(step => step.name === 'workflows'));
  assert.ok(plan.findIndex(step => step.name === 'package-sandbox-mode') < plan.findIndex(step => step.name === 'packaged-startup'));
  assert.ok(!certificationPlan('desktop', { platform: 'win32', configureSandbox: true }).some(step => step.tool === 'sudo'));
});

test('print verification rejects old, incomplete, failed or mismatched-source output', () => {
  const report = { state: 'completed', source: { contentHash: 'current' }, checks: [{ name: 'print', status: 'passed', output: '/this-run/print' }] };
  assert.equal(successfulPrintOutput(report, 'current'), '/this-run/print');
  assert.throws(() => successfulPrintOutput(report, 'new-source'), /No successful print/);
  assert.throws(() => successfulPrintOutput({ ...report, state: 'running' }, 'current'), /No successful print/);
  assert.throws(() => successfulPrintOutput({ ...report, checks: [{ name: 'print', status: 'failed' }] }, 'current'), /No successful print/);
  assert.throws(() => successfulPrintOutput({ state: 'completed', checks: report.checks }, 'current'), /No successful print/);
});
