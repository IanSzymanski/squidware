import { createRequire } from 'node:module';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('path-authoring', { timeoutMs: 240000 }), require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(qa.output, 'fixtures.cjs');
await esbuild.build({ stdin: { contents: `
  export {parseProject, sampleProject} from './src/domain';
  export {sampleMovement} from './src/movementPaths';
  export {createPerformanceFixture} from './src/performanceFixtures';
  export function fixture() { return ${await readFile(path.join(root, 'format/examples/basic-v2.squid'), 'utf8')}; }
`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
await qa.run('path-authoring-qa-runner.cjs', 'path-authoring-manifest', { bundle, baseline: process.argv.includes('--baseline') });
