import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { option, root } from './performance-common.mjs';

const directory = path.resolve(option('input', path.join(root, '.qa', 'performance')));
const output = path.resolve(option('output', path.join(root, 'docs', 'performance', 'comparison.json')));
const read = async filename => JSON.parse(await readFile(path.join(directory, filename), 'utf8'));
const beforeCompute = await read('before-compute.json');
const afterCompute = await read('after-compute.json');
const beforeElectron = await read('before-electron/report.json');
const afterElectron = await read('after-electron/report.json');
for (const [prefix, report] of [['before-electron', beforeElectron], ['after-electron', afterElectron]]) {
  const manifest = await read(`${prefix}/manifest.json`);
  const status = await read(`${prefix}/run-status.json`);
  if (status.exitCode !== 0 || status.timedOut !== false) throw new Error(`${prefix} failed or timed out; do not summarize incomplete measurements.`);
  if (manifest.generatedAt !== report.generatedAt || !Number.isFinite(Date.parse(status.generatedAt)) || !Number.isFinite(Date.parse(report.generatedAt)) || Date.parse(status.generatedAt) < Date.parse(report.generatedAt)) throw new Error(`${prefix} contains stale measurement artifacts; rerun into a fresh output directory.`);
  const expected = manifest.fixtures.map(fixture => fixture.name).sort();
  const measured = report.results.map(fixture => fixture.name).sort();
  if (!expected.length || new Set(expected).size !== expected.length || JSON.stringify(expected) !== JSON.stringify(measured)) throw new Error(`${prefix} is missing expected fixtures or contains duplicate measurements.`);
  for (const fixture of report.results) {
    const original = manifest.fixtures.find(item => item.name === fixture.name);
    if (fixture.sha256 !== original.sha256 || fixture.performers !== original.performers || fixture.sets !== original.sets) throw new Error(`${prefix}/${fixture.name} differs from its manifest.`);
  }
}
if (JSON.stringify(beforeElectron.results.map(fixture => fixture.name).sort()) !== JSON.stringify(afterElectron.results.map(fixture => fixture.name).sort())) throw new Error('Before/after fixture inventories differ.');
for (const key of ['repetitions', 'warmup']) {
  if (beforeCompute[key] !== afterCompute[key] || beforeElectron[key] !== afterElectron[key]) throw new Error(`Mismatched ${key}; rerun with matching protocols.`);
}
for (const key of ['runnerSha256', 'preloadSha256', 'electron', 'chrome', 'frameWindowMs']) {
  if (beforeElectron[key] === undefined || afterElectron[key] === undefined) throw new Error(`Missing Electron ${key}; rerun with the current harness.`);
  if (beforeElectron[key] !== afterElectron[key]) throw new Error(`Mismatched Electron ${key}; rerun with the same harness/environment.`);
}
for (const key of ['os', 'release', 'architecture', 'cpuModel', 'logicalCpus', 'totalMemoryBytes', 'node']) {
  if ([afterCompute, beforeElectron, afterElectron].some(report => report.hardware[key] !== beforeCompute.hardware[key])) throw new Error(`Mismatched hardware/runtime ${key}; separate reports by machine.`);
}
for (const fixture of beforeElectron.results) {
  const counterparts = [beforeCompute.fixtures[fixture.name], afterCompute.fixtures[fixture.name], afterElectron.results.find(item => item.name === fixture.name)];
  if (counterparts.some(item => !item || item.sha256 !== fixture.sha256)) throw new Error(`Mismatched fixture ${fixture.name}; do not compare different projects.`);
}
const compactMetrics = metrics => Object.fromEntries(Object.entries(metrics).map(([name, { rawMs, ...summary }]) => [name, summary]));
const computeSummary = report => ({ generatedAt: report.generatedAt, label: report.label, domain: report.domain, domainSha256: report.domainSha256,
  repetitions: report.repetitions, warmup: report.warmup, fixtures: Object.fromEntries(Object.entries(report.fixtures).map(([name, fixture]) => [name,
    { performers: fixture.performers, sets: fixture.sets, utf8Bytes: fixture.utf8Bytes, sha256: fixture.sha256, issuesAtSet2: fixture.issuesAtSet2, metrics: compactMetrics(fixture.metrics) }])) });
const frames = frame => {
  if (!frame) return null;
  const { rawMs, ...summary } = frame;
  return summary;
};
const electronSummary = report => ({ generatedAt: report.generatedAt, label: report.label, buildSha256: report.buildSha256,
  runnerSha256: report.runnerSha256, preloadSha256: report.preloadSha256, repetitions: report.repetitions, warmup: report.warmup,
  frameWindowMs: report.frameWindowMs, viewport: report.viewport, results: report.results.map(result => ({ name: result.name, performers: result.performers, sets: result.sets,
    utf8Bytes: result.utf8Bytes, sha256: result.sha256, initialMountElapsedMs: result.initialMountElapsedMs, fixtureReadyElapsedMs: result.fixtureReadyElapsedMs,
    metrics: result.metrics, renderCounts: result.renderCounts, drag: frames(result.drag), playback: frames(result.playback), idle3D: frames(result.idle3D),
    phaseCpu: result.phaseCpu, stage: result.stage, errors: result.errors, memory: result.memory,
    recoveryWrites: result.storageWrites.filter(write => write.key === 'squidware.autosave.v1'), trace: result.trace, cpuProfile: result.cpuProfile })) });
const summary = { schemaVersion: 1, generatedAt: new Date().toISOString(), hardware: beforeCompute.hardware,
  electron: beforeElectron.electron, chrome: beforeElectron.chrome, gpu: beforeElectron.gpu, budget: beforeElectron.budget,
  limitations: beforeElectron.limitations, artifacts: { beforeCompute: 'before-compute.json', afterCompute: 'after-compute.json', beforeElectron: 'before-electron', afterElectron: 'after-electron',
    directory: '.qa/performance (ignored by Git; preserve when sharing evidence)' },
  before: { compute: computeSummary(beforeCompute), electron: electronSummary(beforeElectron) },
  after: { compute: computeSummary(afterCompute), electron: electronSummary(afterElectron) } };
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Performance comparison: ${output}`);
