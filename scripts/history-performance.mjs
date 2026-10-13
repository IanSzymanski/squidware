// Same v2 model and command reducers, isolated processes and explicit GC for retained heap.
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { hardware, option, root, summarize } from './performance-common.mjs';
const require = createRequire(import.meta.url);
const directory = path.join(root, '.qa/history-performance');
await mkdir(directory, { recursive: true });

if (process.argv.includes('--worker')) {
  const { createEditorStore, createPerformanceFixture } = require(option('bundle', ''));
  if (!global.gc) throw new Error('History performance workers require --expose-gc.');
  const fixture = createPerformanceFixture('maximum');
  const result = { hardware: hardware(), fixture: { performers: 500, sets: 128 }, workloads: {} };
  for (const workload of ['notes', 'coordinates']) {
    const trials = [];
    for (let trial = 0; trial < 5; trial++) {
      global.gc(); const heapBefore = process.memoryUsage().heapUsed;
      let store = createEditorStore(fixture);
      const id = fixture.performers[0].id;
      const times = [];
      for (let frame = 0; frame < 100; frame++) {
        const started = performance.now();
        if (workload === 'notes') store.dispatch('set.update', { index: 1, update: { notes: 'N'.repeat(40) + frame } });
        else { store.dispatch('set.select', { index: 1 }); store.dispatch('positions.move', { index: 1, updates: { [id]: { x: 40 + (frame % 16 + 1) * 0.125, y: 20 + (frame % 8 + 1) * 0.125 } } }); }
        if (frame >= 20) times.push(performance.now() - started);
      }
      global.gc(); const retainedHeapBytes = process.memoryUsage().heapUsed - heapBefore;
      const history = store.getState().project;
      trials.push({ ...summarize(times), retainedHeapBytes, entries: history.past.length,
        patchCount: history.past.reduce((sum, entry) => sum + (entry.patches?.length || 0), 0), estimatedPatchBytes: history.estimatedBytes ?? null, rawMs: times });
      store = null;
    }
    result.workloads[workload] = { trials, medianDispatchMs: summarize(trials.map(t => t.medianMs)).medianMs,
      medianP95Ms: summarize(trials.map(t => t.p95Ms)).medianMs, medianRetainedHeapBytes: summarize(trials.map(t => t.retainedHeapBytes)).medianMs };
  }
  console.log(JSON.stringify(result));
} else {
  const beforeRef = option('before-ref', '53302a452c8ddb3989e1acccbe3b2cf45f771ea9');
  if (!/^[a-f0-9]{40}$/.test(beforeRef)) throw new Error('Use an exact baseline commit SHA.');
  const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
  const beforeStore = execFileSync('git', ['show', `${beforeRef}:src/editor/store.ts`], { cwd: root, encoding: 'utf8' });
  const beforeState = execFileSync('git', ['show', `${beforeRef}:src/editor/state.ts`], { cwd: root, encoding: 'utf8' });
  const statePath = path.join(directory, 'before-state.ts');
  await writeFile(statePath, beforeState);
  const bundles = {};
  for (const mode of ['before', 'after']) {
    const entry = mode === 'before' ? beforeStore.replaceAll("from './state'", `from ${JSON.stringify(statePath.replaceAll('\\', '/'))}`) : "export { createEditorStore } from './store';";
    const outfile = path.join(directory, `${mode}.cjs`);
    await esbuild.build({ stdin: { contents: entry + "\nexport { createPerformanceFixture } from '../performanceFixtures';", resolveDir: path.join(root, 'src/editor'), loader: 'ts' }, outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
    const worker = spawnSync(process.execPath, ['--expose-gc', path.join(root, 'scripts/history-performance.mjs'), '--worker', `--bundle=${outfile}`], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (worker.status !== 0) throw new Error(worker.stderr || `History ${mode} worker failed.`);
    bundles[mode] = JSON.parse(worker.stdout);
  }
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), baselineCommit: beforeRef,
    afterSourceSha256: Object.fromEntries(await Promise.all(['src/editor/history.ts', 'src/editor/store.ts', 'src/editor/historyNames.ts', 'src/editor/state.ts'].map(async file => [file, createHash('sha256').update((await readFile(path.join(root, file), 'utf8')).replaceAll('\r\n', '\n')).digest('hex')]))),
    interpretation: 'Store dispatch and retained heap only; excludes renderer/analysis, native dialogs and deferred recovery. Five isolated-GC trials per workload; 20 warmup edits then 80 timed edits. Before retains whole-project snapshot references and JSON equality from A02; after retains reversible patches. The same current v2 validation, fixture and command reducers serve both. Heap estimates are observed local measurements, not device qualification or a total application memory bound.', ...bundles };
  const output = path.resolve(option('output', path.join(directory, 'history-comparison.json')));
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, before: Object.fromEntries(Object.entries(report.before.workloads).map(([key, value]) => [key, { medianMs: value.medianDispatchMs, p95Ms: value.medianP95Ms, heapBytes: value.medianRetainedHeapBytes }])), after: Object.fromEntries(Object.entries(report.after.workloads).map(([key, value]) => [key, { medianMs: value.medianDispatchMs, p95Ms: value.medianP95Ms, heapBytes: value.medianRetainedHeapBytes }])) }));
}
