import { createRequire } from 'node:module';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('production-sheet', { timeoutMs: 180000 }), require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(qa.output, 'fixtures.cjs');
await esbuild.build({ stdin: { contents: `
  import v1 from './src/fixtures/schema-v1.squid?raw';
  import {parseProject} from './src/domain';
  export {parseProject, serializeProject, totalCounts, setStartCount} from './src/domain';
  export {createPerformanceFixture} from './src/performanceFixtures';
  export function fixture() { return parseProject(v1); }
`, resolveDir: root, loader: 'ts' }, plugins: [{ name: 'raw', setup(build) {
  build.onResolve({ filter: /\?raw$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' }));
  build.onLoad({ filter: /.*/, namespace: 'raw' }, async args => ({ contents: await (await import('node:fs/promises')).readFile(args.path, 'utf8'), loader: 'text' }));
} }], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
await qa.run('production-sheet-qa-runner.cjs', 'production-sheet-manifest', { bundle, baseline: process.argv.includes('--baseline') });
