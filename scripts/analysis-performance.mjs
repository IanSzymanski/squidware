import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { hardware, option, root, summarize } from './performance-common.mjs';
const require = createRequire(import.meta.url), output = path.resolve(option('output', path.join(root, '.qa/analysis-performance.json')));
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = await esbuild.build({ stdin: { contents: `export {analyzeTransition,serializeProject} from './src/domain'; export {createPerformanceFixture} from './src/performanceFixtures'; export {transitionInput} from './src/analysis/input'; export {TransitionAnalyzer} from './src/analysis/engine';`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false });
const module = { exports: {} }; new Function('module', 'exports', bundle.outputFiles[0].text)(module, module.exports);
const { analyzeTransition, serializeProject, createPerformanceFixture, transitionInput, TransitionAnalyzer } = module.exports;
const rules = { minimumSpacing: 1, maximumStride: 1.25 }, noWait = async () => {};
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), hardware: hardware(), repetitions: 50, warmup: 10,
  sourceSha256: Object.fromEntries(await Promise.all(['src/domain.ts', 'src/analysis/engine.ts', 'src/analysis/input.ts'].map(async file => [file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')]))),
  interpretation: 'Same-process compute comparison using A02 demo (64 x 6) and maximum (500 x 128) fixtures. Engine yields are suppressed only in this compute benchmark. Production worker/gesture evidence is separate. Historical A02 Windows timings are not a comparable host. No school-device qualification.', fixtures: {} };
for (const name of ['demo', 'maximum']) {
  const p = createPerformanceFixture(name), input = transitionInput(p, 1, 0, rules), engine = new TransitionAnalyzer();
  const workloads = {
    reference: () => analyzeTransition(p, 1),
    full: () => new TransitionAnalyzer().analyze(input, undefined, noWait),
    cached: () => engine.analyze(input, undefined, noWait),
    localized: i => engine.analyze({ ...input, tracks: input.tracks.map((t, j) => j ? t : { ...t, to: { ...t.to, x: t.to.x + (i % 2 ? .125 : .25) } }) }, undefined, noWait),
  };
  const metrics = {};
  for (const [workload, run] of Object.entries(workloads)) {
    for (let i = 0; i < 10; i++) await run(i);
    const samples = []; let result;
    for (let i = 0; i < 50; i++) { const start = performance.now(); result = await run(i); samples.push(performance.now() - start); }
    metrics[workload] = { ...summarize(samples), ...(result.stats ? { stats: result.stats } : {}), rawMs: samples };
  }
  const show = {};
  for (const kind of ['reference', 'optimized']) {
    const samples = [];
    for (let trial = 0; trial < 5; trial++) {
      const analyzer = new TransitionAnalyzer(), start = performance.now();
      for (let index = 1; index < p.sets.length; index++) {
        if (kind === 'reference') analyzeTransition(p, index);
        else await analyzer.analyze(transitionInput(p, index, 0, rules), undefined, noWait);
      }
      samples.push(performance.now() - start);
    }
    show[kind] = summarize(samples);
  }
  const text = serializeProject(p);
  report.fixtures[name] = { performers: p.performers.length, sets: p.sets.length, utf8Bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'), metrics, show };
}
await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, fixtures: Object.fromEntries(Object.entries(report.fixtures).map(([name, f]) => [name, { metrics: Object.fromEntries(Object.entries(f.metrics).map(([key, v]) => [key, { medianMs: v.medianMs, p95Ms: v.p95Ms, stats: v.stats }])), show: f.show }])) }, null, 2));
