import { createRequire } from 'node:module';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('split-transition', { timeoutMs: 180000 }), require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(qa.output, 'fixtures.cjs');
await esbuild.build({ stdin: { contents: `
  export {parseProject, sampleProject, totalCounts, countToSeconds} from './src/domain';
  export {createPerformanceFixture} from './src/performanceFixtures';
`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
const baselineRoot = process.argv.find(a => a.startsWith('--baseline-root='))?.slice('--baseline-root='.length);
await qa.run('split-transition-qa-runner.cjs', 'split-transition-manifest', { bundle,
  ...(baselineRoot ? { root: path.resolve(baselineRoot), build: path.resolve(baselineRoot, 'dist'), baseline: true } : {}) });
