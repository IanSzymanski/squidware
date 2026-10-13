import { performance } from 'node:perf_hooks';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPerformanceFixture } from '../src/performanceFixtures.ts';
import { hardware, integerOption, option, root, summarize } from './performance-common.mjs';

const modulePath = option('domain', path.join(root, 'src', 'domain.ts'));
const domain = modulePath.endsWith('.cjs') ? createRequire(import.meta.url)(path.resolve(modulePath)) : await import(pathToFileURL(path.resolve(modulePath)).href);
const repetitions = integerOption('repetitions', 50);
const warmup = integerOption('warmup', 10, 0);
const output = path.resolve(option('output', path.join(root, '.qa', 'performance', 'compute.json')));
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), kind: 'Node compute (not Electron UI)', hardware: hardware(),
  label: option('label', 'working-tree'), domain: path.relative(root, modulePath), repetitions, warmup,
  domainSha256: createHash('sha256').update(await readFile(path.resolve(modulePath))).digest('hex'),
  budget: { editMainThreadMs: 1000 / 60, interpretation: 'UI budget; these isolated compute operations cannot establish an edit-frame pass.' }, fixtures: {} };
let sink;
for (const name of ['demo', 'maximum']) {
  const project = createPerformanceFixture(name);
  domain.validateProject(project);
  const text = domain.serializeProject(project);
  const edit = { ...project, moves: project.moves.map((move, index) => index === 0 ? { ...move, tempo: move.tempo + 1 } : move) };
  const steps = {
    analyzeTransition: () => domain.analyzeTransition(project, 1),
    sampleProject: () => domain.sampleProject(project, domain.totalCounts(project) * 0.63),
    stringifyProject: () => JSON.stringify(project),
    legacyEditEquality: () => JSON.stringify(edit) === JSON.stringify(project),
    validateProject: () => domain.validateProject(project),
    serializeProject: () => domain.serializeProject(project),
    parseProject: () => domain.parseProject(text),
  };
  const metrics = {};
  const before = process.memoryUsage();
  for (const [operation, execute] of Object.entries(steps)) {
    for (let index = 0; index < warmup; index++) sink = execute();
    const rawMs = [];
    for (let index = 0; index < repetitions; index++) { const start = performance.now(); sink = execute(); rawMs.push(performance.now() - start); }
    metrics[operation] = { ...summarize(rawMs), rawMs };
  }
  report.fixtures[name] = { performers: project.performers.length, sets: project.sets.length, utf8Bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'), issuesAtSet2: domain.analyzeTransition(project, 1).length,
    memory: { before, after: process.memoryUsage(), note: 'Process heap/RSS snapshots include transient allocations; not retained project size.' }, metrics };
}
if (sink === undefined) throw new Error('Benchmark did not run.');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Node compute report: ${output}`);
for (const [name, fixture] of Object.entries(report.fixtures)) console.log(`${name}: ${Object.entries(fixture.metrics).map(([key, value]) => `${key} median ${value.medianMs.toFixed(2)} / p95 ${value.p95Ms.toFixed(2)} ms`).join('; ')}`);
