import { createRequire } from 'node:module';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('paths', { timeoutMs: 180000 }), require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(qa.output, 'fixtures.cjs');
await esbuild.build({ stdin: { contents: `
  export {parseProject, sampleProject} from './src/domain';
  export {createPerformanceFixture} from './src/performanceFixtures';
  export function fixture() { return ${await readFile(path.join(root, 'format/examples/basic-v2.squid'), 'utf8')}; }
`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
await qa.run('paths-qa-runner.cjs', 'paths-manifest', { bundle, smallDesktop: process.argv.includes('--small-desktop') });
