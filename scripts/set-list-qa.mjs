import { createRequire } from 'node:module';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('set-list', { timeoutMs: 180000 }), require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(qa.output, 'fixtures.cjs');
await esbuild.build({ stdin: { contents: `
  export {parseProject, serializeProject, setStartCount} from './src/domain';
  export {createPerformanceFixture} from './src/performanceFixtures';
`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
await qa.run('set-list-qa-runner.cjs', 'set-list-manifest', { bundle });
